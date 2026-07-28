"use strict";

const admin = require("firebase-admin");
const adminAuth = require("../functions/admin-auth.js");

const uid = process.argv[2] || process.env.OWNER_UID;
if (!uid) {
  console.error("Usage: node scripts/set-admin-claims.js <OWNER_UID>");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || "sl-transit-9464e"
  });
}

admin.auth().getUser(uid).then((user) => {
  const existing = Object.assign({}, user.customClaims || {});
  const mergedPermissions = Array.from(new Set([].concat(existing.slTransitPermissions || [], adminAuth.OWNER_PERMISSIONS)));
  return admin.auth().setCustomUserClaims(uid, Object.assign({}, existing, {
    slTransitRole: "owner",
    slTransitPermissions: mergedPermissions
  }));
}).then(() => {
  console.log("Owner custom claims updated for UID:", uid);
}).catch((err) => {
  console.error("Failed to update owner custom claims:", err && err.message ? err.message : String(err));
  process.exit(1);
});
