'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const tool = path.join(root, 'tools', 'audit-owner-master-data-ids.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-transit-id-audit-'));
const input = path.join(temp, 'dry-run.json');
const output = path.join(temp, 'report.json');
fs.writeFileSync(input, JSON.stringify({ data: {
  serviceGroups: { group_001: { serviceGroupId: 'group_001' } },
  routeFareRows: { fare_1: { routeId: 'G_001-P_001', serviceGroupId: 'group_001', sourceRowId: 'fare_1' } },
  scheduleRows: { schedule_1: { scheduleOfferId: 'TRIP-G_001-P_001-001-0900', routeId: 'G_001-P_001', serviceGroupId: 'group_001', sourceRowId: 'schedule_1' } }
} }), 'utf8');
const result = spawnSync(process.execPath, [tool, input, output], { encoding: 'utf8' });
assert.strictEqual(result.status, 0, result.stderr);
const report = JSON.parse(fs.readFileSync(output, 'utf8'));
assert.strictEqual(report.valid, true);
assert.strictEqual(report.issues.length, 0);
assert.strictEqual(report.safety.firebaseWrites, false);
console.log('owner master data id audit ok');
