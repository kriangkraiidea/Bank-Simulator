// POST /api/game/:code/dice — Broadcast dice roll to room statement log
export async function onRequestPost({ params, request, env }) {
  try {
    const code = params.code.toUpperCase();

    const game = await env.DB.prepare(
      `SELECT id, round FROM games WHERE room_code = ? AND active = 1`
    ).bind(code).first();

    if (!game) return json({ error: 'ไม่พบห้องเกม' }, 404);

    const { playerName = 'ผู้เล่น', diceValues = [1, 1], sum = 2, isDouble = false } = await request.json();

    const cleanName = String(playerName).trim().slice(0, 20);
    const diceText = Array.isArray(diceValues) ? diceValues.join(' + ') : String(sum);
    const doubleNote = isDouble ? ' 🎉 (เลขเบิ้ล! ทอยต่ออีกรอบ 🎲)' : '';

    await env.DB.prepare(`
      INSERT INTO transactions (game_id, type, icon, from_label, to_label, amount, reason, round)
      VALUES (?, 'system', '🎲', ?, 'ทุกคน', NULL, ?, ?)
    `).bind(
      game.id,
      cleanName,
      `ทอยลูกเต๋าได้ ${diceText} = ${sum}${doubleNote}`,
      game.round
    ).run();

    return json({ success: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
