"use strict";

const assert = require("assert");
const fs = require("fs");
const { buildDryRunSnapshot } = require("../tools/erp-data-center-dry-run-snapshot.js");
const autoCenter = require("../functions/driver-work-auto-center.js");

(async () => {
  const sameDay = autoCenter.buildRotatingDailyAssignments("2026-07-16");
  assert.strictEqual(sameDay.veh_001.queueId, "queue_001");
  assert.strictEqual(sameDay.veh_002.queueId, "queue_002");
  assert.strictEqual(sameDay.veh_003.queueId, "queue_003");
  assert.strictEqual(sameDay.veh_004.queueId, "queue_004");

  const nextDay = autoCenter.buildRotatingDailyAssignments("2026-07-17");
  assert.strictEqual(nextDay.veh_001.queueId, "queue_002");
  assert.strictEqual(nextDay.veh_004.queueId, "queue_001");
  assert.strictEqual(autoCenter.nextBangkokServiceDate(new Date("2026-07-18T16:45:00.000Z")), "2026-07-19");

  const blocked = autoCenter.buildUpdates({
    erpDataCenter: {},
    serviceDate: "2026-07-18",
    currentTime: "10:00"
  });
  assert.strictEqual(blocked.updates["operations/driverWorkGenerationStatus/2026-07-18"].status, "blocked");
  assert.deepStrictEqual(
    Object.keys(blocked.updates).filter((path) => path.indexOf("operations/driverWorkByServiceDate/2026-07-18/") === 0),
    [],
    "missing ERP must not create fake driver work"
  );

  const snapshot = await buildDryRunSnapshot();
  const ready = autoCenter.buildUpdates({
    erpDataCenter: snapshot.snapshot.erpDataCenter,
    serviceDate: "2026-07-16",
    currentTime: "10:00"
  });
  assert.strictEqual(ready.updates["operations/driverWorkGenerationStatus/2026-07-16"].status, "ready");
  assert(ready.updates["operations/driverWorkByServiceDate/2026-07-16/car1"], "car1 work must be generated");
  assert(ready.updates["operations/driverWorkByServiceDate/2026-07-16/car2"], "car2 work must be generated");
  assert(ready.updates["operations/driverWorkByServiceDate/2026-07-16/car3"], "car3 work must be generated");
  assert(ready.updates["operations/driverWorkByServiceDate/2026-07-16/car4"], "car4 work must be generated");
  assert(ready.updates["operations/driverWorkByServiceDate/2026-07-16/car5"], "fixed car5 work must be generated");
  assert.strictEqual(ready.updates["operations/driverWorkByServiceDate/2026-07-16/car1"].queueId, "queue_001");
  assert.strictEqual(ready.updates["operations/driverWorkByServiceDate/2026-07-16/car5"].assignmentMode, "fixed");

  const index = fs.readFileSync("functions/index.js", "utf8");
  assert(index.includes("exports.prepareNextDayDriverWork"), "next-day driver work function must be exported");
  assert(index.includes('schedule: "45 23 * * *"'), "driver work must be prepared once before midnight");
  assert(!index.includes('schedule: "every 5 minutes"'), "driver work must not refresh every 5 minutes");
  assert(index.includes("nextBangkokServiceDate(now)"), "scheduler must create tomorrow's work before midnight");
  assert(index.includes('currentTime = "00:00"'), "next-day work must be selected for the start of service date");
  assert(index.includes("operations/driverDailyAssignments"), "scheduler must allow central daily assignment overrides");
  assert(index.includes("operations/driverManualOverrides"), "scheduler must allow central manual overrides");
  assert(index.includes("operations/driverWorkGenerationConfig"), "scheduler must read central rotation config");

  console.log("driver work auto center ok");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
