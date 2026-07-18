(function(global) {
  'use strict';

  var CONTRACT_VERSION = 'erp_ticket_v1';
  var BASE_PATH = 'operations/ticketsByServiceDate';

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function first() {
    for (var i = 0; i < arguments.length; i++) {
      var value = clean(arguments[i]);
      if (value) return value;
    }
    return '';
  }

  function pathForTicket(input) {
    input = input || {};
    var serviceDate = clean(input.serviceDate);
    var code = clean(input.bookingCode || input.code);
    return serviceDate && code ? BASE_PATH + '/' + serviceDate + '/' + code : '';
  }

  function assignmentOf(booking) {
    booking = booking || {};
    return booking.assignment && booking.assignment.contractVersion === 'booking_assignment_v1'
      ? booking.assignment
      : {};
  }

  function buildTicketContract(booking) {
    booking = booking || {};
    var assignment = assignmentOf(booking);
    var bookingCode = first(booking.bookingCode, booking.code);
    var serviceDate = first(booking.serviceDate, booking.date);
    var missing = [];
    if (!bookingCode) missing.push('bookingCode');
    if (!serviceDate) missing.push('serviceDate');
    if (!first(booking.name)) missing.push('name');
    if (!first(booking.phone)) missing.push('phone');

    var scheduleOnly = assignment.scheduleOnly === true
      || assignment.noLiveTracking === true
      || booking.scheduleOnly === true
      || booking.noLiveTracking === true;
    var queueNo = first(assignment.queueNo, booking.queueNo, booking.queueNumber);
    var plannedVehicleId = scheduleOnly ? '' : first(assignment.plannedVehicleId, booking.plannedVehicleId, booking.vehicleId);
    if (!scheduleOnly && !queueNo) missing.push('assignment.queueNo');
    if (!scheduleOnly && !plannedVehicleId) missing.push('assignment.plannedVehicleId');

    var contract = {
      contractVersion: CONTRACT_VERSION,
      source: 'erp_ticket_center',
      serviceDate: serviceDate,
      bookingCode: bookingCode,
      status: first(booking.status) || 'awaiting_payment',
      passenger: {
        name: first(booking.name),
        phone: first(booking.phone),
        seats: Number(booking.seats || booking.pax || 1) || 1
      },
      journey: {
        origin: first(booking.origin, booking.originStopKey),
        destination: first(booking.destination, booking.destStopKey),
        pickupTime: first(booking.pickupTime, booking.time),
        route: first(booking.route),
        pairKey: first(booking.pairKey),
        pairId: first(booking.pairId),
        canonicalPairKey: first(booking.canonicalPairKey)
      },
      assignment: {
        contractVersion: first(assignment.contractVersion),
        queueNo: queueNo,
        queueId: first(assignment.queueId),
        plannedVehicleId: plannedVehicleId,
        tripId: first(assignment.tripId),
        tripIndex: first(assignment.tripIndex),
        departTime: first(assignment.departTime),
        pickupTime: first(assignment.pickupTime),
        pickupStopKey: first(assignment.pickupStopKey),
        pickupStopName: first(assignment.pickupStopName),
        routeDirection: first(assignment.routeDirection),
        routeStops: Array.isArray(assignment.routeStops) ? assignment.routeStops.slice() : [],
        routeStopNames: Array.isArray(assignment.routeStopNames) ? assignment.routeStopNames.slice() : [],
        scheduleOnly: scheduleOnly,
        noLiveTracking: scheduleOnly,
        assignmentSource: first(assignment.assignmentSource)
      },
      payment: {
        fareAmount: Number(booking.fareAmount || booking.serverPrice || 0) || 0,
        serviceFee: Number(booking.serviceFee || 0) || 0,
        total: Number(booking.price || booking.fare || 0) || 0,
        paymentOwnership: first(booking.paymentOwnership) || 'sl_transit',
        externalPaymentRequired: booking.externalPaymentRequired === true
      },
      refs: {
        legacyBookingPath: first(booking.legacyBookingPath),
        centralPath: pathForTicket({ serviceDate: serviceDate, bookingCode: bookingCode })
      },
      missing: missing
    };

    return {
      status: missing.length ? 'missing_contract_fields' : 'ready',
      contract: contract,
      missing: missing
    };
  }

  function getTicketContract(booking) {
    if (!booking) return null;
    if (booking.erpTicket && booking.erpTicket.contractVersion === CONTRACT_VERSION) return booking.erpTicket;
    if (booking.ticketContract && booking.ticketContract.contractVersion === CONTRACT_VERSION) return booking.ticketContract;
    return null;
  }

  function requireTicketContract(booking) {
    var contract = getTicketContract(booking);
    return contract
      ? { status: 'ready', contract: contract }
      : { status: 'missing_erp_ticket_contract', contract: null };
  }

  var api = {
    CONTRACT_VERSION: CONTRACT_VERSION,
    BASE_PATH: BASE_PATH,
    pathForTicket: pathForTicket,
    buildTicketContract: buildTicketContract,
    getTicketContract: getTicketContract,
    requireTicketContract: requireTicketContract
  };

  global.SLTransitTicketCenter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
