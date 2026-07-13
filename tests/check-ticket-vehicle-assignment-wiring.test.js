const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'check_ticket.html'), 'utf8');

assert(html.includes('vehicle-assignment-center.js'), 'Check Ticket must load Vehicle Assignment Center');

const resolverStart = html.indexOf('function resolveVehicleForBooking');
const resolverEnd = html.indexOf('function buildFallbackTripForBooking', resolverStart);
assert(resolverStart !== -1 && resolverEnd !== -1, 'resolveVehicleForBooking block missing');
const resolverBlock = html.slice(resolverStart, resolverEnd);

assert(resolverBlock.includes('SLTransitVehicleAssignmentCenter.selectBookedVehicle'), 'Check Ticket vehicle resolver must ask Vehicle Assignment Center');
assert(resolverBlock.includes("centerMatch.status === 'schedule_only'"), 'schedule-only vehicle decision must come back from Vehicle Assignment Center');
assert(resolverBlock.includes("centerMatch.status === 'missing_assigned_vehicle'"), 'missing vehicle decision must come back from Vehicle Assignment Center');
assert(resolverBlock.includes("centerMatch.status === 'missing_assignment_contract'"), 'missing assignment contract must come back from Vehicle Assignment Center');
assert(!resolverBlock.includes("booking.vehicleId || booking.assignedVehicleId"), 'Check Ticket resolver must not infer assigned vehicle from legacy booking vehicle aliases');

const expectedStatusStart = html.indexOf('function expectedVehicleStatusForBooking');
const expectedStatusEnd = html.indexOf('function scheduledPickupEtaForBooking', expectedStatusStart);
assert(expectedStatusStart !== -1 && expectedStatusEnd !== -1, 'expectedVehicleStatusForBooking block missing');
const expectedStatusBlock = html.slice(expectedStatusStart, expectedStatusEnd);
assert(expectedStatusBlock.includes('SLTransitVehicleAssignmentCenter.selectBookedVehicle'), 'expected vehicle status must ask Vehicle Assignment Center');
assert(!expectedStatusBlock.includes('getVehicleIdForQueue'), 'expected vehicle status must not infer vehicle from queue locally');

console.log('check-ticket vehicle assignment wiring ok');
