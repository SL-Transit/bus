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

admin.auth().setCustomUserClaims(uid, {
  slTransitRole: "owner",
  slTransitPermissions: adminAuth.OWNER_PERMISSIONS
}).then(() => {
  console.log("Owner custom claims updated for UID:", uid);
}).catch((err) => {
  console.error("Failed to update owner custom claims:", err && err.message ? err.message : String(err));
  process.exit(1);
});

