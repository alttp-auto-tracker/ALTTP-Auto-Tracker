/* ============================================================
   report.js
   Builds a self-contained, offline HTML run report. No external
   scripts, styles, images, or network requests are required.
   ============================================================ */

function reportEscape(value){
  return String(value ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

function reportDisplayValue(value,fallback='—'){
  return value===null || value===undefined || value==='' ? fallback : value;
}

function reportModeLabel(kind, key){
  const maps={
    world:{standard:'Standard',open:'Open',inverted:'Inverted'},
    keys:{
      standard:'Standard keys',keysanity:'Keysanity',keys:'Keys only',
      mc:'Map / Compass',mcs:'Map / Compass / Small',mcbk:'Map / Compass / Big Key'
    },
    bosses:{normal:'Normal bosses',shuffled:'Boss shuffle'},
    entrances:{vanilla:'Vanilla entrances',shuffled:'Entrance shuffle'}
  };
  return maps[kind]?.[key] || key || '—';
}

function reportModesLine(modes){
  const m=modes || {};
  return [
    reportModeLabel('world', m.world),
    reportModeLabel('keys', m.keys),
    reportModeLabel('bosses', m.bosses),
    reportModeLabel('entrances', m.entrances)
  ].join(' · ');
}

function reportPrizeForDungeon(key){
  if(typeof dungeonPrizeAssignments==='undefined') return null;
  const prizeKey=dungeonPrizeAssignments[key];
  if(!prizeKey || prizeKey==='unknown') return null;
  return {
    key:prizeKey,
    label:getDungeonPrizeType(prizeKey).label,
    claimed:!!dungeonPrizeClaims?.[key]
  };
}

function collectRunReportData(){
  const timer=typeof getTimerSnapshot==='function'
    ? getTimerSnapshot()
    : {elapsedMs:0,elapsed:'00:00:00',splits:[],activity:[]};
  const events=typeof getRunEventSnapshot==='function'
    ? getRunEventSnapshot()
    : [];
  const save=TrackerState.save || {};
  const stats=TrackerState.dungeonStats || {};

  const dungeons=DUNGEON_STAT_LABELS.map(([key,name,abbr])=>{
    const found=Number(stats[key]) || 0;
    const total=DUNGEON_TOTALS[key] || 0;
    const prize=reportPrizeForDungeon(key);
    return {
      key,name,abbr,found,total,prize,
      status:total>0 && found>=total
        ? 'Complete'
        : found>0 ? 'In Progress' : 'Unvisited'
    };
  });

  const finalItems=ALL_ITEMS
    .map(item=>{
      const hasSavedValue=save[item.key]!==undefined && save[item.key]!==null;
      const value=Number(save[item.key]) || 0;
      const owned=hasSavedValue && (
        typeof item.on==='function' ? item.on(value) : value>0
      );
      return {
        key:item.key,
        value,
        owned,
        label:resolveItemVisual(item,value).label
      };
    })
    .filter(item=>item.owned)
    .map(({owned,...item})=>item);

  const pendantTotal=PENDANT_TYPES.filter(
    pendant=>!!((save.pendants || 0)&pendant.bit)
  ).length;
  const crystalTotal=crystalCount(save);
  const completedDungeons=dungeons.filter(dungeon=>dungeon.status==='Complete').length;
  const claimedPrizes=dungeons.filter(dungeon=>dungeon.prize?.claimed).length;
  const best=TrackerState.rankings?.[0] || null;
  const runMeta=typeof getActiveRunSessionMeta==='function'
    ? getActiveRunSessionMeta()
    : null;
  const notesText=typeof runMeta?.notes==='string'
    ? runMeta.notes
    : (typeof activeRunSession?.notes==='string' ? activeRunSession.notes : '');
  const notesUpdatedAt=runMeta?.notesUpdatedAt
    || activeRunSession?.notesUpdatedAt
    || null;

  return {
    schemaVersion:2,
    generatedAt:new Date().toISOString(),
    run:runMeta ? {...runMeta,notes:notesText,notesUpdatedAt} : null,
    notes:notesText,
    notesUpdatedAt,
    player:{
      name:TrackerState.playerName || save.playerName || 'LINK',
      sprite:typeof getPlayerSpriteDataUrl==='function'
        ? getPlayerSpriteDataUrl(8)
        : null
    },
    snapshot:{
      save:{...save},
      dungeonStats:{...stats},
      room:TrackerState.room || 0,
      area:TrackerState.area || 0,
      world:TrackerState.world || null,
      region:typeof playerRegion==='undefined' ? null : playerRegion
    },
    timer,
    seed:{
      code:currentSeedCode || '',
      permalink:currentPermalink || '',
      ...(currentSeedMeta || {})
    },
    event:{
      name:(typeof isRaceMode==='function' && isRaceMode() && typeof currentEventName==='function')
        ? currentEventName()
        : (typeof isRaceMode==='function' && isRaceMode() && typeof getEventNameInputValue==='function')
          ? getEventNameInputValue()
          : ''
    },
    tracker:{
      mode:typeof isRaceMode==='function' && isRaceMode() ? 'Race Legal' : 'Practice',
      connected:!!TrackerState.connected,
      currentDungeon:TrackerState.currentDungeon || null,
      bestPlay:best ? {
        key:best.key || null,
        name:best.name || '',
        score:Number(best.score) || 0,
        reason:best.reason || ''
      } : null
    },
    modes:{
      world:(typeof SETTINGS!=='undefined' && SETTINGS.worldMode) || 'open',
      keys:(typeof SETTINGS!=='undefined' && SETTINGS.keysMode) || 'standard',
      bosses:(typeof SETTINGS!=='undefined' && SETTINGS.bossMode) || 'normal',
      entrances:(typeof SETTINGS!=='undefined' && SETTINGS.entranceMode) || 'vanilla'
    },
    medallions:{
      miseryMire:typeof mmMedallion==='undefined' ? 'unknown' : mmMedallion,
      turtleRock:typeof trMedallion==='undefined' ? 'unknown' : trMedallion
    },
    totals:{
      pendants:pendantTotal,
      crystals:crystalTotal,
      completedDungeons,
      claimedPrizes
    },
    finalItems,
    dungeons,
    events
  };
}

function reportEventDescription(event){
  switch(event.type){
    case 'timer_start': return 'Run timer started';
    case 'timer_pause': return `Timer paused${event.reason?` — ${event.reason}`:''}`;
    case 'timer_resume': return `Timer resumed${event.reason?` — ${event.reason}`:''}`;
    case 'timer_finish': return 'Run marked complete by runner';
    case 'item_pickup': return `Picked up ${event.item || 'item'}`;
    case 'region_entered': return `Entered ${event.region || 'region'}${event.world?` (${event.world} world)`:''}`;
    case 'dungeon_entered': return `Entered ${event.dungeon || event.dungeonKey}`;
    case 'dungeon_exited': return `Exited ${event.dungeon || event.dungeonKey}`;
    case 'dungeon_completed': return `Completed ${event.dungeon || event.dungeonKey}`;
    case 'prize_claimed': return `Claimed ${event.prize || 'prize'} at ${event.dungeon || event.dungeonKey}`;
    default: return event.label || event.type;
  }
}

function reportEventClass(event){
  if(event.type==='item_pickup') return 'item';
  if(event.type==='prize_claimed' || event.type==='dungeon_completed') return 'milestone';
  if(event.type.startsWith('timer_')) return 'timer';
  return 'route';
}

function buildRunReport(reportData=null){
  const data=reportData || (typeof collectRunReportData==='function' ? collectRunReportData() : null);
  if(!data || typeof data!=='object'){
    throw new Error('No report data available for this run.');
  }
  const timer=data.timer && typeof data.timer==='object'
    ? data.timer
    : {elapsedMs:0,elapsed:'00:00:00',running:false,started:false,status:'—',splits:[],activity:[]};
  const seed=data.seed && typeof data.seed==='object' ? data.seed : {};
  const tracker=data.tracker && typeof data.tracker==='object' ? data.tracker : {};
  const medallions=data.medallions && typeof data.medallions==='object'
    ? data.medallions
    : {miseryMire:'—',turtleRock:'—'};
  const totals=data.totals && typeof data.totals==='object'
    ? data.totals
    : {pendants:0,crystals:0,completedDungeons:0,claimedPrizes:0};
  const dungeons=Array.isArray(data.dungeons) ? data.dungeons : [];
  const events=Array.isArray(data.events) ? data.events : [];
  // Prefer stored modes; fall back to live SETTINGS so older runs still render.
  const modes={
    world:data.modes?.world || (typeof SETTINGS!=='undefined' && SETTINGS.worldMode) || 'open',
    keys:data.modes?.keys || (typeof SETTINGS!=='undefined' && SETTINGS.keysMode) || 'standard',
    bosses:data.modes?.bosses || (typeof SETTINGS!=='undefined' && SETTINGS.bossMode) || 'normal',
    entrances:data.modes?.entrances || (typeof SETTINGS!=='undefined' && SETTINGS.entranceMode) || 'vanilla'
  };
  data.modes=modes;
  data.timer=timer;
  data.seed=seed;
  data.tracker=tracker;
  data.medallions=medallions;
  data.totals=totals;
  data.dungeons=dungeons;
  data.events=events;
  data.finalItems=Array.isArray(data.finalItems) ? data.finalItems : [];
  data.player=data.player && typeof data.player==='object' ? data.player : {name:'LINK'};
  if(!Array.isArray(timer.splits)) timer.splits=[];
  if(!Array.isArray(timer.activity)) timer.activity=[];

  const storedStatus=data.run?.status;
  const runStatus=storedStatus==='completed'
    ? 'Completed'
    : storedStatus==='unfinished'
      ? 'Unfinished'
      : timer.running
        ? 'Active'
        : timer.started ? reportDisplayValue(timer.status,'Stopped') : 'Not Started';
  const generated=new Date(data.generatedAt || Date.now()).toLocaleString();

  const eventName=data.event?.name || '';
  const seedFields=[
    ['Seed',seed.code],['Event',eventName || null],
    ['Goal',seed.goal],
    ['Logic',seed.logic],['Difficulty',seed.difficulty],
    ['Weapons',seed.weapons],['World State',seed.state],
    ['Variation',seed.variation],['Hints',seed.hints],
    ['Player',data.player?.name],['Tracker Mode',tracker.mode],
    ['World',reportModeLabel('world', modes.world)],
    ['Keys',reportModeLabel('keys', modes.keys)],
    ['Bosses',reportModeLabel('bosses', modes.bosses)],
    ['Entrances',reportModeLabel('entrances', modes.entrances)],
    ['Misery Mire',medallions.miseryMire],
    ['Turtle Rock',medallions.turtleRock]
  ];

  const seedGrid=seedFields
    .filter(([label,value])=>!(label==='Event' && (value===null || value===undefined || value==='')))
    .map(([label,value])=>`
    <div class="detail">
      <span>${reportEscape(label)}</span>
      <strong>${reportEscape(reportDisplayValue(value))}</strong>
    </div>`).join('');

  const routeEvents=data.events.filter(event=>event.type==='dungeon_entered');
  const routeHtml=routeEvents.length
    ? routeEvents.map((event,index)=>`
        <div class="route-stop">
          <span class="route-number">${index+1}</span>
          <div><strong>${reportEscape(event.dungeon)}</strong><time>${reportEscape(event.time)}</time></div>
        </div>`).join('')
    : '<p class="empty">No dungeon entries were recorded.</p>';

  const visibleEvents=data.events.filter(event=>event.type!=='dungeon_exited');
  const timelineHtml=visibleEvents.length
    ? visibleEvents.map(event=>`
        <div class="timeline-event ${reportEventClass(event)}">
          <time>${reportEscape(event.time)}</time>
          <span>${reportEscape(reportEventDescription(event))}</span>
        </div>`).join('')
    : '<p class="empty">No run events were recorded.</p>';

  const splitRows=timer.splits?.length
    ? timer.splits.map((split,index)=>`
        <tr><td>${index+1}</td><td>${reportEscape(split.time)}</td><td>${reportEscape(split.item)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty-cell">No progressive item pickups were recorded.</td></tr>';

  const dungeonRows=data.dungeons.map(dungeon=>{
    const prize=dungeon.prize
      ? `${dungeon.prize.label}${dungeon.prize.claimed?' ✓':''}`
      : '—';
    const statusClass=dungeon.status==='Complete'
      ? 'complete'
      : dungeon.status==='In Progress' ? 'progress' : '';
    return `<tr>
      <td><strong>${reportEscape(dungeon.abbr)}</strong><small>${reportEscape(dungeon.name)}</small></td>
      <td>${dungeon.found} / ${dungeon.total}</td>
      <td>${reportEscape(prize)}</td>
      <td><span class="status ${statusClass}">${reportEscape(dungeon.status)}</span></td>
    </tr>`;
  }).join('');

  const activityRows=timer.activity?.length
    ? timer.activity.map(event=>`
        <tr><td>${reportEscape(event.time)}</td><td>${reportEscape(event.type)}</td><td>${reportEscape(reportDisplayValue(event.reason))}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty-cell">No timer activity was recorded.</td></tr>';

  const itemHtml=data.finalItems.length
    ? data.finalItems.map(item=>`<span class="item-chip">${reportEscape(item.label)}</span>`).join('')
    : '<span class="empty">No final inventory was available.</span>';

  const notesText=(typeof data.notes==='string' && data.notes.trim())
    ? data.notes.trim()
    : (typeof data.run?.notes==='string' ? data.run.notes.trim() : '');
  const notesUpdatedRaw=data.notesUpdatedAt || data.run?.notesUpdatedAt || null;
  let notesUpdatedLabel='';
  if(notesUpdatedRaw){
    const notesDate=new Date(notesUpdatedRaw);
    if(!Number.isNaN(notesDate.getTime())) notesUpdatedLabel=notesDate.toLocaleString();
  }
  const notesSection=notesText ? `
  <section class="notes-section">
    <h2>Runner Notes</h2>
    ${notesUpdatedLabel ? `<div class="notes-updated">Updated ${reportEscape(notesUpdatedLabel)}</div>` : ''}
    <div class="notes-body">${reportEscape(notesText).replace(/\n/g,'<br>')}</div>
  </section>` : '';

  const certificateAvailable=storedStatus==='completed';
  const completedAt=new Date(data.run?.updatedAt || data.generatedAt);
  const certificateDate=Number.isNaN(completedAt.getTime())
    ? generated
    : completedAt.toLocaleDateString(undefined,{
        year:'numeric',month:'long',day:'numeric'
      });
  const modesLine=reportModesLine(data.modes);
  const certificateMarkup=certificateAvailable ? `
    <article class="certificate-card" aria-label="Run completion certificate">
      <div class="certificate-frame">
        <div class="certificate-ornament" aria-hidden="true"></div>
        <div class="certificate-kicker">A Link to the Past Randomizer</div>
        <div class="certificate-emblem" aria-hidden="true">◆</div>
        <h2 id="certificateTitle">Run Completion Certificate</h2>
        ${data.player?.sprite
          ? `<img class="certificate-sprite" src="${data.player.sprite}" alt="${reportEscape(data.player?.name || 'LINK')}'s player sprite" width="128" height="192" />`
          : ''}
        <p class="certificate-presented">Presented to</p>
        <strong class="certificate-player">${reportEscape(data.player?.name || 'LINK')}</strong>
        <p class="certificate-copy">for defeating Ganon and entering the Triforce chamber</p>
        <div class="certificate-time-block">
          <span class="certificate-time-label">Final time</span>
          <div class="certificate-time">${reportEscape(timer.elapsed)}</div>
        </div>
        <p class="certificate-modes">${reportEscape(modesLine)}</p>
        ${eventName ? `<p class="certificate-event">${reportEscape(eventName)}</p>` : ''}
        <div class="certificate-details">
          <div><span>Seed</span><strong>${reportEscape(data.seed.code || 'Unspecified')}</strong></div>
          <div><span>Tracker</span><strong>${reportEscape(reportDisplayValue(data.tracker.mode))}</strong></div>
          <div><span>World</span><strong>${reportEscape(reportModeLabel('world', data.modes?.world))}</strong></div>
          <div><span>Keys</span><strong>${reportEscape(reportModeLabel('keys', data.modes?.keys))}</strong></div>
          <div><span>Bosses</span><strong>${reportEscape(reportModeLabel('bosses', data.modes?.bosses))}</strong></div>
          <div><span>Entrances</span><strong>${reportEscape(reportModeLabel('entrances', data.modes?.entrances))}</strong></div>
        </div>
        <div class="certificate-footer">
          <span>${reportEscape(certificateDate)}</span>
          <span>ALTTP-AUTO-TRACKER</span>
        </div>
        <div class="certificate-ornament certificate-ornament-bottom" aria-hidden="true"></div>
      </div>
    </article>` : '';
  const certificateToolbarButton=certificateAvailable
    ? '<button type="button" onclick="showCertificate()">Certificate</button>'
    : '';
  const certificateCallout=certificateAvailable ? `
    <section class="certificate-callout">
      <div>
        <h2>Run Complete</h2>
        <p>Your completion certificate is ready to view, print, or save as a one-page PDF.</p>
      </div>
      <button type="button" onclick="showCertificate()">View Certificate</button>
    </section>` : '';
  const certificateModal=certificateAvailable ? `
    <div class="certificate-modal" id="certificateModal" hidden role="dialog" aria-modal="true" aria-labelledby="certificateTitle" onclick="if(event.target===this)hideCertificate()">
      <div class="certificate-dialog">
        <div class="certificate-actions">
          <span>Completion Certificate</span>
          <button type="button" onclick="printCertificate()">Print / Save PDF</button>
          <button type="button" class="certificate-close" onclick="hideCertificate()" aria-label="Close certificate">Close</button>
        </div>
        ${certificateMarkup}
      </div>
    </div>` : '';

  const rawJson=JSON.stringify(data,null,2).replace(/</g,'\\u003c');
  const safeSeed=reportEscape(data.seed.code || 'Run');
  const fileSeed=String(data.seed.code || 'Run')
    .replace(/[^a-z0-9_-]+/gi,'-')
    .replace(/^-+|-+$/g,'') || 'Run';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ALTTPR Run Report — ${safeSeed}</title>
<style>
:root{--bg:#100e1c;--panel:#1b1830;--panel2:#241f3d;--line:#383256;--gold:#d8b45c;--teal:#5aa78f;--rose:#c1626b;--violet:#8b7fc9;--text:#ece7f7;--dim:#948da8;}
*{box-sizing:border-box}body{margin:0;padding:28px;background:radial-gradient(ellipse at top,#1c1733 0%,transparent 58%),var(--bg);color:var(--text);font-family:Segoe UI,system-ui,sans-serif;line-height:1.4}
body.light{--bg:#f3f0f8;--panel:#fff;--panel2:#f4f0fb;--line:#d4cce3;--text:#201b31;--dim:#6d6679;background:#f3f0f8}
.wrap{max-width:1120px;margin:auto}.toolbar{display:flex;justify-content:flex-end;align-items:center;gap:7px;margin-bottom:10px;flex-wrap:wrap}.print-hint{margin-right:auto;color:var(--dim);font-size:.66rem}button{cursor:pointer;border:1px solid var(--line);border-radius:6px;background:var(--panel2);color:var(--text);padding:7px 11px;font-weight:700}button:hover{border-color:var(--gold);color:var(--gold)}
header{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;padding:22px;border:1px solid var(--line);border-radius:12px;background:var(--panel);box-shadow:0 14px 40px rgba(0,0,0,.24)}h1{margin:0;color:var(--gold);font-size:1.35rem;letter-spacing:.12em;text-transform:uppercase}.subtitle{margin-top:5px;color:var(--dim);font-size:.82rem}.run-time{color:var(--teal);font:700 2.1rem ui-monospace,Menlo,monospace;text-align:right}.run-status{color:var(--dim);font-size:.72rem;text-align:right;text-transform:uppercase;letter-spacing:.1em}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}.card,section,.report-section{border:1px solid var(--line);border-radius:10px;background:var(--panel)}.card{padding:12px}.card span{display:block;color:var(--dim);font-size:.65rem;text-transform:uppercase;letter-spacing:.08em}.card strong{display:block;margin-top:3px;color:var(--text);font-size:1.05rem}section,.report-section{margin-top:12px}section{padding:16px}h2,.section-title{color:var(--gold);font-size:.72rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase}h2{margin:0 0 12px}
.report-section{overflow:hidden}.report-section summary{display:flex;align-items:center;gap:10px;padding:14px 16px;cursor:pointer;list-style:none;user-select:none}.report-section summary::-webkit-details-marker{display:none}.report-section summary:hover{background:var(--panel2)}.report-section summary::after{content:'+';display:grid;place-items:center;width:20px;height:20px;margin-left:2px;border:1px solid var(--line);border-radius:5px;color:var(--gold);font-weight:800}.report-section[open] summary::after{content:'−'}.report-section[open] summary{border-bottom:1px solid var(--line)}.section-count{margin-left:auto;color:var(--dim);font-size:.66rem}.report-section-body{padding:14px 16px 16px}
.details{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.detail{padding:8px;border-radius:6px;background:var(--panel2)}.detail span{display:block;color:var(--dim);font-size:.6rem;text-transform:uppercase}.detail strong{font-size:.78rem;word-break:break-word}.permalink{margin-top:9px;color:var(--dim);font-size:.7rem;word-break:break-all}
.route{display:flex;gap:7px;overflow-x:auto;padding-bottom:4px}.route-stop{display:flex;align-items:center;gap:7px;flex:0 0 auto;min-width:120px;padding:8px;border:1px solid var(--line);border-radius:7px;background:var(--panel2)}.route-number{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--line);color:var(--gold);font-size:.65rem;font-weight:800}.route-stop strong,.route-stop time{display:block}.route-stop strong{font-size:.7rem}.route-stop time{color:var(--teal);font:600 .63rem ui-monospace,Menlo,monospace}
.timeline{display:grid;gap:5px}.timeline-event{display:grid;grid-template-columns:74px 1fr;gap:10px;padding:7px 9px;border-left:3px solid var(--line);border-radius:4px;background:var(--panel2);font-size:.73rem}.timeline-event time{color:var(--teal);font-family:ui-monospace,Menlo,monospace}.timeline-event.item{border-color:var(--violet)}.timeline-event.milestone{border-color:var(--gold)}.timeline-event.timer{border-color:var(--teal)}
table{width:100%;border-collapse:collapse;font-size:.73rem}th,td{padding:8px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--dim);font-size:.6rem;letter-spacing:.08em;text-transform:uppercase}td small{display:block;color:var(--dim)}.status{color:var(--dim)}.status.progress{color:var(--gold)}.status.complete{color:var(--teal)}.item-list{display:flex;flex-wrap:wrap;gap:6px}.item-chip{padding:5px 8px;border:1px solid var(--line);border-radius:999px;background:var(--panel2);font-size:.68rem}.empty,.empty-cell{color:var(--dim);font-style:italic}.empty-cell{text-align:center}
.notes-section{border-color:rgba(158,201,255,.35)}.notes-updated{margin:0 0 8px;color:var(--dim);font-size:.66rem}.notes-body{padding:12px 14px;border-radius:8px;background:var(--panel2);color:var(--text);font-size:.82rem;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.two{display:grid;grid-template-columns:1.15fr .85fr;gap:12px;align-items:start}.footer{margin:14px 0;color:var(--dim);font-size:.65rem;text-align:center}
.certificate-callout{display:flex;align-items:center;justify-content:space-between;gap:20px;border-color:rgba(216,180,92,.7);background:linear-gradient(120deg,rgba(216,180,92,.13),transparent 58%),var(--panel)}.certificate-callout h2{margin-bottom:4px}.certificate-callout p{margin:0;color:var(--dim);font-size:.75rem}.certificate-modal{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:24px;background:rgba(5,4,10,.88);backdrop-filter:blur(8px);overflow:auto}.certificate-modal[hidden]{display:none}.certificate-dialog{width:min(100%,1000px)}.certificate-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:9px}.certificate-actions>span{margin-right:auto;color:var(--gold);font-size:.7rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.certificate-card{aspect-ratio:11/8.5;padding:18px;border:2px solid var(--gold);border-radius:12px;background:radial-gradient(circle at 50% 12%,rgba(216,180,92,.16),transparent 40%),var(--panel);box-shadow:0 24px 70px rgba(0,0,0,.48)}.certificate-frame{display:flex;min-height:100%;flex-direction:column;align-items:center;justify-content:center;padding:5%;border:1px solid rgba(216,180,92,.62);outline:1px solid rgba(216,180,92,.22);outline-offset:-8px;text-align:center}.certificate-kicker{color:var(--dim);font-size:.68rem;font-weight:800;letter-spacing:.28em;text-transform:uppercase}.certificate-emblem{display:grid;place-items:center;width:42px;height:42px;margin:10px 0;color:var(--gold);border:1px solid var(--gold);transform:rotate(45deg);font-size:1rem}.certificate-emblem::first-letter{transform:rotate(-45deg)}.certificate-card h2{margin:2px 0 12px;font-family:Georgia,serif;font-size:1.75rem;letter-spacing:.08em}.certificate-sprite{width:64px;height:96px;margin:2px 0 8px;image-rendering:pixelated;image-rendering:crisp-edges;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))}.certificate-presented,.certificate-copy{margin:0;color:var(--dim);font-family:Georgia,serif;font-style:italic}.certificate-player{margin:4px 0;color:var(--text);font-family:Georgia,serif;font-size:2.35rem;line-height:1.1}.certificate-time-block{margin:16px 0 10px;text-align:center}
.certificate-time-label{display:block;color:var(--dim);font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;margin-bottom:4px}
.certificate-time{margin:0;color:var(--teal);font:800 2.35rem ui-monospace,Menlo,monospace;letter-spacing:.04em}
.certificate-modes{margin:0 0 8px;max-width:min(100%,760px);color:var(--gold);font-size:.78rem;font-weight:600;letter-spacing:.04em;text-align:center;line-height:1.35}
.certificate-event{margin:0 0 14px;max-width:min(100%,760px);color:var(--teal);font-size:.85rem;font-weight:700;letter-spacing:.03em;text-align:center}
.certificate-ornament{width:min(100%,420px);height:1px;margin:0 auto 12px;background:linear-gradient(90deg,transparent,var(--gold),transparent);opacity:.7}
.certificate-ornament-bottom{margin:16px auto 0}
.certificate-frame{position:relative}
.certificate-kicker{letter-spacing:.18em}.certificate-details{display:grid;width:min(100%,760px);grid-template-columns:repeat(6,1fr);gap:7px}.certificate-details div{padding:7px;border:1px solid var(--line);border-radius:6px;background:var(--panel2)}.certificate-details span,.certificate-details strong{display:block}.certificate-details span{color:var(--dim);font-size:.55rem;letter-spacing:.08em;text-transform:uppercase}.certificate-details strong{margin-top:2px;font-size:.68rem;word-break:break-word}.certificate-footer{display:flex;width:min(100%,760px);justify-content:space-between;gap:20px;margin-top:18px;padding-top:9px;border-top:1px solid var(--line);color:var(--dim);font-size:.62rem;letter-spacing:.05em}.certificate-open{overflow:hidden}
@media(max-width:760px){body{padding:12px}header{align-items:flex-start;flex-direction:column}.run-time,.run-status{text-align:left}.summary,.details{grid-template-columns:repeat(2,1fr)}.two{grid-template-columns:1fr}.certificate-callout{align-items:flex-start;flex-direction:column}.certificate-modal{padding:10px}.certificate-card{aspect-ratio:auto}.certificate-frame{padding:28px 16px}.certificate-player{font-size:1.7rem}.certificate-details{grid-template-columns:repeat(2,1fr)}.certificate-footer{align-items:center;flex-direction:column;gap:4px}.certificate-actions{flex-wrap:wrap}}
@page certificate{size:letter landscape;margin:0}
@media print{@page{margin:0}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{padding:12mm;color:var(--text)!important}.toolbar{display:none!important}.card,section,.report-section,header{box-shadow:none}.card,header,.route-stop,.timeline-event,tr{break-inside:avoid}.wrap{max-width:none}.report-section:not([open])>.report-section-body{display:block!important}.report-section summary{break-after:avoid}body.certificate-print{padding:0!important}body.certificate-print>.wrap{display:none!important}body.certificate-print .certificate-modal{position:static;display:block!important;min-height:100vh;padding:0;background:var(--bg);backdrop-filter:none}body.certificate-print .certificate-dialog{width:100%;max-width:none}body.certificate-print .certificate-actions{display:none!important}body.certificate-print .certificate-card{page:certificate;width:100%;height:100vh;min-height:0;aspect-ratio:auto;border-radius:0;box-shadow:none}}
</style>
</head>
<body>
<div class="wrap">
  <div class="toolbar">
    <span class="print-hint">PDF keeps the current theme and expands every section.</span>
    <button id="themeButton" type="button" onclick="toggleTheme()">Light Theme</button>
    <button type="button" onclick="setAllSections(true)">Expand All</button>
    <button type="button" onclick="setAllSections(false)">Collapse All</button>
    <button type="button" onclick="downloadJson()">Download JSON</button>
    ${certificateToolbarButton}
    <button type="button" onclick="printReport()">Print / Save PDF</button>
  </div>
  <header>
    <div><h1>ALTTPR Run Report</h1><div class="subtitle">${reportEscape(data.player?.name || 'LINK')} • ${reportEscape(data.seed.code || 'Unspecified seed')} • Generated ${reportEscape(generated)}</div></div>
    <div><div class="run-time">${reportEscape(timer.elapsed)}</div><div class="run-status">${reportEscape(runStatus)}</div></div>
  </header>
  <div class="summary">
    <div class="card"><span>Crystals</span><strong>${data.totals.crystals} / 7</strong></div>
    <div class="card"><span>Pendants</span><strong>${data.totals.pendants} / 3</strong></div>
    <div class="card"><span>Dungeons Complete</span><strong>${data.totals.completedDungeons} / ${data.dungeons.length}</strong></div>
    <div class="card"><span>Prizes Claimed</span><strong>${data.totals.claimedPrizes} / 10</strong></div>
  </div>
  ${certificateCallout}
  <section><h2>Seed &amp; Run Settings</h2><div class="details">${seedGrid}</div>${data.seed.permalink?`<div class="permalink">${reportEscape(data.seed.permalink)}</div>`:''}</section>
  ${notesSection}
  <section><h2>Dungeon Route</h2><div class="route">${routeHtml}</div></section>
  <div class="two">
    <details class="report-section"><summary><span class="section-title">Run Timeline</span><span class="section-count">${visibleEvents.length} events</span></summary><div class="report-section-body"><div class="timeline">${timelineHtml}</div></div></details>
    <details class="report-section"><summary><span class="section-title">Final Inventory</span><span class="section-count">${data.finalItems.length} items</span></summary><div class="report-section-body"><div class="item-list">${itemHtml}</div></div></details>
  </div>
  <details class="report-section" open><summary><span class="section-title">Progressive Item Splits</span><span class="section-count">${timer.splits?.length || 0} pickups</span></summary><div class="report-section-body"><table><thead><tr><th>#</th><th>Time</th><th>Item</th></tr></thead><tbody>${splitRows}</tbody></table></div></details>
  <details class="report-section" open><summary><span class="section-title">Dungeon Results</span><span class="section-count">${data.totals.completedDungeons} / ${data.dungeons.length} complete</span></summary><div class="report-section-body"><table><thead><tr><th>Dungeon</th><th>Checks</th><th>Prize</th><th>Status</th></tr></thead><tbody>${dungeonRows}</tbody></table></div></details>
  <details class="report-section"><summary><span class="section-title">Timer Activity</span><span class="section-count">${timer.activity?.length || 0} events</span></summary><div class="report-section-body"><table><thead><tr><th>Time</th><th>Event</th><th>Reason</th></tr></thead><tbody>${activityRows}</tbody></table></div></details>
  <div class="footer">Generated locally by ALTTP-AUTO-TRACKER. No seed spoiler information is included.</div>
</div>
${certificateModal}
<script type="application/json" id="runData">${rawJson}</script>
<script>
function toggleTheme(){
  document.body.classList.toggle('light');
  document.getElementById('themeButton').textContent=document.body.classList.contains('light')?'Dark Theme':'Light Theme';
}
function reportSections(){
  return Array.from(document.querySelectorAll('details.report-section'));
}
function setAllSections(open){
  reportSections().forEach(function(section){section.open=open;});
}
let printSectionState=null;
function showCertificate(){
  const modal=document.getElementById('certificateModal');
  if(!modal) return;
  modal.hidden=false;
  document.body.classList.add('certificate-open');
  modal.querySelector('.certificate-close').focus();
}
function hideCertificate(){
  const modal=document.getElementById('certificateModal');
  if(!modal) return;
  modal.hidden=true;
  document.body.classList.remove('certificate-open');
}
function printReport(){
  document.body.classList.remove('certificate-print');
  window.print();
}
function printCertificate(){
  showCertificate();
  document.body.classList.add('certificate-print');
  window.print();
}
window.addEventListener('beforeprint',function(){
  if(document.body.classList.contains('certificate-open')){
    document.body.classList.add('certificate-print');
    return;
  }
  if(printSectionState===null)
    printSectionState=reportSections().map(function(section){return section.open;});
  setAllSections(true);
});
window.addEventListener('afterprint',function(){
  if(document.body.classList.contains('certificate-print')){
    document.body.classList.remove('certificate-print');
    return;
  }
  if(printSectionState===null) return;
  reportSections().forEach(function(section,index){
    section.open=printSectionState[index];
  });
  printSectionState=null;
});
window.addEventListener('keydown',function(event){
  if(event.key==='Escape') hideCertificate();
});
function downloadJson(){
  const text=document.getElementById('runData').textContent;
  const blob=new Blob([text],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download='ALTTPR_${fileSeed}_run-data.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
</script>
</body>
</html>`;
}
