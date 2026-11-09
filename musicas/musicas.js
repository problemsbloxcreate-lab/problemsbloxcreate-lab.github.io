/* MÚSICAS: o álbum de sons da equipe. Sons novos vêm das rotas /musicas do turma-ia; os antigos, do índice da biblioteca (só leitura, pelo /nuvem/ do porteiro).
   Limites e confirmações são conferidos no servidor. Cada tela só aparece inteira, depois de tudo pronto. */
'use strict';
const SERVIDOR = 'https://turma-ia.problemsraiz.workers.dev';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sem = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const S = { itens: [], ocultos: new Set(), adm: false, esp: null, lim: null, cota: null, atual: [], filtro: '', ordem: 'nome', mostrando: 0, tocando: null, ocupado: false };
const blobs = new Map(), MB = 1048576;
const quando = t => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const tam = b => b >= 1e9 ? (b / 1073741824).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' GB' : b >= MB / 10 ? (b / MB).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB' : Math.round((b || 0) / 1024) + ' KB';
const num = n => Number(n || 0).toLocaleString('pt-BR');
const tk = () => window.EstudioLogin.token();
async function api(rota, corpo) {
  const r = await fetch(SERVIDOR + '/musicas' + rota, { method: corpo ? 'POST' : 'GET', headers: { authorization: await tk(), ...(corpo ? { 'content-type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error?.message || `O servidor respondeu ${r.status}. Tente de novo.`); e.status = r.status; e.type = j.error?.type; throw e; }
  return j;
}
function aviso(t, erro) { const d = document.createElement('div'); d.textContent = t; if (erro) d.className = 'erro'; $('#avisos').appendChild(d); setTimeout(() => d.remove(), erro ? 8000 : 3500); }
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = { play: svg('<path d="M7 4v16l13-8z" fill="currentColor"/>'), pausa: svg('<path d="M7 4h4v16H7zM14 4h4v16h-4z" fill="currentColor"/>'), nota: svg('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'), onda: svg('<path d="M3 12h2l2-6 3 14 4-18 3 14 2-4h2"/>'), lixo: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'), volta: svg('<path d="M4 9h11a5 5 0 0 1 0 10H9"/><path d="M8 5 4 9l4 4"/>'), mais: svg('<path d="M12 5v14M5 12h14"/>'), pasta: svg('<path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'), jogo: svg('<rect x="2" y="7" width="20" height="11"/><path d="M7 11v3M5.5 12.5h3M15 12h.01M18 14h.01"/>'), risada: svg('<circle cx="12" cy="12" r="9"/><path d="M8 10h.01M16 10h.01M8 14a4 4 0 0 0 8 0z"/>'), bloco: svg('<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>'), vento: svg('<path d="M3 8h11a3 3 0 1 0-3-3M3 13h16a3 3 0 1 1-3 3M3 18h7"/>'), disco: svg('<rect x="3" y="4" width="18" height="16"/><path d="M3 15h18"/>') };
const CATS = { bgm: ['Músicas (BGM)', '#603cba', 'nota'], sfx: ['Efeitos (SFX)', '#da532c', 'onda'], mem: ['Memes', '#b91d47', 'risada'], jogo: ['Sons de jogos', '#00858a', 'jogo'], mc: ['Minecraft', '#1e7145', 'bloco'], amb: ['Ambientes', '#2b5797', 'vento'], out: ['Outros', '#b5820f', 'pasta'] };
const CORES = ['#2d89ef', '#603cba', '#00858a', '#da532c', '#1e7145', '#b91d47', '#b5820f', '#9f00a7', '#2b5797'];
const corPasta = n => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CORES[h % CORES.length]; };
const nomePasta = p => p === '(sem pasta)' ? 'Soltos' : p;
const catAntigo = (p, mus) => mus || /^M[UÚ]SICA/i.test(p) ? 'bgm' : /^JOGO/.test(p) ? 'jogo' : /MEME|PLATEIA|Risadas/i.test(p) ? 'mem' : /AMBIENCE/i.test(p) ? 'amb' : 'sfx';
const novoItem = s => ({ k: 'n:' + s.id, id: s.id, nome: s.nome, cat: s.cat, pasta: s.pasta || 'Enviados pela equipe', novo: true, tam: s.tam, sha: s.sha, tipo: s.tipo, por: s.por, em: s.em, origem: s.origem, busca: sem(s.nome + ' ' + (s.pasta || '') + ' ' + (s.por || '')) });

/* ---------- abrir ---------- */
async function carrega() {
  const [j, ix] = await Promise.all([api('/'), fetch('/nuvem/bib/arq?p=indice.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)]);
  S.adm = j.adm; S.esp = j.espaco; S.lim = j.lim; S.cota = j.cota; S.ocultos = new Set(j.ocultos); S.semAntigos = !ix;
  const velhos = ix ? [...(ix.pk?.ev || []).map(e => ({ k: 'pk:' + e[0], rel: 'pk:' + e[0], chave: 'pk:' + e[0], nome: e[1], pasta: e[2], cat: catAntigo(e[2], e[3]), busca: sem(e[1] + ' ' + e[2]) })),
    ...(ix.mc?.ev || []).filter(e => e[3]?.length).map(e => ({ k: 'mc:' + e[0], rel: 'mc:' + e[0], chave: 'mc:' + e[3][0][0], nome: e[1], pasta: 'Minecraft · ' + e[2], cat: 'mc', busca: sem(e[1] + ' ' + e[0] + ' minecraft ' + e[2]) }))] : [];
  S.itens = [...j.sons.map(novoItem), ...velhos];
}
const visiveis = () => S.itens.filter(i => !i.rel || !S.ocultos.has(i.rel));
const parametros = () => new URLSearchParams(location.search);
function vai(q) { history.pushState(null, '', q ? '?' + q : './'); pinta(); }
const ABAS = () => [['inicio', 'Início'], ['espaco', 'Espaço'], ...(S.adm ? [['lixeira', 'Lixeira'], ['registro', 'Registro']] : [])];
function pintaAbas(a) { $('#abas').innerHTML = ABAS().map(([id, n]) => `<button data-aba="${id}" class="${a === id ? 'on' : ''}">${n}</button>`).join('') + '<button data-enviar>Enviar sons</button>'; }
async function pinta() {
  const p = parametros(), aba = p.get('aba') || 'inicio', tela = $('#tela'); pintaAbas(['cat', 'busca', 'pasta'].includes(aba) ? 'inicio' : aba);
  try {
    if (aba === 'espaco') return telaEspaco(tela);
    if (aba === 'lixeira') return await telaLixeira(tela);
    if (aba === 'registro') return await telaRegistro(tela);
    if (aba === 'busca') return telaBusca(tela, p.get('q') || '');
    if (aba === 'cat') return telaCat(tela, p.get('c'));
    if (aba === 'pasta') return telaPasta(tela, p.get('c'), p.get('p'));
    telaInicio(tela);
  } catch (e) { tela.innerHTML = `<h1 class="titulo">Não consegui abrir</h1><p class="sub">${esc(e.message)}</p>`; }
}
function telaInicio(t) {
  const v = visiveis(), n = {}; for (const i of v) n[i.cat] = (n[i.cat] || 0) + 1; const novos = v.filter(i => i.novo).slice(0, 24);
  t.innerHTML = `<h1 class="titulo">Músicas</h1><p class="sub">${num(v.length)} sons da equipe, separados por tipo. ${S.semAntigos ? '<b>Os sons antigos não abriram agora; tente de novo daqui a pouco.</b>' : ''}</p>
  <div class="tiles">${Object.entries(CATS).filter(([id]) => n[id]).map(([id, [nome, cor, ic]]) => `<button class="tile larga" style="--c:${cor}" data-cat="${id}">${IC[ic]}<span class="nome">${nome}</span><span class="n">${num(n[id])}</span></button>`).join('')}
  <button class="tile larga" style="--c:#2d89ef" data-enviar>${IC.mais}<span class="nome">Enviar sons</span></button><button class="tile larga" style="--c:#3b5478" data-aba="espaco">${IC.disco}<span class="nome">Espaço</span><span class="n">${tam(S.esp.novos.b + S.esp.copia.b)}</span></button></div>
  <h2 class="grupo">Enviados há pouco</h2>${novos.length ? `<div class="lista" id="l">${novos.map((x, i) => linha(x, i)).join('')}</div>` : '<div class="vazio">Ainda ninguém enviou um som novo.</div>'}`;
  S.atual = novos; S.mostrando = novos.length;
}
function trilha(c, p) { return `<div class="trilha"><a data-aba="inicio">Início</a>${c ? ` › <a data-cat="${esc(c)}">${esc(CATS[c]?.[0] || c)}</a>` : ''}${p ? ` › ${esc(nomePasta(p))}` : ''}</div>`; }
function telaCat(t, c) {
  const dentro = visiveis().filter(i => i.cat === c), pastas = new Map(); for (const i of dentro) pastas.set(i.pasta, (pastas.get(i.pasta) || 0) + 1);
  if (pastas.size <= 1) return lista(t, trilha(c), CATS[c]?.[0] || 'Sons', dentro);
  const ord = [...pastas].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true }));
  t.innerHTML = `${trilha(c)}<h1 class="titulo">${esc(CATS[c]?.[0] || c)}</h1><p class="sub">${num(dentro.length)} sons em ${num(pastas.size)} pastas.</p><div class="tiles">${ord.map(([p, n]) => `<button class="tile" style="--c:${corPasta(p)}" data-pasta="${esc(p)}" data-c="${esc(c)}">${IC.pasta}<span class="nome">${esc(nomePasta(p).replace(/^(M[UÚ]SICA|JOGO|Minecraft) · /, ''))}</span><span class="n">${num(n)}</span></button>`).join('')}</div>`;
}
function telaPasta(t, c, p) { lista(t, trilha(c, p), nomePasta(p), visiveis().filter(i => i.cat === c && i.pasta === p)); }
function telaBusca(t, q) { const ps = sem(q).trim().split(/\s+/).filter(Boolean), a = visiveis().filter(i => ps.every(x => i.busca.includes(x))); lista(t, trilha(), `Busca: ${q}`, a, true); }
function linha(x, i, lixo) { const cor = CATS[x.cat]?.[1] || '#2b5797', extra = lixo ? `Por ${x.quem || ''} · ${x.quando ? quando(x.quando) : ''}` : x.novo ? `${x.por ? 'Enviado por ' + x.por : ''}${x.origem && x.origem !== 'musicas' ? ' pelo ' + x.origem : ''}${x.tam ? ' · ' + tam(x.tam) : ''}` : nomePasta(x.pasta);
  return `<div class="som" style="--c:${cor}" data-i="${i}"><button class="play" data-play="${i}" title="Ouvir" aria-label="Ouvir ${esc(x.nome)}">${S.tocando === x.k ? IC.pausa : IC.play}</button><div class="tx"><b title="${esc(x.nome)}">${esc(x.nome)}</b><small>${esc(extra)}</small></div>${lixo ? `<div class="ac"><button class="volta" data-volta="${i}" title="Restaurar" aria-label="Restaurar ${esc(x.nome)}">${IC.volta}</button></div>` : S.adm ? `<div class="ac"><button data-apaga="${i}" title="Mandar para a lixeira" aria-label="Mandar ${esc(x.nome)} para a lixeira">${IC.lixo}</button></div>` : ''}</div>`; }
const PAG = 120;
function lista(t, top, titulo, itens, busca) {
  const cats = [...new Set(itens.map(i => i.cat))];
  const aplica = () => { const f = S.filtro && cats.includes(S.filtro) ? itens.filter(i => i.cat === S.filtro) : itens; return [...f].sort(S.ordem === 'novos' ? (a, b) => (b.em || 0) - (a.em || 0) || a.nome.localeCompare(b.nome, 'pt-BR') : (a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })); };
  const desenha = () => { S.atual = aplica(); S.mostrando = Math.min(PAG, S.atual.length);
    t.innerHTML = `${top}<h1 class="titulo">${esc(titulo)}</h1><p class="sub"></p><div class="filtros">${busca && cats.length > 1 ? `<button data-f="" class="${!S.filtro ? 'on' : ''}">Todos</button>${cats.map(c => `<button data-f="${c}" class="${S.filtro === c ? 'on' : ''}">${esc(CATS[c]?.[0] || c)}</button>`).join('')}` : ''}<button data-o="nome" class="${S.ordem === 'nome' ? 'on' : ''}">Por nome</button><button data-o="novos" class="${S.ordem === 'novos' ? 'on' : ''}">Mais novos</button><span class="conta">${num(S.atual.length)} sons</span></div>
    ${S.atual.length ? `<div class="lista" id="l">${S.atual.slice(0, S.mostrando).map((x, i) => linha(x, i)).join('')}</div>${S.atual.length > S.mostrando ? '<button class="bt mais" id="mais">Mostrar mais</button>' : ''}` : '<div class="vazio">Nada por aqui.</div>'}`;
    $$('[data-f]', t).forEach(b => b.onclick = () => { S.filtro = b.dataset.f; desenha(); }); $$('[data-o]', t).forEach(b => b.onclick = () => { S.ordem = b.dataset.o; desenha(); });
    const m = $('#mais', t); if (m) m.onclick = () => { const a = S.mostrando; S.mostrando = Math.min(a + PAG, S.atual.length); $('#l', t).insertAdjacentHTML('beforeend', S.atual.slice(a, S.mostrando).map((x, i) => linha(x, a + i)).join('')); if (S.mostrando >= S.atual.length) m.remove(); }; };
  desenha();
}
function telaEspaco(t) {
  const e = S.esp, L = S.lim, C = S.cota, novos = Math.max(0, e.novos.b - e.lixo.b), resto = Math.max(0, e.nuvem - e.novos.b - e.copia.b), livre = Math.max(0, e.limite - e.nuvem), pct = b => (b / e.limite * 100).toFixed(2) + '%';
  const partes = [['Sons enviados', novos, '#00858a', `${num(e.novos.n - e.lixo.n)} sons`], ['Cópia dos sons antigos', e.copia.b, '#603cba', `${num(e.copia.n)} arquivos`], ['Na lixeira', e.lixo.b, '#b91d47', `${num(e.lixo.n)} sons · ${num(e.ocultos)} antigos escondidos`], ['Resto da nuvem', resto, '#2d89ef', 'Animações, roteiros, Cérebro e o resto']];
  t.innerHTML = `<h1 class="titulo">Espaço</h1><p class="sub">Quanto as Músicas ocupam e quanto o resto da nuvem ocupa, de ${tam(e.limite)}.</p>
  <div class="medidor" role="img" aria-label="${tam(e.nuvem)} usados de ${tam(e.limite)}">${partes.map(p => `<i class="${p[1] ? 'pre' : ''}" title="${p[0]}: ${tam(p[1])}" style="background:${p[2]};width:${pct(p[1])}"></i>`).join('')}</div>
  <div class="legenda">${partes.map(p => `<div class="leg" style="--c:${p[2]}"><b>${tam(p[1])}</b><span>${p[0]}</span><small>${p[3]}</small></div>`).join('')}<div class="leg" style="--c:#3b5478"><b>${tam(livre)}</b><span>Livre</span><small>${Math.round(e.nuvem / e.limite * 100)}% da nuvem em uso</small></div></div>
  <h2 class="grupo">Limites de envio</h2><div class="limites">
  <div class="lim"><span>Seus envios nos últimos 10 minutos</span><b>${C.p10} de ${L.p10N}</b></div><div class="lim"><span>Seus envios hoje</span><b>${C.dia} de ${L.pDiaN}</b></div><div class="lim"><span>Seu tamanho enviado hoje</span><b>${tam(C.diaB)} de ${tam(L.pDiaB)}</b></div>
  <div class="lim"><span>Envios da equipe hoje</span><b>${C.todos} de ${L.tDiaN}</b></div><div class="lim"><span>Tamanho enviado pela equipe hoje</span><b>${tam(C.todosB)} de ${tam(L.tDiaB)}</b></div><div class="lim"><span>Tamanho máximo de cada arquivo</span><b>${tam(L.arq)}</b></div></div>`;
}
async function telaLixeira(t) { const j = await api('/lixeira'), it = [...j.sons.map(s => ({ ...novoItem(s), quem: s.apagado_por, quando: s.apagado_em })), ...j.ocultos.map(o => ({ k: o.rel, rel: o.rel, chave: null, nome: o.nome, cat: o.rel.startsWith('mc:') ? 'mc' : 'sfx', pasta: 'Biblioteca antiga', quem: o.por, quando: o.em }))]; S.atual = it; S.mostrando = it.length;
  t.innerHTML = `<h1 class="titulo">Lixeira</h1><p class="sub">Nada daqui foi apagado de verdade. Os sons antigos só saíram do álbum: os projetos continuam com eles.</p>${it.length ? `<div class="lista">${it.map((x, i) => linha(x, i, true)).join('')}</div>` : '<div class="vazio">A lixeira está vazia.</div>'}`; }
const ACAO = { enviou: ['Enviou', '#00858a'], apagou: ['Mandou para a lixeira', '#b91d47'], restaurou: ['Restaurou', '#00a300'] };
async function telaRegistro(t) { const j = await api('/registro'); t.innerHTML = `<h1 class="titulo">Registro</h1><p class="sub">Quem enviou, apagou e restaurou (os 100 mais recentes).</p>${j.itens.map(x => `<div class="reg" style="--c:${ACAO[x.acao]?.[1] || '#3b5478'}"><b>${esc(ACAO[x.acao]?.[0] || x.acao)}: ${esc(x.nome)}</b><small>${esc(x.por)} (código ${esc(x.por_id)}) · ${esc(quando(x.em))}${x.motivo ? ' · Motivo: ' + esc(x.motivo) : ''}</small></div>`).join('') || '<div class="vazio">Nada ainda.</div>'}`; }

/* ---------- ouvir ---------- */
const audio = $('#audio');
const hx = async c => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(c)))].map(x => x.toString(16).padStart(2, '0')).join('');
async function blobDe(x) { if (blobs.has(x.k)) return blobs.get(x.k); let b;
  if (x.sha) { const r = await fetch(SERVIDOR + '/musicas/ouvir?sha=' + x.sha, { headers: { authorization: await tk() } }); if (!r.ok) throw new Error('o som não veio (' + r.status + ')'); b = await r.blob(); }
  else { if (!x.chave) throw new Error('restaure o som para ouvir'); const r = await fetch('/nuvem/bib/arq?p=a/' + await hx(x.chave)); if (!r.ok) throw new Error('o som não veio (' + r.status + ')'); const c = await r.blob(), e = (x.chave.split('.').pop() || '').toLowerCase(); b = new Blob([c], { type: x.chave.startsWith('mc:') || /^(ogg|opus)$/.test(e) ? 'audio/ogg' : e === 'wav' ? 'audio/wav' : e === 'mp3' ? 'audio/mpeg' : c.type }); }
  if (blobs.size > 40) blobs.delete(blobs.keys().next().value); blobs.set(x.k, b); return b; }
let urlAtual = null;
const marca = () => $$('.som').forEach(e => { const x = S.atual[+e.dataset.i], on = x && S.tocando === x.k; e.classList.toggle('tocando', !!on); const b = $('.play', e); if (b) b.innerHTML = on && !audio.paused ? IC.pausa : IC.play; });
async function ouve(x) {
  if (S.tocando === x.k && urlAtual) { audio.paused ? audio.play() : audio.pause(); return; }
  S.tocando = x.k; urlAtual = null; $('#t-nome').textContent = x.nome; $('#t-pasta').textContent = 'Carregando…'; $('#toca').hidden = false; audio.pause(); marca();
  try { const b = await blobDe(x); if (S.tocando !== x.k) return; urlAtual = URL.createObjectURL(b); audio.src = urlAtual; audio.volume = +$('#t-vol').value / 100; await audio.play(); $('#t-pasta').textContent = nomePasta(x.pasta); }
  catch (e) { if (S.tocando === x.k) { S.tocando = null; urlAtual = null; $('#t-pasta').textContent = ''; marca(); } aviso('Não deu para ouvir: ' + (e.message || e), 1); }
}
const mmss = s => isFinite(s) ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : '0:00';
audio.ontimeupdate = () => { $('#t-pos').value = audio.duration ? audio.currentTime / audio.duration * 1000 : 0; $('#t-tempo').textContent = mmss(audio.currentTime) + ' / ' + mmss(audio.duration); };
audio.onplay = audio.onpause = () => { $('#t-play').innerHTML = audio.paused ? IC.play : IC.pausa; marca(); }; audio.onended = () => { audio.currentTime = 0; marca(); };
$('#t-play').innerHTML = IC.play; $('#t-play').onclick = () => { if (urlAtual) audio.paused ? audio.play() : audio.pause(); };
$('#t-pos').oninput = e => { if (audio.duration) audio.currentTime = e.target.value / 1000 * audio.duration; }; $('#t-vol').oninput = e => { audio.volume = e.target.value / 100; };

/* ---------- janelas laterais ---------- */
function abreLado(html) { const l = $('#lado'); l.classList.remove('sai'); l.innerHTML = `<div class="cx" role="dialog" aria-modal="true">${html}</div>`; l.hidden = false; return $('.cx', l); }
function fechaLado() { const l = $('#lado'); if (l.hidden) return; l.classList.add('sai'); setTimeout(() => { l.hidden = true; l.innerHTML = ''; l.classList.remove('sai'); }, 220); }
$('#lado').addEventListener('mousedown', e => { if (e.target.id === 'lado' && !S.ocupado) fechaLado(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !S.ocupado) fechaLado(); });
const OPC = [['sfx', 'Efeito (SFX)'], ['bgm', 'Música (BGM)'], ['mem', 'Meme'], ['amb', 'Ambiente'], ['out', 'Outro']];
function painelEnviar() { const L = S.lim;
  const c = abreLado(`<h2>Enviar sons</h2><p>Até ${tam(L.arq)} por arquivo. MP3, WAV, OGG, OPUS, FLAC, M4A, AAC ou WEBM.</p><label>Tipo<select id="e-cat">${OPC.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select></label><label>Pasta (opcional)<input type="text" id="e-pasta" maxlength="60" placeholder="Ex.: Vinhetas"></label><div class="solta" id="e-solta">Solte os arquivos aqui ou clique para escolher</div><div class="fila" id="e-fila"></div><h3>Seus limites</h3><p>${L.p10N} envios a cada 10 minutos, ${L.pDiaN} por dia e ${tam(L.pDiaB)} por dia. Hoje você já enviou <b>${S.cota.dia}</b>.</p><div class="pes"><button class="bt" id="e-fecha">Fechar</button></div>`);
  $('#e-fecha', c).onclick = () => { if (!S.ocupado) fechaLado(); }; const z = $('#e-solta', c); z.onclick = () => $('#arquivos').click();
  z.ondragover = e => { e.preventDefault(); z.classList.add('em'); }; z.ondragleave = () => z.classList.remove('em'); z.ondrop = e => { e.preventDefault(); z.classList.remove('em'); manda([...e.dataTransfer.files]); }; }
$('#arquivos').onchange = e => { manda([...e.target.files]); e.target.value = ''; };
const duracao = f => new Promise(res => { const a = new Audio(), u = URL.createObjectURL(f); let feito = false; const fim = v => { if (feito) return; feito = true; URL.revokeObjectURL(u); res(v); }; a.preload = 'metadata'; a.onloadedmetadata = () => fim(isFinite(a.duration) ? a.duration : 0); a.onerror = () => fim(0); setTimeout(() => fim(0), 3000); a.src = u; });
async function manda(fs) { if (!fs.length || S.ocupado) return; S.ocupado = true; const fila = $('#e-fila'), cat = $('#e-cat')?.value || 'sfx', pasta = $('#e-pasta')?.value || ''; let parou = false, feitos = 0;
  fila.innerHTML = fs.map(f => `<div><span>${esc(f.name)}</span><span class="st">Esperando</span></div>`).join(''); const st = [...fila.children].map(d => $('.st', d));
  for (let i = 0; i < fs.length; i++) { const f = fs[i], s = st[i]; if (parou) { s.textContent = 'Não enviado'; continue; } s.textContent = 'Enviando…'; try {
      const dur = await duracao(f), qs = new URLSearchParams({ nome: f.name.replace(/\.[^.]+$/, ''), cat, pasta, origem: 'musicas', dur: String(dur) }), r = await fetch(SERVIDOR + '/musicas/enviar?' + qs, { method: 'POST', headers: { authorization: await tk(), 'content-type': f.type || 'application/octet-stream' }, body: f }), j = await r.json().catch(() => ({}));
      if (!r.ok) { s.textContent = j.error?.message || 'Erro ' + r.status; s.className = 'er'; if (r.status === 429 || r.status === 507) parou = true; continue; }
      if (j.ja) { s.textContent = 'Já estava no álbum'; s.className = 'ok'; continue; } s.textContent = 'Enviado'; s.className = 'ok'; S.itens.unshift(novoItem(j.som)); feitos++; } catch (e) { s.textContent = 'Falhou: ' + (e.message || e); s.className = 'er'; } }
  S.ocupado = false; try { const j = await api('/'); S.esp = j.espaco; S.cota = j.cota; S.lim = j.lim; } catch { } if (feitos) { aviso(feitos === 1 ? 'Som enviado.' : feitos + ' sons enviados.'); pinta(); } }
async function painelApagar(x) { const ident = x.novo ? { id: x.id } : { rel: x.rel }; let d;
  try { d = await api('/apagar', { ...ident, fase: 1 }); } catch (e) { return aviso(e.message, 1); }
  const c = abreLado(`<h2>Mandar para a lixeira</h2><p><b>${esc(d.nome)}</b></p><p>${x.novo ? 'O som sai do álbum e fica na lixeira, de onde um ADM pode restaurar.' : 'É um som antigo: ele só sai do álbum. O arquivo original continua guardado e os projetos antigos não perdem nada.'}</p>
  <h3>Confirme as quatro coisas</h3><label>1. Digite o nome do som: <b>${esc(d.nome)}</b><input type="text" id="a-nome" autocomplete="off" spellcheck="false"></label><label>2. Escreva <b>APAGAR</b><input type="text" id="a-frase" autocomplete="off" spellcheck="false"></label><label>3. Quanto é <b id="a-conta">${d.x} + ${d.y}</b>?<input type="number" id="a-resp" autocomplete="off"></label><label>4. Por que esse som vai sair?<input type="text" id="a-motivo" maxlength="200" autocomplete="off"></label><div id="a-erro"></div><div class="pes"><button class="bt perigo" id="a-ok" disabled>Mandar para a lixeira</button><button class="bt" id="a-canc">Cancelar</button></div>`);
  const ok = $('#a-ok', c), confere = () => { ok.disabled = !($('#a-nome', c).value.trim() && $('#a-frase', c).value.trim() && $('#a-resp', c).value && $('#a-motivo', c).value.trim().length >= 3); }; $$('input', c).forEach(i => i.oninput = confere); $('#a-canc', c).onclick = fechaLado; $('#a-nome', c).focus();
  ok.onclick = async () => { ok.disabled = true; S.ocupado = true; try { await api('/apagar', { ...ident, fase: 2, confirma: $('#a-nome', c).value, frase: $('#a-frase', c).value.trim(), resposta: +$('#a-resp', c).value, motivo: $('#a-motivo', c).value }); S.ocupado = false; if (x.novo) S.itens = S.itens.filter(i => i.k !== x.k); else S.ocultos.add(x.rel); if (S.tocando === x.k) { audio.pause(); S.tocando = null; urlAtual = null; $('#toca').hidden = true; } fechaLado(); aviso('Foi para a lixeira.'); try { S.esp = (await api('/')).espaco; } catch { } pinta(); }
    catch (e) { S.ocupado = false; $('#a-erro', c).innerHTML = `<div class="erro-c">${esc(e.message)}</div>`; if (e.type === 'confirma') { try { const n = await api('/apagar', { ...ident, fase: 1 }); $('#a-conta', c).textContent = `${n.x} + ${n.y}`; $('#a-resp', c).value = ''; confere(); } catch { } } else ok.disabled = false; } }; }
async function restaura(x) { try { await api('/restaurar', x.id ? { id: x.id } : { rel: x.rel }); aviso('Som restaurado.'); await carrega(); pinta(); } catch (e) { aviso(e.message, 1); } }

/* ---------- ligações ---------- */
document.addEventListener('click', e => { const g = s => e.target.closest?.(s); let b;
  if ((b = g('[data-play]'))) return ouve(S.atual[+b.dataset.play]); if ((b = g('[data-apaga]'))) return painelApagar(S.atual[+b.dataset.apaga]); if ((b = g('[data-volta]'))) return restaura(S.atual[+b.dataset.volta]);
  if (g('[data-enviar]')) return painelEnviar(); if ((b = g('[data-cat]'))) return vai('aba=cat&c=' + encodeURIComponent(b.dataset.cat)); if ((b = g('[data-pasta]'))) return vai('aba=pasta&c=' + encodeURIComponent(b.dataset.c) + '&p=' + encodeURIComponent(b.dataset.pasta));
  if (g('[data-vai]')) { e.preventDefault(); return vai(''); } if ((b = g('[data-aba]'))) return vai(b.dataset.aba === 'inicio' ? '' : 'aba=' + b.dataset.aba); });
let tmQ; $('#q').oninput = e => { clearTimeout(tmQ); tmQ = setTimeout(() => { const t = e.target.value.trim(); if (t.length >= 2) { history.replaceState(null, '', '?aba=busca&q=' + encodeURIComponent(t)); pinta(); } else if (!t && parametros().get('aba') === 'busca') vai(''); }, 220); };
$('#busca').onsubmit = e => e.preventDefault();
addEventListener('popstate', pinta);
{ const inicio = (async () => { await window.EstudioLogin.pronto; if (document.readyState === 'loading') await new Promise(r => addEventListener('DOMContentLoaded', r, { once: true })); try { await window.EstudioPerm?.pronto; } catch { } await carrega(); await pinta(); })();
  window.EstudioProgresso?.tarefa(inicio, 'Abrindo os sons', 45000); inicio.catch(e => { $('#tela').innerHTML = `<h1 class="titulo">Não consegui abrir</h1><p class="sub">${esc(e.message)}</p>`; }); }
