/* ===================== app.js — PREPARATIVOS (Estúdio Problems) =====================
   O que vem antes de animar ou editar: roteiros em partes, falas por personagem, gravação das falas, destino e legendas.
   Nuvem: rotas /preparativos* do turma-ia (formato no README.md). Rascunhos e áudios ficam NESTE navegador (IndexedDB
   "ep-preparativos") até a pessoa mandar para a nuvem. */
'use strict';
const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const SRV = PREP_CONFIG.servidor;
const DESTINOS = Object.fromEntries(PREP_CONFIG.destinos), STATUS = Object.fromEntries(PREP_CONFIG.status);
const tempo = s => { s = Math.max(0, +s || 0); return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') + (s < 10 ? ',' + Math.floor(s * 10 % 10) : ''); };
const quando = t => { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };

/* ---------- ícones de linha (iguais aos do menu) ---------- */
const IC = {
  mais: '<path d="M12 5v14M5 12h14"/>', voltar: '<path d="M15 18l-6-6 6-6"/>', mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  play: '<path d="M7 5l12 7-12 7z"/>', parar: '<rect x="6" y="6" width="12" height="12" rx="2"/>', lixo: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  nuvem: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/>', enviar: '<path d="M12 16V5M7 10l5-5 5 5M5 19h14"/>', ok: '<path d="M5 12l5 5 9-10"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>', atualizar: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>', organizar: '<path d="M4 6h10M4 12h16M4 18h7"/><path d="M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
  luz: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>', pessoa: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  alerta: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  desfazer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', refazer: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  titulo: '<path d="M6 4v16M18 4v16M6 12h12"/>', baixo: '<path d="M6 9l6 6 6-6"/>', ajuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 1-1 1.7M12 17v.5"/>', legenda: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 14h4M13 14h4M7 10h10"/>',
};
const ic = (n, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;

/* ---------- avisos ---------- */
function aviso(t, tipo = 'info', ms = 4200) { const el = h(`<div class="aviso ${tipo}">${esc(t)}</div>`); $('#avisos').appendChild(el); setTimeout(() => { el.classList.add('sai'); setTimeout(() => el.remove(), 300); }, ms); }
function pergunta(titulo, msg, botoes) {
  return new Promise(ok => { const el = h(`<div class="modal"><div class="caixa"><b>${esc(titulo)}</b><p>${esc(msg)}</p><div class="bts"></div></div></div>`);
    for (const [rot, val, cls] of botoes) { const b = h(`<button class="bt ${cls || ''}">${esc(rot)}</button>`); b.onclick = () => { el.remove(); ok(val); }; $('.bts', el).appendChild(b); }
    document.body.appendChild(el); });
}

/* ---------- permissões (níveis de acesso: outra parte do Estúdio decide; sem ela, pode tudo) ---------- */
const pode = c => { try { return window.EstudioPerm?.pode?.('preparativos.' + c) ?? true; } catch { return true; } };

/* ---------- banco deste navegador: rascunhos e áudios que ainda não foram para a nuvem ---------- */
const DB = {
  _db: null,
  abre() { return this._db || (this._db = new Promise((ok, no) => { const r = indexedDB.open('ep-preparativos', 1); r.onupgradeneeded = () => { r.result.createObjectStore('rasc'); r.result.createObjectStore('aud'); }; r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); })); },
  async op(loja, modo, f) { const db = await this.abre(); return new Promise((ok, no) => { const tx = db.transaction(loja, modo), st = tx.objectStore(loja), r = f(st); tx.oncomplete = () => ok(r?.result); tx.onerror = () => no(tx.error); }); },
  get(l, k) { return this.op(l, 'readonly', s => s.get(k)); }, put(l, k, v) { return this.op(l, 'readwrite', s => s.put(v, k)); }, del(l, k) { return this.op(l, 'readwrite', s => s.delete(k)); },
  async todos(l) { const db = await this.abre(); return new Promise((ok, no) => { const out = [], tx = db.transaction(l, 'readonly'), c = tx.objectStore(l).openCursor(); c.onsuccess = () => { const x = c.result; if (x) { out.push([x.key, x.value]); x.continue(); } }; tx.oncomplete = () => ok(out); tx.onerror = () => no(tx.error); }); },
};

/* ---------- nuvem ---------- */
const Nuvem = {
  async hd() { const t = await window.EstudioLogin?.token?.(); return t ? { authorization: t } : {}; },
  async pede(caminho, o = {}) {
    let r; try { r = await fetch(SRV + caminho, { ...o, headers: { ...(await this.hd()), ...(o.headers || {}) }, cache: 'no-store' }); } catch { throw new Error('Não consegui falar com a nuvem. Confira a internet e tente de novo.'); }
    const tipo = r.headers.get('content-type') || '';
    if (!r.ok) { const j = tipo.includes('json') ? await r.json().catch(() => ({})) : {}; const e = new Error(j.error?.message || `A nuvem respondeu ${r.status}.`); e.status = r.status; e.tipo = j.error?.type; e.dados = j.error; throw e; }
    if (o.blob) return r.blob();
    return tipo.includes('json') ? r.json() : r.text();
  },
  json(caminho, metodo, corpo) { return this.pede(caminho, { method: metodo, headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }); },
  lista() { return this.pede('/preparativos'); },
  async abre(id) { const r = await fetch(SRV + '/preparativos/arquivo?k=' + encodeURIComponent(`preparativos/${id}/prep.json`), { headers: await this.hd(), cache: 'no-store' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error?.message || 'Não consegui abrir este roteiro da nuvem.'); }
    const P = await r.json(); P.mod = +r.headers.get('x-mod') || P.mod || 0; return P; },
  salva(P, forcar) { return this.pede(`/preparativos/arquivo?k=${encodeURIComponent(`preparativos/${P.id}/prep.json`)}&base=${+P.mod || 0}${forcar ? '&forcar=1' : ''}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(P) }); },
  acao(corpo) { return this.json('/preparativos/acao', 'POST', corpo); },
  cores() { return this.pede('/preparativos/arquivo?k=preparativos/cores.json').catch(e => { if (e.status === 404) return {}; throw e; }); },
  _aud: new Map(),
  async audio(k) { if (!this._aud.has(k)) this._aud.set(k, this.pede('/preparativos/arquivo?k=' + encodeURIComponent(k), { blob: true }).catch(e => { this._aud.delete(k); throw e; })); return this._aud.get(k); },
};

/* ---------- estado ---------- */
const S = { aba: 'roteiros', lista: null, P: null, sub: 'roteiro', sujo: false, eu: null, cores: null, tocando: null, ed: null };
const coresPadrao = ['#19f0f0', '#ffb04a', '#ff6b93', '#a796ff', '#4fe08f', '#ffd36b', '#7fd1ff', '#ff8f6b'];
const corDe = (nome, P = S.P) => { const k = Roteiro.chave(nome); return P?.legenda?.cores?.[k] || S.cores?.[k] || null; };
const corOuPadrao = (nome, i) => corDe(nome) || coresPadrao[i % coresPadrao.length];

function novoPrep(nome = 'Roteiro novo', texto = '') {
  return { v: 1, id: 'pr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), nome, destino: null, status: 'rascunho', roteiro: texto, partes: Roteiro.separa(texto), legenda: { ativa: true, cores: {} }, usadoPor: [], criado: Date.now(), mod: 0, novo: true };
}
// rascunho deste navegador (guardado a cada mudança, sem gastar a nuvem)
let tGuarda = 0;
function marcaSujo() { S.sujo = true; pintaBarraPrep(); clearTimeout(tGuarda); tGuarda = setTimeout(() => DB.put('rasc', S.P.id, { P: S.P, base: S.base, em: Date.now() }).catch(() => { }), 600); }

/* ======================= telas ======================= */
const tela = () => $('#tela');
function trocaAba(a) { S.aba = a; S.P = null; $$('[data-aba]').forEach(b => b.classList.toggle('on', b.dataset.aba === a)); history.replaceState(null, '', a === 'roteiros' ? './' : './?aba=' + a); pinta(); }
async function sairDoPrep() { if (S.sujo && !await pergunta('Sair sem mandar para a nuvem?', 'O que você mudou continua guardado neste computador e aparece aqui da próxima vez.', [['Ficar', false], ['Sair', true, 'pri']])) return false; S.P = null; S.sujo = false; S.ed = null; history.replaceState(null, '', './'); pinta(); return true; }
function pinta() { if (S.P) return pintaPrep(); if (S.aba === 'ideias') return Ideias.pinta(); if (S.aba === 'cores') return pintaCores(); return pintaInicio(); }
// bolinha com as iniciais do personagem, na cor dele (sem rosto de personagem)
const iniciais = n => { const p = Roteiro.norm(n).split(' ').filter(Boolean); return ((p[0]?.[0] || '?') + (p.length > 1 ? p[1][0] : (p[0]?.[1] || ''))).toUpperCase(); };
const ava = (nome, cor, tam = '') => `<span class="ava ${tam}" style="--c:${cor}" title="${esc(nome)}">${esc(iniciais(nome))}</span>`;
const icProg = d => ({ animador: 'an', shorts: 'sh', editor: 'ed' }[d]);
const progIc = (d, px = 18) => window.EstudioIcones && icProg(d) ? window.EstudioIcones.svg(icProg(d), px) : ic('doc', px);
const anel = (pct, tam = 44) => { const r = 16, L = 2 * Math.PI * r; return `<svg class="anel" width="${tam}" height="${tam}" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="4"/><circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--ok)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(pct / 100 * L).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 20 20)"/><text x="20" y="24" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">${pct}%</text></svg>`; };

/* ---------- início: lista dos roteiros ---------- */
let filtro = 'todos';
async function pintaInicio(novo) {
  const el = tela(); el.innerHTML = `<section class="inicio">
    <div class="hero"><div class="hero-txt"><h1>Do roteiro à gravação</h1><p>Escreva como num documento. O Estúdio separa sozinho as falas de cada personagem, e cada pessoa grava só a parte dela.</p>
      <ol class="passos"><li><i>${ic('doc', 16)}</i><b>Escrever</b><small>como no Google Docs</small></li><li><i>${ic('pessoa', 16)}</i><b>Separar</b><small>falas por personagem</small></li><li><i>${ic('mic', 16)}</i><b>Gravar</b><small>pelo navegador</small></li><li><i>${ic('ok', 16)}</i><b>Pronto</b><small>vai para o programa</small></li></ol></div>
      ${pode('roteiro') ? `<button class="bt pri grande" data-novo>${ic('mais', 18)} Novo roteiro</button>` : ''}</div>
    <div class="filtros">${[['todos', 'Todos'], ...PREP_CONFIG.status].map(([k, n]) => `<button data-f="${k}" class="${filtro === k ? 'on' : ''}">${esc(n)}</button>`).join('')}<span class="esp"></span><button class="bt ic" data-at title="Buscar de novo">${ic('atualizar')}</button></div>
    <div class="locais"></div><div class="grade nuvem"><div class="vazio">Carregando…</div></div></section>`;
  $('[data-at]', el).onclick = () => { S.lista = null; pintaInicio(true); };
  $('[data-novo]', el)?.addEventListener('click', () => abrePrep(novoPrep()));
  $$('[data-f]', el).forEach(b => b.onclick = () => { filtro = b.dataset.f; pintaInicio(); });
  try { const R = (await DB.todos('rasc')).map(([, v]) => v).filter(v => v?.P?.id).sort((a, b) => b.em - a.em); const box = $('.locais', el);
    if (R.length) { box.innerHTML = `<h2>${ic('alerta', 14)} Só neste computador (falta mandar para a nuvem)</h2><div class="grade"></div>`; for (const r of R) { const c = cartao(r.P, true); c.onclick = () => abrePrep(r.P, r.base); $('.grade', box).appendChild(c); } } } catch { }
  const g = $('.grade.nuvem', el);
  try { if (!S.lista || novo) S.lista = (await Nuvem.lista()).itens || []; }
  catch (e) { g.innerHTML = `<div class="vazio erro">${esc(e.message)}</div>`; return; }
  const L = S.lista.filter(x => filtro === 'todos' || (x.status || 'rascunho') === filtro).sort((a, b) => (b.mod || 0) - (a.mod || 0));
  g.innerHTML = L.length ? '' : `<div class="vazio">${S.lista.length ? 'Nenhum roteiro nesta situação.' : 'Nenhum roteiro na nuvem ainda. Comece com "Novo roteiro".'}</div>`;
  for (const it of L) { const c = cartao(it); c.onclick = async () => { c.classList.add('carregando'); try { abrePrep(await Nuvem.abre(it.id)); } catch (e) { aviso(e.message, 'erro'); c.classList.remove('carregando'); } }; g.appendChild(c); }
}
function cartao(it, local) {
  const fs = Array.isArray(it.partes) ? it.partes.flatMap(p => p.falas || []) : null;
  const n = fs ? fs.length : it.n || 0, g = fs ? fs.filter(f => f.audio).length : it.g || 0, np = Array.isArray(it.partes) ? it.partes.length : it.partes || 0;
  const pers = fs ? Roteiro.personagens(it.partes).map(p => p.nome) : it.pers || [], pct = n ? Math.round(g / n * 100) : 0, st = it.status || 'rascunho';
  return h(`<button class="cartao ${esc(st)}"><div class="topo"><span class="st">${esc(STATUS[st] || 'Rascunho')}</span>${it.destino ? `<span class="dest">${progIc(it.destino, 16)} ${esc(DESTINOS[it.destino] || it.destino)}</span>` : ''}</div>
    <div class="meio"><div><b>${esc(it.nome || 'Sem nome')}</b><small>${np} parte${np === 1 ? '' : 's'} · ${n} fala${n === 1 ? '' : 's'}</small></div>${anel(pct)}</div>
    <div class="elenco">${pers.slice(0, 6).map((p, i) => ava(p, corDe(p) || coresPadrao[i % coresPadrao.length], 'p')).join('')}${pers.length > 6 ? `<span class="mais">+${pers.length - 6}</span>` : ''}</div>
    <small class="mt">${local ? 'falta mandar para a nuvem' : 'mudado ' + esc(quando(it.mod))}</small></button>`);
}

/* ---------- um preparativo ---------- */
// para que serve cada etapa (aparece embaixo do cabeçalho e no "title" dos botões)
const ETAPA_TIT = { rascunho: 'Ainda escrevendo o roteiro', gravando: 'Roteiro fechado: cada pessoa grava as falas do seu personagem', pronto: 'Tudo certo: o programa de destino já pode usar' };
const ETAPA_DICA = P => { const st = P.status || 'rascunho', d = DESTINOS[P.destino];
  if (st === 'rascunho') return `<b>Rascunho</b> · escreva e arrume o roteiro. Quando as falas estiverem certas, passe para <b>Gravando</b>.`;
  if (st === 'gravando') return `<b>Gravando</b> · cada pessoa abre "Falas e gravação", escolhe o seu personagem e grava. Quando tudo estiver gravado, marque <b>Pronto</b>.`;
  return `<b>Pronto</b> · ${d ? `já aparece para o <b>${esc(d)}</b> usar (as falas, os áudios e as cores das legendas vão juntos).` : 'escolha para qual programa ele vai.'}`; };
async function abrePrep(P, base) {
  // tem rascunho deste computador mais novo que o da nuvem?
  if (!base && !P.novo) { try { const r = await DB.get('rasc', P.id); if (r?.P && (+r.base?.mod || 0) === (+P.mod || 0) && r.em > (P.mod || 0)) { const usar = await pergunta('Continuar de onde parou?', 'Este computador tem mudanças neste roteiro que ainda não foram para a nuvem.', [['Abrir o da nuvem', false], ['Continuar daqui', true, 'pri']]); if (usar) { base = r.base; P = r.P; } else await DB.del('rasc', P.id); } } catch { } }
  S.P = P; S.base = base || { mod: P.mod || 0, roteiro: P.roteiro || '' }; S.sujo = !!base || !!P.novo; S.sub = pode('roteiro') || pode('organizar') ? (S.sub || 'roteiro') : 'falas'; S.ed = null;
  if (!S.cores) Nuvem.cores().then(c => { S.cores = c || {}; if (S.P) { S.ed?.repinta(); if (S.sub !== 'roteiro') pintaCorpo(); } }).catch(() => { S.cores = {}; });
  history.replaceState(null, '', './?id=' + encodeURIComponent(P.id)); pintaPrep();
}
function pintaPrep() {
  const P = S.P, el = tela(), pp = pode('pronto'), ordem = PREP_CONFIG.status.map(x => x[0]), at = ordem.indexOf(P.status || 'rascunho');
  el.innerHTML = `<section class="prep"><div class="cab-doc">
      <button class="bt ic" data-volta title="Voltar aos roteiros">${ic('voltar')}</button>
      <span class="doc-ic">${ic('doc', 22)}</span>
      <div class="titulo"><input class="nome" value="${esc(P.nome)}" ${pode('roteiro') ? '' : 'readonly'} aria-label="Nome do roteiro"><span class="salvar"></span></div>
      <span class="esp"></span>
      <div class="destinos" role="group" aria-label="Vai para">${PREP_CONFIG.destinos.map(([v, n]) => `<button data-destino="${v}" class="${P.destino === v ? 'on' : ''}" ${pp ? '' : 'disabled'} title="Vai para o ${esc(n)}">${progIc(v, 18)}<span>${esc(n)}</span></button>`).join('')}</div>
      <div class="etapas" role="group" aria-label="Situação">${PREP_CONFIG.status.map(([v, n], i) => `<button data-status="${v}" class="${i < at ? 'feito' : i === at ? 'on' : ''}" ${pp ? '' : 'disabled'} title="${esc(ETAPA_TIT[v])}"><i>${i < at ? ic('ok', 12) : i + 1}</i>${esc(n)}</button>`).join('')}</div>
      <span class="enviar"></span>
    </div>
    <p class="etapa-dica etapa-${esc(P.status || 'rascunho')}">${ETAPA_DICA(P)}</p>
    <nav class="sub">${[['roteiro', 'Roteiro', 'doc'], ['falas', 'Falas e gravação', 'mic'], ['legendas', 'Legendas', 'legenda']].map(([k, n, i]) => `<button data-sub="${k}" class="${S.sub === k ? 'on' : ''}">${ic(i, 15)} ${n}</button>`).join('')}</nav>
    <div class="corpo"></div></section>`;
  $('[data-volta]', el).onclick = sairDoPrep;
  const nm = $('.nome', el); nm.oninput = () => { P.nome = nm.value.slice(0, 80); marcaSujo(); };
  const mudaMarca = async (campo, v) => {
    if (campo === 'status' && v === P.status) return;
    if (campo === 'status' && v === 'pronto') { // pronto = vai para um programa: precisa do destino e avisa o que falta gravar
      if (!P.destino) { const d = await pergunta('Vai para qual programa?', 'Escolha onde este roteiro vai ser usado. Ele passa a aparecer lá como pronto.', [...PREP_CONFIG.destinos.map(([k, n]) => [n, k]), ['Cancelar', null]]); if (!d) return; P.destino = d; }
      const falta = P.partes.reduce((s, p) => s + p.falas.filter(f => !f.audio).length, 0);
      if (falta && !await pergunta('Ainda faltam gravações', `${falta} fala${falta === 1 ? ' está' : 's estão'} sem áudio. Marcar como pronto mesmo assim?`, [['Voltar', false], ['Marcar pronto', true, 'pri']])) return;
    }
    P[campo] = v || null; if (campo === 'status') P.status = v || 'rascunho';
    const dest = DESTINOS[P.destino] || P.destino, msg = campo !== 'status' ? (P.destino ? `Vai para o ${dest}.` : 'Sem destino.') : v === 'pronto' ? `Pronto! Já aparece para o ${dest} usar.` : v === 'gravando' ? 'Hora de gravar: cada pessoa escolhe o seu personagem e grava as falas dele.' : 'Voltou para rascunho: ainda está sendo escrito.';
    if (campo === 'status' && v === 'gravando') S.sub = 'falas';
    if (P.novo || S.sujo) { marcaSujo(); aviso(msg + ' (vai junto quando mandar para a nuvem)', 'info', 5500); return pintaPrep(); } // vai junto quando mandar para a nuvem
    try { const r = await Nuvem.acao({ acao: 'marca', id: P.id, destino: P.destino, status: P.status }); P.mod = r.mod || P.mod; S.base.mod = P.mod; aviso(msg, 'ok', 5500); S.lista = null; }
    catch (e) { aviso(e.message, 'erro'); }
    pintaPrep();
  };
  $$('[data-destino]', el).forEach(b => b.onclick = () => mudaMarca('destino', P.destino === b.dataset.destino ? '' : b.dataset.destino));
  $$('[data-status]', el).forEach(b => b.onclick = () => mudaMarca('status', b.dataset.status));
  $$('[data-sub]', el).forEach(b => b.onclick = () => { S.sub = b.dataset.sub; $$('[data-sub]', el).forEach(x => x.classList.toggle('on', x === b)); pintaCorpo(); });
  pintaBarraPrep(); pintaCorpo();
}
function pintaBarraPrep() {
  const P = S.P, sv = $('.prep .salvar'), en = $('.prep .enviar'); if (!P || !sv) return;
  sv.innerHTML = S.sujo ? `<span class="aqui">${ic('alerta', 13)} Guardado neste computador</span>` : P.mod ? `<span class="salvo">${ic('nuvem', 13)} Salvo na nuvem · ${esc(quando(P.mod))}</span>` : '';
  en.innerHTML = S.sujo ? `<button class="bt pri" data-salva>${ic('nuvem')} Mandar para a nuvem</button>` : '';
  const b = $('[data-salva]', en); if (b) b.onclick = () => salvaPrep(b);
}
async function salvaPrep(bt) {
  const P = S.P; if (!pode('roteiro') && !pode('organizar') && !pode('pronto')) return aviso('Sua conta pode gravar, mas não mudar o roteiro.', 'erro');
  if (bt) { bt.disabled = true; bt.textContent = 'Mandando…'; }
  try {
    const { novo, ...corpo } = P; let r;
    try { r = await Nuvem.salva(corpo); }
    catch (e) {
      if (e.status !== 409 || e.tipo !== 'conflito') throw e;
      // alguém mexeu enquanto você editava: junta (o seu texto + os áudios que chegaram) se o roteiro da nuvem não mudou
      const nv = await Nuvem.abre(P.id);
      if ((nv.roteiro || '') === (S.base.roteiro || '')) { P.partes = Roteiro.separa(P.roteiro, nv.partes); P.mod = nv.mod; P.usadoPor = nv.usadoPor || []; r = await Nuvem.salva({ ...P, novo: undefined }); }
      else { const esc2 = await pergunta('Outra pessoa mudou este roteiro', 'A versão da nuvem tem um roteiro diferente do que você abriu. O que fazer?', [['Abrir a versão da nuvem', 'abrir'], ['Salvar a minha por cima', 'forcar', 'perigo'], ['Cancelar', null]]);
        if (esc2 === 'abrir') { await DB.del('rasc', P.id).catch(() => { }); S.sujo = false; return abrePrep(nv); }
        if (esc2 !== 'forcar') return; r = await Nuvem.salva({ ...P, novo: undefined }, true); }
    }
    P.mod = r.mod; delete P.novo; S.base = { mod: P.mod, roteiro: P.roteiro }; S.sujo = false; S.lista = null; await DB.del('rasc', P.id).catch(() => { });
    aviso('Mandado para a nuvem.', 'ok'); if (S.sub === 'falas') pintaCorpo();
  } catch (e) { aviso(e.message, 'erro'); }
  finally { pintaBarraPrep(); }
}
function pintaCorpo() { const c = $('.prep .corpo'); if (!c) return; if (S.sub !== 'roteiro') S.ed = null; if (S.sub === 'falas') return Falas.pinta(c); if (S.sub === 'legendas') return pintaLegendas(c); return pintaRoteiro(c); }
// cor de cada personagem do roteiro aberto (na ordem em que aparecem)
function coresDoRoteiro() { const m = new Map(); Roteiro.personagens(S.P?.partes).forEach((p, i) => m.set(p.chave, corOuPadrao(p.nome, i))); return m; }

/* ---------- aba Roteiro: a folha estilo Google Docs ---------- */
const COMO = `<div class="como"><b>Como escrever</b>
  <div class="ex"><span class="mk">## </span><b>Episódio 1 parte 1</b><small>título de uma parte</small></div>
  <div class="ex"><span class="nm" style="--c:#19f0f0">Problems</span>: Oi, gente!<small>fala: Nome + dois-pontos</small></div>
  <div class="ex"><span class="nm" style="--c:#ffb04a">Clara</span>: <i><span class="mk">*</span>rindo<span class="mk">*</span></i> Oi!<small>*itálico* = como falar (fora da legenda)</small></div>
  <div class="ex"><i><span class="mk">*</span>Problems abre a porta.<span class="mk">*</span></i><small>linha em itálico = ação / cena</small></div>
  <div class="ex"><i>[a câmera se aproxima]</i><small>colchetes = cena</small></div>
  <p>Dica: selecione um trecho (ou clique com o botão direito nele) para dizer se é <b>nome do personagem</b>, <b>ação</b> ou <b>título de parte</b>. Colar do Google Docs funciona: o itálico de lá vira ação.</p></div>`;
function pintaRoteiro(c) {
  const P = S.P, ed = pode('roteiro');
  c.innerHTML = `<div class="docs">
    <div class="docs-barra">
      ${ed ? `<button class="bt ic" data-desf title="Desfazer (Ctrl+Z)">${ic('desfazer', 16)}</button><button class="bt ic" data-ref title="Refazer (Ctrl+Y)">${ic('refazer', 16)}</button><span class="sep"></span>
      <button class="bt" data-parte title="Começa uma parte nova">${ic('titulo', 15)} Parte</button>
      <div class="falade"><button class="bt" data-falade title="Começa uma fala de um personagem">${ic('pessoa', 15)} Fala de… ${ic('baixo', 12)}</button><div class="lista-pers" hidden></div></div>
      <button class="bt" data-acao title="Ação ou explicação da cena (Ctrl+I)"><i class="ital">I</i> Ação</button><span class="sep"></span>` : '<span class="ler">Só leitura</span>'}
      ${pode('organizar') ? `<button class="bt" data-org title="Arruma um texto solto em partes e falas">${ic('organizar', 15)} Organizar</button>` : ''}
      <span class="esp"></span><button class="bt" data-como>${ic('ajuda', 15)} Como escrever</button>
    </div>
    <div class="docs-area">
      <aside class="estrutura"><h3>Partes</h3><ol class="partes"></ol><h3>Personagens</h3><div class="pers"></div></aside>
      <div class="mesa"><div class="pagina"><div class="folha"></div></div></div>
    </div></div>`;
  const cores = () => coresDoRoteiro();
  let t = 0;
  const E = S.ed = Editor.cria($('.folha', c), { texto: P.roteiro || '', somenteLer: !ed,
    cor: n => cores().get(Roteiro.chave(n)) || corOuPadrao(n, Roteiro.personagens(P.partes).length),
    aoMudar: tx => { P.roteiro = tx; marcaSujo(); clearTimeout(t); t = setTimeout(() => { const antes = [...cores().keys()].join(); P.partes = Roteiro.separa(P.roteiro, P.partes); lado(); if ([...cores().keys()].join() !== antes) E.repinta(); }, 200); } });
  if (!P.roteiro && ed) E.el.dataset.vazio = 'Comece aqui. Ex.: "## Episódio 1 parte 1" e depois "Problems: Oi, gente!"';
  const lado = () => {
    const ps = Roteiro.personagens(P.partes), cs = cores(), linhas = E.linhas(); let hi = 0;
    $('.partes', c).innerHTML = P.partes.map(p => { while (hi < linhas.length && !(linhas[hi].t === 'h' && Roteiro.chave(linhas[hi].nome) === Roteiro.chave(p.nome))) hi++; const l = hi < linhas.length ? hi++ : -1;
      return `<li><button data-linha="${l}"><b>${esc(p.nome)}</b><small>${p.falas.length} fala${p.falas.length === 1 ? '' : 's'}${p.falas.some(f => f.regravar) ? ' · <span class="aten">regravar</span>' : ''}</small></button></li>`; }).join('') || '<li class="dica">Escreva "## Nome da parte".</li>';
    $('.pers', c).innerHTML = ps.map(p => `<button class="pchip" data-pers="${esc(p.nome)}" title="Nova fala de ${esc(p.nome)}">${ava(p.nome, cs.get(p.chave), 'p')}<span>${esc(p.nome)}</span><small>${p.n}</small></button>`).join('') || '<p class="dica">Escreva <b>Nome: fala</b> e o personagem aparece aqui.</p>';
    $$('[data-linha]', c).forEach(b => b.onclick = () => { const l = +b.dataset.linha; if (l >= 0) E.irPara(l); });
    $$('[data-pers]', c).forEach(b => b.onclick = () => ed && E.novaLinha(b.dataset.pers + ': '));
    const lp = $('.lista-pers', c); if (lp) lp.innerHTML = ps.map(p => `<button data-np="${esc(p.nome)}">${ava(p.nome, cs.get(p.chave), 'p')} ${esc(p.nome)}</button>`).join('') + `<button data-np="">${ic('mais', 14)} Personagem novo…</button>`;
  };
  lado();
  $('[data-desf]', c)?.addEventListener('click', () => E.desfaz()); $('[data-ref]', c)?.addEventListener('click', () => E.refaz());
  $('[data-parte]', c)?.addEventListener('click', () => E.novaLinha(`## ${Roteiro.norm(P.nome)} parte ${P.partes.filter(p => p.falas.length || /parte/i.test(p.nome)).length + 1}`, { espaco: true }));
  $('[data-acao]', c)?.addEventListener('mousedown', e => e.preventDefault()); $('[data-acao]', c)?.addEventListener('click', () => E.italico());
  const fd = $('[data-falade]', c), lp = $('.lista-pers', c);
  fd?.addEventListener('mousedown', e => e.preventDefault()); lp?.addEventListener('mousedown', e => e.preventDefault());
  fd?.addEventListener('click', () => { lp.hidden = !lp.hidden; });
  lp?.addEventListener('click', async e => { const b = e.target.closest('[data-np]'); if (!b) return; lp.hidden = true; let n = b.dataset.np;
    if (!n) { n = await pedeTexto('Personagem novo', 'Nome do personagem (como vai aparecer no roteiro)'); if (!n) return; n = n.replace(/[:*#\[\]()]/g, '').trim().slice(0, 40); if (!n) return; }
    E.novaLinha(n + ': '); });
  addEventListener('mousedown', e => { if (lp && !lp.hidden && !e.target.closest('.falade')) lp.hidden = true; });
  $('[data-org]', c)?.addEventListener('click', e => Organizar.roda(e.currentTarget, E));
  $('[data-como]', c).onclick = () => { const m = h(`<div class="modal"><div class="caixa larga">${COMO}<div class="bts"><button class="bt pri">Entendi</button></div></div></div>`); $('button', m).onclick = () => m.remove(); m.onclick = e => { if (e.target === m) m.remove(); }; document.body.appendChild(m); };
  if (ed && !P.roteiro) setTimeout(() => E.foca(), 50);
}
function pedeTexto(titulo, rotulo) {
  return new Promise(ok => { const m = h(`<div class="modal"><div class="caixa"><b>${esc(titulo)}</b><label>${esc(rotulo)}<input maxlength="40"></label><div class="bts"><button class="bt" data-c>Cancelar</button><button class="bt pri" data-s>OK</button></div></div></div>`);
    const i = $('input', m), fim = v => { m.remove(); ok(v); }; $('[data-c]', m).onclick = () => fim(null); $('[data-s]', m).onclick = () => fim(i.value.trim()); i.onkeydown = e => { if (e.key === 'Enter') fim(i.value.trim()); if (e.key === 'Escape') fim(null); };
    document.body.appendChild(m); i.focus(); });
}

/* ---------- Organizar: a nuvem arruma o texto em partes e falas ---------- */
const Organizar = {
  SIS: `Você arruma roteiros de vídeos de animação em português do Brasil. Receba o texto e devolva SÓ um JSON:
{"partes":[{"nome":"Episódio 1 parte 1","falas":[{"personagem":"Nome","texto":"o que ele fala","nota":"como falar ou o que ele faz (opcional, curta)"}]}]}
Regras: não invente falas nem mude o sentido; corrija só erros óbvios de digitação; nome do personagem escrito igual em todas as falas;
narração, ações e indicações de cena não viram fala (a não ser que exista um NARRADOR falando); trechos em itálico (*assim*) ou entre parênteses
dentro de uma fala são a nota (como falar), não o texto falado; separe em partes nomeadas seguindo o que o texto indica (episódio, parte, cena);
se o texto não indicar partes, use uma parte com o nome do roteiro.`,
  async roda(bt, E) {
    const P = S.P, txt = E.texto.trim(); if (!txt) return aviso('Escreva ou cole o roteiro primeiro.', 'info');
    const rot = bt.innerHTML; bt.disabled = true; bt.innerHTML = `<span class="gira"></span> Organizando…`;
    try {
      const r = await fetch(SRV + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', ...(await Nuvem.hd()) }, body: JSON.stringify({ system: [{ type: 'text', text: this.SIS }], messages: [{ role: 'user', content: `NOME DO ROTEIRO: ${P.nome}\n\nTEXTO:\n${txt.slice(0, 60000)}` }] }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error?.message || 'A nuvem não conseguiu organizar agora.'); }
      const saida = /event-stream/.test(r.headers.get('content-type') || '') ? await this.le(r) : ((await r.json()).content || []).map(x => x.text || '').join('');
      const m = saida.match(/\{[\s\S]*\}/); if (!m) throw new Error('Não deu para organizar este texto. Tente de novo.');
      const j = JSON.parse(m[0]); const partes = (j.partes || []).filter(p => p?.falas?.length).map(p => ({ nome: String(p.nome || P.nome).slice(0, 80), falas: p.falas.filter(f => f?.personagem && f?.texto).map(f => ({ personagem: String(f.personagem).slice(0, 40), texto: String(f.texto), nota: f.nota ? String(f.nota).slice(0, 80) : '' })) }));
      if (!partes.length) throw new Error('Não achei falas neste texto.');
      E.poe(Roteiro.escreve(partes)); P.roteiro = E.texto; P.partes = Roteiro.separa(P.roteiro, P.partes); marcaSujo(); pintaRoteiro($('.prep .corpo'));
      aviso('Roteiro organizado em ' + partes.length + ' parte' + (partes.length === 1 ? '' : 's') + '. Ctrl+Z desfaz.', 'ok');
    } catch (e) { aviso(e.message, 'erro'); }
    finally { if (bt.isConnected) { bt.disabled = false; bt.innerHTML = rot; } }
  },
  async le(r) {
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', txt = '';
    for (;;) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n\n')) >= 0) { const ev = buf.slice(0, i); buf = buf.slice(i + 2); const d = ev.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join(''); if (!d) continue;
        let o; try { o = JSON.parse(d); } catch { continue; } if (o.type === 'content_block_delta' && o.delta?.text) txt += o.delta.text; if (o.type === 'error') throw new Error(o.error?.message || 'A nuvem não conseguiu organizar agora.'); } }
    return txt;
  },
};

/* ---------- aba Falas e gravação ---------- */
const Falas = {
  quem: null, rec: null,
  async pinta(c) {
    const P = S.P, ps = Roteiro.personagens(P.partes), cs = coresDoRoteiro(); this.c = c;
    try { this.quem = this.quem ?? localStorage.getItem('ep-prep-quem') ?? ''; } catch { this.quem = this.quem || ''; }
    if (this.quem && !ps.some(p => p.chave === this.quem)) this.quem = '';
    const locais = await this.locais(); let num = 0;
    const visiveis = P.partes.map(p => ({ ...p, falas: p.falas.map(f => ({ f, n: ++num })).filter(({ f }) => !this.quem || Roteiro.chave(f.personagem) === this.quem) })).filter(p => p.falas.length);
    const total = P.partes.reduce((s, p) => s + p.falas.length, 0), feitas = P.partes.reduce((s, p) => s + p.falas.filter(f => f.audio).length, 0);
    c.innerHTML = `<div class="falas">
      <h3>Quem vai gravar?</h3>
      <div class="elenco-g">
        <button class="pcard ${!this.quem ? 'on' : ''}" data-grava=""><span class="ava g todos">${ic('pessoa', 20)}</span><b>Todos</b><small>${feitas} de ${total} gravadas</small><div class="barra"><i style="width:${total ? feitas / total * 100 : 0}%"></i></div></button>
        ${ps.map(p => `<button class="pcard ${this.quem === p.chave ? 'on' : ''}" data-grava="${esc(p.chave)}" style="--c:${cs.get(p.chave)}">${ava(p.nome, cs.get(p.chave), 'g')}<b>${esc(p.nome)}</b><small>${p.g} de ${p.n} gravada${p.n === 1 ? '' : 's'}</small><div class="barra"><i style="width:${p.n ? p.g / p.n * 100 : 0}%"></i></div></button>`).join('')}
      </div>
      <div class="env"></div>
      ${P.novo || S.sujo && !P.mod ? `<p class="aviso-linha">${ic('alerta', 15)} Mande o roteiro para a nuvem antes de enviar as gravações (elas ficam guardadas aqui enquanto isso).</p>` : ''}
      ${!ps.length ? '<div class="vazio">Ainda não há falas. Escreva o roteiro como <b>Nome: fala</b>.</div>' : ''}
      ${visiveis.map(p => `<div class="parte"><h3>${esc(p.nome)}</h3>${p.falas.map(({ f, n }) => this.linha(f, n, locais.get(f.id), cs)).join('')}</div>`).join('')}</div>`;
    $$('[data-grava]', c).forEach(b => b.onclick = () => { this.quem = b.dataset.grava; try { localStorage.setItem('ep-prep-quem', this.quem); } catch { } this.pinta(c); });
    $$('.fala', c).forEach(el => { const f = this.acha(el.dataset.f); if (!f) return;
      $('[data-gravar]', el)?.addEventListener('click', () => this.grava(f, el));
      $('[data-ouvir]', el)?.addEventListener('click', e => this.ouve(f, e.currentTarget));
      $('[data-tirar]', el)?.addEventListener('click', async () => { await DB.del('aud', P.id + '/' + f.id); this.pinta(c); }); });
    this.pintaEnvio(locais);
  },
  acha(id) { for (const p of S.P.partes) for (const f of p.falas) if (f.id === id) return f; return null; },
  async locais() { const m = new Map(); try { for (const [k, v] of await DB.todos('aud')) if (String(k).startsWith(S.P.id + '/')) m.set(String(k).slice(S.P.id.length + 1), v); } catch { } return m; },
  linha(f, n, local, cs) {
    const cor = cs.get(Roteiro.chave(f.personagem)), gravar = pode('gravar');
    const st = local ? `<span class="st aqui">${ic('alerta', 12)} gravada aqui · falta enviar · ${tempo(local.duracao)}</span>` : f.audio ? `<span class="st nuvem">${f.regravar ? `<span class="aten">${ic('alerta', 12)} o texto mudou, regravar</span>` : `${ic('ok', 12)} na nuvem`} · ${tempo(f.duracao)}</span>` : '<span class="st sem">sem áudio</span>';
    return `<div class="fala ${local ? 'local' : f.audio ? 'tem' : ''}" data-f="${esc(f.id)}" style="--c:${cor}"><span class="num">${n}</span>
      <div class="quem">${ava(f.personagem, cor, 'p')}<b>${esc(f.personagem)}</b></div>
      <div class="txt">${f.nota ? `<em>${esc(f.nota)}</em>` : ''}<p>${esc(f.texto)}</p>${st}<div class="nivel" hidden><i></i></div></div>
      <div class="bts">${local || f.audio ? `<button class="redondo ouvir" data-ouvir title="Ouvir">${ic('play', 16)}</button>` : ''}
      ${gravar ? `<button class="redondo gravar ${local || f.audio ? 'de-novo' : ''}" data-gravar title="${local || f.audio ? 'Regravar' : 'Gravar'}">${ic('mic', 18)}</button>` : ''}
      ${local ? `<button class="redondo" data-tirar title="Jogar fora esta gravação">${ic('lixo', 15)}</button>` : ''}</div></div>`;
  },
  async grava(f, el) {
    if (this.rec) { const parar = this.rec.f === f; this.rec.parar(); if (parar) return; }
    let st; try { st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch { return aviso('Não consegui usar o microfone. Libere o microfone para este site no navegador.', 'erro'); }
    const tipo = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
    const mr = new MediaRecorder(st, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: PREP_CONFIG.audioBits }), pedacos = [], t0 = performance.now();
    const bt = $('[data-gravar]', el); bt.classList.add('gravando'); bt.innerHTML = ic('parar', 16); bt.title = 'Parar';
    el.classList.add('gravando'); const st0 = $('.st', el); if (st0) st0.innerHTML = '<span class="rec">● gravando <b class="cron">0:00</b></span>';
    // medidor do volume do microfone
    let ac, an, raf; const nv = $('.nivel', el), barra = $('i', nv); nv.hidden = false;
    try { ac = new AudioContext(); an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(st).connect(an); const d = new Uint8Array(an.fftSize);
      const mede = () => { an.getByteTimeDomainData(d); let s = 0; for (const v of d) s += (v - 128) ** 2; barra.style.width = Math.min(100, Math.sqrt(s / d.length) * 3.2) + '%'; raf = requestAnimationFrame(mede); }; mede(); } catch { }
    const cron = setInterval(() => { const s = (performance.now() - t0) / 1000; const cr = $('.cron', el); if (cr) cr.textContent = tempo(s); if (s > PREP_CONFIG.audioMaxSeg) this.rec?.parar(); }, 200);
    mr.ondataavailable = e => e.data.size && pedacos.push(e.data);
    mr.onstop = async () => { clearInterval(cron); cancelAnimationFrame(raf); try { ac?.close(); } catch { } st.getTracks().forEach(t => t.stop()); this.rec = null; const dur = (performance.now() - t0) / 1000;
      if (dur < 0.4) { aviso('Gravação curta demais.', 'info'); return this.pinta(this.c); }
      const blob = new Blob(pedacos, { type: mr.mimeType || tipo || 'audio/webm' });
      await DB.put('aud', S.P.id + '/' + f.id, { blob, duracao: Math.round(dur * 100) / 100, em: Date.now() }); this.pinta(this.c); };
    mr.start(250); this.rec = { f, parar: () => { try { mr.stop(); } catch { } } };
  },
  async ouve(f, bt) {
    if (S.tocando) { S.tocando.pause(); const era = S.tocando._f === f.id; S.tocando = null; $$('.tocando').forEach(x => x.classList.remove('tocando')); if (era) return; }
    try { const l = await DB.get('aud', S.P.id + '/' + f.id); const blob = l?.blob || await Nuvem.audio(f.audio);
      const a = new Audio(URL.createObjectURL(blob)); a._f = f.id; S.tocando = a; bt.classList.add('tocando'); bt.innerHTML = ic('parar', 16); a.onended = () => { bt.classList.remove('tocando'); bt.innerHTML = ic('play', 16); S.tocando = null; URL.revokeObjectURL(a.src); }; await a.play(); }
    catch (e) { aviso('Não consegui tocar: ' + (e.message || e), 'erro'); }
  },
  pintaEnvio(locais) {
    const box = $('.env', this.c); if (!box) return; const n = [...locais.keys()].filter(id => this.acha(id)).length;
    box.innerHTML = n && pode('gravar') ? `<div class="faixa-env">${ic('alerta', 16)}<span><b>${n} gravaç${n === 1 ? 'ão' : 'ões'}</b> esperando envio (estão só neste computador)</span><span class="esp"></span><button class="bt pri" data-envia>${ic('enviar', 15)} Enviar agora</button></div>` : '';
    const b = $('[data-envia]', box); if (b) b.onclick = () => this.envia(b, locais);
  },
  async envia(bt, locais) {
    const P = S.P; if (P.novo || !P.mod) return aviso('Mande o roteiro para a nuvem primeiro (botão "Mandar para a nuvem" lá em cima).', 'info');
    bt.disabled = true; const lista = [...locais.entries()].filter(([id]) => this.acha(id)); const feitas = [];
    try {
      for (const [i, [id, l]] of lista.entries()) { bt.textContent = `Enviando ${i + 1} de ${lista.length}…`;
        const ext = /mp4/.test(l.blob.type) ? 'm4a' : /ogg/.test(l.blob.type) ? 'ogg' : 'webm', k = `preparativos/${P.id}/aud/${id}-${Date.now().toString(36)}.${ext}`;
        await Nuvem.pede('/preparativos/arquivo?k=' + encodeURIComponent(k), { method: 'POST', headers: { 'content-type': l.blob.type || 'audio/webm' }, body: l.blob });
        feitas.push({ id, audio: k, duracao: l.duracao }); }
    } catch (e) { aviso(e.message, 'erro'); }
    if (feitas.length) { try { const r = await Nuvem.acao({ acao: 'falas', id: P.id, falas: feitas }); // uma gravação do prep.json para todas
        for (const x of feitas) { const f = this.acha(x.id); if (f) { f.audio = x.audio; f.duracao = x.duracao; delete f.regravar; } await DB.del('aud', P.id + '/' + x.id).catch(() => { }); }
        if (!S.sujo) { P.mod = r.mod || P.mod; S.base.mod = P.mod; } S.lista = null; aviso(`${feitas.length} gravaç${feitas.length === 1 ? 'ão enviada' : 'ões enviadas'}.`, 'ok'); pintaBarraPrep(); }
      catch (e) { aviso(e.message, 'erro'); } }
    this.pinta(this.c);
  },
};

/* ---------- aba Legendas ---------- */
const PALETA = ['#19f0f0', '#ffb04a', '#ff6b93', '#a796ff', '#4fe08f', '#ffd36b', '#7fd1ff', '#ff8f6b', '#ffffff', '#c9ff6b'];
function pintaLegendas(c) {
  const P = S.P, ps = Roteiro.personagens(P.partes), ed = pode('organizar'); P.legenda = P.legenda || { ativa: true, cores: {} };
  const cs = coresDoRoteiro(), escolha = Object.fromEntries(ps.map(p => [p.chave, cs.get(p.chave)]));
  const exemplo = k => P.partes.flatMap(x => x.falas).find(f => Roteiro.chave(f.personagem) === k)?.texto || 'Exemplo de legenda';
  let foco = ps[0]?.chave;
  c.innerHTML = `<div class="leg2">
    <div class="esq">
      <label class="chave"><input type="checkbox" ${P.legenda.ativa ? 'checked' : ''} ${ed ? '' : 'disabled'}><span class="trilho"><i></i></span> Legendas ligadas neste roteiro</label>
      <p class="dica">A cor vale pelo nome do personagem, sem diferenciar maiúscula e minúscula ("Problems" = "PROBLEMS"). As cores ficam salvas e voltam nos próximos roteiros.</p>
      <div class="lista">${ps.map(p => `<div class="lin" data-k="${esc(p.chave)}">${ava(p.nome, escolha[p.chave], 'p')}<b>${esc(p.nome)}</b>
        <div class="paleta">${PALETA.map(x => `<button class="cor ${x === escolha[p.chave] ? 'on' : ''}" style="--c:${x}" data-cor="${x}" ${ed ? '' : 'disabled'} title="${x}"></button>`).join('')}<input type="color" value="${escolha[p.chave]}" ${ed ? '' : 'disabled'} title="Outra cor"></div>
        ${S.cores?.[p.chave] ? '<small class="dica">cor salva</small>' : ''}</div>`).join('') || '<div class="vazio">Sem personagens ainda.</div>'}</div>
      ${ed && ps.length ? `<button class="bt pri" data-salva>${ic('ok', 15)} Salvar as cores</button>` : ''}
    </div>
    <div class="dir"><div class="tela-video"><div class="ceu"></div><div class="chao"></div><div class="leg-previa"></div></div><small class="dica">Prévia da legenda. Clique num personagem para ver a cor dele.</small></div></div>`;
  const liga = $('.chave input', c), previa = () => { const pv = $('.leg-previa', c); pv.hidden = !liga.checked; if (foco) { pv.style.color = escolha[foco]; pv.textContent = exemplo(foco); } };
  $$('.lin', c).forEach(l => { const k = l.dataset.k, troca = v => { escolha[k] = v; $$('.cor', l).forEach(b => b.classList.toggle('on', b.dataset.cor === v)); $('.ava', l).style.setProperty('--c', v); $('input[type=color]', l).value = v; foco = k; previa(); };
    l.onclick = e => { if (!e.target.closest('button,input')) { foco = k; previa(); } };
    $$('.cor', l).forEach(b => b.onclick = () => troca(b.dataset.cor)); $('input[type=color]', l).oninput = e => troca(e.target.value); });
  const salva = async () => { P.legenda = { ativa: liga.checked, cores: { ...escolha } };
    if (P.novo || S.sujo) { S.cores = { ...(S.cores || {}), ...P.legenda.cores }; marcaSujo(); return aviso('Vai junto quando mandar para a nuvem.', 'info'); }
    try { const r = await Nuvem.acao({ acao: 'legenda', id: P.id, ...P.legenda }); P.mod = r.mod || P.mod; S.base.mod = P.mod; S.cores = r.cores || { ...(S.cores || {}), ...P.legenda.cores }; aviso('Cores salvas.', 'ok'); pintaLegendas(c); } catch (e) { aviso(e.message, 'erro'); } };
  liga.onchange = () => { previa(); salva(); }; $('[data-salva]', c)?.addEventListener('click', salva);
  previa();
}

/* ---------- aba Cores das legendas (todas as que a equipe já usou) ---------- */
async function pintaCores() {
  const el = tela(); el.innerHTML = `<section class="inicio"><div class="cab"><h1>Cores das legendas</h1></div><p class="dica">Cada personagem tem uma cor, pelo nome (sem diferenciar maiúscula e minúscula). Os roteiros novos já começam com estas cores.</p><div class="leg"><div class="lista"><div class="vazio">Carregando…</div></div></div></section>`;
  try { S.cores = await Nuvem.cores() || {}; } catch (e) { $('.lista', el).innerHTML = `<div class="vazio erro">${esc(e.message)}</div>`; return; }
  const ed = pode('organizar'), lista = $('.lista', el), pintaL = () => {
    lista.innerHTML = Object.entries(S.cores).sort().map(([k, c]) => `<div class="lin"><input type="color" value="${esc(c)}" data-k="${esc(k)}" ${ed ? '' : 'disabled'}><b>${esc(k)}</b><span class="previa" style="color:${esc(c)}">Exemplo de legenda</span></div>`).join('') || '<div class="vazio">Nenhuma cor salva ainda.</div>';
    if (ed) lista.appendChild(h(`<div class="lin nova"><input type="color" value="#19f0f0"><input class="txt" placeholder="Nome do personagem" maxlength="40"><button class="bt pri">${ic('mais', 15)} Salvar</button></div>`));
    $$('input[type=color][data-k]', lista).forEach(i => i.onchange = () => manda({ [i.dataset.k]: i.value }));
    const nv = $('.nova', lista); if (nv) $('button', nv).onclick = () => { const n = Roteiro.chave($('.txt', nv).value); if (!n) return aviso('Escreva o nome do personagem.', 'info'); manda({ [n]: $('input[type=color]', nv).value }); };
  };
  const manda = async cores => { try { const r = await Nuvem.acao({ acao: 'cores', cores }); S.cores = r.cores || { ...S.cores, ...cores }; aviso('Cor salva.', 'ok'); pintaL(); } catch (e) { aviso(e.message, 'erro'); } };
  pintaL();
}

/* ---------- aba Ideias (mesmos dados das Ideias do Animador: /ideias → ideias/*.json) ---------- */
const Ideias = {
  S: null,
  async pinta(novo) {
    const el = tela(); el.innerHTML = `<section class="inicio"><div class="cab"><h1>Ideias</h1><span class="esp"></span>${pode('ideias') ? `<button class="bt" data-an title="Pede de novo a análise dos canais de referência">${ic('atualizar')} Atualizar análise</button><button class="bt pri" data-nova>${ic('mais')} Nova ideia</button>` : ''}</div>
      <p class="dica analise"></p><div class="ids grade"><div class="vazio">Carregando…</div></div></section>`;
    try { if (!this.S || novo) this.S = await Nuvem.pede('/ideias'); } catch (e) { $('.ids', el).innerHTML = `<div class="vazio erro">${esc(e.message)}</div>`; return; }
    const A = this.S.analise, I = this.S.ideias || { lista: [] };
    $('.analise', el).textContent = A ? `Análise dos canais de ${quando(A.em)}${this.S.canais?.length ? ' · ' + this.S.canais.join(', ') : ''}${I.padroes?.length ? ' — ' + I.padroes.slice(0, 3).join(' · ') : ''}` : 'Ainda não há análise dos canais.';
    $('[data-an]', el)?.addEventListener('click', async e => { e.currentTarget.disabled = true; try { const r = await Nuvem.json('/ideias', 'POST', { acao: 'atualizar', canais: this.S.canais || [] }); aviso(r.ja ? 'A análise já foi pedida há pouco.' : 'Análise pedida. Ela chega em alguns minutos.', 'ok'); } catch (er) { aviso(er.message, 'erro'); } });
    $('[data-nova]', el)?.addEventListener('click', () => this.edita(null));
    const g = $('.ids', el); g.innerHTML = I.lista?.length ? '' : '<div class="vazio">Nenhuma ideia ainda.</div>';
    for (const x of I.lista || []) {
      const c = h(`<div class="cartao ideia"><span class="st">${x.formato === 'longo' ? 'Vídeo longo' : 'Short'}</span><b>${esc(x.titulo)}</b>${x.gancho ? `<small class="gancho">“${esc(x.gancho)}”</small>` : ''}<small>${esc(x.resumo || '')}</small>
        <div class="bts">${pode('roteiro') ? `<button class="bt pri" data-rot>${ic('doc', 14)} Virar roteiro</button>` : ''}${pode('ideias') ? `<button class="bt" data-ed>Editar</button><button class="bt ic" data-del title="Tirar esta ideia">${ic('lixo', 14)}</button>` : ''}</div></div>`);
      $('[data-rot]', c)?.addEventListener('click', () => { const t = `// Ideia: ${x.titulo}${x.resumo ? '\n// ' + x.resumo : ''}${x.gancho ? '\n// Gancho: ' + x.gancho : ''}\n\n## ${x.titulo} parte 1\n`; S.aba = 'roteiros'; $$('[data-aba]').forEach(b => b.classList.toggle('on', b.dataset.aba === 'roteiros')); abrePrep(novoPrep(String(x.titulo).slice(0, 80), t)); });
      $('[data-ed]', c)?.addEventListener('click', () => this.edita(x));
      $('[data-del]', c)?.addEventListener('click', async () => { if (!await pergunta('Tirar esta ideia?', x.titulo, [['Cancelar', false], ['Tirar', true, 'perigo']])) return; I.lista = I.lista.filter(y => y !== x); this.guarda(I); });
      g.appendChild(c);
    }
  },
  edita(x) {
    const el = h(`<div class="modal"><div class="caixa larga"><b>${x ? 'Editar ideia' : 'Nova ideia'}</b>
      <label>Título<input data-t maxlength="140" value="${esc(x?.titulo || '')}"></label>
      <label>Formato<select data-f><option value="short">Short</option><option value="longo" ${x?.formato === 'longo' ? 'selected' : ''}>Vídeo longo</option></select></label>
      <label>Gancho (primeira fala ou imagem)<input data-g maxlength="240" value="${esc(x?.gancho || '')}"></label>
      <label>Resumo<textarea data-r rows="4" maxlength="800">${esc(x?.resumo || '')}</textarea></label>
      <div class="bts"><button class="bt" data-c>Cancelar</button><button class="bt pri" data-s>Salvar</button></div></div></div>`);
    document.body.appendChild(el); $('[data-t]', el).focus(); $('[data-c]', el).onclick = () => el.remove();
    $('[data-s]', el).onclick = () => { const t = $('[data-t]', el).value.trim(); if (!t) return aviso('Escreva o título.', 'info');
      const I = this.S.ideias || (this.S.ideias = { lista: [] }); I.lista = I.lista || [];
      const o = { formato: $('[data-f]', el).value, titulo: t, gancho: $('[data-g]', el).value.trim(), resumo: $('[data-r]', el).value.trim() };
      if (x) Object.assign(x, o); else I.lista.unshift({ id: 'ide' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...o, porque: '', personagens: [] });
      el.remove(); this.guarda(I); };
  },
  async guarda(I) { I.em = new Date().toISOString(); try { await Nuvem.json('/ideias', 'PUT', { ideias: I }); aviso('Ideias salvas.', 'ok'); } catch (e) { aviso(e.message, 'erro'); } this.pinta(); },
};

/* ======================= começo ======================= */
$$('[data-aba]').forEach(b => b.onclick = async () => { if (S.P && !await sairDoPrep()) return; trocaAba(b.dataset.aba); });
addEventListener('beforeunload', e => { if (S.sujo) { e.preventDefault(); e.returnValue = ''; } });
addEventListener('DOMContentLoaded', () => window.EstudioConta?.espaco?.registrar?.({
  programa: 'Preparativos',
  async listar() { const out = [];
    try { for (const [k, v] of await DB.todos('rasc')) out.push({ nome: v.P?.nome || k, bytes: JSON.stringify(v).length, data: v.em, info: 'rascunho do roteiro', rotuloBaixar: 'Baixar .preparativos', baixar: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(v.P, null, 1)], { type: 'application/json' })); a.download = (v.P?.nome || 'roteiro').replace(/[^\w\- ]+/g, '_') + '.preparativos'; a.click(); }, apagar: () => DB.del('rasc', k) });
      for (const [k, v] of await DB.todos('aud')) out.push({ nome: 'Gravação ' + k.split('/')[1], bytes: v.blob?.size || 0, data: v.em, info: 'falta enviar', rotuloBaixar: 'Baixar áudio', baixar: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(v.blob); a.download = k.replace('/', '_') + '.webm'; a.click(); }, apagar: () => DB.del('aud', k) }); } catch { }
    return out; },
}));
(async () => {
  try { S.eu = await window.EstudioLogin?.pronto; } catch { }
  // níveis de acesso: o /estudio-conta.js (defer) cria o EstudioPerm depois deste arquivo; espera ele antes de desenhar os botões
  if (document.readyState === 'loading') await new Promise(r => addEventListener('DOMContentLoaded', r, { once: true }));
  try { await window.EstudioPerm?.pronto; } catch { }
  const q = new URLSearchParams(location.search), id = q.get('id'), aba = q.get('aba');
  if (aba === 'ideias' || aba === 'cores') return trocaAba(aba);
  if (id && /^[A-Za-z0-9_-]{2,40}$/.test(id)) { try { return abrePrep(await Nuvem.abre(id)); } catch { const r = await DB.get('rasc', id).catch(() => null); if (r?.P) return abrePrep(r.P, r.base); } }
  pintaInicio();
})();
