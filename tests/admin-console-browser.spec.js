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

test('Dashboard business KPIs and sections render', async ({ page }) => {
  const main = await dashboardContent(page);
  for (const label of [
    'จำนวนครั้งเข้าเว็บไซต์',
    'ผู้เยี่ยมชมโดยประมาณ',
    'จำนวนการจองวันนี้',
    'ยอดรับจากผู้โดยสารวันนี้',
    'รายได้ค่าบริการแพลตฟอร์มวันนี้',
    'คืนเงินรอดำเนินการ',
  ]) {
    await expect(main.getByText(label)).toBeVisible();
  }

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

test('Time range controls update selected state without inventing data', async ({ page }) => {
  const main = await dashboardContent(page);
  await expect(main.getByRole('tab', { name: 'วันนี้' })).toHaveAttribute('aria-selected', 'true');
  await main.getByRole('tab', { name: 'รายเดือน' }).click();
  await expect(main.getByRole('tab', { name: 'รายเดือน' })).toHaveAttribute('aria-selected', 'true');
  await expect(main.getByText('ช่วงเวลานี้ยังไม่เชื่อมข้อมูล')).toBeVisible();
  await expect(main).not.toContainText('1,250');
  await expect(main).not.toContainText('15,000');
  await expect(main).not.toContainText('+12%');
});

test('Unavailable values are not shown as business zero', async ({ page }) => {
  const main = await dashboardContent(page);
  await expect(main.getByText('ยังไม่เชื่อมแหล่งข้อมูล').first()).toBeVisible();
  const visitCard = main.locator('.kpi-card').filter({ hasText: 'จำนวนครั้งเข้าเว็บไซต์' });
  await expect(visitCard.locator('b')).toHaveText('—');
});

test('Sidebar routes still work and ERP workbook remains accessible', async ({ page }) => {
  await page.getByRole('button', { name: 'จัดการข้อมูล ERP' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'workbook');
  await expect(page.getByText('ERP workbook sheets')).toBeVisible();
  await page.getByRole('button', { name: 'แดชบอร์ด' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-current-page', 'dashboard');
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
  for (const file of ['booking1.html', 'passenger.html', 'check_ticket.html', 'cancel_ticket.html']) {
    expect(fs.existsSync(path.join(repoRoot, file))).toBe(true);
  }
});
