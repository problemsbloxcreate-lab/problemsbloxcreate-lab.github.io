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
     Também guarda os dispositivos do Estúdio Problems Local (dispositivo:<id>, só o SHA-256 do token) e a conta Claude em uso (cu:…).
   R2 MIDIA (bucket estudio-midia): a mídia que o serviço local baixa (/midia/…). Sem o bucket, /midia responde 503.
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
async function passe(env, email, host, extra = {}) { // extra: { a: 1 } só nas rotas de ADM (ex.: nuvem dos sons)
  const k = await chavesAssinatura(env); if (!k) return null;
  const dados = b64u(enc.encode(JSON.stringify({ e: email, h: host, x: Math.floor(Date.now() / 1000) + 120, ...extra })));
  return dados + '.' + b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k.priv, enc.encode(dados)));
}

// busca o arquivo do projeto na origem (ex.: GitHub Pages) e entrega como se fosse deste endereço
const NUVEM_JS = `<script>/* Estúdio Problems: a nuvem da equipe usa o login do Google do menu (o porteiro leva o passe) */try{if(!localStorage.getItem('estudio.senhaSons'))localStorage.setItem('estudio.senhaSons','login-google')}catch(e){}</script>`;
/* ---------- arquivos com carimbo de versão (mais leve) ----------
   Ao entregar uma página, o porteiro troca  <script src="js/app.js">  por  js/app.js?_ev=<versão do arquivo>.
   Com o carimbo, o navegador guarda o arquivo de vez ("immutable") e nem pergunta de novo nas próximas aberturas;
   quando o arquivo muda, o carimbo muda e ele baixa só aquele. A versão vem do ETag de cada arquivo (guardada 60 s). */
const RAIZ_ASSETS = new Set(['/estudio-login.js', '/estudio-conta.js', '/estudio-carregando.js', '/favicon.svg', '/favicon.ico', '/icone-180.png']);
const VERS = new Map();
const IMUTAVEL = 'private, max-age=31536000, immutable';
async function versaoDe(env, u, s) {
  const c = VERS.get(u); if (c && Date.now() - c.t < 20000) return c.v;
  let v = null;
  try {
    const url = new URL(u);
    if (RAIZ_ASSETS.has(url.pathname)) { const r = await env.ASSETS.fetch(new Request(url.origin + url.pathname, { method: 'HEAD' })); v = r.ok ? (r.headers.get('etag') || r.headers.get('last-modified')) : null; }
    else {
      const p = achaProjeto(env, url.pathname); if (!p?.resto || p.para) return null;
      const alvo = new URL(p.resto, p.origem.replace(/\/?$/, '/'));
      if (!p.servico && /\.github\.io$/.test(alvo.hostname)) alvo.searchParams.set('_at', String(Math.floor(Date.now() / 30000)));
      const h = new Headers(); if (p.assinar && s) { const ps = await passe(env, s.e, alvo.host); if (ps) h.set('x-porteiro-passe', ps); }
      const pedido = new Request(alvo, { method: 'HEAD', headers: h, redirect: 'manual' });
      const r = p.servico && env[p.servico] ? await env[p.servico].fetch(pedido) : await fetch(pedido, { cf: { cacheTtl: -1, cacheEverything: false } });
      v = r.ok ? (r.headers.get('etag') || r.headers.get('last-modified')) : null;
    }
  } catch { v = null; }
  if (v) v = [...new Uint8Array(await crypto.subtle.digest('SHA-1', enc.encode(v)))].slice(0, 6).map(x => x.toString(16).padStart(2, '0')).join('');
  VERS.set(u, { v, t: Date.now() }); if (VERS.size > 3000) VERS.clear();
  return v;
}
async function comVersoes(env, html, paginaUrl, s) {
  const base = (() => { const m = html.match(/<base\s[^>]*href=["']([^"']+)["']/i); try { return new URL(m ? m[1] : '', paginaUrl); } catch { return new URL(paginaUrl); } })();
  const re = /(<(?:script)\b[^>]*?\bsrc=|<link\b(?=[^>]*\brel=["']?(?:stylesheet|modulepreload|preload)\b)[^>]*?\bhref=)(["'])([^"']+)\2/gi;
  const achados = []; let m;
  while ((m = re.exec(html)) && achados.length < 45) {
    const src = m[3]; if (/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(src) || /[?&]_ev=/.test(src)) continue;
    let abs; try { abs = new URL(src, base); } catch { continue; } if (abs.origin !== new URL(paginaUrl).origin) continue;
    achados.push({ i: m.index + m[1].length + 1, src, u: abs.origin + abs.pathname });
  }
  if (!achados.length) return html;
  const vs = await Promise.all(achados.map(a => versaoDe(env, a.u, s)));
  let out = '', pos = 0;
  achados.forEach((a, k) => { if (!vs[k]) return; out += html.slice(pos, a.i) + a.src + (a.src.includes('?') ? '&' : '?') + '_ev=' + vs[k]; pos = a.i + a.src.length; });
  return out + html.slice(pos);
}
// "não mudou" sem ETag: a Cloudflare tira o ETag das páginas HTML deste endereço (ela mexe no HTML), então a página
// leva um Last-Modified tirado do próprio conteúdo (sempre o mesmo para a mesma página) e o navegador devolve ele
function dataDaVersao(hex) { const n = parseInt(hex.slice(0, 8), 16) % (5 * 365 * 86400); return new Date(Date.UTC(2020, 0, 1) + n * 1000).toUTCString(); }
const naoMudou = (req, et, lm) => (req.headers.get('if-none-match') || '').split(',').map(x => x.trim()).includes(et) || (!!lm && req.headers.get('if-modified-since') === lm);
async function repassa(req, url, p, env, s) {
  if (p.nuvem && /(^|\/)dados\/sons-url\.json$/.test(p.resto)) return json({ url: url.origin + '/nuvem' }); // servidor de sons pelo porteiro
  const alvo = new URL(p.resto + url.search, p.origem.replace(/\/?$/, '/'));
  // GitHub Pages guarda cada arquivo por 10 min no cache dele: um número que muda a cada 30 s faz a atualização chegar logo para todo mundo
  if (!p.servico && req.method === 'GET' && /\.github\.io$/.test(alvo.hostname)) alvo.searchParams.set('_at', String(Math.floor(Date.now() / 30000)));
  const h = new Headers(req.headers); h.delete('cookie'); h.delete('host'); h.delete('x-porteiro-passe');
  if (p.assinar) { const ps = await passe(env, s.e, alvo.host); if (!ps) return new Response('O porteiro está sem a ASSINATURA. Rode a Action de publicação de novo.', { status: 503 }); h.set('x-porteiro-passe', ps); }
  const pedido = new Request(alvo, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body, redirect: 'manual' });
  // worker da mesma conta: só dá para chamar pela ligação direta (Service Binding); os outros, pela internet
  // sem cópia guardada no meio do caminho (cache da Cloudflare): senão o "Atualizar todos os sites" recebia de volta a versão
  // antiga dos scripts por até 10 minutos. O navegador continua guardando e confere com o ETag (no-cache), então não fica mais lento.
  let r = p.servico && env[p.servico] ? await env[p.servico].fetch(pedido) : await fetch(pedido, { cf: { cacheTtl: -1, cacheEverything: false } });
  if ([301, 302, 307, 308].includes(r.status)) { // a origem pediu outro endereço (ex.: faltou a barra no fim): traduz para o nosso
    const loc = new URL(r.headers.get('location'), alvo), raiz = new URL(p.origem.replace(/\/?$/, '/'));
    if (loc.origin === raiz.origin && loc.pathname.startsWith(raiz.pathname)) return Response.redirect(new URL(p.pref.replace(/\/?$/, '/') + loc.pathname.slice(raiz.pathname.length) + loc.search, url).href, 302);
    return r;
  }
  const out = new Headers(r.headers);
  out.set('cache-control', 'private, no-cache'); out.set('x-robots-tag', 'noindex'); out.delete('set-cookie');
  if (url.searchParams.has('_ev') && r.ok) out.set('cache-control', IMUTAVEL); // arquivo com carimbo de versão: guarda de vez
  if (r.ok && (out.get('content-type') || '').includes('text/html')) {
    let h = await r.text();
    if (p.nuvem || p.conta) { const m = h.match(/<head[^>]*>/i);
    const carregando = p.conta && !h.includes('estudio-login.js') && !h.includes('estudio-carregando.js') ? '<script src="/estudio-carregando.js"></script>' : '';
    // ícone da aba: cada programa usa o próprio logo; o do menu só entra nas páginas que não têm ícone nenhum
    const icone = !/<link[^>]+rel=["']?(shortcut )?icon/i.test(h) ? '<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icone-180.png">' : '';
    const extra = carregando + icone + (p.nuvem ? NUVEM_JS : '') + (p.conta && !h.includes('estudio-conta.js') ? '<script src="/estudio-conta.js" defer></script>' : '');
    h = m ? h.slice(0, m.index + m[0].length) + extra + h.slice(m.index + m[0].length) : extra + h; }
    try { h = await comVersoes(env, h, url.href, s); } catch { }
    out.delete('content-length'); out.delete('content-encoding'); out.delete('etag'); out.delete('last-modified');
    // ETag da página já montada: se o navegador já tem esta versão, responde "não mudou" (304) e ele não baixa de novo
    // (a página dos Shorts tem mais de 1 MB: sem isto ela vinha inteira a cada abertura)
    const et = '"ep-' + [...new Uint8Array(await crypto.subtle.digest('SHA-1', enc.encode(h)))].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('') + '"';
    const lm = dataDaVersao(et.slice(4)); out.set('etag', et); out.set('last-modified', lm);
    if (naoMudou(req, et, lm)) return new Response(null, { status: 304, headers: out });
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
  if (p.google?.nome === g.nome && p.google?.foto === g.foto && Date.now() - (p.visto || 0) < 6 * 36e5) return; // nada mudou: não grava (o KV grátis tem limite de gravações por dia)
  await env.PERFIS.put(chavePerfil(email), JSON.stringify({ ...p, google: g, visto: Date.now() })).catch(() => { }); // visto = último login (aparece na tela Acesso)
}
function contaPublica(email, p) {
  const nomeG = p.google?.nome || String(email).split('@')[0], fotoG = p.google?.foto || null;
  return { email, nome: p.nome || nomeG, foto: p.fotoV ? '/conta/foto?v=' + p.fotoV : fotoG, nomeGoogle: nomeG, fotoGoogle: fotoG,
    nomeProprio: !!p.nome, fotoPropria: !!p.fotoV, fundo: p.fundo === 'cor' ? 'cor' : 'padrao', cor: /^#[0-9a-f]{6}$/i.test(p.cor || '') ? p.cor : '#262626' };
}
/* ---------- ADM › Nuvem: abrir/baixar um arquivo da nuvem da equipe (o servidor turma-ia confere se é ADM) ---------- */
async function nuvemArq(req, env, url) {
  const s = await leSessao(env, req); if (!s) return json({ error: { message: 'Entre pelo menu do Estúdio Problems.' } }, 401);
  const auth = req.headers.get('authorization') || ''; if (!/^Bearer \S+/.test(auth)) return json({ error: { message: 'Faltou o login do Google.' } }, 401);
  const ped = new Request(env.SERVIDOR.replace(/\/+$/, '') + '/nuvem-uso/arq' + url.search, { headers: { authorization: auth, origin: url.origin } });
  let r; try { r = env.TURMA ? await env.TURMA.fetch(ped) : await fetch(ped); } catch (e) { if (/10048|free usage limit|limit exceeded for the day|for today/i.test(String(e?.message || e))) return avisoLimitePorteiro(e); return json({ error: { message: 'O porteiro não conseguiu falar com o servidor do Estúdio Problems.' } }, 502); }
  const h = new Headers(r.headers); h.set('cache-control', 'no-store'); h.delete('set-cookie'); for (const k of [...h.keys()]) if (k.startsWith('access-control-')) h.delete(k);
  return new Response(r.body, { status: r.status, headers: h });
}
/* ---------- ADM › Nuvem dos sons (Cloudflare antiga, worker sons-problems): ver, ouvir, baixar e apagar ----------
   Só para quem é ADM (marca da sessão). O passe vai assinado com a: 1 — o servidor dos sons só abre /adm/ com ele. */
async function nuvemSons(req, env, url, caminho) {
  const s = await leSessao(env, req); if (!s) return json({ error: { message: 'Entre pelo menu do Estúdio Problems.' } }, 401);
  if (!s.a) return json({ error: { message: 'Só quem é ADM vê a nuvem dos sons.' } }, 403);
  if (req.method !== 'GET' && (req.headers.get('origin') || '') !== url.origin) return json({ error: { message: 'Pedido de outro site.' } }, 403);
  const rota = caminho.slice('/nuvem-sons/'.length); if (!['uso', 'arq', 'apagar'].includes(rota)) return json({ error: { message: 'Caminho desconhecido.' } }, 404);
  const o = projetos(env)['/nuvem/'], origem = typeof o === 'string' ? o : o?.origem; if (!origem) return json({ error: { message: 'Falta o /nuvem/ em PROJETOS.' } }, 501);
  const alvo = new URL('adm/' + rota + url.search, origem.replace(/\/?$/, '/')), ps = await passe(env, s.e, alvo.host, { a: 1 });
  if (!ps) return json({ error: { message: 'O porteiro está sem a ASSINATURA. Rode a Action de publicação de novo.' } }, 503);
  let r; try { r = await fetch(new Request(alvo, { method: req.method, headers: { 'x-porteiro-passe': ps, 'content-type': req.headers.get('content-type') || 'application/json' }, body: req.method === 'POST' ? await req.text() : undefined })); }
  catch { return json({ error: { message: 'O porteiro não conseguiu falar com o servidor dos sons.' } }, 502); }
  const h = new Headers(r.headers); h.set('cache-control', 'no-store'); h.delete('set-cookie'); for (const k of [...h.keys()]) if (k.startsWith('access-control-')) h.delete(k);
  return new Response(r.body, { status: r.status, headers: h });
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
      let r, j; try { r = env.TURMA ? await env.TURMA.fetch(ped) : await fetch(ped); j = await r.json().catch(() => ({})); } catch (e) { if (/10048|free usage limit|limit exceeded for the day|for today/i.test(String(e?.message || e))) return avisoLimitePorteiro(e); return json({ error: { message: 'O porteiro não conseguiu falar com o servidor do Estúdio Problems.' } }, 502); }
      if (!r.ok) return json({ error: j.error || { message: 'Sem permissão.' } }, [400, 401, 403].includes(r.status) ? r.status : 502);
      apagados += +j.apagados || 0;
    }
    if (fs.length) { // fotos de perfil: só quem o servidor confirmou como ADM há pouco (marca da leitura da nuvem)
      if (!s.a) return json({ error: { message: 'Só ADM apaga fotos de perfil.' } }, 403);
      for (const r of fs) { const [, id, v] = r.split(':'), em = await emailDoCodigo(env, id); if (!em || !/^\d+$/.test(v || '')) continue;
        await env.PERFIS.delete(chaveFoto(em) + ':' + v); apagados++;
        const p = await lePerfil(env, em); if (String(p.fotoV) === v) { delete p.fotoV; await env.PERFIS.put(chavePerfil(em), JSON.stringify(p)); } }
    }
    return json({ ok: true, apagados });
  }
  const pedido = new Request(env.SERVIDOR.replace(/\/+$/, '') + '/nuvem-uso', { headers: { authorization: auth, origin: url.origin } });
  let r, j; try { r = env.TURMA ? await env.TURMA.fetch(pedido) : await fetch(pedido); j = await r.json().catch(() => ({})); } catch (e) { if (/10048|free usage limit|limit exceeded for the day|for today/i.test(String(e?.message || e))) return avisoLimitePorteiro(e); return json({ error: { message: 'O porteiro não conseguiu falar com o servidor do Estúdio Problems.' } }, 502); }
  if (!r.ok) return json({ error: j.error || { message: 'Sem permissão.' } }, [400, 401, 403, 404, 501].includes(r.status) ? r.status : 502);
  const perfis = new Map();
  const quem = async email => { if (!email) return {}; email = String(email).toLowerCase(); if (/^u[0-9a-f]{16}$/.test(email)) email = (await emailDoCodigo(env, email)) || email; // o turma-ia já manda o código no lugar do e-mail
    if (!perfis.has(email)) { const p = await lePerfil(env, email);
    perfis.set(email, { porNome: p.nome || p.google?.nome || (email.includes('@') ? mascara(email) : 'Alguém da equipe'), porFoto: p.fotoV ? '/pessoa/foto?u=' + (await codigoU(email)) + '&v=' + p.fotoV : (p.google?.foto || null) }); } return perfis.get(email); }; // /pessoa/foto: qualquer pessoa da equipe vê (a /acesso/foto é só do ADM)
  const PROJ = { personagens: 'Animador', cenarios: 'Animador', menu: 'Menu do Estúdio', fotos: 'Menu do Estúdio', acesso: 'Menu do Estúdio', conhecimento: 'Shorts', equipe: 'Geral', outros: 'Geral' };
  const G = {}, grupo = (id, nome) => G[id] || (G[id] = { id, nome, projeto: PROJ[id] || 'Geral', bytes: 0, n: 0, itens: [] });
  const NOMES = { cenarios: 'Cenários', menu: 'Fundos e links do menu', equipe: 'Arquivos da equipe', conhecimento: 'Conhecimento da IA', acesso: 'Lista de quem entra' };
  const pers = {};
  for (const it of j.itens || []) {
    const tam = +it.tam || 0, raiz = it.k.split('/')[0];
    if (it.k === 'personagens/pastas.json') continue; // as pastas da biblioteca do Animador (não é um personagem)
    if (raiz === 'personagens') {
      const slug = it.k.split('/')[1] || '?', g = grupo('personagens', 'Personagens'), c = pers[slug] || (pers[slug] = { nome: humano(slug), bytes: 0, n: 0, em: null, por: null, imagens: 0 });
      c.ref = 'k:personagens/' + slug + '/'; (c.arqs || (c.arqs = [])).push({ k: it.k, tam, tipo: it.tipo || '' }); c.bytes += tam; c.n++; if (/\/img\//.test(it.k)) c.imagens++; if (it.k.endsWith('personagem.json')) { if (it.nome) c.nome = it.nome; c.por = it.por; c.em = it.em; } g.bytes += tam; continue;
    }
    const g = grupo(NOMES[raiz] ? raiz : 'outros', NOMES[raiz] || 'Outros'); g.bytes += tam; g.n++;
    g.itens.push({ nome: it.nome || it.k.split('/').pop().replace(/^\d{10,}_/, ''), bytes: tam, tipo: it.tipo || '', em: it.em || null, ia: !!it.ia, ...(['acesso/extras', 'menu/links'].includes(it.k) ? { protegido: raiz === 'acesso' ? 'Mude na aba Quem pode entrar' : 'Mude na aba Botões' } : { ref: 'k:' + it.k }), ...(await quem(it.por)) });
  }
  for (const c of Object.values(pers)) { const g = G.personagens; g.n++; g.itens.push({ nome: c.nome, bytes: c.bytes, tipo: 'personagem', ref: c.ref, arqs: c.arqs || [], info: `${c.imagens} imagens`, em: c.em, ...(await quem(c.por)) }); }
  // fotos de perfil (KV PERFIS, mesma conta da Cloudflare: o 1 GB grátis é dividido entre todos)
  if (env.PERFIS) {
    const g = grupo('fotos', 'Fotos de perfil'); let cur, k = 0;
    do { const l = await env.PERFIS.list({ prefix: 'f:', cursor: cur }); for (const x of l.keys) {
      let tam = +x.metadata?.tam || 0; if (!tam && k++ < 300) { const v = await env.PERFIS.get(x.name, { type: 'arrayBuffer' }).catch(() => null); tam = v ? v.byteLength : 0; }
      const email = x.name.slice(2).replace(/:\d+$/, ''), v = (x.name.match(/:(\d+)$/) || [])[1]; g.bytes += tam; g.n++;
      g.itens.push({ nome: (await quem(email)).porNome, bytes: tam, tipo: x.metadata?.tipo || 'image', ...(v ? { ref: 'f:' + await codigoU(email) + ':' + v } : {}), ...(await quem(email)) });
    } cur = l.list_complete ? null : l.cursor; } while (cur);
  }
  const grupos = Object.values(G).filter(g => g.n).map(g => ({ ...g, itens: g.itens.sort((a, b) => b.bytes - a.bytes) })).sort((a, b) => b.bytes - a.bytes);
  const P = {}; for (const g of grupos) (P[g.projeto] || (P[g.projeto] = { nome: g.projeto, bytes: 0, grupos: [] })).grupos.push(g), P[g.projeto].bytes += g.bytes;
  return json({ adm: !!s.a, limite: j.limite || 1073741824, total: grupos.reduce((t, g) => t + g.bytes, 0), grupos, projetos: Object.values(P).sort((a, b) => b.bytes - a.bytes) });
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
    if (!s.a) return new Response('sem permissão', { status: 403, headers: { 'cache-control': 'no-store' } }); // ADM: vem da sessão (o servidor confirmou no login)
    const em = await emailDoCodigo(env, url.searchParams.get('id') || '');
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
  } catch (e) { if (/10048|free usage limit|limit exceeded for the day|for today/i.test(String(e?.message || e))) return avisoLimitePorteiro(e); return json({ error: { message: 'O porteiro não conseguiu falar com o servidor do Estúdio Problems.' } }, 502); }
  if (!r.ok) return json({ error: j.error || { message: 'Sem permissão para gerenciar o acesso.' } }, [400, 401, 403, 404].includes(r.status) ? r.status : 502);
  // monta a lista com nome/foto da conta (personalizado e original do Google)
  const admins = new Set(j.admins || []), base = j.base || [], extras = j.extras || [], itens = [];
  const on = env.PRESENCA ? await presenca(env).catch(() => ({})) : {};
  await Promise.all([...base.map(e => [e, true, null]), ...extras.map(x => [x.email, false, x])].map(async ([email, fixo, info], ordem) => { try { // todos ao mesmo tempo (antes um por um)
    const id = await idDe(email), p = await lePerfil(env, email), cu = await codigoU(email); COD.set(cu, email);
    const nomeG = p.google?.nome || '', fotoG = p.google?.foto || '';
    itens.push({ id, mascara: mascara(email), voce: email === s.e.toLowerCase(), fixo, adm: admins.has(email),
      nome: p.nome || nomeG || '', nomeOriginal: nomeG, nomeProprio: !!p.nome, foto: p.fotoV ? '/pessoa/foto?u=' + cu + '&v=' + p.fotoV : fotoG, fotoOriginal: fotoG, fotoPropria: !!p.fotoV,
      visto: p.visto || null, online: on[email]?.prog || null, em: info?.em || null, ...(info?.por ? await (async () => { const q = await lePerfil(env, info.por); return { porNome: q.nome || q.google?.nome || mascara(info.por), porFoto: q.fotoV ? '/pessoa/foto?u=' + (await codigoU(info.por)) + '&v=' + q.fotoV : (q.google?.foto || null) }; })() : {}), ordem });
  } catch { } }));
  itens.sort((a, b) => a.ordem - b.ordem); itens.forEach(x => delete x.ordem);
  return json({ itens });
}
/* ---------- quem fez uma mudança: nome e foto da conta (no lugar do e-mail) ----------
   GET /pessoa?e=<e-mail> → { nome, foto }. Só para quem entrou; só de quem já entrou no Estúdio (tem conta aqui).
   O e-mail não volta na resposta; sem conta, devolve o e-mail censurado no lugar do nome. */
// código de pessoa que os programas guardam nos arquivos (Animador: "u" + 16 hex do SHA-256 de "estudio-problems:<e-mail>"),
// para mostrar SEMPRE o nome e a foto de agora de quem subiu/editou, sem o e-mail nunca sair daqui
async function codigoU(email) { const b = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('estudio-problems:' + email))); return 'u' + [...b].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join(''); }
// código → e-mail: memória → lista de pessoas das Mensagens (objeto durável, sem limite diário) → KV. Nunca grava em massa no KV.
const COD = new Map(); let codVarrido = 0;
async function emailDoCodigo(env, u) {
  if (!/^u[0-9a-f]{16}$/.test(u || '')) return null;
  if (COD.has(u)) return COD.get(u);
  if (env.CONVERSAS) { try { for (const r of (await conversas(env, { op: 'pessoas' })).j || []) if (r.u && r.e) COD.set(r.u, r.e); } catch { } if (COD.has(u)) return COD.get(u); }
  if (!env.PERFIS) return null;
  const k = await env.PERFIS.get('u:' + u).catch(() => null); if (k) { COD.set(u, k); return k; }
  if (Date.now() - codVarrido < 10 * 6e4) return null; codVarrido = Date.now(); // varre os perfis no máximo a cada 10 min (só leitura)
  let cur; try { do { const l = await env.PERFIS.list({ prefix: 'p:', cursor: cur }); for (const x of l.keys) { const em = x.name.slice(2); COD.set(await codigoU(em), em); } cur = l.list_complete ? null : l.cursor; } while (cur); } catch { }
  return COD.get(u) || null;
}
async function pessoa(req, env, url) {
  const s = await leSessao(env, req);
  if (!s) return json({ error: { message: 'Entre pelo menu do Estúdio Problems.' } }, 401);
  const u = url.searchParams.get('u');
  const porCodigo = !!u; // pedido pelo código: a resposta nunca leva o e-mail (nem no endereço da foto)
  if (u) { const e2 = await emailDoCodigo(env, u); if (!e2) return json({ nome: null, foto: null, conta: false }, 200, { 'cache-control': 'private, max-age=300' }); url.searchParams.delete('u'); url.searchParams.set('e', e2); }
  const em = String(url.searchParams.get('e') || '').trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+$/.test(em)) return json({ error: { message: 'E-mail inválido.' } }, 400);
  const p = env.PERFIS ? await lePerfil(env, em) : {};
  if (url.pathname === '/pessoa/foto') {
    if (!p.fotoV) return new Response('sem foto', { status: 404, headers: { 'cache-control': 'no-store' } });
    let r = await env.PERFIS.getWithMetadata(chaveFoto(em) + ':' + p.fotoV, { type: 'stream' }); if (!r.value) r = await env.PERFIS.getWithMetadata(chaveFoto(em), { type: 'stream' });
    if (!r.value) return new Response('sem foto', { status: 404, headers: { 'cache-control': 'no-store' } });
    return new Response(r.value, { headers: { 'content-type': r.metadata?.tipo || 'image/png', 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
  }
  if (!p.google && !p.nome) return json({ nome: porCodigo ? null : mascara(em), foto: null, conta: false }, 200, { 'cache-control': 'private, max-age=300' });
  const nomeG = p.google?.nome || (porCodigo ? null : mascara(em));
  return json({ nome: p.nome || nomeG, foto: p.fotoV ? (porCodigo ? '/pessoa/foto?u=' + encodeURIComponent(u) : '/pessoa/foto?e=' + encodeURIComponent(em)) + '&v=' + p.fotoV : (p.google?.foto || null), conta: true }, 200, { 'cache-control': 'private, max-age=300' });
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
/* ---------- Mensagens: conversa geral + conversas privadas (objeto durável "Conversas", banco SQLite dele) ----------
   As mensagens guardam só o CÓDIGO da pessoa (u…), nunca o e-mail; tudo com mais de 7 dias é apagado sozinho. */
const SETE_DIAS = 7 * 864e5;
const convDe = (eu, para) => para === 'geral' ? 'geral' : /^g:[a-z0-9]{10}$/.test(para) ? para : 'p:' + [eu, para].sort().join('|'); // g:… = grupo criado por um ADM
const minhaConv = (u, c) => c === 'geral' || (c.startsWith('p:') && c.slice(2).split('|').includes(u)); // grupos: o objeto confere (this.minha)
const paraValido = (u, p) => p === 'geral' || /^g:[a-z0-9]{10}$/.test(p) || (/^u[0-9a-f]{16}$/.test(p) && p !== u);
export class Conversas {
  constructor(state) {
    this.st = state.storage; this.sql = state.storage.sql; this.limpo = 0;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS pessoas(u TEXT PRIMARY KEY, e TEXT, v INTEGER);
      CREATE TABLE IF NOT EXISTS msgs(id INTEGER PRIMARY KEY AUTOINCREMENT, conv TEXT, de TEXT, texto TEXT, em INTEGER);
      CREATE INDEX IF NOT EXISTS msgs_conv ON msgs(conv, id);
      CREATE TABLE IF NOT EXISTS lidas(u TEXT, conv TEXT, ate INTEGER, PRIMARY KEY(u, conv));`);
    this.sql.exec('CREATE TABLE IF NOT EXISTS cfg(k TEXT PRIMARY KEY, v TEXT)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS apelidos(u TEXT, alvo TEXT, nick TEXT, PRIMARY KEY(u, alvo))'); // apelido que CADA pessoa dá às outras (só ela vê) // nome e foto da conversa geral (ADM muda)
    this.sql.exec('CREATE TABLE IF NOT EXISTS grupos(id TEXT PRIMARY KEY, nome TEXT, foto TEXT, membros TEXT, por TEXT, em INTEGER)'); // grupos que um ADM cria (membros: JSON com os códigos)
    // denúncias: cópia da mensagem e da conversa em volta (não some com a limpeza de 7 dias)
    this.sql.exec('CREATE TABLE IF NOT EXISTS denuncias(id INTEGER PRIMARY KEY AUTOINCREMENT, msg INTEGER, conv TEXT, de TEXT, por TEXT, motivo TEXT, copia TEXT, contexto TEXT, em INTEGER, estado TEXT, nota TEXT, mexeu TEXT, mexeuEm INTEGER)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS entregas(u TEXT PRIMARY KEY, ate INTEGER)'); // até qual mensagem cada pessoa já recebeu (✓✓ cinza)
    try { this.sql.exec('ALTER TABLE msgs ADD COLUMN cita TEXT'); } catch { }
    try { this.sql.exec('ALTER TABLE msgs ADD COLUMN apagada INTEGER'); } catch { } // apagada para todos: some para a equipe, o ADM ainda vê // citação (programa, item, parte, arquivo anexo)
    this.ritmo = new Map();
  }
  vis(r, ver) { return r && r.apagada && !ver ? { ...r, texto: '', cita: null } : r; } // ver = ADM olhando pela aba ADM
  limpa() { const t = Date.now(); if (t - this.limpo < 36e5) return; this.limpo = t; this.sql.exec('DELETE FROM msgs WHERE em < ?', t - SETE_DIAS); }
  minhas(u) { return `(conv = 'geral' OR conv LIKE 'p:' || '${u}' || '|%' OR conv LIKE 'p:%|' || '${u}' OR conv IN (SELECT 'g:' || id FROM grupos WHERE membros LIKE '%"${u}"%'))`; } // u já conferido: u + 16 hex
  minha(u, c) { if (minhaConv(u, c)) return true; const m = /^g:([a-z0-9]{10})$/.exec(c); return !!m && this.sql.exec('SELECT 1 FROM grupos WHERE id = ? AND membros LIKE ?', m[1], '%"' + u + '"%').toArray().length > 0; }
  grupo(g) { let membros = []; try { membros = JSON.parse(g.membros || '[]'); } catch { } return { id: 'g:' + g.id, nome: g.nome, foto: g.foto || null, membros }; }
  async fetch(req) {
    const b = await req.json(), agora = Date.now(); this.limpa();
    const u = /^u[0-9a-f]{16}$/.test(b.u || '') ? b.u : null;
    if (b.op === 'pessoa') { if (u && b.e) this.sql.exec('INSERT INTO pessoas(u,e,v) VALUES(?,?,?) ON CONFLICT(u) DO UPDATE SET e=excluded.e, v=excluded.v', u, b.e, agora); return Response.json({ ok: true }); }
    if (b.op === 'semear') { for (const p of b.lista || []) if (/^u[0-9a-f]{16}$/.test(p.u)) this.sql.exec('INSERT OR IGNORE INTO pessoas(u,e,v) VALUES(?,?,?)', p.u, p.e, +p.v || 0); return Response.json({ ok: true }); }
    if (b.op === 'pessoas') return Response.json(this.sql.exec('SELECT u, e, v FROM pessoas').toArray());
    if (!u) return Response.json({ erro: 'sem pessoa' }, { status: 400 });
    if (b.e) { const r = this.sql.exec('SELECT v FROM pessoas WHERE u = ?', u).toArray()[0]; if (!r || agora - r.v > 6e5) this.sql.exec('INSERT INTO pessoas(u,e,v) VALUES(?,?,?) ON CONFLICT(u) DO UPDATE SET e=excluded.e, v=excluded.v', u, b.e, agora); }
    const M = this.minhas(u);
    if (b.op === 'resumo') {
      const lidas = Object.fromEntries(this.sql.exec('SELECT conv, ate FROM lidas WHERE u = ?', u).toArray().map(r => [r.conv, r.ate]));
      const nao = {}, mencoes = {}, marca = '<@' + u + '>'; let mencaoId = 0; // @menção: o texto guarda <@código>
      for (const r of this.sql.exec(`SELECT conv, id, de, instr(texto, ?) > 0 AS men FROM msgs WHERE ${M}`, marca).toArray()) if (r.de !== u && r.id > (lidas[r.conv] || 0)) {
        nao[r.conv] = (nao[r.conv] || 0) + 1; if (r.men) { mencoes[r.conv] = (mencoes[r.conv] || 0) + 1; mencaoId = Math.max(mencaoId, r.id); } }
      const ultimas = {}; for (const r of this.sql.exec(`SELECT * FROM msgs WHERE id IN (SELECT MAX(id) FROM msgs WHERE ${M} GROUP BY conv)`).toArray()) ultimas[r.conv] = this.vis(r, b.ver);
      const desde = Math.max(0, +b.desde || 0);
      const novas = desde ? this.sql.exec(`SELECT * FROM msgs WHERE (id > ? OR apagada > ?) AND ${M} ORDER BY id LIMIT 300`, desde, agora - 120000).toArray().map(r => this.vis(r, b.ver)) : []; // apagadas há pouco voltam para a tela trocar
      const ultimo = this.sql.exec('SELECT MAX(id) AS m FROM msgs').toArray()[0]?.m || 0;
      if (!b.ver && ultimo) this.sql.exec('INSERT INTO entregas(u,ate) VALUES(?,?) ON CONFLICT(u) DO UPDATE SET ate=excluded.ate WHERE excluded.ate > entregas.ate', u, ultimo); // recebeu tudo até aqui
      let geral = null; try { geral = JSON.parse(this.sql.exec("SELECT v FROM cfg WHERE k = 'geral'").toArray()[0]?.v || 'null'); } catch { }
      const apelidos = Object.fromEntries(this.sql.exec('SELECT alvo, nick FROM apelidos WHERE u = ?', u).toArray().map(r => [r.alvo, r.nick]));
      const grupos = this.sql.exec('SELECT * FROM grupos WHERE membros LIKE ? ORDER BY nome', '%"' + u + '"%').toArray().map(g => this.grupo(g));
      const todosGrupos = b.adm ? this.sql.exec('SELECT * FROM grupos ORDER BY nome').toArray().map(g => this.grupo(g)) : undefined;
      const denuncias = b.adm ? this.sql.exec("SELECT COUNT(*) AS n FROM denuncias WHERE estado = 'aberta'").toArray()[0]?.n || 0 : undefined;
      return Response.json({ nao, mencoes, mencaoId, ultimas, novas, ultimo, geral, apelidos, grupos, todosGrupos, denuncias });
    }
    if (b.op === 'vistos' || b.op === 'conversa') { // ✓ enviada · ✓✓ recebida · ✓✓ azul lida (por quem está na conversa)
      const conv = String(b.conv || ''); if (!this.minha(u, conv)) return Response.json({ erro: 'Conversa de outras pessoas.' }, { status: 403 });
      let part = [];
      if (conv === 'geral') part = this.sql.exec('SELECT u FROM pessoas').toArray().map(r => r.u);
      else if (conv.startsWith('g:')) { try { part = JSON.parse(this.sql.exec('SELECT membros FROM grupos WHERE id = ?', conv.slice(2)).toArray()[0]?.membros || '[]'); } catch { } }
      else part = conv.slice(2).split('|');
      part = part.filter(x => x !== u);
      const lidas = {}, entregues = {};
      for (const r of this.sql.exec('SELECT u, ate FROM lidas WHERE conv = ?', conv).toArray()) if (part.includes(r.u)) lidas[r.u] = r.ate;
      for (const r of this.sql.exec('SELECT u, ate FROM entregas').toArray()) if (part.includes(r.u)) entregues[r.u] = r.ate;
      b.vistos = { part, lidas, entregues };
      if (b.op === 'vistos') return Response.json(b.vistos);
    }
    if (b.op === 'conversa') {
      const conv = String(b.conv || ''); if (!this.minha(u, conv)) return Response.json({ erro: 'Conversa de outras pessoas.' }, { status: 403 });
      // mais leve: desde = só o que chegou depois da última que a tela já tem (+ apagadas há pouco); antes = página mais antiga ao rolar para cima
      const desde = Math.max(0, +b.desde || 0), antes = Math.max(0, +b.antes || 0), N = 80;
      if (desde) return Response.json({ vistos: b.vistos, delta: true, msgs: this.sql.exec('SELECT * FROM msgs WHERE conv = ? AND (id > ? OR apagada > ?) ORDER BY id LIMIT 300', conv, desde, agora - 7 * 864e5).toArray().map(r => this.vis(r, b.ver)),
        ids: this.sql.exec('SELECT MIN(id) AS a FROM msgs WHERE conv = ?', conv).toArray()[0]?.a || 0 }); // a = a mais antiga que ainda existe (o que for menor foi limpo)
      const l = this.sql.exec(`SELECT * FROM msgs WHERE conv = ?${antes ? ' AND id < ?' : ''} ORDER BY id DESC LIMIT ${N + 1}`, ...(antes ? [conv, antes] : [conv])).toArray();
      return Response.json({ vistos: b.vistos, mais: l.length > N, msgs: l.slice(0, N).reverse().map(r => this.vis(r, b.ver)) });
    }
    if (b.op === 'lida') {
      const conv = String(b.conv || ''); if (!this.minha(u, conv)) return Response.json({ ok: false });
      this.sql.exec('INSERT INTO lidas(u,conv,ate) VALUES(?,?,?) ON CONFLICT(u,conv) DO UPDATE SET ate=MAX(ate, excluded.ate)', u, conv, +b.ate || 0);
      return Response.json({ ok: true });
    }
    if (b.op === 'apelido') {
      const alvo = String(b.alvo || ''), nick = String(b.nick || '').replace(/\s+/g, ' ').trim().slice(0, 30); if (!/^u[0-9a-f]{16}$/.test(alvo)) return Response.json({ erro: 'Pessoa?' }, { status: 400 });
      if (nick) this.sql.exec('INSERT INTO apelidos(u,alvo,nick) VALUES(?,?,?) ON CONFLICT(u,alvo) DO UPDATE SET nick=excluded.nick', u, alvo, nick); else this.sql.exec('DELETE FROM apelidos WHERE u = ? AND alvo = ?', u, alvo);
      return Response.json({ ok: true, alvo, nick });
    }
    if (b.op === 'apagar') { // apagar para todos: só quem enviou (ou um ADM)
      const m = this.sql.exec('SELECT * FROM msgs WHERE id = ?', +b.id || 0).toArray()[0];
      if (!m || (m.de !== u && !b.adm)) return Response.json({ erro: 'Só quem enviou apaga para todos.' }, { status: 403 });
      this.sql.exec('UPDATE msgs SET apagada = ? WHERE id = ? AND apagada IS NULL', agora, m.id); return Response.json({ ok: true, apagada: agora });
    }
    if (b.op === 'denunciar') {
      const m = this.sql.exec('SELECT * FROM msgs WHERE id = ?', +b.id || 0).toArray()[0];
      if (!m || !this.minha(u, m.conv)) return Response.json({ erro: 'Mensagem não encontrada.' }, { status: 404 });
      if (m.de === u) return Response.json({ erro: 'Não dá para denunciar a própria mensagem.' }, { status: 400 });
      if (this.sql.exec('SELECT 1 FROM denuncias WHERE msg = ? AND por = ?', m.id, u).toArray().length) return Response.json({ ok: true, ja: true });
      const ctx = [...this.sql.exec('SELECT * FROM msgs WHERE conv = ? AND id < ? ORDER BY id DESC LIMIT 15', m.conv, m.id).toArray().reverse(), m, ...this.sql.exec('SELECT * FROM msgs WHERE conv = ? AND id > ? ORDER BY id LIMIT 5', m.conv, m.id).toArray()];
      this.sql.exec("INSERT INTO denuncias(msg,conv,de,por,motivo,copia,contexto,em,estado) VALUES(?,?,?,?,?,?,?,?, 'aberta')", m.id, m.conv, m.de, u, String(b.motivo || '').trim().slice(0, 1000), JSON.stringify(m), JSON.stringify(ctx), agora);
      return Response.json({ ok: true });
    }
    if (b.op === 'denuncias') { // só ADM (o porteiro conferiu)
      const l = this.sql.exec('SELECT * FROM denuncias ORDER BY (estado = \'aberta\') DESC, id DESC LIMIT 300').toArray().map(r => ({ ...r, copia: JSON.parse(r.copia || 'null'), contexto: JSON.parse(r.contexto || '[]') }));
      const grupos = Object.fromEntries(this.sql.exec('SELECT * FROM grupos').toArray().map(g => ['g:' + g.id, g.nome]));
      const emails = Object.fromEntries(this.sql.exec('SELECT u, e FROM pessoas').toArray().map(r => [r.u, r.e])); // fica no porteiro (vira e-mail censurado)
      return Response.json({ denuncias: l, grupos, emails });
    }
    if (b.op === 'denuncia-estado') {
      const est = ['aberta', 'vista', 'resolvida'].includes(b.estado) ? b.estado : null; if (!est) return Response.json({ erro: 'Estado?' }, { status: 400 });
      this.sql.exec('UPDATE denuncias SET estado = ?, nota = COALESCE(?, nota), mexeu = ?, mexeuEm = ? WHERE id = ?', est, b.nota == null ? null : String(b.nota).slice(0, 2000), u, agora, +b.id || 0);
      return Response.json({ ok: true });
    }
    if (b.op === 'limpar') { // ADM: apaga as mensagens agora (uma conversa ou todas); as cópias das denúncias ficam
      const alvo = String(b.alvo || '');
      if (alvo === 'todas') { this.sql.exec('DELETE FROM msgs'); this.sql.exec('DELETE FROM lidas'); }
      else if (alvo === 'geral' || /^g:[a-z0-9]{10}$/.test(alvo) || /^p:u[0-9a-f]{16}\|u[0-9a-f]{16}$/.test(alvo)) { this.sql.exec('DELETE FROM msgs WHERE conv = ?', alvo); this.sql.exec('DELETE FROM lidas WHERE conv = ?', alvo); }
      else return Response.json({ erro: 'Qual conversa?' }, { status: 400 });
      return Response.json({ ok: true });
    }
    if (b.op === 'conversas-todas') { // ADM: lista das conversas que têm mensagens (para escolher qual limpar)
      return Response.json({ convs: this.sql.exec('SELECT conv, COUNT(*) AS n, MAX(em) AS em FROM msgs GROUP BY conv ORDER BY em DESC').toArray() });
    }
    if (b.op === 'pode') return Response.json({ pode: (b.convs || []).some(c => this.minha(u, String(c))) }); // arquivo anexado: está numa conversa desta pessoa?
    if (b.op === 'grupo') { // o porteiro já conferiu que é ADM
      const id = /^g:([a-z0-9]{10})$/.exec(String(b.id || ''))?.[1];
      if (b.acao === 'apagar') { if (id) { this.sql.exec('DELETE FROM grupos WHERE id = ?', id); this.sql.exec('DELETE FROM msgs WHERE conv = ?', 'g:' + id); this.sql.exec('DELETE FROM lidas WHERE conv = ?', 'g:' + id); } return Response.json({ ok: true }); }
      const nome = String(b.nome || '').replace(/\s+/g, ' ').trim().slice(0, 40); if (!nome) return Response.json({ erro: 'Dê um nome ao grupo.' }, { status: 400 });
      const conhecidos = new Set(this.sql.exec('SELECT u FROM pessoas').toArray().map(r => r.u));
      const membros = [...new Set((Array.isArray(b.membros) ? b.membros : []).map(String).filter(x => conhecidos.has(x)))].slice(0, 200);
      if (membros.length < 2) return Response.json({ erro: 'Escolha pelo menos 2 pessoas para o grupo.' }, { status: 400 });
      const foto = typeof b.foto === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(b.foto) && b.foto.length < 70000 ? b.foto : null;
      const novoId = id || [...crypto.getRandomValues(new Uint8Array(10))].map(x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join('');
      this.sql.exec('INSERT INTO grupos(id,nome,foto,membros,por,em) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, foto=excluded.foto, membros=excluded.membros', novoId, nome, foto, JSON.stringify(membros), u, agora);
      return Response.json({ grupo: this.grupo(this.sql.exec('SELECT * FROM grupos WHERE id = ?', novoId).toArray()[0]) });
    }
    if (b.op === 'geral') { // o porteiro já conferiu que é ADM
      const g = { nome: String(b.nome || '').trim().slice(0, 40) || null, foto: typeof b.foto === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(b.foto) && b.foto.length < 70000 ? b.foto : null, por: u, em: agora };
      this.sql.exec('INSERT INTO cfg(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', 'geral', JSON.stringify(g)); return Response.json({ geral: g });
    }
    if (b.op === 'enviar') {
      const para = String(b.para || '');
      if (para.startsWith('g:')) { if (!this.minha(u, para)) return Response.json({ erro: 'Você não está neste grupo.' }, { status: 403 }); }
      else if (para !== 'geral' && (!/^u[0-9a-f]{16}$/.test(para) || para === u || !this.sql.exec('SELECT 1 FROM pessoas WHERE u = ?', para).toArray().length)) return Response.json({ erro: 'Pessoa não encontrada.' }, { status: 400 });
      const texto = String(b.texto || '').replace(/\r\n?/g, '\n').trim().slice(0, 2000), cita = typeof b.cita === 'string' && b.cita.length <= 80000 ? b.cita : null; if (!texto && !cita) return Response.json({ erro: 'Mensagem vazia.' }, { status: 400 });
      const rt = (this.ritmo.get(u) || []).filter(t => agora - t < 60e3); if (rt.length >= 20) return Response.json({ erro: 'Muitas mensagens seguidas: espere um pouquinho.' }, { status: 429 });
      rt.push(agora); this.ritmo.set(u, rt);
      const conv = convDe(u, para);
      if (b.conv && b.conv !== conv) return Response.json({ erro: 'O arquivo foi preparado para outra conversa.' }, { status: 400 });
      const m = this.sql.exec('INSERT INTO msgs(conv,de,texto,em,cita) VALUES(?,?,?,?,?) RETURNING *', conv, u, texto, agora, cita).toArray()[0];
      this.sql.exec('INSERT INTO lidas(u,conv,ate) VALUES(?,?,?) ON CONFLICT(u,conv) DO UPDATE SET ate=MAX(ate, excluded.ate)', u, conv, m.id);
      return Response.json({ msg: m });
    }
    return Response.json({ erro: 'op?' }, { status: 400 });
  }
}
const conversas = async (env, corpo) => { const o = env.CONVERSAS.get(env.CONVERSAS.idFromName('estudio')); const r = await o.fetch('https://conversas/', { method: 'POST', body: JSON.stringify(corpo) }); return { status: r.status, j: await r.json() }; };
/* citação: o programa manda { prog, titulo, sub, mini, url, parte, anexo } — só caminhos deste endereço e textos curtos */
function limpaCita(c) {
  if (!c || typeof c !== 'object') return { erro: 'Citação inválida.' };
  const t = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
  const out = { prog: t(c.prog, 30), titulo: t(c.titulo, 120), sub: t(c.sub, 160) };
  if (!out.titulo) return { erro: 'A citação ficou sem nome.' };
  if (c.url) { const u = String(c.url); if (!/^\/(?![\/\\])[^\s]*$/.test(u) || u.length > 600) return { erro: 'Endereço da citação inválido.' }; out.url = u; }
  if (c.abrir) { const a = String(c.abrir); if (!/^\/(?![\/\\])[\w\/.-]*$/.test(a) || a.length > 120) return { erro: 'Programa da citação inválido.' }; out.abrir = a; }
  if (c.mini) { const m = String(c.mini); if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(m) || m.length > 60000) return { erro: 'Miniatura grande demais.' }; out.mini = m; }
  if (c.parte && typeof c.parte === 'object') { const p = JSON.stringify(c.parte); if (p.length > 4000) return { erro: 'Parte citada grande demais.' }; out.parte = JSON.parse(p); }
  if (c.anexo) { if (!/^[a-z0-9]{20}$/.test(c.anexo.id || '')) return { erro: 'Anexo inválido.' }; out.anexo = { id: c.anexo.id }; }
  if (!out.url && !out.anexo) return { erro: 'A citação precisa de um endereço ou de um arquivo.' };
  return { cita: out };
}
/* arquivo anexado a uma mensagem (projeto local: .animador etc.). Fica no KV PERFIS em pedaços de 20 MB e some sozinho em 7 dias.
   Só quem está na conversa para a qual ele foi enviado consegue baixar. */
const PEDACO = 20 * 1024 * 1024, ANEXO_MAX = 95 * 1024 * 1024;
async function anexo(req, env, url, s) {
  const e = String(s.e).toLowerCase(), u = await codigoU(e);
  if (req.method === 'POST') {
    if ((req.headers.get('origin') || '') !== url.origin) return json({ error: { message: 'Pedido de outro site.' } }, 403);
    const paras = [...new Set((url.searchParams.get('para') || '').split(',').filter(Boolean))].slice(0, 40); // pode ir para várias conversas (o mesmo arquivo)
    if (!paras.length || paras.some(para => !paraValido(u, para))) return json({ error: { message: 'Para quem?' } }, 400);
    const tam = +req.headers.get('content-length') || 0; if (tam > ANEXO_MAX) return json({ error: { message: 'Arquivo grande demais para mandar por mensagem (máximo 95 MB).' } }, 413);
    const nome = (url.searchParams.get('nome') || 'arquivo').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 120);
    const id = [...crypto.getRandomValues(new Uint8Array(20))].map(x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join(''), ttl = { expirationTtl: 7 * 86400 };
    // lê aos pedaços (não segura o arquivo inteiro na memória do porteiro) e guarda cada 20 MB
    const ler = req.body?.getReader(); if (!ler) return json({ error: { message: 'Arquivo vazio.' } }, 400);
    let buf = new Uint8Array(PEDACO), cheio = 0, n = 0, total = 0;
    const guarda = async () => { if (!cheio) return; await env.PERFIS.put('ax:' + id + ':' + n, buf.slice(0, cheio).buffer, ttl); n++; cheio = 0; };
    for (;;) { const { done, value } = await ler.read(); if (done) break;
      total += value.length; if (total > ANEXO_MAX) { for (let i = 0; i < n; i++) await env.PERFIS.delete('ax:' + id + ':' + i).catch(() => { }); return json({ error: { message: 'Arquivo grande demais (máximo 95 MB).' } }, 413); }
      let o = 0; while (o < value.length) { const k = Math.min(PEDACO - cheio, value.length - o); buf.set(value.subarray(o, o + k), cheio); cheio += k; o += k; if (cheio === PEDACO) await guarda(); } }
    await guarda(); if (!total) return json({ error: { message: 'Arquivo vazio.' } }, 400);
    await env.PERFIS.put('ax:' + id, JSON.stringify({ nome, bytes: total, n, convs: paras.map(p => convDe(u, p)), de: u, em: Date.now() }), ttl);
    return json({ id, nome, bytes: total });
  }
  const id = url.searchParams.get('id') || ''; if (!/^[a-z0-9]{20}$/.test(id)) return json({ error: { message: 'Arquivo inválido.' } }, 400);
  const meta = await env.PERFIS.get('ax:' + id, { type: 'json' }).catch(() => null);
  if (!meta) return json({ error: { message: 'Este arquivo não existe mais (as mensagens e os arquivos somem depois de 7 dias).' } }, 404);
  if (!s.a && !(meta.convs || [meta.conv]).some(c => minhaConv(u, c)) && !(await conversas(env, { op: 'pode', u, convs: meta.convs || [meta.conv] })).j.pode) return json({ error: { message: 'Este arquivo é de outra conversa.' } }, 403);
  const { readable, writable } = new FixedLengthStream(meta.bytes);
  (async () => { const w = writable.getWriter(); try { for (let i = 0; i < meta.n; i++) { const p = await env.PERFIS.get('ax:' + id + ':' + i, { type: 'arrayBuffer' }); if (!p) throw new Error('pedaço sumiu'); await w.write(new Uint8Array(p)); } await w.close(); } catch (er) { await w.abort(er).catch(() => { }); } })();
  return new Response(readable, { headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(meta.nome)}`, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff', 'x-porteiro': '1' } });
}
async function mensagens(req, env, url) {
  const s = await leSessao(env, req); if (!s) return json({ error: { message: 'Entre pelo menu do Estúdio Problems.' } }, 401);
  if (!env.CONVERSAS) return json({ error: { message: 'As mensagens ainda não estão ligadas. Rode a Action de publicação de novo.' } }, 503);
  if (url.pathname === '/mensagens/anexo') return anexo(req, env, url, s);
  const e = String(s.e).toLowerCase(), eu = await codigoU(e);
  // ADM: ?como=<código> = ver as conversas pela visão daquela pessoa (só leitura: só GET)
  const como = url.searchParams.get('como'); if (como && (!s.a || req.method !== 'GET' || !/^u[0-9a-f]{16}$/.test(como))) return json({ error: { message: 'Só um ADM vê as conversas de outra pessoa.' } }, 403);
  const u = como || eu;
  if (req.method === 'POST') {
    if ((req.headers.get('origin') || '') !== url.origin) return json({ error: { message: 'Pedido de outro site.' } }, 403);
    let b = {}; try { b = await req.json(); } catch { }
    if (b.op === 'geral') { if (!s.a) return json({ error: { message: 'Só um ADM muda o nome e a foto da conversa geral.' } }, 403);
      if (b.foto && (typeof b.foto !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(b.foto) || b.foto.length >= 70000)) return json({ error: { message: 'Foto grande demais.' } }, 400);
      const r = await conversas(env, { op: 'geral', u, e, nome: b.nome, foto: b.foto }); return json(r.j); }
    if (b.op === 'limpar') { if (!s.a) return json({ error: { message: 'Só ADM limpa as mensagens.' } }, 403); const r = await conversas(env, { op: 'limpar', u, e, alvo: b.alvo }); return r.j.erro ? json({ error: { message: r.j.erro } }, r.status) : json(r.j); }
    if (b.op === 'apagar') { const r = await conversas(env, { op: 'apagar', u, e, id: b.id, adm: !!s.a }); return r.j.erro ? json({ error: { message: r.j.erro } }, r.status) : json(r.j); }
    if (b.op === 'denunciar') { const r = await conversas(env, { op: 'denunciar', u, e, id: b.id, motivo: b.motivo }); return r.j.erro ? json({ error: { message: r.j.erro } }, r.status) : json(r.j); }
    if (b.op === 'denuncia-estado') { if (!s.a) return json({ error: { message: 'Só ADM.' } }, 403); const r = await conversas(env, { op: 'denuncia-estado', u, e, id: b.id, estado: b.estado, nota: b.nota }); return json(r.j, r.status); }
    if (b.op === 'grupo') { if (!s.a) return json({ error: { message: 'Só um ADM cria e muda grupos.' } }, 403);
      const r = await conversas(env, { op: 'grupo', u, e, acao: b.acao, id: b.id, nome: b.nome, foto: b.foto, membros: b.membros }); return r.j.erro ? json({ error: { message: r.j.erro } }, r.status) : json(r.j); }
    if (b.op === 'apelido') { const r = await conversas(env, { op: 'apelido', u, e, alvo: b.alvo, nick: b.nick }); return r.j.erro ? json({ error: { message: r.j.erro } }, r.status) : json(r.j); }
    if (b.op !== 'enviar' && b.op !== 'lida') return json({ error: { message: 'Pedido desconhecido.' } }, 400);
    let cita = null;
    if (b.op === 'enviar' && b.cita) { const c = limpaCita(b.cita); if (c.erro) return json({ error: { message: c.erro } }, 400); cita = c.cita;
      if (cita.anexo) { const meta = await env.PERFIS.get('ax:' + cita.anexo.id, { type: 'json' }).catch(() => null);
        if (!meta || meta.de !== u) return json({ error: { message: 'O arquivo anexado não foi encontrado. Tente de novo.' } }, 400);
        if (!(meta.convs || [meta.conv]).includes(convDe(u, String(b.para || '')))) return json({ error: { message: 'O arquivo foi preparado para outra conversa.' } }, 400);
        cita.anexo = { id: cita.anexo.id, nome: meta.nome, bytes: meta.bytes }; } }
    const r = await conversas(env, { op: b.op, u, e, para: b.para, texto: b.texto, conv: b.op === 'enviar' ? undefined : b.conv, ate: b.ate, cita: cita ? JSON.stringify(cita) : null });
    return r.j.erro ? json({ error: { message: r.j.erro } }, r.status) : json(r.j);
  }
  if (url.searchParams.has('vistos')) { const r = await conversas(env, { op: 'vistos', u, conv: url.searchParams.get('conv') }); return json(r.j, r.status); }
  if (url.searchParams.has('todasConversas')) { if (!s.a || como) return json({ error: { message: 'Só ADM.' } }, 403); return json((await conversas(env, { op: 'conversas-todas', u })).j); }
  if (url.searchParams.has('denuncias')) { // ADM: a lista de denúncias, com nomes e e-mails censurados (nunca o e-mail inteiro)
    if (!s.a) return json({ error: { message: 'Só ADM vê as denúncias.' } }, 403);
    const r = (await conversas(env, { op: 'denuncias', u, e })).j, quem = {};
    for (const [cod, em] of Object.entries(r.emails || {})) { const p = await lePerfil(env, em); quem[cod] = { nome: p.nome || p.google?.nome || mascara(em), email: mascara(em), foto: p.fotoV ? '/pessoa/foto?u=' + cod + '&v=' + p.fotoV : (p.google?.foto || null) }; }
    return json({ denuncias: r.denuncias, grupos: r.grupos, quem, site: url.origin });
  }
  if (url.searchParams.has('conv')) { const r = await conversas(env, { op: 'conversa', u, e: como ? null : e, ver: !!como, conv: url.searchParams.get('conv'), desde: url.searchParams.get('desde'), antes: url.searchParams.get('antes') }); return r.j.erro ? json({ error: { message: r.j.erro } }, r.status) : json(r.j); }
  const r = await conversas(env, { op: 'resumo', u, e: como ? null : e, ver: !!como, adm: !!s.a && !como, desde: url.searchParams.get('desde') });
  const out = { eu: u, adm: !!s.a, ...r.j };
  if (url.searchParams.get('pessoas') === '1') {
    let lista = (await conversas(env, { op: 'pessoas' })).j;
    if (lista.length < 2 && env.PERFIS) { // primeira vez: quem já entrou no Estúdio alguma vez
      const sem = []; let cur; do { const l = await env.PERFIS.list({ prefix: 'p:', cursor: cur }); for (const x of l.keys) { const em = x.name.slice(2); sem.push({ u: await codigoU(em), e: em, v: 0 }); } cur = l.list_complete ? null : l.cursor; } while (cur);
      await conversas(env, { op: 'semear', lista: sem }); lista = (await conversas(env, { op: 'pessoas' })).j;
    }
    const on = env.PRESENCA ? await presenca(env).catch(() => ({})) : {};
    const pessoas = [];
    for (const p of lista) {
      if (p.u === u) continue;
      const tirado = await foiTirado(env, p.e); if (tirado && +tirado > (p.v || 0)) continue; // tirado pela tela ADM e não entrou de novo
      pessoas.push({ u: p.u, on: on[p.e]?.prog || null, visto: p.v || 0 });
    }
    out.pessoas = pessoas;
  }
  return json(out);
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

/* ---------- Estúdio Problems Local (serviço no PC de cada editor, http://127.0.0.1:4790) ----------
   1. a página do Estúdio pede GET /passe-local (cookie da sessão) e entrega o passe ao serviço local;
   2. o serviço troca o passe por um TOKEN DE DISPOSITIVO (POST /dispositivo) — o passe vale 2 min, só para o host
      127.0.0.1:4790 e uma vez só; o KV guarda só o SHA-256 do token (dispositivo:<id> no PERFIS);
   3. com o token o serviço baixa a mídia do R2 (GET /midia/...) e avisa qual conta Claude está usando (/conta-em-uso).
   Quem foi tirado da lista (ADM › Quem pode entrar) ou teve o dispositivo revogado (ADM › Dispositivos) para na hora. */
const LOCAL_HOST = '127.0.0.1:4790';
const sha256 = async (txt) => b64u(await crypto.subtle.digest('SHA-256', enc.encode(txt)));
let chavePub = null;
async function conferePasse(env, ps, host) { // devolve o conteúdo do passe ou null (assinatura, validade e host)
  const k = await chavesAssinatura(env); if (!k || typeof ps !== 'string') return null;
  const [dados, ass] = ps.split('.'); if (!dados || !ass) return null;
  try {
    chavePub = chavePub || await crypto.subtle.importKey('jwk', k.pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, chavePub, deB64u(ass), enc.encode(dados)))) return null;
    const p = JSON.parse(new TextDecoder().decode(deB64u(dados)));
    return p.e && p.h === host && p.x > Date.now() / 1000 ? p : null;
  } catch { return null; }
}
// token → dispositivo (fica 30 s na memória; revogar aqui limpa na hora, nos outros lugares da Cloudflare vale em até 30 s)
const DISPOS = new Map();
async function leDispositivo(env, token) {
  if (!env.PERFIS || !/^[\w-]{43}$/.test(token || '')) return null;
  const h = await sha256('dispositivo:' + token), id = h.slice(0, 16);
  const c = DISPOS.get(id); let d = c && Date.now() - c.t < 30e3 ? c.d : undefined;
  if (d === undefined) { d = await env.PERFIS.get('dispositivo:' + id, { type: 'json' }).catch(() => null); DISPOS.set(id, { d, t: Date.now() }); if (DISPOS.size > 500) DISPOS.clear(); }
  if (!d || d.h !== h) return null;
  const tirado = await foiTirado(env, d.email); if (tirado && +tirado > d.criado) return null; // tirado do acesso depois de ligar o PC
  if (Date.now() - (d.visto || 0) > 36e5) { d.visto = Date.now(); env.PERFIS.put('dispositivo:' + id, JSON.stringify(d)).catch(() => { }); } // último uso (no máximo 1 gravação por hora)
  return { id, ...d };
}
// quem está pedindo: token de dispositivo (Authorization: Bearer) ou a sessão do navegador
async function quemPede(req, env) {
  const auth = req.headers.get('authorization') || '';
  if (auth) { const m = auth.match(/^Bearer ([\w-]+)$/); const d = m && await leDispositivo(env, m[1]); return d ? { email: d.email, adm: !!d.adm, dispositivo: d } : null; }
  const s = await leSessao(env, req); return s ? { email: s.e, adm: !!s.a, sessao: true } : null;
}
async function passeLocal(req, env, url) {
  if (req.method !== 'GET') return json({ error: { message: 'Use GET.' } }, 405);
  if ((req.headers.get('sec-fetch-site') || 'same-origin') !== 'same-origin') return json({ error: { message: 'Pedido de outro site.' } }, 403);
  const s = await leSessao(env, req); if (!s) return json({ error: { message: 'Entre pelo menu do Estúdio Problems.' } }, 401);
  const ps = await passe(env, s.e, LOCAL_HOST, s.a ? { a: 1 } : {}); if (!ps) return json({ error: { message: 'O porteiro está sem a ASSINATURA. Rode a Action de publicação de novo.' } }, 503);
  return json({ passe: ps });
}
async function novoDispositivo(req, env) {
  if (req.method !== 'POST') return json({ error: { message: 'Use POST.' } }, 405);
  if (!env.PERFIS) return json({ error: { message: 'O porteiro está sem o KV PERFIS.' } }, 503);
  let b = {}; try { b = await req.json(); } catch { }
  const p = await conferePasse(env, b.passe, LOCAL_HOST);
  if (!p) return json({ error: { message: 'Passe inválido ou vencido. Abra o Estúdio no navegador e ligue o serviço local de novo.' } }, 401);
  const email = String(p.e).toLowerCase(), usado = 'passe-usado:' + (await sha256(b.passe)).slice(0, 24);
  if (await env.PERFIS.get(usado)) return json({ error: { message: 'Este passe já foi usado. Peça outro.' } }, 401);
  await env.PERFIS.put(usado, '1', { expirationTtl: 300 });
  const tirado = await foiTirado(env, email); if (tirado && +tirado > (p.x - 120) * 1000) return json({ error: { message: 'Esta conta não tem mais acesso ao Estúdio Problems.' } }, 401);
  const token = b64u(crypto.getRandomValues(new Uint8Array(32))), h = await sha256('dispositivo:' + token), id = h.slice(0, 16);
  const nome_pc = String(b.nome_pc || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60);
  await env.PERFIS.put('dispositivo:' + id, JSON.stringify({ h, email, criado: Date.now(), ...(nome_pc ? { nome_pc } : {}), ...(p.a ? { adm: true } : {}) }));
  return json({ id, token });
}
// ADM › Dispositivos: lista (e-mail censurado, nome e foto da conta) e revogar
async function dispositivos(req, env, url) {
  const s = await leSessao(env, req); if (!s) return json({ error: { message: 'Entre pelo menu do Estúdio Problems.' } }, 401);
  if (!s.a) return json({ error: { message: 'Só quem é ADM vê os dispositivos.' } }, 403);
  if (!env.PERFIS) return json({ error: { message: 'O porteiro está sem o KV PERFIS.' } }, 503);
  if (req.method === 'POST') {
    if ((req.headers.get('origin') || '') !== url.origin) return json({ error: { message: 'Pedido de outro site.' } }, 403);
    let b = {}; try { b = await req.json(); } catch { }
    if (b.acao !== 'revogar' || !/^[\w-]{16}$/.test(b.id || '')) return json({ error: { message: 'Pedido desconhecido.' } }, 400);
    await env.PERFIS.delete('dispositivo:' + b.id); DISPOS.delete(b.id);
    return json({ ok: true });
  }
  const itens = []; let cur;
  do { const l = await env.PERFIS.list({ prefix: 'dispositivo:', cursor: cur });
    for (const x of l.keys) { const d = await env.PERFIS.get(x.name, { type: 'json' }).catch(() => null); if (!d) continue;
      const p = await lePerfil(env, d.email);
      itens.push({ id: x.name.slice(12), mascara: mascara(d.email), nome: p.nome || p.google?.nome || '', foto: p.fotoV ? '/pessoa/foto?u=' + await codigoU(d.email) + '&v=' + p.fotoV : (p.google?.foto || null),
        nome_pc: d.nome_pc || '', criado: d.criado, visto: d.visto || null, adm: !!d.adm, voce: d.email === s.e.toLowerCase() }); }
    cur = l.list_complete ? null : l.cursor; } while (cur);
  return json({ itens: itens.sort((a, b) => b.criado - a.criado) });
}
/* mídia da equipe para o serviço local (R2 "estudio-midia", binding MIDIA). Ler: dispositivo ou sessão; gravar: só ADM.
   PUT /midia/<k> (até ~100 MB); maiores em partes: POST ?uploads → PUT ?uploadId=&partNumber= → POST ?uploadId= {parts} (DELETE ?uploadId= cancela) */
const chaveMidia = (c) => { try { c = decodeURIComponent(c); } catch { return null; }
  return c && c.length <= 512 && !/[\u0000-\u001f\\]/.test(c) && !c.startsWith('/') && !c.split('/').some(x => x === '' || x === '.' || x === '..') ? c : null; };
async function midia(req, env, url, caminho) {
  const q = await quemPede(req, env); if (!q) return json({ error: { message: 'Entre pelo menu do Estúdio Problems (ou ligue o dispositivo de novo).' } }, 401);
  if (!env.MIDIA) return json({ error: { message: 'Canal de mídia ainda não configurado (falta o bucket R2 estudio-midia).' } }, 503);
  const k = chaveMidia(caminho.slice('/midia/'.length)); if (!k) return json({ error: { message: 'Caminho inválido.' } }, 400);
  if (req.method === 'GET' || req.method === 'HEAD') {
    // Range de um pedaço só (bytes=a-b, a- ou -n); vários pedaços ou formato estranho: entrega o arquivo inteiro
    const rg = (req.headers.get('range') || '').match(/^bytes=(?:(\d+)-(\d*)|-(\d+))$/), range = !rg ? null : rg[3] ? { suffix: +rg[3] } : { offset: +rg[1], ...(rg[2] ? { length: +rg[2] - +rg[1] + 1 } : {}) };
    const fora = (tam) => new Response(null, { status: 416, headers: { 'content-range': `bytes */${tam}` } });
    if (range && (range.length <= 0 || range.suffix === 0)) return fora('*');
    let o; try { o = req.method === 'HEAD' ? await env.MIDIA.head(k) : await env.MIDIA.get(k, { ...(range ? { range } : {}), onlyIf: req.headers }); }
    catch { const h = await env.MIDIA.head(k).catch(() => null); return h ? fora(h.size) : json({ error: { message: 'Não encontrado.' } }, 404); }
    if (!o) return json({ error: { message: 'Não encontrado.' } }, 404);
    if (range && 'offset' in range && range.offset >= o.size && req.method === 'GET') return fora(o.size);
    const h = new Headers(); o.writeHttpMetadata(h); h.set('etag', o.httpEtag); h.set('accept-ranges', 'bytes'); h.set('cache-control', 'private, no-cache'); h.set('x-content-type-options', 'nosniff');
    if (!h.get('content-type')) h.set('content-type', 'application/octet-stream');
    if (req.method === 'HEAD') { h.set('content-length', String(o.size)); return new Response(null, { headers: h }); }
    if (!('body' in o)) return new Response(null, { status: req.headers.get('if-none-match') || req.headers.get('if-modified-since') ? 304 : 412, headers: h }); // onlyIf não passou
    if (range) {
      const ini = 'suffix' in range ? Math.max(0, o.size - range.suffix) : range.offset, tam = Math.min(o.size - ini, 'suffix' in range ? range.suffix : (range.length ?? o.size - ini));
      h.set('content-range', `bytes ${ini}-${ini + tam - 1}/${o.size}`); h.set('content-length', String(tam));
      return new Response(o.body, { status: 206, headers: h });
    }
    h.set('content-length', String(o.size)); return new Response(o.body, { headers: h });
  }
  if (!q.adm) return json({ error: { message: 'Só quem é ADM envia ou apaga mídia.' } }, 403);
  if (q.sessao && (req.headers.get('origin') || '') !== url.origin) return json({ error: { message: 'Pedido de outro site.' } }, 403);
  const up = url.searchParams.get('uploadId');
  try {
    if (req.method === 'POST' && url.searchParams.has('uploads')) { const m = await env.MIDIA.createMultipartUpload(k, { httpMetadata: { contentType: req.headers.get('content-type') || 'application/octet-stream' } }); return json({ key: k, uploadId: m.uploadId }); }
    if (req.method === 'PUT' && up) { const n = +url.searchParams.get('partNumber'); if (!(n >= 1 && n <= 10000)) return json({ error: { message: 'partNumber inválido.' } }, 400);
      const parte = await env.MIDIA.resumeMultipartUpload(k, up).uploadPart(n, req.body); return json({ partNumber: parte.partNumber, etag: parte.etag }); }
    if (req.method === 'POST' && up) { let b = {}; try { b = await req.json(); } catch { }
      const o = await env.MIDIA.resumeMultipartUpload(k, up).complete((b.parts || []).map(p => ({ partNumber: +p.partNumber, etag: String(p.etag) }))); return json({ key: k, etag: o.httpEtag, size: o.size }); }
    if (req.method === 'DELETE' && up) { await env.MIDIA.resumeMultipartUpload(k, up).abort(); return json({ ok: true }); }
    if (req.method === 'PUT') { if (!req.body) return json({ error: { message: 'Arquivo vazio.' } }, 400);
      const o = await env.MIDIA.put(k, req.body, { httpMetadata: { contentType: req.headers.get('content-type') || 'application/octet-stream' } }); return json({ key: k, etag: o.httpEtag, size: o.size }); }
    if (req.method === 'DELETE') { await env.MIDIA.delete(k); return json({ ok: true }); }
  } catch (e) { return json({ error: { message: 'O R2 recusou: ' + String(e.message || e).slice(0, 200) } }, 400); }
  return json({ error: { message: 'Método não aceito.' } }, 405);
}
/* conta Claude em uso: cada PC avisa (ativo true/false) qual conta está usando; outro PC na mesma conta vê o aviso.
   KV PERFIS cu:<sha da conta> = { <id do dispositivo>: { pc, email, desde, visto } }, some sozinho 6 h depois do último aviso. */
const SEIS_H = 6 * 3600;
async function contaEmUso(req, env, url) {
  const q = await quemPede(req, env); if (!q?.dispositivo) return json({ error: { message: 'Só o serviço local (token de dispositivo) usa esta rota.' } }, 401);
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: { message: 'Use GET ou POST.' } }, 405);
  let b = {}; if (req.method === 'POST') { try { b = await req.json(); } catch { } }
  const eu = q.dispositivo.id, agora = Date.now(), c = String((req.method === 'POST' ? b.conta : url.searchParams.get('conta')) || '').trim().toLowerCase().slice(0, 200);
  if (!c) return json({ error: { message: 'Faltou a conta.' } }, 400);
  const chave = 'cu:' + (await sha256('conta:' + c)).slice(0, 24);
  const m = (await env.PERFIS.get(chave, { type: 'json' }).catch(() => null)) || {};
  for (const [id, v] of Object.entries(m)) if (agora - v.visto > SEIS_H * 1000) delete m[id];
  if (req.method === 'POST') {
    const antes = JSON.stringify(m[eu] ? { ...m[eu], visto: 0 } : null), vistoAntes = m[eu]?.visto || 0, tinha = !!m[eu];
    if (b.ativo) m[eu] = { pc: String(b.pc || q.dispositivo.nome_pc || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60), email: q.email, desde: m[eu]?.desde || agora, visto: agora };
    else delete m[eu];
    const igual = b.ativo ? antes === JSON.stringify({ ...m[eu], visto: 0 }) && agora - vistoAntes < 30 * 60e3 : !tinha; // nada mudou: não grava (limite de gravações por dia)
    if (igual) { if (b.ativo) m[eu].visto = vistoAntes; }
    else if (Object.keys(m).length) await env.PERFIS.put(chave, JSON.stringify(m), { expirationTtl: SEIS_H }); else await env.PERFIS.delete(chave);
  }
  const ativos = [];
  for (const [id, v] of Object.entries(m)) { const p = await lePerfil(env, v.email); ativos.push({ dispositivo: id, pc: v.pc, nome: p.nome || p.google?.nome || mascara(v.email), desde: v.desde, visto: v.visto, eu: id === eu }); }
  return json({ ativos, outros: ativos.filter(a => !a.eu).length });
}

// o menu (index.html) é público: é a tela de login. Qualquer endereço desconhecido também mostra o menu.
async function menu(env, url, status = 200, req = null) {
  const r = await env.ASSETS.fetch(new Request(new URL('/', url)));
  const h = new Headers(r.headers); h.set('cache-control', 'no-cache'); h.set('x-robots-tag', 'noindex');
  if (!r.ok) return new Response(r.body, { status, headers: h });
  // scripts do menu com carimbo de versão (o navegador guarda de vez) + "não mudou" (304) quando a página é a mesma
  let t = await r.text(); try { t = await comVersoes(env, t, url.href, null); } catch { }
  const et = '"epm-' + [...new Uint8Array(await crypto.subtle.digest('SHA-1', enc.encode(t)))].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('') + '"';
  const lm = dataDaVersao(et.slice(5)); h.delete('content-length'); h.delete('content-encoding'); h.set('etag', et); h.set('last-modified', lm);
  if (status === 200 && req && naoMudou(req, et, lm)) return new Response(null, { status: 304, headers: h });
  return new Response(t, { status, headers: h });
}

// limite grátis da Cloudflare (KV) acabou: aviso claro em vez de erro solto (volta 00:00 UTC = 21h de Brasília)
function avisoLimitePorteiro(e) {
  const lim = /10048|free usage limit|limit exceeded for the day|for today|daily limit/i.test(String(e?.message || e)), d = new Date(); d.setUTCHours(24, 0, 0, 0);
  return json({ error: lim ? { type: 'limite_cloudflare', volta: d.toISOString(), message: 'A nuvem da equipe chegou ao limite grátis de hoje da Cloudflare. Volta sozinha às 21h (horário de Brasília). O que você fez continua guardado neste computador.' }
    : { message: 'O porteiro teve um erro: ' + String(e?.message || e).slice(0, 160) } }, lim ? 503 : 500);
}
/* listas do KV PERFIS guardadas na memória por 5 min (o plano grátis só deixa 1000 listas por dia na conta toda);
   o que este porteiro grava/apaga tira da memória a lista daquele começo de chave na hora */
const LISTAS_P = new Map();
function perfisCom(kv) {
  if (!kv || kv._comLista) return kv; const solta = k => { for (const p of [...LISTAS_P.keys()]) if (String(k).startsWith(p)) LISTAS_P.delete(p); };
  return { _comLista: true, get: (...a) => kv.get(...a), getWithMetadata: (...a) => kv.getWithMetadata(...a),
    put: async (k, ...a) => { const r = await kv.put(k, ...a); solta(k); return r; }, delete: async k => { const r = await kv.delete(k); solta(k); return r; },
    async list(o = {}) { const pre = o.prefix || '', c = LISTAS_P.get(pre);
      if (o.cursor) return { keys: [], list_complete: true }; // a 1ª página já trouxe tudo (abaixo)
      if (c && Date.now() - c.t < 5 * 60e3) return { keys: c.keys, list_complete: true };
      try { const keys = []; let cur; do { const r = await kv.list({ prefix: pre, cursor: cur }); keys.push(...r.keys); cur = r.list_complete ? null : r.cursor; } while (cur);
        LISTAS_P.set(pre, { t: Date.now(), keys }); return { keys, list_complete: true }; }
      catch (e) { if (c) return { keys: c.keys, list_complete: true }; throw e; } } };
}
export default {
  async fetch(req, env, ctx) {
    if (env.PERFIS && !env.PERFIS._comLista) env = { ...env, PERFIS: perfisCom(env.PERFIS) }; try { return await this.atende(req, env, ctx); } catch (e) { console.log('erro:', String(e?.message || e).slice(0, 200)); return avisoLimitePorteiro(e); } },
  async atende(req, env) {
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
      catch (e) { if (/10048|free usage limit|limit exceeded for the day|for today/i.test(String(e?.message || e))) return avisoLimitePorteiro(e); return json({ error: { message: 'O porteiro não conseguiu falar com o servidor do Estúdio Problems.' } }, 502); }
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403) return json({ error: { message: j.error?.message || 'Esta conta não tem acesso ao Estúdio Problems.' } }, 403);
      if (!r.ok || !j.email) return json({ error: { message: `O porteiro não conseguiu conferir o login no servidor do Estúdio Problems (resposta ${r.status}). Tente de novo em instantes.` } }, 502);
      // nome e foto do Google (vêm no próprio token, que o servidor do Estúdio Problems acabou de conferir): viram o padrão da conta
      try { const g = JSON.parse(new TextDecoder().decode(deB64u(token.split('.')[1]))); await guardaGoogle(env, j.email, g.name, g.picture); } catch { } if (env.CONVERSAS) { try { const em = String(j.email).toLowerCase(); await conversas(env, { op: 'pessoa', u: await codigoU(em), e: em }); } catch { } }
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
    if (caminho === '/acesso' || caminho === '/acesso/foto') return acesso(req, env, url).catch(e => json({ error: { message: 'O porteiro falhou: ' + String(e?.message || e).slice(0, 200) } }, 500)); // mostra o motivo na tela
    if (caminho === '/nuvem-uso') return nuvemUso(req, env, url).catch(e => json({ error: { message: 'O porteiro falhou: ' + String(e?.message || e).slice(0, 200) } }, 500)); // mostra o motivo na tela
    if (caminho === '/nuvem-uso/arq') return nuvemArq(req, env, url);
    if (caminho.startsWith('/nuvem-sons/')) return nuvemSons(req, env, url, caminho);
    if (caminho === '/pessoa' || caminho === '/pessoa/foto') return pessoa(req, env, url);
    if (caminho === '/mensagens' || caminho === '/mensagens/anexo') return mensagens(req, env, url);
    if (caminho === '/presenca') { // os programas avisam "estou aberto em X" a cada minuto (só enquanto a aba está à vista)
      if (req.method !== 'POST') return json({ error: { message: 'Use POST.' } }, 405);
      const s = await leSessao(env, req); if (!s) return json({ error: { message: 'Entre pelo menu.' } }, 401);
      if ((req.headers.get('origin') || '') !== url.origin) return json({ error: { message: 'Pedido de outro site.' } }, 403);
      let b = {}; try { b = await req.json(); } catch { }
      const prog = PROGS.includes(b.programa) ? b.programa : null;
      if (env.PRESENCA && (prog || b.saiu)) await presenca(env, { e: s.e.toLowerCase(), aba: String(b.aba || ''), prog: b.saiu ? null : prog }).catch(() => null); // programa desconhecido: ignora
      return json({ ok: true });
    }
    if (caminho === '/passe-local') return passeLocal(req, env, url);
    if (caminho === '/dispositivo') return novoDispositivo(req, env);
    if (caminho === '/dispositivos') return dispositivos(req, env, url);
    if (caminho.startsWith('/midia/')) return midia(req, env, url, caminho);
    if (caminho === '/conta-em-uso') return contaEmUso(req, env, url);
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
    if (caminho === '/' || caminho === '/index.html') return menu(env, url, 200, req);
    if (caminho === '/estudio-login.js' || caminho === '/estudio-conta.js' || caminho === '/estudio-carregando.js' || caminho === '/favicon.svg' || caminho === '/favicon.ico' || caminho === '/icone-180.png') { const r = await env.ASSETS.fetch(req); if (r.ok || r.status === 304) { // login, carregamento e conta: o navegador sempre confere se tem versão nova (304 quando não mudou)
      if (url.searchParams.has('_ev') && r.ok) { const h = new Headers(r.headers); h.set('cache-control', IMUTAVEL); return new Response(r.body, { status: r.status, headers: h }); }
      if (/\.js$/.test(caminho)) { const h = new Headers(r.headers); h.set('cache-control', 'no-cache'); return new Response(r.body, { status: r.status, headers: h }); } return r; } } // 304 = "não mudou" (o navegador já tem): devolve como está, senão o arquivo some e vira a página do menu
    if (/^\/adm\/?$/i.test(caminho)) return menu(env, url, 200, req);
    return menu(env, url, 404, req);
  },
};
