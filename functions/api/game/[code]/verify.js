// POST /api/game/:code/verify — Verify room password
export async function onRequestPost({ params, request, env }) {
  try {
    const code = params.code.toUpperCase();
    const { password = '' } = await request.json();

    const game = await env.DB.prepare(
      `SELECT id, password FROM games WHERE room_code = ? AND active = 1`
    ).bind(code).first();

    if (!game) return json({ error: 'ไม่พบห้องเกม' }, 404);

    if (!game.password || game.password === '') {
      return json({ valid: true, requiresPassword: false });
    }

    if (game.password.trim() === password.trim()) {
      return json({ valid: true, requiresPassword: true });
    }

    return json({ valid: false, error: 'รหัสผ่านห้องไม่ถูกต้อง' }, 403);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
