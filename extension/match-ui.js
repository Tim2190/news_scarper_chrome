const $ = id => document.getElementById(id);
let rows = [];              // [{ id, date, res, choice }]
let byUrl = new Map();

const label = c => `${c.a.date} · ${c.a.title.slice(0, 90)}${c.score ? ` (баллы ${c.score})` : ''}`;
const cls = conf => conf.startsWith('высокая') ? 'hi' : conf.startsWith('средняя') ? 'mid' : 'lo';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

$('go').onclick = async () => {
  const news = (await DB.getAll('articles')).filter(a => a.status === 'done');
  byUrl = new Map(news.map(a => [a.url, a]));
  if (!news.length) { $('status').textContent = 'База новостей пуста — сначала соберите новости за нужный период.'; return; }
  const win = Math.max(0, +$('win').value || 0);
  rows = $('input').value.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(Boolean).map(line => {
    const [id, d] = line.split('\t');
    const res = matchFile(id.trim(), news, { window: win, date: d ? fileDate(d.trim()) : '' });
    return { id: id.trim(), date: res.date, res, choice: res.pick ? res.pick.a.url : '' };
  });
  render();
  $('status').textContent = `Файлов: ${rows.length}; новостей в базе: ${news.length}. Проверьте строки с жёлтым и красным фоном.`;
};

function render() {
  const t = $('out');
  t.innerHTML = '<tr><th>ID (имя файла)</th><th>Дата</th><th>Новость</th><th>Уверенность</th><th>Совпавшие слова</th></tr>';
  rows.forEach((r, i) => {
    const cands = [r.res.pick, ...r.res.alts].filter(Boolean);
    const opts = cands.map(c => `<option value="${esc(c.a.url)}"${c.a.url === r.choice ? ' selected' : ''}>${esc(label(c))}</option>`).join('');
    const tr = document.createElement('tr');
    tr.className = cls(r.res.conf);
    tr.innerHTML = `<td>${esc(r.id)}</td><td>${esc(r.date)}</td>
      <td><select data-i="${i}"><option value="">— нет подходящей —</option>${opts}</select>
      ${r.choice ? `<br><a href="${esc(r.choice)}" target="_blank">открыть</a>` : ''}</td>
      <td>${esc(r.res.conf)}</td><td>${esc((r.res.pick ? r.res.pick.hits : []).join(', '))}</td>`;
    t.appendChild(tr);
  });
  t.querySelectorAll('select').forEach(s => s.onchange = () => {
    const r = rows[+s.dataset.i];
    r.choice = s.value;
    r.res.conf = s.value ? 'выбрано вручную' : 'нет';
    render();
  });
}

// Колонки как в черновике каталога: ID | Дата | Ссылка на новость | Итоговое описание с сайта | Уверенность
function table() {
  return [['ID', 'Дата', 'Ссылка на новость nazarbayev.kz', 'Итоговое описание с сайта', 'Уверенность'],
    ...rows.map(r => {
      const a = byUrl.get(r.choice);
      return [r.id, r.date, a ? a.url : '', a ? `${a.title}\n${a.text}` : '', r.res.conf];
    })];
}
const cell = (s, sep) => { s = String(s ?? ''); return /["\n\r\t;]/.test(s) || s.includes(sep) ? '"' + s.replace(/"/g, '""') + '"' : s; };

$('copy').onclick = async () => {
  if (!rows.length) return;
  await navigator.clipboard.writeText(table().map(r => r.map(c => cell(c, '\t')).join('\t')).join('\n'));
  $('status').textContent = 'Скопировано. Вставьте в Google Таблицу (Ctrl+V) в свободную область или новый лист.';
};

$('csv').onclick = () => {
  if (!rows.length) return;
  const csv = '﻿' + table().map(r => r.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'sopostavlenie.csv';
  a.click();
};
