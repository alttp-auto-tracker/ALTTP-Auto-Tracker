/* ============================================================
   map.js
   World map — standalone checks + dungeon entry markers.
   Handles marker rendering, click-to-check, drag-to-calibrate,
   add-marker mode, rename mode, medallion selects, and the
   "Export Positions" button.
   ============================================================ */

let mmMedallion='unknown', trMedallion='unknown';

let lastState=null;
let demoOverrides = {};

// Only one of these is ever true at a time — see setMode() below.
let calibrateMode=false;
let addMarkerMode=false;
let renameMode=false;
const calibration={};

let panelLight, panelDark, mapPanelsEl;
let customMarkerSeq=0;

// Mobile-only Light World / Dark World pill tabs above the map panels.
// Desktop ignores all of this — the CSS that hides/shows panels by
// world only exists inside the max-width:900px media query.
const MAP_WORLD_STORAGE_KEY='mapActiveWorld';
const MAP_WORLD_AUTO_SWITCH_COOLDOWN_MS=12000; // skip auto-switch this soon after a manual tap
let activeMapWorld=localStorage.getItem(MAP_WORLD_STORAGE_KEY)==='dark' ? 'dark' : 'light';
let lastManualWorldSwitchAt=0;
let lastKnownPlayerWorld=null;
let dungeonGuideCard=null;
let pinnedDungeonGuide=null;
let activeDungeonGuide=null;
let dungeonGuideHideTimer=null;
let locationGuideCard=null;
let pinnedLocationGuide=null;
let activeLocationGuide=null;
let locationGuideHideTimer=null;
const markerScreenshotCache=new Map();
let screenshotLightbox=null;
let screenshotLightboxEntries=[];
let screenshotLightboxIndex=0;
let screenshotLightboxTitle='';
let playerMapMarkerLight=null;
let playerMapMarkerDark=null;
/** Last known overworld map % for I'm Stuck lines (Practice). */
let lastOutdoorPlayerMapPos=null;
let stuckGuideTargetId=null;

function buildPlayerMapMarker(world){
  const marker=document.createElement('div');
  marker.className='player-map-marker';
  marker.dataset.world=world;
  marker.hidden=true;
  marker.setAttribute('aria-label',`LINK's live position in the ${world} world`);
  const sprite=document.createElement('canvas');
  sprite.className='player-map-sprite';
  sprite.width=16;
  sprite.height=24;
  sprite.setAttribute('aria-hidden','true');
  const label=document.createElement('span');
  label.textContent='LINK';
  marker.append(sprite,label);
  return marker;
}

function setLivePlayerMarkerName(name){
  const displayName=String(name || '').trim() || 'LINK';
  const legendName=document.getElementById('playerLegendName');
  if(legendName && legendName.textContent!==displayName)
    legendName.textContent=displayName;
  [playerMapMarkerLight,playerMapMarkerDark].forEach(marker=>{
    if(!marker) return;
    const label=marker.querySelector('span');
    if(label && label.textContent!==displayName) label.textContent=displayName;
    marker.setAttribute(
      'aria-label',
      `${displayName}'s live position in the ${marker.dataset.world} world`
    );
  });
}

function hideLivePlayerMarker(){
  if(playerMapMarkerLight) playerMapMarkerLight.hidden=true;
  if(playerMapMarkerDark) playerMapMarkerDark.hidden=true;
}

function livePlayerMarkerVisible(position){
  if(!position?.connected || position.indoors) return false;
  if(!Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
  if(position.x<0 || position.x>=OVERWORLD_COORD_SIZE) return false;
  if(position.y<0 || position.y>=OVERWORLD_COORD_SIZE) return false;

  const mode=position.gameMode;
  // Hide on pure title / file / attract; allow overworld, underworld transitions,
  // and unknown mode so the stream sprite still shows while SNI is catching up.
  if(mode!==null && mode!==undefined){
    if((mode>=0x00 && mode<=0x05) || mode===0x14 || mode===0x17 || mode===0x1B)
      return false;
  }

  const world=position.world || 'light';
  return world==='light' || world==='dark';
}

function updateLivePlayerMarker(position){
  if(!playerMapMarkerLight || !playerMapMarkerDark) return;
  setLivePlayerMarkerName(position?.name);
  if(!livePlayerMarkerVisible(position)){
    hideLivePlayerMarker();
    // Indoors: arrival via dungeon entry, or keep line on last outdoor pos.
    if(stuckGuideTargetId){
      if(!maybeClearStuckGuideOnArrival()) redrawStuckGuideLine();
    }
    return;
  }

  // Only a genuine, visible-on-the-overworld change of world counts as a
  // "world change event" — not every 250ms poll tick — and a recent manual
  // tap on the pill tabs takes priority for a short cooldown window.
  if(position.world!==lastKnownPlayerWorld){
    lastKnownPlayerWorld=position.world;
    const withinManualCooldown=
      Date.now()-lastManualWorldSwitchAt<MAP_WORLD_AUTO_SWITCH_COOLDOWN_MS;
    if(!withinManualCooldown) setActiveMapWorld(position.world);
  }

  const marker=position.world==='dark'
    ? playerMapMarkerDark
    : playerMapMarkerLight;
  const other=position.world==='dark'
    ? playerMapMarkerLight
    : playerMapMarkerDark;
  const x=Math.max(0,Math.min(100,((position.x+8)/OVERWORLD_COORD_SIZE)*100));
  const y=Math.max(0,Math.min(100,((position.y+12)/OVERWORLD_COORD_SIZE)*100));

  other.hidden=true;
  marker.style.left=x.toFixed(2)+'%';
  marker.style.top=y.toFixed(2)+'%';
  marker.hidden=false;
  lastOutdoorPlayerMapPos={
    world:position.world,
    x:Number(x),
    y:Number(y)
  };
  // Follow sprite; clear the guide when Link reaches the suggested step.
  if(stuckGuideTargetId){
    if(!maybeClearStuckGuideOnArrival()) redrawStuckGuideLine();
  }
}

function updateWorldTabsUI(){
  const lightBtn=document.getElementById('worldTabLight');
  const darkBtn=document.getElementById('worldTabDark');
  [[lightBtn,'light'],[darkBtn,'dark']].forEach(([btn,world])=>{
    if(!btn) return;
    const active=activeMapWorld===world;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-selected',active ? 'true' : 'false');
  });
  if(mapPanelsEl) mapPanelsEl.dataset.activeWorld=activeMapWorld;
}

// manual=true marks this as a deliberate tap so the next auto-switch (a
// world-change event from the live player position) skips one cycle
// instead of fighting the tap.
function setActiveMapWorld(world,{manual=false}={}){
  if(world!=='light' && world!=='dark') return;
  activeMapWorld=world;
  localStorage.setItem(MAP_WORLD_STORAGE_KEY,world);
  if(manual) lastManualWorldSwitchAt=Date.now();
  updateWorldTabsUI();
}

function screenshotGuidesEnabled(){
  // Vanilla-layout screenshot packs only match this mode set.
  // Any other world/keys/boss/entrance setting (even in Practice) turns them off.
  if(typeof isRaceMode==='function' && isRaceMode()) return false;
  const s=(typeof SETTINGS!=='undefined' && SETTINGS) ? SETTINGS : null;
  if(!s) return false;
  return s.worldMode==='standard'
    && s.keysMode==='standard'
    && s.bossMode==='normal'
    && s.entranceMode==='vanilla';
}

function mapDefaultInfo(){
  const entranceShuffled = typeof isEntranceShuffle === 'function' && isEntranceShuffle();
  if(screenshotGuidesEnabled()){
    return DEFAULT_MAP_INFO;
  }
  if(entranceShuffled){
    return (typeof isRaceMode==='function' && isRaceMode() ? 'Race Legal. ' : '')
      + 'Entrance shuffle: click a cave or dungeon door to record where it leads. '
      + 'Screenshot guides need Standard / Standard keys / Normal bosses / Vanilla entrances. Memory still clears completed checks.';
  }
  const race=(typeof isRaceMode==='function' && isRaceMode());
  return 'Red is inaccessible, yellow is partial, and green is fully completable. '
    + (race
      ? 'Screenshot guides are disabled in Race Legal mode. '
      : 'Screenshot guides need Standard world, Standard keys, Normal bosses, and Vanilla entrances. ')
    + 'Every official marker clears automatically.';
}

function closeScreenshotLightbox(){
  if(!screenshotLightbox) return;
  screenshotLightbox.hidden=true;
  screenshotLightboxEntries=[];
  screenshotLightboxIndex=0;
  screenshotLightboxTitle='';
  document.body.classList.remove('screenshot-lightbox-open');
}

function renderScreenshotLightbox(){
  if(!screenshotLightbox || !screenshotLightboxEntries.length) return;
  const entry=screenshotLightboxEntries[screenshotLightboxIndex];
  const image=screenshotLightbox.querySelector('.screenshot-lightbox-image');
  const title=screenshotLightbox.querySelector('.screenshot-lightbox-title');
  const count=screenshotLightbox.querySelector('.screenshot-lightbox-count');
  const previous=screenshotLightbox.querySelector('.screenshot-lightbox-prev');
  const next=screenshotLightbox.querySelector('.screenshot-lightbox-next');
  image.src=entry.src;
  image.alt=entry.alt || screenshotLightboxTitle;
  title.textContent=screenshotLightboxTitle;
  count.textContent=screenshotLightboxEntries.length>1
    ? `${screenshotLightboxIndex+1} / ${screenshotLightboxEntries.length}`
    : '';
  previous.hidden=screenshotLightboxEntries.length<2;
  next.hidden=screenshotLightboxEntries.length<2;
}

function openScreenshotLightbox(entries,startIndex=0,title='Location guide'){
  if(!screenshotGuidesEnabled() || !screenshotLightbox) return;
  screenshotLightboxEntries=entries.filter(entry=>entry?.src);
  if(!screenshotLightboxEntries.length) return;
  screenshotLightboxIndex=Math.max(
    0,
    Math.min(screenshotLightboxEntries.length-1,startIndex)
  );
  screenshotLightboxTitle=title;
  renderScreenshotLightbox();
  screenshotLightbox.hidden=false;
  document.body.classList.add('screenshot-lightbox-open');
  screenshotLightbox.querySelector('.screenshot-lightbox-close').focus();
}

function moveScreenshotLightbox(direction){
  if(screenshotLightboxEntries.length<2) return;
  screenshotLightboxIndex=(
    screenshotLightboxIndex+direction+screenshotLightboxEntries.length
  )%screenshotLightboxEntries.length;
  renderScreenshotLightbox();
}

function makeScreenshotEnlargeable(shot,img,open){
  shot.classList.add('has-image','enlargeable');
  shot.tabIndex=0;
  shot.setAttribute('role','button');
  shot.setAttribute('aria-label',`${img.alt}. Enlarge screenshot.`);
  shot.title='Click to enlarge';
  if(shot.dataset.enlargeBound) return;
  shot.dataset.enlargeBound='true';
  const activate=e=>{
    e.stopPropagation();
    if(screenshotGuidesEnabled()) open();
  };
  shot.addEventListener('click',activate);
  shot.addEventListener('keydown',e=>{
    if(e.key!=='Enter' && e.key!==' ') return;
    e.preventDefault();
    activate(e);
  });
}

function closeMapGuides(){
  clearTimeout(dungeonGuideHideTimer);
  clearTimeout(locationGuideHideTimer);
  pinnedDungeonGuide=null;
  activeDungeonGuide=null;
  pinnedLocationGuide=null;
  activeLocationGuide=null;
  if(dungeonGuideCard){
    dungeonGuideCard.hidden=true;
    dungeonGuideCard.classList.remove('pinned');
  }
  if(locationGuideCard){
    locationGuideCard.hidden=true;
    locationGuideCard.classList.remove('pinned');
  }
  closeScreenshotLightbox();
  const info=document.getElementById('mapInfo');
  if(info && !calibrateMode && !addMarkerMode && !renameMode){
    info.innerHTML=mapDefaultInfo();
  }
}

function closeMapTools(){
  const toolsPanel=document.getElementById('mapToolsPanel');
  const toolsToggle=document.getElementById('mapToolsToggle');
  if(toolsPanel) toolsPanel.hidden=true;
  if(toolsToggle) toolsToggle.setAttribute('aria-expanded','false');
  if(panelLight && panelDark){
    setMode(null);
  }else{
    calibrateMode=false;
    addMarkerMode=false;
    renameMode=false;
  }
}

function updateMapToolsAvailability(){
  const toolsWrap=document.getElementById('mapToolsWrap');
  if(!toolsWrap) return;
  const disabled=typeof isRaceMode==='function' && isRaceMode();
  toolsWrap.hidden=disabled;
  if(disabled) closeMapTools();
}

function updateMapGuideMode(){
  const disabled=!screenshotGuidesEnabled();
  document.body.classList.toggle('screenshot-guides-disabled',disabled);
  if(disabled) closeMapGuides();
  updateMapToolsAvailability();
  const info=document.getElementById('mapInfo');
  if(info && !calibrateMode && !addMarkerMode && !renameMode){
    info.innerHTML=mapDefaultInfo();
  }
}

function initScreenshotLightbox(){
  screenshotLightbox=document.createElement('div');
  screenshotLightbox.id='screenshotLightbox';
  screenshotLightbox.className='screenshot-lightbox';
  screenshotLightbox.hidden=true;
  screenshotLightbox.setAttribute('role','dialog');
  screenshotLightbox.setAttribute('aria-modal','true');
  screenshotLightbox.setAttribute('aria-label','Enlarged location screenshot');

  const frame=document.createElement('div');
  frame.className='screenshot-lightbox-frame';
  const header=document.createElement('div');
  header.className='screenshot-lightbox-header';
  const title=document.createElement('strong');
  title.className='screenshot-lightbox-title';
  const close=document.createElement('button');
  close.type='button';
  close.className='screenshot-lightbox-close';
  close.textContent='×';
  close.setAttribute('aria-label','Close enlarged screenshot');
  close.addEventListener('click',closeScreenshotLightbox);
  header.append(title,close);

  const stage=document.createElement('div');
  stage.className='screenshot-lightbox-stage';
  const previous=document.createElement('button');
  previous.type='button';
  previous.className='screenshot-lightbox-nav screenshot-lightbox-prev';
  previous.textContent='‹';
  previous.setAttribute('aria-label','Previous screenshot');
  previous.addEventListener('click',()=>moveScreenshotLightbox(-1));
  const image=document.createElement('img');
  image.className='screenshot-lightbox-image';
  const next=document.createElement('button');
  next.type='button';
  next.className='screenshot-lightbox-nav screenshot-lightbox-next';
  next.textContent='›';
  next.setAttribute('aria-label','Next screenshot');
  next.addEventListener('click',()=>moveScreenshotLightbox(1));
  stage.append(previous,image,next);

  const count=document.createElement('div');
  count.className='screenshot-lightbox-count';
  frame.append(header,stage,count);
  screenshotLightbox.appendChild(frame);
  screenshotLightbox.addEventListener('click',e=>{
    if(e.target===screenshotLightbox) closeScreenshotLightbox();
  });
  document.addEventListener('keydown',e=>{
    if(!screenshotLightbox) return;
    if(!screenshotLightbox.hidden){
      if(e.key==='Escape') closeScreenshotLightbox();
      else if(e.key==='ArrowLeft') moveScreenshotLightbox(-1);
      else if(e.key==='ArrowRight') moveScreenshotLightbox(1);
      return;
    }
    if(e.key==='Escape' && (pinnedDungeonGuide || pinnedLocationGuide)){
      closeMapGuides();
    }
  });
  document.body.appendChild(screenshotLightbox);
}

function requirementLabel(key){
  if(typeof formatRequirementName === 'function') return formatRequirementName(key);
  return REQUIREMENT_NAMES[key] || key;
}

function appendRequirementPills(container,requirements,state,dungeonKey=null){
  requirements.forEach(requirement=>{
    const pill=document.createElement('span');
    const met = typeof requirementMet === 'function'
      ? requirementMet(state || {}, requirement, dungeonKey)
      : (requirement === 'dungeonBigKey'
          ? !!(state?.bigKey && dungeonKey && state.bigKey[dungeonKey])
          : (REQUIREMENTS[requirement]?.(state || {}) || false));
    pill.className='dungeon-guide-requirement '+(met?'met':'missing');
    pill.textContent=(met?'✓ ':'• ')+requirementLabel(requirement);
    container.appendChild(pill);
  });
  if(!requirements.length){
    const pill=document.createElement('span');
    pill.className='dungeon-guide-requirement met';
    pill.textContent='✓ No item requirement';
    container.appendChild(pill);
  }
}

function screenshotPaths(dungeon,screenshotId){
  const base=`assets/dungeons/${dungeon.id}/${screenshotId}`;
  return [`${base}.webp`,`${base}.png`];
}

function dungeonScreenshotIds(location){
  return location.screenshots?.length ? location.screenshots : [location.id];
}

function buildDungeonScreenshot(dungeon,location,screenshotId,index,total){
  const shot=document.createElement('div');
  shot.className='dungeon-guide-shot';
  const placeholder=document.createElement('span');
  placeholder.textContent='Screenshot slot';
  const img=document.createElement('img');
  img.loading='lazy';
  img.decoding='async';
  img.alt=total>1
    ? `${dungeon.name} — ${location.name} — step ${index+1} of ${total}`
    : `${dungeon.name} — ${location.name}`;
  const paths=screenshotPaths(dungeon,screenshotId);
  let pathIndex=0;
  img.src=paths[pathIndex];
  img.addEventListener('load',()=>{
    makeScreenshotEnlargeable(shot,img,()=>{
      const strip=shot.parentElement;
      const images=[...strip.querySelectorAll('.dungeon-guide-shot.has-image img')];
      const entries=images.map(guideImage=>({
        src:guideImage.currentSrc || guideImage.src,
        alt:guideImage.alt
      }));
      openScreenshotLightbox(
        entries,
        Math.max(0,images.indexOf(img)),
        `${dungeon.name} — ${location.name}`
      );
    });
  });
  img.addEventListener('error',()=>{
    pathIndex++;
    if(pathIndex<paths.length) img.src=paths[pathIndex];
    else img.remove();
  });
  shot.append(placeholder,img);
  if(total>1){
    const order=document.createElement('b');
    order.className='dungeon-guide-shot-order';
    order.textContent=`${index+1}/${total}`;
    shot.appendChild(order);
  }
  return shot;
}

function markerScreenshotPaths(location){
  const base=`assets/markers/${location.id}`;
  return [`${base}.webp`,`${base}.png`];
}

function getStandaloneMapState(loc,state){
  const completionSource=MAP_LOCATION_COMPLETION[loc.id];
  const progress=getMapLocationProgress(TrackerState.locationFlags,completionSource);
  const flagChecked=typeof loc.checked==='function' && loc.checked(state);
  const checked=flagChecked || !!progress?.complete;
  // Entrance shuffle: do not assume vanilla overworld paths. Only auto-clear
  // from memory; never paint "available" from item logic alone (race-legal).
  const entranceShuffled = typeof isEntranceShuffle === 'function' && isEntranceShuffle();
  const available=!checked && !entranceShuffled && loc.need(state);
  const partial=!checked && !available && !entranceShuffled &&
    typeof loc.partialNeed==='function' && loc.partialNeed(state);
  const status=checked ? 'complete'
    : available ? 'available'
    : partial ? 'partial'
    : 'blocked';
  return{progress,checked,available,partial,status};
}

function updateLocationGuideState(loc){
  if(!locationGuideCard) return;
  const state=lastState || TrackerState.save || {};
  const result=getStandaloneMapState(loc,state);
  if(result.checked){
    clearTimeout(locationGuideHideTimer);
    pinnedLocationGuide=null;
    activeLocationGuide=null;
    locationGuideCard.hidden=true;
    locationGuideCard.classList.remove('pinned');
    return;
  }

  const status=locationGuideCard.querySelector('.location-guide-status');
  const title=locationGuideCard.querySelector('.location-guide-status strong');
  const detail=locationGuideCard.querySelector('.location-guide-status span');
  if(!status || !title || !detail) return;

  status.className=`location-guide-status ${result.status}`;
  title.textContent={
    blocked:'NOT ACCESSIBLE',
    partial:'PARTIALLY ACCESSIBLE',
    available:'AVAILABLE NOW'
  }[result.status];
  const progressText=result.progress
    ? `${result.progress.found}/${result.progress.total} collected. `
    : '';
  detail.textContent=progressText+({
    blocked:'Your current items do not open this check yet.',
    partial:'Some checks here are reachable with your current items.',
    available:'This marker is reachable with your current items.'
  }[result.status]);
}

function renderLocationGuide(loc){
  if(!locationGuideCard) return;
  locationGuideCard.replaceChildren();

  const header=document.createElement('div');
  header.className='location-guide-header';
  const heading=document.createElement('div');
  const eyebrow=document.createElement('span');
  eyebrow.textContent='MAP CHECK';
  const name=document.createElement('strong');
  name.textContent=loc.name;
  heading.append(eyebrow,name);
  const close=document.createElement('button');
  close.type='button';
  close.className='location-guide-close';
  close.textContent='×';
  close.title='Close location guide';
  close.addEventListener('click',()=>{
    clearTimeout(locationGuideHideTimer);
    pinnedLocationGuide=null;
    activeLocationGuide=null;
    locationGuideCard.hidden=true;
    locationGuideCard.classList.remove('pinned');
  });
  header.append(heading,close);

  const shot=document.createElement('div');
  shot.className='location-guide-shot';
  const placeholder=document.createElement('span');
  placeholder.textContent='Screenshot coming soon';
  shot.appendChild(placeholder);

  const cachedPath=markerScreenshotCache.get(loc.id);
  if(cachedPath!==null){
    const img=document.createElement('img');
    img.loading='lazy';
    img.decoding='async';
    img.alt=`${loc.name} in-game location`;
    const paths=cachedPath ? [cachedPath] : markerScreenshotPaths(loc);
    let pathIndex=0;
    img.addEventListener('load',()=>{
      markerScreenshotCache.set(loc.id,paths[pathIndex]);
      makeScreenshotEnlargeable(shot,img,()=>{
        openScreenshotLightbox([{
          src:img.currentSrc || img.src,
          alt:img.alt
        }],0,loc.name);
      });
    });
    img.addEventListener('error',()=>{
      pathIndex++;
      if(pathIndex<paths.length) img.src=paths[pathIndex];
      else{
        markerScreenshotCache.set(loc.id,null);
        img.remove();
      }
    });
    img.src=paths[pathIndex];
    shot.appendChild(img);
  }

  const status=document.createElement('div');
  status.className='location-guide-status';
  const statusTitle=document.createElement('strong');
  const statusDetail=document.createElement('span');
  status.append(statusTitle,statusDetail);

  const help=document.createElement('div');
  help.className='location-guide-help';
  help.textContent='Pin this guide, then click the image to enlarge it.';

  locationGuideCard.append(header,shot,status,help);
  updateLocationGuideState(loc);
}

function positionLocationGuide(marker){
  if(!locationGuideCard || locationGuideCard.hidden || pinnedLocationGuide) return;
  const markerRect=marker.getBoundingClientRect();
  const gap=12;
  const width=locationGuideCard.offsetWidth;
  const height=locationGuideCard.offsetHeight;
  let left=markerRect.right+gap;
  let top=markerRect.top-(height/2)+(markerRect.height/2);
  if(left+width>window.innerWidth-8) left=markerRect.left-width-gap;
  top=Math.min(Math.max(8,top),Math.max(8,window.innerHeight-height-8));
  locationGuideCard.style.left=Math.max(8,left)+'px';
  locationGuideCard.style.top=Math.max(8,top)+'px';
}


function mapPointerCanHover(){
  // Touch / coarse pointers should not use mouseenter previews — that is what
  // causes the map to jump on mobile when a sticky hover fires.
  try{
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }catch(e){
    return !('ontouchstart' in window);
  }
}

function showLocationGuide(loc,marker,pin=false){
  if(!screenshotGuidesEnabled() || !locationGuideCard || pinnedDungeonGuide) return;
  if(pinnedLocationGuide && pinnedLocationGuide!==loc.id) return;
  clearTimeout(locationGuideHideTimer);
  locationGuideHideTimer=null;
  if(activeLocationGuide!==loc.id || pin) renderLocationGuide(loc);
  activeLocationGuide=loc.id;
  locationGuideCard.hidden=false;
  locationGuideCard.classList.toggle('pinned',pin);
  if(pin){
    pinnedLocationGuide=loc.id;
    locationGuideCard.style.left='50%';
    locationGuideCard.style.top='50%';
  }else{
    positionLocationGuide(marker);
  }
}

function hideLocationGuide(loc){
  if(!locationGuideCard || pinnedLocationGuide===loc.id) return;
  clearTimeout(locationGuideHideTimer);
  locationGuideHideTimer=setTimeout(()=>{
    if(pinnedLocationGuide || activeLocationGuide!==loc.id) return;
    locationGuideCard.hidden=true;
    activeLocationGuide=null;
    locationGuideHideTimer=null;
  },180);
}

function getDungeonCheckProgress(dungeonKey,locationId){
  const source=DUNGEON_LOCATION_COMPLETION[dungeonKey]?.[locationId];
  return getMapLocationProgress(TrackerState.locationFlags,source);
}

function updateDungeonGuideCompletion(loc){
  if(!dungeonGuideCard) return;
  const data=DUNGEON_DATA[loc.key];
  if(!data) return;

  let collectedCount=0;
  let hasLiveFlags=!!TrackerState.locationFlags;

  data.locations.forEach(location=>{
    const progress=getDungeonCheckProgress(loc.key,location.id);
    const collected=!!progress?.complete;
    if(collected) collectedCount++;

    const row=dungeonGuideCard.querySelector(
      `.dungeon-guide-check[data-location-id="${location.id}"]`
    );
    if(!row) return;
    row.classList.toggle('collected',collected);
    row.setAttribute(
      'aria-label',
      `${location.name} — ${collected?'collected':'not collected'}`
    );
  });

  const title=dungeonGuideCard.querySelector('.dungeon-guide-checks-title');
  if(title){
    title.textContent=hasLiveFlags
      ? `CHECKS (${collectedCount}/${data.locations.length})`
      : `CHECKS (${data.locations.length})`;
  }
}

function renderDungeonGuide(loc){
  if(!dungeonGuideCard) return;
  const data=DUNGEON_DATA[loc.key];
  if(!data) return;
  const state=TrackerState.save || {};

  dungeonGuideCard.replaceChildren();

  const header=document.createElement('div');
  header.className='dungeon-guide-header';
  const heading=document.createElement('div');
  heading.innerHTML=`<span>${loc.abbr}</span><strong>${data.name}</strong>`;
  const close=document.createElement('button');
  close.type='button';
  close.className='dungeon-guide-close';
  close.textContent='×';
  close.title='Close dungeon guide';
  close.addEventListener('click',()=>{
    clearTimeout(dungeonGuideHideTimer);
    pinnedDungeonGuide=null;
    activeDungeonGuide=null;
    dungeonGuideCard.hidden=true;
    dungeonGuideCard.classList.remove('pinned');
  });
  header.append(heading,close);
  dungeonGuideCard.appendChild(header);

  const access=document.createElement('div');
  access.className='dungeon-guide-access';
  const entry=document.createElement('div');
  entry.innerHTML='<b>ENTRY</b>';
  const entryReqs = typeof getDungeonEntryRequirements === 'function'
    ? getDungeonEntryRequirements(loc.key)
    : (DUNGEON_REQUIREMENTS[loc.key] || []);
  appendRequirementPills(entry, entryReqs, state, loc.key);
  const clear=document.createElement('div');
  clear.innerHTML='<b>FULL CLEAR</b>';
  const clearReqs = typeof getDungeonClearRequirements === 'function'
    ? getDungeonClearRequirements(loc.key)
    : (DUNGEON_CLEAR_REQUIREMENTS[loc.key] || []);
  appendRequirementPills(clear, clearReqs, state, loc.key);
  access.append(entry,clear);
  dungeonGuideCard.appendChild(access);

  const checksTitle=document.createElement('div');
  checksTitle.className='dungeon-guide-checks-title';
  checksTitle.textContent=`CHECKS (${data.locations.length})`;
  dungeonGuideCard.appendChild(checksTitle);

  const checks=document.createElement('div');
  checks.className='dungeon-guide-checks';
  data.locations.forEach((location,index)=>{
    const row=document.createElement('div');
    row.className='dungeon-guide-check';
    row.dataset.locationId=location.id;

    const screenshotIds=dungeonScreenshotIds(location);
    const shots=document.createElement('div');
    shots.className='dungeon-guide-shot-strip';
    screenshotIds.forEach((screenshotId,shotIndex)=>{
      shots.appendChild(buildDungeonScreenshot(
        loc,
        location,
        screenshotId,
        shotIndex,
        screenshotIds.length
      ));
    });
    row.classList.toggle('has-multiple-shots',screenshotIds.length>1);

    const info=document.createElement('div');
    info.className='dungeon-guide-check-info';
    const name=document.createElement('strong');
    name.textContent=`${index+1}. ${location.name}`;
    const requirements=document.createElement('div');
    requirements.className='dungeon-guide-check-requirements';
    const effectiveReqs = typeof getEffectiveLocationRequires === 'function'
      ? getEffectiveLocationRequires(location, loc.key)
      : (location.requires || []);
    requirements.textContent=effectiveReqs.length
      ? effectiveReqs.map(requirementLabel).join(' • ')
      : 'No additional item gate';
    info.append(name,requirements);
    row.append(shots,info);
    checks.appendChild(row);
  });
  dungeonGuideCard.appendChild(checks);
  updateDungeonGuideCompletion(loc);
}

function positionDungeonGuide(marker){
  if(!dungeonGuideCard || dungeonGuideCard.hidden || pinnedDungeonGuide) return;
  const markerRect=marker.getBoundingClientRect();
  const gap=12;
  const width=dungeonGuideCard.offsetWidth;
  const height=dungeonGuideCard.offsetHeight;
  let left=markerRect.right+gap;
  let top=markerRect.top;
  if(left+width>window.innerWidth-8) left=markerRect.left-width-gap;
  top=Math.min(
    Math.max(8,top),
    Math.max(8,window.innerHeight-height-8)
  );
  dungeonGuideCard.style.left=Math.max(8,left)+'px';
  dungeonGuideCard.style.top=Math.max(8,top)+'px';
}

function showDungeonGuide(loc,marker,pin=false){
  if(!screenshotGuidesEnabled() || !dungeonGuideCard) return;
  if(pinnedLocationGuide) return;
  if(pinnedDungeonGuide && pinnedDungeonGuide!==loc.key) return;
  clearTimeout(dungeonGuideHideTimer);
  dungeonGuideHideTimer=null;
  if(activeDungeonGuide!==loc.key || pin) renderDungeonGuide(loc);
  activeDungeonGuide=loc.key;
  dungeonGuideCard.hidden=false;
  dungeonGuideCard.classList.toggle('pinned',pin);
  if(pin){
    pinnedDungeonGuide=loc.key;
    dungeonGuideCard.style.left='50%';
    dungeonGuideCard.style.top='50%';
  }else{
    positionDungeonGuide(marker);
  }
}

function hideDungeonGuide(loc){
  if(!dungeonGuideCard || pinnedDungeonGuide===loc.key) return;
  clearTimeout(dungeonGuideHideTimer);
  dungeonGuideHideTimer=setTimeout(()=>{
    if(pinnedDungeonGuide || activeDungeonGuide!==loc.key) return;
    dungeonGuideCard.hidden=true;
    activeDungeonGuide=null;
    dungeonGuideHideTimer=null;
  },140);
}

function buildMarker(loc,isDungeon){
  const m=document.createElement('div');
  m.className='marker'+(isDungeon?' dungeon':'');
  m.style.left=loc.x+'%';
  m.style.top=loc.y+'%';
  m.title=loc.name;
  m.dataset.id=loc.id;

  if(isDungeon){
    const label=document.createElement('span');
    const total=DUNGEON_TOTALS[loc.key] || 0;
    label.className='dungeon-marker-label';
    label.textContent=`${loc.abbr || loc.id.toUpperCase()} 0/${total}`;
    m.appendChild(label);
  }
  m.addEventListener('click',(e)=>{
    e.stopPropagation(); // don't let this bubble into the panel's add-marker handler
    if(calibrateMode) return;
    if(renameMode){
      const newName=prompt('Rename this marker:',loc.name);
      if(newName && newName.trim()){
        loc.name=newName.trim();
        m.title=loc.name;
        document.getElementById('mapInfo').innerHTML='Renamed to <b>'+loc.name+'</b>.';
      }
      return;
    }
    // Entrance shuffle: race-legal click-to-pair (works without Practice guides).
    if(typeof handleMapMarkerEntrancePairClick === 'function' &&
       handleMapMarkerEntrancePairClick(loc, isDungeon, m)){
      return;
    }
    if(typeof hideEntrancePairPicker === 'function') hideEntrancePairPicker();
    if(isDungeon){
      if(pinnedDungeonGuide===loc.key){
        clearTimeout(dungeonGuideHideTimer);
        pinnedDungeonGuide=null;
        activeDungeonGuide=null;
        dungeonGuideCard.hidden=true;
        dungeonGuideCard.classList.remove('pinned');
      }else{
        pinnedDungeonGuide=null;
        showDungeonGuide(loc,m,true);
      }
      return; // dungeon completion auto-clears from its check counter
    }
    if(pinnedLocationGuide===loc.id){
      clearTimeout(locationGuideHideTimer);
      pinnedLocationGuide=null;
      activeLocationGuide=null;
      locationGuideCard.hidden=true;
      locationGuideCard.classList.remove('pinned');
    }else{
      pinnedLocationGuide=null;
      showLocationGuide(loc,m,true);
    }
    document.getElementById('mapInfo').innerHTML='<b>'+loc.name+'</b> — clears automatically when its item or checks are collected.';
  });
  m.addEventListener('mouseenter',()=>{
    if(!mapPointerCanHover()) return;
    const info=document.getElementById('mapInfo');
    if(info){
      info.innerHTML='<b>'+loc.name+'</b>'+(isDungeon?' (dungeon)':'')+
        (calibrateMode?' — drag to reposition':renameMode?' — click to rename':'');
    }
    if(!calibrateMode && !renameMode){
      if(isDungeon) showDungeonGuide(loc,m);
      else showLocationGuide(loc,m);
    }
  });
  m.addEventListener('mouseleave',()=>{
    if(!mapPointerCanHover()) return;
    if(!calibrateMode && !renameMode){
      const info=document.getElementById('mapInfo');
      if(info) info.innerHTML=mapDefaultInfo();
    }
    if(isDungeon) hideDungeonGuide(loc);
    else hideLocationGuide(loc);
  });

  // Drag-to-calibrate
  let dragging=false;
  const startDrag=(e)=>{
    if(!calibrateMode) return;
    e.preventDefault();
    dragging=true;
    m.style.zIndex=10;
  };
  const moveDrag=(clientX,clientY)=>{
    if(!dragging) return;
    const panel=m.parentElement;
    const rect=panel.getBoundingClientRect();
    let px=((clientX-rect.left)/rect.width)*100;
    let py=((clientY-rect.top)/rect.height)*100;
    px=Math.max(0,Math.min(100,px));
    py=Math.max(0,Math.min(100,py));
    m.style.left=px.toFixed(1)+'%';
    m.style.top=py.toFixed(1)+'%';
    calibration[loc.id]={x:Math.round(px*10)/10,y:Math.round(py*10)/10,world:loc.world};
  };
  const endDrag=()=>{ dragging=false; m.style.zIndex=''; };
  m.addEventListener('mousedown',startDrag);
  window.addEventListener('mousemove',(e)=>moveDrag(e.clientX,e.clientY));
  window.addEventListener('mouseup',endDrag);
  m.addEventListener('touchstart',(e)=>{ if(calibrateMode){ startDrag(e); } },{passive:false});
  m.addEventListener('touchmove',(e)=>{
    if(!dragging) return;
    e.preventDefault();
    const t=e.touches[0];
    moveDrag(t.clientX,t.clientY);
  },{passive:false});
  window.addEventListener('touchend',endDrag);

  return m;
}

// Add-marker mode: click empty map space to drop a new standalone check.
// New markers are pushed straight into LOCATIONS, so they automatically
// show up in updateMap() and get included in Export Positions for free.
function handlePanelClick(world){
  return (e)=>{
    if(!addMarkerMode){
      if(pinnedDungeonGuide || pinnedLocationGuide) closeMapGuides();
      return;
    }
    const panel=e.currentTarget;
    const rect=panel.getBoundingClientRect();
    let px=((e.clientX-rect.left)/rect.width)*100;
    let py=((e.clientY-rect.top)/rect.height)*100;
    px=Math.max(0,Math.min(100,Math.round(px*10)/10));
    py=Math.max(0,Math.min(100,Math.round(py*10)/10));
    const name=prompt('Name for this new marker:');
    if(!name || !name.trim()) return;
    customMarkerSeq++;
    const loc={id:'custom_'+Date.now()+'_'+customMarkerSeq,name:name.trim(),world,x:px,y:py,need:()=>true};
    LOCATIONS.push(loc);
    const el=buildMarker(loc,false);
    panel.appendChild(el);
    if(lastState) updateMap(lastState);
    document.getElementById('mapInfo').innerHTML='Added marker <b>'+loc.name+'</b>.';
  };
}

function updateMap(state){
  lastState=state;
  LOCATIONS.forEach(loc=>{
    const el=panelLight.querySelector(`.marker[data-id="${loc.id}"]`) ||
             panelDark.querySelector(`.marker[data-id="${loc.id}"]`);
    if(!el) return;
    const {progress,checked,available:avail,partial}=getStandaloneMapState(loc,state);
    el.hidden=checked;
    el.classList.toggle('locked',!checked && !avail && !partial);
    el.classList.toggle('avail',avail);
    el.classList.toggle('partial',partial);
    el.classList.remove('checked');
    el.title=progress
      ? `${loc.name} — ${progress.found}/${progress.total} cleared`
      : loc.name;
  });
  if(activeLocationGuide && locationGuideCard && !locationGuideCard.hidden){
    const activeLoc=LOCATIONS.find(loc=>loc.id===activeLocationGuide);
    if(activeLoc) updateLocationGuideState(activeLoc);
  }
  DUNGEONS.forEach(loc=>{
    const el=panelLight.querySelector(`.marker[data-id="${loc.id}"]`) ||
             panelDark.querySelector(`.marker[data-id="${loc.id}"]`);
    if(!el) return;
    const prizeGot = loc.prizeBit==='pendant' ? !!(state.pendants & loc.mask)
                    : loc.prizeBit==='crystal' ? !!(state.crystals & loc.mask)
                    : false;
    let cls=null;
    if(!prizeGot){
      if(loc.need(state)) cls='avail';
      else if(loc.entryNeed && loc.entryNeed(state)) cls='partial';
    }
    el.classList.toggle('avail',cls==='avail');
    el.classList.toggle('partial',cls==='partial');
    el.classList.toggle('checked',prizeGot);
    el.hidden=prizeGot;
  });

  // Dungeon counters are the source of truth for dungeon marker color.
  // Reapply them after the older prize/access map state has been calculated.
  if(TrackerState.dungeonStats && TrackerState.rankings.length){
    updateDungeonMapStats(TrackerState.dungeonStats);
  }
  
    // Apply demo overrides AFTER the normal map logic
  Object.entries(demoOverrides).forEach(([id,state])=>{
    setMarkerState(id,state);
  });

  // Re-apply player-entered entrance pair notes after marker visibility updates.
  if(typeof syncEntrancePairingMapNotes === 'function'){
    syncEntrancePairingMapNotes();
  }
  // Keep stuck highlight in sync with availability; drop line if check cleared.
  // Re-apply target class after marker rebuilds and refresh the follow line.
  if(stuckGuideTargetId){
    const loc=(typeof LOCATIONS!=='undefined' && LOCATIONS.find(l=>l.id===stuckGuideTargetId))
      || (typeof DUNGEONS!=='undefined' && DUNGEONS.find(d=>d.id===stuckGuideTargetId))
      || null;
    const collected=loc && lastState && typeof loc.checked==='function' && loc.checked(lastState);
    const dungeonDone=loc?.key && !stuckDungeonHasRemaining(loc);
    if(!loc || collected || dungeonDone){
      clearStuckMapGuide();
      if(collected || dungeonDone){
        clearStuckSuggestionUI('Suggested step complete. Suggest again when you need the next step.');
      }
    }else if(maybeClearStuckGuideOnArrival()){
      // cleared on arrival
    }else{
      const marker=document.querySelector(`.marker[data-id="${stuckGuideTargetId}"]`);
      if(marker) marker.classList.add('stuck-target');
      redrawStuckGuideLine();
    }
  }
}

function getDungeonMapState(result,found,total,loc,state){
  if(total > 0 && found >= total) return 'complete';
  if(result?.complete) return 'complete';

  // Entry and full-clear access come from the live item state. This keeps a
  // stale or not-yet-built ranking result from painting every dungeon gray.
  const canEnter=loc.entryNeed ? loc.entryNeed(state) : loc.need(state);
  const canFullyClear=loc.need(state);
  if(!canEnter) return 'blocked';
  if(!canFullyClear) return 'partial';

  if(!result) return 'available';
  if(result.accessible <= 0) return 'partial';

  const remaining=Math.max(0,total-found);
  if(result.accessible >= remaining) return 'available';
  return 'partial';
}

function getDungeonKeyMarkerParts(loc, save){
  if(typeof isKeysanityPanelVisible !== 'function' || !isKeysanityPanelVisible()){
    return {parts:[], detail:[]};
  }
  const key = loc.key;
  const parts = [];
  const detail = [];
  const keys = save?.dungeonKeys || {};
  const bigKey = save?.bigKey || {};
  const map = save?.map || {};
  const compass = save?.compass || {};

  if(typeof isKeysanityKeysVisible === 'function' && isKeysanityKeysVisible()){
    const count = keys[key] || 0;
    const max = DUNGEON_KEY_MAX?.[key] ?? 0;
    if(max > 0 || count > 0){
      parts.push(`${count}${max ? '/' + max : ''}k`);
      detail.push(`keys ${count}${max ? '/' + max : ''}`);
    }
  }
  if(typeof isKeysanityBigKeyVisible === 'function' && isKeysanityBigKeyVisible()){
    if(bigKey[key]){
      parts.push('BK');
      detail.push('big key');
    }
  }
  if(typeof isKeysanityMapCompassVisible === 'function' && isKeysanityMapCompassVisible()){
    if(map[key]){
      parts.push('M');
      detail.push('map');
    }
    if(compass[key]){
      parts.push('C');
      detail.push('compass');
    }
  }
  return {parts, detail};
}

function formatDungeonMarkerLabel(loc, found, total, save){
  const base = `${loc.abbr || loc.id.toUpperCase()} ${found}/${total}`;
  const {parts} = getDungeonKeyMarkerParts(loc, save || TrackerState.save || {});
  return parts.length ? `${base} · ${parts.join(' ')}` : base;
}

function updateDungeonMapStats(stats){
  if(!panelLight || !panelDark) return;

  const save = TrackerState.save || {};
  const keysModeOn = typeof isKeysanityPanelVisible === 'function' && isKeysanityPanelVisible();

  DUNGEONS.forEach(loc=>{
    const marker=panelLight.querySelector(`.marker[data-id="${loc.id}"]`) ||
                 panelDark.querySelector(`.marker[data-id="${loc.id}"]`);
    if(!marker) return;

    const total=DUNGEON_TOTALS[loc.key] || 0;
    const found=Math.max(0,Math.min(total,Number(stats[loc.key]) || 0));
    const result=TrackerState.rankings.find(dungeon=>dungeon.key===loc.key);
    const status=getDungeonMapState(
      result,
      found,
      total,
      loc,
      save
    );
    const label=marker.querySelector('.dungeon-marker-label');
    const keyInfo = getDungeonKeyMarkerParts(loc, save);

    marker.classList.remove(
      'locked','partial','avail','checked',
      'dungeon-state-blocked','dungeon-state-untouched',
      'dungeon-state-partial','dungeon-state-available',
      'dungeon-state-complete'
    );
    marker.classList.add('dungeon-state-'+status);
    marker.classList.toggle('keys-mode', keysModeOn);
    marker.classList.toggle('has-big-key', !!(save.bigKey && save.bigKey[loc.key]));
    marker.hidden=status==='complete';

    if(label){
      label.textContent=formatDungeonMarkerLabel(loc, found, total, save);
      label.classList.toggle('has-key-info', keyInfo.parts.length > 0);
    }

    const stateLabel={
      blocked:'not accessible',
      partial:'some checks accessible',
      available:'fully completable',
      complete:'complete — removed from map'
    }[status];
    const keyTitle = keyInfo.detail.length
      ? `; ${keyInfo.detail.join(', ')}`
      : '';
    marker.title=`${loc.name} — ${found}/${total} checks (${stateLabel})${keyTitle}`;
  });

  if(activeDungeonGuide && dungeonGuideCard && !dungeonGuideCard.hidden){
    const activeLoc=DUNGEONS.find(loc=>loc.key===activeDungeonGuide);
    if(activeLoc) updateDungeonGuideCompletion(activeLoc);
  }
}

// The three map tools (calibrate / add marker / rename) are mutually
// exclusive so their click behaviors never conflict with each other.
function setMode(mode){
  calibrateMode = mode==='calibrate';
  addMarkerMode = mode==='add';
  renameMode = mode==='rename';

 document.getElementById('calibrateBtn').textContent =
    calibrateMode ? '✓ Done' : '📍 Calibrate';

document.getElementById('addMarkerBtn').textContent =
    addMarkerMode ? '✓ Done' : '➕ Add Marker';

document.getElementById('renameBtn').textContent =
    renameMode ? '✓ Done' : '✏️ Rename';

  panelLight.classList.toggle('calibrating',calibrateMode);
  panelDark.classList.toggle('calibrating',calibrateMode);
  panelLight.classList.toggle('adding',addMarkerMode);
  panelDark.classList.toggle('adding',addMarkerMode);
  panelLight.classList.toggle('renaming',renameMode);
  panelDark.classList.toggle('renaming',renameMode);

  const info=document.getElementById('mapInfo');
  if(calibrateMode) info.innerHTML='Calibrate mode on — drag any marker to where it belongs, then hit "Export Positions" when done.';
  else if(addMarkerMode) info.innerHTML='Add-marker mode on — click anywhere on either map to drop a new marker and name it.';
  else if(renameMode) info.innerHTML='Edit-names mode on — click any marker to rename it.';
  else info.innerHTML=mapDefaultInfo();
}

function exportMarkerPositions(){
  // Full current position for every marker: dragged ones from calibration{},
  // everything else from its original definition, so the export is always complete.
  const all=[...LOCATIONS.map(l=>({...l,isDungeon:false})),...DUNGEONS.map(l=>({...l,isDungeon:true}))];
  const out={};
  all.forEach(l=>{
    const cal=calibration[l.id];
    out[l.id]={x:cal?cal.x:l.x, y:cal?cal.y:l.y, world:l.world, name:l.name};
  });
  const json=JSON.stringify(out,null,1);
  const blob=new Blob([json],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='marker-positions.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  log('Exported '+Object.keys(out).length+' marker positions to marker-positions.json','ok');
}

// Builds the markers and wires up all the map controls. Called once from
// main.js on load.
function initMap(){
  panelLight=document.getElementById('panelLight');
  panelDark=document.getElementById('panelDark');
  mapPanelsEl=document.getElementById('mapPanels');

  document.getElementById('worldTabLight')?.addEventListener('click',()=>{
    setActiveMapWorld('light',{manual:true});
  });
  document.getElementById('worldTabDark')?.addEventListener('click',()=>{
    setActiveMapWorld('dark',{manual:true});
  });
  updateWorldTabsUI();

  playerMapMarkerLight=buildPlayerMapMarker('light');
  playerMapMarkerDark=buildPlayerMapMarker('dark');
  panelLight.appendChild(playerMapMarkerLight);
  panelDark.appendChild(playerMapMarkerDark);

  dungeonGuideCard=document.createElement('aside');
  dungeonGuideCard.id='dungeonGuideCard';
  dungeonGuideCard.className='dungeon-guide-card';
  dungeonGuideCard.hidden=true;
  dungeonGuideCard.setAttribute('aria-live','polite');
  document.body.appendChild(dungeonGuideCard);

  locationGuideCard=document.createElement('aside');
  locationGuideCard.id='locationGuideCard';
  locationGuideCard.className='location-guide-card';
  locationGuideCard.hidden=true;
  locationGuideCard.setAttribute('aria-live','polite');
  document.body.appendChild(locationGuideCard);

  initScreenshotLightbox();

  LOCATIONS.forEach(loc=>{
    const el=buildMarker(loc,false);
    (loc.world==='light'?panelLight:panelDark).appendChild(el);
  });
  DUNGEONS.forEach(loc=>{
    const el=buildMarker(loc,true);
    (loc.world==='light'?panelLight:panelDark).appendChild(el);
  });

  panelLight.addEventListener('click',handlePanelClick('light'));
  panelDark.addEventListener('click',handlePanelClick('dark'));

  document.getElementById('mmMed').addEventListener('change',e=>{
    mmMedallion=e.target.value;
    if(lastState) updateMap(lastState);
    // Push immediately so OBS / other devices get MM Needs without waiting for a crystal claim.
    if(typeof schedulePushPrizesToServer==='function') schedulePushPrizesToServer();
  });
  document.getElementById('trMed').addEventListener('change',e=>{
    trMedallion=e.target.value;
    if(lastState) updateMap(lastState);
    if(typeof schedulePushPrizesToServer==='function') schedulePushPrizesToServer();
  });
  initMedallionHotkeys();

  document.getElementById('mapToolsToggle').addEventListener('click',()=>{
    const toolsPanel=document.getElementById('mapToolsPanel');
    const toolsToggle=document.getElementById('mapToolsToggle');
    if(!toolsPanel || !toolsToggle || isRaceMode()) return;
    if(toolsPanel.hidden){
      toolsPanel.hidden=false;
      toolsToggle.setAttribute('aria-expanded','true');
    }else{
      closeMapTools();
    }
  });

  document.getElementById('calibrateBtn').addEventListener('click',()=>{
    setMode(calibrateMode ? null : 'calibrate');
  });
  document.getElementById('addMarkerBtn').addEventListener('click',()=>{
    setMode(addMarkerMode ? null : 'add');
  });
  document.getElementById('renameBtn').addEventListener('click',()=>{
    setMode(renameMode ? null : 'rename');
  });



  document.getElementById('exportBtn').addEventListener('click',exportMarkerPositions);
  updateMapGuideMode();
}



/* ---- I'm Stuck: nearest available marker + map guide line (Practice) ---- */

function getStuckPlayerMapPos(){
  if(lastOutdoorPlayerMapPos
    && Number.isFinite(lastOutdoorPlayerMapPos.x)
    && Number.isFinite(lastOutdoorPlayerMapPos.y)){
    return lastOutdoorPlayerMapPos;
  }
  // Fallback from live TrackerState if outdoors
  if(typeof TrackerState!=='undefined'
    && !TrackerState.indoors
    && (TrackerState.world==='light' || TrackerState.world==='dark')
    && Number.isFinite(TrackerState.playerX)
    && Number.isFinite(TrackerState.playerY)
    && typeof OVERWORLD_COORD_SIZE==='number'){
    return {
      world:TrackerState.world,
      x:Math.max(0,Math.min(100,((TrackerState.playerX+8)/OVERWORLD_COORD_SIZE)*100)),
      y:Math.max(0,Math.min(100,((TrackerState.playerY+12)/OVERWORLD_COORD_SIZE)*100))
    };
  }
  return null;
}

/** Map-percent distance threshold for "arrived at suggested step". */
const STUCK_ARRIVAL_MAP_UNITS=4.5;

/**
 * Whether a dungeon still has open checks the runner can work on.
 */
function stuckDungeonHasRemaining(dungeon){
  if(!dungeon?.key) return false;
  const total=(typeof DUNGEON_TOTALS!=='undefined' && DUNGEON_TOTALS[dungeon.key]) || 0;
  if(total<=0) return true;
  const stats=TrackerState?.dungeonStats || lastDungeonStats || null;
  const found=stats ? Number(stats[dungeon.key]) || 0 : 0;
  return found<total;
}

/**
 * Escape Sewers overworld pin covers a subset of Hyrule Castle / Escape
 * checks. Prefer the castle dungeon entrance while HC is still incomplete.
 */
function stuckShouldSkipEscapeSewersPin(save){
  const hc=typeof DUNGEONS!=='undefined'
    ? DUNGEONS.find(d=>d.key==='hyruleCastle')
    : null;
  if(!hc) return false;
  if(!stuckDungeonHasRemaining(hc)) return false;
  // If the runner can enter HC, the dungeon marker is the right door.
  if(typeof hc.entryNeed==='function') return !!hc.entryNeed(save || {});
  return true;
}

/**
 * Next accessible step for I'm Stuck.
 * Prefer overworld checks (Uncle, chests, NPCs) over dungeon doors when both
 * are available — pure distance alone sends you to HC from Link's House even
 * when Uncle is still open. Fall back to enterable incomplete dungeons only
 * when no overworld check is reachable.
 */
function findNearestAvailableMarker(state){
  const save=state || lastState || TrackerState?.save;
  if(!save || typeof LOCATIONS==='undefined') return null;
  const player=getStuckPlayerMapPos();
  const origin=player || {world:null,x:50,y:50};
  const skipSewers=stuckShouldSkipEscapeSewersPin(save);

  const scoreCandidate=(loc,isDungeon)=>{
    if(!loc || loc.x==null || loc.y==null) return null;
    if(isDungeon){
      if(typeof loc.entryNeed==='function' && !loc.entryNeed(save)) return null;
      if(!stuckDungeonHasRemaining(loc)) return null;
    }else{
      if(skipSewers && loc.id==='escape_sewers') return null;
      // During rain, Sanctuary / house are not the next step while HC remains.
      if(typeof isRainState==='function' && isRainState(save)
        && (loc.id==='sanctuary' || loc.id==='links_house')){
        const hc=typeof DUNGEONS!=='undefined'
          ? DUNGEONS.find(d=>d.key==='hyruleCastle') : null;
        if(hc && stuckDungeonHasRemaining(hc)) return null;
      }
      if(typeof loc.need==='function' && !loc.need(save)) return null;
      if(typeof loc.checked==='function' && loc.checked(save)) return null;
    }
    const el=document.querySelector(`.marker[data-id="${loc.id}"]`);
    if(el && el.hidden) return null;

    const sameWorld=!(origin.world && loc.world) || loc.world===origin.world;
    const dx=(Number(loc.x)||0)-(origin.x||0);
    const dy=(Number(loc.y)||0)-(origin.y||0);
    let dist=Math.sqrt(dx*dx+dy*dy);
    // Prefer same world heavily.
    if(origin.world && loc.world && !sameWorld) dist+=1000;
    return {
      loc,
      dist,
      sameWorld:!!sameWorld,
      player:player,
      fromFallback:!player,
      isDungeon:!!isDungeon
    };
  };

  const pickBest=(list,isDungeon)=>{
    let best=null;
    list.forEach(loc=>{
      const cand=scoreCandidate(loc,isDungeon);
      if(!cand) return;
      if(!best || cand.dist<best.dist) best=cand;
    });
    return best;
  };

  // Standard rain path: Uncle → Hyrule Castle → Sanctuary.
  // Pure distance would pick Sanctuary (need:true) over HC after Uncle.
  if(typeof isRainState==='function' && isRainState(save)){
    const uncle=LOCATIONS.find(l=>l.id==='link_uncle');
    const uncleCand=scoreCandidate(uncle,false);
    if(uncleCand) return uncleCand;

    if(typeof DUNGEONS!=='undefined'){
      const hc=DUNGEONS.find(d=>d.key==='hyruleCastle');
      const hcCand=scoreCandidate(hc,true);
      if(hcCand) return hcCand;
    }
    // After HC is complete during rain, fall through (Sanctuary / sewers).
  }

  // Pass 1: accessible overworld / NPC / chest checks only.
  const checkBest=pickBest(LOCATIONS,false);
  if(checkBest) return checkBest;

  // Pass 2: enterable dungeons that still have remaining tracked checks.
  if(typeof DUNGEONS!=='undefined'){
    return pickBest(DUNGEONS,true);
  }
  return null;
}

/**
 * Clear the I'm Stuck suggestion panel text (map guide is separate).
 */
function clearStuckSuggestionUI(message){
  const out=document.getElementById('stuckSuggestion');
  if(!out) return;
  if(message){
    out.innerHTML=`<p class="stuck-empty">${message}</p>`;
  }else{
    out.innerHTML='<p class="stuck-empty">Press “Suggest next step” for a logic-only recommendation.</p>';
  }
  // Arrival / clear messages are local only — do not leave them on the LAN coaching feed.
  if(typeof pushCoachingToServer === 'function'){
    try{
      pushCoachingToServer({ stuckHtml: '', best: null, stuckTargetId: null });
    }catch(e){ /* ignore */ }
  }
}

/**
 * Auto-clear the active I'm Stuck guide when Link arrives at the target
 * (overworld proximity) or enters the suggested dungeon.
 */
function maybeClearStuckGuideOnArrival(){
  if(!stuckGuideTargetId) return false;
  const loc=(typeof LOCATIONS!=='undefined' && LOCATIONS.find(l=>l.id===stuckGuideTargetId))
    || (typeof DUNGEONS!=='undefined' && DUNGEONS.find(d=>d.id===stuckGuideTargetId))
    || null;
  if(!loc) return false;

  // Collected overworld check → clear.
  if(typeof loc.checked==='function' && lastState && loc.checked(lastState)){
    clearStuckMapGuide();
    clearStuckSuggestionUI('Arrived — check collected. Suggest again when you need the next step.');
    return true;
  }

  // Entered the suggested dungeon → clear.
  if(loc.key && TrackerState?.currentDungeon===loc.key){
    clearStuckMapGuide();
    clearStuckSuggestionUI(`Arrived at ${loc.name || 'dungeon'}. Suggest again when you need the next step.`);
    return true;
  }

  // Overworld proximity to the pin (same world only).
  const player=getStuckPlayerMapPos();
  if(player && player.world===loc.world){
    const dx=(Number(loc.x)||0)-player.x;
    const dy=(Number(loc.y)||0)-player.y;
    const dist=Math.sqrt(dx*dx+dy*dy);
    if(dist<=STUCK_ARRIVAL_MAP_UNITS){
      clearStuckMapGuide();
      clearStuckSuggestionUI(`Arrived at ${loc.name || 'target'}. Suggest again when you need the next step.`);
      return true;
    }
  }
  return false;
}

function clearStuckMapGuide(){
  stuckGuideTargetId=null;
  document.querySelectorAll('.stuck-guide-svg').forEach(el=>el.remove());
  document.querySelectorAll('.marker.stuck-target').forEach(el=>{
    el.classList.remove('stuck-target');
  });
}

/**
 * Live-update the I'm Stuck dashed line so it stays attached to Link's
 * map sprite (or the last outdoor position while indoors). Target end is fixed.
 * No line when worlds differ or position is unknown.
 */
function redrawStuckGuideLine(){
  if(!stuckGuideTargetId) return;
  const loc=(typeof LOCATIONS!=='undefined' && LOCATIONS.find(l=>l.id===stuckGuideTargetId))
    || (typeof DUNGEONS!=='undefined' && DUNGEONS.find(d=>d.id===stuckGuideTargetId))
    || null;
  if(!loc || loc.x==null || loc.y==null) return;

  const world=loc.world==='dark' ? 'dark' : 'light';
  const panel=world==='dark' ? panelDark : panelLight;
  if(!panel) return;

  const player=getStuckPlayerMapPos();
  let svg=panel.querySelector(':scope > .stuck-guide-svg');

  if(!svg){
    svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.classList.add('stuck-guide-svg');
    svg.setAttribute('viewBox','0 0 100 100');
    svg.setAttribute('preserveAspectRatio','none');
    panel.appendChild(svg);
  }

  let line=svg.querySelector('line.stuck-guide-line');
  let end=svg.querySelector('circle.stuck-guide-end');
  if(!line || !end){
    svg.innerHTML='';
    line=document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('class','stuck-guide-line');
    svg.appendChild(line);
    end=document.createElementNS('http://www.w3.org/2000/svg','circle');
    end.setAttribute('r','1.8');
    end.setAttribute('class','stuck-guide-end');
    svg.appendChild(end);
  }

  // Always mark the target with an end-cap (pulse class is on the marker).
  end.setAttribute('cx',Number(loc.x).toFixed(2));
  end.setAttribute('cy',Number(loc.y).toFixed(2));

  // Line only when we know a same-world outdoor (or last outdoor) position.
  if(!player || player.world!==world){
    line.setAttribute('visibility','hidden');
    return;
  }
  line.setAttribute('visibility','visible');
  line.setAttribute('x1',Number(player.x).toFixed(2));
  line.setAttribute('y1',Number(player.y).toFixed(2));
  line.setAttribute('x2',Number(loc.x).toFixed(2));
  line.setAttribute('y2',Number(loc.y).toFixed(2));
}

function showStuckMapGuide(loc){
  clearStuckMapGuide();
  if(!loc || (typeof isRaceMode==='function' && isRaceMode())) return;

  const world=loc.world==='dark' ? 'dark' : 'light';
  const panel=world==='dark' ? panelDark : panelLight;
  if(!panel) return;

  // Ensure the correct world is visible so the line is useful.
  if(typeof setActiveMapWorld==='function' && activeMapWorld!==world){
    setActiveMapWorld(world,{manual:true});
  }else if(typeof activeMapWorld!=='undefined' && activeMapWorld!==world){
    const btn=document.getElementById(world==='dark'?'worldTabDark':'worldTabLight');
    if(btn) btn.click();
  }

  const marker=panel.querySelector(`.marker[data-id="${loc.id}"]`)
    || document.querySelector(`.marker[data-id="${loc.id}"]`);
  if(marker){
    marker.classList.add('stuck-target');
  }
  stuckGuideTargetId=loc.id;

  // Draw once now; updateLivePlayerMarker will keep the sprite end following.
  redrawStuckGuideLine();
}


// Medallion requirement helpers + keyboard shortcuts.
// Cycle: unknown → bombos → ether → quake → unknown
// Hotkeys (when this page has keyboard focus):
//   [  = cycle MM     ]  = cycle TR
//   Alt+1/2/3 = set MM to Bombos/Ether/Quake
//   Alt+Shift+1/2/3 = set TR to Bombos/Ether/Quake
//   Alt+0 = clear MM    Alt+Shift+0 = clear TR
const MEDALLION_CYCLE=['unknown','bombos','ether','quake'];

function setMedallionRequirement(which,value){
  if(value!=='unknown' && value!=='bombos' && value!=='ether' && value!=='quake') return;
  if(which==='mm'){
    mmMedallion=value;
    const sel=document.getElementById('mmMed');
    if(sel) sel.value=value;
  }else if(which==='tr'){
    trMedallion=value;
    const sel=document.getElementById('trMed');
    if(sel) sel.value=value;
  }else return;
  if(lastState) updateMap(lastState);
  showMedallionToast(which,value);
  if(typeof schedulePushPrizesToServer==='function') schedulePushPrizesToServer();
}

function cycleMedallionRequirement(which){
  const current=which==='mm'?mmMedallion:trMedallion;
  const idx=MEDALLION_CYCLE.indexOf(current);
  const next=MEDALLION_CYCLE[(idx<0?0:idx+1)%MEDALLION_CYCLE.length];
  setMedallionRequirement(which,next);
}

function showMedallionToast(which,value){
  let el=document.getElementById('medallionToast');
  if(!el){
    el=document.createElement('div');
    el.id='medallionToast';
    el.setAttribute('role','status');
    el.style.cssText=[
      'position:fixed','top:12px','left:50%','transform:translateX(-50%)',
      'z-index:99999','padding:8px 14px','border-radius:8px',
      'background:rgba(16,14,28,.94)','border:1px solid rgba(216,180,92,.55)',
      'color:#f0e6c8','font:700 .8rem/1.2 system-ui,sans-serif',
      'letter-spacing:.04em','pointer-events:none',
      'box-shadow:0 6px 20px rgba(0,0,0,.45)','opacity:0',
      'transition:opacity .15s ease'
    ].join(';');
    document.body.appendChild(el);
  }
  const label=which==='mm'?'Misery Mire':'Turtle Rock';
  const pretty=value==='unknown'?'Unknown':value.charAt(0).toUpperCase()+value.slice(1);
  el.textContent=label+' needs '+pretty;
  el.style.opacity='1';
  clearTimeout(el._hide);
  el._hide=setTimeout(()=>{ el.style.opacity='0'; },1400);
}

function initMedallionHotkeys(){
  if(window.__medallionHotkeysBound) return;
  window.__medallionHotkeysBound=true;
  document.addEventListener('keydown',e=>{
    // Ignore when typing in inputs/selects (except our own med selects are fine to override).
    const tag=(e.target&&e.target.tagName||'').toLowerCase();
    if(tag==='input'||tag==='textarea') return;
    if(e.ctrlKey||e.metaKey) return;

    // [ cycle MM, ] cycle TR
    if(e.key==='[' && !e.altKey && !e.shiftKey){
      e.preventDefault();
      cycleMedallionRequirement('mm');
      return;
    }
    if(e.key===']' && !e.altKey && !e.shiftKey){
      e.preventDefault();
      cycleMedallionRequirement('tr');
      return;
    }

    // Alt+number direct set
    if(e.altKey){
      const map={
        '0':'unknown','Digit0':'unknown',
        '1':'bombos','Digit1':'bombos',
        '2':'ether','Digit2':'ether',
        '3':'quake','Digit3':'quake'
      };
      const val=map[e.key]||map[e.code];
      if(!val) return;
      e.preventDefault();
      setMedallionRequirement(e.shiftKey?'tr':'mm',val);
    }
  });
}


function setMarkerState(id, state){
  const marker =
    panelLight.querySelector(`.marker[data-id="${id}"]`) ||
    panelDark.querySelector(`.marker[data-id="${id}"]`);

  if(!marker) return;

  marker.classList.remove(
    "locked",
    "partial",
    "avail",
    "checked",
    "dungeon-state-blocked",
    "dungeon-state-untouched",
    "dungeon-state-partial",
    "dungeon-state-available",
    "dungeon-state-complete"
  );

  marker.hidden = state === "checked";
  marker.classList.add(state);
}
