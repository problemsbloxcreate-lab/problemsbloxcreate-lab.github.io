/* SERVIDOR LOCAL DE TESTE do conector: roda o worker.js de verdade num endereço do seu computador (http://localhost:8787), com o banco em memória,
   o Cérebro com algumas páginas de exemplo e logins do Google FALSOS. Serve também a tela de permissão (cerebro/conectar.html) e um login de teste.
   Nada daqui toca na produção: não existe rede, nem chave de verdade.
     node teste/servidor-local.mjs [porta]
   Login de teste na tela de permissão: http://localhost:8787/?quem=maria   (maria = não ADM, dona = ADM, joao = não ADM) */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { novoAmbiente, loginDe, ctx, PESSOAS } from './ambiente.mjs';
import worker from '../worker.js';

const PORTA = +process.argv[2] || 8787, RAIZ = fileURLToPath(new URL('../../../', import.meta.url)); // a raiz do repositório do site
const env = novoAmbiente({ CONECTAR_URL: `http://localhost:${PORTA}/cerebro/conectar.html`, ORIGENS: `http://localhost:${PORTA}`, CONECTOR_REGISTROS_POR_MIN: '1000' });

// o Cérebro de exemplo (pela chave principal de teste, como as IAs fazem)
const grava = (caminho, corpo, resumo, marca) => worker.fetch(new Request(`http://localhost:${PORTA}/cerebro/salvar`, { method: 'POST', headers: { 'x-cerebro-chave': env.CEREBRO_CHAVE, 'content-type': 'application/json' }, body: JSON.stringify({ caminho, corpo, resumo, marca, ia: 'seed', pedidoPor: 'seed', motivo: 'página de exemplo do servidor local' }) }), env, ctx);
await grava('00 Comece aqui/Leia primeiro', '# Leia primeiro\n\nO Cérebro é a memória do Estúdio Problems (texto de exemplo do servidor local).', 'Guia inicial.', 'guia');
await grava('Programas/Animador', '# Animador\n\nFaz as animações da equipe. Exportar legendas em SRT fica na janela Exportar.', 'Fazer as animações da equipe.', 'guia');
await grava('Regras/Regras da dona', '# Regras da dona\n\nNunca grave senhas. Cite o Cérebro no fim das respostas.', 'Como falar, segredos e gastos.', 'regra');

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json' };
const LOGIN_FALSO = `/* LOGIN DE TESTE (só do servidor local): no lugar do /estudio-login.js do porteiro. Pega um login do Google FALSO deste servidor. */
(() => { const quem = new URLSearchParams(location.search).get('quem') || sessionStorage.getItem('quem') || 'maria'; sessionStorage.setItem('quem', quem);
  const tok = () => fetch('/_teste/login?quem=' + encodeURIComponent(quem)).then(r => r.text());
  window.EstudioLogin = { pronto: Promise.resolve(quem + '@exemplo.com'), token: tok, perfil: async () => ({ nome: quem[0].toUpperCase() + quem.slice(1) + ' Teste' }), sair: () => { sessionStorage.removeItem('quem'); alert('Sair (teste): troque ?quem= na barra de endereço.'); } }; })();`;

http.createServer(async (rq, rs) => {
  try {
    const url = new URL(rq.url, `http://localhost:${PORTA}`), chunks = []; for await (const c of rq) chunks.push(c); const corpo = Buffer.concat(chunks);
    if (url.pathname === '/_teste/login') { const q = url.searchParams.get('quem'); if (!(q in PESSOAS)) { rs.writeHead(400); return rs.end('quem?'); } rs.writeHead(200, { 'content-type': 'text/plain' }); return rs.end(await loginDe(q)); }
    if (url.pathname === '/estudio-login.js') { rs.writeHead(200, { 'content-type': TIPOS['.js'] }); return rs.end(LOGIN_FALSO); }
    if (/^\/(cerebro\/(conectar\.html|conectar\.js)|estudio-visual\.css|estudio-inter\.woff2|favicon\.svg)$/.test(url.pathname)) { const f = join(RAIZ, normalize(url.pathname).replace(/^[\\/]+/, '')); if (existsSync(f)) { rs.writeHead(200, { 'content-type': TIPOS[extname(f)] || 'application/octet-stream' }); return rs.end(readFileSync(f)); } }
    const r = await worker.fetch(new Request(url, { method: rq.method, headers: rq.headers, body: ['GET', 'HEAD'].includes(rq.method) ? undefined : corpo, redirect: 'manual' }), env, ctx);
    const h = {}; r.headers.forEach((v, k) => { h[k] = v; }); rs.writeHead(r.status, h); rs.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { console.error('erro:', e); rs.writeHead(500); rs.end(String(e?.message || e)); }
}).listen(PORTA, () => console.log(`Servidor local do conector em http://localhost:${PORTA}  (MCP: /cerebro/mcp)  — só teste, banco em memória`));
