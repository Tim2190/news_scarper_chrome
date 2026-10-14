// data/news.json → CSV для Excel/Google Таблиц (разделитель «;», UTF-8 с BOM).
// node scripts/news_to_csv.js data/news.json data/news.csv
const fs = require('fs');
const [inp, out] = process.argv.slice(2);
const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
const rows = JSON.parse(fs.readFileSync(inp, 'utf8'));
fs.writeFileSync(out, '﻿' + [['Дата', 'Рубрика', 'Заголовок', 'Ссылка', 'Текст', 'Фото'],
  ...rows.map(a => [a.date, a.rubric, a.title, a.url, a.text, a.photos])].map(r => r.map(q).join(';')).join('\r\n'));
console.log('Записано', rows.length, 'новостей в', out);
