# Reminder Desktop

**English** · [Tiếng Việt](README.vi.md)

A desktop reminder app: gentle nudges to take a break, stretch, and drink water on your own schedule.
In Vietnam it also includes a **spin-the-wheel food picker** that decides what to eat for lunch and what to
drink in the afternoon.

Website: https://remind.asia · Support: https://remind.asia/support/ · Privacy: https://remind.asia/privacy

## Download

Open [**Releases**](../../releases/latest) and grab the file for your machine:

| Machine | File |
|---|---|
| Windows 10/11 | `Reminder_x.y.z_x64-setup.exe` |
| macOS, Apple silicon (M1 and newer) | `Reminder_x.y.z_aarch64.dmg` |
| macOS, Intel | `Reminder_x.y.z_x64.dmg` |

The `latest.json` and `.sig` files are used by the auto-update mechanism. You do not need to download them.

## Install

**Windows**: run the `.exe`. It installs into your user folder, so no administrator rights are needed.
Windows SmartScreen may warn you because the installer is not code-signed with a paid certificate.
Choose **More info**, then **Run anyway**.

**macOS**: open the `.dmg` and drag Reminder into Applications. The app is signed, but not notarized by
Apple (that needs a paid developer account), so macOS asks you to confirm the first time:

- **macOS 15 Sequoia and newer**: double-click Reminder, accept the warning, then open
  **System Settings > Privacy & Security**, scroll to **Security**, and click **Open Anyway** next to the
  message about Reminder. Confirm with Touch ID or your password.
- **macOS 14 and older**: right-click (or Control-click) Reminder in Applications, choose **Open**, then
  **Open** again in the dialog.

If macOS says **"Reminder is damaged and can't be opened"**, the quarantine flag added during download is the
cause. Open Terminal and run:

```bash
xattr -dr com.apple.quarantine /Applications/Reminder.app
```

Then open the app again.

## Using the app

- The interface is in **English** by default. To switch, open **Settings > Language** and pick **Tiếng Việt**.
- The app runs in the background from the system tray. Closing the window hides it to the tray instead of quitting.
- Turn on **Launch at startup** in Settings so the app starts with your computer.
- Choose where popups appear in **Settings > Popup position**: any screen corner, or the centre.
- Need quiet during a meeting: right-click the tray icon and pause notifications, or open Settings and pause
  for 15 minutes, 1 hour, or until tomorrow morning. Notifications turn themselves back on when the time is up.

## Food and drinks is available in Vietnam only

The food and drink picker is made for users in Vietnam. The server determines your country from your IP
address. Outside Vietnam the **Food & drinks** tab shows a "Not available in your country" notice and no
picker popups appear. **Reminders work everywhere**, in every country.

## Version check and updates

The app checks for a new version 15 seconds after it starts, then every 6 hours, and whenever you press
**Check for updates** in Settings. When an update is available the app shows a banner; pressing **Update now**
downloads it, installs it, and restarts the app. Your reminders, picker sets and settings are kept.

Two public endpoints served by `remind.asia` back this:

| Endpoint | What it does |
|---|---|
| `GET https://remind.asia/api/desktop/update/{target}/{arch}/{version}` | The app asks whether a newer build exists. `target` is `windows` or `darwin`, `arch` is `x86_64` or `aarch64`, `version` is the installed version. Returns **200** with `{version, notes, pub_date, url, signature}` when an update is available, or **204** when you are already up to date. |
| `GET https://remind.asia/api/desktop/version` | Returns the latest version along with download links for each operating system. The website uses it to show the right download button for your machine. |

Update packages are **signed with Ed25519 (minisign)**. The public key is built into the app
(`src-tauri/tauri.conf.json`), and the app installs a package only when its signature matches that key, so nobody can
slip a tampered build in along the way.

The app also posts to `https://remind.asia/api/ext/version` every 30 minutes with: the installed version, how
many reminder popups were shown in each 5 minute slot, the interface language, and a random install id. It
never sends the text of your reminders and never sends personal information. The server replies with the short
message shown under a popup, and with the food picker sets for users in Vietnam.

## Your data

Reminders, picker sets, and settings are stored **on your machine**, in your user profile folder. They are
kept when the app updates. Details:
https://remind.asia/privacy

## Build from source

The app is built with [Tauri v2](https://tauri.app) - a Rust shell around a plain vanilla JS frontend,
no bundler and no framework. See [DEVELOPING.md](DEVELOPING.md) for the toolchain, how to run it locally
(`npm run dev`, or `npm run web` to open the UI in a normal browser), and how releases are made.

The server side that this app talks to (the website and the version API) lives in a separate
private repository.

## Reporting problems

Open an [issue](../../issues) in this repository, or contact us through https://remind.asia/support/
