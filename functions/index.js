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

function safeJobId(code, eventType, recipientType, recipientId) {
  return notificationCenter.safeJobId(code, eventType, recipientType, recipientId);
}

function stableRetryKey(jobId) {
  const crypto = require("crypto");
  return notificationCenter.retryKey(jobId);
}

async function enqueueNotification(db, { code, eventType, recipientType, recipientId, lineTo, text, testMode, mockOnly }) {
  const jobId = safeJobId(code, eventType, recipientType, recipientId);
  const job = { bookingCode: code, eventType, recipient: { type: recipientType, id: recipientId, lineTo: lineTo || "" }, text: text || "", retryKey: stableRetryKey(jobId), createdAt: admin.database.ServerValue.TIMESTAMP, testMode: testMode === true, mockOnly: mockOnly === true };
  await db.ref(`operations/notificationJobs/${jobId}`).transaction((current) => current || job);
  return jobId;
}

async function createBookingJobs(code, booking) {
  const db = admin.database();
  const jobs = [];
  const passenger = passengerLineUserId(booking);
  if (passenger && (booking.notificationPreference || {}).lineTicket === true) {
    jobs.push(enqueueNotification(db, { code, eventType: "booking_created", recipientType: "passenger", recipientId: passenger, lineTo: passenger, text: buildBookingMessage(booking), testMode: booking.testMode, mockOnly: booking.mockOnly }));
  }
  const staffConfig = await staffNotificationCenter.readStaffLineTargetsConfig(db);
  const alerts = staffNotificationCenter.bookingCreatedStaffAlerts({ booking, staffConfig });
  const uniqueAlerts = notificationCenter.dedupeRecipients(alerts.map((alert) => ({ ...alert, type: alert.recipientRole, lineTo: alert.lineTo })));
  for (const alert of uniqueAlerts) jobs.push(enqueueNotification(db, { code, eventType: "booking_created", recipientType: alert.type, recipientId: alert.lineTo, lineTo: alert.lineTo, text: staffNotificationCenter.staffBookingMessage(alert, booking), testMode: booking.testMode, mockOnly: booking.mockOnly }));
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
});

exports.handlePaymentStatusChanged = onValueUpdated({ ref: "/bookings/{code}/paymentStatus", instance: "sl-transit-9464e-default-rtdb", region: "asia-southeast1", secrets: [lineToken], timeoutSeconds: 30, memory: "256MiB", minInstances: 0, maxInstances: 1, concurrency: 1, retry: false }, async (event) => {
  if (event.data.before.val() === "payment_verified" || event.data.after.val() !== "payment_verified") return;
  const snap = await admin.database().ref(`bookings/${event.params.code}`).get();
  const booking = snap.val() || {};
  const to = passengerLineUserId(booking);
  if (to && (booking.notificationPreference || {}).lineTicket === true) await enqueueNotification(admin.database(), { code: event.params.code, eventType: "payment_verified", recipientType: "passenger", recipientId: to, lineTo: to, text: buildBookingMessage(booking), testMode: booking.testMode, mockOnly: booking.mockOnly });
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
  await Promise.all(recipients.map((recipient) => enqueueNotification(admin.database(), { code: event.params.code, eventType: "assignment_changed", recipientType: recipient.type, recipientId: recipient.lineTo, lineTo: recipient.lineTo, text: staffNotificationCenter.staffBookingMessage({ recipientRole: recipient.type, lineTo: recipient.lineTo }, booking), testMode: booking.testMode, mockOnly: booking.mockOnly })));
});

exports.handleCheckinCreated = onValueCreated({ ref: "/operations/bookingEvents/{code}/checkin/{eventId}", instance: "sl-transit-9464e-default-rtdb", region: "asia-southeast1", secrets: [lineToken], timeoutSeconds: 30, memory: "256MiB", minInstances: 0, maxInstances: 1, concurrency: 1, retry: false }, async (event) => {
  const value = event.data.val() || {}; const code = event.params.code; const to = value.lineUserId || "";
  if (to) await enqueueNotification(admin.database(), { code, eventType: "checkin", recipientType: "passenger", recipientId: to, lineTo: to, text: buildCheckinMessage(value), testMode: value.testMode, mockOnly: value.mockOnly });
});

exports.processNotificationJob = onValueCreated({ ref: "/operations/notificationJobs/{jobId}", instance: "sl-transit-9464e-default-rtdb", secrets: [lineToken, staffLineToken], region: "asia-southeast1", timeoutSeconds: 30, memory: "256MiB", minInstances: 0, maxInstances: 1, concurrency: 1, retry: false }, async (event) => {
  const jobId = event.params.jobId; const job = event.data.val() || {}; const db = admin.database(); const dispatchRef = db.ref(`operations/notificationDispatch/${jobId}`);
  const claim = await dispatchRef.transaction((current) => { const decision = notificationCenter.claimDecision(current, Date.now()); if (!decision.claim) return; return { ...(current || {}), status: "processing", attempts: decision.attempts, createdAt: (current && current.createdAt) || admin.database.ServerValue.TIMESTAMP, processingStartedAt: Date.now(), retryKey: job.retryKey, recipient: job.recipient, eventType: job.eventType, bookingCode: job.bookingCode }; });
  if (!claim.committed) return;
  if (job.testMode === true || job.mockOnly === true) { await dispatchRef.update({ status: "mock_skipped", sentAt: admin.database.ServerValue.TIMESTAMP }); return; }
    const token = notificationCenter.tokenKind(job.recipient?.type) === "staff" ? staffLineToken.value() : lineToken.value();
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const delay = notificationCenter.retryDelayMs(attempt);
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const response = await fetch("https://api.line.me/v2/bot/message/push", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Line-Retry-Key": job.retryKey }, body: JSON.stringify({ to: job.recipient.lineTo, messages: [{ type: "text", text: job.text }] }) });
      if (!response.ok) throw new Error(`LINE ${response.status}`);
      await dispatchRef.update({ status: "sent", attempts: attempt, sentAt: admin.database.ServerValue.TIMESTAMP });
      return;
    } catch (error) {
      lastError = String(error.message || error).slice(0, 80);
      await dispatchRef.update({ attempts: attempt, lastErrorCode: lastError });
    }
  }
  await dispatchRef.update({ status: "failed", failedAt: admin.database.ServerValue.TIMESTAMP, lastErrorCode: lastError });
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
    bookingsSnap,
    groupStopsSnap
  ] = await Promise.all([
    db.ref("data/erpDataCenter").get(),
    db.ref(`operations/driverDailyAssignments/${serviceDate}`).get(),
    db.ref(`operations/driverManualOverrides/${serviceDate}`).get(),
    db.ref("operations/driverWorkGenerationConfig").get(),
    db.ref("bookings").get(),
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

  const generatedBookings = bookingsSnap.val() || {};
  Object.entries(generatedBookings).forEach(([code, booking]) => {
    const value = booking || {};
    if (String(value.date || value.serviceDate || "") !== serviceDate) return;
    if (value.cancelled === true || value.status === "cancelled") return;
    Object.assign(plan.updates, driverTicketCenter.buildScheduledAssignmentUpdate(
      code,
      value,
      plan.result.contractsByRuntimeVehicleId || {},
      groupStopsSnap.val() || {}
    ));
  });

  await db.ref().update(plan.updates);
});
