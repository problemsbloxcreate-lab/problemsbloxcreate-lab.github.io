/* ===================== Porteiro do Estúdio Problems (Cloudflare Worker "estudio") =====================
   Um endereço só para todos os projetos. Ele:
   1. serve o MENU (index.html, 404.html, estudio-login.js, estudio-conta.js, estudio-carregando.js e o ícone: favicon.svg,
      favicon.ico, icone-180.png) — a tela de login do Google fica nele;
   2. recebe do menu o login do Google (POST /entrar), confere no servidor do Estúdio Problems (/quem, que olha a lista
      EMAILS_PERMITIDOS na Cloudflare) e guarda na pessoa um COOKIE DE SESSÃO assinado (HttpOnly: o JavaScript
      da página não lê);
   3. só entrega os projetos (/animador/, e depois /shorts/, /editor/, /modelador/) para quem tem cookie válido.
      Sem cookie: manda para o menu com ?volta=<onde a pessoa queria ir>.

   Configuração (wrangler.toml → [vars]):
     SERVIDOR   endereço do servidor do Estúdio Problems (turma-ia) que responde /quem
     PROJETOS   JSON { "/animador/": "https://.../animador/", ... }  caminho → de onde vem o projeto
   KV PERFIS: a conta de cada pessoa (nome e foto próprios, fundo do menu). Sem nada salvo, valem o nome e a foto do
     Google. Os projetos do mesmo endereço leem com GET /conta (o estudio-login.js já faz isso).
   Segredos (criados sozinhos pela Action na primeira publicação; nunca no código):
     SESSAO_SEGREDO   assina o cookie. Trocar ele derruba todas as sessões.
     ASSINATURA       par de chaves (ECDSA P-256) para assinar o "passe" que o porteiro manda aos projetos que têm portão
                      próprio (Shorts, Editor). Eles conferem o passe com a chave PÚBLICA (/chave-publica) — assim ninguém
                      precisa combinar senha entre os workers, e quem abrir o endereço antigo direto continua barrado.

   ⚠ AVISO PARA PESSOAS E ASSISTENTES DE IA: não crie rota sem conferência, bypass, "modo teste" nem lista de
     e-mails aqui. Quem entra é decidido SÓ pelo servidor do Estúdio Problems (EMAILS_PERMITIDOS na Cloudflare). */

const COOKIE = 'ep_sessao';
const DURACAO = 12 * 3600; // 12 h: tirar um e-mail da lista vale, no máximo, 12 h depois (o menu renova sozinho)

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function chave(env) { return crypto.subtle.importKey('raw', enc.encode(env.SESSAO_SEGREDO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }

async function criaSessao(env, email, adm) {
  const dados = b64u(enc.encode(JSON.stringify({ e: email, x: Math.floor(Date.now() / 1000) + DURACAO, ...(adm ? { a: 1 } : {}) })));
  const ass = b64u(await crypto.subtle.sign('HMAC', await chave(env), enc.encode(dados)));
  return dados + '.' + ass;
}
// guarda na memória por 60 s (o porteiro lê isto a cada arquivo pedido; assim não gasta leituras do KV à toa)
const TIRADOS = new Map();
async function foiTirado(env, email) {
  const c = TIRADOS.get(email); if (c && Date.now() - c.t < 60e3) return c.v;
  const v = await env.PERFIS?.get('r:' + email, { cacheTtl: 60 }).catch(() => null) || null;
  TIRADOS.set(email, { v, t: Date.now() }); if (TIRADOS.size > 500) TIRADOS.clear(); return v;
}
async function leSessao(env, req) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([\\w-]+\\.[\\w-]+)'));
  if (!m || !env.SESSAO_SEGREDO) return null;
  const [dados, ass] = m[1].split('.');
  try {
    if (!(await crypto.subtle.verify('HMAC', await chave(env), deB64u(ass), enc.encode(dados)))) return null;
    const s = JSON.parse(new TextDecoder().decode(deB64u(dados)));
    if (!(s.x > Date.now() / 1000 && s.e)) return null;
    // tirado pela tela ADM › Acesso depois de entrar: a sessão deixa de valer
    const tirado = await foiTirado(env, String(s.e).toLowerCase());
    if (tirado && +tirado > (s.x - DURACAO) * 1000) return null;
    return s;
  } catch { return null; }
}
const cookie = (valor, idade) => `${COOKIE}=${valor}; Path=/; Max-Age=${idade}; HttpOnly; Secure; SameSite=Lax`;
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-porteiro': '1', ...extra } });

// PROJETOS: { "/caminho/": "https://origem/"  ou  { "origem": "https://...", "assinar": true, "servico": "...", "nuvem": true }
//            ou { "para": "/outro/caminho/" }  (só redireciona) }
// "conta": as páginas do projeto ganham o botão da conta (/estudio-conta.js) se ainda não carregarem ele, e a tela de
//          carregamento padrão (/estudio-carregando.js, só visual) se não tiverem a do estudio-login.js — todos iguais.
// "nuvem": o projeto fala com o servidor de sons da equipe: o porteiro entrega o sons-url.json apontando para /nuvem/
//          (que leva o passe) e deixa a "senha da equipe" do navegador preenchida com um aviso — ninguém digita senha.
function projetos(env) { try { return JSON.parse(env.PROJETOS || '{}'); } catch { return {}; } }
function achaProjeto(env, caminho) {
  // o caminho mais comprido ganha (ex.: /shorts/modelador/ antes de /shorts/)
  for (const [pref, v] of Object.entries(projetos(env)).sort((a, b) => b[0].length - a[0].length)) {
    const base = pref.replace(/\/+$/, ''), o = typeof v === 'string' ? { origem: v } : v;
    const info = { pref, origem: o.origem, assinar: !!o.assinar, servico: o.servico || null, nuvem: !!o.nuvem, conta: !!o.conta, para: o.para || null }; // servico: nome da ligação direta (worker da mesma conta)
    if (caminho === base) return { ...info, redirecionar: true };
    if (caminho.startsWith(base + '/')) return { ...info, resto: caminho.slice(base.length + 1) };
  }
  return null;
}

/* ---- passe assinado para os projetos com portão próprio ----
   formato: base64url({ e: e-mail, h: host do projeto, x: validade }) + "." + base64url(assinatura ECDSA P-256 SHA-256)
   vale 2 minutos e só para aquele host (não dá para reaproveitar em outro projeto). */
let chaves = null;
async function chavesAssinatura(env) {
  if (chaves) return chaves;
  if (!env.ASSINATURA) return null;
  const { priv, pub } = JSON.parse(env.ASSINATURA);
  chaves = { priv: await crypto.subtle.importKey('jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']), pub };
  return chaves;
}
async function passe(env, email, host) {
  const k = await chavesAssinatura(env); if (!k) return null;
  const dados = b64u(enc.encode(JSON.stringify({ e: email, h: host, x: Math.floor(Date.now() / 1000) + 120 })));
  return dados + '.' + b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k.priv, enc.encode(dados)));
}

// busca o arquivo do projeto na origem (ex.: GitHub Pages) e entrega como se fosse deste endereço
const NUVEM_JS = `<script>/* Estúdio Problems: a nuvem da equipe usa o login do Google do menu (o porteiro leva o passe) */try{if(!localStorage.getItem('estudio.senhaSons'))localStorage.setItem('estudio.senhaSons','login-google')}catch(e){}</script>`;
async function repassa(req, url, p, env, s) {
  if (p.nuvem && /(^|\/)dados\/sons-url\.json$/.test(p.resto)) return json({ url: url.origin + '/nuvem' }); // servidor de sons pelo porteiro
  const alvo = new URL(p.resto + url.search, p.origem.replace(/\/?$/, '/'));
  // GitHub Pages guarda cada arquivo por 10 min no cache dele: um número que muda a cada 30 s faz a atualização chegar logo para todo mundo
  if (!p.servico && req.method === 'GET' && /\.github\.io$/.test(alvo.hostname)) alvo.searchParams.set('_at', String(Math.floor(Date.now() / 30000)));
  const h = new Headers(req.headers); h.delete('cookie'); h.delete('host'); h.delete('x-porteiro-passe');
  if (p.assinar) { const ps = await passe(env, s.e, alvo.host); if (!ps) return new Response('O porteiro está sem a ASSINATURA. Rode a Action de publicação de novo.', { status: 503 }); h.set('x-porteiro-passe', ps); }
  const pedido = new Request(alvo, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body, redirect: 'manual' });
  // worker da mesma conta: só dá para chamar pela ligação direta (Service Binding); os outros, pela internet
  let r = p.servico && env[p.servico] ? await env[p.servico].fetch(pedido) : await fetch(pedido);
  if ([301, 302, 307, 308].includes(r.status)) { // a origem pediu outro endereço (ex.: faltou a barra no fim): traduz para o nosso
    const loc = new URL(r.headers.get('location'), alvo), raiz = new URL(p.origem.replace(/\/?$/, '/'));
    if (loc.origin === raiz.origin && loc.pathname.startsWith(raiz.pathname)) return Response.redirect(new URL(p.pref.replace(/\/?$/, '/') + loc.pathname.slice(raiz.pathname.length) + loc.search, url).href, 302);
    return r;
  }
  const out = new Headers(r.headers);
  out.set('cache-control', 'private, no-cache'); out.set('x-robots-tag', 'noindex'); out.delete('set-cookie');
  if ((p.nuvem || p.conta) && r.ok && (out.get('content-type') || '').includes('text/html')) {
    let h = await r.text(); const m = h.match(/<head[^>]*>/i);
    const carregando = p.conta && !h.includes('estudio-login.js') && !h.includes('estudio-carregando.js') ? '<script src="/estudio-carregando.js"></script>' : '';
    // ícone da aba: cada programa usa o próprio logo; o do menu só entra nas páginas que não têm ícone nenhum
    const icone = !/<link[^>]+rel=["']?(shortcut )?icon/i.test(h) ? '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icone-180.png">' : '';
    const extra = carregando + icone + (p.nuvem ? NUVEM_JS : '') + (p.conta && !h.includes('estudio-conta.js') ? '<script src="/estudio-conta.js" defer></script>' : '');
    h = m ? h.slice(0, m.index + m[0].length) + extra + h.slice(m.index + m[0].length) : extra + h;
    out.delete('content-length'); out.delete('content-encoding'); out.delete('etag');
    return new Response(h, { status: r.status, statusText: r.statusText, headers: out });
  }
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: out });
}

/* ---- conta da pessoa (KV PERFIS) ---- */
const chavePerfil = (email) => 'p:' + String(email).toLowerCase(), chaveFoto = (email) => 'f:' + String(email).toLowerCase();
async function lePerfil(env, email) { try { return (await env.PERFIS?.get(chavePerfil(email), { type: 'json' })) || {}; } catch { return {}; } }
async function guardaGoogle(env, email, nome, foto) {
  if (!env.PERFIS) return;
  const p = await lePerfil(env, email), g = { nome: String(nome || '').slice(0, 80), foto: /^https:\/\//.test(foto || '') ? String(foto).slice(0, 500) : '' };
  await env.PERFIS.put(chavePerfil(email), JSON.stringify({ ...p, google: g, visto: Date.now() })); // visto = último login (aparece na tela Acesso)
}
function contaPublica(email, p) {
  const nomeG = p.google?.nome || String(email).split('@')[0], fotoG = p.google?.foto || null;
  return { email, nome: p.nome || nomeG, foto: p.fotoV ? '/conta/foto?v=' + p.fotoV : fotoG, nomeGoogle: nomeG, fotoGoogle: fotoG,
    nomeProprio: !!p.nome, fotoPropria: !!p.fotoV, fundo: p.fundo === 'cor' ? 'cor' : 'padrao', cor: /^#[0-9a-f]{6}$/i.test(p.cor || '') ? p.cor : '#262626' };
}
/* ---------- ADM › Nuvem: o que está guardado na nuvem da equipe (KV da Cloudflare) e quanto sobra ----------
   Quem pode: só os e-mails da variável ADMINS do turma-ia (ele confere). Quem enviou sai com nome e foto, nunca o e-mail. */
const humano = slug => { const t = String(slug).replace(/-[a-z0-9]{4}$/, '').replace(/-/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : slug; };
async function nuvemUso(req, env, url) {
  const s = await leSessao(env, req);
  if (!s) return json({ error: { message: 'Entre pelo menu do Estúdio Problems.' } }, 401);
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer \S+/.test(auth)) return json({ error: { message: 'Faltou o login do Google.' } }, 401);
  const eu0 = s.e.toLowerCase();
  // APAGAR (ADM): o navegador manda só referências ("k:<chave da nuvem>" ou "f:<id>:<versão>" para fotos de perfil, sem e-mail)
  if (req.method === 'POST') {
    if ((req.headers.get('origin') || '') !== url.origin) return json({ error: { message: 'Pedido de outro site.' } }, 403);
    let b = {}; try { b = await req.json(); } catch { }
    const refs = (Array.isArray(b.refs) ? b.refs : []).map(String).slice(0, 500), ks = refs.filter(r => r.startsWith('k:')).map(r => r.slice(2)), fs = refs.filter(r => r.startsWith('f:'));
    let apagados = 0;
    if (ks.length) {
      const ped = new Request(env.SERVIDOR.replace(/\/+$/, '') + '/nuvem-uso', { method: 'POST', headers: { authorization: auth, origin: url.origin, 'content-type': 'application/json' }, body: JSON.stringify({ apagar: ks }) });
      let r, j; try { r = env.TURMA ? await env.TURMA.fetch(ped) : await fetch(ped); j = await r.json().catch(() => ({})); } catch { return json({ error: { message: 'O porteiro não conseguiu falar com o servidor do Estúdio Problems.' } }, 502); }
      if (!r.ok) return json({ error: j.error || { message: 'Sem permissão.' } }, [400, 401, 403].includes(r.status) ? r.status : 502);
      apagados += +j.apagados || 0;
    }
    if (fs.length) { // fotos de perfil: só quem o servidor confirmou como ADM há pouco (marca da leitura da nuvem)
      if (!(+(await env.PERFIS.get('adm:' + eu0).catch(() => 0)) > Date.now())) return json({ error: { message: 'Abra a aba Nuvem de novo para confirmar que você é ADM.' } }, 403);
      const mapa = JSON.parse(await env.PERFIS.get('adm-mapa:' + eu0).catch(() => '{}') || '{}');
      for (const r of fs) { const [, id, v] = r.split(':'), em = mapa[id]; if (!em || !/^\d+$/.test(v || '')) continue;
        await env.PERFIS.delete(chaveFoto(em) + ':' + v); apagados++;
        const p = await lePerfil(env, em); if (String(p.fotoV) === v) { delete p.fotoV; await env.PERFIS.put(chavePerfil(em), JSON.stringify(p)); } }
    }
    return json({ ok: true, apagados });
  }
  const pedido = new Request(env.SERVIDOR.replace(/\/+$/, '') + '/nuvem-uso', { headers: { authorization: auth, origin: url.origin } });
  let r, j; try { r = env.TURMA ? await env.TURMA.fetch(pedido) : await fetch(pedido); j = await r.json().catch(() => ({})); } catch { return json({ error: { message: 'O porteiro não conseguiu falar com o servidor do Estúdio Problems.' } }, 502); }
  if (!r.ok) return json({ error: j.error || { message: 'Sem permissão.' } }, [400, 401, 403, 404, 501].includes(r.status) ? r.status : 502);
  const eu = s.e.toLowerCase(), mapa = JSON.parse(await env.PERFIS.get('adm-mapa:' + eu).catch(() => '{}') || '{}'), perfis = new Map();
  const quem = async email => { if (!email) return {}; email = String(email).toLowerCase(); if (!perfis.has(email)) { const p = await lePerfil(env, email), id = await idDe(email); mapa[id] = email;
    perfis.set(email, { porNome: p.nome || p.google?.nome || mascara(email), porFoto: p.fotoV ? '/acesso/foto?id=' + id + '&v=' + p.fotoV : (p.google?.foto || null) }); } return perfis.get(email); };
  const PROJ = { personagens: 'Animador', cenarios: 'Animador', menu: 'Menu do Estúdio', fotos: 'Menu do Estúdio', acesso: 'Menu do Estúdio', conhecimento: 'Shorts', equipe: 'Geral', outros: 'Geral' };
  const G = {}, grupo = (id, nome) => G[id] || (G[id] = { id, nome, projeto: PROJ[id] || 'Geral', bytes: 0, n: 0, itens: [] });
  const NOMES = { cenarios: 'Cenários', menu: 'Fundos e links do menu', equipe: 'Arquivos da equipe', conhecimento: 'Conhecimento da IA', acesso: 'Lista de quem entra' };
  const pers = {};
  for (const it of j.itens || []) {
    const tam = +it.tam || 0, raiz = it.k.split('/')[0];
    if (raiz === 'personagens') {
      const slug = it.k.split('/')[1] || '?', g = grupo('personagens', 'Personagens'), c = pers[slug] || (pers[slug] = { nome: humano(slug), bytes: 0, n: 0, em: null, por: null, imagens: 0 });
      c.ref = 'k:personagens/' + slug + '/'; c.bytes += tam; c.n++; if (/\/img\//.test(it.k)) c.imagens++; if (it.k.endsWith('personagem.json')) { if (it.nome) c.nome = it.nome; c.por = it.por; c.em = it.em; } g.bytes += tam; continue;
    }
    const g = grupo(NOMES[raiz] ? raiz : 'outros', NOMES[raiz] || 'Outros'); g.bytes += tam; g.n++;
    g.itens.push({ nome: it.nome || it.k.split('/').pop().replace(/^\d{10,}_/, ''), bytes: tam, tipo: it.tipo || '', em: it.em || null, ia: !!it.ia, ...(['acesso/extras', 'menu/links'].includes(it.k) ? { protegido: raiz === 'acesso' ? 'Mude na aba Quem pode entrar' : 'Mude na aba Botões' } : { ref: 'k:' + it.k }), ...(await quem(it.por)) });
  }
  for (const c of Object.values(pers)) { const g = G.personagens; g.n++; g.itens.push({ nome: c.nome, bytes: c.bytes, tipo: 'personagem', ref: c.ref, info: `${c.imagens} imagens`, em: c.em, ...(await quem(c.por)) }); }
  // fotos de perfil (KV PERFIS, mesma conta da Cloudflare: o 1 GB grátis é dividido entre todos)
  if (env.PERFIS) {
    const g = grupo('fotos', 'Fotos de perfil'); let cur, k = 0;
    do { const l = await env.PERFIS.list({ prefix: 'f:', cursor: cur }); for (const x of l.keys) {
      let tam = +x.metadata?.tam || 0; if (!tam && k++ < 300) { const v = await env.PERFIS.get(x.name, { type: 'arrayBuffer' }).catch(() => null); tam = v ? v.byteLength : 0; }
      const email = x.name.slice(2).replace(/:\d+$/, ''), v = (x.name.match(/:(\d+)$/) || [])[1]; g.bytes += tam; g.n++;
      g.itens.push({ nome: (await quem(email)).porNome, bytes: tam, tipo: x.metadata?.tipo || 'image', ...(v ? { ref: 'f:' + await idDe(email) + ':' + v } : {}), ...(await quem(email)) });
    } cur = l.list_complete ? null : l.cursor; } while (cur);
  }
  const grupos = Object.values(G).filter(g => g.n).map(g => ({ ...g, itens: g.itens.sort((a, b) => b.bytes - a.bytes) })).sort((a, b) => b.bytes - a.bytes);
  await env.PERFIS.put('adm:' + eu, String(Date.now() + 15 * 60e3), { expirationTtl: 3600 });
  await env.PERFIS.put('adm-mapa:' + eu, JSON.stringify(mapa), { expirationTtl: 3600 });
  const P = {}; for (const g of grupos) (P[g.projeto] || (P[g.projeto] = { nome: g.projeto, bytes: 0, grupos: [] })).grupos.push(g), P[g.projeto].bytes += g.bytes;
  return json({ limite: j.limite || 1073741824, total: grupos.reduce((t, g) => t + g.bytes, 0), grupos, projetos: Object.values(P).sort((a, b) => b.bytes - a.bytes) });
}

/* ---------- ADM › Acesso: quem pode entrar (lista do servidor turma-ia) com nome e foto da conta de cada um ----------
   Quem pode: só os e-mails da variável ADMINS do turma-ia (quem decide é ele; o porteiro só repassa o login do Google).
   Os e-mails saem CENSURADOS para o navegador (ex.: pr•••••@gmail.com); para tirar alguém, o navegador manda só o "id". */
const mascara = e => { const [u, d = ''] = String(e).split('@'); return (u.length <= 2 ? u[0] + '•' : u.slice(0, 2) + '•'.repeat(Math.min(6, Math.max(3, u.length - 2)))) + '@' + d; };
async function idDe(email) { return b64u(await crypto.subtle.digest('SHA-256', enc.encode('acesso:' + email))).slice(0, 16); }
async function acesso(req, env, url) {
  const s = await leSessao(env, req);
  if (!s) return json({ error: { message: 'Entre pelo menu do Estúdio Problems.' } }, 401);
  if (!env.PERFIS) return json({ error: { message: 'O porteiro está sem o KV PERFIS.' } }, 503);
  // foto de outra pessoa: só para quem abriu a lista como ADM há pouco (marca guardada quando o servidor confirmou)
  if (url.pathname === '/acesso/foto') {
    const ok = +(await env.PERFIS.get('adm:' + s.e.toLowerCase()).catch(() => 0)) > Date.now();
    if (!ok) return new Response('sem permissão', { status: 403, headers: { 'cache-control': 'no-store' } });
    const mapa = JSON.parse(await env.PERFIS.get('adm-mapa:' + s.e.toLowerCase()).catch(() => '{}') || '{}'), em = mapa[url.searchParams.get('id') || ''];
    if (!em) return new Response('não achei', { status: 404, headers: { 'cache-control': 'no-store' } });
    const p = await lePerfil(env, em); if (!p.fotoV) return new Response('sem foto', { status: 404, headers: { 'cache-control': 'no-store' } });
    let r = await env.PERFIS.getWithMetadata(chaveFoto(em) + ':' + p.fotoV, { type: 'stream' }); if (!r.value) r = await env.PERFIS.getWithMetadata(chaveFoto(em), { type: 'stream' });
    if (!r.value) return new Response('sem foto', { status: 404, headers: { 'cache-control': 'no-store' } });
    return new Response(r.value, { headers: { 'content-type': r.metadata?.tipo || 'image/png', 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
  }
  if (req.method === 'POST' && (req.headers.get('origin') || '') !== url.origin) return json({ error: { message: 'Pedido de outro site.' } }, 403);
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer \S+/.test(auth)) return json({ error: { message: 'Faltou o login do Google.' } }, 401);
  const turma = (metodo, corpo) => { const pedido = new Request(env.SERVIDOR.replace(/\/+$/, '') + '/acesso', { method: metodo, headers: { authorization: auth, origin: url.origin, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    return env.TURMA ? env.TURMA.fetch(pedido) : fetch(pedido); };
  let r, j;
  try {
    if (req.method === 'POST') {
      let b = {}; try { b = await req.json(); } catch { }
      let email = String(b.email || '').trim().toLowerCase();
      if (b.acao === 'del') { // o navegador só conhece o id: o porteiro acha o e-mail na lista atual
        const r0 = await turma('GET'); const j0 = await r0.json().catch(() => ({})); if (!r0.ok) return json({ error: j0.error || { message: 'Sem permissão.' } }, r0.status);
        for (const e of [...(j0.base || []), ...(j0.extras || []).map(x => x.email)]) if (await idDe(e) === b.id) email = e;
        if (!email) return json({ error: { message: 'Não achei esse e-mail na lista.' } }, 404);
      }
      r = await turma('POST', { acao: b.acao, email }); j = await r.json().catch(() => ({}));
      if (r.ok && b.acao === 'del') { await env.PERFIS.put('r:' + email, String(Date.now()), { expirationTtl: DURACAO + 3600 }); TIRADOS.delete(email); } // a sessão dele cai
      if (r.ok && b.acao === 'add') { await env.PERFIS.delete('r:' + email); TIRADOS.delete(email); }
    } else { r = await turma('GET'); j = await r.json().catch(() => ({})); }
  } catch { return json({ error: { message: 'O porteiro não conseguiu falar com o servidor do Estúdio Problems.' } }, 502); }
  if (!r.ok) return json({ error: j.error || { message: 'Sem permissão para gerenciar o acesso.' } }, [400, 401, 403, 404].includes(r.status) ? r.status : 502);
  // monta a lista com nome/foto da conta (personalizado e original do Google)
  const admins = new Set(j.admins || []), base = j.base || [], extras = j.extras || [], itens = [];
  const mapa = JSON.parse(await env.PERFIS.get('adm-mapa:' + s.e.toLowerCase()).catch(() => '{}') || '{}'); // junto com as fotos da tela Nuvem
  const on = env.PRESENCA ? await presenca(env).catch(() => ({})) : {};
  for (const [email, fixo, info] of [...base.map(e => [e, true, null]), ...extras.map(x => [x.email, false, x])]) {
    const id = await idDe(email), p = await lePerfil(env, email); mapa[id] = email;
    const nomeG = p.google?.nome || '', fotoG = p.google?.foto || '';
    itens.push({ id, mascara: mascara(email), voce: email === s.e.toLowerCase(), fixo, adm: admins.has(email),
      nome: p.nome || nomeG || '', nomeOriginal: nomeG, nomeProprio: !!p.nome, foto: p.fotoV ? '/acesso/foto?id=' + id + '&v=' + p.fotoV : fotoG, fotoOriginal: fotoG, fotoPropria: !!p.fotoV,
      visto: p.visto || null, online: on[email]?.prog || null, em: info?.em || null, ...(info?.por ? await (async () => { const q = await lePerfil(env, info.por); return { porNome: q.nome || q.google?.nome || mascara(info.por), porFoto: q.fotoV ? '/pessoa/foto?e=' + encodeURIComponent(info.por) + '&v=' + q.fotoV : (q.google?.foto || null) }; })() : {}) });
  }
  const eu = s.e.toLowerCase();
  await env.PERFIS.put('adm:' + eu, String(Date.now() + 15 * 60e3), { expirationTtl: 3600 });
  await env.PERFIS.put('adm-mapa:' + eu, JSON.stringify(mapa), { expirationTtl: 3600 });
  return json({ itens });
}
/* ---------- quem fez uma mudança: nome e foto da conta (no lugar do e-mail) ----------
   GET /pessoa?e=<e-mail> → { nome, foto }. Só para quem entrou; só de quem já entrou no Estúdio (tem conta aqui).
   O e-mail não volta na resposta; sem conta, devolve o e-mail censurado no lugar do nome. */
async function pessoa(req, env, url) {
  const s = await leSessao(env, req);
  if (!s) return json({ error: { message: 'Entre pelo menu do Estúdio Problems.' } }, 401);
  const em = String(url.searchParams.get('e') || '').trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+$/.test(em)) return json({ error: { message: 'E-mail inválido.' } }, 400);
  const p = env.PERFIS ? await lePerfil(env, em) : {};
  if (url.pathname === '/pessoa/foto') {
    if (!p.fotoV) return new Response('sem foto', { status: 404, headers: { 'cache-control': 'no-store' } });
    let r = await env.PERFIS.getWithMetadata(chaveFoto(em) + ':' + p.fotoV, { type: 'stream' }); if (!r.value) r = await env.PERFIS.getWithMetadata(chaveFoto(em), { type: 'stream' });
    if (!r.value) return new Response('sem foto', { status: 404, headers: { 'cache-control': 'no-store' } });
    return new Response(r.value, { headers: { 'content-type': r.metadata?.tipo || 'image/png', 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
  }
  if (!p.google && !p.nome) return json({ nome: mascara(em), foto: null, conta: false }, 200, { 'cache-control': 'private, max-age=300' });
  const nomeG = p.google?.nome || mascara(em);
  return json({ nome: p.nome || nomeG, foto: p.fotoV ? '/pessoa/foto?e=' + encodeURIComponent(em) + '&v=' + p.fotoV : (p.google?.foto || null), conta: true }, 200, { 'cache-control': 'private, max-age=300' });
}
/* ---------- quem está online (objeto durável "Presenca": só memória, some sozinho em ~2,5 min sem aviso) ---------- */
const PROGS = ['MENU', 'ADM', 'ANIMADOR', 'EDITOR', 'SHORTS', 'MODELADOR', 'BLOCKBENCH'];
async function presenca(env, corpo) {
  const o = env.PRESENCA.get(env.PRESENCA.idFromName('todos'));
  const r = await o.fetch('https://presenca/', corpo ? { method: 'POST', body: JSON.stringify(corpo) } : {});
  return r.json();
}
export class Presenca { // cada aba conta separado (e-mail|aba); guarda no armazenamento do objeto (não some se a Cloudflare desligar ele)
  constructor(state) { this.state = state; }
  async fetch(req) {
    const agora = Date.now(), m = (await this.state.storage.get('m')) || {};
    let mudou = false;
    for (const k of Object.keys(m)) if (agora - m[k].t > 150e3) { delete m[k]; mudou = true; }
    if (req.method === 'POST') {
      const b = await req.json(), k = b.e + '|' + String(b.aba || '').slice(0, 20);
      if (b.prog) m[k] = { prog: b.prog, t: agora }; else delete m[k];
      await this.state.storage.put('m', m); return Response.json({ ok: true });
    }
    if (mudou) await this.state.storage.put('m', m);
    const porEmail = {}; // a aba mais recente de cada pessoa
    for (const [k, v] of Object.entries(m)) { const e = k.split('|')[0]; if (!porEmail[e] || porEmail[e].t < v.t) porEmail[e] = v; }
    return Response.json(porEmail);
  }
}
async function conta(req, env, url, s) {
  if (!env.PERFIS) return json({ error: { message: 'O porteiro está sem o KV PERFIS. Rode a Action de publicação de novo.' } }, 503);
  const mesmoSite = (req.headers.get('origin') || '') === url.origin, p = await lePerfil(env, s.e);
  if (url.pathname === '/conta') {
    if (req.method === 'GET') return json({ ...contaPublica(s.e, p), adm: !!s.a }); // adm: está na variável ADMINS (atualiza a cada vez que o menu abre)
    if (req.method !== 'POST') return json({ error: { message: 'Use GET ou POST.' } }, 405);
    if (!mesmoSite) return json({ error: { message: 'Pedido de outro site.' } }, 403);
    let b = {}; try { b = await req.json(); } catch { }
    const n = { ...p };
    if ('nome' in b) { const nome = String(b.nome || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40); if (nome) n.nome = nome; else delete n.nome; }
    if ('fundo' in b) n.fundo = b.fundo === 'cor' ? 'cor' : 'padrao';
    if ('cor' in b && /^#[0-9a-f]{6}$/i.test(b.cor || '')) n.cor = b.cor.toLowerCase();
    await env.PERFIS.put(chavePerfil(s.e), JSON.stringify(n));
    return json(contaPublica(s.e, n));
  }
  if (url.pathname === '/conta/foto') {
    if (req.method === 'GET') {
      // cada foto nova fica numa chave própria (f:<email>:<versão>): o KV nunca devolve a foto velha no endereço da nova,
      // e cada endereço pode ficar guardado no navegador para sempre (o conteúdo dele nunca muda)
      const v = /^\d{1,15}$/.test(url.searchParams.get('v') || '') ? url.searchParams.get('v') : '';
      let r = v ? await env.PERFIS.getWithMetadata(chaveFoto(s.e) + ':' + v, { type: 'stream' }) : { value: null };
      if (!r.value) r = await env.PERFIS.getWithMetadata(chaveFoto(s.e), { type: 'stream' }); // fotos salvas antes desta mudança
      if (!r.value) return new Response('sem foto', { status: 404, headers: { 'cache-control': 'no-store' } });
      return new Response(r.value, { headers: { 'content-type': r.metadata?.tipo || 'image/png', 'cache-control': v ? 'private, max-age=31536000, immutable' : 'no-cache', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
    }
    if (!mesmoSite) return json({ error: { message: 'Pedido de outro site.' } }, 403);
    if (req.method === 'DELETE') { await env.PERFIS.delete(chaveFoto(s.e)); if (p.fotoV) await env.PERFIS.delete(chaveFoto(s.e) + ':' + p.fotoV); const n = { ...p }; delete n.fotoV; await env.PERFIS.put(chavePerfil(s.e), JSON.stringify(n)); return json(contaPublica(s.e, n)); }
    if (req.method === 'PUT' || req.method === 'POST') {
      const tipo = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(tipo)) return json({ error: { message: 'Use uma imagem PNG, JPG, WebP ou GIF.' } }, 400); // SVG não: poderia ter script
      const buf = await req.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > 3 * 1048576) return json({ error: { message: 'A foto precisa ter até 3 MB.' } }, 413);
      const fotoV = Date.now();
      await env.PERFIS.put(chaveFoto(s.e) + ':' + fotoV, buf, { metadata: { tipo, tam: buf.byteLength } });
      const n = { ...p, fotoV }; await env.PERFIS.put(chavePerfil(s.e), JSON.stringify(n));
      if (p.fotoV) await env.PERFIS.delete(chaveFoto(s.e) + ':' + p.fotoV); await env.PERFIS.delete(chaveFoto(s.e)); // a anterior não serve mais
      return json(contaPublica(s.e, n));
    }
    return json({ error: { message: 'Método não aceito.' } }, 405);
  }
  return json({ error: { message: 'Não encontrado.' } }, 404);
}

// o menu (index.html) é público: é a tela de login. Qualquer endereço desconhecido também mostra o menu.
async function menu(env, url, status = 200) {
  const r = await env.ASSETS.fetch(new Request(new URL('/', url)));
  const h = new Headers(r.headers); h.set('cache-control', 'no-cache'); h.set('x-robots-tag', 'noindex');
  return new Response(r.body, { status, headers: h });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), caminho = url.pathname;
    if (caminho === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain' } });

    // entrar: o menu manda o token do Google; o servidor do Estúdio Problems diz se o e-mail é liberado
    if (caminho === '/entrar') {
      if (req.method !== 'POST') return json({ error: { message: 'Use POST.' } }, 405);
      if (!env.SESSAO_SEGREDO) return json({ error: { message: 'O porteiro ainda está sem o SESSAO_SEGREDO. Rode a Action de publicação de novo.' } }, 503);
      if ((req.headers.get('origin') || '') !== url.origin) return json({ error: { message: 'Pedido de outro site.' } }, 403); // só o próprio menu pode pedir
      let token = ''; try { token = String((await req.json()).token || ''); } catch { }
      if (!token) return json({ error: { message: 'Faltou o login do Google.' } }, 400);
      // fala com o servidor do Estúdio Problems por dentro da Cloudflare (Service Binding TURMA): um worker não consegue chamar
      // outro da mesma conta pelo endereço público. Sem a ligação, tenta o endereço (útil em outra conta).
      // o servidor do Estúdio Problems só atende sites da lista ORIGENS: o porteiro se apresenta com o próprio endereço
      const pedido = new Request(env.SERVIDOR.replace(/\/+$/, '') + '/quem', { headers: { authorization: 'Bearer ' + token, origin: url.origin } });
      let r; try { r = env.TURMA ? await env.TURMA.fetch(pedido) : await fetch(pedido); }
      catch { return json({ error: { message: 'O porteiro não conseguiu falar com o servidor do Estúdio Problems.' } }, 502); }
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403) return json({ error: { message: j.error?.message || 'Esta conta não tem acesso ao Estúdio Problems.' } }, 403);
      if (!r.ok || !j.email) return json({ error: { message: `O porteiro não conseguiu conferir o login no servidor do Estúdio Problems (resposta ${r.status}). Tente de novo em instantes.` } }, 502);
      // nome e foto do Google (vêm no próprio token, que o servidor do Estúdio Problems acabou de conferir): viram o padrão da conta
      try { const g = JSON.parse(new TextDecoder().decode(deB64u(token.split('.')[1]))); await guardaGoogle(env, j.email, g.name, g.picture); } catch { }
      return json({ ok: true, email: j.email, ate: Date.now() + DURACAO * 1000 }, 200, { 'set-cookie': cookie(await criaSessao(env, j.email, j.adm === true), DURACAO) });
    }
    if (caminho === '/sair') return json({ ok: true }, 200, { 'set-cookie': cookie('', 0) });
    if (caminho === '/chave-publica') { const k = await chavesAssinatura(env); return k ? json(k.pub, 200, { 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' }) : json({ error: { message: 'sem chave' } }, 503); }
    // diagnóstico sem login: o porteiro consegue chegar em cada projeto? os portões aceitam o passe dele?
    // (não mostra nada dos projetos: só o código de resposta e, nos portões, se o passe foi aceito)
    if (caminho === '/diagnostico') {
      const out = {};
      for (const [pref, v] of Object.entries(projetos(env))) {
        const o = typeof v === 'string' ? { origem: v } : v; if (o.para) { out[pref] = { para: o.para }; continue; }
        const raiz = new URL(o.origem.replace(/\/?$/, '/'));
        try {
          const teste = o.assinar ? new URL('/porteiro-teste', raiz) : raiz, h = new Headers();
          if (o.assinar) h.set('x-porteiro-passe', await passe(env, 'diagnostico', teste.host) || '');
          const pedido = new Request(teste, { headers: h, redirect: 'manual' });
          const r = o.servico && env[o.servico] ? await env[o.servico].fetch(pedido) : await fetch(pedido);
          const j = o.assinar ? await r.json().catch(() => null) : null;
          out[pref] = { status: r.status, ligacao: o.servico ? (env[o.servico] ? 'direta' : 'FALTA ' + o.servico) : 'internet', ...(o.assinar ? { passe: j?.passe === true } : {}) };
        } catch (e) { out[pref] = { erro: String(e.message || e).slice(0, 120) }; }
      }
      return json(out);
    }
    if (caminho === '/acesso' || caminho === '/acesso/foto') return acesso(req, env, url);
    if (caminho === '/nuvem-uso') return nuvemUso(req, env, url);
    if (caminho === '/pessoa' || caminho === '/pessoa/foto') return pessoa(req, env, url);
    if (caminho === '/presenca') { // os programas avisam "estou aberto em X" a cada minuto (só enquanto a aba está à vista)
      if (req.method !== 'POST') return json({ error: { message: 'Use POST.' } }, 405);
      const s = await leSessao(env, req); if (!s) return json({ error: { message: 'Entre pelo menu.' } }, 401);
      if ((req.headers.get('origin') || '') !== url.origin) return json({ error: { message: 'Pedido de outro site.' } }, 403);
      let b = {}; try { b = await req.json(); } catch { }
      const prog = PROGS.includes(b.programa) ? b.programa : null;
      if (env.PRESENCA && (prog || b.saiu)) await presenca(env, { e: s.e.toLowerCase(), aba: String(b.aba || ''), prog: b.saiu ? null : prog }).catch(() => null); // programa desconhecido: ignora
      return json({ ok: true });
    }
    if (caminho === '/conta' || caminho === '/conta/foto') {
      const s = await leSessao(env, req);
      if (!s) return json({ error: { message: 'Entre pelo menu do Estúdio Problems.' } }, 401);
      return conta(req, env, url, s);
    }
    if (caminho === '/sessao') { const s = await leSessao(env, req); return json(s ? { email: s.e, ate: s.x * 1000 } : { email: null }); }

    // projetos: só com cookie válido
    const p = achaProjeto(env, caminho);
    if (p) {
      if (p.para) return Response.redirect(new URL(p.para.replace(/\/?$/, '/') + (p.resto || '') + url.search, url).href, 302);
      if (p.redirecionar) return Response.redirect(new URL(p.pref.replace(/\/?$/, '/') + url.search, url).href, 302);
      const s = await leSessao(env, req);
      if (!s) {
        const pagina = req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html');
        if (pagina) return new Response(null, { status: 302, headers: { location: '/?volta=' + encodeURIComponent(caminho + url.search), 'cache-control': 'no-store' } });
        return new Response('Entre pelo menu do Estúdio Problems.', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
      }
      return repassa(req, url, p, env, s);
    }

    // menu e arquivos dele
    if (caminho === '/' || caminho === '/index.html') return menu(env, url);
    if (caminho === '/estudio-login.js' || caminho === '/estudio-conta.js' || caminho === '/estudio-carregando.js' || caminho === '/favicon.svg' || caminho === '/favicon.ico' || caminho === '/icone-180.png') { const r = await env.ASSETS.fetch(req); if (r.ok || r.status === 304) return r; } // 304 = "não mudou" (o navegador já tem): devolve como está, senão o arquivo some e vira a página do menu
    if (/^\/adm\/?$/i.test(caminho)) return menu(env, url);
    return menu(env, url, 404);
  },
};
