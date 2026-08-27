'use strict';

const assert = require('node:assert/strict');
const {
  decideCheckinEligibility,
  classifyEtaSource,
  buildErpLogicCenterDryRun
} = require('../tools/erp-logic-center-dry-run.js');

const now = new Date('2026-07-12T10:00:00').getTime();

const inside = decideCheckinEligibility({
  routeType: 'secondary_connection',
  status: 'confirmed',
  distanceKm: 2.5,
  enteredRadiusAt: now - 1000,
  now
});
assert.equal(inside.allowed, true, '2.5 km boundary should be eligible');
assert.equal(inside.insideRadius, true, '2.5 km boundary should be inside radius');

const outside = decideCheckinEligibility({
  routeType: 'secondary_connection',
  status: 'confirmed',
  distanceKm: 2.51,
  now
});
assert.equal(outside.allowed, false, 'outside radius must be blocked');
assert.equal(outside.reason, 'outside_radius', 'outside radius reason mismatch');

const expiredWindow = decideCheckinEligibility({
  routeType: 'secondary_connection',
  status: 'confirmed',
  distanceKm: 1.2,
  enteredRadiusAt: now - (61 * 60 * 1000),
  now
});
assert.equal(expiredWindow.allowed, false, 'expired radius window must be blocked');
assert.equal(expiredWindow.reason, 'radius_window_expired', 'expired radius reason mismatch');

const mainRoute = decideCheckinEligibility({
  routeType: 'main_route',
  status: 'confirmed',
  distanceKm: 1.0,
  now
});
assert.equal(mainRoute.allowed, false, 'main route transfer check-in must be blocked');
assert.equal(mainRoute.reason, 'main_route_no_transfer_checkin', 'main route reason mismatch');

const duplicate = decideCheckinEligibility({
  routeType: 'secondary_connection',
  status: 'checked_in',
  distanceKm: 1.0,
  now
});
assert.equal(duplicate.allowed, false, 'duplicate check-in must be blocked');
assert.equal(duplicate.reason, 'locked_status', 'duplicate check-in reason mismatch');

const adminBypass = decideCheckinEligibility({
  routeType: 'main_route',
  status: 'confirmed',
  distanceKm: 99,
  adminBypass: true,
  now
});
assert.equal(adminBypass.allowed, true, 'admin bypass should allow check-in policy gate');

const liveEta = classifyEtaSource({
  now,
  liveVehicle: { vehicleId: 'veh_001', lat: 13.6, lng: 101.1, gpsTs: now - 30000, etaMinutes: 8 },
  scheduleEstimate: { referenceOnly: true, time: '10:30', etaMinutes: 30 }
});
assert.equal(liveEta.source, 'live_gps', 'fresh live GPS must win over schedule estimate');
assert.equal(liveEta.vehicleId, 'veh_001', 'live ETA vehicle ID missing');

const scheduleEta = classifyEtaSource({
  now,
  scheduleOnly: true,
  scheduleEstimate: { referenceOnly: true, time: '12:00', etaMinutes: 35 }
});
assert.equal(scheduleEta.source, 'schedule_estimate', 'schedule-only must use schedule estimate');
assert.equal(scheduleEta.vehicleId, '', 'schedule estimate must not claim vehicle ID');

const unavailableEta = classifyEtaSource({
  now,
  liveVehicle: { vehicleId: 'veh_002', lat: 13.6, lng: 101.1, gpsTs: now - 600000 }
});
assert.equal(unavailableEta.source, 'unavailable', 'stale live GPS without schedule should be unavailable');

const dryRun = buildErpLogicCenterDryRun();
assert.equal(dryRun.dryRun, true, 'dry-run flag must stay true');
assert.equal(dryRun.writesEnabled, false, 'writes must stay disabled');
assert.equal(dryRun.readyForApply, false, 'dry-run must not be apply-ready');
assert.equal(dryRun.validation.readyForReview, true, 'pure logic dry-run should be review-ready');
assert.equal(dryRun.validation.readyForApply, false, 'validation must not be apply-ready');
assert.equal(dryRun.counts.etaSource.live_gps, 1, 'sample live GPS count mismatch');
assert.equal(dryRun.counts.etaSource.schedule_estimate, 1, 'sample schedule estimate count mismatch');
assert.equal(dryRun.counts.etaSource.unavailable, 1, 'sample unavailable ETA count mismatch');

console.log('erp-logic-center ticket policy ok');
