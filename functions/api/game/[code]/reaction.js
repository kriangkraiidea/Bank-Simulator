// POST /api/game/:code/reaction — Send a real-time emoji reaction
export async function onRequestPost({ params, request, env }) {
  try {
    const code = params.code.toUpperCase();

    const game = await env.DB.prepare(
      `SELECT id FROM games WHERE room_code = ? AND active = 1`
    ).bind(code).first();

    if (!game) return json({ error: 'ไม่พบห้องเกม' }, 404);

    const { emoji = '🤣', playerName = 'ผู้เล่น' } = await request.json();

    const cleanEmoji = String(emoji).trim().slice(0, 10);
    const cleanName = String(playerName).trim().slice(0, 20);

    if (!cleanEmoji) return json({ error: 'ต้องมี emoji' }, 400);

    await env.DB.prepare(`
      INSERT INTO reactions (game_id, player_name, emoji)
      VALUES (?, ?, ?)
    `).bind(game.id, cleanName, cleanEmoji).run();

    return json({ success: true, emoji: cleanEmoji, playerName: cleanName });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
