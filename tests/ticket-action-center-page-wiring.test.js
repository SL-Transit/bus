const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cancelTicket = fs.readFileSync(path.join(root, 'cancel_ticket.html'), 'utf8');

assert(cancelTicket.includes('ticket-action-center.js'), 'Cancel Ticket must load Ticket Action Center');
assert(cancelTicket.includes('booking-bridge.js'), 'Cancel Ticket must load Booking Bridge for central capacity release');
assert(cancelTicket.includes('SLTransitTicketActionCenter.evaluateCancellation(currentBooking)'), 'Cancel Ticket must ask Ticket Action Center before opening/confirming cancellation');
assert(cancelTicket.includes('SLTransitTicketActionCenter.evaluateCancellation(booking)'), 'Cancel Ticket must render cancellation eligibility from Ticket Action Center');
assert(cancelTicket.includes('SLTransitTicketActionCenter.cancelTicket({'), 'Cancel Ticket must submit cancellation through Ticket Action Center');
assert(cancelTicket.includes('bookingBridge: window.SLBookingBridge'), 'Cancel Ticket must pass Booking Bridge into Ticket Action Center');
assert(!cancelTicket.includes('function canCancel('), 'Cancel Ticket page must not own cancellation eligibility rules');
assert(!cancelTicket.includes('function departureDate('), 'Cancel Ticket page must not calculate departure/cancellation policy locally');
assert(!cancelTicket.includes('db.ref(currentBookingPath).update({'), 'Cancel Ticket page must not write cancellation status directly');
assert(!cancelTicket.includes('firebase.database.ServerValue.TIMESTAMP,'), 'Cancel Ticket page must not build the cancellation write payload itself');

console.log('ticket action center page wiring ok');
