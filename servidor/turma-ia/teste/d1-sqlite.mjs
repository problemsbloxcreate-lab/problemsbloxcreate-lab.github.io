/* Banco de TESTE: um SQLite em memória que fala como o D1 da Cloudflare (prepare/bind/run/all/first/batch). Só para os testes e para o servidor local.
   Não toca em nenhum banco de verdade. */
import { DatabaseSync } from 'node:sqlite';

export function novoD1() {
  const db = new DatabaseSync(':memory:');
  const arruma = a => a.map(v => v === undefined ? null : typeof v === 'boolean' ? +v : v);
  const ehLeitura = sql => /^\s*(select|with|pragma)\b/i.test(sql) || /\breturning\b/i.test(sql);
  const stmt = sql => {
    let args = [];
    const o = {
      bind(...a) { args = arruma(a); return o; },
      async run() { const r = db.prepare(sql).run(...args); return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
      async all() { const rs = ehLeitura(sql) ? db.prepare(sql).all(...args) : (db.prepare(sql).run(...args), []); return { success: true, results: rs.map(x => ({ ...x })), meta: {} }; },
      async first(col) { const r = ehLeitura(sql) ? db.prepare(sql).get(...args) : (db.prepare(sql).run(...args), undefined); if (!r) return null; return col ? r[col] : { ...r }; },
      _exec() { if (ehLeitura(sql)) return { success: true, results: db.prepare(sql).all(...args).map(x => ({ ...x })), meta: {} }; const r = db.prepare(sql).run(...args); return { success: true, results: [], meta: { changes: Number(r.changes) } }; },
    };
    return o;
  };
  const d1 = {
    prepare: stmt,
    async batch(lista) { db.exec('BEGIN'); try { const out = lista.map(s => s._exec()); db.exec('COMMIT'); return out; } catch (e) { try { db.exec('ROLLBACK'); } catch { } throw e; } },
    async exec(sql) { db.exec(sql); },
    _bruto: db,
  };
  db.exec('CREATE TABLE IF NOT EXISTS cfg (k TEXT PRIMARY KEY, v TEXT)');
  return d1;
}
