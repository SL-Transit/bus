const assert = require('assert');
const mapDisplay = require('../map-display-center.js');

const first = mapDisplay.planVehicleMarker(null, {
  vehicleId: 'veh_001',
  lat: 13.692383,
  lng: 101.054183,
  speedKmh: 30
});
assert.strictEqual(first.status, 'place');
assert.strictEqual(first.point.lat, 13.692383);

const smooth = mapDisplay.planVehicleMarker(
  { point: { lat: 13.692383, lng: 101.054183 } },
  { vehicleId: 'veh_001', lat: 13.693, lng: 101.055, speedKmh: 30 },
  { maxStepMeters: 250 }
);
assert.strictEqual(smooth.status, 'move');
assert.strictEqual(smooth.animation.mode, 'smooth');

const noWarp = mapDisplay.planVehicleMarker(
  { point: { lat: 13.692383, lng: 101.054183 } },
  { vehicleId: 'veh_001', lat: 14.2, lng: 101.8, speedKmh: 80 },
  { maxStepMeters: 100 }
);
assert.strictEqual(noWarp.status, 'smooth_limited');
assert.strictEqual(noWarp.animation.mode, 'no_warp');
assert.notStrictEqual(noWarp.point.lat, noWarp.targetPoint.lat);

const layer = mapDisplay.prepareVehicleLayer([
  { vehicleId: 'veh_001', lat: 13.7, lng: 101.1 },
  { vehicleId: 'veh_002', lat: 13.8, lng: 101.2 },
  { vehicleId: 'bad' }
], {
  veh_001: { point: { lat: 13.699, lng: 101.099 } }
});
assert.strictEqual(layer.length, 2);
assert.deepStrictEqual(layer.map((item) => item.vehicle.vehicleId), ['veh_001', 'veh_002']);

console.log('map-display-center ok');
