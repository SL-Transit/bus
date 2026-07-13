'use strict';

const assert = require('assert');
const { buildDryRunSnapshot } = require('../tools/erp-data-center-dry-run-snapshot.js');
const { buildDriverWorkDay } = require('../driver-work-producer.js');

(async () => {
  const snapshot = await buildDryRunSnapshot();
  const erp = snapshot.snapshot.erpDataCenter;

  assert(Object.values(erp.groupStops).every((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng)), 'ERP group stops must provide source-proven coordinates');

  const fixedOnly = buildDriverWorkDay({
    erpDataCenter: erp,
    serviceDate: '2026-07-14',
    currentTime: '06:00'
  });
  assert.strictEqual(fixedOnly.dryRun, true);
  assert.strictEqual(fixedOnly.writesEnabled, false);
  assert.strictEqual(fixedOnly.readyForApply, false);
  assert.strictEqual(fixedOnly.contractsByRuntimeVehicleId.car5.erpVehicleId, 'veh_005');
  assert.strictEqual(fixedOnly.contractsByRuntimeVehicleId.car5.vehicleId, 'car5');
  assert.strictEqual(fixedOnly.contractsByRuntimeVehicleId.car5.assignmentMode, 'fixed');
  assert.strictEqual(fixedOnly.contractsByRuntimeVehicleId.car5.queueId, 'queue_005');
  assert.strictEqual(fixedOnly.counts.fixed, 1);
  assert.strictEqual(fixedOnly.counts.unassigned, 4);
  assert.strictEqual(fixedOnly.blockers.filter((item) => item.code === 'missing_daily_assignment').length, 4);

  const assigned = buildDriverWorkDay({
    erpDataCenter: erp,
    serviceDate: '2026-07-14',
    currentTime: '10:00',
    dailyAssignments: {
      veh_001: { assignmentId: 'daily_20260714_veh001', queueId: 'queue_001' },
      veh_002: { assignmentId: 'daily_20260714_veh002', queueId: 'queue_002' },
      veh_003: { assignmentId: 'daily_20260714_veh003', queueId: 'queue_003' },
      veh_004: { assignmentId: 'daily_20260714_veh004', queueId: 'queue_004' }
    }
  });
  assert.strictEqual(assigned.blockers.length, 0);
  assert.strictEqual(assigned.counts.rotation, 4);
  assert.strictEqual(assigned.counts.fixed, 1);
  assert.strictEqual(Object.keys(assigned.contractsByRuntimeVehicleId).length, 5);
  assert(assigned.contractsByRuntimeVehicleId.car1.currentTrip || assigned.contractsByRuntimeVehicleId.car1.nextTrip, 'central producer must select current or next trip');
  assert(Number.isFinite(assigned.contractsByRuntimeVehicleId.car1.currentTrip.orderedStops[0].lat), 'driver work must contain ready stop coordinates');

  const overridden = buildDriverWorkDay({
    erpDataCenter: erp,
    serviceDate: '2026-07-14',
    currentTime: '10:00',
    manualOverrides: {
      veh_001: { assignmentId: 'override_20260714_veh001', queueId: 'queue_002' }
    }
  });
  assert.strictEqual(overridden.contractsByRuntimeVehicleId.car1.assignmentMode, 'manual_override');
  assert.strictEqual(overridden.contractsByRuntimeVehicleId.car1.queueId, 'queue_002');

  const invalidRotation = buildDriverWorkDay({
    erpDataCenter: erp,
    serviceDate: '2026-07-14',
    currentTime: '10:00',
    dailyAssignments: {
      veh_001: { assignmentId: 'bad_daily_assignment', queueId: 'queue_005' }
    }
  });
  assert(invalidRotation.blockers.some((item) => item.code === 'invalid_daily_assignment' && item.erpVehicleId === 'veh_001'));
  assert.strictEqual(invalidRotation.contractsByRuntimeVehicleId.car1, undefined);

  const duplicateQueue = buildDriverWorkDay({
    erpDataCenter: erp,
    serviceDate: '2026-07-14',
    currentTime: '10:00',
    dailyAssignments: {
      veh_001: { assignmentId: 'daily_1', queueId: 'queue_001' },
      veh_002: { assignmentId: 'daily_2', queueId: 'queue_001' }
    }
  });
  assert(duplicateQueue.blockers.some((item) => item.code === 'duplicate_queue_assignment' && item.erpVehicleId === 'veh_002'));
  assert.strictEqual(duplicateQueue.contractsByRuntimeVehicleId.car2, undefined);

  console.log('driver work producer ok');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
