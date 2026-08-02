const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "../functions/index.js"), "utf8");

for (const name of ["handleBookingCreated", "handlePaymentStatusChanged", "handleAssignmentChanged", "handleCheckinCreated", "processNotificationJob"]) {
  assert(source.includes(`exports.${name}`), `${name} export is required`);
}
for (const name of ["sendLineOnBooking", "sendStaffLineOnBooking", "sendLineOnPaymentVerified", "syncDriverTicketOnBookingWrite"]) {
  assert(!source.includes(`exports.${name}`), `${name} must not be deployed`);
}
assert(!source.includes('onValueWritten({ ref: "/bookings/{code}"'), "full booking path must not use onValueWritten");
assert(source.includes("operations/notificationJobs/${jobId}"));
assert(source.includes("operations/notificationDispatch/${jobId}"));
assert(source.includes("transaction((current) => current || job)"));
assert(source.includes('status: "processing"'));
assert(source.includes('status: "mock_skipped"'));
assert(source.includes('attempt <= 3'));
assert(source.includes('"X-Line-Retry-Key"'));
assert(source.includes("notificationCenter.tokenKind"));
assert(source.includes("notificationCenter.lookupAssignmentRecipients"));
assert(source.includes('ref: "/bookings/{code}/paymentStatus"'));
assert(source.includes('ref: "/bookings/{code}/assignment"'));
assert(source.includes('ref: "/operations/bookingEvents/{code}/checkin/{eventId}"'));
assert(source.includes("maxInstances: 1"));
assert(source.includes("minInstances: 0"));
const processor = source.slice(source.indexOf("exports.processNotificationJob"));
assert(!processor.includes("bookings/${code}/lineMessaging"), "processor must not write booking notification status");
assert(!processor.includes("bookings/${code}/staffLineMessaging"), "processor must not write booking staff status");
assert(source.includes("stableRetryKey(jobId)"));
assert(source.includes("driverTicketCenter.buildDriverTicketMirrorUpdate"));
console.log("notification cost-loop architecture ok");
