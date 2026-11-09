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
     FIREBASE_PROJECT_ID (Text) estudio-problems-login — liga o login com Google: sem login, nada funciona (nem abrir o editor)
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
/* QUEM PODE ENTRAR COM O BANCO FORA (09/11/2026): com o D1 no limite, ler a lista falhava e devolvia lista VAZIA: todo mundo fora da lista fixa
   ficava sem entrar. E havia um ciclo: a reserva confere o login em /confere, que não pode usar a reserva (ela perguntaria de novo a /confere).
   Agora, se o banco não responder, a lista vem direto da reserva com a senha dos robôs (o que foi salvo na reserva e, sem isso, a cópia de
   segurança); guardada 60 s na memória. Sem nenhuma resposta, usa a última lista boa. Nunca vira lista vazia por causa de uma falha. */
let extrasBom = null, extrasEm = 0;
const soExtras = v => v.filter(x => x && typeof x.email === 'string');
async function extrasDaReserva(env) {
  if (!env.ROBO) return null; const base = (env.RESERVA_URL || RESERVA_URL).replace(/\/+$/, '');
  for (const p of ['/reserva/arq?k=', '/reserva/bk?k=']) { try { const r = await fetch(base + p + encodeURIComponent('acesso/extras'), { headers: { 'x-senha': env.ROBO } }); if (!r.ok) continue; const j = JSON.parse(await r.text()); if (Array.isArray(j)) return soExtras(j); } catch { } }
  return null;
}
async function extrasAcesso(env) {
  if (extrasBom && emLimite() && Date.now() - extrasEm < 60e3) return extrasBom;
  try { const v = await env.EQUIPE?.get('acesso/extras', { type: 'json', cacheTtl: 60 }); if (Array.isArray(v)) { extrasBom = soExtras(v); extrasEm = Date.now(); return extrasBom; } if (v == null && !emLimite()) return []; } catch { }
  const r = await extrasDaReserva(env); if (r) { extrasBom = r; extrasEm = Date.now(); return r; }
  return extrasBom || [];
}
// espaço da equipe (KV grátis da Cloudflare: 1 GB por conta; EQUIPE_LIMITE_MB muda o limite)
const limiteEquipe = env => (+env.EQUIPE_LIMITE_MB || (PRINCIPAL_PAGA ? 5120 /* plano pago: 5 GB (09/11/2026) */ : env._d1 ? 480 + (d1Est.arq ? ARQUIVOS_MB : 0) : 1024)) * 1048576; // com a nuvem dos arquivos: a principal + os bancos de lá
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
    return { ok: true, email: pay.email, uid: String(pay.user_id || pay.sub || ''), nome: String(pay.name || '').slice(0, 80) };
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
   tudo do KV e conferir). Arquivo maior que 1,9 MB vai em pedaços (tabela parte), um pedaço por consulta.
   NUVEM DOS ARQUIVOS (decisão do dono, 03/11/2026): o D1 da principal aguenta muitos pedidos mas só tem ~480 MB. Com a marca
   'arquivos' ligada (Action "Nuvem dos arquivos" do repo estudio-problems), o CONTEÚDO de arquivo a partir de 32 KB vai para o
   Worker arquivos-problems (3ª conta, bancos D1 só para guardar); aqui fica a linha (nome, metadata, tamanho) com onde = 'a', e
   listas, JSONs pequenos, gravações e leituras continuam passando por aqui. Ler de lá que falhar cai na CÓPIA DE SEGURANÇA da
   reserva (ler em kvComLista), que é a reserva de leitura. */
/* LISTA SÓ COM O QUE MUDOU (decisão do dono, 03/11/2026, depois de estourar as 5 milhões de leituras do dia): cada parte do
   servidor carregava a tabela inteira (~10 mil linhas) de 5 em 5 min. Agora carrega inteira só na 1ª vez (e de 6 em 6 h) e depois,
   de 30 em 30 s, só as linhas gravadas desde a última vez (índice arq_em) e as apagadas (tabela apagados, guarda 3 dias). */
const CH_D1 = 1900000, d1Est = { at: 0, on: false, arq: false, prep: false, poda: 0 }, ARQ_MIN = 32 * 1024, ARQUIVOS_MB = 3290; // 7 bancos de ~470 MB (BANCOS no arquivos.yml)
const ARQUIVOS_URL = 'https://arquivos-problems.problemsraizz.workers.dev';
async function d1Ligado(env) {
  if (!env.EQUIPE_DB) return false; if (Date.now() - d1Est.at < 60e3) return d1Est.on;
  try { const { results } = await env.EQUIPE_DB.prepare("SELECT k, v FROM cfg WHERE k IN ('ativo', 'arquivos', 'casas')").all(); const v = Object.fromEntries((results || []).map(x => [x.k, x.v])); d1Est.on = v.ativo === '1'; d1Est.arq = v.arquivos === '1'; d1Est.casas = v.casas === '1';
    if (d1Est.on && !d1Est.prep) { const db = env.EQUIPE_DB; await db.batch([db.prepare('CREATE TABLE IF NOT EXISTS apagados (k TEXT PRIMARY KEY, em INTEGER NOT NULL)'), db.prepare('CREATE INDEX IF NOT EXISTS arq_em ON arq (em)'), db.prepare('CREATE INDEX IF NOT EXISTS apagados_em ON apagados (em)')]); d1Est.prep = true; } }
  catch (e) { // D1 no limite do dia (03/11/2026: antes caía no KV ANTIGO, com dados velhos): continua no D1 e o kvComLista passa para a reserva/cópia
    if (ehLimite(e)) { d1Est.on = true; d1Est.arq = true; limiteAte = fimDoDia(); } else if (!d1Est.at) d1Est.on = false; }
  d1Est.at = Date.now(); return d1Est.on;
}
// Worker da nuvem dos arquivos (senha dos robôs = segredo ROBO): grava/lê/apaga só o conteúdo, sem metadata nem e-mails
function arquivosDe(env, qual) {
  if (!env.ROBO || env.ARQUIVOS === 'nao') return null; const base = (qual === 't' ? env.ARQUIVOS_T_URL || ARQUIVOS_T_URL : env.ARQUIVOS_URL || ARQUIVOS_URL).replace(/\/+$/, '');
  const call = async (path, o = {}, ms = 20000) => { const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    // terciária: o turma-reserva mora na MESMA conta, então fala pela ligação direta ARQ_T (pelo endereço público a Cloudflare recusa)
    const f = qual === 't' && env.ARQ_T ? (u, x) => env.ARQ_T.fetch(u, x) : fetch;
    try { return await f(base + path, { ...o, headers: { 'x-senha': env.ROBO, ...(o.headers || {}) }, signal: ac.signal }); } finally { clearTimeout(t); } };
  const ok = async r => { if (!r.ok) { let j = null; try { j = await r.clone().json(); } catch { } throw new Error(j?.erro === 'cheio' ? 'ARQUIVOS_CHEIO' : 'a nuvem dos arquivos respondeu ' + r.status); } return r; };
  return {
    async grava(k, buf) { await ok(await call('/arq?k=' + encodeURIComponent(k), { method: 'PUT', body: buf }, 60000)); },
    async le(k) { const r = await ok(await call('/arq?k=' + encodeURIComponent(k))); return new Uint8Array(await r.arrayBuffer()); },
    async apaga(ks) { for (let i = 0; i < ks.length; i += 500) await ok(await call('/apaga', { method: 'POST', body: JSON.stringify({ k: ks.slice(i, i + 500) }), headers: { 'content-type': 'application/json' } }, 25000)); },
    estado: () => call('/estado').then(r => r.json()).catch(e => ({ erro: String(e?.message || e) })),
  };
}
const bytesDe = async v => v == null ? new Uint8Array(0) : typeof v === 'string' ? new TextEncoder().encode(v) : v instanceof ArrayBuffer ? new Uint8Array(v) : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : new Uint8Array(await new Response(v).arrayBuffer());
/* CADA ARQUIVO MORA NUMA NUVEM (decisão da dona, 06/11/2026: "espalhar os arquivos desde o começo").
   O ÍNDICE continua um só, pequeno, na tabela arq do D1 da principal (uma linha por arquivo: nome, metadata, tamanho, data e ONDE
   o conteúdo mora). A lista sai desse índice (e da foto dele no cache da Cloudflare, listaDoCache), então não vira gargalo.
   O CONTEÚDO mora em uma de três casas:  onde = null → D1 da principal (tabela parte) · 'a' → nuvem dos arquivos na conta
   "nova" (arquivos-problems, T3) · 't' → nuvem dos arquivos na conta terciária (mesmo Worker, T4).
   - Arquivo NOVO: a casa é escolhida pelo peso do que cada nuvem ainda tem LIVRE hoje (gravações, leituras, pedidos e espaço, da
     medida da Action "Uso da nuvem"), não sorteio puro: quem gastou mais recebe menos, quem está quase cheia não recebe.
     O próprio nome do arquivo decide dentro dos pesos (o mesmo nome cai na mesma casa enquanto os pesos não mudam).
   - Arquivo que JÁ EXISTE fica na casa dele ao ser regravado (só muda se a casa dele estiver quase cheia ou falhar).
   - NUNCA VERSÃO VELHA: o conteúdo novo é gravado PRIMEIRO na casa nova; só depois o índice passa a apontar para ela; e só depois
     disso o conteúdo da casa antiga é apagado (conferindo antes que o índice ainda aponta para a nova). Ler segue sempre o índice.
   - Ligar/desligar: /robo/casas?v=1|0 (cfg 'casas'). Desligado = como antes (≥ 32 KB na 'a', o resto na principal). */
const ARQUIVOS_T_URL = 'https://arquivos-problems.editorcustomizado.workers.dev';
const CASAS = { t: null, w: null, at: 0 }; // t = loja da terciária (montada junto com a 'a'); w = pesos { p, a, t } (de 2 em 2 min)
const lojaDe = (onde, A) => onde === 'a' ? A : onde === 't' ? CASAS.t : null;
// pesos pelo que cada nuvem tem livre (0 = não recebe nada novo). Sem medida: as três iguais.
function pesosCasas(c) {
  const L = c?.limites || {}, hoje = new Date().toISOString().slice(0, 10), W = L.d1Write || 1e5, R = L.d1Read || 5e6, P = L.workers || 1e5, B = L.d1Bytes || 524288000;
  if (!c || c.dia !== hoje) return { p: 1, a: 1, t: 1 };
  const livre = (o, pedidos, espaco) => { if (!o || o.erro || !o.d1) return 0;
    const us = [o.d1.write / W, o.d1.read / R]; if (pedidos) us.push((+o.workers || 0) / P); if (espaco) us.push((+(o.d1bytes ?? o.bytes) || 0) / B);
    // DIVIDIDO POR IGUAL (pedido da dona, 06/11/2026): escolher pela folga DO DIA não resolve (amanhã a mais vazia pode ser a mais
    // cheia). Agora cada arquivo novo vai para uma das 3 por sorteio fixo do nome (1/3 para cada, sempre a mesma casa para o mesmo
    // arquivo), e a folga do dia só serve de TRAVA: abaixo de 15% livre hoje, aquela nuvem não recebe novos até virar o dia.
    // A mudança noturna (Action arquivos, mudar-noite) iguala também os antigos.
    const sobra = 1 - Math.max(...us.map(x => +x || 0)); return sobra > 0.15 ? 1 : 0; };
  return { p: livre(c.contas?.principal, false, true), a: livre(c.contas?.nova, true, false), t: livre(c.contas?.terc, true, false) };
}
function escolheCasa(k, tam, ant, A) {
  if (PRINCIPAL_PAGA) return null; // plano pago: tudo novo fica na principal (09/11/2026)
  if (!d1Est.casas || !d1Est.arq) return A && d1Est.arq && tam >= ARQ_MIN ? 'a' : null; // desligado: como antes
  const w = { ...(CASAS.w || { p: 1, a: 1, t: 1 }) }; if (!A) w.a = 0; if (!CASAS.t) w.t = 0;
  if (ant) { const c0 = ant.onde || 'p'; if ((w[c0] || 0) > 0.01) return ant.onde || null; } // já mora numa casa com folga: fica lá
  const tot = w.p + w.a + w.t; if (!(tot > 0)) return ant ? ant.onde || null : (A && tam >= ARQ_MIN ? 'a' : null);
  let h = 2166136261; for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619); const x = (h >>> 0) / 4294967296 * tot;
  return x < w.p ? null : x < w.p + w.a ? 'a' : 't';
}
async function d1Grava(db, k, buf, meta, A) {
  const ant = d1Est.arq ? await db.prepare('SELECT * FROM arq WHERE k = ?').bind(k).first() : null;
  let casa = escolheCasa(k, buf.byteLength, ant, A), n = 0;
  if (casa) { // 1º o conteúdo na casa escolhida; se ela falhar (sem ser "cheio" de verdade), tenta a outra nuvem e por fim a principal
    const ordem = [casa, ...['a', 't'].filter(c => c !== casa && lojaDe(c, A) && d1Est.casas && (CASAS.w?.[c] ?? 1) > 0.01)]; let erro = null; casa = undefined;
    for (const c of ordem) { try { await lojaDe(c, A).grava(k, buf); casa = c; break; } catch (e) { erro = erro || e; console.log('casa ' + c + ' falhou:', String(e?.message || e).slice(0, 100)); } }
    if (casa === undefined) { if (!d1Est.casas) throw erro; casa = null; } }
  const em = Date.now(), linhaArq = d1Est.arq
    ? db.prepare('INSERT OR REPLACE INTO arq (k, meta, n, tam, em, onde) VALUES (?, ?, ?, ?, ?, ?)').bind(k, JSON.stringify(meta || {}), 0, buf.byteLength, em, casa)
    : db.prepare('INSERT OR REPLACE INTO arq (k, meta, n, tam, em) VALUES (?, ?, ?, ?, ?)').bind(k, JSON.stringify(meta || {}), 0, buf.byteLength, em);
  const semApagado = d1Est.prep ? [db.prepare('DELETE FROM apagados WHERE k = ?').bind(k)] : []; // voltou a existir
  if (casa) { // conteúdo fora: o índice passa a apontar para lá; os pedaços que estavam na principal saem DEPOIS (numa transação só)
    await db.batch([linhaArq, db.prepare('DELETE FROM parte WHERE k = ?').bind(k), ...semApagado]);
  } else {
    const partes = []; for (let i = 0; i < buf.byteLength; i += CH_D1, n++) partes.push(db.prepare('INSERT INTO parte (k, i, v) VALUES (?, ?, ?)').bind(k, n, buf.subarray(i, i + CH_D1)));
    const arqN = d1Est.arq ? db.prepare('INSERT OR REPLACE INTO arq (k, meta, n, tam, em, onde) VALUES (?, ?, ?, ?, ?, NULL)').bind(k, JSON.stringify(meta || {}), n, buf.byteLength, em)
      : db.prepare('INSERT OR REPLACE INTO arq (k, meta, n, tam, em) VALUES (?, ?, ?, ?, ?)').bind(k, JSON.stringify(meta || {}), n, buf.byteLength, em);
    if (buf.byteLength <= CH_D1) await db.batch([db.prepare('DELETE FROM parte WHERE k = ?').bind(k), ...partes, arqN, ...semApagado]); // pequeno: tudo de uma vez (ninguém lê pela metade)
    else { await db.prepare('DELETE FROM parte WHERE k = ?').bind(k).run(); for (const p of partes) await p.run(); await arqN.run(); for (const s of semApagado) await s.run(); }
  }
  // a casa antiga (outra nuvem) fica sem uso: apaga lá só se o índice ainda aponta para a casa nova (ninguém regravou no meio)
  const velha = ant?.onde && ant.onde !== casa ? lojaDe(ant.onde, A) : null;
  if (velha) { const ag = await db.prepare('SELECT onde, em FROM arq WHERE k = ?').bind(k).first().catch(() => null); if (ag && (ag.onde || null) === (casa || null)) await velha.apaga([k]).catch(() => { }); }
}
/* TRAZER PARA A PRINCIPAL (pedido da dona, 09/11/2026: tudo num lugar só). Lê da nuvem onde mora, grava na principal, lê de volta e compara o conteúdo
   byte a byte (SHA-256); só então o índice passa a apontar para a principal. A cópia na nuvem antiga NÃO é apagada: fica como garantia. */
const sha = async b => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
async function moverParaPrincipal(env, de, lim) {
  const db = env.EQUIPE_DB, A = arquivosDe(env); CASAS.t = arquivosDe(env, 't'); const L = lojaDe(de, A); if (!L) return { erro: 'sem a nuvem ' + de };
  const { results } = await db.prepare('SELECT k, em, tam FROM arq WHERE onde = ? ORDER BY tam LIMIT ?').bind(de, lim).all(); let movidos = 0, bytes = 0; const falhas = [];
  for (const x of results || []) { if (bytes > 40 * 1048576) break;
    try { const buf = await L.le(x.k); if (buf.byteLength !== x.tam) { falhas.push({ k: x.k, motivo: 'tamanho ' + buf.byteLength + '/' + x.tam }); continue; }
      const h0 = await sha(buf), ins = [db.prepare('DELETE FROM parte WHERE k = ?').bind(x.k)]; let n = 0; for (let i = 0; i < buf.byteLength; i += CH_D1, n++) ins.push(db.prepare('INSERT INTO parte (k, i, v) VALUES (?, ?, ?)').bind(x.k, n, buf.subarray(i, i + CH_D1)));
      for (let i = 0; i < ins.length; i += 5) await db.batch(ins.slice(i, i + 5));
      const c = await d1Partes(db, x.k, n);
      if (c.byteLength !== x.tam || await sha(c) !== h0) { await db.prepare('DELETE FROM parte WHERE k = ?').bind(x.k).run(); falhas.push({ k: x.k, motivo: 'conferência' }); continue; }
      const up = await db.prepare('UPDATE arq SET onde = NULL, n = ? WHERE k = ? AND em = ? AND onde = ?').bind(n, x.k, x.em, de).run();
      if (!up.meta?.changes) { await db.prepare('DELETE FROM parte WHERE k = ? AND EXISTS (SELECT 1 FROM arq WHERE k = ? AND onde IS NOT NULL)').bind(x.k, x.k).run(); falhas.push({ k: x.k, motivo: 'mudou no meio' }); continue; }
      movidos++; bytes += x.tam;
    } catch (e) { await db.prepare('DELETE FROM parte WHERE k = ? AND EXISTS (SELECT 1 FROM arq WHERE k = ? AND onde IS NOT NULL)').bind(x.k, x.k).run().catch(() => { }); falhas.push({ k: x.k, motivo: String(e?.message || e).slice(0, 120) }); } }
  const r = await db.prepare('SELECT count(*) AS n FROM arq WHERE onde = ?').bind(de).first();
  return { ok: true, movidos, bytes, falhas, resta: r?.n ?? null };
}
// lê os pedaços aos poucos: o banco não devolve mais de 32 MB de uma vez, e arquivo grande passa disso
async function d1Partes(db, k, n) { const pp = []; for (let i = 0; i < n; i += 5) { const { results } = await db.prepare('SELECT v FROM parte WHERE k = ? AND i >= ? AND i < ? ORDER BY i').bind(k, i, i + 5).all(); for (const x of results || []) pp.push(new Uint8Array(x.v)); }
  const c = new Uint8Array(pp.reduce((t, p) => t + p.length, 0)); let o = 0; for (const p of pp) { c.set(p, o); o += p.length; } return c; }
async function d1Le(db, k, A) {
  const a = await db.prepare('SELECT * FROM arq WHERE k = ?').bind(k).first(); if (!a) return null;
  let corpo = new Uint8Array(0);
  if (a.onde === 'a' || a.onde === 't') { const L = lojaDe(a.onde, A); if (!L) throw new Error('sem a nuvem dos arquivos (' + a.onde + ')'); corpo = await L.le(k); }
  else if (a.n) corpo = await d1Partes(db, k, a.n);
  let meta = null; try { meta = JSON.parse(a.meta || 'null'); } catch { } return { buf: corpo, meta: meta && Object.keys(meta).length ? meta : null, onde: a.onde || 'p' };
}
function kvD1(db, A) {
  const como = (buf, o) => { const t = typeof o === 'string' ? o : o?.type || 'text'; if (t === 'arrayBuffer') return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); if (t === 'stream') return new Response(buf).body;
    const s = new TextDecoder().decode(buf); return t === 'json' ? JSON.parse(s) : s; };
  return {
    async get(k, o) { const r = await d1Le(db, k, A); return r ? como(r.buf, o) : null; },
    async getWithMetadata(k, o) { const r = await d1Le(db, k, A); return r ? { value: como(r.buf, o), metadata: r.meta } : { value: null, metadata: null }; },
    async put(k, v, o) { await d1Grava(db, k, await bytesDe(v), o?.metadata, A); },
    async delete(k) { const a = d1Est.arq ? await db.prepare('SELECT * FROM arq WHERE k = ?').bind(k).first() : null;
      await db.batch([db.prepare('DELETE FROM parte WHERE k = ?').bind(k), db.prepare('DELETE FROM arq WHERE k = ?').bind(k), ...(d1Est.prep ? [db.prepare('INSERT OR REPLACE INTO apagados (k, em) VALUES (?, ?)').bind(k, Date.now())] : [])]);
      const L = a?.onde ? lojaDe(a.onde, A) : null; if (L) await L.apaga([k]).catch(() => { }); },
    async deleteLote(ks) { const st = [], em = Date.now(); for (const k of ks) st.push(db.prepare('DELETE FROM parte WHERE k = ?').bind(k), db.prepare('DELETE FROM arq WHERE k = ?').bind(k), ...(d1Est.prep ? [db.prepare('INSERT OR REPLACE INTO apagados (k, em) VALUES (?, ?)').bind(k, em)] : [])); for (let i = 0; i < st.length; i += 400) await db.batch(st.slice(i, i + 400));
      if (d1Est.arq && A && ks.length) await A.apaga(ks).catch(() => { }); // o que não estiver lá é ignorado
      if (d1Est.arq && CASAS.t && ks.length) await CASAS.t.apaga(ks).catch(() => { }); }, // e na terciária (06/11/2026: arquivos também moram lá)
    // só o que foi gravado/apagado depois de `desde` (null = ainda sem as tabelas/índices: o kvComLista carrega inteira)
    async mudancas(desde) { if (!d1Est.prep) return null;
      if (Date.now() - d1Est.poda > 3600e3) { d1Est.poda = Date.now(); await db.prepare('DELETE FROM apagados WHERE em < ?').bind(Date.now() - 3 * 864e5).run(); }
      const [a, b] = await db.batch([db.prepare('SELECT k, meta FROM arq WHERE em > ?').bind(desde), db.prepare('SELECT k FROM apagados WHERE em > ?').bind(desde)]);
      return { mudou: (a.results || []).map(x => { let m = null; try { m = JSON.parse(x.meta || 'null'); } catch { } return { name: x.k, ...(m && Object.keys(m).length ? { metadata: m } : {}) }; }), apagou: (b.results || []).map(x => x.k) }; },
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
  d1Est.at = 0; await d1Ligado(env); const A = arquivosDe(env); CASAS.t = d1Est.arq ? arquivosDe(env, 't') : null;
  if (rota === 'estado') { const a = await db.prepare("SELECT v FROM cfg WHERE k = 'ativo'").first().catch(() => null);
    // ESTADO BARATO (09/11/2026): as contagens abaixo leem a tabela inteira (~42 mil leituras por chamada) e rodavam a cada medição e antes de
    // cada lote da mudança noturna: estouraram as 5 milhões de leituras do dia. Sem ?contar=1, é só 1 linha (n = 1 se o banco respondeu, 0 se não).
    if (u.searchParams.get('contar') !== '1') return js({ ativo: a?.v === '1', n: a ? 1 : 0, arquivos: d1Est.arq, casas: !!d1Est.casas, pesos: CASAS.w, semContagem: true });
    const n = await db.prepare('SELECT count(*) AS n, sum(tam) AS b FROM arq').first().catch(() => null);
    const f = d1Est.arq ? await db.prepare("SELECT count(*) AS n, sum(tam) AS b FROM arq WHERE onde = 'a'").first().catch(() => null) : null;
    const t = d1Est.arq ? await db.prepare("SELECT count(*) AS n, sum(tam) AS b FROM arq WHERE onde = 't'").first().catch(() => null) : null;
    return js({ ativo: a?.v === '1', n: n?.n || 0, bytes: n?.b || 0, arquivos: d1Est.arq, fora: f?.n || 0, foraBytes: f?.b || 0, casas: !!d1Est.casas, terc: t?.n || 0, tercBytes: t?.b || 0, pesos: CASAS.w }); }
  // CADA ARQUIVO NUMA NUVEM (06/11/2026): ligar = arquivos novos escolhem a casa pelo que cada nuvem tem livre; desligar = como antes
  if (rota === 'casas' && req.method === 'POST') { const v = u.searchParams.get('v') === '0' ? '0' : '1';
    if (v === '1') { if (!d1Est.arq || !A) return js({ erro: 'ligue antes a nuvem dos arquivos' }, 409); const T = arquivosDe(env, 't'), e = T ? await T.estado() : { erro: 'sem ROBO' };
      if (e.erro || !e.ok) return js({ erro: 'a nuvem dos arquivos da terciária não respondeu: ' + JSON.stringify(e).slice(0, 120) }, 502); }
    await db.prepare("INSERT OR REPLACE INTO cfg (k, v) VALUES ('casas', ?)").bind(v).run(); d1Est.at = 0; return js({ ok: true, casas: v === '1' }); }
  /* MUDANÇA DE CASA DOS ANTIGOS, EM LOTES (06/11/2026): /robo/mudar?n=5&de=a|p&para=t (POST). Lê o arquivo pela casa atual, grava na
     nova, CONFERE (lê de volta e compara o tamanho), troca o índice só se a linha não mudou no meio (mesmo em), e só então apaga da
     casa antiga. Para a Action rodar devagar, fora do horário de uso, parando antes de qualquer limite. */
  if (rota === 'mudar' && req.method === 'POST') {
    if (!d1Est.casas) return js({ erro: 'casas desligadas' }, 409);
    const de = u.searchParams.get('de') === 'p' ? null : 'a', para = u.searchParams.get('para') === 'a' ? 'a' : u.searchParams.get('para') === 'p' ? null : 't';
    if (de === para) return js({ erro: 'de = para' }, 400); const lim = Math.min(Math.max(+u.searchParams.get('n') || 3, 1), 10); let n = 0, b = 0, pulou = 0;
    const { results } = await db.prepare(de ? 'SELECT k, em, tam, onde FROM arq WHERE onde = ? ORDER BY em LIMIT ?' : 'SELECT k, em, tam, onde FROM arq WHERE onde IS NULL ORDER BY em LIMIT ?').bind(...(de ? [de, lim] : [lim])).all();
    for (const x of results || []) {
      const r = await d1Le(db, x.k, A); if (!r || r.buf.byteLength !== x.tam) { pulou++; continue; }
      if (para) { const L = lojaDe(para, A); await L.grava(x.k, r.buf); const volta = await L.le(x.k); if (volta.byteLength !== r.buf.byteLength) { pulou++; continue; } }
      else { let i = 0, m = 0; await db.prepare('DELETE FROM parte WHERE k = ?').bind(x.k).run(); for (; i < r.buf.byteLength; i += CH_D1, m++) await db.prepare('INSERT INTO parte (k, i, v) VALUES (?, ?, ?)').bind(x.k, m, r.buf.subarray(i, i + CH_D1)).run(); }
      const up = await db.prepare(de ? 'UPDATE arq SET onde = ?, n = ? WHERE k = ? AND em = ? AND onde = ?' : 'UPDATE arq SET onde = ?, n = ? WHERE k = ? AND em = ? AND onde IS NULL')
        .bind(...[para, para ? 0 : Math.ceil(r.buf.byteLength / CH_D1), x.k, x.em, ...(de ? [de] : [])]).run();
      if (!up.meta?.changes) { pulou++; continue; } // mudou no meio: fica onde estava (a cópia na casa nova é sobra inofensiva)
      if (de) await lojaDe(de, A)?.apaga([x.k]).catch(() => { }); else await db.prepare('DELETE FROM parte WHERE k = ?').bind(x.k).run();
      n++; b += r.buf.byteLength; }
    const resta = await db.prepare(de ? 'SELECT count(*) AS n FROM arq WHERE onde = ?' : 'SELECT count(*) AS n FROM arq WHERE onde IS NULL').bind(...(de ? [de] : [])).first();
    return js({ ok: true, movidos: n, bytes: b, pulou, resta: resta?.n || 0 }); }
  // NUVEM DOS ARQUIVOS: ligar (cria a coluna onde) / desligar; desligar só deixa de mandar arquivos NOVOS para lá (ler continua)
  if (rota === 'arquivos' && req.method === 'POST') { const v = u.searchParams.get('v') === '0' ? '0' : '1';
    if (v === '1') { if (!A) return js({ erro: 'sem ROBO ou ARQUIVOS=nao no turma-ia' }, 409); const e = await A.estado(); if (e.erro || !e.ok) return js({ erro: 'a nuvem dos arquivos não respondeu: ' + JSON.stringify(e).slice(0, 120) }, 502);
      try { await db.prepare('ALTER TABLE arq ADD COLUMN onde TEXT').run(); } catch (x) { if (!/duplicate column/i.test(String(x?.message || x))) throw x; } }
    await db.prepare("INSERT OR REPLACE INTO cfg (k, v) VALUES ('arquivos', ?)").bind(v).run(); d1Est.at = 0; return js({ ok: true, arquivos: v === '1' }); }
  // passa para a nuvem dos arquivos o conteúdo grande que ainda está aqui (poucos por pedido: o Worker grátis tem pouco tempo de CPU)
  if (rota === 'mover' && req.method === 'POST') { if (!A || !d1Est.arq) return js({ erro: 'nuvem dos arquivos desligada' }, 409);
    const lim = Math.min(Math.max(+u.searchParams.get('n') || 5, 1), 20); let n = 0, b = 0;
    const { results } = await db.prepare('SELECT k, em FROM arq WHERE onde IS NULL AND tam >= ? ORDER BY tam DESC LIMIT ?').bind(ARQ_MIN, lim).all();
    for (const x of results || []) { const r = await d1Le(db, x.k, A); if (!r) continue; await A.grava(x.k, r.buf);
      const up = await db.prepare("UPDATE arq SET onde = 'a', n = 0 WHERE k = ? AND em = ? AND onde IS NULL").bind(x.k, x.em).run(); // mudou no meio? fica aqui (vai na próxima)
      if (up.meta?.changes) { await db.prepare('DELETE FROM parte WHERE k = ?').bind(x.k).run(); n++; b += r.buf.byteLength; } }
    const resta = await db.prepare('SELECT count(*) AS n, sum(tam) AS b FROM arq WHERE onde IS NULL AND tam >= ?').bind(ARQ_MIN).first();
    /* sem kvLista = null: a lista não muda (onde não entra nela) e limpar fazia o site reler a tabela toda a cada arquivo (estourou as leituras do D1 em 03/11/2026) */ return js({ ok: true, movidos: n, bytes: b, resta: resta?.n || 0, restaBytes: resta?.b || 0 }); }
  // o mesmo, um arquivo por pedido (o mover acima passa do tempo de CPU do plano grátis com arquivos grandes): a Action lê por
  // /robo/arq, grava direto na nuvem dos arquivos e marca aqui; só marca se a linha não mudou desde a lista (em)
  if (rota === 'faltam') { const { results } = await db.prepare('SELECT k, em, tam FROM arq WHERE onde IS NULL AND tam >= ? ORDER BY k LIMIT 500').bind(ARQ_MIN).all(); return js({ itens: results || [] }); }
  if (rota === 'marcar' && req.method === 'POST' && k) { if (!d1Est.arq) return js({ erro: 'nuvem dos arquivos desligada' }, 409);
    const up = await db.prepare("UPDATE arq SET onde = 'a', n = 0 WHERE k = ? AND em = ? AND onde IS NULL").bind(k, +u.searchParams.get('em') || 0).run();
    if (up.meta?.changes) await db.prepare('DELETE FROM parte WHERE k = ?').bind(k).run(); return js({ ok: true, marcou: !!up.meta?.changes }); }
  if (rota === 'ligar' && req.method === 'POST') { const v = u.searchParams.get('v') === '0' ? '0' : '1'; await db.prepare("INSERT OR REPLACE INTO cfg (k, v) VALUES ('ativo', ?)").bind(v).run(); d1Est.at = 0; return js({ ok: true, ativo: v === '1' }); }
  if (rota === 'lista') { const out = []; let cur; do { const r = await kvD1(db).list({ prefix: u.searchParams.get('prefix') || '', cursor: cur }); out.push(...r.keys); cur = r.list_complete ? null : r.cursor; } while (cur); return js({ keys: out }); }
  if (rota === 'arq' && k && k.length <= 512) {
    if (req.method === 'GET') { const r = await d1Le(db, k, A); return r ? new Response(r.buf, { headers: { 'x-meta': encodeURIComponent(JSON.stringify(r.meta || {})), 'x-onde': r.onde, 'cache-control': 'no-store' } }) : js({ erro: 'não achei' }, 404); }
    if (req.method === 'PUT') { let meta = null; try { meta = JSON.parse(decodeURIComponent(req.headers.get('x-meta') || 'null')); } catch { } const buf = new Uint8Array(await req.arrayBuffer()); if (buf.byteLength > 25 * 1048576) return js({ erro: 'grande' }, 413); await d1Grava(db, k, buf, meta, A); kvLista = null; return js({ ok: true }); }
    if (req.method === 'DELETE') { await kvD1(db, A).delete(k); kvLista = null; return js({ ok: true }); }
  }
  if (rota === 'apaga' && req.method === 'POST') { let o = {}; try { o = await req.json(); } catch { } const ks = (Array.isArray(o.k) ? o.k : []).filter(x => typeof x === 'string' && x && x.length <= 512).slice(0, 2000); await kvD1(db, A).deleteLote(ks); kvLista = null; return js({ ok: true, n: ks.length }); }
  return js({ erro: 'pedido desconhecido' }, 400);
}

/* ---- LISTA DO KV GUARDADA NA MEMÓRIA (plano grátis da Cloudflare: só 1000 "list" por DIA na conta toda) ----
   Toda lista do KV EQUIPE (personagens, cenários, espaço usado…) sai de UMA lista completa guardada aqui por 5 min; o que
   este servidor grava ou apaga já entra na lista guardada na hora (put/delete passam por aqui). Antes cada abertura da
   biblioteca/espaço gastava listas e o limite do dia acabava ("reached the free usage limit"). */
let kvLista = null; const KV_LISTA_MS = 5 * 60e3;
/* LER MENOS (05/11/2026): cada vez que a Cloudflare "acorda" uma cópia nova deste servidor, ela lia a tabela inteira do D1 (~14 mil
   linhas = 14 mil leituras) — era a maior parte das 5 milhões de leituras do dia. Agora a lista inteira fica no CACHE da Cloudflare
   (não gasta leitura nem gravação do D1); quem acorda pega a foto de lá e lê do D1 só o que mudou depois dela (índice arq_em).
   A foto é trocada a cada leitura completa (de 6 em 6 h); com mais de 6 h ela é ignorada. */
const LISTA_CACHE = 'https://turma.cache/lista-equipe-v1';
async function listaDoCache() {
  try { const r = await caches.default.match(LISTA_CACHE); if (!r) return null; const j = await r.json();
    if (!j?.desde || !Array.isArray(j.m) || Date.now() - j.cheia > 6 * 3600e3) return null;
    return { m: new Map(j.m.map(x => [x.name, x])), at: 0, cheia: j.cheia, desde: j.desde }; } catch { return null; }
}
async function guardaListaCache(L) {
  await caches.default.put(LISTA_CACHE, new Response(JSON.stringify({ cheia: L.cheia, desde: L.desde, m: [...L.m.values()] }), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=21600' } }));
}
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
    if (kvLista && Date.now() - kvLista.at < (forcar || kv.mudancas ? 30e3 : KV_LISTA_MS)) return kvLista.m;
    if (!kvLista && kv.mudancas) kvLista = await listaDoCache(); // acordou agora: começa da foto guardada e busca só o que mudou depois dela
    if (kvLista?.desde && kv.mudancas && Date.now() - kvLista.cheia < 6 * 3600e3) { // D1: só o que mudou (2 minutos de folga para relógios diferentes)
      const t = Date.now(), d = await kv.mudancas(kvLista.desde);
      if (d) { for (const x of d.mudou) kvLista.m.set(x.name, x); for (const k of d.apagou) kvLista.m.delete(k); kvLista.at = t; kvLista.desde = t - 120e3; return kvLista.m; } }
    const t0 = Date.now(), m = new Map(); let cur; do { const r = await kv.list({ cursor: cur }); for (const k of r.keys) m.set(k.name, k); cur = r.list_complete ? null : r.cursor; } while (cur);
    kvLista = { m, at: Date.now(), cheia: Date.now(), desde: kv.mudancas ? t0 - 120e3 : 0 };
    if (kv.mudancas) bg(guardaListaCache(kvLista).catch(() => { }));
    if (R && Date.now() - fotoListaEm > 15 * 60e3) { fotoListaEm = Date.now(); bg(R.guardaLista(m).catch(() => { })); } // foto da lista guardada na reserva (de 15 em 15 min: se a principal acabar de repente, a lista continua abrindo pela reserva)
    return m;
  };
  const ler = async (k, o, meta) => { const it = await naReserva(k);
    if (it) { usou(); if (it.metadata?._del) return meta ? { value: null, metadata: null } : null; const g = await R.get(k); return meta ? { value: valorComo(g.value, o), metadata: g.metadata } : valorComo(g.value, o); }
    if (R && emLimite()) { const naLista = +(kvLista?.m.get(k)?.metadata?.mod || 0); // poupando a principal: a cópia só vale se for a mesma versão
      if (naLista) { const g = await R.bkget(k).catch(() => null); if (g?.value != null && +(g.metadata?.mod || 0) >= naLista) { flag.copia = true; return meta ? { value: valorComo(g.value, o), metadata: g.metadata } : valorComo(g.value, o); } } }
    try { return meta ? await kv.getWithMetadata(k, o) : await kv.get(k, o); }
    // falha de um instante (fora do limite): a cópia de segurança entrega o arquivo SEM marcar "reserva" — senão o site mostrava
    // "a nuvem principal já voltou" sem nada ter saído do ar (04/11/2026)
    // VERSÃO VELHA (04/11/2026: Clara e Melzinha "voltavam"): numa falha da principal o servidor entregava a CÓPIA DE SEGURANÇA, que é
    // de horas antes, e o Ateliê gravava essa versão velha por cima. Agora: tenta a principal mais duas vezes; a cópia só entra no
    // limite do dia ou quando é da MESMA versão da lista (mod igual ou mais novo). Senão, erro claro (o programa tenta de novo).
    catch (e) { if (!R) throw e; let e2 = e;
      for (const ms of [250, 900]) { await new Promise(r => setTimeout(r, ms)); try { return meta ? await kv.getWithMetadata(k, o) : await kv.get(k, o); } catch (x) { e2 = x; } }
      console.log('leitura falhou na principal:', k.replace(/[^/]+@[^/]+/g, '•'), String(e2?.message || e2).slice(0, 120));
      const g = await R.bkget(k).catch(() => ({ value: null })); if (g.value == null) throw e2;
      const naLista = kvLista?.m.get(k)?.metadata?.mod || 0, daCopia = +(g.metadata?.mod || 0);
      if (!emLimite() && (!naLista || daCopia < naLista)) { const x = new Error('A nuvem não conseguiu ler a versão mais nova deste arquivo agora (só a cópia de segurança, mais antiga, respondeu). Tente de novo em alguns segundos. Nada foi perdido.'); x.instavel = true; throw x; }
      if (emLimite()) usou(); flag.copia = true; return meta ? { value: valorComo(g.value, o), metadata: g.metadata } : valorComo(g.value, o); } };
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
/* AS NUVENS TRABALHANDO JUNTAS (pedido da dona, 05/11/2026: "todas agirem como se fosse uma só, sem os usuários perceberem").
   O limite que mais aperta na principal é o de PEDIDOS (100 mil por dia na conta toda). Os dados ficam todos no D1 "equipe" da
   principal; o turma-reserva (outra conta) agora fala com ESSE MESMO banco pela API da Cloudflare (a PONTE, abaixo): lê e grava
   nos mesmos dados, sem cópia velha. Assim os pedidos de DADOS (animações, personagens, cenários…) podem ir por qualquer uma das
   duas portas sem ninguém notar (vale para TODA rota de dados, inclusive as novas; o site só não divide a IA e o que depende de
   segredos que existem só aqui — lista NAO_DIV no estudio-conta.js). DIVIDIR: a partir de 40% dos pedidos do dia gastos na principal, uma parte dos navegadores
   (sorteada uma vez por navegador, para cada pessoa ficar sempre na mesma porta) passa a usar o turma-reserva; com 75% vão todos.
   O site lê a parte no cabeçalho x-divide (estudio-conta.js). A IA, a transcrição e o uso continuam só na principal. */
function d1Rest(conta, id, token) {
  const hex = v => { const u = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength); let t = ''; for (let i = 0; i < u.length; i++) t += (u[i] < 16 ? '0' : '') + u[i].toString(16); return t; };
  const lit = v => v == null ? 'NULL' : typeof v === 'number' ? (Number.isFinite(v) ? String(v) : 'NULL') : typeof v === 'boolean' ? (v ? '1' : '0')
    : (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) ? "X'" + hex(v) + "'" : "'" + String(v).replace(/'/g, "''") + "'";
  const monta = (sql, ps) => { let i = 0; return sql.replace(/\?/g, () => lit(ps[i++])); }; // os SQL deste arquivo não têm "?" dentro de texto
  const roda = async sqls => {
    const r = await fetch('https://api.cloudflare.com/client/v4/accounts/' + conta + '/d1/database/' + id + '/query', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ sql: sqls.join(';\n') }) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.success) throw new Error((j?.errors || []).map(e => e.message).join('; ') || 'o banco da principal (pela API) respondeu ' + r.status);
    const res = Array.isArray(j.result) ? j.result : [j.result]; for (const x of res) if (x && x.success === false) throw new Error(x.error || 'o banco da principal recusou'); return res; };
  // pedaços de arquivo (BLOB): pela API vêm como texto hex (hex(v)) e voltam a ser bytes aqui
  const blob = q => /^SELECT v FROM parte\b/.test(q), deHex = t => { t = String(t || ''); const u = new Uint8Array(t.length / 2); for (let i = 0; i < u.length; i++) u[i] = parseInt(t.substr(i * 2, 2), 16); return u; };
  const st = (sql0, ps = []) => { const b = blob(sql0), sql = b ? sql0.replace(/^SELECT v FROM/, 'SELECT hex(v) AS v FROM') : sql0, conv = rs => b ? rs.map(x => ({ ...x, v: deHex(x.v) })) : rs;
    return { _sql: () => monta(sql, ps), bind: (...a) => st(sql0, a),
      first: async () => conv((await roda([monta(sql, ps)]))[0]?.results || [])[0] ?? null,
      all: async () => ({ results: conv((await roda([monta(sql, ps)]))[0]?.results || []) }),
      run: async () => ({ success: true, meta: (await roda([monta(sql, ps)]))[0]?.meta || {} }) }; };
  return { prepare: sql => st(sql), batch: async sts => (await roda(sts.map(x => x._sql()))).map(x => ({ results: x?.results || [], meta: x?.meta || {} })) };
}
const DIVIDE = { p: 0, at: 0 };
/* PLANO PAGO NA PRINCIPAL (09/11/2026): os limites viraram por mês (10 milhões de pedidos, 25 bilhões de leituras, 50 milhões de gravações).
   Não existe mais "poupar até as 21h" nem dividir pedidos com a outra porta (ela continua só para emergência: se a principal não responder,
   o site repete o pedido lá). As outras contas guardam os arquivos grandes, os sons e a cópia de segurança. */
const PRINCIPAL_PAGA = true;
/* TRAVA ANTES DE COBRAR (pedido da dona, 09/11/2026): a Action "Vigia do plano pago" guarda em cfg 'plano-uso' o gasto do ciclo. Aos 95% de qualquer item
   o Estúdio pausa (as rotas de dados respondem 423 e o site mostra a tela de pausa) até um ADM aceitar que o excedente será cobrado; o aceite vale até o fim do
   ciclo (cfg 'plano-aceite'). Sem medida recente (mais de 24 h) ou com o banco fora, não pausa: a trava nunca derruba o site por falha dela mesma. */
const PLANO = { at: 0, uso: null, ac: null }, PLANO_TRAVA = 0.95;
async function planoEstado(env) {
  if (Date.now() - PLANO.at < (planoPausado() ? 15e3 : 60e3) || !env.EQUIPE_DB) return PLANO; PLANO.at = Date.now();
  try { const { results } = await env.EQUIPE_DB.prepare("SELECT k, v FROM cfg WHERE k IN ('plano-uso', 'plano-aceite')").all(); const v = Object.fromEntries((results || []).map(x => [x.k, x.v])); PLANO.uso = v['plano-uso'] ? JSON.parse(v['plano-uso']) : null; PLANO.ac = v['plano-aceite'] ? JSON.parse(v['plano-aceite']) : null; } catch { }
  return PLANO;
}
const planoPct = u => Math.max(0, ...Object.values(u?.itens || {}).map(x => x.lim ? x.v / x.lim : 0));
function planoPausado() { const u = PLANO.uso; return !!u && Date.now() - u.em < 864e5 && planoPct(u) >= PLANO_TRAVA && PLANO.ac?.ciclo !== u.ciclo; }
const PLANO_LIVRES = new Set(['/plano', '/plano/aceitar', '/quem', '/confere', '/app-key', '/permissoes', '/nuvem-hoje', '/uso']);
async function confereDivide(R) {
  if (PRINCIPAL_PAGA) { DIVIDE.p = 0; DIVIDE.at = Date.now(); return; }
  if (!R || Date.now() - DIVIDE.at < 120e3) return; DIVIDE.at = Date.now();
  try { const c = await R.contaJa(), o = c?.contas?.principal; CASAS.w = pesosCasas(c); CASAS.at = Date.now(); // pesos das casas dos arquivos (mesma medida)
    if (!o || c.dia !== new Date().toISOString().slice(0, 10)) { DIVIDE.p = 0; return; }
    const L = (c.limites?.workers || 1e5), usado = (+o.workers || 0) / L, rampa = Math.max(0, Math.min(1, (usado - 0.4) / 0.35)); // 06/11/2026: começa aos 40% (antes 60%) e vão todos aos 75%
    /* DESDE O COMEÇO DO DIA (pedido da dona, 06/11/2026): a parte que vai pela outra porta (turma-reserva, na conta terciária) pesa o
       quanto cada conta ainda tem LIVRE dos pedidos do dia — com as duas vazias, metade vai por cada uma; a que gastou mais recebe menos.
       Até 50% pelo peso (a ponte é um pouco mais lenta); acima disso só pela rampa de proteção (40% → 75% da principal). */
    const t = c.contas?.terc, ut = t && !t.erro ? (+t.workers || 0) / L : 1, livreP = Math.max(0, 0.9 - usado), livreT = Math.max(0, 0.9 - ut);
    const peso = livreP + livreT > 0 ? Math.min(0.5, livreT / (livreP + livreT)) : 0;
    DIVIDE.p = Math.max(0, Math.min(1, Math.round(Math.max(rampa, peso) * 20) / 20)); } catch { }
}
async function confereCheio(kv, R) {
  if (PRINCIPAL_PAGA) return;
  if (!R || emLimite() || Date.now() - cheioVisto < 60e3) return; cheioVisto = Date.now();
  const c = await R.contaJa(), o = c?.contas?.principal, L = c?.limites; if (!o?.kv || !L || c.dia !== new Date().toISOString().slice(0, 10)) return;
  // LEITURAS TAMBÉM (pedido da dona, 05/11/2026): antes só as gravações ligavam a proteção; com as leituras em 100% o Estúdio passava a
  // ler a cópia de segurança, que podia estar atrasada (versões velhas). Agora, aos 85% das leituras OU das gravações: última cópia
  // atualizada, as gravações vão para a reserva e as leituras saem da cópia (quando ela é da mesma versão) até as 21h.
  const pct = o.d1ativo && o.d1 ? Math.max(o.d1.write / (L.d1Write || 1e5), o.d1.read / (L.d1Read || 5e6)) : Math.max(o.kv.write / L.write, o.kv.list / L.list, o.kv.delete / L.delete); if (pct < SEGURO) return; // no D1: linhas gravadas e linhas lidas
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
  // ERROS EXPLICADOS (pedido do dono, 04/11/2026): em vez de "erro 500/503" com o texto técnico, uma frase dizendo o que houve e o que fazer
  const cheio = /ARQUIVOS_CHEIO/.test(m), instavel = !lim && !cheio && (e?.instavel || /respondeu 5\d\d|abort|timed? ?out|timeout|network connection lost|connection (reset|closed)|internal error|overloaded|too many|busy|1102|exceeded resources|reset because/i.test(m));
  const erro = lim ? { type: 'limite_cloudflare', volta: d.toISOString(), message: duas ? 'A nuvem da equipe, a reserva e a terciária chegaram ao limite de hoje. Voltam sozinhas às 21h (horário de Brasília). O que você fez continua guardado neste computador.' : 'A nuvem da equipe chegou ao limite de hoje. Volta sozinha às 21h (horário de Brasília). O que você fez continua guardado neste computador.' }
    : cheio ? { type: 'cheio', message: 'O espaço da nuvem dos arquivos está cheio, então este arquivo não foi salvo lá. Avise um ADM para liberar espaço. O que você fez continua guardado neste computador.' }
    : instavel && e?.instavel ? { type: 'instavel', message: m }
    : instavel ? { type: 'instavel', message: 'A nuvem ficou sobrecarregada por um instante e não conseguiu responder. Isso costuma passar sozinho: tente de novo em alguns segundos. Nada foi perdido.' }
    : { type: 'servidor', message: 'A nuvem teve um problema inesperado ao fazer isso. Tente de novo; se continuar, avise um ADM. O que você fez continua guardado neste computador. (detalhe técnico: ' + m.slice(0, 120) + ')' };
  return new Response(JSON.stringify({ error: erro, erro: erro.message }), { status: lim || instavel ? 503 : cheio ? 507 : 500,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization, content-type', 'vary': 'origin', 'cache-control': 'no-store' } });
}

/* PORTA RESERVA (decisão do dono, 02/11/2026): este mesmo código roda numa conta reserva (PORTA = '1') para o Estúdio não sair do ar
   quando a conta principal estoura os 100 mil pedidos do dia (erro 1027, os Workers de lá param). Lá a principal NÃO existe: tudo
   funciona como "principal no limite" — a lista sai da foto guardada na reserva (ou da cópia de segurança), ler sai da reserva e da
   cópia de segurança (bk:), gravar e apagar vão para a reserva (o devolve-reserva leva para a principal depois). Sem IA (a chave fica
   na principal). TROCA_DE/TROCA_PARA: endereços da principal trocados pelos da porta reserva nas respostas (links do menu). */
const principalFora = () => { const no = async () => { throw new Error('PORTA_RESERVA: a nuvem principal está fora do ar (porta reserva)'); };
  return { get: no, getWithMetadata: no, put: no, delete: no, list: no }; };
const trocas = env => { try { return env.TROCA_DE ? JSON.parse(env.TROCA_DE).map((de, i) => [de, JSON.parse(env.TROCA_PARA)[i]]).filter(([a, b]) => a && b) : []; } catch { return []; } };
async function comTrocas(env, r) {
  const ts = trocas(env); if (!ts.length || !/json/.test(r.headers.get('content-type') || '')) return r;
  let t = await r.text(); for (const [a, b] of ts) t = t.split(a).join(b); const h = new Headers(r.headers); h.delete('content-length');
  return new Response(t, { status: r.status, statusText: r.statusText, headers: h });
}

/* ECONOMIA (03/11/2026): a lista inteira de /animacoes (e /jester) gasta LISTAS do KV, o limite mais apertado do plano grátis
   (1000 por dia na conta). Para o MENU (Recentes na nuvem, ?menu=1) ela fica 5 min guardada aqui na memória do servidor, sem
   gravar nada; é jogada fora quando alguém salva um projeto ou tira uma animação da nuvem. O Animador continua pedindo sem ?menu=1
   e sempre recebe a lista na hora (ex.: logo depois de salvar). */
/* ===================== NÍVEIS DE ACESSO (pedido da dona, 05/11/2026) =====================
   Quem pode ver cada PROGRAMA e cada FUNÇÃO. Tudo numa chave só da nuvem da equipe: "acesso/permissoes"
     { v: 1, cargos: [{ id, nome, cor, desc, sem: { programas: [...], funcoes: [...] } }],   ← "sem" = o que o cargo NÃO tem
       pessoas: { <id da pessoa>: { cargos: [<id do cargo>], pasta: <id da pasta> | null } },
       pastas: [{ id, nome }], padrao: 'equipe', em, por }
   - O id da pessoa é o MESMO da ADM › Quem pode entrar (porteiro `idDe`: sha256('acesso:' + e-mail), 16 letras): o e-mail
     nunca vai para o navegador e o modelo não guarda e-mail nenhum.
   - O cargo guarda só o que ele TIRA: programa/função nova que aparecer no catálogo (/permissoes.json) já nasce liberada.
   - Pessoa com vários cargos: soma (pode o que QUALQUER um dos cargos dela pode). Sem cargo = o cargo padrão "Equipe"
     (tudo liberado até um ADM mudar). Os ADMs (variável ADMINS) sempre têm tudo.
   - Função "programa.algo" de um programa que a pessoa não vê também fica bloqueada.
   - Economia: o modelo fica 60 s na memória (e cacheTtl 60 no KV); o catálogo 10 min. Gravar = só quando o ADM salva. */
const PERM = { m: undefined, t: 0 }, CAT = { j: null, t: 0 };
// CARGO ADM (pedido da dona, 05/11/2026): sempre na lista, só para o selo dos ADMs no título do menu (nome, cor e "mostrar selo").
// Quem é ADM vem da lista ADMINS (não dá para pôr alguém neste cargo pela tela); para ADM nada é bloqueado.
const PERM_ADM = () => ({ id: 'adm', nome: 'ADM', cor: '#1d6fd6', desc: 'Os ADMs do Estúdio (lista do servidor). Só o selo no título do menu.', selo: true, seloBorda: '#ffffff', seloFundo: '#0e203a', seloAlfa: .35, sem: { programas: [], funcoes: [] } });
const comAdm = m => { if (m && Array.isArray(m.cargos) && !m.cargos.some(c => c.id === 'adm')) m.cargos.splice(m.cargos.some(c => c.id === 'equipe') ? 1 : 0, 0, PERM_ADM()); return m; };
const PERM_PADRAO = () => ({ v: 1, cargos: [{ id: 'equipe', nome: 'Equipe', cor: '#8e8e93', desc: 'Cargo padrão: quem não tem cargo fica nele.', sem: { programas: [], funcoes: [] } }, PERM_ADM()], pessoas: {}, pastas: [], padrao: 'equipe' });
async function permModelo(env, forcar) {
  if (!forcar && PERM.m !== undefined && Date.now() - PERM.t < 60e3) return PERM.m;
  try { const v = await env.EQUIPE?.get('acesso/permissoes', { type: 'json', cacheTtl: 60 }); PERM.m = v && Array.isArray(v.cargos) ? comAdm(v) : null; PERM.t = Date.now(); }
  catch { if (PERM.m === undefined) PERM.m = null; PERM.t = Date.now() - 45e3; } // falhou: tenta de novo em 15 s; sem modelo = tudo liberado
  return PERM.m;
}
async function permCatalogo(env) { // o catálogo do site (permissoes.json): só para devolver as listas "liberadas"; sem ele, nada é bloqueado a mais
  if (CAT.j && Date.now() - CAT.t < 600e3) return CAT.j;
  try { const r = await fetch(env.CATALOGO_URL || 'https://problemsbloxcreate-lab.github.io/permissoes.json', { cf: { cacheTtl: 300 } }); if (r.ok) { const j = await r.json(); if (Array.isArray(j?.programas)) { CAT.j = j; CAT.t = Date.now(); } } } catch { }
  if (!CAT.j) { CAT.j = { programas: [], funcoes: [] }; CAT.t = Date.now() - 540e3; } return CAT.j;
}
const b64uE = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const permId = async email => b64uE(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('acesso:' + String(email || '').trim().toLowerCase()))).slice(0, 16); // = idDe do porteiro
// o que a pessoa NÃO tem (id = permId do e-mail). ADM: nada bloqueado.
function permSem(m, id, adm) {
  const vazio = { programas: [], funcoes: [], cargos: [] }, cv = c => ({ id: c.id, nome: c.nome, cor: c.cor, ...(c.selo ? { selo: true } : {}), ...(c.seloBorda ? { seloBorda: c.seloBorda } : {}), ...(c.seloFundo ? { seloFundo: c.seloFundo } : {}), ...(c.seloAlfa != null ? { seloAlfa: c.seloAlfa } : {}) });
  const admC = cv(m?.cargos?.find(x => x.id === 'adm') || PERM_ADM());
  if (!m) return adm ? { ...vazio, cargos: [admC] } : vazio;
  const ids = (m.pessoas?.[id]?.cargos || []).filter(c => c !== 'adm' && m.cargos.some(x => x.id === c)); // o cargo ADM é só de quem é ADM de verdade
  let cs = ids.map(c => m.cargos.find(x => x.id === c)); if (!cs.length) cs = [m.cargos.find(x => x.id === (m.padrao || 'equipe')) || m.cargos[0]].filter(Boolean);
  if (!cs.length) return vazio;
  const cargosV = cs.map(cv); // selo = mostrar no título do menu (ADM › Níveis)
  if (adm) return { ...vazio, cargos: [admC, ...cargosV] }; // ADM não perde nada; o cargo ADM (selo) e os cargos dele aparecem
  const todos = t => cs.reduce((a, c) => a.filter(k => (c.sem?.[t] || []).includes(k)), [...(cs[0].sem?.[t] || [])]); // bloqueado só se TODOS os cargos tiram
  return { programas: todos('programas'), funcoes: todos('funcoes'), cargos: cargosV };
}
const permBloq = (sem, chave) => { chave = String(chave || ''); if (!chave.includes('.')) return sem.programas.includes(chave); return sem.funcoes.includes(chave) || sem.programas.includes(chave.split('.')[0]); };
// AJUDANTE para as outras rotas: pode(env, email, 'programa.funcao' | 'programa') → true/false
async function pode(env, email, chave) { if (ehAdmin(env, email)) return true; const m = await permModelo(env); if (!m) return true; return !permBloq(permSem(m, await permId(email), false), chave); }
// as permissões efetivas de quem está logado (GET /permissoes): { adm, programas, funcoes, sem, cargos, livre }
async function permEfetivas(env, email) {
  const adm = ehAdmin(env, email), m = await permModelo(env), sem = permSem(m, await permId(email), adm), cat = await permCatalogo(env);
  const livre = !m || m.cargos.every(c => !(c.sem?.programas || []).length && !(c.sem?.funcoes || []).length); // ninguém tem nada bloqueado (o porteiro não precisa conferir cada um)
  return { adm, livre, cargos: sem.cargos, sem: { programas: sem.programas, funcoes: sem.funcoes },
    programas: (cat.programas || []).map(p => p.id).filter(k => !permBloq(sem, k)), funcoes: (cat.funcoes || []).map(f => f.id).filter(k => !permBloq(sem, k)) };
}
// qual programa é um botão do menu (pelo endereço; sem endereço, pelo nome) — para não mandar o link de quem não pode ver
function permProgDoLink(l) {
  let p = String(l?.url || ''); try { p = new URL(p, 'https://x.invalid/').pathname; } catch { }
  const m = p.match(/^\/(animador|shorts|editor|modelador|jester|jester-dreams|preparativos|publicacoes)(\/|$)/); if (m) return m[1] === 'jester-dreams' ? 'jester' : m[1];
  const n = String(l?.nome || '').toUpperCase();
  return /JESTER/.test(n) ? 'jester' : /PREPARA/.test(n) ? 'preparativos' : /PUBLICA/.test(n) ? 'publicacoes' : /SHORT/.test(n) ? 'shorts' : /MODEL/.test(n) ? 'modelador' : /ANIM/.test(n) ? 'animador' : /EDI/.test(n) ? 'editor' : null;
}
// ADM salvando: confere tudo o que veio (nada de e-mail; ids e textos curtos)
function permLimpa(b, porId) {
  const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n), cor = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : '#8e8e93';
  const lista = (a, re, n) => [...new Set((Array.isArray(a) ? a : []).map(String).filter(x => re.test(x)))].slice(0, n);
  const ID = /^[a-z0-9][a-z0-9-]{0,39}$/, FN = /^[a-z0-9][a-z0-9-]{0,39}\.[a-z0-9][a-z0-9.-]{0,59}$/, PID = /^[A-Za-z0-9_-]{16}$/;
  if (!b || !Array.isArray(b.cargos)) throw new Error('Modelo inválido.');
  if (b.cargos.length > 60) throw new Error('No máximo 60 cargos.');
  const cargos = []; for (const c of b.cargos) { const id = txt(c?.id, 40).toLowerCase(); if (!ID.test(id) || cargos.some(x => x.id === id)) continue;
    cargos.push({ id, nome: txt(c.nome, 40) || 'Cargo', cor: cor(c.cor), desc: txt(c.desc, 160), ...(c.selo ? { selo: true } : {}), ...(/^#[0-9a-f]{6}$/i.test(c.seloBorda || '') ? { seloBorda: c.seloBorda.toLowerCase() } : {}), ...(/^#[0-9a-f]{6}$/i.test(c.seloFundo || '') ? { seloFundo: c.seloFundo.toLowerCase() } : {}), ...(Number.isFinite(+c.seloAlfa) && c.seloAlfa !== '' && c.seloAlfa != null ? { seloAlfa: Math.max(0, Math.min(1, +c.seloAlfa)) } : {}), sem: { programas: lista(c.sem?.programas, ID, 60), funcoes: lista(c.sem?.funcoes, FN, 600) } }); }
  if (!cargos.some(c => c.id === 'equipe')) cargos.unshift(PERM_PADRAO().cargos[0]);
  { const a = cargos.find(c => c.id === 'adm'); if (a) { a.sem = { programas: [], funcoes: [] }; } else comAdm({ cargos }); } // o cargo ADM sempre existe e nunca tira nada
  const pastas = []; for (const p of (Array.isArray(b.pastas) ? b.pastas : []).slice(0, 100)) { const id = txt(p?.id, 40).toLowerCase(); if (ID.test(id) && !pastas.some(x => x.id === id)) pastas.push({ id, nome: txt(p.nome, 40) || 'Pasta' }); }
  const pessoas = {}; let n = 0;
  for (const [id, p] of Object.entries(b.pessoas && typeof b.pessoas === 'object' ? b.pessoas : {})) { if (!PID.test(id) || ++n > 2000) continue;
    const cs = lista(p?.cargos, ID, 10).filter(c => cargos.some(x => x.id === c)), pasta = pastas.some(x => x.id === p?.pasta) ? p.pasta : null;
    if (cs.length || pasta) pessoas[id] = { cargos: cs, pasta }; } // sem cargo e sem pasta = não precisa guardar
  const padrao = cargos.some(c => c.id === b.padrao) ? b.padrao : 'equipe';
  return { v: 1, cargos, pessoas, pastas, padrao, em: new Date().toISOString(), por: porId }; // por = id da pessoa (sem e-mail)
}
// TIPO DE UM ÁUDIO PELO CONTEÚDO (assinatura dos primeiros bytes) — usado pelos Preparativos e pelo link de dublagem
function tipoAudio(buf) { const u = new Uint8Array(buf, 0, Math.min(16, buf.byteLength)), s = (a, b) => String.fromCharCode(...u.slice(a, b));
  if (u[0] === 0x1a && u[1] === 0x45 && u[2] === 0xdf && u[3] === 0xa3) return { ext: 'webm', mime: 'audio/webm' };
  if (s(0, 4) === 'OggS') return { ext: 'ogg', mime: 'audio/ogg' };
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' };
  if (s(4, 8) === 'ftyp') return { ext: 'm4a', mime: 'audio/mp4' };
  if (s(0, 3) === 'ID3' || (u[0] === 0xff && (u[1] & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg' };
  return null; }
// ===================== LINK DE DUBLAGEM (Preparativos, pedido da dona 06/11/2026) =====================
// A página pública é a /dublar/ do PORTEIRO (sem login). O porteiro repassa /dublar/api/{ver,enviar,terminar} para cá pela LIGAÇÃO
// DIRETA (Service Binding TURMA): pedido que vem da internet (tem req.cf) é recusado, então esta rota não fica exposta e não usa CORS.
// O token (32 bytes aleatórios, base64url) vem no cabeçalho x-dub-token; aqui só fica o HASH (SHA-256). Ele vale só para AQUELE roteiro
// e AQUELAS falas: lê o texto delas e grava o áudio delas; a chave do arquivo é montada aqui. Validade, desligar, "terminei" (só leitura),
// limite de tamanho (20 MB), tipo pelo conteúdo, envios por fala/link e pedidos por minuto. Os áudios ficam "aguardando aprovação".
//   dublar-links/<hash> = id do roteiro · preparativos/<id>/dublar.json = { links: { <hash>: {...} }, pend: [ ... ] } · áudios em preparativos/<id>/dub/
const DUB_RL = new Map(), DUB_RUIM = new Map(); // DUB_RUIM: hashes inválidos vistos há pouco (10 min) // pedidos por minuto (na memória do servidor): por IP e por link
const hashTok = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('dublar:' + t)))].map(x => x.toString(16).padStart(2, '0')).join('');
// LINK VISÍVEL DE NOVO (pedido da dona): o token também fica CIFRADO (AES-GCM) com uma chave só do servidor (dublar-chave, fora das
// rotas da equipe; criada na primeira vez). Só quem pode criar links (preparativos.links) pede para ver de novo (ação dublar/op ver).
const b64uC = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), deB64C = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - String(s).length % 4) % 4)), c => c.charCodeAt(0));
async function chaveDub(env) { let k = await env.EQUIPE.get('dublar-chave'); if (!/^[A-Za-z0-9_-]{43}$/.test(k || '')) { k = b64uC(crypto.getRandomValues(new Uint8Array(32))); await env.EQUIPE.put('dublar-chave', k, { metadata: { tipo: 'text/plain', tam: 43, mod: Date.now() } }); }
  return crypto.subtle.importKey('raw', deB64C(k), 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function cifraDub(env, tok) { const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chaveDub(env), new TextEncoder().encode(tok))); return b64uC(iv) + '.' + b64uC(ct); }
async function decifraDub(env, c) { const [iv, ct] = String(c || '').split('.'); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64C(iv) }, await chaveDub(env), deB64C(ct))); }
async function leDub(env, id) { try { const o = JSON.parse((await env.EQUIPE.get(`preparativos/${id}/dublar.json`)) || '{}') || {}; return { links: o.links && typeof o.links === 'object' && !Array.isArray(o.links) ? o.links : {}, pend: Array.isArray(o.pend) ? o.pend : [] }; } catch { return { links: {}, pend: [] }; } }
async function gravaDub(env, id, d) { const t = JSON.stringify(d); await env.EQUIPE.put(`preparativos/${id}/dublar.json`, t, { metadata: { tipo: 'application/json', tam: t.length, mod: Date.now(), em: new Date().toISOString() } }); }
// texto que veio de fora: sem HTML/script, sem controles e sem e-mails
const txtLimpo = (v, n) => { let x = String(v ?? ''); try { x = decodeURIComponent(x); } catch { } return x.normalize('NFC').replace(/[\u0000-\u001f\u007f<>"'`\\{}]/g, '').replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '').replace(/\s+/g, ' ').trim().slice(0, n); };
function dubRl(chave, max) { const agora = Date.now(), l = (DUB_RL.get(chave) || []).filter(t => agora - t < 60e3); if (l.length >= max) return false; l.push(agora); DUB_RL.set(chave, l); if (DUB_RL.size > 5000) DUB_RL.clear(); return true; }
async function dublar(req, env, p) {
  const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  const sai = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: H }), erro = (m, st) => sai({ error: { message: m } }, st);
  if (req.cf) return erro('Abra o link pelo endereço do Estúdio.', 403); // só pela ligação direta do porteiro
  if (!env.EQUIPE) return erro('A nuvem está indisponível agora.', 503);
  if (!dubRl('ip:' + String(req.headers.get('x-dub-ip') || '?').slice(0, 64), 60)) return erro('Muitos pedidos. Espere um minuto.', 429);
  const tok = req.headers.get('x-dub-token') || ''; if (!/^[A-Za-z0-9_-]{43}$/.test(tok)) return erro('Link inválido.', 404);
  // link que já se mostrou inválido há pouco: responde sem ler a nuvem de novo (pedidos repetidos com token inventado não gastam leituras)
  const hs = await hashTok(tok); if ((DUB_RUIM.get(hs) || 0) > Date.now()) return erro('Link inválido ou desligado.', 404);
  const id = await env.EQUIPE.get('dublar-links/' + hs); if (!id || !/^[A-Za-z0-9_-]{2,40}$/.test(id)) { if (DUB_RUIM.size > 5000) DUB_RUIM.clear(); DUB_RUIM.set(hs, Date.now() + 10 * 60e3); return erro('Link inválido ou desligado.', 404); }
  if (!dubRl('lk:' + hs, 40)) return erro('Muitos pedidos. Espere um minuto.', 429);
  const D = await leDub(env, id), L = D.links[hs]; if (!L) return erro('Link inválido ou desligado.', 404);
  if (L.revogado || L.terminado || (L.expira && Date.now() > +L.expira)) { delete D.links[hs]; try { await env.EQUIPE.delete('dublar-links/' + hs); } catch { } await gravaDub(env, id, D).catch(() => { });
    return erro(L.terminado ? 'Você já terminou este link. Obrigado!' : 'Este link venceu ou foi encerrado. Peça um novo para quem mandou.', 410); }
  let P = null; try { P = JSON.parse((await env.EQUIPE.get(`preparativos/${id}/prep.json`)) || 'null'); } catch { } if (!P || !Array.isArray(P.partes)) return erro('Este roteiro não existe mais.', 410);
  const todas = P.partes.flatMap(pt => (pt.falas || []).map(f => ({ ...f, parte: pt.nome }))), minhas = new Set(Array.isArray(L.falas) ? L.falas : []);
  // quem grava: conta do Estúdio (o PORTEIRO conferiu a sessão e manda nome + código) ou o nome digitado (marcado "sem conta")
  const quem = () => { const u = String(req.headers.get('x-porteiro-id') || ''), n = txtLimpo(req.headers.get('x-porteiro-nome'), 40); if (n && /^u[0-9a-f]{16}$/.test(u)) return { nome: n, id: u, conta: true };
    const d = txtLimpo(req.headers.get('x-dub-nome'), 40); return d ? { nome: d, conta: false } : null; };
  if (p === '/dublar/ver' && req.method === 'GET') {
    const out = []; todas.forEach((f, i) => { if (!minhas.has(f.id)) return; const a = todas[i - 1];
      const juntos = Array.isArray(f.personagens) && f.personagens.length > 1 ? f.personagens.map(n => txtLimpo(n, 40)) : null, kd = n => n.toLocaleLowerCase('pt-BR');
      out.push({ id: f.id, personagem: txtLimpo(f.personagem, 40), ...(L.de && juntos ? { voce: juntos.find(n => kd(n) === L.de) || '' } : {}),
        ...(juntos ? { juntoCom: juntos.filter(n => kd(n) !== L.de).map(n => ({ nome: n, k: kd(n), tem: !!f.audios?.[kd(n)]?.audio })) } : {}), texto: String(f.texto || '').slice(0, 2000), nota: String(f.nota || '').slice(0, 300), parte: String(f.parte || '').slice(0, 80), antes: a ? { personagem: txtLimpo(a.personagem, 40), texto: String(a.texto || '').slice(0, 160) } : null }); });
    const enviadas = {}; for (const x of D.pend) if (x.link === hs) enviadas[x.fala] = { em: x.em, dur: x.dur };
    return sai({ roteiro: txtLimpo(P.nome, 80), rotulo: txtLimpo(L.rotulo, 80), falas: out, enviadas, expira: L.expira ? +L.expira : null, unico: !!L.unico, quem: quem(), maxMb: 20, maxSeg: 120 });
  }
  if (p === '/dublar/enviar' && req.method === 'POST') {
    const q = new URL(req.url).searchParams, fala = String(q.get('fala') || '');
    if (!minhas.has(fala) || !todas.some(f => f.id === fala)) return erro('Esta fala não é deste link.', 403);
    const qq = quem(); if (!qq) return erro('Escreva o seu nome antes de enviar.', 400);
    const n = +(L.envios?.[fala] || 0); if (n >= 10) return erro('Esta fala já foi enviada vezes demais por este link.', 429);
    if ((+L.total || 0) >= Math.min(400, minhas.size * 6)) return erro('Este link chegou no limite de envios.', 429);
    if ((+req.headers.get('content-length') || 0) > 20 * 1048576) return erro('Arquivo maior que 20 MB.', 413);
    const buf = await req.arrayBuffer(); if (!buf.byteLength) return erro('Arquivo vazio.', 400); if (buf.byteLength > 20 * 1048576) return erro('Arquivo maior que 20 MB.', 413);
    const tipo = tipoAudio(buf); if (!tipo) return erro('Esse arquivo não é um áudio aceito (mp3, wav, ogg, m4a ou webm).', 415);
    if ((await usadoEquipe(env, buf.byteLength)) + buf.byteLength > limiteEquipe(env)) return erro('O espaço da equipe está cheio. Avise quem mandou o link.', 507);
    const k = `preparativos/${id}/dub/${fala}-${Date.now().toString(36)}.${tipo.ext}`; // a chave é montada AQUI (nunca vem de fora)
    await env.EQUIPE.put(k, buf, { metadata: { tipo: tipo.mime, tam: buf.byteLength, mod: Date.now(), por: 'link', em: new Date().toISOString() } });
    const velhas = D.pend.filter(x => x.link === hs && x.fala === fala); // fica só a última desta fala por este link
    D.pend = D.pend.filter(x => !(x.link === hs && x.fala === fala)); const fx = todas.find(f => f.id === fala), deV = L.de && Array.isArray(fx?.personagens) && fx.personagens.some(n => txtLimpo(n, 40).toLocaleLowerCase('pt-BR') === L.de) ? L.de : undefined;
    D.pend.push({ k, fala, link: hs, ...(deV ? { de: deV } : {}), dur: Math.max(0, Math.min(3600, +q.get('dur') || 0)), quem: qq, em: Date.now() }); D.pend = D.pend.slice(-500);
    L.envios = { ...(L.envios || {}), [fala]: n + 1 }; L.total = (+L.total || 0) + 1; L.ultimo = Date.now(); L.quem = qq;
    await gravaDub(env, id, D); for (const v of velhas) { try { await env.EQUIPE.delete(v.k); } catch { } }
    return sai({ ok: true });
  }
  // TERMINEI: link de UMA fala ou de UM personagem morre na hora (apagado: não gasta mais nada). Link de vários personagens pode ter
  // mais de uma pessoa: quem encerra é o responsável, no Preparativos (ou a hora passa, se for de 1 hora). O enviado espera aprovação.
  // OUVIR a versão do OUTRO personagem de uma fala de vários: só falas do link, só outro membro da MESMA fala, só áudio já ACEITO
  if (p === '/dublar/ouvir' && req.method === 'GET') { const q = new URL(req.url).searchParams, fala = String(q.get('fala') || ''), de = txtLimpo(q.get('de'), 40).toLocaleLowerCase('pt-BR');
    const f = minhas.has(fala) ? todas.find(x => x.id === fala) : null; if (!f || !Array.isArray(f.personagens) || de === L.de || !f.personagens.some(n => txtLimpo(n, 40).toLocaleLowerCase('pt-BR') === de)) return erro('Não dá para ouvir isso por este link.', 403);
    const k = f.audios?.[de]?.audio; if (!k || !String(k).startsWith(`preparativos/${id}/`)) return erro('Esse personagem ainda não tem gravação aceita nesta fala.', 404);
    const r = await env.EQUIPE.getWithMetadata(k, { type: 'stream' }); if (!r?.value) return erro('Gravação não encontrada.', 404);
    return new Response(r.value, { status: 200, headers: { 'content-type': r.metadata?.tipo || 'audio/webm', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }); }
  if (p === '/dublar/terminar' && req.method === 'POST') { if (!L.unico) return sai({ ok: true, continua: true });
    delete D.links[hs]; await gravaDub(env, id, D); try { await env.EQUIPE.delete('dublar-links/' + hs); } catch { } return sai({ ok: true }); }
  return erro('Pedido desconhecido.', 404);
}
/* ---- CÉREBRO (pedido da dona, 09/11/2026): a memória de longo prazo compartilhada da equipe e das IAs ----
   Pastas e arquivos (texto, imagem, referência) em tabelas próprias do D1 "equipe". Ler: quem tem conta e o programa "cerebro". Gravar: só ADM (ehAdmin)
   ou IA com a chave x-cerebro-chave (segredo CEREBRO_CHAVE do Worker). Nada se apaga de verdade: cada mudança vira uma versão em cerebro_ver e "apagar" só marca
   a lixeira. A chave primária (id, ver) impede duas gravações em cima da mesma versão. Segredos são recusados e e-mails viram mascarados antes de gravar. */
const CB = { prep: false }, CB_MARCAS = new Set(['', 'guia', 'biblia', 'skill', 'memoria', 'regra', 'decisao', 'evitar', 'referencia', 'aprendizado']), CB_TIPOS = new Set(['pasta', 'texto', 'imagem', 'referencia']), CB_MAX = 800 * 1024, CB_IMG_MAX = 1900000;
const CB_EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-zA-Z]{2,24}\b/g;
const CB_SEGREDOS = [[/sk-ant-[\w-]{20,}/, 'chave da Anthropic'], [/\bsk-[A-Za-z0-9_-]{32,}/, 'chave de API'], [/AIza[\w-]{30,}/, 'chave do Google'], [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'token do GitHub'], [/github_pat_\w{20,}/, 'token do GitHub'], [/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}/, 'token de login'], [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'chave privada'], [/\bBearer\s+[\w.-]{40,}/, 'token de login'], [/\bAKIA[0-9A-Z]{16}\b/, 'chave da AWS']];
const cbSegredo = t => CB_SEGREDOS.find(([re]) => re.test(String(t || '')))?.[1] || null;
const cbMascara = e => { const [u, d = ''] = e.split('@'); return (u.length <= 2 ? u[0] + '•' : u.slice(0, 2) + '•'.repeat(Math.min(6, Math.max(3, u.length - 2)))) + '@' + d; };
const cbLimpa = (s, n) => String(s ?? '').replace(CB_EMAIL, m => /^(no-?reply|git)@/i.test(m) ? m : cbMascara(m)).slice(0, n);
const cbNome = s => cbLimpa(s, 120).replace(/[\/\\\r\n\t]+/g, '-').trim();
// a chave principal (segredo do Worker) ou a chave de um computador que um ADM autorizou (só o resumo dela fica no banco; a chave nunca sai de lá)
async function cbChaveOk(env, v) { if (!v) return false; const t = x => new TextEncoder().encode(x), h = await sha(t(v)); if (env.CEREBRO_CHAVE && h === await sha(t(env.CEREBRO_CHAVE))) return true; if (!env.EQUIPE_DB) return false; try { await cbPrepara(env.EQUIPE_DB); return !!(await env.EQUIPE_DB.prepare('SELECT 1 AS ok FROM cerebro_chave WHERE h = ? AND revogada = 0').bind(h).first()); } catch { return false; } }
const cbNovoId = () => 'c' + Date.now().toString(36) + [...crypto.getRandomValues(new Uint8Array(5))].map(x => x.toString(16).padStart(2, '0')).join('');
async function cbPrepara(db) { if (CB.prep) return; await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS cerebro_no (id TEXT PRIMARY KEY, pai TEXT, tipo TEXT NOT NULL, nome TEXT NOT NULL, marca TEXT, resumo TEXT, corpo TEXT, url TEXT, img TEXT, ver INTEGER NOT NULL, em INTEGER NOT NULL, por TEXT, ia TEXT, pedido TEXT, motivo TEXT, apagado INTEGER NOT NULL DEFAULT 0)'),
  db.prepare('CREATE INDEX IF NOT EXISTS cerebro_no_pai ON cerebro_no (pai, nome)'), db.prepare('CREATE INDEX IF NOT EXISTS cerebro_no_marca ON cerebro_no (marca)'),
  db.prepare('CREATE TABLE IF NOT EXISTS cerebro_ver (id TEXT NOT NULL, ver INTEGER NOT NULL, acao TEXT, nome TEXT, tipo TEXT, marca TEXT, snap TEXT NOT NULL, em INTEGER NOT NULL, por TEXT, ia TEXT, pedido TEXT, motivo TEXT, PRIMARY KEY (id, ver))'),
  db.prepare('CREATE INDEX IF NOT EXISTS cerebro_ver_em ON cerebro_ver (em)'),
  db.prepare('CREATE TABLE IF NOT EXISTS cerebro_img (h TEXT PRIMARY KEY, tipo TEXT, b64 TEXT NOT NULL, tam INTEGER, em INTEGER)'),
  db.prepare('CREATE TABLE IF NOT EXISTS cerebro_ped (id TEXT PRIMARY KEY, tipo TEXT, texto TEXT NOT NULL, alvo TEXT, por TEXT, cod TEXT, em INTEGER NOT NULL, estado TEXT NOT NULL, feito_por TEXT, feito_em INTEGER, nota TEXT)'),
  db.prepare('CREATE TABLE IF NOT EXISTS cerebro_chave (h TEXT PRIMARY KEY, nome TEXT, em INTEGER, por TEXT, revogada INTEGER NOT NULL DEFAULT 0)'),
  db.prepare('CREATE INDEX IF NOT EXISTS cerebro_ped_est ON cerebro_ped (estado, em)'), db.prepare('CREATE INDEX IF NOT EXISTS cerebro_ped_cod ON cerebro_ped (cod, em)'),
]); CB.prep = true; }
// devolve os dois comandos da gravação: a versão primeiro (se outra pessoa gravou no meio, a chave (id, ver) repete e a transação inteira falha)
function cbGrava(db, n, antes, acao, a, motivo) {
  const ver = (antes?.ver || 0) + 1, em = Date.now(), snap = JSON.stringify({ pai: n.pai ?? null, tipo: n.tipo, nome: n.nome, marca: n.marca || null, resumo: n.resumo || null, corpo: n.corpo ?? null, url: n.url || null, img: n.img || null, apagado: n.apagado ? 1 : 0 });
  return { ver, em, st: [
    db.prepare('INSERT INTO cerebro_ver (id, ver, acao, nome, tipo, marca, snap, em, por, ia, pedido, motivo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(n.id, ver, acao, n.nome, n.tipo, n.marca || null, snap, em, a.por, a.ia, a.pedido, motivo),
    db.prepare('INSERT OR REPLACE INTO cerebro_no (id, pai, tipo, nome, marca, resumo, corpo, url, img, ver, em, por, ia, pedido, motivo, apagado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(n.id, n.pai ?? null, n.tipo, n.nome, n.marca || null, n.resumo || null, n.corpo ?? null, n.url || null, n.img || null, ver, em, a.por, a.ia, a.pedido, motivo, n.apagado ? 1 : 0),
  ] };
}
async function cerebro(req, env, login, path, cors) {
  const nc = { ...cors, 'cache-control': 'no-store' }, ok = (o, s = 200) => json(o, s, nc), erro = (m, s = 400, type = 'cerebro') => json({ error: { type, message: m } }, s, nc), db = env.EQUIPE_DB;
  if (!db) return erro('O banco do Cérebro não está ligado neste servidor.', 503);
  const ia = !!login.ia, adm = ia || ehAdmin(env, login.email), rota = path.slice('/cerebro'.length) || '/', q = new URL(req.url).searchParams;
  if (!ia && !(await pode(env, login.email, 'cerebro'))) return erro('O seu cargo não inclui o Cérebro. Peça para um ADM liberar.', 403, 'permissao');
  await cbPrepara(db);
  const pega = id => db.prepare('SELECT * FROM cerebro_no WHERE id = ?').bind(id).first();
  const noNome = (pai, nome) => db.prepare('SELECT * FROM cerebro_no WHERE pai IS ? AND nome = ? AND apagado = 0').bind(pai, nome).first();
  const segs = c => String(c || '').split('/').map(cbNome).filter(Boolean).slice(0, 8);
  const peloCaminho = async c => { let pai = null, n = null; for (const s of segs(c)) { n = await noNome(pai, s); if (!n) return null; pai = n.id; } return n; };
  const COLS = 'id, pai, tipo, nome, marca, resumo, url, img, ver, em, por, ia, pedido, apagado, length(corpo) AS tam';
  if (req.method === 'GET') {
    if (rota === '/') { const { results } = await db.prepare(`SELECT ${COLS} FROM cerebro_no`).all(), todos = results || [], lix = new Set(todos.filter(x => x.apagado).map(x => x.id)), mapa = new Map(todos.map(x => [x.id, x]));
      const escondido = x => { for (let p = x.pai, i = 0; p && i < 20; p = mapa.get(p)?.pai, i++) if (lix.has(p)) return true; return false; };
      const novos = await db.prepare("SELECT count(*) AS n FROM cerebro_ped WHERE estado = 'novo'").first();
      return ok({ itens: todos.filter(x => !x.apagado && !escondido(x)), lixeira: adm ? todos.filter(x => x.apagado) : [], adm, ia, pedidosNovos: novos?.n || 0 }); }
    if (rota === '/comece') { const n = await peloCaminho('00 Comece aqui/Leia primeiro'), { results } = await db.prepare('SELECT nome FROM cerebro_no WHERE pai IS NULL AND apagado = 0 ORDER BY nome').all(), novos = await db.prepare("SELECT count(*) AS n FROM cerebro_ped WHERE estado = 'novo'").first();
      return ok({ texto: n?.corpo || '', pastas: (results || []).map(x => x.nome), pedidosNovos: novos?.n || 0 }); }
    if (rota === '/inicio') { const n = await peloCaminho('00 Comece aqui/Leia primeiro'), { results } = await db.prepare('SELECT id, pai, tipo, nome, marca, resumo, apagado FROM cerebro_no').all(), t = results || [], m = new Map(t.map(x => [x.id, x])), cam = x => { const o = []; for (let y = x, i = 0; y && i < 20; y = m.get(y.pai), i++) { if (y.apagado) return null; o.unshift(y.nome); } return o.join('/'); }, novos = await db.prepare("SELECT count(*) AS n FROM cerebro_ped WHERE estado = 'novo'").first();
      const lin = t.filter(x => x.tipo !== 'pasta').map(x => [cam(x), x]).filter(([c]) => c).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true })).map(([c, x]) => `- ${c}${x.marca ? ' (' + x.marca + ')' : ''}${x.resumo ? ': ' + x.resumo : ''}`);
      return new Response(`${n?.corpo || ''}\n\n# Índice (${lin.length} arquivos, ${novos?.n || 0} pedido(s) esperando)\n\nPara abrir: GET /cerebro/item?caminho=<Pasta/Arquivo>\n\n${lin.join('\n')}\n`, { headers: { ...nc, 'content-type': 'text/plain; charset=utf-8' } }); }
    if (rota === '/chaves') { if (ia || !adm) return erro('Só um ADM, pelo site, vê os acessos das IAs.', 403, 'adm'); const { results } = await db.prepare('SELECT h, nome, em, por, revogada FROM cerebro_chave ORDER BY em DESC LIMIT 100').all(); return ok({ itens: results || [] }); }
    if (rota === '/item') { const n = q.get('id') ? await pega(q.get('id')) : await peloCaminho(q.get('caminho')); if (!n || (n.apagado && !adm)) return erro('Esse arquivo não existe no Cérebro.', 404, 'nao_achei');
      const { results } = await db.prepare('SELECT ver, acao, em, por, ia, pedido, motivo FROM cerebro_ver WHERE id = ? ORDER BY ver DESC LIMIT 60').bind(n.id).all(); return ok({ item: n, versoes: results || [], adm }); }
    if (rota === '/versao') { const v = await db.prepare('SELECT * FROM cerebro_ver WHERE id = ? AND ver = ?').bind(q.get('id') || '', +q.get('ver') || 0).first(); if (!v) return erro('Versão não encontrada.', 404, 'nao_achei'); return ok({ ver: v.ver, acao: v.acao, em: v.em, por: v.por, ia: v.ia, pedido: v.pedido, motivo: v.motivo, ...JSON.parse(v.snap) }); }
    if (rota === '/registro') { const lim = Math.min(+q.get('limite') || 50, 200), antes = +q.get('antes') || 9e15; const { results } = await db.prepare('SELECT id, ver, acao, nome, tipo, marca, em, por, ia, pedido, motivo FROM cerebro_ver WHERE em < ? ORDER BY em DESC LIMIT ?').bind(antes, lim).all(); return ok({ itens: results || [] }); }
    if (rota === '/marca') { const m = String(q.get('m') || ''); if (!CB_MARCAS.has(m) || !m) return erro('Marca desconhecida.'); const { results } = await db.prepare('SELECT id, pai, tipo, nome, marca, resumo, url, img, ver, em, por, ia, pedido, substr(corpo, 1, 6000) AS corpo FROM cerebro_no WHERE marca = ? AND apagado = 0 ORDER BY em DESC LIMIT 200').bind(m).all(); return ok({ itens: results || [] }); }
    if (rota === '/buscar') { const t = String(q.get('q') || '').trim().slice(0, 80); if (t.length < 2) return ok({ itens: [] }); const l = '%' + t.replace(/[\\%_]/g, '\\$&') + '%'; const { results } = await db.prepare("SELECT id, pai, tipo, nome, marca, resumo, ver, em, corpo FROM cerebro_no WHERE apagado = 0 AND (nome LIKE ?1 ESCAPE '\\' OR resumo LIKE ?1 ESCAPE '\\' OR corpo LIKE ?1 ESCAPE '\\') LIMIT 40").bind(l).all(), low = t.toLowerCase();
      return ok({ itens: (results || []).map(({ corpo, ...x }) => { const i = String(corpo || '').toLowerCase().indexOf(low); return { ...x, trecho: i >= 0 ? String(corpo).slice(Math.max(0, i - 70), i + 150) : '' }; }) }); }
    if (rota === '/tudo') { if (!adm) return erro('Só ADM ou IA baixa o Cérebro inteiro.', 403, 'adm'); const { results } = await db.prepare('SELECT id, pai, tipo, nome, marca, resumo, corpo, url, img, ver, em, por, ia, pedido FROM cerebro_no WHERE apagado = 0').all(); return ok({ itens: results || [] }); }
    if (rota === '/img') { const v = await db.prepare('SELECT tipo, b64 FROM cerebro_img WHERE h = ?').bind(q.get('h') || '').first(); if (!v) return erro('Imagem não encontrada.', 404, 'nao_achei'); return ok(v); }
    if (rota === '/pedidos') { const so = q.get('estado') === 'novo', { results } = await db.prepare(so ? "SELECT * FROM cerebro_ped WHERE estado = 'novo' ORDER BY em DESC LIMIT 100" : 'SELECT * FROM cerebro_ped ORDER BY em DESC LIMIT 100').all(); return ok({ itens: (results || []).map(({ cod, ...x }) => x), adm }); }
    return erro('Pedido desconhecido.', 404);
  }
  if (req.method !== 'POST') return erro('Use GET ou POST.', 405);
  if (+(req.headers.get('content-length') || 0) > 4 * 1048576) return erro('Grande demais para o Cérebro.', 413);
  let b; try { b = await req.json(); } catch { return erro('O pedido veio com defeito.'); }
  const motivo = cbLimpa(b.motivo, 600) || null, secreto = [b.nome, b.corpo, b.resumo, b.url, b.motivo, b.texto, b.acrescentar, b.nota, b.pedidoPor].map(cbSegredo).find(Boolean);
  if (secreto) return erro(`Não gravei: o texto parece ter ${secreto}. Tire isso e mande de novo; segredo não entra no Cérebro.`, 400, 'segredo');
  const eu = ia ? null : (cbLimpa(login.nome, 80) || 'Alguém da equipe');
  if (rota === '/pedir') { const texto = cbLimpa(b.texto, 4000).trim(); if (texto.length < 3) return erro('Escreva o que é para aprender ou mudar.'); const tipo = ['aprender', 'evitar', 'corrigir', 'referencia'].includes(b.tipo) ? b.tipo : 'aprender';
    const por = ia ? cbLimpa(b.pedidoPor, 80) : eu; if (!por) return erro('Diga quem pediu (pedidoPor).'); const cod = ia ? 'ia' : (await semEmail({ por: login.email })).por;
    if (!adm) { const c = await db.prepare('SELECT count(*) AS n FROM cerebro_ped WHERE cod = ? AND em > ?').bind(cod, Date.now() - 864e5).first(); if ((c?.n || 0) >= 30) return erro('Muitos pedidos hoje. Tente amanhã.', 429); }
    const id = cbNovoId(); await db.prepare("INSERT INTO cerebro_ped (id, tipo, texto, alvo, por, cod, em, estado) VALUES (?, ?, ?, ?, ?, ?, ?, 'novo')").bind(id, tipo, texto, cbLimpa(b.alvo, 300) || null, por, cod, Date.now()).run(); return ok({ ok: true, id }); }
  if (!adm) return erro('Só ADMs e o Claude mudam o Cérebro. Use "Pedir para aprender" que o pedido fica registrado.', 403, 'adm');
  if (rota === '/chaves') { if (ia) return erro('Uma IA não autoriza outra: quem faz isso é um ADM, pelo site.', 403, 'adm');
    if (b.acao === 'autorizar') { const h = String(b.codigo || '').trim().toLowerCase().replace(/^c-/, ''), nome = cbLimpa(b.nome, 80).trim(); if (!/^[0-9a-f]{64}$/.test(h)) return erro('Esse código não parece certo. Ele aparece quando a IA roda "cerebro.mjs entrar".'); if (!nome) return erro('Dê um nome para esse acesso.'); await db.prepare('INSERT OR REPLACE INTO cerebro_chave (h, nome, em, por, revogada) VALUES (?, ?, ?, ?, 0)').bind(h, nome, Date.now(), eu).run(); return ok({ ok: true }); }
    if (b.acao === 'revogar') { const r = await db.prepare('UPDATE cerebro_chave SET revogada = 1 WHERE h = ?').bind(String(b.h || '')).run(); return r.meta?.changes ? ok({ ok: true }) : erro('Acesso não encontrado.', 404, 'nao_achei'); }
    return erro('Ação desconhecida.'); }
  const a = ia ? { por: cbLimpa(b.ia, 80), ia: cbLimpa(b.ia, 80), pedido: cbLimpa(b.pedidoPor, 80) } : { por: eu, ia: null, pedido: cbLimpa(b.pedidoPor, 80) || eu };
  if (rota === '/pedido') { if (!['feito', 'recusado', 'novo'].includes(b.estado)) return erro('Estado desconhecido.'); const r = await db.prepare('UPDATE cerebro_ped SET estado = ?, feito_por = ?, feito_em = ?, nota = ? WHERE id = ?').bind(b.estado, a.por || 'IA', Date.now(), cbLimpa(b.nota, 600) || null, String(b.id || '')).run(); return r.meta?.changes ? ok({ ok: true }) : erro('Pedido não encontrado.', 404, 'nao_achei'); }
  if (ia && (!a.ia || !a.pedido || !motivo)) return erro('A IA precisa mandar: ia (o nome dela), pedidoPor (quem pediu) e motivo (o que mudou e por quê).', 400, 'registro');
  const roda = async (st) => { try { await db.batch(st); return null; } catch (e) { if (/UNIQUE|constraint/i.test(String(e?.message || e))) return erro('Outra pessoa gravou esse arquivo agora mesmo. Abra de novo e refaça.', 409, 'conflito'); throw e; } };
  if (rota === '/salvar') {
    let n = b.id ? await pega(String(b.id)) : null, pai, nome = b.nome != null ? cbNome(b.nome) : null; const criar = [], s = b.caminho ? segs(b.caminho) : null;
    if (b.id && !n) return erro('Esse arquivo não existe no Cérebro.', 404, 'nao_achei');
    if (s) { if (!s.length) return erro('Caminho vazio.'); let p = null; for (const seg of s.slice(0, -1)) { let f = await noNome(p, seg); if (f && f.tipo !== 'pasta') return erro(`"${seg}" não é uma pasta.`); if (!f) { f = { id: cbNovoId(), pai: p, tipo: 'pasta', nome: seg }; criar.push(...cbGrava(db, f, null, 'criar', a, motivo).st); } p = f.id; }
      pai = p; nome = nome || s[s.length - 1]; n = n || await noNome(pai, s[s.length - 1]); }
    else pai = b.pai !== undefined ? (b.pai || null) : (n ? n.pai : null);
    if (pai && !criar.length) { const f = await pega(pai); if (!f || f.tipo !== 'pasta' || f.apagado) return erro('Essa pasta não existe.', 404, 'nao_achei'); }
    if (n && n.apagado) return erro('Esse arquivo está na lixeira. Restaure antes de mudar.', 409, 'lixeira');
    if (n && pai !== n.pai) for (let p = pai, i = 0; p && i < 20; i++) { if (p === n.id) return erro('Uma pasta não pode ficar dentro dela mesma.'); p = (await pega(p))?.pai; }
    const tipo = n ? n.tipo : String(b.tipo || 'texto'); if (!CB_TIPOS.has(tipo)) return erro('Tipo desconhecido.'); nome = nome || n?.nome; if (!nome) return erro('Dê um nome.');
    if (!n || nome !== n.nome || pai !== n.pai) { const irmao = criar.length ? null : await noNome(pai, nome); if (irmao && irmao.id !== n?.id) return erro(`Já existe "${nome}" nessa pasta.`, 409, 'mesmo_nome'); }
    if (n && !b.forcar && b.acrescentar == null && +b.base !== n.ver) return erro(b.base == null ? `Esse arquivo já existe (versão ${n.ver}). Leia antes e mande base=${n.ver}, para não apagar o que outra pessoa escreveu.` : `Esse arquivo mudou enquanto você mexia (agora está na versão ${n.ver}). Abra de novo para não perder o que a outra pessoa fez.`, 409, 'conflito');
    let corpo = b.corpo !== undefined ? cbLimpa(b.corpo, CB_MAX + 1) : n?.corpo ?? null; if (b.acrescentar != null) corpo = (corpo ? corpo.replace(/\s+$/, '') + '\n\n' : '') + cbLimpa(b.acrescentar, CB_MAX + 1);
    if (corpo && new TextEncoder().encode(corpo).length > CB_MAX) return erro('Texto grande demais (máximo 800 KB). Divida em mais de um arquivo.', 413);
    let url = b.url !== undefined ? String(b.url || '').slice(0, 2000) : n?.url || null; if (url && !/^https?:\/\//i.test(url)) return erro('O link precisa começar com http:// ou https://.');
    let img = n?.img || null; const st = [...criar];
    if (b.imagem) { const b64 = String(b.imagem.b64 || ''), it = String(b.imagem.tipo || ''); if (!/^image\/(png|jpeg|webp|gif)$/.test(it) || !/^[A-Za-z0-9+/=]+$/.test(b64)) return erro('Imagem inválida (use PNG, JPEG, WEBP ou GIF).'); if (b64.length > CB_IMG_MAX) return erro('Imagem grande demais (máximo ~1,4 MB).', 413);
      img = await sha(new TextEncoder().encode(b64)); st.push(db.prepare('INSERT OR IGNORE INTO cerebro_img (h, tipo, b64, tam, em) VALUES (?, ?, ?, ?, ?)').bind(img, it, b64, b64.length, Date.now())); }
    if (tipo === 'imagem' && !img) return erro('Falta a imagem.'); if (tipo === 'referencia' && !url && !corpo) return erro('A referência precisa de um link ou de um texto.');
    let marca = b.marca !== undefined ? String(b.marca || '') : n?.marca || ''; if (!CB_MARCAS.has(marca)) return erro('Marca desconhecida.'); if (tipo === 'referencia' && !marca) marca = 'referencia';
    const resumo = b.resumo !== undefined ? cbLimpa(b.resumo, 300) : n?.resumo || null, novo = { id: n?.id || cbNovoId(), pai, tipo, nome, marca, resumo, corpo, url, img, apagado: 0 };
    if (n && pai === n.pai && nome === n.nome && (n.marca || '') === marca && (n.resumo || '') === (resumo || '') && (n.corpo ?? null) === corpo && (n.url || null) === (url || null) && (n.img || null) === img) return ok({ ok: true, igual: true, id: n.id, ver: n.ver });
    const g = cbGrava(db, novo, n, n ? 'editar' : 'criar', a, motivo); const e0 = await roda([...st, ...g.st]); if (e0) return e0; return ok({ ok: true, id: novo.id, ver: g.ver, em: g.em });
  }
  if (rota === '/lixeira' || rota === '/restaurar') { const n = await pega(String(b.id || '')); if (!n) return erro('Esse arquivo não existe no Cérebro.', 404, 'nao_achei');
    let novo = { ...n }, acao = 'lixeira';
    if (rota === '/lixeira') { if (n.apagado) return ok({ ok: true, igual: true }); novo.apagado = 1; }
    else { acao = 'restaurar'; if (b.ver != null) { const v = await db.prepare('SELECT snap FROM cerebro_ver WHERE id = ? AND ver = ?').bind(n.id, +b.ver).first(); if (!v) return erro('Versão não encontrada.', 404, 'nao_achei'); novo = { ...novo, ...JSON.parse(v.snap), id: n.id }; } novo.apagado = 0;
      if (novo.pai) { const f = await pega(novo.pai); if (!f || f.apagado) return erro('A pasta dele está na lixeira. Restaure a pasta primeiro.', 409, 'lixeira'); }
      const irmao = await noNome(novo.pai ?? null, novo.nome); if (irmao && irmao.id !== n.id) return erro(`Já existe "${novo.nome}" nessa pasta. Renomeie antes de restaurar.`, 409, 'mesmo_nome'); }
    const g = cbGrava(db, novo, n, acao, a, motivo || (acao === 'restaurar' ? (b.ver != null ? 'Voltou para a versão ' + b.ver : 'Tirou da lixeira') : 'Mandou para a lixeira')); const e0 = await roda(g.st); if (e0) return e0; return ok({ ok: true, ver: g.ver }); }
  return erro('Pedido desconhecido.', 404);
}
const LISTA_ANIM = new Map(); // 'animacoes' | 'jester' → { t, j }
export default {
  async fetch(req, env, ctx) {
    if (env.PORTA === '1') {
      const daPrincipal = new URL(req.url).searchParams.has('_pr'); // pedido que veio de uma página da principal (DIVIDIR): sem trocar endereços
      if (env.D1_CONTA && env.D1_ID && env.D1_TOKEN) { // PONTE: os mesmos dados da principal, pela API da Cloudflare
        const e2 = { ...env, EQUIPE: principalFora(), EQUIPE_DB: d1Rest(env.D1_CONTA, env.D1_ID, env.D1_TOKEN), _porta: true, _ponte: true };
        if (await d1Ligado(e2)) { const r = await this.fetch2(req, e2, ctx); return daPrincipal ? r : comTrocas(e2, r); }
      }
      limiteAte = Date.now() + 864e5; env = { ...env, EQUIPE: principalFora(), _porta: true }; const r = await this.fetch2(req, env, ctx); return daPrincipal ? r : comTrocas(env, r); }
    return this.fetch2(req, env, ctx);
  },
  async fetch2(req, env, ctx) {
    if (new URL(req.url).pathname.startsWith('/robo/')) { try { return await robo(req, env); } catch (e) { return new Response(JSON.stringify({ erro: String(e?.message || e).slice(0, 200) }), { status: ehLimite(e) ? 503 : 500, headers: { 'content-type': 'application/json' } }); } }
    // a nuvem principal no D1 (depois de ligada): o resto do servidor continua falando "KV" com o adaptador
    if (await d1Ligado(env)) { CASAS.t = d1Est.arq ? arquivosDe(env, 't') : null; env = { ...env, EQUIPE: kvD1(env.EQUIPE_DB, arquivosDe(env)), _kvAntigo: env.EQUIPE, _d1: true }; }
    const flag = { reserva: false }; let r;
    try { r = await this.atende(req, env, ctx, flag); } catch (e) { console.log('erro:', String(e?.message || e).slice(0, 200)); return avisoLimite(req, e); }
    if (flag.reserva && !emLimite()) { // a principal JÁ VOLTOU e o que sobrou na reserva está voltando para ela: o site tira o aviso
      const h = new Headers(r.headers); h.set('x-nuvem', 'voltando'); h.set('access-control-expose-headers', 'x-nuvem, x-mod'); r = new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
    } else if (flag.reserva || emLimite()) { // o site mostra "usando a nuvem reserva" (ou só o aviso do limite)
      const h = new Headers(r.headers); h.set('x-nuvem', flag.reserva ? (Date.now() < tercAte ? 'terciaria' : 'reserva') : 'limite'); h.set('x-nuvem-volta', new Date(fimDoDia()).toISOString()); if (flag.copia) h.set('x-nuvem-copia', '1'); if (flag.parcial) h.set('x-nuvem-parcial', '1'); h.set('access-control-expose-headers', 'x-nuvem, x-nuvem-volta, x-nuvem-copia, x-nuvem-parcial, x-mod');
      r = new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
    }
    if (planoPausado()) { try { const h = new Headers(r.headers); h.set('x-plano-pausado', '1'); const ex = h.get('access-control-expose-headers'); h.set('access-control-expose-headers', ex ? ex + ', x-plano-pausado' : 'x-plano-pausado'); r = new Response(r.body, { status: r.status, statusText: r.statusText, headers: h }); } catch { } }
    if (DIVIDE.at) { try { const h = new Headers(r.headers); h.set('x-divide', String(DIVIDE.p)); const ex = h.get('access-control-expose-headers'); h.set('access-control-expose-headers', ex ? ex + ', x-divide' : 'x-divide, x-mod'); r = new Response(r.body, { status: r.status, statusText: r.statusText, headers: h }); } catch { } }
    return r;
  },
  async atende(req, env, ctx, flag = {}) {
    const auth0 = req.headers.get('authorization') || '', p00 = new URL(req.url).pathname;
    const R = env.EQUIPE && p00 !== '/confere' && /^Bearer \S{20,}$/.test(auth0) ? reservaDe(env, auth0) : null, bg = pr => ctx?.waitUntil ? ctx.waitUntil(pr) : null;
    if (env.EQUIPE && !env._kvLista) env = { ...env, EQUIPE: kvComLista(env.EQUIPE, new URL(req.url).searchParams.get('novo') === '1', R, flag, bg), _kvLista: true, _base: env.EQUIPE };
    if (p00 === '/dublar/ver' || p00 === '/dublar/enviar' || p00 === '/dublar/terminar' || p00 === '/dublar/ouvir') return dublar(req, env, p00);
    const origin = req.headers.get('origin') || '';
    const origens = (env.ORIGENS || '*').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
    const liberado = origens.includes('*') || origens.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin); // seu PC: sempre aceito (ainda exige login com e-mail liberado)
    const cors = { 'access-control-allow-origin': liberado ? (origin || '*') : 'null', 'access-control-allow-headers': 'content-type,authorization', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'access-control-max-age': '86400', vary: 'origin' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path0 = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    // CÉREBRO: as IAs (sem navegador) entram com a chave x-cerebro-chave, que só vale nas rotas /cerebro
    const ehCerebro = path0 === '/cerebro' || path0.startsWith('/cerebro/'), chaveCb = ehCerebro ? req.headers.get('x-cerebro-chave') : null;
    if (chaveCb && !(await cbChaveOk(env, chaveCb))) return json({ error: { type: 'chave', message: 'Chave do Cérebro errada.' } }, 401, cors);
    // aberto direto na barra do navegador (sem "origin"): mostra que está funcionando e o uso
    if (!origin && req.method === 'GET' && (path0 === '/' || path0 === '/uso')) return json({ ok: 'Servidor da IA da turma funcionando', login: env.FIREBASE_PROJECT_ID ? 'ligado (' + env.FIREBASE_PROJECT_ID + ')' : 'DESLIGADO — falta FIREBASE_PROJECT_ID', emails: (env.EMAILS_PERMITIDOS || '').split(',').filter(x => x.trim()).length, app: env.APP_KEY ? 'protegido (APP_KEY ok)' : 'falta APP_KEY', chave_ia: env.ANTHROPIC_API_KEY ? 'ok' : 'falta ANTHROPIC_API_KEY' }, 200, cors);
    else if (!liberado && !chaveCb) return json({ error: { type: 'origem', message: 'Este site não está liberado no servidor da turma.' } }, 403, cors);
    if (!env.ANTHROPIC_API_KEY && !env._porta) return json({ error: { type: 'config', message: 'O servidor está sem a chave (ANTHROPIC_API_KEY).' } }, 500, cors);

    // NÍVEIS DE ACESSO pelo porteiro (GET /permissoes de qualquer programa, só com a sessão do porteiro): o porteiro fala por
    // dentro da Cloudflare (Service Binding TURMA) e manda o e-mail da sessão. Pedido da internet SEMPRE tem req.cf; pela ligação
    // direta não tem — então este caminho só vale pela ligação. Mesmo assim o e-mail precisa estar na lista de quem entra.
    const peloPorteiro = p00 === '/permissoes' && req.method === 'GET' && !req.cf && req.headers.get('x-porteiro-email');
    const login = chaveCb ? { ok: true, ia: true } : peloPorteiro ? await (async e => { e = String(e).trim().toLowerCase(); return EMAIL_OK.test(e) && (baseFixa(env).includes(e) || (await extrasAcesso(env)).some(x => x.email === e)) ? { ok: true, email: e } : { ok: false }; })(peloPorteiro) : await confereLogin(req, env);
    if (!login.ok) return json({ error: { type: 'login', message: login.motivo || 'Entre com sua conta Google pelo menu do Estúdio.' } }, 401, cors);
    await planoEstado(env);
    if (path0 === '/plano' && req.method === 'GET') { const u = PLANO.uso; return json({ pausado: planoPausado(), adm: ehAdmin(env, login.email), ciclo: u?.ciclo || null, fim: u?.fim || null, em: u?.em || null, pct: u ? Math.round(planoPct(u) * 1000) / 10 : null, itens: u ? Object.values(u.itens).filter(x => x.lim && x.v / x.lim >= 0.5).map(x => ({ nome: x.nome, v: x.v, lim: x.lim })) : [] }, 200, { ...cors, 'cache-control': 'no-store' }); }
    if (path0 === '/plano/aceitar' && req.method === 'POST') { if (!ehAdmin(env, login.email)) return json({ error: { type: 'adm', message: 'Só um ADM pode liberar.' } }, 403, cors); const q0 = new URL(req.url).searchParams; if (q0.get('teste') === '1') return json({ ok: true, teste: true }, 200, cors); const u = PLANO.uso; if (!u) return json({ error: { message: 'Sem medida do plano.' } }, 409, cors);
      const v = { ciclo: u.ciclo, em: Date.now(), por: login.email }; await env.EQUIPE_DB.prepare("INSERT OR REPLACE INTO cfg (k, v) VALUES ('plano-aceite', ?)").bind(JSON.stringify(v)).run(); PLANO.ac = v; PLANO.at = 0; return json({ ok: true }, 200, { ...cors, 'cache-control': 'no-store' }); }
    if ((planoPausado() || (new URL(req.url).searchParams.get('plano_teste') === '1' && ehAdmin(env, login.email))) && !PLANO_LIVRES.has(path0)) return json({ error: { type: 'plano_pausado', message: 'O Estúdio está pausado: o uso incluído no plano deste mês chegou ao fim. Um ADM precisa confirmar para continuar. O que você fez continua guardado neste computador.' } }, 423, { ...cors, 'x-plano-pausado': '1', 'access-control-expose-headers': 'x-plano-pausado', 'cache-control': 'no-store' });
    if (ehCerebro) return cerebro(req, env, login, path0, cors); // depois da trava do plano: pausado, o Cérebro também responde 423
    if (R && login.email && !env._porta) bg(migra(env._base, R).catch(() => { })); // depois do limite: devolve aos poucos o que ficou na reserva
    if (R && login.email && (!env._porta || env._ponte)) bg(confereCheio(env.EQUIPE, R).catch(() => { })); // a ponte lê o mesmo banco: poupa também
    if (R && login.email) bg(confereDivide(R)); // DIVIDIR os pedidos com a outra porta quando a principal estiver gastando muito // perto do limite (85%): poupa a principal até as 21h
    // RESUMO para o círculo da nuvem quando a principal não deixa listar (limite do dia): o espaço medido pela Cloudflare
    // (Action "Uso da nuvem") + o que está na reserva agora. Qualquer conta da equipe; sem e-mails (semEmail)
    if (new URL(req.url).pathname === '/nuvem-resumo') {
      const R3 = reservaDe(env, auth0), out = { bytes: null, em: null, reserva: { n: 0, bytes: 0, itens: [] }, volta: new Date(fimDoDia()).toISOString() };
      if (R3) { const c = await R3.contaJa().catch(() => null), o = c?.contas?.principal; if (o?.bytes != null) { out.bytes = o.bytes; out.em = c.em; }
        try { if (await R3.ativa()) for (const it of (await R3.indice()).values()) { if (it.metadata?._del) continue; out.reserva.n++; out.reserva.bytes += +it.metadata?.tam || 0; if (out.reserva.itens.length < 300) out.reserva.itens.push(await semEmail({ k: it.name, ...(it.metadata || {}) })); } } catch { } }
      return json(out, 200, { ...cors, 'cache-control': 'no-store' });
    }
    // USO DE HOJE para QUALQUER pessoa da equipe (botão da nuvem, pedido da dona, 05/11/2026): a SOMA das nuvens da equipe (principal,
    // reserva e terciária), que trabalham como uma só. Só números (sem e-mails nem nomes de conta); a medida é da Action "Uso da nuvem".
    if (new URL(req.url).pathname === '/adm-mover-principal' && req.method === 'POST') { // só ADM, só na principal (o moverParaPrincipal explica)
      if (!ehAdmin(env, login.email) || env._porta || !env._d1) return json({ error: { message: 'Só ADM, na principal.' } }, 403, cors);
      const q = new URL(req.url).searchParams, de = q.get('de'); if (de !== 'a' && de !== 't') return json({ error: { message: 'de = a ou t' } }, 400, cors);
      return json(await moverParaPrincipal(env, de, Math.min(Math.max(+q.get('n') || 3, 1), 20)), 200, { ...cors, 'cache-control': 'no-store' });
    }
    if (new URL(req.url).pathname === '/nuvem-hoje') {
      const R4 = reservaDe(env, auth0), c = R4 ? await R4.contaJa().catch(() => null) : null, L = c?.limites || {}, hoje = new Date().toISOString().slice(0, 10);
      const pu = PLANO.uso?.itens; if (pu && Date.now() - PLANO.uso.em < 864e5) return json({ em: PLANO.uso.em, mes: true, gravacoes: { v: pu.gravacoes.v, lim: pu.gravacoes.lim }, leituras: { v: pu.leituras.v, lim: pu.leituras.lim }, pedidos: { v: pu.pedidos.v, lim: pu.pedidos.lim } }, 200, { ...cors, 'cache-control': 'no-store' }); // medida do Vigia do plano
      const pm = c?.contas?.principal?.mes; if (pm) return json({ em: c.em, mes: true, gravacoes: { v: pm.gravadas, lim: L.pagoGravacoes || 5e7 }, leituras: { v: pm.lidas, lim: L.pagoLeituras || 25e9 }, pedidos: { v: pm.pedidos, lim: L.pagoPedidos || 1e7 } }, 200, { ...cors, 'cache-control': 'no-store' }); // plano pago: só a principal, no mês
      const ps = c && c.dia === hoje ? ['principal', 'nova', 'terc'].map(k => c.contas?.[k]).filter(o => o && !o.erro && o.d1) : [], n = ps.length, soma = f => ps.reduce((t, o) => t + (+f(o) || 0), 0);
      const par = (v, lim) => ({ v, lim: n * lim });
      return json(n ? { em: c.em, gravacoes: par(soma(o => o.d1.write), L.d1Write || 1e5), leituras: par(soma(o => o.d1.read), L.d1Read || 5e6), pedidos: par(soma(o => o.workers), L.workers || 1e5), espaco: par(soma(o => o.d1bytes ?? o.bytes ?? 0), L.d1Bytes || 524288000) } : { em: c?.em || null, semMedida: true },
        200, { ...cors, 'cache-control': 'no-store' });
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
    // NÍVEIS DE ACESSO: GET /permissoes = as permissões de quem está logado { adm, livre, programas, funcoes, sem, cargos };
    // GET ?adm=1 (só ADM) = o modelo inteiro (ADM › Níveis de acesso); POST { modelo } (só ADM) = salva. Sem e-mails.
    if (p00 === '/permissoes') {
      if (!login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      const q = new URL(req.url).searchParams, nc = { ...cors, 'cache-control': 'no-store' };
      if (req.method === 'GET' && !q.get('adm')) return json(await permEfetivas(env, login.email), 200, nc);
      if (!ehAdmin(env, login.email)) return json({ error: { type: 'adm', message: 'Só um ADM mexe nos níveis de acesso.' } }, 403, cors);
      if (req.method === 'GET') { const m = await permModelo(env, q.get('novo') === '1'); return json({ modelo: m || PERM_PADRAO(), salvo: !!m, eu: await permId(login.email) }, 200, nc); }
      if (req.method !== 'POST') return json({ error: { message: 'Use GET ou POST.' } }, 405, cors);
      let b = {}; try { b = await req.json(); } catch { }
      let m; try { m = permLimpa(b.modelo, await permId(login.email)); } catch (e) { return json({ error: { message: e.message } }, 400, cors); }
      const t = JSON.stringify(m); if (t.length > 900000) return json({ error: { message: 'Os níveis de acesso ficaram grandes demais.' } }, 413, cors);
      await env.EQUIPE.put('acesso/permissoes', t, { metadata: { tipo: 'application/json', tam: t.length, mod: Date.now(), em: m.em } });
      PERM.m = m; PERM.t = Date.now(); return json({ ok: true, modelo: m }, 200, nc);
    }
    if (new URL(req.url).pathname === '/confere') return new URL(req.url).searchParams.get('adm') && !ehAdmin(env, login.email) ? json({ error: { type: 'adm' } }, 403, cors) : json({ ok: true }, 200, { ...cors, 'cache-control': 'no-store' }); // a nuvem reserva confere se o login é da equipe (sem e-mail na resposta)
    // SEGURANÇA (não remover): quem é + chave do app criptografado — só com login do Firebase confirmado e e-mail liberado
    const p0 = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    // MÍDIA DA EQUIPE (KV "EQUIPE" da Cloudflare, grátis: 1 GB, até 25 MB por arquivo) — só com login liberado
    if (p0 === '/equipe' || p0 === '/equipe/arquivo') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      if (!env.EQUIPE) return json({ error: { type: 'sem_kv', message: 'Falta o KV da equipe (binding EQUIPE) no worker.' } }, 501, cors);
      const q = new URL(req.url).searchParams, LIM = limiteEquipe(env);
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
      const itemDe = async kk => { // a versão atual: direto do D1 (uma linha; a lista guardada pode ter até 30 s), no limite pela lista
        if (env._d1 && env.EQUIPE_DB && !emLimite()) { try { const a = await env.EQUIPE_DB.prepare('SELECT meta FROM arq WHERE k = ?').bind(kk).first(); if (!a) return null; let m = {}; try { m = JSON.parse(a.meta || '{}') || {}; } catch { } return { mod: 0, ...m }; } catch { } }
        const r = await env.EQUIPE.list({ prefix: kk }); const x = r.keys.find(y => y.name === kk); return x ? { mod: 0, ...(x.metadata || {}) } : null; }, modDe = async kk => +((await itemDe(kk))?.mod || 0);
      if (p0 === '/personagens') { if (req.method !== 'GET') return json({ error: { message: 'Use GET.' } }, 405, cors); return json({ itens: await listar('personagens/') }, 200, { ...cors, 'cache-control': 'no-store' }); }
      if (req.method === 'GET') {
        if (!KP.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors); if (q.get('so') === 'mod') return json({ mod: await modDe(k) }, 200, { ...cors, 'cache-control': 'no-store' }); // só a versão (o Ateliê confere sem baixar o personagem)
        const r = await env.EQUIPE.getWithMetadata(k, { type: k.endsWith('.json') ? 'arrayBuffer' : 'stream' }); if (!r.value) return json({ error: { message: 'Arquivo não encontrado' } }, 404, cors);
        const mod = +(r.metadata?.mod || 0);
        if (k.endsWith('.json')) { const ml = await modDe(k); if (ml && mod && mod < ml) return json({ error: { type: 'instavel', message: 'A nuvem entregou uma versão antiga deste personagem. Tente abrir de novo em alguns segundos. Nada foi perdido.' } }, 503, { ...cors, 'cache-control': 'no-store' }); }
        return new Response(r.value, { status: 200, headers: { ...cors, 'x-mod': String(mod), 'access-control-expose-headers': 'x-mod, x-nuvem, x-nuvem-volta', 'content-type': r.metadata?.tipo || 'application/octet-stream', 'cache-control': k.endsWith('.json') ? 'no-store' : 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', ...(k.endsWith('.svg') ? { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" } : {}) } });
      }
      if (req.method === 'PUT' || req.method === 'POST') {
        if (!KP.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors);
        const tipo = k.endsWith('.json') ? 'application/json' : { png: 'image/png', webp: 'image/webp', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' }[k.split('.').pop()];
        const buf = await req.arrayBuffer(); if (!buf.byteLength) return json({ error: { message: 'Arquivo vazio' } }, 400, cors);
        if (buf.byteLength > 10 * 1048576) return json({ error: { message: 'Arquivo maior que 10 MB.' } }, 413, cors);
        if (!k.endsWith('.json') && (await usadoEquipe(env, buf.byteLength)) + buf.byteLength > limiteEquipe(env)) return json({ error: { message: 'O espaço da equipe está cheio.' } }, 507, cors);
        const m0 = await metaDe(q.get('de'));
        // VERSÃO-BASE (04/11/2026): o Ateliê manda ?base=<mod da versão que ele abriu>; se a nuvem já tem outra, recusa (409) em vez de
        // gravar uma versão velha por cima. ?forcar=1 = a pessoa escolheu sobrescrever. Sem base (aba com o site antigo) e o personagem já existe: recusa e pede F5.
        if (k.endsWith('personagem.json') && q.get('forcar') !== '1') { const atual = await itemDe(k), base = +q.get('base') || 0;
          if (atual && !q.has('base')) return json({ error: { type: 'versao_antiga', message: 'Esta aba do Ateliê está com uma versão antiga do site e poderia gravar um personagem velho por cima. Atualize a página (F5) para salvar. O que você fez continua guardado neste computador.' } }, 409, cors);
          if (atual && +(atual.mod || 0) !== base) { const p = await semEmail({ por: atual.por }); return json({ error: { type: 'conflito', message: 'Há uma versão mais nova deste personagem na nuvem.', mod: +atual.mod || 0, por: p.por || null, quando: +atual.mod || 0 } }, 409, cors); } }
        const mod = Date.now();
        await env.EQUIPE.put(k, buf, { metadata: { tipo, ...(k.endsWith('.json') && q.get('nome') ? { nome: String(q.get('nome')).slice(0, 80) } : {}), tam: buf.byteLength, mod, por: m0?.por || login.email, em: m0?.em || new Date().toISOString() } });
        return json({ ok: true, k, mod }, 200, cors);
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
      const todos = await extrasAcesso(env), ex = todos.filter(x => x.email !== alvo);
      if (b.acao === 'add') {
        if (base.includes(alvo)) return json({ error: { type: 'ja_cadastrado', message: 'Esse e-mail já está cadastrado (lista fixa da Cloudflare).' } }, 409, cors);
        if (todos.length !== ex.length) return json({ error: { type: 'ja_cadastrado', message: 'Esse e-mail já está cadastrado.' } }, 409, cors);
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
      // TODO(níveis de acesso): mudar as ideias pede a chave preparativos.ideias quando a função pode() existir (Animador e Preparativos usam esta rota)
      if (typeof pode === 'function' && !(await pode(env, login.email, 'preparativos.ideias'))) return json({ error: { type: 'permissao', message: 'Sua conta não pode mudar as ideias. Peça para um ADM liberar.' } }, 403, cors);
      let b; try { b = await req.json(); } catch { return json({ error: { message: 'Pedido inválido' } }, 400, cors); }
      if (req.method === 'POST' && b?.acao === 'atualizar') {
        if (Array.isArray(b.canais)) { const c = [...new Set(b.canais.map(x => String(x || '').trim()).map(x => x.startsWith('@') ? x : '@' + x).filter(x => /^@[\w.\-]{3,40}$/.test(x)))].slice(0, 20); // até 20 canais (Preparativos › Ideias › Canais)
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
    // PUBLICAÇÕES (programa /publicacoes/, pedido da dona, 05/11/2026): UM JSON só (publicacoes/lista.json) com o que a equipe publicou
    //   no YouTube, os PEDIDOS da fila (pedido: true — quem não é gerente do canal deixa para um gerente publicar; o vídeo NÃO vem para cá)
    //   os CONCLUÍDOS (concluido: true — projeto marcado como concluído num programa, ainda não publicado; thumb pequena em data:image/jpeg)
    //   e os CANAIS da equipe (nome + ID UC…, cadastrados por ADM; o canal de quem publica direto entra sozinho).
    //   GET → { itens, canais, mod } (por = código u…, nunca e-mail; meu = é seu)
    //   POST { item, substitui? } → grava/atualiza 1 item (o seu, ou ADM); substitui = id do PEDIDO que virou vídeo (qualquer um da equipe)
    //   POST { canais } → troca a lista de canais (só ADM) · DELETE ?id= → tira da lista (o seu, ou ADM; não apaga no YouTube)
    if (p0 === '/publicacoes') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      if (!env.EQUIPE) return json({ error: { type: 'sem_kv', message: 'Falta o KV da equipe (binding EQUIPE) no worker.' } }, 501, cors);
      const KP = 'publicacoes/lista.json', eu = String(login.email).toLowerCase(), adm = ehAdmin(env, login.email);
      const leP = async () => { try { const v = JSON.parse((await env.EQUIPE.get(KP)) || 'null'); return v && Array.isArray(v.itens) ? { canais: [], ...v } : { itens: [], canais: [], mod: 0 }; } catch { return { itens: [], canais: [], mod: 0 }; } };
      const saida = async v => json({ itens: await Promise.all(v.itens.map(async x => ({ ...(await semEmail(x)), meu: String(x.por || '').toLowerCase() === eu }))), canais: v.canais || [], mod: v.mod || 0, adm }, 200, { ...cors, 'cache-control': 'no-store' });
      const dono = x => adm || String(x?.por || '').toLowerCase() === eu;
      const grava = async v => { v.mod = Date.now(); const t = JSON.stringify(v); await env.EQUIPE.put(KP, t, { metadata: { tipo: 'application/json', tam: t.length, mod: v.mod, em: new Date().toISOString() } }); };
      const txt = (x, n) => String(x ?? '').slice(0, n), num = x => Number.isFinite(+x) && +x > 0 ? +x : null, ehCanal = x => /^UC[A-Za-z0-9_-]{22}$/.test(String(x || ''));
      if (req.method === 'GET') return saida(await leP());
      if (req.method === 'POST') {
        let b; try { b = await req.json(); } catch { return json({ error: { message: 'Pedido inválido' } }, 400, cors); }
        const v = await leP();
        if (Array.isArray(b?.canais)) {
          if (!adm) return json({ error: { type: 'adm', message: 'Só um ADM muda os canais da equipe.' } }, 403, cors);
          v.canais = b.canais.filter(c => ehCanal(c?.id)).slice(0, 30).map(c => ({ id: c.id, nome: txt(c.nome, 100) || c.id }));
          await grava(v); return saida(v);
        }
        const i = b?.item; if (!i || typeof i !== 'object' || !/^[A-Za-z0-9_-]{6,20}$/.test(String(i.id || ''))) return json({ error: { message: 'Item inválido.' } }, 400, cors);
        const pedido = !!i.pedido, concl = !pedido && !!i.concluido;
        if (!(await pode(env, login.email, concl ? 'publicacoes' : 'publicacoes.publicar'))) return json({ error: { type: 'permissao', message: 'Sua conta não pode publicar pelo Publicações. Peça para um ADM liberar.' } }, 403, cors);
        if (i.modo === 'agendado' && !concl && !(await pode(env, login.email, 'publicacoes.agendar'))) return json({ error: { type: 'permissao', message: 'Sua conta não pode agendar vídeos. Peça para um ADM liberar.' } }, 403, cors);
        const limpo = { id: i.id, titulo: txt(i.titulo, 100), canal: { id: txt(i.canal?.id, 40), nome: txt(i.canal?.nome, 100), foto: /^https:\/\//.test(i.canal?.foto || '') ? txt(i.canal.foto, 300) : '' },
          modo: ['naoListado', 'agora', 'agendado'].includes(i.modo) ? i.modo : 'naoListado', privacidade: ['public', 'unlisted', 'private'].includes(i.privacidade) ? i.privacidade : 'unlisted',
          publicaEm: num(i.publicaEm), enviadoEm: num(i.enviadoEm) || Date.now(), programa: txt(i.programa, 20), duracao: num(i.duracao), conferidoEm: num(i.conferidoEm), via: i.via === 'studio' ? 'studio' : 'api',
          ...(concl ? { concluido: true, thumb: /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(i.thumb || '') && i.thumb.length < 24000 ? i.thumb : '', abrir: /^\/[A-Za-z0-9/_?=&.%-]{0,200}$/.test(i.abrir || '') ? i.abrir : '', arquivo: { nome: txt(i.arquivo?.nome, 120), tam: num(i.arquivo?.tam) } } : {}),
          ...(pedido ? { pedido: true, descricao: txt(i.descricao, 5000), criancas: typeof i.criancas === 'boolean' ? i.criancas : null, arquivo: { nome: txt(i.arquivo?.nome, 120), tam: num(i.arquivo?.tam) } } : {}) };
        const k = v.itens.findIndex(x => x.id === limpo.id), antes = k >= 0 ? JSON.stringify(v.itens[k]) : null;
        if (k >= 0) { if (!dono(v.itens[k])) return json({ error: { type: 'adm', message: 'Só quem publicou (ou um ADM) muda este item.' } }, 403, cors); v.itens[k] = { ...limpo, por: v.itens[k].por, enviadoEm: v.itens[k].enviadoEm }; }
        else { v.itens.unshift({ ...limpo, por: eu }); if (v.itens.length > 3000) v.itens.length = 3000; }
        let mudou = !(antes && antes === JSON.stringify(v.itens[k >= 0 ? k : 0]));
        if (b.substitui && b.substitui !== limpo.id) { const n = v.itens.length; v.itens = v.itens.filter(x => !(x.id === b.substitui && (x.pedido || x.concluido))); if (v.itens.length !== n) mudou = true; } // o pedido virou vídeo
        if (!pedido && !concl && limpo.via === 'api' && ehCanal(limpo.canal.id) && !v.canais.some(c => c.id === limpo.canal.id) && v.canais.length < 30) { v.canais.push({ id: limpo.canal.id, nome: limpo.canal.nome || limpo.canal.id }); mudou = true; } // canal novo de quem publica direto
        if (mudou) await grava(v);
        return saida(v);
      }
      if (req.method === 'DELETE') {
        const id = new URL(req.url).searchParams.get('id') || '', v = await leP(), x = v.itens.find(y => y.id === id);
        if (!x) return saida(v); if (!dono(x)) return json({ error: { type: 'adm', message: 'Só quem publicou (ou um ADM) tira da lista.' } }, 403, cors);
        v.itens = v.itens.filter(y => y.id !== id); await grava(v); return saida(v);
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
      if (!(await pode(env, login.email, BA === 'jester' ? 'jester' : 'animador'))) return p0 === '/' + BA && req.method === 'GET' ? json({ itens: [] }, 200, { ...cors, 'cache-control': 'no-store' }) : json({ error: { type: 'permissao', message: 'O seu cargo não tem acesso a este programa.' } }, 403, cors); // NÍVEIS DE ACESSO
      const q = new URL(req.url).searchParams, k = q.get('k') || '';
      const KA = new RegExp('^' + BA + '\\/(pastas\\.json|[A-Za-z0-9_-]{2,40}\\/(projeto\\.json|thumb\\.jpg|arq\\/[A-Za-z0-9._~%-]{1,300}))$'), /* pastas.json = pastas das animações da nuvem (toda a equipe muda) */ KAD = new RegExp('^' + BA + '\\/[A-Za-z0-9_-]{2,40}\\/$');
      const listar = async (prefix) => { const out = []; let cur; do { const r = await env.EQUIPE.list({ prefix, cursor: cur }); for (const x of r.keys) out.push({ k: x.name, ...(x.metadata || {}) }); cur = r.list_complete ? null : r.cursor; } while (cur); return out; };
      if (p0 === '/' + BA) { if (req.method !== 'GET') return json({ error: { message: 'Use GET.' } }, 405, cors);
        const so = q.get('id') || ''; if (so) { if (!/^[A-Za-z0-9_-]{2,40}$/.test(so)) return json({ error: { message: 'Animação inválida' } }, 400, cors); return json({ itens: (await listar(BA + '/' + so + '/')).map(x => ({ k: x.k, tam: x.tam || 0, mod: x.mod || 0 })) }, 200, { ...cors, 'cache-control': 'no-store' }); }
        const g = LISTA_ANIM.get(BA); if (q.get('menu') === '1' && q.get('novo') !== '1' && g && Date.now() - g.t < 300e3) return json(g.j, 200, { ...cors, 'cache-control': 'no-store', 'x-lista': 'guardada' });
        const todos = await listar(BA + '/'), tam = {}, out = [];
        for (const x of todos) { const id = x.k.split('/')[1]; tam[id] = (tam[id] || 0) + (+x.tam || 0); }
        for (const x of todos) { const m = x.k.match(new RegExp('^' + BA + '\\/([^/]+)\\/projeto\\.json$')); if (m) out.push(await semEmail({ id: m[1], nome: x.nome || '', mod: x.mod || 0, por: x.por, em: x.em, tam: tam[m[1]] || 0, quem: x.quem || null })); } /* quem = quem criou/editou (códigos u…, nomes; foto vem do /pessoa) */
        const j = { itens: out }; LISTA_ANIM.set(BA, { t: Date.now(), j }); return json(j, 200, { ...cors, 'cache-control': 'no-store' }); }
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
        if (k.endsWith('projeto.json')) LISTA_ANIM.delete(BA); // a lista guardada ficou velha: o menu busca de novo
        return json({ ok: true, k }, 200, cors);
      }
      if (req.method === 'DELETE') {
        // REMOVER DA NUVEM (decisão do dono, 30/10/2026): quem mandou a animação para a nuvem ou um ADM
        if (KAD.test(k)) { const dono = await env.EQUIPE.getWithMetadata(k + 'projeto.json', { type: 'stream' }).then(async o => { try { await o.value?.cancel(); } catch { } return o.metadata?.por || ''; }).catch(() => '');
          if (!ehAdmin(env, login.email) && !(await pode(env, login.email, 'geral.apagar-nuvem'))) return json({ error: { type: 'permissao', message: 'O seu cargo não pode apagar da nuvem. Peça para um ADM tirar.' } }, 403, cors);
          if (!ehAdmin(env, login.email) && String(dono).toLowerCase() !== String(login.email).toLowerCase()) return json({ error: { type: 'adm', message: 'Só quem mandou esta animação para a nuvem (ou um ADM) pode tirar ela de lá.' } }, 403, cors);
          const ks = (await listar(k)).map(x => x.k); if (env.EQUIPE.deleteMuitos) await env.EQUIPE.deleteMuitos(ks, k); else for (const x of ks) await env.EQUIPE.delete(x); LISTA_ANIM.delete(BA); return json({ ok: true, apagados: ks.length }, 200, cors); }
        if (!KA.test(k) || !/\/arq\//.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors); // arquivos que a animação já não usa: qualquer um da equipe (limpeza do envio)
        await env.EQUIPE.delete(k); return json({ ok: true }, 200, cors);
      }
      return json({ error: { message: 'Pedido desconhecido.' } }, 405, cors);
    }
    // ===================== PREPARATIVOS (programa /preparativos/, pedido da dona, 05/11/2026) — bloco próprio =====================
    // Roteiros em partes → falas por personagem → áudio de cada fala, destino (animador|shorts|editor) e legendas. Contrato do
    // formato no CLAUDE.md do site e no README do repo "preparativos". Chaves: preparativos/<id>/prep.json, preparativos/<id>/aud/<fala>-<t>.webm,
    // preparativos/cores.json (cor da legenda por nome de personagem em minúsculas, para a equipe toda).
    //   GET    /preparativos                       → { itens: [{ id, nome, destino, status, mod, por, em, n, g, partes }] } (só a lista, sem abrir os arquivos)
    //   GET    /preparativos/arquivo?k=…           → o arquivo (prep.json leva x-mod)
    //   POST   /preparativos/arquivo?k=…/prep.json&base=<mod>[&forcar=1] → salva o preparativo inteiro (409 conflito se a nuvem tem outro mod)
    //   POST   /preparativos/arquivo?k=…/aud/<fala>-<t>.webm → áudio de uma fala (até 8 MB)
    //   POST   /preparativos/acao { acao: 'falas'|'marca'|'legenda'|'cores'|'usado', … } → mudanças pequenas feitas aqui no servidor (uma gravação)
    //   DELETE /preparativos/arquivo?k=preparativos/<id>/ → apaga o preparativo inteiro (quem criou ou ADM)
    if (p0 === '/preparativos' || p0 === '/preparativos/arquivo' || p0 === '/preparativos/acao') {
      if (!env.FIREBASE_PROJECT_ID || !login.email) return json({ error: { type: 'login', message: 'Entre com sua conta Google.' } }, 401, cors);
      if (!env.EQUIPE) return json({ error: { type: 'sem_kv', message: 'Falta o KV da equipe (binding EQUIPE) no worker.' } }, 501, cors);
      // TODO(níveis de acesso): quando a função pode(env, email, chave) existir, ela decide (chaves preparativos.* no permissoes.json); até lá, toda a equipe liberada pode
      const podeP = async c => typeof pode === 'function' ? !!(await pode(env, login.email, c === 'ver' ? 'preparativos' : 'preparativos.' + c)) : true; // ver = o programa
      const OQUE = { ver: 'ver os roteiros', gravar: 'gravar falas', roteiro: 'mudar o roteiro', organizar: 'organizar o roteiro e as legendas', pronto: 'marcar o destino e o pronto' };
      const nega = c => json({ error: { type: 'permissao', message: `Sua conta não pode ${OQUE[c] || c} nos Preparativos. Peça para um ADM liberar.` } }, 403, cors);
      if (!(await podeP('ver'))) return nega('ver');
      const q = new URL(req.url).searchParams, k = q.get('k') || '', ID = /^[A-Za-z0-9_-]{2,40}$/;
      const KPR = /^preparativos\/(cores\.json|personagens\.json|pastas\.json|pers\/[a-z0-9-]{1,60}\.webp|[A-Za-z0-9_-]{2,40}\/(prep\.json|(aud|dub)\/[A-Za-z0-9_-]{1,80}\.(webm|ogg|m4a|mp3|wav)))$/, KPRD = /^preparativos\/[A-Za-z0-9_-]{2,40}\/$/;
      const DEST = ['animador', 'shorts', 'editor'], STAT = ['rascunho', 'gravando', 'pronto'];
      const kP = id => `preparativos/${id}/prep.json`;
      const leP = async id => { const o = await env.EQUIPE.getWithMetadata(kP(id), { type: 'arrayBuffer' }); if (!o?.value) return null; let P = null; try { P = JSON.parse(new TextDecoder().decode(o.value)); } catch { } return P && typeof P === 'object' ? { P, m: o.metadata || {} } : null; };
      // QUEM criou / editou (P.autor, P.edicoes: código u…, nome, foto pequena) vai resumido na lista, sem foto e sem e-mail
      const quemDe = P => { const q = x => x && /^u[0-9a-f]{16}$/.test(String(x.id || '')) ? { i: x.id, n: String(x.nome || '').replace(/[<>]/g, '').slice(0, 40), t: +x.em || 0 } : null;
        const a = q(P.autor), e = (Array.isArray(P.edicoes) ? P.edicoes : []).map(q).filter(Boolean).slice(-4); return a || e.length ? { a, e } : null; };
      const gravaP = async (P, m0) => { const mod = Date.now(); P.mod = mod; const t = JSON.stringify(P), fs = (P.partes || []).flatMap(p => p.falas || []);
        await env.EQUIPE.put(kP(P.id), t, { metadata: { tipo: 'application/json', tam: t.length, mod, nome: String(P.nome || '').slice(0, 80), destino: P.destino || null, status: P.status || 'rascunho', n: fs.length, g: fs.filter(f => f.audio).length, partes: (P.partes || []).length, pers: [...new Map(fs.map(f => [String(f.personagem || '').toLowerCase(), String(f.personagem || '').slice(0, 30)])).values()].filter(Boolean).slice(0, 8), uso: [...new Set((Array.isArray(P.usadoPor) ? P.usadoPor : []).map(u => u.programa).filter(x => DEST.includes(x)))], quem: quemDe(P), por: m0?.por || login.email, em: m0?.em || new Date().toISOString() } });
        return mod; };
      // ESTILO DA LEGENDA (o Animador, o Shorts e o Editor leem): números em fração do quadro; quadro = tamanho do vídeo em px
      const num = (v, a, z, d) => { v = +v; return Number.isFinite(v) ? Math.min(z, Math.max(a, v)) : d; }, corOk = (c, d) => /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toLowerCase() : d;
      const limpaEstilo = e => { if (!e || typeof e !== 'object') return undefined; const sb = e.sombra || {}, ct = e.contorno || {}, fd = e.fundo || {};
        return { fonte: String(e.fonte || 'Rubik').replace(/[^\w ,'-]/g, '').slice(0, 40) || 'Rubik', tamanho: num(e.tamanho, .01, .2, .045), peso: Math.round(num(e.peso, 100, 900, 800) / 100) * 100,
          x: num(e.x, 0, 1, .5), y: num(e.y, 0, 1, .82), largura: num(e.largura, .1, 1, .86), alinhar: ['left', 'center', 'right'].includes(e.alinhar) ? e.alinhar : 'center', maiusculas: e.maiusculas === true,
          contorno: { ativo: ct.ativo === true, cor: corOk(ct.cor, '#000000'), largura: num(ct.largura, 0, .03, .004) },
          sombra: { ativa: sb.ativa === true, cor: corOk(sb.cor, '#000000'), desfoque: num(sb.desfoque, 0, .05, .006), x: num(sb.x, -.05, .05, 0), y: num(sb.y, -.05, .05, .003), opacidade: num(sb.opacidade, 0, 1, .8) },
          fundo: { ativo: fd.ativo === true, cor: corOk(fd.cor, '#000000'), opacidade: num(fd.opacidade, 0, 1, .5) } }; };
      const limpaQuadro = q => q && typeof q === 'object' ? { w: Math.round(num(q.w, 160, 7680, 1080)), h: Math.round(num(q.h, 160, 7680, 1920)) } : undefined;
      const leCores = async () => { try { return JSON.parse((await env.EQUIPE.get('preparativos/cores.json')) || '{}') || {}; } catch { return {}; } };
      const limpaCores = o => { const out = {}; for (const [a, b] of Object.entries(o && typeof o === 'object' ? o : {}).slice(0, 200)) { const n = String(a).normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR').slice(0, 40); if (n && /^#[0-9a-f]{6}$/i.test(String(b))) out[n] = String(b).toLowerCase(); } return out; };
      // PERSONAGENS DA EQUIPE (preparativos/personagens.json): { "<nome minúsculo>": { nome, cor, foto, grupo, em } } — todo personagem que aparece
      // num roteiro salvo entra sozinho (só o nome); cor/foto/grupo mudam pela ação "personagens". O cores.json antigo continua sendo lido.
      const chaveP = s => String(s || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR').slice(0, 40);
      const lePers = async () => { try { const o = JSON.parse((await env.EQUIPE.get('preparativos/personagens.json')) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; } };
      const limpaPers = o => { const out = {}; for (const [a, v] of Object.entries(o && typeof o === 'object' ? o : {}).slice(0, 300)) { const k = chaveP(a); if (!k || !v || typeof v !== 'object') continue; const e = {};
          if (typeof v.nome === 'string' && v.nome.trim()) e.nome = v.nome.replace(/[<>:*#\[\]()]/g, '').trim().slice(0, 40);
          if (/^#[0-9a-f]{6}$/i.test(String(v.cor || ''))) e.cor = String(v.cor).toLowerCase();
          if ('foto' in v && (v.foto === null || /^preparativos\/pers\/[a-z0-9-]{1,60}\.webp$/.test(String(v.foto)))) e.foto = v.foto;
          if ('grupo' in v && (v.grupo === null || (typeof v.grupo === 'string' && /^[\p{L}\p{N} ._-]{1,30}$/u.test(v.grupo.trim())))) e.grupo = v.grupo === null ? null : v.grupo.trim();
          // PADRÃO NO ANIMADOR (personagem do Ateliê para todos os roteiros): { id, nome } | null (= nenhum); "auto" tira o campo (= mesmo nome)
          if ('atelie' in v) { const a = v.atelie; if (a === null || a === 'auto') e.atelie = a; else if (a && typeof a === 'object' && /^[a-z0-9][a-z0-9-]{1,40}$/.test(String(a.id || ''))) e.atelie = { id: String(a.id), nome: String(a.nome || a.id).replace(/[<>]/g, '').slice(0, 80) }; }
          if (v.apagar === true) e.apagar = true; // tirar da lista (renomear = o nome novo com os mesmos dados + apagar o velho)
          if (Object.keys(e).length) out[k] = e; } return out; };
      const juntaPers = async (mudas, soNovos) => { const p0 = await lePers(), p = { ...p0 }, velhas = []; let mudou = false;
        const ordem = Object.entries(mudas || {}).sort(([, a], [, b]) => (a.apagar ? 1 : 0) - (b.apagar ? 1 : 0)); // primeiro grava, depois apaga (renomear não perde a foto)
        for (const [k, e] of ordem) { if (e.apagar) { if (!soNovos && p[k]) { if (p[k].foto) velhas.push(p[k].foto); delete p[k]; mudou = true; } continue; }
          if (soNovos && p[k]) continue; const n = { ...(p[k] || {}), ...e }; for (const x of Object.keys(n)) if (n[x] === null && x !== 'atelie') delete n[x]; if (n.atelie === 'auto') delete n.atelie;
          if ('foto' in e && p[k]?.foto && p[k].foto !== e.foto) velhas.push(p[k].foto); const { em: _a, ...antes } = p[k] || {}, { em: _b, ...depois } = n;
          if (!p[k] || JSON.stringify(depois) !== JSON.stringify(antes)) { p[k] = { ...depois, em: new Date().toISOString() }; mudou = true; } }
        if (mudou) { const t = JSON.stringify(p); await env.EQUIPE.put('preparativos/personagens.json', t, { metadata: { tipo: 'application/json', tam: t.length, mod: Date.now(), em: new Date().toISOString() } });
          const usadas = new Set(Object.values(p).map(x => x.foto).filter(Boolean)); // foto que ainda é de alguém (ex.: renomeado) fica
          for (const f of velhas.filter(f => !usadas.has(f)).slice(0, 5)) { try { await env.EQUIPE.delete(f); } catch { } } }
        return p; };
      const coresDe = async p => { const c = await leCores(); for (const [k, e] of Object.entries(p || {})) if (e.cor) c[k] = e.cor; return c; };
      const juntaCores = async novas => coresDe(await juntaPers(Object.fromEntries(Object.entries(novas || {}).map(([k, c]) => [k, { cor: c }]))));
      if (p0 === '/preparativos') { if (req.method !== 'GET') return json({ error: { message: 'Use GET.' } }, 405, cors);
        const out = []; let cur; do { const r = await env.EQUIPE.list({ prefix: 'preparativos/', cursor: cur }); for (const x of r.keys) { const m = x.name.match(/^preparativos\/([^/]+)\/prep\.json$/); if (m) { const d = x.metadata || {}; out.push(await semEmail({ id: m[1], nome: d.nome || '', destino: d.destino || null, status: d.status || 'rascunho', mod: d.mod || 0, por: d.por, em: d.em, n: d.n || 0, g: d.g || 0, partes: d.partes || 0, pers: Array.isArray(d.pers) ? d.pers : [], uso: Array.isArray(d.uso) ? d.uso : [], quem: d.quem || null })); } } cur = r.list_complete ? null : r.cursor; } while (cur);
        return json({ itens: out }, 200, { ...cors, 'cache-control': 'no-store' }); }
      if (p0 === '/preparativos/acao') {
        if (req.method !== 'POST') return json({ error: { message: 'Use POST.' } }, 405, cors);
        let b; try { b = await req.json(); } catch { return json({ error: { message: 'Pedido inválido' } }, 400, cors); }
        if (b?.acao === 'cores') { if (!(await podeP('organizar'))) return nega('organizar'); return json({ ok: true, cores: await juntaCores(limpaCores(b.cores)) }, 200, cors); }
        // PASTAS DOS ROTEIROS (preparativos/pastas.json = { ordem: [nome…], de: { <id do roteiro>: nome } }), da equipe toda; mudanças pequenas, lidas e gravadas aqui
        if (b?.acao === 'pastas') { if (!(await podeP('roteiro'))) return nega('roteiro');
          const nomeOk = x => { const n = String(x ?? '').normalize('NFC').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40); return n || null; };
          let o; try { o = JSON.parse((await env.EQUIPE.get('preparativos/pastas.json')) || '{}') || {}; } catch { o = {}; }
          const ordem = (Array.isArray(o.ordem) ? o.ordem : []).map(nomeOk).filter(Boolean), de = o.de && typeof o.de === 'object' ? o.de : {};
          if (b.nova) { const n = nomeOk(b.nova); if (n && !ordem.includes(n)) { if (ordem.length >= 100) return json({ error: { message: 'Pastas demais (máx. 100).' } }, 400, cors); ordem.push(n); } }
          if (b.renomear) { const a1 = nomeOk(b.renomear.de), a2 = nomeOk(b.renomear.para); if (a1 && a2 && a1 !== a2) { const i = ordem.indexOf(a1); if (i >= 0) ordem[i] = a2; else if (!ordem.includes(a2)) ordem.push(a2); for (const id of Object.keys(de)) if (de[id] === a1) de[id] = a2; } }
          if (b.apagar) { const n = nomeOk(b.apagar), i = ordem.indexOf(n); if (i >= 0) ordem.splice(i, 1); for (const id of Object.keys(de)) if (de[id] === n) delete de[id]; }
          if (b.mover && typeof b.mover === 'object') for (const [id, n0] of Object.entries(b.mover).slice(0, 200)) { if (!ID.test(id)) continue; const n = n0 == null ? null : nomeOk(n0); if (!n) delete de[id]; else { de[id] = n; if (!ordem.includes(n)) ordem.push(n); } }
          if (Array.isArray(b.ordem)) { const nv = b.ordem.map(nomeOk).filter(x => x && ordem.includes(x)); ordem.splice(0, ordem.length, ...new Set([...nv, ...ordem])); }
          const out = { ordem: [...new Set(ordem)], de: Object.fromEntries(Object.entries(de).filter(([id, n]) => ID.test(id) && typeof n === 'string').slice(0, 5000)) }, t = JSON.stringify(out);
          await env.EQUIPE.put('preparativos/pastas.json', t, { metadata: { tipo: 'application/json', tam: t.length, mod: Date.now(), em: new Date().toISOString() } });
          return json({ ok: true, pastas: out }, 200, cors); }
        if (b?.acao === 'personagens') { if (!(await podeP('organizar'))) return nega('organizar'); return json({ ok: true, personagens: await juntaPers(limpaPers(b.itens)) }, 200, cors); }
        if (!ID.test(String(b?.id || ''))) return json({ error: { message: 'Preparativo inválido.' } }, 400, cors);
        if (b.acao === 'dublar') { // LINKS DE DUBLAGEM: listar, criar, desligar; aceitar/recusar o que chegou
          const op = String(b.op || ''), precisaD = { lista: 'gravar', novo: 'links', desliga: 'links', ver: 'links', aceita: 'gravar', recusa: 'gravar' }[op]; if (!precisaD) return json({ error: { message: 'Ação desconhecida.' } }, 400, cors);
          if (!(await podeP(precisaD))) return json({ error: { type: 'permissao', message: precisaD === 'links' ? 'Sua conta não pode criar ou desligar links de dublagem. Peça para um ADM liberar.' : 'Sua conta não pode gravar falas nos Preparativos.' } }, 403, cors);
          const o = await leP(b.id); if (!o) return json({ error: { message: 'Este roteiro não está na nuvem (mande o roteiro antes).' } }, 404, cors);
          const D = await leDub(env, b.id), P = o.P; { const venc = Object.entries(D.links).filter(([, l]) => l.revogado || l.terminado || (l.expira && Date.now() > +l.expira)).map(([h]) => h);
            if (venc.length) { for (const h of venc) { delete D.links[h]; try { await env.EQUIPE.delete('dublar-links/' + h); } catch { } } await gravaDub(env, b.id, D); } }
          const fs = new Map((P.partes || []).flatMap(pt => pt.falas || []).map(f => [f.id, f]));
          const vista = () => ({ links: Object.entries(D.links).map(([h, l]) => ({ h, rotulo: l.rotulo, falas: l.falas, criado: l.criado, expira: l.expira, revogado: !!l.revogado, unico: !!l.unico, podeVer: !!l.cifra, total: l.total || 0, quem: l.quem || null, por: l.por || null })).sort((x, y) => y.criado - x.criado),
            pend: D.pend.filter(x => fs.has(x.fala)).map(x => ({ k: x.k, fala: x.fala, dur: x.dur, quem: x.quem, em: x.em, link: x.link })) });
          if (op === 'lista') return json({ ok: true, ...vista() }, 200, { ...cors, 'cache-control': 'no-store' });
          if (op === 'novo') {
            const falas = [...new Set((Array.isArray(b.falas) ? b.falas : []).map(String))].filter(x => fs.has(x)).slice(0, 300); if (!falas.length) return json({ error: { message: 'Escolha pelo menos uma fala.' } }, 400, cors);
            if (Object.keys(D.links).length >= 30) return json({ error: { message: 'Este roteiro já tem links ligados demais (30). Desligue alguns.' } }, 400, cors);
            const by = crypto.getRandomValues(new Uint8Array(32)), tok = btoa(String.fromCharCode(...by)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), h = await hashTok(tok);
            const eu = await (async () => { try { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('estudio-problems:' + String(login.email).toLowerCase())); return 'u' + [...new Uint8Array(d)].slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join(''); } catch { return null; } })();
            D.links[h] = { rotulo: txtLimpo(b.rotulo, 80) || 'Link de dublagem', falas, ...(b.de ? { de: chaveP(b.de) } : {}), criado: Date.now(), expira: b.prazo === 'sempre' ? null : Date.now() + 3600e3, por: eu, unico: new Set(falas.map(x => chaveP(fs.get(x)?.personagem))).size <= 1, cifra: await cifraDub(env, tok).catch(() => null), total: 0, envios: {} };
            await gravaDub(env, b.id, D); await env.EQUIPE.put('dublar-links/' + h, b.id, { metadata: { tipo: 'text/plain', tam: b.id.length, mod: Date.now() } });
            return json({ ok: true, token: tok, ...vista() }, 200, { ...cors, 'cache-control': 'no-store' }); } // o token aparece SÓ agora (aqui fica só o hash)
          const h = String(b.link || ''), L = /^[0-9a-f]{64}$/.test(h) ? D.links[h] : null;
          if (op === 'ver') { if (!L) return json({ error: { message: 'Esse link não existe mais (terminou, venceu ou foi encerrado).' } }, 404, cors); if (!L.cifra) return json({ error: { message: 'Esse link é antigo e não dá para ver de novo. Crie outro.' } }, 410, cors);
            try { return json({ ok: true, token: await decifraDub(env, L.cifra) }, 200, { ...cors, 'cache-control': 'no-store' }); } catch { return json({ error: { message: 'Não consegui abrir esse link agora.' } }, 500, cors); } }
          if (op === 'desliga') { if (!L) return json({ error: { message: 'Link não encontrado.' } }, 404, cors); delete D.links[h]; await gravaDub(env, b.id, D); try { await env.EQUIPE.delete('dublar-links/' + h); } catch { } return json({ ok: true, ...vista() }, 200, cors); }
          const x = D.pend.find(y => y.k === String(b.k || '')); if (!x || !x.k.startsWith(`preparativos/${b.id}/dub/`)) return json({ error: { message: 'Gravação não encontrada (talvez já tenha sido vista).' } }, 404, cors);
          D.pend = D.pend.filter(y => y !== x);
          if (op === 'recusa') { await gravaDub(env, b.id, D); try { await env.EQUIPE.delete(x.k); } catch { } return json({ ok: true, ...vista() }, 200, cors); }
          const f = fs.get(x.fala); if (!f) return json({ error: { message: 'Essa fala não existe mais no roteiro.' } }, 404, cors);
          let velho; if (x.de && Array.isArray(f.personagens)) { velho = f.audios?.[x.de]?.audio; f.audios = { ...(f.audios || {}), [x.de]: { audio: x.k, duracao: x.dur || 0, dub: { nome: x.quem?.nome || '', conta: !!x.quem?.conta, em: x.em } } }; }
          else { velho = f.audio; f.audio = x.k; f.duracao = x.dur || 0; f.dub = { nome: x.quem?.nome || '', conta: !!x.quem?.conta, em: x.em }; delete f.regravar; } f.em = new Date().toISOString();
          const mod = await gravaP(P, o.m); await gravaDub(env, b.id, D);
          if (velho && velho !== x.k && velho.startsWith(`preparativos/${b.id}/`)) { try { await env.EQUIPE.delete(velho); } catch { } }
          return json({ ok: true, mod, audio: x.k, duracao: x.dur || 0, de: x.de || null, ...vista() }, 200, cors);
        }
        const a = b.acao, precisa = { falas: 'gravar', marca: 'pronto', legenda: 'organizar', usado: 'ver' }[a]; if (!precisa) return json({ error: { message: 'Ação desconhecida.' } }, 400, cors);
        if (!(await podeP(precisa))) return nega(precisa);
        const o = await leP(b.id); if (!o) return json({ error: { message: 'Este roteiro não está na nuvem (mande o roteiro antes).' } }, 404, cors);
        const P = o.P, extra = {};
        if (a === 'falas') { // áudios novos das falas (uma gravação para todas); o áudio antigo da fala sai da nuvem
          const mapa = new Map(); for (const p of P.partes || []) for (const f of p.falas || []) mapa.set(f.id, f);
          const pre = `preparativos/${b.id}/aud/`, velhos = [];
          for (const x of (Array.isArray(b.falas) ? b.falas : []).slice(0, 300)) { const f = mapa.get(String(x?.id || '')); if (!f) continue; const au = x.audio == null ? null : String(x.audio);
            if (au && !(au.startsWith(pre) && KPR.test(au))) return json({ error: { message: 'Áudio inválido.' } }, 400, cors);
            if (x.de) { const de = chaveP(x.de); if (!Array.isArray(f.personagens) || !f.personagens.some(n => chaveP(n) === de)) continue; // FALA DE VÁRIOS: a versão de um deles
              const ant = f.audios?.[de]?.audio; if (ant && ant !== au && ant.startsWith(`preparativos/${b.id}/`)) velhos.push(ant);
              f.audios = { ...(f.audios && typeof f.audios === 'object' ? f.audios : {}) }; if (au) f.audios[de] = { audio: au, duracao: Math.max(0, Math.min(3600, +x.duracao || 0)) }; else delete f.audios[de]; continue; }
            if (f.audio && f.audio !== au && (f.audio.startsWith(pre) || f.audio.startsWith(`preparativos/${b.id}/dub/`))) velhos.push(f.audio);
            f.audio = au; f.duracao = Math.max(0, Math.min(3600, +x.duracao || 0)); delete f.regravar; f.em = new Date().toISOString(); }
          extra.mod = await gravaP(P, o.m);
          for (const v of velhos.slice(0, 20)) { try { await env.EQUIPE.delete(v); } catch { } }
        } else if (a === 'marca') {
          if ('destino' in b) P.destino = DEST.includes(b.destino) ? b.destino : null;
          if ('status' in b) P.status = STAT.includes(b.status) ? b.status : 'rascunho';
          extra.mod = await gravaP(P, o.m);
        } else if (a === 'legenda') {
          const cores = limpaCores(b.cores); P.legenda = { ativa: b.ativa !== false, mostrarNome: b.mostrarNome === true, cores: { ...(P.legenda?.cores || {}), ...cores }, estilo: limpaEstilo(b.estilo) || P.legenda?.estilo, quadro: limpaQuadro(b.quadro) || P.legenda?.quadro };
          extra.mod = await gravaP(P, o.m); extra.cores = await juntaCores(cores);
        } else if (a === 'usado') { // o programa que usou este preparativo (Animador, Shorts, Editor) avisa aqui
          const programa = String(b.programa || ''), projeto = String(b.projeto || '').slice(0, 120); if (!DEST.includes(programa)) return json({ error: { message: 'Programa inválido.' } }, 400, cors);
          const l = (Array.isArray(P.usadoPor) ? P.usadoPor : []).filter(u => !(u.programa === programa && u.projeto === projeto)); l.push({ programa, projeto, quando: new Date().toISOString() }); P.usadoPor = l.slice(-50);
          extra.mod = await gravaP(P, o.m);
        }
        return json({ ok: true, ...extra }, 200, cors);
      }
      if (req.method === 'GET') {
        if (!KPR.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors);
        const r = await env.EQUIPE.getWithMetadata(k, { type: 'stream' }); if (!r.value) return json({ error: { message: 'Arquivo não encontrado' } }, 404, cors);
        const aud = k.includes('/aud/'), img = k.endsWith('.webp');
        return new Response(r.value, { status: 200, headers: { ...cors, 'x-mod': String(+(r.metadata?.mod || 0)), 'access-control-expose-headers': 'x-mod, x-nuvem, x-nuvem-volta', 'content-type': aud ? (r.metadata?.tipo || 'audio/webm') : img ? 'image/webp' : 'application/json', 'cache-control': aud || img ? 'private, max-age=31536000, immutable' : 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" } });
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        if (!KPR.test(k) || /^preparativos\/(cores|personagens|pastas)\.json$/.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors);
        if (k.includes('/dub/')) return json({ error: { message: 'Arquivo inválido' } }, 400, cors); // só o link de dublagem grava aqui
        const id = k.split('/')[1], buf = await req.arrayBuffer(); if (!buf.byteLength) return json({ error: { message: 'Arquivo vazio' } }, 400, cors);
        if (k.startsWith('preparativos/pers/')) { // foto do personagem (o navegador já manda em WEBP pequeno)
          if (!(await podeP('organizar'))) return nega('organizar');
          const u8 = new Uint8Array(buf, 0, Math.min(12, buf.byteLength)), webp = String.fromCharCode(...u8.slice(0, 4)) === 'RIFF' && String.fromCharCode(...u8.slice(8, 12)) === 'WEBP';
          if (!webp) return json({ error: { message: 'A foto precisa estar em WEBP.' } }, 400, cors);
          if (buf.byteLength > 512 * 1024) return json({ error: { message: 'Foto grande demais (máx. 512 KB).' } }, 413, cors);
          await env.EQUIPE.put(k, buf, { metadata: { tipo: 'image/webp', tam: buf.byteLength, mod: Date.now(), por: login.email, em: new Date().toISOString() } });
          return json({ ok: true, k }, 200, cors);
        }
        if (k.includes('/aud/')) { // áudio de uma fala
          if (!(await podeP('gravar'))) return nega('gravar');
          if (buf.byteLength > 20 * 1048576) return json({ error: { message: 'Áudio maior que 20 MB.' } }, 413, cors);
          // o TIPO vem do conteúdo (os primeiros bytes), não do nome: a extensão da chave precisa bater com o que o arquivo é
          const ext = k.split('.').pop(), tipo = tipoAudio(buf); if (!tipo || tipo.ext !== ext) return json({ error: { message: 'Esse arquivo não é um áudio aceito (mp3, wav, ogg, m4a ou webm).' } }, 415, cors);
          if ((await usadoEquipe(env, buf.byteLength)) + buf.byteLength > limiteEquipe(env)) return json({ error: { message: 'O espaço da equipe está cheio.' } }, 507, cors);
          await env.EQUIPE.put(k, buf, { metadata: { tipo: tipo.mime, tam: buf.byteLength, mod: Date.now(), por: login.email, em: new Date().toISOString() } });
          return json({ ok: true, k }, 200, cors);
        }
        // o preparativo inteiro (roteiro, partes, legendas)
        const [pr, po] = [await podeP('roteiro'), await podeP('organizar')]; if (!pr && !po) return nega('roteiro');
        if (buf.byteLength > 1536 * 1024) return json({ error: { message: 'Roteiro grande demais (máx. 1,5 MB). Separe em mais de um.' } }, 413, cors);
        let P; try { P = JSON.parse(new TextDecoder().decode(buf)); } catch { return json({ error: { message: 'Roteiro inválido.' } }, 400, cors); }
        if (!P || typeof P !== 'object' || P.id !== id || !Array.isArray(P.partes)) return json({ error: { message: 'Roteiro inválido.' } }, 400, cors);
        const o = await leP(id), base = +q.get('base') || 0;
        if (o && q.get('forcar') !== '1' && +(o.m.mod || 0) !== base) { const p = await semEmail({ por: o.m.por }); return json({ error: { type: 'conflito', message: 'Há uma versão mais nova deste roteiro na nuvem.', mod: +o.m.mod || 0, por: p.por || null } }, 409, cors); }
        // o que tem rota própria fica como está na nuvem: destino/pronto (só quem pode marcar), quem usou (só pela ação "usado")
        const pp = await podeP('pronto');
        P.destino = pp ? (DEST.includes(P.destino) ? P.destino : null) : (o?.P.destino || null);
        P.status = pp ? (STAT.includes(P.status) ? P.status : 'rascunho') : (o?.P.status || 'rascunho');
        P.usadoPor = Array.isArray(o?.P.usadoPor) ? o.P.usadoPor : []; P.v = 1;
        if (!pr && o) { P.roteiro = o.P.roteiro; P.partes = o.P.partes; P.nome = o.P.nome; } // quem só organiza não muda o texto (só as legendas)
        if (P.legenda) P.legenda = { ativa: P.legenda.ativa !== false, mostrarNome: P.legenda.mostrarNome === true, cores: limpaCores(P.legenda.cores), estilo: limpaEstilo(P.legenda.estilo), quadro: limpaQuadro(P.legenda.quadro) };
        const mod = await gravaP(P, o?.m);
        { const novos = {}; for (const pt of P.partes) for (const f of pt.falas || []) { const kk = chaveP(f.personagem); if (kk && !novos[kk]) novos[kk] = { nome: String(f.personagem).replace(/[<>:*#\[\]()]/g, '').trim().slice(0, 40) }; }
          if (Object.keys(novos).length) ctx.waitUntil(juntaPers(novos, true).catch(() => { })); } // personagem novo num roteiro = já aparece na lista da equipe
        if (P.legenda && Object.keys(P.legenda.cores).length && po) ctx.waitUntil(juntaCores(P.legenda.cores).catch(() => { }));
        return json({ ok: true, k, mod }, 200, cors);
      }
      if (req.method === 'DELETE') {
        if (!KPRD.test(k)) return json({ error: { message: 'Arquivo inválido' } }, 400, cors);
        const o = await leP(k.split('/')[1]).catch(() => null);
        if (!ehAdmin(env, login.email) && String(o?.m?.por || '').toLowerCase() !== String(login.email).toLowerCase()) return json({ error: { type: 'adm', message: 'Só quem criou este roteiro (ou um ADM) pode apagar.' } }, 403, cors);
        const ks = []; let cur; do { const r = await env.EQUIPE.list({ prefix: k, cursor: cur }); for (const x of r.keys) ks.push(x.name); cur = r.list_complete ? null : r.cursor; } while (cur);
        if (env.EQUIPE.deleteMuitos) await env.EQUIPE.deleteMuitos(ks, k); else for (const x of ks) await env.EQUIPE.delete(x);
        return json({ ok: true, apagados: ks.length }, 200, cors);
      }
      return json({ error: { message: 'Método não aceito.' } }, 405, cors);
    }
    // ===================== fim do bloco PREPARATIVOS =====================
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
          if (usado + buf.byteLength > limiteEquipe(env)) return json({ error: { message: 'O espaço da equipe está cheio.' } }, 507, cors);
          const k = `menu/midia/${Date.now()}_${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '_').slice(-80)}`;
          await env.EQUIPE.put(k, buf, { metadata: { nome, tipo, tam: buf.byteLength, por: login.email, em: new Date().toISOString() } });
          return json({ ok: true, k }, 200, cors);
        }
        return json({ error: { message: 'Método não aceito' } }, 405, cors);
      }
      // SÓ ADM (decisão do dono, 02/11/2026): programa marcado "só para ADMs" nem sai daqui para quem não é ADM. Antes de alguém salvar o
      // menu com a caixinha, o Jester Dreams já conta como marcado.
      const soAdmDe = l => l.soAdm ?? /jester\s*dreams/i.test(l.nome || '');
      if (req.method === 'GET') { const v = await env.EQUIPE.get('menu/links', { type: 'json' }); let ls = v?.links ? v.links.map(l => ({ ...l, soAdm: soAdmDe(l) })).filter(l => adm || (!l.soAdm && !l.invisivel)) : null; if (ls && !adm) { const pe = permSem(await permModelo(env), await permId(login.email), false); ls = ls.filter(l => !pe.programas.includes(permProgDoLink(l))); } /* NÍVEIS DE ACESSO: programa que o cargo não vê nem sai daqui */ /* invisível: nem sai para quem não é ADM (o ADM recebe só para a ADM › Menu; o menu esconde) */ return json({ links: ls, fundo: v?.fundo || null, mensagens: v?.mensagens || null, seloAdm: v?.seloAdm || null, por: (await semEmail({ por: v?.por || null })).por, em: v?.em || null, adm }, 200, { ...cors, 'cache-control': 'no-store' }); }
      if (req.method === 'PUT' || req.method === 'POST') {
        if (!adm) return semAdm();
        let b; try { b = await req.json(); } catch { return json({ error: { message: 'Pedido inválido' } }, 400, cors); }
        const ICS = ['shorts', 'editar', 'animar', 'modelar', 'link', 'jogo', 'musica', 'imagem'], txt = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
        const num = (v, a, z, d) => { v = +v; return Number.isFinite(v) ? Math.min(z, Math.max(a, v)) : d; };
        const okUrl = u => /^https?:\/\/[^\s"'<>]+$/i.test(u) || /^(?![a-z][\w+.-]*:|\/\/)[^\s"'<>]+$/i.test(u);
        const midia = m => { if (!m || typeof m !== 'object') return null; const src = txt(m.src, 500); if (!src || !(src.startsWith('kv:') ? KM.test(src.slice(3)) : /^https:\/\/[^\s"'<>]+$/i.test(src) || /^\/fundo-[a-z0-9-]+\.(jpe?g|png|webp)$/i.test(src))) return null; // /fundo-*.jpg = fotos do Estúdio (servidas pelo porteiro)
          return { tipo: m.tipo === 'video' ? 'video' : 'imagem', src, x: num(m.x, 0, 100, 50), y: num(m.y, 0, 100, 50), zoom: num(m.zoom, 1, 4, 1), blur: num(m.blur, 0, 30, 0), ...(m.nome ? { nome: txt(m.nome, 60) } : {}), ...(m.credito ? { credito: txt(m.credito, 80) } : {}) }; };
        if (!Array.isArray(b.links) || b.links.length > 24) return json({ error: { message: 'Lista de links inválida (máximo 24).' } }, 400, cors);
        const links = [];
        for (const l of b.links) {
          const nome = txt(l?.nome, 40), url = txt(l?.url, 500);
          if (!nome) return json({ error: { message: 'Todo link precisa de um nome.' } }, 400, cors);
          if (url && !okUrl(url)) return json({ error: { message: `Endereço inválido em "${nome}". Use https://...` } }, 400, cors);
          links.push({ nome, soAdm: !!l?.soAdm, ...(l?.invisivel ? { invisivel: true } : {}), desc: txt(l?.desc, 80), url: url || null, icone: ICS.includes(l?.icone) ? l.icone : 'link', embreve: !!l?.embreve, modo: ['sempre', 'blur', 'blurHover', 'hover'].includes(l?.modo) ? l.modo : 'sempre', iconeImg: (m => m && { src: m.src })(midia(l?.iconeImg)), iconeTam: num(l?.iconeTam, 30, 100, 62), iconeCaixa: l?.iconeCaixa !== false, fundo: midia(l?.fundo), escurecer: num(l?.escurecer, 0, .9, .45), ...(txt(l?.etiqueta, 20) ? { etiqueta: txt(l.etiqueta, 20) } : {}), ...(typeof l?.externo === 'boolean' ? { externo: l.externo } : {}), ...((p => { const o = {}; for (const k of ['atelie', 'cenarios']) { const e = txt(p?.[k]?.etiqueta, 20); if (e) o[k] = { etiqueta: e }; } return Object.keys(o).length ? { partes: o } : {}; })(l?.partes)) }); // etiqueta: ex. "em testes"; partes: selo das partes de dentro (ADM › Botões, no Animador)
        }
        const f = b.fundo || {}, fundo = { modo: ['nenhum', 'um', 'slideshow', 'aleatorio'].includes(f.modo) ? f.modo : 'nenhum', intervalo: num(f.intervalo, 2, 120, 8), escurecer: num(f.escurecer, 0, .9, .55), itens: (Array.isArray(f.itens) ? f.itens : []).slice(0, 20).map(midia).filter(Boolean) };
        const mg = b.mensagens || {}, mensagens = { boasVindas: txt(mg.boasVindas, 160), intervalo: num(mg.intervalo, 3, 60, 7),
          frases: (Array.isArray(mg.frases) ? mg.frases : []).map(x => txt(x, 140)).filter(Boolean).slice(0, 40) };
        const sa = b.seloAdm || {}, seloAdm = { texto: txt(sa.texto, 16) || 'ADM', ...(/^#[0-9a-f]{6}$/i.test(sa.cor || '') ? { cor: sa.cor.toLowerCase() } : {}) }; // selo ADM no título do menu (texto e cor)
        const v = { links, fundo, mensagens, seloAdm, por: login.email, em: new Date().toISOString() };
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
      if (b.de === 'preparativos' && typeof pode === 'function' && !(await pode(env, login.email, 'preparativos.transcrever'))) return json({ error: { type: 'permissao', message: 'Sua conta não pode usar a transcrição nos Preparativos. Peça para um ADM liberar.' } }, 403, cors);
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
    if (login.email && !(await pode(env, login.email, 'geral.ia'))) return json({ error: { type: 'permissao', message: 'O seu cargo não pode usar esta função. Peça para um ADM liberar em ADM › Níveis de acesso.' } }, 403, cors); // NÍVEIS DE ACESSO
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
      const j = await r.json().catch(() => ({ error: { message: 'A nuvem respondeu de um jeito inesperado. Tente de novo.' } }));
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
