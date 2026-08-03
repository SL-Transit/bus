#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [erpPath, publishedPath, candidatePath, outputPath] = process.argv.slice(2);
if (!erpPath || !publishedPath || !candidatePath || !outputPath) {
  console.error('Usage: node tools/diff-workbook-source-candidate.js <erp.json> <published.json> <candidate.json> <report.json>');
  process.exit(2);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8').replace(/^\uFEFF/, ''));
}

function object(value) {
  return value && typeof value === 'object' ? value : {};
}

function count(value) {
  return Object.keys(object(value)).length;
}

function countChildren(value) {
  return Object.values(object(value)).reduce((total, child) => total + count(child), 0);
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value === undefined ? null : value)).digest('hex');
}

function compareMaps(before, after) {
  const beforeMap = object(before);
  const afterMap = object(after);
  const beforeKeys = new Set(Object.keys(beforeMap));
  const afterKeys = new Set(Object.keys(afterMap));
  const added = [...afterKeys].filter(key => !beforeKeys.has(key));
  const removed = [...beforeKeys].filter(key => !afterKeys.has(key));
  const changed = [...afterKeys].filter(key => beforeKeys.has(key) && hash(beforeMap[key]) !== hash(afterMap[key]));
  const unchanged = [...afterKeys].filter(key => beforeKeys.has(key) && hash(beforeMap[key]) === hash(afterMap[key]));
  return { before: beforeKeys.size, after: afterKeys.size, added, removed, changed, unchanged: unchanged.length };
}

const erp = object(readJson(erpPath));
const published = object(readJson(publishedPath));
const candidateFile = object(readJson(candidatePath));
const candidate = object(candidateFile.payload);
const currentSource = object(erp.workbookSource);

const report = {
  dryRun: true,
  writesEnabled: false,
  projectId: 'sl-transit-9464e',
  proposedTargetPath: '/data/erpDataCenter/workbookSource',
  backups: {
    erpDataCenter: { path: path.resolve(erpPath), sha256: hash(erp), bytes: fs.statSync(erpPath).size },
    publishedSchedule: { path: path.resolve(publishedPath), sha256: hash(published), bytes: fs.statSync(publishedPath).size }
  },
  currentErpCounts: {
    routes: count(erp.routes),
    fareSegments: count(erp.fareSegments),
    fareOriginBuckets: count(erp.fares),
    fareRecords: countChildren(erp.fares),
    scheduleOffers: count(erp.scheduleOffers),
    workbookRouteFareRows: count(currentSource.routeFareRows),
    workbookScheduleRows: count(currentSource.scheduleRows)
  },
  currentPublishedCounts: Object.assign({}, object(published.counts)),
  candidateReconciliation: candidate.reconciliation,
  changes: {
    routeFareRows: compareMaps(currentSource.routeFareRows, candidate.routeFareRows),
    scheduleRows: compareMaps(currentSource.scheduleRows, candidate.scheduleRows),
    manifestChanged: hash(currentSource.manifest) !== hash(candidate.manifest),
    reconciliationChanged: hash(currentSource.reconciliation) !== hash(candidate.reconciliation)
  },
  excludedPaths: [
    '/publishedSchedule', '/bookings', '/passengers', '/tickets', '/payments',
    '/operations', '/data/erpDataCenter/fleet', '/data/erpDataCenter/paymentOwnership'
  ],
  safety: {
    firebaseWrites: false,
    deploy: false,
    productionApply: false,
    publishedScheduleChanged: false,
    operationalDataChanged: false
  }
};

report.readyForOwnerReview = candidate.reconciliation && candidate.reconciliation.valid === true;
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ outputPath: path.resolve(outputPath), readyForOwnerReview: report.readyForOwnerReview, currentErpCounts: report.currentErpCounts, candidateCounts: candidate.reconciliation && candidate.reconciliation.counts }));
