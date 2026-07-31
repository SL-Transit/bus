const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} = require('@firebase/rules-unit-testing');

const projectId = 'sl-transit-rules-test';
const rules = fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8');

function booking(id) {
  return {
    code: id,
    bookingCode: id,
    source: 'booking1.html',
    sourceMode: 'erp_data_center',
    status: 'awaiting_payment',
    paymentStatus: 'pay_on_site',
    paymentMode: 'onsite',
    slipUploaded: false,
    paymentOwnership: 'sl_transit',
    externalPaymentRequired: false,
    testMode: false,
    mockPayment: false,
    name: 'Test Passenger',
    phone: '0800000000',
    date: '2026-07-30',
    time: '09:00',
    origin: 'BKK',
    destination: 'CNX',
    pax: 1,
    price: 60,
    fareAmount: 55,
    ticketAccessTokenHash: 'a'.repeat(64),
    ticketAccessContractVersion: 'ticket_access_v1',
    publishedSchedule: { readyForApply: false }
  };
}

(async () => {
  const testEnv = await initializeTestEnvironment({
    projectId,
    database: { rules }
  });
  try {
    await testEnv.clearDatabase();
    const anonDb = testEnv.unauthenticatedContext().database();
    const userDb = testEnv.authenticatedContext('user-1').database();
    const ownerDb = testEnv.authenticatedContext('owner-1', { slTransitRole: 'owner' }).database();
    const staffDb = testEnv.authenticatedContext('staff-1', { slTransitRole: 'staff' }).database();
    const driverDb = testEnv.authenticatedContext('driver-1').database();

    await assertSucceeds(anonDb.ref('bookings/BKTEST01').set(booking('BKTEST01')));
    await assertFails(anonDb.ref('bookings/BKTEST01').get());
    await assertFails(anonDb.ref('bookings/BKTEST01').update({
      status: 'cancelled',
      cancelledAt: 1785363600000,
      officialStatus: 'cancelled',
      ticketActionContract: 'ticket_action_center_cancel_v1'
    }));
    await assertFails(userDb.ref('bookings/BKTEST01').update({ refundStatus: 'refunded' }));
    await assertFails(userDb.ref('bookings/BKTEST01').update({
      status: 'cancelled',
      refundAmount: 60,
      refundRequestedAt: 1785363600000,
      refundContractVersion: 'refund_contract_v1',
      refundedAt: 1785363600000,
      adminCancelledByUid: 'owner-1',
      plannedVehicleId: 'V999',
      routeId: 'R999',
      fareAmount: 1,
      paymentStatus: 'paid'
    }));
    await assertFails(userDb.ref('bookings/BKTEST01').update({ refundedAt: 1785363600000 }));
    await assertFails(userDb.ref('bookings/BKTEST01').update({ adminCancelledByUid: 'owner-1' }));
    await assertFails(anonDb.ref('operations/refunds/refund_1').get());
    await assertFails(anonDb.ref('operations/refundAudit/event_1').get());
    await assertFails(userDb.ref('data/erpDataCenter/adminAccounts/user-1').set(true));
    await assertFails(userDb.ref('data/catalog/routes/R1').set({ name: 'evil' }));
    await assertFails(staffDb.ref('publishedSchedule/current').set({ ready: true }));
    await assertFails(anonDb.ref('ticketLocations/BKTEST01').set({ lat: 13.7, lng: 100.5 }));
    await assertFails(userDb.ref('passengerLiveLocations/BKTEST01').set({ lat: 13.7, lng: 100.5 }));

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('data/driverIdentityCenter/accounts/driver-1').set({ role: 'driver', runtimeVehicleId: 'V1' });
      await ctx.database().ref('operations/refunds/refund_1').set({ refundStatus: 'refunded' });
      await ctx.database().ref('operations/refundAudit/event_1').set({ result: 'success' });
    });
    await assertSucceeds(ownerDb.ref('operations/refunds/refund_1').get());
    await assertSucceeds(ownerDb.ref('operations/refundAudit/event_1').get());
    await assertSucceeds(ownerDb.ref('publishedSchedule/current').set({ ready: true }));
    await assertSucceeds(driverDb.ref('driverCommands/V1/lastResponse').set({ status: 'ok' }));
    await assertFails(driverDb.ref('driverCommands/V2/lastResponse').set({ status: 'ok' }));
    console.log('database-rules-emulator.test.js OK');
  } finally {
    await testEnv.cleanup();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
