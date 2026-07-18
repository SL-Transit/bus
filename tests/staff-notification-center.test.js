const assert = require("assert");
const staff = require("../functions/staff-notification-center.js");

const booking = {
  code: "BK123456",
  name: "Somchai",
  phone: "0812345678",
  origin: "Kilo 1",
  destination: "Wang Nam Yen",
  date: "2026-07-18",
  time: "09:00",
  seats: 2,
  price: 240,
  resolvedAssignment: {
    runtimeVehicleId: "car1",
    queueId: "queue_001"
  },
  transfer: {
    viaStopKey: "wangnamyen_terminal"
  },
  driverLineId: "U-forged-driver",
  transferTerminalLineId: "G-forged-terminal"
};

const alerts = staff.bookingCreatedStaffAlerts({
  booking,
  staffConfig: {
    admins: {
      main: { staffId: "admin_1", lineUserId: "U-admin", active: true }
    },
    driversByVehicleId: {
      car1: [
        { staffId: "driver_1", lineUserId: "U-driver", active: true },
        { staffId: "driver_off", lineUserId: "U-driver-off", active: false }
      ]
    },
    queuesByQueueId: {
      queue_001: [{ staffId: "queue_1", lineGroupId: "G-queue", active: true }]
    },
    terminalsByStopKey: {
      wangnamyen_terminal: [{ staffId: "terminal_1", lineGroupId: "G-terminal", active: true }]
    }
  }
});

assert.deepStrictEqual(alerts.map((item) => item.recipientRole), [
  "admin",
  "driver",
  "queue",
  "transfer_terminal"
]);
assert(alerts.every((item) => item.channel === "staff_line"));
assert(alerts.every((item) => item.onceKey.includes("BK123456")));
assert(!alerts.some((item) => item.lineTo === "U-forged-driver"));
assert(!alerts.some((item) => item.lineTo === "G-forged-terminal"));
assert(!alerts.some((item) => item.lineTo === "U-driver-off"));

const driverAlert = alerts.find((item) => item.recipientRole === "driver");
const driverMessage = staff.staffBookingMessage(driverAlert, booking);
assert(driverMessage.includes("Role: driver"));
assert(driverMessage.includes("Vehicle: car1"));
assert(!driverMessage.includes("0812345678"), "Driver messages must not expose passenger phone by default");

const adminAlert = alerts.find((item) => item.recipientRole === "admin");
const adminMessage = staff.staffBookingMessage(adminAlert, booking);
assert(adminMessage.includes("Phone: 0812345678"), "Admin messages may include passenger contact details");

const noConfigAlerts = staff.bookingCreatedStaffAlerts({ booking, staffConfig: {} });
assert.deepStrictEqual(noConfigAlerts, []);

console.log("staff notification center ok");
