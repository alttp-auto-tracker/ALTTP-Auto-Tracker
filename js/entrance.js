/* ============================================================
   entrance.js
   Manual entrance pairing (lightweight).

   Race rule: player-entered facts only. Under Entrance shuffle the
   tracker does not assume vanilla overworld paths. When the runner
   records "this hole leads to EP", that fact is stored locally and
   can restore entry availability for that dungeon once the hole is
   reachable with current items + door requirements (medallion / GT
   crystals / rain). Practice-friendly; safe in Race Legal because
   nothing is inferred beyond what the player typed.
   ============================================================ */

const ENTRANCE_PAIRING_STORAGE_KEY = 'entrancePairings';

/** Destinations the runner can assign to a found entrance. */
const ENTRANCE_DESTINATIONS = [
  { key: '', label: '— unknown —' },
  { key: 'hyruleCastle', label: 'Hyrule Castle / Escape', abbr: 'HC' },
  { key: 'easternPalace', label: 'Eastern Palace', abbr: 'EP' },
  { key: 'desertPalace', label: 'Desert Palace', abbr: 'DP' },
  { key: 'towerOfHera', label: 'Tower of Hera', abbr: 'ToH' },
  { key: 'agahnimsTower', label: "Agahnim's Tower", abbr: 'AT' },
  { key: 'palaceOfDarkness', label: 'Palace of Darkness', abbr: 'PoD' },
  { key: 'swampPalace', label: 'Swamp Palace', abbr: 'SP' },
  { key: 'skullWoods', label: 'Skull Woods', abbr: 'SW' },
  { key: 'thievesTown', label: "Thieves' Town", abbr: 'TT' },
  { key: 'icePalace', label: 'Ice Palace', abbr: 'IP' },
  { key: 'miseryMire', label: 'Misery Mire', abbr: 'MM' },
  { key: 'turtleRock', label: 'Turtle Rock', abbr: 'TR' },
  { key: 'ganonsTower', label: "Ganon's Tower", abbr: 'GT' }
];

/**
 * Sources = places the runner can mark as "I found this entrance".
 * Uses existing map marker / dungeon ids so reachability can reuse
 * LOCATIONS[].need and DUNGEONS[].entryNeed path logic later.
 */
const ENTRANCE_PAIRABLE_MARKER_IDS = new Set([
  'links_house','sanctuary','escape_sewers','kakariko_well','blind_hideout',
  'chicken_house','tavern','aginah','checkerboard','cave45','sahasrahla_hut',
  'ice_rod_cave','mini_moldorm_cave','paradox_cave','spiral_cave',
  'spectacle_rock_cave','mimic_cave','hookshot_cave','superbunny_cave',
  'spike_cave','hype_cave','mire_shed','brewery','c_house','chest_game',
  'hammer_pegs','lw_hideout'
]);

function isPairableMarkerId(markerId){
  return ENTRANCE_PAIRABLE_MARKER_IDS.has(markerId);
}

function sourceIdForMapMarker(loc, isDungeon){
  if(isDungeon && loc?.key) return 'dungeon:' + loc.key;
  if(loc?.id && isPairableMarkerId(loc.id)) return 'marker:' + loc.id;
  return null;
}

function isMapMarkerPairable(loc, isDungeon){
  return !!sourceIdForMapMarker(loc, isDungeon);
}

let entrancePairPickerEl = null;
let entrancePairPickerSourceId = null;

function ensureEntrancePairPicker(){
  if(entrancePairPickerEl) return entrancePairPickerEl;
  const el = document.createElement('div');
  el.id = 'entrancePairPicker';
  el.className = 'entrance-pair-picker';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Record entrance pairing');
  el.innerHTML = `
    <div class="entrance-pair-picker-header">
      <strong id="entrancePairPickerTitle">Entrance</strong>
      <button type="button" class="entrance-pair-picker-close" id="entrancePairPickerClose" title="Close">×</button>
    </div>
    <label class="entrance-pair-picker-label" for="entrancePairPickerSelect">Leads to</label>
    <select id="entrancePairPickerSelect" aria-label="Dungeon this entrance leads to"></select>
    <div class="entrance-pair-picker-actions">
      <button type="button" class="ghost" id="entrancePairPickerClear">Clear</button>
      <button type="button" class="ghost" id="entrancePairPickerDone">Done</button>
    </div>
    <p class="entrance-pair-picker-hint">Player-entered · race-legal</p>
  `;
  document.body.appendChild(el);

  const select = el.querySelector('#entrancePairPickerSelect');
  select.innerHTML = ENTRANCE_DESTINATIONS.map(d =>
    `<option value="${d.key}">${d.abbr || d.label}</option>`
  ).join('');

  el.querySelector('#entrancePairPickerClose').addEventListener('click', hideEntrancePairPicker);
  el.querySelector('#entrancePairPickerDone').addEventListener('click', hideEntrancePairPicker);
  el.querySelector('#entrancePairPickerClear').addEventListener('click', () => {
    if(!entrancePairPickerSourceId) return;
    setEntrancePairing(entrancePairPickerSourceId, '');
    select.value = '';
    if(typeof log === 'function') log(`Entrance pairing cleared: ${sourceLabel(entrancePairPickerSourceId)}`, 'ok');
  });
  select.addEventListener('change', () => {
    if(!entrancePairPickerSourceId) return;
    setEntrancePairing(entrancePairPickerSourceId, select.value);
    if(typeof log === 'function'){
      log(
        select.value
          ? `Entrance: ${sourceLabel(entrancePairPickerSourceId)} → ${destinationLabel(select.value)}`
          : `Entrance pairing cleared: ${sourceLabel(entrancePairPickerSourceId)}`,
        'ok'
      );
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if(!entrancePairPickerEl || entrancePairPickerEl.hidden) return;
    if(entrancePairPickerEl.contains(event.target)) return;
    // Clicks on markers re-open picker; ignore those via stopPropagation on marker.
    if(event.target.closest?.('.marker')) return;
    hideEntrancePairPicker();
  });
  document.addEventListener('keydown', (event) => {
    if(event.key === 'Escape' && entrancePairPickerEl && !entrancePairPickerEl.hidden){
      hideEntrancePairPicker();
    }
  });

  entrancePairPickerEl = el;
  return el;
}

function positionEntrancePairPicker(anchorEl){
  const el = ensureEntrancePairPicker();
  if(!anchorEl){
    el.style.left = '50%';
    el.style.top = '30%';
    el.style.transform = 'translate(-50%, 0)';
    return;
  }
  el.style.transform = '';
  const rect = anchorEl.getBoundingClientRect();
  const gap = 10;
  // Measure after visible
  el.hidden = false;
  const width = el.offsetWidth || 220;
  const height = el.offsetHeight || 140;
  let left = rect.right + gap;
  let top = rect.top;
  if(left + width > window.innerWidth - 8) left = rect.left - width - gap;
  if(left < 8) left = 8;
  top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - height - 8));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

function showEntrancePairPicker(sourceId, title, anchorEl){
  if(!sourceId || !isEntrancePairingActive()) return;
  const el = ensureEntrancePairPicker();
  entrancePairPickerSourceId = sourceId;
  const titleEl = el.querySelector('#entrancePairPickerTitle');
  if(titleEl) titleEl.textContent = title || sourceLabel(sourceId);
  const select = el.querySelector('#entrancePairPickerSelect');
  if(select) select.value = getPairedDestination(sourceId) || '';
  el.hidden = false;
  positionEntrancePairPicker(anchorEl);
  select?.focus();
}

function hideEntrancePairPicker(){
  if(!entrancePairPickerEl) return;
  entrancePairPickerEl.hidden = true;
  entrancePairPickerSourceId = null;
}

/** Map marker click hook — returns true if pairing UI was opened. */
function handleMapMarkerEntrancePairClick(loc, isDungeon, markerEl){
  if(!isEntrancePairingActive()) return false;
  const sourceId = sourceIdForMapMarker(loc, isDungeon);
  if(!sourceId) return false;
  const title = isDungeon
    ? ((loc.abbr || '') + ' door').trim() || loc.name
    : loc.name;
  showEntrancePairPicker(sourceId, title, markerEl);
  const info = document.getElementById('mapInfo');
  if(info){
    const current = getPairedDestination(sourceId);
    info.innerHTML = current
      ? `<b>${title}</b> — leads to <b>${destinationLabel(current)}</b>. Change below or in Entrance Notes.`
      : `<b>${title}</b> — pick which dungeon this entrance leads to (player-entered, race-legal).`;
  }
  return true;
}


function getEntrancePairingSources(){
  const sources = [];
  // Dungeon exterior markers (vanilla positions — still useful as labels
  // the runner recognizes when they walk into that hole).
  if(typeof DUNGEONS !== 'undefined'){
    DUNGEONS.forEach(d => {
      sources.push({
        id: 'dungeon:' + d.key,
        kind: 'dungeon',
        dungeonKey: d.key,
        label: d.name + ' (door)',
        abbr: d.abbr,
        world: d.world
      });
    });
  }
  // Standalone markers that are commonly entrances / caves under ER.
  if(typeof LOCATIONS !== 'undefined'){
    LOCATIONS.forEach(loc => {
      if(!isPairableMarkerId(loc.id)) return;
      sources.push({
        id: 'marker:' + loc.id,
        kind: 'marker',
        markerId: loc.id,
        label: loc.name,
        abbr: loc.name.length > 14 ? loc.name.slice(0, 12) + '…' : loc.name,
        world: loc.world
      });
    });
  }
  return sources;
}

function defaultEntrancePairings(){
  return {};
}

function loadEntrancePairings(){
  const defaults = defaultEntrancePairings();
  try{
    const saved = JSON.parse(localStorage.getItem(ENTRANCE_PAIRING_STORAGE_KEY) || '{}');
    if(saved && typeof saved === 'object'){
      Object.keys(saved).forEach(sourceId => {
        const dest = saved[sourceId];
        if(typeof dest === 'string' && ENTRANCE_DESTINATIONS.some(d => d.key === dest)){
          defaults[sourceId] = dest;
        }
      });
    }
  }catch(error){
    console.warn('Could not restore entrance pairings:', error);
  }
  return defaults;
}

let entrancePairings = loadEntrancePairings();

/* ---- LAN entrance pairing sync (phone ↔ PC ↔ OBS) ----
   Requires tracker-server.py (the start-tracker-* launchers use it).
   Same origin as the page: GET/POST /api/entrance-pairings
   file:// or plain http.server without the API → sync quietly disabled.
*/
const ENTRANCE_SYNC_POLL_MS =
  (typeof document !== 'undefined' && document.body?.classList?.contains('stream-shell'))
    ? 1000
    : 1500;
let entranceSyncClientId = null;
let entranceSyncUpdatedAt = 0;
let entranceSyncTimer = null;
let entranceSyncAvailable = null; // null unknown, true/false after first probe
let entranceSyncApplying = false;

function getEntranceSyncClientId(){
  if(entranceSyncClientId) return entranceSyncClientId;
  try{
    entranceSyncClientId = sessionStorage.getItem('entranceSyncClientId');
    if(!entranceSyncClientId){
      entranceSyncClientId = 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      sessionStorage.setItem('entranceSyncClientId', entranceSyncClientId);
    }
  }catch(e){
    entranceSyncClientId = 'c_' + Math.random().toString(36).slice(2, 12);
  }
  return entranceSyncClientId;
}

function entranceSyncApiUrl(){
  // Same host the page was loaded from (phone LAN IP or localhost).
  try{
    if(location.protocol === 'file:') return null;
    return new URL('/api/entrance-pairings', location.origin).href;
  }catch(e){
    return null;
  }
}

async function pushEntrancePairingsToServer(){
  const url = entranceSyncApiUrl();
  if(!url || entranceSyncApplying) return;
  const payload = {
    pairings: {...entrancePairings},
    updatedAt: Date.now(),
    clientId: getEntranceSyncClientId()
  };
  try{
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    if(res.status === 404) return;
    const data = await res.json().catch(() => null);
    if(res.ok && data){
      entranceSyncAvailable = true;
      entranceSyncUpdatedAt = Number(data.updatedAt) || payload.updatedAt;
    }else if(res.status === 409 && data?.pairings){
      // Server has newer data — adopt it.
      entranceSyncAvailable = true;
      applyRemoteEntrancePairings(data.pairings, Number(data.updatedAt) || 0, data.clientId);
    }
  }catch(e){
    // Offline / file server without API — retry next edit / poll.
  }
}

function applyRemoteEntrancePairings(pairings, updatedAt, remoteClientId){
  if(!pairings || typeof pairings !== 'object') return;
  if(remoteClientId && remoteClientId === getEntranceSyncClientId()){
    entranceSyncUpdatedAt = Math.max(entranceSyncUpdatedAt, Number(updatedAt) || 0);
    return;
  }
  const next = {};
  Object.keys(pairings).forEach(k => {
    if(typeof pairings[k] === 'string' && pairings[k]) next[k] = pairings[k];
  });
  const prev = JSON.stringify(entrancePairings);
  const incoming = JSON.stringify(next);
  if(prev === incoming){
    entranceSyncUpdatedAt = Math.max(entranceSyncUpdatedAt, Number(updatedAt) || 0);
    return;
  }
  entranceSyncApplying = true;
  entrancePairings = next;
  entranceSyncUpdatedAt = Number(updatedAt) || Date.now();
  try{
    localStorage.setItem(ENTRANCE_PAIRING_STORAGE_KEY, JSON.stringify(entrancePairings));
  }catch(e){ /* ignore */ }
  renderEntrancePairingsPanel();
  if(typeof syncEntrancePairingMapNotes === 'function') syncEntrancePairingMapNotes();
  if(typeof refreshLogicForModeChange === 'function') refreshLogicForModeChange();
  entranceSyncApplying = false;
  if(typeof log === 'function'){
    const n = Object.keys(entrancePairings).length;
    log(n ? `Entrance notes synced (${n})` : 'Entrance notes synced (cleared)', 'ok');
  }
  if(typeof updateStreamSyncStatus==='function'){
    updateStreamSyncStatus('entrances', true);
  }
}

async function pullEntrancePairingsFromServer(){
  const url = entranceSyncApiUrl();
  if(!url) return;
  try{
    const res = await fetch(url, {method: 'GET', cache: 'no-store'});
    // Do not permanently disable on 404 — server may come up after OBS loads.
    if(res.status === 404 || !res.ok) return;
    const data = await res.json();
    entranceSyncAvailable = true;
    const remoteAt = Number(data.updatedAt) || 0;
    if(remoteAt > entranceSyncUpdatedAt){
      applyRemoteEntrancePairings(data.pairings || {}, remoteAt, data.clientId);
    }
  }catch(e){
    // Transient network blip — keep trying.
  }
}


let entrancePairingEventSource=null;

function startEntrancePairingEventStream(){
  if(entrancePairingEventSource || location.protocol==='file:') return;
  let url;
  try{ url=new URL('/api/sync-events', location.origin).href; }
  catch(e){ return; }
  try{
    const es=new EventSource(url);
    entrancePairingEventSource=es;
    es.addEventListener('entrance-pairings', (event)=>{
      try{
        const data=JSON.parse(event.data||'{}');
        const remoteAt=Number(data.updatedAt)||0;
        if(remoteAt && remoteAt>=entranceSyncUpdatedAt){
          applyRemoteEntrancePairings(data.pairings||{}, remoteAt, data.clientId);
        }
      }catch(e){ /* ignore */ }
    });
    es.onerror=()=>{ /* auto-reconnect */ };
  }catch(e){ /* ignore */ }
}

function startEntrancePairingSync(){
  if(entranceSyncTimer) return;
  if(!entranceSyncApiUrl()) return;
  // Push channel first — OBS throttles timers hard while streaming.
  startEntrancePairingEventStream();
  pullEntrancePairingsFromServer();
  // Slow poll backup only.
  const pollMs = Math.max(ENTRANCE_SYNC_POLL_MS, 5000);
  entranceSyncTimer = setInterval(pullEntrancePairingsFromServer, pollMs);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible'){
      pullEntrancePairingsFromServer();
      if(!entrancePairingEventSource || entrancePairingEventSource.readyState===2){
        try{ entrancePairingEventSource?.close(); }catch(e){}
        entrancePairingEventSource=null;
        startEntrancePairingEventStream();
      }
    }
  });
}

function persistEntrancePairings(){
  try{
    localStorage.setItem(ENTRANCE_PAIRING_STORAGE_KEY, JSON.stringify(entrancePairings));
  }catch(error){
    console.warn('Could not save entrance pairings:', error);
  }
  if(!entranceSyncApplying){
    entranceSyncUpdatedAt = Date.now();
    pushEntrancePairingsToServer();
  }
}

function setEntrancePairing(sourceId, destinationKey){
  if(!sourceId) return;
  if(!destinationKey){
    delete entrancePairings[sourceId];
  }else{
    // One destination per source; also drop any other source pointing at the
    // same dungeon so the map does not claim two doors for one interior.
    Object.keys(entrancePairings).forEach(id => {
      if(entrancePairings[id] === destinationKey && id !== sourceId){
        delete entrancePairings[id];
      }
    });
    entrancePairings[sourceId] = destinationKey;
  }
  persistEntrancePairings();
  renderEntrancePairingsPanel();
  syncEntrancePairingMapNotes();
  if(typeof refreshLogicForModeChange === 'function') refreshLogicForModeChange();
}

function clearAllEntrancePairings(){
  entrancePairings = defaultEntrancePairings();
  persistEntrancePairings();
  renderEntrancePairingsPanel();
  syncEntrancePairingMapNotes();
  if(typeof refreshLogicForModeChange === 'function') refreshLogicForModeChange();
}

/** Resolve a pairing source id to the map marker element(s). */
function findMapMarkersForPairingSource(sourceId){
  if(!sourceId) return [];
  let matchId = null;
  if(sourceId.startsWith('marker:')){
    matchId = sourceId.slice('marker:'.length);
  }else if(sourceId.startsWith('dungeon:')){
    const dungeonKey = sourceId.slice('dungeon:'.length);
    const dungeon = (typeof DUNGEONS !== 'undefined')
      ? DUNGEONS.find(d => d.key === dungeonKey)
      : null;
    matchId = dungeon ? dungeon.id : null;
  }
  if(!matchId) return [];
  return [...document.querySelectorAll('.marker')].filter(el => el.dataset.id === matchId);
}

function setMarkerEntranceNote(markerEl, destKey){
  if(!markerEl) return;
  let note = markerEl.querySelector('.entrance-pair-note');
  if(!destKey){
    if(note) note.remove();
    markerEl.classList.remove('has-entrance-pair');
    // Restore title base from dataset if we stashed it
    if(markerEl.dataset.baseTitle){
      markerEl.title = markerEl.dataset.baseTitle;
    }
    return;
  }
  const abbr = destinationLabel(destKey) || destKey;
  if(!markerEl.dataset.baseTitle){
    markerEl.dataset.baseTitle = markerEl.title || '';
  }
  if(!note){
    note = document.createElement('span');
    note.className = 'entrance-pair-note';
    markerEl.appendChild(note);
  }
  note.textContent = '→' + abbr;
  note.title = 'Leads to ' + abbr + ' (player-entered)';
  markerEl.classList.add('has-entrance-pair');
  const base = markerEl.dataset.baseTitle || markerEl.title || '';
  markerEl.title = base ? `${base} → ${abbr}` : `→ ${abbr}`;
}

/**
 * Paint / clear "→ DP" style notes on map markers for recorded pairings.
 * Race-legal: only shows player-entered facts.
 */
function syncEntrancePairingMapNotes(){
  // Clear notes that no longer have a pairing
  document.querySelectorAll('.marker.has-entrance-pair, .marker .entrance-pair-note').forEach(el => {
    const marker = el.classList?.contains('marker') ? el : el.closest('.marker');
    if(!marker) return;
    // Will re-apply below if still paired
    setMarkerEntranceNote(marker, '');
  });

  if(typeof isEntrancePairingActive === 'function' && !isEntrancePairingActive()){
    return;
  }

  Object.entries(entrancePairings || {}).forEach(([sourceId, destKey]) => {
    if(!destKey) return;
    findMapMarkersForPairingSource(sourceId).forEach(marker => {
      setMarkerEntranceNote(marker, destKey);
    });
  });
}


function getPairedDestination(sourceId){
  return entrancePairings[sourceId] || '';
}

/** Source id that the runner assigned to this dungeon interior, if any. */
function getSourceForDungeon(dungeonKey){
  if(!dungeonKey) return null;
  const entry = Object.entries(entrancePairings).find(([, dest]) => dest === dungeonKey);
  return entry ? entry[0] : null;
}

function isEntrancePairingActive(){
  return typeof isEntranceShuffle === 'function' && isEntranceShuffle();
}

/**
 * Under ER, if the runner paired a reachable hole to this dungeon, treat
 * the dungeon as enterable when door requirements are met.
 * Returns null when no pairing applies (caller keeps default logic).
 */
function canEnterDungeonViaPairing(dungeonKey, save){
  if(!isEntrancePairingActive()) return null;
  const sourceId = getSourceForDungeon(dungeonKey);
  if(!sourceId) return null;

  const doorOk = typeof hasRequirements === 'function'
    ? hasRequirements(save, getDungeonEntryRequirements(dungeonKey), dungeonKey)
    : true;
  if(!doorOk) return false;

  if(sourceId.startsWith('marker:')){
    const markerId = sourceId.slice('marker:'.length);
    const loc = (typeof LOCATIONS !== 'undefined')
      ? LOCATIONS.find(l => l.id === markerId)
      : null;
    if(!loc || typeof loc.need !== 'function') return true; // paired but no need fn
    // Temporarily ignore entrance-shuffle suppression of overworld availability
    // by evaluating the marker's need against the save directly.
    try{
      return !!loc.need(save);
    }catch(e){
      return true;
    }
  }

  if(sourceId.startsWith('dungeon:')){
    // Paired "vanilla door marker" → some interior. Under ER the physical
    // hole is still at that map spot only if the runner chose that label;
    // we treat the pairing as "I can open this door once door items are met"
    // (reachability of the hole itself is left to the runner).
    return true;
  }

  return true;
}

function destinationLabel(key){
  const found = ENTRANCE_DESTINATIONS.find(d => d.key === key);
  return found ? (found.abbr || found.label) : key || '—';
}

function sourceLabel(sourceId){
  const sources = getEntrancePairingSources();
  const found = sources.find(s => s.id === sourceId);
  return found ? found.label : sourceId;
}

function applyEntrancePairingPanelVisibility(){
  const panel = document.getElementById('entrancePairingPanel');
  if(!panel) return;
  const show = isEntrancePairingActive();
  panel.hidden = !show;
}

function renderEntrancePairingsPanel(){
  const list = document.getElementById('entrancePairingList');
  const countEl = document.getElementById('entrancePairingCount');
  if(!list) return;

  const sources = getEntrancePairingSources();
  const pairedCount = Object.keys(entrancePairings).filter(k => entrancePairings[k]).length;
  if(countEl) countEl.textContent = pairedCount ? `${pairedCount} recorded` : 'None recorded';

  // Show paired rows first, then a compact "add" area with all sources.
  const pairedIds = Object.keys(entrancePairings).filter(id => entrancePairings[id]);
  const rows = [];

  pairedIds.forEach(sourceId => {
    const dest = entrancePairings[sourceId];
    const src = sources.find(s => s.id === sourceId);
    const label = src ? src.label : sourceId;
    const world = src ? src.world : '';
    rows.push(`<div class="entrance-pair-row" data-source="${escapeAttr(sourceId)}">
      <span class="entrance-pair-source" title="${escapeAttr(label)}">${escapeHtml(label)}${world ? ` <small>${world === 'dark' ? 'DW' : 'LW'}</small>` : ''}</span>
      <span class="entrance-pair-arrow" aria-hidden="true">→</span>
      <select class="entrance-pair-dest" data-source="${escapeAttr(sourceId)}" aria-label="Destination for ${escapeAttr(label)}">
        ${ENTRANCE_DESTINATIONS.map(d =>
          `<option value="${escapeAttr(d.key)}"${d.key === dest ? ' selected' : ''}>${escapeHtml(d.abbr || d.label)}</option>`
        ).join('')}
      </select>
      <button type="button" class="ghost entrance-pair-clear" data-source="${escapeAttr(sourceId)}" title="Clear this pairing">×</button>
    </div>`);
  });

  if(!pairedIds.length){
    rows.push(`<p class="entrance-pair-empty">No pairings yet. Pick a hole below and assign the dungeon you found inside.</p>`);
  }

  rows.push(`<div class="entrance-pair-add">
    <label for="entrancePairAddSource">Record entrance</label>
    <div class="entrance-pair-add-row">
      <select id="entrancePairAddSource" aria-label="Entrance hole">
        <option value="">— choose hole / door —</option>
        ${sources.map(s => {
          const already = !!entrancePairings[s.id];
          return `<option value="${escapeAttr(s.id)}"${already ? ' disabled' : ''}>${escapeHtml(s.label)}${s.world === 'dark' ? ' (DW)' : ''}</option>`;
        }).join('')}
      </select>
      <select id="entrancePairAddDest" aria-label="Leads to dungeon">
        ${ENTRANCE_DESTINATIONS.map(d =>
          `<option value="${escapeAttr(d.key)}">${escapeHtml(d.abbr || d.label)}</option>`
        ).join('')}
      </select>
      <button type="button" id="entrancePairAddBtn" class="ghost">Add</button>
    </div>
  </div>`);

  list.innerHTML = rows.join('');

  list.querySelectorAll('.entrance-pair-dest').forEach(sel => {
    sel.addEventListener('change', () => {
      setEntrancePairing(sel.dataset.source, sel.value);
      if(typeof log === 'function'){
        log(`Entrance: ${sourceLabel(sel.dataset.source)} → ${destinationLabel(sel.value) || 'cleared'}`, 'ok');
      }
    });
  });
  list.querySelectorAll('.entrance-pair-clear').forEach(btn => {
    btn.addEventListener('click', () => {
      setEntrancePairing(btn.dataset.source, '');
      if(typeof log === 'function') log(`Entrance pairing cleared: ${sourceLabel(btn.dataset.source)}`, 'ok');
    });
  });
}

function escapeHtml(text){
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text){
  return escapeHtml(text).replace(/'/g, '&#39;');
}


function initEntrancePairings(){
  const panel = document.getElementById('entrancePairingPanel');

  // Always paint map notes + start LAN sync — streamer.html has no panel
  // but still needs phone/desktop pairing edits while OBS is live.
  if(panel){
    applyEntrancePairingPanelVisibility();
    renderEntrancePairingsPanel();

    document.getElementById('entrancePairClearAll')?.addEventListener('click', () => {
      if(!Object.keys(entrancePairings).length) return;
      if(!confirm('Clear all recorded entrance pairings?')) return;
      clearAllEntrancePairings();
      if(typeof log === 'function') log('All entrance pairings cleared', 'ok');
    });

    // Delegated add button (re-rendered, so bind on panel).
    panel.addEventListener('click', event => {
      if(event.target?.id !== 'entrancePairAddBtn') return;
      const sourceSel = document.getElementById('entrancePairAddSource');
      const destSel = document.getElementById('entrancePairAddDest');
      const sourceId = sourceSel?.value || '';
      const dest = destSel?.value || '';
      if(!sourceId || !dest){
        if(typeof log === 'function') log('Pick both a hole and a dungeon to record a pairing.');
        return;
      }
      setEntrancePairing(sourceId, dest);
      if(typeof log === 'function'){
        log(`Entrance: ${sourceLabel(sourceId)} → ${destinationLabel(dest)}`, 'ok');
      }
    });
  }

  syncEntrancePairingMapNotes();
  startEntrancePairingSync();
}
