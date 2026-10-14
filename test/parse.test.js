// Разбор реальных страниц сайта в настоящем Chromium (тот же DOMParser, что в расширении).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const src = fs.readFileSync(path.join(__dirname, '../extension/parse.js'), 'utf8');
const fx = n => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');
let browser, page;

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.addScriptTag({ content: src });
});
after(() => browser && browser.close());

const run = (fn, html) => page.evaluate(([fn, html]) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return window[fn](doc);
}, [fn, html]);

test('новость: заголовок, дата, рубрика, текст', async () => {
  const a = await run('parseArticle', fx('article.html'));
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.title, 'Нурсултан Назарбаев проголосовал на выборах депутатов Мажилиса Парламента и маслихатов Республики Казахстан');
  assert.strictEqual(a.date, '19.03.2023');
  assert.strictEqual(a.rubric, 'СОБЫТИЯ');
  assert.match(a.text, /^Нурсултан Назарбаев принял участие в процедуре голосования/);
  assert.match(a.text, /\nПосле голосования Первый Президент Казахстана поздравил/);
  assert.doesNotMatch(a.text, /Курултая/);          // «Другие новости» в текст не попадают
  assert.strictEqual(a.photos, 3);
});

test('лента: только карточки списка, с датами, и ссылка на следующую страницу', async () => {
  const r = await run('parseList', fx('list_page2.html'));
  assert.strictEqual(r.items.length, 10);
  assert.deepStrictEqual(r.items[0], {
    url: 'https://nazarbayev.kz/ru/obrashchenie-pervogo-prezidenta-respubliki-kazahstan-nanazarbaeva-17104422',
    title: 'Обращение Первого Президента Республики Казахстан Н.А.Назарбаева', date: '17.11.2023' });
  assert.strictEqual(r.items[4].date, '19.03.2023');
  assert.ok(r.items.every(i => i.date && i.title && !/astana-1485348|kurultaya/.test(i.url)));
  assert.strictEqual(r.next, 'https://nazarbayev.kz/ru/news?page=3');
});

test('календарь: даты с новостями', async () => {
  const d = await run('activeDates', fx('list_page2.html'));
  for (const x of ['01.05.2019', '13.05.2019', '28.05.2019', '31.05.2019', '21.06.2019']) assert.ok(d.includes(x), x);
  assert.ok(!d.includes('11.05.2019'));
});

test('findDate', async () => {
  const f = s => page.evaluate(s => findDate(s), s);
  assert.strictEqual(await f('19 марта  2023 '), '19.03.2023');
  assert.strictEqual(await f('1 мая 2019'), '01.05.2019');
  assert.strictEqual(await f('2019-05-28'), '28.05.2019');
});

test('старая новость (2019, адрес /ru/news/2019-05/…)', async () => {
  const a = await run('parseArticle', fx('article_2019.html'));
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.date, '28.05.2019');
  assert.match(a.title, /^Нурсултан Назарбаев встретился с Президентом Российской Федерации Владимиром Путиным$/);
  assert.match(a.text, /^В ходе встречи Елбасы лично вручил Владимиру Путину орден/);
  assert.match(a.text, /\nПервый Президент Казахстана отметил текущие результаты/);
  assert.match(a.text, /В ходе встречи Елбасы лично вручил/);
  assert.strictEqual((a.text.match(/В ходе встречи Елбасы лично вручил/g) || []).length, 1);
});

test('лента за дату 28.05.2019', async () => {
  const r = await run('parseList', fx('list_date_2019-05-28.html'));
  assert.strictEqual(r.items.length, 6);
  assert.ok(r.items.every(i => i.date === '28.05.2019' && i.url.startsWith('https://nazarbayev.kz/ru/news/2019-05/')));
});
