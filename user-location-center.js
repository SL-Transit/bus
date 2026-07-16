(function(global) {
  'use strict';

  function num(value) {
    var n = Number(value);
    return isFinite(n) ? n : NaN;
  }

  function normalizePoint(input) {
    input = input || {};
    var coords = input.coords || input;
    var lat = num(coords.lat == null ? coords.latitude : coords.lat);
    var lng = num(coords.lng == null ? (coords.lon == null ? coords.longitude : coords.lon) : coords.lng);
    if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return null;
    return { lat: lat, lng: lng, lon: lng };
  }

  function geolocationApi() {
    return global.navigator && global.navigator.geolocation &&
      typeof global.navigator.geolocation.getCurrentPosition === 'function'
      ? global.navigator.geolocation
      : null;
  }

  function geolocationOptions(options) {
    options = options || {};
    return {
      enableHighAccuracy: options.enableHighAccuracy !== false,
      timeout: Number(options.timeout || 12000),
      maximumAge: Number(options.maximumAge == null ? 30000 : options.maximumAge)
    };
  }

  function requestCurrentPosition(options) {
    options = options || {};
    var api = geolocationApi();
    if (!api) {
      return Promise.resolve({ ok: false, reason: 'unsupported', point: null, error: null });
    }
    return new Promise(function(resolve) {
      api.getCurrentPosition(function(position) {
        var point = normalizePoint(position);
        if (!point) {
          resolve({ ok: false, reason: 'invalid_position', point: null, error: null, raw: position || null });
          return;
        }
        resolve({ ok: true, reason: 'ok', point: point, error: null, raw: position || null });
      }, function(error) {
        resolve({ ok: false, reason: 'error', point: null, error: error || null });
      }, geolocationOptions(options));
    });
  }

  function focusCurrentUser(options) {
    options = options || {};
    if (typeof options.setBusy === 'function') options.setBusy(true);
    return requestCurrentPosition(options).then(function(result) {
      if (typeof options.setBusy === 'function') options.setBusy(false);
      if (result.ok && result.point) {
        var adapter = options.mapAdapter || {};
        if (typeof adapter.focusUserLocation === 'function') {
          adapter.focusUserLocation(result.point, options);
        } else if (typeof adapter.focusPoint === 'function') {
          adapter.focusPoint(result.point, options);
        }
        if (typeof options.onSuccess === 'function') options.onSuccess(result.point, result);
      } else if (typeof options.onError === 'function') {
        options.onError(result);
      }
      return result;
    });
  }

  global.SLTransitUserLocation = {
    normalizePoint: normalizePoint,
    requestCurrentPosition: requestCurrentPosition,
    focusCurrentUser: focusCurrentUser
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.SLTransitUserLocation;
  }
})(typeof window !== 'undefined' ? window : globalThis);
