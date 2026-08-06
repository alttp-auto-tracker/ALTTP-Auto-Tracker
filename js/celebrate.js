/* ============================================================
   celebrate.js
   Practice-only finish celebration — ALTTP item confetti + flash.
   Toggle: #celebrateFinishToggle (localStorage).
   ============================================================ */

const CELEBRATE_STORAGE_KEY = 'lttpTracker.celebrateFinish';
const CELEBRATE_COUNT = 56;
const CELEBRATE_SPARKLES = 28;
const CELEBRATE_DURATION_MS = 3800;

/** Prefer solid on-state icons (skip no* / tiny corrupt assets). */
const CELEBRATE_ICONS = [
  'boots.png', 'hookshot.png', 'hammer.png', 'firerod.png', 'icerod.png',
  'bow.png', 'lamp.png', 'mirror.png', 'flippers.png', 'pearl.png',
  'glove.png', 'mitt.png', 'book.png', 'bombs.png', 'bombos.png',
  'ether.png', 'quake.png', 'somaria.png', 'cape.png', 'greenmail.png',
  'bluemail.png', 'redmail.png', 'sword2.png', 'sword3.png', 'shield2.png',
  'bottle.png', 'mushroom.png', 'powder.png', 'flute.png', 'bugnet.png'
];

function isCelebrateFinishEnabled() {
  try {
    const v = localStorage.getItem(CELEBRATE_STORAGE_KEY);
    if (v === null || v === undefined) return true;
    return v === '1' || v === 'true';
  } catch (e) {
    return true;
  }
}

function setCelebrateFinishEnabled(on) {
  try {
    localStorage.setItem(CELEBRATE_STORAGE_KEY, on ? '1' : '0');
  } catch (e) { /* ignore */ }
  const input = document.getElementById('celebrateFinishToggle');
  if (input) input.checked = !!on;
}

function prefersReducedMotion() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
}

function shouldCelebrateRunFinish() {
  if (typeof isRaceMode === 'function' && isRaceMode()) return false;
  if (typeof SETTINGS !== 'undefined' && SETTINGS.raceMode) return false;
  if (!isCelebrateFinishEnabled()) return false;
  if (prefersReducedMotion()) return false;
  return true;
}

function celebrateIconSrc(name) {
  const root = (typeof ITEM_ASSET_ROOT === 'string') ? ITEM_ASSET_ROOT : 'assets/items/';
  return root + name;
}

function celebrateRunFinish() {
  try {
    if (!shouldCelebrateRunFinish()) return;
    if (!document.body) return;

    document.getElementById('runCelebrateLayer')?.remove();
    window.clearTimeout(celebrateRunFinish._t);

    const layer = document.createElement('div');
    layer.id = 'runCelebrateLayer';
    layer.className = 'run-celebrate-layer';
    layer.setAttribute('aria-hidden', 'true');

    // Gold flash
    const flash = document.createElement('div');
    flash.className = 'run-celebrate-flash';
    layer.appendChild(flash);

    // Banner
    const banner = document.createElement('div');
    banner.className = 'run-celebrate-banner';
    banner.textContent = 'Run Complete';
    layer.appendChild(banner);

    const icons = CELEBRATE_ICONS.length ? CELEBRATE_ICONS : ['boots.png'];
    // Shuffle a working list so nearby pieces aren't the same icon
    const deck = icons.slice();
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Center burst + sky rain
    for (let i = 0; i < CELEBRATE_COUNT; i++) {
      const img = document.createElement('img');
      img.src = celebrateIconSrc(deck[i % deck.length]);
      img.alt = '';
      img.draggable = false;
      img.className = 'run-celebrate-piece';

      const mode = i < CELEBRATE_COUNT * 0.45 ? 'burst' : 'rain';
      const size = mode === 'burst'
        ? 28 + Math.random() * 26
        : 20 + Math.random() * 22;
      const delay = mode === 'burst'
        ? Math.random() * 0.2
        : 0.15 + Math.random() * 0.85;
      const duration = mode === 'burst'
        ? 1.4 + Math.random() * 0.7
        : 2.0 + Math.random() * 1.1;
      const rot = (Math.random() - 0.5) * 900;

      if (mode === 'burst') {
        const angle = (Math.PI * 2 * i) / (CELEBRATE_COUNT * 0.45) + Math.random() * 0.4;
        const dist = 28 + Math.random() * 42; // vw/vh-ish
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist + 20;
        img.style.setProperty('--celebrate-x', dx + 'vw');
        img.style.setProperty('--celebrate-y', dy + 'vh');
        img.classList.add('burst');
        Object.assign(img.style, {
          left: '50%',
          top: '42%',
          width: size + 'px',
          height: size + 'px',
          marginLeft: -(size / 2) + 'px',
          marginTop: -(size / 2) + 'px',
          animation: `runCelebrateBurst ${duration}s cubic-bezier(.15,.75,.35,1) ${delay}s forwards`
        });
      } else {
        const startX = 4 + Math.random() * 92;
        const drift = (Math.random() - 0.5) * 50;
        img.style.setProperty('--celebrate-x', drift + 'vw');
        img.style.setProperty('--celebrate-rot', rot + 'deg');
        img.classList.add('rain');
        Object.assign(img.style, {
          left: startX + 'vw',
          top: '-10vh',
          width: size + 'px',
          height: size + 'px',
          animation: `runCelebrateFall ${duration}s cubic-bezier(.25,.1,.3,1) ${delay}s forwards`
        });
      }

      img.style.setProperty('--celebrate-rot', rot + 'deg');
      img.addEventListener('error', () => { img.remove(); });
      layer.appendChild(img);
    }

    // Gold sparkles
    for (let i = 0; i < CELEBRATE_SPARKLES; i++) {
      const sp = document.createElement('span');
      sp.className = 'run-celebrate-sparkle';
      const x = 10 + Math.random() * 80;
      const y = 8 + Math.random() * 55;
      const delay = Math.random() * 0.8;
      const size = 4 + Math.random() * 7;
      Object.assign(sp.style, {
        left: x + 'vw',
        top: y + 'vh',
        width: size + 'px',
        height: size + 'px',
        animationDelay: delay + 's'
      });
      layer.appendChild(sp);
    }

    document.body.appendChild(layer);

    // Force reflow so animations start cleanly
    void layer.offsetWidth;
    layer.classList.add('show');

    celebrateRunFinish._t = window.setTimeout(() => {
      layer.classList.remove('show');
      layer.classList.add('hide');
      window.setTimeout(() => layer.remove(), 400);
    }, CELEBRATE_DURATION_MS);
  } catch (e) {
    try { console.warn('celebrateRunFinish failed', e); } catch (_) {}
  }
}

function initCelebrateToggle() {
  const input = document.getElementById('celebrateFinishToggle');
  if (!input) return;
  input.checked = isCelebrateFinishEnabled();
  input.addEventListener('change', () => {
    setCelebrateFinishEnabled(!!input.checked);
  });
  if (typeof applyCelebrateToggleVisibility === 'function') {
    applyCelebrateToggleVisibility();
  }
}

function applyCelebrateToggleVisibility() {
  const wrap = document.getElementById('celebrateToggleWrap');
  if (!wrap) return;
  const practice = !(typeof isRaceMode === 'function' ? isRaceMode() : SETTINGS?.raceMode);
  wrap.hidden = !practice;
}
