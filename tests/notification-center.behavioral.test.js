const assert = require("assert");
const center = require("../functions/notification-center.js");

const id = center.safeJobId("BK1", "booking_created", "passenger", "U1");
assert.strictEqual(center.safeJobId("BK1", "booking_created", "passenger", "U1"), id);
assert.strictEqual(center.retryKey(id), center.retryKey(id));
assert.strictEqual(center.dedupeRecipients([{ type: "admin", lineTo: "U1" }, { type: "driver", lineTo: "U1" }, { type: "queue", lineTo: "U2" }]).length, 2);
assert.deepStrictEqual(center.dedupeRecipients([{ type: "admin", lineTo: "U1" }, { type: "driver", lineTo: "U1" }])[0].roles.sort(), ["admin", "driver"]);
assert.strictEqual(center.tokenKind("admin"), "staff");
assert.strictEqual(center.tokenKind("transfer_terminal"), "staff");
assert.strictEqual(center.tokenKind("passenger"), "passenger");
assert.strictEqual(center.claimDecision(null, Date.now()).claim, true);
assert.strictEqual(center.claimDecision({ status: "processing", processingStartedAt: Date.now() }, Date.now()).claim, false);
assert.strictEqual(center.claimDecision({ status: "processing", processingStartedAt: Date.now() - 121000, attempts: 1 }, Date.now()).claim, true);
assert.strictEqual(center.claimDecision({ status: "processing", processingStartedAt: Date.now() - 121000, attempts: 3 }, Date.now()).claim, false);
assert.deepStrictEqual([1, 2, 3].map(center.retryDelayMs), [0, 1000, 3000]);
const recipients = center.lookupAssignmentRecipients({ plannedVehicleId: "car1", queueId: "Q1" }, { driversByVehicleId: { car1: { d: { lineUserId: "UD", active: true } } }, queuesByQueueId: { Q1: { q: { lineUserId: "UQ", active: true } } } });
assert.deepStrictEqual(recipients.map((item) => item.lineTo).sort(), ["UD", "UQ"]);
console.log("notification center behavioral tests ok");
