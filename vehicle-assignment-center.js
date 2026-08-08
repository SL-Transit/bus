(function(global) {
  'use strict';

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalizePoint(vehicle) {
    vehicle = vehicle || {};
    var lat = Number(vehicle.lat);
    var lng = Number(vehicle.lng == null ? vehicle.lon : vehicle.lng);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return Object.assign({}, vehicle, { lat: lat, lng: lng });
  }

  function plannedVehicleIdForBooking(booking, assignment) {
    booking = booking || {};
    assignment = assignment || {};
    return clean(assignment.plannedVehicleId || booking.plannedVehicleId);
  }

  function selectBookedVehicle(input) {
    input = input || {};
    var booking = input.booking || {};
    var buses = input.vehicles || input.buses || {};
    var assignment = input.assignment || {};
    if (input.scheduleOnly === true || assignment.scheduleOnly === true || assignment.noLiveTracking === true || assignment.serviceType === 'schedule-only') {
      return { id: '', vehicleId: '', vehicle: null, location: null, status: 'schedule_only' };
    }
    var vehicleId = plannedVehicleIdForBooking(booking, assignment);
    if (!vehicleId) return { id: '', vehicleId: '', vehicle: null, location: null, status: 'missing_assignment_contract' };
    var vehicle = buses[vehicleId] || null;
    var location = normalizePoint(vehicle);
    var isActive = typeof input.isActiveVehicle === 'function'
      ? input.isActiveVehicle(vehicleId, vehicle)
      : !!location;
    if (!vehicle || !location || !isActive) {
      return { id: vehicleId, vehicleId: vehicleId, vehicle: vehicle || null, location: null, status: 'missing_assigned_vehicle' };
    }
    return { id: vehicleId, vehicleId: vehicleId, vehicle: vehicle, location: location, status: 'ready' };
  }

  global.SLTransitVehicleAssignmentCenter = {
    plannedVehicleIdForBooking: plannedVehicleIdForBooking,
    selectBookedVehicle: selectBookedVehicle
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitVehicleAssignmentCenter;
})(typeof window !== 'undefined' ? window : globalThis);
