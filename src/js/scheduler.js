// scheduler.js - the scheduler of the Reminder desktop app (window.Scheduler).
// Ports the alarm + notification queue logic of the browser extension's background worker to a "tick" model (no chrome.alarms):
//   - Platform.onTick every 30s + one setTimeout to the nearest due moment (1s..60s) for better accuracy.
//   - Scheduling state lives in the key `schedulerState { intervalNext, fired }` (debounced 500ms).
//   - Reminder: interval | scheduled/dateRange (scheduledTimes[{date,time}], 2 minute grace) | legacy daily times[].
//   - Picker (local + server via getEffectivePickers()): daily times[], weekday filter when it fires, avoids lastPickedId.
//   - Queue: 15s apart, at most 5 entries, only 1 entry per picker. A preview shows AT ONCE (it skips the queue).
//   - App-wide off/snooze: notificationsMuted() = settings.enabled === false || settings.snoozeUntil > now (DESKTOP-SPEC §20).
//   - Popup position: settings.popupPosition (5 values, unknown -> bottom-right) rides along with EVERY popup payload (DESKTOP-SPEC §22).
//   - Food & drinks tab per country: key `pickersAvailable` (missing = true); false -> getEffectivePickers() is empty,
//     no picker moment is evaluated or queued, previewPicker() returns false. Reminders are NOT affected (DESKTOP-SPEC §21).
// Contract: DESKTOP-SPEC §4, §5. Talks to the OS only through window.Platform.
// This file does NOT touch the DOM.

(function () {
  'use strict';

  // Chrome/WebView2 ships a global 'Scheduler' (Prioritized Task Scheduling API) - only bail out if this module installed it.
  if (window.Scheduler && typeof window.Scheduler.init === 'function' && window.Scheduler.__reminderDesktop) return;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const NOTIFICATION_STAGGER_MS = 15000;      // minimum gap between 2 consecutive popups
  const NOTIFICATION_QUEUE_MAX = 5;           // queue cap (drops the oldest entry)
  const SCHEDULED_GRACE_MS = 2 * 60 * 1000;   // a fixed moment over 2 minutes late that never fired -> silently skipped
  const FIRED_TTL_MS = 2 * 24 * 60 * 60 * 1000; // prune fired keys older than 2 days
  const STATE_SAVE_DEBOUNCE_MS = 500;
  const TIMER_MIN_MS = 1000;
  const TIMER_MAX_MS = 60 * 1000;
  const PICKER_MAX = 20;                      // matches config-sanitizer.js
  const PICKER_TIME_MAX = 10;
  const SCHEDULED_TIMES_MAX = 500;
  const LEGACY_TIMES_MAX = 50;
  const SERVER_PICKER_ITEM_MAX = 200;
  const SERVER_PICKER_TIME_MAX = 10;
  const SERVER_PICKER_PRICE_MAX = 100000000;
  const POPUP_STATS_MAX_SLOTS = 4000;
  const MAPS_QUERY_MAX = 200;
  const SNOOZE_MAX_MS = 7 * 24 * 60 * 60 * 1000; // snooze cap (DESKTOP-SPEC §20.1)
  // Popup position chosen by the user (DESKTOP-SPEC §22.1)
  const POPUP_POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center'];
  const POPUP_POSITION_DEFAULT = 'bottom-right';
  const UPCOMING_DEFAULT = 10;
  const UPCOMING_MAX = 100;

  const PICKER_TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  const HHMM_PREFIX_RE = /^(\d{1,2}):(\d{2})/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const SERVER_PICKER_ID_RE = /^srv-[0-9]{1,19}$/;
  const DATA_IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

  // Clock that tests can swap out (Scheduler._clock.now = ...). Production: Date.now.
  const clock = { now: function () { return Date.now(); } };
  function now() { return clock.now(); }

  function P() { return window.Platform; }
  function sget(keys) { return P().storage.get(keys); }
  function sset(obj) { return P().storage.set(obj); }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function isServerPickerId(id) { return typeof id === 'string' && SERVER_PICKER_ID_RE.test(id); }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  // ---------------------------------------------------------------------------
  // App-wide notification off / snooze (DESKTOP-SPEC §20)
  // ---------------------------------------------------------------------------
  /** Valid settings.snoozeUntil: an integer from 0 to now+7 days. Wrong type / negative / too far ahead -> 0. */
  function readSnoozeUntil(settings, nowTs) {
    const v = obj(settings).snoozeUntil;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 0;
    const base = Number.isFinite(nowTs) ? nowTs : now();
    if (v > base + SNOOZE_MAX_MS) return 0;
    return Math.floor(v);
  }

  /** Are automatic popups blocked? = master toggle off OR inside a snooze window. */
  function isMuted(settings, nowTs) {
    const base = Number.isFinite(nowTs) ? nowTs : now();
    if (obj(settings).enabled === false) return true;
    return readSnoozeUntil(settings, base) > base;
  }

  /**
   * The snooze has expired (or the value is bogus) -> remove it from settings, writing EXACTLY ONCE.
   * Returns the new settings if anything was written, null if nothing was touched.
   */
  async function clearExpiredSnooze(settings, nowTs) {
    const raw = obj(settings).snoozeUntil;
    if (raw === undefined || raw === null || raw === 0) return null;
    if (readSnoozeUntil(settings, nowTs) > nowTs) return null;
    try {
      const latest = obj((await sget(['settings'])).settings);
      const cur = latest.snoozeUntil;
      if (cur === undefined || cur === null || cur === 0) return null;
      if (readSnoozeUntil(latest, nowTs) > nowTs) return null;
      const next = Object.assign({}, latest, { snoozeUntil: 0 });
      await sset({ settings: next });
      return next;
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Popup position (DESKTOP-SPEC §22)
  // ---------------------------------------------------------------------------
  /** settings.popupPosition -> one of the 5 valid values. Wrong type / unknown value / missing -> 'bottom-right'. */
  function readPopupPosition(settings) {
    const v = obj(settings).popupPosition;
    return typeof v === 'string' && POPUP_POSITIONS.indexOf(v) !== -1 ? v : POPUP_POSITION_DEFAULT;
  }

  // ---------------------------------------------------------------------------
  // The Food & drinks tab is only available in some countries (DESKTOP-SPEC §21)
  // ---------------------------------------------------------------------------
  /** The value the server returned last. Missing key / API never called = true (open by default). */
  function readPickersAvailable(value) { return value !== false; }

  /** Promise<boolean> - when false every picker path stops. */
  async function pickersAvailable() {
    try {
      const store = await sget(['pickersAvailable']);
      return readPickersAvailable(store.pickersAvailable);
    } catch (e) {
      return true;
    }
  }

  /** { enabled, snoozeUntil (0 once expired), muted, pickersAvailable } - the UI uses it to redraw. */
  async function getMuteState() {
    const nowTs = now();
    let settings = {};
    let pickersOk = true;
    try {
      const store = await sget(['settings', 'pickersAvailable']);
      settings = obj(store.settings);
      pickersOk = readPickersAvailable(store.pickersAvailable);
    } catch (e) { settings = {}; pickersOk = true; }
    const until = readSnoozeUntil(settings, nowTs);
    return {
      enabled: settings.enabled !== false,
      snoozeUntil: until > nowTs ? until : 0,
      muted: isMuted(settings, nowTs),
      pickersAvailable: pickersOk
    };
  }

  /** Promise<boolean> - used everywhere that decides whether an automatic popup may fire. */
  async function notificationsMuted() {
    return (await getMuteState()).muted;
  }

  /** Popup image: https or data:image base64 only (DESKTOP-SPEC §5). */
  function safeImageUrl(v) {
    if (typeof v !== 'string' || !v) return '';
    if (/^data:/i.test(v)) return v.length <= 300000 && DATA_IMAGE_RE.test(v) ? v : '';
    if (v.length > 2000) return '';
    try { return new URL(v).protocol === 'https:' ? v : ''; } catch (e) { return ''; }
  }

  /** "YYYY-MM-DD" in local time. */
  function localDateKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** "HH:mm" (also accepts "HH:mm:ss") -> [h, m] or null. */
  function parseHHMM(t) {
    if (typeof t !== 'string') return null;
    const m = HHMM_PREFIX_RE.exec(t);
    if (!m) return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (!(h >= 0 && h <= 23 && mi >= 0 && mi <= 59)) return null;
    return [h, mi];
  }

  /** Absolute moment of "HH:mm" on the day holding baseTs, shifted by offsetDays days. NaN if invalid. */
  function dailyTs(hhmm, baseTs, offsetDays) {
    const hm = parseHHMM(hhmm);
    if (!hm) return NaN;
    const d = new Date(baseTs);
    d.setDate(d.getDate() + (offsetDays || 0));
    d.setHours(hm[0], hm[1], 0, 0);
    return d.getTime();
  }

  /** Next moment (> baseTs) of "HH:mm": today if it has not passed, otherwise tomorrow. */
  function nextDailyTs(hhmm, baseTs) {
    const today = dailyTs(hhmm, baseTs, 0);
    if (!Number.isFinite(today)) return NaN;
    return today > baseTs ? today : dailyTs(hhmm, baseTs, 1);
  }

  /** {date:'YYYY-MM-DD', time:'HH:mm'} -> epoch ms in local time, NaN if invalid. */
  function parseScheduledTs(st) {
    if (!st || typeof st !== 'object') return NaN;
    if (typeof st.date !== 'string' || !DATE_RE.test(st.date)) return NaN;
    const hm = parseHHMM(st.time);
    if (!hm) return NaN;
    const p = st.date.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2], hm[0], hm[1], 0, 0);
    // Reject dates that do not exist (e.g. JS rolls 2026-02-31 over into the next month)
    if (d.getMonth() !== p[1] - 1 || d.getDate() !== p[2]) return NaN;
    return d.getTime();
  }

  // ---------------------------------------------------------------------------
  // Scheduling state: schedulerState { intervalNext: {[id]: ts}, fired: {[key]: ts} }
  // ---------------------------------------------------------------------------
  let state = { intervalNext: {}, fired: {} };
  let stateLoaded = false;
  let stateDirty = false;
  let stateSaveTimer = null;

  function cleanTsMap(m) {
    const out = {};
    if (!m || typeof m !== 'object' || Array.isArray(m)) return out;
    for (const k of Object.keys(m)) {
      const v = Number(m[k]);
      if (Number.isFinite(v) && v > 0) out[k] = v;
    }
    return out;
  }

  async function loadState() {
    try {
      const store = await sget(['schedulerState']);
      const s = obj(store.schedulerState);
      state = { intervalNext: cleanTsMap(s.intervalNext), fired: cleanTsMap(s.fired) };
    } catch (e) {
      state = { intervalNext: {}, fired: {} };
    }
    stateLoaded = true;
  }

  function markDirty() {
    stateDirty = true;
    if (stateSaveTimer) return;
    stateSaveTimer = setTimeout(function () {
      stateSaveTimer = null;
      saveState();
    }, STATE_SAVE_DEBOUNCE_MS);
  }

  async function saveState() {
    if (stateSaveTimer) { clearTimeout(stateSaveTimer); stateSaveTimer = null; }
    if (!stateDirty) return;
    stateDirty = false;
    try {
      await sset({ schedulerState: { intervalNext: Object.assign({}, state.intervalNext), fired: Object.assign({}, state.fired) } });
    } catch (e) {
      stateDirty = true; // retry on the next write
    }
  }

  function pruneFired(nowTs) {
    const cutoff = nowTs - FIRED_TTL_MS;
    for (const k of Object.keys(state.fired)) {
      if (state.fired[k] < cutoff) { delete state.fired[k]; markDirty(); }
    }
  }

  /**
   * Evaluate one fixed moment (scheduled/legacy/picker) at time nowTs.
   * Returns: 'future' (not due), 'fire' (due, within grace, not fired yet), 'skip' (fired / past grace / invalid).
   * A moment past grace that never fired is marked as fired so popups do not pile up after the machine sleeps.
   */
  function evalOccurrence(key, ts, nowTs) {
    if (!Number.isFinite(ts)) return 'skip';
    if (ts > nowTs) return 'future';
    if (state.fired[key]) return 'skip';
    if (ts <= nowTs - FIRED_TTL_MS) return 'skip'; // too old to mark (it would be pruned right away)
    state.fired[key] = nowTs;
    markDirty();
    return ts > nowTs - SCHEDULED_GRACE_MS ? 'fire' : 'skip';
  }

  // ---------------------------------------------------------------------------
  // Notification queue (port of the extension's NOTIFICATION QUEUE)
  // ---------------------------------------------------------------------------
  const queue = [];
  let processing = false;
  let processingPromise = null;
  let lastNotifAt = 0;

  function pushEntry(entry) {
    queue.push(entry);
    while (queue.length > NOTIFICATION_QUEUE_MAX) queue.shift();
  }

  function flushQueue() { queue.length = 0; }

  function enqueueReminder(reminder) {
    pushEntry({ kind: 'reminder', reminder: reminder });
    return processQueue();
  }

  function enqueuePicker(picker, item) {
    const pickerId = picker && picker.id;
    if (pickerId) {
      const at = queue.findIndex(function (e) { return e && e.kind === 'picker' && e.picker && e.picker.id === pickerId; });
      if (at >= 0) queue.splice(at, 1);
    }
    pushEntry({ kind: 'picker', picker: picker, item: item });
    return processQueue();
  }

  function processQueue() {
    if (processing) return processingPromise;
    processing = true;
    processingPromise = (async function () {
      try {
        while (queue.length > 0) {
          const wait = Math.max(0, lastNotifAt + NOTIFICATION_STAGGER_MS - now());
          if (wait > 0) await sleep(wait);
          if (queue.length === 0) break; // flushed while waiting (master toggle went off)
          const entry = queue.shift();
          // The user may have turned reminders off during the stagger wait -> check again
          try {
            const store = await sget(['settings']);
            if (isMuted(store.settings, now())) { flushQueue(); break; }
          } catch (e) { /* ignore */ }
          lastNotifAt = now();
          try {
            if (entry.kind === 'picker') await showPicker(entry.picker, entry.item);
            else await showReminder(entry.reminder);
          } catch (e) { /* a failing popup must not stall the queue */ }
        }
      } finally {
        processing = false;
      }
    })();
    return processingPromise;
  }

  // ---------------------------------------------------------------------------
  // Payload sent to the popup (DESKTOP-SPEC §5)
  // ---------------------------------------------------------------------------
  let payloadSeq = 0;
  function nextPayloadId() {
    payloadSeq += 1;
    return 'p-' + now() + '-' + payloadSeq;
  }

  async function getVersionFields() {
    const empty = { versionMessage: '', versionUrl: '', versionStatus: '', versionImage: '' };
    const api = window.VersionApi;
    if (!api || typeof api.getRandomMessage !== 'function') return empty;
    try {
      const m = await api.getRandomMessage();
      if (!m || typeof m !== 'object') return empty;
      return {
        versionMessage: str(m.message, 500),
        versionUrl: str(m.url, 2000),
        versionStatus: str(m.status, 500),
        versionImage: str(m.image, 2000)
      };
    } catch (e) {
      return empty;
    }
  }

  function pickLanguage(store) {
    const s = obj(store.settings);
    if (store.language === 'vi' || store.language === 'en') return store.language;
    if (s.language === 'vi' || s.language === 'en') return s.language;
    return 'en';
  }

  async function buildBasePayload(kind) {
    const store = await sget(['settings', 'language']);
    const s = obj(store.settings);
    const vol = Number(s.soundVolume);
    const base = {
      kind: kind,
      payloadId: nextPayloadId(),
      darkMode: !!s.darkMode,
      lowPerfMode: !!s.lowPerfMode,
      soundEnabled: s.soundEnabled !== false,
      soundVolume: Number.isFinite(vol) ? clamp(Math.round(vol), 0, 200) : 100,
      language: pickLanguage(store),
      // §22.2: the popup never reads storage, the position rides along with the payload (reminders, pickers, previews)
      popupPosition: readPopupPosition(s)
    };
    return Object.assign(base, await getVersionFields());
  }

  function toWireReminder(r) {
    const src = obj(r);
    const mins = Number(src.displayMinutes);
    return {
      id: str(src.id, 128),
      message: str(src.message, 1000),
      icon: str(src.icon, 16),
      color: str(src.color, 32),
      imageUrl: safeImageUrl(src.imageUrl),
      displayMinutes: Number.isFinite(mins) && mins > 0 ? Math.min(1440, mins) : 1
    };
  }

  function wirePrice(v) {
    return Number.isInteger(v) && v >= 0 && v <= SERVER_PICKER_PRICE_MAX ? v : 0;
  }

  /** Whitelist of item fields sent to the popup (picker spec §15/§20). A new field MUST be added here too. */
  function toWireItem(it) {
    const src = obj(it);
    return {
      id: str(src.id, 128),
      name: str(src.name, 60),
      emoji: str(src.emoji, 8),
      image: typeof src.image === 'string' ? src.image : '',
      imageCredit: str(src.imageCredit, 160),
      imageSource: str(src.imageSource, 2000),
      priceMin: wirePrice(src.priceMin),
      priceMax: wirePrice(src.priceMax)
    };
  }

  function validItems(items) {
    return (Array.isArray(items) ? items : []).filter(function (it) {
      return it && typeof it === 'object' && typeof it.name === 'string' && it.name !== '';
    });
  }

  async function showReminder(reminder) {
    const payload = await buildBasePayload('reminder');
    payload.reminder = toWireReminder(reminder);
    return P().popup.show(payload);
  }

  async function showPicker(picker, item) {
    if (!picker || !item) return false;
    const payload = await buildBasePayload('picker');
    const mins = Number(picker.displayMinutes);
    payload.picker = {
      id: str(picker.id, 128),
      name: str(picker.name, 80),
      icon: str(picker.icon, 8) || '🍽️',
      displayMinutes: Number.isFinite(mins) && mins > 0 ? Math.min(60, mins) : 1
    };
    payload.item = toWireItem(item);
    payload.items = validItems(picker.items).slice(0, SERVER_PICKER_ITEM_MAX).map(toWireItem);
    return P().popup.show(payload);
  }

  // ---------------------------------------------------------------------------
  // Picker: local + server (picker spec §11, §14)
  // ---------------------------------------------------------------------------
  /**
   * User preference for one server set. Old shape: true/false. New shape: { enabled, times }.
   * User-set `times` beat the server default times; empty/missing = use the server times.
   */
  function readServerPickerPref(value) {
    if (value === false) return { enabled: false, times: null };
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const times = Array.isArray(value.times)
        ? value.times.filter(function (t) { return typeof t === 'string' && PICKER_TIME_RE.test(t); }).slice(0, SERVER_PICKER_TIME_MAX)
        : null;
      return {
        enabled: value.enabled !== false,
        times: times && times.length ? Array.from(new Set(times)).sort() : null
      };
    }
    return { enabled: true, times: null };
  }

  /** Local pickers + server sets (with enabled/times/lastPickedId/fromServer applied) - used by EVERY schedule/pick function. */
  async function getEffectivePickers() {
    const store = await sget(['pickers', 'serverPickers', 'serverPickerPrefs', 'serverPickerState', 'pickersAvailable']);
    // §21: feature not enabled for this country -> no pickers at all, the user's data stays untouched in storage
    if (!readPickersAvailable(store.pickersAvailable)) return [];
    const local = (Array.isArray(store.pickers) ? store.pickers : [])
      .filter(function (p) { return p && typeof p === 'object' && !Array.isArray(p); })
      .slice(0, PICKER_MAX);
    const prefs = obj(store.serverPickerPrefs);
    const st = obj(store.serverPickerState);
    const server = (Array.isArray(store.serverPickers) ? store.serverPickers : [])
      .filter(function (p) { return p && typeof p === 'object' && isServerPickerId(p.id); })
      .map(function (p) {
        const pref = readServerPickerPref(prefs[p.id]);
        return Object.assign({}, p, {
          enabled: pref.enabled,
          times: pref.times || p.times,
          customTimes: !!pref.times,
          lastPickedId: typeof st[p.id] === 'string' ? st[p.id] : '',
          fromServer: true
        });
      });
    return local.concat(server);
  }

  /** Signature of the schedule-relevant parts (id/enabled/times/has items) so a lastPickedId-only change is ignored. */
  function pickerScheduleSignature(list) {
    if (!Array.isArray(list)) return '';
    return list.map(function (p) {
      if (!p || typeof p !== 'object') return '';
      const times = Array.isArray(p.times) ? p.times.join(',') : '';
      const weekdays = Array.isArray(p.weekdays) ? p.weekdays.join(',') : '';
      const hasItems = Array.isArray(p.items) && p.items.length > 0 ? 1 : 0;
      return [p.id, p.enabled === false ? 0 : 1, times, weekdays, hasItems].join('|');
    }).join(';');
  }

  /** Pick 1 random item; with >= 2 valid items it will NOT repeat lastPickedId. Pure function. */
  function choosePickerItem(items, lastPickedId) {
    const valid = validItems(items);
    if (valid.length === 0) return null;
    let pool = valid;
    if (valid.length >= 2 && lastPickedId) {
      const others = valid.filter(function (it) { return it.id !== lastPickedId; });
      if (others.length > 0) pool = others;
    }
    return pool[Math.floor(Math.random() * pool.length)] || null;
  }

  /** Persist lastPickedId: server set -> serverPickerState[id]; local set -> pickers[].lastPickedId. */
  async function persistLastPickedId(pickerId, itemId) {
    try {
      if (!pickerId || !itemId) return;
      if (isServerPickerId(pickerId)) {
        const store = await sget(['serverPickerState']);
        const st = obj(store.serverPickerState);
        if (st[pickerId] === itemId) return;
        st[pickerId] = itemId;
        await sset({ serverPickerState: st });
        return;
      }
      const store = await sget(['pickers']);
      const pickers = store.pickers;
      if (!Array.isArray(pickers)) return;
      let changed = false;
      for (const p of pickers) {
        if (p && typeof p === 'object' && p.id === pickerId && p.lastPickedId !== itemId) {
          p.lastPickedId = itemId;
          changed = true;
        }
      }
      if (changed) await sset({ pickers: pickers });
    } catch (e) { /* ignore */ }
  }

  /** The popup reports the spin result -> persist lastPickedId. Ignored if the ids do not match the stored data. */
  async function recordPickerPicked(pickerId, itemId) {
    try {
      if (typeof pickerId !== 'string' || typeof itemId !== 'string') return false;
      if (!pickerId || !itemId) return false;
      const pickers = await getEffectivePickers();
      const picker = pickers.find(function (p) { return p && p.id === pickerId; });
      if (!picker) return false;
      const items = Array.isArray(picker.items) ? picker.items : [];
      if (!items.some(function (it) { return it && typeof it === 'object' && it.id === itemId; })) return false;
      await persistLastPickedId(pickerId, itemId);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Pick an item + persist lastPickedId + enqueue it (15s stagger, same as a reminder). */
  async function triggerPicker(picker) {
    const item = choosePickerItem(picker && picker.items, picker && picker.lastPickedId);
    if (!item) return false;
    await persistLastPickedId(picker.id, item.id);
    enqueuePicker(picker, item);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Tick: evaluate everything due at nowTs (sequential, never overlapping)
  // ---------------------------------------------------------------------------
  let started = false;
  let dueTimer = null;
  let tickChain = Promise.resolve();

  function tick(nowTs) {
    const run = function () {
      const at = typeof nowTs === 'number' && Number.isFinite(nowTs) ? nowTs : now();
      return runTick(at).catch(function () { /* one error must not break the tick chain */ });
    };
    tickChain = tickChain.then(run, run);
    return tickChain;
  }

  function armTimer(nowTs, nextDue) {
    if (dueTimer) { clearTimeout(dueTimer); dueTimer = null; }
    if (!started) return;
    let delay = Number.isFinite(nextDue) ? nextDue - nowTs : TIMER_MAX_MS;
    delay = clamp(delay, TIMER_MIN_MS, TIMER_MAX_MS);
    dueTimer = setTimeout(function () {
      dueTimer = null;
      tick();
    }, delay);
  }

  async function runTick(nowTs) {
    if (!stateLoaded) await loadState();
    const store = await sget(['reminders', 'settings']);
    let settings = obj(store.settings);
    let nextDue = Infinity;

    // Snooze expired -> clear the field and carry on as usual (no window has to be open)
    const cleared = await clearExpiredSnooze(settings, nowTs);
    if (cleared) settings = cleared;

    if (isMuted(settings, nowTs)) {
      // Off / snoozed: fire nothing, flush the queue; intervals restart from scratch when switched on (like the extension recreating alarms)
      flushQueue();
      if (Object.keys(state.intervalNext).length) { state.intervalNext = {}; markDirty(); }
      pruneFired(nowTs);
      const until = readSnoozeUntil(settings, nowTs);
      armTimer(nowTs, until > nowTs ? until : Infinity);
      return;
    }

    // ---- Reminders ----
    const reminders = Array.isArray(store.reminders) ? store.reminders : [];
    const seenInterval = new Set();
    for (const r of reminders) {
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) continue;
      if (r.enabled === false) continue;
      const type = typeof r.type === 'string' ? r.type : 'interval';

      if (type === 'interval') {
        const mins = Number(r.interval);
        if (!Number.isFinite(mins) || mins <= 0) continue;
        const span = mins * 60 * 1000;
        seenInterval.add(r.id);
        let next = state.intervalNext[r.id];
        // Missing, or the interval was just shortened -> restart it from now
        if (!Number.isFinite(next) || next > nowTs + span) {
          next = nowTs + span;
          state.intervalNext[r.id] = next;
          markDirty();
        }
        if (nowTs >= next) {
          // However late it is (machine asleep), fire once and then reschedule
          enqueueReminder(r);
          next = nowTs + span;
          state.intervalNext[r.id] = next;
          markDirty();
        }
        nextDue = Math.min(nextDue, next);
        continue;
      }

      if (type !== 'scheduled' && type !== 'dateRange') continue;
      let fire = false;
      const sts = Array.isArray(r.scheduledTimes) ? r.scheduledTimes.slice(0, SCHEDULED_TIMES_MAX) : [];
      if (sts.length > 0) {
        for (const st of sts) {
          const ts = parseScheduledTs(st);
          if (!Number.isFinite(ts)) continue;
          const key = r.id + '|' + st.date + ' ' + st.time.slice(0, 5);
          const res = evalOccurrence(key, ts, nowTs);
          if (res === 'future') nextDue = Math.min(nextDue, ts);
          else if (res === 'fire') fire = true;
        }
      } else if (Array.isArray(r.times)) {
        // Legacy: daily "HH:mm" times - check yesterday/today (grace across midnight) + tomorrow (the next moment)
        for (const t of r.times.slice(0, LEGACY_TIMES_MAX)) {
          if (!parseHHMM(t)) continue;
          for (let off = -1; off <= 1; off++) {
            const ts = dailyTs(t, nowTs, off);
            const key = r.id + '|' + localDateKey(new Date(ts)) + '|' + t.slice(0, 5);
            const res = evalOccurrence(key, ts, nowTs);
            if (res === 'future') nextDue = Math.min(nextDue, ts);
            else if (res === 'fire') fire = true;
          }
        }
      }
      if (fire) enqueueReminder(r); // several moments at once -> a single popup
    }
    // Interval reminder deleted/disabled -> drop its next moment so it restarts from scratch when re-enabled
    for (const id of Object.keys(state.intervalNext)) {
      if (!seenInterval.has(id)) { delete state.intervalNext[id]; markDirty(); }
    }

    // ---- Pickers (local + server) ----
    const pickers = await getEffectivePickers();
    for (const p of pickers) {
      if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id) continue;
      if (p.enabled === false) continue;
      if (validItems(p.items).length === 0) continue;
      const times = Array.isArray(p.times) ? p.times.slice(0, PICKER_TIME_MAX) : [];
      const weekdays = Array.isArray(p.weekdays) ? p.weekdays.filter(Number.isInteger) : [];
      let fire = false;
      for (const t of times) {
        if (typeof t !== 'string' || !PICKER_TIME_RE.test(t)) continue;
        for (let off = -1; off <= 1; off++) {
          const ts = dailyTs(t, nowTs, off);
          const d = new Date(ts);
          const key = 'picker|' + p.id + '|' + localDateKey(d) + '|' + t;
          const res = evalOccurrence(key, ts, nowTs);
          if (res === 'future') nextDue = Math.min(nextDue, ts);
          else if (res === 'fire' && (weekdays.length === 0 || weekdays.includes(d.getDay()))) fire = true;
        }
      }
      if (fire) await triggerPicker(p);
    }

    pruneFired(nowTs);
    armTimer(nowTs, nextDue);
  }

  // ---------------------------------------------------------------------------
  // Events coming from the popup (DESKTOP-SPEC §4)
  // ---------------------------------------------------------------------------
  // Simple mutex for popupStats/popupToday (api.js shares it through Scheduler._popupStatsLock)
  let popupStatsQueue = Promise.resolve();
  function withPopupStatsLock(fn) {
    const run = popupStatsQueue.then(fn, fn);
    popupStatsQueue = run.then(function () {}, function () {});
    return run;
  }

  /** 5 minute slot "HH:mm dd/mm/yyyy" (matches the extension). */
  function getTimeSlot(date) {
    const d = date instanceof Date ? date : new Date(now());
    const rounded = Math.floor(d.getMinutes() / 5) * 5;
    return pad2(d.getHours()) + ':' + pad2(rounded) + ' ' + pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function parseSlotTime(s) {
    if (typeof s !== 'string') return NaN;
    const m = s.match(/^(\d{1,2}):(\d{2}) (\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return NaN;
    return new Date(Number(m[5]), Number(m[4]) - 1, Number(m[3]), Number(m[1]), Number(m[2])).getTime();
  }

  /** Record one popup that was just shown: bump its 5 minute slot in popupStats (to send to the server) + popupToday. */
  function trackPopupDisplayed() {
    return withPopupStatsLock(async function () {
      try {
        const d = new Date(now());
        const slot = getTimeSlot(d);
        const todayKey = slot.split(' ')[1];
        const store = await sget(['popupStats', 'popupToday']);
        const popupStats = obj(store.popupStats);
        popupStats[slot] = (Number(popupStats[slot]) || 0) + 1;
        const keys = Object.keys(popupStats);
        if (keys.length > POPUP_STATS_MAX_SLOTS) {
          keys.sort(function (a, b) { return (parseSlotTime(a) || 0) - (parseSlotTime(b) || 0); });
          for (const k of keys.slice(0, keys.length - POPUP_STATS_MAX_SLOTS)) delete popupStats[k];
        }
        const prev = obj(store.popupToday);
        const popupToday = prev.date === todayKey
          ? { date: todayKey, count: (Number(prev.count) || 0) + 1 }
          : { date: todayKey, count: 1 };
        await sset({ popupStats: popupStats, popupToday: popupToday });
      } catch (e) { /* ignore */ }
    });
  }

  /** Find places on Google Maps: accepts ONLY the item name (<= 200 chars), the URL is built right here. */
  async function openMapsSearch(query) {
    try {
      if (typeof query !== 'string') return false;
      const q = query.trim();
      if (!q || q.length > MAPS_QUERY_MAX) return false;
      const url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
      return !!(await P().openExternal(url));
    } catch (e) {
      return false;
    }
  }

  async function handlePopupEvent(evt) {
    if (!evt || typeof evt !== 'object' || typeof evt.type !== 'string') return false;
    switch (evt.type) {
      case 'POPUP_DISPLAYED':
        await trackPopupDisplayed();
        return true;
      case 'PICKER_PICKED':
        return recordPickerPicked(evt.pickerId, evt.itemId);
      case 'OPEN_MAPS':
        return openMapsSearch(evt.query);
      case 'POPUP_CLOSED':
        // The popup just closed -> let the next entry (if any) run on its stagger
        if (queue.length > 0) processQueue();
        return true;
      default:
        return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Storage changed (the UI saves, api.js writes serverPickers...) -> rebuild
  // ---------------------------------------------------------------------------
  function onStorageChanged(changes) {
    if (!changes || typeof changes !== 'object') return;
    let needRebuild = false;
    if (changes.settings) {
      const at = now();
      const before = !isMuted(changes.settings.oldValue, at);
      const after = !isMuted(changes.settings.newValue, at);
      if (before && !after) {
        // Just switched off / snoozed -> stop the queue at once + hide the popup on screen
        flushQueue();
        try { P().popup.hide(); } catch (e) { /* ignore */ }
      }
      needRebuild = true;
    }
    if (changes.reminders || changes.serverPickerPrefs) needRebuild = true;
    if (changes.pickersAvailable) {
      // Just disabled -> drop the queued picker entries (reminders stay)
      if (!readPickersAvailable(changes.pickersAvailable.newValue)) {
        for (let i = queue.length - 1; i >= 0; i--) if (queue[i] && queue[i].kind === 'picker') queue.splice(i, 1);
      }
      needRebuild = true;
    }
    for (const k of ['pickers', 'serverPickers']) {
      const c = changes[k];
      if (c && pickerScheduleSignature(c.oldValue) !== pickerScheduleSignature(c.newValue)) needRebuild = true;
    }
    if (needRebuild) tick();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  /**
   * At startup: an interval moment left overdue by the previous session -> wait until now + interval, do NOT fire
   * straight away. The app starts with the machine and a popup bursting out right then is annoying. "Fire once after
   * waking up" only applies inside a session that is already running.
   */
  async function resetOverdueIntervals(nowTs) {
    try {
      const store = await sget(['reminders']);
      const reminders = Array.isArray(store.reminders) ? store.reminders : [];
      for (const r of reminders) {
        if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) continue;
        if ((typeof r.type === 'string' ? r.type : 'interval') !== 'interval') continue;
        const mins = Number(r.interval);
        if (!Number.isFinite(mins) || mins <= 0) continue;
        const next = state.intervalNext[r.id];
        if (Number.isFinite(next) && next <= nowTs) {
          state.intervalNext[r.id] = nowTs + mins * 60 * 1000;
          markDirty();
        }
      }
    } catch (e) { /* ignore */ }
  }

  async function init() {
    if (started) return;
    started = true;
    await P().ready;
    await loadState();
    await resetOverdueIntervals(now());
    P().onTick(function () { tick(); });
    P().storage.onChanged(onStorageChanged);
    P().popup.onEvent(function (evt) { handlePopupEvent(evt); });
    await tick();
  }

  function rebuild() { return tick(); }

  /** Preview a reminder: shows AT ONCE, skips the queue, ignores the master toggle. Accepts a partial object. */
  async function previewReminder(reminderLike) {
    lastNotifAt = now();
    return showReminder(reminderLike);
  }

  /** Preview a picker (id or object): pick an item and show it AT ONCE. */
  async function previewPicker(pickerOrId) {
    // §21: show nothing while the feature is not enabled in this country
    if (!(await pickersAvailable())) return false;
    let picker = null;
    if (typeof pickerOrId === 'string') {
      const list = await getEffectivePickers();
      picker = list.find(function (p) { return p && p.id === pickerOrId; }) || null;
    } else if (pickerOrId && typeof pickerOrId === 'object') {
      picker = pickerOrId;
      // An object from the UI may lack lastPickedId -> read it from the stored data to avoid repeating a pick
      if (typeof picker.lastPickedId !== 'string' && typeof picker.id === 'string') {
        const list = await getEffectivePickers();
        const known = list.find(function (p) { return p && p.id === picker.id; });
        if (known && typeof known.lastPickedId === 'string') picker = Object.assign({}, picker, { lastPickedId: known.lastPickedId });
      }
    }
    if (!picker) return false;
    const item = choosePickerItem(picker.items, picker.lastPickedId);
    if (!item) return false;
    await persistLastPickedId(picker.id, item.id);
    lastNotifAt = now();
    await showPicker(picker, item);
    return true;
  }

  /** The next n events [{at, kind, id, title, icon}] in time order. Master toggle off -> []. */
  async function getUpcoming(n) {
    const limit = clamp(Number.isFinite(Number(n)) && Number(n) > 0 ? Math.floor(Number(n)) : UPCOMING_DEFAULT, 1, UPCOMING_MAX);
    const nowTs = now();
    if (!stateLoaded) await loadState();
    const store = await sget(['reminders', 'settings']);
    if (isMuted(store.settings, nowTs)) return [];
    const out = [];

    const reminders = Array.isArray(store.reminders) ? store.reminders : [];
    for (const r of reminders) {
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) continue;
      if (r.enabled === false) continue;
      const type = typeof r.type === 'string' ? r.type : 'interval';
      let at = Infinity;
      if (type === 'interval') {
        const mins = Number(r.interval);
        if (!Number.isFinite(mins) || mins <= 0) continue;
        const next = state.intervalNext[r.id];
        at = Number.isFinite(next) && next > nowTs ? next : nowTs + mins * 60 * 1000;
      } else if (type === 'scheduled' || type === 'dateRange') {
        const sts = Array.isArray(r.scheduledTimes) ? r.scheduledTimes.slice(0, SCHEDULED_TIMES_MAX) : [];
        if (sts.length > 0) {
          for (const st of sts) {
            const ts = parseScheduledTs(st);
            if (Number.isFinite(ts) && ts > nowTs && ts < at) at = ts;
          }
        } else if (Array.isArray(r.times)) {
          for (const t of r.times.slice(0, LEGACY_TIMES_MAX)) {
            const ts = nextDailyTs(t, nowTs);
            if (Number.isFinite(ts) && ts < at) at = ts;
          }
        }
      }
      if (!Number.isFinite(at)) continue;
      out.push({ at: at, kind: 'reminder', id: r.id, title: str(r.message, 200), icon: str(r.icon, 16) });
    }

    const pickers = await getEffectivePickers();
    for (const p of pickers) {
      if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id) continue;
      if (p.enabled === false || validItems(p.items).length === 0) continue;
      const weekdays = Array.isArray(p.weekdays) ? p.weekdays.filter(Number.isInteger) : [];
      const times = Array.isArray(p.times) ? p.times.slice(0, PICKER_TIME_MAX) : [];
      let at = Infinity;
      for (const t of times) {
        if (typeof t !== 'string' || !PICKER_TIME_RE.test(t)) continue;
        // Find the next moment within the coming 8 days that matches the weekday filter
        for (let off = 0; off <= 7; off++) {
          const ts = dailyTs(t, nowTs, off);
          if (!Number.isFinite(ts) || ts <= nowTs) continue;
          if (weekdays.length > 0 && !weekdays.includes(new Date(ts).getDay())) continue;
          if (ts < at) at = ts;
          break;
        }
      }
      if (!Number.isFinite(at)) continue;
      out.push({ at: at, kind: 'picker', id: p.id, title: str(p.name, 80), icon: str(p.icon, 8) || '🍽️' });
    }

    out.sort(function (a, b) { return a.at - b.at; });
    return out.slice(0, limit);
  }

  window.Scheduler = {
    __reminderDesktop: true,
    init: init,
    rebuild: rebuild,
    getUpcoming: getUpcoming,
    previewReminder: previewReminder,
    previewPicker: previewPicker,
    getEffectivePickers: getEffectivePickers,
    notificationsMuted: notificationsMuted,
    pickersAvailable: pickersAvailable,
    getMuteState: getMuteState,
    recordPickerPicked: recordPickerPicked,
    trackPopupDisplayed: trackPopupDisplayed,
    handlePopupEvent: handlePopupEvent,
    readServerPickerPref: readServerPickerPref,
    choosePickerItem: choosePickerItem,
    toWireItem: toWireItem,
    constants: {
      NOTIFICATION_STAGGER_MS: NOTIFICATION_STAGGER_MS,
      NOTIFICATION_QUEUE_MAX: NOTIFICATION_QUEUE_MAX,
      SCHEDULED_GRACE_MS: SCHEDULED_GRACE_MS,
      FIRED_TTL_MS: FIRED_TTL_MS,
      SERVER_PICKER_ITEM_MAX: SERVER_PICKER_ITEM_MAX,
      POPUP_STATS_MAX_SLOTS: POPUP_STATS_MAX_SLOTS,
      MAPS_QUERY_MAX: MAPS_QUERY_MAX,
      SNOOZE_MAX_MS: SNOOZE_MAX_MS
    },
    // popupStats mutex shared with api.js
    _popupStatsLock: withPopupStatsLock,
    // Test only
    _clock: clock,
    _setNow: function (fn) { clock.now = typeof fn === 'function' ? fn : function () { return Date.now(); }; },
    _tick: tick,
    _queue: queue,
    _flushState: saveState,
    _getState: function () { return state; },
    _getLastNotifAt: function () { return lastNotifAt; },
    _readSnoozeUntil: readSnoozeUntil
  };
})();
