'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const output = path.join(os.tmpdir(), 'sl-transit-owner-master-data-dry-run-test.json');
const result = spawnSync(process.execPath, [
  path.join(__dirname, '..', 'tools', 'build-owner-master-data-dry-run.js'),
  path.join(__dirname, '..', 'fixtures', 'owner-master-data.xlsx'),
  output
], { encoding: 'utf8' });

// The fixture is optional in this repository; validate the tool contract without
// inventing a production workbook when it is absent.
if (result.status !== 0 && !fs.existsSync(path.join(__dirname, '..', 'fixtures', 'owner-master-data.xlsx'))) {
  console.log('owner master data dry-run tool contract skipped: fixture absent');
} else {
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.strictEqual(report.dryRun, true);
  assert.strictEqual(report.writesEnabled, false);
  assert.strictEqual(report.readyForApply, false);
  assert.strictEqual(report.safety.credentialFieldsExported, false);
  assert(!JSON.stringify(report.data).toLowerCase().includes('password'));
  console.log('owner master data dry-run ok');
}
