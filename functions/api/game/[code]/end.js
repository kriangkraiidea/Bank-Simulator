// POST /api/game/:code/end — Officially end game and generate final scoreboard
export async function onRequestPost({ params, env }) {
  try {
    const code = params.code.toUpperCase();

    const game = await env.DB.prepare(
      `SELECT id, round, room_name, room_code FROM games WHERE room_code = ? AND active = 1`
    ).bind(code).first();

    if (!game) return json({ error: 'ไม่พบห้องเกม' }, 404);

    // Mark game as ended
    await env.DB.prepare(
      `UPDATE games SET is_ended = 1, ended_at = datetime('now') WHERE id = ?`
    ).bind(game.id).run();

    // Find winner (survivor)
    const winner = await env.DB.prepare(
      `SELECT name FROM players WHERE game_id = ? AND bankrupt = 0 ORDER BY balance DESC LIMIT 1`
    ).bind(game.id).first();

    const winnerName = winner ? winner.name : 'ผู้เล่นทุกคน';

    // Insert game over system transaction
    await env.DB.prepare(`
      INSERT INTO transactions (game_id, type, icon, from_label, to_label, reason, round)
      VALUES (?, 'system', '🏆', 'ระบบ', ?, ?, ?)
    `).bind(game.id, winnerName, `จบเกมแล้ว! ขอแสดงความยินดีกับ ${winnerName} ผู้ชนะอันดับ 1`, game.round).run();

    return json({ 
      success: true, 
      message: 'จบเกมเรียบร้อยแล้ว',
      winner: winnerName 
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return Response.json(data, { 
    status, 
    headers: { 'Content-Type': 'application/json' } 
  });
}
