const crypto = require("crypto");

function safeJobId(code, eventType, channelKind, recipientType, recipientId) {
  // Channel is part of identity: Passenger and Staff bots do not share a
  // LINE user namespace and must never be deduplicated across channels.
  if (arguments.length < 5) {
    recipientId = recipientType;
    recipientType = channelKind;
    channelKind = channelKind === "passenger" ? "passenger" : "staff";
  }
  return [code, eventType, channelKind || "staff", recipientType, recipientId].map((value) => encodeURIComponent(String(value || "unknown")).replace(/[.#$\[\]]/g, "_")).join("__");
}

function retryKey(jobId) {
  const hex = crypto.createHash("sha256").update(jobId).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function dedupeRecipients(recipients, options) {
  options = options || {};
  const preserveRecipientType = options.preserveRecipientType === true;
  const map = new Map();
  for (const recipient of recipients || []) {
    const lineTo = String(recipient.lineTo || "").trim();
    if (!lineTo) continue;
    const channelKind = recipient.channelKind || (recipient.type === "passenger" ? "passenger" : "staff");
    const recipientType = String(recipient.type || "");
    const key = preserveRecipientType ? `${channelKind}::${recipientType}::${lineTo}` : `${channelKind}::${lineTo}`;
    const previous = map.get(key);
    map.set(key, previous ? { ...previous, roles: [...new Set([...(previous.roles || []), recipient.type].filter(Boolean))] } : { ...recipient, channelKind, roles: recipient.type ? [recipient.type] : [] });
  }
  return [...map.values()];
}

function tokenKind(recipientType) {
  return ["admin", "staff", "driver", "queue", "terminal", "transfer_terminal"].includes(recipientType) ? "staff" : "passenger";
}

function channelKind(recipientType) {
  return recipientType === "passenger" ? "passenger" : "staff";
}

function classifyLineResponse(status) {
  const code = Number(status || 0);
  if (code >= 200 && code < 300) return { status: "sent", retry: false };
  if (code === 409) return { status: "accepted_duplicate", retry: false };
  if ([400, 401, 403, 404].includes(code)) return { status: "permanent_failed", retry: false };
  if (code === 429) return { status: "rate_limited", retry: false };
  return { status: "retryable_failed", retry: true };
}

function claimDecision(current, now, leaseMs = 120000) {
  if (!current) return { claim: true, attempts: 1 };
  if (["sent", "accepted_duplicate", "failed", "permanent_failed", "rate_limited", "mock_skipped"].includes(current.status)) return { claim: false, reason: current.status };
  if (current.status === "processing" && now - Number(current.processingStartedAt || 0) < leaseMs) return { claim: false, reason: "lease_active" };
  const attempts = Number(current.attempts || 0) + 1;
  return attempts > 3 ? { claim: false, reason: "attempt_limit" } : { claim: true, attempts };
}

function retryDelayMs(attempt) { return attempt === 1 ? 0 : attempt === 2 ? 1000 : 3000; }

function lookupAssignmentRecipients(assignment, config) {
  const output = [];
  const driverGroup = config?.driversByVehicleId?.[assignment?.plannedVehicleId] || {};
  for (const target of Object.values(driverGroup)) if (target.active !== false && target.lineUserId) output.push({ type: "driver", lineTo: target.lineUserId });
  const queueGroup = config?.queuesByQueueId?.[assignment?.queueId] || {};
  for (const target of Object.values(queueGroup)) if (target.active !== false && target.lineUserId) output.push({ type: "queue", lineTo: target.lineUserId });
  return dedupeRecipients(output);
}

module.exports = { safeJobId, retryKey, dedupeRecipients, tokenKind, channelKind, classifyLineResponse, claimDecision, retryDelayMs, lookupAssignmentRecipients };
