// POST /api/game/:code/profile — Update player avatar
export async function onRequestPost({ params, request, env }) {
  try {
    const code = params.code.toUpperCase();
    const { playerId, avatarUrl } = await request.json();

    if (!playerId) return json({ error: 'ต้องระบุ Player ID' }, 400);

    const game = await env.DB.prepare(
      `SELECT id FROM games WHERE room_code = ? AND active = 1`
    ).bind(code).first();
    if (!game) return json({ error: 'ไม่พบห้องเกม' }, 404);

    await env.DB.prepare(
      `UPDATE players SET avatar_url = ? WHERE id = ? AND game_id = ?`
    ).bind(avatarUrl || null, playerId, game.id).run();

    return json({ success: true, avatarUrl });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
