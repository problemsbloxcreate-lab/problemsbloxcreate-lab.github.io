#!/usr/bin/env node
/* Copia os sons da biblioteca antiga para a nuvem principal (tabelas mus_* do turma-ia). Só LÊ o clone local; nunca mexe na origem.
   Uso: node copiar-biblioteca.mjs copiar <pasta do clone do estudio-biblioteca> [paralelos]
        node copiar-biblioteca.mjs conferir <pasta do clone>     (compara cada SHA-256 do clone com o que o servidor relê do banco)
   A chave vem de ~/.claude/cerebro-chave.txt ou CEREBRO_CHAVE; nunca é mostrada. Pode rodar de novo: o que já foi copiado é pulado. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
const [, , cmd, dir, par] = process.argv, BASE = 'https://turma-ia.problemsraiz.workers.dev/musicas/copia';
const chave = (process.env.CEREBRO_CHAVE || await readFile(join(homedir(), '.claude', 'cerebro-chave.txt'), 'utf8')).trim(), H = { 'x-cerebro-chave': chave };
const espera = ms => new Promise(r => setTimeout(r, ms)), sha = b => createHash('sha256').update(b).digest('hex'), sha1 = t => createHash('sha1').update(t).digest('hex');
const ix = JSON.parse(await readFile(join(dir, 'indice.json'), 'utf8')), itens = ix.keys.filter(k => /^(pk|mc):/.test(k)).map(k => sha1(k));
async function tenta(f) { for (let i = 0; ; i++) { try { const r = await f(); if (r.status < 500 && r.status !== 429) return r; if (i >= 5) return r; } catch (e) { if (i >= 5) throw e; } await espera(1500 * (i + 1)); } }
async function lista() { const m = new Map(); let d = ''; for (;;) { const r = await tenta(() => fetch(`${BASE}/lista?n=3000&depois=${d}`, { headers: H })), j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 200)); for (const x of j.itens) m.set(x.hx, x); if (j.itens.length < 3000) return m; d = j.itens.at(-1).hx; } }
if (cmd === 'copiar') {
  const ja = await lista(), falta = ['indice', ...itens.filter(h => !ja.has(h))].filter(h => h !== 'indice' || !ja.has('indice')); let i = 0, feitos = 0, bytes = 0, erros = 0; const ini = Date.now(); console.log(`já copiados: ${ja.size} · faltam: ${falta.length}`);
  await Promise.all(Array.from({ length: Math.min(6, +par || 3) }, async () => { while (i < falta.length) { const h = falta[i++], b = await readFile(join(dir, h === 'indice' ? 'indice.json' : 'a/' + h)), s = sha(b), r = await tenta(() => fetch(`${BASE}?hx=${h}&sha=${s}`, { method: 'POST', headers: { ...H, 'content-type': 'application/octet-stream' }, body: b }));
    if (!r.ok) { erros++; console.log('ERRO', h, r.status, (await r.text()).slice(0, 160)); if (r.status === 507 || r.status === 401 || r.status === 423) { console.log('parando'); i = falta.length; } continue; } feitos++; bytes += b.length; if (feitos % 250 === 0) console.log(`${feitos}/${falta.length} · ${(bytes / 1048576).toFixed(0)} MB · ${Math.round((Date.now() - ini) / 1000)} s · erros ${erros}`); } }));
  console.log(`FIM copiar: ${feitos} enviados · ${(bytes / 1048576).toFixed(0)} MB · erros ${erros}`);
} else if (cmd === 'conferir') {
  const ja = await lista(); let dif = 0, falta = 0, ok = 0; const pedir = [];
  for (const h of itens) { const x = ja.get(h); if (!x) { falta++; continue; } const s = sha(await readFile(join(dir, 'a/' + h))); if (s !== x.sha) { dif++; console.log('DIFERENTE', h); continue; } pedir.push(h); }
  console.log(`clone x lista do servidor: iguais ${pedir.length} · diferentes ${dif} · faltando ${falta}`); let i = 0, ruim = 0;
  await Promise.all(Array.from({ length: Math.min(6, +par || 3) }, async () => { while (i < pedir.length) { const lote = pedir.slice(i, i += 20), r = await tenta(() => fetch(`${BASE}/conferir`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ hx: lote }) })), j = await r.json().catch(() => ({})); for (const h of lote) { if (j.ok?.[h] === true) ok++; else { ruim++; console.log('NÃO BATEU NO BANCO', h); } } if ((ok + ruim) % 2000 < 20) console.log(`relidos no banco: ${ok + ruim}/${pedir.length}`); } }));
  console.log(`FIM conferir: certos ${ok} · errados no banco ${ruim} · diferentes ${dif} · faltando ${falta}`); process.exit(ruim || dif || falta ? 1 : 0);
} else { console.log('Use: copiar <pasta> ou conferir <pasta>'); process.exit(2); }
