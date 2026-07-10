(function(global) {
  'use strict';

  var ENTITY_OPTIONS = [
    ['destination', 'Destination'],
    ['stop', 'Stop / Boarding Point'],
    ['boardingPoint', 'Boarding Point'],
    ['terminal', 'Terminal / Queue Terminal'],
    ['queue', 'Queue'],
    ['provider', 'Provider'],
    ['serviceGroup', 'Service Group'],
    ['route', 'Route'],
    ['vehicle', 'Vehicle'],
    ['driver', 'Driver'],
    ['settlementRecipient', 'Settlement Recipient'],
    ['serviceFee', 'Service Fee']
  ];

  var ENTITY_DATA_KEYS = {
    destination: 'destinations',
    stop: 'stops',
    boardingPoint: 'boardingPoints',
    terminal: 'terminals',
    queue: 'queues',
    provider: 'providers',
    serviceGroup: 'serviceGroups',
    route: 'routes',
    vehicle: 'vehicles',
    driver: 'drivers',
    settlementRecipient: 'settlementRecipients',
    serviceFee: 'serviceFees'
  };

  function $(id) { return document.getElementById(id); }

  function definitions() {
    return global.SLTransit && global.SLTransit.adminMasterData && global.SLTransit.adminMasterData.ENTITY_DEFINITIONS || {};
  }

  function guard() {
    return global.SLTransit && global.SLTransit.adminMasterData || null;
  }

  function db() {
    return global.SLTransit && global.SLTransit.db || null;
  }

  function valueOrEmpty(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function parseJsonBox(id) {
    var text = ($(id) && $(id).value || '').trim();
    if (!text) return {};
    return JSON.parse(text);
  }

  function optionLabel(type) {
    var found = ENTITY_OPTIONS.filter(function(item) { return item[0] === type; })[0];
    return found ? found[1] : type;
  }

  function defaultRecord(entityType, id) {
    var def = definitions()[entityType] || {};
    var record = { status: 'draft', environmentStatus: 'test', productionReady: false };
    if (def.idField) record[def.idField] = id || '';
    if (entityType === 'vehicle') {
      record.liveTrackingAvailable = id === 'veh_005' ? false : true;
      record.legacyAliases = id === 'veh_005' ? ['car5'] : [];
    }
    if (entityType === 'serviceFee') {
      record.currency = 'THB';
      record.standardFee = 5;
      record.freeTrialEnabled = true;
      record.trialEnabled = true;
      record.effectiveFee = 0;
      record.appliesTo = 'all_service_groups';
      record.includesExternalPayGroups = true;
    }
    return record;
  }

  function setText(id, value) {
    var node = $(id);
    if (node) node.textContent = value;
  }

  function setValue(id, value) {
    var node = $(id);
    if (node) node.value = value;
  }

  function setJson(id, value) {
    setValue(id, JSON.stringify(value || {}, null, 2));
  }

  function hideAllContent() {
    Array.prototype.slice.call(document.querySelectorAll('main > section.content')).forEach(function(section) {
      section.classList.add('hidden');
    });
    Array.prototype.slice.call(document.querySelectorAll('.nav button')).forEach(function(button) {
      button.classList.remove('on');
    });
  }

  function showMasterDataPage() {
    hideAllContent();
    var page = $('masterdataPage');
    if (page) page.classList.remove('hidden');
    var tab = $('tabMasterData');
    if (tab) tab.classList.add('on');
    setText('pageTitle', 'ERP Data Center Master Data');
    setText('pageSub', 'DRY-RUN / NO WRITE / NOT PRODUCTION READY');
    renderMasterRecords();
    validateDraft();
  }

  function ensureUi() {
    if ($('masterdataPage')) return;
    var nav = document.querySelector('.nav');
    if (nav) {
      var button = document.createElement('button');
      button.id = 'tabMasterData';
      button.type = 'button';
      button.textContent = 'Master Data';
      button.onclick = showMasterDataPage;
      var backbone = $('tabBackbone');
      nav.insertBefore(button, backbone || null);
    }

    var main = document.querySelector('main');
    if (!main) return;
    var section = document.createElement('section');
    section.id = 'masterdataPage';
    section.className = 'content hidden';
    section.innerHTML = [
      '<div class="bar"><strong>Master-data catalog</strong><div class="actions"><button id="masterReload" type="button">Refresh</button><button id="masterValidate" type="button" class="primary">Validate draft</button></div></div>',
      '<div class="notice" style="display:block">DRY-RUN / NO WRITE / NOT PRODUCTION READY. This page builds validation and before/after plans only. It has no Save, Apply, Seed, Publish, or Firebase-write action.</div>',
      '<div class="grid">',
      '<section class="panel"><div class="ph">Existing records <span id="masterRecordCount" class="pill">0</span></div><div class="form"><label>Entity type<select id="masterEntity"></select></label><div id="masterRecordList"><div class="empty">No data loaded</div></div></div></section>',
      '<section class="panel"><div class="ph">Draft add/edit</div><div class="form"><div class="tw"><label>Actor<input id="masterActor" value="owner_admin" readonly></label><label>Action<select id="masterAction"><option>create</option><option>update</option><option>deactivate</option><option>reactivate</option></select></label></div><label>Stable ID<input id="masterEntityId" placeholder="stable immutable ID"></label><label>Draft JSON<textarea id="masterDraftJson">{}</textarea></label><div class="empty">Stable ID remains editable only for a new draft. Selecting an existing record locks the ID field.</div></div></section>',
      '</div>',
      '<div class="grid">',
      '<section class="panel"><div class="ph">Validation blockers / warnings</div><div class="form"><textarea id="masterValidationOut" readonly></textarea></div></section>',
      '<section class="panel"><div class="ph">Generated dry-run before/after plan</div><div class="form"><textarea id="masterPlanOut" readonly></textarea></div></section>',
      '</div>'
    ].join('');
    var finance = $('financePage');
    main.insertBefore(section, finance || main.firstChild);

    var select = $('masterEntity');
    ENTITY_OPTIONS.forEach(function(item) {
      var option = document.createElement('option');
      option.value = item[0];
      option.textContent = item[1];
      select.appendChild(option);
    });
    $('masterReload').onclick = renderMasterRecords;
    $('masterValidate').onclick = validateDraft;
    $('masterEntity').onchange = function() {
      clearDraft();
      renderMasterRecords();
      validateDraft();
    };
    $('masterAction').onchange = validateDraft;
    $('masterEntityId').oninput = function() {
      if (!$('masterEntityId').readOnly) setJson('masterDraftJson', defaultRecord($('masterEntity').value, $('masterEntityId').value));
      validateDraft();
    };
    $('masterDraftJson').oninput = validateDraft;
  }

  function emptyCatalog() {
    return {
      destinations: {},
      stops: {},
      boardingPoints: {},
      terminals: {},
      queues: {},
      providers: {},
      serviceGroups: {},
      routes: {},
      vehicles: {},
      drivers: {},
      settlementRecipients: {},
      serviceFees: {}
    };
  }

  function loadCatalog() {
    var adapter = db();
    if (adapter && typeof adapter.getAdminMasterDataCatalog === 'function' && adapter.isReady && adapter.isReady()) {
      return adapter.getAdminMasterDataCatalog().catch(function() { return emptyCatalog(); });
    }
    return Promise.resolve(emptyCatalog());
  }

  function renderRecordButton(type, id, record) {
    var row = document.createElement('div');
    row.className = 'row simple';
    row.innerHTML = '<strong></strong><span></span><button type="button">Open</button>';
    row.querySelector('strong').textContent = id;
    row.querySelector('span').textContent = record.displayNameTh || record.displayName || record.name || record.registrationNo || record.status || optionLabel(type);
    row.querySelector('button').onclick = function() {
      setValue('masterEntityId', id);
      $('masterEntityId').readOnly = true;
      setValue('masterAction', 'update');
      setJson('masterDraftJson', record);
      validateDraft(record);
    };
    return row;
  }

  function renderMasterRecords() {
    ensureUi();
    var type = $('masterEntity').value;
    var key = ENTITY_DATA_KEYS[type];
    var list = $('masterRecordList');
    list.innerHTML = '<div class="empty">Loading...</div>';
    return loadCatalog().then(function(catalog) {
      var records = valueOrEmpty(catalog[key]);
      var ids = Object.keys(records).sort();
      setText('masterRecordCount', String(ids.length));
      list.innerHTML = '';
      if (!ids.length) {
        list.innerHTML = '<div class="empty">No existing records from adapter</div>';
        return;
      }
      ids.forEach(function(id) { list.appendChild(renderRecordButton(type, id, valueOrEmpty(records[id]))); });
    });
  }

  function clearDraft() {
    var type = $('masterEntity').value;
    $('masterEntityId').readOnly = false;
    setValue('masterEntityId', '');
    setJson('masterDraftJson', defaultRecord(type, ''));
  }

  function validateDraft(before) {
    ensureUi();
    var g = guard();
    if (!g || typeof g.buildMasterDataPlan !== 'function') {
      setValue('masterValidationOut', 'Admin master-data guard is not loaded.');
      return;
    }
    var type = $('masterEntity').value;
    var id = $('masterEntityId').value.trim();
    var after;
    try {
      after = parseJsonBox('masterDraftJson');
    } catch (err) {
      setValue('masterValidationOut', JSON.stringify({ blockers: [{ code: 'invalid-json', message: err.message }] }, null, 2));
      setValue('masterPlanOut', '');
      return;
    }
    var plan = g.buildMasterDataPlan({
      dryRun: true,
      writesEnabled: false,
      readyForApply: false,
      actorId: 'owner_admin',
      actorRole: 'owner_admin',
      action: $('masterAction').value,
      entityType: type,
      entityId: id,
      before: before || {},
      after: after,
      reason: 'admin-erp dry-run master-data preview'
    });
    setValue('masterValidationOut', JSON.stringify(plan.validation, null, 2));
    setValue('masterPlanOut', JSON.stringify({
      dryRun: plan.dryRun,
      writesEnabled: plan.writesEnabled,
      readyForApply: plan.readyForApply,
      before: before || {},
      after: after,
      audit: plan.audit,
      updates: plan.updates
    }, null, 2));
  }

  document.addEventListener('DOMContentLoaded', function() {
    ensureUi();
    clearDraft();
    renderMasterRecords();
    validateDraft();
  });
})(typeof window !== 'undefined' ? window : globalThis);
