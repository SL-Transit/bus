"use strict";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeLabel(value) {
  return clean(value)
    .replace(/\s+/g, "")
    .replace(/[()]/g, "");
}

function timeText(value) {
  return clean(value).slice(0, 5);
}

function assignmentSource(booking) {
  const assignment = booking && booking.assignment || {};
  return assignment.contractVersion === "booking_assignment_v1" ? assignment : booking || {};
}

function plannedVehicleId(booking) {
  return clean(assignmentSource(booking).plannedVehicleId);
}

function serviceDate(booking) {
  return clean((booking && booking.date) || (booking && booking.serviceDate));
}

function bookingCode(code, booking) {
  return clean(code || (booking && booking.code) || (booking && booking.bookingCode)).toUpperCase();
}

function shouldPublishDriverTicket(booking) {
  if (!booking || typeof booking !== "object") return false;
  if (booking.cancelled === true || clean(booking.status) === "cancelled") return false;
  const source = assignmentSource(booking);
  if (source.scheduleOnly === true || source.noLiveTracking === true) return false;
  return !!(serviceDate(booking) && plannedVehicleId(booking));
}

function driverTicketPath(code, booking) {
  const date = serviceDate(booking);
  const vehicle = plannedVehicleId(booking);
  const id = bookingCode(code, booking);
  if (!date || !vehicle || !id) return "";
  return `operations/driverTicketsByServiceDate/${date}/${vehicle}/${id}`;
}

function buildDriverTicket(code, booking) {
  if (!shouldPublishDriverTicket(booking)) return null;
  const source = assignmentSource(booking);
  const id = bookingCode(code, booking);
  return {
    code: id,
    bookingCode: id,
    date: serviceDate(booking),
    plannedVehicleId: plannedVehicleId(booking),
    name: clean(booking.name),
    phone: clean(booking.phone),
    seats: booking.seats == null ? booking.pax || 1 : booking.seats,
    pax: booking.pax == null ? booking.seats || 1 : booking.pax,
    time: clean(booking.time || booking.pickupTime || booking.departTime),
    route: clean(booking.route),
    origin: clean(booking.origin),
    destination: clean(booking.destination),
    status: clean(booking.status || "awaiting_payment"),
    paymentStatus: clean(booking.paymentStatus),
    assignment: booking.assignment || null,
    queueNo: source.queueNo || booking.queueNo || "",
    originCheckin: booking.originCheckin || { status: "pending", identityVerified: false },
    passengerIdentity: booking.passengerIdentity || { status: "pending", verifiedBy: "", vehicleId: "" },
    updatedAt: booking.updatedAt || booking.ts || Date.now()
  };
}

function buildDriverTicketMirrorUpdate(code, before, after) {
  const updates = {};
  const beforePath = before && driverTicketPath(code, before);
  const afterTicket = buildDriverTicket(code, after);
  const afterPath = afterTicket && driverTicketPath(code, afterTicket);
  if (beforePath && beforePath !== afterPath) updates[beforePath] = null;
  if (afterPath) updates[afterPath] = afterTicket;
  return updates;
}

function normalizeGroupStops(groupStops) {
  if (!groupStops || typeof groupStops !== "object") return {};
  const result = {};
  Object.keys(groupStops).forEach((key) => {
    const stop = groupStops[key] || {};
    [
      key,
      stop.groupStopId,
      stop.groupStopCode,
      stop.stopKey,
      stop.workbookStopKey,
      stop.nodeId
    ].map(clean).filter(Boolean).forEach((id) => {
      result[id] = stop;
    });
  });
  return result;
}

function stopLabelCandidates(stop, groupStopsById) {
  stop = stop || {};
  const groupStop = groupStopsById && (
    groupStopsById[clean(stop.groupStopId)] ||
    groupStopsById[clean(stop.groupStopCode)] ||
    groupStopsById[clean(stop.stopKey)] ||
    groupStopsById[clean(stop.nodeId)]
  ) || {};
  return [
    stop.stopNameTh,
    stop.stopName,
    stop.label,
    stop.stopKey,
    stop.groupStopId,
    stop.groupStopCode,
    groupStop.displayNameTh,
    groupStop.label,
    groupStop.stopKey,
    groupStop.workbookStopKey,
    groupStop.groupStopCode,
    groupStop.groupStopId,
    groupStop.nodeId
  ].concat(Array.isArray(groupStop.aliases) ? groupStop.aliases : [])
    .map(normalizeLabel)
    .filter(Boolean);
}

function stopMatches(stop, label, groupStopsById) {
  const expected = normalizeLabel(label);
  if (!expected) return false;
  return stopLabelCandidates(stop, groupStopsById).some((actual) => {
    return actual === expected || actual.includes(expected) || expected.includes(actual);
  });
}

function findTripMatch(workByVehicle, booking, groupStops) {
  const targetTime = timeText(booking && (booking.time || booking.pickupTime || booking.departTime));
  const origin = clean(booking && (booking.origin || booking.originName || booking.originStopKey));
  const destination = clean(booking && (booking.destination || booking.destName || booking.destStopKey));
  if (!workByVehicle || !targetTime || !origin || !destination) return null;
  const groupStopsById = normalizeGroupStops(groupStops);

  const vehicleIds = Object.keys(workByVehicle).sort();
  for (const vehicleId of vehicleIds) {
    const work = workByVehicle[vehicleId] || {};
    const trips = Array.isArray(work.allTrips) ? work.allTrips : [];
    for (const trip of trips) {
      const stops = Array.isArray(trip.orderedStops) ? trip.orderedStops : [];
      const originIndex = stops.findIndex((stop) => {
        return timeText(stop && stop.time) === targetTime && stopMatches(stop, origin, groupStopsById);
      });
      if (originIndex < 0) continue;
      const destinationIndex = stops.findIndex((stop, index) => {
        return index > originIndex && stopMatches(stop, destination, groupStopsById);
      });
      if (destinationIndex < 0) continue;
      return { vehicleId, work, trip, originIndex, destinationIndex };
    }
  }
  return null;
}

function assignmentFromWorkMatch(booking, match) {
  if (!match) return null;
  const work = match.work || {};
  const trip = match.trip || {};
  const stops = Array.isArray(trip.orderedStops) ? trip.orderedStops : [];
  const originStop = stops[match.originIndex] || {};
  return {
    contractVersion: "booking_assignment_v1",
    serviceDate: serviceDate(booking),
    routeId: clean(trip.routeId),
    tripId: clean(trip.tripNo || trip.queueTripId),
    queueNo: work.queueNo || "",
    plannedVehicleId: clean(work.vehicleId || match.vehicleId),
    driverId: clean(work.driverId),
    tripIndex: "",
    departTime: timeText(originStop.time || booking.time || booking.departTime),
    pickupTime: timeText(originStop.time || booking.pickupTime || booking.time),
    pickupStopKey: clean(originStop.stopKey),
    pickupStopName: clean(originStop.stopNameTh || booking.origin),
    routeDirection: clean(trip.routeDirection),
    routeStops: stops.map((stop) => clean(stop.stopKey)).filter(Boolean),
    routeStopNames: stops.map((stop) => clean(stop.stopNameTh)).filter(Boolean),
    serviceType: "normal",
    scheduleOnly: false,
    noLiveTracking: false,
    assignmentSource: "driver_work_by_service_date"
  };
}

function enrichBookingFromDriverWork(booking, workByVehicle, groupStops) {
  if (!booking || typeof booking !== "object") return booking;
  if (plannedVehicleId(booking)) return booking;
  const match = findTripMatch(workByVehicle, booking, groupStops);
  const assignment = assignmentFromWorkMatch(booking, match);
  if (!assignment) return booking;
  return Object.assign({}, booking, {
    assignment,
    assignmentSource: assignment.assignmentSource,
    plannedVehicleId: assignment.plannedVehicleId,
    vehicleId: assignment.plannedVehicleId,
    queueNo: assignment.queueNo,
    routeId: assignment.routeId || booking.routeId || "",
    tripId: assignment.tripId || booking.tripId || "",
    catalogRouteId: assignment.routeId || booking.catalogRouteId || "",
    catalogTripId: assignment.tripId || booking.catalogTripId || "",
    scheduleOnly: false,
    noLiveTracking: false
  });
}

module.exports = {
  plannedVehicleId,
  serviceDate,
  driverTicketPath,
  buildDriverTicket,
  buildDriverTicketMirrorUpdate,
  shouldPublishDriverTicket,
  enrichBookingFromDriverWork,
  findTripMatch,
  normalizeGroupStops
};
