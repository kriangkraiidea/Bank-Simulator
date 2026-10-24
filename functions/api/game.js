// API: /api/game
// GET  - List active games for Lobby
// POST - Create a new game with privacy, password & custom colors

export async function onRequestGet({ env }) {
  try {
    await ensureSchema(env.DB);

    const { results } = await env.DB.prepare(`
      SELECT 
        g.id, 
        g.room_code, 
        g.bank_balance, 
        g.starting_money, 
        g.round, 
        g.active, 
        COALESCE(g.is_public, 1) as is_public,
        CASE WHEN g.password IS NOT NULL AND g.password != '' THEN 1 ELSE 0 END as has_password,
        COALESCE(g.allow_spectator, 1) as allow_spectator,
        COALESCE(g.hide_others_balance, 1) as hide_others_balance,
        g.created_at,
        COUNT(p.id) as max_players,
        SUM(CASE WHEN p.claimed_session IS NOT NULL AND p.claimed_session != '' THEN 1 ELSE 0 END) as active_players
      FROM games g
      LEFT JOIN players p ON p.game_id = g.id
      WHERE g.active = 1
      GROUP BY g.id
      ORDER BY g.created_at DESC
      LIMIT 20
    `).all();

    return json({ games: results || [] });
  } catch (e) {
    return json({ error: e.message, games: [] }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    await ensureSchema(env.DB);

    const body = await request.json();
    const {
      players,
      startingMoney = 15000,
      bankMoney = 0,
      isPublic = true,
      password = '',
      allowSpectator = true,
      hideOthersBalance = true
    } = body;

    if (!Array.isArray(players) || players.length < 2 || players.length > 8) {
      return json({ error: 'ต้องมีผู้เล่น 2–8 คน' }, 400);
    }

    // Validate player names <= 15 chars
    for (const p of players) {
      if ((p.name || '').trim().length > 15) {
        return json({ error: `ชื่อ "${p.name}" ยาวเกิน 15 ตัวอักษร` }, 400);
      }
    }

    const roomCode = genCode();
    const gameId = crypto.randomUUID();
    const bankBalance = bankMoney === 0 ? null : bankMoney;

    await env.DB.prepare(`
      INSERT INTO games (
        id, room_code, bank_balance, starting_money,
        is_public, password, allow_spectator, hide_others_balance
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      gameId,
      roomCode,
      bankBalance,
      startingMoney,
      isPublic ? 1 : 0,
      (password || '').trim() || null,
      allowSpectator ? 1 : 0,
      hideOthersBalance ? 1 : 0
    ).run();

    for (const [i, player] of players.entries()) {
      const colorIdx = typeof player.colorIndex === 'number' ? player.colorIndex : i;
      await env.DB.prepare(`
        INSERT INTO players (game_id, name, color_index, balance)
        VALUES (?, ?, ?, ?)
      `).bind(
        gameId,
        player.name.trim().slice(0, 15) || `ผู้เล่น ${i + 1}`,
        colorIdx,
        startingMoney
      ).run();
    }

    const playerNames = players.map(p => p.name.trim()).join(', ');
    await env.DB.prepare(`
      INSERT INTO transactions (game_id, type, icon, from_label, to_label, reason, round)
       VALUES (?, 'system', '🎮', 'ระบบ', 'ผู้เล่นทุกคน', ?, 1)
    `).bind(gameId, `เริ่มเกมแล้ว! ผู้เล่น: ${playerNames} | เงินเริ่มต้น: ${fmt(startingMoney)} บาท/คน`).run();

    return json({ gameId, roomCode });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// Auto-migrate schema helper
async function ensureSchema(db) {
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        room_code TEXT UNIQUE NOT NULL,
        bank_balance INTEGER,
        starting_money INTEGER NOT NULL DEFAULT 15000,
        round INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        is_public INTEGER NOT NULL DEFAULT 1,
        password TEXT,
        allow_spectator INTEGER NOT NULL DEFAULT 1,
        hide_others_balance INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color_index INTEGER NOT NULL DEFAULT 0,
        balance INTEGER NOT NULL DEFAULT 0,
        bankrupt INTEGER NOT NULL DEFAULT 0,
        avatar_url TEXT,
        claimed_session TEXT,
        claimed_at TEXT,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        type TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '💸',
        from_label TEXT,
        to_label TEXT,
        amount INTEGER,
        reason TEXT,
        round INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );
    `);

    // Add columns if table existed without them
    const gCols = [
      'is_public INTEGER DEFAULT 1',
      'password TEXT',
      'allow_spectator INTEGER DEFAULT 1',
      'hide_others_balance INTEGER DEFAULT 1'
    ];
    for (const col of gCols) {
      try { await db.prepare(`ALTER TABLE games ADD COLUMN ${col}`).run(); } catch(e) {}
    }
    const pCols = [
      'avatar_url TEXT',
      'claimed_session TEXT',
      'claimed_at TEXT'
    ];
    for (const col of pCols) {
      try { await db.prepare(`ALTER TABLE players ADD COLUMN ${col}`).run(); } catch(e) {}
    }
  } catch(e) {}
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function fmt(n) { return Number(n).toLocaleString('th-TH'); }
function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
