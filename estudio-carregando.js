/* TEMA CEDO */try{const H=document.documentElement;if(!H.dataset.tema)H.dataset.tema=localStorage.getItem('ep-tema')==='claro'?'claro':'escuro'}catch{}
/* ===================== estudio-carregando.js — tela de carregamento padrão do Estúdio Problems =====================
   Só VISUAL: mostra a mesma tela de carregamento do estudio-login.js (logo, NOME do programa, "Estúdio Problems",
   barra andando e a mensagem) enquanto o programa abre, para todos os programas ficarem com o mesmo visual.

   Quem usa: os projetos que o PORTEIRO já liberou no servidor (Shorts, Editor) e por isso não carregam o
   estudio-login.js. O porteiro coloca esta linha sozinho no começo do <head> das páginas deles:

       <script src="/estudio-carregando.js"></script>

   Não confere login nem libera nada (quem decide é o porteiro). A tela some quando a página termina de carregar
   (evento load). O projeto pode segurar a tela até estar pronto de verdade com:
       EstudioCarregando.segurar();   ...   EstudioCarregando.pronto();
   e trocar a mensagem com EstudioCarregando.mensagem('Abrindo as cenas…').
   Se a página tiver o estudio-login.js, este arquivo não faz nada (a tela dele já é esta).

   O visual é o MESMO do estudio-login.js: mudou lá, muda aqui também. */
'use strict';
/* ===================== VERSÃO DO SITE + DIÁRIO DE USO + RELATÓRIO DE SUPORTE (pedido da dona, 06/11/2026) =====================
   UM LUGAR SÓ: este arquivo entra em todas as páginas (programas, menu, login, telas de erro, página 403 do porteiro; o
   /estudio-conta.js carrega ele se faltar). PARA MUDAR A VERSÃO, TROQUE SÓ AQUI (window.EstudioVersao.nome; SÓ O NÚMERO, ex.: 2.0.3 — pedido da dona, 12/11/2026: sem alpha/beta; o nome Celeste fica em apelido): o menu, o perfil,
   as telas de erro e o relatório leem daqui. Não muda sozinha a cada publicação.
   DIÁRIO: cada navegador anota SÓ NELE MESMO (localStorage 'ep-diario', nada vai para a nuvem): programa aberto, versão, erros de
   JavaScript (window.onerror, unhandledrejection, console.error), pedidos à nossa nuvem que falharam (status + rota, sem dados),
   avisos da nuvem (x-nuvem, limite, porta reserva), página que demorou para carregar e as ações principais (botões clicados).
   Ao virar o dia, o que não é erro sai; os erros ficam 7 dias; limite de ~700 linhas / 400 mil letras.
   RELATÓRIO: "Gerar relatório de suporte" (menu da conta, em todos os programas) baixa um .md para OUTRO chat do Claude ler sem contexto:
   o que é o Estúdio, versão, navegador e tela, e o diário com os erros primeiro. E-mail mascarado como na ADM; tokens de login, passes, chaves, senhas e assinaturas de link não entram. */
window.EstudioVersao ||= { nome: '2.4.2', apelido: 'Celeste', em: '13/11/2026',
  /* NOVIDADES (o selo do canto abre este painel; pedido da dona, 10/11/2026). Ao lançar uma versão nova, troque o nome e esta lista. */
  /* VERSÃO ÚNICA (Celeste, 11/11/2026): este nome vale para o Estúdio TODO (todos os programas seguem a mesma numeração). Ao publicar uma versão nova,
     a notificação aparece em qualquer página com Atualizar / Fechar (atualizar é opcional). Ponha  importante: true  aqui quando a versão
     consertar algo sério: a notificação volta a cada abertura até a pessoa atualizar. */
  novidades: [
    ['Animador (2.4)', ['Cenário 3D ao vivo com as cores do Blender (a rua completa abre em 4,7 MB).', 'Personagem preso no cenário 3D: anda e muda de tamanho junto com a câmera (Propriedades › Prender no cenário 3D).', 'Câmera 3D no palco: Alt+arrastar gira, Alt+Shift+arrastar anda, Alt+rodinha aproxima.', 'Cenários 3D da casa: rua completa, rua da escola, quarto e ginásio, no botão de cenário.', 'Soltar um arquivo .blend no Animador converte o cenário pela ponte do Blender (LIGAR-PONTE.bat aberto) e põe no fundo, ao vivo.']],
    ['Animador (2.3)', ['Cenário 3D do Blender no fundo: exporte do Blender como .glb (Arquivo › Exportar › glTF) e solte no Animador, ou use o botão de cenário › Cenário 3D do Blender.', 'Câmera 3D com chaves na timeline (posição, para onde olha e zoom), com o mesmo jeito de chegar das outras chaves.', 'Os personagens 2D ficam na frente; a prévia e o MP4 saem iguais.', 'Cenário novo entra atrás dos personagens na timeline.']],
    ['Correções (2.2.1)', ['Menu: o selo ADM fica alinhado com a versão.']],
    ['Animador e Ateliê (2.2)', ['O Ateliê ganhou o mesmo visual do Animador: painéis encaixados, sem Metro.', 'Sliders, caixinhas, listas e números iguais em todo lugar: trilho fino com preenchimento celeste e o "100%" junto.', 'Exportar no painel lateral do Celeste.', 'Animações novas usam sempre a versão mais nova do personagem no Ateliê; se faltar uma pose usada, o Animador avisa e oferece fixar a versão só naquele projeto.']],
    ['Animador (2.1)', ['Editor com painéis encaixados, no jeito do Blender, e as ferramentas do palco numa barra própria em cima dele.', 'Timeline no jeito do Premiere, maior: trilhas mais altas, código de tempo grande e agulha vermelha.', 'Item novo entra na primeira trilha livre, sem criar trilhas a mais. Compactar trilhas no menu da engrenagem da timeline.', 'O modo Vídeo não pula mais para a Câmera.', 'Animações antigas ganham o botão LEGACY: atualiza para a versão nova e guarda a de antes na nuvem como (LEGACY).', 'Animações novas: cotovelo e joelho travados em todas as vistas, em todos os quadros.']],
    ['Correções (2.1.1)', ['O aviso de versão nova mostra o nome do programa (Animador, Ateliê, Editor…), não o do projeto aberto.']],
    ['Correções (2.0.2)', ['Atualizar nunca é forçado: com Atualizar sozinho desligado aparece só o aviso, com Atualizar e Fechar.', 'O aviso só aparece quando muda o programa que você está usando.', 'Com Atualizar sozinho ligado, um desfoque com o anel e o ícone do programa (sem a tela da montanha).', 'Saíram os últimos restos das Mensagens (Citar em mensagens, Enviar para…).', 'Notificações em Sua conta: as 2 mais novas e Ver mais para o resto.', 'A versão aparece só com o número.', 'ADM no visual novo: carregamento com o anel e textos legíveis no tema claro.', 'Menu: calendário com o dia e o mês claros, clima com a condição e as próximas horas, pasta mais larga e o dock já com nuvem, computador, perfil e ADM.']],
    ['Correções (2.0.1)', ['Carregamento: a nuvem só aparece quando o programa confere ou baixa a versão mais nova na nuvem (Animador e Ateliê ao abrir um projeto); conferência rápida nem mostra a nuvem.', 'Ícone, nuvem e anel sempre no centro; a porcentagem não empurra mais a frase.', 'Foto da conta: a marca de novidade virou um ponto pequeno, sem anel.']],
    ['Visual novo (Celeste)', ['Um visual só em todo o Estúdio, com tema escuro e claro (botão de sol e lua no cabeçalho).', 'Uso da nuvem e do computador no cabeçalho de todos os programas.', 'Menu numa tela só, no jeito do iPad e do Mac: relógio, Calendário, Clima e Meus projetos à esquerda, programas à direita e fixados embaixo.', 'Grade para trocar de programa sem voltar ao menu.', 'Preparativos, Publicações, Cérebro, Animador e Ateliê com o cabeçalho novo.', 'Carregamento único do começo ao fim: o ícone do programa dentro de um anel de progresso, e a nuvem aparece quando baixa da nuvem.']],
    ['Cérebro', ['A Montanha: o Cérebro virou um mapa de pontos em forma de montanha. A rodinha do mouse dá zoom e clicar num ponto explica o que é.', 'Busca que acha o trecho certo dentro das páginas.', 'Adicionar ao Cérebro: gera o pedido pronto para a CelestIA e guarda em Pedidos.', 'Telas do Cérebro no visual novo, sem os blocos coloridos.']],
    ['Atualizações', ['Aviso de versão nova em qualquer página, com Atualizar e Fechar. Atualizar é opcional.', 'Histórico de notificações em Sua conta, com a chave Atualizar sozinho (vem desligada).', 'Preparativos e Publicações ficam guardados no computador e abrem na hora.']],
    ['Animador e Ateliê', ['Juntas com trava: cotovelo e joelho só dobram para o lado certo.', 'Andar sem travar e acessórios com atraso suave.', 'Exportar com o volume certo: o som não estoura mais (pico em −1 dB) e fica no volume dos Shorts e do YouTube (−14 LUFS). Dá para desligar o nivelamento na janela Exportar.']],
    ['Saiu', ['As Mensagens saíram do menu.']]
  ] };
window.ESTUDIO_VERSAO ||= window.EstudioVersao.nome; // nome antigo (compatibilidade)
window.EstudioDiario ||= (() => {
  const K = 'ep-diario', MAX = 700, MAXCH = 400000, DIAS_ERRO = 7;
  // REGRA DA DONA (06/11/2026): entra tudo o que ajuda a resolver (links, rotas, ids, códigos, status, nuvem, porta, versão, horários,
  // nomes e o e-mail MASCARADO como na ADM). Só credenciais não aparecem (token de login, JWT/passe, chave de API, senha, assinatura de link):
  // no lugar fica o que era, para quem ler saber que existia.
  const mascara = e => { const [u, d = ''] = String(e).split('@'); return (u.length <= 2 ? u[0] + '•' : u.slice(0, 2) + '•'.repeat(Math.min(6, Math.max(3, u.length - 2)))) + '@' + d; }; // a mesma da ADM (porteiro)
  // LINK DE DUBLAGEM (Preparativos, página pública): o token no endereço É a senha do link. Sai SEMPRE (endereço, pedidos, erros, qualquer texto).
  const DUB = '[link de dublagem omitido]';
  const semDub = t => t
    .replace(/(x-dub-token["']?\s*[:=]\s*["']?)(?!\[)[A-Za-z0-9_-]+/gi, '$1' + DUB)
    .replace(/([#?&;](?:t|tk|tok|token|dub|link|k)=)(?!\[)[A-Za-z0-9_%-]{8,}/gi, '$1' + DUB)
    .replace(/(\/dublar\/)(?!api\/|index\.html|dublar\.(?:js|css)|#|\?|\[)[A-Za-z0-9_-]{8,}/gi, '$1' + DUB)
    .replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g, DUB);
  const filtra = t => semDub(String(t ?? ''))
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, m => mascara(m)).replace(/•••＠•••|\[e-mail\]/g, '(e-mail, mascarado)')
    .replace(/Bearer\s+(?!\[)[^\s`'")]+/gi, '[token de login omitido]').replace(/eyJ[\w-]{6,}\.[\w-]{6,}(\.[\w-]*)?/g, '[token de login/passe omitido]')
    .replace(/AIza[\w-]{10,}/g, '[chave de API omitida]').replace(/\bsk-[\w-]{16,}/g, '[chave de API omitida]')
    .replace(/((?:senha|password|passwd|secret|segredo)\s*[:=]\s*)(?!\[)[^\s,;&`'"]+/gi, '$1[senha omitida]')
    .replace(/([?&](?:token|access_token|id_token|sig|signature|passe|auth|x-[\w-]*signature|x-amz-signature|x-amz-credential|x-amz-security-token)=)(?!\[)[^&\s`'")]+/gi, '$1[assinatura omitida]');
  const limpa = t => filtra(t).slice(0, 500);
  const prog = () => location.pathname.split('/').filter(Boolean)[0] || 'menu';
  let L = null;
  const le = () => { if (L) return L; try { L = JSON.parse(localStorage.getItem(K) || '[]'); if (!Array.isArray(L)) L = []; } catch { L = []; } return L; };
  let tG = 0;
  const grava = () => { clearTimeout(tG); tG = setTimeout(() => { try { let s = JSON.stringify(L); while (s.length > MAXCH && L.length > 40) { L.splice(0, Math.ceil(L.length / 5)); s = JSON.stringify(L); } localStorage.setItem(K, s); } catch { } }, 500); };
  const poda = () => { const hoje = new Date().toDateString(), lim = Date.now() - DIAS_ERRO * 864e5; L = le().filter(x => x && (x.n === 'erro' ? x.t > lim : new Date(x.t).toDateString() === hoje)).slice(-MAX); grava(); };
  // n = 'erro' | 'aviso' | 'info'; tipo = o que foi; m = a mensagem; x = detalhe (tudo passa pelo limpa)
  function anota(n, tipo, m, x) {
    try { const l = le(), e = { t: Date.now(), n, tipo: String(tipo).slice(0, 40), p: prog(), m: limpa(m) }; if (x != null && x !== '') e.x = limpa(typeof x === 'string' ? x : JSON.stringify(x));
      const u = l[l.length - 1]; if (u && u.tipo === e.tipo && u.m === e.m && u.p === e.p && e.t - (u.t2 || u.t) < 120e3) { u.c = (u.c || 1) + 1; u.t2 = e.t; } else l.push(e);
      if (l.length > MAX) l.splice(0, l.length - MAX); grava(); } catch { }
  }
  poda(); anota('info', 'abriu', location.pathname, 'versão ' + window.EstudioVersao.nome);
  addEventListener('error', e => { const el = e?.target;
    if (el && el !== window && (el.src || el.href)) return anota('aviso', 'arquivo-nao-carregou', (el.tagName || '') + ' ' + String(el.src || el.href).split('?')[0]);
    anota('erro', 'js', e.message, String(e.filename || '').split('?')[0].split('/').slice(-2).join('/') + ':' + e.lineno + ':' + e.colno); }, true);
  addEventListener('unhandledrejection', e => anota('erro', 'promessa', e.reason?.message || String(e.reason), String(e.reason?.stack || '').split('\n').slice(0, 3).join(' | ')));
  const txt = a => a.map(v => v instanceof Error ? v.message : typeof v === 'object' ? (() => { try { return JSON.stringify(v); } catch { return String(v); } })() : String(v)).join(' ');
  const ce = console.error.bind(console), cw = console.warn.bind(console);
  console.error = (...a) => { anota('erro', 'console', txt(a)); ce(...a); };
  console.warn = (...a) => { anota('aviso', 'console-aviso', txt(a)); cw(...a); };
  addEventListener('load', () => setTimeout(() => { try { const nv = performance.getEntriesByType('navigation')[0], ms = Math.round(nv?.loadEventEnd || performance.now());
    anota(ms > 8000 ? 'aviso' : 'info', 'carregou', (ms / 1000).toFixed(1) + ' s' + (ms > 8000 ? ' (demorou)' : '')); } catch { } }, 0));
  // ações principais: o nome do botão/link clicado (rótulo da tela, não o conteúdo de arquivos)
  document.addEventListener('click', e => { const b = e.target?.closest?.('button,a,[role=button],[role=menuitem]'); if (!b) return;
    const partes = []; try { const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const v = n.nodeValue.replace(/\s+/g, ' ').trim(); if (v && !n.parentElement?.closest('svg,style,script')) partes.push(v); } } catch { }
    const r = (partes.join(' · ') || b.getAttribute('aria-label') || b.title || '').replace(/\s+/g, ' ').trim().slice(0, 100); if (r) anota('info', 'clicou', r); }, true);
  // pedido à nossa nuvem (chamado pelo fetch do estudio-conta.js): só a rota, sem o que foi enviado
  const rota = u => { try { const x = new URL(u, location.href); return x.hostname.split('.')[0] + x.pathname.replace(/[A-Za-z0-9_-]{20,}/g, '…'); } catch { return '?'; } };
  const pedido = (u, r, falhou) => { if (falhou) return anota('erro', 'pedido-sem-resposta', rota(u), String(falhou).slice(0, 120));
    if (!r.ok) anota(r.status >= 500 || r.status === 429 ? 'erro' : 'aviso', 'pedido', r.status + ' ' + rota(u));
    const xn = r.headers.get('x-nuvem'); if (xn) anota('aviso', 'nuvem', 'x-nuvem: ' + xn + (r.headers.get('x-nuvem-volta') ? ' (volta ' + r.headers.get('x-nuvem-volta') + ')' : ''), rota(u)); };

  if (/^\/dublar(\/|$)/.test(location.pathname) && window.fetch && !window.EstudioConta) { const f0 = window.fetch.bind(window);
    window.fetch = async function (input, init) { const u = typeof input === 'string' ? input : input?.url || String(input);
      try { const r = await f0(input, init); try { pedido(u, r); } catch { } return r; } catch (e) { try { pedido(u, null, e?.message || 'sem resposta'); } catch { } throw e; } }; }
  /* ---------- o relatório (.md) ---------- */
  const CONTEXTO_PUB = `## O que é o Estúdio Problems (para quem vai ler este relatório sem contexto)
O Estúdio Problems é o site de uma equipe de animação e vídeos (só entra quem tem login liberado). Este relatório foi gerado numa página PÚBLICA ou SEM LOGIN
(por exemplo, o link de dublagem do Preparativos, que qualquer pessoa com o link abre para gravar as falas de um roteiro). Por isso ele só traz o que aconteceu
nesta página e neste navegador: nada da equipe, nenhum e-mail, nenhum token (o próprio link de dublagem é uma senha e nunca entra).
Quem for resolver: o código e as decisões estão no repositório do site (\`CLAUDE.md\`) e no do Preparativos (pasta \`dublar/\`).

**Sobre o diário abaixo:** cada navegador anota só nele mesmo (nada vai para a nuvem). Repetições seguidas viram uma linha com "×N".`;
  const CONTEXTO = `## ANTES DE TUDO, para a IA que ler este relatório
Leia o **Cérebro** (\`/cerebro/\`, a memória compartilhada da equipe e das IAs) antes de responder ou mudar qualquer coisa, e grave nele o que aprender. Vale mesmo que ninguém tenha citado. Como usar: \`cerebro/cerebro.mjs\` do repositório do site. Para entender este arquivo, leia lá \`00 Comece aqui/Como ler relatórios de suporte\`.

## O que é o Estúdio Problems (para quem vai ler este relatório sem contexto)
O Estúdio Problems é o site de uma equipe de animação e vídeos. Tudo fica num endereço só, **https://estudio.problemsraiz.workers.dev**, e só entra quem tem login do Google liberado.

**Programas** (cada um é uma pasta do endereço):
- \`/\` menu (blocos dos programas, Meus projetos, Estúdio, Meus atalhos) e \`/adm\` (ADM: botões, fundo, ícones, quem pode entrar, níveis de acesso, nuvem…)
- \`/cerebro/\` Cérebro (memória da equipe e das IAs), \`/animador/\` Animador (com o Ateliê de personagens e os Cenários), \`/shorts/\` Shorts, \`/editor/\` Editar, \`/modelador/\` Modelador (Blockbench), \`/preparativos/\` Preparativos (roteiro e falas), \`/publicacoes/\` Publicações (YouTube)

**Como funciona por trás:**
- **Porteiro** (Cloudflare Worker \`estudio\`, conta "problemsraiz"): faz o login, guarda a sessão, entrega as páginas e assina o "passe" dos programas. Código: \`porteiro/worker.js\` do repositório do site.
- **turma-ia** (Cloudflare Worker): o servidor de dados da equipe (animações, personagens, preparativos, publicações, menu, níveis de acesso, IA). Código: \`servidor/turma-ia/worker.js\`.
- **Nuvem**: desde 09/11/2026 (por volta das 15:50) tudo fica na conta PRINCIPAL (problemsraiz, D1), no plano pago, com limites por mês e 5 GB. Aos 95% de qualquer item o site pausa (resposta 423, cabeçalho \`x-plano-pausado\`) até um ADM aceitar a cobrança. As outras contas ficam só para emergência; os sons ainda estão no \`sons-problems\`. Avisos \`x-nuvem\` (reserva, terciaria, limite, voltando) antes dessa data são do plano grátis; depois dela merecem investigação.
- **Porta reserva**: o mesmo site em outra conta (\`estudio-reserva.editorcustomizado.workers.dev\`), só para emergência (quando a principal não responde).
- **Login**: Firebase (só o Google). E-mails aparecem mascarados como na ADM; tokens de login, passes, chaves, senhas e assinaturas de link nunca entram (no lugar fica o que era).
- \`/estudio-conta.js\`: o arquivo comum de todos os programas (botão da conta, Mensagens, espaço na nuvem e no computador, calendário, níveis de acesso). \`/estudio-carregando.js\`: tela de carregamento, versão do site, este diário e o relatório.

**Repositórios** (GitHub \`problemsbloxcreate-lab\`; publicar = push na main): \`problemsbloxcreate-lab.github.io\` (o site: menu \`index.html\` = \`404.html\`, \`estudio-conta.js\`, \`porteiro/\`, \`servidor/turma-ia/\`, **\`CLAUDE.md\` com todos os detalhes e decisões**), \`animador\`, \`editor\`, \`estudio-problems\` (Shorts e os Workers de reserva/arquivos), \`modelador\`, \`preparativos\`, \`publicacoes\`.

**Sobre o diário abaixo:** cada navegador anota só nele mesmo (nada vai para a nuvem). "p" = programa onde aconteceu. Repetições seguidas viram uma linha com "×N".`;
  const quando = t => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const linha = e => `- ${quando(e.t)}${e.c ? ` ×${e.c} (até ${quando(e.t2)})` : ''} · **${e.tipo}** · ${e.p} · ${String(e.m || '').replace(/\n/g, ' ')}${e.x ? ` — \`${String(e.x).replace(/`/g, "'")}\`` : ''}`;
  // FILTRO FINAL (pedido da dona): passa no texto inteiro antes de baixar, mesmo que algo tenha escapado das anotações
  // + sem HTML: nenhum < ou > entra cru (mensagens da URL, do servidor ou do Google viram texto)
  const censura = t => filtra(t).replace(/</g, '&lt;').replace(/>/g, '&gt;'); // filtro final no texto inteiro, antes de baixar
  // publico = gerado numa tela SEM login liberado (login do menu, erro do estudio-login.js): sem dados da equipe (o que foi feito, espaço da nuvem)
  async function relatorio(o = {}) { const so = /^\/dublar(\/|$)/.test(location.pathname) ? 'dublar' : null, pub = !!o.publico || !!so; // página de dublagem: sempre pública
    poda(); const l = le().filter(x => !so || x.p === so).sort((a, b) => b.t - a.t), err = l.filter(x => x.n === 'erro'), av = l.filter(x => x.n === 'aviso'), inf = l.filter(x => x.n === 'info');
    let esp = ''; try { const e = await navigator.storage?.estimate?.(); if (e?.quota) esp = `${(e.usage / 1048576).toFixed(1)} MB de ${(e.quota / 1048576).toFixed(0)} MB`; } catch { }
    const lj = k => { try { const v = localStorage.getItem(k); return v == null ? null : v[0] === '{' ? JSON.parse(v) : v; } catch { return null; } }, hm = t => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const mb = b => b >= 1073741824 ? (b / 1073741824).toFixed(1).replace('.', ',') + ' GB' : Math.round(b / 1048576) + ' MB', marcas = [];
    { const v = pub ? null : lj('ep-nuvem-uso'), j = v?.j; if (j?.limite) marcas.push(`- **Espaço da nuvem (última medida guardada):** ${mb(j.total)} de ${mb(j.limite)} (${Math.round(j.total / j.limite * 100)}%) medido às ${hm(j.em || v.t)}${j.nuvem ? ' · medido na nuvem ' + j.nuvem : ''}`); }
    { const v = lj('ep-divide'); if (v && v.ate > Date.now()) marcas.push(`- **Nuvens trabalhando juntas (ep-divide):** ${Math.round((+v.p || 0) * 100)}% dos pedidos de dados deste navegador vão pela outra conta (turma-reserva), até ${hm(v.ate)}`); }
    { const v = lj('estudio-limite-cf'), o = typeof v === 'object' ? v : v ? { t: +v } : null; if (o?.t) marcas.push(`- **Aviso de limite guardado (estudio-limite-cf):** ${o.t > Date.now() ? `vale até ${hm(o.t)} (quando a principal volta)` : 'já venceu'}${o.r ? ' · nuvem em uso: ' + (+o.r >= 2 ? 'terciária' : 'reserva') : ''}`); }
    { let v = null; try { v = sessionStorage.getItem('ep-porta-volta'); } catch { } if (v) marcas.push(`- **Porta reserva:** a principal volta às ${hm(+v)}`); }
    const EL = window.EstudioLimite, nivelN = EL?.marcado?.() > Date.now() ? (EL?.nivel?.() || 0) : 0;
    marcas.unshift(`- **Porta em uso:** ${/estudio-reserva\./.test(location.hostname) ? 'PORTA RESERVA (' + location.hostname + ')' : location.hostname === 'estudio.problemsraiz.workers.dev' ? 'principal (estudio.problemsraiz.workers.dev)' : location.hostname} · **nuvem em uso:** ${nivelN >= 2 ? 'terciária' : nivelN >= 1 ? 'reserva' : 'principal'}`);
    if (pub) marcas.splice(1);
    let fbLogin = '?'; try { const dbs = await indexedDB.databases?.(); if (dbs) fbLogin = dbs.some(d => d.name === 'firebaseLocalStorageDb') ? 'presente' : 'não encontrado'; } catch { }
    let contaOk = 'não'; try { contaOk = sessionStorage.getItem('ep-conta-v1') ? 'sim' : 'não'; } catch { }
    const scr = [...document.scripts].map(s => s.src).filter(s => /estudio-|\/js\//.test(s)).map(s => s.replace(location.origin, '')).slice(0, 12);
    const md = `# Relatório de suporte — Estúdio Problems
Gerado em ${new Date().toLocaleString('pt-BR')} (${Intl.DateTimeFormat().resolvedOptions().timeZone}) pelo botão "Gerar relatório de suporte"${pub ? ' numa tela sem login liberado (sem dados da equipe)' : ''}.

${pub ? CONTEXTO_PUB : CONTEXTO}

## Versão, navegador e tela
- **Versão do site:** ${window.EstudioVersao.nome}
- **Página aberta:** \`${location.pathname}\` (programa: ${prog()}) em \`${location.hostname}\`
- **Navegador:** ${navigator.userAgent}
- **Tela:** ${screen.width}×${screen.height} · janela ${innerWidth}×${innerHeight} · zoom/densidade ${devicePixelRatio}
${pub ? '' : `- **Login:** login do Google neste navegador: ${fbLogin} · conta do Estúdio carregada nesta aba: ${contaOk} (tokens, passes e chaves nunca entram no relatório)\n`}- **Idioma:** ${navigator.language} · **internet agora:** ${navigator.onLine ? 'sim' : 'não'}${navigator.deviceMemory ? ` · **memória:** ~${navigator.deviceMemory} GB` : ''}${esp ? ` · **espaço do site no navegador:** ${esp}` : ''}
- **Arquivos carregados (com a versão):** ${scr.map(s => '`' + limpa(s) + '`').join(', ') || '—'}

**Nuvem e porta (marcas guardadas neste navegador):**
${marcas.join('\n')}

## Erros (${err.length}, mais recentes primeiro; ficam 7 dias)
${err.map(linha).join('\n') || '- Nenhum erro anotado.'}

## Avisos de hoje (${av.length})
${av.map(linha).join('\n') || '- Nenhum.'}

## O que foi feito hoje (${inf.length})
${pub && !so ? '- (não entra: relatório gerado numa tela sem login liberado)' : inf.slice(0, 300).map(linha).join('\n') || '- Nada anotado.'}
`;
    return censura(md);
  }
  async function baixar(o) { const md = await relatorio(o), b = new Blob([md], { type: 'text/markdown;charset=utf-8' }), u = URL.createObjectURL(b), a = document.createElement('a');
    const d = new Date(), z = n => String(n).padStart(2, '0'); a.href = u; a.download = `relatorio-suporte-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.md`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60e3); anota('info', 'relatorio', 'gerou o relatório de suporte'); }
  return { anota, pedido, relatorio, baixar, lista: () => le().slice() };
})();
/* RELATÓRIO DE SUPORTE NAS TELAS (pedido da dona, 06/11/2026): EstudioSuporte.gerar() abre o aviso e baixa o .md (100% local:
   nenhuma rota recebe ou envia relatórios). EstudioSuporte.poe(caixa, { publico }) põe o botão "Gerar relatório de suporte" na caixa
   e o selo da versão no canto; .tira() tira os dois. Só nas telas de erro, bloqueio, login que não deu certo, porta reserva e aviso
   de limite. Elementos com  data-ep-suporte  (ex.: página 403 do porteiro) ganham o botão sozinhos; ="publico" = tela sem login.
   O botão e o selo só geram o arquivo: não abrem nada atrás nem mudam o acesso. Tudo com textContent (nada vira HTML). */
window.EstudioSuporte ||= (() => {
  const DICA = 'Gera um relatório para enviar aos ADMs', DICA_SELO = 'Novidades desta versão (e o relatório de suporte)', postos = new Set(); let css = false, selo = null;
  const estilo = () => { if (css) return; css = true; const st = document.createElement('style');
    st.textContent = `.ep-sup-bt{display:flex;align-items:center;justify-content:center;margin:12px auto 0;height:34px;padding:0 16px;border:1px solid rgba(255,255,255,.22);border-radius:0;background:rgba(255,255,255,.08);color:#f1f2f4;font:500 13px/1 'Segoe UI',system-ui,sans-serif;cursor:pointer}.ep-sup-bt:hover{background:rgba(255,255,255,.16)}
.ep-sup-selo{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:max(12px,env(safe-area-inset-bottom,0px));z-index:2147483647;height:22px;margin:0;padding:0 8px;display:inline-grid;place-items:center;border:1.5px solid rgba(255,255,255,.85);border-radius:0;background:rgba(14,32,58,.35);color:#fff;font:700 11px/1 'Segoe UI',system-ui,sans-serif;letter-spacing:.5px;white-space:nowrap;cursor:pointer}.ep-sup-selo:hover{background:rgba(14,32,58,.6)}
.ep-sup-pg{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.5);display:grid;place-items:center;padding:16px;font:14px/1.45 'Segoe UI',system-ui,-apple-system,sans-serif;color:#e9ebef}.ep-sup-pg *{box-sizing:border-box}
.ep-sup-pg .cx{position:relative;width:min(400px,100%);background:rgba(14,32,58,.96);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.14);box-shadow:0 24px 70px rgba(0,0,0,.6);padding:22px 20px 18px;display:grid;justify-items:center;gap:8px;text-align:center}
.ep-sup-pg .ic{width:46px;height:46px;display:grid;place-items:center;background:rgba(61,139,255,.16);color:#9cc3ff}.ep-sup-pg .ic svg{width:22px;height:22px}
.ep-sup-pg .t{font-size:17px;font-weight:600}.ep-sup-pg .tx{margin:0 0 4px;color:#b9c3d3;font-size:13.5px}
.ep-sup-pg .acts{display:flex;gap:8px;justify-content:flex-end;width:100%;margin-top:6px}
.ep-sup-pg button{height:32px;padding:0 14px;border:1px solid rgba(255,255,255,.16);border-radius:0;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font:inherit;font-size:13px}.ep-sup-pg button:hover{background:rgba(255,255,255,.16)}
.ep-sup-pg button.sim{background:#0a7aff;border-color:#0a7aff;font-weight:600}.ep-sup-pg button.sim:hover{background:#2a8cff}
.ep-sup-pg button.x{position:absolute;top:8px;right:8px;width:30px;height:30px;padding:0;border:0;background:none;color:rgba(255,255,255,.8);font-size:14px}.ep-sup-pg button.x:hover{background:rgba(255,255,255,.14)}
.ep-sup-pg button:focus-visible,.ep-sup-bt:focus-visible,.ep-sup-selo:focus-visible{outline:2px solid #3d8bff;outline-offset:2px}
.ep-nov{position:fixed;inset:0;z-index:2147483646;display:flex;justify-content:flex-end;background:rgba(5,20,45,.35);font:14px/1.45 'Segoe UI',system-ui,sans-serif;color:#fff}
.ep-nov .cx{width:min(520px,100%);height:100%;overflow:auto;box-sizing:border-box;padding:26px 28px 24px;background:rgba(14,32,58,.94);-webkit-backdrop-filter:blur(26px) saturate(1.3);backdrop-filter:blur(26px) saturate(1.3);animation:epNovEntra .45s cubic-bezier(.1,.9,.2,1) both;display:flex;flex-direction:column}
.ep-nov.sai{animation:epNovSome .2s ease both}.ep-nov.sai .cx{animation:epNovSai .2s cubic-bezier(.4,0,1,1) both}
@keyframes epNovEntra{from{transform:translateX(60px);opacity:0}}@keyframes epNovSai{to{transform:translateX(100%)}}@keyframes epNovSome{to{opacity:0}}
.ep-nov .cab{display:flex;align-items:flex-start;gap:16px;margin:0 0 20px}.ep-nov .cab>div{flex:1;min-width:0}
.ep-nov h2{margin:0 0 4px;font:300 30px/1.15 'Segoe UI Light','Segoe UI',system-ui,sans-serif}.ep-nov .cab small{color:rgba(255,255,255,.65);font-size:12.5px}
.ep-nov .fx{display:flex;flex-direction:column;align-items:center;gap:6px;width:62px;padding:2px 0;margin:0;background:none;border:0;color:#fff;cursor:pointer;font:400 11.5px 'Segoe UI',system-ui,sans-serif}
.ep-nov .fx i{display:grid;place-items:center;width:36px;height:36px;box-sizing:border-box;border:2px solid rgba(255,255,255,.8);font-style:normal;font-size:15px}.ep-nov .fx:hover i{background:rgba(255,255,255,.16)}
.ep-nov h3{margin:22px 0 8px;font:400 12px/1.3 'Segoe UI',system-ui,sans-serif;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.8px}.ep-nov h3:first-of-type{margin-top:4px}
.ep-nov ul{list-style:none;margin:0;padding:0}.ep-nov li{position:relative;padding:9px 4px 9px 18px;border-top:1px solid rgba(255,255,255,.08);font-size:13.5px}
.ep-nov li::before{content:'';position:absolute;left:4px;top:16px;width:6px;height:6px;background:#a98bff}
.ep-nov .pe{margin-top:auto;padding-top:22px;border-top:1px solid rgba(255,255,255,.14)}.ep-nov .pe p{margin:12px 0;color:rgba(255,255,255,.65);font-size:12.5px}
.ep-nov .pe button{height:34px;padding:0 14px;border:2px solid rgba(255,255,255,.8);background:none;color:#fff;font:600 13px 'Segoe UI',system-ui,sans-serif;cursor:pointer}.ep-nov .pe button:hover{background:rgba(255,255,255,.16)}
.ep-nov button:focus-visible{outline:2px solid #3d8bff;outline-offset:2px}
@media (prefers-reduced-motion:reduce){.ep-nov .cx,.ep-nov.sai,.ep-nov.sai .cx{animation:none}}
/* ===== CELESTE (11/11/2026, pedido da dona: nada do visual antigo): Novidades = painel da direita, relatório = janela central, selo e botões no padrão ===== */
.ep-nov,.ep-sup-pg,.ep-sup-selo,.ep-sup-bt{--sp-f:"Inter","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;--sp-el:#242428;--sp-f2:#1e1e21;--sp-f3:#28282c;--sp-f4:#333338;--sp-tx:#f5f5f7;--sp-tx2:rgba(235,235,245,.64);--sp-tx3:rgba(235,235,245,.4);--sp-ln:rgba(255,255,255,.09);--sp-ac:#5cc4ff;--sp-act:#04223a;--sp-vidro:rgba(21,21,23,.78)}
html[data-tema="claro"] :is(.ep-nov,.ep-sup-pg,.ep-sup-selo,.ep-sup-bt){--sp-el:#fff;--sp-f2:#fff;--sp-f3:#ececf0;--sp-f4:#e1e1e6;--sp-tx:#1d1d1f;--sp-tx2:rgba(60,60,67,.72);--sp-tx3:rgba(60,60,67,.46);--sp-ln:rgba(0,0,0,.08);--sp-ac:#0a74c9;--sp-act:#fff;--sp-vidro:rgba(245,245,247,.8)}
:root:root .ep-nov{background:rgba(0,0,0,.45)!important;color:var(--sp-tx)!important;font:400 14px/1.5 var(--sp-f)!important}
:root:root .ep-nov .cx{width:min(460px,100%)!important;padding:0 24px 24px!important;background:var(--sp-el)!important;border-left:1px solid var(--sp-ln);border-radius:0!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;box-shadow:0 0 0 .5px rgba(0,0,0,.6),0 24px 70px rgba(0,0,0,.55)!important;animation:epCelNov .25s cubic-bezier(.1,.9,.2,1) both!important}
@keyframes epCelNov{from{opacity:0;transform:translateX(24px)}}
:root:root .ep-nov .cab{align-items:center!important;height:52px;margin:0 -24px 16px!important;padding:0 12px 0 24px;border-bottom:1px solid var(--sp-ln)}
:root:root .ep-nov h2{font:600 17px/1.2 var(--sp-f)!important;margin:0!important;color:var(--sp-tx)}
:root:root .ep-nov .cab small{color:var(--sp-tx3)!important;font-size:12px!important}
:root:root .ep-nov .fx{width:32px!important;height:32px!important;padding:0!important;border-radius:50%!important;font-size:0!important;color:var(--sp-tx2)!important;display:grid!important;place-items:center}
:root:root .ep-nov .fx i{width:auto!important;height:auto!important;border:0!important;font-size:15px!important;background:none!important}
:root:root .ep-nov .fx:hover{background:var(--sp-f3)!important}
:root:root .ep-nov h3{font:600 13px/1.3 var(--sp-f)!important;color:var(--sp-tx2)!important;text-transform:none!important;letter-spacing:0!important;margin:20px 0 8px!important}
:root:root .ep-nov ul{margin:0;padding:12px 14px 12px 30px;background:var(--sp-f2);border-radius:12px;color:var(--sp-tx);font-size:14px}
html[data-tema="claro"] :root:root .ep-nov ul{background:#f5f5f7}
:root:root .ep-nov li{margin:4px 0}
:root:root .ep-nov .pe{margin-top:24px;padding-top:16px;border-top:1px solid var(--sp-ln);color:var(--sp-tx3)}
:root:root .ep-nov .pe p{color:var(--sp-tx3)!important;font-size:13px!important}
:root:root .ep-nov .pe button,:root:root .ep-sup-bt{height:32px!important;padding:0 12px!important;border:0!important;border-radius:8px!important;background:var(--sp-f3)!important;color:var(--sp-tx)!important;font:500 13px var(--sp-f)!important;cursor:pointer}
:root:root .ep-nov .pe button:hover,:root:root .ep-sup-bt:hover{background:var(--sp-f4)!important}
:root:root .ep-sup-pg{background:rgba(0,0,0,.45)!important;color:var(--sp-tx)!important;font:400 14px/1.45 var(--sp-f)!important}
:root:root .ep-sup-pg .cx{background:var(--sp-el)!important;border:0!important;border-radius:14px!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;box-shadow:0 0 0 .5px rgba(0,0,0,.6),0 24px 70px rgba(0,0,0,.55)!important;padding:24px!important;color:var(--sp-tx)!important}
:root:root .ep-sup-pg .ic{border-radius:12px!important;background:rgba(92,196,255,.16)!important;color:var(--sp-ac)!important}
:root:root .ep-sup-pg .t{font:600 17px var(--sp-f)!important}
:root:root .ep-sup-pg .tx{color:var(--sp-tx2)!important}
:root:root .ep-sup-pg button{border:0!important;border-radius:8px!important;background:var(--sp-f3)!important;color:var(--sp-tx)!important;font:500 13px var(--sp-f)!important}
:root:root .ep-sup-pg button:hover{background:var(--sp-f4)!important}
:root:root .ep-sup-pg button.sim{background:var(--sp-ac)!important;color:var(--sp-act)!important;font-weight:600!important}
:root:root .ep-sup-pg button.x{border-radius:50%!important;background:transparent!important;color:var(--sp-tx2)!important}
:root:root .ep-sup-selo{border:1px solid var(--sp-ln)!important;border-radius:6px!important;background:var(--sp-vidro)!important;color:var(--sp-tx2)!important;font:500 11px var(--sp-f)!important;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
:root:root .ep-sup-selo:hover{color:var(--sp-tx)!important}
`;
    (document.head || document.documentElement).appendChild(st); };
  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>';
  // o MESMO aviso de antes (menu da conta e selo do menu); fica no <html> para aparecer até por cima das telas de carregamento/erro
  const janela = () => new Promise(fim => { estilo();
    const L = window.EstudioDiario?.lista?.() || [], f = t => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const periodo = L.length ? `Tem o que aconteceu de ${f(Math.min(...L.map(x => x.t)))} até agora (${f(Date.now())}).` : 'Ainda não há nada anotado neste navegador.';
    const d = document.createElement('div'); d.className = 'ep-sup-pg'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Gerar relatório de suporte?');
    d.innerHTML = `<div class="cx"><button type="button" class="x" data-n title="Fechar (Esc)" aria-label="Fechar">✕</button><div class="ic">${IC}</div><div class="t">Gerar relatório de suporte?</div><p class="tx"></p><div class="acts"><button type="button" data-n>Cancelar</button><button type="button" class="sim" data-s>Entendi, gerar</button></div></div>`;
    d.querySelector('.tx').textContent = 'Não mande este arquivo para qualquer pessoa, só para quem vai resolver o problema. ' + periodo;
    const tecla = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); sai(false); } };
    const sai = v => { removeEventListener('keydown', tecla, true); d.remove(); fim(v); };
    addEventListener('keydown', tecla, true); d.querySelectorAll('[data-n]').forEach(x => x.onclick = () => sai(false)); d.querySelector('[data-s]').onclick = () => sai(true); d.onclick = e => { if (e.target === d) sai(false); };
    document.documentElement.appendChild(d); try { d.querySelector('[data-s]').focus(); } catch { } });
  async function gerar(o = {}) { if (S.aberto) return; S.aberto = true; try { if (await janela()) await window.EstudioDiario?.baixar({ publico: !!o.publico }); } finally { S.aberto = false; } }
  /* NOVIDADES (10/11/2026): o selo abre um painel lateral igual ao da nuvem, com a lista da versão e o botão do relatório de suporte */
  function novidades(o) { if (document.querySelector('.ep-nov')) return; estilo();
    const V = window.EstudioVersao || {}, esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const d = document.createElement('div'); d.className = 'ep-nov'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Novidades');
    d.innerHTML = `<div class="cx"><div class="cab"><div><h2>Novidades</h2><small>Versão ${esc(V.nome || '')}${V.em ? ' · ' + esc(V.em) : ''}</small></div><button type="button" class="fx" data-x title="Fechar (Esc)"><i>✕</i>Fechar</button></div>
      ${(V.novidades || []).map(([t, L]) => `<h3>${esc(t)}</h3><ul>${L.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`).join('') || '<p>Nada novo anotado nesta versão.</p>'}
      <div class="pe"><p>Algo deu errado? Gere o relatório de suporte e mande só para quem vai resolver.</p><button type="button" data-r>Gerar relatório de suporte</button></div></div>`;
    const tecla = e => { if (e.key === 'Escape' && !document.querySelector('.ep-sup-pg')) { e.stopPropagation(); fecha(); } };
    const fecha = () => { removeEventListener('keydown', tecla, true); d.classList.add('sai'); setTimeout(() => d.remove(), 200); };
    addEventListener('keydown', tecla, true); d.onclick = e => { if (e.target === d) fecha(); }; d.querySelector('[data-x]').onclick = fecha;
    d.querySelector('[data-r]').onclick = () => { fecha(); gerar(o); };
    document.documentElement.appendChild(d); try { d.querySelector('[data-x]').focus(); } catch { } }
  function poeSelo(o) { if (selo?.isConnected) return; selo = document.createElement('button'); selo.type = 'button'; selo.className = 'ep-sup-selo'; selo.textContent = window.EstudioVersao?.nome || ''; selo.title = DICA_SELO;
    selo.onclick = () => novidades(o); document.documentElement.appendChild(selo); }
  function poe(c, o = {}) { if (!c) return; estilo();
    if (!c.querySelector('.ep-sup-bt')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'ep-sup-bt'; b.textContent = 'Gerar relatório de suporte'; b.title = DICA;
      b.onclick = e => { e.preventDefault(); e.stopPropagation(); gerar(o); }; c.appendChild(b); postos.add(b); }
    if (o.selo !== false) poeSelo(o); }
  function tira() { postos.forEach(b => b.remove()); postos.clear(); selo?.remove(); selo = null; }
  const auto = () => document.querySelectorAll('[data-ep-suporte]').forEach(c => poe(c, { publico: c.getAttribute('data-ep-suporte') === 'publico' }));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true }); else auto();
  const S = { gerar, novidades, poe, tira, aberto: false, DICA }; return S;
})();

/* ---------- motor do progresso (porcentagem + o que está carregando) ----------
   Conta o que a página baixa enquanto a tela de carregamento está na frente: arquivos da página (scripts, estilos,
   imagens), fetch e XHR. Mostra em qualquer tela que tenha [data-ep-pct], [data-ep-arq] e [data-ep-barra].
   EstudioProgresso.esperarTudo(ms) = espera tudo baixar (imagens inclusive), no máximo ms; as telas usam antes de sumir.
   Quem tem tela própria (menu, Animador, login) carrega este arquivo com  data-so-progresso  (só o motor, sem a tela). */
(() => {
  if (window.EstudioProgresso || window.top !== window) return;
  const IGNORA = /\/(presenca|mensagens|sessao)(\/|\?|$)|^(data|blob|about|chrome-extension):/i;
  const feitos = new Set(), pend = new Map(), pendEls = new Set(), vistos = new WeakSet(); let ativo = true, ultimo = '', etapa = '', mostrado = 0, alvo = 0, nId = 0, imgsTotal = 0, imgsOk = 0;
  const abs = u => { try { return new URL(u, location.href).href.split('#')[0]; } catch { return String(u || ''); } };
  const NOMES_ARQ = [[/^\/pessoa(\/|$)/, 'nomes e fotos da equipe'], [/^\/conta(\/|$)/, 'a sua conta'], [/^\/personagens/, 'a biblioteca de personagens'], [/^\/nuvem-uso/, 'o espaço na nuvem'], [/^\/cenarios/, 'os cenários da equipe'], [/^\/menu/, 'o menu']];
  const curto = u => { try { const x = new URL(u, location.href); if (/(^|.)(turma-ia|sons-problems|estudio-reserva)./i.test(x.hostname)) return 'da nuvem'; if (x.origin === location.origin) { const n = NOMES_ARQ.find(([re]) => re.test(x.pathname)); if (n) return n[1]; } let p = decodeURIComponent(x.pathname.split('/').filter(Boolean).slice(-2).join('/')) || x.hostname; if (x.hostname !== location.hostname && !/\./.test(p)) p = x.hostname; return p.length > 44 ? '…' + p.slice(-42) : p; } catch { return ''; } };
  const muda = () => { if (ativo) agenda(); };
  /* A NUVEM NO CARREGAMENTO (pedido da dona, 12/11/2026): a nuvem aparece SÓ quando o programa de fato vai à nuvem conferir ou
     baixar a última versão dos dados (ex.: Animador e Ateliê ao abrir um projeto ou personagem), nunca em "Abrindo o menu…", nos
     arquivos do próprio programa nem quando a cópia local já está em dia. Quem sincroniza avisa: EstudioProgresso.sincroniza(promessa, texto).
     Se a conferência acabar em menos de 0,3 s, a nuvem nem aparece (nada de piscar); quando acaba, volta a logo, suave.
     NADA TORTO: a nuvem é uma camada própria (não é o svg da logo, então as regras da logo não a encolhem nem a fazem pulsar),
     num quadro de tamanho fixo e pixels inteiros, centrada pelo DESENHO no centro do anel; só as bolinhas giram. */
  let naNuvem = false, nvN = 0;
  const NV_SVG = '<svg class="ep-nv-s" viewBox="0 0 132 92" aria-hidden="true"><path d="M34 82 H100 A26 26 0 0 0 104 30.4 A34 34 0 0 0 40.6 22 A30 30 0 0 0 34 82 Z"/></svg><span class="ep-nv-d"><i></i><i></i><i></i><i></i><i></i></span>';
  const NV_CSS = "\n#estudio-porta{--nv-c:var(--pt-tx,#f5f5f7)}.login{--nv-c:var(--anel-c,#f5f5f7)}\nhtml body :is(#estudio-porta .ep-lg,.login .lcard .logo)>.ep-nv{position:absolute!important;left:50%!important;top:50%!important;width:78px!important;height:54px!important;margin:-25px 0 0 -39px!important;padding:0!important;z-index:2;pointer-events:none;opacity:0;transform:translateY(7px);transform-origin:50% 50%;transition:opacity .38s cubic-bezier(.2,.7,.2,1),transform .38s cubic-bezier(.2,.7,.2,1);animation:none!important}\nhtml body :is(#estudio-porta,.login).ep-nuvem :is(.ep-lg,.lcard .logo)>.ep-nv.on{opacity:1;transform:none}\nhtml body :is(#estudio-porta .ep-lg,.login .lcard .logo)>.ep-nv>svg.ep-nv-s{position:absolute!important;inset:0!important;display:block!important;width:78px!important;height:54px!important;margin:0!important;overflow:visible;box-shadow:none!important;animation:none!important;transform:none!important;border-radius:0!important;background:none!important}\nhtml body :is(#estudio-porta .ep-lg,.login .lcard .logo)>.ep-nv path{fill:none;stroke:var(--nv-c);stroke-width:4.2;stroke-linejoin:round}\n.ep-nv-d{position:absolute;left:28px;top:21px;width:22px;height:22px}.ep-nv-d i{position:absolute;inset:0;transform-origin:50% 50%;animation:epNvGira 2.2s infinite}\n.ep-nv-d i::after{content:'';position:absolute;left:9px;top:0;width:4px;height:4px;border-radius:50%;background:var(--nv-c)}\n.ep-nv-d i:nth-child(2){animation-delay:.12s}.ep-nv-d i:nth-child(3){animation-delay:.24s}.ep-nv-d i:nth-child(4){animation-delay:.36s}.ep-nv-d i:nth-child(5){animation-delay:.48s}\n@keyframes epNvGira{0%{transform:rotate(225deg);opacity:1;animation-timing-function:ease-out}7%{transform:rotate(345deg);animation-timing-function:linear}30%{transform:rotate(455deg);animation-timing-function:ease-in-out}39%{transform:rotate(690deg);animation-timing-function:linear}70%{transform:rotate(815deg);opacity:1;animation-timing-function:ease-out}75%{transform:rotate(945deg);animation-timing-function:ease-out}76%{transform:rotate(945deg);opacity:0}100%{transform:rotate(945deg);opacity:0}}\n:is(#estudio-porta .ep-lg,.login .lcard .logo)>:not(.ep-nv){transition:opacity .32s ease}\n:is(#estudio-porta,.login).ep-nuvem :is(.ep-lg,.lcard .logo)>:not(.ep-nv){opacity:0!important}\n@media (prefers-reduced-motion:reduce){html body :is(#estudio-porta .ep-lg,.login .lcard .logo)>.ep-nv{transform:none!important;transition:opacity .35s ease!important}.ep-nv-d i{animation:none!important}}";
  const pintaNuvem = () => {
    const telas = document.querySelectorAll('#estudio-porta .ep-lg, .login .lcard .logo'); if (!telas.length) return;
    if (naNuvem && !document.getElementById('ep-nv-css')) { const s = document.createElement('style'); s.id = 'ep-nv-css'; s.textContent = NV_CSS; (document.head || document.documentElement).appendChild(s); }
    telas.forEach(lg => {
      const raiz = lg.closest('#estudio-porta, .login'); if (!raiz) return; let nv = lg.querySelector(':scope>.ep-nv');
      if (!naNuvem || raiz.classList.contains('ep-erro') || raiz.hidden) { raiz.classList.remove('ep-nuvem'); if (nv) { nv.classList.remove('on'); nv._liga = 0; } return; } // volta a logo, suave
      if (!nv) { nv = document.createElement('span'); nv.className = 'ep-nv'; nv.innerHTML = NV_SVG; lg.appendChild(nv); }
      raiz.classList.add('ep-nuvem'); if (!nv.classList.contains('on') && !nv._liga) { nv._liga = 1; requestAnimationFrame(() => requestAnimationFrame(() => { if (naNuvem) nv.classList.add('on'); })); }
    });
  };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) { if (IGNORA.test(e.name)) continue; feitos.add(abs(e.name)); if (!ultimo || pend.size === 0) ultimo = curto(e.name); } muda(); }).observe({ type: 'resource', buffered: true }); } catch { }
  const comeca = u => { if (!ativo || IGNORA.test(u)) return null; const id = ++nId; pend.set(id, u); ultimo = curto(u); muda(); return id; };
  const acaba = id => { if (id == null) return; const u = pend.get(id); pend.delete(id); if (u) feitos.add(abs(u)); muda(); };
  const f0 = window.fetch;
  if (f0) window.fetch = function (i, o) { let u = ''; try { u = abs(typeof i === 'string' ? i : i?.url || String(i)); } catch { } const id = o?.epFundo ? null : comeca(u); const p = f0.apply(this, arguments); if (id != null) p.then(() => acaba(id), () => acaba(id)); return p; };
  try { const X = XMLHttpRequest.prototype, op = X.open, se = X.send;
    X.open = function (m, u) { this.__epU = abs(u); return op.apply(this, arguments); };
    X.send = function () { const id = comeca(this.__epU || ''); if (id != null) this.addEventListener('loadend', () => acaba(id), { once: true }); return se.apply(this, arguments); }; } catch { }
  // elementos que baixam algo: scripts, estilos e imagens (os de "lazy" só baixam quando aparecem: não esperam)
  const olha = el => {
    if (!ativo || !el || el.nodeType !== 1) return;
    const t = el.tagName, u = t === 'IMG' ? (el.currentSrc || el.src) : t === 'SCRIPT' ? el.src : t === 'LINK' && /stylesheet/i.test(el.rel) ? el.href : '';
    if (!u || IGNORA.test(u) || vistos.has(el)) return; vistos.add(el);
    if (t === 'IMG') { if (el.loading === 'lazy') return; imgsTotal++; if (el.complete) { imgsOk++; return; } }
    else if (feitos.has(abs(u))) return;
    pendEls.add(el); ultimo = curto(u);
    const fim = () => { if (pendEls.delete(el)) { if (t === 'IMG') imgsOk++; feitos.add(abs(u)); muda(); } };
    el.addEventListener('load', fim, { once: true }); el.addEventListener('error', fim, { once: true });
    if (t !== 'IMG') setTimeout(fim, 20000); // segurança
  };
  const mo = new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; olha(n); if (n.querySelectorAll) n.querySelectorAll('img,script[src],link[rel~="stylesheet"]').forEach(olha); } muda(); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  document.querySelectorAll('img').forEach(olha);
  const restante = () => { for (const el of pendEls) { if (!el.isConnected) pendEls.delete(el); else if (el.tagName === 'IMG' && el.complete) { pendEls.delete(el); imgsOk++; } } return pend.size + pendEls.size; };
  const calcula = () => {
    const falta = restante(), tot = feitos.size + falta, raw = tot ? feitos.size / tot : 0;
    const cap = document.readyState === 'loading' ? 72 : document.readyState === 'interactive' ? 90 : 98;
    alvo = Math.max(alvo, Math.min(cap - 14, 4 + raw * (cap - 18))); // deixa folga para continuar andando
    alvo = Math.max(alvo, Math.min(cap - 2, 80 * (1 - Math.exp(-performance.now() / 1800)))); // anda com o tempo também: não fica parada em 0% (05/11/2026)
    // nunca fica parado: enquanto falta algo, vai andando devagarinho (cada vez mais devagar) sem passar do teto da fase
    const teto = falta || document.readyState !== 'complete' ? cap - 1 : cap;
    if (alvo < teto) alvo = Math.min(teto, alvo + (teto - alvo) * .0025 + .012);
  };
  const texto = () => {
    if (etapa) return etapa;
    const imgsF = [...pendEls].filter(e => e.tagName === 'IMG').length;
    const tar = [...pend.values()].filter(v => v.startsWith('\u0001')); if (tar.length) return tar[tar.length - 1].slice(1) + (tar.length > 1 ? ` (+${tar.length - 1})` : '');
    if (pend.size) return 'Baixando ' + curto([...pend.values()].pop());
    if (imgsF) return `Carregando imagens (${imgsOk} de ${imgsOk + imgsF})`;
    if (pendEls.size) return 'Carregando ' + curto([...pendEls].pop().src || [...pendEls].pop().href || '');
    return ultimo ? 'Pronto: ' + ultimo : 'Abrindo…';
  };
  const pinta = () => {
    const t = texto();
    document.querySelectorAll('[data-ep-pct]').forEach(e => e.textContent = Math.round(mostrado) + '%');
    document.querySelectorAll('[data-ep-arq]').forEach(e => { if (e.textContent !== t) e.textContent = t; });
    document.querySelectorAll('[data-ep-barra]').forEach(e => e.style.width = mostrado.toFixed(1) + '%');
    document.querySelectorAll('#estudio-porta, .login, #turma-login').forEach(e => e.style.setProperty('--ep-p', mostrado.toFixed(1))); // anel do carregamento
    pintaNuvem(); // a nuvem também na tela que nasceu depois
  };
  let rodando = false;
  let semTela = 0;
  const passo = () => { if (document.readyState === 'complete' && !document.querySelector('[data-ep-pct]')) { if (++semTela > 90) { ativo = false; mo.disconnect(); rodando = false; return; } } else semTela = 0; // nenhuma tela mostrando: para de contar
    calcula(); mostrado += Math.max(.4, (alvo - mostrado) * .18); if (mostrado > alvo) mostrado = alvo; pinta(); if (ativo && mostrado < 100) requestAnimationFrame(passo); else rodando = false; };
  const agenda = () => { if (!rodando) { rodando = true; requestAnimationFrame(passo); } };
  agenda(); document.addEventListener('readystatechange', muda);
  let esperando = null;
  window.EstudioProgresso = {
    get pct() { return Math.round(mostrado); }, get texto() { return texto(); },
    etapa(t) { etapa = String(t || ''); muda(); },
    // SINCRONIZAR COM A NUVEM: envolva a chamada real que confere/baixa a última versão; a nuvem só aparece se passar de 0,3 s
    sincroniza(p, txt) { if (!p?.then) return p; nvN++; let feito = false; const fim = () => { if (feito) return; feito = true; nvN = Math.max(0, nvN - 1); if (!nvN && naNuvem) { naNuvem = false; pintaNuvem(); } };
      setTimeout(() => { if (!feito && nvN > 0 && !naNuvem) { naNuvem = true; pintaNuvem(); } }, 300); p.then(fim, fim); setTimeout(fim, 60000);
      return this.tarefa(p, txt || 'Conferindo a versão mais nova na nuvem…'); },
    // a tela de carregamento também espera esta tarefa (ex.: nomes e fotos da equipe) e mostra o texto dela
    tarefa(p, txt, ms) { if (!ativo || !p?.then) return p; const id = ++nId; pend.set(id, '\u0001' + String(txt || 'Preparando…')); muda(); const fim = () => { if (pend.delete(id)) feitos.add('tarefa:' + id); muda(); }; p.then(fim, fim); setTimeout(fim, ms || 15000); return p; },
    // espera os arquivos e imagens que a página ainda está baixando (no máximo ms); termina em 100%
    esperarTudo(ms = 12000) {
      if (!ativo) { ativo = true; mo.observe(document.documentElement, { childList: true, subtree: true }); document.querySelectorAll('img,script[src],link[rel~="stylesheet"]').forEach(olha); alvo = Math.min(alvo, 90); mostrado = Math.min(mostrado, 90); agenda(); } // tela que volta (ex.: menu depois do login)
      return esperando || (esperando = new Promise(ok => {
        const ini = Date.now(); let quieto = 0;
        // FECHA EM 100% (pedido da dona, 05/11/2026): antes pulava de onde estava (às vezes 0%) para sumir na hora. Agora a barra corre
        // até 100% em ~0,4 s e só então a tela sai (mesmo que seja só para fazer sentido aos olhos)
        const fim = () => { clearInterval(t); alvo = 100; const de = mostrado, t0 = performance.now(); let foi = false;
          const acaba = () => { if (foi) return; foi = true; mostrado = 100; pinta(); etapa = ''; esperando = null; setTimeout(() => { if (!esperando) { ativo = false; mo.disconnect(); } }, 500); setTimeout(ok, 90); };
          const anda = () => { if (foi) return; const k = Math.min(1, (performance.now() - t0) / 400); mostrado = de + (100 - de) * (1 - (1 - k) * (1 - k)); pinta(); if (k < 1) requestAnimationFrame(anda); else acaba(); };
          if (de >= 99) acaba(); else { anda(); setTimeout(acaba, 700); } }; // aba escondida (sem desenho): termina pelo relógio
        const t = setInterval(() => { calcula(); muda();
          const livre = document.readyState === 'complete' && restante() === 0;
          quieto = livre ? quieto + 100 : 0; if (quieto >= 300 || Date.now() - ini > ms) fim(); }, 100);
      }));
    },
  };
})();

(() => {
  if (document.currentScript?.hasAttribute('data-so-progresso')) return; // a página tem tela própria: só o motor acima
  if (window.EstudioCarregando || window.EstudioLogin || window.top !== window) return; // já tem tela, ou está dentro de um quadro
  const NOME_PROG = ((p => [['/animador/', 'ANIMADOR'], ['/editor/', 'EDITOR'], ['/modelador/blockbench', 'BLOCKBENCH'], ['/modelador/', 'MODELADOR'], ['/shorts/', 'SHORTS']].find(([k]) => p.startsWith(k))?.[1] || 'ESTÚDIO PROBLEMS')(location.pathname));
  const root = document.documentElement, inicio = performance.now();
  // CELESTE: título da tela única em linguagem simples ("Abrindo o Animador"), igual na saída do menu
  const TITULO = (p => { const L = [['/animador/', 'o Animador'], ['/editor/', 'o Editor'], ['/modelador/blockbench', 'o Blockbench'], ['/modelador/', 'o Modelador'], ['/shorts/', 'os Shorts'], ['/publicacoes/', 'as Publicações'], ['/preparativos/', 'o Preparativos'], ['/cerebro/', 'o Cérebro'], ['/musicas/', 'as Músicas'], ['/jester/', 'o Jester Dreams']].find(([k]) => p.startsWith(k)); return L ? 'Abrindo ' + L[1] : 'Abrindo o Estúdio'; })(location.pathname);

  // logo da tela de carregamento = o ícone do próprio programa (o mesmo da aba e do cabeçalho); sem programa, o do menu
  const LOGO_PROG = { ANIMADOR: '/animador/icones/simbolo.svg', EDITOR: '/editor/icone.svg', MODELADOR: '/modelador/icone.svg', SHORTS: '/shorts/icone-shorts-180.png', BLOCKBENCH: '/modelador/icone.svg' }[NOME_PROG] || '';
  const LOGO_EP = window.EstudioIcones?.atual?.() ? window.EstudioIcones.url(window.EstudioIcones.atual()) : ''; // ícone novo do programa (Sh, Ed, An, Md; ADM › Ícones)
  const logoHtml = () => ((LOGO_EP || LOGO_PROG) ? '<img class="ep-img" alt=""' + (LOGO_EP ? ' data-estudio-icone-img="' + window.EstudioIcones.atual() + '"' : '') + ' src="' + (LOGO_EP || LOGO_PROG) + '" onerror="this.parentNode.classList.remove(\'ep-prog\');this.remove()">' : '') + '<svg viewBox="0 0 64 64" class="ep-cam" width="84" height="84"><defs><linearGradient id="epclq-carr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5cc4ff"/><stop offset="1" stop-color="#6b5cff"/></linearGradient></defs><rect width="64" height="64" rx="14.5" fill="url(#epclq-carr)"/><g fill="none" stroke="#fff" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"><rect x="15" y="27" width="34" height="22" rx="3"/><path d="M15 27l3-9 31 0-3 9"/><path d="M24 18l-2.5 9M33 18l-2.5 9M42 18l-2.5 9"/></g><path d="M29 33v10l8-5z" fill="#fff"/></svg>';
  const st = document.createElement('style');
  st.textContent = `#estudio-porta{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:radial-gradient(1100px 700px at 50% 35%,#1d2030,#111216 70%);font:14px/1.5 'Segoe UI',system-ui,-apple-system,sans-serif;color:#e9ebef;padding:16px;-webkit-user-select:none;user-select:none;transition:opacity .35s ease}
#estudio-porta.ep-saindo{opacity:0;pointer-events:none}
#estudio-porta .ep-c{width:min(380px,100%);text-align:center;display:grid;justify-items:center;gap:4px;animation:epEntra .16s ease-out both}
#estudio-porta .ep-lg{width:68px;height:68px;border-radius:20px;display:grid;place-items:center;background:linear-gradient(135deg,#3d8bff,#19d3f0);box-shadow:0 14px 40px rgba(61,139,255,.35);margin-bottom:12px;animation:epPulso 1.6s ease-in-out infinite}
#estudio-porta .ep-nm{font:800 26px/1.05 'Segoe UI',system-ui,sans-serif;letter-spacing:1.5px}
#estudio-porta .ep-sb{color:#9aa0ab;font-size:12.5px;letter-spacing:.4px}
#estudio-porta .ep-br{width:180px;height:4px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden;margin:18px 0 8px;position:relative}
#estudio-porta .ep-br>i{position:absolute;top:0;bottom:0;left:0;width:0;border-radius:4px;background:linear-gradient(90deg,#3d8bff,#19d3f0);transition:width .2s linear}
#estudio-porta .ep-br::after{content:'';position:absolute;top:0;bottom:0;left:0;width:30%;border-radius:4px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);animation:epBarra 1.3s ease-in-out infinite}
#estudio-porta .ep-pc{display:flex;gap:8px;justify-content:center;align-items:baseline;font-size:11.5px;color:#8d929c;min-height:17px;max-width:340px;margin:-4px 0 4px}#estudio-porta .ep-pc b{color:#cfd3da;font-weight:700;font-variant-numeric:tabular-nums;min-width:34px;text-align:right}#estudio-porta .ep-pc span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;text-align:left}
#estudio-porta .ep-m{color:#b9bdc6;font-size:13px;min-height:20px;max-width:340px}
#estudio-porta .ep-lg.ep-prog{background:none;box-shadow:0 14px 40px rgba(0,0,0,.45)}#estudio-porta .ep-lg .ep-img{width:68px;height:68px;display:block;image-rendering:pixelated}#estudio-porta .ep-lg.ep-prog .ep-cam,#estudio-porta .ep-lg:not(.ep-prog) .ep-img,#estudio-porta.ep-erro .ep-lg .ep-img{display:none}#estudio-porta.ep-erro .ep-lg .ep-cam{display:block}
@keyframes epBarra{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}@keyframes epPulso{50%{transform:scale(1.05)}}@keyframes epEntra{from{opacity:0}}
@media (prefers-reduced-motion:reduce){#estudio-porta .ep-lg,#estudio-porta .ep-br::after,#estudio-porta .ep-c{animation:none}#estudio-porta{transition:none}}
/* estilo da inicialização do macOS (decisão do dono, 02/11/2026): fundo preto, só o ícone, barra fina e embaixo a % com o que está carregando */
#estudio-porta{background:#000}#estudio-porta .ep-c{gap:0}
#estudio-porta .ep-lg,#estudio-porta .ep-lg.ep-prog,#estudio-porta.ep-erro .ep-lg{width:84px;height:84px;border-radius:0;background:none;box-shadow:none;animation:none;margin:0}#estudio-porta .ep-lg .ep-img{width:84px;height:84px}
#estudio-porta .ep-nm,#estudio-porta .ep-sb{display:none}#estudio-porta .ep-jd-selo{margin-top:14px}
#estudio-porta .ep-br{width:200px;height:5px;border-radius:3px;background:rgba(255,255,255,.16);margin:46px 0 12px}#estudio-porta .ep-br::after{display:none}#estudio-porta .ep-br>i{background:#e8e9ec;border-radius:3px;transition:width .35s ease}
#estudio-porta .ep-pc{font-size:11.5px;color:#7d8089;margin:0}#estudio-porta .ep-pc b{color:#c3c6cc}
#estudio-porta:not(.ep-erro) .ep-m{display:none}#estudio-porta.ep-erro .ep-br,#estudio-porta.ep-erro .ep-pc{display:none}#estudio-porta.ep-erro .ep-m{color:#ff8a9a}#estudio-porta.ep-erro .ep-m a{display:inline-block;color:#f1f2f4;text-decoration:none}
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
#estudio-porta.m2 .ep-pc b{display:inline-block!important;min-width:3.4em!important;text-align:right!important;font-variant-numeric:tabular-nums!important;white-space:nowrap} /* % com largura fixa: 9%, 97% e 100% não empurram a frase (pedido da dona, 12/11/2026) */
#estudio-porta.m2 .ep-c{column-gap:5px!important} /* número e frase juntos, sem vão grande */
#estudio-porta.m2 .ep-m,#estudio-porta.m2:not(.ep-erro) .ep-m{display:block!important;justify-self:start;margin:0!important;font:400 13.5px "Inter","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif!important;color:var(--pt-tx2)!important;text-shadow:none!important;max-width:60vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#estudio-porta.m2.ep-erro .ep-pc{display:none!important}#estudio-porta.m2.ep-erro .ep-m{grid-column:1/-1;justify-self:center;white-space:normal;color:var(--pt-tx)!important}
#estudio-porta.m2.ep-erro .ep-lg::before{background:color-mix(in srgb,#ff453a 70%,transparent)}
#estudio-porta.m2 a.ep-bt{grid-column:1/-1;justify-self:center;border-radius:999px!important}
@media (prefers-reduced-motion:reduce){#estudio-porta.m2 .ep-lg{animation:none}}
`;
  (document.head || root).appendChild(st);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = document.createElement('div');
  el.id = 'estudio-porta'; el.classList.add('m2'); try { const ic = window.EstudioIcones, id = ic?.atual?.(), cor = id && ic.config?.()?.[id]?.fg; el.style.setProperty('--ep-cor', /^#[0-9a-f]{6}$/i.test(cor || '') ? cor : '#5cc4ff'); } catch { } // carregamento novo (12/11/2026): foto escurecida, ícone pulando, porcentagem e uma frase el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<div class="ep-c"><div class="ep-lg${LOGO_EP || LOGO_PROG ? ' ep-prog' : ''}">${logoHtml()}</div><div class="ep-nm">${esc(TITULO)}</div><div class="ep-sb">Estúdio Problems</div><div class="ep-br"><i data-ep-barra></i></div><div class="ep-pc"><b data-ep-pct>0%</b><span data-ep-arq></span></div><div class="ep-m" data-m>Carregando</div></div>`;
  // entra já, antes do <body> existir; quando o <body> chega, a tela passa para dentro dele (fica por cima de tudo)
  root.appendChild(el);
  const paraBody = () => { if (document.body && el.parentNode !== document.body) document.body.appendChild(el); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paraBody, { once: true }); else paraBody();

  let seguros = 0, carregou = false, foi = false;
  const fecha = () => {
    if (foi) return; foi = true;
    const espera = Math.max(0, 350 - (performance.now() - inicio)); // não pisca nas páginas que abrem num instante
    setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('ep-saindo'); setTimeout(() => el.remove(), 380); })), espera); // 2 quadros: o programa já desenhou por baixo
  };
  const talvez = () => { if (carregou && seguros <= 0) (window.EstudioProgresso?.esperarTudo(12000) || Promise.resolve()).then(() => { if (seguros <= 0) fecha(); }); }; // espera imagens e arquivos que ainda estão baixando
  window.EstudioCarregando = {
    segurar() { seguros++; },
    pronto() { seguros = Math.max(0, seguros - 1); talvez(); },
    mensagem(t) { const m = el.querySelector('[data-m]'); if (m) m.textContent = String(t ?? ''); },
    fechar: fecha,
    // TELA DE ERRO: o programa chama quando não conseguiu abrir. Mostra a mensagem (texto puro), "Ir para o menu",
    // o botão "Gerar relatório de suporte" e o selo da versão. Não libera nem bloqueia nada (quem decide é o porteiro).
    erro(t) { foi = true; el.classList.remove('ep-saindo'); el.classList.add('ep-erro'); if (!el.isConnected) (document.body || root).appendChild(el);
      const m = el.querySelector('[data-m]'); m.textContent = String(t ?? 'Não consegui abrir o programa.').slice(0, 300);
      const a = document.createElement('a'); a.className = 'ep-bt'; a.href = '/'; a.textContent = 'Ir para o menu'; m.append(document.createElement('br'), a);
      window.EstudioSuporte?.poe(m); },
  };
  const aoCarregar = () => { carregou = true; talvez(); };
  if (document.readyState === 'complete') aoCarregar(); else addEventListener('load', aoCarregar, { once: true });
  setTimeout(fecha, 25000); // segurança: a tela nunca prende o programa
})();
