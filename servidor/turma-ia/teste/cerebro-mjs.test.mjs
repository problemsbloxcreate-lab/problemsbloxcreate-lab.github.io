/* Teste ponta a ponta do programa que roda no computador da pessoa (cerebro/cerebro.mjs): um "computador" falso (pasta home vazia), o servidor local de teste
   (banco em memória, login do Google falso) e um clique simulado no Permitir. Nada de rede de verdade.
     cd servidor/turma-ia && node --test teste/cerebro-mjs.test.mjs */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('.', import.meta.url)), CEREBRO = join(AQUI, '..', '..', '..', 'cerebro', 'cerebro.mjs'), PORTA = 8800 + Math.floor(Math.random() * 90), URL_SERVIDOR = 'http://localhost:' + PORTA;
let servidor; const homes = [];
const novoHome = () => { const h = mkdtempSync(join(tmpdir(), 'pc-falso-')); homes.push(h); return h; };
const semTeste = () => { const e = { ...process.env }; delete e.NODE_TEST_CONTEXT; return e; }; // o node --test põe uma variável que faria os programas filhos se comportarem como testes
const amb = (home, extra = {}) => ({ ...semTeste(), HOME: home, USERPROFILE: home, CEREBRO_URL: URL_SERVIDOR, CEREBRO_SEM_CONECTOR: '1', CEREBRO_ABRIR: `"${process.execPath}" "${join(AQUI, 'clica-permitir.mjs')}"`, CEREBRO_CHAVE: '', ...extra });
const roda = (home, args, extra = {}) => spawnSync(process.execPath, [CEREBRO, ...args], { env: amb(home, extra), encoding: 'utf8', timeout: 90000 });
const rodaAsync = (home, args, extra = {}) => new Promise(ok => { const p = spawn(process.execPath, [CEREBRO, ...args], { env: amb(home, extra) }); let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d); p.on('close', status => ok({ status, stdout: out, stderr: err })); });
const lerJson = f => JSON.parse(readFileSync(f, 'utf8'));

before(async () => {
  servidor = spawn(process.execPath, [join(AQUI, 'servidor-local.mjs'), String(PORTA)], { stdio: ['ignore', 'pipe', 'pipe'], env: semTeste() });
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('o servidor local não subiu')), 20000); servidor.stdout.on('data', d => { if (String(d).includes('Servidor local')) { clearTimeout(t); ok(); } }); servidor.once('exit', c => no(new Error('servidor saiu ' + c))); });
});
after(() => { servidor?.kill(); });

const PC1 = novoHome();

test('1. computador sem ligação: o aviso manda LIGAR NA HORA, sem perguntar; comece diz o que fazer', () => {
  const a = roda(PC1, ['aviso']); assert.equal(a.status, 0); assert.match(a.stdout, /ESTE COMPUTADOR AINDA NÃO ESTÁ LIGADO AO CÉREBRO\. LIGUE AGORA, SEM PERGUNTAR/); assert.match(a.stdout, /node ~\/\.claude\/cerebro\.mjs instalar com timeout de 5 minutos/); assert.match(a.stdout, /só toca em Permitir/);
  assert.ok(!/posso instalar/i.test(a.stdout), 'nada de perguntar');
  const c = roda(PC1, ['comece']); assert.equal(c.status, 1); assert.match(c.stderr, /ainda não está ligado ao Cérebro/);
});

test('2. instalar num computador novo: um clique no Permitir liga tudo (login do Google, skills, agentes e os dois ganchos), sem chave e sem código para colar', async () => {
  const r = await rodaAsync(PC1, ['instalar']); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Abri o navegador/); assert.ok(!r.stdout.includes('oauth/autorizar'), 'a URL de login não é impressa quando o navegador abriu'); assert.match(r.stdout, /Pronto: este computador está ligado ao Cérebro pelo login do Google/); assert.ok(!/c-[0-9a-f]{64}/.test(r.stdout), 'nenhum código c-… para colar');
  const cl = join(PC1, '.claude'); assert.ok(existsSync(join(cl, 'cerebro-conexao.json'))); assert.ok(!existsSync(join(cl, 'cerebro-chave.txt')), 'nenhuma chave criada');
  const c = lerJson(join(cl, 'cerebro-conexao.json')); assert.match(c.client_id, /^cbc_/); assert.match(c.refresh_token, /^cbr_/); assert.match(c.access_token, /^cbt_/); if (process.platform !== 'win32') assert.equal(statSync(join(cl, 'cerebro-conexao.json')).mode & 0o777, 0o600, 'só a pessoa lê');
  assert.ok(existsSync(join(cl, 'skills', 'celestia', 'SKILL.md')) && existsSync(join(cl, 'agents', 'celestia.md')) && existsSync(join(cl, 'skills', 'ouvir', 'SKILL.md')), 'skills e agentes instalados');
  const s = lerJson(join(cl, 'settings.json')); assert.equal(JSON.stringify(s.hooks.SessionStart).includes('cerebro.mjs aviso'), true); assert.equal(s.hooks.Stop.length, 1); assert.match(s.hooks.Stop[0].hooks[0].command, /^node .*\/\.claude\/hooks\/cerebro-gravou\.mjs$/); assert.equal(s.hooks.Stop[0].hooks[0].timeout, 20);
  const inst = readFileSync(join(cl, 'hooks', 'cerebro-gravou.mjs'), 'utf8'); assert.equal(spawnSync(process.execPath, ['--check', join(cl, 'hooks', 'cerebro-gravou.mjs')]).status, 0, 'o script do gancho é um programa válido');
  assert.match(inst, /stop_hook_active/, 'o gancho nunca prende em laço');
});

test('3. o aviso, o comece, o buscar, o ler, o salvar e os pedidos funcionam com o login do Google', () => {
  const a = roda(PC1, ['aviso']); assert.equal(a.status, 0); assert.ok(!/AINDA NÃO ESTÁ LIGADO/.test(a.stdout)); assert.match(a.stdout, /Pastas: /);
  assert.match(roda(PC1, ['comece']).stdout, /Texto base|Leia primeiro|Cérebro/);
  assert.match(roda(PC1, ['buscar', 'legendas']).stdout, /Programas\/Animador/); assert.match(roda(PC1, ['ler', 'Programas/Animador']).stdout, /versão 1/); assert.match(roda(PC1, ['inicio']).stdout, /Índice/);
  const sv = roda(PC1, ['salvar', 'Aprendizados/Teste do cerebro.mjs', '--texto', 'gravado pelo programa', '--resumo', 'Teste.', '--marca', 'aprendizado', '--ia', 'Claude Teste', '--pedido', 'Maria', '--motivo', 'teste']); assert.equal(sv.status, 0, sv.stderr); assert.match(sv.stdout, /"ok": true/);
  const ap = roda(PC1, ['aprender', 'evitar', 'Coisa que deu errado', '--texto', 'Não faça isso.', '--resumo', 'Evitar isso.', '--ia', 'Claude Teste', '--pedido', 'Maria', '--motivo', 'teste']); assert.equal(ap.status, 0, ap.stderr);
  const segredo = roda(PC1, ['salvar', 'Aprendizados/segredo', '--texto', 'sk-ant-api03-' + 'A'.repeat(40), '--resumo', 'x', '--ia', 'C', '--pedido', 'M', '--motivo', 'm']); assert.equal(segredo.status, 1); assert.match(segredo.stderr, /segredo não entra/);
  assert.equal(roda(PC1, ['pedidos']).status, 0); assert.match(roda(PC1, ['conferir']).stdout, /em dia|mais novos|Faltam/);
});

test('4. instalar de novo é seguro: não pede login outra vez e não duplica ganchos', async () => {
  const r = await rodaAsync(PC1, ['instalar']); assert.equal(r.status, 0, r.stdout + r.stderr); assert.ok(!/Abri o navegador/.test(r.stdout), 'já ligado: sem novo login'); assert.match(r.stdout, /o gancho do começo da sessão já estava; o gancho Stop já estava/);
  const s = lerJson(join(PC1, '.claude', 'settings.json')); assert.equal(s.hooks.Stop.length, 1); assert.equal(s.hooks.SessionStart.length, 1);
});

test('5. token vencido: renova sozinho; vários programas ao mesmo tempo não derrubam a ligação', async () => {
  const f = join(PC1, '.claude', 'cerebro-conexao.json'), c0 = lerJson(f); writeFileSync(f, JSON.stringify({ ...c0, exp: 1 }));
  const rs = await Promise.all([1, 2, 3, 4].map(() => rodaAsync(PC1, ['comece']))); for (const r of rs) assert.equal(r.status, 0, r.stdout + r.stderr);
  const c1 = lerJson(f); assert.notEqual(c1.access_token, c0.access_token, 'o token foi renovado'); assert.ok(c1.exp > Date.now() + 3000e3);
  assert.equal(roda(PC1, ['comece']).status, 0, 'a ligação segue viva depois da corrida');
  assert.ok(!existsSync(join(PC1, '.claude', 'cerebro-conexao.trava')), 'a trava foi solta');
});

test('6. settings.json que já existe: o resto é mantido, cópia de segurança feita, nada apagado', async () => {
  const PC2 = novoHome(), cl = join(PC2, '.claude'); mkdirSync(join(cl, 'hooks'), { recursive: true });
  writeFileSync(join(cl, 'cerebro-conexao.json'), readFileSync(join(PC1, '.claude', 'cerebro-conexao.json'))); // já ligado (copia a ligação do PC1 só para este teste)
  const antes = { permissions: { allow: ['Bash(ls)'] }, model: 'opus', hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo oi' }] }], Stop: [{ hooks: [{ type: 'command', command: 'echo tchau' }] }], PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo antes' }] }] } };
  writeFileSync(join(cl, 'settings.json'), JSON.stringify(antes, null, 2)); writeFileSync(join(cl, 'hooks', 'cerebro-gravou.mjs'), '// versão antiga');
  const r = await rodaAsync(PC2, ['instalar']); assert.equal(r.status, 0, r.stdout + r.stderr);
  const s = lerJson(join(cl, 'settings.json')); assert.deepEqual(s.permissions, antes.permissions); assert.equal(s.model, 'opus'); assert.deepEqual(s.hooks.PreToolUse, antes.hooks.PreToolUse);
  assert.equal(s.hooks.SessionStart.length, 2); assert.equal(s.hooks.SessionStart[0].hooks[0].command, 'echo oi'); assert.equal(s.hooks.Stop.length, 2); assert.equal(s.hooks.Stop[0].hooks[0].command, 'echo tchau');
  assert.deepEqual(lerJson(join(cl, 'settings.json.antes-do-cerebro')), antes, 'cópia exata do que havia'); assert.equal(readFileSync(join(cl, 'hooks', 'cerebro-gravou.mjs.antes'), 'utf8'), '// versão antiga', 'o script antigo foi guardado');
  const quebrado = novoHome(); mkdirSync(join(quebrado, '.claude'), { recursive: true }); writeFileSync(join(quebrado, '.claude', 'cerebro-conexao.json'), readFileSync(join(PC1, '.claude', 'cerebro-conexao.json'))); writeFileSync(join(quebrado, '.claude', 'settings.json'), '{ isto não é json');
  const q = await rodaAsync(quebrado, ['instalar']); assert.match(q.stdout, /settings\.json com erro de formato: NÃO mexi/); assert.equal(readFileSync(join(quebrado, '.claude', 'settings.json'), 'utf8'), '{ isto não é json', 'arquivo com erro não é tocado');
});

test('7. a pessoa toca em CANCELAR: nada é ligado e o plano reserva (chave) aparece, sem apagar nada', async () => {
  const PC3 = novoHome(); const r = await rodaAsync(PC3, ['instalar'], { CLICA: 'cancelar' }); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Não consegui ligar pelo login do Google: A pessoa cancelou/); assert.match(r.stdout, /Plano reserva/); assert.match(r.stdout, /c-[0-9a-f]{64}/, 'o código só como reserva'); assert.ok(!existsSync(join(PC3, '.claude', 'cerebro-conexao.json')));
  assert.ok(!existsSync(join(PC3, '.claude', 'skills')), 'nada instalado sem ligação');
});

test('8. o jeito antigo (chave) continua: entrar --chave cria a chave e mostra o código; uma chave já autorizada segue valendo', async () => {
  const PC4 = novoHome(); const e = roda(PC4, ['entrar', '--chave']); assert.equal(e.status, 0); assert.match(e.stdout, /c-[0-9a-f]{64}/); assert.ok(existsSync(join(PC4, '.claude', 'cerebro-chave.txt')));
  assert.match(roda(PC4, ['comece']).stderr, /Sem permissão|autoriza|401|errada/i, 'chave ainda não autorizada: o servidor recusa, como sempre');
  const principal = roda(PC4, ['comece'], { CEREBRO_CHAVE: 'chave-principal-so-de-teste-0123456789' }); assert.equal(principal.status, 0, 'a chave principal (variável) segue valendo');
});

test('9. entrar de novo, já ligado, não abre o navegador', () => { const r = roda(PC1, ['entrar']); assert.equal(r.status, 0); assert.match(r.stdout, /já está ligado ao Cérebro pelo login do Google/); });

const conexaoFalsa = (home, servidor, extra = {}) => { mkdirSync(join(home, '.claude'), { recursive: true }); writeFileSync(join(home, '.claude', 'cerebro-conexao.json'), JSON.stringify({ client_id: 'cbc_' + 'y'.repeat(20), refresh_token: 'cbr_' + 'x'.repeat(43), access_token: 'cbt_' + 'z'.repeat(43), exp: 1, servidor, ...extra })); };

test('10. servidor fora do ar: erro claro, NÃO manda reinstalar, não abre login novo e não cria chave', async () => {
  const PC = novoHome(), morto = 'http://localhost:1'; conexaoFalsa(PC, morto); const ex = { CEREBRO_URL: morto };
  const c = roda(PC, ['comece'], ex); assert.equal(c.status, 1); assert.match(c.stderr, /Não consegui falar com o servidor do Cérebro/); assert.ok(!/venceu|revogada|Rode: node/.test(c.stderr), 'não é falta de ligação');
  const a = roda(PC, ['aviso'], ex); assert.equal(a.status, 0); assert.ok(!/LIGUE AGORA/.test(a.stdout), 'o aviso não manda reinstalar por causa de uma queda do servidor'); assert.match(a.stdout, /Não consegui abrir o Cérebro agora/);
  const i = await rodaAsync(PC, ['instalar'], ex); assert.equal(i.status, 1); assert.ok(!/Abri o navegador/.test(i.stdout), 'queda de servidor não abre login'); assert.ok(!existsSync(join(PC, '.claude', 'cerebro-chave.txt')), 'nenhuma chave criada');
  assert.equal(lerJson(join(PC, '.claude', 'cerebro-conexao.json')).refresh_token, 'cbr_' + 'x'.repeat(43), 'a ligação não foi tocada');
});

test('11. trava de renovação: ocupada, nunca renova sem ela; presa há muito tempo, é derrubada', async () => {
  const PC = novoHome(), f = join(PC, '.claude', 'cerebro-conexao.json'), trava = join(PC, '.claude', 'cerebro-conexao.trava');
  writeFileSync; mkdirSync(join(PC, '.claude'), { recursive: true }); writeFileSync(f, readFileSync(join(PC1, '.claude', 'cerebro-conexao.json'))); const c0 = lerJson(f); writeFileSync(f, JSON.stringify({ ...c0, exp: 1 }));
  mkdirSync(trava); const ocupada = roda(PC, ['comece']); assert.equal(ocupada.status, 1); assert.match(ocupada.stderr, /renovando a ligação agora/); assert.equal(lerJson(f).refresh_token, c0.refresh_token, 'sem a trava o token de renovação NÃO foi gasto');
  const { utimesSync, rmSync: rm } = await import('node:fs'); const velho = new Date(Date.now() - 120e3); utimesSync(trava, velho, velho); const presa = roda(PC, ['comece']); assert.equal(presa.status, 0, presa.stderr); assert.notEqual(lerJson(f).refresh_token, c0.refresh_token, 'a trava velha foi derrubada e a renovação aconteceu'); assert.ok(!existsSync(trava));
  assert.equal(roda(PC, ['comece']).status, 0, 'a ligação segue viva');
  assert.ok(!existsSync(f + '.tmp-' + 1), 'sem restos de arquivo temporário');
});

test('12. a ligação só vale para o servidor em que foi feita (o token nunca vai para outro endereço)', () => {
  const PC = novoHome(); conexaoFalsa(PC, 'http://localhost:9999'); const c = roda(PC, ['comece']); assert.equal(c.status, 1); assert.match(c.stderr, /ainda não está ligado ao Cérebro/);
  const ruim = roda(PC, ['comece'], { CEREBRO_URL: 'http://localhost:1/ x' }); assert.equal(ruim.status, 1); assert.match(ruim.stderr, /CEREBRO_URL inválida/);
  const ruim2 = roda(PC, ['comece'], { CEREBRO_URL: 'http://a.com&calc' }); assert.match(ruim2.stderr, /CEREBRO_URL inválida/);
});

test('13. conector desligado por um ADM (503): a chave de reserva continua; sem chave, erro claro (nada de reinstalar)', async () => {
  const P2 = PORTA + 100, URL2 = 'http://localhost:' + P2; const s2 = spawn(process.execPath, [join(AQUI, 'servidor-local.mjs'), String(P2)], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...semTeste(), CONECTOR_DESLIGADO: '1' } });
  try { await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('servidor 2 não subiu')), 20000); s2.stdout.on('data', d => { if (String(d).includes('Servidor local')) { clearTimeout(t); ok(); } }); });
    const PC = novoHome(); conexaoFalsa(PC, URL2);
    const comChave = roda(PC, ['comece'], { CEREBRO_URL: URL2, CEREBRO_CHAVE: 'chave-principal-so-de-teste-0123456789' }); assert.equal(comChave.status, 0, comChave.stderr);
    const semChave = roda(PC, ['comece'], { CEREBRO_URL: URL2 }); assert.equal(semChave.status, 1); assert.match(semChave.stderr, /problema agora \(erro 503\)/); assert.ok(!/venceu|revogada/.test(semChave.stderr));
    assert.ok(!/LIGUE AGORA/.test(roda(PC, ['aviso'], { CEREBRO_URL: URL2 }).stdout)); }
  finally { s2.kill(); }
});

test('14. settings.json: a primeira cópia de segurança nunca é sobrescrita (as seguintes levam data) e o tempo do gancho antigo sobe para 60 s', async () => {
  const PC = novoHome(), cl = join(PC, '.claude'); mkdirSync(join(cl, 'hooks'), { recursive: true }); writeFileSync(join(cl, 'cerebro-conexao.json'), readFileSync(join(PC1, '.claude', 'cerebro-conexao.json')));
  const original = { theme: 'dark', hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'node ' + join(cl, 'cerebro.mjs').split('\\').join('/') + ' aviso', timeout: 25 }] }] } }; writeFileSync(join(cl, 'settings.json'), JSON.stringify(original, null, 2));
  let r = await rodaAsync(PC, ['instalar']); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /tempo máximo subiu para 60 s/); assert.deepEqual(lerJson(join(cl, 'settings.json.antes-do-cerebro')), original);
  let s = lerJson(join(cl, 'settings.json')); assert.equal(s.hooks.SessionStart[0].hooks[0].timeout, 60); delete s.hooks.Stop; writeFileSync(join(cl, 'settings.json'), JSON.stringify(s, null, 2));
  r = await rodaAsync(PC, ['instalar']); assert.equal(r.status, 0); assert.deepEqual(lerJson(join(cl, 'settings.json.antes-do-cerebro')), original, 'a primeira cópia ficou intacta');
  const datadas = (await import('node:fs')).readdirSync(cl).filter(x => x.startsWith('settings.json.antes-do-cerebro-')); assert.equal(datadas.length, 1, 'a cópia seguinte levou data'); assert.equal((await import('node:fs')).readdirSync(cl).filter(x => x.includes('.tmp-')).length, 0, 'sem restos temporários');
});

test('15. ligação vencida de verdade (renovação recusada): faz login novo e encerra a antiga no servidor', async () => {
  const PC = novoHome(); conexaoFalsa(PC, URL_SERVIDOR); const antes = lerJson(join(PC, '.claude', 'cerebro-conexao.json'));
  const r = await rodaAsync(PC, ['instalar']); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /Abri o navegador/); const depois = lerJson(join(PC, '.claude', 'cerebro-conexao.json')); assert.notEqual(depois.client_id, antes.client_id); assert.match(depois.refresh_token, /^cbr_/);
  assert.equal(roda(PC, ['comece']).status, 0);
});
