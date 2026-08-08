'use strict';

const fs = require('fs');
const page = fs.readFileSync('admin-erp1.html', 'utf8');
const bridge = fs.readFileSync('admin-erp1-integration.js', 'utf8');
const config = fs.readFileSync('admin-erp-firebase-config.js', 'utf8');

if (!page.includes('admin-erp-data-adapter.js')) throw new Error('page must load the central adapter');
if (!page.includes('admin-erp-read-model.js')) throw new Error('page must load the Admin ERP read model');
if (!page.includes('admin-erp1-integration.js')) throw new Error('page must load the page integration bridge');
if (!page.includes('firebase-auth-compat.js')) throw new Error('page must load Firebase Auth for token acquisition');
if (!page.includes('admin-erp-firebase-config.js')) throw new Error('page must load the non-secret Firebase integration config');
if (/firebase\.database|\.ref\s*\(/.test(page)) throw new Error('admin-erp1 must not call Firebase directly');
if (/routeData|publishedCatalog|settings\/routes|bus-booking-1d68c/.test(bridge)) throw new Error('integration bridge must not use legacy sources');
if (!config.includes('readAdminErpDataCenter')) throw new Error('config must point at the approved read endpoint');
if (/databaseURL|firebase\.database|\.ref\s*\(/.test(config)) throw new Error('config must not enable direct database access');
if (!bridge.includes('ยังไม่เชื่อมต่อแหล่งข้อมูล')) throw new Error('disconnected state is required');
if (!bridge.includes('ไม่มีสิทธิ์เข้าถึง')) throw new Error('forbidden state is required');
if (!bridge.includes('อ่านอย่างเดียว')) throw new Error('read-only rendering is required');

console.log('admin-erp1 integration contract: PASS');
