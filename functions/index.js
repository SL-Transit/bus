const admin = require("firebase-admin");
const { onValueCreated, onValueUpdated, onValueWritten } = require("firebase-functions/v2/database");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");

const ERP_DATA_CENTER_DATABASE_URL = "https://sl-transit-9464e-default-rtdb.asia-southeast1.firebasedatabase.app";
const EMULATOR_DATABASE_URL = "http://127.0.0.1:9000?ns=sl-transit-9464e-default-rtdb";
admin.initializeApp({ databaseURL: process.env.FUNCTIONS_EMULATOR === "true" ? EMULATOR_DATABASE_URL : ERP_DATA_CENTER_DATABASE_URL });
const SERVER_TIMESTAMP = { ".sv": "timestamp" };
const MAX_CAPACITY_LIMIT = 300;

const ERP_READ_SCOPES = Object.freeze({
  access: { path: "data/erpDataCenter/meta/access", root: null, envelope: [] },
  root: { path: "data/erpDataCenter", root: null, envelope: [] },
  workbookSource: { path: "data/erpDataCenter/workbookSource", root: "workbookSource", envelope: ["workbookSource"] },
  stops: { path: "data/erpDataCenter/stops", root: "stops", envelope: ["stops"] },
  routes: { path: "data/erpDataCenter/routes", root: "routes", envelope: ["routes"] },
  trips: { path: "data/erpDataCenter/trips", root: "trips", envelope: ["trips"] },
  stopTimes: { path: "data/erpDataCenter/stopTimes", root: "stopTimes", envelope: ["stopTimes"] },
  fares: { path: "data/erpDataCenter/fares", root: "fares", envelope: ["fares"] },
  vehicles: { path: "data/erpDataCenter/fleet/vehicles", root: "fleet", envelope: ["fleet", "vehicles"] },
  queues: { path: "data/erpDataCenter/fleet/queues", root: "fleet", envelope: ["fleet", "queues"] },
  assignmentRules: { path: "data/erpDataCenter/fleet/assignmentRules", root: "fleet", envelope: ["fleet", "assignmentRules"] },
  serviceGroups: { path: "data/erpDataCenter/serviceGroups", root: "serviceGroups", envelope: ["serviceGroups"] },
  paymentOwnership: { path: "data/erpDataCenter/paymentOwnership", root: "paymentOwnership", envelope: ["paymentOwnership"] },
  routeFareRows: { path: "data/erpDataCenter/workbookSource/routeFareRows", root: "workbookSource", envelope: ["workbookSource", "routeFareRows"] },
  scheduleRows: { path: "data/erpDataCenter/workbookSource/scheduleRows", root: "workbookSource", envelope: ["workbookSource", "scheduleRows"] },
  manifest: { path: "data/erpDataCenter/workbookSource/manifest", root: "workbookSource", envelope: ["workbookSource", "manifest"] },
  reconciliation: { path: "data/erpDataCenter/workbookSource/reconciliation", root: "workbookSource", envelope: ["workbookSource", "reconciliation"] }
});

function envelopeRead(value, envelope) {
  return (envelope || []).reduceRight((out, key) => ({ [key]: out }), value);
}

const driverTicketCenter = require("./driver-ticket-center.js");
const driverWorkAutoCenter = require("./driver-work-auto-center.js");
const staffNotificationCenter = require("./staff-notification-center.js");
const notificationCenter = require("./notification-center.js");
const adminDashboardSummary = require("./admin-dashboard-summary.js");
const adminErpAuthorization = require("./admin-erp-authorization.js");

const lineToken = defineSecret("LINE_CHANNEL_ACCESS_TOKEN");
const staffLineToken = defineSecret("LINE_STAFF_CHANNEL_ACCESS_TOKEN");
// Legacy vocabulary is retained only for migration/audit scans. Notification
// state is now written exclusively under operations/notificationDispatch.
// Historical audit label: recipient: "passenger_line"
const LEGACY_NOTIFICATION_AUDIT_TERMS = ["skipped_no_passenger_line_target", "recipient: \"passenger_line\""];
const DEFAULT_PUBLISHED_TRIP_CAPACITY = 3;
const CANONICAL_ROUTE_FARE_COUNT = 244;
const CANONICAL_SCHEDULE_COUNT = 881;

function money(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function formatThaiDate(date) {
  const value = String(date || "");
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : (value || "-");
}

const adminDashboardRateState = new Map();
const cancellationRateState = new Map();

function setCors(req, res) {
  const origin = req.headers.origin || "";
  if (adminDashboardSummary.originAllowed(origin, process.env.FUNCTIONS_EMULATOR === "true")) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
}

function validatePublishedSchedulePayload(value) {
  const schedule = value && value.publishedSchedule && typeof value.publishedSchedule === "object"
    ? value.publishedSchedule
    : value;
  const blockers = [];
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) blockers.push("schedule_object_required");
  if (schedule && schedule.readyForApply === true) blockers.push("ready_for_apply_must_remain_false");
  if (schedule && !["published", "preview"].includes(String(schedule.publicationStatus || ""))) blockers.push("publication_status_required");
  if (schedule && schedule.scheduleRows && typeof schedule.scheduleRows !== "object") blockers.push("schedule_rows_must_be_object");
  if (schedule && schedule.noPublishedScheduleBehavior !== "hide") blockers.push("empty_schedule_behavior_must_be_hide");
  return { schedule, blockers };
}

function enrichScheduleDisplayLabels(schedule, stops) {
  const stopMap = stops && typeof stops === "object" ? stops : {};
  const fareRows = Object.values(schedule.routeFareRows || {});
  const routeFare = {};
  fareRows.forEach((row) => {
    if (row && row.routeId && !routeFare[row.routeId]) routeFare[row.routeId] = row;
  });
  Object.values(schedule.scheduleRows || {}).forEach((row) => {
    if (!row || typeof row !== "object") return;
    const fare = routeFare[row.routeId] || {};
    const fromKey = row.fromStopKey || fare.fromStopKey || "";
    const toKey = row.toStopKey || fare.toStopKey || "";
    const from = stopMap[fromKey] || {};
    const to = stopMap[toKey] || {};
    row.fromStopKey = fromKey;
    row.toStopKey = toKey;
    row.originNameTh = from.displayNameTh || from.nameTh || row.originNameTh || fare.fromNameTh || fromKey;
    row.destinationNameTh = to.displayNameTh || to.nameTh || row.destinationNameTh || fare.toNameTh || toKey;
  });
  return schedule;
}

exports.publishAdminSchedule = onRequest({
  region: "asia-southeast1",
  timeoutSeconds: 30,
  memory: "512MiB",
  maxInstances: 5
}, async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { sendJson(res, 405, { status: "error", error: "method_not_allowed" }); return; }
  const origin = req.headers.origin || "";
  if (!adminDashboardSummary.originAllowed(origin, process.env.FUNCTIONS_EMULATOR === "true")) {
    sendJson(res, 403, { status: "error", error: "origin_not_allowed" }); return;
  }
  const tokenMatch = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) { sendJson(res, 401, { status: "error", error: "admin_token_required" }); return; }
  try {
    const decoded = await admin.auth().verifyIdToken(tokenMatch[1]);
    if (decoded.slTransitRole !== "owner") { sendJson(res, 403, { status: "error", error: "owner_role_required" }); return; }
    const checked = validatePublishedSchedulePayload(parseJsonRequest(req));
    if (checked.blockers.length) { sendJson(res, 400, { status: "error", error: "schedule_validation_failed", blockers: checked.blockers }); return; }
    const schedule = checked.schedule;
    const stopsSnap = await admin.database().ref("data/erpDataCenter/stops").get();
    enrichScheduleDisplayLabels(schedule, stopsSnap.val() || {});
    const auditKey = `schedule_publish_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const existingSnap = await admin.database().ref("publishedSchedule").get();
    const existing = existingSnap.val() || {};
    const published = Object.assign({}, existing, schedule, {
      publicationStatus: "published",
      readyForApply: false,
      publishedAt: new Date().toISOString(),
      publishedByUid: decoded.uid,
      publishedByEmail: decoded.email || "",
      publicationVersion: auditKey
    });
    const canonicalManifest = Object.assign({}, schedule.manifest || {}, {
      schemaVersion: "erpWorkbookSource.v1",
      publicationStatus: "published",
      generatedAt: published.publishedAt,
      publishedAt: published.publishedAt,
      readyForApply: false,
      productionReady: false,
      sourceWorkbookName: schedule.sourceWorkbook && schedule.sourceWorkbook.name || schedule.sourceWorkbookName || "",
      counts: {
        routeFareRows: Object.keys(schedule.routeFareRows || {}).length,
        scheduleRows: Object.keys(schedule.scheduleRows || {}).length
      }
    });
    const updates = {
      publishedSchedule: published,
      "data/erpDataCenter/workbookSource/routeFareRows": schedule.routeFareRows || {},
      "data/erpDataCenter/workbookSource/scheduleRows": schedule.scheduleRows || {},
      "data/erpDataCenter/workbookSource/manifest": canonicalManifest,
      [`data/erpDataCenter/meta/audit/${auditKey}`]: {
        actorUid: decoded.uid,
        actorEmail: decoded.email || "",
        action: "publish_schedule_and_workbook_source",
        publicationVersion: auditKey,
        scheduleRowCount: Object.keys(schedule.scheduleRows || {}).length,
        routeFareRowCount: Object.keys(schedule.routeFareRows || {}).length,
        approvedScope: schedule.approvedScope || [],
        createdAt: Date.now()
      }
    };
    await admin.database().ref().update(updates);
    sendJson(res, 200, { status: "published", publicationVersion: auditKey, publishedAt: published.publishedAt, canonicalSourceUpdated: true });
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    if (/token|auth|credential/i.test(message)) { sendJson(res, 401, { status: "error", error: "invalid_admin_token" }); return; }
    console.error("publishAdminSchedule failed", { message });
    sendJson(res, 500, { status: "error", error: "schedule_publish_failed" });
  }
});

function checkAdminDashboardRate(origin) {
  const key = String(origin || "no-origin");
  const now = Date.now();
  const windowMs = 60 * 1000;
  const max = 60;
  const state = adminDashboardRateState.get(key) || { start: now, count: 0 };
  if (now - state.start > windowMs) {
    state.start = now;
    state.count = 0;
  }
  state.count += 1;
  adminDashboardRateState.set(key, state);
  return state.count <= max;
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  if (Buffer.byteLength(text, "utf8") > 256 * 1024) {
    res.status(413).json({ status: "error", error: "response_too_large" });
    return;
  }
  res.status(status).type("application/json").send(text);
}

function checkCancellationRate(req) {
  const key = String(req.headers["x-forwarded-for"] || req.headers.origin || "unknown").split(",")[0].trim();
  const now = Date.now();
  const windowMs = 60 * 1000;
  const max = 10;
  const state = cancellationRateState.get(key) || { start: now, count: 0 };
  if (now - state.start > windowMs) { state.start = now; state.count = 0; }
  state.count += 1;
  cancellationRateState.set(key, state);
  return state.count <= max;
}

function normalizeBookingPhone(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function bookingDepartureMs(booking) {
  const date = String(booking && (booking.serviceDate || booking.date) || "");
  const time = String(booking && (booking.pickupTime || booking.time) || "").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return NaN;
  return Date.parse(`${date}T${time}:00+07:00`);
}

async function releaseBookingCapacityServer(booking, code) {
  const contract = booking && booking.capacity || {};
  const serviceDate = String(contract.serviceDate || booking.serviceDate || booking.date || "");
  const capacityKey = String(contract.capacityKey || "").replace(/[^A-Za-z0-9_-]/g, "_");
  const counterPath = capacityCounterPath(serviceDate, capacityKey);
  if (!counterPath || String(contract.bookingCode || code) !== code) return { status: "skipped", reason: "missing_capacity_contract" };
  const requestedSeats = Math.max(1, Number(contract.requestedSeats || booking.seats || booking.pax || 1));
  const ref = admin.database().ref(counterPath);
  const result = await ref.transaction((current) => {
    if (!current || !current.bookings || !current.bookings[code]) return current;
    const bookings = { ...current.bookings };
    delete bookings[code];
    const bookedSeats = Math.max(0, Number(current.bookedSeats || 0) - requestedSeats);
    return { ...current, bookedSeats, seatsAvailable: Math.max(0, Number(current.capacityLimit || 0) - bookedSeats), bookings, updatedAt: Date.now() };
  });
  return { status: result.committed ? "released" : "skipped", counterPath };
}

async function requireAdminToken(req) {
  const authHeader = String(req.headers.authorization || "");
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    const error = new Error("admin_token_required");
    error.statusCode = 401;
    throw error;
  }
  const decoded = await admin.auth().verifyIdToken(tokenMatch[1]);
  const adminSnap = await admin.database().ref(`data/erpDataCenter/adminAccounts/${decoded.uid}`).get();
  if (adminSnap.val() !== true && decoded.admin !== true && decoded.role !== "admin") {
    const error = new Error("admin_account_required");
    error.statusCode = 403;
    throw error;
  }
  return decoded;
}

async function requireUserToken(req) {
  const authHeader = String(req.headers.authorization || "");
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    const error = new Error("user_token_required");
    error.statusCode = 401;
    throw error;
  }
  return admin.auth().verifyIdToken(tokenMatch[1]);
}

function validCapacityPart(value, maxLength) {
  const text = String(value || "");
  return text.length > 0 && text.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(text);
}

function capacityCounterPath(serviceDate, capacityKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(serviceDate || "")) || !validCapacityPart(capacityKey, 240)) return null;
  return `operations/bookingCapacityByServiceDate/${serviceDate}/${capacityKey}`;
}

async function readCanonicalWorkbookSource() {
  const snap = await admin.database().ref("data/erpDataCenter/workbookSource").get();
  const source = snap.val() || {};
  return {
    manifest: source.manifest || {},
    routeFareRows: source.routeFareRows || {},
    scheduleRows: source.scheduleRows || {}
  };
}

function canonicalWorkbookReady(source) {
  return Object.keys(source.routeFareRows || {}).length === CANONICAL_ROUTE_FARE_COUNT &&
    Object.keys(source.scheduleRows || {}).length === CANONICAL_SCHEDULE_COUNT;
}

function findCanonicalWorkbookPair(source, booking) {
  const fareRows = Object.values(source.routeFareRows || {});
  const scheduleRows = Object.values(source.scheduleRows || {});
  const wantedPairIds = [booking.pairKey, booking.pairId, booking.canonicalPairKey].filter(Boolean).map(String);
  const fare = fareRows.find((row) => {
    if (!row || !wantedPairIds.includes(String(row.sourceRowId || ""))) return false;
    if (booking.routeId && String(row.routeId || "") !== String(booking.routeId)) return false;
    if (booking.origin && String(row.fromNameTh || "") !== String(booking.origin)) return false;
    if (booking.destination && String(row.toNameTh || "") !== String(booking.destination)) return false;
    return String(row.status == null ? "" : row.status).toLowerCase() !== "false";
  });
  if (!fare) return null;
  const wantedTripIds = [booking.tripId, booking.catalogTripId].filter(Boolean).map(String);
  const trip = scheduleRows.find((row) => {
    if (!row || String(row.routeId || "") !== String(fare.routeId || "")) return false;
    if (wantedTripIds.length && !wantedTripIds.includes(String(row.scheduleOfferId || ""))) return false;
    if (booking.pickupTime && String(row.departureTime || "") !== String(booking.pickupTime)) return false;
    if (String(row.originNameTh || "") !== String(fare.fromNameTh || "")) return false;
    if (String(row.destinationNameTh || "") !== String(fare.toNameTh || "")) return false;
    return row.bookingEnabled !== false && String(row.bookingEnabled || "").toLowerCase() !== "false";
  });
  if (!trip) return null;
  const fareAmount = Number(fare.amount);
  if (!Number.isFinite(fareAmount) || fareAmount < 0) return null;
  return {
    pairKey: String(fare.sourceRowId || ""),
    pairId: String(fare.sourceRowId || ""),
    canonicalPairKey: String(fare.sourceRowId || ""),
    routeId: String(fare.routeId || ""),
    originLabel: String(fare.fromNameTh || ""),
    destinationLabel: String(fare.toNameTh || ""),
    fareAmount,
    fareContract: { status: "ready", fareAmount, serviceFeeAmount: 0, paymentOwnership: "sl_transit" },
    scheduleOfferId: String(trip.scheduleOfferId || ""),
    scheduleRowId: String(trip.sourceRowId || ""),
    capacity: Number(trip.capacity) || DEFAULT_PUBLISHED_TRIP_CAPACITY
  };
}

async function resolvePublishedCapacity({ serviceDate, pairKey, tripKey, routeKey, pickupTime }) {
  const source = await readCanonicalWorkbookSource();
  if (!canonicalWorkbookReady(source)) return null;
  const rows = source.scheduleRows;
  const wantedTrip = String(tripKey || "");
  const wantedRoute = String(routeKey || "");
  const wantedTime = String(pickupTime || "");
  const row = Object.values(rows).find((candidate) => {
    if (!candidate || candidate.bookingEnabled === false || String(candidate.bookingEnabled || "").toLowerCase() === "false") return false;
    const sameTrip = wantedTrip && String(candidate.scheduleOfferId || "") === wantedTrip;
    const sameRoute = !wantedRoute || String(candidate.routeId || "") === wantedRoute;
    const sameTime = !wantedTime || String(candidate.departureTime || "") === wantedTime;
    return sameTrip && sameRoute && sameTime;
  });
  if (!row) return null;
  const configuredLimit = Number(row.capacity);
  const limit = Number.isInteger(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : DEFAULT_PUBLISHED_TRIP_CAPACITY;
  if (limit > MAX_CAPACITY_LIMIT) return null;
  return {
    capacityLimit: limit,
    bookedSeats: 0,
    seatsAvailable: limit,
    bookings: {},
    serviceDate: String(serviceDate || ""),
    source: Number.isInteger(configuredLimit) && configuredLimit > 0
      ? "data/erpDataCenter/workbookSource/scheduleRows"
      : "data/erpDataCenter/workbookSource/defaultCapacityPolicy",
    sourceRowId: String(row.sourceRowId || ""),
    updatedAt: SERVER_TIMESTAMP
  };
}

async function readSystemTestMode() {
  const snap = await admin.database().ref("settings/systemTestMode").get();
  return snap.val() || {};
}

function testModeResponse(res) {
  sendJson(res, 503, { status: "blocked", error: "system_test_mode_enabled", message: "ระบบกำลังทดสอบ จึงยังไม่รับรายการนี้" });
}

exports.reserveBookingCapacity = onRequest({
  region: "asia-southeast1",
  timeoutSeconds: 15,
  memory: "256MiB",
  maxInstances: 20
}, async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { sendJson(res, 405, { status: "error", error: "method_not_allowed" }); return; }
  try {
    const decoded = await requireUserToken(req);
    if ((await readSystemTestMode()).enabled === true) { testModeResponse(res); return; }
    const body = parseJsonRequest(req);
    const action = body.action || "reserve";
    const path = capacityCounterPath(body.serviceDate, body.capacityKey);
    const bookingCode = String(body.bookingCode || "");
    const requestedSeats = Number(body.requestedSeats);
    if (!path || !validCapacityPart(bookingCode, 80) || !Number.isInteger(requestedSeats) || requestedSeats < 1 || requestedSeats > 10) {
      sendJson(res, 400, { status: "error", error: "invalid_capacity_request" });
      return;
    }
    const ref = admin.database().ref(path);
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
        sendJson(res, 409, { status: "error", error: "capacity_full_or_not_ready" });
        return;
      }
    }
    if (action === "release") {
      const result = await ref.transaction((current) => {
        if (!current || !current.bookings || !current.bookings[bookingCode]) return current;
        const existing = current.bookings[bookingCode];
        if (existing.ownerUid !== decoded.uid) return current;
        const bookings = { ...current.bookings };
        delete bookings[bookingCode];
        const bookedSeats = Math.max(0, Number(current.bookedSeats || 0) - Number(existing.seats || requestedSeats));
        return { ...current, bookedSeats, seatsAvailable: Math.max(0, Number(current.capacityLimit || 0) - bookedSeats), bookings, updatedAt: SERVER_TIMESTAMP };
      });
      sendJson(res, 200, { status: "ok", action: "release", committed: result.committed === true });
      return;
    }
    const result = await ref.transaction((current) => {
      const state = current || initialCapacity;
      if (!state) return;
      const transactionCapacityLimit = Number(state.capacityLimit);
      if (!Number.isInteger(transactionCapacityLimit) || transactionCapacityLimit < 1 || transactionCapacityLimit > MAX_CAPACITY_LIMIT) return;
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
      sendJson(res, existing && existing.ownerUid === decoded.uid ? 200 : 409, { status: "error", error: existing ? "capacity_already_reserved" : "capacity_full_or_not_ready" });
      return;
    }
    const value = result.snapshot.val() || {};
    sendJson(res, 200, { status: "ok", action: "reserve", committed: true, capacityLimit: value.capacityLimit, bookedSeats: value.bookedSeats, seatsAvailable: value.seatsAvailable });
  } catch (error) {
    sendJson(res, Number(error.statusCode) || 500, { status: "error", error: error.message || "capacity_request_failed" });
  }
});

function cleanBookingText(value, maxLength) {
  const text = String(value == null ? "" : value).trim();
  return text.length <= maxLength ? text : text.slice(0, maxLength);
}

exports.createBooking = onRequest({
  region: "asia-southeast1",
  timeoutSeconds: 15,
  memory: "256MiB",
  maxInstances: 20
}, async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { sendJson(res, 405, { status: "error", error: "method_not_allowed" }); return; }
  try {
    const decoded = await requireUserToken(req);
    if ((await readSystemTestMode()).enabled === true) { testModeResponse(res); return; }
    const body = parseJsonRequest(req);
    const input = body.booking && typeof body.booking === "object" ? body.booking : {};
    const code = cleanBookingText(input.code || input.bookingCode, 80);
    const pax = Number(input.pax == null ? input.seats : input.pax);
    const date = cleanBookingText(input.date || input.serviceDate, 10);
    const phone = cleanBookingText(input.phone, 20);
    if (!validCapacityPart(code, 80) || !Number.isInteger(pax) || pax < 1 || pax > 10 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^0[689]\d{8}$/.test(phone)) {
      sendJson(res, 400, { status: "error", error: "invalid_booking_request" });
      return;
    }
    const source = await readCanonicalWorkbookSource();
    let pair = canonicalWorkbookReady(source) ? findCanonicalWorkbookPair(source, input) : null;
    if (!pair && process.env.FUNCTIONS_EMULATOR === "true") {
      const emulatorSchedule = (await admin.database().ref("publishedSchedule").get()).val() || {};
      const pairs = emulatorSchedule.pairs || {};
      const wanted = [input.pairKey, input.pairId, input.canonicalPairKey].filter(Boolean).map(String);
      pair = Object.entries(pairs).map(([key, value]) => ({ key, ...(value || {}) })).find((candidate) =>
        wanted.includes(String(candidate.key)) || wanted.includes(String(candidate.pairKey || "")) || wanted.includes(String(candidate.pairId || ""))
      ) || null;
    }
    if (!canonicalWorkbookReady(source) && process.env.FUNCTIONS_EMULATOR !== "true") {
      sendJson(res, 409, { status: "error", error: "canonical_workbook_source_not_ready" });
      return;
    }
    const serverFare = Number(pair && pair.fareAmount);
    const serverFee = Number(pair && pair.fareContract && pair.fareContract.serviceFeeAmount || 0);
    const expectedTotal = (serverFare + serverFee) * pax;
    if (!pair || !Number.isFinite(serverFare) || serverFare < 0 || !Number.isFinite(serverFee) || serverFee < 0 || Number(input.fareAmount) !== serverFare || Number(input.price) !== expectedTotal || Number(input.fare) !== expectedTotal) {
      sendJson(res, 409, { status: "error", error: "authoritative_price_mismatch" });
      return;
    }
    const paymentMode = input.paymentMode === "onsite" ? "onsite" : "transfer";
    const paymentStatus = paymentMode === "onsite" ? "pay_on_site" : (input.slipUploaded === true ? "slip_uploaded" : "awaiting_payment");
    const booking = {
      code, bookingCode: code, ownerUid: decoded.uid, source: "booking1.html", sourceMode: "erp_data_center",
      name: cleanBookingText(input.name, 120), phone, pax, seats: pax, date, serviceDate: date,
      time: cleanBookingText(input.time || input.pickupTime, 20), pickupTime: cleanBookingText(input.pickupTime || input.time, 20),
      origin: cleanBookingText(input.origin, 120), destination: cleanBookingText(input.destination, 120),
      originKey: cleanBookingText(input.originKey, 120), destKey: cleanBookingText(input.destKey, 120),
      pairKey: cleanBookingText(input.pairKey, 160), pairId: cleanBookingText(input.pairId, 160), canonicalPairKey: cleanBookingText(input.canonicalPairKey, 160),
      fare: expectedTotal, price: expectedTotal, fareAmount: serverFare, fareContract: pair.fareContract || null,
      paymentMode, paymentStatus, slipUploaded: paymentStatus === "slip_uploaded", paymentOwnership: "sl_transit",
      externalPaymentRequired: false, testMode: false, mockPayment: false, status: "awaiting_payment",
      passengerIdentity: input.passengerIdentity || null, notificationPreference: input.notificationPreference || null,
      consent: input.consent || null, assignment: input.assignment || null, capacity: input.capacity || null,
      publishedSchedule: { readyForApply: false, schemaVersion: source.manifest.schemaVersion || "erpWorkbookSource.v1" }, createdAt: SERVER_TIMESTAMP
    };
    const bookingRef = admin.database().ref(`bookings/${code}`);
    const result = await bookingRef.transaction((current) => current ? undefined : booking);
    if (!result.committed) {
      sendJson(res, 409, { status: "error", error: "booking_already_exists" });
      return;
    }
    sendJson(res, 201, { status: "ok", booking: result.snapshot.val() });
  } catch (error) {
    sendJson(res, Number(error.statusCode) || 500, { status: "error", error: error.message || "booking_create_failed" });
  }
});

exports.cancelBooking = onRequest({
  region: "asia-southeast1",
  timeoutSeconds: 15,
  memory: "256MiB",
  maxInstances: 20
}, async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { sendJson(res, 405, { status: "error", error: "method_not_allowed" }); return; }
  if (!checkCancellationRate(req)) { sendJson(res, 429, { status: "error", error: "too_many_requests" }); return; }
  try {
    const body = parseJsonRequest(req);
    const code = cleanBookingText(body.bookingCode || body.code, 80);
    const phone = normalizeBookingPhone(body.phone);
    const action = body.action === "cancel" ? "cancel" : "lookup";
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(code) || !/^0[689]\d{8}$/.test(phone)) {
      sendJson(res, 400, { status: "error", error: "booking_code_and_phone_required" });
      return;
    }
    const ref = admin.database().ref(`bookings/${code}`);
    const before = await ref.get();
    const booking = before.val();
    if (!booking || normalizeBookingPhone(booking.phone) !== phone) {
      sendJson(res, 404, { status: "error", error: "booking_not_found" });
      return;
    }
    if (action === "lookup") {
      sendJson(res, 200, { status: "ok", booking: {
        code,
        name: cleanBookingText(booking.name, 120),
        phone,
        origin: cleanBookingText(booking.origin, 120),
        destination: cleanBookingText(booking.destination, 120),
        date: cleanBookingText(booking.date || booking.serviceDate, 10),
        serviceDate: cleanBookingText(booking.serviceDate || booking.date, 10),
        time: cleanBookingText(booking.time || booking.pickupTime, 20),
        seats: Math.max(1, Number(booking.seats || booking.pax || 1)),
        status: cleanBookingText(booking.status, 40) || "confirmed"
      } });
      return;
    }
    if (booking.status === "cancelled") {
      sendJson(res, 409, { status: "error", error: "booking_already_cancelled" });
      return;
    }
    if (!Number.isFinite(bookingDepartureMs(booking)) || bookingDepartureMs(booking) - Date.now() < 60 * 60 * 1000) {
      sendJson(res, 409, { status: "error", error: "cancellation_window_closed" });
      return;
    }
    await ref.update({ status: "cancelled", cancelledAt: Date.now(), officialStatus: "ยกเลิกแล้ว", ticketActionContract: "ticket_action_center_cancel_v1" });
    const after = await ref.get();
    const afterBooking = after.val();
    if (!afterBooking || afterBooking.status !== "cancelled" || normalizeBookingPhone(afterBooking.phone) !== phone) {
      sendJson(res, 409, { status: "error", error: "booking_changed_or_already_cancelled" });
      return;
    }
    const capacityRelease = await releaseBookingCapacityServer(booking, code);
    sendJson(res, 200, { status: "ok", booking: { code, status: "cancelled" }, capacityRelease });
  } catch (error) {
    sendJson(res, Number(error.statusCode) || 500, { status: "error", error: "booking_cancellation_failed" });
  }
});

exports.updateSystemTestMode = onRequest({
  region: "asia-southeast1",
  timeoutSeconds: 15,
  memory: "256MiB",
  maxInstances: 5
}, async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { sendJson(res, 405, { status: "error", error: "method_not_allowed" }); return; }
  try {
    const decoded = await requireAdminToken(req);
    const body = parseJsonRequest(req);
    const enabled = body.enabled === true;
    const config = {
      enabled,
      title: cleanBookingText(body.title, 120) || "กำลังทดสอบระบบ",
      message: cleanBookingText(body.message, 500) || "ทีมงานกำลังทดสอบระบบเพื่อให้บริการได้มั่นคงขึ้น",
      reason: cleanBookingText(body.reason, 500) || "ระหว่างนี้จะไม่สามารถสร้างรายการจองหรือส่งข้อความแจ้งเตือนได้",
      mockOnly: enabled,
      noPaidConnections: enabled,
      updatedBy: decoded.uid,
      updatedAt: SERVER_TIMESTAMP
    };
    await admin.database().ref("settings/systemTestMode").set(config);
    sendJson(res, 200, { status: "ok", config: { ...config, updatedBy: decoded.uid } });
  } catch (error) {
    sendJson(res, Number(error.statusCode) || 500, { status: "error", error: error.message || "system_test_mode_update_failed" });
  }
});

function mergeSnapshots(snaps) {
  const out = {};
  snaps.forEach((snap) => {
    const val = snap && snap.val && snap.val() || {};
    Object.keys(val || {}).forEach((key) => { out[key] = val[key]; });
  });
  return out;
}

function dayMs(dayKey) {
  const match = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), -7, 0, 0, 0);
}

function mergeWebsiteAnalytics(days, range) {
  if (range === "hourly") return null;
  const out = {};
  Object.keys(days || {}).forEach((dayKey) => {
    const ms = dayMs(dayKey);
    if (ms == null) return;
    const bucketKey = adminDashboardSummary.bucketForMs(range, ms);
    const rec = days[dayKey] || {};
    out[bucketKey] = out[bucketKey] || { visitors: 0, actualUsers: 0 };
    out[bucketKey].visitors += Number(rec.pageViews || 0);
    out[bucketKey].actualUsers += Number(rec.count || 0);
  });
  return out;
}

exports.readAdminDashboardSummary = onRequest({
  region: "asia-southeast1",
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 10
}, async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { status: "error", error: "method_not_allowed" });
    return;
  }
  const origin = req.headers.origin || "";
  const emulator = process.env.FUNCTIONS_EMULATOR === "true";
  if (!adminDashboardSummary.originAllowed(origin, emulator)) {
    sendJson(res, 403, { status: "error", error: "origin_not_allowed" });
    return;
  }
  if (!checkAdminDashboardRate(origin)) {
    sendJson(res, 429, { status: "error", error: "rate_limited" });
    return;
  }
  let includePrivateRefunds = false;
  try {
    await requireAdminToken(req);
    includePrivateRefunds = true;
  } catch (err) {
    sendJson(res, err.statusCode || 401, { status: "error", error: err.statusCode === 403 ? "admin_account_required" : "invalid_admin_token" });
    return;
  }
  const range = String(req.query.range || "daily");
  const anchor = String(req.query.anchor || "");
  const now = Date.now();
  const window = adminDashboardSummary.queryWindow(range, anchor || null, now);
  const dateWindow = adminDashboardSummary.queryDateWindow(range, anchor || null, now);
  if (!window) {
    sendJson(res, 400, { status: "error", error: "invalid_range_or_anchor" });
    return;
  }
  try {
    const [
      bookingSnap,
      travelDateSnap,
      travelServiceDateSnap,
      cancelledSnap,
      refundedSnap,
      refundApprovedSnap,
      fleetMasterSnap,
      serviceGroupsSnap,
      websiteAnalyticsSnap
    ] = await Promise.all([
      admin.database().ref("bookings").orderByChild("ts").startAt(window.startMs).endAt(window.endMs).get(),
      admin.database().ref("bookings").orderByChild("date").startAt(dateWindow.startDate).endAt(dateWindow.endDate).get(),
      admin.database().ref("bookings").orderByChild("serviceDate").startAt(dateWindow.startDate).endAt(dateWindow.endDate).get(),
      admin.database().ref("bookings").orderByChild("cancelledAt").startAt(window.startMs).endAt(window.endMs).get(),
      admin.database().ref("bookings").orderByChild("refundedAt").startAt(window.startMs).endAt(window.endMs).get(),
      admin.database().ref("bookings").orderByChild("refundApprovedAt").startAt(window.startMs).endAt(window.endMs).get(),
      admin.database().ref("data/erpDataCenter/fleet").get(),
      admin.database().ref("data/erpDataCenter/serviceGroups").get(),
      range === "hourly"
        ? Promise.resolve(null)
        : admin.database().ref("analytics/mainWeb").orderByKey().startAt(dateWindow.startDate).endAt(dateWindow.endDate).get()
    ]);
    const summary = adminDashboardSummary.aggregateDashboard(bookingSnap.val() || {}, {
      range,
      anchor: anchor || undefined,
      nowMs: now,
      travelRecords: mergeSnapshots([travelDateSnap, travelServiceDateSnap]),
      cancelledRecords: cancelledSnap.val() || {},
      refundedRecords: mergeSnapshots([refundedSnap, refundApprovedSnap]),
      includePrivateRefunds,
      fleetMaster: Object.assign({}, fleetMasterSnap.val() || {}, { serviceGroups: serviceGroupsSnap.val() || {} }),
      websiteRollups: websiteAnalyticsSnap ? mergeWebsiteAnalytics(websiteAnalyticsSnap.val() || {}, range) : null
    });
    res.set("Cache-Control", "private, max-age=30");
    sendJson(res, 200, summary);
  } catch (err) {
    console.error("readAdminDashboardSummary failed", { message: err && err.message ? err.message : String(err) });
    sendJson(res, 500, { status: "error", error: "dashboard_summary_unavailable" });
  }
});

exports.readAdminErpDataCenter = onRequest({
  region: "asia-southeast1",
  timeoutSeconds: 30,
  memory: "512MiB",
  maxInstances: 10
}, async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { status: "error", error: "method_not_allowed" });
    return;
  }
  const origin = req.headers.origin || "";
  const emulator = process.env.FUNCTIONS_EMULATOR === "true";
  if (!adminDashboardSummary.originAllowed(origin, emulator)) {
    sendJson(res, 403, { status: "error", error: "origin_not_allowed" });
    return;
  }
  if (!checkAdminDashboardRate(origin)) {
    sendJson(res, 429, { status: "error", error: "rate_limited" });
    return;
  }
  const scope = String(req.query.scope || "root");
  const readScope = ERP_READ_SCOPES[scope];
  if (!readScope) {
    sendJson(res, 400, { status: "error", error: "unsupported_erp_read_scope" });
    return;
  }
  const authHeader = String(req.headers.authorization || "");
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    sendJson(res, 401, { status: "error", error: "admin_token_required" });
    return;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(tokenMatch[1]);
    const adminSnap = await admin.database().ref(`data/erpDataCenter/adminAccounts/${decoded.uid}`).get();
    const access = adminErpAuthorization.accessFor(decoded, adminSnap.val());
    if (!access.authenticated || !access.can("read")) {
      sendJson(res, 403, { status: "error", error: "admin_erp_read_permission_required" });
      return;
    }
    if (scope === "access") {
      res.set("Cache-Control", "private, max-age=30");
      sendJson(res, 200, { status: "ready", path: readScope.path, erpDataCenter: {}, permissions: access.permissions, roles: access.roles, generatedAt: Date.now() });
      return;
    }
    if (readScope.root && !access.roots.includes(readScope.root)) {
      sendJson(res, 403, { status: "error", error: "admin_erp_scope_permission_required", scope });
      return;
    }
    const snap = await admin.database().ref(readScope.path).get();
    const scoped = adminErpAuthorization.sanitizeReadModel(envelopeRead(snap.val() || {}, readScope.envelope), access);
    res.set("Cache-Control", "private, max-age=30");
    res.status(200).type("application/json").send(JSON.stringify({ status: "ready", path: readScope.path, erpDataCenter: scoped, permissions: access.permissions, roles: access.roles, generatedAt: Date.now() }));
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    if (/token|auth|credential/i.test(message)) {
      sendJson(res, 401, { status: "error", error: "invalid_admin_token" });
      return;
    }
    console.error("readAdminErpDataCenter failed", { message });
    sendJson(res, 500, { status: "error", error: "erp_data_center_unavailable" });
  }
});

function parseJsonRequest(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (!req.rawBody) return {};
  try {
    return JSON.parse(req.rawBody.toString("utf8") || "{}");
  } catch (err) {
    return {};
  }
}

function scalarErpValue(value) {
  return value === null || ["string", "number", "boolean"].indexOf(typeof value) !== -1;
}

function allowedErpUpdatePath(path) {
  const value = String(path || "");
  if (value.length > 220 || value.indexOf("..") !== -1 || value.indexOf("//") !== -1) return false;
  return [
    /^data\/erpDataCenter\/stops\/[^/]+\/[^/]+$/,
    /^data\/erpDataCenter\/serviceGroups\/[^/]+\/[^/]+$/,
    /^data\/erpDataCenter\/fares\/[^/]+\/[^/]+\/[^/]+$/,
    /^data\/erpDataCenter\/scheduleOffers\/[^/]+\/[^/]+$/,
    /^data\/erpDataCenter\/workbookSource\/routeFareRows\/fare_[0-9]{4}\/[^/]+$/,
    /^data\/erpDataCenter\/workbookSource\/scheduleRows\/schedule_[0-9]{4}\/[^/]+$/,
    /^data\/erpDataCenter\/stopTimes\/[^/]+\/[^/]+$/,
    /^data\/erpDataCenter\/fleet\/vehicles\/[^/]+\/[^/]+$/,
    /^data\/erpDataCenter\/paymentOwnership\/[^/]+\/[^/]+$/,
    /^data\/erpDataCenter\/fleet\/assignmentRules\/[^/]+\/[^/]+$/
  ].some((pattern) => pattern.test(value));
}

exports.updateAdminErpDataCenter = onRequest({
  region: "asia-southeast1",
  timeoutSeconds: 30,
  memory: "256MiB",
  maxInstances: 10
}, async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { status: "error", error: "method_not_allowed" });
    return;
  }
  const origin = req.headers.origin || "";
  const emulator = process.env.FUNCTIONS_EMULATOR === "true";
  if (!adminDashboardSummary.originAllowed(origin, emulator)) {
    sendJson(res, 403, { status: "error", error: "origin_not_allowed" });
    return;
  }
  if (!checkAdminDashboardRate(origin)) {
    sendJson(res, 429, { status: "error", error: "rate_limited" });
    return;
  }
  const tokenMatch = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    sendJson(res, 401, { status: "error", error: "admin_token_required" });
    return;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(tokenMatch[1]);
    const adminSnap = await admin.database().ref(`data/erpDataCenter/adminAccounts/${decoded.uid}`).get();
    const access = adminErpAuthorization.accessFor(decoded, adminSnap.val());
    if (!access.authenticated || !access.can("edit")) {
      sendJson(res, 403, { status: "error", error: "admin_erp_edit_permission_required" });
      return;
    }
    sendJson(res, 409, { status: "error", error: "draft_workflow_required", productionWrite: false });
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    if (err && err.statusCode) {
      sendJson(res, err.statusCode, { status: "error", error: err.statusCode === 403 ? "admin_account_required" : "invalid_admin_token" });
      return;
    }
    if (/token|auth|credential/i.test(message)) {
      sendJson(res, 401, { status: "error", error: "invalid_admin_token" });
      return;
    }
    console.error("updateAdminErpDataCenter failed", { message });
    sendJson(res, 500, { status: "error", error: "erp_data_center_update_failed" });
  }
});

function bookingRouteText(booking) {
  if (booking.route) return String(booking.route);
  const origin = booking.origin || booking.from || "-";
  const destination = booking.destination || booking.to || "-";
  return `${origin} → ${destination}`;
}
function isCheckinEvent(booking) {
  return booking.notificationOnly === true ||
    booking.notificationType === "checkin" ||
    booking.lineEvent === "checkin" ||
    (booking.linePayload && booking.linePayload.event === "checkin");
}

function buildCheckinMessage(booking) {
  if (booking.lineMessage) return booking.lineMessage;
  if (booking.linePayload && booking.linePayload.message) return booking.linePayload.message;
  return [
    "ผู้โดยสารเช็คอินใกล้ถึงจุดหมาย",
    "",
    `ชื่อ: ${booking.name || "-"}`,
    `เบอร์โทร: ${booking.phone || "-"}`,
    `เส้นทาง: ${bookingRouteText(booking)}`,
    `วันเวลา: ${booking.date || "-"} ${booking.time || "-"} น.`,
    `จำนวน: ${booking.seats || 1}`,
    "ใกล้ถึงจุดหมายอีก 3 นาที"
  ].join("\n");
}

function buildBookingMessage(booking) {
  const lines = [
    `รหัส: ${booking.code || "-"}`,
    `👤 ชื่อ: ${booking.name || "-"}    📞 โทร: ${booking.phone || "-"}`,
    `📍 เส้นทาง: ${bookingRouteText(booking)}`,
    `🗓 วันที่: ${formatThaiDate(booking.date)} เวลา ${booking.time || "-"} น.`,
    `🚌 จำนวน: ${booking.seats || 1} คน  💰 ราคา: ${money(booking.price)} บาท`
  ];
  if (booking.slip) lines.push(`🖼 สลิป: ${booking.slip}`);
  return lines.join("\n");
}

function isTransferSlipBooking(booking) {
  return booking && booking.slipVerifyProvider === "slip2go";
}

function passengerLineUserId(booking) {
  const identity = booking && booking.passengerIdentity || {};
  if (identity.provider !== "line") return "";
  return String(identity.lineUserId || "").trim();
}

function canNotifyPassengerLine(booking, eventName) {
  const preference = booking && booking.notificationPreference || {};
  if (eventName === "checkin") return preference.lineTripUpdates === true;
  return preference.lineTicket === true;
}

function safeJobId(code, eventType, channelKind, recipientType, recipientId) {
  return notificationCenter.safeJobId(code, eventType, channelKind, recipientType, recipientId);
}

function stableRetryKey(jobId) {
  const crypto = require("crypto");
  return notificationCenter.retryKey(jobId);
}

async function enqueueNotification(db, { code, eventType, channelKind, recipientType, recipientId, lineTo, text, testMode, mockOnly }) {
  const resolvedChannel = channelKind || notificationCenter.channelKind(recipientType);
  const resolvedToken = resolvedChannel === "passenger" ? "passenger" : "staff";
  const jobId = safeJobId(code, eventType, resolvedChannel, recipientType, recipientId);
  const job = { bookingCode: code, eventType, channelKind: resolvedChannel, tokenKind: resolvedToken, recipient: { type: recipientType, id: recipientId, lineTo: lineTo || "" }, text: text || "", retryKey: stableRetryKey(jobId), createdAt: SERVER_TIMESTAMP, testMode: testMode === true, mockOnly: mockOnly === true };
  await db.ref(`operations/notificationJobs/${jobId}`).transaction((current) => current || job);
  return jobId;
}

async function createBookingJobs(code, booking) {
  const db = admin.database();
  const jobs = [];
  const passenger = passengerLineUserId(booking);
  if (passenger && (booking.notificationPreference || {}).lineTicket === true) {
    jobs.push(enqueueNotification(db, { code, eventType: "booking_created", channelKind: "passenger", recipientType: "passenger", recipientId: passenger, lineTo: passenger, text: buildBookingMessage(booking), testMode: booking.testMode, mockOnly: booking.mockOnly }));
  }
  const staffConfig = await staffNotificationCenter.readStaffLineTargetsConfig(db);
  const alerts = staffNotificationCenter.bookingCreatedStaffAlerts({ booking, staffConfig });
  const uniqueAlerts = notificationCenter.dedupeRecipients(alerts.map((alert) => ({ ...alert, type: alert.recipientRole, channelKind: "staff", lineTo: alert.lineTo })), { preserveRecipientType: true });
  for (const alert of uniqueAlerts) jobs.push(enqueueNotification(db, { code, eventType: "booking_created", channelKind: "staff", recipientType: alert.type, recipientId: alert.lineTo, lineTo: alert.lineTo, text: staffNotificationCenter.staffBookingMessage(alert, booking), testMode: booking.testMode, mockOnly: booking.mockOnly }));
  return Promise.all(jobs);
}

function buildCancellationStaffMessage(alert, booking) {
  return ["การยกเลิกการจอง", staffNotificationCenter.staffBookingMessage(alert, booking)].join("\n");
}

async function createCancellationJobs(code, booking) {
  const db = admin.database();
  const staffConfig = await staffNotificationCenter.readStaffLineTargetsConfig(db);
  const alerts = staffNotificationCenter.bookingCreatedStaffAlerts({ booking, staffConfig });
  const uniqueAlerts = notificationCenter.dedupeRecipients(alerts.map((alert) => ({ ...alert, type: alert.recipientRole, channelKind: "staff", lineTo: alert.lineTo })), { preserveRecipientType: true });
  return Promise.all(uniqueAlerts.map((alert) => enqueueNotification(db, {
    code,
    eventType: "booking_cancelled",
    channelKind: "staff",
    recipientType: alert.type,
    recipientId: alert.lineTo,
    lineTo: alert.lineTo,
    text: buildCancellationStaffMessage(alert, booking),
    testMode: booking.testMode,
    mockOnly: booking.mockOnly
  })));
}

exports.handleBookingCreated = onValueCreated({ ref: "/bookings/{code}", instance: "sl-transit-9464e-default-rtdb", region: "asia-southeast1", secrets: [lineToken, staffLineToken], timeoutSeconds: 30, memory: "256MiB", minInstances: 0, maxInstances: 1, concurrency: 1, retry: false }, async (event) => {
  let booking = event.data.val() || {};
  const code = event.params.code || booking.code || "";
  if (!driverTicketCenter.plannedVehicleId(booking)) {
    const serviceDate = driverTicketCenter.serviceDate(booking);
    if (serviceDate) {
      const [workSnap, groupStopsSnap] = await Promise.all([
        admin.database().ref(`operations/driverWorkByServiceDate/${serviceDate}`).get(),
        admin.database().ref("data/erpDataCenter/groupStops").get()
      ]);
      booking = driverTicketCenter.enrichBookingFromDriverWork(booking, workSnap.val() || {}, groupStopsSnap.val() || {});
    }
  }
  const updates = driverTicketCenter.buildDriverTicketMirrorUpdate(code, null, booking);
  if (Object.keys(updates).length) await admin.database().ref().update(updates);
  await createBookingJobs(code, booking);
  const serviceDate = driverTicketCenter.serviceDate(booking);
  if (serviceDate) await admin.database().ref(`operations/bookingsByServiceDate/${serviceDate}/${code}`).set({ bookingCode: code, serviceDate, indexedAt: SERVER_TIMESTAMP });
});

exports.handleBookingCancelled = onValueUpdated({ ref: "/bookings/{code}", instance: "sl-transit-9464e-default-rtdb", region: "asia-southeast1", secrets: [staffLineToken], timeoutSeconds: 30, memory: "256MiB", minInstances: 0, maxInstances: 1, concurrency: 1, retry: false }, async (event) => {
  const before = event.data.before.val() || {};
  const after = event.data.after.val() || {};
  if (before.status === "cancelled" || after.status !== "cancelled") return;
  await createCancellationJobs(event.params.code, after);
});

exports.handlePaymentStatusChanged = onValueUpdated({ ref: "/bookings/{code}/paymentStatus", instance: "sl-transit-9464e-default-rtdb", region: "asia-southeast1", secrets: [lineToken], timeoutSeconds: 30, memory: "256MiB", minInstances: 0, maxInstances: 1, concurrency: 1, retry: false }, async (event) => {
  if (event.data.before.val() === "payment_verified" || event.data.after.val() !== "payment_verified") return;
  const snap = await admin.database().ref(`bookings/${event.params.code}`).get();
  const booking = snap.val() || {};
  const to = passengerLineUserId(booking);
  if (to && (booking.notificationPreference || {}).lineTicket === true) await enqueueNotification(admin.database(), { code: event.params.code, eventType: "payment_verified", channelKind: "passenger", recipientType: "passenger", recipientId: to, lineTo: to, text: buildBookingMessage(booking), testMode: booking.testMode, mockOnly: booking.mockOnly });
});

exports.handleAssignmentChanged = onValueWritten({ ref: "/bookings/{code}/assignment", instance: "sl-transit-9464e-default-rtdb", region: "asia-southeast1", timeoutSeconds: 30, memory: "256MiB", minInstances: 0, maxInstances: 1, concurrency: 1, retry: false }, async (event) => {
  const before = event.data.before.val() || {}; const after = event.data.after.val() || {};
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const bookingSnap = await admin.database().ref(`bookings/${event.params.code}`).get(); const booking = bookingSnap.val() || {};
  const mirrorUpdates = driverTicketCenter.buildDriverTicketMirrorUpdate(
    event.params.code,
    Object.assign({}, booking, { assignment: before }),
    Object.assign({}, booking, { assignment: after })
  );
  if (Object.keys(mirrorUpdates).length) await admin.database().ref().update(mirrorUpdates);
  const configSnap = await admin.database().ref("data/notificationCenter/staffLineTargets").get();
  const recipients = notificationCenter.lookupAssignmentRecipients(after, configSnap.val() || {});
  const automated = booking.assignmentSource === "driver_work_by_service_date" || booking.suppressAssignmentNotification === true;
  const allowAutomated = (configSnap.val() || {}).allowAutomatedAssignmentNotifications === true;
  if (!automated || allowAutomated) await Promise.all(recipients.map((recipient) => enqueueNotification(admin.database(), { code: event.params.code, eventType: "assignment_changed", channelKind: "staff", recipientType: recipient.type, recipientId: recipient.lineTo, lineTo: recipient.lineTo, text: staffNotificationCenter.staffBookingMessage({ recipientRole: recipient.type, lineTo: recipient.lineTo }, booking), testMode: booking.testMode, mockOnly: booking.mockOnly })));
});

exports.handleCheckinCreated = onValueCreated({ ref: "/operations/bookingEvents/{code}/checkin/{eventId}", instance: "sl-transit-9464e-default-rtdb", region: "asia-southeast1", secrets: [lineToken], timeoutSeconds: 30, memory: "256MiB", minInstances: 0, maxInstances: 1, concurrency: 1, retry: false }, async (event) => {
  const value = event.data.val() || {}; const code = event.params.code; const to = value.lineUserId || "";
  if (to) await enqueueNotification(admin.database(), { code, eventType: "checkin", channelKind: "passenger", recipientType: "passenger", recipientId: to, lineTo: to, text: buildCheckinMessage(value), testMode: value.testMode, mockOnly: value.mockOnly });
});

exports.processNotificationJob = onValueCreated({ ref: "/operations/notificationJobs/{jobId}", instance: "sl-transit-9464e-default-rtdb", secrets: [lineToken, staffLineToken], region: "asia-southeast1", timeoutSeconds: 30, memory: "256MiB", minInstances: 0, maxInstances: 1, concurrency: 1, retry: false }, async (event) => {
  const jobId = event.params.jobId; const job = event.data.val() || {}; const db = admin.database(); const dispatchRef = db.ref(`operations/notificationDispatch/${jobId}`);
  const claim = await dispatchRef.transaction((current) => { const decision = notificationCenter.claimDecision(current, Date.now()); if (!decision.claim) return; return { ...(current || {}), status: "processing", attempts: decision.attempts, createdAt: (current && current.createdAt) || SERVER_TIMESTAMP, processingStartedAt: Date.now(), retryKey: job.retryKey, recipient: job.recipient, channelKind: job.channelKind || notificationCenter.channelKind(job.recipient?.type), tokenKind: job.tokenKind || notificationCenter.tokenKind(job.recipient?.type), eventType: job.eventType, bookingCode: job.bookingCode }; });
  if (!claim.committed) return;
  if (job.testMode === true || job.mockOnly === true || (await readSystemTestMode()).enabled === true) { await dispatchRef.update({ status: "mock_skipped", sentAt: SERVER_TIMESTAMP }); return; }
  const token = (job.tokenKind || notificationCenter.tokenKind(job.recipient?.type)) === "staff" ? staffLineToken.value() : lineToken.value();
  let attempt = Number((claim.snapshot && claim.snapshot.val() || {}).attempts || 1);
  while (attempt <= 3) {
    if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, notificationCenter.retryDelayMs(attempt)));
    let response;
    try {
      response = await fetch("https://api.line.me/v2/bot/message/push", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Line-Retry-Key": job.retryKey }, body: JSON.stringify({ to: job.recipient.lineTo, messages: [{ type: "text", text: job.text }] }) });
    } catch (error) {
      if (attempt >= 3) { await dispatchRef.update({ status: "failed", attempts: attempt, failedAt: SERVER_TIMESTAMP, errorCode: "network_timeout" }); return; }
      attempt += 1; await dispatchRef.update({ attempts: attempt, errorCode: "network_timeout" }); continue;
    }
    const classification = notificationCenter.classifyLineResponse(response.status);
      if (classification.status === "sent" || classification.status === "accepted_duplicate") { await dispatchRef.update({ status: classification.status, attempts: attempt, sentAt: SERVER_TIMESTAMP, httpStatus: response.status }); return; }
      if (!classification.retry) { await dispatchRef.update({ status: classification.status, attempts: 1, failedAt: SERVER_TIMESTAMP, httpStatus: response.status, errorCode: `line_${response.status}` }); return; }
      if (attempt >= 3) { await dispatchRef.update({ status: "failed", attempts: attempt, failedAt: SERVER_TIMESTAMP, httpStatus: response.status, errorCode: `line_${response.status}` }); return; }
    attempt += 1; await dispatchRef.update({ attempts: attempt, httpStatus: response.status, errorCode: `line_${response.status}` });
  }
});

exports.sendFcmWakeOnDriverCommand = onValueWritten({
  ref: "/driverCommands/{vehicleId}/command",
  instance: "sl-transit-9464e-default-rtdb",
  region: "asia-southeast1",
  timeoutSeconds: 30,
  memory: "128MiB",
  maxInstances: 10
}, async (event) => {
  const vehicleId = event.params.vehicleId || "";
  const command = event.data.after.exists() ? event.data.after.val() : null;
  if (command !== "forceGpsRestart" || !vehicleId) return;

  const tokenSnap = await admin.database().ref(`fcmTokensByVehicle/${vehicleId}`).get();
  const token = tokenSnap.val();
  if (!token) return; // ยังไม่มี token ของรถคันนี้ (แอพเวอร์ชันเก่ายังไม่รองรับ FCM) — ข้าม ไม่ error

  try {
    await admin.messaging().send({
      token,
      data: { type: "wake_gps", vehicleId },
      android: { priority: "high" }
    });
  } catch (err) {
    // token อาจหมดอายุ/ถูกถอนแอพไปแล้ว — ลบทิ้งกันค้างเป็นขยะ ไม่ต้อง throw ให้ retry
    if (err && (err.code === "messaging/registration-token-not-registered"
        || err.code === "messaging/invalid-registration-token")) {
      await admin.database().ref(`fcmTokensByVehicle/${vehicleId}`).remove();
    }
  }
});

exports.prepareNextDayDriverWork = onSchedule({
  schedule: "45 23 * * *",
  timeZone: "Asia/Bangkok",
  region: "asia-southeast1",
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 1
}, async () => {
  const now = new Date();
  const serviceDate = driverWorkAutoCenter.nextBangkokServiceDate(now);
  const currentTime = "00:00";
  const db = admin.database();
  const [
    erpSnap,
    dailyAssignmentsSnap,
    manualOverridesSnap,
    configSnap,
    bookingIndexSnap,
    groupStopsSnap
  ] = await Promise.all([
    db.ref("data/erpDataCenter").get(),
    db.ref(`operations/driverDailyAssignments/${serviceDate}`).get(),
    db.ref(`operations/driverManualOverrides/${serviceDate}`).get(),
    db.ref("operations/driverWorkGenerationConfig").get(),
    db.ref(`operations/bookingsByServiceDate/${serviceDate}`).get(),
    db.ref("data/erpDataCenter/groupStops").get()
  ]);

  const plan = driverWorkAutoCenter.buildUpdates({
    erpDataCenter: erpSnap.val() || {},
    serviceDate,
    currentTime,
    dailyAssignments: dailyAssignmentsSnap.val() || {},
    manualOverrides: manualOverridesSnap.val() || {},
    rotationConfig: (configSnap.val() || {}).rotation,
    generatedAt: SERVER_TIMESTAMP
  });

  let bookingIndex = bookingIndexSnap.val() || {};
  // Migration fallback: query only the target service date, never the full
  // bookings tree. New bookings use the compact date index above.
  if (!Object.keys(bookingIndex).length) {
    const legacySnap = await db.ref("bookings").orderByChild("serviceDate").equalTo(serviceDate).get();
    bookingIndex = Object.fromEntries(Object.keys(legacySnap.val() || {}).map((code) => [code, { bookingCode: code }]));
  }
  const bookingEntries = await Promise.all(Object.keys(bookingIndex).map(async (code) => [code, (await db.ref(`bookings/${code}`).get()).val() || {}]));
  bookingEntries.forEach(([code, value]) => {
    if (String(value.date || value.serviceDate || "") !== serviceDate) return;
    if (value.cancelled === true || value.status === "cancelled") return;
    Object.assign(plan.updates, driverTicketCenter.buildScheduledAssignmentUpdate(code, value, plan.result.contractsByRuntimeVehicleId || {}, groupStopsSnap.val() || {}));
  });

  await db.ref().update(plan.updates);
});
