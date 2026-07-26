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
const WEB_ANALYTICS_VERSION = "web_analytics_v1";
const WEB_ANALYTICS_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const WEB_ANALYTICS_READ_LIMIT = { windowMs: 60 * 1000, max: 120 };
const WEB_ANALYTICS_RANGES = new Set(["hourly", "daily", "weekly", "monthly", "yearly"]);
const WEB_ANALYTICS_PAGE_CATEGORIES = new Set([
  "home",
  "booking",
  "passenger",
  "ticket_check",
  "cancellation",
  "help_info"
]);
const webAnalyticsReadRate = new Map();

function isAllowedAnalyticsOrigin(origin) {
  if (WEB_ANALYTICS_ORIGINS.has(origin)) return true;
  return process.env.FUNCTIONS_EMULATOR === "true" && WEB_ANALYTICS_LOCAL_ORIGINS.has(origin);
}

function bangkokParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((acc, item) => {
    acc[item.type] = item.value;
    return acc;
  }, {});
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === "24" ? "00" : parts.hour,
    minute: parts.minute
  };
}

function dateFromYmd(ymd) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoWeekKey(ymd) {
  const date = dateFromYmd(ymd);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function formatYmd(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(ymd, amount) {
  const date = dateFromYmd(ymd);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatYmd(date);
}

function addMonths(ym, amount) {
  const [year, month] = String(ym || "").split("-").map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentBangkokYmd() {
  const parts = bangkokParts(new Date());
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function analyticsReadPlan(range, anchor) {
  const day = anchor || currentBangkokYmd();
  const month = day.slice(0, 7);
  if (range === "hourly") {
    return {
      granularity: "hourly",
      points: Array.from({ length: 24 }, (_, hour) => {
        const hh = String(hour).padStart(2, "0");
        return { key: `${day}T${hh}`, label: `${hh}:00` };
      })
    };
  }
  if (range === "weekly") {
    return {
      granularity: "weekly",
      points: Array.from({ length: 12 }, (_, index) => {
        const key = isoWeekKey(addDays(day, (index - 11) * 7));
        return { key, label: key.replace("-", " ") };
      })
    };
  }
  if (range === "monthly") {
    return {
      granularity: "monthly",
      points: Array.from({ length: 12 }, (_, index) => {
        const key = addMonths(month, index - 11);
        return { key, label: `${Number(key.slice(5, 7))}/${key.slice(2, 4)}` };
      })
    };
  }
  if (range === "yearly") {
    const year = Number(day.slice(0, 4));
    return {
      granularity: "yearly",
      points: Array.from({ length: 5 }, (_, index) => {
        const key = String(year - 4 + index);
        return { key, label: key };
      })
    };
  }
  return {
    granularity: "daily",
    points: Array.from({ length: 30 }, (_, index) => {
      const key = addDays(day, index - 29);
      return { key, label: `${Number(key.slice(8, 10))}/${Number(key.slice(5, 7))}` };
    })
  };
}

function validateAnalyticsAnchor(anchor) {
  const value = String(anchor || "").trim();
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = dateFromYmd(value);
  return formatYmd(date) === value ? value : "";
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

function safePageCategory(value) {
  const category = String(value || "").trim();
  return WEB_ANALYTICS_PAGE_CATEGORIES.has(category) ? category : "";
}

async function incrementCounter(ref, amount) {
  await ref.transaction((current) => Number(current || 0) + amount);
}

async function updateVisitorState(db, visitorHash, nowMs) {
  const stateRef = db.ref(`analytics/webV1/private/visitorState/${visitorHash}`);
  const result = await stateRef.transaction((current) => {
    const state = current && typeof current === "object" ? current : {};
    const lastActivityAt = Number(state.lastActivityAt || 0);
    const isNewVisit = !lastActivityAt || (nowMs - lastActivityAt) >= WEB_ANALYTICS_SESSION_TIMEOUT_MS;
    const currentSessionHash = isNewVisit
      ? crypto.createHmac("sha256", analyticsHashSecret.value()).update(`session:${visitorHash}:${nowMs}`).digest("hex")
      : String(state.currentSessionHash || crypto.createHmac("sha256", analyticsHashSecret.value()).update(`session:${visitorHash}:existing`).digest("hex"));
    return {
      currentSessionHash,
      lastActivityAt: nowMs,
      lastAcceptedVisitAt: isNewVisit ? nowMs : Number(state.lastAcceptedVisitAt || 0),
      visitAccepted: isNewVisit
    };
  });
  const state = result.snapshot.val() || {};
  return {
    isNewVisit: state.visitAccepted === true,
    sessionHash: String(state.currentSessionHash || "")
  };
}

async function markVisitorInBucket(db, granularity, key, visitorHash, nowMs, firstWriteToken) {
  const ref = db.ref(`analytics/webV1/private/visitorSeen/${granularity}/${key}/${visitorHash}`);
  const result = await ref.transaction((current) => current || { firstSeenAt: nowMs, firstWriteToken });
  const value = result.snapshot.val() || {};
  return result.committed && value.firstWriteToken === firstWriteToken;
}

async function writeRollup(db, granularity, key, event) {
  const root = db.ref(`analytics/webV1/rollups/${granularity}/${key}`);
  const visitorFirst = await markVisitorInBucket(db, granularity, key, event.visitorHash, event.nowMs, event.eventToken);
  const updates = {
    contractVersion: WEB_ANALYTICS_VERSION,
    granularity,
    key,
    updatedAt: event.nowMs
  };
  await root.update(updates);
  await Promise.all([
    incrementCounter(root.child("pageViews"), 1),
    event.isNewVisit ? incrementCounter(root.child("visits"), 1) : Promise.resolve(),
    visitorFirst ? incrementCounter(root.child("visitorsApprox"), 1) : Promise.resolve(),
    incrementCounter(root.child(`pages/${event.pageCategory}/pageViews`), 1)
  ]);
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
  const body = req.body || {};
  if (body.contractVersion !== WEB_ANALYTICS_VERSION || body.eventType !== "page_view") {
    res.status(400).json({ ok: false, error: "invalid_contract" });
    return;
  }
  const visitor = safeAnalyticsId(body.deviceId, "visitor");
  const pageCategory = safePageCategory(body.pageCategory);
  if (!visitor || !pageCategory) {
    res.status(400).json({ ok: false, error: "invalid_identity" });
    return;
  }

  const now = new Date();
  const nowMs = now.getTime();
  const parts = bangkokParts(now);
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const month = `${parts.year}-${parts.month}`;
  const year = parts.year;
  const hour = `${day}T${parts.hour}`;
  const week = isoWeekKey(day);
  const db = admin.database();
  const visitorState = await updateVisitorState(db, visitor, nowMs);
  const event = {
    visitorHash: visitor,
    pageCategory,
    nowMs,
    isNewVisit: visitorState.isNewVisit,
    eventToken: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex")
  };

  await Promise.all([
    writeRollup(db, "hourly", hour, event),
    writeRollup(db, "daily", day, event),
    writeRollup(db, "weekly", week, event),
    writeRollup(db, "monthly", month, event),
    writeRollup(db, "yearly", year, event),
    db.ref("analytics/webV1/meta").update({
      contractVersion: WEB_ANALYTICS_VERSION,
      source: "trackWebVisit",
      legacyPathExcluded: "analytics/mainWeb",
      updatedAt: nowMs
    })
  ]);

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
  if (!WEB_ANALYTICS_RANGES.has(range)) {
    res.status(400).json({ ok: false, error: "invalid_range" });
    return;
  }
  const anchor = req.query.anchor == null || req.query.anchor === ""
    ? currentBangkokYmd()
    : validateAnalyticsAnchor(req.query.anchor);
  if (!anchor) {
    res.status(400).json({ ok: false, error: "invalid_anchor" });
    return;
  }

  const plan = analyticsReadPlan(range, anchor);
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
    timezone: "Asia/Bangkok",
    points,
    generatedAt: nowMs
  };
  if (JSON.stringify(payload).length > 24576) {
    res.status(500).json({ ok: false, error: "response_too_large" });
    return;
  }
  res.status(200).json(payload);
});
