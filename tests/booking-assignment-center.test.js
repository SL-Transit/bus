const assert = require('assert');
const center = require('../booking-assignment-center.js');

const ready = center.buildBookingAssignmentContract({
  serviceDate: '2026-07-14',
  routeId: 'route_sanamchai_chachoengsao',
  tripId: 'trip_0900',
  departTime: '09:00',
  originName: 'ท่ารถสนามชัยเขต',
  resolvedAssignment: {
    queueNo: 1,
    plannedVehicleId: 'car1',
    tripIndex: 1,
    pickupTime: '09:00',
    pickupStopKey: 'sanamchai',
    routeStops: ['sanamchai', 'chachoengsao'],
    routeStopNames: ['ท่ารถสนามชัยเขต', 'ฉะเชิงเทรา (แปดริ้ว)'],
    assignmentSource: 'erp_logic_center'
  }
});

assert.strictEqual(ready.status, 'ready');
assert.strictEqual(ready.assignment.contractVersion, 'booking_assignment_v1');
assert.strictEqual(ready.assignment.queueNo, 1);
assert.strictEqual(ready.assignment.plannedVehicleId, 'car1');
assert.strictEqual(ready.assignment.tripId, 'trip_0900');

const missingVehicle = center.buildBookingAssignmentContract({
  resolvedAssignment: { queueNo: 1, tripIndex: 1 }
});
assert.strictEqual(missingVehicle.status, 'missing_assignment_contract');
assert.strictEqual(missingVehicle.assignment, null);
assert(missingVehicle.missing.includes('plannedVehicleId'));

const legacyVehicleAlias = center.buildBookingAssignmentContract({
  resolvedAssignment: { queueNo: 1, vehicleId: 'car1', tripIndex: 1, assignmentSource: 'local_fallback' }
});
assert.strictEqual(legacyVehicleAlias.status, 'missing_assignment_contract');

const pageFallback = center.buildBookingAssignmentContract({
  resolvedAssignment: { queueNo: 1, plannedVehicleId: 'car1', tripIndex: 1 }
});
assert.strictEqual(pageFallback.status, 'missing_assignment_contract');
assert(pageFallback.missing.includes('assignmentSource'));

const scheduleOnly = center.buildBookingAssignmentContract({
  serviceDate: '2026-07-14',
  departTime: '17:20',
  resolvedAssignment: {
    scheduleOnly: true,
    plannedVehicleId: 'must_not_survive',
    pickupStopName: 'ฉะเชิงเทรา (แปดริ้ว)'
  }
});
assert.strictEqual(scheduleOnly.status, 'schedule_only');
assert.strictEqual(scheduleOnly.assignment.plannedVehicleId, '');
assert.strictEqual(scheduleOnly.assignment.noLiveTracking, true);

console.log('booking-assignment-center ok');
