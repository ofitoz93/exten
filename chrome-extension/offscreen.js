// Runs Tesseract OCR (bundled locally) for burned-in video subtitles.
let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    const base = chrome.runtime.getURL('vendor/');
    workerPromise = Tesseract.createWorker('eng', 1, {
      workerPath: base + 'worker.min.js',
      corePath: base,
      langPath: base,
      workerBlobURL: false,
      gzip: true,
    }).then(async (w) => {
      await w.setParameters({ tessedit_pageseg_mode: '6' }); // uniform block of text
      return w;
    });
    workerPromise.catch(() => (workerPromise = null));
  }
  return workerPromise;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'OCR_RECOGNIZE') return;
  (async () => {
    try {
      const w = await getWorker();
      // Several preprocessing variants of the same crop; keep the one that reads best.
      const images = msg.images || [msg.image];
      let best = null;
      for (const image of images) {
        const { data } = await w.recognize(image);
        const goodLines = (data.lines || []).filter(
          (l) => l.confidence >= 30 && /[a-zA-Z]{2}/.test(l.text)
        );
        const words = [];
        let score = 0;
        goodLines.forEach((l) =>
          (l.words || []).forEach((wd) => {
            const t = (wd.text || '').trim();
            if (!t || !/[a-zA-Z]/.test(t) || wd.confidence < 25) return;
            words.push({ t, x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1 });
            score += wd.confidence * (t.match(/[a-zA-Z]/g) || []).length;
          })
        );
        const text = goodLines.map((l) => l.text.replace(/\s+/g, ' ').trim()).join('\n');
        if (!best || score > best.score) best = { score, text, words };
        if (score > 0 && best.score > 1500) break; // confident enough, skip remaining variants
      }
      sendResponse({ ok: true, text: best ? best.text : '', words: best ? best.words : [] });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true;
});
