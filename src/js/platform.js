// platform.js - platform abstraction layer for the Reminder desktop app.
// Runs in 2 environments:
//   1. Tauri (desktop Windows/macOS): uses window.__TAURI__ (withGlobalTauri = true, NO bundler needed).
//   2. Plain browser (web/dev): falls back to localStorage + a popup overlay inside the page.
// Every other module (scheduler, api, ui...) may ONLY talk to the OS through window.Platform.
// Full contract: DESKTOP-SPEC §3.

(function () {
  'use strict';

  if (window.Platform) return;

  const T = window.__TAURI__ || null;
  const isTauri = !!(T && T.core && typeof T.core.invoke === 'function');

  // Label of the current window (main | popup). Always 'main' in a browser.
  const WINDOW_LABEL = (function () {
    try {
      if (isTauri && T.window && typeof T.window.getCurrentWindow === 'function') {
        return T.window.getCurrentWindow().label || 'main';
      }
    } catch (_) { /* ignore */ }
    return 'main';
  })();

  const STORE_FILE = 'reminder-store.json';
  const LS_PREFIX = 'rmd:';
  const TICK_MS = 30 * 1000;

  // Fallback version when running in a browser (Tauri reads it from tauri.conf.json).
  const WEB_FALLBACK_VERSION = '1.0.0';

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------
  function clone(v) {
    if (v === undefined) return undefined;
    try { return JSON.parse(JSON.stringify(v)); } catch (_) { return v; }
  }

  function normalizeKeys(keys) {
    if (keys === null || keys === undefined) return null;
    if (typeof keys === 'string') return [keys];
    if (Array.isArray(keys)) return keys.filter((k) => typeof k === 'string');
    if (typeof keys === 'object') return Object.keys(keys);
    return [];
  }

  function makeEmitter() {
    const listeners = new Set();
    return {
      on(cb) {
        if (typeof cb !== 'function') return () => {};
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      emit(payload) {
        listeners.forEach((cb) => {
          try { cb(payload); } catch (e) { console.error('[Platform] listener error', e); }
        });
      },
      size() { return listeners.size; }
    };
  }

  function detectOs() {
    const ua = (navigator.userAgent || '').toLowerCase();
    const plat = (navigator.platform || '').toLowerCase();
    if (plat.startsWith('mac') || ua.includes('mac os')) return 'macos';
    if (plat.startsWith('win') || ua.includes('windows')) return 'windows';
    if (plat.includes('linux') || ua.includes('linux')) return 'linux';
    return 'web';
  }

  // ---------------------------------------------------------------------------
  // Storage: an in-memory copy + writes to the store (Tauri) or to localStorage (web).
  // Same semantics as chrome.storage.local: get(keys) -> object, set(obj), remove(keys).
  // ONLY the main window may write storage; the popup window gets everything through the payload.
  // ---------------------------------------------------------------------------
  const cache = new Map();
  const storageChanged = makeEmitter();
  let tauriStore = null;
  // true = the data store could not be read; every write is blocked so old data is not overwritten.
  let storageBroken = false;

  async function storageInit() {
    cache.clear();
    if (isTauri && WINDOW_LABEL === 'main' && T.store && typeof T.store.load === 'function') {
      // A failed read (corrupt file, disk error, permissions...) must NOT be treated as a fresh install:
      // seeding defaults over it would wipe the user's reminders/pickers. Mark it broken and block writes.
      try {
        tauriStore = await T.store.load(STORE_FILE, { autoSave: 200, defaults: {} });
        const entries = await tauriStore.entries();
        entries.forEach(([k, v]) => cache.set(k, v));
      } catch (e) {
        tauriStore = null;
        storageBroken = true;
        console.error('[Platform] cannot read the data store - writes are blocked so old data is not lost', e);
      }
      return;
    }
    if (!isTauri) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k || !k.startsWith(LS_PREFIX)) continue;
          try { cache.set(k.slice(LS_PREFIX.length), JSON.parse(localStorage.getItem(k))); } catch (_) { /* skip the corrupt value */ }
        }
      } catch (_) { /* localStorage may be blocked */ }
    }
  }

  async function storageGet(keys) {
    const list = normalizeKeys(keys);
    const out = {};
    if (list === null) {
      cache.forEach((v, k) => { out[k] = clone(v); });
      return out;
    }
    const defaults = (keys && typeof keys === 'object' && !Array.isArray(keys)) ? keys : null;
    list.forEach((k) => {
      if (cache.has(k)) out[k] = clone(cache.get(k));
      else if (defaults && defaults[k] !== undefined) out[k] = clone(defaults[k]);
    });
    return out;
  }

  async function storageSet(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (storageBroken) { console.warn('[Platform] skipping storage write because the data store is broken'); return; }
    const changes = {};
    for (const k of Object.keys(obj)) {
      const newValue = clone(obj[k]);
      const oldValue = cache.has(k) ? clone(cache.get(k)) : undefined;
      cache.set(k, newValue);
      changes[k] = { oldValue, newValue };
      if (tauriStore) {
        await tauriStore.set(k, newValue);
      } else if (!isTauri) {
        try { localStorage.setItem(LS_PREFIX + k, JSON.stringify(newValue)); } catch (e) { console.warn('[Platform] localStorage set failed', k, e); }
      }
    }
    if (tauriStore) { try { await tauriStore.save(); } catch (_) { /* autoSave will take care of it */ } }
    storageChanged.emit(changes);
  }

  async function storageRemove(keys) {
    if (storageBroken) { console.warn('[Platform] skipping storage delete because the data store is broken'); return; }
    const list = normalizeKeys(keys) || [];
    const changes = {};
    for (const k of list) {
      if (!cache.has(k)) continue;
      changes[k] = { oldValue: clone(cache.get(k)), newValue: undefined };
      cache.delete(k);
      if (tauriStore) await tauriStore.delete(k);
      else if (!isTauri) { try { localStorage.removeItem(LS_PREFIX + k); } catch (_) { /* ignore */ } }
    }
    if (tauriStore) { try { await tauriStore.save(); } catch (_) { /* ignore */ } }
    if (Object.keys(changes).length) storageChanged.emit(changes);
  }

  // ---------------------------------------------------------------------------
  // Cross-window events (main <-> popup) + the scheduler tick
  // ---------------------------------------------------------------------------
  const popupEvents = makeEmitter();   // popup -> main: {type, ...}
  const tickEvents = makeEmitter();    // Rust/interval -> main
  const showMainEvents = makeEmitter(); // tray/second instance -> main: request to show the window
  const toggleNotifEvents = makeEmitter(); // tray ('notif' item) -> main: turn notifications on/off (SPEC 20.3)
  let popupReady = !isTauri;           // browser: the overlay is always ready
  let popupReadyResolvers = [];

  function waitPopupReady(timeoutMs) {
    if (popupReady) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { resolve(false); }, timeoutMs);
      popupReadyResolvers.push(() => { clearTimeout(timer); resolve(true); });
    });
  }

  function markPopupReady() {
    popupReady = true;
    const list = popupReadyResolvers; popupReadyResolvers = [];
    list.forEach((fn) => fn());
  }

  async function eventsInit() {
    if (isTauri && T.event) {
      if (WINDOW_LABEL === 'main') {
        await T.event.listen('popup:event', (e) => { popupEvents.emit(e.payload || {}); });
        await T.event.listen('popup:ready', () => { markPopupReady(); });
        await T.event.listen('scheduler:tick', () => { tickEvents.emit({ at: Date.now() }); });
        await T.event.listen('app:show-main', () => { showMainEvents.emit({}); });
        await T.event.listen('app:toggle-notifications', () => { toggleNotifEvents.emit({}); });
        // The popup may have become ready before main started listening -> ask again.
        try { await T.event.emitTo('popup', 'popup:ping', {}); } catch (_) { /* popup not created yet */ }
      }
      return;
    }
    // Browser: tick with setInterval + catch up when the tab becomes visible again (timers get throttled).
    setInterval(() => tickEvents.emit({ at: Date.now() }), TICK_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tickEvents.emit({ at: Date.now(), resumed: true });
    });
  }

  // ---------------------------------------------------------------------------
  // Popup (main -> popup). Tauri: a separate 'popup' window (handled by popup-host.js).
  // Browser: an overlay inside the page, sharing the same PopupRenderer.
  // ---------------------------------------------------------------------------
  let browserOverlay = null;
  let browserRendered = null;

  // SPEC §22.1/§22.4: 5 valid positions -> class 'pos-<value>' on the overlay.
  // An unknown or missing value -> 'bottom-right' (keeps the old behavior).
  const POPUP_POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center'];

  function popupPositionClass(raw) {
    const pos = POPUP_POSITIONS.indexOf(raw) >= 0 ? raw : 'bottom-right';
    return 'pos-' + pos;
  }

  function browserPopupHide() {
    if (browserRendered && typeof browserRendered.destroy === 'function') {
      try { browserRendered.destroy(); } catch (_) { /* ignore */ }
    }
    browserRendered = null;
    if (browserOverlay) { browserOverlay.remove(); browserOverlay = null; }
  }

  async function popupShow(payload) {
    if (isTauri) {
      const ok = await waitPopupReady(3000);
      if (!ok) console.warn('[Platform] popup window not ready, sending anyway');
      await T.event.emitTo('popup', 'popup:show', payload);
      return true;
    }
    if (!window.PopupRenderer || typeof window.PopupRenderer.render !== 'function') {
      console.warn('[Platform] PopupRenderer missing (include js/popup.js in index.html for browser mode)');
      return false;
    }
    browserPopupHide();
    browserOverlay = document.createElement('div');
    browserOverlay.className = 'rmd-popup-overlay ' + popupPositionClass(payload && payload.popupPosition);
    browserOverlay.setAttribute('data-popup-host', 'browser');
    document.body.appendChild(browserOverlay);
    const ctx = {
      send(evt) { popupEvents.emit(evt || {}); },
      close() { browserPopupHide(); popupEvents.emit({ type: 'POPUP_CLOSED', payloadId: payload && payload.payloadId }); },
      requestResize() { /* the overlay resizes itself to fit its content */ },
      isBrowser: true
    };
    browserRendered = window.PopupRenderer.render(browserOverlay, payload, ctx) || null;
    return true;
  }

  async function popupHide() {
    if (isTauri) {
      try { await T.event.emitTo('popup', 'popup:hide', {}); } catch (_) { /* ignore */ }
      return;
    }
    browserPopupHide();
  }

  // ---------------------------------------------------------------------------
  // App info / windows / external links / sound
  // ---------------------------------------------------------------------------
  let appInfo = { os: detectOs(), arch: 'unknown', version: WEB_FALLBACK_VERSION, launchMinimized: false };

  async function appInfoInit() {
    if (!isTauri) return;
    try {
      const info = await T.core.invoke('app_info');
      if (info && typeof info === 'object') appInfo = Object.assign({}, appInfo, info);
    } catch (e) {
      console.warn('[Platform] app_info failed, using fallbacks', e);
      try { if (T.app && T.app.getVersion) appInfo.version = await T.app.getVersion(); } catch (_) { /* ignore */ }
    }
  }

  async function openExternal(url) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
    if (isTauri && T.opener && typeof T.opener.openUrl === 'function') {
      await T.opener.openUrl(url);
      return true;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }

  async function showMain() {
    if (isTauri) { try { await T.core.invoke('show_main_window'); } catch (e) { console.warn(e); } }
  }

  async function hideMain() {
    if (isTauri) { try { await T.core.invoke('hide_main_window'); } catch (e) { console.warn(e); } }
  }

  async function quitApp() {
    if (isTauri) { try { await T.core.invoke('quit_app'); } catch (e) { console.warn(e); } }
  }

  // Change the tray menu labels to match the language (Rust: set_tray_labels). Web: does nothing.
  // notifications = label of the notifications on/off item; omit it -> Rust keeps the old label (SPEC 20.3).
  async function setTrayLabels(labels) {
    if (!isTauri) return false;
    const open = labels && typeof labels.open === 'string' ? labels.open : 'Open';
    const quit = labels && typeof labels.quit === 'string' ? labels.quit : 'Quit';
    const args = { open, quit };
    if (labels && typeof labels.notifications === 'string') args.notifications = labels.notifications;
    try { await T.core.invoke('set_tray_labels', args); return true; } catch (e) { console.warn(e); return false; }
  }

  // Closing the main window -> hide to the tray (true) or quit the app (false). Web: does nothing.
  async function setCloseToTray(enabled) {
    if (!isTauri) return false;
    try { await T.core.invoke('set_close_to_tray', { enabled: enabled !== false }); return true; } catch (e) { console.warn(e); return false; }
  }

  let audioCtx = null;
  // volumePercent: 0..200 (same as the extension). Above 100 a GainNode does the amplification.
  function playSound(volumePercent) {
    const vol = Math.max(0, Math.min(200, Number(volumePercent) || 0));
    if (vol === 0) return;
    const src = 'assets/sounds/notification.wav';
    try {
      const audio = new Audio(src);
      if (vol <= 100) {
        audio.volume = vol / 100;
        audio.play().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { audio.volume = 1; audio.play().catch(() => {}); return; }
      if (!audioCtx) audioCtx = new AC();
      const node = audioCtx.createMediaElementSource(audio);
      const gain = audioCtx.createGain();
      gain.gain.value = vol / 100;
      node.connect(gain).connect(audioCtx.destination);
      audio.play().catch(() => {});
    } catch (e) {
      console.warn('[Platform] playSound failed', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Launch at login
  // ---------------------------------------------------------------------------
  const autostart = {
    supported: isTauri && !!(T.autostart),
    async isEnabled() {
      if (!this.supported) return false;
      try { return !!(await T.autostart.isEnabled()); } catch (e) { console.warn(e); return false; }
    },
    async enable() { if (this.supported) await T.autostart.enable(); },
    async disable() { if (this.supported) await T.autostart.disable(); }
  };

  // ---------------------------------------------------------------------------
  // Version updates
  // Tauri: the updater plugin (endpoint configured in tauri.conf.json, Ed25519 signature).
  // Web: only checks /api/desktop/version and then opens the download link.
  // ---------------------------------------------------------------------------
  const API_BASE = 'https://remind.asia';

  function cmpVersion(a, b) {
    const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
    }
    return 0;
  }

  const updater = {
    supported: isTauri && !!(T.updater),
    // -> { available:boolean, version, notes, downloadUrl?, install?: async (onProgress) }
    async check() {
      if (isTauri && T.updater && typeof T.updater.check === 'function') {
        const update = await T.updater.check();
        if (!update) return { available: false, version: appInfo.version };
        return {
          available: true,
          version: update.version,
          notes: update.body || '',
          date: update.date || '',
          async install(onProgress) {
            let total = 0, done = 0;
            await update.downloadAndInstall((ev) => {
              if (!ev) return;
              if (ev.event === 'Started') total = (ev.data && ev.data.contentLength) || 0;
              else if (ev.event === 'Progress') done += (ev.data && ev.data.chunkLength) || 0;
              if (typeof onProgress === 'function') onProgress({ event: ev.event, done, total });
            });
            if (T.process && typeof T.process.relaunch === 'function') await T.process.relaunch();
          }
        };
      }
      // Web fallback
      const res = await fetch(API_BASE + '/api/desktop/version', { method: 'GET', cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const latest = data && typeof data.latestVersion === 'string' ? data.latestVersion : '';
      const available = !!latest && cmpVersion(latest, appInfo.version) > 0;
      const dl = (data && data.downloads && typeof data.downloads === 'object') ? data.downloads : {};
      const key = appInfo.os === 'macos' ? 'macos' : 'windows';
      return {
        available,
        version: latest || appInfo.version,
        notes: (data && typeof data.notes === 'string') ? data.notes : '',
        downloadUrl: typeof dl[key] === 'string' ? dl[key] : '',
        downloads: dl
      };
    }
  };

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  let readyResolve;
  const ready = new Promise((r) => { readyResolve = r; });

  async function init() {
    try {
      await appInfoInit();
      await storageInit();
      await eventsInit();
    } catch (e) {
      console.error('[Platform] init failed', e);
    }
    readyResolve(true);
    return true;
  }

  window.Platform = {
    isTauri,
    windowLabel: WINDOW_LABEL,
    get os() { return appInfo.os; },
    get arch() { return appInfo.arch; },
    get version() { return appInfo.version; },
    get launchMinimized() { return !!appInfo.launchMinimized; },
    apiBase: API_BASE,
    ready,
    init,
    cmpVersion,
    get storageBroken() { return storageBroken; },
    storage: {
      get: storageGet,
      set: storageSet,
      remove: storageRemove,
      onChanged: storageChanged.on
    },
    popup: {
      show: popupShow,
      hide: popupHide,
      onEvent: popupEvents.on
    },
    onTick: tickEvents.on,
    onShowMainRequested: showMainEvents.on,
    onToggleNotificationsRequested: toggleNotifEvents.on,
    openExternal,
    window: { showMain, hideMain, quit: quitApp },
    setTrayLabels,
    setCloseToTray,
    playSound,
    autostart,
    updater,
    // For popup-host.js (the popup window) - not used by main.
    _tauri: T
  };

  init();
})();
