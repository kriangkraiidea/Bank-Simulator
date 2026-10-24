// POST /api/game/:code/bankrupt — Toggle player bankrupt status
export async function onRequestPost({ params, request, env }) {
  try {
    const code = params.code.toUpperCase();
    const { playerId } = await request.json();

    const game = await env.DB.prepare(
      `SELECT id, round FROM games WHERE room_code = ? AND active = 1`
    ).bind(code).first();
    if (!game) return json({ error: 'ไม่พบห้องเกม' }, 404);

    const player = await env.DB.prepare(
      `SELECT * FROM players WHERE id = ? AND game_id = ?`
    ).bind(playerId, game.id).first();
    if (!player) return json({ error: 'ไม่พบผู้เล่น' }, 404);

    const newStatus = player.bankrupt ? 0 : 1;
    await env.DB.prepare(
      `UPDATE players SET bankrupt = ? WHERE id = ?`
    ).bind(newStatus, playerId).run();

    const action = newStatus ? '💀 ล้มละลาย' : '🔄 กลับมาเล่น';
    await env.DB.prepare(
      `INSERT INTO transactions (game_id, type, icon, reason, round)
       VALUES (?, 'system', '⚠️', ?, ?)`
    ).bind(game.id, `${player.name} ${action}`, game.round).run();

    return json({ success: true, bankrupt: newStatus === 1 });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
