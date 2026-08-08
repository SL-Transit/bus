'use strict';

const ROLES = Object.freeze(['owner', 'admin', 'operations', 'finance', 'content_manager', 'viewer']);
const PERMISSIONS = Object.freeze(['read', 'edit', 'review', 'publish', 'rollback', 'manage_users', 'manage_settings']);
const ROLE_PERMISSIONS = Object.freeze({
  owner: PERMISSIONS.slice(), admin: ['read', 'edit', 'review', 'manage_settings'],
  operations: ['read', 'edit'], finance: ['read', 'edit', 'review'],
  content_manager: ['read', 'edit', 'review'], viewer: ['read']
});
const SAFE_CHILDREN = Object.freeze({ workbookSource: ['routeFareRows', 'scheduleRows', 'manifest', 'reconciliation'], fleet: ['vehicles', 'queues', 'assignmentRules'], meta: ['versions'] });
const ROLE_ROOTS = Object.freeze({
  owner: ['workbookSource', 'stops', 'routes', 'trips', 'stopTimes', 'fares', 'serviceGroups', 'paymentOwnership', 'fleet', 'meta'],
  admin: ['workbookSource', 'stops', 'routes', 'trips', 'stopTimes', 'fares', 'serviceGroups', 'paymentOwnership', 'fleet', 'meta'],
  operations: ['workbookSource', 'stops', 'routes', 'trips', 'stopTimes', 'serviceGroups', 'fleet'],
  finance: ['workbookSource', 'routes', 'fares', 'paymentOwnership', 'meta'],
  content_manager: ['workbookSource', 'stops', 'routes', 'serviceGroups'],
  viewer: ['workbookSource', 'stops', 'routes', 'trips', 'stopTimes', 'fares', 'serviceGroups']
});
const PRIVATE_KEYS = /^(phone|driverPhone|temporaryPhone|email|address|idCard|nationalId|passenger|driverLogs|tickets|bookings)/i;

function object(value) { return value && typeof value === 'object' ? value : {}; }
function normalizeAccount(account) {
  // This value is read by the backend from adminAccounts/{uid}; it is never accepted from the browser.
  if (account === true) return { roles: ['admin'], legacyBoolean: true };
  const value = object(account);
  const roles = Array.isArray(value.roles) ? value.roles : (value.role ? [value.role] : []);
  return { roles: roles.filter((role) => ROLES.includes(role)), legacyBoolean: false };
}
function accessFor(decodedToken, account) {
  const normalized = normalizeAccount(account);
  const permissions = [...new Set(normalized.roles.flatMap((role) => ROLE_PERMISSIONS[role] || []))];
  const roots = [...new Set(normalized.roles.flatMap((role) => ROLE_ROOTS[role] || []))];
  return { uid: decodedToken && decodedToken.uid || null, authenticated: Boolean(decodedToken && decodedToken.uid), roles: normalized.roles, permissions, roots, legacyBoolean: normalized.legacyBoolean, can(permission) { return permissions.includes(permission); } };
}
function stripPrivateFields(value) {
  if (Array.isArray(value)) return value.map(stripPrivateFields);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  Object.keys(value).forEach((key) => {
    if (PRIVATE_KEYS.test(key)) return;
    output[key] = stripPrivateFields(value[key]);
  });
  return output;
}
function sanitizeReadModel(root, access) {
  const source = object(root); const output = {};
  access.roots.forEach((rootName) => {
    if (source[rootName] == null) return;
    if (SAFE_CHILDREN[rootName]) {
      output[rootName] = {};
      SAFE_CHILDREN[rootName].forEach((child) => { if (source[rootName][child] != null) output[rootName][child] = stripPrivateFields(source[rootName][child]); });
    } else output[rootName] = stripPrivateFields(source[rootName]);
  });
  return output;
}
function workflowTransition(from, action, access, context) {
  const transitions = { draft: { validate: 'validating', submit_for_review: 'in_review' }, validating: { validation_passed: 'validated', validation_failed: 'draft' }, validated: { submit_for_review: 'in_review' }, in_review: { approve: 'approved', reject: 'rejected', request_changes: 'draft' }, approved: { publish: 'published' }, published: { rollback: 'rolled_back' }, rejected: { revise: 'draft' }, rolled_back: { revise: 'draft' } };
  const permission = ['approve', 'reject', 'request_changes'].includes(action) ? 'review' : ['validate', 'submit_for_review', 'revise'].includes(action) ? 'edit' : action;
  const ownerApproved = context && context.ownerApproved === true;
  const allowed = access && (access.can(permission) || (ownerApproved && ['publish', 'rollback'].includes(action) && access.can('review')));
  if (!allowed) return { allowed: false, code: 'permission_denied', from, action };
  if (['publish', 'rollback'].includes(action) && !access.roles.includes('owner') && !ownerApproved) return { allowed: false, code: 'owner_approval_required', from, action };
  if (!transitions[from] || !transitions[from][action]) return { allowed: false, code: 'invalid_workflow_transition', from, action };
  return { allowed: true, from, action, to: transitions[from][action] };
}
module.exports = { ROLES, PERMISSIONS, ROLE_PERMISSIONS, ROLE_ROOTS, normalizeAccount, accessFor, sanitizeReadModel, workflowTransition };
