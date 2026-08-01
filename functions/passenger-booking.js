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
    origin: "",
    destination: "",
    route: "",
    routeId: "",
    tripId: "",
    pairKey: "",
    pickupTime,
    serviceDate,
    paymentMode: clean(body.paymentMode || body.payMethod || "onsite"),
    slipUploaded: body.slipUploaded === true,
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
  const legs = legSnapshots(pair, timeEntry);
  if (!legs.length) throw publicError("missing_fare_contract", 409);
  const serviceFee = firstNumber(timeEntry.serviceFeeAmount, pair.serviceFeeAmount);
  if (serviceFee == null) throw publicError("missing_platform_fee_contract", 409);
  const providerFareTotal = legs.reduce((sum, leg) => sum + (leg.fareAmount * snap.pax), 0);
  return {
    calculatorContractVersion: "erp_calculator_booking_total_v1",
    legSnapshots: legs,
    providerFareTotal,
    platformServiceFeeTotal: serviceFee,
    passengerGrossPayment: providerFareTotal + serviceFee
  };
}

function legSnapshots(pair, timeEntry) {
  const segments = Array.isArray(pair.segments) ? pair.segments : [];
  const legs = [];
  if (segments.length) {
    segments.forEach((segment, index) => {
      const segmentTimes = Array.isArray(segment.times) ? segment.times : [];
      const matchingTime = segmentTimes.find((entry) => clean(entry.time || entry.pickupTime).slice(0, 5) === clean(timeEntry.time || timeEntry.pickupTime).slice(0, 5)) || {};
      const fareAmount = firstNumber(matchingTime.fareAmount, segment.fareAmount);
      if (fareAmount != null) {
        legs.push({
          legIndex: index + 1,
          from: clean(segment.from || segment.origin || segment.fromStopKey),
          to: clean(segment.to || segment.destination || segment.toStopKey),
          time: clean(matchingTime.time || segment.time || timeEntry.time || timeEntry.pickupTime).slice(0, 5),
          fareAmount
        });
      }
    });
  }
  if (!legs.length) {
    const fareAmount = firstNumber(timeEntry.fareAmount, pair.fareAmount);
    if (fareAmount != null) {
      legs.push({
        legIndex: 1,
        from: clean(pair.originLabel || pair.originStopKey || pair.fromStopKey),
        to: clean(pair.destinationLabel || pair.destStopKey || pair.toStopKey),
        time: clean(timeEntry.time || timeEntry.pickupTime).slice(0, 5),
        fareAmount
      });
    }
  }
  return legs;
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
  const capacityLimit = firstNumber(timeEntry.capacity, timeEntry.capacityLimit, pair.capacity, pair.capacityLimit, pair.maxSeats);
  if (!capacityLimit || capacityLimit < 1) throw publicError("missing_capacity_contract", 409);
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

function publicCapacityPath(contract) {
  return contract.path.replace("operations/bookingCapacityByServiceDate/", "operations/publicBookingCapacityByServiceDate/");
}

async function reserveCapacity(db, contract, nowServerValue) {
  let reserved = false;
  let publicAggregate = null;
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
    publicAggregate = {
      seatsAvailable: Math.max(0, limit - bookedSeats - contract.requestedSeats),
      capacityStatus: bookedSeats + contract.requestedSeats >= limit ? "full" : "available",
      bookingStatus: bookedSeats + contract.requestedSeats >= limit ? "closed" : "open",
      unavailable: false,
      updatedAt: nowServerValue
    };
    return Object.assign({}, row, {
      contractVersion: "booking_capacity_v1",
      capacityLimit: limit,
      bookedSeats: bookedSeats + contract.requestedSeats,
      seatsAvailable: Math.max(0, limit - bookedSeats - contract.requestedSeats),
      bookings
    });
  });
  if (!tx || !tx.committed) throw publicError("capacity_full", 409);
  if (publicAggregate) await db.ref(publicCapacityPath(contract)).set(publicAggregate);
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
    origin: capacity.originLabel || snap.originStopKey,
    destination: capacity.destinationLabel || snap.destStopKey,
    originStopKey: snap.originStopKey,
    destStopKey: snap.destStopKey,
    route: capacity.routeLabel || "",
    routeId: capacity.routeId || capacity.pairKey,
    tripId: capacity.tripId || capacity.pairKey,
    pax: snap.pax,
    seats: snap.pax,
    price: fare.passengerGrossPayment,
    passengerGrossPayment: fare.passengerGrossPayment,
    fareAmount: fare.providerFareTotal,
    providerFareTotal: fare.providerFareTotal,
    serviceFeeAmount: fare.platformServiceFeeTotal,
    platformServiceFeeTotal: fare.platformServiceFeeTotal,
    fareContractVersion: fare.calculatorContractVersion,
    legFareSnapshots: fare.legSnapshots,
    fare: fare.legSnapshots[0] ? fare.legSnapshots[0].fareAmount : null,
    serviceFee: fare.platformServiceFeeTotal,
    queueNo: capacity.queueNo,
    plannedVehicleId: capacity.plannedVehicleId,
    vehicleId: capacity.vehicleId,
    assignment: {
      queueId: capacity.queueId,
      queueNo: capacity.queueNo,
      plannedVehicleId: capacity.plannedVehicleId,
      vehicleId: capacity.vehicleId,
      assignmentSource: capacity.assignmentSource
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
  const requestHash = hash(JSON.stringify({
    tokenHash: snap.ticketAccessTokenHash,
    normalizedNameHash: hash(snap.name.toLowerCase()),
    normalizedPhoneHash: hash(snap.phone.replace(/\D+/g, "")),
    consentVersion: snap.consent && clean(snap.consent.version),
    serviceDate: snap.serviceDate,
    pickupTime: snap.pickupTime,
    originStopKey: snap.originStopKey,
    destStopKey: snap.destStopKey,
    pax: snap.pax,
    paymentMode: snap.paymentMode,
    slipUploaded: snap.slipUploaded
  }));
  let claimed = false;
  let claimConflict = false;
  const claimTx = await idemRef.transaction((current) => {
    if (current && typeof current === "object") {
      if (current.requestHash !== requestHash || current.ticketAccessTokenHash !== snap.ticketAccessTokenHash) {
        claimConflict = true;
      }
      return current;
    }
    claimed = true;
    const code = bookingCode();
    return {
      status: "received",
      bookingCode: code,
      requestHash,
      ticketAccessTokenHash: snap.ticketAccessTokenHash,
      leaseOwner: "",
      leaseUntilMs: 0,
      attemptCount: 0,
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updatedAt: admin.database.ServerValue.TIMESTAMP
    };
  });
  const op = claimTx && claimTx.snapshot && claimTx.snapshot.val ? claimTx.snapshot.val() : null;
  if (!op || claimConflict) throw publicError("idempotency_conflict", 409);
  if (op.status === "committed" && op.bookingCode) {
    const existingBooking = (await db.ref(`bookings/${op.bookingCode}`).get()).val();
    return { status: "ready", result: "idempotent_replay", booking: minimalReceipt(existingBooking, op.bookingCode) };
  }
  const code = op.bookingCode;
  const schedule = (await db.ref("publishedSchedule").get()).val() || {};
  if (!publishedReady(schedule)) throw publicError("published_schedule_not_ready", 409);
  const pairInfo = findPair(schedule, snap);
  const timeEntry = findTime(pairInfo.pair, snap);
  const fare = fareDecision(pairInfo.pair, timeEntry, snap);
  const nowMs = Date.now();
  const nowServerValue = admin.database.ServerValue.TIMESTAMP;
  const capacity = capacityContract(pairInfo.key, pairInfo.pair, timeEntry, snap, code);
  Object.assign(capacity, deriveAssignment(pairInfo.key, pairInfo.pair, timeEntry));
  const record = bookingRecord(code, snap, fare, capacity, nowServerValue, nowMs);
  await idemRef.update({
    status: "validated",
    validatedScheduleHash: hash(JSON.stringify({ pairKey: pairInfo.key, time: clean(timeEntry.time || timeEntry.pickupTime), fare, capacity })),
    capacityPathHash: hash(capacity.path),
    capacityPath: capacity.path,
    capacityBookingCode: code,
    requestedSeats: capacity.requestedSeats,
    bookingRecordDraft: record,
    updatedAt: nowServerValue
  });
  await reserveCapacity(db, capacity, nowServerValue);
  await idemRef.update({
    status: "capacity_reserved",
    updatedAt: nowServerValue
  });
  await idemRef.update({
    status: "booking_commit_pending",
    updatedAt: nowServerValue
  });
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
    [`operations/passengerBookingIdempotency/${idemKey}/status`]: "committed",
    [`operations/passengerBookingIdempotency/${idemKey}/updatedAt`]: nowServerValue
  });
  return { status: "ready", result: claimed ? "created" : "idempotent_completed", booking: minimalReceipt(record, code) };
}

async function processBookingCreationRecovery(admin, operationId, workerId) {
  const db = admin.database();
  const opRef = db.ref(`operations/passengerBookingIdempotency/${operationId}`);
  const now = Date.now();
  let leased = false;
  const leaseUntilMs = now + 2 * 60000;
  const tx = await opRef.transaction((current) => {
    if (!current || current.status === "committed" || current.status === "failed_final") return current;
    if (Number(current.leaseUntilMs || 0) > now && current.leaseOwner !== workerId) return current;
    leased = true;
    return Object.assign({}, current, {
      status: current.status === "received" ? "recovery_required" : current.status,
      leaseOwner: workerId,
      leaseUntilMs,
      attemptCount: Number(current.attemptCount || 0) + 1,
      updatedAt: admin.database.ServerValue.TIMESTAMP
    });
  });
  if (!leased || !tx || !tx.committed) return { status: "lease_skipped" };
  const op = tx.snapshot && tx.snapshot.val ? tx.snapshot.val() : null;
  const code = clean(op && op.bookingCode);
  const draft = op && op.bookingRecordDraft;
  if (!code || !draft) {
    await opRef.update({
      status: "failed_final",
      safeErrorCategory: "missing_booking_draft",
      leaseOwner: "",
      leaseUntilMs: 0,
      updatedAt: admin.database.ServerValue.TIMESTAMP
    });
    return { status: "failed_final" };
  }
  const existing = (await db.ref(`bookings/${code}`).get()).val();
  if (!existing && (op.status === "capacity_reserved" || op.status === "booking_commit_pending" || op.status === "recovery_required")) {
    const reservation = await verifyReservedCapacity(db, op);
    if (reservation.status !== "matched") {
      await opRef.update({
        status: "failed_final",
        safeErrorCategory: reservation.status,
        leaseOwner: "",
        leaseUntilMs: 0,
        updatedAt: admin.database.ServerValue.TIMESTAMP
      });
      return { status: "failed_final", reason: reservation.status };
    }
    await db.ref().update({
      [`bookings/${code}`]: draft,
      [`operations/bookings/${code}`]: {
        code,
        bookingCode: code,
        status: draft.status,
        serviceDate: draft.serviceDate,
        ts: admin.database.ServerValue.TIMESTAMP,
        source: "createPassengerBookingRecovery"
      }
    });
  }
  const after = (await db.ref(`bookings/${code}`).get()).val();
  if (after) {
    await opRef.update({
      status: "committed",
      leaseOwner: "",
      leaseUntilMs: 0,
      recoveryResult: "booking_committed",
      updatedAt: admin.database.ServerValue.TIMESTAMP
    });
    return { status: "committed" };
  }
  await releaseReservedCapacity(db, op);
  await opRef.update({
    status: "failed_final",
    safeErrorCategory: "booking_recovery_failed_capacity_released",
    leaseOwner: "",
    leaseUntilMs: 0,
    updatedAt: admin.database.ServerValue.TIMESTAMP
  });
  return { status: "failed_final" };
}

async function verifyReservedCapacity(db, op) {
  const path = clean(op && op.capacityPath);
  const code = clean(op && op.capacityBookingCode || op && op.bookingCode);
  const requestedSeats = Math.max(1, Number(op && op.requestedSeats || 0));
  const draft = op && op.bookingRecordDraft || {};
  if (!/^operations\/bookingCapacityByServiceDate\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]+$/.test(path)) return { status: "invalid_capacity_path" };
  if (!code || !requestedSeats) return { status: "invalid_capacity_reservation_contract" };
  const parts = path.split("/");
  const serviceDate = parts[2];
  const capacityKey = parts[3];
  if (serviceDate !== clean(draft.serviceDate || draft.date)) return { status: "capacity_service_date_mismatch" };
  if (capacityKey !== clean(draft.capacity && draft.capacity.capacityKey)) return { status: "capacity_key_mismatch" };
  if (code !== clean(draft.code || draft.bookingCode)) return { status: "capacity_booking_code_mismatch" };
  const row = (await db.ref(path).get()).val();
  const marker = row && row.bookings && row.bookings[code];
  if (!marker) return { status: "capacity_reservation_missing" };
  if (clean(marker.status) !== "reserved") return { status: "capacity_reservation_state_mismatch" };
  if (Number(marker.seats) !== requestedSeats || Number(marker.seats) !== Number(draft.pax || draft.seats)) return { status: "capacity_seat_mismatch" };
  return { status: "matched" };
}

async function releaseReservedCapacity(db, op) {
  const path = clean(op && op.capacityPath);
  const code = clean(op && op.capacityBookingCode || op && op.bookingCode);
  const requestedSeats = Math.max(1, Number(op && op.requestedSeats || 1));
  if (!/^operations\/bookingCapacityByServiceDate\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_-]+$/.test(path) || !code) return { status: "skipped" };
  let removed = false;
  let publicAggregate = null;
  await db.ref(path).transaction((current) => {
    if (!current || typeof current !== "object" || !current.bookings || !current.bookings[code]) return current;
    const bookings = Object.assign({}, current.bookings || {});
    delete bookings[code];
    removed = true;
    const bookedSeats = Math.max(0, Number(current.bookedSeats || 0) - requestedSeats);
    const seatsAvailable = Math.max(0, Number(current.capacityLimit || 0) - bookedSeats);
    publicAggregate = {
      seatsAvailable,
      capacityStatus: seatsAvailable <= 0 ? "full" : "available",
      bookingStatus: seatsAvailable <= 0 ? "closed" : "open",
      unavailable: false
    };
    return Object.assign({}, current, {
      bookings,
      bookedSeats,
      seatsAvailable
    });
  });
  if (publicAggregate) await db.ref(path.replace("operations/bookingCapacityByServiceDate/", "operations/publicBookingCapacityByServiceDate/")).update(publicAggregate);
  return { status: removed ? "released" : "idempotent_noop" };
}

function deriveAssignment(pairKey, pair, timeEntry) {
  const assignment = timeEntry.assignment || pair.assignment || {};
  const queueId = clean(timeEntry.queueId || timeEntry.queueNo || assignment.queueId || assignment.queueNo);
  const vehicleId = clean(timeEntry.vehicleId || timeEntry.plannedVehicleId || assignment.vehicleId || assignment.plannedVehicleId);
  if (!queueId || !vehicleId) throw publicError("missing_assignment_contract", 409);
  return {
    queueId,
    queueNo: clean(timeEntry.queueNo || assignment.queueNo || queueId),
    vehicleId,
    plannedVehicleId: clean(timeEntry.plannedVehicleId || assignment.plannedVehicleId || vehicleId),
    routeId: safeKey(pair.routeId || pair.pairId || pairKey, 120),
    tripId: safeKey(timeEntry.tripId || timeEntry.catalogTripId || pair.tripId || pairKey, 120),
    routeLabel: clean(pair.route || pair.routeName || `${pair.originLabel || ""} - ${pair.destinationLabel || ""}`).slice(0, 200),
    originLabel: clean(pair.originLabel || pair.originName || pair.originStopKey || pair.fromStopKey).slice(0, 160),
    destinationLabel: clean(pair.destinationLabel || pair.destName || pair.destStopKey || pair.toStopKey).slice(0, 160),
    assignmentSource: clean(timeEntry.assignmentSource || assignment.assignmentSource || "publishedSchedule")
  };
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
  processBookingCreationRecovery,
  verifyReservedCapacity,
  normalizeSnapshot,
  capacityContract,
  fareDecision,
  legSnapshots,
  minimalReceipt
};
