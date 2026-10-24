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
        created_at, 
        updated_at
      FROM games 
      WHERE room_code = ? AND active = 1
    `).bind(code).first();

    if (!game) return json({ error: 'ไม่พบห้องเกม หรือห้องถูกปิดแล้ว' }, 404);

    const { results: players } = await env.DB.prepare(`
      SELECT 
        id, 
        game_id, 
        name, 
        color_index, 
        balance, 
        bankrupt, 
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

    return json({
      game: {
        ...game,
        roomName: game.room_name || game.room_code,
        bankBalance: game.bank_balance,
        hasPassword: game.has_password === 1,
        allowSpectator: game.allow_spectator === 1,
        hideOthersBalance: game.hide_others_balance === 1,
      },
      players: players || [],
      recentLog: recentLog || [],
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

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
