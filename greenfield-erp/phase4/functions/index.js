"use strict";

const crypto = require("node:crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabaseWithUrl } = require("firebase-admin/database");
const { getStorage } = require("firebase-admin/storage");

const { assertDemoDatabaseEmulator } = require("../../phase2/environment-guard.js");
const { createValidatedDraft } = require("../../phase2/draft-service.js");
const { createRtdbEmulatorDraftStore } = require("../../phase2/rtdb-emulator-draft-store.js");
const { createCommandGateway } = require("../command-gateway.js");
const { createFirebaseHttpHandler } = require("../http-handler.js");
const { createImportJobService } = require("../import-job-service.js");
const { createRtdbAccessReader } = require("../rtdb-access-reader.js");
const { createRtdbImportJobStore } = require("../rtdb-import-job-store.js");
const { createRtdbRetentionStore } = require("../rtdb-retention-store.js");
const { createRetentionService } = require("../retention-service.js");
const { parseRetentionPolicy } = require("../retention-policy.js");
const { createStoragePackageReader } = require("../storage-package-reader.js");
const { createDraftWorkflowService } = require("../../phase6a/draft-workflow-service.js");
const { createRtdbDraftWorkflowStore } = require("../../phase6a/rtdb-draft-workflow-store.js");
const { createRtdbUploadAuthorizationStore } = require("../../phase6a/rtdb-upload-authorization-store.js");
const { createUploadAuthorizationService } = require("../../phase6a/upload-authorization-service.js");

const GATEWAY_OPTIONS = Object.freeze({ region: "asia-southeast1", minInstances: 0, maxInstances: 3, concurrency: 10, timeoutSeconds: 30, memory: "256MiB", cors: false });
const WORKER_OPTIONS = Object.freeze({
  region: "asia-southeast1", minInstances: 0, maxInstances: 2, concurrency: 1,
  timeoutSeconds: 540, memory: "512MiB",
  retryConfig: { maxAttempts: 5, minBackoffSeconds: 30, maxBackoffSeconds: 300, maxRetrySeconds: 3600 },
  rateLimits: { maxConcurrentDispatches: 2 }
});
const CLEANUP_OPTIONS = Object.freeze({ schedule: "every 24 hours", timeZone: "Asia/Bangkok", region: "asia-southeast1", minInstances: 0, maxInstances: 1, concurrency: 1, timeoutSeconds: 120, memory: "256MiB" });

function configuredProjectId() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  try { return JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId || ""; } catch (_error) { return ""; }
}
function allowedOrigins() { const value = process.env.GREENFIELD_ALLOWED_ORIGINS; return value ? value.split(",").map(function (item) { return item.trim(); }).filter(Boolean) : ["http://127.0.0.1:5000", "http://localhost:5000"]; }
function systemRunId(value) { return "RUN-" + crypto.createHash("sha256").update(String(value), "utf8").digest("hex").slice(0, 24).toUpperCase(); }
function buildEmulatorUploadTarget(input) {
  const origin = "http://" + process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  return {
    url: origin + "/v0/b/" + encodeURIComponent(input.bucket) + "/o?name=" + encodeURIComponent(input.objectPath),
    method: "POST",
    uploadProtocol: "storage-multipart-v1",
    objectPath: input.objectPath,
    objectContentType: input.contentType,
    headers: { "x-goog-upload-protocol": "multipart" }
  };
}

const projectId = configuredProjectId();
const databaseEmulatorHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
assertDemoDatabaseEmulator({ projectId, databaseEmulatorHost });
if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) throw new Error("greenfield_storage_emulator_required");
const demoRetentionPolicy = Object.freeze({
  importJobRetentionHours: 24,
  abandonedDraftRetentionDays: 30,
  cleanupStartDate: "2026-08-01",
  batchSize: 50,
  maxDaysPerRun: 31,
  leaseSeconds: 60
});
const retentionPolicy = parseRetentionPolicy(process.env.GREENFIELD_RETENTION_POLICY_JSON || demoRetentionPolicy);
const appName = "greenfield-phase4-command-gateway";
const databaseUrl = "https://" + projectId + "-default-rtdb.firebaseio.com";
const existingApp = getApps().find(function (candidate) { return candidate.name === appName; });
const app = existingApp || initializeApp({ projectId, storageBucket: projectId + ".appspot.com", databaseURL: databaseUrl }, appName);
const database = getDatabaseWithUrl(databaseUrl, app);
const storageReader = createStoragePackageReader({ storage: getStorage(app) });
const draftStore = createRtdbEmulatorDraftStore({ database, projectId, databaseEmulatorHost });
const accessReader = createRtdbAccessReader({ database, projectId, databaseEmulatorHost });
const jobStore = createRtdbImportJobStore({ database, projectId, databaseEmulatorHost });
const uploadAuthorizationStore = createRtdbUploadAuthorizationStore({ database, projectId, databaseEmulatorHost });
const importJobService = createImportJobService({
  jobStore,
  packageReader: storageReader,
  draftStore,
  retentionPolicy,
  createValidatedDraft,
  uploadAuthorizationStore
});
const uploadAuthorizationService = createUploadAuthorizationService({
  store: uploadAuthorizationStore,
  bucketName: projectId + ".appspot.com",
  buildUploadTarget: buildEmulatorUploadTarget
});
const workflowStore = createRtdbDraftWorkflowStore({ database, projectId, databaseEmulatorHost });
const workflowService = createDraftWorkflowService({ store: workflowStore });
const gateway = createCommandGateway({
  importJobService,
  accessReader,
  uploadAuthorizationService,
  workflowService
});
const handler = createFirebaseHttpHandler({ gateway, allowedOrigins: allowedOrigins(), verifyIdToken: function (token) { return getAuth(app).verifyIdToken(token); } });
const retentionStore = createRtdbRetentionStore({ database, projectId, databaseEmulatorHost, deleteSource: storageReader.deleteSource });
const retentionService = createRetentionService({ store: retentionStore, policy: retentionPolicy });

exports.greenfieldErpCommand = onRequest(GATEWAY_OPTIONS, handler);
exports.greenfieldImportWorker = onTaskDispatched(WORKER_OPTIONS, async function (request) {
  const data = request && request.data || {};
  const result = await importJobService.process(data.jobId, systemRunId(request && request.id || data.jobId));
  console.info("greenfield_import_worker_result", { jobId: data.jobId || null, status: result.status, reused: result.reused === true });
  return result;
});
exports.greenfieldRetentionCleanup = onSchedule(CLEANUP_OPTIONS, async function (event) {
  return retentionService.run(systemRunId(event && event.id || new Date().toISOString()));
});