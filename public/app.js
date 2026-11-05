(() => {
  const TOKEN_KEY = 'rc_token';
  const RECONNECT_DELAY_MS = 3000;

  const statusEl = document.getElementById('status');
  const pairingEl = document.getElementById('pairing');
  const pairingErrorEl = document.getElementById('pairing-error');
  const tokenInput = document.getElementById('token-input');
  const tokenSubmit = document.getElementById('token-submit');
  const controlsEl = document.getElementById('controls');
  const trackpadEl = document.getElementById('trackpad');
  const clickBtn = document.getElementById('click-btn');

  let ws = null;
  let everOpened = false;

  function getStoredToken() {
    const fromUrl = new URL(location.href).searchParams.get('token');
    if (fromUrl) {
      localStorage.setItem(TOKEN_KEY, fromUrl);
      // Strip the token out of the visible URL so it isn't left in history.
      history.replaceState(null, '', location.pathname);
      return fromUrl;
    }
    return localStorage.getItem(TOKEN_KEY);
  }

  function showPairing(errorMessage) {
    pairingEl.classList.remove('hidden');
    controlsEl.classList.add('hidden');
    if (errorMessage) {
      pairingErrorEl.textContent = errorMessage;
      pairingErrorEl.classList.remove('hidden');
    } else {
      pairingErrorEl.classList.add('hidden');
    }
  }

  function showControls() {
    pairingEl.classList.add('hidden');
    controlsEl.classList.remove('hidden');
  }

  function setStatus(connected) {
    statusEl.textContent = connected ? '● Bağlandı' : '● Bağlantı yok';
    statusEl.classList.toggle('connected', connected);
    statusEl.classList.toggle('disconnected', !connected);
  }

  function connect(token) {
    everOpened = false;
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${location.host}/ws?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
      everOpened = true;
      setStatus(true);
      showControls();
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'error') {
        console.error('Server error:', msg.message);
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

    ws.onerror = () => {
      // onclose fires right after and handles reconnect/pairing logic.
    };
  }

  function send(payload) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!ws || ws.readyState !== WebSocket.OPEN || !token) return;
    ws.send(JSON.stringify({ ...payload, token }));
  }

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
