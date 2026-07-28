const assert = require('assert');
const fs = require('fs');
const path = require('path');

const passengerHtml = fs.readFileSync(path.join(__dirname, '..', 'passenger.html'), 'utf8');
const passengerLogic = fs.readFileSync(path.join(__dirname, '..', 'passenger-logic.js'), 'utf8');
const erpDataAdapter = fs.readFileSync(path.join(__dirname, '..', 'erp-data-adapter.js'), 'utf8');
const mapDisplayCenter = fs.readFileSync(path.join(__dirname, '..', 'map-display-center.js'), 'utf8');
const checkTicketHtml = fs.readFileSync(path.join(__dirname, '..', 'check_ticket.html'), 'utf8');
const driverMapHtml = fs.readFileSync(path.join(__dirname, '..', 'driver-map.html'), 'utf8');
const driverMapLogic = fs.readFileSync(path.join(__dirname, '..', 'driver-map-logic.js'), 'utf8');
const driverMain = fs.readFileSync(
  path.join(__dirname, '..', 'driver-android', 'src', 'main', 'java', 'com', 'sanamchai', 'drivergps', 'MainActivity.java'),
  'utf8'
);

assert(passengerHtml.includes('map-display-center.js'), 'Passenger must load Map Display Center');
assert(checkTicketHtml.includes('map-display-center.js'), 'Check Ticket must load Map Display Center');
assert(checkTicketHtml.includes("db.ref('publishedSchedule/mapView')"), 'Check Ticket must read the same ERP mapView contract as Driver and Passenger');
assert(checkTicketHtml.includes('TICKET_ERP_MAP_DISPLAY_POLICY = mapView.displayPolicy || null'), 'Check Ticket must consume the same ERP mapView display policy');
assert(checkTicketHtml.includes('TICKET_ERP_MAP_ROUTES = normalizeTicketErpMapRoutes(mapView.routes)'), 'Check Ticket must consume the same ERP mapView route geometry');
assert(driverMapHtml.includes('driver-map-logic.js?v=20260728c'), 'Driver map must load the current ERP map logic version');
assert(driverMapLogic.includes("MAP_VIEW_PATH = 'publishedSchedule/mapView'"), 'Driver map must read the same ERP Data Center mapView contract as Passenger');
assert(driverMapLogic.includes('renderStops(normalizeStops(mapView.stops))'), 'Driver map must render backend-provided mapView stops');
assert(driverMapLogic.includes('s.label || s.displayNameTh || s.nameTh'), 'Driver map stop labels must come from mapView stop data');
assert(driverMapLogic.includes("icon: s.icon || '\\uD83D\\uDE8F'"), 'Driver map stop icons must come from mapView stop data');
assert(driverMapLogic.includes('renderRoute(extractRoadRoute(mapView.routes))'), 'Driver map must render the ERP Map road route from mapView');
assert(!driverMapLogic.includes("data/erpDataCenter/catalog/stops"), 'Driver map must not read raw catalog stops instead of the published mapView contract');
assert(driverMapLogic.includes('stopMarkersAreFixedScreenSize(mapView)'), 'Driver map stop icon scale behavior must come from ERP mapView display policy');
assert(driverMapLogic.includes("policy.scaleMode === 'fixed_screen_size'"), 'Driver map must follow the ERP stop marker scale policy');
assert(!driverMapLogic.includes('markerZoomAnimation: false'), 'Driver map must not hard-code stop marker zoom behavior locally');
assert(passengerLogic.includes('displayPolicy: mapView.displayPolicy || null'), 'Passenger must consume the same ERP mapView display policy');
assert(driverMain.includes('ws.setCacheMode(WebSettings.LOAD_NO_CACHE)'), 'Driver app WebView must not reuse stale driver-map HTML');
assert(driverMain.includes('driverMapWebView.clearCache(true)'), 'Driver app must clear stale driver map WebView cache');
assert(driverMain.includes('https://sl-transit.com/driver-map.html?v=20260728c'), 'Driver app must load the current driver map HTML version');

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
