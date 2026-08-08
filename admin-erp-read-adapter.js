(function (global) {
  'use strict';

  var DEFAULT_ENDPOINT = '';

  function config() {
    var runtime = global.SLTransitAdminErpRuntime || {};
    return {
      endpoint: runtime.readEndpoint || DEFAULT_ENDPOINT,
      getIdToken: typeof runtime.getIdToken === 'function' ? runtime.getIdToken : null
    };
  }

  function failure(code, detail) {
    var error = new Error(code);
    error.code = code;
    error.detail = detail || '';
    return error;
  }

  function read(options) {
    options = options || {};
    var current = config();
    var endpoint = options.endpoint || current.endpoint;
    var getIdToken = options.getIdToken || current.getIdToken;
    if (!endpoint) return Promise.reject(failure('admin_erp_read_not_configured'));
    if (!getIdToken) return Promise.reject(failure('admin_erp_token_provider_missing'));
    return Promise.resolve().then(getIdToken).then(function (token) {
      if (!token) throw failure('admin_erp_token_required');
      return fetch(endpoint, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        headers: { Authorization: 'Bearer ' + token }
      });
    }).then(function (response) {
      if (!response.ok) throw failure(response.status === 401 ? 'admin_erp_unauthorized' : response.status === 403 ? 'admin_erp_forbidden' : 'admin_erp_read_failed', 'HTTP ' + response.status);
      return response.json();
    }).then(function (payload) {
      if (!payload || typeof payload !== 'object') throw failure('admin_erp_invalid_response');
      return {
        status: payload.status || 'ready',
        path: payload.path || 'data/erpDataCenter',
        data: payload.erpDataCenter && typeof payload.erpDataCenter === 'object' ? payload.erpDataCenter : {},
        generatedAt: payload.generatedAt || null
      };
    });
  }

  function entity(result, path) {
    var node = result && result.data || {};
    String(path || '').split('/').filter(Boolean).forEach(function (part) {
      node = node && typeof node === 'object' ? node[part] : undefined;
    });
    return node && typeof node === 'object' ? node : {};
  }

  global.SLTransitAdminErpReadAdapter = {
    isConfigured: function () { return !!config().endpoint; },
    read: read,
    entity: entity,
    write: function () { return Promise.reject(failure('admin_erp_write_disabled_in_read_adapter')); }
  };
}(window));
