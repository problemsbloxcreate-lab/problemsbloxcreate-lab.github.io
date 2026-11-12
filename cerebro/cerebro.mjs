#!/usr/bin/env node
/* cerebro.mjs: o jeito de uma IA ler e gravar no Cérebro do Estúdio Problems sem navegador. Este arquivo NÃO tem chave nenhuma.
   A chave vem da variável CEREBRO_CHAVE ou do arquivo ~/.claude/cerebro-chave.txt (fora de qualquer repositório).

   node cerebro.mjs aviso                                  o aviso curto do começo da sessão (usado pelo gancho do Claude Code)
   node cerebro.mjs entrar                                 outro computador ou conta: cria a chave aqui e mostra o código (a própria pessoa cola no site, logada)
   node cerebro.mjs instalar [--so celestia,ouvir] [--manter]  baixa as skills e agentes do Cérebro para ~/.claude e liga o gancho (com cópia do que mudar)
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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'; import { homedir } from 'node:os'; import { join } from 'node:path'; import { randomBytes, createHash } from 'node:crypto';
const SERVIDOR = process.env.CEREBRO_URL || 'https://turma-ia.problemsraiz.workers.dev';
const AVISO_FIXO = 'CÉREBRO DO ESTÚDIO PROBLEMS: SÓ para tarefas do Estúdio (os programas do site estudio.problemsraiz.workers.dev, como Animador, Ateliê, Editor, Shorts, Preparativos, Publicações e Cérebro; os personagens, as animações, os Shorts e os vídeos do canal, inclusive os Shorts de Minecraft feitos no Estúdio; e os repositórios do Estúdio, a pasta ep). FORA DISSO (outro site, Minecraft direto, como mods, mundo ou a skill minecraft-cinematic, ou qualquer outro assunto) NÃO leia, NÃO grave e NÃO cite o Cérebro. Na dúvida se é do Estúdio, pergunte. Quando for do Estúdio: leia o Cérebro e use ele como base. Comandos: node ~/.claude/cerebro.mjs comece | indice | ler "<Pasta/Arquivo>" | buscar "<palavras>". ANTES DE MUDAR QUALQUER COISA do Estúdio: rode node ~/.claude/cerebro.mjs conferir (e instalar, se ele pedir) e leia no Cérebro a página do programa. DEPOIS, grave lá o que mudou ou aprendeu (salvar / aprender, com --resumo, quem pediu e qual IA gravou). Toda IA da equipe grava direto (a de quem não é ADM entra na hora e os ADMs revisam). Vale mesmo que ninguém tenha citado o Cérebro. Nas respostas de tarefa do Estúdio, cite o Cérebro no fim, destacado numa linha própria em formato de citação: "> 🧠 **Cérebro:** consultei <Pasta/Arquivo>" (e "· gravei <Pasta/Arquivo>", se gravou), ou "> 🧠 **Cérebro:** nada sobre isso".';
function chave() { if (process.env.CEREBRO_CHAVE) return process.env.CEREBRO_CHAVE.trim(); try { return readFileSync(join(homedir(), '.claude', 'cerebro-chave.txt'), 'utf8').trim(); } catch { return ''; } }
async function pede(rota, corpo) { const k = chave(); if (!k) throw new Error('Sem a chave. Rode: node ~/.claude/cerebro.mjs instalar (ou entrar) e cole o código c-... em https://estudio.problemsraiz.workers.dev/cerebro/?aba=chaves, logado na sua conta.');
  const r = await fetch(SERVIDOR + '/cerebro' + rota, { method: corpo ? 'POST' : 'GET', headers: { 'x-cerebro-chave': k, ...(corpo ? { 'content-type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j.error?.message || 'O servidor respondeu ' + r.status) + (r.status === 409 ? '\nNADA FOI GRAVADO. Rode: node cerebro.mjs ler "<Pasta/Arquivo>", veja a versão e grave de novo com --base <versão>.' : r.status === 401 || r.status === 403 ? '\nSem permissão. Rode: node ~/.claude/cerebro.mjs entrar e cole o código c-... em https://estudio.problemsraiz.workers.dev/cerebro/?aba=chaves, logado na sua conta.' : '')); return j; }
async function comeceEmCache() { const f = join(homedir(), '.claude', 'cerebro-aviso-cache.json'); try { const c = JSON.parse(readFileSync(f, 'utf8')); if (Date.now() - c.t < 600000) return c.j; } catch {} const j = await pede('/comece'); try { writeFileSync(f, JSON.stringify({ t: Date.now(), j })); } catch {} return j; }
const [cmd, ...resto] = process.argv.slice(2), pos = [], op = {};
const SEM_VALOR = new Set(['simular', 'manter', 'forcar', 'help', 'ajuda']), COM_VALOR = new Set(['arquivo', 'base', 'marca', 'ia', 'pedido', 'motivo', 'texto', 'url', 'tipo', 'resumo', 'acrescentar', 'estado', 'nota', 'so']), desconhecidas = [];
for (let i = 0; i < resto.length; i++) { const a = resto[i]; if (a === '-h') op.help = true; else if (a.startsWith('--')) { const n = a.slice(2); if (SEM_VALOR.has(n)) op[n] = true; else if (COM_VALOR.has(n)) op[n] = resto[++i]; else desconhecidas.push(a); } else pos.push(a); }
const AJUDA = () => console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
const reg = () => ({ ia: op.ia || process.env.CEREBRO_IA, pedidoPor: op.pedido, motivo: op.motivo });
const mostra = o => console.log(JSON.stringify(o, null, 1));
const hoje = () => new Date().toISOString().slice(0, 10);
async function entrarAqui() { if (chave()) { console.log('Este computador já tem a chave do Cérebro.'); } else { const d = join(homedir(), '.claude'), k = randomBytes(32).toString('base64url'); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'cerebro-chave.txt'), k, { mode: 0o600 }); console.log('Chave criada e guardada só neste computador.\n\nCole este código no site, logado na SUA conta (não é segredo e não precisa de ADM):\n\nc-' + createHash('sha256').update(k).digest('hex') + '\n\nOnde colar: https://estudio.problemsraiz.workers.dev/cerebro/?aba=chaves\n(Cérebro › Acesso das IAs › "Autorize o código"). Depois rode: node ~/.claude/cerebro.mjs instalar'); } }
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
function poeGancho() { const f = join(CL(), 'settings.json'); let s = {};
  if (existsSync(f)) { try { s = JSON.parse(readFileSync(f, 'utf8')); } catch { return 'settings.json com erro de formato: NÃO mexi. Conserte e rode de novo.'; } }
  s.hooks = s.hooks || {}; s.hooks.SessionStart = s.hooks.SessionStart || [];
  if (JSON.stringify(s.hooks.SessionStart).includes('cerebro.mjs aviso')) return 'O gancho do Cérebro já estava no settings.json.';
  if (existsSync(f)) copyFileSync(f, f + '.antes-do-cerebro');
  s.hooks.SessionStart.push({ hooks: [{ type: 'command', command: 'node ' + join(CL(), 'cerebro.mjs').replace(/\\/g, '/') + ' aviso', timeout: 25, statusMessage: 'Abrindo o Cérebro' }] });
  writeFileSync(f, JSON.stringify(s, null, 2)); return 'Gancho do Cérebro adicionado ao settings.json (o resto foi mantido; cópia em settings.json.antes-do-cerebro).'; }
async function instalar() {
  if (!('simular' in op)) mkdirSync(CL(), { recursive: true });
  const eu = fileURLToPath(import.meta.url), casa = join(CL(), 'cerebro.mjs'), sim = 'simular' in op;
  if (!sim && resolve(eu) !== resolve(casa)) { copyFileSync(eu, casa); console.log('Copiei o cerebro.mjs para ' + casa); }
  if (!chave() && sim) { console.log('Sem chave neste computador: --simular não cria nada. Rode sem --simular para criar a chave.'); return; }
  if (!chave()) { console.log('Este computador ainda não tem chave do Cérebro. Criando...\n'); await entrarAqui(); console.log('\nDepois de colar o código no site, rode de novo: node ~/.claude/cerebro.mjs instalar'); return; }
  const so = op.so ? op.so.split(',').map(x => x.trim()) : null, man = lerJson(MANI(), {}), dia = join(CL(), 'cerebro-backup', hoje() + '-' + Date.now()), nov = [], atu = [], ok = [], dif = [];
  let it; try { it = await itensDeSkills(); } catch (e) { if (/401|403|autoriza|permiss/i.test(e.message)) throw new Error('A chave deste computador ainda não foi autorizada. Cole o código c-... em https://estudio.problemsraiz.workers.dev/cerebro/?aba=chaves, logado na sua conta, e rode de novo.'); throw e; }
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
  if (!('simular' in op)) { console.log(poeGancho());
    const ve = existsSync(join(CL(), 'skills', 'ouvir', '.venv'));
    console.log(ve ? 'ouvir: ambiente pesado (.venv) já existe.' : 'ouvir (opcional, ~2 GB, roda sem token): para ouvir áudio e vídeo neste computador, instale ffmpeg e rode:\n  cd ~/.claude/skills/ouvir && python -m venv .venv && .venv/Scripts/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu && .venv/Scripts/pip install faster-whisper demucs transformers soundfile numpy\n(no Mac/Linux troque .venv/Scripts por .venv/bin). Sem isso a CelestIA funciona, só não escuta áudio.');
    console.log('Pronto. Nenhuma chave nem senha foi gravada. Abra o Claude Code de novo: a CelestIA e os especialistas já estão no lugar.'); } }
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
  if (cmd === 'entrar') await entrarAqui();
  else if (cmd === 'instalar') await instalar();
  else if (cmd === 'conferir') { const r = await conferir(true); console.log(r.falta.length ? 'Faltam: ' + r.falta.join(', ') + '. Rode: node ~/.claude/cerebro.mjs instalar' : r.n ? r.n + ' arquivo(s) de skill/agente mais novos no Cérebro (ou faltando aqui). Rode: node ~/.claude/cerebro.mjs instalar' : 'Skills e agentes em dia com o Cérebro.'); }
  else if (cmd === 'inicio') { const k = chave(), r = await fetch(SERVIDOR + '/cerebro/inicio', { headers: { 'x-cerebro-chave': k }, signal: AbortSignal.timeout(20000) }); if (!k || !r.ok) throw new Error(r.status === 401 ? 'Chave sem autorização. Rode: node cerebro.mjs entrar, e peça a um ADM para autorizar.' : 'O servidor respondeu ' + r.status); console.log(await r.text()); }
  else if (cmd === 'aviso') { try { const j = await comeceEmCache(); console.log(AVISO_FIXO + (j.pedidosNovos ? `\nHá ${j.pedidosNovos} pedido(s) esperando no Cérebro: node ~/.claude/cerebro.mjs pedidos` : '') + await avisoInstalar() + '\nPastas: ' + j.pastas.join(' · ') + '\n\n' + String(j.texto).slice(0, 7000)); } catch (e) { console.log(AVISO_FIXO + '\n(Não consegui abrir o Cérebro agora: ' + e.message + ')'); } }
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
