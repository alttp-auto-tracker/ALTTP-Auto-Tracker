/* ============================================================
   streamer.js
   Two jobs in one small file:

   1. RUNTIME: if the page is loaded with a `?obs=` query param,
      switch into "OBS mode" — hide everything except the
      requested panel(s), make the background transparent, and
      (unless told not to) auto-connect to SNI with retries.
      Prefer a SINGLE Browser Source that includes every panel
      you need. SNI only allows one device attach at a time, so
      separate sources (or the main app + an OBS source) will
      fight over the device and look "dead".

   2. BUILDER: powers the "Streamer URLs" modal in the main app,
      where you tick which panels you want together and get a
      ready-to-paste URL for one OBS Browser Source.

   URL format:
     tracker.html?obs=items,map,timer&host=192.168.1.42&port=23074&autoconnect=1
   - obs: comma-separated list from items, map, log, timer
   - host / port: optional, pre-fills the connect fields
   - autoconnect: defaults to on; pass &autoconnect=0 to disable
   - transparent: defaults to on; pass &transparent=0 for a solid background
   ============================================================ */

// Stream shell: pin display prefs before main.js reads localStorage on DOMContentLoaded.
(function pinStreamItemPrefs(){
  try{
    if(/streamer\.html/i.test(location.pathname||'') ||
       document.body?.classList.contains('stream-shell')){
      localStorage.setItem('itemDisplayMode','compact');
      localStorage.setItem('itemToneMode','bright');
    }
  }catch(e){ /* ignore */ }
})();

const STREAMER_PANELS=[
  {key:'items',label:'Items'},
  {key:'map',label:'Map'},
  {key:'timer',label:'Run Timer'},
  {key:'best',label:'Best Play'},
  {key:'log',label:'Log'}
];

// Presets favor combined panels (one Browser Source = one SNI attach).
const STREAMER_PRESETS=[
  {label:'Items + Map + Timer',panels:['items','map','timer']},
  {label:'Classic (Best + Maps)',panels:['items','map','timer','best']},
  {label:'Items + Timer',panels:['items','timer']},
  {label:'Map + Timer',panels:['map','timer']},
  {label:'Everything (one source)',panels:['items','map','timer','best','log']},
  {label:'Items only',panels:['items']},
  {label:'Map only',panels:['map']},
  {label:'Timer only',panels:['timer']}
];

/* ---- Layout presets + URL slot assignment ----
   Slots: top | left | center | right | bottom
   Modules: timer | best | maps | items | game | log | none
   URL examples:
     ?layout=classic
     ?layout=race&top=timer&right=maps&bottom=items
*/
const STREAMER_SLOT_KEYS=['top','left','center','right','bottom'];
const STREAMER_MODULES=[
  {key:'none',label:'(empty)'},
  {key:'timer',label:'Run Timer'},
  {key:'best',label:'Best Play'},
  {key:'maps',label:'Maps'},
  {key:'items',label:'Items'},
  {key:'game',label:'Game hole'},
  {key:'log',label:'Log'}
];

const STREAMER_LAYOUT_PRESETS={
  classic:{
    label:'Classic',
    slots:{top:'timer',left:'best',center:'game',right:'maps',bottom:'items'},
    panels:['timer','best','map','items']
  },
  race:{
    label:'Race',
    slots:{top:'timer',left:'none',center:'game',right:'maps',bottom:'items'},
    panels:['timer','map','items']
  },
  focus_items:{
    label:'Items focus',
    slots:{top:'timer',left:'items',center:'game',right:'maps',bottom:'none'},
    panels:['timer','items','map']
  },
  maps_left:{
    label:'Maps left',
    slots:{top:'timer',left:'maps',center:'game',right:'best',bottom:'items'},
    panels:['timer','map','best','items']
  },
  timer_only:{
    label:'Timer only',
    slots:{top:'timer',left:'none',center:'none',right:'none',bottom:'none'},
    panels:['timer']
  },
  items_only:{
    label:'Items only',
    slots:{top:'none',left:'none',center:'none',right:'none',bottom:'items'},
    panels:['items']
  },
  maps_only:{
    label:'Maps only',
    slots:{top:'none',left:'none',center:'maps',right:'none',bottom:'none'},
    panels:['map']
  }
};

function normalizeStreamModule(name){
  if(!name) return 'none';
  const n=String(name).trim().toLowerCase();
  if(n==='map') return 'maps';
  if(n==='empty' || n==='' || n==='-') return 'none';
  const allowed=STREAMER_MODULES.map(m=>m.key);
  return allowed.includes(n)?n:'none';
}

function defaultStreamSlots(){
  return {...STREAMER_LAYOUT_PRESETS.classic.slots};
}

function resolveStreamSlotsFromUrl(params){
  const layoutKey=(params.get('layout')||params.get('preset')||'').trim().toLowerCase().replace(/-/g,'_');
  let slots=defaultStreamSlots();
  if(layoutKey && STREAMER_LAYOUT_PRESETS[layoutKey]){
    slots={...STREAMER_LAYOUT_PRESETS[layoutKey].slots};
  }
  // Per-slot overrides always win.
  STREAMER_SLOT_KEYS.forEach(slot=>{
    if(params.has(slot)) slots[slot]=normalizeStreamModule(params.get(slot));
  });
  return slots;
}

function modulesUsedInSlots(slots){
  const used=new Set();
  Object.values(slots).forEach(m=>{
    if(m && m!=='none') used.add(m==='maps'?'map':m);
  });
  return [...used];
}

function applyStreamLayoutSlots(slots){
  const layout=document.querySelector('.stream-layout');
  if(!layout || !slots) return;
  const top=normalizeStreamModule(slots.top);
  const left=normalizeStreamModule(slots.left);
  const center=normalizeStreamModule(slots.center);
  const right=normalizeStreamModule(slots.right);
  const bottom=normalizeStreamModule(slots.bottom);

  // CSS grid-template-areas names must match .stream-* grid-area values.
  // "none" is not valid — use "." for empty cells.
  const cell=v=>v==='none'?'.':v;
  const areas=`"${cell(top)} ${cell(top)} ${cell(top)}" "${cell(left)} ${cell(center)} ${cell(right)}" "${cell(bottom)} ${cell(bottom)} ${cell(bottom)}"`;
  layout.style.gridTemplateAreas=areas;

  // Collapse empty rows/columns for single-panel layouts.
  const midEmpty=left==='none' && center==='none' && right==='none';
  const topEmpty=top==='none';
  const bottomEmpty=bottom==='none';
  if(topEmpty && bottomEmpty && !midEmpty){
    layout.style.gridTemplateRows='minmax(0,1fr)';
    layout.style.gridTemplateAreas=`"${cell(left)} ${cell(center)} ${cell(right)}"`;
  }else if(topEmpty && midEmpty && !bottomEmpty){
    // Items-only (etc.): keep panel on the bottom strip of the viewport.
    layout.style.gridTemplateRows='1fr auto';
    layout.style.gridTemplateAreas=`". . ." "${cell(bottom)} ${cell(bottom)} ${cell(bottom)}"`;
  }else if(!topEmpty && midEmpty && bottomEmpty){
    layout.style.gridTemplateRows='auto';
    layout.style.gridTemplateAreas=`"${cell(top)} ${cell(top)} ${cell(top)}"`;
  }else{
    layout.style.gridTemplateRows='auto minmax(0,1fr) auto';
  }

  // Show/hide module roots by slot membership.
  const show=new Set([top,left,center,right,bottom].filter(m=>m && m!=='none'));
  const map={
    timer:document.getElementById('colTimer'),
    best:document.getElementById('colBest'),
    maps:document.getElementById('colMaps'),
    items:document.getElementById('colItems'),
    game:document.getElementById('streamGameHole'),
    log:document.getElementById('colLog')
  };
  Object.entries(map).forEach(([key,el])=>{
    if(!el) return;
    const on=show.has(key);
    el.hidden=!on;
    el.style.display=on?'':'none';
    if(key==='log'){
      el.classList.toggle('stream-hidden-chrome',!on);
      if(on) el.classList.add('stream-log-visible');
    }
  });

  // Items in left/right (narrow column) need a vertical grid, not the 15-col strip.
  const itemsEl=map.items;
  if(itemsEl){
    const narrow=left==='items' || right==='items';
    itemsEl.classList.toggle('stream-items-narrow',narrow);
    itemsEl.classList.toggle('stream-items-bottom',bottom==='items');
    itemsEl.classList.toggle('stream-items-center',center==='items');
  }

  document.body.dataset.streamLayout=JSON.stringify({top,left,center,right,bottom});
}

function readStreamerLayoutFromModal(){
  const layoutSel=document.getElementById('streamerLayoutPreset');
  const layoutKey=layoutSel?.value || 'classic';
  const slots={};
  STREAMER_SLOT_KEYS.forEach(slot=>{
    const el=document.getElementById('streamerSlot-'+slot);
    slots[slot]=normalizeStreamModule(el?.value || 'none');
  });
  return {layoutKey,slots};
}

function applyStreamerLayoutPresetToModal(key){
  const preset=STREAMER_LAYOUT_PRESETS[key];
  if(!preset) return;
  const layoutSel=document.getElementById('streamerLayoutPreset');
  if(layoutSel) layoutSel.value=key;
  STREAMER_SLOT_KEYS.forEach(slot=>{
    const el=document.getElementById('streamerSlot-'+slot);
    if(el) el.value=preset.slots[slot] || 'none';
  });
  // Also tick matching panels.
  if(preset.panels) applyStreamerPreset(preset.panels);
}

const OBS_CONNECT_MAX_ATTEMPTS=40;
const OBS_CONNECT_RETRY_MS=2000;

// Filled from the URL as soon as this file loads (before DOM).
const STREAM_CONNECT={
  host:null,
  port:null,
  autoconnect:true,
  started:false
};

/* ---------------- Runtime: OBS / streamer.html mode on load ---------------- */

function isStreamerShellPage(){
  return document.body?.classList.contains('stream-shell') ||
    /streamer\.html/i.test(location.pathname||'');
}

function applyStreamHostPort(){
  const hostInput=document.getElementById('host');
  const portInput=document.getElementById('port');
  const host=STREAM_CONNECT.host || '127.0.0.1';
  const port=STREAM_CONNECT.port || '23074';
  if(hostInput) hostInput.value=host;
  if(portInput) portInput.value=port;
}

function applyStreamDisplayPrefs(params,streamShell){
  const wantCompact=streamShell || params.get('compact')!=='0';
  const wantBright=streamShell || params.get('bright')!=='0';
  if(wantCompact && typeof applyItemDisplayMode==='function'){
    try{ localStorage.setItem('itemDisplayMode','compact'); }catch(e){ /* ignore */ }
    applyItemDisplayMode('compact');
  }
  if(wantBright && typeof applyItemToneMode==='function'){
    try{ localStorage.setItem('itemToneMode','bright'); }catch(e){ /* ignore */ }
    applyItemToneMode('bright');
  }
  // Belt-and-suspenders: class the grid even if localStorage was smoked/detailed.
  const grid=document.getElementById('gridAll');
  if(grid){
    if(wantCompact){ grid.classList.add('compact'); grid.dataset.view='compact'; }
    if(wantBright){ grid.classList.add('bright-icons'); grid.dataset.tone='bright'; }
  }
  if(params.get('race')==='1' && typeof SETTINGS!=='undefined'){
    SETTINGS.raceMode=true;
    try{ localStorage.setItem('raceMode','true'); }catch(e){ /* ignore */ }
    if(typeof updateModeButton==='function') updateModeButton();
  }

  // Optional URL seed for modes. Live changes sync via /api/rando-modes
  // (main tracker ↔ OBS) so you do not need a new browser-source URL.
  const urlModes={
    worldMode:params.get('world') || params.get('worldMode'),
    keysMode:params.get('keys') || params.get('keysMode'),
    bossMode:params.get('boss') || params.get('bosses') || params.get('bossMode'),
    entranceMode:params.get('entrances') || params.get('entrance') || params.get('entranceMode')
  };
  const hasUrlModes=Object.values(urlModes).some(Boolean);
  if(hasUrlModes && typeof applyRandoModeValues==='function'){
    applyRandoModeValues(urlModes,{silent:true,force:true});
    if(typeof schedulePushRandoModesToServer==='function'){
      schedulePushRandoModesToServer();
    }else if(typeof broadcastRandoModes==='function'){
      broadcastRandoModes();
    }
  }else if(hasUrlModes && typeof SETTINGS!=='undefined'){
    const world=params.get('world') || params.get('worldMode');
    const keys=params.get('keys') || params.get('keysMode');
    const boss=params.get('boss') || params.get('bosses') || params.get('bossMode');
    if(world){ SETTINGS.worldMode=world; try{ localStorage.setItem('worldMode',world); }catch(e){} }
    if(keys){ SETTINGS.keysMode=keys; try{ localStorage.setItem('keysMode',keys); }catch(e){} }
    if(boss){ SETTINGS.bossMode=boss; try{ localStorage.setItem('bossMode',boss); }catch(e){} }
    const entrances=params.get('entrances') || params.get('entrance') || params.get('entranceMode');
    if(entrances){ SETTINGS.entranceMode=entrances; try{ localStorage.setItem('entranceMode',entrances); }catch(e){} }
    if(typeof applyRandoModeVisibility==='function') applyRandoModeVisibility();
  }
}

function scheduleStreamAutoConnect(){
  if(!STREAM_CONNECT.autoconnect || STREAM_CONNECT.started) return;
  STREAM_CONNECT.started=true;
  // OBS Browser Source can be slow to finish script init; give it a beat,
  // then keep retrying so a late SNI / free device still gets picked up.
  setTimeout(()=>obsAutoConnect(1),800);
}

// Called from tracker.js when the WebSocket drops mid-run.
function onTrackerDisconnect(){
  if(!STREAM_CONNECT.autoconnect) return;
  // Allow scheduleStreamAutoConnect to arm again.
  STREAM_CONNECT.started=false;
  setObsStatus('Disconnected from SNI — reconnecting…','err');
  setTimeout(()=>scheduleStreamAutoConnect(),1500);
}


(function applyObsModeFromUrl(){
  const params=new URLSearchParams(location.search);
  const obsParam=params.get('obs');
  // pathname check works even before body exists
  const streamShell=/streamer\.html/i.test(location.pathname||'') ||
    document.body?.classList.contains('stream-shell');

  if(!streamShell && !obsParam) return;

  STREAM_CONNECT.host=params.get('host') || '127.0.0.1';
  STREAM_CONNECT.port=params.get('port') || '23074';
  STREAM_CONNECT.autoconnect=params.get('autoconnect')!=='0';

  const slots=resolveStreamSlotsFromUrl(params);
  const layoutKey=(params.get('layout')||params.get('preset')||'').trim().toLowerCase().replace(/-/g,'_');
  let panels=(obsParam||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!panels.length){
    if(layoutKey && STREAMER_LAYOUT_PRESETS[layoutKey]){
      panels=[...STREAMER_LAYOUT_PRESETS[layoutKey].panels];
    }else{
      panels=modulesUsedInSlots(slots);
      if(!panels.length) panels=['items','map','timer'];
    }
  }

  document.documentElement.classList.add('obs-mode-html');
  const applyToBody=()=>{
    document.body.classList.add('obs-mode');
    if(!document.body.dataset.obsPanels){
      document.body.dataset.obsPanels=panels.join(' ');
    }
    if(params.get('transparent')!=='0') document.body.classList.add('obs-transparent');
    applyStreamHostPort();
    applyStreamLayoutSlots(slots);
  };
  if(document.body) applyToBody();
  else document.addEventListener('DOMContentLoaded',applyToBody);

  const boot=()=>{
    applyStreamHostPort();
    applyStreamDisplayPrefs(params,streamShell);
    if(STREAM_CONNECT.autoconnect) scheduleStreamAutoConnect();
  };

  // Fire on both DOMContentLoaded and load — whichever is late enough
  // that startTracking exists. scheduleStreamAutoConnect is one-shot.
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',boot);
  }else{
    boot();
  }
  window.addEventListener('load',boot);
})();

// Finish Run + visible Connect bar on streamer.html
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('finishRunButton')?.addEventListener('click',()=>{
    if(typeof finishActiveRunSession==='function'){
      finishActiveRunSession();
    }else{
      setObsStatus('Finish is unavailable — Run History did not load.','err');
    }
  });

  const streamBtn=document.getElementById('streamConnectBtn');
  if(streamBtn){
    streamBtn.addEventListener('click',()=>{
      const h=document.getElementById('streamHostField')?.value.trim()||'127.0.0.1';
      const p=document.getElementById('streamPortField')?.value.trim()||'23074';
      const hostInput=document.getElementById('host');
      const portInput=document.getElementById('port');
      if(hostInput) hostInput.value=h;
      if(portInput) portInput.value=p;
      obsAutoConnect(1);
    });
  }
  syncStreamConnectFieldsFromMain();
});

function syncStreamConnectFieldsFromMain(){
  const host=document.getElementById('host')?.value||'127.0.0.1';
  const port=document.getElementById('port')?.value||'23074';
  const sh=document.getElementById('streamHostField');
  const sp=document.getElementById('streamPortField');
  if(sh && !sh.dataset.touched) sh.value=host;
  if(sp && !sp.dataset.touched) sp.value=port;
  sh?.addEventListener('input',()=>{ sh.dataset.touched='1'; },{once:true});
  sp?.addEventListener('input',()=>{ sp.dataset.touched='1'; },{once:true});
}

function updateStreamConnectBar(msg,cls){
  const bar=document.getElementById('streamConnectBar');
  const label=document.getElementById('streamConnectMsg');
  if(!bar) return;
  if(label) label.textContent=msg||'';
  bar.dataset.state=cls==='ok'?'ok':'err';
  if(cls==='ok'){
    bar.hidden=false;
    clearTimeout(bar._hideTimer);
    bar._hideTimer=setTimeout(()=>{ bar.hidden=true; },3500);
  }else{
    bar.hidden=false;
  }
}

function ensureObsStatusEl(){
  if(document.getElementById('obsStatus')) return;
  const el=document.createElement('div');
  el.id='obsStatus';
  el.className='obs-status';
  el.setAttribute('role','status');
  el.textContent='OBS mode — connecting…';
  // Prefer top of .wrap so it sits above panels; fall back to body.
  const wrap=document.querySelector('.wrap');
  if(wrap) wrap.insertBefore(el,wrap.firstChild);
  else document.body.insertBefore(el,document.body.firstChild);
}

function setObsStatus(msg,cls){
  ensureObsStatusEl();
  const el=document.getElementById('obsStatus');
  if(el){
    el.textContent=msg||'';
    el.className='obs-status'+(cls?(' '+cls):'');
    el.hidden=!msg;
    if(cls==='ok'){
      clearTimeout(el._hideTimer);
      el._hideTimer=setTimeout(()=>{
        if(el.classList.contains('ok')) el.hidden=true;
      },4000);
    }
  }
  updateStreamConnectBar(msg,cls);
}

async function obsAutoConnect(attempt){
  attempt=attempt||1;
  if(typeof startTracking!=='function'){
    if(attempt<OBS_CONNECT_MAX_ATTEMPTS){
      setObsStatus('Waiting for tracker to initialize… ('+attempt+'/'+OBS_CONNECT_MAX_ATTEMPTS+')');
      setTimeout(()=>obsAutoConnect(attempt+1),OBS_CONNECT_RETRY_MS);
    }else{
      setObsStatus('Tracker failed to initialize. Check the browser console.','err');
    }
    return;
  }

  // Already tracking (e.g. user clicked Connect) — nothing to do.
  if(typeof tracking==='boolean' && tracking){
    setObsStatus('Tracking.','ok');
    return;
  }

  applyStreamHostPort();
  const host=(STREAM_CONNECT.host || document.getElementById('host')?.value.trim() || '127.0.0.1');
  const port=(STREAM_CONNECT.port || document.getElementById('port')?.value.trim() || '23074');
  const hostInput=document.getElementById('host');
  const portInput=document.getElementById('port');
  if(hostInput) hostInput.value=host;
  if(portInput) portInput.value=port;

  setObsStatus('Connecting to '+host+':'+port+'… (try '+attempt+'/'+OBS_CONNECT_MAX_ATTEMPTS+')');

  let ok=false;
  try{
    ok=await startTracking(host,port);
  }catch(e){
    ok=false;
    setObsStatus('Connect error: '+(e.message||e),'err');
  }

  if(ok){
    setObsStatus('Attached — tracking.','ok');
    return;
  }

  // Common case: main tracker still holds the device, or emulator not ready.
  if(attempt<OBS_CONNECT_MAX_ATTEMPTS){
    setObsStatus(
      'Could not attach (try '+attempt+'/'+OBS_CONNECT_MAX_ATTEMPTS+'). '+
      'Disconnect the main tracker window and ensure the emulator is attached to SNI. Retrying…',
      'err'
    );
    setTimeout(()=>obsAutoConnect(attempt+1),OBS_CONNECT_RETRY_MS);
  }else{
    setObsStatus(
      'Still cannot attach after '+OBS_CONNECT_MAX_ATTEMPTS+' tries. '+
      'Disconnect the main tracker, confirm SNI is running, then retrying in 5s…',
      'err'
    );
    // Keep trying in the background — OBS sources often load before SNI is free.
    setTimeout(()=>{ STREAM_CONNECT.started=false; scheduleStreamAutoConnect(); },5000);
  }
}

/* ---------------- Builder: the "Streamer URLs" modal ---------------- */

function buildStreamerUrl(panelKeys,host,port,autoconnect){
  // Prefer the dedicated stream shell. When the app was opened as a
  // file:// page, rewrite to the local static server so OBS gets a
  // real http URL (file:// overlays are unreliable with WebSockets).
  let url;
  if(location.protocol==='file:'){
    url=new URL('http://localhost:8000/streamer.html');
  }else{
    url=new URL(location.href);
    url.search='';
    if(/streamer\.html$/i.test(url.pathname)){
      // already on the stream shell
    }else if(/tracker\.html$/i.test(url.pathname)){
      url.pathname=url.pathname.replace(/tracker\.html$/i,'streamer.html');
    }else{
      const base=url.pathname.endsWith('/')?url.pathname:url.pathname.replace(/\/[^/]*$/,'/');
      url.pathname=base+'streamer.html';
    }
  }
  if(panelKeys && panelKeys.length){
    url.searchParams.set('obs',panelKeys.join(','));
  }
  if(host) url.searchParams.set('host',host);
  if(port) url.searchParams.set('port',port);
  if(!autoconnect) url.searchParams.set('autoconnect','0');

  // Bake current rando modes into the OBS URL so the overlay matches
  // whatever is selected on the main tracker (OBS storage is separate).
  if(typeof SETTINGS!=='undefined'){
    if(SETTINGS.worldMode) url.searchParams.set('world',SETTINGS.worldMode);
    if(SETTINGS.keysMode) url.searchParams.set('keys',SETTINGS.keysMode);
    if(SETTINGS.bossMode) url.searchParams.set('boss',SETTINGS.bossMode);
    if(SETTINGS.entranceMode) url.searchParams.set('entrances',SETTINGS.entranceMode);
  }else{
    try{
      const world=localStorage.getItem('worldMode');
      const keys=localStorage.getItem('keysMode');
      const boss=localStorage.getItem('bossMode');
      const entrances=localStorage.getItem('entranceMode');
      if(world) url.searchParams.set('world',world);
      if(keys) url.searchParams.set('keys',keys);
      if(boss) url.searchParams.set('boss',boss);
      if(entrances) url.searchParams.set('entrances',entrances);
    }catch(e){ /* ignore */ }
  }
  // Layout preset + slot assignment
  const layoutSel=document.getElementById('streamerLayoutPreset');
  const layoutKey=layoutSel?.value || '';
  if(layoutKey && layoutKey!=='custom'){
    url.searchParams.set('layout', layoutKey);
  }
  STREAMER_SLOT_KEYS.forEach(slot=>{
    const el=document.getElementById('streamerSlot-'+slot);
    const val=normalizeStreamModule(el?.value || 'none');
    if(val && val!=='none'){
      // Only write overrides that matter; always write for clarity when customizing
      url.searchParams.set(slot, val);
    }else if(el && el.value==='none'){
      url.searchParams.set(slot, 'none');
    }
  });

  // Cache-bust token so a freshly copied OBS URL is not reused from CEF cache.
  // Stable for a given page session; copyStreamerUrl refreshes it on Copy.
  if(!url.searchParams.has('_')){
    url.searchParams.set('_', String(Date.now()));
  }
  return url.toString();
}

function selectedStreamerPanels(){
  return STREAMER_PANELS
    .filter(p=>document.getElementById('streamerPanel-'+p.key)?.checked)
    .map(p=>p.key);
}

function refreshStreamerUrl(){
  const out=document.getElementById('streamerUrlOutput');
  if(!out) return;
  const panels=selectedStreamerPanels();
  const host=document.getElementById('streamerHost')?.value.trim();
  const port=document.getElementById('streamerPort')?.value.trim();
  const autoconnect=document.getElementById('streamerAutoconnect')?.checked ?? true;
  out.value=panels.length ? buildStreamerUrl(panels,host,port,autoconnect) : '';
}

function applyStreamerPreset(panelKeys){
  STREAMER_PANELS.forEach(p=>{
    const box=document.getElementById('streamerPanel-'+p.key);
    if(box) box.checked=panelKeys.includes(p.key);
  });
  refreshStreamerUrl();
}

function openStreamerModal(){
  const modal=document.getElementById('streamerModal');
  if(!modal) return;
  const hostField=document.getElementById('streamerHost');
  const portField=document.getElementById('streamerPort');
  if(hostField && !hostField.value) hostField.value=document.getElementById('host')?.value.trim()||'127.0.0.1';
  if(portField && !portField.value) portField.value=document.getElementById('port')?.value.trim()||'23074';
  // Default to the recommended combined layout if nothing is checked yet.
  const anyChecked=STREAMER_PANELS.some(p=>document.getElementById('streamerPanel-'+p.key)?.checked);
  if(!anyChecked) applyStreamerPreset(['items','map','timer']);
  modal.hidden=false;
  refreshStreamerUrl();
}

function closeStreamerModal(){
  const modal=document.getElementById('streamerModal');
  if(modal) modal.hidden=true;
}

async function copyStreamerUrl(){
  const out=document.getElementById('streamerUrlOutput');
  const btn=document.getElementById('streamerCopyBtn');
  if(!out || !out.value) return;
  // Mint a fresh bust token at copy-time so OBS sees a new URL.
  try{
    const u=new URL(out.value);
    u.searchParams.set('_', String(Date.now()));
    out.value=u.toString();
  }catch(e){ /* keep original */ }
  try{
    await navigator.clipboard.writeText(out.value);
  }catch(e){
    out.select();
    document.execCommand('copy');
  }
  if(btn){
    btn.textContent='Copied!';
    btn.classList.add('copied');
    setTimeout(()=>{btn.textContent='Copy'; btn.classList.remove('copied');},1400);
  }
}

function initStreamerModal(){
  const openBtn=document.getElementById('streamerUrlsButton');
  const modal=document.getElementById('streamerModal');
  if(!openBtn || !modal) return;

  openBtn.addEventListener('click',openStreamerModal);
  document.getElementById('streamerClose')?.addEventListener('click',closeStreamerModal);
  modal.addEventListener('click',event=>{
    if(event.target===modal) closeStreamerModal();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && !modal.hidden) closeStreamerModal();
  });

  STREAMER_PANELS.forEach(p=>{
    document.getElementById('streamerPanel-'+p.key)?.addEventListener('change',refreshStreamerUrl);
  });
  document.getElementById('streamerHost')?.addEventListener('input',refreshStreamerUrl);
  document.getElementById('streamerPort')?.addEventListener('input',refreshStreamerUrl);
  document.getElementById('streamerAutoconnect')?.addEventListener('change',refreshStreamerUrl);
  document.getElementById('streamerCopyBtn')?.addEventListener('click',copyStreamerUrl);

  // Layout preset + slot dropdowns
  const layoutSel=document.getElementById('streamerLayoutPreset');
  if(layoutSel){
    layoutSel.innerHTML=Object.entries(STREAMER_LAYOUT_PRESETS).map(([key,p])=>
      `<option value="${key}">${p.label}</option>`
    ).join('') + '<option value="custom">Custom slots</option>';
    layoutSel.addEventListener('change',()=>{
      if(layoutSel.value!=='custom') applyStreamerLayoutPresetToModal(layoutSel.value);
      refreshStreamerUrl();
    });
  }
  STREAMER_SLOT_KEYS.forEach(slot=>{
    const el=document.getElementById('streamerSlot-'+slot);
    if(!el) return;
    el.innerHTML=STREAMER_MODULES.map(m=>
      `<option value="${m.key}">${m.label}</option>`
    ).join('');
    el.addEventListener('change',()=>{
      if(layoutSel) layoutSel.value='custom';
      refreshStreamerUrl();
    });
  });
  // Default modal to classic layout slots
  applyStreamerLayoutPresetToModal('classic');

  const presetRow=document.getElementById('streamerPresets');
  if(presetRow){
    STREAMER_PRESETS.forEach(preset=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.textContent=preset.label;
      btn.addEventListener('click',()=>{
        applyStreamerPreset(preset.panels);
        // Map panel presets onto closest layout when obvious
        const map={
          'items,map,timer':'race',
          'items,map,timer,best':'classic',
          'timer':'timer_only',
          'items':'items_only',
          'map':'maps_only'
        };
        const key=map[preset.panels.join(',')];
        if(key) applyStreamerLayoutPresetToModal(key);
        refreshStreamerUrl();
      });
      presetRow.appendChild(btn);
    });
  }
}

document.addEventListener('DOMContentLoaded',initStreamerModal);


/* ---- Tiny status hook for LAN sync (modes / entrances) ---- */
function updateStreamSyncStatus(kind, ok){
  const el=document.getElementById('streamSyncStatus');
  if(!el) return;
  const label=kind==='entrances'?'Entrances':'Modes';
  el.textContent=ok?(label+' synced'): (label+' sync…');
  el.dataset.state=ok?'ok':'pending';
}


/* Timer on OBS only advances while THIS browser source is attached to SNI.
   If the main tracker holds the device, the overlay stays Disconnected and
   the clock freezes — that is expected, not a layout bug. */
function refreshStreamTimerHint(){
  const msg = document.getElementById('timerMessage');
  if(!msg || !document.body?.classList.contains('stream-shell')) return;
  const disconnected = document.getElementById('timerBlock')?.dataset?.state === 'disconnected';
  if(disconnected){
    msg.textContent = 'SNI not attached here — timer freezes until this overlay (or only the main tracker) holds the device.';
  }
}
setInterval(()=>{ try{ refreshStreamTimerHint(); }catch(e){} }, 2000);
document.addEventListener('DOMContentLoaded', ()=>setTimeout(refreshStreamTimerHint, 500));


/* ---- OBS stale-shell recovery ----
   Chrome picks up new streamer.html; OBS CEF often does not until the URL
   changes or the source is fully reloaded. Poll build id and reload. */
function watchStreamBuildId(){
  if(!/streamer\.html/i.test(location.pathname||'')) return;
  let current = document.querySelector('meta[name="lttp-build-id"]')?.content || '';
  const tick = async ()=>{
    try{
      const res = await fetch('/api/build-id', {cache:'no-store'});
      if(!res.ok) return;
      const data = await res.json();
      const id = String(data?.id || '');
      if(!id) return;
      if(!current){ current = id; return; }
      if(id !== current){
        // Force a full reload with a fresh cache-bust query.
        const u = new URL(location.href);
        u.searchParams.set('_', id);
        location.replace(u.toString());
      }
    }catch(e){ /* ignore */ }
  };
  setInterval(tick, 3000);
  setTimeout(tick, 1500);
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', watchStreamBuildId);
}else{
  watchStreamBuildId();
}
