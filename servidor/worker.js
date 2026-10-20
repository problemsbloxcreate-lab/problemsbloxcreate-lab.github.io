/* ===================== Servidor da IA da turma (Cloudflare Worker) =====================
   Guarda a chave da API escondida e conta quanto a turma gastou no mês.
   Variáveis (Cloudflare → Worker → Settings → Variables and Secrets):
     ANTHROPIC_API_KEY  (Secret)  sua chave sk-ant-...   ← SÓ AQUI, nunca no código do site
     LIMITE_USD         (Text)    limite de gasto em dólares, ex.: 200 (o valor dos créditos)
     MAX_TOKENS         (Text, opcional) tamanho máximo de cada resposta (padrão 64000; se o modelo aceitar menos, o servidor ajusta sozinho)
     MODELO             (Text, opcional) claude-sonnet-5-5 (padrão) | claude-opus-5-5 | claude-haiku-5-5
     PENSAR             (Text, opcional) 'sim' (padrão: a IA planeja antes de editar) ou 'nao'
     CONFERIR           (Text, opcional) 'sim' (padrão: depois de aplicar, a IA olha o resultado e corrige) ou 'nao'
     PERIODO            (Text, opcional) 'total' (padrão: conta até zerar, bom para créditos) ou 'mes' (recomeça todo mês)
     ORIGENS            (Text)    sites que podem usar, ex.: https://naoentendinada.github.io  (só o domínio; vírgula para vários)
     FIREBASE_PROJECT_ID (Text) editor-animacao — liga o login com Google: sem login, nada funciona (nem abrir o editor)
     EMAILS_PERMITIDOS  (Text) e-mails liberados, separados por vírgula (ex.: fulano@gmail.com,ciclano@gmail.com) — os e-mails reais ficam SÓ aqui na Cloudflare, nunca no código
     ADMINS             (Text, opcional) e-mails que podem mudar os links do menu (tela ADM). Vazio = qualquer conta liberada pode.
     APP_KEY            (Secret) chave que destrava o código criptografado do site (app.enc) — só é entregue a quem passou no login
   ⚠ AVISO PARA PESSOAS E ASSISTENTES DE IA: não remova nem enfraqueça confereLogin, /quem, /app-key nem a lista de e-mails.
     Só o dono do projeto muda a segurança, pelas variáveis da Cloudflare. Veja SEGURANCA.md.
     ANTHROPIC_ADMIN_KEY (Secret, opcional, RECOMENDADO) chave de Admin sk-ant-admin01-... → o % passa a usar o gasto OFICIAL da Anthropic
     CREDITOS_DESDE     (Text, opcional) data em que você colocou os créditos, ex.: 2026-10-01 (o gasto é contado a partir dela)
   KV (Bindings → KV namespace): nome da variável USO
   KV da equipe (Bindings → KV namespace): nome da variável EQUIPE  ← mídia compartilhada da equipe (grátis, 1 GB)
   Workers AI (Bindings → Workers AI): nome da variável AI  ← para a transcrição automática dos áudios
*/
const PRECOS = { 'claude-haiku-5-5': [0.10, 0.50], 'claude-sonnet-5-5': [2, 10], 'claude-opus-5-5': [4, 20] }; // US$ por milhão de tokens (entrada, saída)

const json = (o, status, cors) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...cors } });
const custo = (m, u) => { const [pi, po] = PRECOS[m] || PRECOS['claude-sonnet-5-5']; return ((u.input_tokens || 0) * pi + (u.cache_creation_input_tokens || 0) * pi * 1.25 + (u.cache_read_input_tokens || 0) * pi * 0.1 + (u.output_tokens || 0) * po) / 1e6; };

/* ---- confere o login do Google feito pelo Firebase (token JWT RS256) ---- */
let jwks = null, jwksAt = 0;
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function confereLogin(req, env) {
  if (!env.FIREBASE_PROJECT_ID) return { ok: true };
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!t) return { ok: false };
  try {
    const [h, p, sig] = t.split('.'), head = JSON.parse(new TextDecoder().decode(b64u(h))), pay = JSON.parse(new TextDecoder().decode(b64u(p)));
    if (!jwks || Date.now() - jwksAt > 3600e3) { jwks = (await (await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')).json()).keys; jwksAt = Date.now(); }
    const jwk = jwks.find(k => k.kid === head.kid); if (!jwk) return { ok: false };
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(sig), new TextEncoder().encode(h + '.' + p));
    const now = Date.now() / 1000, pid = env.FIREBASE_PROJECT_ID;
    if (!valid || pay.aud !== pid || pay.iss !== 'https://securetoken.google.com/' + pid || pay.exp < now) return { ok: false };
    const lista = (env.EMAILS_PERMITIDOS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (pay.email_verified === false) return { ok: false, motivo: 'Este e-mail do Google não está verificado.' };
    if (!lista.length) return { ok: false, motivo: 'O servidor está sem a lista EMAILS_PERMITIDOS (ninguém entra até o dono configurar).' };
    if (!lista.includes(String(pay.email || '').toLowerCase())) return { ok: false, motivo: `A conta ${pay.email || ''} não tem acesso ao Turma Studios.` };
    return { ok: true, email: pay.email };
  } catch { return { ok: false }; }
}

/* ---- gasto oficial (Admin API → cost_report). Vem em centavos, atualiza em ~5 min ---- */
let oficial = null, oficialAt = 0;
async function gastoOficial(env) {
  if (!env.ANTHROPIC_ADMIN_KEY) return null;
  if (oficial && Date.now() - oficialAt < 90e3) return oficial;
  try {
    const desde = new Date((env.CREDITOS_DESDE || new Date().toISOString().slice(0, 8) + '01') + 'T00:00:00Z');
    let cents = 0, page = null, n = 0;
    do {
      const q = new URLSearchParams({ starting_at: desde.toISOString(), ending_at: new Date(Date.now() + 864e5).toISOString().slice(0, 10) + 'T00:00:00Z', bucket_width: '1d', limit: '31' });
      if (page) q.set('page', page);
      const r = await fetch('https://api.anthropic.com/v1/organizations/cost_report?' + q, { headers: { 'x-api-key': env.ANTHROPIC_ADMIN_KEY, 'anthropic-version': '2023-06-01' } });
      if (!r.ok) return oficial; // se falhar, mantém o último valor
      const j = await r.json();
      for (const b of j.data || []) for (const it of b.results || []) cents += parseFloat(it.amount) || 0;
      page = j.has_more ? j.next_page : null;
    } while (page && ++n < 30);
    oficial = { usd: cents / 100, desde: desde.toISOString().slice(0, 10) }; oficialAt = Date.now();
    return oficial;
  } catch { return oficial; }
}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('origin') || '';
    const origens = (env.ORIGENS || '*').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
    const liberado = origens.includes('*') || origens.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin); // seu PC: sempre aceito (ainda exige login com e-mail liberado)
    const cors = { 'access-control-allow-origin': liberado ? (origin || '*') : 'null', 'access-control-allow-headers': 'content-type,authorization', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'access-control-max-age': '86400', vary: 'origin' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path0 = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    // aberto direto na barra do navegador (sem "origin"): mostra que está funcionando e o uso
    if (!origin && req.method === 'GET' && (path0 === '/' || path0 === '/uso')) return json({ ok: 'Servidor da IA da turma funcionando', login: env.FIREBASE_PROJECT_ID ? 'ligado (' + env.FIREBASE_PROJECT_ID + ')' : 'DESLIGADO — falta FIREBASE_PROJECT_ID', emails: (env.EMAILS_PERMITIDOS || '').split(',').filter(x => x.trim()).length, app: env.APP_KEY ? 'protegido (APP_KEY ok)' : 'falta APP_KEY', chave_ia: env.ANTHROPIC_API_KEY ? 'ok' : 'falta ANTHROPIC_API_KEY' }, 200, cors);
    else if (!liberado) return json({ error: { type: 'origem', message: 'Este site não está liberado no servidor da turma.' } }, 403, cors);
    if (!env.ANTHROPIC_API_KEY) return json({ error: { type: 'config', message: 'O servidor está sem a chave (ANTHROPIC_API_KEY).' } }, 500, cors);

    const login = await confereLogin(req, env);
    if (!login.ok) return json({ error: { type: 'login', message: login.motivo || 'Entre com sua conta Google para usar a IA.' } }, 401, cors);
    // SEGURANÇA (não remover): quem é + chave do app criptografado — só com login do Firebase confirmado e e-mail liberado
    const p0 = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    // MÍDIA DA EQUIPE (KV "EQUIPE" da Cloudflare, grátis: 1 GB, até 25 MB por arquivo) — só com login liberado
    if (p0 === '/equipe' || p0 === '/equipe/arquivo') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      if (!env.EQUIPE) return json({ error: { type: 'sem_kv', message: 'Falta o KV da equipe (binding EQUIPE) no worker.' } }, 501, cors);
      const q = new URL(req.url).searchParams, LIM = (+env.EQUIPE_LIMITE_MB || 1024) * 1048576;
      const listar = async (prefix) => { const out = []; let cur; do { const r = await env.EQUIPE.list({ prefix, cursor: cur }); for (const k of r.keys) out.push({ k: k.name, ...(k.metadata || {}) }); cur = r.list_complete ? null : r.cursor; } while (cur); return out; };
      if (p0 === '/equipe/arquivo') {
        const k = q.get('k') || ''; if (!/^(equipe|conhecimento)\//.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors);
        const r = await env.EQUIPE.getWithMetadata(k, { type: 'stream' }); if (!r.value) return json({ error: { message: 'Arquivo não encontrado' } }, 404, cors);
        return new Response(r.value, { status: 200, headers: { ...cors, 'content-type': r.metadata?.tipo || 'application/octet-stream', 'cache-control': 'private, max-age=600' } });
      }
      if (req.method === 'GET') { const pasta = q.get('pasta') === 'conhecimento' ? 'conhecimento/' : 'equipe/'; const all = await listar(''); return json({ itens: all.filter(x => x.k.startsWith(pasta)), usado: all.reduce((s, x) => s + (+x.tam || 0), 0), limite: LIM }, 200, { ...cors, 'cache-control': 'no-store' }); }
      if (req.method === 'DELETE') { const k = q.get('k') || ''; if (!/^(equipe|conhecimento)\//.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors); await env.EQUIPE.delete(k); return json({ ok: true }, 200, cors); }
      if (req.method === 'POST') {
        const pasta = q.get('pasta') === 'conhecimento' ? 'conhecimento' : 'equipe', nome = String(q.get('nome') || 'arquivo').slice(0, 120), tipo = String(q.get('tipo') || req.headers.get('content-type') || 'application/octet-stream').slice(0, 80);
        const buf = await req.arrayBuffer(); if (!buf.byteLength) return json({ error: { message: 'Arquivo vazio' } }, 400, cors);
        if (buf.byteLength > 25 * 1048576) return json({ error: { message: 'Arquivo maior que 25 MB (limite do espaço grátis).' } }, 413, cors);
        const usado = (await listar('')).reduce((s, x) => s + (+x.tam || 0), 0); if (usado + buf.byteLength > LIM) return json({ error: { message: 'O espaço da equipe está cheio.' } }, 507, cors);
        const k = `${pasta}/${Date.now()}_${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '_').slice(-80)}`;
        await env.EQUIPE.put(k, buf, { metadata: { nome, tipo, tam: buf.byteLength, por: login.email, em: new Date().toISOString() } });
        return json({ ok: true, k }, 200, cors);
      }
    }
    // MENU do Estúdio Problems (KV EQUIPE): links + fundos ("menu/links") e mídias dos fundos ("menu/midia/...").
    // Ler: conta liberada. Mudar (tela ADM): conta liberada E, se a variável ADMINS existir, só os e-mails dela.
    if (p0 === '/menu-links' || p0 === '/menu-midia') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      if (!env.EQUIPE) return json({ error: { type: 'sem_kv', message: 'Falta o KV da equipe (binding EQUIPE) no worker.' } }, 501, cors);
      const admins = (env.ADMINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const adm = !admins.length || admins.includes(String(login.email).toLowerCase());
      const semAdm = () => json({ error: { type: 'adm', message: 'Esta conta não pode mudar o menu (variável ADMINS na Cloudflare).' } }, 403, cors);
      const q = new URL(req.url).searchParams, KM = /^menu\/midia\/[\w.\- ]{1,120}$/;
      if (p0 === '/menu-midia') {
        if (req.method === 'GET') {
          const k = q.get('k') || ''; if (!KM.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors);
          const r = await env.EQUIPE.getWithMetadata(k, { type: 'stream' }); if (!r.value) return json({ error: { message: 'Arquivo não encontrado' } }, 404, cors);
          return new Response(r.value, { status: 200, headers: { ...cors, 'content-type': r.metadata?.tipo || 'application/octet-stream', 'cache-control': 'private, max-age=86400' } });
        }
        if (req.method === 'POST') {
          if (!adm) return semAdm();
          const tipo = String(q.get('tipo') || req.headers.get('content-type') || '').slice(0, 80), nome = String(q.get('nome') || 'midia').slice(0, 120);
          if (!/^(image|video)\//.test(tipo)) return json({ error: { message: 'Só imagem, GIF ou vídeo.' } }, 400, cors);
          const buf = await req.arrayBuffer(); if (!buf.byteLength) return json({ error: { message: 'Arquivo vazio' } }, 400, cors);
          if (buf.byteLength > 25 * 1048576) return json({ error: { message: 'Arquivo maior que 25 MB (limite do espaço grátis). Para vídeos grandes, use "colar link".' } }, 413, cors);
          let usado = 0, cur; do { const r = await env.EQUIPE.list({ cursor: cur }); for (const k of r.keys) usado += +(k.metadata?.tam) || 0; cur = r.list_complete ? null : r.cursor; } while (cur);
          if (usado + buf.byteLength > (+env.EQUIPE_LIMITE_MB || 1024) * 1048576) return json({ error: { message: 'O espaço da equipe está cheio.' } }, 507, cors);
          const k = `menu/midia/${Date.now()}_${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '_').slice(-80)}`;
          await env.EQUIPE.put(k, buf, { metadata: { nome, tipo, tam: buf.byteLength, por: login.email, em: new Date().toISOString() } });
          return json({ ok: true, k }, 200, cors);
        }
        return json({ error: { message: 'Método não aceito' } }, 405, cors);
      }
      if (req.method === 'GET') { const v = await env.EQUIPE.get('menu/links', { type: 'json' }); return json({ links: v?.links || null, fundo: v?.fundo || null, por: v?.por || null, em: v?.em || null, adm }, 200, { ...cors, 'cache-control': 'no-store' }); }
      if (req.method === 'PUT' || req.method === 'POST') {
        if (!adm) return semAdm();
        let b; try { b = await req.json(); } catch { return json({ error: { message: 'Pedido inválido' } }, 400, cors); }
        const ICS = ['shorts', 'editar', 'animar', 'modelar', 'link', 'jogo', 'musica', 'imagem'], txt = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
        const num = (v, a, z, d) => { v = +v; return Number.isFinite(v) ? Math.min(z, Math.max(a, v)) : d; };
        const okUrl = u => /^https?:\/\/[^\s"'<>]+$/i.test(u) || /^(?![a-z][\w+.-]*:|\/\/)[^\s"'<>]+$/i.test(u);
        const midia = m => { if (!m || typeof m !== 'object') return null; const src = txt(m.src, 500); if (!src || !(src.startsWith('kv:') ? KM.test(src.slice(3)) : /^https:\/\/[^\s"'<>]+$/i.test(src))) return null;
          return { tipo: m.tipo === 'video' ? 'video' : 'imagem', src, x: num(m.x, 0, 100, 50), y: num(m.y, 0, 100, 50), zoom: num(m.zoom, 1, 4, 1) }; };
        if (!Array.isArray(b.links) || b.links.length > 24) return json({ error: { message: 'Lista de links inválida (máximo 24).' } }, 400, cors);
        const links = [];
        for (const l of b.links) {
          const nome = txt(l?.nome, 40), url = txt(l?.url, 500);
          if (!nome) return json({ error: { message: 'Todo link precisa de um nome.' } }, 400, cors);
          if (url && !okUrl(url)) return json({ error: { message: `Endereço inválido em "${nome}". Use https://...` } }, 400, cors);
          links.push({ nome, desc: txt(l?.desc, 80), url: url || null, icone: ICS.includes(l?.icone) ? l.icone : 'link', embreve: !!l?.embreve, fundo: midia(l?.fundo), escurecer: num(l?.escurecer, 0, .9, .45) });
        }
        const f = b.fundo || {}, fundo = { modo: ['nenhum', 'um', 'slideshow', 'aleatorio'].includes(f.modo) ? f.modo : 'nenhum', intervalo: num(f.intervalo, 2, 120, 8), escurecer: num(f.escurecer, 0, .9, .55), itens: (Array.isArray(f.itens) ? f.itens : []).slice(0, 20).map(midia).filter(Boolean) };
        const v = { links, fundo, por: login.email, em: new Date().toISOString() };
        await env.EQUIPE.put('menu/links', JSON.stringify(v));
        // apaga as mídias do menu que ninguém usa mais
        const usadas = new Set([...links.map(l => l.fundo?.src), ...fundo.itens.map(m => m.src)].filter(s => s?.startsWith('kv:')).map(s => s.slice(3)));
        let cur; do { const r = await env.EQUIPE.list({ prefix: 'menu/midia/', cursor: cur }); for (const k of r.keys) if (!usadas.has(k.name)) await env.EQUIPE.delete(k.name); cur = r.list_complete ? null : r.cursor; } while (cur);
        return json({ ok: true, ...v }, 200, cors);
      }
      return json({ error: { message: 'Método não aceito' } }, 405, cors);
    }
    if (p0 === '/quem' || p0 === '/app-key') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'O login com Google ainda não foi ligado no servidor (falta FIREBASE_PROJECT_ID).' } }, 403, cors);
      if (p0 === '/quem') return json({ email: login.email }, 200, { ...cors, 'cache-control': 'no-store' });
      if (!env.APP_KEY) return json({ error: { type: 'config', message: 'O servidor está sem a APP_KEY (chave do app).' } }, 500, cors);
      return json({ key: env.APP_KEY }, 200, { ...cors, 'cache-control': 'no-store' });
    }

    const periodo = env.PERIODO === 'mes' ? 'mes' : 'total', mes = periodo === 'mes' ? new Date().toISOString().slice(0, 7) : 'total', limite = +env.LIMITE_USD || 200;
    const ler = async () => { try { return JSON.parse((await env.USO.get(mes)) || 'null') || { usd: 0, n: 0 }; } catch { return { usd: 0, n: 0 }; } };
    const of = await gastoOficial(env);
    // com a chave de Admin: gasto oficial + o que foi gasto nos últimos minutos (ainda não apareceu no relatório)
    const modelo = PRECOS[env.MODELO] ? env.MODELO : 'claude-sonnet-5-5', pensar = env.PENSAR !== 'nao', conferir = env.CONFERIR !== 'nao';
    const uso0 = u => { const usd = of ? Math.max(of.usd, of.usd + (u.usd - (u.base ?? u.usd))) : u.usd; return { usd, n: u.n, limite, pct: usd / limite, mes, periodo, oficial: !!of, desde: of?.desde || null }; };
    const uso = u => ({ ...uso0(u), modelo, pensar, conferir });
    if (of) { const u0 = await ler(); if (u0.ofUsd !== of.usd) { u0.ofUsd = of.usd; u0.base = u0.usd; await env.USO.put(mes, JSON.stringify(u0), { expirationTtl: 60 * 60 * 24 * 400 }); } }
    const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';

    // transcrição de áudio (Whisper no Workers AI da Cloudflare — usa a cota grátis da Cloudflare, não os créditos da Anthropic)
    if (path === '/transcrever' && req.method === 'POST') {
      if (!env.AI) return json({ error: { type: 'sem_ia', message: 'Falta o binding Workers AI (nome AI) no worker.' } }, 501, cors);
      let b; try { b = await req.json(); } catch { return json({ error: { message: 'Pedido inválido' } }, 400, cors); }
      if (!b.audio || typeof b.audio !== 'string' || b.audio.length > 8e6) return json({ error: { message: 'Áudio inválido ou grande demais' } }, 400, cors);
      try {
        const o = { audio: b.audio, task: 'transcribe', language: /^[a-z]{2}$/.test(b.language || '') ? b.language : 'pt', vad_filter: true, condition_on_previous_text: false };
        if (b.prompt) o.initial_prompt = String(b.prompt).slice(0, 300);
        const r = await env.AI.run('@cf/openai/whisper-large-v3-turbo', o);
        return json({ text: r.text || '', segments: (r.segments || []).map(x => ({ start: x.start, end: x.end, text: x.text, words: (x.words || []).map(w => ({ w: w.word, s: w.start, e: w.end })) })) }, 200, cors);
      } catch (e) { return json({ error: { message: 'A transcrição falhou: ' + (e.message || e) } }, 502, cors); }
    }
    // links do TikTok (oEmbed oficial: título, autor e capa)
    if (path === '/tt/info') {
      const u = new URL(req.url).searchParams.get('url') || '';
      let h0 = ''; try { h0 = new URL(u).hostname; } catch { }
      if (!/(^|\.)tiktok\.com$/.test(h0)) return json({ error: { message: 'link inválido' } }, 400, cors);
      const r = await fetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(u));
      const j = r.ok ? await r.json().catch(() => ({})) : {};
      if (!j.title && !j.thumbnail_url) return json({ error: { message: 'vídeo não encontrado' } }, 200, cors);
      return json({ title: j.title, author_name: j.author_unique_id || j.author_name, thumbnail_url: j.thumbnail_url }, 200, cors);
    }
    if (path === '/tt/img') {
      const u = new URL(req.url).searchParams.get('u') || '';
      let h1 = ''; try { h1 = new URL(u).hostname; } catch { }
      if (!/(tiktokcdn(-us|-eu)?\.com|ibyteimg\.com|byteimg\.com)$/.test(h1)) return json({ error: { message: 'imagem inválida' } }, 400, cors);
      const r = await fetch(u); if (!r.ok) return new Response(null, { status: 404, headers: cors });
      return new Response(r.body, { status: 200, headers: { ...cors, 'content-type': r.headers.get('content-type') || 'image/jpeg', 'cache-control': 'public, max-age=86400' } });
    }
    // links do YouTube (para referência de estilo): só o título (oEmbed oficial) e as imagens públicas do vídeo
    if (path === '/yt/info' || path === '/yt/img') {
      const q = new URL(req.url).searchParams, id = q.get('id') || '';
      if (!/^[\w-]{11}$/.test(id)) return json({ error: { message: 'id inválido' } }, 400, cors);
      if (path === '/yt/info') {
        const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id));
        if (!r.ok) return json({ error: { message: 'vídeo não encontrado' } }, 200, cors);
        const j = await r.json().catch(() => ({})); return json({ title: j.title, author_name: j.author_name, thumbnail_url: j.thumbnail_url }, 200, cors);
      }
      const f = q.get('f'); if (!['maxresdefault', 'hqdefault', 'hq1', 'hq2', 'hq3', 'mqdefault'].includes(f)) return json({ error: { message: 'imagem inválida' } }, 400, cors);
      const r = await fetch(`https://i.ytimg.com/vi/${id}/${f}.jpg`);
      if (!r.ok) return new Response(null, { status: 404, headers: cors });
      return new Response(r.body, { status: 200, headers: { ...cors, 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' } });
    }
    if (path === '/uso') return json({ ok: 'Servidor da IA da turma funcionando', ...uso(await ler()) }, 200, cors);
    if (path !== '/v1/messages' || req.method !== 'POST') return json({ error: { message: 'Endereço não existe' } }, 404, cors);

    let u = await ler();
    if (uso(u).usd >= limite) return json({ error: { type: 'limite', message: 'Limite de gasto atingido' }, turma_uso: uso(u) }, 402, cors);

    // o corpo vem do editor SEM modelo/limites — quem decide é o servidor (sem reler o JSON inteiro, que pode ter imagens)
    let txt = (await req.text()).trim();
    if (!txt.startsWith('{') || !txt.endsWith('}') || /"(model|max_tokens|thinking|stream)"\s*:/.test(txt.slice(-400))) return json({ error: { message: 'Pedido inválido' } }, 400, cors);
    // resposta em "stream" (aos pedaços): permite respostas bem grandes sem estourar tempo
    const maxT = +env.MAX_TOKENS || 64000;
    const enviar = (think, mt) => fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: txt.slice(0, -1) + `,"model":${JSON.stringify(modelo)},"max_tokens":${mt},"stream":true${think ? `,"thinking":{"type":"enabled","budget_tokens":${Math.min(10000, Math.floor(mt / 4))}}` : ''}}` });
    let think = pensar, mt = maxT, r;
    for (let i = 0; i < 5; i++) {
      r = await enviar(think, mt);
      if (r.status !== 400) break;
      const e = await r.clone().json().catch(() => ({})), m = e?.error?.message || '';
      if (/max_tokens/i.test(m) && mt > 8000) { const lim = +(m.match(/(\d{4,6})/g) || []).map(Number).filter(n => n < mt && n >= 4000).sort((a, b) => b - a)[0]; mt = lim || Math.floor(mt / 2); continue; } // modelo aceita menos tokens
      if (think && /think|budget/i.test(m)) { think = false; continue; } // modelo não aceita "pensar" assim
      break;
    }
    if (!r.ok || !/event-stream/.test(r.headers.get('content-type') || '')) {
      const j = await r.json().catch(() => ({ error: { message: 'Resposta inválida da IA' } }));
      return json(j, r.status, cors);
    }
    // repassa o stream para o editor e, em paralelo, conta o uso (sem atrasar a resposta)
    const [paraEditor, paraConta] = r.body.tee();
    const conta = (async () => {
      const rd = paraConta.getReader(), dec = new TextDecoder(); let ini = '', fim = '';
      for (;;) { const { done, value } = await rd.read(); if (done) break; const t = dec.decode(value, { stream: true }); if (ini.length < 4000) ini += t; fim = (fim + t).slice(-6000); }
      const pega = (txt, k) => { const m = [...txt.matchAll(new RegExp('"' + k + '"\\s*:\\s*(\\d+)', 'g'))]; return m.length ? +m[m.length - 1][1] : 0; };
      const us = { input_tokens: pega(ini, 'input_tokens'), cache_creation_input_tokens: pega(ini, 'cache_creation_input_tokens'), cache_read_input_tokens: pega(ini, 'cache_read_input_tokens'), output_tokens: pega(fim, 'output_tokens') };
      const u2 = await ler(); u2.usd += custo(modelo, us); u2.n++;
      await env.USO.put(mes, JSON.stringify(u2), { expirationTtl: 60 * 60 * 24 * 400 });
    })().catch(() => { });
    if (ctx && ctx.waitUntil) ctx.waitUntil(conta);
    return new Response(paraEditor, { status: 200, headers: { ...cors, 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' } });
  },
};
