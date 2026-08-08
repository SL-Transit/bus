'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const tool = path.join(root, 'tools', 'audit-owner-master-data-duplicates.js');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-transit-duplicate-audit-'));
const input = path.join(tempDir, 'dry-run.json');
const output = path.join(tempDir, 'report.json');

const rows = {
  schedule_1: { scheduleOfferId: 'trip-1', sourceRowId: 'schedule_1', serviceGroupId: 'group_001', routeId: 'G_001-P_001', originNameTh: 'A', destinationNameTh: 'B', departureTime: '09:00' },
  schedule_2: { scheduleOfferId: 'trip-2', sourceRowId: 'schedule_2', serviceGroupId: 'group_001', routeId: 'G_001-P_001', originNameTh: 'A', destinationNameTh: 'B', departureTime: '10:00' }
};
fs.writeFileSync(input, JSON.stringify({ data: { scheduleRows: rows } }), 'utf8');

const result = spawnSync(process.execPath, [tool, input, output], { encoding: 'utf8' });
assert.strictEqual(result.status, 0, result.stderr);
const report = JSON.parse(fs.readFileSync(output, 'utf8'));
assert.strictEqual(report.source.scheduleRows, 2);
assert.strictEqual(report.source.uniqueScheduleOfferIds, 2);
assert.strictEqual(report.duplicateAudit.hasDuplicates, false);
assert.strictEqual(report.safety.firebaseWrites, false);

const duplicateInput = path.join(tempDir, 'duplicate-dry-run.json');
const duplicateOutput = path.join(tempDir, 'duplicate-report.json');
const duplicateRows = {
  schedule_1: rows.schedule_1,
  schedule_2: Object.assign({}, rows.schedule_1, { sourceRowId: 'schedule_2' })
};
fs.writeFileSync(duplicateInput, JSON.stringify({ data: { scheduleRows: duplicateRows } }), 'utf8');
const duplicateResult = spawnSync(process.execPath, [tool, duplicateInput, duplicateOutput], { encoding: 'utf8' });
assert.strictEqual(duplicateResult.status, 0, duplicateResult.stderr);
const duplicateReport = JSON.parse(fs.readFileSync(duplicateOutput, 'utf8'));
assert.strictEqual(duplicateReport.duplicateAudit.hasDuplicates, true);
assert.strictEqual(duplicateReport.duplicateAudit.duplicateOfferIds.length, 1);
assert.strictEqual(duplicateReport.duplicateAudit.duplicateBusinessKeys.length, 1);
console.log('owner master data duplicate audit ok');
