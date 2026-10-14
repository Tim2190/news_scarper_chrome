const info = document.getElementById('info');
const send = (cmd, extra) => chrome.runtime.sendMessage(Object.assign({ target: 'background', cmd }, extra));
const range = () => ({
  from: document.getElementById('from').value.replace(/-/g, ''),
  to: document.getElementById('to').value.replace(/-/g, '')
});

async function refresh() {
  const st = (await DB.get('state', 'status')) || {};
  const all = await DB.getAll('articles');
  const bad = all.filter(a => a.status !== 'done').length;
  const alive = st.running && Date.now() - st.ts <= 120000;
  let line = st.msg || 'Ещё не запускалось.';
  if (st.running && !alive) line = 'Похоже, сбор остановился (браузер закрывали?). Запустите ещё раз — продолжит с места остановки.';
  info.textContent = `${alive ? '▶ Идёт сбор' : '■ Не работает'}\n${line}\nНовостей в базе: ${all.length - bad}` +
    (bad ? `\nНе скачались: ${bad}` : '') + (alive && st.page ? `\nСейчас: ${st.page}` : '');
}
setInterval(refresh, 1500); refresh();

document.getElementById('period').onclick = () => send('start', Object.assign({ mode: 'period' }, range()));
document.getElementById('full').onclick = () => send('start', { mode: 'full' });
document.getElementById('update').onclick = () => send('start', { mode: 'update' });
document.getElementById('retry').onclick = () => send('start', { mode: 'retry' });
document.getElementById('stop').onclick = () => send('stop');
document.getElementById('match').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('match.html') });
document.getElementById('clear').onclick = async () => {
  if (!confirm('Удалить всю собранную базу?')) return;
  await DB.clear('articles'); await DB.clear('state'); refresh();
};

const key = d => d ? d.split('.').reverse().join('') : '99999999';
document.getElementById('csv').onclick = async () => {
  const { from: f, to: t } = range();
  const rows = (await DB.getAll('articles')).filter(a => a.status === 'done')
    .filter(a => { const k = key(a.date); return (!f || k >= f) && (!t || k <= t); })
    .sort((a, b) => key(a.date).localeCompare(key(b.date)));
  const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const csv = '﻿' + [['Дата', 'Рубрика', 'Заголовок', 'Ссылка', 'Текст', 'Фото'],
    ...rows.map(a => [a.date, a.rubric, a.title, a.url, a.text, a.photos])]
    .map(r => r.map(q).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `novosti_${f || 'all'}_${t || 'all'}.csv`;
  a.click();
  info.textContent = `Выгружено новостей: ${rows.length}`;
};
