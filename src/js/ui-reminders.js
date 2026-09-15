// ui-reminders.js - Reminders tab (renderReminders/openReminderModal/saveReminder... ported from the browser extension's side panel).
// Differences from the extension: every card has an on/off switch (reminder.enabled), there is an "Upcoming" block fed by Scheduler.getUpcoming(),
// saving goes through Platform.storage and then calls Scheduler.rebuild(); preview calls Scheduler.previewReminder().
// Exports: window.UIReminders = { init(), render(), openModal(reminder) }.

(function () {
  'use strict';

  if (window.UIReminders) return;

  const MAX_SCHEDULED = 500;      // LG-10: cap on the number of dateRange slots (same as the extension)
  const UPCOMING_COUNT = 3;
  const UPCOMING_REFRESH_MS = 60 * 1000;
  const VALID_IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'];

  const EMOJI_DATA = {
    smileys: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😋','😛','😜','🤪','😝','🤗','🤔','😐','😑','😶','😏','😒','🙄','😬','😌','😴','🤒','🤕','🤢','🤮','🥵','🥶','😱','😨','😰','😥','😭','😤','😡','🤬','😈','💀','💩','🤡','👻','👽','🤖'],
    people: ['👋','🤚','✋','🖖','👌','🤏','✌','🤞','🤟','🤘','🤙','👈','👉','👆','👇','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦾','🦵','🦶','👂','👃','🧠','👀','👅','👄','👶','🧒','👦','👧','🧑','👨','👩','🧓','👴','👵'],
    nature: ['🌿','🍀','🍁','🍂','🍃','🌺','🌻','🌹','🥀','🌷','🌼','🌸','💐','🌵','🌴','🌳','🌲','🌊','🌈','☀','🌤','⛅','☁','🌧','❄','☃','💧','🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🦆','🦅','🦉'],
    food: ['🍔','🍟','🍕','🌭','🥪','🌮','🌯','🍳','🥘','🍲','🥗','🍿','🍝','🍜','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍧','🍨','🍦','🍰','🎂','🍭','🍬','🍫','🍩','🍪','☕','🍵','🥤','🍺','🍻','🥂','🍷','🍇','🍈','🍉','🍊','🍋','🍌','🍍','🍎','🍏','🍐','🍑','🍒','🍓'],
    activities: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🏒','⛳','🏹','🎣','🥊','🥋','🎽','🛹','🎿','🏂','🏋','🤸','🏇','🏊','🚣','🧗','🚴','🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🎻','🎲','🎯','🎳','🎮','🧩'],
    travel: ['🚗','🚕','🚙','🚌','🚓','🚑','🚒','🚐','🚚','🚜','🚲','🛵','🚨','🚃','🚄','🚅','🚂','🚆','🚇','✈','🚀','🛸','🚁','⛵','🚤','🚢','🗺','🗿','🗽','🗼','🏰','🏯','🎡','🎢','🏠','🏡','🏢','🏥','🏦','🏨','🏪','🏫','⛪'],
    objects: ['💡','🔦','📱','💻','🖥','💽','💾','💿','📀','🎥','📺','📷','📸','🔍','📔','📕','📖','📗','📘','📙','📚','📓','📝','💰','💴','💵','💶','💷','💳','✉','📧','📦','📫','✏','🖊','📌','📍','📎','🔒','🔓','🔑','🔨','🔧','💉','💊'],
    symbols: ['❤','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','💕','💞','💓','💗','💖','💘','💝','☮','✝','☪','🕉','☸','✡','☯','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛','☢','☣','📴','📳','🆚','💯','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪']
  };

  const TREND_COLORS = [
    '#FF6B6B','#EE5A5A','#FF8787','#FA5252','#E03131','#F06595','#E64980','#D6336C',
    '#FF922B','#FD7E14','#E8590C','#FFD43B','#FCC419','#FAB005','#F59F00',
    '#8CE99A','#69DB7C','#51CF66','#40C057','#37B24D','#20C997','#12B886',
    '#74C0FC','#4DABF7','#339AF0','#228BE6','#1C7ED6','#22B8CF','#15AABF',
    '#B197FC','#9775FA','#845EF7','#7950F2','#7048E8','#DA77F2','#CC5DE8','#BE4BDB',
    '#868E96','#495057','#343A40','#212529','#0EA5E9','#8B5CF6','#EC4899','#14B8A6','#F97316','#EAB308','#22C55E','#EF4444'
  ];

  let reminders = [];
  let currentDetailReminder = null;
  let upcomingTimer = null;
  let initialized = false;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function A() { return window.App; }
  function P() { return window.Platform; }
  function t(key) { return A() ? A().t(key) : key; }
  function toast(msg, type) { if (A()) A().showToast(msg, type); }
  function safeColor(c) { return A() ? A().safeColor(c) : '#0ea5e9'; }
  function $(id) { return document.getElementById(id); }
  function locale() { return (window.i18n && window.i18n.currentLang === 'vi') ? 'vi-VN' : 'en-US'; }
  function dayNames() { return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((k) => t(k)); }

  function localDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  async function loadReminders() {
    try {
      const r = await P().storage.get(['reminders']);
      reminders = Array.isArray(r.reminders) ? r.reminders : [];
    } catch (e) { reminders = []; }
    return reminders;
  }

  let selfWriting = false;

  async function persist() {
    selfWriting = true;
    try { await P().storage.set({ reminders }); } finally { selfWriting = false; }
    if (window.Scheduler && typeof window.Scheduler.rebuild === 'function') {
      try { await window.Scheduler.rebuild(); } catch (e) { console.error('[UIReminders] Scheduler.rebuild', e); }
    }
  }

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------
  function formatReminderTimeDetail(reminder) {
    const loc = locale();
    const names = dayNames();
    if (reminder.type === 'interval') {
      return t('repeatEvery') + ' ' + (reminder.interval || 0) + ' ' + t('minutes');
    }
    if (reminder.type === 'dateRange' && reminder.dateRangeSettings) {
      const s = reminder.dateRangeSettings;
      const fromDate = new Date(s.fromDate);
      const toDate = new Date(s.toDate);
      const fromStr = isNaN(fromDate) ? '' : fromDate.toLocaleDateString(loc, { day: '2-digit', month: '2-digit' });
      const toStr = isNaN(toDate) ? '' : toDate.toLocaleDateString(loc, { day: '2-digit', month: '2-digit' });
      const daysStr = Array.isArray(s.selectedDays) ? s.selectedDays.map((d) => names[d]).filter(Boolean).join(', ') : '';
      const times = Array.isArray(s.times) ? s.times : (s.time ? [s.time] : []);
      return fromStr + ' → ' + toStr + ' | ' + daysStr + ' | ' + times.join(', ');
    }
    if (reminder.type === 'scheduled' && Array.isArray(reminder.scheduledTimes) && reminder.scheduledTimes.length > 0) {
      const times = reminder.scheduledTimes.slice(0, 3).map((st) => {
        if (st.date) {
          const d = new Date(st.date + 'T' + st.time);
          return (isNaN(d) ? st.date : d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit' })) + ' ' + st.time;
        }
        return st.time;
      });
      return times.join(', ') + (reminder.scheduledTimes.length > 3 ? '...' : '');
    }
    return '';
  }

  function badgeText(r) {
    if (r.type === 'interval') return '🔁 ' + (parseInt(r.interval, 10) || 0) + 'm';
    if (r.type === 'dateRange') return '📅 ' + ((r.scheduledTimes && r.scheduledTimes.length) || 0);
    return '⏰ ' + ((r.scheduledTimes && r.scheduledTimes.length) || 0);
  }

  function buildCard(r) {
    const enabled = r.enabled !== false;
    const card = el('div', 'reminder-card' + (enabled ? '' : ' reminder-off'));
    card.dataset.id = r.id;

    const header = el('div', 'reminder-header');
    const icon = el('div', 'reminder-icon');
    const iconSpan = el('span', '', r.icon || '🔔');
    iconSpan.style.color = safeColor(r.color);
    icon.appendChild(iconSpan);
    header.appendChild(icon);

    const content = el('div', 'reminder-content');
    const message = el('div', 'reminder-message', r.message || '');
    message.style.color = safeColor(r.color);
    content.appendChild(message);
    const timeInfo = formatReminderTimeDetail(r);
    if (timeInfo) content.appendChild(el('div', 'reminder-time-detail', timeInfo));
    content.addEventListener('click', () => showReminderDetail(r));
    header.appendChild(content);

    // Per-reminder on/off switch (the desktop app honours reminder.enabled)
    const toggle = el('label', 'toggle reminder-toggle');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = enabled;
    input.setAttribute('aria-label', t('reminderEnabledAria'));
    input.title = t('reminderEnabledAria');
    input.setAttribute('data-i18n-aria', 'reminderEnabledAria');
    input.setAttribute('data-i18n-title', 'reminderEnabledAria');
    const slider = el('span', 'toggle-slider');
    toggle.appendChild(input);
    toggle.appendChild(slider);
    input.addEventListener('change', async () => {
      const target = reminders.find((x) => x.id === r.id);
      if (!target) return;
      target.enabled = input.checked;
      card.classList.toggle('reminder-off', !input.checked);
      await persist();
      renderUpcoming();
    });
    header.appendChild(toggle);
    card.appendChild(header);

    const footer = el('div', 'reminder-footer');
    const meta = el('div', 'reminder-meta');
    meta.appendChild(el('span', 'reminder-tag', badgeText(r)));
    meta.appendChild(el('span', 'reminder-tag', '⏱️ ' + (parseInt(r.displayMinutes, 10) || 1) + 'm'));
    if (!enabled) meta.appendChild(el('span', 'reminder-tag', '⏸ ' + t('reminderOff')));
    footer.appendChild(meta);

    const actions = el('div', 'reminder-actions');
    const editBtn = el('button', 'btn-icon-sm btn-edit-reminder', '✏️');
    editBtn.type = 'button';
    editBtn.title = t('edit');
    editBtn.setAttribute('aria-label', t('edit'));
    editBtn.setAttribute('data-i18n-title', 'edit');
    editBtn.setAttribute('data-i18n-aria', 'edit');
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); openReminderModal(reminders.find((x) => x.id === r.id) || null); });
    const delBtn = el('button', 'btn-icon-sm btn-delete-reminder', '🗑️');
    delBtn.type = 'button';
    delBtn.title = t('delete');
    delBtn.setAttribute('aria-label', t('delete'));
    delBtn.setAttribute('data-i18n-title', 'delete');
    delBtn.setAttribute('data-i18n-aria', 'delete');
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!(await A().showConfirm(t('confirmDeleteReminder')))) return;
      reminders = reminders.filter((x) => x.id !== r.id);
      await persist();
      renderList();
      renderUpcoming();
      toast(t('reminderDeleted'), 'success');
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    footer.appendChild(actions);
    card.appendChild(footer);
    return card;
  }

  function renderList() {
    const container = $('remindersList');
    const emptyState = $('emptyReminders');
    if (!container || !emptyState) return;
    container.textContent = '';
    if (!reminders.length) {
      container.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }
    container.style.display = 'flex';
    emptyState.style.display = 'none';
    reminders.forEach((r) => container.appendChild(buildCard(r)));
  }

  // ---------------------------------------------------------------------------
  // Upcoming (Scheduler.getUpcoming)
  // ---------------------------------------------------------------------------
  function formatUpcomingWhen(at) {
    const d = new Date(at);
    if (isNaN(d)) return '';
    const loc = locale();
    const time = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    if (localDateStr(d) === localDateStr(now)) return time;
    if (localDateStr(d) === localDateStr(tomorrow)) return t('upcomingTomorrow') + ' ' + time;
    return d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit' }) + ' ' + time;
  }

  function renderUpcoming() {
    const section = $('upcomingSection');
    const list = $('upcomingList');
    if (!section || !list) return;
    const S = window.Scheduler;
    if (!S || typeof S.getUpcoming !== 'function') { section.hidden = true; return; }
    // getUpcoming may be synchronous or return a Promise (scheduler.js)
    Promise.resolve()
      .then(() => S.getUpcoming(UPCOMING_COUNT))
      .then((items) => paintUpcoming(section, list, Array.isArray(items) ? items : []))
      .catch((e) => { console.warn('[UIReminders] getUpcoming', e); section.hidden = true; });
  }

  function paintUpcoming(section, list, items) {
    list.textContent = '';
    if (!items.length) { section.hidden = true; return; }
    section.hidden = false;
    items.slice(0, UPCOMING_COUNT).forEach((it) => {
      const row = el('div', 'upcoming-item');
      row.appendChild(el('div', 'upcoming-icon', String(it.icon || (it.kind === 'picker' ? '🍽️' : '🔔')).slice(0, 8)));
      const info = el('div', 'upcoming-info');
      info.appendChild(el('div', 'upcoming-message', String(it.title || '').slice(0, 200)));
      const sub = el('div', 'upcoming-time', it.kind === 'picker' ? t('tabPickers') : t('tabReminders'));
      info.appendChild(sub);
      row.appendChild(info);
      row.appendChild(el('span', 'upcoming-when', formatUpcomingWhen(it.at)));
      list.appendChild(row);
    });
  }

  // ---------------------------------------------------------------------------
  // Detail modal
  // ---------------------------------------------------------------------------
  function detailRow(label, valueNodeOrText) {
    const row = el('div', 'detail-row');
    row.appendChild(el('span', 'detail-label', label));
    const value = el('span', 'detail-value');
    if (valueNodeOrText instanceof Node) value.appendChild(valueNodeOrText); else value.textContent = valueNodeOrText;
    row.appendChild(value);
    return row;
  }

  function showReminderDetail(reminder) {
    const modal = $('reminderDetailModal');
    const contentEl = $('reminderDetailContent');
    if (!modal || !contentEl) return;
    currentDetailReminder = reminder;
    const loc = locale();
    const names = dayNames();
    contentEl.textContent = '';

    const head = el('div', 'reminder-detail-header');
    const icon = el('span', 'reminder-detail-icon', reminder.icon || '🔔');
    icon.style.color = safeColor(reminder.color);
    head.appendChild(icon);
    const msg = el('div', 'reminder-detail-message', reminder.message || '');
    msg.style.color = safeColor(reminder.color);
    head.appendChild(msg);
    contentEl.appendChild(head);

    const info = el('div', 'reminder-detail-info');
    if (reminder.type === 'interval') {
      info.appendChild(detailRow('🔁 ' + t('repeatEvery'), (reminder.interval || 0) + ' ' + t('minutes')));
    } else if (reminder.type === 'dateRange' && reminder.dateRangeSettings) {
      const s = reminder.dateRangeSettings;
      const fromDate = new Date(s.fromDate);
      const toDate = new Date(s.toDate);
      const fromStr = isNaN(fromDate) ? '' : fromDate.toLocaleDateString(loc);
      const toStr = isNaN(toDate) ? '' : toDate.toLocaleDateString(loc);
      const daysText = Array.isArray(s.selectedDays) ? s.selectedDays.map((d) => names[d]).filter(Boolean).join(', ') : '';
      const times = Array.isArray(s.times) ? s.times : (s.time ? [s.time] : []);
      info.appendChild(detailRow('📅 ' + t('dateRange'), fromStr + ' - ' + toStr));
      info.appendChild(detailRow('📆 ' + t('weekdays'), daysText));
      info.appendChild(detailRow('⏰ ' + t('timeSlots'), times.join(', ')));
      info.appendChild(detailRow('🔔 ' + t('totalReminders'), ((reminder.scheduledTimes && reminder.scheduledTimes.length) || 0) + ' ' + t('reminders')));
    } else if (Array.isArray(reminder.scheduledTimes) && reminder.scheduledTimes.length > 0) {
      const holder = document.createDocumentFragment();
      reminder.scheduledTimes.slice(0, 5).forEach((st, i) => {
        if (i > 0) holder.appendChild(document.createElement('br'));
        let text = st.time || '';
        if (st.date) {
          const d = new Date(st.date + 'T' + st.time + ':00');
          text = isNaN(d) ? st.date + ' ' + st.time : d.toLocaleString(loc, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        }
        holder.appendChild(document.createTextNode(text));
      });
      if (reminder.scheduledTimes.length > 5) {
        holder.appendChild(document.createElement('br'));
        holder.appendChild(el('em', '', '+' + (reminder.scheduledTimes.length - 5) + '...'));
      }
      info.appendChild(detailRow('⏰ ' + t('reminderTimes'), holder));
    }
    info.appendChild(detailRow('⏱️ ' + t('displayDuration'), String(reminder.displayMinutes || 1) + ' ' + t('minutes')));
    info.appendChild(detailRow('🔔 ' + t('statusEnabled') + '/' + t('statusDisabled'), reminder.enabled === false ? t('statusDisabled') : t('statusEnabled')));
    contentEl.appendChild(info);
    modal.classList.add('active');
  }

  function hideReminderDetail() {
    const modal = $('reminderDetailModal');
    if (modal) modal.classList.remove('active');
    currentDetailReminder = null;
  }

  function setupReminderDetailModal() {
    const modal = $('reminderDetailModal');
    if (!modal) return;
    const closeBtn = $('closeReminderDetailModal');
    if (closeBtn) closeBtn.addEventListener('click', hideReminderDetail);
    const closeBtn2 = $('reminderDetailClose');
    if (closeBtn2) closeBtn2.addEventListener('click', hideReminderDetail);
    const backdrop = modal.querySelector('.modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', hideReminderDetail);
    const editBtn = $('reminderDetailEdit');
    if (editBtn) editBtn.addEventListener('click', () => {
      if (!currentDetailReminder) return;
      const target = reminders.find((x) => x.id === currentDetailReminder.id) || currentDetailReminder;
      hideReminderDetail();
      openReminderModal(target);
    });
  }

  // ---------------------------------------------------------------------------
  // Add/edit modal
  // ---------------------------------------------------------------------------
  function setTypeGroups(type) {
    $('intervalGroup').style.display = type === 'interval' ? 'block' : 'none';
    $('scheduledGroup').style.display = type === 'scheduled' ? 'block' : 'none';
    $('dateRangeGroup').style.display = type === 'dateRange' ? 'block' : 'none';
  }

  function setupReminderModal() {
    const modal = $('reminderModal');
    const form = $('reminderForm');
    if (!modal || !form) return;

    $('closeReminderModal').addEventListener('click', () => modal.classList.remove('active'));
    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.classList.remove('active'));

    document.querySelectorAll('input[name="reminderType"]').forEach((radio) => {
      radio.addEventListener('change', (e) => setTypeGroups(e.target.value));
    });

    document.querySelectorAll('#reminderIconPicker .icon-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#reminderIconPicker .icon-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        $('reminderIcon').value = btn.dataset.icon;
        $('selectedIconPreview').value = btn.dataset.icon;
      });
    });

    $('selectedIconPreview').addEventListener('input', (e) => {
      const value = e.target.value;
      $('reminderIcon').value = value;
      document.querySelectorAll('#reminderIconPicker .icon-btn').forEach((b) => b.classList.toggle('active', b.dataset.icon === value));
    });

    document.querySelectorAll('#reminderColorPicker .color-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#reminderColorPicker .color-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const color = safeColor(btn.dataset.color);
        $('reminderColor').value = color;
        $('selectedColorPreview').style.background = color;
        $('customColorPicker').value = color;
      });
    });

    $('customColorPicker').addEventListener('input', (e) => {
      const color = safeColor(e.target.value);
      $('reminderColor').value = color;
      $('selectedColorPreview').style.background = color;
      document.querySelectorAll('#reminderColorPicker .color-btn').forEach((b) => b.classList.remove('active'));
    });

    document.querySelectorAll('#intervalPresets .preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#intervalPresets .preset-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        $('reminderInterval').value = btn.dataset.value;
      });
    });
    $('reminderInterval').addEventListener('input', (e) => {
      document.querySelectorAll('#intervalPresets .preset-btn').forEach((b) => b.classList.toggle('active', b.dataset.value === e.target.value));
    });

    document.querySelectorAll('#durationPresets .preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#durationPresets .preset-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        $('displayDuration').value = btn.dataset.value;
      });
    });
    $('displayDuration').addEventListener('input', (e) => {
      document.querySelectorAll('#durationPresets .preset-btn').forEach((b) => b.classList.toggle('active', b.dataset.value === e.target.value));
    });

    $('addTimeSlot').addEventListener('click', () => addTimeSlot());
    $('timeSlots').addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-remove-slot');
      if (!btn) return;
      e.preventDefault();
      const slot = btn.closest('.time-slot');
      if (slot) slot.remove();
    });
    $('previewReminder').addEventListener('click', previewCurrentReminder);
    form.addEventListener('submit', async (e) => { e.preventDefault(); await saveReminder(); });

    // Date range
    $('weekdayPicker').addEventListener('click', (e) => {
      const btn = e.target.closest('.weekday-btn');
      if (!btn) return;
      e.preventDefault();
      btn.classList.toggle('active');
      updateDateRangeSummary();
    });
    ['dateRangeFrom', 'dateRangeTo'].forEach((id) => $(id).addEventListener('change', updateDateRangeSummary));
    $('addDateRangeTime').addEventListener('click', () => {
      const time = $('dateRangeTimeInput').value;
      if (!/^\d{2}:\d{2}$/.test(time)) return;
      const existing = getDateRangeTimes();
      if (existing.includes(time)) { toast(t('timeExists'), 'warning'); return; }
      existing.push(time);
      existing.sort();
      renderDateRangeTimes(existing);
      updateDateRangeSummary();
      toast(t('timeAdded'), 'success');
    });
    $('dateRangeTimesList').addEventListener('click', (e) => {
      const btn = e.target.closest('.time-remove-btn');
      if (!btn) return;
      e.stopPropagation();
      renderDateRangeTimes(getDateRangeTimes().filter((x) => x !== btn.dataset.time));
      updateDateRangeSummary();
    });

    $('moreEmojiBtn').addEventListener('click', () => openEmojiPicker());
    $('moreColorBtn').addEventListener('click', () => openColorPicker());
    setupEmojiPicker();
    setupColorPicker();
  }

  function openReminderModal(reminder) {
    reminder = reminder || null;
    const modal = $('reminderModal');
    if (!modal) return;
    $('reminderModalTitle').textContent = t(reminder ? 'editReminder' : 'addReminder');

    const iconValue = (reminder && reminder.icon) || '💧';
    const colorValue = safeColor(reminder && reminder.color);
    $('reminderId').value = (reminder && reminder.id) || '';
    $('reminderMessage').value = (reminder && reminder.message) || '';
    $('reminderIcon').value = iconValue;
    $('reminderColor').value = colorValue;
    $('reminderInterval').value = (reminder && reminder.interval) || 30;
    $('displayDuration').value = (reminder && reminder.displayMinutes) || 1;
    $('reminderImageUrl').value = (reminder && reminder.imageUrl) || '';
    $('selectedIconPreview').value = iconValue;
    $('selectedColorPreview').style.background = colorValue;
    $('customColorPicker').value = colorValue;

    const type = (reminder && reminder.type) || 'interval';
    const typeRadio = document.querySelector('input[name="reminderType"][value="' + type + '"]');
    if (typeRadio) typeRadio.checked = true;
    setTypeGroups(type);

    renderTimeSlots((reminder && reminder.scheduledTimes) || []);

    if (type === 'dateRange' && reminder && reminder.dateRangeSettings) {
      const s = reminder.dateRangeSettings;
      $('dateRangeFrom').value = s.fromDate || '';
      $('dateRangeTo').value = s.toDate || '';
      renderDateRangeTimes(Array.isArray(s.times) && s.times.length ? s.times : (s.time ? [s.time] : ['09:00']));
      document.querySelectorAll('#weekdayPicker .weekday-btn').forEach((btn) => {
        const day = parseInt(btn.dataset.day, 10);
        btn.classList.toggle('active', Array.isArray(s.selectedDays) && s.selectedDays.includes(day));
      });
    } else {
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      $('dateRangeFrom').value = localDateStr(today);
      $('dateRangeTo').value = localDateStr(nextWeek);
      renderDateRangeTimes(['09:00']);
      document.querySelectorAll('#weekdayPicker .weekday-btn').forEach((btn) => {
        const day = parseInt(btn.dataset.day, 10);
        btn.classList.toggle('active', day >= 1 && day <= 5);
      });
    }
    updateDateRangeSummary();

    document.querySelectorAll('#reminderIconPicker .icon-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.icon === iconValue));
    document.querySelectorAll('#reminderColorPicker .color-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.color === colorValue));
    const intervalValue = String((reminder && reminder.interval) || 30);
    document.querySelectorAll('#intervalPresets .preset-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.value === intervalValue));
    const durationValue = String((reminder && reminder.displayMinutes) || 1);
    document.querySelectorAll('#durationPresets .preset-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.value === durationValue));

    modal.classList.add('active');
  }

  // --- time slots (scheduled) ---
  function createTimeSlot(date, time) {
    const today = localDateStr(new Date());
    const slot = el('div', 'time-slot');
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.className = 'slot-date';
    dateInput.value = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : today;
    dateInput.setAttribute('aria-label', t('fromDate'));
    const timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.className = 'slot-time';
    timeInput.value = /^\d{2}:\d{2}$/.test(time || '') ? time : '09:00';
    timeInput.setAttribute('aria-label', t('atTime'));
    const remove = el('button', 'btn-remove-slot', '×');
    remove.type = 'button';
    remove.title = t('delete');
    remove.setAttribute('aria-label', t('delete'));
    slot.appendChild(dateInput);
    slot.appendChild(timeInput);
    slot.appendChild(remove);
    return slot;
  }

  function renderTimeSlots(times) {
    const container = $('timeSlots');
    if (!container) return;
    container.textContent = '';
    if (!times || !times.length) { addTimeSlot(); return; }
    times.forEach((item) => container.appendChild(createTimeSlot(item.date || '', item.time || '09:00')));
  }

  function addTimeSlot() {
    const container = $('timeSlots');
    if (container) container.appendChild(createTimeSlot(localDateStr(new Date()), '09:00'));
  }

  // --- date range ---
  function getDateRangeTimes() {
    return Array.from(document.querySelectorAll('#dateRangeTimesList .date-range-time-item')).map((i) => i.dataset.time).filter(Boolean);
  }

  function renderDateRangeTimes(times) {
    const container = $('dateRangeTimesList');
    if (!container) return;
    container.textContent = '';
    (times || []).filter((tm) => /^\d{2}:\d{2}$/.test(tm)).forEach((time) => {
      const item = el('div', 'date-range-time-item');
      item.dataset.time = time;
      item.appendChild(el('span', 'time-value', '⏰ ' + time));
      const remove = el('button', 'time-remove-btn', '×');
      remove.type = 'button';
      remove.dataset.time = time;
      remove.title = t('delete');
      remove.setAttribute('aria-label', t('delete') + ' ' + time);
      item.appendChild(remove);
      container.appendChild(item);
    });
  }

  function getSelectedDays() {
    return Array.from(document.querySelectorAll('#weekdayPicker .weekday-btn.active')).map((b) => parseInt(b.dataset.day, 10)).filter((d) => Number.isInteger(d));
  }

  function updateDateRangeSummary() {
    const summary = $('dateRangeSummary');
    if (!summary) return;
    const fromDate = $('dateRangeFrom').value;
    const toDate = $('dateRangeTo').value;
    const times = getDateRangeTimes();
    summary.textContent = '';
    if (!fromDate || !toDate) { summary.appendChild(el('em', '', t('selectDateRange'))); return; }
    if (!times.length) { summary.appendChild(el('em', '', t('addTimeError'))); return; }
    const selectedDays = getSelectedDays();
    if (!selectedDays.length) { summary.appendChild(el('em', '', t('selectDays'))); return; }

    // LG-5: count in local time to match the scheduledTimes generation logic
    const [sfY, sfM, sfD] = fromDate.split('-').map(Number);
    const [seY, seM, seD] = toDate.split('-').map(Number);
    const start = new Date(sfY, sfM - 1, sfD);
    const end = new Date(seY, seM - 1, seD);
    let dayCount = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) { if (selectedDays.includes(d.getDay())) dayCount++; }
    const total = dayCount * times.length;

    summary.appendChild(document.createTextNode('📅 '));
    summary.appendChild(el('strong', '', String(dayCount)));
    summary.appendChild(document.createTextNode(' ' + t('days') + ' × '));
    summary.appendChild(el('strong', '', String(times.length)));
    summary.appendChild(document.createTextNode(' ' + t('times') + ' = '));
    summary.appendChild(el('strong', '', String(total)));
    summary.appendChild(document.createTextNode(' ' + t('reminders')));
    summary.appendChild(document.createElement('br'));
    summary.appendChild(document.createTextNode('⏰ ' + times.join(', ')));
  }

  // --- preview / save ---
  function currentFormReminder() {
    return {
      message: $('reminderMessage').value.trim(),
      icon: $('reminderIcon').value || '🔔',
      color: safeColor($('reminderColor').value),
      imageUrl: $('reminderImageUrl').value.trim() || '',
      displayMinutes: Math.max(1, Math.min(60, parseInt($('displayDuration').value, 10) || 1))
    };
  }

  function previewCurrentReminder() {
    const data = currentFormReminder();
    if (!data.message) { toast(t('enterMessage'), 'error'); return; }
    const S = window.Scheduler;
    if (!S || typeof S.previewReminder !== 'function') { toast(t('previewError'), 'error'); return; }
    Promise.resolve()
      .then(() => S.previewReminder(data))
      .then((res) => {
        if (res === false || (res && res.success === false)) toast(t('previewError'), 'error');
        else toast(t('previewSent'), 'success');
      })
      .catch(() => toast(t('previewError'), 'error'));
  }

  async function saveReminder() {
    const id = $('reminderId').value;
    const typeInput = document.querySelector('input[name="reminderType"]:checked');
    const type = typeInput ? typeInput.value : 'interval';
    const data = currentFormReminder();
    if (!data.message) { toast(t('enterMessage'), 'error'); return; }

    if (data.imageUrl) {
      const lower = data.imageUrl.toLowerCase();
      const okExt = VALID_IMAGE_EXT.some((ext) => lower.includes(ext));
      const okProto = /^https:\/\//i.test(data.imageUrl) || /^data:image\/(png|jpeg|webp|gif);base64,/i.test(data.imageUrl);
      if (!okExt || !okProto) { toast(t('invalidImageUrl'), 'error'); return; }
    }

    let scheduledTimes = [];
    let dateRangeSettings = null;

    if (type === 'scheduled') {
      document.querySelectorAll('#timeSlots .time-slot').forEach((slot) => {
        const date = (slot.querySelector('.slot-date') || {}).value || '';
        const time = (slot.querySelector('.slot-time') || {}).value || '';
        if (/^\d{2}:\d{2}$/.test(time)) scheduledTimes.push({ date, time });
      });
      if (!scheduledTimes.length) { toast(t('addTimeError'), 'error'); return; }
    } else if (type === 'dateRange') {
      const fromDate = $('dateRangeFrom').value;
      const toDate = $('dateRangeTo').value;
      const times = getDateRangeTimes();
      if (!fromDate || !toDate) { toast(t('selectDateRange'), 'error'); return; }
      if (!times.length) { toast(t('addTimeError'), 'error'); return; }
      const selectedDays = getSelectedDays();
      if (!selectedDays.length) { toast(t('selectDays'), 'error'); return; }
      dateRangeSettings = { fromDate, toDate, times, selectedDays };

      // Expand into scheduledTimes in LOCAL TIME, capped at MAX_SCHEDULED (same as the extension)
      const [fromY, fromM, fromD] = fromDate.split('-').map(Number);
      const [toY, toM, toD] = toDate.split('-').map(Number);
      const start = new Date(fromY, fromM - 1, fromD);
      const end = new Date(toY, toM - 1, toD);
      let capped = false;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (!selectedDays.includes(d.getDay())) continue;
        const dateStr = localDateStr(d);
        for (const time of times) {
          if (scheduledTimes.length >= MAX_SCHEDULED) { capped = true; break; }
          scheduledTimes.push({ date: dateStr, time });
        }
        if (capped) break;
      }
      if (!scheduledTimes.length) { toast(t('noMatchingDates'), 'error'); return; }
      if (capped) toast(t('tooManyReminders'), 'warning');
    }

    const existing = id ? reminders.find((r) => r.id === id) : null;
    const record = {
      id: id || 'reminder-' + Date.now(),
      message: data.message,
      icon: data.icon,
      color: data.color,
      imageUrl: data.imageUrl,
      type,
      interval: Math.max(1, parseInt($('reminderInterval').value, 10) || 30),
      scheduledTimes,
      dateRangeSettings,
      displayMinutes: data.displayMinutes,
      enabled: existing ? existing.enabled !== false : true
    };

    const index = reminders.findIndex((r) => r.id === record.id);
    if (index === -1) reminders.push(record); else reminders[index] = record;

    await persist();
    $('reminderModal').classList.remove('active');
    renderList();
    renderUpcoming();
    toast(t('reminderSaved'), 'success');
  }

  // ---------------------------------------------------------------------------
  // Emoji picker + color picker (shared by the reminder modal)
  // ---------------------------------------------------------------------------
  function setupEmojiPicker() {
    const modal = $('emojiPickerModal');
    if (!modal) return;
    $('closeEmojiModal').addEventListener('click', () => modal.classList.remove('active'));
    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.classList.remove('active'));
    document.querySelectorAll('.emoji-category-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.emoji-category-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderEmojiGrid(btn.dataset.category);
      });
    });
    renderEmojiGrid('smileys');
  }

  function openEmojiPicker() {
    const modal = $('emojiPickerModal');
    if (!modal) return;
    renderEmojiGrid('smileys');
    document.querySelectorAll('.emoji-category-btn').forEach((b) => b.classList.toggle('active', b.dataset.category === 'smileys'));
    modal.classList.add('active');
  }

  function renderEmojiGrid(category) {
    const grid = $('emojiGrid');
    if (!grid) return;
    grid.textContent = '';
    (EMOJI_DATA[category] || []).forEach((emoji) => {
      const btn = el('button', 'emoji-item', emoji);
      btn.type = 'button';
      btn.addEventListener('click', () => selectEmoji(emoji));
      grid.appendChild(btn);
    });
  }

  function selectEmoji(emoji) {
    $('selectedIconPreview').value = emoji;
    $('reminderIcon').value = emoji;
    document.querySelectorAll('#reminderIconPicker .icon-btn').forEach((b) => b.classList.toggle('active', b.dataset.icon === emoji));
    $('emojiPickerModal').classList.remove('active');
  }

  function setupColorPicker() {
    const modal = $('colorPickerModal');
    if (!modal) return;
    $('closeColorModal').addEventListener('click', () => modal.classList.remove('active'));
    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.classList.remove('active'));
    const palette = $('colorPalette');
    palette.textContent = '';
    TREND_COLORS.forEach((c) => {
      const color = safeColor(c);
      const btn = el('button', 'color-palette-item');
      btn.type = 'button';
      btn.style.background = color;
      btn.dataset.color = color;
      btn.title = color;
      btn.setAttribute('aria-label', color);
      btn.addEventListener('click', () => selectColor(color));
      palette.appendChild(btn);
    });
  }

  function openColorPicker() {
    const modal = $('colorPickerModal');
    if (modal) modal.classList.add('active');
  }

  function selectColor(color) {
    color = safeColor(color);
    $('selectedColorPreview').style.background = color;
    $('reminderColor').value = color;
    $('customColorPicker').value = color;
    document.querySelectorAll('#reminderColorPicker .color-btn').forEach((b) => b.classList.toggle('active', b.dataset.color === color));
    $('colorPickerModal').classList.remove('active');
  }

  // ---------------------------------------------------------------------------
  // Master toggle
  // ---------------------------------------------------------------------------
  // The master switch also reflects a temporary snooze: while snoozed it looks like it is off,
  // and turning it on clears the snooze deadline (DESKTOP-SPEC §20.4). Always go through App, never write settings directly.
  function setupMasterToggle() {
    const masterToggle = $('masterToggle');
    if (!masterToggle) return;
    A().updateMasterStatusLabel();
    masterToggle.addEventListener('change', async (e) => {
      await A().setNotificationsEnabled(e.target.checked);
      A().updateMasterStatusLabel();
      renderUpcoming();
    });
    if (typeof A().onMuteChange === 'function') A().onMuteChange(() => { A().updateMasterStatusLabel(); renderUpcoming(); });
  }

  // ---------------------------------------------------------------------------
  // API module
  // ---------------------------------------------------------------------------
  async function render() {
    await loadReminders();
    if (A()) A().updateMasterStatusLabel();
    renderList();
    renderUpcoming();
  }

  async function init() {
    if (initialized) return render();
    initialized = true;
    setupReminderModal();
    setupReminderDetailModal();
    setupMasterToggle();
    const addBtn = $('addReminderBtn');
    if (addBtn) addBtn.addEventListener('click', () => openReminderModal());
    const emptyAdd = $('emptyAddReminder');
    if (emptyAdd) emptyAdd.addEventListener('click', () => openReminderModal());

    // reminders were written somewhere else (for example a language change rewrites the default text) -> re-render
    P().storage.onChanged((changes) => {
      if (changes && changes.reminders && !selfWriting) {
        loadReminders().then(() => { renderList(); renderUpcoming(); });
      }
      if (changes && (changes.schedulerState || changes.pickers || changes.serverPickers || changes.serverPickerPrefs)) renderUpcoming();
    });

    if (upcomingTimer) clearInterval(upcomingTimer);
    upcomingTimer = setInterval(renderUpcoming, UPCOMING_REFRESH_MS);
    if (P().onTick) P().onTick(() => renderUpcoming());
    await render();
  }

  window.UIReminders = { init, render, openModal: openReminderModal, refreshUpcoming: renderUpcoming };
})();
