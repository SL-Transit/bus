const assert = require('assert');
const mapDisplay = require('../map-display-center.js');

assert.deepStrictEqual(
  mapDisplay.normalizePoint({ latitude: '13.7', longitude: '101.1' }),
  { lat: 13.7, lng: 101.1 }
);

const defaultViewport = mapDisplay.planViewport({});
assert.strictEqual(defaultViewport.mode, 'default');
assert.strictEqual(defaultViewport.zoom, 10);

const focusedViewport = mapDisplay.planViewport({
  focusPoint: { lat: 13.692383, lng: 101.054183 },
  animate: true
});
assert.strictEqual(focusedViewport.mode, 'focus');
assert.strictEqual(focusedViewport.zoom, 14);
assert.strictEqual(focusedViewport.animate, true);

const overviewViewport = mapDisplay.planViewport({
  points: [
    { lat: 13.5, lng: 101.0 },
    { lat: 13.7, lng: 101.4 }
  ]
});
assert.strictEqual(overviewViewport.mode, 'overview');
assert.deepStrictEqual(overviewViewport.center, { lat: 13.6, lng: 101.2 });
assert.deepStrictEqual(overviewViewport.bounds, { minLat: 13.5, maxLat: 13.7, minLng: 101.0, maxLng: 101.4 });
assert.strictEqual(overviewViewport.zoom, 9);

const preservedViewport = mapDisplay.planViewport({ followEnabled: false, points: [{ lat: 13.7, lng: 101.1 }] });
assert.strictEqual(preservedViewport.mode, 'preserve');
assert.strictEqual(preservedViewport.apply, false);

const protectedFollow = mapDisplay.planFollowInteraction({
  followEnabled: true,
  now: 1000,
  programmaticMoveUntil: 1500,
  reason: 'zoom'
});
assert.strictEqual(protectedFollow.followEnabled, true);
assert.strictEqual(protectedFollow.changed, false);

const manualFollow = mapDisplay.planFollowInteraction({
  followEnabled: true,
  now: 2000,
  programmaticMoveUntil: 1500,
  reason: 'drag'
});
assert.deepStrictEqual(manualFollow, { followEnabled: false, changed: true, reason: 'drag' });

const first = mapDisplay.planVehicleMarker(null, {
  vehicleId: 'veh_001',
  lat: 13.692383,
  lng: 101.054183,
  gpsTs: 100000,
  speedKmh: 30
});
assert.strictEqual(first.status, 'place');
assert.strictEqual(first.point.lat, 13.692383);
assert(first.displayState, 'first vehicle marker must return display state');

const smooth = mapDisplay.planVehicleMarker(
  first.displayState,
  { vehicleId: 'veh_001', lat: 13.693, lng: 101.055, gpsTs: 105000, speedKmh: 30 },
  { maxStepMeters: 250 }
);
assert.strictEqual(smooth.status, 'smooth');
assert.strictEqual(smooth.animation.mode, 'smooth');
assert(smooth.displayState, 'smooth marker must return updated display state');

const noWarp = mapDisplay.planVehicleMarker(
  first.displayState,
  { vehicleId: 'veh_001', lat: 13.695, lng: 101.058, gpsTs: 130000, speedKmh: 0 },
  { maxStepMeters: 100 }
);
assert.strictEqual(noWarp.status, 'no_warp_smooth_limited');
assert.strictEqual(noWarp.animation.mode, 'no_warp_smooth_limited');
assert.notStrictEqual(noWarp.point.lat, noWarp.targetPoint.lat);

const stale = mapDisplay.planVehicleMarker(
  noWarp.displayState,
  { vehicleId: 'veh_001', lat: 13.696, lng: 101.059, gpsTs: 120000 },
  { maxStepMeters: 100 }
);
assert.strictEqual(stale.status, 'stale_signal');

const impossibleJump = mapDisplay.planVehicleMarker(
  first.displayState,
  { vehicleId: 'veh_001', lat: 14.2, lng: 101.8, gpsTs: 101000, speedKmh: 0 },
  { maxStepMeters: 100 }
);
assert.strictEqual(impossibleJump.status, 'impossible_jump_ignored');

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
