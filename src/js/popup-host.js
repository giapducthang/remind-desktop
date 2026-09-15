// popup-host.js - glue for the POPUP WINDOW (Tauri). Loaded only by popup.html.
// Receives 'popup:show' from main -> calls PopupRenderer.render -> measures the content -> invokes show_popup
// (with 'position' taken from payload.popupPosition - SPEC §22.2).
// When the renderer closes -> invokes hide_popup + sends 'popup:event' {type:'POPUP_CLOSED'} back to main.
// The browser build does NOT use this file (platform.js draws its own overlay).

(function () {
  'use strict';

  const P = window.Platform;
  if (!P) { console.error('[popup-host] Platform missing'); return; }
  const T = P._tauri;
  if (!P.isTauri || !T) { console.warn('[popup-host] not running inside Tauri - nothing to do'); return; }

  const POPUP_WIDTH = 520;   // matches the extension popup width (.hrn-modal: min(520px, 92vw))
  // SPEC §22.1: 5 valid positions, an unknown or missing value -> 'bottom-right' (keeps the old behavior).
  // Filtered here so a corrupt payload can never reach Rust.
  const POPUP_POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center'];
  const DEFAULT_POSITION = 'bottom-right';
  const POPUP_MAX_HEIGHT = 720;
  const POPUP_MIN_HEIGHT = 120;

  const root = document.getElementById('popupRoot') || document.body;
  let current = null;        // { destroy() }
  let currentPayloadId = null;
  let currentPosition = DEFAULT_POSITION;
  let resizeTimer = null;
  let visible = false;

  function cleanPosition(raw) {
    return POPUP_POSITIONS.indexOf(raw) >= 0 ? raw : DEFAULT_POSITION;
  }

  function invoke(cmd, args) {
    return T.core.invoke(cmd, args).catch((e) => console.warn('[popup-host] invoke ' + cmd + ' failed', e));
  }

  function emitToMain(payload) {
    return T.event.emitTo('main', 'popup:event', payload).catch(() => {});
  }

  function measure() {
    const card = root.firstElementChild || root;
    const rect = card.getBoundingClientRect();
    const h = Math.ceil(Math.max(rect.height, root.scrollHeight));
    return {
      width: POPUP_WIDTH,
      height: Math.max(POPUP_MIN_HEIGHT, Math.min(POPUP_MAX_HEIGHT, h))
    };
  }

  function applySize() {
    const size = measure();
    return invoke('show_popup', {
      width: size.width,
      height: size.height,
      position: currentPosition
    }).then(() => { visible = true; });
  }

  // Do NOT use requestAnimationFrame here: the popup window stays HIDDEN until show_popup runs,
  // and macOS (WKWebView) does not fire rAF for a hidden window -> the popup would never appear.
  // setTimeout keeps firing whether the window is hidden or visible.
  function afterLayout(fn) {
    setTimeout(fn, 0);   // measure right away: good enough for a sane size and to SHOW the window
    setTimeout(fn, 80);  // measure again once fonts/images/CSS have settled
  }

  function scheduleResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      afterLayout(() => { if (current) applySize(); });
    }, 30);
  }

  function teardown(notify) {
    const payloadId = currentPayloadId;
    if (current && typeof current.destroy === 'function') {
      try { current.destroy(); } catch (e) { console.warn(e); }
    }
    current = null;
    currentPayloadId = null;
    currentPosition = DEFAULT_POSITION;
    while (root.firstChild) root.removeChild(root.firstChild);
    if (visible) { invoke('hide_popup'); visible = false; }
    if (notify) emitToMain({ type: 'POPUP_CLOSED', payloadId });
  }

  function show(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (!window.PopupRenderer || typeof window.PopupRenderer.render !== 'function') {
      console.error('[popup-host] PopupRenderer missing');
      return;
    }
    // A new popup replaces the one already on screen (like the extension: only 1 popup at a time).
    if (current) teardown(true);
    currentPayloadId = payload.payloadId || null;
    currentPosition = cleanPosition(payload.popupPosition);
    document.documentElement.setAttribute('data-theme', payload.darkMode ? 'dark' : 'light');
    if (window.i18n && typeof window.i18n.setLanguage === 'function' && payload.language) {
      try { window.i18n.setLanguage(payload.language); } catch (_) { /* ignore */ }
    }
    const ctx = {
      send(evt) { emitToMain(Object.assign({ payloadId: currentPayloadId }, evt || {})); },
      close() { teardown(true); },
      requestResize() { scheduleResize(); },
      lang: payload.language || 'en',
      isBrowser: false
    };
    try {
      current = window.PopupRenderer.render(root, payload, ctx) || { destroy() {} };
    } catch (e) {
      console.error('[popup-host] render failed', e);
      teardown(true);
      return;
    }
    // Show it once the layout has settled.
    afterLayout(() => { if (current) applySize(); });
  }

  async function init() {
    await P.ready;
    await T.event.listen('popup:show', (e) => show(e.payload));
    await T.event.listen('popup:hide', () => teardown(true));
    await T.event.listen('popup:ping', () => { T.event.emitTo('main', 'popup:ready', {}).catch(() => {}); });
    // A finished image load can change the height -> measure again.
    root.addEventListener('load', () => { if (current) scheduleResize(); }, true);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) teardown(true); });
    await T.event.emitTo('main', 'popup:ready', {}).catch(() => {});
  }

  init();
})();
