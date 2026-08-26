"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../greenfield-erp/phase5");
const builder = require(path.join(root, "read-model-builder.js"));
const publication = require(path.join(root, "publication-service.js"));
const { createJourneyEngine } = require(path.join(root, "journey-engine.js"));
const cacheModule = require(path.join(root, "version-cache.js"));
const valid = JSON.parse(fs.readFileSync(path.join(__dirname, "../contracts/greenfield-erp/v1/fixtures/valid-network-package.json"), "utf8"));
const emulatorContract = JSON.parse(fs.readFileSync(path.join(root, "emulator-contract.json"), "utf8"));
const rules = JSON.parse(fs.readFileSync(path.join(root, "rules/database.rules.emulator.json"), "utf8"));

function routingSupplements() {
  return {
    segmentTravelSecondsByPatternId: {
      "JPT-BUS01-0002": { "1": 1200 }
    }
  };
}

function fakeStore(options) {
  const input = options || {};
  let manifest = null;
  const calls = [];
  return {
    calls,
    async beginVersion(value) {
      calls.push("begin");
      if (!manifest) manifest = value;
      return { reused: false, manifest };
    },
    async writeChunk(_versionId, chunk) {
      calls.push("write:" + chunk.chunkId);
    },
    async verifyChunk(_versionId, chunk) {
      calls.push("verify:" + chunk.chunkId);
      if (input.failVerification) {
        const error = new Error("injected_verification_failure");
        error.code = "injected_verification_failure";
        throw error;
      }
    },
    async finalizeVersion(_versionId, value) {
      calls.push("ready");
      manifest = value;
    },
    async failVersion(_versionId, code) {
      calls.push("failed:" + code);
      if (manifest && manifest.status === "building") manifest = { ...manifest, status: "failed", failureCode: code };
    },
    async getManifest() { return manifest; },
    async atomicSwitch(command) {
      calls.push("switch");
      return {
        ok: true,
        versionId: command.targetVersionId,
        previousVersionId: command.expectedCurrentVersionId,
        atomicLocations: 3
      };
    }
  };
}

function journeyModel() {
  return {
    operatorsById: {
      "OPR-A": { operatorId: "OPR-A", nameTh: "A", timezone: "Asia/Bangkok" },
      "OPR-B": { operatorId: "OPR-B", nameTh: "B", timezone: "Asia/Bangkok" }
    },
    locationsById: {
      "LOC-A": { locationId: "LOC-A", locationType: "stop", nameTh: "ต้นทาง" },
      "LOC-H": { locationId: "LOC-H", locationType: "hub", nameTh: "จุดต่อรถ" },
      "LOC-B": { locationId: "LOC-B", locationType: "stop", nameTh: "ปลายทาง" }
    },
    routesById: {
      "RTE-A": { routeId: "RTE-A", operatorId: "OPR-A", shortName: "A1", serviceMode: "fixed" },
      "RTE-B": { routeId: "RTE-B", operatorId: "OPR-B", shortName: "B1", serviceMode: "frequency" }
    },
    patternsByRouteId: {
      "RTE-A": { "PAT-A": { journeyPatternId: "PAT-A", routeId: "RTE-A", direction: "outbound" } },
      "RTE-B": { "PAT-B": { journeyPatternId: "PAT-B", routeId: "RTE-B", direction: "outbound" } }
    },
    patternStopsByPatternId: {
      "PAT-A": {
        "000001": { stopSequence: 1, locationId: "LOC-A" },
        "000002": { stopSequence: 2, locationId: "LOC-H" }
      },
      "PAT-B": {
        "000001": { stopSequence: 1, locationId: "LOC-H" },
        "000002": { stopSequence: 2, locationId: "LOC-B" }
      }
    },
    fixedTripsByRouteDate: {
      "RTE-A": {
        "2026-08-11": {
          "TRP-A": { fixedTripId: "TRP-A", routeId: "RTE-A", journeyPatternId: "PAT-A" }
        }
      }
    },
    stopTimesByTripId: {
      "TRP-A": {
        "000001": { stopSequence: 1, locationId: "LOC-A", arrivalTime: "09:00:00", departureTime: "09:00:00" },
        "000002": { stopSequence: 2, locationId: "LOC-H", arrivalTime: "09:30:00", departureTime: "09:30:00" }
      }
    },
    frequenciesByRouteDate: {
      "RTE-B": {
        "2026-08-11": {
          "FRQ-B": {
            frequencyServiceId: "FRQ-B",
            routeId: "RTE-B",
            journeyPatternId: "PAT-B",
            startTime: "06:00:00",
            endTime: "20:00:00",
            headwaySeconds: 600,
            boardingModel: "queue",
            exactTimes: false
          }
        }
      }
    },
    fareRulesByRouteId: {
      "RTE-A": {
        "FAR-A": { fareRuleId: "FAR-A", routeId: "RTE-A", originLocationId: "LOC-A", destinationLocationId: "LOC-H", amountMinor: 1000 }
      },
      "RTE-B": {
        "FAR-B": { fareRuleId: "FAR-B", routeId: "RTE-B", originLocationId: "LOC-H", destinationLocationId: "LOC-B", amountMinor: 2000 }
      }
    },
    transfersByLocationId: {
      "LOC-H": {
        "TRF-H": {
          transferRuleId: "TRF-H",
          fromLocationId: "LOC-H",
          toLocationId: "LOC-H",
          fromOperatorId: "OPR-A",
          toOperatorId: "OPR-B",
          fromServiceMode: "fixed",
          toServiceMode: "frequency",
          fromServiceId: "TRP-A",
          toServiceId: "FRQ-B",
          minimumTransferSeconds: 300,
          maximumTransferSeconds: 3600,
          throughBooking: false,
          baggageTransfer: false
        }
      }
    },
    networkIndexes: {
      segmentTravelSecondsByPatternId: {
        "PAT-B": { "1": 1200 }
      }
    }
  };
}
function transferCombinationModel(fromMode, toMode) {
  const model = journeyModel();
  const rule = model.transfersByLocationId["LOC-H"]["TRF-H"];
  rule.fromServiceMode = fromMode;
  rule.toServiceMode = toMode;
  rule.fromServiceId = fromMode === "fixed" ? "TRP-A" : "FRQ-A";
  rule.toServiceId = toMode === "fixed" ? "TRP-B" : "FRQ-B";

  if (fromMode === "frequency") {
    model.routesById["RTE-A"].serviceMode = "frequency";
    delete model.fixedTripsByRouteDate["RTE-A"];
    delete model.stopTimesByTripId["TRP-A"];
    model.frequenciesByRouteDate["RTE-A"] = {
      "2026-08-11": {
        "FRQ-A": {
          frequencyServiceId: "FRQ-A",
          routeId: "RTE-A",
          journeyPatternId: "PAT-A",
          startTime: "06:00:00",
          endTime: "20:00:00",
          headwaySeconds: 600,
          boardingModel: "queue",
          exactTimes: false
        }
      }
    };
    model.networkIndexes.segmentTravelSecondsByPatternId["PAT-A"] = { "1": 1800 };
  }

  if (toMode === "fixed") {
    model.routesById["RTE-B"].serviceMode = "fixed";
    delete model.frequenciesByRouteDate["RTE-B"];
    model.fixedTripsByRouteDate["RTE-B"] = {
      "2026-08-11": {
        "TRP-B": { fixedTripId: "TRP-B", routeId: "RTE-B", journeyPatternId: "PAT-B" }
      }
    };
    model.stopTimesByTripId["TRP-B"] = {
      "000001": { stopSequence: 1, locationId: "LOC-H", arrivalTime: "09:40:00", departureTime: "09:40:00" },
      "000002": { stopSequence: 2, locationId: "LOC-B", arrivalTime: "10:00:00", departureTime: "10:00:00" }
    };
  }
  return model;
}

test("read model builder creates immutable consumer nodes and date indexes", function () {
  const built = builder.buildPublishedRecords({
    package: valid,
    serviceDates: ["2026-08-11"],
    routingSupplements: routingSupplements()
  });
  assert.equal(built.schemaVersion, "published-read-model-v1");
  assert.match(built.modelHash, /^sha256:[a-f0-9]{64}$/);
  assert.ok(built.records.some(function (record) {
    return record.path === "fixedTripsByRouteDate/RTE-BUS01-0001/2026-08-11/TRP-BUS01-0001";
  }));
  assert.ok(built.records.some(function (record) {
    return record.path === "frequenciesByRouteDate/RTE-BUS01-0002/2026-08-11/FRQ-BUS01-0001";
  }));
  assert.ok(built.records.every(function (record) {
    return !record.path.startsWith("authoring/") && !record.path.startsWith("data/erpDataCenter/");
  }));
  const materialized = builder.materializeRecords(built.records);
  assert.equal(materialized.networkIndexes.segmentTravelSecondsByPatternId["JPT-BUS01-0002"]["1"], 1200);
});

test("frequency publication fails closed when segment runtime is missing", function () {
  assert.throws(function () {
    builder.buildPublishedRecords({
      package: valid,
      serviceDates: ["2026-08-11"],
      routingSupplements: {}
    });
  }, function (error) {
    return error.code === "frequency_segment_runtime_required";
  });
});

test("publication stages and verifies all chunks before the small pointer switch", async function () {
  const store = fakeStore();
  let tick = 0;
  const service = publication.createPublicationService({
    store,
    maxChunkBytes: 1000,
    maxChunkPaths: 20,
    now: function () {
      tick += 1;
      return "2026-08-11T00:00:" + String(tick).padStart(2, "0") + ".000Z";
    }
  });
  const staged = await service.stage({
    versionId: "VER-20260811-0001",
    draftId: "DRF-20260811-0001",
    actorUid: "owner-test",
    approval: { approvalId: "APR-20260811-0001", status: "approved" },
    package: valid,
    serviceDates: ["2026-08-11"],
    routingSupplements: routingSupplements()
  });
  assert.equal(staged.manifest.status, "ready");
  assert.equal(store.calls.includes("switch"), false);
  const lastVerify = store.calls.reduce(function (last, call, index) {
    return call.startsWith("verify:") ? index : last;
  }, -1);
  assert.ok(lastVerify >= 0);
  assert.ok(store.calls.indexOf("ready") > lastVerify);

  const activated = await service.activate({
    versionId: "VER-20260811-0001",
    requestId: "REQ-PUBLISH-0001",
    expectedCurrentVersionId: null,
    actorUid: "owner-test",
    reason: "review proof"
  });
  assert.equal(activated.atomicLocations, 3);
  assert.equal(store.calls[store.calls.length - 1], "switch");
});

test("failed staging never switches current pointer", async function () {
  const store = fakeStore({ failVerification: true });
  const service = publication.createPublicationService({
    store,
    maxChunkBytes: 1000,
    maxChunkPaths: 20,
    now: function () { return "2026-08-11T00:00:00.000Z"; }
  });
  await assert.rejects(service.stage({
    versionId: "VER-20260811-FAIL",
    draftId: "DRF-20260811-FAIL",
    actorUid: "owner-test",
    approval: { approvalId: "APR-20260811-FAIL", status: "approved" },
    package: valid,
    serviceDates: ["2026-08-11"],
    routingSupplements: routingSupplements()
  }), function (error) {
    return error.code === "injected_verification_failure";
  });
  assert.equal(store.calls.includes("switch"), false);
  assert.ok(store.calls.some(function (call) { return call === "failed:injected_verification_failure"; }));
});

test("hybrid journey connects fixed and queue services across operators", function () {
  const engine = createJourneyEngine(journeyModel());
  const journey = engine.findJourney({
    originLocationId: "LOC-A",
    destinationLocationId: "LOC-B",
    serviceDate: "2026-08-11",
    departureTime: "08:50:00",
    maxTransfers: 2
  });
  assert.equal(journey.found, true);
  assert.equal(journey.arrivalTime, "10:00:00");
  assert.equal(journey.durationSeconds, 4200);
  assert.equal(journey.transfers, 1);
  assert.equal(journey.fareMinor, 3000);
  assert.equal(journey.legs.length, 3);
  assert.equal(journey.legs[2].serviceMode, "frequency");
  assert.equal(journey.legs[2].expectedWaitSeconds, 300);
});
test("hybrid journey connects frequency to fixed service", function () {
  const journey = createJourneyEngine(transferCombinationModel("frequency", "fixed")).findJourney({
    originLocationId: "LOC-A",
    destinationLocationId: "LOC-B",
    serviceDate: "2026-08-11",
    departureTime: "08:50:00",
    maxTransfers: 2
  });
  assert.equal(journey.found, true);
  assert.equal(journey.arrivalTime, "10:00:00");
  assert.deepEqual(journey.legs.filter(function (leg) { return leg.kind === "ride"; }).map(function (leg) { return leg.serviceMode; }), ["frequency", "fixed"]);
});

test("hybrid journey connects frequency to frequency service", function () {
  const journey = createJourneyEngine(transferCombinationModel("frequency", "frequency")).findJourney({
    originLocationId: "LOC-A",
    destinationLocationId: "LOC-B",
    serviceDate: "2026-08-11",
    departureTime: "08:50:00",
    maxTransfers: 2
  });
  assert.equal(journey.found, true);
  assert.equal(journey.arrivalTime, "09:55:00");
  assert.deepEqual(journey.legs.filter(function (leg) { return leg.kind === "ride"; }).map(function (leg) { return leg.serviceMode; }), ["frequency", "frequency"]);
});

test("journey rejects a transfer whose exact service selector does not match", function () {
  const model = journeyModel();
  model.transfersByLocationId["LOC-H"]["TRF-H"].toServiceId = "FRQ-B-OTHER";
  const result = createJourneyEngine(model).findJourney({
    originLocationId: "LOC-A",
    destinationLocationId: "LOC-B",
    serviceDate: "2026-08-11",
    departureTime: "08:50:00",
    maxTransfers: 2
  });
  assert.equal(result.found, false);
});

test("journey does not invent an unapproved transfer", function () {
  const model = journeyModel();
  model.transfersByLocationId = {};
  const result = createJourneyEngine(model).findJourney({
    originLocationId: "LOC-A",
    destinationLocationId: "LOC-B",
    serviceDate: "2026-08-11",
    departureTime: "08:50:00",
    maxTransfers: 2
  });
  assert.equal(result.found, false);
});

test("version cache reloads on pointer change, deduplicates and keeps bounded stale fallback", async function () {
  let current = { versionId: "VER-A", manifestHash: "hash-a" };
  let loads = 0;
  let clock = 1000;
  let failPointer = false;
  const cache = cacheModule.createVersionedJourneyCache({
    async loadPointer() {
      if (failPointer) throw new Error("pointer_unavailable");
      return current;
    },
    async loadReadModel() {
      loads += 1;
      return journeyModel();
    },
    now: function () { return clock; },
    maxStaleMs: 5000
  });
  const first = await cache.get();
  const second = await cache.get();
  assert.equal(first.cacheStatus, "reloaded");
  assert.equal(second.cacheStatus, "hit");
  assert.equal(loads, 1);

  current = { versionId: "VER-B", manifestHash: "hash-b" };
  const changed = await cache.get();
  assert.equal(changed.versionId, "VER-B");
  assert.equal(loads, 2);

  failPointer = true;
  clock = 2000;
  const stale = await cache.get();
  assert.equal(stale.cacheStatus, "stale");
  cache.invalidate("VER-C");
  assert.equal(cache.snapshot(), null);
});

test("Phase 5 contract stays emulator-only and deny-by-default", function () {
  assert.equal(emulatorContract.status, "emulator_only");
  assert.equal(emulatorContract.limits.physicalChunkBytes, 5 * 1024 * 1024);
  assert.equal(emulatorContract.limits.physicalChunkLeafPaths, 5000);
  assert.equal(emulatorContract.atomicPointerSwitch.locations, 3);
  assert.equal(rules.rules[".read"], false);
  assert.equal(rules.rules[".write"], false);
  assert.equal(rules.rules.publishedReadModels[".write"], false);
  [
    "read-model-builder.js",
    "publication-service.js",
    "rtdb-emulator-publication-store.js",
    "journey-engine.js",
    "version-cache.js"
  ].forEach(function (file) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.equal(source.includes("initializeApp"), false);
    assert.equal(source.includes("firebase deploy"), false);
    assert.equal(source.includes("credential.cert"), false);
  });
});