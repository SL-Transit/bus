const admin = require("firebase-admin");
const { onValueCreated } = require("firebase-functions/v2/database");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const lineToken = defineSecret("LINE_CHANNEL_ACCESS_TOKEN");
const bookingLineTo = defineSecret("LINE_TO_ID");
const checkinLineTo = defineSecret("LINE_CHECKIN_TO_ID");

function money(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function formatThaiDate(date) {
  const value = String(date || "");
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : (value || "-");
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
    `เส้นทาง: ${booking.route || "-"}`,
    `วันเวลา: ${booking.date || "-"} ${booking.time || "-"} น.`,
    `จำนวน: ${booking.seats || 1}`,
    "ใกล้ถึงจุดหมายอีก 3 นาที"
  ].join("\n");
}

function buildBookingMessage(booking) {
  const lines = [
    `รหัส: ${booking.code || "-"}`,
    `👤 ชื่อ: ${booking.name || "-"}    📞 โทร: ${booking.phone || "-"}`,
    `🗓 วันที่: ${formatThaiDate(booking.date)} เวลา ${booking.time || "-"} น.`,
    `🚌 จำนวน: ${booking.seats || 1} คน  💰 ราคา: ${money(booking.price)} บาท`
  ];
  if (booking.slip) lines.push(`🖼 สลิป: ${booking.slip}`);
  return lines.join("\n");
}

async function pushLineMessage(to, text) {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lineToken.value()}`,
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

exports.sendLineOnBooking = onValueCreated({
  ref: "/bookings/{code}",
  instance: "bus-booking-1d68c-default-rtdb",
  region: "us-central1",
  secrets: [lineToken, bookingLineTo, checkinLineTo],
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 20
}, async (event) => {
  const booking = event.data.val() || {};
  const code = event.params.code || booking.code || "";
  const ref = event.data.ref;

  if (booking.testMode === true || booking.mockOnly === true) {
    await ref.update({ lineMessagingStatus: "mock_skipped", lineMessagingAt: admin.database.ServerValue.TIMESTAMP });
    return;
  }

  const checkin = isCheckinEvent(booking);
  const to = checkin ? checkinLineTo.value() : bookingLineTo.value();
  const message = checkin ? buildCheckinMessage(booking) : buildBookingMessage(booking);

  try {
    await pushLineMessage(to, message);
    await Promise.all([
      ref.update({
        lineMessagingStatus: "sent",
        lineMessagingAt: admin.database.ServerValue.TIMESTAMP,
        lineMessagingTarget: checkin ? "checkin" : "booking"
      }),
      admin.database().ref(`line_sent/${code}`).set({
        code,
        event: checkin ? "checkin" : "booking_created",
        target: checkin ? "checkin" : "booking",
        sentAt: admin.database.ServerValue.TIMESTAMP,
        status: "sent"
      })
    ]);
  } catch (err) {
    console.error("sendLineOnBooking failed", err);
    await ref.update({
      lineMessagingStatus: "failed",
      lineMessagingError: err && err.message ? err.message : String(err),
      lineMessagingAt: admin.database.ServerValue.TIMESTAMP
    });
    throw err;
  }
});
