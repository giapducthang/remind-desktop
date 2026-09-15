// lib.rs - Rust shell for Reminder desktop (Tauri v2).
// Contract: DESKTOP-SPEC §8. The frontend (src) calls these commands through
// invoke (see src/js/platform.js and src/js/popup-host.js). Renaming a command or an event means
// updating the SPEC first.
//
// Commands: app_info, show_main_window, hide_main_window, quit_app, show_popup {width,height,position?},
//       hide_popup, set_tray_labels {open,quit,notifications?}, set_close_to_tray {enabled}.
// Events Rust -> main: scheduler:tick (every 30s), app:show-main (tray / second instance),
//       app:toggle-notifications (the "notif" item on the tray menu - SPEC §20.3).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, State, WebviewWindow, WindowEvent,
    Wry,
};
use tauri_plugin_autostart::MacosLauncher;

const MAIN_LABEL: &str = "main";
const POPUP_LABEL: &str = "popup";
const TRAY_ID: &str = "reminder-tray";
const EVENT_TICK: &str = "scheduler:tick";
const EVENT_SHOW_MAIN: &str = "app:show-main";
const EVENT_TOGGLE_NOTIFICATIONS: &str = "app:toggle-notifications";
const TICK_SECS: u64 = 30;

// Popup: 16px (logical) from the edge of the work area, with a taskbar height guess when the work area
// cannot be read.
const POPUP_MARGIN: f64 = 16.0;
const TASKBAR_GUESS: f64 = 48.0;
const POPUP_MIN: f64 = 80.0;
const POPUP_MAX: f64 = 1600.0;
const TRAY_LABEL_MAX: usize = 40;

// Default tray labels (English) used before JS calls set_tray_labels with the chosen language.
const DEFAULT_OPEN_LABEL: &str = "Open Reminder";
const DEFAULT_NOTIF_LABEL: &str = "Pause notifications";
const DEFAULT_QUIT_LABEL: &str = "Quit";

/// Labels of the 3 tray menu items (open, notif, quit) - JS overrides them per language.
#[derive(Clone)]
struct TrayLabels {
    open: String,
    notif: String,
    quit: String,
}

impl Default for TrayLabels {
    fn default() -> Self {
        Self {
            open: DEFAULT_OPEN_LABEL.to_string(),
            notif: DEFAULT_NOTIF_LABEL.to_string(),
            quit: DEFAULT_QUIT_LABEL.to_string(),
        }
    }
}

/// Shared state that JS changes through commands.
struct AppState {
    close_to_tray: AtomicBool,
    launch_minimized: bool,
    tray_labels: Mutex<TrayLabels>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    os: &'static str,
    arch: &'static str,
    version: String,
    launch_minimized: bool,
}

fn err_string<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------

fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN_LABEL) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// Show the main window on request from the tray / a second instance and tell JS about it.
fn show_main_requested(app: &AppHandle) {
    show_main(app);
    let _ = app.emit_to(MAIN_LABEL, EVENT_SHOW_MAIN, ());
}

#[tauri::command]
fn app_info(app: AppHandle, state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        version: app.package_info().version.to_string(),
        launch_minimized: state.launch_minimized,
    }
}

#[tauri::command]
fn show_main_window(app: AppHandle) {
    show_main(&app);
}

#[tauri::command]
fn hide_main_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN_LABEL) {
        let _ = win.hide();
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn set_close_to_tray(state: State<'_, AppState>, enabled: bool) {
    state.close_to_tray.store(enabled, Ordering::Relaxed);
}

// ---------------------------------------------------------------------------
// Popup window
// ---------------------------------------------------------------------------

/// Popup anchor - the 5 positions the user can pick (SPEC §22.3). Unknown/missing value -> `bottom-right`.
#[derive(Clone, Copy)]
enum PopupAnchor {
    BottomRight,
    BottomLeft,
    TopRight,
    TopLeft,
    Center,
}

impl PopupAnchor {
    fn parse(raw: Option<&str>) -> Self {
        match raw.unwrap_or("").trim().to_ascii_lowercase().as_str() {
            "bottom-left" => PopupAnchor::BottomLeft,
            "top-right" => PopupAnchor::TopRight,
            "top-left" => PopupAnchor::TopLeft,
            "center" => PopupAnchor::Center,
            // Covers "bottom-right" and every other unknown string: keep the old behaviour.
            _ => PopupAnchor::BottomRight,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            PopupAnchor::BottomRight => "bottom-right",
            PopupAnchor::BottomLeft => "bottom-left",
            PopupAnchor::TopRight => "top-right",
            PopupAnchor::TopLeft => "top-left",
            PopupAnchor::Center => "center",
        }
    }
}

/// Popup position for the `anchor` inside the work area of the primary monitor (physical pixels).
/// Returns (position clamped to the work area, full monitor bounds) in physical pixels.
/// The monitor bounds are used to check whether the position fell off screen.
fn popup_position(
    win: &WebviewWindow,
    width: f64,
    height: f64,
    anchor: PopupAnchor,
) -> Option<(PhysicalPosition<i32>, (f64, f64, f64, f64))> {
    let monitor = win
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| win.current_monitor().ok().flatten())?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let (ax, ay) = (area.position.x as f64, area.position.y as f64);
    let (mut aw, mut ah) = (area.size.width as f64, area.size.height as f64);
    if aw <= 0.0 || ah <= 0.0 {
        // Work area unreadable -> take the whole monitor minus the estimated taskbar height.
        let size = monitor.size();
        aw = size.width as f64;
        ah = size.height as f64 - TASKBAR_GUESS * scale;
    }
    // Window size is in logical points, so it has to be multiplied by the scale factor to compare with
    // the work area (physical). Clamp inside the work area: if a platform reports work_area in another
    // unit, the popup still stays on screen instead of flying off it (where nobody would see it).
    let pw = width * scale;
    let ph = height * scale;
    let margin = POPUP_MARGIN * scale;
    let (raw_x, raw_y) = match anchor {
        PopupAnchor::BottomRight => (ax + aw - pw - margin, ay + ah - ph - margin),
        PopupAnchor::BottomLeft => (ax + margin, ay + ah - ph - margin),
        PopupAnchor::TopRight => (ax + aw - pw - margin, ay + margin),
        PopupAnchor::TopLeft => (ax + margin, ay + margin),
        PopupAnchor::Center => (ax + (aw - pw) / 2.0, ay + (ah - ph) / 2.0),
    };
    let x = raw_x.clamp(ax, (ax + aw - pw).max(ax));
    let y = raw_y.clamp(ay, (ay + ah - ph).max(ay));

    // Full monitor bounds (not the work area) used to validate the position.
    let full = monitor.size();
    let fpos = monitor.position();
    let bounds = (
        fpos.x as f64,
        fpos.y as f64,
        full.width as f64,
        full.height as f64,
    );
    eprintln!(
        "[popup] anchor={} scale={scale} work_area=({ax},{ay},{aw},{ah}) monitor=({},{},{},{}) size_logic=({width}x{height}) -> pos=({x},{y})",
        anchor.as_str(),
        bounds.0,
        bounds.1,
        bounds.2,
        bounds.3
    );
    Some((PhysicalPosition::new(x.round() as i32, y.round() as i32), bounds))
}

#[tauri::command]
fn show_popup(
    app: AppHandle,
    width: f64,
    height: f64,
    position: Option<String>,
) -> Result<(), String> {
    let win = app
        .get_webview_window(POPUP_LABEL)
        .ok_or_else(|| "popup window missing".to_string())?;
    let anchor = PopupAnchor::parse(position.as_deref());
    eprintln!(
        "[popup] show_popup requested_position={:?} -> anchor={}",
        position.as_deref(),
        anchor.as_str()
    );
    let width = if width.is_finite() { width.clamp(POPUP_MIN, POPUP_MAX) } else { 400.0 };
    let height = if height.is_finite() { height.clamp(POPUP_MIN, POPUP_MAX) } else { 200.0 };

    // Resizing and positioning are only side steps: if they fail the window must still be SHOWN,
    // the popup must never disappear entirely (on macOS it once showed nothing at all).
    if let Err(e) = win.set_size(LogicalSize::new(width, height)) {
        eprintln!("[popup] set_size failed: {e}");
    }
    match popup_position(&win, width, height, anchor) {
        Some((pos, (bx, by, bw, bh))) => {
            // The position must be on screen. macOS can report work_area in another coordinate system
            // (origin at the bottom-left), which puts y off screen -> the window is "shown" but nobody
            // sees it.
            let px = pos.x as f64;
            let py = pos.y as f64;
            let inside = px >= bx - 1.0 && py >= by - 1.0 && px < bx + bw && py < by + bh;
            if inside {
                if let Err(e) = win.set_position(pos) {
                    eprintln!("[popup] set_position failed: {e}");
                }
            } else {
                eprintln!("[popup] position ({px},{py}) is off screen ({bx},{by},{bw},{bh}) -> centering");
                let _ = win.center();
            }
        }
        None => {
            eprintln!(
                "[popup] cannot read the monitor (anchor={}) -> centering",
                anchor.as_str()
            );
            let _ = win.center();
        }
    }
    if let Err(e) = win.set_always_on_top(true) {
        eprintln!("[popup] set_always_on_top failed: {e}");
    }

    // Show WITHOUT stealing focus: briefly make the window non-focusable while showing it, then put
    // the flag back so the keyboard (Esc) still works once the user clicks the popup.
    //
    // Windows/Linux ONLY. On macOS show() is [NSWindow makeKeyAndOrderFront:], and tao's window class
    // maps canBecomeKeyWindow + canBecomeMainWindow onto that same "focusable" flag; setting it to
    // false before show means the window is NOT brought to the front -> the webview still runs (the
    // notification sound plays) but the user never sees the popup. This really happened in 1.0.1 on macOS.
    #[cfg(not(target_os = "macos"))]
    let was_visible = win.is_visible().unwrap_or(false);
    #[cfg(not(target_os = "macos"))]
    if !was_visible {
        let _ = win.set_focusable(false);
    }
    let shown = win.show().map_err(err_string);
    match &shown {
        Ok(()) => eprintln!(
            "[popup] show() ok, is_visible={:?}, outer_position={:?}, outer_size={:?}",
            win.is_visible(),
            win.outer_position(),
            win.outer_size()
        ),
        Err(e) => eprintln!("[popup] show() FAILED: {e}"),
    }
    #[cfg(not(target_os = "macos"))]
    if !was_visible {
        let _ = win.set_focusable(true);
    }
    shown
}

#[tauri::command]
fn hide_popup(app: AppHandle) {
    if let Some(win) = app.get_webview_window(POPUP_LABEL) {
        let _ = win.hide();
    }
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

fn clean_label(raw: &str, fallback: &str) -> String {
    let trimmed: String = raw
        .chars()
        .filter(|c| !c.is_control())
        .take(TRAY_LABEL_MAX)
        .collect::<String>()
        .trim()
        .to_string();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed
    }
}

fn build_tray_menu(app: &AppHandle, labels: &TrayLabels) -> tauri::Result<Menu<Wry>> {
    let open_item = MenuItem::with_id(app, "open", &labels.open, true, None::<&str>)?;
    let notif_item = MenuItem::with_id(app, "notif", &labels.notif, true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", &labels.quit, true, None::<&str>)?;
    Menu::with_items(app, &[&open_item, &notif_item, &quit_item])
}

/// Change the tray menu labels. A missing `notifications` (None) -> keep the stored label (SPEC §20.3).
#[tauri::command]
fn set_tray_labels(
    app: AppHandle,
    state: State<'_, AppState>,
    open: String,
    quit: String,
    notifications: Option<String>,
) -> Result<(), String> {
    let mut labels = state
        .tray_labels
        .lock()
        .map(|l| l.clone())
        .unwrap_or_default();
    labels.open = clean_label(&open, DEFAULT_OPEN_LABEL);
    labels.quit = clean_label(&quit, DEFAULT_QUIT_LABEL);
    if let Some(notif) = notifications {
        labels.notif = clean_label(&notif, DEFAULT_NOTIF_LABEL);
    }
    if let Ok(mut stored) = state.tray_labels.lock() {
        *stored = labels.clone();
    }
    let menu = build_tray_menu(&app, &labels).map_err(err_string)?;
    match app.tray_by_id(TRAY_ID) {
        Some(tray) => tray.set_menu(Some(menu)).map_err(err_string),
        None => Err("tray missing".to_string()),
    }
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let labels = app
        .state::<AppState>()
        .tray_labels
        .lock()
        .map(|l| l.clone())
        .unwrap_or_default();
    let menu = build_tray_menu(app, &labels)?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Reminder")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_requested(app),
            "notif" => {
                let _ = app.emit_to(MAIN_LABEL, EVENT_TOGGLE_NOTIFICATIONS, ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_requested(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tick for the scheduler (JS in the main window listens for 'scheduler:tick')
// ---------------------------------------------------------------------------

fn spawn_ticker(app: AppHandle) {
    std::thread::Builder::new()
        .name("scheduler-tick".into())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_secs(TICK_SECS));
            let _ = app.emit_to(MAIN_LABEL, EVENT_TICK, ());
        })
        .expect("cannot spawn scheduler tick thread");
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

pub fn run() {
    let launch_minimized = std::env::args().skip(1).any(|a| a == "--minimized");

    let app = tauri::Builder::default()
        // single-instance must be registered first: instance 2 -> show instance 1's main window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_requested(app);
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            close_to_tray: AtomicBool::new(true),
            launch_minimized,
            tray_labels: Mutex::new(TrayLabels::default()),
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            show_main_window,
            hide_main_window,
            quit_app,
            show_popup,
            hide_popup,
            set_tray_labels,
            set_close_to_tray
        ])
        .setup(|app| {
            setup_tray(app.handle())?;
            spawn_ticker(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN_LABEL {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                let to_tray = window
                    .state::<AppState>()
                    .close_to_tray
                    .load(Ordering::Relaxed);
                if to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    window.app_handle().exit(0);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // macOS: clicking the Dock icon while the window is hidden -> show it again.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            show_main_requested(app_handle);
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (app_handle, event);
        }
    });
}
