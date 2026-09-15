// pickers-available.test.js - tests for "the Food and drinks tab is only available in Vietnam"
// (DESKTOP-SPEC §21) on window.Scheduler (nothing fires / no preview / getEffectivePickers empty)
// and on window.VersionApi (writes the `pickersAvailable` key when the response carries the boolean
// field, keeps the current value when the field is missing).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEnv, localDate, hhmm } = require('./helpers/fake-platform');

const MIN = 60 * 1000;
const j = (v) => JSON.parse(JSON.stringify(v));
// Base timestamp: 2026-09-14 10:00:00 machine time (Monday)
const T0 = localDate(2026, 9, 14, 10, 0, 0);

function intervalReminder(id, minutes, extra) {
  return Object.assign(
    { id, type: 'interval', interval: minutes, message: 'Msg ' + id, icon: '💧', color: '#0ea5e9', imageUrl: '', displayMinutes: 1, enabled: true },
    extra || {}
  );
}

function items2() {
  return [{ id: 'a', name: 'Pho', emoji: '🍜', priceMin: 30000, priceMax: 50000 }, { id: 'b', name: 'Bun', emoji: '🥣', priceMin: 0, priceMax: 0 }];
}

function pickerOf(id, times, extra) {
  return Object.assign({ id, name: 'Picker ' + id, icon: '🍜', enabled: true, times, weekdays: [], displayMinutes: 5, items: items2() }, extra || {});
}

function serverPickerOf(id, times) {
  return { id, kind: 'food', name: 'What is for lunch?', icon: '🍚', times, weekdays: [], displayMinutes: 5, items: items2() };
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------
test('pickersAvailable = false: a due picker slot fires nothing, a due reminder STILL fires', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({
    settings: { enabled: true },
    pickersAvailable: false,
    reminders: [intervalReminder('r1', 1)],
    pickers: [pickerOf('p1', [hhmm(T0 + 1 * MIN)], { lastPickedId: 'a' })],
    serverPickers: [serverPickerOf('srv-7', [hhmm(T0 + 1 * MIN)])]
  });
  await S.init();
  await env.settle();

  env.setNow(T0 + 1 * MIN);
  await S._tick(T0 + 1 * MIN);
  await env.settle();

  // Exactly 1 popup: the reminder one
  assert.equal(env.popupShown.length, 1, 'only the reminder fires');
  assert.equal(env.popupShown[0].kind, 'reminder');
  assert.equal(env.popupShown[0].reminder.id, 'r1');
  assert.equal(S._queue.length, 0, 'no picker entry is queued');

  // No picker slot is marked as fired -> turning the feature back on works right away
  const firedKeys = Object.keys(S._getState().fired);
  assert.equal(firedKeys.filter((k) => k.startsWith('picker|')).length, 0, 'no picker slot is evaluated');

  // lastPickedId is left untouched
  assert.equal(env.get('pickers')[0].lastPickedId, 'a');
  assert.equal(env.get('serverPickerState'), undefined);
});

test('pickersAvailable = false: getEffectivePickers() is empty, previewPicker() returns false and shows nothing', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  const local = pickerOf('p1', ['11:30'], { lastPickedId: 'a' });
  env.seed({
    settings: { enabled: true },
    pickersAvailable: false,
    pickers: [local],
    serverPickers: [serverPickerOf('srv-7', ['15:00'])]
  });

  assert.deepEqual(j(await S.getEffectivePickers()), []);
  assert.equal(await S.pickersAvailable(), false);
  assert.equal((await S.getMuteState()).pickersAvailable, false);

  // Preview by id, by object and by unknown id -> all false, no popup shows
  assert.equal(await S.previewPicker('p1'), false);
  assert.equal(await S.previewPicker('srv-7'), false);
  assert.equal(await S.previewPicker(local), false);
  assert.equal(await S.previewPicker('no-such-id'), false);
  await env.settle();
  assert.equal(env.popupShown.length, 0);

  // Reminder previews still show normally
  assert.equal(await S.previewReminder(intervalReminder('r1', 5)), true);
  assert.equal(env.popupShown.length, 1);
  assert.equal(env.popupShown[0].kind, 'reminder');

  // getUpcoming only keeps reminders
  env.seed({ reminders: [intervalReminder('r1', 30)] });
  const up = j(await S.getUpcoming(10));
  assert.equal(up.length, 1);
  assert.equal(up[0].kind, 'reminder');
});

test('missing key or a bogus value = true (open by default): pickers run normally', async () => {
  for (const value of [undefined, true, 'nope', 1, null]) {
    const env = createEnv({ now: T0 });
    const S = env.loadScheduler();
    const seed = { settings: { enabled: true }, pickers: [pickerOf('p1', [hhmm(T0)], { lastPickedId: 'a' })] };
    if (value !== undefined) seed.pickersAvailable = value;
    env.seed(seed);
    await S._tick(T0);
    await env.settle();
    assert.equal(env.popupShown.length, 1, 'value ' + String(value) + ' -> still treated as open');
    assert.equal(env.popupShown[0].kind, 'picker');
    assert.equal((await S.getEffectivePickers()).length, 1);
  }
});

test('flipping the flag false -> true brings pickers back, user data stays intact', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({
    settings: { enabled: true },
    pickersAvailable: false,
    pickers: [pickerOf('p1', [hhmm(T0)], { lastPickedId: 'a' })]
  });
  await S.init();
  await env.settle();
  assert.equal(env.popupShown.length, 0);
  assert.equal(j(env.get('pickers')).length, 1, 'picker data is NOT deleted');

  // The server reopens the feature -> storage.onChanged makes the Scheduler rebuild its schedule
  await env.storage.set({ pickersAvailable: true });
  await env.settle();
  assert.equal((await S.getEffectivePickers()).length, 1);
  assert.equal(env.popupShown.length, 1, 'the 10:00 slot is still within grace -> it can fire again');
  assert.equal(env.popupShown[0].kind, 'picker');
  assert.equal(await S.previewPicker('p1'), true);
});

test('flag turned off while entries are queued: picker entries are dropped, reminder entries stay', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({
    settings: { enabled: true },
    reminders: [intervalReminder('r1', 1), intervalReminder('r2', 1)],
    pickers: [pickerOf('p1', [hhmm(T0 + 1 * MIN)])]
  });
  await S.init();
  await env.settle();

  env.setNow(T0 + 1 * MIN);
  await S._tick(T0 + 1 * MIN);
  await env.settle();
  assert.equal(env.popupShown.length, 1, 'the first entry shows immediately');
  assert.ok(S._queue.some((e) => e.kind === 'picker'), 'the picker is sitting in the queue');

  await env.storage.set({ pickersAvailable: false });
  await env.settle();
  assert.equal(S._queue.filter((e) => e.kind === 'picker').length, 0, 'picker entries are dropped from the queue');
  assert.ok(S._queue.filter((e) => e.kind === 'reminder').length >= 1, 'reminder entries are still there');

  await env.advance(20 * 1000);
  assert.ok(env.popupShown.every((p) => p.kind === 'reminder'), 'no picker popup slips through');
});

// ---------------------------------------------------------------------------
// VersionApi
// ---------------------------------------------------------------------------
test('response with pickersAvailable = false -> writes the key and calls Scheduler.rebuild()', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  const A = env.loadApi();
  env.seed({ settings: { enabled: true }, pickers: [pickerOf('p1', ['11:30'])] });
  await S.init();
  await env.settle();

  let rebuilds = 0;
  const realRebuild = S.rebuild;
  S.rebuild = function () { rebuilds += 1; return realRebuild(); };

  env.mockFetch(() => ({ status: 200, json: { code: 200, list_message: [], pickersAvailable: false } }));
  await A.callVersionAPI(true);
  await env.settle();

  assert.equal(env.get('pickersAvailable'), false);
  assert.equal(rebuilds, 1, 'value changed -> schedule rebuilt');
  assert.deepEqual(j(await S.getEffectivePickers()), []);

  // The same value again -> no rewrite, no extra rebuild
  A._resetDebounce();
  await A.callVersionAPI(true);
  await env.settle();
  assert.equal(env.get('pickersAvailable'), false);
  assert.equal(rebuilds, 1, 'value unchanged -> no rebuild');
});

test('response MISSING the pickersAvailable field (old server) -> keeps the current value', async () => {
  const env = createEnv({ now: T0 });
  env.loadScheduler();
  const A = env.loadApi();
  env.seed({ pickersAvailable: false });

  env.mockFetch(() => ({ status: 200, json: { code: 200, version: '2.16.4', list_message: [] } }));
  await A.callVersionAPI(true);
  await env.settle();
  assert.equal(env.get('pickersAvailable'), false, 'a missing field must change nothing');

  // A wrong type must not be written either
  A._resetDebounce();
  env.mockFetch(() => ({ status: 200, json: { code: 200, list_message: [], pickersAvailable: 'true' } }));
  await A.callVersionAPI(true);
  await env.settle();
  assert.equal(env.get('pickersAvailable'), false, 'wrongly typed field -> ignored');

  // When the key does not exist yet, none is created
  const env2 = createEnv({ now: T0 });
  env2.loadScheduler();
  const A2 = env2.loadApi();
  env2.mockFetch(() => ({ status: 200, json: { code: 200, list_message: [] } }));
  await A2.callVersionAPI(true);
  await env2.settle();
  assert.equal(env2.get('pickersAvailable'), undefined, 'no field -> no key written');
});

test('response with pickersAvailable = true reopens the feature (writes the key + rebuild)', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  const A = env.loadApi();
  env.seed({ settings: { enabled: true }, pickersAvailable: false, pickers: [pickerOf('p1', ['11:30'])] });
  await S.init();
  await env.settle();
  assert.deepEqual(j(await S.getEffectivePickers()), []);

  env.mockFetch(() => ({ status: 200, json: { code: 200, list_message: [], pickersAvailable: true } }));
  await A.callVersionAPI(true);
  await env.settle();
  assert.equal(env.get('pickersAvailable'), true);
  assert.equal((await S.getEffectivePickers()).length, 1);
});
