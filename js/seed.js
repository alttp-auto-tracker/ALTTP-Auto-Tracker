/* ============================================================
   seed.js
   Seed loader — pulls settings from alttpr.com's seed data.
   NOTE: this calls the public S3 bucket the site's own frontend
   reads from (https://alttpr-patch-data.s3.us-east-2.amazonaws.com/{code}.json),
   which allows cross-origin browser fetches; the old alttpr.com/api/h/{code}
   endpoint doesn't exist.
   For race/tournament seeds, that data intentionally withholds
   spoiler data (that's the point of a race rom), so medallion
   info won't be available there — that's expected, not a bug.
   For normal/practice seeds it should come through.
   ============================================================ */

let currentPermalink = "";
let currentSeedCode = "";
let currentSeedMeta = {};

function extractSeedCode(input){
  const trimmed=input.trim();
  const parts=trimmed.split('/').filter(Boolean);
  return parts[parts.length-1];
}

async function loadSeed(rawInput){
  const code=extractSeedCode(rawInput);
  currentPermalink = rawInput.trim();
  currentSeedCode = code;
  const info=document.getElementById('seedInfo');
  if(!code){ info.textContent='Enter a seed code or permalink first.'; return; }
  info.textContent='Fetching seed '+code+'...';
  log('Fetching seed data for '+code);
  let json;
  try{
    const res=await fetch('https://alttpr-patch-data.s3.us-east-2.amazonaws.com/'+encodeURIComponent(code)+'.json');
    if(!res.ok) throw new Error('HTTP '+res.status);
    json=await res.json();
  }catch(e){
    info.textContent='Could not fetch seed data ('+e.message+'). This can happen if the seed code is wrong, the seed has expired, or your browser blocked the cross-origin request. Set medallions manually below.';
    log('Seed fetch failed: '+e.message,'err');
    return;
  }
  log('Seed data received — inspect the console/log for full shape if auto-fill misses anything.');
  // Try a few plausible locations for medallion info depending on
  // spoiler visibility. If none match, we say so rather than guess.
  const spoiler = json.spoiler || {};
  const meta = spoiler.meta || json.meta || {};
  currentSeedMeta = {
    mode: meta.mode || "",
    goal: meta.goal || "",
    logic: meta.logic || "",
    difficulty: meta.difficulty || "",
    variation: meta.variation || "",
    weapons: meta.weapons || "",
    state: meta.state || "",
    hints: meta.hints || ""
  };
  const candidatesMM = [meta.mm_medallion, meta['Misery Mire'], spoiler.Misery_Mire, json.mm_medallion];
  const candidatesTR = [meta.tr_medallion, meta['Turtle Rock'], spoiler.Turtle_Rock, json.tr_medallion];
  const normalize = v => {
    if(!v) return null;
    const s=String(v).toLowerCase();
    if(s.includes('bombos')) return 'bombos';
    if(s.includes('ether')) return 'ether';
    if(s.includes('quake')) return 'quake';
    return null;
  };
  const mm = candidatesMM.map(normalize).find(Boolean);
  const tr = candidatesTR.map(normalize).find(Boolean);
  if(mm){ mmMedallion=mm; document.getElementById('mmMed').value=mm; }
  if(tr){ trMedallion=tr; document.getElementById('trMed').value=tr; }
  if(lastState) updateMap(lastState);
  if(mm||tr){
    info.textContent='Loaded — Misery Mire: '+(mm||'unknown')+', Turtle Rock: '+(tr||'unknown')+'.';
    log('Medallions auto-filled from seed data','ok');
  }else{
    info.textContent='Seed loaded, but no medallion info was in the response (likely a race/tournament seed). Set them manually below.';
    log('No medallion fields found in seed response — set manually');
  }

  // Practice helper: import full placement list when the seed includes spoilers.
  if(typeof ingestSpoilerFromSeedJson==='function'){
    try{
      const got=ingestSpoilerFromSeedJson(json, code);
      if(got){
        info.textContent=(info.textContent||'')+' Spoiler placements imported for Practice route.';
        log('Spoiler placements imported from seed','ok');
      }
    }catch(e){
      log('Spoiler import skipped: '+(e.message||e));
    }
  }
}

// Wires up the "Load" button. Called once from main.js on load.
function initSeed(){
  document.getElementById('loadSeedBtn').addEventListener('click',()=>{
    loadSeed(document.getElementById('seedCode').value);
  });
}
