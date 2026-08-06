/* ============================================================
   runHistory.js
   Local run library and crash/reload recovery. Stores versioned
   report data rather than generated HTML so old runs can use the
   newest report design and future comparison tools.
   ============================================================ */

const RUN_HISTORY_SCHEMA_VERSION=1;
const RUN_HISTORY_STORAGE_KEY='lttpTracker.runHistory.v1';
const ACTIVE_RUN_STORAGE_KEY='lttpTracker.activeRun.v1';
const RUN_HISTORY_LIMIT=50;

let activeRunSession=null;
let savedRunHistory=[];
let runSessionSaveTimer=null;
let runHistoryCheckpointTimer=null;
let runHistoryModal=null;
let selectedRunComparisonIds=new Set();
const DELETED_RUNS_STORAGE_KEY='lttpTracker.runHistory.deleted.v1';
let deletedRunIds=new Set();
try{
  const raw=JSON.parse(localStorage.getItem(DELETED_RUNS_STORAGE_KEY)||'[]');
  if(Array.isArray(raw)) raw.forEach(id=>{ if(id) deletedRunIds.add(String(id)); });
}catch(e){}

function persistDeletedRunIds(){
  try{
    localStorage.setItem(DELETED_RUNS_STORAGE_KEY, JSON.stringify(Array.from(deletedRunIds).slice(-200)));
  }catch(e){}
}
function getDeletedRunIds(){ return Array.from(deletedRunIds); }
function isRunIdDeleted(id){ return deletedRunIds.has(String(id)); }
function noteDeletedRunIds(ids){
  let changed=false;
  (ids||[]).forEach(id=>{
    const s=String(id);
    if(s && !deletedRunIds.has(s)){ deletedRunIds.add(s); changed=true; }
  });
  if(changed) persistDeletedRunIds();
}
function markRunDeleted(id){
  if(!id) return;
  deletedRunIds.add(String(id));
  persistDeletedRunIds();
}


function createRunId(){
  if(globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getEventNameInputValue(){
  const input=document.getElementById('eventName');
  return input ? String(input.value || '').trim() : '';
}

function setEventNameInputValue(value){
  const input=document.getElementById('eventName');
  if(input) input.value=value ? String(value) : '';
}

function currentEventName(){
  // Only meaningful in Race Legal; Practice runs do not store an event name.
  if(typeof isRaceMode==='function' && !isRaceMode()) return '';
  if(activeRunSession?.eventName) return String(activeRunSession.eventName).trim();
  return getEventNameInputValue();
}

function syncEventNameFromInput(){
  if(!activeRunSession) return;
  if(typeof isRaceMode==='function' && !isRaceMode()){
    activeRunSession.eventName='';
    return;
  }
  activeRunSession.eventName=getEventNameInputValue();
  scheduleRunSessionSave();
}

function readStoredJson(key,fallback){
  try{
    const raw=localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch(error){
    console.warn('Could not read saved run data',error);
    return fallback;
  }
}

function writeStoredJson(key,value){
  try{
    localStorage.setItem(key,JSON.stringify(value));
    return true;
  }catch(error){
    console.warn('Could not save run data',error);
    return false;
  }
}

function getActiveRunSessionMeta(){
  if(!activeRunSession) return null;
  return {
    id:activeRunSession.id,
    schemaVersion:RUN_HISTORY_SCHEMA_VERSION,
    status:activeRunSession.status || 'active',
    source:activeRunSession.source || 'automatic',
    createdAt:activeRunSession.createdAt,
    updatedAt:activeRunSession.updatedAt || activeRunSession.createdAt,
    eventName:typeof isRaceMode==='function' && isRaceMode()
      ? (activeRunSession.eventName || getEventNameInputValue() || '')
      : '',
    notes:typeof activeRunSession.notes==='string' ? activeRunSession.notes : '',
    notesUpdatedAt:activeRunSession.notesUpdatedAt || null
  };
}

function ensureActiveRunSession(source='automatic'){
  if(activeRunSession) return activeRunSession;
  const now=new Date().toISOString();
  activeRunSession={
    id:createRunId(),
    schemaVersion:RUN_HISTORY_SCHEMA_VERSION,
    status:'active',
    source,
    createdAt:now,
    updatedAt:now,
    eventName:typeof isRaceMode==='function' && isRaceMode() ? getEventNameInputValue() : '',
    notes:'',
    notesUpdatedAt:null,
    reportData:null
  };
  scheduleRunSessionSave();
  renderRunHistory();
  return activeRunSession;
}

function buildRunSessionRecord(status='active'){
  if(!activeRunSession || typeof collectRunReportData!=='function') return null;
  const updatedAt=new Date().toISOString();
  const meta={
    ...getActiveRunSessionMeta(),
    status,
    updatedAt
  };
  const reportData=collectRunReportData();
  reportData.run={...meta};
  return {
    ...meta,
    playerName:reportData.player?.name || 'LINK',
    seedCode:reportData.seed?.code || '',
    eventName:meta.eventName || reportData.event?.name || '',
    notes:typeof meta.notes==='string'
      ? meta.notes
      : (typeof activeRunSession.notes==='string' ? activeRunSession.notes : ''),
    notesUpdatedAt:meta.notesUpdatedAt
      || activeRunSession.notesUpdatedAt
      || null,
    elapsedMs:Number(reportData.timer?.elapsedMs) || 0,
    reportData
  };
}

function persistActiveRunSessionNow(){
  clearTimeout(runSessionSaveTimer);
  runSessionSaveTimer=null;
  if(!activeRunSession) return null;
  const record=buildRunSessionRecord('active');
  if(!record) return null;
  activeRunSession=record;
  writeStoredJson(ACTIVE_RUN_STORAGE_KEY,record);
  renderRunHistory();
  return record;
}

function scheduleRunSessionSave(){
  if(!activeRunSession && typeof timerAutoStarted!=='undefined' && timerAutoStarted){
    ensureActiveRunSession('automatic');
  }
  if(!activeRunSession) return;
  clearTimeout(runSessionSaveTimer);
  runSessionSaveTimer=setTimeout(persistActiveRunSessionNow,250);
}

function persistSavedRunHistory(){
  savedRunHistory=savedRunHistory
    .filter(record=>record?.id && record.reportData && !isRunIdDeleted(record.id))
    .sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0,RUN_HISTORY_LIMIT);
  writeStoredJson(RUN_HISTORY_STORAGE_KEY,{
    schemaVersion:RUN_HISTORY_SCHEMA_VERSION,
    runs:savedRunHistory
  });
  // Mirror archives to LAN server so phone/PC see runs finished on OBS.
  if(typeof schedulePushRunHistoryToServer==='function'){
    schedulePushRunHistoryToServer();
  }
}

function archiveActiveRunSession(status='unfinished'){
  if(!activeRunSession) return null;
  const record=buildRunSessionRecord(status);
  if(!record) return null;
  record.status=status;
  record.reportData.run={...record.reportData.run,status};
  savedRunHistory=[record,...savedRunHistory.filter(run=>run.id!==record.id)];
  persistSavedRunHistory();
  activeRunSession=null;
  try{ localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY); }catch(error){}
  renderRunHistory();
  return record;
}

function discardActiveRunSession(){
  activeRunSession=null;
  clearTimeout(runSessionSaveTimer);
  runSessionSaveTimer=null;
  try{ localStorage.removeItem(ACTIVE_RUN_STORAGE_KEY); }catch(error){}
  renderRunHistory();
}

function restoreSeedFromRun(data){
  if(!data?.seed) return;
  currentSeedCode=data.seed.code || '';
  currentPermalink=data.seed.permalink || '';
  currentSeedMeta={
    mode:data.seed.mode || '',goal:data.seed.goal || '',logic:data.seed.logic || '',
    difficulty:data.seed.difficulty || '',variation:data.seed.variation || '',
    weapons:data.seed.weapons || '',state:data.seed.state || '',hints:data.seed.hints || ''
  };
  const input=document.getElementById('seedCode');
  if(input && !input.value) input.value=currentPermalink || currentSeedCode;
}

function restoreRunSession(record){
  if(!record?.reportData) return false;
  activeRunSession={...record,status:'active'};
  activeRunSession.reportData.run={
    ...(activeRunSession.reportData.run || {}),
    id:activeRunSession.id,
    status:'active'
  };
  setEventNameInputValue(record.eventName || record.reportData?.event?.name || '');
  if(activeRunSession){
    activeRunSession.eventName=record.eventName || record.reportData?.event?.name || '';
  }
  TrackerState.playerName=record.reportData.player?.name || record.playerName || 'LINK';
  if(record.reportData.snapshot?.save){
    TrackerState.save={...record.reportData.snapshot.save};
  }
  if(record.reportData.snapshot?.dungeonStats){
    TrackerState.dungeonStats={...record.reportData.snapshot.dungeonStats};
  }
  if(record.reportData.snapshot){
    TrackerState.room=Number(record.reportData.snapshot.room) || 0;
    TrackerState.area=Number(record.reportData.snapshot.area) || 0;
    TrackerState.world=record.reportData.snapshot.world || null;
    if(record.reportData.snapshot.region) playerRegion=record.reportData.snapshot.region;
  }
  if(typeof restoreDungeonPrizeState==='function'){
    restoreDungeonPrizeState(record.reportData);
  }
  restoreSeedFromRun(record.reportData);
  if(typeof restoreRunEventSnapshot==='function'){
    restoreRunEventSnapshot(record.reportData.events || []);
  }
  if(typeof restoreTimerSnapshot==='function'){
    restoreTimerSnapshot(record.reportData.timer || {});
  }
  writeStoredJson(ACTIVE_RUN_STORAGE_KEY,activeRunSession);
  renderRunHistory();
  return true;
}

function completeActiveRunSession(source='manual'){
  if(!activeRunSession) return false;
  if(activeRunSession.status === 'completed') return false;
  if(timerRunning) pauseTimer(false);
  const reason = source === 'auto'
    ? 'entered Triforce room (Ganon door transition)'
    : 'marked complete by runner';
  if(typeof recordTimerActivity === 'function'){
    recordTimerActivity('finish', reason);
  }
  if(typeof recordRunEvent === 'function'){
    recordRunEvent('run_completed', {source, reason});
  }
  archiveActiveRunSession('completed');
  resetTimer({archive:false});
  if(typeof celebrateRunFinish === 'function'){
    try{ celebrateRunFinish(); }catch(e){}
  }
  if(typeof log === 'function'){
    log(source === 'auto'
      ? 'Run complete — Triforce room entered. Saved to Run History with certificate.'
      : 'Run marked complete and saved to Run History.',
      'ok');
  }
  return true;
}

function finishActiveRunSession(options={}){
  if(!activeRunSession) return false;
  // Remote / LAN finish must not block on a confirm dialog (OBS has no user).
  const silent=!!(options && options.silent);
  if(!silent && !window.confirm('Finish this run and save it to Run History?')) return false;
  return completeActiveRunSession('manual');
}

/** Game mode $19 = Triforce Room scene; $1A = end sequence.
 *  Speedrun timing ends when entering the Triforce room after Ganon. */
function maybeAutoCompleteRunFromGameMode(gameMode){
  if(gameMode !== 0x19 && gameMode !== 0x1A) return;
  if(typeof timerAutoStarted === 'undefined' || !timerAutoStarted) return;
  if(!activeRunSession || activeRunSession.status === 'completed') return;
  completeActiveRunSession('auto');
}

function resumeSavedRun(id){
  const record=savedRunHistory.find(run=>run.id===id);
  if(!record) return;
  if(activeRunSession){
    const proceed=window.confirm('Archive the current run as unfinished and resume this saved run?');
    if(!proceed) return;
    archiveActiveRunSession('unfinished');
  }
  savedRunHistory=savedRunHistory.filter(run=>run.id!==id);
  persistSavedRunHistory();
  restoreRunSession(record);
  closeRunHistory();
}

function deleteSavedRun(id){
  const record=savedRunHistory.find(run=>run.id===id);
  if(!record) return;
  if(!window.confirm(`Delete ${record.playerName || 'this'} run from history?`)) return;
  savedRunHistory=savedRunHistory.filter(run=>run.id!==id);
  selectedRunComparisonIds.delete(id);
  markRunDeleted(id);
  persistSavedRunHistory();
  renderRunHistory();
}

function deleteSelectedRuns(){
  const ids=Array.from(selectedRunComparisonIds).filter(id=>
    savedRunHistory.some(run=>run.id===id)
  );
  if(!ids.length){
    window.alert('Select one or more finished runs to delete.');
    return;
  }
  const n=ids.length;
  if(!window.confirm(
    `Delete ${n} selected run${n===1?'':'s'} from history?\nThis cannot be undone.`
  )) return;
  const remove=new Set(ids);
  savedRunHistory=savedRunHistory.filter(run=>!remove.has(run.id));
  ids.forEach(id=>markRunDeleted(id));
  selectedRunComparisonIds.clear();
  persistSavedRunHistory();
  renderRunHistory();
}

function selectAllSavedRuns(){
  savedRunHistory.forEach(run=>{
    if(run?.id) selectedRunComparisonIds.add(run.id);
  });
  renderRunHistory();
}

function clearRunSelection(){
  selectedRunComparisonIds.clear();
  renderRunHistory();
}

function deleteActiveRun(){
  if(!activeRunSession) return;
  if(!window.confirm('Discard the current run and clear its timer data?')) return;
  resetTimer({archive:false});
}

function runStatusLabel(status){
  if(status==='completed') return 'Completed';
  if(status==='unfinished') return 'Unfinished';
  return 'Current Run';
}

function runDateLabel(record){
  const date=new Date(record.createdAt || record.updatedAt || Date.now());
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}

function makeHistoryButton(label,handler,className='ghost'){
  const button=document.createElement('button');
  button.type='button';
  button.className=className;
  button.textContent=label;
  button.addEventListener('click',handler);
  return button;
}

function selectedComparisonRuns(){
  return Array.from(selectedRunComparisonIds)
    .map(id=>savedRunHistory.find(run=>run.id===id))
    .filter(Boolean);
}

function updateComparisonControls(){
  const selected=selectedComparisonRuns();
  const n=selected.length;
  const label=document.getElementById('runComparisonSelection');
  const compare=document.getElementById('compareRuns');
  const download=document.getElementById('downloadRunComparison');
  const delBtn=document.getElementById('deleteSelectedRuns');
  if(label){
    if(n===0) label.textContent='None selected';
    else if(n===2) label.textContent='2 selected (A vs B ready)';
    else label.textContent=`${n} selected`;
  }
  if(compare) compare.disabled=n!==2;
  if(download) download.disabled=n!==2;
  if(delBtn){
    delBtn.disabled=n===0;
    delBtn.textContent=n>0 ? `Delete Selected (${n})` : 'Delete Selected';
  }
}

function toggleRunComparisonSelection(id){
  if(selectedRunComparisonIds.has(id)){
    selectedRunComparisonIds.delete(id);
  }else{
    // Multi-select: no cap. Compare still requires exactly two.
    selectedRunComparisonIds.add(id);
  }
  renderRunHistory();
}

function compareSelectedRuns(download=false){
  const records=selectedComparisonRuns();
  if(records.length!==2) return;
  if(download) downloadRunComparison(records);
  else openRunComparison(records);
}


function getRunNotes(record){
  if(!record) return '';
  if(typeof record.notes==='string' && record.notes.trim()) return record.notes;
  const fromReport=record.reportData?.run?.notes;
  return typeof fromReport==='string' ? fromReport : '';
}

function getRunNotesUpdatedAt(record){
  if(!record) return null;
  if(record.notesUpdatedAt) return record.notesUpdatedAt;
  return record.reportData?.run?.notesUpdatedAt || null;
}

function formatNotesTimestamp(value){
  if(!value) return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function findRunRecord(id){
  if(activeRunSession?.id===id) return {record:activeRunSession,isActive:true};
  const record=savedRunHistory.find(run=>run.id===id);
  return record ? {record,isActive:false} : null;
}

function applyNotesToRecord(record,notes,notesUpdatedAt){
  const cleaned=String(notes ?? '').slice(0,2000);
  const stamped=cleaned.trim() ? (notesUpdatedAt || new Date().toISOString()) : null;
  record.notes=cleaned;
  record.notesUpdatedAt=stamped;
  record.updatedAt=new Date().toISOString();
  if(record.reportData){
    record.reportData.run={
      ...(record.reportData.run || {}),
      notes:cleaned,
      notesUpdatedAt:stamped,
      updatedAt:record.updatedAt
    };
    // Top-level convenience for report viewers
    record.reportData.notes=cleaned;
    record.reportData.notesUpdatedAt=stamped;
  }
  return cleaned;
}

function saveRunNotes(id,notes,{clear=false}={}){
  const found=findRunRecord(id);
  if(!found) return false;
  const cleaned=clear ? '' : String(notes ?? '').slice(0,2000);
  applyNotesToRecord(found.record,cleaned,clear ? null : new Date().toISOString());
  if(found.isActive){
    writeStoredJson(ACTIVE_RUN_STORAGE_KEY,found.record);
  }else{
    persistSavedRunHistory();
  }
  renderRunHistory();
  return true;
}

function updateRunNotesMetaUI(record){
  const meta=document.getElementById('runNotesMeta');
  const clearBtn=document.getElementById('runNotesClear');
  const notes=getRunNotes(record).trim();
  const stamped=formatNotesTimestamp(getRunNotesUpdatedAt(record));
  if(meta){
    meta.textContent=notes
      ? (stamped ? `Last updated ${stamped}` : 'Saved with this run')
      : 'No note yet';
  }
  if(clearBtn) clearBtn.disabled=!notes;
}

function openRunNotesEditor(id){
  const found=findRunRecord(id);
  if(!found) return;
  const modal=document.getElementById('runNotesModal');
  const textarea=document.getElementById('runNotesText');
  const title=document.getElementById('runNotesTitle');
  if(!modal || !textarea) return;
  modal.dataset.runId=id;
  const name=found.record.playerName
    || found.record.reportData?.player?.name
    || 'LINK';
  if(title) title.textContent=`Notes — ${name}`;
  textarea.value=getRunNotes(found.record);
  updateRunNotesMetaUI(found.record);
  modal.hidden=false;
  document.body.classList.add('run-notes-open');
  setTimeout(()=>textarea.focus(),30);
}

function closeRunNotesEditor(){
  const modal=document.getElementById('runNotesModal');
  if(!modal) return;
  modal.hidden=true;
  delete modal.dataset.runId;
  document.body.classList.remove('run-notes-open');
}

function commitRunNotesEditor(){
  const modal=document.getElementById('runNotesModal');
  const textarea=document.getElementById('runNotesText');
  if(!modal || !textarea) return;
  const id=modal.dataset.runId;
  if(!id) return;
  saveRunNotes(id,textarea.value);
  closeRunNotesEditor();
}

function clearRunNotesEditor(){
  const modal=document.getElementById('runNotesModal');
  const textarea=document.getElementById('runNotesText');
  if(!modal || !textarea) return;
  const id=modal.dataset.runId;
  if(!id) return;
  if(!getRunNotes(findRunRecord(id)?.record || {}).trim()){
    textarea.value='';
    return;
  }
  if(!window.confirm('Clear the note for this run?')) return;
  saveRunNotes(id,'',{clear:true});
  textarea.value='';
  updateRunNotesMetaUI(findRunRecord(id)?.record || {notes:''});
}


let runNoteTooltipEl=null;
let runNoteTooltipHideTimer=null;

function ensureRunNoteTooltip(){
  if(runNoteTooltipEl) return runNoteTooltipEl;
  const tip=document.createElement('div');
  tip.id='runNoteTooltip';
  tip.className='run-note-tooltip';
  tip.hidden=true;
  tip.setAttribute('role','tooltip');
  document.body.appendChild(tip);
  runNoteTooltipEl=tip;
  return tip;
}

function hideRunNoteTooltip(){
  clearTimeout(runNoteTooltipHideTimer);
  runNoteTooltipHideTimer=null;
  if(!runNoteTooltipEl) return;
  runNoteTooltipEl.hidden=true;
  runNoteTooltipEl.classList.remove('visible');
}

function positionRunNoteTooltip(clientX,clientY){
  const tip=ensureRunNoteTooltip();
  if(tip.hidden) return;
  const pad=12;
  const rect=tip.getBoundingClientRect();
  let left=clientX+14;
  let top=clientY+16;
  if(left+rect.width+pad>window.innerWidth) left=clientX-rect.width-10;
  if(top+rect.height+pad>window.innerHeight) top=clientY-rect.height-12;
  left=Math.max(pad,left);
  top=Math.max(pad,top);
  tip.style.left=left+'px';
  tip.style.top=top+'px';
}

function showRunNoteTooltip(text,stamp,event){
  const tip=ensureRunNoteTooltip();
  clearTimeout(runNoteTooltipHideTimer);
  tip.replaceChildren();
  const body=document.createElement('div');
  body.className='run-note-tooltip-body';
  body.textContent=text;
  tip.appendChild(body);
  if(stamp){
    const meta=document.createElement('div');
    meta.className='run-note-tooltip-meta';
    meta.textContent='Updated '+stamp;
    tip.appendChild(meta);
  }
  tip.hidden=false;
  // Force layout so positioning uses real size
  void tip.offsetWidth;
  tip.classList.add('visible');
  if(event) positionRunNoteTooltip(event.clientX,event.clientY);
}

function bindRunNoteTooltip(el,text,stamp){
  el.addEventListener('mouseenter',e=>showRunNoteTooltip(text,stamp,e));
  el.addEventListener('mousemove',e=>positionRunNoteTooltip(e.clientX,e.clientY));
  el.addEventListener('mouseleave',()=>{
    runNoteTooltipHideTimer=setTimeout(hideRunNoteTooltip,80);
  });
  el.addEventListener('focus',e=>{
    // Keyboard focus: place near the element center
    const r=el.getBoundingClientRect();
    showRunNoteTooltip(text,stamp,{clientX:r.left+r.width/2,clientY:r.bottom});
  });
  el.addEventListener('blur',hideRunNoteTooltip);
}

function buildRunHistoryRow(record,isActive=false){
  const row=document.createElement('article');
  row.className='run-history-row';
  row.dataset.status=isActive?'active':record.status;

  let selector;
  if(isActive){
    selector=document.createElement('span');
    selector.className='run-history-select-placeholder';
  }else{
    const selected=selectedRunComparisonIds.has(record.id);
    const selectionIndex=selected
      ? Array.from(selectedRunComparisonIds).indexOf(record.id)
      : -1;
    row.dataset.selected=String(selected);
    selector=document.createElement('button');
    selector.type='button';
    selector.className='run-history-select';
    // A/B for the first two picks (compare); checkmark for additional multi-select.
    if(selected){
      selector.textContent=selectionIndex===0?'A':(selectionIndex===1?'B':'✓');
      selector.title=selectionIndex===0
        ? 'Run A (baseline) — click to deselect'
        : selectionIndex===1
          ? 'Run B (comparison) — click to deselect'
          : 'Selected — click to deselect';
    }else{
      selector.textContent='';
      selector.title='Select for compare or bulk delete';
    }
    selector.setAttribute('aria-label',selector.title);
    selector.setAttribute('aria-pressed',String(selected));
    selector.addEventListener('click',()=>toggleRunComparisonSelection(record.id));
  }

  const identity=document.createElement('div');
  identity.className='run-history-identity';
  const name=document.createElement('strong');
  name.textContent=record.playerName || record.reportData?.player?.name || 'LINK';
  const seed=document.createElement('span');
  seed.textContent=record.seedCode || record.reportData?.seed?.code || 'No seed attached';
  identity.append(name,seed);
  const eventLabel=record.eventName || record.reportData?.event?.name || '';
  if(eventLabel){
    const eventEl=document.createElement('span');
    eventEl.className='run-history-event';
    eventEl.textContent=eventLabel;
    identity.appendChild(eventEl);
  }
  const notes=getRunNotes(record).trim();
  if(notes){
    const noteEl=document.createElement('span');
    noteEl.className='run-history-note';
    noteEl.textContent=notes;
    noteEl.tabIndex=0;
    const stamped=formatNotesTimestamp(getRunNotesUpdatedAt(record));
    bindRunNoteTooltip(noteEl,notes,stamped || '');
    identity.appendChild(noteEl);
    if(stamped){
      const stampEl=document.createElement('span');
      stampEl.className='run-history-note-time';
      stampEl.textContent=stamped;
      identity.appendChild(stampEl);
    }
  }

  const timing=document.createElement('div');
  timing.className='run-history-timing';
  const elapsed=document.createElement('strong');
  elapsed.textContent=formatTime(Number(record.elapsedMs) || 0);
  const date=document.createElement('span');
  date.textContent=runDateLabel(record);
  timing.append(elapsed,date);

  const badge=document.createElement('span');
  badge.className='run-history-status';
  badge.textContent=runStatusLabel(isActive?'active':record.status);

  const actions=document.createElement('div');
  actions.className='run-history-actions';
  const noteLabel=getRunNotes(record).trim() ? 'Edit Note' : 'Note';
  actions.append(
    makeHistoryButton('View',()=>{
      try{
        if(typeof openRunReportData==='function') openRunReportData(record.reportData);
        else window.alert('Report viewer is unavailable.');
      }catch(error){
        console.error(error);
        window.alert('Could not open report: ' + (error.message || error));
      }
    }),
    makeHistoryButton('Download',()=>{
      try{
        if(typeof downloadRunReportData==='function') downloadRunReportData(record.reportData);
        else window.alert('Report download is unavailable.');
      }catch(error){
        console.error(error);
        window.alert('Could not download report: ' + (error.message || error));
      }
    }),
    makeHistoryButton(noteLabel,()=>openRunNotesEditor(record.id),'run-history-note-btn')
  );
  if(isActive){
    actions.append(
      makeHistoryButton('Finish & Save',finishActiveRunSession,'run-history-finish'),
      makeHistoryButton('Discard',deleteActiveRun)
    );
  }else{
    if(record.status!=='completed'){
      actions.append(makeHistoryButton('Resume',()=>resumeSavedRun(record.id)));
    }
    actions.append(makeHistoryButton('Delete',()=>deleteSavedRun(record.id)));
  }

  row.append(selector,identity,timing,badge,actions);
  return row;
}

function renderRunHistory(){
  const list=document.getElementById('runHistoryList');
  const count=document.getElementById('runHistoryCount');
  const buttonCount=document.getElementById('runHistoryButtonCount');
  const total=savedRunHistory.length+(activeRunSession?1:0);
  const validIds=new Set(savedRunHistory.map(run=>run.id));
  selectedRunComparisonIds=new Set(
    Array.from(selectedRunComparisonIds).filter(id=>validIds.has(id))
  );
  if(count) count.textContent=`${total} ${total===1?'run':'runs'}`;
  if(buttonCount) buttonCount.textContent=String(total);
  if(!list) return;

  list.innerHTML='';
  if(activeRunSession){
    const activeRecord=buildRunSessionRecord('active') || activeRunSession;
    list.appendChild(buildRunHistoryRow(activeRecord,true));
  }
  savedRunHistory.forEach(record=>list.appendChild(buildRunHistoryRow(record,false)));
  if(!list.children.length){
    const empty=document.createElement('div');
    empty.className='run-history-empty';
    empty.textContent='Your completed and interrupted runs will appear here automatically.';
    list.appendChild(empty);
  }
  updateComparisonControls();
}

function openRunHistory(){
  persistActiveRunSessionNow();
  renderRunHistory();
  if(!runHistoryModal) return;
  runHistoryModal.hidden=false;
  document.body.classList.add('run-history-open');
}

function closeRunHistory(){
  if(!runHistoryModal) return;
  runHistoryModal.hidden=true;
  document.body.classList.remove('run-history-open');
  hideRunNoteTooltip();
}

function exportRunLibrary(){
  persistActiveRunSessionNow();
  const payload={
    schemaVersion:RUN_HISTORY_SCHEMA_VERSION,
    exportedAt:new Date().toISOString(),
    activeRun:activeRunSession,
    runs:savedRunHistory
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=`ALTTPR_Run_Library_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function importRunLibrary(file){
  const reader=new FileReader();
  reader.addEventListener('load',()=>{
    try{
      const payload=JSON.parse(String(reader.result || ''));
      const imported=[
        ...(Array.isArray(payload.runs)?payload.runs:[]),
        ...(payload.activeRun?[{...payload.activeRun,status:'unfinished'}]:[])
      ].filter(record=>record?.id && record.reportData);
      if(!imported.length) throw new Error('No compatible runs were found.');
      const byId=new Map(savedRunHistory.map(record=>[record.id,record]));
      imported.forEach(record=>{
        const existing=byId.get(record.id);
        if(!existing || String(record.updatedAt)>String(existing.updatedAt)) byId.set(record.id,record);
      });
      savedRunHistory=Array.from(byId.values());
      persistSavedRunHistory();
      renderRunHistory();
    }catch(error){
      window.alert(`Run Library import failed: ${error.message || error}`);
    }
  });
  reader.readAsText(file);
}

function initRunHistory(){
  const storedHistory=readStoredJson(RUN_HISTORY_STORAGE_KEY,{runs:[]});
  savedRunHistory=Array.isArray(storedHistory?.runs) ? storedHistory.runs : [];
  const storedActive=readStoredJson(ACTIVE_RUN_STORAGE_KEY,null);

  runHistoryModal=document.getElementById('runHistoryModal');
  document.getElementById('runHistoryButton')?.addEventListener('click',openRunHistory);
  document.getElementById('eventName')?.addEventListener('input',()=>{
    syncEventNameFromInput();
  });
  document.getElementById('eventName')?.addEventListener('change',()=>{
    syncEventNameFromInput();
  });
  document.getElementById('runHistoryClose')?.addEventListener('click',closeRunHistory);
  document.getElementById('runNotesClose')?.addEventListener('click',closeRunNotesEditor);
  document.getElementById('runNotesCancel')?.addEventListener('click',closeRunNotesEditor);
  document.getElementById('runNotesClear')?.addEventListener('click',clearRunNotesEditor);
  document.getElementById('runNotesSave')?.addEventListener('click',commitRunNotesEditor);
  document.getElementById('runNotesModal')?.addEventListener('click',event=>{
    if(event.target===document.getElementById('runNotesModal')) closeRunNotesEditor();
  });
  document.getElementById('exportRunLibrary')?.addEventListener('click',exportRunLibrary);
  document.getElementById('importRunLibrary')?.addEventListener('click',()=>{
    document.getElementById('importRunLibraryFile')?.click();
  });
  document.getElementById('compareRuns')?.addEventListener('click',()=>compareSelectedRuns(false));
  document.getElementById('downloadRunComparison')?.addEventListener('click',()=>compareSelectedRuns(true));
  document.getElementById('deleteSelectedRuns')?.addEventListener('click',deleteSelectedRuns);
  document.getElementById('selectAllRuns')?.addEventListener('click',selectAllSavedRuns);
  document.getElementById('clearRunSelection')?.addEventListener('click',clearRunSelection);
  document.getElementById('importRunLibraryFile')?.addEventListener('change',event=>{
    const file=event.target.files?.[0];
    if(file) importRunLibrary(file);
    event.target.value='';
  });
  runHistoryModal?.addEventListener('click',event=>{
    if(event.target===runHistoryModal) closeRunHistory();
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape') return;
    const notesModal=document.getElementById('runNotesModal');
    if(notesModal && !notesModal.hidden){
      closeRunNotesEditor();
      return;
    }
    if(runHistoryModal && !runHistoryModal.hidden) closeRunHistory();
  });

  if(storedActive?.reportData){
    restoreRunSession(storedActive);
  }else if(typeof resetDungeonPrizeState==='function'){
    // Prize knowledge belongs to a run, not the tracker installation.
    // Clear assignments left by older builds when no run is being recovered.
    resetDungeonPrizeState();
  }
  renderRunHistory();

  // Publish local library to LAN so OBS/phone see each other's archives.
  if(typeof schedulePushRunHistoryToServer==='function'){
    setTimeout(()=>schedulePushRunHistoryToServer(), 800);
  }

  runHistoryCheckpointTimer=setInterval(()=>{
    if(activeRunSession) persistActiveRunSessionNow();
  },10000);
  window.addEventListener('beforeunload',()=>{
    if(activeRunSession) persistActiveRunSessionNow();
  });
}
