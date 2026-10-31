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
     FIREBASE_PROJECT_ID (Text) problems-estudios — liga o login com Google: sem login, nada funciona (nem abrir o editor)
     EMAILS_PERMITIDOS  (Text) e-mails liberados, separados por vírgula (ex.: fulano@gmail.com,ciclano@gmail.com) — os e-mails reais ficam SÓ aqui na Cloudflare, nunca no código
     ADMINS             (Text) e-mails que podem abrir a tela ADM (mudar o menu e quem entra). Vazio = ninguém.
                        Gerenciar QUEM ENTRA (tela ADM › Acesso) exige esta variável: só os e-mails dela podem; vazia = ninguém.
     Além de EMAILS_PERMITIDOS (base fixa, só muda aqui na Cloudflare), entram os e-mails adicionados pela tela ADM › Acesso,
     guardados no KV EQUIPE (chave "acesso/extras"). Tirar alguém de lá vale em até ~1 minuto.
     FIREBASE_CONTA     (Secret, opcional) o arquivo .json inteiro da conta de serviço do Firebase (Configurações do projeto ›
                        Contas de serviço › Gerar nova chave privada). Liga o "Trabalhar junto ao vivo": o servidor mantém no
                        Realtime Database o nó equipe/<uid> de quem pode entrar (só o código da conta, nunca o e-mail) e tira quem saiu da lista.
     FIREBASE_DB_URL    (Text, opcional) endereço do Realtime Database, se não for o padrão https://<projeto>-default-rtdb.firebaseio.com
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
// quem entra = EMAILS_PERMITIDOS (base fixa, Cloudflare) + os adicionados pela tela ADM › Acesso (KV EQUIPE "acesso/extras")
// ADM (mudar o menu e quem entra): só os e-mails da variável ADMINS; vazia = ninguém
const ehAdmin = (env, email) => (env.ADMINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).includes(String(email || '').toLowerCase());
const baseFixa = env => (env.EMAILS_PERMITIDOS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
async function extrasAcesso(env) { try { const v = await env.EQUIPE?.get('acesso/extras', { type: 'json', cacheTtl: 60 }); return Array.isArray(v) ? v.filter(x => x && typeof x.email === 'string') : []; } catch { return []; } }
// espaço da equipe (KV grátis da Cloudflare: 1 GB por conta; EQUIPE_LIMITE_MB muda o limite)
const limiteEquipe = env => (+env.EQUIPE_LIMITE_MB || (env._d1 ? 480 : 1024)) * 1048576;
let usoEq = null; // conta guardada por 1 min (listar a nuvem toda a cada imagem gasta a cota de listagens do dia)
async function usadoEquipe(env, mais = 0) {
  // sem lista (limite do dia, reserva ainda sem a foto da lista): usa a última conta que tiver (ou 0) — medir o espaço NÃO pode impedir de salvar na reserva
  if (!usoEq || Date.now() - usoEq.at > 300e3) { /* 5 min: cada conta lê TODAS as linhas da nuvem (no D1 cada linha lida conta no limite do dia); o que entra nesse meio-tempo já é somado por `mais` */ try { let u = 0, cur; do { const r = await env.EQUIPE.list({ cursor: cur }); for (const k of r.keys) u += +(k.metadata?.tam) || 0; cur = r.list_complete ? null : r.cursor; } while (cur); usoEq = { u, at: Date.now() }; } catch { usoEq = { u: usoEq?.u || 0, at: Date.now() }; } }
  const u = usoEq.u; usoEq.u += mais; return u;
}
const EMAIL_OK = /^[^\s@,;<>"']{1,64}@[^\s@,;<>"']{1,190}\.[a-z]{2,24}$/i;
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
    const lista = baseFixa(env), email = String(pay.email || '').toLowerCase();
    if (pay.email_verified === false) return { ok: false, motivo: 'Este e-mail do Google não está verificado.' };
    const extra = !lista.includes(email) && (await extrasAcesso(env)).some(x => x.email === email);
    if (!lista.length && !extra) return { ok: false, motivo: 'O servidor está sem a lista EMAILS_PERMITIDOS (ninguém entra até o dono configurar).' };
    if (!lista.includes(email) && !extra) return { ok: false, motivo: `A conta ${pay.email || ''} não tem acesso ao Estúdio Problems.` };
    return { ok: true, email: pay.email, uid: String(pay.user_id || pay.sub || '') };
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

// e-mail de quem subiu um arquivo vira o código da pessoa ("u" + 16 hex, o mesmo do porteiro e do Animador): o e-mail nunca vai para o navegador
const _cods = new Map();
async function semEmail(o) {
  if (!o || typeof o.por !== 'string' || !o.por.includes('@')) return o;
  const e = o.por.trim().toLowerCase();
  if (!_cods.has(e)) { const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('estudio-problems:' + e))); _cods.set(e, 'u' + [...b].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join('')); }
  return { ...o, por: _cods.get(e) };
}

/* ---- "Trabalhar junto ao vivo": quem pode entrar no Realtime Database (nó equipe/<uid>) ----
   O servidor usa a conta de serviço (Secret FIREBASE_CONTA) para marcar quem passou no login e tirar quem saiu da lista.
   Guarda só o uid e um resumo (hash) do e-mail: o e-mail nunca vai para o banco. */
let fbTok = null, fbTokAt = 0, fbConta = null, fbErro = '';
const conta = env => {
  if (!env.FIREBASE_CONTA) { fbErro = 'falta o Secret FIREBASE_CONTA no turma-ia'; return null; }
  if (!fbConta) fbConta = lerConta(env.FIREBASE_CONTA); // erro não fica guardado: depois de corrigir o Secret, vale na hora
  if (!fbConta) { const t = String(env.FIREBASE_CONTA).trim(); fbErro = !t.includes('{') ? 'o Secret FIREBASE_CONTA não tem o arquivo .json: abra o arquivo baixado no Bloco de Notas e cole TUDO (começa com { e termina com })'
    : !t.includes('}') || t.lastIndexOf('}') < t.lastIndexOf('"') ? 'o Secret FIREBASE_CONTA ficou cortado no meio: cole o arquivo .json inteiro de novo (até o } do fim)'
    : 'o Secret FIREBASE_CONTA não é o arquivo .json inteiro (cole tudo, do { ao })'; return null; }
  if (!fbConta.private_key || !fbConta.client_email) { fbErro = 'o FIREBASE_CONTA não parece ser o arquivo da conta de serviço (falta private_key/client_email)'; return null; }
  return fbConta;
};
// aceita o arquivo colado do jeito que vier: com aspas em volta, com ``` em volta, com espaço/BOM, com quebras de linha de verdade
// dentro da private_key (o JSON não aceita) ou em base64
function lerConta(t) {
  t = String(t || '').replace(/^\uFEFF/, '').trim();
  const tenta = x => { try { const j = JSON.parse(x); return typeof j === 'string' ? tenta(j) : j && typeof j === 'object' ? j : null; } catch { return null; } };
  const cands = [t];
  const i = t.indexOf('{'), f = t.lastIndexOf('}'); if (i >= 0 && f > i) cands.push(t.slice(i, f + 1));
  try { const d = atob(t.replace(/\s+/g, '')); if (d.includes('{')) cands.push(d.slice(d.indexOf('{'), d.lastIndexOf('}') + 1)); } catch { }
  for (const c of cands) {
    const j = tenta(c) || tenta(c.replace(/"(?:[^"\\]|\\.)*"/gs, m => m.replace(/\r?\n/g, '\\n'))) // quebras de linha de verdade dentro das aspas
      || tenta(c.replace(/[\u201C\u201D]/g, '"')); // aspas "curvas" de editor de texto
    if (j) return j;
  }
  return null;
}
const b64url = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64txt = t => b64url(new TextEncoder().encode(t));
async function fbToken(env) {
  const c = conta(env); if (!c) return null;
  if (fbTok && Date.now() - fbTokAt < 50 * 60e3) return fbTok;
  const agora = Math.floor(Date.now() / 1000);
  const corpo = b64txt(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64txt(JSON.stringify({
    iss: c.client_email, sub: c.client_email, aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email' }));
  let ass;
  try {
    const pem = c.private_key.replace(/-----[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
    const chave = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), x => x.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    ass = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(corpo));
  } catch { fbErro = 'a private_key do FIREBASE_CONTA não abriu (o arquivo foi colado inteiro?)'; return null; }
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + corpo + '.' + b64url(ass) });
  if (!r.ok) { fbErro = `o Google recusou a conta de serviço (${r.status}); gere uma chave nova em Contas de serviço e cole de novo`; console.log('ao vivo:', fbErro, (await r.text()).slice(0, 200)); return null; }
  fbTok = (await r.json()).access_token; fbTokAt = Date.now(); return fbTok;
}
const fbUrl = env => (env.FIREBASE_DB_URL || `https://${conta(env)?.project_id || env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`).replace(/\/+$/, '');
const resumo = async e => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('estudio-problems:' + String(e || '').trim().toLowerCase())))].map(x => x.toString(16).padStart(2, '0')).join('');
const marcados = new Map(); let limpoAt = 0;
// devolve 'ok' ou o motivo (o site mostra esse motivo quando o tempo real recusa a entrada)
async function aoVivoMarca(env, uid, email, forcar) {
  try {
    if (!conta(env)) return fbErro;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid || '')) return 'o login não trouxe o código da conta';
    if (!forcar && Date.now() - (marcados.get(uid) || 0) < 30 * 60e3) return 'ok'; // no máximo uma vez a cada 30 min por pessoa (por servidor)
    const tok = await fbToken(env); if (!tok) return fbErro;
    const r = await fetch(`${fbUrl(env)}/equipe/${uid}.json`, { method: 'PUT', headers: { authorization: 'Bearer ' + tok }, body: JSON.stringify({ h: await resumo(email), em: Date.now() }) });
    if (r.ok) { marcados.set(uid, Date.now()); return 'ok'; }
    const txt = (await r.text()).slice(0, 160); console.log('ao vivo: o banco recusou', r.status, txt);
    if (r.status === 404 || /different region|not found/i.test(txt)) return `o Realtime Database não foi achado em ${fbUrl(env)} (crie a variável FIREBASE_DB_URL com o endereço certo)`;
    return `o Realtime Database recusou a gravação (${r.status})`;
  } catch (e) { console.log('ao vivo: erro', String(e?.message || e)); return 'erro no servidor: ' + String(e?.message || e).slice(0, 120); }
}
async function aoVivoLimpa(env, forcar) {
  try {
    if (!conta(env) || (!forcar && Date.now() - limpoAt < 10 * 60e3)) return;
    limpoAt = Date.now();
    const tok = await fbToken(env); if (!tok) return;
    const ok = new Set(await Promise.all([...baseFixa(env), ...(await extrasAcesso(env)).map(x => x.email)].map(resumo)));
    const r = await fetch(`${fbUrl(env)}/equipe.json`, { headers: { authorization: 'Bearer ' + tok } });
    if (!r.ok) return;
    const eq = (await r.json()) || {};
    for (const [uid, v] of Object.entries(eq)) if (!v || !ok.has(v.h)) { marcados.delete(uid); await fetch(`${fbUrl(env)}/equipe/${uid}.json`, { method: 'DELETE', headers: { authorization: 'Bearer ' + tok } }); }
  } catch { }
}

/* ---- NUVEM PRINCIPAL NO D1 (decisão do dono, 29/10/2026) ----
   O KV grátis só deixa gravar 1000 vezes por dia na conta toda; o D1 (banco da Cloudflare, mesma conta) deixa ~100 mil. Este
   adaptador fala igual ao KV (get/getWithMetadata/put/delete/list), então o resto do servidor não muda. Liga quando o banco
   EQUIPE_DB está ligado ao worker E a marca 'ativo' foi gravada nele (a Action "Principal no D1" grava depois de copiar
   tudo do KV e conferir). Arquivo maior que 1,9 MB vai em pedaços (tabela parte), um pedaço por consulta. */
const CH_D1 = 1900000, d1Est = { at: 0, on: false };
async function d1Ligado(env) {
  if (!env.EQUIPE_DB) return false; if (Date.now() - d1Est.at < 60e3) return d1Est.on;
  try { const r = await env.EQUIPE_DB.prepare("SELECT v FROM cfg WHERE k = 'ativo'").first(); d1Est.on = r?.v === '1'; } catch { d1Est.on = false; }
  d1Est.at = Date.now(); return d1Est.on;
}
const bytesDe = async v => v == null ? new Uint8Array(0) : typeof v === 'string' ? new TextEncoder().encode(v) : v instanceof ArrayBuffer ? new Uint8Array(v) : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : new Uint8Array(await new Response(v).arrayBuffer());
async function d1Grava(db, k, buf, meta) {
  await db.prepare('DELETE FROM parte WHERE k = ?').bind(k).run(); let n = 0;
  for (let i = 0; i < buf.byteLength; i += CH_D1, n++) await db.prepare('INSERT INTO parte (k, i, v) VALUES (?, ?, ?)').bind(k, n, buf.subarray(i, i + CH_D1)).run();
  await db.prepare('INSERT OR REPLACE INTO arq (k, meta, n, tam, em) VALUES (?, ?, ?, ?, ?)').bind(k, JSON.stringify(meta || {}), n, buf.byteLength, Date.now()).run();
}
async function d1Le(db, k) {
  const a = await db.prepare('SELECT meta, n FROM arq WHERE k = ?').bind(k).first(); if (!a) return null;
  let corpo = new Uint8Array(0);
  if (a.n) { const { results } = await db.prepare('SELECT v FROM parte WHERE k = ? ORDER BY i').bind(k).all(); const ps = (results || []).map(x => new Uint8Array(x.v)); corpo = new Uint8Array(ps.reduce((t, p) => t + p.length, 0)); let o = 0; for (const p of ps) { corpo.set(p, o); o += p.length; } }
  let meta = null; try { meta = JSON.parse(a.meta || 'null'); } catch { } return { buf: corpo, meta: meta && Object.keys(meta).length ? meta : null };
}
function kvD1(db) {
  const como = (buf, o) => { const t = typeof o === 'string' ? o : o?.type || 'text'; if (t === 'arrayBuffer') return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); if (t === 'stream') return new Response(buf).body;
    const s = new TextDecoder().decode(buf); return t === 'json' ? JSON.parse(s) : s; };
  return {
    async get(k, o) { const r = await d1Le(db, k); return r ? como(r.buf, o) : null; },
    async getWithMetadata(k, o) { const r = await d1Le(db, k); return r ? { value: como(r.buf, o), metadata: r.meta } : { value: null, metadata: null }; },
    async put(k, v, o) { await d1Grava(db, k, await bytesDe(v), o?.metadata); },
    async delete(k) { await db.batch([db.prepare('DELETE FROM parte WHERE k = ?').bind(k), db.prepare('DELETE FROM arq WHERE k = ?').bind(k)]); },
    async deleteLote(ks) { const st = []; for (const k of ks) st.push(db.prepare('DELETE FROM parte WHERE k = ?').bind(k), db.prepare('DELETE FROM arq WHERE k = ?').bind(k)); for (let i = 0; i < st.length; i += 400) await db.batch(st.slice(i, i + 400)); },
    // a lista vem inteira de uma vez (o servidor já guarda na memória por 5 min); cursor = depois desta chave
    async list(o = {}) { const pre = o.prefix || '', lim = Math.min(+o.limit || 100000, 100000), de = o.cursor || '';
      const { results } = await db.prepare('SELECT k, meta FROM arq WHERE k >= ? AND k < ? AND k > ? ORDER BY k LIMIT ?').bind(pre, pre + '\uffff', de, lim + 1).all(); // faixa pelo índice da chave: lê só as linhas do começo pedido (substr lia a tabela inteira)
      const rs = results || [], mais = rs.length > lim, keys = rs.slice(0, lim).map(x => { let m = null; try { m = JSON.parse(x.meta || 'null'); } catch { } return { name: x.k, ...(m && Object.keys(m).length ? { metadata: m } : {}) }; });
      return { keys, list_complete: !mais, cursor: mais ? keys[keys.length - 1].name : undefined }; },
  };
}
// ROBÔS (Actions do repo estudio-problems, com a senha dos robôs = segredo ROBO): copiar o KV para o D1, ligar, cópia de segurança e devolver a reserva
async function robo(req, env) {
  const u = new URL(req.url), rota = u.pathname.slice(6), k = u.searchParams.get('k') || '', db = env.EQUIPE_DB;
  const js = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  const ok = !!env.ROBO && String(req.headers.get('x-senha') || '') === env.ROBO; if (!ok) return js({ erro: 'senha' }, 401);
  if (!db) return js({ erro: 'sem o banco EQUIPE_DB' }, 501);
  if (rota === 'estado') { const a = await db.prepare("SELECT v FROM cfg WHERE k = 'ativo'").first().catch(() => null), n = await db.prepare('SELECT count(*) AS n, sum(tam) AS b FROM arq').first().catch(() => null); return js({ ativo: a?.v === '1', n: n?.n || 0, bytes: n?.b || 0 }); }
  if (rota === 'ligar' && req.method === 'POST') { const v = u.searchParams.get('v') === '0' ? '0' : '1'; await db.prepare("INSERT OR REPLACE INTO cfg (k, v) VALUES ('ativo', ?)").bind(v).run(); d1Est.at = 0; return js({ ok: true, ativo: v === '1' }); }
  if (rota === 'lista') { const out = []; let cur; do { const r = await kvD1(db).list({ prefix: u.searchParams.get('prefix') || '', cursor: cur }); out.push(...r.keys); cur = r.list_complete ? null : r.cursor; } while (cur); return js({ keys: out }); }
  if (rota === 'arq' && k && k.length <= 512) {
    if (req.method === 'GET') { const r = await d1Le(db, k); return r ? new Response(r.buf, { headers: { 'x-meta': encodeURIComponent(JSON.stringify(r.meta || {})), 'cache-control': 'no-store' } }) : js({ erro: 'não achei' }, 404); }
    if (req.method === 'PUT') { let meta = null; try { meta = JSON.parse(decodeURIComponent(req.headers.get('x-meta') || 'null')); } catch { } const buf = new Uint8Array(await req.arrayBuffer()); if (buf.byteLength > 25 * 1048576) return js({ erro: 'grande' }, 413); await d1Grava(db, k, buf, meta); kvLista = null; return js({ ok: true }); }
    if (req.method === 'DELETE') { await kvD1(db).delete(k); kvLista = null; return js({ ok: true }); }
  }
  if (rota === 'apaga' && req.method === 'POST') { let o = {}; try { o = await req.json(); } catch { } const ks = (Array.isArray(o.k) ? o.k : []).filter(x => typeof x === 'string' && x && x.length <= 512).slice(0, 2000); await kvD1(db).deleteLote(ks); kvLista = null; return js({ ok: true, n: ks.length }); }
  return js({ erro: 'pedido desconhecido' }, 400);
}

/* ---- LISTA DO KV GUARDADA NA MEMÓRIA (plano grátis da Cloudflare: só 1000 "list" por DIA na conta toda) ----
   Toda lista do KV EQUIPE (personagens, cenários, espaço usado…) sai de UMA lista completa guardada aqui por 5 min; o que
   este servidor grava ou apaga já entra na lista guardada na hora (put/delete passam por aqui). Antes cada abertura da
   biblioteca/espaço gastava listas e o limite do dia acabava ("reached the free usage limit"). */
let kvLista = null; const KV_LISTA_MS = 5 * 60e3;
/* NUVEM RESERVA (decisão do dono, 23/10/2026): quando esta conta chega no limite grátis do dia, o que seria gravado/apagado vai
   para a reserva (Worker reserva-problems com D1; em último caso ele passa para a antiga, sons-problems), e as leituras/listas juntam.
   Depois das 21h de Brasília (00:00 UTC) a principal volta e, aos poucos, tudo passa de volta (`migra`) e sai da reserva.
   Fora do limite a reserva não muda nada (só confere "tem algo lá?" no máximo a cada 2 min). Respostas que usaram a
   reserva levam o cabeçalho x-nuvem: reserva (o site mostra o aviso). */
// desde 26/10/2026 a reserva é a NOVA (Worker reserva-problems, D1 na 3ª conta, ~100 mil gravações/dia); ela mesma passa para a
// reserva ANTIGA (sons-problems, conta antiga) só quando também chega no limite — o contrato /reserva/* é o mesmo
const RESERVA_URL = 'https://reserva-problems.problemsraizz.workers.dev';
const fimDoDia = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.getTime(); };
let tercAte = 0, fotoC = null, limiteAte = 0, resEstado = { at: 0, ativo: false }, resIdx = { at: 0, m: null }, fotoListaEm = 0, migraEm = 0, bkMan = null, resConta = null, cheioVisto = 0;
// PROTEÇÃO: com 85% das gravações, listas ou apagadas do dia já gastas (medida de 15 em 15 min), a principal é poupada até as 21h
// (como se tivesse acabado): sobra folga para a última foto da lista e para a cópia de segurança, e nada para no meio.
const SEGURO = 0.85;
const emLimite = () => Date.now() < limiteAte;
function reservaDe(env, auth) {
  if (!auth || env.RESERVA === 'nao') return null; const base = (env.RESERVA_URL || RESERVA_URL).replace(/\/+$/, '');
  const call = async (path, o = {}, ms = 9000) => { const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    try { const r = await fetch(base + path, { ...o, headers: { authorization: auth, ...(o.headers || {}) }, signal: ac.signal });
      if (r.headers.get('x-reserva') === 'antiga') tercAte = fimDoDia(); // a reserva passou para a TERCIÁRIA (encheu também): o site fica rosa até as 21h
      return r; } finally { clearTimeout(t); } };
  const ok = async r => { if (!r.ok) { let j = null; try { j = await r.clone().json(); } catch { } throw new Error(j?.erro === 'limite' ? 'RESERVA_NO_LIMITE' : 'a nuvem reserva respondeu ' + r.status); } return r; };
  return {
    async ativa() { if (Date.now() - resEstado.at < 120e3) return resEstado.ativo;
      try { const j = await (await call('/reserva/estado', {}, 2500)).json(); resEstado = { at: Date.now(), ativo: !!j.ativo }; } catch { resEstado = { at: Date.now(), ativo: false }; } return resEstado.ativo; },
    async indice(novo) { if (!novo && resIdx.m && Date.now() - resIdx.at < 60e3) return resIdx.m;
      const j = await (await ok(await call('/reserva/lista'))).json(), m = new Map(); for (const k of j.keys || []) m.set(k.name, k); resIdx = { m, at: Date.now() }; return m; },
    async get(k) { const r = await call('/reserva/arq?k=' + encodeURIComponent(k)); if (r.status === 404) return { value: null, metadata: null }; await ok(r);
      let meta = {}; try { meta = JSON.parse(decodeURIComponent(r.headers.get('x-meta') || '%7B%7D')); } catch { } return { value: await r.arrayBuffer(), metadata: meta }; },
    async put(k, v, meta) { await ok(await call('/reserva/arq?k=' + encodeURIComponent(k), { method: 'PUT', body: v, headers: { 'x-meta': encodeURIComponent(JSON.stringify(meta || {})) } }));
      resEstado = { at: Date.now(), ativo: true }; resIdx.m?.set(k, { name: k, metadata: meta || {} }); },
    async del(k, tomb) { await ok(await call('/reserva/arq?k=' + encodeURIComponent(k) + (tomb ? '&tomb=1' : ''), { method: 'DELETE' }));
      if (tomb) { resEstado = { at: Date.now(), ativo: true }; resIdx.m?.set(k, { name: k, metadata: { _del: 1 } }); } else resIdx.m?.delete(k); },
    async delMuitos(ks, tomb) { if (!ks.length) return; await ok(await call('/reserva/apaga', { method: 'POST', body: JSON.stringify({ k: ks, tomb: !!tomb }), headers: { 'content-type': 'application/json' } }, 25000));
      if (tomb) resEstado = { at: Date.now(), ativo: true }; for (const k of ks) { if (tomb) resIdx.m?.set(k, { name: k, metadata: { _del: 1 } }); else resIdx.m?.delete(k); } },
    async delPasta(pasta) { await ok(await call('/reserva/apaga', { method: 'POST', body: JSON.stringify({ k: [pasta], tomb: true, pasta: true }), headers: { 'content-type': 'application/json' } }, 25000));
      resEstado = { at: Date.now(), ativo: true }; if (resIdx.m) { for (const n of [...resIdx.m.keys()]) if (n.startsWith(pasta)) resIdx.m.delete(n); resIdx.m.set(pasta, { name: pasta, metadata: { _del: 1 } }); } },
    copiar: () => call('/reserva/copiar', { method: 'POST' }).then(r => r.json()).catch(e => ({ erro: String(e?.message || e) })),
    bkcfg: () => call('/reserva/bkcfg').then(r => r.ok ? r.json() : null).catch(() => null),
    poeBkcfg: c => call('/reserva/bkcfg', { method: 'PUT', body: JSON.stringify(c) }).then(async r => r.ok ? { ok: true } : { erro: (await r.json().catch(() => ({}))).erro || 'a reserva respondeu ' + r.status }),
    async bkman() { if (bkMan && Date.now() - bkMan.at < 300e3) return bkMan.j; const r = await call('/reserva/bkman'); const j = r.ok ? await r.json().catch(() => null) : null; bkMan = { at: Date.now(), j }; return j; },
    async bkget(k) { const r = await call('/reserva/bk?k=' + encodeURIComponent(k)); if (!r.ok) return { value: null, metadata: null };
      let meta = {}; try { meta = JSON.parse(decodeURIComponent(r.headers.get('x-meta') || '%7B%7D')); } catch { } return { value: await r.arrayBuffer(), metadata: meta }; },
    async contaJa() { if (resConta && Date.now() - resConta.at < 300e3) return resConta.j; const j = await this.conta(); resConta = { at: Date.now(), j }; return j; },
    medir: () => call('/reserva/medir', { method: 'POST' }).then(r => r.json()).catch(e => ({ erro: String(e?.message || e) })),
    ideias: () => call('/reserva/ideias', { method: 'POST' }).then(r => r.json()).catch(e => ({ erro: String(e?.message || e) })),
    conta: () => call('/reserva/conta').then(r => r.ok ? r.json() : null).catch(() => null),
    fim: () => call('/reserva/fim', { method: 'POST' }).then(() => { resEstado = { at: Date.now(), ativo: false }; }),
    async fotoMapa() { if (fotoC && Date.now() - fotoC.at < 300e3) return fotoC.m; let m = null; try { m = await this.fotoLista(); } catch { } fotoC = { at: Date.now(), m }; return m; }, // foto da lista da principal (5 min)
    async fotoLista() { const a = await (await ok(await call('/reserva/lista-principal'))).json(); return a.length ? new Map(a.map(([n, m]) => [n, { name: n, ...(m ? { metadata: m } : {}) }])) : null; },
    guardaLista: m => call('/reserva/lista-principal', { method: 'PUT', body: JSON.stringify([...m.values()].map(k => [k.name, k.metadata || null])) }, 20000),
  };
}
const valorComo = (buf, o) => { const t = typeof o === 'string' ? o : o?.type || 'text'; if (buf == null) return null;
  if (t === 'arrayBuffer') return buf; if (t === 'stream') return new Response(buf).body; const s = new TextDecoder().decode(buf); return t === 'json' ? JSON.parse(s) : s; };
function kvComLista(kv, forcar, R, flag, bg) { // forcar (?novo=1, botão Atualizar): busca de novo se a guardada tem mais de 30 s
  const usou = () => { flag.reserva = true; }, marca = e => { if (!ehLimite(e)) return false; limiteAte = fimDoDia(); return true; };
  const ativa = async () => !!R && (emLimite() || await R.ativa());
  const res = async fn => { try { return await fn(); } catch (e) { const m = String(e?.message || e); throw new Error(m === 'RESERVA_NO_LIMITE' ? 'RESERVA_NO_LIMITE' : 'RESERVA_SEM_RESPOSTA: ' + m.slice(0, 80)); } };
  // pasta apagada inteira (marca "personagens/<id>/" na reserva): tudo dentro dela conta como apagado
  const pastaApagada = (ri, k) => { for (const [n, it] of ri) if (n.endsWith('/') && it.metadata?._del && k.startsWith(n)) return true; return false; };
  const naReserva = async k => { if (!(await ativa())) return null; try { const ri = await R.indice(); return ri.get(k) || (pastaApagada(ri, k) ? { name: k, metadata: { _del: 1 } } : null); } catch { return null; } };
  const carrega = async () => {
    if (kvLista && Date.now() - kvLista.at < (forcar ? 30e3 : KV_LISTA_MS)) return kvLista.m;
    const m = new Map(); let cur; do { const r = await kv.list({ cursor: cur }); for (const k of r.keys) m.set(k.name, k); cur = r.list_complete ? null : r.cursor; } while (cur);
    kvLista = { m, at: Date.now() };
    if (R && Date.now() - fotoListaEm > 15 * 60e3) { fotoListaEm = Date.now(); bg(R.guardaLista(m).catch(() => { })); } // foto da lista guardada na reserva (de 15 em 15 min: se a principal acabar de repente, a lista continua abrindo pela reserva)
    return m;
  };
  const ler = async (k, o, meta) => { const it = await naReserva(k);
    if (it) { usou(); if (it.metadata?._del) return meta ? { value: null, metadata: null } : null; const g = await R.get(k); return meta ? { value: valorComo(g.value, o), metadata: g.metadata } : valorComo(g.value, o); }
    try { return meta ? await kv.getWithMetadata(k, o) : await kv.get(k, o); }
    catch (e) { if (!R) throw e; const g = await R.bkget(k).catch(() => ({ value: null })); if (g.value == null) throw e; usou(); flag.copia = true; return meta ? { value: valorComo(g.value, o), metadata: g.metadata } : valorComo(g.value, o); } };
  const W = {
    get: (k, o) => ler(k, o, false), getWithMetadata: (k, o) => ler(k, o, true),
    async put(k, v, o) {
      const poe = () => { if (kvLista) kvLista.m.set(k, { name: k, ...(o?.metadata ? { metadata: o.metadata } : {}) }); };
      if (R && emLimite()) { await res(() => R.put(k, v, o?.metadata)); usou(); poe(); return; }
      try { const r = await kv.put(k, v, o); poe(); const it = await naReserva(k); if (it) bg(R.del(k).catch(() => { })); return r; } // a da reserva ficou velha
      catch (e) { if (!R || !marca(e)) throw e; return W.put(k, v, o); }
    },
    async delete(k) {
      // a principal não tem essa chave (nasceu na reserva, ex.: imagem nova do Ateliê, ou nem existe): apaga de verdade, SEM "apagada"
      // (cada "apagada" é uma gravação na reserva e mais uma apagada na principal depois das 21h)
      const semNaPrincipal = async () => { const f = R && emLimite() ? await R.fotoMapa() : null; return !!f && !f.has(k); };
      const it = await naReserva(k); if (it && !it.metadata?._del) { await R.del(k); usou(); if (kvLista && !kvLista.m.has(k)) return; if (await semNaPrincipal()) { kvLista?.m.delete(k); return; } }
      if (R && emLimite()) { if (!it && await semNaPrincipal()) { kvLista?.m.delete(k); return; } await res(() => R.del(k, true)); usou(); kvLista?.m.delete(k); return; }
      try { const r = await kv.delete(k); kvLista?.m.delete(k); return r; } catch (e) { if (!R || !marca(e)) throw e; return W.delete(k); }
    },
    // apagar VÁRIAS (personagem inteiro) com poucos pedidos à reserva (o Worker grátis aceita só 50 pedidos para fora por vez)
    async deleteMuitos(ks, pasta) {
      if (R && emLimite() && !pasta) { const f = await R.fotoMapa(); if (f) { const real = ks.filter(k => !f.has(k)); // nasceram na reserva: apagam de verdade (sem "apagada")
          if (real.length) { let ri = null; try { ri = await R.indice(); } catch { } const la = real.filter(k => ri?.get(k)); if (la.length) await res(() => R.delMuitos(la, false)); }
          ks = ks.filter(k => f.has(k)); if (!ks.length) { usou(); for (const k of real) kvLista?.m.delete(k); return; } for (const k of real) kvLista?.m.delete(k); } }
      if (R && emLimite()) { await res(() => pasta ? R.delPasta(pasta) : R.delMuitos(ks, true)); usou(); for (const k of ks) kvLista?.m.delete(k); if (pasta && kvLista) for (const n of [...kvLista.m.keys()]) if (n.startsWith(pasta)) kvLista.m.delete(n); return; }
      if (await ativa()) { let ri = null; try { ri = await R.indice(); } catch { } const la = ks.filter(k => ri?.get(k) && !ri.get(k).metadata?._del); if (la.length) { await R.delMuitos(la, false); usou(); } }
      if (kv.deleteLote) { try { await kv.deleteLote(ks); for (const k of ks) kvLista?.m.delete(k); return; } catch (e) { if (!R || !marca(e)) throw e; return W.deleteMuitos(ks, pasta); } }
      for (let i = 0; i < ks.length; i++) { try { await kv.delete(ks[i]); kvLista?.m.delete(ks[i]); } catch (e) { if (!R || !marca(e)) throw e; return W.deleteMuitos(ks.slice(i), pasta); } }
    },
    async list(o = {}) {
      const semLista = async e => { let m2 = kvLista?.m || await R.fotoLista().catch(() => null);
        if (!m2) { const bk = await R.bkman().catch(() => null); if (bk?.itens && Object.keys(bk.itens).length) { m2 = new Map(Object.entries(bk.itens).map(([n, v]) => [n, { name: n, metadata: v.m || {} }])); flag.copia = true; } }
        // sem foto nem cópia: ainda assim o que foi SALVO NA RESERVA aparece (lista parcial; o navegador mostra o resto como cópia local)
        if (!m2) { const ri = await R.indice().catch(() => null); if (ri?.size) { m2 = new Map(); flag.parcial = true; } }
        if (!m2) throw e; usou(); return m2; };
      let m; if (R && emLimite() && !(kvLista && Date.now() - kvLista.at < KV_LISTA_MS)) m = await semLista(new Error('KV list() limit exceeded for the day.'));
      else try { m = await carrega(); } catch (e) { if (!R || !marca(e)) throw e; m = await semLista(e); }
      if (await ativa()) { try { const ri = await R.indice(); if (ri.size) { m = new Map(m); const pastas = [...ri].filter(([n, it]) => n.endsWith('/') && it.metadata?._del).map(([n]) => n); if (pastas.length) for (const n of [...m.keys()]) if (pastas.some(p => n.startsWith(p)) && !(ri.get(n) && !ri.get(n).metadata?._del)) m.delete(n); for (const [k, it] of ri) { if (it.metadata?._del) m.delete(k); else m.set(k, { name: k, metadata: { ...(it.metadata || {}), _res: 1 } }); } usou(); } } catch { } } // _res: está na reserva (o Animador põe a borda cor água)
      const pre = o.prefix || ''; return { keys: [...m.values()].filter(k => k.name.startsWith(pre)).sort((a, b) => a.name < b.name ? -1 : 1), list_complete: true };
    },
  };
  return W;
}
async function confereCheio(kv, R) {
  if (!R || emLimite() || Date.now() - cheioVisto < 60e3) return; cheioVisto = Date.now();
  const c = await R.contaJa(), o = c?.contas?.principal, L = c?.limites; if (!o?.kv || !L || c.dia !== new Date().toISOString().slice(0, 10)) return;
  const pct = o.d1ativo && o.d1 ? o.d1.write / (L.d1Write || 1e5) : Math.max(o.kv.write / L.write, o.kv.list / L.list, o.kv.delete / L.delete); if (pct < SEGURO) return; // no D1 conta as linhas gravadas
  // última foto da lista antes de poupar (se ainda dá para listar) e a cópia de segurança do que mudou
  if (o.kv.list / L.list < 0.97 && Date.now() - fotoListaEm > 30 * 60e3) { try { kvLista = null; fotoListaEm = 0; await kv.list({}); } catch { } }
  limiteAte = fimDoDia(); R.copiar().catch(() => { });
}
// depois do limite: passa da reserva para a principal aos poucos (10 por pedido, no máximo a cada 2 min nesta instância)
async function migra(kv, R) {
  if (!R || emLimite() || Date.now() - migraEm < 120e3) return; migraEm = Date.now();
  if (!(await R.ativa())) return;
  const m = await R.indice(true); let n = 0;
  for (const [k, it] of [...m]) {
    if (n++ >= 10) break;
    try {
      if (it.metadata?._del && k.endsWith('/')) { const l = await kv.list({ prefix: k }); for (const x of l.keys.slice(0, 40)) { await kv.delete(x.name); kvLista?.m.delete(x.name); } if (l.keys.length > 40) continue; }
      else if (it.metadata?._del) { if (!kvLista || kvLista.m.has(k)) await kv.delete(k); } // a principal nem tem: só some da reserva
      else { const atual = kvLista?.m.get(k)?.metadata, rm = it.metadata || {};
        const maisNova = atual && (+(atual.mod || Date.parse(atual.em || 0) || 0)) > (+(rm.mod || Date.parse(rm.em || 0) || 0));
        if (!maisNova) { const g = await R.get(k); if (g.value != null) { await kv.put(k, g.value, Object.keys(rm).length ? { metadata: rm } : undefined); if (kvLista) kvLista.m.set(k, { name: k, metadata: rm }); } } }
      await R.del(k); m.delete(k);
    } catch (e) { if (ehLimite(e)) limiteAte = fimDoDia(); break; }
  }
  if (!m.size) await R.fim().catch(() => { });
}

// limite grátis da Cloudflare acabou (KV: 1000 gravações/listas/apagadas por dia na conta): em vez de "Failed to fetch",
// responde um aviso claro (com CORS, para o navegador conseguir ler) e quando volta (00:00 UTC = 21h de Brasília)
const ehLimite = e => /10048|free usage limit|limit exceeded for the day|for today|daily limit|daily row (read|write) limit|exceeded D1's free tier/i.test(String(e?.message || e));
function avisoLimite(req, e) {
  const o = req.headers.get('origin') || '*', d = new Date(); d.setUTCHours(24, 0, 0, 0); const m = String(e?.message || e), duas = /RESERVA_NO_LIMITE/.test(m), semRes = /RESERVA_SEM_RESPOSTA/.test(m), lim = duas || ehLimite(e);
  if (semRes) return new Response(JSON.stringify({ error: { type: 'reserva', message: 'A nuvem da equipe está no limite de hoje e a nuvem reserva não respondeu agora. Tente de novo em alguns segundos. O que você fez continua guardado neste computador.' } }), { status: 503,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization, content-type', 'vary': 'origin', 'cache-control': 'no-store' } });
  return new Response(JSON.stringify({ error: lim ? { type: 'limite_cloudflare', volta: d.toISOString(), message: duas ? 'A nuvem da equipe, a reserva e a terciária chegaram ao limite de hoje. Voltam sozinhas às 21h (horário de Brasília). O que você fez continua guardado neste computador.' : 'A nuvem da equipe chegou ao limite de hoje. Volta sozinha às 21h (horário de Brasília). O que você fez continua guardado neste computador.' }
    : { type: 'servidor', message: 'O servidor da nuvem teve um erro: ' + String(e?.message || e).slice(0, 160) } }), { status: lim ? 503 : 500,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization, content-type', 'vary': 'origin', 'cache-control': 'no-store' } });
}

export default {
  async fetch(req, env, ctx) {
    if (new URL(req.url).pathname.startsWith('/robo/')) { try { return await robo(req, env); } catch (e) { return new Response(JSON.stringify({ erro: String(e?.message || e).slice(0, 200) }), { status: ehLimite(e) ? 503 : 500, headers: { 'content-type': 'application/json' } }); } }
    // a nuvem principal no D1 (depois de ligada): o resto do servidor continua falando "KV" com o adaptador
    if (await d1Ligado(env)) env = { ...env, EQUIPE: kvD1(env.EQUIPE_DB), _kvAntigo: env.EQUIPE, _d1: true };
    const flag = { reserva: false }; let r;
    try { r = await this.atende(req, env, ctx, flag); } catch (e) { console.log('erro:', String(e?.message || e).slice(0, 200)); return avisoLimite(req, e); }
    if (flag.reserva && !emLimite()) { // a principal JÁ VOLTOU e o que sobrou na reserva está voltando para ela: o site tira o aviso
      const h = new Headers(r.headers); h.set('x-nuvem', 'voltando'); h.set('access-control-expose-headers', 'x-nuvem'); r = new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
    } else if (flag.reserva || emLimite()) { // o site mostra "usando a nuvem reserva" (ou só o aviso do limite)
      const h = new Headers(r.headers); h.set('x-nuvem', flag.reserva ? (Date.now() < tercAte ? 'terciaria' : 'reserva') : 'limite'); h.set('x-nuvem-volta', new Date(fimDoDia()).toISOString()); if (flag.copia) h.set('x-nuvem-copia', '1'); if (flag.parcial) h.set('x-nuvem-parcial', '1'); h.set('access-control-expose-headers', 'x-nuvem, x-nuvem-volta, x-nuvem-copia, x-nuvem-parcial');
      r = new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
    }
    return r;
  },
  async atende(req, env, ctx, flag = {}) {
    const auth0 = req.headers.get('authorization') || '', p00 = new URL(req.url).pathname;
    const R = env.EQUIPE && p00 !== '/confere' && /^Bearer \S{20,}$/.test(auth0) ? reservaDe(env, auth0) : null, bg = pr => ctx?.waitUntil ? ctx.waitUntil(pr) : null;
    if (env.EQUIPE && !env._kvLista) env = { ...env, EQUIPE: kvComLista(env.EQUIPE, new URL(req.url).searchParams.get('novo') === '1', R, flag, bg), _kvLista: true, _base: env.EQUIPE };
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
    if (R && login.email) bg(migra(env._base, R).catch(() => { })); // depois do limite: devolve aos poucos o que ficou na reserva
    if (R && login.email) bg(confereCheio(env.EQUIPE, R).catch(() => { })); // perto do limite (85%): poupa a principal até as 21h
    // RESUMO para o círculo da nuvem quando a principal não deixa listar (limite do dia): o espaço medido pela Cloudflare
    // (Action "Uso da nuvem") + o que está na reserva agora. Qualquer conta da equipe; sem e-mails (semEmail)
    if (new URL(req.url).pathname === '/nuvem-resumo') {
      const R3 = reservaDe(env, auth0), out = { bytes: null, em: null, reserva: { n: 0, bytes: 0, itens: [] }, volta: new Date(fimDoDia()).toISOString() };
      if (R3) { const c = await R3.contaJa().catch(() => null), o = c?.contas?.principal; if (o?.bytes != null) { out.bytes = o.bytes; out.em = c.em; }
        try { if (await R3.ativa()) for (const it of (await R3.indice()).values()) { if (it.metadata?._del) continue; out.reserva.n++; out.reserva.bytes += +it.metadata?.tam || 0; if (out.reserva.itens.length < 300) out.reserva.itens.push(await semEmail({ k: it.name, ...(it.metadata || {}) })); } } catch { } }
      return json(out, 200, { ...cors, 'cache-control': 'no-store' });
    }
    // ADM › Nuvem: gasto de hoje das duas contas (medido pela Action "Uso da nuvem" de 30 em 30 min) + o que está na reserva agora
    if (new URL(req.url).pathname === '/nuvem-painel') {
      if (!ehAdmin(env, login.email)) return json({ error: { type: 'adm', message: 'Só para ADM.' } }, 403, cors);
      const R2 = reservaDe(env, auth0), out = { conta: null, reserva: { ativo: false, n: 0, bytes: 0, apagadas: 0 }, limite: emLimite() ? new Date(limiteAte).toISOString() : null, volta: new Date(fimDoDia()).toISOString() };
      if (R2 && req.method === 'POST') { let b = {}; try { b = await req.json(); } catch { }
        const r = b.acao === 'copiar' ? await R2.copiar() : b.acao === 'cfg' ? await R2.poeBkcfg({ prefixos: (Array.isArray(b.prefixos) ? b.prefixos : []).filter(x => /^[a-z0-9-]{1,40}\/$/.test(x)).slice(0, 20) }) : await R2.medir();
        if (b.acao === 'cfg') bkMan = null; return json(r, 200, { ...cors, 'cache-control': 'no-store' }); } // "Medir agora", "Copiar agora" e o que entra na cópia
      out.seguro = SEGURO; out.poupando = emLimite();
      if (R2) { const [cfg, bk] = await Promise.all([R2.bkcfg(), (bkMan = null, R2.bkman().catch(() => null))]); out.copia = { prefixos: cfg?.prefixos || ['personagens/'], em: bk?.em || null, n: bk?.n || 0, bytes: bk?.bytes || 0, falta: bk?.falta || 0 };
        const raizes = new Set(); try { for (const k of (await env.EQUIPE.list({})).keys) raizes.add(k.name.split('/')[0] + '/'); } catch { } out.copia.raizes = [...raizes].sort(); }
      if (R2) { out.conta = await R2.conta(); try { resEstado.at = 0; out.reserva.ativo = await R2.ativa(); out.terc = { n: 0, bytes: 0, apagadas: 0, emUso: Date.now() < tercAte };
          if (out.reserva.ativo) for (const it of (await R2.indice(true)).values()) { const q = it.metadata?._ant ? out.terc : out.reserva; // _ant = está na terciária
            if (it.metadata?._del) q.apagadas++; else { q.n++; q.bytes += +it.metadata?.tam || 0; } }
          if (out.terc.n || out.terc.apagadas) out.terc.emUso = true; } catch { out.reserva.erro = true; } }
      return json(out, 200, { ...cors, 'cache-control': 'no-store' });
    }
    if (new URL(req.url).pathname === '/confere') return new URL(req.url).searchParams.get('adm') && !ehAdmin(env, login.email) ? json({ error: { type: 'adm' } }, 403, cors) : json({ ok: true }, 200, { ...cors, 'cache-control': 'no-store' }); // a nuvem reserva confere se o login é da equipe (sem e-mail na resposta)
    // SEGURANÇA (não remover): quem é + chave do app criptografado — só com login do Firebase confirmado e e-mail liberado
    const p0 = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    // MÍDIA DA EQUIPE (KV "EQUIPE" da Cloudflare, grátis: 1 GB, até 25 MB por arquivo) — só com login liberado
    if (p0 === '/equipe' || p0 === '/equipe/arquivo') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      if (!env.EQUIPE) return json({ error: { type: 'sem_kv', message: 'Falta o KV da equipe (binding EQUIPE) no worker.' } }, 501, cors);
      const q = new URL(req.url).searchParams, LIM = (+env.EQUIPE_LIMITE_MB || (env._d1 ? 480 : 1024)) * 1048576;
      const listar = async (prefix) => { const out = []; let cur; do { const r = await env.EQUIPE.list({ prefix, cursor: cur }); for (const k of r.keys) out.push(await semEmail({ k: k.name, ...(k.metadata || {}) })); cur = r.list_complete ? null : r.cursor; } while (cur); return out; };
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
        if (buf.byteLength > 25 * 1048576) return json({ error: { message: 'Arquivo maior que 25 MB (limite da nuvem).' } }, 413, cors);
        const usado = (await listar('')).reduce((s, x) => s + (+x.tam || 0), 0); if (usado + buf.byteLength > LIM) return json({ error: { message: 'O espaço da equipe está cheio.' } }, 507, cors);
        const k = `${pasta}/${Date.now()}_${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '_').slice(-80)}`;
        await env.EQUIPE.put(k, buf, { metadata: { nome, tipo, tam: buf.byteLength, por: login.email, em: new Date().toISOString() } });
        return json({ ok: true, k }, 200, cors);
      }
    }
    // PERSONAGENS do Animador (KV EQUIPE, prefixo "personagens/"): cada personagem é uma pasta com personagem.json + imagens.
    // Toda a equipe liberada lê e salva (é a biblioteca comum); só com login.
    //   GET    /personagens                     → lista { itens: [{ k, tam, tipo, por, em }] } (todas as chaves da pasta)
    //   GET    /personagens/arquivo?k=…         → o arquivo
    //   PUT    /personagens/arquivo?k=…         → salva (corpo = arquivo; até 10 MB)
    //   DELETE /personagens/arquivo?k=…         → apaga  (k terminado em "/" apaga a pasta do personagem inteira)
    // ADM convertendo para WEBP (?de=<chave antiga>): o arquivo novo continua com quem enviou e quando (não vira do ADM)
    const metaDe = async (de) => { if (!de || !ehAdmin(env, login.email) || de.length > 300) return null; try { const o = await env.EQUIPE.getWithMetadata(de, { type: 'stream' }); try { await o.value?.cancel(); } catch { } return o.metadata || null; } catch { return null; } };
    if (p0 === '/personagens' || p0 === '/personagens/arquivo') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      if (!env.EQUIPE) return json({ error: { type: 'sem_kv', message: 'Falta o KV da equipe (binding EQUIPE) no worker.' } }, 501, cors);
      const q = new URL(req.url).searchParams, k = q.get('k') || '';
      // personagens/pastas.json = as PASTAS da biblioteca do Animador (quais existem e em qual está cada personagem); toda a equipe pode mudar
      const KP = /^personagens\/(pastas\.json|[a-z0-9][a-z0-9-]{1,40}\/(personagem\.json|img\/[a-z0-9][a-z0-9-]{1,60}\.(png|webp|gif|jpg|jpeg|svg)))$/;
      const KD = /^personagens\/[a-z0-9][a-z0-9-]{1,40}\/$/;
      const listar = async (prefix) => { const out = []; let cur; do { const r = await env.EQUIPE.list({ prefix, cursor: cur }); for (const x of r.keys) out.push(await semEmail({ k: x.name, ...(x.metadata || {}) })); cur = r.list_complete ? null : r.cursor; } while (cur); return out; };
      if (p0 === '/personagens') { if (req.method !== 'GET') return json({ error: { message: 'Use GET.' } }, 405, cors); return json({ itens: await listar('personagens/') }, 200, { ...cors, 'cache-control': 'no-store' }); }
      if (req.method === 'GET') {
        if (!KP.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors);
        const r = await env.EQUIPE.getWithMetadata(k, { type: 'stream' }); if (!r.value) return json({ error: { message: 'Arquivo não encontrado' } }, 404, cors);
        return new Response(r.value, { status: 200, headers: { ...cors, 'content-type': r.metadata?.tipo || 'application/octet-stream', 'cache-control': k.endsWith('.json') ? 'no-store' : 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', ...(k.endsWith('.svg') ? { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}) } });
      }
      if (req.method === 'PUT' || req.method === 'POST') {
        if (!KP.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors);
        const tipo = k.endsWith('.json') ? 'application/json' : { png: 'image/png', webp: 'image/webp', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' }[k.split('.').pop()];
        const buf = await req.arrayBuffer(); if (!buf.byteLength) return json({ error: { message: 'Arquivo vazio' } }, 400, cors);
        if (buf.byteLength > 10 * 1048576) return json({ error: { message: 'Arquivo maior que 10 MB.' } }, 413, cors);
        if (!k.endsWith('.json') && (await usadoEquipe(env, buf.byteLength)) + buf.byteLength > limiteEquipe(env)) return json({ error: { message: 'O espaço da equipe está cheio.' } }, 507, cors);
        const m0 = await metaDe(q.get('de'));
        await env.EQUIPE.put(k, buf, { metadata: { tipo, ...(k.endsWith('.json') && q.get('nome') ? { nome: String(q.get('nome')).slice(0, 80) } : {}), tam: buf.byteLength, mod: Date.now(), por: m0?.por || login.email, em: m0?.em || new Date().toISOString() } });
        return json({ ok: true, k }, 200, cors);
      }
      if (req.method === 'DELETE') {
        // APAGAR DA NUVEM: só ADM (decisão do dono). Quem não é ADM só pode tirar imagens que o personagem salvo já não usa
        // (é a limpeza automática do "Salvar na nuvem"); apagar o personagem inteiro, peça a um ADM.
        const adm = ehAdmin(env, login.email), semAdm = () => json({ error: { type: 'adm', message: 'Só um ADM pode apagar da nuvem. Peça para um ADM apagar.' } }, 403, cors);
        if (KD.test(k)) { if (!adm) return semAdm(); let todos = []; try { todos = await listar(k); } catch (e) { if (!emLimite()) throw e; } const ks = todos.map(x => x.k);
          // no limite a lista pode vir só com o que está na reserva: as imagens que o personagem.json cita também entram (viram "apagada" e saem da principal às 21h)
          if (emLimite()) { ks.push(k + 'personagem.json'); try { const t = await env.EQUIPE.get(k + 'personagem.json'); if (t) for (const m of String(t).matchAll(/personagens\/[a-z0-9-]+\/(?:img|aud)\/[^"\\]+/g)) if (m[0].startsWith(k)) ks.push(m[0]); } catch { } }
          if (env.EQUIPE.deleteMuitos) await env.EQUIPE.deleteMuitos([...new Set(ks)], k); else for (const x of todos) await env.EQUIPE.delete(x.k); return json({ ok: true, apagados: todos.length }, 200, cors); }
        if (!KP.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors);
        if (!adm) {
          if (k.endsWith('personagem.json')) return semAdm();
          const def = await env.EQUIPE.get(k.replace(/\/img\/.*$/, '/personagem.json'), { type: 'json' }).catch(() => null);
          if (def && JSON.stringify(def).includes(k)) return semAdm(); // a imagem ainda é usada pelo personagem
        }
        await env.EQUIPE.delete(k); return json({ ok: true }, 200, cors);
      }
      return json({ error: { message: 'Método não aceito.' } }, 405, cors);
    }
    // ACESSO (tela ADM › Acesso, pelo porteiro): ver, adicionar e tirar e-mails liberados.
    // SEGURANÇA (não remover): só os e-mails da variável ADMINS (precisa existir); a base EMAILS_PERMITIDOS não muda por aqui.
    if (p0 === '/acesso') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      if (!env.EQUIPE) return json({ error: { type: 'sem_kv', message: 'Falta o KV da equipe (binding EQUIPE) no worker.' } }, 501, cors);
      const admins = (env.ADMINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean), eu = String(login.email).toLowerCase();
      if (!admins.length) return json({ error: { type: 'adm', message: 'Para gerenciar o acesso, coloque o seu e-mail na variável ADMINS do servidor turma-ia, na Cloudflare.' } }, 403, cors);
      if (!admins.includes(eu)) return json({ error: { type: 'adm', message: 'Esta conta não pode gerenciar o acesso (variável ADMINS na Cloudflare).' } }, 403, cors);
      const base = baseFixa(env);
      if (req.method === 'GET') return json({ base, extras: await extrasAcesso(env), admins }, 200, { ...cors, 'cache-control': 'no-store' });
      if (req.method !== 'POST') return json({ error: { message: 'Use GET ou POST.' } }, 405, cors);
      let b = {}; try { b = await req.json(); } catch { }
      const alvo = String(b.email || '').trim().toLowerCase();
      if (!EMAIL_OK.test(alvo)) return json({ error: { message: 'Escreva um e-mail válido (ex.: nome@gmail.com).' } }, 400, cors);
      const ex = (await extrasAcesso(env)).filter(x => x.email !== alvo);
      if (b.acao === 'add') {
        if (base.includes(alvo)) return json({ error: { message: 'Esse e-mail já está liberado (lista fixa da Cloudflare).' } }, 400, cors);
        if (ex.length >= 300) return json({ error: { message: 'Limite de 300 e-mails adicionados pela tela.' } }, 400, cors);
        ex.push({ email: alvo, por: eu, em: new Date().toISOString() });
      } else if (b.acao === 'del') {
        if (base.includes(alvo)) return json({ error: { message: 'Esse e-mail está na lista fixa (EMAILS_PERMITIDOS) e só sai pela Cloudflare.' } }, 400, cors);
        if (alvo === eu) return json({ error: { message: 'Você não pode tirar o seu próprio acesso por aqui.' } }, 400, cors);
      } else return json({ error: { message: 'Ação inválida.' } }, 400, cors);
      await env.EQUIPE.put('acesso/extras', JSON.stringify(ex));
      if (b.acao === 'del') ctx.waitUntil(aoVivoLimpa(env, true)); // quem saiu da lista sai também do "Trabalhar junto"
      return json({ ok: true, base, extras: ex, admins }, 200, cors);
    }
    // IDEIAS (aba Ideias do Animador): análise dos canais do YouTube + ideias da IA, para toda a equipe.
    //   GET  /ideias                         → { analise, ideias, canais } (analise = Action "Analisar canais" do repo estudio-problems)
    //   POST /ideias { acao:'atualizar', canais:['@x'] } → guarda os canais (se mudaram) e roda a Action já (máx. 1 vez a cada 2 min)
    //   PUT  /ideias { ideias }               → guarda as ideias que a IA gerou no navegador (uma gravação)
    if (p0 === '/ideias') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      if (!env.EQUIPE) return json({ error: { type: 'sem_kv', message: 'Falta o KV da equipe (binding EQUIPE) no worker.' } }, 501, cors);
      const le = async k => { try { return JSON.parse((await env.EQUIPE.get(k)) || 'null'); } catch { return null; } };
      const grava = (k, v) => { const t = JSON.stringify(v); return env.EQUIPE.put(k, t, { metadata: { tipo: 'application/json', tam: t.length, mod: Date.now(), em: new Date().toISOString() } }); };
      if (req.method === 'GET') { const [analise, ideias, canais] = await Promise.all([le('ideias/analise.json'), le('ideias/ideias.json'), le('ideias/canais.json')]); return json({ analise, ideias, canais: canais?.canais || null }, 200, { ...cors, 'cache-control': 'no-store' }); }
      let b; try { b = await req.json(); } catch { return json({ error: { message: 'Pedido inválido' } }, 400, cors); }
      if (req.method === 'POST' && b?.acao === 'atualizar') {
        if (Array.isArray(b.canais)) { const c = [...new Set(b.canais.map(x => String(x || '').trim()).map(x => x.startsWith('@') ? x : '@' + x).filter(x => /^@[\w.\-]{3,40}$/.test(x)))].slice(0, 8);
          if (!c.length) return json({ error: { message: 'Ponha pelo menos um canal (@nome).' } }, 400, cors);
          const ant = await le('ideias/canais.json'); if (JSON.stringify(ant?.canais || []) !== JSON.stringify(c)) await grava('ideias/canais.json', { canais: c }); }
        const R4 = reservaDe(env, auth0); if (!R4) return json({ error: { message: 'O servidor não está ligado ao robô que analisa os canais.' } }, 503, cors);
        const r = await R4.ideias(); return json(r?.erro ? { error: { message: 'Não consegui pedir a análise: ' + r.erro } } : { ok: true, ja: !!r?.ja }, r?.erro ? 502 : 200, cors);
      }
      if (req.method === 'PUT' && b?.ideias && typeof b.ideias === 'object') {
        const t = JSON.stringify(b.ideias); if (t.length > 600000) return json({ error: { message: 'Ideias grandes demais.' } }, 413, cors);
        await grava('ideias/ideias.json', b.ideias); return json({ ok: true }, 200, cors);
      }
      return json({ error: { message: 'Pedido inválido' } }, 400, cors);
    }
    // GOSTO APRENDIDO da edição (legendas, decupagem…): o que o dono corrigiu vira regra para os próximos vídeos, para a equipe toda.
    //   GET /gosto?de=animador → { gosto } · PUT /gosto?de=animador { gosto } (uma gravação, só quando o dono aprova uma etapa)
    //   Cada programa tem o seu (decisão do dono, 26/10/2026: o 2D do Animador NÃO mistura com o Minecraft do Shorts).
    if (p0 === '/gosto') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      if (!env.EQUIPE) return json({ error: { type: 'sem_kv', message: 'Falta o KV da equipe (binding EQUIPE) no worker.' } }, 501, cors);
      const de = String(new URL(req.url).searchParams.get('de') || ''); if (!/^[a-z0-9-]{2,30}$/.test(de)) return json({ error: { message: 'Programa inválido.' } }, 400, cors);
      const k = 'gosto/' + de + '.json';
      if (req.method === 'GET') { let g = null; try { g = JSON.parse((await env.EQUIPE.get(k)) || 'null'); } catch { } return json({ gosto: g }, 200, { ...cors, 'cache-control': 'no-store' }); }
      if (req.method === 'PUT') { let b; try { b = await req.json(); } catch { return json({ error: { message: 'Pedido inválido' } }, 400, cors); }
        if (!b?.gosto || typeof b.gosto !== 'object') return json({ error: { message: 'Pedido inválido' } }, 400, cors);
        const t = JSON.stringify(b.gosto); if (t.length > 200000) return json({ error: { message: 'Gosto grande demais.' } }, 413, cors);
        await env.EQUIPE.put(k, t, { metadata: { tipo: 'application/json', tam: t.length, mod: Date.now(), em: new Date().toISOString() } }); return json({ ok: true }, 200, cors); }
      return json({ error: { message: 'Pedido inválido' } }, 400, cors);
    }
    // CENÁRIOS da equipe (KV EQUIPE, prefixo "cenarios/"): só entram quando alguém escolhe "Salvar na nuvem" no Animador.
    //   GET /cenarios → lista · GET/POST/DELETE /cenarios/arquivo?k=cenarios/<id>.<ext>[&nome=…]
    // ANIMAÇÕES do Animador na nuvem da equipe (decisão do dono, 30/10/2026): cada animação é uma pasta "animacoes/<id>/" com
    // projeto.json (o projeto sem a miniatura), thumb.jpg e arq/<chave> (imagens e áudios que só existem nela; as dos personagens
    // da equipe ficam em personagens/). Toda a equipe lê e salva; apagar a animação inteira só ADM.
    //   GET    /animacoes                → { itens: [{ id, nome, mod, por, em, tam }] }
    //   GET    /animacoes/arquivo?k=…    → o arquivo · PUT/POST → salva (até 25 MB) · DELETE → apaga (pasta inteira = só ADM)
    // JESTER DREAMS (programa de TESTE, decisão do dono, 31/10/2026): mesmas regras das animações, na pasta "jester/<id>/"
    //   (GET /jester, /jester/arquivo?k=jester/<id>/projeto.json …) — separado das animações do Animador.
    if (p0 === '/animacoes' || p0 === '/animacoes/arquivo' || p0 === '/jester' || p0 === '/jester/arquivo') {
      const BA = p0.startsWith('/jester') ? 'jester' : 'animacoes';
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      if (!env.EQUIPE) return json({ error: { type: 'sem_kv', message: 'Falta o KV da equipe (binding EQUIPE) no worker.' } }, 501, cors);
      const q = new URL(req.url).searchParams, k = q.get('k') || '';
      const KA = new RegExp('^' + BA + '\\/(pastas\\.json|[A-Za-z0-9_-]{2,40}\\/(projeto\\.json|thumb\\.jpg|arq\\/[A-Za-z0-9._~%-]{1,300}))$'), /* pastas.json = pastas das animações da nuvem (toda a equipe muda) */ KAD = new RegExp('^' + BA + '\\/[A-Za-z0-9_-]{2,40}\\/$');
      const listar = async (prefix) => { const out = []; let cur; do { const r = await env.EQUIPE.list({ prefix, cursor: cur }); for (const x of r.keys) out.push({ k: x.name, ...(x.metadata || {}) }); cur = r.list_complete ? null : r.cursor; } while (cur); return out; };
      if (p0 === '/' + BA) { if (req.method !== 'GET') return json({ error: { message: 'Use GET.' } }, 405, cors);
        const so = q.get('id') || ''; if (so) { if (!/^[A-Za-z0-9_-]{2,40}$/.test(so)) return json({ error: { message: 'Animação inválida' } }, 400, cors); return json({ itens: (await listar(BA + '/' + so + '/')).map(x => ({ k: x.k, tam: x.tam || 0, mod: x.mod || 0 })) }, 200, { ...cors, 'cache-control': 'no-store' }); }
        const todos = await listar(BA + '/'), tam = {}, out = [];
        for (const x of todos) { const id = x.k.split('/')[1]; tam[id] = (tam[id] || 0) + (+x.tam || 0); }
        for (const x of todos) { const m = x.k.match(new RegExp('^' + BA + '\\/([^/]+)\\/projeto\\.json$')); if (m) out.push(await semEmail({ id: m[1], nome: x.nome || '', mod: x.mod || 0, por: x.por, em: x.em, tam: tam[m[1]] || 0, quem: x.quem || null })); } /* quem = quem criou/editou (códigos u…, nomes; foto vem do /pessoa) */
        return json({ itens: out }, 200, { ...cors, 'cache-control': 'no-store' }); }
      if (req.method === 'GET') {
        if (!KA.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors);
        const r = await env.EQUIPE.getWithMetadata(k, { type: 'stream' }); if (!r.value) return json({ error: { message: 'Arquivo não encontrado' } }, 404, cors);
        return new Response(r.value, { status: 200, headers: { ...cors, 'content-type': k.endsWith('.json') ? 'application/json' : 'application/octet-stream', 'cache-control': /\/arq\//.test(k) ? 'private, max-age=31536000, immutable' : 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
      }
      if (req.method === 'PUT' || req.method === 'POST') {
        if (!KA.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors);
        const buf = await req.arrayBuffer(); if (!buf.byteLength) return json({ error: { message: 'Arquivo vazio' } }, 400, cors);
        if (buf.byteLength > 25 * 1048576) return json({ error: { message: 'Arquivo maior que 25 MB.' } }, 413, cors);
        if (!k.endsWith('.json') && (await usadoEquipe(env, buf.byteLength)) + buf.byteLength > limiteEquipe(env)) return json({ error: { message: 'O espaço da equipe está cheio.' } }, 507, cors);
        const ant = k.endsWith('projeto.json') ? await env.EQUIPE.getWithMetadata(k, { type: 'stream' }).then(async o => { try { await o.value?.cancel(); } catch { } return o.metadata; }).catch(() => null) : null;
        let quem = null; try { const o = JSON.parse(q.get('quem') || 'null'); const P = x => x && /^u[0-9a-f]{16}$/.test(x.i) ? { i: x.i, n: String(x.n || '').replace(/[<>]/g, '').slice(0, 40), t: +x.t || 0 } : null; if (o) quem = { a: P(o.a), e: (Array.isArray(o.e) ? o.e : []).map(P).filter(Boolean).slice(-6) }; } catch { }
        await env.EQUIPE.put(k, buf, { metadata: { tam: buf.byteLength, mod: Date.now(), ...(q.get('nome') ? { nome: String(q.get('nome')).slice(0, 80) } : {}), ...(quem ? { quem } : ant?.quem ? { quem: ant.quem } : {}), por: ant?.por || login.email, em: ant?.em || new Date().toISOString() } });
        return json({ ok: true, k }, 200, cors);
      }
      if (req.method === 'DELETE') {
        // REMOVER DA NUVEM (decisão do dono, 30/10/2026): quem mandou a animação para a nuvem ou um ADM
        if (KAD.test(k)) { const dono = await env.EQUIPE.getWithMetadata(k + 'projeto.json', { type: 'stream' }).then(async o => { try { await o.value?.cancel(); } catch { } return o.metadata?.por || ''; }).catch(() => '');
          if (!ehAdmin(env, login.email) && String(dono).toLowerCase() !== String(login.email).toLowerCase()) return json({ error: { type: 'adm', message: 'Só quem mandou esta animação para a nuvem (ou um ADM) pode tirar ela de lá.' } }, 403, cors);
          const ks = (await listar(k)).map(x => x.k); if (env.EQUIPE.deleteMuitos) await env.EQUIPE.deleteMuitos(ks, k); else for (const x of ks) await env.EQUIPE.delete(x); return json({ ok: true, apagados: ks.length }, 200, cors); }
        if (!KA.test(k) || !/\/arq\//.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors); // arquivos que a animação já não usa: qualquer um da equipe (limpeza do envio)
        await env.EQUIPE.delete(k); return json({ ok: true }, 200, cors);
      }
      return json({ error: { message: 'Pedido desconhecido.' } }, 405, cors);
    }
    if (p0 === '/cenarios' || p0 === '/cenarios/arquivo') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      if (!env.EQUIPE) return json({ error: { type: 'sem_kv', message: 'Falta o KV da equipe (binding EQUIPE) no worker.' } }, 501, cors);
      const q = new URL(req.url).searchParams, k = q.get('k') || '', KC = /^cenarios\/[a-z0-9][a-z0-9-]{1,60}\.(png|webp|jpg|jpeg)$/;
      if (p0 === '/cenarios') { const out = []; let cur; do { const r = await env.EQUIPE.list({ prefix: 'cenarios/', cursor: cur }); for (const x of r.keys) out.push(await semEmail({ k: x.name, ...(x.metadata || {}) })); cur = r.list_complete ? null : r.cursor; } while (cur); return json({ itens: out }, 200, { ...cors, 'cache-control': 'no-store' }); }
      if (!KC.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors);
      if (req.method === 'GET') {
        const r = await env.EQUIPE.getWithMetadata(k, { type: 'stream' }); if (!r.value) return json({ error: { message: 'Arquivo não encontrado' } }, 404, cors);
        return new Response(r.value, { status: 200, headers: { ...cors, 'content-type': r.metadata?.tipo || 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        const tipo = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[k.split('.').pop()], nome = String(q.get('nome') || 'Cenário').slice(0, 80), ia = q.get('ia') === '1';
        const buf = await req.arrayBuffer(); if (!buf.byteLength) return json({ error: { message: 'Arquivo vazio' } }, 400, cors);
        if (buf.byteLength > 10 * 1048576) return json({ error: { message: 'Arquivo maior que 10 MB.' } }, 413, cors);
        if ((await usadoEquipe(env, buf.byteLength)) + buf.byteLength > limiteEquipe(env)) return json({ error: { message: 'O espaço da equipe está cheio.' } }, 507, cors);
        const m0 = await metaDe(q.get('de'));
        await env.EQUIPE.put(k, buf, { metadata: { nome: m0?.nome || nome, tipo, ia: m0 ? !!m0.ia : ia, tam: buf.byteLength, por: m0?.por || login.email, em: m0?.em || new Date().toISOString() } });
        return json({ ok: true, k }, 200, cors);
      }
      if (req.method === 'DELETE') { if (!ehAdmin(env, login.email)) return json({ error: { type: 'adm', message: 'Só um ADM pode apagar da nuvem. Peça para um ADM apagar.' } }, 403, cors); await env.EQUIPE.delete(k); return json({ ok: true }, 200, cors); } // apagar da nuvem: só ADM
      return json({ error: { message: 'Método não aceito.' } }, 405, cors);
    }
    // USO DA NUVEM (tela ADM › Nuvem e o círculo da nuvem nos programas, pelo porteiro): tudo o que está no KV da equipe e o limite. Ver: conta liberada; apagar: só ADMINS.
    // ADM › Nuvem: abrir/baixar um item da nuvem da equipe (para ouvir, ver ou baixar no computador)
    if (p0 === '/nuvem-uso/arq' && req.method === 'GET') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      if (!ehAdmin(env, login.email)) return json({ error: { type: 'adm', message: 'Só quem é ADM abre os arquivos da nuvem.' } }, 403, cors);
      if (!env.EQUIPE) return json({ error: { type: 'sem_kv', message: 'Falta o KV da equipe (binding EQUIPE) no worker.' } }, 501, cors);
      const k = new URL(req.url).searchParams.get('k') || '';
      if (!k || k.length > 300 || k.includes('..') || k.endsWith('/')) return json({ error: { message: 'Arquivo inválido.' } }, 400, cors);
      const r = await env.EQUIPE.getWithMetadata(k, { type: 'stream' }); if (!r.value) return json({ error: { message: 'Arquivo não encontrado.' } }, 404, cors);
      // nosniff + CSP sandbox: nada guardado na nuvem roda como página
      return new Response(r.value, { status: 200, headers: { ...cors, 'content-type': r.metadata?.tipo || (/\.json$|\/(links|extras|.*\.json)$/.test(k) ? 'application/json' : 'application/octet-stream'), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox" } });
    }
    if (p0 === '/nuvem-uso') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      // VER o uso (o círculo da nuvem nos programas): qualquer conta liberada. APAGAR: só ADM.
      if (req.method !== 'GET' && !ehAdmin(env, login.email)) return json({ error: { type: 'adm', message: 'Só um ADM pode apagar da nuvem. Peça para um ADM apagar.' } }, 403, cors);
      if (!env.EQUIPE) return json({ error: { type: 'sem_kv', message: 'Falta o KV da equipe (binding EQUIPE) no worker.' } }, 501, cors);
      // ADM apaga itens da nuvem: chaves inteiras ou a pasta de um personagem ("personagens/<id>/"). A lista de acesso e os links do menu têm tela própria.
      if (req.method === 'POST') {
        let b = {}; try { b = await req.json(); } catch { }
        const PROT = ['acesso/extras', 'menu/links'], ks = (Array.isArray(b.apagar) ? b.apagar : []).map(String).slice(0, 500);
        if (!ks.length) return json({ error: { message: 'Nada para apagar.' } }, 400, cors);
        let n = 0; const vao = [];
        for (const k of ks) {
          if (PROT.includes(k) || k.length > 300 || !/^[\w\-./ ]+$/.test(k) || k.includes('..')) continue;
          if (/^personagens\/[a-z0-9][a-z0-9-]{1,40}\/$/.test(k)) { let c2; do { const r = await env.EQUIPE.list({ prefix: k, cursor: c2 }); for (const x of r.keys) vao.push(x.name); c2 = r.list_complete ? null : r.cursor; } while (c2); }
          if (k.endsWith('/')) continue;
          vao.push(k);
        }
        const unicos = [...new Set(vao)]; n = unicos.length; // todas de uma vez (poucos pedidos à reserva)
        if (env.EQUIPE.deleteMuitos) await env.EQUIPE.deleteMuitos(unicos); else for (const x of unicos) await env.EQUIPE.delete(x);
        usoEq = null; return json({ ok: true, apagados: n }, 200, cors);
      }
      const itens = []; let cur; do { const r = await env.EQUIPE.list({ cursor: cur }); for (const x of r.keys) itens.push({ k: x.name, ...(x.metadata || {}) }); cur = r.list_complete ? null : r.cursor; } while (cur);
      // chaves pequenas sem tamanho guardado (listas, configurações): mede de verdade
      for (const it of itens) if (!(+it.tam)) { try { const v = await env.EQUIPE.get(it.k, { type: 'arrayBuffer' }); it.tam = v ? v.byteLength : 0; it.medido = true; } catch { } }
      return json({ itens, limite: limiteEquipe(env) }, 200, { ...cors, 'cache-control': 'no-store' });
    }
    // MENU do Estúdio Problems (KV EQUIPE): links + fundos ("menu/links") e mídias dos fundos ("menu/midia/...").
    // Ler: conta liberada. Mudar (tela ADM): conta liberada E, se a variável ADMINS existir, só os e-mails dela.
    if (p0 === '/menu-links' || p0 === '/menu-midia') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      if (!env.EQUIPE) return json({ error: { type: 'sem_kv', message: 'Falta o KV da equipe (binding EQUIPE) no worker.' } }, 501, cors);
      const adm = ehAdmin(env, login.email);
      const semAdm = () => json({ error: { type: 'adm', message: 'Esta conta não pode mudar o menu (variável ADMINS na Cloudflare).' } }, 403, cors);
      const q = new URL(req.url).searchParams, KM = /^menu\/midia\/[\w.\- ]{1,120}$/;
      if (p0 === '/menu-midia') {
        if (req.method === 'GET') {
          const k = q.get('k') || ''; if (!KM.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors);
          const r = await env.EQUIPE.getWithMetadata(k, { type: 'stream' }); if (!r.value) return json({ error: { message: 'Arquivo não encontrado' } }, 404, cors);
          // nosniff + CSP: um SVG enviado nunca roda script, nem se alguém abrir o arquivo direto
          return new Response(r.value, { status: 200, headers: { ...cors, 'content-type': r.metadata?.tipo || 'application/octet-stream', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox" } });
        }
        if (req.method === 'POST') {
          if (!adm) return semAdm();
          const tipo = String(q.get('tipo') || req.headers.get('content-type') || '').slice(0, 80), nome = String(q.get('nome') || 'midia').slice(0, 120);
          if (!/^(image|video)\//.test(tipo)) return json({ error: { message: 'Só imagem, GIF ou vídeo.' } }, 400, cors);
          const buf = await req.arrayBuffer(); if (!buf.byteLength) return json({ error: { message: 'Arquivo vazio' } }, 400, cors);
          if (buf.byteLength > 25 * 1048576) return json({ error: { message: 'Arquivo maior que 25 MB (limite da nuvem). Para vídeos grandes, use "colar link".' } }, 413, cors);
          let usado = 0, cur; do { const r = await env.EQUIPE.list({ cursor: cur }); for (const k of r.keys) usado += +(k.metadata?.tam) || 0; cur = r.list_complete ? null : r.cursor; } while (cur);
          if (usado + buf.byteLength > (+env.EQUIPE_LIMITE_MB || (env._d1 ? 480 : 1024)) * 1048576) return json({ error: { message: 'O espaço da equipe está cheio.' } }, 507, cors);
          const k = `menu/midia/${Date.now()}_${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '_').slice(-80)}`;
          await env.EQUIPE.put(k, buf, { metadata: { nome, tipo, tam: buf.byteLength, por: login.email, em: new Date().toISOString() } });
          return json({ ok: true, k }, 200, cors);
        }
        return json({ error: { message: 'Método não aceito' } }, 405, cors);
      }
      if (req.method === 'GET') { const v = await env.EQUIPE.get('menu/links', { type: 'json' }); return json({ links: v?.links || null, fundo: v?.fundo || null, mensagens: v?.mensagens || null, por: (await semEmail({ por: v?.por || null })).por, em: v?.em || null, adm }, 200, { ...cors, 'cache-control': 'no-store' }); }
      if (req.method === 'PUT' || req.method === 'POST') {
        if (!adm) return semAdm();
        let b; try { b = await req.json(); } catch { return json({ error: { message: 'Pedido inválido' } }, 400, cors); }
        const ICS = ['shorts', 'editar', 'animar', 'modelar', 'link', 'jogo', 'musica', 'imagem'], txt = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
        const num = (v, a, z, d) => { v = +v; return Number.isFinite(v) ? Math.min(z, Math.max(a, v)) : d; };
        const okUrl = u => /^https?:\/\/[^\s"'<>]+$/i.test(u) || /^(?![a-z][\w+.-]*:|\/\/)[^\s"'<>]+$/i.test(u);
        const midia = m => { if (!m || typeof m !== 'object') return null; const src = txt(m.src, 500); if (!src || !(src.startsWith('kv:') ? KM.test(src.slice(3)) : /^https:\/\/[^\s"'<>]+$/i.test(src))) return null;
          return { tipo: m.tipo === 'video' ? 'video' : 'imagem', src, x: num(m.x, 0, 100, 50), y: num(m.y, 0, 100, 50), zoom: num(m.zoom, 1, 4, 1), blur: num(m.blur, 0, 30, 0) }; };
        if (!Array.isArray(b.links) || b.links.length > 24) return json({ error: { message: 'Lista de links inválida (máximo 24).' } }, 400, cors);
        const links = [];
        for (const l of b.links) {
          const nome = txt(l?.nome, 40), url = txt(l?.url, 500);
          if (!nome) return json({ error: { message: 'Todo link precisa de um nome.' } }, 400, cors);
          if (url && !okUrl(url)) return json({ error: { message: `Endereço inválido em "${nome}". Use https://...` } }, 400, cors);
          links.push({ nome, desc: txt(l?.desc, 80), url: url || null, icone: ICS.includes(l?.icone) ? l.icone : 'link', embreve: !!l?.embreve, modo: ['sempre', 'blur', 'blurHover', 'hover'].includes(l?.modo) ? l.modo : 'sempre', iconeImg: (m => m && { src: m.src })(midia(l?.iconeImg)), iconeTam: num(l?.iconeTam, 30, 100, 62), iconeCaixa: l?.iconeCaixa !== false, fundo: midia(l?.fundo), escurecer: num(l?.escurecer, 0, .9, .45), ...(txt(l?.etiqueta, 20) ? { etiqueta: txt(l.etiqueta, 20) } : {}) }); // etiqueta: ex. "em testes" (Jester Dreams)
        }
        const f = b.fundo || {}, fundo = { modo: ['nenhum', 'um', 'slideshow', 'aleatorio'].includes(f.modo) ? f.modo : 'nenhum', intervalo: num(f.intervalo, 2, 120, 8), escurecer: num(f.escurecer, 0, .9, .55), itens: (Array.isArray(f.itens) ? f.itens : []).slice(0, 20).map(midia).filter(Boolean) };
        const mg = b.mensagens || {}, mensagens = { boasVindas: txt(mg.boasVindas, 160), intervalo: num(mg.intervalo, 3, 60, 7),
          frases: (Array.isArray(mg.frases) ? mg.frases : []).map(x => txt(x, 140)).filter(Boolean).slice(0, 40) };
        const v = { links, fundo, mensagens, por: login.email, em: new Date().toISOString() };
        await env.EQUIPE.put('menu/links', JSON.stringify(v));
        // apaga as mídias do menu que ninguém usa mais
        const usadas = new Set([...links.map(l => l.fundo?.src), ...links.map(l => l.iconeImg?.src), ...fundo.itens.map(m => m.src)].filter(s => s?.startsWith('kv:')).map(s => s.slice(3)));
        let cur; do { const r = await env.EQUIPE.list({ prefix: 'menu/midia/', cursor: cur }); for (const k of r.keys) if (!usadas.has(k.name)) await env.EQUIPE.delete(k.name); cur = r.list_complete ? null : r.cursor; } while (cur);
        return json({ ok: true, ...v }, 200, cors);
      }
      return json({ error: { message: 'Método não aceito' } }, 405, cors);
    }
    if (p0 === '/quem' || p0 === '/app-key') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'O login com Google ainda não foi ligado no servidor (falta FIREBASE_PROJECT_ID).' } }, 403, cors);
      if (p0 === '/quem') {
        // ?aovivo=1: o site pede para liberar a conta no tempo real AGORA e quer saber se deu (ou o motivo)
        if (new URL(req.url).searchParams.get('aovivo')) { const aovivo = await aoVivoMarca(env, login.uid, login.email, true); return json({ email: login.email, adm: ehAdmin(env, login.email), aovivo }, 200, { ...cors, 'cache-control': 'no-store' }); }
        ctx.waitUntil(aoVivoMarca(env, login.uid, login.email).then(() => aoVivoLimpa(env)));
        return json({ email: login.email, adm: ehAdmin(env, login.email) }, 200, { ...cors, 'cache-control': 'no-store' });
      }
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
