/* ============================================================
   runData.js
   Central, race-legal run event recorder. It stores only events
   already observed by the tracker: item pickups, dungeon movement,
   completed dungeon counters, and claimed boss prizes.
   ============================================================ */

let runEventHistory=[];
let runEventSequence=0;
let runRecorderPreviousDungeon=undefined;
let runRecorderPreviousDungeonStats=null;
let runRecorderPreviousRegion=undefined;

function runRecordingActive(){
  return typeof timerAutoStarted!=='undefined' && timerAutoStarted;
}

function runEventTimerState(){
  if(typeof getTimerSnapshot==='function') return getTimerSnapshot();
  return {elapsedMs:0,elapsed:'00:00:00'};
}

function recordRunEvent(type,data={}){
  if(!runRecordingActive() && type!=='run_started') return null;
  if(typeof ensureActiveRunSession==='function') ensureActiveRunSession('event');
  const timer=runEventTimerState();
  const event={
    ...data,
    id:++runEventSequence,
    type,
    elapsedMs:timer.elapsedMs || 0,
    time:timer.elapsed || '00:00:00',
    recordedAt:Date.now()
  };
  runEventHistory.push(event);
  if(typeof scheduleRunSessionSave==='function') scheduleRunSessionSave();
  return event;
}

function trackDungeonTransition(currentDungeon){
  if(!runRecordingActive()) return;
  const current=currentDungeon || null;

  if(runRecorderPreviousDungeon===undefined){
    runRecorderPreviousDungeon=current;
    if(current){
      const data=DUNGEON_DATA[current];
      recordRunEvent('dungeon_entered',{
        dungeonKey:current,
        dungeon:data?.name || current,
        source:'initial sync'
      });
    }
    return;
  }

  if(current===runRecorderPreviousDungeon) return;

  if(runRecorderPreviousDungeon){
    const previousData=DUNGEON_DATA[runRecorderPreviousDungeon];
    recordRunEvent('dungeon_exited',{
      dungeonKey:runRecorderPreviousDungeon,
      dungeon:previousData?.name || runRecorderPreviousDungeon
    });
  }

  if(current){
    const data=DUNGEON_DATA[current];
    recordRunEvent('dungeon_entered',{
      dungeonKey:current,
      dungeon:data?.name || current
    });
  }

  runRecorderPreviousDungeon=current;
}

function trackDungeonProgress(stats){
  if(!stats || !runRecordingActive()) return;
  const current=Object.fromEntries(
    DUNGEON_STAT_LABELS.map(([key])=>[key,Number(stats[key]) || 0])
  );

  if(runRecorderPreviousDungeonStats){
    DUNGEON_STAT_LABELS.forEach(([key,name])=>{
      const total=DUNGEON_TOTALS[key] || 0;
      const previous=runRecorderPreviousDungeonStats[key] || 0;
      const found=current[key] || 0;
      if(total>0 && previous<total && found>=total){
        recordRunEvent('dungeon_completed',{
          dungeonKey:key,
          dungeon:name,
          found,
          total
        });
      }
    });
  }

  runRecorderPreviousDungeonStats=current;
}

function trackRegionTransition(region,world){
  if(!runRecordingActive() || !region) return;
  const current=`${world || 'unknown'}:${region}`;
  if(runRecorderPreviousRegion===undefined){
    runRecorderPreviousRegion=current;
    recordRunEvent('region_entered',{region,world:world || null,source:'initial sync'});
    return;
  }
  if(current===runRecorderPreviousRegion) return;
  runRecorderPreviousRegion=current;
  recordRunEvent('region_entered',{region,world:world || null});
}

function resetRunEventRecorder(){
  runEventHistory=[];
  runEventSequence=0;
  runRecorderPreviousDungeon=undefined;
  runRecorderPreviousDungeonStats=null;
  runRecorderPreviousRegion=undefined;
}

function getRunEventSnapshot(){
  return runEventHistory.map(event=>({...event}));
}

function restoreRunEventSnapshot(events){
  runEventHistory=Array.isArray(events)
    ? events.map(event=>({...event}))
    : [];
  runEventSequence=runEventHistory.reduce(
    (highest,event)=>Math.max(highest,Number(event.id) || 0),
    0
  );
  runRecorderPreviousDungeon=undefined;
  runRecorderPreviousDungeonStats=null;
  runRecorderPreviousRegion=undefined;
}
