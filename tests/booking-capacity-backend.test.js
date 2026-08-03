const assert = require('assert');
const fs = require('fs');

const index = fs.readFileSync('functions/index.js', 'utf8');
const bridge = fs.readFileSync('booking-bridge.js', 'utf8');

assert.match(index, /exports\.reserveBookingCapacity\s*=\s*onRequest/, 'capacity reservation must be handled by the backend');
assert.match(index, /requireUserToken\(req\)/, 'capacity reservation must verify the user token');
assert.match(index, /admin\.database\(\)\.ref\(path\)/, 'capacity reservation must use the server database connection');
assert.match(index, /existing\.ownerUid === decoded\.uid/, 'capacity release must be owner-bound');
assert.match(index, /current\.capacityLimit/, 'capacity limit must come from the stored server counter');
assert.doesNotMatch(bridge, /ref\.transaction\(function\(current\)/, 'browser must not directly change the capacity counter');
assert.match(bridge, /reserveBookingCapacity/, 'booking flow must still reserve through the bridge');
assert.match(bridge, /cloudfunctions\.net\/reserveBookingCapacity/, 'booking flow must call the backend reservation endpoint');

console.log('booking capacity backend contract ok');
