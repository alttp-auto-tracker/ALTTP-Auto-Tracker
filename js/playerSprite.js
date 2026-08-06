/* ============================================================
   playerSprite.js
   Reads the connected ROM's player graphics once, decodes a
   down-facing standing pose, and paints it into the live map marker.
   This only reads cosmetic sprite/palette data already in the ROM.
   ============================================================ */

const PLAYER_SPRITE_ROM_GFX_ADDR=0x080000;
const PLAYER_SPRITE_ROM_PALETTE_ADDR=0x0DD308;
const PLAYER_SPRITE_PALETTE_LEN=0x78;
const PLAYER_SPRITE_FRAME_WIDTH=16;
const PLAYER_SPRITE_FRAME_HEIGHT=24;

let playerMapSpritePixels=null;
let playerMapSpritePalettes=null;
let playerMapSpriteArmor=0;
let playerMapSpriteGeneration=0;

// Kept separately from the live map-marker state above. resetPlayerMapSprite()
// clears the live state on every disconnect (so the map marker correctly
// hides), but a run report/certificate may be generated after disconnecting —
// e.g. finishing a run after closing the emulator. These "last known" values
// hold onto the most recent successful decode until a new ROM is read, so
// getPlayerSpriteDataUrl() keeps working after a disconnect.
let lastKnownPlayerSpritePixels=null;
let lastKnownPlayerSpritePalettes=null;
let lastKnownPlayerSpriteArmor=0;

function decodeSnes4bppTile(bytes,offset=0){
  if(!bytes || bytes.length<offset+0x20)
    throw new Error('Incomplete player sprite tile data');

  const pixels=new Uint8Array(64);
  for(let y=0;y<8;y++){
    const plane0=bytes[offset+(y*2)];
    const plane1=bytes[offset+(y*2)+1];
    const plane2=bytes[offset+0x10+(y*2)];
    const plane3=bytes[offset+0x10+(y*2)+1];
    for(let x=0;x<8;x++){
      const bit=7-x;
      pixels[(y*8)+x]=
        ((plane0>>bit)&1) |
        (((plane1>>bit)&1)<<1) |
        (((plane2>>bit)&1)<<2) |
        (((plane3>>bit)&1)<<3);
    }
  }
  return pixels;
}

function paintSpriteTile(target,targetWidth,targetHeight,tile,left,top){
  for(let y=0;y<8;y++){
    const targetY=top+y;
    if(targetY<0 || targetY>=targetHeight) continue;
    for(let x=0;x<8;x++){
      const targetX=left+x;
      if(targetX<0 || targetX>=targetWidth) continue;
      const paletteIndex=tile[(y*8)+x];
      // Palette index zero is transparent. Later pose pieces should only
      // replace visible pixels, matching the way the in-game pose is layered.
      if(paletteIndex!==0)
        target[(targetY*targetWidth)+targetX]=paletteIndex;
    }
  }
}

function paintPlayerSpriteCell(target,topHalf,bottomHalf,left,top){
  paintSpriteTile(
    target,PLAYER_SPRITE_FRAME_WIDTH,PLAYER_SPRITE_FRAME_HEIGHT,
    decodeSnes4bppTile(topHalf,0),left,top
  );
  paintSpriteTile(
    target,PLAYER_SPRITE_FRAME_WIDTH,PLAYER_SPRITE_FRAME_HEIGHT,
    decodeSnes4bppTile(topHalf,0x20),left+8,top
  );
  paintSpriteTile(
    target,PLAYER_SPRITE_FRAME_WIDTH,PLAYER_SPRITE_FRAME_HEIGHT,
    decodeSnes4bppTile(bottomHalf,0),left,top+8
  );
  paintSpriteTile(
    target,PLAYER_SPRITE_FRAME_WIDTH,PLAYER_SPRITE_FRAME_HEIGHT,
    decodeSnes4bppTile(bottomHalf,0x20),left+8,top+8
  );
}

function decodePlayerStandingFrame(a1Top,a1Bottom,b3Top,b3Bottom){
  const pixels=new Uint8Array(
    PLAYER_SPRITE_FRAME_WIDTH*PLAYER_SPRITE_FRAME_HEIGHT
  );
  paintPlayerSpriteCell(pixels,a1Top,a1Bottom,0,0);
  paintPlayerSpriteCell(pixels,b3Top,b3Bottom,0,8);
  return pixels;
}

function decodePlayerSpritePalettes(bytes){
  if(!bytes || bytes.length<PLAYER_SPRITE_PALETTE_LEN)
    throw new Error('Incomplete player sprite palette data');

  const palettes=[];
  for(let mail=0;mail<4;mail++){
    const colors=[[0,0,0,0]];
    const paletteOffset=mail*0x1E;
    for(let index=0;index<15;index++){
      const offset=paletteOffset+(index*2);
      const color=bytes[offset] | (bytes[offset+1]<<8);
      const red=(color&0x1F)*8;
      const green=((color>>5)&0x1F)*8;
      const blue=((color>>10)&0x1F)*8;
      colors.push([red,green,blue,255]);
    }
    palettes.push(colors);
  }
  return palettes;
}

function playerSpriteLooksValid(pixels,palettes){
  if(!pixels || pixels.length!==PLAYER_SPRITE_FRAME_WIDTH*PLAYER_SPRITE_FRAME_HEIGHT)
    return false;
  const visible=pixels.reduce((count,pixel)=>count+(pixel!==0?1:0),0);
  if(visible<24 || visible>360) return false;
  if(!palettes || palettes.length<3) return false;
  return palettes.some(palette=>
    palette.slice(1).some(color=>color[0]!==0 || color[1]!==0 || color[2]!==0)
  );
}

function paintPlayerMapSpriteCanvas(canvas){
  if(!canvas || !playerMapSpritePixels || !playerMapSpritePalettes) return;
  const context=canvas.getContext('2d');
  if(!context) return;

  const palette=playerMapSpritePalettes[playerMapSpriteArmor] ||
    playerMapSpritePalettes[0];
  const image=context.createImageData(
    PLAYER_SPRITE_FRAME_WIDTH,
    PLAYER_SPRITE_FRAME_HEIGHT
  );
  for(let index=0;index<playerMapSpritePixels.length;index++){
    const color=palette[playerMapSpritePixels[index]] || [0,0,0,0];
    const output=index*4;
    image.data[output]=color[0];
    image.data[output+1]=color[1];
    image.data[output+2]=color[2];
    image.data[output+3]=color[3];
  }
  context.clearRect(0,0,canvas.width,canvas.height);
  context.putImageData(image,0,0);
}

function renderPlayerMapSprite(){
  if(typeof document==='undefined') return;
  document.querySelectorAll('.player-map-marker').forEach(marker=>{
    const canvas=marker.querySelector('.player-map-sprite');
    if(!canvas) return;
    paintPlayerMapSpriteCanvas(canvas);
    marker.classList.toggle(
      'sprite-loaded',
      !!playerMapSpritePixels && !!playerMapSpritePalettes
    );
  });
}

function setPlayerMapSpriteArmor(value){
  const next=Math.max(0,Math.min(2,Number(value)||0));
  lastKnownPlayerSpriteArmor=next;
  if(next===playerMapSpriteArmor) return;
  playerMapSpriteArmor=next;
  renderPlayerMapSprite();
}

function resetPlayerMapSprite(){
  playerMapSpriteGeneration++;
  playerMapSpritePixels=null;
  playerMapSpritePalettes=null;
  playerMapSpriteArmor=0;
  if(typeof document==='undefined') return;
  document.querySelectorAll('.player-map-marker').forEach(marker=>{
    marker.classList.remove('sprite-loaded');
    const canvas=marker.querySelector('.player-map-sprite');
    const context=canvas?.getContext?.('2d');
    if(context) context.clearRect(0,0,canvas.width,canvas.height);
  });
}

// Renders the currently decoded sprite/palette (same data used for the live
// map marker) to a standalone PNG data URL, scaled up and blitted pixel-by-
// pixel so it stays crisp when embedded in exported/printed HTML. Returns
// null if no sprite has been read from a connected ROM yet.
function getPlayerSpriteDataUrl(scale=8){
  if(typeof document==='undefined') return null;
  if(!lastKnownPlayerSpritePixels || !lastKnownPlayerSpritePalettes) return null;

  const palette=lastKnownPlayerSpritePalettes[lastKnownPlayerSpriteArmor] ||
    lastKnownPlayerSpritePalettes[0];
  const width=PLAYER_SPRITE_FRAME_WIDTH*scale;
  const height=PLAYER_SPRITE_FRAME_HEIGHT*scale;
  const canvas=document.createElement('canvas');
  canvas.width=width;
  canvas.height=height;
  const context=canvas.getContext('2d');
  if(!context) return null;

  const image=context.createImageData(width,height);
  for(let y=0;y<PLAYER_SPRITE_FRAME_HEIGHT;y++){
    for(let x=0;x<PLAYER_SPRITE_FRAME_WIDTH;x++){
      const color=palette[lastKnownPlayerSpritePixels[(y*PLAYER_SPRITE_FRAME_WIDTH)+x]] || [0,0,0,0];
      for(let dy=0;dy<scale;dy++){
        const rowOffset=(((y*scale)+dy)*width+(x*scale))*4;
        for(let dx=0;dx<scale;dx++){
          const offset=rowOffset+(dx*4);
          image.data[offset]=color[0];
          image.data[offset+1]=color[1];
          image.data[offset+2]=color[2];
          image.data[offset+3]=color[3];
        }
      }
    }
  }
  context.putImageData(image,0,0);
  return canvas.toDataURL('image/png');
}

async function loadPlayerMapSpriteFromRom(readRom){
  if(typeof readRom!=='function') return false;
  resetPlayerMapSprite();
  const generation=playerMapSpriteGeneration;

  // A1 is the head and B3 is the body of Link's down-facing standing pose.
  // Each cell's top and bottom tile pairs are 0x200 bytes apart in the ROM.
  // Keeping each request below 1 KB also supports original usb2snes servers.
  const [a1Top,a1Bottom,b3Top,b3Bottom,paletteBytes]=await Promise.all([
    readRom(PLAYER_SPRITE_ROM_GFX_ADDR+0x0040,0x40),
    readRom(PLAYER_SPRITE_ROM_GFX_ADDR+0x0240,0x40),
    readRom(PLAYER_SPRITE_ROM_GFX_ADDR+0x04C0,0x40),
    readRom(PLAYER_SPRITE_ROM_GFX_ADDR+0x06C0,0x40),
    readRom(PLAYER_SPRITE_ROM_PALETTE_ADDR,PLAYER_SPRITE_PALETTE_LEN)
  ]);

  if(generation!==playerMapSpriteGeneration) return false;
  const pixels=decodePlayerStandingFrame(a1Top,a1Bottom,b3Top,b3Bottom);
  const palettes=decodePlayerSpritePalettes(paletteBytes);
  if(!playerSpriteLooksValid(pixels,palettes))
    throw new Error('Connected ROM did not return recognizable player graphics');

  playerMapSpritePixels=pixels;
  playerMapSpritePalettes=palettes;
  const currentArmor=TrackerState?.save?.armor;
  playerMapSpriteArmor=Math.max(0,Math.min(2,Number(currentArmor)||0));
  lastKnownPlayerSpritePixels=pixels;
  lastKnownPlayerSpritePalettes=palettes;
  lastKnownPlayerSpriteArmor=playerMapSpriteArmor;
  renderPlayerMapSprite();
  return true;
}
