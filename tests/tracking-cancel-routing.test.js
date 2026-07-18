const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const booking = fs.readFileSync(path.join(root, 'booking.html'), 'utf8');
const booking1 = fs.readFileSync(path.join(root, 'booking1.html'), 'utf8');
const checkTicket = fs.readFileSync(path.join(root, 'check_ticket.html'), 'utf8');
const trackTrip = fs.readFileSync(path.join(root, 'track_trip.html'), 'utf8');
const cancelTicket = fs.readFileSync(path.join(root, 'cancel_ticket.html'), 'utf8');

assert(index.includes('href="track_trip.html"'), 'Home tracking entry must use track_trip.html');
assert(index.includes('href="cancel_ticket.html"'), 'Home cancel entry must use cancel_ticket.html');
assert(index.includes('ติดตามรถของฉัน<br>สำหรับตั๋วที่จองแล้ว'), 'Home tracking label must be passenger tracking language');
assert(booking1.includes('href="track_trip.html"'), 'Booking1 menu must use track_trip.html');
assert(booking1.includes('href="cancel_ticket.html"'), 'Booking1 menu must use cancel_ticket.html');
assert(booking1.includes('ติดตามรถได้ทันที'), 'Booking1 benefit copy must use tracking language');
assert(booking.includes('track_trip.html?code='), 'Booking QR/check-in link must open tracking entry');
assert(booking1.includes('track_trip.html?code='), 'Booking1 QR link must open tracking entry');
assert(checkTicket.includes('<title>ติดตามรถของฉัน'), 'Underlying ticket page must use passenger tracking title');
assert(checkTicket.includes('<h1>ติดตามรถของฉัน</h1>'), 'Underlying ticket page must use passenger tracking heading');
assert(trackTrip.includes("window.location.replace('check_ticket.html' + query + hash)"), 'track_trip.html must preserve tracking query parameters');
assert(cancelTicket.includes("params.set('action', 'cancel')"), 'cancel_ticket.html must force cancel mode');

console.log('tracking/cancel routing ok');
