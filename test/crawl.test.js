// Логика обхода (offscreen.js) в настоящем расширении, с подменой fetch — к сайту запросов нет.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ext = path.join(__dirname, '../extension');
const fx = n => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');
let ctx, page;

before(async () => {
  ctx = await chromium.launchPersistentContext('', { headless: true, channel: 'chromium',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  page = await ctx.newPage();
  await page.goto(`chrome-extension://${sw.url().split('/')[2]}/offscreen.html`);
  await page.evaluate(([list, art]) => {
    window.pause = async () => {};                       // без пауз в тесте
    window.requested = [];
    const item = (slug, d) => `<div class="views-row item"><article><a href="/ru/${slug}" rel="bookmark">
      <div class="item-date">${d}</div><div class="item-title"><span>Новость ${slug}</span></div></a></article></div>`;
    const listPage = (items, next) => `<html><body><section class="view view-news"><div data-role="list">${items}</div>
      <div class="pager">${next ? `<a rel="next" href="${next}">След</a>` : ''}</div></section></body></html>`;
    window.fetch = async url => {
      requested.push(url);
      const u = new URL(url);
      let html;
      if (u.pathname === '/ru/news' && u.searchParams.get('date') === '19.03.2023') html = listPage('', '');
      else if (u.pathname === '/ru/news' && u.searchParams.get('date')) {
        const d = u.searchParams.get('date'), [dd, mm, yy] = d.split('.');
        const ru = `${+dd} ${['','января','февраля','марта','апреля','мая','июня'][+mm]} ${yy}`;
        html = listPage(item(`a-${dd}${mm}-1001`, ru) + item(`b-${dd}${mm}-1002`, ru));
      } else if (u.pathname === '/ru/news' && u.searchParams.get('page') === '3') html = listPage('', '');
      else if (u.pathname === '/ru/news') html = list;
      else if (u.pathname.startsWith('/ru/')) html = art;
      else return new Response('', { status: 404 });
      return new Response(html, { status: 200 });
    };
  }, [fx('list_page2.html'), fx('article.html')]);
});
after(() => ctx && ctx.close());

const status = () => page.evaluate(() => DB.get('state', 'status'));

test('сбор за май 2019 через фильтр по дате', async () => {
  await page.evaluate(() => run({ mode: 'period', from: '20190501', to: '20190531' }));
  const st = await status();
  assert.match(st.msg, /Готово: обработано дат — 16/);
  const arts = await page.evaluate(() => DB.getAll('articles'));
  assert.strictEqual(arts.length, 32);
  assert.ok(arts.every(a => a.status === 'done' && a.text.startsWith('Нурсултан Назарбаев принял участие')));
  // повторный запуск ничего не скачивает
  const before = await page.evaluate(() => requested.length);
  await page.evaluate(() => run({ mode: 'period', from: '20190501', to: '20190531' }));
  assert.strictEqual(await page.evaluate(() => requested.length), before + 1);   // только лента для календаря
});

test('обход ленты по страницам до конца', async () => {
  await page.evaluate(() => DB.put('state', { k: 'full', nextPage: 2 }));
  await page.evaluate(() => run({ mode: 'full' }));
  const st = await status();
  assert.match(st.msg, /дошли до конца ленты/);
  assert.strictEqual(st.added, 10);
  const full = await page.evaluate(() => DB.get('state', 'full'));
  assert.strictEqual(full.nextPage, 1);
});

test('обновление останавливается на странице без новых новостей', async () => {
  const n0 = await page.evaluate(() => requested.length);
  await page.evaluate(() => run({ mode: 'update' }));
  const st = await status();
  assert.match(st.msg, /новых новостей больше нет/);
  assert.strictEqual(await page.evaluate(() => requested.length), n0 + 1);
});

test('за дату с пустым фильтром новости добираются из ленты', async () => {
  await page.evaluate(() => DB.clear('articles'));
  await page.evaluate(() => run({ mode: 'period', from: '20230301', to: '20230331' }));
  const arts = await page.evaluate(() => DB.getAll('articles'));
  assert.deepStrictEqual(arts.map(a => a.url),
    ['https://nazarbayev.kz/ru/nursultan-nazarbaev-progolosoval-na-vyborah-deputatov-mazhilisa-parlamenta-i-maslihatov-respubliki-kazahstan-1923344']);
  assert.match((await status()).msg, /Готово/);
});
