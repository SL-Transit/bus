(function(global) {
  'use strict';

  var ASSIGNMENT_MODES = ['rotation', 'fixed', 'manual_override'];

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function numberOrNull(value) {
    var number = Number(value);
    return isFinite(number) ? number : null;
  }

  function normalizeStop(stop, index) {
    stop = stop || {};
    var lat = numberOrNull(stop.lat);
    var lng = numberOrNull(stop.lng == null ? stop.lon : stop.lng);
    if (!clean(stop.stopKey || stop.groupStopId) || !clean(stop.stopNameTh) || !clean(stop.time) || lat === null || lng === null) return null;
    return {
      sequence: Number(stop.sequence || index + 1),
      groupStopId: clean(stop.groupStopId),
      stopKey: clean(stop.stopKey || stop.groupStopId),
      stopNameTh: clean(stop.stopNameTh),
      time: clean(stop.time).slice(0, 5),
      eventType: clean(stop.eventType),
      isConditional: stop.isConditional === true,
      lat: lat,
      lng: lng
    };
  }

  function normalizeTrip(trip) {
    if (!trip) return null;
    var rawStops = Array.isArray(trip.orderedStops) ? trip.orderedStops : [];
    var stops = rawStops
      .map(normalizeStop)
      .filter(Boolean)
      .sort(function(a, b) { return a.sequence - b.sequence; });
    if (!clean(trip.queueTripId) || !clean(trip.routeId) || !clean(trip.routeSequenceVersionId)
        || stops.length < 2 || stops.length !== rawStops.length) return null;
    return {
      queueTripId: clean(trip.queueTripId),
      tripNo: clean(trip.tripNo || trip.queueTripId),
      routeId: clean(trip.routeId),
      routeNameTh: clean(trip.routeNameTh),
      routeDirection: clean(trip.routeDirection),
      routeSequenceVersionId: clean(trip.routeSequenceVersionId),
      orderedStops: stops
    };
  }

  function buildDriverWorkContract(input) {
    input = input || {};
    var status = clean(input.status || 'assigned');
    var serviceDate = clean(input.serviceDate);
    var vehicleId = clean(input.vehicleId);
    var erpVehicleId = clean(input.erpVehicleId);
    if (!serviceDate || !vehicleId || !erpVehicleId) return { status: 'invalid_contract', contract: null };
    if (status === 'unassigned') {
      return {
        status: 'unassigned',
        contract: {
          contractVersion: 'driver_work_v1',
          status: 'unassigned',
          serviceDate: serviceDate,
          vehicleId: vehicleId,
          erpVehicleId: erpVehicleId
        }
      };
    }

    var assignmentMode = clean(input.assignmentMode);
    var currentTrip = normalizeTrip(input.currentTrip);
    var nextTrip = normalizeTrip(input.nextTrip);
    var allTrips = Array.isArray(input.allTrips)
      ? input.allTrips.map(normalizeTrip).filter(Boolean)
      : [];
    var serviceComplete = status === 'service_complete';
    if (!clean(input.assignmentId) || !clean(input.queueId) || !Number(input.queueNo)
        || ASSIGNMENT_MODES.indexOf(assignmentMode) === -1
        || (!serviceComplete && !currentTrip && !nextTrip && !allTrips.length)) {
      return { status: 'invalid_contract', contract: null };
    }

    return {
      status: serviceComplete ? 'service_complete' : 'ready',
      contract: {
        contractVersion: 'driver_work_v1',
        status: serviceComplete ? 'service_complete' : 'assigned',
        serviceDate: serviceDate,
        vehicleId: vehicleId,
        erpVehicleId: erpVehicleId,
        assignmentId: clean(input.assignmentId),
        assignmentMode: assignmentMode,
        queueId: clean(input.queueId),
        queueNo: Number(input.queueNo),
        queueScheduleVersionId: clean(input.queueScheduleVersionId),
        currentTrip: currentTrip,
        nextTrip: nextTrip,
        allTrips: allTrips
      }
    };
  }

  global.SLTransitDriverWorkCenter = {
    buildDriverWorkContract: buildDriverWorkContract,
    normalizeTrip: normalizeTrip
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitDriverWorkCenter;
})(typeof window !== 'undefined' ? window : globalThis);
