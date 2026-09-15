#!/usr/bin/env node
'use strict';
// Runs the unit tests on EVERY Node version and every operating system.
//
// Neither built-in shortcut works:
//   node --test "test/**/*.test.js"  -> Node 20 has no glob support ("Could not find ...") - this broke CI before.
//   node --test test                 -> Node 24 reads it as a module path ("Cannot find module ...\test").
// So this script lists the files itself and passes them straight to node --test.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TEST_DIR = path.join(__dirname, '..', 'test');

function collect(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (entry.isFile() && entry.name.endsWith('.test.js')) out.push(full);
  }
  return out.sort();
}

if (!fs.existsSync(TEST_DIR)) {
  console.error('Test directory not found: ' + TEST_DIR);
  process.exit(1);
}

const files = collect(TEST_DIR);
if (!files.length) {
  console.error('No *.test.js file found in ' + TEST_DIR);
  process.exit(1);
}

const res = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(res.status === null ? 1 : res.status);
