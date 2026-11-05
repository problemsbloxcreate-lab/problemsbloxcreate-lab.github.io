/* YOUTUBE do Estúdio Problems (pedido da dona, 05/11/2026) — global EstudioYouTube. Usado pelo programa PUBLICAÇÕES (/publicacoes/)
   e pelos botões "Publicar no YouTube" dos outros programas.
   - Os programas (Animador, Shorts, Editor) só chamam EstudioYouTube.levar({ blob, nome, titulo, descricao, programa }) — com
     concluir: true e abrir: '/<programa>/…' é o "Marcar como concluído" (o Publicações põe em "Não publicados" para a equipe) —
     o vídeo fica no IndexedDB 'ep-publicacoes' (mesma origem, nada vai para a nuvem) e abre /publicacoes/?video=<id> numa aba nova.
   - O Publicações usa: entrar(escolher) → { token, canal } (Google Identity Services, token client, escopos youtube.upload e
     youtube.readonly; o token fica só na memória da aba), enviar(token, blob, meta, prog) (envio resumível da YouTube Data API v3,
     direto do navegador para o YouTube) e situacao(token, ids) (videos.list, 1 unidade de cota, só quando a pessoa pede).
   - Canal padrão deste navegador: localStorage `ep-youtube-canal` (id, nome, foto; sem e-mail).
   - NADA automático: cada envio sai de um clique da pessoa; sem envio em massa nem repetição sozinha (só retoma o MESMO envio se a rede cair).
   O ID do cliente OAuth NÃO fica no código: o porteiro troca __YOUTUBE_CLIENT_ID__ pelo segredo YOUTUBE_CLIENT_ID (veja o CLAUDE.md). */
(() => {
  if (window.EstudioYouTube) return;
  const CLIENTE = '__YOUTUBE_CLIENT_ID__';
  const ESCOPOS = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];
  const CHAVE_CANAL = 'ep-youtube-canal', API = 'https://www.googleapis.com/youtube/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
  const configurado = () => /\.apps\.googleusercontent\.com$/.test(CLIENTE);
  const pode = k => { try { return window.EstudioPerm?.pode?.(k) ?? true; } catch { return true; } };
  // o botão "Publicar no YouTube" de um programa: pode exportar nele E pode publicar no Publicações
  const podeLevar = prog => pode(prog + '.exportar') && pode('publicacoes.publicar');
  // "Marcar como concluído": pode exportar no programa e ver o Publicações (o projeto aparece em "Não publicados" para a equipe)
  const podeConcluir = prog => pode(prog + '.exportar') && pode('publicacoes.ver');

  // ---------- passar o vídeo para o Publicações (IndexedDB da mesma origem) ----------
  const DB = 'ep-publicacoes', ST = 'videos';
  const abreDb = () => new Promise((ok, ruim) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' }); r.onsuccess = () => ok(r.result); r.onerror = () => ruim(r.error || new Error('O navegador não deixou guardar o vídeo.')); });
  const tx = async (modo, fn) => { const db = await abreDb(); return new Promise((ok, ruim) => { const t = db.transaction(ST, modo), r = fn(t.objectStore(ST)); t.oncomplete = () => { db.close(); ok(r?.result); }; t.onerror = t.onabort = () => { db.close(); ruim(t.error || new Error('Falha no IndexedDB.')); }; }); };
  const fila = {
    pega: id => tx('readonly', s => s.get(id)),
    todos: () => tx('readonly', s => s.getAll()),
    tira: id => tx('readwrite', s => s.delete(id)),
    poe: v => tx('readwrite', s => s.put(v)),
  };
  async function levar(o = {}) {
    if (!o.blob) throw new Error('Sem o vídeo exportado.');
    const id = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    // a aba abre JÁ (o navegador só deixa abrir janela logo depois do clique); o endereço vem quando o vídeo estiver guardado
    const w = window.open('about:blank', '_blank');
    try {
      await fila.poe({ id, blob: o.blob, nome: String(o.nome || 'video.mp4'), titulo: String(o.titulo || '').slice(0, 100), descricao: String(o.descricao || '').slice(0, 5000), programa: String(o.programa || ''), em: Date.now(), ...(o.concluir ? { concluir: true, abrir: /^\/[A-Za-z0-9/_?=&.%-]{0,200}$/.test(o.abrir || '') ? o.abrir : '' } : {}) });
    } catch (e) { try { w?.close(); } catch { } throw e; }
    const url = '/publicacoes/?video=' + id;
    if (w && !w.closed) { w.location.href = url; return id; }
    // janela bloqueada: o vídeo já está guardado e aparece em "Esperando publicação" quando o Publicações abrir
    throw new Error('O navegador bloqueou a aba nova. O vídeo ficou guardado: abra o Publicações pelo menu (ou libere as janelas deste site).');
  }

  // ---------- canal padrão (só neste navegador) ----------
  const canalPadrao = () => { try { const c = JSON.parse(localStorage.getItem(CHAVE_CANAL) || 'null'); return c && c.id ? c : null; } catch { return null; } };
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
    if (!configurado()) throw new Error('A publicação no YouTube ainda não foi ligada no Estúdio (falta a dona terminar a parte do Google Cloud e pôr o segredo YOUTUBE_CLIENT_ID).');
    await carregaGis();
    return new Promise((ok, ruim) => {
      const cli = google.accounts.oauth2.initTokenClient({
        client_id: CLIENTE, scope: ESCOPOS.join(' '),
        callback: r => {
          if (r.error) return ruim(new Error(r.error === 'access_denied' ? 'A permissão do YouTube não foi dada.' : 'O Google recusou: ' + (r.error_description || r.error)));
          if (!google.accounts.oauth2.hasGrantedAllScopes(r, ...ESCOPOS)) return ruim(new Error('É preciso marcar as duas permissões do YouTube (enviar vídeos e ver o canal) na tela do Google.'));
          ok({ token: r.access_token, ate: Date.now() + (r.expires_in - 120) * 1000 });
        },
        error_callback: e => ruim(new Error(e?.type === 'popup_closed' ? 'A janela do Google foi fechada antes de terminar.' : e?.type === 'popup_failed_to_open' ? 'O navegador bloqueou a janela do Google. Libere as janelas (pop-ups) deste site e tente de novo.' : 'O login do Google não terminou.'))
      });
      cli.requestAccessToken({ prompt: escolher ? 'select_account' : '' });
    });
  };
  const erroYT = (st, j) => {
    const motivo = j?.error?.errors?.[0]?.reason || j?.error?.status || '';
    const frase = {
      quotaExceeded: 'O limite de envios do dia do projeto do YouTube acabou. Volta a funcionar amanhã (o Google zera à meia-noite do horário do Pacífico, por volta das 4h/5h de Brasília).',
      uploadLimitExceeded: 'Este canal chegou ao limite de vídeos enviados hoje que o YouTube permite. Tente amanhã.',
      youtubeSignupRequired: 'Essa conta do Google ainda não tem canal no YouTube. Crie o canal no youtube.com (ou escolha outra conta/canal) e tente de novo.',
      forbidden: 'Essa conta não tem permissão para enviar vídeos nesse canal. Quem só tem acesso pelo YouTube Studio (gerente/editor do canal) não consegue enviar por aqui: precisa ser proprietário ou administrador da conta de marca.',
      insufficientPermissions: 'Faltou a permissão do YouTube. Clique em "Trocar canal" e marque as permissões na tela do Google.',
      accessNotConfigured: 'A YouTube Data API v3 ainda não foi ativada no Google Cloud do Estúdio (passo da dona).',
      invalidTitle: 'O título não foi aceito pelo YouTube (sem os sinais < e >, até 100 letras).',
      invalidDescription: 'A descrição não foi aceita pelo YouTube (sem os sinais < e >, até 5.000 letras).',
      invalidPublishAt: 'A data de agendamento não foi aceita: escolha uma hora no futuro.'
    }[motivo];
    const e = new Error(frase || (st === 401 ? 'O acesso ao YouTube venceu. Tente de novo (o Google pede de novo se precisar).' : `O YouTube respondeu ${st}${j?.error?.message ? ': ' + j.error.message : ''}.`));
    e.status = st; e.motivo = motivo; return e;
  };
  const api = async (t, caminho) => {
    const r = await fetch(API + caminho, { headers: { Authorization: 'Bearer ' + t } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status === 401) tok = null; throw erroYT(r.status, j); }
    return j;
  };
  const canalDoToken = async t => {
    const c = (await api(t, '/channels?part=snippet&mine=true')).items?.[0];
    if (!c) throw erroYT(403, { error: { errors: [{ reason: 'youtubeSignupRequired' }] } });
    return { id: c.id, nome: c.snippet?.title || 'Canal sem nome', foto: c.snippet?.thumbnails?.default?.url || '' };
  };
  // token válido + o canal dele. escolher = abre a escolha de conta/canal do Google (só os canais da PRÓPRIA conta da pessoa)
  const entrar = async escolher => {
    if (!escolher && tok && tok.ate > Date.now()) return tok;
    const t = await pedeToken(escolher || !canalPadrao());
    t.canal = await canalDoToken(t.token);
    return (tok = t);
  };

  // ---------- envio resumível ----------
  let atual = null; const cancelar = () => atual?.abort();
  const xhr = (metodo, url, t, corpo, cab, prog) => new Promise((ok, ruim) => {
    const x = new XMLHttpRequest(); x.open(metodo, url); x.setRequestHeader('Authorization', 'Bearer ' + t);
    for (const k in cab) x.setRequestHeader(k, cab[k]);
    if (prog) x.upload.onprogress = e => prog(e.loaded);
    x.onload = () => ok(x); x.onerror = () => ruim(Object.assign(new Error('rede'), { rede: true })); x.onabort = () => ruim(new Error('cancelado'));
    atual = x; x.send(corpo);
  });
  const jsonDe = s => { try { return JSON.parse(s); } catch { return {}; } };
  /* meta = { titulo, descricao, criancas (true/false), modo: 'naoListado' | 'agora' | 'agendado', publicaEm (ms, só no agendado) } */
  async function enviar(t, blob, meta, prog = () => { }) {
    const status = { selfDeclaredMadeForKids: !!meta.criancas, privacyStatus: meta.modo === 'agora' ? 'public' : meta.modo === 'agendado' ? 'private' : 'unlisted' };
    if (meta.modo === 'agendado') { if (!(meta.publicaEm > Date.now() + 60e3)) throw erroYT(400, { error: { errors: [{ reason: 'invalidPublishAt' }] } }); status.publishAt = new Date(meta.publicaEm).toISOString(); }
    const corpo = { snippet: { title: String(meta.titulo || '').replace(/[<>]/g, '').slice(0, 100), description: String(meta.descricao || '').replace(/[<>]/g, '').slice(0, 5000), categoryId: '1' }, status };
    const r = await fetch(UPLOAD, { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(blob.size), 'X-Upload-Content-Type': blob.type || 'video/mp4' }, body: JSON.stringify(corpo) });
    if (!r.ok) throw erroYT(r.status, await r.json().catch(() => ({})));
    const onde = r.headers.get('Location'); if (!onde) throw new Error('O YouTube não devolveu o endereço do envio.');
    const total = blob.size; let de = 0;
    for (let tent = 0; tent < 8; tent++) {
      try {
        const x = await xhr('PUT', onde, t, de ? blob.slice(de) : blob, { 'Content-Range': `bytes ${de}-${total - 1}/${total}`, 'Content-Type': blob.type || 'video/mp4' }, n => prog((de + n) / total));
        if (x.status === 200 || x.status === 201) return jsonDe(x.responseText);
        if (x.status < 500 && x.status !== 308) throw erroYT(x.status, jsonDe(x.responseText));
      } catch (e) { if (!e.rede && !(e.status >= 500)) throw e; }
      // a rede caiu: espera, pergunta quanto o YouTube já recebeu e continua DESTE MESMO envio (não é um envio novo)
      await new Promise(ok => setTimeout(ok, Math.min(30000, 1000 * 2 ** tent)));
      try {
        const x = await xhr('PUT', onde, t, null, { 'Content-Range': `bytes */${total}` });
        if (x.status === 200 || x.status === 201) return jsonDe(x.responseText);
        if (x.status === 308) { const m = /bytes=0-(\d+)/.exec(x.getResponseHeader('Range') || ''); de = m ? +m[1] + 1 : 0; prog(de / total); }
        else if (x.status < 500) throw erroYT(x.status, jsonDe(x.responseText));
      } catch (e) { if (!e.rede && !(e.status >= 500)) throw e; }
    }
    throw new Error('A internet caiu várias vezes e o envio não terminou. Tente de novo.');
  }
  // situação de vídeos do canal da pessoa (até 50 por pedido, 1 unidade de cota): { id: { privacidade, publicaEm, titulo } }
  async function situacao(t, ids) {
    const out = {};
    for (let i = 0; i < ids.length; i += 50) {
      const j = await api(t, '/videos?part=status,snippet&id=' + ids.slice(i, i + 50).map(encodeURIComponent).join(','));
      for (const v of j.items || []) out[v.id] = { privacidade: v.status?.privacyStatus, publicaEm: v.status?.publishAt ? Date.parse(v.status.publishAt) : null, titulo: v.snippet?.title, upload: v.status?.uploadStatus };
    }
    return out;
  }

  window.EstudioYouTube = { configurado, pode, podeLevar, podeConcluir, levar, fila, canalPadrao, gravarPadrao, entrar, enviar, cancelar, situacao, carregaGis,
    esquecerCanal: () => { try { localStorage.removeItem(CHAVE_CANAL); } catch { } tok = null; } };
})();
