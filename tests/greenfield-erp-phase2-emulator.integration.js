"use strict";

const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

const { assertDemoDatabaseEmulator } = require("../greenfield-erp/phase2/environment-guard.js");
const { createValidatedDraft } = require("../greenfield-erp/phase2/draft-service.js");
const { createRtdbEmulatorDraftStore } = require("../greenfield-erp/phase2/rtdb-emulator-draft-store.js");
const valid = require("../contracts/greenfield-erp/v1/fixtures/valid-network-package.json");

const projectId = "demo-sl-transit-greenfield";
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const namespace = projectId + "-default-rtdb";

async function main() {
  assertDemoDatabaseEmulator({ projectId, databaseEmulatorHost: host });
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);

  const app = initializeApp({
    projectId,
    databaseURL: "http://" + host + "?ns=" + namespace
  }, "greenfield-phase2-emulator-test");
  const database = getDatabase(app);
  await database.ref("data/erpDataCenter").remove();

  try {
    const store = createRtdbEmulatorDraftStore({
      database,
      projectId,
      databaseEmulatorHost: host
    });
    const first = await createValidatedDraft({
      package: valid,
      actorUid: "emulator-owner",
      store,
      now: function () { return "2026-08-10T00:00:00.000Z"; }
    });
    assert.equal(first.ok, true);
    assert.equal(first.reused, false);

    const metadata = (await database.ref("data/erpDataCenter/authoring/drafts/" + first.draftId + "/metadata").get()).val();
    assert.equal(metadata.status, "draft");
    assert.equal(metadata.revision, 1);

    const frequency = (await database.ref("data/erpDataCenter/authoring/drafts/" + first.draftId + "/entities/frequencyServices/FRQ-BUS01-0001").get()).val();
    assert.equal(frequency.headwaySeconds, 600);

    const second = await createValidatedDraft({
      package: valid,
      actorUid: "emulator-owner",
      store,
      now: function () { return "2026-08-10T00:01:00.000Z"; }
    });
    assert.equal(second.reused, true);
    assert.equal(second.draftId, first.draftId);

    const browserWrite = await fetch(
      "http://" + host + "/data/erpDataCenter/authoring/drafts/browser.json?ns=" + namespace,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ forbidden: true })
      }
    );
    assert.equal(browserWrite.ok, false);
    assert.ok([401, 403].includes(browserWrite.status));

    console.log("greenfield phase2 RTDB emulator integration PASS");
  } finally {
    await database.ref("data/erpDataCenter").remove();
    await deleteApp(app);
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});