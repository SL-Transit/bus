const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8')).rules;

assert.strictEqual(rules.bookings['$bookingId']['.read'], 'auth != null', 'booking records must not be public-readable');
assert.match(rules.bookings['$bookingId']['.validate'], /phone.*matches/, 'booking phone must be validated by rules');
assert.match(rules.bookings['$bookingId']['.validate'], /date.*matches/, 'booking date must be validated by rules');
assert.strictEqual(rules.ticketLocations['$bookingId']['.write'], 'auth != null', 'ticket location writes must require auth');
assert.strictEqual(rules.passengerLiveLocations['$bookingId']['.write'], 'auth != null', 'passenger live location writes must require auth');
assert.match(rules.ticketLocations['$bookingId']['.validate'], /lat.*lng.*ts/, 'ticket location payload must be bounded and timestamped');
assert.match(rules.passengerLiveLocations['$bookingId']['.validate'], /lat.*lng.*ts/, 'shared location payload must be bounded and timestamped');

console.log('booking security rules contract ok');
