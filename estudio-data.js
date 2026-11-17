/* SELETOR DE DIA E HORA DO ESTÚDIO (pedido da dona, 17/11/2026)
   O seletor nativo do navegador (<input type="datetime-local">) começa a semana no domingo e tem outra cara. Este arquivo troca TODOS eles, sozinho, por um seletor
   próprio do Estúdio: semana de SEGUNDA a domingo (igual ao calendário do Publicações), visual Celeste (tema escuro/claro), hora num campo simples, "Limpar" (fica sem data),
   "Cancelar" vermelho; clicar fora ou Esc fecha. O <input> original continua na página (escondido) com o mesmo valor "AAAA-MM-DDTHH:MM" e os mesmos eventos input/change,
   então o código de cada programa não muda. Vale para os campos que já existem e para os que aparecerem depois. Uma função só para os programas todos. */
(() => {
  if (window.EstudioData) return;
  const p2 = n => String(n).padStart(2, '0'), DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  const parse = v => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v || ''); return m ? { a: +m[1], m: +m[2] - 1, d: +m[3], h: m[4] == null ? 12 : +m[4], mi: m[5] == null ? 0 : +m[5] } : null; };
  const junta = (o, h, mi) => `${o.a}-${p2(o.m + 1)}-${p2(o.d)}T${p2(h)}:${p2(mi)}`;
  const rotulo = v => { const o = parse(v); return o ? `${p2(o.d)}/${p2(o.m + 1)}/${o.a} · ${p2(o.h)}:${p2(o.mi)}` : ''; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const IC_CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
  const IC_SETA = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const CSS = `
.dt-bt{display:flex;align-items:center;gap:8px;width:100%;min-width:0;flex:1;height:var(--alt-controle,36px);padding:0 10px;border:1px solid transparent;border-radius:var(--raio-controle,8px);background:var(--fundo-3,#2c2d33);color:var(--texto,#f2f3f5);font:400 var(--t-corpo,14px) var(--fonte,system-ui);text-align:left;cursor:pointer}
.dt-bt:hover{background:var(--fundo-4,#36373e)}.dt-bt:focus-visible,.dt-bt[aria-expanded=true]{outline:none;border-color:var(--acento,#5ac8fa);box-shadow:0 0 0 3px var(--acento-suave,rgba(90,200,250,.2))}
.dt-bt svg{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;opacity:.75}
.dt-bt .dt-vazio{opacity:.6}
.dt-pop{position:fixed;z-index:2147483000;width:288px;padding:12px;background:var(--elevado,#26272c);color:var(--texto,#f2f3f5);border:1px solid var(--linha,rgba(255,255,255,.12));border-radius:calc(var(--raio-controle,8px) + 4px);box-shadow:0 16px 40px rgba(0,0,0,.45);font:400 var(--t-corpo,14px) var(--fonte,system-ui)}
.dt-cab{display:flex;align-items:center;gap:6px;margin-bottom:8px}.dt-cab b{flex:1;text-align:center;font-weight:650}
.dt-nav{display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:var(--raio-controle,8px);background:transparent;color:var(--texto-2,#c9cbd1);cursor:pointer}.dt-nav:hover{background:var(--fundo-4,#36373e);color:var(--texto,#fff)}
.dt-nav svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.dt-grade{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.dt-sem{height:24px;display:grid;place-items:center;font-size:11px;font-weight:600;text-transform:uppercase;color:var(--texto-3,#8b8d96)}
.dt-d{height:34px;border:0;border-radius:var(--raio-controle,8px);background:transparent;color:inherit;font:inherit;cursor:pointer;padding:0}
.dt-d:hover{background:var(--fundo-4,#36373e)}.dt-d.fora{color:var(--texto-3,#7c7e87)}
.dt-d.hj{box-shadow:inset 0 0 0 1.5px var(--acento,#5ac8fa)}.dt-d.sel,.dt-d.sel:hover{background:var(--acento,#5ac8fa);color:var(--acento-texto,#04222f);font-weight:650}
.dt-hora{display:flex;align-items:center;gap:8px;margin-top:10px}.dt-hora label{color:var(--texto-2,#c9cbd1)}
.dt-hora input{flex:1;min-width:0;height:34px;padding:0 10px;border:1px solid transparent;border-radius:var(--raio-controle,8px);background:var(--fundo-3,#2c2d33);color:var(--texto,#fff);font:inherit}
.dt-hora input:focus{outline:none;border-color:var(--acento,#5ac8fa);box-shadow:0 0 0 3px var(--acento-suave,rgba(90,200,250,.2))}
.dt-pes{display:flex;align-items:center;gap:6px;margin-top:12px}.dt-pes .sp{flex:1}
.dt-b{height:34px;padding:0 12px;border:0;border-radius:var(--raio-controle,8px);background:transparent;color:var(--texto-2,#c9cbd1);font:inherit;cursor:pointer}.dt-b:hover{background:var(--fundo-4,#36373e);color:var(--texto,#fff)}
.dt-b.perigo{color:var(--perigo,#ff6b5b)}.dt-b.pri{background:var(--acento,#5ac8fa);color:var(--acento-texto,#04222f);font-weight:650}.dt-b.pri:hover{filter:brightness(1.08);background:var(--acento,#5ac8fa);color:var(--acento-texto,#04222f)}`;
  let aberto = null;
  const fecha = () => { if (!aberto) return; const a = aberto; aberto = null; a.el.remove(); a.bt.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', a.fora, true); removeEventListener('keydown', a.tecla, true); removeEventListener('resize', a.fecha); };
  function abre(inp, bt) {
    fecha(); const atual = parse(inp.value), hoje = new Date();
    let a = atual ? atual.a : hoje.getFullYear(), m = atual ? atual.m : hoje.getMonth(), sel = atual ? { a: atual.a, m: atual.m, d: atual.d } : null, hora = atual ? `${p2(atual.h)}:${p2(atual.mi)}` : '12:00';
    const el = document.createElement('div'); el.className = 'dt-pop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Escolher dia e hora');
    const pinta = () => {
      const primeiro = new Date(a, m, 1), desl = (primeiro.getDay() + 6) % 7, ini = new Date(a, m, 1 - desl), titulo = primeiro.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase());
      let cel = ''; for (let k = 0; k < 42; k++) { const d = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + k), ehHoje = d.toDateString() === hoje.toDateString(), ehSel = sel && sel.a === d.getFullYear() && sel.m === d.getMonth() && sel.d === d.getDate();
        cel += `<button type="button" class="dt-d${d.getMonth() !== m ? ' fora' : ''}${ehHoje ? ' hj' : ''}${ehSel ? ' sel' : ''}" data-a="${d.getFullYear()}" data-m="${d.getMonth()}" data-d="${d.getDate()}" aria-label="${d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}"${ehSel ? ' aria-pressed="true"' : ''}>${d.getDate()}</button>`; }
      el.innerHTML = `<div class="dt-cab"><button type="button" class="dt-nav" data-nav="-1" aria-label="Mês anterior">${IC_SETA('M15 6l-6 6 6 6')}</button><b>${esc(titulo)}</b><button type="button" class="dt-nav" data-nav="1" aria-label="Próximo mês">${IC_SETA('M9 6l6 6-6 6')}</button></div>
        <div class="dt-grade">${DIAS.map(d => `<span class="dt-sem">${d}</span>`).join('')}${cel}</div>
        <div class="dt-hora"><label for="dt-h">Hora</label><input id="dt-h" type="time" value="${esc(hora)}" step="60"></div>
        <div class="dt-pes"><button type="button" class="dt-b" data-limpar>Limpar</button><span class="sp"></span><button type="button" class="dt-b perigo" data-cancelar>Cancelar</button><button type="button" class="dt-b pri" data-ok>Escolher</button></div>`;
      el.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { m += +b.dataset.nav; if (m < 0) { m = 11; a--; } if (m > 11) { m = 0; a++; } pinta(); });
      el.querySelectorAll('.dt-d').forEach(b => b.onclick = () => { sel = { a: +b.dataset.a, m: +b.dataset.m, d: +b.dataset.d }; a = sel.a; m = sel.m; pinta(); });
      el.querySelector('#dt-h').oninput = e => { hora = e.target.value || hora; };
      el.querySelector('[data-limpar]').onclick = () => { fecha(); inp.value = ''; emite(inp); };
      el.querySelector('[data-cancelar]').onclick = fecha;
      el.querySelector('[data-ok]').onclick = ok;
    };
    const ok = () => { const h = /^(\d{1,2}):(\d{2})/.exec(hora) || [0, '12', '00']; if (!sel) { const t = new Date(); sel = { a: t.getFullYear(), m: t.getMonth(), d: t.getDate() }; } fecha(); inp.value = junta(sel, +h[1], +h[2]); emite(inp); };
    pinta(); document.body.appendChild(el);
    const r = bt.getBoundingClientRect(), W = el.offsetWidth, H = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(r.left, innerWidth - W - 8)) + 'px'; el.style.top = (r.bottom + 6 + H > innerHeight - 8 && r.top - H - 6 > 8 ? r.top - H - 6 : Math.max(8, Math.min(r.bottom + 6, innerHeight - H - 8))) + 'px';
    bt.setAttribute('aria-expanded', 'true');
    // clicar fora fecha só o seletor (o clique não chega ao que está embaixo); Esc fecha só o seletor (não fecha a janela de trás)
    const engole = e => { e.stopPropagation(); e.preventDefault(); };
    const fora = e => { if (el.contains(e.target) || bt.contains(e.target)) return; fecha(); for (const t of ['mousedown', 'mouseup', 'click']) document.addEventListener(t, engole, { capture: true, once: true }); setTimeout(() => { for (const t of ['mousedown', 'mouseup', 'click']) document.removeEventListener(t, engole, true); }, 400); };
    const tecla = e => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); fecha(); bt.focus(); } else if (e.key === 'Enter' && e.target?.id === 'dt-h') { e.preventDefault(); e.stopImmediatePropagation(); ok(); } };
    aberto = { el, bt, fora, tecla, fecha }; document.addEventListener('pointerdown', fora, true); addEventListener('keydown', tecla, true); addEventListener('resize', fecha);
    (el.querySelector('.dt-d.sel') || el.querySelector('.dt-d.hj') || el.querySelector('.dt-d')).focus();
  }
  const emite = inp => { inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); };
  function melhora(inp) {
    if (inp.dataset.dt) return; inp.dataset.dt = '1';
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'), bt = document.createElement('button'); bt.type = 'button'; bt.className = 'dt-bt'; bt.setAttribute('aria-haspopup', 'dialog'); bt.setAttribute('aria-expanded', 'false');
    const pinta = () => { const r = rotulo(desc.get.call(inp)); bt.innerHTML = `${IC_CAL}<span class="${r ? '' : 'dt-vazio'}">${r || 'Sem data'}</span>`; bt.disabled = inp.disabled; };
    Object.defineProperty(inp, 'value', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); pinta(); } });
    inp.style.display = 'none'; inp.insertAdjacentElement('afterend', bt); pinta();
    bt.onclick = () => { if (aberto && aberto.bt === bt) fecha(); else abre(inp, bt); };
    inp.addEventListener('click', () => abre(inp, bt)); // clicar no texto do <label> também abre
  }
  const varre = raiz => { (raiz.matches?.('input[type=datetime-local]') ? [raiz] : []).concat([...(raiz.querySelectorAll?.('input[type=datetime-local]') || [])]).forEach(melhora); };
  const inicia = () => {
    if (!document.getElementById('estudio-data-css')) { const s = document.createElement('style'); s.id = 'estudio-data-css'; s.textContent = CSS; document.head.appendChild(s); }
    varre(document); new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) varre(n); }).observe(document.documentElement, { childList: true, subtree: true });
  };
  window.EstudioData = { melhora, fecha, abre };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicia); else inicia();
})();
