/* ============================================================
   memory.js
   ALttP save-data parsing. Pure functions: take raw bytes read
   from WRAM and turn them into plain state objects. No DOM
   access, no network, no globals besides the medallion choices
   (set from the UI in map.js) and the constants in constants.js.
   ============================================================ */

function parseDungeonStats(d,locationFlags=null){
  // Current ALttPR ROMs can mirror Hyrule Castle progress into both the
  // Sewers and Castle bytes. Adding them produces impossible values such
  // as 16 / 8, so use the furthest observed progress from the pair.
  const exactHyruleCastle = getMapLocationProgress(
    locationFlags,
    HYRULE_CASTLE_COMPLETION
  );
  const hyruleCastleChecked = exactHyruleCastle
    ? exactHyruleCastle.found
    : Math.min(
        DUNGEON_TOTALS.hyruleCastle,
        Math.max(d[0] || 0,d[1] || 0)
      );

  return{
    hyruleCastle:hyruleCastleChecked,
    easternPalace:d[2], desertPalace:d[3], agahnimsTower:d[4],
    swampPalace:d[5], palaceOfDarkness:d[6], miseryMire:d[7],
    skullWoods:d[8], icePalace:d[9], towerOfHera:d[10],
    thievesTown:d[11], turtleRock:d[12], ganonsTower:d[13]
  };
}

function resolveCurrentDungeon(gameMode,dungeonId,previous=null){
  // Module $07 is normal indoor/dungeon gameplay. Caves use the same module,
  // but report no mapped dungeon ID, so they correctly return null.
  if(gameMode===0x07){
    return DUNGEON_ID_TO_KEY[dungeonId] || null;
  }

  // These are stable outdoor gameplay modules. Clear the override as soon as
  // the player returns to the world map.
  if(gameMode===0x09 || gameMode===0x0B){
    return null;
  }

  // Keep the current dungeon through short door/fade/menu transition modules
  // so Best Play does not flicker while moving between rooms.
  return previous;
}

function encodePlayerNameTile(selectionCode){
  // This is the same conversion used by ALttP's name-entry routine before
  // the selected character is written to save data.
  return ((selectionCode&0xF0)<<1)+(selectionCode&0x0F);
}

const PLAYER_NAME_GLYPHS=(()=>{
  const glyphs=new Map();
  const add=(text,selectionCodes)=>{
    Array.from(text).forEach((character,index)=>{
      glyphs.set(encodePlayerNameTile(selectionCodes[index]),character);
    });
  };
  const range=(start,count)=>Array.from({length:count},(_,index)=>start+index);

  // Current ALttPR Latin alphabet and the added numeric row.
  add('ABCDEFGHIJKLMNOPQRSTUVWXYZ',range(0xAA,26));
  add('abcdefghijklmnopqrstuvwxy',range(0xD0,25));
  add('z',[0x9A]);
  add('0123456789',range(0xA0,10));

  // Japanese characters retained by the current randomizer name screen.
  add('あいうえお',[0x00,0x01,0x02,0x03,0x04]);
  add('かきくけこ',[0x08,0x09,0x0A,0x0B,0x0C]);
  add('さしすせそ',[0x10,0x11,0x12,0x13,0x14]);
  add('たちつてと',[0x18,0x19,0x1A,0x1B,0x1C]);
  add('なにぬねの',[0x20,0x21,0x22,0x23,0x24]);
  add('はひふへほ',[0x28,0x29,0x2A,0x2B,0x2C]);
  add('まみむめも',[0x30,0x31,0x32,0x33,0x34]);
  add('やゆよ',[0x05,0x06,0x07]);
  add('らりるれろ',[0x38,0x39,0x3A,0x3B,0x3C]);
  add('わをん',[0x0D,0x0E,0x0F]);

  add('がぎぐげご',[0x15,0x16,0x17,0x1D,0x1E]);
  add('ざじずぜぞ',[0x1F,0x25,0x26,0x27,0x2D]);
  add('だぢづでど',[0x2E,0x2F,0x35,0x36,0x37]);
  add('ばびぶべぼ',[0x3D,0x3E,0x3F,0x40,0x41]);
  add('ぱぴぷぺぽ',[0x42,0x43,0x44,0x45,0x46]);

  add('アイウエオ',[0x50,0x51,0x52,0x53,0x54]);
  add('カキクケコ',[0x58,0x59,0x5A,0x5B,0x5C]);
  add('サシスセソ',[0x60,0x61,0x62,0x63,0x64]);
  add('タチツテト',[0x68,0x69,0x6A,0x6B,0x6C]);
  add('ナニヌネノ',[0x70,0x71,0x72,0x73,0x74]);
  add('ハヒフヘホ',[0x78,0x79,0x7A,0x7B,0x7C]);
  add('マミムメモ',[0x80,0x81,0x82,0x83,0x84]);
  add('ヤユヨ',[0x55,0x56,0x57]);
  add('ラリルレロ',[0x88,0x89,0x8A,0x8B,0x8C]);
  add('ワヲン',[0x5D,0x5E,0x5F]);

  add('ガギグゲゴ',[0x65,0x66,0x67,0x6D,0x6E]);
  add('ザジズゼゾ',[0x6F,0x75,0x76,0x77,0x7D]);
  add('ダヂヅデド',[0x7E,0x7F,0x85,0x86,0x87]);
  add('バビブベボ',[0x8D,0x8E,0x8F,0x90,0x91]);
  add('パピプペポ',[0x92,0x93,0x94,0x95,0x96]);
  add('ァィゥェォ',[0xE9,0xEA,0xEB,0xEC,0xC6]);
  add('－〜',[0xC9,0xCE]);

  return glyphs;
})();

function decodePlayerName(d){
  if(!d || d.length<PLAYER_NAME_LEN) return 'LINK';

  const chars=[];
  for(let i=0;i<PLAYER_NAME_CHARS;i++){
    const offset=i*2;
    const code=d[offset]+(d[offset+1]<<8);
    if(code===0x00A9 || code===0x018C || code===0xFFFF) continue;
    chars.push(PLAYER_NAME_GLYPHS.get(code) || '?');
  }

  return chars.join('').trim() || 'LINK';
}

function parseDungeonItemBits(lo,hi){
  const bytes = [lo || 0, hi || 0];
  const out = {};
  for(const [key,info] of Object.entries(DUNGEON_ITEM_BITS)){
    out[key] = (bytes[info.byte] & info.mask) !== 0;
  }
  return out;
}

function parseDungeonKeyCounts(d){
  // Raw 14-byte table at $7EF37C. Sewers + HC are merged for the UI.
  const raw = {};
  DUNGEON_KEY_ORDER.forEach((key,index)=>{
    const value = d[DUNGEON_KEYS_OFF + index];
    raw[key] = (value === 0xFF || value === undefined) ? 0 : (value & 0xFF);
  });
  const merged = {};
  DUNGEON_STAT_LABELS.forEach(([key])=>{
    if(key === 'hyruleCastle'){
      merged[key] = (raw.sewers || 0) + (raw.hyruleCastle || 0);
    }else{
      merged[key] = raw[key] || 0;
    }
  });
  return merged;
}

function parseSave(d){
  const u16 = (lo,hi)=> d[lo] + (d[hi]<<8);
  const progress = d[0x85]; // $7EF3C5: 0=bed,1=uncle item,2=Zelda rescued (rain ends),3=Aga1
  const progressFlags = d[0x86] || 0;       // $7EF3C6: bit 0 = Uncle item obtained
  const npcFlagsVanilla = d[0x89] || 0;     // $7EF3C9: Bottle Merchant, Hobo, followers
  const npcFlags = u16(0xD0,0xD1) || 0;     // $7EF410: rando NPC/item completion flags
  return{
    bow:d[0], boomerang:d[1], hookshot:d[2], bombs:d[3], powder:d[4],
    firerod:d[5], icerod:d[6], bombos:d[7], ether:d[8], quake:d[9],
    lamp:d[10], hammer:d[11], flute:d[12], net:d[13], book:d[14],
    somaria:d[16], byrna:d[17], cape:d[18], mirror:d[19],
    gloves:d[20], boots:d[21], flippers:d[22], moonpearl:d[23],
    sword:d[25], shield:d[26], armor:d[27],
    bottle1:d[28], bottle2:d[29], bottle3:d[30], bottle4:d[31],
    rupees:u16(34,35),
    healthCap:d[44], health:d[45], magic:d[46], keys:d[47],
    pendants:d[52], arrows:d[55], crystals:d[58],
    // Keysanity ownership — always parsed (inside existing READ_LEN).
    compass: parseDungeonItemBits(d[COMPASS_OFF], d[COMPASS_OFF + 1]),
    bigKey:  parseDungeonItemBits(d[BIGKEY_OFF],  d[BIGKEY_OFF + 1]),
    map:     parseDungeonItemBits(d[MAP_OFF],     d[MAP_OFF + 1]),
    dungeonKeys: parseDungeonKeyCounts(d),
    progress:progress,
    progressFlags:progressFlags,
    npcFlagsVanilla:npcFlagsVanilla,
    npcFlags:npcFlags,
    agahnim: progress>=3,
    darkAccess: progress>=3 && d[23]>0 // beat Agahnim + have Moon Pearl
  };
}

function parseLocationFlags(d){
  return new Uint8Array(d);
}

function getMapLocationProgress(locationFlags,source){
  if(!locationFlags || !source) return null;

  if(Array.isArray(source.sources)){
    const parts=source.sources
      .map(part=>getMapLocationProgress(locationFlags,part))
      .filter(Boolean);
    if(!parts.length) return null;
    const found=parts.reduce((total,part)=>total+part.found,0);
    const total=parts.reduce((sum,part)=>sum+part.total,0);
    return{found,total,complete:total>0 && found===total};
  }

  if(Number.isInteger(source.overworld)){
    const offset=0x280+source.overworld;
    if(offset>=locationFlags.length) return null;
    const found=(locationFlags[offset]&0x40)!==0 ? 1 : 0;
    return{found,total:1,complete:found===1};
  }

  if(Number.isInteger(source.room) && Array.isArray(source.masks)){
    const offset=source.room*2;
    if(offset+1>=locationFlags.length) return null;
    const roomFlags=locationFlags[offset] | (locationFlags[offset+1]<<8);
    const found=source.masks.reduce((count,mask)=>count+((roomFlags&mask)!==0?1:0),0);
    return{found,total:source.masks.length,complete:found===source.masks.length};
  }

  return null;
}

function hasMedallion(state,choice){
  if(choice==='bombos') return state.bombos>0;
  if(choice==='ether') return state.ether>0;
  if(choice==='quake') return state.quake>0;
  return state.bombos>0 || state.ether>0 || state.quake>0; // unknown: optimistic
}

function crystalCount(state){
  let c=0; for(let i=0;i<7;i++) if(state.crystals&(1<<i)) c++; return c;
}
