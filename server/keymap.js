const { keyboard, Key } = require('@nut-tree-fork/nut-js');

const MODIFIER_ALIASES = {
  ctrl: 'LeftControl',
  control: 'LeftControl',
  alt: 'LeftAlt',
  shift: 'LeftShift',
  meta: 'LeftSuper',
  win: 'LeftSuper',
  super: 'LeftSuper',
};

const KEY_ALIASES = {
  space: 'Space',
  left: 'Left',
  right: 'Right',
  up: 'Up',
  down: 'Down',
  enter: 'Enter',
  return: 'Enter',
  esc: 'Escape',
  escape: 'Escape',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  comma: 'Comma',
  period: 'Period',
};

function resolveKeyName(token) {
  const lower = token.toLowerCase();
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];
  if (/^f([1-9]|1[0-2])$/.test(lower)) return lower.toUpperCase();
  if (/^[a-z]$/.test(lower)) return lower.toUpperCase();
  if (/^[0-9]$/.test(lower)) return `Num${lower}`;
  return token;
}

function lookupKey(enumName, originalToken) {
  const value = Key[enumName];
  if (value === undefined) {
    throw new Error(
      `Unknown key "${originalToken}" (mapped to Key.${enumName}, which does not exist in the installed nut.js version). ` +
        `Pick a different key for this action in server/config.json.`
    );
  }
  return value;
}

/**
 * Parses a combo string like "shift+left" or "ctrl+alt+r" into
 * { modifiers: Key[], main: Key } using nut.js's Key enum.
 * Throws a descriptive error on any unrecognized token so bad config
 * fails fast at startup instead of silently misbehaving on press.
 */
function parseCombo(str) {
  const parts = String(str)
    .toLowerCase()
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new Error(`Empty key combo: "${str}"`);
  }

  const modifiers = [];
  const mains = [];

  for (const part of parts) {
    if (MODIFIER_ALIASES[part]) {
      modifiers.push(lookupKey(MODIFIER_ALIASES[part], part));
    } else {
      mains.push(lookupKey(resolveKeyName(part), part));
    }
  }

  if (mains.length !== 1) {
    throw new Error(
      `Combo "${str}" must contain exactly one non-modifier key (found ${mains.length}).`
    );
  }

  return { modifiers, main: mains[0] };
}

/**
 * Presses all modifiers down, taps the main key, then releases modifiers
 * in reverse order. The finally-block guarantees modifiers are released
 * even if a press/release call throws, avoiding nut.js's known
 * stuck-modifier failure mode.
 */
async function pressKeyCombo({ modifiers, main }) {
  try {
    for (const mod of modifiers) {
      await keyboard.pressKey(mod);
    }
    await keyboard.pressKey(main);
    await keyboard.releaseKey(main);
  } finally {
    for (const mod of modifiers.slice().reverse()) {
      await keyboard.releaseKey(mod);
    }
  }
}

module.exports = { parseCombo, pressKeyCombo };
