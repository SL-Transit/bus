'use strict';

const assert = require('assert');
const readModel = require('../admin-erp-read-model.js');

const expected = {
  stops: { kind: 'catalog', name: 'stops', path: 'data/erpDataCenter/stops' },
  routes: { kind: 'catalog', name: 'serviceGroups', path: 'data/erpDataCenter/serviceGroups' },
  fares: { kind: 'workbook', name: 'routeFareRows', path: 'data/erpDataCenter/workbookSource/routeFareRows' },
  rounds: { kind: 'workbook', name: 'scheduleRows', path: 'data/erpDataCenter/workbookSource/scheduleRows' },
  stopTimes: { kind: 'catalog', name: 'stopTimes', path: 'data/erpDataCenter/stopTimes' },
  vehicles: { kind: 'catalog', name: 'vehicles', path: 'data/erpDataCenter/fleet/vehicles' },
  payments: { kind: 'catalog', name: 'paymentOwnership', path: 'data/erpDataCenter/paymentOwnership' },
  driverGroups: { kind: 'catalog', name: 'serviceGroups', path: 'data/erpDataCenter/serviceGroups' }
};

assert.deepStrictEqual(Object.keys(readModel.sources).sort(), Object.keys(expected).sort(), 'only approved ERP read sources may be exposed');

Object.keys(expected).forEach((tab) => {
  assert.strictEqual(readModel.sources[tab].kind, expected[tab].kind, tab + ' mapping kind mismatch');
  assert.strictEqual(readModel.sources[tab].name, expected[tab].name, tab + ' mapping name mismatch');
  assert.strictEqual(readModel.sources[tab].path, expected[tab].path, tab + ' mapping must use its canonical path');
  assert.strictEqual(readModel.sources[tab].orderField, 'sourceRowNumber', tab + ' must use the Excel source row number for ordering');
  assert(readModel.sources[tab].excelSheet, tab + ' must declare its source Excel sheet');
  assert(readModel.sources[tab].fields.length > 0, tab + ' must declare UI field mapping');
  assert(readModel.sources[tab].fields.every((field) => typeof field === 'string' && field.length > 0), tab + ' fields must be named');
});

assert.deepStrictEqual(readModel.sources.routes.fields, [
  'serviceGroupId', 'displayNameTh', 'sortOrder', 'groupType', 'transferStopKey',
  'minTransferMinutes', 'maxWaitMinutes', 'idealWaitMinutes', 'reliability',
  'displayOrder', 'passengerSelectable', 'status'
], 'เส้นทาง must expose the exact fields from Excel sheet 02');

['staff', 'accounts', 'alerts'].forEach((tab) => {
  assert.strictEqual(readModel.sourceForTab(tab), null, tab + ' must not read without an approved backend contract');
});

(async () => {
  const calls = [];
  const adapter = {
    getCatalog(name, query) { calls.push({ kind: 'catalog', name, query }); return Promise.resolve({ status: 'ready', rows: [] }); },
    getWorkbookSource(name, query) { calls.push({ kind: 'workbook', name, query }); return Promise.resolve({ status: 'ready', rows: [] }); }
  };

  await Promise.all(Object.keys(expected).map((tab) => readModel.read(tab, adapter, { limit: 25 })));
  assert.deepStrictEqual(calls.map((call) => call.kind + ':' + call.name).sort(), Object.keys(expected).map((tab) => expected[tab].kind + ':' + expected[tab].name).sort(), 'each approved UI category must call only its mapped adapter read');
  assert(calls.every((call) => call.query && call.query.limit === 25), 'read queries must pass through to the adapter');

  await assert.rejects(() => readModel.read('staff', adapter), /no_approved_read_source:staff/);
  assert.strictEqual(calls.length, Object.keys(expected).length, 'unapproved categories must not call Firebase through the adapter');

  console.log('admin erp read model contract: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
