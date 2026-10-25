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

    if (newStatus === 1) {
      const orderRow = await env.DB.prepare(
        `SELECT COALESCE(MAX(bankrupt_order), 0) + 1 as next_order FROM players WHERE game_id = ?`
      ).bind(game.id).first();
      const nextOrder = orderRow?.next_order || 1;

      await env.DB.prepare(
        `UPDATE players SET bankrupt = 1, bankrupt_order = ?, bankrupt_at = datetime('now') WHERE id = ?`
      ).bind(nextOrder, playerId).run();
    } else {
      await env.DB.prepare(
        `UPDATE players SET bankrupt = 0, bankrupt_order = NULL, bankrupt_at = NULL WHERE id = ?`
      ).bind(playerId).run();
    }

    const action = newStatus ? '💀 ล้มละลาย' : '🔄 กลับมาเล่น';
    await env.DB.prepare(
      `INSERT INTO transactions (game_id, type, icon, from_label, to_label, reason, round)
       VALUES (?, 'system', '⚠️', 'ระบบ', ?, ?, ?)`
    ).bind(game.id, player.name, `${player.name} ${action}`, game.round).run();

    // Check remaining active players
    const { results: activePlayers } = await env.DB.prepare(
      `SELECT id, name FROM players WHERE game_id = ? AND bankrupt = 0`
    ).bind(game.id).all();

    const onlyOneRemaining = (activePlayers || []).length === 1;
    const remainingWinner = onlyOneRemaining ? activePlayers[0] : null;

    return json({ 
      success: true, 
      bankrupt: newStatus === 1,
      onlyOneRemaining,
      winner: remainingWinner
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
