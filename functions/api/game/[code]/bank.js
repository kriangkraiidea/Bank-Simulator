// POST /api/game/:code/bank — Bank ↔ Player transfer
export async function onRequestPost({ params, request, env }) {
  try {
    const code = params.code.toUpperCase();
    const { playerId, direction, amount, reason } = await request.json();
    // direction: 'receive' (bank→player) | 'pay' (player→bank)

    if (!playerId || !direction || !amount || amount <= 0) {
      return json({ error: 'ข้อมูลไม่ครบถ้วน' }, 400);
    }
    if (!reason || reason.trim() === '') {
      return json({ error: 'กรุณาระบุเหตุผลสำหรับการโอนจากธนาคาร' }, 400);
    }

    const game = await env.DB.prepare(
      `SELECT * FROM games WHERE room_code = ? AND active = 1`
    ).bind(code).first();
    if (!game) return json({ error: 'ไม่พบห้องเกม' }, 404);

    const player = await env.DB.prepare(
      `SELECT * FROM players WHERE id = ? AND game_id = ?`
    ).bind(playerId, game.id).first();
    if (!player) return json({ error: 'ไม่พบผู้เล่น' }, 404);

    const isReceive = direction === 'receive';

    // Check bank balance limit
    if (isReceive && game.bank_balance !== null && game.bank_balance < amount) {
      return json({ error: 'เงินในธนาคารไม่เพียงพอ' }, 400);
    }

    // Update player balance
    const delta = isReceive ? amount : -amount;
    await env.DB.prepare(
      `UPDATE players SET balance = balance + ? WHERE id = ?`
    ).bind(delta, playerId).run();

    // Update bank balance (if limited)
    let newBankBalance = game.bank_balance;
    if (game.bank_balance !== null) {
      const bankDelta = isReceive ? -amount : amount;
      await env.DB.prepare(
        `UPDATE games SET bank_balance = bank_balance + ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(bankDelta, game.id).run();
      newBankBalance = game.bank_balance + bankDelta;
    }

    const icon = isReceive ? '📥' : '📤';
    const fromLabel = isReceive ? '🏦 ธนาคาร' : player.name;
    const toLabel = isReceive ? player.name : '🏦 ธนาคาร';

    await env.DB.prepare(
      `INSERT INTO transactions (game_id, type, icon, from_label, to_label, amount, reason, round)
       VALUES (?, 'bank', ?, ?, ?, ?, ?, ?)`
    ).bind(game.id, icon, fromLabel, toLabel, amount, reason.trim(), game.round).run();

    return json({ success: true, newBankBalance });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
