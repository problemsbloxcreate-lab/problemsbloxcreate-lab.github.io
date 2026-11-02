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
      apiKey: '__FIREBASE_API_KEY__',
      authDomain: 'estudio-problems-fbe08.firebaseapp.com',
      projectId: 'estudio-problems-fbe08',
      storageBucket: 'estudio-problems-fbe08.firebasestorage.app',
      messagingSenderId: '833185766272',
      appId: '1:833185766272:web:4127fcf45287c5a559ff65',
    },
  };
  const NOME_PROG = ((p => [['/animador/', 'ANIMADOR'], ['/jester/', 'JESTER DREAMS'], ['/editor/', 'EDITOR'], ['/modelador/blockbench', 'BLOCKBENCH'], ['/modelador/', 'MODELADOR'], ['/shorts/', 'SHORTS']].find(([k]) => p.startsWith(k))?.[1] || 'ESTÚDIO PROBLEMS')(location.pathname));
  const root = document.documentElement;
  // logo da tela de carregamento = o ícone do próprio programa (o mesmo da aba e do cabeçalho); sem programa, o do menu
  const LOGO_PROG = { ANIMADOR: '/animador/icones/simbolo.svg', 'JESTER DREAMS': '/jester/icone.svg', EDITOR: '/editor/icone.svg', MODELADOR: '/modelador/icone.svg', SHORTS: '/shorts/icone-shorts-180.png', BLOCKBENCH: '/modelador/icone.svg' }[NOME_PROG] || '';
  const LOGO_EP = window.EstudioIcones?.atual?.() ? window.EstudioIcones.url(window.EstudioIcones.atual()) : ''; // ícone novo do programa (Sh, Ed, An, Md; ADM › Ícones)
  const logoHtml = () => ((LOGO_EP || LOGO_PROG) ? '<img class="ep-img" alt=""' + (LOGO_EP ? ' data-estudio-icone-img="' + window.EstudioIcones.atual() + '"' : '') + ' src="' + (LOGO_EP || LOGO_PROG) + '" onerror="this.parentNode.classList.remove(\'ep-prog\');this.remove()">' : '') + '<svg class="ep-cam" width="84" height="84" viewBox="0 0 64 64"><g transform="translate(-9 -23.5) scale(.17)"><path d="M200.5 154 339 228V380L200.5 454 62 380V228Z" fill="#fff" stroke="#000" stroke-width="13" stroke-linejoin="round"/><g fill="none" stroke="#000" stroke-width="9" stroke-linecap="round"><path d="M202 224Q184 249 163 267"/><path d="M267 255Q254 279 239 298"/><path d="M116 307Q111 325 111.5 343"/></g></g><g stroke="#000" stroke-width="2.2" stroke-linejoin="round"><rect x="26.5" y="37.5" width="24" height="20" rx="4.5" fill="#19d3f0"/><path d="M50.5 43.5 61.5 37.5V57.5L50.5 51.5Z" fill="#19d3f0"/></g></svg>';
  // JESTER DREAMS (programa de TESTE): "Jester" sai do mesmo canto e cada letra vai para o seu lugar; depois "Dreams" aparece com
  // as cores do arco-íris bem claras, e um selo "em testes". O resto (logo, barra, o que está carregando) é igual aos outros.
  const nomeHtml = () => NOME_PROG !== 'JESTER DREAMS' ? `<div class="ep-nm">${esc(NOME_PROG)}</div>`
    : `<div class="ep-nm ep-jd"><span class="ep-jd-j">${[...'Jester'].map((c, i) => `<i style="--i:${i}">${c}</i>`).join('')}</span><span class="ep-jd-d">Dreams</span></div><div class="ep-jd-selo">EM TESTES</div>`;
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
#estudio-porta .ep-jd{display:flex;gap:10px;align-items:baseline;font:600 30px/1.1 'Rubik','Segoe UI',system-ui,sans-serif;letter-spacing:.5px}
#estudio-porta .ep-jd-j{display:inline-flex}#estudio-porta .ep-jd-j i{font-style:normal;color:#fff;opacity:0;display:inline-block;animation:epJdLetra .42s cubic-bezier(.2,.9,.25,1) both;animation-delay:calc(var(--i) * .03s)}
#estudio-porta .ep-jd-d{font-weight:700;background:linear-gradient(90deg,#ffb3c7,#ffd6a5,#fdffb6,#caffbf,#9bf6ff,#a0c4ff,#bdb2ff,#ffc6ff);-webkit-background-clip:text;background-clip:text;color:transparent;opacity:0;filter:blur(6px);animation:epJdDreams .5s ease .28s both}
#estudio-porta .ep-jd-selo{margin-top:6px;font:800 10px/1 'Segoe UI',system-ui,sans-serif;letter-spacing:1.6px;padding:4px 9px;border-radius:20px;color:#1b1206;background:linear-gradient(135deg,#ffd29a,#ffb3c7);opacity:0;animation:epJdSelo .3s ease .55s forwards}
@keyframes epJdLetra{0%{opacity:0;transform:translateX(calc(var(--i) * -0.62em)) scale(.85)}35%{opacity:.75}100%{opacity:.92;transform:none}}
@keyframes epJdDreams{to{opacity:1;filter:none}}@keyframes epJdSelo{to{opacity:1}}
@media (prefers-reduced-motion:reduce){#estudio-porta .ep-jd-j i,#estudio-porta .ep-jd-d,#estudio-porta .ep-jd-selo{animation:none;opacity:1;filter:none;transform:none}}
#estudio-porta .ep-br{width:180px;height:4px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden;margin:18px 0 8px;position:relative}
#estudio-porta .ep-br>i{position:absolute;top:0;bottom:0;left:0;width:0;border-radius:4px;background:linear-gradient(90deg,#3d8bff,#19d3f0);transition:width .2s linear}
#estudio-porta .ep-br::after{content:'';position:absolute;top:0;bottom:0;left:0;width:30%;border-radius:4px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);animation:epBarra 1.3s ease-in-out infinite}
#estudio-porta .ep-pc{display:flex;gap:8px;justify-content:center;align-items:baseline;font-size:11.5px;color:#8d929c;min-height:17px;max-width:340px;margin:-4px 0 4px}#estudio-porta .ep-pc b{color:#cfd3da;font-weight:700;font-variant-numeric:tabular-nums;min-width:34px;text-align:right}#estudio-porta .ep-pc span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;text-align:left}#estudio-porta.ep-erro .ep-pc{display:none}
#estudio-porta.ep-erro .ep-br{display:none}#estudio-porta.ep-erro .ep-lg{animation:none;background:linear-gradient(135deg,#ff6b6b,#ff9a62)}
#estudio-porta .ep-m{color:#b9bdc6;font-size:13px;min-height:20px;max-width:340px}#estudio-porta .ep-m .e,#estudio-porta .ep-m.err{color:#ff8a9a}
#estudio-porta [hidden]{display:none!important}#estudio-porta a.ep-bt{display:inline-flex;margin-top:12px;padding:9px 18px;border-radius:10px;background:#3d8bff;color:#fff;text-decoration:none;font-weight:600}#estudio-porta a.ep-bt:hover{filter:brightness(1.08)}
#estudio-porta .ep-lg.ep-prog{background:none;box-shadow:0 14px 40px rgba(0,0,0,.45)}#estudio-porta .ep-lg .ep-img{width:68px;height:68px;display:block;image-rendering:pixelated}#estudio-porta .ep-lg.ep-prog .ep-cam,#estudio-porta .ep-lg:not(.ep-prog) .ep-img,#estudio-porta.ep-erro .ep-lg .ep-img{display:none}#estudio-porta.ep-erro .ep-lg .ep-cam{display:block}
@keyframes epBarra{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}@keyframes epPulso{50%{transform:scale(1.05)}}@keyframes epEntra{from{opacity:0}}
@media (prefers-reduced-motion:reduce){#estudio-porta .ep-lg,#estudio-porta .ep-br::after,#estudio-porta .ep-c{animation:none}#estudio-porta{transition:none}}
/* estilo da inicialização do macOS (decisão do dono, 02/11/2026): fundo preto, só o ícone, barra fina e embaixo a % com o que está carregando */
#estudio-porta{background:#000}#estudio-porta .ep-c{gap:0}
#estudio-porta .ep-lg,#estudio-porta .ep-lg.ep-prog,#estudio-porta.ep-erro .ep-lg{width:84px;height:84px;border-radius:0;background:none;box-shadow:none;animation:none;margin:0}#estudio-porta .ep-lg .ep-img{width:84px;height:84px}
#estudio-porta .ep-nm,#estudio-porta .ep-sb{display:none}#estudio-porta .ep-jd-selo{margin-top:14px}
#estudio-porta .ep-br{width:200px;height:5px;border-radius:3px;background:rgba(255,255,255,.16);margin:46px 0 12px}#estudio-porta .ep-br::after{display:none}#estudio-porta .ep-br>i{background:#e8e9ec;border-radius:3px;transition:width .35s ease}
#estudio-porta .ep-pc{font-size:11.5px;color:#7d8089;margin:0}#estudio-porta .ep-pc b{color:#c3c6cc}
#estudio-porta:not(.ep-erro) .ep-m{display:none}#estudio-porta a.ep-bt{padding:10px 20px;border-radius:999px;background:rgba(255,255,255,.1);color:#f1f2f4;border:1px solid rgba(255,255,255,.16);font-weight:500;font-size:13.5px;margin-top:18px}#estudio-porta a.ep-bt:hover{filter:none;background:rgba(255,255,255,.16)}#estudio-porta .tl-out{color:#9aa0ab;text-decoration:none}#estudio-porta .ep-m{margin-top:18px}`;
  (document.head || root).appendChild(st);

  const menuUrl = volta => { const u = new URL(CFG.menu, location.href); if (volta) u.searchParams.set('volta', location.href); return u.href; };
  const porta = () => {
    let el = document.getElementById('estudio-porta');
    if (!el) { el = document.createElement('div'); el.id = 'estudio-porta'; el.innerHTML = `<div class="ep-c"><div class="ep-lg${LOGO_EP || LOGO_PROG ? ' ep-prog' : ''}">${logoHtml()}</div>${nomeHtml()}<div class="ep-sb">Estúdio Problems</div><div class="ep-br"><i data-ep-barra></i></div><div class="ep-pc"><b data-ep-pct>0%</b><span data-ep-arq></span></div><div class="ep-m" data-m></div></div>`; (document.body || root).appendChild(el); if (!document.body) addEventListener('DOMContentLoaded', () => { if (el.isConnected && el.parentNode !== document.body) document.body.appendChild(el); }, { once: true }); }
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
      const abre = () => { if (NOME_PROG === 'JESTER DREAMS' && performance.now() < 950) { setTimeout(abre, 950 - performance.now()); return; } aberto = true; const pt = document.getElementById('estudio-porta'); root.classList.remove('estudio-trancado'); if (pt) requestAnimationFrame(() => requestAnimationFrame(() => { pt.classList.add('ep-saindo'); setTimeout(() => pt.remove(), 380); })); /* espera o programa desenhar por baixo */ document.dispatchEvent(new CustomEvent('estudio-login', { detail: { email: j.email } }));
        API.perfil().then(p => document.dispatchEvent(new CustomEvent('estudio-perfil', { detail: p }))); };
      // espera também as imagens e arquivos que ainda estão baixando (porcentagem na tela; no máximo 12 s)
      const abreTudo = async () => { try { await window.EstudioProgresso?.esperarTudo(12000); } catch { } abre(); };
      document.body ? abreTudo() : addEventListener('DOMContentLoaded', abreTudo, { once: true });
      return j.email;
    } catch (e) {
      mostra(`<div class="e">${esc(e.message || e)}</div><a class="ep-bt" href="${esc(menuUrl(false))}">Ir para o menu</a>`);
      return new Promise(() => { });
    }
  })();
})();
