/* ===================== Porteiro do Estúdio Problems (Cloudflare Worker "estudio") =====================
   Um endereço só para todos os projetos. Ele:
   1. serve o MENU (index.html, 404.html, estudio-login.js) — a tela de login do Google fica nele;
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

async function criaSessao(env, email) {
  const dados = b64u(enc.encode(JSON.stringify({ e: email, x: Math.floor(Date.now() / 1000) + DURACAO })));
  const ass = b64u(await crypto.subtle.sign('HMAC', await chave(env), enc.encode(dados)));
  return dados + '.' + ass;
}
async function leSessao(env, req) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([\\w-]+\\.[\\w-]+)'));
  if (!m || !env.SESSAO_SEGREDO) return null;
  const [dados, ass] = m[1].split('.');
  try {
    if (!(await crypto.subtle.verify('HMAC', await chave(env), deB64u(ass), enc.encode(dados)))) return null;
    const s = JSON.parse(new TextDecoder().decode(deB64u(dados)));
    return s.x > Date.now() / 1000 && s.e ? s : null;
  } catch { return null; }
}
const cookie = (valor, idade) => `${COOKIE}=${valor}; Path=/; Max-Age=${idade}; HttpOnly; Secure; SameSite=Lax`;
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-porteiro': '1', ...extra } });

// PROJETOS: { "/caminho/": "https://origem/"  ou  { "origem": "https://...", "assinar": true, "servico": "...", "nuvem": true }
//            ou { "para": "/outro/caminho/" }  (só redireciona) }
// "conta": as páginas do projeto ganham o botão da conta (/estudio-conta.js) se ainda não carregarem ele.
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
    const extra = (p.nuvem ? NUVEM_JS : '') + (p.conta && !h.includes('estudio-conta.js') ? '<script src="/estudio-conta.js" defer></script>' : '');
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
  if (p.google?.nome !== g.nome || p.google?.foto !== g.foto) await env.PERFIS.put(chavePerfil(email), JSON.stringify({ ...p, google: g }));
}
function contaPublica(email, p) {
  const nomeG = p.google?.nome || String(email).split('@')[0], fotoG = p.google?.foto || null;
  return { email, nome: p.nome || nomeG, foto: p.fotoV ? '/conta/foto?v=' + p.fotoV : fotoG, nomeGoogle: nomeG, fotoGoogle: fotoG,
    nomeProprio: !!p.nome, fotoPropria: !!p.fotoV, fundo: p.fundo === 'cor' ? 'cor' : 'padrao', cor: /^#[0-9a-f]{6}$/i.test(p.cor || '') ? p.cor : '#262626' };
}
async function conta(req, env, url, s) {
  if (!env.PERFIS) return json({ error: { message: 'O porteiro está sem o KV PERFIS. Rode a Action de publicação de novo.' } }, 503);
  const mesmoSite = (req.headers.get('origin') || '') === url.origin, p = await lePerfil(env, s.e);
  if (url.pathname === '/conta') {
    if (req.method === 'GET') return json(contaPublica(s.e, p));
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
      await env.PERFIS.put(chaveFoto(s.e) + ':' + fotoV, buf, { metadata: { tipo } });
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
      return json({ ok: true, email: j.email, ate: Date.now() + DURACAO * 1000 }, 200, { 'set-cookie': cookie(await criaSessao(env, j.email), DURACAO) });
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
    if (caminho === '/estudio-login.js' || caminho === '/estudio-conta.js') { const r = await env.ASSETS.fetch(req); if (r.ok || r.status === 304) return r; } // 304 = "não mudou" (o navegador já tem): devolve como está, senão o arquivo some e vira a página do menu
    if (/^\/adm\/?$/i.test(caminho)) return menu(env, url);
    return menu(env, url, 404);
  },
};
