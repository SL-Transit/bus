#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) {
  console.error('Usage: node tools/audit-owner-master-data-ids.js <dry-run.json> <report.json>');
  process.exit(2);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, ''));
}
function values(value) {
  return value && typeof value === 'object' ? Object.values(value) : [];
}
function duplicates(rows, field) {
  const counts = new Map();
  rows.forEach((row) => counts.set(String(row[field] || ''), (counts.get(String(row[field] || '')) || 0) + 1));
  return [...counts.entries()].filter(([key, count]) => key && count > 1).map(([key, count]) => ({ key, count }));
}

const input = readJson(inputPath);
const data = input.data || {};
const groups = values(data.serviceGroups);
const fares = values(data.routeFareRows);
const schedules = values(data.scheduleRows);
const expectedGroups = new Set(['group_001', 'group_002', 'group_003', 'group_004', 'group_005']);
const issues = [];

groups.forEach((row) => {
  if (!expectedGroups.has(row.serviceGroupId)) issues.push({ code: 'unknown-service-group-id', id: row.serviceGroupId });
});

function checkRoute(row, source) {
  const routeId = String(row.routeId || '');
  const groupId = String(row.serviceGroupId || '');
  const match = /^G_(\d{3})-/.exec(routeId);
  if (!match) issues.push({ code: 'invalid-route-id-format', source, routeId });
  else if (`group_${match[1]}` !== groupId) issues.push({ code: 'route-group-id-mismatch', source, routeId, groupId });
}
fares.forEach((row) => checkRoute(row, 'routeFareRows'));
schedules.forEach((row) => {
  checkRoute(row, 'scheduleRows');
  if (row.scheduleOfferId && row.routeId && !String(row.scheduleOfferId).startsWith(`TRIP-${row.routeId}-`)) {
    issues.push({ code: 'schedule-route-id-mismatch', scheduleOfferId: row.scheduleOfferId, routeId: row.routeId });
  }
});

const report = {
  dryRun: true,
  writesEnabled: false,
  readyForApply: false,
  counts: { groups: groups.length, fareRows: fares.length, scheduleRows: schedules.length },
  duplicateIds: {
    serviceGroupIds: duplicates(groups, 'serviceGroupId'),
    routeFareSourceRowIds: duplicates(fares, 'sourceRowId'),
    scheduleSourceRowIds: duplicates(schedules, 'sourceRowId'),
    scheduleOfferIds: duplicates(schedules, 'scheduleOfferId')
  },
  issues,
  valid: issues.length === 0,
  safety: { firebaseWrites: false, seed: false, deploy: false, productionApply: false, credentialsExported: false }
};

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ outputPath: path.resolve(outputPath), valid: report.valid, issueCount: issues.length }));
