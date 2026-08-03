const { test, expect } = require('@playwright/test');
const path = require('path');
const http = require('http');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '..');
let server;
let pageUrl;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const filePath = path.join(repoRoot, urlPath === '/' ? 'admin-erp.html' : urlPath.replace(/^\/+/, ''));
    if (!filePath.startsWith(repoRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': filePath.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8' });
    res.end(fs.readFileSync(filePath));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  pageUrl = `http://127.0.0.1:${server.address().port}/admin-erp.html?adminTestBypass=owner`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl);
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'dashboard');
});

test('Dashboard Screen 01 keeps aggregate charts and privacy-safe labels', async ({ page }) => {
  const main = page.locator('#page');
  await expect(main.locator('#website-analytics')).toBeVisible();
  await expect(main.locator('#booking-activity')).toBeVisible();
  await expect(main.locator('#finance-donuts')).toBeVisible();
  await expect(main.locator('#vehicle-driver-excel')).toBeVisible();
  await expect(main.locator('.chart-frame')).toHaveCount(2);
  await expect(main.locator('.chart-x-labels')).toHaveCount(2);
  await expect(main).toContainText('จำนวนผู้เยี่ยมชม (เว็บไซต์)');
  await expect(main).toContainText('ผู้ใช้งานจริง');
  await expect(main).toContainText('จำนวนการจอง');
  await expect(main).toContainText('จำนวนผู้โดยสาร');
  await expect(main).toContainText('จาก Booking Snapshot');
  await expect(main).not.toContainText('จำนวนครั้งเข้าเยี่ยมชม');
  await expect(main).not.toContainText('ผู้เยี่ยมชมโดยประมาณ');
  await expect(main).not.toContainText('55 บาท/คน');
  await expect(main).not.toContainText('5 บาท/การจอง');
});

test('Range changes reload Dashboard aggregate without stale UI crash', async ({ page }) => {
  const main = page.locator('#page');
  await expect(main.locator('[data-analytics-range]')).toHaveValue('daily');
  await main.locator('[data-analytics-range]').selectOption('monthly');
  await expect(main.locator('[data-analytics-range]')).toHaveValue('monthly');
  await expect(main.locator('[data-booking-range]')).toHaveValue('monthly');
  await main.locator('[data-booking-range]').selectOption('hourly');
  await expect(main.locator('[data-booking-range]')).toHaveValue('hourly');
  await expect(main.locator('[data-analytics-range]')).toHaveValue('hourly');
  await expect(main.locator('#website-analytics')).toBeVisible();
  await expect(main.locator('#booking-activity')).toBeVisible();
});

test('Sidebar and mobile drawer remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(pageUrl);
  await expect(page.locator('.nav button[data-page]')).toHaveCount(9);
  await page.locator('#toggleSidebar').click();
  await expect(page.locator('body')).toHaveClass(/nav-collapsed/);
  await page.locator('#toggleSidebar').click();
  await expect(page.locator('body')).not.toHaveClass(/nav-collapsed/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pageUrl);
  await page.locator('#toggleSidebar').click();
  await expect(page.locator('body')).toHaveClass(/nav-open/);
  await page.locator('#drawerOverlay').click();
  await expect(page.locator('body')).not.toHaveClass(/nav-open/);
});

test('Operational booking control UI is reachable on approved modules', async ({ page }) => {
  await page.locator('[data-page="today"]').click();
  await expect(page.locator('#page')).toContainText('ควบคุมการเปิดจอง');
  await expect(page.locator('#controlScopeType')).toBeVisible();
  await expect(page.locator('#publishCloseNow')).toBeVisible();
});
