(function(global) {
  'use strict';

  function isScheduleOnlyAssignment(value) {
    return !!(value && (value.noLiveTracking || value.scheduleOnly || value.serviceType === 'schedule-only'));
  }

  function isCancelledBooking(booking) {
    return !!(booking && booking.status === 'cancelled');
  }

  function isPastTravelDate(booking, todayKey) {
    var serviceDate = String(booking && booking.date || '');
    return /^\d{4}-\d{2}-\d{2}$/.test(serviceDate) && !!todayKey && serviceDate < todayKey;
  }

  function isServiceEnded(serviceArrivalTs, now, serviceEndAfterMs) {
    now = Number(now || Date.now());
    serviceEndAfterMs = Number(serviceEndAfterMs || 0);
    return !!(serviceArrivalTs && now - Number(serviceArrivalTs) >= serviceEndAfterMs);
  }

  function canCancel(departureTs, now, cutoffMinutes, adminBypass, status) {
    if (adminBypass) return status !== 'cancelled';
    if (!departureTs) return false;
    cutoffMinutes = Number(cutoffMinutes == null ? 60 : cutoffMinutes);
    return Number(departureTs) - Number(now || Date.now()) >= cutoffMinutes * 60000;
  }

  function disabledByStatus(booking, adminBypass) {
    var status = booking && booking.status;
    return !!(status === 'cancelled' ||
      ((status === 'checked_in' || status === 'transfer_nearby_notified') && !adminBypass) ||
      status === 'arrived_transfer_point' ||
      status === 'arrived_destination' ||
      status === 'waiting_admin_approval' ||
      status === 'pending_admin_approval');
  }

  function checkinAvailability(input) {
    input = input || {};
    var adminBypass = input.adminBypass === true;
    var secondaryConnection = input.routeType === 'secondary_connection';
    var nearTransferPoint = input.nearTransferPoint === true;
    var insideWindow = !input.enteredRadiusAt || Number(input.now || Date.now()) - Number(input.enteredRadiusAt) <= Number(input.radiusWindowMs || 3600000);
    var disabled = disabledByStatus(input.booking, adminBypass);
    var canManualCheckin = secondaryConnection && nearTransferPoint && insideWindow;
    return {
      disabledByStatus: disabled,
      canManualCheckin: canManualCheckin,
      canCheck: (adminBypass || canManualCheckin) && !disabled && !input.submitLock && !input.serviceEnded
    };
  }

  global.SLTransitTicketPolicy = {
    isScheduleOnlyAssignment: isScheduleOnlyAssignment,
    isCancelledBooking: isCancelledBooking,
    isPastTravelDate: isPastTravelDate,
    isServiceEnded: isServiceEnded,
    canCancel: canCancel,
    disabledByStatus: disabledByStatus,
    checkinAvailability: checkinAvailability
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitTicketPolicy;
})(typeof window !== 'undefined' ? window : globalThis);
