// GET /api/game/:code — Get full game state
export async function onRequestGet({ params, env }) {
  try {
    const code = params.code.toUpperCase();

    const game = await env.DB.prepare(`
      SELECT 
        id, 
        room_code, 
        COALESCE(room_name, room_code) as room_name,
        bank_balance, 
        starting_money, 
        round, 
        active, 
        CASE WHEN password IS NOT NULL AND password != '' THEN 1 ELSE 0 END as has_password,
        COALESCE(allow_spectator, 1) as allow_spectator,
        COALESCE(hide_others_balance, 1) as hide_others_balance,
        COALESCE(is_ended, 0) as is_ended,
        ended_at,
        bank_presets,
        created_at, 
        updated_at
      FROM games 
      WHERE room_code = ? AND active = 1
    `).bind(code).first();

    if (!game) return json({ error: 'ไม่พบห้องเกม หรือห้องถูกปิดแล้ว' }, 404);

    let bankPresets = null;
    if (game.bank_presets) {
      try {
        bankPresets = JSON.parse(game.bank_presets);
      } catch(_) {}
    }

    const { results: players } = await env.DB.prepare(`
      SELECT 
        id, 
        game_id, 
        name, 
        color_index, 
        balance, 
        bankrupt, 
        bankrupt_order,
        bankrupt_at,
        avatar_url,
        claimed_session,
        CASE WHEN claimed_session IS NOT NULL AND claimed_session != '' THEN 1 ELSE 0 END as is_claimed
      FROM players 
      WHERE game_id = ? 
      ORDER BY id ASC
    `).bind(game.id).all();

    const { results: recentLog } = await env.DB.prepare(`
      SELECT * FROM transactions 
      WHERE game_id = ? 
      ORDER BY id DESC 
      LIMIT 60
    `).bind(game.id).all();

    let pendingPaymentRequests = [];
    try {
      const { results: reqs } = await env.DB.prepare(`
        SELECT pr.id, pr.from_player_id, pr.to_player_id, pr.amount, pr.reason, pr.status, pr.created_at,
               p_from.name as from_name, p_to.name as to_name,
               p_to.name as requester_name, p_from.name as debtor_name,
               pr.from_player_id as target_player_id
        FROM payment_requests pr
        LEFT JOIN players p_from ON p_from.id = pr.from_player_id
        LEFT JOIN players p_to ON p_to.id = pr.to_player_id
        WHERE pr.game_id = ? AND pr.status = 'pending'
        ORDER BY pr.id DESC LIMIT 10
      `).bind(game.id).all();
      pendingPaymentRequests = reqs || [];
    } catch(_) {}

    let recentReactions = [];
    try {
      const { results: rxns } = await env.DB.prepare(`
        SELECT id, player_name, emoji, created_at
        FROM reactions
        WHERE game_id = ? AND created_at >= datetime('now', '-8 seconds')
        ORDER BY id DESC LIMIT 20
      `).bind(game.id).all();
      recentReactions = rxns || [];
    } catch(_) {}

    let scoreboard = null;
    if (game.is_ended === 1) {
      const { results: allTx } = await env.DB.prepare(`
        SELECT type, icon, from_label, to_label, amount, reason, created_at 
        FROM transactions 
        WHERE game_id = ? 
        ORDER BY id ASC
      `).bind(game.id).all();
      scoreboard = computeScoreboard(players || [], allTx || []);
    }

    return json({
      game: {
        ...game,
        roomName: game.room_name || game.room_code,
        bankBalance: game.bank_balance,
        hasPassword: game.has_password === 1,
        allowSpectator: game.allow_spectator === 1,
        hideOthersBalance: game.hide_others_balance === 1,
        isEnded: game.is_ended === 1,
        endedAt: game.ended_at,
        bankPresets: bankPresets,
      },
      players: players || [],
      recentLog: recentLog || [],
      scoreboard,
      pendingPaymentRequests,
      recentReactions,
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// DELETE /api/game/:code — Delete game with creator password
export async function onRequestDelete({ params, request, env }) {
  try {
    const code = params.code.toUpperCase();
    let adminPass = '';

    try {
      const body = await request.json();
      adminPass = (body.adminPass || body.password || '').trim();
    } catch(e) {
      const url = new URL(request.url);
      adminPass = (url.searchParams.get('adminPass') || '').trim();
    }

    if (adminPass !== 'pookky') {
      return json({ 
        error: 'รหัสผ่านผู้สร้างเว็บไม่ถูกต้อง! (คำใบ้: ชื่อหมาตัวแรกของผู้สร้างเป็นภาษาอังกฤษพิมพ์เล็ก)' 
      }, 403);
    }

    const game = await env.DB.prepare(
      `SELECT id FROM games WHERE room_code = ?`
    ).bind(code).first();

    if (!game) {
      return json({ error: 'ไม่พบห้องที่ต้องการลบ' }, 404);
    }

    // Cascade delete
    await env.DB.prepare(`DELETE FROM transactions WHERE game_id = ?`).bind(game.id).run();
    await env.DB.prepare(`DELETE FROM players WHERE game_id = ?`).bind(game.id).run();
    await env.DB.prepare(`DELETE FROM games WHERE id = ?`).bind(game.id).run();

    return json({ success: true, message: `ลบห้อง ${code} เรียบร้อยแล้ว` });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function computeScoreboard(players, transactions) {
  const stats = {};
  for (const p of players) {
    stats[p.name] = {
      id: p.id,
      name: p.name,
      colorIndex: p.color_index,
      avatarUrl: p.avatar_url,
      balance: p.balance,
      bankrupt: p.bankrupt === 1,
      bankruptOrder: p.bankrupt_order || 0,
      bankruptAt: p.bankrupt_at,
      totalIncome: 0,
      totalExpense: 0,
      receivedFromBank: 0,
      paidToBank: 0,
      receivedFromPlayers: {},
      paidToPlayers: {},
      totalReceivedFromPlayers: 0,
      totalPaidToPlayers: 0,
    };
  }

  for (const tx of transactions) {
    const amt = Number(tx.amount) || 0;
    if (amt <= 0) continue;

    if (tx.type === 'transfer') {
      const from = tx.from_label;
      const to = tx.to_label;

      if (stats[from]) {
        stats[from].totalExpense += amt;
        stats[from].totalPaidToPlayers += amt;
        stats[from].paidToPlayers[to] = (stats[from].paidToPlayers[to] || 0) + amt;
      }
      if (stats[to]) {
        stats[to].totalIncome += amt;
        stats[to].totalReceivedFromPlayers += amt;
        stats[to].receivedFromPlayers[from] = (stats[to].receivedFromPlayers[from] || 0) + amt;
      }
    } else if (tx.type === 'bank') {
      if (tx.icon === '📥') {
        const to = tx.to_label;
        if (stats[to]) {
          stats[to].totalIncome += amt;
          stats[to].receivedFromBank += amt;
        }
      } else if (tx.icon === '📤') {
        const from = tx.from_label;
        if (stats[from]) {
          stats[from].totalExpense += amt;
          stats[from].paidToBank += amt;
        }
      }
    }
  }

  const list = Object.values(stats);
  list.sort((a, b) => {
    if (!a.bankrupt && b.bankrupt) return -1;
    if (a.bankrupt && !b.bankrupt) return 1;
    if (!a.bankrupt && !b.bankrupt) return b.balance - a.balance;
    // Both bankrupt: higher bankruptOrder = went bankrupt later = higher rank!
    return (b.bankruptOrder || 0) - (a.bankruptOrder || 0);
  });

  list.forEach((p, idx) => {
    p.rank = idx + 1;
  });

  return list;
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
