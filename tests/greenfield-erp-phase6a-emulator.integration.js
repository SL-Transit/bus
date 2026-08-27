"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");
const testPackage = require("../contracts/greenfield-erp/v1/fixtures/valid-network-package.json");

const projectId = "demo-sl-transit-greenfield";
const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5002";
const namespace = projectId + "-default-rtdb";
const bucketName = projectId + ".appspot.com";
const basePath = "data/erpDataCenter";

async function signIn(email, password) {
  const response = await fetch(
    "http://" + authHost + "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );
  const text = await response.text();
  assert.equal(response.ok, true, text);
  return JSON.parse(text).idToken;
}

async function post(token, envelope) {
  const endpoint = "http://" + functionsHost + "/" + projectId + "/asia-southeast1/greenfieldErpCommand";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
      origin: "http://localhost:5000",
      "x-idempotency-key": envelope.idempotencyKey
    },
    body: JSON.stringify(envelope)
  });
  return { response, body: await response.json() };
}

function envelope(sequence, command, payload) {
  return {
    requestId: "REQ-20260811-" + sequence,
    idempotencyKey: "IDM-20260811-" + sequence,
    command,
    payload
  };
}

async function main() {
  assert.ok(databaseHost);
  assert.ok(authHost);
  assert.ok(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
  assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);

  const app = initializeApp({
    projectId,
    storageBucket: bucketName,
    databaseURL: "http://" + databaseHost + "?ns=" + namespace
  }, "greenfield-phase6a-emulator-test");
  const database = getDatabase(app);
  const auth = getAuth(app);
  const operatorUid = "phase6a-operator";
  const ownerUid = "phase6a-owner";
  const password = "DemoOnly-2026!";
  await database.ref(basePath).remove();

  try {
    await auth.createUser({ uid: operatorUid, email: "phase6a-operator@example.test", password });
    await auth.createUser({ uid: ownerUid, email: "phase6a-owner@example.test", password });
    await auth.setCustomUserClaims(operatorUid, { role: "operations" });
    await auth.setCustomUserClaims(ownerUid, { role: "admin" });
    await database.ref(basePath + "/access/accounts/" + operatorUid).set({
      active: true,
      allowedCommands: ["upload.authorize", "import.start", "import.status", "draft.read", "draft.save", "draft.validate", "draft.validation.status", "review.request"],
      resourceScopes: { operatorIds: ["OPR-BUS01"] }
    });
    await database.ref(basePath + "/access/accounts/" + ownerUid).set({
      active: true,
      allowedCommands: ["import.status", "approval.decide"],
      resourceScopes: { operatorIds: ["OPR-BUS01"] }
    });

    const operatorToken = await signIn("phase6a-operator@example.test", password);
    const ownerToken = await signIn("phase6a-owner@example.test", password);
    const bytes = Buffer.from(JSON.stringify(testPackage));
    const checksum = "sha256:" + crypto.createHash("sha256").update(bytes).digest("hex");
    const operatorScope = ["OPR-BUS01"];

    const authorizationResult = await post(operatorToken, envelope("6A01", "upload.authorize", {
      fileName: "network.json",
      contentType: "application/json",
      sizeBytes: bytes.length,
      checksumSha256: checksum,
      operatorScope
    }));
    assert.equal(authorizationResult.response.status, 200);
    assert.match(authorizationResult.body.result.uploadId, /^UPL-/);
    assert.equal(authorizationResult.body.result.source.objectPath.startsWith("erp-import-quarantine/" + operatorUid + "/"), true);

    const uploadClient = require("../admin-erp1-greenfield-api-client.js").createClient({
      getToken: async function () { return operatorToken; },
      uploadTransport: require("../admin-erp1-greenfield-api-client.js").createFetchUploadTransport({})
    });
    await uploadClient.upload(
      new Blob([bytes], { type: "application/json" }),
      authorizationResult.body.result.target
    );

    const startCommand = envelope("6A02", "import.start", {
      operatorScope,
      source: authorizationResult.body.result.source
    });
    const queued = await post(operatorToken, startCommand);
    assert.equal(queued.response.status, 202);
    assert.equal(queued.body.result.status, "queued");
    const repeatedQueue = await post(operatorToken, startCommand);
    assert.equal(repeatedQueue.response.status, 202);
    assert.equal(repeatedQueue.body.result.reused, true);
    const jobId = queued.body.result.jobId;

    const workerEndpoint = "http://" + functionsHost + "/" + projectId + "/asia-southeast1/greenfieldImportWorker";
    const workerResponse = await fetch(workerEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: { jobId } })
    });
    assert.equal(workerResponse.ok, true, await workerResponse.text());

    const status = await post(operatorToken, envelope("6A03", "import.status", { jobId }));
    assert.equal(status.response.status, 200);
    assert.equal(status.body.result.status, "completed");
    assert.ok(status.body.result.draftId);
    assert.equal(status.body.result.source, undefined);
    const draftId = status.body.result.draftId;

    const draftPage = await post(operatorToken, envelope("6A20", "draft.read", {
      draftId,
      expectedRevision: 1,
      operatorScope,
      entityType: "routes",
      limit: 25
    }));
    assert.equal(draftPage.response.status, 200);
    assert.equal(draftPage.body.result.entries.length, 2);
    assert.equal(draftPage.body.result.entries.some(function (entry) { return entry.entityId === "RTE-BUS01-0001"; }), true);
    assert.equal(Buffer.byteLength(JSON.stringify(draftPage.body.result.entries), "utf8") < 256 * 1024, true);

    const firstSave = await post(operatorToken, envelope("6A21", "draft.save", {
      draftId,
      expectedRevision: 1,
      operatorScope,
      changeSummary: "แก้ชื่อย่อสายรถก่อนส่งตรวจใหม่",
      operations: [{
        entityType: "routes",
        entityId: "RTE-BUS01-0001",
        value: { routeId: "RTE-BUS01-0001", operatorId: "OPR-BUS01", shortName: "F2", serviceMode: "fixed" }
      }]
    }));
    assert.equal(firstSave.response.status, 200);
    assert.equal(firstSave.body.result.revision, 2);
    assert.equal(firstSave.body.result.validationStatus, "required");

    const prematureReview = await post(operatorToken, envelope("6A22", "review.request", {
      draftId,
      expectedRevision: 2,
      operatorScope
    }));
    assert.equal(prematureReview.response.status, 409);
    assert.equal(prematureReview.body.code, "workflow_precondition_failed");

    const queuedValidation = await post(operatorToken, envelope("6A23", "draft.validate", {
      draftId,
      expectedRevision: 2,
      operatorScope
    }));
    assert.equal(queuedValidation.response.status, 202);
    assert.equal(queuedValidation.body.result.status, "queued");
    const validationJobId = queuedValidation.body.result.jobId;
    const validationWorkerEndpoint = "http://" + functionsHost + "/" + projectId + "/asia-southeast1/greenfieldDraftValidationWorker";
    const validationWorkerResponse = await fetch(validationWorkerEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: { jobId: validationJobId } })
    });
    const validationWorkerBody = await validationWorkerResponse.text();
    assert.equal(validationWorkerResponse.ok, true, validationWorkerBody);
    const validationStatus = await post(operatorToken, envelope("6A24", "draft.validation.status", { jobId: validationJobId }));
    assert.equal(validationStatus.response.status, 200);
    assert.equal(validationStatus.body.result.status, "completed");
    assert.equal(validationStatus.body.result.resultCode, "draft_valid");
    assert.equal(validationStatus.body.result.validation.errorCount, 0);

    const reviewCommand = envelope("6A04", "review.request", {
      draftId,
      expectedRevision: 2,
      operatorScope
    });
    const review = await post(operatorToken, reviewCommand);
    assert.equal(review.response.status, 200);
    assert.equal(review.body.result.status, "review_requested");
    assert.equal(review.body.result.revision, 3);
    const repeatedReview = await post(operatorToken, reviewCommand);
    assert.equal(repeatedReview.response.status, 200);
    assert.equal(repeatedReview.body.result.reused, true);
    assert.equal(repeatedReview.body.result.revision, 3);

    const selfApproval = await post(operatorToken, envelope("6A05", "approval.decide", {
      draftId,
      expectedRevision: 3,
      operatorScope,
      decision: "approve"
    }));
    assert.equal(selfApproval.response.status, 403);
    assert.equal(selfApproval.body.code, "coarse_role_denied");

    const rejection = await post(ownerToken, envelope("6A06", "approval.decide", {
      draftId,
      expectedRevision: 3,
      operatorScope,
      decision: "reject",
      comment: "กรุณาแก้ชื่อสายและส่งตรวจใหม่"
    }));
    assert.equal(rejection.response.status, 200);
    assert.equal(rejection.body.result.status, "rejected");
    assert.equal(rejection.body.result.revision, 4);

    const saveAfterReject = await post(operatorToken, envelope("6A25", "draft.save", {
      draftId,
      expectedRevision: 4,
      operatorScope,
      changeSummary: "แก้ Draft หลังได้รับความเห็นผู้อนุมัติ",
      operations: [{
        entityType: "routes",
        entityId: "RTE-BUS01-0001",
        value: { routeId: "RTE-BUS01-0001", operatorId: "OPR-BUS01", shortName: "F3", serviceMode: "fixed" }
      }]
    }));
    assert.equal(saveAfterReject.response.status, 200);
    assert.equal(saveAfterReject.body.result.revision, 5);
    assert.equal(saveAfterReject.body.result.validationStatus, "required");

    const secondValidation = await post(operatorToken, envelope("6A26", "draft.validate", {
      draftId,
      expectedRevision: 5,
      operatorScope
    }));
    assert.equal(secondValidation.response.status, 202);
    const secondWorkerResponse = await fetch(validationWorkerEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: { jobId: secondValidation.body.result.jobId } })
    });
    const secondWorkerBody = await secondWorkerResponse.text();
    assert.equal(secondWorkerResponse.ok, true, secondWorkerBody);
    const secondValidationStatus = await post(operatorToken, envelope("6A27", "draft.validation.status", {
      jobId: secondValidation.body.result.jobId
    }));
    assert.equal(secondValidationStatus.body.result.resultCode, "draft_valid");

    const secondReview = await post(operatorToken, envelope("6A28", "review.request", {
      draftId,
      expectedRevision: 5,
      operatorScope
    }));
    assert.equal(secondReview.response.status, 200);
    assert.equal(secondReview.body.result.revision, 6);

    const approval = await post(ownerToken, envelope("6A29", "approval.decide", {
      draftId,
      expectedRevision: 6,
      operatorScope,
      decision: "approve",
      comment: "owner approval after correction"
    }));
    assert.equal(approval.response.status, 200);
    assert.equal(approval.body.result.status, "approved");
    assert.equal(approval.body.result.revision, 7);

    const approvedMetadata = (await database.ref(basePath + "/authoring/drafts/" + draftId + "/metadata").get()).val();
    assert.equal(approvedMetadata.status, "approved");
    assert.equal(approvedMetadata.approval.decidedByUid, ownerUid);
    assert.equal(approvedMetadata.revision, 7);
    assert.equal(approvedMetadata.lastValidationJobId, secondValidation.body.result.jobId);

    const events = (await database.ref(basePath + "/audit/events").get()).val() || {};
    const eventTypes = Object.values(events).map(function (event) { return event.eventType; });
    assert.ok(eventTypes.includes("upload.authorized"));
    assert.ok(eventTypes.includes("draft.created"));
    assert.ok(eventTypes.includes("review.requested"));
    assert.ok(eventTypes.includes("approval.approved"));
    assert.ok(eventTypes.includes("approval.rejected"));
    assert.ok(eventTypes.includes("draft.validation.valid"));
    assert.ok(eventTypes.includes("draft.saved"));
    assert.equal((await database.ref("publishedReadModels/current").get()).exists(), false);

    const browserWrite = await fetch(
      "http://" + databaseHost + "/" + basePath + "/authoring/drafts/browser.json?ns=" + namespace +
        "&auth=" + encodeURIComponent(operatorToken),
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ forbidden: true })
      }
    );
    const browserWriteBody = await browserWrite.text();
    assert.equal(browserWrite.ok, false, "direct RTDB write unexpectedly succeeded: " + browserWrite.status + " " + browserWriteBody);
    assert.equal((await database.ref(basePath + "/authoring/drafts/browser").get()).exists(), false);

    console.log("greenfield Phase 6A.1 Draft edit, revalidation, Reject and approval emulator integration PASS");
  } finally {
    await database.ref(basePath).remove();
    await deleteApp(app);
  }
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});