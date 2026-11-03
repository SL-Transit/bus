const assert = require('assert');
const fs = require('fs');

const index = fs.readFileSync('functions/index.js', 'utf8');
const authority = fs.readFileSync('functions/booking-authority-service.js', 'utf8');
const bridge = fs.readFileSync('booking-bridge.js', 'utf8');
const adapter = fs.readFileSync('booking1-preview-adapter.js', 'utf8');

assert.match(index, /exports\.reserveBookingCapacity\s*=\s*onRequest/, 'capacity reservation must be handled by the backend');
assert.match(index, /requireUserToken\(req\)/, 'capacity reservation must verify the user token');
assert.match(index, /db: admin\.database\(\)/, 'HTTP authority must receive the server database');
assert.match(authority, /db\.ref\(path\)/, 'shared reservation must use its injected server database');
assert.match(index, /bookingAuthority\.reserve\(\{ ownerUid: decoded\.uid/, 'HTTP reserve must pass verified ownership to the shared authority');
assert.match(index, /bookingAuthority\.create\(\{ ownerUid: decoded\.uid/, 'HTTP create must pass verified ownership to the shared authority');
assert.match(authority, /existing\.ownerUid === decoded\.uid/, 'capacity release must be owner-bound');
assert.match(authority, /current\.capacityLimit/, 'capacity limit must come from the stored server counter');
assert.doesNotMatch(bridge, /ref\.transaction\(function\(current\)/, 'browser must not directly change the capacity counter');
assert.match(bridge, /reserveBookingCapacity/, 'booking flow must still reserve through the bridge');
assert.match(bridge, /cloudfunctions\.net\/reserveBookingCapacity/, 'booking flow must call the backend reservation endpoint');
assert.match(index, /exports\.createBooking\s*=\s*onRequest/, 'booking creation must be handled by the backend');
assert.match(authority, /authoritative_price_mismatch/, 'backend must reject client price tampering');
assert.match(authority, /bookingTimeAuthority\.resolveBookingTime\(input, pair\)/, 'backend must resolve departure time from the canonical trip');
assert.match(authority, /canonical_trip_identity_required/, 'backend must reject clients that omit the canonical trip identity');
assert.match(authority, /time: authoritativeTime\.time, pickupTime: authoritativeTime\.time/, 'backend must persist one canonical departure time');
assert.match(bridge, /tripId: timeEntry\.tripId \|\| timeEntry\.scheduleOfferId/, 'browser must preserve the canonical trip identity');
assert.match(index, /function bookingStopMatches/, 'backend must match booking stops by canonical stop keys');
assert.match(index, /booking\.originKey \|\| booking\.originStopKey/, 'backend must use canonical origin identity when resolving a booking');
assert.match(index, /booking\.destKey \|\| booking\.destinationStopKey/, 'backend must use canonical destination identity when resolving a booking');
assert.match(index, /older clients accidentally put the display label/, 'backend must document the legacy display-label fallback');
assert.match(authority, /booking_capacity_rejected/, 'capacity failures must record a safe reason code for diagnosis');
assert.match(index, /const fare = Object\.values\(source\.routeFareRows/, 'capacity resolution must use the canonical fare pair');
assert.match(index, /samePair/, 'capacity resolution must match the canonical origin and destination pair');
assert.match(authority, /ownerUid: decoded\.uid/, 'backend must assign booking ownership from the verified token');
assert.match(bridge, /cloudfunctions\.net\/createBooking/, 'booking flow must call the backend creation endpoint');
assert.doesNotMatch(adapter, /db\.ref\('bookings\//, 'Booking1 must not write booking records directly');

console.log('booking capacity backend contract ok');
