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

test('Dashboard visible chart grids and remaining sections render', async ({ page }) => {
  const main = await dashboardContent(page);
  await expect(main.locator('#website-analytics')).toBeVisible();
  await expect(main.locator('#booking-activity')).toBeVisible();
  await expect(main.locator('#website-analytics .chart-ranges button')).toHaveCount(5);
  await expect(main.locator('#booking-activity .chart-ranges button')).toHaveCount(5);
  await expect(main.locator('.chart-frame')).toHaveCount(2);
  await expect(main.locator('.chart-axis-zero')).toHaveCount(2);
  await expect(main.locator('.chart-x-labels')).toHaveCount(2);
  await expect(main.locator('.legend-box.red')).toHaveCount(1);
  await expect(main.locator('.legend-box.blue')).toHaveCount(1);
  await expect(main.locator('#website-analytics .chart-empty')).toContainText(/กำลังโหลดสถิติ|ยังไม่มีข้อมูลสถิติ|ไม่สามารถโหลดสถิติได้/);
  await expect(main.locator('#booking-activity .chart-empty')).toContainText(/ยังไม่มีข้อมูลการจอง|ไม่สามารถโหลดข้อมูลการจองได้/);
  await expect(main.locator('#booking-activity .legend-line.blue')).toHaveCount(1);
  await expect(main.locator('#booking-activity .legend-line.red')).toHaveCount(1);
  await expect(main.locator('#booking-activity .legend-line.orange')).toHaveCount(1);
  await expect(main.locator('#finance-donuts')).toBeVisible();
  await expect(main.locator('#finance-donuts .finance-donut')).toHaveCount(1);
  await expect(main.locator('#finance-donuts .donut-svg')).toHaveCount(1);
  await expect(main.locator('#finance-donuts .donut-empty')).toHaveCount(1);
  await expect(main.locator('#finance-donuts .donut-legend-row')).toHaveCount(3);
  await expect(main.locator('#finance-donuts')).toContainText('55 บาท/คน');
  await expect(main.locator('#finance-donuts')).toContainText('5 บาท/การจอง');
  await expect(main.locator('#finance-donuts')).toContainText('เงินคืนผู้โดยสาร');
  await expect(main.locator('#finance-donuts')).toContainText('คืนตามรายการที่อนุมัติ');
  await expect(main.locator('#finance-donuts')).toContainText('ยอดรับรวมวันนี้');
  await expect(main).not.toContainText('รายได้ค่าบริการแพลตฟอร์มวันนี้');
  await expect(main).not.toContainText('คืนเงินรอดำเนินการ');
  await expect(main.locator('.kpi-card')).toHaveCount(0);

  await expect(main.locator('#money-overview')).toHaveCount(0);
  await expect(main).not.toContainText('ข้อมูลประกอบการรับเงินและรายได้');
  await expect(main.getByText('ยอดของรถและคนขับ', { exact: true })).toBeVisible();
  await expect(main.getByText('ยอดของคิวรถและผู้ให้บริการช่วงต่อ', { exact: true })).toBeVisible();
  await expect(main.getByText('รายการคืนเงินล่าสุด', { exact: true })).toBeVisible();
});

test('Vehicle and driver settlement section shows ERP rotation Excel table', async ({ page }) => {
  const main = await dashboardContent(page);
  await expect(main.locator('#vehicle-driver-excel')).toBeVisible();
  await expect(main.locator('#vehicle-driver-excel tbody tr')).toHaveCount(4);
  await expect(main.locator('#vehicle-driver-excel')).toContainText('car1');
  await expect(main.locator('#vehicle-driver-excel')).toContainText('car4');
  await expect(main.locator('#vehicle-driver-excel')).toContainText('คิวที่ 4');
  await expect(main.locator('#vehicle-driver-excel')).toContainText('สถานะอนุมัติ');
  await expect(main.locator('#vehicle-driver-excel')).not.toContainText('veh_001');
  await expect(main.locator('#vehicle-driver-excel')).not.toContainText('queue_001');
  await expect(main.locator('#vehicle-driver-excel .count-detail')).toHaveCount(4);
});

test('Vehicle queue column follows selected service-date rotation', async ({ page }) => {
  const main = await dashboardContent(page);
  const rows = main.locator('#vehicle-driver-excel tbody tr');
  const serviceDate = await page.locator('body').getAttribute('data-service-date');
  const baseDate = Date.UTC(2026, 6, 16) / 86400000;
  const [year, month, day] = String(serviceDate || '').split('-').map(Number);
  const serviceOrdinal = Date.UTC(year, month - 1, day) / 86400000;
  const expectedQueue = (order) => `คิวที่ ${(((order - 1 + (serviceOrdinal - baseDate)) % 4) + 4) % 4 + 1}`;
  await expect(rows.nth(0)).toContainText('car1');
  await expect(rows.nth(0)).toContainText(expectedQueue(1));
  await expect(rows.nth(1)).toContainText('car2');
  await expect(rows.nth(1)).toContainText(expectedQueue(2));
  await expect(rows.nth(2)).toContainText('car3');
  await expect(rows.nth(2)).toContainText(expectedQueue(3));
  await expect(rows.nth(3)).toContainText('car4');
  await expect(rows.nth(3)).toContainText(expectedQueue(4));
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
  await expect(main.locator('#website-analytics .chart-empty')).toContainText(/กำลังโหลดสถิติ|ยังไม่มีข้อมูลสถิติ|ไม่สามารถโหลดสถิติได้/);
  await expect(main).not.toContainText('1,250');
  await expect(main).not.toContainText('15,000');
  await expect(main).not.toContainText('+12%');
});

test('Unavailable analytics and booking chart values are not shown as business zero', async ({ page }) => {
  const main = await dashboardContent(page);
  await expect(main.locator('#website-analytics .chart-empty')).toContainText(/กำลังโหลดสถิติ|ยังไม่มีข้อมูลสถิติ|ไม่สามารถโหลดสถิติได้/);
  await expect(main.locator('#booking-activity .chart-empty')).toContainText('ไม่สามารถโหลดข้อมูลการจองได้');
  await expect(main.locator('#booking-activity')).not.toContainText('0 รายการ');
  await expect(main.locator('#booking-activity polyline')).toHaveCount(0);
  await expect(main.locator('#finance-donuts')).toContainText('—');
  await expect(main.locator('#finance-donuts .donut-empty')).toHaveCount(1);
  await expect(main.locator('#finance-donuts')).not.toContainText('฿ 0');
});

test('Booking hourly response with full backend key renders in graph', async ({ page }) => {
  await page.route('**/readBookingActivity**', async (route) => {
    const url = new URL(route.request().url());
    const range = url.searchParams.get('range') || 'daily';
    const anchor = url.searchParams.get('anchor') || '2026-07-28';
    const points = [];
    if (range === 'hourly') {
      for (let hour = 0; hour < 24; hour += 1) {
        const hh = String(hour).padStart(2, '0');
        points.push({ key: `${anchor}T${hh}`, label: `${hh}:00`, bookings: hour === 9 ? 1 : 0, cancellations: 0, refunds: 0 });
      }
    } else {
      for (let i = 29; i >= 0; i -= 1) {
        const d = new Date(`${anchor}T00:00:00+07:00`);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        points.push({ key, label: key.slice(8) + '/' + String(Number(key.slice(5, 7))), bookings: 0, cancellations: 0, refunds: 0 });
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        status: range === 'hourly' ? 'ready' : 'empty',
        range,
        timezone: 'Asia/Bangkok',
        points,
        totals: range === 'hourly' ? { bookings: 1, cancellations: 0, refunds: 0 } : { bookings: 0, cancellations: 0, refunds: 0 },
        generatedAt: 1
      })
    });
  });
  await page.goto(pageUrl);
  const main = await dashboardContent(page);
  await main.locator('[data-booking-range="hourly"]').click();
  await expect(main.locator('#booking-activity .chart-x-labels')).toContainText('09:00');
  await expect(main.locator('#booking-activity polyline')).not.toHaveCount(0);
  await expect(main.locator('#booking-activity .chart-summary')).toContainText('1');
});

test('Booking empty response shows zero totals and no line', async ({ page }) => {
  await page.route('**/readBookingActivity**', async (route) => {
    const url = new URL(route.request().url());
    const range = url.searchParams.get('range') || 'daily';
    const anchor = url.searchParams.get('anchor') || '2026-07-28';
    const points = Array.from({ length: 30 }, (_, index) => {
      const d = new Date(`${anchor}T00:00:00+07:00`);
      d.setDate(d.getDate() - (29 - index));
      const key = d.toISOString().slice(0, 10);
      return { key, label: `D${index + 1}`, bookings: 0, cancellations: 0, refunds: 0 };
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: 'empty', range, timezone: 'Asia/Bangkok', points, totals: { bookings: 0, cancellations: 0, refunds: 0 }, generatedAt: 1 })
    });
  });
  await page.goto(pageUrl);
  const main = await dashboardContent(page);
  await expect(main.locator('#booking-activity .chart-summary')).toContainText('0');
  await expect(main.locator('#booking-activity .chart-empty')).toBeVisible();
  await expect(main.locator('#booking-activity polyline')).toHaveCount(0);
});

test('Booking error response keeps dash totals', async ({ page }) => {
  await page.route('**/readBookingActivity**', async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: false, error: 'boom' }) });
  });
  await page.goto(pageUrl);
  const main = await dashboardContent(page);
  await expect(main.locator('#booking-activity .chart-empty')).toContainText('ไม่สามารถโหลดข้อมูลการจองได้');
  const summary = await main.locator('#booking-activity .chart-summary').textContent();
  expect(summary).toContain('—');
  expect(summary).not.toContain('0');
});

test('Booking chart axis follows non-today Function points', async ({ page }) => {
  await page.route('**/readBookingActivity**', async (route) => {
    const url = new URL(route.request().url());
    const anchor = url.searchParams.get('anchor') || '2026-03-31';
    const points = Array.from({ length: 30 }, (_, index) => {
      const d = new Date(`${anchor}T00:00:00+07:00`);
      d.setDate(d.getDate() - (29 - index));
      const key = d.toISOString().slice(0, 10);
      return { key, label: index === 29 ? 'ANCHOR-AXIS' : `F${index + 1}`, bookings: index === 29 ? 1 : 0, cancellations: 0, refunds: 0 };
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        status: 'ready',
        range: 'daily',
        timezone: 'Asia/Bangkok',
        points,
        totals: { bookings: 1, cancellations: 0, refunds: 0 },
        generatedAt: 1
      })
    });
  });
  await page.goto(pageUrl);
  await page.locator('#serviceDate').evaluate((el) => { el.value = '2026-03-31'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.locator('#booking-activity [data-booking-range="daily"]').click();
  const main = await dashboardContent(page);
  await expect(main.locator('#booking-activity .chart-x-labels')).toContainText('ANCHOR-AXIS');
  await expect(main.locator('#booking-activity')).not.toContainText('28/7');
});

test('Booking refresh waits for new response before final render', async ({ page }) => {
  let count = 0;
  await page.route('**/readBookingActivity**', async (route) => {
    count += 1;
    const bookings = count >= 2 ? 2 : 0;
    const status = bookings ? 'ready' : 'empty';
    const points = Array.from({ length: 30 }, (_, index) => ({ key: `2026-07-${String(index + 1).padStart(2, '0')}`, label: `R${index + 1}`, bookings: index === 29 ? bookings : 0, cancellations: 0, refunds: 0 }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        status,
        range: 'daily',
        timezone: 'Asia/Bangkok',
        points,
        totals: { bookings, cancellations: 0, refunds: 0 },
        generatedAt: count
      })
    });
  });
  await page.goto(pageUrl);
  await expect(page.locator('#booking-activity .chart-summary')).toContainText('0');
  await page.locator('#refreshDashboard').click();
  await expect(page.locator('#booking-activity .chart-summary')).toContainText('2');
});

test('Rapid booking range change ignores stale response', async ({ page }) => {
  await page.route('**/readBookingActivity**', async (route) => {
    const url = new URL(route.request().url());
    const range = url.searchParams.get('range') || 'daily';
    if (range === 'monthly') await new Promise((resolve) => setTimeout(resolve, 200));
    const points = range === 'hourly'
      ? Array.from({ length: 24 }, (_, hour) => ({ key: `2026-07-28T${String(hour).padStart(2, '0')}`, label: `${String(hour).padStart(2, '0')}:00`, bookings: hour === 9 ? 3 : 0, cancellations: 0, refunds: 0 }))
      : Array.from({ length: 12 }, (_, index) => ({ key: `2026-${String(index + 1).padStart(2, '0')}`, label: `M${index + 1}`, bookings: 9, cancellations: 0, refunds: 0 }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: 'ready', range, timezone: 'Asia/Bangkok', points, totals: { bookings: range === 'hourly' ? 3 : 9, cancellations: 0, refunds: 0 }, generatedAt: 1 })
    });
  });
  await page.goto(pageUrl);
  const main = await dashboardContent(page);
  await main.locator('[data-booking-range="monthly"]').click();
  await main.locator('[data-booking-range="hourly"]').click();
  await expect(main.locator('[data-booking-range="hourly"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(main.locator('#booking-activity .chart-summary')).toContainText('3');
  await expect(main.locator('#booking-activity .chart-summary')).not.toContainText('9');
});

test('Sidebar routes still work and ERP workbook remains accessible', async ({ page }) => {
  await page.getByRole('button', { name: 'จัดการข้อมูล ERP' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'workbook');
  await expect(page.getByText('ERP workbook sheets')).toBeVisible();
  await page.getByRole('button', { name: 'แดชบอร์ด' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'dashboard');
});

test('Booking summary button opens Booking section and active menu', async ({ page }) => {
  await page.locator('#booking-activity [data-page="bookings"]').click();
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

test('Mobile chart cards stack and scroll internally without page horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pageUrl);
  const layout = await page.evaluate(() => {
    const analytics = document.querySelector('#website-analytics').getBoundingClientRect();
    const booking = document.querySelector('#booking-activity').getBoundingClientRect();
    const finance = document.querySelector('#finance-donuts').getBoundingClientRect();
    const ranges = document.querySelector('#website-analytics .chart-ranges');
    const chartScroll = document.querySelector('#website-analytics .chart-scroll');
    return {
      analyticsTop: Math.round(analytics.top),
      bookingTop: Math.round(booking.top),
      financeTop: Math.round(finance.top),
      analyticsWidth: Math.round(analytics.width),
      bookingWidth: Math.round(booking.width),
      financeWidth: Math.round(finance.width),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      rangeScrollable: ranges.scrollWidth >= ranges.clientWidth,
      chartInternalScroll: chartScroll.scrollWidth > chartScroll.clientWidth,
    };
  });
  expect(layout.analyticsTop).toBeLessThan(layout.bookingTop);
  expect(layout.bookingTop).toBeLessThan(layout.financeTop);
  expect(layout.analyticsWidth).toBeGreaterThanOrEqual(360);
  expect(layout.bookingWidth).toBeGreaterThanOrEqual(360);
  expect(layout.financeWidth).toBeGreaterThanOrEqual(360);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.rangeScrollable).toBeTruthy();
  expect(layout.chartInternalScroll).toBeTruthy();
  await page.locator('#booking-activity [data-page="bookings"]').click();
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
