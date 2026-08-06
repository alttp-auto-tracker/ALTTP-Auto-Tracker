/* ============================================================
   tracker.js
   Connection flow + polling. Owns the USB2SnesClient instance,
   drives the poll loop that reads save data / dungeon stats /
   live room+area off WRAM, and updates the connection log and
   status indicators.
   ============================================================ */

let client=null;
let tracking=false;
let pollTimer=null;
let pollWorker=null;
let pollInFlight=false;
let lastLiveStatePushAt=0;

let playerPositionPollTimer=null;
let playerPositionPollGeneration=0;
let playerNameLoaded=false;
const PLAYER_POSITION_POLL_MS=250;
let demoMode = false;

let logEl;

function log(msg,cls){
  const div=document.createElement('div');
  if(cls) div.className='e-'+cls;
  const t=new Date().toLocaleTimeString();
  div.textContent=`[${t}] ${msg}`;
  logEl.appendChild(div);
  logEl.scrollTop=logEl.scrollHeight;
}

function setStatus(msg,cls){
  const el=document.getElementById('statusLine');
  if(el){
    el.textContent=msg;
    el.className='status-line'+(cls?(' '+cls):'');
  }
  // Mirror into the OBS-only status strip when present (streamer.js).
  if(typeof setObsStatus==='function' && document.body?.classList.contains('obs-mode')){
    setObsStatus(msg,cls);
  }
}

function setNodes({socket,device,sync}){
  document.getElementById('nodeSocket').classList.toggle('lit',!!socket);
  document.getElementById('nodeDevice').classList.toggle('lit',!!device);
  document.getElementById('nodeSync').classList.toggle('lit',!!sync);
  document.getElementById('nodeSync').classList.toggle('pulse',sync==='pulse');
}

function renderLivePlayerPosition(){
  if(typeof updateLivePlayerMarker!=='function') return;
  updateLivePlayerMarker({
    // Treat active SNI tracking as connected for the map sprite.
    connected: !!(TrackerState.connected || tracking),
    indoors:TrackerState.indoors,
    gameMode:TrackerState.gameMode,
    world:TrackerState.world || 'light',
    x:TrackerState.playerX,
    y:TrackerState.playerY,
    name:TrackerState.playerName
  });
}

function applyPlayerPositionData(data){
  if(!data || data.length<PLAYER_POSITION_LEN) return false;
  TrackerState.indoors=data[0]!==0;
  TrackerState.playerY=data[5]+(data[6]<<8);
  TrackerState.playerX=data[7]+(data[8]<<8);
  renderLivePlayerPosition();
  return true;
}

function stopPlayerPositionPolling(){
  playerPositionPollGeneration++;
  clearTimeout(playerPositionPollTimer);
  playerPositionPollTimer=null;
  if(typeof hideLivePlayerMarker==='function') hideLivePlayerMarker();
  if(typeof resetPlayerMapSprite==='function') resetPlayerMapSprite();
}

async function pollPlayerPosition(generation){
  if(generation!==playerPositionPollGeneration) return;
  if(!tracking || !client?.connected) return;
  const startedAt=Date.now();

  try{
    const data=await readMemory(PLAYER_POSITION_ADDR,PLAYER_POSITION_LEN);
    applyPlayerPositionData(data);
  }catch(error){
    // The one-second main poll owns connection errors and logging. A missed
    // fast position sample should not spam the log or stop normal tracking.
  }

  if(generation!==playerPositionPollGeneration) return;
  if(!tracking || !client?.connected) return;
  const elapsed=Date.now()-startedAt;
  const outdoorMs=(typeof isStreamShellPage==='function' && isStreamShellPage())
    ? Math.max(PLAYER_POSITION_POLL_MS, 400)
    : PLAYER_POSITION_POLL_MS;
  const targetInterval=TrackerState.indoors ? 1000 : outdoorMs;
  const delay=Math.max(40,targetInterval-elapsed);
  playerPositionPollTimer=setTimeout(()=>pollPlayerPosition(generation),delay);
}

function startPlayerPositionPolling(){
  // Stream shell: keep sprite + I'm Stuck guide line, but poll a bit slower
  // outdoors so item reads still get priority.
  clearTimeout(playerPositionPollTimer);
  playerPositionPollTimer=null;
  const generation=++playerPositionPollGeneration;
  pollPlayerPosition(generation);
}

async function startTracking(host,port){
  // Returns true when attached and polling; false on any failure.
  // Callers (OBS auto-connect) use the boolean to decide whether to retry.
  if(client){
    try{ client.disconnect(); }catch(e){ /* ignore */ }
    client=null;
  }
  tracking=false;
  TrackerState.connected=false;
  clearTimeout(pollTimer);
  if(typeof stopPollWorker==='function') stopPollWorker();
  stopPlayerPositionPolling();

  setNodes({});
  setStatus('Connecting to '+host+':'+port+' ...');
  log('Opening socket to ws://'+host+':'+port);
  client=new USB2SnesClient();
  client.onDisconnect=()=>{
    tracking=false;
    TrackerState.connected=false;
    if(typeof notifyTrackingChanged==='function') notifyTrackingChanged();
    clearTimeout(pollTimer);
    stopPlayerPositionPolling();
    setTimerDisconnected();
    setNodes({});
    setStatus('Disconnected — will retry…','err');
    log('Socket closed','err');
    const btn=document.getElementById('connectBtn');
    if(btn) btn.textContent='Connect';
    // Stream / OBS pages can hook this to auto-reconnect.
    if(typeof onTrackerDisconnect==='function'){
      try{ onTrackerDisconnect(); }catch(e){ console.warn(e); }
    }
  };
  try{
    await client.connect(host,port);
  }catch(e){
    setStatus('Could not open a connection to that host/port.','err');
    log('Connection failed: '+e.message,'err');
    return false;
  }
  setNodes({socket:true});
  log('Socket open','ok');

  let list;
  try{
    list=await client.command('DeviceList',[],'json');
  }catch(e){
    setStatus('Connected, but the server did not respond to DeviceList.','err');
    log('DeviceList failed: '+e.message,'err');
    try{ client.disconnect(); }catch(err){ /* ignore */ }
    return false;
  }
  const devices=(list && list.Results)||[];
  if(devices.length===0){
    setStatus('No devices found. Make sure the emulator is running and attached to SNI.','err');
    log('DeviceList returned no devices','err');
    try{ client.disconnect(); }catch(err){ /* ignore */ }
    return false;
  }
  const device=devices[0];
  log('Found device(s): '+devices.join(', '));

  try{
    await client.command('Attach',[device],'none');
    await client.command('Info',[],'json');
  }catch(e){
    setStatus('Found device but could not attach to it. Another client may already be attached.','err');
    log('Attach/Info failed: '+e.message,'err');
    try{ client.disconnect(); }catch(err){ /* ignore */ }
    return false;
  }
  setNodes({socket:true,device:true});
  log('Attached to '+device,'ok');
  setStatus('Attached to '+device+' — tracking...','ok');
  tracking=true;
  if(typeof notifyTrackingChanged==='function') notifyTrackingChanged();
  TrackerState.connected=true;
  TrackerState.playerName='LINK';
  playerNameLoaded=false;
  const btn=document.getElementById('connectBtn');
  if(btn) btn.textContent='Disconnect';
  scheduleNextPoll();
  pollLoopSafe();
  startPlayerPositionPolling();
  if(typeof loadPlayerMapSpriteFromRom==='function'){
    loadPlayerMapSpriteFromRom(readMemory).then(loaded=>{
      if(loaded && tracking) log('Loaded player sprite from connected ROM','ok');
    }).catch(error=>{
      if(tracking) log('Player sprite unavailable — using position dot','err');
      console.warn('Could not load player map sprite:',error);
    });
  }
  return true;
}

async function readMemory(addr,len){
  return client.command('GetAddress',[addrToHex(addr),len.toString(16).toUpperCase()],'binary');
}

async function readGameMode(){
    return await readMemory(GAMEMODE_ADDR, 1);
}



async function pollLoop(){
  if(!tracking) return;
  try{
    // Priority path: game mode + item save first so OBS icons update ASAP.
    // Secondary reads (location flags, dstats, area) follow — they are larger
    // and must not delay item tiles when CEF/SNI is under load.
    const roomData = await readMemory(ROOM_ADDR,2);
    const gameModeData = await readMemory(GAMEMODE_ADDR,1);
    const dungeonIdData = await readMemory(DUNGEON_ID_ADDR,1);

    if(roomData && roomData.length>=2){
      const room = roomData[0] + (roomData[1] << 8);
      TrackerState.room = room;
      const liveRoom=document.getElementById("liveRoom");
      if(liveRoom) liveRoom.textContent = "0x" + room.toString(16).toUpperCase();
      checkAutoStartTimer(room);
    }

    if(gameModeData && gameModeData.length>=1){
      TrackerState.gameMode = gameModeData[0];
      const liveGm=document.getElementById("liveGameMode");
      if(liveGm) liveGm.textContent =
          "0x" + TrackerState.gameMode
              .toString(16)
              .padStart(2,"0")
              .toUpperCase();
      // Auto-start before pause/resume sync so Open/Inverted runs that never
      // hit room 0x104 still arm the timer on first playable module.
      if(typeof checkAutoStartFromGameMode === 'function'){
        checkAutoStartFromGameMode(TrackerState.gameMode);
      }
      syncTimerToGameState(TrackerState.gameMode,true);
      if(typeof maybeAutoCompleteRunFromGameMode === 'function'){
        maybeAutoCompleteRunFromGameMode(TrackerState.gameMode);
      }

      const noActiveFile=(TrackerState.gameMode>=0x00 && TrackerState.gameMode<=0x05) ||
        TrackerState.gameMode===0x14 || TrackerState.gameMode===0x17 ||
        TrackerState.gameMode===0x1B;
      if(noActiveFile){
        playerNameLoaded=false;
        TrackerState.playerName='LINK';
      }else if(!playerNameLoaded && TrackerState.gameMode>=0x07){
        try{
          const playerNameData=await readMemory(PLAYER_NAME_ADDR,PLAYER_NAME_LEN);
          TrackerState.playerName=decodePlayerName(playerNameData);
          playerNameLoaded=true;
        }catch(nameError){
          // Retry on the next normal poll without interrupting item/map reads.
        }
      }
    }else{
      setTimerDisconnected();
    }

    if(dungeonIdData && dungeonIdData.length>=1){
      TrackerState.dungeonId = dungeonIdData[0];
    }

    TrackerState.currentDungeon = resolveCurrentDungeon(
      TrackerState.gameMode,
      TrackerState.dungeonId,
      TrackerState.currentDungeon
    );
    if(typeof trackDungeonTransition==='function'){
      trackDungeonTransition(TrackerState.currentDungeon);
    }

    const data=await readMemory(BASE_ADDR,READ_LEN);
    if(data && data.length>=READ_LEN){
      const save=parseSave(data);
      TrackerState.save = save;
      save.playerName=TrackerState.playerName;
      // Items first — map marker work is deferred a frame so OBS paints icons ASAP.
      updateUI(save);
      setNodes({socket:true,device:true,sync:'pulse'});
      if(typeof pushLiveStateSnapshot==='function'){
        try{ pushLiveStateSnapshot(); }catch(e){}
      }
      const mapSave=save;
      if(typeof requestAnimationFrame==='function'){
        requestAnimationFrame(()=>{ try{ updateMap(mapSave); }catch(e){} });
      }else{
        updateMap(mapSave);
      }
    }

    // Secondary: room/overworld completion flags (large read).
    try{
      const locationFlagsData=await readMemory(LOCATION_FLAGS_ADDR,LOCATION_FLAGS_LEN);
      if(locationFlagsData && locationFlagsData.length>=LOCATION_FLAGS_LEN){
        TrackerState.locationFlags=parseLocationFlags(locationFlagsData);
        // Refresh map on host with new chest/NPC flags, then publish to controllers.
        if(TrackerState.save){
          try{ updateMap(TrackerState.save); }catch(e){}
        }
        if(typeof pushLiveStateSnapshot==='function'){
          try{ pushLiveStateSnapshot(); }catch(e){}
        }
      }
    }catch(e){ /* keep previous flags */ }

    try{
      const dstatsData = await readMemory(DSTATS_ADDR, DSTATS_LEN);
      if (dstatsData && dstatsData.length >= DSTATS_LEN) {
        TrackerState.dungeonStats = parseDungeonStats(
          dstatsData,
          TrackerState.locationFlags
        );
      }
    }catch(e){ /* keep previous stats */ }

    try{
      const areaData = await readMemory(OWAREA_ADDR,1);
      if(areaData && areaData.length>=1){
        TrackerState.area = areaData[0];
        TrackerState.world=(TrackerState.area&0x40)!==0?'dark':'light';
        updatePlayerRegion(TrackerState.area);
        if(typeof trackRegionTransition==='function'){
          trackRegionTransition(playerRegion,TrackerState.world);
        }
        const liveArea=document.getElementById("liveArea");
        if(liveArea) liveArea.textContent =
            "0x" + TrackerState.area.toString(16).toUpperCase();
      }
    }catch(e){ /* keep previous area */ }

    renderLivePlayerPosition();

    if(TrackerState.dungeonStats){
      updateDungeonStats(TrackerState.dungeonStats);
      if(typeof trackDungeonProgress==='function'){
        trackDungeonProgress(TrackerState.dungeonStats);
      }
    }

  }catch(e){
    setTimerDisconnected();
    if(typeof hideLivePlayerMarker==='function') hideLivePlayerMarker();
    log('Read failed: '+e.message,'err');
    setNodes({socket:true,device:true});
  }

  scheduleNextPoll();
}

function isStreamShellPage(){
  return !!(document.body && document.body.classList.contains('stream-shell'));
}

function desiredPollMs(){
  // OBS CEF throttles page timers; stream shell aims for ~250ms item reads.
  // Worker ticks + early item paint keep the overlay responsive while streaming.
  return isStreamShellPage() ? 250 : 1000;
}

function scheduleNextPoll(){
  if(!tracking) return;
  const ms=desiredPollMs();
  clearTimeout(pollTimer);
  // Always keep a page timer as fallback
  pollTimer=setTimeout(()=>{ if(!pollInFlight) pollLoopSafe(); }, ms);
  // Worker ticks resist OBS background throttling
  if(isStreamShellPage()){
    ensurePollWorker(ms);
  }
}

function ensurePollWorker(ms){
  try{
    if(!pollWorker){
      pollWorker=new Worker('js/poll-worker.js');
      pollWorker.onmessage=()=>{ if(tracking && !pollInFlight) pollLoopSafe(); };
    }
    pollWorker.postMessage({type:'start', ms: ms||desiredPollMs()});
  }catch(e){
    // file:// or CSP — page timer only
  }
}

function stopPollWorker(){
  try{
    if(pollWorker){
      pollWorker.postMessage({type:'stop'});
      pollWorker.terminate();
    }
  }catch(e){}
  pollWorker=null;
}

async function pollLoopSafe(){
  if(pollInFlight || !tracking) return;
  pollInFlight=true;
  try{
    await pollLoop();
  }finally{
    pollInFlight=false;
  }
}

function getLiveTimerSnapshot(){
  const elapsed = (typeof getTimerElapsedMs==='function')
    ? getTimerElapsedMs()
    : (typeof timerElapsedBeforeStart!=='undefined' ? timerElapsedBeforeStart : 0);
  return {
    elapsedMs: Math.max(0, Number(elapsed)||0),
    running: !!(typeof timerRunning!=='undefined' && timerRunning),
    manualPaused: !!(typeof timerManualPaused!=='undefined' && timerManualPaused),
    started: !!(typeof timerAutoStarted!=='undefined' && timerAutoStarted) || !!(typeof timerRunning!=='undefined' && timerRunning),
    connected: !!(typeof timerConnected!=='undefined' && timerConnected)
  };
}

function pushLiveStateSnapshot(){
  if(location.protocol==='file:') return;
  // Don't spam — host publishes ~2/sec max
  const now=Date.now();
  if(now-lastLiveStatePushAt<120) return;
  lastLiveStatePushAt=now;
  let url;
  try{ url=new URL('/api/live-state', location.origin).href; }
  catch(e){ return; }
  const save = (typeof TrackerState!=='undefined' && TrackerState.save)
    ? TrackerState.save
    : null;
  if(!save) return;
  // locationFlags drive map chest/NPC completion (Link's House, etc.).
  // Controllers need them or markers stay "open" forever.
  let locationFlagsArr = null;
  if (TrackerState.locationFlags && TrackerState.locationFlags.length) {
    locationFlagsArr = Array.from(TrackerState.locationFlags);
  }
  const payload={
    save,
    locationFlags: locationFlagsArr,
    meta:{
      room: TrackerState.room,
      area: TrackerState.area,
      world: TrackerState.world,
      gameMode: TrackerState.gameMode,
      dungeonId: TrackerState.dungeonId,
      currentDungeon: TrackerState.currentDungeon,
      playerName: TrackerState.playerName,
      indoors: !!TrackerState.indoors,
      playerX: TrackerState.playerX,
      playerY: TrackerState.playerY
    },
    timer: getLiveTimerSnapshot(),
    updatedAt: now,
    clientId: (typeof CONTROL_CLIENT_ID!=='undefined'?CONTROL_CLIENT_ID:null)
  };
  fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload),
    cache:'no-store'
  }).catch(()=>{});
}


function setDemoMarkerState(id, state){
  const marker = document.querySelector(`.marker[data-id="${id}"]`);
  if(!marker) return;

  marker.classList.remove(
    "locked",
    "partial",
    "avail",
    "checked"
  );

  marker.hidden = state === "checked";
  marker.classList.add(state);
}

function loadDemoData(){
	 demoMode = true;
  log('Loaded demo data (no connection)');
  setStatus('Showing demo data — not connected to a device.');
  const demo={
    bow:2,boomerang:3,hookshot:1,bombs:12,powder:2,firerod:1,icerod:0,
    bombos:1,ether:0,quake:1,lamp:1,hammer:1,flute:3,net:1,book:1,
    somaria:1,byrna:0,cape:1,mirror:2,gloves:1,boots:1,flippers:0,moonpearl:1,
    sword:3,shield:2,armor:1,
    bottle1:3,bottle2:6,bottle3:0,bottle4:0,
    rupees:437,healthCap:120,health:96,magic:64,keys:2,
    pendants:0b011,arrows:30,crystals:0b0010101,
    progress:3,agahnim:true,darkAccess:true,
    dungeonKeys:{
      hyruleCastle:1,easternPalace:0,desertPalace:1,towerOfHera:0,
      agahnimsTower:1,palaceOfDarkness:3,swampPalace:0,skullWoods:1,
      thievesTown:0,icePalace:0,miseryMire:0,turtleRock:0,ganonsTower:0
    },
    bigKey:{
      easternPalace:true,palaceOfDarkness:true
    },
    map:{
      hyruleCastle:true,easternPalace:true,palaceOfDarkness:true
    },
    compass:{
      easternPalace:true
    }
  };
  updateUI(demo);
updateMap(demo);

// Demo map colors
setDemoMarkerState("mushroom","locked");
setDemoMarkerState("bottlemerch","partial");
setDemoMarkerState("kakariko_well","avail");
setDemoMarkerState("blind_hideout","checked");

  checkAutoStartTimer(demo);
  updateDungeonStats({
    hyruleCastle:6,easternPalace:4,desertPalace:0,agahnimsTower:0,
    swampPalace:0,palaceOfDarkness:0,miseryMire:0,skullWoods:0,
    icePalace:0,towerOfHera:0,thievesTown:0,turtleRock:0,ganonsTower:0
  });
  document.getElementById('liveRoom').textContent='0x0042 (demo)';
  document.getElementById('liveArea').textContent='0x1B (demo)';
}

// Wires up the connect/demo buttons and sets the initial status line.
// Called once from main.js on load.
function initTracker(){
  logEl=document.getElementById('log');

  document.getElementById('connectBtn').addEventListener('click',()=>{
	  
    if(tracking || (client && client.connected)){
      tracking=false;
      TrackerState.connected=false;
      if(typeof notifyTrackingChanged==='function') notifyTrackingChanged();
      clearTimeout(pollTimer);
      stopPlayerPositionPolling();
      setTimerDisconnected();
      client.disconnect();
      setNodes({});
      setStatus('Disconnected.');
      document.getElementById('connectBtn').textContent='Connect';
      log('Disconnected by user');
      return;
    }
    const host=document.getElementById('host').value.trim()||'localhost';
    const port=document.getElementById('port').value.trim()||'23074';
    startTracking(host,port);
  });

const demoBtn = document.getElementById('demoBtn');
if (demoBtn) {
    demoBtn.addEventListener('click', loadDemoData);
}

  setStatus('Not connected. Enter the SNI/QUsb2Snes host and port, then Connect.');
}
