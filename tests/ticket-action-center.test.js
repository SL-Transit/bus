const assert = require('assert');
const TicketActionCenter = require('../ticket-action-center');

function mockDb() {
  const writes = [];
  return {
    writes,
    ref(path) {
      return {
        update(payload) {
          writes.push({ path, payload });
          return Promise.resolve();
        }
      };
    }
  };
}

(async function run() {
  assert.strictEqual(TicketActionCenter.contractVersion, 'ticket_action_center_cancel_v1');

  const nowMs = Date.parse('2026-07-22T08:00:00+07:00');
  const futureBooking = {
    code: 'BK1234567890',
    date: '2026-07-22',
    time: '10:00',
    status: 'confirmed'
  };
  const allowed = TicketActionCenter.evaluateCancellation(futureBooking, { nowMs });
  assert.strictEqual(allowed.allowed, true, 'future trip must be cancellable through the center');

  const closeBooking = Object.assign({}, futureBooking, { time: '08:30' });
  const tooClose = TicketActionCenter.evaluateCancellation(closeBooking, { nowMs });
  assert.strictEqual(tooClose.allowed, false, 'near-departure booking must be blocked');
  assert.strictEqual(tooClose.reason, 'too_close_to_departure');

  const cancelled = TicketActionCenter.evaluateCancellation(Object.assign({}, futureBooking, { status: 'cancelled' }), { nowMs });
  assert.strictEqual(cancelled.allowed, false, 'already-cancelled booking must be blocked');
  assert.strictEqual(cancelled.reason, 'already_cancelled');

  const db = mockDb();
  const result = await TicketActionCenter.cancelTicket({
    db,
    firebase: { database: { ServerValue: { TIMESTAMP: '__SERVER_TIME__' } } },
    ticket: {
      code: 'BK1234567890',
      readPath: 'bookings/BK1234567890',
      booking: futureBooking
    },
    nowMs
  });
  assert.strictEqual(result.bookingPath, 'bookings/BK1234567890');
  assert.strictEqual(result.patch.status, 'cancelled');
  assert.strictEqual(result.patch.cancelledAt, '__SERVER_TIME__');
  assert.strictEqual(db.writes.length, 1);
  assert.strictEqual(db.writes[0].path, 'bookings/BK1234567890');

  await assert.rejects(
    () => TicketActionCenter.cancelTicket({
      db: mockDb(),
      ticket: {
        code: 'BK1234567890',
        readPath: 'bookings/BK1234567890',
        booking: closeBooking
      },
      nowMs
    }),
    /TICKET_CANCELLATION_BLOCKED:too_close_to_departure/
  );

  console.log('ticket action center ok');
})();
