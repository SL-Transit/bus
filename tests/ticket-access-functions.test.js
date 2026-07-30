const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ticketAccess = require('../functions/ticket-access');

(async function run() {
  const token = 'secure_ticket_token_12345678901234567890';
  const hash = ticketAccess.tokenHash(token);
  assert.strictEqual(hash.length, 64);
  assert.doesNotThrow(() => ticketAccess.verifyTicketAccess({ ticketAccessTokenHash: hash }, token));
  assert.throws(() => ticketAccess.verifyTicketAccess({ ticketAccessTokenHash: hash }, 'wrong_secure_ticket_token_1234567890'), /ticket_access_denied/);
  assert.throws(() => ticketAccess.verifyTicketAccess({}, token), /blocked_legacy_ticket_access_token_missing/);

  const ticket = ticketAccess.minimalTicket({
    code: 'BK1234567',
    name: 'Private Name',
    phone: '0800000000',
    lineUserId: 'U123',
    passengerIdentity: { lineUserId: 'U123' },
    paymentEvidence: 'secret-slip',
    status: 'awaiting_payment',
    date: '2026-07-30',
    time: '09:00',
    origin: 'BKK',
    destination: 'CNX',
    pax: 2,
    price: 120
  }, 'BK1234567');
  const serialized = JSON.stringify(ticket);
  ['name', 'phone', 'lineUserId', 'passengerIdentity', 'paymentEvidence'].forEach((field) => {
    assert(!serialized.includes(field), `ticket response must not expose ${field}`);
  });
  assert.strictEqual(ticket.pax, 2);
  assert.strictEqual(ticketAccess.originAllowed('https://sl-transit.com', false), true);
  assert.strictEqual(ticketAccess.originAllowed('http://localhost:5000', false), false);
  assert.strictEqual(ticketAccess.originAllowed('http://localhost:5000', true), true);

  for (const file of ['check_ticket.html', 'cancel_ticket.html', 'ticket-data-center.js', 'ticket-action-center.js']) {
    const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert(!/db\.ref\(bookingPathForCode/.test(text), `${file} must not read or write bookings through bookingPathForCode`);
    assert(!/db\.ref\([^)]*['"]bookings\//.test(text), `${file} must not access /bookings directly`);
    assert(!/\.transaction\s*\(/.test(text), `${file} must not run browser booking transactions`);
  }
  console.log('ticket-access-functions.test.js OK');
})();
