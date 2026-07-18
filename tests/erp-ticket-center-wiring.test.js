const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const booking1 = fs.readFileSync(path.join(root, 'booking1.html'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'booking-bridge.js'), 'utf8');
const pos = fs.readFileSync(path.join(root, 'booking-pos.js'), 'utf8');
const checkTicket = fs.readFileSync(path.join(root, 'check_ticket.html'), 'utf8');
const driver = fs.readFileSync(path.join(root, 'driver-android/src/main/java/com/sanamchai/drivergps/MainActivity.java'), 'utf8');

assert(booking1.includes('erp-ticket-center.js'), 'Booking1 must load ERP Ticket Center before building snapshots');
assert(checkTicket.includes('erp-ticket-center.js'), 'Check Ticket must load ERP Ticket Center');
assert(bridge.includes('SLTransitTicketCenter.buildTicketContract'), 'Booking bridge must embed ERP ticket contract');
assert(pos.includes('SLTransitTicketCenter.buildTicketContract'), 'Booking POS write payload must embed ERP ticket contract');
assert(checkTicket.includes('SLTransitTicketCenter.requireTicketContract'), 'Check Ticket must record ERP ticket readiness');
assert(checkTicket.includes('SLTransitTicketCenter.getTicketContract'), 'Check Ticket must prefer ERP ticket contract assignment');
assert(driver.includes('"erp_ticket_v1"'), 'Driver App must recognize ERP ticket contract');
assert(driver.includes('booking.child("erpTicket")'), 'Driver App must inspect ERP ticket before legacy booking fields');

console.log('erp-ticket-center wiring ok');
