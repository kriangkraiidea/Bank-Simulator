-- เศรษฐี Digital Bank — D1 Schema (Updated)
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  room_code TEXT UNIQUE NOT NULL,
  bank_balance INTEGER,          -- NULL = unlimited
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
  type TEXT NOT NULL,           -- 'transfer' | 'bank' | 'system'
  icon TEXT NOT NULL DEFAULT '💸',
  from_label TEXT,
  to_label TEXT,
  amount INTEGER,
  reason TEXT,
  round INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_games_room_code ON games(room_code);
CREATE INDEX IF NOT EXISTS idx_players_game_id ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_transactions_game_id ON transactions(game_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(game_id, created_at DESC);
