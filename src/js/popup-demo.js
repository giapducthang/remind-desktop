// popup-demo.js - QA harness for PopupRenderer in browser mode (popup-demo.html).
// Uses the real code path: Platform.popup.show(payload) -> platform.js creates .rmd-popup-overlay -> PopupRenderer.render.
// Every event the popup sends back (ctx.send / POPUP_CLOSED) is written to <pre id="eventLog">.

(function () {
  'use strict';

  const P = window.Platform;
  const log = document.getElementById('eventLog');

  const state = { dark: false, lowPerf: false, sound: true, tiny: false, lang: 'en' };

  function writeLog(line) {
    const ts = new Date().toLocaleTimeString('en-GB');
    log.textContent += '[' + ts + '] ' + line + '\n';
    log.scrollTop = log.scrollHeight;
  }

  function common() {
    return {
      payloadId: 'p-' + Date.now(),
      darkMode: state.dark,
      lowPerfMode: state.lowPerf,
      soundEnabled: state.sound,
      soundVolume: 60,
      language: state.lang,
      versionMessage: '',
      versionUrl: '',
      versionStatus: '',
      versionImage: ''
    };
  }

  function minutes(def) { return state.tiny ? 0.05 : def; }

  const SAMPLE_ITEMS = [
    { id: 'i1', name: 'Phở bò', emoji: '🍜',
      image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Beef_noodle_soup_%28Ph%E1%BB%9F_b%C3%B2%29_-_Pho_Hanoi_Authentic_2024-12-01.jpg/500px-Beef_noodle_soup_%28Ph%E1%BB%9F_b%C3%B2%29_-_Pho_Hanoi_Authentic_2024-12-01.jpg',
      imageCredit: '', priceMin: 40000, priceMax: 60000 },
    { id: 'i2', name: 'Bánh mì', emoji: '🥖', image: '', imageCredit: '', priceMin: 15000, priceMax: 25000 },
    { id: 'i3', name: 'Cơm tấm sườn bì chả', emoji: '🍚', image: '', imageCredit: '', priceMin: 35000, priceMax: 55000 },
    { id: 'i4', name: 'Bún chả', emoji: '🍢', image: '', imageCredit: '', priceMin: 0, priceMax: 0 },
    { id: 'i5', name: 'Lẩu thái', emoji: '🍲', image: '', imageCredit: '', priceMin: 150000, priceMax: 250000 },
    { id: 'i6', name: 'Bò bít tết', emoji: '🥩', image: '', imageCredit: '', priceMin: 80000, priceMax: 120000 },
    { id: 'i7', name: 'Cơm chay', emoji: '🥬',
      image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Vietnamese_family_daily_meal.jpg/500px-Vietnamese_family_daily_meal.jpg',
      imageCredit: 'Hoangkid · CC BY-SA 4.0', priceMin: 25000, priceMax: 35000 },
    // Image with a bad scheme -> must be dropped, emoji shown instead
    { id: 'i8', name: 'Gỏi cuốn', emoji: '🥗', image: 'javascript:alert(1)', imageCredit: '', priceMin: 20000, priceMax: 30000 }
  ];

  function reminderPayload(withImage) {
    const base = common();
    base.kind = 'reminder';
    base.reminder = {
      id: 'default-water',
      message: state.lang === 'vi' ? 'Uống một ly nước nhé 💧' : 'Time to drink some water 💧',
      icon: '💧',
      color: '#0ea5e9',
      imageUrl: '',
      displayMinutes: minutes(1)
    };
    if (withImage) {
      base.reminder.color = '#16a34a';
      base.reminder.icon = '🚶';
      base.reminder.message = state.lang === 'vi' ? 'Đứng dậy đi lại một chút <b>không phải HTML</b>' : 'Stand up and stretch <b>not HTML</b>';
      base.versionStatus = 'all';
      base.versionImage = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/C%C6%A1m_t%E1%BA%A5m_s%C6%B0%E1%BB%9Dn_c%C3%A2y.JPG/500px-C%C6%A1m_t%E1%BA%A5m_s%C6%B0%E1%BB%9Dn_c%C3%A2y.JPG';
      base.versionMessage = 'Reminder desktop is now available - remind.asia';
      base.versionUrl = 'https://remind.asia/';
    }
    return base;
  }

  function pickerPayload(noPrice) {
    const base = common();
    base.kind = 'picker';
    base.picker = {
      id: 'pk-lunch',
      name: state.lang === 'vi' ? 'Trưa nay ăn gì?' : 'What to eat for lunch?',
      icon: '🍜',
      displayMinutes: minutes(5)
    };
    if (noPrice) {
      base.items = [
        { id: 'a', name: 'Phở', emoji: '🍜', image: '', priceMin: 0, priceMax: 0 },
        { id: 'b', name: 'Bánh mì', emoji: '🥖', image: '', priceMin: 0, priceMax: 0 }
      ];
    } else {
      base.items = SAMPLE_ITEMS;
    }
    base.item = base.items[0];
    base.versionMessage = 'Bon appétit from remind.asia';
    base.versionUrl = 'https://remind.asia/';
    return base;
  }

  function show(payload) {
    writeLog('SHOW ' + payload.kind + ' ' + JSON.stringify({ dark: payload.darkMode, lowPerf: payload.lowPerfMode, lang: payload.language, sound: payload.soundEnabled }));
    P.popup.show(payload).then((ok) => { if (!ok) writeLog('popup.show returned false'); });
  }

  function toggle(btn, key, label) {
    btn.addEventListener('click', () => {
      state[key] = !state[key];
      btn.textContent = label + ': ' + (state[key] ? 'on' : 'off');
      btn.classList.toggle('on', state[key]);
      if (key === 'dark') document.body.classList.toggle('demo-dark', state.dark);
    });
  }

  P.ready.then(() => {
    P.popup.onEvent((evt) => { writeLog('EVENT ' + JSON.stringify(evt)); });

    document.getElementById('btnReminder').addEventListener('click', () => show(reminderPayload(false)));
    document.getElementById('btnReminderImage').addEventListener('click', () => show(reminderPayload(true)));
    document.getElementById('btnPicker').addEventListener('click', () => show(pickerPayload(false)));
    document.getElementById('btnPickerNoPrice').addEventListener('click', () => show(pickerPayload(true)));
    document.getElementById('btnHide').addEventListener('click', () => { P.popup.hide(); writeLog('HIDE (Platform.popup.hide)'); });
    document.getElementById('btnClearLog').addEventListener('click', () => { log.textContent = ''; });

    toggle(document.getElementById('btnTheme'), 'dark', 'Dark');
    toggle(document.getElementById('btnLowPerf'), 'lowPerf', 'Low perf');
    toggle(document.getElementById('btnSound'), 'sound', 'Sound');
    toggle(document.getElementById('btnTiny'), 'tiny', 'displayMinutes 0.05');
    document.getElementById('selLang').addEventListener('change', (e) => { state.lang = e.target.value === 'vi' ? 'vi' : 'en'; });

    writeLog('ready (Platform.isTauri=' + P.isTauri + ')');
  });

  // For automated testing: reachable from the console.
  window.__popupDemo = { reminderPayload, pickerPayload, show, state };
})();
