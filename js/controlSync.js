/* ============================================================
   controlSync.js
   LAN control plane: run reset/finish + dungeon prizes / medallions.
   Phone / tracker.html POSTs → tracker-server.py → SSE → OBS host.
   ============================================================ */

const CONTROL_CLIENT_ID = (() => {
  try {
    const key = 'lttpTracker.controlClientId';
    let id = localStorage.getItem(key);
    if (!id) {
      id = (globalThis.crypto?.randomUUID?.()
        || (`ctrl-${Date.now()}-${Math.random().toString(16).slice(2)}`));
      localStorage.setItem(key, id);
    }
    return id;
  } catch (e) {
    return `ctrl-${Date.now()}`;
  }
})();

let controlSyncApplying = false;
let lastRunControlId = 0;
let prizesServerUpdatedAt = 0;
let controlEventSource = null;
let prizesPushTimer = null;

function controlApiUrl(path) {
  if (location.protocol === 'file:') return null;
  try {
    return new URL(path, location.origin).href;
  } catch (e) {
    return null;
  }
}

function performFullLocalReset() {
  if (typeof resetTimer === 'function') resetTimer({ archive: true, resetRunState: true });
  if (typeof clearAllEntrancePairings === 'function') clearAllEntrancePairings();
  if (typeof setMedallionRequirement === 'function') {
    setMedallionRequirement('mm', 'unknown');
    setMedallionRequirement('tr', 'unknown');
  }
}

function pushRunControl(action) {
  if (controlSyncApplying) return;
  if (!['reset', 'finish', 'start'].includes(action)) return;
  const url = controlApiUrl('/api/run-control');
  if (!url) return;
  const payload = {
    action,
    updatedAt: Date.now(),
    clientId: CONTROL_CLIENT_ID
  };
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store'
  }).then(res => res.json().catch(() => null)).then(data => {
    if (data && data.ok && data.id) {
      lastRunControlId = Math.max(lastRunControlId, Number(data.id) || 0);
    }
  }).catch(() => {});
}

function applyRunControlCommand(cmd) {
  if (!cmd || !cmd.action) return;
  const id = Number(cmd.id) || 0;
  if (id && id <= lastRunControlId) return;
  if (cmd.clientId && cmd.clientId === CONTROL_CLIENT_ID && id) {
    lastRunControlId = Math.max(lastRunControlId, id);
    return;
  }
  const age = Date.now() - (Number(cmd.updatedAt) || 0);
  if (age > 15000) {
    if (id) lastRunControlId = Math.max(lastRunControlId, id);
    return;
  }
  if (id) lastRunControlId = Math.max(lastRunControlId, id);

  controlSyncApplying = true;
  try {
    if (cmd.action === 'reset') {
      if (typeof resetTimer === 'function') {
        resetTimer({ archive: true, resetRunState: true });
      }
      // Full wipe: entrance notes + medallions (prizes already cleared by resetTimer)
      if (typeof clearAllEntrancePairings === 'function') {
        clearAllEntrancePairings();
      }
      if (typeof setMedallionRequirement === 'function') {
        setMedallionRequirement('mm', 'unknown');
        setMedallionRequirement('tr', 'unknown');
      } else {
        if (typeof mmMedallion !== 'undefined') mmMedallion = 'unknown';
        if (typeof trMedallion !== 'undefined') trMedallion = 'unknown';
        const mm = document.getElementById('mmMed');
        const tr = document.getElementById('trMed');
        if (mm) mm.value = 'unknown';
        if (tr) tr.value = 'unknown';
      }
      if (typeof log === 'function') log('Run reset (remote) — timer, prizes, medallions, entrances', 'ok');
    } else if (cmd.action === 'finish') {
      // Host archives the real run; silent so OBS is not blocked by confirm().
      if (typeof finishActiveRunSession === 'function') {
        const ok = finishActiveRunSession({ silent: true });
        if (!ok && typeof ensureActiveRunSession === 'function') {
          ensureActiveRunSession('remote');
          if (typeof completeActiveRunSession === 'function') completeActiveRunSession('manual');
        }
      }
      if (typeof schedulePushRunHistoryToServer === 'function') schedulePushRunHistoryToServer();
      if (typeof log === 'function') log('Run finished (remote)', 'ok');
    } else if (cmd.action === 'start') {
      if (typeof startTimer === 'function') startTimer(true);
      if (typeof log === 'function') log('Timer started (remote)', 'ok');
    }
  } finally {
    controlSyncApplying = false;
  }
}

function getPrizesPayload() {
  return {
    assignments: (typeof dungeonPrizeAssignments === 'object' && dungeonPrizeAssignments)
      ? { ...dungeonPrizeAssignments }
      : {},
    claims: (typeof dungeonPrizeClaims === 'object' && dungeonPrizeClaims)
      ? { ...dungeonPrizeClaims }
      : {},
    mmMed: (typeof mmMedallion === 'string') ? mmMedallion : 'unknown',
    trMed: (typeof trMedallion === 'string') ? trMedallion : 'unknown',
    updatedAt: Date.now(),
    clientId: CONTROL_CLIENT_ID
  };
}

function pushPrizesToServer() {
  if (controlSyncApplying) return;
  const url = controlApiUrl('/api/prizes');
  if (!url) return;
  const payload = getPrizesPayload();
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store'
  }).then(res => res.json().catch(() => null)).then(data => {
    if (data && data.ok && data.updatedAt) {
      prizesServerUpdatedAt = Number(data.updatedAt) || prizesServerUpdatedAt;
    } else if (data && data.reason === 'stale') {
      prizesServerUpdatedAt = Number(data.updatedAt) || 0;
      applyRemotePrizes(data);
    }
  }).catch(() => {});
}

function schedulePushPrizesToServer() {
  if (controlSyncApplying) return;
  clearTimeout(prizesPushTimer);
  prizesPushTimer = setTimeout(pushPrizesToServer, 150);
}

function applyRemotePrizes(data) {
  if (!data || typeof data !== 'object') return;
  controlSyncApplying = true;
  try {
    if (data.assignments && typeof data.assignments === 'object'
        && typeof dungeonPrizeAssignments === 'object') {
      Object.keys(data.assignments).forEach(k => {
        if (typeof data.assignments[k] === 'string') {
          dungeonPrizeAssignments[k] = data.assignments[k];
        }
      });
      if (typeof persistDungeonPrizeAssignments === 'function') {
        persistDungeonPrizeAssignments();
      }
    }
    if (data.claims && typeof data.claims === 'object'
        && typeof dungeonPrizeClaims === 'object') {
      Object.keys(data.claims).forEach(k => {
        dungeonPrizeClaims[k] = !!data.claims[k];
      });
      if (typeof persistDungeonPrizeClaims === 'function') {
        persistDungeonPrizeClaims();
      }
    }
    if (typeof PRIZE_DUNGEONS !== 'undefined' && Array.isArray(PRIZE_DUNGEONS)
        && typeof renderDungeonPrizeAssignment === 'function') {
      PRIZE_DUNGEONS.forEach(renderDungeonPrizeAssignment);
    }
    if (typeof updateDungeonPrizeSummary === 'function') {
      updateDungeonPrizeSummary(
        (typeof TrackerState !== 'undefined' && TrackerState.save) ? TrackerState.save : {}
      );
    }
    if (typeof syncDungeonPrizesToLogic === 'function') syncDungeonPrizesToLogic();
    if (typeof refreshRoutingAfterPrizeChange === 'function') refreshRoutingAfterPrizeChange();

    const meds = ['unknown', 'bombos', 'ether', 'quake'];
    if (meds.includes(data.mmMed)) {
      if (typeof mmMedallion !== 'undefined') mmMedallion = data.mmMed;
      const sel = document.getElementById('mmMed');
      if (sel) sel.value = data.mmMed;
    }
    if (meds.includes(data.trMed)) {
      if (typeof trMedallion !== 'undefined') trMedallion = data.trMed;
      const sel = document.getElementById('trMed');
      if (sel) sel.value = data.trMed;
    }
    if (typeof lastState !== 'undefined' && lastState && typeof updateMap === 'function') {
      updateMap(lastState);
    }
  } finally {
    controlSyncApplying = false;
  }
}

async function pullPrizesFromServer() {
  const url = controlApiUrl('/api/prizes');
  if (!url) return;
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const remoteAt = Number(data?.updatedAt) || 0;
    if (remoteAt && remoteAt > prizesServerUpdatedAt) {
      prizesServerUpdatedAt = remoteAt;
      applyRemotePrizes(data);
    } else if (!remoteAt) {
      if (!document.body?.classList?.contains('stream-shell')) {
        schedulePushPrizesToServer();
      }
    }
  } catch (e) { /* ignore */ }
}


let liveStateUpdatedAt = 0;

function applyLiveStateSnapshot(data) {
  if (!data || typeof data !== 'object') return;
  // Host that is actively tracking owns SNI — do not overwrite from mirror.
  if (typeof tracking === 'boolean' && tracking) return;
  const remoteAt = Number(data.updatedAt) || 0;
  if (remoteAt && remoteAt < liveStateUpdatedAt) return;
  if (remoteAt) liveStateUpdatedAt = remoteAt;
  if (typeof noteLiveStateReceived === 'function') noteLiveStateReceived();

  // Room/chest completion flags (required for map markers + Spoiler route).
  if (Array.isArray(data.locationFlags) && typeof TrackerState !== 'undefined') {
    try {
      TrackerState.locationFlags = Uint8Array.from(data.locationFlags.map(n => Number(n) & 0xff));
    } catch (e) {
      TrackerState.locationFlags = data.locationFlags;
    }
  }

  const save = data.save;
  if (save && typeof save === 'object') {
    if (typeof TrackerState !== 'undefined') TrackerState.save = save;
    if (typeof updateUI === 'function') updateUI(save);
    // updateMap after locationFlags so Link's House / chests clear correctly.
    if (typeof updateMap === 'function') updateMap(save);
    if (typeof updateRecommendation === 'function') {
      try { updateRecommendation(); } catch (e) { /* ignore */ }
    }
    if (typeof updateDungeonStats === 'function' && typeof TrackerState !== 'undefined' && TrackerState.dungeonStats) {
      // dungeon stats only if provided in meta later
    }
  }
  const meta = data.meta || {};
  if (typeof TrackerState !== 'undefined') {
    if (meta.room != null) TrackerState.room = meta.room;
    if (meta.area != null) TrackerState.area = meta.area;
    if (meta.world) TrackerState.world = meta.world;
    if (meta.gameMode != null) TrackerState.gameMode = meta.gameMode;
    if (meta.playerName) TrackerState.playerName = meta.playerName;
    if (meta.indoors != null) TrackerState.indoors = !!meta.indoors;
    if (meta.playerX != null) TrackerState.playerX = meta.playerX;
    if (meta.playerY != null) TrackerState.playerY = meta.playerY;
    if (meta.playerX != null && typeof renderLivePlayerPosition === 'function') {
      try { renderLivePlayerPosition(); } catch (e) { /* ignore */ }
    }
  }
  try {
    if (meta.room != null && document.getElementById('liveRoom')) {
      document.getElementById('liveRoom').textContent = '0x' + Number(meta.room).toString(16).toUpperCase();
    }
    if (meta.area != null && document.getElementById('liveArea')) {
      document.getElementById('liveArea').textContent = '0x' + Number(meta.area).toString(16).toUpperCase();
    }
    if (meta.gameMode != null && document.getElementById('liveGameMode')) {
      document.getElementById('liveGameMode').textContent =
        '0x' + Number(meta.gameMode).toString(16).padStart(2, '0').toUpperCase();
    }
  } catch (e) {}

  const timer = data.timer || {};
  if (typeof timerElapsedBeforeStart !== 'undefined' && timer.elapsedMs != null) {
    // Mirror display only — do not start a competing timer loop as host.
    timerRunning = false;
    timerElapsedBeforeStart = Math.max(0, Number(timer.elapsedMs) || 0);
    timerStartedAt = 0;
    if (typeof timerAutoStarted !== 'undefined' && timer.started != null) {
      timerAutoStarted = !!timer.started;
    }
    if (typeof renderTimer === 'function') renderTimer();
    if (typeof renderTimerState === 'function') renderTimerState();
    if (typeof updateRandoModeLock === 'function') updateRandoModeLock();
  }
}

async function pullLiveStateFromServer() {
  if (typeof tracking === 'boolean' && tracking) return;
  const url = controlApiUrl('/api/live-state');
  if (!url) return;
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    applyLiveStateSnapshot(data);
  } catch (e) {}
}

function startControlEventStream() {
  if (controlEventSource || location.protocol === 'file:') return;
  const url = controlApiUrl('/api/sync-events');
  if (!url) return;
  try {
    const es = new EventSource(url);
    controlEventSource = es;
    es.addEventListener('run-control', (event) => {
      try {
        applyRunControlCommand(JSON.parse(event.data || '{}'));
      } catch (e) { /* ignore */ }
    });
    es.addEventListener('prizes', (event) => {
      try {
        const data = JSON.parse(event.data || '{}');
        const remoteAt = Number(data.updatedAt) || 0;
        if (remoteAt && remoteAt >= prizesServerUpdatedAt) {
          prizesServerUpdatedAt = remoteAt;
          applyRemotePrizes(data);
        }
      } catch (e) { /* ignore */ }
    });
    es.addEventListener('coaching', (event) => {
      try {
        const data = JSON.parse(event.data);
        applyRemoteCoaching(data);
      } catch (e) { /* ignore */ }
    });
    es.addEventListener('live-state', (event) => {
      try {
        applyLiveStateSnapshot(JSON.parse(event.data || '{}'));
      } catch (e) { /* ignore */ }
    });
    es.addEventListener('run-history', (event) => {
      try {
        applyRemoteRunHistory(JSON.parse(event.data || '{}'));
      } catch (e) { /* ignore */ }
    });
  } catch (e) { /* ignore */ }
}

let runHistoryPushTimer = null;
let runHistoryServerUpdatedAt = 0;

function schedulePushRunHistoryToServer() {
  if (controlSyncApplying) return;
  clearTimeout(runHistoryPushTimer);
  runHistoryPushTimer = setTimeout(pushRunHistoryToServer, 400);
}

function pushRunHistoryToServer() {
  if (controlSyncApplying) return;
  const url = controlApiUrl('/api/run-history');
  if (!url) return;
  const runs = (typeof savedRunHistory !== 'undefined' && Array.isArray(savedRunHistory))
    ? savedRunHistory
    : [];
  const deletedIds = (typeof getDeletedRunIds === 'function')
    ? getDeletedRunIds()
    : [];
  const payload = {
    runs,
    deletedIds,
    updatedAt: Date.now(),
    clientId: CONTROL_CLIENT_ID
  };
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store'
  }).then(res => res.json().catch(() => null)).then(data => {
    if (data && data.ok && data.updatedAt) {
      runHistoryServerUpdatedAt = Number(data.updatedAt) || runHistoryServerUpdatedAt;
    }
  }).catch(() => {});
}

function applyRemoteRunHistory(data) {
  if (!data || !Array.isArray(data.runs)) return;
  if (typeof savedRunHistory === 'undefined') return;
  const remoteAt = Number(data.updatedAt) || 0;
  if (remoteAt && remoteAt < runHistoryServerUpdatedAt) return;
  if (remoteAt) runHistoryServerUpdatedAt = remoteAt;

  controlSyncApplying = true;
  try {
    const byId = new Map();
    (savedRunHistory || []).forEach(r => {
      if (r?.id) byId.set(String(r.id), r);
    });
    const deleted = Array.isArray(data.deletedIds) ? data.deletedIds.map(String) : [];
    if (deleted.length && typeof noteDeletedRunIds === 'function') {
      noteDeletedRunIds(deleted);
    }
    deleted.forEach(id => byId.delete(String(id)));
    data.runs.forEach(r => {
      if (!r?.id || !r.reportData) return;
      if (deleted.includes(String(r.id))) return;
      if (typeof isRunIdDeleted === 'function' && isRunIdDeleted(r.id)) return;
      const existing = byId.get(String(r.id));
      if (!existing || String(r.updatedAt || '') >= String(existing.updatedAt || '')) {
        byId.set(String(r.id), r);
      }
    });
    savedRunHistory = Array.from(byId.values())
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, typeof RUN_HISTORY_LIMIT === 'number' ? RUN_HISTORY_LIMIT : 50);
    try {
      localStorage.setItem(
        typeof RUN_HISTORY_STORAGE_KEY === 'string'
          ? RUN_HISTORY_STORAGE_KEY
          : 'lttpTracker.runHistory.v1',
        JSON.stringify({
          schemaVersion: typeof RUN_HISTORY_SCHEMA_VERSION === 'number'
            ? RUN_HISTORY_SCHEMA_VERSION
            : 1,
          runs: savedRunHistory
        })
      );
    } catch (e) { /* ignore */ }
    if (typeof renderRunHistory === 'function') renderRunHistory();
  } finally {
    controlSyncApplying = false;
  }
}

async function pullRunHistoryFromServer() {
  const url = controlApiUrl('/api/run-history');
  if (!url) return;
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    applyRemoteRunHistory(data);
  } catch (e) { /* ignore */ }
}


let lastCoachingPushAt = 0;

function pushCoachingToServer(payload) {
  if (location.protocol === 'file:') return;
  if (typeof isRaceMode === 'function' && isRaceMode()) return;
  const now = Date.now();
  if (now - lastCoachingPushAt < 200) return;
  lastCoachingPushAt = now;
  const url = controlApiUrl('/api/coaching');
  if (!url) return;
  const body = {
    stuckHtml: payload?.stuckHtml ?? '',
    best: payload?.best ?? null,
    stuckTargetId: payload?.stuckTargetId ?? null,
    updatedAt: now,
    clientId: typeof CONTROL_CLIENT_ID !== 'undefined' ? CONTROL_CLIENT_ID : null
  };
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store'
  }).catch(() => {});
}

function collectCoachingPayload() {
  const stuckEl = document.getElementById('spoilerSuggestion');
  const stuckHtml = stuckEl ? stuckEl.innerHTML : '';
  let best = null;
  const dungeon = document.getElementById('bestDungeon')?.textContent?.trim();
  const reason = document.getElementById('bestReason')?.textContent?.trim();
  const scoreLabel = document.getElementById('bestScore')?.textContent?.trim();
  if (dungeon && dungeon !== '—') {
    best = {
      dungeon,
      reason: reason || '',
      scoreLabel: scoreLabel || '',
      stars: document.getElementById('bestStars')?.textContent?.trim() || '',
      time: document.getElementById('bestTime')?.textContent?.trim() || ''
    };
  }
  const stuckTargetId = (typeof stuckGuideTargetId !== 'undefined' && stuckGuideTargetId)
    ? stuckGuideTargetId
    : null;
  return { stuckHtml, best, stuckTargetId };
}

function applyRemoteCoaching(data) {
  if (!data || typeof data !== 'object') return;
  // If this client just published, skip echo briefly
  if (data.clientId && typeof CONTROL_CLIENT_ID !== 'undefined' &&
      data.clientId === CONTROL_CLIENT_ID) return;
  if (typeof isRaceMode === 'function' && isRaceMode()) return;

  const html = String(data.stuckHtml || '');
  const isArrivalOnly = /Arrived at|Suggest again when you need/i.test(html) && !data.stuckTargetId;
  // Skip stale arrival leftovers so OBS/phone open with a blank Spoiler route panel.
  if (isArrivalOnly || (!html.trim() && !data.stuckTargetId)) {
    return;
  }

  if (html) {
    const out = document.getElementById('spoilerSuggestion');
    if (out) out.innerHTML = html;
  }
  if (data.stuckTargetId && typeof showStuckMapGuide === 'function') {
    const loc = (typeof LOCATIONS !== 'undefined' && LOCATIONS.find(l => l.id === data.stuckTargetId))
      || (typeof DUNGEONS !== 'undefined' && DUNGEONS.find(d => d.id === data.stuckTargetId))
      || null;
    if (loc) {
      try { showStuckMapGuide(loc); } catch (e) { /* ignore */ }
    }
  }
  const best = data.best;
  if (best && typeof best === 'object') {
    const d = document.getElementById('bestDungeon');
    const r = document.getElementById('bestReason');
    const sc = document.getElementById('bestScore');
    const st = document.getElementById('bestStars');
    const tm = document.getElementById('bestTime');
    if (d && best.dungeon) d.textContent = best.dungeon;
    if (r && best.reason != null) r.textContent = best.reason;
    if (sc && best.scoreLabel != null) sc.textContent = best.scoreLabel;
    if (st && best.stars != null) st.textContent = best.stars;
    if (tm && best.time != null) tm.textContent = best.time;
  }
}

async function pullCoachingFromServer() {
  const url = controlApiUrl('/api/coaching');
  if (!url) return;
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    applyRemoteCoaching(data);
  } catch (e) { /* ignore */ }
}

function ensureRemoteRunControls() {
  if (document.body?.classList?.contains('stream-shell')) return;
  if (document.getElementById('remoteRunControls')) return;
  const host = document.querySelector('.timer-controls') || document.getElementById('timerBlock');
  if (!host) return;
  const bar = document.createElement('div');
  bar.id = 'remoteRunControls';
  bar.className = 'remote-run-controls';
  bar.innerHTML =
    '<button type="button" id="lanControlToggle" class="ghost lan-control-toggle" aria-expanded="false" aria-controls="lanControlMenu">' +
      'LAN control ▾' +
    '</button>' +
    '<div id="lanControlMenu" class="lan-control-menu" hidden role="menu">' +
      '<button type="button" id="remoteResetRun" class="ghost" role="menuitem">Reset run (all devices)</button>' +
      '<button type="button" id="remoteFinishRun" class="ghost" role="menuitem">Finish run (all devices)</button>' +
    '</div>';
  host.appendChild(bar);

  const toggle = document.getElementById('lanControlToggle');
  const menu = document.getElementById('lanControlMenu');
  const placeMenu = () => {
    if (!menu || !toggle || menu.hidden) return;
    // Fixed position so overflow:hidden ancestors cannot clip the menu on phones.
    const r = toggle.getBoundingClientRect();
    const width = Math.min(280, Math.max(200, window.innerWidth - 16));
    let left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    let top = r.bottom + 6;
    menu.style.position = 'fixed';
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.right = 'auto';
    menu.style.minWidth = width + 'px';
    menu.style.zIndex = '4000';
    // If it would go off the bottom, open upward.
    requestAnimationFrame(() => {
      const mh = menu.offsetHeight || 0;
      if (top + mh > window.innerHeight - 8 && r.top > mh + 8) {
        menu.style.top = Math.max(8, r.top - mh - 6) + 'px';
      }
    });
  };
  const setOpen = (open) => {
    if (!menu || !toggle) return;
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.textContent = open ? 'LAN control ▴' : 'LAN control ▾';
    bar.classList.toggle('open', open);
    if (open) placeMenu();
    else {
      menu.style.position = '';
      menu.style.left = '';
      menu.style.top = '';
      menu.style.right = '';
      menu.style.minWidth = '';
      menu.style.zIndex = '';
    }
  };
  toggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(menu?.hidden !== false);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!bar.contains(e.target) && !menu.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
  window.addEventListener('resize', () => { if (bar.classList.contains('open')) placeMenu(); });
  window.addEventListener('scroll', () => { if (bar.classList.contains('open')) placeMenu(); }, true);

  document.getElementById('remoteResetRun')?.addEventListener('click', () => {
    setOpen(false);
    if (!window.confirm('Reset the run on ALL devices (phone, PC, OBS)? Clears timer, prizes, MM/TR, entrance notes.')) return;
    performFullLocalReset();
    pushRunControl('reset');
  });
  document.getElementById('remoteFinishRun')?.addEventListener('click', () => {
    setOpen(false);
    // Controllers without SNI should not archive a hollow local session —
    // the host (OBS) owns the real report data.
    const isHost = typeof tracking === 'boolean' && tracking;
    if (isHost && typeof finishActiveRunSession === 'function') {
      finishActiveRunSession({ silent: false });
    }
    pushRunControl('finish');
  });
}

function initControlSync() {
  startControlEventStream();
  pullPrizesFromServer();
  pullLiveStateFromServer();
  pullRunHistoryFromServer();
  pullCoachingFromServer();
  const ms = document.body?.classList?.contains('stream-shell') ? 2000 : 5000;
  setInterval(pullPrizesFromServer, ms);
  // Controllers mirror host items/map/timer
  setInterval(pullLiveStateFromServer, document.body?.classList?.contains('stream-shell') ? 3000 : 350);
  // Run history merge (phone ↔ OBS)
  setInterval(pullRunHistoryFromServer, 8000);

  document.getElementById('timerReset')?.addEventListener('click', () => {
    setTimeout(() => {
      if (controlSyncApplying) return;
      // timer.js already reset timer; finish the full wipe + broadcast
      if (typeof clearAllEntrancePairings === 'function') clearAllEntrancePairings();
      if (typeof setMedallionRequirement === 'function') {
        setMedallionRequirement('mm', 'unknown');
        setMedallionRequirement('tr', 'unknown');
      }
      pushRunControl('reset');
    }, 0);
  });
  document.getElementById('finishRunButton')?.addEventListener('click', () => {
    setTimeout(() => {
      if (!controlSyncApplying) pushRunControl('finish');
    }, 0);
  });

  ensureRemoteRunControls();
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initControlSync, 0);
});
