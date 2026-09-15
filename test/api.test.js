// api.test.js - tests for window.VersionApi (src/js/api.js) with a fake fetch + fake Platform.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEnv, localDate } = require('./helpers/fake-platform');

const MIN = 60 * 1000;
const T0 = localDate(2026, 9, 14, 10, 0, 0);
const j = (v) => JSON.parse(JSON.stringify(v));

function serverPicker(extra) {
  return Object.assign({
    id: 'srv-5', kind: 'food', name: 'What is for lunch?', icon: '🍚', times: ['11:30'], weekdays: [1, 2, 3, 4, 5], displayMinutes: 5,
    items: [{ id: 'pho', name: 'Pho', emoji: '🍜', image: 'https://upload.wikimedia.org/pho.jpg', imageCredit: 'A / CC BY', imageSource: 'https://commons.wikimedia.org/x', priceMin: 30000, priceMax: 50000 }]
  }, extra || {});
}

test('request body has the right shape: version, popupStats batch, source desktop_<os>, language, installId, batchId, pickersHash', async () => {
  const env = createEnv({ now: T0, os: 'macos', version: '1.2.3' });
  const S = env.loadScheduler();
  const A = env.loadApi();
  env.seed({
    language: 'vi',
    installId: '11111111-2222-4333-8444-555555555555',
    popupStats: { '10:05 14/09/2026': 3, '09:55 14/09/2026': 1, 'garbage': 9 },
    serverPickers: [],
    serverPickersHash: 'abc123'
  });
  const calls = env.mockFetch(() => ({ status: 200, json: { code: 200, version: '2.16.4', list_message: [], pickersHash: 'abc123' } }));
  const data = await A.callVersionAPI(true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://remind.asia/api/ext/version');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.ok(calls[0].init.signal, 'carries an AbortSignal (5s timeout)');
  const body = calls[0].body;
  assert.equal(body.version, '1.2.3');
  assert.equal(body.source, 'desktop_macos');
  assert.equal(body.language, 'vi');
  assert.equal(body.installId, '11111111-2222-4333-8444-555555555555');
  assert.equal(body.pickersHash, 'abc123');
  assert.match(body.batchId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(body.popupStats, [{ time: '09:55 14/09/2026', count: 1 }, { time: '10:05 14/09/2026', count: 3 }], 'oldest slot first, junk slots dropped');
  assert.deepEqual(Object.keys(body).sort(), ['batchId', 'installId', 'language', 'pickersHash', 'popupStats', 'source', 'version']);
  assert.equal(j(data).code, 200);
  assert.equal(env.get('popupPendingBatch'), undefined, 'server 200 -> the batch is cleared');
  assert.deepEqual(env.get('popupStats'), {}, 'the stats were sent, junk slots are cleaned up too');
  assert.equal(typeof env.get('lastAPICallTime'), 'number');
  assert.ok(S, 'the scheduler is loaded too so both share the mutex');
});

test('heartbeat with no stats: popupStats [] and no batchId; installId is generated', async () => {
  const env = createEnv({ now: T0 });
  const A = env.loadApi();
  const calls = env.mockFetch(() => ({ status: 200, json: { code: 200, list_message: [] } }));
  await A.callVersionAPI(true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.popupStats, []);
  assert.equal(calls[0].body.batchId, undefined);
  assert.equal(calls[0].body.pickersHash, undefined);
  assert.equal(calls[0].body.source, 'desktop_windows');
  assert.equal(calls[0].body.language, 'en');
  assert.match(calls[0].body.installId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(env.get('installId'), calls[0].body.installId, 'installId is stored locally');
});

test('reliable delivery: the batch is kept on non-200 / network error, resent under the same id, cleared only on 200', async () => {
  const env = createEnv({ now: T0 });
  env.loadScheduler();
  const A = env.loadApi();
  env.seed({ popupStats: { '10:00 14/09/2026': 2 } });

  // Attempt 1: server 503
  let calls = env.mockFetch(() => ({ status: 503, json: {} }));
  assert.equal(await A.callVersionAPI(true), null);
  const batch = env.get('popupPendingBatch');
  assert.ok(batch && batch.id && batch.items.length === 1, 'the pending batch is still there');
  assert.deepEqual(env.get('popupStats'), {}, 'the slots moved into the batch');
  const firstId = calls[0].body.batchId;
  assert.equal(batch.id, firstId);

  // A new popup while the server is down -> goes to popupStats (it does not touch the batch)
  env.seed({ popupStats: { '10:05 14/09/2026': 1 } });

  // Attempt 2: network error
  env.setNow(T0 + 31 * MIN);
  calls = env.mockFetch(() => new Error('network'));
  assert.equal(await A.callVersionAPI(true), null);
  assert.equal(calls[0].body.batchId, firstId, 'resends the SAME old batch');
  assert.ok(env.get('popupPendingBatch'), 'the batch is still kept');

  // Attempt 3: 200 -> the old batch is cleared and the next batch (the new slots) is sent in the same call
  env.setNow(T0 + 62 * MIN);
  calls = env.mockFetch(() => ({ status: 200, json: { code: 200, list_message: [] } }));
  await A.callVersionAPI(true);
  assert.equal(calls.length, 2, 'the old batch + the new batch');
  assert.equal(calls[0].body.batchId, firstId);
  assert.deepEqual(calls[0].body.popupStats, [{ time: '10:00 14/09/2026', count: 2 }]);
  assert.notEqual(calls[1].body.batchId, firstId);
  assert.deepEqual(calls[1].body.popupStats, [{ time: '10:05 14/09/2026', count: 1 }]);
  assert.equal(env.get('popupPendingBatch'), undefined);
  assert.deepEqual(env.get('popupStats'), {});
});

test('at most 10 batches per call, each batch <= 500 slots', async () => {
  const env = createEnv({ now: T0 });
  const A = env.loadApi();
  const stats = {};
  const base = localDate(2026, 1, 1, 0, 0, 0);
  for (let i = 0; i < 5200; i++) {
    const d = new Date(base + i * 5 * MIN);
    const key = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    stats[key] = 1;
  }
  env.seed({ popupStats: stats });
  const calls = env.mockFetch(() => ({ status: 200, json: { code: 200 } }));
  await A.callVersionAPI(true);
  assert.equal(calls.length, 10);
  for (const c of calls) assert.equal(c.body.popupStats.length, 500);
  assert.equal(Object.keys(env.get('popupStats')).length, 200, 'the rest waits for the next call');
  assert.equal(env.get('popupPendingBatch'), undefined);
});

test('30 minute throttle when not forced, 5s debounce (forced: 1s)', async () => {
  const env = createEnv({ now: T0 });
  const A = env.loadApi();
  const calls = env.mockFetch(() => ({ status: 200, json: { code: 200 } }));
  env.seed({ lastAPICallTime: T0 - 10 * MIN });
  assert.equal(await A.callVersionAPI(false), null, 'less than 30 minutes so far');
  assert.equal(calls.length, 0);
  env.setNow(T0 + 21 * MIN);
  await A.callVersionAPI(false);
  assert.equal(calls.length, 1, '30 minutes since lastAPICallTime');
  env.setNow(T0 + 21 * MIN + 500);
  assert.equal(await A.callVersionAPI(true), null, 'forced calls are still spam-blocked for 1s');
  assert.equal(calls.length, 1);
  env.setNow(T0 + 21 * MIN + 3000);
  assert.equal(await A.callVersionAPI(false), null, 'not forced: 5s debounce');
  assert.equal(calls.length, 1);
  await A.callVersionAPI(true);
  assert.equal(calls.length, 2, 'a forced call (language change) skips the 30 minute throttle and the 5s debounce');
});

test('missing pickers field -> KEEP the existing serverPickers, only update the hash', async () => {
  const env = createEnv({ now: T0 });
  env.loadScheduler();
  const A = env.loadApi();
  const old = [serverPicker()];
  env.seed({ serverPickers: old, serverPickerPrefs: { 'srv-5': false }, serverPickerState: { 'srv-5': 'pho' }, serverPickersHash: 'h0' });
  env.mockFetch(() => ({ status: 200, json: { code: 200, list_message: [], pickersHash: 'h1' } }));
  await A.callVersionAPI(true);
  assert.deepEqual(env.get('serverPickers'), old);
  assert.deepEqual(env.get('serverPickerPrefs'), { 'srv-5': false });
  assert.deepEqual(env.get('serverPickerState'), { 'srv-5': 'pho' });
  assert.equal(env.get('serverPickersHash'), 'h1');
  assert.equal(A.getServerPickersHash(), 'h1');
});

test('server pickers: sanitize (id must be srv-, images https only, valid prices) + store the hash + Scheduler.rebuild on change', async () => {
  const env = createEnv({ now: T0 });
  let rebuilds = 0;
  env.sandbox.Scheduler = { rebuild: async () => { rebuilds += 1; }, _popupStatsLock: (fn) => fn() };
  const A = env.loadApi();
  env.seed({ serverPickers: [], serverPickerPrefs: { 'srv-9': false, 'srv-5': { enabled: true, times: ['12:00'] } }, serverPickerState: { 'srv-9': 'x' } });
  const raw = [
    { id: 'local-1', name: 'Fake local', times: ['12:00'], items: [{ name: 'A' }] },       // bad id -> the whole set is dropped
    { id: 'srv-abc', name: 'Bad id', times: ['12:00'], items: [{ name: 'A' }] },            // bad id -> dropped
    { id: 'srv-6', name: 'No times', times: ['25:00', 'x'], items: [{ name: 'A' }] },        // no time left -> dropped
    { id: 'srv-7', name: 'No items', times: ['12:00'], items: [{ name: '' }, null, 'str'] }, // no item left -> dropped
    serverPicker({
      name: '  What is for lunch?  ', icon: '', times: ['11:30', '11:30', '08:00', 'bad'], weekdays: [5, 1, 1, 9, -1, 'x'], displayMinutes: 999, kind: 'weird', updatedAt: 42,
      items: [
        { id: 'pho', name: 'Pho', emoji: '🍜', image: 'https://upload.wikimedia.org/pho.jpg', imageCredit: 'A / CC BY', imageSource: 'https://commons.wikimedia.org/x', priceMin: 30000, priceMax: 50000 },
        { id: 'bun cha!', name: 'Bun cha', emoji: '🥣', image: 'http://insecure/bun.jpg', imageSource: 'javascript:alert(1)', priceMin: 60000, priceMax: 40000 },
        { id: 'x', name: 'x'.repeat(100), image: 'data:image/png;base64,AAAA', priceMin: '20000', priceMax: 0 },
        { name: '' }, null, 7
      ]
    })
  ];
  env.mockFetch(() => ({ status: 200, json: { code: 200, list_message: [], pickersHash: 'h2', pickers: raw } }));
  await A.callVersionAPI(true);

  const stored = env.get('serverPickers');
  assert.equal(stored.length, 1, 'only the srv-5 set is valid');
  const p = stored[0];
  assert.equal(p.id, 'srv-5');
  assert.equal(p.name, 'What is for lunch?', 'control characters stripped + trimmed');
  assert.equal(p.icon, '🍽️', 'empty icon -> default');
  assert.deepEqual(p.times, ['08:00', '11:30'], 'duplicates/invalid dropped, sorted');
  assert.deepEqual(p.weekdays, [1, 5]);
  assert.equal(p.displayMinutes, 60, 'clamped to 1..60');
  assert.equal(p.kind, 'other');
  assert.equal(p.updatedAt, '');
  assert.equal(p.items.length, 3);
  assert.equal(p.items[0].image, 'https://upload.wikimedia.org/pho.jpg');
  assert.equal(p.items[0].priceMin, 30000);
  assert.equal(p.items[1].id, 'buncha', 'id keeps only [A-Za-z0-9_-]');
  assert.equal(p.items[1].image, '', 'http images are dropped');
  assert.equal(p.items[1].imageSource, '', 'javascript: is dropped');
  assert.equal(p.items[1].priceMin, 0, 'min > max -> both dropped');
  assert.equal(p.items[1].priceMax, 0);
  assert.equal(p.items[2].name.length, 60);
  assert.equal(p.items[2].image, '', 'data: from the server is dropped');
  assert.equal(p.items[2].priceMin, 20000, 'numeric string price -> coerced (same as the extension)');
  assert.equal(p.items[2].priceMax, 20000, 'only min given -> max = min');
  assert.deepEqual(Object.keys(p.items[0]).sort(), ['emoji', 'id', 'image', 'imageCredit', 'imageSource', 'name', 'priceMax', 'priceMin']);

  assert.deepEqual(env.get('serverPickerPrefs'), { 'srv-5': { enabled: true, times: ['12:00'] } }, 'prefs of vanished sets are cleaned up, object prefs are kept');
  assert.deepEqual(env.get('serverPickerState'), {}, 'state of vanished sets is cleaned up');
  assert.equal(env.get('serverPickersHash'), 'h2');
  assert.equal(rebuilds, 1, 'data changed -> Scheduler.rebuild()');

  // Send exactly the same thing -> no change -> no rebuild; the hash rides along with the request
  env.setNow(T0 + 31 * MIN);
  const calls = env.mockFetch(() => ({ status: 200, json: { code: 200, pickersHash: 'h2', pickers: raw } }));
  await A.callVersionAPI(true);
  assert.equal(calls[0].body.pickersHash, 'h2');
  assert.equal(rebuilds, 1);

  // Server returns pickers: [] -> wipe everything (different from a missing field)
  env.setNow(T0 + 62 * MIN);
  env.mockFetch(() => ({ status: 200, json: { code: 200, pickersHash: '', pickers: [] } }));
  await A.callVersionAPI(true);
  assert.deepEqual(env.get('serverPickers'), []);
  assert.equal(rebuilds, 2);
});

test('list_message sanitize: message/status <= 500, url http/https, images https only, non-object entries dropped', async () => {
  const env = createEnv({ now: T0 });
  const A = env.loadApi();
  const list = [
    { message: 'm'.repeat(600), status: 's'.repeat(600), url: 'https://remind.asia/x', image: 'https://remind.asia/i.png', extra: 'drop' },
    { message: 'http ok', url: 'http://remind.asia', image: 'http://remind.asia/i.png' },
    { message: 'bad url', url: 'javascript:alert(1)', image: 'data:image/png;base64,AAAA' },
    { message: 42, url: 7, image: null },
    'string', null, 5, ['x']
  ];
  env.mockFetch(() => ({ status: 200, json: { code: 200, list_message: list } }));
  await A.callVersionAPI(true);
  const stored = env.get('listMessage');
  assert.equal(stored.length, 4);
  assert.equal(stored[0].message.length, 500);
  assert.equal(stored[0].status.length, 500);
  assert.equal(stored[0].url, 'https://remind.asia/x');
  assert.equal(stored[0].image, 'https://remind.asia/i.png');
  assert.equal(stored[0].extra, undefined);
  assert.equal(stored[1].url, 'http://remind.asia');
  assert.equal(stored[1].image, undefined, 'http images are dropped');
  assert.equal(stored[2].url, undefined);
  assert.equal(stored[2].image, undefined);
  assert.deepEqual(stored[3], {});

  const msg = j(await A.getRandomMessage());
  assert.deepEqual(Object.keys(msg).sort(), ['image', 'message', 'status', 'url']);
  assert.equal(typeof msg.message, 'string');

  // No listMessage -> null
  env.seed({ listMessage: [] });
  assert.equal(await A.getRandomMessage(), null);
  assert.deepEqual(j(A.sanitizeListMessage('nope')), []);
});

test('a broken response (json error / not an object) does not crash, the batch is still acknowledged on 200', async () => {
  const env = createEnv({ now: T0 });
  const A = env.loadApi();
  env.seed({ popupStats: { '10:00 14/09/2026': 1 }, listMessage: [{ message: 'keep' }] });
  env.mockFetch(() => ({ status: 200, json: new Error('bad json') }));
  const data = await A.callVersionAPI(true);
  assert.equal(data, null);
  assert.equal(env.get('popupPendingBatch'), undefined, '200 -> the batch is cleared even with a broken body');
  assert.deepEqual(env.get('listMessage'), [{ message: 'keep' }], 'listMessage is not overwritten');

  env.setNow(T0 + 31 * MIN);
  env.mockFetch(() => ({ status: 200, json: { code: 200, list_message: 'nope', pickers: 'nope', pickersHash: 12 } }));
  await A.callVersionAPI(true);
  assert.deepEqual(env.get('listMessage'), [{ message: 'keep' }]);
  assert.equal(env.get('serverPickers'), undefined);
});

test('init: ensureInstallId, throttled API call at startup, then every 30 minutes (forced)', async () => {
  const env = createEnv({ now: T0 });
  env.loadScheduler();
  const A = env.loadApi();
  env.seed({ lastAPICallTime: T0 - 5 * MIN });
  const calls = env.mockFetch(() => ({ status: 200, json: { code: 200 } }));
  await A.init();
  await env.settle();
  assert.ok(env.get('installId'));
  assert.equal(calls.length, 0, 'called 5 minutes ago -> throttled at startup');
  await env.advance(30 * MIN);
  assert.equal(calls.length, 1, 'after 30 minutes it calls (forced)');
  await env.advance(30 * MIN);
  assert.equal(calls.length, 2);
  A._stopInterval();
  await env.advance(60 * MIN);
  assert.equal(calls.length, 2);
});
