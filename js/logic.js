/* ============================================================
   logic.js
   Dungeon evaluation engine.

   Determines how valuable each dungeon currently is based on
   remaining checks, progression opportunities, boss status,
   prize status, and eventually room-by-room tracking.
   ============================================================ */
   
 /* ============================================================
   Engine Helpers
   ============================================================ */

function createDungeonResult(){

    return{

        score:0,

        remaining:0,

        accessible:0,

        blocked:[],

facts:[],
why:[],

availableLocations:[],

availableLocationsExact:false,

blockedLocations:[],

        missing:[],

        state:"gray",

        title:"",

        reason:"",

        complete:false,

        timeEstimate:null

    };

} 


function estimateDungeonTime(key, dungeon){

    const profile = DUNGEON_TIME_PROFILES[key];
    const total = DUNGEON_TOTALS[key] || 0;
    const remaining = Math.max(
        0,
        Math.min(total, Number(dungeon.remaining) || 0)
    );

    if(dungeon.complete || remaining === 0){

        return {
            scope:"complete",
            low:0,
            high:0,
            midpoint:0,
            label:"Complete"
        };

    }

    if(
        dungeon.state === "gray" &&
        dungeon.blockedLocations?.length
    ){

        return {
            scope:"blocked",
            low:null,
            high:null,
            midpoint:null,
            label:"No checks available now"
        };

    }

    if(dungeon.state === "gray"){

        return {
            scope:"blocked",
            low:null,
            high:null,
            midpoint:null,
            label:"Entry blocked"
        };

    }

    if(!profile || total === 0){

        return null;

    }

    const hasInternalBlockers =
        dungeon.blockedLocations?.length > 0;

    const accessible = hasInternalBlockers
        ? Math.max(
            0,
            Math.min(remaining, Number(dungeon.accessible) || 0)
        )
        : remaining;

    if(accessible === 0){

        return {
            scope:"blocked",
            low:null,
            high:null,
            midpoint:null,
            label:"No checks available now"
        };

    }

    const ratio = accessible / total;

    const low = Math.max(
        1,
        Math.ceil(
            profile.reentry[0] +
            (profile.full[0] - profile.reentry[0]) * ratio
        )
    );

    const high = Math.max(
        low,
        Math.ceil(
            profile.reentry[1] +
            (profile.full[1] - profile.reentry[1]) * ratio
        )
    );

    const scope = hasInternalBlockers
        ? "available"
        : "clear";

    return {
        scope,
        low,
        high,
        midpoint:(low + high) / 2,
        checks:accessible,
        label:
            low + "–" + high + " min " +
            (scope === "clear" ? "to clear" : "available now")
    };

}


function scoreToStars(score){

    if(score >= 90) return "★★★★★";

    if(score >= 75) return "★★★★☆";

    if(score >= 60) return "★★★☆☆";

    if(score >= 40) return "★★☆☆☆";

    if(score >= 20) return "★☆☆☆☆";

    return "☆☆☆☆☆";

}   









function evaluateLocations(list, save, checkedCount=0, dungeonKey=null){


    if (!Array.isArray(list)) {
     
        return {
            score: 0,
            available: 0,
            unlocked: 0,
            availableLocations: [],
            availableLocationsExact: false,
            blocked: []
        };
    }
let score = 0;
let unlocked = 0;

const unlockedLocations = [];
const blocked = [];

    for(const location of list){

const requires = typeof getEffectiveLocationRequires === "function"
    ? getEffectiveLocationRequires(location, dungeonKey)
    : (location.requires || []);

if(hasRequirements(save, requires, dungeonKey)){

    unlocked++;
    score += location.weight;

    unlockedLocations.push(location.name);

}else{

  blocked.push({

    location: location.name,

    priority: location.priority || 0,

    requires: requires.map(r =>
        formatRequirementName(r)
    )

});

        }

    }

blocked.sort(

    (a,b)=>b.priority-a.priority

);

const checked = Math.max(
    0,
    Math.min(list.length, Number(checkedCount) || 0)
);

const available = Math.max(0, unlocked - checked);
const availableLocationsExact = checked === 0;

return{

    score,

    available,

    unlocked,

    availableLocations:availableLocationsExact
        ? unlockedLocations
        : [],

    availableLocationsExact,

    blocked

};

}
   
   

function formatRequirementName(req){
    if(typeof req === "string" && req.startsWith("dungeonKeys")){
        const n = Number(req.slice("dungeonKeys".length));
        if(Number.isFinite(n) && n > 0){
            return n === 1 ? "1 Small Key" : `${n} Small Keys`;
        }
    }
    return (typeof REQUIREMENT_NAMES !== "undefined" && REQUIREMENT_NAMES[req]) || req;
}

const REQUIREMENT_NAMES = {

    bow: "Bow",

    hammer: "Hammer",

    hookshot: "Hookshot",

    lamp: "Lamp",

    mirror: "Magic Mirror",

    flippers: "Flippers",

    moonpearl: "Moon Pearl",

    lightWorldAccess: "Light World Access",

    rainCleared: "Rescue Zelda (end rain)",

    dungeonBigKey: "Big Key",

    firerod: "Fire Rod",

    icerod: "Ice Rod",

    somaria: "Cane of Somaria",

    byrna: "Cane of Byrna",

    cape: "Magic Cape",

    boots: "Pegasus Boots",

    gloves: "Power Glove",
    gloves2: "Titan's Mitts",
    book: "Book",
    bombs: "Bombs",
    sword: "Sword",
    sword2: "Master Sword",
    darkAccess: "Dark World Access",
    flute: "Activated Flute",
    crystals7: "7 Crystals",
    deathMountain: "Death Mountain Access",
    deathMountainSummit: "Death Mountain Summit Access",
    eastDeathMountain: "East Death Mountain Access",
    darkDeathMountainWest: "West Dark Death Mountain Access",
    darkDeathMountainTop: "East Dark Death Mountain Access",
    turtleRockEntry: "Turtle Rock Entrance Access",
    fire: "Lamp or Fire Rod",
    melt: "Fire Rod or Bombos",
    combat: "Combat Weapon",
    rangedCombat: "Ranged Attack",
    crystalSwitch: "Crystal Switch Item",
    spikeSafe: "Byrna or Cape",
    eyeBridgeSafe: "Byrna, Cape, or Mirror Shield",
    bootsOrHookshot: "Boots or Hookshot",
    hookshotOrBoots: "Hookshot or Boots",
    somariaOrHookshot: "Somaria or Hookshot",
    bombsOrSomaria: "Bombs or Somaria",
    desertEntry: "Book or Power Glove",
    desertClear: "Book, Glove, Boots, Fire, and Combat",
    heraEntry: "Death Mountain and Hera Access",
    agaEntry: "Master Sword or Cape",
    mireMedallion: "Misery Mire Medallion",
    turtleMedallion: "Turtle Rock Medallion"

};  



   
 
   
/* ============================================================
   Generic Engine
   ============================================================ */

function computeDungeonScore(info){

    let score = 0;

    // Can't enter? Don't recommend it.
    if(!info.canEnter || info.accessibleChecks <= 0){

        return 0;

    }

    // Accessible checks are the biggest factor.
    score += info.accessibleChecks * 20;

    // Remaining value.
    score += info.remainingChecks * 5;

    // Boss available?
    if(info.bossAvailable){

        score += 15;

    }

    // Crystal dungeons matter.
    if(info.prize === "crystal"){

        score += 20;

    }

    // Green pendant is valuable.
    if(info.prize === "greenPendant"){

        score += 15;

    }

    return score;

}




const DUNGEON_EVALUATORS = Object.fromEntries(
    Object.keys(DUNGEON_DATA).map(key=>[
        key,
        (save,found)=>evaluateConfiguredDungeon(key,save,found)
    ])
);

function evaluateConfiguredDungeon(key,save,found){
    const data=DUNGEON_DATA[key];
    const total=DUNGEON_TOTALS[key] || data.locations.length;
    const checked=Math.max(0,Math.min(total,Number(found) || 0));
    const remaining=total-checked;
    const dungeon=createDungeonResult();
    dungeon.prize=data.prize || null;

    dungeon.remaining=remaining;
    if(remaining<=0){
        dungeon.complete=true;
        dungeon.state="gray";
        dungeon.title="Complete";
        dungeon.reason="All checks finished";
        dungeon.facts.push("Dungeon complete");
        return dungeon;
    }

    if(!canEnterDungeon(key,save)){
        dungeon.state="gray";
        dungeon.title="Cannot Enter";
        dungeon.missing=getMissingDungeonRequirements(key,save);
        dungeon.reason="Need " + dungeon.missing.join(", ");
        dungeon.blockedLocations=data.locations.map(location=>({
            name:location.name,
            requires:[...dungeon.missing]
        }));
        return dungeon;
    }

    const result=evaluateLocations(data.locations,save,checked,key);
    dungeon.accessible=result.available;
    dungeon.availableLocations=[...result.availableLocations];
    dungeon.availableLocationsExact=result.availableLocationsExact;
    dungeon.facts.push(remaining + " Checks Remaining");

    result.blocked.forEach(blocked=>{
        dungeon.blockedLocations.push({
            name:blocked.location,
            requires:blocked.requires
        });
        blocked.requires.forEach(item=>{
            if(!dungeon.missing.includes(item)) dungeon.missing.push(item);
        });
    });

    if(result.available>0){
        addWhy(dungeon,result.available + " Accessible Checks");
    }

    if(data.prize === "crystal"){
        addWhy(dungeon,"Crystal Dungeon");
    }else if(data.prize === "greenPendant"){
        addWhy(dungeon,"Green Pendant");
    }

    const boss=data.locations.find(location=>location.id==="boss");
    const bossRequires = boss
      ? (typeof getEffectiveLocationRequires === "function"
          ? getEffectiveLocationRequires(boss, key)
          : boss.requires)
      : [];
    const bossAvailable=!boss || hasRequirements(save, bossRequires, key);
    dungeon.score=computeDungeonScore({
        canEnter:true,
        accessibleChecks:result.available,
        remainingChecks:remaining,
        bossAvailable,
        prize:data.prize || null
    });

    if(result.available<=0){
        dungeon.state="gray";
        dungeon.title="Blocked Inside";
    }else if(dungeon.score>=90){
        dungeon.state="red";
        dungeon.title="Excellent";
    }else if(dungeon.score>=50){
        dungeon.state="yellow";
        dungeon.title="Good Value";
    }else{
        dungeon.state="green";
        dungeon.title="Low Value";
    }

    dungeon.reason=dungeon.missing.length
        ? "Need " + dungeon.missing.join(", ")
        : result.available + " Accessible Checks";

    // Practice-only: deeper small-key layout graph for coaching text / scoring.
    // Race Legal keeps the simple threshold model above (no extra facts).
    if(typeof isRaceMode === "function" && !isRaceMode() &&
       typeof analyzeDungeonKeyGraph === "function" &&
       typeof isSmallKeysShuffled === "function" && isSmallKeysShuffled()){
        const keyGraph = analyzeDungeonKeyGraph(key, save);
        dungeon.keyGraph = keyGraph;
        if(keyGraph.active){
            keyGraph.facts.forEach(fact => addDungeonFact(dungeon, fact));
            if(keyGraph.nextKeyGate){
                addWhy(
                    dungeon,
                    keyGraph.nextKeyGate.shortBy === 1
                        ? "1 key from next door (" + keyGraph.nextKeyGate.name + ")"
                        : keyGraph.nextKeyGate.shortBy + " keys from next door (" + keyGraph.nextKeyGate.name + ")"
                );
            }
            if(keyGraph.keysShortForBoss === 0 && keyGraph.bossKeysNeeded > 0){
                addWhy(dungeon, "Boss key count met");
            }
            // Prefer dungeons where one more key opens a gate, or boss keys are close.
            if(keyGraph.nextKeyGate && keyGraph.nextKeyGate.shortBy === 1){
                dungeon.score += 8;
            }else if(keyGraph.keysShortForBoss > 0 && keyGraph.keysShortForBoss <= 2){
                dungeon.score += 5;
            }
            // Re-title if score crossed a band after key-graph boost.
            if(result.available > 0){
                if(dungeon.score >= 90){
                    dungeon.state = "red";
                    dungeon.title = "Excellent";
                }else if(dungeon.score >= 50){
                    dungeon.state = "yellow";
                    dungeon.title = "Good Value";
                }else{
                    dungeon.state = "green";
                    dungeon.title = "Low Value";
                }
            }
            if(keyGraph.summary && result.available <= 0 && keyGraph.blockedByKeysOnly.length){
                dungeon.reason = keyGraph.summary;
            }
        }
    }

    return dungeon;
}

function evaluateDungeon(key, save, found){

    const evaluator = DUNGEON_EVALUATORS[key];

    if(!evaluator){

        console.warn("No evaluator for", key);

        return createDungeonResult();

    }

    const dungeon = evaluator(save, found);

const canUseRouteBonus =
    !dungeon.complete &&
    dungeon.state !== "gray" &&
    dungeon.accessible > 0;

const routeBonus = canUseRouteBonus
    ? getRegionBonus(key)
    : 0;

dungeon.routeBonus = routeBonus;

if(routeBonus >= 20){

    addWhy(
        dungeon,
        "Already in this region"
    );

}
else if(routeBonus >= 10){

    addWhy(
        dungeon,
        "Near your current route"
    );

}

dungeon.score += routeBonus;

dungeon.timeEstimate = estimateDungeonTime(
    key,
    dungeon
);

    return dungeon;

}


function addDungeonFact(dungeon, fact){

    if(isRaceMode()){

        if(
            fact.includes("Crystal") ||
            fact.includes("Pendant")
        ){
            return;
        }

    }

    dungeon.facts.push(fact);

}


function addWhy(dungeon, reason){

    if(!dungeon.why.includes(reason)){

        dungeon.why.push(reason);

    }

}

/* ------------------------------------------------------------
   Generic dungeon evaluator
   ------------------------------------------------------------ */

function evaluateGenericDungeon(key, save, found){

    const dungeon = createDungeonResult();

    const total = DUNGEON_TOTALS[key];

    dungeon.remaining = total - found;
    dungeon.accessible = dungeon.remaining;
    dungeon.score = dungeon.remaining * 10;

    if(canEnterDungeon(key, save)){

        if(dungeon.remaining > 3){

            dungeon.state = "red";
            dungeon.title = "Worth Clearing";

        }
        else if(dungeon.remaining > 0){

            dungeon.state = "yellow";
            dungeon.title = "Finish Soon";

        }
        else{

            dungeon.state = "green";
            dungeon.title = "Complete";
            dungeon.complete = true;

        }

    }else{

        const missing = getMissingDungeonRequirements(key, save);

        dungeon.state = "gray";
        dungeon.title = "Cannot Enter";
        dungeon.score = 0;
        dungeon.accessible = 0;

        dungeon.reason =
            "Need " + missing.join(", ");

        dungeon.missing = missing;

    }

    if(!dungeon.complete && dungeon.state !== "gray"){

        dungeon.reason =
            dungeon.remaining + " checks remaining";

        dungeon.facts.push(
            dungeon.remaining + " checks remaining"
        );
addWhy(
    dungeon,
    `${dungeon.remaining} Checks Remaining`
);

    }

    return dungeon;

}


/* ============================================================
   Dungeon Evaluators
   ============================================================ */





function evaluateEP(save, found){

    const total = DUNGEON_TOTALS.easternPalace;
    const checked = Math.max(
        0,
        Math.min(total, Number(found) || 0)
    );
    const remaining = total - checked;

    const dungeon = createDungeonResult();

    dungeon.remaining = remaining;

if(remaining <= 0){

    dungeon.score = 0;
    dungeon.state = "gray";
    dungeon.title = "Complete";
    dungeon.reason = "All checks finished";
    dungeon.complete = true;

    dungeon.facts.push("Dungeon complete");

    return dungeon;

}

    // Evaluate every location in Eastern Palace
    const result = evaluateLocations(
        DUNGEON_DATA.easternPalace.locations,
        save,
        checked,
        "easternPalace"
    );
	
	dungeon.availableLocations = [...result.availableLocations];
	dungeon.availableLocationsExact =
	    result.availableLocationsExact;
	if(result.available > 0){

addWhy(
    dungeon,
    result.available +
    " Accessible Checks"
);
}

    //------------------------------------------------------
    // Recommendation facts
    //------------------------------------------------------




dungeon.facts.push(remaining + " Checks Remaining");

    if(DUNGEON_DATA.easternPalace.prize === "crystal"){

        addDungeonFact(dungeon, "Crystal Dungeon");
		addWhy(
    dungeon,
    "Crystal Dungeon"
);

    }

    if(result.blocked.length){

        result.blocked.forEach(blockedLocation => {

            dungeon.blockedLocations.push({

                name:blockedLocation.location,

                requires:blockedLocation.requires

            });

            blockedLocation.requires.forEach(item=>{

                if(!dungeon.missing.includes(item)){
                    dungeon.missing.push(item);
                }

            });

        });

    }else{

    addDungeonFact(dungeon, "Boss Available");

}

const info = {

    canEnter: true,

    accessibleChecks: result.available,

    remainingChecks: remaining,

    bossAvailable: result.blocked.length === 0,

    prize: DUNGEON_DATA.easternPalace.prize

};

let score = computeDungeonScore(info);
    //------------------------------------------------------
    // Score → Title
    //------------------------------------------------------

    let state = "green";
    let title = "Low Value";

  if(result.available === 0 && result.blocked.length){

    state = "gray";
    title = "Blocked Inside";

}
else if(score >= 90){

    state = "red";
    title = "Excellent";

}
else if(score >= 50){

    state = "yellow";
    title = "Good Value";

}

    //------------------------------------------------------
    // Short recommendation text
    //------------------------------------------------------

let reason;

if(dungeon.missing.length){

    reason =
        "Need " +
        dungeon.missing.join(", ");

}else{

    reason =
        result.available +
        " Accessible Checks";

}

    //------------------------------------------------------
    // Return recommendation
    //------------------------------------------------------

dungeon.score = score;
dungeon.accessible = result.available;

dungeon.state = state;
dungeon.title = title;
dungeon.reason = reason;

return dungeon;

}

/* ============================================================
   Generic dungeon evaluators
   ============================================================ */

function evaluateHC(save, found){

    return evaluateGenericDungeon(
        "hyruleCastle",
        save,
        found
    );

}

function evaluateDP(save, found){

    return evaluateGenericDungeon(
        "desertPalace",
        save,
        found
    );

}

function evaluateToH(save, found){

    return evaluateGenericDungeon(
        "towerOfHera",
        save,
        found
    );

}

function evaluateAT(save, found){

    return evaluateGenericDungeon(
        "agahnimsTower",
        save,
        found
    );

}

function evaluatePoD(save, found){

    return evaluateGenericDungeon(
        "palaceOfDarkness",
        save,
        found
    );

}

function evaluateSP(save, found){

    return evaluateGenericDungeon(
        "swampPalace",
        save,
        found
    );

}

function evaluateSW(save, found){

    return evaluateGenericDungeon(
        "skullWoods",
        save,
        found
    );

}

function evaluateTT(save, found){

    return evaluateGenericDungeon(
        "thievesTown",
        save,
        found
    );

}

function evaluateIP(save, found){

    return evaluateGenericDungeon(
        "icePalace",
        save,
        found
    );

}

function evaluateMM(save, found){

    return evaluateGenericDungeon(
        "miseryMire",
        save,
        found
    );

}

function evaluateTR(save, found){

    return evaluateGenericDungeon(
        "turtleRock",
        save,
        found
    );

}

function evaluateGT(save, found){

    return evaluateGenericDungeon(
        "ganonsTower",
        save,
        found
    );

}





function getBestDungeon(){

    if(TrackerState.currentDungeon){
        const current = TrackerState.rankings.find(
            dungeon => dungeon.key === TrackerState.currentDungeon
        );

        if(current){
            return current;
        }
    }

    return getRankedPlayableDungeons(1)[0] || null;

}


function getRankedPlayableDungeons(limit=Infinity){

    return TrackerState.rankings
        .filter(dungeon =>
            !dungeon.complete &&
            dungeon.accessible > 0 &&
            dungeon.score > 0
        )
        .slice(0,limit);

}
