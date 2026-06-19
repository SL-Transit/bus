'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const SETTINGS_URL = 'https://bus-booking-1d68c-default-rtdb.firebaseio.com/settings.json';
const ROUTE_DATA_URL = 'https://bus-booking-1d68c-default-rtdb.firebaseio.com/routeData.json';
const SERVICE_DATE = '2099-01-01';
const TRANSFER_LABEL = 'ฉะเชิงเทรา (แปดริ้ว)';
const REQUIRED_FIELDS = [
  'queueNo', 'plannedVehicleId', 'tripIndex', 'departTime', 'pickupTime',
  'pickupStopKey', 'pickupStopName', 'routeStops', 'routeStopNames',
  'serviceType', 'scheduleOnly', 'noLiveTracking', 'assignmentSource'
];

function loadScheduleEngine() {
  const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'schedule-engine.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: 'schedule-engine.js' });
  return sandbox.window.SLTransitSchedule;
}

function isExternalGroup(group, key) {
  const text = String((group && group.name) || key || '');
  return group && (group.id === 'coastal' || group.id === 'bangkok' || /พัทยา|ระยอง|มีนบุรี|หมอชิต|เอกมัย|BTS/i.test(text));
}

function buildMatrix(settings) {
  const groups = settings && settings.routes ? settings.routes : {};
  const mainGroup = Object.values(groups).find(group => group && group.id === 'main');
  const mainRoutes = (mainGroup && mainGroup.routes || []).filter(route => route && route.isActive !== false);
  const externalRoutes = Object.entries(groups)
    .filter(([key, group]) => group && group.isActive !== false && isExternalGroup(group, key))
    .flatMap(([, group]) => (group.routes || []).filter(route => route && route.isActive !== false));
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

function resolve(engine, row, useStopKeys) {
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
  return engine.resolveTripAssignment(input);
}

function category(assignment) {
  if (!assignment) return 'invalid/missing';
  if (assignment.scheduleOnly || assignment.noLiveTracking || assignment.serviceType === 'schedule-only') return 'schedule-only';
  return assignment.queueNo ? 'assigned-live' : 'invalid/missing';
}

async function main() {
  const [settingsResponse, routeDataResponse] = await Promise.all([fetch(SETTINGS_URL), fetch(ROUTE_DATA_URL)]);
  assert.equal(settingsResponse.ok, true, 'Cannot read Firebase settings');
  assert.equal(routeDataResponse.ok, true, 'Cannot read Firebase routeData');
  const [settings, routeData] = await Promise.all([settingsResponse.json(), routeDataResponse.json()]);
  const engine = loadScheduleEngine();
  engine.applyRouteData(routeData);
  const rows = buildMatrix(settings);
  const counts = { 'assigned-live': 0, 'schedule-only': 0, 'invalid/missing': 0 };

  rows.forEach((row, index) => {
    const aliasAssignment = resolve(engine, row, false);
    const stopKeyAssignment = resolve(engine, row, true);
    const aliasCategory = category(aliasAssignment);
    const stopKeyCategory = category(stopKeyAssignment);
    assert.equal(stopKeyCategory, aliasCategory, 'Input shapes disagree at row ' + index);
    assert.ok(aliasAssignment, 'Missing assignment at row ' + index + ': ' + JSON.stringify(row));
    for (const field of REQUIRED_FIELDS) {
      assert.equal(Object.prototype.hasOwnProperty.call(aliasAssignment, field), true, 'Missing field ' + field + ' at row ' + index);
    }
    assert.equal(Array.isArray(aliasAssignment.routeStops), true);
    assert.equal(Array.isArray(aliasAssignment.routeStopNames), true);
    if (aliasCategory === 'assigned-live') {
      assert.ok(aliasAssignment.plannedVehicleId, 'Live assignment has no planned vehicle at row ' + index);
    } else if (aliasCategory === 'schedule-only') {
      assert.equal(aliasAssignment.noLiveTracking, true);
      assert.equal(aliasAssignment.plannedVehicleId, '');
    }
    counts[aliasCategory] += 1;
  });

  assert.equal(counts['invalid/missing'], 0);
  console.log(JSON.stringify({
    pairs: new Set(rows.map(row => row.origin + '\0' + row.destination)).size,
    rounds: rows.length,
    ...counts,
    inputShapesAgree: true
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
