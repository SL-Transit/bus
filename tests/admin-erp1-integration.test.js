'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'admin-erp1.html'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'admin-erp1-integration.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'admin-erp-firebase-config.js'), 'utf8');

if (!page.includes('admin-erp-data-adapter.js')) throw new Error('page must load the central adapter');
if (!page.includes('admin-erp-read-model.js')) throw new Error('page must load the Admin ERP read model');
if (!page.includes('admin-erp1-integration.js')) throw new Error('page must load the page integration bridge');
if (!page.includes('firebase-auth-compat.js')) throw new Error('page must load Firebase Auth for token acquisition');
if (!page.includes('admin-erp-firebase-config.js')) throw new Error('page must load the non-secret Firebase integration config');
if (!page.includes('config.signIn(email,password)')) throw new Error('page must submit credentials through the central auth config');
if (!page.includes('config.onAuthStateChanged')) throw new Error('page must wait for Firebase Auth state before opening ERP');
if (!page.includes('verifyAccess')) throw new Error('page must verify Admin ERP read access before opening ERP');
if (!page.includes('AdminErpDataSource.getAccess')) throw new Error('page must use the lightweight access read before loading ERP data');
if (!page.includes('admin_erp_read_permission_required')) throw new Error('page must expose backend authorization denial');
if (!page.includes('ACTIVE_PAGE_KEY')) throw new Error('page must preserve the active page across reloads');
if (!page.includes('visibilitychange')) throw new Error('page must retry access after the document becomes visible');
if (!page.includes('function handleAccessFailure')) throw new Error('page must not sign out on transient endpoint failures');
if (page.includes('ยังไม่ได้เชื่อมต่อระบบยืนยันตัวตนจริง กรุณาใช้ Preview Mode')) throw new Error('page must not keep the old forced preview login');
if (/firebase\.database|\.ref\s*\(/.test(page)) throw new Error('admin-erp1 must not call Firebase directly');
if (/routeData|publishedCatalog|settings\/routes|bus-booking-1d68c/.test(bridge)) throw new Error('integration bridge must not use legacy sources');
if (!config.includes('readAdminErpDataCenter')) throw new Error('config must point at the approved read endpoint');
if (config.includes('firebase.database(') || config.includes('.ref(')) throw new Error('config must not enable direct database access');
if (!config.includes('signInWithEmailAndPassword')) throw new Error('config must own Firebase Auth sign-in');
if (!config.includes('setSessionPersistence')) throw new Error('config must use session persistence for admin auth');
if (!config.includes('persistence.LOCAL')) throw new Error('admin auth must survive a browser tab being suspended');
if (!bridge.includes('ยังไม่เชื่อมต่อแหล่งข้อมูล')) throw new Error('disconnected state is required');
if (!bridge.includes('ไม่มีสิทธิ์เข้าถึง')) throw new Error('forbidden state is required');
if (!bridge.includes('อ่านอย่างเดียว')) throw new Error('read-only rendering is required');
if (!bridge.includes('sourceRowNumber')) throw new Error('read-only rows must preserve the original Excel row number');
if (!bridge.includes('แถว Excel')) throw new Error('read-only rows must display the original Excel row number');
if (!bridge.includes("document.addEventListener('DOMContentLoaded', startBridge")) throw new Error('integration bridge must wait for body readiness');

console.log('admin-erp1 integration contract: PASS');
