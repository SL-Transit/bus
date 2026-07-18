'use strict';

const driverWorkCenter = require('./driver-work-center.js');

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function values(value) {
  return Object.values(value || {});
}

function timeMinutes(value) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function runtimeVehicleId(vehicle) {
  return Array.isArray(vehicle.legacyAliases) ? clean(vehicle.legacyAliases[0]) : '';
}

function buildTrip(erp, queueTrip) {
  const route = (erp.routes || {})[queueTrip.routeId] || {};
  const sequenceVersion = (erp.routeSequenceVersions || {})[queueTrip.routeSequenceVersionId] || {};
  const groupStops = erp.groupStops || {};
  const orderedStops = (queueTrip.orderedStopTimes || []).map((stopTime) => {
    const stop = groupStops[stopTime.groupStopId] || {};
    return {
      sequence: stopTime.sequence,
      groupStopId: stopTime.groupStopId,
      stopKey: stop.groupStopCode || stopTime.groupStopCode || stopTime.groupStopId,
      stopNameTh: stop.displayNameTh,
      time: clean(stopTime.time).slice(0, 5),
      eventType: stopTime.stopRole,
      isConditional: stopTime.conditionalWaitingPoint === true,
      lat: stop.lat,
      lng: stop.lng
    };
  });
  return {
    queueTripId: queueTrip.queueTripId,
    tripNo: queueTrip.legacyPublishedTripId || queueTrip.queueTripId,
    routeId: queueTrip.routeId,
    routeNameTh: route.displayNameTh,
    routeDirection: sequenceVersion.direction,
    routeSequenceVersionId: queueTrip.routeSequenceVersionId,
    orderedStops
  };
}

function selectTrips(trips, currentTime) {
  const now = timeMinutes(currentTime);
  if (now === null) return null;
  const timed = trips.map((trip) => {
    const stops = trip.orderedStops || [];
    return {
      trip,
      start: stops.length ? timeMinutes(stops[0].time) : null,
      end: stops.length ? timeMinutes(stops[stops.length - 1].time) : null
    };
  }).filter((item) => item.start !== null && item.end !== null).sort((a, b) => a.start - b.start);
  const active = timed.find((item) => item.start <= now && now <= item.end) || null;
  const next = timed.find((item) => item.start > now) || null;
  return { currentTrip: active && active.trip, nextTrip: next && next.trip };
}

function assignmentForVehicle(erp, vehicle, dailyAssignments, manualOverrides, serviceDate) {
  const erpVehicleId = vehicle.vehicleId;
  const override = (manualOverrides || {})[erpVehicleId];
  if (override) {
    return {
      assignmentId: clean(override.assignmentId),
      assignmentMode: 'manual_override',
      queueId: clean(override.queueId)
    };
  }
  const fixedRule = values(erp.fleet && erp.fleet.assignmentRules)
    .find((rule) => rule.assignmentMode === 'fixed' && rule.vehicleId === erpVehicleId);
  if (fixedRule) {
    return {
      assignmentId: `fixed_${serviceDate.replace(/-/g, '')}_${erpVehicleId}`,
      assignmentMode: 'fixed',
      queueId: fixedRule.queueId
    };
  }
  const daily = (dailyAssignments || {})[erpVehicleId];
  if (!daily) return null;
  return {
    assignmentId: clean(daily.assignmentId),
    assignmentMode: 'rotation',
    queueId: clean(daily.queueId)
  };
}

function assignmentAllowed(erp, erpVehicleId, assignment) {
  const rules = values(erp.fleet && erp.fleet.assignmentRules);
  if (assignment.assignmentMode === 'manual_override') {
    return rules.some((rule) => rule.manualOverrideSupported === true
      && (rule.vehicleId === erpVehicleId
        || (Array.isArray(rule.vehicleIds) && rule.vehicleIds.includes(erpVehicleId))));
  }
  if (assignment.assignmentMode === 'fixed') {
    return rules.some((rule) => rule.assignmentMode === 'fixed'
      && rule.vehicleId === erpVehicleId && rule.queueId === assignment.queueId);
  }
  return rules.some((rule) => rule.assignmentMode === 'rotation'
    && Array.isArray(rule.vehicleIds) && rule.vehicleIds.includes(erpVehicleId)
    && Array.isArray(rule.queueIds) && rule.queueIds.includes(assignment.queueId));
}

function buildDriverWorkDay(input) {
  input = input || {};
  const erp = input.erpDataCenter || {};
  const serviceDate = clean(input.serviceDate);
  const currentTime = clean(input.currentTime);
  const fleet = erp.fleet || {};
  const vehicles = values(fleet.vehicles).sort((a, b) => clean(a.vehicleId).localeCompare(clean(b.vehicleId)));
  const queues = fleet.queues || {};
  const queueTrips = values(fleet.queueTrips);
  const contractsByRuntimeVehicleId = {};
  const blockers = [];
  const claimedQueues = {};
  const counts = { ready: 0, unassigned: 0, serviceComplete: 0, fixed: 0, rotation: 0, manualOverride: 0 };

  if (!serviceDate || timeMinutes(currentTime) === null) {
    return {
      dryRun: true,
      writesEnabled: false,
      readyForApply: false,
      targetPath: serviceDate ? `operations/driverWorkByServiceDate/${serviceDate}` : null,
      contractsByRuntimeVehicleId,
      blockers: [{ code: 'invalid_service_clock', serviceDate, currentTime }],
      counts
    };
  }

  vehicles.forEach((vehicle) => {
    const erpVehicleId = clean(vehicle.vehicleId);
    const vehicleId = runtimeVehicleId(vehicle);
    if (!vehicleId) {
      blockers.push({ code: 'missing_runtime_vehicle_alias', erpVehicleId });
      return;
    }
    const assignment = assignmentForVehicle(erp, vehicle, input.dailyAssignments, input.manualOverrides, serviceDate);
    if (!assignment) {
      const result = driverWorkCenter.buildDriverWorkContract({ status: 'unassigned', serviceDate, vehicleId, erpVehicleId });
      contractsByRuntimeVehicleId[vehicleId] = result.contract;
      counts.unassigned += 1;
      blockers.push({ code: 'missing_daily_assignment', erpVehicleId, vehicleId });
      return;
    }
    const queue = queues[assignment.queueId];
    if (!queue || !assignment.assignmentId || !assignmentAllowed(erp, erpVehicleId, assignment)) {
      blockers.push({ code: 'invalid_daily_assignment', erpVehicleId, vehicleId, queueId: assignment.queueId });
      return;
    }
    if (claimedQueues[queue.queueId]) {
      blockers.push({
        code: 'duplicate_queue_assignment',
        erpVehicleId,
        vehicleId,
        queueId: queue.queueId,
        conflictingErpVehicleId: claimedQueues[queue.queueId]
      });
      return;
    }
    claimedQueues[queue.queueId] = erpVehicleId;
    const sourceTrips = queueTrips.filter((trip) => trip.queueId === queue.queueId);
    const trips = sourceTrips.map((trip) => buildTrip(erp, trip));
    const selected = selectTrips(trips, currentTime);
    if (!selected || !trips.length) {
      blockers.push({ code: 'queue_schedule_unavailable', erpVehicleId, vehicleId, queueId: queue.queueId });
      return;
    }
    const serviceComplete = !selected.currentTrip && !selected.nextTrip;
    const result = driverWorkCenter.buildDriverWorkContract({
      status: serviceComplete ? 'service_complete' : 'assigned',
      serviceDate,
      vehicleId,
      erpVehicleId,
      assignmentId: assignment.assignmentId,
      assignmentMode: assignment.assignmentMode,
      queueId: queue.queueId,
      queueNo: queue.legacyQueueNo,
      queueScheduleVersionId: sourceTrips[0] && sourceTrips[0].queueScheduleVersionId,
      currentTrip: selected.currentTrip,
      nextTrip: selected.nextTrip,
      allTrips: trips
    });
    if (!result.contract) {
      blockers.push({ code: 'driver_work_contract_invalid', erpVehicleId, vehicleId, queueId: queue.queueId });
      return;
    }
    contractsByRuntimeVehicleId[vehicleId] = result.contract;
    counts[result.status === 'service_complete' ? 'serviceComplete' : 'ready'] += 1;
    counts[assignment.assignmentMode === 'manual_override' ? 'manualOverride' : assignment.assignmentMode] += 1;
  });

  return {
    dryRun: true,
    writesEnabled: false,
    readyForApply: false,
    targetPath: `operations/driverWorkByServiceDate/${serviceDate}`,
    contractsByRuntimeVehicleId,
    blockers,
    counts
  };
}

module.exports = {
  buildDriverWorkDay,
  buildTrip,
  selectTrips,
  timeMinutes,
  assignmentAllowed
};
