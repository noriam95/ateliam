/**
 * Wraps the original noriam-bpmn.html template with:
 *  - a hydration script (in <head>) that restores localStorage BEFORE the
 *    template's own scripts run
 *  - a bridge script (end of <body>) that listens to postMessage for
 *    snapshot/restore commands from the parent
 *  - light CSS overrides for the Atelier identity (palette + fonts)
 */
export function wrapTemplate(html: string, initialState: Record<string, string> | null): string {
  const stateJson = JSON.stringify(initialState ?? {}).replace(/</g, "\\u003c");

  const hydrate = `
<script>
(function(){
  try {
    var s = ${stateJson};
    if (s && typeof s === 'object') {
      Object.keys(s).forEach(function(k){
        try { localStorage.setItem(k, s[k]); } catch(e){}
      });
    }
  } catch(e){ console.warn('[atelier] hydrate failed', e); }
})();
</script>
<style id="atelier-theme">
  :root {
    --gdk: #1A3C2A !important;
    --gd:  #244D38 !important;
    --g:   #6B7066 !important;
    --y:   #C9A84C !important;
    --yl:  #F8F1DC !important;
    --bg:  #F5F0E8 !important;
    --surf:#FDFBF6 !important;
    --surf2:#EEE7DA !important;
    --bord:#D7CFBE !important;
    --text:#2A2A26 !important;
    --muted:#6B6A62 !important;
    --b:   #4F46E5 !important;
    --bl:  #EEF0FB !important;
  }
  html, body { font-family: 'Epilogue', system-ui, sans-serif !important; }
  .sb-brand .title, .sb-brand .code,
  .sb-section, .sb-group, .sb-num,
  .tb-title, .module-tab, h1, h2, h3, h4,
  .home-eyebrow, .ux-home-status strong,
  .construction-box, .btn {
    font-family: 'Urbanist', system-ui, sans-serif !important;
  }
  /* Soften the dark sidebar to match Atelier */
  #sidebar { background: #1A3C2A !important; }
  .sb-brand .title { color: #F8F1DC !important; letter-spacing: -0.01em; }
  .sb-item.active { background: rgba(201,168,76,0.16) !important; border-left-color: #C9A84C !important; }
  /* Hide the original "Noriam" title text and replace via parent */
  .sb-brand .title { font-size: 16px !important; }
  /* Buttons */
  .btn-primary { background: #1A3C2A !important; color: #F8F1DC !important; }
  .btn-primary:hover { background: #244D38 !important; }
</style>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700;800&family=Epilogue:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
`;

  const bridge = `
<script>
(function(){
  function snapshot(){
    var out = {};
    for (var i=0; i<localStorage.length; i++){
      var k = localStorage.key(i);
      if (!k) continue;
      try { out[k] = localStorage.getItem(k) || ''; } catch(e){}
    }
    return out;
  }
  window.addEventListener('message', function(ev){
    var msg = ev.data || {};
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ATELIER_GET_STATE') {
      (ev.source || window.parent).postMessage(
        { type: 'ATELIER_STATE', requestId: msg.requestId, state: snapshot() },
        '*'
      );
    }
    if (msg.type === 'ATELIER_RESTORE_STATE' && msg.state && typeof msg.state === 'object') {
      try {
        localStorage.clear();
        Object.keys(msg.state).forEach(function(k){
          try { localStorage.setItem(k, msg.state[k]); } catch(e){}
        });
        location.reload();
      } catch(e){ console.warn('[atelier] restore failed', e); }
    }
  });
  // Tell parent we're ready
  setTimeout(function(){
    try { window.parent.postMessage({ type: 'ATELIER_READY' }, '*'); } catch(e){}
  }, 100);
})();
</script>
`;

  // Inject hydration into <head>; bridge before </body>
  return html
    .replace(/<head([^>]*)>/i, (m) => m + hydrate)
    .replace(/<\/body>/i, bridge + "</body>");
}
