/* ============================================================
   main.js
   Entry point. Builds the static UI pieces and wires up all
   event listeners, in the order the original single-file
   tracker ran them in. Runs on DOMContentLoaded so it works
   regardless of where the <script> tags sit in tracker.html.
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initItemGrid();     // ui.js       — item tiles and dungeon-prize controls
  initDungeonStats();  // dungeon.js  — dungeon-progress tiles
  initSettings();
  initEntrancePairings(); // entrance.js — manual ER pairings
  initMap();           // map.js      — world map markers + controls
  initMobileTabs();    // mobileTabs.js — bottom nav for narrow screens
  if (typeof initControllerModeOnce === 'function') initControllerModeOnce();
  else if (typeof initControllerMode === 'function') initControllerMode();
  initTimer();         // timer.js    — timer buttons
  initRunHistory();    // runHistory.js — local run library + recovery
  if (typeof initCelebrateToggle === 'function') initCelebrateToggle();
  initExport();        // export.js   — standalone HTML run report
  initSeed();          // seed.js     — seed/permalink loader
  if (typeof initSpoilerPanel === 'function') initSpoilerPanel(); // spoiler.js — Practice route
  initTracker();       // tracker.js  — connect/demo buttons, log, status
});
