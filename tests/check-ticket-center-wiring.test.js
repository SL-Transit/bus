const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'check_ticket.html'), 'utf8');

assert(html.includes('erp-calculator-center.js'), 'Check Ticket must load ERP Calculator Center');
assert(html.includes('map-display-center.js'), 'Check Ticket must load Map Display Center');
assert(html.includes('erp-alert-center.js'), 'Check Ticket must load ERP Alert Center');
assert(html.includes("db.ref('publishedSchedule/mapView')"), 'Check Ticket must read stop/map data from publishedSchedule mapView');
assert(html.includes("db.ref('publishedSchedule').child('pairs').child(storageKey).once('value')"), 'Check Ticket must lazy-read its exact timetable pair from ERP Data Center');
assert(html.includes("db.ref('publishedSchedule/firebaseKeyEncoding').once('value')"), 'Check Ticket must resolve only ERP-provided pair keys');
assert(html.includes("db.ref('operations/liveVehicles')"), 'Check Ticket must read live vehicle data from operations/liveVehicles');
assert(html.includes('normalizeTicketErpMapRoutes'), 'Check Ticket must normalize ERP Map route geometry');
assert(html.includes('buildTrackingErpMapRouteCoords'), 'Check Ticket must build tracking route lines from ERP Map');
assert(html.includes('sliceTicketErpMapRouteBetween'), 'Check Ticket must slice ERP Map road geometry between vehicle/origin/destination');
assert(!html.includes("db.ref('routeData')"), 'Check Ticket must not read legacy routeData');
assert(!html.includes("db.ref('publishedCatalog')"), 'Check Ticket must not read legacy publishedCatalog');
assert(!html.includes("db.ref('bus')"), 'Check Ticket must not read legacy bus live feed');
assert(!html.includes("db.ref('liveVehicles')"), 'Check Ticket must not read legacy top-level liveVehicles feed');
assert(!html.includes('settings.routes'), 'Check Ticket must not use legacy settings.routes as schedule authority');
assert(!html.includes('queueTemplates'), 'Check Ticket must not contain local queue timetable templates');
assert(!html.includes('LEG2_TIMES_') && !html.includes('ORIGIN_TIMES'), 'Check Ticket must not contain local timetable arrays');
assert(!html.includes('TRANSFER_BUFFER_MINUTES'), 'Check Ticket must not infer transfer timing from local buffers');
assert(!html.includes('inferQueueNoFromBookingTrip'), 'Check Ticket must not infer a queue from route/time');
assert(!html.includes('resolveTripAssignment({'), 'Check Ticket must not create a queue assignment locally');
assert(!html.includes('13.692383') && !html.includes('13.692477') && !html.includes('101.054105'), 'Check Ticket must not contain hardcoded transfer coordinates');
assert(html.includes('findStopLocationByKey(transfer.viaStopKey)'), 'Check Ticket transfer coordinates must use the ERP Data Center stop key');
assert(!html.includes('แปดริ้ว'), 'Check Ticket must not hardcode the transfer point label');

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

const trackingRouteBlock = blockBetween('function updateTrackingRouteLine', 'function requestMapboxRouteGeometry');
assert(trackingRouteBlock.includes('buildTrackingErpMapRouteCoords'), 'tracking route line must use ERP Map road geometry');
assert(!trackingRouteBlock.includes('requestMapboxRouteGeometry(coords)'), 'tracking route line rendering must not request Mapbox Directions');

console.log('check-ticket center wiring ok');
