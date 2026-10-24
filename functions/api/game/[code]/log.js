// GET /api/game/:code/log — Get full transaction log (with optional pagination)
export async function onRequestGet({ params, request, env }) {
  try {
    const code = params.code.toUpperCase();
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '200'), 500);
    const type = url.searchParams.get('type'); // 'bank' | 'transfer' | 'system' | null

    const game = await env.DB.prepare(
      `SELECT id FROM games WHERE room_code = ?`
    ).bind(code).first();
    if (!game) return json({ error: 'ไม่พบห้องเกม' }, 404);

    let query = `SELECT * FROM transactions WHERE game_id = ?`;
    const bindings = [game.id];
    if (type) { query += ` AND type = ?`; bindings.push(type); }
    query += ` ORDER BY id DESC LIMIT ?`;
    bindings.push(limit);

    const { results } = await env.DB.prepare(query).bind(...bindings).all();
    return json({ transactions: results });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
