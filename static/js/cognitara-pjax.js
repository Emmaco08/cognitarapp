/* ==========================================================================
   CogniTara Cloudflare-Style Zero-Reload Admin SPA / PJAX Router
   --------------------------------------------------------------------------
   Smoothly swaps <main id="main">, breadcrumb, document.title, active sidebar
   state, page styles, and page scripts via History API with zero full browser
   reloads across all /admin* routes.
   ========================================================================== */
(function (window, document) {
  "use strict";

  if (window.CTPjax) return;

  var inflightController = null;
  var progressTimer = null;
  var barEl = null;

  function ensureBar() {
    if (barEl && barEl.parentNode) return barEl;
    barEl = document.createElement("div");
    barEl.id = "ctPjaxBar";
    barEl.className = "ct-pjax-bar";
    barEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(barEl);
    return barEl;
  }

  function startProgress() {
    var b = ensureBar();
    if (progressTimer) clearTimeout(progressTimer);
    b.style.transition = "none";
    b.style.width = "0%";
    b.classList.add("is-loading");
    b.offsetWidth;
    b.style.transition = "width 240ms cubic-bezier(0.23, 1, 0.32, 1), opacity 180ms ease";
    b.style.width = "68%";
    progressTimer = setTimeout(function () {
      b.style.width = "88%";
    }, 260);
  }

  function finishProgress() {
    if (progressTimer) { clearTimeout(progressTimer); progressTimer = null; }
    var b = ensureBar();
    b.style.width = "100%";
    setTimeout(function () {
      b.classList.remove("is-loading");
      setTimeout(function () { b.style.width = "0%"; }, 180);
    }, 120);
  }

  function isAdminShellActive() {
    return !!(
      document.body &&
      document.body.classList.contains("ad-studio") &&
      document.querySelector(".ct-shell .ct-sidebar") &&
      document.getElementById("main")
    );
  }

  var BYPASS_PATTERNS = [
    /^\/logout(\b|\/|\?|$)/i,
    /^\/login(\b|\/|\?|$)/i,
    /^\/ce_login(\b|\/|\?|$)/i,
    /^\/exam_start\//i,
    /\/export/i,
    /\/download/i,
    /\/test-run(\b|\/|\?|$)/i,
    /\/print(\b|\/|\?|$)/i,
    /\.(pdf|csv|xlsx|json|zip|db|sqlite)$/i
  ];

  function canHandle(href) {
    if (!href || !isAdminShellActive()) return false;
    var trimmed = String(href).trim();
    if (!trimmed || trimmed.indexOf("javascript:") === 0 || trimmed.indexOf("mailto:") === 0 || trimmed.indexOf("tel:") === 0) {
      return false;
    }
    var url;
    try {
      url = new URL(trimmed, window.location.origin);
    } catch (e) {
      return false;
    }
    if (url.origin !== window.location.origin) return false;
    var path = url.pathname || "/";
    if (path !== "/admin" && path.indexOf("/admin/") !== 0) return false;
    for (var i = 0; i < BYPASS_PATTERNS.length; i++) {
      if (BYPASS_PATTERNS[i].test(path)) return false;
    }
    return true;
  }

  function normalizePath(p) {
    if (!p || p === "/") return "/";
    return p.length > 1 && p.charAt(p.length - 1) === "/" ? p.slice(0, -1) : p;
  }

  function updateSidebarActive(targetPath, targetHash, explicitActive) {
    var links = Array.prototype.slice.call(document.querySelectorAll(".ct-sidebar .ct-nav__link"));
    var normTarget = normalizePath(targetPath);
    var matched = null;

    if (targetHash && normTarget === "/admin") {
      matched = links.find(function (a) {
        var h = a.getAttribute("href") || "";
        return h === "/admin" + targetHash || h === targetHash;
      });
    }
    if (!matched && explicitActive) {
      matched = links.find(function (a) {
        return a.getAttribute("data-nav-key") === explicitActive;
      });
    }
    if (!matched) {
      matched = links.find(function (a) {
        var h = a.getAttribute("href") || "";
        if (!h || h.indexOf("#") !== -1) return false;
        try {
          return normalizePath(new URL(h, window.location.origin).pathname) === normTarget;
        } catch (e) {
          return false;
        }
      });
    }
    if (!matched && normTarget === "/admin") {
      matched = links.find(function (a) {
        return a.getAttribute("data-nav-key") === "overview" || a.getAttribute("href") === "/admin";
      });
    }

    links.forEach(function (a) {
      var on = a === matched;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function scrollToHashOrTop(hash, smooth) {
    if (hash && hash.length > 1) {
      var target = document.getElementById(hash.slice(1));
      if (target) {
        var reduced = window.CT && window.CT.reducedMotion && window.CT.reducedMotion();
        target.scrollIntoView({ behavior: smooth && !reduced ? "smooth" : "auto", block: "start" });
        return true;
      }
    }
    window.scrollTo({ top: 0, behavior: "auto" });
    return false;
  }

  function isBootOrShellScript(scriptEl) {
    if (scriptEl.src) return false;
    var code = scriptEl.textContent || "";
    if (!code.trim()) return true;
    if (code.indexOf("window.CSRF_TOKEN =") !== -1 && code.indexOf("sendBeacon") !== -1) return true;
    if (code.indexOf("ctShellPalette") !== -1 && code.indexOf("CT.palette") !== -1) return true;
    if (code.indexOf('localStorage.getItem("ct-theme")') !== -1 && code.indexOf("ct-motion") !== -1) return true;
    return false;
  }

  function isCoreSharedAsset(urlStr) {
    if (!urlStr) return true;
    return (
      urlStr.indexOf("cognitara-web.js") !== -1 ||
      urlStr.indexOf("cognitara-pjax.js") !== -1 ||
      urlStr.indexOf("cognitara-web.css") !== -1 ||
      urlStr.indexOf("cognitara-teacher-studio.css") !== -1 ||
      urlStr.indexOf("cognitara-admin-studio.css") !== -1 ||
      urlStr.indexOf("cognitara-portal-unified.css") !== -1
    );
  }

  function ensureStylesheets(parsedDoc) {
    var existing = new Set();
    document.querySelectorAll('head link[rel="stylesheet"]').forEach(function (l) {
      if (l.href) existing.add(l.href);
    });
    var promises = [];
    parsedDoc.querySelectorAll('head link[rel="stylesheet"]').forEach(function (l) {
      var rawHref = l.getAttribute("href");
      if (!rawHref) return;
      var absHref;
      try { absHref = new URL(rawHref, window.location.origin).href; } catch (e) { return; }
      if (existing.has(absHref) || isCoreSharedAsset(absHref)) return;
      existing.add(absHref);
      promises.push(new Promise(function (resolve) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = absHref;
        link.onload = resolve;
        link.onerror = resolve;
        document.head.appendChild(link);
      }));
    });
    return Promise.all(promises);
  }

  function loadExternalScripts(parsedDoc) {
    var existing = new Set();
    document.querySelectorAll("script[src]").forEach(function (s) {
      if (s.src) existing.add(s.src);
    });
    var toLoad = [];
    parsedDoc.querySelectorAll("script[src]").forEach(function (s) {
      var rawSrc = s.getAttribute("src");
      if (!rawSrc) return;
      var absSrc;
      try { absSrc = new URL(rawSrc, window.location.origin).href; } catch (e) { return; }
      if (existing.has(absSrc) || isCoreSharedAsset(absSrc)) return;
      existing.add(absSrc);
      toLoad.push(absSrc);
    });

    return toLoad.reduce(function (chain, src) {
      return chain.then(function () {
        return new Promise(function (resolve) {
          var el = document.createElement("script");
          el.src = src;
          el.async = false;
          el.onload = resolve;
          el.onerror = resolve;
          document.head.appendChild(el);
        });
      });
    }, Promise.resolve());
  }

  function swapPageStyles(parsedDoc) {
    document.querySelectorAll('head style[data-ct-pjax-style="1"]').forEach(function (s) { s.remove(); });
    parsedDoc.querySelectorAll("head style").forEach(function (s) {
      var clone = document.createElement("style");
      clone.setAttribute("data-ct-pjax-style", "1");
      clone.textContent = s.textContent || "";
      document.head.appendChild(clone);
    });
  }

  function destroyPageCharts(mainEl) {
    if (!window.Chart || !mainEl) return;
    mainEl.querySelectorAll("canvas").forEach(function (c) {
      try {
        var inst = window.Chart.getChart ? window.Chart.getChart(c) : null;
        if (inst && typeof inst.destroy === "function") inst.destroy();
      } catch (e) {}
    });
  }

  function cleanupBeforeSwap(mainEl) {
    if (window.CT && typeof window.CT.runCleanups === "function") {
      window.CT.runCleanups();
    }
    destroyPageCharts(mainEl);
    if (window.CT && window.CT.modal) {
      window.CT.modal.close();
    }
    if (window.CT && window.CT.sidebar) {
      window.CT.sidebar.closeDrawer();
    }
    document.querySelectorAll("[data-ct-dropdown].is-open").forEach(function (dd) {
      dd.classList.remove("is-open");
    });
    document.querySelectorAll('[data-ct-pjax-portal="1"]').forEach(function (el) {
      el.remove();
    });
    document.querySelectorAll(".modal-backdrop").forEach(function (el) {
      el.remove();
    });
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("overflow");
    document.body.style.removeProperty("padding-right");
  }

  function executeInlineScripts(scripts) {
    if (!scripts.length) return;
    var queuedDomReady = [];
    var origDocAdd = document.addEventListener.bind(document);

    document.addEventListener = function (type, listener, options) {
      if (type === "DOMContentLoaded" && typeof listener === "function") {
        queuedDomReady.push(listener);
        return;
      }
      return origDocAdd(type, listener, options);
    };

    try {
      scripts.forEach(function (code) {
        if (!code || !code.trim()) return;
        // Convert top-level const/let (0-4 spaces) to var so revisiting a page never throws Identifier already declared
        var safeCode = code.replace(/^([ \t]{0,4})(const|let)\s+/gm, "$1var ");
        try {
          (0, eval)(safeCode);
        } catch (err) {
          console.error("[CogniTara PJAX] Script execution error:", err);
        }
      });
    } finally {
      document.addEventListener = origDocAdd;
    }

    queuedDomReady.forEach(function (fn) {
      try { fn(new Event("DOMContentLoaded")); } catch (err) {
        console.error("[CogniTara PJAX] DOMContentLoaded hook error:", err);
      }
    });
  }

  function syncShellChrome(parsedDoc) {
    var nextMetaCsrf = parsedDoc.querySelector('meta[name="csrf-token"]');
    if (nextMetaCsrf && nextMetaCsrf.getAttribute("content")) {
      var tok = nextMetaCsrf.getAttribute("content");
      window.CSRF_TOKEN = tok;
      var curMeta = document.querySelector('meta[name="csrf-token"]');
      if (curMeta) curMeta.setAttribute("content", tok);
    }

    var nextCrumbs = parsedDoc.querySelector(".ct-topbar .ct-crumbs");
    var curCrumbs = document.querySelector(".ct-topbar .ct-crumbs");
    if (nextCrumbs && curCrumbs) {
      curCrumbs.innerHTML = nextCrumbs.innerHTML;
    }

    var nextSchool = parsedDoc.querySelector(".ct-sidebar .ct-school");
    var curSchool = document.querySelector(".ct-sidebar .ct-school");
    if (nextSchool && curSchool) {
      curSchool.innerHTML = nextSchool.innerHTML;
    }

    // Keep topbar pending approvals bell badge synced
    var nextBell = parsedDoc.querySelector('.ct-topbar__actions a[href="/admin/pending_students"]');
    var curBell = document.querySelector('.ct-topbar__actions a[href="/admin/pending_students"]');
    if (nextBell && curBell) {
      var nBadge = nextBell.querySelector(".ct-iconbtn__badge");
      var cBadge = curBell.querySelector(".ct-iconbtn__badge");
      if (nBadge && cBadge) cBadge.textContent = nBadge.textContent;
      else if (nBadge && !cBadge) curBell.appendChild(nBadge.cloneNode(true));
      else if (!nBadge && cBadge) cBadge.remove();
    }

    // Keep live nav badges synced if present in response
    var nextBadges = parsedDoc.querySelectorAll(".ct-sidebar .ct-nav__link[data-nav-key]");
    nextBadges.forEach(function (nextLink) {
      var key = nextLink.getAttribute("data-nav-key");
      var curLink = document.querySelector('.ct-sidebar .ct-nav__link[data-nav-key="' + key + '"]');
      if (!curLink) return;
      var nb = nextLink.querySelector(".ct-nav__badge");
      var cb = curLink.querySelector(".ct-nav__badge");
      if (nb && cb) {
        cb.textContent = nb.textContent;
        cb.className = nb.className;
      } else if (nb && !cb) {
        curLink.appendChild(nb.cloneNode(true));
      } else if (!nb && cb) {
        cb.remove();
      }
    });

    // Keep body helper classes synced (e.g. ct-bs if needed by a subpage)
    var nextBody = parsedDoc.body;
    if (nextBody) {
      document.body.classList.toggle("ct-bs", nextBody.classList.contains("ct-bs"));
    }
  }

  async function navigate(rawUrl, opts) {
    opts = opts || {};
    var targetUrl;
    try {
      targetUrl = new URL(rawUrl, window.location.origin);
    } catch (e) {
      window.location.href = rawUrl;
      return;
    }

    var curPath = normalizePath(window.location.pathname);
    var nextPath = normalizePath(targetUrl.pathname);

    // Same-document hash jump or return-to-top without any network round-trip
    if (!opts.force && curPath === nextPath && window.location.search === targetUrl.search) {
      if (targetUrl.hash || window.location.hash) {
        if (!opts.fromPopstate) {
          history.pushState({ pjax: true, url: targetUrl.href }, "", targetUrl.href);
        }
        updateSidebarActive(nextPath, targetUrl.hash, null);
        scrollToHashOrTop(targetUrl.hash, true);
        return;
      }
    }

    if (inflightController) {
      try { inflightController.abort(); } catch (e) {}
    }
    inflightController = typeof AbortController !== "undefined" ? new AbortController() : null;

    var mainEl = document.getElementById("main");
    if (!mainEl) {
      window.location.href = targetUrl.href;
      return;
    }

    startProgress();
    mainEl.classList.add("ct-pjax-out");

    try {
      var fetchOpts = {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "X-Requested-With": "CogniTara-PJAX",
          "Accept": "text/html,application/xhtml+xml"
        }
      };
      if (inflightController) fetchOpts.signal = inflightController.signal;

      var res = await fetch(targetUrl.href, fetchOpts);

      // If redirected outside /admin (e.g., session expired -> /login), perform full navigation
      var finalUrl = new URL(res.url || targetUrl.href, window.location.origin);
      if (!res.ok || !canHandle(finalUrl.href)) {
        window.location.href = finalUrl.href;
        return;
      }

      var html = await res.text();
      var parser = new DOMParser();
      var parsedDoc = parser.parseFromString(html, "text/html");
      var nextMain = parsedDoc.getElementById("main");
      if (!nextMain) {
        window.location.href = finalUrl.href;
        return;
      }

      // Extract inline page scripts BEFORE removing them from the cloned main markup
      var inlineScripts = [];
      parsedDoc.querySelectorAll("script").forEach(function (s) {
        if (s.src || isBootOrShellScript(s)) return;
        inlineScripts.push(s.textContent || "");
      });
      nextMain.querySelectorAll("script").forEach(function (s) { s.remove(); });

      await ensureStylesheets(parsedDoc);
      await loadExternalScripts(parsedDoc);

      cleanupBeforeSwap(mainEl);
      swapPageStyles(parsedDoc);
      syncShellChrome(parsedDoc);

      if (parsedDoc.title) document.title = parsedDoc.title;

      // Swap workspace content with crisp entrance
      mainEl.className = nextMain.className.replace(/\bct-enter\b/g, "").trim() || "ct-content";
      if (nextMain.getAttribute("data-nav-active")) {
        mainEl.setAttribute("data-nav-active", nextMain.getAttribute("data-nav-active"));
      } else {
        mainEl.removeAttribute("data-nav-active");
      }
      mainEl.innerHTML = nextMain.innerHTML;
      mainEl.classList.remove("ct-pjax-out");
      if (!(window.CT && window.CT.reducedMotion && window.CT.reducedMotion())) {
        mainEl.classList.add("ct-pjax-in");
        setTimeout(function () { mainEl.classList.remove("ct-pjax-in"); }, 260);
      }

      var finalHref = finalUrl.pathname + finalUrl.search + (targetUrl.hash || finalUrl.hash || "");
      if (!opts.fromPopstate) {
        if (opts.replace) history.replaceState({ pjax: true, url: finalHref }, "", finalHref);
        else history.pushState({ pjax: true, url: finalHref }, "", finalHref);
      }

      var activeKey = nextMain.getAttribute("data-nav-active") || null;
      updateSidebarActive(finalUrl.pathname, targetUrl.hash || finalUrl.hash || "", activeKey);

      // Re-init CT interactive primitives inside newly swapped workspace
      if (window.CT && typeof window.CT.initScope === "function") {
        window.CT.initScope(mainEl);
      }

      // Execute page-specific inline scripts
      executeInlineScripts(inlineScripts);

      // Position viewport cleanly at hash target or top
      scrollToHashOrTop(targetUrl.hash || finalUrl.hash || "", false);

      document.dispatchEvent(new CustomEvent("ct:pjax:complete", {
        detail: { url: finalHref, pathname: finalUrl.pathname }
      }));
    } catch (err) {
      if (err && err.name === "AbortError") return;
      console.warn("[CogniTara PJAX] Falling back to standard navigation:", err);
      window.location.href = targetUrl.href;
    } finally {
      mainEl.classList.remove("ct-pjax-out");
      finishProgress();
      inflightController = null;
    }
  }

  function refresh() {
    return navigate(window.location.href, { force: true, replace: true });
  }

  function bootPjax() {
    if (!isAdminShellActive()) return;

    // Tag initial page-specific inline <style> blocks in <head> so they clean up cleanly on first navigation
    document.querySelectorAll("head style:not([data-ct-pjax-style])").forEach(function (s) {
      s.setAttribute("data-ct-pjax-style", "1");
    });

    if (history.replaceState) {
      history.replaceState({ pjax: true, url: window.location.href }, "", window.location.href);
    }

    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest("a[href]");
      if (!a) return;
      if (a.hasAttribute("download") || a.hasAttribute("data-no-pjax")) return;
      var target = a.getAttribute("target");
      if (target && target !== "_self") return;
      var href = a.getAttribute("href");
      if (!canHandle(href)) return;

      e.preventDefault();
      navigate(href);
    });

    window.addEventListener("popstate", function () {
      if (!isAdminShellActive()) return;
      if (canHandle(window.location.href)) {
        navigate(window.location.href, { fromPopstate: true });
      } else {
        window.location.reload();
      }
    });
  }

  window.CTPjax = {
    navigate: navigate,
    refresh: refresh,
    canHandle: canHandle
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootPjax);
  } else {
    bootPjax();
  }
})(window, document);
