const assert = require("assert");
const center = require("../functions/notification-center.js");

for (const status of [400, 401, 403, 404]) {
  const result = center.classifyLineResponse(status);
  assert.strictEqual(result.status, "permanent_failed");
  assert.strictEqual(result.retry, false);
}
assert.deepStrictEqual(center.classifyLineResponse(409), { status: "accepted_duplicate", retry: false });
assert.deepStrictEqual(center.classifyLineResponse(429), { status: "rate_limited", retry: false });
assert.strictEqual(center.classifyLineResponse(500).retry, true);
assert.strictEqual(center.classifyLineResponse(0).retry, true);

const sameStaff = center.dedupeRecipients([
  { type: "admin", channelKind: "staff", lineTo: "U-staff" },
  { type: "driver", channelKind: "staff", lineTo: "U-staff" },
  { type: "queue", channelKind: "staff", lineTo: "U-staff" }
]);
assert.strictEqual(sameStaff.length, 1);
assert.deepStrictEqual(sameStaff[0].roles.sort(), ["admin", "driver", "queue"]);
const separateChannels = center.dedupeRecipients([
  { type: "passenger", channelKind: "passenger", lineTo: "U-same" },
  { type: "staff", channelKind: "staff", lineTo: "U-same" }
]);
assert.strictEqual(separateChannels.length, 2);

assert.strictEqual(center.claimDecision({ status: "processing", processingStartedAt: Date.now() - 121000, attempts: 1 }, Date.now()).claim, true);
assert.strictEqual(center.claimDecision({ status: "processing", processingStartedAt: Date.now(), attempts: 1 }, Date.now()).claim, false);
assert.strictEqual(center.claimDecision({ status: "processing", processingStartedAt: Date.now() - 121000, attempts: 3 }, Date.now()).claim, false);
assert.deepStrictEqual([1, 2, 3].map(center.retryDelayMs), [0, 1000, 3000]);
console.log("notification policy behavioral tests ok");
