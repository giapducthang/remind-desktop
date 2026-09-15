"use strict";
// Regression: the popup window starts HIDDEN. On macOS (WKWebView) requestAnimationFrame does NOT
// run for a hidden window, so anything that depends on rAF to call show_popup never runs: the popup
// stays invisible, yet the synchronous part of the renderer still runs so the notification sound IS
// STILL HEARD. This really happened in 1.0.3 on a MacBook. This test runs popup-host.js with a rAF
// that NEVER fires and requires it to call show_popup anyway.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "js", "popup-host.js"), "utf8");

function run(rafWorks) {
  const calls = [];
  const listeners = {};
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: rafWorks ? (fn) => setTimeout(fn, 0) : () => {},
    document: {
      getElementById: () => ({
        firstElementChild: { getBoundingClientRect: () => ({ height: 300 }) },
        scrollHeight: 300, firstChild: null, removeChild() {}, addEventListener() {},
      }),
      documentElement: { setAttribute() {} },
      addEventListener() {},
    },
  };
  sandbox.window = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.PopupRenderer = { render: () => ({ destroy() {} }) };
  sandbox.window.Platform = {
    isTauri: true, ready: Promise.resolve(true), windowLabel: "popup",
    _tauri: {
      core: { invoke: (cmd) => { calls.push(cmd); return Promise.resolve(); } },
      event: {
        listen: (name, cb) => { listeners[name] = cb; return Promise.resolve(() => {}); },
        emitTo: () => Promise.resolve(),
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { calls, listeners };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (const rafWorks of [true, false]) {
  test("popup still shows when rAF " + (rafWorks ? "runs" : "NEVER runs (hidden window on macOS)"), async () => {
    const { calls, listeners } = run(rafWorks);
    await wait(30);
    assert.ok(listeners["popup:show"], "must subscribe to popup:show");
    listeners["popup:show"]({ payload: { kind: "reminder", reminder: { message: "x" }, payloadId: "p1" } });
    await wait(250);
    assert.ok(calls.includes("show_popup"), "must call show_popup to reveal the window");
  });
}
