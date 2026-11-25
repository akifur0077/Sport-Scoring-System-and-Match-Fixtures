PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS leagues (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key           TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  icon          TEXT    NOT NULL,
  logo_url      TEXT    NOT NULL DEFAULT '',
  sub           TEXT    NOT NULL DEFAULT '',
  season        TEXT    NOT NULL DEFAULT '2025/26',
  total_matches INTEGER NOT NULL DEFAULT 0,
  total_goals   INTEGER NOT NULL DEFAULT 0,
  avg_goals     REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS teams (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name     TEXT    NOT NULL,
  logo_url TEXT    NOT NULL,
  UNIQUE (league_id, name)
);

CREATE TABLE IF NOT EXISTS players (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  position   TEXT    NOT NULL CHECK (position IN ('GK', 'DEF', 'MID', 'FWD')),
  rating     REAL    NOT NULL,
  is_starter INTEGER NOT NULL DEFAULT 1 CHECK (is_starter IN (0, 1)),
  stat_line  TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name        TEXT    NOT NULL,
  email            TEXT    NOT NULL UNIQUE,
  password_hash    TEXT    NOT NULL,
  role             TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  favourite_club   TEXT    NOT NULL DEFAULT '',
  favourite_league TEXT    NOT NULL DEFAULT '',
  favourite_city   TEXT    NOT NULL DEFAULT '',
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email      TEXT    NOT NULL,
  otp_hash   TEXT    NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

CREATE TABLE IF NOT EXISTS matches (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id    INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  match_code   TEXT    NOT NULL UNIQUE,
  day_label    TEXT    NOT NULL,
  time_label   TEXT    NOT NULL,
  status       TEXT    NOT NULL CHECK (status IN ('live', 'upcoming', 'finished')),
  home_team_id INTEGER NOT NULL REFERENCES teams(id),
  away_team_id INTEGER NOT NULL REFERENCES teams(id),
  home_score   INTEGER NOT NULL DEFAULT 0,
  away_score   INTEGER NOT NULL DEFAULT 0,
  venue        TEXT    NOT NULL,
  referee      TEXT    NOT NULL,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kickoff_at   TEXT,
  live_started_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_matches_league ON matches(league_id, status);
CREATE INDEX IF NOT EXISTS idx_matches_home   ON matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away   ON matches(away_team_id);

CREATE TABLE IF NOT EXISTS match_stats (
  match_id         INTEGER PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  possession_home  INTEGER NOT NULL DEFAULT 50,
  possession_away  INTEGER NOT NULL DEFAULT 50,
  shots_home       INTEGER NOT NULL DEFAULT 0,
  shots_away       INTEGER NOT NULL DEFAULT 0,
  on_target_home   INTEGER NOT NULL DEFAULT 0,
  on_target_away   INTEGER NOT NULL DEFAULT 0,
  fouls_home       INTEGER NOT NULL DEFAULT 0,
  fouls_away       INTEGER NOT NULL DEFAULT 0,
  yellow_home      INTEGER NOT NULL DEFAULT 0,
  yellow_away      INTEGER NOT NULL DEFAULT 0,
  red_home         INTEGER NOT NULL DEFAULT 0,
  red_away         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS match_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id    INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id     INTEGER NOT NULL REFERENCES teams(id),
  player_name TEXT    NOT NULL,
  type        TEXT    NOT NULL CHECK (type IN ('goal', 'yellow', 'red')),
  minute      INTEGER NOT NULL,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_match ON match_events(match_id, minute);

CREATE TABLE IF NOT EXISTS standings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id      INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team_id        INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  rank           INTEGER NOT NULL,
  played         INTEGER NOT NULL DEFAULT 0,
  won            INTEGER NOT NULL DEFAULT 0,
  drawn          INTEGER NOT NULL DEFAULT 0,
  lost           INTEGER NOT NULL DEFAULT 0,
  goals_for      INTEGER NOT NULL DEFAULT 0,
  goals_against  INTEGER NOT NULL DEFAULT 0,
  points         INTEGER NOT NULL DEFAULT 0,
  form           TEXT    NOT NULL DEFAULT 'W,D,W,L,W',
  UNIQUE (league_id, team_id)
);

CREATE TABLE IF NOT EXISTS app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

/* Public "Meet the Team" profiles. Admin-managed through the Team modal. */
CREATE TABLE IF NOT EXISTS team_members (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  role         TEXT    NOT NULL DEFAULT '',
  bio          TEXT    NOT NULL DEFAULT '',
  photo_url    TEXT    NOT NULL DEFAULT '',
  email        TEXT    NOT NULL DEFAULT '',
  phone        TEXT    NOT NULL DEFAULT '',
  location     TEXT    NOT NULL DEFAULT '',
  linkedin     TEXT    NOT NULL DEFAULT '',
  github       TEXT    NOT NULL DEFAULT '',
  facebook     TEXT    NOT NULL DEFAULT '',
  instagram    TEXT    NOT NULL DEFAULT '',
  skills       TEXT    NOT NULL DEFAULT '',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
