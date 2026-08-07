# ALTTP-AUTO-TRACKER


DISCLAIMER: I am a working father that recently found out about ALTTP Randomizer. I mostly play from my bed and I had a hard time getting an auto tracker to work on my other devices.
This is mostly made with AI to help me get this done faster. I originally wasn't going to publish this, but if it helps others, then I am happy with that. I will update this .md
with screenshots and gifs to help users understand the way it works. 



Web-based **A Link to the Past Randomizer** auto-tracker with live SNI support, OBS stream overlay, phone controller mode, and LAN sync.

**Not affiliated with** [alttprtracker.com](https://alttprtracker.com/) or other community trackers.

Connect one browser to SNI for live memory, use another (or your phone) as a controller, and put `streamer.html` in OBS as a transparent overlay. Practice and Race Legal modes, spoiler-route coaching, run history, and more.

**Current version:** **1.0.0** · Service worker cache **v1**

---

## Quick start

```bash
cd alttpr-tracker
python3 tracker-server.py
```

| Page | URL |
|------|-----|
| Main tracker | http://localhost:8000/tracker.html |
| Stream overlay (OBS) | http://localhost:8000/streamer.html |
| Phone / another device | http://&lt;your-PC-LAN-IP&gt;:8000/tracker.html |

**Recommended setup**

1. Run `tracker-server.py` on your PC.
2. Point an OBS **Browser Source** at `streamer.html` and **Connect** that tab to SNI (only one browser should attach to SNI at a time).
3. Open `tracker.html` on your PC or phone in **Controller mode** — no second SNI connection. Notes, modes, prizes, and run control stay in sync over LAN.

After code updates: hard-refresh the browser (or bump `CACHE_VERSION` in `service-worker.js`) and restart the server if you changed the Python API.

---

## Features

### Live tracking
- Connects to **SNI** or **QUsb2Snes** for live SRAM (items, map, dungeon state, location).
- Automatic timer start on entering Link’s House or leaving the title/file screen into playable game modes.
- Modes lock once a run is active; Reset unlocks them again.

### Modes
| Category | Options |
|----------|---------|
| World | Standard · Open · Inverted |
| Keys | Standard · Keysanity · Keys · MC · MCS · MCBK |
| Bosses | Normal · Shuffled |
| Entrances | Vanilla · Shuffled |
| Race | **Practice** (coaching tools) · **Race Legal** (spoiler tools hidden) |

### Controller mode & phone
- Toggle **Controller mode** / **Full tracker** (or open with `?controller=1`).
- Compact item grid, denser phone layout, gold flash banner on switch.
- Start/Reset and Connect/Streamer URLs hidden on controllers — control stays with the SNI host (usually OBS).
- LAN sync keeps items, notes, prizes, modes, and run state aligned across devices.

### Spoiler route (Practice only)
- Replaces the old “I’m Stuck” panel.
- Load a non-race seed (or paste a spoiler) and get the **next obtainable item** from a progression priority list, filtered by public logic and name-based requirements (e.g. Desert Palace torch needs boots).
- Map guide line to the suggested check.
- Hidden automatically in Race Legal mode.

### Stream overlay (`streamer.html`) *** WORK IN PROGRESS *** 
- Transparent OBS Browser Source with modular layout.
- Presets: `classic`, `race`, `focus_items`, `maps_left`, `timer_only`, `items_only`, `maps_only`, …
- Or assign modules (`timer`, `maps`, `items`, `stuck`/`spoiler`, `game`, …) to `top` / `left` / `center` / `right` / `bottom` via URL params.
- Use the in-tracker **Streamer URLs** modal to build links quickly.


### Other
- Light / Dark world maps with prize markers and partial-fill support.
- Entrance pairing notes (synced).
- Run history with archive, resume, compare, and delete (tombstones persist across refresh/LAN).
- Celebrate-on-finish toggle, item display modes (compact / detailed, smoked / bright).
- PWA installable (service worker + manifest) for a more app-like experience on phone or desktop.
- Export helpers and seed loading.

---

## Requirements

- **Python 3** (for `tracker-server.py`)
- **SNI** (recommended) or QUsb2Snes
- Modern browser (Chrome / Firefox / Edge / Safari)
- **OBS Studio** if you want the stream overlay
- Emulator (Snes9x, RetroArch, …) or hardware (FX Pak Pro / SD2SNES) feeding SNI


---

## Project layout

```
alttpr-tracker/
├── tracker.html          Main tracker UI
├── streamer.html         OBS overlay shell (shows v1.0.0)
├── tracker-server.py     Static server + LAN sync APIs
├── service-worker.js     PWA cache (bump CACHE_VERSION on ship)
├── manifest.json
├── js/                   Application logic
├── css/
├── assets/               Item icons, map art, markers


---

## SNI & multi-device rules

- **Only one browser tab** should Connect to SNI at a time.
- Best practice: OBS (`streamer.html`) = SNI host; phone/PC tracker = controller(s).
- Controllers talk to the server over LAN; they do not open a second SNI socket.
- Runtime sync files (`.entrance-pairings-sync.json`, `.run-history-sync.json`, etc.) are written next to the server when it runs. They are local only and should not be committed.

---

## Your settings stay private

Uploading or cloning this repository **does not** include your personal settings, run history, entrance pairings, or prizes.

Those live in:

1. **Your browser’s `localStorage`** (modes, display prefs, controller mode, run history, etc.)
2. **Local server sync files** (dotfiles next to `tracker-server.py`, created only when the server is running)

Anyone who clones the repo gets a clean, default install. Your data never leaves your machine unless you deliberately export or share it.

---

## License / credits

Built for the ALTTPR community. Item and map assets are derived from *The Legend of Zelda: A Link to the Past*; respect Nintendo’s rights if you redistribute media. Code is provided as-is for personal and community use.
