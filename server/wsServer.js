const { WebSocketServer, WebSocket } = require('ws');
const { moveMouseRelative, click, pressKeyCombo, captureWordUnderCursor } = require('./input');
const { translateToTurkish } = require('./translator');
const { loadWords, saveWord, deleteWord } = require('./vocabulary');

const HEARTBEAT_INTERVAL_MS = 30000;
const MAX_BAD_TOKEN_STRIKES = 3;

function getTokenFromUrl(url) {
  try {
    return new URL(url, 'http://localhost').searchParams.get('token');
  } catch {
    return null;
  }
}

function attachWsServer(httpServer, config, token) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    verifyClient: (info) => getTokenFromUrl(info.req.url) === token,
  });

  function broadcast(payload) {
    const raw = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.badTokenStrikes = 0;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.send(
      JSON.stringify({
        type: 'connected',
        words: loadWords(),
      })
    );

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.token !== token) {
        ws.badTokenStrikes += 1;
        if (ws.badTokenStrikes >= MAX_BAD_TOKEN_STRIKES) {
          ws.close(4001, 'invalid token');
        }
        return;
      }

      try {
        if (msg.type === 'move') {
          await moveMouseRelative(Number(msg.dx) || 0, Number(msg.dy) || 0, config.mouse.sensitivity);
        } else if (msg.type === 'click') {
          await click();
        } else if (msg.type === 'button') {
          const combo = config.keymap[msg.action];
          if (combo) await pressKeyCombo(combo);
        } else if (msg.type === 'capture_word') {
          ws.send(JSON.stringify({ type: 'capturing' }));
          const rawWord = await captureWordUnderCursor();
          if (!rawWord) {
            ws.send(
              JSON.stringify({
                type: 'word_error',
                message: 'İmleç altında seçilebilir bir kelime bulunamadı. İmleci kelimenin üzerine getirip tekrar deneyin.',
              })
            );
            return;
          }
          const result = await translateToTurkish(rawWord);
          const { entry, words } = saveWord({
            ...result,
            source: 'cursor',
          });
          broadcast({ type: 'word_translated', entry, saved: true });
          broadcast({ type: 'words_updated', words });
        } else if (msg.type === 'translate_and_save') {
          const text = String(msg.word || '').trim();
          if (!text) return;
          const result = await translateToTurkish(text, msg.sentence || '');
          const { entry, words } = saveWord({
            ...result,
            source: msg.source || 'phone',
          });
          broadcast({ type: 'word_translated', entry, saved: true });
          broadcast({ type: 'words_updated', words });
        } else if (msg.type === 'delete_word') {
          if (!msg.id) return;
          const words = deleteWord(msg.id);
          broadcast({ type: 'words_updated', words });
        }
      } catch (err) {
        console.error('Input/action failed:', err.message);
        ws.send(
          JSON.stringify({
            type: 'word_error',
            message: err.message || 'İşlem sırasında hata oluştu.',
          })
        );
      }
    });
  });

  wss.on('headers', () => {});

  // Drop dead connections (e.g. phone screen locked / lost WiFi) so they
  // don't linger as zombie sockets.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  wss.on('close', () => clearInterval(heartbeat));

  return { wss, broadcast };
}

module.exports = { attachWsServer };
