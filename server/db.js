'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const LEAGUE_LOGOS = require('./league-logos');

const DB_PATH = process.env.DB_PATH
  || (process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, 'foothub.db')
    : path.join(__dirname, '..', 'data', 'foothub.db'));
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

/** Column names of a table (table names here are code constants, never user input). */
function columnsOf(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

/** Upgrade databases created by older versions of this project. */
function migrate() {
  if (!columnsOf('users').includes('role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  }

  for (const column of ['favourite_club', 'favourite_league', 'favourite_city']) {
    if (!columnsOf('users').includes(column)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
    }
  }

  if (!columnsOf('matches').includes('created_by')) {
    db.exec('ALTER TABLE matches ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
  }

  // Epoch milliseconds when a match went live, used to auto-finish it after 90 minutes.
  if (!columnsOf('matches').includes('live_started_at')) {
    db.exec('ALTER TABLE matches ADD COLUMN live_started_at INTEGER');
    db.prepare("UPDATE matches SET live_started_at = ? WHERE status = 'live'").run(Date.now());
  }

  if (!columnsOf('leagues').includes('logo_url')) {
    db.exec("ALTER TABLE leagues ADD COLUMN logo_url TEXT NOT NULL DEFAULT ''");
  }

  // Keep official league logos in sync even for databases seeded by older versions.
  const setLeagueLogo = db.prepare('UPDATE leagues SET logo_url = ? WHERE key = ?');
  for (const [key, url] of Object.entries(LEAGUE_LOGOS)) {
    setLeagueLogo.run(url, key);
  }

  const hasLegacyGoals = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'goals'"
  ).get();

  if (hasLegacyGoals) {
    db.exec(`
      INSERT INTO match_events (match_id, team_id, player_name, type, minute)
      SELECT match_id, team_id, scorer_name, 'goal', minute FROM goals
    `);
    db.exec('DROP TABLE goals');
  }
}

migrate();

// Created after migration so older databases have the column first.
db.exec('CREATE INDEX IF NOT EXISTS idx_matches_owner ON matches(created_by)');

module.exports = db;
module.exports.DB_PATH = DB_PATH;
