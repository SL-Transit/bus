(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SLTransitExcelRowMapper = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SUPPORTED_TEMPLATE_VERSIONS = Object.freeze(["3.3.4", "3.3.5"]);

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

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function applyMappingProfile(baseMapping, profile) {
    if (!baseMapping || !baseMapping.sheets || !profile) throw new Error("greenfield_excel_mapping_profile_invalid");
    const mapping = clone(baseMapping);
    mapping.mappingVersion = profile.mappingVersion;
    mapping.templateVersion = profile.templateVersion;
    mapping.sourceWorkbook = profile.sourceWorkbook || baseMapping.sourceWorkbook;
    mapping.versionLocation = clone(profile.versionLocation || {});
    mapping.requiredSheets = clone(profile.requiredSheets || []);
    mapping.routeRules = clone(profile.routeRules || {});
    mapping.safetyRules = clone(profile.safetyRules || {});
    Object.keys(profile.additionalSheets || {}).forEach(function (sheetName) {
      mapping.sheets[sheetName] = clone(profile.additionalSheets[sheetName]);
    });
    Object.keys(profile.optionalSourceFields || {}).forEach(function (sheetName) {
      const sheet = mapping.sheets[sheetName];
      if (!sheet) return;
      const optional = new Set(profile.optionalSourceFields[sheetName]);
      sheet.fields.forEach(function (field) {
        if (optional.has(field.sourceColumn)) field.required = false;
      });
    });
    return mapping;
  }

  function cellFromA1(matrix, address) {
    const match = /^([A-Z]+)(\d+)$/i.exec(String(address || ""));
    if (!match) return null;
    let column = 0;
    match[1].toUpperCase().split("").forEach(function (character) {
      column = column * 26 + character.charCodeAt(0) - 64;
    });
    const row = Number(match[2]) - 1;
    return matrix && matrix[row] ? matrix[row][column - 1] : null;
  }

  function detectTemplateVersion(workbook, profiles) {
    const list = Array.isArray(profiles) ? profiles : [];
    const location = list[0] && list[0].versionLocation || { sheetName: "91_ควบคุมการนำเข้า", cell: "C5" };
    const matrix = workbook && workbook.sheets && workbook.sheets[location.sheetName];
    const value = String(cellFromA1(matrix, location.cell) || "").trim();
    const version = SUPPORTED_TEMPLATE_VERSIONS.find(function (candidate) {
      return value === candidate || value.includes(candidate);
    });
    return version || null;
  }

  function rowsFromMatrix(matrix, sheet) {
    const headers = Array.isArray(matrix && matrix[sheet.headerRow - 1]) ? matrix[sheet.headerRow - 1] : [];
    return (matrix || []).slice(sheet.dataStartRow - 1).map(function (values) {
      const row = {};
      headers.forEach(function (header, index) {
        const key = String(header == null ? "" : header).trim();
        if (key) row[key] = values && values[index];
      });
      return row;
    });
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
            sourceColumn: field.sourceColumn,
            message: "กรุณากรอกช่อง " + field.sourceColumn + " ในชีต " + sheetName + " แถว " + (sheet.dataStartRow + index)
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

  function validateWorkbookStructure(workbook, mapping) {
    const errors = [];
    const sheets = workbook && workbook.sheets || {};
    (mapping.requiredSheets || []).forEach(function (sheetName) {
      if (!Array.isArray(sheets[sheetName])) {
        errors.push({ code: "excel.sheet_missing", sheetName, message: "ไม่พบชีต " + sheetName });
      }
    });
    Object.keys(mapping.sheets || {}).forEach(function (sheetName) {
      const matrix = sheets[sheetName];
      if (!Array.isArray(matrix)) return;
      const definition = mapping.sheets[sheetName];
      const headers = new Set((matrix[definition.headerRow - 1] || []).map(function (value) { return String(value || "").trim(); }));
      definition.fields.filter(function (field) { return field.required; }).forEach(function (field) {
        if (!headers.has(field.sourceColumn)) {
          errors.push({
            code: "excel.header_missing",
            sheetName,
            sourceColumn: field.sourceColumn,
            message: "ชีต " + sheetName + " ไม่มีหัวตาราง " + field.sourceColumn
          });
        }
      });
    });
    return errors;
  }

  function mapWorkbook(input) {
    const workbook = input && input.workbook;
    const mapping = input && input.mapping;
    const structureErrors = validateWorkbookStructure(workbook, mapping);
    const records = [];
    const errors = structureErrors.slice();
    Object.keys(mapping.sheets || {}).forEach(function (sheetName) {
      const matrix = workbook && workbook.sheets && workbook.sheets[sheetName];
      if (!Array.isArray(matrix)) return;
      const result = mapSheetRows({ mapping, sheetName, rows: rowsFromMatrix(matrix, mapping.sheets[sheetName]) });
      records.push.apply(records, result.records);
      errors.push.apply(errors, result.errors);
    });
    return { records, errors };
  }

  return {
    SUPPORTED_TEMPLATE_VERSIONS,
    applyMappingProfile,
    cellFromA1,
    detectTemplateVersion,
    rowsFromMatrix,
    mapSheetRows,
    validateWorkbookStructure,
    mapWorkbook
  };
}));
