"use strict";

const { assertDemoDatabaseEmulator } = require("../phase2/environment-guard.js");
const { safeUid } = require("./authorization-service.js");

const ACCESS_BASE_PATH = "data/erpDataCenter/access/accounts";

function createRtdbAccessReader(options) {
  const input = options || {};
  assertDemoDatabaseEmulator({ projectId: input.projectId, databaseEmulatorHost: input.databaseEmulatorHost });
  if (!input.database || typeof input.database.ref !== "function") throw new Error("greenfield_injected_database_required");
  if (input.basePath && input.basePath !== ACCESS_BASE_PATH) throw new Error("greenfield_access_base_path_locked");
  const database = input.database;

  return Object.freeze({
    async getAccount(uid) {
      if (!safeUid(uid)) return null;
      const snapshot = await database.ref(ACCESS_BASE_PATH + "/" + uid).get();
      return snapshot && snapshot.exists() ? snapshot.val() : null;
    }
  });
}

module.exports = { ACCESS_BASE_PATH, createRtdbAccessReader };