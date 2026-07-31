const crypto = require("crypto");

const CONTRACT_VERSION = "ticket_access_v1";
const CANCELLATION_CONTRACT_VERSION = "ticket_action_center_cancel_v1";
const ALLOWED_ORIGINS = new Set(["https://sl-transit.com", "https://www.sl-transit.com"]);
const CAPACITY_CONTRACT_VERSION = "booking_capacity_v1";

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
  const price = firstNumber(row.price, row.total);
  const fare = firstNumber(row.fare, row.fareAmount);
  const serviceFee = firstNumber(row.serviceFee, row.serviceFeeAmount);
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
    price,
    fare,
    serviceFee,
    queueNo: clean(row.queueNo || row.queueId),
    vehicleId: clean(row.vehicleId || row.plannedVehicleId || (row.assignment && (row.assignment.vehicleId || row.assignment.plannedVehicleId))),
    assignment: row.assignment ? {
      vehicleId: clean(row.assignment.vehicleId || row.assignment.plannedVehicleId),
      plannedVehicleId: clean(row.assignment.plannedVehicleId || row.assignment.vehicleId),
      queueId: clean(row.assignment.queueId || row.assignment.queueNo),
      queueNo: clean(row.assignment.queueNo || row.assignment.queueId)
    } : null,
    capacity: row.capacity ? {
      requestedSeats: Number(row.capacity.requestedSeats || row.seats || row.pax || 1)
    } : null,
    cancelledAt: Number(row.cancelledAt || 0) || null,
    ticketActionContract: clean(row.ticketActionContract),
    ticketAccessContractVersion: clean(row.ticketAccessContractVersion || CONTRACT_VERSION)
  };
}

function firstNumber() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = Number(arguments[i]);
    if (Number.isFinite(value)) return value;
  }
  return null;
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
  const expiresAt = Number(booking && booking.ticketAccessTokenExpiresAt || 0);
  if (Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() > expiresAt) {
    const err = new Error("ticket_access_denied");
    err.httpStatus = 403;
    err.publicCode = "ticket_access_denied";
    err.internalCode = "ticket_access_token_expired";
    throw err;
  }
  if (booking && booking.ticketAccessTokenRevokedAt) {
    const err = new Error("ticket_access_denied");
    err.httpStatus = 403;
    err.publicCode = "ticket_access_denied";
    err.internalCode = "ticket_access_token_revoked";
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
  const contract = deriveTrustedCapacityContract(booking, code);
  if (!contract.ok) return { status: "failed_retriable", reason: contract.reason };
  const requestedSeats = contract.requestedSeats;
  let removed = false;
  try {
    const tx = await db.ref(contract.path).transaction((current) => {
      if (!current || typeof current !== "object") return current;
      const bookings = Object.assign({}, current.bookings || {});
      if (!bookings[contract.bookingKey]) return current;
      removed = true;
      delete bookings[contract.bookingKey];
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

function safePathSegment(value, max) {
  const text = clean(value);
  return /^[A-Za-z0-9_-]{1,120}$/.test(text) && text.length <= (max || 120) ? text : "";
}

function deriveTrustedCapacityContract(booking, code) {
  const canonicalBookingId = normalizeCode(code || (booking && (booking.code || booking.bookingCode)));
  if (!canonicalBookingId) return { ok: false, reason: "invalid_booking_id" };
  const row = booking || {};
  const capacity = row.capacity || {};
  const serviceDate = clean(row.serviceDate || row.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return { ok: false, reason: "missing_service_date" };
  if (clean(capacity.contractVersion || row.capacityContractVersion) !== CAPACITY_CONTRACT_VERSION) {
    return { ok: false, reason: "missing_trusted_capacity_contract" };
  }
  if (clean(capacity.bookingCode || canonicalBookingId) !== canonicalBookingId) {
    return { ok: false, reason: "capacity_booking_id_mismatch" };
  }
  const pairKey = safePathSegment(capacity.pairKey || row.capacityKey || row.tripId || row.routeId, 120);
  const timeKey = safePathSegment(capacity.timeKey || clean(row.pickupTime || row.time).replace(/[^0-9A-Za-z_-]/g, "_"), 80);
  const capacityKey = safePathSegment(capacity.capacityKey || [serviceDate, pairKey, timeKey].filter(Boolean).join("__"), 180);
  if (!capacityKey || capacityKey.includes("..") || capacityKey.includes("/") || capacityKey.includes("\\")) {
    return { ok: false, reason: "invalid_capacity_key" };
  }
  const requestedSeats = Math.max(1, Number(capacity.requestedSeats || row.seats || row.pax || 1));
  return {
    ok: true,
    path: `operations/bookingCapacityByServiceDate/${serviceDate}/${capacityKey}`,
    bookingKey: canonicalBookingId,
    requestedSeats
  };
}

module.exports = {
  CONTRACT_VERSION,
  CANCELLATION_CONTRACT_VERSION,
  CAPACITY_CONTRACT_VERSION,
  normalizeCode,
  normalizeToken,
  tokenHash,
  originAllowed,
  minimalTicket,
  verifyTicketAccess,
  evaluateCancellation,
  releaseCapacityOnce,
  deriveTrustedCapacityContract
};
