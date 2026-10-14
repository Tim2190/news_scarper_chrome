// Разбор страниц nazarbayev.kz (Drupal 8, контент отдаётся сервером в HTML).
// Селекторы сверены с реальными страницами — см. test/fixtures.
const BASE = 'https://nazarbayev.kz';
const MONTHS = { 'января':1,'февраля':2,'марта':3,'апреля':4,'мая':5,'июня':6,'июля':7,
  'августа':8,'сентября':9,'октября':10,'ноября':11,'декабря':12 };
const clean = s => (s || '').replace(/\s+/g, ' ').trim();
const pad = n => String(n).padStart(2, '0');

// Любая дата в тексте → 'ДД.ММ.ГГГГ' (или '').
function findDate(t) {
  t = t || '';
  let m = t.match(/(?<!\d)(\d{1,2})\.(\d{2})\.(\d{4})(?!\d)/);
  if (m) return `${pad(m[1])}.${m[2]}.${m[3]}`;
  m = t.match(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  m = t.toLowerCase().match(/(?<!\d)(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/);
  if (m) return `${pad(m[1])}.${pad(MONTHS[m[2]])}.${m[3]}`;
  return '';
}

function absUrl(href) {
  try {
    const u = new URL(href, BASE + '/');
    if (u.host !== 'nazarbayev.kz') return '';
    return BASE + u.pathname.replace(/\/+$/, '');
  } catch (e) { return ''; }
}

// Страница списка (/ru/news?page=N или ?date=ДД.ММ.ГГГГ).
// Берём только карточки основного списка, а не меню/«Другие новости»/выпадающую панель.
// Возвращает { items: [{url, title, date}], next: url следующей страницы или '' }.
function parseList(doc) {
  let rows = [...doc.querySelectorAll('.view-news .views-row')];
  if (!rows.length) rows = [...doc.querySelectorAll('[data-role="list"] [data-role="item"]')];
  const items = [], seen = new Set();
  for (const row of rows) {
    const a = row.querySelector('a[rel="bookmark"]') || row.querySelector('a[href]');
    const url = a && absUrl(a.getAttribute('href'));
    if (!url || !/^https:\/\/nazarbayev\.kz\/ru\/(?!news$|news\/(events|decisions|telegram|phonecalls)$).+/.test(url) || seen.has(url)) continue;
    seen.add(url);
    const t = row.querySelector('.item-title');
    const d = row.querySelector('.item-date');
    items.push({ url, title: clean(t ? t.textContent : a.textContent), date: findDate(d ? d.textContent : '') });
  }
  const nx = doc.querySelector('.pager a[rel="next"], .pagination a[rel="next"]');
  return { items, next: nx ? (new URL(nx.getAttribute('href'), BASE + '/')).href : '' };
}

// Даты, за которые на сайте есть новости (их подсвечивает календарь; список есть на любой странице).
function activeDates(doc) {
  const out = new Set();
  for (const s of doc.querySelectorAll('script')) {
    if (!s.textContent.includes('getActiveDates')) continue;
    for (const m of s.textContent.matchAll(/"\d+"\s*:\s*"(\d{4})-(\d{2})-(\d{2})"/g)) out.add(`${m[3]}.${m[2]}.${m[1]}`);
  }
  return [...out];
}

// Текст блока: абзацы и пункты списков; если их нет — весь текст блока.
function blockText(el) {
  if (!el) return '';
  const parts = [...el.querySelectorAll('p, li, h2, h3, h4, blockquote')]
    .filter(n => !n.parentElement.closest('p, li, blockquote'))
    .map(n => clean(n.textContent)).filter(Boolean);
  return parts.length ? parts.join('\n') : clean(el.textContent);
}

// Страница новости.
function parseArticle(doc) {
  // Первый <h1> на странице — заголовок раздела «Новость»; заголовок новости — внутри article.
  const art = doc.querySelector('article.node--view-mode-full') || doc.querySelector('[data-section="article"]');
  const scope = art || doc;
  const h = scope.querySelector('.section-title h1, h1.title-2');
  const title = clean(h ? h.textContent : '');
  let date = '';
  const crumbs = [...scope.querySelectorAll('.nav-breadcrumbs li')];
  for (const li of crumbs.reverse()) { date = findDate(clean(li.textContent)); if (date) break; }
  const rub = scope.querySelector('.field--name-field-news-type');
  let text = blockText(scope.querySelector('.field--name-body'));
  const descr = blockText(scope.querySelector('.field--name-field-description'));
  if (descr && !text.includes(descr)) text = text ? descr + '\n' + text : descr;
  const photos = scope.querySelectorAll('.content-gallery [data-role="slide"]').length;
  return { title, date, rubric: clean(rub ? rub.textContent : ''), text, photos, ok: !!(art && title) };
}

if (typeof module !== 'undefined') module.exports = { findDate, parseList, activeDates, parseArticle, BASE };
