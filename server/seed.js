'use strict';

/**
 * Seed script.
 *
 *   node server/seed.js          -> seeds only when the database is empty
 *   node server/seed.js --reset  -> wipes match/league data and seeds again
 */

const db = require('./db');
const { hashPassword } = require('./password');

const RESET = process.argv.includes('--reset');

const LEAGUES = {
  laliga: { name: 'La Liga EA Sports', icon: '🇪🇸', sub: 'Official 20-Team Season Tournament' },
  epl: { name: 'Premier League', icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', sub: 'Official 20-Team Season Tournament' },
  ucl: { name: 'UEFA Champions League', icon: '⭐', sub: 'Official 20-Team Season Tournament' },
  bundesliga: { name: 'Bundesliga', icon: '🇩🇪', sub: 'Official 20-Team Season Tournament' },
  seriea: { name: 'Serie A', icon: '🇮🇹', sub: 'Official 20-Team Season Tournament' },
  ligue1: { name: "Ligue 1 McDonald's", icon: '🇫🇷', sub: 'Official 20-Team Season Tournament' },
  wc: { name: 'FIFA World Cup 2026', icon: '🌍', sub: 'Official 20-Team Season Tournament' }
};

const teamPools = {
  laliga: ['Real Madrid', 'FC Barcelona', 'Atlético Madrid', 'Girona FC', 'Athletic Club', 'Real Betis',
    'Real Sociedad', 'Villarreal', 'Valencia', 'Sevilla FC', 'Celta Vigo', 'Osasuna', 'Getafe',
    'Mallorca', 'Rayo Vallecano', 'Las Palmas', 'Alavés', 'Granada', 'Almería', 'Cádiz'],
  epl: ['Arsenal', 'Manchester City', 'Liverpool', 'Aston Villa', 'Tottenham', 'Chelsea', 'Newcastle',
    'Manchester United', 'West Ham', 'Crystal Palace', 'Brighton', 'Bournemouth', 'Fulham',
    'Wolverhampton', 'Everton', 'Brentford', 'Nottingham Forest', 'Luton Town', 'Burnley', 'Sheffield United'],
  ucl: ['Real Madrid', 'Bayern Munich', 'Manchester City', 'Paris Saint-Germain', 'Inter Milan', 'Arsenal',
    'FC Barcelona', 'Borussia Dortmund', 'Atlético Madrid', 'Porto', 'PSV Eindhoven', 'Napoli',
    'AS Roma', 'RB Leipzig', 'Real Sociedad', 'FC Copenhagen', 'AC Milan', 'Shakhtar Donetsk',
    'Galatasaray', 'Benfica'],
  bundesliga: ['Bayer Leverkusen', 'Bayern Munich', 'VfB Stuttgart', 'RB Leipzig', 'Borussia Dortmund',
    'Eintracht Frankfurt', 'SC Freiburg', 'FC Augsburg', 'TSG Hoffenheim', 'Werder Bremen',
    'FC Heidenheim', 'VfL Wolfsburg', 'Mainz 05', 'Borussia Mönchengladbach', 'FC Koln',
    'Union Berlin', 'Bochum', 'Darmstadt', 'St. Pauli', 'Holstein Kiel'],
  seriea: ['Inter Milan', 'AC Milan', 'Juventus', 'Bologna', 'AS Roma', 'Atalanta', 'Lazio', 'Fiorentina',
    'Napoli', 'Torino', 'Monza', 'Genoa', 'Lecce', 'Verona', 'Udinese', 'Cagliari', 'Empoli',
    'Sassuolo', 'Salernitana', 'Frosinone'],
  ligue1: ['Paris Saint-Germain', 'Monaco', 'Brest', 'Lille', 'Nice', 'Lens', 'Marseille', 'Lyon', 'Rennes',
    'Reims', 'Toulouse', 'Strasbourg', 'Montpellier', 'Nantes', 'Le Havre', 'Metz', 'Lorient',
    'Clermont Foot', 'Auxerre', 'Angers'],
  wc: ['Argentina', 'France', 'Brazil', 'England', 'Spain', 'Germany', 'Portugal', 'Netherlands', 'Belgium',
    'Italy', 'Croatia', 'Uruguay', 'Colombia', 'Mexico', 'USA', 'Japan', 'Morocco', 'Senegal',
    'South Korea', 'Australia']
};

const LOGO_IDS = {
  'Real Madrid': '8633', 'FC Barcelona': '8315', 'Atlético Madrid': '9906', 'Girona FC': '12579',
  'Athletic Club': '8318', 'Real Betis': '543', 'Real Sociedad': '548', 'Villarreal': '533',
  'Valencia': '532', 'Sevilla FC': '536', 'Celta Vigo': '538', 'Osasuna': '727', 'Getafe': '546',
  'Mallorca': '798', 'Rayo Vallecano': '728', 'Las Palmas': '539', 'Alavés': '542', 'Granada': '715',
  'Almería': '401', 'Cádiz': '726', 'Arsenal': '42', 'Manchester City': '50', 'Liverpool': '40',
  'Aston Villa': '66', 'Tottenham': '47', 'Chelsea': '49', 'Newcastle': '34', 'Manchester United': '33',
  'West Ham': '48', 'Crystal Palace': '52', 'Brighton': '51', 'Bournemouth': '35', 'Fulham': '36',
  'Wolverhampton': '39', 'Everton': '45', 'Brentford': '55', 'Nottingham Forest': '65', 'Luton Town': '1359',
  'Burnley': '44', 'Sheffield United': '62', 'Bayern Munich': '157', 'Borussia Dortmund': '165',
  'RB Leipzig': '721', 'Bayer Leverkusen': '168', 'Inter Milan': '505', 'AC Milan': '489', 'Juventus': '496',
  'Napoli': '492', 'AS Roma': '497', 'Paris Saint-Germain': '85', 'Monaco': '91', 'Marseille': '81',
  'Lyon': '80', 'Argentina': '779', 'France': '773', 'Brazil': '794', 'England': '765', 'Spain': '772',
  'Germany': '763', 'Portugal': '770', 'Netherlands': '797', 'Belgium': '758', 'Italy': '768',
  'Croatia': '761', 'Uruguay': '787', 'Colombia': '789', 'Mexico': '780', 'USA': '784', 'Japan': '792',
  'Morocco': '1538', 'Senegal': '1539', 'South Korea': '793', 'Australia': '781'
};

const stadiumList = [
  'Santiago Bernabéu', 'Spotify Camp Nou', 'Wembley Stadium', 'Old Trafford', 'Anfield',
  'Emirates Stadium', 'Allianz Arena', 'Signal Iduna Park', 'San Siro', 'Stadio Olimpico',
  'Parc des Princes', 'Stade Velodrome', 'MetLife Stadium', 'Maracanã Stadium', 'Estadio Azteca',
  'Lusail Stadium', 'Johan Cruyff Arena', 'Etihad Stadium', 'Tottenham Hotspur Stadium', 'Stamford Bridge',
  'Diego Armando Maradona Stadium', 'Estádio da Luz', 'Veltins-Arena', 'BayArena', 'Ramón Sánchez Pizjuán',
  'Mestalla Stadium', 'Reale Arena', 'San Mamés', 'Benito Villamarín', 'Hampden Park'
];

const firstNames = ['Alex', 'Carlos', 'Mateo', 'Lucas', 'Gabriel', 'Marco', 'Daniel', 'Julian', 'Bruno',
  'Enzo', 'Thiago', 'Leo', 'David', 'Nicolas', 'Samuel'];
const lastNames = ['Silva', 'Santos', 'Fernandez', 'Gomez', 'Lopez', 'Martínez', 'Rodriguez', 'Perez',
  'Sanchez', 'Ramirez', 'Torres', 'Flores', 'Rivera', 'Guzman', 'Cruz'];

const STARTER_POSITIONS = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'];
const SUB_POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (list) => list[randInt(0, list.length - 1)];
const weightedPick = (list) => list[randInt(0, list.length - 1)];
const liveScore = () => weightedPick([0, 0, 1, 1, 1, 2, 2, 3]);
const finishedScore = () => weightedPick([0, 1, 1, 1, 2, 2, 3]);
const logoFor = (name) => `https://media.api-sports.io/football/teams/${LOGO_IDS[name] || '8315'}.png`;

/* ── data generators ───────────────────────────────────────────── */

function buildRoster(teamId) {
  const roster = [];
  const used = new Set();

  const nextName = () => {
    let name;
    do {
      name = `${pick(firstNames)} ${pick(lastNames)}`;
    } while (used.has(name));
    used.add(name);
    return name;
  };

  STARTER_POSITIONS.forEach((position) => {
    const rating = Number((Math.random() * 1.5 + 7.5).toFixed(1));
    const statLine = position === 'GK'
      ? `${randInt(2, 5)} Saves`
      : position === 'DEF'
        ? `${randInt(2, 6)} Tackles`
        : position === 'MID'
          ? `${randInt(0, 2)} Goals`
          : `${randInt(1, 2)} Goals`;

    roster.push({ teamId, name: nextName(), position, rating, isStarter: 1, statLine });
  });

  SUB_POSITIONS.forEach((position) => {
    roster.push({
      teamId,
      name: nextName(),
      position,
      rating: Number((Math.random() * 1.2 + 7.0).toFixed(1)),
      isStarter: 0,
      statLine: 'Bench'
    });
  });

  return roster;
}

function scorerFromRoster(roster) {
  const attackers = roster.filter((p) => p.position === 'FWD');
  const midfielders = roster.filter((p) => p.position === 'MID');
  const pool = attackers.length ? attackers : midfielders.length ? midfielders : roster;
  return pick(pool);
}

function buildGoals(matchId, homeTeam, awayTeam, homeScore, awayScore) {
  const goals = [];
  const usedMinutes = new Set();

  const addGoals = (team, score) => {
    for (let i = 0; i < score; i++) {
      let minute;
      do {
        minute = randInt(3, 88);
      } while (usedMinutes.has(minute));
      usedMinutes.add(minute);
      const scorer = scorerFromRoster(team.roster);
      goals.push({
        matchId,
        teamId: team.id,
        playerName: scorer.name,
        type: 'goal',
        minute
      });
    }
  };

  addGoals(homeTeam, homeScore);
  addGoals(awayTeam, awayScore);
  goals.sort((a, b) => a.minute - b.minute);
  return goals;
}

function buildCards(matchId, team, yellow, red) {
  const cards = [];

  const add = (type, count) => {
    for (let i = 0; i < count; i++) {
      cards.push({
        matchId,
        teamId: team.id,
        playerName: pick(team.roster).name,
        type,
        minute: randInt(5, 90)
      });
    }
  };

  add('yellow', yellow);
  add('red', red);
  return cards;
}

/* ── database helpers ──────────────────────────────────────────── */

const insertLeague = db.prepare(`
  INSERT INTO leagues (key, name, icon, sub, season, total_matches, total_goals, avg_goals)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertTeam = db.prepare('INSERT INTO teams (league_id, name, logo_url) VALUES (?, ?, ?)');
const insertPlayer = db.prepare(`
  INSERT INTO players (team_id, name, position, rating, is_starter, stat_line)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const insertMatch = db.prepare(`
  INSERT INTO matches
    (league_id, match_code, day_label, time_label, status, home_team_id, away_team_id,
     home_score, away_score, venue, referee, kickoff_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertStats = db.prepare(`
  INSERT INTO match_stats
    (match_id, possession_home, possession_away, shots_home, shots_away, on_target_home,
     on_target_away, fouls_home, fouls_away, yellow_home, yellow_away, red_home, red_away)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertEvent = db.prepare(`
  INSERT INTO match_events (match_id, team_id, player_name, type, minute)
  VALUES (?, ?, ?, ?, ?)
`);
const insertStanding = db.prepare(`
  INSERT INTO standings
    (league_id, team_id, rank, played, won, drawn, lost, goals_for, goals_against, points, form)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function wipeData() {
  db.exec('BEGIN');
  try {
    for (const table of ['match_events', 'match_stats', 'standings', 'matches', 'players', 'teams', 'leagues']) {
      db.exec(`DELETE FROM ${table};`);
    }
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('match_events','standings','matches','players','teams','leagues');");
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/* ── kickoff date/time helpers ─────────────────────────────────── */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

/** A date offset from `base` (in days) at the given minute of the day. */
function dateAt(base, dayOffset, minutes) {
  const date = new Date(base);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(0, 0, 0, 0);
  date.setMinutes(minutes);
  return date;
}

function seed() {
  const now = new Date();
  let stadiumCounter = 0;
  let totalMatches = 0;
  let totalGoals = 0;

  db.exec('BEGIN');
  try {
    for (const [key, leagueMeta] of Object.entries(LEAGUES)) {
      const leagueId = Number(insertLeague.run(
        key, leagueMeta.name, leagueMeta.icon, leagueMeta.sub, '2025/26', 0, 0, 0
      ).lastInsertRowid);

      const teams = teamPools[key].map((name) => {
        const id = Number(insertTeam.run(leagueId, name, logoFor(name)).lastInsertRowid);
        const roster = buildRoster(id);
        roster.forEach((p) => {
          insertPlayer.run(p.teamId, p.name, p.position, p.rating, p.isStarter, p.statLine);
        });
        return { id, name, roster };
      });

      /* ── standings ── */
      const table = teams.map((team, index) => {
        const played = 25;
        const baseWins = 17 - Math.floor(index * 0.55);
        const won = Math.max(6, Math.min(19, baseWins + randInt(-3, 3)));
        const drawn = randInt(1, Math.max(1, played - won));
        const lost = played - won - drawn;
        const goalsFor = won * 2 + drawn + randInt(0, 8);
        const goalsAgainst = lost * 2 + randInt(2, 10);
        return {
          team,
          played,
          won,
          drawn,
          lost,
          goalsFor,
          goalsAgainst,
          points: won * 3 + drawn,
          form: Array.from({ length: 5 }, () => pick(['W', 'W', 'D', 'L'])).join(',')
        };
      });

      table.sort((a, b) =>
        b.points - a.points ||
        (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) ||
        b.goalsFor - a.goalsFor
      );

      table.forEach((row, index) => {
        insertStanding.run(
          leagueId, row.team.id, index + 1, row.played, row.won, row.drawn, row.lost,
          row.goalsFor, row.goalsAgainst, row.points, row.form
        );
      });

      /* ── matches: 15 live, 10 upcoming, 5 finished ── */
      const seasonStats = { matches: 0, played: 0, goals: 0 };

      const addMatch = (status, homeTeam, awayTeam, homeScore, awayScore, kickoff, referee) => {
        const venue = stadiumList[stadiumCounter % stadiumList.length];
        stadiumCounter += 1;

        const dayLabel = dayLabelOf(kickoff);
        const timeLabel = status === 'live' ? `${randInt(10, 85)}'` : status === 'finished' ? 'FT' : timeLabelOf(kickoff);

        const matchId = Number(insertMatch.run(
          leagueId, `${key}_${status}_${seasonStats.matches + 1}`, dayLabel, timeLabel, status,
          homeTeam.id, awayTeam.id, homeScore, awayScore, venue, referee, isoLocal(kickoff)
        ).lastInsertRowid);

        seasonStats.matches += 1;
        if (status !== 'upcoming') seasonStats.played += 1;
        totalMatches += 1;
        seasonStats.goals += homeScore + awayScore;
        totalGoals += homeScore + awayScore;

        const live = status === 'live';
        const finished = status === 'finished';
        const homePossession = live ? randInt(46, 60) : 50;
        const yellowHome = live ? randInt(0, 3) : finished ? randInt(0, 3) : 0;
        const yellowAway = live ? randInt(0, 3) : finished ? randInt(0, 3) : 0;
        const redHome = 0;
        const redAway = finished && Math.random() < 0.2 ? 1 : 0;

        insertStats.run(
          matchId,
          homePossession,
          100 - homePossession,
          live ? randInt(8, 18) : finished ? randInt(8, 16) : 0,
          live ? randInt(5, 15) : finished ? randInt(8, 16) : 0,
          live ? randInt(2, 8) : finished ? randInt(2, 7) : 0,
          live ? randInt(1, 6) : finished ? randInt(2, 7) : 0,
          live ? randInt(5, 14) : finished ? randInt(7, 13) : 0,
          live ? randInt(5, 14) : finished ? randInt(7, 13) : 0,
          yellowHome,
          yellowAway,
          redHome,
          redAway
        );

        const events = buildGoals(matchId, homeTeam, awayTeam, homeScore, awayScore)
          .concat(buildCards(matchId, homeTeam, yellowHome, redHome))
          .concat(buildCards(matchId, awayTeam, yellowAway, redAway));

        events.forEach((event) => {
          insertEvent.run(event.matchId, event.teamId, event.playerName, event.type, event.minute);
        });
      };

      for (let i = 0; i < 15; i++) {
        const homeTeam = teams[i % 20];
        let awayTeam = teams[(i + 7) % 20];
        if (homeTeam === awayTeam) awayTeam = teams[(i + 1) % 20];
        // Live matches all kicked off today, at different times in the recent past.
        const kickoff = new Date(now.getTime() - (15 + i * 8) * 60000);
        addMatch('live', homeTeam, awayTeam, liveScore(), liveScore(), kickoff, 'J. Martinez');
      }

      for (let i = 0; i < 10; i++) {
        const homeTeam = teams[(i + 3) % 20];
        let awayTeam = teams[(i + 12) % 20];
        if (homeTeam === awayTeam) awayTeam = teams[(i + 2) % 20];
        // Upcoming fixtures spread over the next five days, each with its own time.
        const kickoff = dateAt(now, 1 + (i % 5), 12 * 60 + i * 45);
        addMatch('upcoming', homeTeam, awayTeam, 0, 0, kickoff, 'TBD');
      }

      for (let i = 0; i < 5; i++) {
        const homeTeam = teams[(i + 5) % 20];
        let awayTeam = teams[(i + 15) % 20];
        if (homeTeam === awayTeam) awayTeam = teams[(i + 4) % 20];
        // Finished matches were played on the previous three days.
        const kickoff = dateAt(now, -1 - (i % 3), 14 * 60 + i * 30);
        addMatch('finished', homeTeam, awayTeam, finishedScore(), finishedScore(), kickoff, 'A. Taylor');
      }

      // Banner shows whole-season figures while the DB stores a 30-match snapshot.
      const avg = seasonStats.played ? seasonStats.goals / seasonStats.played : 0;
      const seasonMatches = 380;
      db.prepare('UPDATE leagues SET total_matches = ?, total_goals = ?, avg_goals = ? WHERE id = ?')
        .run(seasonMatches, Math.round(avg * seasonMatches), Number(avg.toFixed(2)), leagueId);
    }

    db.prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)')
      .run('simulation_enabled', 'true');

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  console.log(`Seeded ${Object.keys(LEAGUES).length} leagues, ${totalMatches} matches, ${totalGoals} goals.`);
  console.log(`Database: ${db.DB_PATH}`);
}

const existing = db.prepare('SELECT COUNT(*) AS count FROM leagues').get();

if (process.argv.includes('--reset')) {
  wipeData();
  seed();
} else if (existing.count > 0) {
  console.log(`Database already contains ${existing.count} leagues. Use "npm run reset" to re-seed.`);
} else {
  seed();
}

/* ── admin account ─────────────────────────────────────────────── */

function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@foothub.com').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const user = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);

  if (user) {
    if (user.role !== 'admin') db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
    return;
  }

  db.prepare("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'admin')")
    .run('FootHub Admin', email, hashPassword(password));

  console.log(`Admin account created: ${email} / ${password} (change it after first login)`);
}

ensureAdmin();

