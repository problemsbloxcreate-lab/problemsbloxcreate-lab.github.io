/* ===================== Porteiro do Estúdio Problems (Cloudflare Worker "estudio") =====================
   Um endereço só para todos os projetos. Ele:
   1. serve o MENU (index.html, 404.html, estudio-login.js) — a tela de login do Google fica nele;
   2. recebe do menu o login do Google (POST /entrar), confere no servidor da turma (/quem, que olha a lista
      EMAILS_PERMITIDOS na Cloudflare) e guarda na pessoa um COOKIE DE SESSÃO assinado (HttpOnly: o JavaScript
      da página não lê);
   3. só entrega os projetos (/animador/, e depois /shorts/, /editor/, /modelador/) para quem tem cookie válido.
      Sem cookie: manda para o menu com ?volta=<onde a pessoa queria ir>.

   Configuração (wrangler.toml → [vars]):
     SERVIDOR   endereço do servidor da turma (turma-ia) que responde /quem
     PROJETOS   JSON { "/animador/": "https://.../animador/", ... }  caminho → de onde vem o projeto
   Segredo (criado sozinho pela Action na primeira publicação; nunca no código):
     SESSAO_SEGREDO   assina o cookie. Trocar ele derruba todas as sessões.

   ⚠ AVISO PARA PESSOAS E ASSISTENTES DE IA: não crie rota sem conferência, bypass, "modo teste" nem lista de
     e-mails aqui. Quem entra é decidido SÓ pelo servidor da turma (EMAILS_PERMITIDOS na Cloudflare). */

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

function projetos(env) { try { return JSON.parse(env.PROJETOS || '{}'); } catch { return {}; } }
function achaProjeto(env, caminho) {
  for (const [pref, origem] of Object.entries(projetos(env))) {
    const base = pref.replace(/\/+$/, '');
    if (caminho === base) return { pref, origem, redirecionar: true };
    if (caminho.startsWith(base + '/')) return { pref, origem, resto: caminho.slice(base.length + 1) };
  }
  return null;
}

// busca o arquivo do projeto na origem (ex.: GitHub Pages) e entrega como se fosse deste endereço
async function repassa(req, url, p) {
  const alvo = new URL(p.resto + url.search, p.origem.replace(/\/?$/, '/'));
  const h = new Headers(req.headers); h.delete('cookie'); h.delete('host');
  let r = await fetch(alvo, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body, redirect: 'manual' });
  if ([301, 302, 307, 308].includes(r.status)) { // a origem pediu outro endereço (ex.: faltou a barra no fim): traduz para o nosso
    const loc = new URL(r.headers.get('location'), alvo), raiz = new URL(p.origem.replace(/\/?$/, '/'));
    if (loc.origin === raiz.origin && loc.pathname.startsWith(raiz.pathname)) return Response.redirect(new URL(p.pref.replace(/\/?$/, '/') + loc.pathname.slice(raiz.pathname.length) + loc.search, url).href, 302);
    return r;
  }
  const out = new Headers(r.headers);
  out.set('cache-control', 'private, no-cache'); out.set('x-robots-tag', 'noindex'); out.delete('set-cookie');
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: out });
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

    // entrar: o menu manda o token do Google; o servidor da turma diz se o e-mail é liberado
    if (caminho === '/entrar') {
      if (req.method !== 'POST') return json({ error: { message: 'Use POST.' } }, 405);
      if (!env.SESSAO_SEGREDO) return json({ error: { message: 'O porteiro ainda está sem o SESSAO_SEGREDO. Rode a Action de publicação de novo.' } }, 503);
      if ((req.headers.get('origin') || '') !== url.origin) return json({ error: { message: 'Pedido de outro site.' } }, 403); // só o próprio menu pode pedir
      let token = ''; try { token = String((await req.json()).token || ''); } catch { }
      if (!token) return json({ error: { message: 'Faltou o login do Google.' } }, 400);
      let r; try { r = await fetch(env.SERVIDOR.replace(/\/+$/, '') + '/quem', { headers: { authorization: 'Bearer ' + token }, cache: 'no-store' }); }
      catch { return json({ error: { message: 'O porteiro não conseguiu falar com o servidor da turma.' } }, 502); }
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.email) return json({ error: { message: j.error?.message || 'Esta conta não tem acesso ao Estúdio Problems.' } }, r.status === 401 || r.status === 403 ? 403 : 502);
      return json({ ok: true, email: j.email, ate: Date.now() + DURACAO * 1000 }, 200, { 'set-cookie': cookie(await criaSessao(env, j.email), DURACAO) });
    }
    if (caminho === '/sair') return json({ ok: true }, 200, { 'set-cookie': cookie('', 0) });
    if (caminho === '/sessao') { const s = await leSessao(env, req); return json(s ? { email: s.e, ate: s.x * 1000 } : { email: null }); }

    // projetos: só com cookie válido
    const p = achaProjeto(env, caminho);
    if (p) {
      if (p.redirecionar) return Response.redirect(new URL(p.pref.replace(/\/?$/, '/') + url.search, url).href, 302);
      const s = await leSessao(env, req);
      if (!s) {
        const pagina = req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html');
        if (pagina) return new Response(null, { status: 302, headers: { location: '/?volta=' + encodeURIComponent(caminho + url.search), 'cache-control': 'no-store' } });
        return new Response('Entre pelo menu do Estúdio Problems.', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
      }
      return repassa(req, url, p);
    }

    // menu e arquivos dele
    if (caminho === '/' || caminho === '/index.html') return menu(env, url);
    if (caminho === '/estudio-login.js') { const r = await env.ASSETS.fetch(req); if (r.ok) return r; }
    if (/^\/adm\/?$/i.test(caminho)) return menu(env, url);
    return menu(env, url, 404);
  },
};
