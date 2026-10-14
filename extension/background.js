// Запускает скрытую страницу (offscreen), в которой идёт сбор. Окно расширения закрывать можно.
async function ensureOffscreen() {
  try { if (await chrome.offscreen.hasDocument()) return; } catch (e) {}
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['DOM_PARSER'],
    justification: 'Разбор HTML страниц новостей в фоне'
  });
}
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'background') return;
  ensureOffscreen()
    .then(() => chrome.runtime.sendMessage(Object.assign({}, msg, { target: 'offscreen' })))
    .then(() => sendResponse({ ok: true }))
    .catch(e => sendResponse({ ok: false, error: String(e) }));
  return true;
});
