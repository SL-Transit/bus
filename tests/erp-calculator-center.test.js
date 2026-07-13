const assert = require('assert');
const calculator = require('../erp-calculator-center.js');

const eta = calculator.estimateEta({
  roadDistanceKm: 12,
  speedKmh: 24
});
assert.strictEqual(eta.status, 'moving');
assert.strictEqual(eta.etaMinutes, 30);
assert.strictEqual(eta.displayText, '30 นาที');
assert.strictEqual(eta.distanceSource, 'road');

const longEta = calculator.estimateEta({
  roadDistanceKm: 90,
  speedKmh: 45
});
assert.strictEqual(longEta.displayText, '2 ชั่วโมง');

const fallback = calculator.normalizeRoadDistance({
  from: { lat: 13.692383, lng: 101.054183 },
  to: { lat: 13.742383, lng: 101.104183 },
  fallbackRoadDistanceFactor: 1.2
});
assert.strictEqual(fallback.status, 'ready');
assert.strictEqual(fallback.source, 'fallback');
assert.ok(fallback.distanceKm > 0);

const catchable = calculator.findCatchableTrip({
  arrivalMinutesOfDay: calculator.minutesOfDay('10:10'),
  transferBufferMinutes: 15,
  trips: [{ time: '10:20' }, { time: '10:30' }, { time: '11:00' }]
});
assert.strictEqual(catchable.time, '10:30');
assert.strictEqual(catchable.waitMinutes, 20);

assert.strictEqual(calculator.combineFare([{ price: 40 }, { fare: 35 }]), 75);

console.log('erp-calculator-center ok');
