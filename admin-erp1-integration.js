(function (global) {
  'use strict';

  var STATUS_TEXT = {
    loading: 'กำลังโหลดข้อมูล',
    empty: 'ไม่มีข้อมูล',
    partial: 'ข้อมูลบางส่วน',
    stale: 'ข้อมูลล้าสมัย',
    error: 'ตรวจสอบข้อมูลไม่สำเร็จ',
    forbidden: 'ไม่มีสิทธิ์เข้าถึง',
    ready: 'พร้อมอ่านข้อมูล',
    disconnected: 'ยังไม่เชื่อมต่อแหล่งข้อมูล'
  };

  var SOURCE_BY_TAB = global.AdminErpReadModel ? global.AdminErpReadModel.sources : {};

  var UNAPPROVED_TABS = {
    staff: 'ยังไม่มีเส้นทางข้อมูลที่อนุมัติสำหรับผู้ใช้งาน',
    accounts: 'ยังไม่มีเส้นทางข้อมูลที่อนุมัติสำหรับบัญชีและสิทธิ์',
    alerts: 'ยังไม่มีเส้นทางข้อมูลที่อนุมัติสำหรับศูนย์แจ้งเตือน'
  };

  var DISPLAY_REPAIRS = Object.freeze({
    '\u0e40\u0e19\u0083\u0e40\u0e18\u008a\u0e40\u0e19\u0088': 'ใช่',
    '\u0e40\u0e19\u0084\u0e40\u0e18\u0e01\u0e40\u0e19\u0088': 'ไม่'
  });

  var WINDOWS_874_REVERSE = null;

  var WINDOWS_874_SPECIAL = Object.freeze({
    0x20ac: 0x80, 0x0081: 0x81, 0x201a: 0x82, 0x0192: 0x83,
    0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
    0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b,
    0x0152: 0x8c, 0x008d: 0x8d, 0x017d: 0x8e, 0x008f: 0x8f,
    0x0090: 0x90, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
    0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
    0x0153: 0x9c, 0x009d: 0x9d, 0x017e: 0x9e, 0x0178: 0x9f
  });

  function windows874ByteForCharacter(character) {
    var code = character.charCodeAt(0);
    if (code < 0x80) return code;
    if (code >= 0x80 && code <= 0x9f) return code;
    if (code >= 0x0e01 && code <= 0x0e3a) return 0xa1 + (code - 0x0e01);
    if (code >= 0x0e40 && code <= 0x0e5b) return 0xe0 + (code - 0x0e40);
    return WINDOWS_874_SPECIAL[code];
  }

  function decodeUtf8(bytes) {
    var result = '';
    for (var index = 0; index < bytes.length;) {
      var first = bytes[index++];
      var codePoint;
      if (first < 0x80) {
        codePoint = first;
      } else if (first >= 0xc0 && first < 0xe0 && index < bytes.length) {
        codePoint = ((first & 0x1f) << 6) | (bytes[index++] & 0x3f);
      } else if (first >= 0xe0 && first < 0xf0 && index + 1 < bytes.length) {
        codePoint = ((first & 0x0f) << 12) | ((bytes[index++] & 0x3f) << 6) | (bytes[index++] & 0x3f);
      } else if (first >= 0xf0 && first < 0xf8 && index + 2 < bytes.length) {
        codePoint = ((first & 0x07) << 18) | ((bytes[index++] & 0x3f) << 12) | ((bytes[index++] & 0x3f) << 6) | (bytes[index++] & 0x3f);
      } else {
        return null;
      }
      if (codePoint <= 0xffff) {
        result += String.fromCharCode(codePoint);
      } else if (codePoint <= 0x10ffff) {
        codePoint -= 0x10000;
        result += String.fromCharCode(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 0x3ff));
      } else {
        return null;
      }
    }
    return result;
  }

  function windows874ReverseMap() {
    if (WINDOWS_874_REVERSE) return WINDOWS_874_REVERSE;
    WINDOWS_874_REVERSE = {};
    if (typeof TextDecoder !== 'function') return WINDOWS_874_REVERSE;
    try {
      var decoder = new TextDecoder('windows-874');
      for (var byte = 0x80; byte <= 0xff; byte += 1) {
        WINDOWS_874_REVERSE[decoder.decode(new Uint8Array([byte]))] = byte;
      }
    } catch (error) {
      WINDOWS_874_REVERSE = {};
    }
    return WINDOWS_874_REVERSE;
  }

  function repairDisplayText(value) {
    if (typeof value !== 'string') return value;
    if (Object.prototype.hasOwnProperty.call(DISPLAY_REPAIRS, value)) return DISPLAY_REPAIRS[value];
    if (!/\u0e40\u0e18|\u0e40\u0e19(?:€|[\u0080-\u009f])/.test(value)) return value;
    try {
      var bytes = [];
      for (var index = 0; index < value.length; index += 1) {
        var character = value.charAt(index);
        var reverse = windows874ReverseMap();
        var byte = reverse[character];
        if (byte == null) byte = windows874ByteForCharacter(character);
        if (byte == null) return value;
        bytes.push(byte);
      }
      var repaired = typeof TextDecoder === 'function'
        ? new TextDecoder('utf-8').decode(new Uint8Array(bytes))
        : decodeUtf8(bytes);
      if (repaired == null) return value;
      return repaired.indexOf('\ufffd') === -1 && repaired !== value ? repaired : value;
    } catch (error) {
      return value;
    }
  }

  function text(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'ใช่' : 'ไม่ใช่';
    if (typeof value === 'object') return JSON.stringify(value);
    return repairDisplayText(String(value));
  }

  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, function (character) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
    });
  }

  function activeTab(root) {
    var button = root.querySelector('.erp-tabs [data-erp-tab].active');
    return button ? button.dataset.erpTab : null;
  }

  function setStatus(root, status, message) {
    var statusNode = root.querySelector('.erp-status');
    if (!statusNode) return;
    statusNode.textContent = message || STATUS_TEXT[status] || STATUS_TEXT.error;
    statusNode.dataset.erpStatus = status;
    statusNode.className = 'erp-status' + (status === 'ready' ? ' status-ready' : '');
  }

  function setMeta(root, result) {
    var cards = root.querySelectorAll('.erp-meta-card strong');
    if (cards[2]) cards[2].textContent = result.version ? 'รุ่น ' + result.version : 'ยังไม่มีรุ่นที่ยืนยัน';
    if (cards[3]) cards[3].textContent = result.lastUpdated ? new Date(result.lastUpdated).toLocaleString('th-TH') : 'ยังไม่มีข้อมูล';
  }

  function renderRows(root, source, result) {
    var body = root.querySelector('.erp-table tbody');
    if (!body) return;
    if (!result.rows.length) {
      body.innerHTML = '<tr><td colspan="' + (source.fields.length + 3) + '"><div class="empty"><div><strong>' + escapeHtml(STATUS_TEXT.empty) + '</strong><span>ไม่พบข้อมูลจากแหล่งข้อมูลกลาง</span></div></div></td></tr>';
      return;
    }
    body.innerHTML = result.rows.map(function (row, index) {
      var sourceRowNumber = row && row[source.orderField] != null ? row[source.orderField] : index + 1;
      var cells = source.fields.map(function (field) {
        return '<td><input class="field" readonly aria-readonly="true" value="' + escapeHtml(row[field]) + '"></td>';
      }).join('');
      return '<tr data-source-row-number="' + escapeHtml(sourceRowNumber) + '"><td><span class="status ready">แถว Excel ' + escapeHtml(sourceRowNumber) + '</span></td>' + cells + '<td><span class="status ready">' + escapeHtml(STATUS_TEXT[result.status] || STATUS_TEXT.ready) + '</span></td><td><button class="action" disabled>อ่านอย่างเดียว</button></td></tr>';
    }).join('');
  }

  function renderMessage(root, message) {
    var body = root.querySelector('.erp-table tbody');
    if (body) body.innerHTML = '<tr><td colspan="20"><div class="empty"><div><strong>' + escapeHtml(message) + '</strong><span>ยังไม่มีการอ่านข้อมูลในหมวดนี้</span></div></div></td></tr>';
  }

  function loadCenter(root, key) {
    var source = SOURCE_BY_TAB[key];
    if (!source) {
      setStatus(root, 'disconnected', UNAPPROVED_TABS[key] || STATUS_TEXT.disconnected);
      renderMessage(root, UNAPPROVED_TABS[key] || STATUS_TEXT.disconnected);
      return Promise.resolve();
    }

    setStatus(root, 'loading');
    var operation = global.AdminErpReadModel
      ? global.AdminErpReadModel.read(key, global.AdminErpDataSource)
      : Promise.reject(new Error('read_model_not_loaded'));
    return operation.then(function (result) {
      setStatus(root, result.status);
      setMeta(root, result);
      renderRows(root, source, result);
    }).catch(function (error) {
      var status = error && error.code === 'forbidden' ? 'forbidden' : error && error.code === 'token_required' ? 'disconnected' : 'error';
      setStatus(root, status);
      renderMessage(root, STATUS_TEXT[status]);
    });
  }

  function refresh() {
    if (!global.AdminErpDataSource) return;
    var roots = document.querySelectorAll('.erp-center');
    var config = global.SLTransitAdminErpConfig;
    if (!config || !config.endpoint || typeof config.getIdToken !== 'function') {
      Array.prototype.forEach.call(roots, function (root) {
        if (root.dataset.erpDisconnectedRendered === '1') return;
        root.dataset.erpDisconnectedRendered = '1';
        setStatus(root, 'disconnected');
        renderMessage(root, STATUS_TEXT.disconnected);
      });
      return;
    }
    Array.prototype.forEach.call(roots, function (root) {
      var key = activeTab(root);
      if (!key || root.dataset.erpLoadedKey === key) return;
      delete root.dataset.erpDisconnectedRendered;
      root.dataset.erpLoadedKey = key;
      loadCenter(root, key);
    });
  }

  function initialize() {
    var config = global.SLTransitAdminErpConfig;
    if (!config || !config.endpoint || typeof config.getIdToken !== 'function') {
      return;
    }
    global.AdminErpDataSource.configure(config);
    refresh();
  }

  function startBridge() {
    var observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', function (event) {
      if (event.target.closest('.erp-tabs [data-erp-tab]')) setTimeout(refresh, 0);
    });
    global.addEventListener('admin-erp:refresh', function () {
      document.querySelectorAll('.erp-center').forEach(function (root) { delete root.dataset.erpLoadedKey; });
      refresh();
    });
    setTimeout(initialize, 0);
  }
  if (typeof document !== 'undefined') {
    if (document.body) startBridge();
    else document.addEventListener('DOMContentLoaded', startBridge, { once: true });
  }

  global.AdminErpPageIntegration = { refresh: refresh, statusText: STATUS_TEXT, sources: SOURCE_BY_TAB, repairDisplayText: repairDisplayText };
}(typeof window !== 'undefined' ? window : globalThis));
