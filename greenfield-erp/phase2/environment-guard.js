"use strict";

function assertDemoDatabaseEmulator(options) {
  const input = options || {};
  const projectId = input.projectId;
  const host = input.databaseEmulatorHost;
  if (typeof projectId !== "string" || !projectId.startsWith("demo-")) {
    throw new Error("greenfield_demo_project_required");
  }
  if (typeof host !== "string" || host.length === 0) {
    throw new Error("greenfield_rtdb_emulator_required");
  }
  if (host.includes("://") || !/^[a-zA-Z0-9.-]+:\d+$/.test(host)) {
    throw new Error("greenfield_rtdb_emulator_host_invalid");
  }
  return Object.freeze({ projectId, databaseEmulatorHost: host });
}

module.exports = { assertDemoDatabaseEmulator };