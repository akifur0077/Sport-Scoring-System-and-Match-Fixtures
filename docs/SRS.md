# FootHub — Software Requirements Specification

This Software Requirements Specification (SRS) describes what the FootHub football match-center system must do, how it must behave, the interfaces it exposes, and the constraints under which it is built and operated. It is intended for the project owner, developers, testers, and reviewers.

---

## Document control

| Field | Value |
| --- | --- |
| Document title | FootHub Software Requirements Specification |
| Version | 1.0 |
| Status | Final |
| Date | 25 November 2026 |
| Prepared for | FootHub stakeholders, developers and evaluators |
| Source of truth | Implemented FootHub application and docs/PROJECT_SPEC.md |
| Related documents | README.md, docs/PROJECT_SPEC.md |

## Revision history

| Version | Date | Description | Author |
| --- | --- | --- | --- |
| 1.0 | 25 November 2026 | Initial SRS covering scope, stakeholders, interfaces, functional and non-functional requirements, data model, API, use cases and acceptance criteria | FootHub Project Team |

## 1. Introduction

### 1.1 Purpose

The purpose of this document is to define the complete software requirements for FootHub in a form that can be reviewed by stakeholders and used by developers and testers. It records the intended scope, the user classes, the functional behaviour, the quality attributes, the external interfaces, and the verification criteria for the delivered system.

### 1.2 Scope

FootHub is a web application for following football scores and fixtures and for creating and managing custom matches. It serves:

- public visitors who only browse leagues, matches, standings and details;
- registered users who create and manage their own fixtures;
- administrators who moderate all content and control the demo simulation.

The system is delivered as one Node.js process containing a static frontend, an Express REST API and a local SQLite database. It does not depend on an external database service, a frontend build pipeline, or an official live-data feed.

**In scope**

- Seven supported competitions with local logo assets
- League fixtures, live scores, standings, lineups, statistics and event timelines
- Registration, login, logout, password reset and account deletion
- Custom match creation with date, kickoff time, venue, referee and status
- Goal and card event management with automatic score recalculation
- Administrative dashboard, user overview, global match management and deletion
- Admin-controlled live-score simulation and automatic 90-minute match completion
- Admin-managed Meet the Team profiles with photo upload and contact links
- Local persistence, first-run seeding and automatic schema migration

**Out of scope**

- Official real-time data feeds from football providers
- Payments, ticketing, betting or fantasy sports
- Native mobile applications
- Multi-server clustering, load balancing and multi-tenancy
- Video streaming and live text commentary

### 1.3 Intended audience

| Audience | How this SRS is used |
| --- | --- |
| Project owner / product owner | Confirm that the delivered functionality matches the product vision |
| Developers | Implement and maintain features against explicit requirement IDs |
| Testers and reviewers | Derive test cases and acceptance checks from the requirements |
| Administrators and operators | Understand configuration, security and runtime behaviour |
| Course instructor / evaluator *(if applicable)* | Assess requirement coverage, design quality and documentation |

### 1.4 Definitions, acronyms and abbreviations

| Term | Meaning |
| --- | --- |
| FootHub | The football match-center web application described by this SRS |
| Visitor | Unauthenticated user who can browse public data |
| User | Registered account holder with permission to create and manage own matches |
| Admin | Privileged account holder with global management access |
| Owner | The user who created a particular custom match |
| FR | Functional requirement, identified as FR-01 to FR-52 |
| NFR | Non-functional requirement, identified as NFR-01 to NFR-27 |
| UC | Use case, identified as UC-01 to UC-09 |
| OTP | One-time password, a six-digit password-reset code |
| SRS | Software Requirements Specification |
| REST API | HTTP JSON interface exposed under the /api path |
| SQLite | Embedded relational database accessed through Node.js built-in node:sqlite |
| FT | Full time; the display status of a finished match |
| Bearer token | Random session token sent in the Authorization header |

### 1.5 References

- README.md — setup guide, user guide, configuration and API overview
- docs/PROJECT_SPEC.md — stakeholders, requirements and architecture narrative
- server/schema.sql — authoritative database schema and constraints
- server/index.js — authoritative REST API and business-rule implementation
- Express 4 documentation, Node.js documentation, SQLite documentation

### 1.6 Document overview

Section 2 describes the product perspective and user classes. Section 3 gives the system context and architecture. Section 4 defines external interfaces. Sections 5 and 6 contain the functional and non-functional requirements. Sections 7 and 8 specify data and API requirements. Sections 9 and 10 cover security and use cases. Section 11 defines acceptance criteria, and the appendices provide a glossary and a traceability matrix.

---

## 2. Overall description

### 2.1 Product perspective

FootHub replaces a browser-only demo with a persistent client-server system. The frontend renders league tabs, match filters, match cards, detail modals, the admin panel and account dialogs. Every changing record is stored in SQLite and accessed through JSON endpoints. seeding creates seven leagues with teams, 15-player squads, fixtures, standings, events and an admin account on first run.

### 2.2 Product functions

The system provides the following high-level functions:

- F1 — browse competitions, fixtures, standings, lineups and match details
- F2 — filter matches by All, Live, Upcoming and Finished
- F3 — register, log in, log out, reset a password and delete an account
- F4 — create a custom match with date, time, venue, referee and status
- F5 — change match status and add or remove goal and card events
- F6 — administer users, matches and the live simulation
- F7 — run a live simulation and finish live matches automatically after 90 minutes
- F8 — persist, seed, migrate and reset application data
- F9 — publish and manage team member profiles with photos

### 2.3 User classes and characteristics

| User class | Description | Responsibilities | Privileges |
| --- | --- | --- | --- |
| Visitor | Football fan browsing without an account | View leagues, matches, standings and details | Public read-only access |
| Registered user / match organizer | Account holder who creates own fixtures | Register, manage own matches and account | Create and manage owned matches, delete own account |
| Administrator | Internal moderator and operator | Monitor users, correct or remove content, control simulation | All user capabilities plus admin endpoints |
| Deployment operator | Person running the server | Configure environment variables, start and monitor the process | Host-level access, not an application role |
| SMTP provider | External email service | Deliver password-reset codes | Called by the mailer module |

### 2.4 Operating environment

| Aspect | Requirement |
| --- | --- |
| Server runtime | Node.js 22.5 or newer, because the project uses built-in node:sqlite |
| Web server | Express 4, started with npm start on port 3000 by default |
| Database | SQLite file at data/foothub.db, WAL mode, foreign keys enabled |
| Client | Modern desktop or mobile browser with JavaScript enabled |
| Network | HTTP localhost for development; reverse proxy and HTTPS recommended for public deployment |
| Email | Optional SMTP or Gmail app password; local demo-code fallback otherwise |
| Dependencies | express and nodemailer from npm; no frontend bundler or transpiler |

### 2.5 Design and implementation constraints

- The application must remain a single-process modular monolith; no separate database server is introduced.
- The frontend must stay framework-free and build-free: index.html plus public/app.js.
- All mutable domain data must be stored in SQLite and survive restarts.
- Passwords and reset codes must never be stored in readable form.
- Admin-only operations must be enforced on the server, not only hidden in the UI.
- Official seeded matches must be manageable and deletable by administrators.
- Newly created matches must appear first inside their Live or Upcoming group.
- Registration must use a favourite-club dropdown and must not include a league select or favourite-city field.
- Match completion must not depend on the live simulation toggle.
- Team member photos must be stored locally under public/team-photos and uploaded images must be validated by type and size.

### 2.6 Assumptions and dependencies

- Users access the system with a modern browser and JavaScript enabled.
- The deployment directory is writable so the SQLite database can be created and updated.
- Email delivery requires correctly configured SMTP credentials; local development may use the printed demo code.
- Official match data is local demo data, not synchronized with an external provider.
- The system is intended for a single-node demo or small deployment, not high-traffic production scaling.

---

## 3. System context and architecture

### 3.1 System context

```text
Visitor / User / Admin (browser)
        |
        | HTTP requests, JSON responses, Bearer token
        v
FootHub Node.js process
        |
        +-- Express REST API and static file serving
        +-- Authentication, roles and password reset
        +-- Match, league, standings and admin handlers
        +-- Live simulation and auto-finish schedulers
        |
        +-- SQLite database (data/foothub.db)
        |
        +-- Optional SMTP provider (Nodemailer)
```

### 3.2 Architectural style

FootHub uses a client-server, three-tier architecture implemented as a modular monolith:

1. Presentation tier — HTML5, CSS3 and vanilla JavaScript rendered in the browser.
2. Application tier — Express routes, validation, authorization and background schedulers.
3. Data tier — SQLite accessed with prepared statements, transactions and constraints.

### 3.3 Component responsibilities

| Component | Responsibility |
| --- | --- |
| index.html | Page layout, styles, modals, league tabs and filter controls |
| public/app.js | Client state, rendering, fetch calls, create/manage/admin/auth dialogs and polling |
| public/league-logos | Local PNG logos for the seven competitions |
| server/index.js | Express app, REST endpoints, validation, roles, simulation and auto-finish |
| server/db.js | SQLite connection, schema bootstrap and migrations |
| server/schema.sql | Eleven tables, indexes, constraints and cascade rules |
| server/seed.js | Demo leagues, teams, players, matches, standings and admin account |
| server/password.js | scrypt password hashing and verification |
| server/mailer.js | SMTP/Gmail OTP delivery with local fallback |
| server/league-logos.js | Mapping from league keys to local logo paths |
| public/team-photos | Uploaded team member profile photos |

### 3.4 Request flow

1. The browser sends a fetch request to an /api endpoint and attaches the bearer token when logged in.
2. Express applies Cache-Control no-store to API responses.
3. Authentication and role middleware resolve the token and enforce access rules.
4. The route validates input and executes prepared SQLite statements, using transactions for multi-step writes.
5. Data is mapped to JSON and returned to the client, which re-renders the affected view.
6. While the Matches view is active, the client refreshes the league payload every four seconds.

---

## 4. External interface requirements

### 4.1 User interface

- A responsive dark-themed single page with league tabs and All, Live, Upcoming and Finished filters.
- Match cards showing teams, logos, score or status, scorers, venue and kickoff date and time.
- Match detail modal with Overview, Timeline, Lineup and Performance tabs.
- Create Match modal with home team, away team, match date, kickoff time, venue, referee and status.
- Manage Match dialog for status changes and goal or card events.
- Auth dialogs for register, login, forgot password, reset password and delete account.
- Admin panel with dashboard totals, user list, per-user matches and simulation toggle.
- Meet the Team tab with profile cards; admins get Add Member, Edit and Delete controls.
- Clear confirmation prompts for destructive actions such as deleting a match, event or account.
- Registration form uses a grouped favourite-club dropdown; league selection and favourite-city fields are absent.
- Font Awesome icons and Google Fonts are loaded from CDNs; the application still runs without a build step.

### 4.2 Software interfaces

| Interface | Purpose | Notes |
| --- | --- | --- |
| Express static serving | Deliver index.html, app.js and league logos | Same origin as the API |
| SQLite via node:sqlite | Persist all domain and account data | WAL mode and foreign keys enabled |
| Nodemailer | Send six-digit reset codes | SMTP host, port, security, user, password and from address are configurable |
| Browser localStorage | Store the bearer token on the client | Token is removed on logout |
| Crypto module | Password hashing, tokens, OTP hashing and HMAC | scrypt with per-user salt |

### 4.3 Communications interfaces

- HTTP on the configured port, 3000 by default.
- REST endpoints under /api accept and return JSON.
- Authenticated requests use the header Authorization: Bearer token, where the token is the value returned by login or registration.
- API responses set Cache-Control: no-store so user data is not cached by browsers or proxies.
- SMTP is used only for password-reset email; it is optional in local development.

### 4.4 Hardware interfaces

No special hardware is required. The server needs a writable file system for the SQLite database and enough memory to run one Node.js process. Clients need a browser-capable device with network access to the server.

---

## 5. Functional requirements

Each requirement has a stable identifier so it can be traced to design, implementation and tests.

### 5.1 Public browsing (FR-01 to FR-09)

| ID | Requirement | Priority | Actor |
| --- | --- | --- | --- |
| FR-01 | Display the supported leagues with their official logos | High | Visitor |
| FR-02 | Display matches for the selected league grouped by day | High | Visitor |
| FR-03 | Support All, Live, Upcoming and Finished filters | High | Visitor |
| FR-04 | Show teams, score or status, scorers, venue and kickoff date and time on each card | High | Visitor |
| FR-05 | Provide a match-detail view with overview statistics and a timeline | High | Visitor |
| FR-06 | Show both squads with player names and positions in the detail view | Medium | Visitor |
| FR-07 | Show player performance ratings for live and finished matches | Medium | Visitor |
| FR-08 | Display standings with played, won, drawn, lost, goals, points and form | High | Visitor |
| FR-09 | Hide admin simulation controls from public pages | High | Visitor |

### 5.2 Account management (FR-10 to FR-21)

| ID | Requirement | Priority | Actor |
| --- | --- | --- | --- |
| FR-10 | Register with full name, email, favourite club, password and terms acceptance | High | Visitor |
| FR-11 | Populate the favourite club field from a dropdown of supported clubs | High | Visitor |
| FR-12 | Reject duplicate emails and invalid registration input | High | System |
| FR-13 | Log in with email and password | High | User |
| FR-14 | Keep the session using a bearer token stored on the client | High | System |
| FR-15 | Log out and invalidate the current token | High | User |
| FR-16 | Request a six-digit reset code by email | High | User |
| FR-17 | Expire reset codes after ten minutes, allow five attempts and enforce a 60-second resend cooldown | High | System |
| FR-18 | Set a new password using a valid reset code | High | User |
| FR-19 | Delete own account after confirming the password | Medium | User |
| FR-20 | Prevent deletion of the administrator account through self-deletion | High | System |
| FR-21 | Show clear error messages for failed authentication, registration or reset | Medium | System |

### 5.3 User-created matches (FR-22 to FR-32)

| ID | Requirement | Priority | Actor |
| --- | --- | --- | --- |
| FR-22 | Allow a logged-in user to create a match in any league | High | User |
| FR-23 | Collect home team, away team, match date, kickoff time, venue, referee and status | High | User |
| FR-24 | Reject matches with identical teams or teams outside the selected league | High | System |
| FR-25 | Show a newly created match first in its Live or Upcoming group | High | System |
| FR-26 | Allow a user to manage only matches they created | High | System |
| FR-27 | Change a match to Upcoming, Live or Finished | High | Owner |
| FR-28 | Add goals, yellow cards and red cards with player name and minute | High | Owner |
| FR-29 | Remove recorded events | Medium | Owner |
| FR-30 | Recalculate custom match scores from goal events | High | System |
| FR-31 | Reject new events on a finished match until it is reopened | Medium | System |
| FR-32 | Start the automatic 90-minute timer when a match becomes Live | High | System |

### 5.4 Administration (FR-33 to FR-39)

| ID | Requirement | Priority | Actor |
| --- | --- | --- | --- |
| FR-33 | Provide an admin dashboard with totals for users, admins, matches, custom matches and events | High | Admin |
| FR-34 | List every registered user with name, email, role, join date and match count | High | Admin |
| FR-35 | View a selected user's created matches across leagues | Medium | Admin |
| FR-36 | Manage any match, including official seeded fixtures | High | Admin |
| FR-37 | Delete any match, including official seeded fixtures | High | Admin |
| FR-38 | Turn the live-score simulation on or off | Medium | Admin |
| FR-39 | Hide admin controls from regular users and protect admin endpoints on the server | High | System |

### 5.5 Automation and data lifecycle (FR-40 to FR-47)

| ID | Requirement | Priority | Actor |
| --- | --- | --- | --- |
| FR-40 | While simulation is enabled, occasionally add simulated goals and stat updates to official live matches | Medium | System |
| FR-41 | Finish every live match automatically after 90 minutes by default | High | System |
| FR-42 | Allow the duration to be configured with MATCH_DURATION_MS for testing | Medium | Operator |
| FR-43 | Run auto-finish independently of the simulation toggle | High | System |
| FR-44 | Persist all data in SQLite and restore it after a restart | High | System |
| FR-45 | Seed demo leagues, teams, players, matches, standings and admin account on first run | High | System |
| FR-46 | Upgrade older databases automatically when the schema changes | Medium | System |
| FR-47 | Expose a health endpoint for runtime checks | Low | Operator |

### 5.6 Meet the Team (FR-48 to FR-52)

| ID | Requirement | Priority | Actor |
| --- | --- | --- | --- |
| FR-48 | Display all team member profiles to public visitors in a card grid | Medium | Visitor |
| FR-49 | Show photo, name, role, bio, location, email, phone, skills and social links on each card | Medium | Visitor |
| FR-50 | Allow an admin to add, edit and delete team member profiles | High | Admin |
| FR-51 | Accept PNG, JPG, GIF or WebP profile photos up to 5 MB and store them locally | Medium | Admin |
| FR-52 | Persist profiles in SQLite and order them by the configured display order | Medium | System |

---

## 6. Non-functional requirements

### 6.1 Performance

| ID | Requirement | Verification |
| --- | --- | --- |
| NFR-01 | Pages and API responses should feel fast on a local machine | Static frontend, prepared statements and indexes on frequent lookups |
| NFR-02 | Live data should refresh without a manual reload | League payload is polled every four seconds in the Matches view |
| NFR-03 | The system should support a small-to-medium deployment | Single Node process with SQLite is sufficient for the target usage |

### 6.2 Security

| ID | Requirement | Verification |
| --- | --- | --- |
| NFR-08 | Passwords are never stored in plain text | scrypt hashing with a per-user salt |
| NFR-09 | Sessions are revocable and tied to a user | Random 32-byte bearer tokens stored in the sessions table |
| NFR-10 | Reset codes are limited in time and attempts | HMAC-hashed OTP, ten-minute TTL, five attempts, 60-second cooldown |
| NFR-11 | Users cannot manage other users' matches | Owner checks on event and status endpoints |
| NFR-12 | Admin actions are enforced server-side | requireAdmin middleware and role checks |
| NFR-13 | User-bearing API responses are not cached | Cache-Control no-store on /api responses |

### 6.3 Reliability and availability

| ID | Requirement | Verification |
| --- | --- | --- |
| NFR-04 | Match completion does not depend on the simulation toggle | Separate auto-finish interval runs continuously |
| NFR-05 | Event writes are atomic | Transactions with commit and rollback around event changes |
| NFR-06 | Data survives restarts | File-backed SQLite database in WAL mode |
| NFR-07 | Invalid references and enum values are rejected | Foreign keys, CHECK constraints, UNIQUE constraints and cascading deletes |
| NFR-23 | Operators can confirm the server is alive | /api/health and console startup messages |
| NFR-24 | Demo data can be rebuilt without losing users | npm run reset reseeds leagues and matches while keeping accounts |

### 6.4 Usability and accessibility

| ID | Requirement | Verification |
| --- | --- | --- |
| NFR-14 | The interface is understandable without training | League tabs, filters, labelled buttons, modals and confirmations |
| NFR-15 | The layout works on desktop and smaller screens | Responsive CSS with flexible grids and media queries |
| NFR-16 | Destructive actions require confirmation | Prompts before deleting matches, events and accounts |
| NFR-17 | Forms have visible labels and sensible control names | Labels, aria-label on icon controls and native form elements |
| NFR-25 | The product suits the current audience | English interface with Bengali helper text and documentation |

### 6.5 Maintainability, portability and compatibility

| ID | Requirement | Verification |
| --- | --- | --- |
| NFR-18 | Code is organized by responsibility | Separate frontend, server, schema, seed, password, mailer and logo modules |
| NFR-19 | Common tasks are scripted | npm start, npm run dev, npm run seed and npm run reset |
| NFR-20 | No external database service is required | Built-in node:sqlite and database created on first run |
| NFR-21 | Current Node.js and modern browsers are supported | Node.js 22.5 or newer and standards-based HTML, CSS and JavaScript |
| NFR-26 | Core behaviour is verifiable through the API | REST endpoints return JSON and can be tested without the UI |
| NFR-27 | A new environment needs minimal setup | npm install followed by npm start, with no frontend build |

### 6.6 Privacy and known limitations

| ID | Requirement | Verification |
| --- | --- | --- |
| NFR-22 | Only necessary personal data is stored | Name, email, role, favourite club and account timestamps; passwords and OTPs are hashed |

Known limitations of the current release:

- No automated test suite or CI pipeline is included.
- SQLite and one Node process limit horizontal scalability.
- Live data is seeded and simulated, not an official live feed.
- Login, registration and OTP endpoints do not have full rate limiting.
- Accessibility has not been audited against WCAG.
- The interface is primarily English; Bengali appears in selected messages and documentation.

---

## 7. Data requirements

### 7.1 Logical data model

```text
leagues 1 --- * teams 1 --- * players
   |              |
   |              +--- * matches (home team)
   |              +--- * matches (away team)
   |              +--- * standings
   |
   +--- * matches 1 --- 1 match_stats
                     +--- * match_events

users 1 --- * sessions
      +--- * password_resets
      +--- * matches (created_by, optional)
```

### 7.2 Data dictionary

| Table | Purpose |
| --- | --- |
| leagues | League metadata, season and banner statistics |
| teams | Clubs and national teams with logo URLs |
| players | Squads with positions, ratings and starter status |
| matches | Fixtures, scores, status, kickoff time, owner and live-start time |
| match_stats | Possession, shots, fouls and card totals |
| match_events | Goals and cards with player and minute |
| standings | League table positions, records, points and form |
| users | Accounts with role, favourite club and password hash |
| sessions | Bearer tokens for logged-in users |
| password_resets | Hashed reset codes, expiry and attempts |
| app_state | Persisted flags such as simulation on or off |
| team_members | Meet the Team profiles, photos, contact links and skills |

### 7.3 Data integrity rules

- Every foreign key reference must resolve to an existing parent row.
- Deleting a league, team or user cascades to dependent records where defined.
- Team names must be unique inside each league.
- Player position must be one of GK, DEF, MID or FWD.
- Match status must be one of upcoming, live or finished.
- Event type must be one of goal, yellow or red.
- Event minute must be a valid non-negative integer.
- Migration logic must add newer columns and roles to older databases without losing existing data.

---

## 8. API requirements

All endpoints return JSON. Authentication uses Authorization: Bearer token. Owner means the creator of the match; admins may act on any match.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | /api/health | Public | Health check |
| GET | /api/leagues | Public | List leagues and banner statistics |
| GET | /api/clubs | Public | Club list for the registration dropdown |
| GET | /api/leagues/:key | Public | One league with teams, matches and standings |
| GET | /api/leagues/:key/matches | Public | Matches with optional status and search filters |
| GET | /api/leagues/:key/standings | Public | League table |
| POST | /api/leagues/:key/matches | User | Create a match in the league |
| GET | /api/matches/:id | Public | Match detail, stats, squads, events and timeline |
| POST | /api/matches/:id/events | Owner or admin | Add an event |
| DELETE | /api/matches/:id/events/:eventId | Owner or admin | Remove an event |
| PATCH | /api/matches/:id/status | Owner or admin | Change match status |
| DELETE | /api/matches/:id | Admin | Delete any match |
| GET | /api/admin/users | Admin | Dashboard totals and all users |
| GET | /api/admin/users/:id/matches | Admin | One user's matches across leagues |
| GET | /api/simulation | Admin | Read simulation state |
| POST | /api/simulation | Admin | Enable or disable simulation |
| GET | /api/team | Public | List all team member profiles |
| POST | /api/team | Admin | Add a profile with an optional base64 photo |
| PATCH | /api/team/:id | Admin | Edit a profile or replace/remove its photo |
| DELETE | /api/team/:id | Admin | Delete a profile and its photo |
| POST | /api/auth/register | Public | Register and receive a token |
| POST | /api/auth/login | Public | Log in and receive a token |
| POST | /api/auth/forgot | Public | Request a six-digit reset code |
| POST | /api/auth/reset | Public | Set a new password with a valid code |
| GET | /api/auth/me | User | Current account details |
| POST | /api/auth/logout | Public | Invalidate the current token |
| DELETE | /api/auth/me | User | Delete own account after password confirmation |

---

## 9. Security and access control requirements

- Hash every password with scrypt and a unique random salt; never return password hashes in API responses.
- Issue random bearer tokens on login and registration; store tokens server-side and delete them on logout, reset or account deletion.
- Hash reset codes with HMAC and enforce expiry, attempt count and resend cooldown.
- Require authentication for all write endpoints except registration, login, forgot and reset.
- Enforce ownership checks on event and status changes; allow administrators to bypass ownership.
- Protect admin endpoints with server-side role checks in addition to hiding UI controls.
- Validate and sanitize all user-supplied fields before writing to the database.
- Mark API responses as non-cacheable to reduce exposure of user data.
- Change seeded admin credentials and set a stable PASSWORD_RESET_SECRET before any non-local deployment.
- Ensure the admin account cannot be deleted through the self-deletion flow.

---

## 10. Use cases

### 10.1 UC-01 Browse and filter matches

**Actor:** Visitor. **Precondition:** The application is running. **Main flow:** open a league tab, choose All, Live, Upcoming or Finished, select a match, review details and close the modal. **Postcondition:** No data is changed.

### 10.2 UC-02 Register an account

**Actor:** Visitor. **Precondition:** The visitor has a unique email. **Main flow:** open registration, enter name, email, favourite club and password, accept terms and submit. **Alternate flow:** the system rejects duplicate email or invalid input with a visible error. **Postcondition:** A user record and session token are created.

### 10.3 UC-03 Reset a forgotten password

**Actor:** User. **Precondition:** The user owns the email address. **Main flow:** request a reset code, receive the six-digit OTP by email or local demo fallback, enter it with the new password and submit. **Alternate flow:** an expired code, wrong code or cooldown violation produces an error. **Postcondition:** The password hash changes and existing sessions are removed.

### 10.4 UC-04 Create a custom match

**Actor:** User. **Precondition:** The user is logged in. **Main flow:** choose a league, open Create Match, select home and away teams, date, time, venue, referee and status, then submit. **Alternate flow:** identical teams or invalid input are rejected. **Postcondition:** The match is stored and appears first in its status group.

### 10.5 UC-05 Manage a custom match

**Actor:** Owner or Admin. **Precondition:** A match exists and is not finished. **Main flow:** open Manage, add or remove goal and card events or change status; observe updated score and timeline. **Alternate flow:** a finished match must be reopened before event edits. **Postcondition:** Events and score are persisted atomically.

### 10.6 UC-06 Administer users and matches

**Actor:** Admin. **Precondition:** The admin is logged in. **Main flow:** open Admin Panel, review totals and users, inspect a user's matches, manage or delete any match. **Postcondition:** Content changes are persisted and reflected for all visitors.

### 10.7 UC-07 Control the live simulation

**Actor:** Admin. **Precondition:** The admin is logged in. **Main flow:** toggle simulation on or off and observe that official live matches may gain simulated goals only while enabled. **Postcondition:** The flag is persisted in app_state.

### 10.8 UC-08 Automatic match completion

**Actor:** System. **Precondition:** A live match has a recorded live-start time. **Main flow:** the scheduler checks elapsed time; after the configured default of 90 minutes it sets status to finished and displays FT. **Postcondition:** The match moves to the Finished group even if simulation is off.

### 10.9 UC-09 Add a team member

**Actor:** Admin. **Precondition:** The admin is logged in. **Main flow:** open the Meet the Team tab, choose Add Member, enter name, role, bio, contact details, skills and display order, optionally upload a photo, then save. **Alternate flow:** an unsupported image type or an image over 5 MB is rejected with an error. **Postcondition:** The profile card and photo (if provided) appear immediately for all visitors.

---

## 11. Acceptance criteria

| Area | Acceptance criteria |
| --- | --- |
| Browsing | All seven leagues load with logos; filters show the correct match sets; details show stats, timeline, lineups and ratings |
| Accounts | Registration, login, logout, OTP reset and account deletion succeed; invalid input and duplicate emails show errors |
| Match creation | A logged-in user creates a match with all required fields; it appears first in Live or Upcoming; invalid teams are rejected |
| Match management | Owner and admin can add and remove events and change status; score recalculates; finished matches block edits until reopened |
| Administration | Admin sees totals and all users; admin can manage and delete official and custom matches; regular users cannot |
| Automation | Live matches finish after the configured duration independently of simulation; simulation toggle is admin-only |
| Security | Passwords and OTPs are hashed; tokens are revocable; ownership and role checks reject unauthorized requests |
| Persistence | Data survives restart; npm run reset restores demo fixtures while keeping user accounts |
| Team profiles | Visitors see profile cards; admins can add, edit and delete members; photos upload, display and are removed with the profile |
| Setup | npm install and npm start bring up the application on port 3000 with seeded data |

---

## 12. Future enhancements

- Add automated API and UI tests with continuous integration.
- Add rate limiting to login, registration and OTP endpoints.
- Introduce a real live-data provider adapter.
- Provide complete English and Bengali localization.
- Add finer-grained roles such as league managers.
- Record audit logs for administrative actions.
- Automate database backup and restore.
- Complete a WCAG accessibility audit and fix any gaps.
- Move to PostgreSQL and multiple application instances if demand grows.

---

## Appendix A: Glossary

| Term | Meaning |
| --- | --- |
| Fixture | A scheduled or played football match record |
| Live match | A match currently in progress with status live |
| Upcoming match | A scheduled match that has not started |
| Finished match | A completed match displayed with FT |
| Event | A goal, yellow card or red card with player and minute |
| Lineup | The list of players for one side in a match |
| Standing | A team's row in the league table |
| Dashboard | Admin overview of system totals and registered users |
| Seeding | Initial population of demo data on first run |
| Migration | Automatic upgrade of an older database schema |
| Simulation | Admin-controlled occasional scoring in official live matches |

## Appendix B: Requirement traceability matrix

| Product objective | Related functional requirements | Related non-functional requirements |
| --- | --- | --- |
| Browse football data | FR-01 to FR-09 | NFR-01, NFR-02, NFR-14, NFR-15 |
| Secure accounts | FR-10 to FR-21 | NFR-08, NFR-09, NFR-10, NFR-13, NFR-22 |
| Create and manage matches | FR-22 to FR-32 | NFR-05, NFR-07, NFR-11, NFR-16 |
| Administration and moderation | FR-33 to FR-39 | NFR-12, NFR-23, NFR-24 |
| Automation and persistence | FR-40 to FR-47 | NFR-03, NFR-04, NFR-06, NFR-20 |
| Team profiles | FR-48 to FR-52 | NFR-06, NFR-12, NFR-14, NFR-27 |
| Developer and operator experience | FR-23, FR-32, FR-42, FR-47 | NFR-18, NFR-19, NFR-21, NFR-26, NFR-27 |

See README.md for setup instructions and docs/PROJECT_SPEC.md for the broader project specification.
