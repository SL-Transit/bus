'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SETTINGS_URL = 'https://sl-transit-9464e-default-rtdb.asia-southeast1.firebasedatabase.app/settings.json';
const ROUTE_DATA_URL = 'https://sl-transit-9464e-default-rtdb.asia-southeast1.firebasedatabase.app/routeData.json';
const SERVICE_DATE = '2099-01-01';
const TRANSFER_LABEL = 'ฉะเชิงเทรา (แปดริ้ว)';
const MAIN_STOP_KEYS = ['klonghat','siyaekkhonom','thoengkabintr','phaijit','nongruea','khlongtakien','nongkhok','tatakiab','sanamchai','phanom','chachoengsao'];
const REQUIRED_FIELDS = [
  'queueNo', 'plannedVehicleId', 'tripIndex', 'departTime', 'pickupTime',
  'pickupStopKey', 'pickupStopName', 'routeStops', 'routeStopNames',
  'serviceType', 'scheduleOnly', 'noLiveTracking', 'assignmentSource'
];

function readRepoFile(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function extractFunction(source, name) {
  const match = new RegExp('function\\s+' + name + '\\s*\\(').exec(source);
  assert.ok(match, 'Missing function ' + name);
  const start = match.index;
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '\x60') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error('Unclosed function ' + name);
}

function loadScheduleEngine(source) {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: 'schedule-engine.js' });
  return sandbox.window.SLTransitSchedule;
}

function isExternalGroup(group, key) {
  const text = String((group && group.name) || key || '');
  return group && (group.id === 'coastal' || group.id === 'bangkok' || /พัทยา|ระยอง|มีนบุรี|หมอชิต|เอกมัย|BTS/i.test(text));
}

function routeCollections(settings) {
  const groups = settings && settings.routes ? settings.routes : {};
  const mainGroup = Object.values(groups).find(group => group && group.id === 'main');
  const mainRoutes = (mainGroup && mainGroup.routes || []).filter(route => route && route.isActive !== false);
  const externalRoutes = Object.entries(groups)
    .filter(([key, group]) => group && group.isActive !== false && isExternalGroup(group, key))
    .flatMap(([, group]) => (group.routes || []).filter(route => route && route.isActive !== false));
  return { groups, mainRoutes, externalRoutes };
}

function buildMatrix(settings) {
  const { mainRoutes, externalRoutes } = routeCollections(settings);
  const origins = [...new Set(mainRoutes.map(route => route.from))];
  const mainDestinations = [...new Set(mainRoutes.map(route => route.to))];
  const externalDestinations = [...new Set(externalRoutes.map(route => route.to))];
  const mainMap = new Map(mainRoutes.map(route => [route.from + '\0' + route.to, route]));
  const externalMap = new Map(externalRoutes.map(route => [route.from + '\0' + route.to, route]));
  const rows = [];

  for (const origin of origins) {
    for (const destination of [...mainDestinations, ...externalDestinations]) {
      if (origin === destination) continue;
      const external = externalDestinations.includes(destination);
      const route = external
        ? (origin === TRANSFER_LABEL
          ? externalMap.get(origin + '\0' + destination)
          : mainMap.get(origin + '\0' + TRANSFER_LABEL))
        : mainMap.get(origin + '\0' + destination);
      assert.ok(route, 'Published booking pair has no route settings: ' + origin + ' -> ' + destination);
      for (const time of route.times || []) {
        rows.push({ origin, destination, time, external, requiresTransfer: external && origin !== TRANSFER_LABEL });
      }
    }
  }
  return rows;
}

function createBookingRuntime(bookingSource, engine, settings) {
  const { mainRoutes, externalRoutes } = routeCollections(settings);
  const context = {
    window: { SLTransitSchedule: engine },
    LEG2_DEST: {},
    ORIGIN_TIMES: {},
    ADMIN_ROUTE_TIMES: {},
    TRANSFER_POINT_KEY: 'chachoengsao',
    mainStopIndexForBooking: key => MAIN_STOP_KEYS.indexOf(key)
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(extractFunction(bookingSource, '_routeKeyFromLabel'), context);

  const allRoutes = [...mainRoutes, ...externalRoutes];
  const fromKeyByLabel = new Map();
  const toKeyByLabel = new Map();
  for (const route of allRoutes) {
    if (!fromKeyByLabel.has(route.from)) fromKeyByLabel.set(route.from, context._routeKeyFromLabel(route.from));
    if (!toKeyByLabel.has(route.to)) toKeyByLabel.set(route.to, context._routeKeyFromLabel(route.to));
  }
  for (const route of mainRoutes) {
    if (!toKeyByLabel.has(route.from)) toKeyByLabel.set(route.from, context._routeKeyFromLabel(route.from));
    if (!fromKeyByLabel.has(route.to)) fromKeyByLabel.set(route.to, context._routeKeyFromLabel(route.to));
  }

  for (const route of allRoutes) {
    const fromKey = fromKeyByLabel.get(route.from) || toKeyByLabel.get(route.from);
    const toKey = toKeyByLabel.get(route.to) || fromKeyByLabel.get(route.to);
    if (!context.ADMIN_ROUTE_TIMES[fromKey]) context.ADMIN_ROUTE_TIMES[fromKey] = {};
    context.ADMIN_ROUTE_TIMES[fromKey][toKey] = (route.times || []).slice();
    if (!context.LEG2_DEST[toKey]) context.LEG2_DEST[toKey] = { label: route.to, leg2: false };
  }
  for (const route of externalRoutes) {
    const toKey = toKeyByLabel.get(route.to);
    context.LEG2_DEST[toKey] = { label: route.to, leg2: true };
  }

  context.TRANSFER_POINT_KEY = fromKeyByLabel.get(TRANSFER_LABEL) || toKeyByLabel.get(TRANSFER_LABEL);
  context.getDirectSchedules = (origin, destination) =>
    context.ADMIN_ROUTE_TIMES[origin] && context.ADMIN_ROUTE_TIMES[origin][destination] || null;
  context.isExternalDestination = destination =>
    Boolean(context.LEG2_DEST[destination] && context.LEG2_DEST[destination].leg2);

  vm.runInContext([
    extractFunction(bookingSource, 'normalizeBookingStopKey'),
    extractFunction(bookingSource, 'resolveBookingTripAssignment')
  ].join('\n'), context);

  return { context, fromKeyByLabel, toKeyByLabel };
}

function category(assignment) {
  if (!assignment) return 'invalid/missing';
  if (assignment.scheduleOnly || assignment.noLiveTracking || assignment.serviceType === 'schedule-only') return 'schedule-only';
  return assignment.queueNo ? 'assigned-live' : 'invalid/missing';
}

function sharedInput(engine, row, useStopKeys) {
  const scheduleOnly = row.external && row.origin === TRANSFER_LABEL;
  const input = {
    serviceDate: SERVICE_DATE,
    departTime: row.time,
    requiresTransfer: row.requiresTransfer,
    transferPoint: TRANSFER_LABEL,
    scheduleOnly,
    pickupStopKey: scheduleOnly ? 'chachoengsao' : '',
    pickupStopName: scheduleOnly ? TRANSFER_LABEL : '',
    routeStops: scheduleOnly ? ['chachoengsao', row.destination] : [],
    routeStopNames: scheduleOnly ? [TRANSFER_LABEL, row.destination] : [],
    assignmentSource: scheduleOnly ? 'booking_admin_schedule_only' : ''
  };
  if (useStopKeys) {
    input.originStopKey = engine.normalizeStopKey(row.origin);
    input.destinationStopKey = engine.normalizeStopKey(row.destination);
  } else {
    input.origin = row.origin;
    input.destination = row.destination;
  }
  return input;
}

async function main() {
  const scheduleSource = readRepoFile('schedule-engine.js');
  const bookingSource = readRepoFile('booking.html');
  const checkTicketSource = readRepoFile('check_ticket.html');
  const passengerSource = readRepoFile('passenger.html');
  const driverSource = readRepoFile('driver-android/src/main/java/com/sanamchai/drivergps/MainActivity.java');
  const [settingsResponse, routeDataResponse] = await Promise.all([fetch(SETTINGS_URL), fetch(ROUTE_DATA_URL)]);
  if (!settingsResponse.ok || !routeDataResponse.ok) {
    console.log('schedule resolver matrix skipped: legacy settings/routeData are not publicly readable in sl-transit-9464e');
    return;
  }
  const [settings, routeData] = await Promise.all([settingsResponse.json(), routeDataResponse.json()]);
  const engine = loadScheduleEngine(scheduleSource);
  engine.applyRouteData(routeData);
  const rows = buildMatrix(settings);
  const runtime = createBookingRuntime(bookingSource, engine, settings);
  const counts = { 'assigned-live': 0, 'schedule-only': 0, 'invalid/missing': 0 };

  rows.forEach((row, index) => {
    const aliasAssignment = engine.resolveTripAssignment(sharedInput(engine, row, false));
    const stopKeyAssignment = engine.resolveTripAssignment(sharedInput(engine, row, true));
    assert.equal(category(stopKeyAssignment), category(aliasAssignment), 'Shared input shapes disagree at row ' + index);

    const originKey = runtime.fromKeyByLabel.get(row.origin) || runtime.toKeyByLabel.get(row.origin);
    const destinationKey = runtime.toKeyByLabel.get(row.destination) || runtime.fromKeyByLabel.get(row.destination);
    const bookingAssignment = runtime.context.resolveBookingTripAssignment(
      originKey, destinationKey, row.time, row.requiresTransfer, SERVICE_DATE
    );

    const resultCategory = category(bookingAssignment);
    assert.notEqual(resultCategory, 'invalid/missing', 'Booking wrapper missing at row ' + index + ': ' + JSON.stringify(row));
    for (const field of REQUIRED_FIELDS) {
      assert.equal(Object.prototype.hasOwnProperty.call(bookingAssignment, field), true, 'Missing field ' + field + ' at row ' + index);
    }
    assert.equal(Array.isArray(bookingAssignment.routeStops), true);
    assert.equal(Array.isArray(bookingAssignment.routeStopNames), true);
    if (resultCategory === 'assigned-live') {
      assert.ok(bookingAssignment.plannedVehicleId, 'Live assignment has no planned vehicle at row ' + index);
      assert.equal(bookingAssignment.pickupStopKey, engine.normalizeStopKey(row.origin), 'Pickup stop does not match booking origin at row ' + index);
    }
    if (resultCategory === 'schedule-only') {
      assert.equal(bookingAssignment.noLiveTracking, true);
      assert.equal(bookingAssignment.plannedVehicleId, '');
    }
    counts[resultCategory] += 1;
  });

  const vehicleResolver = extractFunction(checkTicketSource, 'resolveVehicleForBooking');
  assert.equal(vehicleResolver.includes('orderedKeys'), false, 'check_ticket still scans unassigned vehicles');
  assert.equal(vehicleResolver.includes("status: 'missing_assignment_contract'"), true, 'check_ticket missing explicit no-assignment short circuit');
  assert.equal(passengerSource.includes("db.ref('publishedSchedule')"), true, 'passenger is not reading active publishedSchedule');
  assert.equal(passengerSource.includes("db.ref('routeData')"), false, 'passenger still reads legacy routeData');
  assert.equal(passengerSource.includes("db.ref('liveVehicles')"), false, 'passenger still reads legacy liveVehicles');
  assert.equal(extractFunction(checkTicketSource, 'resolveSharedScheduleAssignmentForBooking').includes('persistedVehicleId'), true, 'check_ticket does not prefer persisted assignment');
  assert.equal(driverSource.includes('operations/driverTicketsByServiceDate'), true, 'driver list is not reading the central self-only ticket feed');
  assert.equal(driverSource.includes('bookingBelongsToVehicle(child, vehicleId)'), false, 'driver list still filters all bookings on the device');
  assert.equal(driverSource.includes('bookingBelongsToVehicle(snap, vehicleId)'), true, 'driver QR check-in does not validate planned vehicle');
  assert.equal(driverSource.includes('testMode ? "testBookings" : "bookings"'), true, 'driver app does not follow test mode booking path');
  assert.equal(driverSource.includes('loadBookingsForDate'), false, 'driver app still scans daily bookings');
  assert.equal(counts['invalid/missing'], 0);

  console.log(JSON.stringify({
    pairs: new Set(rows.map(row => row.origin + '\0' + row.destination)).size,
    rounds: rows.length,
    ...counts,
    inputShapesAgree: true,
    bookingWrapperCovered: true,
    noCrossVehicleGuessing: true
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
