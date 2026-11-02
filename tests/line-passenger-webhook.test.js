"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const boundary = require("../functions/line-passenger-webhook.js");
const BOT = "U" + "0".repeat(32);
const USER = "U" + "1".repeat(32);
const OTHER = "U" + "2".repeat(32);
const SECRET = "synthetic-test-secret-not-a-real-credential";
const config = () => ({ enabled: true, channelId: "2010730849", channelSecret: SECRET,
  botUserId: BOT, allowedUserIds: [USER] });
const event = (overrides = {}) => ({ type: "message", mode: "active",
  webhookEventId: "fixture_event_1", replyToken: "synthetic-reply-token",
  source: { type: "user", userId: USER }, message: { type: "text", text: "จองตั๋ว" }, ...overrides });
function request(events = [event()], extra = {}) {
  const rawBody = Buffer.from(JSON.stringify({ destination: BOT, events, ...extra }));
  return signed(rawBody);
}
function signed(rawBody) {
  return { method: "POST", rawBody, signature: crypto.createHmac("sha256", SECRET).update(rawBody).digest("base64") };
}
const preview = (events, options = config()) => boundary.prepareWebhook(request(events), options);

test("disabled by default and no commands escape", () => {
  const out = boundary.prepareWebhook(request());
  assert.equal(out.status, 503); assert.equal(out.commands.length, 0);
});
test("requires POST", () => {
  assert.equal(boundary.prepareWebhook({ ...request(), method: "GET" }, config()).status, 405);
});
test("accepts signed empty LINE verification for configured passenger bot", () => {
  const out = preview([]); assert.equal(out.status, 200);
  assert.equal(out.publicBody.status, "verified"); assert.equal(out.commands.length, 0);
});
test("recognizes Thai booking intent without creating a booking", () => {
  const out = preview([event()]); assert.equal(out.status, 200);
  assert.equal(out.publicBody.status, "preview_only");
  assert.equal(out.commands[0].action, "start_booking");
  assert.equal(out.commands[0].eventId, "fixture_event_1");
});
test("signature covers original UTF-8 bytes including whitespace and emoji", () => {
  const raw = Buffer.from('{ "destination": "' + BOT + '", "events": [], "note": "ทดสอบ 🚌" }\n');
  const req = signed(raw);
  assert.equal(boundary.prepareWebhook(req, config()).status, 200);
  req.rawBody = Buffer.from(JSON.stringify(JSON.parse(raw.toString())));
  assert.equal(boundary.prepareWebhook(req, config()).status, 401);
});
test("rejects wrong secret, missing signature, malformed signature", () => {
  for (const signature of [undefined, "", "x", "a".repeat(44), "=".repeat(44)]) {
    assert.equal(boundary.prepareWebhook({ ...request(), signature }, config()).status, 401);
  }
  assert.equal(boundary.prepareWebhook(request(), { ...config(), channelSecret: "wrong" }).status, 401);
});
test("does not reconstruct rawBody from parsed request.body", () => {
  const req = request(); delete req.rawBody; req.body = { destination: BOT, events: [] };
  assert.equal(boundary.prepareWebhook(req, config()).status, 400);
});
test("rejects malformed JSON and payload shapes even when signed", () => {
  for (const text of ["{", "null", "[]", "{}", '{"events":{}}']) {
    assert.equal(boundary.prepareWebhook(signed(Buffer.from(text)), config()).status, 400);
  }
});
test("rejects a different destination bot", () => {
  assert.equal(boundary.prepareWebhook(request([], { destination: OTHER }), config()).status, 403);
});
test("rejects staff channel configuration", () => {
  assert.equal(preview([], { ...config(), channelId: "2010104391" }).status, 503);
});
test("fails closed for missing or malformed private test cohort", () => {
  for (const allowedUserIds of [undefined, [], ["*"], [USER, null], [123], Array(21).fill(USER)]) {
    assert.equal(preview([], { ...config(), allowedUserIds }).status, 503);
  }
});
test("fails closed without secret or bot identity", () => {
  for (const patch of [{ channelSecret: "" }, { botUserId: "" }, { botUserId: "*" }]) {
    assert.equal(preview([], { ...config(), ...patch }).status, 503);
  }
});
test("ignores non-test customers and group/room messages", () => {
  const events = [event({ source: { type: "user", userId: OTHER } }),
    event({ source: { type: "group", groupId: "synthetic", userId: USER } }),
    event({ source: { type: "room", roomId: "synthetic", userId: USER } })];
  assert.equal(preview(events).commands.length, 0);
});
test("standby and missing receiver mode never produce replies", () => {
  assert.equal(preview([event({ mode: "standby" }), event({ mode: undefined })]).commands.length, 0);
});
test("deduplicates within one delivery, preserves redelivery marker", () => {
  const e = event({ deliveryContext: { isRedelivery: true } });
  const out = preview([e, e]); assert.equal(out.commands.length, 1);
  assert.equal(out.commands[0].redelivery, true);
});
test("rejects invalid event identity before returning any commands", () => {
  for (const patch of [{ webhookEventId: "" }, { webhookEventId: "bad/id" }, { replyToken: "" }]) {
    const out = preview([event(), event(patch)]);
    assert.equal(out.status, 400); assert.equal(out.commands.length, 0);
  }
  assert.equal(preview([event(), null]).status, 400);
});
test("bounds body and batch sizes", () => {
  assert.equal(boundary.prepareWebhook(signed(Buffer.alloc(boundary.MAX_BODY_BYTES + 1)), config()).status, 413);
  assert.equal(preview(Array(boundary.MAX_EVENTS + 1).fill(event())).status, 413);
});
test("recognizes allowlisted buttons and safely handles unknown input", () => {
  const actions = ["menu", "start_booking", "my_bookings", "contact_staff", "cancel_flow"];
  const keys = ["menu", "book", "mine", "staff", "cancel"];
  keys.forEach((key, i) => assert.equal(boundary.classifyCommand({ type: "postback", postback: { data: "sl:v1:" + key } }), actions[i]));
  assert.equal(boundary.classifyCommand({ type: "postback", postback: { data: "sl:v1:book&price=1" } }), "help");
  assert.equal(boundary.classifyCommand({ type: "message", message: { type: "text", text: "ข้อมูลส่วนตัวที่ไม่ควรสะท้อนกลับ" } }), "help");
});
test("follow opens menu; image and unfollow need separate future handlers", () => {
  assert.equal(boundary.classifyCommand({ type: "follow" }), "menu");
  assert.equal(boundary.classifyCommand({ type: "message", message: { type: "image" } }), null);
  assert.equal(boundary.classifyCommand({ type: "unfollow" }), null);
});
test("public HTTP response contains no user ID, token, secret or text", () => {
  const out = preview([event()]);
  assert.equal(JSON.stringify(out.publicBody), '{"status":"preview_only"}');
  for (const sensitive of [USER, SECRET, "synthetic-reply-token", "จองตั๋ว"]) {
    assert.equal(JSON.stringify(out.publicBody).includes(sensitive), false);
  }
});
