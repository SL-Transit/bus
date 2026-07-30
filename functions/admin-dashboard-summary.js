"use strict";

const TIMEZONE = "Asia/Bangkok";
const RANGE_SIZES = { hourly: 24, daily: 7, weekly: 4, monthly: 6, yearly: 5 };
const ALLOWED_RANGES = new Set(Object.keys(RANGE_SIZES));
const ALLOWED_ORIGINS = new Set(["https://sl-transit.com", "https://www.sl-transit.com"]);
const ALLOWED_BOOKING_SOURCES = new Set(["booking1.html"]);
const ALLOWED_SOURCE_MODES = new Set(["erp_data_center"]);
const EXCLUDED_STATUSES = new Set(["draft", "failed", "invalid", "write_failed"]);
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
const PRIVATE_FIELD_NAMES = new Set([
  "name",
  "firstName",
  "lastName",
  "surname",
  "phone",
  "lineUserId",
  "bookingCode",
  "ticketCode",
  "slip",
  "paymentEvidence",
  "passengerIdentity",
  "rawBooking",
  "bankAccount",
  "password"
]);

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
  const d = new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));
  return ymdFromMs(d.getTime()) === value ? d : null;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
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

function addMonths(date, months) {
  const p = bangkokParts(date.getTime());
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1 + months, 1, -7, 0, 0, 0));
}

function addYears(date, years) {
  const p = bangkokParts(date.getTime());
  return new Date(Date.UTC(Number(p.year) + years, 0, 1, -7, 0, 0, 0));
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
  if (!ALLOWED_RANGES.has(range)) return null;
  const anchorDate = parseAnchor(anchor, nowMs);
  if (!anchorDate) return null;
  const points = [];
  const count = RANGE_SIZES[range];
  const monthAnchor = startOfBangkokMonth(anchorDate);
  const yearAnchor = startOfBangkokYear(anchorDate);
  for (let i = count - 1; i >= 0; i -= 1) {
    let key;
    if (range === "hourly") {
      const p = bangkokParts(anchorDate.getTime());
      key = `${p.year}-${p.month}-${p.day}T${pad(count - 1 - i)}`;
    } else if (range === "daily") key = bucketForMs(range, addDays(anchorDate, -i).getTime());
    else if (range === "weekly") key = bucketForMs(range, addDays(anchorDate, -i * 7).getTime());
    else if (range === "monthly") key = bucketForMs(range, addMonths(monthAnchor, -i).getTime());
    else key = bucketForMs(range, addYears(yearAnchor, -i).getTime());
    points.push({ key, label: labelFor(range, key) });
  }
  return points;
}

function queryWindow(range, anchor, nowMs) {
  const anchorDate = parseAnchor(anchor, nowMs);
  if (!anchorDate || !ALLOWED_RANGES.has(range)) return null;
  let start = anchorDate;
  let end = addDays(anchorDate, 1).getTime() - 1;
  if (range === "daily") start = addDays(anchorDate, -6);
  else if (range === "weekly") start = addDays(anchorDate, -27);
  else if (range === "monthly") {
    start = addMonths(startOfBangkokMonth(anchorDate), -5);
    end = addMonths(startOfBangkokMonth(anchorDate), 1).getTime() - 1;
  } else if (range === "yearly") {
    start = addYears(startOfBangkokYear(anchorDate), -4);
    end = addYears(startOfBangkokYear(anchorDate), 1).getTime() - 1;
  }
  return { startMs: start.getTime(), endMs: end };
}

function queryDateWindow(range, anchor, nowMs) {
  const window = queryWindow(range, anchor, nowMs);
  if (!window) return null;
  return { startDate: ymdFromMs(window.startMs), endDate: ymdFromMs(window.endMs) };
}

function numericTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function createdTimestamp(record) {
  const ts = numericTimestamp(record && record.ts);
  return ts ? { ms: ts, field: "ts", serverVerified: true } : null;
}

function eventTimestamp(record, fields) {
  for (const field of fields) {
    const ms = numericTimestamp(record && record[field]);
    if (ms) return { ms, field };
  }
  return null;
}

function validBookingId(id, record) {
  const value = String((record && (record.code || record.bookingId || record.id)) || id || "").trim();
  return /^[A-Z0-9][A-Z0-9_-]{5,}$/i.test(value);
}

function validYmd(value) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));
  return ymdFromMs(d.getTime()) === text;
}

function normalizedStatus(record) {
  return String((record && (record.status || record.bookingStatus || record.paymentStatus)) || "").toLowerCase();
}

function isCancelled(record) {
  const status = String((record && (record.status || record.bookingStatus)) || "").toLowerCase();
  return status === "cancelled" || status === "canceled";
}

function isRefunded(record) {
  const payment = String((record && record.paymentStatus) || "").toLowerCase();
  const refund = String((record && record.refundStatus) || "").toLowerCase();
  return payment === "refunded" || refund === "refunded" || refund === "approved" || refund === "completed";
}

function shapeOfLatestRecord(id, record) {
  const value = record && typeof record === "object" ? record : {};
  const serviceDate = value.date != null ? value.date : value.serviceDate;
  return {
    hasBookingId: validBookingId(id, value),
    hasTs: value.ts != null,
    tsType: value.ts == null ? "missing" : typeof value.ts,
    hasSource: value.source != null,
    sourceType: value.source == null ? "missing" : typeof value.source,
    hasSourceMode: value.sourceMode != null,
    sourceModeType: value.sourceMode == null ? "missing" : typeof value.sourceMode,
    hasServiceDate: serviceDate != null,
    serviceDateType: serviceDate == null ? "missing" : typeof serviceDate,
    hasPax: value.pax != null || value.seats != null,
    paxType: value.pax != null ? typeof value.pax : (value.seats != null ? typeof value.seats : "missing"),
    hasStatus: normalizedStatus(value) !== "",
    statusType: (value.status || value.bookingStatus || value.paymentStatus) == null ? "missing" : typeof (value.status || value.bookingStatus || value.paymentStatus)
  };
}

function isRealBooking(id, record) {
  if (!record || typeof record !== "object") return { ok: false, reason: "not_object" };
  if (record.testMode === true || record.mockPayment === true || record.mockOnly === true || record.automatedTest === true) return { ok: false, reason: "test_or_mock" };
  if (!validBookingId(id, record)) return { ok: false, reason: "invalid_booking_id" };
  if (!createdTimestamp(record)) return { ok: false, reason: "missing_ts" };
  if (!ALLOWED_BOOKING_SOURCES.has(String(record.source || ""))) return { ok: false, reason: "invalid_source" };
  if (!ALLOWED_SOURCE_MODES.has(String(record.sourceMode || ""))) return { ok: false, reason: "invalid_source_mode" };
  if (!validYmd(record.date || record.serviceDate)) return { ok: false, reason: "invalid_service_date" };
  if (!String(record.origin || "").trim() || !String(record.destination || "").trim()) return { ok: false, reason: "missing_route" };
  if (!(Number(record.pax || record.seats || 0) > 0)) return { ok: false, reason: "invalid_pax" };
  const status = normalizedStatus(record);
  if (EXCLUDED_STATUSES.has(status)) return { ok: false, reason: "excluded_status" };
  if (!COUNTED_STATUSES.has(status)) return { ok: false, reason: "unknown_status" };
  return { ok: true };
}

function moneyValue(record, fields) {
  for (const field of fields) {
    const value = Number(record && record[field]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function vehicleKey(record) {
  const a = record && record.assignment || {};
  return String(a.vehicleId || a.plannedVehicleId || record.plannedVehicleId || record.vehicleId || "ยังไม่ระบุรถ").trim();
}

function driverKey(record) {
  const a = record && record.assignment || {};
  return String(a.driverId || record.driverId || "—").trim();
}

function queueKey(record) {
  const a = record && record.assignment || {};
  return String(a.queueId || a.queueNo || record.queueId || record.queueNo || "ยังไม่ระบุ").trim();
}

function routeKey(record) {
  return String(record.routeId || record.catalogRouteId || `${record.origin || "ยังไม่ระบุ"}>${record.destination || "ยังไม่ระบุ"}>${record.tripId || record.pickupTime || "ยังไม่ระบุ"}`).trim();
}

function serviceGroupKey(record) {
  return String(record.serviceGroupId || record.routeGroupId || record.groupId || (record.route && record.route.serviceGroupId) || queueKey(record)).trim();
}

function publicText(value) {
  return String(value || "").trim().slice(0, 80);
}

function publicDriverDisplayName(driver) {
  const row = driver && typeof driver === "object" ? driver : {};
  if (row.dashboardDisplayAllowed === false || row.publicDisplayAllowed === false) return "";
  return publicText(row.driverDisplayName || row.displayName || row.displayNameTh || row.publicName || row.shortName);
}

function publicVehicleAlias(vehicle, fallback) {
  const row = vehicle && typeof vehicle === "object" ? vehicle : {};
  return publicText(row.vehicleAlias || row.carAlias || row.alias || row.runtimeVehicleId || (Array.isArray(row.legacyAliases) && row.legacyAliases[0]) || row.displayCode || row.publicCode || fallback);
}

function serviceDateOrdinal(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

function rotationQueueIdForVehicle(rule, vehicleId, anchorDayKey) {
  const vehicles = Array.isArray(rule && rule.vehicleIds) ? rule.vehicleIds : [];
  const queues = Array.isArray(rule && rule.queueIds) ? rule.queueIds : [];
  const vehicleIndex = vehicles.indexOf(vehicleId);
  if (vehicleIndex < 0 || !queues.length) return "";
  const base = serviceDateOrdinal("2026-07-16");
  const target = serviceDateOrdinal(anchorDayKey);
  const offset = base == null || target == null ? 0 : target - base;
  return queues[(((vehicleIndex + offset) % queues.length) + queues.length) % queues.length] || "";
}

function seedVehicleMasterRows(target, fleetMaster, anchorDayKey) {
  const master = fleetMaster && typeof fleetMaster === "object" ? fleetMaster : {};
  const vehicleDirectory = master.vehicles || {};
  const rotationRule = master.assignmentRules && master.assignmentRules.rotation_rule_v1;
  const vehicleIds = Array.isArray(rotationRule && rotationRule.vehicleIds) ? rotationRule.vehicleIds : [];
  vehicleIds.forEach((vehicleId) => {
    if (target[vehicleId]) return;
    const vehicleMaster = vehicleDirectory[vehicleId] || {};
    target[vehicleId] = emptyGroup(vehicleId, {
      vehicleId,
      vehicleAlias: publicVehicleAlias(vehicleMaster, vehicleId),
      driverId: "—",
      driverDisplayName: "",
      queueId: rotationQueueIdForVehicle(rotationRule, vehicleId, anchorDayKey) || "",
      driverMasterStatus: "missing",
      status: "ready"
    });
  });
}

function serviceGroupDisplay(group, fallback) {
  const row = group && typeof group === "object" ? group : {};
  return publicText(row.displayNameTh || row.nameTh || row.routeScopeTh || row.serviceGroupId || fallback);
}

function seedQueueGroupRows(target, fleetMaster) {
  const master = fleetMaster && typeof fleetMaster === "object" ? fleetMaster : {};
  const serviceGroups = master.serviceGroups || {};
  Object.keys(serviceGroups || {}).sort().forEach((groupId) => {
    const group = serviceGroups[groupId] || {};
    if (group.status && group.status !== "active") return;
    if (!groupId) return;
    const display = serviceGroupDisplay(group, groupId);
    target[groupId] = target[groupId] || emptyGroup(groupId, {
      queueId: groupId,
      serviceGroupId: groupId,
      status: "ready"
    });
    target[groupId].queueDisplayName = target[groupId].queueDisplayName || display;
    target[groupId].serviceGroupName = target[groupId].serviceGroupName || display;
    target[groupId].routeScopeTh = target[groupId].routeScopeTh || publicText(group.routeScopeTh || group.displayNameTh || group.nameTh || "");
    target[groupId].paymentMode = target[groupId].paymentMode || publicText(group.paymentMode || "");
  });
}

function addFinance(target, values) {
  target.grossAmount += values.grossAmount;
  target.fareAmount += values.fareAmount;
  target.serviceFeeAmount += values.serviceFeeAmount;
  target.refundAmount += values.refundAmount;
  target.netAmount += values.netAmount;
}

function bookingAmounts(record) {
  const gross = moneyValue(record, ["price", "total", "totalAmount"]);
  const fare = moneyValue(record, ["fare", "fareAmount"]);
  const serviceFee = moneyValue(record, ["serviceFee", "serviceFeeAmount", "svcFee"]);
  const refund = isRefunded(record) ? (moneyValue(record, ["refundAmount", "refundedAmount"]) || 0) : 0;
  const paid = String(record.paymentStatus || "").toLowerCase();
  const cancelledWithoutPayment = isCancelled(record) && paid !== "paid" && paid !== "refunded";
  const grossAmount = cancelledWithoutPayment ? 0 : (gross == null ? 0 : gross);
  return {
    grossAmount,
    fareAmount: fare == null ? 0 : fare,
    serviceFeeAmount: serviceFee == null ? 0 : serviceFee,
    refundAmount: refund,
    netAmount: Math.max(0, grossAmount - refund)
  };
}

function emptyGroup(id, extra) {
  return Object.assign({
    id,
    bookingCount: 0,
    passengerCount: 0,
    grossAmount: 0,
    fareAmount: 0,
    serviceFeeAmount: 0,
    refundAmount: 0,
    netAmount: 0,
    status: "ready"
  }, extra || {});
}

function sanitizeForPrivateFields(value) {
  const text = JSON.stringify(value || {});
  for (const field of PRIVATE_FIELD_NAMES) {
    if (text.includes(`"${field}"`)) throw new Error(`private_field_exposed:${field}`);
  }
  return value;
}

function countInvalid(invalidRecords, reason) {
  invalidRecords[reason] = (invalidRecords[reason] || 0) + 1;
}

function isInRange(range, anchor, nowMs, ms) {
  const window = queryWindow(range, anchor, nowMs);
  return !!window && ms >= window.startMs && ms <= window.endMs;
}

function aggregateDashboard(records, options) {
  const opts = options || {};
  const range = opts.range || "daily";
  const pointsBase = bucketPlan(range, opts.anchor, opts.nowMs);
  if (!pointsBase) throw new Error("invalid_range_or_anchor");
  const bookingPoints = pointsBase.map((point) => Object.assign({}, point, { bookings: 0, cancellations: 0, refunds: 0 }));
  const hasWebsiteRollups = opts.websiteRollups && typeof opts.websiteRollups === "object";
  const websitePoints = pointsBase.map((point) => Object.assign({}, point, {
    visitors: hasWebsiteRollups ? 0 : null,
    actualUsers: hasWebsiteRollups ? 0 : null
  }));
  const byKey = {};
  bookingPoints.forEach((point, index) => { byKey[point.key] = { booking: point, website: websitePoints[index] }; });
  const anchorDate = parseAnchor(opts.anchor, opts.nowMs);
  const anchorDayKey = bucketForMs("daily", (anchorDate || parseAnchor(null, opts.nowMs)).getTime());

  const totals = {
    createdCount: 0,
    travelPassengerCount: 0,
    cancelledCount: 0,
    refundedCount: 0
  };
  const finance = { grossAmount: 0, fareAmount: 0, serviceFeeAmount: 0, refundAmount: 0, netAmount: 0 };
  const vehicles = {};
  const queues = {};
  const routes = {};
  const fleetMaster = opts.fleetMaster && typeof opts.fleetMaster === "object" ? opts.fleetMaster : {};
  const vehicleDirectory = fleetMaster.vehicles || opts.vehicleDirectory || {};
  const driverDirectory = fleetMaster.drivers || opts.driverDirectory || {};
  const invalidRecords = {};
  const diagnostic = {
    tsQueryCount: Object.keys(records || {}).length,
    acceptedCount: 0,
    rejectedCount: 0,
    invalidRecordSummary: invalidRecords,
    latestBookingShape: null
  };

  let latestTs = -1;
  Object.keys(records || {}).forEach((id) => {
    const record = records[id] || {};
    const ts = createdTimestamp(record);
    if (ts && ts.ms > latestTs) {
      latestTs = ts.ms;
      diagnostic.latestBookingShape = shapeOfLatestRecord(id, record);
    }
  });

  Object.keys(records || {}).forEach((id) => {
    const record = records[id] || {};
    const valid = isRealBooking(id, record);
    if (!valid.ok) {
      countInvalid(invalidRecords, valid.reason);
      diagnostic.rejectedCount += 1;
      return;
    }
    diagnostic.acceptedCount += 1;
    const created = createdTimestamp(record);
    const key = bucketForMs(range, created.ms);
    const bucket = byKey[key];
    if (!bucket) return;
    const pax = Number(record.pax || record.seats || 0) || 0;
    const amounts = bookingAmounts(record);
    const createdOnAnchorDay = bucketForMs("daily", created.ms) === anchorDayKey;
    if (createdOnAnchorDay) {
      totals.createdCount += 1;
      addFinance(finance, amounts);
    }
    bucket.booking.bookings += 1;
    if (!createdOnAnchorDay) return;

    const vKey = vehicleKey(record);
    const dKey = driverKey(record);
    const vehicleMaster = vehicleDirectory[vKey] || {};
    const driverMaster = driverDirectory[dKey] || {};
    vehicles[vKey] = vehicles[vKey] || emptyGroup(vKey, {
      vehicleId: vKey,
      vehicleAlias: publicVehicleAlias(vehicleMaster, vKey),
      driverId: dKey,
      driverDisplayName: publicDriverDisplayName(driverMaster),
      queueId: queueKey(record),
      driverMasterStatus: driverDirectory[dKey] ? "ready" : "missing"
    });
    vehicles[vKey].bookingCount += 1;
    vehicles[vKey].passengerCount += pax;
    if (vehicles[vKey].driverId === "—" && dKey !== "—") vehicles[vKey].driverId = dKey;
    addFinance(vehicles[vKey], amounts);

    const qKey = serviceGroupKey(record);
    queues[qKey] = queues[qKey] || emptyGroup(qKey, { queueId: qKey, serviceGroupId: qKey });
    queues[qKey].bookingCount += 1;
    queues[qKey].passengerCount += pax;
    addFinance(queues[qKey], amounts);

    const rKey = routeKey(record);
    routes[rKey] = routes[rKey] || emptyGroup(rKey, {
      routeId: record.routeId || record.catalogRouteId || "ยังไม่ระบุ",
      origin: record.origin || "ยังไม่ระบุ",
      destination: record.destination || "ยังไม่ระบุ",
      tripId: record.tripId || record.catalogTripId || "ยังไม่ระบุ",
      pickupTime: record.pickupTime || record.time || "—"
    });
    routes[rKey].bookingCount += 1;
    routes[rKey].passengerCount += pax;
    addFinance(routes[rKey], amounts);
  });

  const travelSeen = {};
  Object.keys(opts.travelRecords || {}).forEach((id) => {
    const record = opts.travelRecords[id] || {};
    if (travelSeen[id]) return;
    travelSeen[id] = true;
    const valid = isRealBooking(id, record);
    if (!valid.ok) return;
    if (isCancelled(record) || isRefunded(record)) return;
    const serviceDate = String(record.date || record.serviceDate || "").slice(0, 10);
    if (serviceDate === anchorDayKey) totals.travelPassengerCount += Number(record.pax || record.seats || 0) || 0;
  });

  let cancellationTimestampSupported = false;
  Object.keys(opts.cancelledRecords || {}).forEach((id) => {
    const record = opts.cancelledRecords[id] || {};
    const valid = isRealBooking(id, record);
    const cancelled = eventTimestamp(record, ["cancelledAt"]);
    if (!valid.ok || !cancelled || !isCancelled(record) || !isInRange(range, opts.anchor, opts.nowMs, cancelled.ms)) return;
    cancellationTimestampSupported = true;
    const key = bucketForMs(range, cancelled.ms);
    if (byKey[key]) {
      if (bucketForMs("daily", cancelled.ms) === anchorDayKey) totals.cancelledCount += 1;
      byKey[key].booking.cancellations += 1;
    }
  });

  let refundTimestampSupported = false;
  Object.keys(opts.refundedRecords || {}).forEach((id) => {
    const record = opts.refundedRecords[id] || {};
    const valid = isRealBooking(id, record);
    const refunded = eventTimestamp(record, ["refundedAt", "refundApprovedAt"]);
    if (!valid.ok || !refunded || !isRefunded(record) || !isInRange(range, opts.anchor, opts.nowMs, refunded.ms)) return;
    refundTimestampSupported = true;
    const key = bucketForMs(range, refunded.ms);
    if (byKey[key]) {
      if (bucketForMs("daily", refunded.ms) === anchorDayKey) totals.refundedCount += 1;
      byKey[key].booking.refunds += 1;
    }
  });

  seedVehicleMasterRows(vehicles, fleetMaster, anchorDayKey);
  seedQueueGroupRows(queues, fleetMaster);

  const websiteRollups = hasWebsiteRollups ? opts.websiteRollups : {};
  Object.keys(websiteRollups).forEach((key) => {
    if (!byKey[key]) return;
    const rollup = websiteRollups[key] || {};
    byKey[key].website.visitors += Number(rollup.visitors || 0);
    byKey[key].website.actualUsers += Number(rollup.actualUsers || 0);
  });

  const websiteStatus = hasWebsiteRollups
    ? (websitePoints.some((p) => p.visitors || p.actualUsers) ? "ready" : "empty")
    : "unavailable";
  const status = totals.createdCount || totals.travelPassengerCount || finance.grossAmount || bookingPoints.some((p) => p.bookings || p.cancellations || p.refunds) || websiteStatus === "ready" ? "ready" : "empty";
  return sanitizeForPrivateFields({
    status,
    timezone: TIMEZONE,
    range,
    anchor: opts.anchor || ymdFromMs(opts.nowMs || Date.now()),
    website: {
      status: websiteStatus,
      visitors: hasWebsiteRollups ? websitePoints.reduce((sum, p) => sum + Number(p.visitors || 0), 0) : null,
      actualUsers: hasWebsiteRollups ? websitePoints.reduce((sum, p) => sum + Number(p.actualUsers || 0), 0) : null,
      points: websitePoints
    },
    bookings: Object.assign({}, totals, {
      points: bookingPoints,
      createdDateSource: "ts",
      travelDateSource: "date/serviceDate",
      cancellationDateSource: cancellationTimestampSupported ? "cancelledAt" : null,
      refundDateSource: refundTimestampSupported ? "refundedAt/refundApprovedAt" : null,
      cancellationContractStatus: cancellationTimestampSupported ? "ready" : "unsupported_missing_cancelledAt",
      refundContractStatus: refundTimestampSupported ? "ready" : "unsupported_missing_refund_timestamp"
    }),
    finance,
    vehicles: Object.keys(vehicles).sort().map((key) => vehicles[key]),
    queues: Object.keys(queues).sort().map((key) => queues[key]),
    routes: Object.keys(routes).sort().map((key) => routes[key]),
    diagnostic,
    generatedAt: opts.generatedAt || Date.now()
  });
}

function originAllowed(origin, emulator) {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (emulator && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(origin || ""))) return true;
  return false;
}

module.exports = {
  TIMEZONE,
  RANGE_SIZES,
  aggregateDashboard,
  bucketPlan,
  queryWindow,
  queryDateWindow,
  bucketForMs,
  createdTimestamp,
  isRealBooking,
  originAllowed,
  PRIVATE_FIELD_NAMES
};
