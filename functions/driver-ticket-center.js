"use strict";

function clean(value) {
  return String(value == null ? "" : value).trim();
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

module.exports = {
  plannedVehicleId,
  serviceDate,
  driverTicketPath,
  buildDriverTicket,
  buildDriverTicketMirrorUpdate,
  shouldPublishDriverTicket
};
