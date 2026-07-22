const assert = require('assert');
const TicketActionCenter = require('../ticket-action-center');

function mockDb(initial) {
  const writes = [];
  const store = Object.assign({}, initial || {});
  return {
    writes,
    store,
    ref(path) {
      return {
        update(payload) {
          writes.push({ path, payload });
          return Promise.resolve();
        },
        transaction(updateFn) {
          const before = store[path] == null ? null : JSON.parse(JSON.stringify(store[path]));
          const next = updateFn(before);
          if (next === undefined) {
            return Promise.resolve({ committed: false, snapshot: { val: () => before } });
          }
          store[path] = next;
          return Promise.resolve({ committed: true, snapshot: { val: () => next } });
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
  assert.strictEqual(result.capacityRelease.status, 'skipped');
  assert.strictEqual(result.capacityRelease.reason, 'missing_capacity_contract');

  const capacityPath = 'operations/bookingCapacityByServiceDate/2026-07-22/2026-07-22__pair__09_00';
  const capacityDb = mockDb({
    [capacityPath]: {
      contractVersion: 'booking_capacity_v1',
      capacityLimit: 3,
      bookedSeats: 2,
      seatsAvailable: 1,
      bookings: {
        BK1234567890: { seats: 2, status: 'reserved' }
      }
    }
  });
  const capacityResult = await TicketActionCenter.cancelTicket({
    db: capacityDb,
    bookingBridge: {
      releaseBookingCapacity(dbArg, contract) {
        return dbArg.ref(contract.counterPath).transaction(function(current) {
          const bookings = current.bookings || {};
          delete bookings[contract.bookingCode];
          current.bookedSeats = Math.max(0, Number(current.bookedSeats || 0) - Number(contract.requestedSeats || 1));
          current.seatsAvailable = Math.max(0, Number(current.capacityLimit || 3) - current.bookedSeats);
          current.bookings = bookings;
          return current;
        });
      }
    },
    ticket: {
      code: 'BK1234567890',
      readPath: 'bookings/BK1234567890',
      booking: Object.assign({}, futureBooking, {
        capacity: {
          counterPath: capacityPath,
          bookingCode: 'BK1234567890',
          requestedSeats: 2
        }
      })
    },
    nowMs
  });
  assert.strictEqual(capacityResult.capacityRelease.status, 'released');
  assert.strictEqual(capacityDb.store[capacityPath].bookedSeats, 0, 'cancel release must restore booked seats');
  assert.strictEqual(capacityDb.store[capacityPath].seatsAvailable, 3, 'cancel release must restore available seats');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(capacityDb.store[capacityPath].bookings, 'BK1234567890'), false, 'cancel release must remove booking from capacity counter');

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
