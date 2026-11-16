# FootHub — Project Specification

This document describes FootHub from a project-management and system-design point of view:
stakeholders, functional requirements, non-functional requirements, and the technical architecture.

---

## 1. Project overview

**FootHub** is a football match-center web application. It lets visitors follow live scores,
fixtures, league tables, lineups, and match events, and lets registered users create and manage
their own fixtures.

The system is delivered as a **single Node.js process**:

- a static single-page frontend (`index.html` + `public/app.js`)
- an Express REST API
- a local SQLite database (`data/foothub.db`)

There is no separate database server, frontend build pipeline, or external live-data dependency.

### Scope

**In scope**

- Public browsing of leagues, matches, standings, lineups, and match statistics
- User registration, login, session handling, password reset, and account deletion
- User-created fixtures with date, time, venue, referee, and status
- Match event management (goals, yellow cards, red cards)
- Admin user overview, match management, and match deletion
- Admin-controlled live-score simulation
- Automatic match completion after 90 minutes
- Local persistence, seeding, and schema migrations
- Local league logo assets

**Out of scope**

- Real-time data feeds from official football providers
- Payments, ticketing, betting, or fantasy-league features
- Native mobile applications
- Multi-tenant or multi-server deployment
- Video streaming or live commentary

---

## 2. Stakeholders

| Stakeholder | Type | Main interest / needs | Interaction with FootHub |
| --- | --- | --- | --- |
| **Visitor / football fan** | Primary, external | Follow live scores, fixtures, tables, lineups, and match events without creating an account | Opens the website, switches leagues, filters matches, opens match details |
| **Registered user / match organizer** | Primary, external | Create and manage personal fixtures, keep an account, customize a favourite club | Registers, logs in, creates matches, adds/removes events, changes match status, deletes account |
| **Administrator** | Primary, internal | Moderate content, manage every match, monitor users, control the demo simulation | Uses Admin Panel, manages/deletes any match, toggles simulation |
| **Project owner / product owner** | Primary, internal | Ensure the product meets its purpose, prioritize features, approve releases | Defines requirements, reviews behaviour, approves changes |
| **Development team / maintainer** | Primary, internal | Build, maintain, debug, and extend the system | Works with the codebase, database, API, and documentation |
| **Deployment / hosting operator** | Secondary, internal | Run the server reliably, configure environment variables, back up data | Starts the Node process, sets `PORT`, `DB_PATH`, SMTP, and admin credentials |
| **Email service provider (Gmail/SMTP)** | Secondary, external | Deliver password-reset OTP emails | Receives SMTP requests from `server/mailer.js` |
| **League / club asset sources** | Secondary, external | Provide official league names and logo assets used by the catalogue | Assets are stored locally in `public/league-logos/`; no runtime API dependency |
| **Course instructor / evaluator** *(if used academically)* | Secondary, external | Assess requirements coverage, code quality, and architecture | Reviews documentation, UI, API, and database design |

### Stakeholder priorities

1. Visitors must be able to browse match information quickly and without friction.
2. Registered users must be able to create and manage their own matches safely.
3. Administrators must be able to correct or remove any content.
4. Passwords, accounts, and administrative actions must be protected.
5. The system must run locally with minimal setup and no external database.

---

## 3. Functional requirements

Functional requirements describe **what the system must do**.

### 3.1 Public browsing

| ID | Requirement | Actor |
| --- | --- | --- |
| FR-01 | The system shall display the list of supported leagues with official logos. | Visitor |
| FR-02 | The system shall display matches for the selected league, grouped by day. | Visitor |
| FR-03 | The system shall support filters for All, Live, Upcoming, and Finished matches. | Visitor |
| FR-04 | Each match card shall show teams, score/status, scorers, venue, and kickoff date/time. | Visitor |
| FR-05 | The system shall provide a match-detail view with overview statistics and a timeline. | Visitor |
| FR-06 | The match-detail view shall show both squads with player names and positions. | Visitor |
| FR-07 | The match-detail view shall show player performance ratings for live and finished matches. | Visitor |
| FR-08 | The system shall display league standings with P/W/D/L, goals, points, and form. | Visitor |
| FR-09 | Public match pages shall not expose admin-only simulation controls. | Visitor |

### 3.2 Account management

| ID | Requirement | Actor |
| --- | --- | --- |
| FR-10 | A visitor shall be able to register with full name, email, favourite club, password, and terms acceptance. | Visitor |
| FR-11 | The favourite club field shall be a dropdown populated from the supported clubs. | Visitor |
| FR-12 | The system shall reject duplicate email addresses and invalid registration input. | System |
| FR-13 | A registered user shall be able to log in with email and password. | User |
| FR-14 | The system shall keep users logged in using a bearer token stored on the client. | System |
| FR-15 | A user shall be able to log out, invalidating the current session token. | User |
| FR-16 | A user shall be able to request a 6-digit password-reset code by email. | User |
| FR-17 | Reset codes shall expire after 10 minutes, allow 5 attempts, and respect a 60-second resend cooldown. | System |
| FR-18 | A user shall be able to set a new password using a valid reset code. | User |
| FR-19 | A user shall be able to delete their own account by confirming their password. | User |
| FR-20 | The administrator account shall not be deletable through the self-deletion flow. | System |
| FR-21 | The UI shall show an error message when authentication, registration, or reset fails. | System |

### 3.3 User-created matches

| ID | Requirement | Actor |
| --- | --- | --- |
| FR-22 | A logged-in user shall be able to create a match in any league. | User |
| FR-23 | The create form shall collect home team, away team, match date, kickoff time, venue, referee, and status (Upcoming/Live). | User |
| FR-24 | The system shall reject matches where the two teams are the same or do not belong to the selected league. | System |
| FR-25 | A newly created match shall appear first in its Live or Upcoming group. | System |
| FR-26 | A user shall be able to manage only matches they created. | User |
| FR-27 | The owner shall be able to change a match to Upcoming, Live, or Finished. | User |
| FR-28 | The owner shall be able to add goals, yellow cards, and red cards with player name and minute. | User |
| FR-29 | The owner shall be able to remove recorded events. | User |
| FR-30 | The score of a custom match shall be recalculated from its goal events. | System |
| FR-31 | A finished match shall reject new events until it is reopened. | System |
| FR-32 | Starting a match (status Live) shall start its automatic 90-minute timer. | System |

### 3.4 Administration

| ID | Requirement | Actor |
| --- | --- | --- |
| FR-33 | The system shall provide an admin-only dashboard with totals for users, admins, matches, custom matches, and events. | Admin |
| FR-34 | The admin dashboard shall list every registered user with name, email, role, join date, and match count. | Admin |
| FR-35 | An admin shall be able to view a selected user's created matches across leagues. | Admin |
| FR-36 | An admin shall be able to manage any match, including official seeded matches. | Admin |
| FR-37 | An admin shall be able to delete any match, including official seeded matches. | Admin |
| FR-38 | An admin shall be able to turn the live-score simulation on or off. | Admin |
| FR-39 | Admin-only controls and endpoints shall be hidden from regular users and protected on the server. | System |

### 3.5 Automatic behaviour and data lifecycle

| ID | Requirement | Actor |
| --- | --- | --- |
| FR-40 | While simulation is enabled, official live matches shall occasionally receive simulated goals and stat/clock updates. | System |
| FR-41 | Every live match shall automatically become Finished after 90 minutes by default. | System |
| FR-42 | The auto-finish duration shall be configurable through `MATCH_DURATION_MS` for testing. | Operator |
| FR-43 | Auto-finish shall work independently of the simulation toggle. | System |
| FR-44 | The system shall persist all data in SQLite and restore it after a restart. | System |
| FR-45 | The system shall seed demo leagues, teams, players, matches, standings, and an admin account on first run. | System |
| FR-46 | The system shall upgrade older databases automatically where schema changes are required. | System |
| FR-47 | The system shall expose a health endpoint for basic runtime checks. | Operator |

---

## 4. Non-functional requirements

Non-functional requirements describe **how well** the system must behave.

| ID | Category | Requirement | Current implementation |
| --- | --- | --- | --- |
| NFR-01 | Performance | Pages and API responses should feel fast on a local machine. | Static frontend, prepared SQLite statements, indexes on frequent lookups, no build step |
| NFR-02 | Performance | Live data should refresh without a manual page reload. | League payload polled every 4 seconds while the Matches view is open |
| NFR-03 | Scalability | The system should support a small-to-medium demo deployment. | Single Node process + SQLite; not designed for horizontal scaling |
| NFR-04 | Availability | Match completion should not depend on the simulation toggle. | Separate auto-finish interval runs continuously |
| NFR-05 | Reliability | Database writes for events should be atomic. | `BEGIN` / `COMMIT` / `ROLLBACK` transactions around event changes |
| NFR-06 | Reliability | Data should survive restarts. | File-backed SQLite database in WAL mode |
| NFR-07 | Data integrity | Invalid references and invalid enum values should be rejected. | Foreign keys, `CHECK` constraints, `UNIQUE` constraints, cascading deletes |
| NFR-08 | Security | Passwords must never be stored in plain text. | `crypto.scryptSync` with per-user salt |
| NFR-09 | Security | Sessions must be revocable and tied to a user. | Random 32-byte bearer tokens stored in the `sessions` table |
| NFR-10 | Security | Password-reset codes must be limited in time and attempts. | HMAC-hashed OTP, 10-minute TTL, 5 attempts, 60-second cooldown |
| NFR-11 | Security | Users must not manage other users' matches. | Owner checks in event and status endpoints |
| NFR-12 | Security | Admin actions must be protected server-side, not only hidden in the UI. | `requireAdmin` middleware and role checks |
| NFR-13 | Security | API responses containing user data should not be cached by browsers/proxies. | `Cache-Control: no-store` on `/api` |
| NFR-14 | Usability | The interface should be understandable without training. | League tabs, status filters, clear buttons, modals, confirmation prompts |
| NFR-15 | Usability | The layout should work on desktop and smaller screens. | Responsive CSS with flexible grids and media queries |
| NFR-16 | Usability | Destructive actions should require confirmation. | Confirmation prompts for deleting matches/events/accounts |
| NFR-17 | Accessibility | Forms should have visible labels and sensible control names. | Labels, `aria-label` on icon-only/select controls, keyboard-friendly native controls |
| NFR-18 | Maintainability | Code should be organized by responsibility. | Separate frontend, server, schema, seed, password, mailer, and logo modules |
| NFR-19 | Maintainability | Common development tasks should be scripted. | `npm start`, `npm run dev`, `npm run seed`, `npm run reset` |
| NFR-20 | Portability | The project should run without an external database service. | Built-in `node:sqlite`; database file created on first run |
| NFR-21 | Compatibility | The project should run on current Node.js and modern browsers. | Node.js ≥ 22.5; standards-based HTML/CSS/JS |
| NFR-22 | Privacy | Only necessary personal data should be stored. | Name, email, role, favourite club, and account timestamps |
| NFR-23 | Observability | Operators should be able to confirm the server is alive. | `/api/health` plus console startup messages |
| NFR-24 | Recoverability | Demo data should be rebuildable without losing users. | `npm run reset` reseeds leagues/matches while keeping accounts |
| NFR-25 | Localization | The product should be usable for the current audience. | English UI with Bengali helper text/summary in documentation; not a full i18n system |
| NFR-26 | Testability | Core behaviour should be verifiable through the API. | REST endpoints return JSON and can be exercised independently of the UI |
| NFR-27 | Deployment simplicity | A new environment should require minimal setup. | `npm install` + `npm start`; no frontend build, no database server |

### Known limitations

- There is no automated test suite or CI pipeline yet.
- SQLite and a single Node process limit horizontal scalability.
- Live match data is seeded/simulated, not connected to official live feeds.
- Login, registration, and general API endpoints do not have full rate limiting.
- Accessibility has not been audited against WCAG.
- The UI is primarily English; Bengali appears only in selected messages and documentation.

---

## 5. Project architecture

### 5.1 Architectural style

FootHub follows a **client–server, three-tier architecture**:

1. **Presentation tier** — static HTML/CSS/JavaScript in the browser
2. **Application tier** — Express REST API and server-side business rules
3. **Data tier** — SQLite database file accessed through prepared statements

It is deployed as a **modular monolith**: one Node.js process serves both the static frontend and
the API.

```text
┌─────────────────────────────────────────────────────────────┐
│                        Browser (client)                     │
│                                                             │
│  index.html  ── layout, styles, modals                      │
│  public/app.js ── UI rendering, filters, fetch() calls      │
│  localStorage ── bearer token                               │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS/HTTP + JSON
                            │ Authorization: Bearer <token>
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Express application (Node.js)              │
│                                                             │
│  Static file serving                                        │
│  ├── index.html, /app.js, /league-logos/*                   │
│  ├── Auth middleware (requireAuth / requireAdmin)           │
│  ├── League, match, standings, club endpoints               │
│  ├── Admin endpoints                                        │
│  ├── Auth, OTP reset, account deletion                      │
│  ├── Presentation mappers (DB rows → API JSON)              │
│  ├── Simulation scheduler (every 4 seconds)                 │
│  └── Auto-finish scheduler (every 1–15 seconds)             │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────────┐   ┌─────────────────────────┐
│ SQLite database               │   │ Optional SMTP provider  │
│ data/foothub.db               │   │ Gmail / SMTP via        │
│ WAL mode, foreign keys        │   │ Nodemailer              │
│ 11 tables                     │   └─────────────────────────┘
└───────────────────────────────┘
```

### 5.2 Component responsibilities

| Component | Responsibility |
| --- | --- |
| `index.html` | Page structure, global CSS, modals, header, league tabs, filter controls, Font Awesome and Google Fonts |
| `public/app.js` | Client state, API calls, rendering, match detail tabs, create/manage flows, admin panel, auth UI |
| `server/index.js` | Express app, middleware, REST routes, validation, role checks, simulation, auto-finish, static serving |
| `server/db.js` | Opens/creates SQLite, applies schema, runs migrations, exports database handle |
| `server/schema.sql` | Table definitions, constraints, indexes, cascade rules |
| `server/seed.js` | Seeds leagues, teams, players, standings, matches, events, and admin account |
| `server/password.js` | scrypt hashing and verification |
| `server/mailer.js` | SMTP transport and OTP email delivery with dev fallback |
| `server/league-logos.js` | Maps league keys to local logo paths |
| `public/league-logos/` | Local PNG assets used by league tabs and banners |

### 5.3 Request lifecycle

**Read request**

1. The browser calls `fetch('/api/...')`.
2. `public/app.js` attaches the bearer token if the user is logged in.
3. Express applies `Cache-Control: no-store` to API responses.
4. Route handlers validate input, run prepared SQLite statements, and build JSON.
5. The frontend updates the current view without a full page reload.
6. While the Matches view is open, league data is refreshed every 4 seconds.

**Authenticated write request**

1. The client sends a bearer token with JSON data.
2. `requireAuth` resolves the token to a user.
3. The handler checks ownership or `requireAdmin`.
4. Validation rules run (teams, event type, minute, status, etc.).
5. Writes are wrapped in a transaction where multiple changes must stay consistent.
6. The updated match/state is returned as JSON and the UI re-renders.

### 5.4 Data model

```text
leagues 1 ─── * teams 1 ─── * players
   │              │
   │              ├── * matches (home team)
   │              ├── * matches (away team)
   │              └── * standings
   │
   ├── * matches 1 ─── 1 match_stats
   │             └── * match_events
   └── * standings

users 1 ─── * sessions
      ├── * password_resets
      └── * matches (created_by, optional)
```

| Table | Key purpose |
| --- | --- |
| `leagues` | Competition metadata and banner statistics |
| `teams` | Clubs/national teams and logo URLs |
| `players` | Squads, positions, ratings, starter/substitute status |
| `matches` | Fixtures, scores, status, kickoff time, owner, live-start time |
| `match_stats` | Possession, shots, fouls, and card totals |
| `match_events` | Goals and cards with player and minute |
| `standings` | League table rows and form |
| `users` | Accounts, roles, favourite club, password hashes |
| `sessions` | Server-side bearer-token sessions |
| `password_resets` | Hashed OTP codes, expiry, attempts |
| `app_state` | Persisted application flags such as simulation on/off |

### 5.5 Background processing

| Process | Interval | Purpose |
| --- | --- | --- |
| Live simulation | Every 4 seconds | While enabled, may add a simulated goal/stat update to official live matches (capped at 10 goals per match) |
| Auto-finish | Every 1–15 seconds | Marks live matches as finished once `MATCH_DURATION_MS` has elapsed; also initializes missing live timestamps |
| Client polling | Every 4 seconds | Refreshes the current league payload while the Matches view is active |

### 5.6 Security architecture

- Passwords are hashed with scrypt and a per-user salt.
- Session tokens are random 32-byte values stored server-side.
- Password-reset codes are HMAC-hashed, expire after 10 minutes, allow 5 attempts, and have a
  60-second resend cooldown.
- API routes enforce authentication and roles on the server; hiding UI controls is not the only
  protection.
- Match ownership checks prevent regular users from editing another user's fixture.
- Admin-only routes use `requireAdmin`.
- SQLite foreign keys and cascading deletes keep related data consistent.
- API responses are marked `Cache-Control: no-store`.

### 5.7 Deployment topology

```text
Developer machine / small server
┌──────────────────────────────────────────┐
│ Node.js process (port 3000 by default)   │
│ ├── Express static + REST API            │
│ └── data/foothub.db (SQLite file)        │
└──────────────────────────────────────────┘
```

Typical operation:

```bash
npm install
npm start
```

Configuration is supplied through environment variables (`PORT`, `DB_PATH`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `MATCH_DURATION_MS`, SMTP settings). A reverse proxy and HTTPS would normally be
added in front of the Node process for a public deployment.

---

## 6. Assumptions and constraints

- Users have a modern browser with JavaScript enabled.
- The Node.js runtime is version 22.5 or newer because the project uses `node:sqlite`.
- The deployment has write access to the directory containing the SQLite database.
- Email delivery depends on an external SMTP provider unless the local demo-code fallback is used.
- The application is intentionally a single-process demo/small-scale system; it does not include
  clustering, load balancing, or a separate cache layer.
- Official match data is seeded locally; it is not synchronized with a live external feed.

---

## 7. Future improvement opportunities

- Add an automated test suite (API integration tests and UI smoke tests) and CI.
- Add rate limiting for login, registration, and OTP requests.
- Add a real live-data provider adapter.
- Add a full i18n layer for English/Bengali.
- Add role/permission expansion (for example, league managers).
- Add audit logs for admin actions.
- Add database backup/restore automation.
- Run an accessibility audit and close any WCAG gaps.
- Move to PostgreSQL and multiple app instances if usage grows beyond a single-node deployment.

---

See [`README.md`](../README.md) for setup instructions, the user guide, tech stack, and API reference.
