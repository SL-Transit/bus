"use strict";

const VALID_STATES = new Set([
  "open",
  "temporarily_closed",
  "full",
  "cancelled",
  "delayed",
  "vehicle_changed",
  "scheduled_closure",
  "not_yet_open"
]);

const VALID_SCOPES = new Set([
  "system",
  "service_group",
  "route",
  "direction",
  "trip",
  "departure_time",
  "boarding_stop",
  "destination_stop",
  "service_date",
  "date_range",
  "recurring_weekday",
  "time_window"
]);

const CUSTOMER_MESSAGES = {
  temporarily_closed: "เที่ยวนี้ปิดรับการสำรองที่นั่งชั่วคราว",
  full: "เที่ยวนี้เต็มแล้ว",
  cancelled: "เที่ยวนี้ถูกยกเลิก",
  delayed: "เที่ยวนี้ล่าช้า",
  vehicle_changed: "เที่ยวนี้มีการเปลี่ยนรถ",
  scheduled_closure: "เที่ยวนี้ปิดรับการสำรองที่นั่งชั่วคราว",
  not_yet_open: "ยังไม่เปิดรับการสำรองที่นั่ง",
  boarding_stop: "ป้ายนี้ไม่เปิดรับการสำรองในเที่ยวดังกล่าว",
  destination_stop: "ป้ายปลายทางนี้ไม่เปิดรับการสำรองในเที่ยวดังกล่าว",
  open: "เปิดรับการสำรองที่นั่ง"
};
/* legacy text below is intentionally shadowed by the UTF-8 contract above */
/*
  temporarily_closed: "เที่ยวนี้ปิดรับการสำรองที่นั่งชั่วคราว",
  full: "เที่ยวนี้เต็มแล้ว",
  cancelled: "เที่ยวนี้ถูกยกเลิก",
  delayed: "เที่ยวนี้ล่าช้า",
  vehicle_changed: "เที่ยวนี้มีการเปลี่ยนรถ",
  scheduled_closure: "เที่ยวนี้ปิดรับการสำรองที่นั่งชั่วคราว",
  not_yet_open: "ยังไม่เปิดรับการสำรองที่นั่ง",
  boarding_stop: "ป้ายนี้ไม่เปิดรับการสำรองในเที่ยวดังกล่าว",
  destination_stop: "ป้ายปลายทางนี้ไม่เปิดรับการสำรองในเที่ยวดังกล่าว",
  open: "เปิดรับการสำรองที่นั่ง"
*/

Object.assign(CUSTOMER_MESSAGES, {
  temporarily_closed: "เที่ยวนี้ปิดรับการสำรองที่นั่งชั่วคราว",
  full: "เที่ยวนี้เต็มแล้ว",
  cancelled: "เที่ยวนี้ถูกยกเลิก",
  delayed: "เที่ยวนี้ล่าช้า",
  vehicle_changed: "เที่ยวนี้มีการเปลี่ยนรถ",
  scheduled_closure: "เที่ยวนี้ปิดรับการสำรองที่นั่งชั่วคราว",
  not_yet_open: "ยังไม่เปิดรับการสำรองที่นั่ง",
  boarding_stop: "ป้ายนี้ไม่เปิดรับการสำรองในเที่ยวดังกล่าว",
  destination_stop: "ป้ายปลายทางนี้ไม่เปิดรับการสำรองในเที่ยวดังกล่าว",
  open: "เปิดรับการสำรองที่นั่ง"
});

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function safeKey(value, fallback) {
  const text = clean(value);
  return /^[A-Za-z0-9_-]{1,160}$/.test(text) ? text : (fallback || "");
}

function timestampMs(value) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateKey(value) {
  const text = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function controlIdFor(input, nowMs) {
  return "ctrl_" + safeKey(input.scopeType || "scope") + "_" + String(nowMs || Date.now()) + "_" + Math.random().toString(36).slice(2, 8);
}

function normalizeScope(scope) {
  const raw = scope && typeof scope === "object" ? scope : {};
  const type = clean(raw.type || raw.scopeType || "system");
  if (!VALID_SCOPES.has(type)) throw publicError("invalid_control_scope", 400);
  return {
    type,
    serviceGroupId: safeKey(raw.serviceGroupId),
    routeId: safeKey(raw.routeId),
    directionId: safeKey(raw.directionId),
    tripId: safeKey(raw.tripId),
    departureTime: clean(raw.departureTime || raw.time).slice(0, 5),
    boardingStopId: safeKey(raw.boardingStopId || raw.originStopKey),
    destinationStopId: safeKey(raw.destinationStopId || raw.destStopKey),
    serviceDate: dateKey(raw.serviceDate || raw.date),
    startDate: dateKey(raw.startDate),
    endDate: dateKey(raw.endDate),
    weekdays: Array.isArray(raw.weekdays) ? raw.weekdays.map(Number).filter((day) => day >= 0 && day <= 6) : [],
    startTime: clean(raw.startTime).slice(0, 5),
    endTime: clean(raw.endTime).slice(0, 5)
  };
}

function normalizeControl(input, actor, previous, nowMs) {
  const row = input && typeof input === "object" ? input : {};
  const state = clean(row.state || row.currentState || "temporarily_closed");
  if (!VALID_STATES.has(state)) throw publicError("invalid_control_state", 400);
  const scope = normalizeScope(row.scope || row);
  const start = timestampMs(row.effectiveStart || row.effectiveStartMs) || nowMs;
  const end = timestampMs(row.effectiveEnd || row.effectiveEndMs);
  const expiry = timestampMs(row.expiry || row.expiryMs) || end;
  if (end && end < start) throw publicError("invalid_effective_period", 400);
  const customerMessage = clean(row.customerMessageTh || row.customerFacingThaiMessage) ||
    CUSTOMER_MESSAGES[scope.type] ||
    CUSTOMER_MESSAGES[state] ||
    CUSTOMER_MESSAGES.temporarily_closed;
  return {
    controlId: clean(row.controlId) || controlIdFor({ scopeType: scope.type }, nowMs),
    scope,
    currentState: state,
    reason: clean(row.reason).slice(0, 240) || "owner_operation",
    internalNote: clean(row.internalNote).slice(0, 500),
    customerMessageTh: customerMessage.slice(0, 240),
    effectiveStartMs: start,
    effectiveEndMs: end,
    expiryMs: expiry,
    actorUid: actor.uid,
    actorRole: actor.role,
    createdAtMs: previous && previous.createdAtMs || nowMs,
    updatedAtMs: nowMs,
    version: Number(previous && previous.version || 0) + 1,
    previousState: previous && previous.currentState || null,
    auditReference: "audit_" + nowMs + "_" + Math.random().toString(36).slice(2, 8),
    workflowState: clean(row.workflowState || "published"),
    reviewerUid: clean(row.reviewerUid),
    publisherUid: actor.uid,
    rollbackOf: clean(row.rollbackOf)
  };
}

function publicError(message, status) {
  const err = new Error(message);
  err.httpStatus = status || 400;
  return err;
}

function isEffective(control, ctx, nowMs) {
  if (!control || control.workflowState !== "published") return false;
  const start = Number(control.effectiveStartMs || 0);
  const end = Number(control.effectiveEndMs || control.expiryMs || 0);
  if (start && nowMs < start) return false;
  if (end && nowMs > end) return false;
  const scope = control.scope || {};
  const day = dateKey(ctx.serviceDate || ctx.date);
  if (scope.serviceDate && scope.serviceDate !== day) return false;
  if (scope.startDate && day && day < scope.startDate) return false;
  if (scope.endDate && day && day > scope.endDate) return false;
  if (scope.weekdays && scope.weekdays.length && day) {
    const weekday = new Date(day + "T00:00:00+07:00").getDay();
    if (!scope.weekdays.includes(weekday)) return false;
  }
  const time = clean(ctx.departureTime || ctx.pickupTime || ctx.time).slice(0, 5);
  if (scope.departureTime && scope.departureTime !== time) return false;
  if (scope.startTime && time && time < scope.startTime) return false;
  if (scope.endTime && time && time > scope.endTime) return false;
  if (scope.serviceGroupId && scope.serviceGroupId !== clean(ctx.serviceGroupId)) return false;
  if (scope.routeId && scope.routeId !== clean(ctx.routeId)) return false;
  if (scope.directionId && scope.directionId !== clean(ctx.directionId)) return false;
  if (scope.tripId && scope.tripId !== clean(ctx.tripId)) return false;
  if (scope.boardingStopId && scope.boardingStopId !== clean(ctx.boardingStopId || ctx.originStopKey)) return false;
  if (scope.destinationStopId && scope.destinationStopId !== clean(ctx.destinationStopId || ctx.destStopKey)) return false;
  return true;
}

function priority(control) {
  const type = control && control.scope && control.scope.type;
  return {
    system: 1,
    service_group: 2,
    route: 3,
    direction: 4,
    service_date: 5,
    date_range: 5,
    recurring_weekday: 5,
    time_window: 6,
    trip: 7,
    departure_time: 8,
    boarding_stop: 9,
    destination_stop: 9
  }[type] || 0;
}

function evaluateControls(controls, ctx, nowMs) {
  const list = Object.keys(controls || {}).map((key) => controls[key]).filter((control) => isEffective(control, ctx || {}, nowMs || Date.now()));
  list.sort((a, b) => priority(b) - priority(a) || Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0));
  const winner = list[0] || null;
  if (!winner || winner.currentState === "open") {
    return { bookingOpen: true, state: "open", reason: "open", customerMessageTh: CUSTOMER_MESSAGES.open, matchedControls: list.length };
  }
  return {
    bookingOpen: false,
    state: winner.currentState,
    reason: winner.reason,
    customerMessageTh: winner.customerMessageTh || CUSTOMER_MESSAGES[winner.currentState] || CUSTOMER_MESSAGES.temporarily_closed,
    controlId: winner.controlId,
    matchedControls: list.length
  };
}

function summarizeControls(controls, nowMs) {
  const now = nowMs || Date.now();
  const all = Object.keys(controls || {}).map((key) => controls[key]);
  return {
    current: all.filter((control) => isEffective(control, {}, now)).length,
    future: all.filter((control) => Number(control.effectiveStartMs || 0) > now).length,
    expired: all.filter((control) => Number(control.effectiveEndMs || control.expiryMs || 0) > 0 && Number(control.effectiveEndMs || control.expiryMs) < now).length,
    total: all.length
  };
}

module.exports = {
  VALID_STATES,
  VALID_SCOPES,
  normalizeControl,
  evaluateControls,
  summarizeControls,
  publicError
};
