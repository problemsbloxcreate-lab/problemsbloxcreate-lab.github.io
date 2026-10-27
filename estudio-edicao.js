/* estudio-edicao.js — MOTOR DE EDIÇÃO comum do Estúdio Problems (Shorts e Animador usam o mesmo).
   Veio do programa SHORTS (site/index.html: "Dublagem automática", "Transcrição", PROTOCOLO DA DECUPAGEM e LEG_GERA) e virou
   funções sem tela: quem usa passa os dados (falas, áudio) e cuida da própria tela. Mudou aqui = muda nos dois programas.
   Nada de chave, senha ou e-mail aqui (o arquivo é servido aberto pelo porteiro).

   EstudioEdicao.voz       limpar, mapa (falas e pausas), tom, doisGrupos, divide, decupar, alinhar, apara, confere, corta
   EstudioEdicao.protocolo os números da decupagem + pausaEntre(a, b)
   EstudioEdicao.whisper   transcrever(buf, aoAndar) — Whisper no navegador (modelo servido pelo Shorts, guardado no IndexedDB)
   EstudioEdicao.legendas  gera, item, numeros, trocas, boa, aprende

   Fala (o que o programa passa): { quem, texto, nota?, partes?: [texto, ...] }  (partes = trechos da fala que viram cortes separados;
   sem partes, a fala inteira é um corte). Cortes: [[ini, fim], ...] em segundos no áudio, um por parte, na ordem das falas. */
(function (raiz) {
  'use strict';
  const V = '2026-10-26';

  /* ================= util ================= */
  const pct = (arr, p) => { const a = Array.from(arr).sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * p)))] || 0; };
  const toDb = v => 20 * Math.log10(Math.max(1e-9, v));
  function monoOf(buf) { const n = buf.length, o = new Float32Array(n), ch = buf.numberOfChannels; for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) o[i] += d[i] / ch; } return o; }
  function framesRms(x, hop) { const n = Math.floor(x.length / hop), e = new Float32Array(n); for (let f = 0; f < n; f++) { let q = 0; const o = f * hop; for (let i = 0; i < hop; i++) { const v = x[o + i]; q += v * v; } e[f] = Math.sqrt(q / hop); } return e; }
  const novoBuf = (dados, sr) => { const b = new AudioBuffer({ length: Math.max(1, dados.length), numberOfChannels: 1, sampleRate: sr }); b.copyToChannel(dados, 0); return b; };
  const nrm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const partesDe = f => (Array.isArray(f.partes) && f.partes.length ? f.partes : [f.texto]).map(String);

  /* ================= PROTOCOLO DA DECUPAGEM (decisão do dono) =================
     corte só com fala, folga pequena nas pontas, pausa curta e fixa entre falas, nada de buraco. */
  const protocolo = {
    antes: 0.03, depois: 0.08, mesmo: 0.10, troca: 0.15, reticencias: 0.40, pausa: 0.60, buraco: 0.30, silencioPonta: 0.25, porLetra: 0.035,
    /* pausa entre a fala a e a fala b ({quem, texto, nota}): travessão no fim = emenda; "(pausa)" = 0,6; reticências = 0,4; mesma pessoa 0,10; troca 0,15 */
    pausaEntre(a, b) {
      const ta = String(a.texto || '').trim(), tb = String(b.texto || '').trim(), nt = String(a.nota || '') + ' ' + ta;
      if (/\(pausa|\[pausa|pausa\)/i.test(nt)) return this.pausa;
      if (/[—–-]$/.test(ta)) return 0;
      if (/(\.\.\.|…)$/.test(ta) || /^(\.\.\.|…)/.test(tb)) return this.reticencias;
      return nrm(a.quem) === nrm(b.quem) ? this.mesmo : this.troca;
    },
  };

  /* ================= VOZ ================= */
  /* 1) limpar: porta de ruído suave, corte de graves, menos "embolado", mais presença, compressor, volume da fala em −18 dB e limite de pico */
  async function limpar(buf) {
    const sr = buf.sampleRate, x = monoOf(buf), hop = Math.max(1, Math.round(sr * 0.01)), E = framesRms(x, hop);
    const floor = Math.max(1e-5, pct(E, 0.1)), peak = Math.max(floor * 4, pct(E, 0.995)), thr = Math.max(floor * 2.4, peak * 0.025);
    const g = new Float32Array(x.length); let env = 0, gain = 1; const at = Math.exp(-1 / (sr * 0.004)), rl = Math.exp(-1 / (sr * 0.08));
    for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); env = a > env ? at * env + (1 - at) * a : rl * env + (1 - rl) * a; const tg = env >= thr ? 1 : Math.max(0.1, Math.pow(env / thr, 1.6)); gain += (tg - gain) * (tg > gain ? 0.01 : 0.0003); g[i] = x[i] * gain; }
    const oc = new OfflineAudioContext(1, g.length, sr), b = oc.createBuffer(1, g.length, sr); b.copyToChannel(g, 0); const src = oc.createBufferSource(); src.buffer = b;
    const f = (t, fr, q, gn) => { const n = oc.createBiquadFilter(); n.type = t; n.frequency.value = fr; if (q != null) n.Q.value = q; if (gn != null) n.gain.value = gn; return n; };
    const hp = f('highpass', 90, 0.7), hum = f('notch', 60, 8), mud = f('peaking', 280, 1, -2), pres = f('peaking', 3200, 0.9, 3), air = f('highshelf', 9000, null, 1.5);
    const cp = oc.createDynamicsCompressor(); cp.threshold.value = -26; cp.knee.value = 10; cp.ratio.value = 3.5; cp.attack.value = 0.005; cp.release.value = 0.16;
    src.connect(hp); hp.connect(hum); hum.connect(mud); mud.connect(pres); pres.connect(air); air.connect(cp); cp.connect(oc.destination); src.start();
    const y = (await oc.startRendering()).getChannelData(0);
    const E2 = framesRms(y, hop), sp = Array.from(E2).filter(v => v > thr * 0.6), rms = sp.length ? Math.sqrt(sp.reduce((a, v) => a + v * v, 0) / sp.length) : 0.05, kk = Math.pow(10, -18 / 20) / Math.max(1e-4, rms);
    let pk = 0; for (let i = 0; i < y.length; i++) { y[i] *= kk; pk = Math.max(pk, Math.abs(y[i])); }
    const lim = Math.pow(10, -1 / 20); if (pk > 0.7) for (let i = 0; i < y.length; i++) { const v = y[i], a = Math.abs(v); if (a > 0.7) y[i] = Math.sign(v) * (0.7 + (lim - 0.7) * Math.tanh((a - 0.7) / (lim - 0.7))); }
    return { buf: novoBuf(y, sr), ruidoDb: Math.round(toDb(floor)), ganhoDb: Math.round(toDb(kk)) };
  }
  /* 2) mapa: onde tem fala (blobs) e onde tem pausa (gaps), em janelas de 10 ms */
  function mapa(buf) {
    const sr = buf.sampleRate, x = buf.getChannelData(0), hop = Math.max(1, Math.round(sr * 0.01)), E = framesRms(x, hop), n = E.length;
    const floor = Math.max(1e-5, pct(E, 0.1)), pk = pct(E, 0.99), thr = Math.max(floor * 3, pk * 0.05), on = new Uint8Array(n); for (let i = 0; i < n; i++) on[i] = E[i] > thr ? 1 : 0;
    const runs = v => { const r = []; let i = 0; while (i < n) { if (on[i] === v) { const a = i; while (i < n && on[i] === v) i++; r.push([a, i]); } else i++; } return r; };
    runs(0).forEach(([a, b]) => { if (a > 0 && b < n && b - a < 10) for (let i = a; i < b; i++) on[i] = 1; });
    runs(1).forEach(([a, b]) => { if (b - a < 6) for (let i = a; i < b; i++) on[i] = 0; });
    const blobs = runs(1).map(([a, b]) => [a * hop / sr, b * hop / sr]), gaps = [];
    for (let i = 0; i + 1 < blobs.length; i++) gaps.push({ a: blobs[i][1], b: blobs[i + 1][0], t: (blobs[i][1] + blobs[i + 1][0]) / 2, len: blobs[i + 1][0] - blobs[i][1] });
    return { blobs, gaps };
  }
  /* tom da voz: frequência fundamental pela autocorrelação, com o áudio pela metade da taxa */
  function decim(buf) { const x = buf.getChannelData(0), d = new Float32Array(x.length >> 1); for (let i = 0; i < d.length; i++) d[i] = (x[2 * i] + x[2 * i + 1]) * 0.5; return { d, sr: buf.sampleRate / 2 }; }
  function tom(D, a, b) {
    const { d, sr } = D, fl = Math.round(sr * 0.04), hop = Math.round(sr * 0.02), minL = Math.floor(sr / 420), maxL = Math.floor(sr / 65), out = [], c = new Float32Array(maxL + 2);
    for (let o = Math.floor(a * sr); o + fl + maxL < Math.min(d.length, Math.floor(b * sr)); o += hop) {
      let e = 0; for (let i = 0; i < fl; i++) e += d[o + i] * d[o + i]; if (e < fl * 1e-5) continue;
      let g = 0; for (let i = 0; i < fl; i++) g += d[o + minL + i] * d[o + minL + i]; let m = 0;
      for (let L = minL; L <= maxL; L++) { let x = 0; for (let i = 0; i < fl; i++) x += d[o + i] * d[o + i + L]; c[L] = x / Math.sqrt(e * g + 1e-12); if (c[L] > m) m = c[L]; const q0 = d[o + L], q1 = d[o + L + fl]; g += q1 * q1 - q0 * q0; }
      if (m < 0.6) continue;
      for (let L = minL + 1; L < maxL; L++) if (c[L] >= 0.88 * m && c[L] >= c[L - 1] && c[L] >= c[L + 1]) { out.push(sr / L); break; }
    }
    if (out.length < 2) return 0; out.sort((x, y) => x - y); return out[out.length >> 1];
  }
  function doisGrupos(vals, wts) {
    const v = vals.map((f, i) => [Math.log2(f), wts[i]]).filter(q => isFinite(q[0])); if (v.length < 4) return null;
    let c0 = Math.min(...v.map(q => q[0])), c1 = Math.max(...v.map(q => q[0]));
    for (let it = 0; it < 25; it++) { let s0 = 0, w0 = 0, s1 = 0, w1 = 0; v.forEach(([x, w]) => { if (Math.abs(x - c0) <= Math.abs(x - c1)) { s0 += x * w; w0 += w; } else { s1 += x * w; w1 += w; } }); if (w0) c0 = s0 / w0; if (w1) c1 = s1 / w1; }
    return { c0, c1, sep: Math.abs(c1 - c0), de: f => !f ? -1 : (Math.abs(Math.log2(f) - c0) <= Math.abs(Math.log2(f) - c1) ? 0 : 1) };
  }
  /* corta [T0, T1] em K partes nas pausas, pelo tamanho esperado de cada parte (programação dinâmica) */
  function divide(T0, T1, pesos, gaps, bonus, extra) {
    const K = pesos.length; if (K <= 1) return []; const W = pesos.reduce((a, b) => a + b, 0), T = T1 - T0;
    const G = gaps.filter(gp => gp.t > T0 + 0.15 && gp.t < T1 - 0.15);
    if (G.length < K - 1) { const o = []; let acc = 0; for (let k = 0; k < K - 1; k++) { acc += pesos[k]; o.push(T0 + T * acc / W); } return o; }
    const pts = [T0, ...G.map(gp => gp.t), T1], gl = [0, ...G.map(gp => gp.len), 0], P = pts.length, INF = 1e18;
    const cost = (k, a, b) => { const L = pts[b] - pts[a], Ex = T * pesos[k] / W; return Math.pow((L - Ex) / (Ex * 0.55 + 0.35), 2) - (b < P - 1 ? Math.min(gl[b], 1.2) * bonus : 0) + (extra ? extra(k, pts[a], pts[b]) : 0); };
    const dp = [], bk = []; for (let k = 0; k < K; k++) { dp.push(new Float64Array(P).fill(INF)); bk.push(new Int32Array(P).fill(-1)); }
    for (let b = 1; b < P; b++) dp[0][b] = cost(0, 0, b);
    for (let k = 1; k < K; k++) for (let b = k + 1; b < P; b++) for (let a = k; a < b; a++) { if (dp[k - 1][a] >= INF) continue; const v = dp[k - 1][a] + cost(k, a, b); if (v < dp[k][b]) { dp[k][b] = v; bk[k][b] = a; } }
    const cuts = []; let b = P - 1; for (let k = K - 1; k > 0; k--) { const a = bk[k][b]; cuts.unshift(pts[a]); b = a; } return cuts;
  }
  /* decupar SEM transcrição: divide a gravação nas falas pelas pausas e pelo tamanho do texto; com 2 personagens, separa pelo tom.
     falas: [{quem, texto, partes?}] na ordem do roteiro. Devolve {cortes (um por parte), aviso por parte, tons, identificou} */
  function decupar(buf, falas) {
    const { blobs, gaps } = mapa(buf); if (!blobs.length || !falas.length) return null; const T0 = blobs[0][0], T1 = blobs[blobs.length - 1][1];
    const quem = [...new Set(falas.map(f => nrm(f.quem)))], wl = falas.map(f => String(f.texto).length + 6); let lc = divide(T0, T1, wl, gaps, 3.2);
    const D = decim(buf), f0 = blobs.map(([a, b]) => tom(D, a, b)), G2 = doisGrupos(f0, blobs.map(([a, b]) => b - a)); let who = blobs.map(() => null), gmap = null;
    if (G2 && G2.sep > 0.12 && quem.length === 2) {
      const lbA = [T0, ...lc, T1], cnt = [{}, {}];
      blobs.forEach(([a, b], i) => { const g = G2.de(f0[i]); if (g < 0) return; const mid = (a + b) / 2; let li = 0; while (li < falas.length - 1 && mid > lbA[li + 1]) li++; const w = nrm(falas[li].quem); cnt[g][w] = (cnt[g][w] || 0) + (b - a); });
      const sc = (g, w) => cnt[g][w] || 0; gmap = sc(0, quem[0]) + sc(1, quem[1]) >= sc(0, quem[1]) + sc(1, quem[0]) ? [quem[0], quem[1]] : [quem[1], quem[0]];
      who = blobs.map((q, i) => { const g = G2.de(f0[i]); return g < 0 ? null : gmap[g]; });
      const errado = (k, a, b) => { let m = 0; blobs.forEach((q, i) => { if (!who[i] || who[i] === nrm(falas[k].quem)) return; m += Math.max(0, Math.min(b, q[1]) - Math.max(a, q[0])); }); return m; };
      lc = divide(T0, T1, wl, gaps, 3.2, (k, a, b) => 2.2 * errado(k, a, b) / Math.max(0.4, (T1 - T0) * wl[k] / wl.reduce((x, y) => x + y, 0)));
    }
    const lb = [T0, ...lc, T1], cortes = [], dono = [];
    const aperta = (a, b) => { const inn = blobs.filter(q => q[1] > a + 0.01 && q[0] < b - 0.01); if (!inn.length) return [a, Math.max(a + 0.2, b)]; return [Math.max(a, inn[0][0]), Math.min(b, inn[inn.length - 1][1])]; };
    falas.forEach((F, i) => { const [a, b] = aperta(lb[i], lb[i + 1]), ps = partesDe(F), ws = ps.map(p => p.length + 3), sc = divide(a, b, ws, gaps, 2.2), sb = [a, ...sc, b];
      ps.forEach((p, j) => { cortes.push(aperta(sb[j], sb[j + 1])); dono.push(i); }); });
    const aviso = cortes.map(([a, b], k) => {
      const t0 = {}; blobs.forEach((q, i) => { if (!who[i]) return; const o = Math.max(0, Math.min(b, q[1]) - Math.max(a, q[0])); if (o > 0) t0[who[i]] = (t0[who[i]] || 0) + o; });
      const ouvido = Object.keys(t0).sort((x, y) => t0[y] - t0[x])[0] || null, esp = nrm(falas[dono[k]].quem); if (!gmap || !ouvido || ouvido === esp || t0[ouvido] <= 0.25) return false;
      const f = tom(D, a, b); if (!f) return false; const ce = w => gmap[0] === w ? G2.c0 : G2.c1, lf = Math.log2(f); return Math.abs(lf - ce(esp)) - Math.abs(lf - ce(ouvido)) > 0.6 * G2.sep;
    });
    const tons = {}; if (gmap) gmap.forEach((w, g) => tons[w] = Math.round(Math.pow(2, g ? G2.c1 : G2.c0)));
    return { cortes, dono, aviso, tons, identificou: !!gmap, modo: 'pausas' };
  }

  /* ---------- números por extenso e comparação de palavras (para alinhar a transcrição com o roteiro) ---------- */
  const NUM_U = ['zero', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const NUM_D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const NUM_C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  function numPt(n) { if (n < 20) return NUM_U[n]; if (n < 100) return NUM_D[Math.floor(n / 10)] + (n % 10 ? ' e ' + NUM_U[n % 10] : ''); if (n === 100) return 'cem'; if (n < 1000) return NUM_C[Math.floor(n / 100)] + (n % 100 ? ' e ' + numPt(n % 100) : ''); if (n < 1000000) { const m = Math.floor(n / 1000), r = n % 1000; return (m === 1 ? 'mil' : numPt(m) + ' mil') + (r ? ' e ' + numPt(r) : ''); } return String(n); }
  function palavras(s) {
    s = nrm(s);
    s = s.replace(/(\d+),(\d+)/g, (m, a, b) => ' ' + numPt(+a) + ' virgula ' + b.split('').map(d => numPt(+d)).join(' ') + ' ').replace(/\d+/g, m => ' ' + numPt(+m) + ' ');
    return s.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).filter(w => w !== 'e');
  }
  function lev(a, b) { if (a === b) return 0; const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let p = new Array(n + 1), q = new Array(n + 1); for (let j = 0; j <= n; j++) p[j] = j; for (let i = 1; i <= m; i++) { q[0] = i; for (let j = 1; j <= n; j++) q[j] = Math.min(p[j] + 1, q[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); [p, q] = [q, p]; } return p[n]; }
  const wsim = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length);
  /* procura o texto T dentro das palavras ouvidas W[from..]: todas as posições boas, com nota de 0 a 1 */
  function alignAll(T, W, from) {
    const m = T.length, n = W.length - from; if (!m || n <= 0) return []; const SK_T = -0.8, SK_W = -0.6;
    const D = [], B = []; for (let i = 0; i <= m; i++) { D.push(new Float64Array(n + 1)); B.push(new Int8Array(n + 1)); }
    for (let i = 1; i <= m; i++) { D[i][0] = D[i - 1][0] + SK_T; B[i][0] = 1; }
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) { const s = wsim(T[i - 1], W[from + j - 1].n), mt = s >= 0.5 ? 2 * s : -1; let v = D[i - 1][j - 1] + mt, b = 0; const v1 = D[i - 1][j] + SK_T; if (v1 > v) { v = v1; b = 1; } const v2 = D[i][j - 1] + SK_W; if (v2 > v) { v = v2; b = 2; } D[i][j] = v; B[i][j] = b; }
    const out = [], E = D[m];
    for (let j = 1; j <= n; j++) { const sc = E[j] / (2 * m); if (sc < 0.3) continue; if (j > 1 && E[j - 1] >= E[j]) continue; if (j < n && E[j + 1] > E[j]) continue;
      const map = new Array(m).fill(-1); let i = m, jj = j; while (i > 0) { const b = B[i][jj]; if (b === 0) { if (wsim(T[i - 1], W[from + jj - 1].n) >= 0.5) map[i - 1] = from + jj - 1; i--; jj--; } else if (b === 1) i--; else jj--; }
      const used = map.filter(x => x >= 0); if (!used.length) continue; out.push({ score: sc, start: Math.min(...used), end: Math.max(...used), map }); }
    return out;
  }
  /* alinhar: casa as palavras ouvidas pelo Whisper ([{t, a, b}]) com as falas do roteiro, na ordem de cada personagem;
     regravação = vale a última boa antes da próxima fala. Devolve {cortes, ouvido, nota (por parte), palavras (por fala: [[palavra, a, b]])} */
  function alinhar(ouvidas, blobs, falas) {
    const W = []; ouvidas.forEach(w => { const ns = palavras(w.t); ns.forEach((n, q) => { const d = (w.b - w.a) / ns.length; W.push({ n, t: q === 0 ? w.t : '', a: w.a + d * q, b: w.a + d * (q + 1) }); }); });
    const LT = falas.map(F => { const toks = [], segOf = []; partesDe(F).forEach((sg, j) => palavras(sg).forEach(t => { toks.push(t); segOf.push(j); })); return { toks, segOf }; });
    const ptr = {}, res = new Array(falas.length).fill(null), quem = i => nrm(falas[i].quem);
    const proxMesmo = i => { for (let k = i + 1; k < falas.length; k++) if (quem(k) === quem(i)) return k; return -1; };
    for (let i = 0; i < falas.length; i++) { const w = quem(i), from = ptr[w] || 0, cands = alignAll(LT[i].toks, W, from); if (!cands.length) continue;
      const best = Math.max(...cands.map(c => c.score)); let limite = Infinity; const nx = proxMesmo(i);
      if (nx >= 0) { const nc = alignAll(LT[nx].toks, W, from); if (nc.length) { const nb = Math.max(...nc.map(c => c.score)); const fg = nc.filter(c => c.score >= nb - 0.1).sort((a, b) => a.start - b.start)[0]; if (fg) limite = fg.start; } }
      const thr = LT[i].toks.length <= 3 ? best - 0.1 : Math.max(0.45, best * 0.7); const good = cands.filter(c => c.score >= thr && c.start < limite).sort((a, b) => b.start - a.start); const pick = good[0] || cands.sort((a, b) => b.score - a.score)[0];
      res[i] = pick; ptr[w] = pick.end + 1; }
    const inBlob = x => blobs.find(q => x >= q[0] && x <= q[1]);
    const snapA = a => { const q = inBlob(a); if (q) return Math.max(0, a - q[0] <= 0.25 ? q[0] : a - 0.04); const nx = blobs.find(q => q[0] > a); return nx && nx[0] - a <= 0.6 ? nx[0] : Math.max(0, a - 0.04); };
    const snapB = b => { const q = inBlob(b); if (q) return q[1] - b <= 0.25 ? q[1] : b + 0.06; let pv = null; for (const q of blobs) if (q[1] < b) pv = q; return pv && b - pv[1] <= 0.6 ? pv[1] : b + 0.06; };
    const cortes = [], ouvido = [], nota = [], dono = [], pals = falas.map(() => []);
    falas.forEach((F, i) => { const r = res[i], lt = LT[i], ps = partesDe(F);
      if (!r) { ps.forEach(() => { cortes.push(null); ouvido.push(''); nota.push(0); dono.push(i); }); return; }
      const la = W[r.start].a, lb = W[r.end].b;
      const segIdx = ps.map((sg, j) => { const ix = []; lt.segOf.forEach((s, t) => { if (s === j && r.map[t] >= 0) ix.push(r.map[t]); }); return ix; });
      const len = ps.map(sg => sg.length + 3), tot = len.reduce((a, b) => a + b, 0); let acc = 0;
      ps.forEach((sg, j) => { const ix = segIdx[j]; let a, b;
        if (ix.length) { a = W[Math.min(...ix)].a; b = W[Math.max(...ix)].b; } else { a = la + (lb - la) * acc / tot; b = la + (lb - la) * (acc + len[j]) / tot; } acc += len[j];
        if (j === 0) { const q = inBlob(a + 0.02); if (q) a = Math.min(a, q[0]); } if (j === ps.length - 1) { const q = inBlob(b - 0.02); if (q) b = Math.max(b, q[1]); }
        cortes.push([a, b]); dono.push(i); ouvido.push(ix.length ? W.slice(Math.min(...ix), Math.max(...ix) + 1).map(w => w.t.trim()).filter(Boolean).join(' ') : ''); nota.push(r.score); });
      /* tempo de cada palavra da fala (para a legenda): palavra do roteiro → palavra ouvida */
      lt.toks.forEach((t, k) => { const wi = r.map[k]; if (wi >= 0) pals[i].push([t, W[wi].a, W[wi].b]); });
    });
    /* VOZ QUE SOBROU ENTRE DUAS FALAS (a pessoa falou diferente do roteiro e o reconhecedor não casou o fim de uma ou o começo da outra):
       nenhuma voz gravada se perde. A sobra é dividida no MAIOR silêncio entre as duas; o lado de antes vai para o fim da fala anterior
       (se as últimas palavras dela não foram ouvidas) e o de depois para o começo da seguinte (se as primeiras não foram ouvidas). */
    const ultimo = i => { let k = -1; dono.forEach((d, j) => { if (d === i) k = j; }); return k; }, primeiro = i => dono.indexOf(i);
    const falta = i => { const r = res[i]; if (!r) return { ini: 0, fim: 0 }; const ok = r.map.map((x, k) => x >= 0 ? k : -1).filter(k => k >= 0); return { ini: ok.length ? ok[0] : 0, fim: ok.length ? r.map.length - 1 - ok[ok.length - 1] : 0 }; };
    for (let i = 0; i + 1 < falas.length; i++) { const ka = ultimo(i), kb = primeiro(i + 1); if (ka < 0 || kb < 0 || !cortes[ka] || !cortes[kb]) continue;
      const fa = falta(i), fb = falta(i + 1); if (!fa.fim && !fb.ini) continue;
      const A = cortes[ka][1], B = cortes[kb][0], meio = blobs.filter(q => q[0] >= A - 0.02 && q[1] <= B + 0.02 && q[1] > A + 0.05); if (!meio.length) continue;
      const pts = [A, ...meio.flatMap(q => [q[0], q[1]]), B]; let mi = 0, mg = -1; for (let t = 0; t + 1 < pts.length; t += 2) { const g = pts[t + 1] - pts[t]; if (g > mg) { mg = g; mi = t; } }
      const corteA = pts[mi], corteB = pts[mi + 1]; // o maior silêncio vai de corteA a corteB
      if (fa.fim && corteA > A) cortes[ka][1] = corteA;
      if (fb.ini && corteB < B) cortes[kb][0] = corteB; }
    for (let k = 0; k < cortes.length; k++) { const c = cortes[k]; if (!c) continue; c[0] = snapA(c[0]); c[1] = snapB(c[1]);
      const nx = cortes[k + 1]; if (nx && dono[k + 1] === dono[k] && c[1] > nx[0]) { const m = (c[1] + nx[0]) / 2; c[1] = m; nx[0] = m; } if (c[1] < c[0] + 0.15) c[1] = c[0] + 0.15; }
    return { cortes, dono, ouvido, nota, palavras: pals, notaFala: res.map(r => r ? +r.score.toFixed(2) : 0), modo: 'whisper' };
  }
  /* apara: cada corte fica só com a fala, com as folgas do protocolo (0,03 antes, 0,08 depois); trecho em silêncio fica como está */
  function apara(cortes, buf, prot) {
    const P = prot || protocolo; if (!cortes || !buf) return cortes; const d = buf.getChannelData(0), sr = buf.sampleRate, w = Math.round(sr * 0.01);
    return cortes.map(q => { if (!q) return q; const [a, b] = q, i0 = Math.max(0, Math.floor(a * sr)), i1 = Math.min(d.length, Math.floor(b * sr)); if (i1 - i0 < w * 4) return q; const r = []; let pico = 0;
      for (let i = i0; i < i1; i += w) { let s2 = 0; const e = Math.min(i1, i + w); for (let j = i; j < e; j++) s2 += d[j] * d[j]; const v = Math.sqrt(s2 / Math.max(1, e - i)); r.push(v); if (v > pico) pico = v; }
      if (pico < 0.004) return q; const lim = Math.max(0.004, pico * 0.07); let f0 = r.findIndex(v => v > lim), f1 = r.length - 1; while (f1 > 0 && r[f1] <= lim) f1--; if (f0 < 0) return q;
      let na = Math.max(0, a + f0 * 0.01 - P.antes), nb = Math.min(buf.duration, a + (f1 + 1) * 0.01 + P.depois); if (nb - na < 0.3) { const m = (na + nb) / 2; na = Math.max(0, m - 0.15); nb = Math.min(buf.duration, m + 0.15); }
      return [+na.toFixed(3), +nb.toFixed(3)]; });
  }
  /* confere pelo protocolo: [{i, aviso}] — sem voz, silêncio no começo/fim, curto demais para o texto (palavra cortada?), voz de outro personagem */
  function confere(buf, cortes, textos, avisoTom) {
    const P = protocolo, d = buf.getChannelData(0), sr = buf.sampleRate, rm = (a, b) => { let q = 0, n = 0; for (let i = Math.max(0, Math.floor(a * sr)); i < Math.min(d.length, Math.floor(b * sr)); i += 4) { q += d[i] * d[i]; n++; } return Math.sqrt(q / Math.max(1, n)); };
    const out = []; cortes.forEach((q, i) => { if (!q) { out.push({ i, aviso: 'sem voz' }); return; } const [a, b] = q, tot = rm(a, b); if (tot < 0.004) { out.push({ i, aviso: 'sem voz' }); return; }
      const lim = Math.max(0.004, tot * 0.25); if (b - a > P.silencioPonta * 2) { if (rm(a, a + P.silencioPonta) < lim * 0.3) out.push({ i, aviso: 'silêncio no começo' }); if (rm(b - P.silencioPonta, b) < lim * 0.3) out.push({ i, aviso: 'silêncio no fim' }); }
      const letras = String(textos[i] || '').replace(/[^A-Za-zÀ-ÿ0-9]/g, '').length; if (b - a < letras * P.porLetra) out.push({ i, aviso: 'curto demais (palavra cortada?)' });
      if (avisoTom && avisoTom[i]) out.push({ i, aviso: 'parece a voz de outro personagem' }); });
    return out;
  }
  /* pedaço [s, e] (segundos) de um AudioBuffer */
  function corta(b, s, e) { const sr = b.sampleRate, i0 = Math.max(0, Math.floor(s * sr)), i1 = Math.min(b.length, Math.ceil(e * sr)), o = new AudioBuffer({ length: Math.max(1, i1 - i0), numberOfChannels: b.numberOfChannels, sampleRate: sr }); for (let c = 0; c < b.numberOfChannels; c++) o.getChannelData(c).set(b.getChannelData(c).subarray(i0, i1)); return o; }
  /* vários áudios numa faixa só, um depois do outro, com 1 s de silêncio entre eles. Devolve {buf, arquivos:[{off, dur}]} */
  function junta(bufs, gap = 1) { const sr = bufs[0].sampleRate, g = Math.round(gap * sr); let n = 0; bufs.forEach((b, i) => { n += Math.round(b.duration * sr) + (i ? g : 0); }); const o = new Float32Array(Math.max(1, n)); let off = 0; const arquivos = [];
    bufs.forEach((b, i) => { if (i) off += g; const m = monoOf(b); o.set(m.subarray(0, Math.min(m.length, o.length - off)), off); arquivos.push({ off: off / sr, dur: b.duration }); off += m.length; }); return { buf: novoBuf(o, sr), arquivos }; }

  /* ================= WHISPER no navegador =================
     O modelo (Xenova/whisper-base quantizado, ~86 MB) é servido pelo SHORTS em /shorts/whisper/ e guardado no MESMO banco do navegador
     que o Shorts usa (IndexedDB "estudio-problems", chaves "wh:<versão>:<arquivo>"): baixou num programa, o outro já abre direto.
     Roda num Worker (a tela não trava); sem Worker, roda na própria página. */
  const WH = { ver: 'wb-q8-1', tjs: 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2', mark: '/__whisper__/', base: 'https://estudio.invalid/__whisper__/', url: '/shorts/whisper/',
    files: [['config.json', 2248], ['generation_config.json', 3776], ['preprocessor_config.json', 339], ['tokenizer.json', 2480466], ['tokenizer_config.json', 282683],
      ['ort-wasm-simd.wasm', 10014674], ['onnx/encoder_model_quantized.onnx', 23200850, 'encoder', 2], ['onnx/decoder_model_merged_quantized.onnx', 53707539, 'decoder', 5]],
    blobs: null, worker: null, mainRun: null };
  const WH_TOTAL = WH.files.reduce((a, f) => a + f[1], 0), whKey = f => 'wh:' + WH.ver + ':' + f;
  const idbOpen = () => new Promise((res, rej) => { try { const r = indexedDB.open('estudio-problems', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });
  async function idbGet(k) { try { const d = await idbOpen(); return await new Promise((res, rej) => { const q = d.transaction('f', 'readonly').objectStore('f').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return null; } }
  async function idbSet(k, v) { try { const d = await idbOpen(); await new Promise((res, rej) => { const tx = d.transaction('f', 'readwrite'); tx.objectStore('f').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); return true; } catch (e) { return false; } }
  async function idbDel(k) { try { const d = await idbOpen(); await new Promise((res, rej) => { const tx = d.transaction('f', 'readwrite'); tx.objectStore('f').delete(k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) { } }
  async function guardados() { let n = 0; for (const [f, size] of WH.files) { const b = await idbGet(whKey(f)); if (b && b.size === size) n += size; } return n; }
  async function arquivos(onp) {
    if (WH.blobs) return WH.blobs; const out = {}; let done = 0, net = 0;
    for (const [f, size, part, n] of WH.files) { let b = await idbGet(whKey(f));
      if (b && b.size === size) { out[f] = b; done += size; if (onp) onp(done, net); continue; }
      const parts = [];
      for (let i = 0; i < (n || 1); i++) { const r = await fetch(WH.url + (part ? part + '.' + i + '.wasm' : f), { credentials: 'include' }); if (!r.ok) throw new Error('faltou o arquivo ' + (part ? part + '.' + i : f) + ' do reconhecedor de fala (' + r.status + ')');
        if (r.body && r.body.getReader) { const rd = r.body.getReader(), ch = []; for (;;) { const x = await rd.read(); if (x.done) break; ch.push(x.value); done += x.value.length; net += x.value.length; if (onp) onp(done, net); } parts.push(new Blob(ch)); }
        else { const bb = await r.blob(); parts.push(bb); done += bb.size; net += bb.size; if (onp) onp(done, net); } }
      b = new Blob(parts); if (b.size !== size) throw new Error('arquivo incompleto do reconhecedor de fala: ' + f);
      out[f] = b; await idbSet(whKey(f), b); }
    WH.blobs = out; return out;
  }
  function whisperCore(scope) { let pipe = null;
    return async function (msg, post) { scope.__whF = msg.files;
      if (!scope.__whPatched) { scope.__whPatched = true; const of = scope.fetch.bind(scope), MARK = msg.mark;
        scope.fetch = function (u, o) { const s = typeof u === 'string' ? u : (u && u.url) || String(u), i = s.indexOf(MARK); if (i < 0) return of(u, o);
          const f = s.slice(i + MARK.length).split('?')[0].replace(/^Xenova\/whisper-base\//, ''), b = scope.__whF && scope.__whF[f];
          if (!b) return Promise.resolve(new Response('', { status: 404, statusText: 'Not Found' }));
          return Promise.resolve(new Response(b, { status: 200, headers: { 'Content-Type': /\.wasm$/.test(f) ? 'application/wasm' : /\.json$/.test(f) ? 'application/json' : 'application/octet-stream', 'Content-Length': String(b.size) } })); }; }
      if (!pipe) { post({ st: 'load' }); const T = await import(msg.tjs), E = T.env; E.allowLocalModels = true; E.allowRemoteModels = false; E.useBrowserCache = false; E.localModelPath = msg.base;
        const ow = E.backends.onnx.wasm; ow.wasmPaths = msg.base; ow.numThreads = 1; ow.proxy = false;
        pipe = await T.pipeline('automatic-speech-recognition', 'Xenova/whisper-base', { quantized: true }); }
      const A = msg.audio, SR = 16000, out = [];
      for (let i = 0; i < msg.win.length; i++) { const [a, b] = msg.win[i]; post({ st: 'asr', i, n: msg.win.length }); await new Promise(r => setTimeout(r, 0));
        const seg = A.subarray(Math.max(0, Math.floor(a * SR)), Math.min(A.length, Math.ceil(b * SR))); if (seg.length < SR * 0.2) continue;
        const r = await pipe(seg, { language: 'portuguese', task: 'transcribe', return_timestamps: 'word' });
        for (const c of (r.chunks || [])) { if (!c.text || !c.text.trim() || !c.timestamp || c.timestamp[0] == null) continue; const s0 = c.timestamp[0], s1 = c.timestamp[1] != null ? c.timestamp[1] : s0 + 0.3;
          out.push({ t: c.text, a: +(a + s0).toFixed(3), b: +(a + Math.min(Math.max(s1, s0 + 0.02), b - a)).toFixed(3) }); } }
      return out; }; }
  function whWorker() { if (WH.worker) return WH.worker;
    const src = 'const run=(' + whisperCore.toString() + ')(self);self.onmessage=e=>{run(e.data,m=>self.postMessage(m)).then(w=>self.postMessage({st:"done",words:w}),err=>self.postMessage({st:"err",err:String(err&&err.message||err)}));};';
    WH.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { type: 'module' }); return WH.worker; }
  function whRunWorker(msg, onp) { return new Promise((res, rej) => { let w; try { w = whWorker(); } catch (e) { rej({ load: true, err: String(e && e.message || e) }); return; } let started = false;
    const off = () => { w.onmessage = null; w.onerror = null; }, kill = () => { try { w.terminate(); } catch (_) { } WH.worker = null; };
    w.onmessage = e => { const m = e.data || {}; if (m.st === 'done') { off(); res(m.words || []); } else if (m.st === 'err') { off(); kill(); rej({ load: !started, err: m.err }); } else { if (m.st === 'asr') started = true; if (onp) onp(m); } };
    w.onerror = e => { off(); kill(); rej({ load: !started, err: (e && e.message) || 'o Worker não abriu' }); };
    w.postMessage(msg); }); }
  /* trechos de no máximo 24 s cortados nas pausas (o Whisper ouve 30 s por vez; cortar na pausa não divide palavra) */
  function janelas(blobs, dur) { const W = [], MAX = 24, PAD = 0.25; let cur = null; const lastEnd = () => cur ? cur[1] : (W.length ? W[W.length - 1][1] : 0);
    for (const [a, b] of blobs) { const B = Math.min(dur, b + PAD); if (cur && B - cur[0] <= MAX) { cur[1] = B; continue; }
      const A = Math.max(0, a - PAD, lastEnd()); if (cur) W.push(cur); cur = null; if (B - A > MAX) { for (let s0 = A; s0 < B; s0 += MAX) W.push([s0, Math.min(B, s0 + MAX)]); } else cur = [A, B]; }
    if (cur) W.push(cur); return W; }
  async function to16k(buf) { const n = Math.ceil(buf.duration * 16000), oc = new OfflineAudioContext(1, n, 16000), sn = oc.createBufferSource(); sn.buffer = buf; sn.connect(oc.destination); sn.start(); return (await oc.startRendering()).getChannelData(0); }
  /* frase do andamento (para mostrar na tela) */
  function frase(pg) { const mb = b => Math.round(b / 1048576);
    if (pg.st === 'dl') return pg.net > 0 ? `Baixando o reconhecedor de fala (só na primeira vez): ${mb(pg.d)} de ${mb(WH_TOTAL)} MB` : 'Abrindo o reconhecedor de fala guardado neste navegador…';
    if (pg.st === 'load') return 'Carregando o reconhecedor de fala…'; if (pg.st === 'asr') return `Ouvindo as falas: trecho ${pg.i + 1} de ${pg.n}…`; return null; }
  async function transcrever(buf, onp) {
    const files = await arquivos((d, net) => onp && onp({ st: 'dl', d, net, total: WH_TOTAL }));
    const a16 = await to16k(buf), win = janelas(mapa(buf).blobs, buf.duration), msg = { files, mark: WH.mark, base: WH.base, tjs: WH.tjs, audio: a16, win };
    try { return await whRunWorker(msg, onp); }
    catch (e) { if (!e || !e.load) throw new Error(String(e && e.err || e)); WH.mainRun = WH.mainRun || whisperCore(raiz); return await WH.mainRun(msg, m => { if (onp) onp(m); }); }
  }
  const whisper = { transcrever, frase, total: WH_TOTAL, guardados, config: WH, apagar: async () => { for (const [f] of WH.files) await idbDel(whKey(f)); WH.blobs = null; } };

  /* ================= LEGENDAS (LEG_GERA do Shorts) =================
     blocos de 1 linha, até 22 letras / 4 palavras, cortes escolhidos na frase toda; marca: '' normal · 'n' número · 'd' palavra-chave · 'q:<Nome>' nome de personagem.
     Tempo de cada palavra pelas sílabas (pausinha depois de vírgula/ponto) — ou pelos tempos ouvidos, quando o programa tiver. */
  const LEG_STOP = new Set('a o as os e é de da do das dos em no na nos nas num numa um uma uns umas pra pro pras pros para por pelo pela pelos pelas com que se sem ao aos à às mas nem ou eu tu ele ela me te lhe só tão já mais muito quase bem cada meu minha meus minhas seu sua seus suas teu tua nosso nossa esse essa isso este esta nesse nessa desse dessa daquele daquela naquele naquela'.split(' '));
  const LEG_MAX = { letras: 22, palavras: 4 };
  function legNorm(s) { return nrm(s).replace(/[^a-z0-9]+/g, ''); }
  function legSil(w) { const s = legNorm(w); if (!s) return 0.5; if (/^\d/.test(s)) return Math.max(1.5, s.length * 0.9); const m = s.match(/[aeiouy]+/g); return Math.max(1, m ? m.length : 1); }
  /* o = {texto ("/" força a quebra), d (duração, s), nomes:[...], chaves:[...], ini, fim, tempos?: [[palavra, a, b]] (em s desde o começo da fala)} */
  function gera(o) {
    const d = Math.max(0.2, +o.d || 1.5), nomes = (o.nomes || []).filter(Boolean), chaves = (o.chaves || []).map(x => String(x).trim()).filter(Boolean);
    const toks = String(o.texto || '').replace(/\s*\/\s*/g, ' / ').split(/\s+/).filter(Boolean), P = []; let quebra = false;
    toks.forEach(t => { if (t === '/') { quebra = true; return; } P.push({ w: t, qb: quebra, k: '' }); quebra = false; });
    if (!P.length) return { d: +d.toFixed(3), texto: '', blocos: [] };
    const nn = P.map(p => legNorm(p.w)), nomeN = nomes.map(x => [x, legNorm(x)]);
    P.forEach((p, i) => { const q = nomeN.find(([x, n]) => n && (nn[i] === n || nn[i] === n + 's')); if (q) p.k = 'q:' + q[0]; else if (/\d/.test(p.w)) p.k = 'n'; });
    chaves.forEach(ch => { const cn = ch.split(/\s+/).map(legNorm).filter(Boolean); if (!cn.length) return; for (let i = 0; i + cn.length <= P.length; i++) { if (cn.every((x, j) => nn[i + j] === x)) { for (let j = 0; j < cn.length; j++) if (!P[i + j].k) P[i + j].k = 'd'; } } });
    const ini = o.ini != null ? +o.ini : Math.min(0.06, d * 0.05), fim = o.fim != null ? +o.fim : Math.max(ini + 0.1, d - Math.min(0.12, d * 0.08));
    const pes = P.map(p => legSil(p.w)), pau = P.map((p, i) => i < P.length - 1 && /[,.;:!?…]$/.test(p.w) ? 1.2 : 0), tot = pes.reduce((a, b) => a + b, 0) + pau.reduce((a, b) => a + b, 0);
    let t = ini; const u = (fim - ini) / tot; P.forEach((p, i) => { p.a = +t.toFixed(3); t += pes[i] * u; p.b = +t.toFixed(3); t += pau[i] * u; });
    if (Array.isArray(o.tempos) && o.tempos.length) aplicaTempos(P, o.tempos, d);
    const pont = w => /[,.;:!?…]$/.test(w), B = []; let seg = []; const segs = []; P.forEach(p => { if (p.qb && seg.length) { segs.push(seg); seg = []; } seg.push(p); }); if (seg.length) segs.push(seg);
    segs.forEach(S => { const n = S.length, len = (i, j) => S.slice(i, j).reduce((s, p) => s + p.w.length, 0) + (j - i - 1);
      const custo = (i, j) => { const L = len(i, j), k = j - i; if (k > LEG_MAX.palavras || (L > LEG_MAX.letras && k > 1)) return Infinity; let c = 10; const ul = S[j - 1];
        if (j < n) { if (LEG_STOP.has(ul.w.toLowerCase()) && !pont(ul.w)) c += 30; if (ul.k === 'n' && !pont(ul.w)) c += 30; if (ul.k === 'd' && S[j].k === 'd') c += 30; if (pont(ul.w)) c -= 6; }
        if (k === 1 && n > 1 && !(ul.w.length >= 8 || /[!?]$/.test(ul.w) || (j === n && pont(S[i - 1] ? S[i - 1].w : '') && ul.w.length >= 5))) c += 9;
        for (let q = i; q < j - 1; q++) if (pont(S[q].w)) c += 4; if (L < 8 && n > 1) c += 4; return c; };
      const best = new Array(n + 1).fill(Infinity), de = new Array(n + 1).fill(0); best[0] = 0;
      for (let j = 1; j <= n; j++) for (let i = Math.max(0, j - LEG_MAX.palavras); i < j; i++) { const v = best[i] + custo(i, j); if (v < best[j]) { best[j] = v; de[j] = i; } }
      const cs = []; for (let j = n; j > 0; j = de[j]) cs.unshift([de[j], j]); cs.forEach(([i, j]) => B.push(S.slice(i, j))); });
    return { d: +d.toFixed(3), texto: B.map(b => b.map(p => p.w).join(' ')).join(' / '), blocos: B.map(b => b.map(p => [p.w, p.a, p.b, p.k])) };
  }
  /* troca o tempo estimado pelo tempo ouvido quando pelo menos 60% das palavras bateram (o resto fica entre as vizinhas) */
  function aplicaTempos(P, tempos, d) {
    const T = tempos.map(x => [palavras(x[0]).join(''), +x[1], +x[2]]); let j = 0, achou = 0; const got = P.map(() => null);
    P.forEach((p, i) => { const n = palavras(p.w).join(''); if (!n) return; for (let k = j; k < Math.min(T.length, j + 4); k++) if (T[k][0] === n || (n.length > 3 && wsim(T[k][0], n) >= 0.7)) { got[i] = [T[k][1], T[k][2]]; j = k + 1; achou++; break; } });
    if (achou < P.length * 0.6) return;
    for (let i = 0; i < P.length; i++) { if (got[i]) { P[i].a = +Math.max(0, got[i][0]).toFixed(3); P[i].b = +Math.min(d, got[i][1]).toFixed(3); continue; }
      const a0 = i ? P[i - 1].b : 0; let k = i + 1; while (k < P.length && !got[k]) k++; const b0 = k < P.length ? got[k][0] : d, n = k - i, u = (b0 - a0) / n;
      for (let q = 0; q < n; q++) { P[i + q].a = +(a0 + u * q).toFixed(3); P[i + q].b = +(a0 + u * (q + 1)).toFixed(3); } i = k - 1; }
  }
  function item(o) { const g = gera(o); return Object.assign({ c: o.c, n: o.n, quem: o.quem, fala: o.fala != null ? o.fala : o.texto, chaves: o.chaves || [] }, o.oculta ? { oculta: 1 } : {}, g); }
  /* números por extenso → algarismos ("dois corações" → "2 corações"); "um/uma" só antes de unidade */
  const crNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ç%,\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const CR_NUM = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
    vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900, mil: 1000 };
  const CR_UNID = /^(minutos?|segundos?|blocos?|coracao|coracoes|vidas?|horas?|metros?|vez|vezes|pontos?|perolas?|dias?|anos?|reais|real|pessoas?)$/;
  function numeros(s) {
    const tk = String(s).split(/(\s+)/), nw = x => crNorm(x).replace(/[ ,]/g, ''), W = []; tk.forEach((x, i) => { if (x && !/^\s+$/.test(x)) W.push(i); });
    const val = i => CR_NUM[nw(tk[i])], isN = i => nw(tk[i]) in CR_NUM, fim = i => /[.,!?;:…”"')]$/.test(tk[i]), out = tk.slice();
    for (let a = 0; a < W.length; a++) { if (!isN(W[a])) continue; let b = a, tot = 0, cur = 0; const add = v => { if (v === 1000) { cur = (cur || 1) * 1000; tot += cur; cur = 0; } else cur += v; }; add(val(W[a]));
      while (!fim(W[b])) { const nx = b + 1 < W.length ? W[b + 1] : -1;
        if (nx >= 0 && isN(nx) && (val(nx) === 1000 || (cur === 0 && tot > 0))) { b++; add(val(W[b])); continue; }
        if (nx >= 0 && nw(tk[nx]) === 'e' && b + 2 < W.length && isN(W[b + 2]) && cur >= 20 && val(W[b + 2]) < (cur % 100 === 0 ? 100 : 10)) { b += 2; add(val(W[b])); continue; }
        break; }
      let txt = String(tot + cur);
      if (!fim(W[b]) && b + 2 < W.length && nw(tk[W[b + 1]]) === 'virgula' && isN(W[b + 2]) && val(W[b + 2]) < 10) { b += 2; txt += ',' + val(W[b]); }
      if (a === b && /^(um|uma)$/.test(nw(tk[W[a]])) && !CR_UNID.test(b + 1 < W.length ? nw(tk[W[b + 1]]) : '')) continue;
      const pre = (tk[W[a]].match(/^[“"'(¿¡]+/) || [''])[0], pont = (tk[W[b]].match(/[.,!?;:…”"')]+$/) || [''])[0];
      out[W[a]] = pre + txt + pont; for (let q = W[a] + 1; q <= W[b]; q++) out[q] = ''; a = b; }
    return out.join('');
  }
  /* nomes certos: mapa {nome normalizado: Nome Certo} */
  function trocas(s, T) { T = T || {}; return String(s).split(/(\s+)/).map(w => { const m = w.match(/^([“"'(¿¡]*)(.*?)([.,!?;:…”"')]*)$/); if (!m) return w; const k = crNorm(m[2]); return T[k] ? m[1] + T[k] + m[3] : w; }).join(''); }
  /* texto da legenda pronto: nomes certos + números em algarismo */
  function boa(s, gosto) { let x = trocas(String(s || '').trim(), gosto && gosto.trocas); if (!gosto || gosto.numeros !== false) x = numeros(x); return x; }
  /* palavras-chave aprendidas que aparecem no texto */
  function chavesDe(texto, gosto) { const g = gosto || {}, nao = new Set((g.naoDestacar || []).map(crNorm)), t = ' ' + crNorm(texto) + ' '; return (g.destacar || []).filter(w => !nao.has(crNorm(w)) && t.includes(' ' + crNorm(w) + ' ')); }
  /* APRENDE com o dono: velho = o que o estúdio fez {texto, chaves}, novo = como o dono deixou. Muda o gosto (destacar, naoDestacar, trocas) e devolve o que aprendeu.
     fixos = nomes de personagem que já estão certos (nunca viram troca). */
  function aprende(gosto, velho, novo, fixos) {
    const g = gosto; g.destacar = g.destacar || []; g.naoDestacar = g.naoDestacar || []; g.trocas = g.trocas || {}; const ap = { destacar: [], naoDestacar: [], trocas: {} };
    const A = new Set((velho.chaves || []).map(crNorm)), B = new Set((novo.chaves || []).map(crNorm)), tira = (L, w) => { const i = L.findIndex(y => crNorm(y) === crNorm(w)); if (i >= 0) L.splice(i, 1); };
    (novo.chaves || []).forEach(w => { if (!A.has(crNorm(w))) { tira(g.naoDestacar, w); if (!g.destacar.some(y => crNorm(y) === crNorm(w))) g.destacar.push(w); ap.destacar.push(w); } });
    (velho.chaves || []).forEach(w => { if (!B.has(crNorm(w))) { tira(g.destacar, w); if (!g.naoDestacar.some(y => crNorm(y) === crNorm(w))) g.naoDestacar.push(w); ap.naoDestacar.push(w); } });
    const FX = new Set((fixos || []).map(crNorm)), wa = String(velho.texto || '').replace(/\//g, ' ').split(/\s+/).filter(Boolean), wb = String(novo.texto || '').replace(/\//g, ' ').split(/\s+/).filter(Boolean);
    if (wa.length === wb.length) wa.forEach((a, i) => { const b = wb[i].replace(/[.,!?;:…”"')]+$/, '').replace(/^[“"'(¿¡]+/, ''), na = crNorm(a), nb = crNorm(b);
      if (na && nb && na !== nb && na.length >= 3 && !FX.has(na) && /^[A-ZÀ-Ý]/.test(b) && !/\d/.test(b) && lev(na, nb) <= Math.max(1, Math.floor(na.length / 2))) { g.trocas[na] = b; ap.trocas[na] = b; } });
    g.destacar = g.destacar.slice(-200); g.naoDestacar = g.naoDestacar.slice(-200); return ap;
  }
  const legendas = { gera, item, numeros, trocas, boa, chavesDe, aprende, norm: crNorm, MAX: LEG_MAX, STOP: LEG_STOP };

  const voz = { limpar, mapa, decim, tom, doisGrupos, divide, decupar, alinhar, apara, confere, corta, junta, palavras, numPt, lev };
  const EE = { versao: V, voz, protocolo, whisper, legendas };
  raiz.EstudioEdicao = EE;
  if (typeof module === 'object' && module.exports) module.exports = EE;
})(typeof self !== 'undefined' ? self : globalThis);
