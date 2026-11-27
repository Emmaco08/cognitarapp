/* ==========================================================================
   CogniTara Web v3 - runtime helpers (zero dependencies)
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
  function replayModalVector(el) {
    var med = el && el.querySelector(".ct-m-medallion, .ct-confirm-badge");
    if (!med) return;
    var clone = med.cloneNode(true);
    med.parentNode.replaceChild(clone, med);
  }
  function nudgeModal(el) {
    var sheet = el && (el.classList.contains("ct-modal") ? el : el.querySelector(".ct-modal"));
    if (!sheet) return;
    sheet.classList.remove("is-nudged");
    void sheet.offsetWidth;
    sheet.classList.add("is-nudged");
    setTimeout(function () { sheet.classList.remove("is-nudged"); }, 340);
  }
  var modal = {
    open: function (target) {
      var el = $(target);
      if (!el) return;
      lastFocus = doc.activeElement;
      replayModalVector(el);
      el.classList.remove("is-open");
      void el.offsetWidth;
      el.classList.add("is-open");
      el.setAttribute("aria-hidden", "false");
      var f = el.querySelector("[data-ct-autofocus]") || el.querySelector("input:not([type='hidden']):not([disabled]), textarea:not([disabled])") || el.querySelector(".ct-modal__actions .ct-btn--primary, .ct-confirm-actions .ct-btn--primary, .ct-m-foot .ct-btn--primary") || el.querySelector(FOCUSABLE);
      if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }, 60);
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
    },
    nudge: nudgeModal
  };
  function bindModals() {
    doc.addEventListener("click", function (e) {
      var opener = e.target.closest("[data-ct-modal-open]");
      if (opener) { e.preventDefault(); modal.open(opener.getAttribute("data-ct-modal-open")); return; }
      var closer = e.target.closest("[data-ct-modal-close]");
      if (closer) { e.preventDefault(); modal.close(closer.closest(".ct-modal-backdrop")); return; }
      if (e.target.classList && e.target.classList.contains("ct-modal-backdrop")) {
        if (e.target.id === "ctConfirmBackdrop") return;
        if (e.target.hasAttribute("data-ct-dismissable")) modal.close(e.target);
        else nudgeModal(e.target);
      }
    });
    doc.addEventListener("keydown", function (e) {
      var open = $(".ct-modal-backdrop.is-open");
      if (!open) return;
      if (e.key === "Escape" && open.id !== "ctConfirmBackdrop") {
        if (open.hasAttribute("data-ct-dismissable")) modal.close(open);
        else nudgeModal(open);
      }
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

  /* ---------------- CogniTara Kinetic Modal System (CT.confirm & CT.alert) ---------------- */
  var MODAL_SVGS = {
    danger:
      '<svg class="ct-m-medallion__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<g class="ct-svg-lid">' +
          '<path d="M3.5 6h17"/>' +
          '<path d="M8.5 6V4.3A1.3 1.3 0 0 1 9.8 3h4.4a1.3 1.3 0 0 1 1.3 1.3V6"/>' +
        '</g>' +
        '<path class="ct-svg-draw" style="--d:40ms" pathLength="100" d="M6.5 6l.85 13.1A2 2 0 0 0 9.35 21h5.3a2 2 0 0 0 2-1.9L17.5 6"/>' +
        '<path class="ct-svg-draw" style="--d:170ms" pathLength="100" d="M10.2 11v5.5"/>' +
        '<path class="ct-svg-draw" style="--d:220ms" pathLength="100" d="M13.8 11v5.5"/>' +
      '</svg>',
    warn:
      '<svg class="ct-m-medallion__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path class="ct-svg-draw" style="--d:40ms" pathLength="100" d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/>' +
        '<path class="ct-svg-draw" style="--d:170ms" pathLength="100" d="M12 9v4.5"/>' +
        '<circle class="ct-svg-pop" style="--d:260ms" cx="12" cy="17.1" r="0.95" fill="currentColor" stroke="none"/>' +
      '</svg>',
    ok:
      '<svg class="ct-m-medallion__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<g class="ct-svg-spark" stroke-width="1.5">' +
          '<line x1="12" y1="0.8" x2="12" y2="2.5"/>' +
          '<line x1="20.2" y1="5.2" x2="18.9" y2="6.3"/>' +
          '<line x1="22.4" y1="14.5" x2="20.7" y2="14.1"/>' +
          '<line x1="3.8" y1="5.2" x2="5.1" y2="6.3"/>' +
          '<line x1="1.6" y1="14.5" x2="3.3" y2="14.1"/>' +
          '<line x1="12" y1="21.5" x2="12" y2="23.2"/>' +
        '</g>' +
        '<circle class="ct-svg-draw" style="--d:40ms" pathLength="100" cx="12" cy="12" r="8.5"/>' +
        '<path class="ct-svg-draw" style="--d:155ms" pathLength="100" d="m8.5 12.2 2.35 2.45 4.75-5.1"/>' +
      '</svg>',
    primary:
      '<svg class="ct-m-medallion__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<circle class="ct-svg-draw" style="--d:40ms" pathLength="100" cx="12" cy="12" r="9"/>' +
        '<path class="ct-svg-draw" style="--d:165ms" pathLength="100" d="M12 11.2v5.3"/>' +
        '<circle class="ct-svg-pop" style="--d:245ms" cx="12" cy="7.8" r="0.95" fill="currentColor" stroke="none"/>' +
      '</svg>',
    layers:
      '<svg class="ct-m-medallion__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path class="ct-svg-draw" style="--d:40ms" pathLength="100" d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z"/>' +
        '<path class="ct-svg-draw" style="--d:150ms" pathLength="100" d="m3 12 9 4.5 9-4.5"/>' +
        '<path class="ct-svg-draw" style="--d:230ms" pathLength="100" d="m3 16.5 9 4.5 9-4.5"/>' +
      '</svg>',
    ban:
      '<svg class="ct-m-medallion__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<circle class="ct-svg-draw" style="--d:40ms" pathLength="100" cx="12" cy="12" r="9"/>' +
        '<path class="ct-svg-draw" style="--d:175ms" pathLength="100" d="M5.7 5.7 18.3 18.3"/>' +
      '</svg>'
  };

  function modalSvg(key) {
    return MODAL_SVGS[key] || MODAL_SVGS.primary;
  }

  var _confirmState = null;
  var _holdTimer = null;

  function ensureConfirmDialog() {
    var bd = $("#ctConfirmBackdrop");
    if (bd) return bd;
    bd = doc.createElement("div");
    bd.id = "ctConfirmBackdrop";
    bd.className = "ct-modal-backdrop ct-confirm-backdrop";
    bd.setAttribute("aria-hidden", "true");
    bd.innerHTML =
      '<div class="ct-modal ct-confirm-modal" tabindex="-1" role="alertdialog" aria-modal="true" aria-labelledby="ctConfirmTitle" aria-describedby="ctConfirmDesc">' +
        '<div class="ct-m-head">' +
          '<div class="ct-m-medallion" id="ctConfirmBadge">' +
            '<span class="ct-m-medallion__halo" aria-hidden="true"></span>' +
            '<span class="ct-confirm-badge__ico" id="ctConfirmIcon"></span>' +
          '</div>' +
          '<div class="ct-m-copy">' +
            '<h3 id="ctConfirmTitle">Confirm action</h3>' +
            '<div class="ct-m-desc" id="ctConfirmDesc"></div>' +
          '</div>' +
          '<button type="button" class="ct-iconbtn ct-iconbtn--ghost ct-modal__close" id="ctConfirmX" aria-label="Close">' + icon("i-x", "ct-ico--sm") + '</button>' +
        '</div>' +
        '<div class="ct-m-subject" id="ctConfirmSubject" hidden>' +
          '<div class="ct-m-subject__left">' +
            '<span class="ct-m-subject__label" id="ctConfirmSubjLabel"></span>' +
            '<span class="ct-m-subject__val" id="ctConfirmSubjVal"></span>' +
          '</div>' +
          '<span class="ct-m-subject__meta" id="ctConfirmSubjMeta"></span>' +
        '</div>' +
        '<div class="ct-m-foot">' +
          '<span class="ct-m-kbd" id="ctConfirmKbd"><kbd>Esc</kbd><span id="ctConfirmKbdText">Cancel</span></span>' +
          '<div class="ct-m-foot__btns">' +
            '<button type="button" class="ct-btn ct-btn--ghost" id="ctConfirmCancel">Cancel</button>' +
            '<button type="button" class="ct-btn ct-btn--danger-solid" id="ctConfirmOk">' +
              '<span class="ct-btn--hold__fill" aria-hidden="true"></span>' +
              '<span class="ct-btn--hold__label" id="ctConfirmOkLabel">Confirm</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    doc.body.appendChild(bd);

    var modalEl = $(".ct-confirm-modal", bd);
    var okBtn = $("#ctConfirmOk", bd);

    function clearHold() {
      if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; }
      okBtn.classList.remove("is-holding");
    }

    function finish(val) {
      clearHold();
      modalEl.classList.remove("is-danger-armed");
      bd.classList.remove("is-open");
      bd.setAttribute("aria-hidden", "true");
      var st = _confirmState;
      _confirmState = null;
      if (st && st.prevFocus && st.prevFocus.focus) {
        try { st.prevFocus.focus({ preventScroll: true }); } catch (e) {}
      }
      if (st && st.resolve) st.resolve(val);
    }

    $("#ctConfirmCancel", bd).addEventListener("click", function () { finish(false); });
    $("#ctConfirmX", bd).addEventListener("click", function () { finish(false); });

    // Cause -> effect: hovering the Delete CTA lifts the kinetic trash lid
    okBtn.addEventListener("mouseenter", function () {
      if (modalEl.getAttribute("data-tone") === "danger") modalEl.classList.add("is-danger-armed");
    });
    okBtn.addEventListener("mouseleave", function () {
      modalEl.classList.remove("is-danger-armed");
      clearHold();
    });

    // Click OR Emil Kowalski clip-path Hold-to-Confirm support
    okBtn.addEventListener("pointerdown", function (e) {
      if (!_confirmState || !_confirmState.holdMs) return;
      if (e.button !== 0) return;
      clearHold();
      okBtn.style.setProperty("--ct-hold-ms", _confirmState.holdMs + "ms");
      void okBtn.offsetWidth;
      okBtn.classList.add("is-holding");
      _holdTimer = setTimeout(function () {
        _holdTimer = null;
        finish(true);
      }, _confirmState.holdMs);
    });
    okBtn.addEventListener("pointerup", clearHold);
    okBtn.addEventListener("pointercancel", clearHold);
    okBtn.addEventListener("click", function (e) {
      if (_confirmState && _confirmState.holdMs) {
        // Allow keyboard Space/Enter activation for a11y while pointer requires hold
        if (e.detail === 0) finish(true);
        return;
      }
      finish(true);
    });

    bd.addEventListener("mousedown", function (e) {
      if (e.target !== bd) return;
      if (_confirmState && _confirmState.dismissable === false) {
        nudgeModal(modalEl);
        return;
      }
      finish(false);
    });
    doc.addEventListener("keydown", function (e) {
      if (!_confirmState) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (_confirmState.dismissable === false) {
          nudgeModal(modalEl);
          return;
        }
        finish(false);
      }
    });
    return bd;
  }

  function confirmDialog(opts) {
    opts = opts || {};
    var bd = ensureConfirmDialog();
    var tone = opts.tone || "danger";
    var modalEl = $(".ct-confirm-modal", bd);
    modalEl.setAttribute("data-tone", tone);
    modalEl.classList.remove("is-danger-armed");

    // Pick choreographed inline SVG
    var svgKey = opts.svg || (
      opts.icon === "i-ban" ? "ban" :
      opts.icon === "i-layers" ? "layers" :
      tone
    );
    $("#ctConfirmIcon", bd).innerHTML = modalSvg(svgKey);

    $("#ctConfirmTitle", bd).textContent = opts.title || "Are you sure?";
    var descEl = $("#ctConfirmDesc", bd);
    if (opts.html != null) descEl.innerHTML = opts.html;
    else descEl.textContent = opts.message || "This action cannot be undone.";

    // Optional highlighted subject card
    var subjEl = $("#ctConfirmSubject", bd);
    if (opts.subject && (opts.subject.value || opts.subject.label)) {
      $("#ctConfirmSubjLabel", bd).textContent = opts.subject.label || "";
      $("#ctConfirmSubjVal", bd).textContent = opts.subject.value || "";
      $("#ctConfirmSubjMeta", bd).textContent = opts.subject.meta || "";
      subjEl.hidden = false;
    } else {
      subjEl.hidden = true;
    }

    var cancelBtn = $("#ctConfirmCancel", bd);
    var okBtn = $("#ctConfirmOk", bd);
    var okLabel = $("#ctConfirmOkLabel", bd);
    var kbdHint = $("#ctConfirmKbd", bd);

    cancelBtn.hidden = !!opts.hideCancel;
    cancelBtn.textContent = opts.cancelText || "Cancel";
    if (kbdHint) kbdHint.style.visibility = opts.dismissable === false ? "hidden" : "visible";
    var kbdText = $("#ctConfirmKbdText", bd);
    if (kbdText) kbdText.textContent = opts.hideCancel ? "Close" : "Cancel";

    var holdMs = opts.holdToConfirm ? (opts.holdDuration || 1200) : 0;
    okLabel.textContent = opts.confirmText || (holdMs ? "Hold to delete" : (tone === "danger" ? "Delete" : "Confirm"));
    okBtn.className = "ct-btn " + (
      tone === "danger" ? "ct-btn--danger-solid" :
      tone === "warn" ? "ct-btn--warn-solid" :
      tone === "ok" ? "ct-btn--ok-solid" : "ct-btn--primary"
    ) + (holdMs ? " ct-btn--hold" : "");

    if (_confirmState && _confirmState.resolve) _confirmState.resolve(false);

    return new Promise(function (resolve) {
      _confirmState = {
        resolve: resolve,
        prevFocus: doc.activeElement,
        dismissable: opts.dismissable !== false,
        holdMs: holdMs
      };
      // Replay vector medallion choreography cleanly on every open
      replayModalVector(modalEl);
      bd.classList.remove("is-open");
      void bd.offsetWidth;
      bd.classList.add("is-open");
      bd.setAttribute("aria-hidden", "false");
      setTimeout(function () {
        try { modalEl.focus({ preventScroll: true }); } catch (e) {}
      }, 65);
    });
  }

  function alertDialog(opts) {
    opts = opts || {};
    return confirmDialog({
      tone: opts.tone || "ok",
      svg: opts.svg,
      title: opts.title || "Done",
      message: opts.message,
      html: opts.html,
      subject: opts.subject,
      confirmText: opts.confirmText || "Got it",
      hideCancel: true,
      dismissable: opts.dismissable !== false
    });
  }

  /* ---------------- Table filter + Pagination ---------------- */
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
        row.dataset.ctFilteredOut = hit ? "0" : "1";
        if (!table._ctPaginated) {
          row.style.display = hit ? "" : "none";
        }
        if (hit) shown++;
      });
      if (table._ctRepaginate) table._ctRepaginate(true);
      if (emptyEl) emptyEl.hidden = shown !== 0;
      if (typeof opts.onFilter === "function") opts.onFilter(shown, q);
    }
    input.addEventListener("input", run);
    return run;
  }

  function paginateTable(tableOrSel, opts) {
    var table = $(tableOrSel);
    if (!table) return null;
    opts = opts || {};
    var tbody = table.tBodies && table.tBodies[0] ? table.tBodies[0] : $("tbody", table);
    if (!tbody) return null;

    var sizes = opts.pageSizes || [10, 25, 50, 100];
    var pageSize = parseInt(opts.pageSize || table.getAttribute("data-ct-paginate") || "10", 10) || 10;
    if (sizes.indexOf(pageSize) === -1) {
      sizes = [pageSize].concat(sizes).sort(function (a, b) { return a - b; });
    }
    var page = 1;

    var host = opts.host ? $(opts.host) : null;
    if (!host) {
      var wrap = table.closest(".ct-table-wrap") || table.parentNode;
      var existing = wrap && wrap.nextElementSibling && wrap.nextElementSibling.classList.contains("ct-pager") ? wrap.nextElementSibling : null;
      if (existing) {
        host = existing;
      } else {
        host = doc.createElement("div");
        host.className = "ct-pager";
        if (wrap && wrap.parentNode) wrap.parentNode.insertBefore(host, wrap.nextSibling);
        else table.parentNode.appendChild(host);
      }
    }

    function getRows() {
      return Array.prototype.slice.call(tbody.children).filter(function (tr) {
        return tr.tagName === "TR" && !tr.classList.contains("ct-table-empty-row") && !tr.hasAttribute("data-ct-empty-row");
      });
    }

    function render(resetPage) {
      if (resetPage) page = 1;
      var allRows = getRows();
      var eligible = allRows.filter(function (tr) {
        if (tr.dataset.ctFilteredOut === "1") return false;
        if (typeof opts.filterFn === "function" && !opts.filterFn(tr)) return false;
        return true;
      });

      var total = eligible.length;
      var totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (page > totalPages) page = totalPages;
      if (page < 1) page = 1;

      var startIdx = (page - 1) * pageSize;
      var endIdx = Math.min(total, startIdx + pageSize);

      allRows.forEach(function (tr) {
        tr.style.display = "none";
      });
      eligible.slice(startIdx, endIdx).forEach(function (tr) {
        tr.style.display = "";
      });

      if (allRows.length === 0) {
        host.hidden = true;
        return;
      }
      host.hidden = false;

      var rangeText = total === 0
        ? "No matching records"
        : ("Showing <strong>" + (startIdx + 1) + "-" + endIdx + "</strong> of <strong>" + total + "</strong>");

      var sizeOptions = sizes.map(function (s) {
        return '<option value="' + s + '"' + (s === pageSize ? " selected" : "") + '>' + s + " / page</option>";
      }).join("");

      var pagesHtml = "";
      if (totalPages > 1) {
        var nums = [];
        for (var p = 1; p <= totalPages; p++) {
          if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
            nums.push(p);
          } else if (nums[nums.length - 1] !== "...") {
            nums.push("...");
          }
        }
        pagesHtml =
          '<button type="button" class="ct-page-btn" data-ct-page="' + (page - 1) + '"' + (page <= 1 ? " disabled" : "") + ' aria-label="Previous page">' + icon("i-chevron-left", "ct-ico--sm") + '</button>' +
          nums.map(function (n) {
            if (n === "...") return '<span class="ct-page-ellipsis">&hellip;</span>';
            return '<button type="button" class="ct-page-btn' + (n === page ? " is-active" : "") + '" data-ct-page="' + n + '"' + (n === page ? ' aria-current="page"' : "") + '>' + n + '</button>';
          }).join("") +
          '<button type="button" class="ct-page-btn" data-ct-page="' + (page + 1) + '"' + (page >= totalPages ? " disabled" : "") + ' aria-label="Next page">' + icon("i-chevron-right", "ct-ico--sm") + '</button>';
      } else {
        pagesHtml = '<span class="ct-pager__single">Page 1 of 1</span>';
      }

      host.innerHTML =
        '<div class="ct-pager__meta">' + rangeText + '</div>' +
        '<div class="ct-pager__controls">' +
          '<label class="ct-pager__size"><span class="sr-only">Rows per page</span><select class="ct-pager__select" aria-label="Rows per page">' + sizeOptions + '</select></label>' +
          '<div class="ct-pagination" role="navigation" aria-label="Table pagination">' + pagesHtml + '</div>' +
        '</div>';

      var selEl = $(".ct-pager__select", host);
      if (selEl) {
        selEl.addEventListener("change", function () {
          pageSize = parseInt(selEl.value, 10) || 10;
          page = 1;
          render(false);
        });
      }
      $$("[data-ct-page]", host).forEach(function (btn) {
        btn.addEventListener("click", function () {
          var next = parseInt(btn.getAttribute("data-ct-page"), 10);
          if (isFinite(next) && next >= 1 && next <= totalPages && next !== page) {
            page = next;
            render(false);
          }
        });
      });

      if (typeof opts.onChange === "function") opts.onChange({ page: page, pageSize: pageSize, total: total, totalPages: totalPages });
    }

    table._ctPaginated = true;
    table._ctRepaginate = function (reset) { render(!!reset); };
    render(false);
    return {
      refresh: function (reset) { render(!!reset); },
      setPage: function (p) { page = p; render(false); },
      setPageSize: function (s) { pageSize = s; page = 1; render(false); }
    };
  }

  function bindFilters() {
    $$("[data-ct-filter]").forEach(function (inp) {
      tableFilter(inp, inp.getAttribute("data-ct-filter"), {
        rows: inp.getAttribute("data-ct-filter-rows") || undefined,
        empty: inp.getAttribute("data-ct-filter-empty") || undefined
      });
    });
  }

  function bindPaginators() {
    $$("table[data-ct-paginate]").forEach(function (tbl) {
      if (tbl._ctPaginated) return;
      var sizesAttr = tbl.getAttribute("data-ct-paginate-sizes");
      var sizes = sizesAttr ? sizesAttr.split(",").map(function (n) { return parseInt(n.trim(), 10); }).filter(Boolean) : undefined;
      paginateTable(tbl, {
        pageSize: parseInt(tbl.getAttribute("data-ct-paginate"), 10) || 10,
        pageSizes: sizes
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
      if (c.run) c.run();
      else if (c.go) {
        if (window.CTPjax && typeof window.CTPjax.canHandle === "function" && window.CTPjax.canHandle(c.go)) {
          window.CTPjax.navigate(c.go);
        } else {
          location.href = c.go;
        }
      }
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

  /* ---------------- Cleanup Registry (used by PJAX navigation) ---------------- */
  var _cleanupFns = [];
  function onCleanup(fn) {
    if (typeof fn === "function") _cleanupFns.push(fn);
  }
  function runCleanups() {
    while (_cleanupFns.length) {
      var fn = _cleanupFns.pop();
      try { fn(); } catch (e) {}
    }
    if (typeof window.__ctPageCleanup === "function") {
      try { window.__ctPageCleanup(); } catch (e) {}
      window.__ctPageCleanup = null;
    }
  }

  /* ---------------- Viewport Overlay Portaling (Modals + Slide-Over Drawers) ---------------- */
  function portalOverlays(ctx) {
    ctx = ctx || doc;
    var moveOverlay = function (el) {
      if (!el || !el.parentNode || el.parentNode === doc.body) return;
      el.setAttribute("data-ct-pjax-portal", "1");
      doc.body.appendChild(el);
    };
    $$(".modal, .ct-modal-backdrop, .ecc-drw-scrim, .ecc-drw, .premium-modal-overlay", ctx).forEach(function (el) {
      if (el.id === "ctConfirmBackdrop") return;
      if (el.closest(".ct-main, .ct-content")) moveOverlay(el);
    });
  }
  function fixBootstrapModals() {
    portalOverlays(doc);
    doc.addEventListener("show.bs.modal", function (e) {
      if (e && e.target && e.target.parentNode !== doc.body) {
        e.target.setAttribute("data-ct-pjax-portal", "1");
        doc.body.appendChild(e.target);
      }
    });
  }

  function injectCsrfForms(ctx) {
    ctx = ctx || doc;
    var tok = window.CSRF_TOKEN || (doc.querySelector('meta[name="csrf-token"]') && doc.querySelector('meta[name="csrf-token"]').getAttribute("content")) || "";
    if (!tok) return;
    $$('form[method="POST"], form[method="post"]', ctx).forEach(function (form) {
      var inp = form.querySelector('input[name="csrf_token"]');
      if (!inp) {
        inp = doc.createElement("input");
        inp.type = "hidden";
        inp.name = "csrf_token";
        form.appendChild(inp);
      }
      inp.value = tok;
    });
  }

  /* ---------------- Scoped Re-initialization (PJAX-safe) ---------------- */
  function initScope(ctx) {
    ctx = ctx || doc;
    portalOverlays(ctx);
    injectCsrfForms(ctx);
    $$("table[data-ct-paginate]", ctx).forEach(function (tbl) {
      if (tbl._ctPaginated) return;
      var sizesAttr = tbl.getAttribute("data-ct-paginate-sizes");
      var sizes = sizesAttr ? sizesAttr.split(",").map(function (n) { return parseInt(n.trim(), 10); }).filter(Boolean) : undefined;
      paginateTable(tbl, {
        pageSize: parseInt(tbl.getAttribute("data-ct-paginate"), 10) || 10,
        pageSizes: sizes
      });
    });
    $$("[data-ct-filter]", ctx).forEach(function (inp) {
      if (inp.__ctFilterBound) return;
      inp.__ctFilterBound = true;
      tableFilter(inp, inp.getAttribute("data-ct-filter"), {
        rows: inp.getAttribute("data-ct-filter-rows") || undefined,
        empty: inp.getAttribute("data-ct-filter-empty") || undefined
      });
    });
    $$("[data-ct-tabs]", ctx).forEach(function (group) {
      if (group.__ctTabsBound) return;
      group.__ctTabsBound = true;
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
      if (tabs.length) select(tabs.filter(function (t) { return t.classList.contains("is-active"); })[0] || tabs[0]);
    });
    $$("[data-ct-seg]", ctx).forEach(function (seg) {
      if (seg.__ctSegBound) return;
      seg.__ctSegBound = true;
      syncSeg(seg);
      seg.addEventListener("click", function () { requestAnimationFrame(function () { syncSeg(seg); }); });
    });
    $$(".ct-drop", ctx).forEach(function (z) {
      if (z.__ctDropBound) return;
      z.__ctDropBound = true;
      var input = z.querySelector('input[type="file"]');
      var name = z.querySelector(".ct-drop__name");
      if (!input) return;
      ["dragenter", "dragover"].forEach(function (ev) { z.addEventListener(ev, function () { z.classList.add("is-drag"); }); });
      ["dragleave", "drop"].forEach(function (ev) { z.addEventListener(ev, function () { z.classList.remove("is-drag"); }); });
      input.addEventListener("change", function () {
        if (name) name.textContent = input.files && input.files.length ? Array.prototype.map.call(input.files, function (f) { return f.name; }).join(", ") : "";
      });
    });
    reveal(ctx);
    if (window.CogniTaraActions && typeof window.CogniTaraActions.bindDeclarativeActions === "function") {
      window.CogniTaraActions.bindDeclarativeActions();
    }
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
    initScope(doc);
  }

  window.CT = {
    version: "3.2.0",
    sprite: SPRITE,
    icon: icon,
    esc: esc,
    theme: theme,
    toast: toast,
    modal: modal,
    confirm: confirmDialog,
    alert: alertDialog,
    modalSvg: modalSvg,
    sidebar: sidebar,
    tableFilter: tableFilter,
    paginateTable: paginateTable,
    countUp: countUp,
    reveal: reveal,
    palette: palette,
    initScope: initScope,
    portalOverlays: portalOverlays,
    onCleanup: onCleanup,
    runCleanups: runCleanups,
    seg: { sync: syncSeg },
    reducedMotion: reduced
  };

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
