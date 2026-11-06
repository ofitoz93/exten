(() => {
  // Ignore our own remote control page
  if (location.port === '8787') return;

  let activeTooltip = null;
  let hideTimer = null;

  function cleanWord(raw) {
    return String(raw || '')
      .trim()
      .replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, '')
      .trim();
  }

  function removeTooltip() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  }

  function showTooltip(
    x,
    y,
    { word, translation, alternatives, sentenceTranslation, syncedToPhone, loading, saveWord, persist }
  ) {
    removeTooltip();

    const tip = document.createElement('div');
    tip.className = 'sr-tooltip-popup';

    if (loading) {
      tip.innerHTML = `
        <div class="sr-tooltip-header">
          <span class="sr-tooltip-word">${escapeHtml(word)}</span>
          <span class="sr-tooltip-badge">Çevriliyor...</span>
        </div>
      `;
    } else {
      const altHtml =
        Array.isArray(alternatives) && alternatives.length > 0
          ? `<div class="sr-tooltip-alt">${alternatives
              .map((a) => `<b>${escapeHtml(a.pos)}:</b> ${(a.terms || []).map(escapeHtml).join(', ')}`)
              .join('<br/>')}</div>`
          : '';

      const sentHtml = sentenceTranslation
        ? `<div class="sr-tooltip-sentence">${escapeHtml(sentenceTranslation)}</div>`
        : '';

      const badgeText = syncedToPhone ? '✓ Telefona Kaydedildi' : '✓ Çevrildi';
      const saveHtml = saveWord && !syncedToPhone ? '<button class="sr-tooltip-save">Kaydet</button>' : '';

      tip.innerHTML = `
        <div class="sr-tooltip-header">
          <span class="sr-tooltip-word">${escapeHtml(word)}</span>
          <span class="sr-tooltip-badge">${badgeText}</span>
        </div>
        <div class="sr-tooltip-tr">${escapeHtml(translation || '')}</div>
        ${altHtml}
        ${sentHtml}
        ${saveHtml}
      `;
      const saveBtn = tip.querySelector('.sr-tooltip-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          saveBtn.disabled = true;
          saveBtn.textContent = 'Kaydediliyor…';
          const ok = await saveWord();
          saveBtn.textContent = ok ? '✓ Kaydedildi' : 'Kaydedilemedi (sunucu kapalı?)';
          saveBtn.disabled = ok;
        });
      }
    }

    (document.fullscreenElement || document.body).appendChild(tip);
    activeTooltip = tip;

    const rect = tip.getBoundingClientRect();
    const left = Math.min(Math.max(12, x - rect.width / 2), window.innerWidth - rect.width - 12);
    const top = Math.max(12, y - rect.height - 14);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;

    if (!loading && !persist) {
      hideTimer = setTimeout(removeTooltip, 6500);
    }
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function translateWordAndShow(word, sentence, anchorRect, source = 'web') {
    const cleaned = cleanWord(word);
    if (!cleaned || cleaned.length < 2) return;

    const centerX = anchorRect ? anchorRect.left + anchorRect.width / 2 : window.innerWidth / 2;
    const topY = anchorRect ? anchorRect.top : window.innerHeight / 2;

    showTooltip(centerX, topY, { word: cleaned, loading: true });

    chrome.runtime.sendMessage(
      {
        type: 'TRANSLATE_AND_SAVE',
        word: cleaned,
        sentence: sentence || '',
        source,
      },
      (response) => {
        if (!response || response.error || !response.result) {
          showTooltip(centerX, topY, {
            word: cleaned,
            translation: response?.error || 'Çeviri alınamadı.',
            syncedToPhone: false,
            loading: false,
          });
          return;
        }
        const r = response.result;
        showTooltip(centerX, topY, {
          word: r.word || cleaned,
          translation: r.translation,
          alternatives: r.alternatives,
          sentenceTranslation: r.sentenceTranslation,
          syncedToPhone: response.syncedToPhone,
          loading: false,
        });
      }
    );
  }

  // --- 1. YouTube Interactive Subtitles ---
  // Splits text into clickable word spans inside `container`.
  function appendClickableWords(container, rawText, getSentence, source) {
    const tokens = rawText.split(/(\s+)/);
    tokens.forEach((token) => {
      if (/^\s+$/.test(token) || token === '') {
        container.appendChild(document.createTextNode(token));
        return;
      }
      const span = document.createElement('span');
      span.className = 'sr-clickable-word';
      span.textContent = token;

      // Prevent caption dragging or video play/pause toggle when clicking a word
      const stopEvent = (e) => e.stopPropagation();
      ['mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach((t) =>
        span.addEventListener(t, stopEvent, true)
      );

      span.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          const video = document.querySelector('video');
          if (video && !video.paused) video.pause();
          translateWordAndShow(token, getSentence(), span.getBoundingClientRect(), source);
        },
        true
      );
      container.appendChild(span);
    });
  }

  function isYoutubeHost() {
    return /(^|\.)youtube(-nocookie)?\.com$/.test(location.hostname);
  }

  function getFullYoutubeCaptionSentence() {
    const segments = document.querySelectorAll('.ytp-caption-segment');
    return Array.from(segments)
      .map((s) => s.textContent || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function enhanceYoutubeCaptions() {
    const segments = document.querySelectorAll('.ytp-caption-segment');
    segments.forEach((seg) => {
      const rawText = seg.textContent || '';
      if (!rawText.trim()) return;
      if (seg.dataset.srProcessed === rawText && seg.querySelector('.sr-clickable-word')) {
        return;
      }

      seg.dataset.srProcessed = rawText;
      seg.textContent = '';
      appendClickableWords(seg, rawText, getFullYoutubeCaptionSentence, 'youtube');
    });
  }

  const observer = new MutationObserver(() => {
    if (isYoutubeHost()) {
      enhanceYoutubeCaptions();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // --- 2. Double-Click Any Word on Any Webpage ---
  document.addEventListener('dblclick', (e) => {
    if (e.target && e.target.closest && e.target.closest('.sr-clickable-word, .sr-tooltip-popup')) {
      return;
    }
    const sel = window.getSelection();
    const selectedText = sel ? sel.toString().trim() : '';
    const cleaned = cleanWord(selectedText);
    if (!cleaned || cleaned.length < 2 || cleaned.length > 45) return;
    if (!/[a-zA-Z]/.test(cleaned)) return;

    let rect = null;
    try {
      if (sel.rangeCount > 0) {
        rect = sel.getRangeAt(0).getBoundingClientRect();
      }
    } catch {
      // ignore
    }
    translateWordAndShow(cleaned, '', rect, location.hostname || 'web');
  });


  // --- 3. Embedded (HTML5 <track>/VTT) subtitles on any site ---
  // Native cues are hidden and re-rendered in our own overlay with clickable words.
  const trackState = new WeakMap(); // video -> { overlay, track, handler }

  function getOverlayHost() {
    return document.fullscreenElement || document.body;
  }

  function renderCues(video, state) {
    const cues = state.track.activeCues ? Array.from(state.track.activeCues) : [];
    const text = cues
      .map((c) => (c.text || '').replace(/<[^>]+>/g, ''))
      .join('\n')
      .trim();
    renderOverlayText(state, text);
  }

  function renderOverlayText(state, text) {
    if (text === state.lastText) return;
    state.lastText = text;
    state.overlay.textContent = '';
    if (!text) {
      state.overlay.style.display = 'none';
      return;
    }
    const sentence = text.replace(/\s+/g, ' ');
    text.split('\n').forEach((line) => {
      const lineEl = document.createElement('div');
      lineEl.className = 'sr-track-line';
      appendClickableWords(lineEl, line, () => sentence, location.hostname || 'web');
      state.overlay.appendChild(lineEl);
    });
    state.overlay.style.display = 'block';
  }

  function positionOverlay(video, state) {
    const r = video.getBoundingClientRect();
    const o = state.overlay;
    if (r.width < 50 || r.height < 50) {
      o.style.display = 'none';
      return;
    }
    const host = getOverlayHost();
    if (o.parentNode !== host) host.appendChild(o);
    o.style.left = `${r.left + r.width / 2}px`;
    o.style.bottom = `${Math.max(0, window.innerHeight - r.bottom) + r.height * 0.08}px`;
    o.style.maxWidth = `${r.width * 0.9}px`;
    o.style.fontSize = `${Math.max(14, Math.min(34, r.height * 0.05))}px`;
  }

  function attachVideo(video) {
    if (location.hostname && isYoutubeHost()) return; // YouTube handled in section 1
    const tracks = Array.from(video.textTracks || []).filter(
      (t) => t.kind === 'subtitles' || t.kind === 'captions'
    );
    if (tracks.length === 0) return;

    let state = trackState.get(video);
    // Prefer the track the page is currently showing; otherwise keep ours.
    const showing = tracks.find((t) => t.mode === 'showing');
    const chosen = showing || (state && state.track) || null;
    if (!chosen) return;

    if (!state) {
      const overlay = document.createElement('div');
      overlay.className = 'sr-track-overlay';
      overlay.style.display = 'none';
      state = { overlay, track: null, lastText: null };
      trackState.set(video, state);
      video.addEventListener('timeupdate', () => renderCues(video, state));
    }
    if (state.track !== chosen) {
      if (state.track) state.track.removeEventListener('cuechange', state.handler);
      state.track = chosen;
      state.handler = () => renderCues(video, state);
      chosen.addEventListener('cuechange', state.handler);
    }
    chosen.mode = 'hidden'; // stop the native renderer, keep cues flowing
    renderCues(video, state);
    positionOverlay(video, state);
  }

  setInterval(() => {
    if (isYoutubeHost()) return;
    document.querySelectorAll('video').forEach((video) => {
      try {
        attachVideo(video);
        const st = trackState.get(video);
        if (st) positionOverlay(video, st);
      } catch {
        // ignore cross-origin / detached video errors
      }
    });
  }, 400);

  // --- 4. OCR for subtitles burned into the video picture ---
  // Toggle with the "OCR" button on the video or Alt+O. Runs fully locally (Tesseract).
  const ocrStates = new WeakMap(); // video -> state
  let ocrBusy = false;

  function ensureOcrState(video) {
    let st = ocrStates.get(video);
    if (st) return st;
    const button = document.createElement('div');
    button.className = 'sr-ocr-button';
    button.style.display = 'none';
    button.textContent = 'OCR: kapalı';
    button.addEventListener('mousedown', (e) => e.stopPropagation(), true);
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleOcr(video);
    });
    const layer = document.createElement('div');
    layer.className = 'sr-ocr-layer';
    st = { button, layer, enabled: false, hover: false, words: [], text: '', sig: null, blankCount: 0 };
    ocrStates.set(video, st);
    return st;
  }

  // Where the video picture is actually drawn inside the <video> element (object-fit: contain).
  function videoContentRect(video) {
    const r = video.getBoundingClientRect();
    const vw = video.videoWidth || r.width;
    const vh = video.videoHeight || r.height;
    const s = Math.min(r.width / vw, r.height / vh);
    const w = vw * s;
    const h = vh * s;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h };
  }

  // words: [{t, fx0, fy0, fx1, fy1}] with coordinates as fractions of the video picture.
  function setOcrWords(st, words, text) {
    st.words = words;
    st.text = text;
    st.layer.textContent = '';
    st.spans = words.map((w) => {
      const span = document.createElement('span');
      span.className = 'sr-clickable-word sr-ocr-word';
      span.textContent = w.t;
      span.dataset.w = w.t;
      const stop = (e) => e.stopPropagation();
      ['mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach((t) =>
        span.addEventListener(t, stop, true)
      );
      span.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          const v = document.querySelector('video');
          if (v && !v.paused) v.pause();
          // saving is done explicitly with the tooltip's "Kaydet" button
        },
        true
      );
      st.layer.appendChild(span);
      return span;
    });
    st.layoutKey = null;
  }

  function layoutOcrWords(video, st) {
    const c = videoContentRect(video);
    const key = [c.left, c.top, c.width, c.height].map(Math.round).join(',');
    if (key === st.layoutKey) return;
    st.layoutKey = key;
    st.words.forEach((w, i) => {
      const s = st.spans[i].style;
      const pad = 3;
      s.left = `${c.left + w.fx0 * c.width - pad}px`;
      s.top = `${c.top + w.fy0 * c.height - pad}px`;
      s.width = `${(w.fx1 - w.fx0) * c.width + pad * 2}px`;
      s.height = `${(w.fy1 - w.fy0) * c.height + pad * 2}px`;
      s.fontSize = `${Math.max(10, (w.fy1 - w.fy0) * c.height * 0.8)}px`;
    });
  }

  function toggleOcr(video) {
    const st = ensureOcrState(video);
    st.enabled = !st.enabled;
    st.sig = null;
    st.button.textContent = st.enabled ? 'OCR: açık' : 'OCR: kapalı';
    st.button.classList.toggle('sr-ocr-on', st.enabled);
    if (!st.enabled) setOcrWords(st, [], '');
  }

  function mainVideo() {
    const vids = Array.from(document.querySelectorAll('video')).filter((v) => {
      const r = v.getBoundingClientRect();
      return r.width >= 200 && r.height >= 120;
    });
    vids.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
    return vids[0] || null;
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'o' || e.key === 'O')) {
      const v = mainVideo();
      if (v) {
        e.preventDefault();
        toggleOcr(v);
      }
    }
  });

  // Position of this frame inside the top-level tab (needed for screenshot cropping in iframes).
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.srType !== 'sr-frame-offset-req') return;
    const reply = (off) => e.source.postMessage({ srType: 'sr-frame-offset-res', id: m.id, off }, '*');
    let iframe = null;
    document.querySelectorAll('iframe,frame').forEach((f) => {
      if (f.contentWindow === e.source) iframe = f;
    });
    if (!iframe) return;
    const r = iframe.getBoundingClientRect();
    const own = { x: r.left + iframe.clientLeft, y: r.top + iframe.clientTop };
    if (window.top === window) {
      reply({ x: own.x, y: own.y, topWidth: window.innerWidth });
      return;
    }
    getFrameOffset().then((up) => reply({ x: up.x + own.x, y: up.y + own.y, topWidth: up.topWidth }));
  });

  function getFrameOffset() {
    if (window.top === window) return Promise.resolve({ x: 0, y: 0, topWidth: window.innerWidth });
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        window.removeEventListener('message', onMsg);
        reject(new Error('iframe konumu alınamadı'));
      }, 1500);
      function onMsg(e) {
        const m = e.data;
        if (!m || m.srType !== 'sr-frame-offset-res' || m.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        resolve(m.off);
      }
      window.addEventListener('message', onMsg);
      window.parent.postMessage({ srType: 'sr-frame-offset-req', id }, '*');
    });
  }

  // Crops a region of the video and prepares two OCR variants of it:
  //  - gray: contrast-stretched grayscale (works for outlined / coloured fonts)
  //  - bin:  Otsu-thresholded with the minority colour as text (works for plain light/dark fonts)
  async function grabSubtitleBand(video, region) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    // region in video pixels; defaults to the bottom band
    const bandH = region ? Math.round(region.bh) : Math.round(vh * 0.32);
    const sy = region ? Math.round(region.sy) : vh - bandH;
    const sx = region ? Math.round(region.sx) : 0;
    const bandW = region ? Math.round(region.bw) : vw;
    const scale = region ? Math.min(4, Math.max(1, 140 / bandH)) : Math.min(2, Math.max(1, 1000 / vw));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bandW * scale);
    canvas.height = Math.round(bandH * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let imgData;
    try {
      ctx.drawImage(video, sx, sy, bandW, bandH, 0, 0, canvas.width, canvas.height);
      imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      // Tainted canvas (cross-origin / protected video): fall back to a tab screenshot.
      // Inside iframes we first ask the parent frames where this frame sits in the tab.
      const frame = await getFrameOffset();
      const res = await chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' });
      if (!res || !res.ok) throw new Error((res && res.error) || 'ekran görüntüsü alınamadı');
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = res.dataUrl;
      });
      const k = img.width / frame.topWidth;
      const c = videoContentRect(video); // crop exactly the drawn picture region
      ctx.drawImage(
        img,
        (frame.x + c.left + (sx / vw) * c.width) * k,
        (frame.y + c.top + (sy / vh) * c.height) * k,
        (bandW / vw) * c.width * k,
        (bandH / vh) * c.height * k,
        0,
        0,
        canvas.width,
        canvas.height
      );
      imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    const d = imgData.data;
    const cw = canvas.width;
    const ch = canvas.height;
    const n = cw * ch;
    const lum = new Uint8Array(n);
    const hist = new Uint32Array(256);
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
      lum[p] = l;
      hist[l]++;
    }
    const pct = (q) => {
      let acc = 0;
      for (let v = 0; v < 256; v++) {
        acc += hist[v];
        if (acc >= n * q) return v;
      }
      return 255;
    };
    const lo = pct(0.02);
    const hi = pct(0.98);
    if (hi - lo < 40) {
      return { empty: true, scale, sx, sy, vw, vh };
    }
    // Otsu threshold
    let sumAll = 0;
    for (let v = 0; v < 256; v++) sumAll += v * hist[v];
    let wB = 0;
    let sumB = 0;
    let bestVar = -1;
    let thr = 128;
    for (let v = 0; v < 256; v++) {
      wB += hist[v];
      if (wB === 0) continue;
      const wF = n - wB;
      if (wF === 0) break;
      sumB += v * hist[v];
      const mB = sumB / wB;
      const mF = (sumAll - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > bestVar) {
        bestVar = between;
        thr = v;
      }
    }
    let above = 0;
    for (let v = thr + 1; v < 256; v++) above += hist[v];
    const textIsBright = above < n - above; // text is normally the minority colour

    const makeCanvas = (fn) => {
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const cx = c.getContext('2d');
      const out = cx.createImageData(cw, ch);
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        const v = fn(lum[p]);
        out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
        out.data[i + 3] = 255;
      }
      cx.putImageData(out, 0, 0);
      return c;
    };
    const stretch = (l) => Math.max(0, Math.min(255, ((l - lo) * 255) / (hi - lo)));
    const gray = makeCanvas((l) => (textIsBright ? 255 - stretch(l) : stretch(l)));
    const bin = makeCanvas((l) => ((textIsBright ? l > thr : l <= thr) ? 0 : 255));
    const binInv = makeCanvas((l) => ((textIsBright ? l <= thr : l > thr) ? 0 : 255));
    return { empty: false, images: [gray, bin, binInv], scale, sx, sy, vw, vh };
  }

  function positionOcrUi(video, st) {
    const r = video.getBoundingClientRect();
    const visible = r.width >= 200 && r.height >= 120 && r.bottom > 0 && r.top < window.innerHeight;
    const host = document.fullscreenElement || document.body;
    if (st.button.parentNode !== host) host.appendChild(st.button);
    if (st.layer.parentNode !== host) {
      host.appendChild(st.layer);
      st.layoutKey = null;
    }
    st.button.style.display = visible && (st.hover || st.enabled) ? 'block' : 'none';
    st.layer.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    st.button.style.left = `${Math.max(0, r.left) + 10}px`;
    st.button.style.top = `${Math.max(0, r.top) + 10}px`;
    layoutOcrWords(video, st);
  }

  document.addEventListener(
    'mousemove',
    (e) => {
      document.querySelectorAll('video').forEach((v) => {
        const r = v.getBoundingClientRect();
        if (r.width < 200 || r.height < 120) return;
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        const st = ensureOcrState(v);
        st.hover = inside;
        if (inside && st.enabled && !(e.target && e.target.closest && e.target.closest('.sr-ocr-word, .sr-ocr-button, .sr-tooltip-popup'))) {
          scheduleScan(v, st, e.clientX, e.clientY);
        }
      });
    },
    { passive: true }
  );

  // Hover scan: OCR only the area around the cursor and highlight the word under it.
  function scheduleScan(video, st, x, y) {
    st.cursor = { x, y };
    clearTimeout(st.scanTimer);
    st.scanTimer = setTimeout(() => scanAtCursor(video, st), 180);
  }

  // Translate the hovered word without saving; the tooltip offers a "Kaydet" button.
  function hoverTranslate(st, rawWord, sentenceRaw) {
    const word = cleanWord(rawWord);
    if (!word || word.length < 2) return;
    const sentence = (sentenceRaw || '').replace(/\s+/g, ' ');
    const token = (st.hoverToken = (st.hoverToken || 0) + 1);
    const rect = st.spans && st.spans[0] ? st.spans[0].getBoundingClientRect() : null;
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top - 4 : window.innerHeight / 2;
    showTooltip(x, y, { word, loading: true });
    const request = (save) =>
      new Promise((resolve) =>
        chrome.runtime.sendMessage({ type: 'TRANSLATE_AND_SAVE', word, sentence, source: 'ocr', save }, resolve)
      );
    request(false).then((response) => {
      if (token !== st.hoverToken) return; // cursor moved on to another word
      if (!response || response.error || !response.result) {
        showTooltip(x, y, {
          word,
          translation: (response && response.error) || 'Çeviri alınamadı.',
          loading: false,
          persist: true,
        });
        return;
      }
      const r = response.result;
      showTooltip(x, y, {
        word: r.word || word,
        translation: r.translation,
        alternatives: r.alternatives,
        sentenceTranslation: r.sentenceTranslation,
        syncedToPhone: false,
        loading: false,
        persist: true,
        saveWord: async () => {
          const saved = await request(true);
          return !!(saved && !saved.error && saved.syncedToPhone);
        },
      });
    });
  }

  async function scanAtCursor(video, st) {
    if (!st.enabled || ocrBusy || !st.cursor) return;
    const { x: cx, y: cy } = st.cursor;
    const c = videoContentRect(video);
    const fx = (cx - c.left) / c.width;
    const fy = (cy - c.top) / c.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    const bw = Math.min(vw, vw * 0.5);
    const bh = Math.min(vh, Math.max(60, vh * 0.16));
    const sx = Math.min(Math.max(0, fx * vw - bw / 2), vw - bw);
    const sy = Math.min(Math.max(0, fy * vh - bh / 2), vh - bh);

    ocrBusy = true;
    st.layer.style.visibility = 'hidden'; // keep our own boxes out of a screenshot
    try {
      st.button.textContent = 'OCR: taranıyor…';
      const band = await grabSubtitleBand(video, { sx, sy, bw, bh });
      st.layer.style.visibility = '';
      if (!band) return;
      if (band.empty) {
        st.button.textContent = 'OCR: açık (yazı yok)';
        return;
      }
      const res = await chrome.runtime.sendMessage({
        type: 'OCR_REQUEST',
        images: band.images.map((c) => c.toDataURL('image/png')),
      });
      if (!res || !res.ok) throw new Error((res && res.error) || 'OCR başarısız');
      const cand = (res.words || []).map((w) => ({
        t: w.t,
        fx0: (w.x0 / band.scale + band.sx) / band.vw,
        fx1: (w.x1 / band.scale + band.sx) / band.vw,
        fy0: (w.y0 / band.scale + band.sy) / band.vh,
        fy1: (w.y1 / band.scale + band.sy) / band.vh,
      }));
      // nearest word to the cursor (distance to its box on screen)
      let best = null;
      let bestD = 28;
      cand.forEach((w) => {
        const l = c.left + w.fx0 * c.width;
        const r = c.left + w.fx1 * c.width;
        const t = c.top + w.fy0 * c.height;
        const b = c.top + w.fy1 * c.height;
        const dx = Math.max(l - cx, 0, cx - r);
        const dy = Math.max(t - cy, 0, cy - b);
        const d = Math.hypot(dx, dy);
        if (d < bestD) {
          bestD = d;
          best = w;
        }
      });
      if (best) {
        const same = st.words[0] && st.words[0].t === best.t && Math.abs(st.words[0].fx0 - best.fx0) < 0.01;
        if (!same) {
          setOcrWords(st, [best], res.text);
          layoutOcrWords(video, st);
          hoverTranslate(st, best.t, res.text);
        }
        st.button.textContent = 'OCR: açık';
      } else {
        // keep the current word/tooltip so the cursor can travel to the "Kaydet" button
        st.button.textContent = 'OCR: açık (kelime bulunamadı)';
      }
    } catch (err) {
      st.button.textContent = 'OCR hata: ' + String((err && err.message) || err).slice(0, 80);
    } finally {
      st.layer.style.visibility = '';
      ocrBusy = false;
    }
  }

  setInterval(() => {
    document.querySelectorAll('video').forEach((v) => {
      const st = ocrStates.get(v);
      if (st) positionOcrUi(v, st);
    });
  }, 500);

  // Dismiss tooltip when clicking outside
  document.addEventListener('mousedown', (e) => {
    if (activeTooltip && !activeTooltip.contains(e.target)) {
      removeTooltip();
    }
  });
})();

