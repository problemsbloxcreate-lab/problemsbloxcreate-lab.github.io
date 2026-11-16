/* SÓ PARA TESTE: faz o papel da PESSOA que toca em Permitir (ou em Cancelar) na tela do Estúdio, para testar o cerebro.mjs sem navegador.
   Uso (é o que o CEREBRO_ABRIR chama):  node clica-permitir.mjs "<endereço de autorização>"      CLICA=cancelar  QUEM=maria|dona|joao */
const url = process.argv[2], quem = process.env.QUEM || 'maria', cancelar = process.env.CLICA === 'cancelar';
const r = await fetch(url, { redirect: 'manual' }); const loc = r.headers.get('location'); if (!loc) { console.error('sem redirecionamento: ' + r.status); process.exit(1); }
const q = new URL(loc).searchParams, origem = new URL(url).origin;
const corpo = Object.fromEntries(['client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'resource', 'scope'].map(k => [k, q.get(k) || undefined]));
const login = await (await fetch(origem + '/_teste/login?quem=' + quem)).text();
const a = await fetch(origem + '/cerebro/oauth/aprovar', { method: 'POST', headers: { 'content-type': 'application/json', origin: origem, authorization: login }, body: JSON.stringify({ ...corpo, ...(cancelar ? { negar: true } : { rotulo: 'PC de teste' }) }) });
const j = await a.json(); if (!a.ok) { console.error('aprovar falhou: ' + JSON.stringify(j)); process.exit(1); }
await fetch(j.redirect).then(x => x.text()).catch(() => { }); // o navegador seguiria o retorno para o endereço do computador
