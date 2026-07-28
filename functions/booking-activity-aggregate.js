"use strict";

const TIMEZONE = "Asia/Bangkok";
const RANGE_SIZES = { hourly: 24, daily: 30, weekly: 12, monthly: 12, yearly: 5 };
const DAY_MS = 86400000;
const ALLOWED_SOURCES = new Set(["booking1.html"]);
const ALLOWED_SOURCE_MODES = new Set(["erp_data_center"]);
const COUNTED_STATUSES = new Set([
  "awaiting_payment",
  "pay_on_site",
  "slip_uploaded",
  "confirmed",
  "paid",
  "completed",
  "cancelled",
  "canceled",
  "refunded"
]);
const EXCLUDED_STATUSES = new Set(["draft", "failed", "invalid", "write_failed"]);

function pad(value) {
  return String(value).padStart(2, "0");
}

function bangkokParts(ms) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(ms));
  const out = {};
  parts.forEach((part) => { out[part.type] = part.value; });
  return out;
}

function ymdFromMs(ms) {
  const p = bangkokParts(ms);
  return `${p.year}-${p.month}-${p.day}`;
}

function parseAnchor(anchor, nowMs) {
  const value = anchor || ymdFromMs(nowMs || Date.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));
  return ymdFromMs(date.getTime()) === value ? date : null;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function addYears(date, years) {
  const d = new Date(date.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

function startOfBangkokMonth(date) {
  const p = bangkokParts(date.getTime());
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, 1, -7, 0, 0, 0));
}

function startOfBangkokYear(date) {
  const p = bangkokParts(date.getTime());
  return new Date(Date.UTC(Number(p.year), 0, 1, -7, 0, 0, 0));
}

function weekNo(date) {
  const local = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return Math.ceil((((local - new Date(Date.UTC(local.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
}

function bucketForMs(range, ms) {
  const p = bangkokParts(ms);
  if (range === "hourly") return `${p.year}-${p.month}-${p.day}T${p.hour}`;
  if (range === "weekly") {
    const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
    return `${p.year}-W${weekNo(d)}`;
  }
  if (range === "monthly") return `${p.year}-${p.month}`;
  if (range === "yearly") return String(p.year);
  return `${p.year}-${p.month}-${p.day}`;
}

function labelFor(range, key) {
  if (range === "hourly") return `${key.slice(-2)}:00`;
  if (range === "weekly") return `สัปดาห์ ${Number(key.split("-W")[1] || 0)}`;
  if (range === "monthly") {
    const names = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const [year, month] = key.split("-");
    return `${names[Number(month) - 1]} ${String(Number(year) + 543).slice(-2)}`;
  }
  if (range === "yearly") return String(Number(key) + 543);
  const [, month, day] = key.split("-");
  return `${Number(day)}/${Number(month)}`;
}

function bucketPlan(range, anchor, nowMs) {
  if (!Object.prototype.hasOwnProperty.call(RANGE_SIZES, range)) return null;
  const anchorDate = parseAnchor(anchor, nowMs);
  if (!anchorDate) return null;
  const points = [];
  const count = RANGE_SIZES[range];
  for (let i = count - 1; i >= 0; i -= 1) {
    let d = anchorDate;
    if (range === "hourly") d = anchorDate;
    else if (range === "daily") d = addDays(anchorDate, -i);
    else if (range === "weekly") d = addDays(anchorDate, -i * 7);
    else if (range === "monthly") d = addMonths(anchorDate, -i);
    else if (range === "yearly") d = addYears(anchorDate, -i);
    let key;
    if (range === "hourly") {
      const p = bangkokParts(d.getTime());
      key = `${p.year}-${p.month}-${p.day}T${pad(count - 1 - i)}`;
    } else {
      key = bucketForMs(range, d.getTime());
    }
    points.push({ key, label: labelFor(range, key), bookings: 0, cancellations: 0, refunds: 0 });
  }
  return points;
}

function queryWindow(range, anchor, nowMs) {
  const anchorDate = parseAnchor(anchor, nowMs);
  if (!anchorDate || !Object.prototype.hasOwnProperty.call(RANGE_SIZES, range)) return null;
  let start = anchorDate;
  let end = addDays(anchorDate, 1).getTime() - 1;
  if (range === "daily") start = addDays(anchorDate, -29);
  else if (range === "weekly") start = addDays(anchorDate, -83);
  else if (range === "monthly") {
    start = addMonths(startOfBangkokMonth(anchorDate), -11);
    end = addMonths(startOfBangkokMonth(anchorDate), 1).getTime() - 1;
  } else if (range === "yearly") {
    start = addYears(startOfBangkokYear(anchorDate), -4);
    end = addYears(startOfBangkokYear(anchorDate), 1).getTime() - 1;
  }
  return { startMs: start.getTime(), endMs: end };
}

function numericTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function createdTimestamp(record, options) {
  const opts = options || {};
  const ts = numericTimestamp(record.ts);
  if (ts) return { ms: ts, field: "ts", serverVerified: true };
  if (opts.allowFallbackCreatedAtMs === true) {
    const createdAtMs = numericTimestamp(record.createdAtMs);
    if (createdAtMs) return { ms: createdAtMs, field: "createdAtMs", serverVerified: true };
  }
  if (opts.allowLegacyCreatedAt === true) {
    const createdAt = numericTimestamp(record.createdAt);
    if (createdAt) return { ms: createdAt, field: "createdAt", serverVerified: true };
  }
  if (opts.allowContractTimestamp === true) {
    const timestamp = numericTimestamp(record.timestamp) || numericTimestamp(record.serverTimestamp);
    if (timestamp) return { ms: timestamp, field: record.timestamp ? "timestamp" : "serverTimestamp", serverVerified: true };
  }
  return null;
}

function createdAtMs(record, options) {
  const timestamp = createdTimestamp(record, options);
  return timestamp ? timestamp.ms : null;
}

function validBookingId(id, record) {
  const value = String(record.code || record.bookingCode || id || "").trim();
  return /^[A-Z0-9][A-Z0-9_-]{5,}$/i.test(value);
}

function validYmd(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));
  return ymdFromMs(date.getTime()) === text;
}

function bookingStatus(record) {
  return String(record.status || record.bookingStatus || record.paymentStatus || "").toLowerCase();
}

function isRealBooking(id, record, options) {
  if (!record || typeof record !== "object") return { ok: false, reason: "not_object" };
  if (record.testMode === true || record.mockPayment === true || record.mockOnly === true || record.automatedTest === true) {
    return { ok: false, reason: "test_or_mock" };
  }
  if (!validBookingId(id, record)) return { ok: false, reason: "invalid_booking_id" };
  if (!createdTimestamp(record, options)) return { ok: false, reason: "missing_created_server_timestamp" };
  if (!ALLOWED_SOURCES.has(String(record.source || ""))) return { ok: false, reason: "invalid_source" };
  if (!ALLOWED_SOURCE_MODES.has(String(record.sourceMode || ""))) return { ok: false, reason: "invalid_source_mode" };
  if (!validYmd(record.date || record.serviceDate)) return { ok: false, reason: "invalid_service_date" };
  if (!String(record.origin || "").trim() || !String(record.destination || "").trim()) return { ok: false, reason: "missing_route" };
  if (!(Number(record.pax || record.seats || 0) > 0)) return { ok: false, reason: "invalid_pax" };
  const status = bookingStatus(record);
  if (EXCLUDED_STATUSES.has(status)) return { ok: false, reason: "excluded_status" };
  if (!COUNTED_STATUSES.has(status)) return { ok: false, reason: "unknown_status" };
  return { ok: true };
}

function isCancelled(record) {
  const status = String(record.status || record.bookingStatus || "").toLowerCase();
  return status === "cancelled" || status === "canceled";
}

function isRefunded(record) {
  const payment = String(record.paymentStatus || "").toLowerCase();
  const refund = String(record.refundStatus || "").toLowerCase();
  return payment === "refunded" || refund === "refunded" || refund === "approved" || refund === "completed";
}

function aggregateBookingActivity(records, options) {
  const opts = options || {};
  const range = opts.range || "daily";
  const points = bucketPlan(range, opts.anchor, opts.nowMs);
  if (!points) throw new Error("invalid_range_or_anchor");
  const byKey = {};
  points.forEach((point) => { byKey[point.key] = point; });
  const invalid = {};
  Object.keys(records || {}).forEach((id) => {
    const record = records[id] || {};
    const valid = isRealBooking(id, record, opts);
    if (!valid.ok) {
      invalid[valid.reason] = (invalid[valid.reason] || 0) + 1;
      return;
    }
    const key = bucketForMs(range, createdAtMs(record, opts));
    const point = byKey[key];
    if (!point) return;
    point.bookings += 1;
    if (isCancelled(record)) point.cancellations += 1;
    if (isRefunded(record)) point.refunds += 1;
  });
  const totals = points.reduce((out, point) => {
    out.bookings += point.bookings;
    out.cancellations += point.cancellations;
    out.refunds += point.refunds;
    return out;
  }, { bookings: 0, cancellations: 0, refunds: 0 });
  return {
    status: totals.bookings || totals.cancellations || totals.refunds ? "ready" : "empty",
    range,
    timezone: TIMEZONE,
    points,
    totals,
    invalidRecords: invalid
  };
}

module.exports = {
  TIMEZONE,
  RANGE_SIZES,
  aggregateBookingActivity,
  bucketPlan,
  queryWindow,
  bucketForMs,
  createdAtMs,
  createdTimestamp,
  validYmd,
  isRealBooking
};
