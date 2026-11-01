// POST /api/game/:code/dice — Save dice roll and broadcast to room dice log
export async function onRequestPost({ params, request, env }) {
  try {
    const code = params.code.toUpperCase();

    const game = await env.DB.prepare(
      `SELECT id, round FROM games WHERE room_code = ? AND active = 1`
    ).bind(code).first();

    if (!game) return json({ error: 'ไม่พบห้องเกม' }, 404);

    const body = await request.json();
    const playerName = String(body.playerName || 'ผู้เล่น').trim().slice(0, 20);

    let d1 = Number(body.dice1);
    let d2 = (body.dice2 !== null && body.dice2 !== undefined) ? Number(body.dice2) : null;
    let total = Number(body.total);
    let isDouble = Boolean(body.isDouble);

    // Fallback if client passed diceValues / sum
    if (isNaN(d1) && Array.isArray(body.diceValues)) {
      d1 = Number(body.diceValues[0]) || 1;
      d2 = body.diceValues.length > 1 ? (Number(body.diceValues[1]) || 1) : null;
      total = Number(body.sum) || (d1 + (d2 || 0));
      isDouble = (d2 !== null && d1 === d2);
    }

    if (isNaN(d1)) d1 = 1;
    if (d2 !== null && isNaN(d2)) d2 = null;
    if (isNaN(total)) total = d1 + (d2 || 0);

    // Ensure dice_rolls table exists
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS dice_rolls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        dice1 INTEGER NOT NULL,
        dice2 INTEGER,
        total INTEGER NOT NULL,
        is_double INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      )
    `).run();

    // Insert into dice_rolls table (separate from financial transactions)
    await env.DB.prepare(`
      INSERT INTO dice_rolls (game_id, player_name, dice1, dice2, total, is_double)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      game.id,
      playerName,
      d1,
      d2,
      total,
      isDouble ? 1 : 0
    ).run();

    return json({
      success: true,
      dice1: d1,
      dice2: d2,
      total,
      isDouble
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
