// ui-settings.js - Settings tab (initSettingsUI/setupSettingsListeners ported from the browser extension's side panel plus desktop-only parts).
// Groups: Appearance (dark mode, language, low perf), Notifications (on/off + snooze 15m/1h/tomorrow morning, sound, volume 0..200 with a test tone),
// Notifications also has a Popup position row (settings.popupPosition) plus a preview button (DESKTOP-SPEC §22.5).
// System (start with the computer, start minimized, keep running in the tray), Updates, Data (reset), About.
// Exports: window.UISettings = { init(), render() }.

(function () {
  'use strict';

  if (window.UISettings) return;

  let initialized = false;

  // Popup position (DESKTOP-SPEC §22.1) - must match the list in scheduler.js
  const POPUP_POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center'];
  const POPUP_POSITION_DEFAULT = 'bottom-right';
  function safePopupPosition(v) {
    return typeof v === 'string' && POPUP_POSITIONS.indexOf(v) !== -1 ? v : POPUP_POSITION_DEFAULT;
  }

  function A() { return window.App; }
  function P() { return window.Platform; }
  function t(key) { return A() ? A().t(key) : key; }
  function toast(msg, type) { if (A()) A().showToast(msg, type); }
  function $(id) { return document.getElementById(id); }
  function settings() { return A() ? A().settings : {}; }

  // ---------------------------------------------------------------------------
  // Appearance + notifications
  // ---------------------------------------------------------------------------
  function renderBasic() {
    const s = settings();
    const darkModeToggle = $('darkModeToggle');
    if (darkModeToggle) darkModeToggle.checked = s.darkMode === true;
    const langSelect = $('languageSelect');
    if (langSelect) langSelect.value = (window.i18n && window.i18n.currentLang === 'vi') ? 'vi' : 'en';
    const lowPerfToggle = $('lowPerfToggle');
    if (lowPerfToggle) lowPerfToggle.checked = s.lowPerfMode === true;
    const soundToggle = $('soundToggle');
    if (soundToggle) soundToggle.checked = s.soundEnabled !== false;
    const vol = Number.isFinite(Number(s.soundVolume)) ? Number(s.soundVolume) : 100;
    const volumeSlider = $('volumeSlider');
    if (volumeSlider) { volumeSlider.value = vol; volumeSlider.setAttribute('aria-valuetext', vol + '%'); }
    const volumeValue = $('volumeValue');
    if (volumeValue) volumeValue.textContent = vol + '%';
    const popupPositionSelect = $('popupPositionSelect');
    if (popupPositionSelect) popupPositionSelect.value = safePopupPosition(s.popupPosition);
    const closeToTrayToggle = $('closeToTrayToggle');
    if (closeToTrayToggle) closeToTrayToggle.checked = s.closeToTray !== false;
    const startMinimizedToggle = $('startMinimizedToggle');
    if (startMinimizedToggle) startMinimizedToggle.checked = s.startMinimized !== false;
  }

  function setupBasicListeners() {
    const darkModeToggle = $('darkModeToggle');
    if (darkModeToggle) darkModeToggle.addEventListener('change', async (e) => {
      await A().saveSettings({ darkMode: e.target.checked });
      A().applyTheme();
    });

    const langSelect = $('languageSelect');
    if (langSelect) langSelect.addEventListener('change', (e) => { A().setLanguage(e.target.value).catch((err) => console.error(err)); });

    const lowPerfToggle = $('lowPerfToggle');
    if (lowPerfToggle) lowPerfToggle.addEventListener('change', (e) => { A().saveSettings({ lowPerfMode: e.target.checked }); });

    const soundToggle = $('soundToggle');
    if (soundToggle) soundToggle.addEventListener('change', (e) => { A().saveSettings({ soundEnabled: e.target.checked }); });

    // Changing the position writes settings.popupPosition right away; the next popup picks it up from the payload
    const popupPositionSelect = $('popupPositionSelect');
    if (popupPositionSelect) popupPositionSelect.addEventListener('change', (e) => {
      const pos = safePopupPosition(e.target.value);
      e.target.value = pos;
      A().saveSettings({ popupPosition: pos });
    });

    // Preview: show a sample reminder immediately (still runs while notifications are snoozed, since the user clicked it on purpose)
    const previewPositionBtn = $('previewPositionBtn');
    if (previewPositionBtn) previewPositionBtn.addEventListener('click', () => {
      const S = window.Scheduler;
      if (!S || typeof S.previewReminder !== 'function') { toast(t('previewError'), 'error'); return; }
      Promise.resolve()
        .then(() => S.previewReminder({
          id: 'preview-popup-position',
          message: t('previewPositionMessage'),
          icon: '📍',
          color: '#0ea5e9',
          imageUrl: '',
          displayMinutes: 1
        }))
        .then((res) => {
          if (res === false || (res && res.success === false)) toast(t('previewError'), 'error');
          else toast(t('previewSent'), 'success');
        })
        .catch(() => toast(t('previewError'), 'error'));
    });

    // Volume: dragging the slider plays a continuous tone so the user can hear the level (ported from the extension)
    const volumeSlider = $('volumeSlider');
    const volumeValue = $('volumeValue');
    let ctx = null, osc = null, gain = null;
    function startTone() {
      if (ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        osc = ctx.createOscillator();
        gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.value = ((Number(volumeSlider.value) || 0) / 100) * 0.3;
        osc.start();
      } catch (e) { /* cannot play audio */ }
    }
    function updateTone(volume) { if (gain) gain.gain.value = (volume / 100) * 0.3; }
    function stopTone() {
      try { if (osc) osc.stop(); } catch (e) { /* ignore */ }
      try { if (ctx) ctx.close(); } catch (e) { /* ignore */ }
      ctx = null; osc = null; gain = null;
    }
    if (volumeSlider) {
      let saveTimer = null;
      volumeSlider.addEventListener('mousedown', startTone);
      volumeSlider.addEventListener('touchstart', startTone, { passive: true });
      volumeSlider.addEventListener('input', (e) => {
        const volume = Math.max(0, Math.min(200, parseInt(e.target.value, 10) || 0));
        if (volumeValue) volumeValue.textContent = volume + '%';
        e.target.setAttribute('aria-valuetext', volume + '%');
        updateTone(volume);
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { A().saveSettings({ soundVolume: volume }); }, 150);
      });
      volumeSlider.addEventListener('change', (e) => {
        const volume = Math.max(0, Math.min(200, parseInt(e.target.value, 10) || 0));
        A().saveSettings({ soundVolume: volume });
      });
      ['mouseup', 'mouseleave', 'touchend', 'blur'].forEach((ev) => volumeSlider.addEventListener(ev, stopTone));
      // Keyboard control: play a short tone so the user can hear the level
      volumeSlider.addEventListener('keyup', (e) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
          if (P() && typeof P().playSound === 'function') P().playSound(parseInt(volumeSlider.value, 10) || 0);
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Turn off / snooze notifications (DESKTOP-SPEC §20.4)
  // ---------------------------------------------------------------------------
  function muteState() {
    const a = A();
    if (a && typeof a.getMuteState === 'function') return a.getMuteState();
    return { enabled: true, snoozeUntil: 0, muted: false };
  }

  function renderMute() {
    const ms = muteState();
    const toggle = $('notificationsEnabledToggle');
    if (toggle) toggle.checked = ms.enabled;
    // Master switch off -> snoozing is meaningless
    ['snooze15Btn', 'snooze60Btn', 'snoozeTomorrowBtn'].forEach(function (id) {
      const btn = $(id);
      if (btn) btn.disabled = !ms.enabled;
    });
    const row = $('snoozeStatusRow');
    const text = $('snoozeStatusText');
    const showSnooze = ms.snoozeUntil > 0;
    if (row) row.hidden = !showSnooze;
    if (text) {
      const a = A();
      const hhmm = (a && typeof a.formatTime === 'function') ? a.formatTime(ms.snoozeUntil) : '';
      text.textContent = showSnooze ? t('pausedUntil').replace('{time}', hhmm) : '';
    }
  }

  function setupMuteListeners() {
    const toggle = $('notificationsEnabledToggle');
    if (toggle) toggle.addEventListener('change', async (e) => {
      const on = e.target.checked;
      await A().setNotificationsEnabled(on);
      toast(on ? t('notificationsResumedToast') : t('notificationsPausedToast'), on ? 'success' : 'info');
    });

    const pairs = [['snooze15Btn', 15], ['snooze60Btn', 60]];
    pairs.forEach(function (pair) {
      const btn = $(pair[0]);
      if (!btn) return;
      btn.addEventListener('click', async () => {
        const ms = await A().snoozeFor(pair[1]);
        announcePaused(ms);
      });
    });

    const tomorrowBtn = $('snoozeTomorrowBtn');
    if (tomorrowBtn) tomorrowBtn.addEventListener('click', async () => {
      const ms = await A().snoozeUntilTomorrow();
      announcePaused(ms);
    });

    const resumeBtn = $('resumeNotificationsBtn');
    if (resumeBtn) resumeBtn.addEventListener('click', async () => {
      await A().clearSnooze();
      toast(t('notificationsResumedToast'), 'success');
    });

    if (A() && typeof A().onMuteChange === 'function') A().onMuteChange(() => renderMute());
  }

  function announcePaused(ms) {
    const a = A();
    const until = ms && ms.snoozeUntil ? ms.snoozeUntil : 0;
    const hhmm = (a && typeof a.formatTime === 'function') ? a.formatTime(until) : '';
    toast(until ? t('pausedUntil').replace('{time}', hhmm) : t('notificationsPausedToast'), 'info');
  }

  // ---------------------------------------------------------------------------
  // System
  // ---------------------------------------------------------------------------
  async function renderSystem() {
    const p = P();
    const supported = !!(p && p.autostart && p.autostart.supported);
    const row = $('autostartRow');
    const minRow = $('startMinimizedRow');
    if (row) row.hidden = !supported;
    if (minRow) minRow.hidden = !supported;
    const toggle = $('autostartToggle');
    if (supported && toggle) {
      // The OS is the source of truth; if the query fails, fall back to the saved preference (settings.autostartEnabled).
      try { toggle.checked = !!(await p.autostart.isEnabled()); }
      catch (e) { toggle.checked = (A() && A().settings && A().settings.autostartEnabled === true); }
    }
  }

  function setupSystemListeners() {
    const autostartToggle = $('autostartToggle');
    if (autostartToggle) autostartToggle.addEventListener('change', async (e) => {
      const p = P();
      const enabled = e.target.checked;
      if (!p || !p.autostart || !p.autostart.supported) return;
      try {
        if (enabled) await p.autostart.enable(); else await p.autostart.disable();
        // Record the preference so a later update/reinstall can turn it back on (app.js reconcileAutostart).
        if (A() && typeof A().saveSettings === 'function') await A().saveSettings({ autostartEnabled: enabled });
        toast(t('settingsSaved'), 'success');
      } catch (err) {
        console.error('[UISettings] autostart', err);
        e.target.checked = !enabled;
        toast(t('autostartError'), 'error');
      }
    });

    const startMinimizedToggle = $('startMinimizedToggle');
    if (startMinimizedToggle) startMinimizedToggle.addEventListener('change', (e) => { A().saveSettings({ startMinimized: e.target.checked }); });

    const closeToTrayToggle = $('closeToTrayToggle');
    if (closeToTrayToggle) closeToTrayToggle.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      await A().saveSettings({ closeToTray: enabled });
      const p = P();
      if (p && typeof p.setCloseToTray === 'function') { try { await p.setCloseToTray(enabled); } catch (err) { console.warn(err); } }
    });
  }

  // ---------------------------------------------------------------------------
  // Updates
  // ---------------------------------------------------------------------------
  function renderUpdates(info) {
    info = info || (A() ? A().getUpdateState() : null);
    const p = P();
    const versionEl = $('aboutVersion');
    if (versionEl) versionEl.textContent = (p && p.version) || '';
    const lastEl = $('updateLastChecked');
    const statusEl = $('updateStatus');
    const notesEl = $('updateNotes');
    const actionBtn = $('updateActionBtn');
    const checkBtn = $('checkUpdatesBtn');
    if (!info) return;

    const st = info.state || {};
    if (lastEl) lastEl.textContent = t('lastChecked') + ': ' + (st.lastCheckAt ? A().formatDateTime(st.lastCheckAt) : t('neverChecked'));

    const res = info.result;
    if (checkBtn) { checkBtn.disabled = !!info.busy; checkBtn.textContent = info.busy ? t('checkingUpdates') : t('checkUpdates'); }

    let statusText = '';
    let statusClass = 'update-status';
    if (info.busy) { statusText = t('checkingUpdates'); }
    else if (res && res.available) { statusText = t('updateAvailable').replace('{version}', res.version); statusClass += ' is-new'; }
    else if (st.lastError && !st.lastCheckAt) { statusText = ''; }
    else if (st.lastCheckAt && res && res.available === false) { statusText = t('upToDate'); statusClass += ' is-ok'; }
    else if (st.lastCheckAt && st.lastError && (!res)) { statusText = t('updateFailed'); statusClass += ' is-error'; }
    else if (st.lastCheckAt && st.latestVersion && p && p.cmpVersion(st.latestVersion, p.version) > 0) {
      statusText = t('updateAvailable').replace('{version}', st.latestVersion); statusClass += ' is-new';
    }
    if (info.installing) { statusText = (A() && A().installProgress) || t('downloading'); }
    if (statusEl) { statusEl.className = statusClass; statusEl.textContent = statusText; }
    if (notesEl) notesEl.textContent = (res && res.available && res.notes) ? (t('updateNotes') + ': ' + String(res.notes).slice(0, 2000)) : '';

    if (actionBtn) {
      const show = !!(res && res.available);
      actionBtn.hidden = !show;
      actionBtn.disabled = !!info.installing;
      actionBtn.textContent = (res && typeof res.install === 'function') ? t('updateNow') : t('downloadPage');
    }
  }

  function setupUpdateListeners() {
    const checkBtn = $('checkUpdatesBtn');
    if (checkBtn) checkBtn.addEventListener('click', () => { A().checkForUpdates(true).catch((e) => console.error(e)); });
    const actionBtn = $('updateActionBtn');
    if (actionBtn) actionBtn.addEventListener('click', () => { A().installUpdate().catch((e) => console.error(e)); });
    if (A() && typeof A().onUpdate === 'function') A().onUpdate((info) => renderUpdates(info));
  }

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  function setupDataListeners() {
    const resetBtn = $('resetData');
    if (resetBtn) resetBtn.addEventListener('click', async () => {
      if (!(await A().showConfirm(t('confirmReset')))) return;
      try {
        await P().storage.remove(A().STORAGE_KEYS);
        toast(t('dataReset'), 'success');
        setTimeout(() => location.reload(), 300);
      } catch (e) {
        console.error('[UISettings] reset', e);
        toast(t('previewError'), 'error');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // API module
  // ---------------------------------------------------------------------------
  async function render() {
    renderBasic();
    renderMute();
    await renderSystem();
    renderUpdates();
  }

  async function init() {
    if (initialized) return render();
    initialized = true;
    setupBasicListeners();
    setupMuteListeners();
    setupSystemListeners();
    setupUpdateListeners();
    setupDataListeners();
    await render();
  }

  window.UISettings = { init, render, renderUpdates };
})();
