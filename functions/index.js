const admin = require("firebase-admin");
const { onValueCreated, onValueUpdated, onValueWritten } = require("firebase-functions/v2/database");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const driverTicketCenter = require("./driver-ticket-center.js");
const driverWorkAutoCenter = require("./driver-work-auto-center.js");
const staffNotificationCenter = require("./staff-notification-center.js");
const adminDashboardSummary = require("./admin-dashboard-summary.js");
const adminAuth = require("./admin-auth.js");
const refundActions = require("./refund-admin-actions.js");

const lineToken = defineSecret("LINE_CHANNEL_ACCESS_TOKEN");
const staffLineToken = defineSecret("LINE_STAFF_CHANNEL_ACCESS_TOKEN");
const analyticsHashSecret = defineSecret("ANALYTICS_HASH_SECRET");

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
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
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

function readJsonBody(req) {
  const body = req.body || {};
  return typeof body === "object" && !Buffer.isBuffer(body) ? body : {};
}

function sendAuthError(res, err) {
  const safe = adminAuth.safeAuthError(err);
  sendJson(res, safe.status, safe.body);
}

const RATE_LIMITS = new Map();
function rateLimitKey(req, name, actor) {
  return [name, actor && actor.uid || "", req.headers && req.headers.origin || ""].join("|");
}

function enforceRateLimit(req, name, actor) {
  const now = Date.now();
  const key = rateLimitKey(req, name, actor);
  const current = RATE_LIMITS.get(key) || { count: 0, resetAt: now + 60000 };
  if (now > current.resetAt) {
    current.count = 0;
    current.resetAt = now + 60000;
  }
  current.count += 1;
  RATE_LIMITS.set(key, current);
  if (current.count > 30) {
    const err = new Error("rate_limited");
    err.httpStatus = 429;
    throw err;
  }
}

function publicError(err, fallback) {
  const status = err && err.httpStatus || 500;
  if (status >= 500) return fallback;
  return err && err.message || fallback;
}

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
  maxInstances: 10,
  secrets: [analyticsHashSecret]
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
  let actor;
  try {
    actor = await adminAuth.requireAdmin(req, admin, "adminDashboardRead");
  } catch (err) {
    sendAuthError(res, err);
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
      fleetMasterSnap,
      serviceGroupsSnap,
      websiteAnalyticsSnap,
      refundOpsSnap
    ] = await Promise.all([
      admin.database().ref("bookings").orderByChild("ts").startAt(window.startMs).endAt(window.endMs).get(),
      admin.database().ref("bookings").orderByChild("date").startAt(dateWindow.startDate).endAt(dateWindow.endDate).get(),
      admin.database().ref("bookings").orderByChild("serviceDate").startAt(dateWindow.startDate).endAt(dateWindow.endDate).get(),
      admin.database().ref("bookings").orderByChild("cancelledAt").startAt(window.startMs).endAt(window.endMs).get(),
      admin.database().ref("bookings").orderByChild("refundedAt").startAt(window.startMs).endAt(window.endMs).get(),
      admin.database().ref("data/erpDataCenter/fleet").get(),
      admin.database().ref("data/erpDataCenter/serviceGroups").get(),
      range === "hourly"
        ? Promise.resolve(null)
        : admin.database().ref("analytics/mainWeb").orderByKey().startAt(dateWindow.startDate).endAt(dateWindow.endDate).get(),
      admin.database().ref("operations/refunds").orderByChild("refundedAt").startAt(window.startMs).endAt(window.endMs).get()
    ]);
    const summary = adminDashboardSummary.aggregateDashboard(bookingSnap.val() || {}, {
      range,
      anchor: anchor || undefined,
      nowMs: now,
      travelRecords: mergeSnapshots([travelDateSnap, travelServiceDateSnap]),
      cancelledRecords: cancelledSnap.val() || {},
      refundedRecords: refundedSnap.val() || {},
      fleetMaster: Object.assign({}, fleetMasterSnap.val() || {}, { serviceGroups: serviceGroupsSnap.val() || {} }),
      websiteRollups: websiteAnalyticsSnap ? mergeWebsiteAnalytics(websiteAnalyticsSnap.val() || {}, range) : null,
      refundOperations: refundOpsSnap.val() || {},
      identitySecret: analyticsHashSecret.value(),
      actor: { uid: actor.uid, role: actor.role }
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
    await adminAuth.requireAdmin(req, admin, "adminDashboardRead");
    const snap = await admin.database().ref("data/erpDataCenter").get();
    res.set("Cache-Control", "private, max-age=30");
    sendJson(res, 200, {
      status: "ready",
      path: "data/erpDataCenter",
      erpDataCenter: snap.val() || {},
      generatedAt: Date.now()
    });
  } catch (err) {
    if (err && (err.httpStatus === 401 || err.httpStatus === 403)) {
      sendAuthError(res, err);
      return;
    }
    console.error("readAdminErpDataCenter failed", { message: err && err.message ? err.message : String(err) });
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
  try {
    const actor = await adminAuth.requireAdmin(req, admin, "adminDashboardRead");
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
      actorUid: actor.uid,
      actorRole: actor.role,
      action: "admin_erp_update",
      updateCount: paths.length,
      paths,
      createdAt: Date.now()
    };
    await admin.database().ref().update(patch);
    sendJson(res, 200, { status: "ready", updateCount: paths.length, auditKey });
  } catch (err) {
    if (err && (err.httpStatus === 401 || err.httpStatus === 403)) {
      sendAuthError(res, err);
      return;
    }
    console.error("updateAdminErpDataCenter failed", { message: err && err.message ? err.message : String(err) });
    sendJson(res, 500, { status: "error", error: "erp_data_center_update_failed" });
  }
});

function refundFunction(action, permission, nextStatus) {
  return onRequest({
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
  try {
      const actor = permission === "authenticated" ?
        await adminAuth.requireAuthenticated(req, admin) :
        await adminAuth.requireAdmin(req, admin, permission);
      enforceRateLimit(req, action, actor);
      const body = readJsonBody(req);
      const result = await refundActions.runRefundAction({
        admin,
        action,
        nextStatus,
        actor,
        bookingId: body.bookingId,
        idempotencyKey: req.headers["idempotency-key"] || body.idempotencyKey,
        body
      });
      sendJson(res, 200, result);
    } catch (err) {
      if (err && (err.httpStatus === 401 || err.httpStatus === 403)) {
        sendAuthError(res, err);
        return;
      }
      sendJson(res, err && err.httpStatus || 500, { status: "error", error: publicError(err, "refund_action_failed") });
    }
  });
}

async function releaseAdminCancelCapacity(db, booking) {
  const capacity = booking && booking.capacity || null;
  if (!capacity || !capacity.counterPath || !capacity.bookingCode) {
    return { status: "skipped", reason: "missing_capacity_contract" };
  }
  const requestedSeats = Number(capacity.requestedSeats || booking.seats || booking.pax || 1);
  let hadBooking = false;
  try {
    const tx = await db.ref(capacity.counterPath).transaction((current) => {
      if (!current || typeof current !== "object") return current;
      const bookings = Object.assign({}, current.bookings || {});
      if (!bookings[capacity.bookingCode]) return current;
      hadBooking = true;
      delete bookings[capacity.bookingCode];
      const nextBooked = Math.max(0, Number(current.bookedSeats || 0) - Math.max(1, requestedSeats));
      return Object.assign({}, current, {
        bookedSeats: nextBooked,
        seatsAvailable: Math.max(0, Number(current.capacityLimit || 0) - nextBooked),
        bookings
      });
    });
    return { status: tx && tx.committed && hadBooking ? "released" : "idempotent_noop", counterPath: capacity.counterPath };
  } catch (err) {
    return { status: "failed_retriable", counterPath: capacity.counterPath };
  }
}

exports.requestRefund = refundFunction("requestRefund", "authenticated", "requested");
exports.reviewRefund = refundFunction("reviewRefund", "refundReview", "under_review");
exports.approveRefund = refundFunction("approveRefund", "refundApprove", "approved");
exports.startRefundProcessing = refundFunction("startRefundProcessing", "refundComplete", "processing");
exports.completeRefund = refundFunction("completeRefund", "refundComplete", "refunded");
exports.rejectRefund = refundFunction("rejectRefund", "refundApprove", "rejected");

exports.cancelBookingAsAdmin = onRequest({
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
    try {
    const actor = await adminAuth.requireAdmin(req, admin, "bookingCancel");
    enforceRateLimit(req, "cancelBookingAsAdmin", actor);
    const body = readJsonBody(req);
    const bookingId = String(body.bookingId || "").trim();
    if (!/^[A-Z0-9][A-Z0-9_-]{5,}$/i.test(bookingId)) {
      sendJson(res, 400, { status: "error", error: "invalid_booking_id" });
      return;
    }
    const ref = admin.database().ref(`bookings/${bookingId}`);
    const idempotencyKeyHash = refundActions.safeKeyHash(body.idempotencyKey, "idempotency_key");
    const idemRef = admin.database().ref(`operations/adminCancelIdempotency/${idempotencyKeyHash}`);
    const idem = await idemRef.transaction((current) => current ? undefined : {
      status: "locked",
      bookingIdHash: refundActions.hashBookingId(bookingId),
      lockedAt: admin.database.ServerValue.TIMESTAMP,
      lockedAtMs: Date.now()
    });
    if (!idem.committed) {
      const marker = idem.snapshot && idem.snapshot.val && idem.snapshot.val();
      sendJson(res, 200, { status: "ok", result: marker && marker.status === "success" ? "idempotent_noop" : "locked", capacityRelease: { status: "idempotent_noop" } });
      return;
    }
    const before = await ref.get();
    const originalBooking = before && before.val ? before.val() : null;
    if (!originalBooking) {
      await idemRef.update({ status: "failed_final", completedAt: admin.database.ServerValue.TIMESTAMP });
      sendJson(res, 404, { status: "error", error: "booking_not_found" });
      return;
    }
    const tx = await ref.transaction((current) => {
      if (!current || typeof current !== "object") return current;
      if (String(current.status || "").toLowerCase() === "cancelled" && current.cancelledAt) return current;
      return Object.assign({}, current, {
        status: "cancelled",
        cancelledAt: admin.database.ServerValue.TIMESTAMP,
        adminCancellationContractVersion: "admin_cancel_v1"
      });
    });
    const after = tx && tx.snapshot && tx.snapshot.val ? tx.snapshot.val() : null;
    const changed = !!(tx && tx.committed && after && String(originalBooking.status || "").toLowerCase() !== "cancelled");
    const auditId = refundActions.hashBookingId([bookingId, "admin_cancel", idempotencyKeyHash].join("|"));
    const capacityRelease = changed ? await releaseAdminCancelCapacity(admin.database(), originalBooking) : { status: "idempotent_noop" };
    if (changed && capacityRelease.status === "failed_retriable") {
      await admin.database().ref(`operations/adminCancelCapacityRetry/${auditId}`).set({
        eventId: auditId,
        bookingIdHash: refundActions.hashBookingId(bookingId),
        status: "pending",
        capacity: originalBooking.capacity || null,
        createdAt: admin.database.ServerValue.TIMESTAMP
      });
    }
    await admin.database().ref(`operations/adminBookingAudit/${auditId}`).set({
      eventId: auditId,
      bookingIdHash: refundActions.hashBookingId(bookingId),
      action: "cancelBookingAsAdmin",
      actorUid: actor.uid,
      actorRole: actor.role,
      result: changed && capacityRelease.status === "released" ? "cancelled" : (changed ? "capacity_release_" + capacityRelease.status : "idempotent_noop"),
      serverTimestamp: admin.database.ServerValue.TIMESTAMP,
      idempotencyKeyHash,
      capacityRelease
    });
    await idemRef.update({
      status: changed && capacityRelease.status === "failed_retriable" ? "failed_retriable" : "success",
      completedAt: admin.database.ServerValue.TIMESTAMP,
      capacityReleaseStatus: capacityRelease.status
    });
    sendJson(res, 200, { status: "ok", result: changed ? "cancelled" : "idempotent_noop", committed: !!(tx && tx.committed), capacityRelease });
  } catch (err) {
    if (err && (err.httpStatus === 401 || err.httpStatus === 403)) {
      sendAuthError(res, err);
      return;
    }
    sendJson(res, 500, { status: "error", error: "admin_cancel_failed" });
  }
});

exports.retryAdminCancelCapacityRelease = onRequest({
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
  try {
    const actor = await adminAuth.requireAdmin(req, admin, "bookingCancel");
    enforceRateLimit(req, "retryAdminCancelCapacityRelease", actor);
    const body = readJsonBody(req);
    const eventId = String(body.eventId || "").trim();
    if (!/^[a-f0-9]{64}$/i.test(eventId)) {
      sendJson(res, 400, { status: "error", error: "invalid_event_id" });
      return;
    }
    const retryRef = admin.database().ref(`operations/adminCancelCapacityRetry/${eventId}`);
    const snap = await retryRef.get();
    const retry = snap && snap.val ? snap.val() : null;
    if (!retry || !retry.capacity) {
      sendJson(res, 404, { status: "error", error: "retry_not_found" });
      return;
    }
    if (retry.status === "released") {
      sendJson(res, 200, { status: "ok", capacityRelease: { status: "idempotent_noop" } });
      return;
    }
    const result = await releaseAdminCancelCapacity(admin.database(), { capacity: retry.capacity, pax: retry.capacity.requestedSeats });
    await retryRef.update({
      status: result.status === "released" ? "released" : (result.status === "failed_retriable" ? "failed_retriable" : "idempotent_noop"),
      updatedAt: admin.database.ServerValue.TIMESTAMP,
      actorUid: actor.uid,
      actorRole: actor.role
    });
    sendJson(res, 200, { status: "ok", capacityRelease: result });
  } catch (err) {
    if (err && (err.httpStatus === 401 || err.httpStatus === 403)) {
      sendAuthError(res, err);
      return;
    }
    sendJson(res, 500, { status: "error", error: "capacity_retry_failed" });
  }
});

function bookingRouteText(booking) {
  if (booking.route) return String(booking.route);
  const origin = booking.origin || booking.from || "-";
  const destination = booking.destination || booking.to || "-";
  return `${origin} โ’ ${destination}`;
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
    "เธเธนเนเนเธ”เธขเธชเธฒเธฃเน€เธเนเธเธญเธดเธเนเธเธฅเนเธ–เธถเธเธเธธเธ”เธซเธกเธฒเธข",
    "",
    `เธเธทเนเธญ: ${booking.name || "-"}`,
    `เน€เธเธญเธฃเนเนเธ—เธฃ: ${booking.phone || "-"}`,
    `เน€เธชเนเธเธ—เธฒเธ: ${bookingRouteText(booking)}`,
    `เธงเธฑเธเน€เธงเธฅเธฒ: ${booking.date || "-"} ${booking.time || "-"} เธ.`,
    `เธเธณเธเธงเธ: ${booking.seats || 1}`,
    "เนเธเธฅเนเธ–เธถเธเธเธธเธ”เธซเธกเธฒเธขเธญเธตเธ 3 เธเธฒเธ—เธต"
  ].join("\n");
}

function buildBookingMessage(booking) {
  const lines = [
    `เธฃเธซเธฑเธช: ${booking.code || "-"}`,
    `๐‘ค เธเธทเนเธญ: ${booking.name || "-"}    ๐“ เนเธ—เธฃ: ${booking.phone || "-"}`,
    `๐“ เน€เธชเนเธเธ—เธฒเธ: ${bookingRouteText(booking)}`,
    `๐—“ เธงเธฑเธเธ—เธตเน: ${formatThaiDate(booking.date)} เน€เธงเธฅเธฒ ${booking.time || "-"} เธ.`,
    `๐ เธเธณเธเธงเธ: ${booking.seats || 1} เธเธ  ๐’ฐ เธฃเธฒเธเธฒ: ${money(booking.price)} เธเธฒเธ—`
  ];
  if (booking.slip) lines.push(`๐–ผ เธชเธฅเธดเธ: ${booking.slip}`);
  return lines.join("\n");
}

async function pushLineMessage(to, text) {
  return pushLineMessageWithToken(lineToken.value(), to, text);
}

async function pushLineMessageWithToken(token, to, text) {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to,
      messages: [{ type: "text", text }]
    })
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`LINE push failed ${response.status}: ${body}`);
  }
  return body;
}

async function sendStaffLineForBooking(ref, code, booking) {
  if (booking.testMode === true || booking.mockOnly === true) {
    await ref.update({
      staffLineMessagingStatus: "mock_skipped",
      staffLineMessagingAt: admin.database.ServerValue.TIMESTAMP
    });
    return;
  }

  const staffConfig = await staffNotificationCenter.readStaffLineTargetsConfig(admin.database());
  const alerts = staffNotificationCenter.bookingCreatedStaffAlerts({ booking, staffConfig });
  if (!alerts.length) {
    await ref.update({
      staffLineMessagingStatus: "skipped_no_staff_targets",
      staffLineMessagingAt: admin.database.ServerValue.TIMESTAMP
    });
    return;
  }

  const sentRef = admin.database().ref(`staff_line_sent/${code}`);
  const sentSnapshot = await sentRef.get();
  const sentMap = sentSnapshot.exists() ? (sentSnapshot.val() || {}) : {};
  const pendingAlerts = alerts.filter((alert) => !sentMap[encodeURIComponent(alert.onceKey)]);
  if (!pendingAlerts.length) return;

  const token = staffLineToken.value();
  const results = await Promise.allSettled(pendingAlerts.map(async (alert) => {
    const message = staffNotificationCenter.staffBookingMessage(alert, booking);
    await pushLineMessageWithToken(token, alert.lineTo, message);
    await sentRef.child(encodeURIComponent(alert.onceKey)).set({
      code,
      event: alert.event,
      recipientRole: alert.recipientRole,
      staffId: alert.staffId || "",
      scopeId: alert.scopeId || "",
      sentAt: admin.database.ServerValue.TIMESTAMP,
      status: "sent"
    });
    return alert.onceKey;
  }));

  const failed = results
    .map((result, index) => ({ result, alert: pendingAlerts[index] }))
    .filter((item) => item.result.status === "rejected");

  if (failed.length) {
    const errors = failed.map((item) => ({
      recipientRole: item.alert.recipientRole,
      staffId: item.alert.staffId || "",
      scopeId: item.alert.scopeId || "",
      error: item.result.reason && item.result.reason.message ? item.result.reason.message : String(item.result.reason)
    }));
    console.error("sendStaffLineForBooking failed", { code, errors });
    await ref.update({
      staffLineMessagingStatus: "failed",
      staffLineMessagingAt: admin.database.ServerValue.TIMESTAMP,
      staffLineMessagingError: JSON.stringify(errors).slice(0, 1200)
    });
    return;
  }

  await ref.update({
    staffLineMessagingStatus: "sent",
    staffLineMessagingAt: admin.database.ServerValue.TIMESTAMP,
    staffLineMessagingCount: Object.keys(sentMap).length + pendingAlerts.length
  });
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

async function markLineSkippedNoPassengerTarget(ref, target) {
  await ref.update({
    lineMessagingStatus: "skipped_no_passenger_line_target",
    lineMessagingAt: admin.database.ServerValue.TIMESTAMP,
    lineMessagingTarget: target || "passenger"
  });
}

async function sendLineForBooking(ref, code, booking) {
  if (booking.testMode === true || booking.mockOnly === true) {
    await ref.update({ lineMessagingStatus: "mock_skipped", lineMessagingAt: admin.database.ServerValue.TIMESTAMP });
    return;
  }

  if (booking.lineMessagingStatus === "sent") return;

  const checkin = isCheckinEvent(booking);
  const eventName = checkin ? "checkin" : "booking";
  const to = passengerLineUserId(booking);
  if (!to || !canNotifyPassengerLine(booking, eventName)) {
    await markLineSkippedNoPassengerTarget(ref, eventName);
    return;
  }
  const message = checkin ? buildCheckinMessage(booking) : buildBookingMessage(booking);

  try {
    await pushLineMessage(to, message);
    await Promise.all([
      ref.update({
        lineMessagingStatus: "sent",
        lineMessagingAt: admin.database.ServerValue.TIMESTAMP,
        lineMessagingTarget: eventName,
        lineMessagingRecipient: "passenger_line"
      }),
      admin.database().ref(`line_sent/${code}`).set({
        code,
        event: checkin ? "checkin" : "booking_created",
        target: eventName,
        recipient: "passenger_line",
        sentAt: admin.database.ServerValue.TIMESTAMP,
        status: "sent"
      })
    ]);
  } catch (err) {
    console.error("sendLineForBooking failed", err);
    await ref.update({
      lineMessagingStatus: "failed",
      lineMessagingError: err && err.message ? err.message : String(err),
      lineMessagingAt: admin.database.ServerValue.TIMESTAMP
    });
    throw err;
  }
}

exports.sendLineOnBooking = onValueCreated({
  ref: "/bookings/{code}",
  instance: "sl-transit-9464e-default-rtdb",
  region: "asia-southeast1",
  secrets: [lineToken],
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 20
}, async (event) => {
  const booking = event.data.val() || {};
  const code = event.params.code || booking.code || "";
  await sendLineForBooking(event.data.ref, code, booking);
});

exports.sendStaffLineOnBooking = onValueWritten({
  ref: "/bookings/{code}",
  instance: "sl-transit-9464e-default-rtdb",
  region: "asia-southeast1",
  secrets: [staffLineToken],
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 20
}, async (event) => {
  if (!event.data.after.exists()) return;
  const booking = event.data.after.val() || {};
  const code = event.params.code || booking.code || "";
  await sendStaffLineForBooking(event.data.after.ref, code, booking);
});

exports.sendLineOnPaymentVerified = onValueUpdated({
  ref: "/bookings/{code}",
  instance: "sl-transit-9464e-default-rtdb",
  region: "asia-southeast1",
  secrets: [lineToken],
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 20
}, async (event) => {
  const before = event.data.before.val() || {};
  const after = event.data.after.val() || {};
  const code = event.params.code || after.code || "";

  if (!isTransferSlipBooking(after)) return;
  if (before.paymentStatus === "payment_verified") return;
  if (after.paymentStatus !== "payment_verified") return;
  await sendLineForBooking(event.data.after.ref, code, after);
});

exports.syncDriverTicketOnBookingWrite = onValueWritten({
  ref: "/bookings/{code}",
  instance: "sl-transit-9464e-default-rtdb",
  region: "asia-southeast1",
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 20
}, async (event) => {
  const code = event.params.code || "";
  const before = event.data.before.exists() ? (event.data.before.val() || {}) : null;
  const rawAfter = event.data.after.exists() ? (event.data.after.val() || {}) : null;
  let after = rawAfter;
  if (rawAfter && !driverTicketCenter.plannedVehicleId(rawAfter)) {
    const serviceDate = driverTicketCenter.serviceDate(rawAfter);
    if (serviceDate) {
      const [workSnap, groupStopsSnap] = await Promise.all([
        admin.database().ref(`operations/driverWorkByServiceDate/${serviceDate}`).get(),
        admin.database().ref("data/erpDataCenter/groupStops").get()
      ]);
      after = driverTicketCenter.enrichBookingFromDriverWork(
        rawAfter,
        workSnap.val() || {},
        groupStopsSnap.val() || {}
      );
    }
  }
  const updates = driverTicketCenter.buildDriverTicketMirrorUpdate(code, before, after);
  if (rawAfter && after !== rawAfter && driverTicketCenter.plannedVehicleId(after)) {
    updates[`bookings/${code}/assignment`] = after.assignment;
    updates[`bookings/${code}/assignmentSource`] = after.assignmentSource;
    updates[`bookings/${code}/plannedVehicleId`] = after.plannedVehicleId;
    updates[`bookings/${code}/vehicleId`] = after.vehicleId;
    updates[`bookings/${code}/queueNo`] = after.queueNo;
    updates[`bookings/${code}/routeId`] = after.routeId || "";
    updates[`bookings/${code}/tripId`] = after.tripId || "";
    updates[`bookings/${code}/catalogRouteId`] = after.catalogRouteId || "";
    updates[`bookings/${code}/catalogTripId`] = after.catalogTripId || "";
    updates[`bookings/${code}/scheduleOnly`] = false;
    updates[`bookings/${code}/noLiveTracking`] = false;
    updates[`bookings/${code}/driverTicketSyncStatus`] = "assigned_from_driver_work";
    updates[`bookings/${code}/driverTicketSyncedAt`] = admin.database.ServerValue.TIMESTAMP;
  }
  if (!Object.keys(updates).length) return;
  await admin.database().ref().update(updates);
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
    configSnap
  ] = await Promise.all([
    db.ref("data/erpDataCenter").get(),
    db.ref(`operations/driverDailyAssignments/${serviceDate}`).get(),
    db.ref(`operations/driverManualOverrides/${serviceDate}`).get(),
    db.ref("operations/driverWorkGenerationConfig").get()
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

  await db.ref().update(plan.updates);
});
