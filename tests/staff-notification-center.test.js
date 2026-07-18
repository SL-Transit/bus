const assert = require("assert");
const fs = require("fs");
const path = require("path");
const staff = require("../functions/staff-notification-center.js");

const contractDoc = fs.readFileSync(
  path.join(__dirname, "../ai-handoffs/NOTIFICATION-CENTER-CONTRACT.md"),
  "utf8"
);

assert.strictEqual(staff.STAFF_LINE_TARGETS_PATH, "data/notificationCenter/staffLineTargets");
assert.strictEqual(staff.STAFF_LINE_TARGETS_SCHEMA_VERSION, "staff_line_targets_v1");
assert(contractDoc.includes("Notification Center Contract"));
assert(contractDoc.includes("must survive page rebuilds"));
assert(contractDoc.includes("/data/notificationCenter/staffLineTargets"));
assert(contractDoc.includes("Do not bind notification policy to `booking1.html`"));

const booking = {
  code: "BK123456",
  name: "Somchai",
  phone: "0812345678",
  origin: "Nong Khok",
  destination: "Pattaya",
  date: "2026-07-18",
  time: "09:00",
  seats: 2,
  price: 240,
  slipUrl: "https://res.cloudinary.com/sl-transit/slips/BK123456.jpg",
  legSchedule: {
    leg1: "Nong Khok - Chachoengsao",
    leg1Time: "09:00",
    leg2: "Chachoengsao - Pattaya",
    leg2Time: "11:30"
  },
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

const normalized = staff.normalizeStaffLineTargetsConfig({
  active: true,
  admins: {
    main: { name: "Admin", lineUserId: "U-admin" },
    missingLine: { name: "No LINE" }
  },
  driversByVehicleId: {
    car1: {
      primary: { staffId: "driver_1", lineUserId: "U-driver" },
      missingLine: { staffId: "driver_2" }
    }
  }
});
assert.strictEqual(normalized.schemaVersion, "staff_line_targets_v1");
assert.strictEqual(normalized.admins.main.displayName, "Admin");
assert(!normalized.admins.missingLine);
assert.strictEqual(normalized.driversByVehicleId.car1.length, 1);

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
assert(driverMessage.includes("รหัส: BK123456"));
assert(driverMessage.includes("โทร: 0812345678"));
assert(driverMessage.includes("เส้นทาง: Nong Khok - Chachoengsao"));
assert(driverMessage.includes("วันที่: 2026-07-18 เวลา 09:00 น."));
assert(driverMessage.includes("จำนวน: 2 คน  ราคา: 240 บาท"));
assert(driverMessage.includes("สลิป: https://res.cloudinary.com/sl-transit/slips/BK123456.jpg"));
assert(driverMessage.includes("รถ: car1"));
assert(!driverMessage.includes("Chachoengsao - Pattaya"), "Driver messages must use the first leg for transfer bookings");

const adminAlert = alerts.find((item) => item.recipientRole === "admin");
const adminMessage = staff.staffBookingMessage(adminAlert, booking);
assert(adminMessage.includes("โทร: 0812345678"), "Admin messages must include passenger contact details");

const terminalAlert = alerts.find((item) => item.recipientRole === "transfer_terminal");
const terminalMessage = staff.staffBookingMessage(terminalAlert, booking);
assert(terminalMessage.includes("เส้นทาง: Chachoengsao - Pattaya"), "Transfer terminal messages must use the transfer leg");
assert(terminalMessage.includes("วันที่: 2026-07-18 เวลา 11:30 น."));

const noConfigAlerts = staff.bookingCreatedStaffAlerts({ booking, staffConfig: {} });
assert.deepStrictEqual(noConfigAlerts, []);

const disabledAlerts = staff.bookingCreatedStaffAlerts({
  booking,
  staffConfig: {
    active: false,
    admins: { main: { staffId: "admin_1", lineUserId: "U-admin" } }
  }
});
assert.deepStrictEqual(disabledAlerts, []);

(async () => {
  const reads = [];
  const readConfig = await staff.readStaffLineTargetsConfig({
    ref(path) {
      reads.push(path);
      return {
        async get() {
          return {
            val() {
              return {
                admins: {
                  main: { staffId: "admin_1", lineUserId: "U-admin" }
                }
              };
            }
          };
        }
      };
    }
  });
  assert.deepStrictEqual(reads, ["data/notificationCenter/staffLineTargets"]);
  assert.strictEqual(readConfig.admins.main.lineUserId, "U-admin");

  await assert.rejects(
    () => staff.readStaffLineTargetsConfig(null),
    /staff_line_targets_database_required/
  );

  console.log("staff notification center ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
