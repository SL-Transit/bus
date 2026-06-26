(function(global) {
  'use strict';

  var SCHEMA_VERSION = 'catalog/v1';

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function values(obj, callback) {
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

  function makeVersion(now) {
    var d = now || new Date();
    function pad(n) { return String(n).padStart(2, '0'); }
    return [
      d.getFullYear(),
      pad(d.getMonth() + 1),
      pad(d.getDate())
    ].join('-') + '-' + [
      pad(d.getHours()),
      pad(d.getMinutes()),
      pad(d.getSeconds())
    ].join('');
  }

  function stopName(stop, key) {
    stop = stop || {};
    return stop.stopNameTh || stop.name || stop.stopTh || key;
  }

  function buildStops(routeData) {
    var out = {};
    values(routeData && routeData.stops, function(key, stop) {
      out[key] = {
        id: key,
        nameTh: stopName(stop, key),
        lat: stop.lat == null ? null : Number(stop.lat),
        lng: stop.lng == null ? null : Number(stop.lng),
        icon: stop.icon || '',
        order: Number(stop.order) || 999999,
        stopType: stop.stopType || 'main',
        bookingEnabled: stop.bookingEnabled !== false,
        note: stop.note || '',
        legacy: clone(stop)
      };
    });
    return out;
  }

  function buildRouteGroups(settingsRoutes) {
    var out = {};
    values(settingsRoutes, function(groupKey, group) {
      out[groupKey] = {
        id: group.id || groupKey,
        key: groupKey,
        name: group.name || group.title || groupKey,
        connectionType: group.connectionType || 'direct',
        transferHubStopKey: group.transferHubStopKey || group.branchHubStopKey || '',
        branchHubStopKey: group.branchHubStopKey || group.transferHubStopKey || '',
        minTransferMinutes: Number(group.minTransferMinutes) || 0,
        maxPreferredWaitMinutes: Number(group.maxPreferredWaitMinutes) || 0,
        idealWaitMinutes: Number(group.idealWaitMinutes) || 0,
        reliabilityScore: group.reliabilityScore == null ? null : Number(group.reliabilityScore),
        passengerChoiceEnabled: group.passengerChoiceEnabled !== false,
        isActive: group.isActive !== false,
        sortOrder: Number(group.sortOrder) || 0,
        legacy: clone(group)
      };
      delete out[groupKey].legacy.routes;
    });
    return out;
  }

  function buildRoutesAndTrips(settingsRoutes) {
    var routes = {};
    var trips = {};
    var fares = {};
    var closures = {};
    var capacities = {};

    values(settingsRoutes, function(groupKey, group) {
      var groupId = safeId(group.id || groupKey, groupKey);
      (group.routes || []).forEach(function(route, routeIndex) {
        if (!route) return;
        var routeId = safeId(route.routeId || groupId + '_' + routeIndex, groupId + '_' + routeIndex);
        routes[routeId] = {
          id: routeId,
          groupId: groupId,
          groupKey: groupKey,
          from: route.from || '',
          to: route.to || '',
          fromStopKey: route.fromStopKey || '',
          toStopKey: route.toStopKey || '',
          isActive: route.isActive !== false,
          sortOrder: Number(route.sortOrder == null ? routeIndex : route.sortOrder),
          legacy: clone(route)
        };
        delete routes[routeId].legacy.times;
        delete routes[routeId].legacy.disabledTimes;
        delete routes[routeId].legacy.capacityByTime;
        delete routes[routeId].legacy.closedStops;
        delete routes[routeId].legacy.scheduleMeta;

        fares[routeId] = {
          routeId: routeId,
          amount: Number(route.price) || 0,
          currency: 'THB'
        };

        (route.times || []).forEach(function(time, timeIndex) {
          var timeKey = String(time || '').slice(0, 5);
          if (!timeKey) return;
          var meta = route.scheduleMeta && route.scheduleMeta[timeKey] || {};
          var tripId = safeId(meta.tripId || routeId + '_' + timeKey.replace(':', ''), routeId + '_' + timeIndex);
          trips[tripId] = {
            id: tripId,
            routeId: routeId,
            groupId: groupId,
            departTime: timeKey,
            from: route.from || '',
            to: route.to || '',
            isActive: route.isActive !== false,
            bookingEnabled: (route.disabledTimes || []).indexOf(timeKey) === -1,
            note: meta.note || ''
          };
          if ((route.disabledTimes || []).indexOf(timeKey) !== -1 || route.closedStops && route.closedStops[timeKey]) {
            closures[tripId] = {
              tripId: tripId,
              time: timeKey,
              reason: 'admin_closed',
              closedStops: route.closedStops && route.closedStops[timeKey] || ['__route__']
            };
          }
          var capacity = Number(route.capacityByTime && route.capacityByTime[timeKey] || route.defaultCapacity);
          if (Number.isInteger(capacity) && capacity > 0) {
            capacities[tripId] = {
              tripId: tripId,
              time: timeKey,
              seats: capacity
            };
          }
        });
      });
    });

    return { routes: routes, trips: trips, fares: fares, closures: closures, capacities: capacities };
  }

  function buildStopTimes(routeData) {
    var stopTimes = {};
    values(routeData && routeData.queues, function(queueKey, queue) {
      values(queue && queue.trips, function(tripKey, trip) {
        var id = safeId(trip.tripId || tripKey || queueKey + '_' + tripKey, queueKey + '_' + tripKey);
        stopTimes[id] = {
          id: id,
          queueNo: Number(trip.queueNo || queueKey) || 0,
          tripNo: trip.tripNo || trip.tripIndex || tripKey,
          routeKey: trip.routeKey || '',
          routeNameTh: trip.routeNameTh || '',
          departTime: trip.departTime || trip.time || '',
          direction: trip.direction || trip.routeDirection || '',
          serviceType: trip.serviceType || (trip.scheduleOnly || trip.noLiveTracking ? 'schedule-only' : 'normal'),
          scheduleOnly: trip.scheduleOnly === true,
          noLiveTracking: trip.noLiveTracking === true,
          stops: clone(trip.stops || [])
        };
      });
    });
    return stopTimes;
  }

  function buildFromLegacy(input) {
    input = input || {};
    var settingsRoutes = clone(input.settingsRoutes || input.routes || {});
    var routeData = clone(input.routeData || {});
    var parts = buildRoutesAndTrips(settingsRoutes);
    var version = input.version || makeVersion();
    return {
      schemaVersion: SCHEMA_VERSION,
      version: version,
      publishedAt: input.publishedAt || new Date().toISOString(),
      source: input.source || 'admin_legacy_adapter',
      metadata: {
        legacyRouteGroupCount: Object.keys(settingsRoutes).length,
        legacyStopCount: Object.keys(routeData.stops || {}).length,
        legacyQueueCount: Object.keys(routeData.queues || {}).length
      },
      stops: buildStops(routeData),
      routeGroups: buildRouteGroups(settingsRoutes),
      routes: parts.routes,
      trips: parts.trips,
      stopTimes: buildStopTimes(routeData),
      fares: parts.fares,
      closures: parts.closures,
      capacities: parts.capacities,
      legacy: {
        settingsRoutes: settingsRoutes,
        routeData: routeData
      }
    };
  }

  function legacySettingsRoutes(catalog) {
    return clone(catalog && catalog.legacy && catalog.legacy.settingsRoutes || {});
  }

  function legacyRouteData(catalog) {
    return clone(catalog && catalog.legacy && catalog.legacy.routeData || {});
  }

  function loadPublished(db) {
    if (!db) return Promise.resolve(null);
    return db.ref('settings/currentCatalogVersion').once('value').then(function(versionSnap) {
      var version = versionSnap.val();
      if (version) {
        return db.ref('catalogs/' + version).once('value').then(function(catalogSnap) {
          return catalogSnap.val() || null;
        });
      }
      return db.ref('publishedCatalog').once('value').then(function(catalogSnap) {
        return catalogSnap.val() || null;
      });
    });
  }

  global.SLTransitCatalog = {
    schemaVersion: SCHEMA_VERSION,
    makeVersion: makeVersion,
    buildFromLegacy: buildFromLegacy,
    legacySettingsRoutes: legacySettingsRoutes,
    legacyRouteData: legacyRouteData,
    loadPublished: loadPublished
  };
})(window);
