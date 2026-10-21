/* ===================== estudio-login.js — porteiro do Estúdio Problems =====================
   Coloque esta linha no <head> de QUALQUER projeto do site (Shorts, Edição, Modelador...), antes dos outros scripts:

       <script src="/estudio-login.js"></script>

   O que ele faz:
   1. Esconde a página até conferir o acesso.
   2. Se a pessoa NÃO entrou com o Google, manda para o menu (/?volta=<este endereço>). Depois de entrar,
      o menu traz a pessoa de volta para cá.
   3. Se entrou, pergunta ao servidor da Cloudflare (/quem) se o e-mail está liberado. Se estiver, mostra a página.
      Se não estiver, mostra o aviso e um botão para voltar ao menu.

   No projeto, quem precisar do e-mail ou do token (para chamar o servidor) usa:
       const email = await EstudioLogin.pronto;        // e-mail liberado
       const token = await EstudioLogin.token();       // "Bearer ..." para o servidor
       EstudioLogin.sair();                            // sai da conta e volta ao menu
       const p = await EstudioLogin.perfil();          // { nome, foto, email, ... } da "Minha conta" do menu
                                                       // (sem nada mudado lá: nome e foto do Google)
   Também dispara os eventos  document 'estudio-login'  (e.detail.email) e 'estudio-perfil' (e.detail = perfil).

   SEGURANÇA: isto é a porta da frente. Quem decide quem entra é o servidor (EMAILS_PERMITIDOS na Cloudflare).
   Nunca coloque e-mails, senhas ou chaves neste arquivo. */
'use strict';
(() => {
  const CFG = {
    menu: '/',                                                   // onde fica o menu (login)
    servidor: 'https://turma-ia.problemsraiz.workers.dev',       // servidor que confere o e-mail (/quem)
    sdk: 'https://www.gstatic.com/firebasejs/10.14.1/',
    firebase: { // dados PÚBLICOS por natureza; a segurança está no servidor
      apiKey: 'AIzaSyAi04-Bbe-1yUG6xi9S2Ef26nImJUi6q60',
      authDomain: 'problems-estudios.firebaseapp.com',
      projectId: 'problems-estudios',
      storageBucket: 'problems-estudios.firebasestorage.app',
      messagingSenderId: '987944796866',
      appId: '1:987944796866:web:15f571c0ad18b12c91f15b',
    },
  };
  const NOME_PROG = ((p => [['/animador/', 'ANIMADOR'], ['/editor/', 'EDITOR'], ['/modelador/blockbench', 'BLOCKBENCH'], ['/modelador/', 'MODELADOR'], ['/shorts/', 'SHORTS']].find(([k]) => p.startsWith(k))?.[1] || 'ESTÚDIO PROBLEMS')(location.pathname));
  const root = document.documentElement;
  root.classList.add('estudio-trancado');
  const st = document.createElement('style');
  // tela de carregamento padrão de todos os programas (logo, NOME do programa, barra andando e a mensagem); entra e sai com fade.
  // O mesmo visual está no estudio-carregando.js (Shorts, Editor) e no js/auth.js do Animador: mudou aqui, muda lá.
  st.textContent = `html.estudio-trancado{background:#111216}html.estudio-trancado body>*:not(#estudio-porta){display:none!important}
#estudio-porta{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:radial-gradient(1100px 700px at 50% 35%,#1d2030,#111216 70%);font:14px/1.5 'Segoe UI',system-ui,-apple-system,sans-serif;color:#e9ebef;padding:16px;-webkit-user-select:none;user-select:none;transition:opacity .35s ease}
#estudio-porta.ep-saindo{opacity:0;pointer-events:none}
#estudio-porta .ep-c{width:min(380px,100%);text-align:center;display:grid;justify-items:center;gap:4px;animation:epEntra .16s ease-out both}
#estudio-porta .ep-lg{width:68px;height:68px;border-radius:20px;display:grid;place-items:center;background:linear-gradient(135deg,#3d8bff,#19d3f0);box-shadow:0 14px 40px rgba(61,139,255,.35);margin-bottom:12px;animation:epPulso 1.6s ease-in-out infinite}
#estudio-porta .ep-nm{font:800 26px/1.05 'Segoe UI',system-ui,sans-serif;letter-spacing:1.5px}
#estudio-porta .ep-sb{color:#9aa0ab;font-size:12.5px;letter-spacing:.4px}
#estudio-porta .ep-br{width:180px;height:4px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden;margin:18px 0 8px;position:relative}
#estudio-porta .ep-br::after{content:'';position:absolute;top:0;bottom:0;left:0;width:40%;border-radius:4px;background:linear-gradient(90deg,#3d8bff,#19d3f0);animation:epBarra 1.1s ease-in-out infinite}
#estudio-porta.ep-erro .ep-br{display:none}#estudio-porta.ep-erro .ep-lg{animation:none;background:linear-gradient(135deg,#ff6b6b,#ff9a62)}
#estudio-porta .ep-m{color:#b9bdc6;font-size:13px;min-height:20px;max-width:340px}#estudio-porta .ep-m .e,#estudio-porta .ep-m.err{color:#ff8a9a}
#estudio-porta [hidden]{display:none!important}#estudio-porta a.ep-bt{display:inline-flex;margin-top:12px;padding:9px 18px;border-radius:10px;background:#3d8bff;color:#fff;text-decoration:none;font-weight:600}#estudio-porta a.ep-bt:hover{filter:brightness(1.08)}
@keyframes epBarra{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}@keyframes epPulso{50%{transform:scale(1.05)}}@keyframes epEntra{from{opacity:0}}
@media (prefers-reduced-motion:reduce){#estudio-porta .ep-lg,#estudio-porta .ep-br::after,#estudio-porta .ep-c{animation:none}#estudio-porta{transition:none}}`;
  (document.head || root).appendChild(st);

  const menuUrl = volta => { const u = new URL(CFG.menu, location.href); if (volta) u.searchParams.set('volta', location.href); return u.href; };
  const porta = () => {
    let el = document.getElementById('estudio-porta');
    if (!el) { el = document.createElement('div'); el.id = 'estudio-porta'; el.innerHTML = `<div class="ep-c"><div class="ep-lg"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="2.5" fill="#fff" fill-opacity=".18"/><path d="m15.5 10.2 5-3v9.6l-5-3z" fill="#fff"/></svg></div><div class="ep-nm">${esc(NOME_PROG)}</div><div class="ep-sb">Estúdio Problems</div><div class="ep-br"></div><div class="ep-m" data-m></div></div>`; (document.body || root).appendChild(el); if (!document.body) addEventListener('DOMContentLoaded', () => { if (el.isConnected && el.parentNode !== document.body) document.body.appendChild(el); }, { once: true }); }
    return el;
  };
  let aberto = false; // depois de liberar, nenhuma mensagem atrasada recria a tela de espera por cima da página
  const mostra = (html) => { if (aberto) return; const el = porta(); el.classList.toggle('ep-erro', html.includes('class="e"')); el.querySelector('[data-m]').innerHTML = html.replace('<span class="s"></span>', ''); }; // aparece já, sem esperar a página
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const carrega = f => new Promise((ok, no) => { const s = document.createElement('script'); s.src = CFG.sdk + f; s.onload = ok; s.onerror = () => no(new Error('Não consegui carregar o login do Google. Verifique a internet e recarregue.')); (document.head || root).appendChild(s); });

  let auth = null;
  const API = window.EstudioLogin = {
    email: null,
    async token() { const u = auth?.currentUser; return u ? 'Bearer ' + await u.getIdToken() : null; },
    async sair() { try { await fetch('/sair', { method: 'POST', credentials: 'same-origin' }); } catch { } try { await auth?.signOut(); } catch { } location.href = menuUrl(false); },
    pronto: null,
    _perfil: null,
    // nome e foto escolhidos na "Minha conta" do menu (porteiro: /conta); se não tiver, os do Google
    perfil() {
      return this._perfil || (this._perfil = (async () => {
        await this.pronto; const u = auth?.currentUser;
        const base = { email: this.email, nome: u?.displayName || String(this.email || '').split('@')[0], foto: u?.photoURL || null };
        try { const r = await fetch('/conta', { credentials: 'same-origin', cache: 'no-store' }); if (r.ok && r.headers.get('x-porteiro')) return { ...base, ...(await r.json()) }; } catch { }
        return base;
      })());
    },
  };
  API.pronto = (async () => {
    mostra('<span class="s"></span>Conferindo seu acesso…');
    try {
      if (!window.firebase?.auth) { await carrega('firebase-app-compat.js'); await carrega('firebase-auth-compat.js'); }
      if (!firebase.apps.length) firebase.initializeApp(CFG.firebase);
      auth = firebase.auth();
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      const user = await new Promise(r => { const u = auth.onAuthStateChanged(x => { u(); r(x); }); });
      if (!user) { mostra('<span class="s"></span>Abrindo o login…'); location.replace(menuUrl(true)); return new Promise(() => { }); }
      let r; try { r = await fetch(CFG.servidor + '/quem', { headers: { authorization: 'Bearer ' + await user.getIdToken(true) }, cache: 'no-store' }); }
      catch { throw new Error(`Não consegui falar com o servidor. Se a internet estiver ok, falta liberar este site na Cloudflare: coloque ${location.origin} na variável ORIGENS do worker turma-ia.`); }
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.email) {
        if (r.status === 401 || r.status === 403) { try { await auth.signOut(); } catch { } }
        throw new Error(j.error?.message || 'Esta conta não tem acesso ao Estúdio Problems.');
      }
      API.email = j.email;
      // a página aparece por baixo e a tela de carregamento some com fade (só visual: o acesso já foi conferido acima)
      const abre = () => { aberto = true; const pt = document.getElementById('estudio-porta'); root.classList.remove('estudio-trancado'); if (pt) requestAnimationFrame(() => requestAnimationFrame(() => { pt.classList.add('ep-saindo'); setTimeout(() => pt.remove(), 380); })); // espera o programa desenhar por baixo document.dispatchEvent(new CustomEvent('estudio-login', { detail: { email: j.email } }));
        API.perfil().then(p => document.dispatchEvent(new CustomEvent('estudio-perfil', { detail: p }))); };
      document.body ? abre() : addEventListener('DOMContentLoaded', abre, { once: true });
      return j.email;
    } catch (e) {
      mostra(`<div class="e">${esc(e.message || e)}</div><a class="ep-bt" href="${esc(menuUrl(false))}">Ir para o menu</a>`);
      return new Promise(() => { });
    }
  })();
})();
