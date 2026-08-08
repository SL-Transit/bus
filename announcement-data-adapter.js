(function (global) {
  'use strict';

  var PUBLIC_PROJECTION_PATH = 'announcements';
  var CONTENT_DRAFT_PATH = 'data/erpDataCenter/content/announcements';

  function value(value) {
    return value == null ? '' : String(value);
  }

  function timestamp(input) {
    if (input == null || input === '') return 0;
    if (typeof input === 'number') return input;
    var parsed = new Date(input).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }

  function list(value) {
    if (Array.isArray(value)) return value.map(String);
    if (value && typeof value === 'object') return Object.keys(value).filter(function (key) { return value[key] !== false; });
    return value ? [String(value)] : [];
  }

  function safeImage(input) {
    var image = value(input);
    if (!image) return null;
    if (/^https:\/\//i.test(image) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image)) return image;
    return null;
  }

  function normalize(record, id) {
    record = record && typeof record === 'object' ? record : {};
    var publishFrom = record.publishFrom || record.startsAt || record.startAt || null;
    var publishUntil = record.publishUntil || record.expiresAt || record.endAt || null;
    return {
      contentId: value(record.contentId || record.content_id || id),
      title: value(record.title),
      body: value(record.body || record.summary || record.description),
      type: value(record.type || 'info'),
      status: value(record.status || 'published'),
      active: record.active !== false && record.enabled !== false,
      placement: value(record.placement || record.placementId || 'homepage_hero'),
      channels: list(record.channels || record.channel),
      publishFrom: publishFrom,
      publishUntil: publishUntil,
      imageUrl: safeImage(record.imageUrl || record.assetUrl || record.imageB64),
      imageB64: safeImage(record.imageUrl || record.assetUrl || record.imageB64),
      updatedAt: record.updatedAt || record.ts || 0,
      ts: record.ts || record.updatedAt || 0,
      sourcePath: PUBLIC_PROJECTION_PATH + '/' + id
    };
  }

  function isPublished(item, now) {
    now = now || Date.now();
    var from = timestamp(item.publishFrom);
    var until = timestamp(item.publishUntil);
    var status = item.status.toLowerCase();
    return item.active && !!item.title && ['published', 'live', 'active'].indexOf(status) !== -1 &&
      (!from || from <= now) && (!until || until >= now);
  }

  function forChannel(item, channel, placements) {
    var channels = item.channels || [];
    var channelAllowed = !channels.length || channels.indexOf(channel) !== -1 || (channel === 'index' && channels.indexOf('passenger') !== -1) || (channel === 'passenger' && channels.indexOf('index') !== -1);
    var placementAllowed = !placements || !placements.length || placements.indexOf(item.placement) !== -1;
    return channelAllowed && placementAllowed;
  }

  function filterPublished(records, options) {
    options = options || {};
    var now = options.now || Date.now();
    var channel = options.channel || '';
    var placements = options.placements || null;
    return (Array.isArray(records) ? records : []).filter(function (item) {
      return isPublished(item, now) && forChannel(item, channel, placements);
    }).sort(function (a, b) {
      return timestamp(b.updatedAt) - timestamp(a.updatedAt);
    });
  }

  function readPublished(db, options) {
    if (!db || typeof db.ref !== 'function') return Promise.reject(new Error('announcement_database_unavailable'));
    options = options || {};
    return db.ref(PUBLIC_PROJECTION_PATH).once('value').then(function (snapshot) {
      var raw = snapshot.val() || {};
      var records = Object.keys(raw).map(function (id) { return normalize(raw[id], id); });
      return filterPublished(records, options);
    });
  }

  global.SLTransitAnnouncementAdapter = {
    publicProjectionPath: PUBLIC_PROJECTION_PATH,
    contentDraftPath: CONTENT_DRAFT_PATH,
    normalize: normalize,
    filterPublished: filterPublished,
    readPublished: readPublished
  };
}(window));
