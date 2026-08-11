(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SLTransitGreenfieldApi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const COMMAND_ENDPOINT = "/api/greenfield-erp/commands";
  const ALLOWED_COMMANDS = Object.freeze([
    "upload.authorize",
    "import.start",
    "import.status",
    "draft.save",
    "review.request",
    "approval.decide"
  ]);

  function clientError(code, message, status) {
    const error = new Error(message || code);
    error.code = code;
    error.status = status || 0;
    return error;
  }

  function randomToken() {
    const cryptoRef = root && root.crypto;
    if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
      return cryptoRef.randomUUID().replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 24);
    }
    return (Date.now().toString(36) + Math.random().toString(36).slice(2))
      .replace(/[^A-Za-z0-9]/g, "").toUpperCase().padEnd(16, "0").slice(0, 24);
  }

  function commandIds(options) {
    const input = options || {};
    return Object.freeze({
      requestId: input.requestId || "REQ-" + randomToken(),
      idempotencyKey: input.idempotencyKey || "IDM-" + randomToken()
    });
  }

  function responseResult(response) {
    const data = response && response.data;
    if (data && Object.prototype.hasOwnProperty.call(data, "result")) return data.result;
    return data;
  }

  function createClient(options) {
    const settings = options || {};
    const transport = settings.transport;
    const uploadTransport = settings.uploadTransport;
    const getToken = settings.getToken;

    async function token() {
      return typeof getToken === "function" ? getToken() : null;
    }

    async function send(command, payload, commandOptions) {
      if (!ALLOWED_COMMANDS.includes(command)) {
        throw clientError("unsupported_command", "Command is outside the Phase 6A contract.");
      }
      if (typeof transport !== "function") {
        throw clientError("greenfield_backend_not_connected", "Greenfield backend transport is not connected.");
      }
      const ids = commandIds(commandOptions);
      const bearer = await token();
      const response = await transport({
        method: "POST",
        url: COMMAND_ENDPOINT,
        headers: {
          ...(bearer ? { Authorization: "Bearer " + bearer } : {}),
          "content-type": "application/json",
          "x-idempotency-key": ids.idempotencyKey
        },
        body: {
          requestId: ids.requestId,
          idempotencyKey: ids.idempotencyKey,
          command,
          payload: payload || {}
        }
      });
      if (!response || response.ok !== true) {
        const data = response && response.data;
        throw clientError(data && data.code || "command_failed", "The backend did not accept the command.", response && response.status);
      }
      return responseResult(response);
    }

    async function upload(file, target) {
      if (typeof uploadTransport !== "function") {
        throw clientError("upload_transport_not_connected", "Upload transport is not connected.");
      }
      if (!target || typeof target.url !== "string") {
        throw clientError("upload_target_invalid");
      }
      const bearer = await token();
      const response = await uploadTransport({
        method: target.method || "POST",
        url: target.url,
        headers: {
          ...(target.headers || {}),
          ...(bearer ? { Authorization: "Bearer " + bearer } : {})
        },
        body: file
      });
      if (!response || response.ok !== true) {
        throw clientError("upload_failed", "The staged upload failed.", response && response.status);
      }
      return { ok: true };
    }

    return Object.freeze({ send, upload });
  }

  function createFetchTransport(options) {
    const input = options || {};
    const fetchImpl = input.fetchImpl || root && root.fetch;
    if (typeof fetchImpl !== "function") return null;
    return async function fetchCommand(request) {
      const response = await fetchImpl(input.endpoint || request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(request.body),
        credentials: "omit"
      });
      let data = null;
      try { data = await response.json(); } catch (_error) {}
      return { ok: response.ok, status: response.status, data };
    };
  }

  function createFetchUploadTransport(options) {
    const input = options || {};
    const fetchImpl = input.fetchImpl || root && root.fetch;
    if (typeof fetchImpl !== "function") return null;
    return async function fetchUpload(request) {
      const response = await fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        credentials: "omit"
      });
      return { ok: response.ok, status: response.status };
    };
  }

  return Object.freeze({
    ALLOWED_COMMANDS,
    COMMAND_ENDPOINT,
    clientError,
    commandIds,
    createClient,
    createFetchTransport,
    createFetchUploadTransport
  });
});