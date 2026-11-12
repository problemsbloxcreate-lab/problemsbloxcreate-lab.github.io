/* TEMA CEDO */try{const H=document.documentElement;if(!H.dataset.tema)H.dataset.tema=localStorage.getItem('ep-tema')==='claro'?'claro':'escuro'}catch{}
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
      authDomain: 'estudio-problems-login.firebaseapp.com',
      projectId: 'estudio-problems-login',
      storageBucket: 'estudio-problems-login.firebasestorage.app',
      messagingSenderId: '105930517340',
      appId: '1:105930517340:web:665cfdcffdcd8283e8af99',
    },
  };
  const NOME_PROG = ((p => [['/animador/', 'ANIMADOR'], ['/jester/', 'JESTER DREAMS'], ['/editor/', 'EDITOR'], ['/modelador/blockbench', 'BLOCKBENCH'], ['/modelador/', 'MODELADOR'], ['/shorts/', 'SHORTS'], ['/publicacoes/', 'PUBLICAÇÕES']].find(([k]) => p.startsWith(k))?.[1] || 'ESTÚDIO PROBLEMS')(location.pathname));
  const root = document.documentElement;
  // logo da tela de carregamento = o ícone do próprio programa (o mesmo da aba e do cabeçalho); sem programa, o do menu
  const LOGO_PROG = { ANIMADOR: '/animador/icones/simbolo.svg', 'JESTER DREAMS': '/jester/icone.svg', EDITOR: '/editor/icone.svg', MODELADOR: '/modelador/icone.svg', SHORTS: '/shorts/icone-shorts-180.png', BLOCKBENCH: '/modelador/icone.svg' }[NOME_PROG] || '';
  const LOGO_EP = window.EstudioIcones?.atual?.() ? window.EstudioIcones.url(window.EstudioIcones.atual()) : ''; // ícone novo do programa (Sh, Ed, An, Md; ADM › Ícones)
  const logoHtml = () => ((LOGO_EP || LOGO_PROG) ? '<img class="ep-img" alt=""' + (LOGO_EP ? ' data-estudio-icone-img="' + window.EstudioIcones.atual() + '"' : '') + ' src="' + (LOGO_EP || LOGO_PROG) + '" onerror="this.parentNode.classList.remove(\'ep-prog\');this.remove()">' : '') + '<svg viewBox="0 0 64 64" class="ep-cam" width="84" height="84"><defs><linearGradient id="epclq-logi" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5cc4ff"/><stop offset="1" stop-color="#6b5cff"/></linearGradient></defs><rect width="64" height="64" rx="14.5" fill="url(#epclq-logi)"/><g fill="none" stroke="#fff" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"><rect x="15" y="27" width="34" height="22" rx="3"/><path d="M15 27l3-9 31 0-3 9"/><path d="M24 18l-2.5 9M33 18l-2.5 9M42 18l-2.5 9"/></g><path d="M29 33v10l8-5z" fill="#fff"/></svg>';
  // JESTER DREAMS (programa de TESTE): "Jester" sai do mesmo canto e cada letra vai para o seu lugar; depois "Dreams" aparece com
  // as cores do arco-íris bem claras, e um selo "em testes". O resto (logo, barra, o que está carregando) é igual aos outros.
    // CELESTE: título da tela única em linguagem simples ("Abrindo o Animador"), igual na saída do menu
  const TITULO = (p => { const L = [['/animador/', 'o Animador'], ['/editor/', 'o Editor'], ['/modelador/blockbench', 'o Blockbench'], ['/modelador/', 'o Modelador'], ['/shorts/', 'os Shorts'], ['/publicacoes/', 'as Publicações'], ['/preparativos/', 'o Preparativos'], ['/cerebro/', 'o Cérebro'], ['/musicas/', 'as Músicas'], ['/jester/', 'o Jester Dreams']].find(([k]) => p.startsWith(k)); return L ? 'Abrindo ' + L[1] : 'Abrindo o Estúdio'; })(location.pathname);
  const nomeHtml = () => true ? `<div class="ep-nm">${esc(TITULO)}</div>`
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
#estudio-porta:not(.ep-erro) .ep-m{display:none}
/* o ícone do PROGRAMA respira de leve (não fica 100% parado); o do Estúdio fica parado */
#estudio-porta .ep-lg.ep-prog .ep-img{animation:epRespira 2.6s ease-in-out infinite}@keyframes epRespira{50%{transform:scale(1.045)}}@media (prefers-reduced-motion:reduce){#estudio-porta .ep-lg.ep-prog .ep-img{animation:none}}
#estudio-porta a.ep-bt{padding:10px 20px;border-radius:999px;background:rgba(255,255,255,.1);color:#f1f2f4;border:1px solid rgba(255,255,255,.16);font-weight:500;font-size:13.5px;margin-top:18px}#estudio-porta a.ep-bt:hover{filter:none;background:rgba(255,255,255,.16)}#estudio-porta .tl-out{color:#9aa0ab;text-decoration:none}#estudio-porta .ep-m{margin-top:18px}
/* ===== CELESTE (2.0, aprovado pela dona em 11/11/2026): A MESMA TELA do clique no menu até o programa aberto (saída do menu = login = carregamento).
   Fundo: a montanha desenhada por nós (só o formato; noite com estrelas no escuro, dia no claro). Ícone do programa, "Abrindo o X", barra fina e UMA frase simples (sem nome de arquivo). ===== */
#estudio-porta{--pt-tx:#f5f5f7;--pt-tx2:rgba(235,235,245,.64);--pt-tx3:rgba(235,235,245,.4);--pt-ac:#5cc4ff;--pt-trilho:rgba(255,255,255,.14);
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 560' preserveAspectRatio='none'%3E%3Cpath fill='%230f182c' d='M0 330 L170 230 L300 300 L470 170 L610 260 L760 150 L930 270 L1080 190 L1250 280 L1440 210 V560 H0Z'/%3E%3Cpath fill='%2316223c' d='M0 400 L210 300 L360 360 L560 220 L720 120 L880 250 L1010 200 L1180 320 L1320 270 L1440 330 V560 H0Z'/%3E%3Cpath fill='%231d2b4a' d='M0 470 L180 400 L340 440 L520 360 L700 430 L860 370 L1040 440 L1220 390 L1440 450 V560 H0Z'/%3E%3C/svg%3E") left bottom/100% 40% no-repeat,
  radial-gradient(1.2px 1.2px at 12% 18%,#fff,transparent),radial-gradient(1px 1px at 28% 8%,#fff,transparent),radial-gradient(1.4px 1.4px at 44% 22%,#fff,transparent),radial-gradient(1px 1px at 61% 12%,#fff,transparent),radial-gradient(1.3px 1.3px at 77% 26%,#fff,transparent),radial-gradient(1px 1px at 89% 9%,#fff,transparent),radial-gradient(1px 1px at 6% 34%,#fff,transparent),radial-gradient(1.2px 1.2px at 53% 36%,#fff,transparent),
  radial-gradient(60vmax 60vmax at 50% 30%,rgba(92,196,255,.16),transparent 60%),linear-gradient(180deg,#0b1020,#16203a 70%)!important;
  color:var(--pt-tx)!important;font-family:"Inter","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif!important;transition:opacity .25s ease!important}
html[data-tema="claro"] #estudio-porta{--pt-tx:#1d1d1f;--pt-tx2:rgba(60,60,67,.72);--pt-tx3:rgba(60,60,67,.46);--pt-ac:#0a74c9;--pt-trilho:rgba(0,0,0,.1);
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 560' preserveAspectRatio='none'%3E%3Cpath fill='%23c9def3' d='M0 330 L170 230 L300 300 L470 170 L610 260 L760 150 L930 270 L1080 190 L1250 280 L1440 210 V560 H0Z'/%3E%3Cpath fill='%23a9cbed' d='M0 400 L210 300 L360 360 L560 220 L720 120 L880 250 L1010 200 L1180 320 L1320 270 L1440 330 V560 H0Z'/%3E%3Cpath fill='%238fb8e0' d='M0 470 L180 400 L340 440 L520 360 L700 430 L860 370 L1040 440 L1220 390 L1440 450 V560 H0Z'/%3E%3C/svg%3E") left bottom/100% 40% no-repeat,
  radial-gradient(60vmax 60vmax at 50% 30%,rgba(255,255,255,.6),transparent 60%),linear-gradient(180deg,#bfe3ff,#eef7ff 70%)!important}
#estudio-porta .ep-c{gap:14px!important;transform:translateY(-10vh);animation:none!important}
#estudio-porta .ep-lg,#estudio-porta .ep-lg.ep-prog,#estudio-porta.ep-erro .ep-lg{width:72px!important;height:72px!important;border-radius:18px!important;overflow:hidden;margin:0!important;box-shadow:0 10px 30px rgba(0,0,0,.25)!important;background:linear-gradient(160deg,#5cc4ff,#3a7bd5)!important;display:grid!important;place-items:center}
#estudio-porta .ep-lg.ep-prog{background:none!important}
#estudio-porta .ep-lg .ep-img,#estudio-porta .ep-lg.ep-prog .ep-img{width:72px!important;height:72px!important;animation:none!important}
#estudio-porta .ep-lg .ep-cam{width:44px!important;height:44px!important}
#estudio-porta .ep-nm{display:block!important;margin:6px 0 0!important;font-weight:600!important;font-size:20px!important;line-height:1.2!important;letter-spacing:-.01em!important;text-transform:none!important;color:var(--pt-tx)!important}
#estudio-porta .ep-sb,#estudio-porta [data-ep-arq]{display:none!important}
#estudio-porta .ep-br{width:240px!important;height:4px!important;border-radius:2px!important;background:var(--pt-trilho)!important;margin:0!important}
#estudio-porta .ep-br::after{display:none!important}
#estudio-porta .ep-br>i{background:var(--pt-ac)!important;border-radius:2px!important}
#estudio-porta .ep-pc{margin:-4px 0 0!important;font-weight:500!important;font-size:12px!important;color:var(--pt-tx3)!important}
#estudio-porta .ep-pc b{color:var(--pt-tx3)!important;font-weight:500!important;min-width:0!important}
#estudio-porta .ep-m,#estudio-porta:not(.ep-erro) .ep-m{display:block!important;margin:0!important;color:var(--pt-tx2)!important;font-size:13px!important}
#estudio-porta.ep-erro .ep-m{color:var(--pt-tx)!important}
#estudio-porta a.ep-bt{border:0!important;border-radius:10px!important;background:var(--pt-ac)!important;color:#04223a!important;font-weight:600!important;padding:10px 20px!important}
html[data-tema="claro"] #estudio-porta a.ep-bt{color:#fff!important}
/* CELESTE (11/11/2026, pedido da dona): fundo = a FOTO da montanha (a mesma do menu), chegando perto bem devagar, com um brilho azul atrás do ícone */
#estudio-porta{background:#0b1020!important;overflow:hidden}
#estudio-porta::before{content:"";position:absolute;inset:-6%;z-index:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,12,22,.2),rgba(8,12,22,.5) 55%,rgba(8,12,22,.82)),url(/fundo-montanha.jpg) center 40%/cover no-repeat;animation:epFotoKB 26s ease-in-out infinite alternate;will-change:transform}
#estudio-porta::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:radial-gradient(40% 32% at 50% 40%,rgba(92,196,255,.22),transparent 70%)}
html[data-tema="claro"] #estudio-porta{background:#dbe7f3!important}
html[data-tema="claro"] #estudio-porta::before{background:linear-gradient(180deg,rgba(240,244,250,.15),rgba(240,244,250,.5) 55%,rgba(240,244,250,.78)),url(/fundo-montanha.jpg) center 40%/cover no-repeat}
html[data-tema="claro"] #estudio-porta::after{background:radial-gradient(40% 32% at 50% 40%,rgba(255,255,255,.55),transparent 70%)}
#estudio-porta>*{position:relative;z-index:1}
html:not([data-tema="claro"]) #estudio-porta :is(.ep-nm,.ep-m,.ep-pc,.ep-at-t,.ep-at-pc,h1,p,.msg){text-shadow:0 1px 14px rgba(0,0,0,.55)}
@keyframes epFotoKB{from{transform:scale(1) translate3d(0,0,0)}to{transform:scale(1.1) translate3d(-1.5%,-1.2%,0)}}
@media (prefers-reduced-motion:reduce){#estudio-porta::before{animation:none}}
#estudio-porta .ep-m .s,#estudio-porta .ep-m .spin{display:none!important}
/* (a mesma tela do /estudio-carregando.js: quem chegar primeiro cria a porta) */
/* ===== CARREGAMENTO C (escolha da dona, 12/11/2026): fundo liso; o ícone com um ANEL de progresso em volta e um BRILHO
   suave na cor do programa atrás; embaixo o nome e uma linha "54% · o que está acontecendo". Sem foto, sem barra, sem lista de passos. ===== */
#estudio-porta.m2{background:#141416!important;--pt-tx:#f5f5f7!important;--pt-tx2:rgba(235,235,245,.66)!important}
html[data-tema="claro"] #estudio-porta.m2{background:#f2f2f5!important;--pt-tx:#1d1d1f!important;--pt-tx2:rgba(60,60,67,.66)!important}
#estudio-porta.m2::before{content:""!important;position:absolute;inset:0;z-index:0;pointer-events:none;filter:none!important;animation:epBrilho 1.8s ease-in-out infinite alternate!important;background:radial-gradient(260px 260px at 50% calc(50% - 64px),color-mix(in srgb,var(--ep-cor,#5cc4ff) 30%,transparent),transparent 72%)!important}
html[data-tema="claro"] #estudio-porta.m2::before{background:radial-gradient(260px 260px at 50% calc(50% - 64px),color-mix(in srgb,var(--ep-cor,#5cc4ff) 22%,transparent),transparent 72%)!important}
#estudio-porta.m2::after{display:none!important}
#estudio-porta.m2 .ep-c{display:grid!important;grid-template-columns:auto auto;justify-content:center;align-items:center;column-gap:6px;row-gap:0!important;transform:translateY(-4vh)!important;width:auto!important;text-align:center}
#estudio-porta.m2 .ep-lg,#estudio-porta.m2 .ep-lg.ep-prog,#estudio-porta.m2.ep-erro .ep-lg{grid-column:1/-1;justify-self:center;position:relative;width:60px!important;height:60px!important;margin:30px!important;border-radius:15px!important;overflow:visible!important;box-shadow:none!important;background:none!important;animation:none!important;transform:none!important}
/* só a LOGO pulsa; o anel fica parado; o brilho atrás pisca leve (pedido da dona, 12/11/2026) */
@keyframes epRespira2{50%{transform:scale(1.06)}}@keyframes epBrilho{from{opacity:.6}to{opacity:1}}
/* o anel: fica 16 px para fora do ícone; a parte cheia segue a porcentagem (--ep-p, posto pelo contador) */
#estudio-porta.m2 .ep-lg::before{content:"";position:absolute;inset:-30px;border-radius:50%;background:conic-gradient(var(--pt-tx) calc(var(--ep-p,0) * 1%),color-mix(in srgb,var(--pt-tx) 13%,transparent) 0);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 4px));mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 4px));transition:background .3s}
#estudio-porta.m2 .ep-lg::after{display:none!important}
#estudio-porta.m2 .ep-lg :is(.ep-img,.ep-cam),#estudio-porta.m2 .ep-lg.ep-prog .ep-img{width:60px!important;height:60px!important;border-radius:14px!important;display:block;box-shadow:0 8px 22px rgba(0,0,0,.3);animation:epRespira2 2.6s ease-in-out infinite!important}
@media (prefers-reduced-motion:reduce){#estudio-porta.m2::before,#estudio-porta.m2 .ep-lg :is(.ep-img,.ep-cam){animation:none!important}}
#estudio-porta.m2 .ep-lg:not(.ep-prog){background:none!important}
#estudio-porta.m2 .ep-lg.ep-prog .ep-cam{display:none!important} /* com o ícone do programa, a claquete do Estúdio some (antes aparecia embaixo, por cima do título) */
#estudio-porta.m2 .ep-nm{grid-column:1/-1;display:block!important;margin:26px 0 4px!important;font:600 20px/1.25 "Inter","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif!important;letter-spacing:-.01em!important;color:var(--pt-tx)!important;text-shadow:none!important}
#estudio-porta.m2 .ep-sb,#estudio-porta.m2 .ep-br,#estudio-porta.m2 [data-ep-arq]{display:none!important}
#estudio-porta.m2 .ep-pc{margin:0!important;justify-self:end}
#estudio-porta.m2 .ep-pc b{font:600 13.5px "Inter","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif!important;color:var(--pt-tx)!important;font-variant-numeric:tabular-nums;text-shadow:none!important}
#estudio-porta.m2 .ep-pc b::after{content:" ·";color:var(--pt-tx2)}
#estudio-porta.m2 .ep-m,#estudio-porta.m2:not(.ep-erro) .ep-m{display:block!important;justify-self:start;margin:0!important;font:400 13.5px "Inter","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif!important;color:var(--pt-tx2)!important;text-shadow:none!important;max-width:60vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#estudio-porta.m2.ep-erro .ep-pc{display:none!important}#estudio-porta.m2.ep-erro .ep-m{grid-column:1/-1;justify-self:center;white-space:normal;color:var(--pt-tx)!important}
#estudio-porta.m2.ep-erro .ep-lg::before{background:color-mix(in srgb,#ff453a 70%,transparent)}
#estudio-porta.m2 a.ep-bt{grid-column:1/-1;justify-self:center;border-radius:999px!important}
@media (prefers-reduced-motion:reduce){#estudio-porta.m2 .ep-lg{animation:none}}
`;
  (document.head || root).appendChild(st);

  const menuUrl = volta => { const u = new URL(CFG.menu, location.href); if (volta) u.searchParams.set('volta', location.href); return u.href; };
  const porta = () => {
    let el = document.getElementById('estudio-porta');
    if (!el) { el = document.createElement('div'); el.id = 'estudio-porta'; el.classList.add('m2'); try { const ic = window.EstudioIcones, id = ic?.atual?.(), cor = id && ic.config?.()?.[id]?.fg; el.style.setProperty('--ep-cor', /^#[0-9a-f]{6}$/i.test(cor || '') ? cor : '#5cc4ff'); } catch { } el.innerHTML = `<div class="ep-c"><div class="ep-lg${LOGO_EP || LOGO_PROG ? ' ep-prog' : ''}">${logoHtml()}</div>${nomeHtml()}<div class="ep-sb">Estúdio Problems</div><div class="ep-br"><i data-ep-barra></i></div><div class="ep-pc"><b data-ep-pct>0%</b><span data-ep-arq></span></div><div class="ep-m" data-m></div></div>`; (document.body || root).appendChild(el); if (!document.body) addEventListener('DOMContentLoaded', () => { if (el.isConnected && el.parentNode !== document.body) document.body.appendChild(el); }, { once: true }); }
    return el;
  };
  let aberto = false; // depois de liberar, nenhuma mensagem atrasada recria a tela de espera por cima da página
  const mostra = (html) => { if (aberto) return; const el = porta(); el.classList.toggle('ep-erro', html.includes('class="e"')); el.querySelector('[data-m]').innerHTML = html.replace('<span class="s"></span>', ''); }; // aparece já, sem esperar a página
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // RELATÓRIO DE SUPORTE na tela de erro: mora no /estudio-carregando.js (carrega se a página ainda não tiver)
  const suporte = c => { const f = () => window.EstudioSuporte?.poe(c, { publico: true }); if (window.EstudioSuporte) return f();
    const s = document.createElement('script'); s.src = '/estudio-carregando.js'; s.setAttribute('data-so-progresso', ''); s.onload = f; (document.head || root).appendChild(s); };
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
      try { await window.EstudioPasse?.pronto; } catch { } // veio do outro endereço com o login junto (estudio-conta.js)
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
      mostra(`<div class="e">${esc(String(e.message || e).slice(0, 300))}</div><a class="ep-bt" href="${esc(menuUrl(false))}">Ir para o menu</a>`);
      suporte(porta().querySelector('[data-m]')); // relatório de suporte + versão (tela sem login liberado: sem dados da equipe)
      return new Promise(() => { });
    }
  })();
})();
