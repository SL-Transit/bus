const assert = require('assert');
const fs = require('fs');
const path = require('path');

const booking = fs.readFileSync(path.join(__dirname, '..', 'booking.html'), 'utf8');
const booking1 = fs.readFileSync(path.join(__dirname, '..', 'booking1.html'), 'utf8');
const bridge = fs.readFileSync(path.join(__dirname, '..', 'booking-bridge.js'), 'utf8');
const pos = fs.readFileSync(path.join(__dirname, '..', 'booking-pos.js'), 'utf8');
const checkTicket = fs.readFileSync(path.join(__dirname, '..', 'check_ticket.html'), 'utf8');
const driver = fs.readFileSync(path.join(__dirname, '..', 'driver-android', 'src', 'main', 'java', 'com', 'sanamchai', 'drivergps', 'MainActivity.java'), 'utf8');

assert(booking.includes('booking-assignment-center.js'), 'Booking must load Booking Assignment Center');
assert(booking.includes('SLTransitBookingAssignmentCenter.buildBookingAssignmentContract'), 'Booking must ask the center to build the assignment contract');
assert(booking.includes("new Error('ASSIGNMENT_CONTRACT_UNAVAILABLE')"), 'Booking must stop before saving an incomplete live assignment');
assert(booking.includes('assignment:  assignmentContract'), 'Booking must persist the central assignment contract');
assert(booking.includes('plannedVehicleId: assignmentContract.plannedVehicleId'), 'compatibility vehicle field must come from the contract');
assert(checkTicket.includes("booking.assignment.contractVersion === 'booking_assignment_v1'"), 'Check Ticket must prefer the persisted assignment contract');
assert(!booking.includes('BOOKING_QUEUE_TRIPS'), 'Booking must not keep a local queue and vehicle table');
assert(!booking.includes('resolveBookingTripAssignmentByLabel'), 'Booking must not retry assignment through local label guessing');
assert(booking1.includes('booking-assignment-center.js'), 'Booking beta must load Booking Assignment Center');
assert(booking1.includes('assignment:    assignmentContract'), 'Booking beta preview must use the central assignment contract');
assert(bridge.includes('SLTransitBookingAssignmentCenter.buildBookingAssignmentContract'), 'Booking bridge must validate assignments through the center');
assert(!bridge.includes('plannedVehicleId: srcTrip'), 'Booking bridge must not construct a vehicle assignment from raw trips');
assert(!bridge.includes('if (fromKey !== normOrigin)'), 'Booking bridge must not guess trip coverage from a matching origin');
assert(pos.includes('resolvedAssignment: appState.tripAssignment || {}'), 'Booking POS must validate the selected central assignment before any write');
assert(pos.includes('assignment:    assignmentContract'), 'Booking POS must persist the central assignment contract');
assert(driver.includes('DataSnapshot source = hasCentralContract ? assignment : booking;'), 'Driver app must prefer the central assignment contract');
assert(driver.includes('String planned = plannedVehicleIdForBooking(snap);'), 'Driver QR rejection must report the centrally assigned vehicle');

console.log('booking assignment center wiring ok');
