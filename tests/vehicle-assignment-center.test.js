const assert = require('assert');
const center = require('../vehicle-assignment-center.js');

assert.strictEqual(center.plannedVehicleIdForBooking({ plannedVehicleId: 'car1' }, {}), 'car1');
assert.strictEqual(center.plannedVehicleIdForBooking({ vehicleId: 'car2' }, {}), '');
assert.strictEqual(center.plannedVehicleIdForBooking({}, { plannedVehicleId: 'car3' }), 'car3');

const ready = center.selectBookedVehicle({
  booking: { code: 'TB123456', plannedVehicleId: 'car1' },
  vehicles: { car1: { lat: 13.7, lng: 101.1, speedKmh: 35 } }
});
assert.strictEqual(ready.status, 'ready');
assert.strictEqual(ready.id, 'car1');
assert.strictEqual(ready.location.lat, 13.7);

const missingAssignment = center.selectBookedVehicle({ booking: { code: 'TB000001' }, vehicles: {} });
assert.strictEqual(missingAssignment.status, 'missing_assignment_contract');

const legacyOnly = center.selectBookedVehicle({
  booking: { code: 'TB000002', vehicleId: 'car2', carId: 'car2' },
  vehicles: { car2: { lat: 13.7, lng: 101.1 } }
});
assert.strictEqual(legacyOnly.status, 'missing_assignment_contract');

const missingVehicle = center.selectBookedVehicle({
  booking: { plannedVehicleId: 'car9' },
  vehicles: {}
});
assert.strictEqual(missingVehicle.status, 'missing_assigned_vehicle');

const inactive = center.selectBookedVehicle({
  booking: { plannedVehicleId: 'car1' },
  vehicles: { car1: { lat: 13.7, lng: 101.1 } },
  isActiveVehicle: () => false
});
assert.strictEqual(inactive.status, 'missing_assigned_vehicle');

const scheduleOnly = center.selectBookedVehicle({
  booking: { plannedVehicleId: 'car5' },
  assignment: { scheduleOnly: true },
  vehicles: { car5: { lat: 13.7, lng: 101.1 } }
});
assert.strictEqual(scheduleOnly.status, 'schedule_only');

console.log('vehicle-assignment-center ok');
