/* ============================================================
   pwa.js
   Registers service-worker.js so the tracker can be added to a
   phone's home screen and keeps working offline.

   Streamer / OBS overlay (streamer.html) deliberately does NOT
   use a service worker — OBS's embedded browser caches aggressively
   and an SW makes layout updates look "stuck" on an old build.
   ============================================================ */
(function(){
  const isStreamer=/streamer\.html/i.test(location.pathname || '');

  if(!('serviceWorker' in navigator)) return;

  if(isStreamer){
    // Drop any previous registration + caches so OBS cannot keep a stale shell.
    window.addEventListener('load',()=>{
      navigator.serviceWorker.getRegistrations()
        .then(regs=>Promise.all(regs.map(reg=>reg.unregister())))
        .catch(()=>{});
      if(window.caches && caches.keys){
        caches.keys()
          .then(keys=>Promise.all(keys.map(key=>caches.delete(key))))
          .catch(()=>{});
      }
    });
    return;
  }

  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('service-worker.js')
      .catch(error=>console.warn('Service worker registration failed:',error));
  });
})();
