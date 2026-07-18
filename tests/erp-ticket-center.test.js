const assert = require('assert');
const center = require('../erp-ticket-center.js');

const booking = {
  bookingCode: 'BK-20260716-ABC123',
  serviceDate: '2026-07-16',
  name: 'Passenger',
  phone: '0812345678',
  pax: 2,
  origin: 'A',
  destination: 'B',
  pickupTime: '09:00',
  fareAmount: 50,
  serviceFee: 5,
  price: 105,
  assignment: {
    contractVersion: 'booking_assignment_v1',
    queueNo: 2,
    plannedVehicleId: 'car2',
    tripId: 'trip_002',
    departTime: '09:00',
    pickupStopName: 'A',
    assignmentSource: 'erp_logic_center'
  }
};

const plan = center.buildTicketContract(booking);
assert.strictEqual(plan.status, 'ready');
assert.strictEqual(plan.contract.contractVersion, 'erp_ticket_v1');
assert.strictEqual(plan.contract.bookingCode, booking.bookingCode);
assert.strictEqual(plan.contract.assignment.queueNo, '2');
assert.strictEqual(plan.contract.assignment.plannedVehicleId, 'car2');
assert.strictEqual(plan.contract.refs.centralPath, 'operations/ticketsByServiceDate/2026-07-16/BK-20260716-ABC123');

assert.strictEqual(center.requireTicketContract({ erpTicket: plan.contract }).status, 'ready');
assert.strictEqual(center.requireTicketContract({}).status, 'missing_erp_ticket_contract');

const missing = center.buildTicketContract({ bookingCode: 'BK-X' });
assert.strictEqual(missing.status, 'missing_contract_fields');
assert(missing.missing.includes('serviceDate'));

console.log('erp-ticket-center ok');
