const { T, A } = process.env, d = '2026-11-09';
const gql = async q => { const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: 'Bearer ' + T, 'content-type': 'application/json' }, body: JSON.stringify({ query: q, variables: { a: A, d } }) }); return r.json(); };
const tipos = ['AccountWorkersInvocationsAdaptiveSum', 'AccountWorkersInvocationsAdaptive'];
const campos = async n => { const j = await gql(`{__type(name:"${n}"){fields{name}}}`); return (j.data?.__type?.fields || []).map(f => f.name).join(','); };
console.log('sum workers:', await campos('AccountWorkersInvocationsAdaptiveSum'));
for (const [nome, q] of Object.entries({
  workers: 'w:workersInvocationsAdaptive(limit:10000,filter:{date_geq:$d}){sum{requests cpuTime}}',
  d1: 'x:d1AnalyticsAdaptiveGroups(limit:1000,filter:{date_geq:$d}){sum{rowsRead rowsWritten}}',
  kv: 'x:kvOperationsAdaptiveGroups(limit:1000,filter:{date_geq:$d}){sum{requests}dimensions{actionType}}',
  dobj: 'x:durableObjectsInvocationsAdaptiveGroups(limit:1000,filter:{date_geq:$d}){sum{requests}}',
  ai: 'x:aiInferenceAdaptiveGroups(limit:1000,filter:{date_geq:$d}){sum{totalNeurons}}',
  r2: 'x:r2OperationsAdaptiveGroups(limit:1000,filter:{date_geq:$d}){sum{requests}dimensions{actionType}}',
})) { const j = await gql(`query($a:String!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){${q}}}}`); const a = j.data?.viewer?.accounts?.[0]; console.log(nome + ':', j.errors ? 'ERRO ' + JSON.stringify(j.errors).slice(0, 180) : JSON.stringify(a).slice(0, 260)); }
