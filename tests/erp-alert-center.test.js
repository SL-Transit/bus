const assert = require('assert');
const alerts = require('../erp-alert-center.js');

const bookingAlerts = alerts.bookingCreatedAlerts({
  booking: {
    code: 'TB123456',
    passengerLineId: 'U-passenger',
    driverLineId: 'U-driver',
    transferTerminalLineId: 'G-transfer',
    plannedVehicleId: 'car1'
  },
  adminLineId: 'G-admin',
  staffTargets: { driversByVehicleId: { car1: { driver: { lineUserId: 'U-driver-central', active: true } } } }
});
assert.deepStrictEqual(bookingAlerts.map((item) => item.recipientRole), [
  'passenger',
  'driver',
  'admin',
  'transfer_terminal'
]);
assert.ok(bookingAlerts.every((item) => item.onceKey.includes('TB123456')));
assert.strictEqual(bookingAlerts.filter((item) => item.recipientRole === 'driver')[0].lineTo, 'U-driver-central');

const forgedDriver = alerts.bookingCreatedAlerts({
  booking: { code: 'TB000009', plannedVehicleId: 'car1', driverLineId: 'U-forged' },
  driverLineId: 'U-forged'
});
assert(!forgedDriver.some((item) => item.recipientRole === 'driver'), 'Legacy helper must ignore booking-supplied driver LINE IDs');

const noTransfer = alerts.bookingCreatedAlerts({
  booking: { code: 'TB000001', passengerLineId: 'U-passenger' },
  adminLineId: 'G-admin'
});
assert.deepStrictEqual(noTransfer.map((item) => item.recipientRole), ['passenger', 'admin']);

const nearTransfer = alerts.transferArrivalAlert({
  booking: { code: 'TB123456', transferTerminalLineId: 'G-transfer' },
  distanceKm: 2.1,
  radiusKm: 2.5,
  etaMinutes: 8
});
assert.strictEqual(nearTransfer.recipientRole, 'transfer_terminal');
assert.strictEqual(nearTransfer.etaMinutes, 8);
assert.strictEqual(alerts.shouldSendOnce(nearTransfer, {}), true);
assert.strictEqual(alerts.shouldSendOnce(nearTransfer, { [nearTransfer.onceKey]: true }), false);
assert.strictEqual(alerts.shouldSendOnce(nearTransfer, { alertCenterOnceKey: nearTransfer.onceKey }), false);
assert.strictEqual(alerts.shouldSendOnce(nearTransfer, {
  alertCenterSentKeys: { [nearTransfer.onceKey]: true }
}), false);
assert.strictEqual(alerts.shouldSendOnce(nearTransfer, {
  linePayload: { alertCenterOnceKey: nearTransfer.onceKey }
}), false);
assert.strictEqual(alerts.shouldSendOnce(nearTransfer, { alertCenterOnceKey: 'different-key' }), true);

const farTransfer = alerts.transferArrivalAlert({
  booking: { code: 'TB123456', transferTerminalLineId: 'G-transfer' },
  distanceKm: 3,
  radiusKm: 2.5
});
assert.strictEqual(farTransfer, null);

console.log('erp-alert-center ok');
