/**
 * Wraps the original noriam-bpmn.html template:
 *  - Restores localStorage from a snapshot (in <head>)
 *  - Bridges postMessage save/restore commands
 *  - Applies Atelier theme (palette + fonts)
 *  - When `module` is set, scopes the UI to a single module by hiding
 *    other modules' sidebar entries / config blocks and auto-launching
 *    the corresponding entry action.
 */
export type AtelierModule = "ddp" | "pop" | "bpmn";

const MODULE_INFO: Record<AtelierModule, { label: string; launch: string }> = {
  ddp: { label: "Diagnóstico de Processo", launch: "novoDiagnostico" },
  pop: { label: "Elaboração de POP",       launch: "novoPOP" },
  bpmn:{ label: "Desenho BPMN",            launch: "novoBPMN" },
};

export function wrapTemplate(
  html: string,
  initialState: Record<string, string> | null,
  module?: AtelierModule,
): string {
  const stateJson = JSON.stringify(initialState ?? {}).replace(/</g, "\\u003c");
  const mod = module ?? null;
  const info = mod ? MODULE_INFO[mod] : null;

  // CSS that hides every other module in the sidebar + irrelevant config rows
  const scopingCss = mod ? `
<style id="atelier-scope">
  /* hide other modules */
  #module-ddp, #module-pop, #module-bpmn { display: none !important; }
  #module-${mod} { display: block !important; }
  #module-${mod} .sb-module-items { display: block !important; }

  /* hide module-selector landing/home if any */
  .home-section[data-mod]:not([data-mod="${mod}"]) { display:none !important; }

  /* hide unrelated config sub-blocks (label + following items) */
  ${mod !== "ddp" ? `
    #module-config .sb-config-label:nth-of-type(1),
    #module-config .sb-config-label:nth-of-type(1) ~ a.sb-item:nth-of-type(-n+3) { display:none !important; }
  ` : ""}
  ${mod !== "pop" ? `
    #module-config .sb-config-label:last-of-type,
    #module-config .sb-config-label:last-of-type ~ a.sb-item { display:none !important; }
  ` : ""}

  /* Hide tabs for other modules (defense in depth) */
  ${mod !== "ddp"  ? `#tabs-ddp  { display: none !important; }` : ""}
  ${mod !== "pop"  ? `#tabs-pop  { display: none !important; }` : ""}
  ${mod !== "bpmn" ? `#tabs-bpmn { display: none !important; }` : ""}
</style>
` : "";

  const autoLaunch = info ? `
<script>
(function(){
  function tryLaunch(attempt){
    attempt = attempt || 0;
    var fn = window[${JSON.stringify(info.launch)}];
    if (typeof fn === 'function') {
      try { fn(); } catch(e){ console.warn('[atelier] launch failed', e); }
      // open the module group in sidebar
      try {
        var m = document.getElementById('module-${mod}');
        if (m && !m.classList.contains('open')) m.classList.add('open');
      } catch(e){}
      // update topbar
      try {
        var tb = document.getElementById('topbar-title');
        if (tb) tb.textContent = ${JSON.stringify("Atelier · " + (info?.label ?? ""))};
      } catch(e){}
      return;
    }
    if (attempt < 40) setTimeout(function(){ tryLaunch(attempt+1); }, 100);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(tryLaunch, 200);
  } else {
    window.addEventListener('DOMContentLoaded', function(){ setTimeout(tryLaunch, 200); });
  }
})();
</script>
` : "";

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
  #sidebar { background: #1A3C2A !important; }
  .sb-brand .title { color: #F8F1DC !important; letter-spacing: -0.01em; font-size: 16px !important; }
  .sb-item.active { background: rgba(201,168,76,0.16) !important; border-left-color: #C9A84C !important; }
  .btn-primary { background: #1A3C2A !important; color: #F8F1DC !important; }
  .btn-primary:hover { background: #244D38 !important; }
</style>
${scopingCss}
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
  setTimeout(function(){
    try { window.parent.postMessage({ type: 'ATELIER_READY' }, '*'); } catch(e){}
  }, 100);
})();
</script>
${autoLaunch}
`;

  return html
    .replace(/<head([^>]*)>/i, (m) => m + hydrate)
    .replace(/<\/body>/i, bridge + "</body>");
}

export const MODULES: Array<{
  id: AtelierModule;
  title: string;
  tagline: string;
  description: string;
  accent: string;
  glyph: string;
}> = [
  {
    id: "ddp",
    title: "Diagnóstico de Processo",
    tagline: "Mapeie · entenda · proponha",
    description: "Capture o estado atual de um processo em 8 dimensões: metadados, visão geral, sistemas, fluxo, SIPOC, gaps, próximos passos e glossário.",
    accent: "var(--forest)",
    glyph: "▣",
  },
  {
    id: "pop",
    title: "Elaboração de POP",
    tagline: "Padronize · documente · publique",
    description: "Construa Procedimentos Operacionais Padrão estruturados em 5 seções, prontos para exportar e distribuir.",
    accent: "var(--gold)",
    glyph: "▤",
  },
  {
    id: "bpmn",
    title: "Desenho de Diagrama BPMN",
    tagline: "Modele em BPMN 2.0",
    description: "Modelador BPMN 2.0 completo: arraste, conecte, valide e exporte seus diagramas de processo de ponta a ponta.",
    accent: "var(--module-policy)",
    glyph: "▧",
  },
];
