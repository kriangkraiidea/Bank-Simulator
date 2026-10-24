// POST /api/game — Create a new game
export async function onRequestPost({ request, env }) {
  try {
    const { players, startingMoney = 15000, bankMoney = 0 } = await request.json();

    if (!Array.isArray(players) || players.length < 2 || players.length > 8) {
      return json({ error: 'ต้องมีผู้เล่น 2–8 คน' }, 400);
    }

    const roomCode = genCode();
    const gameId = crypto.randomUUID();
    const bankBalance = bankMoney === 0 ? null : bankMoney;

    await env.DB.prepare(
      `INSERT INTO games (id, room_code, bank_balance, starting_money) VALUES (?, ?, ?, ?)`
    ).bind(gameId, roomCode, bankBalance, startingMoney).run();

    for (const [i, player] of players.entries()) {
      await env.DB.prepare(
        `INSERT INTO players (game_id, name, color_index, balance) VALUES (?, ?, ?, ?)`
      ).bind(gameId, player.name.trim() || `ผู้เล่น ${i + 1}`, i, startingMoney).run();
    }

    const playerNames = players.map(p => p.name).join(', ');
    await env.DB.prepare(
      `INSERT INTO transactions (game_id, type, icon, reason, round)
       VALUES (?, 'system', '🎮', ?, 1)`
    ).bind(gameId, `เริ่มเกมแล้ว! ผู้เล่น: ${playerNames} | เงินเริ่มต้น: ${fmt(startingMoney)} บาท/คน`).run();

    return json({ gameId, roomCode });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function fmt(n) { return Number(n).toLocaleString(); }
function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
