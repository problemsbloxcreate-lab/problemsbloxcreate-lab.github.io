// VIGIA DO PLANO PAGO (pedido da dona, 09/11/2026): soma o que a conta principal gastou no ciclo de cobrança (começa todo dia 9) e guarda
// no banco (cfg 'plano-uso'). O turma-ia lê isso e pausa o Estúdio aos 95% de qualquer item, até um ADM aceitar que o excedente será cobrado.
// Só números no log. Roda neste repositório (público) porque aqui os minutos de automação não acabam.
const { T, A } = process.env, API = 'https://api.cloudflare.com/client/v4', DIA_CICLO = 9;
const hd = { authorization: 'Bearer ' + T, 'content-type': 'application/json' };
const agora = new Date(); let ini = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), DIA_CICLO)); if (agora.getUTCDate() < DIA_CICLO) ini = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, DIA_CICLO));
const fim = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth() + 1, DIA_CICLO)), d = ini.toISOString().slice(0, 10);
const gql = async q => { const r = await fetch(API.replace('/client/v4', '/client/v4/graphql'), { method: 'POST', headers: hd, body: JSON.stringify({ query: `query($a:String!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){${q}}}}`, variables: { a: A, d } }) }); const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 200)); return j.data.viewer.accounts[0]; };
const f = 'filter:{date_geq:$d}', soma = (L, c) => (L || []).reduce((t, x) => t + (+x.sum[c] || 0), 0);
const a = await gql(`w:workersInvocationsAdaptive(limit:10000,${f}){sum{requests cpuTimeUs}} d:d1AnalyticsAdaptiveGroups(limit:1000,${f}){sum{rowsRead rowsWritten}} k:kvOperationsAdaptiveGroups(limit:1000,${f}){sum{requests}dimensions{actionType}} o:durableObjectsInvocationsAdaptiveGroups(limit:1000,${f}){sum{requests}}`);
const kv = t => (a.k || []).filter(x => x.dimensions.actionType === t).reduce((s, x) => s + x.sum.requests, 0);
const bancos = (await (await fetch(`${API}/accounts/${A}/d1/database?per_page=100`, { headers: hd })).json()).result || [], eq = bancos.find(x => x.name === 'equipe');
if (!eq) throw new Error('não achei o banco equipe');
const itens = {
  pedidos: { nome: 'Pedidos', v: soma(a.w, 'requests'), lim: 1e7 },
  cpu: { nome: 'Tempo de processamento (ms)', v: Math.round(soma(a.w, 'cpuTimeUs') / 1000), lim: 3e7 },
  leituras: { nome: 'Leituras do banco', v: soma(a.d, 'rowsRead'), lim: 25e9 },
  gravacoes: { nome: 'Gravações do banco', v: soma(a.d, 'rowsWritten'), lim: 5e7 },
  espaco: { nome: 'Espaço do banco (bytes)', v: bancos.reduce((t, x) => t + (+x.file_size || 0), 0), lim: 5368709120 },
  mensagens: { nome: 'Mensagens e presença', v: soma(a.o, 'requests'), lim: 1e6 },
  kvLeituras: { nome: 'KV: leituras', v: kv('read'), lim: 1e7 }, kvGravacoes: { nome: 'KV: gravações', v: kv('write'), lim: 1e6 }, kvListas: { nome: 'KV: listas', v: kv('list'), lim: 1e6 }, kvApagadas: { nome: 'KV: apagadas', v: kv('delete'), lim: 1e6 },
};
const resumo = { em: Date.now(), ciclo: d, fim: fim.toISOString().slice(0, 10), itens };
const r = await (await fetch(`${API}/accounts/${A}/d1/database/${eq.uuid}/query`, { method: 'POST', headers: hd, body: JSON.stringify({ sql: "INSERT OR REPLACE INTO cfg (k, v) VALUES ('plano-uso', ?)", params: [JSON.stringify(resumo)] }) })).json();
if (!r.success) throw new Error('não gravei: ' + JSON.stringify(r.errors).slice(0, 200));
for (const [, x] of Object.entries(itens)) console.log(`${x.nome}: ${x.v.toLocaleString('pt-BR')} de ${x.lim.toLocaleString('pt-BR')} (${(x.v / x.lim * 100).toFixed(2)}%)`);
console.log('ciclo', d, 'até', resumo.fim);
