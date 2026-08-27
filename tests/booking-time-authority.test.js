const assert = require('assert');
const fs = require('fs');
const workbookSource = require('../erp-workbook-booking-source.js');
const timeAuthority = require('../functions/booking-time-authority.js');

const routeFareRows = {
  fare_1: {
    sourceRowId: 'fare_1', routeId: 'route_1', fromStopKey: 'A', toStopKey: 'B',
    fromNameTh: 'ต้นทาง', toNameTh: 'ปลายทาง', amount: 100, status: true
  }
};
const scheduleRows = {
  schedule_1: {
    sourceRowId: 'schedule_1', scheduleOfferId: 'trip_0955', routeId: 'route_1',
    originNameTh: 'ต้นทาง', destinationNameTh: 'ปลายทาง', departureTime: '09:55',
    bookingEnabled: true, capacity: 3
  }
};
const index = workbookSource.build(routeFareRows, scheduleRows, {}, {});
const trip = index.selectedRoute('ต้นทาง', 'ปลายทาง').segments[0].times[0];

assert.strictEqual(trip.departureTime, '09:55');
assert.strictEqual(trip.time, '09:55');
assert.strictEqual(trip.tripId, 'trip_0955');
assert.strictEqual(trip.scheduleOfferId, 'trip_0955');
assert.strictEqual(trip.scheduleRowId, 'schedule_1');

assert.deepStrictEqual(
  timeAuthority.resolveBookingTime({ time: '09:55', pickupTime: '09:55' }, trip),
  { ok: true, error: '', time: '09:55' }
);
assert.strictEqual(
  timeAuthority.resolveBookingTime({ time: '06:35', pickupTime: '06:35' }, trip).error,
  'authoritative_time_mismatch'
);
assert.strictEqual(
  timeAuthority.resolveBookingTime({ time: '06:35', pickupTime: '09:55' }, trip).error,
  'authoritative_time_mismatch'
);
assert.strictEqual(
  timeAuthority.resolveBookingTime({}, trip).error,
  'authoritative_time_mismatch'
);

const bridge = fs.readFileSync('booking-bridge.js', 'utf8');
const adapter = fs.readFileSync('booking1-preview-adapter.js', 'utf8');
const backend = fs.readFileSync('functions/index.js', 'utf8');
const bookingPage = fs.readFileSync('booking1.html', 'utf8');
assert(bridge.includes("tripId: timeEntry.tripId || timeEntry.scheduleOfferId"));
assert(bridge.includes("scheduleRowId: timeEntry.scheduleRowId || timeEntry.sourceRowId"));
assert(adapter.includes("state.tripTime = trip.canonicalDepartureTime || trip.pickupTime"));
assert(bridge.includes("pickupTime || tripKey || 'time_unknown'"), 'existing seat counters must remain keyed by departure time');
assert(backend.includes('bookingTimeAuthority.resolveBookingTime(input, pair)'));
assert(backend.includes('canonical_trip_identity_required'));
assert(backend.includes('time: authoritativeTime.time, pickupTime: authoritativeTime.time'));
assert(!bookingPage.includes('  _populateStopPicker();\n  _updateDateDisplay();\n  renderTrips();'), 'legacy renderer must not race the ERP preview adapter');

console.log('booking time authority behavioral contract ok');
