'use strict';

const assert = require('assert');
const readModel = require('../admin-erp-read-model.js');

assert.strictEqual(readModel.sources.stops.path, 'data/erpDataCenter/stops');
assert.strictEqual(readModel.sources.fares.path, 'data/erpDataCenter/workbookSource/routeFareRows');
assert.strictEqual(readModel.sources.rounds.path, 'data/erpDataCenter/workbookSource/scheduleRows');
assert.strictEqual(readModel.sources.vehicles.path, 'data/erpDataCenter/fleet/vehicles');

(async () => {
  let called = '';
  const adapter = {
    getCatalog: async (entity) => { called = `catalog:${entity}`; return { status: 'empty', rows: [] }; },
    getWorkbookSource: async (sheet) => { called = `workbook:${sheet}`; return { status: 'empty', rows: [] }; }
  };
  await readModel.read('stops', adapter);
  assert.strictEqual(called, 'catalog:stops');
  await readModel.read('fares', adapter);
  assert.strictEqual(called, 'workbook:routeFareRows');
  await assert.rejects(() => readModel.read('accounts', adapter), /no_approved_read_source/);
  console.log('admin-erp read model: PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });
