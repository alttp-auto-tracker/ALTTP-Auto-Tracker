/* ============================================================
   sni.js
   usb2snes / SNI protocol client. Wraps the raw WebSocket
   command queue used to talk to SNI / QUsb2Snes.
   ============================================================ */
class USB2SnesClient{
  constructor(){
    this.ws=null; this.queue=[]; this.busy=false; this.connected=false;
  }
  connect(host,port){
    return new Promise((resolve,reject)=>{
      let ws;
      try{ ws=new WebSocket(`ws://${host}:${port}`); }
      catch(e){ reject(e); return; }
      ws.binaryType='arraybuffer';
      this.ws=ws;
      let settled=false;
      ws.onopen=()=>{ this.connected=true; settled=true; resolve(); };
      ws.onerror=(e)=>{ if(!settled){settled=true;reject(new Error('Could not open socket'));} };
      ws.onclose=()=>{ this.connected=false; if(this.onDisconnect) this.onDisconnect(); };
      ws.onmessage=(evt)=>this._handleMessage(evt);
    });
  }
  disconnect(){ if(this.ws) this.ws.close(); this.queue=[]; this.busy=false; }
  _handleMessage(evt){
    const item=this.queue[0];
    if(!item) return;
    clearTimeout(item.timer);
    this.queue.shift();
    this.busy=false;
    if(item.expect==='binary'){
      item.resolve(new Uint8Array(evt.data));
    }else{
      try{ item.resolve(JSON.parse(evt.data)); }
      catch(e){ item.resolve(null); }
    }
    this._processQueue();
  }
  _processQueue(){
    if(this.busy || this.queue.length===0) return;
    this.busy=true;
    const item=this.queue[0];
    const cmd={Opcode:item.opcode,Space:item.space,Operands:item.operands||[]};
    try{ this.ws.send(JSON.stringify(cmd)); }
    catch(e){ this.queue.shift(); this.busy=false; item.reject(e); this._processQueue(); return; }
    if(item.expect==='none'){
      clearTimeout(item.timer);
      this.queue.shift(); this.busy=false;
      item.resolve(null);
      this._processQueue();
    }else{
      item.timer=setTimeout(()=>{
        this.queue.shift(); this.busy=false;
        item.reject(new Error('Timed out waiting for response'));
        this._processQueue();
      },4000);
    }
  }
  command(opcode,operands,expect='json',space='SNES'){
    return new Promise((resolve,reject)=>{
      this.queue.push({opcode,operands,space,expect,resolve,reject});
      this._processQueue();
    });
  }
}

function addrToHex(addr){
  const hi=((addr>>16)&0xFF).toString(16).padStart(2,'0');
  const mid=((addr>>8)&0xFF).toString(16).padStart(2,'0');
  const lo=(addr&0xFF).toString(16).padStart(2,'0');
  return (hi+mid+lo).toUpperCase();
}
