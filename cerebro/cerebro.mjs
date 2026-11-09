#!/usr/bin/env node
/* cerebro.mjs: o jeito de uma IA ler e gravar no Cérebro do Estúdio Problems sem navegador. Este arquivo NÃO tem chave nenhuma.
   A chave vem da variável CEREBRO_CHAVE ou do arquivo ~/.claude/cerebro-chave.txt (fora de qualquer repositório).

   node cerebro.mjs aviso                                  o aviso curto do começo da sessão (usado pelo gancho do Claude Code)
   node cerebro.mjs entrar                                 outro computador ou conta: cria a chave aqui e mostra o código para um ADM autorizar
   node cerebro.mjs inicio                                 o que a IA lê primeiro: o guia e o índice de tudo
   node cerebro.mjs comece | indice | pedidos              o guia, a árvore toda, os pedidos que estão esperando
   node cerebro.mjs ler "<Pasta/Arquivo>"                  mostra o arquivo com a versão
   node cerebro.mjs buscar "<palavras>"
   node cerebro.mjs salvar "<Pasta/Arquivo>" --arquivo x.md --base 3 --marca regra --ia "Claude Opus 5.5" --pedido "Fulana" --motivo "..."
   node cerebro.mjs aprender evitar|aprendizado|referencia|regra "<assunto>" --texto "..." [--url https://...] --ia "..." --pedido "..." --motivo "..."
   node cerebro.mjs feito <id do pedido> --nota "..."
*/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'; import { homedir } from 'node:os'; import { join } from 'node:path'; import { randomBytes, createHash } from 'node:crypto';
const SERVIDOR = process.env.CEREBRO_URL || 'https://turma-ia.problemsraiz.workers.dev';
const AVISO_FIXO = 'ANTES DE TUDO: leia o Cérebro do Estúdio Problems (memória compartilhada da equipe e das IAs) e use ele como base. Comandos: node ~/.claude/cerebro.mjs comece | indice | ler "<Pasta/Arquivo>" | buscar "<palavras>". Depois de aprender ou mudar algo, grave lá (salvar / aprender), com quem pediu e qual IA gravou. Vale mesmo que ninguém tenha citado o Cérebro.';
function chave() { if (process.env.CEREBRO_CHAVE) return process.env.CEREBRO_CHAVE.trim(); try { return readFileSync(join(homedir(), '.claude', 'cerebro-chave.txt'), 'utf8').trim(); } catch { return ''; } }
async function pede(rota, corpo) { const k = chave(); if (!k) throw new Error('Sem a chave. Rode: node cerebro.mjs entrar. Depois passe o código para um ADM autorizar em Cérebro > Acesso das IAs.');
  const r = await fetch(SERVIDOR + '/cerebro' + rota, { method: corpo ? 'POST' : 'GET', headers: { 'x-cerebro-chave': k, ...(corpo ? { 'content-type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error?.message || 'O servidor respondeu ' + r.status); return j; }
const [cmd, ...resto] = process.argv.slice(2), pos = [], op = {};
for (let i = 0; i < resto.length; i++) { if (resto[i].startsWith('--')) op[resto[i].slice(2)] = resto[++i]; else pos.push(resto[i]); }
const reg = () => ({ ia: op.ia || process.env.CEREBRO_IA, pedidoPor: op.pedido, motivo: op.motivo });
const mostra = o => console.log(JSON.stringify(o, null, 1));
const hoje = () => new Date().toISOString().slice(0, 10);
const PASTAS = { evitar: 'A evitar', aprendizado: 'Aprendizados', referencia: 'Referências', regra: 'Regras' };
try {
  if (cmd === 'entrar') { if (chave()) { console.log('Este computador já tem a chave do Cérebro.'); } else { const d = join(homedir(), '.claude'), k = randomBytes(32).toString('base64url'); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'cerebro-chave.txt'), k, { mode: 0o600 }); console.log('Chave criada e guardada só neste computador.\n\nPasse este código para um ADM (não é segredo):\n\nc-' + createHash('sha256').update(k).digest('hex') + '\n\nO ADM autoriza em https://estudio.problemsraiz.workers.dev/cerebro/?aba=chaves'); } }
  else if (cmd === 'inicio') { const k = chave(), r = await fetch(SERVIDOR + '/cerebro/inicio', { headers: { 'x-cerebro-chave': k }, signal: AbortSignal.timeout(20000) }); if (!k || !r.ok) throw new Error(r.status === 401 ? 'Chave sem autorização. Rode: node cerebro.mjs entrar, e peça a um ADM para autorizar.' : 'O servidor respondeu ' + r.status); console.log(await r.text()); }
  else if (cmd === 'aviso') { try { const j = await pede('/comece'); console.log(AVISO_FIXO + (j.pedidosNovos ? `\nHá ${j.pedidosNovos} pedido(s) esperando no Cérebro: node ~/.claude/cerebro.mjs pedidos` : '') + '\nPastas: ' + j.pastas.join(' · ') + '\n\n' + String(j.texto).slice(0, 7000)); } catch (e) { console.log(AVISO_FIXO + '\n(Não consegui abrir o Cérebro agora: ' + e.message + ')'); } }
  else if (cmd === 'comece') console.log((await pede('/comece')).texto);
  else if (cmd === 'indice') { const { itens } = await pede('/'), f = p => itens.filter(x => (x.pai || null) === p).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })); const v = (p, d) => { for (const x of f(p)) { console.log('  '.repeat(d) + (x.tipo === 'pasta' ? '[' + x.nome + ']' : x.nome + (x.marca ? ' (' + x.marca + ')' : '')) + (x.resumo ? ' - ' + x.resumo : '')); if (x.tipo === 'pasta') v(x.id, d + 1); } }; v(null, 0); }
  else if (cmd === 'ler') { const { item: x, versoes } = await pede('/item?caminho=' + encodeURIComponent(pos[0])); console.log(`# ${x.nome} (versão ${x.ver}, tipo ${x.tipo}${x.marca ? ', marca ' + x.marca : ''})${x.url ? '\nLink: ' + x.url : ''}${x.img ? '\nImagem: ' + x.img : ''}\nÚltima mudança: ${x.por}${x.pedido ? ', a pedido de ' + x.pedido : ''}, ${versoes.length} versão(ões) no histórico\n\n${x.corpo || ''}`); }
  else if (cmd === 'buscar') for (const x of (await pede('/buscar?q=' + encodeURIComponent(pos.join(' ')))).itens) console.log(`- ${x.nome} [${x.id}]: ${String(x.trecho || x.resumo || '').replace(/\s+/g, ' ')}`);
  else if (cmd === 'pedidos') for (const x of (await pede('/pedidos?estado=novo')).itens) console.log(`- ${x.id} (${x.tipo}) de ${x.por}${x.alvo ? ', sobre ' + x.alvo : ''}: ${x.texto}`);
  else if (cmd === 'salvar') mostra(await pede('/salvar', { caminho: pos[0], tipo: op.tipo || 'texto', corpo: op.arquivo ? readFileSync(op.arquivo, 'utf8') : op.texto, ...(op.acrescentar ? { acrescentar: op.acrescentar } : {}), ...(op.base ? { base: +op.base } : {}), ...(op.marca ? { marca: op.marca } : {}), ...(op.resumo ? { resumo: op.resumo } : {}), ...(op.url ? { url: op.url } : {}), ...reg() }));
  else if (cmd === 'aprender') { const t = pos[0]; if (!PASTAS[t]) throw new Error('Use: evitar, aprendizado, referencia ou regra.'); mostra(await pede('/salvar', { caminho: `${PASTAS[t]}/${hoje()} ${pos[1]}`, tipo: t === 'referencia' ? 'referencia' : 'texto', marca: t, corpo: op.arquivo ? readFileSync(op.arquivo, 'utf8') : op.texto, ...(op.url ? { url: op.url } : {}), ...reg() })); }
  else if (cmd === 'feito') mostra(await pede('/pedido', { id: pos[0], estado: op.estado || 'feito', nota: op.nota, ...reg() }));
  else console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0]);
} catch (e) { console.error(e.message); process.exit(1); }
