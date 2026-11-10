// MEDIR O GASTO (10/11/2026, tarefa "pedidos da principal"): SÓ LÊ, não muda nada na nuvem. Junta, da conta principal:
//  - pedidos por Worker e por dia, leituras/gravações do banco por dia, mensagens (Durable Objects) e KV por dia;
//  - o Analytics Engine `porteiro_pedidos` (amostra de 20% do porteiro: tipo de caminho + status);
//  - quantos arquivos há no banco por começo de nome e os que estão no banco mas sumiram do KV antigo (candidatos a
//    "apagado que reapareceu" depois que a devolução de 09/11 aplicou 437 apagadas no KV em vez do banco).
// Este repositório é PÚBLICO: o resultado sai CIFRADO com a chave pública passada na entrada `chave` (só quem tem a chave
// privada lê). No log aberto aparecem só os totais do dia por conta.
import crypto from 'node:crypto';
const { T, A, CHAVE } = process.env, API = 'https://api.cloudflare.com/client/v4';
const hd = { authorization: 'Bearer ' + T, 'content-type': 'application/json' };
const DESDE = '2026-11-06';
const gql = async (q, v = {}) => { const r = await fetch(API + '/graphql', { method: 'POST', headers: hd, body: JSON.stringify({ query: q, variables: { a: A, d: DESDE, ...v } }) }); const j = await r.json(); return j.errors ? { erro: JSON.stringify(j.errors).slice(0, 300), ...(j.data || {}) } : j.data; };
const out = { em: new Date().toISOString() };
// 1) por dia
const g = await gql(`query($a:String!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){
  w:workersInvocationsAdaptive(limit:5000,filter:{date_geq:$d}){sum{requests errors subrequests cpuTimeUs}dimensions{date scriptName}}
  d:d1AnalyticsAdaptiveGroups(limit:5000,filter:{date_geq:$d}){sum{rowsRead rowsWritten readQueries writeQueries}dimensions{date databaseId}}
  o:durableObjectsInvocationsAdaptiveGroups(limit:5000,filter:{date_geq:$d}){sum{requests}dimensions{date}}
  k:kvOperationsAdaptiveGroups(limit:5000,filter:{date_geq:$d}){sum{requests}dimensions{date actionType}}}}}`);
if (g?.erro) out.erroGql = g.erro;
const acc = g?.viewer?.accounts?.[0] || {};
const bancos = (await (await fetch(`${API}/accounts/${A}/d1/database?per_page=100`, { headers: hd })).json()).result || [];
const nomeBanco = Object.fromEntries(bancos.map(b => [b.uuid, b.name]));
out.workers = (acc.w || []).map(x => ({ dia: x.dimensions.date, w: x.dimensions.scriptName, pedidos: x.sum.requests, erros: x.sum.errors, sub: x.sum.subrequests, cpuMs: Math.round(x.sum.cpuTimeUs / 1000) }));
out.d1 = (acc.d || []).map(x => ({ dia: x.dimensions.date, banco: nomeBanco[x.dimensions.databaseId] || x.dimensions.databaseId.slice(0, 8), ...x.sum }));
out.do = (acc.o || []).map(x => ({ dia: x.dimensions.date, n: x.sum.requests }));
out.kv = (acc.k || []).map(x => ({ dia: x.dimensions.date, t: x.dimensions.actionType, n: x.sum.requests }));
// 2) Analytics Engine
const ae = async sql => { const r = await fetch(`${API}/accounts/${A}/analytics_engine/sql`, { method: 'POST', headers: { authorization: 'Bearer ' + T }, body: sql }); const t = await r.text(); try { return JSON.parse(t).data; } catch { return { erro: r.status + ' ' + t.slice(0, 300) }; } };
out.aeDia = await ae(`SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS dia, SUM(_sample_interval) AS n FROM porteiro_pedidos GROUP BY dia ORDER BY dia`);
out.aeHoje = await ae(`SELECT blob1 AS rota, blob2 AS st, SUM(_sample_interval) AS n FROM porteiro_pedidos WHERE timestamp > NOW() - INTERVAL '1' DAY GROUP BY rota, st ORDER BY n DESC LIMIT 120`);
out.ae3d = await ae(`SELECT blob1 AS rota, blob2 AS st, SUM(_sample_interval) AS n FROM porteiro_pedidos WHERE timestamp > NOW() - INTERVAL '3' DAY GROUP BY rota, st ORDER BY n DESC LIMIT 120`);
out.aeHora = await ae(`SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS h, SUM(_sample_interval) AS n FROM porteiro_pedidos WHERE timestamp > NOW() - INTERVAL '1' DAY GROUP BY h ORDER BY h`);
// 3) banco "equipe" e KV antigo (só leitura)
const eq = bancos.find(b => b.name === 'equipe');
const q = async (sql, params = []) => { const j = await (await fetch(`${API}/accounts/${A}/d1/database/${eq.uuid}/query`, { method: 'POST', headers: hd, body: JSON.stringify({ sql, params }) })).json(); if (!j.success) throw new Error(JSON.stringify(j.errors).slice(0, 200)); return j.result[0].results; };
if (eq) {
  const arq = await q('SELECT k, meta, em, onde, tam FROM arq');
  const por = {}; for (const x of arq) { const p = x.k.split('/')[0]; por[p] = (por[p] || 0) + 1; }
  out.banco = { total: arq.length, porComeco: por, onde: arq.reduce((o, x) => (o[x.onde || 'p'] = (o[x.onde || 'p'] || 0) + 1, o), {}) };
  out.copiaBase = ['personagens/', 'acesso/', 'menu/'].map(p => [p, arq.filter(x => x.k.startsWith(p)).length]);
  try { out.apagados3d = (await q('SELECT count(*) AS n, min(em) AS de, max(em) AS ate FROM apagados'))[0]; } catch (e) { out.apagados3d = String(e.message); }
  try { out.cfgCasas = await q("SELECT k, substr(v,1,200) AS v FROM cfg WHERE k IN ('casas','plano-uso')"); } catch { }
  const st = await (await fetch(`${API}/accounts/${A}/workers/scripts/turma-ia/settings`, { headers: hd })).json();
  const ns = (st.result?.bindings || []).find(b => b.name === 'EQUIPE')?.namespace_id;
  if (ns) { const kv = new Set(); let cur = '';
    do { const r = await (await fetch(`${API}/accounts/${A}/storage/kv/namespaces/${ns}/keys?limit=1000${cur ? '&cursor=' + cur : ''}`, { headers: hd })).json(); if (!r.success) break; for (const k of r.result) kv.add(k.name); cur = r.result_info?.cursor || ''; } while (cur);
    const quando = x => { let m = null; try { m = JSON.parse(x.meta || 'null'); } catch { } return +(m?.mod || 0) || Date.parse(m?.em || '') || 0; };
    const falta = arq.filter(x => !kv.has(x.k) && !x.k.startsWith('resgate-kv/'));
    const c29 = Date.parse('2026-10-29T00:00:00Z'), c07 = Date.parse('2026-11-07T00:00:00Z');
    out.kvAntigo = { chaves: kv.size, noBancoSemKV: falta.length,
      // sem data ou de antes de 29/10 (quando o KV parou): estavam no KV e sumiram = apagadas no KV
      antigos: falta.filter(x => { const t = quando(x); return !t || t < c29; }).map(x => ({ k: x.k, quando: quando(x), em: x.em })),
      // entre 29/10 e 07/11: podem ser novos (nunca foram ao KV) — só a contagem por começo
      meio: Object.entries(falta.filter(x => { const t = quando(x); return t >= c29 && t < c07; }).reduce((o, x) => (o[x.k.split('/')[0]] = (o[x.k.split('/')[0]] || 0) + 1, o), {})) };
    out.resgateKv = arq.filter(x => x.k.startsWith('resgate-kv/')).map(x => x.k);
  }
}
// log aberto: só totais por dia
const dias = {}; for (const x of out.workers) dias[x.dia] = (dias[x.dia] || 0) + x.pedidos;
console.log('Pedidos por dia (todos os Workers da principal):', JSON.stringify(dias));
// cifrado
const pub = Buffer.from(CHAVE || '', 'base64').toString();
const k = crypto.randomBytes(32), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, iv);
const corpo = Buffer.concat([c.update(JSON.stringify(out)), c.final()]), tag = c.getAuthTag();
const ck = crypto.publicEncrypt({ key: pub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, k);
const tudo = Buffer.concat([Buffer.from([ck.length >> 8, ck.length & 255]), ck, iv, tag, corpo]).toString('base64');
console.log('---CIFRADO---'); for (let i = 0; i < tudo.length; i += 3000) console.log('C:' + tudo.slice(i, i + 3000)); console.log('---FIM---');
