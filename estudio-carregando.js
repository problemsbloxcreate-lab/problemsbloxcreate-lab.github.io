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
   /estudio-conta.js carrega ele se faltar). PARA MUDAR A VERSÃO, TROQUE SÓ AQUI (window.EstudioVersao.nome): o menu, o perfil,
   as telas de erro e o relatório leem daqui. Não muda sozinha a cada publicação.
   DIÁRIO: cada navegador anota SÓ NELE MESMO (localStorage 'ep-diario', nada vai para a nuvem): programa aberto, versão, erros de
   JavaScript (window.onerror, unhandledrejection, console.error), pedidos à nossa nuvem que falharam (status + rota, sem dados),
   avisos da nuvem (x-nuvem, limite, porta reserva), página que demorou para carregar e as ações principais (botões clicados).
   Ao virar o dia, o que não é erro sai; os erros ficam 7 dias; limite de ~700 linhas / 400 mil letras.
   RELATÓRIO: "Gerar relatório de suporte" (menu da conta, em todos os programas) baixa um .md para OUTRO chat do Claude ler sem contexto:
   o que é o Estúdio, versão, navegador e tela, e o diário com os erros primeiro. E-mail mascarado como na ADM; tokens de login, passes, chaves, senhas e assinaturas de link não entram. */
window.EstudioVersao ||= { nome: '1.0 - Flower Field' };
window.ESTUDIO_VERSAO ||= window.EstudioVersao.nome; // nome antigo (compatibilidade)
window.EstudioDiario ||= (() => {
  const K = 'ep-diario', MAX = 700, MAXCH = 400000, DIAS_ERRO = 7;
  // REGRA DA DONA (06/11/2026): entra tudo o que ajuda a resolver (links, rotas, ids, códigos, status, nuvem, porta, versão, horários,
  // nomes e o e-mail MASCARADO como na ADM). Só credenciais não aparecem (token de login, JWT/passe, chave de API, senha, assinatura de link):
  // no lugar fica o que era, para quem ler saber que existia.
  const mascara = e => { const [u, d = ''] = String(e).split('@'); return (u.length <= 2 ? u[0] + '•' : u.slice(0, 2) + '•'.repeat(Math.min(6, Math.max(3, u.length - 2)))) + '@' + d; }; // a mesma da ADM (porteiro)
  const filtra = t => String(t ?? '')
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

  /* ---------- o relatório (.md) ---------- */
  const CONTEXTO = `## O que é o Estúdio Problems (para quem vai ler este relatório sem contexto)
O Estúdio Problems é o site de uma equipe de animação e vídeos. Tudo fica num endereço só, **https://estudio.problemsraiz.workers.dev**, e só entra quem tem login do Google liberado.

**Programas** (cada um é uma pasta do endereço):
- \`/\` menu (blocos dos programas, Meus projetos, Estúdio, Meus atalhos) e \`/adm\` (ADM: botões, fundo, ícones, quem pode entrar, níveis de acesso, nuvem…)
- \`/animador/\` Animador (com o Ateliê de personagens e os Cenários), \`/shorts/\` Shorts, \`/editor/\` Editar, \`/modelador/\` Modelador (Blockbench), \`/preparativos/\` Preparativos (roteiro e falas), \`/publicacoes/\` Publicações (YouTube)

**Como funciona por trás:**
- **Porteiro** (Cloudflare Worker \`estudio\`, conta "problemsraiz"): faz o login, guarda a sessão, entrega as páginas e assina o "passe" dos programas. Código: \`porteiro/worker.js\` do repositório do site.
- **turma-ia** (Cloudflare Worker): o servidor de dados da equipe (animações, personagens, preparativos, publicações, menu, níveis de acesso, IA). Código: \`servidor/turma-ia/worker.js\`.
- **Nuvens**: a PRINCIPAL (conta problemsraiz, D1/KV) → RESERVA (\`reserva-problems\`, 3ª conta) → TERCIÁRIA (\`terciaria-problems\`, 4ª conta). Arquivos grandes ficam no Worker \`arquivos-problems\`; sons no \`sons-problems\`. Quando a principal chega no limite do dia (plano grátis: 100 mil pedidos), as respostas vêm com o cabeçalho \`x-nuvem\` (reserva, terciaria, limite, voltando) e o site avisa. As "nuvens trabalhando juntas": o cabeçalho \`x-divide\` manda parte dos pedidos pelo \`turma-reserva\`.
- **Porta reserva**: o mesmo site em outra conta (\`estudio-reserva.editorcustomizado.workers.dev\`), usada quando a principal dá o erro 1027 (sem pedidos no dia).
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
  async function relatorio(o = {}) { const pub = !!o.publico;
    poda(); const l = le().slice().sort((a, b) => b.t - a.t), err = l.filter(x => x.n === 'erro'), av = l.filter(x => x.n === 'aviso'), inf = l.filter(x => x.n === 'info');
    let esp = ''; try { const e = await navigator.storage?.estimate?.(); if (e?.quota) esp = `${(e.usage / 1048576).toFixed(1)} MB de ${(e.quota / 1048576).toFixed(0)} MB`; } catch { }
    const lj = k => { try { const v = localStorage.getItem(k); return v == null ? null : v[0] === '{' ? JSON.parse(v) : v; } catch { return null; } }, hm = t => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const mb = b => b >= 1073741824 ? (b / 1073741824).toFixed(1).replace('.', ',') + ' GB' : Math.round(b / 1048576) + ' MB', marcas = [];
    { const v = pub ? null : lj('ep-nuvem-uso'), j = v?.j; if (j?.limite) marcas.push(`- **Espaço da nuvem (última medida guardada):** ${mb(j.total)} de ${mb(j.limite)} (${Math.round(j.total / j.limite * 100)}%) medido às ${hm(j.em || v.t)}${j.nuvem ? ' · medido na nuvem ' + j.nuvem : ''}`); }
    { const v = lj('ep-divide'); if (v && v.ate > Date.now()) marcas.push(`- **Nuvens trabalhando juntas (ep-divide):** ${Math.round((+v.p || 0) * 100)}% dos pedidos de dados deste navegador vão pela outra conta (turma-reserva), até ${hm(v.ate)}`); }
    { const v = lj('estudio-limite-cf'), o = typeof v === 'object' ? v : v ? { t: +v } : null; if (o?.t) marcas.push(`- **Aviso de limite guardado (estudio-limite-cf):** ${o.t > Date.now() ? `vale até ${hm(o.t)} (quando a principal volta)` : 'já venceu'}${o.r ? ' · nuvem em uso: ' + (+o.r >= 2 ? 'terciária' : 'reserva') : ''}`); }
    { let v = null; try { v = sessionStorage.getItem('ep-porta-volta'); } catch { } if (v) marcas.push(`- **Porta reserva:** a principal volta às ${hm(+v)}`); }
    const EL = window.EstudioLimite, nivelN = EL?.marcado?.() > Date.now() ? (EL?.nivel?.() || 0) : 0;
    marcas.unshift(`- **Porta em uso:** ${/estudio-reserva\./.test(location.hostname) ? 'PORTA RESERVA (' + location.hostname + ')' : location.hostname === 'estudio.problemsraiz.workers.dev' ? 'principal (estudio.problemsraiz.workers.dev)' : location.hostname} · **nuvem em uso:** ${nivelN >= 2 ? 'terciária' : nivelN >= 1 ? 'reserva' : 'principal'}`);
    let fbLogin = '?'; try { const dbs = await indexedDB.databases?.(); if (dbs) fbLogin = dbs.some(d => d.name === 'firebaseLocalStorageDb') ? 'presente' : 'não encontrado'; } catch { }
    let contaOk = 'não'; try { contaOk = sessionStorage.getItem('ep-conta-v1') ? 'sim' : 'não'; } catch { }
    const scr = [...document.scripts].map(s => s.src).filter(s => /estudio-|\/js\//.test(s)).map(s => s.replace(location.origin, '')).slice(0, 12);
    const md = `# Relatório de suporte — Estúdio Problems
Gerado em ${new Date().toLocaleString('pt-BR')} (${Intl.DateTimeFormat().resolvedOptions().timeZone}) pelo botão "Gerar relatório de suporte"${pub ? ' numa tela sem login liberado (sem dados da equipe)' : ''}.

${CONTEXTO}

## Versão, navegador e tela
- **Versão do site:** ${window.EstudioVersao.nome}
- **Página aberta:** \`${location.pathname}\` (programa: ${prog()}) em \`${location.hostname}\`
- **Navegador:** ${navigator.userAgent}
- **Tela:** ${screen.width}×${screen.height} · janela ${innerWidth}×${innerHeight} · zoom/densidade ${devicePixelRatio}
- **Login:** login do Google neste navegador: ${fbLogin} · conta do Estúdio carregada nesta aba: ${contaOk} (tokens, passes e chaves nunca entram no relatório)
- **Idioma:** ${navigator.language} · **internet agora:** ${navigator.onLine ? 'sim' : 'não'}${navigator.deviceMemory ? ` · **memória:** ~${navigator.deviceMemory} GB` : ''}${esp ? ` · **espaço do site no navegador:** ${esp}` : ''}
- **Arquivos carregados (com a versão):** ${scr.map(s => '`' + limpa(s) + '`').join(', ') || '—'}

**Nuvem e porta (marcas guardadas neste navegador):**
${marcas.join('\n')}

## Erros (${err.length}, mais recentes primeiro; ficam 7 dias)
${err.map(linha).join('\n') || '- Nenhum erro anotado.'}

## Avisos de hoje (${av.length})
${av.map(linha).join('\n') || '- Nenhum.'}

## O que foi feito hoje (${inf.length})
${pub ? '- (não entra: relatório gerado numa tela sem login liberado)' : inf.slice(0, 300).map(linha).join('\n') || '- Nada anotado.'}
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
  const DICA = 'Gera um relatório para enviar aos ADMs', postos = new Set(); let css = false, selo = null;
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
.ep-sup-pg button:focus-visible,.ep-sup-bt:focus-visible,.ep-sup-selo:focus-visible{outline:2px solid #3d8bff;outline-offset:2px}`;
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
  function poeSelo(o) { if (selo?.isConnected) return; selo = document.createElement('button'); selo.type = 'button'; selo.className = 'ep-sup-selo'; selo.textContent = window.EstudioVersao?.nome || ''; selo.title = DICA;
    selo.onclick = () => gerar(o); document.documentElement.appendChild(selo); }
  function poe(c, o = {}) { if (!c) return; estilo();
    if (!c.querySelector('.ep-sup-bt')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'ep-sup-bt'; b.textContent = 'Gerar relatório de suporte'; b.title = DICA;
      b.onclick = e => { e.preventDefault(); e.stopPropagation(); gerar(o); }; c.appendChild(b); postos.add(b); }
    if (o.selo !== false) poeSelo(o); }
  function tira() { postos.forEach(b => b.remove()); postos.clear(); selo?.remove(); selo = null; }
  const auto = () => document.querySelectorAll('[data-ep-suporte]').forEach(c => poe(c, { publico: c.getAttribute('data-ep-suporte') === 'publico' }));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true }); else auto();
  const S = { gerar, poe, tira, aberto: false, DICA }; return S;
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
  const curto = u => { try { const x = new URL(u, location.href); if (x.origin === location.origin) { const n = NOMES_ARQ.find(([re]) => re.test(x.pathname)); if (n) return n[1]; } let p = decodeURIComponent(x.pathname.split('/').filter(Boolean).slice(-2).join('/')) || x.hostname; if (x.hostname !== location.hostname && !/\./.test(p)) p = x.hostname; return p.length > 44 ? '…' + p.slice(-42) : p; } catch { return ''; } };
  const muda = () => { if (ativo) agenda(); };
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
  // logo da tela de carregamento = o ícone do próprio programa (o mesmo da aba e do cabeçalho); sem programa, o do menu
  const LOGO_PROG = { ANIMADOR: '/animador/icones/simbolo.svg', EDITOR: '/editor/icone.svg', MODELADOR: '/modelador/icone.svg', SHORTS: '/shorts/icone-shorts-180.png', BLOCKBENCH: '/modelador/icone.svg' }[NOME_PROG] || '';
  const LOGO_EP = window.EstudioIcones?.atual?.() ? window.EstudioIcones.url(window.EstudioIcones.atual()) : ''; // ícone novo do programa (Sh, Ed, An, Md; ADM › Ícones)
  const logoHtml = () => ((LOGO_EP || LOGO_PROG) ? '<img class="ep-img" alt=""' + (LOGO_EP ? ' data-estudio-icone-img="' + window.EstudioIcones.atual() + '"' : '') + ' src="' + (LOGO_EP || LOGO_PROG) + '" onerror="this.parentNode.classList.remove(\'ep-prog\');this.remove()">' : '') + '<svg class="ep-cam" width="84" height="84" viewBox="0 0 64 64"><g transform="translate(-9 -23.5) scale(.17)"><path d="M200.5 154 339 228V380L200.5 454 62 380V228Z" fill="#fff" stroke="#000" stroke-width="13" stroke-linejoin="round"/><g fill="none" stroke="#000" stroke-width="9" stroke-linecap="round"><path d="M202 224Q184 249 163 267"/><path d="M267 255Q254 279 239 298"/><path d="M116 307Q111 325 111.5 343"/></g></g><g stroke="#000" stroke-width="2.2" stroke-linejoin="round"><rect x="26.5" y="37.5" width="24" height="20" rx="4.5" fill="#19d3f0"/><path d="M50.5 43.5 61.5 37.5V57.5L50.5 51.5Z" fill="#19d3f0"/></g></svg>';
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
#estudio-porta a.ep-bt{padding:10px 20px;border-radius:999px;background:rgba(255,255,255,.1);color:#f1f2f4;border:1px solid rgba(255,255,255,.16);font-weight:500;font-size:13.5px;margin-top:18px}#estudio-porta a.ep-bt:hover{filter:none;background:rgba(255,255,255,.16)}#estudio-porta .tl-out{color:#9aa0ab;text-decoration:none}#estudio-porta .ep-m{margin-top:18px}`;
  (document.head || root).appendChild(st);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = document.createElement('div');
  el.id = 'estudio-porta'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<div class="ep-c"><div class="ep-lg${LOGO_EP || LOGO_PROG ? ' ep-prog' : ''}">${logoHtml()}</div><div class="ep-nm">${esc(NOME_PROG)}</div><div class="ep-sb">Estúdio Problems</div><div class="ep-br"><i data-ep-barra></i></div><div class="ep-pc"><b data-ep-pct>0%</b><span data-ep-arq></span></div><div class="ep-m" data-m>Abrindo…</div></div>`;
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
