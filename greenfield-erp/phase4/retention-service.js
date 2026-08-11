"use strict";

const { dateKey, nextDateKey } = require("./retention-policy.js");

function createRetentionService(options) {
  const input = options || {};
  if (!input.store) throw new Error("greenfield_retention_store_required");
  if (!input.policy) throw new Error("retention_policy_required");
  const now = typeof input.now === "function" ? input.now : function () { return new Date().toISOString(); };

  async function run(runId) {
    const startedAt = now();
    const leaseExpiresAt = new Date(Date.parse(startedAt) + input.policy.leaseSeconds * 1000).toISOString();
    const acquired = await input.store.acquireLease({ runId, startedAt, leaseExpiresAt });
    if (!acquired) return { ok: true, skipped: true, code: "cleanup_lease_busy" };
    let processed = 0;
    let deleted = 0;
    let deferred = 0;
    try {
      const today = dateKey(startedAt);
      let cursor = await input.store.getCursor() || input.policy.cleanupStartDate;
      let days = 0;
      while (cursor <= today && days < input.policy.maxDaysPerRun) {
        const candidates = await input.store.listCandidates(cursor, input.policy.batchSize);
        for (const candidate of candidates) {
          let result;
          if (candidate.type === "importJobs") result = await input.store.cleanupImportJob({ ...candidate, now: startedAt });
          else if (candidate.type === "uploadAuthorizations") result = await input.store.cleanupUploadAuthorization({ ...candidate, now: startedAt });
          else result = await input.store.cleanupDraft({ ...candidate, now: startedAt });
          processed += 1;
          if (result.action === "deleted") deleted += 1;
          if (result.action === "deferred") deferred += 1;
        }
        if (candidates.length >= input.policy.batchSize) break;
        cursor = nextDateKey(cursor);
        days += 1;
        await input.store.saveCursor(cursor);
      }
      return { ok: true, skipped: false, processed, deleted, deferred, nextCursor: cursor };
    } finally {
      await input.store.releaseLease(runId);
    }
  }

  return Object.freeze({ run });
}

module.exports = { createRetentionService };