/* Ícones dos programas do Estúdio Problems (estilo "Ps" da Adobe): Sh = Shorts, Ed = Editor, An = Animador, At = Ateliê,
   Md = Modelador. O MESMO desenho no menu, na tela de carregamento, no cabeçalho de cada programa e na aba do navegador.
   A ADM (ADM › Ícones) muda letras, cores, borda, cantos ou troca por uma imagem/SVG; salva no porteiro (/icones) e vale
   para toda a equipe — as abas abertas mudam na hora (BroadcastChannel) e as outras na próxima vez que abrirem.
   Uso:
     <span data-estudio-icone="an"></span>        → o ícone ocupa o tamanho do elemento (fica por conta do CSS da página)
     EstudioIcones.svg('an', 34) / .url('an')      → o desenho em texto SVG / como endereço data: (para <img> e favicon)
     EstudioIcones.usar('at')                       → troca o ícone da aba (ex.: o Ateliê dentro do Animador)
   A aba já usa sozinha o ícone do programa pelo endereço (/shorts/, /editor/, /animador/, /modelador/). */
(() => {
  'use strict';
  if (window.EstudioIcones) return;
  const PADRAO = {
    sh: { nome: 'Shorts', let: 'Sh', fg: '#ff6b93', bg: '#2b0b18', borda: 1, bc: '#ff6b93', raio: 22 },
    ed: { nome: 'Editor', let: 'Ed', fg: '#a796ff', bg: '#14113a', borda: 1, bc: '#a796ff', raio: 22 },
    an: { nome: 'Animador', let: 'An', fg: '#3fd6f2', bg: '#062832', borda: 1, bc: '#3fd6f2', raio: 22 },
    at: { nome: 'Ateliê', let: 'At', fg: '#ffb04a', bg: '#2e1804', borda: 1, bc: '#ffb04a', raio: 22 },
    md: { nome: 'Modelador', let: 'Md', fg: '#4fe08f', bg: '#0a2a17', borda: 1, bc: '#4fe08f', raio: 22 },
    cn: { nome: 'Cenários', let: 'Cn', fg: '#7fd1ff', bg: '#0a1e33', borda: 1, bc: '#7fd1ff', raio: 22, parte: 'Animador' }, // parte de um programa (botão Cenários do Animador)
  };
  /* ÍCONES NOVOS (ADM › Ícones › "+ Ícone novo", ou um botão novo do menu): id "x-<nome>", com nome e, se quiser, o começo do
     endereço do projeto (caminho, ex.: "/jogos/") — nessa página a aba do navegador e o data-estudio-icone="auto" usam ele. */
  const ehNovo = id => /^x-[a-z0-9-]{1,30}$/.test(id);
  const K = 'ep-icones-v1', BASE = Object.keys(PADRAO); let IDS = [...BASE];
  const copia = o => JSON.parse(JSON.stringify(o));
  const cor = (c, d) => /^#[0-9a-f]{6}$/i.test(c || '') ? c : d;
  // junta o que a ADM mudou com o padrão (o que faltar ou vier errado fica como o padrão)
  const PALETA = [['#ffd36b', '#2e2304'], ['#ff8f6b', '#2e1206'], ['#7fd1ff', '#0a1e33'], ['#c99bff', '#1d0f33'], ['#6bffc8', '#06291f'], ['#ff6bd0', '#2e0622'], ['#b6ff6b', '#1a2e06']];
  // ícone novo: letras e cor saem do nome (o mesmo nome dá sempre a mesma cor)
  function novoPadrao(nome) { const t = String(nome || 'Novo').trim().split(/\s+/).filter(Boolean), g = t.filter(w => w.length > 2 || /^[A-Z0-9]/.test(w)), p = g.length ? g : t, l = p.length > 1 ? p[0][0].toUpperCase() + p[1][0].toLowerCase() : (p[0] || 'Nv').slice(0, 2).replace(/^./, c => c.toUpperCase());
    let h = 0; for (const ch of String(nome)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const [fg, bg] = PALETA[h % PALETA.length];
    return { nome: String(nome || 'Novo').slice(0, 40), let: l, fg, bg, borda: 1, bc: fg, raio: 22, novo: true }; }
  function junta(m) {
    const out = copia(PADRAO); IDS = [...BASE];
    for (const id of Object.keys(m || {})) if (ehNovo(id) && m[id] && typeof m[id].nome === 'string' && m[id].nome.trim()) { out[id] = novoPadrao(m[id].nome.trim()); IDS.push(id); }
    for (const id of IDS) { const x = m?.[id]; if (!x || typeof x !== 'object') continue; const o = out[id];
      if (o.novo) { if (typeof x.nome === 'string' && x.nome.trim()) o.nome = x.nome.trim().slice(0, 40); if (typeof x.caminho === 'string' && /^\/[a-z0-9/_-]{1,60}$/i.test(x.caminho)) o.caminho = x.caminho; if (typeof x.botao === 'string') o.botao = x.botao.slice(0, 40); }
      if (typeof x.let === 'string' && x.let.trim()) o.let = x.let.trim().slice(0, 3);
      o.fg = cor(x.fg, o.fg); o.bg = cor(x.bg, o.bg); o.bc = cor(x.bc, o.bc);
      if (x.borda === 0 || x.borda === 1) o.borda = x.borda;
      if (Number.isFinite(+x.raio)) o.raio = Math.max(0, Math.min(50, Math.round(+x.raio)));
      if (typeof x.img === 'string' && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/i.test(x.img)) o.img = x.img; }
    return out;
  }
  let guardado = null; try { guardado = JSON.parse(localStorage.getItem(K) || 'null'); } catch { }
  let cfg = junta(guardado?.m);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let nId = 0;
  /* O DESENHO (64×64): quadrado com cantos (raio em % do lado), fundo, borda fina e as letras CENTRADAS — na horizontal pelo
     meio da palavra e na vertical pela altura das MAIÚSCULAS (0,70 da fonte): a linha de base fica em 32 + 0,35 × fonte. */
  function svg(id, px, o = {}) {
    const c = (o.cfg || cfg)[id] || PADRAO[id] || PADRAO.an, r = c.raio / 100 * 64, b = c.borda ? 3 : 0, n = [...c.let].length;
    const tam = px ? ` width="${px}" height="${px}"` : ' width="100%" height="100%"';
    if (c.img) { const cid = 'epic' + (++nId);
      return `<svg xmlns="http://www.w3.org/2000/svg"${tam} viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id="${cid}"><rect width="64" height="64" rx="${r}"/></clipPath></defs><image href="${esc(c.img)}" width="64" height="64" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/></svg>`; }
    const pequeno = px && px <= 20, fs = (n >= 3 ? 23 : n === 2 ? 29 : 36) * (pequeno ? 1.18 : 1);
    return `<svg xmlns="http://www.w3.org/2000/svg"${tam} viewBox="0 0 64 64" aria-hidden="true"><rect x="${b / 2}" y="${b / 2}" width="${64 - b}" height="${64 - b}" rx="${Math.max(0, r - b / 2)}" fill="${c.bg}"${b ? ` stroke="${c.bc}" stroke-width="${b}"` : ''}/>`
      + `<text x="32" y="${(32 + fs * 0.35).toFixed(2)}" text-anchor="middle" font-family="'Segoe UI', system-ui, -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="700" font-size="${fs.toFixed(2)}" letter-spacing="-0.5" fill="${c.fg}">${esc(c.let)}</text></svg>`;
  }
  const url = id => 'data:image/svg+xml,' + encodeURIComponent(svg(id, 64));
  // programa desta página pelo endereço (o Ateliê troca com usar('at'))
  const p = location.pathname, porCaminho = p.startsWith('/shorts') ? 'sh' : p.startsWith('/editor') ? 'ed' : p.startsWith('/animador') ? (/[?&]atelie=/.test(location.search) ? 'at' : 'an') : p.startsWith('/modelador') ? 'md' : null;
  const doCaminho = () => porCaminho || IDS.find(id => cfg[id]?.caminho && p.startsWith(cfg[id].caminho)) || null; // projeto novo: pelo caminho que a ADM ligou
  let atual = doCaminho();
  function favicon() {
    if (!atual || !document.head) return; const u = url(atual);
    let ls = [...document.head.querySelectorAll('link[rel~="icon"]')];
    if (!ls.length) { const l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); ls = [l]; }
    for (const l of ls) { if (l.href !== u) { l.type = 'image/svg+xml'; l.href = u; } }
  }
  const ANTIGOS = [[/icones\/atelie\.svg/, 'at'], [/icones\/simbolo\.svg/, 'an'], [/icone-shorts[^/]*\.png/, 'sh'], [/modelador\/icone\.svg/, 'md'], [/editor\/icone\.svg/, 'ed']];
  function antigo(src) { src = String(src || ''); for (const [re, id] of ANTIGOS) if (re.test(src)) return id; return /^(\.\/)?icone\.svg$/.test(src) ? atual : null; } // "icone.svg" solto = o do programa desta página
  function pinta(raiz) {
    favicon();
    if (!porCaminho && !atual) atual = doCaminho();
    (raiz || document).querySelectorAll?.('[data-estudio-icone]').forEach(el => { let id = el.getAttribute('data-estudio-icone'); if (id === 'auto') id = atual || 'an'; const ch = JSON.stringify(cfg[id] || '') + id;
      if (el._epIc === ch) return; el._epIc = ch; el.innerHTML = svg(id); });
    // <img data-estudio-icone-img="an"> (telas de carregamento): troca a imagem pela de agora
    // imagens com os ícones ANTIGOS em qualquer lugar (botões, menus…): viram o ícone de agora (o mesmo da ADM)
    (raiz || document).querySelectorAll?.('img[src*="icone"]:not([data-estudio-icone-img])').forEach(im => { const id = antigo(im.getAttribute('src')); if (id) im.setAttribute('data-estudio-icone-img', id); });
    (raiz || document).querySelectorAll?.('img[data-estudio-icone-img]').forEach(im => { const u = url(im.getAttribute('data-estudio-icone-img')); if (im.src !== u) im.src = u; });
  }
  // elementos novos com data-estudio-icone (telas que montam depois) também ganham o ícone
  const obs = new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.hasAttribute?.('data-estudio-icone') || n.hasAttribute?.('data-estudio-icone-img') || (n.tagName === 'IMG' && /icone/.test(n.getAttribute('src') || '')) || n.querySelector?.('[data-estudio-icone],[data-estudio-icone-img],img[src*="icone"]'))) { pinta(n.parentNode || n); return; } });
  const liga = () => { pinta(); if (document.body) obs.observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') { favicon(); document.addEventListener('DOMContentLoaded', liga, { once: true }); } else liga();
  function troca(m, de) { // m = o que a ADM salvou (só o que difere do padrão)
    const novo = junta(m); if (JSON.stringify(novo) === JSON.stringify(cfg)) return;
    cfg = novo; if (!porCaminho) atual = doCaminho() || atual; try { localStorage.setItem(K, JSON.stringify({ m: m || {}, t: Date.now() })); } catch { }
    pinta(); try { dispatchEvent(new CustomEvent('estudio-icones', { detail: { de } })); } catch { }
  }
  // confere o que está salvo no porteiro (uma vez por abertura; guardado neste navegador para já abrir certo)
  async function busca() { try { const r = await fetch('/icones', { cache: 'no-cache', credentials: 'same-origin' }); if (!r.ok) return; const j = await r.json(); troca(j.icones || {}, 'nuvem'); } catch { } }
  let bc = null; try { bc = new BroadcastChannel('estudio-icones'); bc.onmessage = e => troca(e.data?.m, 'outra aba'); } catch { }
  addEventListener('storage', e => { if (e.key === K) { try { troca(JSON.parse(e.newValue || 'null')?.m, 'outra aba'); } catch { } } });
  // a tela de carregamento espera os ícones de agora (é rápido; o desenho já sai do que está guardado neste navegador)
  const pronto = location.protocol.startsWith('http') ? busca() : Promise.resolve();
  const naTarefa = () => { try { window.EstudioProgresso?.tarefa?.(pronto, 'Ícones dos programas'); } catch { } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', naTarefa, { once: true }); else naTarefa();
  window.EstudioIcones = {
    PADRAO: copia(PADRAO), get IDS() { return [...IDS]; }, BASE: [...BASE], svg, url, pinta, pronto, ehNovo, novoPadrao,
    config: () => copia(cfg), padrao: id => copia(PADRAO[id] || cfg[id] || novoPadrao('Novo')),
    usar(id) { atual = id; favicon(); },
    atual: () => atual,
    // só a ADM: salva para toda a equipe (o porteiro confere se é ADM)
    async salvar(m) {
      const r = await fetch('/icones', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ icones: m }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error?.message || 'Não salvou.');
      troca(j.icones || {}, 'eu'); try { bc?.postMessage({ m: j.icones || {} }); } catch { } return j.icones;
    },
    salvo: () => copia(guardadoAgora()),
  };
  function guardadoAgora() { try { return JSON.parse(localStorage.getItem(K) || 'null')?.m || {}; } catch { return {}; } }
})();
