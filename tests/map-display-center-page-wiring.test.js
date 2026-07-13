const assert = require('assert');
const fs = require('fs');
const path = require('path');

const passengerHtml = fs.readFileSync(path.join(__dirname, '..', 'passenger.html'), 'utf8');
const passengerLogic = fs.readFileSync(path.join(__dirname, '..', 'passenger-logic.js'), 'utf8');
const checkTicketHtml = fs.readFileSync(path.join(__dirname, '..', 'check_ticket.html'), 'utf8');

assert(passengerHtml.includes('map-display-center.js'), 'Passenger must load Map Display Center');
assert(checkTicketHtml.includes('map-display-center.js'), 'Check Ticket must load Map Display Center');

const passengerUpdateStart = passengerLogic.indexOf('function updateAllBusesOnMap');
const passengerUpdateEnd = passengerLogic.indexOf('function removeBusFromMap', passengerUpdateStart);
assert(passengerUpdateStart !== -1 && passengerUpdateEnd !== -1, 'Passenger vehicle update block missing');
const passengerUpdateBlock = passengerLogic.slice(passengerUpdateStart, passengerUpdateEnd);
assert(passengerUpdateBlock.includes('SLTransitMapDisplayCenter.prepareVehicleLayer'), 'Passenger vehicle layer must ask Map Display Center');
assert(passengerUpdateBlock.includes('placeBusMarkerAt'), 'Passenger must remain display-only and place the prepared markers');

const checkVanStart = checkTicketHtml.indexOf('function updateVanMarkerSmoothly');
const checkVanEnd = checkTicketHtml.indexOf('function updateTrackingRouteLine', checkVanStart);
assert(checkVanStart !== -1 && checkVanEnd !== -1, 'Check Ticket vehicle marker block missing');
const checkVanBlock = checkTicketHtml.slice(checkVanStart, checkVanEnd);
assert(checkVanBlock.includes('SLTransitMapDisplayCenter.planVehicleMarker'), 'Check Ticket booked vehicle marker must ask Map Display Center');
assert(checkVanBlock.includes('animateTrackingMarker'), 'Check Ticket should still render with its existing marker animation');

console.log('map-display-center page wiring ok');
