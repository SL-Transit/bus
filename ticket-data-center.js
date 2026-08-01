(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : {});
  } else {
    root.SLTransitTicketDataCenter = factory(root);
  }
})(typeof self !== 'undefined' ? self : this, function(root) {
  'use strict';

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function cleanPhone(value) {
    return clean(value).replace(/[^0-9]/g, '');
  }

  function isTicketCode(value) {
    return /^(BK\d{6,10}|TB\d{6})$/i.test(clean(value));
  }

  function isPhone(value) {
    return /^0[689]\d{8}$/.test(cleanPhone(value));
  }

  function bookingPathForCode(code, options, booking) {
    options = options || {};
    if (options.testMode) return options.testBookingsPath || 'testBookings/';
    return (/^TB\d{6}$/i.test(clean(code)) || (booking && booking.testMode)) ? 'testBookings/' : 'bookings/';
  }

  function defaultFunctionUrl(name) {
    return 'https://asia-southeast1-sl-transit-9464e.cloudfunctions.net/' + name;
  }

  function ticketAccessTokenForCode(code, options) {
    options = options || {};
    var normalized = clean(code).toUpperCase();
    var token = clean(options.accessToken || options.ticketAccessToken);
    if (token) return token;
    try {
      var hashParams = new URLSearchParams(((root.location && root.location.hash) || '').replace(/^#/, ''));
      token = clean(hashParams.get('ticketToken') || hashParams.get('accessToken'));
      if (token) {
        if (root.sessionStorage) root.sessionStorage.setItem('slt_ticket_access_' + normalized, token);
        if (root.history && root.location) {
          root.history.replaceState(null, '', root.location.pathname + root.location.search);
        }
        return token;
      }
    } catch (err) {}
    try {
      return clean(root.sessionStorage && root.sessionStorage.getItem('slt_ticket_access_' + normalized));
    } catch (err) {
      return '';
    }
  }

  function defaultSortValue(booking) {
    booking = booking || {};
    var candidates = [
      booking.ts,
      booking.createdAt,
      booking.updatedAt,
      booking.lineMessagingAt,
      booking.checkedInAt,
      booking.changedAt,
      booking.cancelledAt
    ];
    for (var i = 0; i < candidates.length; i++) {
      var n = Number(candidates[i]);
      if (!isNaN(n) && n > 0) return n;
    }
    if (booking.date && booking.time) {
      var d = new Date(booking.date + 'T' + String(booking.time).slice(0, 5) + ':00');
      if (!isNaN(d.getTime())) return d.getTime();
    }
    return 0;
  }

  function normalizeResult(code, booking, meta) {
    meta = meta || {};
    if (!booking) return null;
    return {
      contractVersion: 'ticket_data_center_read_v1',
      source: 'ticket-data-center',
      code: clean(code).toUpperCase(),
      booking: booking,
      readPath: meta.readPath || '',
      matchCount: meta.matchCount || 1,
      lookupType: meta.lookupType || '',
      ready: true
    };
  }

  function findTicket(db, lookupValue, options) {
    options = options || {};
    var value = clean(lookupValue);
    if (!value) return Promise.resolve(null);

    if (isTicketCode(value)) {
      var code = value.toUpperCase();
      if (options.testMode && /^BK\d{6,10}$/i.test(code) && options.blockProductionCodeInTestMode !== false) {
        return Promise.reject(new Error('TEST_MODE_PRODUCTION_CODE'));
      }
      var token = ticketAccessTokenForCode(code, options);
      if (!token) {
        var missingToken = new Error('TICKET_ACCESS_TOKEN_REQUIRED');
        missingToken.code = 'TICKET_ACCESS_TOKEN_REQUIRED';
        return Promise.reject(missingToken);
      }
      var endpoint = clean(options.readEndpoint || options.ticketReadEndpoint || defaultFunctionUrl('readPassengerTicket'));
      return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingCode: code, accessToken: token })
      }).then(function(response) {
        return response.json().catch(function() { return {}; }).then(function(body) {
          if (!response.ok || !body || body.status !== 'ready' || !body.ticket) {
            var denied = new Error((body && body.error) || 'TICKET_ACCESS_DENIED');
            denied.code = (body && body.error) || 'TICKET_ACCESS_DENIED';
            throw denied;
          }
          return normalizeResult(code, body.ticket, {
            readPath: '',
            lookupType: 'secure_token',
            matchCount: 1
          });
        });
      });
    }

    if (isPhone(value)) {
      var phoneLookupBlocked = new Error('TICKET_PHONE_LOOKUP_REQUIRES_SECURE_TOKEN');
      phoneLookupBlocked.code = 'TICKET_PHONE_LOOKUP_REQUIRES_SECURE_TOKEN';
      return Promise.reject(phoneLookupBlocked);
    }

    return Promise.resolve(null);
  }

  return {
    contractVersion: 'ticket_data_center_read_v1',
    clean: clean,
    cleanPhone: cleanPhone,
    isTicketCode: isTicketCode,
    isPhone: isPhone,
    bookingPathForCode: bookingPathForCode,
    findTicket: findTicket
  };
});
