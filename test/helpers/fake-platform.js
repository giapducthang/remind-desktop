// fake-platform.js - test environment for scheduler.js / api.js (node:test + vm).
// Builds a vm context with a fake `window.Platform` (in-memory storage, popup.show recording every
// payload, popup.onEvent, onTick, openExternal, playSound) plus a fake clock/timers to control time.
// Usage: const env = createEnv({ now }); env.loadScheduler(); env.loadApi(); ...

'use strict';

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const nodeCrypto = require('node:crypto');

const SRC_DIR = path.resolve(__dirname, '..', '..', 'src', 'js');

function clone(v) {
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v));
}

/** Fake timers: setTimeout/setInterval run off the fake clock (env.advance). */
function createFakeTimers(clockRef) {
  let seq = 0;
  const pending = new Map(); // id -> { at, fn, interval }
  function schedule(fn, ms, interval) {
    const id = ++seq;
    const delay = Math.max(0, Number(ms) || 0);
    pending.set(id, { at: clockRef.now + delay, fn, interval: interval ? delay : 0 });
    return id;
  }
  return {
    setTimeout: (fn, ms) => schedule(fn, ms, false),
    setInterval: (fn, ms) => schedule(fn, ms, true),
    clearTimeout: (id) => { pending.delete(id); },
    clearInterval: (id) => { pending.delete(id); },
    /** The earliest pending timer (or null). */
    next() {
      let best = null;
      for (const [id, t] of pending) {
        if (!best || t.at < best.t.at || (t.at === best.t.at && id < best.id)) best = { id, t };
      }
      return best;
    },
    count() { return pending.size; },
    delete(id) { pending.delete(id); },
    reschedule(id, at) { const t = pending.get(id); if (t) t.at = at; }
  };
}

function createEnv(opts = {}) {
  const clockRef = { now: typeof opts.now === 'number' ? opts.now : Date.now() };
  const timers = createFakeTimers(clockRef);

  // ---- storage ----
  const store = new Map();
  const changedListeners = new Set();
  function normalizeKeys(keys) {
    if (keys === null || keys === undefined) return null;
    if (typeof keys === 'string') return [keys];
    if (Array.isArray(keys)) return keys;
    if (typeof keys === 'object') return Object.keys(keys);
    return [];
  }
  const storage = {
    async get(keys) {
      const list = normalizeKeys(keys);
      const out = {};
      if (list === null) { store.forEach((v, k) => { out[k] = clone(v); }); return out; }
      const defaults = keys && typeof keys === 'object' && !Array.isArray(keys) ? keys : null;
      for (const k of list) {
        if (store.has(k)) out[k] = clone(store.get(k));
        else if (defaults && defaults[k] !== undefined) out[k] = clone(defaults[k]);
      }
      return out;
    },
    async set(obj) {
      const changes = {};
      for (const k of Object.keys(obj)) {
        changes[k] = { oldValue: store.has(k) ? clone(store.get(k)) : undefined, newValue: clone(obj[k]) };
        store.set(k, clone(obj[k]));
      }
      changedListeners.forEach((cb) => { try { cb(changes); } catch (e) { console.error(e); } });
    },
    async remove(keys) {
      const changes = {};
      for (const k of normalizeKeys(keys) || []) {
        if (!store.has(k)) continue;
        changes[k] = { oldValue: clone(store.get(k)), newValue: undefined };
        store.delete(k);
      }
      if (Object.keys(changes).length) changedListeners.forEach((cb) => { try { cb(changes); } catch (e) { console.error(e); } });
    },
    onChanged(cb) { changedListeners.add(cb); return () => changedListeners.delete(cb); }
  };

  // ---- popup / tick / misc ----
  const popupShown = [];
  const popupHides = [];
  const popupListeners = new Set();
  const tickListeners = new Set();
  const opened = [];
  const sounds = [];
  let popupShowResult = true;

  const Platform = {
    isTauri: false,
    windowLabel: 'main',
    os: opts.os || 'windows',
    arch: 'x86_64',
    version: opts.version || '1.0.0',
    launchMinimized: false,
    apiBase: 'https://remind.asia',
    ready: Promise.resolve(true),
    cmpVersion: () => 0,
    storage,
    popup: {
      async show(payload) { popupShown.push(clone(payload)); return popupShowResult; },
      async hide() { popupHides.push(clockRef.now); },
      onEvent(cb) { popupListeners.add(cb); return () => popupListeners.delete(cb); }
    },
    onTick(cb) { tickListeners.add(cb); return () => tickListeners.delete(cb); },
    onShowMainRequested() { return () => {}; },
    async openExternal(url) {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
      opened.push(url);
      return true;
    },
    window: { async showMain() {}, async hideMain() {}, async quit() {} },
    playSound(v) { sounds.push(v); },
    autostart: { supported: false, async isEnabled() { return false; }, async enable() {}, async disable() {} },
    updater: { supported: false, async check() { return { available: false }; } }
  };

  const sandbox = {
    console,
    URL,
    AbortController,
    TextEncoder,
    TextDecoder,
    crypto: { randomUUID: () => nodeCrypto.randomUUID() },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    Platform,
    fetch: undefined
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);

  function load(file) {
    const p = path.join(SRC_DIR, file);
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: p });
  }

  /** Wait for microtasks plus a few real macrotask rounds (unrelated to the fake timers). */
  async function settle(rounds = 8) {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
  }

  const env = {
    ctx,
    sandbox,
    Platform,
    storage,
    store,
    timers,
    popupShown,
    popupHides,
    opened,
    sounds,
    settle,
    load,
    get now() { return clockRef.now; },
    setPopupShowResult(v) { popupShowResult = v; },
    loadScheduler() {
      load('scheduler.js');
      ctx.Scheduler._clock.now = () => clockRef.now;
      return ctx.Scheduler;
    },
    loadApi() {
      load('api.js');
      ctx.VersionApi._clock.now = () => clockRef.now;
      return ctx.VersionApi;
    },
    /** Write straight into storage (without firing onChanged). */
    seed(obj) { for (const k of Object.keys(obj)) store.set(k, clone(obj[k])); },
    get(key) { return store.has(key) ? clone(store.get(key)) : undefined; },
    /** Set the fake clock (without running any timer). */
    setNow(ts) { clockRef.now = ts; },
    /** Advance the clock by ms, run every due timer in order, and let promises settle after each one. */
    async advance(ms) {
      const target = clockRef.now + ms;
      for (;;) {
        const nxt = timers.next();
        if (!nxt || nxt.t.at > target) break;
        clockRef.now = Math.max(clockRef.now, nxt.t.at);
        if (nxt.t.interval) timers.reschedule(nxt.id, nxt.t.at + nxt.t.interval);
        else timers.delete(nxt.id);
        try { nxt.t.fn(); } catch (e) { console.error(e); }
        await settle();
      }
      clockRef.now = target;
      await settle();
    },
    /** Emit an event from the popup (as the popup window would send it). */
    async emitPopupEvent(evt) {
      popupListeners.forEach((cb) => { try { cb(evt); } catch (e) { console.error(e); } });
      await settle();
    },
    /** Simulate Rust emitting scheduler:tick. */
    async tick() {
      tickListeners.forEach((cb) => { try { cb({ at: clockRef.now }); } catch (e) { console.error(e); } });
      await settle();
    },
    /** Install a fake fetch: fn(url, init) -> Response-like { ok, status, json() }. Records every request. */
    mockFetch(handler) {
      const calls = [];
      sandbox.fetch = async (url, init) => {
        const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null;
        calls.push({ url, init, body });
        const res = await handler({ url, init, body, index: calls.length - 1 });
        if (res instanceof Error) throw res;
        const status = typeof res.status === 'number' ? res.status : 200;
        return {
          ok: status >= 200 && status < 300,
          status,
          async json() { if (res.json instanceof Error) throw res.json; return clone(res.json === undefined ? {} : res.json); }
        };
      };
      return calls;
    }
  };
  return env;
}

/** Build a local Date (the same way the app reads the machine clock). */
function localDate(y, m, d, h = 0, mi = 0, s = 0) {
  return new Date(y, m - 1, d, h, mi, s, 0).getTime();
}

function hhmm(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function ymd(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

module.exports = { createEnv, localDate, hhmm, ymd, clone };
