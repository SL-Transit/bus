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
  assert.throws(() => ticketAccess.verifyTicketAccess({ ticketAccessTokenHash: hash, ticketAccessTokenExpiresAt: 1 }, token), /ticket_access_denied/);
  assert.throws(() => ticketAccess.verifyTicketAccess({ ticketAccessTokenHash: hash, ticketAccessTokenRevokedAt: Date.now() }, token), /ticket_access_denied/);

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
    ,
    assignment: { driverId: 'driver-private', vehicleId: 'V1', queueId: 'Q1' },
    capacity: { counterPath: '/', bookingCode: 'EVIL', requestedSeats: 2 }
  }, 'BK1234567');
  const serialized = JSON.stringify(ticket);
  ['name', 'phone', 'lineUserId', 'passengerIdentity', 'paymentEvidence', 'counterPath', 'driverId'].forEach((field) => {
    assert(!serialized.includes(field), `ticket response must not expose ${field}`);
  });
  assert.strictEqual(ticket.pax, 2);
  assert.strictEqual(ticket.price, 120);
  assert.strictEqual(ticket.fare, null, 'missing fare must remain unavailable instead of zero');
  assert.strictEqual(ticket.serviceFee, null, 'missing service fee must remain unavailable instead of zero');

  const malicious = {
    code: 'BK1234567',
    date: '2026-07-30',
    time: '09:00',
    pax: 2,
    capacity: {
      contractVersion: 'booking_capacity_v1',
      counterPath: '/',
      bookingCode: 'BK9999999',
      capacityKey: '../admin',
      requestedSeats: 2
    }
  };
  const contract = ticketAccess.deriveTrustedCapacityContract(malicious, 'BK1234567');
  assert.strictEqual(contract.ok, false, 'malicious capacity contract must be rejected');

  const safe = {
    code: 'BK1234567',
    date: '2026-07-30',
    time: '09:00',
    pax: 2,
    capacity: {
      contractVersion: 'booking_capacity_v1',
      bookingCode: 'BK1234567',
      capacityKey: '2026-07-30__BKK_CNX__09_00',
      requestedSeats: 2
    }
  };
  const safeContract = ticketAccess.deriveTrustedCapacityContract(safe, 'BK1234567');
  assert.strictEqual(safeContract.ok, true);
  assert.strictEqual(safeContract.path, 'operations/bookingCapacityByServiceDate/2026-07-30/2026-07-30__BKK_CNX__09_00');
  const touched = [];
  const mockDb = {
    ref(pathName) {
      touched.push(pathName);
      return {
        transaction(fn) {
          const current = { contractVersion: 'booking_capacity_v1', capacityLimit: 3, bookedSeats: 2, seatsAvailable: 1, bookings: { BK1234567: { seats: 2 } } };
          const next = fn(current);
          return Promise.resolve({ committed: next !== current, snapshot: { val: () => next } });
        }
      };
    }
  };
  const maliciousRelease = await ticketAccess.releaseCapacityOnce(mockDb, malicious, 'BK1234567');
  assert.strictEqual(maliciousRelease.status, 'failed_retriable');
  assert.deepStrictEqual(touched, [], 'malicious booking must not select any database write path');
  const safeRelease = await ticketAccess.releaseCapacityOnce(mockDb, safe, 'BK1234567');
  assert.strictEqual(safeRelease.status, 'released');
  assert.deepStrictEqual(touched, ['operations/bookingCapacityByServiceDate/2026-07-30/2026-07-30__BKK_CNX__09_00']);
  assert.strictEqual(ticketAccess.originAllowed('https://sl-transit.com', false), true);
  assert.strictEqual(ticketAccess.originAllowed('http://localhost:5000', false), false);
  assert.strictEqual(ticketAccess.originAllowed('http://localhost:5000', true), true);

  for (const file of ['check_ticket.html', 'cancel_ticket.html', 'ticket-data-center.js', 'ticket-action-center.js']) {
    const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert(!/db\.ref\(bookingPathForCode/.test(text), `${file} must not read or write bookings through bookingPathForCode`);
    assert(!/db\.ref\([^)]*['"]bookings\//.test(text), `${file} must not access /bookings directly`);
    assert(!/\.transaction\s*\(/.test(text), `${file} must not run browser booking transactions`);
  }
  const booking1 = fs.readFileSync(path.join(__dirname, '..', 'booking1.html'), 'utf8');
  assert(booking1.includes("#ticketToken="), 'Booking ticket link must place raw token in URL fragment, not query string');
  assert(!booking1.includes("&ticketToken="), 'Booking ticket link must not place raw token in query string');
  const ticketData = fs.readFileSync(path.join(__dirname, '..', 'ticket-data-center.js'), 'utf8');
  assert(!/params\.get\(['"]ticketToken['"]\)/.test(ticketData), 'Ticket Data Center must not read raw token from query string');
  assert(ticketData.includes('location.hash'), 'Ticket Data Center must read raw token from fragment before storing it in sessionStorage');
  console.log('ticket-access-functions.test.js OK');
})();
