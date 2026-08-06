/* ============================================================
   ui.js
   Items grid and dungeon prizes: building the inventory tiles,
   manual prize selectors, and live claimed-prize state. Depends on
   the item/prize definitions in constants.js and on
   recordProgressiveSplits() from timer.js (called as part of the
   same render pass).
   ============================================================ */

const ITEM_ASSET_ROOT='assets/items/';

// Pixel-art inventory visuals. `states` maps the live SRAM value to the
// exact item currently represented by a progressive/shared inventory slot.
const ITEM_VISUALS={
  bow:{off:'nobow.png',states:{1:['Bow','bow.png'],2:['Silver Bow','silvers.png'],3:['Bow + Silver Arrows','silvers.png']}},
  boomerang:{off:'noboomerang.png',emptyLabel:'Boomerangs',states:{1:['Blue Boomerang','blueboom.png'],2:['Red Boomerang','redboom.png'],3:['Blue + Red Boomerangs','redboom.png']}},
  hookshot:{off:'nohook.png',on:['Hookshot','hookshot.png']},
  bombs:{off:'nobombs.png',on:['Bombs','bombs.png']},
  powder:{off:'nomushroom.png',emptyLabel:'Mushroom / Powder',states:{1:['Mushroom','mushroom.png'],2:['Magic Powder','powder.png'],3:['Mushroom + Powder','powder.png']}},
  firerod:{off:'nofirerod.png',on:['Fire Rod','firerod.png']},
  icerod:{off:'noicerod.png',on:['Ice Rod','icerod.png']},
  bombos:{off:'nobombos.png',on:['Bombos','bombos.png']},
  ether:{off:'noether.png',on:['Ether','ether.png']},
  quake:{off:'noquake.png',on:['Quake','quake.png']},
  lamp:{off:'nolamp.png',on:['Lamp','lamp.png']},
  hammer:{off:'nohammer.png',on:['Hammer','hammer.png']},
  flute:{off:'noshovel.png',emptyLabel:'Shovel / Flute',states:{1:['Shovel','shovel.png'],2:['Flute','flute.png'],3:['Activated Flute','flute.png']}},
  net:{off:'nobugnet.png',on:['Bug-Catching Net','bugnet.png']},
  book:{off:'nobook.png',on:['Book of Mudora','book.png']},
  somaria:{off:'nosomaria.png',on:['Cane of Somaria','somaria.png']},
  byrna:{off:'nobyrna.png',on:['Cane of Byrna','byrna.png']},
  cape:{off:'nocape.png',on:['Magic Cape','cape.png']},
  mirror:{off:'nomirror.png',on:['Magic Mirror','mirror.png']},
  gloves:{off:'noglove.png',emptyLabel:'Glove / Mitt',states:{1:['Power Glove','glove.png'],2:["Titan's Mitt",'mitt.png']}},
  boots:{off:'noboots.png',on:['Pegasus Boots','boots.png']},
  flippers:{off:'noflippers.png',on:["Zora's Flippers",'flippers.png']},
  moonpearl:{off:'nopearl.png',on:['Moon Pearl','pearl.png']},
  sword:{off:'nosword.png',states:{1:['Fighter Sword','sword1.png'],2:['Master Sword','sword2.png'],3:['Tempered Sword','sword3.png'],4:['Golden Sword','sword4.png']}},
  shield:{off:'noshield.png',states:{1:['Blue Shield','shield1.png'],2:['Red Shield','shield2.png'],3:['Mirror Shield','shield3.png']}},
  armor:{off:'greenmail.png',states:{0:['Green Mail','greenmail.png'],1:['Blue Mail','bluemail.png'],2:['Red Mail','redmail.png']}},
  bottle1:{off:'nobottle.png',on:['Bottle','bottle.png']},
  bottle2:{off:'nobottle.png',on:['Bottle','bottle.png']},
  bottle3:{off:'nobottle.png',on:['Bottle','bottle.png']},
  bottle4:{off:'nobottle.png',on:['Bottle','bottle.png']}
};

let itemDisplayMode=localStorage.getItem('itemDisplayMode')==='compact'?'compact':'detailed';
let itemToneMode=localStorage.getItem('itemToneMode')==='bright'?'bright':'smoked';
let previousItemValues=null;

const DUNGEON_PRIZE_STORAGE_KEY='dungeonPrizeAssignments';
const DUNGEON_PRIZE_CLAIM_STORAGE_KEY='dungeonPrizeClaims';

function defaultDungeonPrizeAssignments(){
  return Object.fromEntries(PRIZE_DUNGEONS.map(dungeon=>[dungeon.key,'unknown']));
}

function loadDungeonPrizeAssignments(){
  const defaults=defaultDungeonPrizeAssignments();
  try{
    const saved=JSON.parse(localStorage.getItem(DUNGEON_PRIZE_STORAGE_KEY) || '{}');
    const validTypes=new Set(DUNGEON_PRIZE_TYPES.map(type=>type.key));
    PRIZE_DUNGEONS.forEach(dungeon=>{
      if(validTypes.has(saved?.[dungeon.key])) defaults[dungeon.key]=saved[dungeon.key];
    });
  }catch(error){
    console.warn('Could not restore dungeon prize assignments:',error);
  }
  return defaults;
}

let dungeonPrizeAssignments=loadDungeonPrizeAssignments();

function defaultDungeonPrizeClaims(){
  return Object.fromEntries(PRIZE_DUNGEONS.map(dungeon=>[dungeon.key,false]));
}

function loadDungeonPrizeClaims(){
  const defaults=defaultDungeonPrizeClaims();
  try{
    const saved=JSON.parse(localStorage.getItem(DUNGEON_PRIZE_CLAIM_STORAGE_KEY) || '{}');
    PRIZE_DUNGEONS.forEach(dungeon=>{
      if(typeof saved?.[dungeon.key]==='boolean') defaults[dungeon.key]=saved[dungeon.key];
    });
  }catch(error){
    console.warn('Could not restore claimed dungeon prizes:',error);
  }
  return defaults;
}

let dungeonPrizeClaims=loadDungeonPrizeClaims();
let previousDungeonRewardValues=null;
let openDungeonPrizeMenuKey=null;

function getDungeonPrizeType(typeKey){
  return DUNGEON_PRIZE_TYPES.find(type=>type.key===typeKey) || DUNGEON_PRIZE_TYPES[0];
}

function scoringPrizeFor(typeKey){
  if(typeKey==='crystal' || typeKey==='redCrystal') return 'crystal';
  if(typeKey==='greenPendant') return 'greenPendant';
  if(typeKey==='bluePendant' || typeKey==='redPendant') return 'pendant';
  return null;
}

function syncDungeonPrizesToLogic(){
  PRIZE_DUNGEONS.forEach(dungeon=>{
    if(DUNGEON_DATA[dungeon.key]){
      DUNGEON_DATA[dungeon.key].prize=scoringPrizeFor(
        dungeonPrizeAssignments[dungeon.key]
      );
    }
  });
}

function persistDungeonPrizeAssignments(){
  try{
    localStorage.setItem(
      DUNGEON_PRIZE_STORAGE_KEY,
      JSON.stringify(dungeonPrizeAssignments)
    );
  }catch(error){
    console.warn('Could not save dungeon prize assignments:',error);
  }
}

function persistDungeonPrizeClaims(){
  try{
    localStorage.setItem(
      DUNGEON_PRIZE_CLAIM_STORAGE_KEY,
      JSON.stringify(dungeonPrizeClaims)
    );
  }catch(error){
    console.warn('Could not save claimed dungeon prizes:',error);
  }
}

function resetDungeonPrizeState(){
  dungeonPrizeAssignments=defaultDungeonPrizeAssignments();
  dungeonPrizeClaims=defaultDungeonPrizeClaims();
  previousDungeonRewardValues=null;
  closeDungeonPrizeMenu(false);
  persistDungeonPrizeAssignments();
  persistDungeonPrizeClaims();
  PRIZE_DUNGEONS.forEach(renderDungeonPrizeAssignment);
  updateDungeonPrizeSummary(TrackerState.save || {});
  refreshRoutingAfterPrizeChange();
  if(typeof schedulePushPrizesToServer==='function') schedulePushPrizesToServer();
}

function restoreDungeonPrizeState(reportData){
  dungeonPrizeAssignments=defaultDungeonPrizeAssignments();
  dungeonPrizeClaims=defaultDungeonPrizeClaims();
  (reportData?.dungeons || []).forEach(dungeon=>{
    if(!(dungeon.key in dungeonPrizeAssignments) || !dungeon.prize) return;
    dungeonPrizeAssignments[dungeon.key]=dungeon.prize.key || 'unknown';
    dungeonPrizeClaims[dungeon.key]=!!dungeon.prize.claimed;
  });
  const save=reportData?.snapshot?.save || {};
  previousDungeonRewardValues={
    pendants:Number(save.pendants) || 0,
    crystals:Number(save.crystals) || 0
  };
  persistDungeonPrizeAssignments();
  persistDungeonPrizeClaims();
  PRIZE_DUNGEONS.forEach(renderDungeonPrizeAssignment);
  updateDungeonPrizeSummary(save);
  refreshRoutingAfterPrizeChange();
}

function renderDungeonPrizeAssignment(dungeon){
  const control=document.getElementById('dungeon-prize-'+dungeon.key);
  if(!control) return;
  const prize=getDungeonPrizeType(dungeonPrizeAssignments[dungeon.key]);
  const diamond=control.querySelector('.dungeon-prize-diamond');
  const mark=control.querySelector('.dungeon-prize-mark');
  const menu=document.getElementById('dungeon-prize-menu-'+dungeon.key);
  const claimed=!!dungeonPrizeClaims[dungeon.key];

  DUNGEON_PRIZE_TYPES.forEach(type=>control.classList.remove('prize-'+type.key));
  control.classList.add('prize-'+prize.key);
  control.classList.toggle('claimed',claimed);
  diamond.className='dungeon-prize-diamond prize-'+prize.key;
  mark.textContent=prize.mark;
  control.title=`${dungeon.name} — ${prize.label}${claimed?' — claimed':''}. Click to choose a prize.`;
  control.setAttribute(
    'aria-label',
    `${dungeon.name} prize: ${prize.label}${claimed?', claimed':''}`
  );
  menu?.querySelectorAll('.dungeon-prize-option').forEach(option=>{
    const selected=option.dataset.prize===prize.key;
    option.classList.toggle('selected',selected);
    option.setAttribute('aria-selected',selected?'true':'false');
  });
}

function closeDungeonPrizeMenu(restoreFocus=false){
  if(!openDungeonPrizeMenuKey) return;
  const key=openDungeonPrizeMenuKey;
  const wrapper=document.getElementById('dungeon-prize-control-'+key);
  const trigger=document.getElementById('dungeon-prize-'+key);
  const menu=document.getElementById('dungeon-prize-menu-'+key);
  if(menu) menu.hidden=true;
  if(trigger) trigger.setAttribute('aria-expanded','false');
  wrapper?.classList.remove('menu-open');
  openDungeonPrizeMenuKey=null;
  if(restoreFocus) trigger?.focus();
}

function openDungeonPrizeMenu(dungeonKey){
  if(openDungeonPrizeMenuKey===dungeonKey){
    closeDungeonPrizeMenu(true);
    return;
  }
  closeDungeonPrizeMenu(false);
  const wrapper=document.getElementById('dungeon-prize-control-'+dungeonKey);
  const trigger=document.getElementById('dungeon-prize-'+dungeonKey);
  const menu=document.getElementById('dungeon-prize-menu-'+dungeonKey);
  if(!wrapper || !trigger || !menu) return;
  openDungeonPrizeMenuKey=dungeonKey;
  menu.hidden=false;
  trigger.setAttribute('aria-expanded','true');
  wrapper.classList.add('menu-open');
  const selected=menu.querySelector('.dungeon-prize-option.selected');
  (selected || menu.querySelector('.dungeon-prize-option'))?.focus();
}

function handleDungeonPrizeMenuKeys(event,menu){
  const options=[...menu.querySelectorAll('.dungeon-prize-option')];
  if(!options.length) return;
  const current=Math.max(0,options.indexOf(document.activeElement));
  let next=null;
  if(event.key==='ArrowDown') next=(current+1)%options.length;
  else if(event.key==='ArrowUp') next=(current-1+options.length)%options.length;
  else if(event.key==='Home') next=0;
  else if(event.key==='End') next=options.length-1;
  if(next===null) return;
  event.preventDefault();
  options[next].focus();
}

function updateDungeonPrizeSummary(save=TrackerState.save || {}){
  const known=PRIZE_DUNGEONS.filter(
    dungeon=>dungeonPrizeAssignments[dungeon.key]!=='unknown'
  ).length;
  const claimed=PRIZE_DUNGEONS.filter(
    dungeon=>dungeonPrizeClaims[dungeon.key]
  ).length;
  const pendantsFound=PENDANT_TYPES.filter(
    pendant=>!!((save.pendants || 0) & pendant.bit)
  ).length;
  const crystalsFound=crystalCount(save);

  const knownCount=document.getElementById('dungeonPrizeKnownCount');
  const claimedCount=document.getElementById('dungeonPrizeClaimedCount');
  const pendantCount=document.getElementById('pendantCount');
  const crystalCountEl=document.getElementById('crystalCount');
  if(knownCount) knownCount.textContent=`${known}/${PRIZE_DUNGEONS.length} known`;
  if(claimedCount) claimedCount.textContent=`${claimed}/${PRIZE_DUNGEONS.length} claimed`;
  if(pendantCount) pendantCount.textContent=`${pendantsFound}/3`;
  if(crystalCountEl) crystalCountEl.textContent=`${crystalsFound}/7`;
}

function refreshRoutingAfterPrizeChange(){
  syncDungeonPrizesToLogic();
  if(typeof lastDungeonStats!=='undefined' && lastDungeonStats){
    updateDungeonStats(lastDungeonStats);
  }
}

function setDungeonPrize(dungeonKey,typeKey){
  const dungeon=PRIZE_DUNGEONS.find(entry=>entry.key===dungeonKey);
  const valid=DUNGEON_PRIZE_TYPES.some(type=>type.key===typeKey);
  if(!dungeon || !valid) return;

  dungeonPrizeAssignments[dungeonKey]=typeKey;
  if(typeKey==='unknown'){
    dungeonPrizeClaims[dungeonKey]=false;
    persistDungeonPrizeClaims();
  }
  persistDungeonPrizeAssignments();
  renderDungeonPrizeAssignment(dungeon);
  updateDungeonPrizeSummary();
  refreshRoutingAfterPrizeChange();
  if(typeof schedulePushPrizesToServer==='function') schedulePushPrizesToServer();
}

function inferredPrizeFromRewardChange(pendantDelta,crystalDelta){
  if(pendantDelta & 0x04) return 'greenPendant';
  if(pendantDelta & 0x02) return 'bluePendant';
  if(pendantDelta & 0x01) return 'redPendant';
  if(crystalDelta) return 'crystal';
  return null;
}

function recordDungeonPrizeClaim(save){
  const current={
    pendants:save.pendants || 0,
    crystals:save.crystals || 0
  };

  if(previousDungeonRewardValues){
    const pendantDelta=current.pendants & ~previousDungeonRewardValues.pendants;
    const crystalDelta=current.crystals & ~previousDungeonRewardValues.crystals;
    const dungeon=PRIZE_DUNGEONS.find(
      entry=>entry.key===TrackerState.currentDungeon
    );

    if(dungeon && (pendantDelta || crystalDelta)){
      const inferred=inferredPrizeFromRewardChange(pendantDelta,crystalDelta);
      if(dungeonPrizeAssignments[dungeon.key]==='unknown' && inferred){
        dungeonPrizeAssignments[dungeon.key]=inferred;
        persistDungeonPrizeAssignments();
      }
      dungeonPrizeClaims[dungeon.key]=true;
      persistDungeonPrizeClaims();
      renderDungeonPrizeAssignment(dungeon);
      refreshRoutingAfterPrizeChange();
      if(typeof recordRunEvent==='function'){
        recordRunEvent('prize_claimed',{
          dungeonKey:dungeon.key,
          dungeon:dungeon.name,
          prize:getDungeonPrizeType(dungeonPrizeAssignments[dungeon.key]).label
        });
      }
      if(typeof log==='function') log(`${dungeon.name} prize collected`,'ok');
    }
  }

  previousDungeonRewardValues=current;
  updateDungeonPrizeSummary(save);
}

function initDungeonPrizeAssignments(){
  const grid=document.getElementById('dungeonPrizeAssignments');
  if(!grid) return;

  syncDungeonPrizesToLogic();
  grid.innerHTML='';
  PRIZE_DUNGEONS.forEach(dungeon=>{
    const wrapper=document.createElement('div');
    wrapper.className='dungeon-prize-control';
    wrapper.id='dungeon-prize-control-'+dungeon.key;
    const options=DUNGEON_PRIZE_TYPES.map(
      type=>`<button class="dungeon-prize-option" type="button" role="option" data-prize="${type.key}">
               <span class="dungeon-prize-option-swatch prize-${type.key}" aria-hidden="true"></span>
               <span>${type.label}</span>
             </button>`
    ).join('');
    wrapper.innerHTML=`<button class="dungeon-prize-slot" id="dungeon-prize-${dungeon.key}" type="button"
                         aria-haspopup="listbox" aria-expanded="false" aria-controls="dungeon-prize-menu-${dungeon.key}">
                         <span class="dungeon-prize-visual">
                           <span class="dungeon-prize-diamond"><span class="dungeon-prize-mark"></span></span>
                           <span class="dungeon-prize-claimed" aria-hidden="true">✓</span>
                         </span>
                         <span class="dungeon-prize-label">${dungeon.abbr}</span>
                       </button>
                       <div class="dungeon-prize-menu" id="dungeon-prize-menu-${dungeon.key}" role="listbox" hidden>
                         ${options}
                       </div>`;
    const trigger=wrapper.querySelector('.dungeon-prize-slot');
    const menu=wrapper.querySelector('.dungeon-prize-menu');
    trigger.addEventListener('click',()=>openDungeonPrizeMenu(dungeon.key));
    menu.addEventListener('click',event=>{
      const option=event.target.closest('.dungeon-prize-option');
      if(!option) return;
      setDungeonPrize(dungeon.key,option.dataset.prize);
      closeDungeonPrizeMenu(true);
    });
    menu.addEventListener('keydown',event=>handleDungeonPrizeMenuKeys(event,menu));
    grid.appendChild(wrapper);
    renderDungeonPrizeAssignment(dungeon);
  });
  updateDungeonPrizeSummary();

  document.addEventListener('pointerdown',event=>{
    if(!openDungeonPrizeMenuKey) return;
    const wrapper=document.getElementById('dungeon-prize-control-'+openDungeonPrizeMenuKey);
    if(wrapper && !wrapper.contains(event.target)) closeDungeonPrizeMenu(false);
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape' && openDungeonPrizeMenuKey){
      event.preventDefault();
      closeDungeonPrizeMenu(true);
    }
  });

  document.getElementById('clearDungeonPrizes')?.addEventListener('click',()=>{
    if(!confirm('Clear all manually assigned dungeon prizes?')) return;
    resetDungeonPrizeState();
  });
}

function resolveItemVisual(def,value){
  const config=ITEM_VISUALS[def.key] || {};
  let state=config.states?.[value];

  if(!state && config.states && value>0){
    const fallbackLevel=Object.keys(config.states)
      .map(Number)
      .filter(level=>level<=value)
      .sort((a,b)=>b-a)[0];
    if(fallbackLevel!==undefined) state=config.states[fallbackLevel];
  }

  if(!state && value>0) state=config.on;

  let label=state?.[0] || config.emptyLabel || def.label;
  let icon=state?.[1] || config.off;

  if(def.key==='bombs' && value>0) label=`Bombs ×${value}`;
  if(def.key.startsWith('bottle') && value>0)
    label=BOTTLE_CONTENT_LABELS[value] || 'Bottle';

  return {label,icon:ITEM_ASSET_ROOT+(icon || 'nosword.png')};
}

function applyItemDisplayMode(mode){
  itemDisplayMode=mode==='compact'?'compact':'detailed';
  const grid=document.getElementById('gridAll');
  const toggle=document.getElementById('itemViewToggle');

  if(grid){
    grid.dataset.view=itemDisplayMode;
    grid.classList.toggle('compact',itemDisplayMode==='compact');
  }
  if(toggle){
    toggle.textContent=itemDisplayMode==='compact'?'Detailed View':'Compact View';
    toggle.setAttribute('aria-pressed',itemDisplayMode==='compact'?'true':'false');
  }
}

function applyItemToneMode(mode){
  itemToneMode=mode==='bright'?'bright':'smoked';
  const grid=document.getElementById('gridAll');
  const toggle=document.getElementById('itemToneToggle');

  if(grid){
    grid.dataset.tone=itemToneMode;
    grid.classList.toggle('bright-icons',itemToneMode==='bright');
  }
  if(toggle){
    toggle.textContent=itemToneMode==='bright'?'Smoked Icons':'Bright Icons';
    toggle.setAttribute('aria-pressed',itemToneMode==='bright'?'true':'false');
    toggle.title=itemToneMode==='bright'
      ? 'Use darker icons that match the tracker theme'
      : 'Use the original brighter sprite colors';
  }
}

function buildTile(def){
  const tile=document.createElement('div');
  const visual=resolveItemVisual(def,0);
  tile.className='tile item-tile cat-'+def.cat;
  tile.id='tile-'+def.key;
  tile.innerHTML=`<div class="badge item-icon-frame"><img class="item-icon" src="${visual.icon}" alt=""></div>
                  <div class="label">${visual.label}</div>`;
  tile.title=visual.label+' — not collected';
  tile.setAttribute('aria-label',tile.title);
  return tile;
}

function renderGrid(container,defs){
  container.innerHTML='';
  defs.forEach(d=>container.appendChild(buildTile(d)));
}

function itemValueAdvanced(def,oldValue,newValue){
  if(oldValue===null || oldValue===undefined || newValue<=oldValue) return false;
  if(def.key==='bombs' || def.key.startsWith('bottle'))
    return oldValue<=0 && newValue>0;
  return true;
}

function flashItemTile(tile){
  // OBS CEF: skip the 1s flash animation — it feels like lag.
  if(document.body?.classList?.contains('stream-shell')
      || document.body?.classList?.contains('obs-mode')) return;
  tile.classList.remove('item-pickup-flash');
  void tile.offsetWidth;
  tile.classList.add('item-pickup-flash');
  setTimeout(()=>tile.classList.remove('item-pickup-flash'),1000);
}

function updateTile(def,value,oldValue=null){
  const tile=document.getElementById('tile-'+def.key);
  if(!tile) return;
  // Skip all DOM work when the value is unchanged (every poll used to
  // re-assign img.src and force CEF to re-decode sprites).
  if(oldValue!==null && oldValue!==undefined && oldValue===value
      && tile.dataset.itemValue===String(value)) return;

  let on;
  if(def.on) on=def.on(value);
  else on = value>0;
  tile.classList.toggle('on',on);
  tile.dataset.itemValue=String(value);
  const visual=resolveItemVisual(def,value);
  const img=tile.querySelector('.item-icon');
  if(img){
    const nextSrc=visual.icon;
    const cur=img.getAttribute('src') || '';
    // Only reassign when the file actually changes (progressive bow/sword/etc.).
    if(cur!==nextSrc && !cur.endsWith('/'+nextSrc.split('/').pop())){
      img.src=nextSrc;
    }
  }
  const label=tile.querySelector('.label');
  if(label && label.textContent!==visual.label) label.textContent=visual.label;
  const title=visual.label+(on?' — collected':' — not collected');
  if(tile.title!==title){
    tile.title=title;
    tile.setAttribute('aria-label',title);
  }

  if(itemValueAdvanced(def,oldValue,value)) flashItemTile(tile);
}

function updateUI(save){
  recordProgressiveSplits(save);
  recordDungeonPrizeClaim(save);

  if(typeof setPlayerMapSpriteArmor==='function')
    setPlayerMapSpriteArmor(save.armor);

  ALL_ITEMS.forEach(d=>{
    updateTile(d,save[d.key],previousItemValues?.[d.key]);
  });
  previousItemValues=Object.fromEntries(
    ALL_ITEMS.map(item=>[item.key,save[item.key]])
  );

  updateKeysanityPanel(save);
  if(typeof updateRainChip === "function") updateRainChip(save);
}

function buildKeysanityRow(key, abbr, mirrored=false){
  const row = document.createElement('div');
  row.className = 'keysanity-row' + (mirrored ? ' keysanity-row-mirror' : '');
  row.id = 'keysanity-' + key;
  row.dataset.dungeon = key;
  const maxKeys = DUNGEON_KEY_MAX[key] ?? 0;
  const abbrHtml = `<span class="keysanity-abbr" title="${key}">${abbr}</span>`;
  const keysHtml = `<span class="keysanity-keys" id="ks-keys-${key}" title="Small keys collected">
      <span class="ks-key-icon" aria-hidden="true">🔑</span>
      <span class="ks-key-count">0</span><span class="ks-key-max">/${maxKeys}</span>
    </span>`;
  // Left: BK Map Cmp — Right (mirrored): Cmp Map BK so flags face the items (stream)
  const flagsHtml = mirrored
    ? `<span class="keysanity-flags">
        <span class="ks-flag ks-comp" id="ks-comp-${key}" title="Compass">Cmp</span>
        <span class="ks-flag ks-map" id="ks-map-${key}" title="Map">Map</span>
        <span class="ks-flag ks-bk" id="ks-bk-${key}" title="Big Key">BK</span>
      </span>`
    : `<span class="keysanity-flags">
        <span class="ks-flag ks-bk" id="ks-bk-${key}" title="Big Key">BK</span>
        <span class="ks-flag ks-map" id="ks-map-${key}" title="Map">Map</span>
        <span class="ks-flag ks-comp" id="ks-comp-${key}" title="Compass">Cmp</span>
      </span>`;

  row.innerHTML = mirrored
    ? `${flagsHtml}${keysHtml}${abbrHtml}`
    : `${abbrHtml}${keysHtml}${flagsHtml}`;
  return row;
}

function initKeysanityPanel(){
  const left = document.getElementById('keysanityGrid');
  if(!left) return;
  const right = document.getElementById('keysanityGridRight');

  left.innerHTML = '';
  if(right) right.innerHTML = '';

  // Split the list in half when a right column exists (main tracker two-col
  // panel, or stream left/right of items). Stream mirrors the right column.
  const labels = DUNGEON_STAT_LABELS;
  const mid = right ? Math.ceil(labels.length / 2) : labels.length;
  const leftLabels = labels.slice(0, mid);
  const rightLabels = right ? labels.slice(mid) : [];
  const streamShell = document.body?.classList?.contains('stream-shell')
    || document.body?.classList?.contains('obs-mode');

  leftLabels.forEach(([key, , abbr])=>{
    left.appendChild(buildKeysanityRow(key, abbr, false));
  });
  rightLabels.forEach(([key, , abbr])=>{
    // Mirror flag order only on the stream overlay's right strip.
    right.appendChild(buildKeysanityRow(key, abbr, !!streamShell));
  });
}

function updateKeysanityPanel(save){
  if(!save) return;
  const panel = document.getElementById('keysanityPanel');
  if(!panel || panel.hidden) return;

  const keys = save.dungeonKeys || {};
  const bigKey = save.bigKey || {};
  const map = save.map || {};
  const compass = save.compass || {};

  DUNGEON_STAT_LABELS.forEach(([key])=>{
    const keyEl = document.getElementById('ks-keys-' + key);
    if(keyEl){
      const count = keys[key] || 0;
      const max = DUNGEON_KEY_MAX[key] ?? 0;
      const countSpan = keyEl.querySelector('.ks-key-count');
      const maxSpan = keyEl.querySelector('.ks-key-max');
      if(countSpan) countSpan.textContent = String(count);
      if(maxSpan) maxSpan.textContent = max > 0 ? `/${max}` : '';
      keyEl.classList.toggle('has-keys', count > 0);
      keyEl.classList.toggle('keys-full', max > 0 && count >= max);
    }

    const bk = document.getElementById('ks-bk-' + key);
    if(bk) bk.classList.toggle('on', !!bigKey[key]);
    const mapEl = document.getElementById('ks-map-' + key);
    if(mapEl) mapEl.classList.toggle('on', !!map[key]);
    const comp = document.getElementById('ks-comp-' + key);
    if(comp) comp.classList.toggle('on', !!compass[key]);
  });

  // Current-dungeon HUD keys (from $7EF36F) when indoors.
  const cur = document.getElementById('keysanityCurrentKeys');
  if(cur){
    const live = save.keys;
    if(live === 0xFF || live === undefined || live === null){
      cur.textContent = '—';
      cur.title = 'Not in a keyed dungeon';
    }else{
      cur.textContent = String(live);
      cur.title = 'Keys held in current dungeon (HUD)';
    }
  }
}

// Builds the static item grid and manual dungeon-prize controls. Called once
// from main.js on load.
function initItemGrid(){
  renderGrid(document.getElementById('gridAll'),ALL_ITEMS);
  applyItemDisplayMode(itemDisplayMode);
  applyItemToneMode(itemToneMode);

  document.getElementById('itemViewToggle').addEventListener('click',()=>{
    const next=itemDisplayMode==='detailed'?'compact':'detailed';
    localStorage.setItem('itemDisplayMode',next);
    applyItemDisplayMode(next);
  });

  document.getElementById('itemToneToggle').addEventListener('click',()=>{
    const next=itemToneMode==='smoked'?'bright':'smoked';
    localStorage.setItem('itemToneMode',next);
    applyItemToneMode(next);
  });

  initDungeonPrizeAssignments();
  initKeysanityPanel();
}
