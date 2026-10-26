import fs from 'node:fs';
const LOG=[]; const _l=console.log; console.log=(...a)=>{LOG.push(a.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ')); _l(...a);}; process.on('exit',()=>{fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/log.txt',LOG.join('\n'));});
const H = { 'accept-language': 'pt-BR,pt;q=0.9', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', cookie: 'SOCS=CAI; CONSENT=YES+1' };
const acha = (o, k, out = []) => { if (o && typeof o === 'object') { if (Array.isArray(o)) for (const v of o) acha(v, k, out); else { if (k in o) out.push(o[k]); for (const v of Object.values(o)) acha(v, k, out); } } return out; };
const html = await (await fetch('https://www.youtube.com/@Torajo/videos', { headers: H })).text(), d = JSON.parse(html.match(/var ytInitialData = (\{.*?\});<\/script>/s)[1]);
const its = acha(d, 'listItemViewModel'); console.log(its.map(x => x?.title?.content));
const it = its.find(x => /popular/i.test(x?.title?.content || '')); const toks = acha(it, 'continuationCommand').map(x => x.token); console.log(toks);
const ver = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1], vd = (html.match(/"VISITOR_DATA":"([^"]+)"/) || [])[1]; console.log(ver, !!vd);
for (const body of [{ context: { client: { clientName: 'WEB', clientVersion: ver, hl: 'pt', gl: 'BR' } }, continuation: toks[0] }, { context: { client: { clientName: 'WEB', clientVersion: ver, hl: 'pt', gl: 'BR', visitorData: vd } }, continuation: toks[0] }]) {
  const r = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', { method: 'POST', headers: { ...H, 'content-type': 'application/json', 'x-youtube-client-name': '1', 'x-youtube-client-version': ver, origin: 'https://www.youtube.com' }, body: JSON.stringify(body) });
  const t = await r.text(); console.log(r.status, t.length, (t.match(/lockupViewModel/g) || []).length, (t.match(/richItemRenderer/g) || []).length, t.slice(0, 300)); fs.mkdirSync('out', { recursive: true }); fs.writeFileSync('out/pop.json', t); }
