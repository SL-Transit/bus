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

const recommendedToday = calculator.recommendedBookingTrips({
  serviceDate: '2026-07-14',
  now: new Date('2026-07-14T14:57:00+07:00'),
  trips: [{ pickupTime: '09:40' }, { pickupTime: '15:00' }, { pickupTime: '17:20' }]
});
assert.strictEqual(recommendedToday[0].pickupTime, '09:40');
assert.strictEqual(recommendedToday[0].recommended, false);
assert.strictEqual(recommendedToday[0].timeDisplayState, 'past');
assert.strictEqual(recommendedToday[0].displayMuted, true);
assert.strictEqual(recommendedToday[1].pickupTime, '15:00');
assert.strictEqual(recommendedToday[1].recommended, true);
assert.strictEqual(recommendedToday[0].recommendationSource, 'erp_logic_center');
assert.strictEqual(recommendedToday.length, 3);

const recommendedFuture = calculator.recommendedBookingTrips({
  serviceDate: '2026-07-15',
  now: new Date('2026-07-14T14:57:00+07:00'),
  trips: [{ pickupTime: '09:40' }, { pickupTime: '15:00' }]
});
assert.strictEqual(recommendedFuture[0].pickupTime, '09:40');

assert.strictEqual(calculator.combineFare([{ price: 40 }, { fare: 35 }]), 75);

console.log('erp-calculator-center ok');
