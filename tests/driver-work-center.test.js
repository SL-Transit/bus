const assert = require('assert');
const center = require('../driver-work-center.js');

const trip = {
  queueTripId: 'qt_000001',
  tripNo: '1',
  routeId: 'ROUTE-MAIN-004',
  routeNameTh: 'สนามชัยเขต - ฉะเชิงเทรา',
  routeDirection: 'to_chachoengsao',
  routeSequenceVersionId: 'rsv_000001',
  orderedStops: [
    { sequence: 1, groupStopId: 'group_001', stopKey: 'sanamchai', stopNameTh: 'สนามชัยเขต', time: '09:00', lat: 13.65, lng: 101.44 },
    { sequence: 2, groupStopId: 'group_002', stopKey: 'chachoengsao', stopNameTh: 'ฉะเชิงเทรา', time: '10:20', lat: 13.69, lng: 101.07 }
  ]
};

const ready = center.buildDriverWorkContract({
  status: 'assigned',
  serviceDate: '2026-07-14',
  vehicleId: 'car1',
  erpVehicleId: 'veh_001',
  assignmentId: 'daily_20260714_veh001',
  assignmentMode: 'rotation',
  queueId: 'queue_001',
  queueNo: 1,
  queueScheduleVersionId: 'qsv_000001',
  currentTrip: trip,
  nextTrip: null
});
assert.strictEqual(ready.status, 'ready');
assert.strictEqual(ready.contract.contractVersion, 'driver_work_v1');
assert.strictEqual(ready.contract.vehicleId, 'car1');
assert.strictEqual(ready.contract.erpVehicleId, 'veh_001');
assert.strictEqual(ready.contract.currentTrip.queueTripId, 'qt_000001');
assert.strictEqual(ready.contract.currentTrip.orderedStops[0].lat, 13.65);

const unassigned = center.buildDriverWorkContract({ status: 'unassigned', serviceDate: '2026-07-14', vehicleId: 'car9', erpVehicleId: 'veh_009' });
assert.strictEqual(unassigned.status, 'unassigned');
assert.strictEqual(unassigned.contract.queueId, undefined);

const missingQueue = center.buildDriverWorkContract({
  serviceDate: '2026-07-14', vehicleId: 'car1', erpVehicleId: 'veh_001', assignmentId: 'x', assignmentMode: 'rotation', currentTrip: trip
});
assert.strictEqual(missingQueue.status, 'invalid_contract');

const badMode = center.buildDriverWorkContract({
  serviceDate: '2026-07-14', vehicleId: 'car1', erpVehicleId: 'veh_001', assignmentId: 'x', assignmentMode: 'guessed', queueId: 'queue_001', queueNo: 1, currentTrip: trip
});
assert.strictEqual(badMode.status, 'invalid_contract');

const missingCoordinates = JSON.parse(JSON.stringify(trip));
delete missingCoordinates.orderedStops[0].lat;
assert.strictEqual(center.normalizeTrip(missingCoordinates), null);

console.log('driver-work-center ok');
