// GET /api/game/:code — Get full game state
export async function onRequestGet({ params, env }) {
  try {
    const code = params.code.toUpperCase();

    const game = await env.DB.prepare(
      `SELECT * FROM games WHERE room_code = ? AND active = 1`
    ).bind(code).first();

    if (!game) return json({ error: 'ไม่พบห้องเกม' }, 404);

    const { results: players } = await env.DB.prepare(
      `SELECT * FROM players WHERE game_id = ? ORDER BY id ASC`
    ).bind(game.id).all();

    const { results: recentLog } = await env.DB.prepare(
      `SELECT * FROM transactions WHERE game_id = ? ORDER BY id DESC LIMIT 50`
    ).bind(game.id).all();

    return json({
      game: {
        ...game,
        bankBalance: game.bank_balance, // null = unlimited
      },
      players,
      recentLog,
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
