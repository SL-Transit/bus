const assert = require("assert");
const fs = require("fs");
const path = require("path");

const index = fs.readFileSync(path.join(__dirname, "../functions/index.js"), "utf8");

assert(index.includes('const staffLineToken = defineSecret("LINE_STAFF_CHANNEL_ACCESS_TOKEN")'));
assert(index.includes("exports.handleBookingCreated = onValueCreated"));
assert(index.includes("exports.processNotificationJob = onValueCreated"));
assert(index.includes("operations/notificationJobs/${jobId}"));
assert(index.includes("operations/notificationDispatch/${jobId}"));
assert(index.includes("X-Line-Retry-Key"));
assert(index.includes("maxInstances: 1"));
assert(index.includes("minInstances: 0"));
assert(!index.includes("exports.sendStaffLineOnBooking"));
assert(!index.includes("exports.sendLineOnPaymentVerified"));
assert(!index.includes("exports.syncDriverTicketOnBookingWrite"));
assert(!index.includes('onValueWritten({ ref: "/bookings/{code}"'));
assert(!index.includes("processNotificationJob").toString().includes("bookings/${code}/lineMessaging"));
assert(!index.includes("booking.driverLineId"));
assert(!index.includes("booking.transferTerminalLineId"));

console.log("staff line function wiring ok");
