"use strict";

// Pure inbound boundary only. Not exported from functions/index.js and not deployed.
// No Firebase, network, logging, booking writes or LINE replies happen here.
const crypto = require("node:crypto");
const PASSENGER_CHANNEL_ID = "2010730849";
const MAX_BODY_BYTES = 256 * 1024;
const MAX_EVENTS = 20;
const USER_ID = /^U[0-9a-f]{32}$/;
const EVENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const COMMANDS = new Map([
  ["เมนู", "menu"], ["เริ่มต้น", "menu"],
  ["จองตั๋ว", "start_booking"], ["การจองของฉัน", "my_bookings"],
  ["ติดต่อเจ้าหน้าที่", "contact_staff"], ["ยกเลิกขั้นตอน", "cancel_flow"]
]);
const POSTBACKS = new Map([
  ["sl:v1:menu", "menu"], ["sl:v1:book", "start_booking"],
  ["sl:v1:mine", "my_bookings"], ["sl:v1:staff", "contact_staff"],
  ["sl:v1:cancel", "cancel_flow"]
]);

function verifySignature(rawBody, signature, channelSecret) {
  if (!Buffer.isBuffer(rawBody) || typeof channelSecret !== "string" || !channelSecret) return false;
  if (typeof signature !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = crypto.createHmac("sha256", channelSecret).update(rawBody).digest();
  const received = Buffer.from(signature, "base64");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function parseCommand(event) {
  if (!event || typeof event !== "object") return null;
  if (event.type === "follow") return { action: "menu" };
  if (event.type === "postback") {
    const data = typeof event.postback?.data === "string" ? event.postback.data : "";
    const choice = /^sl:v1:choose:([1-9]\d{0,8}):([A-Za-z0-9_-]{8,128})$/.exec(data);
    if (choice) return { action: "choose", revision: Number(choice[1]), choiceToken: choice[2] };
    const step = /^sl:v1:(confirm|accept|cancel|staff):([1-9]\d{0,8})$/.exec(data);
    if (step) return { action: { confirm: "confirm", accept: "accept_terms", cancel: "cancel_flow", staff: "contact_staff" }[step[1]], revision: Number(step[2]) };
    const page = /^sl:v1:page:([1-9]\d{0,8}):(0|[1-9]|1[0-2])$/.exec(data);
    if (page) return { action: "page", revision: Number(page[1]), page: Number(page[2]) };
    return { action: POSTBACKS.get(data) || "help" };
  }
  if (event.type === "message" && event.message?.type === "text") {
    const text = typeof event.message.text === "string" ? event.message.text.trim() : "";
    if (!text || text.length > 500) return { action: "help" };
    const action = COMMANDS.get(text);
    // Private command only. HTTP/logging output must never contain inputText.
    return action ? { action } : { action: "input", inputText: text };
  }
  return null;
}
function classifyCommand(event) { return parseCommand(event)?.action || null; }

function result(status, reason, commands = []) {
  // The HTTP wrapper must return ONLY publicBody; commands contain private IDs.
  return { status, publicBody: { status: reason }, commands };
}

function prepareWebhook(request, config = {}) {
  if (request?.method !== "POST") return result(405, "method_not_allowed");
  if (config.enabled !== true || config.channelId !== PASSENGER_CHANNEL_ID ||
      typeof config.channelSecret !== "string" || !config.channelSecret ||
      !USER_ID.test(config.botUserId || "") || !Array.isArray(config.allowedUserIds) ||
      !config.allowedUserIds.length || config.allowedUserIds.length > 20 ||
      config.allowedUserIds.some((id) => typeof id !== "string" || !USER_ID.test(id))) {
    return result(503, "not_configured");
  }
  const rawBody = request.rawBody;
  if (!Buffer.isBuffer(rawBody)) return result(400, "raw_body_required");
  if (rawBody.length > MAX_BODY_BYTES) return result(413, "payload_too_large");
  if (!verifySignature(rawBody, request.signature, config.channelSecret)) return result(401, "invalid_signature");
  let payload;
  try { payload = JSON.parse(rawBody.toString("utf8")); }
  catch { return result(400, "invalid_json"); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.events)) {
    return result(400, "invalid_payload");
  }
  if (payload.destination !== config.botUserId) return result(403, "wrong_destination");
  if (payload.events.length > MAX_EVENTS) return result(413, "too_many_events");
  const commands = [];
  const seen = new Set();
  const allowed = new Set(config.allowedUserIds);
  for (const event of payload.events) {
    if (!event || typeof event !== "object" || Array.isArray(event)) return result(400, "invalid_event");
    // Never process groups/rooms or customers outside the private test cohort.
    if (event.source?.type !== "user" || !allowed.has(event.source?.userId)) continue;
    // Standby events belong to another active receiver; never reply to them.
    if (event.mode !== "active") continue;
    const command = parseCommand(event);
    if (!command) continue;
    if (typeof event.webhookEventId !== "string" || !EVENT_ID.test(event.webhookEventId) ||
        typeof event.replyToken !== "string" || !event.replyToken || event.replyToken.length > 256 ||
        !Number.isSafeInteger(event.timestamp) || event.timestamp < 0) {
      return result(400, "invalid_event_identity");
    }
    if (seen.has(event.webhookEventId)) continue;
    seen.add(event.webhookEventId);
    commands.push({ eventId: event.webhookEventId, userId: event.source.userId,
      replyToken: event.replyToken, eventTimestamp: event.timestamp, ...command,
      redelivery: event.deliveryContext?.isRedelivery === true });
  }
  // Only a preview. Before consumption, atomically claim each eventId in a
  // private durable inbox. Per-request deduplication is NOT replay protection.
  return result(200, payload.events.length ? "preview_only" : "verified", commands);
}

module.exports = { prepareWebhook, verifySignature, classifyCommand, parseCommand,
  PASSENGER_CHANNEL_ID, MAX_BODY_BYTES, MAX_EVENTS };
