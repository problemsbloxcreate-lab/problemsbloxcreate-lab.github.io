/* ===================== estudio-conta.js — botão da conta em todos os projetos do Estúdio Problems =====================
   Coloque no projeto (de preferência no fim do <body>):

       <script src="/estudio-conta.js" defer></script>

   e, se quiser escolher o lugar do botão no cabeçalho, um  <span data-estudio-conta></span>  onde ele deve ficar.
   Sem esse marcador, ele entra ao lado do botão de tema ([data-tema-aqui]) ou, se não houver, fica no canto de cima.

   O botão mostra a foto e o nome da "Minha conta" do menu (ou os do Google) e abre um menu com o e-mail,
   "Minha conta", "Voltar ao menu" e "Sair da conta". Os dados vêm do porteiro (GET /conta, com a sessão do login).
   Fora do endereço único (sem porteiro), não aparece nada.
   ⚠ Isto é só a cara da conta: quem decide quem entra é o porteiro + o servidor do Estúdio Problems. Não ponha senhas aqui. */
'use strict';
(() => {
  if (window.EstudioConta) return;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const css = `.ep-conta{position:relative;display:inline-flex;align-items:center;flex:none;font:14px/1.4 'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;z-index:50}
.ep-conta.solto{position:fixed;top:10px;right:12px;z-index:2147483000}
.ep-conta-btn{box-sizing:border-box;width:34px;height:34px;min-width:0;max-width:none;min-height:0;margin:0;flex:none;line-height:1;text-decoration:none;text-transform:none;letter-spacing:0;font-size:14px;border-radius:50%;border:0;padding:0;cursor:pointer;overflow:hidden;display:grid;place-items:center;font-weight:700;color:#fff;background:linear-gradient(135deg,#3d8bff,#19d3f0);box-shadow:0 2px 10px rgba(0,0,0,.3)}
.ep-conta-btn:hover,.ep-conta-btn:focus-visible{filter:brightness(1.1);outline:2px solid rgba(61,139,255,.6);outline-offset:2px}
.ep-conta-btn img{width:100%;height:100%;object-fit:cover;display:block}
.ep-conta-pop{box-sizing:border-box;line-height:1.4;position:absolute;right:0;top:42px;width:260px;background:#303030;color:#e7e7e7;border:1px solid #565656;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.5);padding:6px;text-align:left}
.ep-conta-pop[hidden]{display:none}
.ep-conta-head{display:flex;align-items:center;gap:10px;padding:8px 8px 10px;border-bottom:1px solid #1f1f1f;margin-bottom:4px}
.ep-conta-head .av{width:40px;height:40px;border-radius:50%;overflow:hidden;flex:none;display:grid;place-items:center;font-weight:700;background:linear-gradient(135deg,#3d8bff,#19d3f0);color:#fff}
.ep-conta-head .av img{width:100%;height:100%;object-fit:cover}
.ep-conta-head b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ep-conta-head small{display:block;color:#b5b5b5;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ep-conta-pop a,.ep-conta-pop button.it{width:100%;display:flex;align-items:center;gap:9px;background:none;border:0;padding:8px 10px;border-radius:8px;cursor:pointer;text-align:left;color:#e7e7e7;text-decoration:none;font:inherit}
.ep-conta-pop a:hover,.ep-conta-pop button.it:hover{background:#434343}
.ep-conta-pop svg{flex:none;width:15px;height:15px}
.ep-conta-pop .sep{height:1px;background:#1f1f1f;margin:4px 0}`;
  const ini = p => esc((String(p?.nome || p?.email || '?')[0] || '?').toUpperCase());
  // se a foto falhar, tenta de novo uma vez (sem a memória do navegador) antes de mostrar a letra
  const av = p => p?.foto ? `<img src="${esc(p.foto)}" alt="" referrerpolicy="no-referrer" onerror="if(!this.dataset.r){this.dataset.r=1;var i=this;setTimeout(function(){i.src=i.src+(i.src.indexOf('?')<0?'?':'&')+'r='+Date.now()},1200)}else this.replaceWith(document.createTextNode('${ini(p)}'))">` : ini(p);
  let perfilP = null;
  const perfil = () => perfilP || (perfilP = fetch('/conta', { credentials: 'same-origin', cache: 'no-store' })
    .then(r => r.ok && r.headers.get('x-porteiro') ? r.json() : null).catch(() => null));

  async function montar() {
    const p = await perfil(); if (!p) return; // fora do porteiro ou sem sessão: não mostra nada
    if (!document.getElementById('ep-conta-css')) { const st = document.createElement('style'); st.id = 'ep-conta-css'; st.textContent = css; document.head.appendChild(st); }
    const box = document.createElement('div'); box.className = 'ep-conta';
    box.innerHTML = `<button class="ep-conta-btn" type="button" aria-haspopup="true" aria-expanded="false" title="${esc(p.nome)} · ${esc(p.email)}">${av(p)}</button>
      <div class="ep-conta-pop" hidden role="menu">
        <div class="ep-conta-head"><span class="av">${av(p)}</span><span style="min-width:0"><b>${esc(p.nome)}</b><small>${esc(p.email)}</small></span></div>
        <a href="/?conta=1" role="menuitem"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>Minha conta</a>
        <a href="/" role="menuitem"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10.5 9-7 9 7V20a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 20z"/></svg>Voltar ao menu</a>
        <div class="sep"></div>
        <button class="it" type="button" data-sair role="menuitem"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Sair da conta</button>
      </div>`;
    const lugar = document.querySelector('[data-estudio-conta]'), tema = document.querySelector('[data-tema-aqui]');
    if (lugar) lugar.replaceWith(box);
    else if (tema) tema.insertAdjacentElement('afterend', box);
    else { box.classList.add('solto'); document.body.appendChild(box); }
    const btn = box.querySelector('.ep-conta-btn'), pop = box.querySelector('.ep-conta-pop');
    btn.onclick = e => { e.stopPropagation(); pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)); };
    document.addEventListener('click', e => { if (!box.contains(e.target)) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    box.querySelector('[data-sair]').onclick = async () => { try { await fetch('/sair', { method: 'POST', credentials: 'same-origin' }); } catch { } location.href = '/?sair=1'; };
  }
  window.EstudioConta = { perfil };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar, { once: true }); else montar();
})();
