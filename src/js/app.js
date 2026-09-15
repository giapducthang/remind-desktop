// app.js - boot sequence of the Reminder desktop app (main window).
// Order: Platform.ready -> load/seed storage -> theme + i18n -> Scheduler.init -> VersionApi.init -> 3 UI modules -> show window.
// Exposed to the other modules: window.App = { t, escapeHtml, safeColor, settings, saveSettings, setLanguage, applyTheme,
//   switchTab, renderAll, showToast, showConfirm, checkForUpdates, installUpdate, onUpdate, getUpdateState, STORAGE_KEYS,
//   setNotificationsEnabled, snoozeFor, snoozeUntilTomorrow, clearSnooze, getMuteState, onMuteChange }.
// Contract: DESKTOP-SPEC §2, §6.2, §7. Only platform.js may use window.__TAURI__ - this file must NOT.

(function () {
  'use strict';

  if (window.App) return;

  // Every storage key (SPEC §2) - used by "Reset all data"
  const STORAGE_KEYS = [
    'reminders', 'settings', 'language', 'pickers',
    'serverPickers', 'serverPickerPrefs', 'serverPickerState', 'serverPickersHash',
    'pickersAvailable',
    'listMessage', 'lastAPICallTime', 'installId', 'popupStats', 'popupPendingBatch', 'popupToday',
    'schedulerState', 'updateState'
  ];

  const DEFAULT_SETTINGS = {
    enabled: true,
    darkMode: false,
    soundEnabled: true,
    soundVolume: 100,
    lowPerfMode: false,
    language: 'en',
    closeToTray: true,
    startMinimized: true,
    snoozeUntil: 0
  };

  // Default reminders for the first run (bilingual, text follows the language - port of updateDefaultRemindersLanguage)
  const DEFAULT_REMINDER_TEXT = {
    'default-water': { en: 'Time to drink water!', vi: 'Đã đến lúc uống nước rồi!' },
    'default-standup': { en: 'Time to stand up and stretch!', vi: 'Đứng dậy đi lại một chút nhé!' }
  };

  const UPDATE_FIRST_CHECK_MS = 15 * 1000;
  const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const TOAST_MS = 4000;
  const SNOOZE_MAX_MS = 7 * 24 * 60 * 60 * 1000;   // snooze cap (DESKTOP-SPEC §20.1)
  const MUTE_REFRESH_MS = 15 * 1000;               // redraw the UI by itself once a snooze expires
  const SNOOZE_TOMORROW_HOUR = 8;                  // "Until tomorrow morning" = 8:00 the next day
  const A11Y_MODAL_IDS = ['reminderModal', 'reminderDetailModal', 'pickerModal', 'emojiPickerModal', 'colorPickerModal'];

  const state = {
    settings: Object.assign({}, DEFAULT_SETTINGS),
    language: 'en',
    updateState: {},          // { lastCheckAt, latestVersion, notes, dismissedVersion }
    lastUpdateResult: null,   // most recent Platform.updater.check() result
    updateBusy: false,
    installing: false,
    booted: false
  };
  const updateListeners = new Set();
  const muteListeners = new Set();
  let lastMuteSig = null;
  let muteTimer = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function P() { return window.Platform; }

  function t(key) {
    if (window.i18n && typeof window.i18n.t === 'function') return window.i18n.t(key);
    return key;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Validate the color code before putting it into a style attribute (XSS defense)
  function safeColor(color, fallback) {
    fallback = fallback || '#0ea5e9';
    return (typeof color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(color)) ? color : fallback;
  }

  function currentLang() {
    return (window.i18n && window.i18n.currentLang === 'vi') ? 'vi' : 'en';
  }

  function formatDateTime(ts) {
    if (!ts) return '';
    const locale = currentLang() === 'vi' ? 'vi-VN' : 'en-US';
    try {
      return new Date(ts).toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) { return ''; }
  }

  /** "HH:mm" in local time (used by the snooze status line). */
  function formatTime(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return '';
    const d = new Date(n);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // ---------------------------------------------------------------------------
  // Storage: settings / language / seed
  // ---------------------------------------------------------------------------
  /** Valid snoozeUntil: an integer from 0 to now + 7 days. Wrong type / negative / too far ahead -> 0 (DESKTOP-SPEC §20.1). */
  function sanitizeSnoozeUntil(v) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 0;
    if (v > Date.now() + SNOOZE_MAX_MS) return 0;
    return Math.floor(v);
  }

  function normalizeSettings(raw) {
    const s = Object.assign({}, DEFAULT_SETTINGS, (raw && typeof raw === 'object') ? raw : {});
    s.enabled = s.enabled !== false;
    s.darkMode = s.darkMode === true;
    s.soundEnabled = s.soundEnabled !== false;
    s.soundVolume = Math.max(0, Math.min(200, parseInt(s.soundVolume, 10) || 0));
    if (!raw || raw.soundVolume === undefined) s.soundVolume = 100;
    s.lowPerfMode = s.lowPerfMode === true;
    s.language = s.language === 'vi' ? 'vi' : 'en';
    s.closeToTray = s.closeToTray !== false;
    s.startMinimized = s.startMinimized !== false;
    s.snoozeUntil = sanitizeSnoozeUntil(s.snoozeUntil);
    return s;
  }

  function buildDefaultReminders(lang) {
    const l = lang === 'vi' ? 'vi' : 'en';
    return [
      {
        id: 'default-water', message: DEFAULT_REMINDER_TEXT['default-water'][l], icon: '💧', color: '#0ea5e9', imageUrl: '',
        type: 'interval', interval: 30, scheduledTimes: [], dateRangeSettings: null, displayMinutes: 1, enabled: true
      },
      {
        id: 'default-standup', message: DEFAULT_REMINDER_TEXT['default-standup'][l], icon: '🚶', color: '#22c55e', imageUrl: '',
        type: 'interval', interval: 60, scheduledTimes: [], dateRangeSettings: null, displayMinutes: 1, enabled: true
      }
    ];
  }

  async function loadAndSeed() {
    const r = await P().storage.get(['settings', 'language', 'reminders', 'listMessage', 'popupStats', 'updateState']);
    const seed = {};

    const hadSettings = r.settings && typeof r.settings === 'object';
    state.settings = normalizeSettings(r.settings);
    if (!hadSettings) seed.settings = state.settings;

    let lang = (typeof r.language === 'string' && r.language === 'vi') ? 'vi' : (r.language === 'en' ? 'en' : null);
    if (!lang) { lang = state.settings.language || 'en'; seed.language = lang; }
    state.language = lang;
    if (state.settings.language !== lang) { state.settings.language = lang; seed.settings = state.settings; }

    if (!Array.isArray(r.reminders)) seed.reminders = buildDefaultReminders(lang);
    if (!Array.isArray(r.listMessage)) seed.listMessage = [];
    if (!r.popupStats || typeof r.popupStats !== 'object') seed.popupStats = {};

    state.updateState = (r.updateState && typeof r.updateState === 'object') ? r.updateState : {};

    if (Object.keys(seed).length) await P().storage.set(seed);
  }

  /**
   * Runs ONCE (flag `pickerDedupeDone`). The built-in Vietnamese sample set is created at 11:30
   * Mon-Sat, exactly the default time of the "What is for lunch?" set the server sends, and the
   * server set is ON by default -> two popups every lunchtime, 15 seconds apart. Any server set whose
   * time clashes with an enabled local set is switched off here. The user can switch it back on at
   * any time in the "Suggested by Reminder" block, and the flag makes sure this never runs twice.
   */
  async function dedupeServerPickersOnce() {
    try {
      const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
      const r = await P().storage.get(['pickerDedupeDone', 'pickers', 'serverPickers', 'serverPickerPrefs']);
      if (r.pickerDedupeDone) return;

      const localTimes = new Set();
      for (const p of (Array.isArray(r.pickers) ? r.pickers : [])) {
        if (!p || typeof p !== 'object' || p.enabled === false) continue;
        if (!Array.isArray(p.items) || p.items.length === 0) continue;
        for (const t of (Array.isArray(p.times) ? p.times : [])) {
          if (typeof t === 'string' && TIME_RE.test(t)) localTimes.add(t);
        }
      }

      const prefs = (r.serverPickerPrefs && typeof r.serverPickerPrefs === 'object' && !Array.isArray(r.serverPickerPrefs))
        ? r.serverPickerPrefs : {};
      let touched = false;
      if (localTimes.size > 0) {
        for (const p of (Array.isArray(r.serverPickers) ? r.serverPickers : [])) {
          if (!p || typeof p !== 'object' || typeof p.id !== 'string') continue;
          const raw = prefs[p.id];
          if (raw === false || (raw && typeof raw === 'object' && raw.enabled === false)) continue;
          const own = (raw && typeof raw === 'object' && Array.isArray(raw.times))
            ? raw.times.filter(function (t) { return typeof t === 'string' && TIME_RE.test(t); })
            : [];
          const times = own.length ? own : (Array.isArray(p.times) ? p.times : []);
          if (!times.some(function (t) { return localTimes.has(t); })) continue;
          prefs[p.id] = { enabled: false, times: own };
          touched = true;
        }
      }

      const toWrite = { pickerDedupeDone: true };
      if (touched) toWrite.serverPickerPrefs = prefs;
      await P().storage.set(toWrite);
    } catch (e) {
      // ignore: this is a convenience migration, never a reason to block boot
    }
  }

  // Save settings: read the newest copy from storage, then overwrite only the fields in the patch
  async function saveSettings(patch) {
    let latest = null;
    try { latest = (await P().storage.get(['settings'])).settings; } catch (e) { /* ignore */ }
    state.settings = normalizeSettings(Object.assign({}, latest || state.settings, patch || {}));
    await P().storage.set({ settings: state.settings });
    refreshMuteState();
    return state.settings;
  }

  // ---------------------------------------------------------------------------
  // App-wide notification off / snooze (DESKTOP-SPEC §20)
  // ---------------------------------------------------------------------------
  /** { enabled, snoozeUntil (0 once expired), muted } computed from the settings held in memory. */
  function getMuteState() {
    const s = state.settings || {};
    const nowTs = Date.now();
    const until = sanitizeSnoozeUntil(s.snoozeUntil);
    const active = until > nowTs ? until : 0;
    return { enabled: s.enabled !== false, snoozeUntil: active, muted: s.enabled === false || active > 0 };
  }

  /** Tell the UI modules to redraw + sync the tray labels. Only fires when the state really changed. */
  function refreshMuteState(force) {
    const ms = getMuteState();
    const sig = (ms.enabled ? 1 : 0) + '|' + ms.snoozeUntil + '|' + (ms.muted ? 1 : 0);
    if (!force && sig === lastMuteSig) return ms;
    lastMuteSig = sig;
    syncTrayLabels();
    updateMasterStatusLabel();
    muteListeners.forEach(function (cb) { try { cb(ms); } catch (e) { console.error('[App] mute listener', e); } });
    return ms;
  }

  /** Toggle the master switch. Turning it on also clears the snooze deadline. */
  async function setNotificationsEnabled(on) {
    const enabled = !!on;
    await saveSettings(enabled ? { enabled: true, snoozeUntil: 0 } : { enabled: false });
    return refreshMuteState(true);
  }

  /** Snooze for the given number of minutes (capped at 7 days). */
  async function snoozeFor(minutes) {
    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0) return getMuteState();
    const nowTs = Date.now();
    const until = Math.min(nowTs + Math.round(m) * 60000, nowTs + SNOOZE_MAX_MS);
    await saveSettings({ snoozeUntil: until });
    return refreshMuteState(true);
  }

  /** Snooze until 8:00 the next morning. */
  async function snoozeUntilTomorrow() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(SNOOZE_TOMORROW_HOUR, 0, 0, 0);
    await saveSettings({ snoozeUntil: d.getTime() });
    return refreshMuteState(true);
  }

  /** Clear the snooze deadline (leaves the master switch alone). */
  async function clearSnooze() {
    await saveSettings({ snoozeUntil: 0 });
    return refreshMuteState(true);
  }

  /** Tray menu "pause / resume": currently muted -> turn back on; currently running -> turn off. */
  async function toggleNotifications() {
    if (getMuteState().muted) {
      await setNotificationsEnabled(true);
      showToast(t('notificationsResumedToast'), 'success');
    } else {
      await saveSettings({ enabled: false });
      refreshMuteState(true);
      showToast(t('notificationsPausedToast'), 'info');
    }
    return getMuteState();
  }

  // A snooze expiring while the window is open: redraw the status line + the switches automatically
  function startMuteTimer() {
    if (muteTimer) clearInterval(muteTimer);
    muteTimer = setInterval(function () { refreshMuteState(); }, MUTE_REFRESH_MS);
  }

  // ---------------------------------------------------------------------------
  // Theme + language
  // ---------------------------------------------------------------------------
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.settings.darkMode ? 'dark' : 'light');
    const toggle = document.getElementById('darkModeToggle');
    if (toggle) toggle.checked = !!state.settings.darkMode;
  }

  async function toggleTheme() {
    await saveSettings({ darkMode: !state.settings.darkMode });
    applyTheme();
  }

  function updateLangToggleIcon() {
    const btn = document.getElementById('langToggle');
    if (!btn) return;
    const flagEn = btn.querySelector('.flag-en');
    const flagVi = btn.querySelector('.flag-vi');
    if (!flagEn || !flagVi) return;
    const vi = currentLang() === 'vi';
    flagEn.style.display = vi ? 'none' : 'block';
    flagVi.style.display = vi ? 'block' : 'none';
  }

  function updateMasterStatusLabel() {
    const ms = getMuteState();
    const masterToggle = document.getElementById('masterToggle');
    if (masterToggle) masterToggle.checked = !ms.muted;
    const masterStatus = document.getElementById('masterStatus');
    if (!masterStatus) return;
    // Fully off wins over snoozed: once off, show "Disabled" even if an old snooze deadline remains.
    if (!ms.enabled) masterStatus.textContent = t('statusDisabled');
    else if (ms.snoozeUntil) masterStatus.textContent = t('pausedUntil').replace('{time}', formatTime(ms.snoozeUntil));
    else masterStatus.textContent = t('statusEnabled');
  }

  function syncTrayLabels() {
    const p = P();
    if (p && typeof p.setTrayLabels === 'function') {
      try {
        p.setTrayLabels({
          open: t('trayOpen'),
          quit: t('trayQuit'),
          notifications: getMuteState().muted ? t('trayResumeNotifications') : t('trayPauseNotifications')
        });
      } catch (e) { /* ignore */ }
    }
  }

  function applyLanguageToDom() {
    if (window.i18n && typeof window.i18n.applyTranslations === 'function') window.i18n.applyTranslations();
    document.documentElement.lang = currentLang();
    updateLangToggleIcon();
    updateMasterStatusLabel();
    const langSelect = document.getElementById('languageSelect');
    if (langSelect) langSelect.value = currentLang();
    syncTrayLabels();
  }

  // Switch the text of the 2 default reminders to the current language (port of updateDefaultRemindersLanguage)
  async function updateDefaultRemindersLanguage(lang) {
    const l = lang === 'vi' ? 'vi' : 'en';
    let list;
    try { list = (await P().storage.get(['reminders'])).reminders; } catch (e) { return; }
    if (!Array.isArray(list)) return;
    let updated = false;
    const next = list.map((r) => {
      if (r && DEFAULT_REMINDER_TEXT[r.id]) { updated = true; return Object.assign({}, r, { message: DEFAULT_REMINDER_TEXT[r.id][l] }); }
      return r;
    });
    if (updated) {
      await P().storage.set({ reminders: next });
      if (window.Scheduler && typeof window.Scheduler.rebuild === 'function') { try { window.Scheduler.rebuild(); } catch (e) { /* ignore */ } }
    }
  }

  async function setLanguage(lang) {
    const l = lang === 'vi' ? 'vi' : 'en';
    state.language = l;
    if (window.i18n) window.i18n.currentLang = l;
    await P().storage.set({ language: l });
    await saveSettings({ language: l });
    applyLanguageToDom();
    await updateDefaultRemindersLanguage(l);
    renderAll();
    renderUpdateBanner();
    // Server messages (listMessage) and server picker names are chosen by language ON THE SERVER ITSELF.
    // Changing the language without calling the API again leaves the popup on the old language for up to 30 minutes.
    refreshServerContentForLanguage();
  }

  // Call the version API again for list_message + pickers in the new language (network errors ignored: keep old data).
  function refreshServerContentForLanguage() {
    const api = window.VersionApi;
    if (!api || typeof api.callVersionAPI !== 'function') return;
    Promise.resolve()
      .then(() => api.callVersionAPI(true))
      .then(() => { if (window.UIPickers && typeof window.UIPickers.render === 'function') window.UIPickers.render(); })
      .catch((e) => console.warn('[App] refresh server content failed', e));
  }

  function toggleLanguage() {
    return setLanguage(currentLang() === 'vi' ? 'en' : 'vi');
  }

  // ---------------------------------------------------------------------------
  // Tab
  // ---------------------------------------------------------------------------
  function switchTab(tabId) {
    document.querySelectorAll('.nav-item').forEach((btn) => {
      const isActive = btn.dataset.tab === tabId;
      btn.classList.toggle('active', isActive);
      if (isActive) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    document.querySelectorAll('.tab-content').forEach((content) => content.classList.toggle('active', content.id === 'tab-' + tabId));
    if (tabId === 'settings' && window.UISettings && typeof window.UISettings.render === 'function') window.UISettings.render();
  }

  function renderAll() {
    ['UIReminders', 'UIPickers', 'UISettings'].forEach((name) => {
      const mod = window[name];
      if (mod && typeof mod.render === 'function') {
        try { const p = mod.render(); if (p && typeof p.catch === 'function') p.catch((e) => console.error('[App] render ' + name, e)); }
        catch (e) { console.error('[App] render ' + name, e); }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Toast + confirm (in-app modal, translatable) + modal a11y
  // ---------------------------------------------------------------------------
  function showToast(message, type) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    type = type || 'info';
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.textContent = icons[type] || icons.info;
    const msgSpan = document.createElement('span');
    msgSpan.className = 'toast-message';
    msgSpan.textContent = String(message || '');
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', t('close'));
    closeBtn.addEventListener('click', () => toast.remove());
    toast.appendChild(iconSpan);
    toast.appendChild(msgSpan);
    toast.appendChild(closeBtn);
    container.appendChild(toast);
    setTimeout(() => toast.remove(), TOAST_MS);
  }

  function ensureConfirmModal() {
    let modal = document.getElementById('appConfirmModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'appConfirmModal';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    const body = document.createElement('div');
    body.className = 'modal-body';
    const msg = document.createElement('p');
    msg.id = 'appConfirmMessage';
    body.appendChild(msg);
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'btn btn-secondary'; cancel.id = 'appConfirmCancel';
    const ok = document.createElement('button');
    ok.type = 'button'; ok.className = 'btn btn-danger'; ok.id = 'appConfirmOk';
    footer.appendChild(cancel); footer.appendChild(ok);
    dialog.appendChild(body); dialog.appendChild(footer);
    modal.appendChild(backdrop); modal.appendChild(dialog);
    document.body.appendChild(modal);
    return modal;
  }

  function showConfirm(message, opts) {
    opts = opts || {};
    const modal = ensureConfirmModal();
    const msgEl = modal.querySelector('#appConfirmMessage');
    const okBtn = modal.querySelector('#appConfirmOk');
    const cancelBtn = modal.querySelector('#appConfirmCancel');
    const backdrop = modal.querySelector('.modal-backdrop');
    msgEl.textContent = String(message || '');
    okBtn.textContent = opts.okText || t('confirm');
    cancelBtn.textContent = opts.cancelText || t('cancel');

    return new Promise((resolve) => {
      const prevFocus = document.activeElement;
      function cleanup(result) {
        modal.classList.remove('active');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey, true);
        if (prevFocus && typeof prevFocus.focus === 'function') { try { prevFocus.focus(); } catch (e) { /* ignore */ } }
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cleanup(false); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); cleanup(true); }
      }
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      backdrop.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey, true);
      modal.classList.add('active');
      setTimeout(() => { try { okBtn.focus(); } catch (e) { /* ignore */ } }, 50);
    });
  }

  function getModalFocusable(container) {
    if (!container) return [];
    const sel = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll(sel)).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  function getTopActiveA11yModal() {
    let top = null;
    A11Y_MODAL_IDS.forEach((id) => {
      const m = document.getElementById(id);
      if (m && m.classList.contains('active')) top = m;
    });
    return top;
  }

  // Escape closes the topmost modal, focus trap, focus restored on close (port of setupModalA11y)
  function setupModalA11y() {
    const prevFocus = {};
    A11Y_MODAL_IDS.forEach((id) => {
      const modal = document.getElementById(id);
      if (!modal) return;
      let wasActive = false;
      const observer = new MutationObserver(() => {
        const isActive = modal.classList.contains('active');
        if (isActive && !wasActive) {
          wasActive = true;
          prevFocus[id] = document.activeElement;
          setTimeout(() => {
            const dialog = modal.querySelector('.modal-dialog') || modal;
            const focusables = getModalFocusable(dialog);
            if (focusables.length) focusables[0].focus();
          }, 50);
        } else if (!isActive && wasActive) {
          wasActive = false;
          const prev = prevFocus[id];
          if (prev && typeof prev.focus === 'function') { try { prev.focus(); } catch (e) { /* ignore */ } }
          prevFocus[id] = null;
        }
      });
      observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
    });

    document.addEventListener('keydown', (e) => {
      const modal = getTopActiveA11yModal();
      if (!modal) return;
      if (e.key === 'Escape') { e.preventDefault(); modal.classList.remove('active'); return; }
      if (e.key === 'Tab') {
        const dialog = modal.querySelector('.modal-dialog') || modal;
        const focusables = getModalFocusable(dialog);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  // Every http(s) link opens in the system browser (Tauri cannot open a new tab)
  function setupExternalLinks() {
    document.addEventListener('click', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) return;
      e.preventDefault();
      P().openExternal(href).catch((err) => console.warn('[App] openExternal failed', err));
    });
  }

  // ---------------------------------------------------------------------------
  // Version updates (SPEC §6.2)
  // ---------------------------------------------------------------------------
  function emitUpdate() {
    const info = getUpdateState();
    updateListeners.forEach((cb) => { try { cb(info); } catch (e) { console.error('[App] update listener', e); } });
  }

  function getUpdateState() {
    return {
      state: Object.assign({}, state.updateState),
      result: state.lastUpdateResult,
      busy: state.updateBusy,
      installing: state.installing,
      currentVersion: P() ? P().version : '',
      supported: !!(P() && P().updater && P().updater.supported)
    };
  }

  async function persistUpdateState(patch) {
    state.updateState = Object.assign({}, state.updateState, patch || {});
    try { await P().storage.set({ updateState: state.updateState }); } catch (e) { /* ignore */ }
  }

  function renderUpdateBanner() {
    const banner = document.getElementById('updateBanner');
    if (!banner) return;
    const res = state.lastUpdateResult;
    const show = !!(res && res.available && res.version && res.version !== state.updateState.dismissedVersion);
    banner.hidden = !show;
    if (!show) return;
    const text = document.getElementById('updateBannerText');
    if (text) text.textContent = t('updateAvailable').replace('{version}', res.version);
    const nowBtn = document.getElementById('updateNowBtn');
    if (nowBtn) {
      nowBtn.textContent = (typeof res.install === 'function') ? t('updateNow') : t('downloadPage');
      nowBtn.disabled = state.installing;
    }
  }

  // manual = true: the user clicked "Check for updates" -> also report "up to date" / errors with a toast
  async function checkForUpdates(manual) {
    if (state.updateBusy) return state.lastUpdateResult;
    const p = P();
    if (!p || !p.updater || typeof p.updater.check !== 'function') return null;
    state.updateBusy = true;
    emitUpdate();
    let result = null;
    try {
      result = await p.updater.check();
      state.lastUpdateResult = result || null;
      await persistUpdateState({
        lastCheckAt: Date.now(),
        latestVersion: result && result.version ? String(result.version) : p.version,
        notes: result && typeof result.notes === 'string' ? result.notes.slice(0, 4000) : ''
      });
      if (manual) {
        if (result && result.available) {
          // Manual check: show the banner again even if it was dismissed with "Later"
          if (state.updateState.dismissedVersion === result.version) await persistUpdateState({ dismissedVersion: '' });
        } else {
          showToast(t('upToDate'), 'success');
        }
      }
    } catch (e) {
      console.warn('[App] update check failed', e);
      state.lastUpdateResult = null;
      await persistUpdateState({ lastCheckAt: Date.now(), lastError: String(e && e.message || e).slice(0, 200) });
      if (manual) showToast(t('updateFailed'), 'error');
    } finally {
      state.updateBusy = false;
    }
    renderUpdateBanner();
    emitUpdate();
    return result;
  }

  function formatProgress(p) {
    if (!p) return '';
    if (p.event === 'Finished') return t('updateInstalling');
    if (p.total > 0) {
      const pct = Math.min(100, Math.round((p.done / p.total) * 100));
      return t('downloading') + ' ' + pct + '%';
    }
    return t('downloading');
  }

  async function installUpdate() {
    const res = state.lastUpdateResult;
    if (!res || !res.available || state.installing) return false;
    const progressEl = document.getElementById('updateBannerProgress');
    if (typeof res.install !== 'function') {
      if (res.downloadUrl) { await P().openExternal(res.downloadUrl); return true; }
      showToast(t('updateInstallFailed'), 'error');
      return false;
    }
    state.installing = true;
    renderUpdateBanner();
    emitUpdate();
    if (progressEl) progressEl.textContent = t('downloading');
    try {
      await res.install((p) => {
        const text = formatProgress(p);
        if (progressEl) progressEl.textContent = text;
        state.installProgress = text;
        emitUpdate();
      });
      if (progressEl) progressEl.textContent = t('updateInstalling');
      return true;
    } catch (e) {
      console.error('[App] update install failed', e);
      showToast(t('updateInstallFailed'), 'error');
      if (progressEl) progressEl.textContent = '';
      return false;
    } finally {
      state.installing = false;
      renderUpdateBanner();
      emitUpdate();
    }
  }

  async function dismissUpdate() {
    const res = state.lastUpdateResult;
    if (res && res.version) await persistUpdateState({ dismissedVersion: res.version });
    renderUpdateBanner();
    emitUpdate();
  }

  function scheduleUpdateChecks() {
    const p = P();
    if (!p || !p.updater || typeof p.updater.check !== 'function') return;
    setTimeout(() => { checkForUpdates(false); }, UPDATE_FIRST_CHECK_MS);
    setInterval(() => { checkForUpdates(false); }, UPDATE_INTERVAL_MS);
  }

  // ---------------------------------------------------------------------------
  // Shared event wiring
  // ---------------------------------------------------------------------------
  function setupEventListeners() {
    document.querySelectorAll('.nav-item[data-tab]').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) themeBtn.addEventListener('click', () => { toggleTheme().catch((e) => console.error(e)); });
    const langBtn = document.getElementById('langToggle');
    if (langBtn) langBtn.addEventListener('click', () => { toggleLanguage().catch((e) => console.error(e)); });
    const nowBtn = document.getElementById('updateNowBtn');
    if (nowBtn) nowBtn.addEventListener('click', () => { installUpdate().catch((e) => console.error(e)); });
    const laterBtn = document.getElementById('updateLaterBtn');
    if (laterBtn) laterBtn.addEventListener('click', () => { dismissUpdate().catch((e) => console.error(e)); });

    // Another module may write settings -> keep the in-memory copy in sync
    P().storage.onChanged((changes) => {
      if (changes && changes.settings && changes.settings.newValue) {
        state.settings = normalizeSettings(changes.settings.newValue);
        applyTheme();
        refreshMuteState(true);
      }
      if (changes && changes.language && changes.language.newValue && changes.language.newValue !== currentLang()) {
        if (window.i18n) window.i18n.currentLang = changes.language.newValue === 'vi' ? 'vi' : 'en';
        applyLanguageToDom();
      }
    });

    P().onShowMainRequested(() => { /* Rust already showed the window; nothing more to do */ });

    // Tray menu: resume / pause notifications (platform.js may not have this function yet)
    const p = P();
    if (p && typeof p.onToggleNotificationsRequested === 'function') {
      try { p.onToggleNotificationsRequested(() => { toggleNotifications().catch((e) => console.error('[App] toggle notifications', e)); }); }
      catch (e) { console.warn('[App] onToggleNotificationsRequested', e); }
    }
    startMuteTimer();
    setupExternalLinks();
    setupModalA11y();
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  async function boot() {
    if (state.booted) return;
    state.booted = true;
    const p = P();
    if (!p) { console.error('[App] Platform missing'); return; }
    await p.ready;
    await loadAndSeed();
    await dedupeServerPickersOnce();

    applyTheme();
    if (window.i18n) window.i18n.currentLang = state.language;
    applyLanguageToDom();
    if (typeof p.setCloseToTray === 'function') { try { p.setCloseToTray(state.settings.closeToTray !== false); } catch (e) { /* ignore */ } }

    if (window.Scheduler && typeof window.Scheduler.init === 'function') {
      try { await window.Scheduler.init(); } catch (e) { console.error('[App] Scheduler.init failed', e); }
    } else {
      console.warn('[App] Scheduler missing (js/scheduler.js) - reminders will not fire');
    }
    if (window.VersionApi && typeof window.VersionApi.init === 'function') {
      try { await window.VersionApi.init(); } catch (e) { console.error('[App] VersionApi.init failed', e); }
    } else {
      console.warn('[App] VersionApi missing (js/api.js) - server messages/pickers disabled');
    }
    // An update or reinstall can drop the launch-at-login entry -> reconcile it with the saved preference.
    reconcileAutostart();

    setupEventListeners();
    for (const name of ['UIReminders', 'UIPickers', 'UISettings']) {
      const mod = window[name];
      if (mod && typeof mod.init === 'function') {
        try { await mod.init(); } catch (e) { console.error('[App] ' + name + '.init failed', e); }
      }
    }
    applyLanguageToDom();
    refreshMuteState(true);

    // startMinimized = false -> show the window even when launched at login with --minimized
    if (!p.launchMinimized || state.settings.startMinimized === false) {
      try { await p.window.showMain(); } catch (e) { console.warn(e); }
    }
    scheduleUpdateChecks();
  }

  /**
   * Reconcile "launch at login" between the saved preference and the real state of the OS.
   * settings.autostartEnabled = true while the OS reports it off (the Run key / LaunchAgent went missing
   * after an update or a reinstall) -> turn it back on. Only ever turns it on, never off: if the user
   * disabled it elsewhere they meant to, and the app does not override that.
   */
  async function reconcileAutostart() {
    const p = P();
    if (!p || !p.autostart || !p.autostart.supported) return;
    const want = state.settings && state.settings.autostartEnabled === true;
    if (!want) return;
    try {
      if (await p.autostart.isEnabled()) return;
      await p.autostart.enable();
      console.log('[App] the OS lost the launch-at-startup entry -> re-enabled it from the saved setting');
    } catch (e) {
      console.warn('[App] could not re-enable launch at startup', e);
    }
  }

  window.App = {
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    t,
    escapeHtml,
    safeColor,
    formatDateTime,
    formatTime,
    get settings() { return state.settings; },
    get language() { return currentLang(); },
    saveSettings,
    setLanguage,
    applyTheme,
    updateMasterStatusLabel,
    setNotificationsEnabled,
    snoozeFor,
    snoozeUntilTomorrow,
    clearSnooze,
    toggleNotifications,
    getMuteState,
    onMuteChange(cb) { if (typeof cb === 'function') muteListeners.add(cb); return () => muteListeners.delete(cb); },
    switchTab,
    renderAll,
    showToast,
    showConfirm,
    checkForUpdates,
    installUpdate,
    dismissUpdate,
    getUpdateState,
    reconcileAutostart,
    get installProgress() { return state.installProgress || ''; },
    onUpdate(cb) { if (typeof cb === 'function') updateListeners.add(cb); return () => updateListeners.delete(cb); },
    boot
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { boot().catch((e) => console.error('[App] boot failed', e)); });
  else boot().catch((e) => console.error('[App] boot failed', e));
})();
