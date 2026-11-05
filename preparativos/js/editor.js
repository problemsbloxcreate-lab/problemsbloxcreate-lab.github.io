/* ===================== editor.js — a folha do roteiro, no estilo do Google Docs =====================
   Uma folha branca editável (contenteditable). O TEXTO é a fonte de verdade (o mesmo formato de js/roteiro.js);
   a cada mudança a linha é pintada de novo pelo Roteiro.classifica: parte = título, nome do personagem na cor dele,
   *itálico* apagadinho (ação / como falar), [cena] e // comentários em cinza. O que aparece na folha é EXATAMENTE o texto
   (os * continuam lá, só ficam clarinhos), então separar depois é só ler o texto.
   Colar do Google Docs: o itálico de lá vira *itálico* e os títulos viram "## ".
   Desfazer/refazer próprios (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z), Ctrl+I = itálico (ação). */
'use strict';
const Editor = (() => {
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // *itálico* e (nota) dentro da fala, com os sinais clarinhos
  const inline = t => esc(t).replace(/\*([^*\n]+)\*/g, '<span class="it"><span class="mk">*</span>$1<span class="mk">*</span></span>').replace(/\(([^)\n]{1,120})\)/g, '<span class="it">($1)</span>');
  function linhaHtml(o, cor) {
    const L = o.linha;
    if (o.t === 'v') return L ? `<div class="l v">${esc(L)}</div>` : '<div class="l v"><br></div>';
    if (o.t === 'h') { const m = L.match(/^(\s*#{1,6}\s*)(.*)$/); return `<div class="l h">${m ? `<span class="mk">${esc(m[1])}</span>${esc(m[2])}` : esc(L)}</div>`; }
    if (o.t === 'f') return `<div class="l f" style="--c:${cor(o.nome)}">${esc(o.pre)}<span class="nm">${esc(o.nome)}</span><span class="dp">${inline(o.meio)}</span>${inline(o.resto)}</div>`;
    if (o.t === 'f2') return `<div class="l f2">${inline(L)}</div>`;
    return `<div class="l ${o.t}">${esc(L)}</div>`;
  }
  // Google Docs → texto: itálico vira *…*, títulos viram "## ", cada bloco uma linha
  function deHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html'); let out = '';
    const BLOCO = /^(P|DIV|LI|H[1-6]|TR|BLOCKQUOTE|PRE)$/;
    const anda = (n, it) => {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\n/g, ' '); return; }
      if (n.nodeType !== 1 || /^(STYLE|SCRIPT|META|TITLE)$/.test(n.tagName)) return;
      if (n.tagName === 'BR') { out += '\n'; return; }
      const st = n.getAttribute('style') || '', ehIt = !it && (/^(I|EM)$/.test(n.tagName) || /font-style:\s*italic/i.test(st)) && n.textContent.trim();
      const bloco = BLOCO.test(n.tagName); if (bloco && out && !out.endsWith('\n')) out += '\n';
      if (/^H[1-3]$/.test(n.tagName) && n.textContent.trim()) out += '## ';
      if (ehIt) out += '*'; for (const c of n.childNodes) anda(c, it || ehIt); if (ehIt) { out = out.replace(/(\s*)$/, '*$1'); }
      if (bloco && !out.endsWith('\n')) out += '\n';
    };
    anda(doc.body, false);
    return out.replace(/ /g, ' ').replace(/\*([ \t]*)\*/g, '$1').replace(/\n{3,}/g, '\n\n').replace(/\n$/, '');
  }

  function cria(raiz, o = {}) {
    const ed = document.createElement('div'); ed.className = 'folha-txt'; ed.contentEditable = o.somenteLer ? 'false' : 'true'; ed.spellcheck = true; ed.lang = 'pt-BR';
    ed.setAttribute('role', 'textbox'); ed.setAttribute('aria-multiline', 'true'); ed.setAttribute('aria-label', 'Roteiro');
    raiz.appendChild(ed);
    let texto = String(o.texto || '').replace(/\r/g, ''), info = [], hist = [{ t: texto, c: 0 }], hi = 0, tHist = 0, compondo = false;
    const cor = n => (o.cor ? o.cor(n) : '#3d9bff');
    // ---- texto do DOM: uma linha por bloco de cima ----
    const blocos = () => [...ed.childNodes].filter(n => !(n.nodeType === 3 && !n.nodeValue && ed.childNodes.length > 1));
    const textoDe = n => (n.nodeType === 3 ? n.nodeValue : n.nodeName === 'BR' ? '' : n.textContent).replace(/\n/g, '').replace(/ /g, ' ');
    function leDom() { const bs = blocos(); return bs.length ? bs.map(textoDe).join('\n') : ''; }
    function pos(no, off) { // posição no texto inteiro
      const bs = blocos(); if (no === ed) { let p = 0; for (let i = 0; i < Math.min(off, bs.length); i++) p += textoDe(bs[i]).length + 1; return off >= bs.length ? Math.max(0, p - 1) : p; }
      let b = no; while (b && b.parentNode !== ed) b = b.parentNode; const i = bs.indexOf(b); if (i < 0) return 0;
      let p = 0; for (let k = 0; k < i; k++) p += textoDe(bs[k]).length + 1;
      const r = document.createRange(); r.selectNodeContents(b); try { r.setEnd(no, off); } catch { return p; } return p + r.toString().replace(/\n/g, '').length;
    }
    function cursor() { const s = getSelection(); if (!s.rangeCount) return null; const r = s.getRangeAt(0); if (!ed.contains(r.startContainer)) return null; const a = pos(r.startContainer, r.startOffset), b = pos(r.endContainer, r.endOffset); return { a: Math.min(a, b), b: Math.max(a, b) }; }
    function ponto(p) { // posição → (nó, deslocamento)
      const bs = [...ed.children]; let i = 0; for (; i < bs.length; i++) { const n = bs[i].textContent.length; if (p <= n) break; p -= n + 1; }
      const b = bs[Math.min(i, bs.length - 1)]; if (!b) return [ed, 0]; if (i >= bs.length) p = b.textContent.length;
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode())) { if (p <= t.nodeValue.length) return [t, p]; p -= t.nodeValue.length; }
      return [b, 0];
    }
    function poeCursor(a, b = a) { const s = getSelection(), r = document.createRange(); const [n1, o1] = ponto(a), [n2, o2] = ponto(b); r.setStart(n1, o1); r.setEnd(n2, o2); s.removeAllRanges(); s.addRange(r); }
    // ---- pinta (só as linhas que mudaram) ----
    function pinta() {
      info = Roteiro.classifica(texto); const html = info.map(x => linhaHtml(x, cor));
      const fs = [...ed.childNodes];
      if (fs.length !== html.length || fs.some(n => n.nodeType !== 1)) { ed.innerHTML = html.join(''); [...ed.children].forEach((d, i) => { d._h = html[i]; }); }
      else html.forEach((h, i) => { const d = fs[i]; if (d._h !== h || d.textContent.replace(/ /g, ' ') !== info[i].linha) { const tp = document.createElement('template'); tp.innerHTML = h; const n = tp.content.firstElementChild; n._h = h; d.replaceWith(n); } });
      [...ed.children].forEach((d, i) => { d.dataset.i = i; });
    }
    const avisa = () => o.aoMudar?.(texto);
    function guardaHist(c, junta) { clearTimeout(tHist); if (junta && hi === hist.length - 1 && hist[hi]._aberto) { hist[hi] = { t: texto, c, _aberto: true }; } else { hist = hist.slice(0, hi + 1); hist.push({ t: texto, c, _aberto: !!junta }); if (hist.length > 300) hist.shift(); hi = hist.length - 1; } tHist = setTimeout(() => { if (hist[hi]) hist[hi]._aberto = false; }, 800); }
    function troca(a, b, s, cAntes) { texto = texto.slice(0, a) + s + texto.slice(b); pinta(); poeCursor(a + s.length); guardaHist(a + s.length, false); avisa(); }
    function vaiHist(d) { const n = hi + d; if (n < 0 || n >= hist.length) return; hi = n; texto = hist[hi].t; pinta(); poeCursor(Math.min(hist[hi].c, texto.length)); avisa(); }
    // ---- eventos ----
    ed.addEventListener('compositionstart', () => { compondo = true; });
    ed.addEventListener('compositionend', () => { compondo = false; ed.dispatchEvent(new Event('input')); });
    ed.addEventListener('beforeinput', e => { if (/^format|^history/.test(e.inputType)) e.preventDefault(); });
    ed.addEventListener('input', () => { if (compondo) return; const c = cursor(); texto = leDom(); pinta(); if (c) poeCursor(c.a, c.b); guardaHist(c?.a || 0, true); avisa(); });
    ed.addEventListener('keydown', e => {
      if (o.somenteLer) return; const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (e.key === 'Enter') { e.preventDefault(); const c = cursor(); if (c) troca(c.a, c.b, '\n'); return; }
      if (e.key === 'Tab') { e.preventDefault(); return; }
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); vaiHist(-1); return; }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); vaiHist(1); return; }
      if (mod && k === 'i') { e.preventDefault(); italico(); return; }
      if (mod && (k === 'b' || k === 'u')) { e.preventDefault(); return; }
    });
    ed.addEventListener('paste', e => { if (o.somenteLer) return; e.preventDefault(); const d = e.clipboardData, h = d.getData('text/html'); const t = (h ? deHtml(h) : d.getData('text/plain')).replace(/\r/g, ''); const c = cursor() || { a: texto.length, b: texto.length }; troca(c.a, c.b, t); });
    ed.addEventListener('drop', e => { e.preventDefault(); });
    ed.addEventListener('copy', e => { const c = cursor(); if (!c || c.a === c.b) return; e.preventDefault(); e.clipboardData.setData('text/plain', texto.slice(c.a, c.b)); });
    ed.addEventListener('cut', e => { const c = cursor(); if (!c || c.a === c.b || o.somenteLer) return; e.preventDefault(); e.clipboardData.setData('text/plain', texto.slice(c.a, c.b)); troca(c.a, c.b, ''); });
    ed.addEventListener('keyup', () => o.aoMover?.(cursor())); ed.addEventListener('mouseup', () => o.aoMover?.(cursor()));
    function italico() { const c = cursor(); if (!c) return; const sel = texto.slice(c.a, c.b);
      if (!sel) { troca(c.a, c.b, '**'); poeCursor(c.a + 1); return; }
      if (/^\*[^*]+\*$/.test(sel)) return troca(c.a, c.b, sel.slice(1, -1));
      const t = sel.replace(/^(\s*)(.*?)(\s*)$/s, '$1*$2*$3'); troca(c.a, c.b, t); poeCursor(c.a, c.a + t.length); }
    // ---- MENU DA SELEÇÃO (pedido da dona): selecionou (ou clique direito no que está selecionado) → diz o que aquele trecho é ----
    const linhaDe = p => { const ini = texto.lastIndexOf('\n', p - 1) + 1, f = texto.indexOf('\n', p); return [ini, f < 0 ? texto.length : f]; };
    const svg = d => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const menu = document.createElement('div'); menu.className = 'sel-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
    menu.innerHTML = `<button data-m="nome" role="menuitem">${svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>')} É o nome do personagem</button>
      <button data-m="acao" role="menuitem">${svg('<path d="M10 4h8M6 20h8M14 4l-4 16"/>')} É ação / explicação da cena</button>
      <button data-m="parte" role="menuitem">${svg('<path d="M6 4v16M18 4v16M6 12h12"/>')} É o título de uma parte</button>
      <button data-m="normal" role="menuitem">${svg('<path d="M5 12h14"/>')} Texto normal</button>`;
    document.body.appendChild(menu);
    let selMenu = null;
    const esconde = () => { menu.hidden = true; selMenu = null; };
    function mostraMenu(x, y, embaixo) { const c = cursor(); if (!c || c.a === c.b || o.somenteLer || !texto.slice(c.a, c.b).trim()) return esconde();
      selMenu = c; menu.hidden = false; const w = menu.offsetWidth, h = menu.offsetHeight;
      menu.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - (embaixo ? 0 : w / 2))) + 'px';
      menu.style.top = (embaixo ? Math.min(innerHeight - h - 8, y) : (y - h - 10 < 8 ? y + 28 : y - h - 10)) + 'px'; }
    menu.addEventListener('mousedown', e => e.preventDefault()); // não perde a seleção
    menu.addEventListener('click', e => { const b = e.target.closest('[data-m]'); const c = selMenu; esconde(); if (!b || !c) return; FAZ[b.dataset.m](c); });
    const FAZ = {
      nome(c) { // "Problems Oi gente" com "Problems" selecionado → "Problems: Oi gente"; nome sozinho na linha + fala na linha de baixo → junta
        const [ini, fim] = linhaDe(c.a), b = Math.min(c.b, fim), nome = texto.slice(c.a, b).replace(/[*:#\[\]()]/g, '').trim().slice(0, 40); if (!nome) return;
        let resto = (texto.slice(ini, c.a) + ' ' + texto.slice(b, fim)).replace(/^[\s*]*$/, '').trim().replace(/^[:\-–—]\s*/, ''), ate = fim;
        if (!resto && fim < texto.length) { const [i2, f2] = linhaDe(fim + 1); const l2 = texto.slice(i2, f2).trim(); if (l2 && Roteiro.classifica(l2)[0].t !== 'h' && Roteiro.classifica(l2)[0].t !== 'f') { resto = l2; ate = f2; } }
        troca(ini, ate, `${nome}: ${resto}`); },
      acao(c) { const [ini, fim] = linhaDe(c.a), l = texto.slice(ini, fim); if (texto.slice(c.a, c.b).trim() === l.trim() && c.b <= fim) { const t = l.trim().replace(/^[*_]+|[*_]+$/g, ''); return troca(ini, fim, `*${t}*`); } italico(); },
      parte(c) { const [ini, fim] = linhaDe(c.a), t = (texto.slice(c.a, Math.min(c.b, fim)).trim() || texto.slice(ini, fim).trim()).replace(/^#+\s*/, '').replace(/[*:]/g, '').trim(); if (!t) return;
        const antes = texto.slice(0, ini); troca(ini, fim, (antes && !/\n\s*\n$/.test(antes) ? '\n' : '') + '## ' + t); },
      normal(c) { const sel = texto.slice(c.a, c.b); const [ini, fim] = linhaDe(c.a);
        if (/^\s*#{1,6}\s*/.test(texto.slice(ini, fim)) && c.b <= fim) return troca(ini, fim, texto.slice(ini, fim).replace(/^\s*#{1,6}\s*/, ''));
        troca(c.a, c.b, sel.replace(/\*/g, '')); },
    };
    ed.addEventListener('mouseup', () => setTimeout(() => { const s = getSelection(); if (!s.rangeCount || s.isCollapsed) return esconde(); const r = s.getRangeAt(0).getBoundingClientRect(); mostraMenu(r.left + r.width / 2, r.top); }, 0));
    ed.addEventListener('keyup', e => { if (!e.shiftKey) return; const s = getSelection(); if (!s.rangeCount || s.isCollapsed) return esconde(); const r = s.getRangeAt(0).getBoundingClientRect(); mostraMenu(r.left + r.width / 2, r.top); });
    ed.addEventListener('contextmenu', e => { const s = getSelection(); if (!s.rangeCount || s.isCollapsed || o.somenteLer) return; e.preventDefault(); mostraMenu(e.clientX, e.clientY, true); });
    ed.addEventListener('input', esconde); ed.addEventListener('blur', () => setTimeout(() => { if (!menu.matches(':hover')) esconde(); }, 150));
    addEventListener('scroll', esconde, true); addEventListener('keydown', e => { if (e.key === 'Escape') esconde(); });
    const some = new MutationObserver(() => { if (!raiz.isConnected) { menu.remove(); some.disconnect(); } }); some.observe(document.body, { childList: true, subtree: true });

    pinta();
    return {
      el: ed, get texto() { return texto; },
      poe(t) { texto = String(t || '').replace(/\r/g, ''); pinta(); guardaHist(0, false); },
      foca() { ed.focus(); },
      // insere numa linha nova logo depois da linha do cursor (ou no fim)
      novaLinha(s, opc = {}) { ed.focus(); const c = cursor(); let p = texto.length; if (c) { const fim = texto.indexOf('\n', c.b); p = fim < 0 ? texto.length : fim; }
        const antes = texto.slice(0, p), pre = !antes ? '' : antes.endsWith('\n') ? '' : opc.espaco && !/\n\s*$/.test(antes) ? '\n\n' : '\n';
        troca(p, p, pre + s); ed.querySelector(`[data-i="${Roteiro.classifica(texto.slice(0, p + pre.length + s.length)).length - 1}"]`)?.scrollIntoView({ block: 'nearest' }); },
      italico, desfaz: () => vaiHist(-1), refaz: () => vaiHist(1),
      irPara(linha) { const d = ed.querySelector(`[data-i="${linha}"]`); if (!d) return; d.scrollIntoView({ block: 'center', behavior: 'smooth' }); ed.focus(); let p = 0; const ls = texto.split('\n'); for (let i = 0; i < linha; i++) p += ls[i].length + 1; poeCursor(p + ls[linha].length); },
      linhas: () => info,
      repinta: () => { const c = document.activeElement === ed ? cursor() : null; ed.innerHTML = ''; pinta(); if (c) poeCursor(c.a, c.b); },
    };
  }
  return { cria, deHtml };
})();
