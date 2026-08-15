"use strict";

const { createJourneyEngine } = require("./journey-engine.js");

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createVersionedJourneyCache(options) {
  const input = options || {};
  if (typeof input.loadPointer !== "function") throw codedError("journey_pointer_loader_required");
  if (typeof input.loadReadModel !== "function") throw codedError("journey_model_loader_required");
  const now = typeof input.now === "function" ? input.now : Date.now;
  const maxStaleMs = Number.isInteger(input.maxStaleMs) ? input.maxStaleMs : 300000;
  const onStale = typeof input.onStale === "function" ? input.onStale : function () {};
  let entry = null;
  let loading = null;

  async function get() {
    let pointer;
    try {
      pointer = await input.loadPointer();
      if (!pointer || typeof pointer.versionId !== "string" || !pointer.versionId) {
        throw codedError("journey_current_pointer_missing");
      }
      if (entry && entry.versionId === pointer.versionId) {
        return { ...entry, cacheStatus: "hit" };
      }
      if (loading && loading.versionId === pointer.versionId) return loading.promise;
      const promise = (async function () {
        const readModel = await input.loadReadModel(pointer.versionId);
        const engine = createJourneyEngine(readModel);
        entry = {
          versionId: pointer.versionId,
          manifestHash: pointer.manifestHash || null,
          loadedAt: now(),
          engine
        };
        return { ...entry, cacheStatus: "reloaded" };
      })().finally(function () {
        if (loading && loading.promise === promise) loading = null;
      });
      loading = { versionId: pointer.versionId, promise };
      return promise;
    } catch (error) {
      if (entry && now() - entry.loadedAt <= maxStaleMs) {
        onStale({ error, versionId: entry.versionId });
        return { ...entry, cacheStatus: "stale" };
      }
      throw error;
    }
  }

  function invalidate(nextVersionId) {
    if (!nextVersionId || !entry || entry.versionId !== nextVersionId) entry = null;
    loading = null;
  }

  return Object.freeze({
    get,
    invalidate,
    snapshot: function () {
      return entry ? { versionId: entry.versionId, manifestHash: entry.manifestHash, loadedAt: entry.loadedAt } : null;
    }
  });
}

let moduleCache = null;

function getModuleJourneyCache(options) {
  if (!moduleCache) moduleCache = createVersionedJourneyCache(options);
  return moduleCache;
}

function resetModuleJourneyCacheForTest() {
  moduleCache = null;
}

module.exports = {
  createVersionedJourneyCache,
  getModuleJourneyCache,
  resetModuleJourneyCacheForTest
};