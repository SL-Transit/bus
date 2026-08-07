const { test, expect } = require('@playwright/test');
const path = require('path');
const http = require('http');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '..');
let server;
let pageUrl;

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'admin-erp.html' : pathname.replace(/^\//, '');
    const filePath = path.resolve(repoRoot, relative);
    if (!(filePath === repoRoot || filePath.startsWith(repoRoot + path.sep)) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404);
      response.end();
      return;
    }
    const contentType = filePath.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript; charset=utf-8';
    response.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(response);
  });
  await new Promise((resolve) => server.listen(4174, '127.0.0.1', resolve));
  pageUrl = 'http://127.0.0.1:4174/admin-erp.html?adminTestBypass=owner';
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl);
  await expect(page.locator('body')).toHaveAttribute('data-admin-screen', 'dashboard-screen01');
  await expect(page.locator('.dashboard-page')).toBeVisible();
});

test('Dashboard uses the enterprise operations order and privacy-safe labels', async ({ page }) => {
  const main = page.locator('#page');
  await expect(main.locator('.console-header')).toBeVisible();
  await expect(main.locator('.console-kpis')).toBeVisible();
  await expect(main.locator('.console-kpi')).toHaveCount(6);
  await expect(main).toContainText('งานที่ต้องจัดการ');
  await expect(main).toContainText('ปฏิบัติการวันนี้');
  await expect(main).toContainText('สถานะระบบ');
  await expect(main).toContainText('การวิเคราะห์เว็บไซต์');
  const order = await main.locator('.console-header, .console-kpis, .console-panel').evaluateAll((nodes) => nodes.map((node) => node.textContent.trim().slice(0, 30)));
  expect(order.findIndex((text) => text.includes('งานที่ต้องจัดการ'))).toBeGreaterThan(order.findIndex((text) => text.includes('แดชบอร์ด')));
  expect(order.findIndex((text) => text.includes('ปฏิบัติการวันนี้'))).toBeGreaterThan(order.findIndex((text) => text.includes('งานที่ต้องจัดการ')));
  expect(order.findIndex((text) => text.includes('การวิเคราะห์เว็บไซต์'))).toBeGreaterThan(order.findIndex((text) => text.includes('ปฏิบัติการวันนี้')));
  await expect(main).not.toContainText('จำนวนครั้งเข้าเยี่ยมชม');
  await expect(main).not.toContainText('ผู้เยี่ยมชมโดยประมาณ');
  await expect(main).not.toContainText('55 บาท/คน');
  await expect(main).not.toContainText('5 บาท/การจอง');
});

test('Range changes reload Dashboard without stale UI crash', async ({ page }) => {
  const main = page.locator('#page');
  await expect(main.locator('[data-analytics-range]')).toHaveValue('daily');
  await main.locator('[data-analytics-range]').selectOption('monthly');
  await expect(main.locator('[data-analytics-range]')).toHaveValue('monthly');
  await main.locator('[data-analytics-range]').selectOption('hourly');
  await expect(main.locator('[data-analytics-range]')).toHaveValue('hourly');
  await expect(main.locator('.dashboard-page')).toBeVisible();
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

for (const width of [360, 390, 412, 600, 768, 820, 1024, 1280, 1440]) {
  test(`responsive layout remains readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
    await page.goto(pageUrl);
    const metrics = await page.locator('.dashboard-page').evaluate((dashboard) => {
      const rect = dashboard.getBoundingClientRect();
      const header = dashboard.querySelector('.console-header').getBoundingClientRect();
      const urgent = [...dashboard.querySelectorAll('.console-panel')].find((panel) => panel.textContent.includes('งานที่ต้องจัดการ')).getBoundingClientRect();
      const kpis = dashboard.querySelector('.console-kpis').getBoundingClientRect();
      const operations = [...dashboard.querySelectorAll('.console-panel')].find((panel) => panel.textContent.includes('ปฏิบัติการวันนี้')).getBoundingClientRect();
      const narrow = [...dashboard.querySelectorAll('h2,h3,.console-kpi span,.console-list-row strong')].filter((node) => node.getBoundingClientRect().width < 120).length;
      return { scrollWidth: document.documentElement.scrollWidth, rectWidth: rect.width, headerWidth: header.width, urgentWidth: urgent.width, headerTop: header.top, urgentTop: urgent.top, kpisTop: kpis.top, operationsTop: operations.top, narrow };
    });
    expect(metrics.scrollWidth).toBeLessThanOrEqual(width);
    if (width < 768) {
      expect(metrics.headerWidth).toBeGreaterThanOrEqual(metrics.rectWidth * 0.9);
      expect(metrics.urgentWidth).toBeGreaterThanOrEqual(metrics.rectWidth * 0.9);
    }
    expect(metrics.headerTop).toBeLessThan(metrics.urgentTop);
    expect(metrics.urgentTop).toBeLessThan(metrics.kpisTop);
    expect(metrics.kpisTop).toBeLessThan(metrics.operationsTop);
    expect(metrics.narrow).toBe(0);
  });
}
