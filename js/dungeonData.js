/* ============================================================
   dungeonData.js

   Contains dungeon layouts and location requirements.

   No UI.
   No scoring.
   Just data.
   ============================================================ */

// keys = minimum small keys from this dungeon needed to reach the check
// (no-glitches). Only enforced when small keys are shuffled (keysanity / keys / mcs).
const dungeonLocation=(id,name,requires=[],weight=10,priority=0,screenshots=null,keys=0)=>({
  id,name,requires,weight,priority,screenshots,keys:keys||0
});

const DUNGEON_DATA = {
  hyruleCastle:{
    name:"Hyrule Castle / Escape",boss:null,
    locations:[
      dungeonLocation("boomerang","Boomerang Chest",["combat"]),
      dungeonLocation("map","Map Chest",["combat"]),
      dungeonLocation("zelda","Zelda's Chest",["combat"]),
      dungeonLocation("darkCross","Sewers — Dark Cross",["lamp"]),
      dungeonLocation("secretLeft","Secret Room — Left",["bombs"],10,0,["secretRoom","secretChests"]),
      dungeonLocation("secretMiddle","Secret Room — Middle",["bombs"],10,0,["secretRoom","secretChests"]),
      dungeonLocation("secretRight","Secret Room — Right",["bombs"],10,0,["secretRoom","secretChests"])
    ]
  },
  agahnimsTower:{
    name:"Agahnim's Tower",boss:"Agahnim",
    locations:[
      dungeonLocation("room03","Room 03",["combat"]),
      dungeonLocation("darkMaze","Dark Maze",["combat","lamp"],10,0,null,1),
      dungeonLocation("darkArcher","Dark Archer Key Drop",["combat","lamp"],10,0,null,1),
      dungeonLocation("circlePots","Circle of Pots Key Drop",["combat","lamp"],10,0,null,2)
    ]
  },
  easternPalace:{
    name:"Eastern Palace",boss:"Armos Knights",
    locations:[
      // EP has no small keys in the item pool.
      dungeonLocation("cannonball","Cannonball Chest"),
      dungeonLocation("map","Map Chest"),
      dungeonLocation("compass","Compass Chest"),
      dungeonLocation("bigKey","Big Key Chest",["combat"],15),
      dungeonLocation("bigChest","Big Chest",["bow"],15),
      dungeonLocation("boss","Armos Knights",["bow"],25,100)
    ]
  },
  desertPalace:{
    name:"Desert Palace",boss:"Lanmolas",
    locations:[
      dungeonLocation("bigChest","Big Chest",[],15),
      dungeonLocation("torch","Torch",["boots"]),
      dungeonLocation("map","Map Chest"),
      dungeonLocation("compass","Compass Chest",[],10,0,null,1),
      dungeonLocation("bigKey","Big Key Chest",["combat"],15,0,null,1),
      dungeonLocation("boss","Lanmolas",["gloves","fire","combat"],25,100,null,1)
    ]
  },
  towerOfHera:{
    name:"Tower of Hera",boss:"Moldorm",
    locations:[
      dungeonLocation("basementCage","Basement Cage",["crystalSwitch"]),
      dungeonLocation("map","Map Chest",["crystalSwitch"]),
      dungeonLocation("bigKey","Big Key Chest",["fire"],15,0,null,1),
      dungeonLocation("compass","Compass Chest",[],10,0,null,1),
      dungeonLocation("bigChest","Big Chest",[],15,0,null,1),
      dungeonLocation("boss","Moldorm",["combat"],25,100,null,1)
    ]
  },
  palaceOfDarkness:{
    name:"Palace of Darkness",boss:"Helmasaur King",
    locations:[
      dungeonLocation("shooter","Shooter Room"),
      dungeonLocation("arenaBridge","Arena — Bridge"),
      dungeonLocation("stalfos","Stalfos Basement",["bombs"]),
      dungeonLocation("bigKey","Big Key Chest",[],15,0,null,1),
      dungeonLocation("arenaLedge","Arena — Ledge",["bombs"]),
      dungeonLocation("map","Map Chest"),
      dungeonLocation("compass","Compass Chest",[],10,0,null,2),
      dungeonLocation("darkBasementLeft","Dark Basement — Left",["lamp"],10,0,null,1),
      dungeonLocation("darkBasementRight","Dark Basement — Right",["lamp"],10,0,null,1),
      dungeonLocation("darkMazeTop","Dark Maze — Top",["lamp"],10,0,null,2),
      dungeonLocation("darkMazeBottom","Dark Maze — Bottom",["lamp"],10,0,null,2),
      dungeonLocation("bigChest","Big Chest",["bombs"],15,0,null,1),
      dungeonLocation("hellway","Harmless Hellway",[],10,0,null,3),
      dungeonLocation("boss","Helmasaur King",["bow","hammer","lamp","combat"],25,100,null,4)
    ]
  },
  swampPalace:{
    name:"Swamp Palace",boss:"Arrghus",
    locations:[
      dungeonLocation("entrance","Entrance Chest"),
      dungeonLocation("map","Map Chest",["bombs"],10,0,null,1),
      dungeonLocation("bigChest","Big Chest",[],15,0,null,1),
      dungeonLocation("compass","Compass Chest",["hookshot"],10,0,null,1),
      dungeonLocation("bigKey","Big Key Chest",["hookshot"],15,0,null,1),
      dungeonLocation("west","West Chest",["hookshot"],10,0,null,1),
      dungeonLocation("floodedLeft","Flooded Room — Left",["hookshot"],10,0,null,1),
      dungeonLocation("floodedRight","Flooded Room — Right",["hookshot"],10,0,null,1),
      dungeonLocation("waterfall","Waterfall Room",["hookshot"],10,0,null,1),
      dungeonLocation("boss","Arrghus",["hookshot","hammer","combat"],25,100,null,1)
    ]
  },
  skullWoods:{
    name:"Skull Woods",boss:"Mothula",
    locations:[
      dungeonLocation("compass","Compass Chest"),
      dungeonLocation("map","Map Chest"),
      dungeonLocation("bigChest","Big Chest",["bombs"],15),
      dungeonLocation("potPrison","Pot Prison"),
      dungeonLocation("pinball","Pinball Room"),
      dungeonLocation("bigKey","Big Key Chest",[],15),
      dungeonLocation("bridge","Bridge Room",["firerod"]),
      dungeonLocation("boss","Mothula",["firerod","combat"],25,100,null,2)
    ]
  },
  thievesTown:{
    name:"Thieves Town",boss:"Blind",
    locations:[
      dungeonLocation("bigKey","Big Key Chest",[],15),
      dungeonLocation("map","Map Chest"),
      dungeonLocation("compass","Compass Chest"),
      dungeonLocation("ambush","Ambush Chest"),
      dungeonLocation("attic","Attic",[],10,0,null,1),
      dungeonLocation("bigChest","Big Chest",["hammer"],15),
      dungeonLocation("blindCell","Blind's Cell",[],10,0,null,1),
      dungeonLocation("boss","Blind",["combat"],25,100,null,1)
    ]
  },
  icePalace:{
    name:"Ice Palace",boss:"Kholdstare",
    locations:[
      dungeonLocation("compass","Compass Chest",["melt"]),
      dungeonLocation("freezor","Freezor Chest",["melt"]),
      dungeonLocation("bigChest","Big Chest",[],15),
      dungeonLocation("icedT","Iced T Room",["hammer"]),
      dungeonLocation("spike","Spike Room",["spikeSafe"]),
      dungeonLocation("bigKey","Big Key Chest",["hammer","gloves"],15,0,null,1),
      dungeonLocation("map","Map Chest",["hammer","gloves"],10,0,null,1),
      dungeonLocation("boss","Kholdstare",["melt","hammer","combat"],25,100,null,2)
    ]
  },
  miseryMire:{
    name:"Misery Mire",boss:"Vitreous",
    locations:[
      dungeonLocation("bigChest","Big Chest",[],15),
      dungeonLocation("map","Map Chest",["crystalSwitch"]),
      dungeonLocation("mainLobby","Main Lobby",["crystalSwitch"]),
      dungeonLocation("bridge","Bridge Chest",["bootsOrHookshot"]),
      dungeonLocation("spike","Spike Chest",["spikeSafe"]),
      dungeonLocation("compass","Compass Chest",["fire"],10,0,null,1),
      dungeonLocation("bigKey","Big Key Chest",["fire"],15,0,null,1),
      dungeonLocation("boss","Vitreous",["somaria","bombs","combat"],25,100,null,2)
    ]
  },
  turtleRock:{
    name:"Turtle Rock",boss:"Trinexx",
    locations:[
      dungeonLocation("compass","Compass Chest",["somaria"]),
      dungeonLocation("rollerLeft","Roller Room — Left",["somaria","firerod"]),
      dungeonLocation("rollerRight","Roller Room — Right",["somaria","firerod"]),
      dungeonLocation("chainChomps","Chain Chomps",["rangedCombat"],10,0,null,1),
      dungeonLocation("bigKey","Big Key Chest",["somaria"],15,0,null,2),
      dungeonLocation("bigChest","Big Chest",["somariaOrHookshot"],15,0,null,2),
      dungeonLocation("crystaroller","Crystaroller Room",["somaria"],10,0,null,2),
      dungeonLocation("eyeBottomLeft","Eye Bridge — Bottom Left",["eyeBridgeSafe"],10,0,null,3),
      dungeonLocation("eyeBottomRight","Eye Bridge — Bottom Right",["eyeBridgeSafe"],10,0,null,3),
      dungeonLocation("eyeTopLeft","Eye Bridge — Top Left",["eyeBridgeSafe"],10,0,null,3),
      dungeonLocation("eyeTopRight","Eye Bridge — Top Right",["eyeBridgeSafe"],10,0,null,3),
      dungeonLocation("boss","Trinexx",["somaria","firerod","icerod","combat"],25,100,null,3)
    ]
  },
  ganonsTower:{
    name:"Ganon's Tower",boss:"Agahnim 2",
    locations:[
      dungeonLocation("bobsTorch","Bob's Torch",["boots"]),
      dungeonLocation("hopeLeft","Hope Room — Left"),
      dungeonLocation("hopeRight","Hope Room — Right"),
      dungeonLocation("tile","Tile Room",["somaria"]),
      dungeonLocation("compassTL","Compass Room — Top Left",["firerod","bombsOrSomaria"]),
      dungeonLocation("compassTR","Compass Room — Top Right",["firerod","bombsOrSomaria"]),
      dungeonLocation("compassBL","Compass Room — Bottom Left",["firerod","bombsOrSomaria"]),
      dungeonLocation("compassBR","Compass Room — Bottom Right",["firerod","bombsOrSomaria"]),
      dungeonLocation("dmsTL","DMs Room — Top Left",["hammer","hookshotOrBoots"]),
      dungeonLocation("dmsTR","DMs Room — Top Right",["hammer","hookshotOrBoots"]),
      dungeonLocation("dmsBL","DMs Room — Bottom Left",["hammer","hookshotOrBoots"]),
      dungeonLocation("dmsBR","DMs Room — Bottom Right",["hammer","hookshotOrBoots"]),
      dungeonLocation("map","Map Chest",["hammer","hookshotOrBoots"]),
      dungeonLocation("firesnake","Firesnake Room",[],10,0,null,1),
      dungeonLocation("randomTL","Randomizer Room — Top Left",["bombs"],10,0,null,1),
      dungeonLocation("randomTR","Randomizer Room — Top Right",["bombs"],10,0,null,1),
      dungeonLocation("randomBL","Randomizer Room — Bottom Left",["bombs"],10,0,null,1),
      dungeonLocation("randomBR","Randomizer Room — Bottom Right",["bombs"],10,0,null,1),
      dungeonLocation("bobsChest","Bob's Chest",[],10,0,null,1),
      dungeonLocation("bigChest","Big Chest",[],15,0,null,1),
      dungeonLocation("bigKeyLeft","Big Key Room — Left",["bombs","combat"],10,0,null,1),
      dungeonLocation("bigKeyRight","Big Key Room — Right",["bombs","combat"],10,0,null,1),
      dungeonLocation("bigKey","Big Key Chest",["bombs","combat"],15,0,null,1),
      dungeonLocation("miniHelmaLeft","Mini Helmasaur Room — Left",["combat"],10,0,null,2),
      dungeonLocation("miniHelmaRight","Mini Helmasaur Room — Right",["combat"],10,0,null,2),
      dungeonLocation("preMoldorm","Pre-Moldorm Chest",["bombs","fire","bow"],10,0,null,2),
      dungeonLocation("validation","Validation Chest",["hookshot","combat"],15,0,null,2)
    ]
  }
};

// Exact SRAM room flags for every check shown in the dungeon guide. These
// match the randomizer/SNI underworld location table, so checks sharing a room
// can still be colored independently instead of guessing from the dungeon's
// aggregate counter.
const dungeonCheckSource=(room,mask)=>({room,masks:[mask]});

const DUNGEON_LOCATION_COMPLETION = {
  hyruleCastle:{
    boomerang:dungeonCheckSource(0x71,0x10),
    map:dungeonCheckSource(0x72,0x10),
    zelda:dungeonCheckSource(0x80,0x10),
    darkCross:dungeonCheckSource(0x32,0x10),
    secretLeft:dungeonCheckSource(0x11,0x10),
    secretMiddle:dungeonCheckSource(0x11,0x20),
    secretRight:dungeonCheckSource(0x11,0x40)
  },
  agahnimsTower:{
    room03:dungeonCheckSource(0xE0,0x10),
    darkMaze:dungeonCheckSource(0xD0,0x10),
    darkArcher:dungeonCheckSource(0xC0,0x400),
    circlePots:dungeonCheckSource(0xB0,0x400)
  },
  easternPalace:{
    cannonball:dungeonCheckSource(0xB9,0x10),
    map:dungeonCheckSource(0xAA,0x10),
    compass:dungeonCheckSource(0xA8,0x10),
    bigKey:dungeonCheckSource(0xB8,0x10),
    bigChest:dungeonCheckSource(0xA9,0x10),
    boss:dungeonCheckSource(0xC8,0x800)
  },
  desertPalace:{
    bigChest:dungeonCheckSource(0x73,0x10),
    torch:dungeonCheckSource(0x73,0x400),
    map:dungeonCheckSource(0x74,0x10),
    compass:dungeonCheckSource(0x85,0x10),
    bigKey:dungeonCheckSource(0x75,0x10),
    boss:dungeonCheckSource(0x33,0x800)
  },
  towerOfHera:{
    basementCage:dungeonCheckSource(0x87,0x400),
    map:dungeonCheckSource(0x77,0x10),
    bigKey:dungeonCheckSource(0x87,0x10),
    compass:dungeonCheckSource(0x27,0x20),
    bigChest:dungeonCheckSource(0x27,0x10),
    boss:dungeonCheckSource(0x07,0x800)
  },
  palaceOfDarkness:{
    shooter:dungeonCheckSource(0x09,0x10),
    arenaBridge:dungeonCheckSource(0x2A,0x20),
    stalfos:dungeonCheckSource(0x0A,0x10),
    bigKey:dungeonCheckSource(0x3A,0x10),
    arenaLedge:dungeonCheckSource(0x2A,0x10),
    map:dungeonCheckSource(0x2B,0x10),
    compass:dungeonCheckSource(0x1A,0x20),
    darkBasementLeft:dungeonCheckSource(0x6A,0x10),
    darkBasementRight:dungeonCheckSource(0x6A,0x20),
    darkMazeTop:dungeonCheckSource(0x19,0x10),
    darkMazeBottom:dungeonCheckSource(0x19,0x20),
    bigChest:dungeonCheckSource(0x1A,0x10),
    hellway:dungeonCheckSource(0x1A,0x40),
    boss:dungeonCheckSource(0x5A,0x800)
  },
  swampPalace:{
    entrance:dungeonCheckSource(0x28,0x10),
    map:dungeonCheckSource(0x37,0x10),
    bigChest:dungeonCheckSource(0x36,0x10),
    compass:dungeonCheckSource(0x46,0x10),
    bigKey:dungeonCheckSource(0x35,0x10),
    west:dungeonCheckSource(0x34,0x10),
    floodedLeft:dungeonCheckSource(0x76,0x10),
    floodedRight:dungeonCheckSource(0x76,0x20),
    waterfall:dungeonCheckSource(0x66,0x10),
    boss:dungeonCheckSource(0x06,0x800)
  },
  skullWoods:{
    compass:dungeonCheckSource(0x67,0x10),
    map:dungeonCheckSource(0x58,0x20),
    bigChest:dungeonCheckSource(0x58,0x10),
    potPrison:dungeonCheckSource(0x57,0x20),
    pinball:dungeonCheckSource(0x68,0x10),
    bigKey:dungeonCheckSource(0x57,0x10),
    bridge:dungeonCheckSource(0x59,0x10),
    boss:dungeonCheckSource(0x29,0x800)
  },
  thievesTown:{
    bigKey:dungeonCheckSource(0xDB,0x20),
    map:dungeonCheckSource(0xDB,0x10),
    compass:dungeonCheckSource(0xDC,0x10),
    ambush:dungeonCheckSource(0xCB,0x10),
    attic:dungeonCheckSource(0x65,0x10),
    bigChest:dungeonCheckSource(0x44,0x10),
    blindCell:dungeonCheckSource(0x45,0x10),
    boss:dungeonCheckSource(0xAC,0x800)
  },
  icePalace:{
    compass:dungeonCheckSource(0x2E,0x10),
    freezor:dungeonCheckSource(0x7E,0x10),
    bigChest:dungeonCheckSource(0x9E,0x10),
    icedT:dungeonCheckSource(0xAE,0x10),
    spike:dungeonCheckSource(0x5F,0x10),
    bigKey:dungeonCheckSource(0x1F,0x10),
    map:dungeonCheckSource(0x3F,0x10),
    boss:dungeonCheckSource(0xDE,0x800)
  },
  miseryMire:{
    bigChest:dungeonCheckSource(0xC3,0x10),
    map:dungeonCheckSource(0xC3,0x20),
    mainLobby:dungeonCheckSource(0xC2,0x10),
    bridge:dungeonCheckSource(0xA2,0x10),
    spike:dungeonCheckSource(0xB3,0x10),
    compass:dungeonCheckSource(0xC1,0x10),
    bigKey:dungeonCheckSource(0xD1,0x10),
    boss:dungeonCheckSource(0x90,0x800)
  },
  turtleRock:{
    compass:dungeonCheckSource(0xD6,0x10),
    rollerLeft:dungeonCheckSource(0xB7,0x10),
    rollerRight:dungeonCheckSource(0xB7,0x20),
    chainChomps:dungeonCheckSource(0xB6,0x10),
    bigKey:dungeonCheckSource(0x14,0x10),
    bigChest:dungeonCheckSource(0x24,0x10),
    crystaroller:dungeonCheckSource(0x04,0x10),
    eyeBottomLeft:dungeonCheckSource(0xD5,0x80),
    eyeBottomRight:dungeonCheckSource(0xD5,0x40),
    eyeTopLeft:dungeonCheckSource(0xD5,0x20),
    eyeTopRight:dungeonCheckSource(0xD5,0x10),
    boss:dungeonCheckSource(0xA4,0x800)
  },
  ganonsTower:{
    bobsTorch:dungeonCheckSource(0x8C,0x400),
    hopeLeft:dungeonCheckSource(0x8C,0x20),
    hopeRight:dungeonCheckSource(0x8C,0x40),
    tile:dungeonCheckSource(0x8D,0x10),
    compassTL:dungeonCheckSource(0x9D,0x10),
    compassTR:dungeonCheckSource(0x9D,0x20),
    compassBL:dungeonCheckSource(0x9D,0x40),
    compassBR:dungeonCheckSource(0x9D,0x80),
    dmsTL:dungeonCheckSource(0x7B,0x10),
    dmsTR:dungeonCheckSource(0x7B,0x20),
    dmsBL:dungeonCheckSource(0x7B,0x40),
    dmsBR:dungeonCheckSource(0x7B,0x80),
    map:dungeonCheckSource(0x8B,0x10),
    firesnake:dungeonCheckSource(0x7D,0x10),
    randomTL:dungeonCheckSource(0x7C,0x10),
    randomTR:dungeonCheckSource(0x7C,0x20),
    randomBL:dungeonCheckSource(0x7C,0x40),
    randomBR:dungeonCheckSource(0x7C,0x80),
    bobsChest:dungeonCheckSource(0x8C,0x80),
    bigChest:dungeonCheckSource(0x8C,0x10),
    bigKeyLeft:dungeonCheckSource(0x1C,0x20),
    bigKeyRight:dungeonCheckSource(0x1C,0x40),
    bigKey:dungeonCheckSource(0x1C,0x10),
    miniHelmaLeft:dungeonCheckSource(0x3D,0x10),
    miniHelmaRight:dungeonCheckSource(0x3D,0x20),
    preMoldorm:dungeonCheckSource(0x3D,0x40),
    validation:dungeonCheckSource(0x4D,0x10)
  }
};

/* ============================================================
   Dungeon completion-time baselines

   These are intentionally broad, practice-mode estimates for the
   time spent inside each dungeon after reaching its entrance. The
   live estimate scales these ranges by the number of checks left.
   Travel time is kept separate for the dynamic-routing phase.

   full:    expected range for a fresh full clear
   reentry: minimum overhead when returning for only a few checks
   ============================================================ */

const DUNGEON_TIME_PROFILES = {

    hyruleCastle:      { full:[6, 9],  reentry:[2, 4] },
    easternPalace:     { full:[5, 8],  reentry:[2, 3] },
    desertPalace:      { full:[6, 9],  reentry:[2, 4] },
    towerOfHera:       { full:[5, 8],  reentry:[2, 4] },
    agahnimsTower:     { full:[5, 8],  reentry:[2, 4] },
    palaceOfDarkness:  { full:[11,16], reentry:[3, 5] },
    swampPalace:       { full:[10,15], reentry:[3, 5] },
    skullWoods:        { full:[7, 11], reentry:[2, 4] },
    thievesTown:       { full:[8, 12], reentry:[3, 5] },
    icePalace:         { full:[10,16], reentry:[3, 6] },
    miseryMire:        { full:[9, 14], reentry:[3, 5] },
    turtleRock:        { full:[12,18], reentry:[4, 7] },
    ganonsTower:       { full:[18,27], reentry:[5, 9] }

};
