const assert = require('assert');
const { test } = require('node:test');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin-erp1.html'), 'utf8');
const contract = require(path.join(root, 'admin-erp-excel-draft-import.js'));

global.AdminErpExcelDraftImport = contract;
global.sessionStorage = {
  values: {},
  setItem(key, value) { this.values[key] = String(value); },
  getItem(key) { return this.values[key] || null; },
  removeItem(key) { delete this.values[key]; }
};
const controller = require(path.join(root, 'admin-erp-excel-import-controller.js'));

function workbookMatrix() {
  const sheets = {};
  contract.SHEET_ORDER.forEach((name) => {
    const definition = contract.SHEETS[name];
    const headerRow = definition.headerMode === 'keyValue'
      ? [definition.headers[0]]
      : definition.headers.slice();
    const leading = Array.from({ length: (definition.headerRow || 1) - 1 }, () => []);
    if (definition.headerMode === 'keyValue') {
      sheets[name] = { matrix: [headerRow, [], []] };
    } else {
      sheets[name] = { matrix: leading.concat([headerRow, [], []]) };
    }
  });
  return sheets;
}

test('admin erp1 loads the Excel contract and controller beside the existing import action', () => {
  assert.match(html, /admin-erp-excel-draft-import\.js/);
  assert.match(html, /admin-erp-excel-import-controller\.js/);
  assert.match(html, /data-erp-action="import"/);
  assert.match(html, /data-admin-erp-excel-file/);
  assert.match(html, /data-admin-erp-excel-preview/);
  assert.match(html, /function openDrawer\(content\)/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'admin-erp-excel-import-controller.js'), 'utf8'), /firebase\.(database|auth)|fetch\s*\(/i);
});

test('parser adapter preserves workbook order and Excel row numbers before contract validation', async () => {
  const fakeParser = {
    read() {
      const sheets = workbookMatrix();
      return { SheetNames: contract.SHEET_ORDER.slice(), Sheets: sheets };
    },
    utils: {
      sheet_to_json(sheet) { return sheet.matrix; }
    }
  };
  const file = {
    name: contract.WORKBOOK_NAME,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
  };
  const workbook = await controller.parseFile(file, { parser: fakeParser });
  assert.deepStrictEqual(workbook.sheets.map((sheet) => sheet.name), contract.SHEET_ORDER);
  assert.deepStrictEqual(workbook.sheets[0].rows.map((row) => row.sourceRowNumber), [2, 3]);
  assert.deepStrictEqual(workbook.sheets[7].rows.map((row) => row.sourceRowNumber), [5, 6]);
  const result = controller.buildPreview(workbook);
  assert.strictEqual(result.draft.localOnly, true);
  assert.strictEqual(result.draft.productionWrite, false);
  assert.strictEqual(result.draft.readyForApply, false);
  assert.strictEqual(result.preview.sheetOrderVerified, true);
  assert.strictEqual(result.preview.readyForApply, false);
});

test('missing parser fails closed and never invents a preview', async () => {
  const file = { name: 'owner-approved.xlsx', arrayBuffer: async () => new ArrayBuffer(0) };
  await assert.rejects(
    controller.parseFile(file, { parser: null }),
    (error) => error && error.code === 'excel-parser-unavailable'
  );
  assert.strictEqual(controller.readPreview(), null);
});

test('stored preview is session-only and can be cleared', () => {
  const result = { draft: { localOnly: true, productionWrite: false }, preview: { status: 'พร้อมสร้างฉบับร่าง' } };
  assert.strictEqual(controller.storePreview(result), true);
  const stored = controller.readPreview();
  assert.strictEqual(stored.draft.productionWrite, false);
  assert.ok(stored.storedAt);
  controller.clearPreview();
  assert.strictEqual(controller.readPreview(), null);
});
