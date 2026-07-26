const { test, expect } = require('@playwright/test');
const path = require('path');

const pageUrl = 'file:///' + path.resolve(__dirname, '..', 'admin-erp.html').replace(/\\/g, '/');

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl);
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'dashboard');
});

test('Dashboard renders without screenshot assets', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'แดชบอร์ดศูนย์ควบคุม' })).toBeVisible();
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
