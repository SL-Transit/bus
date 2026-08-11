"use strict";

const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

const { assertDemoDatabaseEmulator } = require("../greenfield-erp/phase2/environment-guard.js");
const { createPublicationService } = require("../greenfield-erp/phase5/publication-service.js");
const { createRtdbEmulatorPublicationStore } = require("../greenfield-erp/phase5/rtdb-emulator-publication-store.js");
const valid = require("../contracts/greenfield-erp/v1/fixtures/valid-network-package.json");

const projectId = "demo-sl-transit-greenfield";
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const namespace = projectId + "-default-rtdb";

function supplements() {
  return {
    segmentTravelSecondsByPatternId: {
      "JPT-BUS01-0002": { "1": 1200 }
    }
  };
}

async function main() {
  assertDemoDatabaseEmulator({ projectId, databaseEmulatorHost: host });
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  const app = initializeApp({
    projectId,
    databaseURL: "http://" + host + "?ns=" + namespace
  }, "greenfield-phase5-emulator-test");
  const database = getDatabase(app);
  await database.ref("data/erpDataCenter").remove();
  await database.ref("publishedReadModels").remove();

  let clock = Date.parse("2026-08-11T00:00:00.000Z");
  const store = createRtdbEmulatorPublicationStore({
    database,
    projectId,
    databaseEmulatorHost: host
  });
  const service = createPublicationService({
    store,
    now: function () {
      const value = new Date(clock).toISOString();
      clock += 1000;
      return value;
    }
  });

  try {
    const first = await service.stage({
      versionId: "VER-20260811-0001",
      draftId: "DRF-20260811-0001",
      actorUid: "emulator-owner",
      approval: { approvalId: "APR-20260811-0001", status: "approved" },
      package: valid,
      serviceDates: ["2026-08-11"],
      routingSupplements: supplements()
    });
    assert.equal(first.manifest.status, "ready");
    assert.equal((await database.ref("publishedReadModels/current").get()).exists(), false);
    assert.equal(
      (await database.ref("publishedReadModels/versions/VER-20260811-0001/frequenciesByRouteDate/RTE-BUS01-0002/2026-08-11/FRQ-BUS01-0001/headwaySeconds").get()).val(),
      600
    );

    const reused = await service.stage({
      versionId: "VER-20260811-0001",
      draftId: "DRF-20260811-0001",
      actorUid: "emulator-owner",
      approval: { approvalId: "APR-20260811-0001", status: "approved" },
      package: valid,
      serviceDates: ["2026-08-11"],
      routingSupplements: supplements()
    });
    assert.equal(reused.reused, true);

    const published = await service.activate({
      versionId: "VER-20260811-0001",
      requestId: "REQ-PUBLISH-0001",
      expectedCurrentVersionId: null,
      actorUid: "emulator-owner",
      reason: "emulator proof"
    });
    assert.equal(published.atomicLocations, 3);
    assert.equal((await database.ref("publishedReadModels/current/versionId").get()).val(), "VER-20260811-0001");

    await service.stage({
      versionId: "VER-20260811-0002",
      draftId: "DRF-20260811-0002",
      actorUid: "emulator-owner",
      approval: { approvalId: "APR-20260811-0002", status: "approved" },
      package: valid,
      serviceDates: ["2026-08-11"],
      routingSupplements: supplements()
    });
    await service.activate({
      versionId: "VER-20260811-0002",
      requestId: "REQ-PUBLISH-0002",
      expectedCurrentVersionId: "VER-20260811-0001",
      actorUid: "emulator-owner",
      reason: "version switch proof"
    });
    assert.equal((await database.ref("publishedReadModels/current/versionId").get()).val(), "VER-20260811-0002");

    const rolledBack = await service.rollback({
      versionId: "VER-20260811-0001",
      requestId: "REQ-ROLLBACK-0001",
      expectedCurrentVersionId: "VER-20260811-0002",
      actorUid: "emulator-owner",
      reason: "rollback proof"
    });
    assert.equal(rolledBack.previousVersionId, "VER-20260811-0002");
    assert.equal((await database.ref("publishedReadModels/current/versionId").get()).val(), "VER-20260811-0001");

    const history = (await database.ref("data/erpDataCenter/publication/history").get()).val();
    const audit = (await database.ref("data/erpDataCenter/audit/events").get()).val();
    assert.equal(Object.keys(history).length, 3);
    assert.equal(Object.keys(audit).length, 3);
    assert.equal((await database.ref("data/erpDataCenter/publication/locks/current").get()).exists(), false);

    const browserRead = await fetch(
      "http://" + host + "/publishedReadModels/current.json?ns=" + namespace
    );
    assert.equal(browserRead.ok, false);
    assert.ok([401, 403].includes(browserRead.status));

    console.log("greenfield phase5 publication emulator integration PASS");
  } finally {
    await database.ref("data/erpDataCenter").remove();
    await database.ref("publishedReadModels").remove();
    await deleteApp(app);
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});