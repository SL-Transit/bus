"use strict";
// Pure conversation reducer. Only trusted server adapters may apply options,
// quotes and receipts. Nothing here reads/writes Firebase or sends LINE messages.
const crypto = require("node:crypto");
const STEPS = ["origin", "destination", "date", "trip", "pax"];
const ID = /^[A-Za-z0-9_-]{8,128}$/;
const TTL = 15 * 60 * 1000;
function clone(s) { return { ...s, selection: { ...s.selection }, selectionLabels: { ...s.selectionLabels }, choices: (s.choices || []).map(x => ({ ...x })) }; }
function out(session, text, effects = []) { return { session, text, effects }; }
function bump(s, state, now) {
  const next = clone(s); next.state = state; next.revision += 1;
  next.expiresAt = now + TTL; next.choices = []; return next;
}
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function requireSession(s) {
  if (!s || s.schemaVersion !== "line_chat_session_v1" || !ID.test(s.id || "") ||
      typeof s.actorKey !== "string" || !s.actorKey || !Number.isSafeInteger(s.revision) ||
      s.revision < 1 || !Number.isSafeInteger(s.expiresAt) || !s.selection) fail("invalid_session");
}
function loadEffect(s) { return { type: "load_published_options", step: s.state,
  revision: s.revision, selection: { ...s.selection }, publicationVersion: s.publicationVersion || null }; }
function startConversation({ id, actorKey, now }) {
  if (!ID.test(id || "") || typeof actorKey !== "string" || !actorKey || !Number.isSafeInteger(now)) fail("invalid_context");
  const s = { schemaVersion: "line_chat_session_v1", id, actorKey, revision: 1,
    state: "origin", expiresAt: now + TTL, selection: {}, choices: [] };
  return out(s, "เลือกต้นทาง", [loadEffect(s)]);
}
function applyOptions(session, view, now) {
  requireSession(session);
  if (now >= session.expiresAt) fail("session_expired");
  if (!view || !STEPS.includes(session.state) || view.step !== session.state ||
      view.revision !== session.revision || !view.publicationVersion || view.timezone !== "Asia/Bangkok" ||
      !Array.isArray(view.options) || view.options.length > 100) fail("invalid_options");
  if (session.publicationVersion && view.publicationVersion !== session.publicationVersion) fail("publication_changed");
  const tokens = new Set();
  const choices = view.options.map(option => {
    if (!option || !ID.test(option.token || "") || tokens.has(option.token) ||
        typeof option.id !== "string" || !option.id || option.id.length > 160 ||
        typeof option.label !== "string" || !option.label || option.label.length > 160) fail("invalid_option");
    tokens.add(option.token);
    if (session.state === "pax" && !/^(?:[1-9]|10)$/.test(option.id)) fail("invalid_pax");
    if (session.state === "date") {
      const parsed = new Date(option.id + "T00:00:00Z");
      const today = new Date(now + 7 * 3600000).toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(option.id) || Number.isNaN(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== option.id || option.id < today) fail("invalid_service_date");
    }
    return { token: option.token, id: option.id, label: option.label };
  });
  const s = clone(session); s.publicationVersion = view.publicationVersion; s.choices = choices;
  return out(s, choices.length ? "กรุณาเลือกจากปุ่ม" : "ไม่พบตัวเลือกที่จองได้ กรุณาติดต่อเจ้าหน้าที่");
}
function publicChoices(session, page = 0) {
  requireSession(session);
  if (!Number.isInteger(page) || page < 0) fail("invalid_page");
  const pages = Math.max(1, Math.ceil(session.choices.length / 8));
  if (page >= pages) fail("invalid_page");
  return { page, pages, items: session.choices.slice(page * 8, (page + 1) * 8).map(x => ({
    label: x.label, data: "sl:v1:choose:" + session.revision + ":" + x.token })) };
}
function advanceConversation(session, command, { actorKey, now }) {
  requireSession(session);
  if (session.actorKey !== actorKey) fail("wrong_session_owner");
  if (!Number.isSafeInteger(now) || !command) fail("invalid_context");
  if (now >= session.expiresAt) return out(session, "ขั้นตอนหมดอายุ กรุณาเริ่มจองใหม่");
  if (command.revision !== session.revision) return out(session, "ปุ่มนี้หมดอายุ กรุณาใช้ปุ่มล่าสุด");
  if (session.state === "submitting" || session.state === "complete") {
    return out(session, session.state === "complete" ? "รายการนี้ดำเนินการแล้ว" : "กำลังตรวจสอบการจอง กรุณารอสักครู่");
  }
  if (command.action === "cancel_flow") {
    const s = bump(session, "cancelled", now); s.selection = {}; s.selectionLabels = {}; delete s.name; delete s.phone;
    delete s.quote; delete s.consent; return out(s, "ยกเลิกขั้นตอนแชทแล้ว ตั๋วเดิมไม่ได้ถูกยกเลิก");
  }
  if (command.action === "contact_staff") return out(session, "ส่งต่อเจ้าหน้าที่", [{ type: "request_staff_handoff" }]);
  if (command.action === "page" && STEPS.includes(session.state)) {
    try { publicChoices(session, command.page); } catch { return out(session, "หน้าตัวเลือกไม่ถูกต้อง"); }
    return { ...out(session, "กรุณาเลือกจากปุ่ม"), page: command.page };
  }
  if (command.action === "choose" && STEPS.includes(session.state)) {
    const selected = session.choices.find(x => x.token === command.choiceToken);
    if (!selected) return out(session, "ตัวเลือกไม่ถูกต้อง กรุณาใช้ปุ่มล่าสุด");
    const index = STEPS.indexOf(session.state);
    const s = bump(session, index === STEPS.length - 1 ? "name" : STEPS[index + 1], now);
    s.selection[session.state] = selected.id; s.selectionLabels[session.state] = selected.label;
    return out(s, s.state === "name" ? "กรุณาพิมพ์ชื่อผู้โดยสาร" : "กรุณาเลือกขั้นตอนถัดไป",
      s.state === "name" ? [] : [loadEffect(s)]);
  }
  if (command.action === "input" && session.state === "name") {
    const name = typeof command.inputText === "string" ? command.inputText.trim() : "";
    if (!name || name.length > 120 || /[\x00-\x1f\x7f]/.test(name)) return out(session, "กรุณาระบุชื่อ 1–120 ตัวอักษร");
    const s = bump(session, "phone", now); s.name = name;
    return out(s, "กรุณาพิมพ์เบอร์โทรศัพท์มือถือ 10 หลัก");
  }
  if (command.action === "input" && session.state === "phone") {
    const phone = typeof command.inputText === "string" ? command.inputText.trim().replace(/[ -]/g, "") : "";
    if (!/^0[689]\d{8}$/.test(phone)) return out(session, "เบอร์โทรศัพท์ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง");
    const s = bump(session, "consent", now); s.phone = phone;
    return out(s, "กรุณาอ่านเงื่อนไขการเดินทางและการใช้ข้อมูลส่วนบุคคลก่อนยอมรับ");
  }
  if (command.action === "accept_terms" && session.state === "consent") {
    // A real wrapper must first display the operator's approved versioned terms.
    if (typeof session.termsVersion !== "string" || !session.termsVersion) return out(session, "ยังไม่มีเงื่อนไขฉบับที่ยืนยันได้");
    const s = bump(session, "quoting", now); s.consent = { termsVersion: session.termsVersion, acceptedAt: now };
    return out(s, "กำลังตรวจสอบราคาและที่นั่ง", [{ type: "quote_existing_booking", revision: s.revision,
      selection: { ...s.selection }, publicationVersion: s.publicationVersion }]);
  }
  if (command.action === "confirm" && session.state === "review") {
    if (!session.quote || now >= session.quote.expiresAt) {
      const s = bump(session, "quoting", now); delete s.quote;
      return out(s, "ราคาหมดอายุ กำลังตรวจสอบใหม่", [{ type: "quote_existing_booking", revision: s.revision,
        selection: { ...s.selection }, publicationVersion: s.publicationVersion }]);
    }
    const s = bump(session, "submitting", now);
    s.requestId = crypto.createHash("sha256").update(session.actorKey + ":" + session.id + ":" + session.revision).digest("hex");
    return out(s, "กำลังยืนยันการจอง", [{ type: "confirm_existing_booking", requestId: s.requestId,
      quoteId: s.quote.id, publicationVersion: s.publicationVersion }]);
  }
  return out(session, "กรุณาตอบตามขั้นตอนหรือใช้ปุ่มล่าสุด");
}
function applyTerms(session, policy, now) {
  requireSession(session);
  if (session.state !== "consent" || now >= session.expiresAt || !policy ||
      policy.revision !== session.revision || typeof policy.version !== "string" ||
      !policy.version || policy.version.length > 128 || typeof policy.text !== "string" ||
      !policy.text || policy.text.length > 3000) fail("terms_not_ready");
  const s = clone(session); s.termsVersion = policy.version;
  return out(s, policy.text);
}
function applyQuote(session, quote, now) {
  requireSession(session);
  if (session.state !== "quoting" || now >= session.expiresAt || !quote || quote.revision !== session.revision ||
      typeof quote.id !== "string" || !quote.id || quote.id.length > 160 ||
      quote.publicationVersion !== session.publicationVersion || quote.currency !== "THB" ||
      !Number.isSafeInteger(quote.totalMinor) || quote.totalMinor < 0 ||
      !Number.isSafeInteger(quote.expiresAt) || quote.expiresAt <= now ||
      quote.seats !== Number(session.selection.pax) || quote.available !== true) fail("quote_not_ready");
  const s = bump(session, "review", now);
  s.quote = { id: quote.id, totalMinor: quote.totalMinor, currency: quote.currency, expiresAt: quote.expiresAt };
  // Fare/fees come only from the trusted server quote, never from postback data.
  const labels = s.selectionLabels || {};
  return out(s, ["ตรวจสอบรายการก่อนยืนยัน", "ต้นทาง: " + (labels.origin || s.selection.origin),
    "ปลายทาง: " + (labels.destination || s.selection.destination), "วันเดินทาง: " + s.selection.date,
    "เที่ยว: " + (labels.trip || s.selection.trip), "จำนวน: " + s.selection.pax + " คน",
    "ชื่อ: " + s.name, "โทร: " + s.phone, "ยอดรวม " + (quote.totalMinor / 100).toFixed(2) + " บาท"].join("\n"));
}
function applyReceipt(session, receipt, now) {
  requireSession(session);
  // Caller is a trusted adapter only, never a passenger webhook body.
  if (session.state !== "submitting" || !receipt || receipt.requestId !== session.requestId ||
      receipt.actorKey !== session.actorKey || typeof receipt.bookingCode !== "string" ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(receipt.bookingCode) ||
      !["awaiting_payment", "pay_on_site", "payment_verified"].includes(receipt.paymentStatus)) fail("invalid_receipt");
  const s = bump(session, "complete", now); s.bookingCode = receipt.bookingCode; s.paymentStatus = receipt.paymentStatus;
  delete s.choices; s.choices = []; delete s.name; delete s.phone;
  return out(s, receipt.paymentStatus === "payment_verified" ? "ยืนยันชำระเงินแล้ว" :
    receipt.paymentStatus === "pay_on_site" ? "บันทึกการจองแล้ว ชำระเงินตามเงื่อนไขหน้างาน" : "บันทึกการจองแล้ว รอตรวจสอบการชำระเงิน");
}
function toLineMessages(result, { testMode = true } = {}) {
  const s = result.session; requireSession(s);
  const items = [];
  const button = (label, data) => ({ type: "action", action: { type: "postback",
    label: Array.from(label).slice(0, 20).join(""), data } });
  if (STEPS.includes(s.state) && s.choices.length) {
    const page = publicChoices(s, result.page || 0);
    page.items.forEach(x => items.push(button(x.label, x.data)));
    if (page.page > 0) items.push(button("หน้าก่อน", "sl:v1:page:" + s.revision + ":" + (page.page - 1)));
    if (page.page + 1 < page.pages) items.push(button("หน้าถัดไป", "sl:v1:page:" + s.revision + ":" + (page.page + 1)));
  }
  if (s.state === "consent" && s.termsVersion) items.push(button("ยอมรับเงื่อนไข", "sl:v1:accept:" + s.revision));
  if (s.state === "review") items.push(button("ยืนยันการจอง", "sl:v1:confirm:" + s.revision));
  if (!["submitting", "complete", "cancelled"].includes(s.state)) items.push(button("ยกเลิกขั้นตอน", "sl:v1:cancel:" + s.revision));
  items.push(button("ติดต่อเจ้าหน้าที่", "sl:v1:staff:" + s.revision));
  const prefix = testMode ? "[ตัวอย่างทดสอบ ยังไม่ใช่การจองจริง]\n" : "";
  const message = { type: "text", text: prefix + String(result.text || "กรุณาเลือกขั้นตอน").slice(0, 4500) };
  if (items.length) message.quickReply = { items };
  return [message];
}

module.exports = { startConversation, applyOptions, publicChoices, advanceConversation, applyTerms, applyQuote, applyReceipt, toLineMessages };
