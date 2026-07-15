(function(global) {
  'use strict';

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function each(obj, callback) {
    if (!obj) return;
    if (Array.isArray(obj)) {
      obj.forEach(function(item, index) {
        if (item) callback(String(index), item);
      });
      return;
    }
    Object.keys(obj).forEach(function(key) {
      if (obj[key]) callback(key, obj[key]);
    });
  }

  function safeId(value, fallback) {
    var id = String(value || fallback || '').trim()
      .replace(/[^A-Za-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return id || String(fallback || 'id');
  }
  function cleanStopLabel(value) {
    return String(value || '').replace(/\s+/g, '').replace(/[().]/g, '').toLowerCase();
  }

  var CANONICAL_MAIN_STOP_ORDER = [
    ['ฉะเชิงเทรา', 'ฉะเชิงเทราแปดริ้ว', 'แปดริ้ว'],
    ['พนมสารคาม'],
    ['ท่ารถสนามชัยเขต', 'สนามชัยเขต'],
    ['กม1'],
    ['กม7'],
    ['ห้วยโสม'],
    ['ท่าตะเกียบ'],
    ['หนองคอก'],
    ['คลองตะเคียน'],
    ['หนองเรือ'],
    ['ไพรจิต', 'ไพจิตร'],
    ['ทุ่งกบินทร์'],
    ['สี่แยกโคนม'],
    ['วังน้ำเย็น'],
    ['คลองหาด']
  ].map(function(aliases, index) {
    return {
      order: index + 1,
      aliases: aliases.map(cleanStopLabel)
    };
  });

  function canonicalMainStopOrderValue(clean, fallbackValue) {
    for (var i = 0; i < CANONICAL_MAIN_STOP_ORDER.length; i++) {
      var item = CANONICAL_MAIN_STOP_ORDER[i];
      for (var j = 0; j < item.aliases.length; j++) {
        var alias = item.aliases[j];
        if (/^กม\d+$/.test(alias) || /^กม\d+$/.test(clean)) {
          if (clean === alias) return item.order;
          continue;
        }
        if (clean === alias || (alias.length >= 3 && (clean.indexOf(alias) !== -1 || alias.indexOf(clean) !== -1))) {
          return item.order;
        }
      }
    }
    return fallbackValue;
  }

  function stopCache() {
    return global.SLTransit && global.SLTransit._stopsCache || {};
  }

  function stopAliases(key, stop) {
    stop = stop || {};
    var aliases = [key, stop.id, stop.stopKey, stop.nameTh, stop.stopNameTh, stop.name, stop.stopTh, stop.nameEn, stop.code];
    if (Array.isArray(stop.aliases)) aliases = aliases.concat(stop.aliases);
    return aliases.filter(Boolean);
  }

  function stopOrderValue(value, fallback) {
    var clean = cleanStopLabel(value);
    var fallbackValue = fallback == null ? 999999 : Number(fallback);
    if (!clean) return fallbackValue;
    var stops = stopCache();
    var found = fallbackValue;
    Object.keys(stops).some(function(key) {
      var stop = stops[key] || {};
      var aliases = stopAliases(key, stop);
      for (var i = 0; i < aliases.length; i++) {
        var alias = cleanStopLabel(aliases[i]);
        if (clean === alias || (alias.length >= 6 && (clean.indexOf(alias) !== -1 || alias.indexOf(clean) !== -1))) {
          found = Number(stop.order == null ? fallbackValue : stop.order) || fallbackValue;
          return true;
        }
      }
      return false;
    });
    return found === fallbackValue ? canonicalMainStopOrderValue(clean, fallbackValue) : found;
  }

  function canonicalStopOrder() {
    var stops = stopCache();
    return Object.keys(stops).map(function(key) {
      var stop = stops[key] || {};
      return {
        label: stop.nameTh || stop.stopNameTh || stop.name || stop.stopTh || key,
        order: Number(stop.order == null ? 999999 : stop.order)
      };
    }).sort(function(a, b) {
      return a.order - b.order || String(a.label).localeCompare(String(b.label));
    }).map(function(item) {
      return item.label;
    });
  }

  function stopName(catalog, stopKey) {
    var stop = catalog && catalog.stops && catalog.stops[stopKey] || {};
    return stop.nameTh || stop.stopNameTh || stop.name || stop.stopTh || stopKey || '';
  }

  function stopKeyForName(catalog, value) {
    var target = String(value || '').replace(/\s+/g, '').toLowerCase();
    var found = '';
    each(catalog && catalog.stops, function(key, stop) {
      if (found) return;
      var names = [key, stop && stop.id, stop && stop.nameTh, stop && stop.stopNameTh, stop && stop.name, stop && stop.stopTh];
      for (var i = 0; i < names.length; i++) {
        if (String(names[i] || '').replace(/\s+/g, '').toLowerCase() === target) {
          found = key;
          return;
        }
      }
    });
    return found;
  }

  function routeLabel(catalog, route, field, stopField) {
    return route && route[field] || stopName(catalog, route && route[stopField]) || '';
  }

  function sortedTripsForRoute(catalog, routeId) {
    var out = [];
    each(catalog && catalog.trips, function(tripId, trip) {
      if (trip && String(trip.routeId || '') === String(routeId || '')) out.push(trip);
    });
    out.sort(function(a, b) {
      return String(a.departTime || '').localeCompare(String(b.departTime || '')) || String(a.id || '').localeCompare(String(b.id || ''));
    });
    return out;
  }

  function tripStopTimes(catalog, trip) {
    var byTrip = catalog && catalog.stopTimes && catalog.stopTimes[trip && trip.id];
    if (byTrip && Array.isArray(byTrip.stops)) return byTrip.stops;
    var matches = [];
    each(catalog && catalog.stopTimes, function(id, stopTime) {
      if (!stopTime) return;
      if (String(stopTime.tripId || '') === String(trip && trip.id || '') && Array.isArray(stopTime.stops)) matches = stopTime.stops;
    });
    return matches;
  }

  function settingsRoutes(catalog) {
    if (!catalog) return {};
    var groups = {};
    each(catalog.routeGroups, function(groupKey, group) {
      var id = safeId(group && (group.id || group.key) || groupKey, groupKey);
      groups[id] = {
        id: id,
        name: group && (group.name || group.title) || groupKey,
        connectionType: group && group.connectionType || 'direct',
        transferHubStopKey: group && (group.transferHubStopKey || group.branchHubStopKey) || '',
        branchHubStopKey: group && (group.branchHubStopKey || group.transferHubStopKey) || '',
        minTransferMinutes: Number(group && group.minTransferMinutes) || 0,
        maxPreferredWaitMinutes: Number(group && group.maxPreferredWaitMinutes) || 0,
        idealWaitMinutes: Number(group && group.idealWaitMinutes) || 0,
        reliabilityScore: group && group.reliabilityScore == null ? null : Number(group && group.reliabilityScore),
        passengerChoiceEnabled: !group || group.passengerChoiceEnabled !== false,
        isActive: !group || group.isActive !== false,
        sortOrder: Number(group && group.sortOrder) || 0,
        routes: []
      };
    });

    each(catalog.routes, function(routeId, route) {
      if (!route) return;
      var groupId = safeId(route.groupId || route.groupKey || 'routes', 'routes');
      if (!groups[groupId]) {
        groups[groupId] = { id: groupId, name: groupId, connectionType: 'direct', isActive: true, sortOrder: 0, routes: [] };
      }
      var times = [];
      var disabledTimes = [];
      var capacityByTime = {};
      var closedStops = {};
      var scheduleMeta = {};
      sortedTripsForRoute(catalog, route.id || routeId).forEach(function(trip) {
        var time = String(trip.departTime || trip.time || '').slice(0, 5);
        if (!time) return;
        if (times.indexOf(time) === -1) times.push(time);
        scheduleMeta[time] = Object.assign({}, scheduleMeta[time] || {}, {
          tripId: trip.id || '',
          note: trip.note || '',
          serviceType: trip.serviceType || '',
          scheduleOnly: trip.scheduleOnly === true,
          noLiveTracking: trip.noLiveTracking === true
        });
        if (trip.bookingEnabled === false) disabledTimes.push(time);
        var capacity = catalog.capacities && catalog.capacities[trip.id];
        if (capacity && Number(capacity.seats) > 0) capacityByTime[time] = Number(capacity.seats);
        var closure = catalog.closures && catalog.closures[trip.id];
        if (closure) {
          if (disabledTimes.indexOf(time) === -1) disabledTimes.push(time);
          closedStops[time] = clone(closure.closedStops || ['__route__']);
        }
      });
      times.sort();
      var fare = catalog.fares && catalog.fares[route.id || routeId] || {};
      groups[groupId].routes.push({
        routeId: route.id || routeId,
        groupId: groupId,
        groupName: groups[groupId].name,
        from: routeLabel(catalog, route, 'from', 'fromStopKey'),
        to: routeLabel(catalog, route, 'to', 'toStopKey'),
        fromStopKey: route.fromStopKey || stopKeyForName(catalog, route.from),
        toStopKey: route.toStopKey || stopKeyForName(catalog, route.to),
        times: times,
        disabledTimes: disabledTimes,
        closedStops: closedStops,
        capacityByTime: capacityByTime,
        defaultCapacity: Number(route.defaultCapacity) || 0,
        scheduleMeta: scheduleMeta,
        price: Number(fare.amount || route.price) || 0,
        isActive: route.isActive !== false,
        sortOrder: stopOrderValue(routeLabel(catalog, route, 'to', 'toStopKey'), Number(route.sortOrder) || 999999)
      });
    });

    Object.keys(groups).forEach(function(groupId) {
      groups[groupId].routes.sort(function(a, b) {
        return stopOrderValue(a.from, Number(a.sortOrder) || 999999) - stopOrderValue(b.from, Number(b.sortOrder) || 999999)
          || stopOrderValue(a.to, Number(a.sortOrder) || 999999) - stopOrderValue(b.to, Number(b.sortOrder) || 999999)
          || String(a.from).localeCompare(String(b.from))
          || String(a.to).localeCompare(String(b.to));
      });
    });
    return groups;
  }

  function routeData(catalog) {
    if (!catalog) return {};
    var stops = {};
    each(catalog.stops, function(key, stop) {
      stops[key] = Object.assign({}, clone(stop), {
        id: key,
        stopNameTh: stop && (stop.stopNameTh || stop.nameTh || stop.name || stop.stopTh) || key,
        name: stop && (stop.name || stop.nameTh || stop.stopNameTh || stop.stopTh) || key,
        lat: stop && stop.lat == null ? null : Number(stop && stop.lat),
        lng: stop && stop.lng == null ? null : Number(stop && stop.lng),
        order: stopOrderValue(stop && (stop.stopNameTh || stop.nameTh || stop.name || stop.stopTh) || key, Number(stop && stop.order) || 999999),
        stopType: stop && (stop.stopType || stop.type) || 'main',
        bookingEnabled: !stop || stop.bookingEnabled !== false
      });
    });

    var queues = {};
    each(catalog.stopTimes, function(stopTimeId, stopTime) {
      if (!stopTime) return;
      var queueNo = Number(stopTime.queueNo || 0);
      if (!queueNo || !Array.isArray(stopTime.stops)) return;
      var queueKey = String(queueNo);
      if (!queues[queueKey]) queues[queueKey] = { trips: {} };
      var tripKey = String(stopTime.tripNo || stopTime.tripIndex || stopTimeId);
      queues[queueKey].trips[tripKey] = {
        tripId: stopTime.id || stopTimeId,
        queueNo: queueNo,
        tripNo: tripKey,
        direction: stopTime.direction || stopTime.routeDirection || '',
        routeKey: stopTime.routeKey || '',
        routeNameTh: stopTime.routeNameTh || '',
        departTime: stopTime.departTime || '',
        serviceType: stopTime.serviceType || (stopTime.scheduleOnly || stopTime.noLiveTracking ? 'schedule-only' : 'normal'),
        scheduleOnly: stopTime.scheduleOnly === true,
        noLiveTracking: stopTime.noLiveTracking === true,
        stops: clone(stopTime.stops)
      };
    });
    return { stops: stops, queues: queues };
  }

  function catalogView(catalog) {
    if (!catalog) return { settingsRoutes: {}, routeData: {}, version: '' };
    var nativeRoutes = settingsRoutes(catalog);
    var nativeRouteData = routeData(catalog);
    var legacyRoutes = global.SLTransitCatalog && typeof global.SLTransitCatalog.legacySettingsRoutes === 'function'
      ? global.SLTransitCatalog.legacySettingsRoutes(catalog)
      : {};
    var legacyRouteData = global.SLTransitCatalog && typeof global.SLTransitCatalog.legacyRouteData === 'function'
      ? global.SLTransitCatalog.legacyRouteData(catalog)
      : {};
    var nativeHasStops = !!(nativeRouteData.stops && Object.keys(nativeRouteData.stops).length);
    var nativeHasQueues = !!(nativeRouteData.queues && Object.keys(nativeRouteData.queues).length);
    var legacyHasQueues = !!(legacyRouteData.queues && Object.keys(legacyRouteData.queues).length);
    return {
      version: String(catalog.version || ''),
      settingsRoutes: Object.keys(nativeRoutes).length ? nativeRoutes : legacyRoutes,
      routeData: nativeHasQueues
        ? nativeRouteData
        : legacyHasQueues
          ? legacyRouteData
          : nativeHasStops
            ? nativeRouteData
            : legacyRouteData
    };
  }

  function matchText(a, b) {
    return String(a || '').replace(/\s+/g, '').toLowerCase() === String(b || '').replace(/\s+/g, '').toLowerCase();
  }

  function findRoute(catalog, origin, destination) {
    var best = null;
    each(catalog && catalog.routes, function(routeId, route) {
      if (best || !route || route.isActive === false) return;
      var from = routeLabel(catalog, route, 'from', 'fromStopKey');
      var to = routeLabel(catalog, route, 'to', 'toStopKey');
      if (matchText(from, origin) && matchText(to, destination)) {
        best = route;
        best.id = best.id || routeId;
      }
    });
    return best;
  }

  function findTrip(catalog, routeId, time) {
    var timeKey = String(time || '').slice(0, 5);
    var best = null;
    each(catalog && catalog.trips, function(tripId, trip) {
      if (best || !trip) return;
      if (String(trip.routeId || '') === String(routeId || '') && String(trip.departTime || '').slice(0, 5) === timeKey) {
        best = trip;
        best.id = best.id || tripId;
      }
    });
    return best;
  }

  function isTripDisabled(catalog, trip) {
    return !!(trip && trip.bookingEnabled === false || trip && catalog && catalog.closures && catalog.closures[trip.id]);
  }

  function makeBookingContext(catalog, route, trip, time) {
    var fare = catalog && catalog.fares && catalog.fares[route.id] || {};
    var capacity = trip && catalog && catalog.capacities && catalog.capacities[trip.id] || null;
    var closure = trip && catalog && catalog.closures && catalog.closures[trip.id] || null;
    return {
      catalogVersion: String(catalog && catalog.version || ''),
      routeId: route.id || '',
      tripId: trip && trip.id || '',
      fare: Number(fare.amount || route.price) || 0,
      capacity: capacity && Number(capacity.seats) > 0 ? Number(capacity.seats) : 0,
      closed: !!closure || !!(trip && trip.bookingEnabled === false),
      closedStops: closure && closure.closedStops || [],
      departTime: trip && trip.departTime || String(time || '').slice(0, 5),
      fromStopKey: route.fromStopKey || '',
      toStopKey: route.toStopKey || '',
      route: route,
      trip: trip || null
    };
  }

  function bookingContext(catalog, origin, destination, time) {
    var route = findRoute(catalog, origin, destination);
    if (!route) return null;
    var trip = findTrip(catalog, route.id, time);
    return makeBookingContext(catalog, route, trip, time);
  }

  function routeTripContext(catalog, routeId, tripId, time) {
    var route = catalog && catalog.routes && catalog.routes[routeId];
    if (!route) return null;
    route.id = route.id || routeId;
    var trip = tripId && catalog && catalog.trips && catalog.trips[tripId] || null;
    if (!trip && time) trip = findTrip(catalog, route.id, time);
    if (trip) trip.id = trip.id || tripId;
    return makeBookingContext(catalog, route, trip, time);
  }

  function routeTimes(catalog, origin, destination, includeDisabled) {
    var route = findRoute(catalog, origin, destination);
    if (!route) return null;
    var out = [];
    sortedTripsForRoute(catalog, route.id).forEach(function(trip) {
      var time = String(trip.departTime || trip.time || '').slice(0, 5);
      if (!time) return;
      if (includeDisabled !== true && isTripDisabled(catalog, trip)) return;
      if (out.indexOf(time) === -1) out.push(time);
    });
    out.sort();
    return out;
  }

  function routeDisabledTimes(catalog, origin, destination) {
    var route = findRoute(catalog, origin, destination);
    if (!route) return null;
    var out = [];
    sortedTripsForRoute(catalog, route.id).forEach(function(trip) {
      var time = String(trip.departTime || trip.time || '').slice(0, 5);
      if (!time || !isTripDisabled(catalog, trip)) return;
      if (out.indexOf(time) === -1) out.push(time);
    });
    out.sort();
    return out;
  }

  function routeTimesByDestination(catalog, destination, origin, includeDisabled) {
    var matched = false;
    var out = [];
    each(catalog && catalog.routes, function(routeId, route) {
      if (!route || route.isActive === false) return;
      var from = routeLabel(catalog, route, 'from', 'fromStopKey');
      var to = routeLabel(catalog, route, 'to', 'toStopKey');
      if (origin && !matchText(from, origin)) return;
      if (!matchText(to, destination)) return;
      matched = true;
      route.id = route.id || routeId;
      sortedTripsForRoute(catalog, route.id).forEach(function(trip) {
        var time = String(trip.departTime || trip.time || '').slice(0, 5);
        if (!time) return;
        if (includeDisabled !== true && isTripDisabled(catalog, trip)) return;
        if (out.indexOf(time) === -1) out.push(time);
      });
    });
    if (!matched) return null;
    out.sort();
    return out;
  }

  global.SLTransitERP = {
    settingsRoutes: settingsRoutes,
    routeData: routeData,
    catalogView: catalogView,
    findRoute: findRoute,
    findTrip: findTrip,
    bookingContext: bookingContext,
    routeTripContext: routeTripContext,
    routeTimes: routeTimes,
    routeDisabledTimes: routeDisabledTimes,
    routeTimesByDestination: routeTimesByDestination,
    stopOrderValue: stopOrderValue,
    canonicalStopOrder: canonicalStopOrder
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitERP;
})(typeof window !== 'undefined' ? window : globalThis);
