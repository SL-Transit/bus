const assert = require('assert');
const TicketDataCenter = require('../ticket-data-center');

function snapshot(value) {
  return {
    exists: () => value !== undefined && value !== null,
    val: () => value,
    forEach: (fn) => {
      if (!value) return;
      Object.keys(value).forEach((key) => fn({ key, val: () => value[key] }));
    }
  };
}

function mockDb(data) {
  return {
    reads: [],
    ref(path) {
      const db = this;
      db.reads.push(path);
      return {
        once(eventName) {
          assert.strictEqual(eventName, 'value');
          return Promise.resolve(snapshot(data[path]));
        },
        orderByChild(child) {
          assert.strictEqual(child, 'phone');
          return {
            equalTo(phone) {
              return {
                once(eventName) {
                  assert.strictEqual(eventName, 'value');
                  const bucket = data[path] || {};
                  const filtered = {};
                  Object.keys(bucket).forEach((key) => {
                    if (String(bucket[key].phone || '').replace(/[^0-9]/g, '') === phone) filtered[key] = bucket[key];
                  });
                  return Promise.resolve(snapshot(Object.keys(filtered).length ? filtered : null));
                }
              };
            }
          };
        }
      };
    }
  };
}

(async function run() {
  assert.strictEqual(TicketDataCenter.contractVersion, 'ticket_data_center_read_v1');
  assert.strictEqual(TicketDataCenter.bookingPathForCode('BK1234567890'), 'bookings/');
  assert.strictEqual(TicketDataCenter.bookingPathForCode('TB123456'), 'testBookings/');

  const byCodeDb = mockDb({
    'bookings/BK1234567890': { name: 'Passenger A', phone: '0812345678', createdAt: 10 }
  });
  const byCode = await TicketDataCenter.findTicket(byCodeDb, 'BK1234567890');
  assert.strictEqual(byCode.source, 'ticket-data-center');
  assert.strictEqual(byCode.lookupType, 'code');
  assert.strictEqual(byCode.readPath, 'bookings/BK1234567890');
  assert.strictEqual(byCode.booking.name, 'Passenger A');

  const byPhoneDb = mockDb({
    bookings: {
      BK000001: { name: 'Old', phone: '0812345678', createdAt: 1 },
      BK000002: { name: 'New', phone: '081-234-5678', createdAt: 2 },
      BK000003: { name: 'Notify only', phone: '0812345678', createdAt: 3, notificationOnly: true }
    }
  });
  const byPhone = await TicketDataCenter.findTicket(byPhoneDb, '0812345678');
  assert.strictEqual(byPhone.lookupType, 'phone');
  assert.strictEqual(byPhone.matchCount, 2);
  assert.strictEqual(byPhone.code, 'BK000002');
  assert.strictEqual(byPhone.readPath, 'bookings/BK000002');

  await assert.rejects(
    () => TicketDataCenter.findTicket(mockDb({}), 'BK1234567890', { testMode: true }),
    /TEST_MODE_PRODUCTION_CODE/
  );

  console.log('ticket data center ok');
})();
