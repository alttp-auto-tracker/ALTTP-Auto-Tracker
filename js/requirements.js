/* ============================================================
   requirements.js
   Shared item, dungeon-entry, and full-clear requirement checks.

   Branches on SETTINGS.worldMode (standard / open / inverted) and
   SETTINGS.bossMode (normal / shuffled). Race-legal: items + public
   rules only — no spoilers.
   ============================================================ */

function getWorldMode(){
  return (typeof SETTINGS !== "undefined" && SETTINGS.worldMode) || "open";
}

function isInvertedWorld(){
  return getWorldMode() === "inverted";
}

function isStandardWorld(){
  return getWorldMode() === "standard";
}

function isBossShuffle(){
  return typeof SETTINGS !== "undefined" && SETTINGS.bossMode === "shuffled";
}

function isEntranceShuffle(){
  return typeof SETTINGS !== "undefined" && SETTINGS.entranceMode === "shuffled";
}

/* Requirements that still apply at a dungeon door under entrance shuffle
   (medallion plaques, GT crystal door). Overworld path gates are dropped. */
const ENTRANCE_DOOR_REQUIREMENTS = new Set([
  "mireMedallion",
  "turtleMedallion",
  "crystals7",
  "sword",
  "rainCleared"
]);

function hasMoonPearl(s){
  return !!(s && s.moonpearl > 0);
}

/* ---- Standard rain-state ----
   World State = Standard keeps the vanilla prologue (Uncle → HC → Zelda →
   Sanctuary). Until Zelda is delivered, the overworld is still in the intro
   "rain" sequence and most of Hyrule is not freely reachable.

   SRAM $7EF3C5 (save.progress):
     0 = in bed / start
     1 = Uncle item taken
     2 = Zelda rescued (rain ends)
     3 = Agahnim 1 defeated

   Open and Inverted skip the prologue entirely.
*/
function hasClearedRain(s){
  if(!isStandardWorld()) return true;
  return (Number(s?.progress) || 0) >= 2;
}

function isRainState(s){
  return isStandardWorld() && !hasClearedRain(s);
}

/* Locations still reachable while rain is active (the escape corridor). */
const RAIN_ALLOWED_LOCATION_IDS = new Set([
  "link_uncle",
  "escape_sewers",
  "sanctuary",
  "links_house"
]);

/* Dungeons reachable during rain — only Hyrule Castle / Sewers. */
const RAIN_ALLOWED_DUNGEON_KEYS = new Set([
  "hyruleCastle"
]);

function isAllowedDuringRain(locationId){
  return RAIN_ALLOWED_LOCATION_IDS.has(locationId);
}

function isDungeonAllowedDuringRain(dungeonKey){
  return RAIN_ALLOWED_DUNGEON_KEYS.has(dungeonKey);
}

/* ---- World-form access ----
   Open / Standard: start in Light World; Dark World needs Aga path + Pearl
   (or the SRAM darkAccess flag the tracker already derives).
   Inverted: start in Dark World; Light World needs Mirror (or Aga).
*/
function hasLightWorldAccess(s){
  if(!isInvertedWorld()) return true;
  // Inverted: spawn in DW. Mirror warps to LW; Aga opens the castle portal
  // path that also lands you in Light World.
  return (s.mirror > 0) || !!s.agahnim;
}

function hasDarkWorldAccess(s){
  if(isInvertedWorld()){
    // Spawn in DW. Pearl is required to interact as human for nearly all
    // DW checks and dungeon entries (superbunny exceptions are rare and
    // not auto-tracked here).
    return hasMoonPearl(s);
  }
  // Open / Standard: Aga portal + Pearl, or the derived SRAM flag.
  if(s.darkAccess) return true;
  if(s.agahnim && hasMoonPearl(s)) return true;
  return false;
}

/* Overworld region helpers used by LOCATIONS[]. Prefer these over raw
   s.darkAccess so inverted / open stay consistent.
   Standard rain also gates free exploration until Zelda is rescued. */
function canReachLightWorldCheck(s){
  if(!hasClearedRain(s)) return false;
  return hasLightWorldAccess(s);
}

function canReachDarkWorldCheck(s){
  if(!hasClearedRain(s)) return false;
  return hasDarkWorldAccess(s);
}

function canAccessDeathMountain(s){
  if(!hasClearedRain(s)) return false;
  if(isInvertedWorld()){
    // Natural approach is Dark Death Mountain (home world). Flute still warps.
    // Glove + Pearl lets you climb the dark-side rocks; flute is the free path
    // once activated (activation itself is a separate LW/old-man concern).
    if(s.flute >= 3) return true;
    return hasMoonPearl(s) && s.gloves > 0;
  }
  // Standard / Open no-glitches: climb with glove + Lamp, or activated Flute.
  return s.flute >= 3 || (s.gloves > 0 && s.lamp > 0);
}

function canAccessDeathMountainSummit(s){
  if(isInvertedWorld()){
    // Hera / Ether tablet sit on *Light* Death Mountain.
    // Path: LW access → climb LW mountain (glove+lamp or flute) →
    // bridge with Mirror (from DW side) or Hookshot+Hammer pegs.
    if(!hasLightWorldAccess(s)) return false;
    const onMountain = s.flute >= 3 || (s.gloves > 0 && s.lamp > 0);
    return onMountain && (s.mirror > 0 || (s.hookshot > 0 && s.hammer > 0));
  }
  // Mirror from West Dark DM onto Spectacle Rock, or cross East DM + hammer pegs.
  return canAccessDeathMountain(s) &&
    (s.mirror > 0 || (s.hookshot > 0 && s.hammer > 0));
}

function canAccessEastDeathMountain(s){
  if(isInvertedWorld()){
    // East LW DM still needs LW access first, then the usual bridge tools.
    if(!hasLightWorldAccess(s)) return false;
    return canAccessDeathMountain(s) &&
      (s.hookshot > 0 || (s.mirror > 0 && s.hammer > 0));
  }
  return canAccessDeathMountain(s) &&
    (s.hookshot > 0 || (s.mirror > 0 && s.hammer > 0));
}

function canAccessDarkDeathMountainWest(s){
  if(isInvertedWorld()){
    return hasMoonPearl(s) && (s.flute >= 3 || s.gloves > 0);
  }
  // From LW mountain through the west portal (or flute to DW mountain).
  return canAccessDeathMountain(s) && hasMoonPearl(s);
}

function canAccessDarkDeathMountainTop(s){
  if(isInvertedWorld()){
    // East / top dark mountain: mitts for the heavy rocks on the inverted path.
    return hasMoonPearl(s) && (s.flute >= 3 || s.gloves > 0) && s.gloves >= 2;
  }
  // Reach East DM, lift East teleporter with Mitts (Superbunny path to summit).
  return canAccessEastDeathMountain(s) && s.gloves >= 2;
}

function canEnterTurtleRock(s){
  if(isInvertedWorld()){
    // TR portal is on inverted DW mountain: mitts + hammer + pearl + sword + medallion.
    return hasMoonPearl(s) && (s.flute >= 3 || s.gloves > 0) &&
      s.gloves >= 2 && s.hammer > 0 && s.sword > 0 &&
      hasMedallion(s, trMedallion);
  }
  return canAccessEastDeathMountain(s) &&
    s.gloves >= 2 && s.hammer > 0 && s.moonpearl > 0 && s.sword > 0 &&
    hasMedallion(s, trMedallion);
}

function canAccessMimicCave(s){
  // Mimic Cave is on Light DM; enter TR, mirror out to the cave ledge.
  if(isInvertedWorld()){
    return canEnterTurtleRock(s) && s.somaria > 0 && hasLightWorldAccess(s) && s.mirror > 0;
  }
  return canEnterTurtleRock(s) && s.somaria > 0 && s.mirror > 0;
}

/* ---- Inverted-aware overworld check helpers ----
   Used by LOCATIONS[] so individual markers do not hard-code Open logic.
*/
function canAccessBombosTablet(s){
  // Tablet is in Light World south of the swamp. Open: mirror from DW.
  // Inverted: already need LW access; mirror is optional for the approach.
  if(!hasClearedRain(s)) return false;
  if(isInvertedWorld()){
    return hasLightWorldAccess(s) && s.book > 0 && s.sword >= 2;
  }
  return hasDarkWorldAccess(s) && s.mirror > 0 && s.book > 0 && s.sword >= 2;
}

function canAccessGraveyardLedge(s){
  // Ledge is reached by mirroring from the Dark World graveyard.
  if(!hasClearedRain(s)) return false;
  if(isInvertedWorld()){
    return hasDarkWorldAccess(s) && s.mirror > 0 && hasLightWorldAccess(s);
  }
  return hasDarkWorldAccess(s) && s.mirror > 0;
}

function canAccessFrogHome(s){
  // Rescue the frog in DW (mitts), mirror to LW smithy area.
  if(!hasClearedRain(s)) return false;
  if(isInvertedWorld()){
    return hasDarkWorldAccess(s) && s.gloves >= 2 && s.mirror > 0 && hasLightWorldAccess(s);
  }
  return hasDarkWorldAccess(s) && s.mirror > 0 && s.gloves >= 2;
}

function canAccessCheckerboardCave(s){
  // Open: flute to desert, mitts into the cave under the rock.
  // Alternate: mirror from Mire. Inverted: LW access + mitts (or mirror from Mire).
  if(!hasClearedRain(s)) return false;
  if(isInvertedWorld()){
    return hasLightWorldAccess(s) && s.gloves >= 2;
  }
  return s.gloves >= 2;
}

function canAccessDesertLedge(s){
  // Book opens the front; alternate is flute + mitts + mirror from Mire side.
  if(!hasClearedRain(s)) return false;
  if(isInvertedWorld()){
    if(!hasLightWorldAccess(s)) return false;
    return s.book > 0 || (s.flute >= 3 && s.gloves >= 2 && s.mirror > 0);
  }
  return s.book > 0 || (s.flute >= 3 && s.gloves >= 2 && s.mirror > 0);
}

function canAccessFloatingIsland(s){
  // Mirror from Dark DM floating island ledge onto the Light island.
  if(!hasClearedRain(s)) return false;
  if(isInvertedWorld()){
    return canAccessDarkDeathMountainTop(s) && hasMoonPearl(s) &&
      s.hookshot > 0 && s.mirror > 0 && hasLightWorldAccess(s);
  }
  return canAccessDarkDeathMountainTop(s) && s.moonpearl > 0 &&
    s.hookshot > 0 && s.mirror > 0;
}

function canAccessSpectacleRock(s){
  // Mirror from Dark DM west onto Spectacle Rock.
  if(!hasClearedRain(s)) return false;
  if(isInvertedWorld()){
    return canAccessDarkDeathMountainWest(s) && s.mirror > 0 && hasLightWorldAccess(s);
  }
  return canAccessDeathMountain(s) && s.mirror > 0;
}

const REQUIREMENTS = {
  bow:s=>s.bow>0,
  hammer:s=>s.hammer>0,
  hookshot:s=>s.hookshot>0,
  lamp:s=>s.lamp>0,
  firerod:s=>s.firerod>0,
  icerod:s=>s.icerod>0,
  somaria:s=>s.somaria>0,
  byrna:s=>s.byrna>0,
  cape:s=>s.cape>0,
  boots:s=>s.boots>0,
  flippers:s=>s.flippers>0,
  mirror:s=>s.mirror>0,
  moonpearl:s=>s.moonpearl>0,
  gloves:s=>s.gloves>0,
  gloves2:s=>s.gloves>=2,
  book:s=>s.book>0,
  bombs:s=>s.bombs>0,
  sword:s=>s.sword>0,
  sword2:s=>s.sword>=2,
  darkAccess:s=>hasDarkWorldAccess(s),
  lightWorldAccess:s=>hasLightWorldAccess(s),
  rainCleared:s=>hasClearedRain(s),
  flute:s=>s.flute>=3,
  crystals7:s=>crystalCount(s)>=7,

  deathMountain:s=>canAccessDeathMountain(s),
  deathMountainSummit:s=>canAccessDeathMountainSummit(s),
  eastDeathMountain:s=>canAccessEastDeathMountain(s),
  darkDeathMountainWest:s=>canAccessDarkDeathMountainWest(s),
  darkDeathMountainTop:s=>canAccessDarkDeathMountainTop(s),
  turtleRockEntry:s=>canEnterTurtleRock(s),

  fire:s=>s.lamp>0 || s.firerod>0,
  melt:s=>s.firerod>0 || s.bombos>0,
  combat:s=>
    s.sword>0 || s.hammer>0 || s.bow>0 || s.firerod>0 ||
    s.icerod>0 || s.somaria>0 || s.byrna>0,
  rangedCombat:s=>
    s.bow>0 || s.hookshot>0 || s.boomerang>0 || s.firerod>0 ||
    s.icerod>0 || s.somaria>0 || s.sword>=2 || s.bombs>0,
  crystalSwitch:s=>
    s.boomerang>0 || s.bow>0 || s.hookshot>0 || s.bombs>0 ||
    s.somaria>0,
  spikeSafe:s=>s.byrna>0 || s.cape>0,
  eyeBridgeSafe:s=>s.byrna>0 || s.cape>0 || s.shield>=3,
  bootsOrHookshot:s=>s.boots>0 || s.hookshot>0,
  hookshotOrBoots:s=>s.hookshot>0 || s.boots>0,
  somariaOrHookshot:s=>s.somaria>0 || s.hookshot>0,
  bombsOrSomaria:s=>s.bombs>0 || s.somaria>0,

  desertEntry:s=>s.book>0 || s.gloves>0,
  desertClear:s=>
    s.book>0 && s.gloves>0 && s.boots>0 &&
    (s.lamp>0 || s.firerod>0) && REQUIREMENTS.combat(s),
  heraEntry:s=>canAccessDeathMountainSummit(s),
  agaEntry:s=>s.sword>=2 || s.cape>0 || s.agahnim,
  mireMedallion:s=>hasMedallion(s,mmMedallion),
  turtleMedallion:s=>hasMedallion(s,trMedallion)
};

// Base entry requirements (Open / Standard). Inverted prefixes LW dungeons.
const DUNGEON_REQUIREMENTS = {
  hyruleCastle:[],
  easternPalace:[],
  desertPalace:["desertEntry"],
  towerOfHera:["heraEntry"],
  agahnimsTower:["agaEntry"],
  palaceOfDarkness:["darkAccess"],
  swampPalace:["darkAccess","mirror","flippers"],
  skullWoods:["darkAccess"],
  thievesTown:["darkAccess"],
  icePalace:["darkAccess","flippers","melt"],
  miseryMire:["darkAccess","gloves2","flute","sword","mireMedallion"],
  turtleRock:["turtleRockEntry"],
  ganonsTower:["darkDeathMountainTop","crystals7"]
};

const DUNGEON_CLEAR_REQUIREMENTS = {
  hyruleCastle:["bombs","lamp","combat"],
  easternPalace:["bow","combat"],
  desertPalace:["desertClear"],
  towerOfHera:["heraEntry","fire","combat"],
  agahnimsTower:["agaEntry","lamp","combat"],
  palaceOfDarkness:["darkAccess","bow","hammer","lamp","bombs","combat"],
  swampPalace:["darkAccess","mirror","flippers","hammer","hookshot","bombs","combat"],
  skullWoods:["darkAccess","firerod","bombs","combat"],
  thievesTown:["darkAccess","hammer","combat"],
  icePalace:["darkAccess","flippers","melt","hammer","gloves","combat"],
  miseryMire:["darkAccess","gloves2","flute","sword","mireMedallion","somaria","bombs","fire","combat"],
  turtleRock:["turtleRockEntry","somaria","firerod","icerod","combat"],
  ganonsTower:["darkDeathMountainTop","crystals7","boots","hammer","hookshot","somaria","firerod","bow","bombs","combat"]
};

const LIGHT_WORLD_DUNGEON_KEYS = new Set([
  "hyruleCastle",
  "easternPalace",
  "desertPalace",
  "towerOfHera",
  "agahnimsTower"
]);

// Boss-fight-only tools that should not gate a shuffled boss.
const BOSS_FIGHT_ONLY_REQS = new Set(["bow", "firerod", "icerod"]);

function isBigKeyShuffled(){
  // Keysanity and Map/Compass/Big Key put BK in the overworld pool.
  return typeof SETTINGS !== "undefined" &&
    (SETTINGS.keysMode === "keysanity" || SETTINGS.keysMode === "mcbk");
}

function isSmallKeysShuffled(){
  // Small keys can leave their dungeon — owned count gates locked doors.
  return typeof SETTINGS !== "undefined" &&
    (SETTINGS.keysMode === "keysanity" ||
     SETTINGS.keysMode === "keys" ||
     SETTINGS.keysMode === "mcs");
}

function locationRequiresDungeonBigKey(location){
  const id = location?.id || "";
  return id === "bigChest" || id === "boss" || id.startsWith("bigChest");
}

function hasDungeonBigKey(save, dungeonKey){
  return !!(save && dungeonKey && save.bigKey && save.bigKey[dungeonKey]);
}

function getDungeonSmallKeyCount(save, dungeonKey){
  if(!save || !dungeonKey) return 0;
  return Number(save.dungeonKeys?.[dungeonKey]) || 0;
}

function locationSmallKeysNeeded(location){
  return Math.max(0, Number(location?.keys) || 0);
}

function hasDungeonSmallKeys(save, dungeonKey, needed){
  if(!needed || needed <= 0) return true;
  return getDungeonSmallKeyCount(save, dungeonKey) >= needed;
}

/* ============================================================
   Small-key graph (Practice coaching only)

   Uses public layout thresholds already on each check (`location.keys`):
   minimum small keys from this dungeon to reach that check. Does not
   invent key locations (keysanity can place keys anywhere). Race Legal
   continues to use the simple threshold tags only; this analysis feeds
   Best Play / I'm Stuck messaging in Practice mode.
   ============================================================ */
function analyzeDungeonKeyGraph(dungeonKey, save){
  const empty = {
    active: false,
    currentKeys: 0,
    maxGate: 0,
    bossKeysNeeded: 0,
    reachableWithKeys: [],
    blockedByKeysOnly: [],
    blockedByKeysAndItems: [],
    nextKeyGate: null,
    keysShortForBoss: 0,
    summary: null,
    facts: []
  };
  if(!dungeonKey || typeof DUNGEON_DATA === "undefined") return empty;
  if(typeof isSmallKeysShuffled === "function" && !isSmallKeysShuffled()) return empty;

  const data = DUNGEON_DATA[dungeonKey];
  if(!data || !Array.isArray(data.locations)) return empty;

  const currentKeys = getDungeonSmallKeyCount(save, dungeonKey);
  const reachableWithKeys = [];
  const blockedByKeysOnly = [];
  const blockedByKeysAndItems = [];
  let maxGate = 0;
  let bossKeysNeeded = 0;

  for(const location of data.locations){
    const keysNeeded = locationSmallKeysNeeded(location);
    if(keysNeeded > maxGate) maxGate = keysNeeded;
    if(location.id === "boss") bossKeysNeeded = keysNeeded;

    // Item requirements only (no injected key tags).
    const itemReqs = [...(location.requires || [])];
    if(location.id === "boss" && typeof isBossShuffle === "function" && isBossShuffle()){
      // Keep combat-style items; boss-fight-only filters happen in getEffective.
    }
    if(typeof isBigKeyShuffled === "function" && isBigKeyShuffled() &&
       typeof locationRequiresDungeonBigKey === "function" &&
       locationRequiresDungeonBigKey(location)){
      if(!itemReqs.includes("dungeonBigKey")) itemReqs.push("dungeonBigKey");
    }

    const itemsOk = hasRequirements(save, itemReqs, dungeonKey);
    const keysOk = keysNeeded <= 0 || currentKeys >= keysNeeded;

    if(keysOk && itemsOk){
      reachableWithKeys.push({
        id: location.id,
        name: location.name,
        keysNeeded
      });
    }else if(!keysOk && itemsOk){
      blockedByKeysOnly.push({
        id: location.id,
        name: location.name,
        keysNeeded,
        shortBy: keysNeeded - currentKeys
      });
    }else if(!keysOk && !itemsOk){
      blockedByKeysAndItems.push({
        id: location.id,
        name: location.name,
        keysNeeded,
        missingItems: itemReqs
          .filter(r => !requirementMet(save, r, dungeonKey))
          .map(r => formatRequirementName(r))
      });
    }
  }

  blockedByKeysOnly.sort((a, b) => a.keysNeeded - b.keysNeeded || a.shortBy - b.shortBy);
  const nextKeyGate = blockedByKeysOnly[0] || null;
  const keysShortForBoss = Math.max(0, bossKeysNeeded - currentKeys);

  const facts = [];
  if(maxGate > 0){
    facts.push(`Keys ${currentKeys}/${maxGate} (layout gates)`);
  }
  if(bossKeysNeeded > 0){
    if(keysShortForBoss === 0){
      facts.push("Boss key doors open (by count)");
    }else{
      facts.push(`Boss needs ${bossKeysNeeded} keys (${keysShortForBoss} more)`);
    }
  }
  if(nextKeyGate){
    facts.push(
      nextKeyGate.shortBy === 1
        ? `Next key door: ${nextKeyGate.name} (1 more key)`
        : `Next key door: ${nextKeyGate.name} (${nextKeyGate.shortBy} more keys)`
    );
  }
  if(blockedByKeysOnly.length > 1){
    facts.push(`${blockedByKeysOnly.length} checks gated only by keys`);
  }

  let summary = null;
  if(nextKeyGate && keysShortForBoss > 0){
    summary = `Have ${currentKeys} keys; need ${nextKeyGate.keysNeeded} for ${nextKeyGate.name}, ${bossKeysNeeded} for boss.`;
  }else if(nextKeyGate){
    summary = `Have ${currentKeys} keys; next gate is ${nextKeyGate.name} at ${nextKeyGate.keysNeeded}.`;
  }else if(keysShortForBoss > 0){
    summary = `Have ${currentKeys} keys; boss layout gate is ${bossKeysNeeded}.`;
  }else if(maxGate > 0){
    summary = `Have ${currentKeys} keys; all layout key doors open.`;
  }

  return {
    active: maxGate > 0,
    currentKeys,
    maxGate,
    bossKeysNeeded,
    reachableWithKeys,
    blockedByKeysOnly,
    blockedByKeysAndItems,
    nextKeyGate,
    keysShortForBoss,
    summary,
    facts
  };
}


function getDungeonEntryRequirements(key){
  let base = [...(DUNGEON_REQUIREMENTS[key] || [])];
  if(isInvertedWorld() && LIGHT_WORLD_DUNGEON_KEYS.has(key)){
    if(!base.includes("lightWorldAccess")) base.unshift("lightWorldAccess");
  }
  // Standard rain: only Hyrule Castle is reachable until Zelda is rescued.
  if(isStandardWorld() && !isDungeonAllowedDuringRain(key)){
    if(!base.includes("rainCleared")) base.unshift("rainCleared");
  }
  // Entrance shuffle: drop overworld-path gates. Keep door items only
  // (medallions, GT crystals, rain). Turtle Rock still needs its medallion.
  if(isEntranceShuffle()){
    if(key === "turtleRock"){
      base = ["sword", "turtleMedallion"];
      if(isStandardWorld()) base.unshift("rainCleared");
    }else if(key === "miseryMire"){
      base = ["sword", "mireMedallion"];
      if(isStandardWorld()) base.unshift("rainCleared");
    }else if(key === "ganonsTower"){
      base = ["crystals7"];
      if(isStandardWorld()) base.unshift("rainCleared");
    }else{
      base = base.filter(r => ENTRANCE_DOOR_REQUIREMENTS.has(r));
    }
  }
  return base;
}

function getDungeonClearRequirements(key){
  let reqs = [...(DUNGEON_CLEAR_REQUIREMENTS[key] || DUNGEON_REQUIREMENTS[key] || [])];
  if(isInvertedWorld() && LIGHT_WORLD_DUNGEON_KEYS.has(key)){
    if(!reqs.includes("lightWorldAccess")) reqs.unshift("lightWorldAccess");
  }
  if(isStandardWorld() && !isDungeonAllowedDuringRain(key)){
    if(!reqs.includes("rainCleared")) reqs.unshift("rainCleared");
  }
  // Entrance shuffle: strip overworld access tags; keep tools/combat/keys/BK.
  if(isEntranceShuffle()){
    const pathGates = new Set([
      "darkAccess","lightWorldAccess","deathMountain","deathMountainSummit",
      "eastDeathMountain","darkDeathMountainWest","darkDeathMountainTop",
      "turtleRockEntry","flute","gloves2"
    ]);
    // Keep medallion/crystal/rain door tags and combat tools.
    reqs = reqs.filter(r => !pathGates.has(r));
    if(key === "turtleRock" && !reqs.includes("turtleMedallion")) reqs.push("turtleMedallion");
    if(key === "miseryMire" && !reqs.includes("mireMedallion")) reqs.push("mireMedallion");
    if(key === "ganonsTower" && !reqs.includes("crystals7")) reqs.push("crystals7");
  }
  if(isBossShuffle()){
    const filtered = reqs.filter(r => !BOSS_FIGHT_ONLY_REQS.has(r));
    if(!filtered.includes("combat")) filtered.push("combat");
    reqs = filtered;
  }
  // Full clear needs the dungeon BK when it can be outside the dungeon.
  if(isBigKeyShuffled() && !reqs.includes("dungeonBigKey")){
    reqs.push("dungeonBigKey");
  }
  // Full clear also needs enough small keys to reach the boss when keys are shuffled.
  if(isSmallKeysShuffled() && typeof DUNGEON_DATA !== "undefined"){
    const bossLoc = (DUNGEON_DATA[key]?.locations || []).find(loc => loc.id === "boss");
    const needed = locationSmallKeysNeeded(bossLoc);
    if(needed > 0){
      const tag = "dungeonKeys" + needed;
      if(!reqs.includes(tag)) reqs.push(tag);
    }
  }
  return reqs;
}

function getEffectiveLocationRequires(location, dungeonKey=null){
  let reqs = [...(location?.requires || [])];
  if(location?.id === "boss" && isBossShuffle()){
    reqs = reqs.filter(r => !BOSS_FIGHT_ONLY_REQS.has(r));
    if(!reqs.includes("combat")) reqs.push("combat");
  }
  // When BK is shuffled out of the dungeon, big chest / boss need owned BK.
  if(dungeonKey && isBigKeyShuffled() && locationRequiresDungeonBigKey(location)){
    if(!reqs.includes("dungeonBigKey")) reqs.push("dungeonBigKey");
  }
  // When small keys are shuffled, inject a keysN tag for the guide / stuck UI.
  if(dungeonKey && isSmallKeysShuffled()){
    const needed = locationSmallKeysNeeded(location);
    if(needed > 0){
      const tag = "dungeonKeys" + needed;
      if(!reqs.includes(tag)) reqs.push(tag);
    }
  }
  return reqs;
}

function parseDungeonKeysRequirement(requirement){
  if(typeof requirement !== "string" || !requirement.startsWith("dungeonKeys")) return null;
  const n = Number(requirement.slice("dungeonKeys".length));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function hasRequirements(save, requirements, dungeonKey=null){
  for(const requirement of requirements){
    if(requirement === "dungeonBigKey"){
      if(!hasDungeonBigKey(save, dungeonKey)) return false;
      continue;
    }
    const keysNeeded = parseDungeonKeysRequirement(requirement);
    if(keysNeeded !== null){
      if(!hasDungeonSmallKeys(save, dungeonKey, keysNeeded)) return false;
      continue;
    }
    const check = REQUIREMENTS[requirement];
    if(!check){
      console.warn("Unknown requirement:", requirement);
      return false;
    }
    if(!check(save)) return false;
  }
  return true;
}

function requirementMet(save, req, dungeonKey=null){
  if(req === "dungeonBigKey") return hasDungeonBigKey(save, dungeonKey);
  const keysNeeded = parseDungeonKeysRequirement(req);
  if(keysNeeded !== null) return hasDungeonSmallKeys(save, dungeonKey, keysNeeded);
  const check = REQUIREMENTS[req];
  if(!check){
    console.warn("Unknown requirement:", req);
    return false;
  }
  return check(save);
}

function canEnterDungeon(key, save){
  // Manual entrance pairing under ER: if the runner recorded which hole
  // leads here, prefer that fact (door items still required).
  if(typeof canEnterDungeonViaPairing === "function"){
    const paired = canEnterDungeonViaPairing(key, save);
    if(paired !== null) return paired;
  }
  return hasRequirements(save, getDungeonEntryRequirements(key), key);
}

function canCompleteDungeon(key, save){
  return hasRequirements(save, getDungeonClearRequirements(key), key);
}

function getMissingDungeonRequirements(key, save){
  return getDungeonEntryRequirements(key)
    .filter(req => !requirementMet(save, req, key))
    .map(req => (typeof formatRequirementName === "function" ? formatRequirementName(req) : ((typeof REQUIREMENT_NAMES !== "undefined" && REQUIREMENT_NAMES[req]) || req)));
}

function getMissingDungeonClearRequirements(key, save){
  return getDungeonClearRequirements(key)
    .filter(req => !requirementMet(save, req, key))
    .map(req => (typeof formatRequirementName === "function" ? formatRequirementName(req) : ((typeof REQUIREMENT_NAMES !== "undefined" && REQUIREMENT_NAMES[req]) || req)));
}

function refreshLogicForModeChange(){
  if(typeof updateRainChip === "function") updateRainChip(TrackerState?.save || lastState || {});
  if(typeof applyEntrancePairingPanelVisibility === "function"){
    applyEntrancePairingPanelVisibility();
  }
  if(typeof lastDungeonStats !== "undefined" && lastDungeonStats && typeof updateDungeonStats === "function"){
    updateDungeonStats(lastDungeonStats);
  }
  if(typeof lastState !== "undefined" && lastState && typeof updateMap === "function"){
    updateMap(lastState);
  }else if(TrackerState?.save && typeof updateMap === "function"){
    updateMap(TrackerState.save);
  }
  if(typeof updateRecommendation === "function"){
    updateRecommendation();
  }
  // Rebuild open dungeon guide so ENTRY / FULL CLEAR match current modes.
  const guideKey = (typeof pinnedDungeonGuide !== "undefined" && pinnedDungeonGuide)
    || (typeof activeDungeonGuide !== "undefined" && activeDungeonGuide)
    || null;
  if(guideKey && typeof renderDungeonGuide === "function" && typeof DUNGEONS !== "undefined"){
    const loc = DUNGEONS.find(d => d.key === guideKey);
    if(loc) renderDungeonGuide(loc);
  }
}
