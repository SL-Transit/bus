const assert = require('assert');
const fs = require('fs');
const path = require('path');

const fn = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');

assert(fn.includes('const lineToken = defineSecret("LINE_CHANNEL_ACCESS_TOKEN")'), 'Functions must keep LINE channel token secret');
assert(!fn.includes('defineSecret("LINE_TO_ID")'), 'Booking LINE notifications must not use the old group LINE_TO_ID secret');
assert(!fn.includes('defineSecret("LINE_CHECKIN_TO_ID")'), 'Check-in LINE notifications must not use the old group LINE_CHECKIN_TO_ID secret');
assert(fn.includes('function passengerLineUserId(booking)'), 'Functions must derive LINE target from passenger identity');
assert(fn.includes('identity.provider !== "line"'), 'Functions must only target verified LINE passenger identities');
assert(fn.includes('identity.lineUserId'), 'Functions must send to passengerIdentity.lineUserId');
assert(fn.includes('preference.lineTicket === true'), 'Booking ticket notifications must require lineTicket opt-in');
assert(fn.includes('preference.lineTripUpdates === true'), 'Trip update notifications must require lineTripUpdates opt-in');
assert(fn.includes('skipped_no_passenger_line_target'), 'Functions must record skipped LINE sends when a passenger target is missing');
assert(fn.includes('recipient: "passenger_line"'), 'Functions must audit sent records as passenger LINE sends');
assert(fn.includes('secrets: [lineToken]'), 'LINE send functions should only require the LINE channel token secret');
assert(!fn.includes('bookingLineTo.value()'), 'Functions must not send booking messages to the legacy group target');
assert(!fn.includes('checkinLineTo.value()'), 'Functions must not send check-in messages to the legacy group target');

console.log('functions passenger line target contract ok');
