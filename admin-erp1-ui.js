(function adminErp1UiModule(root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.SLTransitAdminErpUi = api;
  if (root.document) {
    if (root.document.readyState === "loading") {
      root.document.addEventListener("DOMContentLoaded", api.init, { once: true });
    } else {
      api.init();
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createAdminErp1Ui() {
  "use strict";

  var ROUTES = Object.freeze({
    dashboard: Object.freeze({ title: "แดชบอร์ด", view: "dashboard" }),
    "data-center": Object.freeze({ title: "ศูนย์ข้อมูล ERP", view: "data-center" }),
    today: Object.freeze({
      title: "งานที่ต้องจัดการวันนี้",
      description: "รายการงานจะมาจากสถานะ Draft, Validation และ Review จริง เมื่อ contract งานวันนี้ได้รับอนุมัติ โดยรอบนี้จะไม่สร้างรายการหรือตัวเลขจำลอง"
    }),
    operations: Object.freeze({
      title: "คิวรถและตารางเวลา",
      description: "พื้นที่งาน Operations ยังอยู่ในแผนย้าย UI ฟังก์ชันเดิมจะถูกเชื่อมหลังผ่าน contract และสิทธิ์ของโมดูล โดยไม่เปลี่ยนข้อมูลกลางในรอบนี้"
    }),
    bookings: Object.freeze({
      title: "เปิดรับจองและความจุ",
      description: "Booking เป็น consumer ของ Published Read Model และจะไม่คำนวณเวลา ราคา หรือการต่อรถเอง โมดูลนี้ยังไม่เปิดทำรายการใน Gate B รอบแรก"
    }),
    finance: Object.freeze({
      title: "การเงินและการชำระ",
      description: "ข้อมูลการเงินและการชำระแยกจาก Master Data พื้นที่นี้รอ contract และสิทธิ์เฉพาะก่อนเชื่อมใช้งาน"
    }),
    content: Object.freeze({
      title: "ข่าวสารและประกาศ",
      description: "ข่าวสารและประกาศจะเชื่อมผ่านแหล่งข้อมูลที่ได้รับอนุมัติ ขณะนี้เป็นพื้นที่นำทางเท่านั้นและไม่มีข้อมูลจำลอง"
    }),
    publications: Object.freeze({
      title: "เวอร์ชันเผยแพร่",
      description: "พื้นที่นี้จะแสดง Published Version แบบอ่านอย่างเดียว แยกจากศูนย์ทดสอบอย่างชัดเจน และยังไม่มีปุ่ม Publish หรือการเขียน Firebase ในรอบนี้"
    }),
    users: Object.freeze({
      title: "ผู้ใช้และสิทธิ์",
      description: "สิทธิ์แบบละเอียดต้องอ่านจาก access account contract ฝั่งหลังบ้าน ส่วน profile ด้านบนใช้สำหรับบัญชีและออกจากระบบเท่านั้น"
    }),
    "test-center": Object.freeze({
      title: "ศูนย์ทดสอบ",
      description: "ศูนย์ทดสอบแยกจากเวอร์ชันเผยแพร่ ใช้ตรวจ Draft และผล Validation ในสภาพแวดล้อมที่ได้รับอนุมัติ โดยไม่สลับ Published pointer"
    }),
    "system-status": Object.freeze({
      title: "สถานะระบบและ Audit",
      description: "สถานะระบบและ Audit จะเป็นข้อมูลอ่านอย่างเดียวตามสิทธิ์ เมื่อ backend contract พร้อม รอบนี้ยังไม่เรียกข้อมูลเพิ่ม"
    }),
    account: Object.freeze({
      title: "บัญชีของฉัน",
      description: "ข้อมูลบัญชีและคำสั่งออกจากระบบจะเชื่อมกับ Auth contract เดิมเมื่อได้รับอนุมัติ UI รอบนี้ไม่แก้ session หรือสิทธิ์ผู้ใช้"
    })
  });

  var TARGETS = Object.freeze({
    dashboard: Object.freeze(["overview", "dashboard-summary"]),
    "data-center": Object.freeze(["data-center", "import", "draft", "validation", "review", "approval"])
  });

  function safeDecode(value) {
    try {
      return decodeURIComponent(value || "");
    } catch (error) {
      return value || "";
    }
  }

  function parseHash(value) {
    var cleaned = safeDecode(String(value || ""))
      .replace(/^#/, "")
      .replace(/^\/+/, "")
      .trim();
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
    var doc = globalThis.document;
    var win = globalThis.window || globalThis;
    if (!doc || !win || doc.documentElement.dataset.adminErpUiReady === "true") {
      return;
    }
    doc.documentElement.dataset.adminErpUiReady = "true";

    var body = doc.body;
    var sidebar = doc.getElementById("admin-sidebar");
    var sidebarToggle = doc.getElementById("sidebar-toggle");
    var sidebarOverlay = doc.getElementById("sidebar-overlay");
    var profileButton = doc.getElementById("profile-menu-button");
    var profileMenu = doc.getElementById("profile-menu");
    var liveRegion = doc.getElementById("ui-live-region");
    var search = doc.getElementById("global-search");
    var searchStatus = doc.getElementById("global-search-status");
    var navButtons = Array.prototype.slice.call(doc.querySelectorAll("[data-ui-route]"));
    var navGroups = Array.prototype.slice.call(doc.querySelectorAll(".nav-group"));
    var workViews = Array.prototype.slice.call(doc.querySelectorAll("[data-ui-view]"));
    var unavailable = doc.getElementById("ui-unavailable");
    var unavailableTitle = doc.getElementById("ui-unavailable-title");
    var unavailableDescription = doc.getElementById("ui-unavailable-description");
    var main = doc.getElementById("main-content");

    function announce(message) {
      if (!liveRegion) return;
      liveRegion.textContent = "";
      win.setTimeout(function setAnnouncement() {
        liveRegion.textContent = message;
      }, 20);
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

    function isRouteButtonActive(button, state) {
      var route = button.getAttribute("data-ui-route");
      var target = button.getAttribute("data-ui-target") || null;
      if (route !== state.route) return false;
      if (state.route !== "data-center") return !target;
      if (state.target && target === state.target) return true;
      return !target && (!state.target || ["data-center", "draft", "review", "approval"].indexOf(state.target) >= 0);
    }

    function showTarget(state, shouldMove) {
      if (!shouldMove) return;
      var targetId = state.target;
      if (!targetId) {
        targetId = state.route === "data-center" ? "data-center" : state.route === "dashboard" ? "overview" : "ui-unavailable";
      }
      win.requestAnimationFrame(function moveToTarget() {
        var target = doc.getElementById(targetId);
        if (!target) {
          if (main) main.focus({ preventScroll: true });
          return;
        }
        var reduceMotion = win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      });
    }

    function render(state, shouldMove) {
      var config = ROUTES[state.route] || ROUTES.dashboard;
      var view = config.view || "unavailable";
      workViews.forEach(function updateView(node) {
        node.hidden = node.getAttribute("data-ui-view") !== view;
      });
      if (view === "unavailable" && unavailable) {
        unavailable.hidden = false;
        if (unavailableTitle) unavailableTitle.textContent = config.title;
        if (unavailableDescription) unavailableDescription.textContent = config.description;
      }
      navButtons.forEach(function updateActive(button) {
        var active = isRouteButtonActive(button, state);
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      doc.title = config.title + " | SL-Transit Admin ERP1";
      closeSidebar(false);
      closeProfile(false);
      showTarget(state, shouldMove);
      announce("เปิด " + config.title);
    }

    function navigate(route, target) {
      var next = routeHash(route, target);
      if (win.location.hash === next) {
        render(parseHash(next), true);
      } else {
        win.location.hash = next;
      }
    }

    navButtons.forEach(function bindRoute(button) {
      button.addEventListener("click", function onRouteClick(event) {
        event.preventDefault();
        navigate(button.getAttribute("data-ui-route"), button.getAttribute("data-ui-target"));
      });
    });

    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", function onSidebarToggle() {
        if (body.classList.contains("sidebar-open")) closeSidebar(true);
        else openSidebar();
      });
    }
    if (sidebarOverlay) sidebarOverlay.addEventListener("click", function onOverlay() { closeSidebar(true); });
    if (profileButton) profileButton.addEventListener("click", toggleProfile);

    doc.addEventListener("click", function onDocumentClick(event) {
      if (profileMenu && profileButton && !profileMenu.hidden && !profileMenu.contains(event.target) && !profileButton.contains(event.target)) {
        closeProfile(false);
      }
    });

    doc.addEventListener("keydown", function onKeydown(event) {
      if (event.key !== "Escape") return;
      if (body.classList.contains("sidebar-open")) closeSidebar(true);
      else if (profileMenu && !profileMenu.hidden) closeProfile(true);
      else if (search && search.value) {
        search.value = "";
        filterNavigation("");
        search.focus();
      }
    });

    Array.prototype.slice.call(doc.querySelectorAll('[data-ui-action="logout"]')).forEach(function bindLogout(button) {
      button.addEventListener("click", function onLogoutUnavailable() {
        closeProfile(true);
        announce("คำสั่งออกจากระบบยังไม่เปิดใช้ใน Gate B รอบแรก");
      });
    });

    function filterNavigation(rawQuery) {
      var query = String(rawQuery || "").trim().toLocaleLowerCase("th-TH");
      var visible = 0;
      var sidebarRouteButtons = sidebar ? Array.prototype.slice.call(sidebar.querySelectorAll("[data-ui-route]")) : [];
      sidebarRouteButtons.forEach(function filterButton(button) {
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
      search.addEventListener("input", function onSearch() { filterNavigation(search.value); });
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
    function mirrorContractStatus() {
      mirrorPairs.forEach(function mirror(pair) {
        var source = doc.getElementById(pair[0]);
        var destination = doc.getElementById(pair[1]);
        if (source && destination) destination.textContent = source.textContent.trim() || "—";
      });
    }
    mirrorContractStatus();
    if (typeof MutationObserver === "function") {
      mirrorPairs.forEach(function observePair(pair) {
        var source = doc.getElementById(pair[0]);
        if (!source) return;
        new MutationObserver(mirrorContractStatus).observe(source, { childList: true, characterData: true, subtree: true });
      });
    }

    win.addEventListener("hashchange", function onHashChange() {
      render(parseHash(win.location.hash), true);
    });
    render(parseHash(win.location.hash), false);
  }

  return Object.freeze({
    ROUTES: ROUTES,
    TARGETS: TARGETS,
    parseHash: parseHash,
    routeHash: routeHash,
    init: init
  });
});