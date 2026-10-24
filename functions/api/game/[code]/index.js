// GET /api/game/:code — Get full game state
export async function onRequestGet({ params, env }) {
  try {
    const code = params.code.toUpperCase();

    const game = await env.DB.prepare(`
      SELECT 
        id, 
        room_code, 
        bank_balance, 
        starting_money, 
        round, 
        active, 
        COALESCE(is_public, 1) as is_public,
        CASE WHEN password IS NOT NULL AND password != '' THEN 1 ELSE 0 END as has_password,
        COALESCE(allow_spectator, 1) as allow_spectator,
        COALESCE(hide_others_balance, 1) as hide_others_balance,
        created_at, 
        updated_at
      FROM games 
      WHERE room_code = ? AND active = 1
    `).bind(code).first();

    if (!game) return json({ error: 'ไม่พบห้องเกม หรือห้องถูกปิดแล้ว' }, 404);

    const { results: players } = await env.DB.prepare(`
      SELECT 
        id, 
        game_id, 
        name, 
        color_index, 
        balance, 
        bankrupt, 
        avatar_url,
        claimed_session,
        CASE WHEN claimed_session IS NOT NULL AND claimed_session != '' THEN 1 ELSE 0 END as is_claimed
      FROM players 
      WHERE game_id = ? 
      ORDER BY id ASC
    `).bind(game.id).all();

    const { results: recentLog } = await env.DB.prepare(`
      SELECT * FROM transactions 
      WHERE game_id = ? 
      ORDER BY id DESC 
      LIMIT 60
    `).bind(game.id).all();

    return json({
      game: {
        ...game,
        bankBalance: game.bank_balance,
        hasPassword: game.has_password === 1,
        allowSpectator: game.allow_spectator === 1,
        hideOthersBalance: game.hide_others_balance === 1,
        isPublic: game.is_public === 1,
      },
      players: players || [],
      recentLog: recentLog || [],
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
