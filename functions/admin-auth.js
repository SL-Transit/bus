"use strict";

const OWNER_ROLE = "owner";
const OWNER_PERMISSIONS = new Set([
  "adminDashboardRead",
  "bookingManage",
  "bookingCancel",
  "refundReview",
  "refundApprove",
  "refundComplete",
  "auditRead"
]);

function bearerToken(req) {
  const header = String((req && req.headers && (req.headers.authorization || req.headers.Authorization)) || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function permissionsFromClaims(claims) {
  const list = Array.isArray(claims && claims.slTransitPermissions) ? claims.slTransitPermissions : [];
  const out = new Set(list.map(String));
  if (claims && claims.slTransitRole === OWNER_ROLE) {
    OWNER_PERMISSIONS.forEach((permission) => out.add(permission));
  }
  return out;
}

function hasPermission(claims, permission) {
  return permissionsFromClaims(claims).has(permission);
}

async function requireAdmin(req, admin, permission) {
  const token = bearerToken(req);
  if (!token) {
    const err = new Error("auth_required");
    err.httpStatus = 401;
    throw err;
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (e) {
    const err = new Error("invalid_token");
    err.httpStatus = 401;
    throw err;
  }
  if (!decoded || !hasPermission(decoded, permission)) {
    const err = new Error("permission_denied");
    err.httpStatus = 403;
    err.uid = decoded && decoded.uid;
    throw err;
  }
  return {
    uid: decoded.uid,
    role: decoded.slTransitRole || "",
    permissions: Array.from(permissionsFromClaims(decoded))
  };
}

async function requireAuthenticated(req, admin) {
  const token = bearerToken(req);
  if (!token) {
    const err = new Error("auth_required");
    err.httpStatus = 401;
    throw err;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      role: decoded.slTransitRole || "passenger",
      permissions: Array.from(permissionsFromClaims(decoded))
    };
  } catch (e) {
    const err = new Error("invalid_token");
    err.httpStatus = 401;
    throw err;
  }
}

function safeAuthError(err) {
  const status = err && err.httpStatus || 500;
  const error = status === 401 ? (err.message === "auth_required" ? "auth_required" : "invalid_token") :
    (status === 403 ? "permission_denied" : "auth_unavailable");
  return { status, body: { status: "error", error } };
}

module.exports = {
  OWNER_PERMISSIONS: Array.from(OWNER_PERMISSIONS),
  bearerToken,
  permissionsFromClaims,
  hasPermission,
  requireAuthenticated,
  requireAdmin,
  safeAuthError
};
