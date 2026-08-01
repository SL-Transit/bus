const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const helper = fs.readFileSync(path.join(root, 'functions', 'passenger-booking.js'), 'utf8');
const booking1 = fs.readFileSync(path.join(root, 'booking1.html'), 'utf8');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'database.rules.json'), 'utf8'));

assert(index.includes('exports.createPassengerBooking'), 'createPassengerBooking HTTPS Function must be exported');
assert(index.includes('passengerBooking.createPassengerBooking(admin'), 'Function must delegate creation to trusted backend helper');
assert(helper.includes('publishedSchedule'), 'Backend creation must validate the published schedule source');
assert(helper.includes('fareDecision('), 'Backend creation must calculate fare server-side');
assert(helper.includes('reserveCapacity('), 'Backend creation must reserve capacity server-side');
assert(helper.includes('bookingCode()'), 'Backend creation must generate the canonical booking code');
assert(helper.includes('ticketAccessTokenHash'), 'Backend creation must store ticket token hash');
assert(helper.includes('ticketAccessTokenExpiresAt'), 'Backend creation must store token expiry');
assert(!helper.includes('counterPath'), 'Backend creation must not accept or store client-selected capacity counterPath');
assert(!helper.includes('req.body.price'), 'Backend creation must not trust client price');
assert(!helper.includes('req.body.fare'), 'Backend creation must not trust client fare');

assert(booking1.includes("createPassengerBookingSecure(bookingSnap, ticketAccessTokenHash)"), 'Booking1 must call backend booking creation');
assert(!booking1.includes("db.ref('bookings/' + booking.code).set(booking)"), 'Booking1 must not write canonical bookings directly');
assert(!booking1.includes("firebase.database().ref('bookings"), 'Booking1 must not directly access /bookings');
assert(booking1.includes("'Idempotency-Key'"), 'Booking1 must send an idempotency key');
assert(booking1.includes('rememberTicketAccess(state.bookingCode, ticketAccessToken)'), 'Booking1 must keep raw ticket token only in passenger session');

assert.strictEqual(rules.rules.bookings['.read'], false, '/bookings public read must be disabled');
assert.strictEqual(rules.rules.bookings['.write'], false, '/bookings public write must be disabled');
assert.strictEqual(rules.rules.bookings.$bookingId['.write'], false, 'browser must not create or update canonical bookings directly');

console.log('passenger booking backend contract ok');
