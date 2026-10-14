// Сопоставление файлов видеоархива с новостями сайта.
// Имя файла (латиница) → дата + ключевые слова; новость (кириллица) → транслит;
// сравниваем «скелеты» слов, чтобы Chavychoglu ≈ Чавушоглу, Kalijanovym ≈ Калижановым.

const CYR = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'j','з':'z','и':'i','й':'i','к':'k',
  'л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch',
  'ш':'sh','щ':'sh','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
  'ә':'a','ғ':'g','қ':'k','ң':'n','ө':'o','ұ':'u','ү':'u','һ':'h','і':'i' };

// Нормализованная латинская форма слова, одинаковая для разных систем транслитерации.
function skeleton(w) {
  w = [...w.toLowerCase()].map(c => (c in CYR ? CYR[c] : c)).join('');
  return w.replace(/[^a-z]/g, '')
    .replace(/shch|sch/g, 's').replace(/zh|dzh|dj/g, 'j').replace(/kh|x/g, 'h')
    .replace(/ch|tch/g, 'c').replace(/sh/g, 's').replace(/ts|tz/g, 'c')
    .replace(/ya|ia/g, 'a').replace(/yu|iu/g, 'u').replace(/[yj](?=[aeiou])/g, '')
    .replace(/y/g, 'i').replace(/w/g, 'v').replace(/(.)\1+/g, '$1');
}

function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}

// Похожесть слова из имени файла на слово из новости (окончания падежей не мешают:
// сравниваем по длине более короткого, но не короче 4 букв).
function wordSim(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 4) return 0;
  return 1 - lev(a.slice(0, n), b.slice(0, n)) / n;
}

// Слова в именах файлов, которые описывают съёмку, а не событие.
const STOP = new Set(['elbasy','elbasi','vstrecha','vsttrecha','vstreca','krupn','krupnyi','krupnii','plan','stacionar',
  'xcode','mix','pgm','skj','sbs','xdcam','clip','lichniki','prohodka','bez','etazh','foto','cvtseq','transfer',
  'otkr','vruch','kongress','mejdunognogo','upravl','ministrom','predsedatelem','poslom','kaz','molodym','socialnyi',
  'zachity','naseleniya','inostrannyh','del','i','s','v','na','po','iz',
  // операторы / камеры
  'djavatarov','dzhavatarov','kulmanov','tlespaev','batkeev','omarkulov','abilov','malikov','ahmetov','ali']
  .map(skeleton));

// Сокращения из имён файлов → слова, которые встретятся в тексте новости.
const EXPAND = {
  aef: ['астанинский', 'экономический', 'форум'],
  nu: ['назарбаев', 'университет'],
  prk: ['президент'],
  mfca: ['международный', 'финансовый', 'центр'],
  usa: ['сша'],
  aoo: ['назарбаев', 'университет'],
};

const pad = n => String(n).padStart(2, '0');

// Дата из имени файла: 01.05.19, 01.05.2019, 13_05_2019, 2019-05-13 → 'ДД.ММ.ГГГГ'.
function fileDate(name) {
  let m = name.match(/(?<!\d)(\d{1,2})[._\-](\d{1,2})[._\-](\d{4}|\d{2})(?!\d)/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return `${pad(m[1])}.${pad(m[2])}.${y}`;
  }
  m = name.match(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return '';
}

// Ключевые слова из имени файла (уже в виде скелетов).
function fileKeywords(name) {
  const words = name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[^A-Za-z]+/g, ' ').split(' ').filter(Boolean);
  const out = new Set();
  for (const w of words) {
    const lw = w.toLowerCase();
    if (EXPAND[lw]) { EXPAND[lw].forEach(e => out.add(skeleton(e))); continue; }
    const s = skeleton(w);
    if (s.length >= 4 && !STOP.has(s)) out.add(s);
  }
  return [...out];
}

const dayNum = d => { const [dd, mm, yy] = d.split('.').map(Number); return Date.UTC(yy, mm - 1, dd) / 864e5; };

// Подбирает новости для файла. news: [{url,title,date,text}] — даты 'ДД.ММ.ГГГГ'.
// Возвращает отсортированный список кандидатов { a, score, hits, shift }.
function rankNews(name, news, opts = {}) {
  const win = opts.window ?? 2;
  const date = opts.date || fileDate(name);
  const kws = fileKeywords(name);
  if (!date) return { date, kws, list: [] };
  const d0 = dayNum(date);
  const list = [];
  for (const a of news) {
    if (!a.date) continue;
    const shift = dayNum(a.date) - d0;
    if (Math.abs(shift) > win) continue;
    if (!a._sk) {
      const tw = new Set((a.title || '').split(/[^A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]+/).map(skeleton).filter(s => s.length >= 4));
      const bw = new Set((a.text || '').split(/[^A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]+/).map(skeleton).filter(s => s.length >= 4));
      Object.defineProperty(a, '_sk', { value: { tw: [...tw], bw: [...bw] }, enumerable: false });
    }
    let score = 0; const hits = [];
    for (const k of kws) {
      let best = 0, inTitle = false;
      for (const w of a._sk.tw) { const s = wordSim(k, w); if (s > best) { best = s; inTitle = true; } }
      for (const w of a._sk.bw) { const s = wordSim(k, w); if (s > best) { best = s; inTitle = false; } }
      if (best >= 0.75) { score += best * Math.min(k.length, 8) * (inTitle ? 2 : 1); hits.push(k); }
    }
    score *= shift === 0 ? 1 : 1 / (1 + Math.abs(shift));
    list.push({ a, score: Math.round(score * 10) / 10, hits, shift });
  }
  list.sort((x, y) => y.score - x.score || Math.abs(x.shift) - Math.abs(y.shift));
  return { date, kws, list };
}

// Итог по одному файлу: лучшая новость и уверенность.
function matchFile(name, news, opts) {
  const r = rankNews(name, news, opts);
  const [best, second] = r.list;
  let conf = 'нет новостей за эти даты';
  if (!r.date) conf = 'нет даты в имени файла';
  else if (best && best.score > 0) {
    const gap = second ? best.score - second.score : best.score;
    conf = best.shift === 0 && gap >= 4 && (best.hits.length >= 2 || !second || second.score === 0) ? 'высокая'
      : gap > 0 ? 'средняя' : 'низкая — несколько равных вариантов';
  } else if (best) conf = r.list.length === 1 && best.shift === 0 ? 'средняя — единственная новость за день' : 'низкая — нет совпадений слов';
  const pick = best && (best.score > 0 || (r.list.length === 1 && best.shift === 0)) ? best : null;
  return { name, date: r.date, kws: r.kws, pick, conf, alts: r.list.slice(pick ? 1 : 0, 4) };
}

if (typeof module !== 'undefined') module.exports = { skeleton, wordSim, fileDate, fileKeywords, rankNews, matchFile };
