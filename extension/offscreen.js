let running = false, stopFlag = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pause = () => sleep(1200 + Math.random() * 800);   // вежливая пауза между запросами

async function setStatus(patch) {
  const cur = (await DB.get('state', 'status')) || {};
  await DB.put('state', Object.assign(cur, patch, { k: 'status', ts: Date.now() }));
}

async function fetchDoc(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { credentials: 'omit' });
      if (r.status === 429 || r.status >= 500) throw new Error('HTTP ' + r.status);
      if (!r.ok) return { error: 'HTTP ' + r.status };
      return { doc: new DOMParser().parseFromString(await r.text(), 'text/html') };
    } catch (e) { await sleep(5000 * (i + 1)); }
  }
  return { error: 'нет ответа сайта' };
}

const ctx = { added: 0, errors: 0 };

// Скачивает и сохраняет одну новость. Возвращает true, если новость новая (её не было в базе).
async function saveItem(item, where) {
  const ex = await DB.get('articles', item.url);
  if (ex && ex.status === 'done') return false;
  const r = await fetchDoc(item.url);
  const a = r.doc ? parseArticle(r.doc) : null;
  if (!a || !a.ok) {
    ctx.errors++;
    await DB.put('articles', { url: item.url, title: item.title, date: item.date, rubric: '', text: '', photos: 0,
      status: 'error', error: r.error || 'не найден текст новости на странице', where });
  } else {
    await DB.put('articles', { url: item.url, title: a.title || item.title, date: a.date || item.date,
      rubric: a.rubric, text: a.text, photos: a.photos, status: 'done', where });
    ctx.added++;
  }
  await setStatus({ added: ctx.added, errors: ctx.errors, msg: `${where}: ${item.date} ${item.title.slice(0, 60)}` });
  await pause();
  return !ex;
}

// Обход общей ленты /ru/news?page=1,2,… (нумерация с 1, как в пагинаторе сайта).
async function crawlPages(mode) {
  let page = 1;
  if (mode === 'full') { const st = await DB.get('state', 'full'); page = (st && st.nextPage) || 1; }
  let url = `${BASE}/ru/news?page=${page}`;
  while (!stopFlag && url) {
    await setStatus({ page, msg: `Лента, страница ${page}…` });
    const { doc, error } = await fetchDoc(url);
    if (error) return `Остановлено: страница ${page} — ${error}. Нажмите кнопку ещё раз, чтобы продолжить.`;
    const { items, next } = parseList(doc);
    if (!items.length) {
      if (mode === 'full') await DB.put('state', { k: 'full', nextPage: 1, finished: Date.now() });
      return page === 1 ? 'На странице ленты не найдено новостей — вёрстка сайта изменилась?' : 'Готово: дошли до конца ленты.';
    }
    let fresh = 0;
    for (const it of items) {
      if (stopFlag) break;
      if (await saveItem(it, `стр. ${page}`)) fresh++;
    }
    if (stopFlag) return 'Пауза. Нажмите кнопку ещё раз, чтобы продолжить.';
    if (mode === 'full') await DB.put('state', { k: 'full', nextPage: next ? page + 1 : 1, finished: next ? 0 : Date.now() });
    if (mode === 'update' && fresh === 0) return 'Готово: новых новостей больше нет.';
    if (!next) return 'Готово: дошли до конца ленты.';
    url = next; page++;
    await pause();
  }
  return 'Пауза. Нажмите кнопку ещё раз, чтобы продолжить.';
}

// Сбор за период через фильтр по дате (/ru/news?date=ДД.ММ.ГГГГ).
// Список дат, за которые есть новости, сайт отдаёт на каждой странице (подсветка календаря).
const ymd = d => d.split('.').reverse().join('');
async function crawlPeriod(from, to) {                  // from/to: 'ГГГГММДД' или ''
  const { doc, error } = await fetchDoc(`${BASE}/ru/news`);
  if (error) return `Не открылась лента: ${error}`;
  const dates = activeDates(doc).filter(d => (!from || ymd(d) >= from) && (!to || ymd(d) <= to))
    .sort((a, b) => ymd(a).localeCompare(ymd(b)));
  if (!dates.length) return 'За выбранный период на сайте нет новостей (по данным календаря).';
  const done = (await DB.get('state', 'dates')) || { k: 'dates', list: {} };
  let i = 0;
  const missed = new Set();      // фильтр сайта по дате пуст (так бывает с 2021–2022 гг. и новее) — доберём по ленте
  for (const d of dates) {
    i++;
    if (stopFlag) break;
    if (done.list[d]) continue;
    let url = `${BASE}/ru/news?date=${d}`, ok = true, got = 0;
    while (url && !stopFlag) {
      await setStatus({ page: `${d} (${i}/${dates.length})`, msg: `Дата ${d}…` });
      const r = await fetchDoc(url);
      if (r.error) return `Остановлено на дате ${d}: ${r.error}. Нажмите кнопку ещё раз, чтобы продолжить.`;
      const { items, next } = parseList(r.doc);
      const foreign = items.filter(it => it.date && it.date !== d);
      if (foreign.length === items.length && items.length)
        return `Фильтр по дате не сработал (на ${d} пришли новости за ${foreign[0].date}). Используйте «Собрать всё».`;
      for (const it of items) {
        if (stopFlag) { ok = false; break; }
        if (it.date && it.date !== d) continue;          // на всякий случай — только новости этой даты
        got++;
        await saveItem(it, `дата ${d}`);
      }
      await pause();
      url = next;
    }
    if (!got && ok && !stopFlag) missed.add(d);
    else if (ok && !stopFlag) { done.list[d] = Date.now(); await DB.put('state', done); }
  }
  if (missed.size && !stopFlag) {
    const oldest = Math.min(...[...missed].map(ymd).map(Number));
    let url = `${BASE}/ru/news?page=1`, page = 1;
    while (url && !stopFlag) {
      await setStatus({ page: `лента, стр. ${page}`, msg: `Фильтр по дате пуст для ${missed.size} дат — ищу их в ленте…` });
      const r = await fetchDoc(url);
      if (r.error) return `Остановлено на странице ленты ${page}: ${r.error}. Нажмите кнопку ещё раз.`;
      const { items, next } = parseList(r.doc);
      for (const it of items) { if (stopFlag) break; if (missed.has(it.date)) await saveItem(it, `лента, стр. ${page}`); }
      if (!items.length || items.every(it => it.date && +ymd(it.date) < oldest)) break;
      url = next; page++;
      await pause();
    }
    if (!stopFlag) { missed.forEach(d => { done.list[d] = Date.now(); }); await DB.put('state', done); }
  }
  return stopFlag ? 'Пауза. Нажмите кнопку ещё раз, чтобы продолжить.' : `Готово: обработано дат — ${dates.length}.`;
}

// Повторить новости, которые не скачались.
async function retryErrors() {
  const bad = (await DB.getAll('articles')).filter(a => a.status !== 'done');
  if (!bad.length) return 'Ошибок нет.';
  for (const a of bad) { if (stopFlag) break; await saveItem(a, 'повтор'); }
  return stopFlag ? 'Пауза.' : `Готово: повторено ${bad.length}.`;
}

async function run(m) {
  if (running) return;
  running = true; stopFlag = false; ctx.added = 0; ctx.errors = 0;
  await setStatus({ running: true, mode: m.mode, page: '', added: 0, errors: 0, msg: 'Старт…' });
  let msg = '';
  try {
    if (m.mode === 'period') msg = await crawlPeriod(m.from || '', m.to || '');
    else if (m.mode === 'retry') msg = await retryErrors();
    else msg = await crawlPages(m.mode);
  } catch (e) { msg = 'Ошибка: ' + e.message; }
  running = false;
  await setStatus({ running: false, added: ctx.added, errors: ctx.errors, msg: msg || 'Остановлено.' });
}

chrome.runtime.onMessage.addListener(m => {
  if (m.target !== 'offscreen') return;
  if (m.cmd === 'start') run(m);
  if (m.cmd === 'stop') stopFlag = true;
});
