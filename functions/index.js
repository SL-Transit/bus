const admin = require("firebase-admin");
const { onValueCreated, onValueUpdated } = require("firebase-functions/v2/database");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");

admin.initializeApp();

const lineToken = defineSecret("LINE_CHANNEL_ACCESS_TOKEN");
const slip2GoSecret = defineSecret("SLIP2GO_SECRET_KEY");
const slip2GoApiBase = defineString("SLIP2GO_API_BASE");

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

const SLIP2GO_VERIFY_PATH = "/api/verify-slip/qr-image-link/info";
const SLIP2GO_RECEIVER = {
  accountNameTH: "เอส.แอล.ทรานสิต",
  accountNameEN: "S.L.Transit",
  accountNumber: "2328930156"
};
const SLIP2GO_CODE_MESSAGES = {
  "200200": "ชำระเงินสำเร็จ",
  "200401": "บัญชีผู้รับเงินไม่ถูกต้อง กรุณาตรวจสอบชื่อบัญชีปลายทาง",
  "200402": "ยอดเงินที่โอนไม่ตรงกับยอดที่ต้องชำระ",
  "200403": "วันที่โอนไม่ตรงกับเงื่อนไขที่กำหนด",
  "200404": "ไม่พบข้อมูลสลิปในระบบธนาคาร",
  "200500": "สลิปไม่ถูกต้อง กรุณาตรวจสอบหลักฐานการโอนเงิน",
  "200501": "สลิปนี้ถูกใช้ตรวจสอบแล้ว กรุณาใช้สลิปใหม่",
  "200502": "ระบบธนาคารขัดข้อง กรุณาลองใหม่อีกครั้ง",
  "400001": "ไม่พบข้อมูล QR Code ในสลิป กรุณาอัปโหลดสลิปที่ชัดเจน",
  "400002": "ไฟล์รูปภาพไม่ถูกต้อง กรุณาอัปโหลดสลิปใหม่",
  "400004": "รูปแบบลิงก์รูปภาพไม่ถูกต้อง กรุณาลองใหม่",
  "400005": "รูปแบบไฟล์ Base64 ไม่ถูกต้อง",
  "400400": "ข้อมูลตรวจสอบสลิปไม่ถูกต้อง กรุณาลองใหม่",
  "400409": "คำขอตรวจสอบซ้ำซ้อน กรุณารอสักครู่แล้วลองใหม่",
  "401001": "ไม่สามารถยืนยันตัวตนกับ Slip2Go ได้",
  "401002": "ไม่พบร้านค้าหรือสาขาในระบบ Slip2Go",
  "401003": "ไม่พบบัญชีผู้รับเงิน",
  "401004": "แพ็กเกจ Slip2Go หมดอายุ",
  "401005": "โควตาการตรวจสอบสลิปหมด",
  "401006": "เครดิต Slip2Go ไม่เพียงพอ",
  "401007": "IP Address ไม่ได้รับอนุญาต",
  "429000": "มีการส่งคำขอตรวจสอบมากเกินไป กรุณาลองใหม่ภายหลัง",
  "500500": "ระบบตรวจสอบสลิปขัดข้อง กรุณาลองใหม่อีกครั้ง"
};
function jsonResponse(res, status, body) { res.status(status).set("Content-Type", "application/json; charset=utf-8").send(JSON.stringify(body)); }
function cleanAmount(value) { const amount = Number(value || 0); if (!Number.isFinite(amount) || amount <= 0) return ""; return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""); }
function findSlip2GoCode(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "string") { const text = String(value).trim(); if (SLIP2GO_CODE_MESSAGES[text]) return text; }
  if (Array.isArray(value)) { for (const item of value) { const code = findSlip2GoCode(item, depth + 1); if (code) return code; } return ""; }
  if (typeof value === "object") { for (const key of ["response", "responseCode", "code", "status", "statusCode", "resultCode"]) { const code = findSlip2GoCode(value[key], depth + 1); if (code) return code; } for (const item of Object.values(value)) { const code = findSlip2GoCode(item, depth + 1); if (code) return code; } }
  return "";
}
function findPaidAmount(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return null;
  if (Array.isArray(value)) { for (const item of value) { const found = findPaidAmount(item, depth + 1); if (found !== null) return found; } return null; }
  if (typeof value === "object") { for (const key of Object.keys(value)) { if (/^(amount|paidAmount|transferAmount|transferredAmount)$/i.test(key)) { const amount = Number(String(value[key]).replace(/,/g, "")); if (Number.isFinite(amount)) return amount; } } for (const item of Object.values(value)) { const found = findPaidAmount(item, depth + 1); if (found !== null) return found; } }
  return null;
}
function classifySlip2GoResult(code, httpOk) {
  if (code === "200200") return { paymentStatus: "payment_verified", slipVerifyStatus: "success", status: "success", reason: "valid" };
  if (code === "200501") return { paymentStatus: "payment_duplicate", slipVerifyStatus: "failed", status: "failed", reason: "duplicate" };
  if (["200401", "200402", "200403", "200404", "200500", "400001", "400002", "400004", "400005", "400400", "400409"].includes(code)) return { paymentStatus: "payment_rejected", slipVerifyStatus: "failed", status: "failed", reason: "rejected" };
  if (!httpOk || code) return { paymentStatus: "payment_verify_error", slipVerifyStatus: "failed", status: "failed", reason: "provider_error" };
  return { paymentStatus: "payment_verify_error", slipVerifyStatus: "failed", status: "failed", reason: "unknown_response" };
}
function buildSlipMessage(code, reason) { return SLIP2GO_CODE_MESSAGES[code] || (reason === "unknown_response" ? "ไม่สามารถอ่านผลตรวจสอบสลิปได้ กรุณาลองใหม่อีกครั้ง" : "ตรวจสอบสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"); }
exports.verifySlip = onRequest({ region: "us-central1", cors: true, secrets: [slip2GoSecret], timeoutSeconds: 60, memory: "256MiB", maxInstances: 20 }, async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { jsonResponse(res, 405, { ok: false, message: "Method not allowed" }); return; }
  const bookingId = String(req.body && req.body.bookingId || "").trim();
  const imageUrl = String(req.body && req.body.imageUrl || "").trim();
  if (!bookingId || !/^BK\d{6}$/.test(bookingId)) { jsonResponse(res, 400, { ok: false, message: "bookingId ไม่ถูกต้อง" }); return; }
  if (imageUrl.toLowerCase().indexOf("https://") !== 0) { jsonResponse(res, 400, { ok: false, message: "imageUrl ต้องเป็น HTTPS URL ที่เปิดจากภายนอกได้" }); return; }
  const bookingRef = admin.database().ref("bookings/" + bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists()) { jsonResponse(res, 404, { ok: false, message: "ไม่พบรายการจอง" }); return; }
  const booking = bookingSnap.val() || {};
  const requiredAmount = cleanAmount(booking.price);
  if (!requiredAmount) { await bookingRef.update({ paymentStatus: "payment_verify_error", slipVerifyProvider: "slip2go", slipVerifyStatus: "failed", slipVerifyMessage: "ไม่พบยอดเงินที่ต้องชำระในรายการจอง", updatedAt: admin.database.ServerValue.TIMESTAMP }); jsonResponse(res, 400, { ok: false, paymentStatus: "payment_verify_error", message: "ไม่พบยอดเงินที่ต้องชำระในรายการจอง" }); return; }
  const requestPayload = { payload: { imageUrl, checkCondition: { checkDuplicate: true, checkReceiver: [SLIP2GO_RECEIVER], checkAmount: { type: "eq", amount: requiredAmount } } } };
  const verifyRef = admin.database().ref("slipVerifications").push();
  await bookingRef.update({ paymentStatus: "verifying_payment", slipImageUrl: imageUrl, slip: imageUrl, requiredAmount: Number(requiredAmount), slipVerifyProvider: "slip2go", slipVerifyStatus: "pending", updatedAt: admin.database.ServerValue.TIMESTAMP });
  let rawResponse = null; let httpStatus = 0; let responseText = "";
  try {
    const apiBase = String(slip2GoApiBase.value() || "").trim();
    if (!apiBase) throw new Error("Missing SLIP2GO_API_BASE");
    const endpoint = apiBase.replace(/\/$/, "") + SLIP2GO_VERIFY_PATH;
    const providerRes = await fetch(endpoint, { method: "POST", headers: { "Authorization": "Bearer " + slip2GoSecret.value(), "Content-Type": "application/json" }, body: JSON.stringify(requestPayload) });
    httpStatus = providerRes.status;
    responseText = await providerRes.text();
    try { rawResponse = responseText ? JSON.parse(responseText) : null; } catch (parseErr) { rawResponse = { parseError: parseErr.message, body: responseText }; }
    const responseCode = findSlip2GoCode(rawResponse);
    const result = classifySlip2GoResult(responseCode, providerRes.ok);
    const paidAmount = findPaidAmount(rawResponse);
    const message = buildSlipMessage(responseCode, result.reason);
    const update = { paymentStatus: result.paymentStatus, slipImageUrl: imageUrl, slip: imageUrl, requiredAmount: Number(requiredAmount), paidAmount: paidAmount === null ? null : paidAmount, slipVerifyProvider: "slip2go", slipVerifyStatus: result.slipVerifyStatus, slipVerifyMessage: message, slipVerifyCode: responseCode || "", slipVerifyHttpStatus: httpStatus, updatedAt: admin.database.ServerValue.TIMESTAMP };
    if (result.paymentStatus === "payment_verified") update.paymentVerifiedAt = admin.database.ServerValue.TIMESTAMP;
    await Promise.all([bookingRef.update(update), verifyRef.set({ bookingId, imageUrl, provider: "slip2go", requestPayload, rawResponse, httpStatus, responseCode: responseCode || "", status: result.status, reason: result.reason, createdAt: admin.database.ServerValue.TIMESTAMP })]);
    jsonResponse(res, 200, { ok: result.paymentStatus === "payment_verified", bookingId, paymentStatus: result.paymentStatus, slipVerifyStatus: result.slipVerifyStatus, slipVerifyMessage: message, slipVerifyCode: responseCode || "", paidAmount: paidAmount === null ? null : paidAmount });
  } catch (err) {
    console.error("verifySlip failed", err);
    await Promise.all([bookingRef.update({ paymentStatus: "payment_verify_error", slipImageUrl: imageUrl, slip: imageUrl, requiredAmount: Number(requiredAmount), slipVerifyProvider: "slip2go", slipVerifyStatus: "failed", slipVerifyMessage: err && err.message ? err.message : "Slip2Go API error", updatedAt: admin.database.ServerValue.TIMESTAMP }), verifyRef.set({ bookingId, imageUrl, provider: "slip2go", requestPayload, rawResponse: rawResponse || { error: err && err.message ? err.message : String(err), body: responseText }, httpStatus, status: "failed", reason: "api_error", createdAt: admin.database.ServerValue.TIMESTAMP })]);
    jsonResponse(res, 502, { ok: false, bookingId, paymentStatus: "payment_verify_error", message: "ไม่สามารถตรวจสอบสลิปได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" });
  }
});

function isTransferSlipBooking(booking) {
  return booking && booking.slipVerifyProvider === "slip2go";
}

async function markLinePendingPayment(ref) {
  await ref.update({
    lineMessagingStatus: "pending_payment_verification",
    lineMessagingAt: admin.database.ServerValue.TIMESTAMP,
    lineMessagingTarget: "passenger"
  });
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
  if (!checkin && isTransferSlipBooking(booking) && booking.paymentStatus !== "payment_verified") {
    await markLinePendingPayment(ref);
    return;
  }

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
  region: "us-central1",
  secrets: [lineToken],
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 20
}, async (event) => {
  const booking = event.data.val() || {};
  const code = event.params.code || booking.code || "";
  await sendLineForBooking(event.data.ref, code, booking);
});

exports.sendLineOnPaymentVerified = onValueUpdated({
  ref: "/bookings/{code}",
  instance: "sl-transit-9464e-default-rtdb",
  region: "us-central1",
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
