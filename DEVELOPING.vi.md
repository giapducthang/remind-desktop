# Reminder Desktop (Tauri v2)

[English](DEVELOPING.md) · **Tiếng Việt**

App desktop nhẹ cho Windows + macOS, port 2 tính năng lõi của extension: **Nhắc nhở** và **Ăn uống**.

## 1. Yêu cầu

| Thành phần | Windows | macOS |
|---|---|---|
| Node.js | ≥ 20 (đang dùng 24) | ≥ 20 |
| Rust (stable, qua `rustup`) | ≥ 1.77 | ≥ 1.77 |
| Toolchain hệ điều hành | Visual Studio Build Tools (C++ workload) + WebView2 Runtime (Windows 10/11 đã có sẵn) | Xcode Command Line Tools: `xcode-select --install` |

Frontend là vanilla JS tĩnh trong `src/` (không bundler, không framework). Chỉ có **một** devDependency: `@tauri-apps/cli`.
Không cài `@tauri-apps/api` - JS dùng `window.__TAURI__` (bật `withGlobalTauri`).

## 2. Cài đặt và chạy

```bash
npm install                # chỉ cài @tauri-apps/cli
npm run dev                # tauri dev: mở app thật (WebView2 / WKWebView), đọc thẳng thư mục src/
npm run web                # mode trình duyệt: http://localhost:4173 (không cần Rust, popup thành overlay trong trang)
npm test                   # node --test test/ (scheduler/api chạy bằng Platform giả)
npm run build              # tauri build: installer release trong src-tauri/target/release/bundle/
npm run build:debug        # tauri build --debug: nhanh hơn, có devtools
```

Ghi chú:
- Lần đầu `cargo` tải khoảng 500 crate, mất 5-10 phút. Các lần sau chỉ vài giây nếu không đổi Rust.
- `tauri dev` **không** có `devUrl`/`beforeDevCommand`: sửa file trong `src/` rồi F5 (reload) trong cửa sổ app là thấy.
- Cửa sổ chính khởi động **ẩn**; JS gọi `show_main_window` khi sẵn sàng (trừ khi chạy với `--minimized`, tức khởi động cùng máy).
- Đóng cửa sổ chính = thu xuống khay (tray). Thoát hẳn qua menu tray hoặc `Platform.window.quit()`.
- Kiểm tra nhanh trước khi kết thúc: `node --check src/js/*.js`, `node -e "JSON.parse(...)"` cho `src-tauri/tauri.conf.json` và
  `src-tauri/capabilities/default.json`, `cd src-tauri && cargo build`.

## 3. Cấu trúc Rust shell (`src-tauri/`)

- `tauri.conf.json` - cửa sổ `main` (960×680, ẩn lúc đầu) + `popup` (400×200, không viền, trong suốt, luôn trên cùng, không lấy focus), CSP, bundle, updater.
- `src/lib.rs` - lệnh `app_info`, `show_main_window`, `hide_main_window`, `quit_app`, `show_popup {width,height}`, `hide_popup`,
  `set_tray_labels {open,quit}`, `set_close_to_tray {enabled}`; tray icon + menu; thread phát `scheduler:tick` mỗi 30 giây; single-instance.
- `capabilities/default.json` - quyền cho 2 cửa sổ (store, autostart, updater, process, opener chỉ `https://**`).
- `icons/` - sinh bằng `npx tauri icon <anh-nguon.png> -o src-tauri/icons` (xoá `android/`, `ios/` sau khi sinh).

Thêm lệnh Rust mới: viết `#[tauri::command]` trong `lib.rs`, đăng ký trong `generate_handler![]`, gọi từ JS **chỉ** qua `platform.js`.

## 4. Khoá ký cập nhật (updater)

Cập nhật tự động dùng chữ ký Ed25519 (minisign). App chỉ chấp nhận gói cập nhật ký bằng private key khớp `plugins.updater.pubkey` trong `tauri.conf.json`.

- Cặp khoá được sinh bằng `npx tauri signer generate -w .tauri/reminder.key` với **mật khẩu rỗng**.
- `.tauri/` đã **gitignore**. Private key `reminder.key` **không bao giờ** được commit; giữ bản sao ở nơi an toàn (mất key = không thể phát hành bản cập nhật cho người dùng cũ, phải phát hành lại installer mới với pubkey mới).
- Public key nằm trong `tauri.conf.json` (`plugins.updater.pubkey`) và `.tauri/reminder.key.pub`.
- Build có ký cục bộ:
  ```bash
  # PowerShell
  $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content .tauri\reminder.key -Raw
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
  npm run build
  ```
  Kết quả: installer `.exe` + file `.sig` cạnh nó (Windows), `.app.tar.gz` + `.sig` (macOS).
- Đổi khoá: sinh cặp mới, thay `pubkey` trong `tauri.conf.json`, cập nhật GitHub secret, và người dùng phải cài lại bằng installer mới.

## 5. Phát hành qua GitHub Actions

Workflow: [`.github/workflows/release.yml`](.github/workflows/release.yml) (dùng `tauri-apps/tauri-action`).

**Mã nguồn app desktop nằm ngay trong repo công khai này** (chốt 2026-09-15). Lý do: repo công khai
được chạy GitHub Actions **không giới hạn phút**, kể cả máy macOS (hệ số 10 lần), nên phát hành không tốn phí.
Release cũng tạo ngay trong repo này bằng `GITHUB_TOKEN` mặc định, không cần token chéo repo.

Phần máy chủ (web và API phiên bản) nằm ở một repo riêng tư khác.

### 5.1 Chuẩn bị một lần
1. Thêm secret vào repo này: `TAURI_SIGNING_PRIVATE_KEY` (nguyên nội dung `.tauri/reminder.key`) và
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (để trống). Khoá riêng **không bao giờ** được commit.
2. Trên máy chủ web đặt `GITHUB_REPO=giapducthang/remind-desktop` để trang quản trị tự đọc bản phát hành.

### 5.2 Mỗi lần phát hành
1. Nâng version ở **cả** `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` và `package.json` (ví dụ `1.2.3`).
   Workflow fail nếu tag không khớp `tauri.conf.json`.
2. Commit rồi đẩy tag trong chính repo này:
   ```bash
   git tag desktop-v1.2.3
   git push origin desktop-v1.2.3
   ```
3. Workflow build 3 mục tiêu (Windows x86_64 NSIS, macOS aarch64, macOS x86_64) rồi tạo **Release công khai**
   `desktop-v1.2.3` trong `remind-desktop`, kèm installer, các file `.sig` và `latest.json` gộp đủ 3 platform.
4. Mở trang quản trị của bạn, vào phần cấu hình **Ứng dụng desktop**: banner báo có bản mới, bấm
   **Điền vào form** (tự điền version, ghi chú, ngày, URL + **chữ ký** từng platform) rồi bấm **Lưu**.
   Từ lúc đó `GET /api/desktop/update/{target}/{arch}/{version}` trả 200 cho bản cũ hơn và app đang chạy
   sẽ thấy banner "Cập nhật ngay" (app kiểm tra sau khi mở 15 giây và 6 giờ/lần).
5. Chia sẻ link tải cho người dùng: `https://github.com/giapducthang/remind-desktop/releases/latest`.

> Bước 4 là chốt chặn: release lên GitHub **chưa** đẩy cập nhật cho ai cả, phải bấm Lưu trong admin mới phát hành.

## 6. Sự cố thường gặp

| Triệu chứng | Nguyên nhân / cách xử lý |
|---|---|
| macOS báo **"Reminder is damaged and can't be opened"** khi mở app tải từ Release | Bundle `.app` chưa được ký (thiếu `Contents/_CodeSignature`) nên macOS coi là hỏng - nặng nhất trên Apple Silicon vì mọi mã arm64 đều phải có chữ ký hợp lệ. Workflow nay ký **ad-hoc** (`APPLE_SIGNING_IDENTITY: -`); bản build trước bản sửa này phải chữa tay: `xattr -dr com.apple.quarantine /Applications/Reminder.app` rồi `codesign --force --deep --sign - /Applications/Reminder.app`. Muốn hết cảnh báo hoàn toàn thì cần chứng chỉ Developer ID + notarize. |
| `cargo build` lỗi `linker link.exe not found` (Windows) | Chưa cài Visual Studio Build Tools với workload "Desktop development with C++" (thư mục `Microsoft Visual Studio\2022\BuildTools` tồn tại nhưng rỗng cũng là chưa cài). Cài: `winget install Microsoft.VisualStudio.2022.BuildTools --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`. Tạm thời không có MSVC thì có thể kiểm tra biên dịch bằng LLVM-MinGW: `rustup target add x86_64-pc-windows-gnullvm` rồi `cargo build --target x86_64-pc-windows-gnullvm` (chỉ để kiểm tra, KHÔNG dùng để phát hành). |
| Installer build xong nhưng cài vào máy khác mở lên tắt ngay (exit code `0xC0000135` / `-1073741515`) | Bản build bằng LLVM-MinGW (`gnullvm`) link động tới `libunwind.dll` và `WebView2Loader.dll`; NSIS **không** đóng gói 2 file này nên máy không có LLVM-MinGW sẽ thiếu DLL. Toolchain `gnullvm` chỉ dùng để **kiểm tra biên dịch**. Phát hành phải build bằng **MSVC** (máy có VS Build Tools) hoặc để GitHub Actions build (mục 5). Muốn chạy tạm bản gnullvm thì copy 2 DLL đó vào cùng thư mục `.exe` (`llvm-mingw.../x86_64-w64-mingw32/bin/libunwind.dll` và `src-tauri/target/debug/WebView2Loader.dll`). |
| `cargo build` lỗi `link: extra operand ...` trong Git Bash | `link` của coreutils (Git Bash) che mất `link.exe` của MSVC. Chạy `cargo`/`npm run dev` từ PowerShell hoặc cmd. |
| `error: failed to run custom build command for tauri-build` | Thiếu `src-tauri/icons/icon.ico` / `icon.png` hoặc `tauri.conf.json` sai JSON. Sinh lại icon (mục 3). |
| App mở nhưng cửa sổ trắng, console báo `__TAURI__ is undefined` | `app.withGlobalTauri` trong `tauri.conf.json` phải là `true`. |
| `invoke` báo `not allowed by capability` / plugin không hoạt động | Thiếu permission trong `capabilities/default.json` (nhớ cả cửa sổ `popup`). |
| Ảnh / API bị chặn, console báo CSP | Bổ sung nguồn vào `app.security.csp` (chỉ `https:` cho ảnh, `remind.asia` + `commons.wikimedia.org` cho fetch). |
| Popup không hiện hoặc hiện sai góc | Kiểm tra `show_popup` nhận `width/height` hợp lệ (popup-host.js đo DOM); nhiều màn hình thì popup luôn ở màn hình chính. |
| Cập nhật báo lỗi chữ ký | Gói được ký bằng key khác `pubkey` trong `tauri.conf.json`, hoặc `signature` dán vào admin sai file `.sig`. |
| Cập nhật luôn 204 | Version trong admin ≤ version app, hoặc thiếu URL/signature đúng platform (`windows-x86_64`, `darwin-aarch64`, `darwin-x86_64`). |
| macOS: popup không trong suốt | Cần `app.macOSPrivateApi: true` (đã bật) và feature `macos-private-api` của crate `tauri` trong `Cargo.toml` (đã bật; `tauri-build` kiểm tra feature này trên mọi hệ điều hành nên KHÔNG chuyển nó sang `[target.'cfg(target_os = "macos")']`, build sẽ lỗi). |
| Bật "khởi động cùng máy" không tác dụng | Windows: xem `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`; macOS: `~/Library/LaunchAgents/asia.remind.desktop.plist`. App được chạy với tham số `--minimized`. |
| Chạy 2 lần chỉ thấy cửa sổ cũ | Đúng thiết kế: plugin single-instance chuyển yêu cầu về instance đang chạy và hiện cửa sổ chính. |
