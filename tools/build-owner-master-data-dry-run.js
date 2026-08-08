#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const sourceContract = require('../erp-workbook-source-contract.js');

const workbookPath = process.argv[2];
const outputPath = process.argv[3];
if (!workbookPath || !outputPath) {
  console.error('Usage: node tools/build-owner-master-data-dry-run.js <workbook.xlsx> <dry-run.json>');
  process.exit(2);
}

const extractor = path.join(__dirname, 'read-owner-workbook.ps1');
const result = spawnSync('powershell', [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', extractor,
  '-WorkbookPath', path.resolve(workbookPath)
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'Workbook extraction failed');
  process.exit(result.status || 1);
}

const workbook = JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim());
const candidate = sourceContract.buildCandidate(workbook);
const master = candidate.masterData || {};
const safeVehicles = Object.keys(master.vehicles || {}).reduce((out, id) => {
  const vehicle = Object.assign({}, master.vehicles[id]);
  delete vehicle.password;
  delete vehicle.passcode;
  delete vehicle.pin;
  delete vehicle.loginId;
  delete vehicle.login;
  delete vehicle.driverPhone;
  delete vehicle.temporaryPhone;
  out[id] = vehicle;
  return out;
}, {});
const dryRun = {
  dryRun: true,
  writesEnabled: false,
  readyForReview: candidate.reconciliation.valid === true,
  readyForApply: false,
  source: candidate.sourceWorkbookName,
  generatedAt: new Date().toISOString(),
  targetRoot: 'data/erpDataCenter',
  safety: {
    firebaseWrites: false,
    seed: false,
    deploy: false,
    productionApply: false,
    privatePassengerDataRead: false,
    credentialFieldsExported: false
  },
  counts: {
    serviceGroups: Object.keys(master.serviceGroups || {}).length,
    routeFareRows: Object.keys(candidate.routeFareRows || {}).length,
    scheduleRows: Object.keys(candidate.scheduleRows || {}).length,
    vehicles: Object.keys(safeVehicles).length,
    queueScheduleRows: (master.queueScheduleRows || []).length,
    queueTrips: Object.keys(master.queueTrips || {}).length,
    sensitiveCredentialCount: master.sensitiveCredentialCount || 0
  },
  network: {
    ready: candidate.reconciliation.networkReady === true,
    operationalScheduleReady: candidate.reconciliation.operationalScheduleReady === true,
    approvedScope: candidate.reconciliation.approvedScope || [],
    groupReadiness: candidate.reconciliation.groupReadiness || {},
    blockers: candidate.reconciliation.networkBlockers || []
  },
  data: {
    serviceGroups: master.serviceGroups || {},
    routeFareRows: candidate.routeFareRows || {},
    scheduleRows: candidate.scheduleRows || {},
    fleetVehicles: safeVehicles,
    queueScheduleRows: master.queueScheduleRows || [],
    queueTrips: master.queueTrips || {},
    vehicleQueueAssignments: master.vehicleQueueAssignments || {},
    servicePolicies: master.servicePolicies || {},
    schedulePublicationPolicy: master.schedulePublicationPolicy || null,
    idRegistry: candidate.idRegistry || null
  },
  reconciliation: candidate.reconciliation
};

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), JSON.stringify(dryRun, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ outputPath: path.resolve(outputPath), dryRun: true, writesEnabled: false, readyForApply: false, counts: dryRun.counts, network: { ready: dryRun.network.ready, blockerCount: dryRun.network.blockers.length } }));
