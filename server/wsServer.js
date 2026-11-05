const { WebSocketServer } = require('ws');
const { moveMouseRelative, click, pressKeyCombo } = require('./input');

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

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.badTokenStrikes = 0;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.send(JSON.stringify({ type: 'connected' }));

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
        }
      } catch (err) {
        console.error('Input action failed:', err.message);
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

  return wss;
}

module.exports = { attachWsServer };
