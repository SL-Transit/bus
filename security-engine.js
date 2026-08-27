(function(global) {
  'use strict';

  var DEFAULT_WINDOW_MS = 10 * 60 * 1000;
  var DEFAULT_MAX_ATTEMPTS = 5;

  function bytesToHex(bytes) {
    return Array.prototype.map.call(bytes, function(byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  function stableFallbackHash(value) {
    var h1 = 0x811c9dc5;
    var text = String(value || '');
    for (var i = 0; i < text.length; i++) {
      h1 ^= text.charCodeAt(i);
      h1 += (h1 << 1) + (h1 << 4) + (h1 << 7) + (h1 << 8) + (h1 << 24);
    }
    return ('00000000' + (h1 >>> 0).toString(16)).slice(-8);
  }

  function sha256Hex(value) {
    var text = String(value || '');
    if (global.crypto && global.crypto.subtle && global.TextEncoder) {
      return global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function(buf) {
        return bytesToHex(new Uint8Array(buf));
      });
    }
    return Promise.resolve(stableFallbackHash(text));
  }

  function hashLineUserId(lineUserId) {
    return sha256Hex(lineUserId).then(function(hex) {
      return 'PSG_' + hex.slice(0, 12);
    });
  }

  function normalizeRateLimit(snapshot, now) {
    var raw = snapshot || {};
    var windowStart = Number(raw.windowStart || 0);
    var attempts = Number(raw.attempts || 0);
    if (!windowStart || now - windowStart >= DEFAULT_WINDOW_MS) {
      return { attempts: 0, windowStart: now, blockedUntil: 0 };
    }
    return {
      attempts: attempts,
      windowStart: windowStart,
      blockedUntil: Number(raw.blockedUntil || 0)
    };
  }

  function evaluateRateLimit(snapshot, options) {
    var opts = options || {};
    var now = Number(opts.now || Date.now());
    var maxAttempts = Number(opts.maxAttempts || DEFAULT_MAX_ATTEMPTS);
    var windowMs = Number(opts.windowMs || DEFAULT_WINDOW_MS);
    var current = normalizeRateLimit(snapshot, now);
    var blockedByTime = current.blockedUntil && current.blockedUntil > now;
    var nextAttempts = current.attempts + 1;
    var blockedByCount = nextAttempts > maxAttempts;
    var blockedUntil = blockedByTime ? current.blockedUntil : (blockedByCount ? current.windowStart + windowMs : 0);
    return {
      allowed: !blockedByTime && !blockedByCount,
      attempts: nextAttempts,
      maxAttempts: maxAttempts,
      windowStart: current.windowStart,
      blockedUntil: blockedUntil,
      retryAfterMs: blockedUntil ? Math.max(0, blockedUntil - now) : 0
    };
  }

  function checkRateLimit(db, subjectId, options) {
    if (!db || typeof db.ref !== 'function') {
      return Promise.reject(new Error('Firebase database is required'));
    }
    return sha256Hex(subjectId).then(function(hex) {
      var key = hex.slice(0, 24);
      var opts = options || {};
      var now = Number(opts.now || Date.now());
      var maxAttempts = Number(opts.maxAttempts || DEFAULT_MAX_ATTEMPTS);
      var windowMs = Number(opts.windowMs || DEFAULT_WINDOW_MS);
      var path = 'data/security/rateLimits/' + key;
      var finalResult = null;
      return db.ref(path).transaction(function(current) {
        var result = evaluateRateLimit(current || {}, {
          now: now,
          maxAttempts: maxAttempts,
          windowMs: windowMs
        });
        finalResult = Object.assign({ key: key, path: path }, result);
        return {
          attempts: result.attempts,
          windowStart: result.windowStart,
          blockedUntil: result.blockedUntil,
          updatedAt: now
        };
      }).then(function() {
        return finalResult;
      });
    });
  }

  function safeJson(value) {
    try { return JSON.parse(JSON.stringify(value == null ? null : value)); }
    catch (err) { return null; }
  }

  function logAdminAction(db, action, targetPath, beforeValue, afterValue, actor) {
    if (!db || typeof db.ref !== 'function') {
      return Promise.reject(new Error('Firebase database is required'));
    }
    var ref = db.ref('admin/adminLogs').push();
    var payload = {
      action: String(action || ''),
      targetPath: String(targetPath || ''),
      before: safeJson(beforeValue),
      after: safeJson(afterValue),
      actor: actor || null,
      createdAt: Date.now()
    };
    return ref.set(payload).then(function() { return ref.key; });
  }

  var api = {
    sha256Hex: sha256Hex,
    hashLineUserId: hashLineUserId,
    evaluateRateLimit: evaluateRateLimit,
    checkRateLimit: checkRateLimit,
    logAdminAction: logAdminAction
  };

  global.SLTransit = global.SLTransit || {};
  global.SLTransit.security = api;
})(window);
