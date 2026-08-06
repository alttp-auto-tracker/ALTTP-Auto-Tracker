/* ============================================================
   mobileTabs.js
   Bottom tab bar shown only below the 900px breakpoint (see
   css/tracker.css). Swaps which of #colItems / #colMap / #colLog
   is visible by setting data-mobile-tab on <body>; the actual
   show/hide rules live in CSS so nothing here runs above 900px.
   Selection is remembered per device via localStorage.
   ============================================================ */

const MOBILE_TAB_STORAGE_KEY='mobileTab';
const MOBILE_TABS=['items','map','log'];

function loadMobileTab(){
  const saved=localStorage.getItem(MOBILE_TAB_STORAGE_KEY);
  return MOBILE_TABS.includes(saved) ? saved : 'items';
}

function setMobileTab(tab){
  if(!MOBILE_TABS.includes(tab)) return;
  document.body.dataset.mobileTab=tab;
  localStorage.setItem(MOBILE_TAB_STORAGE_KEY,tab);
  document.querySelectorAll('.mobile-tab-btn').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.tab===tab);
  });
}

// Wires up the bottom nav. Called once from main.js on load.
function initMobileTabs(){
  const bar=document.getElementById('mobileTabBar');
  if(!bar) return;

  bar.querySelectorAll('.mobile-tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>setMobileTab(btn.dataset.tab));
  });

  setMobileTab(loadMobileTab());
}
