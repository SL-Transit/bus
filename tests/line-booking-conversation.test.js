"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const chat = require("../functions/line-booking-conversation.js");
const NOW = Date.parse("2026-11-02T16:00:00Z");
const ACTOR = "synthetic_actor_hash";
const ctx = { actorKey: ACTOR, now: NOW };
const start = () => chat.startConversation({ id: "fixture_session_01", actorKey: ACTOR, now: NOW }).session;
const send = (s, command, context = ctx) => chat.advanceConversation(s, { revision: s.revision, ...command }, context);
function options(s, id = "fixture_stop") {
  return chat.applyOptions(s, { step: s.state, revision: s.revision, publicationVersion: "fixture_version_1",
    timezone: "Asia/Bangkok", options: [{ token: "fixture_token_01", id, label: "ข้อมูลจำลอง " + s.state }] }, NOW).session;
}
function atConsent() {
  let s = start();
  for (const id of ["origin_a", "destination_b", "2026-11-03", "trip_fixture", "2"]) {
    s = options(s, id); s = send(s, { action: "choose", choiceToken: "fixture_token_01" }).session;
  }
  s = send(s, { action: "input", inputText: "ผู้โดยสารจำลอง" }).session;
  s = send(s, { action: "input", inputText: "0890000000" }).session;
  return s;
}
function quoting() { const s = atConsent(); const presented = chat.applyTerms(s, { revision: s.revision, version: "fixture_terms_v1", text: "เงื่อนไขจำลองที่หลังบ้านแสดง" }, NOW).session; return send(presented, { action: "accept_terms" }).session; }
function quote(s, patch = {}) {
  return { revision: s.revision, id: "fixture_quote_1", publicationVersion: s.publicationVersion,
    currency: "THB", totalMinor: 12345, expiresAt: NOW + 60000, seats: 2, available: true, ...patch };
}
function review() { const s = quoting(); return chat.applyQuote(s, quote(s), NOW).session; }

test("starts with published origin lookup, not a database or booking write", () => {
  const result = chat.startConversation({ id: "fixture_session_01", actorKey: ACTOR, now: NOW });
  assert.equal(result.session.state, "origin");
  assert.equal(result.effects.length, 1); assert.equal(result.effects[0].type, "load_published_options");
});
test("rejects invalid session context", () => {
  assert.throws(() => chat.startConversation({ id: "bad/path", actorKey: ACTOR, now: NOW }), /invalid_context/);
  assert.throws(() => chat.startConversation({ id: "fixture_session_01", actorKey: "", now: NOW }), /invalid_context/);
});
test("full synthetic conversation reaches confirmation effect only after consent and quote", () => {
  const s = review(); assert.equal(s.state, "review"); assert.equal(s.selection.pax, "2");
  const result = send(s, { action: "confirm" });
  assert.equal(result.session.state, "submitting");
  assert.equal(result.effects.length, 1); assert.equal(result.effects[0].type, "confirm_existing_booking");
  assert.equal(result.effects[0].quoteId, "fixture_quote_1");
  assert.match(result.effects[0].requestId, /^[a-f0-9]{64}$/);
  assert.equal(result.session.bookingCode, undefined);
});
test("cannot skip steps by sending confirm or accept early", () => {
  for (const action of ["confirm", "accept_terms", "input"]) {
    const result = send(start(), { action, inputText: "0890000000", termsVersion: "fixture_terms" });
    assert.equal(result.session.state, "origin"); assert.equal(result.effects.length, 0);
  }
});
test("rejects a different session owner", () => {
  assert.throws(() => send(start(), { action: "cancel_flow" }, { ...ctx, actorKey: "other_actor" }), /wrong_session_owner/);
});
test("stale choice revisions and unknown tokens do not change selection", () => {
  const s = options(start());
  const stale = send(s, { action: "choose", revision: 999, choiceToken: "fixture_token_01" });
  assert.equal(stale.session.state, "origin"); assert.equal(stale.effects.length, 0);
  const tampered = send(s, { action: "choose", choiceToken: "price=1" });
  assert.equal(tampered.session.state, "origin"); assert.equal(tampered.effects.length, 0);
});
test("session expiry does not create or cancel bookings", () => {
  const s = options(start());
  const result = send(s, { action: "choose", choiceToken: "fixture_token_01" }, { ...ctx, now: s.expiresAt });
  assert.equal(result.effects.length, 0); assert.equal(result.session.state, "origin");
});
test("published version changes and stale async options fail closed", () => {
  const s = options(start());
  const view = { step: s.state, revision: s.revision, publicationVersion: "changed", timezone: "Asia/Bangkok", options: [] };
  assert.throws(() => chat.applyOptions(s, view, NOW), /publication_changed/);
  assert.throws(() => chat.applyOptions(s, { ...view, revision: 100 }, NOW), /invalid_options/);
  assert.throws(() => chat.applyOptions(s, { ...view, timezone: "UTC" }, NOW), /invalid_options/);
});
test("rejects duplicate opaque tokens and too many choices", () => {
  const s = start(); const option = { token: "fixture_token_01", id: "a", label: "จำลอง" };
  const view = { step: "origin", revision: s.revision, publicationVersion: "v1", timezone: "Asia/Bangkok" };
  assert.throws(() => chat.applyOptions(s, { ...view, options: [option, option] }, NOW), /invalid_option/);
  assert.throws(() => chat.applyOptions(s, { ...view, options: Array(101).fill(option) }, NOW), /invalid_options/);
});
test("paginates 15 origin choices without exposing internal IDs or private fields", () => {
  const s = chat.applyOptions(start(), { step: "origin", revision: 1, publicationVersion: "v1", timezone: "Asia/Bangkok",
    options: Array.from({ length: 15 }, (_, i) => ({ token: "fixture_token_" + i, id: "private_stop_" + i, label: "จุดจำลอง " + i })) }, NOW).session;
  const first = chat.publicChoices(s, 0), second = chat.publicChoices(s, 1);
  assert.equal(first.items.length, 8); assert.equal(second.items.length, 7); assert.equal(first.pages, 2);
  assert.equal(JSON.stringify(first).includes(ACTOR), false); assert.equal(JSON.stringify(first).includes("private_stop"), false);
  assert.throws(() => chat.publicChoices(s, 2), /invalid_page/);
});
test("date validation uses Bangkok day, rejects past and impossible dates", () => {
  let s = options(start()); s = send(s, { action: "choose", choiceToken: "fixture_token_01" }).session;
  s = options(s); s = send(s, { action: "choose", choiceToken: "fixture_token_01" }).session;
  assert.equal(s.state, "date");
  assert.throws(() => options(s, "2026-11-01"), /invalid_service_date/);
  assert.throws(() => options(s, "2026-02-30"), /invalid_service_date/);
  // 18:00 UTC on Nov 2 is Nov 3 in Thailand.
  assert.throws(() => chat.applyOptions({ ...s, expiresAt: Date.parse("2026-11-02T18:15:00Z") }, { step: "date", revision: s.revision, publicationVersion: s.publicationVersion,
    timezone: "Asia/Bangkok", options: [{ token: "fixture_token_01", id: "2026-11-02", label: "วันจำลอง" }] }, Date.parse("2026-11-02T18:00:00Z")), /invalid_service_date/);
});
test("limits passenger count choices to existing booking boundary's 1–10", () => {
  let s = start(); for (const id of ["a", "b", "2026-11-03", "trip"]) {
    s = options(s, id); s = send(s, { action: "choose", choiceToken: "fixture_token_01" }).session;
  }
  assert.throws(() => options(s, "11"), /invalid_pax/);
  assert.throws(() => options(s, "0"), /invalid_pax/);
});
test("validates name and phone without reflecting private input", () => {
  let s = start(); for (const id of ["a", "b", "2026-11-03", "trip", "1"]) {
    s = options(s, id); s = send(s, { action: "choose", choiceToken: "fixture_token_01" }).session;
  }
  assert.equal(send(s, { action: "input", inputText: "x".repeat(121) }).session.state, "name");
  s = send(s, { action: "input", inputText: "ผู้โดยสารจำลอง" }).session;
  const invalid = send(s, { action: "input", inputText: "private-invalid-phone" });
  assert.equal(invalid.session.state, "phone"); assert.equal(invalid.text.includes("private-invalid-phone"), false);
});
test("requires a specific terms version before requesting a quote", () => {
  const s = atConsent(); const rejected = send(s, { action: "accept_terms" });
  assert.equal(rejected.session.state, "consent"); assert.equal(rejected.effects.length, 0);
});
test("rejects expired/unavailable/wrong-version/wrong-seat/invalid-price quotes", () => {
  const s = quoting();
  for (const patch of [{ expiresAt: NOW }, { available: false }, { publicationVersion: "wrong" },
    { seats: 1 }, { totalMinor: -1 }, { totalMinor: 1.5 }, { currency: "USD" }, { revision: 999 }]) {
    assert.throws(() => chat.applyQuote(s, quote(s, patch), NOW), /quote_not_ready/);
  }
});
test("expired quote requires a new trusted quote, never confirms old fare", () => {
  const s = review(); const result = send(s, { action: "confirm" }, { ...ctx, now: s.quote.expiresAt });
  assert.equal(result.session.state, "quoting"); assert.equal(result.effects[0].type, "quote_existing_booking");
});
test("repeat confirmation does not emit another booking effect", () => {
  const submitted = send(review(), { action: "confirm" }).session;
  assert.equal(send(submitted, { action: "confirm" }).effects.length, 0);
});
test("booking receipt must match request and owner; uploaded image is not payment proof", () => {
  const s = send(review(), { action: "confirm" }).session;
  const receipt = { requestId: s.requestId, actorKey: ACTOR, bookingCode: "FIXTURE_01", paymentStatus: "awaiting_payment" };
  assert.throws(() => chat.applyReceipt(s, { ...receipt, actorKey: "other" }, NOW), /invalid_receipt/);
  assert.throws(() => chat.applyReceipt(s, { ...receipt, requestId: "other" }, NOW), /invalid_receipt/);
  assert.throws(() => chat.applyReceipt(s, { ...receipt, paymentStatus: "slip_uploaded" }, NOW), /invalid_receipt/);
  const complete = chat.applyReceipt(s, receipt, NOW);
  assert.equal(complete.session.state, "complete"); assert.equal(complete.session.paymentStatus, "awaiting_payment");
  assert.equal(complete.text.includes("ยืนยันชำระเงินแล้ว"), false);
  assert.equal(complete.session.name, undefined); assert.equal(complete.session.phone, undefined);
});
test("cancel flow clears private draft fields and cannot cancel existing ticket", () => {
  const s = review(); const result = send(s, { action: "cancel_flow" });
  assert.equal(result.session.state, "cancelled"); assert.equal(result.effects.length, 0);
  assert.equal(result.session.name, undefined); assert.equal(result.session.phone, undefined); assert.equal(result.session.quote, undefined);
});
test("transitions leave the stored input session unchanged", () => {
  const s = options(start()); const before = JSON.stringify(s);
  send(s, { action: "choose", choiceToken: "fixture_token_01" });
  assert.equal(JSON.stringify(s), before);
});

test("client terms version cannot substitute for presented policy", () => {
  const s = atConsent(); const result = send(s, { action: "accept_terms", termsVersion: "attacker_terms" });
  assert.equal(result.session.state, "consent"); assert.equal(result.effects.length, 0);
  assert.throws(() => chat.applyTerms(s, { revision: 999, version: "v1", text: "terms" }, NOW), /terms_not_ready/);
  const presented = chat.applyTerms(s, { revision: s.revision, version: "fixture_terms", text: "เงื่อนไขจำลอง" }, NOW).session;
  assert.equal(send(presented, { action: "accept_terms", termsVersion: "attacker_terms" }).session.consent.termsVersion, "fixture_terms");
});

test("LINE quick replies are bounded and use revision-bound opaque choices", () => {
  const boundary = require("../functions/line-passenger-webhook.js");
  const s = chat.applyOptions(start(), { step: "origin", revision: 1, publicationVersion: "v1", timezone: "Asia/Bangkok",
    options: Array.from({ length: 100 }, (_, i) => ({ token: "fixture_token_" + i, id: "private_stop_" + i, label: "จุดทดสอบที่มีชื่อยาวมากเพื่อจำกัดความยาวปุ่ม " + i })) }, NOW).session;
  const page = send(s, { action: "page", page: 1 }); const messages = chat.toLineMessages(page);
  assert.equal(messages.length, 1); assert.ok(messages[0].text.includes("ยังไม่ใช่การจองจริง"));
  assert.ok(messages[0].quickReply.items.length <= 13);
  messages[0].quickReply.items.forEach(item => {
    assert.ok(Array.from(item.action.label).length <= 20);
    const parsed = boundary.parseCommand({ type: "postback", postback: { data: item.action.data } });
    assert.equal(parsed.revision, s.revision); assert.notEqual(parsed.action, "help");
  });
  assert.equal(JSON.stringify(messages).includes("private_stop_"), false);
  assert.equal(send(s, { action: "page", page: 13 }).effects.length, 0);
});
test("review shows trusted route, date, quantity, private details and server quote", () => {
  const result = chat.applyQuote(quoting(), quote(quoting()), NOW);
  const text = chat.toLineMessages(result)[0].text;
  for (const value of ["2026-11-03", "จำนวน: 2 คน", "ผู้โดยสารจำลอง", "0890000000", "123.45", "ต้นทาง:", "ปลายทาง:"]) {
    assert.ok(text.includes(value), value);
  }
  assert.ok(text.includes("\n"));
  const confirm = chat.toLineMessages(result)[0].quickReply.items.find(x => x.action.label === "ยืนยันการจอง");
  assert.equal(confirm.action.data, "sl:v1:confirm:" + result.session.revision);
});
test("accept button appears only after trusted policy is presented", () => {
  const s = atConsent(); const labels = r => chat.toLineMessages(r)[0].quickReply.items.map(x => x.action.label);
  assert.equal(labels({ session: s, text: "รอเงื่อนไข" }).includes("ยอมรับเงื่อนไข"), false);
  const policy = chat.applyTerms(s, { revision: s.revision, version: "fixture_terms", text: "เงื่อนไขจำลอง" }, NOW);
  assert.equal(labels(policy).includes("ยอมรับเงื่อนไข"), true);
});
test("in-flight and completed bookings never display another confirm or cancellation button", () => {
  const submitted = send(review(), { action: "confirm" });
  const labels = chat.toLineMessages(submitted)[0].quickReply.items.map(x => x.action.label);
  assert.equal(labels.includes("ยืนยันการจอง"), false); assert.equal(labels.includes("ยกเลิกขั้นตอน"), false);
});
