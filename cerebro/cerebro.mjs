#!/usr/bin/env node
/* cerebro.mjs: o jeito de uma IA ler e gravar no Cérebro do Estúdio Problems sem navegador. Este arquivo NÃO tem chave nenhuma.
   A chave vem da variável CEREBRO_CHAVE ou do arquivo ~/.claude/cerebro-chave.txt (fora de qualquer repositório).

   node cerebro.mjs aviso                                  o aviso curto do começo da sessão (usado pelo gancho do Claude Code)
   node cerebro.mjs entrar [--chave]                       liga este computador ao Cérebro: abre o navegador e a pessoa só toca em Permitir (login do Google). --chave = o jeito antigo, só de reserva (cria a chave e mostra o código c-...)
   node cerebro.mjs instalar [--so celestia,ouvir] [--manter]  liga o computador (login do Google, se faltar), baixa as skills e agentes para ~/.claude, liga os ganchos (começo da sessão e Stop) e cadastra o conector no Claude Code (com cópia do que mudar)
   node cerebro.mjs conferir                              diz se faltam skills ou se o Cérebro tem versão mais nova
   node cerebro.mjs inicio                                 o que a IA lê primeiro: o guia e o índice de tudo
   node cerebro.mjs comece | indice | pedidos              o guia, a árvore toda, os pedidos que estão esperando
   node cerebro.mjs ler "<Pasta/Arquivo>"                  mostra o arquivo com a versão
   node cerebro.mjs buscar "<palavras>"
   node cerebro.mjs salvar "<Pasta/Arquivo>" --arquivo x.md --base 3 --marca regra --ia "Claude Opus 5.5" --pedido "Fulana" --motivo "..."
   node cerebro.mjs aprender evitar|aprendizado|referencia|regra "<assunto>" --texto "..." [--url https://...] --ia "..." --pedido "..." --motivo "..."
   node cerebro.mjs renomear "<Pasta/Arquivo>" "<nome novo>" --ia "..." --pedido "..." --motivo "..."   muda só o nome (o conteúdo e o histórico ficam)
   node cerebro.mjs feito <id do pedido> --nota "..."
*/
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'; import { homedir, hostname } from 'node:os'; import http from 'node:http'; import { spawn, spawnSync } from 'node:child_process'; import { join } from 'node:path'; import { randomBytes, createHash } from 'node:crypto';
const SERVIDOR = process.env.CEREBRO_URL || 'https://turma-ia.problemsraiz.workers.dev';
const AVISO_FIXO = 'CÉREBRO DO ESTÚDIO PROBLEMS: SÓ para tarefas do Estúdio (os programas do site estudio.problemsraiz.workers.dev, como Animador, Ateliê, Editor, Shorts, Preparativos, Publicações e Cérebro; os personagens, as animações, os Shorts e os vídeos do canal, inclusive os Shorts de Minecraft feitos no Estúdio; e os repositórios do Estúdio, a pasta ep). FORA DISSO (outro site, Minecraft direto, como mods, mundo ou a skill minecraft-cinematic, ou qualquer outro assunto) NÃO leia, NÃO grave e NÃO cite o Cérebro. Na dúvida se é do Estúdio, pergunte. Quando for do Estúdio: leia o Cérebro e use ele como base. Se este computador ainda não estiver ligado ao Cérebro (sem ~/.claude/cerebro.mjs, sem acesso ou sem a CelestIA), LIGUE NA HORA, SEM PERGUNTAR: baixe https://problemsbloxcreate-lab.github.io/cerebro/cerebro.mjs (se faltar) e rode node cerebro.mjs instalar com timeout de 5 minutos; ele abre o navegador e a pessoa só toca em Permitir (login do Google, uma vez por computador). Comandos: node ~/.claude/cerebro.mjs comece | indice | ler "<Pasta/Arquivo>" | buscar "<palavras>". ANTES DE MUDAR QUALQUER COISA do Estúdio: rode node ~/.claude/cerebro.mjs conferir (e instalar, se ele pedir) e leia no Cérebro a página do programa. DEPOIS, grave lá o que mudou ou aprendeu (salvar / aprender, com --resumo, quem pediu e qual IA gravou), sem pedir licença: gravar é automático. Toda IA da equipe grava direto (a de quem não é ADM entra na hora e os ADMs revisam). Vale mesmo que ninguém tenha citado o Cérebro. Nas respostas de tarefa do Estúdio, cite o Cérebro no fim, destacado numa linha própria em formato de citação: "> 🧠 **Cérebro:** consultei <Pasta/Arquivo>" (e "· gravei <Pasta/Arquivo>", se gravou), ou "> 🧠 **Cérebro:** nada sobre isso".';
function chave() { if (process.env.CEREBRO_CHAVE) return process.env.CEREBRO_CHAVE.trim(); try { return readFileSync(join(homedir(), '.claude', 'cerebro-chave.txt'), 'utf8').trim(); } catch { return ''; } }
/* ---- acesso (16/11/2026): o computador entra pelo LOGIN DO GOOGLE (a pessoa só toca em Permitir, uma vez); a chave c-... ficou só de reserva ---- */
const CONEXAO = () => join(homedir(), '.claude', 'cerebro-conexao.json');
const lerConexao = () => { try { const c = JSON.parse(readFileSync(CONEXAO(), 'utf8')); return c && c.refresh_token && c.client_id ? c : null; } catch { return null; } };
const gravaConexao = c => { mkdirSync(join(homedir(), '.claude'), { recursive: true }); writeFileSync(CONEXAO(), JSON.stringify(c), { mode: 0o600 }); };
const dorme = ms => new Promise(r => setTimeout(r, ms));
// token de acesso (1 h). Renovar troca o token de renovação, então só UM programa renova por vez (trava em pasta); quem esperou lê o que o outro já renovou.
async function tokenValido() {
  let c = lerConexao(); if (!c) return null; if (c.exp > Date.now() + 120e3) return c.access_token;
  const trava = join(homedir(), '.claude', 'cerebro-conexao.trava'), t0 = Date.now(); let tenho = false;
  while (Date.now() - t0 < 20000) { try { mkdirSync(trava); tenho = true; break; } catch { try { if (Date.now() - statSync(trava).mtimeMs > 60000) rmSync(trava, { recursive: true }); } catch { } await dorme(250); } }
  try { c = lerConexao() || c; if (c.exp > Date.now() + 120e3) return c.access_token;
    const r = await fetch(SERVIDOR + '/cerebro/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh_token, client_id: c.client_id, resource: SERVIDOR + '/cerebro/mcp' }), signal: AbortSignal.timeout(20000) }), j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error('A ligação deste computador com o Cérebro venceu ou foi revogada (' + (j.error_description || r.status) + '). Rode: node ~/.claude/cerebro.mjs entrar');
    c = { ...c, access_token: j.access_token, refresh_token: j.refresh_token || c.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }; gravaConexao(c); return c.access_token;
  } finally { if (tenho) try { rmSync(trava, { recursive: true }); } catch { } } }
async function cabecalhos() { if (lerConexao()) return { authorization: 'Bearer ' + await tokenValido() }; const k = chave(); return k ? { 'x-cerebro-chave': k } : null; }
const SEM_ACESSO = 'Este computador ainda não está ligado ao Cérebro. Rode: node ~/.claude/cerebro.mjs instalar (abre o navegador: a pessoa só toca em Permitir, com o login do Google).';
async function pede(rota, corpo, texto) { const h = await cabecalhos(); if (!h) throw new Error(SEM_ACESSO);
  const r = await fetch(SERVIDOR + '/cerebro' + rota, { method: corpo ? 'POST' : 'GET', headers: { ...h, ...(corpo ? { 'content-type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(20000) });
  if (texto && r.ok) return r.text();
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j.error?.message || 'O servidor respondeu ' + r.status) + (r.status === 409 ? '\nNADA FOI GRAVADO. Rode: node cerebro.mjs ler "<Pasta/Arquivo>", veja a versão e grave de novo com --base <versão>.' : r.status === 401 || r.status === 403 ? '\nSem permissão. Rode: node ~/.claude/cerebro.mjs entrar (abre o navegador: só toque em Permitir).' : '')); return j; }
const pedeTexto = rota => pede(rota, null, true);
async function comeceEmCache() { const f = join(homedir(), '.claude', 'cerebro-aviso-cache.json'); try { const c = JSON.parse(readFileSync(f, 'utf8')); if (Date.now() - c.t < 600000) return c.j; } catch {} const j = await pede('/comece'); try { writeFileSync(f, JSON.stringify({ t: Date.now(), j })); } catch {} return j; }
const [cmd, ...resto] = process.argv.slice(2), pos = [], op = {};
const SEM_VALOR = new Set(['simular', 'manter', 'forcar', 'help', 'ajuda', 'chave']), COM_VALOR = new Set(['arquivo', 'base', 'marca', 'ia', 'pedido', 'motivo', 'texto', 'url', 'tipo', 'resumo', 'acrescentar', 'estado', 'nota', 'so']), desconhecidas = [];
for (let i = 0; i < resto.length; i++) { const a = resto[i]; if (a === '-h') op.help = true; else if (a.startsWith('--')) { const n = a.slice(2); if (SEM_VALOR.has(n)) op[n] = true; else if (COM_VALOR.has(n)) op[n] = resto[++i]; else desconhecidas.push(a); } else pos.push(a); }
const AJUDA = () => console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
const reg = () => ({ ia: op.ia || process.env.CEREBRO_IA, pedidoPor: op.pedido, motivo: op.motivo });
const mostra = o => console.log(JSON.stringify(o, null, 1));
const hoje = () => new Date().toISOString().slice(0, 10);
async function entrarComChave() { if (chave()) { console.log('Este computador já tem a chave do Cérebro.'); } else { const d = join(homedir(), '.claude'), k = randomBytes(32).toString('base64url'); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'cerebro-chave.txt'), k, { mode: 0o600 }); console.log('Chave criada e guardada só neste computador.\n\nCole este código no site, logado na SUA conta (não é segredo e não precisa de ADM):\n\nc-' + createHash('sha256').update(k).digest('hex') + '\n\nOnde colar: https://estudio.problemsraiz.workers.dev/cerebro/?aba=chaves\n(Cérebro › Acesso das IAs › "Autorize o código"). Depois rode: node ~/.claude/cerebro.mjs instalar'); } }
// ---- login do Google (16/11/2026): o programa se registra, abre o navegador na tela de permissão do Estúdio e recebe a resposta num endereço do PRÓPRIO computador (127.0.0.1) ----
function abreNavegador(url) { try { const c = process.env.CEREBRO_ABRIR; // para teste ou computador sem navegador: um comando que recebe o endereço
    if (c) spawn(c + ' "' + url + '"', { shell: true, detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'win32') spawn('rundll32', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore' }).unref();
    else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref(); } catch { } }
async function entrarPeloGoogle() {
  let esperado = null, ok, no; const espera = new Promise((a, b) => { ok = a; no = b; });
  const pagina = (rs, t, m) => { rs.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); rs.end('<!doctype html><meta charset="utf-8"><title>Cérebro</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:460px;margin:15vh auto;padding:0 20px"><h1 style="font-size:22px">' + t + '</h1><p>' + m + '</p>'); };
  const sv = http.createServer((rq, rs) => { const u = new URL(rq.url, 'http://127.0.0.1'); if (u.pathname !== '/callback') { rs.writeHead(404); return rs.end(); }
    const q = u.searchParams; if (!esperado || q.get('state') !== esperado || (q.get('iss') && q.get('iss') !== SERVIDOR)) return pagina(rs, 'Pedido inesperado', 'Esta conexão não foi pedida por este computador. Pode fechar esta janela.');
    if (q.get('error')) { pagina(rs, 'Conexão cancelada', 'Nada foi ligado. Pode fechar esta janela.'); return no(new Error('A pessoa cancelou o login (tocou em Cancelar).')); }
    pagina(rs, 'Pronto, conectado', 'Pode fechar esta janela e voltar ao Claude.'); ok(q.get('code')); });
  await new Promise((a, b) => { sv.once('error', b); sv.listen(0, '127.0.0.1', a); }); const porta = sv.address().port, redirect = 'http://127.0.0.1:' + porta + '/callback';
  try {
    const reg = await (await fetch(SERVIDOR + '/cerebro/oauth/registrar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'cerebro.mjs em ' + hostname().slice(0, 30), redirect_uris: [redirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }), signal: AbortSignal.timeout(20000) })).json().catch(() => ({}));
    if (!reg.client_id) throw new Error('O servidor não aceitou o registro (' + (reg.error_description || reg.error || 'sem resposta') + ').');
    const verifier = randomBytes(32).toString('base64url'), challenge = createHash('sha256').update(verifier).digest('base64url'); esperado = randomBytes(16).toString('base64url');
    const url = SERVIDOR + '/cerebro/oauth/autorizar?' + new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: esperado, resource: SERVIDOR + '/cerebro/mcp', scope: 'cerebro' });
    abreNavegador(url); console.log('Abri o navegador para entrar com o login do Google do Estúdio: toque em Permitir (uma vez por computador).\nSe o navegador não abrir, abra este endereço:\n  ' + url + '\nEsperando você tocar em Permitir (até 3 minutos)...');
    let cronometro; const limite = new Promise((_, no) => { cronometro = setTimeout(() => no(new Error('Tempo esgotado: ninguém tocou em Permitir em 3 minutos.')), 180e3); });
    const code = await Promise.race([espera, limite]).finally(() => clearTimeout(cronometro)); // sem isto o programa só sairia depois dos 3 minutos
    const r = await fetch(SERVIDOR + '/cerebro/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier, resource: SERVIDOR + '/cerebro/mcp' }), signal: AbortSignal.timeout(20000) }), j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error('O servidor não entregou a ligação (' + (j.error_description || r.status) + ').');
    gravaConexao({ client_id: reg.client_id, refresh_token: j.refresh_token, access_token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000, servidor: SERVIDOR, em: new Date().toISOString() });
    console.log('Pronto: este computador está ligado ao Cérebro pelo login do Google (nenhuma chave foi criada).');
  } finally { sv.close(); sv.closeAllConnections?.(); } }
// tenta o login do Google; se não der (sem navegador, cancelou, tempo), cai no jeito antigo só como RESERVA (a chave e o código c-...)
async function ligaComGoogle() { try { await entrarPeloGoogle(); return true; } catch (e) { console.log('Não consegui ligar pelo login do Google: ' + e.message + '\nPlano reserva (jeito antigo):'); await entrarComChave(); console.log('\nDepois de a pessoa colar o código no site, rode de novo: node ~/.claude/cerebro.mjs instalar. Ou rode "node ~/.claude/cerebro.mjs entrar" para tentar o login do Google de novo.'); return false; } }
async function acessoPronto() { if (!lerConexao() && !chave()) return false; try { await pede('/comece'); return true; } catch { return false; } }

// ---- instalar / conferir (12/11/2026): põe as skills e os agentes do Cérebro neste computador e liga o gancho do começo da sessão ----
import { existsSync, copyFileSync, readdirSync, chmodSync, statSync } from 'node:fs'; import { dirname, resolve } from 'node:path'; import { fileURLToPath } from 'node:url';
const CL = () => join(homedir(), '.claude'), MANI = () => join(CL(), 'cerebro-instalado.json');
const seguro = s => String(s).replace(/[<>:"|?*\\/]/g, '_').replace(/^\.+/, '_');
function destinoDe(pasta, nome) { // onde cada item de Skills/<pasta> vai no computador
  let m; const p = seguro(pasta);
  if (nome === 'Skill principal') return ['skills', p, 'SKILL.md'];
  if ((m = /^Agente (.+)$/.exec(nome))) return ['agents', seguro(m[1]) + '.md'];
  if ((m = /^(?:referencias|references) - (.+)$/.exec(nome))) return ['skills', p, 'references', seguro(m[1]) + (/\.\w{1,4}$/.test(m[1]) ? '' : '.md')];
  if ((m = /^scripts - (.+)$/.exec(nome))) return ['skills', p, 'scripts', seguro(m[1])];
  if (/^[\w.-]+\.\w{1,5}$/.test(nome)) return ['skills', p, seguro(nome)];
  return ['skills', p, 'references', seguro(nome) + '.md'];
}
const lerJson = (f, v) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return v; } };
const igualTxt = (a, b) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
async function itensDeSkills() { try { const j = await pede('/skills'); if (Array.isArray(j.itens)) return j.itens.map(x => ({ ...x, ver: x.verOk, verNova: x.ver })); } catch (e) { if (!/desconhecido|404/i.test(e.message)) throw e; }
  const { itens } = await pede('/'), raiz = itens.find(x => x.nome === 'Skills' && !x.pai && !x.apagado); if (!raiz) throw new Error('O Cérebro não tem a pasta Skills.');
  const out = []; for (const p of itens.filter(x => x.pai === raiz.id && x.tipo === 'pasta' && !x.apagado)) for (const c of itens.filter(x => x.pai === p.id && x.tipo !== 'pasta' && !x.apagado)) out.push({ pasta: p.nome, ...c }); return out; }
const GANCHO_STOP = String.raw`#!/usr/bin/env node
// Gancho Stop do Estúdio Problems: se nesta resposta a IA mudou algo do Estúdio
// e não gravou no Cérebro, ela não termina: volta e grava.
// Regra da dona (16/11/2026): gravar no Cérebro é automático, ninguém precisa pedir.
import { readFileSync } from 'node:fs';

let ent = {};
try { ent = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
if (ent.stop_hook_active) process.exit(0); // já voltou uma vez: não prende em laço
const caminho = ent.transcript_path;
if (!caminho) process.exit(0);

let linhas;
try { linhas = readFileSync(caminho, 'utf8').split('\n').filter(Boolean); } catch { process.exit(0); }

const ehPedido = (j) => {
  if (j.type !== 'user' || j.isMeta) return false;
  const c = j.message && j.message.content;
  if (typeof c === 'string') return true;
  return Array.isArray(c) && c.some((x) => x.type === 'text') && !c.some((x) => x.type === 'tool_result');
};

// só o trecho desde o último pedido (desta resposta)
const regs = [];
for (const l of linhas) { try { regs.push(JSON.parse(l)); } catch {} }
let ini = 0;
for (let i = regs.length - 1; i >= 0; i--) if (ehPedido(regs[i])) { ini = i; break; }

const PASTA_ESTUDIO = /(\\|\/)ep(\\|\/)|Estúdio Problems|Estudio Problems|estudio\.problemsraiz|(\\|\/)\.claude(\\|\/)skills(\\|\/)(celestia|walt-disney|design-problems|ouvir|dirigir-cenas|editar-longo|produzir-video|fazer-pedidos|modelar-3d)/i;
const FORA = /scratchpad|(\\|\/)memory(\\|\/)|conferencia|Backups/i;
const GRAVOU = /cerebro\.mjs['"]?\s+(aprender|salvar|renomear|feito)|gravar-cerebro/i;

let mudou = null, gravou = false;
for (const j of regs.slice(ini)) {
  if (j.type !== 'assistant' || !Array.isArray(j.message && j.message.content)) continue;
  for (const c of j.message.content) {
    if (c.type !== 'tool_use') continue;
    const n = c.name || '', inp = c.input || {};
    const txt = JSON.stringify(inp);
    if (GRAVOU.test(txt)) { gravou = true; continue; }
    if (/^(Edit|Write|NotebookEdit)$/.test(n)) {
      const p = inp.file_path || inp.notebook_path || '';
      if (PASTA_ESTUDIO.test(p) && !FORA.test(p)) mudou = mudou || ('arquivo ' + p);
    } else if (/javascript_tool$/.test(n)) {
      if (/\.salvar\s*\(|Nuvem\w*\.(salvar|gravar|enviar)|NuvemAnim\.|Vetor\.gravar|App\.salvar/i.test(inp.text || '')) mudou = mudou || 'projeto do Estúdio salvo pelo navegador';
    } else if (/^(Bash|PowerShell)$/.test(n)) {
      const cmd = inp.command || '';
      if (/git\s+(commit|push)|wrangler\s+(deploy|publish)/i.test(cmd) && PASTA_ESTUDIO.test(cmd + ' ' + (j.cwd || ''))) mudou = mudou || 'commit ou publicação do Estúdio';
      if (/127\.0\.0\.1:8810\/render/.test(cmd)) mudou = mudou || 'render do Blender do Estúdio';
    }
  }
}

if (mudou && !gravou) {
  console.log(JSON.stringify({
    decision: 'block',
    reason: 'Regra da dona (Cérebro, Regras/Toda correção da dona ou do Luigi vai para o Cérebro na hora): esta resposta mudou algo do Estúdio (' + mudou + ') e não gravou no Cérebro. Antes de terminar, grave agora com node ~/.claude/cerebro.mjs aprender aprendizado|evitar|regra "<assunto>" --texto "<o que estava errado, o que foi feito, a regra para não repetir>" --resumo "<até 160 letras>" --ia "<sua IA>" --pedido "<quem pediu>" --motivo "<por quê>". Se a mesma coisa já está gravada, atualize a página em vez de criar outra. Não precisa perguntar a ninguém: é automático. Depois diga numa linha qual página gravou.'
  }));
}
process.exit(0);
`; // gancho Stop da dona (16/11/2026): se a IA mudou algo do Estúdio e não gravou no Cérebro, ela volta e grava. Nunca prende em laço (stop_hook_active).
function poeGancho() { const f = join(CL(), 'settings.json'); let s = {}, msg = [], mudou = false;
  if (existsSync(f)) { try { s = JSON.parse(readFileSync(f, 'utf8')); } catch { return 'settings.json com erro de formato: NÃO mexi. Conserte e rode de novo.'; } }
  s.hooks = s.hooks || {}; s.hooks.SessionStart = s.hooks.SessionStart || []; s.hooks.Stop = s.hooks.Stop || []; const tem = (a, t) => JSON.stringify(a).includes(t);
  if (!tem(s.hooks.SessionStart, 'cerebro.mjs aviso')) { s.hooks.SessionStart.push({ hooks: [{ type: 'command', command: 'node ' + join(CL(), 'cerebro.mjs').replace(/\\/g, '/') + ' aviso', timeout: 25, statusMessage: 'Abrindo o Cérebro' }] }); mudou = true; msg.push('gancho do começo da sessão adicionado'); } else msg.push('o gancho do começo da sessão já estava');
  const sf = join(CL(), 'hooks', 'cerebro-gravou.mjs'), atual = existsSync(sf) ? readFileSync(sf, 'utf8').replace(/\r\n/g, '\n') : null;
  if (atual !== GANCHO_STOP) { mkdirSync(dirname(sf), { recursive: true }); if (atual !== null) copyFileSync(sf, sf + '.antes'); writeFileSync(sf, GANCHO_STOP); msg.push(atual === null ? 'script do gancho Stop gravado' : 'script do gancho Stop atualizado (cópia em cerebro-gravou.mjs.antes)'); }
  if (!tem(s.hooks.Stop, 'cerebro-gravou.mjs')) { s.hooks.Stop.push({ hooks: [{ type: 'command', command: 'node ' + sf.replace(/\\/g, '/'), timeout: 20, statusMessage: 'Conferindo se gravou no Cérebro' }] }); mudou = true; msg.push('gancho Stop adicionado'); } else msg.push('o gancho Stop já estava');
  if (mudou) { if (existsSync(f)) copyFileSync(f, f + '.antes-do-cerebro'); writeFileSync(f, JSON.stringify(s, null, 2)); }
  return msg.join('; ') + (mudou ? ' (o resto do settings.json foi mantido; cópia em settings.json.antes-do-cerebro).' : '.'); }
// cadastra o conector no Claude Code (opcional: este programa já lê e grava pelo login do Google; o conector dá as ferramentas nas conversas novas)
function ligaConector() { if (process.env.CEREBRO_SEM_CONECTOR === '1') return 'conector: pulado (CEREBRO_SEM_CONECTOR=1).'; const w = process.platform === 'win32', roda = a => spawnSync('claude', a, { encoding: 'utf8', shell: w, timeout: 25000, stdio: ['ignore', 'pipe', 'pipe'] });
  try { if (roda(['mcp', 'get', 'cerebro']).status === 0) return 'Conector do Cérebro já cadastrado no Claude Code.';
    const a = roda(['mcp', 'add', '--transport', 'http', '--scope', 'user', 'cerebro', SERVIDOR + '/cerebro/mcp']);
    return a.status === 0 ? 'Conector cadastrado no Claude Code (servidor "cerebro"). Nas conversas novas as ferramentas aparecem depois de /mcp > cerebro > Authenticate (opcional: este programa já funciona).' : 'Não consegui cadastrar o conector (claude mcp add falhou). Sem problema: o Cérebro funciona por este programa.'; }
  catch { return 'Não achei o programa claude para cadastrar o conector. Sem problema: o Cérebro funciona por este programa.'; } }
async function instalar() {
  if (!('simular' in op)) mkdirSync(CL(), { recursive: true });
  const eu = fileURLToPath(import.meta.url), casa = join(CL(), 'cerebro.mjs'), sim = 'simular' in op;
  if (!sim && resolve(eu) !== resolve(casa)) { copyFileSync(eu, casa); console.log('Copiei o cerebro.mjs para ' + casa); }
  if (sim && !lerConexao() && !chave()) { console.log('Este computador ainda não está ligado ao Cérebro: --simular não faz o login. Rode sem --simular.'); return; }
  if (!sim && !(await acessoPronto())) { if (!(await ligaComGoogle())) return; }
  const so = op.so ? op.so.split(',').map(x => x.trim()) : null, man = lerJson(MANI(), {}), dia = join(CL(), 'cerebro-backup', hoje() + '-' + Date.now()), nov = [], atu = [], ok = [], dif = [];
  let it; try { it = await itensDeSkills(); } catch (e) { if (/401|403|autoriza|permiss/i.test(e.message)) throw new Error('Este computador ainda não está autorizado no Cérebro. Rode: node ~/.claude/cerebro.mjs entrar (abre o navegador: só toque em Permitir) e depois instalar de novo.'); throw e; }
  for (const c of it) { if (so && !so.includes(c.pasta)) continue;
    const dest = join(CL(), ...destinoDe(c.pasta, c.nome)), existe = existsSync(dest);
    if (existe && man[c.id] === c.ver) { ok.push(c.nome); continue; }
    const corpo = (c.verNova && c.verNova !== c.ver ? (await pede('/versao?id=' + encodeURIComponent(c.id) + '&ver=' + c.ver)).corpo : (await pede('/item?id=' + encodeURIComponent(c.id))).item.corpo) || '';
    if (existe) { const loc = readFileSync(dest, 'utf8'); if (igualTxt(loc, corpo)) { man[c.id] = c.ver; ok.push(c.nome); continue; }
      if (!('forcar' in op) && ('manter' in op || statSync(dest).mtimeMs > (c.em || 0))) { dif.push(c.pasta + '/' + c.nome); continue; }
      atu.push(c.pasta + '/' + c.nome); if (!sim) { const bk = join(dia, ...destinoDe(c.pasta, c.nome)); mkdirSync(dirname(bk), { recursive: true }); copyFileSync(dest, bk); } } else nov.push(c.pasta + '/' + c.nome);
    if (sim) continue;
    mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, corpo); if (/\.(sh|mjs)$/.test(dest)) { try { chmodSync(dest, 0o755); } catch {} } man[c.id] = c.ver; }
  if (!('simular' in op)) writeFileSync(MANI(), JSON.stringify(man));
  console.log((sim ? '[SIMULAÇÃO: nada foi gravado] ' : '') + `Skills e agentes: ${nov.length} novos, ${atu.length} a atualizar, ${ok.length} já em dia.` + (atu.length ? ' (os arquivos que você tinha mexido foram copiados para ' + dia + ')' : ''));
  if (dif.length) console.log('LOCAL MAIS NOVO OU DIFERENTE, NÃO SOBRESCREVI (grave no Cérebro com ~/.claude/skills/celestia/scripts/gravar-cerebro.sh, ou use --forcar para trocar pelo do Cérebro, com backup): ' + dif.join(', '));
  if (nov.length) console.log('Novos: ' + nov.join(', ')); if (atu.length) console.log('Atualizados: ' + atu.join(', '));
  if (!('simular' in op)) { console.log(poeGancho()); console.log(ligaConector());
    const ve = existsSync(join(CL(), 'skills', 'ouvir', '.venv'));
    console.log(ve ? 'ouvir: ambiente pesado (.venv) já existe.' : 'ouvir (opcional, ~2 GB, roda sem token): para ouvir áudio e vídeo neste computador, instale ffmpeg e rode:\n  cd ~/.claude/skills/ouvir && python -m venv .venv && .venv/Scripts/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu && .venv/Scripts/pip install faster-whisper demucs transformers soundfile numpy\n(no Mac/Linux troque .venv/Scripts por .venv/bin). Sem isso a CelestIA funciona, só não escuta áudio.');
    console.log('Pronto. Nenhuma chave nem senha foi gravada (a ligação é o login do Google). Abra o Claude Code de novo: a CelestIA e os especialistas já estão no lugar.'); } }
// confere de tempos em tempos (no máximo 1 vez a cada 6 h, 1 requisição) se faltam skills ou se o Cérebro tem versão mais nova
async function avisoInstalar() { try { const r = await conferir(false); return r.falta.length ? '\nA CelestIA não está instalada neste computador (faltam: ' + r.falta.join(', ') + '). Rode agora: node ~/.claude/cerebro.mjs instalar' : r.n ? '\nO Cérebro tem ' + r.n + ' arquivo(s) de skill/agente mais novos que os daqui. A CelestIA deve rodar: node ~/.claude/cerebro.mjs instalar' : ''; } catch { return ''; } }
async function conferir(forca) { const fc = join(CL(), 'cerebro-conferido.json'), c = lerJson(fc, { t: 0, n: 0 });
  const falta = ['skills/celestia/SKILL.md', 'agents/celestia.md'].filter(x => !existsSync(join(CL(), x)));
  if (!forca && !falta.length && Date.now() - c.t < 6 * 3600e3) return { n: c.n, falta };
  let n = 0; try { const man = lerJson(MANI(), {}), it = await itensDeSkills(); for (const x of it) { if (man[x.id] !== x.ver || !existsSync(join(CL(), ...destinoDe(x.pasta, x.nome)))) n++; } writeFileSync(fc, JSON.stringify({ t: Date.now(), n })); } catch { return { n: c.n, falta }; }
  return { n, falta }; }
const PASTAS = { evitar: 'A evitar', aprendizado: 'Aprendizados', referencia: 'Referências', regra: 'Regras' };
if (!cmd || cmd === 'ajuda' || cmd === 'help' || cmd === '-h' || cmd === '--help' || op.help || op.ajuda) { AJUDA(); process.exit(0); }
if (desconhecidas.length) { console.error('Opção desconhecida: ' + desconhecidas.join(' ') + '. Nada foi feito. Veja: node cerebro.mjs --help'); process.exit(1); }
try {
  if (cmd === 'entrar') { if ('chave' in op) await entrarComChave(); else if (lerConexao()) console.log('Este computador já está ligado ao Cérebro pelo login do Google.'); else if (!(await ligaComGoogle())) process.exitCode = 1; }
  else if (cmd === 'instalar') await instalar();
  else if (cmd === 'conferir') { const r = await conferir(true); console.log(r.falta.length ? 'Faltam: ' + r.falta.join(', ') + '. Rode: node ~/.claude/cerebro.mjs instalar' : r.n ? r.n + ' arquivo(s) de skill/agente mais novos no Cérebro (ou faltando aqui). Rode: node ~/.claude/cerebro.mjs instalar' : 'Skills e agentes em dia com o Cérebro.'); }
  else if (cmd === 'inicio') console.log(await pedeTexto('/inicio'));
  else if (cmd === 'aviso') { try { const j = await comeceEmCache(); console.log(AVISO_FIXO + (j.pedidosNovos ? `\nHá ${j.pedidosNovos} pedido(s) esperando no Cérebro: node ~/.claude/cerebro.mjs pedidos` : '') + await avisoInstalar() + '\nPastas: ' + j.pastas.join(' · ') + '\n\n' + String(j.texto).slice(0, 7000)); } catch (e) { console.log(AVISO_FIXO + (/ainda não está ligado|Sem permissão|inválid|venceu|revogad|401|403/i.test(e.message) ? '\n⚠ ESTE COMPUTADOR AINDA NÃO ESTÁ LIGADO AO CÉREBRO. LIGUE AGORA, SEM PERGUNTAR (ordem da dona): rode node ~/.claude/cerebro.mjs instalar com timeout de 5 minutos. Ele abre o navegador e a pessoa só toca em Permitir (login do Google). Diga a ela numa linha só: "Abri o navegador: toque em Permitir para ligar o Cérebro."' : '\n(Não consegui abrir o Cérebro agora: ' + e.message + ')')); } }
  else if (cmd === 'comece') console.log((await pede('/comece')).texto);
  else if (cmd === 'indice') { const { itens } = await pede('/'), f = p => itens.filter(x => (x.pai || null) === p).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })); const v = (p, d) => { for (const x of f(p)) { console.log('  '.repeat(d) + (x.tipo === 'pasta' ? '[' + x.nome + ']' : x.nome + (x.marca ? ' (' + x.marca + ')' : '')) + (x.resumo ? ' - ' + x.resumo : '')); if (x.tipo === 'pasta') v(x.id, d + 1); } }; v(null, 0); }
  else if (cmd === 'ler') { const { item: x, versoes } = await pede('/item?caminho=' + encodeURIComponent(pos[0])); console.log(`# ${x.nome} (versão ${x.ver}, tipo ${x.tipo}${x.marca ? ', marca ' + x.marca : ''})${x.url ? '\nLink: ' + x.url : ''}${x.img ? '\nImagem: ' + x.img : ''}\nÚltima mudança: ${x.por}${x.pedido ? ', a pedido de ' + x.pedido : ''}, ${versoes.length} versão(ões) no histórico\n\n${x.corpo || ''}`); }
  else if (cmd === 'buscar') { let tr = null; try { tr = await pede('/trechos?n=8&q=' + encodeURIComponent(pos.join(' '))); } catch { }
    if (tr && tr.itens) { if (!tr.itens.length) console.log('Nada encontrado.'); for (const x of tr.itens) console.log(`- ${x.caminho}${x.titulo ? ' › ' + x.titulo : ''}: ${String(x.trecho || '').replace(/\*\*/g, '').replace(/\s+/g, ' ')}`); }
    else for (const x of (await pede('/buscar?q=' + encodeURIComponent(pos.join(' ')))).itens) console.log(`- ${x.nome} [${x.id}]: ${String(x.trecho || x.resumo || '').replace(/\s+/g, ' ')}`); }
  else if (cmd === 'pedidos') for (const x of (await pede('/pedidos?estado=novo')).itens) console.log(`- ${x.id} (${x.tipo}) de ${x.por}${x.alvo ? ', sobre ' + x.alvo : ''}: ${x.texto}`);
  else if (cmd === 'salvar') mostra(await pede('/salvar', { caminho: pos[0], tipo: op.tipo || 'texto', corpo: op.arquivo ? readFileSync(op.arquivo, 'utf8') : op.texto, ...(op.acrescentar ? { acrescentar: op.acrescentar } : {}), ...(op.base ? { base: +op.base } : {}), ...(op.marca ? { marca: op.marca } : {}), ...(op.resumo ? { resumo: op.resumo } : {}), ...(op.url ? { url: op.url } : {}), ...reg() }));
  else if (cmd === 'aprender') { const t = pos[0]; if (!PASTAS[t]) throw new Error('Use: evitar, aprendizado, referencia ou regra.'); mostra(await pede('/salvar', { caminho: `${PASTAS[t]}/${hoje()} ${String(pos[1] || '').replace(/[\/\\]+/g, '-')}`, tipo: t === 'referencia' ? 'referencia' : 'texto', marca: t, corpo: op.arquivo ? readFileSync(op.arquivo, 'utf8') : op.texto, ...(op.url ? { url: op.url } : {}), ...(op.resumo ? { resumo: op.resumo } : {}), ...reg() })); }
  else if (cmd === 'renomear') { if (!pos[0] || !pos[1]) throw new Error('Use: renomear "<Pasta/Arquivo>" "<nome novo>" --ia ... --pedido ... --motivo ...'); const { item: x } = await pede('/item?caminho=' + encodeURIComponent(pos[0])); mostra(await pede('/salvar', { id: x.id, nome: pos[1], base: x.ver, ...reg() })); }
  else if (cmd === 'feito') mostra(await pede('/pedido', { id: pos[0], estado: op.estado || 'feito', nota: op.nota, ...reg() }));
  else console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
} catch (e) { console.error(e.message); process.exit(1); }
