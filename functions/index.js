const admin = require("firebase-admin");
const { onValueCreated, onValueUpdated, onValueWritten } = require("firebase-functions/v2/database");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const driverTicketCenter = require("./driver-ticket-center.js");
const driverWorkAutoCenter = require("./driver-work-auto-center.js");
const staffNotificationCenter = require("./staff-notification-center.js");
const notificationCenter = require("./notification-center.js");
const adminDashboardSummary = require("./admin-dashboard-summary.js");

const lineToken = defineSecret("LINE_CHANNEL_ACCESS_TOKEN");
const staffLineToken = defineSecret("LINE_STAFF_CHANNEL_ACCESS_TOKEN");
// Legacy vocabulary is retained only for migration/audit scans. Notification
// state is now written exclusively under operations/notificationDispatch.
// Historical audit label: recipient: "passenger_line"
const LEGACY_NOTIFICATION_AUDIT_TERMS = ["skipped_no_passenger_line_target", "recipient: \"passenger_line\""];

function money(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function formatThaiDate(date) {
  const value = String(date || "");
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : (value || "-");
}

const adminDashboardRateState = new Map();

function setCors(req, res) {
  const origin = req.headers.origin || "";
  if (adminDashboardSummary.originAllowed(origin, process.env.FUNCTIONS_EMULATOR === "true")) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
}

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
    if (action === "release") {
      const result = await ref.transaction((current) => {
        if (!current || !current.bookings || !current.bookings[bookingCode]) return current;
        const existing = current.bookings[bookingCode];
        if (existing.ownerUid !== decoded.uid) return current;
        const bookings = { ...current.bookings };
        delete bookings[bookingCode];
        const bookedSeats = Math.max(0, Number(current.bookedSeats || 0) - Number(existing.seats || requestedSeats));
        return { ...current, bookedSeats, seatsAvailable: Math.max(0, Number(current.capacityLimit || 0) - bookedSeats), bookings, updatedAt: admin.database.ServerValue.TIMESTAMP };
      });
      sendJson(res, 200, { status: "ok", action: "release", committed: result.committed === true });
      return;
    }
    const result = await ref.transaction((current) => {
      if (!current || !Number.isInteger(Number(current.capacityLimit)) || Number(current.capacityLimit) < 1 || Number(current.capacityLimit) > 10) return;
      const bookings = current.bookings || {};
      const existing = bookings[bookingCode];
      if (existing) return existing.ownerUid === decoded.uid ? current : undefined;
      const bookedSeats = Math.max(0, Number(current.bookedSeats || 0));
      const capacityLimit = Number(current.capacityLimit);
      if (bookedSeats + requestedSeats > capacityLimit) return;
      return {
        ...current,
        contractVersion: "booking_capacity_v1",
        bookedSeats: bookedSeats + requestedSeats,
        seatsAvailable: capacityLimit - bookedSeats - requestedSeats,
        bookings: { ...bookings, [bookingCode]: { ownerUid: decoded.uid, seats: requestedSeats, status: "reserved", reservedAt: admin.database.ServerValue.TIMESTAMP } },
        updatedAt: admin.database.ServerValue.TIMESTAMP
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

function findPublishedPair(schedule, booking) {
  const pairs = schedule && schedule.pairs || {};
  const wanted = [booking.pairKey, booking.pairId, booking.canonicalPairKey].filter(Boolean).map(String);
  for (const [key, pair] of Object.entries(pairs)) {
    const candidates = [key, pair && pair.pairKey, pair && pair.pairId, pair && pair.canonicalPairKey, pair && pair.compatibilityPairKey].filter(Boolean).map(String);
    if (wanted.some((value) => candidates.includes(value))) return pair;
  }
  return null;
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
    const scheduleSnap = await admin.database().ref("publishedSchedule").get();
    const schedule = scheduleSnap.val() || {};
    if (schedule.readyForApply !== false) {
      sendJson(res, 409, { status: "error", error: "published_schedule_not_ready" });
      return;
    }
    const pair = findPublishedPair(schedule, input);
    const serverFare = Number(pair && pair.fareAmount);
    const serverFee = Number(pair && pair.fareContract && pair.fareContract.serviceFeeAmount || pair && pair.serviceFeeAmount || 0);
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
      publishedSchedule: { readyForApply: false, schemaVersion: schedule.schemaVersion || "" }, createdAt: admin.database.ServerValue.TIMESTAMP
    };
    const bookingRef = admin.database().ref(`bookings/${code}`);
    const result = await bookingRef.transaction((current) => current || booking);
    if (!result.committed) {
      sendJson(res, 409, { status: "error", error: "booking_already_exists" });
      return;
    }
    sendJson(res, 201, { status: "ok", booking: result.snapshot.val() });
  } catch (error) {
    sendJson(res, Number(error.statusCode) || 500, { status: "error", error: error.message || "booking_create_failed" });
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
      updatedAt: admin.database.ServerValue.TIMESTAMP
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
  try {
    await requireAdminToken(req);
    const snap = await admin.database().ref("data/erpDataCenter").get();
    res.set("Cache-Control", "private, max-age=30");
    res.status(200).type("application/json").send(JSON.stringify({
      status: "ready",
      path: "data/erpDataCenter",
      erpDataCenter: snap.val() || {},
      generatedAt: Date.now()
    }));
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
    const decoded = await requireAdminToken(req);
    const body = parseJsonRequest(req);
    const updates = body && body.updates && typeof body.updates === "object" ? body.updates : {};
    const paths = Object.keys(updates);
    if (!paths.length || paths.length > 50) {
      sendJson(res, 400, { status: "error", error: "invalid_update_count" });
      return;
    }
    const patch = {};
    for (const path of paths) {
      if (!allowedErpUpdatePath(path) || !scalarErpValue(updates[path])) {
        sendJson(res, 400, { status: "error", error: "invalid_erp_update_path" });
        return;
      }
      patch[path] = updates[path];
    }
    const auditKey = `admin_erp_update_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    patch[`data/erpDataCenter/meta/audit/${auditKey}`] = {
      actorUid: decoded.uid,
      action: "admin_erp_update",
      updateCount: paths.length,
      paths,
      createdAt: Date.now()
    };
    await admin.database().ref().update(patch);
    sendJson(res, 200, { status: "ready", updateCount: paths.length, auditKey });
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
  const job = { bookingCode: code, eventType, channelKind: resolvedChannel, tokenKind: resolvedToken, recipient: { type: recipientType, id: recipientId, lineTo: lineTo || "" }, text: text || "", retryKey: stableRetryKey(jobId), createdAt: admin.database.ServerValue.TIMESTAMP, testMode: testMode === true, mockOnly: mockOnly === true };
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
  const uniqueAlerts = notificationCenter.dedupeRecipients(alerts.map((alert) => ({ ...alert, type: alert.recipientRole, channelKind: "staff", lineTo: alert.lineTo })));
  for (const alert of uniqueAlerts) jobs.push(enqueueNotification(db, { code, eventType: "booking_created", channelKind: "staff", recipientType: alert.type, recipientId: alert.lineTo, lineTo: alert.lineTo, text: staffNotificationCenter.staffBookingMessage(alert, booking), testMode: booking.testMode, mockOnly: booking.mockOnly }));
  return Promise.all(jobs);
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
  if (serviceDate) await admin.database().ref(`operations/bookingsByServiceDate/${serviceDate}/${code}`).set({ bookingCode: code, serviceDate, indexedAt: admin.database.ServerValue.TIMESTAMP });
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
  const claim = await dispatchRef.transaction((current) => { const decision = notificationCenter.claimDecision(current, Date.now()); if (!decision.claim) return; return { ...(current || {}), status: "processing", attempts: decision.attempts, createdAt: (current && current.createdAt) || admin.database.ServerValue.TIMESTAMP, processingStartedAt: Date.now(), retryKey: job.retryKey, recipient: job.recipient, channelKind: job.channelKind || notificationCenter.channelKind(job.recipient?.type), tokenKind: job.tokenKind || notificationCenter.tokenKind(job.recipient?.type), eventType: job.eventType, bookingCode: job.bookingCode }; });
  if (!claim.committed) return;
  if (job.testMode === true || job.mockOnly === true || (await readSystemTestMode()).enabled === true) { await dispatchRef.update({ status: "mock_skipped", sentAt: admin.database.ServerValue.TIMESTAMP }); return; }
  const token = (job.tokenKind || notificationCenter.tokenKind(job.recipient?.type)) === "staff" ? staffLineToken.value() : lineToken.value();
  let attempt = Number((claim.snapshot && claim.snapshot.val() || {}).attempts || 1);
  while (attempt <= 3) {
    if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, notificationCenter.retryDelayMs(attempt)));
    let response;
    try {
      response = await fetch("https://api.line.me/v2/bot/message/push", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Line-Retry-Key": job.retryKey }, body: JSON.stringify({ to: job.recipient.lineTo, messages: [{ type: "text", text: job.text }] }) });
    } catch (error) {
      if (attempt >= 3) { await dispatchRef.update({ status: "failed", attempts: attempt, failedAt: admin.database.ServerValue.TIMESTAMP, errorCode: "network_timeout" }); return; }
      attempt += 1; await dispatchRef.update({ attempts: attempt, errorCode: "network_timeout" }); continue;
    }
    const classification = notificationCenter.classifyLineResponse(response.status);
    if (classification.status === "sent" || classification.status === "accepted_duplicate") { await dispatchRef.update({ status: classification.status, attempts: attempt, sentAt: admin.database.ServerValue.TIMESTAMP, httpStatus: response.status }); return; }
    if (!classification.retry) { await dispatchRef.update({ status: classification.status, attempts: 1, failedAt: admin.database.ServerValue.TIMESTAMP, httpStatus: response.status, errorCode: `line_${response.status}` }); return; }
    if (attempt >= 3) { await dispatchRef.update({ status: "failed", attempts: attempt, failedAt: admin.database.ServerValue.TIMESTAMP, httpStatus: response.status, errorCode: `line_${response.status}` }); return; }
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
    generatedAt: admin.database.ServerValue.TIMESTAMP
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
