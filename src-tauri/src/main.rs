// main.rs - entry point. All of the logic lives in lib.rs (SPEC §8).
// The release build on Windows does not open a console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    reminder_desktop_lib::run();
}
