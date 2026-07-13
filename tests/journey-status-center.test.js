const assert = require('assert');
const status = require('../journey-status-center.js');

const pickup = { lat: 13.7, lng: 101.1 };
const nearVehicle = { lat: 13.7005, lng: 101.1005 };
const farVehicle = { lat: 13.8, lng: 101.2 };

assert.strictEqual(status.originBoardingState({ vehiclePoint: nearVehicle, pickupPoint: pickup, pickupRadiusKm: 0.35 }).status, 'vehicle_at_pickup');
assert.strictEqual(status.originBoardingState({ vehiclePoint: farVehicle, pickupPoint: pickup, pickupRadiusKm: 0.35 }).status, 'waiting_vehicle');
assert.strictEqual(status.originBoardingState({ boarded: true, vehiclePoint: farVehicle, pickupPoint: pickup }).status, 'boarded');

const transferBooking = { arrivedTransferPoint: { ts: 1000 } };
assert.deepStrictEqual(status.arrivalInfo(transferBooking), { type: 'transfer', ts: 1000, status: 'arrived_transfer_point' });
assert.strictEqual(status.serviceEnded(transferBooking, 1000 + 3600001, 3600000), true);

assert.strictEqual(status.journeyArrivalState({ boarded: false }).status, 'waiting_boarding');
assert.strictEqual(status.journeyArrivalState({
  boarded: true,
  sourcePoint: nearVehicle,
  targetPoint: pickup,
  targetType: 'transfer',
  arrivalRadiusKm: 0.35
}).status, 'arrived_transfer_point');
assert.strictEqual(status.journeyArrivalState({
  boarded: true,
  sourcePoint: farVehicle,
  targetPoint: pickup,
  targetType: 'destination',
  etaMinutes: 20
}).status, 'in_transit');
assert.strictEqual(status.journeyArrivalState({
  boarded: true,
  sourcePoint: farVehicle,
  targetPoint: pickup,
  targetType: 'destination',
  etaMinutes: 1
}).status, 'arrived_destination');

console.log('journey-status-center ok');
