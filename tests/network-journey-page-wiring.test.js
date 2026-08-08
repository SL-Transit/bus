const assert = require('assert');
const fs = require('fs');

const booking = fs.readFileSync('booking1.html', 'utf8');
const passenger = fs.readFileSync('passenger.html', 'utf8');
const bridge = fs.readFileSync('booking-bridge.js', 'utf8');
const admin = fs.readFileSync('admin-erp.html', 'utf8');
const adminPreview = fs.readFileSync('admin-erp-preview.html', 'utf8');

assert(booking.includes('network-engine.js?v=20260808journey1'), 'Booking1 must load the central network engine');
assert(passenger.includes('network-engine.js?v=20260808journey1'), 'Passenger must load the central network engine');
assert(bridge.includes('function buildNetworkJourneys(input)'), 'Booking bridge must expose the central journey matcher');
assert(bridge.includes('buildNetworkJourneys: buildNetworkJourneys'), 'Booking bridge API must expose buildNetworkJourneys');
assert(admin.includes("['arrivalTime', 'เวลาถึงปลายทาง'"), 'Admin ERP must expose arrival time for network matching');
assert(adminPreview.includes("['arrivalTime', 'เวลาถึงปลายทาง'"), 'Admin ERP preview must expose arrival time for network matching');

console.log('network journey page wiring ok');
