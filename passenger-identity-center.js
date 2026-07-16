/**
 * Passenger Identity Center.
 * Owns optional passenger identity input for Booking1 without forcing login.
 */
(function(global) {
  'use strict';

  var CONSENT_VERSION = 'booking-line-notification-v1';
  var currentIdentity = null;

  function nowISO() {
    return new Date().toISOString();
  }

  function cleanText(value, max) {
    return String(value || '').trim().slice(0, max || 120);
  }

  function liffId() {
    return cleanText(global.SL_TRANSIT_LINE_LIFF_ID || '', 120);
  }

  function hasLineConfig() {
    return !!liffId();
  }

  function guestIdentity(name, phone) {
    return {
      provider: 'guest',
      status: 'manual',
      displayName: cleanText(name, 120),
      phone: cleanText(phone, 30)
    };
  }

  function guestNotificationPreference() {
    return {
      lineTicket: false,
      lineTripUpdates: false
    };
  }

  function lineNotificationPreference() {
    return {
      lineTicket: true,
      lineTripUpdates: true
    };
  }

  function buildConsent(sourcePage) {
    return {
      lineNotificationAccepted: true,
      consentVersion: CONSENT_VERSION,
      acceptedAt: nowISO(),
      sourcePage: sourcePage || 'booking1.html',
      purposes: ['send_ticket', 'send_trip_updates']
    };
  }

  function identityFromLineProfile(profile, consent) {
    var userId = cleanText(profile && profile.userId, 160);
    if (!userId) {
      var err = new Error('LINE profile does not include userId');
      err.code = 'LINE_PROFILE_MISSING_USER_ID';
      throw err;
    }
    return {
      provider: 'line',
      status: 'verified_by_liff',
      lineUserId: userId,
      displayName: cleanText(profile && profile.displayName, 120),
      pictureUrl: cleanText(profile && profile.pictureUrl, 500),
      linkedAt: nowISO(),
      consentVersion: consent && consent.consentVersion || CONSENT_VERSION,
      consentAcceptedAt: consent && consent.acceptedAt || nowISO(),
      consentPurposes: consent && consent.purposes || ['send_ticket', 'send_trip_updates']
    };
  }

  function setCurrentIdentity(identity) {
    currentIdentity = identity || null;
    return currentIdentity;
  }

  function getCurrentIdentity() {
    return currentIdentity;
  }

  function clearCurrentIdentity() {
    currentIdentity = null;
  }

  function isLineIdentity(identity) {
    return !!(identity && identity.provider === 'line' && identity.lineUserId);
  }

  function loginWithLine() {
    if (!hasLineConfig()) {
      var configErr = new Error('LINE LIFF ID is not configured');
      configErr.code = 'LINE_LOGIN_NOT_CONFIGURED';
      return Promise.reject(configErr);
    }
    if (!global.liff) {
      var sdkErr = new Error('LINE LIFF SDK is not loaded');
      sdkErr.code = 'LINE_LIFF_SDK_NOT_LOADED';
      return Promise.reject(sdkErr);
    }
    var consent = buildConsent('booking1.html');
    return global.liff.init({ liffId: liffId() }).then(function() {
      if (!global.liff.isLoggedIn()) {
        global.liff.login({ redirectUri: global.location.href });
        return null;
      }
      return global.liff.getProfile().then(function(profile) {
        return setCurrentIdentity(identityFromLineProfile(profile, consent));
      });
    });
  }

  global.SLTransitPassengerIdentityCenter = {
    consentVersion: CONSENT_VERSION,
    hasLineConfig: hasLineConfig,
    guestIdentity: guestIdentity,
    guestNotificationPreference: guestNotificationPreference,
    lineNotificationPreference: lineNotificationPreference,
    buildConsent: buildConsent,
    identityFromLineProfile: identityFromLineProfile,
    setCurrentIdentity: setCurrentIdentity,
    getCurrentIdentity: getCurrentIdentity,
    clearCurrentIdentity: clearCurrentIdentity,
    isLineIdentity: isLineIdentity,
    loginWithLine: loginWithLine
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.SLTransitPassengerIdentityCenter;
  }
})(typeof window !== 'undefined' ? window : globalThis);
