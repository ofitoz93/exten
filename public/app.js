(() => {
  const TOKEN_KEY = 'rc_token';
  const RECONNECT_DELAY_MS = 3000;

  const statusEl = document.getElementById('status');
  const tabsEl = document.getElementById('tabs');
  const wordsBadgeEl = document.getElementById('words-badge');
  const pairingEl = document.getElementById('pairing');
  const pairingErrorEl = document.getElementById('pairing-error');
  const tokenInput = document.getElementById('token-input');
  const tokenSubmit = document.getElementById('token-submit');
  const controlsEl = document.getElementById('controls');
  const wordsViewEl = document.getElementById('words-view');
  const trackpadEl = document.getElementById('trackpad');
  const clickBtn = document.getElementById('click-btn');
  const captureWordBtn = document.getElementById('capture-word-btn');

  // Translation card elements
  const translationCardEl = document.getElementById('translation-card');
  const tcWordEl = document.getElementById('tc-word');
  const tcSpeakBtn = document.getElementById('tc-speak');
  const tcSavedBadgeEl = document.getElementById('tc-saved-badge');
  const tcCloseBtn = document.getElementById('tc-close');
  const tcTranslationEl = document.getElementById('tc-translation');
  const tcAlternativesEl = document.getElementById('tc-alternatives');
  const tcSentenceEl = document.getElementById('tc-sentence');

  // Words view elements
  const manualForm = document.getElementById('manual-translate-form');
  const manualInput = document.getElementById('manual-word-input');
  const wordsCountLabel = document.getElementById('words-count-label');
  const wordsListEl = document.getElementById('words-list');

  let ws = null;
  let everOpened = false;
  let activeTab = 'remote';
  let savedWords = [];
  let currentCardWord = '';

  function speakEnglish(text) {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';
    window.speechSynthesis.speak(utter);
  }

  function getStoredToken() {
    const fromUrl = new URL(location.href).searchParams.get('token');
    if (fromUrl) {
      localStorage.setItem(TOKEN_KEY, fromUrl);
      history.replaceState(null, '', location.pathname);
      return fromUrl;
    }
    return localStorage.getItem(TOKEN_KEY);
  }

  function showPairing(errorMessage) {
    pairingEl.classList.remove('hidden');
    tabsEl.classList.add('hidden');
    controlsEl.classList.add('hidden');
    wordsViewEl.classList.add('hidden');
    if (errorMessage) {
      pairingErrorEl.textContent = errorMessage;
      pairingErrorEl.classList.remove('hidden');
    } else {
      pairingErrorEl.classList.add('hidden');
    }
  }

  function switchTab(tabName) {
    activeTab = tabName;
    document.querySelectorAll('.tab[data-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    if (tabName === 'remote') {
      controlsEl.classList.remove('hidden');
      wordsViewEl.classList.add('hidden');
    } else {
      controlsEl.classList.add('hidden');
      wordsViewEl.classList.remove('hidden');
      renderWordsList(manualInput.value.trim());
    }
  }

  function showAuthenticatedUI() {
    pairingEl.classList.add('hidden');
    tabsEl.classList.remove('hidden');
    switchTab(activeTab);
  }

  function setStatus(connected) {
    statusEl.textContent = connected ? '● Bağlandı' : '● Bağlantı yok';
    statusEl.classList.toggle('connected', connected);
    statusEl.classList.toggle('disconnected', !connected);
  }

  function showTranslationCard(entry, isSaved = true) {
    if (!entry) return;
    currentCardWord = entry.word || '';
    translationCardEl.classList.remove('hidden', 'error-card');
    tcWordEl.textContent = entry.word || '';
    tcSpeakBtn.classList.remove('hidden');
    tcSavedBadgeEl.classList.toggle('hidden', !isSaved);
    tcTranslationEl.textContent = entry.translation || '';

    const alts = Array.isArray(entry.alternatives) ? entry.alternatives : [];
    if (alts.length > 0) {
      tcAlternativesEl.textContent = alts
        .map((a) => `${a.pos}: ${(a.terms || []).join(', ')}`)
        .join(' · ');
      tcAlternativesEl.classList.remove('hidden');
    } else {
      tcAlternativesEl.textContent = '';
      tcAlternativesEl.classList.add('hidden');
    }

    if (entry.sentence) {
      tcSentenceEl.textContent = entry.sentenceTranslation
        ? `"${entry.sentence}" — ${entry.sentenceTranslation}`
        : `"${entry.sentence}"`;
      tcSentenceEl.classList.remove('hidden');
    } else {
      tcSentenceEl.textContent = '';
      tcSentenceEl.classList.add('hidden');
    }
  }

  function showCardError(message) {
    currentCardWord = '';
    translationCardEl.classList.remove('hidden');
    translationCardEl.classList.add('error-card');
    tcWordEl.textContent = 'Uyarı';
    tcSpeakBtn.classList.add('hidden');
    tcSavedBadgeEl.classList.add('hidden');
    tcTranslationEl.textContent = message;
    tcAlternativesEl.classList.add('hidden');
    tcSentenceEl.classList.add('hidden');
  }

  function updateWordsState(words) {
    savedWords = Array.isArray(words) ? words : [];
    wordsBadgeEl.textContent = String(savedWords.length);
    wordsCountLabel.textContent = `${savedWords.length} kayıtlı kelime`;
    renderWordsList(manualInput.value.trim());
  }

  function renderWordsList(filterText = '') {
    const query = filterText.toLowerCase();
    const list = query
      ? savedWords.filter(
          (w) =>
            (w.word || '').toLowerCase().includes(query) ||
            (w.translation || '').toLowerCase().includes(query)
        )
      : savedWords;

    if (list.length === 0) {
      wordsListEl.innerHTML =
        '<div class="empty-state">Henüz kayıtlı kelime yok.<br/>YouTube\'da bir kelimeye tıklayın veya kumandada "Kelimeyi Çevir & Kaydet" butonunu kullanın.</div>';
      return;
    }

    wordsListEl.innerHTML = '';
    for (const item of list) {
      const card = document.createElement('div');
      card.className = 'word-item';

      const top = document.createElement('div');
      top.className = 'word-item-top';

      const leftGroup = document.createElement('div');
      leftGroup.className = 'word-title-group';

      const enSpan = document.createElement('span');
      enSpan.className = 'word-item-en';
      enSpan.textContent = item.word;

      const speakBtn = document.createElement('button');
      speakBtn.className = 'icon-btn';
      speakBtn.textContent = '🔊';
      speakBtn.addEventListener('click', () => speakEnglish(item.word));

      leftGroup.appendChild(enSpan);
      leftGroup.appendChild(speakBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.textContent = '🗑️';
      delBtn.title = 'Sil';
      delBtn.addEventListener('click', () => {
        send({ type: 'delete_word', id: item.id });
      });

      top.appendChild(leftGroup);
      top.appendChild(delBtn);

      const trDiv = document.createElement('div');
      trDiv.className = 'word-item-tr';
      trDiv.textContent = item.translation;

      card.appendChild(top);
      card.appendChild(trDiv);

      if (Array.isArray(item.alternatives) && item.alternatives.length > 0) {
        const altDiv = document.createElement('div');
        altDiv.className = 'word-item-alt';
        altDiv.textContent = item.alternatives
          .map((a) => `${a.pos}: ${(a.terms || []).join(', ')}`)
          .join(' · ');
        card.appendChild(altDiv);
      }

      if (item.sentence) {
        const sentDiv = document.createElement('div');
        sentDiv.className = 'word-item-sentence';
        sentDiv.textContent = item.sentenceTranslation
          ? `"${item.sentence}" → ${item.sentenceTranslation}`
          : `"${item.sentence}"`;
        card.appendChild(sentDiv);
      }

      wordsListEl.appendChild(card);
    }
  }

  function connect(token) {
    everOpened = false;
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${location.host}/ws?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
      everOpened = true;
      setStatus(true);
      showAuthenticatedUI();
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'connected' && Array.isArray(msg.words)) {
        updateWordsState(msg.words);
      } else if (msg.type === 'capturing') {
        captureWordBtn.textContent = '⏳ Çevriliyor...';
      } else if (msg.type === 'word_translated') {
        captureWordBtn.textContent = '🎯 Kelimeyi Çevir & Kaydet';
        showTranslationCard(msg.entry, msg.saved);
      } else if (msg.type === 'words_updated') {
        updateWordsState(msg.words);
      } else if (msg.type === 'word_error') {
        captureWordBtn.textContent = '🎯 Kelimeyi Çevir & Kaydet';
        showCardError(msg.message);
      }
    };

    ws.onclose = (event) => {
      setStatus(false);
      const authFailed = event.code === 4001 || !everOpened;
      if (authFailed) {
        localStorage.removeItem(TOKEN_KEY);
        showPairing('Geçersiz token, tekrar dene.');
      } else {
        setTimeout(() => connect(token), RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => {};
  }

  function send(payload) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!ws || ws.readyState !== WebSocket.OPEN || !token) return;
    ws.send(JSON.stringify({ ...payload, token }));
  }

  // --- Event Listeners ---
  document.querySelectorAll('.tab[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  tokenSubmit.addEventListener('click', () => {
    const token = tokenInput.value.trim();
    if (!token) return;
    localStorage.setItem(TOKEN_KEY, token);
    connect(token);
  });

  document.querySelectorAll('.btn[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      send({ type: 'button', action: btn.dataset.action });
    });
  });

  clickBtn.addEventListener('click', () => {
    send({ type: 'click' });
  });

  captureWordBtn.addEventListener('click', () => {
    send({ type: 'capture_word' });
  });

  tcSpeakBtn.addEventListener('click', () => {
    speakEnglish(currentCardWord);
  });

  tcCloseBtn.addEventListener('click', () => {
    translationCardEl.classList.add('hidden');
  });

  manualInput.addEventListener('input', () => {
    renderWordsList(manualInput.value.trim());
  });

  manualForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const word = manualInput.value.trim();
    if (!word) return;
    send({ type: 'translate_and_save', word, source: 'phone' });
    manualInput.value = '';
    renderWordsList('');
  });

  // --- Trackpad: drag moves the PC cursor, a short tap clicks it ---
  let touchActive = false;
  let lastX = 0;
  let lastY = 0;
  let startTime = 0;
  let totalMovement = 0;
  let pendingDx = 0;
  let pendingDy = 0;
  let rafScheduled = false;

  const TAP_MAX_DURATION_MS = 200;
  const TAP_MAX_MOVEMENT_PX = 8;

  function flushMove() {
    rafScheduled = false;
    if (pendingDx === 0 && pendingDy === 0) return;
    send({ type: 'move', dx: pendingDx, dy: pendingDy });
    pendingDx = 0;
    pendingDy = 0;
  }

  trackpadEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    touchActive = true;
    lastX = touch.clientX;
    lastY = touch.clientY;
    startTime = Date.now();
    totalMovement = 0;
  }, { passive: false });

  trackpadEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!touchActive) return;
    const touch = e.touches[0];
    const dx = touch.clientX - lastX;
    const dy = touch.clientY - lastY;
    lastX = touch.clientX;
    lastY = touch.clientY;
    totalMovement += Math.hypot(dx, dy);
    pendingDx += dx;
    pendingDy += dy;
    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(flushMove);
    }
  }, { passive: false });

  trackpadEl.addEventListener('touchend', (e) => {
    e.preventDefault();
    touchActive = false;
    const duration = Date.now() - startTime;
    if (totalMovement < TAP_MAX_MOVEMENT_PX && duration < TAP_MAX_DURATION_MS) {
      send({ type: 'click' });
    }
  }, { passive: false });

  // --- Boot ---
  const token = getStoredToken();
  if (token) {
    connect(token);
  } else {
    showPairing();
  }
})();
