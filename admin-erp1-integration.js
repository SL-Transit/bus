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

  function text(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'ใช่' : 'ไม่ใช่';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
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

  global.AdminErpPageIntegration = { refresh: refresh, statusText: STATUS_TEXT, sources: SOURCE_BY_TAB };
}(typeof window !== 'undefined' ? window : globalThis));
