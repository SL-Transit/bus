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
  decideBookingAvailability: (input) => {
    const capacity = input && input.capacity || {};
    const limit = Number(capacity.capacity || 0);
    const booked = Number(capacity.bookedSeats || 0);
    const seatsAvailable = limit > 0 ? Math.max(0, limit - booked) : null;
    const full = seatsAvailable === 0;
    return {
      status: full ? 'capacity_full' : 'available',
      bookingEligible: !full,
      selectionAllowed: !full,
      reasonCode: full ? 'capacity_full' : 'available',
      displayReasonTh: full ? 'ที่นั่งเต็มแล้ว' : 'เปิดจอง',
      seatsAvailable,
      source: 'erp_logic_center'
    };
  }
};
context.SLTransitFareDecisionCenter = {
  decideFare: () => ({ status: 'ready', fareAmount: 55, serviceFeeAmount: 0 })
};
vm.createContext(context);
vm.runInContext(bridgeSource, context);

function mockDb(initial) {
  const store = Object.assign({}, initial || {});
  function snapshot(value) {
    return {
      val: () => value,
      exists: () => value !== null && value !== undefined
    };
  }
  return {
    store,
    ref(pathName) {
      const rootPath = pathName;
      return {
        child(childName) {
          return this.ref ? this.ref(rootPath + '/' + childName) : mockDb(store).ref(rootPath + '/' + childName);
        },
        once() {
          return Promise.resolve(snapshot(store[rootPath]));
        },
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

  const previewStore = {
    'publishedSchedule/schemaVersion': 'test',
    'publishedSchedule/generatedAt': '2026-07-22T00:00:00Z',
    'publishedSchedule/sourceCommitSha': 'test',
    'publishedSchedule/dryRun': false,
    'publishedSchedule/writesEnabled': true,
    'publishedSchedule/readyForReview': true,
    'publishedSchedule/readyForApply': true,
    'publishedSchedule/publicationStatus': 'active',
    'publishedSchedule/productionReady': true,
    'publishedSchedule/originOptions': [{ label: 'A' }],
    'publishedSchedule/destinationOptionsByOrigin': {
      A: [{ label: 'B', pairKey: 'pair_ab', storageKey: 'pair_ab' }]
    },
    'publishedSchedule/paymentContact': null,
    'publishedSchedule/firebaseKeyEncoding': {},
    'publishedSchedule/validation': null,
    'publishedSchedule/bookingPolicy': {},
    'publishedSchedule/pairs/pair_ab': {
      pairId: 'pair_ab',
      canonicalPairKey: 'pair_ab',
      originLabel: 'A',
      destinationLabel: 'B',
      fareAmount: 55,
      segments: [{
        times: [{ time: '09:00', fareAmount: 55 }]
      }]
    },
    'operations/bookingCapacityByServiceDate/2026-07-22/2026-07-22__pair_ab__09:00': {
      contractVersion: 'booking_capacity_v1',
      capacityLimit: 3,
      bookedSeats: 2,
      seatsAvailable: 1,
      bookings: { BK000001: { seats: 2 } }
    }
  };
  const previewDb = mockDb(previewStore);
  await bridge.init(previewDb);
  const trips = await bridge.loadAvailableTrips('A', 'B', '2026-07-22');
  assert.strictEqual(trips.length, 1, 'central preview pair must produce one trip');
  assert.strictEqual(trips[0].capacity.source, 'booking_capacity_center');
  assert.strictEqual(trips[0].capacity.bookedSeats, 2);
  assert.strictEqual(trips[0].availabilityDecision.seatsAvailable, 1, 'Booking must receive remaining seats from the central capacity counter');
  assert.strictEqual(trips[0].selectionAllowed, true, 'one remaining seat must still be selectable');

  previewStore['operations/bookingCapacityByServiceDate/2026-07-22/2026-07-22__pair_ab__09:00'].bookedSeats = 3;
  previewStore['operations/bookingCapacityByServiceDate/2026-07-22/2026-07-22__pair_ab__09:00'].seatsAvailable = 0;
  const fullTrips = await bridge.loadAvailableTrips('A', 'B', '2026-07-22');
  assert.strictEqual(fullTrips[0].availabilityDecision.seatsAvailable, 0, 'full counter must report zero remaining seats');
  assert.strictEqual(fullTrips[0].selectionAllowed, false, 'full counter must block selecting the trip');

  console.log('booking capacity transaction ok');
})();
