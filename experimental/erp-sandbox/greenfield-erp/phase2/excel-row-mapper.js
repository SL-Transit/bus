"use strict";

function isBlank(value) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function convert(value, type) {
  if (isBlank(value)) return null;
  if (type === "integer") {
    const number = Number(value);
    return Number.isInteger(number) ? number : value;
  }
  if (type === "number" || type === "money-major") {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  if (type === "string") return String(value).trim();
  return value;
}

function mapSheetRows(input) {
  const options = input || {};
  const mapping = options.mapping;
  const sheetName = options.sheetName;
  const rows = Array.isArray(options.rows) ? options.rows : [];
  if (!mapping || !mapping.sheets || !mapping.sheets[sheetName]) {
    throw new Error("greenfield_excel_sheet_mapping_missing");
  }
  const sheet = mapping.sheets[sheetName];
  const records = [];
  const errors = [];
  rows.forEach(function (row, index) {
    const source = row || {};
    const hasSourceValue = sheet.fields.some(function (field) {
      return !isBlank(source[field.sourceColumn]);
    });
    if (!hasSourceValue) return;
    const record = {};
    sheet.fields.forEach(function (field) {
      const value = source[field.sourceColumn];
      if (field.required && isBlank(value)) {
        errors.push({
          code: "excel.required",
          sheetName,
          rowNumber: sheet.dataStartRow + index,
          sourceColumn: field.sourceColumn
        });
      }
      if (!isBlank(value)) record[field.targetField] = convert(value, field.targetType);
    });
    records.push({
      sourceRowId: sheetName + ":" + (sheet.dataStartRow + index),
      targetEntity: sheet.targetEntity,
      value: record
    });
  });
  return { records, errors };
}

module.exports = { mapSheetRows };