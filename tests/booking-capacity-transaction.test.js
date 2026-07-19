const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const bridgeSource = fs.readFileSync(path.join(__dirname, '..', 'booking-bridge.js'), 'utf8');
const context = {
  console,
  Date,
  Promise,
  setTimeout,
  clearTimeout
};
context.window = context;
context.globalThis = context;
context.SLTransitBookingAvailabilityCenter = {
  decideBookingAvailability: () => ({ status: 'available', bookingEligible: true, selectionAllowed: true, reasonCode: 'available', source: 'erp_logic_center' })
};
context.SLTransitFareDecisionCenter = {
  decideFare: () => ({ status: 'ready', fareAmount: 55, serviceFeeAmount: 0 })
};
vm.createContext(context);
vm.runInContext(bridgeSource, context);

function mockDb(initial) {
  const store = Object.assign({}, initial || {});
  return {
    store,
    ref(pathName) {
      return {
        transaction(updateFn) {
          const before = store[pathName] == null ? null : JSON.parse(JSON.stringify(store[pathName]));
          const next = updateFn(before);
          if (next === undefined) {
            return Promise.resolve({ committed: false, snapshot: { val: () => before } });
          }
          store[pathName] = next;
          return Promise.resolve({ committed: true, snapshot: { val: () => next } });
        }
      };
    }
  };
}

(async function run() {
  const bridge = context.SLBookingBridge;
  assert(bridge, 'SLBookingBridge must load in the browser context');

  const trip = { pairKey: 'sanamchai__chachoengsao', pickupTime: '09:00' };
  const contract = bridge.buildBookingCapacityContract({
    serviceDate: '2026-07-19',
    trip,
    requestedSeats: 2,
    pickupTime: '09:00'
  });
  assert.strictEqual(contract.contractVersion, 'booking_capacity_v1');
  assert.strictEqual(contract.capacityLimit, 3, 'default trip capacity must be 3 seats');
  assert(contract.counterPath.includes('operations/bookingCapacityByServiceDate/2026-07-19/'), 'capacity counter path must be central and service-date scoped');

  const db = mockDb();
  const first = Object.assign({}, contract, { bookingCode: 'BK000001' });
  const firstReservation = await bridge.reserveBookingCapacity(db, first);
  assert.strictEqual(firstReservation.status, 'reserved');
  assert.strictEqual(firstReservation.bookedSeats, 2);
  assert.strictEqual(firstReservation.seatsAvailable, 1);

  await assert.rejects(
    () => bridge.reserveBookingCapacity(db, Object.assign({}, contract, { bookingCode: 'BK000002', requestedSeats: 2 })),
    /BOOKING_CAPACITY_FULL/
  );
  assert.strictEqual(db.store[contract.counterPath].bookedSeats, 2, 'failed reservation must not increase booked seats');

  await bridge.releaseBookingCapacity(db, first);
  assert.strictEqual(db.store[contract.counterPath].bookedSeats, 0, 'release must roll back reserved seats');
  assert.strictEqual(db.store[contract.counterPath].seatsAvailable, 3, 'release must restore seats available');

  console.log('booking capacity transaction ok');
})();
