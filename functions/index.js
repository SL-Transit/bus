const admin = require("firebase-admin");
const { onValueCreated, onValueUpdated, onValueWritten } = require("firebase-functions/v2/database");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const driverTicketCenter = require("./driver-ticket-center.js");
const driverWorkAutoCenter = require("./driver-work-auto-center.js");
const staffNotificationCenter = require("./staff-notification-center.js");
const notificationCenter = require("./notification-center.js");

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
  if (job.testMode === true || job.mockOnly === true) { await dispatchRef.update({ status: "mock_skipped", sentAt: admin.database.ServerValue.TIMESTAMP }); return; }
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
