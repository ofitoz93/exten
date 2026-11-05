const SERVER_URL = 'http://localhost:8787/api/translate';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'TRANSLATE_AND_SAVE') {
    handleTranslateAndSave(message)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ error: err.message || 'Çeviri hatası' }));
    return true; // keep channel open for async response
  }
});

async function handleTranslateAndSave({ word, sentence = '', source = 'youtube' }) {
  try {
    const res = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, sentence, save: true, source }),
    });
    if (!res.ok) {
      throw new Error(`Server error ${res.status}`);
    }
    const data = await res.json();
    return {
      ok: true,
      syncedToPhone: true,
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

