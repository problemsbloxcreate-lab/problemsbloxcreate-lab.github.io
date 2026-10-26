// ANÁLISE DE CANAIS para a aba "Ideias" do Animador (Estúdio Problems).
// Lê os canais (KV EQUIPE "ideias/canais.json"; sem nada = @Torajo e @TurmaDaBatatinha), baixa do YouTube as páginas
// públicas (vídeos e shorts recentes e populares + o RSS com os números exatos dos últimos 15), calcula o que está "indo bem"
// (views ÷ mediana do canal, separando vídeo longo e short) e grava o resumo em "ideias/analise.json" na nuvem da equipe.
// Roda na Action "Analisar canais" (todo dia e pelo botão Atualizar da aba Ideias). Sem e-mails nem chaves no resultado.
import fs from 'node:fs';
const API = 'https://api.cloudflare.com/client/v4', { T1, A1, SAIDA } = process.env;
const aviso = m => console.log('::warning::' + m), nota = m => console.log('::notice::' + m);
const H = { 'accept-language': 'pt-BR,pt;q=0.9', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', cookie: 'SOCS=CAI; CONSENT=YES+1' };
const cf = (c, o = {}) => fetch(API + c, { ...o, headers: { authorization: 'Bearer ' + T1, ...(o.headers || {}) } });
let ns = null;
if (T1 && A1) { const st = await (await cf(`/accounts/${A1}/workers/scripts/turma-ia/settings`)).json().catch(() => ({})); ns = (st.result?.bindings || []).find(b => b.name === 'EQUIPE')?.namespace_id || null; if (!ns) aviso('Não achei o KV EQUIPE do turma-ia.'); }
const kvGet = async k => { if (!ns) return null; const r = await cf(`/accounts/${A1}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(k)}`); return r.ok ? r.text() : null; };
const kvPut = async (k, v) => { const fd = new FormData(); fd.append('value', v); fd.append('metadata', JSON.stringify({ tipo: 'application/json', tam: v.length, mod: Date.now(), por: 'robô', em: new Date().toISOString() }));
  const r = await cf(`/accounts/${A1}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(k)}`, { method: 'PUT', body: fd }); if (!r.ok) throw new Error('A nuvem recusou (' + r.status + '): ' + (await r.text()).slice(0, 200)); };

// ---------- leitura das páginas do YouTube ----------
const dados = html => { const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } };
const acha = (o, k, out = []) => { if (o && typeof o === 'object') { if (Array.isArray(o)) for (const v of o) acha(v, k, out); else { if (k in o) out.push(o[k]); for (const v of Object.values(o)) acha(v, k, out); } } return out; };
const numView = t => { t = String(t || '').toLowerCase().replace(/ /g, ' '); const m = t.match(/([\d.,]+)\s*(milh|mil|mi|bi|k|m|b)?/); if (!m) return 0; let n = m[1]; const s = m[2];
  n = s ? n.replace(/\./g, '').replace(',', '.') : n.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'); return Math.round((parseFloat(n) || 0) * ({ mil: 1e3, k: 1e3, mi: 1e6, milh: 1e6, m: 1e6, bi: 1e9, b: 1e9 }[s] || 1)); };
const diasDe = t => { const m = String(t || '').toLowerCase().match(/(\d+)\s*(segundo|minuto|hora|dia|semana|m[eê]s|meses|ano)/); if (!m) return null; const u = m[2]; return +m[1] * (/segundo|minuto|hora/.test(u) ? 0 : /dia/.test(u) ? 1 : /semana/.test(u) ? 7 : /m[eê]s|meses/.test(u) ? 30 : 365); };
const longos = d => acha(d, 'lockupViewModel').map(l => { const md = l.metadata?.lockupMetadataViewModel || {}, lab = acha(md, 'metadataParts').flat().map(p => p?.accessibilityLabel || p?.text?.content || '');
  const vis = lab.find(x => /visualiza|views/i.test(x)) || '', ida = lab.find(x => /h[áa]\s|ago|atr[áa]s/i.test(x)) || '', dur = acha(l.contentImage || {}, 'thumbnailBadgeViewModel').map(b => b.text).find(t => /^\d+(:\d+)+$/.test(t || '')) || null;
  return { id: l.contentId, titulo: md.title?.content || '', views: numView(vis), dias: diasDe(ida), dur }; }).filter(v => /^[\w-]{11}$/.test(v.id || '') && v.titulo);
const curtos = d => acha(d, 'shortsLockupViewModel').map(s => ({ id: s.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId || (String(s.entityId || '').match(/[\w-]{11}$/) || [])[0], titulo: s.overlayMetadata?.primaryText?.content || '', views: numView(s.overlayMetadata?.secondaryText?.content) })).filter(v => /^[\w-]{11}$/.test(v.id || '') && v.titulo);
const rss = xml => [...String(xml || '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({ id: (e.match(/<yt:videoId>([\w-]{11})</) || [])[1], em: (e.match(/<published>([^<]+)</) || [])[1], views: +((e.match(/views="(\d+)"/) || [])[1] || 0), short: /\/shorts\//.test(e),
  desc: ((e.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1] || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').slice(0, 280) }));
const pagina = async u => { const r = await fetch(u, { headers: H }); if (!r.ok) throw new Error(u + ' respondeu ' + r.status); return r.text(); };
// "Populares": o próprio YouTube manda a lista ordenada por views pelo botão de ordem (continuação do browse)
async function populares(d, html) {
  const re = /popular|em alta/i, it = acha(d, 'listItemViewModel').find(x => re.test(x?.title?.content || '')) || acha(d, 'chipViewModel').find(x => re.test(x?.text || '')); const tok = it && acha(it, 'continuationCommand')[0]?.token; if (!tok) return null;
  const ver = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1] || '2.20261026.01.00';
  const r = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: ver, hl: 'pt', gl: 'BR' } }, continuation: tok }) });
  return r.ok ? r.json() : null;
}
const mediana = a => { const v = a.map(x => x.views).filter(x => x > 0).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : 0; };
async function canal(h) {
  const base = `https://www.youtube.com/${h}`, home = await pagina(base), dh = dados(home), md = acha(dh, 'channelMetadataRenderer')[0] || {}, parts = acha(dh, 'metadataParts').flat().map(p => p?.text?.content || '').filter(Boolean);
  const out = { h, id: md.externalId || null, nome: md.title || h, desc: (md.description || '').slice(0, 500), inscritos: (parts.find(p => /inscrit|subscri/i.test(p)) || '').replace(/ /g, ' '), nVideos: (parts.find(p => /v[ií]deo/i.test(p)) || '').replace(/ /g, ' '), avatar: md.avatar?.thumbnails?.[0]?.url || null };
  const hv = await pagina(base + '/videos'), dv = dados(hv), hs = await pagina(base + '/shorts'), ds = dados(hs);
  const L = longos(dv), S = curtos(ds), PL = longos(await populares(dv, hv).catch(() => null) || {}), PS = curtos(await populares(ds, hs).catch(() => null) || {});
  const R = out.id ? rss(await pagina('https://www.youtube.com/feeds/videos.xml?channel_id=' + out.id).catch(() => '')) : [], porId = new Map(R.map(x => [x.id, x]));
  const junta = v => { const x = porId.get(v.id); if (x) { v.views = x.views || v.views; v.em = x.em; v.desc = x.desc; if (v.dias == null && x.em) v.dias = Math.max(0, Math.round((Date.now() - Date.parse(x.em)) / 864e5)); } return v; };
  L.forEach(junta); S.forEach(junta);
  // shorts mais novos do RSS que ainda não estão na página dos shorts
  for (const x of R) if (x.short && !S.some(s => s.id === x.id)) S.unshift({ id: x.id, titulo: '', views: x.views, em: x.em, desc: x.desc });
  const mL = mediana(L), mS = mediana(S), nota = (v, m) => m ? Math.round(v.views / m * 100) / 100 : 0;
  for (const v of L) v.nota = nota(v, mL); for (const v of S) v.nota = nota(v, mS); for (const v of PL) v.nota = nota(v, mL); for (const v of PS) v.nota = nota(v, mS);
  const bem = (a, m) => a.filter(v => v.views >= m * 1.15).sort((x, y) => y.nota - x.nota).slice(0, 12);
  Object.assign(out, { mediana: { longo: mL, short: mS }, longos: { recentes: L.slice(0, 30), populares: PL.slice(0, 20), bem: bem(L, mL) }, shorts: { recentes: S.slice(0, 48), populares: PS.slice(0, 24), bem: bem(S, mS) } });
  return out;
}
let canais = ['@Torajo', '@TurmaDaBatatinha']; try { const c = JSON.parse(await kvGet('ideias/canais.json') || 'null'); if (Array.isArray(c?.canais) && c.canais.length) canais = c.canais; } catch { }
canais = canais.map(c => String(c).trim()).filter(c => /^@[\w.\-]{3,40}$/.test(c)).slice(0, 8);
const res = { em: new Date().toISOString(), canais: [], erros: [] };
for (const h of canais) { try { const c = await canal(h); res.canais.push(c); nota(`${c.nome}: ${c.longos.recentes.length} vídeos, ${c.shorts.recentes.length} shorts, ${c.longos.populares.length}/${c.shorts.populares.length} populares`); } catch (e) { res.erros.push({ h, erro: String(e.message || e).slice(0, 200) }); aviso(h + ': ' + e.message); } }
const txt = JSON.stringify(res);
if (SAIDA) fs.writeFileSync(SAIDA, JSON.stringify(res, null, 1));
if (ns && res.canais.length) { await kvPut('ideias/analise.json', txt); nota(`Análise gravada (${Math.round(txt.length / 1024)} KB).`); } else if (!SAIDA) aviso('Nada foi gravado.');
