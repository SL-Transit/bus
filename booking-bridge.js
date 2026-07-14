/**
 * booking-bridge.js
 * Booking1 page adapter for /preview/publishedSchedule.
 *
 * This file intentionally consumes the ERP preview contract. It does not read
 * routeData, publishedCatalog, settings/routes, or local static fare tables as
 * booking authority.
 */
(function(global) {
  'use strict';

  var PREVIEW_BASE_PATH = 'preview/publishedSchedule';
  var AvailabilityCenter = global.SLTransitBookingAvailabilityCenter;
  var FareDecisionCenter = global.SLTransitFareDecisionCenter;
  if ((!AvailabilityCenter || !FareDecisionCenter) && typeof require === 'function') {
    try { AvailabilityCenter = AvailabilityCenter || require('./booking-availability-center.js'); } catch (err) {}
    try { FareDecisionCenter = FareDecisionCenter || require('./fare-decision-center.js'); } catch (err2) {}
  }
  var _db = null;
  var _ready = false;
  var _readyCallbacks = [];
  var _preview = {
    schemaVersion: '',
    generatedAt: '',
    sourceCommitSha: '',
    readyForApply: false,
    readyForReview: false,
    productionReady: false,
    writesEnabled: false,
    publicationStatus: '',
    originOptions: [],
    destinationOptionsByOrigin: {},
    firebaseKeyEncoding: {},
    validation: null
  };
  var _pairCache = {};
  var _pairLoadStatus = {};
  var _lastFareContractStatus = null;
  var _lastLoadedPair = null;

  function _asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function _optionLabel(option) {
    if (!option) return '';
    if (typeof option === 'string') return option;
    return option.label || option.originLabel || option.destinationLabel || option.displayNameTh || option.nameTh || option.name || '';
  }

  function _optionOrder(option, index) {
    var order = option && (option.displayOrder != null ? option.displayOrder : option.order);
    order = Number(order);
    return isFinite(order) ? order : index;
  }

  function _encodedIndex(section) {
    var idx = _preview.firebaseKeyEncoding && _preview.firebaseKeyEncoding.encodedKeyIndex;
    return idx && idx[section] || {};
  }

  function _decodedPreviewKey(rawKey, section) {
    var idx = _encodedIndex(section);
    return idx && idx[rawKey] || rawKey;
  }

  function _normalizeOrigins(options) {
    return _asArray(options).map(function(option, index) {
      var label = _optionLabel(option);
      return {
        key: label,
        nameTh: label,
        label: label,
        originLabel: option && option.originLabel || label,
        originDestinationId: option && option.originDestinationId || '',
        order: _optionOrder(option, index),
        option: option || null
      };
    }).filter(function(option) {
      return !!option.label;
    });
  }

  function _normalizeDestinationOptions(raw) {
    var result = {};
    Object.keys(raw || {}).forEach(function(originKey) {
      var originLabel = _decodedPreviewKey(originKey, 'destinationOptionsByOrigin');
      result[originLabel] = _asArray(raw[originKey]).map(function(option, index) {
        var label = _optionLabel(option);
        var pairKey = option && option.pairKey || '';
        return Object.assign({}, option || {}, {
          key: label,
          label: label,
          nameTh: label,
          pairKey: pairKey,
          storageKey: _resolvePairStorageKey(pairKey),
          order: _optionOrder(option, index)
        });
      }).filter(function(option) {
        return !!option.label;
      });
    });
    return result;
  }

  function _resolvePairStorageKey(pairKey) {
    if (!pairKey) return '';
    var pairIndex = _encodedIndex('pairs');
    var compatibilityIndex = _encodedIndex('compatibilityKeyIndex');
    if (pairIndex[pairKey]) return pairKey;
    if (compatibilityIndex[pairKey]) return pairKey;
    var found = Object.keys(pairIndex || {}).filter(function(storageKey) {
      return pairIndex[storageKey] === pairKey;
    })[0];
    if (found) return found;
    found = Object.keys(compatibilityIndex || {}).filter(function(storageKey) {
      return compatibilityIndex[storageKey] === pairKey;
    })[0];
    return found || pairKey;
  }

  function _markReady() {
    _ready = true;
    _readyCallbacks.forEach(function(fn) { fn(_preview); });
    _readyCallbacks = [];
  }

  function init(db) {
    _db = db;
    var baseRef = db.ref(PREVIEW_BASE_PATH);
    return Promise.all([
      baseRef.child('schemaVersion').once('value'),
      baseRef.child('generatedAt').once('value'),
      baseRef.child('sourceCommitSha').once('value'),
      baseRef.child('dryRun').once('value'),
      baseRef.child('writesEnabled').once('value'),
      baseRef.child('readyForReview').once('value'),
      baseRef.child('readyForApply').once('value'),
      baseRef.child('publicationStatus').once('value'),
      baseRef.child('productionReady').once('value'),
      baseRef.child('originOptions').once('value'),
      baseRef.child('destinationOptionsByOrigin').once('value'),
      baseRef.child('firebaseKeyEncoding').once('value'),
      baseRef.child('validation').once('value')
    ]).then(function(parts) {
      _preview = {
        schemaVersion: parts[0].val() || '',
        generatedAt: parts[1].val() || '',
        sourceCommitSha: parts[2].val() || '',
        dryRun: parts[3].val() === true,
        writesEnabled: parts[4].val() === true,
        readyForReview: parts[5].val() === true,
        readyForApply: parts[6].val() === true,
        publicationStatus: parts[7].val() || '',
        productionReady: parts[8].val() === true,
        originOptions: _normalizeOrigins(parts[9].val() || []),
        destinationOptionsByOrigin: {},
        firebaseKeyEncoding: parts[11].val() || {},
        validation: parts[12].val() || null
      };
      _preview.destinationOptionsByOrigin = _normalizeDestinationOptions(parts[10].val() || {});
      _markReady();
      return _preview;
    }).catch(function(err) {
      console.error('[BookingBridge] preview publishedSchedule load failed:', err);
      _preview.originOptions = [];
      _preview.destinationOptionsByOrigin = {};
      _markReady();
      return _preview;
    });
  }

  function onReady(fn) {
    if (_ready) { fn(_preview); return; }
    _readyCallbacks.push(fn);
  }

  function getBookableStops() {
    return _preview.originOptions.slice();
  }

  function getDestinationOptions(originLabel) {
    return (_preview.destinationOptionsByOrigin[originLabel] || []).slice();
  }

  function getDestinationContractStatus(originLabel) {
    if (!_preview.originOptions.length) return 'missing_origin_options';
    if (!_preview.destinationOptionsByOrigin || !Object.keys(_preview.destinationOptionsByOrigin).length) {
      return 'missing_destination_options';
    }
    if (!_preview.destinationOptionsByOrigin[originLabel]) return 'missing_origin_options';
    return 'ready';
  }

  function _selectedDestinationOption(originLabel, destLabel) {
    return getDestinationOptions(originLabel).filter(function(option) {
      return option.label === destLabel || option.destinationLabel === destLabel || option.key === destLabel;
    })[0] || null;
  }

  function _disclaimers(pair, segment, timeEntry) {
    var list = [];
    [pair && pair.transferDisclaimerTh, pair && pair.externalDisclaimerTh, pair && pair.disclaimerTh,
     segment && segment.disclaimerTh, timeEntry && timeEntry.disclaimerTh].forEach(function(text) {
      if (text && list.indexOf(text) === -1) list.push(text);
    });
    return list;
  }

  function _timeLabel(timeEntry) {
    var time = timeEntry.time || timeEntry.departTime || timeEntry.departureTime || '';
    return time ? time + ' น.' : (timeEntry.label || timeEntry.displayTimeTh || 'เวลาอ้างอิง');
  }

  function _pairToTrips(pair, option, serviceDate) {
    var trips = [];
    (pair.segments || []).forEach(function(segment, segmentIndex) {
      (segment.times || []).forEach(function(timeEntry, timeIndex) {
        var fareContract = FareDecisionCenter && typeof FareDecisionCenter.decideFare === 'function'
          ? FareDecisionCenter.decideFare({
            pair: pair,
            segment: segment || {},
            timeEntry: timeEntry || {},
            option: option || {},
            serviceFeeAmount: global.SERVICE_FEE_ENABLED === true ? Number(global.SERVICE_FEE_AMOUNT) || 0 : 0
          })
          : { status: 'NEEDS_CONTRACT_FIELD', fareAmount: null, missingField: 'SLTransitFareDecisionCenter.decideFare' };
        var availabilityDecision = AvailabilityCenter && typeof AvailabilityCenter.decideBookingAvailability === 'function'
          ? AvailabilityCenter.decideBookingAvailability({
            pair: pair,
            segment: segment || {},
            timeEntry: timeEntry || {},
            option: option || {},
            preview: _preview,
            serviceDate: serviceDate || ''
          })
          : { status: 'unavailable', bookingEligible: false, reasonCode: 'missing_contract', displayReasonTh: 'Booking Availability Center unavailable' };
        var isReference = availabilityDecision.status === 'reference_only';
        var isExternal = availabilityDecision.status === 'external_reference';
        var fareMissing = fareContract.status === 'NEEDS_CONTRACT_FIELD';
        var time = timeEntry.time || timeEntry.departTime || timeEntry.departureTime || '';
        trips.push({
          pickupTime: time,
          label: _timeLabel(timeEntry),
          queueNo: '',
          vehicleId: '',
          routeStops: [],
          scheduleOnly: true,
          fare: fareContract.fareAmount || 0,
          fareAmount: fareContract.fareAmount,
          fareContract: fareContract,
          fareMissing: fareMissing,
          missingFareField: fareContract.missingField || '',
          paymentOwnership: fareContract.paymentOwnership || (isExternal ? 'external_pay' : 'sl_transit'),
          externalPaymentRequired: isExternal,
          isLeg2: pair.transfer && pair.transfer.required === true,
          transferInfo: pair.transfer || null,
          referenceOnly: isReference,
          externalReference: isExternal,
          bookingEligible: availabilityDecision.bookingEligible === true,
          bookingAllowed: availabilityDecision.bookingEligible === true && fareMissing === false,
          availabilityDecision: availabilityDecision,
          disabledReason: fareMissing ? 'missing_fare' : availabilityDecision.reasonCode,
          displayDisabledReasonTh: availabilityDecision.displayReasonTh || '',
          displayBadgeTh: timeEntry.displayBadgeTh || segment.displayBadgeTh || pair.displayBadgeTh || '',
          passengerDisplayMode: timeEntry.passengerDisplayMode || segment.passengerDisplayMode || pair.previewDisplayMode || '',
          disclaimers: _disclaimers(pair, segment, timeEntry),
          pairKey: option && option.pairKey || pair.compatibilityPairKey || pair.pairId || '',
          pairId: pair.pairId || pair.canonicalPairKey || '',
          canonicalPairKey: pair.canonicalPairKey || '',
          storageKey: option && option.storageKey || '',
          sourcePair: pair,
          sourceSegment: segment,
          sourceTime: timeEntry,
          segmentIndex: segmentIndex,
          timeIndex: timeIndex,
          serviceDate: serviceDate || '',
          assignment: {
            assignmentId: undefined,
            queueId: undefined,
            vehicleId: undefined,
            assignmentSource: 'none',
            scheduleOnly: true,
            liveTrackingAvailable: false
          }
        });
      });
    });
    _lastFareContractStatus = trips.some(function(trip) { return trip.fareMissing; })
      ? { status: 'missing_fare', missingField: 'preview/publishedSchedule/pairs/{pairKey}.fareAmount or segment/time fareAmount' }
      : { status: 'ready' };
    return trips;
  }

  function loadPair(originLabel, destLabel) {
    var option = _selectedDestinationOption(originLabel, destLabel);
    if (!option || !option.pairKey) {
      _pairLoadStatus[originLabel + '\0' + destLabel] = 'missing';
      return Promise.resolve(null);
    }
    var storageKey = option.storageKey || _resolvePairStorageKey(option.pairKey);
    if (!storageKey) return Promise.resolve(null);
    if (_pairCache[storageKey]) return Promise.resolve(_pairCache[storageKey]);
    return _db.ref(PREVIEW_BASE_PATH).child('pairs').child(storageKey).once('value').then(function(snap) {
      var pair = snap.val();
      if (!pair) {
        _pairLoadStatus[originLabel + '\0' + destLabel] = 'missing';
        return null;
      }
      pair.__storageKey = storageKey;
      _pairCache[storageKey] = pair;
      _lastLoadedPair = pair;
      _pairLoadStatus[originLabel + '\0' + destLabel] = 'loaded';
      return pair;
    });
  }

  function loadAvailableTrips(originLabel, destLabel, serviceDate) {
    var option = _selectedDestinationOption(originLabel, destLabel);
    return loadPair(originLabel, destLabel).then(function(pair) {
      if (!pair) return [];
      return _pairToTrips(pair, option, serviceDate);
    });
  }

  function getAvailableTrips(originLabel, destLabel, serviceDate) {
    var option = _selectedDestinationOption(originLabel, destLabel);
    if (!option) return [];
    var storageKey = option.storageKey || _resolvePairStorageKey(option.pairKey);
    var pair = storageKey && _pairCache[storageKey];
    return pair ? _pairToTrips(pair, option, serviceDate) : [];
  }

  function getFare() {
    return 0;
  }

  function getCatalogVersion() {
    return _preview.schemaVersion || '';
  }

  function canCreateProductionBookings() {
    return _preview.readyForApply === true && _preview.productionReady === true && _preview.writesEnabled === true;
  }

  function getLastFareContractStatus() {
    return _lastFareContractStatus;
  }

  function isLeg2Dest(destLabel) {
    var pair = _lastLoadedPair;
    return !!(pair && pair.destinationLabel === destLabel && pair.transfer && pair.transfer.required === true);
  }

  function getTransferInfo() {
    var pair = _lastLoadedPair;
    return pair && pair.transfer || null;
  }

  function getTransferBufferAsync() {
    return Promise.resolve(0);
  }

  function buildBookingSnapshot(params) {
    var assignment = params.assignment || {
      assignmentSource: 'none',
      scheduleOnly: true,
      liveTrackingAvailable: false
    };
    return {
      bookingCode: params.bookingCode,
      catalogVersion: _preview.schemaVersion || '',
      publishedSchedule: {
        schemaVersion: _preview.schemaVersion || '',
        sourceCommitSha: _preview.sourceCommitSha || '',
        generatedAt: _preview.generatedAt || '',
        readyForApply: _preview.readyForApply === true,
        publicationStatus: _preview.publicationStatus || ''
      },
      name: params.name,
      phone: params.phone,
      pax: params.pax,
      originStopKey: params.originStopKey,
      destStopKey: params.destStopKey,
      pickupTime: params.pickupTime,
      serviceDate: params.serviceDate,
      pairKey: params.pairKey || '',
      pairId: params.pairId || '',
      canonicalPairKey: params.canonicalPairKey || '',
      fare: params.fare || 0,
      fareAmount: params.fareAmount || 0,
      fareContract: params.fareContract || null,
      paymentOwnership: params.paymentOwnership || 'sl_transit',
      externalPaymentRequired: params.externalPaymentRequired === true,
      referenceOnly: params.referenceOnly === true,
      payMethod: params.payMethod || '',
      slipUploaded: params.slipUploaded || false,
      status: (global.BOOKING_STATUS && global.BOOKING_STATUS.AWAITING_PAYMENT) || 'awaiting_payment',
      createdAt: new Date().toISOString(),
      assignment: assignment,
      queueNo: assignment.queueId || '',
      vehicleId: assignment.vehicleId || ''
    };
  }

  global.SLBookingBridge = {
    init: init,
    onReady: onReady,
    getBookableStops: getBookableStops,
    getDestinationOptions: getDestinationOptions,
    getDestinationContractStatus: getDestinationContractStatus,
    loadPair: loadPair,
    loadAvailableTrips: loadAvailableTrips,
    getAvailableTrips: getAvailableTrips,
    isLeg2Dest: isLeg2Dest,
    getTransferInfo: getTransferInfo,
    getFare: getFare,
    getCatalogVersion: getCatalogVersion,
    canCreateProductionBookings: canCreateProductionBookings,
    getLastFareContractStatus: getLastFareContractStatus,
    buildBookingSnapshot: buildBookingSnapshot,
    getTransferBufferAsync: getTransferBufferAsync,
    get _catalog() { return null; },
    get _preview() { return _preview; }
  };
})(window);
