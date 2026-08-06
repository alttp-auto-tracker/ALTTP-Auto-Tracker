/* ============================================================
   constants.js
   All static/constant data used across the tracker: memory
   addresses, item/UI definitions, dungeon totals, map location
   tables. Nothing in here touches the DOM or holds live state.
   ============================================================ */

/* ---- SNES memory layout ----
   Base save data lives at SNES bus address $7EF340.
   usb2snes/SNI maps WRAM starting at 0xF50000, so:
   usb2snes address = 0xF50000 + (0x7EF340 - 0x7E0000) = 0xF5F340
   We read through $7EF411 so item state, progress, and rando NPC
   completion flags arrive in one small request.
*/
const BASE_ADDR = 0xF5F340;
const READ_LEN  = 0xD2; // extends through $7EF411 (rando NPC completion flags)

// Current ALttPR copies its expanded save block from SRAM $700500 into
// WRAM $7F6000 when a file is loaded. The first 24 bytes are the complete
// 12-character player name (one little-endian tile code per character).
// usb2snes/SNI maps $7F6000 to 0xF66000.
const PLAYER_NAME_ADDR  = 0xF66000;
const PLAYER_NAME_LEN   = 24;
const PLAYER_NAME_CHARS = 12;

// Per-dungeon "locations checked" counters live at $7EF4C0
// (DungeonLocationsChecked), one plain byte per dungeon, in this order:
// Sewers, Hyrule Castle, Eastern Palace, Desert Palace, Agahnim's Tower,
// Swamp Palace, Palace of Darkness, Misery Mire, Skull Woods, Ice Palace,
// Tower of Hera, Thieves' Town, Turtle Rock, Ganon's Tower.
// (Source: the randomizer's own sram.asm SRAM label/assertion table.)
const DSTATS_ADDR = 0xF5F4C0; // WRAM mirror of $7EF4C0
const DSTATS_LEN  = 14;       // 14 single-byte counters, no bit-packing

// Room and overworld completion flags occupy the beginning of SRAM. Room
// flags are 16-bit values at roomId * 2; loose overworld items use bit $40
// at $7EF280 + screenId. Reading through screen $81 covers every standard
// standalone marker represented on our maps.
const LOCATION_FLAGS_ADDR = 0xF5F000;
const LOCATION_FLAGS_LEN  = 0x302;

// Live position (WRAM, not the SRAM save mirror) — current dungeon room index
// and current overworld area index. Useful groundwork for future named-chest
// tracking; for now it's a diagnostic readout.
const ROOM_ADDR   = 0xF500A0; // $7E00A0, 2 bytes
const OWAREA_ADDR = 0xF5040A; // $7E040A, 1 byte
const DUNGEON_ID_ADDR = 0xF5040C; // $7E040C, current dungeon index

const GAMEMODE_ADDR = 0xF50010;

// Live overworld position block at $7E001B-$7E0023:
//   +0 indoors flag (0 outdoors, 1 indoors)
//   +5 Link Y coordinate (16-bit little endian)
//   +7 Link X coordinate (16-bit little endian)
// Link's overworld coordinates span the 0x0000-0x0FFF world map.
const PLAYER_POSITION_ADDR = 0xF5001B;
const PLAYER_POSITION_LEN  = 9;
const OVERWORLD_COORD_SIZE = 0x1000;

// $7E040C follows the same even-numbered ordering as the randomizer's
// dungeon progress counters. Hyrule Castle and Sewers use separate engine
// IDs, but they intentionally share one tracker entry.
const DUNGEON_ID_TO_KEY = {
  0x00:'hyruleCastle', 0x02:'hyruleCastle', 0x04:'easternPalace',
  0x06:'desertPalace', 0x08:'agahnimsTower', 0x0A:'swampPalace',
  0x0C:'palaceOfDarkness', 0x0E:'miseryMire', 0x10:'skullWoods',
  0x12:'icePalace', 0x14:'towerOfHera', 0x16:'thievesTown',
  0x18:'turtleRock', 0x1A:'ganonsTower'
};

// Default total location counts per dungeon — i.e. how many checks exist
// in that dungeon's physical layout (small keys + map + compass + big key +
// standalone items), which is fixed by the dungeon's room layout and does
// NOT change with item-pool settings like keysanity. These are standard
// vanilla-layout totals; if your seed uses Doors/Crossed layouts or has
// extra shuffled pickups (retro bow, pot shuffle, etc.) just edit the
// "total" field for that dungeon — it's yours to correct.
const DUNGEON_TOTALS = {
  hyruleCastle: 7, easternPalace: 6, desertPalace: 6, agahnimsTower: 4,
  swampPalace: 10, palaceOfDarkness: 14, miseryMire: 8, skullWoods: 8,
  icePalace: 8, towerOfHera: 6, thievesTown: 8, turtleRock: 12, ganonsTower: 27
};

const DUNGEON_STATUS = {
  RED: "red",
  YELLOW: "yellow",
  GREEN: "green"
};

/* ---- Item / UI definitions ---- */
const WEAPON_ITEMS = [
  {key:'bow',label:'Bow',cat:'weapon',tier:v=>v>0?v:null},
  {key:'boomerang',label:'Boomerang',cat:'weapon'},
  {key:'hookshot',label:'Hookshot',cat:'weapon'},
  {key:'bombs',label:'Bombs',cat:'weapon',on:v=>v>0,badge:v=>v},
  {key:'powder',label:'Powder',cat:'magic'},
  {key:'firerod',label:'Fire Rod',cat:'magic'},
  {key:'icerod',label:'Ice Rod',cat:'magic'},
  {key:'bombos',label:'Bombos',cat:'magic'},
  {key:'ether',label:'Ether',cat:'magic'},
  {key:'quake',label:'Quake',cat:'magic'}
];
const UTILITY_ITEMS = [
  {key:'lamp',label:'Lamp',cat:'key'},
  {key:'hammer',label:'Hammer',cat:'weapon'},
  {key:'flute',label:'Flute',cat:'key',tier:v=>v>0?v:null},
  {key:'net',label:'Net',cat:'weapon'},
  {key:'book',label:'Book',cat:'key'},
  {key:'somaria',label:'Somaria',cat:'magic'},
  {key:'byrna',label:'Byrna',cat:'magic'},
  {key:'cape',label:'Cape',cat:'magic'},
  {key:'mirror',label:'Mirror',cat:'key',tier:v=>v>0?v:null}
];
const EQUIP_ITEMS = [
  {key:'gloves',label:'Gloves',cat:'equip',tier:v=>v>0?v:null},
  {key:'boots',label:'Boots',cat:'equip'},
  {key:'flippers',label:'Flippers',cat:'equip'},
  {key:'moonpearl',label:'Moon Pearl',cat:'equip'}
];
const UPGRADE_ITEMS = [
  {key:'sword',label:'Sword',cat:'weapon',tier:v=>v>0?v:null},
  {key:'shield',label:'Shield',cat:'equip',tier:v=>v>0?v:null},
  // Armor is always owned: zero means Green Mail, not an empty slot.
  {key:'armor',label:'Armor',cat:'equip',tier:v=>v+1,on:v=>Number.isFinite(v) && v>=0}
];
const BOTTLE_CONTENT_LABELS = ['Empty Slot','Mushroom','Empty Bottle','Red Potion','Green Potion','Blue Potion','Fairy','Bee','Good Bee'];
const BOTTLE_ITEMS = [
  {key:'bottle1',label:'Bottle 1',cat:'key'},
  {key:'bottle2',label:'Bottle 2',cat:'key'},
  {key:'bottle3',label:'Bottle 3',cat:'key'},
  {key:'bottle4',label:'Bottle 4',cat:'key'}
];

const ALL_ITEMS = [...WEAPON_ITEMS, ...UTILITY_ITEMS, ...EQUIP_ITEMS, ...UPGRADE_ITEMS, ...BOTTLE_ITEMS];

const DUNGEON_STAT_LABELS = [
  ['hyruleCastle','Hyrule Castle','HC'],['easternPalace','Eastern Palace','EP'],
  ['desertPalace','Desert Palace','DP'],['towerOfHera','Tower of Hera','ToH'],
  ['agahnimsTower',"Agahnim's Tower",'AT'],['palaceOfDarkness','Palace of Darkness','PoD'],
  ['swampPalace','Swamp Palace','SP'],['skullWoods','Skull Woods','SW'],
  ['thievesTown','Thieves Town','TT'],['icePalace','Ice Palace','IP'],
  ['miseryMire','Misery Mire','MM'],['turtleRock','Turtle Rock','TR'],
  ['ganonsTower',"Ganon's Tower",'GT']
];

/* ---- Keysanity SRAM layout (offsets from BASE / $7EF340) ----
   Compass $7EF364-5, Big Key $7EF366-7, Map $7EF368-9.
   Per-dungeon small keys $7EF37C-$7EF389 (Sewers..GT).
   Bit layout is identical for compass / big key / map. */
const COMPASS_OFF = 0x24;
const BIGKEY_OFF  = 0x26;
const MAP_OFF     = 0x28;
const DUNGEON_KEYS_OFF = 0x3C; // 14 bytes

// byte 0 = low ($…64/66/68), byte 1 = high ($…65/67/69)
const DUNGEON_ITEM_BITS = {
  ganonsTower:      { byte: 0, mask: 0x20 },
  turtleRock:       { byte: 0, mask: 0x10 },
  thievesTown:      { byte: 0, mask: 0x08 },
  towerOfHera:      { byte: 0, mask: 0x04 },
  icePalace:        { byte: 0, mask: 0x02 },
  skullWoods:       { byte: 0, mask: 0x01 },
  miseryMire:       { byte: 1, mask: 0x80 },
  palaceOfDarkness: { byte: 1, mask: 0x40 },
  swampPalace:      { byte: 1, mask: 0x20 },
  agahnimsTower:    { byte: 1, mask: 0x10 },
  desertPalace:     { byte: 1, mask: 0x08 },
  easternPalace:    { byte: 1, mask: 0x04 },
  // HC + Sewers share the low two bits of the high byte; treat as one HC flag.
  hyruleCastle:     { byte: 1, mask: 0x03 }
};

// Order of the 14 per-dungeon key bytes at $7EF37C
const DUNGEON_KEY_ORDER = [
  'sewers', 'hyruleCastle', 'easternPalace', 'desertPalace',
  'agahnimsTower', 'swampPalace', 'palaceOfDarkness', 'miseryMire',
  'skullWoods', 'icePalace', 'towerOfHera', 'thievesTown',
  'turtleRock', 'ganonsTower'
];

// Typical max small keys per dungeon (display caps; pot/enemy keys can vary)
const DUNGEON_KEY_MAX = {
  hyruleCastle: 1,
  easternPalace: 0,
  desertPalace: 1,
  towerOfHera: 1,
  agahnimsTower: 2,
  palaceOfDarkness: 6,
  swampPalace: 1,
  skullWoods: 3,
  thievesTown: 1,
  icePalace: 2,
  miseryMire: 3,
  turtleRock: 4,
  ganonsTower: 4
};

/* ---- Randomizer mode options (UI + logic flags) ---- */
const WORLD_MODE_OPTIONS = [
  { key: 'standard', label: 'Standard' },
  { key: 'open',     label: 'Open' },
  { key: 'inverted', label: 'Inverted' }
];

const KEYS_MODE_OPTIONS = [
  { key: 'standard',  label: 'Standard keys' },
  { key: 'keysanity', label: 'Keysanity' },
  { key: 'keys',      label: 'Keys only' },
  { key: 'mc',        label: 'Map / Compass' },
  { key: 'mcs',       label: 'Map / Compass / Small' },
  { key: 'mcbk',      label: 'Map / Compass / Big Key' }
];

const BOSS_MODE_OPTIONS = [
  { key: 'normal',   label: 'Normal bosses' },
  { key: 'shuffled', label: 'Boss shuffle' }
];

// Entrance Randomizer: vanilla connections vs shuffled entrances.
// Shuffled weakens auto-map reachability (race-legal — no assumed paths).
const ENTRANCE_MODE_OPTIONS = [
  { key: 'vanilla',  label: 'Vanilla entrances' },
  { key: 'shuffled', label: 'Entrance shuffle' }
];

const PENDANT_TYPES = [
  {key:'pendant-0',cls:'pendant-red',label:'Wisdom',bit:0x01},
  {key:'pendant-1',cls:'pendant-blue',label:'Power',bit:0x02},
  {key:'pendant-2',cls:'pendant-green',label:'Courage',bit:0x04}
];

// Crystal bit -> dungeon label, matching CrystalsField in sram.asm:
// bit0=Misery Mire, bit1=Palace of Darkness, bit2=Ice Palace, bit3=Turtle Rock,
// bit4=Swamp Palace, bit5=Thieves Town, bit6=Skull Woods.
const CRYSTAL_DUNGEON_LABELS = ['MM','PD','IP','TR','SP','TT','SW'];

// The ten dungeons that award a pendant or crystal in a standard randomizer
// seed. Prize placement is entered manually from the in-game map, keeping the
// feature race legal while still letting routing use what the runner knows.
const PRIZE_DUNGEONS = [
  {key:'easternPalace',abbr:'EP',name:'Eastern Palace'},
  {key:'desertPalace',abbr:'DP',name:'Desert Palace'},
  {key:'towerOfHera',abbr:'ToH',name:'Tower of Hera'},
  {key:'palaceOfDarkness',abbr:'PoD',name:'Palace of Darkness'},
  {key:'swampPalace',abbr:'SP',name:'Swamp Palace'},
  {key:'skullWoods',abbr:'SW',name:'Skull Woods'},
  {key:'thievesTown',abbr:'TT',name:"Thieves' Town"},
  {key:'icePalace',abbr:'IP',name:'Ice Palace'},
  {key:'miseryMire',abbr:'MM',name:'Misery Mire'},
  {key:'turtleRock',abbr:'TR',name:'Turtle Rock'}
];

const DUNGEON_PRIZE_TYPES = [
  {key:'unknown',label:'Unknown',mark:'?'},
  {key:'crystal',label:'Crystal',mark:'C'},
  {key:'redCrystal',label:'Red Crystal (5/6)',mark:'5/6'},
  {key:'greenPendant',label:'Green Pendant',mark:'G'},
  {key:'bluePendant',label:'Blue Pendant',mark:'B'},
  {key:'redPendant',label:'Red Pendant',mark:'R'}
];

/* ---- Timer / splits ---- */
const ITEM_EVENT_LABELS = {
  bow: [null, "Bow"],
  boomerang: [null, "Boomerang"],
  hookshot: [null, "Hookshot"],
  bombs: [null, "Bombs"],
  powder: [null, "Magic Powder"],
  firerod: [null, "Fire Rod"],
  icerod: [null, "Ice Rod"],
  bombos: [null, "Bombos"],
  ether: [null, "Ether"],
  quake: [null, "Quake"],
  lamp: [null, "Lamp"],
  hammer: [null, "Hammer"],
  flute: [null, "Flute"],
  net: [null, "Bug Net"],
  book: [null, "Book"],
  somaria: [null, "Cane of Somaria"],
  byrna: [null, "Cane of Byrna"],
  cape: [null, "Magic Cape"],
  mirror: [null, "Magic Mirror"],
  gloves: [null, "Power Glove", "Titan's Mitt"],
  boots: [null, "Pegasus Boots"],
  flippers: [null, "Flippers"],
  moonpearl: [null, "Moon Pearl"],
  sword: [null, "Fighter Sword", "Master Sword", "Tempered Sword", "Golden Sword"],
  shield: [null, "Blue Shield", "Red Shield", "Mirror Shield"],
  armor: ["Green Mail", "Blue Mail", "Red Mail"]
};

/* ============================================================
   World map — standalone checks + dungeon entry (v1 scope)
   Coordinates are calibrated to the embedded 516x511 Light/Dark World
   map images. Custom user-created markers retain their exported positions.
   Completion functions use dedicated ALttPR SRAM flags where available.
   ============================================================ */
const LOCATIONS = [
  // ---- Light World ----
  // Inverted: free LW markers still require Light World Access (Mirror or Aga).
  {id:'mushroom',name:'Mushroom',world:'light',x:12.2,y:8.4,need:s=>canReachLightWorldCheck(s),checked:s=>!!(s.npcFlags&0x1000)},
  {id:'bottlemerch',name:'Bottle Merchant',world:'light',x:9.1,y:47.4,need:s=>canReachLightWorldCheck(s),checked:s=>!!(s.npcFlagsVanilla&0x02)},
  {id:'lumberjack',name:'Lumberjack Tree',world:'light',x:29.9,y:8.3,need:s=>canReachLightWorldCheck(s) && s.agahnim},
  {id:'cave45',name:'Cave 45',world:'light',x:27,y:83,need:s=>canReachLightWorldCheck(s)},
  {id:'checkerboard',name:'Checkerboard Cave',world:'light',x:16.8,y:77.9,need:s=>canAccessCheckerboardCave(s)},
  {id:'aginah',name:"Aginah's Cave",world:'light',x:20.1,y:82.8,need:s=>canReachLightWorldCheck(s) && s.bombs>0},
  {id:'sahasrahla_hut',name:"Sahasrahla's Hut",world:'light',x:81.2,y:42.3,need:s=>canReachLightWorldCheck(s)},
  {id:'sahasrahla_reward',name:"Sahasrahla's Reward",world:'light',x:81.2,y:45.8,need:s=>canReachLightWorldCheck(s) && !!(s.pendants&0x04),checked:s=>!!(s.npcFlags&0x0010)},
  {id:'kakariko_well',name:'Kakariko Well',world:'light',x:3.5,y:41.9,need:s=>canReachLightWorldCheck(s)},
  {id:'blind_hideout',name:"Blind's Hideout",world:'light',x:13.3,y:41.7,need:s=>canReachLightWorldCheck(s)},
  {id:'chicken_house',name:'Chicken House',world:'light',x:10,y:53.2,need:s=>canReachLightWorldCheck(s)},
  {id:'tavern',name:'Kakariko Tavern',world:'light',x:15.9,y:57.8,need:s=>canReachLightWorldCheck(s)},
  {id:'sick_kid',name:'Sick Kid',world:'light',x:15.5,y:52.7,need:s=>canReachLightWorldCheck(s) && (s.bottle1>0||s.bottle2>0||s.bottle3>0||s.bottle4>0),checked:s=>!!(s.npcFlags&0x0004)},
  {id:'magic_bat',name:'Mad Batter',world:'light',x:31.9,y:56.5,need:s=>canReachLightWorldCheck(s) && s.powder===2,checked:s=>!!(s.npcFlags&0x8000)},
  {id:'ice_rod_cave',name:'Ice Rod Cave',world:'light',x:90.7,y:76.8,need:s=>canReachLightWorldCheck(s)},
  {id:'bombos_tablet',name:'Bombos Tablet',world:'light',x:22.6,y:92.3,need:s=>canAccessBombosTablet(s),checked:s=>!!(s.npcFlags&0x0200)},
  {id:'link_uncle',name:"Link's Uncle",world:'light',x:59.7,y:41.8,need:s=>true,checked:s=>!!(s.progressFlags&0x01)},
  {id:'maze_race',name:'Maze Race',world:'light',x:4.2,y:69.1,need:s=>canReachLightWorldCheck(s)},
  {id:'lw_hideout',name:'Lost Woods Hideout',world:'light',x:18.1,y:13,need:s=>canReachLightWorldCheck(s)},
  {id:'master_sword',name:'Master Sword Pedestal',world:'light',x:3.3,y:3.3,need:s=>canReachLightWorldCheck(s) && (s.pendants&0x07)===0x07},
  {id:'potion_shop',name:'Potion Shop (turn in mushroom)',world:'light',x:81.8,y:32.8,need:s=>canReachLightWorldCheck(s) && s.powder===1,checked:s=>!!(s.npcFlags&0x2000)},
  {id:'zora_ledge',name:"Zora's Ledge",world:'light',x:94,y:18.7,need:s=>canReachLightWorldCheck(s) && s.flippers>0},
  {id:'waterfall_fairy',name:'Waterfall Fairy',world:'light',x:89.8,y:15,need:s=>canReachLightWorldCheck(s) && s.flippers>0},
  {id:'lake_hylia_island',name:'Lake Hylia Island',world:'light',x:72.3,y:83.2,need:s=>canReachLightWorldCheck(s) && s.flippers>0},
  {id:'light_world_swamp',name:'Light World Swamp',world:'light',x:46.8,y:93.3,need:s=>canReachLightWorldCheck(s)},
  {id:'desert_ledge',name:'Desert Left Ledge',world:'light',x:2.4,y:90.7,need:s=>canAccessDesertLedge(s)},
  {id:'floating_island',name:'Floating Island',world:'light',x:80.3,y:2.4,need:s=>canAccessFloatingIsland(s)},
  {id:'spectacle_rock',name:'Spectacle Rock',world:'light',x:50.4,y:8.6,need:s=>canAccessSpectacleRock(s)},
  {id:'spectacle_rock_cave',name:'Spectacle Rock Cave',world:'light',x:48.7,y:14.8,need:s=>canReachLightWorldCheck(s) && canAccessDeathMountain(s)},
  {id:'paradox_cave',name:'Paradox Cave',world:'light',x:85.4,y:22.1,
    need:s=>canAccessEastDeathMountain(s) && s.bombs>0,
    partialNeed:s=>canAccessEastDeathMountain(s) &&
      (s.sword>=2 || s.bow>0 || s.firerod>0 || s.somaria>0)},
  {id:'king_zora',name:'King Zora',world:'light',x:94.4,y:13.5,need:s=>canReachLightWorldCheck(s) && (s.flippers>0||s.gloves>0),checked:s=>!!(s.npcFlags&0x0002)},
  {id:'spiral_cave',name:'Spiral Cave',world:'light',x:69.5,y:16.3,need:s=>canAccessEastDeathMountain(s)},
  {id:'old_man',name:'Old Man',world:'light',x:40.9,y:19.8,need:s=>canReachLightWorldCheck(s) && canAccessDeathMountain(s) && s.lamp>0,checked:s=>!!(s.npcFlags&0x0001)},
  {id:'bonk_rock',name:'Bonk Rock',world:'light',x:38.1,y:29.1,need:s=>canReachLightWorldCheck(s) && s.boots>0},
  {id:'kings_tomb',name:"King's Tomb",world:'light',x:60.8,y:29.3,need:s=>canReachLightWorldCheck(s) && s.boots>0 && s.gloves>=2},
  {id:'graveyard_ledge',name:'Graveyard Ledge',world:'light',x:56.9,y:27.5,need:s=>canAccessGraveyardLedge(s)},
  {id:'mimic_cave',name:'Mimic Cave',world:'light',x:84.1,y:9.4,need:s=>canAccessMimicCave(s)},
  {id:'spiral_cave_upper',name:'Spiral Cave',world:'light',x:79,y:9.8,need:s=>canAccessEastDeathMountain(s)},
  {id:'library',name:'Library',world:'light',x:15.3,y:65.1,need:s=>canReachLightWorldCheck(s) && s.boots>0,checked:s=>!!(s.npcFlags&0x0080)},
  {id:'frog_home',name:'Take the frog home',world:'light',x:30.1,y:52.3,need:s=>canAccessFrogHome(s),checked:s=>!!(s.npcFlags&0x0400)},
  {id:'mini_moldorm_cave',name:'Mini Moldorm Cave',world:'light',x:64.8,y:94.5,need:s=>canReachLightWorldCheck(s)},
  {id:'hobo',name:'Hobo',world:'light',x:69.9,y:69,need:s=>canReachLightWorldCheck(s) && s.flippers>0,checked:s=>!!(s.npcFlagsVanilla&0x01)},
  // Standard rain corridor — free during the prologue (Uncle → HC → Sanctuary).
  // After rain: Sanctuary is a normal LW check; Sewers stay dark without Lamp
  // (full green only with Lamp; yellow = can enter but dark rooms blocked).
  {id:'links_house',name:"Link's House",world:'light',x:54.6,y:68.4,need:s=>true},
  {id:'sanctuary',name:'Sanctuary',world:'light',x:46,y:27.2,
    need:s=>(typeof isRainState==='function'&&isRainState(s))||(typeof canReachLightWorldCheck==='function'&&canReachLightWorldCheck(s))},
  // Escape Sewers re-entry after rain: Sanctuary or HC front door — no gloves.
  // Full clear of this pin: Lamp (Dark Cross) + Bombs (Secret Room wall).
  // During rain the corridor is open; still only full-green with lamp+bombs if those checks remain.
  {id:'escape_sewers',name:'Escape Sewers',world:'light',x:51.8,y:29.7,
    need:s=>{
      const lw=typeof isRainState==='function'&&isRainState(s)
        ? true
        : (typeof canReachLightWorldCheck==='function'&&canReachLightWorldCheck(s));
      if(!lw) return false;
      return (Number(s.lamp)||0)>0 && (Number(s.bombs)||0)>0;
    },
    partialNeed:s=>{
      const lw=typeof isRainState==='function'&&isRainState(s)
        ? true
        : (typeof canReachLightWorldCheck==='function'&&canReachLightWorldCheck(s));
      if(!lw) return false;
      // Reachable, but missing lamp and/or bombs for every sewers check on this pin
      return !((Number(s.lamp)||0)>0 && (Number(s.bombs)||0)>0);
    }},
  {id:'ether_tablet',name:'Ether Tablet',world:'light',x:41.5,y:3.3,need:s=>canAccessDeathMountainSummit(s) && s.book>0 && s.sword>=2,checked:s=>!!(s.npcFlags&0x0100)},

  // ---- Dark World ----
  // Use hasDarkWorldAccess (inverted: Pearl; open/standard: Aga+Pearl / darkAccess).
  {id:'catfish',name:'Catfish',world:'dark',x:92.4,y:18.3,need:s=>canReachDarkWorldCheck(s) && s.gloves>=2,checked:s=>!!(s.npcFlags&0x0020)},
  {id:'hype_cave',name:'Hype Cave',world:'dark',x:58.6,y:78.4,need:s=>canReachDarkWorldCheck(s)},
  {id:'mire_shed',name:'Mire Shed',world:'dark',x:4.2,y:79.7,need:s=>canReachDarkWorldCheck(s)},
  {id:'brewery',name:'Brewery',world:'dark',x:10.2,y:58.5,need:s=>canReachDarkWorldCheck(s) && s.bombs>0},
  {id:'c_house',name:'C-Shaped House',world:'dark',x:20.6,y:48.3,need:s=>canReachDarkWorldCheck(s)},
  {id:'chest_game',name:'Chest Game',world:'dark',x:5.1,y:46.3,need:s=>canReachDarkWorldCheck(s)},
  {id:'bumper_ledge',name:'Bumper Cave Ledge',world:'dark',x:34.3,y:15.6,need:s=>canReachDarkWorldCheck(s) && s.cape>0},
  {id:'blacksmith',name:'Blacksmith',world:'dark',x:27,y:38.1,need:s=>canReachDarkWorldCheck(s) && s.gloves>=2,checked:s=>!!(s.npcFlags&0x0400)},
  {id:'hammer_pegs',name:'Hammer Peg Cave',world:'dark',x:31.6,y:60.9,need:s=>canReachDarkWorldCheck(s) && s.hammer>0},
  {id:'stumpy',name:'Stumpy',world:'dark',x:31.4,y:68.9,need:s=>canReachDarkWorldCheck(s),checked:s=>!!(s.npcFlags&0x0008)},
  {id:'digging_game',name:'Digging Game',world:'dark',x:6,y:70,need:s=>canReachDarkWorldCheck(s)},
  {id:'pyramid',name:'Pyramid',world:'dark',x:57.7,y:44.8,need:s=>canReachDarkWorldCheck(s)},
  {id:'hookshot_cave',name:'Hookshot Cave',world:'dark',x:83.3,y:4.4,
    need:s=>canAccessDarkDeathMountainTop(s) && hasMoonPearl(s) && s.hookshot>0,
    partialNeed:s=>canAccessDarkDeathMountainTop(s) && hasMoonPearl(s) && s.boots>0},
  {id:'pyramid_fairy',name:'Pyramid Fairy',world:'dark',x:47.3,y:47.9,need:s=>canReachDarkWorldCheck(s) && (s.crystals&0x12)===0x12},
  {id:'purple_chest',name:"Gary's Lunch Box",world:'dark',x:30.7,y:53,need:s=>canReachDarkWorldCheck(s) && s.gloves>=2,checked:s=>!!(s.npcFlagsVanilla&0x10)},
  {id:'spike_cave',name:'Spike Cave',world:'dark',x:57.7,y:15,need:s=>canAccessDarkDeathMountainWest(s) && hasMoonPearl(s) && s.hammer>0 && s.gloves>0 && (s.byrna>0||s.cape>0)},
  {id:'superbunny_cave',name:'SuperBunny Cave',world:'dark',x:85.8,y:15.4,need:s=>canAccessDarkDeathMountainTop(s)},
];

// Automatic completion sources for standard cave/chest and loose-overworld
// markers. A grouped marker clears only when every listed mask is set.
// NPC-style locations use the dedicated checked() predicates above instead.
const MAP_LOCATION_COMPLETION = {
  lumberjack:{room:0x0e2,masks:[0x200]},
  cave45:{room:0x11b,masks:[0x400]},
  checkerboard:{room:0x126,masks:[0x200]},
  aginah:{room:0x10a,masks:[0x10]},
  sahasrahla_hut:{room:0x105,masks:[0x10,0x20,0x40]},
  kakariko_well:{room:0x02f,masks:[0x10,0x20,0x40,0x80,0x100]},
  blind_hideout:{room:0x11d,masks:[0x10,0x20,0x40,0x80,0x100]},
  chicken_house:{room:0x108,masks:[0x10]},
  tavern:{room:0x103,masks:[0x10]},
  ice_rod_cave:{room:0x120,masks:[0x10]},
  maze_race:{overworld:0x28},
  lw_hideout:{room:0x0e1,masks:[0x200]},
  master_sword:{overworld:0x80},
  zora_ledge:{overworld:0x81},
  waterfall_fairy:{room:0x114,masks:[0x10,0x20]},
  lake_hylia_island:{overworld:0x35},
  light_world_swamp:{sources:[
    {room:0x10b,masks:[0x10]},
    {overworld:0x3b}
  ]},
  desert_ledge:{overworld:0x30},
  floating_island:{overworld:0x05},
  spectacle_rock:{overworld:0x03},
  spectacle_rock_cave:{room:0x0ea,masks:[0x400]},
  paradox_cave:{sources:[
    {room:0x0ef,masks:[0x10,0x20,0x40,0x80,0x100]},
    {room:0x0ff,masks:[0x10,0x20]}
  ]},
  spiral_cave:{room:0x0fe,masks:[0x10]},
  spiral_cave_upper:{room:0x0fe,masks:[0x10]},
  bonk_rock:{room:0x124,masks:[0x10]},
  kings_tomb:{room:0x113,masks:[0x10]},
  graveyard_ledge:{room:0x11b,masks:[0x200]},
  mimic_cave:{room:0x10c,masks:[0x10]},
  mini_moldorm_cave:{room:0x123,masks:[0x10,0x20,0x40,0x80,0x400]},
  links_house:{room:0x104,masks:[0x10]},
  sanctuary:{room:0x012,masks:[0x10]},
  escape_sewers:{sources:[
    {room:0x032,masks:[0x10]},
    {room:0x011,masks:[0x10,0x20,0x40]}
  ]},

  hype_cave:{room:0x11e,masks:[0x10,0x20,0x40,0x80,0x400]},
  mire_shed:{room:0x10d,masks:[0x10,0x20]},
  brewery:{room:0x106,masks:[0x10]},
  c_house:{room:0x11c,masks:[0x10]},
  chest_game:{room:0x106,masks:[0x400]},
  bumper_ledge:{overworld:0x4a},
  hammer_pegs:{room:0x127,masks:[0x400]},
  digging_game:{overworld:0x68},
  pyramid:{overworld:0x5b},
  hookshot_cave:{room:0x03c,masks:[0x10,0x20,0x40,0x80]},
  pyramid_fairy:{room:0x116,masks:[0x10,0x20]},
  spike_cave:{room:0x117,masks:[0x10]},
  superbunny_cave:{room:0x0f8,masks:[0x10,0x20]}
};

// Hyrule Castle / Escape has seven dungeon checks. Sanctuary is deliberately
// omitted because it is represented by its own standalone map marker.
const HYRULE_CASTLE_COMPLETION = {sources:[
  {room:0x071,masks:[0x10]},
  {room:0x072,masks:[0x10]},
  {room:0x080,masks:[0x10]},
  {room:0x032,masks:[0x10]},
  {room:0x011,masks:[0x10,0x20,0x40]}
]};

const DUNGEONS = [
  {id:'hc',key:'hyruleCastle',abbr:'HC',name:'Hyrule Castle / Escape',world:'light',x:49.5,y:39.5,prizeBit:null,entryNeed:s=>canEnterDungeon('hyruleCastle',s),need:s=>canCompleteDungeon('hyruleCastle',s)},
  {id:'at',key:'agahnimsTower',abbr:'AT',name:"Agahnim's Tower",world:'light',x:49.6,y:49,prizeBit:null,entryNeed:s=>canEnterDungeon('agahnimsTower',s),need:s=>canCompleteDungeon('agahnimsTower',s)},
  {id:'ep',key:'easternPalace',abbr:'EP',name:'Eastern Palace',world:'light',x:95.5,y:40.4,prizeBit:'pendant',mask:0x04,entryNeed:s=>canEnterDungeon('easternPalace',s),need:s=>canCompleteDungeon('easternPalace',s)},
  {id:'dp',key:'desertPalace',abbr:'DP',name:'Desert Palace',world:'light',x:6.9,y:79.5,prizeBit:'pendant',mask:0x02,entryNeed:s=>canEnterDungeon('desertPalace',s),need:s=>canCompleteDungeon('desertPalace',s)},
  {id:'toh',key:'towerOfHera',abbr:'ToH',name:'Tower of Hera',world:'light',x:58.2,y:3.3,prizeBit:'pendant',mask:0x01,entryNeed:s=>canEnterDungeon('towerOfHera',s),need:s=>canCompleteDungeon('towerOfHera',s)},
  {id:'pod',key:'palaceOfDarkness',abbr:'PoD',name:'Palace of Darkness',world:'dark',x:94.8,y:41,prizeBit:'crystal',mask:0x02,entryNeed:s=>canEnterDungeon('palaceOfDarkness',s),need:s=>canCompleteDungeon('palaceOfDarkness',s)},
  {id:'sp',key:'swampPalace',abbr:'SP',name:'Swamp Palace',world:'dark',x:47.1,y:93.3,prizeBit:'crystal',mask:0x10,entryNeed:s=>canEnterDungeon('swampPalace',s),need:s=>canCompleteDungeon('swampPalace',s)},
  {id:'sw',key:'skullWoods',abbr:'SW',name:'Skull Woods',world:'dark',x:6.5,y:5,prizeBit:'crystal',mask:0x40,entryNeed:s=>canEnterDungeon('skullWoods',s),need:s=>canCompleteDungeon('skullWoods',s)},
  {id:'tt',key:'thievesTown',abbr:'TT',name:'Thieves Town',world:'dark',x:13,y:48.3,prizeBit:'crystal',mask:0x20,entryNeed:s=>canEnterDungeon('thievesTown',s),need:s=>canCompleteDungeon('thievesTown',s)},
  {id:'ip',key:'icePalace',abbr:'IP',name:'Ice Palace',world:'dark',x:79.6,y:85.9,prizeBit:'crystal',mask:0x04,entryNeed:s=>canEnterDungeon('icePalace',s),need:s=>canCompleteDungeon('icePalace',s)},
  {id:'mm',key:'miseryMire',abbr:'MM',name:'Misery Mire',world:'dark',x:9.2,y:81.6,prizeBit:'crystal',mask:0x01<<0,special:'mm',
    entryNeed:s=>canEnterDungeon('miseryMire',s), need:s=>canCompleteDungeon('miseryMire',s)},
  {id:'tr',key:'turtleRock',abbr:'TR',name:'Turtle Rock',world:'dark',x:93.3,y:6.4,prizeBit:'crystal',mask:0x08,special:'tr',
    entryNeed:s=>canEnterDungeon('turtleRock',s), need:s=>canCompleteDungeon('turtleRock',s)},
  {id:'gt',key:'ganonsTower',abbr:'GT',name:"Ganon's Tower",world:'dark',x:56.4,y:3.4,prizeBit:null,entryNeed:s=>canEnterDungeon('ganonsTower',s),need:s=>canCompleteDungeon('ganonsTower',s)}
];

const DEFAULT_MAP_INFO = 'Red is inaccessible, yellow is partial, and green is fully completable. Hover a marker for its screenshot guide. Every official marker clears automatically when all of its checks are collected.';
