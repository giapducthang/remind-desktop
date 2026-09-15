// popup.js - window.PopupRenderer (DESKTOP-SPEC §5). Ported from the browser extension's content script:
// the reminder popup (showNotification) plus the food & drinks popup with its "loot box" spin reel (showPickerNotification).
// Used in two places: the Tauri popup window (popup-host.js) and the in-page overlay in browser mode (platform.js).
//
// Principles: the payload is UNTRUSTED data -> build with createElement + textContent,
// never innerHTML with dynamic data; images must be https: or data:image/(png|jpeg|webp);base64,; colors go through sanitizeColor;
// string lengths are capped. The renderer NEVER opens a Google Maps URL itself (it sends OPEN_MAPS to main).
//
// Display strings: the local dictionary below (same as the extension's content-script dictionary), selected by payload.language.
// Does NOT depend on i18n.js (popup.html does not load that file).

(function () {
  'use strict';

  if (window.PopupRenderer) return;

  // ---------------------------------------------------------------------------
  // Local i18n
  // ---------------------------------------------------------------------------
  const I18N = {
    en: {
      close: 'Close',
      reminderDialog: 'Reminder',
      pickerDialog: 'Random picker',
      pickerSpin: 'Spin',
      pickerSpinAgain: 'Spin again',
      pickerSpinning: 'Spinning…',
      pickerFindPlaces: 'Find places nearby',
      pickerPriceFilter: 'Price range',
      pickerPriceAll: 'Any price',
      pickerPriceLow: '≤ 30k',
      pickerPriceMid: '30-60k',
      pickerPriceHigh: '60-100k',
      pickerPriceTop: '≥ 100k',
      pickerKeep: 'Sounds good'
    },
    vi: {
      close: 'Đóng',
      reminderDialog: 'Nhắc nhở',
      pickerDialog: 'Bộ chọn ngẫu nhiên',
      pickerSpin: 'Quay',
      pickerSpinAgain: 'Quay lại',
      pickerSpinning: 'Đang quay…',
      pickerFindPlaces: 'Tìm quán gần đây',
      pickerPriceFilter: 'Khoảng giá',
      pickerPriceAll: 'Mọi mức giá',
      pickerPriceLow: '≤ 30k',
      pickerPriceMid: '30-60k',
      pickerPriceHigh: '60-100k',
      pickerPriceTop: '≥ 100k',
      pickerKeep: 'Chốt món này'
    }
  };

  function makeT(lang) {
    const dict = I18N[lang] || I18N.en;
    return function t(key) {
      return dict[key] || I18N.en[key] || key;
    };
  }

  // ---------------------------------------------------------------------------
  // Limits + sanitizing helpers (ported from the extension's content script)
  // ---------------------------------------------------------------------------
  const MAX_MESSAGE = 500;        // reminder.message / versionMessage
  const MAX_NAME = 60;            // item name
  const MAX_PICKER_NAME = 80;     // picker set name
  const MAX_EMOJI = 16;           // emoji (may be a long ZWJ sequence)
  const MAX_ITEMS = 200;          // SERVER_PICKER_ITEM_MAX
  const MAX_URL = 2000;
  const MAX_CREDIT = 160;
  const MAX_DISPLAY_MINUTES_REMINDER = 1440;
  const MAX_DISPLAY_MINUTES_PICKER = 60;
  const HIDE_ANIM_MS = 220;

  const DATA_IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  const MAX_DATA_IMAGE = 200 * 1024;

  function str(v, max) {
    if (typeof v !== 'string') return '';
    return v.length > max ? v.slice(0, max) : v;
  }

  // Only http:/https: is allowed. Returns a normalized href or null.
  function sanitizeUrl(url) {
    if (!url || typeof url !== 'string' || url.length > MAX_URL) return null;
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
      return null;
    } catch (e) {
      return null;
    }
  }

  // Images: https: only, or data:image/... (strict regex).
  function safeImageSrc(src) {
    if (typeof src !== 'string' || !src) return null;
    if (/^data:/i.test(src)) {
      if (src.length > MAX_DATA_IMAGE) return null;
      return DATA_IMAGE_RE.test(src) ? src : null;
    }
    const u = sanitizeUrl(src);
    if (!u) return null;
    try {
      return new URL(u).protocol === 'https:' ? u : null;
    } catch (e) {
      return null;
    }
  }

  // Colors: hex #RGB/#RRGGBB/#RRGGBBAA only; anything else falls back to the default accent color.
  function sanitizeColor(color) {
    if (typeof color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(color)) return color;
    return '#0ea5e9';
  }

  // NOTE: only pass colors that have already been through sanitizeColor.
  function adjustColor(color, amount) {
    let hex = String(color).replace('#', '');
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.slice(0, 3).split('').map((c) => c + c).join('');
    }
    if (hex.length < 6 || /[^0-9a-fA-F]/.test(hex.slice(0, 6))) hex = '0ea5e9';
    const r = Math.min(255, parseInt(hex.substring(0, 2), 16) + amount);
    const g = Math.min(255, parseInt(hex.substring(2, 4), 16) + amount);
    const b = Math.min(255, parseInt(hex.substring(4, 6), 16) + amount);
    return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
  }

  function getCurrentTime(lang) {
    try {
      return new Date().toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      const d = new Date();
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
  }

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function safeSend(ctx, evt) {
    try {
      if (ctx && typeof ctx.send === 'function') ctx.send(evt);
    } catch (e) { /* fire-and-forget */ }
  }

  function requestResize(ctx) {
    try {
      if (ctx && typeof ctx.requestResize === 'function') ctx.requestResize();
    } catch (e) { /* ignore */ }
  }

  function playShowSound(payload) {
    if (payload.soundEnabled === false) return;
    const P = window.Platform;
    if (!P || typeof P.playSound !== 'function') return;
    const vol = (typeof payload.soundVolume === 'number' && isFinite(payload.soundVolume)) ? payload.soundVolume : 100;
    try { P.playSound(vol); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // WebAudio tick for the spin reel (§9.2): oscillators generated on the fly, only when soundEnabled.
  // ---------------------------------------------------------------------------
  let audioCtx = null;

  function ensureAudioContext() {
    try {
      if (audioCtx) return audioCtx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
      return audioCtx;
    } catch (e) {
      return null;
    }
  }

  function playSpinTicks(durationMs, soundEnabled) {
    if (soundEnabled === false) return function () {};
    try {
      const ctx = ensureAudioContext();
      if (!ctx) return function () {};
      if (ctx.state === 'suspended' && ctx.resume) { try { ctx.resume(); } catch (e) { /* ignore */ } }
      const nodes = [];
      let elapsed = 0;
      while (elapsed < durationMs - 90 && nodes.length < 60) {
        const at = ctx.currentTime + elapsed / 1000;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1150, at);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.035, at + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.05);
        nodes.push(osc);
        const t = elapsed / durationMs;
        elapsed += 42 + t * t * 260; // widening gaps -> sounds like it is slowing down
      }
      return function () {
        for (const n of nodes) { try { n.stop(); } catch (e) { /* ignore */ } }
      };
    } catch (e) {
      return function () {};
    }
  }

  // ---------------------------------------------------------------------------
  // Shared frame: root card + modal + close button + clock + progress bar + auto-close (paused on hover) + Esc
  // ---------------------------------------------------------------------------
  function buildDismissButton(t) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hrn-dismiss';
    btn.title = t('close');
    btn.setAttribute('aria-label', t('close'));
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', 'M18 6L6 18M6 6l12 12');
    svg.appendChild(path);
    btn.appendChild(svg);
    return btn;
  }

  function buildVersionMessage(payload, lang) {
    const versionMessage = str(payload.versionMessage, MAX_MESSAGE);
    if (!versionMessage) return null;
    const safeUrl = sanitizeUrl(payload.versionUrl);
    let node;
    if (safeUrl) {
      node = document.createElement('a');
      node.href = safeUrl;
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
      node.addEventListener('click', (e) => {
        e.preventDefault();
        const P = window.Platform;
        if (P && typeof P.openExternal === 'function') {
          try { P.openExternal(safeUrl); } catch (err) { /* ignore */ }
        }
      });
    } else {
      node = document.createElement('span');
    }
    node.className = 'hrn-version-message';
    node.textContent = versionMessage;
    return node;
  }

  /**
   * Build the shared popup frame. Returns { root, modal, progressBar, timeEl, dismissBtn, start(), close(), destroy(), onCleanup(fn) }.
   * displayMinutes: how many minutes to stay visible (already validated). lowPerf: bool.
   */
  function createFrame(container, payload, ctx, opts) {
    const t = opts.t;
    const root = el('div', 'health-reminder-notification ' + (payload.darkMode === true ? 'dark' : 'light'));
    if (opts.extraClass) root.classList.add(opts.extraClass);
    if (opts.lowPerf) root.classList.add('low-perf');

    const modal = el('div', 'hrn-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', opts.ariaLabel || t('reminderDialog'));
    root.appendChild(modal);

    const timeEl = el('span', 'hrn-time', getCurrentTime(opts.lang));
    const dismissBtn = buildDismissButton(t);
    const progress = el('div', 'hrn-progress');
    const progressBar = el('div', 'hrn-progress-bar');
    progress.appendChild(progressBar);

    const displayMs = opts.displayMinutes * 60 * 1000;
    progressBar.style.animationDuration = (opts.displayMinutes * 60) + 's';

    let closed = false;
    let destroyed = false;
    let dismissTimeout = null;
    let dismissStartAt = 0;
    let remainingMs = displayMs;
    let hideTimer = null;
    const cleanups = [];

    function clearDismissTimer() {
      if (dismissTimeout) { clearTimeout(dismissTimeout); dismissTimeout = null; }
    }

    function startDismissTimer(ms) {
      dismissStartAt = Date.now();
      remainingMs = ms;
      dismissTimeout = setTimeout(() => { dismissTimeout = null; close(); }, ms);
    }

    function runCleanups() {
      while (cleanups.length) {
        const fn = cleanups.pop();
        try { fn(); } catch (e) { /* ignore */ }
      }
    }

    // Close the popup: a short fade-out, then notify the host (ctx.close). Idempotent.
    function close() {
      if (closed) return;
      closed = true;
      clearDismissTimer();
      runCleanups();
      root.classList.remove('show');
      root.classList.add('hide');
      const finish = () => {
        hideTimer = null;
        try { if (ctx && typeof ctx.close === 'function') ctx.close(); } catch (e) { /* ignore */ }
      };
      if (opts.lowPerf || prefersReducedMotion()) finish();
      else hideTimer = setTimeout(finish, HIDE_ANIM_MS);
    }

    // Called by the host when tearing down the popup (may come after ctx.close or directly). Idempotent.
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      closed = true;
      clearDismissTimer();
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      runCleanups();
      document.removeEventListener('keydown', onKeydown);
      try { while (container.firstChild) container.removeChild(container.firstChild); } catch (e) { /* ignore */ }
    }

    function onKeydown(e) {
      if (e.key === 'Escape' && !closed) {
        e.preventDefault();
        close();
      }
    }

    dismissBtn.addEventListener('click', () => close());

    modal.addEventListener('mouseenter', () => {
      root.classList.add('paused');
      if (dismissTimeout) {
        const elapsed = Date.now() - dismissStartAt;
        remainingMs = Math.max(0, remainingMs - elapsed);
        clearDismissTimer();
      }
    });
    modal.addEventListener('mouseleave', () => {
      root.classList.remove('paused');
      if (!dismissTimeout && !closed) startDismissTimer(remainingMs > 0 ? remainingMs : displayMs);
    });

    // Attach the frame to the container, show it (adding .show on the next frame), start the countdown, play the sound.
    function start() {
      modal.appendChild(timeEl);
      modal.appendChild(dismissBtn);
      modal.appendChild(progress);
      while (container.firstChild) container.removeChild(container.firstChild);
      container.appendChild(root);
      void root.offsetHeight; // force a reflow so the opacity transition runs
      document.addEventListener('keydown', onKeydown);
      cleanups.push(() => document.removeEventListener('keydown', onKeydown));
      safeSend(ctx, { type: 'POPUP_DISPLAYED', kind: opts.kind });
      playShowSound(payload);
      setTimeout(() => { if (!closed) root.classList.add('show'); }, 10);
      startDismissTimer(displayMs);
      requestResize(ctx);
    }

    return {
      root,
      modal,
      progressBar,
      start,
      close,
      destroy,
      onCleanup(fn) { if (typeof fn === 'function') cleanups.push(fn); },
      isClosed() { return closed; }
    };
  }

  // ---------------------------------------------------------------------------
  // REMINDER POPUP
  // ---------------------------------------------------------------------------
  function renderReminder(container, payload, ctx, lang, t) {
    const reminder = (payload.reminder && typeof payload.reminder === 'object') ? payload.reminder : {};
    const message = str(reminder.message, MAX_MESSAGE);
    const icon = str(reminder.icon, MAX_EMOJI) || '💧';
    const safeColor = sanitizeColor(reminder.color);
    const safeColor2 = adjustColor(safeColor, 30);

    let displayMinutes = 1;
    if (typeof reminder.displayMinutes === 'number' && isFinite(reminder.displayMinutes) && reminder.displayMinutes > 0) {
      displayMinutes = Math.min(MAX_DISPLAY_MINUTES_REMINDER, reminder.displayMinutes);
    }

    // Image: versionStatus === 'all' -> the server image; otherwise the reminder's own image. https only.
    let displayImage = '';
    if (payload.versionStatus === 'all' && typeof payload.versionImage === 'string' && payload.versionImage) {
      displayImage = payload.versionImage;
    } else if (payload.versionStatus !== 'all' && typeof reminder.imageUrl === 'string' && reminder.imageUrl) {
      displayImage = reminder.imageUrl;
    }
    let safeImageUrl = null;
    if (displayImage) {
      const u = sanitizeUrl(displayImage);
      if (u) { try { safeImageUrl = new URL(u).protocol === 'https:' ? u : null; } catch (e) { safeImageUrl = null; } }
    }

    const frame = createFrame(container, payload, ctx, {
      t, lang, kind: 'reminder', displayMinutes,
      lowPerf: payload.lowPerfMode === true,
      ariaLabel: t('reminderDialog')
    });
    const root = frame.root;
    const modal = frame.modal;
    if (safeImageUrl) root.classList.add('with-image');

    // Icon + pulse
    const iconWrap = el('div', 'hrn-icon-wrapper');
    iconWrap.appendChild(el('span', 'hrn-icon', icon));
    const pulse = el('div', 'hrn-pulse');
    pulse.style.background = 'linear-gradient(135deg, ' + safeColor + ', ' + safeColor2 + ')';
    iconWrap.appendChild(pulse);
    modal.appendChild(iconWrap);

    // Content
    const content = el('div', 'hrn-content');
    const title = el('p', 'hrn-title', message);
    title.style.color = safeColor;
    content.appendChild(title);

    if (safeImageUrl) {
      const wrap = el('div', 'hrn-image-wrapper');
      const img = document.createElement('img');
      img.className = 'hrn-version-image';
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.addEventListener('error', () => {
        wrap.hidden = true;
        wrap.style.display = 'none';
        root.classList.remove('with-image');
        requestResize(ctx);
      }, { once: true });
      img.addEventListener('load', () => requestResize(ctx), { once: true });
      img.src = safeImageUrl;
      wrap.appendChild(img);
      content.appendChild(wrap);
    }

    const versionEl = buildVersionMessage(payload, lang);
    if (versionEl) content.appendChild(versionEl);
    modal.appendChild(content);

    frame.progressBar.style.background = 'linear-gradient(90deg, ' + safeColor + ', ' + safeColor2 + ')';

    frame.start();
    return { destroy: frame.destroy };
  }

  // ---------------------------------------------------------------------------
  // FOOD & DRINKS POPUP (picker) - "loot box" spin reel (§9), price ranges (§13), large result (§12)
  // ---------------------------------------------------------------------------
  const PICKER_SPIN_MS = 2600;
  const PICKER_SPIN_EASING = 'cubic-bezier(.15,.85,.25,1)';
  const PICKER_REEL_TILES = 48;
  const PICKER_WINNER_INDEX = 44;

  const PICKER_PRICE_BUCKETS = [
    { id: 'low', min: 0, max: 30000, key: 'pickerPriceLow' },
    { id: 'mid', min: 30000, max: 60000, key: 'pickerPriceMid' },
    { id: 'high', min: 60000, max: 100000, key: 'pickerPriceHigh' },
    { id: 'top', min: 100000, max: Infinity, key: 'pickerPriceTop' }
  ];

  function cleanPrice(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(100000000, Math.floor(n));
  }

  // Sanitize one item from the payload (untrusted). Returns null if it is not valid.
  function cleanItem(it) {
    if (!it || typeof it !== 'object') return null;
    const name = str(it.name, MAX_NAME);
    if (!name) return null;
    let min = cleanPrice(it.priceMin);
    let max = cleanPrice(it.priceMax);
    if (min && max && min > max) { min = 0; max = 0; }
    return {
      id: (typeof it.id === 'string' || typeof it.id === 'number') ? String(it.id).slice(0, 80) : '',
      name,
      emoji: str(it.emoji, MAX_EMOJI),
      image: safeImageSrc(it.image) || '',
      imageCredit: str(it.imageCredit, MAX_CREDIT),
      priceMin: min,
      priceMax: max
    };
  }

  function pickerPriceUnit(value) {
    const v = Number(value) || 0;
    if (!v) return '';
    return v % 1000 === 0 ? Math.round(v / 1000) + 'k' : String(v);
  }

  function pickerPriceText(item) {
    const min = Number(item && item.priceMin) || 0;
    const max = Number(item && item.priceMax) || 0;
    if (!min && !max) return '';
    if (!max || min === max) return pickerPriceUnit(min || max);
    return pickerPriceUnit(min).replace(/k$/, '') + '-' + pickerPriceUnit(max);
  }

  // An item belongs to a price range when its own range OVERLAPS that range; items with no price set belong only to "any price".
  function pickerItemInBucket(item, bucket) {
    const min = Number(item && item.priceMin) || 0;
    const max = Number(item && item.priceMax) || min;
    if (!min && !max) return false;
    return min < bucket.max && max >= bucket.min;
  }

  function buildPickerTile(item) {
    const tile = el('div', 'hrn-picker-tile');
    const media = el('div', 'hrn-picker-tile-media');
    const emoji = el('span', 'hrn-picker-tile-emoji', item.emoji || '🍽️');
    media.appendChild(emoji);
    if (item.image) {
      const img = document.createElement('img');
      img.className = 'hrn-picker-tile-image';
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      if (item.imageCredit) img.title = item.imageCredit;
      img.addEventListener('error', () => { img.remove(); emoji.hidden = false; }, { once: true });
      emoji.hidden = true;
      img.src = item.image;
      media.appendChild(img);
    }
    tile.appendChild(media);
    tile.appendChild(el('span', 'hrn-picker-tile-name', item.name));
    return tile;
  }

  // Build the strip of tiles for the reel: NEVER two identical tiles side by side (§9.1). Anchor on the winning tile and grow outwards.
  function buildPickerSequence(items, winner, count, winnerIndex) {
    const seq = new Array(count);
    const pickDifferent = (from) => {
      const pool = items.filter((it) => it !== from);
      const src = pool.length > 0 ? pool : items;
      return src[Math.floor(Math.random() * src.length)];
    };
    if (winner && winnerIndex >= 0 && winnerIndex < count) {
      seq[winnerIndex] = winner;
      for (let i = winnerIndex - 1; i >= 0; i--) seq[i] = pickDifferent(seq[i + 1]);
      for (let i = winnerIndex + 1; i < count; i++) seq[i] = pickDifferent(seq[i - 1]);
    } else {
      seq[0] = items[Math.floor(Math.random() * items.length)];
      for (let i = 1; i < count; i++) seq[i] = pickDifferent(seq[i - 1]);
    }
    return seq;
  }

  function renderPicker(container, payload, ctx, lang, t) {
    const picker = (payload.picker && typeof payload.picker === 'object') ? payload.picker : {};
    const pickerId = (typeof picker.id === 'string' || typeof picker.id === 'number') ? String(picker.id).slice(0, 80) : '';
    const pickerName = str(picker.name, MAX_PICKER_NAME);
    const pickerIcon = str(picker.icon, MAX_EMOJI) || '🍽️';
    const lowPerf = payload.lowPerfMode === true;
    const soundEnabled = payload.soundEnabled !== false;

    const allItems = (Array.isArray(payload.items) ? payload.items : [])
      .slice(0, MAX_ITEMS)
      .map(cleanItem)
      .filter(Boolean);
    const preItem = cleanItem(payload.item);

    let items = allItems;      // the list currently used for spinning (may already be filtered by price)
    let priceBucket = null;    // null = any price
    let current = null;
    let firstSpin = true;
    let spinning = false;
    let spinTimer = null;
    let stopTicks = null;

    let displayMinutes = 1;
    if (typeof picker.displayMinutes === 'number' && isFinite(picker.displayMinutes) && picker.displayMinutes > 0) {
      displayMinutes = Math.min(MAX_DISPLAY_MINUTES_PICKER, picker.displayMinutes);
    }

    const frame = createFrame(container, payload, ctx, {
      t, lang, kind: 'picker', displayMinutes, lowPerf,
      extraClass: 'hrn-picker',
      ariaLabel: pickerName || t('pickerDialog')
    });
    const root = frame.root;
    const modal = frame.modal;
    modal.setAttribute('aria-modal', 'true');

    // --- Set name (small, secondary)
    const head = el('div', 'hrn-picker-head');
    head.appendChild(el('span', 'hrn-picker-head-icon', pickerIcon));
    head.appendChild(el('span', 'hrn-picker-head-name', pickerName));
    modal.appendChild(head);

    // --- Price range chip row (§13)
    const priceBar = el('div', 'hrn-picker-prices');
    priceBar.setAttribute('role', 'group');
    priceBar.setAttribute('aria-label', t('pickerPriceFilter'));
    modal.appendChild(priceBar);

    // --- Spin reel
    const reelWrap = el('div', 'hrn-picker-reel');
    const strip = el('div', 'hrn-picker-strip');
    const marker = el('div', 'hrn-picker-marker');
    marker.setAttribute('aria-hidden', 'true');
    reelWrap.appendChild(strip);
    reelWrap.appendChild(marker);
    modal.appendChild(reelWrap);

    // --- Hero (§12) + item name + price range
    const hero = el('div', 'hrn-picker-hero');
    hero.hidden = true;
    modal.appendChild(hero);
    const title = el('p', 'hrn-title hrn-picker-item-name');
    title.setAttribute('aria-live', 'polite');
    modal.appendChild(title);
    const priceEl = el('div', 'hrn-picker-price');
    priceEl.hidden = true;
    modal.appendChild(priceEl);

    // --- Message from the server
    const versionEl = buildVersionMessage(payload, lang);
    if (versionEl) modal.appendChild(versionEl);

    // --- Action buttons
    const actions = el('div', 'hrn-picker-actions');
    const btnSpin = document.createElement('button');
    btnSpin.type = 'button';
    btnSpin.className = 'hrn-btn hrn-btn-primary hrn-picker-spin';
    btnSpin.textContent = t('pickerSpin');
    const btnMaps = document.createElement('button');
    btnMaps.type = 'button';
    btnMaps.className = 'hrn-btn hrn-btn-secondary hrn-picker-maps';
    btnMaps.textContent = t('pickerFindPlaces');
    btnMaps.hidden = true;
    const btnKeep = document.createElement('button');
    btnKeep.type = 'button';
    btnKeep.className = 'hrn-btn hrn-btn-primary hrn-picker-keep';
    btnKeep.textContent = t('pickerKeep');
    btnKeep.hidden = true;
    actions.appendChild(btnSpin);
    actions.appendChild(btnMaps);
    actions.appendChild(btnKeep);
    modal.appendChild(actions);

    function buildStrip(seq) {
      strip.style.transition = 'none';
      strip.style.transform = 'translate3d(0,0,0)';
      while (strip.firstChild) strip.removeChild(strip.firstChild);
      for (const it of seq) strip.appendChild(buildPickerTile(it));
    }

    function applyPhase(phase) {
      root.classList.remove('picker-idle', 'picker-spinning', 'picker-result');
      root.classList.add('picker-' + phase);
      if (phase === 'spinning') {
        btnSpin.textContent = t('pickerSpinning');
        btnSpin.setAttribute('aria-disabled', 'true');
      } else {
        btnSpin.removeAttribute('aria-disabled');
        if (phase === 'idle') {
          btnSpin.textContent = t('pickerSpin');
          btnSpin.className = 'hrn-btn hrn-btn-primary hrn-picker-spin';
          btnKeep.hidden = true;
          btnMaps.hidden = true;
        } else {
          btnSpin.textContent = t('pickerSpinAgain');
          btnSpin.className = 'hrn-btn hrn-btn-secondary hrn-picker-spin';
          btnKeep.hidden = false;
          btnMaps.hidden = false;
        }
      }
      requestResize(ctx);
    }

    // The result is chosen BEFORE the animation. The first spin uses payload.item (unless the price range changed), after that it draws at random, avoiding the previous result.
    function chooseWinner() {
      if (firstSpin) {
        firstSpin = false;
        if (preItem) {
          const match = preItem.id ? items.find((it) => it.id && it.id === preItem.id) : null;
          if (match) return match;
          if (items.length === 0) return preItem;
          // The preselected item is not in the list -> use it anyway (same as the extension)
          return preItem;
        }
      }
      if (items.length === 0) return null;
      if (items.length === 1) return items[0];
      let pool = items;
      if (current) {
        const others = items.filter((it) => it !== current && !(it.id && current.id && it.id === current.id));
        if (others.length > 0) pool = others;
      }
      return pool[Math.floor(Math.random() * pool.length)];
    }

    function renderHero(item) {
      while (hero.firstChild) hero.removeChild(hero.firstChild);
      const price = item ? pickerPriceText(item) : '';
      priceEl.textContent = price;
      priceEl.hidden = !price;
      if (!item) { hero.hidden = true; return; }
      if (item.image) {
        const img = document.createElement('img');
        img.className = 'hrn-picker-hero-img';
        img.alt = '';
        img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        if (item.imageCredit) img.title = item.imageCredit;
        img.addEventListener('error', () => {
          // Image failed to load -> fall back to the emoji (do not hide the hero, so the layout stays stable)
          img.remove();
          if (!hero.firstChild) hero.appendChild(buildHeroEmoji(item));
          requestResize(ctx);
        }, { once: true });
        img.addEventListener('load', () => requestResize(ctx), { once: true });
        img.src = item.image;
        hero.appendChild(img);
      } else {
        hero.appendChild(buildHeroEmoji(item));
      }
      hero.hidden = false;
    }

    function buildHeroEmoji(item) {
      const emoji = el('span', 'hrn-picker-hero-emoji', item.emoji || pickerIcon);
      emoji.setAttribute('aria-hidden', 'true');
      return emoji;
    }

    function finishSpin(winner, winnerIndex) {
      spinning = false;
      spinTimer = null;
      if (stopTicks) { stopTicks(); stopTicks = null; }
      if (frame.isClosed()) return;
      current = winner;
      const winTile = strip.children[winnerIndex];
      if (winTile) winTile.classList.add('is-winner');
      title.textContent = winner.name;
      renderHero(winner);
      applyPhase('result');
      if (pickerId && winner.id) {
        safeSend(ctx, { type: 'PICKER_PICKED', pickerId, itemId: winner.id });
      }
    }

    function spin() {
      if (spinning || frame.isClosed()) return;
      const winner = chooseWinner();
      if (!winner) return;

      spinning = true;
      title.textContent = '';
      renderHero(null);
      applyPhase('spinning');
      if (spinTimer) { clearTimeout(spinTimer); spinTimer = null; }
      if (stopTicks) { stopTicks(); stopTicks = null; }

      const reduced = prefersReducedMotion() || lowPerf;
      if (reduced || items.length < 2) {
        buildStrip([winner]);
        spinTimer = setTimeout(() => finishSpin(winner, 0), reduced ? 120 : 0);
        return;
      }

      buildStrip(buildPickerSequence(items, winner, PICKER_REEL_TILES, PICKER_WINNER_INDEX));

      const winTile = strip.children[PICKER_WINNER_INDEX];
      const wrapW = reelWrap.clientWidth || 320;
      const tileW = (winTile && winTile.offsetWidth) || 92;
      const frac = 0.1 + Math.random() * 0.8; // stop at 10-90% across the tile width
      const point = (winTile ? winTile.offsetLeft : 0) + tileW * frac;
      const tx = Math.round(wrapW / 2 - point);

      void strip.offsetWidth; // force a reflow so the transition starts from position 0
      strip.style.transition = 'transform ' + PICKER_SPIN_MS + 'ms ' + PICKER_SPIN_EASING;
      strip.style.transform = 'translate3d(' + tx + 'px,0,0)';

      stopTicks = playSpinTicks(PICKER_SPIN_MS, soundEnabled);
      // The timeout is the source of truth (do not rely on transitionend).
      spinTimer = setTimeout(() => finishSpin(winner, PICKER_WINNER_INDEX), PICKER_SPIN_MS + 60);
    }

    function buildIdleStrip() {
      if (items.length > 1) buildStrip(buildPickerSequence(items, null, PICKER_REEL_TILES, -1));
      else if (items.length === 1) buildStrip([items[0]]);
      else buildStrip([]);
    }

    function applyPriceBucket(bucket) {
      priceBucket = bucket;
      items = bucket ? allItems.filter((it) => pickerItemInBucket(it, bucket)) : allItems;
      firstSpin = false; // the preselected item may fall outside the price range
      current = null;
      renderHero(null);
      title.textContent = '';
      buildIdleStrip();
      applyPhase('idle');
      paintPriceBar();
    }

    function paintPriceBar() {
      while (priceBar.firstChild) priceBar.removeChild(priceBar.firstChild);
      const usable = PICKER_PRICE_BUCKETS.filter((b) => allItems.some((it) => pickerItemInBucket(it, b)));
      if (usable.length < 2) { priceBar.hidden = true; return; }
      priceBar.hidden = false;
      const mk = (bucket, label) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hrn-picker-price-chip' + (priceBucket === bucket ? ' is-on' : '');
        btn.textContent = label;
        btn.setAttribute('aria-pressed', String(priceBucket === bucket));
        btn.addEventListener('click', () => { if (priceBucket !== bucket && !spinning) applyPriceBucket(bucket); });
        return btn;
      };
      priceBar.appendChild(mk(null, t('pickerPriceAll')));
      usable.forEach((b) => priceBar.appendChild(mk(b, t(b.key))));
    }

    btnSpin.addEventListener('click', () => { if (!spinning) spin(); });

    // "Find places nearby": send the ITEM NAME only, main builds the Google Maps URL itself (§10.5).
    btnMaps.addEventListener('click', () => {
      const name = (current && typeof current.name === 'string') ? current.name.slice(0, 200) : '';
      if (!name) return;
      safeSend(ctx, { type: 'OPEN_MAPS', query: name });
    });

    btnKeep.addEventListener('click', () => frame.close());

    frame.onCleanup(() => {
      if (spinTimer) { clearTimeout(spinTimer); spinTimer = null; }
      if (stopTicks) { stopTicks(); stopTicks = null; }
      spinning = false;
    });

    paintPriceBar();
    buildIdleStrip();
    applyPhase('idle');

    frame.start();
    return { destroy: frame.destroy };
  }

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------
  function render(container, payload, ctx) {
    if (!container || typeof container.appendChild !== 'function') {
      throw new Error('PopupRenderer.render: container required');
    }
    const p = (payload && typeof payload === 'object') ? payload : {};
    const c = (ctx && typeof ctx === 'object') ? ctx : {};
    const langRaw = (typeof p.language === 'string' && p.language) ? p.language : (typeof c.lang === 'string' ? c.lang : 'en');
    const lang = langRaw === 'vi' ? 'vi' : 'en';
    const t = makeT(lang);
    const kind = p.kind === 'picker' || (!p.kind && p.picker) ? 'picker' : 'reminder';
    if (kind === 'picker') return renderPicker(container, p, c, lang, t);
    return renderReminder(container, p, c, lang, t);
  }

  window.PopupRenderer = {
    render,
    // Exported for tests (node:test) - not used by the UI.
    _internal: { sanitizeUrl, sanitizeColor, adjustColor, safeImageSrc, pickerPriceText, pickerItemInBucket, buildPickerSequence, PICKER_PRICE_BUCKETS, I18N }
  };
})();
