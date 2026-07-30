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

  const nowMs = new Date('2026-07-22T08:00:00').getTime();
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
  const originalFetch = global.fetch;
  let lastFetch = null;
  global.fetch = async (url, options) => {
    lastFetch = { url, options };
    return {
      ok: true,
      json: async () => ({
        status: 'ok',
        capacityRelease: { status: 'skipped', reason: 'missing_capacity_contract' },
        ticket: Object.assign({}, futureBooking, { code: 'BK1234567890', status: 'cancelled', cancelledAt: 1785363600000 })
      })
    };
  };
  const result = await TicketActionCenter.cancelTicket({
    db,
    firebase: { database: { ServerValue: { TIMESTAMP: '__SERVER_TIME__' } } },
    accessToken: 'secure_ticket_token_12345678901234567890',
    ticket: {
      code: 'BK1234567890',
      readPath: 'bookings/BK1234567890',
      booking: futureBooking
    },
    nowMs
  });
  assert.strictEqual(result.bookingPath, '');
  assert.strictEqual(result.patch.status, 'cancelled');
  assert.strictEqual(result.patch.cancelledAt, 1785363600000);
  assert.strictEqual(db.writes.length, 0, 'browser cancellation must not write bookings directly');
  assert(lastFetch && String(lastFetch.url).includes('cancelPassengerTicket'), 'cancel must call backend Function');
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
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      status: 'ok',
      capacityRelease: { status: 'released' },
      ticket: Object.assign({}, futureBooking, { code: 'BK1234567890', status: 'cancelled', cancelledAt: 1785363600001 })
    })
  });
  const capacityResult = await TicketActionCenter.cancelTicket({
    db: capacityDb,
    accessToken: 'secure_ticket_token_12345678901234567890',
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
  assert.strictEqual(capacityDb.store[capacityPath].bookedSeats, 2, 'browser must not release capacity directly');
  assert.strictEqual(capacityDb.store[capacityPath].seatsAvailable, 1, 'browser must not mutate capacity directly');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(capacityDb.store[capacityPath].bookings, 'BK1234567890'), true, 'backend owns capacity release');

  await assert.rejects(
    () => TicketActionCenter.cancelTicket({
      db: mockDb(),
      accessToken: 'secure_ticket_token_12345678901234567890',
      ticket: {
        code: 'BK1234567890',
        readPath: 'bookings/BK1234567890',
        booking: closeBooking
      },
      nowMs
    }),
    /TICKET_CANCELLATION_BLOCKED:too_close_to_departure/
  );

  await assert.rejects(
    () => TicketActionCenter.cancelTicket({
      db: mockDb(),
      ticket: {
        code: 'BK1234567890',
        booking: futureBooking
      },
      nowMs
    }),
    /TICKET_ACCESS_TOKEN_REQUIRED/
  );

  global.fetch = originalFetch;

  console.log('ticket action center ok');
})();
