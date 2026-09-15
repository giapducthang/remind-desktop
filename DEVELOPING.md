# Reminder Desktop (Tauri v2)

**English** · [Tiếng Việt](DEVELOPING.vi.md)

A small desktop app for Windows and macOS. It ports the two core features of the browser extension:
**Reminders** and **Food & drinks**.

## 1. Requirements

| Component | Windows | macOS |
|---|---|---|
| Node.js | 20 or newer (24 in use here) | 20 or newer |
| Rust (stable, via `rustup`) | 1.77 or newer | 1.77 or newer |
| Platform toolchain | Visual Studio Build Tools with the C++ workload, plus the WebView2 runtime (already present on Windows 10/11) | Xcode Command Line Tools: `xcode-select --install` |

The frontend is static vanilla JS in `src/`: no bundler, no framework. There is exactly **one** devDependency,
`@tauri-apps/cli`. Do not install `@tauri-apps/api`. The JS reaches Tauri through `window.__TAURI__`, which is
enabled by `withGlobalTauri`.

## 2. Install and run

```bash
npm install                # installs @tauri-apps/cli only
npm run dev                # tauri dev: opens the real app (WebView2 / WKWebView), serving src/ directly
npm run web                # browser mode: http://localhost:4173 (no Rust needed, popups become in-page overlays)
npm test                   # unit tests (scheduler/api run against a fake Platform)
npm run build              # tauri build: release installers in src-tauri/target/release/bundle/
npm run build:debug        # tauri build --debug: faster, keeps devtools
```

Notes:
- The first `cargo` run downloads around 500 crates and takes 5 to 10 minutes. Later runs take seconds unless the Rust code changes.
- `tauri dev` has **no** `devUrl` and no `beforeDevCommand`: edit a file in `src/`, then press F5 inside the app window to see the change.
- The main window starts **hidden**. The JS calls `show_main_window` once it is ready, unless the app was launched with `--minimized`, which is how the launch-at-startup entry runs it.
- Closing the main window hides it to the tray. Quitting happens through the tray menu or `Platform.window.quit()`.
- Quick check before you finish: `node --check src/js/*.js`, parse `src-tauri/tauri.conf.json` and
  `src-tauri/capabilities/default.json` as JSON, then `cd src-tauri && cargo build`.

## 3. The Rust shell (`src-tauri/`)

- `tauri.conf.json` defines the `main` window (960x680, hidden at first) and the `popup` window (borderless, transparent, always on top, never takes focus; its size is set at runtime), plus the CSP, the bundle settings and the updater.
- `src/lib.rs` holds the commands `app_info`, `show_main_window`, `hide_main_window`, `quit_app`,
  `show_popup {width, height, position}`, `hide_popup`, `set_tray_labels {open, quit, notifications}` and
  `set_close_to_tray {enabled}`, plus the tray icon and menu, a thread that emits `scheduler:tick` every 30 seconds, and the single-instance handler.
- `capabilities/default.json` grants permissions to both windows (store, autostart, updater, process, and opener limited to `https://**`).
- `icons/` is generated from the extension icon: `npx tauri icon <source.png> -o src-tauri/icons`. Delete the `android/` and `ios/` folders it creates.

To add a Rust command: write `#[tauri::command]` in `lib.rs`, register it in `generate_handler![]`, and call it from JS **only** through `platform.js`.

## 4. Update signing key

Auto-update uses Ed25519 (minisign) signatures. The app installs a package only when its signature matches
`plugins.updater.pubkey` in `tauri.conf.json`.

- Generate the pair with `npx tauri signer generate -w .tauri/reminder.key`, using an **empty password**.
- `.tauri/` is **gitignored**. The private key `reminder.key` must **never** be committed. Keep a copy somewhere safe: losing it means you can no longer ship updates to existing users, and everyone has to reinstall from a new installer built with a new public key.
- The public key lives in `tauri.conf.json` (`plugins.updater.pubkey`) and in `.tauri/reminder.key.pub`.
- To build a signed package locally:
  ```powershell
  # PowerShell
  $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content .tauri\reminder.key -Raw
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
  npm run build
  ```
  This produces the `.exe` installer plus a `.sig` file next to it on Windows, and `.app.tar.gz` plus `.sig` on macOS.
- Rotating the key means generating a new pair, replacing `pubkey`, updating the GitHub secret, and asking users to reinstall from a new installer.

## 5. Releasing through GitHub Actions

Workflow: [`.github/workflows/release.yml`](.github/workflows/release.yml), which uses `tauri-apps/tauri-action`.

**The desktop app source lives in this public repository** (decided 2026-09-15). The reason: public repositories
get **unlimited** GitHub Actions minutes, including the macOS runners that otherwise bill at ten times the rate,
so releasing costs nothing. The release is created in this same repository with the default `GITHUB_TOKEN`, so no
cross-repository token is needed.

The server side (the website and the version API) lives in a separate private repository.

### 5.1 One-time setup
1. Add two secrets to this repository: `TAURI_SIGNING_PRIVATE_KEY` (the full contents of `.tauri/reminder.key`) and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (leave empty). The private key itself is **never** committed.
2. On the web server, set `GITHUB_REPO=giapducthang/remind-desktop` so the admin page can read the latest release.

### 5.2 Each release
1. Bump the version in **all three** of `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `package.json`
   (for example `1.2.3`). The workflow fails if the tag does not match `tauri.conf.json`.
2. Commit, then push the tag from this repository:
   ```bash
   git tag desktop-v1.2.3
   git push origin desktop-v1.2.3
   ```
3. The workflow builds three targets (Windows x86_64 NSIS, macOS aarch64, macOS x86_64), then publishes a public
   release `desktop-v1.2.3` with the installers, the `.sig` files, and a `latest.json` covering all three platforms.
4. Open your admin page and go to the desktop app settings. A banner announces the new build. Press **Fill in the form**
   to fill in the version, notes, date, URL and **signature** for every platform, then press **Save**.
   From that moment `GET /api/desktop/update/{target}/{arch}/{version}` returns 200 for older versions, and running
   apps show an **Update now** banner. They check 15 seconds after start, then every 6 hours.
5. Share the download link: `https://github.com/giapducthang/remind-desktop/releases/latest`.

> Step 4 is the gate: publishing the GitHub release does **not** push an update to anybody. Saving it in the admin page does.

## 6. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| macOS says **"Reminder is damaged and can't be opened"** for an app downloaded from Releases | The `.app` bundle was not signed (no `Contents/_CodeSignature`), so macOS treats it as broken. This bites hardest on Apple silicon, where every arm64 binary needs a valid signature. The workflow now signs **ad-hoc** (`APPLE_SIGNING_IDENTITY: -`). To rescue a build made before that fix: `xattr -dr com.apple.quarantine /Applications/Reminder.app` then `codesign --force --deep --sign - /Applications/Reminder.app`. Removing the warning entirely needs a Developer ID certificate and notarization. |
| `cargo build` fails with `linker link.exe not found` (Windows) | Visual Studio Build Tools with the "Desktop development with C++" workload is not installed (an empty `Microsoft Visual Studio\2022\BuildTools` folder still counts as missing). Install it with `winget install Microsoft.VisualStudio.2022.BuildTools --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`. Without MSVC you can still check that the code compiles using LLVM-MinGW: `rustup target add x86_64-pc-windows-gnullvm` then `cargo build --target x86_64-pc-windows-gnullvm`. That is a compile check only, NOT a release build. |
| An installer works on the build machine but exits immediately elsewhere (exit code `0xC0000135` / `-1073741515`) | A build made with LLVM-MinGW (`gnullvm`) links dynamically against `libunwind.dll` and `WebView2Loader.dll`, and NSIS does **not** bundle them, so a machine without LLVM-MinGW is missing those DLLs. The `gnullvm` toolchain is for **compile checks only**. Release builds must use **MSVC** (a machine with VS Build Tools) or GitHub Actions (section 5). To run a gnullvm build locally, copy both DLLs next to the `.exe` (`llvm-mingw.../x86_64-w64-mingw32/bin/libunwind.dll` and `src-tauri/target/debug/WebView2Loader.dll`). |
| `cargo build` fails with `link: extra operand ...` in Git Bash | Git Bash's coreutils `link` shadows MSVC's `link.exe`. Run `cargo` and `npm run dev` from PowerShell or cmd. |
| `error: failed to run custom build command for tauri-build` | `src-tauri/icons/icon.ico` or `icon.png` is missing, or `tauri.conf.json` is not valid JSON. Regenerate the icons (section 3). |
| The app opens with a white window and the console says `__TAURI__ is undefined` | `app.withGlobalTauri` must be `true` in `tauri.conf.json`. |
| `invoke` reports `not allowed by capability`, or a plugin does nothing | A permission is missing from `capabilities/default.json`. Remember it must cover the `popup` window too. |
| Images or API calls are blocked and the console mentions CSP | Add the source to `app.security.csp` (`https:` only for images; `remind.asia` and `commons.wikimedia.org` for fetch). |
| The popup does not appear, or appears in the wrong corner | Check that `show_popup` receives a sane `width` and `height` (measured from the DOM in `popup-host.js`) and a known `position`. With several monitors the popup always uses the primary one. |
| An update fails signature verification | The package was signed with a key that does not match `pubkey` in `tauri.conf.json`, or the signature pasted into the admin page came from the wrong `.sig` file. |
| The update endpoint always answers 204 | The version stored in the admin page is not newer than the running app, or the URL and signature for that platform are missing (`windows-x86_64`, `darwin-aarch64`, `darwin-x86_64`). |
| macOS: the popup is not transparent | `app.macOSPrivateApi` must be `true` (it is) and the `macos-private-api` feature must be enabled on the `tauri` crate in `Cargo.toml` (it is). Do **not** move that feature under `[target.'cfg(target_os = "macos")']`: `tauri-build` checks for it on every platform and the build breaks. |
| Launch at startup has no effect | On Windows check `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`; on macOS check `~/Library/LaunchAgents/asia.remind.desktop.plist`. The entry runs the app with `--minimized`. |
| Running the app twice only brings the existing window forward | That is by design: the single-instance plugin forwards the request to the running instance and shows the main window. |
