/* ============================================================
   settings.js

   Global tracker settings.

   Race Mode enables only race-legal features.

   Practice Mode unlocks additional analysis tools.
   ============================================================ */
function loadModeSetting(key, allowed, fallback){
    const saved = localStorage.getItem(key);
    if(saved && allowed.includes(saved)) return saved;
    return fallback;
}

const SETTINGS = {

    raceMode: JSON.parse(
        localStorage.getItem("raceMode") ?? "false"
    ),

    // Best Play / Next Up coaching. Practice-only; user must opt in.
    bestPlayEnabled: JSON.parse(
        localStorage.getItem("bestPlayEnabled") ?? "false"
    ),

    // Randomizer mode pack (shared maps; logic/UI branch on these).
    worldMode: loadModeSetting(
        "worldMode",
        WORLD_MODE_OPTIONS.map(o => o.key),
        "open"
    ),
    keysMode: loadModeSetting(
        "keysMode",
        KEYS_MODE_OPTIONS.map(o => o.key),
        "standard"
    ),
    bossMode: loadModeSetting(
        "bossMode",
        BOSS_MODE_OPTIONS.map(o => o.key),
        "normal"
    ),
    entranceMode: loadModeSetting(
        "entranceMode",
        ENTRANCE_MODE_OPTIONS.map(o => o.key),
        "vanilla"
    )

};

function isKeysanityKeysVisible(){
    // Show small-key counts when small keys can leave their dungeon.
    return SETTINGS.keysMode === "keysanity"
        || SETTINGS.keysMode === "keys"
        || SETTINGS.keysMode === "mcs";
}

function isKeysanityMapCompassVisible(){
    return SETTINGS.keysMode === "keysanity"
        || SETTINGS.keysMode === "mc"
        || SETTINGS.keysMode === "mcs"
        || SETTINGS.keysMode === "mcbk";
}

function isKeysanityBigKeyVisible(){
    return SETTINGS.keysMode === "keysanity"
        || SETTINGS.keysMode === "mcbk";
}

function isKeysanityPanelVisible(){
    return SETTINGS.keysMode !== "standard";
}

function isRaceMode(){
    return SETTINGS.raceMode;
}

function isBestPlayAllowed(){
    // Best Play removed from the product; keep API as always-off.
    return false;
}

function isStuckHelpAllowed(){
    return !SETTINGS.raceMode;
}

function applyPracticeFeatureVisibility(){
    const stuckPanel = document.getElementById("stuckPanel");
    const raceNote = document.getElementById("practiceRaceNote");
    const practicePanel = document.getElementById("stuckPracticePanel");
    // Legacy ids (safe no-ops if removed from HTML)
    const commandCenter = document.getElementById("dungeonCommandCenter");
    const bestWrap = document.getElementById("bestPlayWrap");
    const bestPlay = document.getElementById("bestPlay");
    const nextPlays = document.getElementById("nextPlays");
    const bestToggle = document.getElementById("bestPlayToggle");

    const practice = !SETTINGS.raceMode;

    if(commandCenter) commandCenter.hidden = true;
    if(bestWrap) bestWrap.hidden = true;
    if(bestPlay) bestPlay.hidden = true;
    if(nextPlays){ nextPlays.hidden = true; nextPlays.innerHTML = ""; }
    if(bestToggle) bestToggle.hidden = true;

    if(practicePanel) practicePanel.hidden = !practice;
    if(typeof applyCelebrateToggleVisibility === "function"){
        try{ applyCelebrateToggleVisibility(); }catch(e){}
    }

    const eventRow = document.getElementById("eventNameRow");
    if(eventRow) eventRow.hidden = practice;

    if(!practice && typeof clearStuckMapGuide === "function"){
        clearStuckMapGuide();
    }

    if(raceNote){
        raceNote.hidden = practice; // show only in Race Legal as a hint
    }

    if(stuckPanel){
        stuckPanel.hidden = !practice;
        stuckPanel.classList.toggle("race-locked", !practice);
        const toggle = document.getElementById("stuckToggle");
        if(toggle) toggle.disabled = !practice;
        if(!practice){
            const body = document.getElementById("stuckBody");
            if(body) body.hidden = true;
            stuckPanel.classList.remove("open");
            if(toggle) toggle.setAttribute("aria-expanded", "false");
        }
    }
    const spoilerRoute = document.getElementById("spoilerRoute");
    if(spoilerRoute){
        spoilerRoute.hidden = !practice;
        if(!practice && typeof clearSpoilerPlacements === "function"){
            /* keep stored spoiler; only hide UI */
        }
    }

    const isStream = document.body?.classList?.contains("stream-shell");
    if(isStream){
        document.body.classList.toggle("stream-practice", practice);
        document.body.classList.toggle("stream-race-legal", !practice);
        const colBest = document.getElementById("colBest");
        if(colBest) colBest.hidden = false;
        if(practice && stuckPanel){
            stuckPanel.hidden = false;
            stuckPanel.classList.add("open");
            const body = document.getElementById("stuckBody");
            if(body) body.hidden = false;
            const toggle = document.getElementById("stuckToggle");
            if(toggle) toggle.setAttribute("aria-expanded", "true");
        }
    }
}


function updateModeButton(){

    const btn = document.getElementById("modeButton");
    const text = btn ? btn.querySelector(".mode-text") : null;

    if(btn && text){
      if(SETTINGS.raceMode){
          btn.classList.remove("practice");
          btn.classList.add("race");
          text.textContent = "RACE LEGAL";
          if(typeof setStatus==="function") setStatus("Race Legal Mode Enabled","ok");
      }else{
          btn.classList.remove("race");
          btn.classList.add("practice");
          text.textContent = "PRACTICE";
          if(typeof setStatus==="function") setStatus("Practice Mode Enabled");
      }
    }

    const dungeonGrid = document.getElementById("dungeonStats");

    if(dungeonGrid){

        dungeonGrid.classList.toggle(
            "race-mode",
            SETTINGS.raceMode
        );

    }

    if(typeof lastDungeonStats !== "undefined" && lastDungeonStats){

        updateDungeonStats(lastDungeonStats);

    }

    if(typeof updateMapGuideMode === "function"){
        updateMapGuideMode();
    }

    applyPracticeFeatureVisibility();
    updateStreamRaceChip();
    updateRainChip();
}

function updateStreamRaceChip(){
    const chip = document.getElementById("streamRaceChip");
    const text = document.getElementById("streamRaceChipText");
    if(!chip) return;
    if(SETTINGS.raceMode){
        chip.dataset.mode = "race";
        if(text) text.textContent = "Race Legal";
    }else{
        chip.dataset.mode = "practice";
        if(text) text.textContent = "Practice";
    }
}


function updateRainChip(save){
    const chip = document.getElementById("rainChip");
    const text = document.getElementById("rainChipText");
    if(!chip) return;

    // Only Standard world has the prologue rain sequence.
    const standard = typeof isStandardWorld === "function"
        ? isStandardWorld()
        : (SETTINGS.worldMode === "standard");
    if(!standard){
        chip.hidden = true;
        chip.dataset.state = "clear";
        return;
    }

    const raining = typeof isRainState === "function"
        ? isRainState(save || TrackerState?.save || {})
        : ((Number((save || TrackerState?.save || {}).progress) || 0) < 2);

    chip.hidden = false;
    if(raining){
        chip.dataset.state = "rain";
        if(text) text.textContent = "Rain";
        chip.title = "Standard prologue — rescue Zelda at Sanctuary to end rain (progress < 2)";
    }else{
        chip.dataset.state = "clear";
        if(text) text.textContent = "Clear";
        chip.title = "Rain cleared — Zelda rescued; free to explore";
    }
}


function fillModeSelect(selectId, options, current){
    const el = document.getElementById(selectId);
    if(!el) return null;
    el.innerHTML = options.map(opt =>
        `<option value="${opt.key}"${opt.key === current ? " selected" : ""}>${opt.label}</option>`
    ).join("");
    return el;
}

function applyRandoModeVisibility(){
    const panel = document.getElementById("keysanityPanel");
    if(panel){
        panel.hidden = !isKeysanityPanelVisible();
        panel.dataset.keysMode = SETTINGS.keysMode;
        panel.classList.toggle("show-keys", isKeysanityKeysVisible());
        panel.classList.toggle("show-mapcompass", isKeysanityMapCompassVisible());
        panel.classList.toggle("show-bigkey", isKeysanityBigKeyVisible());
    }
    if(typeof updateKeysanityPanel === "function" && TrackerState?.save){
        updateKeysanityPanel(TrackerState.save);
    }
    if(typeof applyEntrancePairingPanelVisibility === "function"){
        applyEntrancePairingPanelVisibility();
    }
    if(typeof renderEntrancePairingsPanel === "function"){
        renderEntrancePairingsPanel();
    }
}

const RANDO_MODE_CHANNEL = (typeof BroadcastChannel !== "undefined")
    ? new BroadcastChannel("lttp-tracker-rando-modes")
    : null;

function getRandoModePayload(){
    return {
        worldMode: SETTINGS.worldMode,
        keysMode: SETTINGS.keysMode,
        entranceMode: SETTINGS.entranceMode,
        bossMode: SETTINGS.bossMode,
        raceMode: !!SETTINGS.raceMode
    };
}

const RANDO_MODE_CLIENT_ID = (()=>{
    try{
        const key='lttpTracker.randoModeClientId';
        let id=localStorage.getItem(key);
        if(!id){
            id=(globalThis.crypto?.randomUUID?.()
                || (`modes-${Date.now()}-${Math.random().toString(16).slice(2)}`));
            localStorage.setItem(key,id);
        }
        return id;
    }catch(e){
        return `modes-${Date.now()}`;
    }
})();

let randoModesServerUpdatedAt=0;
let randoModesLocalLockUntil=0;
let randoModesPollTimer=null;
let randoModesPushTimer=null;

function randoModesApiUrl(){
    if(location.protocol==='file:') return null;
    try{ return new URL('/api/rando-modes', location.origin).href; }
    catch(e){ return null; }
}

function pushRandoModesToServer(){
    const url=randoModesApiUrl();
    if(!url) return;
    const payload={
        ...getRandoModePayload(),
        updatedAt:Date.now(),
        clientId:RANDO_MODE_CLIENT_ID
    };
    fetch(url,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),
        cache:'no-store'
    }).then(res=>res.json().catch(()=>null)).then(data=>{
        if(data && data.ok && data.updatedAt){
            randoModesServerUpdatedAt=Number(data.updatedAt)||randoModesServerUpdatedAt;
        }else if(data && data.reason==='stale' && data.updatedAt){
            // Server has newer — adopt it.
            randoModesServerUpdatedAt=Number(data.updatedAt)||0;
            applyRandoModeValues(data,{silent:true,force:true});
        }
    }).catch(()=>{ /* offline / no server */ });
}

function schedulePushRandoModesToServer(){
    randoModesLocalLockUntil=Date.now()+1200;
    clearTimeout(randoModesPushTimer);
    randoModesPushTimer=setTimeout(pushRandoModesToServer,120);
}

async function pullRandoModesFromServer(){
    const url=randoModesApiUrl();
    if(!url) return;
    try{
        const res=await fetch(url,{method:'GET',cache:'no-store'});
        if(!res.ok) return;
        const data=await res.json();
        const remoteAt=Number(data?.updatedAt)||0;
        const isStream=document.body?.classList?.contains('stream-shell');
        if(remoteAt && remoteAt>randoModesServerUpdatedAt){
            if(Date.now()<randoModesLocalLockUntil){
              randoModesServerUpdatedAt=remoteAt;
              return;
            }
            randoModesServerUpdatedAt=remoteAt;
            applyRandoModeValues(data,{silent:true,force:true});
            if(typeof updateStreamSyncStatus==='function'){
              updateStreamSyncStatus('modes', true);
            }
        }else if(remoteAt && data){
            // Same (or older) stamp: still force race/practice chrome on stream.
            if(isStream && "raceMode" in data){
              applyRandoModeValues({raceMode:data.raceMode},{silent:true,force:true});
            }
            if(typeof updateStreamSyncStatus==='function'){
              updateStreamSyncStatus('modes', true);
            }
        }else if(!remoteAt || remoteAt===0){
            // Never let OBS publish defaults over the main tracker.
            if(!isStream) schedulePushRandoModesToServer();
        }
    }catch(e){ /* ignore */ }
}


let randoModesEventSource=null;

function startRandoModesEventStream(){
    if(randoModesEventSource || location.protocol==='file:') return;
    let url;
    try{ url=new URL('/api/sync-events', location.origin).href; }
    catch(e){ return; }
    try{
        const es=new EventSource(url);
        randoModesEventSource=es;
        es.addEventListener('rando-modes', (event)=>{
            try{
                const data=JSON.parse(event.data||'{}');
                const remoteAt=Number(data.updatedAt)||0;
                if(remoteAt && remoteAt>=randoModesServerUpdatedAt){
                    if(Date.now()<randoModesLocalLockUntil){
                      randoModesServerUpdatedAt=remoteAt;
                      return;
                    }
                    randoModesServerUpdatedAt=remoteAt;
                    applyRandoModeValues(data,{silent:true,force:true});
                    if(typeof updateStreamSyncStatus==='function'){
                        updateStreamSyncStatus('modes', true);
                    }
                }
            }catch(e){ /* ignore bad frames */ }
        });
        es.onerror=()=>{
            // Browser will auto-reconnect EventSource; keep polling as backup.
        };
    }catch(e){ /* EventSource unavailable */ }
}

function startRandoModesServerSync(){
    if(randoModesPollTimer) return;
    // Push channel first — survives OBS timer throttling while streaming.
    startRandoModesEventStream();
    pullRandoModesFromServer();
    // Polling is a backup only (slower). SSE carries live edits.
    const ms=(typeof document!=='undefined' && document.body?.classList?.contains('stream-shell'))
      ? 1000
      : 4000;
    randoModesPollTimer=setInterval(pullRandoModesFromServer,ms);
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible'){
        pullRandoModesFromServer();
        // CEF sometimes drops EventSource when the source was hidden.
        if(!randoModesEventSource || randoModesEventSource.readyState===2){
          try{ randoModesEventSource?.close(); }catch(e){}
          randoModesEventSource=null;
          startRandoModesEventStream();
        }
      }
    });
}

function broadcastRandoModes(){
    try{
        RANDO_MODE_CHANNEL?.postMessage(getRandoModePayload());
    }catch(e){ /* ignore */ }
    schedulePushRandoModesToServer();
}

function applyRandoModeValues(values, options = {}){
    if(!values || typeof values !== "object") return false;
    const silent = !!options.silent;
    let changed = false;

    const applyOne = (field, allowed, selectId) => {
        const next = values[field];
        if(!next || !allowed.includes(next)) return;
        if(SETTINGS[field] === next){
            const el = document.getElementById(selectId);
            if(el && el.value !== next) el.value = next;
            return;
        }
        SETTINGS[field] = next;
        try{ localStorage.setItem(field, next); }catch(e){ /* ignore */ }
        const el = document.getElementById(selectId);
        if(el) el.value = next;
        changed = true;
    };

    applyOne("worldMode", WORLD_MODE_OPTIONS.map(o => o.key), "worldModeSelect");
    applyOne("keysMode", KEYS_MODE_OPTIONS.map(o => o.key), "keysModeSelect");
    applyOne("bossMode", BOSS_MODE_OPTIONS.map(o => o.key), "bossModeSelect");
    applyOne("entranceMode", ENTRANCE_MODE_OPTIONS.map(o => o.key), "entranceModeSelect");

    if("raceMode" in values){
        const nextRace = values.raceMode === true || values.raceMode === "true" || values.raceMode === 1;
        if(SETTINGS.raceMode !== nextRace){
            SETTINGS.raceMode = nextRace;
            try{ localStorage.setItem("raceMode", JSON.stringify(SETTINGS.raceMode)); }catch(e){}
            changed = true;
        }
    }

    if(changed || options.force){
        applyRandoModeVisibility();
        if(typeof refreshLogicForModeChange === "function"){
            refreshLogicForModeChange();
        }
        // Always refresh practice/race chrome (stream chip + command center).
        if(typeof updateModeButton === "function"){
            updateModeButton();
        }else{
            applyPracticeFeatureVisibility();
        }
        if(typeof updateStreamRaceChip === "function") updateStreamRaceChip();
        if(typeof updateMapGuideMode === "function") updateMapGuideMode();
        if(!silent) broadcastRandoModes();
    }else if("raceMode" in values && typeof updateStreamRaceChip === "function"){
        // Same value, still repaint chip (OBS sometimes misses a prior paint).
        updateStreamRaceChip();
        applyPracticeFeatureVisibility();
    }
    return changed;
}

function initRandoModeSync(){
    if(RANDO_MODE_CHANNEL){
        RANDO_MODE_CHANNEL.onmessage = (event) => {
            applyRandoModeValues(event.data, { silent: true, force: true });
        };
    }
    window.addEventListener("storage", (event) => {
        if(!event.key || !["worldMode", "keysMode", "bossMode", "entranceMode"].includes(event.key)) return;
        applyRandoModeValues({
            worldMode: localStorage.getItem("worldMode"),
            keysMode: localStorage.getItem("keysMode"),
            bossMode: localStorage.getItem("bossMode"),
            entranceMode: localStorage.getItem("entranceMode")
        }, { silent: true, force: true });
    });
    startRandoModesServerSync();
}

/** Lock World/Keys/Bosses/Entrances once a run has started (timer armed). */
function isRandoModeLocked(){
    return typeof timerAutoStarted === "boolean" && timerAutoStarted === true;
}

function updateRandoModeLock(){
    const locked = isRandoModeLocked();
    const ids = ["worldModeSelect", "keysModeSelect", "bossModeSelect", "entranceModeSelect"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if(!el) return;
        el.disabled = locked;
        el.title = locked
            ? "Locked while a run is active — Reset the timer to change modes"
            : "";
    });
    const row = document.getElementById("randoModeRow");
    if(row){
        row.classList.toggle("modes-locked", locked);
        row.setAttribute("aria-disabled", locked ? "true" : "false");
        if(locked) row.title = "Mode settings locked while a run is active";
        else row.removeAttribute("title");
    }
    const modeBtn = document.getElementById("modeButton");
    if(modeBtn){
        modeBtn.disabled = locked;
        modeBtn.classList.toggle("modes-locked", locked);
        modeBtn.title = locked
            ? "Locked while a run is active — Reset the timer to switch Practice / Race Legal"
            : (SETTINGS.raceMode
                ? "Race Legal — coaching tools hidden"
                : "Practice — coaching tools available");
    }
}

function initRandoModeControls(){
    const world = fillModeSelect("worldModeSelect", WORLD_MODE_OPTIONS, SETTINGS.worldMode);
    const keys = fillModeSelect("keysModeSelect", KEYS_MODE_OPTIONS, SETTINGS.keysMode);
    const bosses = fillModeSelect("bossModeSelect", BOSS_MODE_OPTIONS, SETTINGS.bossMode);
    const entrances = fillModeSelect("entranceModeSelect", ENTRANCE_MODE_OPTIONS, SETTINGS.entranceMode);

    if(world){
        world.addEventListener("change", () => {
            if(isRandoModeLocked()){ updateRandoModeLock(); return; }
            SETTINGS.worldMode = world.value;
            localStorage.setItem("worldMode", SETTINGS.worldMode);
            log(`World mode: ${SETTINGS.worldMode}`, "ok");
            if(typeof refreshLogicForModeChange === "function"){
                refreshLogicForModeChange();
            }
            updateRainChip();
            broadcastRandoModes();
        });
    }
    if(keys){
        keys.addEventListener("change", () => {
            if(isRandoModeLocked()){ updateRandoModeLock(); return; }
            SETTINGS.keysMode = keys.value;
            localStorage.setItem("keysMode", SETTINGS.keysMode);
            applyRandoModeVisibility();
            log(`Keys mode: ${SETTINGS.keysMode}`, "ok");
            if(typeof refreshLogicForModeChange === "function"){
                refreshLogicForModeChange();
            }
            broadcastRandoModes();
        });
    }
    if(bosses){
        bosses.addEventListener("change", () => {
            if(isRandoModeLocked()){ updateRandoModeLock(); return; }
            SETTINGS.bossMode = bosses.value;
            localStorage.setItem("bossMode", SETTINGS.bossMode);
            log(`Boss mode: ${SETTINGS.bossMode}`, "ok");
            if(typeof refreshLogicForModeChange === "function"){
                refreshLogicForModeChange();
            }
            broadcastRandoModes();
        });
    }

    if(entrances){
        entrances.addEventListener("change", () => {
            if(isRandoModeLocked()){ updateRandoModeLock(); return; }
            SETTINGS.entranceMode = entrances.value;
            localStorage.setItem("entranceMode", SETTINGS.entranceMode);
            log(`Entrances: ${SETTINGS.entranceMode}`, "ok");
            if(typeof refreshLogicForModeChange === "function"){
                refreshLogicForModeChange();
            }
            broadcastRandoModes();
        });
    }

    applyRandoModeVisibility();
    initRandoModeSync();
    updateRandoModeLock();
}

function initSettings(){

    const btn = document.getElementById("modeButton");
    if(btn){
        btn.addEventListener("click",()=>{
            if(isRandoModeLocked()){ updateRandoModeLock(); return; }
            SETTINGS.raceMode = !SETTINGS.raceMode;
            try{
                localStorage.setItem("raceMode", JSON.stringify(!!SETTINGS.raceMode));
            }catch(e){ /* ignore */ }

            updateModeButton();
            try{ RANDO_MODE_CHANNEL?.postMessage(getRandoModePayload()); }catch(e){}
            // Immediate push so OBS does not wait on the debounce timer.
            randoModesLocalLockUntil = Date.now() + 1500;
            if(typeof pushRandoModesToServer === "function"){
                pushRandoModesToServer();
            }else if(typeof schedulePushRandoModesToServer === "function"){
                schedulePushRandoModesToServer();
            }else if(typeof broadcastRandoModes === "function"){
                broadcastRandoModes();
            }

            log(
                SETTINGS.raceMode
                    ? "Race Legal Mode Enabled"
                    : "Practice Mode Enabled",
                "ok"
            );
        });
    }

    initRandoModeControls();
    initStuckPanel();
    updateModeButton();
}

function initStuckPanel(){
    if(typeof initSpoilerPanel === "function"){
        try{ initSpoilerPanel(); }catch(e){ console.warn(e); }
    }

    const panel = document.getElementById("stuckPanel");
    const toggle = document.getElementById("stuckToggle");
    const body = document.getElementById("stuckBody");
    if(!panel || !toggle) return;

    if(typeof clearStuckMapGuide === "function") clearStuckMapGuide();

    toggle.addEventListener("click",()=>{
        if(SETTINGS.raceMode) return;
        const open = panel.classList.toggle("open");
        if(body) body.hidden = !open;
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
}

function renderStuckSuggestion(){
    // Legacy name — Spoiler route owns practice suggestions now.
    if(typeof renderSpoilerNextSuggestion === "function"){
        renderSpoilerNextSuggestion();
    }
}



function escapeStuck(value){
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
