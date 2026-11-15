'use strict';

require('./seed'); // creates + seeds the database the first time it runs

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const db = require('./db');
const { hashPassword, verifyPassword } = require('./password');
const { sendOtpEmail, mailConfigured } = require('./mailer');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const RESET_SECRET = process.env.PASSWORD_RESET_SECRET || crypto.randomBytes(32).toString('hex');
const RESET_TTL_MS = 10 * 60 * 1000;
const RESET_COOLDOWN_MS = 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;

app.use(express.json());
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/* ══════════════════════════════════════════════════════════════════
   Prepared queries
   ══════════════════════════════════════════════════════════════════ */

const selectLeague = db.prepare('SELECT * FROM leagues WHERE key = ?');
const selectLeagues = db.prepare('SELECT * FROM leagues ORDER BY id');
const selectTeams = db.prepare('SELECT * FROM teams WHERE league_id = ? ORDER BY id');
const selectTeam = db.prepare('SELECT * FROM teams WHERE id = ?');

const selectMatchesByLeague = db.prepare(`
  SELECT m.*,
         h.name     AS home_name,
         h.logo_url AS home_logo,
         a.name     AS away_name,
         a.logo_url AS away_logo,
         cu.full_name AS creator_name
  FROM matches m
  JOIN teams h ON h.id = m.home_team_id
  JOIN teams a ON a.id = m.away_team_id
  LEFT JOIN users cu ON cu.id = m.created_by
  WHERE m.league_id = ?
  ORDER BY CASE m.status WHEN 'live' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END, m.id
`);

const selectMatchById = db.prepare(`
  SELECT m.*,
         h.name     AS home_name,
         h.logo_url AS home_logo,
         a.name     AS away_name,
         a.logo_url AS away_logo,
         cu.full_name AS creator_name
  FROM matches m
  JOIN teams h ON h.id = m.home_team_id
  JOIN teams a ON a.id = m.away_team_id
  LEFT JOIN users cu ON cu.id = m.created_by
  WHERE m.id = ?
`);

const selectEventsByLeague = db.prepare(`
  SELECT e.*
  FROM match_events e
  JOIN matches m ON m.id = e.match_id
  WHERE m.league_id = ?
  ORDER BY e.minute, e.id
`);

const selectEventsByMatch = db.prepare(`
  SELECT * FROM match_events WHERE match_id = ? ORDER BY minute, id
`);

const selectStandings = db.prepare(`
  SELECT s.*, t.name, t.logo_url
  FROM standings s
  JOIN teams t ON t.id = s.team_id
  WHERE s.league_id = ?
  ORDER BY s.rank
`);

const selectPlayersByTeam = db.prepare(`
  SELECT * FROM players WHERE team_id = ? ORDER BY is_starter DESC, id
`);

const selectStats = db.prepare('SELECT * FROM match_stats WHERE match_id = ?');

const insertMatchEvent = db.prepare(`
  INSERT INTO match_events (match_id, team_id, player_name, type, minute, created_by)
  VALUES (?, ?, ?, ?, ?, ?)
`);

/* ══════════════════════════════════════════════════════════════════
   Presentation helpers
   ══════════════════════════════════════════════════════════════════ */

const toScorerText = (events) =>
  events
    .filter((event) => event.type === 'goal')
    .map((event) => `${event.player_name.split(' ').pop()} ${event.minute}'`)
    .join(', ');

function presentMatch(row, events = []) {
  const goals = events.filter((event) => event.type === 'goal');
  const kickoff = parseKickoff(row.kickoff_at);

  return {
    id: row.id,
    day: kickoff ? dayLabelOf(kickoff) : row.day_label,
    date: kickoff ? dayLabelOf(kickoff) : row.day_label,
    time: row.time_label,
    kickoffTime: kickoff ? timeLabelOf(kickoff) : (row.status === 'upcoming' ? row.time_label : ''),
    status: row.status,
    home: row.home_name,
    homeLogo: row.home_logo,
    homeTeamId: row.home_team_id,
    homeScore: row.home_score,
    away: row.away_name,
    awayLogo: row.away_logo,
    awayTeamId: row.away_team_id,
    awayScore: row.away_score,
    venue: row.venue,
    referee: row.referee,
    createdBy: row.created_by ?? null,
    createdByName: row.creator_name ?? null,
    scorers: goals.length
      ? toScorerText(events)
      : row.status === 'upcoming' ? 'Match not started' : 'No goals yet'
  };
}

function groupEvents(events) {
  const map = new Map();
  events.forEach((event) => {
    if (!map.has(event.match_id)) map.set(event.match_id, []);
    map.get(event.match_id).push(event);
  });
  return map;
}

function presentLeague(row) {
  return {
    key: row.key,
    name: row.name,
    icon: row.icon,
    logoUrl: row.logo_url || '',
    sub: row.sub,
    season: row.season,
    stats: {
      matches: `${row.total_matches} Matches`,
      goals: `${row.total_goals} Goals`,
      avg: `${row.avg_goals.toFixed(2)} G/M`
    }
  };
}

function loadLeaguePayload(key) {
  const league = selectLeague.get(key);
  if (!league) return null;

  const eventsByMatch = groupEvents(selectEventsByLeague.all(league.id));
  const matches = selectMatchesByLeague.all(league.id)
    .map((row) => presentMatch(row, eventsByMatch.get(row.id) || []));

  const standings = selectStandings.all(league.id).map((row) => ({
    rank: row.rank,
    name: row.name,
    logo: row.logo_url,
    p: row.played,
    w: row.won,
    d: row.drawn,
    l: row.lost,
    gf: row.goals_for,
    ga: row.goals_against,
    pts: row.points,
    form: row.form.split(',')
  }));

  const teams = selectTeams.all(league.id).map((team) => ({
    id: team.id,
    name: team.name,
    logo: team.logo_url
  }));

  return { ...presentLeague(league), teams, matches, standings };
}

function presentPlayer(row) {
  return {
    name: row.name,
    pos: row.position,
    rating: row.rating,
    type: row.is_starter ? 'starter' : 'sub',
    stats: row.stat_line
  };
}

function presentEvent(event, match) {
  return {
    id: event.id,
    type: event.type,
    minute: event.minute,
    player: event.player_name,
    team: event.team_id === match.home_team_id ? 'home' : 'away',
    teamId: event.team_id
  };
}

function buildMatchDetail(matchId) {
  const row = selectMatchById.get(matchId);
  if (!row) return null;

  const events = selectEventsByMatch.all(row.id);
  const presented = events.map((event) => presentEvent(event, row));
  const stats = selectStats.get(row.id) || {};

  const yellowHome = presented.filter((e) => e.type === 'yellow' && e.team === 'home').length;
  const yellowAway = presented.filter((e) => e.type === 'yellow' && e.team === 'away').length;
  const redHome = presented.filter((e) => e.type === 'red' && e.team === 'home').length;
  const redAway = presented.filter((e) => e.type === 'red' && e.team === 'away').length;

  return {
    ...presentMatch(row, events),
    events: presented,
    stats: {
      possession: [stats.possession_home ?? 50, stats.possession_away ?? 50],
      shots: [stats.shots_home ?? 0, stats.shots_away ?? 0],
      onTarget: [stats.on_target_home ?? 0, stats.on_target_away ?? 0],
      fouls: [stats.fouls_home ?? 0, stats.fouls_away ?? 0],
      yellow: [yellowHome, yellowAway],
      red: [redHome, redAway]
    },
    players: {
      home: selectPlayersByTeam.all(row.home_team_id).map(presentPlayer),
      away: selectPlayersByTeam.all(row.away_team_id).map(presentPlayer)
    },
    timeline: [{ min: 0, type: 'start', team: null, player: 'Match Started' }].concat(presented)
  };
}

function recalcScore(matchId) {
  const match = selectMatchById.get(matchId);
  if (!match) return;

  const goals = db.prepare(
    "SELECT team_id, COUNT(*) AS total FROM match_events WHERE match_id = ? AND type = 'goal' GROUP BY team_id"
  ).all(matchId);

  let home = 0;
  let away = 0;
  for (const goal of goals) {
    if (goal.team_id === match.home_team_id) home = goal.total;
    else if (goal.team_id === match.away_team_id) away = goal.total;
  }

  db.prepare('UPDATE matches SET home_score = ?, away_score = ? WHERE id = ?').run(home, away, matchId);
}

/* ══════════════════════════════════════════════════════════════════
   Authentication helpers
   ══════════════════════════════════════════════════════════════════ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function currentUser(req) {
  const token = bearerToken(req);
  if (!token) return null;

  return db.prepare(`
    SELECT u.id, u.full_name, u.email, u.role,
           u.favourite_club, u.favourite_league, u.favourite_city
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token) || null;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in to continue.' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in to continue.' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  req.user = user;
  next();
}

const presentUser = (user) => ({
  id: user.id,
  fullName: user.full_name,
  email: user.email,
  role: user.role,
  favouriteClub: user.favourite_club || '',
  favouriteLeague: user.favourite_league || '',
  favouriteCity: user.favourite_city || ''
});

function cleanText(value, fallback, maxLength) {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, maxLength);
}

/* ── kickoff date/time helpers ───────────────────────────────── */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseKickoff(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayLabelOf(date) {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

function timeLabelOf(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function isoLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` +
    `T${timeLabelOf(date)}:00`;
}

/** Turn the create-match form's "Today / Tomorrow / Yesterday + HH:MM" into a real date. */
function kickoffFromDay(dayLabel, timeLabel) {
  const offset = dayLabel === 'Tomorrow' ? 1 : dayLabel === 'Yesterday' ? -1 : 0;
  const parsed = /^(\d{1,2}):(\d{2})$/.exec(String(timeLabel || ''));
  const hours = parsed ? Math.min(23, Number(parsed[1])) : 20;
  const minutes = parsed ? Math.min(59, Number(parsed[2])) : 0;

  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/* ══════════════════════════════════════════════════════════════════
   League / match API
   ══════════════════════════════════════════════════════════════════ */

app.get('/api/health', (req, res) => {
  res.json({ ok: true, database: path.basename(db.DB_PATH) });
});

app.get('/api/leagues', (req, res) => {
  res.json({ leagues: selectLeagues.all().map(presentLeague) });
});

app.get('/api/leagues/:key', (req, res) => {
  const payload = loadLeaguePayload(req.params.key);
  if (!payload) return res.status(404).json({ error: 'League not found.' });
  res.json(payload);
});

app.get('/api/leagues/:key/matches', (req, res) => {
  const league = selectLeague.get(req.params.key);
  if (!league) return res.status(404).json({ error: 'League not found.' });

  const status = String(req.query.status || 'all');
  const query = String(req.query.q || '').trim().toLowerCase();

  const eventsByMatch = groupEvents(selectEventsByLeague.all(league.id));
  let matches = selectMatchesByLeague.all(league.id)
    .map((row) => presentMatch(row, eventsByMatch.get(row.id) || []));

  if (status !== 'all') matches = matches.filter((match) => match.status === status);
  if (query) matches = matches.filter((match) => `${match.home} ${match.away}`.toLowerCase().includes(query));

  res.json({ matches });
});

app.get('/api/leagues/:key/standings', (req, res) => {
  const league = selectLeague.get(req.params.key);
  if (!league) return res.status(404).json({ error: 'League not found.' });
  res.json({ standings: loadLeaguePayload(league.key).standings });
});

/** A logged-in user creates a fixture in any league. */
app.post('/api/leagues/:key/matches', requireAuth, (req, res) => {
  const league = selectLeague.get(req.params.key);
  if (!league) return res.status(404).json({ error: 'League not found.' });

  const homeTeamId = Number(req.body?.homeTeamId);
  const awayTeamId = Number(req.body?.awayTeamId);
  const home = selectTeam.get(homeTeamId);
  const away = selectTeam.get(awayTeamId);

  if (!home || !away || home.league_id !== league.id || away.league_id !== league.id) {
    return res.status(400).json({ error: 'Both teams must belong to this league.' });
  }
  if (homeTeamId === awayTeamId) {
    return res.status(400).json({ error: 'Home and away teams must be different.' });
  }

  const status = req.body?.status === 'live' ? 'live' : 'upcoming';
  const requestedDay = cleanText(req.body?.dayLabel, 'Today', 30);
  const requestedTime = cleanText(req.body?.timeLabel, '20:00', 20);
  const kickoff = kickoffFromDay(requestedDay, requestedTime);
  const dayLabel = dayLabelOf(kickoff);
  const timeLabel = timeLabelOf(kickoff);
  const venue = cleanText(req.body?.venue, 'TBD', 100);
  const referee = cleanText(req.body?.referee, 'TBD', 60);

  const matchId = Number(db.prepare(`
    INSERT INTO matches
      (league_id, match_code, day_label, time_label, status, home_team_id, away_team_id,
       home_score, away_score, venue, referee, created_by, kickoff_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
  `).run(
    league.id,
    `custom_${league.key}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    dayLabel, timeLabel, status, homeTeamId, awayTeamId, venue, referee, req.user.id, isoLocal(kickoff)
  ).lastInsertRowid);

  db.prepare('INSERT INTO match_stats (match_id) VALUES (?)').run(matchId);

  res.status(201).json({ match: buildMatchDetail(matchId) });
});

app.get('/api/matches/:id', (req, res) => {
  const match = buildMatchDetail(Number(req.params.id));
  if (!match) return res.status(404).json({ error: 'Match not found.' });
  res.json({ match });
});

/** Owner (or admin) adds a goal / yellow card / red card to a custom match. */
app.post('/api/matches/:id/events', requireAuth, (req, res) => {
  const match = selectMatchById.get(Number(req.params.id));
  if (!match) return res.status(404).json({ error: 'Match not found.' });

  if (!match.created_by) {
    return res.status(403).json({ error: 'Official matches cannot be edited.' });
  }
  if (match.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only manage your own matches.' });
  }
  if (match.status === 'finished') {
    return res.status(400).json({ error: 'This match is finished. Reopen it before adding events.' });
  }

  const type = String(req.body?.type || '');
  if (!['goal', 'yellow', 'red'].includes(type)) {
    return res.status(400).json({ error: 'Event type must be goal, yellow or red.' });
  }

  const teamId = Number(req.body?.teamId);
  if (teamId !== match.home_team_id && teamId !== match.away_team_id) {
    return res.status(400).json({ error: 'Pick the home or away team.' });
  }

  const playerName = cleanText(req.body?.playerName, '', 60);
  if (playerName.length < 2) {
    return res.status(400).json({ error: 'Enter the player name.' });
  }

  const minute = Number(req.body?.minute);
  if (!Number.isInteger(minute) || minute < 1 || minute > 120) {
    return res.status(400).json({ error: 'Minute must be a whole number between 1 and 120.' });
  }

  db.exec('BEGIN');
  try {
    insertMatchEvent.run(match.id, teamId, playerName, type, minute, req.user.id);
    if (type === 'goal') recalcScore(match.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  res.status(201).json({ match: buildMatchDetail(match.id) });
});

app.delete('/api/matches/:id/events/:eventId', requireAuth, (req, res) => {
  const match = selectMatchById.get(Number(req.params.id));
  if (!match) return res.status(404).json({ error: 'Match not found.' });

  if (!match.created_by) {
    return res.status(403).json({ error: 'Official matches cannot be edited.' });
  }
  if (match.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only manage your own matches.' });
  }

  const event = db.prepare('SELECT * FROM match_events WHERE id = ? AND match_id = ?')
    .get(Number(req.params.eventId), match.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM match_events WHERE id = ?').run(event.id);
    if (event.type === 'goal') recalcScore(match.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  res.json({ match: buildMatchDetail(match.id) });
});

app.patch('/api/matches/:id/status', requireAuth, (req, res) => {
  const match = selectMatchById.get(Number(req.params.id));
  if (!match) return res.status(404).json({ error: 'Match not found.' });

  if (!match.created_by) {
    return res.status(403).json({ error: 'Official matches cannot be edited.' });
  }
  if (match.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only manage your own matches.' });
  }

  const status = String(req.body?.status || '');
  if (!['upcoming', 'live', 'finished'].includes(status)) {
    return res.status(400).json({ error: 'Invalid match status.' });
  }

  const kickoff = parseKickoff(match.kickoff_at);
  const upcomingTime = kickoff ? timeLabelOf(kickoff) : '20:00';

  db.prepare('UPDATE matches SET status = ?, time_label = ? WHERE id = ?')
    .run(status, status === 'finished' ? 'FT' : status === 'upcoming' ? upcomingTime : match.time_label, match.id);

  res.json({ match: buildMatchDetail(match.id) });
});

/** Only admins may remove a user-created fixture. */
app.delete('/api/matches/:id', requireAdmin, (req, res) => {
  const match = selectMatchById.get(Number(req.params.id));
  if (!match) return res.status(404).json({ error: 'Match not found.' });

  if (!match.created_by) {
    return res.status(400).json({ error: 'Only user-created matches can be deleted.' });
  }

  db.prepare('DELETE FROM matches WHERE id = ?').run(match.id);
  res.json({ ok: true });
});

/* ══════════════════════════════════════════════════════════════════
   Admin dashboard — registered users and their custom matches
   ══════════════════════════════════════════════════════════════════ */

const selectAdminUsers = db.prepare(`
  SELECT u.id,
         u.full_name,
         u.email,
         u.role,
         u.favourite_club,
         u.favourite_league,
         u.favourite_city,
         u.created_at,
         (SELECT COUNT(*) FROM matches m WHERE m.created_by = u.id) AS match_count
  FROM users u
  ORDER BY CASE u.role WHEN 'admin' THEN 0 ELSE 1 END, u.id
`);

const selectAdminStats = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM users)                                AS users,
    (SELECT COUNT(*) FROM users WHERE role = 'admin')           AS admins,
    (SELECT COUNT(*) FROM matches)                              AS matches,
    (SELECT COUNT(*) FROM matches WHERE created_by IS NOT NULL) AS custom_matches,
    (SELECT COUNT(*) FROM match_events)                         AS events
`);

const selectUserMatches = db.prepare(`
  SELECT m.id, m.status, m.day_label, m.time_label, m.home_score, m.away_score, m.venue,
         l.key AS league_key, l.name AS league_name, l.icon AS league_icon, l.logo_url AS league_logo,
         h.name AS home_name, a.name AS away_name
  FROM matches m
  JOIN leagues l ON l.id = m.league_id
  JOIN teams h   ON h.id = m.home_team_id
  JOIN teams a   ON a.id = m.away_team_id
  WHERE m.created_by = ?
  ORDER BY m.id DESC
`);

function presentAdminUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    favouriteClub: row.favourite_club || '',
    favouriteLeague: row.favourite_league || '',
    favouriteCity: row.favourite_city || '',
    createdAt: row.created_at,
    matchCount: row.match_count
  };
}

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const stats = selectAdminStats.get();
  res.json({
    stats: {
      users: stats.users,
      admins: stats.admins,
      matches: stats.matches,
      customMatches: stats.custom_matches,
      events: stats.events
    },
    users: selectAdminUsers.all().map(presentAdminUser)
  });
});

app.get('/api/admin/users/:id/matches', requireAdmin, (req, res) => {
  const user = db.prepare(`
    SELECT id, full_name, email, role, favourite_club, favourite_league, favourite_city, created_at
    FROM users WHERE id = ?
  `).get(Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const matches = selectUserMatches.all(user.id).map((row) => ({
    id: row.id,
    status: row.status,
    day: row.day_label,
    time: row.time_label,
    home: row.home_name,
    away: row.away_name,
    homeScore: row.home_score,
    awayScore: row.away_score,
    venue: row.venue,
    leagueKey: row.league_key,
    leagueName: row.league_name,
    leagueIcon: row.league_icon,
    leagueLogo: row.league_logo || ''
  }));

  res.json({
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      favouriteClub: user.favourite_club || '',
      favouriteLeague: user.favourite_league || '',
      favouriteCity: user.favourite_city || '',
      createdAt: user.created_at
    },
    matches
  });
});

/* ══════════════════════════════════════════════════════════════════
   Live simulation — admin controlled, official matches only
   ══════════════════════════════════════════════════════════════════ */

function simulationEnabled() {
  const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get('simulation_enabled');
  return !row || row.value !== 'false';
}

function setSimulation(enabled) {
  db.prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)')
    .run('simulation_enabled', enabled ? 'true' : 'false');
}

const selectLiveMatches = db.prepare(
  "SELECT * FROM matches WHERE status = 'live' AND created_by IS NULL"
);
const selectScorersForTeam = db.prepare(`
  SELECT * FROM players
  WHERE team_id = ? AND position IN ('FWD', 'MID')
  ORDER BY RANDOM() LIMIT 1
`);
const bumpStats = db.prepare(`
  UPDATE match_stats
  SET shots_home = shots_home + ?,
      on_target_home = on_target_home + ?,
      shots_away = shots_away + ?,
      on_target_away = on_target_away + ?
  WHERE match_id = ?
`);
const bumpClock = db.prepare('UPDATE matches SET time_label = ? WHERE id = ?');

function simulateTick() {
  if (!simulationEnabled()) return;

  const updated = [];
  for (const match of selectLiveMatches.all()) {
    if (match.home_score + match.away_score >= 10) continue;
    if (Math.random() >= 0.01) continue;

    const homeScored = Math.random() > 0.5;
    const teamId = homeScored ? match.home_team_id : match.away_team_id;
    const scorer = selectScorersForTeam.get(teamId);
    const minute = Math.min(90, Number(String(match.time_label).replace(/\D/g, '')) + 1 || 1);

    db.exec('BEGIN');
    try {
      if (homeScored) {
        db.prepare('UPDATE matches SET home_score = home_score + 1 WHERE id = ?').run(match.id);
      } else {
        db.prepare('UPDATE matches SET away_score = away_score + 1 WHERE id = ?').run(match.id);
      }
      insertMatchEvent.run(
        match.id, teamId, scorer ? scorer.name : 'Unknown', 'goal', minute, null
      );
      bumpStats.run(homeScored ? 1 : 0, homeScored ? 1 : 0, homeScored ? 0 : 1, homeScored ? 0 : 1, match.id);
      bumpClock.run(`${minute}'`, match.id);
      db.exec('COMMIT');
      updated.push(match.id);
    } catch (error) {
      db.exec('ROLLBACK');
      console.error('Simulation update failed:', error.message);
    }
  }
  return updated;
}

setInterval(simulateTick, 4000);

app.get('/api/simulation', requireAdmin, (req, res) => {
  res.json({ enabled: simulationEnabled() });
});

app.post('/api/simulation', requireAdmin, (req, res) => {
  const enabled = Boolean(req.body && req.body.enabled);
  setSimulation(enabled);
  res.json({ enabled });
});

/* ══════════════════════════════════════════════════════════════════
   Authentication
   ══════════════════════════════════════════════════════════════════ */

app.post('/api/auth/register', (req, res) => {
  const fullName = String(req.body?.fullName || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const favouriteClub = cleanText(req.body?.favouriteClub, '', 60);
  const favouriteLeague = cleanText(req.body?.favouriteLeague, '', 40);
  const favouriteCity = cleanText(req.body?.favouriteCity, '', 60);

  if (fullName.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'An account with this email already exists.' });

  const userId = Number(db.prepare(`
    INSERT INTO users
      (full_name, email, password_hash, role, favourite_club, favourite_league, favourite_city)
    VALUES (?, ?, ?, 'user', ?, ?, ?)
  `).run(
    fullName, email, hashPassword(password), favouriteClub, favouriteLeague, favouriteCity
  ).lastInsertRowid);

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);

  const created = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  res.status(201).json({
    token,
    user: presentUser(created)
  });
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);

  res.json({ token, user: presentUser(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: presentUser(req.user) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = bearerToken(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

/* ── password reset with a 6-digit email code ────────────────── */

function hashResetCode(userId, code) {
  return crypto.createHmac('sha256', RESET_SECRET).update(`${userId}:${code}`).digest('hex');
}

app.post('/api/auth/forgot', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const genericReply = {
    ok: true,
    message: 'If that email is registered, a 6-digit code has been sent.',
    emailSent: mailConfigured()
  };

  const user = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(email);
  if (!user) return res.json(genericReply);

  const now = Date.now();
  const latest = db.prepare(
    'SELECT created_at FROM password_resets WHERE user_id = ? ORDER BY id DESC LIMIT 1'
  ).get(user.id);

  if (latest && now - latest.created_at < RESET_COOLDOWN_MS) {
    const wait = Math.ceil((RESET_COOLDOWN_MS - (now - latest.created_at)) / 1000);
    return res.status(429).json({ error: `Please wait ${wait}s before requesting another code.` });
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
  db.prepare(`
    INSERT INTO password_resets (user_id, email, otp_hash, attempts, expires_at, created_at)
    VALUES (?, ?, ?, 0, ?, ?)
  `).run(user.id, user.email, hashResetCode(user.id, code), now + RESET_TTL_MS, now);

  try {
    const { sent } = await sendOtpEmail(user.email, code);
    if (!sent) {
      console.log(`[password reset] SMTP not configured — code for ${user.email}: ${code}`);
      return res.json({ ...genericReply, emailSent: false, devCode: code });
    }
    return res.json(genericReply);
  } catch (error) {
    console.error('Password reset email failed:', error.message);
    return res.status(502).json({ error: 'Could not send the email. Check the SMTP settings.' });
  }
});

app.post('/api/auth/reset', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.otp || '').replace(/\D/g, '');
  const password = String(req.body?.password || '');

  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Enter the 6-digit code from your email.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
  const row = user
    ? db.prepare('SELECT * FROM password_resets WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(user.id)
    : null;
  const invalid = { error: 'Invalid or expired code. Request a new one.' };

  if (!user || !row) return res.status(400).json(invalid);

  if (row.expires_at < Date.now()) {
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
    return res.status(400).json(invalid);
  }

  if (row.attempts >= RESET_MAX_ATTEMPTS) {
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
    return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
  }

  if (row.otp_hash !== hashResetCode(user.id, code)) {
    db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return res.status(400).json(invalid);
  }

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  res.json({ ok: true, message: 'Password updated. You can log in with the new password.' });
});

/** A logged-in user closes their own account; their matches go with it. */
app.delete('/api/auth/me', requireAuth, (req, res) => {
  const password = String(req.body?.password || '');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(400).json({ error: 'Password is incorrect.' });
  }
  if (user.role === 'admin') {
    return res.status(400).json({ error: 'The admin account cannot be deleted.' });
  }

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM matches WHERE created_by = ?').run(user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  res.json({ ok: true });
});

/* ══════════════════════════════════════════════════════════════════
   Static frontend + error handling
   ══════════════════════════════════════════════════════════════════ */

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`FootHub running at http://localhost:${PORT}`);
  console.log(`SQLite database: ${db.DB_PATH}`);
});
