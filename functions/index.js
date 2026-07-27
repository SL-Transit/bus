const admin = require("firebase-admin");
const crypto = require("crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { onValueCreated, onValueUpdated, onValueWritten } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const driverTicketCenter = require("./driver-ticket-center.js");
const driverWorkAutoCenter = require("./driver-work-auto-center.js");
const staffNotificationCenter = require("./staff-notification-center.js");
const siteAnalyticsCore = require("./site-analytics-core.js");

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

const WEB_ANALYTICS_ORIGINS = new Set([
  "https://sl-transit.com",
  "https://www.sl-transit.com"
]);
const WEB_ANALYTICS_LOCAL_ORIGINS = new Set([
  "http://localhost:5000",
  "http://127.0.0.1:5000"
]);
const WEB_ANALYTICS_READ_LIMIT = { windowMs: 60 * 1000, max: 120 };
const webAnalyticsReadRate = new Map();

function isAllowedAnalyticsOrigin(origin) {
  if (WEB_ANALYTICS_ORIGINS.has(origin)) return true;
  return process.env.FUNCTIONS_EMULATOR === "true" && WEB_ANALYTICS_LOCAL_ORIGINS.has(origin);
}

function readLimitOk(key, nowMs) {
  const current = webAnalyticsReadRate.get(key) || { startedAt: nowMs, count: 0 };
  if ((nowMs - current.startedAt) >= WEB_ANALYTICS_READ_LIMIT.windowMs) {
    webAnalyticsReadRate.set(key, { startedAt: nowMs, count: 1 });
    return true;
  }
  current.count += 1;
  webAnalyticsReadRate.set(key, current);
  return current.count <= WEB_ANALYTICS_READ_LIMIT.max;
}

function safeAnalyticsId(value, prefix) {
  const text = String(value || "").trim();
  if (!text || text.length > 96 || !/^[a-z]_[a-zA-Z0-9_-]+$/.test(text)) return "";
  return crypto.createHmac("sha256", analyticsHashSecret.value()).update(`${prefix}:${text}`).digest("hex");
}

function analyticsAdapter(db) {
  return {
    transaction(path, updateFn) {
      return db.ref(path).transaction(updateFn);
    }
  };
}

exports.trackWebVisit = onRequest({
  region: "asia-southeast1",
  timeoutSeconds: 15,
  memory: "256MiB",
  maxInstances: 30,
  secrets: [analyticsHashSecret]
}, async (req, res) => {
  const origin = req.get("origin") || "";
  if (!origin || !isAllowedAnalyticsOrigin(origin)) {
    res.status(403).json({ ok: false, error: "origin_not_allowed" });
    return;
  }
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  if (!String(req.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    res.status(415).json({ ok: false, error: "unsupported_media_type" });
    return;
  }
  const body = req.body || {};
  const validation = siteAnalyticsCore.validatePayload(body, siteAnalyticsCore.byteLength(req.rawBody || body));
  if (!validation.ok) {
    res.status(validation.error === "payload_too_large" ? 413 : 400).json({ ok: false, error: validation.error });
    return;
  }

  const payload = validation.payload;
  const visitor = safeAnalyticsId(payload.deviceId, "visitor");
  const nowMs = Date.now();
  const newVisitId = crypto.createHmac("sha256", analyticsHashSecret.value()).update(`visit:${visitor}:${nowMs}`).digest("hex");
  const event = {
    visitorHash: visitor,
    pageCategory: payload.pageCategory,
    eventType: payload.eventType,
    activitySource: payload.activitySource,
    nowMs,
    newVisitId
  };

  const db = admin.database();
  const result = await siteAnalyticsCore.commitEvent(analyticsAdapter(db), event);
  if (!result.accepted) {
    res.status(result.reason === "rate_limited" || result.reason === "activity_throttled" ? 429 : 400).json({ ok: false, error: result.reason });
    return;
  }
  await db.ref("analytics/webV1/meta").update({
    contractVersion: siteAnalyticsCore.VERSION,
    source: "trackWebVisit",
    legacyPathExcluded: "analytics/mainWeb",
    updatedAt: nowMs
  });

  res.status(204).send("");
});

exports.readSiteAnalytics = onRequest({
  region: "asia-southeast1",
  timeoutSeconds: 15,
  memory: "256MiB",
  maxInstances: 20
}, async (req, res) => {
  const origin = req.get("origin") || "";
  const healthCheck = !origin && req.get("x-sl-transit-health-check") === "1";
  if (origin && !isAllowedAnalyticsOrigin(origin)) {
    res.status(403).json({ ok: false, error: "origin_not_allowed" });
    return;
  }
  if (!origin && !healthCheck && process.env.FUNCTIONS_EMULATOR !== "true") {
    res.status(403).json({ ok: false, error: "origin_required" });
    return;
  }
  if (origin) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, X-SL-Transit-Health-Check");
  res.set("Cache-Control", "private, max-age=60");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const nowMs = Date.now();
  if (!readLimitOk(origin || "health-check", nowMs)) {
    res.status(429).json({ ok: false, error: "rate_limited" });
    return;
  }

  const range = String(req.query.range || "daily").trim();
  if (!siteAnalyticsCore.RANGES.has(range)) {
    res.status(400).json({ ok: false, error: "invalid_range" });
    return;
  }
  const anchor = req.query.anchor == null || req.query.anchor === ""
    ? siteAnalyticsCore.currentBangkokYmd(new Date())
    : siteAnalyticsCore.validateAnchor(req.query.anchor);
  if (!anchor) {
    res.status(400).json({ ok: false, error: "invalid_anchor" });
    return;
  }

  const plan = siteAnalyticsCore.readPlan(range, anchor);
  if (plan.points.length > 30) {
    res.status(400).json({ ok: false, error: "range_too_large" });
    return;
  }

  let points;
  let hasData = false;
  try {
    const db = admin.database();
    const snaps = await Promise.all(plan.points.map((point) =>
      db.ref(`analytics/webV1/rollups/${plan.granularity}/${point.key}`).get()
    ));
    points = plan.points.map((point, index) => {
      const row = snaps[index].val() || {};
      const visits = Math.max(0, Math.floor(Number(row.visits || 0)));
      const estimatedVisitors = Math.max(0, Math.floor(Number(row.visitorsApprox || 0)));
      if (visits || estimatedVisitors) hasData = true;
      return {
        key: point.key,
        label: point.label,
        visits,
        estimatedVisitors
      };
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: "analytics_read_failed" });
    return;
  }

  const payload = {
    status: hasData ? "ready" : "empty",
    range,
    timezone: siteAnalyticsCore.TIMEZONE,
    points,
    generatedAt: nowMs
  };
  if (JSON.stringify(payload).length > 24576) {
    res.status(500).json({ ok: false, error: "response_too_large" });
    return;
  }
  res.status(200).json(payload);
});
