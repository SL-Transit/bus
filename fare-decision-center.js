(function(global) {
  'use strict';

  function num(value) {
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function isExternalSource(pair, segment, timeEntry, option) {
    return pair.externalReference === true ||
      segment.externalReference === true ||
      timeEntry.externalReference === true ||
      option.externalReference === true ||
      pair.passengerDisplayMode === 'external_reference' ||
      segment.passengerDisplayMode === 'external_reference' ||
      timeEntry.passengerDisplayMode === 'external_reference' ||
      option.passengerDisplayMode === 'external_reference' ||
      pair.previewDisplayMode === 'external_reference' ||
      segment.previewDisplayMode === 'external_reference' ||
      timeEntry.previewDisplayMode === 'external_reference' ||
      option.previewDisplayMode === 'external_reference' ||
      pair.slTransitFareCollection === false ||
      segment.slTransitFareCollection === false ||
      timeEntry.slTransitFareCollection === false ||
      option.slTransitFareCollection === false ||
      pair.paymentOwnership === 'external_pay' ||
      segment.paymentOwnership === 'external_pay' ||
      timeEntry.paymentOwnership === 'external_pay' ||
      option.paymentOwnership === 'external_pay';
  }

  function findFareSource(pair, segment, timeEntry, option) {
    var sources = [
      { scope: 'time', value: timeEntry || {} },
      { scope: 'segment', value: segment || {} },
      { scope: 'pair', value: pair || {} },
      { scope: 'destinationOption', value: option || {} }
    ];
    var fields = ['fareAmount', 'fare', 'amount', 'price'];
    for (var i = 0; i < sources.length; i += 1) {
      for (var f = 0; f < fields.length; f += 1) {
        var amount = num(sources[i].value[fields[f]]);
        if (amount !== null) return { amount: amount, sourceScope: sources[i].scope, sourceField: fields[f] };
      }
    }
    return null;
  }

  function decideFare(input) {
    input = input || {};
    var pair = input.pair || {};
    var segment = input.segment || {};
    var timeEntry = input.timeEntry || {};
    var option = input.option || {};
    var serviceFee = Math.max(0, num(input.serviceFeeAmount) || 0);
    var external = isExternalSource(pair, segment, timeEntry, option);
    var paymentOwnership = clean(timeEntry.paymentOwnership || segment.paymentOwnership || pair.paymentOwnership || option.paymentOwnership || (external ? 'external_pay' : 'sl_transit'));
    var source = findFareSource(pair, segment, timeEntry, option);

    if (external) {
      return {
        status: 'external_reference',
        fareAmount: null,
        serviceFeeAmount: 0,
        totalAmount: null,
        paymentOwnership: 'external_pay',
        slTransitFareCollection: false,
        externalPaymentRequired: true,
        reasonCode: 'external_pay',
        missingField: '',
        source: 'erp_logic_center'
      };
    }

    if (!source) {
      return {
        status: 'NEEDS_CONTRACT_FIELD',
        fareAmount: null,
        serviceFeeAmount: serviceFee,
        totalAmount: null,
        paymentOwnership: paymentOwnership || 'sl_transit',
        slTransitFareCollection: true,
        externalPaymentRequired: false,
        reasonCode: 'missing_fare_amount',
        missingField: 'publishedSchedule/pairs/{pairKey}.fareAmount or segment/time fareAmount',
        source: 'erp_logic_center'
      };
    }

    return {
      status: 'ready',
      fareAmount: source.amount,
      serviceFeeAmount: serviceFee,
      totalAmount: source.amount + serviceFee,
      paymentOwnership: paymentOwnership || 'sl_transit',
      slTransitFareCollection: true,
      externalPaymentRequired: false,
      reasonCode: 'fare_resolved',
      sourceField: source.sourceField,
      sourceScope: source.sourceScope,
      missingField: '',
      source: 'erp_logic_center'
    };
  }

  global.SLTransitFareDecisionCenter = {
    decideFare: decideFare
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitFareDecisionCenter;
})(typeof window !== 'undefined' ? window : globalThis);
