(function(global) {
  'use strict';

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function numberOrBlank(value) {
    var number = Number(value || 0);
    return isFinite(number) && number > 0 ? number : '';
  }

  function buildBookingAssignmentContract(input) {
    input = input || {};
    var resolved = input.resolvedAssignment || {};
    var scheduleOnly = resolved.scheduleOnly === true
      || resolved.noLiveTracking === true
      || resolved.serviceType === 'schedule-only';
    var queueNo = numberOrBlank(resolved.queueNo);
    var plannedVehicleId = clean(resolved.plannedVehicleId);
    var tripId = clean(input.tripId || resolved.tripId);
    var tripIndex = numberOrBlank(resolved.tripIndex);
    var assignmentSource = clean(resolved.assignmentSource);
    var missing = [];

    if (!scheduleOnly) {
      if (!queueNo) missing.push('queueNo');
      if (!plannedVehicleId) missing.push('plannedVehicleId');
      if (!tripId && !tripIndex) missing.push('tripIdentity');
      if (!assignmentSource) missing.push('assignmentSource');
    }
    if (missing.length) {
      return {
        status: 'missing_assignment_contract',
        assignment: null,
        missing: missing
      };
    }

    var assignment = {
      contractVersion: 'booking_assignment_v1',
      serviceDate: clean(input.serviceDate || resolved.serviceDate),
      routeId: clean(input.routeId || resolved.routeId),
      tripId: tripId,
      queueNo: queueNo,
      plannedVehicleId: scheduleOnly ? '' : plannedVehicleId,
      driverId: clean(resolved.driverId),
      tripIndex: tripIndex,
      departTime: clean(resolved.departTime || input.departTime).slice(0, 5),
      pickupTime: clean(resolved.pickupTime || input.departTime).slice(0, 5),
      pickupStopKey: clean(resolved.pickupStopKey),
      pickupStopName: clean(resolved.pickupStopName || input.originName),
      routeDirection: clean(resolved.routeDirection),
      routeStops: Array.isArray(resolved.routeStops) ? resolved.routeStops.slice() : [],
      routeStopNames: Array.isArray(resolved.routeStopNames) ? resolved.routeStopNames.slice() : [],
      serviceType: scheduleOnly ? 'schedule-only' : clean(resolved.serviceType || 'normal'),
      scheduleOnly: scheduleOnly,
      noLiveTracking: scheduleOnly,
      assignmentSource: assignmentSource || 'published_schedule_only'
    };

    return {
      status: scheduleOnly ? 'schedule_only' : 'ready',
      assignment: assignment,
      missing: []
    };
  }

  global.SLTransitBookingAssignmentCenter = {
    buildBookingAssignmentContract: buildBookingAssignmentContract
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitBookingAssignmentCenter;
})(typeof window !== 'undefined' ? window : globalThis);
