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

  function showTooltip(x, y, { word, translation, alternatives, sentenceTranslation, syncedToPhone, loading }) {
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

      tip.innerHTML = `
        <div class="sr-tooltip-header">
          <span class="sr-tooltip-word">${escapeHtml(word)}</span>
          <span class="sr-tooltip-badge">${badgeText}</span>
        </div>
        <div class="sr-tooltip-tr">${escapeHtml(translation || '')}</div>
        ${altHtml}
        ${sentHtml}
      `;
    }

    document.body.appendChild(tip);
    activeTooltip = tip;

    const rect = tip.getBoundingClientRect();
    const left = Math.min(Math.max(12, x - rect.width / 2), window.innerWidth - rect.width - 12);
    const top = Math.max(12, y - rect.height - 14);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;

    if (!loading) {
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
      const tokens = rawText.split(/(\s+)/);
      seg.textContent = '';

      tokens.forEach((token) => {
        if (/^\s+$/.test(token)) {
          seg.appendChild(document.createTextNode(token));
          return;
        }
        const span = document.createElement('span');
        span.className = 'sr-clickable-word';
        span.textContent = token;

        // Prevent YouTube caption dragging or video play/pause toggle when clicking a word
        const stopEvent = (e) => {
          e.stopPropagation();
        };
        span.addEventListener('mousedown', stopEvent, true);
        span.addEventListener('mouseup', stopEvent, true);
        span.addEventListener('pointerdown', stopEvent, true);
        span.addEventListener('pointerup', stopEvent, true);

        span.addEventListener(
          'click',
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            const video = document.querySelector('video');
            if (video && !video.paused) {
              video.pause();
            }
            const sentence = getFullYoutubeCaptionSentence();
            const rect = span.getBoundingClientRect();
            translateWordAndShow(token, sentence, rect, 'youtube');
          },
          true
        );

        seg.appendChild(span);
      });
    });
  }

  const observer = new MutationObserver(() => {
    if (location.hostname.includes('youtube.com')) {
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

  // Dismiss tooltip when clicking outside
  document.addEventListener('mousedown', (e) => {
    if (activeTooltip && !activeTooltip.contains(e.target)) {
      removeTooltip();
    }
  });
})();

