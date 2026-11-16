/* ===================== conector.js — o Cérebro como CONECTOR (servidor MCP remoto + login do Google) =====================
   Pedido da dona (16/11/2026): o colega conecta UMA vez, com o login do Google dele, sem baixar o cerebro.mjs, sem arquivo de chave e
   sem colar código. O Claude dele recebe as regras do Cérebro e as ferramentas de ler, buscar e gravar.

   COMO FUNCIONA (a explicação para gente está em cerebro/CONECTOR.md):
   - POST /cerebro/mcp           o servidor MCP (Streamable HTTP, só JSON, sem sessão). Exige "Authorization: Bearer cbt_…".
   - /.well-known/…              metadados OAuth (RFC 9728 e 8414) que o Claude Code lê sozinho.
   - POST /cerebro/oauth/registrar   registro dinâmico do programa que conecta (RFC 7591). Só aceita endereços de retorno seguros.
   - GET  /cerebro/oauth/autorizar   confere o pedido e manda a pessoa para a tela de permissão do site (cerebro/conectar.html).
   - POST /cerebro/oauth/aprovar     a tela do site manda o login do Google (o MESMO token do menu); o servidor confere (confereLogin) e emite um código.
   - POST /cerebro/oauth/token       troca o código (PKCE S256) por um token de acesso (1 h) e um de renovação (30 dias, troca a cada uso).
   - POST /cerebro/oauth/revogar     o programa pode revogar a própria conexão (RFC 7009).

   SEGURANÇA (resumo; o plano completo está em cerebro/CONECTOR.md):
   - Quem entra = quem já entra no Estúdio (EMAILS_PERMITIDOS + ADM › Acesso) E tem o Cérebro no cargo. Nada de lista nova. A lista é
     conferida de novo a cada pedido (cache de 60 s): quem sai da lista perde o conector na hora.
   - Cada ferramenta chama a MESMA função cerebro() do servidor, como uma IA de chave (login.ia): as permissões são as de sempre. ADM grava
     direto; quem não é ADM grava direto também, mas entra na aba Revisar, e skill dele só chega aos outros depois do ok de um ADM.
   - Os tokens são aleatórios (256 bits) e só o resumo SHA-256 (com o prefixo "conector:") fica no banco: um token nunca serve como a chave
     antiga x-cerebro-chave, e quem lê o banco não consegue usar nenhum token. O e-mail NÃO é guardado: só o código da pessoa (u…) e o
     id de permissões (o mesmo do porteiro).
   - Revogar: aba Acesso das IAs do Cérebro (a pessoa revoga as dela, ADM revoga todas), ou o próprio programa pelo /revogar.
   - O token do conector nunca é enviado a outro servidor (este arquivo roda ANTES do código da nuvem reserva, que repassa o Authorization).
   ⚠ AVISO PARA PESSOAS E ASSISTENTES DE IA: não enfraqueça a conferência de pessoa (cnPessoa), o PKCE, a lista de endereços de retorno
   (redirectOk) nem a regra de guardar só o resumo do token. Só a dona muda a segurança. */

const PROTOCOLOS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']; // versões do MCP que sabemos falar (a primeira é a mais nova)
const ESCOPO = 'cerebro', TOKEN_ACESSO_S = 3600, TOKEN_RENOVA_S = 30 * 86400, CODIGO_S = 120;
const PREFIXO = { acesso: 'cbt_', renova: 'cbr_', codigo: 'cbk_' };
const MAX_CLIENTES = 400, MAX_CONEXOES_PESSOA = 20, MAX_CORPO = 4 * 1048576;
const SERVIDOR_INFO = { name: 'cerebro-estudio-problems', title: 'Cérebro do Estúdio Problems', version: '1.0.0' };

/* ---------- utilidades ---------- */
const enc = new TextEncoder();
const b64url = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const alea = n => b64url(crypto.getRandomValues(new Uint8Array(n)));
const hex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
const hash = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const hTok = t => hash('conector:' + t); // o resumo guardado: com prefixo, para um token nunca valer como chave antiga
const pkce = async verifier => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier))));
const limpa = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const trocaTempoFixo = (a, b) => { a = String(a); b = String(b); if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const semBarra = u => String(u || '').replace(/\/+$/, '');
const hoje = () => new Date().toISOString().slice(0, 10);

/* ---------- endereços de retorno permitidos (RFC 8252 + os conectores do claude.ai) ----------
   Só: o próprio computador (localhost, 127.0.0.1, [::1], qualquer porta, qualquer caminho) e os endereços de retorno do claude.ai/claude.com.
   Sem isso um programa falso poderia registrar o endereço dele e receber o código de quem clicar em "Permitir". */
function redirectOk(u, env) {
  let x; try { x = new URL(String(u)); } catch { return false; }
  if (x.hash || x.username || x.password) return false;
  if (x.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname)) return true;
  if (x.protocol === 'https:' && ['claude.ai', 'claude.com'].includes(x.hostname) && /^\/api\/(?:organizations\/[\w-]+\/)?mcp\/auth_callback$/.test(x.pathname)) return true;
  const extra = String(env.CONECTOR_REDIRECTS || '').split(',').map(s => s.trim()).filter(Boolean); // endereços exatos a mais, só a dona põe (variável da Cloudflare)
  return extra.includes(String(u));
}
const loop = u => { try { const x = new URL(String(u)); return x.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname) ? x : null; } catch { return null; } };
const mesmoRetorno = (registrado, pedido) => { if (registrado === pedido) return true; const a = loop(registrado), b = loop(pedido); return !!a && !!b && a.pathname === b.pathname && a.search === b.search; }; // no próprio computador a porta muda a cada conexão
const origemMcpOk = (origin, env) => { // navegador falando com o MCP (inspetor, claude.ai): só origens conhecidas. Programas sem navegador não mandam Origin.
  if (!origin) return true;
  if (/^https:\/\/(?:[\w-]+\.)?claude\.(?:ai|com)$/.test(origin) || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) return true;
  const o = String(env.ORIGENS || '').split(',').map(s => semBarra(s.trim())).filter(Boolean); return o.includes('*') || o.includes(origin);
};

/* ---------- respostas ---------- */
const NS = { 'cache-control': 'no-store', pragma: 'no-cache' };
const resp = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...NS, ...extra } });
const CORS_PUBLICO = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, mcp-protocol-version', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-max-age': '86400' };
const erroOauth = (codigo, descricao, status = 400, extra = {}) => resp({ error: codigo, error_description: descricao }, status, { ...CORS_PUBLICO, ...extra });
const paginaErro = (msg, status = 400) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conector do Cérebro</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:0 20px;color:#222"><h1 style="font-size:22px">Não deu para conectar</h1><p>${String(msg).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</p><p>Volte ao Claude e tente conectar de novo.</p>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...NS } });

/* ---------- banco: as tabelas do conector (criadas na primeira vez; ao lado das do Cérebro, sem mexer nelas) ---------- */
const CN = { prep: false };
async function cnPrepara(db) {
  if (CN.prep) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS cerebro_oauth_cliente (id TEXT PRIMARY KEY, nome TEXT, redirects TEXT NOT NULL, em INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS cerebro_oauth_cod (h TEXT PRIMARY KEY, cliente TEXT NOT NULL, redirect TEXT NOT NULL, challenge TEXT NOT NULL, dono TEXT NOT NULL, pid TEXT NOT NULL, pessoa TEXT, rotulo TEXT, adm INTEGER NOT NULL DEFAULT 0, exp INTEGER NOT NULL, usado INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS cerebro_conexao (h TEXT PRIMARY KEY, cliente TEXT, cliente_nome TEXT, rotulo TEXT, pessoa TEXT, dono TEXT NOT NULL, pid TEXT NOT NULL, adm INTEGER NOT NULL DEFAULT 0, em INTEGER NOT NULL, ultimo INTEGER, revogada INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE INDEX IF NOT EXISTS cerebro_conexao_dono ON cerebro_conexao (dono, em)'),
    db.prepare('CREATE TABLE IF NOT EXISTS cerebro_oauth_tok (h TEXT PRIMARY KEY, tipo TEXT NOT NULL, conexao TEXT NOT NULL, exp INTEGER NOT NULL, usado INTEGER NOT NULL DEFAULT 0, pai TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS cerebro_oauth_tok_conexao ON cerebro_oauth_tok (conexao)'),
  ]); CN.prep = true;
}
const limpaVelhos = db => db.batch([db.prepare('DELETE FROM cerebro_oauth_cod WHERE exp < ?').bind(Date.now() - 3600e3), db.prepare('DELETE FROM cerebro_oauth_tok WHERE exp < ?').bind(Date.now() - 7 * 864e5)]).catch(() => { });

/* ---------- quem pode entrar: a lista viva do Estúdio (o mesmo rigor do login), guardada 60 s ---------- */
const PES = { t: 0, m: null };
async function cnPessoas(env, d) {
  if (PES.m && Date.now() - PES.t < 60e3) return PES.m;
  const emails = new Set([...d.baseFixa(env), ...(await d.extrasAcesso(env)).map(x => String(x.email || '').toLowerCase())].filter(Boolean));
  const adms = new Set(String(env.ADMINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  const m = new Map(); for (const e of emails) m.set(await d.permId(e), { adm: adms.has(e) }); // ADM só vale se a pessoa também pode entrar
  PES.m = m; PES.t = Date.now(); return m;
}
// a pessoa (pelo id de permissões) ainda pode entrar? é ADM? o cargo dela inclui o Cérebro?
async function cnPessoa(env, d, pid) {
  const p = (await cnPessoas(env, d)).get(pid); if (!p) return null;
  const m = await d.permModelo(env); if (m && d.permBloq(d.permSem(m, pid, p.adm), 'cerebro')) return null;
  return { adm: p.adm };
}

/* ---------- token de acesso → quem está chamando ---------- */
async function cnAcesso(env, d, token) {
  if (!/^cbt_[A-Za-z0-9_-]{30,80}$/.test(token || '')) return null;
  await cnPrepara(env.EQUIPE_DB);
  const r = await env.EQUIPE_DB.prepare("SELECT c.h AS conexao, c.pessoa, c.rotulo, c.cliente_nome, c.dono, c.pid FROM cerebro_oauth_tok t JOIN cerebro_conexao c ON c.h = t.conexao WHERE t.h = ? AND t.tipo = 'a' AND t.exp > ? AND c.revogada = 0").bind(await hTok(token), Date.now()).first();
  if (!r) return null;
  const p = await cnPessoa(env, d, r.pid); if (!p) return null;
  const rot = limpa(r.rotulo || r.cliente_nome, 30), pes = limpa(r.pessoa, 40) || 'alguém da equipe';
  return { conexao: r.conexao, adm: p.adm, nome: pes, iaNome: limpa(`${pes} (conector${rot ? ': ' + rot : ''})`, 60) };
}

/* ---------- emite o par de tokens de uma conexão ---------- */
async function emiteTokens(db, conexao, pai = null) {
  const a = PREFIXO.acesso + alea(32), r = PREFIXO.renova + alea(32), agora = Date.now();
  await db.batch([
    db.prepare("INSERT INTO cerebro_oauth_tok (h, tipo, conexao, exp, usado) VALUES (?, 'a', ?, ?, 0)").bind(await hTok(a), conexao, agora + TOKEN_ACESSO_S * 1000),
    db.prepare("INSERT INTO cerebro_oauth_tok (h, tipo, conexao, exp, usado, pai) VALUES (?, 'r', ?, ?, 0, ?)").bind(await hTok(r), conexao, agora + TOKEN_RENOVA_S * 1000, pai),
    db.prepare('UPDATE cerebro_conexao SET ultimo = ? WHERE h = ?').bind(agora, conexao),
  ]);
  return { access_token: a, token_type: 'Bearer', expires_in: TOKEN_ACESSO_S, refresh_token: r, scope: ESCOPO };
}

/* ======================= OAuth ======================= */
function metadados(base) {
  const recurso = base + '/cerebro/mcp';
  return {
    recurso: { resource: recurso, authorization_servers: [base], scopes_supported: [ESCOPO], bearer_methods_supported: ['header'], resource_name: SERVIDOR_INFO.title },
    servidor: {
      issuer: base, authorization_endpoint: base + '/cerebro/oauth/autorizar', token_endpoint: base + '/cerebro/oauth/token', registration_endpoint: base + '/cerebro/oauth/registrar', revocation_endpoint: base + '/cerebro/oauth/revogar',
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'], scopes_supported: [ESCOPO], authorization_response_iss_parameter_supported: true,
    },
  };
}
async function lerCorpoOauth(req) { // aceita formulário (padrão do OAuth) ou JSON
  const t = await req.text(); if (t.length > 20000) return null;
  if (/json/i.test(req.headers.get('content-type') || '')) { try { const j = JSON.parse(t); return j && typeof j === 'object' ? j : null; } catch { return null; } }
  return Object.fromEntries(new URLSearchParams(t));
}

async function registrar(req, env) {
  const db = env.EQUIPE_DB; await cnPrepara(db);
  let b; try { b = await req.json(); } catch { return erroOauth('invalid_client_metadata', 'O pedido de registro veio com defeito.'); }
  const uris = Array.isArray(b?.redirect_uris) ? b.redirect_uris.map(String) : [];
  if (!uris.length || uris.length > 8) return erroOauth('invalid_redirect_uri', 'Mande de 1 a 8 redirect_uris.');
  const ruim = uris.find(u => !redirectOk(u, env)); if (ruim) return erroOauth('invalid_redirect_uri', 'Endereço de retorno não permitido neste servidor (só o próprio computador, claude.ai e claude.com).');
  const met = b.token_endpoint_auth_method; if (met && met !== 'none') return erroOauth('invalid_client_metadata', 'Só clientes públicos (token_endpoint_auth_method = none).');
  const gt = Array.isArray(b.grant_types) ? b.grant_types : ['authorization_code']; if (gt.some(g => !['authorization_code', 'refresh_token'].includes(g))) return erroOauth('invalid_client_metadata', 'Tipo de concessão não aceito.');
  const total = (await db.prepare('SELECT count(*) AS n, sum(em > ?) AS rec FROM cerebro_oauth_cliente').bind(Date.now() - 60e3).first()) || {};
  if ((total.rec || 0) >= (+env.CONECTOR_REGISTROS_POR_MIN || 30)) return erroOauth('temporarily_unavailable', 'Registros demais agora. Tente de novo em um minuto.', 429);
  if ((total.n || 0) >= MAX_CLIENTES) await db.prepare('DELETE FROM cerebro_oauth_cliente WHERE id IN (SELECT id FROM cerebro_oauth_cliente WHERE id NOT IN (SELECT DISTINCT cliente FROM cerebro_conexao WHERE cliente IS NOT NULL) ORDER BY em LIMIT 100)').run();
  const id = 'cbc_' + alea(18), nome = limpa(b.client_name, 60) || 'Programa sem nome', em = Math.floor(Date.now() / 1000);
  await db.prepare('INSERT INTO cerebro_oauth_cliente (id, nome, redirects, em) VALUES (?, ?, ?, ?)').bind(id, nome, JSON.stringify(uris), Date.now()).run();
  return resp({ client_id: id, client_id_issued_at: em, client_name: nome, redirect_uris: uris, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: ESCOPO }, 201, CORS_PUBLICO);
}
const cliente = async (db, id) => { if (!/^cbc_[A-Za-z0-9_-]{10,40}$/.test(id || '')) return null; const r = await db.prepare('SELECT id, nome, redirects FROM cerebro_oauth_cliente WHERE id = ?').bind(id).first(); return r ? { id: r.id, nome: r.nome, redirects: JSON.parse(r.redirects) } : null; };

// confere o pedido de autorização (usado no /autorizar e no /aprovar). Devolve { c } ou { erro }.
async function confereAutorizacao(db, env, base, p) {
  const c = await cliente(db, p.client_id); if (!c) return { erro: 'Este programa não está registrado (client_id desconhecido). Volte ao Claude e conecte de novo.' };
  if (!c.redirects.some(r => mesmoRetorno(r, p.redirect_uri)) || !redirectOk(p.redirect_uri, env)) return { erro: 'Endereço de retorno diferente do registrado.' };
  if (p.response_type && p.response_type !== 'code') return { c, erro: 'Só response_type=code.', redirecionar: 'unsupported_response_type' };
  if (!p.code_challenge || p.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(p.code_challenge)) return { c, erro: 'Falta o PKCE (code_challenge com S256).', redirecionar: 'invalid_request' };
  if (p.resource && semBarra(p.resource) !== base + '/cerebro/mcp') return { c, erro: 'O recurso pedido não é este servidor.', redirecionar: 'invalid_target' };
  return { c };
}
const voltaPara = (uri, base, extra) => { const u = new URL(uri); for (const [k, v] of Object.entries(extra)) if (v != null && v !== '') u.searchParams.set(k, v); u.searchParams.set('iss', base); return u.toString(); };

async function autorizar(req, env, base) { // GET: confere e manda para a tela de permissão do site (onde mora o login do Google)
  const db = env.EQUIPE_DB; await cnPrepara(db); const q = new URL(req.url).searchParams, p = Object.fromEntries(q);
  const r = await confereAutorizacao(db, env, base, p);
  if (r.erro) return r.c && r.redirecionar ? new Response(null, { status: 302, headers: { location: voltaPara(p.redirect_uri, base, { error: r.redirecionar, error_description: r.erro, state: p.state }), ...NS } }) : paginaErro(r.erro);
  const pagina = new URL(env.CONECTAR_URL || 'https://estudio.problemsraiz.workers.dev/cerebro/conectar.html'); // o destino é fixo: nunca vem do pedido
  for (const k of ['client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'resource', 'scope']) if (p[k]) pagina.searchParams.set(k, String(p[k]).slice(0, 2000));
  pagina.searchParams.set('programa', r.c.nome); pagina.searchParams.set('servidor', base);
  return new Response(null, { status: 302, headers: { location: pagina.toString(), ...NS } });
}

async function infoCliente(req, env) { // a tela de permissão pergunta aqui quem está pedindo (nome e destino vêm do registro, nunca da barra de endereço)
  const db = env.EQUIPE_DB; await cnPrepara(db); const q = new URL(req.url).searchParams, c = await cliente(db, q.get('client_id')), ru = q.get('redirect_uri');
  if (!c || !ru || !c.redirects.some(r => mesmoRetorno(r, ru)) || !redirectOk(ru, env)) return erroOauth('invalid_request', 'Pedido de conexão inválido ou de um programa desconhecido. Volte ao Claude e conecte de novo.', 404);
  const x = loop(ru); return resp({ nome: c.nome, destino: x ? 'este computador (' + x.hostname + ')' : new URL(ru).hostname }, 200, CORS_PUBLICO);
}

async function aprovar(req, env, d, base, cors) { // POST da tela do site: login do Google conferido pelo servidor → código de autorização
  const db = env.EQUIPE_DB; await cnPrepara(db);
  const origin = req.headers.get('origin') || '', origens = String(env.ORIGENS || '*').split(',').map(s => semBarra(s.trim())).filter(Boolean);
  if (!origin || !(origens.includes('*') || origens.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) return resp({ error: { type: 'origem', message: 'Esta tela não está liberada para conectar.' } }, 403, cors);
  let b; try { b = await req.json(); } catch { return resp({ error: { type: 'pedido', message: 'O pedido veio com defeito.' } }, 400, cors); }
  const r = await confereAutorizacao(db, env, base, b); if (r.erro && !(r.c && b.negar)) return resp({ error: { type: 'pedido', message: r.erro } }, 400, cors);
  if (b.negar) return resp({ redirect: voltaPara(b.redirect_uri, base, { error: 'access_denied', error_description: 'A pessoa não permitiu.', state: b.state }) }, 200, cors);
  const login = await d.confereLogin(req, env); // o MESMO login do menu: token do Google conferido no servidor + lista de e-mails
  if (!login.ok || !login.email) return resp({ error: { type: 'login', message: login.motivo || 'Entre com a sua conta do Google no menu do Estúdio e tente de novo.' } }, 401, cors);
  if (!(await d.pode(env, login.email, 'cerebro'))) return resp({ error: { type: 'permissao', message: 'O seu cargo não inclui o Cérebro. Peça para um ADM liberar.' } }, 403, cors);
  const pid = await d.permId(login.email), dono = (await d.semEmail({ por: login.email })).por, adm = d.ehAdmin(env, login.email) ? 1 : 0;
  const ativas = await db.prepare('SELECT count(*) AS n FROM cerebro_conexao WHERE dono = ? AND revogada = 0').bind(dono).first();
  if ((ativas?.n || 0) >= MAX_CONEXOES_PESSOA) return resp({ error: { type: 'limite', message: `Você já tem ${MAX_CONEXOES_PESSOA} conexões ativas. Revogue as que não usa em Cérebro › Acesso das IAs.` } }, 429, cors);
  const codigo = PREFIXO.codigo + alea(32);
  await db.prepare('INSERT INTO cerebro_oauth_cod (h, cliente, redirect, challenge, dono, pid, pessoa, rotulo, adm, exp, usado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)')
    .bind(await hTok(codigo), r.c.id, b.redirect_uri, b.code_challenge, dono, pid, limpa(login.nome, 80) || 'Alguém da equipe', limpa(b.rotulo, 60) || null, adm, Date.now() + CODIGO_S * 1000).run();
  return resp({ redirect: voltaPara(b.redirect_uri, base, { code: codigo, state: b.state }) }, 200, cors);
}

async function token(req, env, d, base) {
  const db = env.EQUIPE_DB; await cnPrepara(db); const p = await lerCorpoOauth(req); if (!p) return erroOauth('invalid_request', 'Pedido ilegível.');
  const c = await cliente(db, p.client_id); if (!c) return erroOauth('invalid_client', 'client_id desconhecido.', 401);
  if (p.resource && semBarra(p.resource) !== base + '/cerebro/mcp') return erroOauth('invalid_target', 'O recurso pedido não é este servidor.');
  if (p.grant_type === 'authorization_code') {
    if (!/^cbk_[A-Za-z0-9_-]{30,80}$/.test(p.code || '') || !p.code_verifier || !/^[A-Za-z0-9\-._~]{43,128}$/.test(p.code_verifier)) return erroOauth('invalid_grant', 'Código ou code_verifier inválido.');
    // atômico: marca como usado e devolve a linha; um código só vale uma vez
    const k = await db.prepare('UPDATE cerebro_oauth_cod SET usado = 1 WHERE h = ? AND usado = 0 AND exp > ? RETURNING cliente, redirect, challenge, dono, pid, pessoa, rotulo, adm').bind(await hTok(p.code), Date.now()).first();
    if (!k || k.cliente !== c.id) return erroOauth('invalid_grant', 'Código inválido, vencido ou já usado. Conecte de novo.');
    if (!p.redirect_uri || p.redirect_uri !== k.redirect) return erroOauth('invalid_grant', 'redirect_uri diferente do pedido de autorização.');
    if (!trocaTempoFixo(await pkce(p.code_verifier), k.challenge)) return erroOauth('invalid_grant', 'PKCE não confere.');
    if (!(await cnPessoa(env, d, k.pid))) return erroOauth('invalid_grant', 'Esta conta não pode mais usar o Cérebro.');
    const conexao = await hash('conexao:' + alea(24));
    await db.prepare('INSERT INTO cerebro_conexao (h, cliente, cliente_nome, rotulo, pessoa, dono, pid, adm, em, ultimo, revogada) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)').bind(conexao, c.id, c.nome, k.rotulo, k.pessoa, k.dono, k.pid, k.adm, Date.now(), Date.now()).run();
    await limpaVelhos(db); return resp(await emiteTokens(db, conexao), 200, { ...CORS_PUBLICO });
  }
  if (p.grant_type === 'refresh_token') {
    if (!/^cbr_[A-Za-z0-9_-]{30,80}$/.test(p.refresh_token || '')) return erroOauth('invalid_grant', 'Token de renovação inválido.');
    const h = await hTok(p.refresh_token), agora = Date.now();
    const t = await db.prepare("SELECT t.conexao, t.exp, t.usado, t.pai, c.cliente, c.pid, c.revogada FROM cerebro_oauth_tok t JOIN cerebro_conexao c ON c.h = t.conexao WHERE t.h = ? AND t.tipo = 'r'").bind(h).first();
    if (!t || t.cliente !== c.id || t.revogada || t.exp < agora) return erroOauth('invalid_grant', 'Token de renovação inválido ou vencido. Conecte de novo.');
    if (t.usado) { // um token já gasto voltou: pode ter sido copiado. Derruba a conexão inteira.
      await db.prepare('UPDATE cerebro_conexao SET revogada = 1 WHERE h = ?').bind(t.conexao).run(); return erroOauth('invalid_grant', 'Este token de renovação já foi usado. Por segurança a conexão foi encerrada: conecte de novo.'); }
    if (!(await cnPessoa(env, d, t.pid))) return erroOauth('invalid_grant', 'Esta conta não pode mais usar o Cérebro.');
    // este token continua valendo até o NOVO ser usado (se a resposta se perder no caminho, dá para tentar de novo); quando um filho é usado, o pai é gasto
    const novo = await emiteTokens(db, t.conexao, h); if (t.pai) await db.prepare('UPDATE cerebro_oauth_tok SET usado = ? WHERE h = ? AND usado = 0').bind(agora, t.pai).run();
    await limpaVelhos(db); return resp(novo, 200, { ...CORS_PUBLICO });
  }
  return erroOauth('unsupported_grant_type', 'Use authorization_code ou refresh_token.');
}

async function revogarPeloPrograma(req, env) { // RFC 7009: sempre responde 200
  const db = env.EQUIPE_DB; await cnPrepara(db); const p = await lerCorpoOauth(req), t = String(p?.token || '');
  if (/^cb[tr]_[A-Za-z0-9_-]{30,80}$/.test(t)) { const r = await db.prepare('SELECT conexao FROM cerebro_oauth_tok WHERE h = ?').bind(await hTok(t)).first(); if (r) await db.prepare('UPDATE cerebro_conexao SET revogada = 1 WHERE h = ? AND cliente = ?').bind(r.conexao, String(p.client_id || '')).run(); }
  return new Response(null, { status: 200, headers: { ...NS, ...CORS_PUBLICO } });
}

/* ---------- a aba "Acesso das IAs" do Cérebro: lista e revoga também as conexões do conector ---------- */
export async function cnListar(db, { adm, dono }) {
  await cnPrepara(db);
  const { results } = adm ? await db.prepare('SELECT h, cliente_nome, rotulo, pessoa, em, ultimo, adm, revogada FROM cerebro_conexao ORDER BY em DESC LIMIT 100').all()
    : await db.prepare('SELECT h, cliente_nome, rotulo, pessoa, em, ultimo, adm, revogada FROM cerebro_conexao WHERE dono = ? ORDER BY em DESC LIMIT 50').bind(dono).all();
  return (results || []).map(x => ({ h: x.h, nome: 'Conector · ' + (x.rotulo || x.cliente_nome || 'Claude'), em: x.em, ultimo: x.ultimo, por: x.pessoa || 'Alguém da equipe', revogada: x.revogada, adm: x.adm, tipo: 'conector' }));
}
export async function cnRevogar(db, h, { adm, dono }) { // devolve 'ok', 'nao_achei' ou 'adm' (sem permissão)
  await cnPrepara(db); const r = await db.prepare('SELECT dono FROM cerebro_conexao WHERE h = ?').bind(String(h || '')).first();
  if (!r) return 'nao_achei'; if (!adm && r.dono !== dono) return 'adm';
  await db.prepare('UPDATE cerebro_conexao SET revogada = 1 WHERE h = ?').bind(String(h)).run(); return 'ok';
}

/* ======================= MCP ======================= */
// O texto das regras que o Claude recebe ao conectar (campo "instructions"). A frase de escopo é IGUAL à do AVISO_FIXO do cerebro.mjs (o teste confere).
export const CB_ESCOPO = 'CÉREBRO DO ESTÚDIO PROBLEMS: SÓ para tarefas do Estúdio (os programas do site estudio.problemsraiz.workers.dev, como Animador, Ateliê, Editor, Shorts, Preparativos, Publicações e Cérebro; os personagens, as animações, os Shorts e os vídeos do canal, inclusive os Shorts de Minecraft feitos no Estúdio; e os repositórios do Estúdio, a pasta ep). FORA DISSO (outro site, Minecraft direto, como mods, mundo ou a skill minecraft-cinematic, ou qualquer outro assunto) NÃO leia, NÃO grave e NÃO cite o Cérebro. Na dúvida se é do Estúdio, pergunte.';
const CB_REGRAS = ' Quando for do Estúdio: chame a ferramenta `comece` (ou leia o que ela traz) e use o Cérebro como base. Ferramentas: comece, indice, buscar, ler, salvar, aprender, renomear, pedidos, feito. ANTES DE MUDAR QUALQUER COISA do Estúdio: leia no Cérebro a página do programa (indice e ler). DEPOIS, grave o que mudou ou aprendeu (salvar ou aprender, com resumo de até 160 letras, `pedidoPor` = quem pediu e `ia` = qual IA gravou). Toda IA da equipe grava direto (a de quem não é ADM entra na hora e os ADMs revisam). Nunca grave senha, chave, token nem e-mail. Vale mesmo que ninguém tenha citado o Cérebro. Nas respostas de tarefa do Estúdio, cite o Cérebro no fim, destacado numa linha própria em formato de citação: "> 🧠 **Cérebro:** consultei <Pasta/Arquivo>" (e "· gravei <Pasta/Arquivo>", se gravou), ou "> 🧠 **Cérebro:** nada sobre isso".';
const instrucoes = quem => `${CB_ESCOPO}${CB_REGRAS} Esta conexão é de ${quem.nome}${quem.adm ? ' (ADM: grava direto, sem revisão)' : ' (não é ADM: suas gravações entram na hora e os ADMs revisam na aba Revisar)'}; em pedidoPor use o nome de quem pediu a tarefa (normalmente ${quem.nome}).`;

const REG = { // os três campos de toda gravação
  ia: { type: 'string', description: 'Nome e modelo desta IA que está gravando, ex.: "Claude Sonnet 5.5". Obrigatório em toda gravação.' },
  pedidoPor: { type: 'string', description: 'Quem pediu esta tarefa (o nome da pessoa na conversa). Se a própria IA percebeu, o nome de quem estava na conversa.' },
  motivo: { type: 'string', description: 'O que mudou e por quê, em uma ou duas frases.' },
};
const MARCAS = ['guia', 'biblia', 'skill', 'memoria', 'regra', 'decisao', 'evitar', 'referencia', 'aprendizado'];
const PASTAS = { evitar: 'A evitar', aprendizado: 'Aprendizados', referencia: 'Referências', regra: 'Regras' };
const LER_PARTE = 40000; // letras por parte do `ler` (o Claude Code corta respostas grandes; assim nada é cortado em silêncio)
const sch = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (v, n) => String(v ?? '').slice(0, n);

const FERRAMENTAS = [
  { nome: 'comece', titulo: 'Começar no Cérebro', so: true, esquema: sch({}),
    descricao: 'Abre o Cérebro do Estúdio Problems: as regras, as pastas, as memórias rápidas, os pedidos novos e o guia "Leia primeiro". Chame uma vez no começo de toda tarefa do Estúdio.' },
  { nome: 'indice', titulo: 'Índice do Cérebro', so: true,
    esquema: sch({ pasta: { type: 'string', description: 'Opcional: o nome de uma pasta de cima (ex.: "Programas", "Regras", "Skills", "Bíblias") para listar o que há dentro, com os resumos. Sem isso, lista só as pastas.' } }),
    descricao: 'Lista as pastas do Cérebro (sem `pasta`) ou os arquivos de uma pasta, com o resumo de cada um. Comece pela pasta que serve para a tarefa; não leia tudo.' },
  { nome: 'buscar', titulo: 'Buscar no Cérebro', so: true,
    esquema: sch({ palavras: { type: 'string', description: 'As palavras a procurar, ex.: "exportar legenda animador".' }, quantos: { type: 'integer', minimum: 1, maximum: 10, description: 'Quantos trechos devolver (padrão 8).' } }, ['palavras']),
    descricao: 'Busca por trechos em todo o Cérebro e devolve o caminho de cada página, o título e um pedaço. Depois abra a página inteira com `ler`.' },
  { nome: 'ler', titulo: 'Ler uma página do Cérebro', so: true,
    esquema: sch({ caminho: { type: 'string', description: 'Pasta/Arquivo, ex.: "Programas/Animador".' }, parte: { type: 'integer', minimum: 1, description: 'Só para páginas grandes: qual parte ler (cada parte tem ~40 mil letras). Padrão 1.' } }, ['caminho']),
    descricao: 'Mostra uma página inteira do Cérebro, com a versão (guarde-a: é o `base` para mudar a página com `salvar`). Em página grande vem por partes: nunca reescreva uma página que você não leu inteira; use `acrescentar`.' },
  { nome: 'salvar', titulo: 'Gravar uma página no Cérebro', so: false,
    esquema: sch({
      caminho: { type: 'string', description: 'Pasta/Arquivo. Pastas que não existem são criadas.' },
      corpo: { type: 'string', description: 'O texto inteiro da página (substitui o que existe). Use `corpo` OU `acrescentar`, nunca os dois.' },
      acrescentar: { type: 'string', description: 'Texto a somar no fim da página existente; não precisa de `base`. É o jeito mais seguro de mudar página que já existe.' },
      base: { type: 'integer', description: 'A versão que você leu (de `ler`). Obrigatória para trocar o `corpo` de página que já existe: se outra pessoa gravou no meio, o servidor recusa e nada é perdido.' },
      resumo: { type: 'string', description: 'Resumo da página em até 160 letras (obrigatório para página nova).' },
      marca: { type: 'string', enum: MARCAS, description: 'Marca da página (guia, biblia, skill, memoria, regra, decisao, evitar, referencia, aprendizado).' },
      tipo: { type: 'string', enum: ['texto', 'referencia'], description: 'Padrão texto. `referencia` precisa de `url` ou de texto.' },
      url: { type: 'string', description: 'Link http(s) para o tipo referencia.' }, ...REG,
    }, ['caminho', 'ia', 'pedidoPor', 'motivo']),
    descricao: 'Grava ou muda uma página do Cérebro. Antes de mudar uma página que existe, leia com `ler` e mande a versão em `base` (ou use `acrescentar`). Nada é apagado: cada mudança vira uma versão. O servidor recusa segredos (chaves, tokens, senhas) e mascara e-mails. Quem não é ADM grava direto e os ADMs revisam.' },
  { nome: 'aprender', titulo: 'Registrar um aprendizado', so: false,
    esquema: sch({
      tipo: { type: 'string', enum: ['evitar', 'aprendizado', 'referencia', 'regra'], description: 'evitar = o que já deu errado; aprendizado = o que foi aprendido; referencia = um link ou material de base; regra = uma regra nova.' },
      assunto: { type: 'string', description: 'Título curto (vira o nome da página, com a data de hoje na frente).' },
      texto: { type: 'string', description: 'O conteúdo: o que aconteceu, por quê e o que fazer.' },
      resumo: { type: 'string', description: 'Resumo em até 160 letras.' }, url: { type: 'string', description: 'Link http(s), para o tipo referencia.' }, ...REG,
    }, ['tipo', 'assunto', 'texto', 'ia', 'pedidoPor', 'motivo']),
    descricao: 'Cria a página na pasta certa (A evitar, Aprendizados, Referências ou Regras) com a data de hoje. Use sempre que alguém disser o que evitar, o que aprender, mostrar uma referência ou ditar uma regra.' },
  { nome: 'renomear', titulo: 'Renomear uma página', so: false,
    esquema: sch({ caminho: { type: 'string', description: 'Pasta/Arquivo atual.' }, nomeNovo: { type: 'string', description: 'O nome novo (só o nome, sem a pasta).' }, ...REG }, ['caminho', 'nomeNovo', 'ia', 'pedidoPor', 'motivo']),
    descricao: 'Muda só o nome de uma página; o conteúdo e o histórico ficam.' },
  { nome: 'pedidos', titulo: 'Pedidos esperando', so: true, esquema: sch({}),
    descricao: 'Lista os pedidos novos que a equipe deixou no Cérebro (para aprender, evitar, corrigir ou guardar uma referência).' },
  { nome: 'feito', titulo: 'Marcar um pedido', so: false,
    esquema: sch({ id: { type: 'string', description: 'O id do pedido (de `pedidos`).' }, estado: { type: 'string', enum: ['feito', 'recusado', 'novo'], description: 'Padrão feito.' }, nota: { type: 'string', description: 'Onde ficou ou por que foi recusado.' }, ia: REG.ia, pedidoPor: REG.pedidoPor }, ['id', 'ia', 'pedidoPor']),
    descricao: 'Marca um pedido como feito (ou recusado) e diz onde ficou.' },
];

// chama o próprio Cérebro (a MESMA função das chaves): as permissões e as regras de gravação são as de sempre
async function chama(env, d, quem, rota, corpo) {
  const login = { ok: true, ia: true, iaAdm: !!quem.adm, iaNome: quem.iaNome, conector: true };
  const req = new Request('https://interno.invalid/cerebro' + rota, { method: corpo ? 'POST' : 'GET', headers: corpo ? { 'content-type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
  const r = await d.cerebro(req, env, login, '/cerebro' + rota.split('?')[0], {}), texto = await r.text(); let j = null; try { j = JSON.parse(texto); } catch { }
  return { ok: r.ok, status: r.status, j, texto };
}
const falha = r => { const m = (r.j?.error?.message || ('O servidor respondeu ' + r.status)); const f = new Error(m + (r.status === 409 ? '\nNADA FOI GRAVADO. Leia a página de novo com `ler`, veja a versão e grave de novo com `base` igual a ela (ou use `acrescentar`).' : '')); f.tool = true; return f; };
const dado = async (env, d, quem, rota, corpo) => { const r = await chama(env, d, quem, rota, corpo); if (!r.ok) throw falha(r); return r; };
const reg = a => { for (const k of ['ia', 'pedidoPor', 'motivo']) if (!String(a[k] || '').trim()) { const e = new Error(`Falta o campo "${k}": toda gravação diz qual IA gravou (ia), quem pediu (pedidoPor) e o que mudou e por quê (motivo).`); e.tool = true; throw e; } return { ia: str(a.ia, 80), pedidoPor: str(a.pedidoPor, 80), motivo: str(a.motivo, 600) }; };
const aviso = j => (j?.aviso ? `\n(${j.aviso})` : '');
const camInvalido = c => { const s = String(c || '').trim(); if (!s) { const e = new Error('Diga o caminho: Pasta/Arquivo.'); e.tool = true; throw e; } return s.slice(0, 600); };

const EXECUTA = {
  async comece(a, env, d, quem) {
    const j = (await dado(env, d, quem, '/comece')).j, cart = await cartoes(env);
    return [CB_ESCOPO + CB_REGRAS, j.pedidosNovos ? `\nHá ${j.pedidosNovos} pedido(s) esperando no Cérebro (ferramenta pedidos).` : '', `\nPastas: ${(j.pastas || []).join(' · ')}`,
      cart.length ? '\n\nMemórias rápidas (o que vale sempre; cada uma aponta para a página completa):\n' + cart.map(c => `- ${c.texto}${c.aponta ? ' → ' + c.aponta : ''}`).join('\n') : '', '\n\n' + String(j.texto || '').slice(0, 7000)].join('');
  },
  async indice(a, env, d, quem) {
    const j = (await dado(env, d, quem, '/leve')).j, itens = (j.itens || []), mapa = new Map(itens.map(x => [x.id, x]));
    const cam = x => { const o = []; for (let y = x, i = 0; y && i < 20; y = mapa.get(y.pai), i++) { if (y.apagado) return null; o.unshift(y.nome); } return o.join('/'); };
    const arqs = itens.filter(x => x.tipo !== 'pasta').map(x => [cam(x), x]).filter(([c]) => c).sort((p, q) => p[0].localeCompare(q[0], 'pt-BR', { numeric: true }));
    const pasta = String(a.pasta || '').trim().replace(/\/+$/, '');
    if (!pasta) { const topo = itens.filter(x => x.tipo === 'pasta' && !x.pai && !x.apagado).sort((p, q) => p.nome.localeCompare(q.nome, 'pt-BR', { numeric: true }));
      return `Pastas do Cérebro (${arqs.length} arquivos). Para ver o que há dentro, chame indice com pasta:\n` + topo.map(t => `- ${t.nome} (${arqs.filter(([c]) => c.startsWith(t.nome + '/')).length}): ${t.resumo || ''}`.trimEnd()).join('\n'); }
    const lin = arqs.filter(([c]) => c === pasta || c.startsWith(pasta + '/')); if (!lin.length) { const e = new Error(`Não achei arquivos em "${pasta}". Chame indice sem pasta para ver as pastas.`); e.tool = true; throw e; }
    return `${lin.length} arquivo(s) em ${pasta}. Para abrir: ler com o caminho.\n` + lin.slice(0, 400).map(([c, x]) => `- ${c}${x.marca ? ' (' + x.marca + ')' : ''}${x.resumo ? ': ' + x.resumo : ''}`).join('\n') + (lin.length > 400 ? `\n… (mais ${lin.length - 400}; use buscar para achar o que precisa)` : '');
  },
  async buscar(a, env, d, quem) {
    const q = str(a.palavras, 200).trim(); if (q.length < 2) { const e = new Error('Escreva pelo menos 2 letras para buscar.'); e.tool = true; throw e; }
    const n = Math.min(Math.max(+a.quantos || 8, 1), 10); let tr = await chama(env, d, quem, '/trechos?n=' + n + '&q=' + encodeURIComponent(q));
    if (tr.ok && Array.isArray(tr.j?.itens)) return tr.j.itens.length ? tr.j.itens.map(x => `- ${x.caminho}${x.titulo ? ' › ' + x.titulo : ''}: ${String(x.trecho || '').replace(/\*\*/g, '').replace(/\s+/g, ' ')}`).join('\n') : 'Nada encontrado.';
    const r = await dado(env, d, quem, '/buscar?q=' + encodeURIComponent(q)); return r.j.itens.length ? r.j.itens.map(x => `- ${x.nome} [${x.id}]: ${String(x.trecho || x.resumo || '').replace(/\s+/g, ' ')}`).join('\n') : 'Nada encontrado.';
  },
  async ler(a, env, d, quem) {
    const { j } = await dado(env, d, quem, '/item?caminho=' + encodeURIComponent(camInvalido(a.caminho))), x = j.item, corpo = String(x.corpo || ''), partes = Math.max(1, Math.ceil(corpo.length / LER_PARTE)), p = Math.min(Math.max(+a.parte || 1, 1), partes);
    const cab = `# ${x.nome} (versão ${x.ver}, tipo ${x.tipo}${x.marca ? ', marca ' + x.marca : ''})${x.url ? '\nLink: ' + x.url : ''}${x.img ? '\nImagem: ' + x.img : ''}\nÚltima mudança: ${x.por}${x.pedido ? ', a pedido de ' + x.pedido : ''}, ${(j.versoes || []).length} versão(ões) no histórico`;
    if (partes === 1) return `${cab}\n\n${corpo}`;
    return `${cab}\n\nPÁGINA GRANDE: parte ${p} de ${partes} (${corpo.length} letras no total). Para mudar esta página NÃO reescreva o corpo: use salvar com acrescentar.${p < partes ? ` Para continuar: ler com parte ${p + 1}.` : ' Fim da página.'}\n\n${corpo.slice((p - 1) * LER_PARTE, p * LER_PARTE)}`;
  },
  async salvar(a, env, d, quem) {
    const r0 = reg(a); if (a.corpo != null && a.acrescentar != null) { const e = new Error('Use `corpo` OU `acrescentar`, nunca os dois (juntar os dois pode apagar a página).'); e.tool = true; throw e; }
    if (a.corpo == null && a.acrescentar == null) { const e = new Error('Mande `corpo` (a página inteira) ou `acrescentar` (texto a somar no fim).'); e.tool = true; throw e; }
    const { j } = await dado(env, d, quem, '/salvar', { caminho: camInvalido(a.caminho), tipo: a.tipo || 'texto', ...(a.corpo != null ? { corpo: String(a.corpo) } : { acrescentar: String(a.acrescentar) }), ...(a.base != null ? { base: +a.base } : {}), ...(a.marca ? { marca: String(a.marca) } : {}), ...(a.resumo ? { resumo: String(a.resumo) } : {}), ...(a.url ? { url: String(a.url) } : {}), ...r0 });
    return `${j.igual ? 'Nada mudou (já estava igual).' : 'Gravado.'} id ${j.id}, versão ${j.ver}.${aviso(j)}`;
  },
  async aprender(a, env, d, quem) {
    const r0 = reg(a), t = String(a.tipo || ''); if (!PASTAS[t]) { const e = new Error('Use tipo: evitar, aprendizado, referencia ou regra.'); e.tool = true; throw e; }
    const { j } = await dado(env, d, quem, '/salvar', { caminho: `${PASTAS[t]}/${hoje()} ${String(a.assunto || '').replace(/[\/\\]+/g, '-').trim().slice(0, 100)}`, tipo: t === 'referencia' ? 'referencia' : 'texto', marca: t, corpo: String(a.texto || ''), ...(a.url ? { url: String(a.url) } : {}), ...(a.resumo ? { resumo: String(a.resumo) } : {}), ...r0 });
    return `Gravado em ${PASTAS[t]}. id ${j.id}, versão ${j.ver}.${aviso(j)}`;
  },
  async renomear(a, env, d, quem) {
    const r0 = reg(a); if (!String(a.nomeNovo || '').trim()) { const e = new Error('Diga o nome novo.'); e.tool = true; throw e; }
    const { j } = await dado(env, d, quem, '/item?caminho=' + encodeURIComponent(camInvalido(a.caminho))), x = j.item;
    const r = await dado(env, d, quem, '/salvar', { id: x.id, nome: String(a.nomeNovo), base: x.ver, ...r0 }); return `Renomeado. id ${r.j.id}, versão ${r.j.ver}.`;
  },
  async pedidos(a, env, d, quem) { const { j } = await dado(env, d, quem, '/pedidos?estado=novo'); return j.itens.length ? j.itens.map(x => `- ${x.id} (${x.tipo}) de ${x.por}${x.alvo ? ', sobre ' + x.alvo : ''}: ${x.texto}`).join('\n') : 'Nenhum pedido esperando.'; },
  async feito(a, env, d, quem) {
    const r0 = reg({ ...a, motivo: a.nota || 'pedido marcado' }); const { j } = await dado(env, d, quem, '/pedido', { id: String(a.id || ''), estado: a.estado || 'feito', nota: a.nota ? str(a.nota, 600) : undefined, ia: r0.ia, pedidoPor: r0.pedidoPor, motivo: r0.motivo }); return j.ok ? 'Pedido atualizado.' : 'Nada mudou.';
  },
};
async function cartoes(env) { try { const { results } = await env.EQUIPE_DB.prepare('SELECT texto, aponta FROM cerebro_cartao WHERE apagado = 0 ORDER BY ordem, em LIMIT 40').all(); return results || []; } catch { return []; } }

const rpcErro = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const rpcOk = (id, result) => ({ jsonrpc: '2.0', id, result });
async function rpc(m, env, d, quem) {
  if (m && typeof m === 'object' && m.method === undefined && ('result' in m || 'error' in m)) return null; // resposta do cliente a algo que o servidor pediu: não há o que responder
  if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return rpcErro(m?.id, -32600, 'Pedido JSON-RPC inválido.');
  const temId = m.id !== undefined && m.id !== null;
  if (!temId) return null; // notificações (initialized, cancelled…): sem resposta
  switch (m.method) {
    case 'initialize': { const v = m.params?.protocolVersion; return rpcOk(m.id, { protocolVersion: PROTOCOLOS.includes(v) ? v : PROTOCOLOS[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVIDOR_INFO, instructions: instrucoes(quem) }); }
    case 'ping': return rpcOk(m.id, {});
    case 'tools/list': return rpcOk(m.id, { tools: FERRAMENTAS.map(f => ({ name: f.nome, title: f.titulo, description: f.descricao, inputSchema: f.esquema, annotations: { title: f.titulo, readOnlyHint: !!f.so, destructiveHint: false, idempotentHint: !!f.so, openWorldHint: false } })) });
    case 'tools/call': {
      const f = FERRAMENTAS.find(x => x.nome === m.params?.name); if (!f) return rpcErro(m.id, -32602, `Ferramenta desconhecida: ${m.params?.name}`);
      const args = m.params?.arguments && typeof m.params.arguments === 'object' ? m.params.arguments : {};
      for (const k of f.esquema.required) if (args[k] === undefined || args[k] === null || args[k] === '') return rpcOk(m.id, { content: [{ type: 'text', text: `Falta o campo "${k}".` }], isError: true });
      await d.planoEstado(env); if (d.planoPausado()) return rpcOk(m.id, { content: [{ type: 'text', text: 'O Estúdio está pausado: o uso incluído no plano deste mês chegou ao fim. Um ADM precisa confirmar para continuar.' }], isError: true });
      try { return rpcOk(m.id, { content: [{ type: 'text', text: await EXECUTA[f.nome](args, env, d, quem) }] }); }
      catch (e) { if (e?.tool) return rpcOk(m.id, { content: [{ type: 'text', text: e.message }], isError: true }); console.log('conector: erro em', f.nome, String(e?.message || e).slice(0, 200)); return rpcOk(m.id, { content: [{ type: 'text', text: 'Erro do servidor ao usar o Cérebro. Tente de novo; se continuar, avise um ADM.' }], isError: true }); }
    }
    case 'prompts/list': return rpcOk(m.id, { prompts: [] }); case 'resources/list': return rpcOk(m.id, { resources: [] }); case 'resources/templates/list': return rpcOk(m.id, { resourceTemplates: [] });
    default: return rpcErro(m.id, -32601, 'Método não aceito: ' + m.method);
  }
}

async function mcp(req, env, d, base) {
  const origin = req.headers.get('origin') || '';
  if (!origemMcpOk(origin, env)) return resp({ error: 'origem_nao_liberada' }, 403);
  const cors = origin ? { 'access-control-allow-origin': origin, vary: 'origin', 'access-control-allow-headers': 'content-type, authorization, accept, mcp-protocol-version, mcp-session-id, last-event-id', 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-expose-headers': 'www-authenticate, mcp-session-id, mcp-protocol-version', 'access-control-max-age': '86400' } : {};
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const desafio = (erro, desc) => new Response(JSON.stringify({ error: erro || 'unauthorized', error_description: desc || 'Faça o login do Google para conectar o Cérebro.' }), { status: 401, headers: { 'content-type': 'application/json', ...NS, ...cors, 'www-authenticate': `Bearer realm="cerebro", resource_metadata="${base}/.well-known/oauth-protected-resource/cerebro/mcp", scope="${ESCOPO}"${erro ? `, error="${erro}", error_description="${desc}"` : ''}` } });
  if (!env.EQUIPE_DB) return resp({ error: 'O banco do Cérebro não está ligado neste servidor.' }, 503, cors);
  const ah = req.headers.get('authorization') || '', tk = /^Bearer\s+(\S+)$/i.exec(ah)?.[1];
  const quem = tk ? await cnAcesso(env, d, tk) : null; if (!quem) return desafio(tk ? 'invalid_token' : '', tk ? 'Token inválido, vencido ou revogado.' : '');
  const pv = req.headers.get('mcp-protocol-version'); // a revisão 2026-07-28 do MCP é outra (sem initialize): recusar com 400 faz o cliente voltar ao modo que sabemos
  if (pv && !PROTOCOLOS.includes(pv)) return resp({ error: 'versao_nao_aceita', error_description: 'Versão do protocolo MCP não aceita. Aceitas: ' + PROTOCOLOS.join(', ') }, 400, cors);
  if (req.method === 'GET' || req.method === 'DELETE') return new Response(null, { status: 405, headers: { allow: 'POST, OPTIONS', ...NS, ...cors } }); // sem fluxo de servidor→cliente e sem sessão
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST, OPTIONS', ...cors } });
  if (+(req.headers.get('content-length') || 0) > MAX_CORPO) return resp(rpcErro(null, -32600, 'Grande demais.'), 413, cors);
  const corpoTxt = await req.text(); if (corpoTxt.length > MAX_CORPO) return resp(rpcErro(null, -32600, 'Grande demais.'), 413, cors);
  let b; try { b = JSON.parse(corpoTxt); } catch { return resp(rpcErro(null, -32700, 'JSON ilegível.'), 400, cors); }
  const lote = Array.isArray(b), msgs = lote ? b : [b]; if (!msgs.length || msgs.length > 20) return resp(rpcErro(null, -32600, 'Lote vazio ou grande demais.'), 400, cors);
  const out = []; for (const m of msgs) { const r = await rpc(m, env, d, quem); if (r) out.push(r); }
  if (!out.length) return new Response(null, { status: 202, headers: { ...NS, ...cors } });
  return resp(lote ? out : out[0], 200, cors);
}

/* ======================= a porta de entrada: o worker.js chama isto primeiro ======================= */
export async function conector(req, env, d) {
  const url = new URL(req.url), p = url.pathname.replace(/\/+$/, '') || '/';
  const meu = p === '/cerebro/mcp' || p.startsWith('/cerebro/oauth/') || p.startsWith('/.well-known/oauth-') || p === '/.well-known/openid-configuration' || p.startsWith('/.well-known/openid-configuration/');
  if (!meu) return null;
  if (String(env.CONECTOR_DESLIGADO || '') === '1') return resp({ error: 'conector_desligado', error_description: 'O conector do Cérebro está desligado no momento. A chave antiga (cerebro.mjs) continua funcionando.' }, 503, CORS_PUBLICO); // interruptor de emergência: variável da Cloudflare, sem novo deploy
  const base = semBarra(env.CONECTOR_URL_BASE || url.origin);
  if (p === '/cerebro/mcp') return mcp(req, env, d, base);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: p === '/cerebro/oauth/aprovar' ? d.cors(req, env) : CORS_PUBLICO });
  if (p.startsWith('/.well-known/')) { if (req.method !== 'GET') return resp({ error: 'metodo' }, 405, CORS_PUBLICO); const m = metadados(base);
    if (p.startsWith('/.well-known/oauth-protected-resource')) return resp(m.recurso, 200, { ...CORS_PUBLICO, 'cache-control': 'public, max-age=300' });
    return resp(m.servidor, 200, { ...CORS_PUBLICO, 'cache-control': 'public, max-age=300' }); } // oauth-authorization-server e openid-configuration (com ou sem sufixo de caminho)
  if (!env.EQUIPE_DB) return erroOauth('server_error', 'O banco do Cérebro não está ligado neste servidor.', 503);
  const cors = d.cors(req, env);
  if (p === '/cerebro/oauth/registrar' && req.method === 'POST') return registrar(req, env);
  if (p === '/cerebro/oauth/autorizar' && req.method === 'GET') return autorizar(req, env, base);
  if (p === '/cerebro/oauth/cliente' && req.method === 'GET') return infoCliente(req, env);
  if (p === '/cerebro/oauth/aprovar' && req.method === 'POST') return aprovar(req, env, d, base, cors);
  if (p === '/cerebro/oauth/token' && req.method === 'POST') return token(req, env, d, base);
  if (p === '/cerebro/oauth/revogar' && req.method === 'POST') return revogarPeloPrograma(req, env);
  return resp({ error: 'nao_achei' }, 404, CORS_PUBLICO);
}

// só para os testes: esquece o que ficou guardado na memória entre um teste e outro
export const cnReinicia = () => { CN.prep = false; PES.m = null; PES.t = 0; };
