const assert = require('assert');
const fs = require('fs');
const path = require('path');

const booking = fs.readFileSync(path.join(__dirname, '..', 'booking.html'), 'utf8');
const checkTicket = fs.readFileSync(path.join(__dirname, '..', 'check_ticket.html'), 'utf8');

assert(booking.includes('booking-assignment-center.js'), 'Booking must load Booking Assignment Center');
assert(booking.includes('SLTransitBookingAssignmentCenter.buildBookingAssignmentContract'), 'Booking must ask the center to build the assignment contract');
assert(booking.includes("new Error('ASSIGNMENT_CONTRACT_UNAVAILABLE')"), 'Booking must stop before saving an incomplete live assignment');
assert(booking.includes('assignment:  assignmentContract'), 'Booking must persist the central assignment contract');
assert(booking.includes('plannedVehicleId: assignmentContract.plannedVehicleId'), 'compatibility vehicle field must come from the contract');
assert(checkTicket.includes("booking.assignment.contractVersion === 'booking_assignment_v1'"), 'Check Ticket must prefer the persisted assignment contract');

console.log('booking assignment center wiring ok');
