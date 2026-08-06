/* ============================================================
   spoiler.js
   Practice-only spoiler route helper.

   Load placements from an alttpr seed JSON (when spoilers exist) or
   paste a spoiler log / JSON. Then "Next progression item" finds the
   highest-priority item you do not yet have and where it is.
   ============================================================ */

const SPOILER_STORAGE_KEY = 'lttpTracker.spoilerPlacements.v1';

/** @type {{location:string, item:string, region?:string}[]} */
let spoilerPlacements = [];
let spoilerSourceLabel = '';

/* ---- Progression priority (first missing item is suggested) ----
   Each entry: tracker save key, minimum value required, display name,
   matchers against spoiler item strings. */
const PROGRESSION_PRIORITY = [
  { key: 'boots', min: 1, label: 'Pegasus Boots', match: [/pegasus\s*boots/i, /^boots$/i] },
  { key: 'gloves', min: 1, label: 'Power Glove', match: [/power\s*glove/i, /progressive\s*glove/i, /^gloves?$/i] },
  { key: 'hammer', min: 1, label: 'Hammer', match: [/hammer/i] },
  { key: 'hookshot', min: 1, label: 'Hookshot', match: [/hook\s*shot/i, /hookshot/i] },
  { key: 'firerod', min: 1, label: 'Fire Rod', match: [/fire\s*rod/i] },
  { key: 'flippers', min: 1, label: "Zora's Flippers", match: [/flippers?/i] },
  { key: 'moonpearl', min: 1, label: 'Moon Pearl', match: [/moon\s*pearl/i] },
  { key: 'mirror', min: 1, label: 'Magic Mirror', match: [/magic\s*mirror/i, /^mirror$/i] },
  { key: 'lamp', min: 1, label: 'Lamp', match: [/^lamp$/i, /lantern/i] },
  { key: 'book', min: 1, label: 'Book of Mudora', match: [/book\s*of\s*mudora/i, /^book$/i] },
  { key: 'icerod', min: 1, label: 'Ice Rod', match: [/ice\s*rod/i] },
  { key: 'somaria', min: 1, label: 'Cane of Somaria', match: [/somaria/i] },
  { key: 'bow', min: 1, label: 'Bow', match: [/progressive\s*bow/i, /^bow$/i, /silver\s*arrows?/i] },
  { key: 'gloves', min: 2, label: "Titan's Mitts", match: [/titan'?s?\s*mitt/i] },
  { key: 'sword', min: 2, label: 'Master Sword', match: [/master\s*sword/i, /progressive\s*sword/i, /tempered\s*sword/i, /golden\s*sword/i] },
  { key: 'bombos', min: 1, label: 'Bombos', match: [/^bombos$/i, /bombos\s*medallion/i] },
  { key: 'ether', min: 1, label: 'Ether', match: [/^ether$/i, /ether\s*medallion/i] },
  { key: 'quake', min: 1, label: 'Quake', match: [/^quake$/i, /quake\s*medallion/i] },
  { key: 'cape', min: 1, label: 'Magic Cape', match: [/magic\s*cape/i, /^cape$/i] },
  { key: 'byrna', min: 1, label: 'Cane of Byrna', match: [/byrna/i] },
  { key: 'flute', min: 1, label: 'Flute', match: [/flute/i, /ocarina/i] },
  { key: 'powder', min: 2, label: 'Magic Powder', match: [/magic\s*powder/i, /^powder$/i] },
  { key: 'net', min: 1, label: 'Bug Net', match: [/bug\s*net/i, /^net$/i] },
  { key: 'boomerang', min: 1, label: 'Boomerang', match: [/boomerang/i] }
];

function getSpoilerSaveState() {
  if (typeof TrackerState !== 'undefined' && TrackerState?.save) return TrackerState.save;
  if (typeof lastState !== 'undefined' && lastState) return lastState;
  return null;
}

function playerHasProgressionItem(entry, save) {
  if (!save || !entry) return false;
  const val = Number(save[entry.key]) || 0;
  return val >= (entry.min || 1);
}

function itemMatchesProgression(itemName, entry) {
  if (!itemName || !entry) return false;
  const s = String(itemName);
  return (entry.match || []).some(re => re.test(s));
}

/** Flatten alttpr spoiler JSON (nested regions or flat map) into placements. */
function flattenSpoilerObject(obj, region = '') {
  const out = [];
  if (!obj || typeof obj !== 'object') return out;
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'meta') continue;
    if (val == null) continue;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      const item = String(val).trim();
      if (!item || item === 'None' || item === 'null') continue;
      out.push({ location: key, item, region: region || undefined });
      continue;
    }
    if (typeof val === 'object' && !Array.isArray(val)) {
      // Nested region map: { "Light World": { "Link's House": "Boots" } }
      out.push(...flattenSpoilerObject(val, key));
    }
  }
  return out;
}

/** Parse pasted YAML-ish lines: `Location: Item` or `- Location: Item` */
function parseSpoilerTextLines(text) {
  const out = [];
  const lines = String(text || '').split(/\r?\n/);
  for (const raw of lines) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('- ')) line = line.slice(2).trim();
    // Skip pure section headers
    if (/^[A-Za-z][A-Za-z0-9 '\/-]+$/.test(line) && !line.includes(':')) continue;
    const m = line.match(/^(.+?)\s*:\s*(.+)$/);
    if (!m) continue;
    const location = m[1].trim().replace(/^["']|["']$/g, '');
    const item = m[2].trim().replace(/^["']|["']$/g, '');
    if (!location || !item || item === 'None') continue;
    if (/^(meta|mode|logic|goal|weapons|state|hints|entry_crystals)/i.test(location)) continue;
    out.push({ location, item });
  }
  return out;
}

function parseSpoilerInput(raw) {
  const text = String(raw || '').trim();
  if (!text) return { placements: [], error: 'Empty spoiler input.' };

  // JSON
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const json = JSON.parse(text);
      let placements = [];
      if (Array.isArray(json)) {
        placements = json
          .map(row => {
            if (!row) return null;
            if (row.location && row.item) return { location: String(row.location), item: String(row.item), region: row.region };
            return null;
          })
          .filter(Boolean);
      } else {
        const spoiler = json.spoiler || json;
        placements = flattenSpoilerObject(spoiler);
      }
      if (!placements.length) return { placements: [], error: 'JSON parsed but no location→item pairs found.' };
      return { placements, error: null };
    } catch (e) {
      return { placements: [], error: 'Could not parse JSON: ' + (e.message || e) };
    }
  }

  const placements = parseSpoilerTextLines(text);
  if (!placements.length) {
    return { placements: [], error: 'No location: item lines found. Paste alttpr spoiler JSON or Location: Item lines.' };
  }
  return { placements, error: null };
}

function setSpoilerPlacements(placements, sourceLabel) {
  spoilerPlacements = Array.isArray(placements) ? placements.slice() : [];
  spoilerSourceLabel = sourceLabel || '';
  try {
    localStorage.setItem(SPOILER_STORAGE_KEY, JSON.stringify({
      placements: spoilerPlacements,
      source: spoilerSourceLabel,
      savedAt: Date.now()
    }));
  } catch (e) { /* ignore */ }
  updateSpoilerStatusUI();
}

function clearSpoilerPlacements() {
  spoilerPlacements = [];
  spoilerSourceLabel = '';
  try { localStorage.removeItem(SPOILER_STORAGE_KEY); } catch (e) {}
  updateSpoilerStatusUI();
  const out = document.getElementById('spoilerSuggestion');
  if (out) {
    out.innerHTML = '<p class="stuck-empty">Load a seed with spoilers, then press “Next obtainable item”.</p>';
  }
  if (typeof clearStuckMapGuide === 'function') clearStuckMapGuide();
}

function restoreSpoilerPlacements() {
  try {
    const raw = JSON.parse(localStorage.getItem(SPOILER_STORAGE_KEY) || 'null');
    if (raw && Array.isArray(raw.placements) && raw.placements.length) {
      spoilerPlacements = raw.placements;
      spoilerSourceLabel = raw.source || 'saved';
    }
  } catch (e) { /* ignore */ }
  updateSpoilerStatusUI();
}

function updateSpoilerStatusUI() {
  const status = document.getElementById('spoilerStatus');
  const nextBtn = document.getElementById('spoilerNextBtn');
  const clearBtn = document.getElementById('spoilerClearBtn');
  const n = spoilerPlacements.length;
  if (status) {
    if (!n) {
      status.textContent = 'No spoiler loaded.';
      status.dataset.state = 'empty';
    } else {
      status.textContent = `${n} placements` + (spoilerSourceLabel ? ` · ${spoilerSourceLabel}` : '');
      status.dataset.state = 'ready';
    }
  }
  if (nextBtn) nextBtn.disabled = !n;
  if (clearBtn) clearBtn.disabled = !n;
}

/** Try to map a spoiler location name to a map marker (LOCATIONS / DUNGEONS). */
function findMapLocForSpoilerLocation(locationName) {
  if (!locationName) return null;
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const target = norm(locationName);

  const scoreLoc = (loc, dungeonBias) => {
    if (!loc?.name && !loc?.id) return { loc, score: 0 };
    const names = [loc.name, loc.id, loc.abbr].filter(Boolean).map(norm);
    let score = 0;
    for (const n of names) {
      if (!n) continue;
      if (n === target) score = Math.max(score, 100);
      else if (target.startsWith(n) || n.startsWith(target)) score = Math.max(score, 85);
      else if (target.includes(n) || n.includes(target)) score = Math.max(score, 70);
    }
    // Prefer precise overworld checks over broad dungeon pins for detailed names
    if (dungeonBias && /[-–—]|torch|chest|pot|key/.test(locationName)) {
      score -= 15;
    }
    return { loc, score };
  };

  let best = null;
  let bestScore = 0;
  if (typeof LOCATIONS !== 'undefined') {
    for (const loc of LOCATIONS) {
      const { score } = scoreLoc(loc, false);
      if (score > bestScore) { bestScore = score; best = loc; }
    }
  }
  if (typeof DUNGEONS !== 'undefined') {
    for (const loc of DUNGEONS) {
      const { score } = scoreLoc(loc, true);
      if (score > bestScore) { bestScore = score; best = loc; }
    }
  }
  return bestScore >= 70 ? best : null;
}

function findPlacementsForProgression(entry) {
  return spoilerPlacements.filter(p => itemMatchesProgression(p.item, entry));
}

function getSpoilerPlayerMapPos() {
  if (typeof getStuckPlayerMapPos === 'function') {
    try { return getStuckPlayerMapPos(); } catch (e) { /* ignore */ }
  }
  return null;
}

/**
 * Extra requirements inferred from ALTTPR location *names* when we only
 * matched a dungeon pin (e.g. "Desert Palace - Torch:1" needs Boots).
 * Returns false if the player clearly lacks a required item.
 */
function locationNameRequirementsMet(locationName, save) {
  if (!locationName) return true;
  if (!save) return true;
  const n = String(locationName).toLowerCase();

  const has = (key, min = 1) => (Number(save[key]) || 0) >= min;

  // Boots: torches, bonk rocks, dash chests, many "pegasus" labels
  if (/(?:^|[\s\-])torch(?:es)?(?:$|[\s:\-\d])|bonk|pegasus|dash\s*chest|race\s*game/.test(n)) {
    if (!has('boots')) return false;
  }
  // Hammer pegs
  if (/hammer\s*peg|peg\s*cave/.test(n)) {
    if (!has('hammer')) return false;
  }
  // Hookshot
  if (/hookshot|floating\s*island|walkable\s*water/.test(n) && /hookshot/.test(n)) {
    if (!has('hookshot')) return false;
  }
  // Flippers
  if (/zora'?s?\s*ledge|waterfall\s*fairy|hobo|king\s*zora/.test(n)) {
    if (!has('flippers')) return false;
  }
  // Gloves / mitts (overworld digs & rock lifts beyond free desert entry)
  if (/buried|under\s*rock|lift\s*rock|spectacles\s*rock/.test(n)) {
    if (!has('gloves', 1)) return false;
  }
  if (/dark\s*world|bumper\s*cave|skull\s*woods|ice\s*palace|misery\s*mire|turtle\s*rock|ganon'?s?\s*tower/.test(n)
      && /entrance|exit|ledge/.test(n) === false) {
    // Don't hard-block entire DW regions here — entryNeed handles dungeons.
  }
  // Moon pearl for most DW interior labels
  if (/\[dark|dark\s*world|palace\s*of\s*darkness|swamp\s*palace|thieves|skull\s*woods|ice\s*palace|mire|turtle\s*rock|ganon/.test(n)) {
    // Only force pearl when the check is clearly a dark-world interaction
    if (/dark\s*world|palace\s*of\s*darkness|swamp\s*palace|thieves'?\s*town|skull\s*woods|ice\s*palace|misery\s*mire|turtle\s*rock|ganon'?s?\s*tower/.test(n)) {
      if (!has('moonpearl') && typeof isInvertedWorld === 'function' && !isInvertedWorld()) {
        // Dungeon entryNeed already encodes pearl; keep name-hint light.
      }
    }
  }
  // Fire rod / lamp soft hints
  if (/\bfire\s*rod\b/.test(n) && /chest|pot|room/.test(n)) {
    /* placement name, not requirement */
  }
  // Book for desert ledge / tablet style
  if (/desert\s*(?:palace\s*)?(?:ledge|tablet)|bombos\s*tablet/.test(n)) {
    if (/tablet/.test(n) && !has('book')) return false;
  }

  return true;
}

/** True when the spoiler location string is more specific than a dungeon pin. */
function isDetailedDungeonCheck(locationName, mapLoc) {
  if (!locationName || !mapLoc) return false;
  if (!mapLoc.key && !mapLoc.entryNeed) return false; // not a dungeon pin
  const n = String(locationName).toLowerCase();
  // "Desert Palace - Torch:1" / "Eastern Palace - Big Chest"
  if (/\s[-–—]\s/.test(locationName)) return true;
  if (/torch|big\s*chest|big\s*key|compass|map|boss|pot|dark\s*cross|back\s*room/.test(n)) return true;
  return false;
}

/** Is this map location currently obtainable with public logic + name hints? */
function isSpoilerLocationObtainable(mapLoc, save, locationName) {
  if (!save) return false; // need inventory to claim "obtainable"
  if (!locationNameRequirementsMet(locationName, save)) return false;

  if (!mapLoc) {
    // No map pin — only name heuristics (already applied)
    return locationNameRequirementsMet(locationName, save);
  }

  // Already collected?
  if (typeof mapLoc.checked === 'function') {
    try { if (mapLoc.checked(save)) return false; } catch (e) { /* ignore */ }
  }

  // Dungeon entrance pin
  if (typeof mapLoc.entryNeed === 'function') {
    try { if (!mapLoc.entryNeed(save)) return false; } catch (e) { return false; }
    if (typeof stuckDungeonHasRemaining === 'function') {
      try { if (!stuckDungeonHasRemaining(mapLoc)) return false; } catch (e) { /* ignore */ }
    }
    // Entering the dungeon ≠ reaching every sub-check (Torch needs Boots, etc.)
    if (isDetailedDungeonCheck(locationName, mapLoc)) {
      return locationNameRequirementsMet(locationName, save);
    }
    return true;
  }

  // Overworld / NPC need
  if (typeof mapLoc.need === 'function') {
    try {
      if (!mapLoc.need(save)) return false;
    } catch (e) { return false; }
  }
  return locationNameRequirementsMet(locationName, save);
}

function scoreSpoilerPlacement(place, mapLoc, player) {
  let dist = 500;
  if (mapLoc && player && Number.isFinite(mapLoc.x) && Number.isFinite(mapLoc.y)) {
    const dx = (Number(mapLoc.x) || 0) - (Number(player.x) || 50);
    const dy = (Number(mapLoc.y) || 0) - (Number(player.y) || 50);
    dist = Math.sqrt(dx * dx + dy * dy);
    if (player.world && mapLoc.world && player.world !== mapLoc.world) dist += 1000;
  }
  return dist;
}

/**
 * Highest-priority missing progression item that is placed somewhere
 * currently obtainable. Falls back to unreachable placements if none are.
 */
function findNextProgressionSpoiler(save) {
  const state = save || getSpoilerSaveState() || {};
  const player = getSpoilerPlayerMapPos();

  let fallback = null; // best unreachable (priority order)

  for (const entry of PROGRESSION_PRIORITY) {
    if (playerHasProgressionItem(entry, state)) continue;
    const places = findPlacementsForProgression(entry);
    if (!places.length) continue;

    const scored = places.map(p => {
      const mapLoc = findMapLocForSpoilerLocation(p.location);
      const obtainable = isSpoilerLocationObtainable(mapLoc, state, p.location);
      return {
        place: p,
        mapLoc,
        obtainable,
        dist: scoreSpoilerPlacement(p, mapLoc, player)
      };
    });

    const reachable = scored.filter(s => s.obtainable).sort((a, b) => a.dist - b.dist);
    if (reachable.length) {
      return {
        entry,
        places: reachable.map(s => s.place),
        best: reachable[0],
        obtainable: true
      };
    }

    // Keep first priority item with any placement as unreachable fallback
    if (!fallback) {
      const sorted = scored.slice().sort((a, b) => a.dist - b.dist);
      fallback = {
        entry,
        places: sorted.map(s => s.place),
        best: sorted[0],
        obtainable: false
      };
    }
  }
  return fallback;
}

function renderSpoilerNextSuggestion() {
  const out = document.getElementById('spoilerSuggestion');
  if (!out) return;

  if (typeof isRaceMode === 'function' && isRaceMode()) {
    out.innerHTML = '<p class="stuck-empty">Spoiler route is Practice-only.</p>';
    return;
  }
  if (!spoilerPlacements.length) {
    out.innerHTML = '<p class="stuck-empty">Load a non-race seed (or paste a spoiler) first.</p>';
    return;
  }

  const result = findNextProgressionSpoiler();
  if (!result) {
    out.innerHTML =
      '<p class="stuck-empty">No missing progression items found in this spoiler (or you already have them all).</p>';
    if (typeof clearStuckMapGuide === 'function') clearStuckMapGuide();
    return;
  }

  const { entry, places, best, obtainable } = result;
  const primary = (best && best.place) || places[0];
  const mapLoc = (best && best.mapLoc) || findMapLocForSpoilerLocation(primary.location);
  const extra = places.length > 1
    ? `<p class="spoiler-extra">${places.length - 1} other placement(s) for this item in the spoiler.</p>`
    : '';

  const regionBit = primary.region
    ? `<span class="spoiler-region">${escapeSpoilerHtml(primary.region)}</span>`
    : '';

  const reachNote = obtainable
    ? 'Reachable with your current items (public logic).'
    : 'Not currently reachable — shown as the next priority item still missing.';

  out.innerHTML = `
    <div class="spoiler-card${obtainable ? '' : ' spoiler-unreachable'}">
      <div class="spoiler-item">${escapeSpoilerHtml(entry.label)}</div>
      <div class="spoiler-loc">
        ${regionBit}
        <strong>${escapeSpoilerHtml(primary.location)}</strong>
      </div>
      <p class="spoiler-note">${reachNote}</p>
      ${extra}
    </div>
  `;

  if (mapLoc && typeof showStuckMapGuide === 'function') {
    try { showStuckMapGuide(mapLoc); } catch (e) { /* ignore */ }
  } else if (typeof clearStuckMapGuide === 'function') {
    clearStuckMapGuide();
  }

  if (typeof log === 'function') {
    log(
      `Spoiler next: ${entry.label} @ ${primary.location}` +
        (obtainable ? ' (reachable)' : ' (not reachable yet)'),
      'ok'
    );
  }
}

function escapeSpoilerHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadSpoilerFromParsed(placements, sourceLabel) {
  if (!placements?.length) return false;
  setSpoilerPlacements(placements, sourceLabel);
  if (typeof log === 'function') {
    log(`Spoiler loaded: ${placements.length} placements (${sourceLabel || 'paste'})`, 'ok');
  }
  return true;
}

/** Called from seed.js when full seed JSON is available. */
function ingestSpoilerFromSeedJson(json, seedCode) {
  if (!json) return false;
  const spoiler = json.spoiler || null;
  if (!spoiler || typeof spoiler !== 'object') return false;
  // Race seeds often have meta only
  const placements = flattenSpoilerObject(spoiler);
  if (!placements.length) return false;
  return loadSpoilerFromParsed(placements, seedCode ? `seed ${seedCode}` : 'seed');
}

function applySpoilerPasteFromUI() {
  const ta = document.getElementById('spoilerPaste');
  const info = document.getElementById('spoilerLoadInfo');
  const raw = ta?.value || '';
  const { placements, error } = parseSpoilerInput(raw);
  if (error || !placements.length) {
    if (info) info.textContent = error || 'No placements found.';
    return;
  }
  loadSpoilerFromParsed(placements, 'paste');
  if (info) info.textContent = `Loaded ${placements.length} placements from paste.`;
}

let spoilerPanelInited = false;
function initSpoilerPanel() {
  restoreSpoilerPlacements();
  if (spoilerPanelInited) {
    updateSpoilerStatusUI();
    return;
  }
  spoilerPanelInited = true;

  document.getElementById('spoilerLoadBtn')?.addEventListener('click', () => {
    if (typeof isRaceMode === 'function' && isRaceMode()) return;
    applySpoilerPasteFromUI();
  });
  document.getElementById('spoilerClearBtn')?.addEventListener('click', () => {
    if (typeof isRaceMode === 'function' && isRaceMode()) return;
    clearSpoilerPlacements();
    const info = document.getElementById('spoilerLoadInfo');
    if (info) info.textContent = 'Spoiler cleared.';
    const ta = document.getElementById('spoilerPaste');
    if (ta) ta.value = '';
  });
  document.getElementById('spoilerNextBtn')?.addEventListener('click', () => {
    if (typeof isRaceMode === 'function' && isRaceMode()) return;
    renderSpoilerNextSuggestion();
  });

  updateSpoilerStatusUI();
}
