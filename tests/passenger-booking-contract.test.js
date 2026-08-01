const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const helper = fs.readFileSync(path.join(root, 'functions', 'passenger-booking.js'), 'utf8');
const passengerBooking = require('../functions/passenger-booking.js');
const booking1 = fs.readFileSync(path.join(root, 'booking1.html'), 'utf8');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'database.rules.json'), 'utf8'));

assert(index.includes('exports.createPassengerBooking'), 'createPassengerBooking HTTPS Function must be exported');
assert(index.includes('passengerBooking.createPassengerBooking(admin'), 'Function must delegate creation to trusted backend helper');
assert(helper.includes('publishedSchedule'), 'Backend creation must validate the published schedule source');
assert(helper.includes('fareDecision('), 'Backend creation must calculate fare server-side');
assert(helper.includes('reserveCapacity('), 'Backend creation must reserve capacity server-side');
assert(helper.includes('bookingCode()'), 'Backend creation must generate the canonical booking code');
assert(helper.includes('idemRef.transaction'), 'Backend creation must claim idempotency with an RTDB transaction');
assert(helper.includes('ticketAccessTokenHash'), 'Backend creation must store ticket token hash');
assert(helper.includes('ticketAccessTokenExpiresAt'), 'Backend creation must store token expiry');
assert(helper.includes('verifyReservedCapacity'), 'Booking recovery must verify a matching capacity reservation before writing a booking');
assert(helper.includes('publicBookingCapacityByServiceDate'), 'Backend must maintain a separate public capacity aggregate');
assert(!helper.includes('counterPath'), 'Backend creation must not accept or store client-selected capacity counterPath');
assert(!helper.includes('body.routeId'), 'Browser must not select internal routeId');
assert(!helper.includes('body.tripId'), 'Browser must not select internal tripId');
assert(!helper.includes('body.pairKey'), 'Browser must not select internal pairKey');
assert(!helper.includes('body.assignment'), 'Browser must not select vehicle or queue assignment');
assert(!helper.includes('req.body.price'), 'Backend creation must not trust client price');
assert(!helper.includes('req.body.fare'), 'Backend creation must not trust client fare');
assert(!helper.includes('|| 3'), 'Backend creation must not fall back to default capacity 3');

const oneLeg = passengerBooking.fareDecision(
  { fareAmount: 55, serviceFeeAmount: 5 },
  { time: '09:00', fareAmount: 55, serviceFeeAmount: 5 },
  { pax: 1 }
);
assert.strictEqual(oneLeg.providerFareTotal, 55, 'one passenger one leg provider fare');
assert.strictEqual(oneLeg.platformServiceFeeTotal, 5, 'platform fee applies once per booking');
assert.strictEqual(oneLeg.passengerGrossPayment, 60, 'one passenger gross payment');

const multiPassenger = passengerBooking.fareDecision(
  { fareAmount: 55, serviceFeeAmount: 5 },
  { time: '09:00', fareAmount: 55, serviceFeeAmount: 5 },
  { pax: 3 }
);
assert.strictEqual(multiPassenger.providerFareTotal, 165, 'provider fare multiplies by passenger count');
assert.strictEqual(multiPassenger.platformServiceFeeTotal, 5, 'platform fee must not multiply by passenger count');
assert.strictEqual(multiPassenger.passengerGrossPayment, 170, 'gross payment uses provider total plus one platform fee');

const multiLeg = passengerBooking.fareDecision(
  {
    serviceFeeAmount: 5,
    segments: [
      { from: 'A', to: 'B', fareAmount: 40 },
      { from: 'B', to: 'C', fareAmount: 35 }
    ]
  },
  { time: '09:00', serviceFeeAmount: 5 },
  { pax: 2 }
);
assert.strictEqual(multiLeg.providerFareTotal, 150, 'multi-leg provider fare sums all served legs per passenger');
assert.strictEqual(multiLeg.platformServiceFeeTotal, 5, 'multi-leg platform fee remains once per booking');
assert.throws(() => passengerBooking.fareDecision({ fareAmount: 55 }, { time: '09:00', fareAmount: 55 }, { pax: 1 }), /missing_platform_fee_contract/);
assert.throws(() => passengerBooking.capacityContract('pair', {}, { time: '09:00' }, { serviceDate: '2026-07-30', pax: 1 }, 'BKTEST01'), /missing_capacity_contract/);

assert(booking1.includes("createPassengerBookingSecure(bookingSnap, ticketAccessTokenHash)"), 'Booking1 must call backend booking creation');
assert(!booking1.includes("db.ref('bookings/' + booking.code).set(booking)"), 'Booking1 must not write canonical bookings directly');
assert(!booking1.includes("firebase.database().ref('bookings"), 'Booking1 must not directly access /bookings');
assert(booking1.includes("'Idempotency-Key'"), 'Booking1 must send an idempotency key');
assert(booking1.includes('state.pendingBookingRequest'), 'Booking1 must reuse one pending request/token while retrying');
assert(booking1.includes('state.bookingSubmitting'), 'Booking1 must disable duplicate submission while a request is in progress');
assert(booking1.includes('rememberTicketAccess(state.bookingCode, ticketAccessToken)'), 'Booking1 must keep raw ticket token only in passenger session');

assert.strictEqual(rules.rules.bookings['.read'], false, '/bookings public read must be disabled');
assert.strictEqual(rules.rules.bookings['.write'], false, '/bookings public write must be disabled');
assert.strictEqual(rules.rules.bookings.$bookingId['.write'], false, 'browser must not create or update canonical bookings directly');
assert.strictEqual(rules.rules.operations.bookingCapacityByServiceDate.$serviceDate.$capacityKey['.read'], false, 'canonical capacity counters must not be publicly readable');
assert.strictEqual(rules.rules.operations.publicBookingCapacityByServiceDate.$serviceDate.$capacityKey['.read'], true, 'public capacity aggregate must be readable');

console.log('passenger booking backend contract ok');
