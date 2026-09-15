// mute.test.js - tests for "turn off / snooze notifications app-wide" (DESKTOP-SPEC §20) on window.Scheduler.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEnv, localDate } = require('./helpers/fake-platform');

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
// Base timestamp: 2026-09-14 10:00:00 machine time (Monday)
const T0 = localDate(2026, 9, 14, 10, 0, 0);

function intervalReminder(id, minutes, extra) {
  return Object.assign(
    { id, type: 'interval', interval: minutes, message: 'Msg ' + id, icon: '💧', color: '#0ea5e9', imageUrl: '', displayMinutes: 1, enabled: true },
    extra || {}
  );
}

function pickerOf(id, times) {
  return {
    id, name: 'Picker ' + id, icon: '🍜', enabled: true, times, weekdays: [], displayMinutes: 5,
    items: [{ id: 'a', name: 'Pho', emoji: '🍜' }, { id: 'b', name: 'Bun', emoji: '🥣' }]
  };
}

test('while snoozed: nothing fires, the queue is flushed, the popup is hidden', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ reminders: [intervalReminder('r1', 1), intervalReminder('r2', 1)], settings: { enabled: true } });
  await S.init();
  await env.settle();

  // Two reminders due at once: the first shows immediately, the second waits the 15s spacing
  env.setNow(T0 + 1 * MIN);
  await S._tick(T0 + 1 * MIN);
  await env.settle();
  assert.equal(env.popupShown.length, 1);
  assert.equal(S._queue.length, 1);

  // Snooze for 15 minutes while it waits -> flush the queue and hide the visible popup
  await env.storage.set({ settings: { enabled: true, snoozeUntil: T0 + 16 * MIN } });
  await env.settle();
  assert.equal(S._queue.length, 0, 'the queue is flushed');
  assert.equal(env.popupHides.length, 1, 'the visible popup is hidden');
  await env.advance(20 * 1000);
  assert.equal(env.popupShown.length, 1, 'the waiting entry must not pop out');

  // Every tick during the snooze stays silent
  env.setNow(T0 + 10 * MIN);
  await S._tick(T0 + 10 * MIN);
  await env.settle();
  assert.equal(env.popupShown.length, 1);
  assert.equal(await S.notificationsMuted(), true);
  const ms = await S.getMuteState();
  assert.equal(ms.enabled, true);
  assert.equal(ms.muted, true);
  assert.equal(ms.snoozeUntil, T0 + 16 * MIN);
});

test('while snoozed: pickers do not fire either, and getUpcoming returns empty', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({
    reminders: [intervalReminder('r1', 30)],
    pickers: [pickerOf('p1', ['10:00'])],
    settings: { enabled: true, snoozeUntil: T0 + 60 * MIN }
  });

  await S._tick(T0);
  await env.settle();
  assert.equal(env.popupShown.length, 0, 'a picker due right now still does not fire');
  assert.deepEqual(JSON.parse(JSON.stringify(await S.getUpcoming(5))), []);
});

test('preview still shows while snoozed (the user asked for it)', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({
    reminders: [intervalReminder('r1', 1)],
    pickers: [pickerOf('p1', ['23:59'])],
    settings: { enabled: true, snoozeUntil: T0 + 60 * MIN }
  });

  await S._tick(T0 + 5 * MIN);
  await env.settle();
  assert.equal(env.popupShown.length, 0);

  await S.previewReminder(intervalReminder('r1', 1));
  await env.settle();
  assert.equal(env.popupShown.length, 1, 'the reminder preview still shows');
  assert.equal(env.popupShown[0].kind, 'reminder');

  await S.previewPicker('p1');
  await env.settle();
  assert.equal(env.popupShown.length, 2, 'the picker preview still shows');
  assert.equal(env.popupShown[1].kind, 'picker');
});

test('preview still shows while the master toggle is off', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ reminders: [intervalReminder('r1', 1)], settings: { enabled: false } });

  await S._tick(T0 + 5 * MIN);
  await env.settle();
  assert.equal(env.popupShown.length, 0);

  await S.previewReminder(intervalReminder('r1', 1));
  await env.settle();
  assert.equal(env.popupShown.length, 1);
});

test('snooze expiry: snoozeUntil is cleared (written once) and notifications resume', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ reminders: [intervalReminder('r1', 1)], settings: { enabled: true, snoozeUntil: T0 + 5 * MIN } });
  await S.init();
  await env.settle();
  assert.equal(env.get('settings').snoozeUntil, T0 + 5 * MIN, 'not expired yet -> left untouched');

  // Once expired: the field is cleared and no missed popup is replayed
  const after = T0 + 6 * MIN;
  env.setNow(after);
  await S._tick(after);
  await env.settle();
  assert.equal(env.get('settings').snoozeUntil, 0, 'snoozeUntil is cleared');
  assert.equal(env.popupShown.length, 0, 'slots skipped during the snooze are not replayed');
  assert.equal(await S.notificationsMuted(), false);

  // Further ticks do not write settings again (no loop)
  const writes = [];
  const rawSet = env.Platform.storage.set;
  env.Platform.storage.set = async function (obj) { writes.push(Object.keys(obj)); return rawSet.call(this, obj); };
  await S._tick(after + 1);
  await env.settle();
  env.Platform.storage.set = rawSet;
  assert.equal(writes.filter((k) => k.includes('settings')).length, 0, 'settings is not written again');

  // The next interval slot is rescheduled and fires normally
  const due = after + 1 * MIN;
  env.setNow(due);
  await S._tick(due);
  await env.settle();
  assert.equal(env.popupShown.length, 1, 'notifications resume once the snooze ends');
  assert.equal(env.popupShown[0].reminder.id, 'r1');
});

test('the master toggle still works as before (it never touches snoozeUntil)', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ reminders: [intervalReminder('r1', 1)], settings: { enabled: false } });
  await S.init();
  await env.settle();

  env.setNow(T0 + 5 * MIN);
  await S._tick(T0 + 5 * MIN);
  await env.settle();
  assert.equal(env.popupShown.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(S._getState().intervalNext)), {});
  const ms = await S.getMuteState();
  assert.equal(ms.enabled, false);
  assert.equal(ms.muted, true);
  assert.equal(ms.snoozeUntil, 0);
  assert.equal(env.get('settings').snoozeUntil, undefined, 'no field is added when there is no snooze');

  // Turn it back on -> interval slots restart from that moment, then fire normally
  await env.storage.set({ settings: { enabled: true } });
  await env.settle();
  assert.equal(S._getState().intervalNext.r1, T0 + 6 * MIN, 'the interval slot restarts from the moment it was turned on');
  assert.equal(env.popupShown.length, 0);
  const due = T0 + 6 * MIN;
  env.setNow(due);
  await S._tick(due);
  await env.settle();
  assert.equal(env.popupShown.length, 1);
});

test('a bogus snoozeUntil (string / negative / more than 7 days) is ignored', async () => {
  const bad = ['' + (T0 + 60 * MIN), -5, 0, T0 + 8 * DAY, NaN, null, {}, true];
  for (const v of bad) {
    const env = createEnv({ now: T0 });
    const S = env.loadScheduler();
    env.seed({ reminders: [intervalReminder('r1', 1)], settings: { enabled: true, snoozeUntil: v } });

    assert.equal(S._readSnoozeUntil({ snoozeUntil: v }, T0), 0, 'bogus value -> 0: ' + String(v));
    assert.equal(await S.notificationsMuted(), false, 'a bogus value must not block notifications: ' + String(v));

    await S._tick(T0);
    await env.settle();
    const due = T0 + 1 * MIN;
    env.setNow(due);
    await S._tick(due);
    await env.settle();
    assert.equal(env.popupShown.length, 1, 'still fires normally with a bogus snoozeUntil: ' + String(v));
  }

  // A valid value just under the 7 day cap is still accepted
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  const okValue = T0 + 7 * DAY - 1000;
  env.seed({ reminders: [intervalReminder('r1', 1)], settings: { enabled: true, snoozeUntil: okValue } });
  assert.equal(S._readSnoozeUntil({ snoozeUntil: okValue }, T0), okValue);
  assert.equal(await S.notificationsMuted(), true);
});

test('a bogus snoozeUntil is cleared from settings on the first tick', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ reminders: [], settings: { enabled: true, snoozeUntil: 'not-a-number' } });
  await S._tick(T0);
  await env.settle();
  assert.equal(env.get('settings').snoozeUntil, 0);
});
