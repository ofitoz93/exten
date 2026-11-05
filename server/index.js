const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const qrcode = require('qrcode-terminal');

const { loadConfig } = require('./config');
const { getOrCreateToken } = require('./auth');
const { attachWsServer } = require('./wsServer');

function getLanIPv4Addresses() {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address });
      }
    }
  }
  return addresses;
}

function main() {
  const config = loadConfig();
  const token = getOrCreateToken();

  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const httpServer = http.createServer(app);
  attachWsServer(httpServer, config, token);

  httpServer.listen(config.port, () => {
    const lanAddresses = getLanIPv4Addresses();

    console.log('=== Remote Control Server ===');
    if (lanAddresses.length === 0) {
      console.log('No LAN IPv4 address found. Make sure the PC is connected to a network.');
    } else {
      for (const { name, address } of lanAddresses) {
        console.log(`LAN URL (${name}): http://${address}:${config.port}`);
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
