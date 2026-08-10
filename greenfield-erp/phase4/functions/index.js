"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");

const { assertDemoDatabaseEmulator } = require("../../phase2/environment-guard.js");
const { createRtdbEmulatorDraftStore } = require("../../phase2/rtdb-emulator-draft-store.js");
const { createCommandGateway } = require("../command-gateway.js");
const { createFirebaseHttpHandler } = require("../http-handler.js");
const { createRtdbAccessReader } = require("../rtdb-access-reader.js");

const FUNCTION_OPTIONS = Object.freeze({
  region: "asia-southeast1",
  minInstances: 0,
  maxInstances: 3,
  concurrency: 10,
  timeoutSeconds: 30,
  memory: "256MiB",
  cors: false
});

function configuredProjectId() {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  try { return JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId || ""; }
  catch (_error) { return ""; }
}

function allowedOrigins() {
  const configured = process.env.GREENFIELD_ALLOWED_ORIGINS;
  if (!configured) return ["http://127.0.0.1:5000", "http://localhost:5000"];
  return configured.split(",").map(function (value) { return value.trim(); }).filter(Boolean);
}

const projectId = configuredProjectId();
const databaseEmulatorHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
assertDemoDatabaseEmulator({ projectId, databaseEmulatorHost });

const appName = "greenfield-phase4-command-gateway";
const existingApp = getApps().find(function (candidate) { return candidate.name === appName; });
const app = existingApp || initializeApp({
  projectId,
  databaseURL: "http://" + databaseEmulatorHost + "?ns=" + projectId + "-default-rtdb"
}, appName);
const database = getDatabase(app);
const draftStore = createRtdbEmulatorDraftStore({ database, projectId, databaseEmulatorHost });
const accessReader = createRtdbAccessReader({ database, projectId, databaseEmulatorHost });
const gateway = createCommandGateway({ draftStore, accessReader });
const handler = createFirebaseHttpHandler({
  gateway,
  allowedOrigins: allowedOrigins(),
  verifyIdToken: function (token) { return getAuth(app).verifyIdToken(token); }
});

exports.greenfieldErpCommand = onRequest(FUNCTION_OPTIONS, handler);