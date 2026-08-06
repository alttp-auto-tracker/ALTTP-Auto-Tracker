#!/usr/bin/env python3
"""LTTP Auto-Tracker local server.

Serves the static tracker files and a tiny JSON API so entrance pairings
can sync across devices on the same LAN (phone ↔ PC ↔ OBS browser source).

  GET  /api/entrance-pairings
  POST /api/entrance-pairings   body: {"pairings":{...},"updatedAt":ms,"clientId":"..."}

Pairings are stored in-memory and mirrored to .entrance-pairings-sync.json
next to this script so a server restart does not wipe them.
"""
from __future__ import annotations

import json
import os
import queue
import re
import sys
import threading
import time as _time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

PORT = int(os.environ.get("TRACKER_PORT", "8000"))
ROOT = Path(__file__).resolve().parent
STORE_PATH = ROOT / ".entrance-pairings-sync.json"
RANDO_MODES_PATH = ROOT / ".rando-modes-sync.json"
RUN_CONTROL_PATH = ROOT / ".run-control-sync.json"
PRIZES_PATH = ROOT / ".prizes-sync.json"
RUN_HISTORY_PATH = ROOT / ".run-history-sync.json"
COACHING_PATH = ROOT / ".coaching-sync.json"

_state = {
    "pairings": {},
    "updatedAt": 0,
    "clientId": None,
}

_modes_state = {
    "worldMode": "open",
    "keysMode": "standard",
    "bossMode": "normal",
    "entranceMode": "vanilla",
    "raceMode": False,
    "updatedAt": 0,
    "clientId": None,
}

_run_control = {
    "id": 0,
    "action": None,  # reset | finish | start
    "updatedAt": 0,
    "clientId": None,
}

_live_state = {
    "save": None,
    "locationFlags": None,
    "meta": {},
    "timer": {},
    "updatedAt": 0,
    "clientId": None,
}

_prizes_state = {
    "assignments": {},
    "claims": {},
    "mmMed": "unknown",
    "trMed": "unknown",
    "updatedAt": 0,
    "clientId": None,
}

# Shared run library (completed/unfinished archives). Merged by run id.
_run_history_state = {
    "runs": [],  # list of run records
    "deletedIds": [],  # tombstones so deletes sync across devices
    "updatedAt": 0,
    "clientId": None,
}

_coaching_state = {
    "stuckHtml": "",
    "best": None,  # {dungeon, reason, scoreLabel, title}
    "stuckTargetId": None,
    "updatedAt": 0,
    "clientId": None,
}

# Server-Sent Events subscribers (OBS throttles setInterval while streaming;
# push updates stay responsive).
_sse_clients = []  # list[queue.Queue]
_sse_lock = threading.Lock()


def _sse_publish(event: str, data: dict) -> None:
    payload = f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"
    with _sse_lock:
        clients = list(_sse_clients)
    dead = []
    for q in clients:
        try:
            q.put_nowait(payload)
        except Exception:
            dead.append(q)
    if dead:
        with _sse_lock:
            for q in dead:
                if q in _sse_clients:
                    _sse_clients.remove(q)



def load_store() -> None:
    if not STORE_PATH.is_file():
        return
    try:
        data = json.loads(STORE_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("pairings"), dict):
            _state["pairings"] = {
                str(k): str(v)
                for k, v in data["pairings"].items()
                if v
            }
            _state["updatedAt"] = int(data.get("updatedAt") or 0)
            _state["clientId"] = data.get("clientId")
    except Exception as exc:  # noqa: BLE001
        print(f"[sync] could not load {STORE_PATH.name}: {exc}", file=sys.stderr)


def save_store() -> None:
    try:
        STORE_PATH.write_text(
            json.dumps(
                {
                    "pairings": _state["pairings"],
                    "updatedAt": _state["updatedAt"],
                    "clientId": _state["clientId"],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[sync] could not save {STORE_PATH.name}: {exc}", file=sys.stderr)



# Match script/link asset refs so we can auto cache-bust by file mtime.
_ASSET_REF_RE = re.compile(
    r'((?:href|src)\s*=\s*["\'])'
    r'([^"\']+\.(?:js|css|png|webp|json|svg))'
    r'(?:\?[^"\']*)?'
    r'(["\'])',
    re.IGNORECASE,
)


def _file_bust_token(rel_path: str):
    """Return a short mtime-based token for a file under ROOT, or None."""
    clean = rel_path.split("?", 1)[0].lstrip("/")
    if ".." in clean or clean.startswith("api/"):
        return None
    path = ROOT / clean
    if not path.is_file():
        return None
    try:
        return str(int(path.stat().st_mtime))
    except OSError:
        return None


def inject_cache_busters(html: str) -> str:
    """Rewrite href/src asset URLs to ?v=<mtime> so browsers fetch new files."""

    def repl(match):
        prefix, asset, suffix = match.group(1), match.group(2), match.group(3)
        token = _file_bust_token(asset)
        if not token:
            return match.group(0)
        return f"{prefix}{asset}?v={token}{suffix}"

    return _ASSET_REF_RE.sub(repl, html)



def load_modes_store() -> None:
    if not RANDO_MODES_PATH.is_file():
        return
    try:
        data = json.loads(RANDO_MODES_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return
        for key in ("worldMode", "keysMode", "bossMode", "entranceMode"):
            val = data.get(key)
            if isinstance(val, str) and val:
                _modes_state[key] = val
        if isinstance(data.get("raceMode"), bool):
            _modes_state["raceMode"] = data["raceMode"]
        _modes_state["updatedAt"] = int(data.get("updatedAt") or 0)
        _modes_state["clientId"] = data.get("clientId")
    except Exception as exc:  # noqa: BLE001
        print(f"[sync] could not load {RANDO_MODES_PATH.name}: {exc}", file=sys.stderr)


def save_modes_store() -> None:
    try:
        RANDO_MODES_PATH.write_text(
            json.dumps(
                {
                    "worldMode": _modes_state["worldMode"],
                    "keysMode": _modes_state["keysMode"],
                    "bossMode": _modes_state["bossMode"],
                    "entranceMode": _modes_state["entranceMode"],
                    "raceMode": bool(_modes_state.get("raceMode")),
                    "updatedAt": _modes_state["updatedAt"],
                    "clientId": _modes_state["clientId"],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[sync] could not save {RANDO_MODES_PATH.name}: {exc}", file=sys.stderr)


def compute_build_id() -> str:
    """Max mtime of shell files — OBS uses this to auto-reload stale pages."""
    names = [
        "streamer.html",
        "tracker.html",
        "js/settings.js",
        "js/streamer.js",
        "js/timer.js",
        "js/entrance.js",
        "js/map.js",
        "css/streamer.css",
        "css/tracker.css",
        "tracker-server.py",
    ]
    latest = 0
    for name in names:
        path = ROOT / name
        try:
            latest = max(latest, int(path.stat().st_mtime))
        except OSError:
            pass
    return str(latest or int(_time.time()))



def load_run_control_store() -> None:
    if not RUN_CONTROL_PATH.is_file():
        return
    try:
        data = json.loads(RUN_CONTROL_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            _run_control["id"] = int(data.get("id") or 0)
            act = data.get("action")
            _run_control["action"] = act if act in ("reset", "finish", "start") else None
            _run_control["updatedAt"] = int(data.get("updatedAt") or 0)
            _run_control["clientId"] = data.get("clientId")
    except Exception as exc:  # noqa: BLE001
        print(f"[sync] could not load {RUN_CONTROL_PATH.name}: {exc}", file=sys.stderr)


def save_run_control_store() -> None:
    try:
        RUN_CONTROL_PATH.write_text(
            json.dumps(_run_control, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[sync] could not save {RUN_CONTROL_PATH.name}: {exc}", file=sys.stderr)


def load_prizes_store() -> None:
    if not PRIZES_PATH.is_file():
        return
    try:
        data = json.loads(PRIZES_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return
        if isinstance(data.get("assignments"), dict):
            _prizes_state["assignments"] = {
                str(k): str(v) for k, v in data["assignments"].items() if v
            }
        if isinstance(data.get("claims"), dict):
            _prizes_state["claims"] = {
                str(k): bool(v) for k, v in data["claims"].items()
            }
        for key in ("mmMed", "trMed"):
            val = data.get(key)
            if val in ("unknown", "bombos", "ether", "quake"):
                _prizes_state[key] = val
        _prizes_state["updatedAt"] = int(data.get("updatedAt") or 0)
        _prizes_state["clientId"] = data.get("clientId")
    except Exception as exc:  # noqa: BLE001
        print(f"[sync] could not load {PRIZES_PATH.name}: {exc}", file=sys.stderr)


def save_prizes_store() -> None:
    try:
        PRIZES_PATH.write_text(
            json.dumps(_prizes_state, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[sync] could not save {PRIZES_PATH.name}: {exc}", file=sys.stderr)


def prizes_payload() -> dict:
    return {
        "assignments": _prizes_state["assignments"],
        "claims": _prizes_state["claims"],
        "mmMed": _prizes_state["mmMed"],
        "trMed": _prizes_state["trMed"],
        "updatedAt": _prizes_state["updatedAt"],
        "clientId": _prizes_state["clientId"],
    }


def load_run_history_store() -> None:
    if not RUN_HISTORY_PATH.is_file():
        return
    try:
        data = json.loads(RUN_HISTORY_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return
        runs = data.get("runs")
        if isinstance(runs, list):
            cleaned = []
            for r in runs:
                if isinstance(r, dict) and r.get("id") and r.get("reportData"):
                    cleaned.append(r)
            _run_history_state["runs"] = cleaned[:80]
        deleted = data.get("deletedIds")
        if isinstance(deleted, list):
            _run_history_state["deletedIds"] = [str(x) for x in deleted if x is not None][-200:]
        _run_history_state["updatedAt"] = int(data.get("updatedAt") or 0)
        _run_history_state["clientId"] = data.get("clientId")
    except Exception as exc:  # noqa: BLE001
        print(f"[sync] could not load {RUN_HISTORY_PATH.name}: {exc}", file=sys.stderr)


def save_run_history_store() -> None:
    try:
        RUN_HISTORY_PATH.write_text(
            json.dumps(_run_history_state, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[sync] could not save {RUN_HISTORY_PATH.name}: {exc}", file=sys.stderr)



def coaching_payload():
    return {
        "stuckHtml": _coaching_state.get("stuckHtml") or "",
        "best": _coaching_state.get("best"),
        "stuckTargetId": _coaching_state.get("stuckTargetId"),
        "updatedAt": _coaching_state.get("updatedAt") or 0,
        "clientId": _coaching_state.get("clientId"),
    }

def load_coaching_store():
    global _coaching_state
    try:
        if COACHING_PATH.exists():
            data = json.loads(COACHING_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                _coaching_state["stuckHtml"] = str(data.get("stuckHtml") or "")
                best = data.get("best")
                _coaching_state["best"] = best if isinstance(best, dict) else None
                tid = data.get("stuckTargetId")
                _coaching_state["stuckTargetId"] = str(tid) if tid else None
                _coaching_state["updatedAt"] = int(data.get("updatedAt") or 0)
    except Exception:
        pass

def save_coaching_store():
    try:
        COACHING_PATH.write_text(
            json.dumps(coaching_payload(), ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception:
        pass

def run_history_payload() -> dict:
    return {
        "runs": _run_history_state["runs"],
        "deletedIds": list(_run_history_state.get("deletedIds") or []),
        "updatedAt": _run_history_state["updatedAt"],
        "clientId": _run_history_state["clientId"],
    }


def merge_run_history(incoming_runs: list, deleted_ids=None) -> list:
    """Merge by id; keep newer updatedAt. Apply tombstones, then cap at 50."""
    by_id = {}
    for r in _run_history_state.get("runs") or []:
        if isinstance(r, dict) and r.get("id"):
            by_id[str(r["id"])] = r
    # Removals win over stale copies still held by other devices.
    deleted_set = {str(x) for x in (deleted_ids or []) if x is not None}
    for rid in deleted_set:
        by_id.pop(rid, None)
    for r in incoming_runs:
        if not isinstance(r, dict) or not r.get("id") or not r.get("reportData"):
            continue
        rid = str(r["id"])
        if rid in deleted_set:
            continue
        existing = by_id.get(rid)
        if not existing or str(r.get("updatedAt") or "") >= str(existing.get("updatedAt") or ""):
            by_id[rid] = r
    merged = sorted(
        by_id.values(),
        key=lambda x: str(x.get("updatedAt") or ""),
        reverse=True,
    )
    return merged[:50]


def live_state_payload() -> dict:
    return {
        "save": _live_state.get("save"),
        "locationFlags": _live_state.get("locationFlags"),
        "meta": _live_state.get("meta") or {},
        "timer": _live_state.get("timer") or {},
        "updatedAt": _live_state.get("updatedAt") or 0,
        "clientId": _live_state.get("clientId"),
    }


def run_control_payload() -> dict:
    return {
        "id": _run_control["id"],
        "action": _run_control["action"],
        "updatedAt": _run_control["updatedAt"],
        "clientId": _run_control["clientId"],
    }


class TrackerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        # Quieter logs: skip noisy static asset GETs and optional screenshot 404s
        msg = fmt % args if args else str(fmt)
        if "File not found" in msg or "404" in msg:
            # Optional guide images / icons missing is normal — do not spam.
            return
        path = args[0] if args else ""
        if isinstance(path, str) and (
            path.startswith("GET /assets/")
            or path.startswith("GET /css/")
            or "favicon" in path
            or path.startswith("GET /poll-worker")
        ):
            return
        super().log_message(fmt, *args)

    def end_headers(self) -> None:
        # Allow phone / OBS / localhost on the LAN to call the API.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path in ("/api/entrance-pairings", "/api/entrance-pairings/"):
            body = json.dumps(
                {
                    "pairings": _state["pairings"],
                    "updatedAt": _state["updatedAt"],
                    "clientId": _state["clientId"],
                }
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path in ("/api/rando-modes", "/api/rando-modes/"):
            body = json.dumps(
                {
                    "worldMode": _modes_state["worldMode"],
                    "keysMode": _modes_state["keysMode"],
                    "bossMode": _modes_state["bossMode"],
                    "entranceMode": _modes_state["entranceMode"],
                    "raceMode": bool(_modes_state.get("raceMode")),
                    "updatedAt": _modes_state["updatedAt"],
                    "clientId": _modes_state["clientId"],
                }
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path in ("/api/live-state", "/api/live-state/"):
            body = json.dumps(live_state_payload()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path in ("/api/run-control", "/api/run-control/"):
            body = json.dumps(run_control_payload()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path in ("/api/coaching", "/api/coaching/"):
            body = json.dumps(coaching_payload()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path in ("/api/prizes", "/api/prizes/"):
            body = json.dumps(prizes_payload()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path in ("/api/run-history", "/api/run-history/"):
            body = json.dumps(run_history_payload()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path in ("/api/build-id", "/api/build-id/"):
            body = json.dumps({"id": compute_build_id()}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path in ("/api/sync-events", "/api/sync-events/"):
            # Long-lived SSE stream for OBS / phone / desktop.
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
            self.send_header("Connection", "keep-alive")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()
            q: queue.Queue = queue.Queue(maxsize=32)
            with _sse_lock:
                _sse_clients.append(q)
            try:
                # Snapshot so late joiners catch up immediately.
                q.put_nowait(
                    "event: rando-modes\ndata: "
                    + json.dumps(
                        {
                            "worldMode": _modes_state["worldMode"],
                            "keysMode": _modes_state["keysMode"],
                            "bossMode": _modes_state["bossMode"],
                            "entranceMode": _modes_state["entranceMode"],
                            "updatedAt": _modes_state["updatedAt"],
                            "clientId": _modes_state["clientId"],
                        },
                        separators=(",", ":"),
                    )
                    + "\n\n"
                )
                q.put_nowait(
                    "event: entrance-pairings\ndata: "
                    + json.dumps(
                        {
                            "pairings": _state["pairings"],
                            "updatedAt": _state["updatedAt"],
                            "clientId": _state["clientId"],
                        },
                        separators=(",", ":"),
                    )
                    + "\n\n"
                )
                q.put_nowait(
                    "event: prizes\ndata: "
                    + json.dumps(prizes_payload(), separators=(",", ":"))
                    + "\n\n"
                )
                q.put_nowait(
                    "event: live-state\ndata: "
                    + json.dumps(live_state_payload(), separators=(",", ":"))
                    + "\n\n"
                )
                q.put_nowait(
                    "event: run-history\ndata: "
                    + json.dumps(run_history_payload(), separators=(",", ":"))
                    + "\n\n"
                )
                last_ping = _time.time()
                while True:
                    try:
                        msg = q.get(timeout=15.0)
                        self.wfile.write(msg.encode("utf-8"))
                        self.wfile.flush()
                    except queue.Empty:
                        # Comment keepalive — stops proxies/OBS from dropping the stream.
                        self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                        break
                    if _time.time() - last_ping > 60:
                        last_ping = _time.time()
            finally:
                with _sse_lock:
                    if q in _sse_clients:
                        _sse_clients.remove(q)
            return

        # Auto cache-bust asset refs in HTML (mtime tokens). No more manual ?v= bumps.
        path = parsed.path
        if path in ("/", "/tracker.html", "/streamer.html") or path.endswith(".html"):
            rel = "tracker.html" if path in ("/", "/tracker.html") else path.lstrip("/")
            file_path = ROOT / rel
            if file_path.is_file():
                try:
                    html = file_path.read_text(encoding="utf-8")
                except OSError:
                    super().do_GET()
                    return
                # Stamp build id so streamer can auto-reload when files change (OBS cache).
                bid = compute_build_id()
                if "<head>" in html:
                    html = html.replace(
                        "<head>",
                        f'<head>\n<meta name="lttp-build-id" content="{bid}">',
                        1,
                    )
                body = inject_cache_busters(html).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                # OBS / CEF ignores weak cache directives — be explicit.
                self.send_header(
                    "Cache-Control",
                    "no-store, no-cache, must-revalidate, max-age=0",
                )
                self.send_header("Pragma", "no-cache")
                self.send_header("Expires", "0")
                if rel.endswith("streamer.html"):
                    # Ask Chromium/OBS to drop cached copies of this URL.
                    self.send_header("Clear-Site-Data", '"cache"')
                self.end_headers()
                self.wfile.write(body)
                return

        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        if parsed.path in ("/api/rando-modes", "/api/rando-modes/"):
            allowed = {
                "worldMode": {"open", "standard", "inverted"},
                "keysMode": {
                    "standard", "keysanity", "keys", "mc", "mcs", "mcbk",
                },
                "bossMode": {"normal", "shuffle", "chaos", "singularity"},
                "entranceMode": {
                    "vanilla", "simple", "restricted", "full", "crossed",
                    "insanity",
                },
            }
            # Be permissive: accept any non-empty string the client sends for
            # known fields so option lists can grow without a server bump.
            incoming_at = int(data.get("updatedAt") or 0)
            if incoming_at < int(_modes_state["updatedAt"] or 0):
                body = json.dumps(
                    {
                        "ok": False,
                        "reason": "stale",
                        **{k: _modes_state[k] for k in (
                            "worldMode", "keysMode", "bossMode", "entranceMode",
                            "updatedAt", "clientId",
                        )},
                    }
                ).encode("utf-8")
                self.send_response(409)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            for key in ("worldMode", "keysMode", "bossMode", "entranceMode"):
                val = data.get(key)
                if isinstance(val, str) and val.strip():
                    _modes_state[key] = val.strip()
            if "raceMode" in data:
                val = data.get("raceMode")
                _modes_state["raceMode"] = val is True or val == "true" or val == 1
            _modes_state["updatedAt"] = incoming_at or int(
                __import__("time").time() * 1000
            )
            _modes_state["clientId"] = data.get("clientId")
            save_modes_store()
            _sse_publish(
                "rando-modes",
                {
                    "worldMode": _modes_state["worldMode"],
                    "keysMode": _modes_state["keysMode"],
                    "bossMode": _modes_state["bossMode"],
                    "entranceMode": _modes_state["entranceMode"],
                    "raceMode": bool(_modes_state.get("raceMode")),
                    "updatedAt": _modes_state["updatedAt"],
                    "clientId": _modes_state["clientId"],
                },
            )
            body = json.dumps(
                {
                    "ok": True,
                    "worldMode": _modes_state["worldMode"],
                    "keysMode": _modes_state["keysMode"],
                    "bossMode": _modes_state["bossMode"],
                    "entranceMode": _modes_state["entranceMode"],
                    "raceMode": bool(_modes_state.get("raceMode")),
                    "updatedAt": _modes_state["updatedAt"],
                    "clientId": _modes_state["clientId"],
                }
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return


        if parsed.path in ("/api/live-state", "/api/live-state/"):
            # Host (SNI-attached page) publishes a compact snapshot for phones.
            if isinstance(data.get("save"), dict) or data.get("save") is None:
                _live_state["save"] = data.get("save")
            flags = data.get("locationFlags")
            if isinstance(flags, list):
                # Compact room/chest completion bits for controller maps
                _live_state["locationFlags"] = [
                    int(x) & 0xFF for x in flags if isinstance(x, (int, float))
                ]
            elif flags is None:
                pass  # keep previous
            if isinstance(data.get("meta"), dict):
                _live_state["meta"] = data["meta"]
            if isinstance(data.get("timer"), dict):
                _live_state["timer"] = data["timer"]
            _live_state["updatedAt"] = int(data.get("updatedAt") or (_time.time() * 1000))
            _live_state["clientId"] = data.get("clientId")
            payload = live_state_payload()
            _sse_publish("live-state", payload)
            body = json.dumps({"ok": True, "updatedAt": payload["updatedAt"]}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path in ("/api/run-control", "/api/run-control/"):
            action = data.get("action")
            if action not in ("reset", "finish", "start"):
                self.send_error(400, "action must be reset, finish, or start")
                return
            _run_control["id"] = int(_run_control.get("id") or 0) + 1
            _run_control["action"] = action
            _run_control["updatedAt"] = int(
                data.get("updatedAt") or (_time.time() * 1000)
            )
            _run_control["clientId"] = data.get("clientId")
            save_run_control_store()
            # Reset also clears shared prize state so all clients match
            if action == "reset":
                _prizes_state["assignments"] = {}
                _prizes_state["claims"] = {}
                _prizes_state["mmMed"] = "unknown"
                _prizes_state["trMed"] = "unknown"
                _prizes_state["updatedAt"] = _run_control["updatedAt"]
                _prizes_state["clientId"] = data.get("clientId")
                save_prizes_store()
                _sse_publish("prizes", prizes_payload())
                # Clear entrance notes on full reset
                _state["pairings"] = {}
                _state["updatedAt"] = _run_control["updatedAt"]
                _state["clientId"] = data.get("clientId")
                save_store()
                _sse_publish(
                    "entrance-pairings",
                    {
                        "pairings": {},
                        "updatedAt": _state["updatedAt"],
                        "clientId": _state["clientId"],
                    },
                )
            payload = run_control_payload()
            _sse_publish("run-control", payload)
            body = json.dumps({"ok": True, **payload}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path in ("/api/prizes", "/api/prizes/"):
            incoming_at = int(data.get("updatedAt") or 0)
            if incoming_at < int(_prizes_state.get("updatedAt") or 0):
                body = json.dumps(
                    {"ok": False, "reason": "stale", **prizes_payload()}
                ).encode("utf-8")
                self.send_response(409)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if isinstance(data.get("assignments"), dict):
                _prizes_state["assignments"] = {
                    str(k): str(v)
                    for k, v in data["assignments"].items()
                    if isinstance(v, str) and v
                }
            if isinstance(data.get("claims"), dict):
                _prizes_state["claims"] = {
                    str(k): bool(v) for k, v in data["claims"].items()
                }
            for key in ("mmMed", "trMed"):
                val = data.get(key)
                if val in ("unknown", "bombos", "ether", "quake"):
                    _prizes_state[key] = val
            _prizes_state["updatedAt"] = incoming_at or int(_time.time() * 1000)
            _prizes_state["clientId"] = data.get("clientId")
            save_prizes_store()
            payload = prizes_payload()
            _sse_publish("prizes", payload)
            body = json.dumps({"ok": True, **payload}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path in ("/api/coaching", "/api/coaching/"):
            _coaching_state["stuckHtml"] = str(data.get("stuckHtml") or "")
            best = data.get("best")
            _coaching_state["best"] = best if isinstance(best, dict) else None
            tid = data.get("stuckTargetId")
            _coaching_state["stuckTargetId"] = str(tid) if tid else None
            _coaching_state["updatedAt"] = int(
                data.get("updatedAt") or (_time.time() * 1000)
            )
            _coaching_state["clientId"] = data.get("clientId")
            save_coaching_store()
            payload = coaching_payload()
            _sse_publish("coaching", payload)
            body = json.dumps({"ok": True, **payload}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path in ("/api/run-history", "/api/run-history/"):
            incoming = data.get("runs")
            if not isinstance(incoming, list):
                self.send_error(400, "runs must be an array")
                return
            deleted_ids = data.get("deletedIds")
            if not isinstance(deleted_ids, list):
                deleted_ids = []
            merged = merge_run_history(incoming, deleted_ids)
            _run_history_state["runs"] = merged
            if deleted_ids:
                prev = list(_run_history_state.get("deletedIds") or [])
                seen = set(prev)
                for rid in deleted_ids:
                    s = str(rid)
                    if s not in seen:
                        prev.append(s)
                        seen.add(s)
                _run_history_state["deletedIds"] = prev[-200:]
            _run_history_state["updatedAt"] = int(
                data.get("updatedAt") or (_time.time() * 1000)
            )
            _run_history_state["clientId"] = data.get("clientId")
            save_run_history_store()
            payload = run_history_payload()
            _sse_publish("run-history", payload)
            body = json.dumps({"ok": True, **payload}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path not in ("/api/entrance-pairings", "/api/entrance-pairings/"):
            self.send_error(404, "Not Found")
            return
        pairings = data.get("pairings")
        if not isinstance(pairings, dict):
            self.send_error(400, "pairings must be an object")
            return
        cleaned = {
            str(k): str(v)
            for k, v in pairings.items()
            if isinstance(k, str) and isinstance(v, str) and v
        }
        incoming_at = int(data.get("updatedAt") or 0)
        # Last-write-wins by timestamp; equal timestamps accept the write.
        if incoming_at < int(_state["updatedAt"] or 0):
            body = json.dumps(
                {
                    "ok": False,
                    "reason": "stale",
                    "pairings": _state["pairings"],
                    "updatedAt": _state["updatedAt"],
                    "clientId": _state["clientId"],
                }
            ).encode("utf-8")
            self.send_response(409)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        _state["pairings"] = cleaned
        _state["updatedAt"] = incoming_at or int(__import__("time").time() * 1000)
        _state["clientId"] = data.get("clientId")
        save_store()
        _sse_publish(
            "entrance-pairings",
            {
                "pairings": _state["pairings"],
                "updatedAt": _state["updatedAt"],
                "clientId": _state["clientId"],
            },
        )
        body = json.dumps(
            {
                "ok": True,
                "pairings": _state["pairings"],
                "updatedAt": _state["updatedAt"],
                "clientId": _state["clientId"],
            }
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    os.chdir(ROOT)
    load_store()
    load_modes_store()
    load_run_control_store()
    load_prizes_store()
    load_run_history_store()
    load_coaching_store()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), TrackerHandler)
    print("==================================================")
    print(" LTTP Auto-Tracker — local server + entrance sync")
    print("==================================================")
    print(f" On this machine:   http://localhost:{PORT}/tracker.html")
    print(f" Entrance sync API: http://localhost:{PORT}/api/entrance-pairings")
    print(f" Mode sync API:     http://localhost:{PORT}/api/rando-modes")
    print(f" Run control API:   http://localhost:{PORT}/api/run-control")
    print(f" Prizes API:        http://localhost:{PORT}/api/prizes")
    print(f" Run history API:   http://localhost:{PORT}/api/run-history")
    print(f" Coaching API:       http://localhost:{PORT}/api/coaching")
    print(" Leave this window open while you use the tracker.")
    print("==================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
