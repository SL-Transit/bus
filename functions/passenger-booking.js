const crypto = require("crypto");

const CONTRACT_VERSION = "passenger_booking_backend_v1";
const TICKET_ACCESS_VERSION = "ticket_access_v1";
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 90;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function safeKey(value, max) {
  const text = clean(value);
  return /^[A-Za-z0-9_-]{1,160}$/.test(text) && text.length <= (max || 160) ? text : "";
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

function validTime(value) {
  return /^\d{2}:\d{2}$/.test(clean(value));
}

function bookingCode() {
  return `BK${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function normalizeSnapshot(input) {
  const body = input && typeof input === "object" ? input : {};
  const pax = Number(body.pax || body.seats || 0);
  const serviceDate = clean(body.serviceDate || body.date);
  const pickupTime = clean(body.pickupTime || body.time).slice(0, 5);
  const assignment = body.assignment && typeof body.assignment === "object" ? body.assignment : {};
  const ticketAccessTokenHash = clean(body.ticketAccessTokenHash);
  if (!validDate(serviceDate)) throw publicError("invalid_service_date", 400);
  if (!validTime(pickupTime)) throw publicError("invalid_pickup_time", 400);
  if (!Number.isInteger(pax) || pax < 1 || pax > 10) throw publicError("invalid_passenger_count", 400);
  if (!/^[a-f0-9]{64}$/i.test(ticketAccessTokenHash)) throw publicError("invalid_ticket_access_token", 400);
  return {
    name: clean(body.name).slice(0, 120),
    phone: clean(body.phone).slice(0, 32),
    pax,
    originStopKey: safeKey(body.originStopKey || body.originKey, 80),
    destStopKey: safeKey(body.destStopKey || body.destKey, 80),
    origin: clean(body.origin || body.originName).slice(0, 160),
    destination: clean(body.destination || body.destName).slice(0, 160),
    route: clean(body.route).slice(0, 200),
    routeId: safeKey(body.routeId || body.pairId || body.pairKey, 120),
    tripId: safeKey(body.tripId || assignment.tripId || body.pairKey, 120),
    pairKey: safeKey(body.pairKey || body.routeId || body.tripId, 120),
    pickupTime,
    serviceDate,
    paymentMode: clean(body.paymentMode || body.payMethod || "onsite"),
    slipUploaded: body.slipUploaded === true,
    assignment,
    ticketAccessTokenHash,
    passengerIdentity: body.passengerIdentity && typeof body.passengerIdentity === "object" ? body.passengerIdentity : null,
    consent: body.consent && typeof body.consent === "object" ? body.consent : null
  };
}

function publicError(message, status) {
  const err = new Error(message);
  err.httpStatus = status || 400;
  return err;
}

function publishedReady(schedule) {
  return schedule && schedule.readyForApply === true && schedule.productionReady === true;
}

function findPair(schedule, snap) {
  const pairs = schedule && schedule.pairs || {};
  const candidates = [snap.pairKey, snap.routeId, snap.tripId].filter(Boolean);
  for (const key of candidates) {
    if (pairs[key]) return { key, pair: pairs[key] };
  }
  for (const key of Object.keys(pairs)) {
    const pair = pairs[key] || {};
    if ((pair.originStopKey === snap.originStopKey || pair.fromStopKey === snap.originStopKey || pair.originKey === snap.originStopKey) &&
        (pair.destStopKey === snap.destStopKey || pair.toStopKey === snap.destStopKey || pair.destinationKey === snap.destStopKey)) {
      return { key, pair };
    }
  }
  throw publicError("schedule_pair_not_found", 409);
}

function findTime(pair, snap) {
  const segments = Array.isArray(pair.segments) ? pair.segments : [];
  for (const segment of segments) {
    const times = Array.isArray(segment.times) ? segment.times : [];
    for (const entry of times) {
      if (clean(entry.time || entry.pickupTime).slice(0, 5) === snap.pickupTime) return entry;
    }
  }
  const flat = Array.isArray(pair.times) ? pair.times : [];
  for (const entry of flat) {
    if (clean(entry.time || entry.pickupTime).slice(0, 5) === snap.pickupTime) return entry;
  }
  throw publicError("schedule_time_not_found", 409);
}

function fareDecision(pair, timeEntry, snap) {
  const fare = firstNumber(timeEntry.fareAmount, pair.fareAmount);
  const serviceFee = firstNumber(timeEntry.serviceFeeAmount, pair.serviceFeeAmount, 0);
  if (fare == null) throw publicError("missing_fare_contract", 409);
  if (serviceFee == null) throw publicError("missing_service_fee_contract", 409);
  return {
    fareAmount: fare,
    serviceFeeAmount: serviceFee,
    price: (fare + serviceFee) * snap.pax
  };
}

function firstNumber() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = Number(arguments[i]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function capacityContract(pairKey, pair, timeEntry, snap, code) {
  const timeKey = clean(timeEntry.capacityTimeKey || timeEntry.time || snap.pickupTime).replace(/[^0-9A-Za-z_-]/g, "_");
  const routeKey = safeKey(pair.capacityKey || pairKey || snap.tripId || snap.routeId, 120);
  if (!routeKey || !timeKey) throw publicError("invalid_capacity_contract", 409);
  const capacityKey = `${snap.serviceDate}__${routeKey}__${timeKey}`;
  const capacityLimit = Math.max(1, Number(timeEntry.capacity || pair.capacity || pair.maxSeats || 3));
  return {
    contractVersion: "booking_capacity_v1",
    bookingCode: code,
    capacityKey,
    pairKey: routeKey,
    timeKey,
    requestedSeats: snap.pax,
    capacityLimit,
    path: `operations/bookingCapacityByServiceDate/${snap.serviceDate}/${capacityKey}`
  };
}

async function reserveCapacity(db, contract, nowServerValue) {
  let reserved = false;
  const tx = await db.ref(contract.path).transaction((current) => {
    const row = current && typeof current === "object" ? current : {};
    const bookings = Object.assign({}, row.bookings || {});
    if (bookings[contract.bookingCode]) return row;
    const bookedSeats = Number(row.bookedSeats || 0);
    const limit = Number(row.capacityLimit || contract.capacityLimit);
    if (bookedSeats + contract.requestedSeats > limit) return;
    bookings[contract.bookingCode] = {
      seats: contract.requestedSeats,
      status: "reserved",
      reservedAt: nowServerValue
    };
    reserved = true;
    return Object.assign({}, row, {
      contractVersion: "booking_capacity_v1",
      capacityLimit: limit,
      bookedSeats: bookedSeats + contract.requestedSeats,
      seatsAvailable: Math.max(0, limit - bookedSeats - contract.requestedSeats),
      bookings
    });
  });
  if (!tx || !tx.committed) throw publicError("capacity_full", 409);
  return reserved ? "reserved" : "idempotent_noop";
}

function bookingRecord(code, snap, fare, capacity, nowServerValue, nowMs) {
  const paymentStatus = snap.paymentMode === "onsite" ? "pay_on_site" : (snap.slipUploaded ? "slip_uploaded" : "awaiting_payment");
  return {
    code,
    bookingCode: code,
    source: "booking1.html",
    sourceMode: "erp_data_center",
    bookingCreationContractVersion: CONTRACT_VERSION,
    status: "awaiting_payment",
    paymentStatus,
    paymentMode: snap.paymentMode === "onsite" ? "onsite" : snap.paymentMode,
    paymentOwnership: "sl_transit",
    externalPaymentRequired: false,
    testMode: false,
    mockPayment: false,
    name: snap.name,
    phone: snap.phone,
    date: snap.serviceDate,
    serviceDate: snap.serviceDate,
    time: snap.pickupTime,
    pickupTime: snap.pickupTime,
    origin: snap.origin || snap.originStopKey,
    destination: snap.destination || snap.destStopKey,
    originStopKey: snap.originStopKey,
    destStopKey: snap.destStopKey,
    route: snap.route,
    routeId: snap.routeId || capacity.pairKey,
    tripId: snap.tripId || capacity.pairKey,
    pax: snap.pax,
    seats: snap.pax,
    price: fare.price,
    fareAmount: fare.fareAmount * snap.pax,
    fare: fare.fareAmount,
    serviceFeeAmount: fare.serviceFeeAmount * snap.pax,
    serviceFee: fare.serviceFeeAmount,
    queueNo: clean(snap.assignment.queueNo || snap.assignment.queueId),
    plannedVehicleId: clean(snap.assignment.plannedVehicleId || snap.assignment.vehicleId),
    vehicleId: clean(snap.assignment.vehicleId || snap.assignment.plannedVehicleId),
    assignment: {
      queueId: clean(snap.assignment.queueId || snap.assignment.queueNo),
      queueNo: clean(snap.assignment.queueNo || snap.assignment.queueId),
      plannedVehicleId: clean(snap.assignment.plannedVehicleId || snap.assignment.vehicleId),
      vehicleId: clean(snap.assignment.vehicleId || snap.assignment.plannedVehicleId)
    },
    capacity: {
      contractVersion: capacity.contractVersion,
      bookingCode: code,
      capacityKey: capacity.capacityKey,
      pairKey: capacity.pairKey,
      timeKey: capacity.timeKey,
      requestedSeats: snap.pax
    },
    passengerIdentity: snap.passengerIdentity,
    consent: snap.consent,
    ticketAccessTokenHash: snap.ticketAccessTokenHash,
    ticketAccessContractVersion: TICKET_ACCESS_VERSION,
    ticketAccessTokenVersion: 1,
    ticketAccessTokenIssuedAt: nowServerValue,
    ticketAccessTokenIssuedAtMs: nowMs,
    ticketAccessTokenExpiresAt: nowMs + TOKEN_TTL_MS,
    ticketAccessTokenRevokedAt: null,
    ticketAccessTokenRevokedReason: "",
    ticketAccessTokenRotation: { currentVersion: 1, previousHash: null },
    ts: nowServerValue
  };
}

async function createPassengerBooking(admin, request, idempotencyKey) {
  const db = admin.database();
  const snap = normalizeSnapshot(request && (request.booking || request.snapshot || request));
  const idem = /^[A-Za-z0-9_-]{16,160}$/.test(clean(idempotencyKey)) ? clean(idempotencyKey) : hash(JSON.stringify({
    token: snap.ticketAccessTokenHash,
    serviceDate: snap.serviceDate,
    pickupTime: snap.pickupTime,
    pax: snap.pax
  }));
  const idemKey = hash(idem);
  const idemRef = db.ref(`operations/passengerBookingIdempotency/${idemKey}`);
  const existing = (await idemRef.get()).val();
  if (existing && existing.status === "success" && existing.bookingCode) {
    const existingBooking = (await db.ref(`bookings/${existing.bookingCode}`).get()).val();
    return { status: "ready", result: "idempotent_replay", booking: minimalReceipt(existingBooking, existing.bookingCode) };
  }
  const schedule = (await db.ref("publishedSchedule").get()).val() || {};
  if (!publishedReady(schedule)) throw publicError("published_schedule_not_ready", 409);
  const pairInfo = findPair(schedule, snap);
  const timeEntry = findTime(pairInfo.pair, snap);
  const fare = fareDecision(pairInfo.pair, timeEntry, snap);
  const code = bookingCode();
  const nowMs = Date.now();
  const nowServerValue = admin.database.ServerValue.TIMESTAMP;
  const capacity = capacityContract(pairInfo.key, pairInfo.pair, timeEntry, snap, code);
  await idemRef.set({
    status: "locked",
    bookingCode: code,
    createdAt: nowServerValue,
    updatedAt: nowServerValue
  });
  await reserveCapacity(db, capacity, nowServerValue);
  const record = bookingRecord(code, snap, fare, capacity, nowServerValue, nowMs);
  await db.ref().update({
    [`bookings/${code}`]: record,
    [`operations/bookings/${code}`]: {
      code,
      bookingCode: code,
      status: record.status,
      serviceDate: record.serviceDate,
      ts: nowServerValue,
      source: "createPassengerBooking"
    },
    [`operations/passengerBookingIdempotency/${idemKey}/status`]: "success",
    [`operations/passengerBookingIdempotency/${idemKey}/updatedAt`]: nowServerValue
  });
  return { status: "ready", result: "created", booking: minimalReceipt(record, code) };
}

function minimalReceipt(record, code) {
  const row = record || {};
  return {
    code,
    bookingCode: code,
    status: row.status || "",
    paymentStatus: row.paymentStatus || "",
    date: row.date || row.serviceDate || "",
    serviceDate: row.serviceDate || row.date || "",
    time: row.time || row.pickupTime || "",
    pickupTime: row.pickupTime || row.time || "",
    origin: row.origin || "",
    destination: row.destination || "",
    pax: Number(row.pax || row.seats || 0),
    seats: Number(row.seats || row.pax || 0),
    price: firstNumber(row.price),
    fareAmount: firstNumber(row.fareAmount),
    serviceFeeAmount: firstNumber(row.serviceFeeAmount),
    queueNo: row.queueNo || "",
    vehicleId: row.vehicleId || row.plannedVehicleId || "",
    ticketAccessContractVersion: row.ticketAccessContractVersion || TICKET_ACCESS_VERSION,
    ticketAccessTokenExpiresAt: Number(row.ticketAccessTokenExpiresAt || 0) || null
  };
}

module.exports = {
  CONTRACT_VERSION,
  TOKEN_TTL_MS,
  createPassengerBooking,
  normalizeSnapshot,
  capacityContract,
  minimalReceipt
};
