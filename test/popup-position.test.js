// popup-position.test.js - tests for "the user picks where the popup shows" (DESKTOP-SPEC §22) on
// window.Scheduler. Every payload sent to the popup (reminder, picker, preview) must carry a
// sanitized popupPosition field.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEnv, localDate } = require('./helpers/fake-platform');

const MIN = 60 * 1000;
// Base timestamp: 2026-09-14 10:00:00 machine time (Monday)
const T0 = localDate(2026, 9, 14, 10, 0, 0);

function intervalReminder(id, minutes) {
  return {
    id, type: 'interval', interval: minutes, message: 'Msg ' + id, icon: '💧',
    color: '#0ea5e9', imageUrl: '', displayMinutes: 1, enabled: true
  };
}

function pickerOf(id, times) {
  return {
    id, name: 'Picker ' + id, icon: '🍜', enabled: true, times, weekdays: [], displayMinutes: 5,
    items: [{ id: 'a', name: 'Pho', emoji: '🍜' }, { id: 'b', name: 'Bun', emoji: '🥣' }]
  };
}

/** Fire an interval reminder and return the payload that was just sent. */
async function fireReminder(env, S, at) {
  env.setNow(at);
  await S._tick(at);
  await env.settle();
  return env.popupShown[env.popupShown.length - 1];
}

test('reminder payload carries the position the user picked', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ reminders: [intervalReminder('r1', 1)], settings: { enabled: true, popupPosition: 'top-left' } });
  await S.init();
  await env.settle();

  const payload = await fireReminder(env, S, T0 + 1 * MIN);
  assert.equal(payload.kind, 'reminder');
  assert.equal(payload.popupPosition, 'top-left');
});

test('picker payload (Food and drinks) carries the position the user picked', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ pickers: [pickerOf('p1', ['10:00'])], settings: { enabled: true, popupPosition: 'center' } });

  await S._tick(T0);
  await env.settle();
  assert.equal(env.popupShown.length, 1);
  assert.equal(env.popupShown[0].kind, 'picker');
  assert.equal(env.popupShown[0].popupPosition, 'center');
});

test('preview (reminder + picker) also carries the position', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ pickers: [pickerOf('p1', [])], settings: { enabled: false, popupPosition: 'bottom-left' } });

  await S.previewReminder({ id: 'preview-popup-position', message: 'Preview', icon: '📍', displayMinutes: 1 });
  await env.settle();
  assert.equal(env.popupShown.length, 1);
  assert.equal(env.popupShown[0].popupPosition, 'bottom-left', 'preview still shows while notifications are off');

  assert.equal(await S.previewPicker('p1'), true);
  await env.settle();
  assert.equal(env.popupShown.length, 2);
  assert.equal(env.popupShown[1].kind, 'picker');
  assert.equal(env.popupShown[1].popupPosition, 'bottom-left');
});

test('all 5 valid positions reach the payload untouched', async () => {
  for (const pos of ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center']) {
    const env = createEnv({ now: T0 });
    const S = env.loadScheduler();
    env.seed({ settings: { enabled: true, popupPosition: pos } });
    await S.previewReminder({ id: 'r', message: 'Msg', icon: '📍', displayMinutes: 1 });
    await env.settle();
    assert.equal(env.popupShown[0].popupPosition, pos, 'position ' + pos);
  }
});

test('unknown value -> falls back to bottom-right', async () => {
  const junk = ['somewhere', 123, null, true, '', 'BOTTOM-RIGHT', ' center ', { x: 1 }, ['center']];
  for (const value of junk) {
    const env = createEnv({ now: T0 });
    const S = env.loadScheduler();
    env.seed({ settings: { enabled: true, popupPosition: value } });
    await S.previewReminder({ id: 'r', message: 'Msg', icon: '📍', displayMinutes: 1 });
    await env.settle();
    assert.equal(env.popupShown[0].popupPosition, 'bottom-right', 'unknown value: ' + JSON.stringify(value));
  }
});

test('missing settings.popupPosition (or no settings at all) -> bottom-right', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ reminders: [intervalReminder('r1', 1)], settings: { enabled: true } });
  await S.init();
  await env.settle();
  const payload = await fireReminder(env, S, T0 + 1 * MIN);
  assert.equal(payload.popupPosition, 'bottom-right');

  // No settings key at all
  const env2 = createEnv({ now: T0 });
  const S2 = env2.loadScheduler();
  await S2.previewReminder({ id: 'r', message: 'Msg', icon: '📍', displayMinutes: 1 });
  await env2.settle();
  assert.equal(env2.popupShown[0].popupPosition, 'bottom-right');
});

test('changing the position in Settings applies to the next popup (no restart needed)', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ reminders: [intervalReminder('r1', 1)], settings: { enabled: true, popupPosition: 'bottom-right' } });
  await S.init();
  await env.settle();

  const first = await fireReminder(env, S, T0 + 1 * MIN);
  assert.equal(first.popupPosition, 'bottom-right');

  // The user changes the position while the app runs (the UI writes settings through storage)
  await env.storage.set({ settings: { enabled: true, popupPosition: 'top-right' } });
  await env.settle();

  const second = await fireReminder(env, S, T0 + 3 * MIN);
  assert.equal(env.popupShown.length, 2);
  assert.equal(second.popupPosition, 'top-right');

  await env.storage.set({ settings: { enabled: true, popupPosition: 'somewhere' } });
  await env.settle();
  const third = await fireReminder(env, S, T0 + 5 * MIN);
  assert.equal(third.popupPosition, 'bottom-right', 'an unknown value written to storage must be sanitized too');
});

test('popupPosition does not break the other payload fields', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({
    reminders: [intervalReminder('r1', 1)],
    settings: { enabled: true, popupPosition: 'top-left', darkMode: true, soundEnabled: false, soundVolume: 80, language: 'vi' }
  });
  await S.init();
  await env.settle();
  const payload = await fireReminder(env, S, T0 + 1 * MIN);
  assert.equal(payload.darkMode, true);
  assert.equal(payload.soundEnabled, false);
  assert.equal(payload.soundVolume, 80);
  assert.equal(payload.language, 'vi');
  assert.equal(payload.popupPosition, 'top-left');
  assert.equal(payload.reminder.message, 'Msg r1');
});
