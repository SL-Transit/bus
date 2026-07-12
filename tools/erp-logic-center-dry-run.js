#!/usr/bin/env node
'use strict';

const DEFAULT_CHECKIN_POLICY = {
  radiusKm: 2.5,
  radiusWindowMs: 60 * 60 * 1000
};

const DEFAULT_TRANSFER_POLICY = {
  minTransferMinutes: 15,
  idealWaitMinutes: 30,
  maxWaitMinutes: 60
};

const DEFAULT_BOOKING_POLICY = {
  bookingOpen: true,
  cutoffMinutes: 60
};

const DEFAULT_ETA_POLICY = {
  freshGpsMaxAgeMs: 2 * 60 * 1000
};

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseTimeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesBetweenForward(fromTime, toTime) {
  const from = parseTimeToMinutes(fromTime);
  const to = parseTimeToMinutes(toTime);
  if (from === null || to === null) return null;
  const diff = to - from;
  return diff < 0 ? diff + 1440 : diff;
}

function serviceDateTimeMs(serviceDate, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(serviceDate || ''))) return null;
  if (parseTimeToMinutes(time) === null) return null;
  const parsed = new Date(`${serviceDate}T${String(time).slice(0, 5)}:00`);
  const ms = parsed.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isLockedTicketStatus(status, adminBypass) {
  const current = normalizeStatus(status);
  return current === 'cancelled' ||
    ((current === 'checked_in' || current === 'transfer_nearby_notified') && !adminBypass) ||
    current === 'arrived_transfer_point' ||
    current === 'arrived_destination' ||
    current === 'waiting_admin_approval' ||
    current === 'pending_admin_approval';
}

function decideCheckinEligibility(input) {
  const policy = Object.assign({}, DEFAULT_CHECKIN_POLICY, input && input.policy || {});
  const now = finiteNumber(input && input.now, Date.now());
  const distanceKm = finiteNumber(input && input.distanceKm, NaN);
  const radiusKm = finiteNumber(input && input.radiusKm, finiteNumber(policy.radiusKm, DEFAULT_CHECKIN_POLICY.radiusKm));
  const adminBypass = !!(input && input.adminBypass);
  const routeType = String(input && input.routeType || '');
  const enteredRadiusAt = finiteNumber(input && input.enteredRadiusAt, 0);
  const insideRadius = Number.isFinite(distanceKm) && distanceKm <= radiusKm;
  const insideWindow = !enteredRadiusAt || now - enteredRadiusAt <= finiteNumber(policy.radiusWindowMs, DEFAULT_CHECKIN_POLICY.radiusWindowMs);
  const lockedStatus = isLockedTicketStatus(input && input.status, adminBypass);
  const serviceEnded = !!(input && input.serviceEnded);
  const submitLocked = !!(input && input.submitLock);
  const routeEligible = routeType === 'secondary_connection';
  const eligibleByRadius = routeEligible && insideRadius && insideWindow;
  const allowed = (adminBypass || eligibleByRadius) && !lockedStatus && !serviceEnded && !submitLocked;
  let reason = 'eligible';
  if (lockedStatus) reason = 'locked_status';
  else if (serviceEnded) reason = 'service_ended';
  else if (submitLocked) reason = 'submit_locked';
  else if (!adminBypass && !routeEligible) reason = 'main_route_no_transfer_checkin';
  else if (!adminBypass && !insideRadius) reason = 'outside_radius';
  else if (!adminBypass && !insideWindow) reason = 'radius_window_expired';
  return {
    allowed,
    reason,
    radiusKm,
    distanceKm: Number.isFinite(distanceKm) ? distanceKm : null,
    insideRadius,
    insideWindow,
    adminBypass,
    routeType
  };
}

function decideTransferFeasibility(input) {
  const policy = Object.assign({}, DEFAULT_TRANSFER_POLICY, input && input.policy || {});
  const waitMinutes = input && input.waitMinutes !== undefined
    ? finiteNumber(input.waitMinutes, NaN)
    : minutesBetweenForward(input && input.arrivalTime, input && input.departureTime);
  const min = finiteNumber(policy.minTransferMinutes, DEFAULT_TRANSFER_POLICY.minTransferMinutes);
  const ideal = finiteNumber(policy.idealWaitMinutes, DEFAULT_TRANSFER_POLICY.idealWaitMinutes);
  const max = finiteNumber(policy.maxWaitMinutes == null ? policy.maxPreferredWaitMinutes : policy.maxWaitMinutes, DEFAULT_TRANSFER_POLICY.maxWaitMinutes);
  const active = !(input && (input.active === false || input.reachable === false));
  let status = 'feasible';
  let reason = 'within_policy';
  if (!Number.isFinite(waitMinutes)) {
    status = 'unknown';
    reason = 'missing_time';
  } else if (!active) {
    status = 'unavailable';
    reason = 'inactive_or_unreachable';
  } else if (waitMinutes < min) {
    status = 'infeasible';
    reason = 'short_wait';
  } else if (waitMinutes > max) {
    status = 'long_wait';
    reason = 'over_max_wait';
  }
  return {
    status,
    feasible: status === 'feasible',
    reason,
    waitMinutes: Number.isFinite(waitMinutes) ? waitMinutes : null,
    minTransferMinutes: min,
    idealWaitMinutes: ideal,
    maxWaitMinutes: max,
    idealDeltaMinutes: Number.isFinite(waitMinutes) ? Math.abs(waitMinutes - ideal) : null
  };
}

function isClosedStop(closedStopsByTime, time, destinationStopKey) {
  const closed = closedStopsByTime && closedStopsByTime[time];
  if (!Array.isArray(closed)) return false;
  return closed.includes('__route__') || closed.includes('*') || closed.includes(destinationStopKey);
}

function decideBookingAvailability(input) {
  const policy = Object.assign({}, DEFAULT_BOOKING_POLICY, input && input.policy || {});
  const bookingOpen = input && input.bookingOpen !== undefined ? input.bookingOpen !== false : policy.bookingOpen !== false;
  const time = String(input && input.time || '').slice(0, 5);
  const serviceDate = input && input.serviceDate;
  const now = finiteNumber(input && input.now, Date.now());
  const disabledTimes = Array.isArray(input && input.disabledTimes) ? input.disabledTimes : [];
  const destinationStopKey = String(input && input.destinationStopKey || '');
  const closed = isClosedStop(input && input.closedStopsByTime, time, destinationStopKey);
  const departureMs = serviceDateTimeMs(serviceDate, time);
  const cutoffMinutes = finiteNumber(input && input.cutoffMinutes, finiteNumber(policy.cutoffMinutes, DEFAULT_BOOKING_POLICY.cutoffMinutes));
  const requestedSeats = Math.max(1, finiteNumber(input && input.requestedSeats, 1));
  const bookedSeats = Math.max(0, finiteNumber(input && input.bookedSeats, 0));
  const capacity = finiteNumber(input && input.capacity, 0);
  const seatsLeft = capacity > 0 ? Math.max(0, capacity - bookedSeats) : null;
  const departurePast = departureMs !== null && departureMs <= now;
  const cutoffClosed = departureMs !== null && (departureMs - now) / 60000 <= cutoffMinutes;
  const full = capacity > 0 && bookedSeats + requestedSeats > capacity;
  let reason = 'available';
  if (!bookingOpen) reason = 'booking_closed';
  else if (!time || departureMs === null) reason = 'invalid_departure_time';
  else if (disabledTimes.includes(time)) reason = 'disabled_time';
  else if (closed) reason = 'closed_stop';
  else if (departurePast) reason = 'departure_past';
  else if (cutoffClosed) reason = 'cutoff_closed';
  else if (full) reason = 'capacity_full';
  return {
    available: reason === 'available',
    reason,
    time,
    serviceDate,
    cutoffMinutes,
    requestedSeats,
    bookedSeats,
    capacity,
    seatsLeft,
    disabledTime: disabledTimes.includes(time),
    closedStop: closed
  };
}

function classifyEtaSource(input) {
  const policy = Object.assign({}, DEFAULT_ETA_POLICY, input && input.policy || {});
  const now = finiteNumber(input && input.now, Date.now());
  const live = input && input.liveVehicle || null;
  const schedule = input && input.scheduleEstimate || null;
  const scheduleOnly = !!(input && input.scheduleOnly);
  const liveDisabled = !!(input && input.noLiveTracking);
  const liveTs = finiteNumber(live && (live.gpsTs || live.updatedAt || live.ts), NaN);
  const hasLivePosition = !!(live && Number.isFinite(finiteNumber(live.lat, NaN)) && Number.isFinite(finiteNumber(live.lng == null ? live.lon : live.lng, NaN)));
  const liveFresh = hasLivePosition && Number.isFinite(liveTs) && now - liveTs <= finiteNumber(policy.freshGpsMaxAgeMs, DEFAULT_ETA_POLICY.freshGpsMaxAgeMs);
  if (!scheduleOnly && !liveDisabled && liveFresh) {
    return {
      source: 'live_gps',
      status: 'available',
      reason: 'fresh_live_vehicle',
      etaMinutes: live.etaMinutes === undefined ? null : finiteNumber(live.etaMinutes, null),
      vehicleId: live.vehicleId || live.carId || ''
    };
  }
  if (schedule && (schedule.referenceOnly === true || schedule.etaMinutes !== undefined || schedule.time)) {
    return {
      source: 'schedule_estimate',
      status: 'reference_only',
      reason: scheduleOnly || liveDisabled ? 'schedule_only_or_no_live_tracking' : 'live_gps_unavailable',
      etaMinutes: schedule.etaMinutes === undefined ? null : finiteNumber(schedule.etaMinutes, null),
      time: schedule.time || '',
      vehicleId: ''
    };
  }
  return {
    source: 'unavailable',
    status: 'unavailable',
    reason: scheduleOnly || liveDisabled ? 'schedule_only_without_estimate' : 'no_fresh_live_gps_or_schedule',
    etaMinutes: null,
    vehicleId: ''
  };
}

function countBy(items, field) {
  return items.reduce((acc, item) => {
    const key = String(item[field]);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildErpLogicCenterDryRun() {
  const now = new Date('2026-07-12T10:00:00').getTime();
  const checkinDecisions = [
    decideCheckinEligibility({ routeType: 'secondary_connection', status: 'confirmed', distanceKm: 2.1, enteredRadiusAt: now - 60000, now }),
    decideCheckinEligibility({ routeType: 'secondary_connection', status: 'confirmed', distanceKm: 2.9, now }),
    decideCheckinEligibility({ routeType: 'main_route', status: 'confirmed', distanceKm: 1.0, now }),
    decideCheckinEligibility({ routeType: 'secondary_connection', status: 'checked_in', distanceKm: 1.0, now })
  ];
  const transferDecisions = [
    decideTransferFeasibility({ arrivalTime: '10:00', departureTime: '10:30' }),
    decideTransferFeasibility({ arrivalTime: '10:00', departureTime: '10:10' }),
    decideTransferFeasibility({ arrivalTime: '10:00', departureTime: '11:20' }),
    decideTransferFeasibility({ arrivalTime: '', departureTime: '11:00' })
  ];
  const bookingDecisions = [
    decideBookingAvailability({ serviceDate: '2026-07-12', time: '12:00', now, capacity: 12, bookedSeats: 4, requestedSeats: 2, destinationStopKey: 'phanom' }),
    decideBookingAvailability({ serviceDate: '2026-07-12', time: '10:30', now, capacity: 12, bookedSeats: 4, requestedSeats: 1 }),
    decideBookingAvailability({ serviceDate: '2026-07-12', time: '12:00', now, disabledTimes: ['12:00'], capacity: 12 }),
    decideBookingAvailability({ serviceDate: '2026-07-12', time: '12:00', now, closedStopsByTime: { '12:00': ['phanom'] }, destinationStopKey: 'phanom', capacity: 12 }),
    decideBookingAvailability({ serviceDate: '2026-07-12', time: '12:00', now, capacity: 5, bookedSeats: 4, requestedSeats: 2 })
  ];
  const etaDecisions = [
    classifyEtaSource({ now, liveVehicle: { vehicleId: 'veh_001', lat: 13.6, lng: 101.1, gpsTs: now - 30000, etaMinutes: 8 } }),
    classifyEtaSource({ now, scheduleOnly: true, scheduleEstimate: { referenceOnly: true, time: '12:00', etaMinutes: 35 } }),
    classifyEtaSource({ now, liveVehicle: { vehicleId: 'veh_002', lat: 13.6, lng: 101.1, gpsTs: now - 600000 } })
  ];
  const samples = {
    checkin: checkinDecisions,
    transfer: transferDecisions,
    bookingAvailability: bookingDecisions,
    etaSource: etaDecisions
  };
  const counts = {
    checkin: countBy(checkinDecisions, 'reason'),
    transfer: countBy(transferDecisions, 'status'),
    bookingAvailability: countBy(bookingDecisions, 'reason'),
    etaSource: countBy(etaDecisions, 'source')
  };
  return {
    dryRun: true,
    writesEnabled: false,
    readyForApply: false,
    productionApply: false,
    targetPath: null,
    scope: 'pure_erp_logic_center_decision_helpers',
    counts,
    samples,
    validation: {
      readyForReview: true,
      readyForApply: false,
      blockers: [],
      warnings: []
    }
  };
}

module.exports = {
  DEFAULT_CHECKIN_POLICY,
  DEFAULT_TRANSFER_POLICY,
  DEFAULT_BOOKING_POLICY,
  DEFAULT_ETA_POLICY,
  parseTimeToMinutes,
  minutesBetweenForward,
  decideCheckinEligibility,
  decideTransferFeasibility,
  decideBookingAvailability,
  classifyEtaSource,
  buildErpLogicCenterDryRun
};

if (require.main === module) {
  console.log(JSON.stringify(buildErpLogicCenterDryRun(), null, 2));
}
