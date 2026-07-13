const assert = require('assert');
const alerts = require('../erp-alert-center.js');

const bookingAlerts = alerts.bookingCreatedAlerts({
  booking: {
    code: 'TB123456',
    passengerLineId: 'U-passenger',
    driverLineId: 'U-driver',
    transferTerminalLineId: 'G-transfer'
  },
  adminLineId: 'G-admin'
});
assert.deepStrictEqual(bookingAlerts.map((item) => item.recipientRole), [
  'passenger',
  'driver',
  'admin',
  'transfer_terminal'
]);
assert.ok(bookingAlerts.every((item) => item.onceKey.includes('TB123456')));

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

const farTransfer = alerts.transferArrivalAlert({
  booking: { code: 'TB123456', transferTerminalLineId: 'G-transfer' },
  distanceKm: 3,
  radiusKm: 2.5
});
assert.strictEqual(farTransfer, null);

console.log('erp-alert-center ok');
