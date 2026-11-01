// POST /api/game/:code/claim — Claim or release a player character
export async function onRequestPost({ params, request, env }) {
  try {
    const code = params.code.toUpperCase();
    const body = await request.json();
    const { playerId, sessionId, action = 'claim', force = false } = body;

    if (!sessionId) {
      return json({ error: 'Session ID หายไป' }, 400);
    }

    const game = await env.DB.prepare(
      `SELECT id FROM games WHERE room_code = ? AND active = 1`
    ).bind(code).first();
    if (!game) return json({ error: 'ไม่พบห้องเกม' }, 404);

    if (action === 'release') {
      // Release if matches sessionId or playerId
      if (playerId) {
        await env.DB.prepare(
          `UPDATE players SET claimed_session = NULL, claimed_at = NULL WHERE id = ? AND game_id = ?`
        ).bind(playerId, game.id).run();
      } else {
        await env.DB.prepare(
          `UPDATE players SET claimed_session = NULL, claimed_at = NULL WHERE game_id = ? AND claimed_session = ?`
        ).bind(game.id, sessionId).run();
      }
      return json({ success: true, released: true });
    }

    // Action: claim
    if (!playerId) return json({ error: 'ต้องระบุ Player ID' }, 400);

    const player = await env.DB.prepare(
      `SELECT id, name, claimed_session, claimed_at FROM players WHERE id = ? AND game_id = ?`
    ).bind(playerId, game.id).first();

    if (!player) return json({ error: 'ไม่พบผู้เล่นนี้' }, 404);

    // If claimed by another session
    if (player.claimed_session && player.claimed_session !== sessionId) {
      let isStale = true;
      if (player.claimed_at) {
        // SQLite datetime format: YYYY-MM-DD HH:MM:SS
        const lastClaimed = new Date(player.claimed_at.replace(' ', 'T') + 'Z').getTime();
        if (!isNaN(lastClaimed) && (Date.now() - lastClaimed) < 60000) {
          isStale = false;
        }
      }

      // If not forced and not stale, require confirmation
      if (!force && !isStale) {
        return json({
          error: `บัญชี "${player.name}" มีผู้อื่นเข้าใช้งานอยู่`,
          canReclaim: true,
          playerName: player.name
        }, 409);
      }
    }

    // Release any previous character claimed by this session in this game
    await env.DB.prepare(
      `UPDATE players SET claimed_session = NULL, claimed_at = NULL WHERE game_id = ? AND claimed_session = ? AND id != ?`
    ).bind(game.id, sessionId, playerId).run();

    // Claim target player
    await env.DB.prepare(
      `UPDATE players SET claimed_session = ?, claimed_at = datetime('now') WHERE id = ?`
    ).bind(sessionId, playerId).run();

    return json({ success: true, claimedPlayerId: playerId });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
