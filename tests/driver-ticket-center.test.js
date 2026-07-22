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
  price: 320,
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
assert.strictEqual(ticket.fareAmount, 320, 'driver ticket must carry fareAmount for driver earnings reporting');
assert.strictEqual(center.driverTicketPath('BK123456', booking), 'operations/driverTicketsByServiceDate/2026-07-16/car1/BK123456');

const fareFallbackTicket = center.buildDriverTicket('BK123457', Object.assign({}, booking, {
  code: 'BK123457', price: undefined, fareAmount: undefined, fare: 180
}));
assert.strictEqual(fareFallbackTicket.fareAmount, 180, 'fareAmount must fall back to booking.fare when price/fareAmount are absent');

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

const scheduleOnlyBooking = {
  code: 'BK7991918149',
  date: '2026-07-19',
  time: '11:30',
  pickupTime: '11:30',
  origin: 'origin-stop',
  destination: 'destination-alias',
  name: 'Driver Passenger',
  phone: '0900000000',
  seats: 1,
  scheduleOnly: true,
  noLiveTracking: true,
  assignment: {
    assignmentSource: 'none',
    scheduleOnly: true,
    liveTrackingAvailable: false
  }
};

const workByVehicle = {
  car1: {
    vehicleId: 'car1',
    queueNo: 4,
    allTrips: [{
      routeId: 'ROUTE-MAIN-022',
      tripNo: 'TRIP-ROUTE-MAIN-022-1130',
      routeDirection: 'return',
      orderedStops: [
        { groupStopId: 'gs_000015', stopKey: 'g01p015', stopNameTh: 'origin-stop', time: '11:30' },
        { groupStopId: 'gs_000001', stopKey: 'g01p001', stopNameTh: 'canonical-destination', time: '15:00' }
      ]
    }]
  },
  car2: {
    vehicleId: 'car2',
    queueNo: 1,
    allTrips: [{
      routeId: 'ROUTE-MAIN-021',
      tripNo: 'TRIP-ROUTE-MAIN-021-1120',
      orderedStops: [
        { stopNameTh: 'canonical-destination', time: '11:20' },
        { stopNameTh: 'origin-stop', time: '14:35' }
      ]
    }]
  }
};

const groupStops = {
  gs_000001: {
    groupStopId: 'gs_000001',
    groupStopCode: 'g01p001',
    displayNameTh: 'canonical-destination',
    aliases: ['destination-alias'],
    workbookStopKey: 'destination'
  },
  gs_000015: {
    groupStopId: 'gs_000015',
    groupStopCode: 'g01p015',
    displayNameTh: 'origin-stop',
    workbookStopKey: 'origin'
  }
};

const enriched = center.enrichBookingFromDriverWork(scheduleOnlyBooking, workByVehicle, groupStops);
assert.strictEqual(enriched.plannedVehicleId, 'car1');
assert.strictEqual(enriched.queueNo, 4);
assert.strictEqual(enriched.scheduleOnly, false);
assert.strictEqual(enriched.assignment.assignmentSource, 'driver_work_by_service_date');
assert.strictEqual(center.driverTicketPath('BK7991918149', enriched), 'operations/driverTicketsByServiceDate/2026-07-19/car1/BK7991918149');

const noAliasMatch = center.enrichBookingFromDriverWork(scheduleOnlyBooking, workByVehicle, {});
assert.strictEqual(noAliasMatch.plannedVehicleId, undefined, 'alias-only destination must not match without ERP Data Center aliases');

const main = fs.readFileSync(path.join(__dirname, '..', 'driver-android', 'src', 'main', 'java', 'com', 'sanamchai', 'drivergps', 'MainActivity.java'), 'utf8');
const functionsIndex = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
const driverTicketCenter = fs.readFileSync(path.join(__dirname, '..', 'functions', 'driver-ticket-center.js'), 'utf8');
const rules = fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8');

assert(main.includes('operations/driverTicketsByServiceDate'), 'Driver app must read the central self-only ticket feed');
assert(main.includes('loadDriverTicketsForDate(today, vehicleId'), 'Driver passenger views must read tickets for the authorized vehicle only');
assert(!main.includes('loadBookingsForDate'), 'Driver passenger views must not scan daily bookings locally');
assert(!main.includes('bookingBelongsToVehicle(child, vehicleId)'), 'Driver passenger list must not filter all bookings on the device');
assert(functionsIndex.includes('syncDriverTicketOnBookingWrite'), 'Functions must mirror bookings into the driver ticket feed');
assert(functionsIndex.includes('buildDriverTicketMirrorUpdate'), 'Functions must use the Driver Ticket Center contract');
assert(functionsIndex.includes('enrichBookingFromDriverWork'), 'Functions must assign schedule-only bookings from central driver work before mirroring');
assert(functionsIndex.includes('data/erpDataCenter/groupStops'), 'Driver assignment enrichment must read ERP Data Center group stop aliases');
assert(!driverTicketCenter.includes('destination-alias'), 'Stop aliases must come from ERP Data Center, not driver-ticket-center hard-code');
assert(rules.includes('"driverTicketsByServiceDate"'), 'Database rules must expose driver ticket feed path');
assert(rules.includes("root.child('data/driverIdentityCenter/accounts/' + auth.uid + '/runtimeVehicleId').val() === $vehicleId"), 'Driver ticket feed must be readable only by assigned vehicle identity');

console.log('driver ticket center ok');
