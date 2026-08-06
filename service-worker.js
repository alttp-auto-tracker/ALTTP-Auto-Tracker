/* ============================================================
   service-worker.js
   Makes the tracker installable and usable offline once it has
   loaded on a device at least once. Bump CACHE_VERSION whenever
   you change any file so devices pick up the new copy instead of
   serving a stale cached one forever.

   Strategy: stale-while-revalidate for every same-origin GET —
   respond from cache instantly if we have it, then fetch in the
   background and update the cache for next time. Nothing here
   touches the live SNI/QUsb2Snes WebSocket connection; browsers
   never route WebSocket traffic through fetch/service workers,
   so the socket always goes straight over the network as before.
   ============================================================ */

const CACHE_VERSION='v1';
const CACHE_NAME='lttp-tracker-'+CACHE_VERSION;

// The app shell — every file the tracker needs to run with zero
// network access. Keep this in sync with the <script> tags in
// tracker.html / streamer.html plus the stylesheet, manifest and icons.
// Listed WITHOUT their ?v= query strings on purpose — the fetch
// handler below matches with {ignoreSearch:true} specifically so
// these entries still satisfy the real (versioned) requests the
// pages make. Images under assets/ (item icons, marker screenshots,
// dungeon maps) are NOT listed here — there are a lot of them, new
// ones get added over time, and they're only ever requested when
// actually shown on screen. Those get cached automatically the
// first time each one loads, via the runtime fetch handler below.
const APP_SHELL=[
  'tracker.html',
  'manifest.json',
  'css/tracker.css',
  'css/streamer.css',
  'js/constants.js',
  'js/state.js',
  'js/memory.js',
  'js/dungeonData.js',
  'js/requirements.js',
  'js/logic.js',
  'js/navigator.js',
  'js/areas.js',
  'js/settings.js',
  'js/sni.js',
  'js/playerSprite.js',
  'js/ui.js',
  'js/dungeon.js',
  'js/map.js',
  'js/timer.js',
  'js/runData.js',
  'js/report.js',
  'js/comparison.js',
  'js/runHistory.js',
  'js/export.js',
  'js/seed.js',
  'js/spoiler.js',
  'js/celebrate.js',
  'js/tracker.js',
  'js/streamer.js',
  'js/mobileTabs.js',
  'js/controllerMode.js',
  'js/controlSync.js',
  'js/main.js',
  'js/pwa.js',
  'assets/icons/favicon.ico',
  'assets/icons/favicon-32.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',

];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.addAll(APP_SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(
        keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key))
      ))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  // Only handle simple same-origin GETs. Everything else (the SNI
  // socket, cross-origin alttpr.com permalink lookups, POSTs) is
  // left completely alone and goes straight to the network.
  if(request.method!=='GET') return;
  if(new URL(request.url).origin!==self.location.origin) return;

  const url=new URL(request.url);
  const path=url.pathname;
  // Never cache the OBS overlay — always hit the network.
  if(path.endsWith('/streamer.html') || path.endsWith('streamer.html')) return;
  // HTML / JS / CSS must prefer the network so local edits show up
  // without manually bumping ?v= query strings. Cache is offline fallback.
  const isShell=path.endsWith('.html')
    || path.endsWith('.js')
    || path.endsWith('.css')
    || path.endsWith('.json')
    || path==='/' ;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache=>{
      const network=fetch(request)
        .then(response=>{
          if(response && response.ok){
            // Store without the query string so ignoreSearch matches offline.
            try{ cache.put(request,response.clone()); }catch(e){}
          }
          return response;
        })
        .catch(()=>cache.match(request,{ignoreSearch:true}));

      if(isShell){
        return network.then(response=>{
          if(response) return response;
          return cache.match(request,{ignoreSearch:true});
        });
      }

      // Images / other static: stale-while-revalidate (fast paint, then refresh).
      return cache.match(request,{ignoreSearch:true}).then(cached=>{
        if(cached){
          network.catch(()=>{});
          return cached;
        }
        return network;
      });
    })
  );
});
