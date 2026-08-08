'use strict';

const assert = require('assert');
require('../erp-schema.js');
const planApi = require('../erp-import-plan.js');

const plan = planApi.buildWorkbookSourceImportPlan({
  sourceWorkbookName: 'owner-master.xlsx',
  masterData: {
    serviceGroups: { group_001: { serviceGroupId: 'group_001', displayNameTh: 'หลัก' } },
    vehicles: { veh_001: { vehicleId: 'veh_001', active: true, serviceGroupId: 'group_001', note: 'ทดลอง' } }
  },
  routeFareRows: { fare_1: { routeId: 'r1' } },
  scheduleRows: { schedule_1: { scheduleOfferId: 't1', departureTime: '09:00' } },
  manifest: { networkReady: false },
  reconciliation: { valid: true, networkReady: false }
});

assert.strictEqual(plan.dryRun, true);
assert.strictEqual(plan.writesEnabled, false);
assert(plan.updates['data/erpDataCenter/serviceGroups/group_001']);
assert.strictEqual(plan.updates['data/erpDataCenter/fleet/vehicles/veh_001'].status, 'provisional');
assert(!JSON.stringify(plan).includes('password'));
const checked = planApi.validateImportPlan(plan);
assert.strictEqual(checked.readyForApply, false);
assert.strictEqual(checked.writesEnabled, false);
assert(!checked.blockers.some((item) => item.code === 'non-erp-data-center-target'));
console.log('owner workbook import plan ok');
