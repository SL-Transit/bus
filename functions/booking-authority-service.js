"use strict";
const { createHash } = require("node:crypto");
function canonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
const planDigest = value => createHash("sha256").update(canonicalJson(value)).digest("hex");
// Existing reserve/create authority extracted once. Caller must supply a verified ownerUid.
// No authentication bypass, Firebase initialization, HTTP export or LINE adapter here.
function createBookingAuthority(deps = {}) {
  const { db, serverTimestamp, readSystemTestMode, readCanonicalWorkbookSource, canonicalWorkbookReady,
    findCanonicalWorkbookPair, resolvePublishedCapacity, bookingTimeAuthority, cleanBookingText,
    validCapacityPart, capacityCounterPath, maxCapacityLimit = 300, isEmulator = false, warn = () => {} } = deps;
  if (!db || typeof db.ref !== "function" || !bookingTimeAuthority || typeof bookingTimeAuthority.resolveBookingTime !== "function" ||
      [readSystemTestMode, readCanonicalWorkbookSource, canonicalWorkbookReady, findCanonicalWorkbookPair, resolvePublishedCapacity, cleanBookingText, validCapacityPart, capacityCounterPath, warn].some(value => typeof value !== "function")) throw new Error("booking_authority_dependencies_required");
  const reply = (statusCode, body) => ({ statusCode, body });
  function owner(ownerUid) {
    if (typeof ownerUid !== "string" || !ownerUid || ownerUid.length > 128) {
      const error = new Error("verified_booking_owner_required"); error.statusCode = 401; throw error;
    }
    return { uid: ownerUid };
  }
  async function reserve({ ownerUid, body: providedBody = {}, readInput }) {
    const decoded = owner(ownerUid);
    const systemTestMode = await readSystemTestMode();
    if (systemTestMode.enabled === true && systemTestMode.allowBookingsDuringTest !== true) { return reply(503, { status: "blocked", error: "system_test_mode_enabled", message: "ระบบกำลังทดสอบ จึงยังไม่รับรายการนี้" }); }
    const body = typeof readInput === "function" ? readInput() : providedBody;
    const action = body.action || "reserve";
    const path = capacityCounterPath(body.serviceDate, body.capacityKey);
    const bookingCode = String(body.bookingCode || "");
    const requestedSeats = Number(body.requestedSeats);
    if (!path || !validCapacityPart(bookingCode, 80) || !Number.isInteger(requestedSeats) || requestedSeats < 1 || requestedSeats > 10) {
      return reply( 400, { status: "error", error: "invalid_capacity_request" });
    }
    const ref = db.ref(path);
    let initialCapacity = (await ref.get()).val();
    if (!initialCapacity && action !== "release") {
      initialCapacity = await resolvePublishedCapacity({
        serviceDate: body.serviceDate,
        pairKey: body.pairKey,
        tripKey: body.tripKey,
        routeKey: body.routeKey,
        pickupTime: body.pickupTime
      });
      if (!initialCapacity) {
        warn("booking_capacity_rejected", {
          reason: "published_trip_not_found",
          serviceDate: body.serviceDate,
          pairKey: body.pairKey,
          tripKey: body.tripKey,
          routeKey: body.routeKey,
          pickupTime: body.pickupTime
        });
        return reply( 409, { status: "error", error: "capacity_full_or_not_ready" });
      }
    }
    if (action === "release") {
      const result = await ref.transaction((current) => {
        if (!current || !current.bookings || !current.bookings[bookingCode]) return current;
        const existing = current.bookings[bookingCode];
        if (existing.ownerUid !== decoded.uid) return current;
        // Bound seats can only be released by the trusted cancellation/reconciliation path.
        if (existing.commandId && ["committing", "committed"].includes(existing.status)) return current;
        const bookings = { ...current.bookings };
        delete bookings[bookingCode];
        const bookedSeats = Math.max(0, Number(current.bookedSeats || 0) - Number(existing.seats || requestedSeats));
        return { ...current, bookedSeats, seatsAvailable: Math.max(0, Number(current.capacityLimit || 0) - bookedSeats), bookings, updatedAt: serverTimestamp };
      });
      const remaining = result.snapshot.child(`bookings/${bookingCode}`).val();
      if (remaining && remaining.commandId && ["committing", "committed"].includes(remaining.status)) {
        return reply(409, { status: "error", error: "bound_reservation_requires_reconciliation" });
      }
      return reply( 200, { status: "ok", action: "release", committed: result.committed === true });
    }
    const result = await ref.transaction((current) => {
      const state = current || initialCapacity;
      if (!state) return;
      const transactionCapacityLimit = Number(state.capacityLimit);
      if (!Number.isInteger(transactionCapacityLimit) || transactionCapacityLimit < 1 || transactionCapacityLimit > maxCapacityLimit) return;
      const bookings = state.bookings || {};
      const existing = bookings[bookingCode];
      if (existing) return existing.ownerUid === decoded.uid ? state : undefined;
      const bookedSeats = Math.max(0, Number(state.bookedSeats || 0));
      const capacityLimit = transactionCapacityLimit;
      if (bookedSeats + requestedSeats > capacityLimit) return;
      const serverNow = Date.now();
      return {
        ...state,
        contractVersion: "booking_capacity_v1",
        bookedSeats: bookedSeats + requestedSeats,
        seatsAvailable: capacityLimit - bookedSeats - requestedSeats,
        bookings: { ...bookings, [bookingCode]: { ownerUid: decoded.uid, seats: requestedSeats, status: "reserved", reservedAt: serverNow } },
        updatedAt: serverNow
      };
    });
    if (!result.committed) {
      const snapshot = await ref.get();
      const existing = snapshot.child(`bookings/${bookingCode}`).val();
      warn("booking_capacity_rejected", {
        reason: existing ? "capacity_already_reserved" : "capacity_transaction_not_committed",
        serviceDate: body.serviceDate,
        pairKey: body.pairKey,
        tripKey: body.tripKey,
        routeKey: body.routeKey,
        pickupTime: body.pickupTime
      });
      return reply( existing && existing.ownerUid === decoded.uid ? 200 : 409, { status: "error", error: existing ? "capacity_already_reserved" : "capacity_full_or_not_ready" });
    }
    const value = result.snapshot.val() || {};
    return reply( 200, { status: "ok", action: "reserve", committed: true, capacityLimit: value.capacityLimit, bookedSeats: value.bookedSeats, seatsAvailable: value.seatsAvailable });
  }
  // Server-only preparation: HTTP callers receive only create() responses, never this private snapshot.
  async function prepare({ ownerUid, booking: providedBooking, readInput }) {
    const decoded = owner(ownerUid);
    const systemTestMode = await readSystemTestMode();
    if (systemTestMode.enabled === true && systemTestMode.allowBookingsDuringTest !== true) { return reply(503, { status: "blocked", error: "system_test_mode_enabled", message: "ระบบกำลังทดสอบ จึงยังไม่รับรายการนี้" }); }
    const rawBooking = typeof readInput === "function" ? readInput() : providedBooking;
    const input = rawBooking && typeof rawBooking === "object" ? rawBooking : {};
    const code = cleanBookingText(input.code || input.bookingCode, 80);
    const pax = Number(input.pax == null ? input.seats : input.pax);
    const date = cleanBookingText(input.date || input.serviceDate, 10);
    const phone = cleanBookingText(input.phone, 20);
    if (!validCapacityPart(code, 80) || !Number.isInteger(pax) || pax < 1 || pax > 10 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^0[689]\d{8}$/.test(phone)) {
      return reply( 400, { status: "error", error: "invalid_booking_request" });
    }
    const source = await readCanonicalWorkbookSource();
    if (![input.tripId, input.catalogTripId, input.scheduleOfferId].some((value) => String(value || "").trim())) {
      return reply( 409, { status: "error", error: "canonical_trip_identity_required" });
    }
    let pair = canonicalWorkbookReady(source) ? findCanonicalWorkbookPair(source, input) : null;
    if (!pair && isEmulator === true) {
      const emulatorSchedule = (await db.ref("publishedSchedule").get()).val() || {};
      const pairs = emulatorSchedule.pairs || {};
      const wanted = [input.pairKey, input.pairId, input.canonicalPairKey].filter(Boolean).map(String);
      pair = Object.entries(pairs).map(([key, value]) => ({ key, ...(value || {}) })).find((candidate) =>
        wanted.includes(String(candidate.key)) || wanted.includes(String(candidate.pairKey || "")) || wanted.includes(String(candidate.pairId || ""))
      ) || null;
    }
    if (!canonicalWorkbookReady(source) && isEmulator !== true) {
      return reply( 409, { status: "error", error: "canonical_workbook_source_not_ready" });
    }
    const serverFare = Number(pair && pair.fareAmount);
    const serverFee = Number(pair && pair.fareContract && pair.fareContract.serviceFeeAmount || 0);
    const expectedTotal = (serverFare + serverFee) * pax;
    if (!pair || !Number.isFinite(serverFare) || serverFare < 0 || !Number.isFinite(serverFee) || serverFee < 0 || Number(input.fareAmount) !== serverFare || Number(input.price) !== expectedTotal || Number(input.fare) !== expectedTotal) {
      return reply( 409, { status: "error", error: "authoritative_price_mismatch" });
    }
    const authoritativeTime = bookingTimeAuthority.resolveBookingTime(input, pair);
    if (!authoritativeTime.ok) {
      return reply( 409, { status: "error", error: authoritativeTime.error });
    }
    const paymentMode = input.paymentMode === "onsite" ? "onsite" : "transfer";
    const paymentStatus = paymentMode === "onsite" ? "pay_on_site" : (input.slipUploaded === true ? "slip_uploaded" : "awaiting_payment");
    const booking = {
      code, bookingCode: code, ownerUid: decoded.uid, source: "booking1.html", sourceMode: "erp_data_center",
      name: cleanBookingText(input.name, 120), phone, pax, seats: pax, date, serviceDate: date,
      time: authoritativeTime.time, pickupTime: authoritativeTime.time, departTime: authoritativeTime.time,
      canonicalDepartureTime: authoritativeTime.time,
      origin: cleanBookingText(input.origin, 120), destination: cleanBookingText(input.destination, 120),
      originKey: cleanBookingText(input.originKey, 120), destKey: cleanBookingText(input.destKey, 120),
      pairKey: cleanBookingText(input.pairKey, 160), pairId: cleanBookingText(input.pairId, 160), canonicalPairKey: cleanBookingText(input.canonicalPairKey, 160),
      routeId: cleanBookingText(pair.routeId, 160),
      tripId: cleanBookingText(pair.scheduleOfferId, 160), catalogTripId: cleanBookingText(pair.scheduleOfferId, 160),
      scheduleOfferId: cleanBookingText(pair.scheduleOfferId, 160), scheduleRowId: cleanBookingText(pair.scheduleRowId, 160),
      fare: expectedTotal, price: expectedTotal, fareAmount: serverFare, fareContract: pair.fareContract || null,
      paymentMode, paymentStatus, slipUploaded: paymentStatus === "slip_uploaded", paymentOwnership: "sl_transit",
      externalPaymentRequired: false, testMode: systemTestMode.enabled === true, mockPayment: systemTestMode.enabled === true, mockOnly: systemTestMode.enabled === true, status: "awaiting_payment",
      passengerIdentity: input.passengerIdentity || null, notificationPreference: input.notificationPreference || null,
      consent: input.consent || null, assignment: input.assignment || null, capacity: input.capacity || null,
      publishedSchedule: { readyForApply: false, schemaVersion: source.manifest.schemaVersion || "erpWorkbookSource.v1" }, createdAt: serverTimestamp
    };
    const canonicalPair = String(pair.pairKey || pair.pairId || pair.key || "");
    const safeKey = value => String(value == null ? "" : value).trim().replace(/[.#$\[\]\/]/g, "_").replace(/\s+/g, "_") || "unknown";
    // Same existing web counter identity: date + canonical fare pair + departure time.
    const capacityKey = [date, canonicalPair, authoritativeTime.time].map(safeKey).join("__").replace(/[^A-Za-z0-9_-]/g, "_");
    const counterPath = capacityCounterPath(date, capacityKey);
    const capacity = canonicalPair && counterPath && pair.scheduleOfferId && pair.scheduleRowId ? {
      contractVersion: "booking_capacity_v1", serviceDate: date, pairKey: canonicalPair,
      tripKey: String(pair.scheduleOfferId), routeKey: String(pair.routeId || ""), pickupTime: authoritativeTime.time,
      capacityKey, counterPath, requestedSeats: pax, bookingCode: code, sourceRowId: String(pair.scheduleRowId)
    } : null;
    return { statusCode: 200, body: { status: "ok" }, snapshot: booking, capacity,
      planHash: planDigest({ snapshot: booking, capacity }) };
  }
  async function create({ ownerUid, booking: providedBooking, readInput, expectedReservation }) {
    const prepared = await prepare({ ownerUid, booking: providedBooking, readInput });
    if (prepared.statusCode !== 200) return prepared;
    const booking = prepared.snapshot, code = booking.code;
    // This argument is trusted server context; index.js NEVER takes it from request JSON.
    if (expectedReservation !== undefined) {
      const binding = expectedReservation, capacity = prepared.capacity;
      if (!binding || !capacity || !/^[a-f0-9]{64}$/.test(binding.commandId || "") ||
          !/^[a-f0-9]{64}$/.test(binding.requestHash || "") || binding.planHash !== prepared.planHash) {
        return reply(409, { status: "error", error: "reservation_binding_required" });
      }
      const counter = (await db.ref(capacity.counterPath).get()).val();
      const marker = counter && counter.bookings && counter.bookings[code];
      if (!marker || marker.ownerUid !== ownerUid || Number(marker.seats) !== booking.pax ||
          marker.status !== "committing" || marker.commandId !== binding.commandId ||
          marker.requestHash !== binding.requestHash || marker.planHash !== prepared.planHash ||
          marker.tripId !== capacity.tripKey || marker.capacityKey !== capacity.capacityKey ||
          String(counter.sourceRowId || "") !== capacity.sourceRowId) {
        return reply(409, { status: "error", error: "reservation_binding_mismatch" });
      }
      booking.source = "line_chat";
      booking.capacity = { ...capacity, capacityLimit: counter.capacityLimit, status: "reserved" };
      booking.bookingCommand = { schemaVersion: "booking_command_v1", commandId: binding.commandId,
        requestHash: binding.requestHash, planHash: prepared.planHash };
    }
    const bookingRef = db.ref("bookings/" + code);
    const result = await bookingRef.transaction((current) => current ? undefined : booking);
    if (!result.committed) {
      return reply( 409, { status: "error", error: "booking_already_exists" });
    }
    return reply( 201, { status: "ok", booking: result.snapshot.val() });
  }
  return { reserve, create, prepare };
}
module.exports = { createBookingAuthority, canonicalJson };
