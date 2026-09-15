// api.js - calls the remind.asia server API for the desktop app (window.VersionApi).
// Ported from the browser extension's background worker: callVersionAPI + reliable popupStats delivery (server SPEC §10.1)
// + list_message messages + server pickers (picker spec §11, §14.6).
// Body: { version, popupStats, source: 'desktop_<os>', language, installId, batchId?, pickersHash? }
// -> POST Platform.apiBase + '/api/ext/version' (5s timeout). Response: { code, version, list_message[], pickersHash?, pickers?, pickersAvailable? }.
// `pickersAvailable` (DESKTOP-SPEC §21): the Food & drinks tab only opens in allowed countries; a missing field keeps the current value.
// Everything the server returns is UNTRUSTED: check types, cap lengths, https images only.
// Talks to the OS only through window.Platform; does not touch the DOM.

(function () {
  'use strict';

  if (window.VersionApi) return;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const API_PATH = '/api/ext/version';
  const API_CALL_INTERVAL_MS = 30 * 60 * 1000;  // periodic call every 30 minutes
  const API_THROTTLE_MS = 30 * 60 * 1000;       // at least 30 minutes between 2 calls (when not forced)
  const API_FORCE_DEBOUNCE_MS = 1000;           // a forced call still blocks spam within 1s
  const API_DEBOUNCE_MS = 5000;                 // no back-to-back calls within 5s
  const API_TIMEOUT_MS = 5000;
  const POPUP_BATCH_MAX_SLOTS = 500;
  const POPUP_MAX_BATCHES_PER_CALL = 10;
  const LIST_MESSAGE_MAX = 200;

  const SERVER_PICKER_ID_RE = /^srv-[0-9]{1,19}$/;
  const SERVER_PICKER_MAX = 10;
  const SERVER_PICKER_ITEM_MAX = 200;
  const SERVER_PICKER_TIME_MAX = 10;
  const SERVER_PICKER_PRICE_MAX = 100000000;
  const PICKER_TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  const INSTALL_ID_RE = /^[0-9a-f-]{36}$/i;

  // Clock that tests can swap out (VersionApi._clock.now = ...). Production: Date.now.
  const clock = { now: function () { return Date.now(); } };
  function now() { return clock.now(); }

  function P() { return window.Platform; }
  function sget(keys) { return P().storage.get(keys); }
  function sset(obj) { return P().storage.set(obj); }
  function sremove(keys) { return P().storage.remove(keys); }

  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function pad2(n) { return String(n).padStart(2, '0'); }

  function randomUUID() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    } catch (e) { /* ignore */ }
    // Fallback UUID v4 (only when the WebView lacks crypto.randomUUID)
    const bytes = new Array(16);
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  // popupStats mutex: shared with Scheduler.trackPopupDisplayed when available, otherwise a local one.
  let localLockQueue = Promise.resolve();
  function withPopupStatsLock(fn) {
    const S = window.Scheduler;
    if (S && typeof S._popupStatsLock === 'function') return S._popupStatsLock(fn);
    const run = localLockQueue.then(fn, fn);
    localLockQueue = run.then(function () {}, function () {});
    return run;
  }

  // ---------------------------------------------------------------------------
  // Popup stats - reliable delivery (web SPEC §10.1): the numbers are ONLY dropped when the server returns 200
  // ---------------------------------------------------------------------------
  /** "HH:mm dd/mm/yyyy" -> epoch ms (local time), NaN if the format is wrong. */
  function parseSlotTime(str) {
    if (typeof str !== 'string') return NaN;
    const m = str.match(/^(\d{1,2}):(\d{2}) (\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return NaN;
    return new Date(Number(m[5]), Number(m[4]) - 1, Number(m[3]), Number(m[1]), Number(m[2])).getTime();
  }

  /**
   * Take the batch to send: a batch still pending (the last send failed) -> return THAT batch (same id, so the server dedupes);
   * none -> split off at most the 500 oldest slots from popupStats. Returns null when there are no numbers (heartbeat).
   */
  function takePopupBatch() {
    return withPopupStatsLock(async function () {
      try {
        const store = await sget(['popupStats', 'popupPendingBatch']);
        const pending = store.popupPendingBatch;
        if (pending && typeof pending.id === 'string' && Array.isArray(pending.items) && pending.items.length > 0) {
          return pending;
        }
        const popupStats = obj(store.popupStats);
        // Malformed key / count <= 0 (corrupt storage) -> drop it, or it causes a useless heartbeat every 30 minutes
        let dirty = false;
        for (const k of Object.keys(popupStats)) {
          if (!Number.isFinite(parseSlotTime(k)) || !(Number(popupStats[k]) > 0)) { delete popupStats[k]; dirty = true; }
        }
        const entries = Object.entries(popupStats)
          .sort(function (a, b) { return parseSlotTime(a[0]) - parseSlotTime(b[0]); });
        if (entries.length === 0) {
          if (dirty) await sset({ popupStats: popupStats });
          if (pending) await sremove('popupPendingBatch');
          return null;
        }
        const chosen = entries.slice(0, POPUP_BATCH_MAX_SLOTS);
        const items = chosen.map(function (e) { return { time: e[0], count: Math.floor(Number(e[1])) }; });
        for (const e of chosen) delete popupStats[e[0]];
        const batch = { id: randomUUID(), items: items, createdAt: now() };
        await sset({ popupStats: popupStats, popupPendingBatch: batch });
        return batch;
      } catch (e) {
        return null;
      }
    });
  }

  /** The server acknowledged it (200) -> drop the pending batch. */
  function discardPendingBatch(id) {
    return withPopupStatsLock(async function () {
      try {
        const store = await sget(['popupPendingBatch']);
        if (store.popupPendingBatch && store.popupPendingBatch.id === id) await sremove('popupPendingBatch');
      } catch (e) { /* ignore */ }
    });
  }

  async function hasUnsentPopupStats() {
    try {
      const store = await sget(['popupStats']);
      return Object.keys(obj(store.popupStats)).length > 0;
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // installId (web SPEC §12): anonymous UUID v4, generated once, stored locally only
  // ---------------------------------------------------------------------------
  async function ensureInstallId() {
    try {
      const store = await sget(['installId']);
      if (typeof store.installId === 'string' && INSTALL_ID_RE.test(store.installId)) return store.installId;
      const id = randomUUID();
      await sset({ installId: id });
      return id;
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // list_message
  // ---------------------------------------------------------------------------
  function isHttpUrl(val) {
    if (typeof val !== 'string' || val.length > 2000) return false;
    try {
      const u = new URL(val);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  function isHttpsUrl(val) {
    if (typeof val !== 'string' || val.length > 2000) return false;
    try { return new URL(val).protocol === 'https:'; } catch (e) { return false; }
  }

  /** Filter the server's list_message: objects only, string fields capped, http/https url, https images only. */
  function sanitizeListMessage(list) {
    if (!Array.isArray(list)) return [];
    return list
      .slice(0, LIST_MESSAGE_MAX)
      .filter(function (item) { return item && typeof item === 'object' && !Array.isArray(item); })
      .map(function (item) {
        const clean = {};
        if (typeof item.message === 'string') clean.message = item.message.slice(0, 500);
        if (typeof item.status === 'string') clean.status = item.status.slice(0, 500);
        if (isHttpUrl(item.url)) clean.url = item.url;
        if (isHttpsUrl(item.image)) clean.image = item.image;
        return clean;
      });
  }

  /** Take a random message from listMessage: { message, url, status, image } or null. */
  async function getRandomMessage() {
    try {
      const store = await sget(['listMessage']);
      const list = Array.isArray(store.listMessage) ? store.listMessage : [];
      if (list.length === 0) return null;
      const item = obj(list[Math.floor(Math.random() * list.length)]);
      return {
        message: typeof item.message === 'string' ? item.message.slice(0, 500) : '',
        url: isHttpUrl(item.url) ? item.url : '',
        status: typeof item.status === 'string' ? item.status.slice(0, 500) : '',
        image: isHttpsUrl(item.image) ? item.image : ''
      };
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Server pickers (picker spec §11.2) - strict sanitizing
  // ---------------------------------------------------------------------------
  function cleanServerText(value, max) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
  }

  function isServerPickerId(id) { return typeof id === 'string' && SERVER_PICKER_ID_RE.test(id); }

  function sanitizeServerPickerItem(raw, index) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const name = cleanServerText(raw.name, 60);
    if (!name) return null;
    const price = function (value) {
      const n = Number(value);
      return Number.isInteger(n) && n >= 0 && n <= SERVER_PICKER_PRICE_MAX ? n : 0;
    };
    let priceMin = price(raw.priceMin);
    let priceMax = price(raw.priceMax);
    if (priceMin && !priceMax) priceMax = priceMin;
    if (priceMax && !priceMin) priceMin = priceMax;
    if (priceMin > priceMax) { priceMin = 0; priceMax = 0; }
    return {
      id: cleanServerText(raw.id, 32).replace(/[^A-Za-z0-9_-]/g, '') || ('sit' + index),
      name: name,
      emoji: cleanServerText(raw.emoji, 8),
      image: isHttpsUrl(raw.image) ? raw.image : '',
      imageCredit: cleanServerText(raw.imageCredit, 160),
      imageSource: isHttpsUrl(raw.imageSource) ? raw.imageSource : '',
      priceMin: priceMin,
      priceMax: priceMax
    };
  }

  /** Clean the `pickers` array the server returned. A set that is invalid or has no items is dropped silently. */
  function sanitizeServerPickers(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const raw of list.slice(0, SERVER_PICKER_MAX)) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      if (!isServerPickerId(raw.id)) continue;
      const name = cleanServerText(raw.name, 80);
      if (!name) continue;
      const times = (Array.isArray(raw.times) ? raw.times : [])
        .map(function (t) { return cleanServerText(t, 5); })
        .filter(function (t) { return PICKER_TIME_RE.test(t); })
        .slice(0, SERVER_PICKER_TIME_MAX);
      if (times.length === 0) continue;
      const weekdays = (Array.isArray(raw.weekdays) ? raw.weekdays : [])
        .filter(function (d) { return Number.isInteger(d) && d >= 0 && d <= 6; })
        .slice(0, 7);
      const items = [];
      const rawItems = Array.isArray(raw.items) ? raw.items.slice(0, SERVER_PICKER_ITEM_MAX) : [];
      rawItems.forEach(function (it, i) {
        const clean = sanitizeServerPickerItem(it, i);
        if (clean) items.push(clean);
      });
      if (items.length === 0) continue;
      const minutes = Number.isInteger(raw.displayMinutes) ? raw.displayMinutes : 5;
      out.push({
        id: raw.id,
        kind: ['food', 'drink', 'other'].indexOf(raw.kind) >= 0 ? raw.kind : 'other',
        name: name,
        icon: cleanServerText(raw.icon, 8) || '🍽️',
        times: Array.from(new Set(times)).sort(),
        weekdays: Array.from(new Set(weekdays)).sort(function (a, b) { return a - b; }),
        displayMinutes: Math.min(60, Math.max(1, minutes)),
        updatedAt: cleanServerText(raw.updatedAt, 40),
        items: items
      });
    }
    return out;
  }

  /**
   * Store the server pickers + prune the preferences/last-picked of sets that disappeared.
   * @returns {Promise<boolean>} true if the data changed (the Scheduler needs a rebuild)
   */
  async function storeServerPickers(rawList) {
    const sets = sanitizeServerPickers(rawList);
    const store = await sget(['serverPickers', 'serverPickerPrefs', 'serverPickerState']);
    const before = Array.isArray(store.serverPickers) ? store.serverPickers : [];
    const ids = new Set(sets.map(function (p) { return p.id; }));
    const prefs = obj(store.serverPickerPrefs);
    const st = obj(store.serverPickerState);
    const nextPrefs = {};
    const nextState = {};
    for (const id of Object.keys(prefs)) if (ids.has(id)) nextPrefs[id] = prefs[id];
    for (const id of Object.keys(st)) if (ids.has(id)) nextState[id] = st[id];
    const changed = JSON.stringify(before) !== JSON.stringify(sets);
    await sset({ serverPickers: sets, serverPickerPrefs: nextPrefs, serverPickerState: nextState });
    return changed;
  }

  // §14.6: hash of the pickers we hold - sent with every request so the server only sends `pickers` when it changed
  let serverPickersHash = '';

  async function setServerPickersHash(hash) {
    const value = typeof hash === 'string' ? hash.slice(0, 64) : '';
    if (value === serverPickersHash) return;
    serverPickersHash = value;
    try { await sset({ serverPickersHash: value }); } catch (e) { /* ignore */ }
  }

  /** Reload the hash at startup; if the picker data is gone, drop the hash so the server resends everything. */
  async function loadServerPickersHash() {
    try {
      const store = await sget(['serverPickersHash', 'serverPickers']);
      const hasData = Array.isArray(store.serverPickers);
      serverPickersHash = hasData && typeof store.serverPickersHash === 'string' ? store.serverPickersHash.slice(0, 64) : '';
      if (!hasData && store.serverPickersHash) await sremove(['serverPickersHash']);
    } catch (e) {
      serverPickersHash = '';
    }
    return serverPickersHash;
  }

  // ---------------------------------------------------------------------------
  // Is the Food & drinks tab allowed in this country (DESKTOP-SPEC §21.1)
  // ---------------------------------------------------------------------------
  /**
   * Write the `pickersAvailable` key when the response HAS the boolean field. Missing field / wrong type -> write nothing
   * (an older server keeps working and the current value is kept).
   * @returns {Promise<boolean>} true if the value just changed (the Scheduler needs to rebuild its schedule)
   */
  async function storePickersAvailable(value) {
    if (typeof value !== 'boolean') return false;
    try {
      const store = await sget(['pickersAvailable']);
      // API never called = true (open by default)
      const current = store.pickersAvailable === false ? false : true;
      if (current === value) return false;
      await sset({ pickersAvailable: value });
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Calling the API
  // ---------------------------------------------------------------------------
  let lastAPICallTimestamp = 0; // 5s debounce (in memory)

  function sourceName() {
    const os = P().os;
    const known = ['windows', 'macos', 'linux', 'web'];
    return 'desktop_' + (known.indexOf(os) >= 0 ? os : 'web');
  }

  async function canCallAPI() {
    try {
      const store = await sget(['lastAPICallTime']);
      const last = Number(store.lastAPICallTime) || 0;
      return now() - last >= API_THROTTLE_MS;
    } catch (e) {
      return true;
    }
  }

  async function readLanguage() {
    try {
      const store = await sget(['language', 'settings']);
      if (store.language === 'vi' || store.language === 'en') return store.language;
      const s = obj(store.settings);
      if (s.language === 'vi' || s.language === 'en') return s.language;
    } catch (e) { /* ignore */ }
    return 'en';
  }

  /** Send 1 request. Returns { ok, data } - ok=false on a non-2xx HTTP status; throws on network error/timeout. */
  async function postVersionAPI(body) {
    const controller = new AbortController();
    const timeoutId = setTimeout(function () { controller.abort(); }, API_TIMEOUT_MS);
    try {
      const response = await fetch(P().apiBase + API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) return { ok: false, data: null };
      let data = null;
      try { data = await response.json(); } catch (e) { data = null; }
      return { ok: true, data: data };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Call the version API + send popupStats in batches (reliable delivery).
   * @param {boolean} force - skip the 30 minute throttle (the 5s debounce still applies)
   * @returns {Promise<object|null>} the data of the last response (null if nothing was sent or it failed)
   */
  async function callVersionAPI(force) {
    try {
      const t = now();
      // force = user click / language change -> only blocks spam for 1s; automatic -> 5s.
      if (t - lastAPICallTimestamp < (force ? API_FORCE_DEBOUNCE_MS : API_DEBOUNCE_MS)) return null;
      if (!force && !(await canCallAPI())) return null;
      lastAPICallTimestamp = t;

      const language = await readLanguage();
      const installId = await ensureInstallId();
      if (!serverPickersHash) await loadServerPickersHash();

      let lastData = null;
      for (let i = 0; i < POPUP_MAX_BATCHES_PER_CALL; i++) {
        const batch = await takePopupBatch(); // null -> heartbeat
        const body = {
          version: String(P().version || ''),
          popupStats: batch ? batch.items : [],
          source: sourceName(),
          language: language
        };
        if (installId) body.installId = installId;
        if (batch) body.batchId = batch.id;
        if (serverPickersHash) body.pickersHash = serverPickersHash;

        let result;
        try {
          result = await postVersionAPI(body);
        } catch (e) {
          return lastData; // network/timeout: keep the batch to resend next time
        }
        if (!result.ok) return lastData; // 5xx: keep the batch, retry later

        const data = result.data;
        lastData = data;
        try { await sset({ lastAPICallTime: now() }); } catch (e) { /* ignore */ }

        if (data && Array.isArray(data.list_message)) {
          await sset({ listMessage: sanitizeListMessage(data.list_message) });
        }
        // Server pickers: field `pickers` present -> store it + rebuild the schedule if it changed; missing field = KEEP AS IS
        if (data && Array.isArray(data.pickers)) {
          try {
            const changed = await storeServerPickers(data.pickers);
            await setServerPickersHash(typeof data.pickersHash === 'string' ? data.pickersHash : '');
            if (changed && window.Scheduler && typeof window.Scheduler.rebuild === 'function') {
              await window.Scheduler.rebuild();
            }
          } catch (e) { /* bad server data must not disturb the stats delivery */ }
        } else if (data && typeof data.pickersHash === 'string') {
          await setServerPickersHash(data.pickersHash);
        }

        // §21: boolean field present -> store it; a changed value rebuilds the schedule (the UI redraws via storage.onChanged)
        if (data && typeof data.pickersAvailable === 'boolean') {
          try {
            const flipped = await storePickersAvailable(data.pickersAvailable);
            if (flipped && window.Scheduler && typeof window.Scheduler.rebuild === 'function') {
              await window.Scheduler.rebuild();
            }
          } catch (e) { /* must not disturb the stats delivery */ }
        }

        if (!batch) break;                          // heartbeat done
        await discardPendingBatch(batch.id);        // the server got it -> drop the batch
        if (!(await hasUnsentPopupStats())) break;  // backlog is empty
      }
      return lastData;
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Startup
  // ---------------------------------------------------------------------------
  let started = false;
  let intervalTimer = null;

  async function init() {
    if (started) return;
    started = true;
    await P().ready;
    await ensureInstallId();
    await loadServerPickersHash();
    // At startup: respect the 30 minute throttle (like the extension's onStartup); then every 30 minutes (forced)
    callVersionAPI(false).catch(function () {});
    intervalTimer = setInterval(function () { callVersionAPI(true).catch(function () {}); }, API_CALL_INTERVAL_MS);
  }

  window.VersionApi = {
    init: init,
    callVersionAPI: callVersionAPI,
    getRandomMessage: getRandomMessage,
    ensureInstallId: ensureInstallId,
    sanitizeListMessage: sanitizeListMessage,
    sanitizeServerPickers: sanitizeServerPickers,
    storeServerPickers: storeServerPickers,
    storePickersAvailable: storePickersAvailable,
    getServerPickersHash: function () { return serverPickersHash; },
    constants: {
      API_PATH: API_PATH,
      API_CALL_INTERVAL_MS: API_CALL_INTERVAL_MS,
      API_THROTTLE_MS: API_THROTTLE_MS,
      API_DEBOUNCE_MS: API_DEBOUNCE_MS,
      API_TIMEOUT_MS: API_TIMEOUT_MS,
      POPUP_BATCH_MAX_SLOTS: POPUP_BATCH_MAX_SLOTS,
      POPUP_MAX_BATCHES_PER_CALL: POPUP_MAX_BATCHES_PER_CALL,
      SERVER_PICKER_MAX: SERVER_PICKER_MAX,
      SERVER_PICKER_ITEM_MAX: SERVER_PICKER_ITEM_MAX
    },
    // Test only
    _clock: clock,
    _setNow: function (fn) { clock.now = typeof fn === 'function' ? fn : function () { return Date.now(); }; },
    _resetDebounce: function () { lastAPICallTimestamp = 0; },
    _takePopupBatch: takePopupBatch,
    _stopInterval: function () { if (intervalTimer) { clearInterval(intervalTimer); intervalTimer = null; } }
  };
})();
