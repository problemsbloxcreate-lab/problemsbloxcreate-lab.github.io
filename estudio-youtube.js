/* PUBLICAR NO YOUTUBE (pedido da dona, 05/11/2026) — módulo comum do Estúdio Problems (global EstudioYouTube).
   O vídeo vai do NAVEGADOR direto para o YouTube (zero pedidos à Cloudflare, a não ser baixar este arquivo):
   - login: Google Identity Services (token client) com os escopos youtube.upload + youtube.readonly; o token fica SÓ na memória da aba;
   - canal: o Google mostra a escolha de conta/canal (contas com canais de marca escolhem ali); o escolhido vira o PADRÃO deste
     navegador (localStorage `ep-youtube-canal`: id, nome e foto do canal; nada de e-mail) e "Trocar" escolhe de novo a qualquer hora;
   - envio resumível da YouTube Data API v3 (videos.insert, privacyStatus 'unlisted'), com barra de progresso e retomada se a rede cair;
   - no fim: link do vídeo e do YouTube Studio.
   O ID do cliente OAuth (não é segredo, mas segue o padrão da chave do Firebase) NÃO fica no código: o porteiro troca o marcador
   __YOUTUBE_CLIENT_ID__ pelo segredo YOUTUBE_CLIENT_ID do Worker (posto pela Action "Publicar o porteiro" a partir do segredo do GitHub).
   Como um programa usa (veja também o CLAUDE.md, seção "PUBLICAR NO YOUTUBE"):
     EstudioYouTube.pode('animador')  → true se a pessoa pode exportar E publicar nesse programa (níveis de acesso)
     EstudioYouTube.abrir({ blob, nome, titulo, descricao, programa: 'animador' })  → abre a janela; sem blob, pede o arquivo
   Carregar sob demanda: EstudioYouTube.carregar() não existe antes do arquivo, então use o carregador de 3 linhas do CLAUDE.md. */
(() => {
  if (window.EstudioYouTube) return;
  const CLIENTE = '__YOUTUBE_CLIENT_ID__';
  const ESCOPOS = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
  const CHAVE_CANAL = 'ep-youtube-canal';
  const API = 'https://www.googleapis.com/youtube/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
  const configurado = () => /\.apps\.googleusercontent\.com$/.test(CLIENTE);

  const pode = prog => ['exportar', 'publicar'].every(k => { try { return window.EstudioPerm?.pode?.(`${prog}.${k}`) ?? true; } catch { return true; } });

  // ---------- canal padrão (só neste navegador) ----------
  const lerPadrao = () => { try { const c = JSON.parse(localStorage.getItem(CHAVE_CANAL) || 'null'); return c && c.id ? c : null; } catch { return null; } };
  const gravarPadrao = c => { try { localStorage.setItem(CHAVE_CANAL, JSON.stringify({ id: c.id, nome: c.nome, foto: c.foto || '' })); } catch { } };

  // ---------- Google Identity Services ----------
  let gisP = null;
  const carregaGis = () => gisP || (gisP = new Promise((ok, ruim) => {
    if (window.google?.accounts?.oauth2) return ok();
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => ok(); s.onerror = () => { gisP = null; ruim(new Error('Não consegui abrir o login do Google (sem internet ou bloqueado por alguma extensão).')); };
    document.head.appendChild(s);
  }));
  let tok = null; // { token, ate, canal } só na memória desta aba
  const pedeToken = async escolher => {
    await carregaGis();
    return new Promise((ok, ruim) => {
      const cli = google.accounts.oauth2.initTokenClient({
        client_id: CLIENTE, scope: ESCOPOS, include_granted_scopes: false,
        callback: r => {
          if (r.error) return ruim(new Error(r.error === 'access_denied' ? 'A permissão do YouTube não foi dada.' : 'O Google recusou: ' + (r.error_description || r.error)));
          if (!google.accounts.oauth2.hasGrantedAllScopes(r, ...ESCOPOS.split(' '))) return ruim(new Error('É preciso marcar as duas permissões do YouTube (enviar vídeos e ver o canal) na tela do Google.'));
          ok({ token: r.access_token, ate: Date.now() + (r.expires_in - 120) * 1000 });
        },
        error_callback: e => ruim(new Error(e?.type === 'popup_closed' ? 'A janela do Google foi fechada antes de terminar.' : e?.type === 'popup_failed_to_open' ? 'O navegador bloqueou a janela do Google. Libere as janelas (pop-ups) deste site e tente de novo.' : 'O login do Google não terminou.'))
      });
      cli.requestAccessToken({ prompt: escolher ? 'select_account' : '' });
    });
  };
  const api = async (t, caminho) => {
    const r = await fetch(API + caminho, { headers: { Authorization: 'Bearer ' + t } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw erroYT(r.status, j);
    return j;
  };
  const erroYT = (st, j) => {
    const motivo = j?.error?.errors?.[0]?.reason || j?.error?.status || '';
    const frase = {
      quotaExceeded: 'O limite de envios do dia do projeto do YouTube acabou. Volta a funcionar amanhã (o Google zera à meia-noite do horário do Pacífico, por volta das 4h/5h de Brasília).',
      uploadLimitExceeded: 'Este canal chegou ao limite de vídeos enviados hoje que o YouTube permite. Tente amanhã.',
      youtubeSignupRequired: 'Essa conta do Google ainda não tem canal no YouTube. Crie o canal no youtube.com (ou escolha outra conta/canal) e tente de novo.',
      forbidden: 'Essa conta não tem permissão para enviar vídeos nesse canal. Quem só tem acesso pelo YouTube Studio (gerente/editor do canal) não consegue enviar por aqui: precisa ser proprietário ou administrador da conta de marca.',
      insufficientPermissions: 'Faltou a permissão do YouTube. Clique em "Trocar" e marque as permissões na tela do Google.',
      accessNotConfigured: 'A YouTube Data API v3 ainda não foi ativada no Google Cloud do Estúdio (passo da dona).',
      invalidTitle: 'O título não foi aceito pelo YouTube (sem os sinais < e >, até 100 letras).',
      invalidDescription: 'A descrição não foi aceita pelo YouTube (sem os sinais < e >, até 5.000 letras).'
    }[motivo];
    const e = new Error(frase || (st === 401 ? 'O acesso ao YouTube venceu. Tente de novo (o Google pede de novo se precisar).' : `O YouTube respondeu ${st}${j?.error?.message ? ': ' + j.error.message : ''}.`));
    e.status = st; e.motivo = motivo; return e;
  };
  const canalDoToken = async t => {
    const j = await api(t, '/channels?part=snippet&mine=true');
    const c = j.items?.[0];
    if (!c) throw erroYT(403, { error: { errors: [{ reason: 'youtubeSignupRequired' }] } });
    return { id: c.id, nome: c.snippet?.title || 'Canal sem nome', foto: c.snippet?.thumbnails?.default?.url || '' };
  };
  // token válido + canal dele (escolher = abre a escolha de conta/canal do Google)
  const entrar = async escolher => {
    if (!escolher && tok && tok.ate > Date.now()) return tok;
    const t = await pedeToken(escolher || !lerPadrao());
    t.canal = await canalDoToken(t.token);
    return (tok = t);
  };

  // ---------- envio resumível ----------
  const iniciaEnvio = async (t, blob, meta) => {
    const r = await fetch(UPLOAD, { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(blob.size), 'X-Upload-Content-Type': blob.type || 'video/mp4' }, body: JSON.stringify(meta) });
    if (!r.ok) throw erroYT(r.status, await r.json().catch(() => ({})));
    const onde = r.headers.get('Location');
    if (!onde) throw new Error('O YouTube não devolveu o endereço do envio.');
    return onde;
  };
  const xhr = (metodo, url, t, corpo, cab, prog) => new Promise((ok, ruim) => {
    const x = new XMLHttpRequest(); x.open(metodo, url); x.setRequestHeader('Authorization', 'Bearer ' + t);
    for (const k in cab) x.setRequestHeader(k, cab[k]);
    if (prog) x.upload.onprogress = e => prog(e.loaded);
    x.onload = () => ok(x); x.onerror = () => ruim(Object.assign(new Error('rede'), { rede: true })); x.onabort = () => ruim(new Error('cancelado'));
    enviando = x; x.send(corpo);
  });
  let enviando = null;
  // quanto o YouTube já recebeu (308 + Range: bytes=0-N)
  const jaFoi = async (onde, t, total) => {
    const x = await xhr('PUT', onde, t, null, { 'Content-Range': `bytes */${total}` });
    if (x.status === 200 || x.status === 201) return { pronto: JSON.parse(x.responseText) };
    if (x.status === 308) { const m = /bytes=0-(\d+)/.exec(x.getResponseHeader('Range') || ''); return { de: m ? +m[1] + 1 : 0 }; }
    throw erroYT(x.status, safeJson(x.responseText));
  };
  const safeJson = s => { try { return JSON.parse(s); } catch { return {}; } };
  const envia = async (t, blob, meta, prog) => {
    const onde = await iniciaEnvio(t, blob, meta), total = blob.size; let de = 0;
    for (let tent = 0; tent < 8; tent++) {
      try {
        const x = await xhr('PUT', onde, t, de ? blob.slice(de) : blob, { 'Content-Range': `bytes ${de}-${total - 1}/${total}`, 'Content-Type': blob.type || 'video/mp4' }, n => prog((de + n) / total));
        if (x.status === 200 || x.status === 201) return JSON.parse(x.responseText);
        if (x.status < 500 && x.status !== 308) throw erroYT(x.status, safeJson(x.responseText));
      } catch (e) { if (!e.rede && !(e.status >= 500)) throw e; }
      // caiu: espera um pouco, pergunta quanto chegou e continua de lá
      await new Promise(r => setTimeout(r, Math.min(30000, 1000 * 2 ** tent)));
      try { const q = await jaFoi(onde, t, total); if (q.pronto) return q.pronto; de = q.de; prog(de / total); } catch (e) { if (!e.rede && !(e.status >= 500)) throw e; }
    }
    throw new Error('A internet caiu várias vezes e o envio não terminou. Tente de novo.');
  };

  // ---------- janela ----------
  const CSS = `
.ep-yt-fundo{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#f2f2f4}
.ep-yt{width:min(520px,100%);max-height:calc(100vh - 32px);overflow:auto;background:rgba(30,30,34,.97);border:1px solid rgba(255,255,255,.12);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.55);padding:18px 20px}
.ep-yt h3{margin:0 0 14px;font-size:16px;display:flex;align-items:center;gap:8px}
.ep-yt h3 svg{color:#ff3b30}
.ep-yt label{display:block;font-size:12px;color:#a1a1aa;margin:12px 0 4px}
.ep-yt input[type=text],.ep-yt textarea{width:100%;box-sizing:border-box;background:#141417;border:1px solid rgba(255,255,255,.14);border-radius:8px;color:inherit;font:inherit;padding:8px 10px}
.ep-yt textarea{min-height:90px;resize:vertical}
.ep-yt input:focus,.ep-yt textarea:focus{outline:2px solid #0a84ff;outline-offset:-1px}
.ep-yt .canal{display:flex;align-items:center;gap:10px;background:#141417;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px 10px}
.ep-yt .canal img,.ep-yt .canal .sem{width:32px;height:32px;border-radius:50%;flex:none;background:#2c2c31}
.ep-yt .canal b{display:block;font-weight:600}.ep-yt .canal small{color:#a1a1aa}
.ep-yt .canal .esp{flex:1;min-width:0}
.ep-yt .btn{border:0;border-radius:8px;padding:7px 14px;font:inherit;font-weight:500;cursor:pointer;background:rgba(255,255,255,.1);color:inherit}
.ep-yt .btn:hover{background:rgba(255,255,255,.16)}.ep-yt .btn:disabled{opacity:.5;cursor:default}
.ep-yt .btn.pri{background:#0a84ff;color:#fff}.ep-yt .btn.pri:hover{background:#2d96ff}
.ep-yt .opc{display:flex;gap:14px;flex-wrap:wrap}.ep-yt .opc label{display:flex;gap:6px;align-items:center;margin:0;color:inherit;font-size:13px}
.ep-yt .nota{font-size:12px;color:#a1a1aa;margin-top:10px}
.ep-yt .rodape{display:flex;justify-content:flex-end;gap:8px;margin-top:18px;flex-wrap:wrap}
.ep-yt .barra{height:6px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden;margin:14px 0 6px}.ep-yt .barra i{display:block;height:100%;width:0;background:#fff;transition:width .2s}
.ep-yt .erro{background:rgba(255,69,58,.14);border:1px solid rgba(255,69,58,.4);border-radius:8px;padding:8px 10px;margin-top:12px}
.ep-yt .ok{background:rgba(48,209,88,.12);border:1px solid rgba(48,209,88,.4);border-radius:8px;padding:10px;margin-top:4px}
.ep-yt .ok a{color:#64d2ff;word-break:break-all}
.ep-yt .conta{font-variant-numeric:tabular-nums;color:#a1a1aa;font-size:12px;float:right}`;
  const IC_YT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const limpaTitulo = s => String(s || '').replace(/[<>]/g, '').replace(/\.(mp4|webm|mov)$/i, '').trim().slice(0, 100);
  const mb = n => { const m = n / 1048576; return (m < 10 ? m.toFixed(1).replace('.', ',') : Math.round(m)) + ' MB'; };
  let aberta = null;

  function abrir(o = {}) {
    if (aberta) return aberta.promessa;
    if (!document.getElementById('ep-yt-css')) { const st = document.createElement('style'); st.id = 'ep-yt-css'; st.textContent = CSS; document.head.appendChild(st); }
    let blob = o.blob || null, fase = 'form', resolve; const promessa = new Promise(r => resolve = r);
    const fundo = document.createElement('div'); fundo.className = 'ep-yt-fundo';
    fundo.innerHTML = `<div class="ep-yt" role="dialog" aria-modal="true" aria-label="Publicar no YouTube"><h3>${IC_YT} Publicar no YouTube</h3><div data-corpo></div></div>`;
    document.body.appendChild(fundo);
    const corpo = fundo.querySelector('[data-corpo]');
    const fechar = res => { if (fase === 'enviando') return; fundo.remove(); removeEventListener('keydown', tecla, true); aberta = null; resolve(res || null); };
    const tecla = e => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } };
    addEventListener('keydown', tecla, true);
    fundo.addEventListener('mousedown', e => { if (e.target === fundo) fechar(); });
    aberta = { promessa };

    if (!configurado()) {
      corpo.innerHTML = `<p>A publicação no YouTube ainda não foi ligada no Estúdio.</p><p class="nota">Falta a dona terminar a parte do Google Cloud (ativar a API do YouTube e criar o cliente OAuth) e pôr o ID do cliente no segredo <b>YOUTUBE_CLIENT_ID</b> do GitHub. Enquanto isso, baixe o vídeo e envie pelo YouTube Studio.</p><div class="rodape"><button class="btn pri" data-f>Entendi</button></div>`;
      corpo.querySelector('[data-f]').onclick = () => fechar(); return promessa;
    }

    carregaGis().catch(() => { }); // já deixa o login do Google pronto (a janela dele precisa abrir logo depois do clique)
    let canal = lerPadrao(), erroMsg = '';
    const st = { titulo: limpaTitulo(o.titulo || o.nome || ''), desc: String(o.descricao || '').replace(/[<>]/g, '').slice(0, 5000), kids: null };

    const pintaForm = () => {
      corpo.innerHTML = `
        <label>Canal</label>
        <div class="canal">${canal ? (canal.foto ? `<img src="${esc(canal.foto)}" alt="" referrerpolicy="no-referrer">` : '<span class="sem"></span>') + `<div class="esp"><b>${esc(canal.nome)}</b><small>Canal padrão deste navegador</small></div><button class="btn" data-trocar>Trocar</button>`
          : `<div class="esp"><b>Nenhum canal escolhido</b><small>O Google vai perguntar a conta e o canal (contas com mais de um canal escolhem ali).</small></div><button class="btn pri" data-trocar>Escolher</button>`}</div>
        ${blob ? `<div class="nota">Vídeo: <b>${esc(o.nome || 'vídeo')}</b> · ${mb(blob.size)}</div>` : `<label>Vídeo</label><input type="file" accept="video/*" data-arq>`}
        <label>Título <span class="conta" data-ct></span></label><input type="text" maxlength="100" data-tit value="${esc(st.titulo)}">
        <label>Descrição</label><textarea maxlength="5000" data-desc>${esc(st.desc)}</textarea>
        <label>É feito para crianças? (o YouTube exige essa resposta)</label>
        <div class="opc"><label><input type="radio" name="ep-yt-kids" value="nao"${st.kids === false ? ' checked' : ''}> Não, não é para crianças</label><label><input type="radio" name="ep-yt-kids" value="sim"${st.kids === true ? ' checked' : ''}> Sim, é para crianças</label></div>
        <div class="nota">Sobe como <b>Não listado</b>: só quem tiver o link vê. Dá para mudar depois no YouTube Studio.</div>
        ${erroMsg ? `<div class="erro">${esc(erroMsg)}</div>` : ''}
        <div class="rodape"><button class="btn" data-f>Cancelar</button><button class="btn pri" data-pub>Publicar não listado</button></div>`;
      const $ = s => corpo.querySelector(s), tit = $('[data-tit]'), ct = $('[data-ct]');
      const conta = () => { ct.textContent = `${tit.value.length}/100`; };
      tit.oninput = () => { st.titulo = tit.value; conta(); }; conta();
      $('[data-desc]').oninput = e => { st.desc = e.target.value; };
      corpo.querySelectorAll('[name=ep-yt-kids]').forEach(r => r.onchange = () => { st.kids = r.value === 'sim'; });
      const arq = $('[data-arq]'); if (arq) arq.onchange = () => { blob = arq.files[0] || null; if (blob && !st.titulo) { st.titulo = limpaTitulo(blob.name); tit.value = st.titulo; conta(); } o.nome = blob?.name; };
      $('[data-f]').onclick = () => fechar();
      $('[data-trocar]').onclick = async e => {
        e.target.disabled = true; erroMsg = '';
        try { const t = await entrar(true); canal = t.canal; gravarPadrao(canal); } catch (er) { erroMsg = er.message; }
        pintaForm();
      };
      $('[data-pub]').onclick = () => publicar();
      if (!blob && arq) arq.focus(); else tit.focus();
    };

    // confirma o canal do token com o padrão (o Google pode ter entrado em outra conta/canal)
    const confirmaCanal = c => new Promise(ok => {
      corpo.innerHTML = `<p>${canal ? `O Google entrou no canal <b>${esc(c.nome)}</b>, mas o padrão deste navegador é <b>${esc(canal.nome)}</b>.` : `Publicar no canal <b>${esc(c.nome)}</b>?`}</p>
        <div class="canal">${c.foto ? `<img src="${esc(c.foto)}" alt="" referrerpolicy="no-referrer">` : '<span class="sem"></span>'}<div class="esp"><b>${esc(c.nome)}</b><small>Vira o canal padrão deste navegador</small></div></div>
        <div class="rodape"><button class="btn" data-n>Escolher outro canal</button><button class="btn pri" data-s>Publicar em ${esc(c.nome)}</button></div>`;
      corpo.querySelector('[data-s]').onclick = () => ok('sim'); corpo.querySelector('[data-n]').onclick = () => ok('outro');
    });

    const publicar = async () => {
      erroMsg = '';
      if (!blob) { erroMsg = 'Escolha o arquivo do vídeo.'; return pintaForm(); }
      st.titulo = limpaTitulo(st.titulo); if (!st.titulo) { erroMsg = 'Escreva um título.'; return pintaForm(); }
      if (st.kids === null) { erroMsg = 'Responda se o vídeo é feito para crianças.'; return pintaForm(); }
      corpo.innerHTML = '<p>Abrindo o login do Google…</p><p class="nota">Se nada aparecer, libere as janelas (pop-ups) deste site.</p>';
      let t;
      try {
        t = await entrar(!canal);
        while (!canal || t.canal.id !== canal.id) {
          const r = await confirmaCanal(t.canal);
          if (r === 'sim') break;
          corpo.innerHTML = '<p>Escolha a conta e o canal na janela do Google…</p>'; t = await entrar(true);
        }
        canal = t.canal; gravarPadrao(canal);
      } catch (e) { erroMsg = e.message; return pintaForm(); }
      fase = 'enviando';
      const sair = e => { e.preventDefault(); e.returnValue = ''; }; addEventListener('beforeunload', sair);
      corpo.innerHTML = `<p>Enviando <b>${esc(st.titulo)}</b> para <b>${esc(canal.nome)}</b>…</p><div class="barra"><i></i></div><div class="nota"><span data-pp>0%</span> · <span data-pt>começando</span></div><p class="nota">Não feche esta aba até terminar.</p><div class="rodape"><button class="btn" data-c>Cancelar o envio</button></div>`;
      const barra = corpo.querySelector('.barra i'), pp = corpo.querySelector('[data-pp]'), pt = corpo.querySelector('[data-pt]'), t0 = performance.now();
      let cancelou = false; corpo.querySelector('[data-c]').onclick = e => { cancelou = true; e.target.disabled = true; enviando?.abort(); };
      const prog = f => { barra.style.width = (f * 100).toFixed(1) + '%'; pp.textContent = Math.floor(f * 100) + '%'; const s = (performance.now() - t0) / 1000; pt.textContent = `${mb(f * blob.size)} de ${mb(blob.size)}${f > .03 && f < 1 ? ` · falta cerca de ${Math.max(1, Math.round((s / f - s) / 60))} min` : ''}`; };
      try {
        const v = await envia(t.token, blob, { snippet: { title: st.titulo, description: st.desc, categoryId: '1' }, status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: st.kids } }, prog);
        fase = 'fim'; removeEventListener('beforeunload', sair);
        const link = `https://youtu.be/${v.id}`, studio = `https://studio.youtube.com/video/${v.id}/edit`;
        corpo.innerHTML = `<div class="ok"><b>Publicado como não listado em ${esc(canal.nome)}.</b><br><a href="${link}" target="_blank" rel="noopener">${link}</a></div>
          <p class="nota">O YouTube ainda processa o vídeo por alguns minutos (a qualidade alta aparece depois). Miniatura, legenda e outros detalhes: <a href="${studio}" target="_blank" rel="noopener" style="color:#64d2ff">abrir no YouTube Studio</a>.</p>
          <div class="rodape"><button class="btn" data-cp>Copiar o link</button><button class="btn pri" data-f>Fechar</button></div>`;
        corpo.querySelector('[data-cp]').onclick = e => { navigator.clipboard?.writeText(link).then(() => { e.target.textContent = 'Link copiado'; }, () => { }); };
        corpo.querySelector('[data-f]').onclick = () => fechar({ id: v.id, link, canal: canal.id });
      } catch (e) {
        fase = 'form'; removeEventListener('beforeunload', sair);
        if (e.status === 401) tok = null;
        erroMsg = cancelou || e.message === 'cancelado' ? 'Envio cancelado. Nada ficou publicado (o YouTube descarta o envio pela metade).' : e.message;
        pintaForm();
      }
    };
    pintaForm();
    return promessa;
  }

  window.EstudioYouTube = { abrir, pode, configurado, canalPadrao: lerPadrao, esquecerCanal: () => { try { localStorage.removeItem(CHAVE_CANAL); } catch { } tok = null; } };
})();
