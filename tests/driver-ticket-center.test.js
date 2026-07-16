const assert = require('assert');
const fs = require('fs');
const path = require('path');
const center = require('../functions/driver-ticket-center.js');

const booking = {
  code: 'BK123456',
  date: '2026-07-16',
  time: '09:00',
  name: 'Driver Passenger',
  phone: '0900000000',
  seats: 2,
  status: 'awaiting_payment',
  assignment: {
    contractVersion: 'booking_assignment_v1',
    plannedVehicleId: 'car1',
    queueNo: 1
  },
  originCheckin: { status: 'pending', identityVerified: false }
};

const ticket = center.buildDriverTicket('BK123456', booking);
assert.strictEqual(ticket.date, '2026-07-16');
assert.strictEqual(ticket.plannedVehicleId, 'car1');
assert.strictEqual(ticket.code, 'BK123456');
assert.strictEqual(ticket.queueNo, 1);
assert.strictEqual(center.driverTicketPath('BK123456', booking), 'operations/driverTicketsByServiceDate/2026-07-16/car1/BK123456');

const updates = center.buildDriverTicketMirrorUpdate('BK123456', null, booking);
assert(updates['operations/driverTicketsByServiceDate/2026-07-16/car1/BK123456'], 'driver ticket mirror update missing');

const moved = center.buildDriverTicketMirrorUpdate('BK123456', booking, Object.assign({}, booking, {
  assignment: Object.assign({}, booking.assignment, { plannedVehicleId: 'car2' })
}));
assert.strictEqual(moved['operations/driverTicketsByServiceDate/2026-07-16/car1/BK123456'], null);
assert(moved['operations/driverTicketsByServiceDate/2026-07-16/car2/BK123456'], 'driver ticket mirror must move when vehicle changes');

assert.strictEqual(center.buildDriverTicket('BK999999', Object.assign({}, booking, { status: 'cancelled' })), null);
assert.strictEqual(center.buildDriverTicket('BK999998', Object.assign({}, booking, {
  assignment: Object.assign({}, booking.assignment, { plannedVehicleId: '' })
})), null);

const main = fs.readFileSync(path.join(__dirname, '..', 'driver-android', 'src', 'main', 'java', 'com', 'sanamchai', 'drivergps', 'MainActivity.java'), 'utf8');
const functionsIndex = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
const rules = fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8');

assert(main.includes('operations/driverTicketsByServiceDate'), 'Driver app must read the central self-only ticket feed');
assert(main.includes('loadDriverTicketsForDate(today, vehicleId'), 'Driver passenger views must read tickets for the authorized vehicle only');
assert(!main.includes('loadBookingsForDate'), 'Driver passenger views must not scan daily bookings locally');
assert(!main.includes('bookingBelongsToVehicle(child, vehicleId)'), 'Driver passenger list must not filter all bookings on the device');
assert(functionsIndex.includes('syncDriverTicketOnBookingWrite'), 'Functions must mirror bookings into the driver ticket feed');
assert(functionsIndex.includes('buildDriverTicketMirrorUpdate'), 'Functions must use the Driver Ticket Center contract');
assert(rules.includes('"driverTicketsByServiceDate"'), 'Database rules must expose driver ticket feed path');
assert(rules.includes("root.child('data/driverIdentityCenter/accounts/' + auth.uid + '/runtimeVehicleId').val() === $vehicleId"), 'Driver ticket feed must be readable only by assigned vehicle identity');

console.log('driver ticket center ok');
