/* ============================================================
   controllerMode.js
   Phone / laptop "controller" layout: no SNI attach needed.
   Emphasizes prizes, medallions, entrance notes, LAN run control,
   and a live readout mirrored from the OBS host.

   Enable with:
     ?controller=1
     or the "Controller mode" toggle (stored in localStorage)
   ============================================================ */

const CONTROLLER_MODE_KEY = 'lttpTracker.controllerMode';

let lastLiveStateReceivedAt = 0;
let sniRoleTimer = null;

function isControllerMode() {
  return !!(document.body && document.body.classList.contains('controller-mode'));
}

function readControllerModePreference() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('controller') === '1' || params.get('controller') === 'true') {
      return true;
    }
    if (params.get('controller') === '0' || params.get('controller') === 'false') {
      return false;
    }
    return localStorage.getItem(CONTROLLER_MODE_KEY) === '1';
  } catch (e) {
    return false;
  }
}

function flashLayoutChange(label) {
  try {
    if (!document.body || document.body.classList.contains('stream-shell')) return;

    document.getElementById('layoutFlashOverlay')?.remove();
    document.getElementById('layoutFlashBanner')?.remove();
    window.clearTimeout(flashLayoutChange._hold);
    window.clearTimeout(flashLayoutChange._t);

    const overlay = document.createElement('div');
    overlay.id = 'layoutFlashOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      right: '0',
      bottom: '0',
      zIndex: '2147483000',
      pointerEvents: 'none',
      background:
        'radial-gradient(ellipse at center, rgba(216,180,92,.5) 0%, rgba(16,14,28,.7) 72%)',
      opacity: '1',
      transition: 'opacity 0.45s ease-out'
    });

    const banner = document.createElement('div');
    banner.id = 'layoutFlashBanner';
    banner.setAttribute('aria-live', 'polite');
    banner.textContent = label || '';
    Object.assign(banner.style, {
      position: 'fixed',
      left: '50%',
      top: '42%',
      transform: 'translate(-50%, -50%)',
      zIndex: '2147483001',
      pointerEvents: 'none',
      padding: '18px 36px',
      borderRadius: '14px',
      border: '1px solid rgba(216,180,92,.7)',
      background: 'rgba(16,14,28,.96)',
      color: '#f0d078',
      fontSize: 'clamp(1.25rem, 3.6vw, 2.1rem)',
      fontWeight: '800',
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      textAlign: 'center',
      whiteSpace: 'nowrap',
      boxShadow: '0 16px 48px rgba(0,0,0,.7)',
      opacity: '1',
      transition: 'opacity 0.45s ease-out'
    });

    document.body.appendChild(overlay);
    document.body.appendChild(banner);

    // Hold fully visible ~0.55s, then fade, then remove.
    flashLayoutChange._hold = window.setTimeout(() => {
      overlay.style.opacity = '0';
      banner.style.opacity = '0';
    }, 550);
    flashLayoutChange._t = window.setTimeout(() => {
      overlay.remove();
      banner.remove();
    }, 1100);
  } catch (e) {
    try { console.warn('flashLayoutChange failed', e); } catch (_) {}
  }
}

function setControllerMode(on, { persist = true, flash = false } = {}) {
  const prev = isControllerMode();
  document.body.classList.toggle('controller-mode', !!on);
  if (persist) {
    try {
      localStorage.setItem(CONTROLLER_MODE_KEY, on ? '1' : '0');
    } catch (e) { /* ignore */ }
  }
  const btn = document.getElementById('controllerModeToggle');
  if (btn) {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? 'Full tracker' : 'Controller mode';
    btn.title = on
      ? 'Show the full tracker layout'
      : 'Phone layout: prizes, notes, LAN control — mirror items from OBS';
  }
  // Controllers should not fight OBS for SNI.
  const conn = document.querySelector('.conn-form');
  if (conn) conn.hidden = !!on;

  // Streamer URLs belong on the streaming PC, not a phone controller.
  const streamerBtn = document.getElementById('streamerUrlsButton');
  if (streamerBtn) streamerBtn.hidden = !!on;

  // Force compact multi-column icons (detailed view becomes 1-wide on phones).
  if (on && typeof applyItemDisplayMode === 'function') {
    try {
      applyItemDisplayMode('compact');
      localStorage.setItem('itemDisplayMode', 'compact');
    } catch (e) { /* ignore */ }
  }

  refreshSniRoleChip();
  if (on && typeof setMobileTab === 'function') {
    try { setMobileTab('items'); } catch (e) { /* ignore */ }
  }

  if (flash) {
    flashLayoutChange(on ? 'Controller Mode' : 'Full Tracker Mode');
  }
}

function noteLiveStateReceived() {
  lastLiveStateReceivedAt = Date.now();
  refreshSniRoleChip();
}

function getSniRoleState() {
  const trackingNow = typeof tracking === 'boolean' && tracking;
  if (trackingNow) {
    return {
      key: 'host',
      label: 'SNI: This device (host)',
      detail: 'Live memory — other devices should stay disconnected',
      cls: 'sni-host'
    };
  }
  const age = Date.now() - (lastLiveStateReceivedAt || 0);
  if (lastLiveStateReceivedAt && age < 4000) {
    return {
      key: 'mirror',
      label: 'SNI: OBS / remote host',
      detail: 'Mirroring live items & timer — do not Connect here',
      cls: 'sni-mirror'
    };
  }
  if (lastLiveStateReceivedAt && age < 15000) {
    return {
      key: 'stale',
      label: 'SNI: Host lagging',
      detail: 'Last mirror update ' + Math.round(age / 1000) + 's ago',
      cls: 'sni-stale'
    };
  }
  return {
    key: 'disconnected',
    label: 'SNI: Disconnected',
    detail: isControllerMode()
      ? 'Waiting for OBS host to publish live-state'
      : 'Connect on the host (OBS) only — one attach at a time',
    cls: 'sni-disconnected'
  };
}

function refreshSniRoleChip() {
  const chip = document.getElementById('sniRoleChip');
  const detail = document.getElementById('sniRoleDetail');
  if (!chip) return;
  const state = getSniRoleState();
  chip.textContent = state.label;
  chip.dataset.state = state.key;
  chip.className = 'sni-role-chip ' + state.cls;
  chip.title = state.detail;
  if (detail) detail.textContent = state.detail;
}

function ensureSniRoleChip() {
  const header = document.querySelector('header');
  const host =
    document.querySelector('.title-block') ||
    header ||
    document.body;

  if (!document.getElementById('sniRoleChip')) {
    const wrap = document.createElement('div');
    wrap.id = 'sniRoleBar';
    wrap.className = 'sni-role-bar';
    wrap.innerHTML =
      '<span id="sniRoleChip" class="sni-role-chip sni-disconnected" role="status">SNI: Disconnected</span>' +
      '<span id="sniRoleDetail" class="sni-role-detail"></span>';
    const titleBlock = document.querySelector('.title-block');
    if (titleBlock && titleBlock.parentElement) {
      titleBlock.parentElement.insertBefore(wrap, titleBlock.nextSibling);
    } else {
      host.appendChild(wrap);
    }
  }

  ensureControllerModeToggle(header || host);
}

function ensureControllerModeToggle(parent) {
  let toggle = document.getElementById('controllerModeToggle');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'controllerModeToggle';
    toggle.className = 'ghost sni-controller-toggle';
    toggle.textContent = 'Controller mode';
    (parent || document.querySelector('header') || document.body).appendChild(toggle);
  }
  // Always (re)bind — idempotent via data flag reset each ensure is fine with replace
  if (toggle.dataset.flashBound !== '1') {
    toggle.dataset.flashBound = '1';
    toggle.addEventListener('click', onControllerModeToggleClick);
  }
}

function onControllerModeToggleClick(e) {
  try {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const next = !isControllerMode();
    setControllerMode(next, { persist: true, flash: false });
    // Flash AFTER mode class is applied so layout has settled
    flashLayoutChange(next ? 'Controller Mode' : 'Full Tracker Mode');
  } catch (err) {
    try { console.error('controller mode toggle failed', err); } catch (_) {}
    // Last-resort visible feedback
    try { alert((!isControllerMode() ? 'Controller Mode' : 'Full Tracker Mode')); } catch (_) {}
  }
}

// Global escape hatch for inline onclick / console testing
window.__toggleControllerMode = onControllerModeToggleClick;
window.flashLayoutChange = flashLayoutChange;

function initControllerMode() {
  if (document.body?.classList.contains('stream-shell')) {
    ensureSniRoleChip();
    const toggle = document.getElementById('controllerModeToggle');
    if (toggle) toggle.hidden = true;
    setInterval(refreshSniRoleChip, 1000);
    return;
  }

  ensureSniRoleChip();
  setControllerMode(readControllerModePreference(), { persist: false, flash: false });
  setControllerMode(isControllerMode() || readControllerModePreference(), { persist: true, flash: false });

  setInterval(refreshSniRoleChip, 1000);

  const btn = document.getElementById('connectBtn');
  if (btn) {
    btn.addEventListener('click', () => setTimeout(refreshSniRoleChip, 500));
  }
}

function notifyTrackingChanged() {
  refreshSniRoleChip();
}

let controllerModeInited = false;
function initControllerModeOnce() {
  if (controllerModeInited) return;
  controllerModeInited = true;
  initControllerMode();
}
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initControllerModeOnce, 0);
});
// Also init immediately if DOM is already ready (module load order / late inject)
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  setTimeout(initControllerModeOnce, 0);
}
