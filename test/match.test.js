const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { skeleton, wordSim, fileDate, fileKeywords, matchFile } = require('../extension/match.js');

const files = fs.readFileSync(path.join(__dirname, 'fixtures/files_2019_05.txt'), 'utf8').trim().split('\n');

test('дата из имени файла', () => {
  assert.strictEqual(fileDate('01.05.19 Den edinstva naroda s Elbasy-Djavatarov-01.05.2019-S50,xcode mix,280.1'), '01.05.2019');
  assert.strictEqual(fileDate('13_05_2019_Centr_Zelenyh_Tehnologii_SBS_009,xcode mix,284.1'), '13.05.2019');
  assert.strictEqual(fileDate('16.05.2019_AEF_Foto Elbasy i PRK_Abilov_66'), '16.05.2019');
  assert.ok(files.every(f => fileDate(f)), 'у всех файлов партии читается дата');
});

test('транслит: латиница из имён ≈ кириллица сайта', () => {
  const sim = (a, b) => wordSim(skeleton(a), skeleton(b));
  assert.ok(sim('Chavychoglu', 'Чавушоглу') >= 0.75);
  assert.ok(sim('Kalijanovym', 'Калижановым') >= 0.75);
  assert.ok(sim('Zheenbekov', 'Жээнбековым') >= 0.75);
  assert.ok(sim('Pashinyan', 'Пашиняном') >= 0.75);
  assert.ok(sim('Usmanovym', 'Усмановым') >= 0.75);
  assert.ok(sim('Kelimbetovym', 'Келимбетовым') >= 0.75);
  assert.ok(sim('Tuskom', 'Туском') >= 0.75);
  assert.ok(sim('Putin', 'Лукашенко') < 0.75);
});

test('ключевые слова без операторов и технических слов', () => {
  const k = fileKeywords('28.05.19 Elbasy i Putin. Tlespaev.,xcode mix,33.1');
  assert.deepStrictEqual(k, [skeleton('Putin')]);
  assert.ok(fileKeywords('16.05.19 AEF lichniki,xcode mix,287.1').includes(skeleton('форум')));
});

// Тестовые новости (условные тексты), чтобы проверить выбор между несколькими событиями одного дня.
const news = [
  { url: 'u/putin', date: '28.05.2019', title: 'Нурсултан Назарбаев встретился с Президентом России Владимиром Путиным', text: '' },
  { url: 'u/luk', date: '28.05.2019', title: 'Нурсултан Назарбаев встретился с Президентом Беларуси Александром Лукашенко', text: '' },
  { url: 'u/pash', date: '28.05.2019', title: 'Встреча с Премьер-министром Армении Николом Пашиняном', text: '' },
  { url: 'u/kel', date: '13.05.2019', title: 'Встреча с управляющим МФЦА Кайратом Келимбетовым', text: '' },
  { url: 'u/moz', date: '13.05.2019', title: 'Встреча с Послом США Уильямом Мозером', text: '' },
  { url: 'u/usm', date: '13.05.2019', title: 'Встреча с Алишером Усмановым', text: 'Состоялась встреча с бизнесменом Алишером Усмановым.' },
  { url: 'u/tusk', date: '31.05.2019', title: 'Встреча с Председателем Европейского совета Дональдом Туском', text: '' },
  { url: 'u/nu', date: '31.05.2019', title: 'Церемония вручения дипломов выпускникам Назарбаев Университета', text: 'Открытие Атлетического центра' },
];

test('выбор новости среди событий одного дня', () => {
  const m = n => matchFile(n, news);
  assert.strictEqual(m('28.05.19 Elbasy i Putin. Malikov.,xcode mix,41.1').pick.a.url, 'u/putin');
  assert.strictEqual(m('28.05.19 Elbasy i Lukashenko. Stacionar.1').pick.a.url, 'u/luk');
  assert.strictEqual(m('28.05.19 Elbasy i Pashinyan. krupn.plan').pick.a.url, 'u/pash');
  assert.strictEqual(m('13.05.19 Vsttrecha Elbasy s Poslom USA v Kaz U.Mozerom. A.I.1').pick.a.url, 'u/moz');
  assert.strictEqual(m('13.05.19 Vstrecha Elbasy s Upravl.mejdunognogo fin.centra Astana K.Kelimbetovym. A.I.1').pick.a.url, 'u/kel');
  assert.strictEqual(m('31.05.19 Vstrecha Elbasy s D.Tuskom. Abilov.,xcode mix,40.1').pick.a.url, 'u/tusk');
  assert.strictEqual(m('31.05.2019 Elbasy vruch.diplomy. NU PGM 2,xcode mix,49.1').pick.a.url, 'u/nu');
  // файл за 11.05, а новость опубликована 13.05 — находится по окну ±2 дня
  const u = m('11.05.19 Vstrecha Elbasy s Usmanovym. N.Batkeev.1');
  assert.strictEqual(u.pick.a.url, 'u/usm');
  assert.strictEqual(u.pick.shift, 2);
});

test('дата: опечатка в годе и многодневная поездка', () => {
  assert.strictEqual(fileDate('02.04.019 Chemolgan S obshestvennostyu X.O.,xcode mix,79.1'), '02.04.2019');
  assert.strictEqual(fileDate('26-28.04.19. Elbasy. KNR. 26.04. Prilet. X.O.,xcode mix,141.1'), '26.04.2019');
  assert.strictEqual(fileDate('26-28.04.19. Elbasy. KNR. 27.04.Forum. Brifing. Kulmanov.,xcode mix,112.1'), '27.04.2019');
  assert.strictEqual(fileDate('26-28.04.19. Elbasy. KNR. 28.04. Vstrecha s Si Czinpin. X.O.,xcode mix,110.1'), '28.04.2019');
  assert.strictEqual(fileDate('23.04.19_19_Siezd_Nur_Otan_PGM_C0001_zanovo'), '23.04.2019');
  assert.strictEqual(fileDate('ANK PTS'), '');
});
