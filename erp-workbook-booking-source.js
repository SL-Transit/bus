(function(global) {
  'use strict';

  /* Repair legacy Thai text that was decoded as Windows-874 before storage. */
  var CP874_THAI = {};
  (function buildCp874ThaiMap() {
    var code = 0x0E01;
    for (var byte = 0xA1; byte <= 0xDA; byte++, code++) CP874_THAI[code] = byte;
    CP874_THAI[0x0E3F] = 0xDF;
    code = 0x0E40;
    for (byte = 0xE0; byte <= 0xEA; byte++, code++) CP874_THAI[code] = byte;
    code = 0x0E50;
    for (byte = 0xF0; byte <= 0xF9; byte++, code++) CP874_THAI[code] = byte;
  }());

  function repairMojibake(value) {
    if (typeof value !== 'string' || !/[\u0080-\u009F]/.test(value)) return value;
    var bytes = [];
    for (var i = 0; i < value.length; i++) {
      var cp = value.charCodeAt(i);
      if (cp <= 0x7F || (cp >= 0x80 && cp <= 0xFF)) bytes.push(cp);
      else if (CP874_THAI[cp] != null) bytes.push(CP874_THAI[cp]);
      else return value;
    }
    try {
      var decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
      return /[\u0E00-\u0E7F]/.test(decoded) ? decoded : value;
    } catch (err) {
      return value;
    }
  }

  global.SLTransitText = global.SLTransitText || {};
  global.SLTransitText.repairMojibake = repairMojibake;
  if (typeof global.alert === 'function' && !global.alert.__slTransitEncodingFix) {
    var nativeAlert = global.alert.bind(global);
    var repairedAlert = function(message) { return nativeAlert(repairMojibake(String(message == null ? '' : message))); };
    repairedAlert.__slTransitEncodingFix = true;
    global.alert = repairedAlert;
  }

  function repairDomText(root) {
    if (!global.document || !root) return;
    var walker = global.document.createTreeWalker(root, global.NodeFilter ? global.NodeFilter.SHOW_TEXT : 4);
    var node;
    while ((node = walker.nextNode())) {
      var repaired = repairMojibake(node.nodeValue);
      if (repaired !== node.nodeValue) node.nodeValue = repaired;
    }
  }

  global.SLTransitText.repairDomText = repairDomText;
  function installDomRepair() {
    if (!global.document || !global.MutationObserver || !global.document.body) return;
    repairDomText(global.document.body);
    var observer = new global.MutationObserver(function(records) {
      records.forEach(function(record) {
        Array.prototype.forEach.call(record.addedNodes || [], function(node) {
          if (node.nodeType === 3) {
            var repaired = repairMojibake(node.nodeValue);
            if (repaired !== node.nodeValue) node.nodeValue = repaired;
          } else if (node.nodeType === 1) {
            repairDomText(node);
          }
        });
      });
    });
    observer.observe(global.document.body, { childList: true, subtree: true });
  }
  if (global.document) {
    if (global.document.body) installDomRepair();
    else global.document.addEventListener('DOMContentLoaded', installDomRepair, { once: true });
  }

  function values(value) {
    return Array.isArray(value) ? value : Object.keys(value || {}).map(function(key) { return value[key]; });
  }

  function clean(value) {
    return repairMojibake(String(value == null ? '' : value)).trim();
  }

  function identity(origin, destination) {
    return clean(origin).toLocaleLowerCase() + '\0' + clean(destination).toLocaleLowerCase();
  }

  function enabled(value) {
    var normalized = clean(value).toLocaleLowerCase();
    return value !== false && normalized !== 'false' && normalized !== '0' && normalized !== 'ไม่' && normalized !== 'no';
  }

  function build(routeFareRows, scheduleRows, manifest, serviceGroups) {
    var groupLabels = {
      group_001: 'เส้นทางหลัก',
      group_002: 'เอกมัย / หมอชิต',
      group_003: 'ชลบุรี / พัทยา / ระยอง',
      group_004: 'รังสิต',
      group_005: 'รถไฟ'
    };
    Object.keys(serviceGroups || {}).forEach(function(groupId) {
      var group = serviceGroups[groupId] || {};
      groupLabels[groupId] = group.displayNameTh || group.nameTh || group.label || group.name || groupLabels[groupId] || groupId;
    });
    var fares = values(routeFareRows).map(function(row) {
      if (!row) return row;
      var normalized = Object.assign({}, row);
      normalized.fromNameTh = clean(row.fromNameTh);
      normalized.toNameTh = clean(row.toNameTh);
      return normalized;
    }).filter(function(row) {
      return row && clean(row.fromNameTh) && clean(row.toNameTh) && enabled(row.status);
    });
    var schedules = values(scheduleRows).map(function(row) {
      if (!row) return row;
      var normalized = Object.assign({}, row);
      normalized.originNameTh = clean(row.originNameTh);
      normalized.destinationNameTh = clean(row.destinationNameTh);
      return normalized;
    }).filter(function(row) {
      return row && clean(row.originNameTh) && clean(row.destinationNameTh) && /^\d{2}:\d{2}$/.test(clean(row.departureTime));
    });
    var fareByOd = {};
    var fareByRowId = {};
    var schedulesByOd = {};
    var origins = {};

    fares.forEach(function(row, index) {
      var key = identity(row.fromNameTh, row.toNameTh);
      if (!fareByOd[key]) fareByOd[key] = row;
      if (row.sourceRowId) fareByRowId[row.sourceRowId] = row;
      if (!origins[row.fromNameTh]) origins[row.fromNameTh] = { label: row.fromNameTh, key: row.fromNameTh, order: index };
    });
    schedules.forEach(function(row) {
      var key = identity(row.originNameTh, row.destinationNameTh);
      if (!schedulesByOd[key]) schedulesByOd[key] = [];
      schedulesByOd[key].push(row);
    });

    var destinationOptionsByOrigin = {};
    Object.keys(fareByOd).forEach(function(key) {
      var fare = fareByOd[key];
      if (!destinationOptionsByOrigin[fare.fromNameTh]) destinationOptionsByOrigin[fare.fromNameTh] = [];
      var serviceGroupId = fare.serviceGroupId || fare.groupId || '';
      destinationOptionsByOrigin[fare.fromNameTh].push({
        key: fare.toNameTh,
        label: fare.toNameTh,
        nameTh: fare.toNameTh,
        destinationLabel: fare.toNameTh,
        originDestinationId: fare.fromStopKey || fare.fromNameTh,
        destinationId: fare.toStopKey || fare.toNameTh,
        routeFareRowId: fare.sourceRowId,
        pairKey: fare.sourceRowId,
        routeId: fare.routeId,
        serviceGroupId: serviceGroupId,
        group: groupLabels[serviceGroupId] || serviceGroupId || 'ปลายทางอื่น',
        groupOrder: Number((serviceGroups && serviceGroups[serviceGroupId] || {}).sortOrder || (serviceGroups && serviceGroups[serviceGroupId] || {}).displayOrder || fare.displayOrder) || 0,
        order: Number(fare.displayOrder) || 0,
        bookingEligible: true
      });
    });
    Object.keys(destinationOptionsByOrigin).forEach(function(origin) {
      destinationOptionsByOrigin[origin].sort(function(a, b) { return a.groupOrder - b.groupOrder || a.order - b.order; });
    });

    function selectedRoute(origin, destination) {
      var fare = fareByOd[identity(origin, destination)];
      return routeContract(fare);
    }

    function routeContract(fare) {
      if (!fare) return null;
      var times = (schedulesByOd[identity(fare.fromNameTh, fare.toNameTh)] || []).map(function(row) {
        return {
          time: clean(row.departureTime),
          departureTime: clean(row.departureTime),
          tripId: row.scheduleOfferId,
          scheduleOfferId: row.scheduleOfferId,
          scheduleRowId: row.sourceRowId,
          routeId: row.routeId || fare.routeId,
          capacity: Number(row.capacity) || 0,
          bookingEligible: enabled(row.bookingEnabled),
          note: row.note || ''
        };
      }).sort(function(a, b) { return a.time.localeCompare(b.time); });
      return {
        pairKey: fare.sourceRowId,
        pairId: fare.sourceRowId,
        canonicalPairKey: fare.sourceRowId,
        originLabel: fare.fromNameTh,
        destinationLabel: fare.toNameTh,
        originDestinationId: fare.fromStopKey || fare.fromNameTh,
        destinationId: fare.toStopKey || fare.toNameTh,
        routeId: fare.routeId,
        fareAmount: Number(fare.amount),
        bookingEligible: true,
        referenceOnly: false,
        externalReference: false,
        routeChoiceStatus: 'available',
        segments: [{
          fromLabel: fare.fromNameTh,
          toLabel: fare.toNameTh,
          routeId: fare.routeId,
          fareAmount: Number(fare.amount),
          bookingEligible: true,
          referenceOnly: false,
          routeChoiceStatus: 'available',
          times: times
        }]
      };
    }

    return {
      manifest: manifest || {},
      routeFareRowCount: fares.length,
      scheduleRowCount: schedules.length,
      originOptions: Object.keys(origins).map(function(key) { return origins[key]; }).sort(function(a, b) { return a.order - b.order; }),
      destinationOptionsByOrigin: destinationOptionsByOrigin,
      selectedRoute: selectedRoute
      ,selectedRouteByRowId: function(rowId) { return routeContract(fareByRowId[rowId]); }
    };
  }

  global.SLTransitWorkbookBookingSource = { build: build, identity: identity };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitWorkbookBookingSource;
})(typeof window !== 'undefined' ? window : globalThis);
