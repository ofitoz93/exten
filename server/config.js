const fs = require('fs');
const path = require('path');
const { parseCombo } = require('./keymap');

const CONFIG_PATH = path.join(__dirname, 'config.json');

/**
 * Loads config.json and pre-parses every keymap combo once at startup,
 * so a typo in the config throws immediately with a clear message
 * instead of failing silently the first time a button is pressed.
 */
function loadConfig() {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  if (!raw.port || typeof raw.port !== 'number') {
    throw new Error('config.json: "port" must be a number.');
  }
  if (!raw.mouse || typeof raw.mouse.sensitivity !== 'number') {
    throw new Error('config.json: "mouse.sensitivity" must be a number.');
  }
  if (!raw.keymap || typeof raw.keymap !== 'object') {
    throw new Error('config.json: "keymap" object is required.');
  }

  const parsedKeymap = {};
  for (const [action, combo] of Object.entries(raw.keymap)) {
    try {
      parsedKeymap[action] = parseCombo(combo);
    } catch (err) {
      throw new Error(`config.json keymap["${action}"] = "${combo}": ${err.message}`);
    }
  }

  return {
    port: raw.port,
    mouse: {
      sensitivity: raw.mouse.sensitivity,
      tapMaxDurationMs: raw.mouse.tapMaxDurationMs ?? 200,
      tapMaxMovementPx: raw.mouse.tapMaxMovementPx ?? 8,
    },
    keymap: parsedKeymap,
  };
}

module.exports = { loadConfig };
