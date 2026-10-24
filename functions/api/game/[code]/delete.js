// POST or DELETE /api/game/:code/delete — Admin Delete Room with creator password
export async function onRequestPost(context) {
  return handleDelete(context);
}

export async function onRequestDelete(context) {
  return handleDelete(context);
}

async function handleDelete({ params, request, env }) {
  try {
    const code = params.code.toUpperCase();
    let adminPass = '';

    try {
      const body = await request.json();
      adminPass = (body.adminPass || body.password || '').trim();
    } catch(e) {
      const url = new URL(request.url);
      adminPass = (url.searchParams.get('adminPass') || '').trim();
    }

    if (adminPass !== 'pookky') {
      return json({ 
        error: 'รหัสผ่านผู้สร้างเว็บไม่ถูกต้อง! (คำใบ้: ชื่อหมาตัวแรกของผู้สร้างเป็นภาษาอังกฤษพิมพ์เล็ก)' 
      }, 403);
    }

    const game = await env.DB.prepare(
      `SELECT id FROM games WHERE room_code = ?`
    ).bind(code).first();

    if (!game) {
      return json({ error: 'ไม่พบห้องที่ต้องการลบ' }, 404);
    }

    // Cascade delete
    await env.DB.prepare(`DELETE FROM transactions WHERE game_id = ?`).bind(game.id).run();
    await env.DB.prepare(`DELETE FROM players WHERE game_id = ?`).bind(game.id).run();
    await env.DB.prepare(`DELETE FROM games WHERE id = ?`).bind(game.id).run();

    return json({ success: true, message: `ลบห้อง ${code} เรียบร้อยแล้ว` });
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
