'use strict';

const assert = require('node:assert/strict');
const {
  decideBookingAvailability,
  buildErpLogicCenterDryRun
} = require('../tools/erp-logic-center-dry-run.js');

const now = new Date('2026-07-12T10:00:00').getTime();

const open = decideBookingAvailability({
  serviceDate: '2026-07-12',
  time: '12:00',
  now,
  cutoffMinutes: 60,
  capacity: 12,
  bookedSeats: 4,
  requestedSeats: 2,
  destinationStopKey: 'phanom'
});
assert.equal(open.available, true, 'open trip should be available');
assert.equal(open.reason, 'available', 'open trip reason mismatch');
assert.equal(open.seatsLeft, 8, 'seats left mismatch');

const bookingClosed = decideBookingAvailability({
  bookingOpen: false,
  serviceDate: '2026-07-12',
  time: '12:00',
  now
});
assert.equal(bookingClosed.available, false, 'global booking closure must block');
assert.equal(bookingClosed.reason, 'booking_closed', 'booking closed reason mismatch');

const disabled = decideBookingAvailability({
  serviceDate: '2026-07-12',
  time: '12:00',
  now,
  disabledTimes: ['12:00'],
  capacity: 12
});
assert.equal(disabled.available, false, 'disabled time must block');
assert.equal(disabled.reason, 'disabled_time', 'disabled time reason mismatch');

const closedStop = decideBookingAvailability({
  serviceDate: '2026-07-12',
  time: '12:00',
  now,
  closedStopsByTime: { '12:00': ['phanom'] },
  destinationStopKey: 'phanom',
  capacity: 12
});
assert.equal(closedStop.available, false, 'closed stop must block');
assert.equal(closedStop.reason, 'closed_stop', 'closed stop reason mismatch');

const closedRoute = decideBookingAvailability({
  serviceDate: '2026-07-12',
  time: '12:00',
  now,
  closedStopsByTime: { '12:00': ['__route__'] },
  destinationStopKey: 'any_stop',
  capacity: 12
});
assert.equal(closedRoute.reason, 'closed_stop', 'route closure must block every stop');

const cutoff = decideBookingAvailability({
  serviceDate: '2026-07-12',
  time: '10:30',
  now,
  cutoffMinutes: 60,
  capacity: 12
});
assert.equal(cutoff.available, false, 'cutoff window must block');
assert.equal(cutoff.reason, 'cutoff_closed', 'cutoff reason mismatch');

const full = decideBookingAvailability({
  serviceDate: '2026-07-12',
  time: '12:00',
  now,
  capacity: 5,
  bookedSeats: 4,
  requestedSeats: 2
});
assert.equal(full.available, false, 'capacity full must block');
assert.equal(full.reason, 'capacity_full', 'capacity full reason mismatch');
assert.equal(full.seatsLeft, 1, 'full trip seats left mismatch');

const unlimited = decideBookingAvailability({
  serviceDate: '2026-07-12',
  time: '12:00',
  now,
  capacity: 0,
  bookedSeats: 99,
  requestedSeats: 5
});
assert.equal(unlimited.available, true, 'missing capacity limit should not block');
assert.equal(unlimited.seatsLeft, null, 'unlimited seats left should be null');

const dryRun = buildErpLogicCenterDryRun();
assert.equal(dryRun.counts.bookingAvailability.available, 1, 'sample available count mismatch');
assert.equal(dryRun.counts.bookingAvailability.cutoff_closed, 1, 'sample cutoff count mismatch');
assert.equal(dryRun.counts.bookingAvailability.disabled_time, 1, 'sample disabled count mismatch');
assert.equal(dryRun.counts.bookingAvailability.closed_stop, 1, 'sample closed stop count mismatch');
assert.equal(dryRun.counts.bookingAvailability.capacity_full, 1, 'sample full count mismatch');

console.log('erp-logic-center booking availability ok');
