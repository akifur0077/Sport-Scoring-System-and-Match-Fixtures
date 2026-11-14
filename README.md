# FootHub — Live Scores, Fixtures & Standings

Interactive football center: live scores, fixtures, league tables, match lineups and user
accounts. The frontend is a single `index.html`; all data now lives in a **SQLite** database
behind a **Node.js + Express** REST API instead of being generated randomly in the browser.

## Requirements

- Node.js **22.5 or newer** (uses the built-in `node:sqlite` module)
- No separate database server needed — SQLite file is created automatically

## Run

```bash
npm install
npm start
```

Open <http://localhost:3000>.

The first start creates `data/foothub.db` and seeds 7 leagues (La Liga, Premier League,
Champions League, Bundesliga, Serie A, Ligue 1, World Cup) with 20 teams, 30 matches and
20-row standings each, plus 15 players per squad.

### Scripts

| Command          | What it does                                            |
| ---------------- | ------------------------------------------------------- |
| `npm start`      | Start the API + website on port 3000                    |
| `npm run dev`    | Start with `--watch` (auto restart on changes)          |
| `npm run seed`   | Seed only if the database is empty                      |
| `npm run reset`  | Wipe league/match data and reseed (keeps user accounts) |

Set a custom port with `PORT=4000 npm start` (PowerShell: `$env:PORT=4000; npm start`) and a
custom database file with `DB_PATH=...`.

## Roles & accounts

The app has two roles, stored in `users.role`:

| Role    | Can do                                                                                      |
| ------- | ------------------------------------------------------------------------------------------- |
| `user`  | Create a match in any league, manage goals/cards in **their own** matches, browse everything |
| `admin` | Everything a user can do, plus toggle the live simulation and delete user-created matches   |

An admin account is created automatically on startup:

- Email: `admin@foothub.com`
- Password: `admin123`

Override with `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables (PowerShell:
`$env:ADMIN_PASSWORD='new-secret'; npm start`). Existing accounts with that email are promoted
to admin on startup.

### Who sees what

- **Live simulation toggle** — visible only to a logged-in admin.
- **Create Match button** — visible to any logged-in user; opens a form for the current league
  (home/away team, day, kickoff, venue, referee, upcoming/live).
- **Manage button** — shown on user-created matches to the owner (and admins); lets the owner
  set the status and record goals, yellow cards and red cards with player name and minute.
- **Delete button** — shown only to admins, and only on user-created matches.

Official (seeded) matches have `matches.created_by = NULL`, cannot be edited and cannot be
deleted. A match must not be `finished` while adding/removing events; reopen it first.

## Project structure

```
index.html            Frontend markup + styles (loads /app.js)
public/app.js         Frontend logic, calls the REST API
server/schema.sql     Database schema (tables, indexes, constraints)
server/db.js          SQLite connection, schema bootstrap and migrations
server/password.js    scrypt password hashing / verification
server/seed.js        Generates demo season data + ensures the admin account
server/index.js       Express server, REST API, auth, live simulation
data/foothub.db       SQLite database (created at runtime, git-ignored)
```

## Database schema

| Table          | Purpose                                                              |
| -------------- | -------------------------------------------------------------------- |
| `leagues`      | League metadata and season banner stats                              |
| `teams`        | 20 teams per league with logo URLs                                   |
| `players`      | 15-player squads (11 starters + 4 subs) per team                     |
| `matches`      | Fixtures; `status` live/upcoming/finished, `created_by` is the owner |
| `match_stats`  | Possession, shots, fouls (1:1 with a match)                          |
| `match_events` | Goals and cards: `type` = `goal` / `yellow` / `red`, player, minute   |
| `standings`    | League table rows: P/W/D/L, GF/GA, points, form                      |
| `users`        | Accounts with `role` (`admin`/`user`), scrypt-hashed passwords        |
| `sessions`     | Bearer tokens for logged-in users                                    |
| `app_state`    | Persisted simulation on/off flag                                     |

All child tables use `ON DELETE CASCADE` on their parent league / match / team rows.
`server/db.js` upgrades older databases automatically (`users.role` and `matches.created_by`
columns are added, and a legacy `goals` table is migrated into `match_events`).

## API

| Method | Endpoint                             | Auth   | Description                                      |
| ------ | ------------------------------------ | ------ | ------------------------------------------------ |
| GET    | `/api/health`                        | —      | Health check                                     |
| GET    | `/api/leagues`                       | —      | List leagues + banner stats                      |
| GET    | `/api/leagues/:key`                  | —      | One league with teams, matches and standings     |
| GET    | `/api/leagues/:key/matches`          | —      | Matches; optional `?status=` and `?q=`           |
| GET    | `/api/leagues/:key/standings`        | —      | League table                                     |
| POST   | `/api/leagues/:key/matches`          | user   | Create a match in that league                    |
| GET    | `/api/matches/:id`                   | —      | Match detail: stats, squads, events, timeline    |
| POST   | `/api/matches/:id/events`            | owner  | Add `{ type, teamId, playerName, minute }`       |
| DELETE | `/api/matches/:id/events/:eventId`   | owner  | Remove one event                                 |
| PATCH  | `/api/matches/:id/status`            | owner  | `{ "status": "upcoming" \| "live" \| "finished" }` |
| DELETE | `/api/matches/:id`                   | admin  | Delete a **user-created** match                  |
| GET    | `/api/simulation`                    | admin  | Is the live simulator running?                   |
| POST   | `/api/simulation`                    | admin  | `{ "enabled": true/false }`                      |
| POST   | `/api/auth/register`                 | —      | `{ fullName, email, password }` → token          |
| POST   | `/api/auth/login`                    | —      | `{ email, password }` → token                    |
| GET    | `/api/auth/me`                       | user   | Current user (`Authorization: Bearer <token>`)    |
| POST   | `/api/auth/logout`                   | —      | Invalidate the current token                     |

"owner" means the user who created the match (admins may also act on it). Official matches
return `403` for event/status edits, and only admins can delete a custom match.

Live scores for official matches are advanced by the server every 4 seconds (1% chance per
live match, capped at 10 goals a game) **only while the admin-controlled simulation flag is
on**. Each goal is written to `match_events`, so score, scorer list and timeline stay in sync
across page reloads and are shared by every visitor. Scores of custom matches are recalculated
from their goal events whenever a goal is added or removed.

## Notes

- Passwords are hashed with `crypto.scryptSync` and a per-user salt; plain passwords are
  never stored.
- Sessions are random 32-byte tokens kept in the `sessions` table.
- `data/*.db` is git-ignored. Run `npm run reset` any time to rebuild the demo data; it keeps
  user accounts (including the admin account).

---

### বাংলায় সংক্ষেপে

১. `npm install` দিন (একবারই লাগবে)।
২. `npm start` দিয়ে সার্ভার চালু করুন, তারপর `http://localhost:3000` খুলুন।
৩. সব ম্যাচ, পয়েন্ট টেবিল, লাইনআপ ও লগইন এখন SQLite ডেটাবেস থেকে আসে।
৪. ডেমো ডেটা নতুন করে বানাতে `npm run reset` চালান (ইউজার অ্যাকাউন্ট মুছে যাবে না)।
৫. অ্যাডমিন লগইন: `admin@foothub.com` / `admin123` — শুধু অ্যাডমিন লাইভ সিমুলেশন চালু/বন্ধ
   করতে পারে এবং ইউজারের তৈরি ম্যাচ ডিলিট করতে পারে।
৬. লগইন করা যেকোনো ইউজার প্রতিটি লিগে (La Liga, Premier League, Champions League,
   Bundesliga, Serie A, Ligue 1, World Cup) নিজের ম্যাচ তৈরি করতে পারে এবং সেই ম্যাচে গোল,
   হলুদ ও লাল কার্ড (খেলোয়াড়ের নাম ও মিনিটসহ) যোগ/মুছে ফেলতে পারে।
