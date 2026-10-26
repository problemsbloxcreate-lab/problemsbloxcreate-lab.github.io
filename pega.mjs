import fs from 'node:fs'; fs.mkdirSync('out', { recursive: true });
const H = { 'accept-language': 'pt-BR,pt;q=0.9', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', cookie: 'SOCS=CAI; CONSENT=YES+1' };
for (const h of ['Torajo', 'TurmaDaBatatinha']) {
  for (const t of ['', '/videos', '/shorts', '/streams']) { try { const r = await fetch(`https://www.youtube.com/@${h}${t}`, { headers: H }); const s = await r.text(); fs.writeFileSync(`out/${h}${t.replace('/', '_') || '_home'}.html`, s); console.log(h, t, r.status, s.length); } catch (e) { console.log('erro', h, t, e.message); } }
  const s = fs.readFileSync(`out/${h}_home.html`, 'utf8'), id = (s.match(/"externalId":"(UC[\w-]{22})"/) || s.match(/"channelId":"(UC[\w-]{22})"/) || [])[1]; console.log('id', id);
  if (id) { const r = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + id, { headers: H }); fs.writeFileSync(`out/${h}_rss.xml`, await r.text()); console.log('rss', r.status); }
}
