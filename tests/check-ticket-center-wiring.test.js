const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'check_ticket.html'), 'utf8');

assert(html.includes('erp-calculator-center.js'), 'Check Ticket must load ERP Calculator Center');
assert(html.includes('map-display-center.js'), 'Check Ticket must load Map Display Center');
assert(html.includes('erp-alert-center.js'), 'Check Ticket must load ERP Alert Center');

function blockBetween(start, end) {
  const startIndex = html.indexOf(start);
  assert(startIndex !== -1, start + ' block missing');
  const endIndex = html.indexOf(end, startIndex + start.length);
  assert(endIndex !== -1, end + ' block boundary missing');
  return html.slice(startIndex, endIndex);
}

const pickupEtaBlock = blockBetween('function calculateVehicleEtaToPickup', 'function isOriginBoarded');
assert(pickupEtaBlock.includes('SLTransitCalculatorCenter.estimateEta'), 'pickup ETA must ask Calculator Center');
assert(!pickupEtaBlock.includes('SLTransitGeo.estimateVehicleEta'), 'pickup ETA must not call Geo ETA directly');

const journeyEtaBlock = blockBetween('function calculateTransferOrDestinationEta', 'function scheduledJourneyEtaMinutes');
assert(journeyEtaBlock.includes('SLTransitCalculatorCenter.estimateEta'), 'journey ETA must ask Calculator Center');
assert(!journeyEtaBlock.includes('SLTransitGeo.estimateVehicleEta'), 'journey ETA must not call Geo ETA directly');

const transferTripBlock = blockBetween('function expectedTransferTripText', 'function maybeMarkServiceArrival');
assert(transferTripBlock.includes('SLTransitCalculatorCenter.findCatchableTrip'), 'transfer trip matching must ask Calculator Center');

const distanceStateBlock = blockBetween('function renderDistanceState', 'function estimateSpeedKmh');
assert(distanceStateBlock.includes('SLTransitCalculatorCenter.estimateEta'), 'distance ETA must ask Calculator Center');
assert(!distanceStateBlock.includes('SLTransitGeo.estimateEtaFromDistanceKm'), 'distance ETA must not call Geo ETA directly');

console.log('check-ticket center wiring ok');
