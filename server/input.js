const { keyboard, mouse, screen, Point } = require('@nut-tree-fork/nut-js');
const { pressKeyCombo } = require('./keymap');

// nut.js defaults to a human-like ~500ms delay between key actions, meant
// for simulating typing. That would make every remote button press feel
// sluggish, so we disable it for this use case.
keyboard.config.autoDelayMs = 0;

let cachedScreenSize = null;
async function getScreenSize() {
  if (!cachedScreenSize) {
    cachedScreenSize = { width: await screen.width(), height: await screen.height() };
  }
  return cachedScreenSize;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * nut.js has no relative-move primitive, so we read the current cursor
 * position and teleport (setPosition, no animation) to current + delta.
 * Instant teleport is correct here because the trackpad streams many
 * small deltas per second; an animated move would fight the next delta.
 */
async function moveMouseRelative(dx, dy, sensitivity) {
  const current = await mouse.getPosition();
  const { width, height } = await getScreenSize();
  const targetX = clamp(Math.round(current.x + dx * sensitivity), 0, width - 1);
  const targetY = clamp(Math.round(current.y + dy * sensitivity), 0, height - 1);
  await mouse.setPosition(new Point(targetX, targetY));
}

async function click() {
  await mouse.leftClick();
}

module.exports = { moveMouseRelative, click, pressKeyCombo };
