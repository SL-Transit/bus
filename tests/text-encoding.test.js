const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const files = [
  'admin-erp.html',
  'admin-dashboard-read-model.js',
  'functions/admin-dashboard-summary.js',
  'functions/index.js',
  'functions/ticket-access.js',
  'database.rules.json',
  'tests/admin-console-browser.spec.js',
  'tests/admin-console-blueprint-ui.test.js',
  'tests/admin-dashboard-read-model.test.js',
  'tests/admin-dashboard-summary.test.js',
  'tests/database-rules-emulator.test.js',
  'tests/ticket-action-center.test.js',
  'tests/ticket-access-functions.test.js',
  'tests/ticket-data-center-secure.test.js'
];

const mojibakePatterns = [
  /เธ/,
  /เน€/,
  /เน/,
  /โ€/,
  /๐/,
  /\uFFFD/
];

for (const file of files) {
  const fullPath = path.join(repoRoot, file);
  if (!fs.existsSync(fullPath)) continue;
  const text = fs.readFileSync(fullPath, 'utf8');
  for (const pattern of mojibakePatterns) {
    assert.ok(!pattern.test(text), `${file} contains mojibake pattern ${pattern}`);
  }
}

console.log('text-encoding.test.js OK');
