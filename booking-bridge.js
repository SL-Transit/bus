/**
 * booking-bridge.js
 * Booking1 page adapter for /publishedSchedule.
 *
 * This file intentionally consumes the ERP published schedule contract. It does not read
 * routeData, publishedCatalog, settings/routes, or local static fare tables as
 * booking authority.
 */
(function(global) {
  'use strict';

  var PREVIEW_BASE_PATH = 'publishedSchedule';
  var DEFAULT_TRIP_CAPACITY = 3;
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
    paymentContact: null,
    bookingPolicy: {},
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
      baseRef.child('paymentContact').once('value'),
      baseRef.child('firebaseKeyEncoding').once('value'),
      baseRef.child('validation').once('value'),
      baseRef.child('bookingPolicy').once('value')
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
        paymentContact: parts[11].val() || null,
        firebaseKeyEncoding: parts[12].val() || {},
        validation: parts[13].val() || null,
        bookingPolicy: parts[14].val() || {}
      };
      _preview.destinationOptionsByOrigin = _normalizeDestinationOptions(parts[10].val() || {});
      _markReady();
      return _preview;
    }).catch(function(err) {
      console.error('[BookingBridge] publishedSchedule load failed:', err);
      _preview.originOptions = [];
      _preview.destinationOptionsByOrigin = {};
      _preview.bookingPolicy = {};
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

  function getPaymentContact() {
    return _preview.paymentContact || null;
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

  function _serviceFeeAmount() {
    var policy = _preview.bookingPolicy || {};
    if (policy.serviceFeeEnabled === false) return 0;
    var amount = Number(policy.serviceFeeAmount);
    return isFinite(amount) && amount >= 0 ? amount : 0;
  }

  function _transferInfo(pair, segment, timeEntry) {
    if (!pair || !pair.transfer || pair.transfer.required !== true) return null;
    segment = segment || {};
    timeEntry = timeEntry || {};
    var segments = Array.isArray(pair.segments) ? pair.segments : [];
    var firstLeg = segments[0] || {};
    var secondLeg = segments[1] || {};
    var timing = pair.transferTiming && pair.transferTiming.bestConnection || {};
    var info = Object.assign({}, pair.transfer || {});
    info.required = true;
    info.viaLabel = info.viaLabel || info.transferNodeLabel || info.transferStopLabel ||
      timeEntry.transferStopLabel || segment.transferStopLabel || firstLeg.toLabel || secondLeg.fromLabel || '';
    info.transferStopKey = info.transferStopKey || timeEntry.transferStopKey || timing.transferStopKey || info.viaStopKey || '';
    info.transferArrivalTime = timeEntry.transferArrivalTime || timing.arrivalTimeAtTransfer || info.transferArrivalTime || '';
    info.nextDepartureTime = timeEntry.nextDepartureTime || timing.nextDepartureTime || info.nextDepartureTime || '';
    info.waitMinutes = timeEntry.waitMinutes != null ? timeEntry.waitMinutes : (timing.waitMinutes != null ? timing.waitMinutes : info.waitMinutes);
    info.leg2Time = info.nextDepartureTime || info.leg2Time || '';
    info.destLabel = info.destLabel || pair.destinationLabel || secondLeg.toLabel || '';
    info.hasMatch = !!(info.viaLabel || info.nextDepartureTime || info.transferArrivalTime);
    info.point = info.point || info.viaLabel || '';
    info.transferPoint = info.transferPoint || info.viaLabel || '';
    info.leg2 = info.leg2 || (info.viaLabel && info.destLabel ? info.viaLabel + ' - ' + info.destLabel : '');
    info.time = info.time || info.transferArrivalTime || '';
    info.source = 'erp_data_center';
    return info;
  }

  function getBookingSeatLimit(trip) {
    var policyLimit = Number(_preview.bookingPolicy && _preview.bookingPolicy.maxSeatsPerBooking);
    var available = Number(trip && trip.availabilityDecision && trip.availabilityDecision.seatsAvailable);
    var capacityLimit = getBookingTripCapacityLimit(trip);
    var limits = [];
    if (isFinite(policyLimit) && policyLimit > 0) limits.push(Math.floor(policyLimit));
    if (isFinite(available) && available > 0) limits.push(Math.floor(available));
    if (isFinite(capacityLimit) && capacityLimit > 0) limits.push(Math.floor(capacityLimit));
    return limits.length ? Math.min.apply(Math, limits) : null;
  }

  function getBookingTripCapacityLimit(trip) {
    var policy = _preview.bookingPolicy || {};
    var tripLimit = Number(trip && (trip.capacity || trip.seatCapacity || trip.maxSeats || trip.maxSeatsPerTrip));
    var decisionLimit = Number(trip && trip.availabilityDecision && trip.availabilityDecision.capacity);
    var policyLimit = Number(policy.maxSeatsPerTrip || policy.tripCapacity || policy.defaultTripCapacity || policy.capacityPerTrip);
    var limits = [];
    if (isFinite(tripLimit) && tripLimit > 0) limits.push(Math.floor(tripLimit));
    if (isFinite(decisionLimit) && decisionLimit > 0) limits.push(Math.floor(decisionLimit));
    if (isFinite(policyLimit) && policyLimit > 0) limits.push(Math.floor(policyLimit));
    limits.push(DEFAULT_TRIP_CAPACITY);
    return Math.min.apply(Math, limits);
  }

  function firebaseSafeKey(value) {
    return String(value == null ? '' : value)
      .trim()
      .replace(/[.#$\[\]\/]/g, '_')
      .replace(/\s+/g, '_')
      || 'unknown';
  }

  function buildBookingCapacityContract(params) {
    params = params || {};
    var trip = params.trip || {};
    var serviceDate = params.serviceDate || trip.serviceDate || '';
    var pickupTime = params.pickupTime || trip.pickupTime || trip.time || '';
    var pairKey = params.pairKey || trip.pairKey || trip.canonicalPairKey || trip.pairId || '';
    var routeKey = params.routeKey || trip.routeId || trip.catalogRouteId || '';
    var tripKey = params.tripKey || trip.tripId || trip.catalogTripId || '';
    var capacityKey = [
      serviceDate,
      pairKey || routeKey || 'pair_unknown',
      tripKey || pickupTime || 'time_unknown'
    ].map(firebaseSafeKey).join('__');
    var capacityLimit = getBookingTripCapacityLimit(trip);
    var requestedSeats = Math.max(1, Number(params.requestedSeats || params.pax || 1));
    return {
      contractVersion: 'booking_capacity_v1',
      source: 'erp_logic_center',
      serviceDate: serviceDate,
      pairKey: pairKey,
      routeKey: routeKey,
      tripKey: tripKey,
      pickupTime: pickupTime,
      capacityKey: capacityKey,
      capacityLimit: capacityLimit,
      requestedSeats: requestedSeats,
      counterPath: 'operations/bookingCapacityByServiceDate/' + firebaseSafeKey(serviceDate) + '/' + capacityKey,
      status: capacityLimit > 0 ? 'ready' : 'missing_capacity'
    };
  }

  function reserveBookingCapacity(db, contract) {
    if (!db || typeof db.ref !== 'function') return Promise.reject(new Error('BOOKING_CAPACITY_DB_REQUIRED'));
    if (!contract || contract.status !== 'ready' || !contract.counterPath) return Promise.reject(new Error('BOOKING_CAPACITY_CONTRACT_NOT_READY'));
    var bookingCode = firebaseSafeKey(contract.bookingCode);
    var requestedSeats = Math.max(1, Number(contract.requestedSeats || 1));
    var capacityLimit = Math.max(1, Number(contract.capacityLimit || DEFAULT_TRIP_CAPACITY));
    var ref = db.ref(contract.counterPath);
    return ref.transaction(function(current) {
      current = current || {};
      var bookings = current.bookings || {};
      if (bookings[bookingCode]) return current;
      var bookedSeats = Math.max(0, Number(current.bookedSeats || 0));
      if (bookedSeats + requestedSeats > capacityLimit) return;
      bookings[bookingCode] = {
        seats: requestedSeats,
        status: 'reserved',
        reservedAt: (global.firebase && global.firebase.database && global.firebase.database.ServerValue && global.firebase.database.ServerValue.TIMESTAMP) || Date.now()
      };
      current.contractVersion = 'booking_capacity_v1';
      current.capacityLimit = capacityLimit;
      current.bookedSeats = bookedSeats + requestedSeats;
      current.seatsAvailable = Math.max(0, capacityLimit - current.bookedSeats);
      current.bookings = bookings;
      current.updatedAt = (global.firebase && global.firebase.database && global.firebase.database.ServerValue && global.firebase.database.ServerValue.TIMESTAMP) || Date.now();
      return current;
    }).then(function(result) {
      if (!result || result.committed !== true) {
        var err = new Error('BOOKING_CAPACITY_FULL');
        err.code = 'BOOKING_CAPACITY_FULL';
        throw err;
      }
      return Object.assign({}, contract, {
        status: 'reserved',
        bookedSeats: result.snapshot && result.snapshot.val && result.snapshot.val() && result.snapshot.val().bookedSeats,
        seatsAvailable: result.snapshot && result.snapshot.val && result.snapshot.val() && result.snapshot.val().seatsAvailable
      });
    });
  }

  function releaseBookingCapacity(db, contract) {
    if (!db || typeof db.ref !== 'function' || !contract || !contract.counterPath || !contract.bookingCode) return Promise.resolve(null);
    var bookingCode = firebaseSafeKey(contract.bookingCode);
    var requestedSeats = Math.max(1, Number(contract.requestedSeats || 1));
    return db.ref(contract.counterPath).transaction(function(current) {
      if (!current || !current.bookings || !current.bookings[bookingCode]) return current;
      var bookings = current.bookings || {};
      delete bookings[bookingCode];
      current.bookedSeats = Math.max(0, Number(current.bookedSeats || 0) - requestedSeats);
      current.seatsAvailable = Math.max(0, Number(current.capacityLimit || DEFAULT_TRIP_CAPACITY) - current.bookedSeats);
      current.bookings = bookings;
      current.updatedAt = (global.firebase && global.firebase.database && global.firebase.database.ServerValue && global.firebase.database.ServerValue.TIMESTAMP) || Date.now();
      return current;
    });
  }

  function readBookingCapacityCounter(db, contract) {
    if (!db || typeof db.ref !== 'function' || !contract || !contract.counterPath) {
      return Promise.resolve(null);
    }
    return db.ref(contract.counterPath).once('value').then(function(snap) {
      return snap && snap.exists && snap.exists() ? snap.val() : null;
    }).catch(function(err) {
      console.warn('[BookingBridge] capacity counter read failed:', contract.counterPath, err);
      return null;
    });
  }

  function applyRuntimeCapacityToTrip(trip, counter) {
    trip = trip || {};
    var capacityContract = buildBookingCapacityContract({
      serviceDate: trip.serviceDate || '',
      trip: trip,
      requestedSeats: 1,
      pickupTime: trip.pickupTime || '',
      pairKey: trip.pairKey || '',
      tripKey: trip.tripId || trip.catalogTripId || '',
      routeKey: trip.routeId || trip.catalogRouteId || ''
    });
    var capacityLimit = Number((counter && counter.capacityLimit) || capacityContract.capacityLimit || DEFAULT_TRIP_CAPACITY);
    var bookedSeats = Math.max(0, Number(counter && counter.bookedSeats || 0));
    var runtimeCapacity = {
      contractVersion: 'booking_capacity_runtime_read_v1',
      source: 'booking_capacity_center',
      counterPath: capacityContract.counterPath,
      capacityKey: capacityContract.capacityKey,
      capacity: capacityLimit,
      bookedSeats: bookedSeats,
      seatsAvailable: Math.max(0, capacityLimit - bookedSeats)
    };
    var availabilityDecision = AvailabilityCenter && typeof AvailabilityCenter.decideBookingAvailability === 'function'
      ? AvailabilityCenter.decideBookingAvailability({
        pair: trip.sourcePair || {},
        segment: trip.sourceSegment || {},
        timeEntry: trip.sourceTime || {},
        option: trip.sourceOption || {},
        preview: _preview,
        serviceDate: trip.serviceDate || '',
        capacity: runtimeCapacity
      })
      : trip.availabilityDecision;
    trip.capacity = Object.assign({}, trip.capacity || {}, runtimeCapacity);
    trip.availabilityDecision = availabilityDecision || trip.availabilityDecision;
    var fareMissing = trip.fareMissing === true;
    trip.bookingEligible = trip.availabilityDecision && trip.availabilityDecision.bookingEligible === true;
    trip.selectionAllowed = trip.availabilityDecision && trip.availabilityDecision.selectionAllowed === true && fareMissing === false;
    trip.bookingAllowed = trip.bookingEligible === true && fareMissing === false;
    trip.disabledReason = fareMissing ? 'missing_fare' : (trip.availabilityDecision && trip.availabilityDecision.reasonCode);
    trip.displayDisabledReasonTh = trip.availabilityDecision && trip.availabilityDecision.displayReasonTh || '';
    return trip;
  }

  function attachRuntimeCapacity(trips) {
    trips = Array.isArray(trips) ? trips : [];
    if (!_db || !trips.length) return Promise.resolve(trips);
    return Promise.all(trips.map(function(trip) {
      var contract = buildBookingCapacityContract({
        serviceDate: trip.serviceDate || '',
        trip: trip,
        requestedSeats: 1,
        pickupTime: trip.pickupTime || '',
        pairKey: trip.pairKey || '',
        tripKey: trip.tripId || trip.catalogTripId || '',
        routeKey: trip.routeId || trip.catalogRouteId || ''
      });
      return readBookingCapacityCounter(_db, contract).then(function(counter) {
        return applyRuntimeCapacityToTrip(trip, counter);
      });
    }));
  }

  function _tripFromTimeEntry(pair, option, segment, timeEntry, segmentIndex, timeIndex, serviceDate) {
    var fareContract = FareDecisionCenter && typeof FareDecisionCenter.decideFare === 'function'
      ? FareDecisionCenter.decideFare({
        pair: pair,
        segment: segment || {},
        timeEntry: timeEntry || {},
        option: option || {},
        serviceFeeAmount: _serviceFeeAmount()
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
    return {
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
      transferInfo: _transferInfo(pair, segment || {}, timeEntry || {}),
      referenceOnly: isReference,
      externalReference: isExternal,
      bookingEligible: availabilityDecision.bookingEligible === true,
      selectionAllowed: availabilityDecision.selectionAllowed === true && fareMissing === false,
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
      sourceOption: option,
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
    };
  }

  function _pairToTrips(pair, option, serviceDate) {
    var trips = [];
    (pair.segments || []).forEach(function(segment, segmentIndex) {
      (segment.times || []).forEach(function(timeEntry, timeIndex) {
        trips.push(_tripFromTimeEntry(pair, option, segment, timeEntry, segmentIndex, timeIndex, serviceDate));
      });
    });
    if (!trips.length && Array.isArray(pair.connectionOptions)) {
      pair.connectionOptions.forEach(function(connection, index) {
        trips.push(_tripFromTimeEntry(pair, option, {
          label: 'connection_option',
          fromLabel: pair.originLabel,
          toLabel: pair.destinationLabel,
          referenceOnly: true,
          routeChoiceStatus: pair.routeChoiceStatus,
          passengerDisplayMode: pair.previewDisplayMode,
          displayBadgeTh: pair.displayBadgeTh,
          disclaimerTh: pair.transferDisclaimerTh
        }, connection, 0, index, serviceDate));
      });
    }
    _lastFareContractStatus = trips.some(function(trip) { return trip.fareMissing; })
        ? { status: 'missing_fare', missingField: 'publishedSchedule/pairs/{pairKey}.fareAmount or segment/time fareAmount' }
      : { status: 'ready' };
    if (global.SLTransitCalculatorCenter && typeof global.SLTransitCalculatorCenter.recommendedBookingTrips === 'function') {
      return global.SLTransitCalculatorCenter.recommendedBookingTrips({
        trips: trips,
        serviceDate: serviceDate || ''
      });
    }
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
      return attachRuntimeCapacity(_pairToTrips(pair, option, serviceDate));
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
    return _transferInfo(pair);
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
      capacity: params.capacity || null,
      payMethod: params.payMethod || '',
      slipUploaded: params.slipUploaded || false,
      passengerIdentity: params.passengerIdentity || null,
      notificationPreference: params.notificationPreference || null,
      consent: params.consent || null,
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
    getPaymentContact: getPaymentContact,
    loadPair: loadPair,
    loadAvailableTrips: loadAvailableTrips,
    getAvailableTrips: getAvailableTrips,
    isLeg2Dest: isLeg2Dest,
    getTransferInfo: getTransferInfo,
    getFare: getFare,
    getCatalogVersion: getCatalogVersion,
    canCreateProductionBookings: canCreateProductionBookings,
    getLastFareContractStatus: getLastFareContractStatus,
    getBookingSeatLimit: getBookingSeatLimit,
    getBookingTripCapacityLimit: getBookingTripCapacityLimit,
    buildBookingCapacityContract: buildBookingCapacityContract,
    readBookingCapacityCounter: readBookingCapacityCounter,
    attachRuntimeCapacity: attachRuntimeCapacity,
    reserveBookingCapacity: reserveBookingCapacity,
    releaseBookingCapacity: releaseBookingCapacity,
    buildBookingSnapshot: buildBookingSnapshot,
    getTransferBufferAsync: getTransferBufferAsync,
    get _catalog() { return null; },
    get _preview() { return _preview; }
  };
})(window);
