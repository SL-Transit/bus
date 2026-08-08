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

  function groupCapabilities(group) {
    group = group || {};
    var mode = clean(group.operationMode || group.fleetMode || group.providerMode).toLowerCase();
    var scheduleOnly = mode === 'schedule_only' || mode === 'schedule-only' || mode === 'external_schedule_only' || group.hasFleet === false || group.scheduleOnly === true;
    if (!mode) mode = scheduleOnly ? 'schedule_only' : 'integrated';
    return {
      operationMode: mode,
      bookingMode: scheduleOnly ? 'reference_only' : (clean(group.bookingMode) || 'bookable'),
      trackingMode: scheduleOnly || group.hasLiveLocation === false || group.liveTracking === false ? 'schedule_only' : 'live',
      hasFleet: !scheduleOnly && group.hasFleet !== false,
      hasLiveLocation: !scheduleOnly && group.hasLiveLocation !== false && group.liveTracking !== false,
      hasQueue: !scheduleOnly && group.hasQueue !== false,
      canBook: !scheduleOnly && group.canBook !== false
    };
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
      var serviceGroupId = fare.serviceGroupId || fare.groupId || '';
      var serviceGroup = serviceGroups && serviceGroups[serviceGroupId] || {};
      var capabilities = groupCapabilities(serviceGroup);
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
        operatorId: serviceGroup.operatorId || serviceGroup.providerId || serviceGroupId,
        operationMode: capabilities.operationMode,
        bookingMode: capabilities.bookingMode,
        trackingMode: capabilities.trackingMode,
        hasFleet: capabilities.hasFleet,
        hasLiveLocation: capabilities.hasLiveLocation,
        hasQueue: capabilities.hasQueue,
        canBook: capabilities.canBook,
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
      var serviceGroupId = fare.serviceGroupId || fare.groupId || '';
      var serviceGroup = serviceGroups && serviceGroups[serviceGroupId] || {};
      var capabilities = groupCapabilities(serviceGroup);
      var times = (schedulesByOd[identity(fare.fromNameTh, fare.toNameTh)] || []).map(function(row) {
        return {
          time: clean(row.departureTime),
          departureTime: clean(row.departureTime),
          tripId: row.scheduleOfferId,
          scheduleOfferId: row.scheduleOfferId,
          scheduleRowId: row.sourceRowId,
          routeId: row.routeId || fare.routeId,
          fromStopKey: row.fromStopKey || fare.fromStopKey || fare.fromNameTh,
          toStopKey: row.toStopKey || fare.toStopKey || fare.toNameTh,
          arrivalTime: clean(row.arrivalTime || row.arriveTime || row.destinationArrivalTime),
          networkLegReady: !!clean(row.arrivalTime || row.arriveTime || row.destinationArrivalTime),
          serviceGroupId: row.serviceGroupId || serviceGroupId,
          operatorId: row.operatorId || fare.operatorId || serviceGroup.operatorId || serviceGroup.providerId || serviceGroupId,
          operationMode: capabilities.operationMode,
          bookingMode: capabilities.bookingMode,
          trackingMode: capabilities.trackingMode,
          scheduleOnly: capabilities.operationMode === 'schedule_only',
          noLiveTracking: capabilities.trackingMode === 'schedule_only',
          capacity: Number(row.capacity) || 0,
          bookingEligible: capabilities.canBook && enabled(row.bookingEnabled),
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
        serviceGroupId: serviceGroupId,
        operatorId: fare.operatorId || serviceGroup.operatorId || serviceGroup.providerId || serviceGroupId,
        operationMode: capabilities.operationMode,
        bookingMode: capabilities.bookingMode,
        trackingMode: capabilities.trackingMode,
        hasFleet: capabilities.hasFleet,
        hasLiveLocation: capabilities.hasLiveLocation,
        hasQueue: capabilities.hasQueue,
        fareAmount: Number(fare.amount),
        bookingEligible: capabilities.canBook,
        referenceOnly: capabilities.bookingMode === 'reference_only',
        externalReference: capabilities.operationMode === 'schedule_only',
        routeChoiceStatus: capabilities.canBook ? 'available' : 'reference_only',
        segments: [{
          fromLabel: fare.fromNameTh,
          toLabel: fare.toNameTh,
          routeId: fare.routeId,
          serviceGroupId: serviceGroupId,
          operatorId: fare.operatorId || serviceGroup.operatorId || serviceGroup.providerId || serviceGroupId,
          operationMode: capabilities.operationMode,
          bookingMode: capabilities.bookingMode,
          trackingMode: capabilities.trackingMode,
          fareAmount: Number(fare.amount),
          bookingEligible: capabilities.canBook,
          referenceOnly: capabilities.bookingMode === 'reference_only',
          externalReference: capabilities.operationMode === 'schedule_only',
          routeChoiceStatus: capabilities.canBook ? 'available' : 'reference_only',
          times: times
        }]
      };
    }

    function getNetworkLegs(serviceDate) {
      var legs = [];
      Object.keys(fareByOd).forEach(function(key) {
        var fare = fareByOd[key], serviceGroupId = fare.serviceGroupId || fare.groupId || '', serviceGroup = serviceGroups && serviceGroups[serviceGroupId] || {}, capabilities = groupCapabilities(serviceGroup);
        (schedulesByOd[key] || []).forEach(function(row) {
          var arrivalTime = clean(row.arrivalTime || row.arriveTime || row.destinationArrivalTime);
          legs.push({
            tripId: row.scheduleOfferId || row.sourceRowId,
            scheduleRowId: row.sourceRowId,
            routeId: row.routeId || fare.routeId,
            operatorId: row.operatorId || fare.operatorId || serviceGroup.operatorId || serviceGroup.providerId || serviceGroupId,
            serviceGroupId: row.serviceGroupId || serviceGroupId,
            fromStopKey: row.fromStopKey || fare.fromStopKey || fare.fromNameTh || '',
            toStopKey: row.toStopKey || fare.toStopKey || fare.toNameTh || '',
            departureTime: clean(row.departureTime),
            arrivalTime: arrivalTime,
            serviceDays: row.serviceDays,
            operationMode: capabilities.operationMode,
            bookingMode: capabilities.bookingMode,
            trackingMode: capabilities.trackingMode,
            networkLegReady: !!arrivalTime,
            active: enabled(row.status)
          });
        });
      });
      return legs;
    }

    return {
      manifest: manifest || {},
      serviceGroups: serviceGroups || {},
      routeFareRowCount: fares.length,
      scheduleRowCount: schedules.length,
      originOptions: Object.keys(origins).map(function(key) { return origins[key]; }).sort(function(a, b) { return a.order - b.order; }),
      destinationOptionsByOrigin: destinationOptionsByOrigin,
      selectedRoute: selectedRoute
      ,selectedRouteByRowId: function(rowId) { return routeContract(fareByRowId[rowId]); }
      ,getNetworkLegs: getNetworkLegs
    };
  }

  global.SLTransitWorkbookBookingSource = { build: build, identity: identity };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitWorkbookBookingSource;
})(typeof window !== 'undefined' ? window : globalThis);
