"use strict";

const VERSION = "web_analytics_v1";
const TIMEZONE = "Asia/Bangkok";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;
const MIN_EVENT_INTERVAL_MS = 1000;
const MAX_BODY_BYTES = 2048;
const RETENTION_MS = {
  visitorState: 180 * 24 * 60 * 60 * 1000,
  eventRate: 2 * 24 * 60 * 60 * 1000,
  hourly: 7 * 24 * 60 * 60 * 1000,
  daily: 60 * 24 * 60 * 60 * 1000,
  weekly: 16 * 7 * 24 * 60 * 60 * 1000,
  monthly: 15 * 31 * 24 * 60 * 60 * 1000,
  yearly: 400 * 24 * 60 * 60 * 1000
};
const RANGES = new Set(["hourly", "daily", "weekly", "monthly", "yearly"]);
const EVENT_TYPES = new Set(["page_view", "activity"]);
const ACTIVITY_SOURCES = new Set(["click", "keydown", "touchstart", "visibilitychange"]);
const PAGE_CATEGORIES = new Set(["home", "booking", "passenger", "ticket_check", "cancellation", "help_info"]);
const PAYLOAD_FIELDS = new Set(["contractVersion", "eventType", "deviceId", "pageCategory", "activitySource"]);

function pad2(value) {
  return String(value).padStart(2, "0");
}

function bangkokParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((acc, item) => {
    acc[item.type] = item.value;
    return acc;
  }, {});
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === "24" ? "00" : parts.hour,
    minute: parts.minute
  };
}

function dateFromYmd(ymd) {
  const [year, month, day] = String(ymd || "").split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatYmd(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function addDays(ymd, amount) {
  const date = dateFromYmd(ymd);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatYmd(date);
}

function addMonths(ym, amount) {
  const [year, month] = String(ym || "").split("-").map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

function isoWeekKey(ymd) {
  const date = dateFromYmd(ymd);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad2(week)}`;
}

function currentBangkokYmd(now) {
  const parts = bangkokParts(now || new Date());
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function bucketKeys(now) {
  const parts = bangkokParts(now);
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    hourly: `${day}T${parts.hour}`,
    daily: day,
    weekly: isoWeekKey(day),
    monthly: `${parts.year}-${parts.month}`,
    yearly: parts.year
  };
}

function readPlan(range, anchor, now) {
  const selectedRange = RANGES.has(range) ? range : "daily";
  const day = anchor || currentBangkokYmd(now);
  const month = day.slice(0, 7);
  if (selectedRange === "hourly") {
    return { granularity: "hourly", points: Array.from({ length: 24 }, (_, hour) => ({ key: `${day}T${pad2(hour)}`, label: `${pad2(hour)}:00` })) };
  }
  if (selectedRange === "weekly") {
    return { granularity: "weekly", points: Array.from({ length: 12 }, (_, index) => {
      const key = isoWeekKey(addDays(day, (index - 11) * 7));
      return { key, label: key.replace("-", " ") };
    }) };
  }
  if (selectedRange === "monthly") {
    return { granularity: "monthly", points: Array.from({ length: 12 }, (_, index) => {
      const key = addMonths(month, index - 11);
      return { key, label: `${Number(key.slice(5, 7))}/${key.slice(2, 4)}` };
    }) };
  }
  if (selectedRange === "yearly") {
    const year = Number(day.slice(0, 4));
    return { granularity: "yearly", points: Array.from({ length: 5 }, (_, index) => {
      const key = String(year - 4 + index);
      return { key, label: key };
    }) };
  }
  return { granularity: "daily", points: Array.from({ length: 30 }, (_, index) => {
    const key = addDays(day, index - 29);
    return { key, label: `${Number(key.slice(8, 10))}/${Number(key.slice(5, 7))}` };
  }) };
}

function validateAnchor(anchor) {
  const value = String(anchor || "").trim();
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = dateFromYmd(value);
  return formatYmd(date) === value ? value : "";
}

function byteLength(value) {
  if (Buffer.isBuffer(value)) return value.length;
  if (typeof value === "string") return Buffer.byteLength(value, "utf8");
  return Buffer.byteLength(JSON.stringify(value || {}), "utf8");
}

function validatePayload(body, rawBodyLength) {
  if (rawBodyLength > MAX_BODY_BYTES) return { ok: false, error: "payload_too_large" };
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const fields = Object.keys(payload);
  if (fields.some((field) => !PAYLOAD_FIELDS.has(field))) return { ok: false, error: "unknown_field" };
  if (payload.contractVersion !== VERSION) return { ok: false, error: "invalid_contract" };
  if (!EVENT_TYPES.has(payload.eventType)) return { ok: false, error: "invalid_event_type" };
  const deviceId = String(payload.deviceId || "").trim();
  if (!deviceId || deviceId.length > 96 || !/^[a-z]_[a-zA-Z0-9_-]+$/.test(deviceId)) return { ok: false, error: "invalid_identity" };
  const pageCategory = String(payload.pageCategory || "").trim();
  if (!PAGE_CATEGORIES.has(pageCategory)) return { ok: false, error: "invalid_page_category" };
  const activitySource = String(payload.activitySource || "").trim();
  if (payload.eventType === "activity" && !ACTIVITY_SOURCES.has(activitySource)) return { ok: false, error: "invalid_activity_source" };
  if (payload.eventType === "page_view" && activitySource) return { ok: false, error: "invalid_activity_source" };
  return { ok: true, payload: { eventType: payload.eventType, deviceId, pageCategory, activitySource } };
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function inc(value, amount) {
  return Number(value || 0) + amount;
}

function applyVisitorState(currentValue, event) {
  const previousState = ensureObject(currentValue);
  const isSameVisitRetry = previousState.acceptedVisitId && previousState.acceptedVisitId === event.newVisitId;
  if (!isSameVisitRetry && previousState.lastEventAt && event.nowMs - Number(previousState.lastEventAt) < MIN_EVENT_INTERVAL_MS) {
    return { value: previousState, accepted: false, reason: "rate_limited" };
  }
  if (!isSameVisitRetry && event.eventType === "activity" && previousState.lastActivityPingAt && event.nowMs - Number(previousState.lastActivityPingAt) < ACTIVITY_THROTTLE_MS) {
    return { value: previousState, accepted: false, reason: "activity_throttled" };
  }
  const lastActivityAt = Number(previousState.lastActivityAt || 0);
  const isNewVisit = !lastActivityAt || event.nowMs - lastActivityAt >= SESSION_TIMEOUT_MS;
  const acceptedVisitId = isNewVisit ? event.newVisitId : String(previousState.currentSessionHash || event.newVisitId);
  const value = {
    currentSessionHash: acceptedVisitId,
    acceptedVisitId,
    visitStartedAt: isNewVisit ? event.nowMs : Number(previousState.visitStartedAt || event.nowMs),
    lastActivityAt: event.nowMs,
    lastAcceptedVisitAt: isNewVisit ? event.nowMs : Number(previousState.lastAcceptedVisitAt || 0),
    lastEventAt: event.nowMs,
    lastActivityPingAt: event.eventType === "activity" ? event.nowMs : Number(previousState.lastActivityPingAt || 0)
  };
  return { value, accepted: true, isNewVisit, acceptedVisitId, visitStartedAt: value.visitStartedAt };
}

function applyBucketState(currentValue, event, granularity, bucketKey) {
  const bucket = ensureObject(currentValue);
  bucket.contractVersion = VERSION;
  bucket.granularity = granularity;
  bucket.key = bucketKey;
  bucket.updatedAt = event.nowMs;
  bucket.visitCommitted = ensureObject(bucket.visitCommitted);
  bucket.visitorSeen = ensureObject(bucket.visitorSeen);
  bucket.pages = ensureObject(bucket.pages);
  if (event.countPageView === true && event.eventType === "page_view") {
    bucket.pageViews = inc(bucket.pageViews, 1);
    bucket.pages[event.pageCategory] = ensureObject(bucket.pages[event.pageCategory]);
    bucket.pages[event.pageCategory].pageViews = inc(bucket.pages[event.pageCategory].pageViews, 1);
  }
  if (event.countVisit === true && !bucket.visitCommitted[event.acceptedVisitId]) {
    bucket.visits = inc(bucket.visits, 1);
    bucket.visitCommitted[event.acceptedVisitId] = { committedAt: event.nowMs, visitStartedAt: event.visitStartedAt };
  }
  if (event.countVisitor === true && !bucket.visitorSeen[event.visitorHash]) {
    bucket.visitorsApprox = inc(bucket.visitorsApprox, 1);
    bucket.visitorSeen[event.visitorHash] = { firstSeenAt: event.nowMs };
  }
  return bucket;
}

async function commitEvent(adapter, event) {
  let visitorResult;
  await adapter.transaction(`analytics/webV1/private/visitorState/${event.visitorHash}`, (current) => {
    visitorResult = applyVisitorState(current, event);
    return visitorResult.value;
  });
  if (!visitorResult.accepted) return visitorResult;
  const visitBuckets = bucketKeys(new Date(visitorResult.visitStartedAt));
  const eventBuckets = bucketKeys(new Date(event.nowMs));
  const bucketResults = {};
  const jobs = {};
  Object.keys(visitBuckets).forEach((granularity) => {
    const key = visitBuckets[granularity];
    jobs[`${granularity}/${key}`] = { granularity, key, countVisit: true, countVisitor: true, countPageView: false };
  });
  Object.keys(eventBuckets).forEach((granularity) => {
    const key = eventBuckets[granularity];
    const id = `${granularity}/${key}`;
    jobs[id] = Object.assign(jobs[id] || { granularity, key, countVisit: false, countVisitor: false, countPageView: false }, {
      countVisitor: true,
      countPageView: event.eventType === "page_view"
    });
  });
  await Promise.all(Object.keys(jobs).map((id) => {
    const job = jobs[id];
    const bucketEvent = Object.assign({}, event, {
      acceptedVisitId: visitorResult.acceptedVisitId,
      visitStartedAt: visitorResult.visitStartedAt,
      isNewVisit: visitorResult.isNewVisit,
      countVisit: job.countVisit,
      countVisitor: job.countVisitor,
      countPageView: job.countPageView
    });
    return adapter.transaction(`analytics/webV1/bucketState/${job.granularity}/${job.key}`, (current) => {
      const next = applyBucketState(current, bucketEvent, job.granularity, job.key);
      bucketResults[id] = { key: job.key, visits: Number(next.visits || 0), visitorsApprox: Number(next.visitorsApprox || 0), pageViews: Number(next.pageViews || 0) };
      return next;
    });
  }));
  return Object.assign({}, visitorResult, { bucketResults });
}

function cleanupBucketState(currentValue, granularity, nowMs) {
  const bucket = ensureObject(currentValue);
  const ttl = RETENTION_MS[granularity];
  if (!ttl) return bucket;
  const cutoff = nowMs - ttl;
  bucket.visitCommitted = ensureObject(bucket.visitCommitted);
  bucket.visitorSeen = ensureObject(bucket.visitorSeen);
  Object.keys(bucket.visitCommitted).forEach((key) => {
    if (Number(bucket.visitCommitted[key].committedAt || 0) < cutoff) delete bucket.visitCommitted[key];
  });
  Object.keys(bucket.visitorSeen).forEach((key) => {
    if (Number(bucket.visitorSeen[key].firstSeenAt || 0) < cutoff) delete bucket.visitorSeen[key];
  });
  bucket.cleanupAt = nowMs;
  return bucket;
}

function shouldRemoveVisitorState(state, nowMs) {
  return Number(ensureObject(state).lastActivityAt || 0) < nowMs - RETENTION_MS.visitorState;
}

module.exports = {
  VERSION,
  TIMEZONE,
  SESSION_TIMEOUT_MS,
  ACTIVITY_THROTTLE_MS,
  MAX_BODY_BYTES,
  RANGES,
  EVENT_TYPES,
  ACTIVITY_SOURCES,
  PAGE_CATEGORIES,
  bangkokParts,
  dateFromYmd,
  formatYmd,
  addDays,
  addMonths,
  isoWeekKey,
  currentBangkokYmd,
  bucketKeys,
  readPlan,
  validateAnchor,
  byteLength,
  validatePayload,
  applyVisitorState,
  applyBucketState,
  commitEvent,
  cleanupBucketState,
  shouldRemoveVisitorState,
  RETENTION_MS
};
