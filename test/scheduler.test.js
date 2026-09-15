// scheduler.test.js - tests for window.Scheduler (src/js/scheduler.js) with a fake Platform.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEnv, localDate, hhmm, ymd } = require('./helpers/fake-platform');

const MIN = 60 * 1000;
// Values created inside the vm have prototypes from another realm -> round-trip through JSON before deepEqual
const j = (v) => JSON.parse(JSON.stringify(v));
// Base timestamp: 2026-09-14 10:00:00 machine time (Monday)
const T0 = localDate(2026, 9, 14, 10, 0, 0);

function intervalReminder(id, minutes, extra) {
  return Object.assign({ id, type: 'interval', interval: minutes, message: 'Msg ' + id, icon: '💧', color: '#0ea5e9', imageUrl: '', displayMinutes: 1, enabled: true }, extra || {});
}

function pickerOf(id, items, times, extra) {
  return Object.assign({ id, name: 'Picker ' + id, icon: '🍜', enabled: true, times, weekdays: [], displayMinutes: 5, items }, extra || {});
}

function items2() {
  return [{ id: 'a', name: 'Pho', emoji: '🍜', priceMin: 30000, priceMax: 50000 }, { id: 'b', name: 'Bun', emoji: '🥣', priceMin: 0, priceMax: 0 }];
}

test('interval reminder: schedules the first slot, fires when due, then reschedules', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ reminders: [intervalReminder('r1', 30)], settings: { enabled: true } });

  await S._tick(T0);
  await env.settle();
  assert.equal(env.popupShown.length, 0, 'the first pass only schedules, it does not fire');
  assert.equal(S._getState().intervalNext.r1, T0 + 30 * MIN);

  await S._tick(T0 + 29 * MIN);
  await env.settle();
  assert.equal(env.popupShown.length, 0);

  env.setNow(T0 + 30 * MIN);
  await S._tick(T0 + 30 * MIN);
  await env.settle();
  assert.equal(env.popupShown.length, 1, 'due -> fires');
  const p = env.popupShown[0];
  assert.equal(p.kind, 'reminder');
  assert.equal(p.reminder.id, 'r1');
  assert.equal(p.reminder.message, 'Msg r1');
  assert.equal(p.reminder.displayMinutes, 1);
  assert.match(p.payloadId, /^p-\d+-\d+$/);
  assert.equal(p.language, 'en');
  assert.equal(p.versionMessage, '');
  assert.equal(S._getState().intervalNext.r1, T0 + 60 * MIN, 'the next slot is scheduled');

  // Machine asleep for 5 hours: fires once only, then reschedules from now
  const late = T0 + 6 * 60 * MIN;
  env.setNow(late);
  await S._tick(late);
  await env.settle();
  assert.equal(env.popupShown.length, 2);
  assert.equal(S._getState().intervalNext.r1, late + 30 * MIN);

  // schedulerState is written to storage after the debounce
  await env.advance(600);
  const saved = env.get('schedulerState');
  assert.ok(saved && saved.intervalNext.r1 === late + 30 * MIN);
});

test('a reminder with enabled=false never fires and keeps no intervalNext', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ reminders: [intervalReminder('r1', 1, { enabled: false })], settings: { enabled: true } });
  for (let i = 0; i <= 5; i++) {
    env.setNow(T0 + i * MIN);
    await S._tick(T0 + i * MIN);
  }
  await env.settle();
  assert.equal(env.popupShown.length, 0);
  assert.equal(S._getState().intervalNext.r1, undefined);
});

test('master toggle off: nothing fires, the queue is flushed, the popup is hidden', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ reminders: [intervalReminder('r1', 1), intervalReminder('r2', 1)], settings: { enabled: false } });
  await S._tick(T0);
  await S._tick(T0 + 5 * MIN);
  await env.settle();
  assert.equal(env.popupShown.length, 0);

  // Turn it on, 2 reminders due at once: the first shows immediately, the second waits the 15s spacing
  await S.init();
  await env.storage.set({ settings: { enabled: true } });
  await env.settle();
  env.setNow(T0 + 6 * MIN);
  await S._tick(T0 + 6 * MIN);
  await env.settle();
  assert.equal(env.popupShown.length, 1, 'the second one is waiting for its spacing');
  assert.equal(S._queue.length, 1);

  // Turn the master toggle off while it waits -> flush the queue and hide the popup
  await env.storage.set({ settings: { enabled: false } });
  await env.settle();
  assert.equal(S._queue.length, 0);
  assert.equal(env.popupHides.length, 1);
  await env.advance(20 * 1000);
  assert.equal(env.popupShown.length, 1, 'no popup left after turning it off');
  assert.deepEqual(j(S._getState().intervalNext), {}, 'intervals restart from scratch when turned on again');
});

test('scheduled: fires exactly once within grace, is silently skipped past grace', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  const inGrace = T0 - 60 * 1000;
  const tooOld = T0 - 5 * MIN;
  const future = T0 + 10 * MIN;
  env.seed({
    settings: { enabled: true },
    reminders: [
      { id: 's1', type: 'scheduled', message: 'In grace', scheduledTimes: [{ date: ymd(inGrace), time: hhmm(inGrace) }], enabled: true },
      { id: 's2', type: 'dateRange', message: 'Too old', scheduledTimes: [{ date: ymd(tooOld), time: hhmm(tooOld) }], enabled: true },
      { id: 's3', type: 'scheduled', message: 'Future', scheduledTimes: [{ date: ymd(future), time: hhmm(future) }], enabled: true }
    ]
  });
  await S._tick(T0);
  await env.settle();
  assert.equal(env.popupShown.length, 1);
  assert.equal(env.popupShown[0].reminder.id, 's1');
  const fired = S._getState().fired;
  assert.ok(fired['s1|' + ymd(inGrace) + ' ' + hhmm(inGrace)]);
  assert.ok(fired['s2|' + ymd(tooOld) + ' ' + hhmm(tooOld)], 'past grace is still marked so it is not looked at again');
  assert.equal(fired['s3|' + ymd(future) + ' ' + hhmm(future)], undefined);

  // Tick again: nothing more fires
  await S._tick(T0 + 30 * 1000);
  await env.settle();
  assert.equal(env.popupShown.length, 1);

  // s3 comes due -> fires
  env.setNow(future + 1000);
  await S._tick(future + 1000);
  await env.settle();
  assert.equal(env.popupShown.length, 2);
  assert.equal(env.popupShown[1].reminder.id, 's3');
});

test('legacy daily times[]: fires under the key id|YYYY-MM-DD|HH:mm', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ settings: { enabled: true }, reminders: [{ id: 'L1', type: 'scheduled', message: 'Legacy', times: [hhmm(T0)], enabled: true }] });
  await S._tick(T0 + 10 * 1000);
  await env.settle();
  assert.equal(env.popupShown.length, 1);
  assert.ok(S._getState().fired['L1|' + ymd(T0) + '|' + hhmm(T0)]);
  await S._tick(T0 + 40 * 1000);
  await env.settle();
  assert.equal(env.popupShown.length, 1);
});

test('picker: fires only on the right weekday, picks something other than lastPickedId, records PICKER_PICKED', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  const today = new Date(T0).getDay();
  const otherDay = (today + 1) % 7;
  env.seed({ settings: { enabled: true }, pickers: [pickerOf('p1', items2(), [hhmm(T0)], { weekdays: [otherDay], lastPickedId: 'a' })] });
  await S._tick(T0);
  await env.settle();
  assert.equal(env.popupShown.length, 0, 'wrong weekday -> does not fire');

  // Right weekday: picks an item other than lastPickedId (repeated to be sure)
  for (let i = 0; i < 25; i++) {
    const e2 = createEnv({ now: T0 });
    const S2 = e2.loadScheduler();
    e2.seed({ settings: { enabled: true }, pickers: [pickerOf('p1', items2(), [hhmm(T0)], { weekdays: [today], lastPickedId: 'a' })] });
    await S2._tick(T0);
    await e2.settle();
    assert.equal(e2.popupShown.length, 1);
    const p = e2.popupShown[0];
    assert.equal(p.kind, 'picker');
    assert.equal(p.item.id, 'b', 'must not pick lastPickedId again');
    assert.equal(p.items.length, 2);
    assert.deepEqual(Object.keys(p.item).sort(), ['emoji', 'id', 'image', 'imageCredit', 'imageSource', 'name', 'priceMax', 'priceMin']);
    assert.equal(p.items[0].priceMin, 30000);
    assert.equal(e2.get('pickers')[0].lastPickedId, 'b', 'lastPickedId is written into pickers[]');
    assert.ok(S2._getState().fired['picker|p1|' + ymd(T0) + '|' + hhmm(T0)]);
  }

  // PICKER_PICKED from the popup: only recorded when the id matches
  const e3 = createEnv({ now: T0 });
  const S3 = e3.loadScheduler();
  e3.seed({ settings: { enabled: true }, pickers: [pickerOf('p1', items2(), ['23:59'], { lastPickedId: 'b' })] });
  await S3.init();
  await e3.emitPopupEvent({ type: 'PICKER_PICKED', pickerId: 'p1', itemId: 'a' });
  assert.equal(e3.get('pickers')[0].lastPickedId, 'a');
  await e3.emitPopupEvent({ type: 'PICKER_PICKED', pickerId: 'p1', itemId: 'zzz' });
  assert.equal(e3.get('pickers')[0].lastPickedId, 'a', 'unknown itemId -> ignored');
  await e3.emitPopupEvent({ type: 'PICKER_PICKED', pickerId: 'nope', itemId: 'a' });
  assert.equal(e3.get('pickers')[0].lastPickedId, 'a');
});

test('server picker: empty weekdays = every day, lastPickedId goes into serverPickerState', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({
    settings: { enabled: true },
    serverPickers: [{ id: 'srv-7', kind: 'food', name: 'What is for lunch?', icon: '🍚', times: [hhmm(T0)], weekdays: [], displayMinutes: 5, items: items2() }],
    serverPickerState: { 'srv-7': 'a' }
  });
  await S._tick(T0);
  await env.settle();
  assert.equal(env.popupShown.length, 1);
  assert.equal(env.popupShown[0].picker.id, 'srv-7');
  assert.equal(env.popupShown[0].item.id, 'b');
  assert.equal(env.get('serverPickerState')['srv-7'], 'b');
  assert.equal(env.get('pickers'), undefined, 'the pickers key owned by the user is left alone');
});

test('picker turned off (pref false) or with no items -> does not fire', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({
    settings: { enabled: true },
    pickers: [pickerOf('empty', [], [hhmm(T0)]), pickerOf('off', items2(), [hhmm(T0)], { enabled: false })],
    serverPickers: [{ id: 'srv-1', name: 'X', icon: '🍚', times: [hhmm(T0)], weekdays: [], displayMinutes: 5, items: items2() }],
    serverPickerPrefs: { 'srv-1': false }
  });
  await S._tick(T0);
  await env.settle();
  assert.equal(env.popupShown.length, 0);
});

test('queue: 15s spacing, cap of 5 entries (oldest dropped), one entry per picker', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  const reminders = [];
  for (let i = 1; i <= 7; i++) reminders.push(intervalReminder('q' + i, 1));
  env.seed({ settings: { enabled: true }, reminders });
  await S._tick(T0);
  env.setNow(T0 + MIN);
  await S._tick(T0 + MIN);
  await env.settle();
  // The first entry is taken right away (synchronously, like the extension), the other 6 go to the queue -> the cap of 5 drops the oldest (q2)
  assert.equal(env.popupShown.length, 1, 'the first entry shows immediately');
  assert.equal(S._queue.length, 5);
  await env.advance(14 * 1000);
  assert.equal(env.popupShown.length, 1, 'not yet 15s');
  await env.advance(1000);
  assert.equal(env.popupShown.length, 2, 'exactly 15s later -> the next entry');
  await env.advance(5 * MIN);
  assert.equal(env.popupShown.length, 6, '7 entries: 1 shown immediately + a queue capped at 5');
  const ids = env.popupShown.map((p) => p.reminder.id);
  assert.deepEqual(ids, ['q1', 'q3', 'q4', 'q5', 'q6', 'q7'], 'the OLDEST queued entry is dropped (q2)');

  // Picker dedupe: the same picker hits 2 slots in a row while queued -> only 1 is kept
  const e2 = createEnv({ now: T0 });
  const S2 = e2.loadScheduler();
  e2.seed({
    settings: { enabled: true },
    reminders: [intervalReminder('r1', 10)],
    pickers: [pickerOf('pk', items2(), [hhmm(T0 + MIN), hhmm(T0 + 2 * MIN)])],
    schedulerState: { intervalNext: { r1: T0 + MIN }, fired: {} }
  });
  e2.setNow(T0 + MIN);
  await S2._tick(T0 + MIN); // r1 + pk (slot 1) both due: r1 shows, pk waits
  await e2.settle();
  assert.equal(e2.popupShown.length, 1);
  assert.equal(S2._queue.length, 1);
  e2.setNow(T0 + 2 * MIN);
  await S2._tick(T0 + 2 * MIN); // pk (slot 2) -> replaces the waiting entry, nothing extra is queued
  await e2.settle();
  assert.equal(S2._queue.length, 1);
  await e2.advance(20 * 1000);
  assert.equal(e2.popupShown.length, 2, 'only 1 picker popup for 2 slots');
  assert.equal(e2.popupShown[1].kind, 'picker');
});

test('getEffectivePickers: boolean pref, object pref, user times beat server times, state', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({
    pickers: [pickerOf('local-1', items2(), ['11:30'], { lastPickedId: 'a' })],
    serverPickers: [
      { id: 'srv-1', name: 'A', icon: '🍚', times: ['12:00'], weekdays: [1, 2], displayMinutes: 5, items: items2() },
      { id: 'srv-2', name: 'B', icon: '🍚', times: ['12:00'], weekdays: [], displayMinutes: 5, items: items2() },
      { id: 'srv-3', name: 'C', icon: '🍚', times: ['15:00'], weekdays: [], displayMinutes: 5, items: items2() },
      { id: 'srv-4', name: 'D', icon: '🍚', times: ['15:00'], weekdays: [], displayMinutes: 5, items: items2() },
      { id: 'not-server', name: 'E', icon: '🍚', times: ['15:00'], weekdays: [], displayMinutes: 5, items: items2() }
    ],
    serverPickerPrefs: {
      'srv-1': false,
      'srv-2': { enabled: true, times: ['09:00', '08:00', '08:00', 'bad', '25:00'] },
      'srv-3': { enabled: false },
      'srv-4': true
    },
    serverPickerState: { 'srv-2': 'b', 'srv-4': 42 }
  });
  const list = j(await S.getEffectivePickers());
  assert.deepEqual(list.map((p) => p.id), ['local-1', 'srv-1', 'srv-2', 'srv-3', 'srv-4'], 'ids that are not srv- are dropped');
  assert.equal(list[0].fromServer, undefined);
  assert.equal(list[0].lastPickedId, 'a');

  const s1 = list[1];
  assert.equal(s1.enabled, false);
  assert.deepEqual(s1.times, ['12:00']);
  assert.equal(s1.fromServer, true);
  assert.equal(s1.customTimes, false);

  const s2 = list[2];
  assert.equal(s2.enabled, true);
  assert.deepEqual(s2.times, ['08:00', '09:00'], 'user times: valid ones only, deduplicated, sorted');
  assert.equal(s2.customTimes, true);
  assert.equal(s2.lastPickedId, 'b');

  assert.equal(list[3].enabled, false);
  assert.deepEqual(list[3].times, ['15:00']);
  assert.equal(list[4].enabled, true);
  assert.equal(list[4].lastPickedId, '', 'wrongly typed state -> empty');

  assert.deepEqual(j(S.readServerPickerPref(undefined)), { enabled: true, times: null });
  assert.deepEqual(j(S.readServerPickerPref(false)), { enabled: false, times: null });
  assert.deepEqual(j(S.readServerPickerPref({ enabled: true, times: [] })), { enabled: true, times: null });
});

test('preview: shows immediately even with the master toggle off, updates _lastNotifAt, accepts an object with missing fields', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ settings: { enabled: false, darkMode: true, soundEnabled: false, soundVolume: 150 }, language: 'vi', listMessage: [{ message: 'Hello', url: 'https://remind.asia', status: 'new', image: 'https://remind.asia/a.png' }] });
  // Fake VersionApi to check versionMessage
  env.sandbox.VersionApi = { async getRandomMessage() { return { message: 'Hello', url: 'https://remind.asia', status: 'new', image: 'https://remind.asia/a.png' }; } };

  await S.previewReminder({ message: 'Preview', icon: '🔔', color: '#ff0000', imageUrl: 'http://insecure/x.png', displayMinutes: 3 });
  assert.equal(env.popupShown.length, 1);
  const p = env.popupShown[0];
  assert.equal(p.kind, 'reminder');
  assert.equal(p.reminder.message, 'Preview');
  assert.equal(p.reminder.id, '');
  assert.equal(p.reminder.imageUrl, '', 'http images are dropped');
  assert.equal(p.reminder.displayMinutes, 3);
  assert.equal(p.darkMode, true);
  assert.equal(p.soundEnabled, false);
  assert.equal(p.soundVolume, 150);
  assert.equal(p.language, 'vi');
  assert.equal(p.versionMessage, 'Hello');
  assert.equal(p.versionUrl, 'https://remind.asia');
  assert.equal(p.versionStatus, 'new');
  assert.equal(p.versionImage, 'https://remind.asia/a.png');
  assert.equal(S._getLastNotifAt(), T0);

  // previewPicker by id (local) and by object (server)
  env.seed({
    pickers: [pickerOf('p1', items2(), ['12:00'], { lastPickedId: 'a' })],
    serverPickers: [{ id: 'srv-9', name: 'Srv', icon: '🍚', times: ['12:00'], weekdays: [], displayMinutes: 5, items: items2() }],
    serverPickerState: { 'srv-9': 'b' }
  });
  assert.equal(await S.previewPicker('p1'), true);
  assert.equal(env.popupShown[1].kind, 'picker');
  assert.equal(env.popupShown[1].item.id, 'b');
  assert.equal(env.get('pickers')[0].lastPickedId, 'b');

  const srv = (await S.getEffectivePickers()).find((x) => x.id === 'srv-9');
  assert.equal(await S.previewPicker(srv), true);
  assert.equal(env.popupShown[2].item.id, 'a');
  assert.equal(env.get('serverPickerState')['srv-9'], 'a');

  assert.equal(await S.previewPicker('missing'), false);
  assert.equal(await S.previewPicker({ id: 'x', name: 'Empty', items: [] }), false);
  assert.equal(env.popupShown.length, 3);
});

test('popup events: POPUP_DISPLAYED -> popupStats/popupToday; OPEN_MAPS -> openExternal; an overlong query is refused', async () => {
  const env = createEnv({ now: localDate(2026, 9, 14, 10, 7, 30) });
  const S = env.loadScheduler();
  await S.init();
  await env.emitPopupEvent({ type: 'POPUP_DISPLAYED', kind: 'reminder' });
  await env.emitPopupEvent({ type: 'POPUP_DISPLAYED', kind: 'picker' });
  assert.deepEqual(env.get('popupStats'), { '10:05 14/09/2026': 2 });
  assert.deepEqual(env.get('popupToday'), { date: '14/09/2026', count: 2 });

  await env.emitPopupEvent({ type: 'OPEN_MAPS', query: 'Döner Kebab' });
  assert.deepEqual(env.opened, ['https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Döner Kebab')]);
  await env.emitPopupEvent({ type: 'OPEN_MAPS', query: 'x'.repeat(201) });
  await env.emitPopupEvent({ type: 'OPEN_MAPS', query: { url: 'https://evil' } });
  await env.emitPopupEvent({ type: 'OPEN_MAPS' });
  assert.equal(env.opened.length, 1);
  assert.equal(await S.handlePopupEvent({ type: 'UNKNOWN' }), false);
  assert.equal(await S.handlePopupEvent(null), false);
});

test('popupStats: capped at 4000 slots, the oldest is dropped', async () => {
  const env = createEnv({ now: localDate(2026, 9, 14, 10, 0, 0) });
  const S = env.loadScheduler();
  const stats = {};
  for (let i = 0; i < 4000; i++) {
    const d = new Date(localDate(2026, 1, 1, 0, 0, 0) + i * 5 * MIN);
    stats[hhmm(d.getTime()) + ' ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear()] = 1;
  }
  env.seed({ popupStats: stats });
  await S.trackPopupDisplayed();
  const after = env.get('popupStats');
  assert.equal(Object.keys(after).length, 4000);
  assert.equal(after['00:00 01/01/2026'], undefined, 'the oldest slot is dropped');
  assert.equal(after['10:00 14/09/2026'], 1);
});

test('getUpcoming: sorted by time, mixes reminders + pickers, master off -> []', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  const today = new Date(T0).getDay();
  const sched = T0 + 20 * MIN;
  env.seed({
    settings: { enabled: true },
    reminders: [
      intervalReminder('i1', 45),
      { id: 's1', type: 'scheduled', message: 'Sched', icon: '📅', scheduledTimes: [{ date: ymd(T0 - MIN), time: hhmm(T0 - MIN) }, { date: ymd(sched), time: hhmm(sched) }], enabled: true },
      intervalReminder('off', 1, { enabled: false }),
      { id: 'legacy', type: 'scheduled', message: 'Legacy', times: [hhmm(T0 + 5 * MIN)], enabled: true }
    ],
    pickers: [
      pickerOf('pk-today', items2(), [hhmm(T0 + 10 * MIN)], { weekdays: [today] }),
      pickerOf('pk-notoday', items2(), [hhmm(T0 + 2 * MIN)], { weekdays: [(today + 3) % 7] })
    ]
  });
  await S._tick(T0);
  await env.settle();
  const list = j(await S.getUpcoming(10));
  assert.deepEqual(list.map((e) => e.id), ['legacy', 'pk-today', 's1', 'i1', 'pk-notoday']);
  assert.equal(list[0].at, T0 + 5 * MIN);
  assert.equal(list[1].kind, 'picker');
  assert.equal(list[1].title, 'Picker pk-today');
  assert.equal(list[2].at, sched);
  assert.equal(list[3].at, T0 + 45 * MIN);
  assert.equal(list[3].kind, 'reminder');
  assert.equal(list[3].icon, '💧');
  assert.equal(new Date(list[4].at).getDay(), (today + 3) % 7);
  assert.equal((await S.getUpcoming(2)).length, 2);

  env.seed({ settings: { enabled: false } });
  assert.deepEqual(j(await S.getUpcoming(5)), []);
});

test('init: subscribes to onTick + storage.onChanged; storage changes -> rebuild; internal timer 1s..60s', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({ settings: { enabled: true }, reminders: [] });
  await S.init();
  await env.settle();
  assert.equal(env.timers.count(), 1, 'a timer is armed for the nearest due slot');

  // The UI saves a new reminder through storage -> onChanged -> the tick schedules it
  await env.storage.set({ reminders: [intervalReminder('n1', 2)] });
  await env.settle();
  assert.equal(S._getState().intervalNext.n1, T0 + 2 * MIN);

  // Advance 2 minutes on the fake timers (the internal timer <= 60s ticks by itself, the 30s onTick is simulated too)
  await env.advance(2 * MIN + 500);
  assert.equal(env.popupShown.length, 1);
  assert.equal(env.popupShown[0].reminder.id, 'n1');

  // The tick coming from Rust works too
  env.setNow(env.now + 2 * MIN);
  await env.tick();
  assert.equal(env.popupShown.length, 2);

  // Only lastPickedId changed -> no rebuild (no churn), times changed -> rebuild
  await env.storage.set({ pickers: [pickerOf('p', items2(), ['00:01'])] });
  await env.settle();
  const before = env.get('schedulerState');
  await env.storage.set({ pickers: [pickerOf('p', items2(), ['00:01'], { lastPickedId: 'a' })] });
  await env.settle();
  assert.deepEqual(env.get('schedulerState'), before);
});

test('init: an intervalNext left over from the previous session -> no popup at startup, the slot moves to now + interval', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({
    settings: { enabled: true },
    reminders: [intervalReminder('old', 30), intervalReminder('fresh', 30), intervalReminder('off', 30, { enabled: false })],
    schedulerState: { intervalNext: { old: T0 - 3 * 60 * MIN, fresh: T0 + 5 * MIN, off: T0 - MIN, gone: T0 - MIN }, fired: {} }
  });
  await S.init();
  await env.settle();
  assert.equal(env.popupShown.length, 0, 'nothing fires at startup');
  const next = S._getState().intervalNext;
  assert.equal(next.old, T0 + 30 * MIN, 'an overdue slot moves to now + interval');
  assert.equal(next.fresh, T0 + 5 * MIN, 'a slot that is not due yet stays as it is');
  assert.equal(next.off, undefined, 'disabled reminder -> slot dropped');
  assert.equal(next.gone, undefined, 'deleted reminder -> slot dropped');

  // During a running session: the machine sleeps past a slot -> it still fires once, then reschedules
  const late = T0 + 4 * 60 * MIN;
  env.setNow(late);
  await S._tick(late);
  await env.advance(16 * 1000); // the second one waits the 15s spacing
  assert.equal(env.popupShown.length, 2, 'old + fresh are both overdue after the sleep -> each fires once');
  assert.equal(S._getState().intervalNext.old, late + 30 * MIN);
});

test('corrupt data does not break the tick', async () => {
  const env = createEnv({ now: T0 });
  const S = env.loadScheduler();
  env.seed({
    settings: 'bad',
    reminders: [null, 5, { id: 7, type: 'interval', interval: 1 }, { id: 'x', type: 'interval', interval: 'abc' }, { id: 'y', type: 'scheduled', scheduledTimes: [{ date: '2026-02-31', time: '10:00' }, 'zz', { date: 'bad', time: '10:00' }] }, { id: 'z', type: 'weird' }],
    pickers: 'nope',
    serverPickers: [{ id: 'srv-1', times: 'x', items: [{ name: 'A' }] }, null],
    serverPickerPrefs: [],
    schedulerState: { intervalNext: { a: 'x' }, fired: 'bad' }
  });
  await S._tick(T0);
  await env.settle();
  assert.equal(env.popupShown.length, 0);
  assert.deepEqual(j(S._getState()), { intervalNext: {}, fired: {} });
});
