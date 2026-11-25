/* ==========================================================================
   CogniTara Web v3 — runtime helpers (zero dependencies)
   --------------------------------------------------------------------------
   Exposes window.CT with:
     CT.icon(name, cls)            -> SVG string referencing the shared sprite
     CT.theme.toggle()/set()/get() -> dark/light theme (localStorage "ct-theme")
     CT.toast(msg, type, opts)     -> stacked toast (type: ok|bad|warn|info, aliases success|error)
     CT.modal.open(el)/close(el)   -> accessible modal (.ct-modal-backdrop)
     CT.tableFilter(input, table, opts) -> live client-side row filter
     CT.countUp(el)                -> animated number (data-ct-count)
     CT.palette(opts)              -> Ctrl+K command palette
     CT.reveal(root)               -> (re)bind scroll reveal for injected content
   Declarative hooks (auto-bound on DOMContentLoaded):
     [data-ct-theme-toggle], [data-ct-sidebar-toggle], [data-ct-drawer-close],
     [data-ct-reveal], [data-ct-stagger], [data-ct-count], [data-ct-dropdown],
     [data-ct-modal-open="#id"], [data-ct-modal-close], [data-ct-filter="#table"],
     [data-ct-tabs], [data-ct-seg], .ct-drop, section nav links (a[href^="#sec-"]).
   Motion honours prefers-reduced-motion and only animates transform/opacity.
   ========================================================================== */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var SPRITE = "/static/icons/cognitara-icons.svg";
  var mqReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var mqMobile = window.matchMedia ? window.matchMedia("(max-width: 960px)") : { matches: false };

  function reduced() { return !!mqReduce.matches; }
  function $(sel, ctx) { return typeof sel === "string" ? (ctx || doc).querySelector(sel) : sel; }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function icon(name, cls) {
    return '<svg class="ct-ico' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="' + SPRITE + "#" + name + '"/></svg>';
  }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { return null; }
    return val;
  }

  // Motion flag (head snippet normally sets this early; keep in sync here)
  if (!reduced()) root.classList.add("ct-motion"); else root.classList.remove("ct-motion");
  root.classList.add("ct-js");

  /* ---------------- Theme ---------------- */
  var theme = {
    get: function () { return root.getAttribute("data-theme") === "light" ? "light" : "dark"; },
    set: function (next, animate) {
      var apply = function () {
        root.setAttribute("data-theme", next);
        store("ct-theme", next);
        $$("[data-ct-theme-toggle]").forEach(function (b) {
          b.setAttribute("aria-label", next === "dark" ? "Switch to light theme" : "Switch to dark theme");
        });
        doc.dispatchEvent(new CustomEvent("ct:theme", { detail: { theme: next } }));
      };
      if (animate !== false && doc.startViewTransition && !reduced()) doc.startViewTransition(apply);
      else apply();
    },
    toggle: function () { theme.set(theme.get() === "dark" ? "light" : "dark"); }
  };
  window.addEventListener("storage", function (e) {
    if (e.key === "ct-theme" && (e.newValue === "light" || e.newValue === "dark")) theme.set(e.newValue, false);
  });

  /* ---------------- Ripple ---------------- */
  function bindRipple() {
    doc.addEventListener("pointerdown", function (e) {
      if (reduced() || e.button !== 0) return;
      var host = e.target.closest(".ct-btn, [data-ct-ripple]");
      if (!host || host.disabled || host.classList.contains("is-loading")) return;
      var r = host.getBoundingClientRect();
      var size = Math.max(r.width, r.height) * 2.2;
      var span = doc.createElement("span");
      span.className = "ct-ripple";
      span.style.width = span.style.height = size + "px";
      span.style.left = (e.clientX - r.left - size / 2) + "px";
      span.style.top = (e.clientY - r.top - size / 2) + "px";
      host.appendChild(span);
      span.addEventListener("animationend", function () { span.remove(); });
      setTimeout(function () { if (span.parentNode) span.remove(); }, 900);
    }, { passive: true });
  }

  /* ---------------- Count-up ---------------- */
  function countUp(el) {
    if (!el || el.__ctCounted) return;
    el.__ctCounted = true;
    var raw = el.getAttribute("data-ct-count");
    var text = (raw && raw !== "" ? raw : el.textContent).trim();
    var m = text.match(/^(-?[\d,]*\.?\d+)(.*)$/);
    if (!m) return;
    var finalText = el.textContent;
    var target = parseFloat(m[1].replace(/,/g, ""));
    if (!isFinite(target) || target === 0 || reduced()) return;
    var decimals = (m[1].split(".")[1] || "").length;
    var suffixNode = el.querySelector("small");
    var suffix = suffixNode ? "" : m[2];
    var numNode = el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild : null;
    var dur = Math.min(1400, 700 + Math.log10(Math.abs(target) + 1) * 260);
    var start = null;
    function fmt(v) { return decimals ? v.toFixed(decimals) : String(Math.round(v)); }
    function frame(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / dur);
      var eased = 1 - Math.pow(2, -10 * p);
      var val = fmt(target * (p >= 1 ? 1 : eased));
      if (numNode) numNode.nodeValue = val + (suffixNode ? "" : suffix);
      else el.textContent = val + suffix;
      if (p < 1) requestAnimationFrame(frame);
      else if (!numNode) el.textContent = finalText;
    }
    if (numNode) numNode.nodeValue = fmt(0) + (suffixNode ? "" : suffix); else el.textContent = fmt(0) + suffix;
    requestAnimationFrame(frame);
  }

  /* ---------------- Reveal + stagger ---------------- */
  var io = null;
  function settle(el) {
    setTimeout(function () { el.classList.add("is-settled"); }, 700 + (parseInt(el.style.getPropertyValue("--ct-i"), 10) || 0) * 45);
  }
  function show(el) {
    el.classList.add("is-in");
    settle(el);
    if (el.hasAttribute("data-ct-count")) countUp(el);
    $$("[data-ct-count]", el).forEach(countUp);
  }
  function reveal(ctx) {
    ctx = ctx || doc;
    var targets = [];
    $$("[data-ct-stagger]", ctx).forEach(function (group) {
      var kids = Array.prototype.slice.call(group.children);
      kids.forEach(function (k, i) {
        k.style.setProperty("--ct-i", String(Math.min(i, 12)));
        targets.push(k);
      });
    });
    $$("[data-ct-reveal]", ctx).forEach(function (el) { targets.push(el); });
    // Count-ups that are not inside a reveal target still animate when visible
    $$("[data-ct-count]", ctx).forEach(function (el) {
      if (!el.closest("[data-ct-reveal], [data-ct-stagger]")) targets.push(el);
    });

    if (reduced() || !("IntersectionObserver" in window)) {
      targets.forEach(function (el) { el.classList.add("is-in", "is-settled"); });
      return;
    }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { show(en.target); io.unobserve(en.target); }
        });
      }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    }
    targets.forEach(function (el) { if (!el.classList.contains("is-in")) io.observe(el); });
    // Failsafe: never leave content hidden (e.g. very tall elements, print, odd viewports)
    setTimeout(function () {
      targets.forEach(function (el) { if (!el.classList.contains("is-in")) { el.classList.add("is-in", "is-settled"); } });
    }, 3200);
  }

  /* ---------------- Toasts ---------------- */
  var TYPE_MAP = { success: "ok", ok: "ok", error: "bad", danger: "bad", bad: "bad", warning: "warn", warn: "warn", info: "info" };
  var TYPE_ICON = { ok: "i-check-circle", bad: "i-alert", warn: "i-alert", info: "i-info" };
  function toast(message, type, opts) {
    opts = opts || {};
    var t = TYPE_MAP[type] || "ok";
    var host = $("#ctToasts") || $(".ct-toasts");
    if (!host) {
      host = doc.createElement("div");
      host.className = "ct-toasts";
      host.id = "ctToasts";
      host.setAttribute("role", "status");
      host.setAttribute("aria-live", "polite");
      doc.body.appendChild(host);
    }
    var timeout = opts.timeout == null ? 3800 : opts.timeout;
    var el = doc.createElement("div");
    el.className = "ct-toast ct-toast--" + t;
    el.innerHTML = icon(TYPE_ICON[t]) +
      '<span class="ct-toast__msg">' + (opts.html ? message : esc(message)) + "</span>" +
      '<button type="button" class="ct-toast__close" aria-label="Dismiss">' + icon("i-x", "ct-ico--sm") + "</button>" +
      (timeout ? '<i class="ct-toast__timer" style="animation-duration:' + timeout + 'ms"></i>' : "");
    host.appendChild(el);
    var gone = false;
    function dismiss() {
      if (gone) return; gone = true;
      el.classList.add("is-leaving");
      setTimeout(function () { el.remove(); }, reduced() ? 0 : 320);
    }
    el.querySelector(".ct-toast__close").addEventListener("click", dismiss);
    var timer = timeout ? setTimeout(dismiss, timeout) : null;
    el.addEventListener("mouseenter", function () { if (timer) clearTimeout(timer); var tm = el.querySelector(".ct-toast__timer"); if (tm) tm.style.animationPlayState = "paused"; });
    el.addEventListener("mouseleave", function () { if (timeout) timer = setTimeout(dismiss, 1400); });
    while (host.children.length > 4) host.firstElementChild.remove();
    return { dismiss: dismiss, el: el };
  }

  /* ---------------- Modal ---------------- */
  var lastFocus = null;
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  var modal = {
    open: function (target) {
      var el = $(target);
      if (!el) return;
      lastFocus = doc.activeElement;
      el.classList.add("is-open");
      el.setAttribute("aria-hidden", "false");
      var f = el.querySelector("[data-ct-autofocus]") || el.querySelector(".ct-modal__actions .ct-btn--primary, .ct-modal__actions .ct-btn--danger, .ct-modal__actions .ct-btn--danger-solid") || el.querySelector(FOCUSABLE);
      if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }, 40);
    },
    close: function (target) {
      var els = target ? [$(target)] : $$(".ct-modal-backdrop.is-open");
      els.forEach(function (el) {
        if (!el) return;
        el.classList.remove("is-open");
        el.setAttribute("aria-hidden", "true");
      });
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
      lastFocus = null;
    }
  };
  function bindModals() {
    doc.addEventListener("click", function (e) {
      var opener = e.target.closest("[data-ct-modal-open]");
      if (opener) { e.preventDefault(); modal.open(opener.getAttribute("data-ct-modal-open")); return; }
      var closer = e.target.closest("[data-ct-modal-close]");
      if (closer) { e.preventDefault(); modal.close(closer.closest(".ct-modal-backdrop")); return; }
      if (e.target.classList && e.target.classList.contains("ct-modal-backdrop") && e.target.hasAttribute("data-ct-dismissable")) modal.close(e.target);
    });
    doc.addEventListener("keydown", function (e) {
      var open = $(".ct-modal-backdrop.is-open");
      if (!open) return;
      if (e.key === "Escape" && open.hasAttribute("data-ct-dismissable")) modal.close(open);
      if (e.key === "Tab") {
        var f = $$(FOCUSABLE, open).filter(function (n) { return n.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---------------- Dropdowns ---------------- */
  function bindDropdowns() {
    doc.addEventListener("click", function (e) {
      var trig = e.target.closest("[data-ct-dropdown-trigger]");
      var openOnes = $$("[data-ct-dropdown].is-open");
      if (trig) {
        var dd = trig.closest("[data-ct-dropdown]");
        var willOpen = !dd.classList.contains("is-open");
        openOnes.forEach(function (o) { o.classList.remove("is-open"); });
        dd.classList.toggle("is-open", willOpen);
        trig.setAttribute("aria-expanded", willOpen ? "true" : "false");
        e.stopPropagation();
        return;
      }
      openOnes.forEach(function (o) {
        if (!o.contains(e.target) || e.target.closest(".ct-menu__item")) {
          o.classList.remove("is-open");
          var t = o.querySelector("[data-ct-dropdown-trigger]");
          if (t) t.setAttribute("aria-expanded", "false");
        }
      });
    });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape") $$("[data-ct-dropdown].is-open").forEach(function (o) { o.classList.remove("is-open"); });
    });
  }

  /* ---------------- Sidebar (collapse + mobile drawer) ---------------- */
  var sidebar = {
    isMobile: function () { return !!mqMobile.matches; },
    openDrawer: function () { root.classList.add("ct-drawer-open"); },
    closeDrawer: function () { root.classList.remove("ct-drawer-open"); },
    toggle: function () {
      if (sidebar.isMobile()) { root.classList.toggle("ct-drawer-open"); return; }
      var collapsed = root.getAttribute("data-ct-sidebar") === "collapsed";
      if (collapsed) root.removeAttribute("data-ct-sidebar"); else root.setAttribute("data-ct-sidebar", "collapsed");
      store("ct-sidebar", collapsed ? "expanded" : "collapsed");
    }
  };
  function bindSidebar() {
    doc.addEventListener("click", function (e) {
      if (e.target.closest("[data-ct-sidebar-toggle]")) { e.preventDefault(); sidebar.toggle(); return; }
      if (e.target.closest("[data-ct-drawer-close]")) { sidebar.closeDrawer(); return; }
      if (sidebar.isMobile() && e.target.closest(".ct-sidebar a[href]")) sidebar.closeDrawer();
    });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape") sidebar.closeDrawer();
    });
    if (mqMobile.addEventListener) mqMobile.addEventListener("change", function () { sidebar.closeDrawer(); });
    // Collapsed icons get hover tooltips from their labels
    $$(".ct-sidebar .ct-nav__link").forEach(function (a) {
      var label = a.querySelector(".ct-nav__text");
      if (label && !a.hasAttribute("data-ct-tip")) {
        a.setAttribute("title", label.textContent.trim());
      }
    });
  }

  /* ---------------- Topbar scroll state ---------------- */
  function bindTopbar() {
    var bar = $(".ct-topbar");
    if (!bar) return;
    var ticking = false;
    function update() { bar.classList.toggle("is-scrolled", window.scrollY > 4); ticking = false; }
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ---------------- Section nav + scrollspy ---------------- */
  function bindSectionNav() {
    var links = $$('.ct-nav a[href^="#"], [data-ct-section-nav] a[href^="#"]').filter(function (a) { return a.getAttribute("href").length > 1; });
    if (!links.length) return;
    var map = {};
    links.forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      var sec = doc.getElementById(id);
      if (!sec) return;
      (map[id] = map[id] || []).push(a);
    });
    var ids = Object.keys(map);
    if (!ids.length) return;
    var allSectionLinks = links.filter(function (a) { return map[a.getAttribute("href").slice(1)]; });
    var lockUntil = 0;
    function activate(id) {
      allSectionLinks.forEach(function (a) {
        var on = a.getAttribute("href") === "#" + id;
        a.classList.toggle("is-active", on);
        if (on) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
      });
    }
    function goTo(id, smooth) {
      var sec = doc.getElementById(id);
      if (!sec) return;
      lockUntil = Date.now() + 900;
      activate(id);
      sec.scrollIntoView({ behavior: smooth && !reduced() ? "smooth" : "auto", block: "start" });
    }
    allSectionLinks.forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href").slice(1);
        e.preventDefault();
        goTo(id, true);
        if (history.replaceState) history.replaceState(null, "", "#" + id);
      });
    });
    if ("IntersectionObserver" in window) {
      var visible = {};
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting ? en.boundingClientRect.top : null; });
        if (Date.now() < lockUntil) return;
        var best = null, bestTop = Infinity;
        ids.forEach(function (id) {
          var top = visible[id];
          if (top !== null && top !== undefined && Math.abs(top) < Math.abs(bestTop)) { best = id; bestTop = top; }
        });
        if (best) activate(best);
      }, { rootMargin: "-72px 0px -55% 0px", threshold: [0, 0.01] });
      ids.forEach(function (id) { spy.observe(doc.getElementById(id)); });
    }
    // Deep link support: /admin#sec-exams
    var hash = (location.hash || "").slice(1);
    if (hash && map[hash]) {
      activate(hash);
      var jump = function () { goTo(hash, false); };
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { requestAnimationFrame(jump); });
      else setTimeout(jump, 60);
    }
  }

  /* ---------------- Table filter ---------------- */
  function tableFilter(input, table, opts) {
    input = $(input); table = $(table); opts = opts || {};
    if (!input || !table) return;
    var rowSel = opts.rows || "tbody tr";
    var emptyEl = opts.empty ? $(opts.empty) : null;
    function run() {
      var q = (input.value || "").trim().toLowerCase();
      var shown = 0;
      $$(rowSel, table).forEach(function (row) {
        if (row.classList.contains("ct-table-empty-row")) return;
        var hay = (opts.attr && row.getAttribute(opts.attr)) || row.getAttribute("data-search") || row.textContent;
        var hit = !q || hay.toLowerCase().indexOf(q) > -1;
        row.style.display = hit ? "" : "none";
        if (hit) shown++;
      });
      if (emptyEl) emptyEl.hidden = shown !== 0;
      if (typeof opts.onFilter === "function") opts.onFilter(shown, q);
    }
    input.addEventListener("input", run);
    return run;
  }
  function bindFilters() {
    $$("[data-ct-filter]").forEach(function (inp) {
      tableFilter(inp, inp.getAttribute("data-ct-filter"), {
        rows: inp.getAttribute("data-ct-filter-rows") || undefined,
        empty: inp.getAttribute("data-ct-filter-empty") || undefined
      });
    });
  }

  /* ---------------- Tabs ---------------- */
  function bindTabs() {
    $$("[data-ct-tabs]").forEach(function (group) {
      var tabs = $$("[data-ct-tab]", group);
      function select(tab, focus) {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle("is-active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
          t.setAttribute("tabindex", on ? "0" : "-1");
          var p = doc.getElementById(t.getAttribute("data-ct-tab"));
          if (p) p.hidden = !on;
        });
        if (focus) tab.focus();
      }
      tabs.forEach(function (t, i) {
        t.setAttribute("role", "tab");
        t.addEventListener("click", function (e) { e.preventDefault(); select(t); });
        t.addEventListener("keydown", function (e) {
          if (e.key === "ArrowRight") select(tabs[(i + 1) % tabs.length], true);
          if (e.key === "ArrowLeft") select(tabs[(i - 1 + tabs.length) % tabs.length], true);
        });
      });
      select(tabs.filter(function (t) { return t.classList.contains("is-active"); })[0] || tabs[0]);
    });
  }

  /* ---------------- Segmented control ---------------- */
  function syncSeg(seg) {
    var btns = $$(":scope > button", seg);
    var idx = 0;
    btns.forEach(function (b, i) { if (b.classList.contains("is-active")) idx = i; });
    seg.style.setProperty("--ct-seg-n", String(btns.length || 1));
    seg.style.setProperty("--ct-seg-i", String(idx));
  }
  function bindSeg() {
    $$("[data-ct-seg]").forEach(function (seg) {
      syncSeg(seg);
      seg.addEventListener("click", function () { requestAnimationFrame(function () { syncSeg(seg); }); });
      if ("MutationObserver" in window) {
        new MutationObserver(function () { syncSeg(seg); }).observe(seg, { subtree: true, attributes: true, attributeFilter: ["class"] });
      }
    });
  }

  /* ---------------- File drop zones ---------------- */
  function bindDrops() {
    $$(".ct-drop").forEach(function (z) {
      var input = z.querySelector('input[type="file"]');
      var name = z.querySelector(".ct-drop__name");
      if (!input) return;
      ["dragenter", "dragover"].forEach(function (ev) { z.addEventListener(ev, function () { z.classList.add("is-drag"); }); });
      ["dragleave", "drop"].forEach(function (ev) { z.addEventListener(ev, function () { z.classList.remove("is-drag"); }); });
      input.addEventListener("change", function () {
        if (name) name.textContent = input.files && input.files.length ? Array.prototype.map.call(input.files, function (f) { return f.name; }).join(", ") : "";
      });
    });
  }

  /* ---------------- Command palette ---------------- */
  function palette(opts) {
    var pal = $(opts.root), input = $(opts.input), list = $(opts.list);
    if (!pal || !input || !list) return null;
    var items = [], sel = 0, commands = opts.commands || [];
    function paint() {
      list.innerHTML = items.length
        ? items.map(function (c, i) {
            return '<li role="option" data-i="' + i + '" aria-selected="' + (i === sel) + '" class="' + (i === sel ? "is-sel" : "") + '">' + icon(c.icon || "i-arrow-right") + esc(c.label) + "<em>" + esc(c.hint || "") + "</em></li>";
          }).join("")
        : '<li aria-disabled="true">No matching commands</li>';
      var cur = list.querySelector(".is-sel");
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
    }
    function filter() {
      var q = input.value.trim().toLowerCase();
      items = commands.filter(function (c) { return !q || c.label.toLowerCase().indexOf(q) > -1 || (c.hint || "").toLowerCase().indexOf(q) > -1; });
      sel = 0; paint();
    }
    function open() { pal.hidden = false; input.value = ""; filter(); setTimeout(function () { input.focus(); }, 10); }
    function close() { pal.hidden = true; }
    function run(i) {
      var c = items[i]; close();
      if (!c) return;
      if (c.run) c.run(); else if (c.go) location.href = c.go;
    }
    $$(opts.triggers || "[data-ct-palette-open]").forEach(function (t) { t.addEventListener("click", open); });
    input.addEventListener("input", filter);
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { sel = Math.min(items.length - 1, sel + 1); paint(); e.preventDefault(); }
      if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); }
      if (e.key === "Enter") { e.preventDefault(); run(sel); }
    });
    list.addEventListener("click", function (e) { var li = e.target.closest("[data-i]"); if (li) run(+li.getAttribute("data-i")); });
    pal.addEventListener("mousedown", function (e) { if (e.target === pal) close(); });
    doc.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === "k") { e.preventDefault(); if (pal.hidden) open(); else close(); }
      if (e.key === "Escape" && !pal.hidden) close();
    });
    return { open: open, close: close };
  }

  /* ---------------- Bootstrap Modal Stacking Fix ---------------- */
  function fixBootstrapModals() {
    var moveModal = function (m) {
      if (m && m.parentNode && m.parentNode !== doc.body) {
        doc.body.appendChild(m);
      }
    };
    $$(".ct-main .modal, .ct-content .modal").forEach(moveModal);
    doc.addEventListener("show.bs.modal", function (e) {
      if (e && e.target) moveModal(e.target);
    });
  }

  /* ---------------- Boot ---------------- */
  function boot() {
    $$("[data-ct-theme-toggle]").forEach(function (b) {
      b.addEventListener("click", function (e) { e.preventDefault(); theme.toggle(); });
      b.setAttribute("aria-label", theme.get() === "dark" ? "Switch to light theme" : "Switch to dark theme");
    });
    fixBootstrapModals();
    bindRipple();
    bindModals();
    bindDropdowns();
    bindSidebar();
    bindTopbar();
    bindSectionNav();
    bindFilters();
    bindTabs();
    bindSeg();
    bindDrops();
    reveal(doc);
  }

  window.CT = {
    version: "3.0.0",
    sprite: SPRITE,
    icon: icon,
    esc: esc,
    theme: theme,
    toast: toast,
    modal: modal,
    sidebar: sidebar,
    tableFilter: tableFilter,
    countUp: countUp,
    reveal: reveal,
    palette: palette,
    seg: { sync: syncSeg },
    reducedMotion: reduced
  };

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
