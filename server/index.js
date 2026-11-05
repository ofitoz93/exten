const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const qrcode = require('qrcode-terminal');

const { loadConfig } = require('./config');
const { getOrCreateToken } = require('./auth');
const { attachWsServer } = require('./wsServer');
const { translateToTurkish } = require('./translator');
const { loadWords, saveWord, deleteWord, exportWordsCsv } = require('./vocabulary');

function isLikelyVirtualOrHostAdapter(name, address) {
  const virtualNamePattern = /virtualbox|vmware|vbox|vethernet|wsl|hyper-v|docker|hamachi|tailscale|zerotier|loopback/i;
  if (virtualNamePattern.test(name)) return true;
  // 192.168.56.1 is the standard VirtualBox Host-Only adapter IP (often named "Ethernet 2" on Windows)
  if (address.startsWith('192.168.56.') || address.startsWith('169.254.')) return true;
  return false;
}

function getLanIPv4Addresses() {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({
          name,
          address: iface.address,
          virtual: isLikelyVirtualOrHostAdapter(name, iface.address),
        });
      }
    }
  }
  // Sort real LAN adapters before virtual/host-only adapters
  addresses.sort((a, b) => Number(a.virtual) - Number(b.virtual));
  return addresses;
}

function main() {
  const config = loadConfig();
  const token = getOrCreateToken();

  const app = express();
  app.use(express.json());

  // Allow Chrome Extension on YouTube / Netflix / any site to call local API
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  const httpServer = http.createServer(app);
  const { broadcast } = attachWsServer(httpServer, config, token);

  // --- Vocabulary & Translation REST API ---
  app.get('/api/words', (req, res) => {
    res.json({ words: loadWords() });
  });

  app.get('/api/words/export.csv', (req, res) => {
    const csv = exportWordsCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="kelimelerim.csv"');
    res.send(csv);
  });

  app.post('/api/translate', async (req, res) => {
    try {
      const { word, sentence = '', save = true, source = 'extension' } = req.body || {};
      if (!word || !String(word).trim()) {
        return res.status(400).json({ error: 'Kelime gerekli.' });
      }
      const result = await translateToTurkish(word, sentence);
      if (save !== false) {
        const { entry, words } = saveWord({
          ...result,
          source,
        });
        broadcast({ type: 'word_translated', entry, saved: true });
        broadcast({ type: 'words_updated', words });
        return res.json({ result: entry, saved: true, wordsCount: words.length });
      }
      broadcast({ type: 'word_translated', entry: result, saved: false });
      return res.json({ result, saved: false });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Çeviri hatası.' });
    }
  });

  app.delete('/api/words/:id', (req, res) => {
    const words = deleteWord(req.params.id);
    broadcast({ type: 'words_updated', words });
    res.json({ words });
  });

  httpServer.listen(config.port, () => {
    const lanAddresses = getLanIPv4Addresses();

    console.log('=== Remote Control & Vocabulary Server ===');
    if (lanAddresses.length === 0) {
      console.log('No LAN IPv4 address found. Make sure the PC is connected to a network.');
    } else {
      for (const { name, address, virtual } of lanAddresses) {
        const tag = virtual ? ' [Sanal Ağ]' : '';
        console.log(`LAN URL (${name}${tag}): http://${address}:${config.port}`);
      }
    }
    console.log(`Pairing token: ${token}`);
    console.log('Open the LAN URL above on your phone (same WiFi), then enter the token once.');

    const primary = lanAddresses[0];
    if (primary) {
      const pairingUrl = `http://${primary.address}:${config.port}/?token=${token}`;
      console.log('\nOr scan this QR code with your phone camera to open + auto-pair:\n');
      qrcode.generate(pairingUrl, { small: true });
    }
  });
}

main();
