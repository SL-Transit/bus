const crypto = require("crypto");

function safeJobId(code, eventType, recipientType, recipientId) {
  return [code, eventType, recipientType, recipientId].map((value) => encodeURIComponent(String(value || "unknown")).replace(/[.#$\[\]]/g, "_")).join("__");
}

function retryKey(jobId) {
  const hex = crypto.createHash("sha256").update(jobId).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function dedupeRecipients(recipients) {
  const map = new Map();
  for (const recipient of recipients || []) {
    const lineTo = String(recipient.lineTo || "").trim();
    if (!lineTo) continue;
    const previous = map.get(lineTo);
    map.set(lineTo, previous ? { ...previous, roles: [...new Set([...(previous.roles || []), recipient.type].filter(Boolean))] } : { ...recipient, roles: recipient.type ? [recipient.type] : [] });
  }
  return [...map.values()];
}

function tokenKind(recipientType) {
  return ["admin", "staff", "driver", "queue", "terminal", "transfer_terminal"].includes(recipientType) ? "staff" : "passenger";
}

function claimDecision(current, now, leaseMs = 120000) {
  if (!current) return { claim: true, attempts: 1 };
  if (current.status === "sent" || current.status === "failed" || current.status === "mock_skipped") return { claim: false, reason: current.status };
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

module.exports = { safeJobId, retryKey, dedupeRecipients, tokenKind, claimDecision, retryDelayMs, lookupAssignmentRecipients };
