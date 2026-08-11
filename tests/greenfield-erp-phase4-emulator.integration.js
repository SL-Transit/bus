"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const { getStorage } = require("firebase-admin/storage");
const { createRtdbRetentionStore } = require("../greenfield-erp/phase4/rtdb-retention-store.js");
const { createRetentionService } = require("../greenfield-erp/phase4/retention-service.js");
const { parseRetentionPolicy } = require("../greenfield-erp/phase4/retention-policy.js");
const { createStoragePackageReader } = require("../greenfield-erp/phase4/storage-package-reader.js");
const valid = require("../contracts/greenfield-erp/v1/fixtures/valid-network-package.json");

const projectId = "demo-sl-transit-greenfield";
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5002";
const namespace = projectId + "-default-rtdb";
const bucketName = projectId + ".appspot.com";

async function signIn(email, password) {
  const response = await fetch("http://" + authHost + "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const responseText = await response.text(); assert.equal(response.ok, true, responseText); return JSON.parse(responseText).idToken;
}
async function post(endpoint, token, envelope) {
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token, origin: "http://localhost:5000" }, body: JSON.stringify(envelope) });
  return { response, body: await response.json() };
}

async function main() {
  assert.ok(databaseHost); assert.ok(authHost); assert.ok(process.env.FIREBASE_STORAGE_EMULATOR_HOST); assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  const app = initializeApp({ projectId, storageBucket: bucketName, databaseURL: "http://" + databaseHost + "?ns=" + namespace }, "greenfield-phase41-emulator-test");
  const database = getDatabase(app); const auth = getAuth(app); const storage = getStorage(app); const basePath = "data/erpDataCenter";
  const uid = "phase41-owner"; const email = "phase41-owner@example.test"; const password = "DemoOnly-2026!";
  await database.ref(basePath).remove();
  try {
    await auth.createUser({ uid, email, password }); await auth.setCustomUserClaims(uid, { role: "admin" });
    await database.ref(basePath + "/access/accounts/" + uid).set({ active: true, allowedCommands: ["import.start", "import.status"], resourceScopes: { operatorIds: ["OPR-BUS01"] } });
    const sourceBytes = Buffer.from(JSON.stringify(valid));
    const objectPath = "erp-import-quarantine/" + uid + "/network-package.json";
    await storage.bucket(bucketName).file(objectPath).save(sourceBytes, { metadata: { contentType: "application/json" } });
    const source = { bucket: bucketName, objectPath, contentType: "application/json", sizeBytes: sourceBytes.length, checksumSha256: "sha256:" + crypto.createHash("sha256").update(sourceBytes).digest("hex") };
    const token = await signIn(email, password);
    const gatewayEndpoint = "http://" + functionsHost + "/" + projectId + "/asia-southeast1/greenfieldErpCommand";
    const startEnvelope = { requestId: "REQ-20260811-4101", idempotencyKey: "IDM-REQ-20260811-4101", command: "import.start", payload: { operatorScope: ["OPR-BUS01"], source } };

    const queued = await post(gatewayEndpoint, token, startEnvelope);
    assert.equal(queued.response.status, 202); assert.equal(queued.body.result.status, "queued");
    const jobId = queued.body.result.jobId;
    const draftsBeforeWorker = (await database.ref(basePath + "/authoring/drafts").get()).val();
    assert.equal(draftsBeforeWorker, null);

    const repeated = await post(gatewayEndpoint, token, startEnvelope);
    assert.equal(repeated.response.status, 202); assert.equal(repeated.body.result.reused, true); assert.equal(repeated.body.result.jobId, jobId);

    const workerEndpoint = "http://" + functionsHost + "/" + projectId + "/asia-southeast1/greenfieldImportWorker";
    const workerResponse = await fetch(workerEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: { jobId } }) });
    assert.equal(workerResponse.ok, true, await workerResponse.text());
    const job = (await database.ref(basePath + "/importJobs/" + jobId + "/metadata").get()).val();
    assert.equal(job.status, "completed"); assert.ok(job.draftId);
    const draft = (await database.ref(basePath + "/authoring/drafts/" + job.draftId + "/metadata").get()).val();
    assert.equal(draft.status, "draft"); assert.equal(draft.createdByUid, uid); assert.ok(draft.expiresAt);

    const statusResult = await post(gatewayEndpoint, token, { requestId: "REQ-20260811-4102", idempotencyKey: "IDM-REQ-20260811-4102", command: "import.status", payload: { jobId } });
    assert.equal(statusResult.response.status, 200); assert.equal(statusResult.body.result.status, "completed"); assert.equal(statusResult.body.result.source, undefined);

    const expiredDate = "2026-08-10"; const cleanupNow = "2026-08-15T00:00:00.000Z";
    const updates = {};
    updates["importJobs/" + jobId + "/metadata/expiresAt"] = "2026-08-10T00:00:00.000Z";
    updates["authoring/drafts/" + job.draftId + "/metadata/expiresAt"] = "2026-08-10T00:00:00.000Z";
    updates["maintenance/expiryBuckets/" + expiredDate + "/importJobs/" + jobId] = true;
    updates["maintenance/expiryBuckets/" + expiredDate + "/drafts/" + job.draftId] = true;
    await database.ref(basePath).update(updates);
    const reader = createStoragePackageReader({ storage });
    const retentionStore = createRtdbRetentionStore({ database, projectId, databaseEmulatorHost: databaseHost, deleteSource: reader.deleteSource });
    const retention = createRetentionService({ store: retentionStore, policy: parseRetentionPolicy(process.env.GREENFIELD_RETENTION_POLICY_JSON), now: () => cleanupNow });
    const cleanup = await retention.run("RUN-INTEGRATION-4101");
    assert.equal(cleanup.deleted, 2);
    assert.equal((await database.ref(basePath + "/importJobs/" + jobId).get()).exists(), false);
    assert.equal((await database.ref(basePath + "/authoring/drafts/" + job.draftId).get()).exists(), false);

    const noToken = await fetch(gatewayEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(startEnvelope) });
    assert.equal(noToken.status, 401);
    const browserWrite = await fetch("http://" + databaseHost + "/" + basePath + "/authoring/drafts/browser.json?ns=" + namespace, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ forbidden: true }) });
    assert.ok([401, 403].includes(browserWrite.status));
    console.log("greenfield phase4.1 async gateway, task worker and retention emulator integration PASS");
  } finally { await database.ref(basePath).remove(); await deleteApp(app); }
}
main().catch(function (error) { console.error(error); process.exitCode = 1; });