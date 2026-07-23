const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const legacyBooking = fs.readFileSync(path.join(root, 'booking.html'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const passenger = fs.readFileSync(path.join(root, 'passenger.html'), 'utf8');

assert(legacyBooking.includes('window.location.replace'), 'legacy booking.html must redirect instead of running a local booking flow');
assert(legacyBooking.includes('booking1.html'), 'legacy booking.html must point to Booking1');
assert(!legacyBooking.includes('firebase.database()'), 'legacy booking.html must not own Firebase booking reads/writes');
assert(!legacyBooking.includes("db.ref('bookings')"), 'legacy booking.html must not read/write bookings directly');
assert(!legacyBooking.includes('LEG2_DEST'), 'legacy booking.html must not keep local route/transfer tables');
assert(!legacyBooking.includes('SERVICE_FEE_AMOUNT'), 'legacy booking.html must not calculate service fees locally');
assert(!legacyBooking.includes('getBookingTotal'), 'legacy booking.html must not calculate totals locally');

assert(!index.includes('href="booking.html"'), 'index.html must not link users to the legacy booking page');
assert(!passenger.includes('href="booking.html"'), 'passenger.html must not link users to the legacy booking page');
assert(index.includes('href="booking1.html"'), 'index.html must link booking entry points to Booking1');
assert(passenger.includes('href="booking1.html"'), 'passenger.html must link booking entry points to Booking1');

console.log('legacy booking entrypoint redirect ok');
