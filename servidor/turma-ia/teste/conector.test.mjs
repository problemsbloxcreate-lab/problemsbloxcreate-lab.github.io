/* Testes do conector do Cérebro (MCP + OAuth). Rodam o worker.js DE VERDADE (o mesmo código que vai para a Cloudflare), com um banco SQLite em memória
   e logins do Google falsos. Como rodar:   node --test teste/conector.test.mjs      (na pasta servidor/turma-ia, Node 22 ou mais novo)  */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { novoAmbiente, loginDe, ctx, novoPkce, rede, PESSOAS } from './ambiente.mjs';
import worker from '../worker.js';
import { CB_ESCOPO, cnReinicia } from '../conector.js';

const BASE = 'http://localhost:8787', ORIGEM_SITE = 'https://estudio.problemsraiz.workers.dev';
const env = novoAmbiente({ CONECTOR_REGISTROS_POR_MIN: '100000' });
let W = worker; // o worker usado nas chamadas (um teste troca por uma cópia nova do módulo)
const chamar = async (caminho, { metodo, cab = {}, corpo, form } = {}) => {
  const init = { method: metodo || (corpo || form ? 'POST' : 'GET'), headers: { ...cab } };
  if (corpo !== undefined) { init.body = JSON.stringify(corpo); init.headers['content-type'] = 'application/json'; }
  if (form) { init.body = new URLSearchParams(form).toString(); init.headers['content-type'] = 'application/x-www-form-urlencoded'; }
  const r = await W.fetch(new Request(BASE + caminho, init), env, ctx), t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { }
  return { status: r.status, h: r.headers, t, j };
};
const rpc = (token, metodo, params, id = 1, extraCab = {}) => chamar('/cerebro/mcp', { corpo: { jsonrpc: '2.0', id, method: metodo, params }, cab: { authorization: 'Bearer ' + token, accept: 'application/json, text/event-stream', ...extraCab } });
const ferramenta = async (token, nome, args = {}) => { const r = await rpc(token, 'tools/call', { name: nome, arguments: args }); assert.equal(r.status, 200, r.t); return r.j.result; };
const texto = r => r.content.map(c => c.text).join('\n');
const regs = { ia: 'Claude Teste 1', pedidoPor: 'Dona Teste', motivo: 'teste automático do conector' };

// conecta uma pessoa pelo fluxo inteiro (registro → autorizar → aprovar → token) e devolve os tokens
async function conectar(quem, { porta = 51234, rotulo, nome = 'Claude Code' } = {}) {
  const redirect = `http://localhost:${porta}/callback`;
  const reg = await chamar('/cerebro/oauth/registrar', { corpo: { client_name: nome, redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' } });
  assert.equal(reg.status, 201, reg.t); const clientId = reg.j.client_id, pk = await novoPkce(), state = 'estado-' + Math.random().toString(36).slice(2);
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirect, code_challenge: pk.challenge, code_challenge_method: 'S256', state, resource: BASE + '/cerebro/mcp', scope: 'cerebro' });
  const aut = await chamar('/cerebro/oauth/autorizar?' + q); assert.equal(aut.status, 302, aut.t);
  const aprov = await chamar('/cerebro/oauth/aprovar', { corpo: { client_id: clientId, redirect_uri: redirect, code_challenge: pk.challenge, code_challenge_method: 'S256', state, resource: BASE + '/cerebro/mcp', rotulo }, cab: { origin: ORIGEM_SITE, authorization: await loginDe(quem) } });
  assert.equal(aprov.status, 200, aprov.t); const volta = new URL(aprov.j.redirect); assert.equal(volta.searchParams.get('state'), state); assert.equal(volta.searchParams.get('iss'), BASE);
  const tok = await chamar('/cerebro/oauth/token', { form: { grant_type: 'authorization_code', code: volta.searchParams.get('code'), redirect_uri: redirect, client_id: clientId, code_verifier: pk.verifier, resource: BASE + '/cerebro/mcp' } });
  assert.equal(tok.status, 200, tok.t); return { ...tok.j, clientId, redirect, pk };
}

test('0. o texto de escopo das regras é igual ao AVISO_FIXO do cerebro.mjs (as duas portas dizem a mesma coisa)', () => {
  const mjs = readFileSync(new URL('../../../cerebro/cerebro.mjs', import.meta.url), 'utf8'), m = /const AVISO_FIXO = '((?:[^'\\]|\\.)*)';/.exec(mjs); assert.ok(m, 'não achei AVISO_FIXO');
  const aviso = m[1].replace(/\\'/g, "'"); assert.ok(aviso.startsWith(CB_ESCOPO), 'CB_ESCOPO saiu diferente do começo do AVISO_FIXO');
});

test('1. metadados OAuth no lugar certo (recurso com sufixo e sem sufixo, servidor de autorização)', async () => {
  for (const p of ['/.well-known/oauth-protected-resource/cerebro/mcp', '/.well-known/oauth-protected-resource']) { const r = await chamar(p); assert.equal(r.status, 200); assert.equal(r.j.resource, BASE + '/cerebro/mcp'); assert.deepEqual(r.j.authorization_servers, [BASE]); }
  for (const p of ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration', '/.well-known/oauth-authorization-server/cerebro/mcp']) { const r = await chamar(p); assert.equal(r.status, 200); assert.equal(r.j.issuer, BASE); assert.deepEqual(r.j.code_challenge_methods_supported, ['S256']); assert.ok(r.j.registration_endpoint && r.j.token_endpoint && r.j.authorization_endpoint); assert.equal(r.j.authorization_response_iss_parameter_supported, true); }
});

test('2. sem token, o MCP responde 401 com o desafio (resource_metadata e scope); GET e token falso também', async () => {
  const r = await chamar('/cerebro/mcp', { corpo: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} } }); assert.equal(r.status, 401);
  const w = r.h.get('www-authenticate'); assert.match(w, /^Bearer /); assert.match(w, /resource_metadata="http:\/\/localhost:8787\/\.well-known\/oauth-protected-resource\/cerebro\/mcp"/); assert.match(w, /scope="cerebro"/);
  const f = await rpc('cbt_' + 'a'.repeat(43), 'ping'); assert.equal(f.status, 401); assert.match(f.h.get('www-authenticate'), /error="invalid_token"/);
  const g = await chamar('/cerebro/mcp'); assert.equal(g.status, 401);
});

test('3. registro: só endereços de retorno seguros', async () => {
  for (const ruim of ['https://evil.example/cb', 'http://evil.example/cb', 'javascript:alert(1)', 'http://localhost:1/cb#x', 'https://claude.ai/outra/coisa', 'myapp://cb']) { const r = await chamar('/cerebro/oauth/registrar', { corpo: { client_name: 'X', redirect_uris: [ruim] } }); assert.equal(r.status, 400, ruim); assert.equal(r.j.error, 'invalid_redirect_uri'); }
  const mist = await chamar('/cerebro/oauth/registrar', { corpo: { client_name: 'X', redirect_uris: ['http://localhost:1/cb', 'https://evil.example/cb'] } }); assert.equal(mist.status, 400);
  const seg = await chamar('/cerebro/oauth/registrar', { corpo: { client_name: 'X', redirect_uris: ['http://localhost:1/cb'], token_endpoint_auth_method: 'client_secret_basic' } }); assert.equal(seg.status, 400);
  for (const bom of ['http://localhost:5555/callback', 'http://127.0.0.1/callback', 'http://[::1]:7/callback', 'https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback']) { const r = await chamar('/cerebro/oauth/registrar', { corpo: { client_name: 'Claude <b>x</b>', redirect_uris: [bom] } }); assert.equal(r.status, 201, bom + ' ' + r.t); assert.equal(r.j.token_endpoint_auth_method, 'none'); assert.ok(!/[<>]/.test(r.j.client_name)); }
});

test('4. /autorizar: manda para a tela do site; endereço trocado e PKCE faltando são recusados', async () => {
  const reg = (await chamar('/cerebro/oauth/registrar', { corpo: { client_name: 'Claude Code', redirect_uris: ['http://localhost:4000/callback'] } })).j, pk = await novoPkce();
  const base = { response_type: 'code', client_id: reg.client_id, redirect_uri: 'http://localhost:4000/callback', code_challenge: pk.challenge, code_challenge_method: 'S256', state: 's1', resource: BASE + '/cerebro/mcp' };
  const ok = await chamar('/cerebro/oauth/autorizar?' + new URLSearchParams(base)); assert.equal(ok.status, 302); const dest = new URL(ok.h.get('location'));
  assert.equal(dest.origin + dest.pathname, ORIGEM_SITE + '/cerebro/conectar.html'); assert.equal(dest.searchParams.get('client_id'), reg.client_id); assert.equal(dest.searchParams.get('programa'), 'Claude Code'); assert.equal(dest.searchParams.get('state'), 's1');
  const outraPorta = await chamar('/cerebro/oauth/autorizar?' + new URLSearchParams({ ...base, redirect_uri: 'http://127.0.0.1:61000/callback' })); assert.equal(outraPorta.status, 302, 'localhost e 127.0.0.1 em qualquer porta valem');
  for (const mudanca of [{ redirect_uri: 'http://localhost:4000/outro' }, { redirect_uri: 'https://evil.example/callback' }, { client_id: 'cbc_naoexiste_naoexiste' }]) { const r = await chamar('/cerebro/oauth/autorizar?' + new URLSearchParams({ ...base, ...mudanca })); assert.equal(r.status, 400, JSON.stringify(mudanca)); assert.match(r.t, /Não deu para conectar/); }
  const semPkce = await chamar('/cerebro/oauth/autorizar?' + new URLSearchParams({ ...base, code_challenge_method: 'plain' })); assert.equal(semPkce.status, 302); assert.equal(new URL(semPkce.h.get('location')).searchParams.get('error'), 'invalid_request'); assert.equal(new URL(semPkce.h.get('location')).searchParams.get('iss'), BASE);
  const outroRecurso = await chamar('/cerebro/oauth/autorizar?' + new URLSearchParams({ ...base, resource: 'https://outro.example/mcp' })); assert.equal(new URL(outroRecurso.h.get('location')).searchParams.get('error'), 'invalid_target');
  const comBarra = await chamar('/cerebro/oauth/autorizar?' + new URLSearchParams({ ...base, resource: BASE + '/cerebro/mcp/' })); assert.equal(comBarra.status, 302); assert.equal(new URL(comBarra.h.get('location')).origin, ORIGEM_SITE);
});

test('5. /aprovar: só com login do Google conferido, e-mail liberado e cargo com o Cérebro', async () => {
  const reg = (await chamar('/cerebro/oauth/registrar', { corpo: { client_name: 'Claude Code', redirect_uris: ['http://localhost:4001/callback'] } })).j, pk = await novoPkce();
  const corpo = { client_id: reg.client_id, redirect_uri: 'http://localhost:4001/callback', code_challenge: pk.challenge, code_challenge_method: 'S256', state: 'x', resource: BASE + '/cerebro/mcp' };
  assert.equal((await chamar('/cerebro/oauth/aprovar', { corpo, cab: { origin: ORIGEM_SITE } })).status, 401, 'sem login');
  assert.equal((await chamar('/cerebro/oauth/aprovar', { corpo, cab: { origin: ORIGEM_SITE, authorization: 'Bearer abc.def.ghi' } })).status, 401, 'token lixo');
  assert.equal((await chamar('/cerebro/oauth/aprovar', { corpo, cab: { origin: ORIGEM_SITE, authorization: await loginDe('intruso') } })).status, 401, 'e-mail fora da lista');
  assert.equal((await chamar('/cerebro/oauth/aprovar', { corpo, cab: { origin: 'https://evil.example', authorization: await loginDe('maria') } })).status, 403, 'origem desconhecida');
  assert.equal((await chamar('/cerebro/oauth/aprovar', { corpo, cab: { authorization: await loginDe('maria') } })).status, 403, 'sem Origin');
  assert.equal((await chamar('/cerebro/oauth/aprovar', { corpo: { ...corpo, redirect_uri: 'https://evil.example/cb' }, cab: { origin: ORIGEM_SITE, authorization: await loginDe('maria') } })).status, 400, 'endereço trocado');
  assert.equal((await chamar('/cerebro/oauth/aprovar', { corpo: { ...corpo, code_challenge_method: 'plain' }, cab: { origin: ORIGEM_SITE, authorization: await loginDe('maria') } })).status, 400, 'sem PKCE S256');
  const mal = await worker.fetch(new Request(BASE + '/cerebro/oauth/aprovar', { method: 'POST', headers: { origin: ORIGEM_SITE, authorization: await loginDe('maria'), 'content-type': 'application/json' }, body: '{lixo' }), env, ctx); assert.equal(mal.status, 400);
  const negou = await chamar('/cerebro/oauth/aprovar', { corpo: { ...corpo, negar: true }, cab: { origin: ORIGEM_SITE } }); assert.equal(negou.status, 200); assert.equal(new URL(negou.j.redirect).searchParams.get('error'), 'access_denied');
  const bom = await chamar('/cerebro/oauth/aprovar', { corpo, cab: { origin: ORIGEM_SITE, authorization: await loginDe('maria') } }); assert.equal(bom.status, 200); assert.ok(new URL(bom.j.redirect).searchParams.get('code').startsWith('cbk_'));
  const pre = await chamar('/cerebro/oauth/aprovar', { metodo: 'OPTIONS', cab: { origin: ORIGEM_SITE, 'access-control-request-method': 'POST' } }); assert.equal(pre.status, 204); assert.equal(pre.h.get('access-control-allow-origin'), ORIGEM_SITE);
});

test('6. /token: PKCE, código de uma vez só, endereço e programa conferidos', async () => {
  const redirect = 'http://localhost:4002/callback', cli = (await chamar('/cerebro/oauth/registrar', { corpo: { client_name: 'A', redirect_uris: [redirect] } })).j.client_id, outro = (await chamar('/cerebro/oauth/registrar', { corpo: { client_name: 'B', redirect_uris: [redirect] } })).j.client_id;
  const novoCodigo = async (pk) => { const r = await chamar('/cerebro/oauth/aprovar', { corpo: { client_id: cli, redirect_uri: redirect, code_challenge: pk.challenge, code_challenge_method: 'S256', state: 'e' }, cab: { origin: ORIGEM_SITE, authorization: await loginDe('maria') } }); return new URL(r.j.redirect).searchParams.get('code'); };
  const pk = await novoPkce(), troca = (p) => chamar('/cerebro/oauth/token', { form: { grant_type: 'authorization_code', client_id: cli, redirect_uri: redirect, ...p } });
  let c = await novoCodigo(pk); let r = await troca({ code: c, code_verifier: (await novoPkce()).verifier }); assert.equal(r.status, 400); assert.equal(r.j.error, 'invalid_grant'); // PKCE errado
  r = await troca({ code: c, code_verifier: pk.verifier }); assert.equal(r.status, 400, 'o código errado já foi gasto na tentativa com PKCE errado'); // código gasto
  c = await novoCodigo(pk); r = await troca({ code: c, code_verifier: pk.verifier, redirect_uri: 'http://localhost:9999/outro' }); assert.equal(r.status, 400, 'redirect_uri diferente');
  c = await novoCodigo(pk); r = await chamar('/cerebro/oauth/token', { form: { grant_type: 'authorization_code', client_id: outro, redirect_uri: redirect, code: c, code_verifier: pk.verifier } }); assert.equal(r.status, 400, 'outro programa não troca o código');
  c = await novoCodigo(pk); r = await troca({ code: c, code_verifier: pk.verifier }); assert.equal(r.status, 200); assert.equal(r.j.token_type, 'Bearer'); assert.equal(r.j.expires_in, 3600); assert.match(r.j.access_token, /^cbt_/); assert.match(r.j.refresh_token, /^cbr_/); assert.equal(r.h.get('cache-control'), 'no-store');
  assert.equal((await troca({ code: c, code_verifier: pk.verifier })).status, 400, 'segunda troca do mesmo código');
  const x = await chamar('/cerebro/oauth/token', { form: { grant_type: 'password', client_id: cli } }); assert.equal(x.j.error, 'unsupported_grant_type');
  const y = await chamar('/cerebro/oauth/token', { form: { grant_type: 'authorization_code', client_id: 'cbc_naoexiste_naoexiste' } }); assert.equal(y.status, 401);
});

let maria, dona; // as conexões usadas nos testes seguintes

test('7. MCP: initialize (versões), instruções com o escopo, notificação 202, ping e a lista de 9 ferramentas', async () => {
  maria = await conectar('maria', { rotulo: 'notebook da Maria' }); dona = await conectar('dona', { porta: 51999, rotulo: 'PC da dona' });
  const i = await rpc(maria.access_token, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'teste', version: '1' } }, 1, { 'mcp-protocol-version': '2025-11-25' });
  assert.equal(i.status, 200, i.t); assert.equal(i.j.result.protocolVersion, '2025-11-25'); assert.ok(i.j.result.capabilities.tools); assert.ok(i.j.result.instructions.startsWith(CB_ESCOPO)); assert.match(i.j.result.instructions, /Maria Teste/); assert.match(i.j.result.instructions, /não é ADM/); assert.ok(i.j.result.instructions.length < 4000, 'o Claude Code corta em 4096 letras');
  const velha = await rpc(maria.access_token, 'initialize', { protocolVersion: '2024-11-05' }); assert.equal(velha.j.result.protocolVersion, '2024-11-05');
  const futura = await rpc(maria.access_token, 'initialize', { protocolVersion: '2099-01-01' }); assert.equal(futura.j.result.protocolVersion, '2025-11-25', 'versão desconhecida: responde com a nossa mais nova');
  const id = await rpc(dona.access_token, 'initialize', { protocolVersion: '2025-11-25' }); assert.match(id.j.result.instructions, /Dona Teste/); assert.match(id.j.result.instructions, /ADM: grava direto/);
  const modern = await rpc(maria.access_token, 'server/discover', {}, 9, { 'mcp-protocol-version': '2026-07-28' }); assert.equal(modern.status, 400, 'a revisão 2026-07-28 é recusada com 400: o cliente volta ao modo antigo');
  const nota = await chamar('/cerebro/mcp', { corpo: { jsonrpc: '2.0', method: 'notifications/initialized' }, cab: { authorization: 'Bearer ' + maria.access_token } }); assert.equal(nota.status, 202); assert.equal(nota.t, '');
  const resp = await chamar('/cerebro/mcp', { corpo: { jsonrpc: '2.0', id: 'x', result: {} }, cab: { authorization: 'Bearer ' + maria.access_token } }); assert.equal(resp.status, 202);
  assert.deepEqual((await rpc(maria.access_token, 'ping')).j.result, {});
  const l = await rpc(maria.access_token, 'tools/list'); const nomes = l.j.result.tools.map(t => t.name); assert.deepEqual(nomes, ['comece', 'indice', 'buscar', 'ler', 'salvar', 'aprender', 'renomear', 'pedidos', 'feito']);
  for (const t of l.j.result.tools) { assert.equal(t.inputSchema.type, 'object'); assert.ok(t.description.length < 700); assert.equal(typeof t.annotations.readOnlyHint, 'boolean'); assert.equal(t.annotations.destructiveHint, false); }
  for (const w of ['salvar', 'aprender', 'renomear']) assert.deepEqual(l.j.result.tools.find(t => t.name === w).inputSchema.required.filter(r => ['ia', 'pedidoPor', 'motivo'].includes(r)).sort(), ['ia', 'motivo', 'pedidoPor']);
  assert.equal((await rpc(maria.access_token, 'metodo/que/nao/existe')).j.error.code, -32601);
  const lote = await chamar('/cerebro/mcp', { corpo: [{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'ping' }], cab: { authorization: 'Bearer ' + maria.access_token } }); assert.equal(lote.j.length, 2);
  assert.equal((await chamar('/cerebro/mcp', { metodo: 'GET', cab: { authorization: 'Bearer ' + maria.access_token } })).status, 405);
  assert.equal((await chamar('/cerebro/mcp', { metodo: 'DELETE', cab: { authorization: 'Bearer ' + maria.access_token } })).status, 405);
  const lixo = await worker.fetch(new Request(BASE + '/cerebro/mcp', { method: 'POST', headers: { authorization: 'Bearer ' + maria.access_token }, body: 'nao-e-json' }), env, ctx); assert.equal(lixo.status, 400);
});

test('8. o fluxo ANTIGO da chave continua igual (principal, chave autorizada pela pessoa) e a chave não abre o MCP', async () => {
  assert.equal((await chamar('/cerebro/comece')).status, 403, 'sem origem e sem chave: o de sempre'); const sem = await chamar('/cerebro/comece', { cab: { origin: ORIGEM_SITE } }); assert.equal(sem.status, 401);
  const errada = await chamar('/cerebro/comece', { cab: { 'x-cerebro-chave': 'errada' } }); assert.equal(errada.status, 401); assert.match(errada.j.error.message, /c-\.\.\./);
  const principal = await chamar('/cerebro/salvar', { corpo: { caminho: '00 Comece aqui/Leia primeiro', corpo: '# Leia primeiro\n\nTexto base do Cérebro.', resumo: 'Guia inicial.', marca: 'guia', ...regs }, cab: { 'x-cerebro-chave': env.CEREBRO_CHAVE } }); assert.equal(principal.status, 200, principal.t);
  for (const [c, corpo, resumo, marca] of [['Programas/Animador', '# Animador\n\nFaz animações. Exportar legendas em SRT fica na janela Exportar.', 'Fazer as animações da equipe.', 'guia'], ['Regras/Regras da dona', '# Regras\n\nNunca grave segredos.', 'Como falar, segredos e gastos.', 'regra'], ['Skills/celestia/Skill principal', '# celestia\n\nVersão 1 aprovada.', 'A auxiliar do Estúdio.', 'skill']]) assert.equal((await chamar('/cerebro/salvar', { corpo: { caminho: c, corpo, resumo, marca, ...regs }, cab: { 'x-cerebro-chave': env.CEREBRO_CHAVE } })).status, 200);
  await env.EQUIPE_DB.prepare("INSERT INTO cerebro_cartao (id, ordem, texto, aponta, ver, em, apagado) VALUES ('k1', 1, 'Só tarefas do Estúdio.', 'Regras/Regras da dona', 1, 1, 0)").run();
  const ped = await chamar('/cerebro/pedir', { corpo: { texto: 'Aprender a exportar legendas SRT.', tipo: 'aprender', pedidoPor: 'Joao' }, cab: { 'x-cerebro-chave': env.CEREBRO_CHAVE } }); assert.equal(ped.status, 200); env.pedidoId = ped.j.id;
  // a pessoa autoriza um código (o jeito antigo) e a IA dela grava; a chave do computador de quem não é ADM manda para a revisão
  const chave = 'chave-do-computador-do-joao-' + 'x'.repeat(30), cod = 'c-' + Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(chave))).toString('hex');
  const aut = await chamar('/cerebro/chaves', { corpo: { acao: 'autorizar', codigo: cod, nome: 'PC do Joao' }, cab: { origin: ORIGEM_SITE, authorization: await loginDe('joao') } }); assert.equal(aut.status, 200, aut.t); assert.equal(aut.j.adm, false);
  const g = await chamar('/cerebro/salvar', { corpo: { caminho: 'Aprendizados/teste da chave do Joao', corpo: 'texto', resumo: 'r', ...regs }, cab: { 'x-cerebro-chave': chave } }); assert.equal(g.status, 200, g.t);
  const rev = await env.EQUIPE_DB.prepare("SELECT quem, ia, pedido, skill FROM cerebro_revisao WHERE caminho = 'Aprendizados/teste da chave do Joao'").first(); assert.equal(rev.quem, 'PC do Joao'); assert.equal(rev.skill, 0);
  const viaMcp = await chamar('/cerebro/mcp', { corpo: { jsonrpc: '2.0', id: 1, method: 'ping' }, cab: { 'x-cerebro-chave': env.CEREBRO_CHAVE } }); assert.equal(viaMcp.status, 401, 'a chave antiga não vale como token do conector');
});

test('8b. revogar chave ANTIGA continua igual: o dono revoga, outra pessoa não, ADM revoga qualquer uma, e a chave revogada para de valer', async () => {
  const { createHash } = await import('node:crypto'); const nova = async (quem, nome) => { const chave = 'chave-' + nome.replace(/ /g, '-') + '-' + 'y'.repeat(30), h = createHash('sha256').update(chave).digest('hex'); const r = await chamar('/cerebro/chaves', { corpo: { acao: 'autorizar', codigo: 'c-' + h, nome }, cab: { origin: ORIGEM_SITE, authorization: await loginDe(quem) } }); assert.equal(r.status, 200, r.t); return { chave, h }; };
  const doMaria = await nova('maria', 'PC antigo da Maria'), doJoao = await nova('joao', 'PC antigo do Joao');
  const usa = k => chamar('/cerebro/comece', { cab: { 'x-cerebro-chave': k.chave } });
  assert.equal((await usa(doMaria)).status, 200);
  assert.equal((await chamar('/cerebro/chaves', { corpo: { acao: 'revogar', h: doMaria.h }, cab: { origin: ORIGEM_SITE, authorization: await loginDe('joao') } })).status, 403, 'Joao não revoga a chave da Maria');
  assert.equal((await chamar('/cerebro/chaves', { corpo: { acao: 'revogar', h: 'nao-existe' }, cab: { origin: ORIGEM_SITE, authorization: await loginDe('joao') } })).status, 404);
  assert.equal((await chamar('/cerebro/chaves', { corpo: { acao: 'revogar', h: doMaria.h }, cab: { origin: ORIGEM_SITE, authorization: await loginDe('maria') } })).status, 200); assert.equal((await usa(doMaria)).status, 401, 'chave revogada');
  assert.equal((await usa(doJoao)).status, 200); assert.equal((await chamar('/cerebro/chaves', { corpo: { acao: 'revogar', h: doJoao.h }, cab: { origin: ORIGEM_SITE, authorization: await loginDe('dona') } })).status, 200, 'ADM revoga qualquer uma'); assert.equal((await usa(doJoao)).status, 401);
  const lista = await chamar('/cerebro/chaves', { cab: { origin: ORIGEM_SITE, authorization: await loginDe('maria') } }); assert.ok(lista.j.itens.some(x => x.nome === 'PC antigo da Maria' && x.revogada === 1) && !lista.j.itens.some(x => x.nome === 'PC antigo do Joao'), 'a lista antiga segue igual');
});

test('9. ferramentas de leitura: comece, indice, buscar, ler (e ler por partes)', async () => {
  const c = texto(await ferramenta(maria.access_token, 'comece')); assert.ok(c.startsWith(CB_ESCOPO)); assert.match(c, /Memórias rápidas/); assert.match(c, /Só tarefas do Estúdio\. → Regras\/Regras da dona/); assert.match(c, /pedido\(s\) esperando/); assert.match(c, /Pastas: .*Programas/); assert.match(c, /Texto base do Cérebro/);
  const topo = texto(await ferramenta(maria.access_token, 'indice')); assert.match(topo, /- Programas \(1\)/); assert.match(topo, /- Skills \(1\)/);
  const prog = texto(await ferramenta(maria.access_token, 'indice', { pasta: 'Programas' })); assert.match(prog, /- Programas\/Animador \(guia\): Fazer as animações da equipe\./);
  const vazio = await ferramenta(maria.access_token, 'indice', { pasta: 'Nao existe' }); assert.equal(vazio.isError, true);
  const b = texto(await ferramenta(maria.access_token, 'buscar', { palavras: 'exportar legendas' })); assert.match(b, /Programas\/Animador/); assert.ok(!b.includes('**'));
  assert.match(texto(await ferramenta(maria.access_token, 'buscar', { palavras: 'zzzzqqq' })), /Nada encontrado/);
  const l = texto(await ferramenta(maria.access_token, 'ler', { caminho: 'Programas/Animador' })); assert.match(l, /^# Animador \(versão 1, tipo texto, marca guia\)/); assert.match(l, /Exportar legendas em SRT/);
  const nao = await ferramenta(maria.access_token, 'ler', { caminho: 'Programas/NaoExiste' }); assert.equal(nao.isError, true); assert.match(texto(nao), /não existe/);
  const grande = 'linha de teste bem comprida para encher a página inteira\n'.repeat(1700); // ~ 95 mil letras
  const sg = await ferramenta(dona.access_token, 'salvar', { caminho: 'Programas/Pagina grande', corpo: grande, resumo: 'Página grande de teste.', ...regs }); assert.equal(sg.isError, undefined, texto(sg));
  const p1 = texto(await ferramenta(maria.access_token, 'ler', { caminho: 'Programas/Pagina grande' })), p3 = texto(await ferramenta(maria.access_token, 'ler', { caminho: 'Programas/Pagina grande', parte: 3 }));
  assert.match(p1, /PÁGINA GRANDE: parte 1 de 3/); assert.match(p1, /NÃO reescreva o corpo/); assert.ok(p1.length < 41500); assert.match(p3, /parte 3 de 3[\s\S]*Fim da página/);
  assert.match(texto(await ferramenta(maria.access_token, 'pedidos')), /Aprender a exportar legendas SRT/);
});

test('10. gravação de quem NÃO é ADM: entra na hora, aparece na Revisar, sinaliza quem pediu e qual IA gravou; skill fica retida', async () => {
  const s = await ferramenta(maria.access_token, 'salvar', { caminho: 'Aprendizados/Teste da Maria', corpo: 'Aprendi que o SRT respeita o trecho. Contato: fulana@gmail.com', resumo: 'Teste de gravação da Maria.', marca: 'aprendizado', ia: 'Claude Sonnet 5.5', pedidoPor: 'Maria', motivo: 'registrar o teste' }); assert.equal(s.isError, undefined, texto(s)); assert.match(texto(s), /Gravado\. id .*versão 1/);
  const ler = texto(await ferramenta(dona.access_token, 'ler', { caminho: 'Aprendizados/Teste da Maria' })); assert.match(ler, /Última mudança: Claude Sonnet 5\.5 · Maria Teste \(conector: notebook da Maria\), a pedido de Maria/); assert.ok(!ler.includes('fulana@gmail.com'), 'e-mail mascarado'); assert.match(ler, /fu•+@gmail\.com/);
  const rev = await env.EQUIPE_DB.prepare("SELECT quem, ia, pedido, motivo, skill, ok FROM cerebro_revisao WHERE caminho = 'Aprendizados/Teste da Maria'").first(); assert.deepEqual({ ...rev }, { quem: 'Maria Teste (conector: notebook da Maria)', ia: 'Claude Sonnet 5.5', pedido: 'Maria', motivo: 'registrar o teste', skill: 0, ok: 0 });
  // skill: muda na hora no Cérebro, mas o /skills (o que o instalar baixa) só mostra a versão aprovada
  const antes = await ferramenta(maria.access_token, 'ler', { caminho: 'Skills/celestia/Skill principal' }); assert.match(texto(antes), /versão 1/);
  const sk = await ferramenta(maria.access_token, 'salvar', { caminho: 'Skills/celestia/Skill principal', corpo: '# celestia\n\nVersão 2 da Maria.', base: 1, ...regs, pedidoPor: 'Maria' }); assert.equal(sk.isError, undefined, texto(sk));
  const lista = await chamar('/cerebro/skills', { cab: { 'x-cerebro-chave': env.CEREBRO_CHAVE } }); const it = lista.j.itens.find(x => x.nome === 'Skill principal'); assert.equal(it.ver, 2); assert.equal(it.verOk, 1, 'a versão da Maria espera o ok de um ADM');
  const rs = await env.EQUIPE_DB.prepare("SELECT skill FROM cerebro_revisao WHERE caminho = 'Skills/celestia/Skill principal'").first(); assert.equal(rs.skill, 1);
  // conflito de versão: nada é perdido
  const conf = await ferramenta(maria.access_token, 'salvar', { caminho: 'Programas/Animador', corpo: 'sobrescreve tudo', base: 7, ...regs }); assert.equal(conf.isError, true); assert.match(texto(conf), /NADA FOI GRAVADO/);
  const semBase = await ferramenta(maria.access_token, 'salvar', { caminho: 'Programas/Animador', corpo: 'sobrescreve tudo', ...regs }); assert.equal(semBase.isError, true); assert.match(texto(semBase), /versão/);
  const acres = await ferramenta(maria.access_token, 'salvar', { caminho: 'Programas/Animador', acrescentar: '## Nota da Maria\n\nSRT respeita o trecho.', ...regs }); assert.equal(acres.isError, undefined, texto(acres)); assert.match(texto(await ferramenta(dona.access_token, 'ler', { caminho: 'Programas/Animador' })), /Faz animações[\s\S]*Nota da Maria/);
  const dois = await ferramenta(maria.access_token, 'salvar', { caminho: 'Programas/Animador', corpo: 'a', acrescentar: 'b', ...regs }); assert.equal(dois.isError, true); assert.match(texto(dois), /nunca os dois/);
  const semReg = await ferramenta(maria.access_token, 'salvar', { caminho: 'Aprendizados/x', corpo: 'a', ia: 'Claude', pedidoPor: 'Maria', motivo: '   ' }); assert.equal(semReg.isError, true);
  const sem2 = await rpc(maria.access_token, 'tools/call', { name: 'salvar', arguments: { caminho: 'x', corpo: 'a' } }); assert.equal(sem2.j.result.isError, true); assert.match(sem2.j.result.content[0].text, /Falta o campo/);
  assert.equal((await rpc(maria.access_token, 'tools/call', { name: 'apagar_tudo', arguments: {} })).j.error.code, -32602);
});

test('11. gravação de ADM: direto, sem entrar na revisão; aprender, renomear e feito', async () => {
  const antes = (await env.EQUIPE_DB.prepare('SELECT count(*) AS n FROM cerebro_revisao').first()).n;
  const a = await ferramenta(dona.access_token, 'aprender', { tipo: 'evitar', assunto: 'Não usar / barra no nome', texto: 'Barra vira pasta.', resumo: 'Evite barra no título.', ...regs }); assert.equal(a.isError, undefined, texto(a)); assert.match(texto(a), /Gravado em A evitar/);
  const hoje = new Date().toISOString().slice(0, 10); const lido = texto(await ferramenta(dona.access_token, 'ler', { caminho: `A evitar/${hoje} Não usar - barra no nome` })); assert.match(lido, /marca evitar/); assert.match(lido, /Última mudança: Claude Teste 1, a pedido de Dona Teste/);
  assert.equal((await env.EQUIPE_DB.prepare('SELECT count(*) AS n FROM cerebro_revisao').first()).n, antes, 'ADM não gera revisão');
  const r = await ferramenta(dona.access_token, 'aprender', { tipo: 'referencia', assunto: 'Doc do MCP', texto: 'Especificação.', url: 'https://modelcontextprotocol.io', resumo: 'Link da especificação.', ...regs }); assert.equal(r.isError, undefined, texto(r));
  const invalido = await ferramenta(dona.access_token, 'aprender', { tipo: 'outro', assunto: 'x', texto: 'y', ...regs }); assert.equal(invalido.isError, true);
  const ren = await ferramenta(dona.access_token, 'renomear', { caminho: 'Programas/Pagina grande', nomeNovo: 'Pagina grande renomeada', ...regs }); assert.equal(ren.isError, undefined, texto(ren)); assert.match(texto(await ferramenta(dona.access_token, 'ler', { caminho: 'Programas/Pagina grande renomeada', parte: 3 })), /Fim da página/);
  const f = await ferramenta(maria.access_token, 'feito', { id: env.pedidoId, nota: 'Registrado em Programas/Animador', ia: 'Claude Sonnet 5.5', pedidoPor: 'Maria' }); assert.equal(f.isError, undefined, texto(f)); assert.equal(texto(await ferramenta(maria.access_token, 'pedidos')), 'Nenhum pedido esperando.');
  const nf = await ferramenta(maria.access_token, 'feito', { id: 'nao-existe', ia: 'Claude', pedidoPor: 'Maria' }); assert.equal(nf.isError, true);
});

test('12. segredos são recusados (e e-mails mascarados) também pelo conector; token do conector nunca entra no Cérebro', async () => {
  for (const [segredo, nome] of [['sk-ant-api03-' + 'A'.repeat(40), 'chave da Anthropic'], ['Authorization: Bearer ' + 'x'.repeat(48), 'token de login'], ['cbt_' + 'B'.repeat(43), 'token do conector do Cérebro'], ['cbr_' + 'B'.repeat(43), 'token do conector do Cérebro'], ['-----BEGIN PRIVATE KEY-----', 'chave privada']]) {
    const r = await ferramenta(dona.access_token, 'salvar', { caminho: 'Aprendizados/segredo', corpo: 'um texto com ' + segredo, resumo: 'r', ...regs }); assert.equal(r.isError, true, nome); assert.match(texto(r), new RegExp('Não gravei: .*' + nome));
    const r2 = await ferramenta(dona.access_token, 'aprender', { tipo: 'regra', assunto: 'segredo', texto: 'ok', resumo: segredo.slice(0, 80), ...regs }); assert.equal(r2.isError, true); }
  assert.equal(await env.EQUIPE_DB.prepare("SELECT 1 FROM cerebro_no WHERE nome = 'segredo'").first(), null);
});

test('13. o banco guarda só resumos: nenhum token em claro, nenhum e-mail', async () => {
  const bruto = env.EQUIPE_DB._bruto, tabelas = ['cerebro_conexao', 'cerebro_oauth_tok', 'cerebro_oauth_cod', 'cerebro_oauth_cliente'];
  for (const t of tabelas) { const dump = JSON.stringify(bruto.prepare(`SELECT * FROM ${t}`).all()); for (const e of Object.values(PESSOAS)) assert.ok(!dump.includes(e), `e-mail em ${t}`); assert.ok(!/cb[tkr]_[A-Za-z0-9_-]{30,}/.test(dump), `token em claro em ${t}`); }
  for (const tk of [maria.access_token, maria.refresh_token, dona.access_token, dona.refresh_token]) { const dump = JSON.stringify(bruto.prepare('SELECT * FROM cerebro_oauth_tok').all()); assert.ok(!dump.includes(tk.slice(4))); }
  const con = bruto.prepare("SELECT dono, pid, pessoa FROM cerebro_conexao WHERE rotulo = 'notebook da Maria'").get(); assert.match(con.dono, /^u[0-9a-f]{16}$/); assert.equal(con.pessoa, 'Maria Teste');
  assert.equal(rede.chamadas.length, 0, 'o servidor tentou falar com a rede: ' + JSON.stringify(rede.chamadas)); // nenhum token saiu daqui
});

test('14. a aba Acesso das IAs lista as conexões; cada pessoa revoga só as suas; ADM revoga todas; revogado = fora na hora', async () => {
  const lm = await chamar('/cerebro/chaves', { cab: { origin: ORIGEM_SITE, authorization: await loginDe('maria') } }); const todas = lm.j.itens.filter(x => x.tipo === 'conector'), meus = todas.filter(x => x.nome === 'Conector · notebook da Maria'); assert.equal(meus.length, 1); assert.ok(todas.every(x => x.por === 'Maria Teste'), 'só as dela'); assert.equal(meus[0].por, 'Maria Teste'); assert.equal(meus[0].adm, 0); assert.equal(meus[0].revogada, 0);
  assert.ok(!lm.j.itens.some(x => x.nome.includes('dona')), 'Maria não vê a conexão da dona');
  const ld = await chamar('/cerebro/chaves', { cab: { origin: ORIGEM_SITE, authorization: await loginDe('dona') } }); assert.ok(ld.j.itens.filter(x => x.tipo === 'conector').length >= 3, 'a dona (ADM) vê as de todo mundo'); assert.ok(ld.j.itens.some(x => x.tipo === 'conector' && x.por === 'Maria Teste') && ld.j.itens.some(x => x.tipo === 'conector' && x.por === 'Dona Teste'));
  const hMaria = meus[0].h, hDona = ld.j.itens.find(x => x.nome === 'Conector · PC da dona').h;
  assert.equal((await chamar('/cerebro/chaves', { corpo: { acao: 'revogar', h: hDona }, cab: { origin: ORIGEM_SITE, authorization: await loginDe('maria') } })).status, 403, 'Maria não revoga a da dona');
  assert.equal((await chamar('/cerebro/chaves', { corpo: { acao: 'revogar', h: hMaria }, cab: { origin: ORIGEM_SITE, authorization: await loginDe('joao') } })).status, 403, 'Joao não revoga a da Maria');
  assert.equal((await chamar('/cerebro/chaves', { corpo: { acao: 'revogar', h: 'nada' }, cab: { origin: ORIGEM_SITE, authorization: await loginDe('joao') } })).status, 404);
  const ok = await chamar('/cerebro/chaves', { corpo: { acao: 'revogar', h: hMaria }, cab: { origin: ORIGEM_SITE, authorization: await loginDe('maria') } }); assert.equal(ok.status, 200, ok.t);
  assert.equal((await rpc(maria.access_token, 'ping')).status, 401, 'o token de acesso deixa de valer na hora');
  const ren = await chamar('/cerebro/oauth/token', { form: { grant_type: 'refresh_token', refresh_token: maria.refresh_token, client_id: maria.clientId } }); assert.equal(ren.status, 400); assert.equal(ren.j.error, 'invalid_grant');
  assert.equal((await rpc(dona.access_token, 'ping')).status, 200, 'a da dona segue');
  const ld2 = await chamar('/cerebro/chaves', { cab: { origin: ORIGEM_SITE, authorization: await loginDe('dona') } }); assert.equal(ld2.j.itens.find(x => x.h === hMaria).revogada, 1);
  assert.equal((await chamar('/cerebro/chaves', { corpo: { acao: 'revogar', h: hDona }, cab: { origin: ORIGEM_SITE, authorization: await loginDe('dona') } })).status, 200); assert.equal((await rpc(dona.access_token, 'ping')).status, 401, 'ADM revoga a própria');
});

test('15. renovação estrita: acesso novo funciona; só um ramo vivo; repetir tarde ou usar o ramo gasto derruba a conexão; acesso vencido renova', async () => {
  const novoPar = async porta => { const c = await conectar('maria', { porta, rotulo: 'renovação ' + porta }); return { c, renova: rt => chamar('/cerebro/oauth/token', { form: { grant_type: 'refresh_token', refresh_token: rt, client_id: c.clientId, resource: BASE + '/cerebro/mcp' } }) }; };
  { const { c, renova } = await novoPar(52001); // o caso normal
    const r1 = await renova(c.refresh_token); assert.equal(r1.status, 200, r1.t); assert.notEqual(r1.j.refresh_token, c.refresh_token); assert.equal((await rpc(r1.j.access_token, 'ping')).status, 200); assert.equal((await rpc(c.access_token, 'ping')).status, 200, 'o acesso antigo vale até vencer');
    const r2 = await renova(r1.j.refresh_token); assert.equal(r2.status, 200, 'a cadeia normal segue'); const r3 = await renova(r2.j.refresh_token); assert.equal(r3.status, 200); assert.equal((await rpc(r3.j.access_token, 'ping')).status, 200); }
  { const { c, renova } = await novoPar(52002); // o cenário da revisão: o dono e quem roubou o token usam o MESMO token de renovação
    const dono = await renova(c.refresh_token); assert.equal(dono.status, 200); const ladrao = await renova(c.refresh_token); assert.equal(ladrao.status, 200, 'dentro da folga (resposta perdida) o segundo pedido vale');
    const velho = await renova(dono.j.refresh_token); assert.equal(velho.status, 400, 'o ramo do primeiro pedido foi gasto: só um ramo vivo'); assert.match(velho.j.error_description, /conexão foi encerrada/);
    assert.equal((await rpc(ladrao.j.access_token, 'ping')).status, 401, 'e a conexão inteira caiu, com os dois ramos'); assert.equal((await renova(ladrao.j.refresh_token)).status, 400); }
  { const { c, renova } = await novoPar(52003); // repetir o token depois da folga
    const r1 = await renova(c.refresh_token); assert.equal(r1.status, 200); env.EQUIPE_DB._bruto.exec('UPDATE cerebro_oauth_tok SET usado = usado - 60000 WHERE usado > 1');
    const tarde = await renova(c.refresh_token); assert.equal(tarde.status, 400); assert.match(tarde.j.error_description, /conexão foi encerrada/); assert.equal((await rpc(r1.j.access_token, 'ping')).status, 401); }
  { const { c, renova } = await novoPar(52004); // dois pedidos ao mesmo tempo com o mesmo token
    const [x, y] = await Promise.all([renova(c.refresh_token), renova(c.refresh_token)]); assert.ok([x.status, y.status].every(s => s === 200 || s === 400), 'sem erro de servidor');
    const vivos = (await Promise.all([x, y].filter(r => r.status === 200).map(r => renova(r.j.refresh_token)))).filter(r => r.status === 200).length; assert.ok(vivos <= 1, 'no máximo um ramo continua vivo: ' + vivos); }
  const outro = await novoPar(52005), cruz = await chamar('/cerebro/oauth/token', { form: { grant_type: 'refresh_token', refresh_token: outro.c.refresh_token, client_id: (await novoPar(52006)).c.clientId } }); assert.equal(cruz.status, 400, 'o token de um programa não renova no outro');
  const { c: venc, renova: rv } = await novoPar(52007); env.EQUIPE_DB._bruto.exec("UPDATE cerebro_oauth_tok SET exp = 1 WHERE tipo = 'a'"); assert.equal((await rpc(venc.access_token, 'ping')).status, 401, 'acesso vencido'); const ren = await rv(venc.refresh_token); assert.equal(ren.status, 200, 'mas a renovação funciona'); assert.equal((await rpc(ren.j.access_token, 'ping')).status, 200);
});

test('15b. código de login usado de novo derruba a conexão que nasceu dele (RFC 6749 4.1.2)', async () => {
  const redirect = 'http://localhost:52010/callback', cli = (await chamar('/cerebro/oauth/registrar', { corpo: { client_name: 'R', redirect_uris: [redirect] } })).j.client_id, pk = await novoPkce();
  const ap = await chamar('/cerebro/oauth/aprovar', { corpo: { client_id: cli, redirect_uri: redirect, code_challenge: pk.challenge, code_challenge_method: 'S256' }, cab: { origin: ORIGEM_SITE, authorization: await loginDe('maria') } }), code = new URL(ap.j.redirect).searchParams.get('code');
  const troca = () => chamar('/cerebro/oauth/token', { form: { grant_type: 'authorization_code', client_id: cli, redirect_uri: redirect, code, code_verifier: pk.verifier } });
  const t1 = await troca(); assert.equal(t1.status, 200); assert.equal((await rpc(t1.j.access_token, 'ping')).status, 200);
  assert.equal((await troca()).status, 400, 'segunda troca'); assert.equal((await rpc(t1.j.access_token, 'ping')).status, 401, 'o que nasceu do código foi derrubado');
});

test('16. quem sai da lista do Estúdio (ou perde o cargo do Cérebro) perde o conector na hora', async () => {
  const c = await conectar('joao', { porta: 52010, rotulo: 'do Joao' }); assert.equal((await rpc(c.access_token, 'ping')).status, 200);
  env.EMAILS_PERMITIDOS = [PESSOAS.dona, PESSOAS.maria].join(','); cnReinicia(); // o Joao saiu da lista
  assert.equal((await rpc(c.access_token, 'ping')).status, 401, 'fora da lista'); assert.equal((await chamar('/cerebro/oauth/token', { form: { grant_type: 'refresh_token', refresh_token: c.refresh_token, client_id: c.clientId } })).status, 400, 'não renova');
  env.EMAILS_PERMITIDOS = [PESSOAS.dona, PESSOAS.maria, PESSOAS.joao].join(','); cnReinicia(); assert.equal((await rpc(c.access_token, 'ping')).status, 200, 'a conexão não foi apagada: voltou à lista, volta a valer');
  // cargo sem o Cérebro (modelo de permissões do menu, no KV da equipe)
  const { createHash } = await import('node:crypto'); const idJoao = createHash('sha256').update('acesso:' + PESSOAS.joao).digest('base64url').slice(0, 16);
  const modelo = { cargos: [{ id: 'equipe', nome: 'Equipe', sem: { programas: [], funcoes: [] } }, { id: 'visita', nome: 'Visita', sem: { programas: ['cerebro'], funcoes: [] } }], padrao: 'equipe', pessoas: { [idJoao]: { cargos: ['visita'] } } };
  env.EQUIPE = { get: async k => (k === 'acesso/permissoes' ? modelo : null), list: async () => ({ keys: [], list_complete: true }) }; cnReinicia();
  const anterior = W; W = (await import('../worker.js?cargo=' + Date.now())).default; // cópia nova: a memória de permissões (60 s) começa vazia
  const corpoAprova = { client_id: c.clientId, redirect_uri: c.redirect, code_challenge: c.pk.challenge, code_challenge_method: 'S256' };
  const nega = await chamar('/cerebro/oauth/aprovar', { corpo: corpoAprova, cab: { origin: ORIGEM_SITE, authorization: await loginDe('joao') } }); assert.equal(nega.status, 403); assert.match(nega.j.error.message, /cargo não inclui o Cérebro/);
  assert.equal((await rpc(c.access_token, 'ping')).status, 401, 'quem perdeu o cargo do Cérebro perde o conector que já tinha');
  const maria2 = await chamar('/cerebro/oauth/aprovar', { corpo: corpoAprova, cab: { origin: ORIGEM_SITE, authorization: await loginDe('maria') } }); assert.equal(maria2.status, 200, 'quem tem o cargo segue entrando');
  W = anterior; delete env.EQUIPE; cnReinicia();
});

test('17. origem do navegador: claude.ai e o computador passam; sites desconhecidos não; CORS do MCP', async () => {
  const c = await conectar('dona', { porta: 52020 });
  for (const o of ['https://claude.ai', 'http://localhost:6274', ORIGEM_SITE]) { const r = await rpc(c.access_token, 'ping', undefined, 1, { origin: o }); assert.equal(r.status, 200, o); assert.equal(r.h.get('access-control-allow-origin'), o); assert.match(r.h.get('access-control-expose-headers'), /www-authenticate/); }
  assert.equal((await rpc(c.access_token, 'ping', undefined, 1, { origin: 'https://evil.example' })).status, 403);
  const pre = await chamar('/cerebro/mcp', { metodo: 'OPTIONS', cab: { origin: 'https://claude.ai', 'access-control-request-method': 'POST' } }); assert.equal(pre.status, 204); assert.match(pre.h.get('access-control-allow-headers'), /mcp-protocol-version/);
  const wk = await chamar('/.well-known/oauth-authorization-server', { cab: { origin: 'https://qualquer.example' } }); assert.equal(wk.h.get('access-control-allow-origin'), '*');
});

test('18. revogação pelo próprio programa (RFC 7009) e limite de conexões por pessoa', async () => {
  const c = await conectar('dona', { porta: 52030 }); assert.equal((await rpc(c.access_token, 'ping')).status, 200);
  assert.equal((await chamar('/cerebro/oauth/revogar', { form: { token: c.refresh_token, client_id: 'cbc_outro_programa_x' } })).status, 200); assert.equal((await rpc(c.access_token, 'ping')).status, 200, 'outro programa não revoga a conexão alheia');
  assert.equal((await chamar('/cerebro/oauth/revogar', { form: { token: c.refresh_token, client_id: c.clientId } })).status, 200); assert.equal((await rpc(c.access_token, 'ping')).status, 401);
  const reg = (await chamar('/cerebro/oauth/registrar', { corpo: { client_name: 'x', redirect_uris: ['http://localhost:7000/callback'] } })).j; let ultimo, feitas = 0;
  for (let i = 0; i < 30; i++) { const pk = await novoPkce(); ultimo = await chamar('/cerebro/oauth/aprovar', { corpo: { client_id: reg.client_id, redirect_uri: 'http://localhost:7000/callback', code_challenge: pk.challenge, code_challenge_method: 'S256' }, cab: { origin: ORIGEM_SITE, authorization: await loginDe('joao') } });
    if (ultimo.status !== 200) break; const t = await chamar('/cerebro/oauth/token', { form: { grant_type: 'authorization_code', client_id: reg.client_id, redirect_uri: 'http://localhost:7000/callback', code: new URL(ultimo.j.redirect).searchParams.get('code'), code_verifier: pk.verifier } }); assert.equal(t.status, 200); feitas++; }
  assert.equal(ultimo.status, 429, 'passou de 20 conexões ativas da mesma pessoa'); assert.ok(feitas <= 20 && feitas >= 15, 'conexões criadas: ' + feitas); assert.match(ultimo.j.error.message, /20 conexões ativas/);
  const e2 = { ...env, CONECTOR_REGISTROS_POR_MIN: '3' }; const regDe = (ip, e = e2) => W.fetch(new Request(BASE + '/cerebro/oauth/registrar', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify({ client_name: 'ip', redirect_uris: ['http://localhost:7002/callback'] }) }), e, ctx);
  for (let i = 0; i < 3; i++) assert.equal((await regDe('203.0.113.7')).status, 201); assert.equal((await regDe('203.0.113.7')).status, 429, 'o 4º do mesmo IP no minuto é recusado'); assert.equal((await regDe('203.0.113.8')).status, 201, 'outro IP não é afetado pelo primeiro');
  const grande = await W.fetch(new Request(BASE + '/cerebro/oauth/registrar', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '5000000' }, body: JSON.stringify({ client_name: 'x', redirect_uris: ['http://localhost:1/cb'] }) }), env, ctx); assert.equal(grande.status, 400, 'corpo declarado grande demais é recusado antes de ler');
  const mail = await chamar('/cerebro/oauth/registrar', { corpo: { client_name: 'fulana@gmail.com usa isto', redirect_uris: ['http://localhost:7003/callback'] } }); assert.ok(!JSON.stringify(mail.j).includes('fulana@gmail.com'), 'e-mail no nome do programa vira máscara'); const antes = env.EQUIPE_DB._bruto.prepare('SELECT count(*) AS n FROM cerebro_oauth_cliente WHERE em > ?').get(Date.now() - 60e3).n; void antes;
  let bloqueou = false; for (let i = 0; i < 200 && !bloqueou; i++) { const r = await W.fetch(new Request(BASE + '/cerebro/oauth/registrar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'z', redirect_uris: ['http://localhost:7001/callback'] }) }), e2, ctx); bloqueou = r.status === 429; } assert.ok(bloqueou, 'registros demais por minuto são recusados');
});

test('19b. tela de permissão: /cerebro/oauth/cliente devolve nome e destino do registro e recusa pedido trocado', async () => {
  const reg = (await chamar('/cerebro/oauth/registrar', { corpo: { client_name: 'Claude Code (x)', redirect_uris: ['http://localhost:4100/callback'] } })).j;
  const q = (extra = {}) => '/cerebro/oauth/cliente?' + new URLSearchParams({ client_id: reg.client_id, redirect_uri: 'http://localhost:4100/callback', ...extra });
  const ok = await chamar(q()); assert.equal(ok.status, 200); assert.equal(ok.j.nome, 'Claude Code (x)'); assert.equal(ok.j.destino, 'este computador (localhost)');
  assert.equal((await chamar(q({ redirect_uri: 'http://127.0.0.1:61000/callback' }))).status, 200, 'outra porta no próprio computador vale');
  for (const ruim of [{ redirect_uri: 'https://evil.example/callback' }, { redirect_uri: 'http://localhost:4100/outro' }, { client_id: 'cbc_naoexiste_naoexiste' }]) assert.equal((await chamar(q(ruim))).status, 404, JSON.stringify(ruim));
  const claude = (await chamar('/cerebro/oauth/registrar', { corpo: { client_name: 'claude.ai', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] } })).j;
  assert.equal((await chamar('/cerebro/oauth/cliente?' + new URLSearchParams({ client_id: claude.client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback' }))).j.destino, 'claude.ai');
});

test('19c. interruptor de emergência (CONECTOR_DESLIGADO=1): o conector sai do ar na hora e o fluxo antigo da chave segue', async () => {
  const c = await conectar('dona', { porta: 52050 }); assert.equal((await rpc(c.access_token, 'ping')).status, 200);
  env.CONECTOR_DESLIGADO = '1';
  try { for (const p of ['/cerebro/mcp', '/.well-known/oauth-authorization-server', '/cerebro/oauth/token']) { const r = await chamar(p, { metodo: p === '/.well-known/oauth-authorization-server' ? 'GET' : 'POST', corpo: p === '/cerebro/mcp' ? { jsonrpc: '2.0', id: 1, method: 'ping' } : undefined, cab: { authorization: 'Bearer ' + c.access_token } }); assert.equal(r.status, 503, p); }
    assert.equal((await chamar('/cerebro/comece', { cab: { 'x-cerebro-chave': env.CEREBRO_CHAVE } })).status, 200, 'a chave antiga continua'); }
  finally { delete env.CONECTOR_DESLIGADO; }
  assert.equal((await rpc(c.access_token, 'ping')).status, 200, 'religado: as conexões voltam a valer');
});

test('19. rotas internas não vazam: o /cerebro/revisao e outras rotas de gente seguem fechadas para o conector', async () => {
  const c = await conectar('dona', { porta: 52040 }); // até a conexão de um ADM é "IA": não revisa, não mexe em chaves
  const rr = await chamar('/cerebro/revisao', { cab: { origin: ORIGEM_SITE, authorization: 'Bearer ' + c.access_token } }); assert.equal(rr.status, 401, 'o token do conector não vale fora do /cerebro/mcp');
  const ch = await chamar('/cerebro/chaves', { cab: { origin: ORIGEM_SITE, authorization: 'Bearer ' + c.access_token } }); assert.equal(ch.status, 401);
  const o = await chamar('/quem', { cab: { authorization: 'Bearer ' + c.access_token, origin: ORIGEM_SITE } }); assert.equal(o.status, 401);
  assert.equal(rede.chamadas.length, 0);
});
