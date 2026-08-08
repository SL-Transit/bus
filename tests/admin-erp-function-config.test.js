'use strict';

const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync('functions/index.js', 'utf8');

assert.match(source, /const ERP_DATA_CENTER_DATABASE_URL\s*=\s*["']https:\/\/sl-transit-9464e-default-rtdb\.asia-southeast1\.firebasedatabase\.app["']/);
assert.match(source, /admin\.initializeApp\(\{\s*databaseURL:\s*process\.env\.FUNCTIONS_EMULATOR === "true" \? EMULATOR_DATABASE_URL : ERP_DATA_CENTER_DATABASE_URL\s*\}\)/);
assert.match(source, /exports\.readAdminErpDataCenter/);
console.log('admin erp function database config: PASS');
