(function (global) {
  'use strict';

  var sources = Object.freeze({
    stops: Object.freeze({ kind: 'catalog', name: 'stops', path: 'data/erpDataCenter/stops', fields: ['stopKey', 'nameTh', 'lat', 'lng', 'order', 'status'] }),
    routes: Object.freeze({ kind: 'catalog', name: 'routes', path: 'data/erpDataCenter/routes', fields: ['routeId', 'nameTh', 'fromStopKey', 'toStopKey', 'groupId', 'status'] }),
    fares: Object.freeze({ kind: 'workbook', name: 'routeFareRows', path: 'data/erpDataCenter/workbookSource/routeFareRows', fields: ['routeId', 'serviceGroupId', 'amount', 'currency', 'effectiveFrom', 'status'] }),
    rounds: Object.freeze({ kind: 'workbook', name: 'scheduleRows', path: 'data/erpDataCenter/workbookSource/scheduleRows', fields: ['scheduleOfferId', 'routeId', 'serviceGroupId', 'originNameTh', 'destinationNameTh', 'departureTime', 'bookingEnabled', 'capacity', 'note'] }),
    stopTimes: Object.freeze({ kind: 'catalog', name: 'stopTimes', path: 'data/erpDataCenter/stopTimes', fields: ['order', 'tripId', 'routeId', 'serviceGroupId', 'stopKey', 'stopNameTh', 'time'] }),
    vehicles: Object.freeze({ kind: 'catalog', name: 'vehicles', path: 'data/erpDataCenter/fleet/vehicles', fields: ['vehicleId', 'legacyAlias', 'queueId', 'assignmentMode', 'temporaryPlate', 'temporaryPhone', 'active', 'driverId', 'driverName', 'driverPhone', 'note'] }),
    payments: Object.freeze({ kind: 'catalog', name: 'paymentOwnership', path: 'data/erpDataCenter/paymentOwnership', fields: ['bookingId', 'paymentId', 'amount', 'status', 'method', 'contact', 'owner', 'note'] }),
    driverGroups: Object.freeze({ kind: 'catalog', name: 'serviceGroups', path: 'data/erpDataCenter/serviceGroups', fields: ['runtimeVehicleId', 'erpVehicleId', 'serviceGroupId', 'serviceGroupNameTh', 'queueScope', 'assignmentMode', 'note'] })
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
