const crypto = require("crypto");

const CONTRACT_VERSION = "ticket_access_v1";
const CANCELLATION_CONTRACT_VERSION = "ticket_action_center_cancel_v1";
const ALLOWED_ORIGINS = new Set(["https://sl-transit.com", "https://www.sl-transit.com"]);

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function normalizeCode(value) {
  const code = clean(value).toUpperCase();
  return /^BK[A-Z0-9_-]{6,20}$/.test(code) || /^TB\d{6}$/.test(code) ? code : "";
}

function normalizeToken(value) {
  const token = clean(value);
  return /^[A-Za-z0-9_-]{32,160}$/.test(token) ? token : "";
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

function originAllowed(origin, emulator) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (emulator && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(origin || ""))) return true;
  return false;
}

function minimalTicket(booking, code) {
  const row = booking || {};
  return {
    code,
    bookingCode: code,
    status: clean(row.status),
    officialStatus: clean(row.officialStatus),
    date: clean(row.date || row.serviceDate),
    serviceDate: clean(row.serviceDate || row.date),
    time: clean(row.time || row.pickupTime),
    pickupTime: clean(row.pickupTime || row.time),
    origin: clean(row.origin),
    destination: clean(row.destination),
    route: clean(row.route),
    routeId: clean(row.routeId),
    tripId: clean(row.tripId),
    pax: Number(row.pax || row.seats || 0),
    seats: Number(row.seats || row.pax || 0),
    price: Number(row.price || row.total || 0),
    fare: Number(row.fare || row.fareAmount || 0),
    serviceFee: Number(row.serviceFee || row.serviceFeeAmount || 0),
    queueNo: clean(row.queueNo || row.queueId),
    vehicleId: clean(row.vehicleId || row.plannedVehicleId || (row.assignment && (row.assignment.vehicleId || row.assignment.plannedVehicleId))),
    assignment: row.assignment ? {
      vehicleId: clean(row.assignment.vehicleId || row.assignment.plannedVehicleId),
      plannedVehicleId: clean(row.assignment.plannedVehicleId || row.assignment.vehicleId),
      queueId: clean(row.assignment.queueId || row.assignment.queueNo),
      queueNo: clean(row.assignment.queueNo || row.assignment.queueId),
      driverId: clean(row.assignment.driverId)
    } : null,
    capacity: row.capacity ? {
      counterPath: clean(row.capacity.counterPath),
      bookingCode: clean(row.capacity.bookingCode || code),
      requestedSeats: Number(row.capacity.requestedSeats || row.seats || row.pax || 1)
    } : null,
    cancelledAt: Number(row.cancelledAt || 0) || null,
    ticketActionContract: clean(row.ticketActionContract),
    ticketAccessContractVersion: clean(row.ticketAccessContractVersion || CONTRACT_VERSION)
  };
}

function verifyTicketAccess(booking, token) {
  const expected = clean(booking && booking.ticketAccessTokenHash);
  if (!expected || !/^[a-f0-9]{64}$/i.test(expected)) {
    const err = new Error("blocked_legacy_ticket_access_token_missing");
    err.httpStatus = 403;
    err.publicCode = "blocked_legacy_ticket_access_token_missing";
    throw err;
  }
  const got = tokenHash(token);
  const ok = crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(got, "hex"));
  if (!ok) {
    const err = new Error("ticket_access_denied");
    err.httpStatus = 403;
    err.publicCode = "ticket_access_denied";
    throw err;
  }
}

function departureMs(booking) {
  const day = clean(booking && (booking.date || booking.serviceDate));
  const time = clean(booking && (booking.time || booking.pickupTime)).slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const ms = Date.parse(`${day}T${time}:00+07:00`);
  return Number.isFinite(ms) ? ms : null;
}

function evaluateCancellation(booking, nowMs) {
  if (!booking) return { allowed: false, reason: "missing_booking" };
  if (clean(booking.status).toLowerCase() === "cancelled" && booking.cancelledAt) {
    return { allowed: false, reason: "already_cancelled", idempotent: true };
  }
  const dep = departureMs(booking);
  if (!dep) return { allowed: false, reason: "missing_departure_time" };
  if (dep - Number(nowMs || Date.now()) < 60 * 60000) return { allowed: false, reason: "too_close_to_departure" };
  return { allowed: true, reason: "eligible" };
}

async function releaseCapacityOnce(db, booking, code) {
  const capacity = booking && booking.capacity;
  if (!capacity || !capacity.counterPath) return { status: "skipped", reason: "missing_capacity_contract" };
  const requestedSeats = Math.max(1, Number(capacity.requestedSeats || booking.seats || booking.pax || 1));
  let removed = false;
  try {
    const tx = await db.ref(capacity.counterPath).transaction((current) => {
      if (!current || typeof current !== "object") return current;
      const bookings = Object.assign({}, current.bookings || {});
      const bookingKey = clean(capacity.bookingCode || code);
      if (!bookings[bookingKey]) return current;
      removed = true;
      delete bookings[bookingKey];
      const bookedSeats = Math.max(0, Number(current.bookedSeats || 0) - requestedSeats);
      return Object.assign({}, current, {
        bookings,
        bookedSeats,
        seatsAvailable: Math.max(0, Number(current.capacityLimit || 0) - bookedSeats)
      });
    });
    return tx && tx.committed && removed ? { status: "released" } : { status: "idempotent_noop" };
  } catch (err) {
    return { status: "failed_retriable" };
  }
}

module.exports = {
  CONTRACT_VERSION,
  CANCELLATION_CONTRACT_VERSION,
  normalizeCode,
  normalizeToken,
  tokenHash,
  originAllowed,
  minimalTicket,
  verifyTicketAccess,
  evaluateCancellation,
  releaseCapacityOnce
};
