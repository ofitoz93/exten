const SERVER_URL = 'http://localhost:8787/api/translate';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'TRANSLATE_AND_SAVE') {
    handleTranslateAndSave(message)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ error: err.message || 'Çeviri hatası' }));
    return true; // keep channel open for async response
  }
  if (message && message.type === 'OCR_REQUEST') {
    ocrViaOffscreen(message.images || [message.image])
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err.message || 'OCR hatası' }));
    return true;
  }
  if (message && message.type === 'CAPTURE_TAB') {
    chrome.tabs.captureVisibleTab(sender.tab ? sender.tab.windowId : undefined, { format: 'png' })
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

let creatingOffscreen = null;
async function ensureOffscreen() {
  const url = chrome.runtime.getURL('offscreen.html');
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url],
  });
  if (existing.length > 0) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS'],
        justification: 'Run OCR on burned-in video subtitles',
      })
      .finally(() => (creatingOffscreen = null));
  }
  await creatingOffscreen;
}

async function ocrViaOffscreen(images) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ type: 'OCR_RECOGNIZE', images });
}

async function handleTranslateAndSave({ word, sentence = '', source = 'youtube', save = true }) {
  try {
    const res = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, sentence, save, source }),
    });
    if (!res.ok) {
      throw new Error(`Server error ${res.status}`);
    }
    const data = await res.json();
    return {
      ok: true,
      syncedToPhone: data.saved !== false,
      result: data.result,
    };
  } catch {
    // Fallback if local Node server is not running: translate directly via Google Translate
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&dt=bd&q=' +
      encodeURIComponent(word);
    const gRes = await fetch(url);
    const data = await gRes.json();
    const translation = Array.isArray(data[0])
      ? data[0].map((p) => (p && p[0]) || '').join('')
      : '';
    const alternatives = Array.isArray(data[1])
      ? data[1].map((e) => ({ pos: e[0], terms: (e[1] || []).slice(0, 5) }))
      : [];
    return {
      ok: true,
      syncedToPhone: false,
      result: {
        word,
        translation,
        alternatives,
        sentence,
        sentenceTranslation: '',
      },
    };
  }
}

