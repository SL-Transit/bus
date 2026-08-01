const { test, expect } = require('@playwright/test');
const fs = require('fs');
const http = require('http');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
let server;
let pageUrl;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const safePath = path.normalize(urlPath === '/' ? '/admin-erp.html' : urlPath).replace(/^(\.\.[\\/])+/, '');
    const filePath = path.join(repoRoot, safePath);
    if (!filePath.startsWith(repoRoot) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', ext === '.html' ? 'text/html; charset=utf-8' : (ext === '.js' ? 'application/javascript; charset=utf-8' : 'text/plain; charset=utf-8'));
    res.end(fs.readFileSync(filePath));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  pageUrl = `http://127.0.0.1:${server.address().port}/admin-erp.html`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__SL_TRANSIT_ADMIN_AUTH_TEST__ = true;
    window.SL_TRANSIT_FIREBASE_WEB_CONFIG = {
      apiKey: 'test-web-api-key',
      authDomain: 'sl-transit-9464e.firebaseapp.com',
      databaseURL: 'https://sl-transit-9464e-default-rtdb.asia-southeast1.firebasedatabase.app',
      projectId: 'sl-transit-9464e',
      storageBucket: 'sl-transit-9464e.firebasestorage.app',
      messagingSenderId: '123456789',
      appId: '1:123456789:web:test'
    };
  });
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
  await expect(page.locator('.nav button[data-page]')).toHaveCount(10);
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

