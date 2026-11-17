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
  /* ESTILO NOVO DA ADOBE + DEGRADÊ VIVO (escolha "B" da dona, 17/11/2026): sem contorno, fundo em degradê na diagonal do tom escuro
     (bg) ao tom médio e vivo da cor do programa (bg2 = matiz com 100% de saturação e 34% de luz), letras claras (80% de luz) e mais
     grossas (800). Antes era o estilo antigo da Adobe: fundo quase preto com contorno colorido. O que a ADM › Ícones mudar vale por cima. */
  const PADRAO = {
    sh: { nome: 'Shorts', let: 'Sh', fg: '#ff99b5', bg: '#2b0b18', bg2: '#ad002f', borda: 0, bc: '#ff99b5', raio: 22 },
    ed: { nome: 'Editor', let: 'Ed', fg: '#aa99ff', bg: '#14113a', bg2: '#1c00ad', borda: 0, bc: '#aa99ff', raio: 22 },
    an: { nome: 'Animador', let: 'An', fg: '#99efff', bg: '#062832', bg2: '#0092ad', borda: 0, bc: '#99efff', raio: 22 },
    at: { nome: 'Ateliê', let: 'At', fg: '#ffd299', bg: '#2e1804', bg2: '#ad6200', borda: 0, bc: '#ffd299', raio: 22, parte: 'Animador' }, // parte do Animador (como o Cenários)
    md: { nome: 'Modelador', let: 'Md', fg: '#99ffc6', bg: '#0a2a17', bg2: '#00ad4d', borda: 0, bc: '#99ffc6', raio: 22 },
    pr: { nome: 'Preparativos', let: 'Pr', fg: '#ffe199', bg: '#2e2304', bg2: '#ad7a00', borda: 0, bc: '#ffe199', raio: 22 }, // roteiros, falas e gravações (/preparativos/)
    cb: { nome: 'Cérebro', let: 'Cb', fg: '#ffa599', bg: '#33100c', bg2: '#ad1500', borda: 0, bc: '#ffa599', raio: 22 }, // memória da equipe e das IAs (/cerebro/)
    mu: { nome: 'Músicas', let: 'Mu', fg: '#99ffeb', bg: '#06302a', bg2: '#00ad8b', borda: 0, bc: '#99ffeb', raio: 22 }, // álbum de sons da equipe (/musicas/)
    cj: { nome: 'Central de Jogos', let: 'Cj', fg: '#ed99ff', bg: '#2a0a33', bg2: '#9000ad', borda: 0, bc: '#ed99ff', raio: 22 }, // site externo da dona (problemsite.github.io/central/), fora do porteiro
    cn: { nome: 'Cenários', let: 'Cn', fg: '#99daff', bg: '#0a1e33', bg2: '#006fad', borda: 0, bc: '#99daff', raio: 22, parte: 'Animador' }, // parte de um programa (botão Cenários do Animador)
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
    let h = 0; for (const ch of String(nome)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const [cor0, bg] = PALETA[h % PALETA.length], v = estiloNovo(cor0);
    return { nome: String(nome || 'Novo').slice(0, 40), let: l, fg: v.fg, bg, bg2: v.bg2, borda: 0, bc: v.fg, raio: 22, novo: true }; }
  // a partir de uma cor: as letras claras e o tom médio vivo do degradê (o mesmo cálculo dos ícones padrão)
  function estiloNovo(cor) { let [r, g, b] = [1, 3, 5].map(i => parseInt(String(cor).substr(i, 2), 16) / 255); if ([r, g, b].some(isNaN)) return { fg: '#ffffff', bg2: '#333333' };
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0; if (mx !== mn) { const d = mx - mn; h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60; }
    const hx = l => { const k = n => (n + h / 30) % 12, a = Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return '#' + [0, 8, 4].map(n => Math.round(f(n) * 255).toString(16).padStart(2, '0')).join(''); };
    return { fg: hx(.8), bg2: hx(.34) }; }
  function junta(m) {
    const out = copia(PADRAO); IDS = [...BASE];
    for (const id of Object.keys(m || {})) if (ehNovo(id) && m[id] && typeof m[id].nome === 'string' && m[id].nome.trim()) { out[id] = novoPadrao(m[id].nome.trim()); IDS.push(id); }
    for (const id of IDS) { const x = m?.[id]; if (!x || typeof x !== 'object') continue; const o = out[id];
      if (o.novo) { if (typeof x.nome === 'string' && x.nome.trim()) o.nome = x.nome.trim().slice(0, 40); if (typeof x.caminho === 'string' && /^\/[a-z0-9/_-]{1,60}$/i.test(x.caminho)) o.caminho = x.caminho; if (typeof x.botao === 'string') o.botao = x.botao.slice(0, 40); }
      if (typeof x.let === 'string' && x.let.trim()) o.let = x.let.trim().slice(0, 3);
      o.fg = cor(x.fg, o.fg); o.bg = cor(x.bg, o.bg); o.bc = cor(x.bc, o.bc);
      if (x.borda === 0 || x.borda === 1) o.borda = x.borda;
      if (Number.isFinite(+x.raio)) o.raio = Math.max(0, Math.min(50, Math.round(+x.raio)));
      if (typeof x.img === 'string' && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/i.test(x.img)) o.img = x.img;
      // MAIS OPÇÕES (pedido da dona, 17/11/2026): tamanho das letras, degradê, espessura da borda e zoom/posição da imagem
      if (Number.isFinite(+x.tl)) o.tl = Math.max(.5, Math.min(1.6, +x.tl)); if (x.bg2 === '' || cor(x.bg2, '')) o.bg2 = cor(x.bg2, '');
      if (Number.isFinite(+x.be)) o.be = Math.max(1, Math.min(6, +x.be)); if (Number.isFinite(+x.z)) o.z = Math.max(.3, Math.min(4, +x.z));
      for (const k of ['x', 'y']) if (Number.isFinite(+x[k])) o[k] = Math.max(-64, Math.min(64, +x[k]));
      // ícone criado na ADM ainda no estilo antigo (contorno da cor das letras, sem degradê): passa sozinho para o estilo novo, a partir da cor dele (17/11/2026)
      if (o.novo && !('bg2' in x) && (x.borda ?? 1) === 1 && String(x.bc || x.fg || '').toLowerCase() === String(x.fg || x.bc || '').toLowerCase()) { const v = estiloNovo(o.fg); o.fg = o.bc = v.fg; o.bg2 = v.bg2; o.borda = 0; }
      else if (o.novo && !('bg2' in x)) o.bg2 = ''; }
    return out;
  }
  let guardado = null; try { guardado = JSON.parse(localStorage.getItem(K) || 'null'); } catch { }
  let cfg = junta(guardado?.m);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let nId = 0;
  /* O DESENHO (64×64): quadrado com cantos (raio em % do lado), fundo, borda fina e as letras CENTRADAS — na horizontal pelo
     meio da palavra e na vertical pela altura das MAIÚSCULAS (0,70 da fonte): a linha de base fica em 32 + 0,35 × fonte. */
  function svg(id, px, o = {}) {
    const c = (o.cfg || cfg)[id] || PADRAO[id] || PADRAO.an, r = c.raio / 100 * 64, b = c.borda ? (+c.be || 3) : 0, n = [...c.let].length;
    const tam = px ? ` width="${px}" height="${px}"` : ' width="100%" height="100%"';
    const g = /^#[0-9a-f]{6}$/i.test(c.bg2 || '') ? 'epig' + (++nId) : '', grad = g ? `<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg}"/><stop offset="1" stop-color="${c.bg2}"/></linearGradient>` : '', fundo = g ? `url(#${g})` : c.bg;
    if (c.img) { const cid = 'epic' + (++nId), borda = b ? `<rect x="${b / 2}" y="${b / 2}" width="${64 - b}" height="${64 - b}" rx="${Math.max(0, r - b / 2)}" fill="none" stroke="${c.bc}" stroke-width="${b}"/>` : '';
      // sem zoom/posição escolhidos, a imagem enche o quadrado (como antes); com zoom, ela cabe inteira e anda dentro do ícone, com o fundo atrás
      const im = c.z == null && c.x == null && c.y == null ? `<image href="${esc(c.img)}" width="64" height="64" preserveAspectRatio="xMidYMid slice"/>`
        : (t => `<image href="${esc(c.img)}" x="${(32 - t / 2 + (+c.x || 0)).toFixed(2)}" y="${(32 - t / 2 + (+c.y || 0)).toFixed(2)}" width="${t.toFixed(2)}" height="${t.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`)(64 * (+c.z || 1));
      return `<svg xmlns="http://www.w3.org/2000/svg"${tam} viewBox="0 0 64 64" aria-hidden="true"><defs>${grad}<clipPath id="${cid}"><rect width="64" height="64" rx="${r}"/></clipPath></defs><g clip-path="url(#${cid})"><rect width="64" height="64" fill="${fundo}"/>${im}</g>${borda}</svg>`; }
    const pequeno = px && px <= 20, fs = (n >= 3 ? 23 : n === 2 ? 29 : 36) * 1.1 * (pequeno ? 1.12 : 1) * (+c.tl || 1); // letras 10% maiores que antes (pedido da dona, 17/11/2026)
    return `<svg xmlns="http://www.w3.org/2000/svg"${tam} viewBox="0 0 64 64" aria-hidden="true">${grad ? '<defs>' + grad + '</defs>' : ''}<rect x="${b / 2}" y="${b / 2}" width="${64 - b}" height="${64 - b}" rx="${Math.max(0, r - b / 2)}" fill="${fundo}"${b ? ` stroke="${c.bc}" stroke-width="${b}"` : ''}/>`
      + `<text x="32" y="${(32 + fs * 0.35).toFixed(2)}" text-anchor="middle" font-family="'Segoe UI', system-ui, -apple-system, Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="800" font-size="${fs.toFixed(2)}" letter-spacing="-0.5" fill="${c.fg}">${esc(c.let)}</text></svg>`;
  }
  const url = id => 'data:image/svg+xml,' + encodeURIComponent(svg(id, 64));
  // programa desta página pelo endereço (o Ateliê troca com usar('at'))
  const p = location.pathname, porCaminho = p.startsWith('/shorts') ? 'sh' : p.startsWith('/editor') ? 'ed' : p.startsWith('/animador') ? (/[?&]atelie=/.test(location.search) ? 'at' : 'an') : p.startsWith('/musicas') ? 'mu' : p.startsWith('/modelador') ? 'md' : p.startsWith('/preparativos') ? 'pr' : p.startsWith('/cerebro') ? 'cb' : null;
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
  /* FORMA (17/11/2026): os cantos do ícone (raio da ADM › Ícones) valem também para a caixa em volta dele (a caixa do menu, da barra
     de baixo, do cabeçalho, do filtro, do carregamento), para nenhum lugar cortar o ícone com cantos fixos nem pôr uma sombra quadrada
     atrás de um ícone redondo. Vai no próprio elemento (style com !important, que vence o CSS de qualquer página) e na caixa que só
     tem ele dentro. */
  const CAIXAS = '.ic,.pi,.pg,.mi,.ep-lg,.ic-w,.ic-prog,.logo-ic,.ep-ic';
  function forma(el, id) { if (!el?.style) return; const c = cfg[id] || PADRAO[id]; if (!c) return; const r = Math.max(0, Math.min(50, +c.raio || 0)) + '%';
    el.style.setProperty('border-radius', r, 'important'); const d = el.firstElementChild; if (d && /^(svg|img)$/i.test(d.tagName)) d.style.setProperty('border-radius', r, 'important'); // o desenho também (há páginas que arredondam o svg)
    const pai = el.parentElement; if (pai && pai.childElementCount === 1 && pai.matches?.(CAIXAS)) pai.style.setProperty('border-radius', r, 'important'); }
  function pinta(raiz) {
    favicon();
    if (!porCaminho && !atual) atual = doCaminho();
    (raiz || document).querySelectorAll?.('[data-estudio-icone]').forEach(el => { let id = el.getAttribute('data-estudio-icone'); if (id === 'auto') id = atual || 'an'; if (!cfg[id] && !PADRAO[id]) return; /* ícone novo da ADM que ainda não chegou: mantém o que já está (ex.: as letras), em vez de mostrar o do Animador */ const ch = JSON.stringify(cfg[id] || '') + id;
      if (el._epIc === ch) return; el._epIc = ch; el.innerHTML = svg(id); forma(el, id); });
    // <img data-estudio-icone-img="an"> (telas de carregamento): troca a imagem pela de agora
    // imagens com os ícones ANTIGOS em qualquer lugar (botões, menus…): viram o ícone de agora (o mesmo da ADM)
    (raiz || document).querySelectorAll?.('img[src*="icone"]:not([data-estudio-icone-img])').forEach(im => { const id = antigo(im.getAttribute('src')); if (id) im.setAttribute('data-estudio-icone-img', id); });
    (raiz || document).querySelectorAll?.('img[data-estudio-icone-img]').forEach(im => { const id = im.getAttribute('data-estudio-icone-img'), u = url(id); if (im.src !== u) im.src = u; forma(im, id); });
  }
  // elementos novos com data-estudio-icone (telas que montam depois) também ganham o ícone
  const obs = new MutationObserver(ms => { const raizes = new Set(); /* desenha TODOS os grupos novos (antes parava no primeiro) */ for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.hasAttribute?.('data-estudio-icone') || n.hasAttribute?.('data-estudio-icone-img') || (n.tagName === 'IMG' && /icone/.test(n.getAttribute('src') || '')) || n.querySelector?.('[data-estudio-icone],[data-estudio-icone-img],img[src*="icone"]'))) { raizes.add(n.parentNode || n); } for (const r of raizes) pinta(r); });
  const liga = () => { pinta(); if (document.body) obs.observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') { favicon(); document.addEventListener('DOMContentLoaded', liga, { once: true }); } else liga();
  function troca(m, de) { // m = o que a ADM salvou (só o que difere do padrão)
    const novo = junta(m); if (JSON.stringify(novo) === JSON.stringify(cfg)) return;
    cfg = novo; if (!porCaminho) atual = doCaminho() || atual; try { localStorage.setItem(K, JSON.stringify({ m: m || {}, t: Date.now() })); } catch { }
    pinta(); try { dispatchEvent(new CustomEvent('estudio-icones', { detail: { de } })); } catch { }
  }
  // confere o que está salvo no porteiro (uma vez por abertura; guardado neste navegador para já abrir certo)
  async function busca() { try { const r = await fetch('/icones', { cache: 'no-cache', credentials: 'same-origin' }); if (!r.ok) return; const j = await r.json(); troca(j.icones || {}, 'nuvem'); try { localStorage.setItem(K, JSON.stringify({ m: j.icones || {}, t: Date.now() })); } catch { } } catch { } }
  let bc = null; try { bc = new BroadcastChannel('estudio-icones'); bc.onmessage = e => troca(e.data?.m, 'outra aba'); } catch { }
  addEventListener('storage', e => { if (e.key === K) { try { troca(JSON.parse(e.newValue || 'null')?.m, 'outra aba'); } catch { } } });
  // a tela de carregamento espera os ícones de agora (é rápido; o desenho já sai do que está guardado neste navegador)
  // ECONOMIA DE PEDIDOS (06/11/2026): conferidos há menos de 5 min neste navegador = não pergunta de novo a cada página aberta
  // (mudança da ADM chega na hora pelas outras abas deste navegador e, nos outros computadores, em até 5 min)
  const recente = (() => { try { return Date.now() - (JSON.parse(localStorage.getItem(K) || 'null')?.t || 0) < 5 * 60e3; } catch { return false; } })();
  const pronto = location.protocol.startsWith('http') && !recente ? busca() : Promise.resolve();
  const naTarefa = () => { try { window.EstudioProgresso?.tarefa?.(pronto, 'Ícones dos programas'); } catch { } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', naTarefa, { once: true }); else naTarefa();
  window.EstudioIcones = {
    PADRAO: copia(PADRAO), get IDS() { return [...IDS]; }, BASE: [...BASE], svg, url, pinta, forma, pronto, ehNovo, novoPadrao, estiloNovo,
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
