// Сопоставляет имена файлов с собранными новостями и пишет JSON для build_catalog.py.
// node scripts/match_catalog.js files.txt data/news.json > data/matches.json
const fs = require('fs');
const { matchFile } = require('../extension/match.js');
const [filesPath, newsPath] = process.argv.slice(2);
const files = fs.readFileSync(filesPath, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const news = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
const out = files.map(f => {
  const m = matchFile(f, news);
  return { id: f, date: m.date, conf: m.conf, url: m.pick ? m.pick.a.url : '', score: m.pick ? m.pick.score : 0,
    hits: m.pick ? m.pick.hits : [], alts: m.alts.filter(c => c.score > 0).map(c => ({ url: c.a.url, score: c.score })) };
});
process.stdout.write(JSON.stringify(out, null, 1));
