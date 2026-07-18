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

function staffLineTo(target) {
  target = target || {};
  return clean(target.lineUserId || target.lineGroupId || target.lineRoomId || target.lineTo);
}

function isActiveTarget(target) {
  return target && target.active !== false && staffLineTo(target);
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
    onceKey
  });
}

function bookingCreatedStaffAlerts(input) {
  input = input || {};
  const booking = input.booking || {};
  const config = input.staffConfig || {};
  const alerts = [];
  const seen = {};
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
  const lines = [
    "SL Transit Staff",
    `Event: booking_created`,
    `Role: ${alert.recipientRole || "-"}`,
    `Booking: ${bookingCode(booking) || "-"}`,
    `Route: ${routeText(booking)}`,
    `Date/Time: ${clean(booking.date) || "-"} ${clean(booking.time) || "-"} น.`,
    `Seats: ${booking.seats || 1}`,
    `Fare: ${money(booking.price)} บาท`
  ];

  if (alert.recipientRole === "admin") {
    lines.push(`Passenger: ${clean(booking.name) || "-"}`);
    lines.push(`Phone: ${clean(booking.phone) || "-"}`);
  } else {
    lines.push(`Passenger: ${clean(booking.name) || "-"}`);
  }

  if (alert.recipientRole === "driver" && bookingVehicleId(booking)) {
    lines.push(`Vehicle: ${bookingVehicleId(booking)}`);
  }
  if (alert.recipientRole === "queue" && bookingQueueId(booking)) {
    lines.push(`Queue: ${bookingQueueId(booking)}`);
  }
  if (alert.recipientRole === "transfer_terminal" && bookingTransferStopKey(booking)) {
    lines.push(`Transfer stop: ${bookingTransferStopKey(booking)}`);
  }

  return lines.join("\n");
}

module.exports = {
  bookingCreatedStaffAlerts,
  staffBookingMessage,
  bookingVehicleId,
  bookingQueueId,
  bookingTransferStopKey
};
