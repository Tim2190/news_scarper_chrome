// Сбор новостей за период из командной строки (тот же разбор, что в расширении).
// node scripts/crawl.js 01.05.2019 31.05.2019 [data/news.json]
// Разбор идёт в Chromium (Playwright) — тот же DOMParser, что в Chrome.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [from, to, out = path.join(__dirname, '../data/news.json')] = process.argv.slice(2);
const ymd = d => d.split('.').reverse().join('');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'https://nazarbayev.kz';

async function get(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'nazarbayev-archive-catalog/1.0' } });
      if (r.ok) return await r.text();
      if (r.status < 500 && r.status !== 429) throw new Error('HTTP ' + r.status);
    } catch (e) { if (i === 3) throw e; }
    await sleep(5000 * (i + 1));
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addScriptTag({ path: path.join(__dirname, '../extension/parse.js') });
  const parse = (fn, html) => page.evaluate(([fn, html]) => window[fn](new DOMParser().parseFromString(html, 'text/html')), [fn, html]);

  const db = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [];
  const have = new Set(db.map(a => a.url));
  const dates = (await parse('activeDates', await get(`${BASE}/ru/news`)))
    .filter(d => ymd(d) >= ymd(from) && ymd(d) <= ymd(to)).sort((a, b) => ymd(a).localeCompare(ymd(b)));
  if (!dates.length) throw new Error('В календаре сайта нет дат за этот период (или страница не загрузилась)');
  console.log('Дат с новостями:', dates.join(' '));
  for (const d of dates) {
    let url = `${BASE}/ru/news?date=${d}`;
    while (url) {
      const { items, next } = await parse('parseList', await get(url));
      await sleep(1500);
      for (const it of items) {
        if (it.date && it.date !== d) { console.warn('  ! другая дата в выдаче', d, it.date); continue; }
        if (have.has(it.url)) continue;
        const a = await parse('parseArticle', await get(it.url));
        db.push({ date: a.date || it.date, rubric: a.rubric, title: a.title || it.title, url: it.url, text: a.text, photos: a.photos });
        have.add(it.url);
        console.log(' ', a.date || it.date, (a.title || it.title).slice(0, 100), a.ok ? '' : '  !! текст не найден');
        await sleep(1500);
      }
      url = next;
    }
  }
  db.sort((a, b) => ymd(a.date).localeCompare(ymd(b.date)) || a.url.localeCompare(b.url));
  fs.writeFileSync(out, JSON.stringify(db, null, 1));
  console.log('Всего в', out, ':', db.length);
  await browser.close();
})();
