/* MONTANHA do Cérebro (2.0 Celeste, pedido da dona em 11/11/2026): o mapa de ligações em pontos, no formato de uma montanha.
   - Assunto = ponto azul (cresce com o que tem dentro); página = pontinho; memórias rápidas = pontos laranja em volta do Acampamento.
   - Altura = profundidade: subir é ir mais fundo. "Subir esta montanha" abre a montanha só daquele assunto.
   - Dados: a camada leve (/cerebro/leve) fica guardada no navegador; ao abrir, só pergunta /cerebro/mudou (uma consulta pequena).
   - Desenho num canvas do tamanho da tela; rolar só muda o que aparece (leve mesmo com muitos pontos).
   Usa do cerebro.js (carregado depois): api, aviso, vai, S. Fica tudo dentro desta função para não brigar com os nomes de lá. */
(() => {
'use strict';
const q$ = s => document.querySelector(s), H = document.documentElement;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sem = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const FRIO = 'Arquivo frio', CHAVE = 'ep-cerebro-leve-v1', calmo = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const IC = { subir: '<svg class="mt-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 19 6-10 4 6 2-3 6 7H3z"/></svg>', mais: '<svg class="mt-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>', x: '<svg class="mt-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>' };

// ---------- a estrutura da tela (criada uma vez) ----------
const raiz = document.createElement('div'); raiz.id = 'montanha';
raiz.innerHTML = `<canvas class="mt-tela" aria-hidden="true"></canvas><div class="mt-cena" tabindex="-1" aria-label="Montanha do Cérebro"><div class="mt-altura"></div></div><div class="mt-carrega" hidden>Abrindo a montanha…</div>
  <div class="mt-dica" hidden></div>
  <div class="mt-titulo"><nav class="mt-trilha" aria-label="Onde você está"></nav><div class="mt-esp"></div><button class="mt-bt pri" type="button" data-mt-add>${IC.mais}Adicionar ao Cérebro</button></div>
  <div class="mt-alt" aria-hidden="true"><div class="mt-trilho"><div class="mt-cursor"></div></div></div>
  <div class="mt-veu"></div><aside class="mt-painel" aria-label="Detalhes"><header><b></b><button class="mt-x" type="button" title="Fechar" aria-label="Fechar">${IC.x}</button></header><div class="mt-corpo"></div></aside>
  <div class="mt-jan" role="dialog" aria-modal="true" aria-label="Adicionar ao Cérebro"></div>`;
document.body.append(raiz);
const cv = raiz.querySelector('.mt-tela'), ctx = cv.getContext('2d'), cena = raiz.querySelector('.mt-cena'), dica = raiz.querySelector('.mt-dica'), painel = raiz.querySelector('.mt-painel'), veu = raiz.querySelector('.mt-veu'), jan = raiz.querySelector('.mt-jan');

// ---------- dados: camada leve guardada no navegador + só o que mudou ----------
let L = null;
const guarda = () => { try { localStorage.setItem(CHAVE, JSON.stringify(L)); } catch { } };
const junta = (velhos, novos) => { const m = new Map(velhos.map(x => [x.id, x])); for (const n of novos) { if (n.apagado) m.delete(n.id); else m.set(n.id, n); } return [...m.values()]; };
async function atualiza() {
  if (!L) try { L = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { L = null; }
  if (L && L.seq != null) { const j = await api('/mudou?desde=' + L.seq); if (j.nada) return false;
    if (!j.refazer) { const it = new Map(L.itens.map(x => [x.id, x])); for (const n of j.itens) it.set(n.id, n); L.itens = [...it.values()];
      L.cartoes = junta(L.cartoes, j.cartoes); L.assuntos = junta(L.assuntos, j.assuntos);
      L.etiquetas = L.etiquetas.filter(e => !j.etiquetasDe.includes(e.no)).concat(j.etiquetas); L.ligas = L.ligas.filter(e => !j.ligasDe.includes(e.de)).concat(j.ligas);
      L.seq = j.seq; guarda(); return true; } }
  L = await api('/leve'); guarda(); return true;
}
let D = null, A, P, etiq;
function monta() { const m = new Map(L.itens.map(x => [x.id, x]));
  const cam = x => { const o = []; for (let y = x, i = 0; y && i < 20; y = m.get(y.pai), i++) { if (y.apagado) return null; o.unshift(y.nome); } return o[0] === FRIO ? null : o.join('/'); };
  const paginas = L.itens.filter(x => x.tipo !== 'pasta' && !x.apagado).map(x => ({ id: x.id, nome: x.nome, resumo: x.resumo || '', caminho: cam(x), tam: x.tam || 0 })).filter(x => x.caminho);
  const ok = new Set(paginas.map(p => p.id));
  D = { paginas, assuntos: L.assuntos.filter(a => !a.apagado), cartoes: L.cartoes.filter(c => !c.apagado).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)), etiquetas: L.etiquetas.filter(e => ok.has(e.no)), ligas: L.ligas };
  A = new Map(D.assuntos.map(a => [a.id, a])); P = new Map(D.paginas.map(p => [p.id, p])); etiq = new Map();
  for (const e of D.etiquetas) { if (!etiq.has(e.assunto)) etiq.set(e.assunto, []); etiq.get(e.assunto).push(e.no); }
  if (L.adm != null && window.S) { S.adm = L.adm; if (L.pedidosNovos != null) S.pedidosNovos = L.pedidosNovos; } }
const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true });
const filhos = id => D.assuntos.filter(a => (a.pai || null) === id).sort(porNome);
const pagsDe = id => (etiq.get(id) || []).map(n => P.get(n)).filter(Boolean).sort(porNome);
const assuntosDa = no => D.etiquetas.filter(e => e.no === no).map(e => A.get(e.assunto)).filter(Boolean);
const debaixo = id => { const s = new Set(); const v = i => { for (const n of etiq.get(i) || []) s.add(n); for (const f of filhos(i)) v(f.id); }; v(id); return s.size; };
const acima = id => { const o = []; for (let a = A.get(id)?.pai ? A.get(A.get(id).pai) : null, i = 0; a && i < 12; a = a.pai ? A.get(a.pai) : null, i++) o.unshift(a); return o; };
const paginaDoCaminho = c => D.paginas.find(p => p.caminho === c);

// ---------- os pontos e onde cada um fica ----------
const rnd = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
const semente = str => { let h = 7; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 2147483646; return h + 1; };
function grafo(id) {
  const nos = [], arestas = [], idx = new Map(), add = (k, o) => { if (idx.has(k)) return idx.get(k); o.k = k; idx.set(k, o); nos.push(o); return o; };
  const raio = a => 6 + 2.3 * Math.sqrt(debaixo(a.id));
  const vis = (a, niv, ehRaiz) => { const n = add('a' + a.id, { t: ehRaiz ? 'raiz' : 'assunto', a, nivel: niv, r: ehRaiz ? Math.max(14, raio(a)) : raio(a) });
    if (!ehRaiz && a.pai && idx.has('a' + a.pai)) arestas.push({ a: n, b: idx.get('a' + a.pai), L: 64 + n.r * 2 }); for (const f of filhos(a.id)) vis(f, niv + 1); };
  if (!id) { const campo = add('campo', { t: 'campo', nivel: 0, r: 12 }); D.cartoes.forEach((c, i) => arestas.push({ a: add('c' + i, { t: 'cartao', c, nivel: 0, r: 5.5 }), b: campo, L: 46 })); filhos(null).forEach(a => vis(a, 1)); }
  else vis(A.get(id), 0, true);
  for (const p of D.paginas) { const as = assuntosDa(p.id).map(a => idx.get('a' + a.id)).filter(Boolean); if (!as.length) continue;
    const n = add('p' + p.id, { t: 'pagina', p, nivel: Math.max(...as.map(x => x.nivel)) + .55, r: 2.4 + Math.min(2.6, Math.log10(1 + (p.tam || 0) / 600)) });
    for (const x of as) arestas.push({ a: n, b: x, L: 26 + x.r }); }
  D.cartoes.forEach((c, i) => { const p = paginaDoCaminho(c.aponta), a = idx.get('c' + i), b = p && idx.get('p' + p.id); if (a && b) arestas.push({ a, b, fraca: 1 }); });
  for (const l of D.ligas) { const a = idx.get('p' + l.de), b = idx.get('p' + l.para); if (a && b) arestas.push({ a, b, L: 70, liga: 1 }); }
  return { nos, arestas, idx };
}
function arruma(G, W, id) {
  const r = rnd(semente(id || 'geral')), N = G.nos.length, maxN = Math.max(1, ...G.nos.map(n => n.nivel));
  const Hm = Math.max(innerHeight * 1.2, 420 + N * 6.5), base = 150, cume = base + Hm, cx = W / 2, baseHalf = Math.min(W * .4, 640);
  const hw = a => Math.max(10, baseHalf * Math.pow(Math.max(0, 1 - a), 1.08));
  // cada galho ganha a sua faixa na encosta: as folhas da árvore se espalham da esquerda para a direita
  const ehAs = o => o.t === 'assunto' || o.t === 'raiz', folhas = [], dfs = o => { const fs = G.nos.filter(x => ehAs(x) && x !== o && x.a.pai === o.a.id); if (!fs.length) folhas.push(o); else fs.forEach(dfs); };
  G.nos.filter(o => ehAs(o) && (o.t === 'raiz' || !G.idx.has('a' + o.a.pai))).forEach(dfs); folhas.forEach((o, i) => o.u = (i + .5) / folhas.length);
  const media = o => { if (o.u != null) return o.u; const fs = G.nos.filter(x => ehAs(x) && x !== o && x.a.pai === o.a.id); return o.u = fs.length ? fs.reduce((s, f) => s + media(f), 0) / fs.length : .5; };
  for (const o of G.nos) if (ehAs(o)) media(o);
  for (const o of G.nos) { if (o.t === 'pagina') { const as = G.arestas.filter(e => e.a === o && !e.liga && !e.fraca).map(e => e.b); o.u = as.length ? as.reduce((s, x) => s + (x.u ?? .5), 0) / as.length : .5; } if (o.u == null) o.u = .5;
    o.alvo = base + 50 + Math.min(1, o.nivel / maxN) * Hm * .8; o.xalvo = cx + (o.u - .5) * 2 * hw((o.alvo - base) / Hm) * .82; o.y = o.alvo + (r() - .5) * 60; o.x = o.xalvo + (r() - .5) * 40; o.vx = o.vy = 0; }
  const fixa = o => { const m = hw((o.y - base) / Hm) - o.r - 6; o.y = Math.min(cume - 30, Math.max(base + o.r + 4, o.y)); o.x = Math.min(cx + m, Math.max(cx - m, o.x)); };
  for (let it = 0, T = 280; it < T; it++) { const esfria = 1 - it / T;
    for (let i = 0; i < N; i++) { const p = G.nos[i]; for (let j = i + 1; j < N; j++) { const s = G.nos[j]; let dx = s.x - p.x, dy = s.y - p.y; const d2 = dx * dx + dy * dy + .01; if (d2 > 25600) continue;
      const min = p.r + s.r + (p.t === 'pagina' && s.t === 'pagina' ? 7 : 16), d = Math.sqrt(d2), f = (d < min ? (min - d) * .5 : 0) + 260 / d2; dx /= d; dy /= d; p.vx -= dx * f; p.vy -= dy * f; s.vx += dx * f; s.vy += dy * f; } }
    for (const e of G.arestas) { if (e.fraca) continue; const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.hypot(dx, dy) || 1, f = (d - e.L) * .035; e.a.vx += dx / d * f; e.a.vy += dy / d * f; e.b.vx -= dx / d * f * .35; e.b.vy -= dy / d * f * .35; }
    for (const o of G.nos) { o.vy += (o.alvo - o.y) * (o.t === 'pagina' ? .012 : .03); o.vx += (o.xalvo - o.x) * (o.t === 'pagina' ? .006 : .025); o.vx *= .8; o.vy *= .8; o.x += o.vx * (.4 + esfria); o.y += o.vy * (.4 + esfria); fixa(o); } }
  return { Hm, base, cume, cx, baseHalf, hw, maxN };
}

// ---------- desenho ----------
let atual = null, G = null, M = null, Ht = 0, foco = null, BUSCA = new Set(), C = {}, CAMINHO = null, NEVE = null, ESTRELAS = [], SERRAS = [], MARCAS = [], LARG = 0;
const cor = n => getComputedStyle(H).getPropertyValue(n).trim();
const pegaCores = () => { C = { acento: cor('--acento'), texto: cor('--texto'), texto3: cor('--texto-3'), r1: cor('--rocha-1'), r2: cor('--rocha-2'), r3: cor('--rocha-3'), neve: cor('--neve'), neveS: cor('--neve-sombra'), s1: cor('--serra-1'), s2: cor('--serra-2'), estrela: cor('--estrela'), escuro: H.dataset.tema !== 'claro', fonte: cor('--fonte') || 'system-ui' }; };
function desenha(id, animar) {
  atual = id || null; LARG = cena.clientWidth; const W = LARG; G = grafo(atual); M = arruma(G, W, atual); Ht = Math.max(cena.clientHeight + 100, M.cume + 170);
  raiz.querySelector('.mt-altura').style.height = Ht + 'px'; const r = rnd(semente('forma' + (atual || '')));
  const esq = [], dir = []; for (let v = 0; v <= M.Hm - 50; v += 46) { const a = v / M.Hm, h = M.hw(a) + 20 + r() * 26 + (a < .08 ? (1 - a / .08) * 160 : 0); esq.push([M.cx - h - r() * 14, M.base + v]); dir.push([M.cx + h + r() * 14, M.base + v]); }
  const pico = [M.cx + (r() - .5) * 18, M.cume + 26], pts = [[-40, M.base - 160], [M.cx - M.baseHalf - 420, M.base - 40], ...esq, pico, ...dir.reverse(), [M.cx + M.baseHalf + 430, M.base - 40], [W + 40, M.base - 160]];
  const p = new Path2D(); p.moveTo(pts[0][0], -pts[0][1]); for (let i = 1; i < pts.length - 1; i++) { const [x, y] = pts[i], [nx, ny] = pts[i + 1]; if (pts[i] === pico) p.lineTo(x, -y); else p.quadraticCurveTo(x, -y, (x + nx) / 2, -(y + ny) / 2); } p.lineTo(pts.at(-1)[0], -pts.at(-1)[1]); p.closePath(); CAMINHO = p;
  const lin = M.cume - Math.min(260, M.Hm * .16), nv = new Path2D(); nv.moveTo(-50, -(M.cume + 200)); nv.lineTo(W + 50, -(M.cume + 200)); for (let i = 0, n = 26; i <= n; i++) nv.lineTo(W + 50 - (W + 100) * i / n, -(lin - (i % 2 ? 14 + r() * 26 : r() * 10))); nv.closePath(); NEVE = nv;
  ESTRELAS = Array.from({ length: Math.round(W * Ht / 7000) }, () => [r() * W, r() * Ht, .3 + r() * 1.1, .25 + r() * .75]);
  SERRAS = [[.62, 9, 's1', .1], [.42, 14, 's2', .2]].map(([alt, n, c, vel]) => ({ c, vel, pts: Array.from({ length: n + 1 }, (_, i) => [i / n, alt * (.2 + r() * .7)]) }));
  const nomes = ['Acampamento', 'Trilhas', 'Encosta', 'Picos', 'Mais fundo']; MARCAS = [];
  for (let n = 0; n <= Math.min(4, Math.floor(M.maxN)); n++) { const ns = G.nos.filter(o => Math.floor(o.nivel) === n && o.t !== 'pagina'); if (ns.length) MARCAS.push({ nome: nomes[n], y: Math.min(...ns.map(o => o.y)), top: Ht - Math.min(...ns.map(o => o.y)) }); }
  const pronto = () => { cena.scrollTop = cena.scrollHeight; altimetro(); trilha(); pinta(); };
  if (animar && !calmo()) { cv.classList.add('sai'); setTimeout(() => { pronto(); requestAnimationFrame(() => cv.classList.remove('sai')); }, 200); } else pronto();
}
const vizinhos = o => { const s = new Set([o]); for (const e of G.arestas) { if (e.a === o) s.add(e.b); if (e.b === o) s.add(e.a); } return s; };
let pedidoQuadro = 0; const pinta = () => { if (!pedidoQuadro) pedidoQuadro = requestAnimationFrame(() => { pedidoQuadro = 0; quadro(); }); };
function quadro() {
  if (!G || !document.body.classList.contains('mt-on')) return; const dpr = devicePixelRatio || 1, w = cena.clientWidth, h = cena.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
  const st = cena.scrollTop, sobe = Math.max(0, cena.scrollHeight - h) - st, F = C.fonte;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = C.estrela; for (const [x, y, rr, o] of ESTRELAS) { const sy = y - st * .35 - (Ht - h) * .1; if (sy < -4 || sy > h + 4) continue; ctx.globalAlpha = o; ctx.fillRect(x, sy, rr, rr); } ctx.globalAlpha = 1;
  for (const s of SERRAS) { const chao = Ht - st - M.base + 60 - sobe * s.vel * .5, alt = 520; if (chao - alt > h) continue; ctx.fillStyle = C[s.c]; ctx.beginPath(); ctx.moveTo(0, chao + 400); for (const [fx, fy] of s.pts) ctx.lineTo(fx * w, chao - fy * alt); ctx.lineTo(w, chao + 400); ctx.fill(); }
  ctx.save(); ctx.translate(0, Ht - st);
  const g = ctx.createLinearGradient(0, -M.cume, 0, -M.base + 40); g.addColorStop(0, C.r1); g.addColorStop(.55, C.r2); g.addColorStop(1, C.r3); ctx.fillStyle = g; ctx.fill(CAMINHO);
  const lado = ctx.createLinearGradient(M.cx - M.baseHalf, 0, M.cx + M.baseHalf, 0); lado.addColorStop(0, 'rgba(255,255,255,.06)'); lado.addColorStop(.5, 'rgba(0,0,0,0)'); lado.addColorStop(1, 'rgba(0,0,0,.25)'); ctx.fillStyle = lado; ctx.fill(CAMINHO);
  ctx.save(); ctx.clip(CAMINHO); const gn = ctx.createLinearGradient(M.cx - 200, -M.cume, M.cx + 200, -M.cume + 300); gn.addColorStop(0, C.neve); gn.addColorStop(1, C.neveS); ctx.globalAlpha = C.escuro ? .9 : 1; ctx.fillStyle = gn; ctx.fill(NEVE); ctx.restore(); ctx.globalAlpha = 1;
  const viz = foco ? vizinhos(foco) : null, busca = BUSCA.size > 0, ve = o => (!viz || viz.has(o)) && (!busca || BUSCA.has(o.k));
  const topoV = -(Ht - st) - 40, baixoV = topoV + h + 80, naTela = y => -y > topoV && -y < baixoV;
  ctx.lineWidth = 1; for (const e of G.arestas) { if (!naTela(e.a.y) && !naTela(e.b.y)) continue; const forte = viz && (e.a === foco || e.b === foco);
    ctx.strokeStyle = e.liga || forte ? C.acento : C.texto3; ctx.globalAlpha = forte ? .8 : (viz || busca) ? .06 : e.fraca ? .1 : e.liga ? .5 : C.escuro ? .22 : .35;
    ctx.beginPath(); ctx.moveTo(e.a.x, -e.a.y); ctx.lineTo(e.b.x, -e.b.y); ctx.stroke(); }
  for (const o of G.nos) { if (!naTela(o.y)) continue; const vivo = ve(o); ctx.globalAlpha = vivo ? 1 : .18;
    const c = o.t === 'cartao' || o.t === 'campo' ? '#ffb340' : o.t === 'pagina' ? (C.escuro ? 'rgba(235,235,245,.78)' : 'rgba(40,48,64,.8)') : C.acento;
    if (o.t !== 'pagina' && vivo) { ctx.shadowColor = c; ctx.shadowBlur = o === foco ? 22 : 10; }
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(o.x, -o.y, o.r + (o === foco ? 2 : 0), 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    if (o.t === 'raiz') { ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.globalAlpha *= .5; ctx.beginPath(); ctx.arc(o.x, -o.y, o.r + 6, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
    if (busca && BUSCA.has(o.k)) { ctx.strokeStyle = C.acento; ctx.lineWidth = 2; ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(o.x, -o.y, o.r + 5, 0, 7); ctx.stroke(); ctx.lineWidth = 1; } }
  ctx.textAlign = 'center'; ctx.lineJoin = 'round'; const ocupado = [], livre = (x, y, lw) => { const b = [x - lw / 2 - 4, y - 13, x + lw / 2 + 4, y + 4]; if (ocupado.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) return false; ocupado.push(b); return true; };
  const escreve = (t, x, y, tam) => { ctx.globalAlpha = 1; ctx.font = `600 ${tam}px ${F}`; if (!livre(x, y, ctx.measureText(t).width)) return; ctx.lineWidth = 4; ctx.strokeStyle = C.escuro ? 'rgba(10,14,24,.85)' : 'rgba(255,255,255,.9)'; ctx.strokeText(t, x, y); ctx.fillStyle = C.texto; ctx.fillText(t, x, y); };
  if (foco && foco.a) escreve(foco.a.nome, foco.x, -foco.y + foco.r + 15, 13);
  for (const o of G.nos) { if (o.t === 'pagina' || o.t === 'cartao' || o === foco || !naTela(o.y)) continue;
    if (o.t === 'campo') { escreve('Acampamento', o.x, -o.y + o.r + 16, 13); continue; }
    if (!(o.t === 'raiz' || o.r >= 11 || atual) || !ve(o)) continue; escreve(o.a.nome, o.x, -o.y + o.r + 15, o.t === 'raiz' ? 15 : o.r >= 14 ? 13 : 12); }
  ctx.textAlign = 'left'; ctx.font = `600 11px ${F}`; ctx.fillStyle = C.texto3; ctx.globalAlpha = 1;
  for (const m of MARCAS) ctx.fillText(m.nome.toUpperCase(), Math.max(16, M.cx - M.hw((m.y - M.base) / M.Hm) - 150), -m.y + 4);
  ctx.restore(); cursor();
}

// ---------- mouse: passar mostra o nome, clicar explica ----------
const acha = ev => { if (!G) return null; const b = cena.getBoundingClientRect(), x = ev.clientX - b.left, y = Ht - (ev.clientY - b.top + cena.scrollTop); let m = null, md = 1e9;
  for (const o of G.nos) { const d = Math.hypot(o.x - x, o.y - y); if (d < o.r + 7 && d < md) { md = d; m = o; } } return m; };
const nomeDe = o => o.t === 'campo' ? 'Acampamento' : o.t === 'cartao' ? 'Memória rápida' : o.t === 'pagina' ? o.p.nome : o.a.nome;
const subDe = o => o.t === 'campo' ? 'As memórias rápidas: o que toda IA lê primeiro.' : o.t === 'cartao' ? o.c.texto : o.t === 'pagina' ? (o.p.resumo || o.p.caminho) : o.a.resumo;
cena.addEventListener('mousemove', ev => { const o = acha(ev); cena.style.cursor = o ? 'pointer' : ''; if (o !== foco) { foco = o; pinta(); }
  if (!o) { dica.hidden = true; return; } dica.innerHTML = `<b>${esc(nomeDe(o))}</b><span>${esc(subDe(o))}</span>`; dica.hidden = false;
  const b = cena.getBoundingClientRect(), x = Math.min(ev.clientX + 14, innerWidth - dica.offsetWidth - 12), y = ev.clientY + 16 + dica.offsetHeight > innerHeight ? ev.clientY - dica.offsetHeight - 12 : ev.clientY + 16; dica.style.left = x + 'px'; dica.style.top = Math.max(b.top + 4, y) + 'px'; });
cena.addEventListener('mouseleave', () => { foco = null; dica.hidden = true; pinta(); });
cena.addEventListener('click', ev => { const o = acha(ev); if (!o) return; dica.hidden = true;
  if (o.t === 'pagina') abrePagina(o.p); else if (o.t === 'cartao') { const p = paginaDoCaminho(o.c.aponta); abrePainel('Memória rápida', `<p class="mt-res" style="color:var(--texto)">${esc(o.c.texto)}</p>${p ? `<div class="mt-rot">Mais detalhe em</div><button class="mt-item" type="button" data-p="${p.id}"><b>${esc(p.nome)}</b><small>${esc(p.caminho)}</small></button>` : ''}`); }
  else if (o.t === 'campo') abrePainel('Acampamento', '<p class="mt-res">As memórias rápidas: o que toda IA lê logo no começo da conversa. Cada uma aponta para a página completa.</p>' + D.cartoes.map(c => { const p = paginaDoCaminho(c.aponta); return `<button class="mt-item" type="button"${p ? ` data-p="${p.id}"` : ''}><b>${esc(c.texto)}</b>${p ? `<small>${esc(p.caminho)}</small>` : ''}</button>`; }).join(''));
  else abreAssunto(o.a); });
cena.addEventListener('scroll', pinta, { passive: true });

// ---------- painel da direita ----------
function abrePainel(titulo, html) { painel.querySelector('header b').textContent = titulo; painel.querySelector('.mt-corpo').innerHTML = html; painel.classList.add('on'); veu.classList.add('on'); painel.querySelector('.mt-x').focus(); }
function abreAssunto(a) { const cad = acima(a.id), fs = filhos(a.id), ps = pagsDe(a.id), n = debaixo(a.id);
  abrePainel(a.nome, `${cad.length ? `<div class="mt-cam">${cad.map(x => esc(x.nome)).join(' › ')}</div>` : ''}<h2>${esc(a.nome)}</h2><p class="mt-res">${esc(a.resumo)}</p>
    ${a.id !== atual && (fs.length || ps.length) ? `<button class="mt-bt pri" type="button" data-subir="${esc(a.id)}">${IC.subir}Subir esta montanha</button>` : ''}
    ${fs.length ? `<div class="mt-rot">Dentro dele</div><div class="mt-chips">${fs.map(f => `<button class="mt-chip" type="button" data-as="${esc(f.id)}">${esc(f.nome)}</button>`).join('')}</div>` : ''}
    <div class="mt-rot">${ps.length ? `Páginas (${ps.length})` : n ? `${n} páginas nos assuntos de dentro` : 'Ainda sem páginas'}</div>${ps.map(p => `<button class="mt-item" type="button" data-p="${p.id}"><b>${esc(p.nome)}</b><small>${esc(p.resumo || p.caminho)}</small></button>`).join('')}`); }
function abrePagina(p) { if (!p) return; const as = assuntosDa(p.id);
  abrePainel(p.nome, `<div class="mt-cam">${esc(p.caminho)}</div><h2>${esc(p.nome)}</h2><p class="mt-res">${esc(p.resumo || 'Sem resumo ainda.')}</p>
    ${as.length ? `<div class="mt-rot">Assuntos</div><div class="mt-chips">${as.map(a => `<button class="mt-chip" type="button" data-as="${esc(a.id)}">${esc(a.nome)}</button>`).join('')}</div>` : ''}
    <button class="mt-bt pri" type="button" data-abrir="${p.id}">Abrir a página completa</button>`); }
const fecha = () => { painel.classList.remove('on'); jan.classList.remove('on'); veu.classList.remove('on'); };
painel.querySelector('.mt-x').onclick = fecha; veu.onclick = fecha;
addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('mt-on')) { fecha(); fechaAchados(); } });
painel.querySelector('.mt-corpo').onclick = e => { const s = e.target.closest('[data-subir]'), c = e.target.closest('[data-as]'), p = e.target.closest('[data-p]'), ab = e.target.closest('[data-abrir]');
  if (s) { fecha(); sobe(s.dataset.subir); } else if (c) abreAssunto(A.get(c.dataset.as)); else if (p) abrePagina(P.get(p.dataset.p)); else if (ab) { fecha(); vai('id=' + ab.dataset.abrir); } };

// ---------- altímetro, trilha e montanha de cada assunto (fica no endereço: ?m=<assunto>) ----------
function altimetro() { const t = raiz.querySelector('.mt-trilho'); t.querySelectorAll('.mt-marca').forEach(e => e.remove());
  for (const m of MARCAS) { const b = document.createElement('button'); b.type = 'button'; b.className = 'mt-marca'; b.style.top = (m.top / Ht * 100) + '%'; b.innerHTML = `<span>${esc(m.nome)}</span>`; b.title = m.nome;
    b.onclick = () => cena.scrollTo({ top: m.top - cena.clientHeight * .6, behavior: calmo() ? 'auto' : 'smooth' }); t.append(b); } cursor(); }
function cursor() { if (Ht) raiz.querySelector('.mt-cursor').style.top = Math.min(100, Math.max(0, (cena.scrollTop + cena.clientHeight / 2) / Ht * 100)) + '%'; }
function trilha() { const cad = atual ? [...acima(atual), A.get(atual)] : [];
  raiz.querySelector('.mt-trilha').innerHTML = `<button type="button" data-ir="">Montanha</button>` + cad.map(a => `<span class="mt-sep">›</span><button type="button" data-ir="${esc(a.id)}">${esc(a.nome)}</button>`).join(''); }
raiz.querySelector('.mt-trilha').onclick = e => { const b = e.target.closest('[data-ir]'); if (b) sobe(b.dataset.ir || null); };
function sobe(id) { if ((id || null) === atual) return; BUSCA = new Set(); history.pushState(null, '', id ? '?m=' + encodeURIComponent(id) : './'); desenha(id, true); }
const daUrl = () => { const m = new URLSearchParams(location.search).get('m'); return m && A.has(m) ? m : null; };

// ---------- busca no cabeçalho: na Montanha, os pontos achados ganham um anel e a lista mostra assuntos, páginas e trechos ----------
const qi = q$('#q'), box = document.createElement('div'); box.className = 'mt-achados'; box.hidden = true; q$('#busca')?.append(box);
const fechaAchados = () => { box.hidden = true; };
let tBusca = 0, nBusca = 0;
qi?.addEventListener('input', () => { if (!document.body.classList.contains('mt-on') || !G) return; const t = sem(qi.value).trim(); BUSCA = new Set();
  if (t.length < 2) { fechaAchados(); pinta(); return; }
  for (const o of G.nos) if (sem(nomeDe(o) + ' ' + subDe(o) + (o.p ? ' ' + o.p.caminho : '')).includes(t)) BUSCA.add(o.k); pinta();
  const as = D.assuntos.filter(a => sem(a.nome + ' ' + a.resumo).includes(t)).slice(0, 4), ps = D.paginas.filter(p => sem(p.nome + ' ' + p.resumo + ' ' + p.caminho).includes(t)).slice(0, 6);
  const local = [...as.map(a => `<button type="button" data-as="${esc(a.id)}"><b>${esc(a.nome)}</b><small>Assunto · ${esc(a.resumo)}</small></button>`), ...ps.map(p => `<button type="button" data-p="${p.id}"><b>${esc(p.nome)}</b><small>${esc(p.caminho)}</small></button>`)].join('');
  box.innerHTML = local || '<div class="mt-nada">Procurando dentro das páginas…</div>'; box.hidden = false;
  // dentro do texto das páginas: a busca por trechos da nuvem (só depois de parar de digitar)
  clearTimeout(tBusca); const n = ++nBusca; if (t.length < 3) return;
  tBusca = setTimeout(async () => { try { const j = await api('/trechos?n=5&q=' + encodeURIComponent(qi.value)); if (n !== nBusca) return;
    const tr = (j.itens || []).map(x => `<button type="button" data-abrir="${esc(x.no)}"><b>${esc(x.titulo || x.caminho.split('/').pop())}</b><small>${esc(x.caminho)} · ${esc(String(x.trecho || '').replace(/\*\*/g, '').replace(/\s+/g, ' '))}</small></button>`).join('');
    box.innerHTML = (local ? local : '') + (tr ? `<div class="mt-grupo">Dentro das páginas</div>${tr}` : local ? '' : '<div class="mt-nada">Nada encontrado.</div>'); } catch { } }, 350); });
box.onclick = e => { const b = e.target.closest('button'); if (!b) return; fechaAchados(); if (b.dataset.as) abreAssunto(A.get(b.dataset.as)); else if (b.dataset.p) abrePagina(P.get(b.dataset.p)); else if (b.dataset.abrir) vai('id=' + b.dataset.abrir); };
// Enter na Montanha abre o primeiro achado (fora dela, a busca continua indo para a aba Busca)
q$('#busca')?.addEventListener('submit', e => { if (!document.body.classList.contains('mt-on')) return; const b = box.querySelector('button'); if (b && !box.hidden) { e.preventDefault(); e.stopImmediatePropagation(); b.click(); } });
document.addEventListener('click', e => { if (!e.target.closest('#busca')) fechaAchados(); });

// ---------- Adicionar ao Cérebro: gera o pedido para a CelestIA e guarda em Pedidos ----------
const TIPOS = [['aprendizado', 'Aprendizado', 'aprender'], ['evitar', 'A evitar', 'evitar'], ['regra', 'Regra', 'aprender'], ['referencia', 'Referência', 'referencia']];
raiz.querySelector('[data-mt-add]').onclick = () => { let tipo = 'aprendizado'; const opts = D.assuntos.slice().sort(porNome).map(a => `<option value="${esc(a.id)}" ${a.id === atual ? 'selected' : ''}>${esc(a.nome)}</option>`).join('');
  jan.innerHTML = `<h3>Adicionar ao Cérebro</h3><p class="mt-sub">Escreva com as suas palavras. A CelestIA organiza, resume e guarda no lugar certo.</p>
    <label for="mt-o">O que guardar</label><textarea id="mt-o" maxlength="2500" placeholder="Ex.: nos Shorts, a legenda nunca cobre a boca da personagem"></textarea>
    <label>Tipo</label><div class="mt-seg">${TIPOS.map(([k, n]) => `<button type="button" data-t="${k}" class="${k === tipo ? 'on' : ''}">${n}</button>`).join('')}</div>
    <label for="mt-a">Assunto</label><select id="mt-a"><option value="">Deixar a CelestIA escolher</option>${opts}</select>
    <div class="mt-acoes"><button class="mt-bt" type="button" data-c>Cancelar</button><button class="mt-bt pri" type="button" data-g>Gerar o pedido</button></div>`;
  jan.classList.add('on'); veu.classList.add('on'); setTimeout(() => q$('#mt-o')?.focus(), 60);
  jan.querySelector('.mt-seg').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; tipo = b.dataset.t; jan.querySelectorAll('.mt-seg button').forEach(x => x.classList.toggle('on', x === b)); };
  jan.querySelector('[data-c]').onclick = fecha;
  jan.querySelector('[data-g]').onclick = async ev => { const o = q$('#mt-o').value.trim(); if (o.length < 3) { q$('#mt-o').focus(); return; } ev.target.disabled = true;
    const as = A.get(q$('#mt-a').value), T = TIPOS.find(t => t[0] === tipo);
    const base = `CelestIA, coloque isto no Cérebro do Estúdio Problems.\n\nO que guardar: ${o}\nTipo: ${T[1]}\nAssunto: ${as ? as.nome + ' (' + as.id + ')' : 'escolha o melhor'}\n\nSiga o molde de página (Resumo, O essencial, Como fazer, Erros comuns, Exemplos, Ligações), escreva um resumo de até 160 letras, ponha as etiquetas de assunto, confira que não tem segredo nem e-mail e me diga em que caminho gravou.`;
    let id = null; try { id = (await api('/pedir', { tipo: T[2], texto: base, alvo: as ? 'Assunto: ' + as.nome : '' })).id; } catch (e) { aviso('Não consegui guardar em Pedidos: ' + e.message, true); }
    const pedido = base + (id ? `\nQuando terminar, marque o pedido ${id} como feito (node ~/.claude/cerebro.mjs feito ${id}).` : '');
    jan.innerHTML = `<h3>Pedido pronto</h3><p class="mt-sub">${id ? 'Ele também ficou guardado em Pedidos, para nenhuma IA esquecer.' : 'Copie e mande para a CelestIA.'}</p><div class="mt-pedido">${esc(pedido)}</div>
      <ol class="mt-passos"><li>Copie o pedido.</li><li>Cole numa conversa do Claude.</li><li>A CelestIA grava e responde onde ficou.</li></ol>
      <div class="mt-acoes"><button class="mt-bt" type="button" data-c>Fechar</button><button class="mt-bt pri" type="button" data-cp>Copiar</button></div>`;
    jan.querySelector('[data-c]').onclick = fecha; jan.querySelector('[data-cp]').onclick = async () => { try { await navigator.clipboard.writeText(pedido); aviso('Pedido copiado.'); } catch { aviso('Não deu para copiar. Selecione o texto e copie.', true); } }; }; };

// ---------- ligar e desligar (o cerebro.js chama ao trocar de tela) ----------
new MutationObserver(() => { pegaCores(); pinta(); }).observe(H, { attributes: true, attributeFilter: ['data-tema'] });
let rt; addEventListener('resize', () => { if (!document.body.classList.contains('mt-on') || !D) return; clearTimeout(rt); rt = setTimeout(() => desenha(atual, false), 150); });
let aberta = null;
window.Montanha = {
  // a Montanha é a tela inicial (sem nada no endereço) e as montanhas de assunto (?m=<assunto>)
  eDaMontanha: p => { const k = [...p.keys()]; return !k.length || (k.length === 1 && k[0] === 'm'); },
  async abre() { document.body.classList.add('mt-on'); pegaCores(); fecha();
    if (!D) { const carrega = raiz.querySelector('.mt-carrega'); try { L = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { L = null; }
      if (L) { monta(); desenha(daUrl(), false); } else carrega.hidden = false;
      // confere com a nuvem: se mudou algo, redesenha (o computador nunca fica desatualizado)
      aberta = atualiza().then(mudou => { carrega.hidden = true; if (mudou || !G) { monta(); desenha(daUrl(), false); } }).catch(e => { carrega.hidden = true; if (!G) throw e; aviso('Não consegui conferir se o Cérebro mudou: ' + e.message, true); });
      return L ? undefined : aberta; }
    const m = daUrl(); if ((m || null) !== atual) desenha(m, true); else pinta();
    atualiza().then(mudou => { if (mudou) { monta(); desenha(atual, false); } }).catch(() => { }); },
  fecha() { document.body.classList.remove('mt-on'); fecha(); fechaAchados(); dica.hidden = true; BUSCA = new Set(); },
};
})();
