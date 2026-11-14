'use strict';

/* ══════════════════════════════════════════════════════════════════
   FootHub frontend — talks to the Node/Express + SQLite API
   ══════════════════════════════════════════════════════════════════ */

const API_BASE = '/api';
const TOKEN_KEY = 'foothub_token';

const state = {
  leagueKey: 'laliga',
  view: 'matches',
  filter: 'all',
  search: '',
  leagues: {},          // full league payload cache (matches + standings)
  simulating: true,
  activeMatchId: null,
  activeMatch: null,
  matchTab: 'overview',
  lineupTeam: 'home',
  user: null,
  token: localStorage.getItem(TOKEN_KEY),
  pollTimer: null,
  requestSeq: 0,
  manageMatch: null,
  adminData: null,
  adminUser: null
};

/* ── helpers ─────────────────────────────────────────────────── */

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(API_BASE + path, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function loadingBlock(message) {
  return `
    <div style="text-align:center; padding:48px 20px; color:var(--sub);">
      <i class="fa-solid fa-futbol fa-spin" style="font-size:22px; color:var(--accent-la);"></i>
      <div style="margin-top:12px; font-size:13px;">${esc(message)}</div>
    </div>
  `;
}

function errorBlock(message) {
  return `
    <div style="text-align:center; padding:48px 20px;">
      <div style="color:#f87171; font-weight:700; margin-bottom:8px;">Could not load data</div>
      <div style="color:var(--sub); font-size:13px; margin-bottom:16px;">${esc(message)}</div>
      <button class="auth-btn primary" onclick="reload()">Try again</button>
    </div>
  `;
}

function scorersHtml(match) {
  if (match.status === 'upcoming') return 'Starts soon';
  if (!match.scorers || match.scorers === 'No goals yet') return 'No goals yet';
  return `<i class="fa-solid fa-futbol"></i> ${esc(match.scorers)}`;
}

/* ── boot ────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', init);

async function init() {
  updateDateDisplay();
  document.getElementById('main-content').innerHTML = loadingBlock('Loading fixtures from the database…');

  try {
    await restoreSession();
    await loadLeague(state.leagueKey, { showLoader: false });

    if (isAdmin()) await loadSimulationState();
    startPolling();
  } catch (error) {
    document.getElementById('main-content').innerHTML = errorBlock(error.message);
  }
}

function isAdmin() {
  return Boolean(state.user && state.user.role === 'admin');
}

function canManage(match) {
  return Boolean(state.user && match.createdBy && (match.createdBy === state.user.id || isAdmin()));
}

async function loadSimulationState() {
  try {
    const simulation = await api('/simulation');
    setSimulationUi(simulation.enabled);
  } catch {
    /* non-admins never reach this */
  }
}

async function loadLeague(key, { showLoader = true } = {}) {
  const seq = ++state.requestSeq;
  if (showLoader) {
    document.getElementById('main-content').innerHTML = loadingBlock('Loading league data…');
  }

  const data = await api(`/leagues/${encodeURIComponent(key)}`);
  if (seq !== state.requestSeq) return;

  state.leagues[key] = data;
  if (state.leagueKey === key) render();
}

async function reload() {
  state.leagues[state.leagueKey] = undefined;
  try {
    await loadLeague(state.leagueKey);
  } catch (error) {
    document.getElementById('main-content').innerHTML = errorBlock(error.message);
  }
}

function startPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);

  state.pollTimer = setInterval(async () => {
    if (state.view !== 'matches') return;

    const key = state.leagueKey;
    try {
      const data = await api(`/leagues/${encodeURIComponent(key)}`);
      if (key !== state.leagueKey) return;
      state.leagues[key] = data;
      render();
    } catch {
      /* transient network hiccup — next tick will retry */
    }
  }, 4000);
}

/* ── league / view switching ─────────────────────────────────── */

function updateDateDisplay() {
  const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  document.getElementById('currentDate').innerText = new Date().toLocaleDateString('en-US', options);
}

async function switchLeague(key) {
  state.leagueKey = key;
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.getAttribute('data-league') === key));

  try {
    if (state.leagues[key]) render();
    else await loadLeague(key);
  } catch (error) {
    document.getElementById('main-content').innerHTML = errorBlock(error.message);
  }
}

function switchView(view) {
  state.view = view;
  document.getElementById('viewBtnMatches').classList.toggle('active', view === 'matches');
  document.getElementById('viewBtnStandings').classList.toggle('active', view === 'standings');
  document.getElementById('filterBar').style.display = view === 'matches' ? 'flex' : 'none';
  render();
}

function applyFilter(filter) {
  state.filter = filter;
  document.querySelectorAll('.filter-btn').forEach((b) =>
    b.classList.toggle('active', b.getAttribute('data-filter') === filter));
  render();
}

function handleSearch(q) {
  state.search = q.toLowerCase().trim();
  render();
}

/* ── live simulation toggle ──────────────────────────────────── */

function setSimulationUi(enabled) {
  state.simulating = enabled;
  document.getElementById('simToggleBtn').classList.toggle('active', enabled);
  document.getElementById('simBtnText').innerText = enabled ? 'SIMULATING LIVE' : 'SIMULATION PAUSED';
}

async function toggleSimulation() {
  if (!isAdmin()) return;

  const next = !state.simulating;
  setSimulationUi(next);

  try {
    await api('/simulation', { method: 'POST', body: JSON.stringify({ enabled: next }) });
  } catch {
    setSimulationUi(!next);
  }
}

/* ── main render ─────────────────────────────────────────────── */

function render() {
  const league = state.leagues[state.leagueKey];
  if (!league) return;

  const matches = league.matches;

  document.getElementById('countAll').innerText = matches.length;
  document.getElementById('countLive').innerText = matches.filter((m) => m.status === 'live').length;
  document.getElementById('countUpcoming').innerText = matches.filter((m) => m.status === 'upcoming').length;
  document.getElementById('countFinished').innerText = matches.filter((m) => m.status === 'finished').length;

  let html = `
    <div class="league-banner">
      <div class="banner-icon">${league.icon}</div>
      <div>
        <div class="banner-name">${esc(league.name)}</div>
        <div class="banner-sub">${esc(league.sub)} (20 Teams Competing)</div>
      </div>
      <div class="banner-stats">
        <div class="stat"><div class="stat-num">${esc(league.stats.matches)}</div><div class="stat-lbl">SEASON</div></div>
        <div class="stat"><div class="stat-num">${esc(league.stats.goals)}</div><div class="stat-lbl">GOALS</div></div>
        <div class="stat"><div class="stat-num">${esc(league.stats.avg)}</div><div class="stat-lbl">AVG/MATCH</div></div>
      </div>
    </div>
  `;

  if (state.view === 'matches') {
    const filtered = matches.filter((m) => {
      if (state.filter !== 'all' && m.status !== state.filter) return false;
      if (state.search) return `${m.home} ${m.away}`.toLowerCase().includes(state.search);
      return true;
    });

    if (filtered.length === 0) {
      html += `<div style="text-align:center; padding:40px; color:var(--sub);">কোনো ম্যাচ পাওয়া যায়নি।</div>`;
    } else {
      const groups = {};
      filtered.forEach((m) => {
        if (!groups[m.day]) groups[m.day] = [];
        groups[m.day].push(m);
      });

      html += `<div class="matches-grid">`;
      for (const [day, list] of Object.entries(groups)) {
        html += `<div class="day-divider"><span>${esc(day)} (${list.length} Matches)</span><div class="day-line"></div></div>`;
        list.forEach((m) => {
          const center = m.status === 'live' ? `
            <div class="score-box"><span class="score-num">${m.homeScore}</span><span class="score-sep">-</span><span class="score-num">${m.awayScore}</span></div>
            <div class="status-pill live"><div class="pulse-dot" style="width:5px; height:5px; background:var(--live);"></div> LIVE ${esc(m.time)}</div>
            <div class="goal-scorers-mini">${scorersHtml(m)}</div>
          ` : m.status === 'upcoming' ? `
            <div class="match-time-text">${esc(m.time)}</div>
            <div class="status-pill upcoming">UPCOMING</div>
            <div class="goal-scorers-mini">Starts soon</div>
          ` : `
            <div class="score-box"><span class="score-num" style="color:var(--fin);">${m.homeScore}</span><span class="score-sep">-</span><span class="score-num" style="color:var(--fin);">${m.awayScore}</span></div>
            <div class="status-pill finished">FT</div>
            <div class="goal-scorers-mini">${scorersHtml(m)}</div>
          `;

          const actions = [];
          if (canManage(m)) {
            actions.push(`<button class="mini-btn accent" onclick="event.stopPropagation(); openManageModal(${m.id})">Manage</button>`);
          }
          if (isAdmin() && m.createdBy) {
            actions.push(`<button class="mini-btn danger" onclick="event.stopPropagation(); deleteMatch(${m.id})">Delete</button>`);
          }
          const actionsHtml = actions.length ? `<div class="match-actions">${actions.join('')}</div>` : '';
          const ownerHtml = m.createdBy
            ? `<div class="match-meta" style="color:var(--accent-l1);"><i class="fa-solid fa-user-pen"></i> ${esc(m.createdByName || 'Member')}'s match</div>`
            : '';

          html += `
            <div class="match-card ${m.status}" onclick="openModal(${m.id})">
              <div class="team">
                <div class="team-badge"><img src="${esc(m.homeLogo)}" alt="${esc(m.home)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"><span style="display:none">${esc(m.home[0])}</span></div>
                <div class="team-info"><div class="team-name">${esc(m.home)}</div><div class="team-record">Squad A</div></div>
              </div>
              <div class="match-center">${center}<div class="match-meta"><i class="fa-solid fa-location-dot"></i> ${esc(m.venue)}</div>${ownerHtml}${actionsHtml}</div>
              <div class="team away">
                <div class="team-badge"><img src="${esc(m.awayLogo)}" alt="${esc(m.away)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"><span style="display:none">${esc(m.away[0])}</span></div>
                <div class="team-info"><div class="team-name">${esc(m.away)}</div><div class="team-record">Squad B</div></div>
              </div>
            </div>
          `;
        });
      }
      html += `</div>`;
    }
  } else {
    let rows = '';
    league.standings.forEach((s) => {
      const formHTML = s.form.map((f) => `<div class="form-dot ${f}">${f}</div>`).join('');
      rows += `
        <tr>
          <td class="rank-cell">${s.rank}</td>
          <td><div class="team-cell"><img src="${esc(s.logo)}" alt="${esc(s.name)}" onerror="this.style.display='none'"><span>${esc(s.name)}</span></div></td>
          <td>${s.p}</td><td>${s.w}</td><td>${s.d}</td><td>${s.l}</td>
          <td>${s.gf}</td><td>${s.ga}</td><td>${s.gf - s.ga}</td><td><strong>${s.pts}</strong></td>
          <td><div class="form-dots">${formHTML}</div></td>
        </tr>
      `;
    });

    html += `
      <div class="standings-card">
        <div class="table-responsive">
          <table class="standings-table">
            <thead>
              <tr><th>#</th><th>Club (20 Teams)</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th><th>Form</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  document.getElementById('main-content').innerHTML = html;
}

/* ── match modal ─────────────────────────────────────────────── */

async function openModal(id) {
  state.activeMatchId = id;
  state.activeMatch = null;
  state.matchTab = 'overview';
  state.lineupTeam = 'home';

  document.querySelectorAll('.match-tab-btn').forEach((btn, idx) =>
    btn.classList.toggle('active', idx === 0));

  document.getElementById('modalContentHeader').textContent = 'Match details';
  document.getElementById('modalBodyContent').innerHTML = loadingBlock('Loading lineups and stats…');
  document.getElementById('matchModal').classList.add('open');

  try {
    const { match } = await api(`/matches/${id}`);
    if (state.activeMatchId !== id) return;
    state.activeMatch = match;
    renderModalContent();
  } catch (error) {
    document.getElementById('modalBodyContent').innerHTML = errorBlock(error.message);
  }
}

function switchMatchTab(tab) {
  state.matchTab = tab;
  document.querySelectorAll('.match-tab-btn').forEach((btn) =>
    btn.classList.toggle('active', btn.innerText.toLowerCase().includes(tab)));
  renderModalContent();
}

function switchLineupTeam(side) {
  state.lineupTeam = side;
  renderModalContent();
}

function renderModalContent() {
  const m = state.activeMatch;
  if (!m) return;

  document.getElementById('modalContentHeader').innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; gap:10px;">
      <img src="${esc(m.homeLogo)}" style="width:24px; height:24px; object-fit:contain;" />
      <span>${esc(m.home)} vs ${esc(m.away)}</span>
      <img src="${esc(m.awayLogo)}" style="width:24px; height:24px; object-fit:contain;" />
    </div>
  `;

  const stats = m.stats;
  let bodyHtml = '';

  if (state.matchTab === 'overview') {
    bodyHtml = `
      <div style="text-align:center; margin-bottom:20px;">
        <h2 style="font-size:36px; font-family:'Barlow Condensed';">${m.homeScore} - ${m.awayScore}</h2>
        <div style="font-size:12px; color:var(--live); margin-bottom:6px;">${esc(m.scorers)}</div>
        <p style="color:var(--sub); font-size:12px;"><i class="fa-solid fa-location-dot" style="color:var(--accent-la);"></i> Stadium: ${esc(m.venue)} | Referee: ${esc(m.referee)}</p>
      </div>
      <div style="background:var(--card); padding:16px; border-radius:10px; display:flex; justify-content:space-around; text-align:center;">
        <div><div style="font-size:12px; color:var(--sub);">Possession</div><div style="font-size:18px; font-weight:700;">${stats.possession[0]}% - ${stats.possession[1]}%</div></div>
        <div><div style="font-size:12px; color:var(--sub);">Total Shots</div><div style="font-size:18px; font-weight:700;">${stats.shots[0]} - ${stats.shots[1]}</div></div>
      </div>
    `;
  } else if (state.matchTab === 'timeline') {
    const events = m.timeline.map((event) => {
      if (event.type === 'start') {
        return `
          <div style="background:var(--card); padding:10px 14px; border-radius:8px; display:flex; align-items:center; gap:12px;">
            <span style="font-weight:700; color:var(--accent-la);">Match Started</span>
            <span><i class="fa-solid fa-clock"></i> Live telemetry active</span>
          </div>
        `;
      }
      const teamName = event.team === 'home' ? m.home : m.away;
      const iconClass = event.type === 'goal' ? 'event-icon goal' : event.type === 'yellow' ? 'event-icon yellow' : 'event-icon red';
      const icon = event.type === 'goal' ? 'fa-futbol' : 'fa-square';
      const label = event.type === 'goal' ? 'Goal' : event.type === 'yellow' ? 'Yellow card' : 'Red card';

      return `
        <div style="background:var(--card); padding:10px 14px; border-radius:8px; display:flex; align-items:center; gap:12px;">
          <span style="font-weight:700; color:var(--sub); min-width:42px;">${event.min}'</span>
          <span class="${iconClass}"><i class="fa-solid ${icon}"></i></span>
          <span style="flex:1;"><strong>${esc(event.player)}</strong> <span class="event-meta">${label}</span></span>
          <span style="font-size:12px; color:var(--sub);">${esc(teamName)}</span>
        </div>
      `;
    }).join('');

    bodyHtml = `
      <div style="background:var(--card); padding:16px; border-radius:10px; text-align:center; margin-bottom:12px;">
        <div style="font-size:12px; color:var(--sub);">Goal Scorers Summary</div>
        <div style="font-size:13px; font-weight:700; color:var(--live); margin-top:4px;">${esc(m.scorers)}</div>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px;">${events}</div>
    `;
  } else if (state.matchTab === 'lineup') {
    const allPlayers = m.players[state.lineupTeam];
    const starters = allPlayers.filter((p) => p.type === 'starter');
    const subs = allPlayers.filter((p) => p.type === 'sub');

    bodyHtml = `
      <div class="lineup-team-selector">
        <button class="lineup-team-btn ${state.lineupTeam === 'home' ? 'active' : ''}" onclick="switchLineupTeam('home')">
          <img src="${esc(m.homeLogo)}" /> ${esc(m.home)} Squad
        </button>
        <button class="lineup-team-btn ${state.lineupTeam === 'away' ? 'active' : ''}" onclick="switchLineupTeam('away')">
          <img src="${esc(m.awayLogo)}" /> ${esc(m.away)} Squad
        </button>
      </div>

      <div class="lineup-section-title">Starting XI (${starters.length} Players)</div>
      <div class="players-list-grid">
    `;

    starters.forEach((p) => {
      const rClass = p.rating >= 8.5 ? 'rating-high' : p.rating >= 7.8 ? 'rating-mid' : 'rating-normal';
      bodyHtml += `
        <div class="player-card">
          <div class="player-card-left">
            <div class="player-avatar"><i class="fa-solid fa-user"></i></div>
            <div class="player-info">
              <div class="player-name-text">${esc(p.name)} <span class="player-pos-tag">(${esc(p.pos)})</span></div>
              <div class="player-stats-mini"><i class="fa-solid fa-chart-line"></i> ${esc(p.stats)}</div>
            </div>
          </div>
          <div class="rating-badge ${rClass}">${p.rating}</div>
        </div>
      `;
    });

    bodyHtml += `</div><div class="lineup-section-title" style="margin-top:20px;">Substitutes (${subs.length} Players)</div><div class="players-list-grid">`;

    subs.forEach((p) => {
      const rClass = p.rating >= 8.0 ? 'rating-high' : p.rating >= 7.4 ? 'rating-mid' : 'rating-normal';
      bodyHtml += `
        <div class="player-card">
          <div class="player-card-left">
            <div class="player-avatar"><i class="fa-solid fa-user-clock"></i></div>
            <div class="player-info">
              <div class="player-name-text">${esc(p.name)} <span class="player-pos-tag">(${esc(p.pos)} - SUB)</span></div>
              <div class="player-stats-mini"><i class="fa-solid fa-info-circle"></i> ${esc(p.stats)}</div>
            </div>
          </div>
          <div class="rating-badge ${rClass}">${p.rating}</div>
        </div>
      `;
    });

    bodyHtml += `</div>`;
  } else if (state.matchTab === 'stats') {
    bodyHtml = `
      <div style="background:var(--card); padding:16px; border-radius:10px; display:flex; flex-direction:column; gap:12px;">
        <div>
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><span>${stats.possession[0]}%</span><span>Possession</span><span>${stats.possession[1]}%</span></div>
          <div style="height:6px; background:var(--border); border-radius:3px; overflow:hidden; display:flex;"><div style="width:${stats.possession[0]}%; background:var(--accent-la);"></div><div style="width:${stats.possession[1]}%; background:var(--upcoming);"></div></div>
        </div>
        <div>
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><span>${stats.shots[0]}</span><span>Shots</span><span>${stats.shots[1]}</span></div>
        </div>
        <div>
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><span>${stats.onTarget[0]}</span><span>Shots on Target</span><span>${stats.onTarget[1]}</span></div>
        </div>
        <div>
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><span>${stats.fouls[0]}</span><span>Fouls</span><span>${stats.fouls[1]}</span></div>
        </div>
        <div>
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><span>${stats.yellow[0]}</span><span>Yellow Cards</span><span>${stats.yellow[1]}</span></div>
        </div>
        <div>
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><span>${stats.red[0]}</span><span>Red Cards</span><span>${stats.red[1]}</span></div>
        </div>
      </div>
    `;
  }

  document.getElementById('modalBodyContent').innerHTML = bodyHtml;
}

function closeModal() {
  document.getElementById('matchModal').classList.remove('open');
}

function closeModalOnBackdrop(e) {
  if (e.target.id === 'matchModal') closeModal();
}

/* ── user-created matches (owner controls) ───────────────────── */

function closeManageModal() {
  document.getElementById('manageModal').classList.remove('open');
}

function closeManageModalOnBackdrop(e) {
  if (e.target.id === 'manageModal') closeManageModal();
}

function showManageError(message) {
  const errorEl = document.getElementById('manageError');
  if (errorEl) errorEl.textContent = message || '';
}

function setBusy(button, busy, busyLabel = 'Please wait…') {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerText;
    button.innerText = busyLabel;
    button.disabled = true;
  } else {
    button.innerText = button.dataset.label || button.innerText;
    button.disabled = false;
  }
}

async function refreshLeagueSilently() {
  const key = state.leagueKey;
  try {
    const data = await api(`/leagues/${encodeURIComponent(key)}`);
    if (key !== state.leagueKey) return;
    state.leagues[key] = data;
    render();
  } catch {
    /* keep showing the last known data */
  }
}

async function openCreateMatch() {
  if (!state.user) return openAuthModal('login');

  let league = state.leagues[state.leagueKey];
  if (!league || !league.teams) {
    await loadLeague(state.leagueKey, { showLoader: false });
    league = state.leagues[state.leagueKey];
  }
  if (!league || !league.teams || league.teams.length < 2) return;

  const options = league.teams.map((team, index) =>
    `<option value="${team.id}"${index === 0 ? ' selected' : ''}>${esc(team.name)}</option>`
  ).join('');

  document.getElementById('manageModalTitle').innerText = `Create Match — ${league.name}`;
  document.getElementById('manageModalBody').innerHTML = `
    <form class="auth-form" onsubmit="handleCreateMatch(event)">
      <div class="form-row">
        <div class="form-group"><label>Home Team</label><select name="homeTeamId">${options}</select></div>
        <div class="form-group"><label>Away Team</label><select name="awayTeamId">${options}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Day</label>
          <select name="dayLabel">
            <option>Today</option><option>Tomorrow</option><option>Yesterday</option>
          </select>
        </div>
        <div class="form-group"><label>Kickoff / Clock</label><input name="timeLabel" value="20:00" maxlength="20" required /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Venue</label><input name="venue" value="Custom Stadium" maxlength="100" required /></div>
        <div class="form-group"><label>Referee</label><input name="referee" value="TBD" maxlength="60" required /></div>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select name="status"><option value="upcoming">Upcoming</option><option value="live">Live</option></select>
      </div>
      <div id="manageError" style="color:#f87171; font-size:12px; min-height:16px;"></div>
      <button type="submit" class="form-submit-btn">Create Match</button>
    </form>
  `;

  // Default the away team to something other than the home team.
  const awaySelect = document.querySelector('#manageModalBody select[name="awayTeamId"]');
  if (awaySelect && awaySelect.options.length > 1) awaySelect.selectedIndex = 1;

  document.getElementById('manageModal').classList.add('open');
}

async function handleCreateMatch(event) {
  event.preventDefault();

  const form = event.target;
  const button = form.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.homeTeamId = Number(payload.homeTeamId);
  payload.awayTeamId = Number(payload.awayTeamId);

  if (payload.homeTeamId === payload.awayTeamId) {
    return showManageError('Home and away teams must be different.');
  }

  showManageError('');
  setBusy(button, true, 'Creating…');

  try {
    const { match } = await api(`/leagues/${encodeURIComponent(state.leagueKey)}/matches`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    await refreshLeagueSilently();
    await openManageModal(match.id);
  } catch (error) {
    showManageError(error.message);
  } finally {
    setBusy(button, false);
  }
}

async function openManageModal(id) {
  document.getElementById('manageModalTitle').innerText = 'Manage Match';
  document.getElementById('manageModalBody').innerHTML = loadingBlock('Loading match…');
  document.getElementById('manageModal').classList.add('open');

  try {
    const { match } = await api(`/matches/${id}`);
    state.manageMatch = match;
    renderManageModal();
  } catch (error) {
    document.getElementById('manageModalBody').innerHTML = errorBlock(error.message);
  }
}

function renderManageModal() {
  const m = state.manageMatch;
  if (!m) return;

  const statusLabel = m.status.charAt(0).toUpperCase() + m.status.slice(1);
  const locked = m.status === 'finished';

  const playerNames = [...m.players.home, ...m.players.away].map((player) => player.name);
  const datalist = playerNames.map((name) => `<option value="${esc(name)}"></option>`).join('');

  const eventRows = m.events.length
    ? m.events.map((event) => {
      const iconClass = event.type === 'goal' ? 'event-icon goal' : event.type === 'yellow' ? 'event-icon yellow' : 'event-icon red';
      const icon = event.type === 'goal' ? 'fa-futbol' : 'fa-square';
      const label = event.type === 'goal' ? 'Goal' : event.type === 'yellow' ? 'Yellow card' : 'Red card';
      const teamName = event.team === 'home' ? m.home : m.away;

      return `
        <div class="event-row">
          <span class="${iconClass}"><i class="fa-solid ${icon}"></i></span>
          <div class="event-main">${esc(event.player)} <span class="event-meta">${label} · ${esc(teamName)}</span></div>
          <span class="event-meta" style="color:var(--sub); font-size:12px;">${event.minute}'</span>
          <button class="mini-btn danger" onclick="deleteEvent(${m.id}, ${event.id})" title="Remove event">Remove</button>
        </div>
      `;
    }).join('')
    : `<div style="text-align:center; color:var(--sub); font-size:12px; padding:14px;">No events added yet.</div>`;

  const deleteButton = isAdmin()
    ? `<button class="mini-btn danger" onclick="deleteMatch(${m.id})">Delete Match</button>`
    : '';

  const eventForm = locked
    ? `<div style="text-align:center; color:var(--sub); font-size:12px; padding:10px;">Reopen the match to add or remove events.</div>`
    : `
      <form class="auth-form" onsubmit="handleAddEvent(event)">
        <div class="form-row">
          <div class="form-group">
            <label>Event</label>
            <select name="type">
              <option value="goal">⚽ Goal</option>
              <option value="yellow">🟨 Yellow card</option>
              <option value="red">🟥 Red card</option>
            </select>
          </div>
          <div class="form-group">
            <label>Team</label>
            <select name="teamId">
              <option value="${m.homeTeamId}">${esc(m.home)}</option>
              <option value="${m.awayTeamId}">${esc(m.away)}</option>
            </select>
          </div>
          <div class="form-group">
            <label>Minute</label>
            <input type="number" name="minute" min="1" max="120" value="1" required />
          </div>
        </div>
        <div class="form-group">
          <label>Player</label>
          <input name="playerName" list="squadNames" placeholder="Player name" minlength="2" maxlength="60" required />
          <datalist id="squadNames">${datalist}</datalist>
        </div>
        <div id="manageError" style="color:#f87171; font-size:12px; min-height:16px;"></div>
        <button type="submit" class="form-submit-btn">Add Event</button>
      </form>
    `;

  document.getElementById('manageModalBody').innerHTML = `
    <div style="text-align:center; margin-bottom:12px;">
      <div style="font-size:12px; color:var(--sub);">${esc(m.home)} vs ${esc(m.away)}</div>
      <h2 style="font-size:34px; font-family:'Barlow Condensed';">${m.homeScore} - ${m.awayScore}</h2>
      <div style="font-size:12px; color:var(--sub);">Status: <strong style="color:var(--text);">${statusLabel}</strong></div>
    </div>

    <div class="match-actions" style="margin-bottom:16px;">
      <button class="mini-btn" onclick="changeMatchStatus('upcoming')"${m.status === 'upcoming' ? ' disabled' : ''}>Set Upcoming</button>
      <button class="mini-btn accent" onclick="changeMatchStatus('live')"${m.status === 'live' ? ' disabled' : ''}>Set Live</button>
      <button class="mini-btn" onclick="changeMatchStatus('finished')"${m.status === 'finished' ? ' disabled' : ''}>Finish Match</button>
      ${deleteButton}
    </div>

    <div class="lineup-section-title">Events (${m.events.length})</div>
    <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px;">${eventRows}</div>

    <div class="lineup-section-title">Add Event</div>
    ${eventForm}
  `;
}

async function handleAddEvent(event) {
  event.preventDefault();

  const form = event.target;
  const button = form.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.teamId = Number(payload.teamId);
  payload.minute = Number(payload.minute);

  showManageError('');
  setBusy(button, true, 'Adding…');

  try {
    const { match } = await api(`/matches/${state.manageMatch.id}/events`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    state.manageMatch = match;
    renderManageModal();
    await refreshLeagueSilently();
  } catch (error) {
    showManageError(error.message);
  } finally {
    setBusy(button, false);
  }
}

async function deleteEvent(matchId, eventId) {
  if (!confirm('Remove this event from the match?')) return;

  try {
    const { match } = await api(`/matches/${matchId}/events/${eventId}`, { method: 'DELETE' });
    state.manageMatch = match;
    renderManageModal();
    await refreshLeagueSilently();
  } catch (error) {
    showManageError(error.message);
  }
}

async function changeMatchStatus(status) {
  try {
    const { match } = await api(`/matches/${state.manageMatch.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    state.manageMatch = match;
    renderManageModal();
    await refreshLeagueSilently();
  } catch (error) {
    showManageError(error.message);
  }
}

async function deleteMatch(id) {
  if (!isAdmin()) return;
  if (!confirm('Delete this match permanently?')) return;

  try {
    await api(`/matches/${id}`, { method: 'DELETE' });
    closeManageModal();

    if (state.activeMatchId === id) closeModal();
    state.manageMatch = null;

    await refreshLeagueSilently();
  } catch (error) {
    alert(error.message);
  }
}

/* ── admin panel ─────────────────────────────────────────────── */

function closeAdminPanel() {
  document.getElementById('adminModal').classList.remove('open');
}

function closeAdminPanelOnBackdrop(event) {
  if (event.target.id === 'adminModal') closeAdminPanel();
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

async function openAdminPanel() {
  if (!isAdmin()) return;
  state.adminUser = null;
  document.getElementById('adminModal').classList.add('open');
  await loadAdminPanel();
}

async function loadAdminPanel() {
  const body = document.getElementById('adminModalBody');
  body.innerHTML = loadingBlock('Loading registered users…');

  try {
    state.adminData = await api('/admin/users');
    renderAdminUsers();
  } catch (error) {
    body.innerHTML = errorBlock(error.message);
  }
}

function renderAdminUsers() {
  const data = state.adminData;
  if (!data) return;

  const users = data.users.map((user) => `
    <div class="admin-user-row">
      <div class="admin-user-main">
        <div class="admin-user-name">
          ${esc(user.fullName)}
          <span class="role-chip ${user.role}">${user.role}</span>
        </div>
        <div class="admin-user-sub"><i class="fa-solid fa-envelope"></i> ${esc(user.email)}</div>
      </div>
      <div class="admin-user-meta">
        <strong>${user.matchCount}</strong> match${user.matchCount === 1 ? '' : 'es'}<br>
        joined ${esc(formatDateTime(user.createdAt))}
      </div>
      <button class="mini-btn accent" onclick="openAdminUser(${user.id})">View matches</button>
    </div>
  `).join('');

  const empty = `
    <div style="text-align:center; color:var(--sub); font-size:12px; padding:18px;">
      No registered users yet.
    </div>
  `;

  document.getElementById('adminModalBody').innerHTML = `
    <div class="admin-stats">
      <div class="admin-stat"><div class="admin-stat-num">${data.stats.users}</div><div class="admin-stat-lbl">Users</div></div>
      <div class="admin-stat"><div class="admin-stat-num">${data.stats.admins}</div><div class="admin-stat-lbl">Admins</div></div>
      <div class="admin-stat"><div class="admin-stat-num">${data.stats.customMatches}</div><div class="admin-stat-lbl">User Matches</div></div>
      <div class="admin-stat"><div class="admin-stat-num">${data.stats.matches}</div><div class="admin-stat-lbl">All Matches</div></div>
      <div class="admin-stat"><div class="admin-stat-num">${data.stats.events}</div><div class="admin-stat-lbl">Events</div></div>
    </div>

    <div class="admin-section-title">Registered users (${data.users.length})</div>
    ${users || empty}
  `;
}

async function openAdminUser(id) {
  const body = document.getElementById('adminModalBody');
  body.innerHTML = loadingBlock('Loading this user’s matches…');

  try {
    state.adminUser = await api(`/admin/users/${id}/matches`);
    renderAdminUser();
  } catch (error) {
    body.innerHTML = errorBlock(error.message);
  }
}

function backToAdminList() {
  state.adminUser = null;
  renderAdminUsers();
}

function renderAdminUser() {
  const data = state.adminUser;
  if (!data) return;

  const rows = data.matches.map((match) => {
    const statusLabel = match.status.charAt(0).toUpperCase() + match.status.slice(1);
    return `
      <div class="admin-match-row">
        <div class="admin-match-score">${match.homeScore} - ${match.awayScore}</div>
        <div class="admin-match-main">
          <div class="admin-match-title">${esc(match.home)} <span style="color:var(--sub);">vs</span> ${esc(match.away)}</div>
          <div class="admin-match-sub">
            ${esc(match.leagueIcon)} ${esc(match.leagueName)} ·
            ${esc(match.day)} ${esc(match.time)} ·
            <span style="color:${match.status === 'live' ? 'var(--live)' : match.status === 'finished' ? 'var(--sub)' : 'var(--upcoming)'};">${statusLabel}</span>
            · #${match.id}
          </div>
        </div>
        <button class="mini-btn accent" onclick="viewAdminMatch(${match.id})">Open</button>
        <button class="mini-btn danger" onclick="deleteAdminMatch(${match.id})">Delete</button>
      </div>
    `;
  }).join('');

  const empty = `
    <div style="text-align:center; color:var(--sub); font-size:12px; padding:18px;">
      This user has not created any matches yet.
    </div>
  `;

  document.getElementById('adminModalBody').innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:6px;">
      <button class="mini-btn" onclick="backToAdminList()">
        <i class="fa-solid fa-arrow-left"></i> All users
      </button>
      <div style="flex:1; min-width:150px;">
        <div class="admin-user-name">
          ${esc(data.user.fullName)}
          <span class="role-chip ${data.user.role}">${data.user.role}</span>
        </div>
        <div class="admin-user-sub">${esc(data.user.email)} · joined ${esc(formatDateTime(data.user.createdAt))}</div>
      </div>
      <div class="admin-user-meta"><strong>${data.matches.length}</strong> match${data.matches.length === 1 ? '' : 'es'}</div>
    </div>

    <div class="admin-section-title">Created matches (${data.matches.length})</div>
    ${rows || empty}
  `;
}

async function viewAdminMatch(id) {
  const match = state.adminUser && state.adminUser.matches.find((row) => row.id === id);
  closeAdminPanel();

  if (match && match.leagueKey !== state.leagueKey) await switchLeague(match.leagueKey);
  openModal(id);
}

async function deleteAdminMatch(id) {
  if (!isAdmin()) return;
  if (!confirm('Delete this match permanently?')) return;

  try {
    await api(`/matches/${id}`, { method: 'DELETE' });

    if (state.activeMatchId === id) closeModal();
    if (state.manageMatch && state.manageMatch.id === id) {
      state.manageMatch = null;
      closeManageModal();
    }

    await refreshLeagueSilently();

    if (state.adminUser) {
      const userId = state.adminUser.user.id;
      const [list, detail] = await Promise.all([
        api('/admin/users'),
        api(`/admin/users/${userId}/matches`)
      ]);
      state.adminData = list;
      state.adminUser = detail;
      renderAdminUser();
    } else {
      await loadAdminPanel();
    }
  } catch (error) {
    alert(error.message);
  }
}

/* ── authentication ──────────────────────────────────────────── */

function openAuthModal(type) {
  const titleEl = document.getElementById('authModalTitle');
  const bodyEl = document.getElementById('authModalBody');

  if (type === 'login') {
    titleEl.innerText = 'Login to FootHub';
    bodyEl.innerHTML = `
      <form class="auth-form" onsubmit="handleAuthSubmit(event, 'login')">
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" name="email" placeholder="name@example.com" required />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" placeholder="••••••••" required />
        </div>
        <div id="authError" style="color:#f87171; font-size:12px; min-height:16px; margin-bottom:6px;"></div>
        <button type="submit" class="form-submit-btn">Login</button>
      </form>
    `;
  } else {
    titleEl.innerText = 'Create an Account';
    bodyEl.innerHTML = `
      <form class="auth-form" onsubmit="handleAuthSubmit(event, 'register')">
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" name="fullName" placeholder="John Doe" required minlength="2" />
        </div>
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" name="email" placeholder="name@example.com" required />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" placeholder="••••••••" required minlength="6" />
        </div>
        <div id="authError" style="color:#f87171; font-size:12px; min-height:16px; margin-bottom:6px;"></div>
        <button type="submit" class="form-submit-btn">Register</button>
      </form>
    `;
  }

  document.getElementById('authModal').classList.add('open');
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('open');
}

function closeAuthModalOnBackdrop(e) {
  if (e.target.id === 'authModal') closeAuthModal();
}

async function handleAuthSubmit(event, action) {
  event.preventDefault();

  const form = event.target;
  const button = form.querySelector('button[type="submit"]');
  const errorEl = document.getElementById('authError');
  const label = button.innerText;
  const payload = Object.fromEntries(new FormData(form).entries());

  errorEl.textContent = '';
  button.disabled = true;
  button.innerText = 'Please wait…';

  try {
    const result = action === 'login'
      ? await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: payload.email, password: payload.password })
      })
      : await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: payload.fullName,
          email: payload.email,
          password: payload.password
        })
      });

    state.token = result.token;
    state.user = result.user;
    localStorage.setItem(TOKEN_KEY, result.token);

    renderAuthButtons();
    if (isAdmin()) await loadSimulationState();
    if (state.leagues[state.leagueKey]) render();
    closeAuthModal();
  } catch (error) {
    errorEl.textContent = error.message;
  } finally {
    button.disabled = false;
    button.innerText = label;
  }
}

async function restoreSession() {
  if (!state.token) return;

  try {
    const { user } = await api('/auth/me');
    state.user = user;
    renderAuthButtons();
  } catch {
    state.token = null;
    localStorage.removeItem(TOKEN_KEY);
  }
}

function renderAuthButtons() {
  const group = document.getElementById('authButtonGroup');
  const createButton = document.getElementById('createMatchBtn');
  const simulationButton = document.getElementById('simToggleBtn');
  const adminButton = document.getElementById('adminPanelBtn');

  const loggedIn = Boolean(state.user);
  createButton.style.display = loggedIn ? 'inline-flex' : 'none';
  simulationButton.style.display = isAdmin() ? 'flex' : 'none';
  adminButton.style.display = isAdmin() ? 'inline-flex' : 'none';

  if (!loggedIn) {
    group.innerHTML = `
      <button class="auth-btn" onclick="openAuthModal('login')">Login</button>
      <button class="auth-btn primary" onclick="openAuthModal('register')">Register</button>
    `;
    return;
  }

  const roleBadge = isAdmin() ? '<span class="admin-badge">Admin</span>' : '';

  group.innerHTML = `
    <span style="font-size:13px; font-weight:600; color:var(--live); display:flex; align-items:center; gap:6px;">
      👤 Hi, ${esc(state.user.fullName)} ${roleBadge}
    </span>
    <button class="auth-btn" onclick="handleLogout()">Logout</button>
  `;
}

async function handleLogout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    /* token may already be gone */
  }

  state.token = null;
  state.user = null;
  state.manageMatch = null;
  state.adminData = null;
  state.adminUser = null;
  localStorage.removeItem(TOKEN_KEY);
  closeManageModal();
  closeAdminPanel();
  setSimulationUi(true);
  renderAuthButtons();
  render();
}
