(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SLTransitGreenfieldApi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COMMAND_ENDPOINT = '/api/greenfield-erp/commands';
  const ALLOWED_COMMANDS = Object.freeze(['import.start', 'import.status', 'draft.save', 'review.request', 'approval.decide']);

  function clientError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function createClient(options) {
    const settings = options || {};
    const transport = settings.transport;
    const getToken = settings.getToken;
    async function send(command, payload) {
      if (!ALLOWED_COMMANDS.includes(command)) throw clientError('unsupported_command', 'Command is outside the Phase 3 contract.');
      if (typeof transport !== 'function') throw clientError('greenfield_backend_not_connected', 'Greenfield backend transport is not connected.');
      const token = typeof getToken === 'function' ? await getToken() : null;
      const response = await transport({ method: 'POST', url: COMMAND_ENDPOINT, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: { command, payload: payload || {} } });
      if (!response || response.ok !== true) throw clientError('command_failed', 'The backend did not accept the command.');
      return response.data;
    }
    return Object.freeze({ send });
  }

  return Object.freeze({ COMMAND_ENDPOINT, ALLOWED_COMMANDS, createClient });
});