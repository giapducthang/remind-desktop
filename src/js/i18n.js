// i18n.js - Internationalization module (desktop)
// Copied from the browser extension's translation dictionary plus desktop-only keys (EN + VI). Supported languages: English (default) and Vietnamese.
// Difference from the extension: the language key is read/written through window.Platform.storage (not the extension storage).

// Prevent duplicate declaration
if (typeof window.i18n !== 'undefined') {
  // Already loaded
} else {

const i18n = {
  // Current language
  currentLang: 'en',
  
  // All translations
  translations: {
    en: {
      // Header
      appTitle: 'Reminder',
      settings: 'Settings',
      toggleTheme: 'Toggle theme',
      
      // Rating CTA
      ratingText: 'Is this extension helpful to you?',
      ratingSubtext: 'Rate 5 stars to support us!',
      rateNow: 'Rate now',
      
      // Master toggle
      enableReminders: 'Enable reminders',
      statusEnabled: 'Enabled',
      statusDisabled: 'Disabled',
      
      // Tabs
      tabReminders: 'Reminders',
      tabAddNew: 'Add New',
      tabNotes: 'Notes',
      tabClipboard: 'Clipboard',
      tabAnnouncements: 'Updates',
      tabSettings: 'Settings',
      
      // Announcements
      announcementsSubtitle: 'Extension changelog & updates',
      markAsRead: 'Mark as read',
      announcementsMarkedAsRead: 'All updates marked as read',
      tagNew: 'New',
      tagUpdate: 'Update',
      tagFix: 'Fix',
      announcement260_1Title: 'Screen Time Dashboard',
      announcement260_1Desc: 'Track your browsing time with a beautiful dashboard. View hourly activity charts, top websites with emoji icons, category breakdown (Social, Productivity, Entertainment...), and week-over-week comparison. Two popup notification modes: Realtime and Daily Summary with glassmorphism design.',
      announcement260_2Title: 'Smart Category Classification',
      announcement260_2Desc: 'Websites are automatically classified into categories like Social, Productivity, Entertainment, Shopping, News, and Education. View your time distribution with an interactive donut chart and get personalized insights about your browsing habits.',
      announcement240_2Title: 'Dismiss notifications by keypress',
      announcement240_2Desc: 'When any key on the keyboard is pressed, the notification popup will close immediately. You can enable this feature in the settings.',
      announcement200Title: 'Major Update - New UI',
      announcement200Desc: 'Complete redesign with new sidebar interface, Google Calendar integration, clipboard history, and quick notes with keyboard shortcuts.',
      
      // Clipboard
      clipboardTitle: 'Clipboard History',
      clipboardSubtitle: 'Clipboard history in the browser',
      clipboardInfo: 'How it works',
      clipboardInfoDesc: 'Automatically saves text you copy. Maximum 1000 items or 2MB.',
      clipboardSearch: 'Search clipboard...',
      clipboardAllSources: 'All sources',
      clipboardFilterSource: 'Filter by source',
      clipboardClearAll: 'Clear all',
      clipboardEmpty: 'No clipboard history yet',
      clipboardEmptyHint: 'Copy text on any page to save here',
      clipboardNoResults: 'No matching items',
      clipboardTryDifferent: 'Try different search terms',
      clipboardDetailTitle: 'Clipboard Detail',
      clipboardConfirmClear: 'Clear all clipboard history?',
      clipboardCleared: 'Clipboard cleared',
      copied: 'Copied!',
      copy: 'Copy',
      close: 'Close',
      reminderDetail: 'Reminder Detail',
      source: 'Source',
      weekdays: 'Days',
      totalReminders: 'Total',
      noMatchingDates: 'No matching dates found',
      
      // Reminders list
      noReminders: 'No reminders yet',
      addFirstReminder: 'Add your first reminder',
      repeatEvery: 'Repeat every',
      minutes: 'minutes',
      fixedTime: 'Fixed time',
      edit: 'Edit',
      delete: 'Delete',
      
      // Add reminder form
      message: 'Message',
      enterMessage: 'Enter reminder message...',
      icon: 'Icon',
      iconHint: 'You can copy an icon from outside and paste it here',
      messageColor: 'Message color',
      imageUrl: 'Image URL (optional)',
      imageUrlPlaceholder: 'https://example.com/image.png',
      imageUrlHint: 'Supported: .png, .jpg, .jpeg, .gif, .webp, .svg, .avif',
      invalidImageUrl: 'Invalid image URL. Supported: .png, .jpg, .jpeg, .gif, .webp, .svg, .avif',
      reminderType: 'Reminder type',
      repeatByInterval: 'Repeat by interval',
      atFixedTime: 'At fixed time',
      repeatEveryMinutes: 'Repeat every (minutes)',
      reminderTimes: 'Reminder times',
      addTime: 'Add time',
      displayDuration: 'Display duration (minutes)',
      preview: 'Preview',
      saveReminder: 'Save reminder',
      
      // Notes
      addNewNote: 'Add new note',
      noNotes: 'No notes yet',
      createNoteHint: 'Create notes to save frequently used information',
      noteTitle: 'Title',
      noteTitlePlaceholder: 'E.g: Is this extension helpful?',
      noteContent: 'Content',
      noteContentPlaceholder: 'E.g: If helpful, please rate 5 stars to support us!',
      noteShortcut: 'Activation shortcut',
      noteShortcutPlaceholder: 'E.g: /rate',
      shortcutHint: 'Start with / followed by letters, numbers or _',
      saveNote: 'Save note',
      
      // Share/Messaging
      
      // Contact modal
      cancel: 'Cancel',
      
      // Settings
      darkMode: 'Dark mode',
      darkModeDesc: 'Easier on eyes in low light conditions',
      lowPerfMode: 'Low performance mode',
      lowPerfModeDesc: 'Reduce effects for weak devices',
      soundNotification: 'Sound notification',
      soundDesc: 'Play sound when showing reminder',
      notificationVolume: 'Notification volume',
      volumeDesc: 'Adjust sound volume',
      
      // Excluded Websites
      excludedWebsites: 'Excluded Websites',
      excludedWebsitesDesc: 'Popup notifications will not appear on these websites',
      enterWebsite: 'Enter website (e.g. example.com)',
      quickAdd: 'Quick add:',
      websiteAdded: 'Website added',
      websiteRemoved: 'Website removed',
      websiteExists: 'Website already in list',
      enterValidWebsite: 'Please enter a valid website',
      invalidDomain: 'Please enter a valid domain',
      noExcludedWebsites: 'No websites excluded',
      
      dataManagement: 'Data Management',
      exportData: 'Export data',
      importData: 'Import data',
      resetAll: 'Reset all',
      version: 'Version',
      createdBy: 'Created with ❤️ by noti.vn',
      fanpage: 'Fanpage',
      website: 'Website',
      bugReport: 'Bug report, feature request',
      here: 'here',
      
      // Edit modal
      editReminder: 'Edit reminder',
      saveChanges: 'Save changes',
      
      // Note modal
      addNoteTitle: 'Add new note',
      editNoteTitle: 'Edit note',
      
      // Notifications
      reminderSaved: 'Reminder saved!',
      reminderDeleted: 'Reminder deleted!',
      noteSaved: 'Note saved!',
      noteDeleted: 'Note deleted!',
      previewSent: 'Preview notification sent!',
      previewError: 'Error showing preview',
      addTimeError: 'Please add at least one reminder time',
      enterReminderError: 'Please enter reminder content to preview',
      dataExported: 'Data exported!',
      dataImported: 'Data imported successfully!',
      invalidFile: 'Invalid file',
      tooManyReminders: 'Too many time slots - please shorten the date range.',
      enterNoteTitle: 'Please enter a title',
      enterNoteContent: 'Please enter content',
      invalidShortcut: 'Shortcut must start with / (e.g. /hello)',
      dataReset: 'All data has been reset!',
      
      // Confirmations
      confirmDeleteReminder: 'Delete this reminder?',
      confirmDeleteNote: 'Delete this note?',
      confirmReset: 'Are you sure you want to reset all data? This action cannot be undone.',
      
      // Content script notifications
      
      // Default reminders
      defaultWaterReminder: 'Time to drink water!',
      defaultStandupReminder: 'Stand up and walk around a bit!',
      
      // Misc
      use: 'Use',
      remove: 'Remove',
      
      // Google Calendar
      tabCalendar: 'Calendar',
      googleCalendar: 'Google Calendar',
      notConnected: 'Not connected',
      connected: 'Connected',
      connecting: 'Connecting...',
      connectGoogle: 'Connect Google',
      disconnect: 'Disconnect',
      autoSync: 'Auto sync events',
      autoSyncDesc: 'Automatic synchronization of events from Google Calendar within the next 7 days. Notifications are sent 10 minutes before the event starts',
      remindBefore: 'Remind before event',
      remindBeforeDesc: 'Get notified before events start',
      selectCalendars: 'Select calendars',
      selectCalendarsDesc: 'Choose which calendars to sync',
      syncNow: 'Sync now',
      syncing: 'Syncing...',
      upcomingEvents: 'Upcoming events',
      noEvents: 'No upcoming events',
      lastSync: 'Last sync',
      calendarConnected: 'Google Calendar connected!',
      calendarDisconnected: 'Google Calendar disconnected',
      calendarSynced: 'Calendar synced successfully!',
      calendarSyncError: 'Failed to sync calendar',
      calendarLoginError: 'Failed to connect Google Calendar',
      confirmDisconnect: 'Are you sure you want to disconnect Google Calendar?',
      eventsFound: 'events found',
      remindersCreated: 'reminders created',
      allDay: 'All day',
      calendarEventReminder: 'Event starting in',
      minutesShort: 'min',
      
      // Side Panel specific
      tabDashboard: 'Dashboard',
      welcomeBack: 'Welcome back!',
      dashboardSubtitle: 'Your activity overview',
      activeReminders: 'Reminders',
      todayNotifications: 'Today',
      quickActions: 'Quick Actions',
      addReminder: 'Add Reminder',
      addNote: 'Add Note',
      upcomingReminders: 'Upcoming Reminders',
      viewAll: 'View all',
      remindersSubtitle: 'Manage notification reminders displayed in the browser',
      calendarSubtitle: 'Sync events from Google Calendar',
      connectGoogleDesc: 'Get reminders from your Google Calendar events (currently only available with Google Chrome)',
      notesSubtitle: 'Save frequently used info with shortcuts',
      settingsSubtitle: 'Customize extension',
      appearance: 'Appearance',
      languageDesc: 'Select language',
      optional: 'optional',
      
      save: 'Save',

      // New features - Date Range
      dateRange: 'Date Range',
      dateRangeSettings: 'Date Range Settings',
      fromDate: 'From',
      toDate: 'To',
      atTime: 'Time',
      timeSlots: 'Time slots',
      days: 'days',
      times: 'times',
      timeExists: 'Time already exists',
      timeAdded: 'Added time',
      selectDateRange: 'Select date range to see summary',
      selectDays: 'Please select at least one day',
      reminders: 'reminders',
      sun: 'Sun',
      mon: 'Mon',
      tue: 'Tue',
      wed: 'Wed',
      thu: 'Thu',
      fri: 'Fri',
      sat: 'Sat',
      
      // New features - Emoji & Color Picker
      selectEmoji: 'Select Emoji',
      searchEmoji: 'Search emoji...',
      selectColor: 'Select Color',
      customColor: 'Custom Color',
      apply: 'Apply',
      moreEmoji: '+ Emoji',
      moreColor: '+ Color',
      
      // New features - Share
      expand: 'Expand',
      collapse: 'Collapse',
      
      // New features - Onboarding
      welcomeTitle: 'Welcome to Health Reminder!',
      welcomeDesc: 'Your all-in-one productivity & health assistant. Let\'s explore the features!',
      remindersTitle: 'Health Reminders',
      remindersDesc: 'Set up reminders to drink water, rest your eyes, stretch, and more. Customize intervals or schedule specific times.',
      clipboardDesc: 'Auto-save everything you copy. Search, pin important items, and paste anytime. Never lose copied content again!',
      notesTitle: 'Quick Notes',
      notesDesc: 'Create notes with shortcuts. Type / in any text field to access your notes instantly. Perfect for templates and snippets.',
      calendarTitle: 'Google Calendar Sync',
      calendarDesc: 'Connect your Google Calendar to get event reminders. Never miss important meetings or appointments.',
      excludeTitle: 'Website Exclusion',
      excludeDesc: 'Disable notifications on specific websites like video calls or streaming. Go to Settings to configure.',
      getStartedTitle: 'You\'re All Set!',
      getStartedDesc: 'Start by creating your first reminder. Click the Tutorial button anytime to see this guide again.',
      next: 'Next',
      skip: 'Skip',
      getStarted: 'Get Started',
      tutorial: 'Tutorial',
      
      // Dismiss by keypress
      dismissByKeypress: 'Dismiss by keypress',
      dismissByKeypressDesc: 'Press any key to close popup',

      // Screen Time
      tabScreenTime: 'Screen Time',
      screenTimeSubtitle: 'Track your browsing activity',
      screenTimeToday: 'Screen Time Today',
      viewDetails: 'Details',
      periodToday: 'Today',
      periodWeek: 'This Week',
      periodMonth: 'This Month',
      totalScreenTime: 'Total screen time',
      totalThisWeek: 'Total this week',
      totalThisMonth: 'Total this month',
      vsYesterday: 'vs yesterday',
      comparedToYesterday: 'Compared to yesterday',
      topWebsites: 'Top Websites',
      stWebsites: 'Websites',
      dailyBreakdown: 'Daily Breakdown',
      noScreenTimeData: 'No browsing data yet. Start browsing to see your activity.',
      screenTimePopupSettings: 'Popup Notification',
      enableScreenTimePopup: 'Screen Time Popup',
      screenTimePopupDesc: 'Show browsing time reminder periodically',
      popupInterval: 'Reminder Interval',
      popupIntervalDesc: 'How often to show screen time popup',
      screenTimePopupEnabled: 'Screen time popup enabled',
      screenTimePopupDisabled: 'Screen time popup disabled',
      intervalUpdated: 'Interval updated',
      stToday: 'Today',
      stWeekAvg: 'Week avg',
      stVisits: 'Visits',
      stHourlyActivity: 'Hourly Activity',
      stCategories: 'Categories',
      stTotal: 'Total',
      stWeekComparison: 'Week Comparison',
      stThisWeek: 'This week',
      stLastWeek: 'Last week',
      stPopupMode: 'Notification Mode',
      stPopupModeDesc: 'Choose notification style',
      stModeRealtime: 'Realtime',
      stModeSummary: 'Summary',
      settingsSaved: 'Settings saved',
      // Cloud Sync
      cloudSync: 'Cloud Sync',
      cloudSyncDesc: 'Sign in to sync your settings & reminders. Data is stored directly in your own Google Drive and syncs automatically across devices.',
      cloudSyncTitle: 'Sign in with Google to sync',
      cloudSyncIntro: 'Sign in to sync all your settings and reminders. Data is stored directly in your own Google Drive and automatically syncs across your devices when signed in with the same account.',
      signInWithGoogle: 'Sign in with Google',
      later: 'Later',
      syncAccount: 'Account',
      syncStatus: 'Status',
      syncNow: 'Sync now',
      signOut: 'Sign out',
      syncing: 'Syncing...',
      syncError: 'Sync error',
      syncDone: 'Synced',
      syncLoginSuccess: 'Signed in & synced',
      syncLoginFailed: 'Sign-in failed',
      signedOut: 'Signed out',
      confirmSyncLogout: 'Sign out of sync? Data on this device is kept.',
      // Announcement v2.9.2
      announcement216_1Title: 'New tab: Food & drinks',
      announcement216_1Desc: 'Stop arguing about lunch. At the time you choose, a popup spins like a case opening and lands on one dish, complete with a real photo, so you can just go eat. Reminder ships two ready-made sets for Vietnam - 128 lunch dishes at 11:30 and 42 non-alcoholic afternoon drinks at 15:00 - so there is nothing to set up; switch either off in the Food & drinks tab whenever you like. You can still build your own sets with your own list and schedule.',
      announcement216_2Title: 'Spin within your budget',
      announcement216_2Desc: 'Every dish and drink carries a price range, and the popup lets you pick a budget before spinning - any price, under 30k, 30-60k, 60-100k or 100k and up. The winner appears large with its photo and price, and "Find places nearby" opens Google Maps searching for that dish around you.',
      announcement216_3Title: 'Your schedule, your call',
      announcement216_3Desc: 'Eat at noon instead of 11:30? Open the Food & drinks tab and change the time of any set - your times apply to this device only, and one tap restores the default. The tab now shares the look and the controls of Reminders, and Preview shows the popup immediately instead of waiting.',
      announcement292_1Title: 'A Leaner, More Focused Extension',
      announcement292_1Desc: 'To comply with the Chrome Web Store "single purpose" policy, the Ad Blocker, Tracker Blocker, Privacy Blur and Browser Lock features have been removed. Reminder now focuses on helping you work healthily and stay focused: break reminders, screen-time insights and quick notes. Old settings of the removed features are cleaned up automatically, and the extension is lighter and requires fewer permissions.',
      // Announcement v2.9.0 (merges the v2.7.0 + v2.7.1 content)
      announcement290_1Title: 'Cloud Sync with Google',
      announcement290_1Desc: 'Sign in with Google to sync your reminders and settings across devices. Your data is stored privately in your own Google Drive and syncs automatically - set it up once and continue seamlessly on any device.',
      announcement290_2Title: 'Smart Notification Spacing',
      announcement290_2Desc: 'When several reminders are due at the same time (e.g. "drink water" every 30 min overlapping with "stand up" every 60 min), they now appear spaced apart instead of all at once - so no reminder is buried or missed.',
      announcement290_3Title: 'Security & Stability',
      announcement290_3Desc: 'Clipboard capture off by default and never synced, hardened data handling, stronger privacy protection, plus multilingual and accessibility refinements.',

      // Announcement v2.6.2
      announcement262_1Title: 'Dashboard Scrollable & UI Fixes',
      announcement262_1Desc: 'Dashboard tab now scrolls vertically - content no longer gets squeezed on small screens. Screen Time Today section is restructured to match other sections with a consistent header and Details button.',
      announcement262_2Title: 'Fix Preview Duplicate Popups',
      announcement262_2Desc: 'Fixed a bug where pressing Preview in Quick Actions would show multiple overlapping notification popups at the same time. Added a guard to prevent content script from registering duplicate listeners when re-injected.',

      // Missing UI labels (C3)
      about: 'About',
      notifications: 'Notifications',
      language: 'Language',
      notes: 'Notes',
      clipboardItems: 'Clipboard',
      savePassword: 'Save Password',
      helpSupport: 'Help & Support',
      resetStats: 'Reset statistics',
      uploadBackground: 'Upload background image',
      removeBackground: 'Remove background image',
      togglePassword: 'Show/hide password',
      moreColors: 'More colors',
      addToWhitelist: 'Add to whitelist',
      addWebsite: 'Add website',
      clipboardStatsInfo: 'Clipboard usage: number of items and storage size',

      // Accessibility labels (T1/T7)
      switchLanguage: 'Switch language',
      colorBlue: 'Blue',
      colorGreen: 'Green',
      colorOrange: 'Orange',
      colorRed: 'Red',

      // Clipboard capture opt-out
      clipboardCapture: 'Save copied text',
      clipboardCaptureDesc: 'Clipboard history is stored locally on this device only, and is off by default. Turn on to start saving text you copy.',

      // Pickers (random pick sets)
      serverPickersTitle: 'Suggested by Reminder',
      serverPickersDesc: 'Ready-made sets sent by Reminder for your region - they run on their own. Turn one off any time.',
      serverPickerBadge: 'From Reminder',
      serverPickerEditTime: 'Change the time',
      serverPickerTimeTitle: 'When should this popup appear?',
      serverPickerTimeHint: 'Your own times, on this device only. The item list stays managed by Reminder.',
      serverPickerTimeReset: 'Use the default time',
      serverPickerCustomTime: 'your time',
      serverPickerBadgeTitle: 'Set up by Reminder; you can turn it off but not edit it.',
      tabPickers: 'Food & drinks',
      pickersSubtitle: 'Lunch and afternoon drinks - let Reminder pick for you',
      addPicker: 'Add set',
      noPickers: 'No picker sets yet',
      noPickersDesc: 'Build a list of dishes or drinks and Reminder picks one for you at the times you choose.',
      createFirstPicker: 'Create your first set',
      useVietnameseSample: 'Use the Vietnamese food sample',
      pickerSampleName: 'What should I eat today?',
      pickerSampleAdded: 'Vietnamese food sample added',
      addPickerTitle: 'New picker set',
      editPickerTitle: 'Edit picker set',
      pickerName: 'Set name',
      pickerNamePlaceholder: 'What should I eat today?',
      pickerIcon: 'Icon',
      pickerTimes: 'Times',
      pickerWeekdays: 'Days of the week',
      pickerItems: 'Items',
      pickerNoItems: 'No items yet - add at least one so there is something to pick.',
      pickerItemName: 'Item name',
      pickerItemNamePlaceholder: 'Pho, iced coffee…',
      pickerItemEmoji: 'Emoji',
      pickerItemEmojiPlaceholder: '🍜',
      pickerItemImage: 'Image URL',
      pickerItemImagePlaceholder: 'https://example.com/photo.jpg',
      uploadImage: 'Upload',
      clearImage: 'Clear image',
      addItem: 'Add item',
      updateItem: 'Update item',
      pickerImageHint: 'Uploaded images stay on this device and are never synced. Use an https:// link if you want the image on your other devices.',
      pickerEnabledAria: 'Enable this picker set',
      everyDay: 'Every day',
      pickerSaved: 'Picker set saved',
      pickerDeleted: 'Picker set deleted',
      confirmDeletePicker: 'Delete this picker set?',
      confirmDeletePickerItem: 'Remove this option?',
      pickerNeedsItems: 'Add at least one item before previewing.',
      pickerSizeWarning: 'Picker data is over 2 MB. Uploaded images take up a lot of space - use https:// links instead to keep things small.',
      pickerErrorName: 'Enter a name (1-80 characters).',
      pickerErrorIcon: 'The icon can be at most 8 characters.',
      pickerErrorNoTime: 'Add at least one time.',
      pickerErrorMaxTimes: 'You can add up to 10 times.',
      pickerErrorTimeFormat: 'Enter a valid time (HH:mm).',
      pickerErrorTimeDuplicate: 'That time is already in the list.',
      pickerErrorNoWeekday: 'Pick at least one day of the week.',
      pickerErrorDuration: 'Display time must be between 1 and 60 minutes.',
      pickerErrorItemName: 'Enter an item name (1-60 characters).',
      pickerErrorItemEmoji: 'The emoji can be at most 8 characters.',
      pickerErrorMaxItems: 'A set can hold up to 100 options.',
      pickerErrorMaxSets: 'You can create up to 20 picker sets.',
      pickerErrorImageProtocol: 'The image link must start with https://',
      pickerErrorImageUrlLong: 'The image link is too long (2000 characters max).',
      pickerErrorImageTooLarge: 'The image is still larger than 200 KB after resizing. Try a smaller picture.',
      pickerErrorImageRead: 'That file could not be read as an image.',
      pickerErrorImageType: 'Only PNG, JPEG and WebP images are supported.',
      pickerErrorFixFields: 'Please fix the highlighted fields.',
      pickerErrorTooLarge: 'Picker data is too large to save. Remove some uploaded images first.',

      // Picker image search (Wikimedia Commons)
      pickerFindImage: 'Find image',
      pickerImageQuery: 'Search term',
      pickerImageQueryPlaceholder: 'e.g. Phở bò',
      pickerImageSearchGo: 'Search',
      pickerImageSearchHint: 'Photos come from Wikimedia Commons. Picking one stores the author and licence alongside the option. Add words like a city or region for better results.',
      pickerImageLoading: 'Searching Wikimedia Commons…',
      pickerImageEmpty: 'No photos matched. Try a different or more specific search term.',
      pickerImageError: 'Could not reach Wikimedia Commons. Check your connection and try again.',
      pickerImageNeedQuery: 'Type something to search for.',
      pickerImageUseThis: 'Use this photo',
      pickerImageNoCredit: 'Unknown author',
      pickerImageCredit: 'Photo',
      pickerImagePicked: 'Photo added with its credit',
      pickerErrorImageCredit: 'The photo credit could not be read.',

      // Confirm dialog
      confirm: 'OK',

      // ---- Desktop app: popup (contentI18n ported) + desktop-only strings ----
      pickerDialog: 'Random picker',
      pickerSpin: 'Spin',
      pickerSpinAgain: 'Spin again',
      pickerSpinning: 'Spinning…',
      pickerFindPlaces: 'Find places nearby',
      pickerPriceFilter: 'Price range',
      pickerPriceAll: 'Any price',
      pickerKeep: 'Sounds good',
      settingsSubtitleDesktop: 'Customize the app',
      noPickersDescDesktop: 'Build a list of dishes and Reminder will suggest one at the times you choose.',
      pickersUnavailableTitle: 'Not available in your country',
      pickersUnavailableDesc: 'The food and drink picker is currently only available for users in Vietnam. Your sets are kept safe and will come back if it opens up where you are.',
      reminderEnabledAria: 'Turn this reminder on or off',
      reminderOff: 'Off',
      upcomingTitle: 'Coming up',
      noUpcoming: 'Nothing scheduled in the next while.',
      upcomingToday: 'Today',
      upcomingTomorrow: 'Tomorrow',
      trayOpen: 'Open Reminder',
      trayQuit: 'Quit',
      trayPauseNotifications: 'Pause notifications',
      trayResumeNotifications: 'Resume notifications',
      notificationsEnabled: 'Enable notifications',
      notificationsEnabledDesc: 'Turn this off to stop every reminder and food popup',
      pauseNotifications: 'Pause notifications',
      pauseNotificationsDesc: 'Stay quiet for a while, then come back on by itself',
      pause15m: '15 minutes',
      pause1h: '1 hour',
      pauseUntilTomorrow: 'Until tomorrow',
      pausedUntil: 'Paused until {time}',
      resumeNotifications: 'Resume',
      notificationsPausedToast: 'Notifications are off.',
      notificationsResumedToast: 'Notifications are back on.',
      popupPosition: 'Popup position',
      popupPositionDesc: 'Choose the corner of the screen where popups appear',
      posBottomRight: 'Bottom right',
      posBottomLeft: 'Bottom left',
      posTopRight: 'Top right',
      posTopLeft: 'Top left',
      posCenter: 'Center of the screen',
      previewPosition: 'Preview position',
      previewPositionMessage: 'Popups will show up right here',
      system: 'System',
      launchAtStartup: 'Launch at startup',
      launchAtStartupDesc: 'Start Reminder when you sign in to this computer',
      startMinimized: 'Start minimized',
      startMinimizedDesc: 'Stay in the tray when launched at startup',
      closeToTray: 'Keep running in the tray',
      closeToTrayDesc: 'Closing the window hides Reminder to the system tray instead of quitting',
      autostartError: 'Could not change the startup setting.',
      quitApp: 'Quit Reminder',
      updatesGroup: 'Updates',
      checkUpdates: 'Check for updates',
      checkingUpdates: 'Checking for updates…',
      upToDate: 'You are on the latest version.',
      updateAvailable: 'Version {version} is available.',
      updateNow: 'Update now',
      updateLater: 'Later',
      downloading: 'Downloading update…',
      updateInstalling: 'Installing, the app will restart…',
      updateFailed: 'Could not check for updates. Please try again later.',
      updateInstallFailed: 'The update could not be installed.',
      downloadPage: 'Download',
      currentVersion: 'Current version',
      lastChecked: 'Last checked',
      neverChecked: 'Not checked yet',
      updateNotes: 'What is new',
      updateBannerTitle: 'A new version of Reminder is ready',
      resetAllDesc: 'Delete every reminder, set and setting on this device',
      resetAllData: 'Reset all data',
      remindersSubtitleDesktop: 'Gentle reminders while you work'
    },

    vi: {
      // Header
      appTitle: 'Nhắc nhở',
      settings: 'Cài đặt',
      toggleTheme: 'Chuyển đổi giao diện',
      
      // Rating CTA
      ratingText: 'Extension này có ích với bạn',
      ratingSubtext: 'Đánh giá 5 sao để ủng hộ chúng tôi nhé!',
      rateNow: 'Đánh giá ngay',
      
      // Master toggle
      enableReminders: 'Bật nhắc nhở',
      statusEnabled: 'Đang bật',
      statusDisabled: 'Đã tắt',
      
      // Tabs
      tabReminders: 'Nhắc nhở',
      tabAddNew: 'Thêm mới',
      tabNotes: 'Ghi chú',
      tabClipboard: 'Clipboard',
      tabAnnouncements: 'Thông báo',
      tabSettings: 'Cài đặt',
      
      // Announcements
      announcementsSubtitle: 'Lịch sử cập nhật extension',
      markAsRead: 'Đánh dấu đã đọc',
      announcementsMarkedAsRead: 'Đã đánh dấu tất cả là đã đọc',
      tagNew: 'Mới',
      tagUpdate: 'Cập nhật',
      tagFix: 'Sửa lỗi',
      announcement260_1Title: 'Bảng điều khiển Screen Time',
      announcement260_1Desc: 'Theo dõi thời gian duyệt web với bảng điều khiển đẹp mắt. Xem biểu đồ hoạt động theo giờ, website hàng đầu với icon emoji, phân loại theo danh mục (Mạng xã hội, Làm việc, Giải trí...), và so sánh tuần. Hai chế độ thông báo popup: Thời gian thực và Tổng kết với thiết kế glassmorphism.',
      announcement260_2Title: 'Phân loại thông minh',
      announcement260_2Desc: 'Website tự động được phân loại theo danh mục như Mạng xã hội, Làm việc, Giải trí, Mua sắm, Tin tức và Học tập. Xem phân bổ thời gian với biểu đồ donut tương tác và nhận thông tin chi tiết về thói quen duyệt web của bạn.',
      announcement240_2Title: 'Tắt thông báo bằng phím bất kỳ',
      announcement240_2Desc: 'Khi nhấn phím bất kỳ trên bàn phím, popup thông báo sẽ tự động đóng ngay lập tức. Bạn có thể bật tính năng này trong phần cài đặt.',
      announcement200Title: 'Cập nhật lớn - Giao diện mới',
      announcement200Desc: 'Thiết kế lại hoàn toàn với giao diện thanh bên mới, tích hợp Google Calendar, lịch sử clipboard và ghi chú nhanh với phím tắt.',
      
      // Clipboard
      clipboardTitle: 'Lịch sử Clipboard',
      clipboardSubtitle: 'Lịch sử văn bản đã sao chép văn bản trên trình duyệt',
      clipboardInfo: 'Cách hoạt động',
      clipboardInfoDesc: 'Tự động lưu văn bản bạn sao chép. Tối đa 1000 mục hoặc 2MB.',
      clipboardSearch: 'Tìm kiếm...',
      clipboardAllSources: 'Tất cả nguồn',
      clipboardFilterSource: 'Lọc theo nguồn',
      clipboardClearAll: 'Xóa tất cả',
      clipboardEmpty: 'Chưa có lịch sử clipboard',
      clipboardEmptyHint: 'Sao chép văn bản trên bất kỳ trang nào để lưu ở đây',
      clipboardNoResults: 'Không tìm thấy kết quả',
      clipboardTryDifferent: 'Thử từ khóa khác',
      clipboardDetailTitle: 'Chi tiết Clipboard',
      clipboardConfirmClear: 'Xóa tất cả lịch sử clipboard?',
      clipboardCleared: 'Đã xóa clipboard',
      copied: 'Đã sao chép!',
      copy: 'Sao chép',
      close: 'Đóng',
      reminderDetail: 'Chi tiết nhắc nhở',
      source: 'Nguồn',
      weekdays: 'Các ngày',
      totalReminders: 'Tổng cộng',
      noMatchingDates: 'Không tìm thấy ngày phù hợp',
      
      // Reminders list
      noReminders: 'Chưa có nhắc nhở nào',
      addFirstReminder: 'Thêm nhắc nhở đầu tiên',
      repeatEvery: 'Lặp lại mỗi',
      minutes: 'phút',
      fixedTime: 'Giờ cố định',
      edit: 'Sửa',
      delete: 'Xóa',
      
      // Add reminder form
      message: 'Thông điệp',
      enterMessage: 'Nhập thông điệp nhắc nhở...',
      icon: 'Biểu tượng',
      iconHint: 'Bạn có thể copy biểu tượng bên ngoài mà bạn muốn và dán vào ô dưới đây nhé',
      messageColor: 'Màu sắc thông điệp',
      imageUrl: 'Link ảnh (tùy chọn)',
      imageUrlPlaceholder: 'https://example.com/image.png',
      imageUrlHint: 'Hỗ trợ: .png, .jpg, .jpeg, .gif, .webp, .svg, .avif',
      invalidImageUrl: 'Link ảnh không hợp lệ. Hỗ trợ: .png, .jpg, .jpeg, .gif, .webp, .svg, .avif',
      reminderType: 'Loại nhắc nhở',
      repeatByInterval: 'Lặp lại theo thời gian',
      atFixedTime: 'Theo giờ cố định của ngày',
      repeatEveryMinutes: 'Lặp lại mỗi (phút)',
      reminderTimes: 'Giờ nhắc nhở',
      addTime: 'Thêm giờ',
      displayDuration: 'Thời gian hiển thị thông báo (phút)',
      preview: 'Xem trước',
      saveReminder: 'Lưu nhắc nhở',
      
      // Notes
      addNewNote: 'Thêm ghi chú mới',
      noNotes: 'Chưa có ghi chú nào',
      createNoteHint: 'Tạo ghi chú để lưu thông tin hay dùng',
      noteTitle: 'Tiêu đề',
      noteTitlePlaceholder: 'VD: Extension có ích với bạn không?',
      noteContent: 'Nội dung',
      noteContentPlaceholder: 'VD: Nếu thấy extension có ích với bạn, đánh giá 5 để ủng hộ chúng tôi nhé!',
      noteShortcut: 'Ký hiệu kích hoạt',
      noteShortcutPlaceholder: 'VD: /danhgia',
      shortcutHint: 'Bắt đầu bằng / theo sau là chữ cái, số hoặc _',
      saveNote: 'Lưu ghi chú',
      
      // Share/Messaging
      
      // Contact modal
      cancel: 'Hủy',
      
      // Settings
      darkMode: 'Giao diện tối',
      darkModeDesc: 'Dễ nhìn hơn trong điều kiện ánh sáng yếu',
      lowPerfMode: 'Chế độ hiệu suất thấp',
      lowPerfModeDesc: 'Giảm hiệu ứng cho máy cấu hình yếu',
      soundNotification: 'Âm thanh thông báo',
      soundDesc: 'Phát âm thanh khi hiển thị nhắc nhở',
      notificationVolume: 'Âm lượng thông báo',
      volumeDesc: 'Điều chỉnh độ to của âm thanh',
      
      // Excluded Websites
      excludedWebsites: 'Website loại trừ',
      excludedWebsitesDesc: 'Popup thông báo sẽ không hiển thị trên các website này',
      enterWebsite: 'Nhập website (VD: example.com)',
      quickAdd: 'Thêm nhanh:',
      websiteAdded: 'Đã thêm website',
      websiteRemoved: 'Đã xóa website',
      websiteExists: 'Website đã có trong danh sách',
      enterValidWebsite: 'Vui lòng nhập website hợp lệ',
      invalidDomain: 'Vui lòng nhập tên miền hợp lệ',
      noExcludedWebsites: 'Chưa có website nào được loại trừ',
      
      dataManagement: 'Quản lý dữ liệu',
      exportData: 'Xuất dữ liệu',
      importData: 'Nhập dữ liệu',
      resetAll: 'Đặt lại tất cả',
      version: 'Phiên bản',
      createdBy: 'Được tạo với ❤️ bởi noti.vn',
      fanpage: 'Fanpage',
      website: 'Website',
      bugReport: 'Báo lỗi, yêu cầu tính năng',
      here: 'tại đây',
      
      // Edit modal
      editReminder: 'Chỉnh sửa nhắc nhở',
      saveChanges: 'Lưu thay đổi',
      
      // Note modal
      addNoteTitle: 'Thêm ghi chú mới',
      editNoteTitle: 'Sửa ghi chú',
      
      // Notifications
      reminderSaved: 'Đã thêm nhắc nhở mới!',
      reminderDeleted: 'Đã xóa nhắc nhở!',
      noteSaved: 'Đã lưu ghi chú!',
      noteDeleted: 'Đã xóa ghi chú!',
      previewSent: 'Đã gửi thông báo xem trước!',
      previewError: 'Lỗi khi hiển thị xem trước',
      addTimeError: 'Vui lòng thêm ít nhất một giờ nhắc nhở',
      enterReminderError: 'Vui lòng nhập nội dung nhắc nhở để xem trước',
      dataExported: 'Đã xuất dữ liệu!',
      dataImported: 'Đã nhập dữ liệu thành công!',
      invalidFile: 'Tệp không hợp lệ',
      tooManyReminders: 'Quá nhiều mốc thời gian - vui lòng rút ngắn khoảng ngày.',
      enterNoteTitle: 'Vui lòng nhập tiêu đề',
      enterNoteContent: 'Vui lòng nhập nội dung',
      invalidShortcut: 'Phím tắt phải bắt đầu bằng / (ví dụ /hello)',
      dataReset: 'Đã đặt lại tất cả dữ liệu!',
      
      // Confirmations
      confirmDeleteReminder: 'Xóa nhắc nhở này?',
      confirmDeleteNote: 'Xóa ghi chú này?',
      confirmReset: 'Bạn có chắc muốn đặt lại tất cả dữ liệu? Hành động này không thể hoàn tác.',
      
      // Content script notifications
      
      // Default reminders
      defaultWaterReminder: 'Đã đến lúc uống nước rồi!',
      defaultStandupReminder: 'Đứng dậy đi lại một chút nhé!',
      
      // Misc
      use: 'Sử dụng',
      remove: 'Xóa',
      
      // Google Calendar
      tabCalendar: 'Lịch',
      googleCalendar: 'Google Calendar',
      notConnected: 'Chưa kết nối',
      connected: 'Đã kết nối',
      connecting: 'Đang kết nối...',
      connectGoogle: 'Kết nối Google',
      disconnect: 'Ngắt kết nối',
      autoSync: 'Tự động đồng bộ',
      autoSyncDesc: 'Tự động đồng bộ sự kiện từ Google Calendar trong khoảng 7 ngày. Thông báo 10p trước khi đến giờ',
      remindBefore: 'Nhắc trước sự kiện',
      remindBeforeDesc: 'Nhận thông báo trước khi sự kiện bắt đầu',
      selectCalendars: 'Chọn lịch',
      selectCalendarsDesc: 'Chọn lịch nào để đồng bộ',
      syncNow: 'Đồng bộ ngay',
      syncing: 'Đang đồng bộ...',
      upcomingEvents: 'Sự kiện sắp tới',
      noEvents: 'Không có sự kiện sắp tới',
      lastSync: 'Đồng bộ lần cuối',
      calendarConnected: 'Đã kết nối Google Calendar!',
      calendarDisconnected: 'Đã ngắt kết nối Google Calendar',
      calendarSynced: 'Đồng bộ lịch thành công!',
      calendarSyncError: 'Không thể đồng bộ lịch',
      calendarLoginError: 'Không thể kết nối Google Calendar',
      confirmDisconnect: 'Bạn có chắc muốn ngắt kết nối Google Calendar?',
      eventsFound: 'sự kiện tìm thấy',
      remindersCreated: 'nhắc nhở được tạo',
      allDay: 'Cả ngày',
      calendarEventReminder: 'Sự kiện sẽ bắt đầu sau',
      minutesShort: 'phút',
      
      // Side Panel specific
      tabDashboard: 'Tổng quan',
      welcomeBack: 'Chào mừng bạn!',
      dashboardSubtitle: 'Tổng quan hoạt động',
      activeReminders: 'Nhắc nhở',
      todayNotifications: 'Hôm nay',
      quickActions: 'Thao tác nhanh',
      addReminder: 'Thêm nhắc nhở',
      addNote: 'Thêm ghi chú',
      upcomingReminders: 'Nhắc nhở sắp tới',
      viewAll: 'Xem tất cả',
      remindersSubtitle: 'Quản lý nhắc nhở thông báo hiển thị trên trình duyệt',
      calendarSubtitle: 'Đồng bộ sự kiện từ Google Calendar',
      connectGoogleDesc: 'Nhận nhắc nhở từ sự kiện Google Calendar (hiện tại chỉ áp dụng với Google Chrome)',
      notesSubtitle: 'Lưu thông tin hay dùng với phím tắt',
      settingsSubtitle: 'Tùy chỉnh extension',
      appearance: 'Giao diện',
      languageDesc: 'Chọn ngôn ngữ',
      optional: 'tùy chọn',
      
      save: 'Lưu',

      // New features - Date Range
      dateRange: 'Theo khoảng thời gian',
      dateRangeSettings: 'Cài đặt khoảng ngày',
      fromDate: 'Từ',
      toDate: 'đến',
      atTime: 'Giờ',
      timeSlots: 'Khung giờ',
      days: 'ngày',
      times: 'lần',
      timeExists: 'Khung giờ đã tồn tại',
      timeAdded: 'Đã thêm khung giờ',
      selectDateRange: 'Chọn khoảng ngày để xem tóm tắt',
      selectDays: 'Vui lòng chọn ít nhất một ngày',
      reminders: 'lời nhắc',
      sun: 'CN',
      mon: 'T2',
      tue: 'T3',
      wed: 'T4',
      thu: 'T5',
      fri: 'T6',
      sat: 'T7',
      
      // New features - Emoji & Color Picker
      selectEmoji: 'Chọn Emoji',
      searchEmoji: 'Tìm emoji...',
      selectColor: 'Chọn màu',
      customColor: 'Màu tùy chỉnh',
      apply: 'Áp dụng',
      moreEmoji: '+ Emoji',
      moreColor: '+ Màu',
      
      // New features - Share
      expand: 'Mở rộng',
      collapse: 'Thu gọn',
      
      // New features - Onboarding
      welcomeTitle: 'Chào mừng đến Health Reminder!',
      welcomeDesc: 'Trợ lý năng suất & sức khỏe đa năng. Hãy khám phá các tính năng!',
      remindersTitle: 'Nhắc nhở sức khỏe',
      remindersDesc: 'Thiết lập nhắc nhở uống nước, nghỉ mắt, vận động và nhiều hơn. Tùy chỉnh khoảng thời gian hoặc đặt giờ cụ thể.',
      clipboardDesc: 'Tự động lưu mọi thứ bạn copy. Tìm kiếm, ghim mục quan trọng và paste bất cứ lúc nào. Không bao giờ mất nội dung đã copy!',
      notesTitle: 'Ghi chú nhanh',
      notesDesc: 'Tạo ghi chú với phím tắt. Gõ / trong ô nhập liệu để truy cập ghi chú ngay lập tức. Hoàn hảo cho mẫu và đoạn văn.',
      calendarTitle: 'Đồng bộ Google Calendar',
      calendarDesc: 'Kết nối Google Calendar để nhận nhắc nhở sự kiện. Không bao giờ bỏ lỡ cuộc họp quan trọng.',
      excludeTitle: 'Loại trừ Website',
      excludeDesc: 'Tắt thông báo trên các website cụ thể như cuộc gọi video hoặc xem phim. Vào Cài đặt để cấu hình.',
      getStartedTitle: 'Bạn đã sẵn sàng!',
      getStartedDesc: 'Bắt đầu bằng cách tạo nhắc nhở đầu tiên. Nhấn nút Hướng dẫn bất cứ lúc nào để xem lại hướng dẫn này.',
      next: 'Tiếp',
      skip: 'Bỏ qua',
      getStarted: 'Bắt đầu',
      tutorial: 'Hướng dẫn',
      
      // Dismiss by keypress
      dismissByKeypress: 'Đóng bằng phím bất kỳ',
      dismissByKeypressDesc: 'Nhấn phím bất kỳ để đóng popup',

      // Screen Time
      tabScreenTime: 'Thời gian sử dụng',
      screenTimeSubtitle: 'Theo dõi hoạt động duyệt web',
      screenTimeToday: 'Thời gian hôm nay',
      viewDetails: 'Chi tiết',
      periodToday: 'Hôm nay',
      periodWeek: 'Tuần này',
      periodMonth: 'Tháng này',
      totalScreenTime: 'Tổng thời gian sử dụng',
      totalThisWeek: 'Tổng tuần này',
      totalThisMonth: 'Tổng tháng này',
      vsYesterday: 'so với hôm qua',
      comparedToYesterday: 'So với hôm qua',
      topWebsites: 'Website hàng đầu',
      stWebsites: 'Websites',
      dailyBreakdown: 'Theo từng ngày',
      noScreenTimeData: 'Chưa có dữ liệu duyệt web. Hãy bắt đầu lướt web để xem hoạt động của bạn.',
      screenTimePopupSettings: 'Thông báo popup',
      enableScreenTimePopup: 'Popup thời gian sử dụng',
      screenTimePopupDesc: 'Hiển thị nhắc nhở thời gian duyệt web định kỳ',
      popupInterval: 'Khoảng thời gian nhắc',
      popupIntervalDesc: 'Tần suất hiển thị popup thời gian sử dụng',
      screenTimePopupEnabled: 'Đã bật popup thời gian sử dụng',
      screenTimePopupDisabled: 'Đã tắt popup thời gian sử dụng',
      intervalUpdated: 'Đã cập nhật khoảng thời gian',
      stToday: 'Hôm nay',
      stWeekAvg: 'TB tuần',
      stVisits: 'Lượt truy cập',
      stHourlyActivity: 'Hoạt động theo giờ',
      stCategories: 'Danh mục',
      stTotal: 'Tổng',
      stWeekComparison: 'So sánh tuần',
      stThisWeek: 'Tuần này',
      stLastWeek: 'Tuần trước',
      stPopupMode: 'Chế độ thông báo',
      stPopupModeDesc: 'Chọn kiểu hiển thị thông báo',
      stModeRealtime: 'Thời gian thực',
      stModeSummary: 'Tổng kết',
      settingsSaved: 'Đã lưu cài đặt',
      // Cloud Sync
      cloudSync: 'Đồng bộ đám mây',
      cloudSyncDesc: 'Đăng nhập để đồng bộ cài đặt & nhắc nhở. Dữ liệu lưu trực tiếp trên Google Drive của bạn và tự động đồng bộ sang thiết bị khác.',
      cloudSyncTitle: 'Đăng nhập Google để đồng bộ',
      cloudSyncIntro: 'Đăng nhập để đồng bộ toàn bộ cài đặt và nhắc nhở của bạn. Dữ liệu được lưu trực tiếp trên Google Drive của bạn và tự động đồng bộ sang các thiết bị khác khi đăng nhập cùng tài khoản.',
      signInWithGoogle: 'Đăng nhập với Google',
      later: 'Để sau',
      syncAccount: 'Tài khoản',
      syncStatus: 'Trạng thái',
      syncNow: 'Đồng bộ ngay',
      signOut: 'Đăng xuất',
      syncing: 'Đang đồng bộ...',
      syncError: 'Lỗi đồng bộ',
      syncDone: 'Đã đồng bộ',
      syncLoginSuccess: 'Đã đăng nhập & đồng bộ',
      syncLoginFailed: 'Đăng nhập thất bại',
      signedOut: 'Đã đăng xuất',
      confirmSyncLogout: 'Đăng xuất khỏi đồng bộ? Dữ liệu trên máy này được giữ nguyên.',
      // Announcement v2.9.2
      announcement216_1Title: 'Tab mới: Ăn uống',
      announcement216_1Desc: 'Khỏi phải nghĩ trưa nay ăn gì. Đến giờ bạn đặt, popup sẽ quay như mở hòm rồi dừng lại ở một món kèm ảnh thật, cứ thế mà đi ăn. Reminder gửi sẵn hai bộ cho người dùng ở Việt Nam - 128 món ăn trưa lúc 11:30 và 42 đồ uống không cồn cho trà chiều lúc 15:00 - nên bạn không phải tạo gì; muốn tắt bộ nào thì tắt ngay trong tab Ăn uống. Bạn vẫn có thể tự tạo bộ riêng với danh sách và lịch của mình.',
      announcement216_2Title: 'Quay trong tầm tiền của bạn',
      announcement216_2Desc: 'Mỗi món ăn và đồ uống đều có khoảng giá, và popup cho bạn chọn mức giá trước khi quay - mọi mức giá, dưới 30k, 30-60k, 60-100k hoặc từ 100k trở lên. Món trúng hiện cỡ lớn kèm ảnh và khoảng giá, bấm "Tìm quán gần đây" là mở Google Maps tìm đúng món đó quanh bạn.',
      announcement216_3Title: 'Giờ hiển thị do bạn quyết',
      announcement216_3Desc: 'Bạn ăn lúc 12h chứ không phải 11:30? Vào tab Ăn uống đổi giờ của bất kỳ bộ nào - giờ bạn đặt chỉ áp dụng trên máy này, và một chạm là quay về giờ mặc định. Tab này giờ dùng chung giao diện và thao tác với tab Nhắc nhở, còn nút Xem trước hiện popup ngay lập tức thay vì phải chờ.',
      announcement292_1Title: 'Tinh gọn, tập trung hơn',
      announcement292_1Desc: 'Để tuân thủ chính sách "một mục đích duy nhất" của Chrome Web Store, các tính năng Chặn quảng cáo, Chặn theo dõi, Bảo vệ riêng tư (làm mờ) và Khóa trình duyệt đã được gỡ bỏ. Reminder giờ tập trung giúp bạn làm việc lành mạnh và tập trung: nhắc nghỉ ngơi, thống kê thời gian dùng web và ghi chú nhanh. Cài đặt cũ của các tính năng đã gỡ được tự động dọn dẹp, extension nhẹ hơn và cần ít quyền hơn.',
      // Announcement v2.9.0 (merges the v2.7.0 + v2.7.1 content)
      announcement290_1Title: 'Đồng bộ đám mây với Google',
      announcement290_1Desc: 'Đăng nhập Google để đồng bộ nhắc nhở và cài đặt trên nhiều thiết bị. Dữ liệu được lưu riêng tư trong Google Drive của bạn và tự động đồng bộ - cài đặt một lần, dùng tiếp liền mạch trên mọi thiết bị.',
      announcement290_2Title: 'Tự động dãn cách thông báo',
      announcement290_2Desc: 'Khi nhiều nhắc nhở trùng giờ (ví dụ "uống nước" mỗi 30 phút trùng với "đứng dậy" mỗi 60 phút), chúng sẽ hiển thị cách nhau thay vì cùng lúc - không còn nhắc nhở nào bị chồng lên nhau hay bỏ sót.',
      announcement290_3Title: 'Bảo mật & ổn định',
      announcement290_3Desc: 'Thu thập clipboard mặc định tắt và không đồng bộ, tăng cường xử lý dữ liệu an toàn và bảo vệ quyền riêng tư, cùng hoàn thiện đa ngôn ngữ và trợ năng.',

      // Announcement v2.6.2
      announcement262_1Title: 'Bảng điều khiển cuộn được & sửa giao diện',
      announcement262_1Desc: 'Tab Tổng quan giờ có thể cuộn dọc - nội dung không còn bị dồn ép trên màn hình nhỏ. Mục Thời gian sử dụng hôm nay được sắp xếp lại để đồng nhất với các mục khác, có tiêu đề và nút Chi tiết.',
      announcement262_2Title: 'Sửa lỗi popup xem trước bị nhân đôi',
      announcement262_2Desc: 'Đã sửa lỗi khi nhấn Xem trước trong Thao tác nhanh làm hiện nhiều popup thông báo chồng lên nhau cùng lúc. Thêm cơ chế chống đăng ký trùng listener khi content script được chèn lại.',

      // Missing UI labels (C3)
      about: 'Giới thiệu',
      notifications: 'Thông báo',
      language: 'Ngôn ngữ',
      notes: 'Ghi chú',
      clipboardItems: 'Clipboard',
      savePassword: 'Lưu mật khẩu',
      helpSupport: 'Trợ giúp & hỗ trợ',
      resetStats: 'Đặt lại thống kê',
      uploadBackground: 'Tải ảnh nền lên',
      removeBackground: 'Xóa ảnh nền',
      togglePassword: 'Hiện/ẩn mật khẩu',
      moreColors: 'Thêm màu',
      addToWhitelist: 'Thêm vào danh sách trắng',
      addWebsite: 'Thêm website',
      clipboardStatsInfo: 'Mức sử dụng clipboard: số mục và dung lượng lưu trữ',

      // Accessibility labels (T1/T7)
      switchLanguage: 'Chuyển ngôn ngữ',
      colorBlue: 'Xanh dương',
      colorGreen: 'Xanh lá',
      colorOrange: 'Cam',
      colorRed: 'Đỏ',

      // Clipboard capture opt-out
      clipboardCapture: 'Lưu văn bản đã sao chép',
      clipboardCaptureDesc: 'Lịch sử clipboard chỉ được lưu cục bộ trên thiết bị này và mặc định tắt. Bật lên để bắt đầu lưu văn bản bạn sao chép.',

      // Pickers (random pick sets)
      serverPickersTitle: 'Gợi ý từ Reminder',
      serverPickersDesc: 'Bộ chọn do Reminder gửi theo khu vực của bạn - tự chạy sẵn. Bạn có thể tắt bất cứ lúc nào.',
      serverPickerBadge: 'Từ Reminder',
      serverPickerEditTime: 'Đổi giờ hiển thị',
      serverPickerTimeTitle: 'Popup này hiện lúc mấy giờ?',
      serverPickerTimeHint: 'Giờ do bạn đặt, chỉ áp dụng trên máy này. Danh sách món vẫn do Reminder quản lý.',
      serverPickerTimeReset: 'Dùng giờ mặc định',
      serverPickerCustomTime: 'giờ của bạn',
      serverPickerBadgeTitle: 'Do Reminder cấu hình; bạn có thể tắt nhưng không sửa được.',
      tabPickers: 'Ăn uống',
      pickersSubtitle: 'Bữa trưa và trà chiều - để Reminder lựa chọn giúp bạn',
      addPicker: 'Thêm bộ chọn',
      noPickers: 'Chưa có bộ chọn nào',
      noPickersDesc: 'Tạo danh sách món ăn hoặc đồ uống, Reminder sẽ bốc giúp bạn vào đúng giờ bạn đặt.',
      createFirstPicker: 'Tạo bộ đầu tiên',
      useVietnameseSample: 'Dùng mẫu món Việt',
      pickerSampleName: 'Hôm nay ăn gì?',
      pickerSampleAdded: 'Đã thêm mẫu món Việt',
      addPickerTitle: 'Tạo bộ chọn',
      editPickerTitle: 'Sửa bộ chọn',
      pickerName: 'Tên bộ',
      pickerNamePlaceholder: 'Hôm nay ăn gì?',
      pickerIcon: 'Biểu tượng',
      pickerTimes: 'Giờ hiển thị',
      pickerWeekdays: 'Các thứ trong tuần',
      pickerItems: 'Danh sách món',
      pickerNoItems: 'Chưa có món nào - thêm ít nhất một món để có thứ để bốc.',
      pickerItemName: 'Tên món',
      pickerItemNamePlaceholder: 'Phở, cà phê sữa đá…',
      pickerItemEmoji: 'Emoji',
      pickerItemEmojiPlaceholder: '🍜',
      pickerItemImage: 'Ảnh (URL)',
      pickerItemImagePlaceholder: 'https://example.com/photo.jpg',
      uploadImage: 'Tải ảnh lên',
      clearImage: 'Xóa ảnh',
      addItem: 'Thêm món',
      updateItem: 'Cập nhật món',
      pickerImageHint: 'Ảnh tải lên chỉ được lưu trên máy này và không đồng bộ. Dùng liên kết https:// nếu bạn muốn ảnh xuất hiện trên các thiết bị khác.',
      pickerEnabledAria: 'Bật bộ chọn này',
      everyDay: 'Hằng ngày',
      pickerSaved: 'Đã lưu bộ chọn',
      pickerDeleted: 'Đã xóa bộ chọn',
      confirmDeletePicker: 'Xóa bộ chọn này?',
      confirmDeletePickerItem: 'Xóa món này?',
      pickerNeedsItems: 'Hãy thêm ít nhất một món trước khi xem trước.',
      pickerSizeWarning: 'Dữ liệu bộ chọn đã vượt 2 MB. Ảnh tải lên chiếm nhiều dung lượng - hãy dùng liên kết https:// để nhẹ hơn.',
      pickerErrorName: 'Nhập tên bộ (1-80 ký tự).',
      pickerErrorIcon: 'Biểu tượng tối đa 8 ký tự.',
      pickerErrorNoTime: 'Thêm ít nhất một mốc giờ.',
      pickerErrorMaxTimes: 'Chỉ thêm được tối đa 10 mốc giờ.',
      pickerErrorTimeFormat: 'Giờ không hợp lệ (HH:mm).',
      pickerErrorTimeDuplicate: 'Mốc giờ này đã có trong danh sách.',
      pickerErrorNoWeekday: 'Chọn ít nhất một thứ trong tuần.',
      pickerErrorDuration: 'Thời gian hiển thị phải từ 1 đến 60 phút.',
      pickerErrorItemName: 'Nhập tên món (1-60 ký tự).',
      pickerErrorItemEmoji: 'Emoji tối đa 8 ký tự.',
      pickerErrorMaxItems: 'Mỗi bộ chứa tối đa 100 món.',
      pickerErrorMaxSets: 'Bạn chỉ tạo được tối đa 20 bộ chọn.',
      pickerErrorImageProtocol: 'Liên kết ảnh phải bắt đầu bằng https://',
      pickerErrorImageUrlLong: 'Liên kết ảnh quá dài (tối đa 2000 ký tự).',
      pickerErrorImageTooLarge: 'Ảnh vẫn lớn hơn 200 KB sau khi thu nhỏ. Hãy thử ảnh nhỏ hơn.',
      pickerErrorImageRead: 'Không đọc được tệp này như một ảnh.',
      pickerErrorImageType: 'Chỉ hỗ trợ ảnh PNG, JPEG và WebP.',
      pickerErrorFixFields: 'Vui lòng sửa các trường được đánh dấu.',
      pickerErrorTooLarge: 'Dữ liệu bộ chọn quá lớn để lưu. Hãy bớt vài ảnh tải lên.',

      // Picker image search (Wikimedia Commons)
      pickerFindImage: 'Tìm ảnh',
      pickerImageQuery: 'Từ khóa tìm ảnh',
      pickerImageQueryPlaceholder: 'ví dụ: Phở bò',
      pickerImageSearchHint: 'Ảnh lấy từ Wikimedia Commons. Khi bạn chọn một ảnh, tên tác giả và giấy phép sẽ được lưu kèm món. Thêm tên tỉnh/thành vào từ khóa để ra kết quả sát hơn.',
      pickerImageSearchGo: 'Tìm',
      pickerImageLoading: 'Đang tìm trên Wikimedia Commons…',
      pickerImageEmpty: 'Không có ảnh phù hợp. Hãy thử từ khóa khác hoặc cụ thể hơn.',
      pickerImageError: 'Không kết nối được tới Wikimedia Commons. Kiểm tra mạng rồi thử lại.',
      pickerImageNeedQuery: 'Nhập từ khóa để tìm ảnh.',
      pickerImageUseThis: 'Dùng ảnh này',
      pickerImageNoCredit: 'Không rõ tác giả',
      pickerImageCredit: 'Ảnh',
      pickerImagePicked: 'Đã thêm ảnh kèm ghi công',
      pickerErrorImageCredit: 'Không đọc được thông tin ghi công của ảnh.',

      // Confirm dialog
      confirm: 'Đồng ý',

      // ---- Desktop app: popup (contentI18n ported) + desktop-only strings ----
      pickerDialog: 'Bộ chọn ngẫu nhiên',
      pickerSpin: 'Quay',
      pickerSpinAgain: 'Quay lại',
      pickerSpinning: 'Đang quay…',
      pickerFindPlaces: 'Tìm quán gần đây',
      pickerPriceFilter: 'Khoảng giá',
      pickerPriceAll: 'Mọi mức giá',
      pickerKeep: 'Chốt món này',
      settingsSubtitleDesktop: 'Tùy chỉnh ứng dụng',
      noPickersDescDesktop: 'Lập danh sách món và Reminder sẽ gợi ý một món vào giờ bạn chọn.',
      pickersUnavailableTitle: 'Chưa hỗ trợ ở quốc gia của bạn',
      pickersUnavailableDesc: 'Bộ chọn món ăn và đồ uống hiện chỉ dành cho người dùng ở Việt Nam. Các bộ bạn đã tạo vẫn được giữ nguyên và sẽ hiện lại khi tính năng mở ở nơi bạn đang ở.',
      reminderEnabledAria: 'Bật hoặc tắt nhắc nhở này',
      reminderOff: 'Đang tắt',
      upcomingTitle: 'Sắp tới',
      noUpcoming: 'Chưa có mốc nào sắp diễn ra.',
      upcomingToday: 'Hôm nay',
      upcomingTomorrow: 'Ngày mai',
      trayOpen: 'Mở Reminder',
      trayQuit: 'Thoát',
      trayPauseNotifications: 'Tạm dừng thông báo',
      trayResumeNotifications: 'Bật lại thông báo',
      notificationsEnabled: 'Bật thông báo',
      notificationsEnabledDesc: 'Tắt đi là dừng mọi popup nhắc nhở và ăn uống',
      pauseNotifications: 'Tạm dừng thông báo',
      pauseNotificationsDesc: 'Im lặng một lúc rồi tự bật lại',
      pause15m: '15 phút',
      pause1h: '1 giờ',
      pauseUntilTomorrow: 'Đến sáng mai',
      pausedUntil: 'Đang tạm dừng đến {time}',
      resumeNotifications: 'Bật lại',
      notificationsPausedToast: 'Đã tắt thông báo.',
      notificationsResumedToast: 'Đã bật lại thông báo.',
      popupPosition: 'Vị trí hiển thị',
      popupPositionDesc: 'Chọn góc màn hình popup sẽ hiện ra',
      posBottomRight: 'Dưới bên phải',
      posBottomLeft: 'Dưới bên trái',
      posTopRight: 'Trên bên phải',
      posTopLeft: 'Trên bên trái',
      posCenter: 'Chính giữa màn hình',
      previewPosition: 'Xem thử vị trí',
      previewPositionMessage: 'Thông báo sẽ hiện ra ở vị trí này',
      system: 'Hệ thống',
      launchAtStartup: 'Khởi động cùng máy',
      launchAtStartupDesc: 'Tự mở Reminder khi bạn đăng nhập vào máy tính',
      startMinimized: 'Khởi động ở chế độ thu nhỏ',
      startMinimizedDesc: 'Nằm sẵn ở khay hệ thống khi khởi động cùng máy',
      closeToTray: 'Chạy ngầm ở khay hệ thống',
      closeToTrayDesc: 'Đóng cửa sổ sẽ ẩn Reminder xuống khay thay vì thoát hẳn',
      autostartError: 'Không đổi được cài đặt khởi động cùng máy.',
      quitApp: 'Thoát Reminder',
      updatesGroup: 'Cập nhật',
      checkUpdates: 'Kiểm tra cập nhật',
      checkingUpdates: 'Đang kiểm tra cập nhật…',
      upToDate: 'Bạn đang dùng phiên bản mới nhất.',
      updateAvailable: 'Đã có phiên bản {version}.',
      updateNow: 'Cập nhật ngay',
      updateLater: 'Để sau',
      downloading: 'Đang tải bản cập nhật…',
      updateInstalling: 'Đang cài đặt, ứng dụng sẽ khởi động lại…',
      updateFailed: 'Không kiểm tra được cập nhật. Vui lòng thử lại sau.',
      updateInstallFailed: 'Không cài được bản cập nhật.',
      downloadPage: 'Tải về',
      currentVersion: 'Phiên bản hiện tại',
      lastChecked: 'Kiểm tra lần cuối',
      neverChecked: 'Chưa kiểm tra',
      updateNotes: 'Có gì mới',
      updateBannerTitle: 'Đã có phiên bản Reminder mới',
      resetAllDesc: 'Xóa toàn bộ nhắc nhở, bộ chọn và cài đặt trên máy này',
      resetAllData: 'Đặt lại toàn bộ dữ liệu',
      remindersSubtitleDesktop: 'Nhắc nhở nhẹ nhàng trong lúc bạn làm việc'
    }
  },
  
  // Get translation
  t(key) {
    const lang = this.translations[this.currentLang];
    return lang[key] || this.translations.en[key] || key;
  },
  
  // Set language
  async setLanguage(lang) {
    if (this.translations[lang]) {
      this.currentLang = lang;
      try {
        if (window.Platform && window.Platform.storage) await window.Platform.storage.set({ language: lang });
      } catch (e) { /* storage may not be ready yet */ }
      this.applyTranslations();
    }
  },

  // Current language ('en' | 'vi')
  getLanguage() {
    return this.currentLang;
  },
  
  // Load saved language
  async loadLanguage() {
    try {
      if (window.Platform && window.Platform.ready) await window.Platform.ready;
      const result = (window.Platform && window.Platform.storage) ? await window.Platform.storage.get(['language']) : {};
      this.currentLang = this.translations[result.language] ? result.language : 'en'; // Default to English
    } catch (e) {
      this.currentLang = 'en';
    }
  },
  
  // Toggle language
  async toggleLanguage() {
    const newLang = this.currentLang === 'en' ? 'vi' : 'en';
    await this.setLanguage(newLang);
  },
  
  // Update language toggle icon
  updateLangToggleIcon() {
    const btn = document.getElementById('langToggle');
    if (btn) {
      const flagEn = btn.querySelector('.flag-en');
      const flagVi = btn.querySelector('.flag-vi');
      if (flagEn && flagVi) {
        if (this.currentLang === 'en') {
          flagEn.style.display = 'block';
          flagVi.style.display = 'none';
        } else {
          flagEn.style.display = 'none';
          flagVi.style.display = 'block';
        }
      }
    }
  },
  
  // SP-10: Legacy translator converted to safe no-op stubs.
  // The old popup layout these targeted no longer exists; the live UI is
  // translated by applyTranslations() via data-i18n attributes. Stubs are kept
  // (instead of deleted) so external callers keep working without errors.
  updateUI() {},
  updateMasterStatus() {},
  updateAddReminderForm() {},
  updateNotesTab() {},
  updateShareTab() {},
  updateSettingsTab() {},
  updateEditModal() {},
  updateNoteModal() {},
  updateContactModal() {},
  // New method: Apply translations using data-i18n attributes
  applyTranslations() {
    // Update document lang
    document.documentElement.lang = this.currentLang;
    
    // Translate all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key && this.t(key) !== key) {
        el.textContent = this.t(key);
      }
    });
    
    // Translate placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key && this.t(key) !== key) {
        el.placeholder = this.t(key);
      }
    });
    
    // Translate titles
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key && this.t(key) !== key) {
        el.title = this.t(key);
      }
    });

    // Translate aria-labels (T1/T7)
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      if (key && this.t(key) !== key) {
        el.setAttribute('aria-label', this.t(key));
      }
    });

    // Update flag icons
    this.updateLangToggleIcon();
  }
};

// Export for use in other files
window.i18n = i18n;

} // End of if block