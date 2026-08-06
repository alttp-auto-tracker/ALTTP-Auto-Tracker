/* ============================================================
   export.js
   Run-report helpers used by Run History to preview and download
   the observed timeline, splits, route, prizes, and results.
   ============================================================ */

function runReportFilename(reportData){
  const stamp=new Date(reportData?.generatedAt || Date.now())
    .toISOString()
    .slice(0,19)
    .replace(/[:T]/g,'-');
  const player=String(reportData?.player?.name || 'LINK')
    .replace(/[^a-z0-9_-]+/gi,'-')
    .replace(/^-+|-+$/g,'') || 'LINK';
  const seed=String(reportData?.seed?.code || (typeof currentSeedCode!=='undefined' ? currentSeedCode : '') || 'Run')
    .replace(/[^a-z0-9_-]+/gi,'-')
    .replace(/^-+|-+$/g,'') || 'Run';
  return `ALTTPR_${player}_${seed}_${stamp}.html`;
}

function ensureReportData(reportData){
  if(!reportData || typeof reportData!=='object'){
    throw new Error('No report data is stored for this run.');
  }
  if(typeof buildRunReport!=='function'){
    throw new Error('The run report builder is unavailable. Hard-refresh the page.');
  }
  return reportData;
}

function downloadRunReportData(reportData=null){
  const data=ensureReportData(reportData || (typeof collectRunReportData==='function' ? collectRunReportData() : null));
  const html=buildRunReport(data);
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{
    const link=document.createElement('a');
    link.href=url;
    link.download=runReportFilename(data);
    link.rel='noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    if(typeof log==='function') log('Run report downloaded','ok');
  }finally{
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
}

function openStandaloneHtmlPreview(html,blockedMessage){
  // Blob URL is more reliable than about:blank + document.write across browsers.
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const preview=window.open(url,'_blank');
  if(!preview){
    URL.revokeObjectURL(url);
    // Last resort: navigate a temporary anchor (still may be blocked)
    window.alert(blockedMessage);
    return false;
  }
  // Revoke later so the new tab can finish loading.
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  try{ preview.focus(); }catch(e){}
  return true;
}

function openRunReportData(reportData){
  try{
    const data=ensureReportData(reportData);
    const html=buildRunReport(data);
    const opened=openStandaloneHtmlPreview(
      html,
      'Your browser blocked the report preview.\n\nUse Download instead, then open the HTML file.'
    );
    if(!opened && typeof downloadRunReportData==='function'){
      // Auto-download if popup blocked so the user still gets the report.
      downloadRunReportData(data);
    }
  }catch(error){
    console.error('Could not open run report', error);
    window.alert('Could not open the report:\n' + (error.message || error));
  }
}

function exportRun(){
  try{
    if(typeof persistActiveRunSessionNow==='function') persistActiveRunSessionNow();
    downloadRunReportData();
  }catch(error){
    console.error('Run report export failed',error);
    if(typeof log==='function') log(`Export failed: ${error.message || error}`,'error');
    else window.alert('Export failed: ' + (error.message || error));
  }
}

function initExport(){
  const button=document.getElementById('exportRun');
  if(button) button.addEventListener('click',exportRun);
}
