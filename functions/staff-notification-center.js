const STAFF_LINE_TARGETS_PATH = "data/notificationCenter/staffLineTargets";
const STAFF_LINE_TARGETS_SCHEMA_VERSION = "staff_line_targets_v1";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function list(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [];
}

function money(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function bookingCode(booking) {
  return clean(booking && booking.code);
}

function bookingVehicleId(booking) {
  booking = booking || {};
  const assignment = booking.resolvedAssignment || booking.assignment || {};
  return clean(
    assignment.runtimeVehicleId ||
    assignment.plannedVehicleId ||
    booking.runtimeVehicleId ||
    booking.plannedVehicleId ||
    booking.vehicleId
  );
}

function bookingQueueId(booking) {
  booking = booking || {};
  const assignment = booking.resolvedAssignment || booking.assignment || {};
  return clean(assignment.queueId || booking.queueId);
}

function bookingTransferStopKey(booking) {
  booking = booking || {};
  const transfer = booking.transfer || booking.transferPlan || {};
  return clean(
    transfer.viaStopKey ||
    transfer.transferStopKey ||
    booking.transferStopKey ||
    booking.viaStopKey
  );
}

function routeText(booking) {
  booking = booking || {};
  if (clean(booking.route)) return clean(booking.route);
  const origin = clean(booking.origin || booking.from) || "-";
  const destination = clean(booking.destination || booking.to) || "-";
  return `${origin} -> ${destination}`;
}

function legSchedule(booking) {
  booking = booking || {};
  const schedule = booking.legSchedule || {};
  return {
    leg1: clean(schedule.leg1 || booking.leg1Route),
    leg1Time: clean(schedule.leg1Time || booking.leg1Time || booking.time || booking.pickupTime || booking.departTime),
    leg2: clean(schedule.leg2 || booking.leg2Route),
    leg2Time: clean(schedule.leg2Time || booking.leg2Time)
  };
}

function routeTextForRole(role, booking) {
  const legs = legSchedule(booking);
  if ((role === "driver" || role === "queue") && legs.leg1) return legs.leg1;
  if (role === "transfer_terminal" && legs.leg2) return legs.leg2;
  return routeText(booking);
}

function timeTextForRole(role, booking) {
  const legs = legSchedule(booking);
  if ((role === "driver" || role === "queue") && legs.leg1Time) return legs.leg1Time;
  if (role === "transfer_terminal" && legs.leg2Time) return legs.leg2Time;
  return clean(booking && (booking.time || booking.pickupTime || booking.departTime));
}

function slipText(booking) {
  booking = booking || {};
  return clean(
    booking.slip ||
    booking.slipUrl ||
    booking.slipImageUrl ||
    booking.paymentSlipUrl ||
    booking.cloudinarySlipUrl
  ) || "-";
}

function staffLineTo(target) {
  target = target || {};
  return clean(target.lineUserId || target.lineGroupId || target.lineRoomId || target.lineTo);
}

function isActiveTarget(target) {
  return target && target.active !== false && staffLineTo(target);
}

function normalizeTarget(target, fallbackId) {
  target = target || {};
  return {
    staffId: clean(target.staffId || target.id || fallbackId),
    displayName: clean(target.displayName || target.name),
    lineUserId: clean(target.lineUserId),
    lineGroupId: clean(target.lineGroupId),
    lineRoomId: clean(target.lineRoomId),
    active: target.active !== false
  };
}

function normalizeTargetMap(value) {
  const result = {};
  if (!value || typeof value !== "object") return result;
  Object.keys(value).forEach((key) => {
    const normalizedKey = clean(key);
    const targets = list(value[key])
      .map((target, index) => normalizeTarget(target, `${normalizedKey}_${index + 1}`))
      .filter((target) => staffLineTo(target));
    if (normalizedKey && targets.length) result[normalizedKey] = targets;
  });
  return result;
}

function normalizeStaffLineTargetsConfig(raw) {
  raw = raw || {};
  const admins = {};
  if (raw.admins && typeof raw.admins === "object") {
    Object.keys(raw.admins).forEach((key) => {
      const normalizedKey = clean(key);
      const target = normalizeTarget(raw.admins[key], normalizedKey);
      if (normalizedKey && staffLineTo(target)) admins[normalizedKey] = target;
    });
  }

  return {
    schemaVersion: clean(raw.schemaVersion) || STAFF_LINE_TARGETS_SCHEMA_VERSION,
    active: raw.active !== false,
    admins,
    driversByVehicleId: normalizeTargetMap(raw.driversByVehicleId),
    queuesByQueueId: normalizeTargetMap(raw.queuesByQueueId),
    terminalsByStopKey: normalizeTargetMap(raw.terminalsByStopKey)
  };
}

async function readStaffLineTargetsConfig(database) {
  if (!database || typeof database.ref !== "function") {
    throw new Error("staff_line_targets_database_required");
  }
  const snapshot = await database.ref(STAFF_LINE_TARGETS_PATH).get();
  const raw = snapshot && typeof snapshot.val === "function" ? snapshot.val() : null;
  return normalizeStaffLineTargetsConfig(raw || {});
}

function addTarget(alerts, seen, role, target, booking, reason) {
  if (!isActiveTarget(target)) return;
  const lineTo = staffLineTo(target);
  const code = bookingCode(booking);
  const onceKey = ["staff_booking_created", code, role, lineTo].join(":");
  if (seen[onceKey]) return;
  seen[onceKey] = true;
  alerts.push({
    event: "booking_created",
    channel: "staff_line",
    recipientRole: role,
    lineTo,
    staffId: clean(target.staffId || target.id),
    scopeId: clean(reason),
    bookingCode: code,
    routeText: routeTextForRole(role, booking),
    tripTime: timeTextForRole(role, booking),
    onceKey
  });
}

function bookingCreatedStaffAlerts(input) {
  input = input || {};
  const booking = input.booking || {};
  const config = normalizeStaffLineTargetsConfig(input.staffConfig || {});
  const alerts = [];
  const seen = {};
  if (config.active === false) return alerts;

  const vehicleId = bookingVehicleId(booking);
  const queueId = bookingQueueId(booking);
  const transferStopKey = bookingTransferStopKey(booking);

  list(config.admins).forEach((target) => {
    addTarget(alerts, seen, "admin", target, booking, "global");
  });

  if (vehicleId && config.driversByVehicleId) {
    list(config.driversByVehicleId[vehicleId]).forEach((target) => {
      addTarget(alerts, seen, "driver", target, booking, vehicleId);
    });
  }

  if (queueId && config.queuesByQueueId) {
    list(config.queuesByQueueId[queueId]).forEach((target) => {
      addTarget(alerts, seen, "queue", target, booking, queueId);
    });
  }

  if (transferStopKey && config.terminalsByStopKey) {
    list(config.terminalsByStopKey[transferStopKey]).forEach((target) => {
      addTarget(alerts, seen, "transfer_terminal", target, booking, transferStopKey);
    });
  }

  return alerts;
}

function staffBookingMessage(alert, booking) {
  alert = alert || {};
  booking = booking || {};
  const roleRoute = clean(alert.routeText) || routeTextForRole(alert.recipientRole, booking);
  const roleTime = clean(alert.tripTime) || timeTextForRole(alert.recipientRole, booking) || "-";
  const lines = [
    `รหัส: ${bookingCode(booking) || "-"}`,
    `👤 ชื่อ: ${clean(booking.name) || "-"}   โทร: ${clean(booking.phone) || "-"}`,
    `🛣️ เส้นทาง: ${roleRoute || "-"}`,
    `🗓 วันที่: ${clean(booking.date) || "-"} เวลา ${roleTime} น.`,
    `🚌 จำนวน: ${booking.seats || booking.pax || 1} คน  ราคา: ${money(booking.price || booking.fareAmount || booking.fare)} บาท`,
    `🖼 สลิป: ${slipText(booking)}`
  ];

  if (alert.recipientRole === "driver" && bookingVehicleId(booking)) {
    lines.push(`รถ: ${bookingVehicleId(booking)}`);
  }
  if (alert.recipientRole === "queue" && bookingQueueId(booking)) {
    lines.push(`คิว: ${bookingQueueId(booking)}`);
  }
  if (alert.recipientRole === "transfer_terminal" && bookingTransferStopKey(booking)) {
    lines.push(`จุดต่อรถ: ${bookingTransferStopKey(booking)}`);
  }

  return lines.join("\n");
}

module.exports = {
  STAFF_LINE_TARGETS_PATH,
  STAFF_LINE_TARGETS_SCHEMA_VERSION,
  normalizeStaffLineTargetsConfig,
  readStaffLineTargetsConfig,
  bookingCreatedStaffAlerts,
  staffBookingMessage,
  bookingVehicleId,
  bookingQueueId,
  bookingTransferStopKey,
  routeTextForRole,
  timeTextForRole
};
