"use strict";

const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const valid = require("../contracts/greenfield-erp/v1/fixtures/valid-network-package.json");

const projectId = "demo-sl-transit-greenfield";
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5002";
const namespace = projectId + "-default-rtdb";

async function signIn(email, password) {
  const response = await fetch("http://" + authHost + "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  assert.equal(response.ok, true, await response.text());
  return (await response.json()).idToken;
}

async function main() {
  assert.ok(databaseHost);
  assert.ok(authHost);
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);

  const app = initializeApp({ projectId, databaseURL: "http://" + databaseHost + "?ns=" + namespace }, "greenfield-phase4-emulator-test");
  const database = getDatabase(app);
  const auth = getAuth(app);
  const basePath = "data/erpDataCenter";
  const uid = "phase4-owner";
  const email = "phase4-owner@example.test";
  const password = "DemoOnly-2026!";
  await database.ref(basePath).remove();

  try {
    await auth.createUser({ uid, email, password });
    await auth.setCustomUserClaims(uid, { role: "admin" });
    await database.ref(basePath + "/access/accounts/" + uid).set({
      active: true,
      allowedCommands: ["import.validate"],
      resourceScopes: { operatorIds: ["OPR-BUS01"] }
    });
    const token = await signIn(email, password);
    const endpoint = "http://" + functionsHost + "/" + projectId + "/asia-southeast1/greenfieldErpCommand";
    const envelope = { requestId: "REQ-20260811-1001", command: "import.validate", payload: { package: valid } };

    const firstResponse = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token, origin: "http://localhost:5000" }, body: JSON.stringify(envelope) });
    const first = await firstResponse.json();
    assert.equal(firstResponse.status, 200);
    assert.equal(first.ok, true);
    assert.equal(first.result.ok, true);
    assert.equal(first.result.reused, false);

    const metadata = (await database.ref(basePath + "/authoring/drafts/" + first.result.draftId + "/metadata").get()).val();
    assert.equal(metadata.status, "draft");
    assert.equal(metadata.createdByUid, uid);

    const secondResponse = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token, origin: "http://localhost:5000" }, body: JSON.stringify({ ...envelope, requestId: "REQ-20260811-1002" }) });
    const second = await secondResponse.json();
    assert.equal(secondResponse.status, 200);
    assert.equal(second.result.reused, true);
    assert.equal(second.result.draftId, first.result.draftId);

    const noToken = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(envelope) });
    assert.equal(noToken.status, 401);

    const browserWrite = await fetch("http://" + databaseHost + "/" + basePath + "/authoring/drafts/browser.json?ns=" + namespace, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ forbidden: true }) });
    assert.ok([401, 403].includes(browserWrite.status));

    console.log("greenfield phase4 Cloud Function gateway emulator integration PASS");
  } finally {
    await database.ref(basePath).remove();
    await deleteApp(app);
  }
}

main().catch(function (error) { console.error(error); process.exitCode = 1; });