const assert = require("assert");
const fs = require("fs");
const path = require("path");

const index = fs.readFileSync(path.join(__dirname, "../functions/index.js"), "utf8");

assert(index.includes('const staffLineToken = defineSecret("LINE_STAFF_CHANNEL_ACCESS_TOKEN")'));
assert(index.includes("exports.sendStaffLineOnBooking = onValueWritten"));
assert(index.includes('ref: "/bookings/{code}"'));
assert(index.includes('secrets: [staffLineToken]'));
assert(index.includes("staffNotificationCenter.readStaffLineTargetsConfig(admin.database())"));
assert(index.includes("staffNotificationCenter.bookingCreatedStaffAlerts({ booking, staffConfig })"));
assert(index.includes("staffNotificationCenter.staffBookingMessage(alert, booking)"));
assert(index.includes("pushLineMessageWithToken(token, alert.lineTo, message)"));
assert(index.includes("admin.database().ref(`staff_line_sent/${code}`)"));
assert(index.includes("sentRef.child(encodeURIComponent(alert.onceKey)).set"));
assert(index.includes("const pendingAlerts = alerts.filter"));
assert(index.includes("!event.data.after.exists()"));
assert(!index.includes('if (booking.staffLineMessagingStatus === "sent") return;'));
assert(!index.includes("booking.driverLineId"));
assert(!index.includes("booking.transferTerminalLineId"));

console.log("staff line function wiring ok");
