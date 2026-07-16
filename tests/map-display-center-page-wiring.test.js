const assert = require('assert');
const fs = require('fs');
const path = require('path');

const passengerHtml = fs.readFileSync(path.join(__dirname, '..', 'passenger.html'), 'utf8');
const passengerLogic = fs.readFileSync(path.join(__dirname, '..', 'passenger-logic.js'), 'utf8');
const erpDataAdapter = fs.readFileSync(path.join(__dirname, '..', 'erp-data-adapter.js'), 'utf8');
const mapDisplayCenter = fs.readFileSync(path.join(__dirname, '..', 'map-display-center.js'), 'utf8');
const checkTicketHtml = fs.readFileSync(path.join(__dirname, '..', 'check_ticket.html'), 'utf8');

assert(passengerHtml.includes('map-display-center.js'), 'Passenger must load Map Display Center');
assert(checkTicketHtml.includes('map-display-center.js'), 'Check Ticket must load Map Display Center');

const passengerUpdateStart = passengerLogic.indexOf('function updateAllBusesOnMap');
const passengerUpdateEnd = passengerLogic.indexOf('function removeBusFromMap', passengerUpdateStart);
assert(passengerUpdateStart !== -1 && passengerUpdateEnd !== -1, 'Passenger vehicle update block missing');
const passengerUpdateBlock = passengerLogic.slice(passengerUpdateStart, passengerUpdateEnd);
assert(passengerUpdateBlock.includes('center.prepareVehicleLayer'), 'Passenger vehicle layer must ask Map Display Center');
assert(passengerUpdateBlock.includes('placeBusMarkerAt'), 'Passenger must remain display-only and place the prepared markers');
assert(passengerLogic.includes('center.planViewport'), 'Passenger viewport changes must ask Map Display Center');
assert(passengerLogic.includes('center.planFollowInteraction'), 'Passenger manual-follow changes must ask Map Display Center');
assert(passengerLogic.includes('initialViewportPlan = getMapDisplayCenter().planViewport'), 'Passenger initial viewport must come from Map Display Center');
assert(!passengerLogic.includes('zoom: 10, location:'), 'Passenger must not keep a local initial zoom and center decision');
assert(!passengerHtml.includes('focusPoint(stop, 14)'), 'Passenger UI must not choose stop zoom locally');
assert(!passengerHtml.includes('focusPoint(pos, 14)'), 'Passenger UI must not choose vehicle zoom locally');
assert(passengerHtml.includes('map-display-center.js?v=20260716center4'), 'Passenger must load the current Map Display Center version');
assert(passengerHtml.includes('erp-data-adapter.js?v=20260716live5'), 'Passenger must load the current ERP adapter version');
assert(passengerHtml.includes('passenger-logic.js?v=20260716live5'), 'Passenger must load the current map adapter version');
assert(passengerHtml.includes("db.ref('data/settings')"), 'Passenger settings must read the public data/settings path');
assert(!passengerHtml.includes("db.ref('settings')"), 'Passenger must not read the blocked top-level settings path');

assert(passengerLogic.includes('SLTransit.db'), 'Passenger must consume live vehicles through the ERP data adapter');
assert(passengerLogic.includes('var point = normalizeMapPoint(latlng)'), 'Passenger bus markers must use Longdo lon/lat geometry');
assert(passengerLogic.includes('BUS_MARKER_MOVE_MS'), 'Passenger bus markers must use smooth Longdo movement');
assert(mapDisplayCenter.includes('displayState'), 'Map Display Center must own vehicle motion display state');
assert(mapDisplayCenter.includes('impossible_jump_ignored'), 'Map Display Center must guard impossible GPS jumps');
assert(mapDisplayCenter.includes('stale_signal'), 'Map Display Center must ignore stale GPS packets');
assert(passengerLogic.includes('adapter.watchLiveVehicles(applyLiveVehicleSnapshot)'), 'Passenger must watch the central operations/liveVehicles contract');
assert(erpDataAdapter.includes("schemaPath('operationsLiveVehicles', 'operations/liveVehicles')"), 'ERP adapter live vehicle watcher must target operations/liveVehicles');
assert(erpDataAdapter.includes("'data/catalog'"), 'ERP adapter must bridge to the current production catalog path');
assert(erpDataAdapter.includes("'data/settings'"), 'ERP adapter must bridge to the current production settings path');
assert(erpDataAdapter.includes("'data/fleet/vehicles'"), 'ERP adapter must bridge to public vehicle data without opening private fleet data');
assert(!passengerLogic.includes("db.ref('liveVehicles')"), 'Passenger must not read the legacy top-level liveVehicles path');
assert(!passengerLogic.includes("db.ref('bus')"), 'Passenger must not read the legacy top-level bus path');

let liveVehicleCallback = null;
global.window = global;
global.firebase = {
  initializeApp: function() {
    return { database: function() { return {}; } };
  }
};
global.SLTransit = {
  db: {
    init: function() { return Promise.resolve(); },
    watchLiveVehicles: function(callback) {
      liveVehicleCallback = callback;
      return function unsubscribe() {};
    }
  },
  core: {
    init: function() { return Promise.resolve(global.SLTransit); }
  }
};
require('../map-display-center.js');
require('../passenger-logic.js');

const checkVanStart = checkTicketHtml.indexOf('function updateVanMarkerSmoothly');
const checkVanEnd = checkTicketHtml.indexOf('function updateTrackingRouteLine', checkVanStart);
assert(checkVanStart !== -1 && checkVanEnd !== -1, 'Check Ticket vehicle marker block missing');
const checkVanBlock = checkTicketHtml.slice(checkVanStart, checkVanEnd);
assert(checkVanBlock.includes('SLTransitMapDisplayCenter.planVehicleMarker'), 'Check Ticket booked vehicle marker must ask Map Display Center');
assert(checkVanBlock.includes('animateTrackingMarker'), 'Check Ticket should still render with its existing marker animation');

global.SLPassengerLogic.init().then(function() {
  assert.strictEqual(typeof liveVehicleCallback, 'function', 'Passenger init must start the central live vehicle watcher');
  liveVehicleCallback({
    val: function() {
      return {
        car1: { lat: 13.692383, lng: 101.054183 },
        veh_002: { lat: 13.7, lng: 101.1 }
      };
    }
  });
  assert.deepStrictEqual(
    Object.keys(global.SLPassengerLogic.vehicles.getAll()),
    ['car1', 'veh_002'],
    'Passenger must retain every central vehicle signal even before the map is ready'
  );
  console.log('map-display-center page wiring ok');
}).catch(function(error) {
  console.error(error);
  process.exitCode = 1;
});
