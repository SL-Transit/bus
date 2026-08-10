"use strict";

const COMMAND_POLICIES = Object.freeze({
  "import.validate": Object.freeze({ roles: Object.freeze(["admin", "operations"]), operatorScoped: true }),
  "draft.save": Object.freeze({ roles: Object.freeze(["admin", "operations"]), operatorScoped: true }),
  "review.request": Object.freeze({ roles: Object.freeze(["admin", "operations"]), operatorScoped: true }),
  "approval.decide": Object.freeze({ roles: Object.freeze(["admin"]), operatorScoped: true })
});

function authorizationError(code) {
  const error = new Error(code);
  error.code = code;
  error.httpStatus = code === "unauthenticated" ? 401 : 403;
  return error;
}

function safeUid(uid) {
  return typeof uid === "string" && uid.length > 0 && uid.length <= 128 && !/[.#$[\]/]/.test(uid);
}

function packageOperatorIds(payload) {
  const pkg = payload && payload.package;
  const values = pkg && pkg.metadata && Array.isArray(pkg.metadata.operatorScope)
    ? pkg.metadata.operatorScope
    : [];
  return Array.from(new Set(values.filter(function (value) { return typeof value === "string" && value.length > 0; })));
}

function hasOperatorScope(account, operatorIds) {
  const configured = account && account.resourceScopes && account.resourceScopes.operatorIds;
  if (!Array.isArray(configured) || configured.length === 0) return false;
  if (configured.includes("*")) return true;
  return operatorIds.length > 0 && operatorIds.every(function (operatorId) { return configured.includes(operatorId); });
}

async function authorizeCommand(input) {
  const options = input || {};
  const policy = COMMAND_POLICIES[options.command];
  if (!safeUid(options.uid) || typeof options.role !== "string") throw authorizationError("unauthenticated");
  if (!policy) throw authorizationError("command_not_allowed");
  if (!policy.roles.includes(options.role)) throw authorizationError("coarse_role_denied");
  if (!options.accessReader || typeof options.accessReader.getAccount !== "function") {
    throw new Error("greenfield_access_reader_required");
  }

  const account = await options.accessReader.getAccount(options.uid);
  if (!account || account.active !== true) throw authorizationError("account_inactive_or_missing");
  const allowedCommands = Array.isArray(account.allowedCommands) ? account.allowedCommands : [];
  if (!allowedCommands.includes(options.command)) throw authorizationError("fine_permission_denied");
  if (policy.operatorScoped && !hasOperatorScope(account, packageOperatorIds(options.payload))) {
    throw authorizationError("operator_scope_denied");
  }

  return Object.freeze({ uid: options.uid, role: options.role, account });
}

module.exports = {
  COMMAND_POLICIES,
  authorizeCommand,
  hasOperatorScope,
  packageOperatorIds,
  safeUid
};