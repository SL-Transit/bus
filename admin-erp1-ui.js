(function adminErp1UiModule(root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SLTransitAdminErpUi = api;
  if (root.document) {
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", api.init, { once: true });
    else api.init();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createAdminErp1Ui(root) {
  "use strict";

  var ROUTES = Object.freeze({
    dashboard: Object.freeze({ title: "แดชบอร์ด", view: "dashboard" }),
    today: Object.freeze({ title: "งานที่ต้องจัดการวันนี้", view: "today" }),
    operations: Object.freeze({ title: "คิวรถและตารางเวลา", view: "operations" }),
    bookings: Object.freeze({ title: "ความจุและการเปิดขาย", view: "bookings" }),
    finance: Object.freeze({ title: "รายได้ การจอง และการยกเลิก", view: "finance" }),
    content: Object.freeze({ title: "ข่าวสารและประกาศ", view: "content" }),
    "data-center": Object.freeze({ title: "ศูนย์ข้อมูล ERP", view: "data-center" }),
    published: Object.freeze({ title: "เวอร์ชันเผยแพร่", view: "published" }),
    users: Object.freeze({ title: "ผู้ใช้งานและสิทธิ์", view: "users" }),
    "test-center": Object.freeze({ title: "ศูนย์ทดสอบ", view: "test-center" }),
    "system-status": Object.freeze({ title: "สถานะระบบและ Audit", view: "system-status" }),
    account: Object.freeze({ title: "บัญชีของฉัน", view: "account" })
  });

  var TARGETS = Object.freeze({
    "data-center": Object.freeze(["data-center", "import", "draft", "validation", "review", "approval", "publication-lock"])
  });

  function safeDecode(value) {
    try { return decodeURIComponent(value || ""); }
    catch (error) { return value || ""; }
  }

  function parseHash(value) {
    var cleaned = safeDecode(String(value || "")).replace(/^#/, "").replace(/^\/+/, "").trim();
    var parts = cleaned.split("/").filter(Boolean);
    var route = Object.prototype.hasOwnProperty.call(ROUTES, parts[0]) ? parts[0] : "dashboard";
    var candidates = TARGETS[route] || [];
    var target = candidates.indexOf(parts[1]) >= 0 ? parts[1] : null;
    return Object.freeze({ route: route, target: target });
  }

  function routeHash(route, target) {
    var safeRoute = Object.prototype.hasOwnProperty.call(ROUTES, route) ? route : "dashboard";
    var candidates = TARGETS[safeRoute] || [];
    var safeTarget = candidates.indexOf(target) >= 0 ? target : "";
    return "#" + safeRoute + (safeTarget ? "/" + safeTarget : "");
  }

  function init() {
    var doc = root.document;
    var win = root.window || root;
    if (!doc || !win || doc.documentElement.dataset.adminErpUiReady === "true") return;
    doc.documentElement.dataset.adminErpUiReady = "true";

    var body = doc.body;
    var main = doc.getElementById("main-content");
    var sidebar = doc.getElementById("admin-sidebar");
    var sidebarToggle = doc.getElementById("sidebar-toggle");
    var sidebarOverlay = doc.getElementById("sidebar-overlay");
    var profileButton = doc.getElementById("profile-menu-button");
    var profileMenu = doc.getElementById("profile-menu");
    var search = doc.getElementById("global-search");
    var searchStatus = doc.getElementById("global-search-status");
    var liveRegion = doc.getElementById("ui-live-region");
    var workspaces = Array.prototype.slice.call(doc.querySelectorAll("[data-ui-view]"));
    var routeButtons = Array.prototype.slice.call(doc.querySelectorAll("[data-ui-route]"));
    var navigationButtons = sidebar ? Array.prototype.slice.call(sidebar.querySelectorAll("[data-ui-route]")) : [];
    var navGroups = sidebar ? Array.prototype.slice.call(sidebar.querySelectorAll(".nav-group")) : [];
    var dataTabs = Array.prototype.slice.call(doc.querySelectorAll("[data-data-tab]"));
    var dataPanels = Array.prototype.slice.call(doc.querySelectorAll("[data-data-panel]"));
    var drawer = doc.getElementById("context-drawer");
    var drawerBackdrop = doc.getElementById("drawer-backdrop");
    var drawerClose = doc.getElementById("drawer-close");
    var drawerTitle = doc.getElementById("drawer-title");
    var drawerDescription = doc.getElementById("drawer-description");
    var drawerReturnFocus = null;

    function announce(message) {
      if (!liveRegion) return;
      liveRegion.textContent = "";
      win.setTimeout(function setAnnouncement() { liveRegion.textContent = message; }, 20);
    }

    function closeSidebar(returnFocus) {
      body.classList.remove("sidebar-open");
      if (sidebarToggle) sidebarToggle.setAttribute("aria-expanded", "false");
      if (returnFocus && sidebarToggle) sidebarToggle.focus();
    }

    function openSidebar() {
      body.classList.add("sidebar-open");
      if (sidebarToggle) sidebarToggle.setAttribute("aria-expanded", "true");
      var first = sidebar && sidebar.querySelector("[data-ui-route]:not([hidden])");
      if (first) first.focus();
    }

    function closeProfile(returnFocus) {
      if (!profileMenu || !profileButton) return;
      profileMenu.hidden = true;
      profileButton.setAttribute("aria-expanded", "false");
      if (returnFocus) profileButton.focus();
    }

    function toggleProfile() {
      if (!profileMenu || !profileButton) return;
      var willOpen = profileMenu.hidden;
      profileMenu.hidden = !willOpen;
      profileButton.setAttribute("aria-expanded", String(willOpen));
      if (willOpen) {
        var first = profileMenu.querySelector('[role="menuitem"]');
        if (first) first.focus();
      }
    }

    function openDrawer(title, description, trigger) {
      if (!drawer || !drawerBackdrop) return;
      drawerReturnFocus = trigger || doc.activeElement;
      if (drawerTitle) drawerTitle.textContent = title || "รายละเอียดขอบเขต";
      if (drawerDescription) drawerDescription.textContent = description || "พื้นที่นี้ยังไม่เชื่อมกับ Backend contract";
      drawer.hidden = false;
      drawerBackdrop.hidden = false;
      body.classList.add("drawer-open");
      if (drawerClose) drawerClose.focus();
      announce("เปิดรายละเอียด " + (title || "ขอบเขตระบบ"));
    }

    function closeDrawer(returnFocus) {
      if (!drawer || !drawerBackdrop) return;
      drawer.hidden = true;
      drawerBackdrop.hidden = true;
      body.classList.remove("drawer-open");
      if (returnFocus && drawerReturnFocus && typeof drawerReturnFocus.focus === "function") drawerReturnFocus.focus();
      drawerReturnFocus = null;
    }

    function activeFor(button, state) {
      var route = button.getAttribute("data-ui-route");
      var target = button.getAttribute("data-ui-target") || null;
      if (route !== state.route) return false;
      if (route !== "data-center") return true;
      if (state.target) return target === state.target;
      return !target;
    }

    function targetFor(state) {
      if (state.target) return state.target;
      if (state.route === "data-center") return "data-center";
      return state.route + "-workspace";
    }

    function moveToState(state, shouldMove) {
      if (!shouldMove) return;
      var move = typeof win.requestAnimationFrame === "function" ? win.requestAnimationFrame.bind(win) : function (callback) { win.setTimeout(callback, 0); };
      move(function moveToTarget() {
        var target = doc.getElementById(targetFor(state));
        if (!target) {
          if (main) main.focus({ preventScroll: true });
          return;
        }
        var reduced = win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      });
    }

    function updateDataPanels(state) {
      var requested = state.route === "data-center" ? state.target : null;
      var active = dataPanels.some(function hasPanel(panel) { return panel.getAttribute("data-data-panel") === requested; }) ? requested : "import";
      dataPanels.forEach(function updatePanel(panel) {
        panel.hidden = panel.getAttribute("data-data-panel") !== active;
      });
      dataTabs.forEach(function updateTab(tab) {
        var selected = tab.getAttribute("data-data-tab") === active;
        tab.dataset.tabActive = String(selected);
        tab.setAttribute("aria-selected", String(selected));
        tab.setAttribute("tabindex", selected ? "0" : "-1");
      });
    }
    function render(state, shouldMove) {
      var config = ROUTES[state.route] || ROUTES.dashboard;
      workspaces.forEach(function updateWorkspace(workspace) {
        workspace.hidden = workspace.getAttribute("data-ui-view") !== config.view;
      });      updateDataPanels(state);

      navigationButtons.forEach(function updateNavigation(button) {
        var active = activeFor(button, state);
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      doc.title = config.title + " | SL-Transit Admin ERP1";
      closeSidebar(false);
      closeProfile(false);
      moveToState(state, shouldMove);
      announce("เปิด " + config.title);
    }

    function navigate(route, target) {
      var next = routeHash(route, target);
      if (win.location.hash === next) render(parseHash(next), true);
      else win.location.hash = next;
    }

    routeButtons.forEach(function bindRoute(button) {
      button.addEventListener("click", function onRouteClick(event) {
        event.preventDefault();
        navigate(button.getAttribute("data-ui-route"), button.getAttribute("data-ui-target"));
      });
    });

    Array.prototype.slice.call(doc.querySelectorAll("[data-ui-locked]")).forEach(function bindLocked(button) {
      button.addEventListener("click", function onLockedClick() {
        openDrawer(button.getAttribute("data-lock-title"), button.getAttribute("data-lock-copy"), button);
      });
    });

    Array.prototype.slice.call(doc.querySelectorAll('[data-ui-action="logout"]')).forEach(function bindLogout(button) {
      button.addEventListener("click", function onLogoutLocked() {
        closeProfile(false);
        openDrawer("ออกจากระบบยังล็อก", "รอ Auth contract จากระบบหลังบ้าน หน้า UI จะไม่จำลองว่า session สิ้นสุดแล้ว", profileButton || button);
      });
    });

    if (sidebarToggle) sidebarToggle.addEventListener("click", function onSidebarToggle() { if (body.classList.contains("sidebar-open")) closeSidebar(true); else openSidebar(); });
    if (sidebarOverlay) sidebarOverlay.addEventListener("click", function onSidebarOverlay() { closeSidebar(true); });
    if (profileButton) profileButton.addEventListener("click", toggleProfile);
    if (drawerClose) drawerClose.addEventListener("click", function onDrawerClose() { closeDrawer(true); });
    if (drawerBackdrop) drawerBackdrop.addEventListener("click", function onDrawerBackdrop() { closeDrawer(true); });

    doc.addEventListener("click", function onDocumentClick(event) {
      if (profileMenu && profileButton && !profileMenu.hidden && !profileMenu.contains(event.target) && !profileButton.contains(event.target)) closeProfile(false);
    });

    doc.addEventListener("keydown", function onKeydown(event) {
      if (event.key !== "Escape") return;
      if (drawer && !drawer.hidden) closeDrawer(true);
      else if (body.classList.contains("sidebar-open")) closeSidebar(true);
      else if (profileMenu && !profileMenu.hidden) closeProfile(true);
      else if (search && search.value) {
        search.value = "";
        filterNavigation("");
        search.focus();
      }
    });

    function filterNavigation(rawQuery) {
      var query = String(rawQuery || "").trim().toLocaleLowerCase("th-TH");
      var visible = 0;
      navigationButtons.forEach(function filterButton(button) {
        var matches = !query || button.textContent.toLocaleLowerCase("th-TH").indexOf(query) >= 0;
        button.hidden = !matches;
        if (matches) visible += 1;
      });
      navGroups.forEach(function filterGroup(group) {
        group.hidden = !group.querySelector("[data-ui-route]:not([hidden])");
      });
      if (searchStatus) searchStatus.textContent = query ? "พบ " + visible + " เมนู" : "แสดงเมนูทั้งหมด";
      return visible;
    }

    if (search) {
      search.addEventListener("input", function onSearchInput() { filterNavigation(search.value); });
      search.addEventListener("keydown", function onSearchKey(event) {
        if (event.key !== "Enter") return;
        var first = sidebar && sidebar.querySelector("[data-ui-route]:not([hidden])");
        if (first) {
          event.preventDefault();
          first.click();
        }
      });
    }

    var mirrorPairs = [
      ["backend-status", "dashboard-backend"],
      ["workflow-phase", "dashboard-phase"],
      ["validation-result", "dashboard-validation"]
    ];

    function conciseStatus(value) {
      var normalized = String(value || "").replace(/\s+/g, " ").trim();
      if (!normalized) return "—";
      return normalized.length > 84 ? normalized.slice(0, 81) + "…" : normalized;
    }

    function mirrorContractStatus() {
      mirrorPairs.forEach(function mirror(pair) {
        var source = doc.getElementById(pair[0]);
        var destination = doc.getElementById(pair[1]);
        if (source && destination) destination.textContent = conciseStatus(source.textContent);
      });
    }

    mirrorContractStatus();
    if (typeof root.MutationObserver === "function") {
      mirrorPairs.forEach(function observePair(pair) {
        var source = doc.getElementById(pair[0]);
        if (source) new root.MutationObserver(mirrorContractStatus).observe(source, { childList: true, characterData: true, subtree: true });
      });
    }

    win.addEventListener("hashchange", function onHashChange() { render(parseHash(win.location.hash), true); });
    render(parseHash(win.location.hash), false);
  }

  return Object.freeze({ ROUTES: ROUTES, TARGETS: TARGETS, parseHash: parseHash, routeHash: routeHash, init: init });
});