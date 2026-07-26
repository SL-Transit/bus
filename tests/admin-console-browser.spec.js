const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const pageUrl = 'file:///' + path.join(repoRoot, 'admin-erp.html').replace(/\\/g, '/');

async function dashboardContent(page) {
  return page.locator('#page');
}

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl);
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'dashboard');
});

test('Dashboard analytics chart shell, booking card, and remaining sections render', async ({ page }) => {
  const main = await dashboardContent(page);
  await expect(main.locator('#website-analytics')).toBeVisible();
  await expect(main.locator('#booking-summary')).toBeVisible();
  await expect(main.locator('.analytics-ranges button')).toHaveCount(5);
  await expect(main.locator('.legend-box.red')).toHaveCount(1);
  await expect(main.locator('.legend-box.blue')).toHaveCount(1);
  await expect(main.locator('.analytics-empty')).toBeVisible();
  await expect(main.locator('.kpi-card')).toHaveCount(3);

  await expect(main.getByText('ภาพรวมการรับเงินและรายได้', { exact: true })).toBeVisible();
  await expect(main.getByText('ยอดของรถและคนขับ', { exact: true })).toBeVisible();
  await expect(main.getByText('ยอดของคิวรถและผู้ให้บริการช่วงต่อ', { exact: true })).toBeVisible();
  await expect(main.getByText('รายการคืนเงินล่าสุด', { exact: true })).toBeVisible();
});

test('Dashboard removes operations-only widgets from the business canvas', async ({ page }) => {
  const main = await dashboardContent(page);
  await expect(main).not.toContainText('Incident');
  await expect(main).not.toContainText('Blackbox');
  await expect(main).not.toContainText('กล่องดำ');
  await expect(main).not.toContainText('เหตุผิดปกติ');
  await expect(main).not.toContainText('เปิดศูนย์เหตุขัดข้อง');
  await expect(main).not.toContainText('GPS');
  await expect(main).not.toContainText('แผนที่รถ');
  await expect(page.locator('#operationsMap')).toHaveCount(0);
});

test('Analytics time range controls update selected state without inventing data', async ({ page }) => {
  const main = await dashboardContent(page);
  await expect(main.locator('[data-analytics-range="daily"]')).toHaveAttribute('aria-pressed', 'true');
  await main.locator('[data-analytics-range="monthly"]').click();
  await expect(main.locator('[data-analytics-range="monthly"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(main.locator('.analytics-empty')).toContainText('ยังไม่มีข้อมูลสถิติ');
  await expect(main).not.toContainText('1,250');
  await expect(main).not.toContainText('15,000');
  await expect(main).not.toContainText('+12%');
});

test('Unavailable analytics and booking values are not shown as business zero', async ({ page }) => {
  const main = await dashboardContent(page);
  await expect(main.locator('.analytics-empty')).toContainText('ยังไม่มีข้อมูลสถิติ');
  await expect(main.locator('#booking-summary .booking-main')).toContainText('—');
  await expect(main.locator('#booking-summary')).not.toContainText('0 รายการ');
});

test('Sidebar routes still work and ERP workbook remains accessible', async ({ page }) => {
  await page.getByRole('button', { name: 'จัดการข้อมูล ERP' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'workbook');
  await expect(page.getByText('ERP workbook sheets')).toBeVisible();
  await page.getByRole('button', { name: 'แดชบอร์ด' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'dashboard');
});

test('Booking summary button opens Booking section and active menu', async ({ page }) => {
  await page.locator('#booking-summary [data-page="bookings"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'bookings');
  await expect(page.locator('.nav button[data-page="bookings"]')).toHaveClass(/on/);
});

test('Desktop Admin shell uses left sidebar and collapses without horizontal menu', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(pageUrl);

  const navButtons = page.locator('.nav button[data-page]');
  await expect(navButtons).toHaveCount(9);
  await expect(page.locator('.nav button[data-page="dashboard"]')).toHaveClass(/on/);

  const layout = await page.evaluate(() => {
    const side = document.querySelector('.side').getBoundingClientRect();
    const top = document.querySelector('.top').getBoundingClientRect();
    const nav = getComputedStyle(document.querySelector('.nav'));
    return {
      sideLeft: Math.round(side.left),
      sideWidth: Math.round(side.width),
      topLeft: Math.round(top.left),
      navDisplay: nav.display,
      bodyScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  expect(layout.sideLeft).toBe(0);
  expect(layout.sideWidth).toBeGreaterThanOrEqual(220);
  expect(layout.sideWidth).toBeLessThanOrEqual(240);
  expect(layout.topLeft).toBeGreaterThanOrEqual(layout.sideWidth - 1);
  expect(layout.navDisplay).not.toBe('flex');
  expect(layout.bodyScrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);

  await page.locator('#toggleSidebar').click();
  await expect(page.locator('body')).toHaveClass(/nav-collapsed/);
  const collapsedWidth = await page.locator('.side').evaluate((el) => Math.round(el.getBoundingClientRect().width));
  expect(collapsedWidth).toBeGreaterThanOrEqual(64);
  expect(collapsedWidth).toBeLessThanOrEqual(72);
  await page.locator('#toggleSidebar').click();
  await expect(page.locator('body')).not.toHaveClass(/nav-collapsed/);
});

test('Mobile Admin shell opens and closes sidebar drawer safely', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pageUrl);

  await expect(page.locator('body')).not.toHaveClass(/nav-open/);
  const hiddenLeft = await page.locator('.side').evaluate((el) => Math.round(el.getBoundingClientRect().left));
  expect(hiddenLeft).toBeLessThan(0);

  await page.locator('#toggleSidebar').click();
  await expect(page.locator('body')).toHaveClass(/nav-open/);
  await expect(page.locator('#drawerOverlay')).toBeVisible();
  let mobileLayout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    navDisplay: getComputedStyle(document.querySelector('.nav')).display,
    labelWhiteSpace: getComputedStyle(document.querySelector('.nav-label')).whiteSpace,
  }));
  expect(mobileLayout.scrollWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth + 1);
  expect(mobileLayout.navDisplay).not.toBe('flex');
  expect(mobileLayout.labelWhiteSpace).not.toBe('nowrap');

  await page.locator('#drawerOverlay').click();
  await expect(page.locator('body')).not.toHaveClass(/nav-open/);

  await page.locator('#toggleSidebar').click();
  await expect(page.locator('body')).toHaveClass(/nav-open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).not.toHaveClass(/nav-open/);

  await page.locator('#toggleSidebar').click();
  await page.locator('.nav button[data-page="workbook"]').click();
  await expect(page.locator('body')).not.toHaveClass(/nav-open/);
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'workbook');
});

test('Mobile analytics and booking cards stack without page horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pageUrl);
  const layout = await page.evaluate(() => {
    const analytics = document.querySelector('#website-analytics').getBoundingClientRect();
    const booking = document.querySelector('#booking-summary').getBoundingClientRect();
    const ranges = document.querySelector('.analytics-ranges');
    return {
      analyticsTop: Math.round(analytics.top),
      bookingTop: Math.round(booking.top),
      analyticsWidth: Math.round(analytics.width),
      bookingWidth: Math.round(booking.width),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      rangeScrollable: ranges.scrollWidth >= ranges.clientWidth,
    };
  });
  expect(layout.analyticsTop).toBeLessThan(layout.bookingTop);
  expect(layout.analyticsWidth).toBeGreaterThanOrEqual(360);
  expect(layout.bookingWidth).toBeGreaterThanOrEqual(360);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.rangeScrollable).toBeTruthy();
  await page.locator('#booking-summary [data-page="bookings"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'bookings');
});

test('Keyboard focus is visible on range controls and refresh', async ({ page }) => {
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
  await page.getByRole('button', { name: 'รีเฟรช' }).focus();
  await expect(page.getByRole('button', { name: 'รีเฟรช' })).toBeFocused();
});

test('No Firebase writes, screenshot assets, or consumer edits are present in Dashboard files', async () => {
  const html = fs.readFileSync(path.join(repoRoot, 'admin-erp.html'), 'utf8');
  const readModel = fs.readFileSync(path.join(repoRoot, 'screen01-central-read-model.js'), 'utf8');
  const firebaseWritePattern = /\.ref\([^)]*\)\s*\.\s*(set|update|push|remove)\s*\(/;

  expect(html).not.toMatch(firebaseWritePattern);
  expect(readModel).not.toMatch(firebaseWritePattern);
  expect(html).not.toContain('<img');
  expect(html).not.toContain('background-image');
  expect(html).not.toContain('1000018505');
  expect(html).not.toContain('Math.random');
  expect(html).not.toMatch(/analytics\/mainWeb[\s\S]{0,80}\.once\(/);
  for (const file of ['booking1.html', 'passenger.html', 'check_ticket.html', 'cancel_ticket.html']) {
    expect(fs.existsSync(path.join(repoRoot, file))).toBe(true);
  }
});
