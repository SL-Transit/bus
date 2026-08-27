(function (global) {
  'use strict';

  var sources = Object.freeze({
    stops: Object.freeze({ kind: 'catalog', name: 'stops', excelSheet: '01_ข้อมูลป้ายต้นทาง', orderField: 'sourceRowNumber', path: 'data/erpDataCenter/stops', fields: ['stopKey', 'nameTh', 'lat', 'lng', 'order', 'status'] }),
    routes: Object.freeze({ kind: 'catalog', name: 'serviceGroups', excelSheet: '02_เส้นทาง', orderField: 'sourceRowNumber', path: 'data/erpDataCenter/serviceGroups', fields: ['serviceGroupId', 'displayNameTh', 'sortOrder', 'groupType', 'transferStopKey', 'minTransferMinutes', 'maxWaitMinutes', 'idealWaitMinutes', 'reliability', 'displayOrder', 'passengerSelectable', 'status'] }),
    fares: Object.freeze({ kind: 'workbook', name: 'routeFareRows', excelSheet: '03_เส้นทางและราคา', orderField: 'sourceRowNumber', path: 'data/erpDataCenter/workbookSource/routeFareRows', fields: ['routeId', 'serviceGroupId', 'fromStopKey', 'fromNameTh', 'toStopKey', 'toNameTh', 'amount', 'currency', 'effectiveFrom', 'status'] }),
    rounds: Object.freeze({ kind: 'workbook', name: 'scheduleRows', excelSheet: '04_รอบเวลา', orderField: 'sourceRowNumber', path: 'data/erpDataCenter/workbookSource/scheduleRows', fields: ['scheduleOfferId', 'routeId', 'serviceGroupId', 'originNameTh', 'destinationNameTh', 'departureTime', 'bookingEnabled', 'capacity', 'note'] }),
    vehicles: Object.freeze({ kind: 'catalog', name: 'vehicles', excelSheet: '06_รถและคิว', orderField: 'sourceRowNumber', path: 'data/erpDataCenter/fleet/vehicles', fields: ['vehicleId', 'legacyAlias', 'queueId', 'assignmentMode', 'temporaryPlate', 'temporaryPhone', 'active', 'driverId', 'driverName', 'driverPhone', 'note'] }),
    stopTimes: Object.freeze({ kind: 'catalog', name: 'stopTimes', excelSheet: '05_คิวรถและเวลา', orderField: 'sourceRowNumber', path: 'data/erpDataCenter/stopTimes', fields: ['order', 'tripId', 'routeId', 'serviceGroupId', 'stopKey', 'stopNameTh', 'time'] }),
    payments: Object.freeze({ kind: 'catalog', name: 'paymentOwnership', excelSheet: '07_PaymentContact', orderField: 'sourceRowNumber', path: 'data/erpDataCenter/paymentOwnership', fields: ['bookingId', 'paymentId', 'amount', 'status', 'method', 'contact', 'owner', 'note'] }),
    driverGroups: Object.freeze({ kind: 'catalog', name: 'assignmentRules', excelSheet: '08_DriverVehicleGroup', orderField: 'sourceRowNumber', path: 'data/erpDataCenter/fleet/assignmentRules', fields: ['runtimeVehicleId', 'erpVehicleId', 'serviceGroupId', 'serviceGroupNameTh', 'queueScope', 'assignmentMode', 'note'] }),
    staff: Object.freeze({ kind: 'catalog', name: 'adminAccounts', excelSheet: '09_StaffLineConfig', orderField: 'sourceRowNumber', path: 'data/erpDataCenter/adminAccounts', fields: ['uid', 'displayNameTh', 'role', 'canRead', 'canEdit', 'canReview', 'canPublish', 'status'] }),
    accounts: Object.freeze({ kind: 'catalog', name: 'adminAccounts', excelSheet: 'บัญชีและสิทธิ์ระบบ', orderField: 'sourceRowNumber', path: 'data/erpDataCenter/adminAccounts', fields: ['uid', 'displayNameTh', 'email', 'role', 'status', 'lastLoginAt', 'note'] }),
    alerts: Object.freeze({ kind: 'catalog', name: 'alerts', excelSheet: 'ศูนย์แจ้งเตือน', orderField: 'sourceRowNumber', path: 'data/erpDataCenter/meta/alerts', fields: ['alertId', 'type', 'source', 'priority', 'status', 'owner', 'createdAt', 'note'] })
  });

  function sourceForTab(tab) { return sources[tab] || null; }
  function read(tab, adapter, query) {
    var source = sourceForTab(tab);
    if (!source) return Promise.reject(new Error('no_approved_read_source:' + tab));
    return source.kind === 'workbook'
      ? adapter.getWorkbookSource(source.name, query)
      : adapter.getCatalog(source.name, query);
  }

  global.AdminErpReadModel = Object.freeze({ sources: sources, sourceForTab: sourceForTab, read: read });
  if (typeof module !== 'undefined' && module.exports) module.exports = global.AdminErpReadModel;
}(typeof window !== 'undefined' ? window : globalThis));
