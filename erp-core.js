(function(global) {
  'use strict';

  var _ready = false;
  var _initializing = null;
  var _callbacks = [];

  function exposeLoadedModules() {
    global.SLTransit = global.SLTransit || {};
    if (global.SLTransitERP && !global.SLTransit.erp) global.SLTransit.erp = global.SLTransitERP;
    if (global.SLTransitSchedule && !global.SLTransit.sched) global.SLTransit.sched = global.SLTransitSchedule;
    if (global.SLTransitNetwork && !global.SLTransit.net) global.SLTransit.net = global.SLTransitNetwork;
    if (global.SLTransitGeo && !global.SLTransit.geo) global.SLTransit.geo = global.SLTransitGeo;
    if (global.SLBookingCapacity && !global.SLTransit.cap) global.SLTransit.cap = global.SLBookingCapacity;
    if (global.SLTransitTicketPolicy && !global.SLTransit.policy) global.SLTransit.policy = global.SLTransitTicketPolicy;
    if (global.SLTransitTransfer && !global.SLTransit.transfer) global.SLTransit.transfer = global.SLTransitTransfer;
    if (global.SLTransitStatus && !global.SLTransit.status) global.SLTransit.status = global.SLTransitStatus;
    if (global.SLTransitSecurity && !global.SLTransit.security) global.SLTransit.security = global.SLTransitSecurity;
  }

  function flushReadyCallbacks() {
    var callbacks = _callbacks.slice();
    _callbacks = [];
    callbacks.forEach(function(cb) {
      try { cb(); } catch (err) { setTimeout(function() { throw err; }, 0); }
    });
  }

  function init(firebaseApp) {
    global.SLTransit = global.SLTransit || {};
    if (_ready) return Promise.resolve(global.SLTransit);
    if (_initializing) return _initializing;
    if (!global.SLTransit.db || typeof global.SLTransit.db.init !== 'function') {
      return Promise.reject(new Error('SLTransit.db adapter is not loaded'));
    }

    _initializing = global.SLTransit.db.init(firebaseApp).then(function() {
      exposeLoadedModules();
      _ready = true;
      flushReadyCallbacks();
      if (global.console && typeof global.console.log === 'function') {
        global.console.log('[SLTransit Core] ready');
      }
      return global.SLTransit;
    }).catch(function(err) {
      _initializing = null;
      throw err;
    });

    return _initializing;
  }

  function isReady() { return _ready; }

  function onReady(cb) {
    if (typeof cb !== 'function') return;
    if (_ready) { cb(); return; }
    _callbacks.push(cb);
  }

  global.SLTransit = global.SLTransit || {};
  global.SLTransit.core = {
    init: init,
    isReady: isReady,
    onReady: onReady,
    exposeLoadedModules: exposeLoadedModules
  };
})(typeof window !== 'undefined' ? window : globalThis);