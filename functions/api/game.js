// API: /api/game
// GET  - List all active games for Lobby (latest first)
// POST - Create a new game with room name, password, privacy & custom colors

export async function onRequestGet({ env }) {
  try {
    await autoMigrateSchema(env.DB);

    const { results } = await env.DB.prepare(`
      SELECT 
        g.id, 
        g.room_code, 
        COALESCE(g.room_name, g.room_code) as room_name,
        g.bank_balance, 
        g.starting_money, 
        g.round, 
        g.active, 
        CASE WHEN g.password IS NOT NULL AND g.password != '' THEN 1 ELSE 0 END as has_password,
        COALESCE(g.allow_spectator, 1) as allow_spectator,
        COALESCE(g.hide_others_balance, 1) as hide_others_balance,
        COALESCE(g.is_ended, 0) as is_ended,
        g.ended_at,
        g.created_at,
        COUNT(p.id) as max_players,
        SUM(CASE WHEN p.claimed_session IS NOT NULL AND p.claimed_session != '' THEN 1 ELSE 0 END) as active_players
      FROM games g
      LEFT JOIN players p ON p.game_id = g.id
      WHERE g.active = 1
      GROUP BY g.id
      ORDER BY g.rowid DESC, g.created_at DESC
      LIMIT 30
    `).all();

    return json({ games: results || [] });
  } catch (e) {
    return json({ error: e.message, games: [] }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    await autoMigrateSchema(env.DB);

    const body = await request.json();
    const {
      roomName = '',
      players,
      startingMoney = 15000,
      bankMoney = 0,
      password = '',
      allowSpectator = true,
      hideOthersBalance = true,
      bankPresets = null
    } = body;

    if (!Array.isArray(players) || players.length < 2 || players.length > 8) {
      return json({ error: 'ต้องมีผู้เล่น 2–8 คน' }, 400);
    }

    // Validate room name (<= 20 chars)
    const finalRoomName = (roomName || '').trim().slice(0, 20) || 'ห้องเกมเศรษฐี';

    // Validate player names <= 12 chars
    for (const p of players) {
      const name = (p.name || '').trim();
      if (name.length > 12) {
        return json({ error: `ชื่อผู้เล่น "${name}" ต้องไม่เกิน 12 ตัวอักษร` }, 400);
      }
    }

    // Check duplicate colors among players
    const colorSet = new Set();
    for (const p of players) {
      const c = p.colorIndex;
      if (colorSet.has(c)) {
        return json({ error: 'สีของผู้เล่นต้องไม่ซ้ำกัน' }, 400);
      }
      colorSet.add(c);
    }

    const roomCode = genCode();
    const gameId = crypto.randomUUID();
    const bankBalance = bankMoney === 0 ? null : bankMoney;
    const bankPresetsStr = bankPresets ? JSON.stringify(bankPresets) : null;

    await env.DB.prepare(`
      INSERT INTO games (
        id, room_code, room_name, bank_balance, starting_money,
        password, allow_spectator, hide_others_balance, bank_presets
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      gameId,
      roomCode,
      finalRoomName,
      bankBalance,
      startingMoney,
      (password || '').trim() || null,
      allowSpectator ? 1 : 0,
      hideOthersBalance ? 1 : 0,
      bankPresetsStr
    ).run();

    for (const [i, player] of players.entries()) {
      const colorIdx = typeof player.colorIndex === 'number' ? player.colorIndex : i;
      await env.DB.prepare(`
        INSERT INTO players (game_id, name, color_index, balance)
        VALUES (?, ?, ?, ?)
      `).bind(
        gameId,
        player.name.trim().slice(0, 12) || `ผู้เล่น ${i + 1}`,
        colorIdx,
        startingMoney
      ).run();
    }

    const playerNames = players.map(p => p.name.trim()).join(', ');
    await env.DB.prepare(`
      INSERT INTO transactions (game_id, type, icon, from_label, to_label, reason, round)
      VALUES (?, 'system', '🎮', 'ระบบ', 'ผู้เล่นทุกคน', ?, 1)
    `).bind(gameId, `เริ่มเกม "${finalRoomName}"! ผู้เล่น: ${playerNames} | เงินเริ่มต้น: ${fmt(startingMoney)} บาท/คน`).run();

    return json({ gameId, roomCode, roomName: finalRoomName });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// Auto-migrate schema with safe individual ALTER TABLE statements
async function autoMigrateSchema(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        room_code TEXT UNIQUE NOT NULL,
        bank_balance INTEGER,
        starting_money INTEGER NOT NULL DEFAULT 15000,
        round INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color_index INTEGER NOT NULL DEFAULT 0,
        balance INTEGER NOT NULL DEFAULT 0,
        bankrupt INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      )
    `).run();

    await db.prepare(`
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
      )
    `).run();

    // Add columns individually (ignoring if already exists)
    const gameColumns = [
      'room_name TEXT',
      'password TEXT',
      'allow_spectator INTEGER DEFAULT 1',
      'hide_others_balance INTEGER DEFAULT 1',
      'is_ended INTEGER DEFAULT 0',
      'ended_at TEXT',
      'bank_presets TEXT'
    ];
    for (const col of gameColumns) {
      try {
        await db.prepare(`ALTER TABLE games ADD COLUMN ${col}`).run();
      } catch (_) {}
    }

    const playerColumns = [
      'avatar_url TEXT',
      'claimed_session TEXT',
      'claimed_at TEXT',
      'bankrupt_order INTEGER',
      'bankrupt_at TEXT'
    ];
    for (const col of playerColumns) {
      try {
        await db.prepare(`ALTER TABLE players ADD COLUMN ${col}`).run();
      } catch (_) {}
    }

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS payment_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        from_player_id INTEGER NOT NULL,
        to_player_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        emoji TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      )
    `).run();
  } catch (_) {}
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function fmt(n) { return Number(n).toLocaleString('th-TH'); }
function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
