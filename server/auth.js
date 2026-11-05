const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN_PATH = path.join(__dirname, 'token.json');

/**
 * Returns the persisted pairing token, generating one on first run.
 * Deleting server/token.json and restarting is the intended way to
 * rotate it (no in-UI rotation flow for this single-user LAN tool).
 */
function getOrCreateToken() {
  if (fs.existsSync(TOKEN_PATH)) {
    const { token } = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    if (token) return token;
  }
  const token = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({ token }, null, 2));
  return token;
}

module.exports = { getOrCreateToken };
