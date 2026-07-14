'use strict';

const assert = require('node:assert/strict');
const center = require('../booking-availability-center.js');

const base = {
  preview: { readyForApply: true, productionReady: true, writesEnabled: true },
  pair: { bookingEligible: true, originDestinationId: 'chachoengsao', destinationId: 'phanom' },
  segment: {},
  timeEntry: { time: '12:00' },
  option: { destinationId: 'phanom' },
  serviceDate: '2026-07-14',
  now: new Date('2026-07-14T09:00:00').getTime(),
  capacity: { capacity: 10, bookedSeats: 4 },
  requestedSeats: 2
};

const available = center.decideBookingAvailability(base);
assert.equal(available.status, 'available');
assert.equal(available.bookingEligible, true);
assert.equal(available.reasonCode, 'available');
assert.equal(available.seatsAvailable, 6);
assert.equal(available.source, 'erp_logic_center');

const previewNotApply = center.decideBookingAvailability(Object.assign({}, base, {
  preview: { readyForApply: false, productionReady: false, writesEnabled: false }
}));
assert.equal(previewNotApply.status, 'unavailable');
assert.equal(previewNotApply.bookingEligible, false);
assert.equal(previewNotApply.selectionAllowed, true);
assert.equal(previewNotApply.reasonCode, 'preview_not_apply_ready');

const transferReference = center.decideBookingAvailability(Object.assign({}, base, {
  pair: { bookingEligible: false, referenceOnly: true, transferStatus: 'feasible_reference', routeChoiceStatus: 'reference_only' }
}));
assert.equal(transferReference.status, 'reference_only');
assert.equal(transferReference.bookingEligible, false);
assert.equal(transferReference.selectionAllowed, false);
assert.equal(transferReference.reasonCode, 'reference_only');

const external = center.decideBookingAvailability(Object.assign({}, base, {
  pair: { bookingEligible: false, passengerDisplayMode: 'external_reference', slTransitFareCollection: false }
}));
assert.equal(external.status, 'external_reference');
assert.equal(external.bookingEligible, false);
assert.equal(external.reasonCode, 'external_reference');

const wangNamYen = center.decideBookingAvailability(Object.assign({}, base, {
  pair: { bookingEligible: true, originDestinationId: 'chachoengsao', destinationId: 'wangnamyen', destinationLabel: 'วังน้ำเย็น' },
  option: { destinationId: 'wangnamyen', label: 'วังน้ำเย็น' }
}));
assert.equal(wangNamYen.status, 'unavailable');
assert.equal(wangNamYen.reasonCode, 'wang_nam_yen_disabled');

const closedStop = center.decideBookingAvailability(Object.assign({}, base, {
  closedStopsByTime: { '12:00': ['phanom'] }
}));
assert.equal(closedStop.status, 'unavailable');
assert.equal(closedStop.reasonCode, 'closed_stop');

const full = center.decideBookingAvailability(Object.assign({}, base, {
  capacity: { capacity: 5, bookedSeats: 4 },
  requestedSeats: 2
}));
assert.equal(full.status, 'unavailable');
assert.equal(full.reasonCode, 'capacity_full');
assert.equal(full.seatsAvailable, 1);

console.log('booking-availability-center ok');
