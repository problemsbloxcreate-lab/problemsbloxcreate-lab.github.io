/* ===================== estudio-conta.js — botões padrão de TODOS os projetos do Estúdio Problems =====================
   Coloque no projeto (de preferência no fim do <body>):

       <script src="/estudio-conta.js" defer></script>

   e, no cabeçalho, um  <span data-estudio-conta></span>  onde os botões devem ficar. Sem esse marcador, eles entram ao
   lado do botão de tema ([data-tema-aqui]) ou, se não houver, ficam soltos no canto de cima.
   Marcadores que aparecerem depois (telas que se redesenham) recebem os botões sozinhos.

   Mostra sempre o mesmo par: [⌂ Menu] [foto]. A foto abre: nome e e-mail, Minha conta, Voltar ao menu,
   Atualizar todos os sites, (itens do próprio projeto) e Sair da conta. Os dados vêm do porteiro (GET /conta).
   Fora do endereço único (sem porteiro) ou sem login, não aparece nada.

   Ajustes opcionais, ANTES de carregar este arquivo:
     window.ESTUDIO_CONTA = {
       semMenu: true,                       // não mostra o botão "Menu" (o próprio menu usa assim)
       autoMontar: false,                   // só monta quando o projeto chamar EstudioConta.montar()
       conta: () => {...},                  // o que "Minha conta" faz (padrão: abre a Minha conta do menu)
       sair: () => {...},                   // o que "Sair da conta" faz (padrão: sai e volta para o menu)
       extras: () => [{ texto, icone, acao }, '-'],  // itens do projeto no balão (icone = <svg> ou nome de ícone daqui)
       selecao: true,                       // deixa a página toda selecionável (padrão: só campos, textos editáveis e .selecionavel)
     };
   Círculo de espaço: ao lado do Menu, mostra quanto o navegador guarda (é o mesmo espaço para todos os programas
   do endereço único). Clicando, abre a lista por programa e os arquivos do programa aberto, com "Baixar" e "Apagar".
   Cada programa que guarda coisas no navegador se registra (e quem passar a guardar depois, registra quando começar):
     EstudioConta.espaco.registrar({ programa: 'Editor', listar: async () => [{ nome, bytes, data, thumb, baixar: async () => {}, rotuloBaixar: 'Baixar .edicao.json', apagar: async () => {}, confirma: false (se o próprio programa já pergunta) }], detalhes: () => {} })
   E, se usar um banco novo no navegador (IndexedDB), ponha o nome dele em BANCOS aqui embaixo para aparecer no programa certo.
   API: EstudioConta.montar(alvo?), EstudioConta.recarregar(), EstudioConta.atualizarTudo(), EstudioConta.perfil(), EstudioConta.ICONES
   ⚠ Isto é só a cara da conta: quem decide quem entra é o porteiro + o servidor do Estúdio Problems. Não ponha senhas aqui. */
'use strict';
(() => {
  if (window.EstudioConta) return;
  const CFG = window.ESTUDIO_CONTA || {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = d => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  // mesmos ícones de linha do menu
  const ICONES = {
    adm: svg('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>'),
    inicio: svg('<path d="m3 10.5 9-7 9 7V20a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 20z"/>'),
    conta: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    atualizar: svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20.5V16h-4.5"/>'),
    sair: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    pacote: svg('<path d="M12 2.8 20.5 7.4v9.2L12 21.2 3.5 16.6V7.4z"/><path d="M3.5 7.4 12 12l8.5-4.6M12 12v9.2"/>'),
    tela: svg('<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'),
    baixar: svg('<path d="M12 3.5v12M7 11l5 5 5-5"/><path d="M4.5 20.5h15"/>'),
    lixo: svg('<path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5l1 13.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5l1-13.5M10 11v6M14 11v6"/>'),
    lista: svg('<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
    paleta: svg('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
  };
  const css = `.ep-conta{position:relative;display:inline-flex;align-items:center;gap:8px;flex:none;font:14px/1.4 'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;z-index:50;color:inherit}
.ep-conta.solto{position:fixed;top:10px;right:12px;z-index:2147483000}
.ep-conta :is(button,a){box-sizing:border-box;margin:0;font:inherit;text-transform:none;letter-spacing:0;min-width:0;max-width:none;min-height:0}
.ep-conta .ep-conta-menu{display:inline-flex;align-items:center;gap:7px;height:34px!important;padding:0 13px 0 11px!important;font-family:"Segoe UI",system-ui,-apple-system,Roboto,sans-serif!important;border-radius:999px;border:1px solid color-mix(in srgb,currentColor 24%,transparent);background:color-mix(in srgb,currentColor 6%,transparent);color:inherit;text-decoration:none;font-weight:600!important;font-size:13.5px!important;line-height:1!important;cursor:pointer;white-space:nowrap}
.ep-conta-menu:hover,.ep-conta-menu:focus-visible{border-color:#3d8bff;background:color-mix(in srgb,#3d8bff 16%,transparent);outline:none}
.ep-conta-menu svg{flex:none}
.ep-conta .ep-conta-btn{width:34px;height:34px;flex:none;line-height:1;text-decoration:none;font-size:14px;border-radius:50%;border:0;padding:0;cursor:pointer;overflow:hidden;display:grid;place-items:center;font-weight:700;color:#fff;background:linear-gradient(135deg,#3d8bff,#19d3f0);box-shadow:0 2px 10px rgba(0,0,0,.3)}
.ep-conta-btn:hover,.ep-conta-btn:focus-visible{filter:brightness(1.1);outline:2px solid rgba(61,139,255,.6);outline-offset:2px}
.ep-conta-btn img{width:100%;height:100%;object-fit:cover;display:block}
.ep-conta-pop{box-sizing:border-box;line-height:1.4;position:absolute;right:0;top:42px;width:270px;background:#2b2c31;color:#e9ebef;border:1px solid #4a4c55;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.5);padding:6px;text-align:left}
.ep-conta-pop[hidden]{display:none}
.ep-conta-head{display:flex;align-items:center;gap:10px;padding:8px 8px 10px;border-bottom:1px solid #1f2024;margin-bottom:4px}
.ep-conta-head .av{width:40px;height:40px;border-radius:50%;overflow:hidden;flex:none;display:grid;place-items:center;font-weight:700;background:linear-gradient(135deg,#3d8bff,#19d3f0);color:#fff}
.ep-conta-head .av img{width:100%;height:100%;object-fit:cover}
.ep-conta-head b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ep-conta-head small{display:block;color:#a9adb7;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ep-conta-pop .it{width:100%;display:flex;align-items:center;gap:10px;background:none;border:0;padding:8px 10px;border-radius:8px;cursor:pointer;text-align:left;color:#e9ebef;text-decoration:none;font-size:13.5px;line-height:1.3}
.ep-conta-pop .it:hover,.ep-conta-pop .it:focus-visible{background:#3a3c43;outline:none}
.ep-conta-pop .it svg{flex:none;width:16px;height:16px;color:#a9adb7}
.ep-conta-head b{display:flex;align-items:center;gap:6px}.ep-selo{display:inline-grid;place-items:center;flex:none;width:18px;height:18px;border-radius:6px;background:linear-gradient(135deg,#3d8bff,#19d3f0);color:#fff;font-style:normal}.ep-selo svg{width:12px;height:12px}
.ep-conta-pop .sep{height:1px;background:#1f2024;margin:4px 0}
.ep-conta-aviso{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483001;background:#2b2c31;color:#e9ebef;border:1px solid #4a4c55;border-radius:10px;padding:10px 16px;font:13.5px/1.4 'Segoe UI',system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.4)}
.ep-conta .ep-conta-espaco{width:34px;height:34px;flex:none;border-radius:50%;border:0;padding:0;background:none;cursor:pointer;display:grid;place-items:center;color:inherit}
.ep-conta-espaco:hover,.ep-conta-espaco:focus-visible{background:color-mix(in srgb,currentColor 10%,transparent);outline:none}
.ep-esp{position:fixed;inset:0;z-index:2147483002;background:rgba(0,0,0,.6);display:grid;place-items:center;padding:16px;font:14px/1.45 'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;color:#e9ebef}
.ep-esp .cx{width:min(640px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#2b2c31;border:1px solid #4a4c55;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.55);padding:20px}
.ep-esp h2{font-size:17px;margin:0 0 14px;display:flex;align-items:center;gap:10px}.ep-esp h2 .x{margin-left:auto}
.ep-esp h3{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#a9adb7;margin:18px 0 8px;font-weight:600}
.ep-esp .topo{display:flex;gap:16px;align-items:center}.ep-esp .topo b{font-size:21px;display:block}.ep-esp small,.ep-esp .nota{color:#a9adb7;font-size:12.5px}
.ep-esp .linha{display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid #3a3c43;border-radius:10px;margin-bottom:6px;background:#26272c}
.ep-esp .linha.aqui{border-color:#3d8bff}
.ep-esp .linha .n{flex:1;min-width:0}.ep-esp .linha .n b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13.5px}
.ep-esp .barra{height:5px;border-radius:3px;background:#3a3c43;margin-top:5px;overflow:hidden}.ep-esp .barra i{display:block;height:100%;background:linear-gradient(90deg,#3d8bff,#19d3f0)}
.ep-esp .tam{font-variant-numeric:tabular-nums;color:#c9ccd3;font-size:12.5px;white-space:nowrap}
.ep-esp img.th{width:56px;height:32px;object-fit:cover;border-radius:5px;background:#000;flex:none}
.ep-esp .bt{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:8px;border:1px solid #4a4c55;background:#33353b;color:#e9ebef;cursor:pointer;font:inherit;font-size:12.5px;white-space:nowrap;text-decoration:none}
.ep-esp .bt:hover{border-color:#3d8bff}.ep-esp .bt.perigo:hover{border-color:#ff6b6b;color:#ff9a9a}.ep-esp .bt.pri{background:#3d8bff;border-color:#3d8bff;color:#fff}
.ep-esp .bt svg{width:15px;height:15px}
.ep-esp .vazio{padding:14px;text-align:center;color:#a9adb7;border:1px dashed #4a4c55;border-radius:10px}
.ep-esp .pe{display:flex;gap:8px;align-items:center;margin-top:16px;flex-wrap:wrap}.ep-esp .pe .sp{flex:1}
@media (max-width:560px){.ep-conta-menu span{display:none}.ep-conta .ep-conta-menu{padding:0 10px!important}}`;
  // cara de programa de computador: botões, menus e partes da tela não ficam selecionáveis (nem arrastam como imagem);
  // o que é para copiar continua: campos, textos editáveis, código, a classe "selecionavel" e alguns textos dos programas
  // (conversa da IA do Animador, pedidos do Modelador, texto do roteiro dos Shorts)
  (() => { if (CFG.selecao === true || document.getElementById('ep-sem-selecao')) return;
    const st = document.createElement('style'); st.id = 'ep-sem-selecao';
    st.textContent = `html,body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
img,svg,canvas,video,a,button{-webkit-user-drag:none}
input,textarea,select,[contenteditable]:not([contenteditable=false]),pre,code,kbd,.selecionavel,.selecionavel *,[data-selecionavel],[data-selecionavel] *,.as-msg,.as-msg *,.ped .desc,.ped .resp,#area .coluna,#area .coluna *{-webkit-user-select:text;user-select:text}
input[type=button],input[type=submit],input[type=checkbox],input[type=radio],input[type=range],input[type=color]{-webkit-user-select:none;user-select:none}`;
    (document.head || document.documentElement).appendChild(st); })();
  const ini = p => esc((String(p?.nome || p?.email || '?')[0] || '?').toUpperCase());
  // se a foto falhar, tenta de novo uma vez (sem a memória do navegador) antes de mostrar a letra
  const av = p => p?.foto ? `<img src="${esc(p.foto)}" alt="" referrerpolicy="no-referrer" onerror="if(!this.dataset.r){this.dataset.r=1;var i=this;setTimeout(function(){i.src=i.src+(i.src.indexOf('?')<0?'?':'&')+'r='+Date.now()},1200)}else this.replaceWith(document.createTextNode('${ini(p)}'))">` : ini(p);
  let perfilP = null;
  const perfil = (novo) => (!novo && perfilP) || (perfilP = fetch('/conta', { credentials: 'same-origin', cache: 'no-store' })
    .then(r => r.ok && r.headers.get('x-porteiro') ? r.json() : null).catch(() => null));

  function caixa(p) {
    const box = document.createElement('div'); box.className = 'ep-conta';
    const menu = CFG.semMenu ? '' : `<a class="ep-conta-menu" href="/" title="Voltar ao menu do Estúdio Problems">${ICONES.inicio}<span>Menu</span></a>`;
    box.innerHTML = `<button class="ep-conta-espaco" type="button" title="Espaço usado no navegador">${anel(0)}</button>${menu}<button class="ep-conta-btn" type="button" aria-haspopup="true" aria-expanded="false" title="${esc(p.nome)} · ${esc(p.email)}">${av(p)}</button>
      <div class="ep-conta-pop" hidden role="menu"></div>`;
    const btn = box.querySelector('.ep-conta-btn'), pop = box.querySelector('.ep-conta-pop');
    const fecha = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    const abre = () => {
      let ex = []; try { ex = (typeof CFG.extras === 'function' ? CFG.extras() : CFG.extras) || []; } catch { }
      ex = ex.filter(Boolean);
      const it = (i, k) => i === '-' ? '<div class="sep"></div>' : `<button class="it" type="button" role="menuitem" data-ex="${k}">${ICONES[i.icone] || i.icone || ''}${esc(i.texto)}</button>`;
      pop.innerHTML = `<div class="ep-conta-head"><span class="av">${av(p)}</span><span style="min-width:0"><b>${esc(p.nome)}${p.adm ? `<i class="ep-selo" title="ADM do Estúdio Problems">${ICONES.adm}</i>` : ''}</b><small>${esc(p.email)}</small></span></div>
        <button class="it" type="button" role="menuitem" data-a="conta">${ICONES.conta}Minha conta</button>
        ${p.adm ? (/^\/adm\/?$/i.test(location.pathname) ? `<a class="it" href="/" role="menuitem">${ICONES.inicio}Ver o menu</a>` : `<a class="it" href="/adm" role="menuitem">${ICONES.adm}ADM</a>`) : ''}
        ${CFG.semMenu ? '' : `<a class="it" href="/" role="menuitem">${ICONES.inicio}Voltar ao menu</a>`}
        <button class="it" type="button" role="menuitem" data-a="atualizar" title="Baixa de novo a versão mais nova do menu e de todos os projetos (como o Ctrl+F5). Seus projetos salvos no navegador continuam.">${ICONES.atualizar}Atualizar todos os sites</button>
        ${ex.length ? '<div class="sep"></div>' + ex.map(it).join('') : ''}
        <div class="sep"></div>
        <button class="it" type="button" role="menuitem" data-a="sair">${ICONES.sair}Sair da conta</button>`;
      pop.querySelector('[data-a=conta]').onclick = () => { fecha(); if (CFG.conta) CFG.conta(); else location.href = '/?conta=1'; };
      pop.querySelector('[data-a=atualizar]').onclick = () => { fecha(); atualizarTudo(); };
      pop.querySelector('[data-a=sair]').onclick = async () => { fecha(); if (CFG.sair) return CFG.sair(); try { await fetch('/sair', { method: 'POST', credentials: 'same-origin' }); } catch { } location.href = '/?sair=1'; };
      pop.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { fecha(); try { ex[+b.dataset.ex].acao(); } catch (e) { console.error(e); } });
      pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
    };
    btn.onclick = e => { e.stopPropagation(); pop.hidden ? abre() : fecha(); };
    box.querySelector('.ep-conta-espaco').onclick = () => { fecha(); painelEspaco(); };
    atualizaAneis();
    document.addEventListener('click', e => { if (!box.contains(e.target)) fecha(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') fecha(); });
    return box;
  }

  let P = null;
  function poe(alvo) {
    if (!P || !alvo || alvo.dataset?.epMontado) return;
    const box = caixa(P);
    if (alvo.matches?.('[data-estudio-conta]')) { alvo.dataset.epMontado = '1'; alvo.replaceChildren(box); alvo.style.display = 'contents'; }
    else if (alvo.matches?.('[data-tema-aqui]')) { alvo.dataset.epMontado = '1'; alvo.insertAdjacentElement('afterend', box); }
    else { box.classList.add('solto'); document.body.appendChild(box); }
  }
  function procura() {
    const marcas = document.querySelectorAll('[data-estudio-conta]:not([data-ep-montado])');
    if (marcas.length) return marcas.forEach(poe);
    if (document.querySelector('.ep-conta')) return;
    poe(document.querySelector('[data-tema-aqui]') || document.body);
  }
  async function montar(alvo) {
    P = await perfil(); if (!P) return; // fora do porteiro ou sem sessão: não mostra nada
    if (!document.getElementById('ep-conta-css')) { const st = document.createElement('style'); st.id = 'ep-conta-css'; st.textContent = css; document.head.appendChild(st); }
    if (alvo) poe(typeof alvo === 'string' ? document.querySelector(alvo) : alvo); else procura();
    if (!montar.obs) { // telas que se redesenham: o marcador novo ganha os botões de novo
      montar.obs = new MutationObserver(() => { if (document.querySelector('[data-estudio-conta]:not([data-ep-montado])')) procura(); });
      montar.obs.observe(document.body, { childList: true, subtree: true });
    }
  }
  async function recarregar() { // depois de trocar nome ou foto
    P = await perfil(true); if (!P) return;
    document.querySelectorAll('.ep-conta').forEach(b => { const n = caixa(P); if (b.classList.contains('solto')) n.classList.add('solto'); b.replaceWith(n); });
  }

  // "Ctrl+F5 para todos os sites": baixa de novo (sem a memória do navegador) as páginas e os arquivos do menu e de cada projeto.
  // NÃO apaga nada guardado no navegador: projetos, rascunhos e preferências (IndexedDB/localStorage) não são tocados.
  async function atualizarTudo(extras = []) {
    const aviso = document.createElement('div'); aviso.className = 'ep-conta-aviso'; aviso.setAttribute('role', 'status'); document.body.appendChild(aviso);
    if (!document.getElementById('ep-conta-css')) { const st = document.createElement('style'); st.id = 'ep-conta-css'; st.textContent = css; document.head.appendChild(st); }
    const diz = t => { aviso.textContent = t; };
    diz('Atualizando os sites…');
    try {
      if (navigator.serviceWorker?.getRegistrations) for (const r of await navigator.serviceWorker.getRegistrations()) { try { await r.update(); } catch { } }
      if (window.caches?.keys) for (const k of await caches.keys()) { try { await caches.delete(k); } catch { } } // só cópias offline de arquivos do site
      const raizes = new Set(['/', '/estudio-login.js', '/estudio-conta.js', '/shorts/', '/shorts/producao/', '/shorts/roteiro/', '/shorts/gravacao/', '/editor/', '/modelador/', '/modelador/blockbench/app/', '/animador/', '/animador/animar.html', location.pathname, ...extras]);
      if (P?.foto?.startsWith('/')) raizes.add(P.foto);
      const feitos = new Set(), fila = [...raizes];
      const pega = async caminho => {
        if (feitos.has(caminho) || feitos.size > 800) return; feitos.add(caminho);
        let r; try { r = await fetch(caminho, { cache: 'reload', credentials: 'same-origin' }); } catch { return; }
        if (!r.ok || !raizes.has(caminho) || !(r.headers.get('content-type') || '').includes('text/html')) return;
        const base = new URL(r.url), html = await r.text(); // das páginas, pega também os scripts, estilos e ícones do mesmo endereço
        for (const m of html.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"'#]+)["']/gi)) {
          if (m[1].includes('${')) continue; // pedaço de código, não é arquivo
          try { const u = new URL(m[1], base); if (u.origin === location.origin && !/\/(entrar|sair|conta)$/.test(u.pathname)) fila.push(u.pathname + u.search); } catch { }
        }
      };
      while (fila.length) { await Promise.all(fila.splice(0, 6).map(pega)); diz(`Atualizando os sites… ${feitos.size} arquivos`); }
      diz('Pronto! Tudo atualizado. Recarregando…');
    } catch (e) { diz('Não consegui atualizar tudo: ' + e.message); }
    setTimeout(() => location.reload(), 900);
  }

  /* ---------------- espaço no navegador (o mesmo para todos os programas do endereço único) ---------------- */
  // bancos do navegador (IndexedDB) de cada programa: nome do banco → programa e endereço
  const BANCOS = {
    'turma-studios': ['Animador', '/animador/'], 'ep-edicao': ['Editor', '/editor/'], 'ep-whisper-edicao': ['Editor', '/editor/', 'transcrição guardada'],
    'estudio-problems': ['Shorts', '/shorts/'], 'ep-gravacao': ['Shorts', '/shorts/gravacao/'], 'ep-menu': ['Menu', '/', 'fundo próprio'],
  };
  const PROGRAMAS = { '/animador/': 'Animador', '/editor/': 'Editor', '/shorts/': 'Shorts', '/modelador/': 'Modelador' };
  const fmt = b => { b = b || 0; return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : (b / 1073741824).toFixed(2).replace('.', ',') + ' GB'; };
  const dataTxt = t => { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  function anel(pct) {
    const c = pct > 85 ? '#ff6b6b' : pct > 60 ? '#ffcf4a' : '#19d3f0', r = 13, L = 2 * Math.PI * r;
    return `<svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="4"/><circle cx="16" cy="16" r="${r}" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(Math.max(pct, 2) / 100 * L).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 16 16)"/></svg>`;
  }
  const estimativa = async () => { try { return await navigator.storage.estimate(); } catch { return {}; } };
  async function atualizaAneis() {
    const e = await estimativa(), pct = e.quota ? e.usage / e.quota * 100 : 0;
    document.querySelectorAll('.ep-conta-espaco').forEach(b => { b.innerHTML = anel(pct); b.title = `Espaço no navegador: ${fmt(e.usage)} usados${e.quota ? ' de ' + fmt(e.quota) : ''} (clique para ver o que ocupa)`; });
  }
  setInterval(() => { if (document.visibilityState === 'visible' && document.querySelector('.ep-conta-espaco')) atualizaAneis(); }, 60000);
  const tamanho = (v, fundo = 0) => { // tamanho aproximado de um valor guardado
    if (v == null || fundo > 6) return 0;
    if (typeof v === 'string') return v.length;
    if (typeof v === 'number' || typeof v === 'boolean') return 8;
    if (v instanceof Blob) return v.size;
    if (v instanceof ArrayBuffer) return v.byteLength;
    if (ArrayBuffer.isView(v)) return v.byteLength;
    if (typeof FileSystemHandle !== 'undefined' && v instanceof FileSystemHandle) return 0;
    if (Array.isArray(v)) return v.reduce((s, x) => s + tamanho(x, fundo + 1), 0);
    if (typeof v === 'object') { let s = 0; for (const k in v) s += k.length + tamanho(v[k], fundo + 1); return s; }
    return 0;
  };
  async function medeBanco(nome) {
    return new Promise(ok => {
      let q; try { q = indexedDB.open(nome); } catch { return ok(0); }
      q.onupgradeneeded = () => { try { q.transaction.abort(); } catch { } }; // não cria banco que não existe
      q.onerror = () => ok(0);
      q.onsuccess = () => {
        const db = q.result, lojas = [...db.objectStoreNames]; if (!lojas.length) { db.close(); return ok(0); }
        let total = 0; const t = db.transaction(lojas, 'readonly');
        lojas.forEach(l => { const c = t.objectStore(l).openCursor(); c.onsuccess = () => { const k = c.result; if (!k) return; total += tamanho(k.key) + tamanho(k.value); k.continue(); }; });
        t.oncomplete = () => { db.close(); ok(total); }; t.onerror = t.onabort = () => { db.close(); ok(total); };
      };
    });
  }
  const PROV = [];
  const espaco = { registrar(p) { if (p && p.programa) { const i = PROV.findIndex(x => x.programa === p.programa); if (i >= 0) PROV[i] = p; else PROV.push(p); } }, fmt, atualizar: atualizaAneis };
  const aqui = () => { const m = Object.keys(PROGRAMAS).find(k => location.pathname.startsWith(k)); return m ? PROGRAMAS[m] : (location.pathname === '/' || /^\/adm/.test(location.pathname) ? 'Menu' : ''); };
  // programa que ainda não tem lista própria: mostra o que estiver nos bancos dele (BANCOS), com "Baixar" nos arquivos
  function generico(prog, nomes) {
    const meus = nomes.filter(n => BANCOS[n]?.[0] === prog); if (!meus.length) return null;
    return { programa: prog, async listar() {
      const out = [];
      for (const n of meus) await new Promise(ok => {
        const q = indexedDB.open(n); q.onupgradeneeded = () => { try { q.transaction.abort(); } catch { } }; q.onerror = () => ok();
        q.onsuccess = () => { const db = q.result, lojas = [...db.objectStoreNames]; if (!lojas.length) { db.close(); return ok(); }
          const t = db.transaction(lojas, 'readonly');
          lojas.forEach(l => { const c = t.objectStore(l).openCursor(); c.onsuccess = () => { const k = c.result; if (!k) return; const v = k.value, nome = String(k.key);
            const blob = v instanceof Blob ? v : null;
            out.push({ nome: (blob?.name || nome).slice(0, 120), bytes: tamanho(v), info: BANCOS[n][2] || '', baixar: blob ? () => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = blob.name || nome.replace(/[^\w.\- ]+/g, '_'); a.click(); } : null, rotuloBaixar: 'Baixar' });
            k.continue(); }; });
          t.oncomplete = t.onerror = t.onabort = () => { db.close(); ok(); }; };
      });
      return out.sort((a, b) => b.bytes - a.bytes);
    } };
  }
  async function painelEspaco() {
    if (!document.getElementById('ep-conta-css')) { const st = document.createElement('style'); st.id = 'ep-conta-css'; st.textContent = css; document.head.appendChild(st); }
    document.querySelector('.ep-esp')?.remove();
    const d = document.createElement('div'); d.className = 'ep-esp'; d.innerHTML = '<div class="cx" role="dialog" aria-label="Espaço no navegador"><h2>Espaço no navegador</h2><p class="nota">Medindo o que cada programa guarda…</p></div>';
    document.body.appendChild(d);
    const fechar = () => { d.remove(); document.removeEventListener('keydown', esc1); }, esc1 = e => { if (e.key === 'Escape') fechar(); };
    d.onclick = e => { if (e.target === d) fechar(); }; document.addEventListener('keydown', esc1);
    const e = await estimativa(), pct = e.quota ? e.usage / e.quota * 100 : 0;
    // por programa: cada banco do navegador + a memória pequena (localStorage) + cópias offline
    const porProg = {}; const soma = (prog, b, end) => { if (!b) return; (porProg[prog] ||= { b: 0, end }).b += b; };
    let nomes = []; try { nomes = (await indexedDB.databases()).map(x => x.name).filter(Boolean); } catch { nomes = Object.keys(BANCOS); }
    for (const n of nomes) { const [prog, end] = BANCOS[n] || ['Outros (' + n + ')', '']; soma(prog, await medeBanco(n), end); }
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i), v = localStorage.getItem(k) || ''; const prog = /modelador/i.test(k) ? 'Modelador' : /^ep-menu|^ep-fundo/.test(k) ? 'Menu' : 'Preferências (todos)'; soma(prog, (k.length + v.length) * 2, prog === 'Modelador' ? '/modelador/' : prog === 'Menu' ? '/' : ''); } } catch { }
    try { if (window.caches?.keys) for (const k of await caches.keys()) { const c = await caches.open(k); let b = 0; for (const r of await c.keys()) { try { b += (await (await c.match(r)).blob()).size; } catch { } } soma('Cópias para usar sem internet', b, ''); } } catch { }
    const linhas = Object.entries(porProg).sort((a, b) => b[1].b - a[1].b), maior = Math.max(1, ...linhas.map(x => x[1].b)), atual = aqui();
    const prov = PROV.find(x => x.programa === atual) || generico(atual, nomes);
    let itens = []; if (prov) { try { itens = (await prov.listar()) || []; } catch (er) { console.error(er); } }
    const cx = d.querySelector('.cx');
    cx.innerHTML = `<h2>${ICONES.pacote} Espaço no navegador <button class="bt x" data-x>Fechar</button></h2>
      <div class="topo"><span style="flex:none">${anel(pct).replace('width="26" height="26"', 'width="74" height="74"')}</span>
        <div><b>${fmt(e.usage)} usados</b><small>${e.quota ? `de ${fmt(e.quota)} que o navegador libera · ${fmt(Math.max(0, e.quota - e.usage))} livres` : 'O navegador não informou o limite.'}</small>
        <div class="nota" style="margin-top:4px">É o mesmo espaço para todos os programas do Estúdio Problems neste computador.</div></div></div>
      <h3>Por programa</h3>
      ${linhas.length ? linhas.map(([n, x]) => `<div class="linha ${n === atual ? 'aqui' : ''}"><div class="n"><b>${esc(n)}${n === atual ? ' · aberto agora' : ''}</b><div class="barra"><i style="width:${(x.b / maior * 100).toFixed(1)}%"></i></div></div><span class="tam">${fmt(x.b)}</span>${x.end && n !== atual ? `<a class="bt" href="${x.end}">Abrir</a>` : ''}</div>`).join('') : '<div class="vazio">Nada guardado neste navegador ainda.</div>'}
      ${prov ? `<h3>Arquivos do ${esc(prov.programa)} (${itens.length})</h3>
        ${itens.length ? itens.map((it, i) => `<div class="linha">${it.thumb ? `<img class="th" src="${esc(it.thumb)}" alt="">` : ''}<div class="n"><b>${esc(it.nome)}</b><small>${[it.bytes != null ? fmt(it.bytes) : '', dataTxt(it.data), it.info || ''].filter(Boolean).join(' · ')}</small></div>
          ${it.baixar ? `<button class="bt" data-b="${i}" title="${esc(it.rotuloBaixar || 'Baixar')}">${ICONES.baixar}${esc(it.rotuloBaixar || 'Baixar')}</button>` : ''}${it.apagar ? `<button class="bt perigo" data-d="${i}" title="Apagar deste navegador">${ICONES.lixo}</button>` : ''}</div>`).join('') : '<div class="vazio">Nenhum arquivo guardado por este programa.</div>'}` : ''}
      <div class="pe">${prov?.detalhes ? `<button class="bt" data-det>${ICONES.lista}Limpeza e detalhes…</button>` : ''}<span class="sp"></span>
        <span class="nota">Para não perder nada, baixe os projetos importantes.</span></div>`;
    cx.querySelector('[data-x]').onclick = fechar;
    cx.querySelectorAll('[data-b]').forEach(b => b.onclick = async () => { b.disabled = true; try { await itens[+b.dataset.b].baixar(); } catch (er) { alert('Não consegui baixar: ' + er.message); } b.disabled = false; });
    cx.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { const it = itens[+b.dataset.d]; if (it.confirma !== false && !confirm(`Apagar "${it.nome}" deste navegador? Baixe antes se quiser guardar.`)) return; try { await it.apagar(); } catch (er) { alert(er.message); } atualizaAneis(); painelEspaco(); });
    const det = cx.querySelector('[data-det]'); if (det) det.onclick = () => { fechar(); prov.detalhes(); };
  }

  /* ---------------- quem fez: foto e nome no lugar do e-mail ----------------
     Em qualquer programa: <span data-quem="email@..."></span> vira [foto] Nome (da Minha conta, ou do Google).
     Para texto simples (ex.: dica ao passar o mouse): await EstudioConta.nomeDe(email). */
  const QUEM = new Map();
  const quem = email => { const k = String(email || '').trim().toLowerCase(); if (!k) return Promise.resolve(null);
    if (!QUEM.has(k)) QUEM.set(k, fetch('/pessoa?e=' + encodeURIComponent(k), { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null)); return QUEM.get(k); };
  const nomeDe = async email => (await quem(email))?.nome || '';
  async function pintaQuem(el) {
    el.dataset.quemOk = '1'; const q = await quem(el.dataset.quem); if (!q) { el.textContent = ''; return; }
    const ini = esc((q.nome || '?')[0].toUpperCase());
    el.innerHTML = `<span class="ep-quem" title="${esc(q.nome)}"><span class="ep-quem-av">${q.foto ? `<img src="${esc(q.foto)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('${ini}'))">` : ini}</span>${esc(q.nome)}</span>`;
  }
  const procuraQuem = () => document.querySelectorAll('[data-quem]:not([data-quem-ok])').forEach(pintaQuem);
  (() => { const st = document.createElement('style'); st.textContent = `.ep-quem{display:inline-flex;align-items:center;gap:5px;vertical-align:middle;font-weight:600;max-width:100%}
.ep-quem-av{width:18px;height:18px;border-radius:50%;overflow:hidden;flex:none;display:inline-grid;place-items:center;font-size:10px;font-weight:700;color:#fff;background:linear-gradient(135deg,#3d8bff,#19d3f0)}.ep-quem-av img{width:100%;height:100%;object-fit:cover}`;
    (document.head || document.documentElement).appendChild(st);
    const liga = () => { procuraQuem(); new MutationObserver(() => { if (document.querySelector('[data-quem]:not([data-quem-ok])')) procuraQuem(); }).observe(document.body, { childList: true, subtree: true }); };
    if (document.body) liga(); else addEventListener('DOMContentLoaded', liga, { once: true }); })();

  window.EstudioConta = { perfil, montar, recarregar, atualizarTudo, ICONES, espaco, painelEspaco, quem, nomeDe };
  if (CFG.autoMontar !== false) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => montar(), { once: true }); else montar(); }
})();
