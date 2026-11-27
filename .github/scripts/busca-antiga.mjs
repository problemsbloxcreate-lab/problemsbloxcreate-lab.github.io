// BUSCA TEMPORÁRIA (27/11/2026, pedido da dona): procura versões antigas de animações no KV antigo da conta principal e no banco D1,
// por nome. O resultado sai CRIPTOGRAFADO (só o computador da dona abre); no log só aparecem contagens. Apagar depois de usar.
import { publicEncrypt, randomBytes, createCipheriv, constants, createPublicKey } from 'node:crypto';
const { T, A } = process.env, API = 'https://api.cloudflare.com/client/v4', H = { authorization: 'Bearer ' + T };
const PUB = createPublicKey({ key: Buffer.from("MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAvOkst5/JqyhaQKUI898WN3jW9GU654CbuGakBd/RUC69aMN+G+8g3zslgpAZPAGTTDU+QAvs+7Gyzbz8rP4qpZ75fmXwO9pgNt//gXPUHWtEbOJHUubRZXTblSm6FCdTQK2VrjLuFCawjVvRI+hjVdz7PN1Fwqh8UjBKtL+7uPy9TOw8y09pFaqtTHY24vY0DRxlqtdJUziVF7r6X6sBz4/WHdK9292PcZIlT9NdWnCd7Nb8KXdRNGMasA8qOLtDjVLp6TsjqwHXjxH0S5ipZjLuSEaF2l0ATlc0yWj8uTUE/mk2b+vdWhIrjGPGdUm9l7r10aLThuqPkZ3jEcMu4omev5WoWzTAVWD4yDIGDWfgC+BjWgnBMqAZL+zUyEG1jOKMGDi4KkXSPX/hh78gQmh5LthfW5eh5ci81/jn7HiJJf9jDaUH3eLWukWAmEGNPG4CQG+j/demrEZiK2Y6uPlg/K4BBYzjXYrGFK+ZnUaNvRxQMJQ7Vo/674rGyKN5AgMBAAE=", "base64"), format: "der", type: "spki" }), RE = /lumi|namor|nunca/i;
const cf = async (p, o = {}) => (await fetch(API + p, { ...o, headers: { ...H, ...(o.headers || {}) } })).json();
const st = await cf('/accounts/' + A + '/workers/scripts/turma-ia/settings'); const ns = (st.result?.bindings || []).find(b => b.name === 'EQUIPE')?.namespace_id;
if (!ns) { console.log('sem KV'); process.exit(1); }
const kv = []; let cur = '';
do { const r = await cf('/accounts/' + A + '/storage/kv/namespaces/' + ns + '/keys?limit=1000&prefix=animacoes/' + (cur ? '&cursor=' + cur : '')); for (const k of r.result || []) kv.push(k); cur = r.result_info?.cursor || ''; } while (cur);
const porId = {}; for (const k of kv) { const m = k.name.match(/^animacoes\/([^/]+)\//); if (!m) continue; const x = porId[m[1]] ||= { id: m[1], arq: 0, bytes: 0 }; x.arq++; x.bytes += +(k.metadata?.tam || 0); if (k.name.endsWith('/projeto.json')) Object.assign(x, { nome: k.metadata?.nome || '', mod: k.metadata?.mod || 0, em: k.metadata?.em || '', quem: k.metadata?.quem || null }); }
for (const x of Object.values(porId)) if (x.mod != null && !x.nome) { try { const t = await (await fetch(API + '/accounts/' + A + '/storage/kv/namespaces/' + ns + '/values/' + encodeURIComponent('animacoes/' + x.id + '/projeto.json'), { headers: H })).text(); x.nome = JSON.parse(t).nome || ''; x.lido = 1; } catch { } }
const bancos = (await cf('/accounts/' + A + '/d1/database?per_page=100')).result || [], eq = bancos.find(b => b.name === 'equipe');
const sql = async q => { const r = await cf('/accounts/' + A + '/d1/database/' + eq.uuid + '/query', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sql: q }) }); return r.result?.[0]?.results || []; };
const d1 = await sql("SELECT k, meta, tam, em, onde FROM arq WHERE k LIKE 'animacoes/%/projeto.json'");
const apag = await sql("SELECT k, em FROM apagados WHERE k LIKE 'animacoes/%'");
const d1p = d1.map(r => { let m = {}; try { m = JSON.parse(r.meta || '{}'); } catch { } return { id: r.k.split('/')[1], nome: m.nome || '', mod: m.mod || r.em, tam: r.tam }; });
const apagIds = [...new Set(apag.map(r => r.k.split('/')[1]))];
const kvLista = Object.values(porId).filter(x => x.mod != null);
const res = { kvTotal: kvLista.length, d1Total: d1p.length, apagadosIds: apagIds.length,
  kvAchados: kvLista.filter(x => RE.test(x.nome)), d1Achados: d1p.filter(x => RE.test(x.nome)),
  apagadosComNome: apagIds.map(id => ({ id, nome: porId[id]?.nome || d1p.find(x => x.id === id)?.nome || '' })).filter(x => !x.nome || RE.test(x.nome)).slice(0, 200),
  kvSoNoKv: kvLista.filter(x => !d1p.some(d => d.id === x.id)).map(x => ({ id: x.id, nome: x.nome, mod: x.mod, arq: x.arq })) };
const chave = randomBytes(32), iv = randomBytes(12), c = createCipheriv('aes-256-gcm', chave, iv), dados = Buffer.concat([c.update(JSON.stringify(res)), c.final()]);
const env = publicEncrypt({ key: PUB, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, chave);
const out = [env, iv, c.getAuthTag(), dados].map(b => b.toString('base64')).join('.');
console.log('contagens: KV ' + res.kvTotal + ' · D1 ' + res.d1Total + ' · apagados ' + res.apagadosIds);
for (let i = 0; i < out.length; i += 3000) console.log('CIFRA ' + out.slice(i, i + 3000));
