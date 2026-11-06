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
     Salvar ao sair: (window.ESTUDIO_AO_SAIR ||= []).push(async () => salvarAgora())  — roda antes de sair (ver salvarAntesDeSair).
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
// atualização de teste (02/11/2026 18:33): só para conferir o aviso de versão nova e a tela "Atualizando"
/* ---------- LIMITE GRÁTIS DA CLOUDFLARE: aviso claro em vez de "Failed to fetch", em TODOS os programas ----------
   O plano grátis da Cloudflare tem um limite por dia (volta às 00:00 UTC = 21h de Brasília). Quando o servidor responde
   { error: { type: 'limite_cloudflare' } } (ou a Cloudflare devolve a página de limite dela), fica marcado neste navegador
   até a hora de voltar: os erros de rede para a nossa nuvem viram a frase explicada e aparece um selo discreto com a
   contagem regressiva (calculada aqui no computador, sem pedir nada para a nuvem). */
/* MESMO LOGIN NOS DOIS ENDEREÇOS (decisão do dono, 02/11/2026): ao trocar entre o endereço principal e a porta reserva, o login do
   Google vai junto no fragmento do endereço (#ep-conta=…, que não sai do navegador nem vai para nenhum servidor) e entra no lugar
   onde o Firebase guarda a sessão neste endereço (IndexedDB firebaseLocalStorageDb). O fragmento é apagado da barra na hora. */
window.EstudioPasse ||= (() => {
  const m = location.hash.match(/(?:^#|&)ep-conta=([^&]+)/); if (!m) return { pronto: Promise.resolve(false) };
  try { const h = location.hash.replace(/(^#|&)ep-conta=[^&]+/, '$1').replace(/^#&?$/, ''); history.replaceState(history.state, '', location.pathname + location.search + h); } catch { }
  const pronto = (async () => {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/'), u = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))));
    if (!u?.uid || !u.apiKey || !u.stsTokenManager?.refreshToken) return false;
    const db = await new Promise((ok, no) => { const q = indexedDB.open('firebaseLocalStorageDb', 1); q.onupgradeneeded = () => { if (!q.result.objectStoreNames.contains('firebaseLocalStorage')) q.result.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' }); }; q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
    const k = 'firebase:authUser:' + u.apiKey + ':[DEFAULT]';
    await new Promise((ok, no) => { const tx = db.transaction('firebaseLocalStorage', 'readwrite'); tx.objectStore('firebaseLocalStorage').put({ fbase_key: k, value: u }); tx.oncomplete = ok; tx.onerror = () => no(tx.error); });
    db.close(); return true;
  })().catch(() => false);
  return { pronto };
})();
// o login do Google desta aba, pronto para ir junto para o outro endereço ('' quando não tem)
window.EstudioPasse.fragmento = () => { try { const u = window.firebase?.apps?.length && window.firebase.auth().currentUser; if (!u) return '';
  const j = new TextEncoder().encode(JSON.stringify(u.toJSON())); let t = ''; for (const c of j) t += String.fromCharCode(c);
  return 'ep-conta=' + btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch { return ''; } };
/* ===================== NÍVEIS DE ACESSO no navegador (05/11/2026) — window.EstudioPerm =====================
   CONTRATO (todos os programas usam):  await EstudioPerm.pronto;  EstudioPerm.pode('animador.exportar') → true/false;
   EstudioPerm.programa('animador') → true/false.  Sem regras carregadas (sem porteiro, sem internet, servidor fora) responde
   TRUE: nada quebra. Quem decide de verdade é o servidor (porteiro + turma-ia `/permissoes`); isto só esconde o que a pessoa
   não pode usar. Guardado 5 min no sessionStorage 'ep-perm-v1' (não pede a cada página). Evento 'estudio-perm' quando chega.
   Extras: EstudioPerm.dados() (o que veio do servidor), EstudioPerm.atualizar() (busca de novo agora). */
/* VERSÃO, DIÁRIO E RELATÓRIO DE SUPORTE: moravam aqui até 06/11/2026. Agora ficam num lugar só, o /estudio-carregando.js
   (window.EstudioVersao, EstudioDiario e EstudioSuporte), que também entra nas telas de erro e de login. Página que não carrega
   o /estudio-carregando.js (ex.: Animador): ele entra aqui, só com o motor (sem a tela de carregamento). */
if (!window.EstudioSuporte) { try { const s = document.createElement('script'); s.src = '/estudio-carregando.js'; s.setAttribute('data-so-progresso', ''); (document.head || document.documentElement).appendChild(s); } catch { } }
window.EstudioPerm ||= (() => {
  const K = 'ep-perm-v1', VALE = 5 * 60e3; let dados = null;
  try { const c = JSON.parse(sessionStorage.getItem(K) || 'null'); if (c?.j && Date.now() - c.t < VALE) dados = c.j; } catch { }
  const bloq = k => { if (!dados || dados.adm) return false; k = String(k || '').trim(); const s = dados.sem || {}, ps = s.programas || [], fs = s.funcoes || [];
    return k.includes('.') ? fs.includes(k) || ps.includes(k.split('.')[0]) : ps.includes(k); };
  const busca = async forcar => {
    try { const r = await fetch('/permissoes' + (forcar ? '?novo=1' : ''), { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok || !r.headers.get('x-porteiro')) return false; const j = await r.json(); if (!j || typeof j !== 'object') return false;
      dados = { adm: !!j.adm, livre: !!j.livre, programas: j.programas || [], funcoes: j.funcoes || [], sem: j.sem || { programas: [], funcoes: [] }, cargos: j.cargos || [] };
      try { sessionStorage.setItem(K, JSON.stringify({ t: Date.now(), j: dados })); } catch { }
      try { dispatchEvent(new CustomEvent('estudio-perm', { detail: dados })); } catch { } return true;
    } catch { return false; } };
  const P = { pode: k => !bloq(k), programa: id => !bloq(String(id || '').split('.')[0]), dados: () => dados,
    atualizar: () => (P.pronto = busca(true).then(() => true)), limpar: () => { dados = null; try { sessionStorage.removeItem(K); } catch { } } };
  P.pronto = dados ? Promise.resolve(true) : (/^https?:$/.test(location.protocol) ? busca(false).then(() => true) : Promise.resolve(true));
  return P;
})();
(() => {
  if (window.EstudioLimite) return;
  const proxima = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.getTime(); };
  // hora em que volta NO RELÓGIO DESTE COMPUTADOR (no Brasil = 21h); fora do horário de Brasília diz as duas
  const hh = (t, tz) => { const s = new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) }); return s.endsWith(':00') ? (+s.slice(0, 2)) + 'h' : s.replace(':', 'h'); };
  const horaTxt = t => { const l = hh(t), b = hh(t, 'America/Sao_Paulo'); return l === b ? l : `${l} (${b} de Brasília)`; };
  const K = 'estudio-limite-cf', KS = 'estudio-limite-sons', MSG = `A nuvem da equipe chegou ao limite de hoje. Volta sozinha às ${horaTxt(proxima())}. O que você fez continua guardado neste computador.`;
  const MSG_TALVEZ = `Não consegui falar com a nuvem da equipe. Se for o limite de hoje, ela volta sozinha às ${horaTxt(proxima())}. O que você fez continua guardado neste computador.`;
  // nuvem dos SONS (conta antiga: sons, Shorts, modelos) no limite — separada da da equipe
  const sons = () => { try { const t = +localStorage.getItem(KS); return t > Date.now() ? t : 0; } catch { return 0; } };
  const MSG_SONS = t => `A nuvem dos sons (sons, Shorts e modelos) chegou ao limite de hoje. Volta sozinha às ${horaTxt(t)}. O resto do Estúdio continua normal.`;
  // marca = { t: quando a principal volta, r: 1 = usando a nuvem reserva (verde-água), 2 = a terciária (rosa) }
  const le = () => { try { const v = localStorage.getItem(K) || ''; const o = v[0] === '{' ? JSON.parse(v) : { t: +v }; return o.t > Date.now() ? o : null; } catch { return null; } };
  const marcado = () => le()?.t || 0, nivel = () => +(le()?.r || 0), naReserva = () => nivel() >= 1, naTerciaria = () => nivel() >= 2;
  // avisa o círculo da nuvem do cabeçalho (e as outras abas pelo storage) para mudar a cor NA HORA, sem precisar clicar
  const avisaCirculo = () => { try { dispatchEvent(new CustomEvent('estudio-nuvem-estado')); } catch { } };
  const marca = (t, r = 0) => { r = +r || 0; if (!(t > Date.now())) t = proxima(); const a = le(); if (a?.r && Math.abs(a.t - t) < 6e4) r = Math.max(r, +a.r || 0); /* a reserva já entrou hoje: o aviso continua "em uso" até a principal voltar (não pisca para o amarelo) */ if (a && a.t === t && (+a.r || 0) === r) return; try { localStorage.setItem(K, JSON.stringify({ t, r })); } catch { } selo(); avisaCirculo(); };
  const nosso = u => { try { const x = new URL(u, location.href); return x.origin === location.origin || /(^|\.)problemsraiz\.workers\.dev$/.test(x.hostname) || /^turma-reserva\./.test(x.hostname); } catch { return false; } };
  const falta = t => { const m = Math.max(0, Math.ceil((t - Date.now()) / 60e3)), h = Math.floor(m / 60); return h ? `${h}h ${String(m % 60).padStart(2, '0')}min` : `${m} min`; };
  let el = null, iv = 0;
  // VOLTANDO: a principal já voltou e o que ficou na reserva está voltando para ela (aviso verde-água por alguns minutos)
  const KV = 'estudio-voltando', voltando = () => { try { const v = +localStorage.getItem(KV) - Date.now(); return v > 0 && v <= 90e3; } catch { return false; } }; // só ENQUANTO o servidor diz que está voltando (90 s, renovados a cada resposta "voltando"; marcas antigas de 10 min não contam)
  // AVISO SÓ QUANDO MUDA ALGO (decisão do dono, 29/10/2026): "limite" sem reserva em uso (nível 0) não aparece — nada muda
  // para a equipe (o que for gravado vai sozinho para a reserva e aí sim o aviso aparece)
  const visivel = () => naReserva() ? marcado() : 0;
  function selo() {
    const t = visivel();
    if (!t && !voltando() && !sons()) { el?.remove(); el = null; clearInterval(iv); iv = 0; return; }
    if (!document.body) return void document.addEventListener('DOMContentLoaded', selo, { once: true });
    if (!el) {
      el = document.createElement('div'); el.title = MSG + ' (clique para esconder)';
      el.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483600;display:flex;align-items:center;gap:6px;padding:4px 10px 4px 8px;border-radius:999px;font:12px/1.3 system-ui,sans-serif;color:#cfd3dc;background:rgba(20,22,28,.78);border:1px solid rgba(255,255,255,.12);opacity:.72;cursor:pointer;backdrop-filter:blur(4px);pointer-events:auto';
      el.onmouseenter = () => el.style.opacity = '1'; el.onmouseleave = () => el.style.opacity = el._mini ? '.45' : '.72';
      el.onclick = () => { el._mini = !el._mini; pinta(); };
      document.body.appendChild(el);
    }
    const pinta0 = () => { const t2 = visivel();
      if (!t2 && !voltando()) { const ts = sons(); if (!ts) return selo(); // só a nuvem dos sons no limite
        el.title = MSG_SONS(ts) + ' (clique para encolher)'; el.style.borderColor = 'rgba(255,255,255,.12)'; el.style.color = '#cfd3dc';
        el.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' + (el._mini ? `<span>sons · ${falta(ts)}</span>` : `<span>Nuvem dos sons no limite · volta em <b style="font-weight:600">${falta(ts)}</b> (${hh(ts)})</span>`);
        el.style.opacity = el._mini ? '.45' : '.72'; return; }
      if (!t2) {
        el.title = 'A nuvem principal já voltou. O que foi salvo na nuvem reserva durante o limite está voltando para ela sozinho; ninguém precisa fazer nada. (clique para encolher)';
        el.style.borderColor = 'rgba(47,208,168,.55)'; el.style.color = '#9df0db';
        el.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 19a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.34 9.5 4 4 0 0 0 6.5 19z"/><path d="m9 13 2 2 4-4"/></svg>' + (el._mini ? '<span>voltando</span>' : '<span>Nuvem principal de volta · o que ficou na reserva está voltando</span>');
        el.style.opacity = el._mini ? '.45' : '.72'; return; }
      const ic = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18h10.5a4.5 4.5 0 0 0 1.6-8.7M15.5 6.4A6 6 0 0 0 6.34 10.1 4 4 0 0 0 7 18"/><path d="m3 3 18 18"/></svg>';
      const r = naReserva(), r3 = naTerciaria(); el.title = (r3 ? `A nuvem principal e a reserva chegaram ao limite de hoje. Enquanto isso, o que vocês salvam vai para a nuvem terciária e tudo continua funcionando; quando a principal voltar (${horaTxt(t2)}) passa de volta sozinho.` : r ? `A nuvem principal chegou ao limite de hoje. Enquanto isso, o que vocês salvam vai para a nuvem reserva e tudo continua funcionando; quando a principal voltar (${horaTxt(t2)}) passa de volta sozinho.` : MSG) + ' (clique para encolher)';
      el.style.borderColor = r3 ? 'rgba(255,143,209,.6)' : r ? 'rgba(47,208,168,.55)' : 'rgba(255,255,255,.12)'; el.style.color = r3 ? '#ffc2e6' : r ? '#9df0db' : '#cfd3dc'; // reserva = verde-água · terciária = rosa
      el.innerHTML = ic + (el._mini ? `<span>${r3 ? 'terciária · ' : r ? 'reserva · ' : ''}${falta(t2)}</span>` : r3 ? `<span>Usando a nuvem terciária · a principal volta em <b style="font-weight:600">${falta(t2)}</b> (${hh(t2)})</span>` : r ? `<span>Usando a nuvem reserva · a principal volta em <b style="font-weight:600">${falta(t2)}</b> (${hh(t2)})</span>` : `<span>Nuvem no limite de hoje · volta em <b style="font-weight:600">${falta(t2)}</b> (${hh(t2)})</span>`); el.style.opacity = el._mini ? '.45' : '.72'; };
    const pinta = () => { pinta0(); // + relatório de suporte (só gera o arquivo; não muda nada da nuvem)
      if (el && !el._mini && window.EstudioSuporte && !el.querySelector('.ep-sup-mini')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'ep-sup-mini'; b.textContent = 'Relatório de suporte';
        b.title = window.EstudioSuporte.DICA + ' · versão ' + (window.EstudioVersao?.nome || ''); b.style.cssText = 'margin-left:4px;padding:1px 8px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:inherit;font:inherit;font-size:11px;cursor:pointer;border-radius:999px';
        b.onclick = e => { e.stopPropagation(); window.EstudioSuporte.gerar(); }; el.appendChild(b); } };
    el._pinta = pinta; pinta(); if (!iv) iv = setInterval(() => el?._pinta?.(), 10e3);
  }
  const f0 = window.fetch?.bind(window); if (!f0) return;
  /* PORTA RESERVA (decisão do dono, 02/11/2026): a conta principal passou dos pedidos do dia (erro 1027 da Cloudflare: o porteiro e o
     turma-ia param até as 21h). Quem está com o Estúdio aberto vai sozinho para o MESMO lugar na porta reserva (outra conta, outro
     endereço), que usa a cópia de segurança e grava na nuvem reserva. Só neste computador = o navegador guarda separado por endereço. */
  const PRINCIPAL = 'estudio.problemsraiz.workers.dev', PORTA = 'https://estudio-reserva.editorcustomizado.workers.dev';
  let portaJa = false;
  async function confere1027(r) {
    if (portaJa || location.hostname !== PRINCIPAL) return;
    if (!r) { try { r = await f0('/favicon.svg?_p=' + Date.now(), { cache: 'no-store' }); } catch { return; } }
    if (!r || r.status !== 429) return; let t = ''; try { t = await r.clone().text(); } catch { }
    if (!/1027|rate limited|plan limits/i.test(t)) return; portaJa = true; vaiPraPorta();
  }
  function vaiPraPorta() {
    const v = new Date(); v.setUTCHours(24, 0, 0, 0); const fr = window.EstudioPasse?.fragmento?.() || '', alvo = PORTA + location.pathname + location.search + '#' + (fr ? fr + '&' : '') + 'ep-1027=' + (+v); let n = 5;
    const o = document.createElement('div'); o.id = 'ep-porta-reserva'; o.setAttribute('role', 'alertdialog');
    o.innerHTML = '<div class="pr-c"><div class="pr-sp" aria-hidden="true">' + '<i></i>'.repeat(5) + '</div><b>Abrindo a porta reserva</b><span>O Estúdio passou do limite de pedidos de hoje e volta às 21h. Enquanto isso, tudo da nuvem continua pela reserva.</span><span class="pr-n"></span><button type="button" data-ficar>Ficar aqui</button><div class="pr-sup"></div></div>';
    const st = document.createElement('style'); st.textContent = '#ep-porta-reserva{position:fixed;inset:0;z-index:2147483647;background:rgba(8,9,12,.5);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);display:flex;align-items:center;justify-content:center;font:14px/1.5 \'Segoe UI\',system-ui,sans-serif;color:#f1f2f4;padding:16px}#ep-porta-reserva .pr-c{display:grid;justify-items:center;gap:8px;max-width:380px;text-align:center}#ep-porta-reserva b{font-size:17px;font-weight:600;margin-top:14px}#ep-porta-reserva span{font-size:12.5px;color:#a3a7ae}#ep-porta-reserva button{margin-top:8px;padding:8px 18px;border-radius:999px;background:rgba(255,255,255,.1);color:#f1f2f4;border:1px solid rgba(255,255,255,.16);font:500 13px inherit;cursor:pointer}'
      + '#ep-porta-reserva .pr-sp{position:relative;width:46px;height:46px}#ep-porta-reserva .pr-sp i{position:absolute;inset:0;opacity:0;animation:epPrGira 4.4s infinite}#ep-porta-reserva .pr-sp i::after{content:\'\';position:absolute;top:0;left:50%;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:#fff}'
      + [0, 1, 2, 3, 4].map(k => `#ep-porta-reserva .pr-sp i:nth-child(${k + 1}){animation-delay:${(k * .22).toFixed(2)}s}`).join('')
      + '@keyframes epPrGira{0%{transform:rotate(180deg);opacity:1;animation-timing-function:ease-out}7%{transform:rotate(300deg);animation-timing-function:linear}30%{transform:rotate(470deg);animation-timing-function:ease-in-out}39%{transform:rotate(645deg);animation-timing-function:linear}70%{transform:rotate(770deg);animation-timing-function:ease-out}75%{transform:rotate(900deg);opacity:1}76%,100%{transform:rotate(900deg);opacity:0}}@media (prefers-reduced-motion:reduce){#ep-porta-reserva .pr-sp i{animation-duration:8s}}';
    document.head.appendChild(st); document.body.appendChild(o);
    try { window.EstudioSuporte?.poe(o.querySelector('.pr-sup')); } catch { } // relatório de suporte + versão (não muda nada da troca)
    const pn = o.querySelector('.pr-n'), tick = () => { if (window.EstudioSuporte?.aberto) return; /* janela do relatório aberta: a contagem espera */ pn.textContent = n > 0 ? `em ${n} s…` : 'abrindo…'; if (n-- <= 0) { clearInterval(iv); location.href = alvo; } }, iv = setInterval(tick, 1000); tick();
    o.querySelector('[data-ficar]').onclick = () => { clearInterval(iv); o.remove(); window.EstudioSuporte?.tira?.(); };
  }
  // na porta reserva: selo discreto embaixo à direita; depois das 21h (a principal voltou) vira o link de volta
  if (location.hostname !== PRINCIPAL && /^estudio-reserva\./.test(location.hostname)) addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('a'); b.id = 'ep-na-porta'; b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:2147483000;padding:6px 12px;border-radius:999px;background:rgba(10,12,18,.85);border:1px solid rgba(255,143,209,.5);color:#ffc2e6;font:500 12px system-ui,sans-serif;text-decoration:none';
    // a hora em que a principal volta (00:00 UTC = 21h de Brasília) fica guardada desta aba: depois dela o selo vira o link de volta
    // veio pela troca automática (erro 1027 na principal): até a hora de voltar mostra a hora; aberta direto: já mostra o link de volta
    let volta = 0; try { volta = +sessionStorage.getItem('ep-porta-volta') || 0; } catch { }
    const m1027 = location.hash.match(/(?:^#|&)ep-1027=(\d+)/); if (m1027) { volta = +m1027[1]; try { sessionStorage.setItem('ep-porta-volta', String(volta)); history.replaceState(history.state, '', location.pathname + location.search + location.hash.replace(/(^#|&)ep-1027=\d+/, '$1').replace(/^#&?$/, '')); } catch { } }
    const pinta = () => { const ja = Date.now() >= volta;
      b.textContent = ja ? 'A principal voltou · voltar para o endereço de sempre' : 'Porta reserva · a principal volta às ' + new Date(volta).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (ja) { b.href = 'https://' + PRINCIPAL + location.pathname + location.search; b.onclick = () => { const fr = window.EstudioPasse?.fragmento?.(); if (fr) b.href = 'https://' + PRINCIPAL + location.pathname + location.search + '#' + fr; }; } else b.removeAttribute('href'); };
    pinta(); setInterval(pinta, 60e3); document.body.appendChild(b); });
  /* AS NUVENS TRABALHANDO JUNTAS (pedido da dona, 05/11/2026): o turma-reserva (outra conta da Cloudflare) lê e grava no MESMO
     banco da principal (a "ponte", no servidor). Quando a principal gasta muito dos pedidos do dia, o servidor manda a parte a
     desviar no cabeçalho x-divide (0 a 1); cada navegador tem um número sorteado uma vez (ep-sorte) e, se ele for menor que a
     parte, os pedidos de DADOS vão pelo turma-reserva. Se a principal não responder, o mesmo pedido é repetido lá. A IA não muda. */
  const T_PRI = 'turma-ia.problemsraiz.workers.dev', T_RES = 'turma-reserva.editorcustomizado.workers.dev';
  // TODOS os programas e rotas novas usam as 3 juntas (pedido da dona, 05/11/2026): só NÃO divide o que depende de algo que existe
  // apenas na principal (IA e o gasto dela, transcrição, login ao vivo /quem, chave do app, robôs, reserva e o painel do ADM)
  const NAO_DIV = /^\/(v1|transcrever|uso|tt|yt|quem|app-key|permissoes|nuvem-(uso|resumo|painel)|robo|reserva|confere|dublar)(\/|$)/;
  const ROTAS_DIV = { test: p => p !== '/' && !NAO_DIV.test(p) };
  const sorte = (() => { try { let v = parseFloat(localStorage.getItem('ep-sorte')); if (!(v >= 0 && v < 1)) { v = Math.random(); localStorage.setItem('ep-sorte', String(v)); } return v; } catch { return Math.random(); } })();
  const parteDiv = () => { try { const o = JSON.parse(localStorage.getItem('ep-divide') || 'null'); return o && o.ate > Date.now() ? +o.p || 0 : 0; } catch { return 0; } };
  const guardaDiv = p => { if (!(p >= 0 && p <= 1)) return; try { const fim = new Date(); fim.setUTCHours(24, 0, 0, 0); localStorage.setItem('ep-divide', JSON.stringify({ p, ate: Math.min(Date.now() + 15 * 60e3, fim.getTime()) })); } catch { } };
  const paraReserva = u => { try { const x = new URL(u, location.href); if (x.hostname !== T_PRI || !ROTAS_DIV.test(x.pathname)) return null; x.hostname = T_RES; x.searchParams.set('_pr', '1'); return x.href; } catch { return null; } };
  const comUrl = (input, novo) => typeof input === 'string' || input instanceof URL ? novo : new Request(novo, input);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (!nosso(url)) return f0(input, init);
    let r;
    // AS NUVENS JUNTAS (05/11/2026): pedido de DADOS para a principal vai pela outra porta quando é a vez deste navegador (x-divide)
    const alt = paraReserva(url), repete = alt && typeof input === 'string' && !(init?.body instanceof ReadableStream);
    const vai = alt && sorte < parteDiv() ? comUrl(input, alt) : input;
    try { r = await f0(vai, init);
      // 06/11/2026: a outra porta não deu conta (erro do servidor dela): o mesmo pedido volta para a principal, sem a pessoa perceber
      if (vai !== input && repete && r.status >= 500 && r.status !== 507) { try { const r2 = await f0(input, init); if (r2.status < 500) r = r2; } catch { } }
    }
    catch (e) {
      if (vai !== input && repete && e?.name !== 'AbortError') { try { r = await f0(input, init); } catch { } } // a outra porta não respondeu: tenta a principal
      // a principal não respondeu (ex.: erro 1027, acabaram os pedidos do dia): o mesmo pedido vai pela outra porta, sem a pessoa perceber
      if (repete && vai === input && e?.name !== 'AbortError') { try { r = await f0(alt, init); guardaDiv(1); } catch { } }
      if (!r) {
        if (e?.name === 'AbortError' || !/fetch|network|load failed/i.test(String(e?.message))) throw e;
        confere1027(null); // pedido para a nossa nuvem falhou: será o erro 1027 (conta principal sem pedidos)? confere no próprio endereço
        try { window.EstudioDiario?.pedido(url, null, e?.message || 'sem resposta'); } catch { } // diário local (relatório de suporte)
        if (navigator.onLine === false) throw new TypeError('Sem internet agora. O que você fez continua guardado neste computador.');
        throw new TypeError(marcado() ? MSG : MSG_TALVEZ);
      }
    }
    if (r.status === 429 && repete && vai === input) { try { const r2 = await f0(alt, init); if (r2.status !== 429) { r = r2; guardaDiv(1); } } catch { } }
    { const xd = r.headers.get('x-divide'); if (xd != null && xd !== '') guardaDiv(+xd); }
    try { window.EstudioDiario?.pedido(url, r); } catch { } // diário local: status e rota (sem dados) + x-nuvem
    if (r.status === 429) confere1027(r);
    const xn = r.headers.get('x-nuvem'); // o servidor usou a nuvem reserva (ou está no limite)
    if (!xn && r.ok && voltando() && /^turma-ia\./.test((() => { try { return new URL(url, location.href).hostname; } catch { return ''; } })())) { try { localStorage.removeItem(KV); } catch { } selo(); } // o servidor respondeu normal: não tem mais nada voltando, o aviso sai na hora (sem F5)
    if (xn === 'voltando') { const tinha = !!le(); try { localStorage.removeItem(K); localStorage.setItem(KV, String(Date.now() + 90e3)); } catch { } selo(); if (tinha) avisaCirculo(); } // a principal já voltou (o que sobrou na reserva está voltando para ela)
    else if (xn) marca(Date.parse(r.headers.get('x-nuvem-volta') || ''), xn === 'terciaria' ? 2 : xn === 'reserva' ? 1 : (xn === 'limite' && naReserva() && r.ok ? nivel() : 0));
    // o servidor da nuvem respondeu NORMAL (sem x-nuvem): a marca "só limite" (nível 0, sem reserva em uso) sai na hora —
    // antes ela ficava presa neste navegador até as 21h, mesmo atualizando a página
    else if (r.ok && le() && !naReserva()) { try { const h = new URL(url, location.href).hostname; if (/^turma-ia\./.test(h)) { localStorage.removeItem(K); selo(); avisaCirculo(); } } catch { } }
    if (r.status === 503 || r.status === 429) {
      const tipo = r.headers.get('content-type') || '';
      if (/json/.test(tipo)) { try { const j = await r.clone().json(); if (j?.error?.type === 'limite_cloudflare') { if (j.error.nuvem === 'sons') { const v = Date.parse(j.error.volta) > Date.now() ? Date.parse(j.error.volta) : proxima(); try { localStorage.setItem(KS, String(v)); } catch { } selo(); return new Response(JSON.stringify({ ...j, erro: MSG_SONS(v), error: { ...j.error, message: MSG_SONS(v) } }), { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8' } }); } marca(Date.parse(j.error.volta), false);
          // a frase do servidor diz "21h (horário de Brasília)": troca pela hora do relógio deste computador
          const v = Date.parse(j.error.volta) > Date.now() ? Date.parse(j.error.volta) : proxima(), m2 = String(j.error.message || '').replace(/às 21h \(horário de Brasília\)/g, 'às ' + horaTxt(v));
          if (m2 !== j.error.message) return new Response(JSON.stringify({ ...j, error: { ...j.error, message: m2 } }), { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8' } }); } } catch { } }
      else if (!/event-stream/.test(tipo)) { // página de limite da própria Cloudflare (HTML): vira o mesmo aviso
        const txt = await r.clone().text().catch(() => '');
        if (/1027|limit|exceeded|rate.?limit/i.test(txt) && !/1102|exceeded resources/i.test(txt)) { marca(); return new Response(JSON.stringify({ error: { type: 'limite_cloudflare', message: MSG } }), { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8' } }); }
      }
    }
    // ERROS EXPLICADOS (pedido do dono, 04/11/2026): a página de erro da própria Cloudflare (HTML, sem frase nossa) vira uma frase
    // que diz o que houve e o que fazer — os programas mostram error.message em vez de "erro 503"
    if (r.status >= 500 && !/json|event-stream/.test(r.headers.get('content-type') || '')) {
      const s = r.status, txt = await r.clone().text().catch(() => ''), sobrecarga = s === 502 || s === 503 || s === 504 || s >= 520 || /1102|exceeded resources|timed? ?out/i.test(txt);
      const msg = sobrecarga ? `A nuvem ficou sobrecarregada por um instante e não conseguiu responder (erro ${s}). Isso costuma passar sozinho: tente de novo em alguns segundos. Nada foi perdido.`
        : `A nuvem teve um problema inesperado ao fazer isso (erro ${s}). Tente de novo; se continuar, avise um ADM. O que você fez continua guardado neste computador.`;
      return new Response(JSON.stringify({ error: { type: sobrecarga ? 'instavel' : 'servidor', message: msg }, erro: msg }), { status: s, headers: { 'content-type': 'application/json; charset=utf-8' } });
    }
    return r;
  };
  window.addEventListener('storage', e => { if (e.key === K || e.key === KV || e.key === KS) { selo(); avisaCirculo(); } });
  window.EstudioLimite = { marcado, naReserva, naTerciaria, nivel, voltando, marca, MSG, selo, sons, horaTxt };
  selo();
})();
(() => {
  if (window.EstudioConta || window.ESTUDIO_EMBED) return; // ESTUDIO_EMBED: a Minha conta aberta dentro de outro programa (só a janela)
  const CFG = window.ESTUDIO_CONTA || {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = d => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  // mesmos ícones de linha do menu
  const ICONES = {
    seta: svg('<path d="m9 6 6 6-6 6"/>'),
    nuvem: svg('<path d="M7 18h10.5a4.5 4.5 0 0 0 .5-8.97A6 6 0 0 0 6.34 10.1 4 4 0 0 0 7 18z"/>'),
    adm: svg('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>'),
    chave: svg('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'),
    inicio: svg('<path d="m3 10.5 9-7 9 7V20a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 20z"/>'),
    msg: svg('<path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.55L3.5 20.5l1-4.3A8.5 8.5 0 1 1 20.5 12z"/>'),
    equipe: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2a5 5 0 0 1 5.5 5.3"/>'),
    enviar: svg('<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4z"/>'),
    arquivo: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
    baixar: svg('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>'),
    lapis: svg('<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>'),
    ok: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    tk1: '<svg viewBox="0 0 16 11" width="15" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6 6.3 8.8 12.5 2.2"/></svg>',
    tk2: '<svg viewBox="0 0 16 11" width="15" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 6 3.8 8.8 10 2.2"/><path d="M7 7.6 8.3 8.8 14.5 2.2"/></svg>',
    mais: svg('<path d="M12 5v14M5 12h14"/>'),
    bandeira: svg('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
    alerta: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4"/><path d="M12 17v.1"/>'),
    fechar: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    voltar: svg('<path d="m15 18-6-6 6-6"/>'),
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
.ep-conta-fw{position:relative;display:inline-grid;flex:none;isolation:isolate}.ep-conta-fw>.ep-conta-btn{position:relative;z-index:1}.ep-conta-fw::before{z-index:0}.ep-conta-fw>i{z-index:2}.ep-conta-fw>i{display:none}
.ep-conta-fw::before{content:'';position:absolute;inset:-3px;border-radius:50%;display:none;pointer-events:none}
.ep-conta.ep-novo .ep-conta-fw::before{display:block;background:#b46cff;box-shadow:0 0 12px rgba(180,108,255,.55)}
.ep-conta.ep-msg .ep-conta-fw::before{display:block;background:#ffcc33;box-shadow:0 0 12px rgba(255,204,51,.5)}
.ep-conta.ep-mencao .ep-conta-fw::before{display:block;background:#ff4d5e;box-shadow:0 0 12px rgba(255,77,94,.55)}
.ep-conta.ep-novo.ep-mencao .ep-conta-fw::before{background:conic-gradient(#b46cff 0 50%,#ff4d5e 0 100%)}
.ep-conta-fw>i.a{display:none;bottom:-4px;right:-5px;width:auto;min-width:12px;height:14px;padding:0 2px;border-radius:8px;background:#ff4d5e;color:#fff;font:800 10px/14px 'Segoe UI',system-ui,sans-serif;font-style:normal;text-align:center}
.ep-conta.ep-mencao .ep-conta-fw>i.a{display:block}
.ep-conta-fw>i.d{display:none;top:-4px;left:-5px;right:auto;width:14px;height:14px;padding:0;border-radius:50%;background:#ff4d5e;color:#fff;font:900 10px/14px 'Segoe UI',system-ui,sans-serif;font-style:normal;text-align:center;box-sizing:content-box}
.ep-conta.ep-denuncia .ep-conta-fw>i.d{display:block}
.ep-conta-pop .it.denun,.ep-conta-pop .it.denun svg{color:#ff8a96}.ep-conta-pop .it.denun{background:rgba(255,77,94,.14);box-shadow:inset 0 0 0 1px rgba(255,77,94,.45)}.ep-conta-pop .it.denun small{display:block;font-size:11px;color:#ff9aa4;font-weight:500}.ep-conta.ep-mencao:not(.ep-novo) .ep-conta-fw>i.a{top:-4px;bottom:auto}
.ep-conta.ep-novo.ep-msg .ep-conta-fw::before{background:conic-gradient(#b46cff 0 50%,#ffcc33 0 100%);box-shadow:0 0 12px rgba(220,160,140,.5)}
.ep-conta-fw>i{position:absolute;right:-3px;width:11px;height:11px;border-radius:50%;border:2px solid #1b1c21;pointer-events:none;animation:epNovo 1.8s ease-in-out infinite;box-sizing:content-box}
.ep-conta-fw>i.v{top:-3px;background:#b46cff}.ep-conta-fw>i.m{bottom:-3px;background:#ffcc33}
.ep-conta.ep-novo .ep-conta-fw>i.v,.ep-conta.ep-msg .ep-conta-fw>i.m{display:block}
.ep-conta.ep-msg:not(.ep-novo) .ep-conta-fw>i.m{top:-3px;bottom:auto}
@keyframes epNovo{50%{box-shadow:0 0 0 4px rgba(180,108,255,.25)}}
.ep-conta-pop .it.novo,.ep-conta-pop .it.novo svg{color:#d3a8ff}.ep-conta-pop .it.novo{background:rgba(160,90,255,.16);box-shadow:inset 0 0 0 1px rgba(180,108,255,.45)}.ep-conta-pop .it.novo:hover,.ep-conta-pop .it.novo:focus-visible{background:rgba(160,90,255,.28)}
.ep-conta-pop .it.novo small{display:block;font-size:11px;color:#b98cf0;font-weight:500}
.ep-conta-pop .it.msgnova,.ep-conta-pop .it.msgnova svg{color:#ffd966}.ep-conta-pop .it.msgnova{background:rgba(255,204,51,.12);box-shadow:inset 0 0 0 1px rgba(255,204,51,.4)}.ep-conta-pop .it.msgnova:hover,.ep-conta-pop .it.msgnova:focus-visible{background:rgba(255,204,51,.22)}
.ep-conta-pop .it.msgmenc,.ep-conta-pop .it.msgmenc svg{color:#ff8a96}.ep-conta-pop .it.msgmenc{background:rgba(255,77,94,.14);box-shadow:inset 0 0 0 1px rgba(255,77,94,.45)}.ep-conta-pop .it.msgmenc small{display:block;font-size:11px;color:#ff9aa4;font-weight:500}
.ep-conta-pop .it .cont.arroba{background:#ff4d5e;color:#fff;margin-left:auto}.ep-conta-pop .it .cont.arroba+.cont{margin-left:4px}
.ep-conta-pop .it .cont{margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#ffcc33;color:#1b1c21;font-size:11.5px;font-weight:800;display:inline-grid;place-items:center;box-sizing:border-box}
.ep-conta-pop{box-sizing:border-box;line-height:1.4;position:absolute;right:0;top:42px;width:270px;background:#2b2c31;color:#e9ebef;border:1px solid #4a4c55;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.5);padding:6px;text-align:left}
.ep-conta-pop[hidden]{display:none}
.ep-conta-head{display:flex;align-items:center;gap:10px;padding:8px 8px 10px;border-bottom:1px solid #1f2024;margin-bottom:4px}
.ep-conta-head .av{width:40px;height:40px;border-radius:50%;overflow:hidden;flex:none;display:grid;place-items:center;font-weight:700;background:linear-gradient(135deg,#3d8bff,#19d3f0);color:#fff}
.ep-conta-head .av img{width:100%;height:100%;object-fit:cover}
/* fotos redondas: a imagem cobre o círculo inteiro (o CSS do programa não estica nem encolhe) e o fundo azul some quando tem foto */
.ep-conta-head .av,.ep-conta-btn,.ep-msgs .epm-av,.epa-av,.ep-quem-av,.ep-conta-pop .av{position:relative}
.ep-conta-head .av img,.ep-conta-btn img,.ep-msgs .epm-av img,.epa-av img,.ep-quem-av img{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;min-width:0!important;object-fit:cover!important;display:block!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important}
.ep-conta-head .av:has(img),.ep-conta-btn:has(img),.ep-msgs .epm-av:has(img),.epa-av:has(img),.ep-quem-av:has(img){background:#2b2c31!important}
.ep-conta-head b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ep-conta-head small{display:block;color:#a9adb7;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ep-conta-pop .it{width:100%;display:flex;align-items:center;gap:10px;background:none;border:0;padding:8px 10px;border-radius:8px;cursor:pointer;text-align:left;color:#e9ebef;text-decoration:none;font-size:13.5px;line-height:1.3}
.ep-conta-pop .it:hover,.ep-conta-pop .it:focus-visible{background:#3a3c43;outline:none}
.ep-conta-pop .it svg{flex:none;width:16px;height:16px;color:#a9adb7}
.ep-chave{display:inline-grid;place-items:center;vertical-align:-2px;margin-left:5px;width:15px;height:15px;border-radius:4px;background:linear-gradient(135deg,#3d8bff,#19d3f0);color:#fff;font-style:normal;flex:none}.ep-chave svg{width:10px;height:10px;stroke-width:2.4}.ep-conta-head b{display:flex;align-items:center;gap:6px}.ep-selo{display:inline-grid;place-items:center;flex:none;width:18px;height:18px;border-radius:6px;background:linear-gradient(135deg,#3d8bff,#19d3f0);color:#fff;font-style:normal}.ep-selo svg{width:12px;height:12px}
.ep-conta-pop .sep{height:1px;background:#1f2024;margin:4px 0}
.ep-conta-pop .it.sair,.ep-conta-pop .it.sair svg{color:#ff8a9a}.ep-conta-pop .it.sair:hover,.ep-conta-pop .it.sair:focus-visible{background:rgba(214,58,82,.16)}
.ep-pg{position:fixed;inset:0;z-index:2147483003;background:rgba(0,0,0,.6);display:grid;place-items:center;padding:16px;font:14px/1.45 'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;color:#e9ebef;animation:epPgF .16s ease-out both}
.ep-pg *,.ep-pg *::before{box-sizing:border-box}
.ep-gira{display:inline-block;width:13px;height:13px;margin-right:8px;vertical-align:-2px;border:2px solid rgba(255,255,255,.25);border-top-color:#3d8bff;border-radius:50%;animation:epGira .7s linear infinite}@keyframes epGira{to{transform:rotate(360deg)}}
.ep-pg .cx{width:min(400px,100%);box-sizing:border-box;background:#2b2c31;border:1px solid #4a4c55;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.55);padding:22px 20px 18px;display:grid;justify-items:center;gap:8px;text-align:center;animation:epPgE .18s ease-out both}
.ep-pg .ic{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:rgba(214,58,82,.16);color:#ff8a9a}.ep-pg .ic svg{width:22px;height:22px}
.ep-pg .t{font-size:17px;font-weight:700}.ep-pg .x{margin:0 0 4px;color:#a9adb7;font-size:13.5px}
.ep-pg .quem{display:flex;align-items:center;gap:10px;text-align:left;padding:8px 12px;border:1px solid #3a3c43;border-radius:12px;width:100%}
.ep-pg .quem .av{width:36px;height:36px;border-radius:50%;overflow:hidden;flex:none;display:grid;place-items:center;font-weight:700;background:linear-gradient(135deg,#3d8bff,#19d3f0);color:#fff}.ep-pg .quem .av img{width:100%;height:100%;object-fit:cover}
.ep-pg .quem b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ep-pg .quem small{display:block;color:#a9adb7;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ep-pg .quem>span:last-child{min-width:0}
.ep-pg .acts{display:flex;gap:8px;justify-content:flex-end;width:100%;margin-top:6px}
.ep-pg button{height:32px;padding:0 14px;border-radius:8px;border:1px solid #4a4c55;background:#33353b;color:#e9ebef;cursor:pointer;font:inherit;font-size:13px}.ep-pg button:hover{background:#3a3c43}
.ep-pg .ic.azul{background:rgba(155,123,255,.16);color:#c6b4ff}.ep-pg button.sim.azul{background:#3d8bff;border-color:#3d8bff}.ep-pg button.sim.azul:hover{background:#5598ff}
.ep-conta .ep-conta-nuvem{width:34px;height:34px;flex:none;border-radius:50%;border:0;padding:0;background:none;cursor:pointer;display:grid;place-items:center;color:inherit}
.ep-conta-nuvem:hover,.ep-conta-nuvem:focus-visible{background:color-mix(in srgb,#9b7bff 16%,transparent);outline:none}
.ep-esp.nuvem .linha.aqui{border-color:#9b7bff}.ep-esp.nuvem .barra i{background:linear-gradient(90deg,#9b7bff,#c58bff)}.ep-esp details{border:1px solid #3a3c43;border-radius:10px;margin-bottom:6px;background:#26272c}
.ep-esp details>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:9px 10px}.ep-esp details>summary::-webkit-details-marker{display:none}.ep-esp details>summary b{flex:1;font-size:13.5px}
.ep-esp details .linha{margin:0 8px 6px}.ep-esp .bt.vermelho{color:#ff8f8f;border-color:#5a2c33}.ep-esp .bt.vermelho:hover{border-color:#ff6b6b;color:#ffb3b3}
.ep-esp .quem{display:inline-flex;align-items:center;gap:5px;color:#a9adb7;font-size:12px}.ep-esp .quem i{width:16px;height:16px;border-radius:50%;overflow:hidden;display:inline-grid;place-items:center;background:#3d8bff;color:#fff;font-style:normal;font-size:9px;font-weight:700}.ep-esp .quem i img{width:100%;height:100%;object-fit:cover}
.ep-pg button:disabled{opacity:.75;cursor:default}.ep-pg button.sim{background:#d63a52;border-color:#d63a52;color:#fff;font-weight:600}.ep-pg button.sim:hover{background:#e84a62}
.ep-pg button:focus-visible{outline:2px solid #3d8bff;outline-offset:2px}
@keyframes epPgF{from{opacity:0}}@keyframes epPgE{from{opacity:0;transform:scale(.97)}}
@media (prefers-reduced-motion:reduce){.ep-pg,.ep-pg .cx{animation:none}}
.ep-conta-aviso{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483001;background:#2b2c31;color:#e9ebef;border:1px solid #4a4c55;border-radius:10px;padding:10px 16px;font:13.5px/1.4 'Segoe UI',system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.4)}
.ep-conta .ep-conta-espaco{width:34px;height:34px;flex:none;border-radius:50%;border:0;padding:0;background:none;cursor:pointer;display:grid;place-items:center;color:inherit}
.ep-conta-espaco:hover,.ep-conta-espaco:focus-visible{background:color-mix(in srgb,currentColor 10%,transparent);outline:none}
.ep-msgs{position:fixed;inset:0;z-index:2147483002;background:rgba(0,0,0,.6);display:grid;place-items:center;padding:16px;font:14px/1.45 'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;color:#e9ebef}
.ep-msgs .cx{width:min(880px,100%);height:min(620px,calc(100vh - 32px));display:grid;grid-template-columns:280px 1fr;background:#2b2c31;border:1px solid #4a4c55;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.55);overflow:hidden}
.ep-msgs aside{display:flex;flex-direction:column;min-height:0;border-right:1px solid #3a3c43;background:#26272c}
.ep-msgs h2{font-size:16px;margin:0;padding:16px 16px 10px;display:flex;align-items:center;gap:9px}
.ep-msgs h3{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#8d919b;margin:12px 8px 6px;font-weight:600}
.ep-msgs .epm-lista{flex:1;overflow:auto;padding:0 8px 8px}.ep-msgs .epm-nota{color:#a9adb7;font-size:12.5px;margin:6px 8px}.ep-msgs .epm-pe{border-top:1px solid #3a3c43;margin:0;padding:10px 16px;font-size:11.5px}
.ep-msgs .epm-pes{width:100%;display:flex;align-items:center;gap:10px;padding:8px;border:0;border-radius:10px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.ep-msgs .epm-pes:hover{background:#33353b}.ep-msgs .epm-pes.epm-sel{background:#353a4a;box-shadow:inset 0 0 0 1px #3d8bff}
.ep-msgs .epm-pes .epm-tx{flex:1;min-width:0}.ep-msgs .epm-pes .epm-tx b,.ep-msgs .epm-pes .epm-tx small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ep-msgs .epm-pes .epm-tx b{font-size:13.5px}.ep-msgs .epm-pes .epm-tx small{color:#a9adb7;font-size:12px}
.ep-msgs .epm-pes.epm-tem .epm-tx b{color:#ffd966}.ep-msgs .epm-pes.epm-tem .epm-tx small{color:#e9ebef}
.ep-msgs .epm-cont{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#ffcc33;color:#1b1c21;font-size:11.5px;font-weight:800;display:inline-grid;place-items:center;box-sizing:border-box;flex:none}
.ep-msgs .epm-onde{flex:none;font-style:normal;font-size:10.5px;font-weight:600;color:#7ee0a1;background:rgba(46,204,113,.12);border:1px solid rgba(46,204,113,.3);border-radius:999px;padding:1px 7px;max-width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ep-msgs .epm-avw{position:relative;flex:none;display:inline-grid}.ep-msgs .epm-avw .epm-on{position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;border-radius:50%;background:#2ecc71;border:2px solid #26272c}
.ep-msgs .epm-av{width:34px;height:34px;border-radius:50%;overflow:hidden;flex:none;display:inline-grid;place-items:center;font-weight:700;color:#fff;background:linear-gradient(135deg,#3d8bff,#19d3f0);font-size:14px}
.ep-msgs .epm-av img{width:100%;height:100%;object-fit:cover;display:block}.ep-msgs .epm-av.epm-geral{background:linear-gradient(135deg,#9b7bff,#3d8bff)}.ep-msgs .epm-av.epm-geral svg{width:18px;height:18px}
.ep-msgs section{display:flex;flex-direction:column;min-width:0;min-height:0}
.ep-msgs header{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #3a3c43;min-height:62px;box-sizing:border-box}
.ep-msgs header .epm-tit{flex:1;min-width:0;display:flex;align-items:center;gap:10px}.ep-msgs header .epm-tit b,.ep-msgs header .epm-tit small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ep-msgs header .epm-tit small{color:#a9adb7;font-size:12px}
.ep-msgs .epm-bt{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 11px;border-radius:8px;border:1px solid #4a4c55;background:#33353b;color:#e9ebef;cursor:pointer;font:inherit;font-size:12.5px;white-space:nowrap}.ep-msgs .epm-bt:hover{border-color:#3d8bff}
.ep-msgs .epm-volta{display:none;padding:0 7px}.ep-msgs h2 .epm-x2{display:none;margin-left:auto}
.ep-msgs .epm-fala{flex:1;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:3px}
.ep-msgs .epm-m .epm-av.epm-avvz{background:none}
.ep-msgs .epm-fala .epm-vazio{margin:auto;color:#8d919b;text-align:center;max-width:300px}
.ep-msgs .epm-dia{text-align:center;margin:12px 0 8px}.ep-msgs .epm-dia span{font-size:11.5px;color:#a9adb7;background:#33353b;border-radius:999px;padding:3px 10px;text-transform:capitalize}
.ep-msgs .epm-m{display:flex;align-items:flex-end;gap:8px;max-width:78%;margin-top:6px}.ep-msgs .epm-m.epm-junto{margin-top:0}.ep-msgs .epm-m .epm-av{width:28px;height:28px;font-size:12px}.ep-msgs .epm-m .epm-av.epm-vazio{background:none}
.ep-msgs .epm-m .epm-b{background:#3a3c43;border-radius:14px 14px 14px 4px;padding:7px 11px 5px;min-width:0}.ep-msgs .epm-m .epm-b b{display:block;font-size:12px;color:#8cc4ff;margin-bottom:1px}
.ep-msgs .epm-m .epm-b p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.ep-msgs .epm-m .epm-b a{color:#8cc4ff}.ep-msgs .epm-m time{display:block;text-align:right;font-size:10.5px;color:#a9adb7;margin-top:1px}
.ep-msgs .epm-m.epm-meu{align-self:flex-end}.ep-msgs .epm-m.epm-meu .epm-b{background:#2f6fe0;border-radius:14px 14px 4px 14px}.ep-msgs .epm-m.epm-meu time{color:#cfe0ff}.ep-msgs .epm-m.epm-meu .epm-b a{color:#fff}
.ep-msgs .epm-cita{display:flex;gap:10px;align-items:stretch;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.12);border-left:3px solid #9b7bff;border-radius:10px;padding:7px;margin:3px 0 5px;cursor:pointer;max-width:340px;text-align:left}
.ep-msgs .epm-cita:hover{background:rgba(0,0,0,.32);border-color:rgba(155,123,255,.7)}.ep-msgs .epm-cita:focus-visible{outline:2px solid #9b7bff}
.ep-msgs .epm-cmini{width:64px;height:64px;flex:none;border-radius:7px;overflow:hidden;display:grid;place-items:center;background:#1f2025;color:#a9adb7}.ep-msgs .epm-cmini img{width:100%;height:100%;object-fit:cover;display:block}.ep-msgs .epm-cmini svg{width:24px;height:24px}
.ep-msgs .epm-ctx{min-width:0;display:flex;flex-direction:column;justify-content:center;gap:1px}.ep-msgs .epm-ctx small{font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;color:#c4b2ff;font-weight:600}.ep-msgs .epm-ctx b{font-size:13.5px;color:#fff;margin:0!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ep-msgs .epm-ctx span{font-size:12px;color:#d0d3da;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ep-msgs .epm-ctx em{font-style:normal;font-size:11.5px;color:#c4b2ff;font-weight:600;margin-top:2px}
.ep-msgs .epm-m.epm-meu .epm-cita{background:rgba(0,0,0,.2);border-color:rgba(255,255,255,.25);border-left-color:#fff}.ep-msgs .epm-m.epm-meu .epm-ctx small,.ep-msgs .epm-m.epm-meu .epm-ctx em{color:#e3ecff}
.ep-msgs .epm-cbaixa{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:#a9c8ff;text-decoration:none;margin:0 0 3px}.ep-msgs .epm-m.epm-meu .epm-cbaixa{color:#e3ecff}.ep-msgs .epm-cbaixa:hover{text-decoration:underline}.ep-msgs .epm-cbaixa svg{width:13px;height:13px}
.ep-msgs .epm-cita.epm-mini{cursor:default;padding:0;border:0;background:none;margin:0;max-width:none}.ep-msgs .epm-cita.epm-mini>.epm-cita{cursor:default;margin:0;max-width:none;flex:1;min-width:0}.ep-msgs .epm-cita.epm-mini .epm-cmini{width:44px;height:44px}
.ep-msgs .epm-enviaPara{margin:0 12px 6px;padding:10px;border-radius:12px;background:rgba(155,123,255,.1);border:1px solid rgba(155,123,255,.35)}.ep-msgs .epm-enviaPara .epm-nota{margin:8px 0 0}
.ep-msgs .epm-citaPrev{display:flex;gap:8px;align-items:center;margin-bottom:8px}.ep-msgs .epm-citaPrev[hidden]{display:none}.ep-msgs .epm-citaPrev .epm-cita.epm-mini{flex:1;min-width:0;display:flex}.ep-msgs .epm-citaPrev .epm-tira{padding:0 8px;flex:none}
.ep-msgs .epm-escreve{flex-direction:column;align-items:stretch}.ep-msgs .epm-linhaE{display:flex;gap:8px;align-items:flex-end;width:100%}.ep-msgs .epm-linhaE textarea{width:auto;min-width:0;margin:0}
.ep-msgs .epm-enviando{align-self:center;color:#c4b2ff;font-size:12.5px;margin-top:8px}
.ep-msgs .epm-edg{flex:none;margin-left:6px}.ep-msgs .epm-edg svg{width:14px;height:14px}
.ep-msgs .cx{position:relative}.ep-msgs .epm-gedit{position:absolute;inset:0;background:rgba(0,0,0,.55);display:grid;place-items:center;z-index:2;padding:16px}
.ep-msgs .epm-gcx{width:min(380px,100%);background:#2b2c31;border:1px solid #4a4c55;border-radius:14px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.5)}.ep-msgs .epm-gcx h3{margin:0 0 12px;font-size:12px}
.ep-msgs .epm-gl{display:flex;gap:14px;align-items:center}.ep-msgs .epm-gl label{flex:1;display:grid;gap:4px;font-size:12.5px;color:#a9adb7}.ep-msgs .epm-gl input{height:34px;border-radius:8px;border:1px solid #4a4c55;background:#1f2025;color:#e9ebef;font:inherit;padding:0 10px;outline:none}.ep-msgs .epm-gl input:focus{border-color:#3d8bff}
.ep-msgs .epm-gfoto{width:64px;height:64px;border-radius:50%;border:2px dashed #6a6d78;background:linear-gradient(135deg,#9b7bff,#3d8bff);color:#fff;display:grid;place-items:center;cursor:pointer;overflow:hidden;padding:0;flex:none}.ep-msgs .epm-gfoto img{width:100%;height:100%;object-fit:cover}.ep-msgs .epm-gfoto svg{width:26px;height:26px}
.ep-msgs .epm-gbt{display:flex;gap:8px;margin-top:12px}.ep-msgs .epm-bt.epm-pri{background:#3d8bff;border-color:#3d8bff;color:#fff}.ep-msgs .epm-gerr{color:#ff9a9a}
.ep-msgs .epm-m .epm-b .epm-ctx b{color:#fff;display:block;font-size:13.5px;margin:0}.ep-msgs .epm-m .epm-b .epm-ctx small{display:inline;color:#c4b2ff}.ep-msgs .epm-m.epm-meu .epm-b .epm-ctx small{color:#e3ecff}
.ep-msgs .epm-gl .epm-av{width:56px;height:56px;font-size:20px}
.ep-msgs h2 .epm-varias{margin-left:auto;height:28px;padding:0 9px;font-size:12px}.ep-msgs h2 .epm-varias svg{width:14px;height:14px}.ep-msgs h2 .epm-varias.epm-on2{background:rgba(155,123,255,.22);border-color:#9b7bff;color:#e6dcff}
.ep-msgs h2 .epm-x2{margin-left:6px}
.ep-msgs .epm-epbt{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}.ep-msgs .epm-epbt .epm-bt{height:28px;font-size:12px;padding:0 9px}.ep-msgs .epm-epbt svg{width:14px;height:14px}
.ep-msgs .epm-lista h3{display:flex;align-items:center;gap:6px}.ep-msgs .epm-novog{margin-left:auto;display:inline-flex;align-items:center;gap:4px;border:0;background:none;color:#9ec5ff;font:inherit;font-size:11px;text-transform:none;letter-spacing:0;cursor:pointer;padding:2px 4px;border-radius:6px}.ep-msgs .epm-novog:hover{background:rgba(61,139,255,.15)}.ep-msgs .epm-novog svg{width:12px;height:12px}
.ep-msgs .epm-av.epm-grupo{background:linear-gradient(135deg,#ff9a62,#ff5f8f);border-radius:11px}.ep-msgs .epm-av.epm-grupo svg{width:18px;height:18px}
.ep-msgs .epm-gcx2{width:min(440px,100%);max-height:calc(100% - 20px);display:flex;flex-direction:column}
.ep-msgs .epm-gmemb-t{display:flex;align-items:center;gap:6px;margin:14px 0 6px;font-size:12.5px;color:#a9adb7}.ep-msgs .epm-gmemb-t .epm-bt{height:26px;font-size:12px}
.ep-msgs .epm-gmemb{overflow:auto;max-height:240px;border:1px solid #3a3c43;border-radius:10px;padding:4px;background:#26272c}
.ep-msgs .epm-gmemb label{display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:8px;cursor:pointer}.ep-msgs .epm-gmemb label:hover{background:#33353b}.ep-msgs .epm-gmemb .epm-av{width:26px;height:26px;font-size:11px}.ep-msgs .epm-gmemb input{accent-color:#9b7bff;width:16px;height:16px;margin:0}
.ep-msgs .epm-bt.epm-verm{color:#ff8f8f;border-color:#5a2c33}.ep-msgs .epm-bt.epm-verm:hover{border-color:#ff6b6b}
.ep-msgs.epm-como .epm-escreve,.ep-msgs.epm-como .epm-edg,.ep-msgs.epm-como .epm-novog,.ep-msgs.epm-como .epm-varias,.ep-msgs.epm-como .epm-denuncia{display:none!important}
.ep-msgs .epm-comoAviso{margin:0 12px 8px;padding:8px 10px;border-radius:10px;background:rgba(255,77,94,.12);border:1px solid rgba(255,77,94,.4);color:#ffc2c8;font-size:12.5px;line-height:1.4}.ep-msgs .epm-comoAviso svg{width:14px;height:14px;vertical-align:-2px;margin-right:4px}
.ep-msgs .epm-m{position:relative}.ep-msgs .epm-denuncia{align-self:center;opacity:0;border:0;background:none;color:#8d919b;cursor:pointer;padding:4px;border-radius:6px;display:grid}.ep-msgs .epm-m:hover .epm-denuncia,.ep-msgs .epm-denuncia:focus-visible{opacity:1}.ep-msgs .epm-denuncia:hover{color:#ff8a96;background:rgba(255,77,94,.12)}.ep-msgs .epm-denuncia svg{width:14px;height:14px}
.ep-msgs .epm-meu .epm-denuncia{order:-1}
@media (hover:none){.ep-msgs .epm-denuncia{opacity:.6}}
.ep-msgs .epm-bt.epm-verm2{background:#d6394b;border-color:#d6394b;color:#fff}.ep-msgs .epm-bt.epm-verm2 svg{width:14px;height:14px}
.ep-msgs .epm-apg{display:flex;align-items:center;gap:5px;font-size:12px;font-style:italic;color:#a9adb7}.ep-msgs .epm-apg svg{width:13px;height:13px}
.ep-msgs .epm-apagada .epm-b{background:transparent!important;border:1px dashed #4a4c55}.ep-msgs .epm-apagada time{color:#8d919b!important}
.ep-msgs .epm-apagadaAdm .epm-b{background:rgba(255,154,60,.14)!important;border:1px dashed #ff9a3c}.ep-msgs .epm-apagadaAdm .epm-apg{color:#ffb36b;font-style:normal;font-weight:600}
.ep-msgs .epm-tk{display:inline-flex;vertical-align:-1px;margin-left:4px}.ep-msgs .epm-tk svg{display:block}.ep-msgs .epm-meu .epm-tk-enviada,.ep-msgs .epm-meu .epm-tk-recebida{color:#cfe0ff;opacity:.75}.ep-msgs .epm-meu .epm-tk-lida{color:#7ff0ff}
.ep-msgs .epm-carr,.epa-carr{margin:auto;display:grid;justify-items:center;gap:6px;padding:22px 10px;color:#a9adb7;font-size:12px}.ep-msgs .epm-lista .epm-carr{margin:20px auto}
.ep-msgs .epm-cb{width:160px;height:4px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden;position:relative}.ep-msgs .epm-cb i{position:absolute;top:0;bottom:0;left:0;border-radius:4px;background:linear-gradient(90deg,#3d8bff,#19d3f0);transition:width .2s linear}
.ep-msgs .epm-ct2{display:flex;gap:7px;align-items:baseline;max-width:240px}.ep-msgs .epm-ct2 b{color:#cfd3da;font-variant-numeric:tabular-nums}.ep-msgs .epm-ct2 span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ep-msgs .epm-pend{opacity:.62}.ep-msgs .epm-pend .epm-b{min-width:120px}.ep-msgs .epm-pbar{height:3px;border-radius:3px;background:rgba(255,255,255,.25);overflow:hidden;margin:6px 0 2px;position:relative}.ep-msgs .epm-pbar i{position:absolute;top:0;bottom:0;left:0;background:#fff;border-radius:3px;transition:width .2s linear}
.ep-msgs .epm-pend time{white-space:nowrap}.ep-msgs .epm-pend time b{font-variant-numeric:tabular-nums;font-weight:700}.ep-msgs .epm-falhou{opacity:1}.ep-msgs .epm-falhou .epm-b{background:#5a2c33!important}.ep-msgs .epm-perr{font-size:12px;color:#ffc2c8;margin-top:4px}.ep-msgs .epm-pbt{display:flex;gap:6px;margin-top:6px}.ep-msgs .epm-pbt .epm-bt{height:26px;font-size:12px}
.ep-msgs .epm-ck{width:18px;height:18px;flex:none;border-radius:5px;border:1.5px solid #6a6d78;display:grid;place-items:center;color:#fff}.ep-msgs .epm-alvo .epm-ck{background:#9b7bff;border-color:#9b7bff}.ep-msgs .epm-ck svg{width:13px;height:13px}
.ep-msgs .epm-pes.epm-alvo{background:rgba(155,123,255,.16);box-shadow:inset 0 0 0 1px rgba(155,123,255,.6)}
.ep-msgs .epm-m .epm-b p .epm-ment{display:inline;font-size:inherit;margin:0;color:#9ec5ff;font-weight:700;background:rgba(61,139,255,.16);border-radius:5px;padding:0 3px}.ep-msgs .epm-m .epm-b p .epm-ment.epm-eu{color:#fff;background:#d6394b}
.ep-msgs .epm-m.epm-meu .epm-b p .epm-ment{color:#fff;background:rgba(255,255,255,.2)}
.ep-msgs .epm-prame .epm-b{box-shadow:inset 3px 0 0 #ff4d5e}
.ep-msgs .epm-cont.epm-arroba{background:#ff4d5e;color:#fff}
.ep-msgs .epm-sugere{position:absolute;left:12px;right:12px;bottom:calc(100% + 4px);max-height:220px;overflow:auto;background:#2b2c31;border:1px solid #4a4c55;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.45);padding:4px;z-index:3}
.ep-msgs .epm-sugere button{width:100%;display:flex;align-items:center;gap:8px;padding:6px 8px;border:0;border-radius:8px;background:none;color:#e9ebef;font:inherit;font-size:13px;cursor:pointer;text-align:left}.ep-msgs .epm-sugere button.epm-sel,.ep-msgs .epm-sugere button:hover{background:#353a4a}
.ep-msgs .epm-sugere .epm-av{width:24px;height:24px;font-size:11px}.ep-msgs .epm-escreve{position:relative}
.ep-msgs .epm-erro{align-self:center;color:#ff9a9a;font-size:12.5px;margin-top:8px}
.ep-msgs .epm-escreve{display:flex;gap:8px;align-items:flex-end;padding:10px 12px;border-top:1px solid #3a3c43}.ep-msgs .epm-escreve[hidden]{display:none}
.ep-msgs .epm-escreve textarea{flex:1;resize:none;min-height:38px;max-height:140px;box-sizing:border-box;border-radius:10px;border:1px solid #4a4c55;background:#1f2025;color:#e9ebef;font:inherit;padding:8px 11px;outline:none}.ep-msgs .epm-escreve textarea:focus{border-color:#3d8bff}
.ep-msgs .epm-envia{height:38px;width:42px;padding:0;background:#3d8bff;border-color:#3d8bff;color:#fff}.ep-msgs .epm-escreve.ind .epm-envia{opacity:.5}
@media (max-width:680px){.ep-msgs{padding:0}.ep-msgs .cx{grid-template-columns:1fr;height:100%;border-radius:0;border:0}.ep-msgs .cx section{display:none}.ep-msgs .cx.so-conv aside{display:none}.ep-msgs .cx.so-conv section{display:flex}.ep-msgs .epm-volta{display:inline-flex}.ep-msgs h2 .epm-x2{display:inline-flex}.ep-msgs .epm-m{max-width:88%}}
.epa-lista{display:grid;gap:12px}.epa-den-c{border-left:4px solid #6a6d78}.epa-den-c.epa-aberta{border-left-color:#ff4d5e}.epa-den-c.epa-resolvida{border-left-color:#2ecc71;opacity:.85}
.epa-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.epa-top small{color:#a9adb7}.epa-top .btn svg{width:14px;height:14px}
.epa-est{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:2px 8px;border-radius:999px;background:#3a3c43}.epa-aberta .epa-est{background:#ff4d5e;color:#fff}.epa-resolvida .epa-est{background:rgba(46,204,113,.2);color:#7ee0a1}
.epa-quem2{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:12px 0}.epa-quem2 small,.epa-motivo small{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#8d919b;margin-bottom:4px}
.epa-quem{display:flex;align-items:center;gap:8px}.epa-quem b{display:block}.epa-quem small{color:#a9adb7;font-size:12px;text-transform:none;letter-spacing:0}
.epa-av{width:30px;height:30px;border-radius:50%;overflow:hidden;flex:none;display:inline-grid;place-items:center;font-weight:700;color:#fff;background:linear-gradient(135deg,#3d8bff,#19d3f0);font-size:13px}.epa-av img{width:100%;height:100%;object-fit:cover}
.epa-motivo{margin:8px 0;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.04)}.epa-motivo p{margin:0;white-space:pre-wrap}
.epa-conv{display:grid;gap:6px;margin:8px 0}.epa-msg{border:1px solid #3a3c43;border-radius:10px;padding:7px 10px;background:#26272c}.epa-msg.epa-alvo{border-color:#ff4d5e;background:rgba(255,77,94,.1)}.epa-msg.epa-apg{border:1px dashed #ff9a3c;background:rgba(255,154,60,.12)}
.epa-mh{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:#a9adb7}.epa-mh b{color:#e9ebef}.epa-mh em{font-style:normal;color:#ffb36b;font-weight:600}.epa-mh em.epa-den{color:#ff8a96}.epa-msg p{margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}.epa-cita{font-size:12px;color:#c4b2ff;margin-top:3px}
.epa-lrow{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #3a3c43;border-radius:10px;margin-bottom:6px;flex-wrap:wrap}.epa-lrow small{color:#a9adb7}
.btn.epa-verm{color:#ff8f8f;border-color:#5a2c33}.btn.epa-verm:hover{border-color:#ff6b6b}.btn.epa-verm svg,.epa-lrow svg{width:14px;height:14px}
.epa-notaf{display:grid;gap:6px;margin-top:10px}.epa-notaf textarea{border-radius:8px;border:1px solid #4a4c55;background:#1f2025;color:#e9ebef;font:inherit;padding:8px 10px;resize:vertical}
.epa-pess{display:flex;flex-wrap:wrap;gap:8px}.epa-p{display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;border-radius:999px;border:1px solid #4a4c55;background:#2b2c31;color:#e9ebef;font:inherit;cursor:pointer}.epa-p:hover{border-color:#ff4d5e}
.ep-esp{position:fixed;inset:0;z-index:2147483002;background:rgba(0,0,0,.6);display:grid;place-items:center;padding:16px;font:14px/1.45 'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;color:#e9ebef}
.ep-esp .cx{width:min(640px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#2b2c31;border:1px solid #4a4c55;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.55);padding:20px}
.ep-esp h2{font-size:17px;margin:0 0 14px;display:flex;align-items:center;gap:10px}.ep-esp h2 .x{margin-left:auto}
.ep-esp h3{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#a9adb7;margin:18px 0 8px;font-weight:600}
.ep-nv-aviso{display:flex;gap:10px;align-items:flex-start;margin:0 0 14px;padding:10px 12px;border-radius:12px;border:1px solid rgba(47,208,168,.5);background:rgba(47,208,168,.1);font-size:13px;line-height:1.4}.ep-nv-aviso.terc{border-color:rgba(255,143,209,.55);background:rgba(255,143,209,.1)}.ep-nv-aviso svg{flex:none;width:18px;height:18px;color:#2fd0a8;margin-top:1px}.ep-nv-aviso b{display:block;font-size:13px!important}.ep-nv-aviso small{display:block;margin-top:2px}.ep-esp .topo{display:flex;gap:16px;align-items:center}.ep-esp .topo b{font-size:21px;display:block}.ep-esp small,.ep-esp .nota{color:#a9adb7;font-size:12.5px}
.ep-esp details.grp{border:1px solid #3a3c43;border-radius:12px;margin-bottom:8px;background:#232429;overflow:hidden}
.ep-esp details.grp>summary{list-style:none;display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none}.ep-esp details.grp>summary::-webkit-details-marker{display:none}
.ep-esp details.grp>summary:hover{background:#2a2b31}.ep-esp details.grp>summary b{font-size:13.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ep-esp details.grp .sp{flex:1}
.ep-esp details.grp .seta{display:inline-grid;place-items:center;width:16px;height:16px;color:#a9adb7;transition:transform .15s}.ep-esp details.grp .seta svg{width:14px;height:14px}.ep-esp details.grp[open] .seta{transform:rotate(90deg)}
.ep-esp details.grp .cnt{font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;background:#3a3c43;color:#c9ccd3}
.ep-esp .grp-l{max-height:min(320px,45vh);overflow-y:auto;padding:2px 8px 8px;scrollbar-width:thin}.ep-esp .grp-l .linha{margin:0 0 6px}
.ep-esp .linha{display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid #3a3c43;border-radius:10px;margin-bottom:6px;background:#26272c}
.ep-esp .linha.aqui{border-color:#2f6be6}
.ep-esp .linha .n{flex:1;min-width:0}.ep-esp .linha .n b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13.5px}
.ep-esp .barra{height:5px;border-radius:3px;background:#3a3c43;margin-top:5px;overflow:hidden}.ep-esp .barra i{display:block;height:100%;background:linear-gradient(90deg,#2453c4,#2f6be6)}
.ep-esp .tam{font-variant-numeric:tabular-nums;color:#c9ccd3;font-size:12.5px;white-space:nowrap}
.ep-esp img.th{width:56px;height:32px;object-fit:cover;border-radius:5px;background:#000;flex:none}
.ep-esp .bt{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border-radius:8px;border:1px solid #4a4c55;background:#33353b;color:#e9ebef;cursor:pointer;font:inherit;font-size:12.5px;white-space:nowrap;text-decoration:none}
.ep-esp .bt:hover{border-color:#3d8bff}
/* apagar do COMPUTADOR: destacado (pode clicar); apagar da NUVEM sem ser ADM: discreto (abre o aviso para pedir a um ADM) */
.ep-esp .bt.perigo{color:#fff;background:#b8324a;border-color:#d63a52;font-weight:600}.ep-esp .bt.perigo:hover{background:#d63a52;border-color:#ff6b6b;color:#fff}
.ep-esp .bt.so-adm{color:#8a8e98;background:transparent;border-color:#3a3c43;opacity:.7}.ep-esp .bt.so-adm:hover{opacity:1;border-color:#4a4c55;color:#a9adb7}.ep-esp .bt.pri{background:#3d8bff;border-color:#3d8bff;color:#fff}
.ep-esp .bt svg{width:15px;height:15px}
.ep-esp .vazio{padding:14px;text-align:center;color:#a9adb7;border:1px dashed #4a4c55;border-radius:10px}
.ep-esp .pe{display:flex;gap:8px;align-items:center;margin-top:16px;flex-wrap:wrap}.ep-esp .pe .sp{flex:1}
.ep-conta-menu span{display:none}.ep-conta .ep-conta-menu{padding:0 10px!important}
/* ===== REDESIGN (03/11/2026, aprovado pelo dono): pegada macOS — fonte do sistema, cantos maiores, azul do sistema, sem desfoque pesado.
   Só muda a cara: as regras de cima continuam valendo para o que não for trocado aqui. ===== */
.ep-conta,.ep-pg,.ep-msgs,.ep-esp,.ep-cal,.ep-notif,.ep-dock,.ep-admj{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
.ep-conta .ep-conta-btn{width:36px;height:36px;font-size:15px;box-shadow:0 0 0 2px #1b1c21}
.ep-conta-fw::before{inset:-2px}
.ep-conta .ep-conta-nuvem,.ep-conta .ep-conta-espaco{width:38px;height:38px}
.ep-conta-nuvem svg,.ep-conta-espaco svg{width:32px;height:32px}
/* ÍCONES DA CONTA IGUAIS (pedido do dono, 05/11/2026): nuvem, navegador, menu e foto com o mesmo tamanho (34 px) e o mesmo espaço entre eles */
.ep-conta{gap:6px}
.ep-conta .ep-conta-nuvem,.ep-conta .ep-conta-espaco{width:34px;height:34px}
.ep-conta .ep-conta-nuvem svg,.ep-conta .ep-conta-espaco svg{width:30px;height:30px}
.ep-conta .ep-conta-menu{width:34px;padding:0!important;justify-content:center}
.ep-conta .ep-conta-btn{width:34px;height:34px}
.ep-conta-pop{top:46px;width:280px;padding:5px;background:rgba(40,40,44,.98);border:.5px solid rgba(255,255,255,.14);border-radius:12px;box-shadow:0 0 0 .5px rgba(0,0,0,.6),0 22px 60px rgba(0,0,0,.55);animation:epPop .14s ease-out}
@keyframes epPop{from{opacity:0;transform:translateY(-4px) scale(.98)}}
.ep-conta-head{border-bottom:.5px solid rgba(255,255,255,.12);padding:8px 9px 10px}
.ep-conta-pop .it{padding:6px 9px;border-radius:6px;font-size:13px}
.ep-conta-pop .it:hover,.ep-conta-pop .it:focus-visible{background:#0a84ff;color:#fff}.ep-conta-pop .it:hover svg,.ep-conta-pop .it:hover small,.ep-conta-pop .it:focus-visible svg{color:#fff}
.ep-conta-pop .sep{background:rgba(255,255,255,.12);margin:5px 9px}
.ep-conta-pop .it.sair:hover,.ep-conta-pop .it.sair:focus-visible{background:#ff453a;color:#fff}.ep-conta-pop .it.sair:hover svg{color:#fff}
/* janelas (pergunta, espaço, nuvem, mensagens): fundo sólido escuro, cantos 14, sombra do sistema */
.ep-pg,.ep-esp,.ep-msgs{background:rgba(0,0,0,.5)}
.ep-pg .cx,.ep-esp .cx,.ep-msgs .cx{background:#1e1e21;border:.5px solid rgba(255,255,255,.12);border-radius:14px;box-shadow:0 0 0 .5px rgba(0,0,0,.6),0 24px 70px rgba(0,0,0,.6)}
.ep-pg button,.ep-esp .bt,.ep-msgs .epm-bt{border-radius:7px;border:.5px solid rgba(255,255,255,.14);background:rgba(255,255,255,.1);font-weight:500}
.ep-pg button:hover,.ep-esp .bt:hover,.ep-msgs .epm-bt:hover{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.2)}
.ep-pg button.sim.azul,.ep-msgs .epm-bt.epm-pri,.ep-msgs .epm-envia{background:linear-gradient(180deg,#2a92ff,#0a7aff);border-color:transparent;color:#fff}
.ep-pg button.sim{background:#ff453a;border-color:transparent}
.ep-pg .quem{border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.04)}
/* espaço no navegador / nuvem: listas agrupadas */
.ep-esp h2{font-size:15px}.ep-esp h3{font-size:11.5px;text-transform:none;letter-spacing:0;color:#a1a1a6;margin:16px 2px 6px}
.ep-esp .linha{border:0;border-radius:0;margin:0;background:rgba(255,255,255,.045);padding:9px 12px}
.ep-esp .linha:first-of-type{border-radius:10px 10px 0 0}.ep-esp .linha+.linha{border-top:.5px solid rgba(255,255,255,.07)}
.ep-esp .linha:last-of-type{border-radius:0 0 10px 10px}.ep-esp .linha:only-of-type{border-radius:10px}
.ep-esp .linha.aqui{background:rgba(10,132,255,.14)}.ep-esp.nuvem .linha.aqui{background:rgba(155,123,255,.14)}
.ep-esp .barra{height:6px;background:rgba(255,255,255,.1)}
.ep-esp details,.ep-esp details.grp{border:.5px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.035)}
.ep-esp details .linha,.ep-esp .grp-l .linha{border-radius:0;margin:0}
.ep-esp .vazio{border:.5px dashed rgba(255,255,255,.2)}
.ep-esp .bt.perigo{background:transparent;color:#ff6961;border-color:rgba(255,69,58,.4)}.ep-esp .bt.perigo:hover{background:rgba(255,69,58,.18)}
/* MENSAGENS: estilo do app Mensagens */
.ep-msgs .cx{width:min(980px,100%);height:min(660px,calc(100vh - 32px));grid-template-columns:300px 1fr;overflow:hidden}
.ep-msgs aside{background:rgba(0,0,0,.18);border-right:.5px solid rgba(0,0,0,.6)}
.ep-msgs h2{font-size:15px;font-weight:700;padding:14px 12px 8px}
.ep-msgs h3{font-size:11px;text-transform:none;letter-spacing:0;color:#6e6e73;margin:12px 8px 4px}
.ep-msgs .epm-pes{padding:8px 10px;border-radius:9px}.ep-msgs .epm-pes:hover{background:rgba(255,255,255,.05)}
.ep-msgs .epm-pes.epm-sel{background:#0a84ff;box-shadow:none;color:#fff}.ep-msgs .epm-pes.epm-sel small,.ep-msgs .epm-pes.epm-sel .epm-tx b{color:#fff!important}
.ep-msgs .epm-pes.epm-tem .epm-tx b{color:#fff}
.ep-msgs .epm-av{width:40px;height:40px}.ep-msgs .epm-m .epm-av{width:28px;height:28px}
.ep-msgs .epm-cont{background:#0a84ff;color:#fff}.ep-msgs .epm-pes.epm-sel .epm-cont{background:#fff;color:#0a84ff}
.ep-msgs header{border-bottom:.5px solid rgba(0,0,0,.5);background:rgba(255,255,255,.025)}
.ep-msgs section{background:rgba(0,0,0,.12)}
.ep-msgs .epm-dia span{background:none;color:#6e6e73;font-weight:500}
.ep-msgs .epm-m .epm-b{background:#3a3a3c;border-radius:18px;padding:7px 12px}
.ep-msgs .epm-m.epm-meu .epm-b{background:linear-gradient(180deg,#2a92ff,#0a7aff);border-radius:18px}
.ep-msgs .epm-prame .epm-b{box-shadow:0 0 0 1.5px #ffd60a}
.ep-msgs .epm-escreve{border-top:0;padding:10px 14px 14px}
.ep-msgs .epm-escreve textarea{border-radius:18px;background:rgba(255,255,255,.06);border:.5px solid rgba(255,255,255,.16);padding:8px 14px}
.ep-msgs .epm-envia{width:36px;height:36px;border-radius:50%}
.ep-msgs .epm-sugere,.ep-msgs .epm-gcx{background:#2c2c30;border:.5px solid rgba(255,255,255,.14);border-radius:12px}
.ep-msgs .epm-sugere button:hover{background:#0a84ff;color:#fff}
.ep-chave{background:none;color:#7cc0ff}
/* anel de carregamento estilo Windows 11 (arco que gira, cresce e diminui) — fotos e miniaturas que ainda não chegaram */
.ep-anel11,.ep-carr::after{background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='9' fill='none' stroke='%237cc0ff' stroke-width='2.6' stroke-linecap='round' stroke-dasharray='1 57'%3E%3Canimate attributeName='stroke-dasharray' values='1 57;40 57;1 57' dur='1.6s' repeatCount='indefinite'/%3E%3Canimate attributeName='stroke-dashoffset' values='0;-8;-56' dur='1.6s' repeatCount='indefinite'/%3E%3CanimateTransform attributeName='transform' type='rotate' from='0 12 12' to='360 12 12' dur='2s' repeatCount='indefinite'/%3E%3C/circle%3E%3C/svg%3E") center/contain no-repeat}
.ep-anel11{display:inline-block;width:24px;height:24px} /* nome próprio: o "anel11" do menu some sozinho quando a miniatura chega (antes esta regra o deixava sempre à vista) */
.ep-carr{position:relative}.ep-carr>img{opacity:0}.ep-carr::after{content:'';position:absolute;left:50%;top:50%;width:60%;height:60%;max-width:24px;max-height:24px;transform:translate(-50%,-50%);pointer-events:none}
/* relógio do menu + calendário pessoal + notificação na hora */
.ep-relogio{display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 12px;border:0;border-radius:8px;background:none;color:inherit;font-family:inherit;font-size:13px;font-weight:500;line-height:1;cursor:pointer;white-space:nowrap;font-variant-numeric:tabular-nums}
.ep-relogio:hover,.ep-relogio:focus-visible{background:rgba(255,255,255,.1);outline:none}.ep-relogio .dt{opacity:.65}.ep-relogio .pt{width:7px;height:7px;border-radius:50%;background:#ffcc33}
@media (max-width:820px){.ep-relogio .dt{display:none}.ep-relogio{padding:0 6px}}
.ep-cal{position:fixed;z-index:2147483004;top:52px;left:50%;transform:translateX(-50%);width:min(720px,calc(100% - 20px));max-height:calc(100% - 64px);display:grid;grid-template-columns:300px 1fr;border-radius:14px;overflow:hidden;background:#242428;color:#f5f5f7;box-shadow:0 0 0 .5px rgba(0,0,0,.6),0 24px 70px rgba(0,0,0,.6);border:.5px solid rgba(255,255,255,.12);font-size:13px;animation:epPop .16s ease-out}
.ep-cal *{box-sizing:border-box}.ep-cal button{font:inherit;color:inherit}
.ep-cal .m{padding:14px;border-right:.5px solid rgba(255,255,255,.08)}
.ep-cal .cab{display:flex;align-items:center;gap:4px;margin-bottom:10px}.ep-cal .cab b{flex:1;font-size:14px}
.ep-cal .bt{height:24px;min-width:24px;padding:0 9px;border-radius:6px;border:.5px solid rgba(255,255,255,.14);background:rgba(255,255,255,.1);cursor:pointer;font-size:12px}
.ep-cal .bt:hover{background:rgba(255,255,255,.16)}.ep-cal .bt.pri{background:linear-gradient(180deg,#2a92ff,#0a7aff);border-color:transparent;color:#fff}
.ep-cal .bt.perigo{color:#ff6961}.ep-cal .bt svg{width:13px;height:13px;vertical-align:-2px}
.ep-cal .g{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
.ep-cal .g .sem{font-size:10.5px;color:#6e6e73;padding:4px 0;font-weight:600}
.ep-cal .g button{position:relative;aspect-ratio:1;border:0;border-radius:50%;background:none;font-size:12.5px;cursor:pointer;font-variant-numeric:tabular-nums}
.ep-cal .g button:hover{background:rgba(255,255,255,.08)}.ep-cal .g button.fora{color:#6e6e73}.ep-cal .g button.hoje{color:#ff453a;font-weight:700}.ep-cal .g button.sel{background:#0a84ff;color:#fff}
.ep-cal .g .pts{position:absolute;left:50%;bottom:3px;transform:translateX(-50%);display:flex;gap:2px}.ep-cal .g .pts i{width:4px;height:4px;border-radius:50%}
.ep-cal .leg{margin:12px 2px 0;display:flex;gap:12px;flex-wrap:wrap;color:#a1a1a6;font-size:11.5px}.ep-cal .leg i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
.ep-cal .d{display:flex;flex-direction:column;min-height:0;min-width:0}
.ep-cal .dc{display:flex;align-items:center;gap:8px;padding:14px 14px 8px}.ep-cal .dc b{flex:1;font-size:14px}
.ep-cal .l{flex:1;overflow:auto;padding:0 14px 10px;display:flex;flex-direction:column;gap:8px;min-height:120px}
.ep-cal .ev{display:flex;gap:10px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.05);border-left:3px solid #ffcc33}.ep-cal .ev.meta{border-left-color:#30d158}.ep-cal .ev.alvo{box-shadow:0 0 0 1.5px #0a84ff}
.ep-cal .ev .hr{font-size:12px;color:#a1a1a6;width:40px;flex:none;font-variant-numeric:tabular-nums}.ep-cal .ev .tx{flex:1;min-width:0}.ep-cal .ev .tx b{display:block}.ep-cal .ev .tx p{margin:2px 0 4px;color:#a1a1a6;font-size:12px;-webkit-user-select:text;user-select:text}.ep-cal .ev .tx small{color:#a1a1a6;font-size:11.5px}
.ep-cal .vz{margin:auto;color:#6e6e73;font-size:12px;padding:20px 0}
.ep-cal form{padding:10px 14px 14px;border-top:.5px solid rgba(255,255,255,.08);display:grid;gap:8px}
.ep-cal input[type=text],.ep-cal input[type=time]{height:28px;background:rgba(0,0,0,.25);border:.5px solid rgba(255,255,255,.14);border-radius:6px;padding:0 9px;color:#f5f5f7;outline:none;font:inherit}
.ep-cal input:focus{border-color:#0a84ff;box-shadow:0 0 0 3px rgba(10,132,255,.35)}
.ep-cal .lin{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ep-cal .lin .sp{flex:1}.ep-cal label{display:flex;align-items:center;gap:6px;font-size:12px}
.ep-cal .seg{display:inline-flex;padding:2px;border-radius:8px;background:rgba(0,0,0,.28)}.ep-cal .seg button{height:22px;padding:0 10px;border:0;border-radius:6px;background:none;cursor:pointer;font-size:12px}.ep-cal .seg button.on{background:rgba(255,255,255,.18)}
@media (max-width:820px){.ep-cal{top:auto;bottom:0;left:0;right:0;transform:none;width:100%;max-height:88%;grid-template-columns:1fr;border-radius:14px 14px 0 0;overflow:auto}.ep-cal .m{border-right:0;border-bottom:.5px solid rgba(255,255,255,.08)}.ep-cal .g button{aspect-ratio:auto;height:36px;border-radius:9px}}
.ep-notif{position:fixed;z-index:2147483005;top:56px;right:12px;width:min(370px,calc(100% - 24px));display:flex;gap:12px;align-items:center;padding:12px;border-radius:14px;background:rgba(44,44,48,.97);color:#f5f5f7;box-shadow:0 0 0 .5px rgba(0,0,0,.6),0 18px 50px rgba(0,0,0,.55);border:.5px solid rgba(255,255,255,.14);cursor:pointer;animation:epNotif .35s cubic-bezier(.2,.8,.2,1)}
@keyframes epNotif{from{opacity:0;transform:translateX(30px)}}
.ep-notif .di{width:44px;flex:none;border-radius:9px;overflow:hidden;background:#fff;color:#1c1c1e;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.35)}
.ep-notif .di small{display:block;background:#ff453a;color:#fff;font-size:9.5px;font-weight:700;text-transform:uppercase;padding:2px 0}.ep-notif .di b{display:block;font-size:20px;line-height:26px}
.ep-notif .tx{flex:1;min-width:0}.ep-notif .tx small{display:block;font-size:11px;color:#a1a1a6}.ep-notif .tx b{display:block;font-size:13px}.ep-notif .tx span{display:block;font-size:11.5px;color:#a1a1a6;margin-top:2px}
.ep-notif .x{position:absolute;top:-7px;left:-7px;width:20px;height:20px;border-radius:50%;border:.5px solid rgba(255,255,255,.2);background:#3a3a3d;color:#a1a1a6;display:grid;place-items:center;cursor:pointer;opacity:0;padding:0}.ep-notif:hover .x{opacity:1}
/* DOCK do menu: abas do Estúdio abertas + Mensagens, Perfil e ADM */
.ep-dock{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:40;display:flex;align-items:flex-end;gap:8px;padding:8px 10px;border-radius:20px;background:rgba(40,40,44,.55);backdrop-filter:saturate(180%) blur(24px);-webkit-backdrop-filter:saturate(180%) blur(24px);border:.5px solid rgba(255,255,255,.14);box-shadow:0 10px 40px rgba(0,0,0,.35)}
.ep-dock .di{position:relative;display:block;border:0;background:none;padding:0;cursor:pointer;color:#fff;transition:transform .18s cubic-bezier(.2,.8,.2,1)}
.ep-dock .di:hover,.ep-dock .di:focus-visible{transform:translateY(-6px) scale(1.12);outline:none}
.ep-dock .ic{width:46px;height:46px;display:grid;place-items:center;border-radius:22%;overflow:hidden;font-size:19px;font-weight:700;line-height:1}.ep-dock .ic>*{width:100%;height:100%}.ep-dock .ic.fx svg{width:25px;height:25px}
.ep-dock .ic .meu{display:grid;place-items:center;background:linear-gradient(135deg,#25476d,#163449);color:#fff}.ep-dock .ic .meu svg{width:26px;height:26px}.ep-dock .ic .meu img{width:70%;height:70%;object-fit:contain}
.ep-dock .uso{position:absolute;left:7px;right:7px;bottom:5px;height:4px;border-radius:2px;background:rgba(0,0,0,.45);overflow:hidden;pointer-events:none}.ep-dock .uso::after{content:'';position:absolute;left:0;top:0;bottom:0;width:var(--u);border-radius:2px;background:var(--c)}
.ep-dock .sep{width:.5px;align-self:stretch;margin:4px 3px;background:rgba(255,255,255,.22)}
.ep-dock .n{position:absolute;top:-5px;right:-5px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#48484b;font-size:10px;font-weight:700;display:grid;place-items:center;border:1.5px solid #2a2a2d}.ep-dock .n.vm{background:#ff453a;min-width:18px;height:18px;font-size:11px}
.ep-dock [data-dica]:hover::before{content:attr(data-dica);position:absolute;bottom:calc(100% + 12px);left:50%;transform:translateX(-50%);font-size:11.5px;padding:3px 9px;border-radius:6px;background:rgba(30,30,32,.94);white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4);pointer-events:none}
@media (max-width:820px){.ep-dock{gap:6px;padding:6px 8px;border-radius:16px}.ep-dock .ic{width:40px;height:40px}}
/* ADM como janela por cima (fora do menu): a página /adm?embed=1 num quadro */
.ep-admj{position:fixed;inset:0;z-index:2147483002;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:24px;animation:epPgF .18s ease}
.ep-admj .cx{position:relative;width:min(1100px,100%);height:100%;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.6)}
/* (06/11/2026, pedido da dona) atrás da ADM: a foto de fundo padrão desfocada com o azul do menu por cima, nada de branco.
   color-scheme escuro dos dois lados: com esquemas diferentes o Chrome pinta o quadro de branco (e a barra de rolagem fica clara) */
.ep-admj .cx::before{content:'';position:absolute;inset:-40px;background:#163449 url(/fundo-margarida.jpg) center/cover;filter:blur(24px)}
.ep-admj .cx::after{content:'';position:absolute;inset:0;background:rgba(14,32,58,.55)}
.ep-admj iframe{position:relative;z-index:1;width:100%;height:100%;border:0;display:block;background:transparent;color-scheme:dark}
/* tela de carregamento da ADM no quadro: o fundo padrão do Estúdio, ícone, barrinha que anda até 100% e o selo da versão */
.ep-admj .car{position:absolute;inset:0;z-index:2;display:grid;place-items:center;background:#163449 url(/fundo-margarida.jpg) center/cover;color:#fff;transition:opacity .3s ease}
.ep-admj .car::before{content:'';position:absolute;inset:0;background:rgba(5,20,45,.45)}
.ep-admj .car.sai{opacity:0;pointer-events:none}
.ep-admj .car .c{position:relative;display:grid;justify-items:center}
.ep-admj .car .lg{width:84px;height:84px;display:grid;place-items:center;background:#0e203a;box-shadow:0 14px 40px rgba(0,0,0,.45);animation:epRespiraA 2.6s ease-in-out infinite}.ep-admj .car .lg svg{width:44px;height:44px}
.ep-admj .car .br{width:200px;height:5px;background:rgba(255,255,255,.22);margin:46px 0 12px;position:relative;overflow:hidden}.ep-admj .car .br>i{position:absolute;left:0;top:0;bottom:0;width:0;background:#e8e9ec;transition:width .2s linear}
.ep-admj .car .pc{display:flex;gap:8px;align-items:baseline;font-size:11.5px;color:rgba(255,255,255,.75)}.ep-admj .car .pc b{color:#fff;font-weight:700;font-variant-numeric:tabular-nums;min-width:34px;text-align:right}
.ep-admj .car .selo{position:absolute;right:16px;bottom:12px;height:22px;padding:0 8px;display:inline-grid;place-items:center;border:1.5px solid rgba(255,255,255,.85);background:rgba(14,32,58,.35);font:700 11px/1 'Segoe UI',system-ui,sans-serif;letter-spacing:.5px;white-space:nowrap}
@keyframes epRespiraA{50%{transform:scale(1.045)}}@media (prefers-reduced-motion:reduce){.ep-admj .car .lg{animation:none}}
@media (max-width:820px){.ep-admj{padding:0}}
/* ===== VISUAL NOVO (05/11/2026, aprovado pela dona): janelas no mesmo estilo do menu (azul escuro translúcido, cantos retos, letras finas).
   Espaço na nuvem e no computador entram pela DIREITA; seções e pastas fechadas por padrão; pasta e barra com a cor do programa dono. */
.ep-pg .cx,.ep-esp .cx,.ep-msgs .cx,.ep-cal,.ep-admj .cx{background:rgba(14,32,58,.92)!important;-webkit-backdrop-filter:blur(26px) saturate(1.3);backdrop-filter:blur(26px) saturate(1.3);border:0!important;border-radius:0!important;color:#fff}
.ep-pg,.ep-esp,.ep-msgs{background:rgba(5,20,45,.35)!important}
.ep-pg button,.ep-esp .bt,.ep-msgs .epm-bt,.ep-cal .bt{border-radius:0!important;border:2px solid rgba(255,255,255,.7)!important;background:none!important;font-weight:600!important;color:#fff}
.ep-pg button:hover,.ep-esp .bt:hover,.ep-msgs .epm-bt:hover,.ep-cal .bt:hover{background:rgba(255,255,255,.14)!important}
.ep-pg button.sim.azul,.ep-msgs .epm-bt.epm-pri,.ep-msgs .epm-envia,.ep-cal .bt.pri{background:#fff!important;color:#0d3a66!important;border-color:#fff!important}
.ep-pg button.sim{background:#d93a3a!important;border-color:#d93a3a!important}
.ep-esp .bt.perigo,.ep-esp .bt.vermelho{border-color:rgba(255,140,130,.8)!important;color:#ffd0cc!important}
.ep-esp{place-items:stretch end!important;padding:0!important}
.ep-esp .cx{width:min(460px,100%)!important;max-height:none!important;height:100%;padding:22px 22px 18px!important;animation:epEntraDir .45s cubic-bezier(.1,.9,.2,1) both}
@keyframes epEntraDir{from{transform:translateX(100%)}}
.ep-esp h2{font:300 26px/1.2 "Segoe UI Light","Segoe UI",system-ui,sans-serif!important;display:flex;align-items:center;gap:10px}
.ep-esp h3{font:400 12px/1.3 'Segoe UI',system-ui,sans-serif!important;color:rgba(255,255,255,.6)!important;text-transform:uppercase!important;letter-spacing:.8px!important;margin:18px 0 8px!important}
.ep-esp h3 small{text-transform:none;letter-spacing:0;color:rgba(255,255,255,.45)}
.ep-esp .topo b{font:300 30px "Segoe UI Light","Segoe UI",system-ui,sans-serif}
.ep-esp .linha,.ep-esp details .linha,.ep-esp .grp-l .linha{background:none!important;border:0!important;border-radius:0!important;border-top:1px solid rgba(255,255,255,.08)!important;padding:9px 6px!important;margin:0!important}
.ep-esp .linha.aqui{background:rgba(255,255,255,.07)!important}
.ep-esp .barra{height:5px!important;background:rgba(255,255,255,.18)!important;border-radius:0!important}.ep-esp .barra i{border-radius:0!important}
.ep-esp details,.ep-esp details.grp{border:0!important;border-top:1px solid rgba(255,255,255,.14)!important;border-radius:0!important;background:none!important;margin:0!important}
.ep-esp details.grp:last-of-type{border-bottom:1px solid rgba(255,255,255,.14)!important}
.ep-esp details>summary,.ep-esp details.grp>summary{display:flex;align-items:center;gap:10px;padding:12px 4px!important;background:none!important}
.ep-esp details>summary:hover{background:rgba(255,255,255,.05)!important}
.ep-esp details>summary .seta{transition:transform .3s cubic-bezier(.1,.9,.2,1)}.ep-esp details[open]>summary .seta{transform:rotate(90deg)}
.ep-esp details>summary .sp{flex:1}.ep-esp details>summary .tam{color:rgba(255,255,255,.7);font-size:12.5px}
.ep-esp details.grp .cnt{border-radius:0!important;background:rgba(255,255,255,.14)!important;color:#fff!important}
.ep-esp details[open] .grp-l,.ep-esp details[open]>.linha{animation:epAbre .35s cubic-bezier(.1,.9,.2,1) both}
@keyframes epAbre{from{opacity:0;transform:translateY(-6px)}}
.ep-pasta{width:30px;height:24px;flex:none}
.ep-estado{display:flex;gap:12px;align-items:flex-start;padding:12px;background:rgba(255,255,255,.07);margin:0 0 14px}
.ep-estado>i{width:11px;height:11px;border-radius:50%;margin-top:4px;flex:none;background:#3ccf7f;box-shadow:0 0 0 4px rgba(60,207,127,.2)}
.ep-estado b{display:block}.ep-estado small{display:block;color:rgba(255,255,255,.75)}
.ep-nv-aviso{border-radius:0!important}
.ep-leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11.5px;color:rgba(255,255,255,.6);margin:10px 0 2px}.ep-leg span{display:inline-flex;align-items:center;gap:6px}.ep-leg i{width:10px;height:10px;display:inline-block}
.ep-esp .vazio{border-radius:0!important}
/* Mensagens: abas Privadas / Grupos */
.ep-msgs .cx{box-shadow:0 30px 80px rgba(0,20,50,.5)!important}
.ep-msgs aside{background:rgba(0,0,0,.12)!important;border-right:1px solid rgba(255,255,255,.1)!important}
.ep-msgs h2{font:300 24px "Segoe UI Light","Segoe UI",system-ui,sans-serif!important}
.ep-msgs .epm-abas{position:sticky;top:0;z-index:2;display:flex;margin:0 -8px 8px;padding:0 8px;background:rgba(14,32,58,.96);border-bottom:1px solid rgba(255,255,255,.14)}
.ep-msgs .epm-abas button{flex:1;height:38px;border:0;border-bottom:3px solid transparent;margin-bottom:-1px;background:none;color:rgba(255,255,255,.7);font:400 15px "Segoe UI Light","Segoe UI",system-ui,sans-serif;cursor:pointer}
.ep-msgs .epm-abas button[aria-selected=true]{color:#fff;border-bottom-color:#fff}
.ep-msgs .epm-abas button i{font:700 11px 'Segoe UI',system-ui,sans-serif;font-style:normal;background:#fff;color:#0d3a66;padding:1px 6px;margin-left:4px;vertical-align:2px}
.ep-msgs .epm-novog{margin:10px 8px;display:inline-flex}
.ep-msgs .epm-pes{border-radius:0!important}.ep-msgs .epm-pes:hover{background:rgba(255,255,255,.07)!important}
.ep-msgs .epm-pes.epm-sel{background:#fff!important;color:#0d3a66!important}.ep-msgs .epm-pes.epm-sel small,.ep-msgs .epm-pes.epm-sel .epm-tx b{color:#0d3a66!important}
.ep-msgs .epm-cont{border-radius:0!important;background:#fff!important;color:#0d3a66!important}
.ep-msgs header{background:rgba(255,255,255,.04)!important;border-bottom:1px solid rgba(255,255,255,.1)!important}
.ep-msgs section{background:rgba(0,0,0,.1)!important}
.ep-msgs .epm-m .epm-b{border-radius:0!important;background:rgba(255,255,255,.12)!important}
.ep-msgs .epm-m.epm-meu .epm-b{background:#1d6fd6!important}
.ep-msgs textarea,.ep-msgs input{border-radius:0!important}
/* calendário */
.ep-cal{box-shadow:0 30px 80px rgba(0,20,50,.5)!important;top:0!important;right:0!important;bottom:0!important;left:auto!important;transform:none;width:min(460px,100%)!important;max-height:none!important;height:100%;grid-template-columns:1fr!important;grid-template-rows:auto 1fr;overflow:auto!important;animation:epEntraDir .45s cubic-bezier(.1,.9,.2,1) both} /* entra pela direita, como a nuvem (pedido da dona) */
.ep-cal .m{border-right:0!important;border-bottom:1px solid rgba(255,255,255,.12)!important;padding:22px 20px 16px!important}.ep-cal .d{padding:16px 20px!important;min-height:0}
.ep-cal .cab b{font:300 20px "Segoe UI Light","Segoe UI",system-ui,sans-serif}
.ep-cal .g button{border-radius:0!important}.ep-cal .g button.sel{background:#fff!important;color:#0d3a66!important}.ep-cal .g button.hoje{box-shadow:inset 0 0 0 2px #fff!important}
.ep-cal input,.ep-cal .seg,.ep-cal .seg button,.ep-cal .ev{border-radius:0!important}
.ep-notif{border-radius:0!important;background:rgba(14,32,58,.94)!important}
/* balão da conta (foto no canto) no mesmo estilo */
.ep-conta-pop{background:rgba(14,32,58,.96)!important;-webkit-backdrop-filter:blur(26px) saturate(1.3);backdrop-filter:blur(26px) saturate(1.3);border:0!important;border-radius:0!important;box-shadow:0 22px 60px rgba(0,20,50,.5)!important;color:#fff!important;padding:6px 0!important}
.ep-conta-pop .it{border-radius:0!important;padding-left:16px!important;padding-right:16px!important}
.ep-conta-pop .it:hover,.ep-conta-pop .it:focus-visible{background:rgba(255,255,255,.1)!important}
.ep-conta-pop .it.sair:hover,.ep-conta-pop .it.sair:focus-visible{background:#d93a3a!important}
.ep-conta-pop .sep{margin:6px 0!important;background:rgba(255,255,255,.12)!important}
.ep-conta-pop .av,.ep-conta-pop img{border-radius:0!important}
.ep-conta-pop b{font-weight:600}
.ep-pg .cx{position:relative}.ep-pg .pg-x{position:absolute!important;top:8px;right:8px;width:30px!important;height:30px!important;padding:0!important;border:0!important;background:none!important;color:rgba(255,255,255,.8)!important;font-size:14px;cursor:pointer}.ep-pg .pg-x:hover{background:rgba(255,255,255,.14)!important;color:#fff!important}
/* avisos, selos e a chave de ADM no visual novo (cantos retos, azul escuro) */
.ep-conta-aviso{background:rgba(14,32,58,.95)!important;border:0!important;border-radius:0!important;color:#fff!important;box-shadow:0 14px 40px rgba(0,20,50,.45)!important}
.ep-selo,.ep-chave{border-radius:0!important;background:#1d6fd6!important}
/* tudo com cantos retos nas janelas (menos ícones de programa, pontinhos de online e anéis de carregamento) */
:is(.ep-esp,.ep-msgs,.ep-cal,.ep-pg,.ep-conta-pop,.ep-notif,.ep-admj,.ep-conta-aviso) :not(svg):not(svg *):not([data-estudio-icone]):not([data-estudio-icone] *):not(.ep-conta-fw > i):not(.epm-on):not(.ep-carr):not(.ep-carr *):not(.ep-estado>i){border-radius:0!important}
/* SAÍDA com animação (pedido da dona): as janelas não somem seco */
.ep-saindo{pointer-events:none!important}
.ep-esp.ep-saindo{animation:epSome .2s ease both!important}.ep-esp.ep-saindo .cx{animation:epSaiDir .2s cubic-bezier(.4,0,1,1) both!important}
.ep-cal.ep-saindo{animation:epSaiDir .18s cubic-bezier(.4,0,1,1) both!important}
.ep-msgs.ep-saindo,.ep-pg.ep-saindo,.ep-admj.ep-saindo,.modal.ep-saindo{animation:epSome .22s ease both!important}
.ep-msgs.ep-saindo .cx,.ep-pg.ep-saindo .cx,.ep-admj.ep-saindo .cx,.modal.ep-saindo .mc{animation:epEncolhe .22s ease both!important}
.ep-conta-pop.ep-saindo,.ep-notif.ep-saindo{animation:epSome .16s ease both!important}
/* calendário: luz do Windows 10 (as bordas dos dias perto do mouse acendem; o dia embaixo do mouse ganha a borda clara) */
.ep-cal .g{position:relative;gap:2px!important;padding:2px;--mx:-200px;--my:-200px}
.ep-cal .g::before{content:"";position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .25s;background:radial-gradient(circle 80px at var(--mx) var(--my),rgba(255,255,255,.2),rgba(255,255,255,0) 100%)}
.ep-cal .g.luz::before{opacity:1}
.ep-cal .g>*{position:relative;z-index:1}
.ep-cal .g button{background:rgb(17,37,64)!important;transition:box-shadow .12s,background .12s}
.ep-cal .g button:hover{box-shadow:inset 0 0 0 1px rgba(255,255,255,.4)!important;background:radial-gradient(circle 40px at 50% 50%,rgba(255,255,255,.12),rgba(255,255,255,0)),rgb(17,37,64)!important}
.ep-cal .g button.sel{background:#fff!important;color:#0d3a66!important}
.ep-cal .g button.fora{color:rgba(255,255,255,.35)}
.ep-cal .g button.hoje:not(.sel){color:#7fc4ff!important;font-weight:700;box-shadow:inset 0 0 0 1px rgba(127,196,255,.6)!important}
.ep-cal .g .sem{background:rgb(17,37,64);padding:4px 0}
@media (prefers-reduced-motion:reduce){.ep-cal .g::before{transition:none}}
.ep-cal .g.mes-prox{animation:epMesProx .28s cubic-bezier(.1,.9,.2,1) both}.ep-cal .g.mes-ant{animation:epMesAnt .28s cubic-bezier(.1,.9,.2,1) both}.ep-cal .cab b.mes-nome{animation:epSome2 .3s ease both}
@keyframes epMesProx{from{opacity:0;transform:translateX(18px)}}@keyframes epMesAnt{from{opacity:0;transform:translateX(-18px)}}@keyframes epSome2{from{opacity:0}}
@media (prefers-reduced-motion:reduce){.ep-cal .g.mes-prox,.ep-cal .g.mes-ant,.ep-cal .cab b.mes-nome{animation:none}}
@keyframes epSaiDir{to{transform:translateX(100%)}}@keyframes epSome{to{opacity:0}}@keyframes epEncolhe{to{transform:scale(.97)}}
@media (prefers-reduced-motion:reduce){.ep-esp .cx,.ep-esp details[open] .grp-l{animation:none}}`;
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
  // a conta fica guardada nesta aba por 3 min (trocar de programa não pede de novo); "novo" (salvou a conta) busca sempre
  const CK = 'ep-conta-v1';
  const perfil = (novo) => (!novo && perfilP) || (perfilP = (async () => {
    if (!novo) { try { const c = JSON.parse(sessionStorage.getItem(CK) || 'null'); if (c && Date.now() - c.t < 180e3) return c.j; } catch { } }
    const j = await fetch('/conta', { credentials: 'same-origin', cache: 'no-store' }).then(r => r.ok && r.headers.get('x-porteiro') ? r.json() : null).catch(() => null);
    try { if (j) sessionStorage.setItem(CK, JSON.stringify({ t: Date.now(), j })); else sessionStorage.removeItem(CK); } catch { }
    return j; })());

  // janela de confirmação no visual do Estúdio Problems (no lugar do confirm() do navegador); resolve true/false
  // trabalho: async () => {...} roda ao confirmar, com o botão em "Salvando…"; se der erro, mostra e oferece seguir mesmo assim
  // RELATÓRIO DE ERRO: a janela antes de baixar (menu da conta e selo da versão no menu)
  async function pedeRelatorio() { return window.EstudioSuporte?.gerar(); } // a janela e o relatório moram no /estudio-carregando.js
  function pergunta({ titulo, texto, ok = 'Confirmar', perfil: pp = null, trabalho = null, okTrabalho = 'Salvando…', okErro = 'Continuar mesmo assim', aviso = false, icone = null, azul = false }) {
    return new Promise(fim => {
      const d = document.createElement('div'); d.className = 'ep-pg';
      d.innerHTML = `<div class="cx" role="alertdialog" aria-modal="true" aria-label="${esc(titulo)}">${azul ? '<button type="button" class="pg-x" data-n title="Fechar (Esc)" aria-label="Fechar">✕</button>' : ''}<div class="ic${aviso || azul ? ' azul' : ''}">${icone || ICONES.sair}</div><div class="t">${esc(titulo)}</div>
        ${pp ? `<div class="quem"><span class="av">${av(pp)}</span><span><b>${esc(pp.nome)}</b><small>${esc(pp.email)}</small></span></div>` : ''}
        <p class="x">${esc(texto)}</p><div class="acts">${aviso ? '' : '<button type="button" data-n>Cancelar</button>'}<button type="button" class="sim${aviso || azul ? ' azul' : ''}" data-s>${esc(ok)}</button></div></div>`;
      document.body.appendChild(d);
      const sai = v => { d.remove(); document.removeEventListener('keydown', tecla, true); fim(v); };
      const tecla = e => { if (e.key === 'Escape') { e.stopPropagation(); if (!ocupado) sai(false); } };
      document.addEventListener('keydown', tecla, true);
      const bS = d.querySelector('[data-s]'), bN = d.querySelector('[data-n]'), px = d.querySelector('.x');
      let falhou = false, ocupado = false;
      d.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { if (!ocupado) sai(false); });
      bS.onclick = async () => {
        if (!trabalho || falhou) return sai(true);
        ocupado = true; bS.disabled = true; if (bN) bN.disabled = true; bS.textContent = okTrabalho;
        try { await trabalho(); sai(true); }
        catch (e) { ocupado = false; falhou = true; bS.disabled = false; if (bN) bN.disabled = false; bS.textContent = okErro; px.innerHTML = `<span style="color:#ff8a9a">${esc(e?.message || e)}</span>`; }
      };
      d.onclick = e => { if (e.target === d && !ocupado) sai(false); };
      (bN || bS).focus(); // o botão seguro fica selecionado
    });
  }

  /* salvar antes de sair: cada programa diz como salva o que está aberto. Pode registrar antes ou depois deste arquivo carregar:
       (window.ESTUDIO_AO_SAIR ||= []).push(async () => { await salvarAgora(); });   // ou EstudioConta.aoSair(fn)
     A função pode devolver false ou dar erro se não conseguiu salvar: aí a pessoa escolhe "Sair sem salvar" ou cancela. */
  const salvadores = () => (Array.isArray(window.ESTUDIO_AO_SAIR) ? window.ESTUDIO_AO_SAIR : []).filter(f => typeof f === 'function');
  const aoSair = fn => { (window.ESTUDIO_AO_SAIR ||= []).push(fn); };
  /* VOLTAR/AVANÇAR do navegador: a página pode voltar "congelada" da memória do navegador (versão antiga, sem passar pela tela
     de carregamento). Aí salva o que estiver aberto e recarrega de verdade — com a tela de carregamento e as páginas novas. */
  addEventListener('pageshow', async e => {
    if (!e.persisted) return;
    try { document.documentElement.style.transition = 'opacity .15s'; document.documentElement.style.opacity = '0'; } catch { }
    try { await Promise.race([Promise.allSettled(salvadores().map(f => Promise.resolve().then(f))), new Promise(r => setTimeout(r, 3000))]); } catch { }
    location.reload();
  });
  /* VOLTAR AO MENU (mesma aba): salva o que está aberto antes. Se não tem nada para salvar (ou salva num instante), vai direto;
     se está salvando, aparece a janela "Indo para o menu" até terminar; se não conseguir salvar, pergunta se vai mesmo assim. */
  async function irAoMenu(e) {
    if (e && (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) return; // nova aba/janela: o navegador faz sozinho
    e?.preventDefault(); const vai = () => { location.href = '/'; };
    if (!salvadores().length) return vai();
    let pronto = false, erro = null; const sal = salvarAntesDeSair().then(() => { pronto = true; }, x => { erro = x; pronto = true; });
    await Promise.race([sal, new Promise(r => setTimeout(r, 350))]);
    let d = null;
    if (!pronto) { d = document.createElement('div'); d.className = 'ep-pg';
      d.innerHTML = `<div class="cx" role="alertdialog" aria-modal="true" aria-label="Indo para o menu"><div class="ic azul">${ICONES.inicio}</div><div class="t">Indo para o menu</div><p class="x"><span class="ep-gira"></span>Salvando o que está aberto antes de sair…</p></div>`;
      document.body.appendChild(d); await sal; }
    if (erro) { d?.remove(); if (await pergunta({ titulo: 'Não consegui salvar', texto: (erro.message || 'O projeto aberto não foi salvo.') + ' Ir para o menu mesmo assim?', ok: 'Ir sem salvar', okErro: 'Ir sem salvar', icone: ICONES.inicio })) vai(); return; }
    vai();
  }
  /* MINHA CONTA em qualquer programa: abre a janela da conta do menu por cima (sem sair do programa), como as Mensagens */
  function abrirMinhaConta() {
    if (document.querySelector('.ep-conta-jan')) return;
    const f = document.createElement('iframe'); f.className = 'ep-conta-jan'; f.title = 'Minha conta'; f.src = '/?conta=1&embed=1';
    f.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483004;background:transparent;color-scheme:normal;opacity:0;pointer-events:none;transition:opacity .15s';
    const esp = document.createElement('div'); esp.className = 'ep-pg'; esp.innerHTML = `<div class="cx" aria-label="Abrindo a Minha conta"><div class="ic azul">${ICONES.conta}</div><div class="t">Minha conta</div><p class="x"><span class="ep-gira"></span>Abrindo…</p></div>`;
    document.body.appendChild(esp); document.body.appendChild(f);
    const fim = () => { removeEventListener('message', ouve); clearTimeout(t); f.remove(); esp.remove(); };
    const ouve = ev => { if (ev.source !== f.contentWindow || ev.origin !== location.origin) return; const m = ev.data?.epConta;
      if (m === 'pronto') { esp.remove(); f.style.opacity = '1'; f.style.pointerEvents = 'auto'; f.focus(); }
      else if (m === 'mudou') { try { sessionStorage.removeItem('ep-conta-v1'); } catch { } recarregar(); }
      else if (m === 'fechar') { fim(); recarregar(); }
      else if (m === 'login') { fim(); location.href = '/?conta=1'; } };
    addEventListener('message', ouve);
    const t = setTimeout(() => { if (f.style.opacity !== '1') { fim(); location.href = '/?conta=1'; } }, 25000); // não abriu: vai pelo menu como antes
  }
  async function salvarAntesDeSair() {
    const limite = (pr, ms) => Promise.race([pr, new Promise((_, no) => setTimeout(() => no(new Error('demorou demais')), ms))]);
    const rs = await Promise.allSettled(salvadores().map(f => limite(Promise.resolve().then(f), 15000)));
    if (rs.some(r => r.status === 'rejected' || r.value === false)) {
      const e = rs.find(r => r.status === 'rejected')?.reason;
      throw new Error('Não consegui salvar o projeto aberto' + (e?.message ? ' (' + e.message + ')' : '') + '. Cancele para tentar de novo, ou saia sem salvar.');
    }
  }

  function caixa(p) {
    const box = document.createElement('div'); box.className = 'ep-conta' + (MSG.denuncias ? ' ep-denuncia' : '') + (VERSAO.nova ? ' ep-novo' : '') + (MSG.mencoes ? ' ep-mencao' : MSG.nao ? ' ep-msg' : '');
    // redesign (03/11/2026): só a casinha, na mesma pílula, em todos os programas (o nome fica para leitores de tela e na dica)
    const menu = CFG.semMenu ? '' : `<a class="ep-conta-menu" href="/" title="Voltar ao menu do Estúdio Problems" aria-label="Voltar ao menu">${ICONES.inicio}</a>`;
    const nuvemBt = CFG.nuvem ? `<button class="ep-conta-nuvem" type="button" title="Espaço na nuvem da equipe">${anelNuvem(0)}</button>` : '';
    box.innerHTML = `${nuvemBt}<button class="ep-conta-espaco" type="button" title="Espaço usado no navegador">${anel(0)}</button>${menu}<span class="ep-conta-fw"><button class="ep-conta-btn" type="button" aria-haspopup="true" aria-expanded="false" title="${esc(p.nome)} · ${esc(p.email)}">${av(p)}</button><i class="v" title="Tem versão nova: atualize os sites"></i><i class="m" title="Mensagem nova"></i><i class="a" title="Citaram você com @">@</i><i class="d" title="Tem denúncia para os ADMs verem">!</i></span>
      <div class="ep-conta-pop" hidden role="menu"></div>`;
    const btn = box.querySelector('.ep-conta-btn'), pop = box.querySelector('.ep-conta-pop');
    const fecha = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    const abre = () => {
      let ex = []; try { ex = (typeof CFG.extras === 'function' ? CFG.extras() : CFG.extras) || []; } catch { }
      ex = ex.filter(Boolean);
      const it = (i, k) => i === '-' ? '<div class="sep"></div>' : `<button class="it" type="button" role="menuitem" data-ex="${k}">${ICONES[i.icone] || i.icone || ''}${esc(i.texto)}</button>`;
      pop.innerHTML = `<div class="ep-conta-head"><span class="av">${av(p)}</span><span style="min-width:0"><b>${esc(p.nome)}${p.adm ? `<i class="ep-selo" title="ADM do Estúdio Problems">${ICONES.chave}</i>` : ''}</b><small>${esc(p.email)}</small></span></div>
        <button class="it" type="button" role="menuitem" data-a="conta">${ICONES.conta}Minha conta</button>
        <button class="it${MSG.mencoes ? ' msgmenc' : MSG.nao ? ' msgnova' : ''}" type="button" role="menuitem" data-a="msgs"${window.EstudioPerm?.pode('geral.mensagens') === false ? ' hidden' : ''}>${ICONES.msg}<span>Mensagens${MSG.mencoes ? '<small>Citaram você com @</small>' : ''}</span>${MSG.mencoes ? '<b class="cont arroba">@</b>' : ''}${MSG.nao ? `<b class="cont">${MSG.nao > 99 ? '99+' : MSG.nao}</b>` : ''}</button>
        ${p.adm && MSG.denuncias ? `<button class="it denun" type="button" role="menuitem" data-a="adm" data-aba="denuncias">${ICONES.adm}<span>ADM<small>${MSG.denuncias} denúncia${MSG.denuncias > 1 ? 's' : ''} para ver</small></span><b class="cont arroba">!</b></button>` : ''}
        ${p.adm ? (/^\/adm\/?$/i.test(location.pathname) ? `<a class="it" href="/" role="menuitem">${ICONES.inicio}Ver o menu</a>` : MSG.denuncias ? '' : `<button class="it" type="button" role="menuitem" data-a="adm">${ICONES.adm}ADM</button>`) : ''}
        ${CFG.semMenu ? '' : `<a class="it" href="/" role="menuitem">${ICONES.inicio}Voltar ao menu</a>`}
        <button type="button" role="menuitem" data-a="relatorio" class="it" title="Gera um relatório para enviar aos ADMs">${ICONES.lista || ''}Gerar relatório de suporte</button>
        <button type="button" role="menuitem" data-a="atualizar" class="it${VERSAO.nova ? ' novo' : ''}" title="Baixa de novo a versão mais nova do menu e de todos os projetos (como o Ctrl+F5). Seus projetos salvos no navegador continuam.">${ICONES.atualizar}<span>Atualizar todos os sites${VERSAO.nova ? '<small>Tem versão nova: clique para atualizar</small>' : ''}</span></button>
        ${ex.length ? '<div class="sep"></div>' + ex.map(it).join('') : ''}
        <div class="sep"></div>
        <button class="it sair" type="button" role="menuitem" data-a="sair">${ICONES.sair}Sair da conta</button>`;
      pop.querySelector('[data-a=conta]').onclick = () => { fecha(); if (CFG.conta) CFG.conta(); else abrirMinhaConta(); };
      pop.querySelectorAll('a.it[href="/"]').forEach(a => a.onclick = ev => { fecha(); irAoMenu(ev); });
      pop.querySelector('[data-a=msgs]').onclick = () => { fecha(); painelMensagens(); };
      pop.querySelector('[data-a=adm]')?.addEventListener('click', ev => { fecha(); abrirAdm(ev.currentTarget.dataset.aba); }); // janela por cima, sem trocar de aba
      pop.querySelector('[data-a=atualizar]').onclick = () => { fecha(); atualizarTudo(); };
      pop.querySelector('[data-a=relatorio]').onclick = () => { fecha(); pedeRelatorio(); };
      pop.querySelector('[data-a=sair]').onclick = async () => { fecha();
        const temQueSalvar = salvadores().length > 0;
        if (!(await pergunta({ titulo: 'Sair da conta?', texto: 'Você vai sair do Estúdio Problems neste navegador e voltar para o menu.' + (temQueSalvar ? ' O projeto aberto é salvo antes de sair.' : '') + ' Seus projetos salvos aqui continuam.',
          ok: 'Sair', perfil: p, trabalho: temQueSalvar ? salvarAntesDeSair : null, okErro: 'Sair sem salvar' }))) return;
        try { localStorage.removeItem('ep-conv-v1'); sessionStorage.removeItem('ep-conta-v1'); } catch { } if (CFG.sair) return CFG.sair(); try { await fetch('/sair', { method: 'POST', credentials: 'same-origin' }); } catch { } location.href = '/?sair=1'; };
      pop.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { fecha(); try { ex[+b.dataset.ex].acao(); } catch (e) { console.error(e); } });
      pop.hidden = false; btn.setAttribute('aria-expanded', 'true');
    };
    btn.onclick = e => { e.stopPropagation(); pop.hidden ? abre() : fecha(); };
    box.querySelector('.ep-conta-espaco').onclick = () => { fecha(); painelEspaco(); };
    const bm = box.querySelector('.ep-conta-menu'); if (bm) bm.onclick = ev => irAoMenu(ev); // salva antes de ir (e avisa se demorar)
    const nb = box.querySelector('.ep-conta-nuvem'); if (nb) { nb.onclick = () => { fecha(); painelNuvem(); }; setTimeout(() => atualizaNuvem(), 0); }
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
    window.EstudioProgresso?.tarefa(preImg(P.foto), 'Carregando a sua foto');
    if (window.top === window) mensagensLiga();
    if (window.top === window) vigiaSessao();
    if (!document.getElementById('ep-conta-css')) { const st = document.createElement('style'); st.id = 'ep-conta-css'; st.textContent = css; document.head.appendChild(st); }
    if (alvo) poe(typeof alvo === 'string' ? document.querySelector(alvo) : alvo); else procura();
    online();
    redesignLiga();
    if (!montar.obs) { // telas que se redesenham: o marcador novo ganha os botões de novo
      montar.obs = new MutationObserver(() => { if (document.querySelector('[data-estudio-conta]:not([data-ep-montado])')) procura();
        if (document.querySelector('[data-estudio-relogio]:not([data-ep-montado]),[data-estudio-dock]:not([data-ep-montado])')) poeMarcas(); });
      montar.obs.observe(document.body, { childList: true, subtree: true });
    }
  }
  /* ECONOMIA DE PEDIDOS (03/11/2026): as abas do Estúdio deste navegador combinam qual delas é a LÍDER (navigator.locks).
     Só a líder fala com o porteiro sobre as Mensagens e repassa o resultado às outras pelo BroadcastChannel 'ep-msgs'.
     A líder deixa aberta a conexão AO VIVO (/mensagens/ao-vivo): o porteiro avisa quando algo muda e só então ela busca.
     A presença ("online · PROGRAMA") de todas as abas também vai por essa conexão, sem um pedido por aba a cada 90 s.
     Sem conexão ao vivo (ou navegador sem locks), volta ao jeito de antes: cada aba confere sozinha. */
  const CANAL = (() => { try { return new BroadcastChannel('ep-msgs'); } catch { return null; } })();
  const VIVO = { lider: !(navigator.locks && CANAL), ws: null, aberto: false, tentativas: 0, outraVisivel: 0, bate: Date.now(), abas: new Map(), tp: 0 };
  const manda = d => { try { CANAL?.postMessage(d); } catch { } };
  function mandaPresenca() { // só a líder: junta as abas e manda de uma vez (1 s depois do último aviso)
    clearTimeout(VIVO.tp); VIVO.tp = setTimeout(() => {
      const t = Date.now(); for (const [k, v] of VIVO.abas) if (t - v.t > 200e3) VIVO.abas.delete(k);
      if (!VIVO.aberto || !VIVO.abas.size) return;
      try { VIVO.ws.send(JSON.stringify({ on: [...VIVO.abas].map(([aba, v]) => ({ aba, prog: v.prog })) })); } catch { return; }
      for (const [k, v] of VIVO.abas) if (!v.prog) VIVO.abas.delete(k); // "saiu" já foi avisado
    }, 1000);
  }
  // "online · PROGRAMA" na tela ADM › Quem pode entrar: avisa a cada 90 s, só com a aba à vista
  const programaAqui = () => { const p = location.pathname;
    return /^\/adm\/?$/i.test(p) ? 'ADM' : p === '/' ? 'MENU' : [['/animador/', 'ANIMADOR'], ['/editor/', 'EDITOR'], ['/shorts/', 'SHORTS'], ['/modelador/blockbench', 'BLOCKBENCH'], ['/modelador/', 'MODELADOR'], ['/preparativos/', 'PREPARATIVOS']].find(([k]) => p.startsWith(k))?.[1] || null; };
  function online() {
    if (online.ligado || !programaAqui()) return; online.ligado = true;
    const aba = Math.random().toString(36).slice(2, 12); // cada aba avisa por si: fechar uma não tira a pessoa do "online" se outra estiver aberta
    const porPedido = saiu => fetch('/presenca', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ programa: programaAqui(), aba, saiu: !!saiu }) }).catch(() => { });
    const avisa = saiu => { // com a conexão ao vivo: vai por ela (sem pedido); sem ela: um pedido, como antes
      if (!VIVO.aberto) return porPedido(saiu);
      const prog = saiu ? null : programaAqui();
      if (VIVO.lider) { VIVO.abas.set(aba, { prog, t: Date.now() }); mandaPresenca(); } else manda({ on: { aba, prog } });
    };
    const vez = () => { if (document.visibilityState === 'visible') avisa(); };
    vez(); setInterval(vez, 90e3); // a cada 90 s (o porteiro esquece em 200 s)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' ? avisa() : avisa(true));
    addEventListener('pagehide', () => porPedido(true)); // fechando a aba: pedido com keepalive (chega mesmo com a página saindo)
  }
  async function recarregar() { // depois de trocar nome ou foto
    P = await perfil(true); if (!P) return;
    document.querySelectorAll('.ep-conta').forEach(b => { const n = caixa(P); if (b.classList.contains('solto')) n.classList.add('solto'); b.replaceWith(n); });
  }

  // "Ctrl+F5 para todos os sites": baixa de novo (sem a memória do navegador) as páginas e os arquivos do menu e de cada projeto.
  // NÃO apaga nada guardado no navegador: projetos, rascunhos e preferências (IndexedDB/localStorage) não são tocados.
  async function atualizarTudo(extras = []) {
    // tela no meio do site (igual à de carregamento): bloqueia cliques e teclas enquanto baixa, com a barra, a % e quantos arquivos faltam
    const aviso = document.createElement('div'); aviso.id = 'ep-atualizando'; aviso.setAttribute('role', 'status'); aviso.setAttribute('aria-live', 'polite');
    aviso.innerHTML = '<div class="ep-at-c"><div class="ep-at-sp" aria-hidden="true">' + '<i></i>'.repeat(5) + '</div><div class="ep-at-t">Atualizando</div><div class="ep-at-br"><i></i></div><div class="ep-at-pc"><b>0%</b><span>procurando os arquivos…</span></div></div>';
    const est = document.createElement('style'); est.textContent = '#ep-atualizando{position:fixed;inset:0;z-index:2147483647;background:rgba(8,9,12,.5);-webkit-backdrop-filter:blur(16px) saturate(.9);backdrop-filter:blur(16px) saturate(.9);display:flex;align-items:center;justify-content:center;font:14px/1.5 \'Segoe UI\',system-ui,sans-serif;color:#f1f2f4;cursor:progress;-webkit-user-select:none;user-select:none;animation:epAtEntra .25s ease both}'
      + '#ep-atualizando .ep-at-c{display:grid;justify-items:center}#ep-atualizando .ep-at-sp{position:relative;width:46px;height:46px}#ep-atualizando .ep-at-sp i{position:absolute;inset:0;opacity:0;animation:epAtGira 4.4s infinite}#ep-atualizando .ep-at-sp i::after{content:\'\';position:absolute;top:0;left:50%;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:#fff}'
      + [0, 1, 2, 3, 4].map(n => `#ep-atualizando .ep-at-sp i:nth-child(${n + 1}){animation-delay:${(n * .22).toFixed(2)}s}`).join('')
      + '@keyframes epAtGira{0%{transform:rotate(180deg);opacity:1;animation-timing-function:ease-out}7%{transform:rotate(300deg);animation-timing-function:linear}30%{transform:rotate(470deg);animation-timing-function:ease-in-out}39%{transform:rotate(645deg);animation-timing-function:linear}70%{transform:rotate(770deg);animation-timing-function:ease-out}75%{transform:rotate(900deg);opacity:1}76%,100%{transform:rotate(900deg);opacity:0}}'
      + '#ep-atualizando .ep-at-t{margin-top:22px;font-size:17px;font-weight:600;letter-spacing:.2px}#ep-atualizando .ep-at-br{width:200px;height:5px;border-radius:3px;background:rgba(255,255,255,.18);margin:18px 0 10px;overflow:hidden}#ep-atualizando .ep-at-br>i{display:block;height:100%;width:0;background:#f1f2f4;border-radius:3px;transition:width .35s ease}#ep-atualizando .ep-at-pc{display:flex;gap:8px;align-items:baseline;font-size:11.5px;color:#a3a7ae}#ep-atualizando .ep-at-pc b{color:#e3e5e8;font-variant-numeric:tabular-nums;min-width:34px;text-align:right}#ep-atualizando .ep-at-pc span{font-variant-numeric:tabular-nums;white-space:nowrap}'
      + '@keyframes epAtEntra{from{opacity:0}}@media (prefers-reduced-motion:reduce){#ep-atualizando{animation:none}#ep-atualizando .ep-at-sp i{animation-duration:8s}}';
    document.head.appendChild(est); document.body.appendChild(aviso); try { document.activeElement?.blur?.(); } catch { }
    const trava = e => { e.preventDefault(); e.stopPropagation(); }; for (const t of ['keydown', 'keypress', 'keyup', 'wheel', 'contextmenu']) addEventListener(t, trava, { capture: true, passive: false });
    if (!document.getElementById('ep-conta-css')) { const st = document.createElement('style'); st.id = 'ep-conta-css'; st.textContent = css; document.head.appendChild(st); }
    const diz = (t, pct) => { aviso.querySelector('.ep-at-pc span').textContent = t; if (pct != null) { const p = Math.max(0, Math.min(100, Math.round(pct))); aviso.querySelector('.ep-at-pc b').textContent = p + '%'; aviso.querySelector('.ep-at-br>i').style.width = p + '%'; } };
    diz('Atualizando os sites…');
    try {
      if (navigator.serviceWorker?.getRegistrations) for (const r of await navigator.serviceWorker.getRegistrations()) { try { await r.update(); } catch { } }
      if (window.caches?.keys) for (const k of await caches.keys()) { try { await caches.delete(k); } catch { } } // só cópias offline de arquivos do site
      const raizes = new Set(['/', '/estudio-login.js', '/estudio-conta.js', '/shorts/', '/shorts/producao/', '/shorts/roteiro/', '/shorts/gravacao/', '/editor/', '/modelador/', '/modelador/blockbench/app/', '/animador/', location.pathname, ...extras]);
      if (P?.foto?.startsWith('/')) raizes.add(P.foto);
      const feitos = new Set(), fila = [...raizes];
      const pega = async caminho => {
        if (feitos.has(caminho) || feitos.size > 800) return; feitos.add(caminho);
        let r; try { r = await fetch(caminho, { cache: 'reload', credentials: 'same-origin' }); } catch { return; }
        if (!r.ok || !raizes.has(caminho) || !(r.headers.get('content-type') || '').includes('text/html')) return;
        const base = new URL(r.url), html = await r.text(); // das páginas, pega também os scripts, estilos e ícones do mesmo endereço
        for (const m of html.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"'#]+)["']/gi)) {
          if (m[1].includes('${')) continue; // pedaço de código, não é arquivo
          try { const u = new URL(m[1], base); if (u.origin === location.origin && !/\/(entrar|sair|conta)$/.test(u.pathname) && !u.searchParams.has('_ev')) fila.push(u.pathname + u.search); } catch { } // com carimbo (?_ev=): a versão nova já vem com outro carimbo, não precisa baixar de novo (economia: antes até 800 pedidos por clique)
        }
      };
      // contagem real: quantos já baixou de quantos achou até agora (as páginas vêm primeiro e dizem quais arquivos usam, então o total para de crescer logo)
      while (fila.length) { await Promise.all(fila.splice(0, 6).map(pega)); const total = feitos.size + new Set(fila.filter(c => !feitos.has(c))).size; diz(`${feitos.size} de ${total} arquivos`, feitos.size / Math.max(1, total) * 100); }
      diz('Pronto, recarregando…', 100);
    } catch (e) { diz('Não consegui atualizar tudo: ' + e.message); }
    setTimeout(() => location.reload(), 900);
  }

  /* ---------------- espaço no navegador (o mesmo para todos os programas do endereço único) ---------------- */
  // bancos do navegador (IndexedDB) de cada programa: nome do banco → programa e endereço
  const BANCOS = {
    'animador-v2': ['Animador', '/animador/'], 'turma-studios': ['Animador antigo', '/animador/', 'animações da versão antiga'], 'ep-edicao': ['Editor', '/editor/'], 'ep-whisper-edicao': ['Editor', '/editor/', 'transcrição guardada'],
    'estudio-problems': ['Shorts', '/shorts/'], 'ep-gravacao': ['Shorts', '/shorts/gravacao/'], 'ep-menu': ['Menu', '/', 'fundo próprio'], 'jester-dreams': ['Jester Dreams (teste)', '/jester/'], 'ep-publicacoes': ['Publicações', '/publicacoes/', 'vídeos esperando publicação'], 'ep-preparativos': ['Preparativos', '/preparativos/', 'rascunhos e gravações que faltam enviar'],
  };
  const PROGRAMAS = { '/animador/': 'Animador', '/jester/': 'Jester Dreams (teste)', '/editor/': 'Editor', '/shorts/': 'Shorts', '/modelador/': 'Modelador', '/preparativos/': 'Preparativos', '/publicacoes/': 'Publicações' };
  const fmt = b => { b = b || 0; return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : (b / 1073741824).toFixed(2).replace('.', ',') + ' GB'; };
  const dataTxt = t => { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  function anel(pct) {
    const c = pct > 85 ? '#ff6b6b' : pct > 60 ? '#ffcf4a' : '#2f6be6', r = 13, L = 2 * Math.PI * r;
    return `<svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="4"/><circle cx="16" cy="16" r="${r}" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(Math.max(pct, 2) / 100 * L).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 16 16)"/><g fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="10.6" y="11" width="10.8" height="7.4" rx="1.3"/><path d="M14 21.4h4M16 18.4v3"/></g></svg>`; // computador no meio: é o espaço DESTE computador
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
  /* ---------------- espaço na NUVEM da equipe (Cloudflare) — círculo roxo, só nos programas que salvam na nuvem (CFG.nuvem) ----------------
     Mostra quanto a equipe já usou e quanto falta, e o que ocupa. Apagar da nuvem: só ADM (o servidor confere); quem não é ADM
     recebe o aviso para pedir a um ADM. O que está só neste computador se apaga pelo círculo do espaço no navegador. */
  // na nuvem RESERVA (a principal chegou no limite de hoje) o círculo fica verde-água em vez de roxo
  // nível da nuvem em uso: 0 principal (roxo), 1 reserva (verde-água), 2 terciária (rosa) — pela medida ou pela marca deste navegador
  const nivelNuvem = j => { const EL = window.EstudioLimite, m = EL?.marcado?.() > Date.now() ? (EL?.nivel?.() || 0) : 0;
    return Math.max(m, j?.nuvem === 'terciaria' ? 2 : (j?.nuvem === 'reserva' || j?.antiga) ? 1 : 0); };
  const usandoReserva = j => nivelNuvem(j) > 0;
  function anelNuvem(pct, reserva) {
    const n = reserva === true ? 1 : +reserva || 0, c = pct > 85 ? '#f0584f' : pct > 60 ? '#f0b232' : '#3ccf7f' /* a cor diz quanto já foi usado; reserva/terciária vão escritas no painel e na dica */, r = 13, L = 2 * Math.PI * r;
    return `<svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="4"/><circle cx="16" cy="16" r="${r}" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(Math.max(pct > 0 ? 3 : 0, Math.min(100, pct)) / 100 * L).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 16 16)"/><path d="M11.6 19.4h8.6a2.9 2.9 0 0 0 .3-5.78 3.9 3.9 0 0 0-7.6.73 2.6 2.6 0 0 0-1.3 5.05z" fill="${c}"/></svg>`;
  }
  const tokenNuvem = async () => { try {
    if (CFG.token) { const t = await CFG.token(); return t && !/^Bearer /.test(t) ? 'Bearer ' + t : t; }
    if (window.EstudioLogin?.token) return await window.EstudioLogin.token();
    // o Animador declara o login como const TurmaAuth (não fica em window): procura pelo nome também
    const ta = typeof TurmaAuth !== 'undefined' ? TurmaAuth : window.TurmaAuth; // eslint-disable-line no-undef
    if (ta?.token) { const t = await ta.token(); return t ? (/^Bearer /.test(t) ? t : 'Bearer ' + t) : null; }
  } catch { } return null; };
  // USO DE HOJE da nuvem (pedido da dona, 05/11/2026): gravações, leituras e pedidos do dia da nuvem da equipe inteira (as contas
  // trabalham como uma só, então mostra só o total). Guardado 5 min neste navegador; um pedido só ao abrir o botão da nuvem.
  async function usoHoje(novo) {
    const K = 'ep-nuvem-hoje'; let j = null;
    if (!novo) { try { const c = JSON.parse(localStorage.getItem(K) || 'null'); if (c && Date.now() - c.t < 300e3) j = c.j; } catch { } }
    if (!j) { const tk = await tokenNuvem(); if (!tk) return '';
      const r = await fetch('https://turma-ia.problemsraiz.workers.dev/nuvem-hoje', { cache: 'no-store', headers: { authorization: tk } }); j = await r.json().catch(() => null); if (!r.ok || !j) return '';
      try { localStorage.setItem(K, JSON.stringify({ t: Date.now(), j })); } catch { } }
    if (j.semMedida) return '';
    const num = n => Number(n || 0).toLocaleString('pt-BR');
    const barra = (nome, o, f = num) => { const p = o.lim ? Math.min(100, o.v / o.lim * 100) : 0, cor = p >= 90 ? '#ff6b6b' : p >= 70 ? '#ffb84d' : '#2fd0a8';
      return `<div class="hj-l"><div class="hj-t"><span>${nome}</span><b style="color:${cor}">${p < 1 && o.v ? '<1' : Math.round(p)}%</b></div><div class="barra"><i style="width:${p.toFixed(1)}%;background:${cor}"></i></div><small>${f(o.v)} de ${f(o.lim)}</small></div>`; };
    const quando = j.em ? new Date(j.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    if (!document.getElementById('ep-hoje-css')) { const st = document.createElement('style'); st.id = 'ep-hoje-css'; st.textContent = '.ep-esp .ep-hoje h3{margin:14px 0 8px}.ep-esp .hj-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.ep-esp .hj-t{display:flex;justify-content:space-between;font-size:12.5px}.ep-esp .hj-l small{display:block;font-size:11px;color:#a9adb7;margin-top:3px}@media (max-width:520px){.ep-esp .hj-g{grid-template-columns:1fr}}'; document.head.appendChild(st); }
    return `<h3>Uso de hoje <small>(medido ${quando ? 'às ' + quando : 'há pouco'} · zera às ${new Date(new Date().setUTCHours(24, 0, 0, 0)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})</small></h3><div class="hj-g">${barra('Gravações', j.gravacoes)}${barra('Leituras', j.leituras)}${barra('Pedidos', j.pedidos)}</div>`;
  }
  async function usoNuvem(novo) {
    const K = 'ep-nuvem-uso'; // guardado 15 min (economia, 03/11/2026; antes 5) e o MESMO para todas as abas — 'Medir de novo' mede na hora (cada medida lista a nuvem inteira; o porteiro também guarda)
    if (!novo) { try { const c = JSON.parse(localStorage.getItem(K) || 'null'); if (c && Date.now() - c.t < 900e3) return c.j; } catch { } }
    const tk = await tokenNuvem(); if (!tk) throw new Error('Entre pelo menu para ver a nuvem.');
    const r = await fetch('/nuvem-uso' + (novo ? '?novo=1' : ''), { credentials: 'same-origin', cache: 'no-store', headers: { authorization: tk } }), j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || 'A nuvem não respondeu.');
    try { localStorage.setItem(K, JSON.stringify({ t: Date.now(), j })); } catch { }
    return j;
  }
  async function atualizaNuvem(novo) {
    const bs = document.querySelectorAll('.ep-conta-nuvem'); if (!bs.length) return;
    try { const j = await usoNuvem(novo), pct = j.total / j.limite * 100;
      const nv = nivelNuvem(j), res = nv > 0; bs.forEach(b => { b.innerHTML = anelNuvem(pct, nv); b.classList.toggle('reserva', res); b.classList.toggle('terciaria', nv >= 2); b.title = (nv >= 2 ? 'Usando a nuvem terciária até a principal voltar · ' : res ? 'Usando a nuvem reserva até a principal voltar · ' : '') + `Nuvem da equipe: ${fmt(j.total)} usados de ${fmt(j.limite)} · ${fmt(Math.max(0, j.limite - j.total))} livres (clique para ver o que ocupa)`; });
    } catch (e) { bs.forEach(b => { b.title = 'Nuvem da equipe: ' + (e.message || 'não respondeu'); });
      // o programa ainda está terminando de entrar com o Google: tenta de novo daqui a pouco
      if ((atualizaNuvem.tentativas = (atualizaNuvem.tentativas || 0) + 1) <= 6) setTimeout(() => atualizaNuvem(novo), 2500); return; }
    atualizaNuvem.tentativas = 0;
  }
  setInterval(() => { if (document.visibilityState === 'visible' && document.querySelector('.ep-conta-nuvem')) atualizaNuvem(); }, 180000); // usa a medida guardada (15 min): no máximo uma medida de verdade a cada 15 min por navegador
  // a nuvem mudou (encheu, entrou a reserva/terciária, voltou): o círculo muda de cor NA HORA, com a última medida guardada (sem pedir nada à nuvem)
  addEventListener('estudio-nuvem-estado', () => { const bs = document.querySelectorAll('.ep-conta-nuvem'); if (!bs.length) return;
    let j = null; try { j = JSON.parse(localStorage.getItem('ep-nuvem-uso') || 'null')?.j || null; } catch { }
    const pct = j ? j.total / j.limite * 100 : 0, nv = nivelNuvem(j);
    bs.forEach(b => { b.innerHTML = anelNuvem(pct, nv); b.classList.toggle('reserva', nv > 0); b.classList.toggle('terciaria', nv >= 2);
      b.title = (nv >= 2 ? 'Usando a nuvem terciária até a principal voltar' : nv ? 'Usando a nuvem reserva até a principal voltar' : 'Nuvem da equipe') + ' (clique para ver o que ocupa)'; }); });
  const pedeAdm = nome => pergunta({ titulo: 'Só um ADM pode apagar da nuvem', icone: ICONES.nuvem, aviso: true, ok: 'Entendi',
    texto: `Peça para um ADM apagar ${nome ? '"' + nome + '"' : 'isso'} da nuvem da equipe (no menu, ADM › Nuvem). Você pode apagar o que está só neste computador pelo círculo do espaço no navegador.` });
  // a medida veio da nuvem reserva (a principal chegou no limite de hoje): aviso em cima, com quando a principal volta
  function avisoReserva(j) {
    if (j?.nuvem === 'voltando' || (!j?.nuvem && window.EstudioLimite?.voltando?.())) return `<div class="ep-nv-aviso" role="status">${ICONES.nuvem}<div><b>A nuvem principal já voltou.</b><small>O que foi salvo na nuvem reserva durante o limite está voltando para ela sozinho, em poucos minutos. Ninguém precisa fazer nada.</small></div></div>`;
    if (!j?.nuvem) return ''; const v = Date.parse(j.volta || ''); if (!v || v < Date.now()) return '';
    const m = Math.ceil((v - Date.now()) / 6e4), h = Math.floor(m / 60), em = h ? `${h}h ${String(m % 60).padStart(2, '0')}min` : `${m} min`, hora = new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const t3 = nivelNuvem(j) >= 2, qual = t3 ? 'nuvem terciária' : 'nuvem reserva';
    return `<div class="ep-nv-aviso${t3 ? ' terc' : ''}" role="status">${ICONES.nuvem}<div><b>${t3 ? 'A nuvem principal e a reserva chegaram no limite de hoje: usando a nuvem terciária.' : j.antiga ? 'A nuvem principal chegou no limite de hoje: mostrando a última medida' + (j.em ? ' (de ' + new Date(j.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ')' : '') + '.' : j.nuvem === 'reserva' ? 'Mostrando as informações da nuvem reserva.' : 'A nuvem principal chegou no limite de hoje.'}</b><small>A principal volta às ${hora} (em ${em}). ${t3 || j.nuvem === 'reserva' || j.antiga ? `O que a equipe salvar até lá vai para a ${qual} e volta sozinho para a principal.` : 'O que você fizer continua guardado neste computador.'}</small></div></div>`;
  }
  // COR DE CADA PROGRAMA (a do ícone dele, ADM › Ícones): pastas e barras dos painéis de espaço usam a cor do programa dono
  const PROG_ID = { animador: 'an', 'animador antigo': 'an', ateliê: 'at', atelie: 'at', cenários: 'cn', cenarios: 'cn', shorts: 'sh', 'criar shorts': 'sh', editor: 'ed', 'editar vídeos': 'ed', modelador: 'md', preparativos: 'pr' };
  const corProg = nome => { const n = String(nome || '').toLowerCase(), k = PROG_ID[n] || PROG_ID[n.split(/[ (·]/)[0]]; try { const c = k && window.EstudioIcones?.config?.()?.[k]; if (c?.fg) return c.fg; } catch { } return '#8a9aab'; };
  const pastaIc = nome => { const c = corProg(nome); return `<svg class="ep-pasta" viewBox="0 0 34 28" aria-hidden="true"><path d="M1.5 5a2.5 2.5 0 0 1 2.5-2.5h8.5l3 3.5H30a2.5 2.5 0 0 1 2.5 2.5v15A2.5 2.5 0 0 1 30 26H4a2.5 2.5 0 0 1-2.5-2.5z" fill="${c}"/><path d="M1.5 10.5h31" stroke="rgba(255,255,255,.4)" stroke-width="1.3"/></svg>`; };
  const legenda = '<div class="ep-leg"><span><i style="background:#3ccf7f"></i>até 60%: tranquilo</span><span><i style="background:#f0b232"></i>60–85%: atenção</span><span><i style="background:#f0584f"></i>mais de 85%: quase cheio</span></div>';
  async function painelNuvem() {
    if (!document.getElementById('ep-conta-css')) { const st = document.createElement('style'); st.id = 'ep-conta-css'; st.textContent = css; document.head.appendChild(st); }
    document.querySelector('.ep-esp')?.remove();
    const d = document.createElement('div'); d.className = 'ep-esp nuvem'; d.innerHTML = '<div class="cx" role="dialog" aria-label="Espaço na nuvem"><h2>Espaço na nuvem</h2><p class="nota">Medindo a nuvem da equipe…</p></div>';
    document.body.appendChild(d);
    const fechar = () => { d.remove(); document.removeEventListener('keydown', esc1); }, esc1 = e => { if (e.key === 'Escape' && !document.querySelector('.ep-pg')) fechar(); };
    d.onclick = e => { if (e.target === d) fechar(); }; document.addEventListener('keydown', esc1);
    const cx = d.querySelector('.cx');
    const pinta = async novo => {
      let j; try { j = await usoNuvem(novo); } catch (e) { cx.innerHTML = `<h2>${ICONES.nuvem} Espaço na nuvem <button class="bt x" data-x>Fechar</button></h2><p class="nota">${esc(e.message)}</p>`; cx.querySelector('[data-x]').onclick = fechar; return; }
      atualizaNuvem();
      const pct = j.total / j.limite * 100, P = j.projetos || [], maior = Math.max(1, ...P.map(x => x.bytes)), atual = aqui() === 'Menu' ? 'Menu do Estúdio' : aqui(), its = [];
      const quemHtml = it => it.porNome ? `<span class="quem"><i>${it.porFoto ? `<img src="${esc(it.porFoto)}" alt="" referrerpolicy="no-referrer">` : esc(String(it.porNome)[0].toUpperCase())}</i>${esc(it.porNome)}</span>` : '';
      cx.innerHTML = `<h2>${ICONES.nuvem} Espaço na nuvem <button class="bt x" data-x>Fechar</button></h2>
        ${avisoReserva(j) || '<div class="ep-estado"><i></i><div><b>Nuvem principal funcionando</b><small>Tudo o que você salva vai direto para ela.</small></div></div>'}<div class="topo"><span style="flex:none">${anelNuvem(pct, nivelNuvem(j)).replace('width="26" height="26"', 'width="74" height="74"')}</span>
          <div><b>${fmt(j.total)} usados</b><small>de ${fmt(j.limite)} da nuvem da equipe · ${fmt(Math.max(0, j.limite - j.total))} livres</small>
          <div class="nota" style="margin-top:4px">É o mesmo espaço para toda a equipe e todos os programas. ${j.adm ? 'Você é ADM: pode apagar daqui.' : 'Apagar da nuvem: só um ADM.'}</div></div></div>
        <div class="ep-hoje"></div>
        ${legenda}
        <details class="grp sec"><summary><span class="seta">${ICONES.seta || '›'}</span><b>Por programa</b><span class="sp"></span><span class="tam">${P.length} ${P.length === 1 ? 'programa' : 'programas'}</span></summary><div class="grp-l">
        ${P.map(pr => `<div class="linha ${pr.nome === atual ? 'aqui' : ''}">${pastaIc(pr.nome)}<div class="n"><b>${esc(pr.nome)}${pr.nome === atual ? ' · aberto agora' : ''}</b><div class="barra"><i style="width:${(pr.bytes / maior * 100).toFixed(1)}%;background:${corProg(pr.nome)}"></i></div></div><span class="tam">${fmt(pr.bytes)}</span></div>`).join('') || '<div class="vazio">A nuvem está vazia.</div>'}</div></details>
        <h3>Pastas <small>(a cor é a do programa dono)</small></h3>
        ${P.flatMap(pr => pr.grupos).sort((a, b) => b.bytes - a.bytes).map(g => `<details class="grp"><summary><span class="seta">${ICONES.seta || '›'}</span>${pastaIc(g.projeto)}<b>${esc(g.nome)}</b><span class="sp"></span><span class="tam">${g.n} · ${fmt(g.bytes)}</span></summary>
          ${g.itens.slice(0, 200).map(it => `<div class="linha"><div class="n"><b>${esc(it.nome)}</b><small>${[it.info, it.em ? dataTxt(Date.parse(it.em) || it.em) : ''].filter(Boolean).map(esc).join(' · ')}</small></div>${quemHtml(it)}<span class="tam">${fmt(it.bytes)}</span>
            ${it.ref && !it.protegido ? `<button class="bt ${j.adm ? 'vermelho' : 'so-adm'}" data-ap="${its.push(it) - 1}" title="${j.adm ? 'Apagar da nuvem' : 'Só um ADM pode apagar da nuvem (clique para saber mais)'}">${j.adm ? ICONES.lixo || '' : ICONES.sair}Apagar</button>` : ''}</div>`).join('')}
          ${g.itens.length > 200 ? `<div class="nota" style="margin:0 10px 8px">… e mais ${g.itens.length - 200}</div>` : ''}</details>`).join('')}
        <div class="pe"><span class="nota">${j.adm ? 'Para ouvir, ver e baixar tudo, abra o menu › ADM › Nuvem.' : 'O que está só neste computador fica no círculo do espaço no navegador.'}</span><span class="sp"></span>${j.adm ? '<a class="bt" href="/adm">Abrir ADM › Nuvem</a>' : ''}<button class="bt" data-atu>Medir de novo</button></div>`;
      cx.querySelector('[data-x]').onclick = fechar; cx.querySelector('[data-atu]').onclick = () => pinta(true);
      usoHoje(novo).then(h => { const el = cx.querySelector('.ep-hoje'); if (el && h) el.innerHTML = h; }).catch(() => { });
      cx.querySelectorAll('[data-ap]').forEach(b => b.onclick = async () => {
        const it = its[+b.dataset.ap];
        if (!j.adm) return pedeAdm(it.nome);
        if (!(await pergunta({ titulo: 'Apagar da nuvem?', ok: 'Apagar', texto: `"${it.nome}" (${fmt(it.bytes)}) sai da nuvem da equipe para todo mundo. Não dá para desfazer.`, icone: ICONES.lixo,
          trabalho: async () => { const r = await fetch('/nuvem-uso', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', authorization: await tokenNuvem() }, body: JSON.stringify({ refs: [it.ref] }) });
            const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error?.message || 'Não apagou.'); }, okTrabalho: 'Apagando…', okErro: 'Fechar' }))) return;
        try { localStorage.removeItem('ep-nuvem-uso'); } catch { } pinta(true); CFG.aoMudarNuvem?.();
      });
    };
    pinta();
  }

  // ARQUIVOS do programa em GRUPOS que abrem e fecham (lista grande rola dentro do grupo): pelo it.grupo ou pela extensão do "Baixar .xxx"
  function gruposEsp(itens) {
    const NOMES = { animador: 'Animações (.animador)', atelieanimador: 'Personagens do Ateliê (.atelieanimador)', editor: 'Edições (.editor)', bbmodel: 'Modelos (.bbmodel)' }, G = new Map();
    for (const it of itens) { const ext = /\.([a-z0-9]+)\b/i.exec(it.rotuloBaixar || '')?.[1]?.toLowerCase(), k = it.grupo || (ext ? ext : 'outros');
      if (!G.has(k)) G.set(k, { k, nome: it.grupo || NOMES[k] || (ext ? `Arquivos .${ext}` : 'Outros'), L: [], b: 0 }); const g = G.get(k); g.L.push(it); g.b += +it.bytes || 0; }
    const L = [...G.values()].sort((a, b) => (a.k === 'outros') - (b.k === 'outros')); let mem = {}; try { mem = JSON.parse(sessionStorage.getItem('ep-esp-grupos') || '{}'); } catch { }
    for (const g of L) g.aberto = g.k in mem ? !!mem[g.k] : false; // fechadas por padrão (pedido da dona, 05/11/2026); a pessoa abre e fica lembrado
    return L;
  }
  async function painelEspaco() {
    if (!document.getElementById('ep-conta-css')) { const st = document.createElement('style'); st.id = 'ep-conta-css'; st.textContent = css; document.head.appendChild(st); }
    document.querySelector('.ep-esp')?.remove();
    const d = document.createElement('div'); d.className = 'ep-esp'; d.innerHTML = '<div class="cx" role="dialog" aria-label="Espaço no navegador"><h2>Espaço no navegador</h2><p class="nota">Medindo o que cada programa guarda…</p></div>';
    document.body.appendChild(d);
    const fechar = () => { d.remove(); document.removeEventListener('keydown', esc1); }, esc1 = e => { if (e.key === 'Escape' && !d.querySelector('.epm-sugere')) fechar(); };
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
      ${legenda}
      <details class="grp sec"><summary><span class="seta">${ICONES.seta || '›'}</span><b>Por programa</b><span class="sp"></span><span class="tam">${linhas.length} ${linhas.length === 1 ? 'item' : 'itens'}</span></summary><div class="grp-l">
      ${linhas.length ? linhas.map(([n, x]) => `<div class="linha ${n === atual ? 'aqui' : ''}">${pastaIc(n)}<div class="n"><b>${esc(n)}${n === atual ? ' · aberto agora' : ''}</b><div class="barra"><i style="width:${(x.b / maior * 100).toFixed(1)}%;background:${corProg(n)}"></i></div></div><span class="tam">${fmt(x.b)}</span>${x.end && n !== atual ? `<a class="bt" href="${x.end}">Abrir</a>` : ''}</div>`).join('') : '<div class="vazio">Nada guardado neste navegador ainda.</div>'}</div></details>
      ${prov ? `<h3>Arquivos do ${esc(prov.programa)} (${itens.length})</h3>
        ${itens.length ? gruposEsp(itens).map(g => `<details class="grp" data-g="${esc(g.k)}" ${g.aberto ? 'open' : ''}><summary><span class="seta">${ICONES.seta || '›'}</span>${pastaIc(prov.programa)}<b>${esc(g.nome)}</b><span class="cnt">${g.L.length}</span><span class="sp"></span><span class="tam">${fmt(g.b)}</span></summary><div class="grp-l">${g.L.map(it => { const i = itens.indexOf(it); return `<div class="linha">${it.thumb ? `<img class="th" src="${esc(it.thumb)}" alt="">` : ''}<div class="n"><b>${esc(it.nome)}</b><small>${[it.bytes != null ? fmt(it.bytes) : '', dataTxt(it.data), it.info || ''].filter(Boolean).join(' · ')}</small></div>
          ${it.baixar ? `<button class="bt" data-b="${i}" title="${esc(it.rotuloBaixar || 'Baixar')}">${ICONES.baixar}${esc(it.rotuloBaixar || 'Baixar')}</button>` : ''}${it.apagar ? `<button class="bt perigo" data-d="${i}" title="Apagar deste navegador">${ICONES.lixo}</button>` : ''}</div>`; }).join('')}</div></details>`).join('') : '<div class="vazio">Nenhum arquivo guardado por este programa.</div>'}` : ''}
      <div class="pe">${prov?.detalhes ? `<button class="bt" data-det>${ICONES.lista}Limpeza e detalhes…</button>` : ''}<span class="sp"></span>
        <span class="nota">Para não perder nada, baixe os projetos importantes.</span></div>`;
    cx.querySelector('[data-x]').onclick = fechar;
    cx.querySelectorAll('details.grp').forEach(dt => dt.ontoggle = () => { try { const m = JSON.parse(sessionStorage.getItem('ep-esp-grupos') || '{}'); m[dt.dataset.g] = dt.open; sessionStorage.setItem('ep-esp-grupos', JSON.stringify(m)); } catch { } });
    cx.querySelectorAll('[data-b]').forEach(b => b.onclick = async () => { b.disabled = true; try { await itens[+b.dataset.b].baixar(); } catch (er) { alert('Não consegui baixar: ' + er.message); } b.disabled = false; });
    cx.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { const it = itens[+b.dataset.d]; if (it.confirma !== false && !confirm(`Apagar "${it.nome}" deste navegador? Baixe antes se quiser guardar.`)) return; try { await it.apagar(); } catch (er) { alert(er.message); } atualizaAneis(); painelEspaco(); });
    const det = cx.querySelector('[data-det]'); if (det) det.onclick = () => { fechar(); prov.detalhes(); };
  }

  /* ---------------- quem fez: foto e nome no lugar do e-mail ----------------
     Em qualquer programa: <span data-quem="email@..."></span> vira [foto] Nome (da Minha conta, ou do Google).
     Para texto simples (ex.: dica ao passar o mouse): await EstudioConta.nomeDe(email). */
  const QUEM = new Map();
  const quem = email => { const k = String(email || '').trim().toLowerCase(); if (!k) return Promise.resolve(null);
    if (!QUEM.has(k)) QUEM.set(k, /^u[0-9a-f]{16}$/.test(k) ? quemU(k) : fetch('/pessoa?e=' + encodeURIComponent(k), { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null)); return QUEM.get(k); };
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

  /* ---------- sessão: saiu da conta (em outra aba), foi tirado pelo ADM ou entrou com outra conta ----------
     Confere a cada minuto (aba à vista) e quando a aba volta a aparecer. Sem sessão: salva o que está aberto e volta
     para o login do menu (e depois volta para cá). Outra conta: salva e recarrega já com a conta nova. */
  let vigiando = false, ultimaSessao = 0;
  async function confereSessao() {
    if (!P || confereSessao.indo) return; ultimaSessao = Date.now();
    let j; try { const r = await fetch('/sessao', { credentials: 'same-origin', cache: 'no-store' }); if (!r.ok) return; j = await r.json(); } catch { return; } // sem internet: não faz nada
    const agora = String(j?.email || '').toLowerCase(), antes = String(P.email || '').toLowerCase();
    if (agora && agora === antes) return;
    confereSessao.indo = true; manda({ sessaoMudou: 1 }); // as outras abas conferem também (uma vez cada)
    const aviso = document.createElement('div'); aviso.className = 'ep-esp';
    aviso.innerHTML = `<div class="cx" role="alertdialog" style="width:min(380px,100%);text-align:center"><h2 style="justify-content:center">${agora ? 'Você entrou com outra conta' : 'Sua sessão terminou'}</h2><p class="nota">${agora ? 'Salvando o que está aberto e atualizando a página com a conta nova…' : 'Salvando o que está aberto e voltando para o login do menu…'}</p></div>`;
    document.body.appendChild(aviso);
    try { await Promise.race([Promise.allSettled(salvadores().map(f => Promise.resolve().then(f))), new Promise(r => setTimeout(r, 4000))]); } catch { }
    if (agora || location.pathname === '/' || /^\/adm\/?$/i.test(location.pathname)) location.reload();
    else location.href = '/?volta=' + encodeURIComponent(location.pathname + location.search);
  }
  function vigiaSessao() {
    if (vigiando) return; vigiando = true;
    // ECONOMIA (03/11/2026): de 2 em 2 min só a aba LÍDER confere (com alguma aba do Estúdio à vista); se a sessão mudou, ela avisa as
    // outras (sessaoMudou) e cada uma confere uma vez. O porteiro continua barrando quem foi tirado em qualquer pedido.
    const vista = () => document.visibilityState === 'visible' || Date.now() - VIVO.outraVisivel < 45000;
    setInterval(() => { if (VIVO.lider && vista() && Date.now() - ultimaSessao > 600000) confereSessao(); }, 15000); // 06/11/2026: de 10 em 10 min (antes 2): o porteiro já barra quem saiu em qualquer pedido
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (VIVO.lider || !CANAL) && Date.now() - ultimaSessao > 120000) confereSessao(); }); // voltar para a aba: no máximo 1 conferência a cada 2 min (06/11/2026; antes 10 s)
  }

  /* ---------- Mensagens: conversa geral da equipe + conversas privadas ----------
     Menu da conta › Mensagens abre a janela. Mensagem nova = bolinha AMARELA na foto da conta (com a roxa da versão nova,
     o anel fica metade roxo, metade amarelo). Sem som. O porteiro apaga sozinho o que tem mais de 7 dias.
     Ninguém recebe e-mail de ninguém: as pessoas vão pelo código (u…) e o nome/foto vêm de /pessoa?u=. */
  const MSG = { mencoes: 0, nao: 0, eu: null, ultimo: 0, res: null, pessoas: [], conv: null, ligado: false, ultimaVolta: 0, abertoEm: 0 };
  const NOME_PROG_ON = { MENU: 'no menu', ADM: 'na tela ADM', ANIMADOR: 'no Animador', 'JESTER DREAMS': 'no Jester Dreams (teste)', EDITOR: 'no Editor', SHORTS: 'nos Shorts', MODELADOR: 'no Modelador', BLOCKBENCH: 'no Blockbench' };
  const QUEMU = new Map();
  const NOMES = new Map(); // código → nome (para achar @Nome escrito à mão)
  // nomes e fotos ficam guardados neste navegador (30 min): abrir as mensagens não pede de novo um por um
  const QUEM_LS = 'ep-quem-v1'; let quemLs = {}; try { quemLs = JSON.parse(localStorage.getItem(QUEM_LS) || '{}') || {}; } catch { }
  let quemGrava = 0; const gravaQuem = () => { clearTimeout(quemGrava); quemGrava = setTimeout(() => { try { localStorage.setItem(QUEM_LS, JSON.stringify(quemLs)); } catch { } }, 400); };
  const buscaUm = u => fetch('/pessoa?u=' + encodeURIComponent(u), { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null);
  // ECONOMIA (06/11/2026): quem é pedido junto (ex.: as 5 pessoas da equipe ao abrir o Animador) vai num pedido só (/pessoa?us=);
  // porteiro antigo (sem ?us=) → um por um, como antes
  const FILA_Q = { us: new Map(), t: 0 };
  const buscaQuem = u => new Promise(ok => { const f = FILA_Q; if (!f.us.has(u)) f.us.set(u, []); f.us.get(u).push(ok); clearTimeout(f.t);
    f.t = setTimeout(async () => { const lote = new Map(f.us); f.us.clear(); const cods = [...lote.keys()]; let res = null;
      if (cods.length > 1) { try { const r = await fetch('/pessoa?us=' + cods.join(','), { credentials: 'same-origin' }); const j = r.ok ? await r.json() : null; if (j?.pessoas) res = j.pessoas; } catch { } }
      await Promise.all(cods.map(async c => { const q = res && c in res ? res[c] : await buscaUm(c);
        if (q?.nome) { NOMES.set(c, q.nome); quemLs[c] = { q, t: Date.now() }; gravaQuem(); } for (const fim of lote.get(c)) fim(q); })); }, 60); });
  const quemU = u => { if (!QUEMU.has(u)) { const g = quemLs[u];
      if (g?.q && Date.now() - g.t < 7 * 864e5) { NOMES.set(u, g.q.nome); QUEMU.set(u, Promise.resolve(g.q)); if (Date.now() - g.t > 3 * 3600e3) buscaQuem(u).then(q => { if (q) QUEMU.set(u, Promise.resolve(q)); }); } // guardado: na hora (e confere por trás se tem mais de 3 h — antes 30 min)
      else QUEMU.set(u, buscaQuem(u)); } return QUEMU.get(u); };
  // conversas já abertas ficam guardadas (neste navegador, só da sua conta): abrem na hora e só baixam o que chegou de novo
  const CONV_LS = 'ep-conv-v1', CONV_MAX = 80;
  const cacheConv = { eu: null, c: {} };
  const leCacheConv = eu => { if (cacheConv.eu === eu) return; cacheConv.eu = eu; cacheConv.c = {};
    try { const j = JSON.parse(localStorage.getItem(CONV_LS) || 'null'); if (j?.eu === eu) cacheConv.c = j.c || {}; else localStorage.removeItem(CONV_LS); } catch { } }; // outra conta: joga fora
  let convGrava = 0; const gravaCacheConv = () => { clearTimeout(convGrava); convGrava = setTimeout(() => { try {
    const ids = Object.keys(cacheConv.c).sort((a, b) => (cacheConv.c[b].t || 0) - (cacheConv.c[a].t || 0)).slice(0, 12), c = {}; // só as 12 mais recentes
    for (const k of ids) { const x = cacheConv.c[k]; c[k] = { ...x, msgs: x.msgs.slice(-CONV_MAX), mais: x.mais || x.msgs.length > CONV_MAX }; }
    cacheConv.c = c; localStorage.setItem(CONV_LS, JSON.stringify({ eu: cacheConv.eu, c })); } catch { } }, 600); };
  const guardaConv = (M, id, msgs, mais) => { if (M.como || !M.eu) return; leCacheConv(M.eu); cacheConv.c[id] = { msgs: msgs.filter(m => m.id > 0), mais: !!mais, t: Date.now() }; gravaCacheConv(); };
  const juntaMsgs = (lista, novas) => { for (const m of novas) { const i = lista.findIndex(x => x.id === m.id); if (i >= 0) lista[i] = m; else lista.push(m); } return lista.sort((a, b) => a.id - b.id); };
  const outroDe = (c, eu = MSG.eu) => c === 'geral' || c.startsWith('g:') ? c : c.slice(2).split('|').find(x => x !== eu) || '';
  const novoEstado = como => ({ mencoes: 0, nao: 0, eu: null, ultimo: 0, res: null, pessoas: [], conv: null, como });
  const pintaAvisoMsg = () => {
    document.querySelectorAll('.ep-conta').forEach(b => { b.classList.toggle('ep-msg', MSG.nao > 0 && !MSG.mencoes); b.classList.toggle('ep-mencao', MSG.mencoes > 0); b.classList.toggle('ep-denuncia', MSG.denuncias > 0); });
    const n = document.getElementById('aba-conversas-n'); if (n) { n.hidden = !MSG.denuncias; n.textContent = MSG.denuncias || ''; }
    try { dispatchEvent(new CustomEvent('estudio-mensagens', { detail: { naoLidas: MSG.nao } })); } catch { }
  };
  async function puxaMensagens(comPessoas, M = MSG) { // M = estado (o seu, ou o de outra pessoa na visão do ADM)
    if (M.puxando) return; M.puxando = true;
    try {
      const r = await fetch('/mensagens?desde=' + M.ultimo + (comPessoas ? '&pessoas=1' : '') + (M.como ? '&como=' + encodeURIComponent(M.como) : ''), { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 401) { if (M === MSG) confereSessao(); return; }
      if (!r.ok) return; const j = await r.json();
      if (M === MSG) manda({ j }); // as outras abas recebem o mesmo resultado (não precisam pedir)
      aplicaMsgs(j, M);
    } catch { } finally { M.puxando = false; }
  }
  // ✓✓ da conversa aberta (um pedido só mesmo se vierem vários avisos juntos)
  function pedeVistos(M) {
    clearTimeout(M.tv); M.tv = setTimeout(() => { const cv = M.conv; if (!M.janela || !cv?.id || cv.multi || !cv.msgs?.some(m => m.de === M.eu)) return;
      fetch('/mensagens?vistos=1&conv=' + encodeURIComponent(cv.id) + (M.como ? '&como=' + encodeURIComponent(M.como) : ''), { credentials: 'same-origin', cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(v => { if (v?.part && M.conv === cv) { cv.vistos = v; M.janela?.pintaTicks(); } }).catch(() => { }); }, 300);
  }
  function aplicaMsgs(j, M = MSG) {
    {
      const primeira = !M.res; M.eu = j.eu; M.res = j; if (j.pessoas) M.pessoas = j.pessoas;
      if (!primeira && M.conv && j.novas?.length) {
        const daqui = j.novas.filter(m => m.conv === M.conv.id);
        if (daqui.length) { for (const m of daqui) { const i = M.conv.msgs.findIndex(x => x.id === m.id); if (i >= 0) M.conv.msgs[i] = m; else M.conv.msgs.push(m); } M.conv.msgs.sort((a, b) => a.id - b.id); if (M.janela) { M.janela.desenhaConversa(); marcaLida(M.conv.id, M); delete j.nao[M.conv.id]; if (j.mencoes) delete j.mencoes[M.conv.id]; } }
      }
      if (!primeira && j.novas?.length && !M.como && M.eu) { leCacheConv(M.eu); let mudou = false; // conversas guardadas também recebem o que chegou
        for (const m of j.novas) { const x = cacheConv.c[m.conv]; if (x && m.conv !== M.conv?.id) { juntaMsgs(x.msgs, [m]); x.t = Date.now(); mudou = true; } } if (mudou) gravaCacheConv(); }
      if (M.conv?.id && !M.conv.multi && !primeira && j.novas?.some(m => m.conv === M.conv.id)) guardaConv(M, M.conv.id, M.conv.msgs, M.conv.mais);
      M.ultimo = j.ultimo || M.ultimo;
      M.nao = Object.values(j.nao || {}).reduce((a, b) => a + b, 0); M.mencoes = Object.values(j.mencoes || {}).reduce((a, b) => a + b, 0); M.denuncias = +j.denuncias || 0;
      if (M === MSG) { pintaAvisoMsg(); tocaMencao(j.mencaoId); } M.janela?.desenhaLista();
      // ✓✓: ao vivo, só quando chegou algo nesta conversa (ou o aviso "lida"/"entregue"); sem conexão ao vivo, a cada conferência como antes
      const cv = M.conv; if (M.janela && cv?.id && (!VIVO.aberto || M.como || j.novas?.some(m => m.conv === cv.id))) pedeVistos(M);
    }
  }
  function marcaLida(conv, M = MSG) {
    if (M.como) return; // ADM vendo como outra pessoa: só olha, não marca nada
    const ult = M.conv?.id === conv ? M.conv.msgs.at(-1)?.id : M.res?.ultimas?.[conv]?.id; if (!ult) return;
    if (M.res?.nao?.[conv] || M.res?.mencoes?.[conv]) { delete M.res.nao[conv]; if (M.res.mencoes) delete M.res.mencoes[conv]; M.nao = Object.values(M.res.nao).reduce((a, b) => a + b, 0); M.mencoes = Object.values(M.res.mencoes || {}).reduce((a, b) => a + b, 0); if (M === MSG) pintaAvisoMsg(); }
    fetch('/mensagens', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'lida', conv, ate: ult }) }).catch(() => { });
  }
  // barulhinho de @menção (sem arquivo de som: dois "plins" suaves). Só toca uma vez por menção, mesmo com várias abas abertas.
  let audio = null;
  const liberaAudio = () => { try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch { } };
  addEventListener('pointerdown', liberaAudio, { capture: true, passive: true }); addEventListener('keydown', liberaAudio, { capture: true, passive: true });
  function plim() {
    try { liberaAudio(); if (!audio || audio.state !== 'running') return false;
      const t0 = audio.currentTime + .02;
      [[880, 0], [1318.5, .13]].forEach(([f, d]) => { const o = audio.createOscillator(), g = audio.createGain(); o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, t0 + d); g.gain.linearRampToValueAtTime(.09, t0 + d + .015); g.gain.exponentialRampToValueAtTime(.0001, t0 + d + .35);
        o.connect(g).connect(audio.destination); o.start(t0 + d); o.stop(t0 + d + .4); });
      return true; } catch { return false; }
  }
  function tocaMencao(id) {
    id = +id || 0; if (!id) return; let ja = 0; try { ja = +localStorage.getItem('ep-mencao-tocada') || 0; } catch { }
    if (id <= ja) return;
    if (plim()) { try { localStorage.setItem('ep-mencao-tocada', String(id)); } catch { } }
  }
  // baixa uma imagem antes de aparecer na tela (fica no cache do navegador); no máximo 5 s
  const preImg = url => !url ? Promise.resolve() : new Promise(ok => { const im = new Image(), t = setTimeout(ok, 5000); im.referrerPolicy = 'no-referrer'; im.onload = im.onerror = () => { clearTimeout(t); ok(); }; im.src = url; });
  function mensagensLiga() {
    if (MSG.ligado) return; MSG.ligado = true;
    // já na tela de carregamento: as conversas, os nomes e as fotos da equipe (abrir as Mensagens fica na hora, sem foto "pipocando")
    const pre = (async () => { await puxaMensagens(true); await Promise.all(MSG.pessoas.map(async p => { const q = await quemU(p.u); await preImg(q?.foto); }));
      await Promise.all([...(MSG.res?.grupos || []).map(g => preImg(g.foto)), preImg(MSG.res?.geral?.foto)]); MSG.abertoEm = Date.now(); })();
    window.EstudioProgresso?.tarefa(pre, 'Carregando nomes e fotos da equipe');
    // o que as outras abas mandam: resultado da conferência, aviso ao vivo, presença, "estou à vista", estado da conexão
    if (CANAL) CANAL.onmessage = ({ data: d }) => { if (!d) return;
      if (d.j || d.ev || d.bate || 'estado' in d) VIVO.bate = Date.now(); // sinal de que a líder está viva
      if (d.vivo) VIVO.outraVisivel = Date.now();
      if (d.versaoNova) { marcaNova.deFora = true; marcaNova(d.versaoNova); marcaNova.deFora = false; } // outra aba achou versão nova
      if (d.voltou && VIVO.lider) { VIVO.outraVisivel = Date.now(); if (Date.now() - VERSAO.ultima > 60000) confereVersao().catch(() => { }); if (Date.now() - ultimaSessao > 30000) confereSessao(); }
      if (d.sessaoMudou) confereSessao(); // a líder viu que saiu da conta (ou trocou): esta aba confere e faz o mesmo
      if (d.j) aplicaMsgs(d.j, MSG);
      else if (d.ev) eventoVivo(d.ev);
      else if (d.on && VIVO.lider) { VIVO.abas.set(String(d.on.aba), { prog: d.on.prog || null, t: Date.now() }); mandaPresenca(); }
      else if ('estado' in d) { if (!VIVO.lider) VIVO.aberto = !!d.estado; }
      else if (d.quem && VIVO.lider) manda({ estado: VIVO.aberto ? 1 : 0 }); };
    manda({ quem: 1 }); // aba nova: pergunta à líder se a conexão ao vivo está aberta
    if (!VIVO.lider) navigator.locks.request('ep-msgs-lider', () => new Promise(() => { VIVO.lider = true; VIVO.aberto = false; MSG.ultimaVolta = 0; abreVivo(); })); // fica com a vez até a aba fechar
    else abreVivo();
    setInterval(() => {
      const t = Date.now(), vis = document.visibilityState === 'visible';
      if (CANAL && t - (VIVO.avisei || 0) > 30000 && (vis || VIVO.lider)) { VIVO.avisei = t; manda({ vivo: vis ? 1 : 0, bate: VIVO.lider ? 1 : 0 }); } // "estou à vista" e/ou "a líder está viva"
      const sozinha = !VIVO.lider && t - VIVO.bate > 180000; // a líder sumiu (aba congelada pelo navegador): esta confere por si até ela voltar
      let passo;
      if (VIVO.aberto && !sozinha) passo = MSG.janela ? 90000 : VIVO.lider ? 600000 : Infinity; // ao vivo: só os nomes/online (janela aberta) e uma conferência de segurança
      else if (!VIVO.lider && !sozinha) passo = MSG.janela ? 4000 : Infinity; // a líder confere por esta aba
      else passo = MSG.janela ? 4000 : vis || t - VIVO.outraVisivel < 45000 ? 60000 : 120000; // como antes (escondida: devagar, para o @ tocar em qualquer site)
      if (t - MSG.ultimaVolta < passo) return; MSG.ultimaVolta = t;
      puxaMensagens(!!MSG.janela && t - MSG.abertoEm > 60000 && (MSG.abertoEm = t));
    }, 2000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') return; manda({ vivo: 1 });
      if (!VIVO.aberto && (VIVO.lider || !CANAL)) { MSG.ultimaVolta = Date.now(); puxaMensagens(); } });
  }
  // aviso da conexão ao vivo (na líder, direto; nas outras abas, repassado pelo canal)
  function eventoVivo(ev) {
    if (ev.t === 'nova' && VIVO.lider) { clearTimeout(VIVO.tn); VIVO.tn = setTimeout(() => { MSG.ultimaVolta = Date.now(); puxaMensagens(); }, 250); } // vários avisos juntos = uma busca
    if ((ev.t === 'lida' || ev.t === 'entregue') && MSG.janela && MSG.conv && (!ev.conv || ev.conv === MSG.conv.id)) pedeVistos(MSG);
  }
  // conexão ao vivo da líder: hiberna parada (não gasta), "ping" a cada 50 s, volta sozinha se cair; sem ela, o jeito de antes
  function abreVivo() {
    if (!VIVO.lider || VIVO.ws || !('WebSocket' in window)) return;
    let ws; try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/mensagens/ao-vivo'); } catch { return; }
    VIVO.ws = ws;
    ws.onopen = () => { VIVO.aberto = true; VIVO.tentativas = 0; manda({ estado: 1 }); MSG.ultimaVolta = Date.now(); puxaMensagens(); mandaPresenca();
      VIVO.ping = setInterval(() => { try { ws.send('ping'); } catch { } }, 50000); };
    ws.onmessage = e => { if (e.data === 'pong') return; let ev; try { ev = JSON.parse(e.data); } catch { return; } eventoVivo(ev); manda({ ev }); };
    ws.onclose = () => { clearInterval(VIVO.ping); VIVO.ws = null; if (VIVO.aberto) { VIVO.aberto = false; manda({ estado: 0 }); MSG.ultimaVolta = 0; }
      const n = ++VIVO.tentativas; setTimeout(abreVivo, n > 6 ? 600000 : Math.min(60000, 2000 * 2 ** n)); }; // não conseguiu várias vezes: tenta de novo daqui a 10 min
  }
  const horaTxt = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const diaTxt = t => { const d = new Date(t), h = new Date(); const um = 864e5, ini = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const dif = Math.round((ini(h) - ini(d)) / um); return dif === 0 ? 'Hoje' : dif === 1 ? 'Ontem' : d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }); };
  const MENC = /<@(u[0-9a-f]{16})>/g;
  const codigosMenc = t => [...String(t || '').matchAll(MENC)].map(m => m[1]);
  const semMenc = (t, nomes = {}) => String(t || '').replace(MENC, (_, u) => '@' + (nomes[u] || 'alguém'));
  const textoMsg = (t, nomes = {}, eu = MSG.eu) => esc(t).replace(/&lt;@(u[0-9a-f]{16})&gt;/g, (_, u) => `\u0001${u}\u0001`).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`).replace(/\u0001(u[0-9a-f]{16})\u0001/g, (_, u) => `<b class="epm-ment${u === eu ? ' epm-eu' : ''}">@${esc(nomes[u] || 'alguém')}</b>`);
  // ADM aparece com a CHAVE INGLESA ao lado do nome (Mensagens, conta); q.adm vem do /pessoa do porteiro
  const chaveAdm = q => q?.adm ? `<i class="ep-chave" title="ADM do Estúdio Problems">${ICONES.chave}</i>` : '';
  const nomeU = (u, q, M = MSG) => { const n = q?.nome || 'Alguém', a = M.res?.apelidos?.[u]; return a ? `${n} (${a})` : n; };
  const avU = (q, cls = 'epm-av') => `<span class="${cls}">${q?.foto ? `<img src="${esc(q.foto)}" alt="" referrerpolicy="no-referrer">` : esc(((q?.nome || '?')[0] || '?').toUpperCase())}</span>`;
  // citação: o programa chama EstudioConta.citar({ prog, titulo, sub, mini, url | abrir + arquivo, parte }) → escolhe para quem → escreve → envia
  const fmtTam = b => b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  async function miniPequena(src) {
    if (!src) return null;
    try { const im = new Image(); im.crossOrigin = 'anonymous'; im.src = src; await im.decode(); const k = Math.min(1, 200 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      const x = c.getContext('2d'); x.fillStyle = '#2b2c31'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      for (const q of [.8, .6, .4]) { const d = c.toDataURL('image/jpeg', q); if (d.length < 55000) return d; } } catch { }
    return null;
  }
  async function fotoQuadrada(src) { // foto da conversa geral: quadrado de 160 px, leve
    try { const im = new Image(); im.src = src; await im.decode(); const l = Math.min(im.naturalWidth, im.naturalHeight), c = document.createElement('canvas'); c.width = c.height = 160;
      c.getContext('2d').drawImage(im, (im.naturalWidth - l) / 2, (im.naturalHeight - l) / 2, l, l, 0, 0, 160, 160);
      for (const t of ['image/webp', 'image/jpeg']) for (const q of [.85, .7, .5]) { const d = c.toDataURL(t, q); if (d.startsWith('data:' + t) && d.length < 60000) return d; } } catch { }
    return null;
  }
  function citar(info) { if (!info || !info.titulo) return; return painelMensagens({ citar: info }); }
  // o programa aberto por uma citação: ?anexo=<id>&parte=<json> (arquivo) ou só ?parte=<json> (item da nuvem)
  function citacaoRecebida() {
    const q = new URLSearchParams(location.search), id = q.get('anexo'), pt = q.get('parte'); if (!id && !pt) return null;
    let parte = null; try { parte = pt ? JSON.parse(pt) : null; } catch { }
    q.delete('anexo'); q.delete('parte'); const nome = q.get('anexoNome') || 'arquivo'; q.delete('anexoNome');
    try { history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch { }
    return { parte, nome, anexo: id || null,
      async baixar() { if (!id) return null; const r = await fetch('/mensagens/anexo?id=' + encodeURIComponent(id), { credentials: 'same-origin' });
        if (!r.ok) { let m = 'Não consegui baixar o arquivo.'; try { m = (await r.json()).error?.message || m; } catch { } throw new Error(m); }
        return new File([await r.blob()], nome); } };
  }
  function abreCitacao(c) {
    if (!c) return;
    const parte = c.parte ? JSON.stringify(c.parte) : '';
    let u;
    if (c.anexo && c.abrir) u = c.abrir + '?anexo=' + encodeURIComponent(c.anexo.id) + '&anexoNome=' + encodeURIComponent(c.anexo.nome || 'arquivo') + (parte ? '&parte=' + encodeURIComponent(parte) : '');
    else if (c.url) u = c.url + (parte && !/[?&]parte=/.test(c.url) ? (c.url.includes('?') ? '&' : '?') + 'parte=' + encodeURIComponent(parte) : '');
    if (u) window.open(u, '_blank', 'noopener');
  }
  const citaHtml = (c, i, comBaixar) => `<div class="epm-cita" role="button" tabindex="0" data-cita="${i}" title="${c.anexo ? 'Abrir no programa (o arquivo vem junto)' : 'Abrir'}">
      <span class="epm-cmini">${c.mini ? `<img src="${esc(c.mini)}" alt="">` : ICONES.arquivo}</span>
      <span class="epm-ctx"><small>${esc(c.prog || 'Estúdio')} · ${c.anexo ? 'arquivo ' + esc(fmtTam(c.anexo.bytes || 0)) : 'na nuvem'}</small><b>${esc(c.titulo)}</b>${c.sub ? `<span>${esc(c.sub)}</span>` : ''}
      <em>${c.anexo ? 'Abrir e continuar daqui' : 'Abrir e ir direto para aqui'}</em></span></div>${comBaixar && c.anexo ? `<a class="epm-cbaixa" href="/mensagens/anexo?id=${esc(c.anexo.id)}" download="${esc(c.anexo.nome || 'arquivo')}">${ICONES.baixar} Baixar ${esc(c.anexo.nome || 'arquivo')}</a>` : ''}`;
  // "carregando" com porcentagem e o que está sendo carregado (o mesmo jeito das telas de carregamento)
  const carregandoHtml = (txt, pct = 5) => (setTimeout(() => document.querySelectorAll('[data-carr]').forEach(c => { if (!CARR.has(c)) { CARR.set(c, { v: pct, alvo: pct }); if (!carrRaf) carrRaf = requestAnimationFrame(carrPasso); } }), 0), 0) || `<div class="epm-carr" data-carr><div class="epm-cb"><i style="width:${pct}%"></i></div><div class="epm-ct2"><b>${Math.round(pct)}%</b><span>${esc(txt)}</span></div></div>`;
  // a barra anda sozinha entre um passo e outro (devagarinho, sem passar do próximo passo), para nunca parecer travada
  const CARR = new Map(); let carrRaf = 0;
  const carrPasso = () => { carrRaf = 0;
    for (const [c, st] of CARR) { if (!c.isConnected) { CARR.delete(c); continue; }
      const teto = Math.min(99, st.alvo + 14); st.v += st.v < st.alvo ? Math.max(.3, (st.alvo - st.v) * .15) : (teto - st.v) * .006; if (st.alvo >= 100) st.v = Math.min(100, Math.max(st.v, st.alvo));
      c.querySelector('i').style.width = st.v.toFixed(1) + '%'; c.querySelector('b').textContent = Math.floor(st.v) + '%'; }
    if (CARR.size) carrRaf = requestAnimationFrame(carrPasso); };
  function progresso(onde, pct, txt) { const c = onde?.querySelector?.('[data-carr]'); if (!c) return;
    const st = CARR.get(c) || { v: parseFloat(c.querySelector('i').style.width) || 0, alvo: 0 }; st.alvo = Math.max(st.alvo, pct); CARR.set(c, st);
    if (txt) c.querySelector('span').textContent = txt; if (!carrRaf) carrRaf = requestAnimationFrame(carrPasso); }
  async function painelMensagens(o = {}) {
    const M = o.como ? novoEstado(o.como) : MSG; // o.como = ADM vendo as conversas pela visão de outra pessoa (só leitura)
    if (o.como) { o.citar = null; M.comoNome = (await quemU(o.como))?.nome || 'esta pessoa'; }
    const euNome = () => M.comoNome || P?.nome || 'você';
    if (o.citar) { M.citando = { ...o.citar }; M.citando.mini = await miniPequena(o.citar.mini); M.escolha = { alvos: [] }; }
    if (!document.getElementById('ep-conta-css')) { const st = document.createElement('style'); st.id = 'ep-conta-css'; st.textContent = css; document.head.appendChild(st); }
    document.querySelector('.ep-msgs')?.remove(); MSG.janela = null;
    const d = document.createElement('div'); d.className = 'ep-msgs' + (o.como ? ' epm-como' : '');
    d.innerHTML = `<div class="cx" role="dialog" aria-label="Mensagens">
      <aside><h2>${ICONES.msg} <span data-h2>Mensagens</span><button class="epm-bt epm-varias" type="button" title="Mandar a mesma mensagem para várias conversas">${ICONES.equipe}<span>Várias</span></button><button class="epm-bt epm-x2" type="button" data-x>Fechar</button></h2>${o.como ? `<div class="epm-comoAviso">${ICONES.adm} Vendo como <b>${esc(M.comoNome)}</b> · só leitura (nada é marcado como lido)</div>` : ''}<div class="epm-enviaPara" hidden></div><div class="epm-lista" role="list">${carregandoHtml('Buscando as conversas…')}</div><p class="epm-nota epm-pe">As mensagens somem sozinhas depois de 7 dias.</p></aside>
      <section><header><button class="epm-bt epm-volta" type="button" title="Voltar para a lista">${ICONES.voltar}</button><div class="epm-tit"></div><button class="epm-bt x" type="button" data-x>Fechar</button></header>
        <div class="epm-fala" aria-live="polite"><div class="epm-vazio">Escolha a conversa geral ou uma pessoa ao lado.</div></div>
        <form class="epm-escreve" hidden><div class="epm-citaPrev" hidden></div><div class="epm-linhaE"><textarea rows="1" maxlength="2000" placeholder="Escreva uma mensagem…"></textarea><button class="epm-bt epm-envia" type="submit" title="Enviar (Enter)">${ICONES.enviar}</button></div></form></section></div>`;
    document.body.appendChild(d);
    const cx = d.querySelector('.cx'), lista = d.querySelector('.epm-lista'), fala = d.querySelector('.epm-fala'), tit = d.querySelector('.epm-tit'), form = d.querySelector('.epm-escreve'), ta = form.querySelector('textarea');
    // mensagens mais antigas só quando rolar até o topo (abre com as 80 últimas)
    fala.addEventListener('scroll', async () => {
      const c = M.conv; if (fala.scrollTop > 60 || !c?.mais || c.multi || c.puxandoAntigas || !c.msgs.length) return; c.puxandoAntigas = true;
      const aviso = fala.querySelector('.epm-antigas span'); if (aviso) aviso.textContent = 'Carregando as mais antigas…';
      try { const r = await fetch('/mensagens?conv=' + encodeURIComponent(c.id) + '&antes=' + c.msgs[0].id + (M.como ? '&como=' + encodeURIComponent(M.como) : ''), { credentials: 'same-origin', cache: 'no-store' }); const j = await r.json(); if (M.conv !== c) return;
        const h0 = fala.scrollHeight, t0 = fala.scrollTop; c.mais = !!j.mais; juntaMsgs(c.msgs, j.msgs || []); await desenhaConversa(); fala.scrollTop = fala.scrollHeight - h0 + t0; }
      catch { if (aviso) aviso.textContent = 'Não consegui carregar as mais antigas.'; } finally { c.puxandoAntigas = false; }
    }, { passive: true });
    const fechar = () => { d.remove(); document.removeEventListener('keydown', esc1); M.janela = null; M.conv = null; M.citando = null; M.escolha = null; clearInterval(tComo); }, esc1 = e => { if (e.key === 'Escape') fechar(); };
    d.onclick = e => { if (e.target === d) fechar(); }; document.addEventListener('keydown', esc1);
    d.querySelectorAll('[data-x]').forEach(b => b.onclick = fechar); d.querySelector('.epm-volta').onclick = () => { cx.classList.remove('so-conv'); M.conv = null; desenhaLista(); };
    const pessoaDe = u => M.pessoas.find(p => p.u === u);
    const geralNome = () => M.res?.geral?.nome || 'Geral';
    const grupoDe = id => (M.res?.grupos || []).find(g => g.id === id) || (M.res?.todosGrupos || []).find(g => g.id === id);
    const grupoAv = g => g?.foto ? `<span class="epm-av epm-grupo"><img src="${esc(g.foto)}" alt=""></span>` : `<span class="epm-av epm-grupo">${ICONES.equipe}</span>`;
    // ADM: criar / editar / apagar grupo (nome, foto e as pessoas)
    async function editaGrupo(g) {
      d.querySelector('.epm-gedit')?.remove();
      let foto = g?.foto || null; const sel = new Set(g ? g.membros : [M.eu]);
      const gente = [{ u: M.eu, q: { nome: (P?.nome || 'Você') + ' (você)', foto: P?.foto } }, ...(await Promise.all(M.pessoas.map(async p => ({ u: p.u, q: await quemU(p.u) })))).filter(x => x.q?.nome).sort((a, b) => a.q.nome.localeCompare(b.q.nome))];
      const w = document.createElement('div'); w.className = 'epm-gedit';
      w.innerHTML = `<form class="epm-gcx epm-gcx2"><h3>${g ? 'Editar grupo' : 'Novo grupo'}</h3><div class="epm-gl"><button type="button" class="epm-gfoto" title="Escolher a foto do grupo"></button>
        <label>Nome do grupo<input type="text" maxlength="40" value="${esc(g?.nome || '')}" placeholder="Ex.: Animação"></label></div>
        <div class="epm-gmemb-t">Quem está no grupo <span data-n></span><span style="flex:1"></span><button type="button" class="epm-bt" data-tds>Todos</button></div>
        <div class="epm-gmemb">${gente.map(x => `<label><input type="checkbox" value="${esc(x.u)}"${sel.has(x.u) ? ' checked' : ''}>${avU(x.q)}<span>${esc(x.q.nome)}</span></label>`).join('')}</div>
        <p class="epm-nota">Só ADM cria e muda grupos. Só quem está no grupo vê as conversas dele.</p><p class="epm-gerr epm-nota" hidden></p>
        <div class="epm-gbt">${g ? '<button type="button" class="epm-bt epm-verm" data-apaga>Apagar grupo</button>' : ''}<span style="flex:1"></span><button type="button" class="epm-bt" data-c>Cancelar</button><button class="epm-bt epm-pri" type="submit">${g ? 'Salvar' : 'Criar grupo'}</button></div></form>`;
      d.querySelector('.cx').appendChild(w);
      const gf = w.querySelector('.epm-gfoto'), conta = () => { w.querySelector('[data-n]').textContent = `(${w.querySelectorAll('.epm-gmemb input:checked').length})`; };
      const pinta = () => { gf.innerHTML = foto ? `<img src="${esc(foto)}" alt="">` : ICONES.equipe; }; pinta(); conta();
      w.querySelectorAll('.epm-gmemb input').forEach(i => i.onchange = conta);
      w.querySelector('[data-tds]').onclick = () => { const cks = [...w.querySelectorAll('.epm-gmemb input')], tudo = cks.every(i => i.checked); cks.forEach(i => i.checked = !tudo); conta(); };
      gf.onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = async () => { const f = i.files?.[0]; if (!f) return; const u = URL.createObjectURL(f); foto = await fotoQuadrada(u); URL.revokeObjectURL(u); pinta(); }; i.click(); };
      w.querySelector('[data-c]').onclick = () => w.remove(); w.onclick = e => { if (e.target === w) w.remove(); };
      const er = w.querySelector('.epm-gerr'), manda = async corpo => {
        const r = await fetch('/mensagens', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'grupo', ...corpo }) });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error?.message || 'Não salvou.'); return j; };
      w.querySelector('[data-apaga]')?.addEventListener('click', async () => {
        if (!(await pergunta({ titulo: `Apagar o grupo "${g.nome}"?`, texto: 'O grupo e as mensagens dele somem para todo mundo.', ok: 'Apagar' }))) return;
        try { await manda({ acao: 'apagar', id: g.id }); w.remove(); if (M.conv?.id === g.id) { M.conv = null; form.hidden = true; tit.innerHTML = ''; fala.innerHTML = '<div class="epm-vazio">Grupo apagado.</div>'; } await puxaMensagens(false, M); desenhaLista(); }
        catch (x) { er.hidden = false; er.textContent = x.message; } });
      w.querySelector('form').onsubmit = async e => { e.preventDefault();
        try { const j = await manda({ acao: g ? 'editar' : 'criar', id: g?.id, nome: w.querySelector('input[type=text]').value, foto, membros: [...w.querySelectorAll('.epm-gmemb input:checked')].map(i => i.value) });
          w.remove(); await puxaMensagens(false, M); desenhaLista(); if (j.grupo && (j.grupo.membros.includes(M.eu))) abreConv(j.grupo.id, j.grupo.id); }
        catch (x) { er.hidden = false; er.textContent = x.message; } };
      w.querySelector('input[type=text]').focus();
    }
    // apagar para todos: some para a equipe ("Mensagem apagada"); os ADMs ainda veem na aba ADM › Conversas
    async function apagarParaTodos(id) {
      if (!(await pergunta({ titulo: 'Apagar para todos?', texto: 'A mensagem some da conversa para todo mundo (fica "Mensagem apagada").', ok: 'Apagar para todos' }))) return;
      try { const r = await fetch('/mensagens', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'apagar', id }) });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error?.message || 'Não apagou.');
        const m = M.conv?.msgs?.find(x => x.id === id); if (m) { m.apagada = j.apagada || Date.now(); m.texto = ''; m.cita = null; } desenhaConversa(); await puxaMensagens(false, M); }
      catch (x) { const n = document.createElement('div'); n.className = 'epm-erro'; n.textContent = x.message; fala.appendChild(n); setTimeout(() => n.remove(), 4000); }
    }
    // denunciar: vai para os ADMs com a cópia da conversa em volta (não some em 7 dias)
    function denunciar(id) {
      d.querySelector('.epm-gedit')?.remove();
      const g = document.createElement('div'); g.className = 'epm-gedit';
      g.innerHTML = `<form class="epm-gcx"><h3>Denunciar mensagem</h3><p class="epm-nota" style="margin:0 0 10px">A mensagem e a conversa em volta vão para os ADMs do Estúdio, com o seu nome. Quem enviou não fica sabendo.</p>
        <label class="epm-gl" style="display:grid"><span class="epm-nota" style="margin:0">O que aconteceu? (opcional)</span><textarea rows="3" maxlength="1000" style="resize:vertical;border-radius:8px;border:1px solid #4a4c55;background:#1f2025;color:#e9ebef;font:inherit;padding:8px 10px"></textarea></label>
        <p class="epm-gerr epm-nota" hidden></p><div class="epm-gbt"><span style="flex:1"></span><button type="button" class="epm-bt" data-c>Cancelar</button><button class="epm-bt epm-verm2" type="submit">${ICONES.bandeira} Denunciar</button></div></form>`;
      d.querySelector('.cx').appendChild(g);
      g.querySelector('[data-c]').onclick = () => g.remove(); g.onclick = e => { if (e.target === g) g.remove(); };
      g.querySelector('form').onsubmit = async e => { e.preventDefault(); const er = g.querySelector('.epm-gerr');
        try { const r = await fetch('/mensagens', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'denunciar', id, motivo: g.querySelector('textarea').value }) });
          const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error?.message || 'Não deu para denunciar.');
          g.querySelector('form').innerHTML = `<h3>Denúncia enviada</h3><p class="epm-nota">${j.ja ? 'Você já tinha denunciado esta mensagem.' : 'Os ADMs foram avisados. Obrigado por avisar.'}</p><div class="epm-gbt"><span style="flex:1"></span><button type="button" class="epm-bt epm-pri" data-c>Ok</button></div>`;
          g.querySelector('[data-c]').onclick = () => g.remove(); }
        catch (x) { er.hidden = false; er.textContent = x.message; } };
      g.querySelector('textarea').focus();
    }
    // apelido que VOCÊ deu (só você vê): "Nome (apelido)"
    function editaApelido(u, q) {
      d.querySelector('.epm-gedit')?.remove();
      const atual = M.res?.apelidos?.[u] || '', g = document.createElement('div'); g.className = 'epm-gedit';
      g.innerHTML = `<form class="epm-gcx"><h3>Apelido</h3><div class="epm-gl">${avU(q)}<label>Apelido para ${esc(q?.nome || 'esta pessoa')}<input type="text" maxlength="30" value="${esc(atual)}" placeholder="Como você chama essa pessoa"></label></div>
        <p class="epm-nota">Só você vê. Aparece entre parênteses depois do nome, em todas as conversas.</p><p class="epm-gerr epm-nota" hidden></p>
        <div class="epm-gbt">${atual ? '<button type="button" class="epm-bt" data-tira>Tirar o apelido</button>' : ''}<span style="flex:1"></span><button type="button" class="epm-bt" data-c>Cancelar</button><button class="epm-bt epm-pri" type="submit">Salvar</button></div></form>`;
      d.querySelector('.cx').appendChild(g);
      const salva = async nick => { const er = g.querySelector('.epm-gerr');
        try { const r = await fetch('/mensagens', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'apelido', alvo: u, nick }) });
          const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error?.message || 'Não salvou.');
          if (M.res) { M.res.apelidos = { ...(M.res.apelidos || {}) }; if (j.nick) M.res.apelidos[u] = j.nick; else delete M.res.apelidos[u]; }
          g.remove(); desenhaLista(); pintaTitulo(); desenhaConversa(); }
        catch (x) { er.hidden = false; er.textContent = x.message; } };
      g.querySelector('[data-tira]')?.addEventListener('click', () => salva(''));
      g.querySelector('[data-c]').onclick = () => g.remove(); g.onclick = e => { if (e.target === g) g.remove(); };
      g.querySelector('form').onsubmit = e => { e.preventDefault(); salva(g.querySelector('input').value); };
      const i = g.querySelector('input'); i.focus(); i.select();
    }
    const geralAv = () => M.res?.geral?.foto ? `<span class="epm-av epm-geral"><img src="${esc(M.res.geral.foto)}" alt=""></span>` : `<span class="epm-av epm-geral">${ICONES.equipe}</span>`;
    // ADM: nome e foto da conversa geral
    function editaGeral() {
      d.querySelector('.epm-gedit')?.remove();
      let foto = M.res?.geral?.foto || null;
      const g = document.createElement('div'); g.className = 'epm-gedit';
      g.innerHTML = `<form class="epm-gcx"><h3>Conversa geral</h3><div class="epm-gl"><button type="button" class="epm-gfoto" title="Escolher a foto">${foto ? `<img src="${esc(foto)}" alt="">` : ICONES.equipe}</button>
        <label>Nome<input type="text" maxlength="40" value="${esc(M.res?.geral?.nome || '')}" placeholder="Geral"></label></div>
        <p class="epm-nota">Só ADM muda. Todo mundo da equipe passa a ver o nome e a foto novos.</p><p class="epm-gerr epm-nota" hidden></p>
        <div class="epm-gbt"><button type="button" class="epm-bt" data-tira>Tirar a foto</button><span style="flex:1"></span><button type="button" class="epm-bt" data-c>Cancelar</button><button class="epm-bt epm-pri" type="submit">Salvar</button></div></form>`;
      d.querySelector('.cx').appendChild(g);
      const gf = g.querySelector('.epm-gfoto'), pinta = () => { gf.innerHTML = foto ? `<img src="${esc(foto)}" alt="">` : ICONES.equipe; g.querySelector('[data-tira]').hidden = !foto; }; pinta();
      gf.onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = async () => { const f = i.files?.[0]; if (!f) return; const u = URL.createObjectURL(f); foto = await fotoQuadrada(u); URL.revokeObjectURL(u); pinta(); }; i.click(); };
      g.querySelector('[data-tira]').onclick = () => { foto = null; pinta(); };
      g.querySelector('[data-c]').onclick = () => g.remove(); g.onclick = e => { if (e.target === g) g.remove(); };
      g.querySelector('form').onsubmit = async e => { e.preventDefault(); const er = g.querySelector('.epm-gerr');
        try { const r = await fetch('/mensagens', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'geral', nome: g.querySelector('input').value, foto }) });
          const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error?.message || 'Não salvou.');
          if (M.res) M.res.geral = j.geral; g.remove(); desenhaLista(); pintaTitulo(); }
        catch (x) { er.hidden = false; er.textContent = x.message; } };
      g.querySelector('input').focus();
    }
    const citaPrev = form.querySelector('.epm-citaPrev'), enviaPara = d.querySelector('.epm-enviaPara');
    function pintaCitando() {
      const c = M.citando, e = M.escolha; d.querySelector('[data-h2]').textContent = e ? 'Enviar para…' : 'Mensagens';
      d.querySelector('.epm-varias').classList.toggle('epm-on2', !!e);
      enviaPara.hidden = !e; citaPrev.hidden = !c;
      const cc = c && { ...c, anexo: c.arquivo ? { bytes: c.tamanho || 0, nome: c.nomeArquivo || '' } : null };
      if (e) {
        enviaPara.innerHTML = `${cc ? `<div class="epm-cita epm-mini">${citaHtml(cc, -1).replace(/<em>.*?<\/em>/, '')}</div>` : ''}<p class="epm-nota">Escolha uma ou mais conversas${cc ? ' (pode ser a geral também): a citação vai junto e você pode escrever mais.' : ': a mesma mensagem vai para cada uma, separada.'}</p>
          <div class="epm-epbt"><button type="button" class="epm-bt" data-todas title="Todas as conversas privadas (sem a geral e sem os grupos)">${ICONES.equipe} Todas as pessoas</button><button type="button" class="epm-bt" data-limpa>Limpar</button><span style="flex:1"></span><button type="button" class="epm-bt" data-cancela>Cancelar</button></div>`;
        enviaPara.querySelector('[data-todas]').onclick = () => { e.alvos = e.alvos.filter(a => !a.id.startsWith('p:')).concat(M.pessoas.map(p => ({ id: 'p:' + [M.eu, p.u].sort().join('|'), u: p.u }))); escolhaMudou(); };
        enviaPara.querySelector('[data-limpa]').onclick = () => { e.alvos = []; escolhaMudou(); };
        enviaPara.querySelector('[data-cancela]').onclick = () => { M.escolha = null; M.citando = null; M.conv = null; form.hidden = true; tit.innerHTML = ''; fala.innerHTML = '<div class="epm-vazio">Escolha a conversa geral ou uma pessoa ao lado.</div>'; pintaCitando(); desenhaLista(); };
      }
      if (!c) { citaPrev.innerHTML = ''; return; }
      citaPrev.innerHTML = `<div class="epm-cita epm-mini">${citaHtml(cc, -1).replace(/<em>.*?<\/em>/, '')}</div><button class="epm-bt epm-tira" type="button" title="Tirar a citação">${ICONES.fechar || '×'}</button>`;
      citaPrev.querySelector('.epm-tira').onclick = () => { M.citando = null; pintaCitando(); };
    }
    d.querySelector('.epm-varias').onclick = () => { if (M.escolha) { M.escolha = null; M.citando = null; } else { M.escolha = { alvos: M.conv && !M.conv.multi ? [{ id: M.conv.id, u: M.conv.u }] : [] }; } pintaCitando(); desenhaLista(); if (M.escolha) escolhaMudou(); };
    pintaCitando();
    async function desenhaLista() {
      const R = M.res || { nao: {}, ultimas: {} }, ult = R.ultimas || {}, nao = R.nao || {};
      const convs = [{ id: 'geral', u: 'geral' }, ...M.pessoas.map(p => ({ id: 'p:' + [M.eu, p.u].sort().join('|'), u: p.u, p }))];
      for (const c of Object.keys(ult)) if (c.startsWith('p:') && !convs.some(x => x.id === c)) convs.push({ id: c, u: outroDe(c, M.eu) });
      const grupos = (R.grupos || []).map(g => ({ id: g.id, u: g.id, g }));
      const qs = await Promise.all(convs.map(c => c.u === 'geral' ? null : quemU(c.u)));
      convs.forEach((c, i) => c.q = qs[i]);
      const cods = [...new Set(Object.values(ult).flatMap(m => codigosMenc(m.texto)))], nomesL = Object.fromEntries(await Promise.all(cods.map(async u => [u, u === M.eu ? euNome() : (await quemU(u))?.nome || 'alguém'])));
      const resto = convs.slice(1).filter(c => c.q?.nome).sort((a, b) => (ult[b.id]?.id || 0) - (ult[a.id]?.id || 0) || (!!b.p?.on - !!a.p?.on) || nomeU(a.u, a.q, M).localeCompare(nomeU(b.u, b.q, M)));
      const menc = R.mencoes || {};
      const linha = c => { const m = ult[c.id], n = nao[c.id] || 0, mc = menc[c.id] || 0, geral = c.id === 'geral', on = c.p?.on, grupo = c.g;
        const citaDe = x => { try { return x.cita ? JSON.parse(x.cita) : null; } catch { return null; } }, cm = m && citaDe(m);
        const prev = m ? (m.de === M.eu ? 'Você: ' : '') + (m.apagada && !M.como ? 'Mensagem apagada' : semMenc(m.texto, nomesL).replace(/\s+/g, ' ').slice(0, 60) || (cm ? 'Citou: ' + cm.titulo : '')) : geral ? 'Conversa de toda a equipe' : grupo ? `Grupo · ${grupo.membros.length} pessoas` : on ? 'online' : 'Nenhuma mensagem ainda';
        const alvo = M.escolha ? M.escolha.alvos.some(a => a.id === c.id) : false;
        return `<button type="button" class="epm-pes${!M.escolha && M.conv?.id === c.id ? ' epm-sel' : ''}${alvo ? ' epm-alvo' : ''}${n ? ' epm-tem' : ''}" data-c="${esc(c.id)}" data-u="${esc(c.u)}" role="listitem">${M.escolha ? `<span class="epm-ck">${alvo ? ICONES.ok : ''}</span>` : ''}
          <span class="epm-avw">${geral ? geralAv() : grupo ? grupoAv(grupo) : avU(c.q)}${on ? '<i class="epm-on"></i>' : ''}</span>
          <span class="epm-tx"><b>${geral ? esc(geralNome()) : grupo ? esc(grupo.nome) : esc(nomeU(c.u, c.q, M)) + chaveAdm(c.q)}</b><small${geral || !on ? '' : ' class="ondeOn"'}>${on && !m ? esc(prev) : esc(prev)}</small></span>
          ${mc ? '<b class="epm-cont epm-arroba" title="Citaram você">@</b>' : ''}${n ? `<b class="epm-cont">${n > 99 ? '99+' : n}</b>` : ''}</button>`; };
      const geralC = convs[0];
      grupos.sort((a, b) => (ult[b.id]?.id || 0) - (ult[a.id]?.id || 0) || a.g.nome.localeCompare(b.g.nome));
      // ABAS (pedido da dona, 05/11/2026): conversas privadas de um lado, grupos (com a geral da equipe) do outro, cada aba com as não lidas
      const somaN = L => L.reduce((t, c) => t + (nao[c.id] || 0), 0), grpL = [geralC, ...grupos], nP = somaN(resto), nG = somaN(grpL);
      if (!M.aba) M.aba = nG && !nP ? 'grp' : 'priv';
      const nAba = n => n ? ` <i>${n > 99 ? '99+' : n}</i>` : '';
      lista.innerHTML = `<div class="epm-abas" role="tablist"><button type="button" role="tab" data-aba="priv" aria-selected="${M.aba === 'priv'}">Privadas${nAba(nP)}</button><button type="button" role="tab" data-aba="grp" aria-selected="${M.aba === 'grp'}">Grupos${nAba(nG)}</button></div>`
        + (M.aba === 'grp' ? grpL.map(linha).join('') + (R.adm ? `<button type="button" class="epm-novog" title="Só ADM: criar um grupo com pessoas escolhidas">${ICONES.mais} Novo grupo</button>` : '')
          : resto.length ? resto.map(linha).join('') : '<p class="epm-nota">Ainda ninguém da equipe por aqui.</p>');
      lista.querySelectorAll('[data-aba]').forEach(bt => bt.onclick = () => { M.aba = bt.dataset.aba; desenhaLista(); });
      lista.querySelector('.epm-novog')?.addEventListener('click', () => editaGrupo(null));
      lista.querySelectorAll('[data-c]').forEach(b => b.onclick = () => M.escolha ? marcaAlvo(b.dataset.c, b.dataset.u) : abreConv(b.dataset.c, b.dataset.u));
      if (M.conv) pintaTitulo();
    }
    async function pintaTitulo() {
      const c = M.conv; if (!c) return;
      if (c.multi) { const nomes = await Promise.all(c.alvos.map(async a => a.u === 'geral' ? geralNome() : a.u.startsWith('g:') ? (grupoDe(a.u)?.nome || 'Grupo') : nomeU(a.u, await quemU(a.u), M))); if (M.conv !== c) return;
        tit.innerHTML = `<span class="epm-av epm-geral">${ICONES.msg}</span><span style="min-width:0"><b>Para ${c.alvos.length} conversas</b><small>${esc(nomes.join(', '))}</small></span>`; return; }
      if (c.u.startsWith('g:')) { const g = grupoDe(c.u); tit.innerHTML = `${grupoAv(g)}<span style="min-width:0"><b>${esc(g?.nome || 'Grupo')}</b><small>Grupo · ${g?.membros.length || 0} pessoas · só quem está nele vê</small></span>${M.res?.adm ? `<button class="epm-bt epm-edg" type="button" title="Só ADM: nome, foto e pessoas do grupo">${ICONES.lapis} Editar</button>` : ''}`;
        tit.querySelector('.epm-edg')?.addEventListener('click', () => editaGrupo(g)); return; }
      if (c.u === 'geral') { tit.innerHTML = `${geralAv()}<span style="min-width:0"><b>${esc(geralNome())}</b><small>Conversa geral · todo mundo da equipe vê</small></span>${M.res?.adm ? `<button class="epm-bt epm-edg" type="button" title="Só ADM: mudar o nome e a foto da conversa geral">${ICONES.lapis} Editar</button>` : ''}`;
        tit.querySelector('.epm-edg')?.addEventListener('click', editaGeral); return; }
      const q = await quemU(c.u), on = pessoaDe(c.u)?.on;
      tit.innerHTML = `<span class="epm-avw">${avU(q)}${on ? '<i class="epm-on"></i>' : ''}</span><span style="min-width:0"><b>${esc(nomeU(c.u, q, M))}${chaveAdm(q)}</b><small>${on ? 'Online agora' : 'Conversa privada · só vocês dois veem'}</small></span><button class="epm-bt epm-edg" type="button" title="Dar um apelido (só você vê, entre parênteses)">${ICONES.lapis} Apelido</button>`;
      tit.querySelector('.epm-edg').onclick = () => editaApelido(c.u, q);
    }
    async function desenhaConversa() {
      const c = M.conv; if (!c) return;
      const perto = fala.scrollHeight - fala.scrollTop - fala.clientHeight < 80;
      if (!c.msgs.length && !c.pend?.length) { fala.innerHTML = `<div class="epm-vazio">${c.u === 'geral' ? 'Ninguém escreveu na conversa geral nos últimos 7 dias.' : c.u.startsWith('g:') ? 'Ninguém escreveu neste grupo nos últimos 7 dias.' : 'Comece a conversa. Só vocês dois veem.'}</div>`; return; }
      const autores = [...new Set([...c.msgs.map(m => m.de), ...c.msgs.flatMap(m => codigosMenc(m.texto))].filter(u => u !== M.eu))], qs = Object.fromEntries(await Promise.all(autores.map(async u => [u, await quemU(u)])));
      const nomesM = Object.fromEntries(Object.entries(qs).map(([u, q]) => [u, q?.nome || 'alguém'])); nomesM[M.eu] = euNome();
      let h = c.mais && !c.multi ? '<div class="epm-dia epm-antigas"><span>Role para cima para ver as mais antigas</span></div>' : '', dia = '', ant = null; const cits = [];
      for (const m of c.msgs) {
        const dd = diaTxt(m.em); if (dd !== dia) { h += `<div class="epm-dia"><span>${esc(dd)}</span></div>`; dia = dd; ant = null; }
        const meu = m.de === M.eu, junto = ant && ant.de === m.de && m.em - ant.em < 5 * 6e4, q = qs[m.de];
        const prame = !meu && String(m.texto || '').includes('<@' + M.eu + '>');
        h += `<div class="epm-m${meu ? ' epm-meu' : ''}${junto ? ' epm-junto' : ''}${prame ? ' epm-prame' : ''}${m.apagada ? (M.como ? ' epm-apagadaAdm' : ' epm-apagada') : ''}">${meu ? '' : (junto ? '<span class="epm-av epm-avvz"></span>' : avU(q))}<div class="epm-b">${!meu && !junto && (c.u === 'geral' || c.u.startsWith('g:')) ? `<b>${esc(nomeU(m.de, q, M))}${chaveAdm(q)}</b>` : ''}${m.cita ? (() => { try { const c = JSON.parse(m.cita); cits.push(c); return citaHtml(c, cits.length - 1, true); } catch { return ''; } })() : ''}${m.apagada ? `<div class="epm-apg">${ICONES.lixo} ${M.como ? 'Apagada para todos · ' + esc(new Date(m.apagada).toLocaleString('pt-BR')) : 'Mensagem apagada'}</div>` : ''}${m.texto ? `<p>${textoMsg(m.texto, nomesM, M.eu)}</p>` : ''}<time title="${esc(new Date(m.em).toLocaleString('pt-BR'))}">${horaTxt(m.em)}${meu && !m.apagada ? `<span class="epm-tk" data-tk="${m.id}"></span>` : ''}</time></div>${m.apagada && !M.como ? '' : meu ? `<button type="button" class="epm-denuncia" data-apaga="${m.id}" title="Apagar para todos">${ICONES.lixo}</button>` : `<button type="button" class="epm-denuncia" data-den="${m.id}" title="Denunciar esta mensagem para os ADMs">${ICONES.bandeira}</button>`}</div>`;
        ant = m;
      }
      fala.innerHTML = h + (c.pend || []).map(pendHtml).join(''); ligaPend(fala);
      pintaTicks();
      fala.querySelectorAll('[data-den]').forEach(b => b.onclick = () => denunciar(+b.dataset.den));
      fala.querySelectorAll('[data-apaga]').forEach(b => b.onclick = () => apagarParaTodos(+b.dataset.apaga));
      fala.querySelectorAll('[data-cita]').forEach(el => { const abre = () => abreCitacao(cits[+el.dataset.cita]); el.onclick = abre; el.onkeydown = e => { if (e.key === 'Enter') abre(); }; });
      fala.querySelectorAll('.epm-cita img').forEach(im => im.addEventListener('load', () => { if (perto || c.primeira) fala.scrollTop = fala.scrollHeight; }, { once: true }));
      if (perto || c.primeira) { fala.scrollTop = fala.scrollHeight; c.primeira = false; }
    }
    async function marcaAlvo(id, u) {
      const c = M.escolha; const i = c.alvos.findIndex(a => a.id === id); if (i >= 0) c.alvos.splice(i, 1); else c.alvos.push({ id, u });
      return escolhaMudou();
    }
    async function escolhaMudou() {
      const c = M.escolha; if (!c) return; desenhaLista();
      if (c.alvos.length === 1) return abreConv(c.alvos[0].id, c.alvos[0].u);
      if (!c.alvos.length) { M.conv = null; form.hidden = true; tit.innerHTML = ''; fala.innerHTML = `<div class="epm-vazio">Escolha ao lado uma ou mais conversas${M.citando ? ' para mandar a citação' : ''}.</div>`; return; }
      M.conv = { multi: true, alvos: c.alvos.slice(), msgs: [] }; cx.classList.add('so-conv'); form.hidden = false;
      pintaTitulo();
      fala.innerHTML = `<div class="epm-vazio">${M.citando ? 'A citação e o que você escrever vão' : 'O que você escrever vai'} para cada conversa escolhida, separad${M.citando ? 'as' : 'o'}.${M.citando?.arquivo ? ' O arquivo sobe uma vez só.' : ''}</div>`; ta.focus();
    }
    // ✓ enviada · ✓✓ cinza recebida por todos da conversa · ✓✓ azul lida por todos (como no WhatsApp)
    function pintaTicks() {
      const v = M.conv?.vistos; if (!v) return; const n = v.part.length;
      fala.querySelectorAll('[data-tk]').forEach(el => {
        const id = +el.dataset.tk, leram = v.part.filter(u => (v.lidas[u] || 0) >= id).length, receb = v.part.filter(u => Math.max(v.entregues[u] || 0, v.lidas[u] || 0) >= id).length;
        const est = n && leram === n ? 'lida' : n && receb === n ? 'recebida' : 'enviada';
        if (el.dataset.est === est && el.dataset.n === String(leram)) return; el.dataset.est = est; el.dataset.n = String(leram);
        el.className = 'epm-tk epm-tk-' + est; el.innerHTML = est === 'enviada' ? ICONES.tk1 : ICONES.tk2;
        el.title = est === 'lida' ? (n > 1 ? 'Lida por todos' : 'Lida') : est === 'recebida' ? (n > 1 ? `Recebida por todos · lida por ${leram} de ${n}` : 'Recebida') : (n > 1 ? `Enviada · recebida por ${receb} de ${n} · lida por ${leram}` : 'Enviada');
      });
    }
    async function abreConv(id, u) {
      if (!M.como && M.eu) leCacheConv(M.eu);
      const G = !M.como && cacheConv.c[id], ultG = G?.msgs?.at(-1)?.id || 0;
      M.conv = { id, u, msgs: G ? G.msgs.slice() : [], mais: !!G?.mais, primeira: true }; cx.classList.add('so-conv'); form.hidden = false;
      pintaTitulo(); desenhaLista();
      if (G) { await desenhaConversa(); ta.focus(); } else fala.innerHTML = carregandoHtml('Baixando as mensagens…', 12); // guardada: aparece na hora
      if (id.startsWith('p:') && !(M.res?.ultimas?.[id])) { if (!G) { M.conv.msgs = []; desenhaConversa(); } ta.focus(); return; }
      try { const r = await fetch('/mensagens?conv=' + encodeURIComponent(id) + (ultG ? '&desde=' + ultG : '') + (M.como ? '&como=' + encodeURIComponent(M.como) : ''), { credentials: 'same-origin', cache: 'no-store' }); const j = await r.json(); if (M.conv?.id !== id) return;
        if (j.delta) { const lista = j.ids ? M.conv.msgs.filter(m => m.id >= j.ids) : []; M.conv.msgs = juntaMsgs(lista, j.msgs || []); } // o que foi limpo some daqui também
        else { M.conv.msgs = j.msgs || []; M.conv.mais = !!j.mais; }
        M.conv.vistos = j.vistos || null; guardaConv(M, id, M.conv.msgs, M.conv.mais); }
      catch { if (!G) fala.innerHTML = '<div class="epm-vazio">Não consegui abrir a conversa. Confira a internet.</div>'; return; }
      if (G) { await desenhaConversa(); marcaLida(id, M); desenhaLista(); return; }
      { const quem = [...new Set([...M.conv.msgs.map(m => m.de), ...M.conv.msgs.flatMap(m => codigosMenc(m.texto))].filter(x => x !== M.eu))]; let k = 0; // nomes e fotos de quem escreveu
        progresso(fala, 55, `Carregando nomes e fotos (0 de ${quem.length})`);
        await Promise.all(quem.map(x => quemU(x).then(() => { k++; if (M.conv?.id === id) progresso(fala, 55 + k / quem.length * 40, `Carregando nomes e fotos (${k} de ${quem.length})`); }))); if (M.conv?.id !== id) return; progresso(fala, 100, 'Pronto'); }
      desenhaConversa(); marcaLida(id, M); desenhaLista(); ta.focus();
    }
    if (o.para) setTimeout(() => abreConv(o.para === 'geral' ? 'geral' : 'p:' + [M.eu, o.para].sort().join('|'), o.para), 0);
    const ajusta = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight) + 'px'; };
    // @: sugere as pessoas; no envio "@Nome" vira <@código> (o nome de agora aparece para todo mundo)
    const mencionados = new Map(); let sug = null, sugI = 0, sugL = [];
    const fechaSug = () => { sug?.remove(); sug = null; };
    async function sugere() {
      const ate = ta.value.slice(0, ta.selectionStart), m = ate.match(/(^|\s)@([^\s@]{0,20})$/); if (!m) return fechaSug();
      const q = m[2].toLowerCase(), gr = M.conv?.u?.startsWith?.('g:') ? grupoDe(M.conv.u) : null, todos = await Promise.all(M.pessoas.filter(p => !gr || gr.membros.includes(p.u)).map(async p => ({ u: p.u, q: await quemU(p.u) })));
      sugL = todos.filter(x => x.q?.nome && (nomeU(x.u, x.q, M).toLowerCase().includes(q))).sort((a, b) => a.q.nome.localeCompare(b.q.nome)).slice(0, 8);
      if (!sugL.length) return fechaSug();
      sugI = Math.min(sugI, sugL.length - 1);
      if (!sug) { sug = document.createElement('div'); sug.className = 'epm-sugere'; form.appendChild(sug); }
      sug.innerHTML = sugL.map((x, i) => `<button type="button" class="${i === sugI ? 'epm-sel' : ''}" data-i="${i}">${avU(x.q)}<span>${esc(nomeU(x.u, x.q, M))}${chaveAdm(x.q)}</span></button>`).join('');
      sug.querySelectorAll('[data-i]').forEach(b => b.onmousedown = e => { e.preventDefault(); escolheSug(+b.dataset.i); });
    }
    function escolheSug(i) {
      const x = sugL[i]; if (!x) return; const nome = x.q.nome, ate = ta.value.slice(0, ta.selectionStart), depois = ta.value.slice(ta.selectionStart);
      const novo = ate.replace(/@([^\s@]{0,20})$/, '@' + nome + ' '); ta.value = novo + depois; ta.selectionStart = ta.selectionEnd = novo.length;
      mencionados.set(nome, x.u); fechaSug(); ajusta(); ta.focus();
    }
    const comMencoes = t => {
      // escolhidos na lista + quem foi escrito à mão (@Nome completo, ou só o primeiro nome se for de uma pessoa só)
      const cand = new Map(mencionados), prim = new Map();
      for (const p of M.pessoas) { const n = NOMES.get(p.u); if (!n) continue; if (!cand.has(n)) cand.set(n, p.u); const f = n.split(/\s+/)[0]; prim.set(f, prim.has(f) ? null : p.u); }
      for (const [f, u] of prim) if (u && !cand.has(f)) cand.set(f, u);
      let r = t; const escRe = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const [nome, u] of [...cand].sort((a, b) => b[0].length - a[0].length)) r = r.replace(new RegExp('@' + escRe(nome) + '(?![\\p{L}\\p{N}_])', 'giu'), '<@' + u + '>');
      return r; };
    ta.oninput = () => { ajusta(); sugI = 0; sugere(); };
    ta.onblur = () => setTimeout(fechaSug, 150);
    ta.onkeydown = e => {
      if (sug && ['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); sugI = (sugI + (e.key === 'ArrowDown' ? 1 : -1) + sugL.length) % sugL.length; sugere(); return; }
      if (sug && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); escolheSug(sugI); return; }
      if (sug && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechaSug(); return; }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } };
    // enviar: a mensagem sai da caixa na hora e aparece meio transparente, com barra e %, até chegar no servidor
    let fila = Promise.resolve();
    const ciVer = ci => ci && { ...ci, anexo: ci.arquivo ? { bytes: ci.tamanho || 0, nome: ci.nomeArquivo || '' } : null };
    const nomesJa = () => { const o = Object.fromEntries(NOMES); o[M.eu] = euNome(); return o; };
    function pendHtml(pe) {
      const falhou = pe.est === 'falhou';
      return `<div class="epm-m epm-meu epm-pend${falhou ? ' epm-falhou' : ''}" data-pend="${pe.key}"><div class="epm-b">${pe.ci ? citaHtml(ciVer(pe.ci), -1) : ''}${pe.texto ? `<p>${textoMsg(pe.texto, nomesJa(), M.eu)}</p>` : ''}
        ${falhou ? `<div class="epm-perr">${esc(pe.erro || 'Não enviou.')}</div><div class="epm-pbt"><button type="button" class="epm-bt" data-retry>Tentar de novo</button><button type="button" class="epm-bt" data-desc>Descartar</button></div>`
          : `<div class="epm-pbar"><i style="width:${pe.pct}%"></i></div><time><b>${Math.round(pe.pct)}%</b> ${esc(pe.txt)}</time>`}</div></div>`;
    }
    function ligaPend(raiz) {
      raiz.querySelectorAll('[data-pend]').forEach(el => { const pe = (M.conv?.pend || []).find(x => x.key === el.dataset.pend); if (!pe) return;
        el.querySelector('[data-retry]')?.addEventListener('click', () => { pe.est = ''; pe.erro = ''; pe.pct = 3; pe.txt = 'Enviando…'; pintaPendEl(pe, true); fila = fila.then(() => enviaPend(pe)); });
        el.querySelector('[data-desc]')?.addEventListener('click', () => { pe.conv.pend = pe.conv.pend.filter(x => x !== pe); el.remove(); }); });
    }
    function pintaPendEl(pe, tudo) {
      if (M.conv !== pe.conv) return; const el = fala.querySelector(`[data-pend="${pe.key}"]`);
      if (!el) { fala.querySelector(':scope > .epm-vazio')?.remove(); fala.insertAdjacentHTML('beforeend', pendHtml(pe)); ligaPend(fala); fala.scrollTop = fala.scrollHeight; return; }
      if (tudo || pe.est === 'falhou') { el.outerHTML = pendHtml(pe); ligaPend(fala); return; }
      const i = el.querySelector('.epm-pbar i'), t = el.querySelector('time'); if (i) i.style.width = pe.pct + '%'; if (t) t.innerHTML = `<b>${Math.round(pe.pct)}%</b> ${esc(pe.txt)}`;
    }
    async function enviaPend(pe) {
      const c = pe.conv, alvos = pe.alvos, ci = pe.ci, atu = (pct, txt) => { pe.pct = Math.max(pe.pct, pct); if (txt) pe.txt = txt; pintaPendEl(pe); };
      try {
        let cita = null;
        if (ci) {
          cita = { prog: ci.prog, titulo: ci.titulo, sub: ci.sub, mini: ci.mini, url: ci.url, abrir: ci.abrir, parte: ci.parte };
          if (ci.arquivo) { // o arquivo sobe uma vez só e vale para todas as conversas escolhidas
            atu(5, 'Preparando o arquivo…');
            const a = pe.arq || (pe.arq = await ci.arquivo()); if (!a?.blob) throw new Error('O programa não conseguiu montar o arquivo.');
            const up = await new Promise((ok, falha) => { const x = new XMLHttpRequest();
              x.open('POST', '/mensagens/anexo?para=' + encodeURIComponent(alvos.map(a2 => a2.u).join(',')) + '&nome=' + encodeURIComponent(a.nome || 'arquivo'));
              x.upload.onprogress = ev => { if (ev.lengthComputable) atu(10 + ev.loaded / ev.total * 75, `Enviando ${a.nome || 'o arquivo'} (${fmtTam(ev.loaded)} de ${fmtTam(ev.total)})`); };
              x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch { } x.status < 300 ? ok(j) : falha(new Error(j.error?.message || 'Não deu para enviar o arquivo.')); };
              x.onerror = () => falha(new Error('A internet caiu no meio do envio.')); x.send(a.blob); });
            cita.anexo = { id: up.id };
          }
        }
        const base = pe.pct < 10 ? 20 : pe.pct, feitas = [];
        atu(base, alvos.length > 1 ? `Enviando para ${alvos.length} conversas…` : 'Enviando…');
        for (const al of alvos) {
          const r = await fetch('/mensagens', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'enviar', para: al.u, texto: pe.texto, cita }) });
          const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error?.message || 'Não deu para enviar.');
          feitas.push(j.msg); if (M.res) M.res.ultimas = { ...(M.res.ultimas || {}), [j.msg.conv]: j.msg };
          atu(base + (100 - base) * feitas.length / alvos.length, alvos.length > 1 ? `Enviado ${feitas.length} de ${alvos.length}` : 'Enviando…');
        }
        c.pend = (c.pend || []).filter(x => x !== pe);
        if (c.multi) { desenhaLista(); if (M.conv === c) { await abreConv(feitas[0].conv, alvos[0].u); const n = document.createElement('div'); n.className = 'epm-enviando'; n.textContent = `Enviado para ${feitas.length} conversas.`; fala.appendChild(n); setTimeout(() => n.remove(), 3500); } }
        else { for (const m of feitas) if (!c.msgs.some(x => x.id === m.id)) c.msgs.push(m); if (c.id !== feitas[0].conv) c.id = feitas[0].conv; if (M.conv === c) { c.primeira = true; desenhaConversa(); } desenhaLista(); }
      } catch (er) { pe.est = 'falhou'; pe.erro = er.message; pintaPendEl(pe, true); }
    }
    form.onsubmit = e => {
      e.preventDefault(); const texto = comMencoes(ta.value.trim()), c = M.conv, ci = M.citando; if ((!texto && !ci) || !c) return;
      const pe = { key: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), texto, ci, conv: c, alvos: c.multi ? c.alvos.slice() : [{ id: c.id, u: c.u }], pct: 3, txt: ci?.arquivo ? 'Preparando o arquivo…' : 'Enviando…' };
      ta.value = ''; ajusta(); mencionados.clear(); fechaSug(); if (ci || c.multi) { M.citando = null; M.escolha = null; pintaCitando(); desenhaLista(); }
      (c.pend ||= []).push(pe); pintaPendEl(pe);
      fila = fila.then(() => enviaPend(pe)); ta.focus();
    };
    M.janela = { desenhaLista, desenhaConversa, pintaTicks };
    const tComo = o.como ? setInterval(() => { if (document.visibilityState === 'visible') puxaMensagens(false, M); }, 8000) : 0;
    M.abertoEm = Date.now(); M.ultimaVolta = Date.now();
    progresso(lista, 15, 'Buscando as conversas…');
    await puxaMensagens(true, M);
    { const quem = M.pessoas.map(p => p.u); let k = 0; progresso(lista, 45, `Carregando nomes e fotos (0 de ${quem.length})`);
      await Promise.all(quem.map(x => quemU(x).then(() => { k++; progresso(lista, 45 + k / Math.max(1, quem.length) * 50, `Carregando nomes e fotos (${k} de ${quem.length})`); })));
      progresso(lista, 100, 'Pronto'); }
    desenhaLista();
  }

  /* ---------- ADM › Conversas: denúncias + ver as conversas pela visão de cada pessoa (só leitura) ----------
     Só para ADM (o porteiro confere). Nada daqui aparece nas Mensagens das pessoas. */
  const ADMC = { dados: null };
  const quemHtmlA = q => `<span class="epa-quem">${avU(q, 'epa-av')}<span><b>${esc(q?.nome || 'Alguém')}</b><small>${esc(q?.email || '')}</small></span></span>`;
  const convNome = (c, j) => c === 'geral' ? 'Conversa geral (toda a equipe)' : c.startsWith('g:') ? 'Grupo "' + (j.grupos?.[c] || 'apagado') + '"' : 'Conversa privada entre ' + c.slice(2).split('|').map(u => j.quem?.[u]?.nome || 'alguém').join(' e ');
  const quandoTxt = t => new Date(t).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'medium' });
  function bolhasA(lista, j, destaque) {
    const nomes = Object.fromEntries(Object.entries(j.quem || {}).map(([u, q]) => [u, q.nome]));
    return lista.map(m => { let c = null; try { c = m.cita ? JSON.parse(m.cita) : null; } catch { }
      return `<div class="epa-msg${m.id === destaque ? ' epa-alvo' : ''}${m.apagada ? ' epa-apg' : ''}"><div class="epa-mh"><b>${esc(j.quem?.[m.de]?.nome || 'Alguém')}</b><time>${esc(new Date(m.em).toLocaleString('pt-BR'))}</time>${m.apagada ? `<em>apagada para todos em ${esc(new Date(m.apagada).toLocaleString('pt-BR'))}</em>` : ''}${m.id === destaque ? '<em class="epa-den">mensagem denunciada</em>' : ''}</div>
        ${c ? `<div class="epa-cita">Citação: <b>${esc(c.titulo)}</b> (${esc(c.prog || '')})${c.anexo ? ` · arquivo ${esc(c.anexo.nome || '')} (${fmtTam(c.anexo.bytes || 0)})` : ''}</div>` : ''}
        ${m.texto ? `<p>${textoMsg(m.texto, nomes, '')}</p>` : ''}</div>`; }).join('');
  }
  async function admConversas(el) {
    if (!el) return;
    if (!document.getElementById('ep-conta-css')) { const st = document.createElement('style'); st.id = 'ep-conta-css'; st.textContent = css; document.head.appendChild(st); }
    el.innerHTML = '<div class="hint" style="padding:18px 0;text-align:center"><span class="spin"></span>Abrindo…</div>';
    let j; try { const r = await fetch('/mensagens?denuncias=1', { credentials: 'same-origin', cache: 'no-store' }); j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'Não abriu.'); }
    catch (e) { el.innerHTML = `<div class="box">${esc(e.message)}</div>`; return; }
    ADMC.dados = j;
    let pessoas = []; try { const r = await fetch('/mensagens?desde=0&pessoas=1', { credentials: 'same-origin', cache: 'no-store' }); const k = await r.json(); pessoas = [{ u: k.eu }, ...(k.pessoas || [])]; } catch { }
    const qs = await Promise.all(pessoas.map(async p => ({ ...p, q: await quemU(p.u) })));
    const abertas = j.denuncias.filter(x => x.estado === 'aberta').length;
    el.innerHTML = `<h2 id="denuncias">Denúncias${abertas ? `<b class="adm-aba-alerta">${abertas}</b>` : ''}<span class="sp"></span><button class="btn sm" type="button" data-atu>Atualizar</button></h2>
      <div class="epa-lista">${j.denuncias.length ? j.denuncias.map((x, i) => `<div class="box epa-den-c epa-${esc(x.estado)}" data-i="${i}">
        <div class="epa-top"><span class="epa-est">${{ aberta: 'Nova', vista: 'Vista', resolvida: 'Resolvida' }[x.estado] || esc(x.estado)}</span><b>Denúncia nº ${x.id}</b><small>${esc(quandoTxt(x.em))}</small><span class="sp" style="flex:1"></span>
          <button class="btn sm" data-rel>${ICONES.arquivo} Relatório para boletim (PDF)</button></div>
        <div class="epa-quem2"><div><small>Quem denunciou</small>${quemHtmlA(j.quem[x.por])}</div><div><small>Quem enviou</small>${quemHtmlA(j.quem[x.de])}</div><div><small>Onde</small><b>${esc(convNome(x.conv, j))}</b></div></div>
        ${x.motivo ? `<div class="epa-motivo"><small>O que a pessoa contou</small><p>${esc(x.motivo)}</p></div>` : ''}
        <div class="epa-conv">${bolhasA([x.copia], j, x.copia?.id)}</div>
        <details><summary>Ver a conversa em volta (${x.contexto.length} mensagens)</summary><div class="epa-conv">${bolhasA(x.contexto, j, x.copia?.id)}</div></details>
        ${x.nota ? `<div class="epa-motivo"><small>Anotação do ADM</small><p>${esc(x.nota)}</p></div>` : ''}
        <div class="acts" style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
          ${x.estado !== 'vista' ? '<button class="btn sm" data-est="vista">Marcar como vista</button>' : ''}${x.estado !== 'resolvida' ? '<button class="btn sm" data-est="resolvida">Resolvida</button>' : '<button class="btn sm" data-est="aberta">Reabrir</button>'}
          <button class="btn sm" data-nota>Anotação</button><button class="btn sm" data-como="${esc(x.de)}">Ver como quem enviou</button><button class="btn sm" data-como="${esc(x.por)}">Ver como quem denunciou</button></div>
      </div>`).join('') : '<div class="box hint">Nenhuma denúncia. Quando alguém denunciar uma mensagem, ela aparece aqui e na foto da conta dos ADMs.</div>'}</div>
      <h2>Ver as conversas como…</h2>
      <div class="box"><div class="hint" style="margin-bottom:10px">Abre as Mensagens exatamente como a pessoa vê (só leitura, nada é marcado como lido). Mensagens apagadas para todos aparecem em laranja.</div>
        <div class="epa-pess">${qs.filter(p => p.q?.nome).map(p => `<button class="epa-p" data-como="${esc(p.u)}">${avU(p.q, 'epa-av')}<span>${esc(p.q.nome)}${p.u === pessoas[0]?.u ? ' (você)' : ''}</span></button>`).join('')}</div></div>
      <h2>Limpar mensagens agora<span class="sp"></span><button class="btn sm epa-verm" type="button" data-limpa="todas">${ICONES.lixo} Limpar todas</button></h2>
      <div class="box"><div class="hint" style="margin-bottom:10px">Apaga já, sem esperar os 7 dias (bom para testes). Some para todo mundo; as cópias guardadas das denúncias continuam.</div><div class="epa-limpa"><span class="spin"></span></div></div>`;
    el.querySelector('[data-atu]').onclick = () => admConversas(el);
    const limpa = async (alvo, nome) => {
      if (!(await pergunta({ titulo: alvo === 'todas' ? 'Limpar TODAS as mensagens?' : `Limpar "${nome}"?`, texto: 'As mensagens somem agora para todo mundo. Não dá para desfazer. As cópias das denúncias continuam.', ok: 'Limpar' }))) return;
      const r = await fetch('/mensagens', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'limpar', alvo }) });
      if (!r.ok) { const j2 = await r.json().catch(() => ({})); alert(j2.error?.message || 'Não limpou.'); return; }
      if (alvo === 'todas') cacheConv.c = {}; else delete cacheConv.c[alvo]; gravaCacheConv(); // o que ficou guardado aqui também some
      MSG.ultimo = 0; await puxaMensagens(); admConversas(el); };
    el.querySelector('[data-limpa="todas"]').onclick = () => limpa('todas');
    fetch('/mensagens?todasConversas=1', { credentials: 'same-origin', cache: 'no-store' }).then(r => r.json()).then(k => {
      const box = el.querySelector('.epa-limpa'); if (!box) return;
      const L = k.convs || []; if (!L.length) { box.innerHTML = '<div class="hint">Nenhuma mensagem guardada agora.</div>'; return; }
      box.innerHTML = L.map((c, i) => `<div class="epa-lrow"><b>${esc(convNome(c.conv, j))}</b><small>${c.n} mensage${c.n === 1 ? 'm' : 'ns'} · última ${esc(new Date(c.em).toLocaleString('pt-BR'))}</small><span style="flex:1"></span><button class="btn sm epa-verm" data-l="${i}">${ICONES.lixo} Limpar</button></div>`).join('');
      box.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { const c = L[+b.dataset.l]; limpa(c.conv, convNome(c.conv, j)); });
    }).catch(() => { });
    el.querySelectorAll('[data-como]').forEach(b => b.onclick = () => painelMensagens({ como: b.dataset.como }));
    el.querySelectorAll('.epa-den-c').forEach(c => { const x = j.denuncias[+c.dataset.i];
      const muda = async (estado, nota) => { await fetch('/mensagens', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'denuncia-estado', id: x.id, estado, nota }) }); await puxaMensagens(); admConversas(el); };
      c.querySelectorAll('[data-est]').forEach(b => b.onclick = () => muda(b.dataset.est));
      c.querySelector('[data-nota]').onclick = () => { if (c.querySelector('.epa-notaf')) return; const f = document.createElement('form'); f.className = 'epa-notaf';
        f.innerHTML = `<textarea rows="3" maxlength="2000" placeholder="Anotação do ADM (só os ADMs veem)">${esc(x.nota || '')}</textarea><div style="display:flex;gap:6px;justify-content:flex-end"><button type="button" class="btn sm" data-c>Cancelar</button><button class="btn sm primary">Salvar anotação</button></div>`;
        c.appendChild(f); f.querySelector('textarea').focus(); f.querySelector('[data-c]').onclick = () => f.remove();
        f.onsubmit = e => { e.preventDefault(); muda(x.estado === 'aberta' ? 'vista' : x.estado, f.querySelector('textarea').value); }; };
      c.querySelector('[data-rel]').onclick = () => relatorioDenuncia(x, j);
    });
    if (/^#denuncias/.test(location.hash)) el.querySelector('#denuncias')?.scrollIntoView({ block: 'start' });
  }
  // relatório para ajudar a fazer o boletim de ocorrência: abre pronto para "Salvar como PDF" (não envia nada a ninguém)
  async function relatorioDenuncia(x, j) {
    const eu = await perfil(), agora = new Date(), dados = JSON.stringify({ denuncia: x.id, copia: x.copia, contexto: x.contexto });
    let hash = ''; try { hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dados)))].map(b => b.toString(16).padStart(2, '0')).join(''); } catch { }
    const pessoa = (titulo, u) => { const q = j.quem[u] || {}; return `<tr><th>${titulo}</th><td><b>${esc(q.nome || 'Alguém')}</b><br>E-mail (parcial): ${esc(q.email || '—')}<br>Código interno no sistema: <code>${esc(u)}</code></td></tr>`; };
    const m = x.copia || {}; let c = null; try { c = m.cita ? JSON.parse(m.cita) : null; } catch { }
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório da denúncia nº ${x.id} · Estúdio Problems</title><style>
      @page{margin:16mm}body{font:12.5px/1.5 'Segoe UI',system-ui,sans-serif;color:#111;max-width:820px;margin:0 auto;padding:20px}h1{font-size:20px;margin:0 0 2px}h2{font-size:14px;margin:22px 0 8px;border-bottom:2px solid #222;padding-bottom:3px}
      .sub{color:#555;margin:0 0 14px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;vertical-align:top}th{width:28%;background:#f2f2f2}
      .msg{border:1px solid #bbb;border-radius:8px;padding:7px 10px;margin:6px 0;page-break-inside:avoid}.msg.alvo{border:2px solid #d6394b;background:#fff3f4}.msg.apg{border-style:dashed;background:#fff7ef}
      .mh{font-size:11.5px;color:#444;display:flex;gap:10px;flex-wrap:wrap}.mh em{color:#b3261e;font-style:normal;font-weight:600}.msg p{margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
      code{font-size:11px;word-break:break-all}.nota{font-size:11.5px;color:#444}.bt{position:fixed;top:12px;right:12px;padding:9px 16px;border-radius:8px;border:0;background:#3d8bff;color:#fff;font-weight:600;cursor:pointer}@media print{.bt{display:none}}
      .epa-msg{border:1px solid #bbb;border-radius:8px;padding:7px 10px;margin:6px 0;page-break-inside:avoid}.epa-alvo{border:2px solid #d6394b;background:#fff3f4}.epa-apg{border-style:dashed;background:#fff7ef}.epa-mh{font-size:11.5px;color:#444;display:flex;gap:10px;flex-wrap:wrap}.epa-mh em{color:#b3261e;font-style:normal;font-weight:600}.epa-msg p{margin:4px 0 0;white-space:pre-wrap}.epa-cita{font-size:11.5px;color:#333}.epm-ment{font-weight:700}
      </style></head><body><button class="bt" onclick="print()">Salvar em PDF / imprimir</button>
      <h1>Relatório de denúncia nº ${x.id}</h1><p class="sub">Mensagens do Estúdio Problems · documento de apoio para registro de ocorrência</p>
      <table>
        <tr><th>Site</th><td>${esc(j.site || location.origin)}/ (Estúdio Problems — acesso só com conta Google liberada pela equipe)</td></tr>
        <tr><th>Onde a mensagem foi enviada</th><td>${esc(convNome(x.conv, j))} — sistema de Mensagens interno do site</td></tr>
        <tr><th>Data e hora da mensagem</th><td>${esc(quandoTxt(m.em))}<br><span class="nota">UTC: ${esc(new Date(m.em).toISOString())} · fuso do computador: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone || '')}</span></td></tr>
        ${pessoa('Quem enviou a mensagem', x.de)}
        ${pessoa('Quem denunciou', x.por)}
        <tr><th>Data e hora da denúncia</th><td>${esc(quandoTxt(x.em))}</td></tr>
        <tr><th>Situação</th><td>${esc({ aberta: 'Nova', vista: 'Vista por um ADM', resolvida: 'Resolvida' }[x.estado] || x.estado)}${m.apagada ? ' · a mensagem foi apagada para todos por quem enviou em ' + esc(quandoTxt(m.apagada)) : ''}</td></tr>
        ${x.motivo ? `<tr><th>Relato de quem denunciou</th><td style="white-space:pre-wrap">${esc(x.motivo)}</td></tr>` : ''}
        ${x.nota ? `<tr><th>Anotação do ADM</th><td style="white-space:pre-wrap">${esc(x.nota)}</td></tr>` : ''}
      </table>
      <h2>Mensagem denunciada (conteúdo completo)</h2>
      ${bolhasA([m], j, m.id)}
      ${c ? `<p class="nota">A mensagem citava: <b>${esc(c.titulo)}</b> (${esc(c.prog || '')})${c.url ? ' · endereço ' + esc((j.site || location.origin) + c.url) : ''}${c.anexo ? ' · arquivo anexado: ' + esc(c.anexo.nome || '') + ' (' + fmtTam(c.anexo.bytes || 0) + ')' : ''}</p>` : ''}
      <h2>Registro da conversa (print) — ${x.contexto.length} mensagens em volta, na ordem</h2>
      ${bolhasA(x.contexto, j, m.id)}
      <h2>Sobre este documento</h2>
      <table>
        <tr><th>Gerado em</th><td>${esc(quandoTxt(agora))}</td></tr>
        <tr><th>Gerado por (ADM)</th><td>${esc(eu?.nome || '')}</td></tr>
        <tr><th>Código de conferência (SHA-256 da cópia guardada)</th><td><code>${esc(hash)}</code></td></tr>
      </table>
      <p class="nota">A cópia da mensagem e da conversa em volta foi guardada pelo sistema no momento da denúncia e não é apagada com a limpeza automática de 7 dias das Mensagens. Os e-mails aparecem só em parte por segurança; o dono do Estúdio Problems consegue fornecer os dados completos de identificação das contas se a polícia pedir.</p>
      <p class="nota">Para registrar: leve este documento (impresso ou em PDF) à delegacia, ou use a delegacia online do seu estado. Junte também prints da tela do seu próprio computador ou celular, se tiver.</p>
      <script>setTimeout(() => print(), 600)<\/script></body></html>`;
    const w = window.open('', '_blank'); if (!w) { alert('O navegador bloqueou a janela do relatório. Libere pop-ups para este site e tente de novo.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  /* ---------- versão nova: confere de vez em quando se algum site mudou ----------
     Guarda uma "impressão digital" (SHA-256) desta página, dos scripts/estilos dela e da página de cada programa.
     - Logo ao abrir: compara o que o navegador usou com o que está no servidor. Se a tela de carregamento ainda estiver
       na frente, recarrega na hora (a pessoa nunca vê a versão velha); se já passou, acende o aviso.
     - Depois, a cada ~4 min com a aba à vista (e quando a aba volta a aparecer), confere de novo.
     Aviso = círculo roxo na foto da conta e "Atualizar todos os sites" roxo no menu da conta. */
  const VERSAO = { nova: false, base: new Map(), instavel: new Set(), ultima: 0 };
  const SITES = ['/', '/animador/', '/shorts/', '/editor/', '/modelador/'];
  const mesmaOrigem = u => { try { const x = new URL(u, location.href); return x.origin === location.origin ? x.pathname + x.search : null; } catch { return null; } };
  const recursosDaPagina = () => {
    const l = [location.pathname + location.search];
    // ECONOMIA (03/11/2026): arquivo com carimbo de versão (?_ev=, posto pelo porteiro) não precisa ser baixado: quando ele muda, o
    // carimbo muda e o HTML da página muda junto — conferir a página já pega. Só os sem carimbo continuam na lista.
    document.querySelectorAll('script[src],link[rel~="stylesheet"][href]').forEach(e => { const u = mesmaOrigem(e.src || e.href); if (u && !/[?&]_ev=/.test(u)) l.push(u); });
    return [...new Set(l)].slice(0, 30);
  };
  async function digital(u, modo) {
    const r = await fetch(u, { cache: modo, credentials: 'same-origin', redirect: 'follow', epFundo: 1 }); // epFundo: a tela de carregamento não espera esta conferência
    if (!r.ok) return null;
    const b = await r.arrayBuffer();
    try { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join(''); }
    catch { let h = 2166136261; const v = new Uint8Array(b); for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v[i], 16777619); return v.length + ':' + (h >>> 0); }
  }
  const telaDeCarregamento = () => [...document.querySelectorAll('#estudio-porta,#turma-login')].some(e => !e.classList.contains('ep-saindo') && !e.hidden && getComputedStyle(e).display !== 'none' && getComputedStyle(e).opacity !== '0');
  function marcaNova(onde) {
    if (VERSAO.nova) return; VERSAO.nova = true; VERSAO.onde = onde; if (!marcaNova.deFora) manda({ versaoNova: onde }); // as outras abas acendem junto
    document.querySelectorAll('.ep-conta').forEach(b => b.classList.add('ep-novo'));
    try { dispatchEvent(new CustomEvent('estudio-versao-nova', { detail: { onde } })); } catch { }
  }
  async function recarregaJa() {
    const k = 'ep-recarregou:' + location.pathname; let t = 0; try { t = +sessionStorage.getItem(k) || 0; } catch { }
    if (Date.now() - t < 60000) return false; // já recarregou agora há pouco: não entra em laço
    try { sessionStorage.setItem(k, String(Date.now())); } catch { }
    try { const regs = await navigator.serviceWorker?.getRegistrations?.() || []; await Promise.all(regs.map(r => r.update().catch(() => { }))); } catch { }
    try { if (self.caches) for (const n of await caches.keys()) await caches.delete(n); } catch { }
    location.reload(); return true;
  }
  async function confereVersao(primeira) {
    if (VERSAO.nova || VERSAO.rodando) return; VERSAO.rodando = true; VERSAO.ultima = Date.now();
    try {
      // ao abrir: só a página e os scripts comuns (leve, não disputa com o carregamento); o resto entra 20 s depois
      // ANIMADOR: o versao.json muda a cada publicação (Action versao.yml), então basta ele + a página + o estudio-conta.js (economia de pedidos:
      // antes eram até 30 arquivos a cada conferência, por aba; cada um = 1 pedido do porteiro, limite de 100 mil por dia na conta)
      const anim = location.pathname.startsWith('/animador/');
      const lista = anim ? [location.pathname + location.search, '/estudio-conta.js', '/animador/versao.json'] : primeira ? [location.pathname + location.search, '/estudio-conta.js', '/estudio-carregando.js'] : [...new Set([...recursosDaPagina(), ...SITES])];
      // VERSÕES NUM PEDIDO SÓ (06/11/2026, economia de pedidos): depois da abertura, a lista inteira vai junta para o /versoes do porteiro,
      // que devolve a versão de cada arquivo (a mesma do carimbo _ev). Antes: um pedido por arquivo (6 a 10 a cada 3,5 min).
      // Porteiro antigo (sem /versoes) → como antes, um por um.
      if (!primeira) {
        const doGh = u => { try { const x = new URL(u, location.href); if (!/\.github\.io$/.test(x.hostname)) return null; return x.pathname.replace(/^\/jester-dreams\//, '/jester/'); } catch { return null; } };
        const daPagina = anim ? [] : [...document.querySelectorAll('script[src],link[rel~="stylesheet"][href]')].map(e => { const s = e.src || e.href, m = mesmaOrigem(s); return m ? m.replace(/[?&]_ev=[^&]*/, '') : doGh(s); }).filter(Boolean);
        const l2 = [...new Set([...lista, ...SITES, ...daPagina])].slice(0, 40);
        let v = null; try { const r = await fetch('/versoes?u=' + encodeURIComponent(l2.join('|')), { credentials: 'same-origin', cache: 'no-store', epFundo: 1 }); const j = r.ok ? await r.json().catch(() => null) : null; v = j?.v || null; } catch { }
        if (v) { for (const u of l2) { const a = v[u]; if (!a) continue; const k = 'v:' + u;
            if (!VERSAO.base.has(k)) { VERSAO.base.set(k, a); continue; } if (VERSAO.base.get(k) === a) continue;
            if (telaDeCarregamento() && (await recarregaJa())) return; marcaNova(u); return; }
          return; }
      }
      // a página acabou de vir do porteiro (ou ele disse "não mudou") ao abrir: ela já é a mais nova, não precisa pedir de novo (06/11/2026)
      const navFresca = (() => { try { const n = performance.getEntriesByType('navigation')[0]; return !!n && n.transferSize > 0 && n.type !== 'back_forward'; } catch { return false; } })();
      for (const u of lista) {
        if (VERSAO.instavel.has(u) || VERSAO.nova) continue;
        if (primeira && navFresca && u === location.pathname + location.search) continue;
        let agora; try { agora = await digital(u, 'no-cache'); } catch { continue; }
        if (!agora) continue;
        if (!VERSAO.base.has(u)) {
          // primeira vez: o que este navegador está usando (cópia guardada) é a base
          let usado = agora; if (primeira && !SITES.includes(u) || u === location.pathname + location.search) { try { usado = (await digital(u, 'force-cache')) || agora; } catch { } }
          VERSAO.base.set(u, usado);
          if (usado === agora) continue;
        } else if (VERSAO.base.get(u) === agora) continue;
        // mudou: confere mais uma vez (página que muda sozinha a cada pedido não conta)
        let de_novo; try { de_novo = await digital(u, 'no-cache'); } catch { }
        if (de_novo !== agora) { VERSAO.instavel.add(u); continue; }
        if (telaDeCarregamento() && (await recarregaJa())) return;
        marcaNova(u);
      }
    } finally { VERSAO.rodando = false; }
  }
  if (window.top === window && /^https?:$/.test(location.protocol)) {
    // ECONOMIA (03/11/2026): ao abrir, cada aba confere só o leve (página + 2 arquivos, para recarregar ainda na tela de carregamento);
    // a conferência completa (as páginas dos programas) fica com a aba LÍDER, que avisa as outras quando acha versão nova.
    const lider = () => VIVO.lider, algumaVisivel = () => document.visibilityState === 'visible' || Date.now() - VIVO.outraVisivel < 45000;
    const comeca = () => { confereVersao(true).catch(() => { }); setTimeout(() => { if (!lider()) return; VERSAO.ultima = 0; confereVersao().catch(() => { }); }, 20000); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', comeca, { once: true }); else comeca();
    setInterval(() => { if (lider() && algumaVisivel() && Date.now() - VERSAO.ultima > 3.5 * 60000) confereVersao().catch(() => { }); }, 30000);
    // voltou para uma aba do Estúdio: a líder confere (se faz mais de 1 min); as outras só avisam a líder
    document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') return; if (lider()) { if (Date.now() - VERSAO.ultima > 60000) confereVersao().catch(() => { }); } else manda({ voltou: 1 }); });
  }

  /* ===================== REDESIGN (03/11/2026): relógio + calendário pessoal, Dock, ADM por cima, anel de carregamento =====================
     Nada disto pede coisa à nuvem: o calendário fica no localStorage ('ep-calendario'); o Dock só tem atalhos.
     No menu: <span data-estudio-relogio></span> (meio do cabeçalho) e <span data-estudio-dock></span>. */
  const poeCss = () => { if (!document.getElementById('ep-conta-css')) { const st = document.createElement('style'); st.id = 'ep-conta-css'; st.textContent = css; document.head.appendChild(st); } };
  ICONES.cal = svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>');
  // ---- anel de carregamento: foto ou miniatura que ainda não chegou ganha o anel (estilo Windows 11) até carregar ----
  const SEL_CARR = '.ep-conta,.ep-msgs,.ep-esp,.ep-pg,.ep-dock';
  const marcaCarr = raiz => raiz?.querySelectorAll?.('img').forEach(im => { if (im.complete || im.dataset.epCarr) return; im.dataset.epCarr = '1';
    const p = im.parentElement; if (!p) return; p.classList.add('ep-carr'); const sai = () => p.classList.remove('ep-carr'); im.addEventListener('load', sai, { once: true }); im.addEventListener('error', sai, { once: true }); });
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.(SEL_CARR) || n.closest?.(SEL_CARR))) marcaCarr(n.tagName === 'IMG' ? n.parentElement : n); })
    .observe(document.documentElement, { childList: true, subtree: true }); // só olha o que entra nas nossas janelas (o resto da página é ignorado na hora)

  // ---- RELÓGIO + CALENDÁRIO PESSOAL (lembretes e metas só seus, neste computador; a notificação aparece em qualquer programa) ----
  const CAL_LS = 'ep-calendario', CAL_AV = 'ep-cal-avisados';
  const leCal = () => { try { const v = JSON.parse(localStorage.getItem(CAL_LS) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const gravaCal = l => { try { localStorage.setItem(CAL_LS, JSON.stringify(l.slice(-500))); } catch { } };
  const mesmoDia = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const horaCal = t => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const corCal = t => t === 'meta' ? '#30d158' : '#ffcc33';
  function pintaRelogios() {
    const d = new Date(), ev = leCal();
    document.querySelectorAll('.ep-relogio').forEach(b => {
      b.querySelector('.dt').textContent = d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
      b.querySelector('.hr').textContent = horaCal(d); b.querySelector('.pt').hidden = !ev.some(e => mesmoDia(e.em, d) && e.em >= d - 6e4); });
  }
  const CAL = { mes: null, sel: null, alvo: null };
  function calendario(ev) { // abre o calendário por cima (ev = o lembrete que deve aparecer destacado)
    poeCss(); document.querySelector('.ep-cal:not(.ep-saindo)')?.remove();
    const base = ev ? new Date(ev.em) : new Date(); CAL.sel = new Date(base); CAL.sel.setHours(0, 0, 0, 0); CAL.mes = new Date(base.getFullYear(), base.getMonth(), 1); CAL.alvo = ev?.id || null;
    const c = document.createElement('div'); c.className = 'ep-cal'; c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', 'Seu calendário'); document.body.appendChild(c); pintaCal();
    c.addEventListener('mousemove', e => { const g = c.querySelector('.g'); if (!g) return; const r = g.getBoundingClientRect(); g.style.setProperty('--mx', (e.clientX - r.left) + 'px'); g.style.setProperty('--my', (e.clientY - r.top) + 'px'); g.classList.toggle('luz', e.clientX >= r.left - 60 && e.clientX <= r.right + 60 && e.clientY >= r.top - 60 && e.clientY <= r.bottom + 60); }); // luz do Windows 10 nos dias
    c.addEventListener('mouseleave', () => c.querySelector('.g')?.classList.remove('luz'));
    const fora = e => { if (!c.isConnected) return tira(); if (!e.target.closest('.ep-cal,.ep-relogio,.ep-notif')) { c.remove(); tira(); } };
    const esc1 = e => { if (e.key === 'Escape') { c.remove(); tira(); } };
    const tira = () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc1); };
    setTimeout(() => { document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc1); });
  }
  function pintaCal() {
    const c = document.querySelector('.ep-cal:not(.ep-saindo)'); if (!c) return; const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const EV = leCal(), ini = new Date(CAL.mes); ini.setDate(1 - ini.getDay()); const dias = [];
    for (let i = 0; i < 42; i++) { const d = new Date(ini); d.setDate(ini.getDate() + i); dias.push(d); }
    const doDia = d => EV.filter(e => mesmoDia(e.em, d)).sort((a, b) => a.em - b.em), lista = doDia(CAL.sel);
    c.innerHTML = `<div class="m"><div class="cab"><b>${esc(CAL.mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, x => x.toUpperCase()))}</b><button class="bt" type="button" data-m="-1" title="Mês anterior">‹</button><button class="bt" type="button" data-hoje>Hoje</button><button class="bt" type="button" data-m="1" title="Próximo mês">›</button></div>
        <div class="g">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(s => `<span class="sem">${s}</span>`).join('')}${dias.map((d, i) => { const e = doDia(d); return `<button type="button" data-d="${i}" class="${d.getMonth() !== CAL.mes.getMonth() ? 'fora' : ''}${+d === +hoje ? ' hoje' : ''}${+d === +CAL.sel ? ' sel' : ''}">${d.getDate()}${e.length ? `<span class="pts">${e.slice(0, 3).map(x => `<i style="background:${corCal(x.tipo)}"></i>`).join('')}</span>` : ''}</button>`; }).join('')}</div>
        <p class="leg"><span><i style="background:#ffcc33"></i>Lembrete</span><span><i style="background:#30d158"></i>Meta</span><span>Só você vê · fica neste computador</span></p></div>
      <div class="d"><div class="dc"><b>${esc(CAL.sel.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))}</b><button class="bt" type="button" data-fx>Fechar</button></div>
        <div class="l">${lista.map(e => `<div class="ev ${e.tipo === 'meta' ? 'meta' : ''}${e.id === CAL.alvo ? ' alvo' : ''}"><span class="hr">${horaCal(e.em)}</span><div class="tx"><b>${esc(e.t)}</b>${e.txt ? `<p>${esc(e.txt)}</p>` : ''}<small>${e.tipo === 'meta' ? 'Meta' : 'Lembrete'}${e.avisar ? ' · avisa na hora' : ''}</small></div><button class="bt perigo" type="button" data-apg="${e.id}" title="Apagar">${ICONES.lixo}</button></div>`).join('') || '<div class="vz">Nada marcado neste dia.</div>'}</div>
        <form><input type="text" name="t" required maxlength="80" placeholder="Novo lembrete ou meta…"><div class="lin"><span class="seg"><button type="button" data-v="aviso" class="on">Lembrete</button><button type="button" data-v="meta">Meta</button></span><input type="time" name="h" value="${new Date(Date.now() + 36e5).toTimeString().slice(0, 5)}"><label><input type="checkbox" name="av" checked> Avisar na hora</label><span class="sp"></span><button class="bt pri" type="submit">Adicionar</button></div></form></div>`;
    // trocar de mês: o mês novo entra deslizando do lado certo (pedido da dona: dá para ver que o mês mudou)
    const anima = d => { const x = document.querySelector('.ep-cal:not(.ep-saindo)'); x?.querySelector('.g')?.classList.add(d > 0 ? 'mes-prox' : 'mes-ant'); x?.querySelector('.cab b')?.classList.add('mes-nome'); };
    c.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { CAL.mes.setMonth(CAL.mes.getMonth() + +b.dataset.m); pintaCal(); anima(+b.dataset.m); });
    c.querySelector('[data-hoje]').onclick = () => { const d0 = CAL.mes.getFullYear() * 12 + CAL.mes.getMonth(), d1 = hoje.getFullYear() * 12 + hoje.getMonth(); setTimeout(() => { if (d0 !== d1) anima(d1 - d0); }); CAL.sel = new Date(hoje); CAL.mes = new Date(hoje.getFullYear(), hoje.getMonth(), 1); pintaCal(); };
    c.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { CAL.sel = dias[+b.dataset.d]; if (CAL.sel.getMonth() !== CAL.mes.getMonth()) CAL.mes = new Date(CAL.sel.getFullYear(), CAL.sel.getMonth(), 1); CAL.alvo = null; pintaCal(); });
    c.querySelector('[data-fx]').onclick = () => c.remove();
    c.querySelectorAll('[data-apg]').forEach(b => b.onclick = () => { gravaCal(leCal().filter(e => String(e.id) !== b.dataset.apg)); pintaCal(); pintaRelogios(); });
    let tipo = 'aviso'; c.querySelectorAll('.seg button').forEach(b => b.onclick = () => { tipo = b.dataset.v; c.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); });
    c.querySelector('form').onsubmit = e => { e.preventDefault(); const f = e.target, [h, m] = f.h.value.split(':').map(Number), d = new Date(CAL.sel); d.setHours(h || 0, m || 0, 0, 0);
      gravaCal([...leCal(), { id: Date.now(), tipo, t: f.t.value.trim(), txt: '', em: d.getTime(), avisar: f.av.checked }]); pintaCal(); pintaRelogios(); };
  }
  // notificação da hora marcada (em QUALQUER programa): uma vez só, na aba que estiver à vista
  function notificaCal(ev) {
    poeCss(); document.querySelector('.ep-notif')?.remove(); const d = new Date(ev.em), n = document.createElement('div'); n.className = 'ep-notif'; n.setAttribute('role', 'alert');
    n.innerHTML = `<button class="x" type="button" title="Dispensar">×</button><span class="di"><small>${esc(d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''))}</small><b>${d.getDate()}</b></span><span class="tx"><small>${ev.tipo === 'meta' ? 'Meta' : 'Lembrete'} · ${horaCal(ev.em)}</small><b>${esc(ev.t)}</b>${ev.txt ? `<span>${esc(ev.txt)}</span>` : ''}</span>`;
    document.body.appendChild(n);
    n.querySelector('.x').onclick = e => { e.stopPropagation(); n.remove(); };
    n.onclick = () => { n.remove(); calendario(ev); };
    setTimeout(() => n.isConnected && n.remove(), 30000);
  }
  function confereLembretes() {
    if (document.visibilityState !== 'visible') return;
    let av = {}; try { av = JSON.parse(localStorage.getItem(CAL_AV) || '{}') || {}; } catch { }
    const t = Date.now(); for (const k of Object.keys(av)) if (t - av[k] > 8 * 864e5) delete av[k];
    const e = leCal().find(x => x.avisar && !av[x.id] && x.em <= t && t - x.em < 30 * 6e4); if (!e) return;
    av[e.id] = t; try { localStorage.setItem(CAL_AV, JSON.stringify(av)); } catch { } notificaCal(e); // marcado: as outras abas não repetem
  }
  addEventListener('storage', e => { if (e.key === CAL_LS) { pintaRelogios(); pintaCal(); } }); // mudou em outra aba (outro programa)

  // ---- DOCK do menu: Mensagens, Personalizar o perfil e ADM (só ADM) + espaço na nuvem e no navegador, tudo como janela por cima ----
  // (as abas abertas no Dock foram tiradas a pedido do dono, 03/11/2026: o Dock é só de atalhos)
  let DOCK_PC = null, DOCK_PC_T = 0; // uso do espaço deste computador (0–1), medido no navegador
  function pintaDock() {
    const dk = document.querySelector('.ep-dock'); if (!dk) return;
    const fixos = [...(window.EstudioPerm?.pode('geral.mensagens') === false ? [] : [['msgs', 'Mensagens', ICONES.msg, 'linear-gradient(180deg,#3ad466,#1fae47)', MSG.nao ? `<b class="n vm">${MSG.nao > 99 ? '99+' : MSG.nao}</b>` : '']]), // NÍVEIS DE ACESSO: sem Mensagens no cargo, o atalho some
      ['conta', 'Personalizar o perfil', ICONES.conta, 'linear-gradient(180deg,#5e9bff,#2f6be6)', ''],
      ...(P?.adm ? [['adm', 'ADM', ICONES.adm, 'linear-gradient(180deg,#8e8e93,#5a5a5f)', MSG.denuncias ? '<b class="n vm">!</b>' : '']] : [])];
    // espaço: abrir o painel não pede nada a mais do que o círculo do cabeçalho já pede (a nuvem usa a medida guardada de 5 min)
    const espacos = [...(CFG.nuvem ? [['nuvem', 'Espaço na nuvem da equipe', ICONES.nuvem, 'linear-gradient(180deg,#a98bff,#7b5cf0)']] : []),
      ['pc', 'Espaço neste computador', svg('<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>'), 'linear-gradient(180deg,#4f8dff,#2459d6)']]; // computador, como no círculo do cabeçalho
    // quanto já foi usado, à vista: barrinha embaixo do ícone (verde → amarela com 60% → vermelha com 85%), sem pedir nada à nuvem:
    // a nuvem usa a última medida guardada pelo círculo do cabeçalho ('ep-nuvem-uso'); o computador, o navigator.storage.estimate()
    let usoNv = null; try { const j = JSON.parse(localStorage.getItem('ep-nuvem-uso') || 'null')?.j; if (j?.limite) usoNv = j.total / j.limite; } catch { }
    const barra = p => p == null ? '' : `<i class="uso" style="--u:${Math.max(4, Math.min(100, p * 100)).toFixed(0)}%;--c:${p > .85 ? '#ff453a' : p > .6 ? '#ffcc33' : '#30d158'}"></i>`;
    const dica = (k, n) => k === 'nuvem' && usoNv != null ? `${n} · ${Math.round(usoNv * 100)}% usado` : k === 'pc' && DOCK_PC != null ? `${n} · ${Math.round(DOCK_PC * 100)}% usado` : n;
    const bt = ([k, n, ic, bg, extra = '']) => `<button class="di" type="button" data-fixo="${k}" data-dica="${dica(k, n)}" aria-label="${dica(k, n)}"><span class="ic fx" style="background:${bg}">${ic}</span>${k === 'nuvem' ? barra(usoNv) : k === 'pc' ? barra(DOCK_PC) : ''}${extra}</button>`;
    // programas que a pessoa FIXOU no Dock pelo "Organizar" do menu (localStorage 'ep-dock-fixos', só neste navegador)
    let meus = []; try { meus = JSON.parse(localStorage.getItem('ep-dock-fixos') || '[]'); if (!Array.isArray(meus)) meus = []; } catch { }
    meus = meus.filter(x => { const m = String(x?.url || '').match(/\/(animador|shorts|editor|modelador|jester|preparativos|publicacoes)(\/|$)/); return !m || window.EstudioPerm?.programa(m[1]) !== false; }); // NÍVEIS DE ACESSO: programa que o cargo não vê sai do Dock
    const icMeu = x => { try { if (x.prog && window.EstudioIcones?.svg) return window.EstudioIcones.svg(x.prog); } catch { }
      return x.ic ? `<span class="meu">${x.ic}</span>` : `<span style="display:grid;place-items:center;background:#3a3a3c;font-size:16px">${esc(String(x.nome || '?').slice(0, 2))}</span>`; }; // ícone do cartão: com o quadradinho de fundo do menu
    const meuBt = (x, i) => `<button class="di prog" type="button" data-meu="${i}" data-dica="${esc(x.nome)}" aria-label="${esc(x.nome)} (clique direito: tirar do Dock)"><span class="ic">${icMeu(x)}</span></button>`;
    dk.innerHTML = (meus.length ? meus.map(meuBt).join('') + '<span class="sep" aria-hidden="true"></span>' : '') + fixos.map(bt).join('') + '<span class="sep" aria-hidden="true"></span>' + espacos.map(bt).join('');
    dk.querySelectorAll('[data-meu]').forEach(b => { const x = meus[+b.dataset.meu];
      b.onclick = () => { const ev = new CustomEvent('estudio-abrir-prog', { detail: { url: x.url }, cancelable: true }); dispatchEvent(ev); if (!document.getElementById('grid')) location.href = x.url; }; // no menu, ele abre com o escurecer de sempre
      b.oncontextmenu = e => { e.preventDefault(); try { localStorage.setItem('ep-dock-fixos', JSON.stringify(meus.filter(y => y !== x))); } catch { } dispatchEvent(new Event('estudio-dock-fixos')); }; });
    if (DOCK_PC == null || Date.now() - DOCK_PC_T > 60e3) { DOCK_PC_T = Date.now(); estimativa().then(e => { if (e.quota) { DOCK_PC = e.usage / e.quota; pintaDock(); } }); } // o do computador: no máximo uma medida por minuto
    const dkMsg = dk.querySelector('[data-fixo=msgs]'); if (dkMsg) dkMsg.onclick = () => painelMensagens();
    dk.querySelector('[data-fixo=conta]').onclick = () => { if (CFG.conta) CFG.conta(); else abrirMinhaConta(); };
    dk.querySelector('[data-fixo=adm]')?.addEventListener('click', () => abrirAdm());
    dk.querySelector('[data-fixo=nuvem]')?.addEventListener('click', () => painelNuvem());
    dk.querySelector('[data-fixo=pc]').onclick = () => painelEspaco();
  }
  // ---- ADM como janela por cima: no menu, o próprio menu abre (evento); fora dele, a página /adm?embed=1 num quadro ----
  function abrirAdm(aba) {
    if (!P?.adm) return;
    if (location.pathname === '/' || /^\/adm\/?$/i.test(location.pathname)) return dispatchEvent(new CustomEvent('estudio-abrir-adm', { detail: { aba: aba || null } }));
    poeCss(); document.querySelector('.ep-admj')?.remove();
    const d = document.createElement('div'); d.className = 'ep-admj'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'ADM');
    d.innerHTML = `<div class="cx"><iframe src="/adm?embed=1${aba ? '#' + encodeURIComponent(aba) : ''}" title="ADM"></iframe><div class="car" role="status" aria-live="polite"><div class="c"><div class="lg">${ICONES.adm}</div><div class="br"><i></i></div><div class="pc"><b>0%</b><span>Abrindo a ADM…</span></div></div><span class="selo"></span></div></div>`;
    d.querySelector('.selo').textContent = window.EstudioVersao?.nome || window.ESTUDIO_VERSAO || '';
    document.body.appendChild(d);
    // barrinha que anda sozinha (vai chegando perto de 90%); quando a ADM aparece no quadro, corre até 100% e a tela some
    const car = d.querySelector('.car'), barra = car.querySelector('.br>i'), pct = car.querySelector('.pc b'), t0 = performance.now(); let mostra = 0, pronto = 0, de = 0, acabou = false;
    const pinta = v => { barra.style.width = v.toFixed(1) + '%'; pct.textContent = Math.round(v) + '%'; };
    const fim = () => { if (acabou) return; acabou = true; clearInterval(vigia); car.classList.add('sai'); setTimeout(() => car.remove(), 320); };
    const anda = () => { if (acabou || !d.isConnected) return; const t = performance.now();
      if (pronto) { const k = Math.min(1, (t - pronto) / 400); mostra = de + (100 - de) * (1 - (1 - k) * (1 - k)); pinta(mostra); if (k >= 1) return setTimeout(fim, 120); }
      else { mostra = Math.max(mostra, 90 * (1 - Math.exp(-(t - t0) / 1600))); pinta(mostra); }
      requestAnimationFrame(anda); };
    requestAnimationFrame(anda);
    const termina = () => { if (!pronto) { pronto = performance.now(); de = mostra; setTimeout(() => { pinta(100); fim(); }, 900); } }; // aba escondida (sem desenho): termina pelo relógio
    const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
    const vigia = setInterval(() => { try { const w = d.querySelector('iframe').contentDocument; if (w && w.readyState === 'complete' && vis(w.getElementById('adm')) && ![...w.querySelectorAll('.login')].some(vis)) termina(); } catch { termina(); } }, 150);
    setTimeout(termina, 20000); // segurança: a tela nunca prende a ADM
    const fechar = () => { clearInterval(vigia); acabou = true; d.remove(); removeEventListener('message', ouve); document.removeEventListener('keydown', esc1); };
    const ouve = e => { if (e.origin === location.origin && e.data?.estudioAdm === 'fechar') fechar(); };
    const esc1 = e => { if (e.key === 'Escape') fechar(); };
    addEventListener('message', ouve); document.addEventListener('keydown', esc1);
    d.onclick = e => { if (e.target === d) fechar(); };
  }
  // marcadores do menu: relógio no meio do cabeçalho e o Dock
  function poeMarcas() {
    document.querySelectorAll('[data-estudio-relogio]:not([data-ep-montado])').forEach(el => { el.dataset.epMontado = '1';
      el.innerHTML = '<button class="ep-relogio" type="button" title="Seu calendário (lembretes e metas)"><span class="pt" title="Tem lembrete hoje"></span><span class="dt"></span><span class="hr"></span></button>';
      el.querySelector('button').onclick = () => document.querySelector('.ep-cal:not(.ep-saindo)') ? document.querySelector('.ep-cal:not(.ep-saindo)').remove() : calendario(); });
    document.querySelectorAll('[data-estudio-dock]:not([data-ep-montado])').forEach(el => { el.dataset.epMontado = '1'; el.innerHTML = '<nav class="ep-dock" aria-label="Atalhos do Estúdio"></nav>'; });
    pintaRelogios(); pintaDock();
  }
  function redesignLiga() {
    poeCss(); poeMarcas(); if (redesignLiga.ok) return; redesignLiga.ok = true;
    setInterval(() => { pintaRelogios(); if (document.querySelector('.ep-dock')) pintaDock(); confereLembretes(); }, 20000);
    setTimeout(confereLembretes, 2500); document.addEventListener('visibilitychange', confereLembretes);
    addEventListener('estudio-mensagens', () => { if (document.querySelector('.ep-dock')) pintaDock(); }); // contagem das Mensagens no Dock
    addEventListener('estudio-dock-fixos', () => pintaDock()); // fixou/tirou pelo menu
    addEventListener('estudio-perm', () => pintaDock()); // chegaram os níveis de acesso (cargo sem Mensagens ou sem algum programa)
    addEventListener('storage', e => { if (e.key === 'ep-dock-fixos') pintaDock(); }); // ...ou em outra aba
  }

  // SAÍDA ANIMADA (05/11/2026): quem fecha estas janelas chama .remove(); aqui elas tocam a animação de saída e só então saem
  { const SAI = '.ep-esp,.ep-cal,.ep-msgs,.ep-pg,.ep-admj,.ep-conta-pop,.ep-notif,.modal', rm0 = Element.prototype.remove, calmo = matchMedia('(prefers-reduced-motion: reduce)');
    if (!Element.prototype.remove.epSai) { const rm = function () { if (this.isConnected && !calmo.matches && this.matches?.(SAI) && !this.classList.contains('ep-saindo')) { this.classList.add('ep-saindo'); setTimeout(() => rm0.call(this), 220); return; } return rm0.call(this); }; rm.epSai = true; Element.prototype.remove = rm; } }
  window.EstudioConta = { relatorio: () => pedeRelatorio(), perfil, montar, recarregar, atualizarTudo, ICONES, espaco, painelEspaco, quem, nomeDe, pergunta, aoSair,
    calendario: ev => calendario(ev), dock: { atualizar: () => pintaDock() },
    preImg, sessao: { conferir: () => confereSessao() }, adm: { conversas: admConversas, abrir: abrirAdm }, citar, citacaoRecebida, mensagens: { abrir: () => painelMensagens(), conferir: () => puxaMensagens(), get naoLidas() { return MSG.nao; } },
    versao: { conferir: () => confereVersao(), get nova() { return VERSAO.nova; } },
    nuvem: { atualizar: () => { try { localStorage.removeItem('ep-nuvem-uso'); } catch { } return atualizaNuvem(true); }, painel: painelNuvem, pedeAdm } };
  if (CFG.autoMontar !== false) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => montar(), { once: true }); else montar(); }
})();