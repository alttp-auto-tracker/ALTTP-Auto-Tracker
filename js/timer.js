/* ============================================================
   timer.js
   Run timer (start/pause/reset, auto-start when Link's first
   playable room loads) and the progressive item-split history
   retained for the timer display and post-run report export.
   ============================================================ */

let previousRoom = null;
let previousGameModeForAutoStart = null;

let timerRunning=false;
let timerStartedAt=0;
let timerElapsedBeforeStart=0;
let timerAutoStarted=false;
let timerInterval=null;
let timerManualPaused=false;
let timerConnected=false;
let timerLastGameMode=null;
let timerAutomaticPauseReason=null;
let timerActivityHistory=[];

let progressiveSplitHistory = [];
let previousProgressiveState = {};

function formatTime(ms){
  const totalSec=Math.floor(ms/1000);
  const h=Math.floor(totalSec/3600);
  const m=Math.floor((totalSec%3600)/60);
  const s=totalSec%60;
  return [h,m,s].map(v=>String(v).padStart(2,'0')).join(':');
}

function currentTimerString() {
  return formatTime(currentTimerElapsedMs());
}

function currentTimerElapsedMs(){
  return timerElapsedBeforeStart +
    (timerRunning ? (Date.now() - timerStartedAt) : 0);
}

function recordTimerActivity(type,reason=''){
  const activity={
    type,
    reason,
    elapsedMs:currentTimerElapsedMs(),
    time:currentTimerString(),
    recordedAt:Date.now()
  };
  timerActivityHistory.push(activity);
  if(typeof recordRunEvent==='function'){
    recordRunEvent('timer_'+type,{reason});
  }
  if(typeof scheduleRunSessionSave==='function') scheduleRunSessionSave();
}

function getTimerViewState(){
  if(!timerAutoStarted){
    return {key:'ready',label:'Ready',message:"Waiting for Link's first playable room."};
  }
  if(timerManualPaused){
    return {key:'manual',label:'Manual Pause',message:'Paused manually — press Resume when ready.'};
  }
  if(!timerConnected){
    return {key:'disconnected',label:'Disconnected',message:'Timer protected — reconnect to resume active play.'};
  }
  if(timerRunning){
    return {key:'active',label:'Active',message:'Counting active gameplay time.'};
  }

  if(timerLastGameMode===0x0E)
    return {key:'automatic',label:'Menu / Text',message:'Auto-paused for text, inventory, or map.'};
  if(timerLastGameMode===0x17)
    return {key:'automatic',label:'Save & Quit',message:'Auto-paused for Save & Quit.'};

  return {key:'automatic',label:'Game Paused',message:'Auto-paused until gameplay becomes active.'};
}

function getTimerSnapshot(){
  const state=getTimerViewState();
  return {
    elapsedMs:currentTimerElapsedMs(),
    elapsed:currentTimerString(),
    running:timerRunning,
    started:timerAutoStarted,
    connected:timerConnected,
    manualPaused:timerManualPaused,
    state:state.key,
    status:state.label,
    pauseReason:timerAutomaticPauseReason,
    lastPickup:progressiveSplitHistory.at(-1) || null,
    splits:progressiveSplitHistory.map(split=>({...split})),
    activity:timerActivityHistory.map(event=>({...event}))
  };
}

function renderTimerState(){
  const state=getTimerViewState();
  const block=document.getElementById('timerBlock');
  const status=document.getElementById('timerStatus');
  const message=document.getElementById('timerMessage');

  if(block) block.dataset.state=state.key;
  if(status) status.textContent=state.label;
  if(message) message.textContent=state.message;
}

function renderTimerLastPickup(){
  const row=document.getElementById('timerLastPickup');
  if(!row) return;

  const last=progressiveSplitHistory.at(-1);
  row.hidden=!last;
  if(!last) return;

  document.getElementById('timerLastPickupItem').textContent=last.item;
  document.getElementById('timerLastPickupTime').textContent=last.time;
}

function flashTimerPickup(){
  const block=document.getElementById('timerBlock');
  if(!block) return;

  block.classList.remove('pickup-flash');
  // Restart the animation even when two upgrades arrive in one polling pass.
  void block.offsetWidth;
  block.classList.add('pickup-flash');
  setTimeout(()=>block.classList.remove('pickup-flash'),900);
}

function recordProgressiveSplits(save){
  let pickupRecorded=false;
  let splitHistoryChanged=false;

  Object.keys(ITEM_EVENT_LABELS).forEach(key=>{
    const oldValue = previousProgressiveState[key] ?? save[key];
    const newValue = save[key];

    if(newValue > oldValue){
      for(let level = oldValue + 1; level <= newValue; level++){
        const label = ITEM_EVENT_LABELS[key][level];
        if(!label) continue;
        const split={
          item: label,
          time: currentTimerString(),
          elapsedMs:currentTimerElapsedMs(),
          recordedAt:Date.now()
        };
        progressiveSplitHistory.push(split);
        if(typeof recordRunEvent==='function'){
          recordRunEvent('item_pickup',{item:label});
        }
        pickupRecorded=true;
        splitHistoryChanged=true;
      }
    }
    else if(newValue < oldValue){
      // Remove any higher-level splits if user undoes an item.
      for(let level = oldValue; level > newValue; level--){
        const label = ITEM_EVENT_LABELS[key][level];
        const index = progressiveSplitHistory.findIndex(x=>x.item===label);
        if(index !== -1){
          progressiveSplitHistory.splice(index,1);
          splitHistoryChanged=true;
        }
      }
    }

    previousProgressiveState[key]=newValue;
  });

  if(splitHistoryChanged)
    renderTimerLastPickup();

  if(pickupRecorded)
    flashTimerPickup();
}

function getTimerElapsedMs(){
  if(timerRunning && timerStartedAt){
    return Math.max(0, timerElapsedBeforeStart + (Date.now()-timerStartedAt));
  }
  return Math.max(0, timerElapsedBeforeStart||0);
}

function renderTimer(){
  document.getElementById('timerDisplay').textContent=currentTimerString();
  renderTimerState();
}

function updateTimerButton(){
  const button=document.getElementById('timerStart');
  if(!button) return;
  button.textContent=timerRunning?'Pause':(timerAutoStarted?'Resume':'Start');
}

function startTimer(isManual=true){
  if(timerRunning) return;

  if(isManual){
    timerAutoStarted=true;
    timerManualPaused=false;
  }

  timerRunning=true;
  timerStartedAt=Date.now();
  if(typeof ensureActiveRunSession==='function'){
    ensureActiveRunSession(isManual?'manual':'automatic');
  }
  updateTimerButton();
  renderTimerState();
  if(typeof updateRandoModeLock==='function') updateRandoModeLock();
  if(!timerInterval) timerInterval=setInterval(renderTimer,1000);
}

function pauseTimer(isManual=true){
  if(isManual) timerManualPaused=true;

  if(timerRunning){
    timerElapsedBeforeStart+=Date.now()-timerStartedAt;
    timerRunning=false;
  }

  updateTimerButton();
  renderTimer();

  if(isManual) recordTimerActivity('pause','manual');
  else if(typeof scheduleRunSessionSave==='function') scheduleRunSessionSave();
}

function timerPauseReason(gameMode,connected){
  if(!connected) return 'tracker disconnected';
  if(gameMode===null || gameMode===undefined) return 'waiting for the game';

  if(gameMode===0x0E) return 'text, inventory, or map open';
  if(gameMode===0x17) return 'Save & Quit';

  // Startup, title/file screens, loading, story/history, and the
  // starting-location selector are outside active gameplay.
  if(
    (gameMode>=0x00 && gameMode<=0x05) ||
    gameMode===0x14 ||
    gameMode===0x1B
  ) return 'title or file screen';

  return null;
}

function syncTimerToGameState(gameMode,connected=true){
  timerConnected=connected;
  timerLastGameMode=gameMode;

  if(!timerAutoStarted) return;

  const reason=timerPauseReason(gameMode,connected);
  const previousReason=timerAutomaticPauseReason;
  timerAutomaticPauseReason=reason;

  if(reason){
    if(timerRunning){
      pauseTimer(false);
      recordTimerActivity('pause',reason);
      log('Timer paused — '+reason+'.');
    }else{
      renderTimerState();
    }
    return;
  }

  if(!timerRunning && !timerManualPaused){
    startTimer(false);
    recordTimerActivity('resume','gameplay active');
    if(previousReason)
      log('Timer resumed — gameplay active.','ok');
  }else{
    renderTimerState();
  }
}

function setTimerDisconnected(){
  syncTimerToGameState(timerLastGameMode,false);
}

function restoreTimerSnapshot(snapshot){
  if(!snapshot || !snapshot.started) return false;

  timerRunning=false;
  timerStartedAt=0;
  timerElapsedBeforeStart=Math.max(0,Number(snapshot.elapsedMs) || 0);
  timerAutoStarted=true;
  timerManualPaused=!!snapshot.manualPaused;
  timerConnected=false;
  timerLastGameMode=null;
  timerAutomaticPauseReason='tracker disconnected';
  timerActivityHistory=Array.isArray(snapshot.activity)
    ? snapshot.activity.map(event=>({...event}))
    : [];
  progressiveSplitHistory=Array.isArray(snapshot.splits)
    ? snapshot.splits.map(split=>({...split}))
    : [];
  previousProgressiveState={};

  updateTimerButton();
  renderTimer();
  renderTimerLastPickup();
  if(typeof updateRandoModeLock==='function') updateRandoModeLock();
  if(!timerInterval) timerInterval=setInterval(renderTimer,1000);
  return true;
}

function resetTimer(options={}){
  const shouldArchive=options.archive!==false;
  if(shouldArchive && typeof archiveActiveRunSession==='function'){
    archiveActiveRunSession('unfinished');
  }

  timerRunning=false;
  timerStartedAt=0;
  timerElapsedBeforeStart=0;
  timerAutoStarted=false;
  timerManualPaused=false;
  timerAutomaticPauseReason=null;
  timerActivityHistory=[];
  // Pin current room/mode so a mid-run reset does NOT immediately re-arm the
  // timer. Auto-start only fires on a *transition* into Link's House or from
  // title/file select into gameplay (fresh file load / Open spawn).
  previousRoom=(typeof TrackerState!=='undefined' && TrackerState.room!=null)
    ? TrackerState.room
    : null;
  previousGameModeForAutoStart=(typeof TrackerState!=='undefined' && TrackerState.gameMode!=null)
    ? TrackerState.gameMode
    : timerLastGameMode;

  progressiveSplitHistory=[];
  previousProgressiveState={};
  if(typeof resetRunEventRecorder==='function') resetRunEventRecorder();
  if(options.resetRunState!==false && typeof resetDungeonPrizeState==='function'){
    resetDungeonPrizeState();
  }
  if(!shouldArchive && typeof discardActiveRunSession==='function'){
    discardActiveRunSession();
  }

  updateTimerButton();

  renderTimer();
  renderTimerLastPickup();
  if(typeof updateRandoModeLock==='function') updateRandoModeLock();

  log('Timer reset');
}

function beginAutomaticTimerStart(reason='automatic'){
  if(timerAutoStarted || timerRunning) return false;
  timerAutoStarted = true;
  timerManualPaused = false;
  // Clear any stale pause so the first gameplay frame can count immediately.
  timerAutomaticPauseReason = null;
  startTimer(false);
  recordTimerActivity('start', reason);
  if(typeof log === 'function'){
    log('Run started — timer started automatically.','ok');
  }
  return true;
}

function isTitleOrFileGameMode(gameMode){
  if(gameMode===null || gameMode===undefined) return true;
  return (gameMode>=0x00 && gameMode<=0x05)
    || gameMode===0x14
    || gameMode===0x17
    || gameMode===0x1B;
}

function isPlayableGameMode(gameMode){
  // Active underworld / overworld / transition modules during real play.
  return gameMode===0x07 || gameMode===0x08
    || gameMode===0x09 || gameMode===0x0A || gameMode===0x0B;
}

function checkAutoStartTimer(room){
  // Already started
  if(timerAutoStarted || timerRunning) return;
  if(room===null || room===undefined) return;

  // Only arm on a *transition* into Link's House — not while already standing
  // there (or anywhere else) after a mid-run reset.
  const prev=previousRoom;
  previousRoom=room;
  if(room===0x104 && prev!==0x104){
    beginAutomaticTimerStart("entered Link's House");
  }
}

/** Open/Inverted (and file-select) path: start only when leaving title/file
 *  screens into real gameplay — never while already mid-run after a reset. */
function checkAutoStartFromGameMode(gameMode){
  if(timerAutoStarted || timerRunning) return;
  if(gameMode===null || gameMode===undefined) return;

  const prev=previousGameModeForAutoStart;
  previousGameModeForAutoStart=gameMode;

  if(!isPlayableGameMode(gameMode)) return;
  // Require a transition from title / file / save screens into play.
  if(prev!==null && prev!==undefined && !isTitleOrFileGameMode(prev)) return;
  // First sample after attach with no prior mode: only start if we are not
  // already deep in a file (prev null + playable could be mid-run reconnect).
  // Treat first-ever null→playable as start only when room is Link's House
  // or overworld start is acceptable for Open; require title transition when known.
  if(prev===null || prev===undefined){
    // Cold attach mid-run: do not auto-start. Wait for house or title→play.
    return;
  }
  beginAutomaticTimerStart('left title into gameplay');
}

// Wires up the timer buttons. Called once from main.js on load.
function initTimer(){
  // Buttons exist on the main tracker; streamer.html is display-only for OBS.
  document.getElementById('timerStart')?.addEventListener('click',()=>{
    if(timerRunning){
      pauseTimer(true);
      return;
    }

    const wasStarted=timerAutoStarted;
    timerAutoStarted=true;
    timerManualPaused=false;
    const reason=timerPauseReason(timerLastGameMode,timerConnected);
    if(reason){
      timerAutomaticPauseReason=reason;
      updateTimerButton();
      log('Timer ready — waiting for active gameplay.');
    }else{
      startTimer(false);
      recordTimerActivity(wasStarted?'resume':'start',wasStarted?'manual resume':'manual start');
    }
  });
  document.getElementById('timerReset')?.addEventListener('click',()=>{
    const hasRunData=timerAutoStarted || currentTimerElapsedMs()>0 || progressiveSplitHistory.length>0;
    if(hasRunData && !window.confirm('Reset the timer and save this run to Run History as unfinished?')) return;
    resetTimer();
  });

  renderTimer();
  renderTimerLastPickup();
}
