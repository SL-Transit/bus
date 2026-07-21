const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const checkTicket = fs.readFileSync(path.join(root, 'check_ticket.html'), 'utf8');
const cancelTicket = fs.readFileSync(path.join(root, 'cancel_ticket.html'), 'utf8');

assert(checkTicket.includes('ticket-data-center.js'), 'Check Ticket must load Ticket Data Center');
assert(cancelTicket.includes('ticket-data-center.js'), 'Cancel Ticket must load Ticket Data Center');
assert(checkTicket.includes('SLTransitTicketDataCenter.findTicket(db, value'), 'Check Ticket lookup must use Ticket Data Center');
assert(cancelTicket.includes('SLTransitTicketDataCenter.findTicket(db, value'), 'Cancel Ticket lookup must use Ticket Data Center');
assert(checkTicket.includes('SLTransitTicketDataCenter.bookingPathForCode'), 'Check Ticket booking path must go through Ticket Data Center');
assert(cancelTicket.includes('SLTransitTicketDataCenter.bookingPathForCode'), 'Cancel Ticket booking path must go through Ticket Data Center');

const checkLookupBody = checkTicket.slice(checkTicket.indexOf('function lookupTicket()'), checkTicket.indexOf('task.then(function(found)'));
assert(!checkLookupBody.includes("db.ref(bookingPathForCode(value) + value)"), 'Check Ticket must not read booking code directly inside lookup');

const cancelLookupBody = cancelTicket.slice(cancelTicket.indexOf('function lookupTicket(event)'), cancelTicket.indexOf('}).then(function(found)'));
assert(!cancelLookupBody.includes("db.ref(bookingPathForCode(code) + code)"), 'Cancel Ticket must not read booking code directly inside lookup');
assert(!cancelTicket.includes('mapbox'), 'Cancel Ticket remains map-free');
assert(!cancelTicket.includes('trackingMap'), 'Cancel Ticket remains tracking-map-free');

console.log('ticket data center page wiring ok');
