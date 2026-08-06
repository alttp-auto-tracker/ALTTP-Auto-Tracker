/* ============================================================
   comparison.js
   Builds a self-contained comparison from two saved run records.
   Run A is the baseline; negative Run B deltas mean B was faster.
   ============================================================ */

function comparisonTime(ms){
  return typeof formatTime==='function'
    ? formatTime(Math.max(0,Number(ms) || 0))
    : '00:00:00';
}

function comparisonRunName(record,index){
  return record?.playerName || record?.reportData?.player?.name || `Run ${index+1}`;
}

function comparisonDate(record){
  const value=record?.createdAt || record?.reportData?.generatedAt;
  const date=new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}

function comparisonPauseMetrics(data){
  const activity=Array.isArray(data?.timer?.activity) ? data.timer.activity : [];
  let pausedAt=null;
  let pauseMs=0;
  let count=0;
  activity.forEach(event=>{
    if(event.type==='pause' && pausedAt===null){
      pausedAt=Number(event.recordedAt) || null;
      count+=1;
    }else if((event.type==='resume' || event.type==='finish') && pausedAt!==null){
      const resumedAt=Number(event.recordedAt) || pausedAt;
      pauseMs+=Math.max(0,resumedAt-pausedAt);
      pausedAt=null;
    }
  });
  return {count,pauseMs};
}

function comparisonPickupMap(data){
  const pickups=new Map();
  const events=Array.isArray(data?.events) ? data.events : [];
  events.filter(event=>event.type==='item_pickup').forEach(event=>{
    const item=event.item || 'Item';
    if(!pickups.has(item)) pickups.set(item,Number(event.elapsedMs) || 0);
  });
  if(!pickups.size){
    (data?.timer?.splits || []).forEach(split=>{
      const item=split.item || 'Item';
      if(!pickups.has(item)) pickups.set(item,Number(split.elapsedMs) || 0);
    });
  }
  return pickups;
}

function comparisonRoute(data){
  return (data?.events || [])
    .filter(event=>event.type==='dungeon_entered')
    .map(event=>({
      name:event.dungeon || event.dungeonKey || 'Dungeon',
      elapsedMs:Number(event.elapsedMs) || 0
    }));
}

function comparisonDelta(a,b){
  if(a===null || a===undefined || b===null || b===undefined){
    return {text:'—',className:''};
  }
  const delta=Number(b)-Number(a);
  if(delta===0) return {text:'Even',className:'even'};
  return {
    text:`${delta<0?'−':'+'}${comparisonTime(Math.abs(delta))}`,
    className:delta<0?'gain':'loss'
  };
}

function comparisonSummary(record){
  const data=record.reportData || {};
  const pause=comparisonPauseMetrics(data);
  const pickups=comparisonPickupMap(data);
  const dungeons=Array.isArray(data.dungeons) ? data.dungeons : [];
  return {
    elapsedMs:Number(data.timer?.elapsedMs ?? record.elapsedMs) || 0,
    pauseCount:pause.count,
    pauseMs:pause.pauseMs,
    pickupCount:pickups.size,
    completedDungeons:dungeons.filter(dungeon=>dungeon.status==='Complete').length,
    claimedPrizes:dungeons.filter(dungeon=>dungeon.prize?.claimed).length,
    pickups,
    route:comparisonRoute(data)
  };
}

function comparisonInsightHtml(a,b,summaryA,summaryB){
  const insights=[];
  const totalDelta=summaryB.elapsedMs-summaryA.elapsedMs;
  if(totalDelta===0){
    insights.push('Both runs have the same recorded active time.');
  }else{
    const faster=totalDelta<0 ? comparisonRunName(b,1) : comparisonRunName(a,0);
    insights.push(`${faster} was faster overall by ${comparisonTime(Math.abs(totalDelta))}.`);
  }

  const shared=[];
  summaryA.pickups.forEach((time,item)=>{
    if(summaryB.pickups.has(item)) shared.push({
      item,
      delta:summaryB.pickups.get(item)-time
    });
  });
  const gains=shared.filter(entry=>entry.delta<0).sort((x,y)=>x.delta-y.delta);
  const losses=shared.filter(entry=>entry.delta>0).sort((x,y)=>y.delta-x.delta);
  if(gains[0]) insights.push(`Biggest Run B gain: ${gains[0].item}, ${comparisonTime(Math.abs(gains[0].delta))} earlier.`);
  if(losses[0]) insights.push(`Biggest Run B loss: ${losses[0].item}, ${comparisonTime(losses[0].delta)} later.`);

  const routeA=summaryA.route.map(stop=>stop.name).join(' > ');
  const routeB=summaryB.route.map(stop=>stop.name).join(' > ');
  if(routeA && routeB){
    insights.push(routeA===routeB
      ? 'Both runs used the same recorded dungeon order.'
      : 'The recorded dungeon order changed between runs.');
  }
  return insights.map(text=>`<li>${reportEscape(text)}</li>`).join('');
}

function buildRunComparison(records){
  if(!Array.isArray(records) || records.length!==2){
    throw new Error('Choose exactly two runs to compare.');
  }
  const [a,b]=records;
  const dataA=a.reportData || {};
  const dataB=b.reportData || {};
  const summaryA=comparisonSummary(a);
  const summaryB=comparisonSummary(b);
  const nameA=comparisonRunName(a,0);
  const nameB=comparisonRunName(b,1);
  const seedA=dataA.seed?.code || 'Unknown seed';
  const seedB=dataB.seed?.code || 'Unknown seed';
  const sameSeed=seedA!=='Unknown seed' && seedA===seedB;
  const totalDelta=comparisonDelta(summaryA.elapsedMs,summaryB.elapsedMs);

  const metrics=[
    ['Active time',comparisonTime(summaryA.elapsedMs),comparisonTime(summaryB.elapsedMs),totalDelta],
    ['Pause count',summaryA.pauseCount,summaryB.pauseCount,{text:String(summaryB.pauseCount-summaryA.pauseCount),className:summaryB.pauseCount<summaryA.pauseCount?'gain':summaryB.pauseCount>summaryA.pauseCount?'loss':'even'}],
    ['Paused wall time',comparisonTime(summaryA.pauseMs),comparisonTime(summaryB.pauseMs),comparisonDelta(summaryA.pauseMs,summaryB.pauseMs)],
    ['Recorded pickups',summaryA.pickupCount,summaryB.pickupCount,{text:String(summaryB.pickupCount-summaryA.pickupCount),className:'even'}],
    ['Dungeons complete',summaryA.completedDungeons,summaryB.completedDungeons,{text:String(summaryB.completedDungeons-summaryA.completedDungeons),className:'even'}],
    ['Prizes claimed',summaryA.claimedPrizes,summaryB.claimedPrizes,{text:String(summaryB.claimedPrizes-summaryA.claimedPrizes),className:'even'}]
  ];
  const metricRows=metrics.map(([label,valueA,valueB,delta])=>`<tr>
    <th>${reportEscape(label)}</th><td>${reportEscape(valueA)}</td><td>${reportEscape(valueB)}</td>
    <td class="delta ${delta.className}">${reportEscape(delta.text)}</td>
  </tr>`).join('');

  const pickupNames=Array.from(new Set([...summaryA.pickups.keys(),...summaryB.pickups.keys()]))
    .sort((x,y)=>Math.min(summaryA.pickups.get(x) ?? Infinity,summaryB.pickups.get(x) ?? Infinity)-Math.min(summaryA.pickups.get(y) ?? Infinity,summaryB.pickups.get(y) ?? Infinity));
  const pickupRows=pickupNames.length ? pickupNames.map(item=>{
    const timeA=summaryA.pickups.has(item) ? summaryA.pickups.get(item) : null;
    const timeB=summaryB.pickups.has(item) ? summaryB.pickups.get(item) : null;
    const delta=comparisonDelta(timeA,timeB);
    return `<tr><th>${reportEscape(item)}</th><td>${timeA===null?'—':comparisonTime(timeA)}</td><td>${timeB===null?'—':comparisonTime(timeB)}</td><td class="delta ${delta.className}">${reportEscape(delta.text)}</td></tr>`;
  }).join('') : '<tr><td colspan="4" class="empty">No comparable pickups were recorded.</td></tr>';

  const routeColumn=(route,label)=>route.length
    ? `<div class="route-column"><h3>${reportEscape(label)}</h3>${route.map((stop,index)=>`<div class="route-stop"><b>${index+1}</b><span>${reportEscape(stop.name)}</span><time>${comparisonTime(stop.elapsedMs)}</time></div>`).join('')}</div>`
    : `<div class="route-column"><h3>${reportEscape(label)}</h3><p class="empty">No dungeon entries recorded.</p></div>`;

  const dungeonsA=new Map((dataA.dungeons || []).map(dungeon=>[dungeon.key,dungeon]));
  const dungeonsB=new Map((dataB.dungeons || []).map(dungeon=>[dungeon.key,dungeon]));
  const dungeonKeys=Array.from(new Set([...dungeonsA.keys(),...dungeonsB.keys()]));
  const dungeonRows=dungeonKeys.map(key=>{
    const left=dungeonsA.get(key);
    const right=dungeonsB.get(key);
    const label=left?.abbr || right?.abbr || key;
    const progress=entry=>entry ? `${entry.found} / ${entry.total} · ${entry.status}` : '—';
    const prize=entry=>entry?.prize ? `${entry.prize.label}${entry.prize.claimed?' ✓':''}` : '—';
    return `<tr><th>${reportEscape(label)}</th><td>${reportEscape(progress(left))}<small>${reportEscape(prize(left))}</small></td><td>${reportEscape(progress(right))}<small>${reportEscape(prize(right))}</small></td></tr>`;
  }).join('');

  const rawJson=JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),runs:[dataA,dataB]},null,2).replace(/</g,'\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ALTTPR Run Comparison — ${reportEscape(nameA)} vs ${reportEscape(nameB)}</title>
<style>
:root{--bg:#100e1c;--panel:#1b1830;--panel2:#241f3d;--line:#383256;--gold:#d8b45c;--teal:#5aa78f;--rose:#c1626b;--text:#ece7f7;--dim:#948da8}*{box-sizing:border-box}body{margin:0;padding:26px;background:radial-gradient(ellipse at top,#1c1733 0%,transparent 58%),var(--bg);color:var(--text);font-family:Segoe UI,system-ui,sans-serif;line-height:1.4}body.light{--bg:#f3f0f8;--panel:#fff;--panel2:#f4f0fb;--line:#d4cce3;--text:#201b31;--dim:#6d6679;background:#f3f0f8}.wrap{max-width:1120px;margin:auto}.toolbar{display:flex;justify-content:flex-end;gap:7px;margin-bottom:10px}.toolbar button{cursor:pointer;border:1px solid var(--line);border-radius:6px;background:var(--panel2);color:var(--text);padding:7px 11px;font-weight:700}.hero,section{border:1px solid var(--line);border-radius:11px;background:var(--panel)}.hero{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:20px;padding:20px}.run{text-align:center}.run span,.run small{display:block;color:var(--dim)}.run strong{display:block;color:var(--gold);font-size:1.15rem}.run time{display:block;margin:5px 0;color:var(--teal);font:700 1.7rem ui-monospace,Menlo,monospace}.versus{color:var(--dim);font-weight:800}.notice{margin:10px 0 0;padding:9px 12px;border:1px solid var(--gold);border-radius:7px;color:var(--gold);font-size:.72rem}section{margin-top:12px;padding:15px}h2{margin:0 0 11px;color:var(--gold);font-size:.72rem;letter-spacing:.12em;text-transform:uppercase}h3{margin:0 0 8px;color:var(--dim);font-size:.65rem;text-transform:uppercase}table{width:100%;border-collapse:collapse;font-size:.74rem}th,td{padding:8px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--dim)}thead th{font-size:.6rem;letter-spacing:.08em;text-transform:uppercase}td small{display:block;color:var(--dim)}.delta{font-family:ui-monospace,Menlo,monospace}.delta.gain{color:var(--teal)}.delta.loss{color:var(--rose)}.delta.even{color:var(--dim)}.route-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.route-column{padding:10px;border-radius:8px;background:var(--panel2)}.route-stop{display:grid;grid-template-columns:22px 1fr auto;align-items:center;gap:7px;padding:6px;border-bottom:1px solid var(--line);font-size:.7rem}.route-stop b{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--line);color:var(--gold)}.route-stop time{color:var(--teal);font-family:ui-monospace,Menlo,monospace}.insights{margin:0;padding-left:19px}.insights li{margin:5px 0;font-size:.75rem}.empty{color:var(--dim);font-style:italic;text-align:center}.footer{margin:14px 0;color:var(--dim);font-size:.65rem;text-align:center}@media(max-width:700px){body{padding:10px}.hero{grid-template-columns:1fr}.versus{text-align:center}.route-grid{grid-template-columns:1fr}th,td{padding:6px;font-size:.65rem}}@media print{body{padding:0;background:#fff;color:#111}.toolbar{display:none}.hero,section{break-inside:avoid;box-shadow:none}}
</style></head><body><div class="wrap">
<div class="toolbar"><button onclick="document.body.classList.remove('light')">Dark</button><button onclick="document.body.classList.add('light')">Light</button><button onclick="window.print()">Print / PDF</button></div>
<div class="hero"><div class="run"><span>Run A · Baseline</span><strong>${reportEscape(nameA)}</strong><time>${comparisonTime(summaryA.elapsedMs)}</time><small>${reportEscape(seedA)} · ${reportEscape(comparisonDate(a))}</small></div><div class="versus">VS</div><div class="run"><span>Run B · Comparison</span><strong>${reportEscape(nameB)}</strong><time>${comparisonTime(summaryB.elapsedMs)}</time><small>${reportEscape(seedB)} · ${reportEscape(comparisonDate(b))}</small></div></div>
${sameSeed?'':`<p class="notice">Different seeds detected. Timing still reveals habits and routing patterns, but item-location luck makes this unsuitable as a strict PB comparison.</p>`}
<section><h2>At a Glance</h2><table><thead><tr><th>Metric</th><th>Run A</th><th>Run B</th><th>Run B vs A</th></tr></thead><tbody>${metricRows}</tbody></table></section>
<section><h2>What Changed</h2><ul class="insights">${comparisonInsightHtml(a,b,summaryA,summaryB)}</ul></section>
<section><h2>Pickup Timing</h2><table><thead><tr><th>Pickup</th><th>Run A</th><th>Run B</th><th>Run B vs A</th></tr></thead><tbody>${pickupRows}</tbody></table></section>
<section><h2>Dungeon Route</h2><div class="route-grid">${routeColumn(summaryA.route,'Run A')}${routeColumn(summaryB.route,'Run B')}</div></section>
<section><h2>Dungeon Results</h2><table><thead><tr><th>Dungeon</th><th>Run A</th><th>Run B</th></tr></thead><tbody>${dungeonRows}</tbody></table></section>
<p class="footer">Generated locally by ALTTP-AUTO-TRACKER. Negative Run B deltas mean Run B was faster.</p>
<script type="application/json" id="comparison-data">${rawJson}</script></div></body></html>`;
}

function comparisonFilename(records){
  const names=records.map((record,index)=>comparisonRunName(record,index).replace(/[^a-z0-9_-]+/gi,'-') || `Run-${index+1}`);
  return `ALTTPR_Comparison_${names[0]}_vs_${names[1]}_${new Date().toISOString().slice(0,10)}.html`;
}

function openRunComparison(records){
  openStandaloneHtmlPreview(
    buildRunComparison(records),
    'Your browser blocked the comparison preview. Use Download Comparison instead.'
  );
}

function downloadRunComparison(records){
  const blob=new Blob([buildRunComparison(records)],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=comparisonFilename(records);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
