const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const pageUrl = 'file:///' + path.join(repoRoot, 'admin-erp.html').replace(/\\/g, '/');

async function mockDashboard(page, raw) {
  await page.evaluate((input) => {
    window.SLTransit.screen01ReadModel.load = (_db, options) => Promise.resolve(
      window.SLTransit.screen01ReadModel.build(input, options)
    );
  }, raw);
  await page.getByRole('button', { name: 'รีเฟรช' }).click();
}

function sources(overrides) {
  return {
    sources: Object.assign({
      bookings: { status: 'empty', path: 'operations/bookings', value: {} },
      liveVehicles: { status: 'empty', path: 'operations/liveVehicles', value: {} },
      driverWork: { status: 'empty', path: 'operations/driverWorkByServiceDate/2026-07-26', value: {} },
      notificationEvents: { status: 'empty', path: 'operations/notificationEvents', value: {} },
      erpAudit: { status: 'empty', path: 'data/erpDataCenter/meta/audit', value: {} },
    }, overrides),
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl);
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'dashboard');
});

test('Dashboard renders without screenshot assets', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'แดชบอร์ดศูนย์ควบคุม' })).toBeVisible();
  await expect(page.getByText('การเชื่อมต่อข้อมูลกลาง')).toBeVisible();
  await expect(page.locator('#operationsMap')).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('4,238');
});

test('Sidebar routes are clickable and ERP workbook remains accessible', async ({ page }) => {
  await page.getByRole('button', { name: 'จัดการข้อมูล ERP' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'workbook');
  await expect(page.getByText('ERP workbook sheets')).toBeVisible();
  await page.getByRole('button', { name: 'การจอง' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'bookings');
  await expect(page.getByText('ยังอยู่ระหว่างพัฒนา')).toBeVisible();
});

test('Service date and refresh reload Dashboard adapters', async ({ page }) => {
  const before = Number(await page.locator('body').getAttribute('data-dashboard-reload-count'));
  await page.locator('#serviceDate').fill('2026-07-27');
  await page.locator('#serviceDate').dispatchEvent('change');
  await expect(page.locator('body')).toHaveAttribute('data-service-date', '2026-07-27');
  const afterDate = Number(await page.locator('body').getAttribute('data-dashboard-reload-count'));
  expect(afterDate).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'รีเฟรช' }).click();
  const afterRefresh = Number(await page.locator('body').getAttribute('data-dashboard-reload-count'));
  expect(afterRefresh).toBeGreaterThan(afterDate);
});

test('OSM map loads and missing GPS is explicit', async ({ page }) => {
  await expect(page.locator('#operationsMap')).toHaveClass(/leaflet-container/);
  await expect(page.locator('#mapEmpty')).toContainText(/ไม่มีข้อมูล|ยังไม่มีตำแหน่งรถจริง/);
});

test('Search Enter does not open legacy hidden audit page', async ({ page }) => {
  await page.locator('#adminSearch').fill('BK test');
  await page.locator('#adminSearch').press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'dashboard');
});

test('Proposed empty Booking source remains visibly unconfirmed', async ({ page }) => {
  await mockDashboard(page, { bookings: {}, liveVehicles: {}, driverWork: {}, notificationEvents: {}, erpAudit: {} });
  await expect(page.getByText('รอยืนยันแหล่งข้อมูล - ยังไม่มีรายการที่อ่านพบ').first()).toBeVisible();
  await expect(page.getByText('จาก operations/bookings query ตามวันที่')).toHaveCount(0);
});

test('Running vehicle KPI uses Driver Work unavailable state', async ({ page }) => {
  await mockDashboard(page, sources({
    liveVehicles: { status: 'proposed', path: 'operations/liveVehicles', value: { car1: { vehicleId: 'car1', lat: 13.1, lng: 101.1, gpsTimestamp: Date.now() } } },
    driverWork: { status: 'unavailable', path: 'operations/driverWorkByServiceDate/2026-07-26', value: {} },
  }));
  await expect(page.locator('.kpi-card').filter({ hasText: 'รถที่กำลังวิ่ง' })).toContainText('ยังไม่ได้เชื่อมต่อ');
});

test('Running vehicle KPI uses Driver Work error state', async ({ page }) => {
  await mockDashboard(page, sources({
    liveVehicles: { status: 'proposed', path: 'operations/liveVehicles', value: { car1: { vehicleId: 'car1', lat: 13.1, lng: 101.1, gpsTimestamp: Date.now() } } },
    driverWork: { status: 'error', path: 'operations/driverWorkByServiceDate/2026-07-26', value: {}, error: 'permission denied' },
  }));
  await expect(page.locator('.kpi-card').filter({ hasText: 'รถที่กำลังวิ่ง' })).toContainText('อ่านข้อมูลไม่ได้');
});

test('GPS panel uses Live GPS unavailable state', async ({ page }) => {
  await mockDashboard(page, sources({
    liveVehicles: { status: 'unavailable', path: 'operations/liveVehicles', value: {} },
    driverWork: { status: 'proposed', path: 'operations/driverWorkByServiceDate/2026-07-26', value: { car1: { contractVersion: 'driver_work_v1', vehicleId: 'car1', status: 'assigned', currentTrip: { queueTripId: 'qt1' } } } },
  }));
  await expect(page.getByText('คุณภาพ GPS').locator('..')).toContainText('ยังไม่ได้เชื่อมต่อ');
});

test('GPS panel uses Live GPS error state', async ({ page }) => {
  await mockDashboard(page, sources({
    liveVehicles: { status: 'error', path: 'operations/liveVehicles', value: {}, error: 'permission denied' },
    driverWork: { status: 'proposed', path: 'operations/driverWorkByServiceDate/2026-07-26', value: { car1: { contractVersion: 'driver_work_v1', vehicleId: 'car1', status: 'assigned', currentTrip: { queueTripId: 'qt1' } } } },
  }));
  await expect(page.getByText('คุณภาพ GPS').locator('..')).toContainText('อ่านข้อมูลไม่ได้');
});

test('Live GPS readable with Driver Work error keeps GPS connection readable', async ({ page }) => {
  await mockDashboard(page, sources({
    liveVehicles: { status: 'proposed', path: 'operations/liveVehicles', value: { car1: { vehicleId: 'car1', lat: 13.1, lng: 101.1, gpsTimestamp: Date.now() } } },
    driverWork: { status: 'error', path: 'operations/driverWorkByServiceDate/2026-07-26', value: {}, error: 'permission denied' },
  }));
  await expect(page.locator('.health-row').filter({ hasText: 'GPS' })).toContainText('เชื่อมต่อบางส่วน');
  await expect(page.locator('.health-row').filter({ hasText: 'Driver App' })).toContainText('อ่านข้อมูลไม่ได้');
});

test('Partial activity displays readable rows and partial notice', async ({ page }) => {
  await mockDashboard(page, sources({
    notificationEvents: { status: 'proposed', path: 'operations/notificationEvents', value: { ev1: { message: 'activity row visible', at: '2026-07-26T09:00:00+07:00', actor: 'ระบบ' } } },
    erpAudit: { status: 'unavailable', path: 'data/erpDataCenter/meta/audit', value: {} },
  }));
  await expect(page.getByText('activity row visible')).toBeVisible();
  await expect(page.getByText('เชื่อมต่อบางส่วน').last()).toBeVisible();
});

test('No Firebase writes and incident quick action routes to blackbox', async ({ page }) => {
  const html = fs.readFileSync(path.join(repoRoot, 'admin-erp.html'), 'utf8');
  const readModel = fs.readFileSync(path.join(repoRoot, 'screen01-central-read-model.js'), 'utf8');
  const firebaseWritePattern = /\.ref\([^)]*\)\s*\.\s*(set|update|push|remove)\s*\(/;

  expect(html).not.toMatch(firebaseWritePattern);
  expect(readModel).not.toMatch(firebaseWritePattern);

  await page.getByRole('button', { name: 'เปิดศูนย์เหตุขัดข้อง' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'blackbox');
  await expect(page.getByText('ยังอยู่ระหว่างพัฒนา')).toBeVisible();
});
