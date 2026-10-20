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
   Também dispara o evento  document 'estudio-login'  (e.detail.email) quando libera.

   SEGURANÇA: isto é a porta da frente. Quem decide quem entra é o servidor (EMAILS_PERMITIDOS na Cloudflare).
   Nunca coloque e-mails, senhas ou chaves neste arquivo. */
'use strict';
(() => {
  const CFG = {
    menu: '/',                                                   // onde fica o menu (login)
    servidor: 'https://turma-ia.problemsraiz.workers.dev',       // servidor que confere o e-mail (/quem)
    sdk: 'https://www.gstatic.com/firebasejs/10.14.1/',
    firebase: { // dados PÚBLICOS por natureza; a segurança está no servidor
      apiKey: 'AIzaSyAhMU9NN8-rVowcGTxpI3Rs8eTSiwKoAB0',
      authDomain: 'editor-animacao.firebaseapp.com',
      projectId: 'editor-animacao',
      storageBucket: 'editor-animacao.firebasestorage.app',
      messagingSenderId: '301911447851',
      appId: '1:301911447851:web:5841eaec1f01ab94460d6e',
    },
  };
  const root = document.documentElement;
  root.classList.add('estudio-trancado');
  const st = document.createElement('style');
  st.textContent = `html.estudio-trancado body>*:not(#estudio-porta){display:none!important}
#estudio-porta{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#262626;font:14px/1.5 'Segoe UI',system-ui,sans-serif;color:#e7e7e7;padding:16px}
#estudio-porta .c{width:min(380px,100%);background:#303030;border:1px solid #565656;border-radius:16px;padding:26px 22px;text-align:center}
#estudio-porta .s{display:inline-block;width:14px;height:14px;border:2px solid #3d8bff;border-top-color:transparent;border-radius:50%;animation:ep-g .8s linear infinite;vertical-align:-2px;margin-right:6px}
#estudio-porta .e{color:#ff8a9a}#estudio-porta a{display:inline-block;margin-top:14px;padding:9px 16px;border-radius:9px;background:#3d8bff;color:#fff;text-decoration:none;font-weight:600}
@keyframes ep-g{to{transform:rotate(360deg)}}`;
  (document.head || root).appendChild(st);

  const menuUrl = volta => { const u = new URL(CFG.menu, location.href); if (volta) u.searchParams.set('volta', location.href); return u.href; };
  const porta = () => {
    let el = document.getElementById('estudio-porta');
    if (!el) { el = document.createElement('div'); el.id = 'estudio-porta'; el.innerHTML = '<div class="c"><b>Estúdio Problems</b><div data-m style="margin-top:10px"></div></div>'; (document.body || root).appendChild(el); }
    return el;
  };
  const mostra = (html) => { const put = () => { porta().querySelector('[data-m]').innerHTML = html; }; document.body ? put() : addEventListener('DOMContentLoaded', put, { once: true }); };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const carrega = f => new Promise((ok, no) => { const s = document.createElement('script'); s.src = CFG.sdk + f; s.onload = ok; s.onerror = () => no(new Error('Não consegui carregar o login do Google. Verifique a internet e recarregue.')); (document.head || root).appendChild(s); });

  let auth = null;
  const API = window.EstudioLogin = {
    email: null,
    async token() { const u = auth?.currentUser; return u ? 'Bearer ' + await u.getIdToken() : null; },
    async sair() { try { await auth?.signOut(); } catch { } location.href = menuUrl(false); },
    pronto: null,
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
      const abre = () => { document.getElementById('estudio-porta')?.remove(); root.classList.remove('estudio-trancado'); document.dispatchEvent(new CustomEvent('estudio-login', { detail: { email: j.email } })); };
      document.body ? abre() : addEventListener('DOMContentLoaded', abre, { once: true });
      return j.email;
    } catch (e) {
      mostra(`<div class="e">${esc(e.message || e)}</div><a href="${esc(menuUrl(false))}">Ir para o menu</a>`);
      return new Promise(() => { });
    }
  })();
})();
