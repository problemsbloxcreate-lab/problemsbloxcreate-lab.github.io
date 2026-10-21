/* ===================== estudio-carregando.js — tela de carregamento padrão do Estúdio Problems =====================
   Só VISUAL: mostra a mesma tela de carregamento do estudio-login.js (logo, NOME do programa, "Estúdio Problems",
   barra andando e a mensagem) enquanto o programa abre, para todos os programas ficarem com o mesmo visual.

   Quem usa: os projetos que o PORTEIRO já liberou no servidor (Shorts, Editor) e por isso não carregam o
   estudio-login.js. O porteiro coloca esta linha sozinho no começo do <head> das páginas deles:

       <script src="/estudio-carregando.js"></script>

   Não confere login nem libera nada (quem decide é o porteiro). A tela some quando a página termina de carregar
   (evento load). O projeto pode segurar a tela até estar pronto de verdade com:
       EstudioCarregando.segurar();   ...   EstudioCarregando.pronto();
   e trocar a mensagem com EstudioCarregando.mensagem('Abrindo as cenas…').
   Se a página tiver o estudio-login.js, este arquivo não faz nada (a tela dele já é esta).

   O visual é o MESMO do estudio-login.js: mudou lá, muda aqui também. */
'use strict';
(() => {
  if (window.EstudioCarregando || window.EstudioLogin || window.top !== window) return; // já tem tela, ou está dentro de um quadro
  const NOME_PROG = ((p => [['/animador/', 'ANIMADOR'], ['/editor/', 'EDITOR'], ['/modelador/blockbench', 'BLOCKBENCH'], ['/modelador/', 'MODELADOR'], ['/shorts/', 'SHORTS']].find(([k]) => p.startsWith(k))?.[1] || 'ESTÚDIO PROBLEMS')(location.pathname));
  const root = document.documentElement, inicio = performance.now();
  const st = document.createElement('style');
  st.textContent = `#estudio-porta{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:radial-gradient(1100px 700px at 50% 35%,#1d2030,#111216 70%);font:14px/1.5 'Segoe UI',system-ui,-apple-system,sans-serif;color:#e9ebef;padding:16px;-webkit-user-select:none;user-select:none;transition:opacity .35s ease}
#estudio-porta.ep-saindo{opacity:0;pointer-events:none}
#estudio-porta .ep-c{width:min(380px,100%);text-align:center;display:grid;justify-items:center;gap:4px;animation:epEntra .16s ease-out both}
#estudio-porta .ep-lg{width:68px;height:68px;border-radius:20px;display:grid;place-items:center;background:linear-gradient(135deg,#3d8bff,#19d3f0);box-shadow:0 14px 40px rgba(61,139,255,.35);margin-bottom:12px;animation:epPulso 1.6s ease-in-out infinite}
#estudio-porta .ep-nm{font:800 26px/1.05 'Segoe UI',system-ui,sans-serif;letter-spacing:1.5px}
#estudio-porta .ep-sb{color:#9aa0ab;font-size:12.5px;letter-spacing:.4px}
#estudio-porta .ep-br{width:180px;height:4px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden;margin:18px 0 8px;position:relative}
#estudio-porta .ep-br::after{content:'';position:absolute;top:0;bottom:0;left:0;width:40%;border-radius:4px;background:linear-gradient(90deg,#3d8bff,#19d3f0);animation:epBarra 1.1s ease-in-out infinite}
#estudio-porta .ep-m{color:#b9bdc6;font-size:13px;min-height:20px;max-width:340px}
@keyframes epBarra{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}@keyframes epPulso{50%{transform:scale(1.05)}}@keyframes epEntra{from{opacity:0}}
@media (prefers-reduced-motion:reduce){#estudio-porta .ep-lg,#estudio-porta .ep-br::after,#estudio-porta .ep-c{animation:none}#estudio-porta{transition:none}}`;
  (document.head || root).appendChild(st);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = document.createElement('div');
  el.id = 'estudio-porta'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<div class="ep-c"><div class="ep-lg"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="2.5" fill="#fff" fill-opacity=".18"/><path d="m15.5 10.2 5-3v9.6l-5-3z" fill="#fff"/></svg></div><div class="ep-nm">${esc(NOME_PROG)}</div><div class="ep-sb">Estúdio Problems</div><div class="ep-br"></div><div class="ep-m" data-m>Abrindo…</div></div>`;
  // entra já, antes do <body> existir; quando o <body> chega, a tela passa para dentro dele (fica por cima de tudo)
  root.appendChild(el);
  const paraBody = () => { if (document.body && el.parentNode !== document.body) document.body.appendChild(el); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paraBody, { once: true }); else paraBody();

  let seguros = 0, carregou = false, foi = false;
  const fecha = () => {
    if (foi) return; foi = true;
    const espera = Math.max(0, 350 - (performance.now() - inicio)); // não pisca nas páginas que abrem num instante
    setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('ep-saindo'); setTimeout(() => el.remove(), 380); })), espera); // 2 quadros: o programa já desenhou por baixo
  };
  const talvez = () => { if (carregou && seguros <= 0) fecha(); };
  window.EstudioCarregando = {
    segurar() { seguros++; },
    pronto() { seguros = Math.max(0, seguros - 1); talvez(); },
    mensagem(t) { const m = el.querySelector('[data-m]'); if (m) m.textContent = String(t ?? ''); },
    fechar: fecha,
  };
  const aoCarregar = () => { carregou = true; talvez(); };
  if (document.readyState === 'complete') aoCarregar(); else addEventListener('load', aoCarregar, { once: true });
  setTimeout(fecha, 20000); // segurança: a tela nunca prende o programa
})();
