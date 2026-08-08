'use strict';

const assert = require('assert');

const AUTH_BASE = process.env.ADMIN_ERP_AUTH_EMULATOR || 'http://127.0.0.1:9099';
const DATABASE_BASE = process.env.ADMIN_ERP_DATABASE_EMULATOR || 'http://127.0.0.1:9000';
const FUNCTION_URL = process.env.ADMIN_ERP_FUNCTION_EMULATOR || 'http://127.0.0.1:5001/demo-sl-transit/asia-southeast1/readAdminErpDataCenter';
const DATABASE_NAMESPACE = process.env.ADMIN_ERP_DATABASE_NAMESPACE || 'demo-sl-transit';
const ORIGIN = 'http://127.0.0.1:5173';

async function request(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = text;
  try { body = text ? JSON.parse(text) : null; } catch (error) { /* keep text */ }
  return { status: response.status, body };
}

async function createUser(label) {
  const email = `admin-erp-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  const result = await request(`${AUTH_BASE}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-sl-transit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!', returnSecureToken: true })
  });
  assert.strictEqual(result.status, 200, `สร้างผู้ใช้จำลองไม่สำเร็จ: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function grantLegacyAdmin(user) {
  const url = `${DATABASE_BASE}/data/erpDataCenter/adminAccounts/${encodeURIComponent(user.localId)}.json?ns=${encodeURIComponent(DATABASE_NAMESPACE)}`;
  const result = await request(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.idToken}` },
    body: 'true'
  });
  assert.strictEqual(result.status, 200, `กำหนดสิทธิ์ผู้ดูแลในตัวจำลองไม่สำเร็จ: ${JSON.stringify(result.body)}`);
}

async function callRead(token, scope) {
  const headers = { Origin: ORIGIN };
  if (token) headers.Authorization = `Bearer ${token}`;
  return request(`${FUNCTION_URL}${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`, { method: 'GET', headers });
}

async function main() {
  const admin = await createUser('owner');
  await grantLegacyAdmin(admin);
  const normal = await createUser('viewer-without-account');

  const noToken = await callRead('');
  assert.strictEqual(noToken.status, 401);
  assert.strictEqual(noToken.body.error, 'admin_token_required');

  const nonAdmin = await callRead(normal.idToken);
  assert.strictEqual(nonAdmin.status, 403);
  assert.strictEqual(nonAdmin.body.error, 'admin_erp_read_permission_required');

  const adminRead = await callRead(admin.idToken);
  assert.strictEqual(adminRead.status, 200);
  assert.strictEqual(adminRead.body.status, 'ready');
  assert.strictEqual(adminRead.body.path, 'data/erpDataCenter');
  assert.strictEqual(adminRead.body.permissions.includes('read'), true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(adminRead.body.erpDataCenter, 'adminAccounts'), false);

  const accessRead = await callRead(admin.idToken, 'access');
  assert.strictEqual(accessRead.status, 200);
  assert.strictEqual(accessRead.body.path, 'data/erpDataCenter/meta/access');
  assert.deepStrictEqual(accessRead.body.erpDataCenter, {});

  const scopedStops = await callRead(admin.idToken, 'stops');
  assert.strictEqual(scopedStops.status, 200);
  assert.strictEqual(scopedStops.body.path, 'data/erpDataCenter/stops');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(scopedStops.body.erpDataCenter, 'routes'), false);

  const unsupportedScope = await callRead(admin.idToken, 'bookings');
  assert.strictEqual(unsupportedScope.status, 400);
  assert.strictEqual(unsupportedScope.body.error, 'unsupported_erp_read_scope');

  const update = await request('http://127.0.0.1:5001/demo-sl-transit/asia-southeast1/updateAdminErpDataCenter', {
    method: 'POST',
    headers: { Origin: ORIGIN, Authorization: `Bearer ${admin.idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates: { 'data/erpDataCenter/stops/demo/name': 'ไม่ควรถูกเขียน' } })
  });
  assert.strictEqual(update.status, 409);
  assert.strictEqual(update.body.error, 'draft_workflow_required');
  assert.strictEqual(update.body.productionWrite, false);

  console.log('admin erp function emulator: PASS');
  console.log('no token: 401; non-admin: 403; admin read: 200; direct production update: blocked');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
