// Keeps a steady poll cadence for OBS CEF (page timers get throttled hard).
let intervalMs = 250;
let timer = null;
function arm() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => postMessage({ type: 'tick' }), intervalMs);
}
onmessage = (e) => {
  const data = e.data || {};
  if (data.type === 'start') {
    intervalMs = Math.max(150, Number(data.ms) || 250);
    arm();
  } else if (data.type === 'stop') {
    if (timer) clearInterval(timer);
    timer = null;
  } else if (data.type === 'setMs') {
    intervalMs = Math.max(150, Number(data.ms) || 250);
    if (timer) arm();
  }
};
