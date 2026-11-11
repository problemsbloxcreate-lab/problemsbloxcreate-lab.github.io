/* ===================== estudio-sw.js — o GUARDIÃO dos programas no computador (Celeste 2.0, pedido da dona em 11/11/2026) =====================
   O que faz: os ARQUIVOS DO PROGRAMA (página, scripts, estilos, ícones, fontes) ficam guardados neste computador na primeira vez
   que o programa abre, e das próximas vezes abrem daqui, na hora, sem depender da internet. Atualizar é OPCIONAL: quando sai versão
   nova, o /estudio-conta.js mostra a notificação (Atualizar / Fechar) e só o "Atualizar" apaga a cópia guardada daquele programa.

   NUNCA guarda: dados da nuvem, login, pedidos que não são GET, nada de outro endereço, arquivos .json (dados e versões) e as rotas
   do porteiro (/quem, /sessao, /conta, /versoes...). Só arquivos estáticos pedidos POR UMA PÁGINA DOS PROGRAMAS DO PILOTO.

   PILOTO (teste antes de ligar em todos): só o Preparativos e o Publicações. Para ligar outro programa, ponha o caminho em PILOTO
   aqui e em GUARDA_PROGS no /estudio-conta.js. Para DESLIGAR tudo: esvazie PILOTO (o guardião passa a não fazer nada) e publique.
   Cada programa tem a sua caixa: 'ep-p:/preparativos/'. Mudou ESTE arquivo? Troque VERSAO_SW. */
'use strict';
const VERSAO_SW = 1;
const PILOTO = ['/preparativos/', '/publicacoes/'];
const ESTATICO = /\.(js|mjs|css|woff2?|ttf|svg|png|jpe?g|webp|gif|ico|wasm|mp3|ogg|wav)$/i;
const NUNCA = /^\/(quem|sessao|sair|conta|pessoa|online|versoes|icones|permissoes|nuvem|mensagens|dublar\/api|cerebro-api)(\/|$)/;
const donoDe = p => PILOTO.find(x => p.startsWith(x)) || null;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  // caixas de programas que saíram do piloto: apaga (a cópia guardada não fica esquecida no computador)
  for (const k of await caches.keys()) if (k.startsWith('ep-p:') && !PILOTO.includes(k.slice(5))) await caches.delete(k);
  await self.clients.claim();
})()));

// mensagens das páginas: { apagar: '/preparativos/' } = "Atualizar" (apaga a cópia guardada daquele programa)
self.addEventListener('message', e => { const d = e.data || {};
  if (d.apagar && PILOTO.includes(d.apagar)) e.waitUntil(caches.delete('ep-p:' + d.apagar).then(() => e.source?.postMessage({ apagado: d.apagar })));
  if (d.qual) e.source?.postMessage({ sw: VERSAO_SW, piloto: PILOTO });
  // PRIMEIRA VEZ: a página manda a lista do que ela já usou (abriu antes de o guardião assumir) e o guardião guarda tudo
  if (d.guardar && PILOTO.includes(d.guardar) && Array.isArray(d.urls)) e.waitUntil((async () => {
    const caixa = await caches.open('ep-p:' + d.guardar); let n = 0;
    for (const x of d.urls.slice(0, 200)) { try { const u = new URL(x, location.origin); if (u.origin !== location.origin || NUNCA.test(u.pathname) || /\.json$/i.test(u.pathname)) continue;
      const pag = u.pathname === d.guardar || (u.pathname.startsWith(d.guardar) && u.pathname.endsWith('/'));
      if (!pag && !ESTATICO.test(u.pathname)) continue; const chave = pag ? u.origin + u.pathname : u.href;
      if (await caixa.match(chave)) { n++; continue; }
      const res = await fetch(u.href, { credentials: 'include' }); if (res.ok && res.type === 'basic' && !res.redirected) { await caixa.put(chave, res); n++; } } catch { } }
    e.source?.postMessage({ guardado: d.guardar, n });
  })());
});

let ultimaRenova = 0;
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || !PILOTO.length) return;
  let u; try { u = new URL(r.url); } catch { return; }
  if (u.searchParams.has('epv')) return; // ?epv= = conferência da versão do Estúdio: sempre da internet
  if (u.origin !== location.origin || NUNCA.test(u.pathname) || /\.json$/i.test(u.pathname)) return;
  if (r.mode === 'navigate') {
    const dono = donoDe(u.pathname); if (!dono || !(u.pathname.endsWith('/') || /\.html?$/i.test(u.pathname))) return;
    e.respondWith(daCaixa(dono, r, u.origin + u.pathname, true));
    return;
  }
  if (!ESTATICO.test(u.pathname)) return;
  // arquivo estático: só guarda se quem pediu é uma página de programa do piloto (os outros programas continuam como sempre)
  e.respondWith((async () => {
    let dono = null; try { const c = e.clientId && await self.clients.get(e.clientId); if (c) dono = donoDe(new URL(c.url).pathname); } catch { }
    if (!dono) return fetch(r);
    return daCaixa(dono, r, r.url, false);
  })());
});

async function daCaixa(dono, r, chave, pagina) {
  const caixa = await caches.open('ep-p:' + dono);
  const tem = await caixa.match(chave);
  if (tem) {
    // a página veio daqui: mesmo assim avisa o porteiro de vez em quando (mantém a sessão viva), sem trocar a cópia guardada
    if (pagina && Date.now() - ultimaRenova > 30 * 60e3) { ultimaRenova = Date.now(); fetch(r.url, { credentials: 'include', cache: 'no-store' }).catch(() => { }); }
    return tem;
  }
  const res = await fetch(r);
  // só guarda resposta boa, do próprio endereço, sem redirecionamento (ex.: sem sessão o porteiro manda para o menu: isso não é guardado)
  if (res.ok && res.type === 'basic' && !res.redirected && !(pagina && !(res.headers.get('content-type') || '').includes('text/html'))) {
    try { await caixa.put(chave, res.clone()); } catch { }
  }
  return res;
}
