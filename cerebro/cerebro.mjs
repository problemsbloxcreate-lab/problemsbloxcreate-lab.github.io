#!/usr/bin/env node
/* cerebro.mjs: o jeito de uma IA ler e gravar no Cérebro do Estúdio Problems sem navegador. Este arquivo NÃO tem chave nenhuma.
   A chave vem da variável CEREBRO_CHAVE ou do arquivo ~/.claude/cerebro-chave.txt (fora de qualquer repositório).

   node cerebro.mjs aviso                                  o aviso curto do começo da sessão (usado pelo gancho do Claude Code)
   node cerebro.mjs entrar [--chave]                       liga este computador ao Cérebro: abre o navegador e a pessoa só toca em Permitir (login do Google). --chave = o jeito antigo, só de reserva (cria a chave e mostra o código c-...)
   node cerebro.mjs instalar [--so celestia,ouvir] [--manter]  liga o computador (login do Google, se faltar), baixa as skills e agentes para ~/.claude, liga os ganchos (começo da sessão, consulta a cada pedido e Stop) e cadastra o conector no Claude Code (com cópia do que mudar)
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
import { readFileSync, writeFileSync, mkdirSync, rmSync, renameSync } from 'node:fs'; import { homedir, hostname } from 'node:os'; import http from 'node:http'; import { spawn, spawnSync } from 'node:child_process'; import { join } from 'node:path'; import { randomBytes, createHash } from 'node:crypto';
const SERVIDOR = process.env.CEREBRO_URL || 'https://turma-ia.problemsraiz.workers.dev';
if (!/^https?:\/\/[\w.:-]+$/.test(SERVIDOR)) { console.error('CEREBRO_URL inválida (use só http:// ou https:// e o endereço, sem espaços nem símbolos).'); process.exit(1); }
const AVISO_FIXO = 'CÉREBRO DO ESTÚDIO PROBLEMS: SÓ para tarefas do Estúdio (os programas do site estudio.problemsraiz.workers.dev, como Animador, Ateliê, Editor, Shorts, Preparativos, Publicações e Cérebro; os personagens, as animações, os Shorts e os vídeos do canal, inclusive os Shorts de Minecraft feitos no Estúdio; e os repositórios do Estúdio, a pasta ep). FORA DISSO (outro site, Minecraft direto, como mods, mundo ou a skill minecraft-cinematic, ou qualquer outro assunto) NÃO leia, NÃO grave e NÃO cite o Cérebro. Na dúvida se é do Estúdio, pergunte. Quando for do Estúdio: leia o Cérebro e use ele como base. Se este computador ainda não estiver ligado ao Cérebro (sem ~/.claude/cerebro.mjs, sem acesso ou sem a CelestIA), LIGUE NA HORA, SEM PERGUNTAR: baixe https://problemsbloxcreate-lab.github.io/cerebro/cerebro.mjs (se faltar) e rode node cerebro.mjs instalar com timeout de 5 minutos; ele abre o navegador e a pessoa só toca em Permitir (login do Google, uma vez por computador). Comandos: node ~/.claude/cerebro.mjs comece | indice | ler "<Pasta/Arquivo>" | buscar "<palavras>". ANTES DE MUDAR QUALQUER COISA do Estúdio: rode node ~/.claude/cerebro.mjs conferir (e instalar, se ele pedir) e leia no Cérebro a página do programa. DEPOIS, grave lá o que mudou ou aprendeu (salvar / aprender, com --resumo, quem pediu e qual IA gravou), sem pedir licença: gravar é automático. Toda IA da equipe grava direto (a de quem não é ADM entra na hora e os ADMs revisam). Vale mesmo que ninguém tenha citado o Cérebro. Nas respostas de tarefa do Estúdio, cite o Cérebro no fim, destacado numa linha própria em formato de citação: "> 🧠 **Cérebro:** consultei <Pasta/Arquivo>" (e "· gravei <Pasta/Arquivo>", se gravou), ou "> 🧠 **Cérebro:** nada sobre isso".';
function chave() { if (process.env.CEREBRO_CHAVE) return process.env.CEREBRO_CHAVE.trim(); try { return readFileSync(join(homedir(), '.claude', 'cerebro-chave.txt'), 'utf8').trim(); } catch { return ''; } }
/* ---- acesso (16/11/2026): o computador entra pelo LOGIN DO GOOGLE (a pessoa só toca em Permitir, uma vez); a chave c-... ficou só de reserva ---- */
const CONEXAO = () => join(homedir(), '.claude', 'cerebro-conexao.json');
const lerConexao = () => { try { const c = JSON.parse(readFileSync(CONEXAO(), 'utf8')); return c && c.refresh_token && c.client_id && (!c.servidor || c.servidor === SERVIDOR) ? c : null; } catch { return null; } }; // só vale para o servidor onde foi feita: o token nunca vai para outro endereço
const gravaConexao = c => { mkdirSync(join(homedir(), '.claude'), { recursive: true }); const t = CONEXAO() + '.tmp-' + process.pid; writeFileSync(t, JSON.stringify(c), { mode: 0o600 }); renameSync(t, CONEXAO()); }; // arquivo novo ao lado e troca de nome: nunca fica pela metade
class ErroServidor extends Error { } // o servidor não respondeu ou deu erro 5xx: NÃO é falta de ligação (não manda reinstalar)
const dorme = ms => new Promise(r => setTimeout(r, ms));
// token de acesso (1 h). Renovar troca o token de renovação, então só UM programa renova por vez (trava em pasta); quem esperou lê o que o outro já renovou.
async function tokenValido() {
  let c = lerConexao(); if (!c) return null; if (c.exp > Date.now() + 120e3) return c.access_token;
  const trava = join(homedir(), '.claude', 'cerebro-conexao.trava'), t0 = Date.now(); let tenho = false;
  while (Date.now() - t0 < 8000) { try { mkdirSync(trava); tenho = true; break; } catch { try { if (Date.now() - statSync(trava).mtimeMs > 30000) rmSync(trava, { recursive: true }); } catch { } await dorme(250); } }
  if (!tenho) { c = lerConexao() || c; if (c.exp > Date.now() + 120e3) return c.access_token; throw new ErroServidor('Outro programa do Cérebro está renovando a ligação agora. Tente de novo em instantes.'); } // sem a trava NUNCA renova: dois programas renovando com o mesmo token derrubam a ligação
  try { c = lerConexao() || c; if (c.exp > Date.now() + 120e3) return c.access_token;
    let r = null, j = {}; for (let i = 0; i < 2 && !r; i++) { try { r = await fetch(SERVIDOR + '/cerebro/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh_token, client_id: c.client_id, resource: SERVIDOR + '/cerebro/mcp' }), signal: AbortSignal.timeout(7000) }); j = await r.json().catch(() => ({})); } catch { r = null; await dorme(500); } } // rede falhou: tenta de novo na hora (o servidor aceita repetir o mesmo token por 60 s)
    if (!r) throw new ErroServidor('Não consegui falar com o servidor do Cérebro agora (sem resposta). Tente de novo mais tarde; nada foi perdido.');
    if (r.status >= 500) throw new ErroServidor('O servidor do Cérebro está com problema agora (erro ' + r.status + '). Tente de novo mais tarde; nada foi perdido.');
    if (!r.ok || !j.access_token) throw new Error('A ligação deste computador com o Cérebro venceu ou foi revogada (' + (j.error_description || r.status) + '). Rode: node ~/.claude/cerebro.mjs entrar');
    c = { ...c, access_token: j.access_token, refresh_token: j.refresh_token || c.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }; gravaConexao(c); return c.access_token;
  } finally { if (tenho) try { rmSync(trava, { recursive: true }); } catch { } } }
async function cabecalhos() { if (lerConexao()) { try { return { authorization: 'Bearer ' + await tokenValido() }; } catch (e) { const k = chave(); if (k) return { 'x-cerebro-chave': k }; throw e; } } const k = chave(); return k ? { 'x-cerebro-chave': k } : null; }
const SEM_ACESSO = 'Este computador ainda não está ligado ao Cérebro. Rode: node ~/.claude/cerebro.mjs instalar (abre o navegador: a pessoa só toca em Permitir, com o login do Google).';
async function pede(rota, corpo, texto) { const h = await cabecalhos(); if (!h) throw new Error(SEM_ACESSO);
  const chama = hh => fetch(SERVIDOR + '/cerebro' + rota, { method: corpo ? 'POST' : 'GET', headers: { ...hh, ...(corpo ? { 'content-type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(20000) });
  let r; try { r = await chama(h); } catch { throw new ErroServidor('Não consegui falar com o servidor do Cérebro agora (sem resposta). Tente de novo mais tarde.'); }
  if (r.status === 503 && h.authorization && chave()) r = await chama({ 'x-cerebro-chave': chave() }).catch(() => r); // conector desligado por um ADM: a chave antiga (reserva) continua
  if (texto && r.ok) return r.text();
  const j = await r.json().catch(() => ({})); if (r.status >= 500) throw new ErroServidor('O servidor do Cérebro está com problema agora (erro ' + r.status + '). Tente de novo mais tarde; nada foi perdido.');
  if (!r.ok) throw new Error((j.error?.message || 'O servidor respondeu ' + r.status) + (r.status === 409 ? '\nNADA FOI GRAVADO. Rode: node cerebro.mjs ler "<Pasta/Arquivo>", veja a versão e grave de novo com --base <versão>.' : r.status === 401 || r.status === 403 ? '\nSem permissão. Rode: node ~/.claude/cerebro.mjs entrar (abre o navegador: só toque em Permitir).' : '')); return j; }
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
function abreNavegador(url) { const mostra = () => console.log('Não consegui abrir o navegador. Abra este endereço (e toque em Permitir):\n  ' + url);
  try { const c = process.env.CEREBRO_ABRIR, base = { detached: true, stdio: 'ignore', cwd: homedir() }; let p; // CEREBRO_ABRIR: para teste ou computador sem navegador, um comando que recebe o endereço
    if (c) p = spawn(c + ' "' + url + '"', { ...base, shell: true });
    else if (process.platform === 'win32') p = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'rundll32.exe'), ['url.dll,FileProtocolHandler', url], base);
    else p = spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], base);
    p.on('error', mostra); p.on('exit', code => { if (code) mostra(); }); p.unref(); } catch { mostra(); } }
async function entrarPeloGoogle() {
  let esperado = null, ok, no; const espera = new Promise((a, b) => { ok = a; no = b; });
  const pagina = (rs, t, m) => { rs.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); rs.end('<!doctype html><meta charset="utf-8"><title>Cérebro</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:460px;margin:15vh auto;padding:0 20px"><h1 style="font-size:22px">' + t + '</h1><p>' + m + '</p>'); };
  const sv = http.createServer((rq, rs) => { const u = new URL(rq.url, 'http://127.0.0.1'); if (u.pathname !== '/callback') { rs.writeHead(404); return rs.end(); }
    const q = u.searchParams; if (!esperado || q.get('state') !== esperado || q.get('iss') !== SERVIDOR) return pagina(rs, 'Pedido inesperado', 'Esta conexão não foi pedida por este computador. Pode fechar esta janela.');
    if (q.get('error')) { pagina(rs, 'Conexão cancelada', 'Nada foi ligado. Pode fechar esta janela.'); return no(new Error('A pessoa cancelou o login (tocou em Cancelar).')); }
    pagina(rs, 'Pronto, conectado', 'Pode fechar esta janela e voltar ao Claude.'); ok(q.get('code')); });
  await new Promise((a, b) => { sv.once('error', b); sv.listen(0, '127.0.0.1', a); }); const porta = sv.address().port, redirect = 'http://127.0.0.1:' + porta + '/callback';
  try {
    const reg = await (await fetch(SERVIDOR + '/cerebro/oauth/registrar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'cerebro.mjs em ' + hostname().slice(0, 30), redirect_uris: [redirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }), signal: AbortSignal.timeout(20000) })).json().catch(() => ({}));
    if (!reg.client_id) throw new Error('O servidor não aceitou o registro (' + (reg.error_description || reg.error || 'sem resposta') + ').');
    const verifier = randomBytes(32).toString('base64url'), challenge = createHash('sha256').update(verifier).digest('base64url'); esperado = randomBytes(16).toString('base64url');
    const url = SERVIDOR + '/cerebro/oauth/autorizar?' + new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state: esperado, resource: SERVIDOR + '/cerebro/mcp', scope: 'cerebro' });
    abreNavegador(url); console.log('Abri o navegador para entrar com o login do Google do Estúdio: toque em Permitir (uma vez por computador).' + (process.env.CEREBRO_MOSTRAR_URL === '1' ? '\nEndereço: ' + url : '') + '\nEsperando você tocar em Permitir (até 3 minutos)...');
    let cronometro; const limite = new Promise((_, no) => { cronometro = setTimeout(() => no(new Error('Tempo esgotado: ninguém tocou em Permitir em 3 minutos.')), 180e3); });
    const code = await Promise.race([espera, limite]).finally(() => clearTimeout(cronometro)); // sem isto o programa só sairia depois dos 3 minutos
    const r = await fetch(SERVIDOR + '/cerebro/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: reg.client_id, code_verifier: verifier, resource: SERVIDOR + '/cerebro/mcp' }), signal: AbortSignal.timeout(20000) }), j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error('O servidor não entregou a ligação (' + (j.error_description || r.status) + ').');
    const velha = lerConexao();
    gravaConexao({ client_id: reg.client_id, refresh_token: j.refresh_token, access_token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000, servidor: SERVIDOR, em: new Date().toISOString() });
    if (velha?.refresh_token) await fetch(SERVIDOR + '/cerebro/oauth/revogar', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: velha.refresh_token, client_id: velha.client_id }), signal: AbortSignal.timeout(10000) }).catch(() => { });
    console.log('Pronto: este computador está ligado ao Cérebro pelo login do Google (nenhuma chave foi criada).');
  } finally { sv.close(); sv.closeAllConnections?.(); } }
// tenta o login do Google; se não der (sem navegador, cancelou, tempo), cai no jeito antigo só como RESERVA (a chave e o código c-...)
async function ligaComGoogle() { try { await entrarPeloGoogle(); return true; } catch (e) { console.log('Não consegui ligar pelo login do Google: ' + e.message + '\nPlano reserva (jeito antigo):'); await entrarComChave(); console.log('\nDepois de a pessoa colar o código no site, rode de novo: node ~/.claude/cerebro.mjs instalar. Ou rode "node ~/.claude/cerebro.mjs entrar" para tentar o login do Google de novo.'); return false; } }
async function acessoPronto() { if (!lerConexao() && !chave()) return false; try { await pede('/comece'); return true; } catch (e) { if (e instanceof ErroServidor) throw e; return false; } }

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
// Gancho Stop do Estúdio Problems: se nesta resposta a IA mudou algo do Estúdio,
// passou uma ordem adiante ou recebeu uma correção ou decisão da dona ou da equipe,
// e não gravou no Cérebro, ela não termina: volta e grava.
// Regra da dona (16/11/2026): gravar no Cérebro é automático, ninguém precisa pedir,
// e vale para TODA mudança e TODA correção, para a IA nunca precisar reaprender nada.
import { readFileSync } from 'node:fs';

let ent = {};
try { ent = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
if (ent.stop_hook_active) process.exit(0); // já voltou uma vez: não prende em laço
const caminho = ent.transcript_path;
if (!caminho) process.exit(0);

let linhas;
try { linhas = readFileSync(caminho, 'utf8').split('\n').filter(Boolean); } catch { process.exit(0); }

const textoDe = (j) => {
  const c = j.message && j.message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((x) => x.type === 'text').map((x) => x.text || '').join('\n');
  return '';
};
const ehPedido = (j) => {
  if (j.type !== 'user' || j.isMeta || j.isCompactSummary) return false;
  const c = j.message && j.message.content;
  if (/^\s*This session is being continued from a previous conversation/.test(textoDe(j))) return false; // resumo da conversa, não é pedido
  if (typeof c === 'string') return true;
  return Array.isArray(c) && c.some((x) => x.type === 'text') && !c.some((x) => x.type === 'tool_result');
};

// só o trecho desde o último pedido (desta resposta)
const regs = [];
for (const l of linhas) { try { regs.push(JSON.parse(l)); } catch {} }
let ini = -1;
for (let i = regs.length - 1; i >= 0; i--) if (ehPedido(regs[i])) { ini = i; break; }
if (ini < 0) process.exit(0);

const PASTA_ESTUDIO = /(\\|\/)ep(\\|\/)|Estúdio Problems|Estudio Problems|estudio\.problemsraiz|(\\|\/)\.claude(\\|\/)(skills(\\|\/)(celestia|walt-disney|design-problems|ouvir|dirigir-cenas|editar-longo|produzir-video|fazer-pedidos|modelar-3d|esqueleto-padrao|movimento-base|estilo-lumi)|agents(\\|\/)(celestia|walt-disney|design-problems)|hooks(\\|\/)cerebro)/i;
const FORA = /scratchpad|conferencia|Backups/i;
const MEMORIA = /(\\|\/)memory(\\|\/)/i;
const GRAVOU = /cerebro\.mjs['"]?\s+(aprender|salvar|renomear|feito)|gravar-cerebro/i;

// A conversa é do Estúdio? (pedido com palavra do Estúdio, skill do Estúdio ou pasta do Estúdio)
const PALAVRAS_ESTUDIO = /\/(celestia|walt-disney|design-problems|dirigir-cenas|editar-longo|produzir-video|fazer-pedidos|modelar-3d)\b|est[uú]dio|animador|ateli[eê]|c[eé]rebro|\bshorts?\b|\bep ?\d|\bparte ?\d|blender|personage|\bstick\b|\blumi\b|\bproblems\b|preparativos|publica[cç][oõ]es|anima[cç][aã]o|render/i;
const pedido = regs[ini];
const txtPedido = textoDe(pedido);
const avisoAutomatico = /^\s*<(task-notification|side-sessions-event|ci-monitor-event|system-reminder|local-command)/i.test(txtPedido);
const pastaDaConversa = String(pedido.cwd || ent.cwd || '');
const ehEstudio = PALAVRAS_ESTUDIO.test(txtPedido) || PASTA_ESTUDIO.test(pastaDaConversa) || /Retomar Claude/i.test(pastaDaConversa);

// Correção, pedido de mudança, aprovação ou decisão da dona ou da equipe
const CORRECAO = /n[aã]o pedi|errad|t[aá] (errado|feio|horr[ií]vel|estranho|quebrado|torto|duplicado)|ficou (bom|[oó]timo|lindo|perfeito|ruim|feio|horr[ií]vel|estranho)|perfeito|aprovad|tem q(ue)?\b|precisa(m)?\b|nunca\b|sempre\b|arruma|corrig|consert|desfa[zç]|deixa (assim|como)|n[aã]o (é|e) (isso|s[oó]|pra)|prefiro|quero\b|pode (p[oô]r|por|fazer|mandar|renderizar|tirar|colocar|seguir|exportar)|tira\b|coloca\b|troca\b|muda\b|aumenta|diminui|regra/i;

let mudou = null, gravou = false;
for (const j of regs.slice(ini)) {
  if (j.type !== 'assistant' || !Array.isArray(j.message && j.message.content)) continue;
  for (const c of j.message.content) {
    if (c.type !== 'tool_use') continue;
    const n = c.name || '', inp = c.input || {};
    // gravou de verdade: comando rodado (não um arquivo que só cita o comando) ou ferramenta do conector do Cérebro
    if (/^(Bash|PowerShell)$/.test(n) && GRAVOU.test(String(inp.command || ''))) { gravou = true; continue; }
    if (/cerebro/i.test(n) && /(aprender|salvar|gravar|renomear|feito)/i.test(n)) { gravou = true; continue; }
    if (/^(Edit|Write|NotebookEdit)$/.test(n)) {
      const p = inp.file_path || inp.notebook_path || '';
      if (PASTA_ESTUDIO.test(p) && !FORA.test(p)) mudou = mudou || ('arquivo ' + p);
      else if (ehEstudio && MEMORIA.test(p)) mudou = mudou || ('memória deste computador (' + p + '): o que importa vai também para o Cérebro, para valer em todo computador');
    } else if (/javascript_tool$/.test(n)) {
      if (/\.salvar\s*\(|Nuvem\w*\.(salvar|gravar|enviar)|NuvemAnim\.|Vetor\.gravar|App\.salvar/i.test(inp.text || '')) mudou = mudou || 'projeto do Estúdio salvo pelo navegador';
    } else if (/^(Bash|PowerShell)$/.test(n)) {
      const cmd = inp.command || '';
      if (/git\s+(commit|push)|wrangler\s+(deploy|publish)/i.test(cmd) && PASTA_ESTUDIO.test(cmd + ' ' + (j.cwd || ''))) mudou = mudou || 'commit ou publicação do Estúdio';
      if (/127\.0\.0\.1:8810\/render/.test(cmd)) mudou = mudou || 'render do Blender do Estúdio';
    } else if (ehEstudio && /(send_message|SendMessage|start_session|hand_off_to_session)$/.test(n)) {
      mudou = mudou || 'ordem ou decisão passada para outra sessão ou agente';
    }
  }
}

let motivo = mudou;
if (!motivo && ehEstudio && !avisoAutomatico && CORRECAO.test(txtPedido)) motivo = 'correção, pedido ou decisão da dona ou da equipe nesta mensagem';

if (motivo && !gravou) {
  console.log(JSON.stringify({
    decision: 'block',
    reason: 'Regra da dona (Cérebro, Regras/Toda correção da dona ou do Luigi vai para o Cérebro na hora): esta resposta teve ' + motivo + ' e não gravou no Cérebro. O Cérebro é o auxiliar da IA: tudo que mudou, foi decidido, aprovado ou corrigido entra lá, para ninguém precisar explicar de novo. Antes de terminar, grave agora com node ~/.claude/cerebro.mjs aprender aprendizado|evitar|regra "<assunto>" --texto "<o que estava errado ou foi decidido, o que foi feito, a regra para não repetir>" --resumo "<até 160 letras>" --ia "<sua IA>" --pedido "<quem pediu>" --motivo "<por quê>". Se já existe página sobre isso, atualize-a (salvar) em vez de criar outra. Se a mesma coisa já está gravada exatamente assim, diga numa linha em qual página está. Não precisa perguntar a ninguém: é automático. Depois diga numa linha qual página gravou.'
  }));
}
process.exit(0);
`; // gancho Stop da dona (16/11/2026): se a IA mudou algo do Estúdio e não gravou no Cérebro, ela volta e grava. Nunca prende em laço (stop_hook_active).
const GANCHO_CONSULTA = String.raw`#!/usr/bin/env node
// Gancho UserPromptSubmit do Estúdio Problems (pedido da dona, 23/11/2026):
// "era pra ele ser consultado sozinho, sem chamar, sem citar".
// A cada mensagem sobre o Estúdio:
//  1. descobre a área (animação, áudio, arte, roteiro/Short) e, na 1ª vez da conversa
//     (ou depois de 90 min), põe no contexto a página "Regras de ouro" daquela área inteira;
//  2. sempre busca no Cérebro com as palavras do pedido e põe os trechos achados.
// Falha em silêncio (sem internet, sem ligação): nunca trava a conversa.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

let ent = {};
try { ent = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const prompt = String(ent.prompt || '');
if (prompt.length < 8) process.exit(0);
// relatório de agente, aviso de tarefa ou evento do app: não é pedido da pessoa
if (/<agent-message|<task-notification|<side-sessions-event|<ci-monitor-event|Another Claude session sent a message/.test(prompt.slice(0, 400))) process.exit(0);

const AREAS = {
  animacao: { re: /anima|animad|ateli|rive|\brig\b|pose|personag|cachecol|capa|pupila|olho|piscar|boca|m[ãa]o|polegar|bra[çc]o|perna|zoom|c[âa]mera|movimen|fluid|duro|dura\b|lumi|clara|melzinha|stick|(?<!est[uú]dio )problems|walt|cena/i,
    pag: 'Regras/Regras de ouro - animação e personagens' },
  audio: { re: /[áa]udio|voz|vozes|fala|dubla|cort|m[úu]sica|som|efeito sonoro|sfx|volume|legenda|export|mp4|render|blender/i,
    pag: 'Regras/Regras de ouro - áudio, cortes e exportação' },
  arte: { re: /arte|desenh|cen[áa]rio|fundo|gpt|imagem|ilustra|thumb|cara de ia|parece ia|svg|estilo|pintur|luz/i,
    pag: 'Regras/Regras de ouro - arte, desenho e cenários' },
  fluxo: { re: /roteir|short|preparativ|publica[çc]|epis[óo]dio|\bep\d|piada|humor|agend|torajo|batatinha|v[íi]deo/i,
    pag: 'Regras/Regras de ouro - roteiro, Short e como trabalhar' },
  // design, menu e site (23/11/2026): antes um pedido do menu caía em 'animação' (por causa de 'Estúdio Problems' e 'animação de fechar')
  design: { re: /menu|design|bot[ãa]o|painel|pain[ée]is|pop.?up|cabe[çc]alho|header|[íi]cone|selo|vers[ãa]o|adm|layout|carregamento|loading|papel de parede|tela d[eo]|fechar|janela|tema (claro|escuro)/i,
    pag: 'Regras/Regras de ouro - design, menu e site' },
};
const ESTUDIO = /est[uú]dio|c[ée]rebro|celest/i;
// área por PONTOS (quantas palavras do pedido casam), a mais forte primeiro
const pontos = (re) => (prompt.match(new RegExp(re.source, 'gi')) || []).length;
const achadas = Object.entries(AREAS).map(([k, a]) => [k, pontos(a.re)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([k]) => k);
if (!achadas.length && !ESTUDIO.test(prompt)) process.exit(0);

const cerebro = join(homedir(), '.claude', 'cerebro.mjs');
const roda = (args) => new Promise((ok) => {
  execFile(process.execPath, [cerebro, ...args], { timeout: 9000, windowsHide: true, maxBuffer: 4 << 20 },
    (err, out) => ok(err ? '' : String(out || '')));
});

// quais páginas de área já foram postas nesta conversa (por 90 min)
const pastaMarca = join(tmpdir(), 'cerebro-consulta');
const marcaF = join(pastaMarca, String(ent.session_id || 'sem-sessao').replace(/[^\w-]/g, '') + '.json');
let marca = {};
try { marca = JSON.parse(readFileSync(marcaF, 'utf8')); } catch {}
const agora = Date.now();
// LIMITE (23/11): o Claude Code guarda num arquivo à parte (e a IA NÃO VÊ) saída de gancho grande (37 mil letras caíram assim),
// e as páginas têm 10–15 mil letras. Então entram as SEÇÕES ("## ...") das páginas das áreas do pedido que mais têm a ver com ele,
// até ~5800 letras; seção que já entrou nesta conversa (90 min) não repete. As áreas que sobraram vão só pelo nome.
const LIM = 8000, ORC = 5800, fresco = (ch) => marca[ch] && agora - marca[ch] < 90 * 60 * 1000;
const areasPed = achadas.length ? achadas : ['fluxo'];
if (!areasPed.includes('fluxo')) areasPed.push('fluxo'); // "como trabalhar" vale sempre
const novas = areasPed;

const PARA = new Set('a o e é de do da dos das em no na nos nas um uma uns umas que se pra para por com sem mas mais muito muita tudo todo toda isso isto esse essa este esta ele ela eles elas eu vc você voce me te nos já ja não nao sim tem ter ta tá está esta estão foi ser era vai fazer faz fica ficar como quando onde porque pq qual quais aqui ali lá la só so também tambem ou ao aos às as os sua seu suas seus minha meu dele dela agora ainda depois antes coisa coisas hora vez cara gente bem mal certo precisa preciso quero pode'.split(' '));
const palavras = [...new Set(prompt.toLowerCase().match(/[\p{L}\d]{4,}/gu) || [])].filter((p) => !PARA.has(p));
const q1 = palavras.slice(0, 8).join(' ');
const q2 = [...palavras].sort((a, b) => b.length - a.length).slice(0, 4).join(' ');

const [paginas, r1, r2] = await Promise.all([
  Promise.all(novas.map((k) => roda(['ler', AREAS[k].pag]))),
  q1 ? roda(['buscar', q1]) : '',
  q2 && q2 !== q1 ? roda(['buscar', q2]) : '',
]);

// seções candidatas, com pontos: palavras do pedido (pelo começo da palavra) + área mais forte + "Antes de entregar"/"Como trabalhar"
const raiz = palavras.map((p) => p.normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 5));
const cand = [];
novas.forEach((k, i) => {
  const t = paginas[i].replace(/^# .*\n(?:.*\n){0,3}?\n/, '').trim(); if (!t) return;
  t.split(/\n(?=## )/).forEach((sec, ordem) => {
    const head = (sec.match(/^## (.*)/) || [, '(início)'])[1].trim(), ch = k + '#' + head; if (fresco(ch)) return;
    const low = sec.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    let pts = raiz.reduce((s, r) => s + (r.length >= 4 && low.includes(r) ? 1 : 0), 0) + (achadas.length - achadas.indexOf(k)) * 0.5;
    if (/antes de entregar|como trabalhar/i.test(head)) pts += 1.5; // grandes: com peso alto tiravam o lugar das seções do assunto
    if (/contradi|d[úu]vida/i.test(head)) pts -= 3;
    if (ordem === 0 && !/^## /.test(sec)) pts -= 2; // a linha de abertura da página
    cand.push({ k, ordem, head, ch, sec: sec.trim(), pts });
  });
});
let usado = 0; const vai = [];
for (const c of [...cand].sort((a, b) => b.pts - a.pts)) { if (c.pts <= 0.5) break; if (usado + c.sec.length > ORC) continue; vai.push(c); usado += c.sec.length; }
const blocos = [];
for (const k of novas) { const L = vai.filter((c) => c.k === k).sort((a, b) => a.ordem - b.ordem); if (!L.length) continue;
  blocos.push('=== ' + AREAS[k].pag + ' (só as seções deste pedido; a página inteira: mcp__cerebro__ler) ===\n' + L.map((c) => c.sec).join('\n')); L.forEach((c) => { marca[c.ch] = agora; }); }
const depois = novas.filter((k) => !vai.some((c) => c.k === k) && !cand.every((c) => c.k !== k)).map((k) => AREAS[k].pag);
try { mkdirSync(pastaMarca, { recursive: true }); writeFileSync(marcaF, JSON.stringify(marca)); } catch {}

const visto = new Set(Object.values(AREAS).map((a) => a.pag));
const trechos = [];
for (const l of (r1 + '\n' + r2).split('\n')) {
  if (!l.startsWith('- ') || /Nada encontrado/.test(l)) continue;
  const cam = l.slice(2).split(/ › |: /)[0];
  if (cam.startsWith('Arquivo frio') || cam.startsWith('Ideias à parte') || visto.has(cam)) continue;
  visto.add(cam);
  trechos.push(l.length > 300 ? l.slice(0, 300) + '…' : l);
  if (trechos.length >= 5) break;
}

let out = 'CÉREBRO (consultado sozinho para este pedido; ninguém precisa citar). São decisões da dona: siga sem perguntar de novo. ' +
  'Se duas regras brigam, vale a mais nova. Pose, rig ou animação: confira com o walt-disney antes de dizer pronto. ' +
  'Erro novo que a dona apontar: atualize a página "Regras de ouro" da área (não crie página solta).';
out += ' Sempre: faça só o pedido; prove no projeto real com print; sem render longo nem MP4 sem ordem dela; grave no Cérebro na hora.';
if (depois.length) out += '\nTambém valem para este pedido (leia com mcp__cerebro__ler antes de mexer): ' + depois.join(' · ') + '.';
if (blocos.length) out += '\n\n' + blocos.join('\n\n');
else if (achadas.length) out += '\n(As seções das Regras de ouro que servem a este pedido já estão nesta conversa; continuam valendo.)';
if (trechos.length) out += '\n\nTrechos achados no Cérebro para este pedido:\n' + trechos.join('\n');
process.stdout.write((out.length > LIM ? out.slice(0, LIM) + '\n…' : out) + '\n');
process.exit(0);
`; // gancho UserPromptSubmit da dona (23/11/2026): a cada pedido do Estúdio consulta o Cérebro sozinho e põe as Regras de ouro da área no contexto.
function poeGancho() { const f = join(CL(), 'settings.json'); let s = {}, msg = [], mudou = false; const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
  if (existsSync(f)) { try { s = JSON.parse(readFileSync(f, 'utf8')); } catch { return 'settings.json com erro de formato: NÃO mexi. Conserte e rode de novo.'; } }
  s.hooks = s.hooks || {}; s.hooks.SessionStart = s.hooks.SessionStart || []; s.hooks.Stop = s.hooks.Stop || []; const tem = (a, t) => JSON.stringify(a).includes(t);
  if (!tem(s.hooks.SessionStart, 'cerebro.mjs aviso')) { s.hooks.SessionStart.push({ hooks: [{ type: 'command', command: 'node ' + join(CL(), 'cerebro.mjs').replace(/\\/g, '/') + ' aviso', timeout: 60, statusMessage: 'Abrindo o Cérebro' }] }); mudou = true; msg.push('gancho do começo da sessão adicionado'); }
  else { let subiu = false; for (const e of s.hooks.SessionStart) for (const h of e.hooks || []) if (String(h.command || '').includes('cerebro.mjs aviso') && !(h.timeout >= 60)) { h.timeout = 60; subiu = true; } if (subiu) { mudou = true; msg.push('gancho do começo da sessão: tempo máximo subiu para 60 s (a renovação da ligação precisa)'); } else msg.push('o gancho do começo da sessão já estava'); }
  const sf = join(CL(), 'hooks', 'cerebro-gravou.mjs'), atual = existsSync(sf) ? readFileSync(sf, 'utf8').replace(/\r\n/g, '\n') : null;
  if (atual !== GANCHO_STOP) { mkdirSync(dirname(sf), { recursive: true }); if (atual !== null) copyFileSync(sf, existsSync(sf + '.antes') ? sf + '.antes-' + carimbo : sf + '.antes'); writeFileSync(sf, GANCHO_STOP); msg.push(atual === null ? 'script do gancho Stop gravado' : 'script do gancho Stop atualizado (o anterior ficou guardado ao lado)'); }
  if (!tem(s.hooks.Stop, 'cerebro-gravou.mjs')) { s.hooks.Stop.push({ hooks: [{ type: 'command', command: 'node ' + sf.replace(/\\/g, '/'), timeout: 20, statusMessage: 'Conferindo se gravou no Cérebro' }] }); mudou = true; msg.push('gancho Stop adicionado'); } else msg.push('o gancho Stop já estava');
  s.hooks.UserPromptSubmit = s.hooks.UserPromptSubmit || []; const cf = join(CL(), 'hooks', 'cerebro-consulta.mjs'), catual = existsSync(cf) ? readFileSync(cf, 'utf8').replace(/\r\n/g, '\n') : null;
  if (catual !== GANCHO_CONSULTA) { mkdirSync(dirname(cf), { recursive: true }); if (catual !== null) copyFileSync(cf, existsSync(cf + '.antes') ? cf + '.antes-' + carimbo : cf + '.antes'); writeFileSync(cf, GANCHO_CONSULTA); msg.push(catual === null ? 'script do gancho de consulta gravado' : 'script do gancho de consulta atualizado (o anterior ficou guardado ao lado)'); }
  if (!tem(s.hooks.UserPromptSubmit, 'cerebro-consulta.mjs')) { s.hooks.UserPromptSubmit.push({ hooks: [{ type: 'command', command: 'node ' + cf.replace(/\\/g, '/'), timeout: 15, statusMessage: 'Consultando o Cérebro' }] }); mudou = true; msg.push('gancho de consulta a cada pedido adicionado'); } else msg.push('o gancho de consulta já estava');
  if (mudou) { if (existsSync(f)) copyFileSync(f, existsSync(f + '.antes-do-cerebro') ? f + '.antes-do-cerebro-' + carimbo : f + '.antes-do-cerebro'); const t = f + '.tmp-' + process.pid; writeFileSync(t, JSON.stringify(s, null, 2)); renameSync(t, f); } // arquivo novo ao lado e troca de nome; a primeira cópia nunca é sobrescrita
  return msg.join('; ') + (mudou ? ' (o resto do settings.json foi mantido; cópia de segurança ao lado, settings.json.antes-do-cerebro).' : '.'); }
// cadastra o conector no Claude Code (opcional: este programa já lê e grava pelo login do Google; o conector dá as ferramentas nas conversas novas)
function ligaConector() { if (process.env.CEREBRO_SEM_CONECTOR === '1') return 'conector: pulado (CEREBRO_SEM_CONECTOR=1).'; const w = process.platform === 'win32', op2 = { encoding: 'utf8', timeout: 25000, stdio: ['ignore', 'pipe', 'pipe'], cwd: homedir() }, roda = a => w ? spawnSync('claude ' + a.join(' '), { ...op2, shell: true }) : spawnSync('claude', a, op2); // no Windows o claude pode ser um .cmd: uma linha só (as partes são constantes e o SERVIDOR já foi validado), sem o aviso do Node // cwd = a pasta do usuário: nunca roda um claude.cmd de dentro de um projeto baixado
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
