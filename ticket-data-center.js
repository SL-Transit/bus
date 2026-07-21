(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SLTransitTicketDataCenter = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
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
    if (!db || typeof db.ref !== 'function') return Promise.reject(new Error('TICKET_DATA_CENTER_DB_REQUIRED'));
    if (!value) return Promise.resolve(null);

    if (isTicketCode(value)) {
      var code = value.toUpperCase();
      if (options.testMode && /^BK\d{6,10}$/i.test(code) && options.blockProductionCodeInTestMode !== false) {
        return Promise.reject(new Error('TEST_MODE_PRODUCTION_CODE'));
      }
      var path = bookingPathForCode(code, options);
      return db.ref(path + code).once('value').then(function(snap) {
        return snap && snap.exists && snap.exists()
          ? normalizeResult(code, snap.val(), { readPath: path + code, lookupType: 'code' })
          : null;
      });
    }

    if (isPhone(value)) {
      var phone = cleanPhone(value);
      var rootPath = options.testMode ? clean(options.testBookingsRoot || options.testBookingsPath || 'testBookings').replace(/\/$/, '') : 'bookings';
      return db.ref(rootPath).orderByChild('phone').equalTo(phone).once('value').then(function(snap) {
        if (!snap || !snap.exists || !snap.exists()) return null;
        var matches = [];
        snap.forEach(function(child) {
          var booking = child.val() || {};
          if (options.excludeNotificationOnly !== false && booking.notificationOnly) return;
          if (typeof options.excludeBooking === 'function' && options.excludeBooking(booking, child.key)) return;
          if (cleanPhone(booking.phone) === phone) {
            matches.push({ code: child.key, booking: booking });
          }
        });
        matches.sort(function(a, b) {
          var sortValue = typeof options.sortValue === 'function' ? options.sortValue : defaultSortValue;
          return sortValue(b.booking) - sortValue(a.booking);
        });
        if (!matches[0]) return null;
        return normalizeResult(matches[0].code, matches[0].booking, {
          readPath: rootPath + '/' + matches[0].code,
          lookupType: 'phone',
          matchCount: matches.length
        });
      });
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
