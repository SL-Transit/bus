(function(global) {
  'use strict';

  function values(value) {
    return Array.isArray(value) ? value : Object.keys(value || {}).map(function(key) { return value[key]; });
  }

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function identity(origin, destination) {
    return clean(origin).toLocaleLowerCase() + '\0' + clean(destination).toLocaleLowerCase();
  }

  function enabled(value) {
    var normalized = clean(value).toLocaleLowerCase();
    return value !== false && normalized !== 'false' && normalized !== '0' && normalized !== 'ไม่' && normalized !== 'no';
  }

  function build(routeFareRows, scheduleRows, manifest) {
    var fares = values(routeFareRows).filter(function(row) {
      return row && clean(row.fromNameTh) && clean(row.toNameTh) && enabled(row.status);
    });
    var schedules = values(scheduleRows).filter(function(row) {
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
        order: Number(fare.displayOrder) || 0,
        bookingEligible: true
      });
    });
    Object.keys(destinationOptionsByOrigin).forEach(function(origin) {
      destinationOptionsByOrigin[origin].sort(function(a, b) { return a.order - b.order; });
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
