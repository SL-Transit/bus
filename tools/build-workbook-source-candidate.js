#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const sourceContract = require('../erp-workbook-source-contract.js');

const workbookPath = process.argv[2];
const outputPath = process.argv[3];
if (!workbookPath || !outputPath) {
  console.error('Usage: node tools/build-workbook-source-candidate.js <workbook.xlsx> <candidate.json>');
  process.exit(2);
}

const extractor = path.join(__dirname, 'read-owner-workbook.ps1');
const result = spawnSync('powershell', [
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', extractor,
  '-WorkbookPath', path.resolve(workbookPath)
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'Workbook extraction failed');
  process.exit(result.status || 1);
}

const workbook = JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim());
const payload = sourceContract.buildCandidate(workbook);
const candidate = {
  dryRun: true,
  writesEnabled: false,
  targetPath: '/data/erpDataCenter/workbookSource',
  payload,
  safety: { firebaseWrites: false, seed: false, deploy: false, productionApply: false }
};

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), JSON.stringify(candidate, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ outputPath: path.resolve(outputPath), reconciliation: payload.reconciliation }));
if (!payload.reconciliation.valid) process.exit(3);
