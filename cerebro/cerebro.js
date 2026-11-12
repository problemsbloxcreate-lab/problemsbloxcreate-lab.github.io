/* CÉREBRO: a memória compartilhada da equipe e das IAs. Tudo vem das rotas /cerebro do turma-ia; quem confere a permissão é o servidor.
   Nada de rascunho na nuvem nem de consulta repetida: pede só ao abrir uma tela. Cada tela só aparece inteira, depois de tudo pronto. */
'use strict';
const SERVIDOR = 'https://turma-ia.problemsraiz.workers.dev';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { itens: [], lixeira: [], adm: false, pedidosNovos: 0, sujo: false };
const quando = t => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

async function api(rota, corpo) {
  const t = await window.EstudioLogin.token();
  const r = await fetch(SERVIDOR + '/cerebro' + rota, { method: corpo ? 'POST' : 'GET', headers: { authorization: t, ...(corpo ? { 'content-type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error?.message || `O servidor respondeu ${r.status}. Tente de novo.`); e.status = r.status; e.type = j.error?.type; throw e; }
  return j;
}
const recarrega = async () => { const j = await api('/'); S.itens = j.itens; S.lixeira = j.lixeira; S.adm = j.adm; S.pedidosNovos = j.pedidosNovos; };
function aviso(t, erro) { const d = document.createElement('div'); d.textContent = t; if (erro) d.className = 'erro'; $('#avisos').appendChild(d); setTimeout(() => d.remove(), erro ? 8000 : 3500); }

/* ---------- ícones de linha (as cores de marca e pasta não aparecem mais no visual Celeste; ficam só como dado) ---------- */
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = { pasta: svg('<path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'), texto: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>'), imagem: svg('<rect x="3" y="5" width="18" height="14"/><circle cx="8.5" cy="10" r="1.5"/><path d="m4 18 5-5 4 4 3-3 4 4"/>'), referencia: svg('<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1"/><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/>'),
  editar: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), mover: svg('<path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 13h6m-2-2 2 2-2 2"/>'), lixo: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'), volta: svg('<path d="M4 9h11a5 5 0 0 1 0 10H9"/><path d="M8 5 4 9l4 4"/>'), mais: svg('<path d="M12 5v14M5 12h14"/>') };
const MARCAS = { '': ['Sem marca', '#3b5478'], guia: ['Guia', '#2b5797'], biblia: ['Bíblia', '#603cba'], skill: ['Skill', '#00858a'], memoria: ['Memória', '#2d89ef'], regra: ['Regra', '#da532c'], decisao: ['Decisão', '#1e7145'], evitar: ['A evitar', '#b91d47'], referencia: ['Referência', '#b5820f'], aprendizado: ['Aprendizado', '#00a300'] };
const CORES_PASTA = ['#2d89ef', '#603cba', '#00858a', '#da532c', '#1e7145', '#b91d47', '#b5820f', '#9f00a7', '#2b5797'];
const corPasta = n => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CORES_PASTA[h % CORES_PASTA.length]; };
const corDe = x => x.tipo === 'pasta' ? corPasta(x.nome) : MARCAS[x.marca || '']?.[1] || MARCAS[''][1];
const filhos = pai => S.itens.filter(x => (x.pai || null) === (pai || null));
const ordem = l => [...l].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
const acha = id => S.itens.find(x => x.id === id);
const caminho = id => { const o = []; for (let x = acha(id), i = 0; x && i < 20; x = acha(x.pai), i++) o.unshift(x); return o; };
const trilha = id => `<nav class="trilha" aria-label="Onde estou"><a href="?aba=arquivos" data-nav="aba=arquivos">Arquivos</a>${caminho(id).map(x => ` <span>›</span> <a href="?pasta=${esc(x.id)}" data-nav="pasta=${esc(x.id)}">${esc(x.nome)}</a>`).join('')}</nav>`;
function tile(x) { const pasta = x.tipo === 'pasta', k = pasta ? 'pasta=' + x.id : 'id=' + x.id;
  return `<a class="tile${pasta ? ' larga' : ''}" style="--c:${corDe(x)}" href="?${esc(k)}" data-nav="${esc(k)}" title="${esc(x.resumo || x.nome)}">${IC[x.tipo] || IC.texto}${pasta && x.resumo ? `<span class="res">${esc(x.resumo)}</span>` : ''}<span class="nome">${esc(x.nome)}</span>${pasta ? `<span class="n">${filhos(x.id).length}</span>` : ''}</a>`; }

/* ---------- texto: markdown simples; tudo é escapado antes, link só http(s) ---------- */
function linhaMd(t) { return esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\n]+)\*(?![\w*])/g, '$1<i>$2</i>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'); }
function md(s) { const L = String(s || '').replace(/\r/g, '').split('\n'), o = []; let i = 0;
  const lista = (re, tag) => { const it = []; while (i < L.length && re.test(L[i])) it.push(`<li>${linhaMd(L[i++].replace(re, ''))}</li>`); o.push(`<${tag}>${it.join('')}</${tag}>`); };
  while (i < L.length) { const l = L[i]; let m;
    if (/^```/.test(l)) { const c = []; i++; while (i < L.length && !/^```/.test(L[i])) c.push(L[i++]); i++; o.push(`<pre><code>${esc(c.join('\n'))}</code></pre>`); }
    else if ((m = l.match(/^(#{1,4})\s+(.*)/))) { o.push(`<h${m[1].length}>${linhaMd(m[2])}</h${m[1].length}>`); i++; }
    else if (/^\s*[-*_]{3,}\s*$/.test(l)) { o.push('<hr>'); i++; }
    else if (/^\s*[-*]\s+/.test(l)) lista(/^\s*[-*]\s+/, 'ul');
    else if (/^\s*\d+[.)]\s+/.test(l)) lista(/^\s*\d+[.)]\s+/, 'ol');
    else if (/^>\s?/.test(l)) { const c = []; while (i < L.length && /^>\s?/.test(L[i])) c.push(linhaMd(L[i++].replace(/^>\s?/, ''))); o.push(`<blockquote>${c.join('<br>')}</blockquote>`); }
    else if (/^\|.*\|\s*$/.test(l) && /^\|[\s:|-]+\|\s*$/.test(L[i + 1] || '')) { const cel = t => t.trim().replace(/^\||\|$/g, '').split('|').map(c => linhaMd(c.trim())); const h = cel(l); i += 2; const b = []; while (i < L.length && /^\|.*\|\s*$/.test(L[i])) b.push(cel(L[i++])); o.push(`<table><tr>${h.map(c => `<th>${c}</th>`).join('')}</tr>${b.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`); }
    else if (!l.trim()) i++;
    else { const c = []; while (i < L.length && L[i].trim() && !/^(#{1,4}\s|```|>|\s*[-*]\s+|\s*\d+[.)]\s+|\|.*\|\s*$)/.test(L[i])) c.push(linhaMd(L[i++])); if (!c.length) c.push(linhaMd(L[i++])); o.push(`<p>${c.join('<br>')}</p>`); } }
  return o.join(''); }

/* ---------- janelas: faixa inteira na largura, como as mensagens do Windows 8 ---------- */
function dialogo({ titulo, texto, html = '', botoes, aoAbrir }) { return new Promise(fim => { const d = document.createElement('div'); d.className = 'dlg'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', titulo);
  d.innerHTML = `<div class="faixa"><h2>${esc(titulo)}</h2>${texto ? `<p>${esc(texto)}</p>` : ''}${html}<div class="bts">${botoes.map((b, i) => `<button class="bt${b.pri ? ' pri' : ''}" data-i="${i}" type="button">${esc(b.t)}</button>`).join('')}</div></div>`;
  const sai = v => { removeEventListener('keydown', tc, true); d.remove(); fim(v); }, tc = e => { if (e.key === 'Escape') { e.stopPropagation(); sai(null); } };
  addEventListener('keydown', tc, true); $$('[data-i]', d).forEach(b => b.onclick = () => { const x = botoes[+b.dataset.i]; sai(x.v === undefined ? null : typeof x.v === 'function' ? x.v(d) : x.v); });
  document.body.appendChild(d); aoAbrir?.(d); }); }
const confirma = (titulo, texto, t = 'Confirmar') => dialogo({ titulo, texto, botoes: [{ t, pri: 1, v: true }, { t: 'Cancelar' }] });
const pedeTexto = (titulo, texto, ini = '') => dialogo({ titulo, texto, html: `<input id="dlg-v" value="${esc(ini)}" maxlength="120">`, botoes: [{ t: 'Salvar', pri: 1, v: d => $('#dlg-v', d).value.trim() || null }, { t: 'Cancelar' }], aoAbrir: d => { const i = $('#dlg-v', d); i.focus(); i.select(); i.onkeydown = e => { if (e.key === 'Enter') $('[data-i="0"]', d).click(); }; } });

/* ---------- navegação ---------- */
const ABAS = [['', 'Montanha'], ['arquivos', 'Arquivos'], ['evitar', 'A evitar'], ['referencias', 'Referências'], ['registro', 'Registro'], ['pedidos', 'Pedidos'], ['lixeira', 'Lixeira'], ['revisar', 'Revisar'], ['chaves', 'Acesso das IAs']];
const SO_ADM = new Set(['lixeira', 'revisar']); // Acesso das IAs agora é de todos: cada pessoa autoriza o próprio computador (12/11/2026)
const params = () => new URLSearchParams(location.search);
function pintaAbas() { const p = params(), a = p.get('aba') || (window.Montanha?.eDaMontanha(p) ? '' : 'arquivos'); $('#abas').innerHTML = ABAS.filter(([k]) => !SO_ADM.has(k) || S.adm).map(([k, n]) => `<button type="button" data-aba="${k}" class="${k === a ? 'on' : ''}"${k === a ? ' aria-current="page"' : ''}>${n}${k === 'pedidos' && S.pedidosNovos ? `<em>${S.pedidosNovos}</em>` : ''}${k === 'revisar' && S.revisar ? `<em>${S.revisar}</em>` : ''}</button>`).join(''); }
async function largarEdicao() { if (!S.sujo) return true; if (!await confirma('Sair sem salvar?', 'O que você escreveu aqui ainda não foi gravado no Cérebro.', 'Sair sem salvar')) return false; S.sujo = false; return true; }
async function vai(q) { if (!await largarEdicao()) return; history.pushState(null, '', q ? '?' + q : './'); scrollTo(0, 0); await pinta(); }
let geracao = 0;
// a tela só troca quando ela inteira já está pronta (nada aparece aos poucos)
async function troca(fazer) { const g = ++geracao; $('#prog').hidden = false; let r; try { r = await fazer(); } catch (e) { if (g === geracao) { $('#tela').innerHTML = `<h1 class="titulo">Não consegui abrir</h1><p class="sub">${esc(e.message)}</p>`; $('#barra').hidden = true; } } finally { if (g === geracao) $('#prog').hidden = true; } if (g !== geracao || !r) return; $('#tela').innerHTML = r.html; const b = $('#barra'); b.hidden = !r.barra?.length; b.innerHTML = (r.barra || []).map((x, i) => `<button type="button" data-b="${i}">${IC[x.ic]}${esc(x.t)}</button>`).join(''); $$('[data-b]', b).forEach(el => el.onclick = () => r.barra[+el.dataset.b].f()); r.depois?.(); }
const barraPasta = pai => S.adm ? [{ ic: 'pasta', t: 'Nova pasta', f: () => novaPasta(pai) }, { ic: 'texto', t: 'Novo texto', f: () => editar({ tipo: 'texto', pai }) }, { ic: 'imagem', t: 'Nova imagem', f: () => editar({ tipo: 'imagem', pai }) }, { ic: 'referencia', t: 'Referência', f: () => editar({ tipo: 'referencia', pai }) }] : [];
async function pinta() { const p = params(), aba = p.get('aba');
  // 2.0 Celeste: sem nada no endereço (ou ?m=<assunto>) a tela é a Montanha; o resto continua como era
  if (window.Montanha?.eDaMontanha(p)) { $('#prog').hidden = true; pintaAbas(); return window.Montanha.abre(); } window.Montanha?.fecha(); pintaAbas();
  if (p.get('id')) return troca(() => telaItem(p.get('id')));
  if (aba === 'evitar') return troca(() => telaMarca('evitar', 'A evitar', 'O que já deu errado ou foi proibido. Leia antes de mexer.'));
  if (aba === 'referencias') return troca(() => telaMarca('referencia', 'Referências', 'Os links e materiais que a equipe usa como base.'));
  if (aba === 'registro') return troca(telaRegistro); if (aba === 'pedidos') return troca(telaPedidos); if (aba === 'lixeira') return troca(telaLixeira); if (aba === 'chaves') return troca(telaChaves); if (aba === 'revisar') return troca(telaRevisar); if (aba === 'busca') return troca(() => telaBusca(p.get('q') || ''));
  return troca(() => telaPasta(p.get('pasta'))); }

async function telaPasta(id) { await recarrega(); pintaAbas(); const eu = id ? acha(id) : null; if (id && !eu) throw new Error('Essa pasta não existe mais (ou está na lixeira).');
  const l = filhos(id), pastas = ordem(l.filter(x => x.tipo === 'pasta')), arqs = ordem(l.filter(x => x.tipo !== 'pasta'));
  return { html: `${id ? trilha(eu.pai) : ''}<h1 class="titulo">${esc(eu?.nome || 'Cérebro')}</h1><p class="sub">${esc(eu?.resumo || 'A memória de longo prazo da equipe e das IAs. Todo mundo lê; só ADMs e o Claude mudam.')}</p>
    ${pastas.length ? `<div class="tiles">${pastas.map(tile).join('')}</div>` : ''}${arqs.length ? `${pastas.length ? '<h2 class="grupo">Arquivos</h2>' : ''}<div class="tiles">${arqs.map(tile).join('')}</div>` : ''}${l.length ? '' : '<div class="vazio">Esta pasta está vazia.</div>'}`,
    barra: [...(eu && S.adm ? [{ ic: 'editar', t: 'Renomear', f: () => renomeia(eu) }, { ic: 'mover', t: 'Mover', f: () => move(eu) }, { ic: 'lixo', t: 'Lixeira', f: () => lixeira(eu) }] : []), ...barraPasta(id)] }; }
const ACAO = { criar: 'Criou', editar: 'Mudou', lixeira: 'Mandou para a lixeira', restaurar: 'Restaurou' };
const autoria = x => [x.ia ? `${x.ia} (IA)` : x.por, x.pedido && x.pedido !== x.por ? `a pedido de ${x.pedido}` : ''].filter(Boolean).join(' · ');
async function corpoDe(x) { let h = ''; if (x.img) { const v = await api('/img?h=' + encodeURIComponent(x.img)), src = `data:${v.tipo};base64,${v.b64}`, im = new Image(); im.src = src; await im.decode().catch(() => { }); h += `<img class="imagem" alt="${esc(x.nome)}" src="${esc(src)}">`; } if (x.url) h += `<a class="reflink" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.url)}</a>`; return h + `<div class="texto">${md(x.corpo)}</div>`; }
async function telaItem(id) { const [j] = await Promise.all([api('/item?id=' + encodeURIComponent(id)), S.itens.length ? null : recarrega()]), x = j.item, [mn, mc] = MARCAS[x.marca || ''] || MARCAS[''], corpo = await corpoDe(x); pintaAbas();
  return { html: `${trilha(x.pai)}<h1 class="titulo">${esc(x.nome)}</h1><p class="meta">${x.marca ? `<span class="selo" style="--c:${mc}">${esc(mn)}</span>` : ''}${x.apagado ? '<span class="selo perigo">Na lixeira</span>' : ''}Versão ${x.ver} · ${esc(quando(x.em))} · ${esc(autoria(x))}</p>
    <div class="doc"><article>${x.resumo ? `<p class="sub">${esc(x.resumo)}</p>` : ''}${corpo}</article><aside class="hist"><h2>Histórico</h2>${j.versoes.map(v => `<button type="button" data-v="${v.ver}"><b>Versão ${v.ver}</b> · ${esc(ACAO[v.acao] || v.acao)}<br>${esc(quando(v.em))} · ${esc(autoria(v))}${v.motivo ? `<br>${esc(v.motivo)}` : ''}</button>`).join('')}</aside></div>`,
    barra: S.adm ? (x.apagado ? [{ ic: 'volta', t: 'Restaurar', f: () => restaura(x) }] : [{ ic: 'editar', t: 'Editar', f: () => editar(x) }, { ic: 'mover', t: 'Mover', f: () => move(x) }, { ic: 'lixo', t: 'Lixeira', f: () => lixeira(x) }]) : [],
    depois: () => $$('[data-v]').forEach(b => b.onclick = () => veVersao(x, +b.dataset.v)) }; }
async function veVersao(x, ver) { $('#prog').hidden = false; let v, c; try { v = await api(`/versao?id=${encodeURIComponent(x.id)}&ver=${ver}`); c = await corpoDe(v); } catch (e) { return aviso(e.message, 1); } finally { $('#prog').hidden = true; }
  const atual = ver === x.ver && !x.apagado, r = await dialogo({ titulo: `${v.nome} · versão ${ver}`, texto: `${quando(v.em)} · ${autoria(v)}${v.motivo ? ' · ' + v.motivo : ''}`, html: `<div class="ct">${c}</div>`, botoes: [...(S.adm && !atual ? [{ t: 'Restaurar esta versão', pri: 1, v: true }] : []), { t: 'Fechar' }] });
  if (r) grava('/restaurar', { id: x.id, ver }, 'Versão restaurada. A versão de antes continua no histórico.'); }
async function grava(rota, corpo, ok, depois) { $('#prog').hidden = false; try { await api(rota, corpo); aviso(ok); S.sujo = false; if (depois) await depois(); else await pinta(); return true; } catch (e) { aviso(e.message, 1); return false; } finally { $('#prog').hidden = true; } }
const novaPasta = async pai => { const nome = await pedeTexto('Nova pasta', 'Como essa pasta vai se chamar?'); if (nome) grava('/salvar', { tipo: 'pasta', pai: pai || null, nome }, 'Pasta criada.'); };
const renomeia = async x => { const nome = await pedeTexto('Renomear', 'Qual o novo nome?', x.nome); if (nome && nome !== x.nome) grava('/salvar', { id: x.id, nome, base: x.ver }, 'Nome trocado.'); };
async function lixeira(x) { if (await confirma('Mandar para a lixeira?', `"${x.nome}" sai da lista, mas continua guardado. Dá para restaurar quando quiser.`, 'Mandar para a lixeira')) grava('/lixeira', { id: x.id }, 'Foi para a lixeira.', () => vai(x.pai ? 'pasta=' + x.pai : '')); }
const restaura = x => grava('/restaurar', { id: x.id }, 'Saiu da lixeira.');
async function move(x) { const fora = id => { for (let i = acha(id), n = 0; i && n < 20; i = acha(i.pai), n++) if (i.id === x.id) return true; return false; }, ps = S.itens.filter(i => i.tipo === 'pasta' && !fora(i.id)).map(i => [i.id, caminho(i.id).map(c => c.nome).join(' › ')]).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR', { numeric: true }));
  const r = await dialogo({ titulo: 'Mover para', texto: `Para qual pasta vai "${x.nome}"?`, html: `<select id="dlg-p"><option value="">Início do Cérebro</option>${ps.map(([id, n]) => `<option value="${esc(id)}"${id === x.pai ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`, botoes: [{ t: 'Mover', pri: 1, v: d => ({ pai: $('#dlg-p', d).value || null }) }, { t: 'Cancelar' }] });
  if (r && r.pai !== (x.pai || null)) grava('/salvar', { id: x.id, pai: r.pai, base: x.ver }, 'Movido.'); }

/* imagem: reduzida no navegador antes de ir para o banco */
async function preparaImagem(f) { const bm = await createImageBitmap(f); for (const [lado, q] of [[1600, .84], [1280, .74], [900, .66]]) { const k = Math.min(1, lado / Math.max(bm.width, bm.height)), c = document.createElement('canvas'); c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k); c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); const u = c.toDataURL('image/webp', q), b64 = u.split(',')[1], tipo = u.slice(5, u.indexOf(';')); if (b64.length < 1850000) return { tipo, b64 }; } throw new Error('Essa imagem ficou grande demais mesmo reduzida.'); }
function editar(x) { const novo = !x.id; history.pushState(null, '', novo ? '?editar=1' : '?editar=' + x.id); const tipo = x.tipo; ++geracao; $('#barra').hidden = true;
  const ops = Object.entries(MARCAS).map(([k, [n]]) => `<option value="${k}"${(x.marca || (tipo === 'referencia' ? 'referencia' : '')) === k ? ' selected' : ''}>${n}</option>`).join('');
  const carrega = async () => { let corpo = x.corpo; if (!novo && corpo === undefined) corpo = (await api('/item?id=' + encodeURIComponent(x.id))).item.corpo; return corpo || ''; };
  $('#prog').hidden = false; carrega().then(corpo => { $('#prog').hidden = true;
    $('#tela').innerHTML = `<h1 class="titulo">${novo ? ({ texto: 'Novo texto', imagem: 'Nova imagem', referencia: 'Nova referência' }[tipo]) : 'Editar'}</h1><p class="sub">${novo ? '' : 'A versão atual fica guardada no histórico.'}</p>
    <form class="form" id="ed"><div class="duas"><label>Nome<input name="nome" required maxlength="120" value="${esc(x.nome || '')}"></label><label>Marca<select name="marca">${ops}</select></label></div>
    <label>Resumo curto (opcional)<input name="resumo" maxlength="300" value="${esc(x.resumo || '')}"></label>
    ${tipo === 'referencia' ? `<label>Link<input name="url" type="url" maxlength="2000" placeholder="https://" value="${esc(x.url || '')}"></label>` : ''}
    ${tipo === 'imagem' ? `<label>${novo ? 'Imagem' : 'Trocar a imagem (opcional)'}<input name="arq" type="file" accept="image/*"${novo ? ' required' : ''}></label>` : ''}
    <label>${tipo === 'texto' ? 'Texto' : 'Observações'}<textarea name="corpo" class="${tipo === 'texto' ? '' : 'curto'}" maxlength="800000">${esc(corpo)}</textarea></label>
    <div class="duas"><label>A pedido de (opcional)<input name="pedidoPor" maxlength="80"></label><label>O que mudou e por quê (opcional)<input name="motivo" maxlength="600"></label></div>
    <div><button class="bt pri" type="submit">Salvar</button> <button class="bt" type="button" id="ed-canc">Cancelar</button></div></form>`;
    const f = $('#ed'); f.oninput = () => { S.sujo = true; }; $('#ed-canc').onclick = () => history.back();
    f.onsubmit = async e => { e.preventDefault(); const d = new FormData(f), b = { nome: d.get('nome'), marca: d.get('marca'), resumo: d.get('resumo'), corpo: d.get('corpo'), pedidoPor: d.get('pedidoPor'), motivo: d.get('motivo'), ...(d.has('url') ? { url: d.get('url') } : {}), ...(novo ? { tipo, pai: x.pai || null } : { id: x.id, base: x.ver }) };
      const btn = $('button[type=submit]', f); btn.disabled = true; try { const arq = d.get('arq'); if (arq?.size) b.imagem = await preparaImagem(arq); const j = await api('/salvar', b); S.sujo = false; aviso('Salvo no Cérebro.'); history.replaceState(null, '', '?id=' + j.id); await recarrega(); await pinta(); } catch (er) { aviso(er.message, 1); btn.disabled = false; } }; f.nome.focus();
  }).catch(e => { $('#prog').hidden = true; aviso(e.message, 1); }); }

async function telaMarca(m, titulo, sub) { const j = await api('/marca?m=' + m); return { html: `<h1 class="titulo">${titulo}</h1><p class="sub">${sub}</p><div class="lista">${j.itens.map(x => `<a class="linha" style="--c:${MARCAS[m][1]}" href="?id=${esc(x.id)}" data-nav="id=${esc(x.id)}"><b>${esc(x.nome)}</b><div class="d">${esc(quando(x.em))} · ${esc(autoria(x))}</div>${x.url ? `<div class="tr">${esc(x.url)}</div>` : ''}${x.resumo || x.corpo ? `<div class="tr">${esc((x.resumo || x.corpo).slice(0, 320))}</div>` : ''}</a>`).join('') || '<div class="vazio">Nada aqui ainda.</div>'}</div>`, barra: barraPasta(null).length && m === 'referencia' ? [{ ic: 'referencia', t: 'Referência', f: () => editar({ tipo: 'referencia', pai: null, marca: 'referencia' }) }] : [] }; }
const linhaReg = x => `<a class="linha" style="--c:${MARCAS[x.marca || '']?.[1] || MARCAS[''][1]}" href="?id=${esc(x.id)}" data-nav="id=${esc(x.id)}"><b>${esc(ACAO[x.acao] || x.acao)}: ${esc(x.nome)}</b> <span class="d">versão ${x.ver}</span><div class="d">${esc(quando(x.em))} · ${esc(autoria(x))}</div>${x.motivo ? `<div class="tr">${esc(x.motivo)}</div>` : ''}</a>`;
async function telaRegistro() { const j = await api('/registro?limite=50'); let ult = j.itens.at(-1)?.em; return { html: `<h1 class="titulo">Registro</h1><p class="sub">Tudo o que mudou, quem pediu e qual IA gravou.</p><div class="lista" id="reg">${j.itens.map(linhaReg).join('') || '<div class="vazio">Nada registrado ainda.</div>'}</div>${j.itens.length === 50 ? '<button class="bt mais" id="mais" type="button">Ver mais</button>' : ''}`,
  depois: () => { const m = $('#mais'); if (m) m.onclick = async () => { m.disabled = true; try { const k = await api(`/registro?limite=50&antes=${ult}`); ult = k.itens.at(-1)?.em; $('#reg').insertAdjacentHTML('beforeend', k.itens.map(linhaReg).join('')); m.disabled = false; if (k.itens.length < 50) m.remove(); } catch (e) { m.disabled = false; aviso(e.message, 1); } }; } }; }
const TIPO_PED = { aprender: 'Aprender', evitar: 'A evitar', corrigir: 'Corrigir', referencia: 'Referência' }, EST_PED = { novo: 'Esperando', feito: 'Feito', recusado: 'Recusado' };
async function telaPedidos() { const j = await api('/pedidos'); return { html: `<h1 class="titulo">Pedidos</h1><p class="sub">Qualquer pessoa da equipe pode pedir. O Claude ou um ADM grava no Cérebro e marca aqui.</p>
  <form class="form" id="ped"><div class="duas"><label>O que é<select name="tipo">${Object.entries(TIPO_PED).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label><label>Sobre qual arquivo ou programa (opcional)<input name="alvo" maxlength="300"></label></div><label>Pedido<textarea name="texto" class="curto" required maxlength="4000"></textarea></label><div><button class="bt pri" type="submit">Registrar pedido</button></div></form>
  <h2 class="grupo">Todos os pedidos</h2><div class="lista">${j.itens.map(x => `<div class="linha est" style="--c:var(--${x.estado === 'novo' ? 'aviso' : x.estado === 'feito' ? 'sucesso' : 'perigo'})"><b>${esc(TIPO_PED[x.tipo] || x.tipo)}${x.alvo ? ': ' + esc(x.alvo) : ''}</b> <span class="d">${esc(EST_PED[x.estado] || x.estado)}</span><div class="d">${esc(x.por)} · ${esc(quando(x.em))}${x.feito_por ? ` · ${esc(x.feito_por)}` : ''}</div><div class="tr">${esc(x.texto)}</div>${x.nota ? `<div class="tr">${esc(x.nota)}</div>` : ''}${S.adm && x.estado === 'novo' ? `<div class="acoes"><button class="bt" type="button" data-p="${esc(x.id)}" data-e="feito">Marcar como feito</button><button class="bt" type="button" data-p="${esc(x.id)}" data-e="recusado">Recusar</button></div>` : ''}</div>`).join('') || '<div class="vazio">Nenhum pedido ainda.</div>'}</div>`,
  depois: () => { $('#ped').onsubmit = e => { e.preventDefault(); const d = new FormData(e.target); grava('/pedir', { tipo: d.get('tipo'), alvo: d.get('alvo'), texto: d.get('texto') }, 'Pedido registrado.'); }; $$('[data-p]').forEach(b => b.onclick = () => grava('/pedido', { id: b.dataset.p, estado: b.dataset.e }, 'Pedido atualizado.')); } }; }
async function telaLixeira() { await recarrega(); pintaAbas(); return { html: `<h1 class="titulo">Lixeira</h1><p class="sub">Nada daqui foi apagado de verdade. Abra um item para restaurar.</p><div class="lista">${S.lixeira.map(x => `<a class="linha" href="?id=${esc(x.id)}" data-nav="id=${esc(x.id)}"><b>${esc(x.nome)}</b><div class="d">${esc(quando(x.em))} · ${esc(autoria(x))}</div></a>`).join('') || '<div class="vazio">A lixeira está vazia.</div>'}</div>` }; }
async function telaChaves() { const j = await api('/chaves'), adm = j.adm;
  return { html: `<h1 class="titulo">Acesso das IAs</h1><p class="sub">Não precisa instalar nada à mão: quando você pede ao Claude algo do Estúdio, ele instala a CelestIA sozinho e mostra um código que começa com c-. Cole o código aqui para ligar o seu computador ao Cérebro.${adm ? '' : ' As mudanças da sua IA entram na hora; os ADMs só revisam.'}</p>
  <h2 class="grupo">Autorize o código que o Claude mostrar</h2>
  <form class="form" id="ch"><div class="duas"><label>Código (começa com c-)<input name="codigo" required maxlength="70" autocomplete="off" spellcheck="false" placeholder="c-..."></label><label>Nome deste computador<input name="nome" required maxlength="80" placeholder="Ex.: notebook de casa"></label></div><div><button class="bt pri" type="submit">Autorizar</button></div></form>
  <h2 class="grupo">${adm ? 'Todos os acessos' : 'Seus computadores'}</h2><div class="lista">${j.itens.map(x => `<div class="linha est" style="--c:var(--${x.revogada ? 'perigo' : 'sucesso'})"><b>${esc(x.nome)}</b> <span class="d">${x.revogada ? 'Revogado' : 'Ativo'}</span>${x.adm === 0 ? ' <span class="selo">IA da equipe</span>' : ''}<div class="d">Autorizado por ${esc(x.por)} · ${esc(quando(x.em))}</div>${x.revogada ? '' : `<div class="acoes"><button class="bt" type="button" data-rev="${esc(x.h)}">Revogar</button></div>`}</div>`).join('') || '<div class="vazio">Nenhum computador autorizado ainda.</div>'}</div>`,
  depois: () => { $('#ch').onsubmit = e => { e.preventDefault(); const d = new FormData(e.target); grava('/chaves', { acao: 'autorizar', codigo: d.get('codigo'), nome: d.get('nome') }, 'Computador autorizado. Volte ao Claude e diga que já autorizou: ele termina a instalação sozinho.'); };
    $$('[data-rev]').forEach(b => b.onclick = async () => { if (await confirma('Revogar este acesso?', 'A IA desse computador deixa de entrar no Cérebro na hora.', 'Revogar')) grava('/chaves', { acao: 'revogar', h: b.dataset.rev }, 'Acesso revogado.'); }); } }; }
// REVISAR (só ADM): o que as IAs de quem não é ADM mudaram. Ok = visto; Desfazer = volta para a versão de antes (o histórico guarda tudo)
async function telaRevisar() { const j = await api('/revisao'); S.revisar = j.itens.length; pintaAbas();
  return { html: `<h1 class="titulo">Revisar</h1><p class="sub">Mudanças feitas pelas IAs de quem não é ADM. Elas já valem; aqui você confere, marca como visto ou desfaz. Skill mudada só é instalada nos computadores depois do seu ok.</p>
  ${j.itens.length ? '<div><button class="bt" type="button" id="rv-todos">Marcar tudo como visto</button></div><br>' : ''}<div class="lista">${j.itens.map(x => `<div class="linha"><b>${esc(x.acao)}: ${esc(x.caminho || x.ref)}</b>${x.skill ? ' <span class="selo">Skill · espera seu ok para instalar</span>' : ''}<div class="d">${esc(x.quem || 'IA')} · ${esc(x.ia || '')} · a pedido de ${esc(x.pedido || '?')} · ${esc(quando(x.em))}</div>${x.motivo ? `<div class="tr">${esc(x.motivo)}</div>` : ''}
    <div class="acoes">${x.tipo === 'no' ? `<a class="bt" href="?id=${esc(x.ref)}" data-nav="id=${esc(x.ref)}">Abrir</a> <button class="bt" type="button" data-desf="${x.seq}">Desfazer</button>` : ''} <button class="bt pri" type="button" data-ok="${x.seq}">Ok</button></div></div>`).join('') || '<div class="vazio">Nada para revisar.</div>'}</div>`,
  depois: () => { $('#rv-todos') && ($('#rv-todos').onclick = () => grava('/revisao', { acao: 'ok-todos' }, 'Tudo marcado como visto.'));
    $$('[data-ok]').forEach(b => b.onclick = () => grava('/revisao', { acao: 'ok', seq: +b.dataset.ok }, 'Marcado como visto.'));
    $$('[data-desf]').forEach(b => b.onclick = async () => { if (await confirma('Desfazer esta mudança?', 'O arquivo volta para a versão de antes. A mudança continua guardada no histórico.', 'Desfazer')) grava('/revisao', { acao: 'desfazer', seq: +b.dataset.desf }, 'Desfeito.'); }); } }; }
async function telaBusca(t) { const j = await api('/trechos?n=10&q=' + encodeURIComponent(t)); return { html: `<h1 class="titulo">Busca</h1><p class="sub">${j.itens.length} trecho(s) para "${esc(t)}"</p><div class="lista">${j.itens.map(x => `<a class="linha" href="?id=${esc(x.no)}" data-nav="id=${esc(x.no)}"><b>${esc(x.caminho)}${x.titulo ? ' › ' + esc(x.titulo) : ''}</b><div class="tr">${esc(String(x.trecho || x.resumo || '').replaceAll('**', ''))}</div></a>`).join('') || '<div class="vazio">Não achei nada com isso.</div>'}</div>` }; }

/* ---------- ligações da página ---------- */
document.addEventListener('click', e => { const a = e.target.closest?.('[data-nav]'); if (a && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) { e.preventDefault(); vai(a.dataset.nav); return; } const b = e.target.closest?.('[data-aba]'); if (b) vai(b.dataset.aba ? 'aba=' + b.dataset.aba : ''); });
$('#busca').onsubmit = e => { e.preventDefault(); const t = $('#q').value.trim(); if (t.length >= 2) vai('aba=busca&q=' + encodeURIComponent(t)); };
addEventListener('popstate', () => { S.sujo = false; pinta(); });
addEventListener('beforeunload', e => { if (S.sujo) { e.preventDefault(); e.returnValue = ''; } });
{ const inicio = (async () => { await window.EstudioLogin.pronto; if (document.readyState === 'loading') await new Promise(r => addEventListener('DOMContentLoaded', r, { once: true })); try { await window.EstudioPerm?.pronto; } catch { } if (params().has('editar')) history.replaceState(null, '', './'); if (!window.Montanha?.eDaMontanha(params())) await recarrega(); await pinta(); })();
  window.EstudioProgresso?.tarefa(inicio, 'Abrindo o Cérebro', 20000); inicio.catch(e => { $('#tela').innerHTML = `<h1 class="titulo">Não consegui abrir</h1><p class="sub">${esc(e.message)}</p>`; }); }
