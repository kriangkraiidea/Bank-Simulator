// POST /api/game/:code/transfer — Player to Player transfer
export async function onRequestPost({ params, request, env }) {
  try {
    const code = params.code.toUpperCase();
    const { fromPlayerId, toPlayerId, amount, reason } = await request.json();

    if (!fromPlayerId || !toPlayerId || !amount || amount <= 0) {
      return json({ error: 'ข้อมูลไม่ครบถ้วน' }, 400);
    }
    if (fromPlayerId === toPlayerId) {
      return json({ error: 'ต้นทางและปลายทางต้องไม่ใช่คนเดียวกัน' }, 400);
    }

    const game = await env.DB.prepare(
      `SELECT * FROM games WHERE room_code = ? AND active = 1`
    ).bind(code).first();
    if (!game) return json({ error: 'ไม่พบห้องเกม' }, 404);

    const fromPlayer = await env.DB.prepare(
      `SELECT * FROM players WHERE id = ? AND game_id = ?`
    ).bind(fromPlayerId, game.id).first();
    const toPlayer = await env.DB.prepare(
      `SELECT * FROM players WHERE id = ? AND game_id = ?`
    ).bind(toPlayerId, game.id).first();

    if (!fromPlayer || !toPlayer) return json({ error: 'ไม่พบผู้เล่น' }, 404);
    if (fromPlayer.bankrupt) return json({ error: `${fromPlayer.name} ล้มละลายแล้ว` }, 400);

    // Update balances
    await env.DB.prepare(
      `UPDATE players SET balance = balance - ? WHERE id = ?`
    ).bind(amount, fromPlayerId).run();
    await env.DB.prepare(
      `UPDATE players SET balance = balance + ? WHERE id = ?`
    ).bind(amount, toPlayerId).run();

    // Log transaction
    await env.DB.prepare(
      `INSERT INTO transactions (game_id, type, icon, from_label, to_label, amount, reason, round)
       VALUES (?, 'transfer', '💸', ?, ?, ?, ?, ?)`
    ).bind(game.id, fromPlayer.name, toPlayer.name, amount, reason || null, game.round).run();

    // Check if from player went bankrupt (balance < 0)
    const updatedFrom = await env.DB.prepare(
      `SELECT balance FROM players WHERE id = ?`
    ).bind(fromPlayerId).first();

    return json({ success: true, newFromBalance: updatedFrom.balance });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
