# ⚽ FootHub — Live Football Scores, Fixtures & Standings

FootHub is a football match center for fans who want one place to follow **live scores**,
**fixtures**, **league tables**, **lineups**, and **match events** — and for anyone who wants to
create and manage their own match.

Everything is served from a local **Node.js + Express** server with a **SQLite** database, so
there is no external database to install and no frontend build step.

For stakeholders, requirements, and the full architecture, see
[`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md).

---

## Quick start

**Requirements:** Node.js **22.5 or newer** (the project uses the built-in `node:sqlite` module).

```bash
npm install
npm start
```

Open <http://localhost:3000>.

The first start creates `data/foothub.db` and fills it with 7 leagues, teams, squads, fixtures,
standings, and an admin account. Nothing else is required.

### Demo admin account

| Email              | Password   |
| ------------------ | ---------- |
| `admin@foothub.com` | `admin123` |

> Change this password before using FootHub outside your own machine. You can override the
> seeded credentials with `ADMIN_EMAIL` and `ADMIN_PASSWORD` (see [Configuration](#configuration)).

---

## What you can do

### Follow the action

- Browse **7 competitions**, each with its official logo:
  La Liga, Premier League, Champions League, Bundesliga, Serie A, Ligue 1, and World Cup 2026.
- Filter matches by **All**, **Live**, **Upcoming**, or **Finished**.
- See live scores, current match time, goal scorers, venue, and kickoff date/time on every card.
- Open any match for the full picture:
  - match statistics (possession, shots, fouls, cards)
  - the goal/card timeline
  - both squads with player names and positions
  - **Performance ratings** for live and finished matches
- Switch to **Standings** for the full league table (P/W/D/L, goals, points, and form).

### Create your own match

Any logged-in user can create a fixture from the current league:

1. Open a league tab and choose **Create Match**.
2. Pick the home and away teams.
3. Choose the **match date** and **kickoff time**.
4. Add the venue, referee, and whether the match is **Upcoming** or **Live**.
5. Create it — your new match appears **first** in the matching Live or Upcoming list.

New fixtures are saved to the database and are visible to every visitor.

### Manage your matches

For a match you created, the **Manage** button lets you:

- set the match to **Upcoming**, **Live**, or **Finished**
- add goals, yellow cards, and red cards with the player name and minute
- remove events
- see the score and timeline update immediately

A finished match must be reopened before events can be added or removed. Scores for custom
matches are recalculated from their goal events automatically.

### Your account

- Register with your name, email, a **favourite club** dropdown, and a password.
- Show/hide passwords with the eye button.
- Forgot your password? Request a **6-digit email code**, then set a new password.
- Delete your own account by confirming your password. Your created matches are removed too.
- The admin account cannot be deleted.

### Automatic match completion

Every **live** match automatically becomes **finished** after **90 minutes**. Its status changes
to `FT` and it moves to the Finished section without any manual action.

For testing, shorten the duration with the `MATCH_DURATION_MS` environment variable (for example,
`MATCH_DURATION_MS=120000` for two minutes).

---

## Admin guide

Log in with the admin account to unlock the admin-only tools:

- **Admin Panel** — total users, admins, matches, custom matches, and events; a list of every
  registered user with their name, email, role, join date, and match count.
- **View matches** — see a user's created fixtures across leagues, open one, or delete it.
- **Manage any match** — edit events and change the status of official seeded fixtures too.
- **Delete any match** — remove a user-created or official match from the match card actions.
- **Live simulation toggle** — turn the demo live-scoring simulation on or off. While enabled,
  official live matches can gain simulated goals every few seconds.

Regular users only see Manage on their own matches and never see admin-only controls.

---

## Tech stack

| Layer            | Technology                              | Notes                                                        |
| ---------------- | --------------------------------------- | ------------------------------------------------------------ |
| Frontend         | HTML5, CSS3, vanilla JavaScript         | Single-page UI in `index.html` + `public/app.js`; no framework or build step |
| Fonts & icons    | Google Fonts, Font Awesome 6            | Barlow Condensed, Inter, and Font Awesome from CDNs          |
| Backend          | Node.js ≥ 22.5, Express 4               | REST API, static file serving, auth middleware               |
| Database         | SQLite via Node's built-in `node:sqlite` | File database at `data/foothub.db`; WAL mode and foreign keys |
| Authentication   | `crypto.scryptSync` + per-user salt     | Passwords are never stored in plain text                     |
| Sessions         | Random bearer tokens                    | Tokens stored in the `sessions` table and `localStorage`     |
| Password reset   | HMAC-hashed 6-digit OTP                 | 10-minute expiry, 5 attempts, 60-second cooldown             |
| Email            | Nodemailer                              | Optional SMTP/Gmail delivery with a local dev-code fallback  |
| Assets           | Local PNG league logos                  | Served from `public/league-logos/`                           |
| Tooling          | npm scripts, `node --watch`             | No bundler, transpiler, or test framework required           |

### Architecture at a glance

```text
Browser (index.html + public/app.js)
        │  fetch /api/*
        ▼
Express server (server/index.js)
        │
        ├── auth + roles + password reset
        ├── match / league / standings API
        ├── live simulation + 90-minute auto-finish
        ▼
SQLite database (data/foothub.db)
```

---

## Configuration

All settings are optional and can be provided as environment variables before `npm start`.

| Variable               | Default                  | Purpose                                                        |
| ---------------------- | ------------------------ | -------------------------------------------------------------- |
| `PORT`                 | `3000`                   | HTTP port                                                      |
| `DB_PATH`              | `data/foothub.db`        | SQLite database file location                                  |
| `ADMIN_EMAIL`          | `admin@foothub.com`      | Email address for the seeded admin account                     |
| `ADMIN_PASSWORD`       | `admin123`               | Password for the seeded admin account                          |
| `MATCH_DURATION_MS`    | `5400000` (90 minutes)   | How long a live match stays live before auto-finishing         |
| `SMTP_HOST`            | —                        | SMTP server, e.g. `smtp.gmail.com`                             |
| `SMTP_PORT`            | `465`                    | SMTP port                                                      |
| `SMTP_SECURE`          | `true` when port is 465  | Use TLS                                                        |
| `SMTP_USER`            | —                        | SMTP login / sender address                                    |
| `SMTP_PASS`            | —                        | SMTP password or Gmail app password                            |
| `MAIL_FROM`            | `SMTP_USER`              | From address shown in reset emails                             |
| `PASSWORD_RESET_SECRET`| random per restart       | Stable HMAC key for reset codes; set it in production          |

PowerShell example:

```powershell
$env:PORT = '4000'
$env:ADMIN_PASSWORD = 'change-me'
$env:MATCH_DURATION_MS = '120000'
npm start
```

### Password reset email

To send real reset codes through Gmail, use a Google **App Password**
(Google Account → Security → 2-Step Verification → App passwords):

```powershell
$env:SMTP_HOST = 'smtp.gmail.com'
$env:SMTP_PORT = '465'
$env:SMTP_SECURE = 'true'
$env:SMTP_USER = 'your.address@gmail.com'
$env:SMTP_PASS = 'your-16-character-app-password'
npm start
```

Without SMTP settings, the server prints the reset code to the console and the reset screen shows
it as a demo code, so the flow still works locally.

---

## Scripts

| Command          | What it does                                               |
| ---------------- | ---------------------------------------------------------- |
| `npm start`      | Start the website + API on port 3000                       |
| `npm run dev`    | Start with `--watch` and restart automatically on changes  |
| `npm run seed`   | Seed the database only if it is empty                      |
| `npm run reset`  | Wipe league/match data and reseed (keeps user accounts)    |

`npm run reset` is useful when you want fresh demo fixtures without losing registered users.

---

## Project structure

```text
index.html               Frontend markup and styles
public/app.js            Frontend logic and API calls
public/league-logos/     Official league logo PNGs
server/index.js          Express app, REST API, auth, simulation, auto-finish
server/db.js             SQLite connection, schema bootstrap, migrations
server/schema.sql        Tables, indexes, and constraints
server/seed.js           Demo league/match data and admin account
server/password.js       scrypt password hashing and verification
server/mailer.js         Optional SMTP/Gmail OTP mailer
server/league-logos.js   League logo path map
data/foothub.db          Runtime SQLite database (git-ignored)
```

---

## For developers: API overview

| Method | Endpoint                             | Auth   | Description                                      |
| ------ | ------------------------------------ | ------ | ------------------------------------------------ |
| GET    | `/api/health`                        | —      | Health check                                     |
| GET    | `/api/leagues`                       | —      | List leagues and banner stats                    |
| GET    | `/api/clubs`                         | —      | All clubs, used by the registration dropdown     |
| GET    | `/api/leagues/:key`                  | —      | One league with teams, matches, and standings    |
| GET    | `/api/leagues/:key/matches`          | —      | Matches; optional `?status=` and `?q=`           |
| GET    | `/api/leagues/:key/standings`        | —      | League table                                     |
| POST   | `/api/leagues/:key/matches`          | user   | Create a match in that league                    |
| GET    | `/api/matches/:id`                   | —      | Match detail: stats, squads, events, timeline    |
| POST   | `/api/matches/:id/events`            | owner  | Add `{ type, teamId, playerName, minute }`       |
| DELETE | `/api/matches/:id/events/:eventId`   | owner  | Remove one event                                 |
| PATCH  | `/api/matches/:id/status`            | owner  | `{ "status": "upcoming" \| "live" \| "finished" }` |
| DELETE | `/api/matches/:id`                   | admin  | Delete any match                                 |
| GET    | `/api/admin/users`                   | admin  | Dashboard totals and every registered user       |
| GET    | `/api/admin/users/:id/matches`       | admin  | One user's created matches across all leagues    |
| GET    | `/api/simulation`                    | admin  | Whether the live simulator is running            |
| POST   | `/api/simulation`                    | admin  | `{ "enabled": true/false }`                      |
| POST   | `/api/auth/register`                 | —      | `{ fullName, email, password, favouriteClub? }` → token |
| POST   | `/api/auth/login`                    | —      | `{ email, password }` → token                    |
| POST   | `/api/auth/forgot`                   | —      | `{ email }` → send a 6-digit reset code          |
| POST   | `/api/auth/reset`                    | —      | `{ email, otp, password }` → set a new password  |
| GET    | `/api/auth/me`                       | user   | Current user (`Authorization: Bearer <token>`)   |
| POST   | `/api/auth/logout`                   | —      | Invalidate the current token                     |
| DELETE | `/api/auth/me`                       | user   | `{ password }` → delete own account and matches  |

**Owner** means the user who created the match. Admins may act on any match, including official
seeded fixtures.

### Database tables

| Table             | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `leagues`         | League metadata and banner statistics                                |
| `teams`           | Teams with logo URLs                                                 |
| `players`         | 15-player squads per team                                            |
| `matches`         | Fixtures, status, scores, kickoff, and live-start timestamp          |
| `match_stats`     | Possession, shots, fouls, and card totals per match                  |
| `match_events`    | Goals and cards with player and minute                               |
| `standings`       | P/W/D/L, goals, points, and form                                     |
| `users`           | Accounts with role, favourites, and scrypt password hashes           |
| `sessions`        | Bearer tokens for logged-in users                                    |
| `password_resets` | HMAC-hashed 6-digit reset codes with expiry and attempt count         |
| `app_state`       | Persisted simulation on/off flag                                     |

`server/db.js` upgrades older databases automatically, including `users.role`, favourite fields,
`matches.created_by`, and `matches.live_started_at`.

---

## Troubleshooting

| Problem                          | Fix                                                                    |
| -------------------------------- | ---------------------------------------------------------------------- |
| `node:sqlite` cannot be found    | Upgrade to Node.js 22.5 or newer                                       |
| Port 3000 is already in use      | Start with a different port: `$env:PORT=4000; npm start`               |
| Login works but data looks stale | Restart the server, then reload the page                               |
| Reset email never arrives        | Configure SMTP/Gmail app password, or use the demo code shown locally  |
| Need fresh demo fixtures         | Run `npm run reset` (user accounts are kept)                           |
| Want to test auto-finish quickly | Start with `$env:MATCH_DURATION_MS='120000'; npm start`                |

For production, always change the default admin password, set `PASSWORD_RESET_SECRET`, and use a
real SMTP account.

---

## বাংলায় সংক্ষেপে

১. `npm install` দিন (একবারই লাগবে)।
২. `npm start` দিয়ে সার্ভার চালু করুন, তারপর <http://localhost:3000> খুলুন।
৩. উপরের লিগ ট্যাব থেকে La Liga, Premier League, Champions League, Bundesliga, Serie A,
   Ligue 1 বা World Cup 2026 বেছে নিন।
৪. **All / Live / Upcoming / Finished** ফিল্টার দিয়ে ম্যাচ দেখুন; ম্যাচে ক্লিক করলে স্কোর,
   ইভেন্ট, লাইনআপ ও পারফরম্যান্স রেটিং দেখা যাবে।
৫. অ্যাডমিন লগইন: `admin@foothub.com` / `admin123` — অ্যাডমিন যেকোনো ম্যাচ ম্যানেজ বা
   ডিলিট করতে পারে, Admin Panel-এ সব ইউজার দেখতে পারে এবং লাইভ সিমুলেশন চালু/বন্ধ করতে পারে।
৬. লগইন করা যেকোনো ইউজার নিজের ম্যাচ তৈরি করতে পারে — তারিখ, কিকঅফ সময়, ভেন্যু, রেফারি
   এবং Upcoming/Live স্ট্যাটাস দিয়ে। নতুন ম্যাচ Live বা Upcoming তালিকার সবার আগে আসে।
৭. নিজের ম্যাচে গোল, হলুদ ও লাল কার্ড (খেলোয়াড়ের নাম ও মিনিটসহ) যোগ বা মুছে ফেলা যায়।
৮. প্রতিটি Live ম্যাচ **৯০ মিনিট** পর স্বয়ংক্রিয়ভাবে Finished হয়ে `FT` দেখায়।
   টেস্টের জন্য `MATCH_DURATION_MS` দিয়ে সময় কমানো যায়।
৯. রেজিস্ট্রেশনে নাম, ইমেইল, ফেভারিট ক্লাব (ড্রপডাউন) ও পাসওয়ার্ড দিতে হবে।
১০. পাসওয়ার্ড ভুলে গেলে **Forgot password?** থেকে ৬ ডিজিটের OTP নিয়ে পাসওয়ার্ড রিসেট করুন।
    SMTP সেট না থাকলে ডেমো কোড স্ক্রিনে ও সার্ভার কনসোলে দেখাবে।
১১. **Delete Account** দিয়ে পাসওয়ার্ড দিয়ে নিজের অ্যাকাউন্ট ও নিজের ম্যাচগুলো মুছে ফেলা যায়।
