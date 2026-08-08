const assert = require('assert');
const network = require('../network-engine.js');

const groups = network.normalizeGroups({
  operator_001: {
    serviceGroupId: 'operator_001',
    nameTh: 'บริษัทหลัก',
    operationMode: 'integrated',
    hasFleet: true,
    hasLiveLocation: true,
    hasQueue: true,
    canBook: true
  },
  operator_002: {
    serviceGroupId: 'operator_002',
    nameTh: 'บริษัทพันธมิตร',
    operationMode: 'schedule_only'
  }
});

assert.strictEqual(groups[0].operatorId, 'operator_001');
assert.strictEqual(groups[0].capabilities.hasFleet, true);
assert.strictEqual(groups[0].capabilities.trackingMode, 'live');
assert.strictEqual(groups[1].capabilities.operationMode, 'schedule_only');
assert.strictEqual(groups[1].capabilities.hasFleet, false);
assert.strictEqual(groups[1].capabilities.hasLiveLocation, false);
assert.strictEqual(groups[1].capabilities.hasQueue, false);
assert.strictEqual(groups[1].capabilities.bookingMode, 'reference_only');

const externalTrip = network.normalizeTrip({
  tripId: 'operator_002_trip_001',
  serviceGroupId: 'operator_002',
  vehicleId: 'must-not-be-used'
}, groups[1]);
assert.strictEqual(externalTrip.operationMode, 'schedule_only');
assert.strictEqual(externalTrip.scheduleOnly, true);
assert.strictEqual(externalTrip.trackingMode, 'schedule_only');
assert.strictEqual(externalTrip.bookingMode, 'reference_only');
assert.strictEqual(externalTrip.vehicleId, '');

const validation = network.validateAdminData({
  stops: { hub: { order: 1, stopType: 'transfer_hub' } },
  groups: {
    operator_002: {
      serviceGroupId: 'operator_002',
      operationMode: 'schedule_only',
      routes: [{ routeId: 'r1', toStopKey: 'hub', vehicleId: 'legacy-car' }]
    }
  }
});
assert.strictEqual(validation.valid, true);
assert(validation.warnings.some((warning) => warning.includes('schedule_only')));

console.log('network-engine ok');

const journeys = network.buildJourneys({
  originStopKey: 'origin',
  destinationStopKey: 'destination',
  serviceDate: '2026-08-08',
  legs: [
    { tripId: 'main_1', fromStopKey: 'origin', toStopKey: 'hub', departureTime: '08:00', arrivalTime: '09:00', operationMode: 'integrated', bookingMode: 'bookable' },
    { tripId: 'partner_1', fromStopKey: 'hub', toStopKey: 'destination', departureTime: '09:20', arrivalTime: '10:20', operationMode: 'schedule_only' }
  ]
});
assert.strictEqual(journeys.length, 1);
assert.strictEqual(journeys[0].connectionStatus, 'connected');
assert.strictEqual(journeys[0].transferCount, 1);
assert.deepStrictEqual(journeys[0].transferWaitMinutes, [20]);
assert.strictEqual(journeys[0].referenceOnly, true);
assert.strictEqual(journeys[0].trackingMode, 'schedule_only');
assert.strictEqual(journeys[0].legs[1].operatorId, '');

const missingArrivalJourneys = network.buildJourneys({
  originStopKey: 'origin',
  destinationStopKey: 'destination',
  legs: [
    { tripId: 'missing_arrival_1', fromStopKey: 'origin', toStopKey: 'hub', departureTime: '08:00' },
    { tripId: 'missing_arrival_2', fromStopKey: 'hub', toStopKey: 'destination', departureTime: '09:20', arrivalTime: '10:20' }
  ]
});
assert.strictEqual(missingArrivalJourneys.length, 0, 'missing arrival time must not create a connection');
