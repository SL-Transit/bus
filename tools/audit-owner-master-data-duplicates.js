#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node tools/audit-owner-master-data-duplicates.js <dry-run.json> <report.json>');
  process.exit(2);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, ''));
}

function values(value) {
  return value && typeof value === 'object' ? Object.values(value) : [];
}

function duplicateGroups(rows, keyBuilder) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = keyBuilder(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      count: group.length,
      sourceRowIds: group.map((row) => row.sourceRowId).filter(Boolean)
    }));
}

const input = readJson(inputPath);
const rows = values(input.data && input.data.scheduleRows);
const duplicateOfferIds = duplicateGroups(rows, (row) => String(row.scheduleOfferId || ''));
const duplicateSourceRowIds = duplicateGroups(rows, (row) => String(row.sourceRowId || ''));
const duplicateBusinessKeys = duplicateGroups(rows, (row) => [
  row.serviceGroupId,
  row.routeId,
  row.originNameTh,
  row.destinationNameTh,
  row.departureTime
].map((value) => String(value || '')).join('|'));

const report = {
  dryRun: true,
  writesEnabled: false,
  readyForApply: false,
  source: {
    inputPath: path.resolve(inputPath),
    scheduleRows: rows.length,
    uniqueScheduleOfferIds: new Set(rows.map((row) => row.scheduleOfferId)).size,
    uniqueSourceRowIds: new Set(rows.map((row) => row.sourceRowId)).size
  },
  duplicateAudit: {
    duplicateOfferIds,
    duplicateSourceRowIds,
    duplicateBusinessKeys,
    hasDuplicates: duplicateOfferIds.length > 0 || duplicateSourceRowIds.length > 0 || duplicateBusinessKeys.length > 0
  },
  safety: {
    firebaseWrites: false,
    seed: false,
    deploy: false,
    productionApply: false,
    credentialsExported: false
  }
};

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  outputPath: path.resolve(outputPath),
  scheduleRows: report.source.scheduleRows,
  hasDuplicates: report.duplicateAudit.hasDuplicates
}));
