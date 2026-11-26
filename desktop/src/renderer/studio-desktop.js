/* CogniTara Studio — Production Electron Desktop Renderer
   Ported directly from the approved Studio design (studio.js) and wired to the
   real Electron IPC bridge (`window.cognitaraDesktop`), local Flask/Waitress engine,
   and 5-layer Windows licence vault. */
(function () {
  "use strict";

  var bridge = window.cognitaraDesktop || null;
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var win = $("#win");

  var state = {
    mode: "boot",
    theme: localStorage.getItem("ct-theme") || "light",
    server: "stopped",
    startedAt: 0,
    port: 5000,
    hostname: "cognitara",
    ip: "127.0.0.1",
    adapters: [],
    school: {
      school_name: "CogniTara School",
      school_motto: "Knowledge, Discipline, Excellence",
      academic_session: "2026/2027",
      current_term: "First Term"
    },
    logoDataUrl: null,
    license: null,
    telemetry: {},
    liveExams: [],
    attention: [],
    backups: [],
    cloudBackups: [],
    backupReminderDays: 7,
    backupReminderDismissed: false,
    backupDir: "C:\\ProgramData\\CogniTara\\Backups",
    settings: {
      theme: "light",
      startWithWindows: true,
      autoStartServer: false,
      port: 5000,
      lanOnly: true,
      backupSchedule: "30m",
      adminFullName: "",
      adminUsername: "superadmin"
    },
    onboardingComplete: false,
    devices: 0,
    writing: 0,
    samples: new Array(120).fill(0),
    stopArmed: false,
    version: "2.2.7",
    activeView: "home",
    cloudAccount: null,
    updateState: null
  };

  var themeColors = { accent: "#171614", line: "rgba(23, 22, 20, 0.08)", ok: "#171614" };
  var pulseDims = { w: 0, h: 0, dpr: 1 };

  /* ------------------------------------------------------------------ utils */
  function pad(n) { return String(n).padStart(2, "0"); }
  function nowHM() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function addr() { return "http://" + state.ip + ":" + state.port; }
  function localPortalUrl(path) { return "http://127.0.0.1:" + state.port + path; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDateShort(isoOrSec) {
    if (!isoOrSec) return "—";
    var d = typeof isoOrSec === "number" ? new Date(isoOrSec * 1000) : new Date(isoOrSec);
    if (isNaN(d.getTime())) return String(isoOrSec);
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtDateTime(sec) {
    if (!sec) return "—";
    var d = new Date(sec * 1000);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
      ", " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function fmtLeft(s) {
    var v = Math.max(0, Math.floor(s || 0));
    return pad(Math.floor(v / 60)) + ":" + pad(v % 60);
  }
  function fmtBytes(b) {
    var v = Math.max(0, Number(b || 0));
    if (v < 1024 * 1024) return (v / 1024).toFixed(0) + " KB";
    return (v / (1024 * 1024)).toFixed(1) + " MB";
  }
  function animate(dur, fn, done) {
    if (REDUCED) { fn(1); if (done) done(); return; }
    var t0 = performance.now();
    function ease(t) { return 1 - Math.pow(1 - t, 4); }
    (function tick(t) {
      var p = Math.min(1, (t - t0) / dur);
      fn(ease(p));
      if (p < 1) requestAnimationFrame(tick); else if (done) done();
    })(t0);
  }
  var toastTimer;
  function toast(msg) {
    var el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-on"); }, 3200);
  }
  function renderQr(host, text, draw) {
    if (!host || !window.CogniQR) return;
    try { host.innerHTML = window.CogniQR.toSvg(text); } catch (e) { host.textContent = ""; }
    if (draw && !REDUCED) { host.classList.remove("is-drawing"); void host.offsetWidth; host.classList.add("is-drawing"); }
  }
  function openExternalUrl(url) {
    if (bridge) bridge.openExternal(url).catch(function () {});
    else window.open(url, "_blank", "noopener");
  }

  /* ------------------------------------------------------------------ theme */
  function refreshThemeColors() {
    var css = getComputedStyle(document.documentElement);
    themeColors.accent = css.getPropertyValue("--accent").trim() || "#171614";
    themeColors.line = css.getPropertyValue("--line").trim() || "rgba(23,22,20,0.08)";
    themeColors.ok = css.getPropertyValue("--ok").trim() || "#171614";
  }
  function applyTheme(t, animated, persist) {
    var run = function () {
      state.theme = t;
      document.documentElement.setAttribute("data-theme", t);
      localStorage.setItem("ct-theme", t);
      refreshThemeColors();
      $$("#themeSeg button").forEach(function (b) { b.classList.toggle("is-active", b.dataset.t === t); });
      drawPulse(true);
      drawSpark(true);
      if (typeof stylePaystackBackdrop === "function") stylePaystackBackdrop();
      if (persist && bridge) {
        bridge.updateSettings({ theme: t }).catch(function () {});
      }
    };
    if (animated && document.startViewTransition && !REDUCED) document.startViewTransition(run); else run();
  }
  $("#themeBtn").addEventListener("click", function () {
    applyTheme(state.theme === "dark" ? "light" : "dark", true, true);
  });
  $$("#themeSeg button").forEach(function (b) {
    b.addEventListener("click", function () { applyTheme(b.dataset.t, true, true); });
  });

  /* ------------------------------------------------------------------ header */
  function setHeaderStatus(kind, text, sub) {
    var tb = $("#tbState"), txt = $(".tb-status__txt", tb);
    var changed = $("#tbStateText").textContent !== text;
    tb.dataset.state = kind;
    $("#tbStateText").textContent = text;
    $("#tbStateSub").textContent = sub;
    if (changed && !REDUCED) { txt.classList.remove("is-swap"); void txt.offsetWidth; txt.classList.add("is-swap"); }
  }
  function setProgress(frac) {
    var bar = $("#tbProgress");
    if (frac == null) {
      bar.classList.remove("is-on");
      setTimeout(function () { if (!bar.classList.contains("is-on")) bar.style.setProperty("--p", "0"); }, 350);
      return;
    }
    bar.classList.add("is-on");
    bar.style.setProperty("--p", String(Math.max(0, Math.min(1, frac))));
  }
  function playHeaderIn() {
    win.classList.remove("is-entering"); void win.offsetWidth; win.classList.add("is-entering");
    setTimeout(function () { win.classList.remove("is-entering"); }, 900);
  }
  var unread = 0;
  function bumpBell() {
    unread++;
    var b = $("#bellBadge");
    b.hidden = false;
    b.textContent = unread > 9 ? "9+" : String(unread);
    b.classList.remove("is-pop"); void b.offsetWidth; b.classList.add("is-pop");
    var btn = $("#bellBtn");
    btn.classList.remove("is-ring"); void btn.offsetWidth; btn.classList.add("is-ring");
  }
  $("#bellBtn").addEventListener("click", function () {
    unread = 0; $("#bellBadge").hidden = true;
    if (state.mode !== "app") { toast("Notifications appear here once setup is done"); return; }
    showView("activity");
  });
  $("#avatarBtn").addEventListener("click", function () {
    openCloudModal();
  });
  $("#tbSchoolBtn").addEventListener("click", function () {
    if (state.mode === "onboarding") {
      if (state.cloudAccount && state.cloudAccount.signedIn) goStep(2);
      else goStep(1);
    } else {
      showView("settings");
      var sec = $("#settingsSchoolSection");
      if (sec) sec.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
      var nameInp = $("#setSchoolName");
      if (nameInp) setTimeout(function () { nameInp.focus(); }, 220);
    }
  });
  function drawSpark(force) {
    if (document.hidden || state.mode !== "app") return;
    if (!force && state.server !== "running") return;
    var c = $("#tbSpark"); if (!c) return;
    var dpr = window.devicePixelRatio || 1, w = 56, h = 20;
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
    var ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var data = state.samples.slice(-28), max = Math.max(10, Math.max.apply(null, data) * 1.15);
    ctx.beginPath();
    data.forEach(function (v, i) {
      var x = i * (w / (data.length - 1));
      var y = h - 2 - (v / max) * (h - 4);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.strokeStyle = themeColors.ok; ctx.lineWidth = 1.5; ctx.lineJoin = "round"; ctx.stroke();
  }

  /* ------------------------------------------------------------------ modes */
  function setMode(mode) {
    var prev = state.mode;
    state.mode = mode;
    win.dataset.mode = mode;
    win.classList.remove("is-handoff");
    if (bridge) {
      bridge.setWindowMode(mode === "boot" ? "boot" : "studio").catch(function () {});
    }
    if (prev === "boot" && mode !== "boot") playHeaderIn();
    if (mode !== "onboarding") setProgress(null);
    if (mode === "app" && typeof checkBackupReminder === "function") checkBackupReminder();
  }

  /* ------------------------------------------------------------------ lock mapping */
  function mapLockKind(lic) {
    if (!lic || !lic.lock_state) return null;
    switch (lic.lock_state) {
      case "EXPIRED_LOCK":
      case "LEASE_EXPIRED_LOCK":
      case "DRAINING":
        return "expired";
      case "CLOCK_TAMPER_LOCK":
      case "HWID_MISMATCH_LOCK":
        return "clock";
      case "HQ_REVOKED_LOCK":
        return "revoked";
      default:
        return null;
    }
  }

  /* ------------------------------------------------------------------ boot */
  var bootTimers = [];
  function playBoot(next) {
    bootTimers.forEach(clearTimeout); bootTimers = [];
    setMode("boot");
    var boot = $("#boot");
    var word = $(".boot__word");
    var shift = ((word ? word.getBoundingClientRect().width : 160) + 22) / 2;
    $(".boot__symbol").style.setProperty("--shift", shift + "px");
    boot.classList.remove("is-playing"); void boot.offsetWidth; boot.classList.add("is-playing");

    var steps = [
      [180, 12, "Starting CogniTara"],
      [600, 34, "Checking your licence vault"],
      [1050, 58, "Opening exam records"],
      [1500, 80, "Finding your school network"],
      [1950, 94, "Preparing the control panel"],
      [2300, 100, "Ready"]
    ];
    steps.forEach(function (s) {
      bootTimers.push(setTimeout(function () {
        $("#bootBar").style.setProperty("--p", String(s[1] / 100));
        $("#bootPct").textContent = s[1] + "%";
        $("#bootText").textContent = s[2];
      }, REDUCED ? 0 : s[0]));
    });

    var bootstrapPromise = bridge
      ? bridge.getBootstrapState().catch(function () { return null; })
      : Promise.resolve(null);

    var minDelay = new Promise(function (resolve) {
      bootTimers.push(setTimeout(resolve, REDUCED ? 150 : 2700));
    });

    Promise.all([bootstrapPromise, minDelay]).then(function (results) {
      var data = results[0];
      if (data) applyBootstrapPayload(data);
      if (typeof next === "function") {
        next();
        return;
      }
      var lockKind = mapLockKind(state.license);
      if (lockKind) {
        showLock(lockKind, state.license);
      } else if (!state.onboardingComplete) {
        startOnboarding();
      } else {
        enterApp();
      }
    });
  }

  function applyBootstrapPayload(data) {
    if (data.version) {
      state.version = data.version;
      var verEl = $("#aboutVersion");
      if (verEl) verEl.textContent = "CogniTara Studio " + data.version;
    }
    if (data.settings) {
      state.settings = Object.assign({}, state.settings, data.settings);
      state.port = state.settings.port || 5000;
      state.backupDir = data.backupDir || state.settings.backupDir || state.backupDir;
      applyTheme(state.settings.theme || "light", false, false);
      syncSettingsUI();
    }
    if (data.adapters && data.adapters.length) {
      state.adapters = data.adapters;
      state.ip = (data.network && data.network.selectedLanIp) || state.adapters[0].ip;
    }
    if (data.network && data.network.hostname) {
      state.hostname = data.network.hostname;
    }
    if (data.school) {
      state.school = Object.assign({}, state.school, data.school);
      if (data.school.logo_data_url) {
        state.logoDataUrl = data.school.logo_data_url;
      }
      hydrateSchoolInputs();
      syncSchool();
      if (typeof syncSettingsSchoolUI === "function") syncSettingsSchoolUI();
    }
    if (data.license) {
      state.license = data.license;
      if (state.license.is_licensed) {
        activated = true;
      }
      if (state.license.display_hwid) {
        $("#pcId").textContent = state.license.display_hwid;
        $("#licHwid").textContent = state.license.display_hwid;
      }
    }
    if (data.telemetry) {
      state.telemetry = data.telemetry;
    }
    if (data.live) {
      state.liveExams = data.live.active_exams || [];
      state.attention = data.live.attention || [];
      state.writing = data.live.total_writing || 0;
    }
    if (Array.isArray(data.backups)) {
      state.backups = data.backups;
    }
    state.onboardingComplete = Boolean(data.onboardingComplete);
    if (data.serverStartedAt) state.startedAt = data.serverStartedAt;
    if (data.serverState) state.server = data.serverState;
    if (data.cloudAccount) state.cloudAccount = data.cloudAccount;
    if (data.updateState) state.updateState = data.updateState;
    if (typeof data.isMaximized === "boolean") syncMaximizedUi(data.isMaximized);

    syncSchool();
    syncAddr(false);
    paintLicence();
    renderBackups();
    renderLive();
    renderAttention();
    paintStats();
    renderCloudAccount(state.cloudAccount);
    if (state.updateState) renderUpdateState(state.updateState);
    if (state.settings.adminFullName) {
      $("#tbAvatar").textContent = initials(state.settings.adminFullName);
    }
  }

  /* ------------------------------------------------------------------ onboarding (6 steps incl. Cloud OTP) */
  var step = 0;
  var TOTAL_ONB_STEPS = 6; // steps 0..5, finish = 6
  var activated = false;
  var savingStep = false;
  var nextLabels = ["Get started", "Continue", "Continue", "Continue", "Continue", "Finish setup"];
  var etaText = [
    "About 3 minutes left",
    "About 2 minutes left",
    "About 2 minutes left",
    "About 2 minutes left",
    "About a minute left",
    "Almost done",
    "All done"
  ];

  $$(".kinetic").forEach(function (h) {
    var words = h.textContent.trim().split(/\s+/);
    h.setAttribute("aria-label", h.textContent.trim());
    h.innerHTML = words.map(function (w, i) {
      return "<span class='w' aria-hidden='true'><span style='--w:" + i + "'>" + esc(w) + "</span></span>";
    }).join(" ");
  });
  $$(".pane").forEach(function (p) {
    $$(".rv", p).forEach(function (k, i) { k.style.setProperty("--i", i); });
  });

  $("#schoolForm").addEventListener("submit", function (e) { e.preventDefault(); });
  $("#adminForm").addEventListener("submit", function (e) { e.preventDefault(); });

  // Inline Step 2: CogniTara Cloud Account + Brevo 6-Digit OTP Verification
  var onbPendingOtp = null;
  var onbResendTimer = null;

  function setOnbCloudMsg(errText, okText) {
    var errEl = $("#onbCloudErr"), okEl = $("#onbCloudOk");
    if (errEl) { errEl.hidden = !errText; errEl.textContent = errText || ""; }
    if (okEl) { okEl.hidden = !okText; okEl.textContent = okText || ""; }
  }

  function startOtpCountdown(btn, seconds, timerRefSetter) {
    if (!btn) return;
    var left = Math.max(5, Number(seconds || 45));
    btn.disabled = true;
    btn.textContent = "Resend in " + left + "s";
    var id = setInterval(function () {
      left--;
      if (left <= 0) {
        clearInterval(id);
        timerRefSetter(null);
        btn.disabled = false;
        btn.textContent = "Resend code";
      } else {
        btn.textContent = "Resend in " + left + "s";
      }
    }, 1000);
    timerRefSetter(id);
  }

  function switchOnbCloudTab(tab) {
    onbPendingOtp = null;
    if (onbResendTimer) { clearInterval(onbResendTimer); onbResendTimer = null; }
    if ($("#onbCloudTabs")) $("#onbCloudTabs").hidden = false;
    if ($("#onbOtpForm")) $("#onbOtpForm").hidden = true;
    $$("#onbCloudTabs button").forEach(function (b) { b.classList.toggle("is-active", b.dataset.octab === tab); });
    if ($("#onbSignUpForm")) $("#onbSignUpForm").hidden = tab !== "signup";
    if ($("#onbSignInForm")) $("#onbSignInForm").hidden = tab !== "signin";
    setOnbCloudMsg("", "");
  }

  function showOnbOtpStep(email, purpose, msg, challengeToken) {
    onbPendingOtp = { email: email, purpose: purpose || "signup_verify", challenge_token: challengeToken || "" };
    if ($("#onbCloudTabs")) $("#onbCloudTabs").hidden = true;
    if ($("#onbSignUpForm")) $("#onbSignUpForm").hidden = true;
    if ($("#onbSignInForm")) $("#onbSignInForm").hidden = true;
    if ($("#onbOtpForm")) $("#onbOtpForm").hidden = false;
    if ($("#onbOtpEmailLabel")) $("#onbOtpEmailLabel").textContent = email;
    if ($("#onbOtpCode")) {
      $("#onbOtpCode").value = "";
      setTimeout(function () { $("#onbOtpCode").focus(); }, 60);
    }
    setOnbCloudMsg("", msg || ("Enter the 6-digit verification code sent to " + email + "."));
    if (onbResendTimer) clearInterval(onbResendTimer);
    startOtpCountdown($("#onbOtpResendBtn"), 45, function (id) { onbResendTimer = id; });
  }

  function syncOnboardingCloudUi() {
    var s = state.cloudAccount;
    var isSignedIn = Boolean(s && s.signedIn && s.user);
    if ($("#onbCloudVerified")) $("#onbCloudVerified").hidden = !isSignedIn;
    if ($("#onbCloudForms")) $("#onbCloudForms").hidden = isSignedIn;
    if (isSignedIn) {
      var schoolName = (s.school && s.school.school_name) || state.school.school_name || "CogniTara School";
      if ($("#onbCvSchool")) $("#onbCvSchool").textContent = schoolName;
      if ($("#onbCvEmail")) $("#onbCvEmail").textContent = (s.user.email || "") + " · Email OTP verified";
      if ($("#onbCvName")) $("#onbCvName").textContent = s.user.full_name || "School Admin";
      if ($("#onbCvRef")) $("#onbCvRef").textContent = s.referralCode || "—";

      // Auto-populate Step 3 (school name) and Step 6 (admin full name) if still default/empty
      if ($("#fSchool") && schoolName && (!$("#fSchool").value.trim() || $("#fSchool").value.trim() === "CogniTara School")) {
        $("#fSchool").value = schoolName;
        syncSchool();
      }
      if ($("#fName") && s.user.full_name && !$("#fName").value.trim()) {
        $("#fName").value = s.user.full_name;
        $("#tbAvatar").textContent = initials(s.user.full_name);
      }
    }
    // Show 1-click "Use my Cloud licence" button in Step 4 if account already has an active cloud licence
    var cloudBtn = $("#licCloudBtn");
    if (cloudBtn) {
      var hasActiveLic = Boolean(
        isSignedIn &&
        Array.isArray(s.licenses) &&
        s.licenses.some(function (l) { return String(l.status || "").toLowerCase() === "active"; })
      );
      cloudBtn.hidden = !hasActiveLic || activated;
    }
    updateNext();
  }

  $$("#onbCloudTabs button").forEach(function (b) {
    b.addEventListener("click", function () { switchOnbCloudTab(b.dataset.octab); });
  });

  if ($("#onbOtpCode")) {
    $("#onbOtpCode").addEventListener("input", function () {
      this.value = this.value.replace(/\D/g, "").slice(0, 6);
    });
  }

  if ($("#onbSignUpForm")) {
    $("#onbSignUpForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      setOnbCloudMsg("", "");
      var btn = $("#ocuSubmitBtn");
      btn.disabled = true;
      btn.textContent = "Creating account & sending OTP…";
      try {
        var res = bridge
          ? await bridge.cloudSignUp({
              full_name: $("#ocuName").value.trim(),
              school_name: $("#ocuSchool").value.trim(),
              email: $("#ocuEmail").value.trim(),
              phone: $("#ocuPhone").value.trim(),
              password: $("#ocuPass").value,
              referral_code: $("#ocuRef").value.trim() || undefined
            })
          : { ok: false, message: "Cloud IPC requires CogniTara Studio desktop." };

        if (res && res.ok && res.otp_required) {
          showOnbOtpStep(res.email || $("#ocuEmail").value.trim(), res.purpose || "signup_verify", res.message, res.challenge_token);
        } else if (res && res.ok && res.session) {
          renderCloudAccount(res.session);
          setOnbCloudMsg("", "Cloud school account created and cached offline.");
          toast("CogniTara Cloud account verified!");
        } else {
          setOnbCloudMsg((res && res.message) || "Could not create account. Check your details and internet connection.", "");
        }
      } finally {
        btn.disabled = false;
        btn.textContent = "Create account & send OTP";
      }
    });
  }

  if ($("#onbSignInForm")) {
    $("#onbSignInForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      setOnbCloudMsg("", "");
      var btn = $("#ociSubmitBtn");
      btn.disabled = true;
      btn.textContent = "Signing in…";
      try {
        var res = bridge
          ? await bridge.cloudSignIn({
              email: $("#ociEmail").value.trim(),
              password: $("#ociPass").value
            })
          : { ok: false, message: "Cloud IPC requires CogniTara Studio desktop." };

        if (res && res.ok && res.otp_required) {
          showOnbOtpStep(res.email || $("#ociEmail").value.trim(), res.purpose || "signin_otp", res.message, res.challenge_token);
        } else if (res && res.ok && res.session) {
          renderCloudAccount(res.session);
          setOnbCloudMsg("", "Signed in and cached locally for offline exams.");
          toast("Signed in to CogniTara Cloud");
        } else {
          setOnbCloudMsg((res && res.message) || "Invalid email address or password.", "");
        }
      } finally {
        btn.disabled = false;
        btn.textContent = "Sign in & send OTP";
      }
    });
  }

  if ($("#onbOtpBackBtn")) {
    $("#onbOtpBackBtn").addEventListener("click", function () {
      switchOnbCloudTab(onbPendingOtp && onbPendingOtp.purpose === "signin_otp" ? "signin" : "signup");
    });
  }

  if ($("#onbOtpResendBtn")) {
    $("#onbOtpResendBtn").addEventListener("click", async function () {
      if (!onbPendingOtp || !bridge) return;
      var btn = $("#onbOtpResendBtn");
      btn.disabled = true;
      btn.textContent = "Sending…";
      var res = await bridge.cloudResendOtp(onbPendingOtp).catch(function () { return null; });
      if (res && res.ok) {
        if (res.challenge_token) onbPendingOtp.challenge_token = res.challenge_token;
        setOnbCloudMsg("", res.message || "Fresh 6-digit verification code sent.");
        startOtpCountdown(btn, 45, function (id) { onbResendTimer = id; });
      } else {
        setOnbCloudMsg((res && res.message) || "Please wait a moment before requesting another code.", "");
        startOtpCountdown(btn, (res && res.retry_after_sec) || 20, function (id) { onbResendTimer = id; });
      }
    });
  }

  if ($("#onbOtpForm")) {
    $("#onbOtpForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!onbPendingOtp) return;
      setOnbCloudMsg("", "");
      var code = ($("#onbOtpCode").value || "").replace(/\D/g, "").slice(0, 6);
      if (code.length !== 6) {
        setOnbCloudMsg("Enter the full 6-digit verification code from your email.", "");
        return;
      }
      var btn = $("#onbOtpVerifyBtn");
      btn.disabled = true;
      btn.textContent = "Verifying…";
      try {
        var res = bridge
          ? await bridge.cloudVerifyOtp({
              email: onbPendingOtp.email,
              purpose: onbPendingOtp.purpose,
              challenge_token: onbPendingOtp.challenge_token,
              code: code
            })
          : { ok: false, message: "Cloud IPC requires CogniTara Studio desktop." };
        if (res && res.ok && res.session) {
          onbPendingOtp = null;
          if (onbResendTimer) { clearInterval(onbResendTimer); onbResendTimer = null; }
          renderCloudAccount(res.session);
          setOnbCloudMsg("", "Email verified! You can continue to school setup.");
          toast("Email verified — CogniTara Cloud account active!");
          logEvent("licence", "ok", "i-shield", "<b>Cloud account verified via OTP</b> (" + esc(res.session.user.email) + ")");
        } else {
          setOnbCloudMsg((res && res.message) || "Invalid or expired 6-digit code. Try again or resend.", "");
        }
      } finally {
        btn.disabled = false;
        btn.textContent = "Verify Email & Continue";
      }
    });
  }

  if ($("#onbCloudSwitchBtn")) {
    $("#onbCloudSwitchBtn").addEventListener("click", async function () {
      if (bridge) {
        var res = await bridge.cloudSignOut().catch(function () { return null; });
        if (res && res.session) renderCloudAccount(res.session);
      } else {
        renderCloudAccount({ signedIn: false, offline: false });
      }
      switchOnbCloudTab("signup");
    });
  }

  function startOnboarding(initialStep) {
    setMode("onboarding");
    syncOnboardingCloudUi();
    goStep(typeof initialStep === "number" ? initialStep : 0);
  }
  function goStep(n) {
    var onb = $("#onb");
    onb.dataset.step = String(n);
    $$(".pane").forEach(function (p, i) {
      p.classList.toggle("is-active", i === n);
      p.classList.toggle("is-left", i < n);
    });
    $$("#onbSteps li").forEach(function (li, i) {
      li.classList.toggle("is-current", i === n);
      li.classList.toggle("is-done", i < n);
    });
    step = n;
    var items = $$("#onbSteps li"), cur = items[Math.min(n, TOTAL_ONB_STEPS - 1)];
    var fill = n >= TOTAL_ONB_STEPS ? 1 : n / (TOTAL_ONB_STEPS - 1);
    $("#onbRailFill").style.setProperty("--p", String(fill));
    var hl = $("#onbHl");
    hl.style.opacity = n >= TOTAL_ONB_STEPS ? "0" : "1";
    if (cur) hl.style.transform = "translate3d(0, " + cur.offsetTop + "px, 0)";
    $("#onbEta").style.strokeDashoffset = String(100 - (Math.min(n, TOTAL_ONB_STEPS) / TOTAL_ONB_STEPS) * 100);
    $("#onbEtaText").textContent = etaText[n] || "Almost done";
    setProgress(n >= TOTAL_ONB_STEPS ? 1 : (n + 1) / (TOTAL_ONB_STEPS + 1));
    setHeaderStatus(
      "setup",
      n >= TOTAL_ONB_STEPS ? "Setup complete" : "Setting up",
      n >= TOTAL_ONB_STEPS ? "Ready to start" : "Step " + (n + 1) + " of " + TOTAL_ONB_STEPS
    );
    $("#onbBack").style.visibility = n === 0 ? "hidden" : "visible";
    var num = $("#onbCountNum");
    num.textContent = String(Math.min(n + 1, TOTAL_ONB_STEPS));
    num.classList.remove("is-roll"); void num.offsetWidth; num.classList.add("is-roll");
    if (n < TOTAL_ONB_STEPS) $("#onbNextLabel").textContent = nextLabels[n];
    if (n === 0) runHallCount();
    if (n === 1) syncOnboardingCloudUi();
    if (n === 3) {
      syncOnboardingCloudUi();
      if (activated) paintActivatedVerify();
    }
    if (n === 4) scanNetwork();
    if (n === 5) scrambleCodes();
    if (n === 6) runFinish();
    updateNext();
  }

  var nextWasDisabled = false;
  function updateNext() {
    var ok = !savingStep;
    if (step === 1) ok = ok && Boolean(state.cloudAccount && state.cloudAccount.signedIn && state.cloudAccount.user);
    if (step === 2) ok = ok && $("#fSchool").value.trim().length > 1;
    if (step === 3) ok = ok && activated;
    if (step === 5) ok = ok && $("#fName").value.trim().length > 1 && $("#fUser").value.trim().length >= 3 && scorePass($("#fPass").value) >= 3 && $("#recSaved").checked;
    var btn = $("#onbNext");
    if (!btn) return;
    btn.disabled = !ok;
    if (ok && nextWasDisabled && !REDUCED) { btn.classList.remove("is-ready"); void btn.offsetWidth; btn.classList.add("is-ready"); }
    nextWasDisabled = !ok;
  }

  async function handleNextStep() {
    if (savingStep || step >= TOTAL_ONB_STEPS) return;
    if (step === 2 && bridge) {
      savingStep = true;
      updateNext();
      try {
        var res = await bridge.saveSchoolProfile({
          school_name: $("#fSchool").value.trim(),
          school_motto: $("#fMotto").value.trim(),
          academic_session: $("#fSession").value.trim(),
          current_term: $("#fTerm").value,
          logo_data_url: state.logoDataUrl
        });
        if (!res || !res.ok) {
          toast((res && res.error) ? "Could not save school profile: " + res.error : "Could not save school profile");
          return;
        }
      } finally {
        savingStep = false;
        updateNext();
      }
    }
    if (step === 3 && state.onboardingComplete && activated) {
      enterApp();
      toast("Licence verified — CogniTara Studio is ready.");
      return;
    }
    if (step === 5 && bridge) {
      savingStep = true;
      updateNext();
      try {
        var adminRes = await bridge.saveSuperAdmin({
          full_name: $("#fName").value.trim(),
          username: $("#fUser").value.trim(),
          password: $("#fPass").value,
          recovery_codes: recCodes
        });
        if (!adminRes || !adminRes.ok) {
          toast((adminRes && adminRes.error) ? "Could not create super admin: " + adminRes.error : "Could not create super admin");
          return;
        }
        state.settings.adminFullName = $("#fName").value.trim();
        state.settings.adminUsername = $("#fUser").value.trim();
      } finally {
        savingStep = false;
        updateNext();
      }
    }
    goStep(step + 1);
  }

  $("#onbNext").addEventListener("click", handleNextStep);
  $("#onbBack").addEventListener("click", function () { if (step > 0) goStep(step - 1); });
  $("#onbSteps").addEventListener("click", function (e) {
    var li = e.target.closest("li"); if (!li) return;
    var i = +li.dataset.step; if (i < step) goStep(i);
  });
  document.addEventListener("keydown", function (e) {
    if (state.mode !== "onboarding" || e.target.matches("input, select, textarea")) return;
    if (e.key === "ArrowRight" && !$("#onbNext").disabled && step < TOTAL_ONB_STEPS) handleNextStep();
    if (e.key === "ArrowLeft" && step > 0 && step < TOTAL_ONB_STEPS) goStep(step - 1);
  });

  // Step 1: hall capacity counter
  var hallTimer;
  function runHallCount() {
    clearInterval(hallTimer);
    var el = $("#hallCount"), devs = $$(".dev");
    devs.forEach(function (d) { d.classList.remove("is-on"); });
    setTimeout(function () {
      animate(1600, function (p) { el.textContent = String(Math.round(p * 300)); });
    }, REDUCED ? 0 : 900);
    var k = 0;
    hallTimer = setInterval(function () {
      if (step !== 0 || state.mode !== "onboarding") { clearInterval(hallTimer); return; }
      devs.forEach(function (d) { d.classList.remove("is-on"); });
      devs[k % devs.length].classList.add("is-on");
      devs[(k + 3) % devs.length].classList.add("is-on");
      k++;
    }, 700);
  }

  // Step 2: school profile
  function initials(name) {
    return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase() || "CT";
  }
  function flash(el) { if (REDUCED || !el) return; el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
  function hydrateSchoolInputs() {
    $("#fSchool").value = state.school.school_name || "CogniTara School";
    $("#fMotto").value = state.school.school_motto || "Knowledge, Discipline, Excellence";
    $("#fSession").value = state.school.academic_session || "2026/2027";
    $("#fTerm").value = state.school.current_term || "First Term";
  }
  function applySchoolCrestEverywhere(logoUrl, schoolName) {
    var ini = initials(schoolName || state.school.school_name || "CogniTara School");
    var mlCrest = $("#mlCrest");
    var tbCrest = $("#tbCrest");
    var mlInit = $("#mlInitials");
    if (logoUrl) {
      [mlCrest, tbCrest].forEach(function (c) {
        if (!c) return;
        c.style.backgroundImage = "url(" + logoUrl + ")";
        c.style.backgroundSize = "cover";
        c.style.backgroundPosition = "center";
      });
      if (mlInit) mlInit.textContent = "";
      if (tbCrest) tbCrest.textContent = "";
    } else {
      [mlCrest, tbCrest].forEach(function (c) {
        if (!c) return;
        c.style.backgroundImage = "";
      });
      if (mlInit) mlInit.textContent = ini;
      if (tbCrest) tbCrest.textContent = ini;
    }
    var setPrev = $("#setSchoolLogoPreview");
    var setImg = $("#setSchoolLogoImg");
    var setInit = $("#setSchoolLogoInitials");
    var setRem = $("#setSchoolLogoRemoveBtn");
    var setBtnTxt = $("#setSchoolLogoBtnText");
    if (setPrev) setPrev.classList.toggle("has-logo", Boolean(logoUrl));
    if (setImg) {
      if (logoUrl) {
        setImg.src = logoUrl;
        setImg.hidden = false;
      } else {
        setImg.removeAttribute("src");
        setImg.hidden = true;
      }
    }
    if (setInit) {
      setInit.textContent = ini;
      setInit.hidden = Boolean(logoUrl);
    }
    if (setRem) setRem.hidden = !logoUrl;
    if (setBtnTxt) setBtnTxt.textContent = logoUrl ? "Change logo" : "Upload logo";
  }

  function syncSchool(e) {
    var name = $("#fSchool").value.trim() || "Your school";
    var term = $("#fTerm").value + ", " + $("#fSession").value;
    state.school.school_name = name;
    state.school.school_motto = $("#fMotto").value.trim();
    state.school.academic_session = $("#fSession").value.trim();
    state.school.current_term = $("#fTerm").value;
    $("#mlSchool").textContent = name;
    $("#mlMotto").textContent = state.school.school_motto;
    $("#mlTerm").textContent = term;
    var ini = initials(name);
    if (!state.logoDataUrl && $("#mlInitials") && $("#mlInitials").textContent !== ini) {
      flash($("#mlCrest"));
    }
    applySchoolCrestEverywhere(state.logoDataUrl, name);
    $("#tbSchool").textContent = name;
    $("#tbTerm").textContent = term;
    $("#greetSchool").textContent = name;
    $("#greetTerm").textContent = term;
    $("#licSchool").textContent = (state.license && state.license.school_name) || name;
    if (e && e.target) {
      var map = { fSchool: "#mlSchool", fMotto: "#mlMotto", fSession: "#mlTerm", fTerm: "#mlTerm" };
      flash($(map[e.target.id]));
    }
    updateNext();
  }
  ["#fSchool", "#fMotto", "#fSession", "#fTerm"].forEach(function (s) { $(s).addEventListener("input", syncSchool); });
  $("#logoDrop").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#fLogo").click(); } });
  $("#logoDrop").tabIndex = 0;
  $("#fLogo").addEventListener("change", function () {
    var f = this.files && this.files[0]; if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      state.logoDataUrl = typeof reader.result === "string" ? reader.result : null;
      if (state.logoDataUrl) {
        applySchoolCrestEverywhere(state.logoDataUrl, $("#fSchool").value.trim());
        flash($("#mlCrest"));
        $("#logoDrop strong").textContent = f.name;
      }
    };
    reader.readAsDataURL(f);
  });
  (function tilt() {
    var stage = $("#tiltStage"), card = $("#tiltCard");
    if (!stage || REDUCED) return;
    var rect = null, rafId = 0, lastX = 0, lastY = 0;
    stage.addEventListener("mouseenter", function () { rect = stage.getBoundingClientRect(); });
    stage.addEventListener("mousemove", function (e) {
      if (!rect) rect = stage.getBoundingClientRect();
      lastX = (e.clientX - rect.left) / rect.width - 0.5;
      lastY = (e.clientY - rect.top) / rect.height - 0.5;
      if (!rafId) {
        rafId = requestAnimationFrame(function () {
          rafId = 0;
          card.style.setProperty("--ry", (lastX * 14).toFixed(2) + "deg");
          card.style.setProperty("--rx", (-lastY * 10).toFixed(2) + "deg");
        });
      }
    }, { passive: true });
    stage.addEventListener("mouseleave", function () {
      rect = null;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
    });
  })();

  // Step 3: real licence activation (key or signed .cgnlic file)
  var keyInput = $("#keyInput"), segBoxes = $$(".segkey__box"), lastRaw = "";
  function paintKey() {
    var raw = keyInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
    var focused = document.activeElement === keyInput;
    segBoxes.forEach(function (box, i) {
      var part = raw.slice(i * 4, i * 4 + 4), prev = lastRaw.slice(i * 4, i * 4 + 4);
      var html = part.split("").map(function (ch, j) { return j < prev.length && prev[j] === ch ? "<span>" + ch + "</span>" : "<span class='ch'>" + ch + "</span>"; }).join("");
      var activeIdx = Math.min(3, Math.floor(raw.length / 4));
      if (raw.length === 16) activeIdx = -1;
      if (i === activeIdx && focused) html += "<i class='caret'></i>";
      box.innerHTML = html;
      box.classList.toggle("is-active", i === activeIdx);
      var full = part.length === 4;
      if (full && prev.length !== 4) { box.classList.remove("is-full"); void box.offsetWidth; }
      box.classList.toggle("is-full", full);
    });
    lastRaw = raw;
    return raw;
  }
  keyInput.addEventListener("input", function () {
    var raw = keyInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
    keyInput.value = raw.replace(/(.{4})(?=.)/g, "$1-");
    paintKey();
    $("#activateBtn").disabled = raw.length !== 16 || activated;
  });
  keyInput.addEventListener("focus", function () { $("#segkey").classList.add("is-focus"); paintKey(); });
  keyInput.addEventListener("blur", function () { $("#segkey").classList.remove("is-focus"); paintKey(); });
  keyInput.addEventListener("keydown", function (e) { if (e.key === "Enter" && !$("#activateBtn").disabled) $("#activateBtn").click(); });

  function setVerifyResult(html) {
    var r = $("#verifyResult"); r.innerHTML = html;
    if (!REDUCED) { r.classList.remove("is-swap"); void r.offsetWidth; r.classList.add("is-swap"); }
  }

  function planDisplayName(tier) {
    if (tier === "trial") return "14-Day Trial";
    if (tier === "monthly") return "Monthly";
    if (tier === "lifetime") return "Lifetime";
    return "Annual";
  }

  function planActivatedLine(tier) {
    if (tier === "trial") return "14-day local evaluation bound to this PC. Protected by the 5-layer vault.";
    if (tier === "monthly") return "Renews monthly. Works offline for up to 7 days at a time.";
    if (tier === "lifetime") return "Never expires. Checks in with cognitara.net every 90 days.";
    return "Valid for 12 months. Works offline for up to 30 days at a time.";
  }

  function paintActivatedVerify() {
    var v = $("#verify"), arc = $("#verifyArc"), items = $$(".verify__list li", v);
    v.dataset.state = "done";
    arc.style.strokeDashoffset = "0";
    items.forEach(function (li) { li.className = "is-ok"; });
    $("#segkey").classList.add("is-done");
    var tier = (state.license && state.license.plan_tier) || "annual";
    setVerifyResult("<strong>" + esc(planDisplayName(tier)) + " active</strong><span>" + esc(planActivatedLine(tier)) + "</span>");
  }

  async function runRealActivation(mode) {
    var v = $("#verify"), arc = $("#verifyArc"), items = $$(".verify__list li", v);
    $("#activateBtn").disabled = true;
    if ($("#licTrialBtn")) $("#licTrialBtn").disabled = true;
    if ($("#licCloudBtn")) $("#licCloudBtn").disabled = true;
    v.dataset.state = "run";
    items.forEach(function (li) { li.className = ""; });
    items[0].className = "is-run";
    arc.style.strokeDashoffset = "66";
    setVerifyResult(
      mode === "file"
        ? "<span>Verifying signed licence file…</span>"
        : mode === "trial"
        ? "<span>Sealing 14-day hardware-bound trial vault…</span>"
        : mode === "cloud"
        ? "<span>Activating licence from your verified Cloud account…</span>"
        : "<span>Contacting cognitara.net…</span>"
    );

    var result;
    if (bridge) {
      if (mode === "file") {
        result = await bridge.importLicenseFile();
      } else if (mode === "trial") {
        result = await bridge.startTrialLicense($("#fSchool").value.trim());
      } else if (mode === "cloud") {
        result = await bridge.activateCloudLicense();
      } else {
        var fullKey = "CGNT-" + keyInput.value.trim();
        result = await bridge.activateLicenseKey(fullKey);
      }
    } else {
      result = { ok: false, error: "desktop_bridge_unavailable" };
    }

    if (result && result.canceled) {
      v.dataset.state = "idle";
      items.forEach(function (li) { li.className = ""; });
      arc.style.strokeDashoffset = "100";
      setVerifyResult("<span>Waiting for your key</span>");
      $("#activateBtn").disabled = paintKey().length !== 16;
      if ($("#licTrialBtn")) $("#licTrialBtn").disabled = false;
      if ($("#licCloudBtn")) $("#licCloudBtn").disabled = false;
      return;
    }

    if (result && result.ok && result.status) {
      state.license = result.status;
      activated = true;
      paintActivatedVerify();
      paintLicence();
      syncOnboardingCloudUi();
      updateNext();
      logEvent("licence", "ok", "i-shield", "<b>Licence activated</b> (" + esc(planDisplayName(state.license.plan_tier)) + ")");
      return;
    }

    v.dataset.state = "idle";
    items.forEach(function (li) { li.className = ""; });
    arc.style.strokeDashoffset = "100";
    var errMsg = (result && (result.message || result.error)) || "Activation failed. Check your key, import a .cgnlic file, or start a 14-day trial.";
    setVerifyResult("<strong style='color:var(--bad)'>Activation failed</strong><span>" + esc(errMsg) + "</span>");
    $("#activateBtn").disabled = paintKey().length !== 16;
    if ($("#licTrialBtn")) $("#licTrialBtn").disabled = false;
    if ($("#licCloudBtn")) $("#licCloudBtn").disabled = false;
    toast(errMsg);
  }

  $("#activateBtn").addEventListener("click", function () { runRealActivation("key"); });
  if ($("#licCloudBtn")) {
    $("#licCloudBtn").addEventListener("click", function () {
      if (!activated) runRealActivation("cloud");
    });
  }
  $("#licFileBtn").addEventListener("click", function () {
    if (!activated) runRealActivation("file");
  });
  if ($("#licTrialBtn")) {
    $("#licTrialBtn").addEventListener("click", function () {
      if (!activated) runRealActivation("trial");
    });
  }

  $$("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var el = $(b.dataset.copy); if (!el) return;
      var text = el.tagName === "OL"
        ? $$("li", el).map(function (li) { return li.textContent; }).join("\n")
        : el.textContent.trim();
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
      toast("Copied to clipboard");
    });
  });

  // Step 5: real LAN adapters + QR
  var scanned = false;
  function buildQr(host, text) {
    if (!host || !window.CogniQR) return;
    var m;
    try { m = window.CogniQR.encode(text); } catch (e) { host.textContent = ""; return; }
    var q = 2, size = m.length + q * 2, rects = [];
    var cx = m.length / 2;
    for (var r = 0; r < m.length; r++) for (var c = 0; c < m.length; c++) {
      if (!m[r][c]) continue;
      var d = REDUCED ? 0 : Math.round(Math.hypot(r - cx, c - cx));
      rects.push("<rect class='m' x='" + (c + q) + "' y='" + (r + q) + "' width='1.02' height='1.02' style='--d:" + d + "'/>");
    }
    host.innerHTML = "<svg viewBox='0 0 " + size + " " + size + "' shape-rendering='crispEdges' role='img' aria-label='QR code for " + esc(text) + "'><g fill='currentColor'>" + rects.join("") + "</g></svg>";
  }
  function scanNetwork() {
    var list = $("#netList"), frame = $("#qrFrame");
    if (scanned) return;
    scanned = true;
    frame.dataset.state = "scan";
    list.innerHTML = '<div class="net__scan" id="netScan"><i></i><span>Looking for networks on this computer…</span></div>';
    $("#onbQr").innerHTML = "";
    var adapters = state.adapters.length ? state.adapters : [
      { name: "School network (Wi-Fi / Ethernet)", ip: state.ip, recommended: true, muted: false, note: "Recommended" }
    ];
    adapters.forEach(function (a, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "adapter"; b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", a.ip === state.ip ? "true" : "false");
      b.innerHTML = "<i></i><span><strong>" + esc(a.name) + "</strong><code>" + esc(a.ip) + "</code></span><em class='" + (a.muted ? "is-muted" : "") + "'>" + esc(a.note) + "</em>";
      b.addEventListener("click", function () {
        $$(".adapter", list).forEach(function (x) { x.setAttribute("aria-checked", "false"); });
        b.setAttribute("aria-checked", "true");
        state.ip = a.ip;
        syncAddr(true);
        if (bridge) bridge.updateSettings({ selectedLanIp: a.ip }).catch(function () {});
      });
      list.appendChild(b);
      setTimeout(function () { b.classList.add("is-in"); }, REDUCED ? 0 : 600 + i * 180);
    });
    setTimeout(function () {
      var s = $("#netScan");
      if (s) {
        s.classList.add("is-done");
        s.querySelector("span").textContent = adapters.length + (adapters.length === 1 ? " network found" : " networks found");
      }
      frame.dataset.state = "done";
      buildQr($("#onbQr"), addr());
    }, REDUCED ? 0 : 800 + adapters.length * 180);
  }
  function syncAddr(draw) {
    $("#onbAddr").textContent = addr();
    $("#homeAddr").textContent = addr();
    $("#homeAltAddr").textContent = "http://" + state.hostname + ":" + state.port;
    if (draw) { buildQr($("#onbQr"), addr()); flash($("#onbAddr")); }
    renderQr($("#homeQr"), addr(), false);
  }

  // Step 6: super admin & recovery codes
  function scorePass(p) {
    var s = 0;
    if (p.length >= 10) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p) || p.length >= 16) s++;
    return p.length < 6 ? Math.min(s, 1) : s;
  }
  $("#fPass").addEventListener("input", function () {
    var s = scorePass(this.value);
    $("#meter").dataset.score = String(this.value ? Math.max(1, s) : 0);
    $("#meterText").textContent = !this.value ? "Enter a password" : ["Too weak", "Too weak", "Could be stronger", "Strong", "Very strong"][s];
    updateNext();
  });
  $("#fName").addEventListener("input", function () {
    var n = this.value.trim();
    $("#tbAvatar").textContent = n ? initials(n) : "SA";
    updateNext();
  });
  $("#fUser").addEventListener("input", updateNext);
  $("#recSaved").addEventListener("change", updateNext);

  var ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", recCodes = [];
  (function makeCodes() {
    var buf = new Uint32Array(64); crypto.getRandomValues(buf);
    for (var c = 0; c < 8; c++) {
      var s = "";
      for (var k = 0; k < 8; k++) { s += ALPHA[buf[c * 8 + k] % ALPHA.length]; if (k === 3) s += "-"; }
      recCodes.push(s);
    }
    $("#recCodes").innerHTML = recCodes.map(function (s) { return "<li>" + s + "</li>"; }).join("");
  })();
  var scrambled = false;
  function scrambleCodes() {
    if (scrambled || REDUCED) return;
    scrambled = true;
    var lis = $$("#recCodes li");
    lis.forEach(function (li, idx) {
      var target = recCodes[idx], frame = 0, settleAt = 14 + idx * 4;
      li.classList.add("is-scramble");
      setTimeout(function () {
        var t = setInterval(function () {
          frame++;
          var out = "";
          for (var k = 0; k < target.length; k++) {
            if (target[k] === "-") { out += "-"; continue; }
            out += frame > settleAt - (target.length - k) ? target[k] : ALPHA[Math.floor(Math.random() * ALPHA.length)];
          }
          li.textContent = out;
          if (frame >= settleAt) { clearInterval(t); li.textContent = target; li.classList.remove("is-scramble"); }
        }, 40);
      }, 450);
    });
  }
  $("#recDownload").addEventListener("click", function () {
    var text = "CogniTara super admin recovery codes\n" + $("#fSchool").value + "\n\n" +
      recCodes.map(function (c, i) { return (i + 1) + ". " + c; }).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "cognitara-recovery-codes.txt"; a.click();
    toast("Recovery codes saved");
  });

  function runFinish() {
    var tier = (state.license && state.license.plan_tier) || "annual";
    var cloudEmail = (state.cloudAccount && state.cloudAccount.user && state.cloudAccount.user.email) || "Verified";
    var rows = [
      ["i-check", "Cloud account verified", cloudEmail],
      ["i-home", "School profile", $("#fSchool").value.trim()],
      ["i-key", "Licence active", planDisplayName(tier) + " plan"],
      ["i-wifi", "Students connect at", addr()],
      ["i-shield", "Super admin", ($("#fName").value.trim() || "Super admin") + " (" + ($("#fUser").value.trim() || "superadmin") + ")"]
    ];
    var list = $("#finishList");
    list.innerHTML = rows.map(function (r) {
      return "<li><svg><use href='#" + r[0] + "'/></svg><span><strong>" + esc(r[1]) + "</strong><em>" + esc(r[2]) + "</em></span></li>";
    }).join("");
    $$("li", list).forEach(function (li, i) {
      setTimeout(function () { li.classList.add("is-in"); }, REDUCED ? 0 : 700 + i * 150);
    });
  }
  $("#finishBtn").addEventListener("click", async function () {
    if (bridge) {
      var finRes = await bridge.completeOnboarding({ selectedLanIp: state.ip }).catch(function () { return { ok: false, message: "Could not finish setup." }; });
      if (finRes && finRes.ok === false) {
        toast(finRes.message || "Please verify your CogniTara Cloud account before finishing setup.");
        if (finRes.error === "cloud_account_required") goStep(1);
        return;
      }
    }
    state.onboardingComplete = true;
    win.classList.add("is-handoff");
    setTimeout(function () {
      enterApp();
      playHeaderIn();
      toast("Setup complete. Start the server when you're ready.");
      logEvent("server", "accent", "i-check", "<b>Setup complete</b> for " + esc(state.school.school_name));
    }, REDUCED ? 0 : 600);
  });

  /* ------------------------------------------------------------------ app */
  function enterApp() {
    setMode("app");
    if (state.server === "locked") state.server = "stopped";
    setServer(state.server);
    showView("home");
    startTelemetryPolling();
    checkBackupReminder();
    refreshCloudBackups();
  }
  var returnFlow = null;
  function clearSubflow() {
    returnFlow = null;
    win.classList.remove("is-subflow");
    if ($("#billingReturnBtn")) $("#billingReturnBtn").hidden = true;
    if ($("#cloudReturnBtn")) $("#cloudReturnBtn").hidden = true;
  }
  function exitSubflow(fallbackView) {
    var rf = returnFlow;
    clearSubflow();
    if (rf) {
      if (rf.mode === "onboarding") {
        startOnboarding(typeof rf.step === "number" ? rf.step : 3);
        return;
      }
      if (rf.mode === "lock") {
        if (state.license && state.license.is_licensed) {
          if (state.onboardingComplete) enterApp();
          else startOnboarding(state.cloudAccount && state.cloudAccount.signedIn ? 2 : 1);
        } else {
          showLock(rf.lockKind || "expired", state.license);
        }
        return;
      }
    }
    showView(fallbackView || "licence");
  }
  function openFullScreenFlow(viewName) {
    if (state.mode !== "app") {
      if (!returnFlow) {
        returnFlow = {
          mode: state.mode,
          step: step,
          lockKind: ($("#lock") && $("#lock").dataset.kind) || "expired"
        };
      }
      win.classList.add("is-subflow");
      var backLabel = returnFlow.mode === "onboarding" ? "Back to setup" : "Back";
      if ($("#billingReturnBtn")) {
        $("#billingReturnBtn").hidden = false;
        if ($("#billingReturnLabel")) $("#billingReturnLabel").textContent = backLabel;
      }
      if ($("#cloudReturnBtn")) {
        $("#cloudReturnBtn").hidden = false;
        if ($("#cloudReturnLabel")) $("#cloudReturnLabel").textContent = backLabel;
      }
      setMode("app");
    } else {
      clearSubflow();
    }
    showView(viewName);
  }
  if ($("#billingReturnBtn")) $("#billingReturnBtn").addEventListener("click", function () { exitSubflow("licence"); });
  if ($("#cloudReturnBtn")) $("#cloudReturnBtn").addEventListener("click", function () { exitSubflow("home"); });

  function showView(name) {
    if (name !== "billing" && typeof closeActivePaystackSdk === "function") {
      closeActivePaystackSdk(false);
    }
    state.activeView = name;
    $$(".view").forEach(function (v) { v.classList.toggle("is-active", v.dataset.view === name); });
    $$("#railNav button").forEach(function (b) { b.classList.toggle("is-active", b.dataset.view === name); });
    moveIndicator();
    if (name === "home") { measurePulseCanvas(); drawPulse(true); }
    if (name === "licence") paintLicence();
    if (name === "backups") refreshBackups();
    if (name === "billing") {
      if (typeof warmPaystackSdk === "function") warmPaystackSdk();
      loadBillingPlansIfNeeded();
      renderBillingSummary();
    }
    if (name === "cloud") {
      renderCloudAccount(state.cloudAccount);
      loadMySchoolReview();
    }
  }
  function moveIndicator() {
    var act = $("#railNav button.is-active"), ind = $("#railInd");
    if (!act || !ind) return;
    var rail = act.closest(".rail").getBoundingClientRect(), r = act.getBoundingClientRect();
    if (!r.height) return;
    ind.style.transform = "translate3d(0, " + (r.top - rail.top + (r.height - 16) / 2) + "px, 0)";
  }
  window.addEventListener("resize", moveIndicator);
  $$("[data-view]").forEach(function (b) {
    if (b.tagName === "BUTTON") b.addEventListener("click", function () { clearSubflow(); showView(b.dataset.view); });
  });

  /* ---- command palette ---- */
  var COMMANDS = [
    { label: "Start or stop the server", icon: "i-power", hint: "Server", run: function () { enterAppIfNeeded(); toggleServer(); } },
    { label: "Go to Server", icon: "i-home", hint: "Page", run: function () { enterAppIfNeeded(); showView("home"); } },
    { label: "Go to Live exams", icon: "i-live", hint: "Page", run: function () { enterAppIfNeeded(); showView("live"); } },
    { label: "Go to Licence", icon: "i-key", hint: "Page", run: function () { enterAppIfNeeded(); showView("licence"); } },
    { label: "Buy or upgrade licence (Paystack / Voucher)", icon: "i-card", hint: "Billing", run: function () { openBillingModal("plans"); } },
    { label: "Back up locally now", icon: "i-backup", hint: "Backups", run: function () { if (state.mode !== "app") return; showView("backups"); setTimeout(function () { $("#backupBtn").click(); }, 250); } },
    { label: "Back up exam database to Cloud", icon: "i-backup", hint: "Cloud", run: function () { if (state.mode !== "app") return; showView("backups"); setTimeout(function () { if ($("#cloudBackupBtn")) $("#cloudBackupBtn").click(); }, 250); } },
    { label: "Cloud account & rate CogniTara Studio", icon: "i-star", hint: "Cloud", run: function () { openCloudModal(); } },
    { label: "Go to Activity", icon: "i-activity", hint: "Page", run: function () { enterAppIfNeeded(); showView("activity"); } },
    { label: "Go to Settings", icon: "i-settings", hint: "Page", run: function () { enterAppIfNeeded(); showView("settings"); } },
    { label: "Import former school database (exam.db)", icon: "i-backup", hint: "Migration", run: function () { enterAppIfNeeded(); showView("settings"); var s = $("#legacyMigrationSection"); if (s) s.scrollIntoView({ behavior: "smooth", block: "center" }); } },
    { label: "Check for CogniTara Studio updates", icon: "i-restore", hint: "Update", run: function () { enterAppIfNeeded(); showView("settings"); $("#setCheckUpdateBtn").click(); } },
    { label: "Copy student address", icon: "i-copy", hint: "Network", run: function () { if (navigator.clipboard) navigator.clipboard.writeText(addr()).catch(function () {}); toast("Copied " + addr()); } },
    { label: "Open admin portal in browser", icon: "i-external", hint: "Portal", run: function () { openPortal("/login"); } },
    { label: "Switch light or dark theme", icon: "i-sun", hint: "Appearance", run: function () { applyTheme(state.theme === "dark" ? "light" : "dark", true, true); } },
    { label: "Check licence with cognitara.net", icon: "i-shield", hint: "Licence", run: function () { enterAppIfNeeded(); showView("licence"); $("#checkInBtn").click(); } }
  ];
  function enterAppIfNeeded() {
    if (state.mode === "onboarding" || state.mode === "lock" || state.mode === "boot") return;
    clearSubflow();
    if (state.mode !== "app") enterApp();
  }
  var palSel = 0, palItems = [];
  function openPalette() {
    if (state.mode !== "app") return;
    if (typeof setPaystackOverlaySuspended === "function") setPaystackOverlaySuspended(true);
    $("#palette").hidden = false; $("#palInput").value = ""; filterPalette(); $("#palInput").focus();
  }
  function closePalette() {
    $("#palette").hidden = true;
    if (typeof setPaystackOverlaySuspended === "function") setPaystackOverlaySuspended(false);
  }
  function filterPalette() {
    var q = $("#palInput").value.trim().toLowerCase();
    palItems = COMMANDS.filter(function (c) { return !q || c.label.toLowerCase().indexOf(q) > -1 || c.hint.toLowerCase().indexOf(q) > -1; });
    palSel = 0; paintPalette();
  }
  function paintPalette() {
    $("#palList").innerHTML = palItems.length ? palItems.map(function (c, i) {
      return "<li role='option' data-i='" + i + "' class='" + (i === palSel ? "is-sel" : "") + "'><svg><use href='#" + c.icon + "'/></svg>" + esc(c.label) + "<em>" + esc(c.hint) + "</em></li>";
    }).join("") : "<li>No matching commands</li>";
  }
  function runPal(i) { var c = palItems[i]; closePalette(); if (c) c.run(); }
  $("#searchBtn").addEventListener("click", openPalette);
  $("#palInput").addEventListener("input", filterPalette);
  $("#palInput").addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { palSel = Math.min(palItems.length - 1, palSel + 1); paintPalette(); e.preventDefault(); }
    if (e.key === "ArrowUp") { palSel = Math.max(0, palSel - 1); paintPalette(); e.preventDefault(); }
    if (e.key === "Enter") runPal(palSel);
  });
  $("#palList").addEventListener("click", function (e) { var li = e.target.closest("[data-i]"); if (li) runPal(+li.dataset.i); });
  $("#palette").addEventListener("mousedown", function (e) { if (e.target.id === "palette") closePalette(); });
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if ($("#palette").hidden) openPalette(); else closePalette(); }
    if (e.key === "Escape" && !$("#palette").hidden) closePalette();
  });

  (function greet() {
    var h = new Date().getHours();
    $("#greetHello").textContent = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  })();

  /* ---- portal links ---- */
  function openPortal(path) {
    if (state.server !== "running") {
      toast("Start the server first to open the portal");
      return;
    }
    openExternalUrl(localPortalUrl(path));
  }
  $("#portalAdmin").addEventListener("click", function (e) { e.preventDefault(); openPortal("/login"); });
  $("#portalStudent").addEventListener("click", function (e) { e.preventDefault(); openPortal("/login"); });
  $("#portalCe").addEventListener("click", function (e) { e.preventDefault(); openPortal("/ce_login"); });
  $("#supportLink").addEventListener("click", function (e) { e.preventDefault(); openExternalUrl("mailto:support@cognitara.net"); });
  $("#buyLicLink").addEventListener("click", function (e) { e.preventDefault(); openBillingModal("plans"); });
  $("#renewLicBtn").addEventListener("click", function (e) { e.preventDefault(); openBillingModal("plans"); });
  if ($("#onbBuyBtn")) $("#onbBuyBtn").addEventListener("click", function () { openBillingModal("plans"); });
  if ($("#onbCloudLink")) $("#onbCloudLink").addEventListener("click", function (e) { e.preventDefault(); openCloudModal("signup"); });
  if ($("#licRedeemBtn")) $("#licRedeemBtn").addEventListener("click", function () { openBillingModal("redeem"); });

  /* ---- server lifecycle (real IPC) ---- */
  var core = $("#core");
  function setServer(s) {
    state.server = s;
    core.dataset.state = s;
    var labels = { stopped: "Server stopped", starting: "Starting…", running: "Server running", stopping: "Stopping…", locked: "Locked" };
    var subs = { stopped: "Ready when you are", starting: "Checking licence", running: state.ip + ":" + state.port, stopping: "Saving answers", locked: "See details" };
    if (state.mode === "app" || state.mode === "boot") setHeaderStatus(s, labels[s], subs[s]);
    $("#connect").dataset.state = s === "running" ? "on" : "off";
    var btn = $("#startBtn");
    btn.querySelector("span").textContent = s === "running" ? "Stop server" : s === "starting" ? "Starting…" : s === "stopping" ? "Stopping…" : "Start server";
    btn.disabled = s === "starting" || s === "stopping";
    $("#dial").setAttribute("aria-label", s === "running" ? "Stop server" : "Start server");
    var title = $("#coreTitle"), sub = $("#coreSub");
    var chip = { stopped: "Offline", starting: "Starting", running: "Online", stopping: "Stopping", locked: "Locked" };
    $("#coreStatus span").textContent = chip[s] || "Offline";
    if (s === "stopped") { title.textContent = "Server is off"; sub.textContent = "Students can't connect yet. Start the server when you're ready for exams."; $("#coreArc").style.strokeDashoffset = "100"; }
    if (s === "starting") { title.textContent = "Starting the server"; sub.textContent = "Verifying licence and opening exam database…"; }
    if (s === "running") { title.textContent = "Server is running"; sub.textContent = "Students on the school network can sign in now."; $("#coreArc").style.strokeDashoffset = "0"; }
    if (s === "stopping") { title.textContent = "Stopping the server"; sub.textContent = "Saving every open answer first."; }
    paintStats();
    renderLive();
  }

  async function startServer() {
    if (state.server !== "stopped") return;
    setServer("starting");
    var arc = $("#coreArc"), stepEl = $("#coreStep");
    stepEl.textContent = "Checking licence vault…";
    setProgress(0.35);
    arc.style.strokeDashoffset = "55";

    if (!bridge) {
      // Headless visual preview fallback
      state.startedAt = Date.now();
      setProgress(null);
      setServer("running");
      stepEl.textContent = "";
      logEvent("server", "ok", "i-power", "<b>Server started</b> at " + esc(addr()));
      return;
    }

    var res = await bridge.startServer().catch(function (err) { return { ok: false, error: String(err) }; });
    setProgress(null);
    stepEl.textContent = "";

    if (res && res.ok) {
      state.startedAt = Date.now();
      if (res.license) state.license = res.license;
      setServer("running");
      logEvent("server", "ok", "i-power", "<b>Server started</b> at " + esc(addr()));
      pollTelemetryNow();
      return;
    }

    if (res && res.license) {
      state.license = res.license;
      var lockKind = mapLockKind(res.license);
      if (lockKind) {
        showLock(lockKind, res.license);
        return;
      }
    }
    setServer("stopped");
    toast("Could not start server: " + ((res && res.error) || "unknown error"));
    logEvent("server", "warn", "i-alert", "<b>Server start blocked</b> (" + esc((res && res.error) || "error") + ")");
  }

  async function stopServer() {
    if (state.server !== "running") return;
    if (state.writing > 0 && !state.stopArmed) {
      state.stopArmed = true;
      $("#coreStep").textContent = state.writing + " students are writing. Click again to stop; their answers are saved and they can resume later.";
      setTimeout(function () { state.stopArmed = false; if (state.server === "running") $("#coreStep").textContent = ""; }, 4500);
      return;
    }
    state.stopArmed = false;
    setServer("stopping");
    $("#coreStep").textContent = "Saving open answers…";

    if (bridge) {
      await bridge.stopServer().catch(function () {});
    }
    setServer("stopped");
    $("#coreStep").textContent = "";
    state.startedAt = 0;
    state.devices = 0;
    state.writing = 0;
    state.liveExams = [];
    renderLive();
    paintStats();
    logEvent("server", "", "i-power", "<b>Server stopped</b>. All answers were saved.");
  }

  function toggleServer() {
    if (state.server === "running") stopServer();
    else if (state.server === "stopped") startServer();
  }
  $("#startBtn").addEventListener("click", toggleServer);
  $("#dial").addEventListener("click", toggleServer);

  /* ---- live telemetry polling & 1-second UI tick ---- */
  var pollTimer = null;
  async function pollTelemetryNow() {
    if (!bridge) return;
    var res = await bridge.getTelemetry().catch(function () { return null; });
    if (!res || !res.ok) return;

    if (res.serverState && res.serverState !== state.server && state.server !== "starting" && state.server !== "stopping") {
      setServer(res.serverState);
    }
    if (res.serverStartedAt) state.startedAt = res.serverStartedAt;
    if (res.telemetry) state.telemetry = res.telemetry;
    if (res.live) {
      state.liveExams = res.live.active_exams || [];
      state.attention = res.live.attention || [];
      state.writing = res.live.total_writing || 0;
      state.devices = state.server === "running" ? Math.max(state.writing, state.writing > 0 ? state.writing + 1 : 0) : 0;
    }
    if (res.license) {
      state.license = res.license;
      var lk = mapLockKind(res.license);
      if (lk && state.mode === "app") {
        showLock(lk, res.license);
      }
      if (state.mode === "lock" && res.license.lock_state === "DRAINING") {
        drainLeft = Math.max(0, Number(res.license.drain_remaining_seconds || 0));
        $("#drainCount").textContent = String(res.license.active_exams_count || 0);
      }
    }
    renderLive();
    renderAttention();
    paintStats();
    paintLicence();
  }

  function startTelemetryPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTelemetryNow();
    pollTimer = setInterval(pollTelemetryNow, 2500);
  }

  setInterval(function () {
    if (state.server === "running" && state.startedAt > 0) {
      var s = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
      $("#stUptime").textContent = pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
      $("#stUptimeSub").textContent = "Since " + new Date(state.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      var rate = state.writing > 0 ? state.writing * 0.8 + 1.5 : 0.8;
      state.samples.push(rate);
    } else {
      state.samples.push(0);
    }
    state.samples.shift();
    drawPulse();
    drawSpark();
    var perMin = Math.round(state.samples.slice(-60).reduce(function (a, b) { return a + b; }, 0));
    $("#pulseRate").textContent = perMin.toLocaleString() + " requests/min";
    core.style.setProperty("--beat", Math.max(900, 2600 - state.writing * 22) + "ms");
    if (drainLeft > 0 && state.mode === "lock") tickDrain();
  }, 1000);

  function paintStats() {
    $("#stDevices").textContent = String(state.devices);
    $("#stDevicesSub").textContent = state.server === "running" ? "On the school network" : "Server is off";
    var running = state.liveExams.length;
    $("#stExams").textContent = String(running);
    $("#stWriting").textContent = String(state.writing);
    var counts = (state.telemetry && state.telemetry.counts) || {};
    var pub = (counts.exams || 0) + (counts.ce_exams || 0);
    $("#stPublished").textContent = pub + " published";
    $("#stRegistered").textContent = (counts.approved_students || 0) + " registered";
    if (state.server !== "running") {
      $("#stUptime").textContent = "00:00:00";
      $("#stUptimeSub").textContent = "Not started";
    }
    var badge = $("#liveBadge");
    badge.hidden = running === 0;
    badge.textContent = String(running);
  }

  function renderLive() {
    var wrap = $("#liveTable").parentElement;
    var active = state.liveExams || [];
    wrap.classList.toggle("is-empty", active.length === 0);
    $("#liveSub").textContent = state.server !== "running"
      ? "Start the server to see exams in progress."
      : active.length
      ? active.length + " exam" + (active.length > 1 ? "s" : "") + " in progress, " + state.writing + " students writing."
      : "Waiting for students to start.";
    var tb = $("#liveTable tbody");
    var html = active.map(function (e, i) {
      var warnPill = e.warnings ? "<span class='pill pill--warn'>" + e.warnings + "</span>" : "<span class='pill'>0</span>";
      var leftPill = (e.left_seconds || 0) < 300 ? "pill pill--warn" : "pill";
      return "<tr><td><strong>" + esc(e.name) + "</strong><em>" + (e.exam_type === "common_entrance" ? "Common Entrance" : "School exam") + "</em></td>" +
        "<td>" + esc(e.class) + "</td><td class='mono'>" + e.writing + " / " + e.total + "</td>" +
        "<td><div class='prog'><i style='width:" + Number(e.progress || 0).toFixed(1) + "%'></i></div></td>" +
        "<td>" + warnPill + "</td><td><span class='" + leftPill + " mono'>" + fmtLeft(e.left_seconds) + "</span></td>" +
        "<td><div class='row-actions'><button class='btn btn--ghost btn--sm' data-add='" + i + "'><svg><use href='#i-plus'/></svg>5 min</button></div></td></tr>";
    }).join("");
    if (tb.dataset.sig !== html) { tb.innerHTML = html; tb.dataset.sig = html; }
  }

  $("#liveTable").addEventListener("click", async function (e) {
    var b = e.target.closest("[data-add]"); if (!b) return;
    var ex = state.liveExams[+b.dataset.add];
    if (!ex) return;
    if (bridge) {
      var res = await bridge.extendExam(ex.exam_id, ex.exam_type, 5).catch(function () { return null; });
      if (!res || !res.ok) { toast("Could not extend exam time"); return; }
      pollTelemetryNow();
    } else {
      ex.left_seconds = (ex.left_seconds || 0) + 300;
      renderLive();
    }
    toast("Added 5 minutes to " + ex.name);
    logEvent("exam", "accent", "i-clock", "<b>+5 minutes</b> added to " + esc(ex.name));
  });

  $("#pauseAllBtn").addEventListener("click", async function () {
    if (state.server !== "running" || !state.writing) { toast("No exams are running"); return; }
    if (bridge) {
      var res = await bridge.pauseAllExams().catch(function () { return null; });
      if (!res || !res.ok) { toast("Could not pause active exams"); return; }
      pollTelemetryNow();
    }
    toast("All exams paused. Students see a waiting screen.");
    logEvent("exam", "warn", "i-pause", "<b>All exams paused</b> by super admin");
  });

  function renderAttention() {
    var host = $("#attention");
    var items = state.attention || [];
    if (!items.length) {
      host.innerHTML = "<li class='is-empty'>Nothing needs your attention.</li>";
      return;
    }
    host.innerHTML = items.map(function (it, idx) {
      return "<li data-idx='" + idx + "'><svg><use href='#i-alert'/></svg><span><strong>" + esc(it.student_name) + "</strong><em>" + esc(it.detail) + "</em></span>" +
        (it.can_resume
          ? "<button class='btn btn--ghost btn--sm' data-resume='" + idx + "'>Resume</button>"
          : "<button class='btn btn--ghost btn--sm' data-dismiss='" + idx + "'>Dismiss</button>") +
        "</li>";
    }).join("");
  }

  $("#attention").addEventListener("click", async function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.hasAttribute("data-resume")) {
      var item = state.attention[+b.dataset.resume];
      if (item && bridge) {
        await bridge.resumeAttempt(item.attempt_id, item.exam_type).catch(function () {});
        pollTelemetryNow();
      }
      if (item) {
        toast("Exam resumed for " + item.student_name);
        logEvent("exam", "ok", "i-check", "<b>Exam resumed</b> for " + esc(item.student_name));
      }
    } else if (b.hasAttribute("data-dismiss")) {
      var idx = +b.dataset.dismiss;
      state.attention.splice(idx, 1);
      renderAttention();
    }
  });

  /* ---- pulse canvas (60fps: cached dimensions & colors, painted only when visible) ---- */
  function measurePulseCanvas() {
    var c = $("#pulseCanvas"); if (!c) return;
    var w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
    if (w > 0 && h > 0) {
      pulseDims.w = w; pulseDims.h = h; pulseDims.dpr = dpr;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
    }
  }
  function drawPulse(force) {
    if (document.hidden) return;
    if (!force && (state.mode !== "app" || state.activeView !== "home")) return;
    var c = $("#pulseCanvas"); if (!c) return;
    if (!pulseDims.w) measurePulseCanvas();
    var w = pulseDims.w, h = pulseDims.h, dpr = pulseDims.dpr;
    if (!w || !h) return;
    var ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var line = themeColors.accent;
    ctx.strokeStyle = themeColors.line; ctx.lineWidth = 1;
    for (var g = 1; g < 3; g++) {
      ctx.beginPath(); ctx.moveTo(0, Math.round(h * g / 3) + 0.5); ctx.lineTo(w, Math.round(h * g / 3) + 0.5); ctx.stroke();
    }
    var max = Math.max(20, Math.max.apply(null, state.samples) * 1.2);
    var n = state.samples.length, stepX = w / (n - 1);
    ctx.beginPath();
    state.samples.forEach(function (v, i) {
      var x = i * stepX, y = h - 2 - (v / max) * (h - 8);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.strokeStyle = line; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke();
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, line + "33"); grad.addColorStop(1, line + "00");
    ctx.fillStyle = grad; ctx.fill();
  }
  window.addEventListener("resize", function () { measurePulseCanvas(); drawPulse(true); });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && state.mode === "app") { drawPulse(true); drawSpark(true); }
  });

  /* ---- events ---- */
  var events = [];
  function logEvent(cat, tone, icon, html) {
    events.unshift({ t: nowHM(), cat: cat, tone: tone, icon: icon, html: html });
    events = events.slice(0, 80);
    renderEvents(true);
    if (tone === "warn" || cat === "backup" || cat === "licence") bumpBell();
  }
  function evHtml(e, isNew) {
    return "<li class='" + (isNew ? "is-new" : "") + "' data-tone='" + e.tone + "' data-cat='" + e.cat + "'><time>" + e.t + "</time><svg><use href='#" + e.icon + "'/></svg><span>" + e.html + "</span></li>";
  }
  var actFilter = "all";
  function renderEvents(fresh) {
    $("#homeEvents").innerHTML = events.slice(0, 4).map(function (e, i) { return evHtml(e, fresh && i === 0); }).join("");
    var list = events.filter(function (e) { return actFilter === "all" || e.cat === actFilter; });
    $("#actList").innerHTML = list.length
      ? list.map(function (e) { return evHtml(e, false); }).join("")
      : "<li><time></time><span></span><span>No activity in this category yet.</span></li>";
  }
  $$("#actFilter button").forEach(function (b) {
    b.addEventListener("click", function () {
      actFilter = b.dataset.f;
      $$("#actFilter button").forEach(function (x) { x.classList.toggle("is-active", x === b); });
      renderEvents(false);
    });
  });
  logEvent("server", "", "i-check", "<b>CogniTara Studio opened</b>");

  /* ---- licence panel ---- */
  function paintLicence() {
    var lic = state.license;
    if (!lic) {
      $("#licPlan").textContent = "Not activated";
      $("#licDays").textContent = "—";
      $("#licDaysLabel").textContent = "no active licence";
      $("#railPlan").textContent = "Unactivated";
      $("#railDays").textContent = "Activate licence";
      $("#railRing").style.strokeDashoffset = "100";
      return;
    }

    var tier = lic.plan_tier || "annual";
    var planName = planDisplayName(tier);
    var isLifetime = tier === "lifetime";
    var days = lic.days_remaining;
    var total = lic.total_days || (tier === "trial" ? 14 : tier === "monthly" ? 30 : 365);
    var frac = isLifetime ? 1 : (days != null && total > 0 ? Math.max(0, Math.min(1, days / total)) : 0);

    $("#licPlan").textContent = lic.is_licensed ? planName : "Not activated";
    $("#licSchool").textContent = lic.school_name || state.school.school_name;
    $("#licExp").textContent = isLifetime ? "Never" : fmtDateShort(lic.expires_at);
    if (lic.display_hwid) {
      $("#licHwid").textContent = lic.display_hwid;
      $("#pcId").textContent = lic.display_hwid;
    }
    $("#licCheck").textContent = lic.last_heartbeat_utc ? fmtDateTime(lic.last_heartbeat_utc) : "Not yet checked in";

    if (lic.lease_remaining_seconds != null && lic.now_utc) {
      var leaseDue = lic.now_utc + Math.max(0, lic.lease_remaining_seconds);
      var leaseNote = tier === "trial" ? "14-day local evaluation bound to this PC"
        : tier === "monthly" ? "works offline for 7 days at a time"
        : tier === "lifetime" ? "check in every 90 days to stay active"
        : "works offline for 30 days at a time";
      $("#licLease").innerHTML = esc(fmtDateShort(leaseDue)) + " <em>" + esc(leaseNote) + "</em>";
    } else {
      $("#licLease").textContent = "—";
    }

    $("#licDays").textContent = isLifetime ? "∞" : (days != null ? String(days) : "—");
    $("#licDaysLabel").textContent = isLifetime ? "never expires" : (days != null ? "days left of " + total : "no active licence");

    var arc = $("#licArc");
    arc.style.transition = "none"; arc.style.strokeDashoffset = "100"; void arc.getBoundingClientRect();
    arc.style.transition = ""; arc.style.strokeDashoffset = String(100 - frac * 100);

    $("#railPlan").textContent = lic.is_licensed ? (tier === "trial" ? "14-Day Trial" : planName + " plan") : "Unactivated";
    $("#railDays").textContent = isLifetime ? "Never expires" : (days != null ? days + " days left" : "Activate now");
    $("#railRing").style.strokeDashoffset = String(100 - frac * 100);

    $("#checkSig").classList.toggle("is-bad", lic.lock_state === "HQ_REVOKED_LOCK");
    $("#checkPc").classList.toggle("is-bad", lic.lock_state === "HWID_MISMATCH_LOCK");
    $("#checkClock").classList.toggle("is-bad", lic.lock_state === "CLOCK_TAMPER_LOCK");
  }

  $("#checkInBtn").addEventListener("click", async function () {
    var btn = this;
    btn.disabled = true;
    try {
      if (!bridge) { toast("Checked in with cognitara.net"); return; }
      var res = await bridge.checkInLicense();
      if (res && res.status) {
        state.license = res.status;
        paintLicence();
      }
      if (res && res.ok) {
        toast("Checked in with cognitara.net. Licence is active.");
        logEvent("licence", "ok", "i-shield", "<b>Licence checked</b> with cognitara.net");
      } else if (res && res.revoked) {
        showLock("revoked", res.status || state.license);
      } else {
        toast("Could not reach cognitara.net — continuing on offline lease.");
        logEvent("licence", "warn", "i-alert", "<b>Check-in unreachable</b>. Offline lease remains active.");
      }
    } finally {
      btn.disabled = false;
    }
  });

  $("#licImportBtn").addEventListener("click", async function () {
    if (!bridge) return;
    var res = await bridge.importLicenseFile();
    if (res && res.canceled) return;
    if (res && res.ok && res.status) {
      state.license = res.status;
      paintLicence();
      toast("Licence file imported and verified.");
      logEvent("licence", "ok", "i-shield", "<b>Licence file imported</b> and verified");
    } else {
      toast((res && (res.message || res.error)) || "Invalid licence file");
    }
  });

  /* ---- backups (real hot SQLite backups + CogniTara Cloud snapshots) ---- */
  function renderBackups() {
    $("#bkDirPath").textContent = state.backupDir;
    var tbody = $("#bkTable tbody");
    if (!state.backups.length) {
      tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;color:var(--ink-3);padding:24px'>No local backups yet. Click Local backup to create a verified copy.</td></tr>";
      return;
    }
    tbody.innerHTML = state.backups.map(function (b, i) {
      return "<tr><td><strong>" + esc(b.created_label) + "</strong><em class='mono'>" + esc(b.filename) + "</em></td>" +
        "<td>" + esc(b.type) + "</td><td class='mono'>" + esc(b.size_label) + "</td>" +
        "<td><span class='pill pill--ok'>" + (b.verified ? "Verified" : "Unchecked") + "</span></td>" +
        "<td><div class='row-actions'>" +
        "<button class='btn btn--ghost btn--sm' data-restore='" + i + "'><svg><use href='#i-restore'/></svg>Restore</button>" +
        "<button class='btn btn--ghost btn--sm' data-del-local='" + i + "' style='color:var(--bad)'>Delete</button>" +
        "</div></td></tr>";
    }).join("");
  }

  function renderCloudBackups() {
    var table = $("#cloudBkTable");
    if (!table) return;
    var tbody = table.querySelector("tbody");
    var meta = $("#cloudBkMeta");
    var days = Number(state.backupReminderDays || 7);
    if (meta) {
      meta.textContent = days > 0 ? ("Reminder every " + days + " day" + (days === 1 ? "" : "s")) : "Reminders paused by HQ";
    }
    var signedIn = Boolean(state.cloudAccount && state.cloudAccount.signedIn);
    if (!signedIn) {
      tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;color:var(--ink-3);padding:18px'>Sign in to CogniTara Cloud to sync encrypted exam database backups.</td></tr>";
      return;
    }
    if (!state.cloudBackups.length) {
      tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;color:var(--ink-3);padding:18px'>No cloud backups yet. Click <b>Back up to Cloud</b> above to safeguard your exams, questions, and results online.</td></tr>";
      return;
    }
    tbody.innerHTML = state.cloudBackups.map(function (b) {
      var statsText = (b.exams_count || 0) + " exams · " + (b.questions_count || 0) + " Qs · " + (b.students_count || 0) + " students · " + (b.results_count || 0) + " scores";
      var sizeLabel = fmtBytes(b.compressed_size_bytes || b.raw_size_bytes || 0);
      var when = b.created_at ? fmtDateShort(b.created_at) : "—";
      return "<tr>" +
        "<td><strong>" + esc(b.label || b.filename) + "</strong><em class='mono'>" + esc(b.filename) + "</em></td>" +
        "<td style='font-size:12px;color:var(--ink-2)'>" + esc(statsText) + "</td>" +
        "<td class='mono'>" + esc(sizeLabel) + "</td>" +
        "<td style='font-size:12px;color:var(--ink-2)'>" + esc(when) + "</td>" +
        "<td><div class='row-actions'>" +
        "<button class='btn btn--ghost btn--sm' data-cloud-restore='" + esc(b.id) + "'><svg><use href='#i-restore'/></svg>Restore</button>" +
        "<button class='btn btn--ghost btn--sm' data-cloud-del='" + esc(b.id) + "' style='color:var(--bad)'>Delete</button>" +
        "</div></td></tr>";
    }).join("");
  }

  function checkBackupReminder() {
    var banner = $("#homeBackupReminder");
    if (!banner) return;
    if (state.backupReminderDismissed) { banner.hidden = true; return; }
    var s = state.cloudAccount;
    var signedIn = Boolean(s && s.signedIn);
    if (!signedIn || state.mode !== "app") { banner.hidden = true; return; }
    var reminderDays = Number(
      (s && s.directives && s.directives.backup_reminder_days != null)
        ? s.directives.backup_reminder_days
        : state.backupReminderDays
    );
    if (!isFinite(reminderDays)) reminderDays = 7;
    state.backupReminderDays = reminderDays;
    if (reminderDays <= 0) { banner.hidden = true; return; }

    var lastIso = (s && s.school && s.school.last_cloud_backup_at) ||
      (state.cloudBackups && state.cloudBackups[0] && state.cloudBackups[0].created_at) ||
      null;
    var msgEl = $("#homeBackupReminderText");
    if (!lastIso) {
      if (msgEl) msgEl.textContent = "You haven't backed up your exam database to CogniTara Cloud yet. Create a cloud snapshot so your exams, questions, and results stay safe.";
      banner.hidden = false;
      return;
    }
    var lastMs = new Date(lastIso).getTime();
    if (isNaN(lastMs)) { banner.hidden = true; return; }
    var ageDays = Math.floor((Date.now() - lastMs) / 86400000);
    if (ageDays >= reminderDays) {
      if (msgEl) msgEl.textContent = "Your last cloud exam backup was " + ageDays + " day" + (ageDays === 1 ? "" : "s") + " ago (reminder every " + reminderDays + " days). Back up now to protect recent exams and scores.";
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }

  async function refreshCloudBackups() {
    if (!bridge || !bridge.listCloudBackups) { renderCloudBackups(); return; }
    if (!state.cloudAccount || !state.cloudAccount.signedIn) {
      state.cloudBackups = [];
      renderCloudBackups();
      checkBackupReminder();
      return;
    }
    var res = await bridge.listCloudBackups().catch(function () { return null; });
    if (res && res.ok) {
      state.cloudBackups = Array.isArray(res.backups) ? res.backups : [];
      if (res.backup_reminder_days != null) state.backupReminderDays = Number(res.backup_reminder_days);
      renderCloudBackups();
      checkBackupReminder();
    }
  }

  async function runCloudBackupNow(triggerBtn) {
    if (!state.cloudAccount || !state.cloudAccount.signedIn) {
      openCloudModal("signin");
      toast("Sign in to your CogniTara Cloud account to back up online.");
      return;
    }
    var prog = $("#backupProg"), bar = prog ? prog.querySelector("i") : null, label = prog ? prog.querySelector("span") : null;
    if (prog && bar && label) {
      prog.hidden = false;
      bar.style.setProperty("--p", "0.35");
      label.textContent = "Compressing & uploading exam database to CogniTara Cloud…";
    }
    var origText = triggerBtn ? triggerBtn.innerHTML : "";
    if (triggerBtn) { triggerBtn.disabled = true; triggerBtn.textContent = "Backing up…"; }
    try {
      var res = bridge && bridge.backupToCloudNow
        ? await bridge.backupToCloudNow().catch(function (err) { return { ok: false, message: String(err) }; })
        : { ok: false, message: "Desktop cloud backup IPC unavailable." };
      if (bar && label) {
        bar.style.setProperty("--p", "1");
        label.textContent = res && res.ok ? "Cloud backup saved & verified" : "Cloud backup failed";
      }
      if (res && res.ok) {
        if (state.cloudAccount && state.cloudAccount.school) {
          state.cloudAccount.school.last_cloud_backup_at = new Date().toISOString();
        }
        state.backupReminderDismissed = false;
        checkBackupReminder();
        await refreshCloudBackups();
        toast("Exam database backed up to CogniTara Cloud!");
        logEvent("backup", "ok", "i-backup", "<b>Cloud exam backup</b> uploaded and verified");
      } else {
        toast((res && (res.message || res.error)) || "Cloud backup failed — check your internet connection.");
      }
    } finally {
      if (prog && bar) {
        setTimeout(function () { prog.hidden = true; bar.style.setProperty("--p", "0"); }, 650);
      }
      if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.innerHTML = origText; }
    }
  }

  async function refreshBackups() {
    if (!bridge) return;
    var res = await bridge.listBackups().catch(function () { return null; });
    if (res && res.ok) {
      state.backups = res.backups || [];
      if (res.backup_dir) state.backupDir = res.backup_dir;
      renderBackups();
    }
    refreshCloudBackups();
  }

  if ($("#cloudBackupBtn")) {
    $("#cloudBackupBtn").addEventListener("click", function () { runCloudBackupNow(this); });
  }
  if ($("#homeBackupNowBtn")) {
    $("#homeBackupNowBtn").addEventListener("click", function () { runCloudBackupNow(this); });
  }
  if ($("#homeBackupDismiss")) {
    $("#homeBackupDismiss").addEventListener("click", function () {
      state.backupReminderDismissed = true;
      if ($("#homeBackupReminder")) $("#homeBackupReminder").hidden = true;
    });
  }

  if ($("#cloudBkTable")) {
    $("#cloudBkTable").addEventListener("click", async function (e) {
      var rBtn = e.target.closest("[data-cloud-restore]");
      if (rBtn) {
        var bId = rBtn.dataset.cloudRestore;
        if (!rBtn.dataset.armed) {
          rBtn.dataset.armed = "1";
          rBtn.textContent = "Click to confirm";
          setTimeout(function () {
            if (rBtn.dataset.armed) { delete rBtn.dataset.armed; rBtn.innerHTML = "<svg><use href='#i-restore'/></svg>Restore"; }
          }, 4000);
          return;
        }
        delete rBtn.dataset.armed;
        rBtn.disabled = true;
        rBtn.textContent = "Restoring…";
        try {
          var res = bridge && bridge.restoreCloudBackup
            ? await bridge.restoreCloudBackup(bId).catch(function () { return null; })
            : null;
          if (res && res.ok) {
            toast("Cloud snapshot restored cleanly (local safety copy saved).");
            logEvent("backup", "warn", "i-restore", "<b>Database restored</b> from CogniTara Cloud snapshot");
            await refreshBackups();
          } else {
            toast((res && (res.message || res.error)) || "Could not restore cloud backup.");
          }
        } finally {
          rBtn.disabled = false;
          rBtn.innerHTML = "<svg><use href='#i-restore'/></svg>Restore";
        }
        return;
      }

      var dBtn = e.target.closest("[data-cloud-del]");
      if (dBtn) {
        var delId = dBtn.dataset.cloudDel;
        if (!dBtn.dataset.armed) {
          dBtn.dataset.armed = "1";
          dBtn.textContent = "Confirm delete";
          setTimeout(function () {
            if (dBtn.dataset.armed) { delete dBtn.dataset.armed; dBtn.textContent = "Delete"; }
          }, 3800);
          return;
        }
        delete dBtn.dataset.armed;
        dBtn.disabled = true;
        dBtn.textContent = "Deleting…";
        try {
          var delRes = bridge && bridge.deleteCloudBackup
            ? await bridge.deleteCloudBackup(delId).catch(function () { return null; })
            : null;
          if (delRes && delRes.ok) {
            toast("Cloud backup deleted");
            await refreshCloudBackups();
          } else {
            toast((delRes && (delRes.message || delRes.error)) || "Could not delete cloud backup.");
          }
        } finally {
          dBtn.disabled = false;
          dBtn.textContent = "Delete";
        }
      }
    });
  }

  $("#backupBtn").addEventListener("click", async function () {
    var prog = $("#backupProg"), bar = prog.querySelector("i"), label = prog.querySelector("span");
    var btn = this;
    prog.hidden = false; btn.disabled = true;
    bar.style.setProperty("--p", "0.35");
    label.textContent = "Copying exam records…";

    var res = bridge
      ? await bridge.createHotBackup("manual").catch(function (err) { return { ok: false, error: String(err) }; })
      : { ok: true, backup: { filename: "exam_manual_now.db", type: "Manual", size_label: "744 KB", created_label: "Today, " + nowHM(), verified: true } };

    bar.style.setProperty("--p", "1");
    label.textContent = res && res.ok ? "Verified" : "Failed";
    setTimeout(function () { prog.hidden = true; bar.style.setProperty("--p", "0"); btn.disabled = false; }, 550);

    if (res && res.ok) {
      if (res.backup) state.backups.unshift(res.backup);
      renderBackups();
      toast("Backup saved and verified");
      logEvent("backup", "ok", "i-backup", "<b>Manual backup</b> saved (" + esc(res.backup ? res.backup.filename : "exam.db") + ")");
    } else {
      toast("Backup failed: " + ((res && res.error) || "error"));
    }
  });

  $("#bkTable").addEventListener("click", async function (e) {
    var delBtn = e.target.closest("[data-del-local]");
    if (delBtn) {
      var delEntry = state.backups[+delBtn.dataset.delLocal];
      if (!delEntry) return;
      if (!delBtn.dataset.armed) {
        delBtn.dataset.armed = "1";
        delBtn.textContent = "Confirm delete";
        setTimeout(function () {
          if (delBtn.dataset.armed) { delete delBtn.dataset.armed; delBtn.textContent = "Delete"; }
        }, 3800);
        return;
      }
      delete delBtn.dataset.armed;
      delBtn.disabled = true;
      delBtn.textContent = "Deleting…";
      if (bridge && bridge.deleteLocalBackup) {
        var delRes = await bridge.deleteLocalBackup(delEntry.filename).catch(function () { return null; });
        if (delRes && delRes.ok) {
          toast("Deleted " + delEntry.filename);
          await refreshBackups();
        } else {
          toast("Delete failed: " + ((delRes && (delRes.message || delRes.error)) || "error"));
        }
      }
      delBtn.disabled = false;
      delBtn.textContent = "Delete";
      return;
    }

    var b = e.target.closest("[data-restore]"); if (!b) return;
    var entry = state.backups[+b.dataset.restore];
    if (!entry) return;
    if (!b.dataset.armed) {
      b.dataset.armed = "1";
      b.textContent = "Click to confirm";
      setTimeout(function () {
        if (b.dataset.armed) { delete b.dataset.armed; b.innerHTML = "<svg><use href='#i-restore'/></svg>Restore"; }
      }, 3800);
      return;
    }
    delete b.dataset.armed;
    b.disabled = true;
    b.textContent = "Restoring…";
    if (bridge) {
      var res = await bridge.restoreBackup(entry.filename).catch(function () { return null; });
      if (res && res.ok) {
        toast("Restored from " + entry.filename + " (safety copy saved).");
        logEvent("backup", "warn", "i-restore", "<b>Database restored</b> from " + esc(entry.filename));
        await refreshBackups();
      } else {
        toast("Restore failed: " + ((res && res.error) || "error"));
      }
    }
    b.disabled = false;
    b.innerHTML = "<svg><use href='#i-restore'/></svg>Restore";
  });

  $("#bkSchedule").addEventListener("change", function () {
    state.settings.backupSchedule = this.value;
    if (bridge) bridge.updateSettings({ backupSchedule: this.value }).catch(function () {});
    toast("Backup schedule updated");
  });

  $("#bkDirBtn").addEventListener("click", async function () {
    if (!bridge) return;
    var res = await bridge.chooseBackupDir();
    if (res && res.ok && res.backupDir) {
      state.backupDir = res.backupDir;
      renderBackups();
      await refreshBackups();
      toast("Backup folder updated");
    }
  });

  /* ---- settings ---- */
  var settingsSchoolDraftLogo = undefined; // undefined = unchanged, null = removed, string = new data URL
  function setSettingsSchoolMsg(errText, okText) {
    var eEl = $("#setSchoolErr"), oEl = $("#setSchoolOk");
    if (eEl) { eEl.hidden = !errText; eEl.textContent = errText || ""; }
    if (oEl) { oEl.hidden = !okText; oEl.textContent = okText || ""; }
  }
  function syncSettingsSchoolUI() {
    if ($("#setSchoolName")) $("#setSchoolName").value = state.school.school_name || "";
    if ($("#setSchoolMotto")) $("#setSchoolMotto").value = state.school.school_motto || "";
    if ($("#setSchoolSession")) $("#setSchoolSession").value = state.school.academic_session || "2026/2027";
    if ($("#setSchoolTerm")) $("#setSchoolTerm").value = state.school.current_term || "First Term";
    settingsSchoolDraftLogo = undefined;
    applySchoolCrestEverywhere(state.logoDataUrl, state.school.school_name);
    var pill = $("#setSchoolSyncPill");
    if (pill) {
      var signedIn = Boolean(state.cloudAccount && state.cloudAccount.signedIn);
      pill.textContent = signedIn
        ? (state.cloudAccount.offline ? "Offline cache (syncs when online)" : "Synced with Cloud HQ")
        : "Saved locally";
      pill.className = "cloud-pill " + (signedIn && !state.cloudAccount.offline ? "cloud-pill--ok" : "cloud-pill--guest");
    }
  }
  if ($("#setSchoolLogoFile")) {
    $("#setSchoolLogoFile").addEventListener("change", function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        if (typeof reader.result === "string") {
          settingsSchoolDraftLogo = reader.result;
          applySchoolCrestEverywhere(settingsSchoolDraftLogo, ($("#setSchoolName") && $("#setSchoolName").value.trim()) || state.school.school_name);
          setSettingsSchoolMsg("", "Logo ready — click Save school profile to apply everywhere.");
        }
      };
      reader.readAsDataURL(f);
      this.value = "";
    });
  }
  if ($("#setSchoolLogoRemoveBtn")) {
    $("#setSchoolLogoRemoveBtn").addEventListener("click", function () {
      settingsSchoolDraftLogo = null;
      applySchoolCrestEverywhere(null, ($("#setSchoolName") && $("#setSchoolName").value.trim()) || state.school.school_name);
      setSettingsSchoolMsg("", "Logo marked for removal — click Save school profile to confirm.");
    });
  }
  if ($("#setSchoolSaveBtn")) {
    $("#setSchoolSaveBtn").addEventListener("click", async function () {
      setSettingsSchoolMsg("", "");
      var sName = ($("#setSchoolName") && $("#setSchoolName").value || "").trim();
      var sMotto = ($("#setSchoolMotto") && $("#setSchoolMotto").value || "").trim();
      var sSession = ($("#setSchoolSession") && $("#setSchoolSession").value || "").trim() || "2026/2027";
      var sTerm = ($("#setSchoolTerm") && $("#setSchoolTerm").value || "").trim() || "First Term";
      if (sName.length < 2) {
        setSettingsSchoolMsg("Enter a school name (at least 2 characters).", "");
        return;
      }
      var btn = $("#setSchoolSaveBtn");
      var origLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Saving…";
      try {
        var payload = {
          school_name: sName,
          school_motto: sMotto,
          academic_session: sSession,
          current_term: sTerm,
          remove_logo: settingsSchoolDraftLogo === null
        };
        if (typeof settingsSchoolDraftLogo === "string") {
          payload.logo_data_url = settingsSchoolDraftLogo;
        }
        var res = bridge && bridge.saveSchoolProfile
          ? await bridge.saveSchoolProfile(payload)
          : { ok: true, cloud_synced: true, school: Object.assign({}, payload, { logo_data_url: settingsSchoolDraftLogo === null ? null : (settingsSchoolDraftLogo || state.logoDataUrl) }) };

        if (!res || !res.ok) {
          setSettingsSchoolMsg((res && res.message) || "Could not save school profile right now.", "");
          return;
        }
        state.school.school_name = sName;
        state.school.school_motto = sMotto;
        state.school.academic_session = sSession;
        state.school.current_term = sTerm;
        if (settingsSchoolDraftLogo === null) {
          state.logoDataUrl = null;
        } else if (res.school && res.school.logo_data_url) {
          state.logoDataUrl = res.school.logo_data_url;
        } else if (typeof settingsSchoolDraftLogo === "string") {
          state.logoDataUrl = settingsSchoolDraftLogo;
        }
        settingsSchoolDraftLogo = undefined;
        hydrateSchoolInputs();
        syncSchool();
        syncSettingsSchoolUI();
        var msg = res.cloud_synced
          ? "School profile & logo saved locally and synced to CogniTara Cloud HQ."
          : "School profile & logo saved locally (will sync to Cloud HQ once online).";
        setSettingsSchoolMsg("", msg);
        toast(res.cloud_synced ? "School profile synced with Cloud HQ!" : "School profile saved!");
        logEvent("server", "ok", "i-home", "<b>School profile updated</b> (" + esc(sName) + ")");
      } finally {
        btn.disabled = false;
        btn.textContent = origLabel;
      }
    });
  }

  function syncSettingsUI() {
    $("#setStartWin").checked = Boolean(state.settings.startWithWindows);
    $("#setAutoStart").checked = Boolean(state.settings.autoStartServer);
    $("#setPort").value = String(state.settings.port || 5000);
    $("#setPortHint").textContent = "Change only if another program uses " + (state.settings.port || 5000) + ".";
    $("#setLanOnly").checked = Boolean(state.settings.lanOnly);
    $("#bkSchedule").value = state.settings.backupSchedule || "30m";
    syncSettingsSchoolUI();
  }

  $("#setStartWin").addEventListener("change", function () {
    state.settings.startWithWindows = this.checked;
    if (bridge) bridge.updateSettings({ startWithWindows: this.checked }).catch(function () {});
  });
  $("#setAutoStart").addEventListener("change", function () {
    state.settings.autoStartServer = this.checked;
    if (bridge) bridge.updateSettings({ autoStartServer: this.checked }).catch(function () {});
  });
  $("#setLanOnly").addEventListener("change", function () {
    state.settings.lanOnly = this.checked;
    if (bridge) bridge.updateSettings({ lanOnly: this.checked }).catch(function () {});
  });
  $("#setPort").addEventListener("change", function () {
    var v = parseInt(this.value, 10);
    if (isNaN(v) || v < 1024 || v > 65535) {
      this.value = String(state.port);
      toast("Port must be between 1024 and 65535");
      return;
    }
    state.port = v;
    state.settings.port = v;
    $("#setPortHint").textContent = "Change only if another program uses " + v + ".";
    syncAddr(false);
    if (bridge) bridge.updateSettings({ port: v }).catch(function () {});
    toast("Port updated to " + v + ". Restart the server to apply.");
  });

  /* ---- Legacy Database (exam.db) Migration Import ---- */
  var pendingLegacyFilePath = "";

  function fmtBytesCompact(bytes) {
    var b = Number(bytes || 0);
    if (b >= 1048576) return (b / 1048576).toFixed(2) + " MB";
    if (b >= 1024) return Math.round(b / 1024) + " KB";
    return b + " B";
  }

  function showLegacyError(msg) {
    var el = $("#legacyErr");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    el.hidden = false;
  }

  function renderLegacyInspection(info) {
    pendingLegacyFilePath = info.file_path || "";
    showLegacyError("");
    if ($("#legacyDone")) $("#legacyDone").hidden = true;
    var preview = $("#legacyPreview");
    if (!preview) return;
    $("#legacySchoolName").textContent = info.school_name || "Legacy CogniTara School";
    $("#legacyFileMeta").textContent =
      (info.file_name || "exam.db") +
      " · " +
      fmtBytesCompact(info.file_size_bytes) +
      " · " +
      (info.table_count || 0) +
      " tables · " +
      (info.academic_session || "2026/2027");
    var c = info.counts || {};
    $("#legCntStudents").textContent = String(c.students || 0);
    $("#legCntTeachers").textContent = String(c.teachers || 0);
    $("#legCntExams").textContent = String(c.exams || 0);
    $("#legCntQuestions").textContent = String(c.questions || 0);
    $("#legCntScores").textContent = String(c.scores || 0);
    $("#legCntCe").textContent = String((c.ce_exams || 0) + (c.ce_students || 0) + (c.ce_attempts || 0));

    var notesEl = $("#legacyNotes");
    if (notesEl) {
      notesEl.innerHTML = "";
      var notes = Array.isArray(info.notes) && info.notes.length
        ? info.notes
        : ["SQLite integrity passed. Your current database will be backed up automatically first."];
      notes.forEach(function (line) {
        var li = document.createElement("li");
        li.textContent = String(line);
        notesEl.appendChild(li);
      });
    }
    preview.hidden = false;
    setTimeout(function () {
      try { preview.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (_) {}
    }, 40);
  }

  function pluralize(n, singular, plural) {
    var v = Number(n || 0);
    return v + " " + (v === 1 ? singular : plural);
  }

  if ($("#legacyPickBtn")) {
    $("#legacyPickBtn").addEventListener("click", async function () {
      var btn = this;
      showLegacyError("");
      if (!bridge || !bridge.pickAndInspectLegacyDb) {
        showLegacyError("Database import is available inside the installed CogniTara Studio desktop app.");
        return;
      }
      var prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Inspecting…";
      try {
        var res = await bridge.pickAndInspectLegacyDb();
        if (res && res.canceled) return;
        if (!res || !res.ok) {
          if ($("#legacyPreview")) $("#legacyPreview").hidden = true;
          showLegacyError((res && res.message) || "Selected file is not a valid CogniTara database.");
          return;
        }
        renderLegacyInspection(res);
      } catch (err) {
        showLegacyError((err && err.message) || "Could not inspect selected file.");
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });
  }

  if ($("#legacyCancelBtn")) {
    $("#legacyCancelBtn").addEventListener("click", function () {
      pendingLegacyFilePath = "";
      showLegacyError("");
      if ($("#legacyPreview")) $("#legacyPreview").hidden = true;
    });
  }

  if ($("#legacyImportBtn")) {
    $("#legacyImportBtn").addEventListener("click", async function () {
      var btn = this;
      if (!pendingLegacyFilePath) {
        showLegacyError("Please select an exam.db file first.");
        return;
      }
      if (!bridge || !bridge.importLegacyDb) return;
      showLegacyError("");
      var prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Importing & upgrading…";
      try {
        var preserveAdmin = $("#legacyPreserveAdmin") ? Boolean($("#legacyPreserveAdmin").checked) : true;
        var res = await bridge.importLegacyDb({
          file_path: pendingLegacyFilePath,
          preserve_current_admin: preserveAdmin,
        });
        if (!res || !res.ok) {
          showLegacyError((res && res.message) || "Could not import database.");
          return;
        }
        if ($("#legacyPreview")) $("#legacyPreview").hidden = true;
        pendingLegacyFilePath = "";
        var cnt = res.counts || {};
        var doneTitle = $("#legacyDoneTitle");
        var doneMeta = $("#legacyDoneMeta");
        if (doneTitle) doneTitle.textContent = (res.school_name || "Former school database") + " imported";
        if (doneMeta) {
          var parts = [
            pluralize(cnt.students || 0, "student", "students"),
            pluralize(cnt.teachers || 0, "teacher", "teachers"),
            pluralize(cnt.exams || 0, "exam", "exams"),
            pluralize(cnt.questions || 0, "question", "questions"),
          ];
          if (res.passwords_upgraded > 0) {
            parts.push(pluralize(res.passwords_upgraded, "password secured", "passwords secured"));
          }
          if (res.safety_snapshot) {
            parts.push("safety backup saved as " + res.safety_snapshot);
          }
          doneMeta.textContent = parts.join(" · ") + ".";
        }
        var doneEl = $("#legacyDone");
        if (doneEl) {
          doneEl.hidden = false;
          setTimeout(function () {
            try { doneEl.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch (_) {}
          }, 40);
        }
        toast("Former database imported and upgraded cleanly");
        if (typeof refreshBackups === "function") refreshBackups();
        if (typeof pollTelemetry === "function") pollTelemetry();
      } catch (err) {
        showLegacyError((err && err.message) || "Unexpected error while importing database.");
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });
  }

  if ($("#legacyDoneBackupsBtn")) {
    $("#legacyDoneBackupsBtn").addEventListener("click", function () {
      showView("backups");
    });
  }
  if ($("#legacyDoneAdminBtn")) {
    $("#legacyDoneAdminBtn").addEventListener("click", function () {
      if ($("#portalAdmin")) $("#portalAdmin").click();
    });
  }
  /* ------------------------------------------------------------------ direct in-app auto-updater */
  function renderUpdateState(upd) {
    if (!upd) return;
    state.updateState = upd;
    var sub = $("#updSubtitle");
    var box = $("#updBox");
    var title = $("#updStateTitle");
    var meta = $("#updProgressMeta");
    var bar = $("#updBar");
    var dlBtn = $("#updDownloadBtn");
    var instBtn = $("#updInstallBtn");
    var notes = $("#updReleaseNotes");
    var checkBtn = $("#setCheckUpdateBtn");
    var tbBtn = $("#tbUpdateBtn");
    var tbLbl = $("#tbUpdateLabel");

    if (upd.currentVersion) {
      $("#aboutVersion").textContent = "CogniTara Studio " + upd.currentVersion;
    }

    checkBtn.disabled = upd.status === "checking" || upd.status === "downloading";

    if (upd.status === "checking") {
      sub.textContent = "Checking GitHub Releases for CogniTara Studio updates…";
      box.hidden = true;
      tbBtn.hidden = true;
    } else if (upd.status === "available") {
      sub.textContent = "Version " + (upd.availableVersion || "") + " is ready to download directly inside Studio.";
      box.hidden = false;
      title.textContent = "CogniTara Studio " + (upd.availableVersion || "") + " available";
      meta.textContent = "Ready";
      bar.style.setProperty("--p", "0");
      dlBtn.hidden = false;
      dlBtn.disabled = false;
      instBtn.hidden = true;
      notes.textContent = upd.releaseNotes ? upd.releaseNotes.split("\n")[0].slice(0, 90) : "Includes latest Windows fixes & improvements.";
      tbBtn.hidden = false;
      tbBtn.dataset.ready = "0";
      tbLbl.textContent = "Update v" + (upd.availableVersion || "");
    } else if (upd.status === "downloading") {
      var pct = Math.max(0, Math.min(100, Number(upd.percent || 0)));
      sub.textContent = "Downloading CogniTara Studio " + (upd.availableVersion || "") + "…";
      box.hidden = false;
      title.textContent = "Downloading v" + (upd.availableVersion || "");
      var speed = upd.bytesPerSecond ? (" · " + fmtBytes(upd.bytesPerSecond) + "/s") : "";
      var totals = upd.total ? (" (" + fmtBytes(upd.transferred) + " / " + fmtBytes(upd.total) + ")") : "";
      meta.textContent = pct.toFixed(1) + "%" + totals + speed;
      bar.style.setProperty("--p", String(pct / 100));
      dlBtn.hidden = true;
      instBtn.hidden = true;
      notes.textContent = "You can keep using Studio while the update downloads.";
      tbBtn.hidden = false;
      tbBtn.dataset.ready = "0";
      tbLbl.textContent = "Downloading " + Math.round(pct) + "%";
    } else if (upd.status === "downloaded") {
      sub.textContent = "Version " + (upd.availableVersion || "") + " downloaded and verified. Safe server-stop runs before restart.";
      box.hidden = false;
      title.textContent = "Ready to install v" + (upd.availableVersion || "");
      meta.textContent = "100% · Verified";
      bar.style.setProperty("--p", "1");
      dlBtn.hidden = true;
      instBtn.hidden = false;
      instBtn.disabled = false;
      notes.textContent = "Safely stops LAN exam server first and restarts Studio.";
      tbBtn.hidden = false;
      tbBtn.dataset.ready = "1";
      tbLbl.textContent = "Restart to update";
    } else if (upd.status === "not-available") {
      sub.textContent = "You're up to date (v" + (upd.currentVersion || state.version) + "). 5-layer licence vault active.";
      box.hidden = true;
      tbBtn.hidden = true;
    } else if (upd.status === "offline") {
      sub.textContent = upd.error || "Offline — will check automatically when internet returns.";
      box.hidden = true;
      tbBtn.hidden = true;
    } else if (upd.status === "error") {
      sub.textContent = "Update check note: " + (upd.error || "Unable to reach release feed.");
      box.hidden = true;
      tbBtn.hidden = true;
    }
  }

  $("#setCheckUpdateBtn").addEventListener("click", async function () {
    if (!bridge) {
      renderUpdateState({
        status: "not-available",
        currentVersion: state.version,
        availableVersion: state.version,
        percent: 0
      });
      toast("You are running the latest version (" + state.version + ")");
      return;
    }
    var st = await bridge.checkForUpdates().catch(function () { return null; });
    if (st) renderUpdateState(st);
    if (st && st.status === "not-available") toast("CogniTara Studio is up to date");
    else if (st && st.status === "available") toast("Update v" + st.availableVersion + " is available");
    else if (st && st.status === "offline") toast("You are offline. Connect to check for updates.");
  });

  $("#updDownloadBtn").addEventListener("click", async function () {
    this.disabled = true;
    if (!bridge) return;
    var res = await bridge.downloadUpdate().catch(function () { return null; });
    if (res && res.state) renderUpdateState(res.state);
  });

  $("#updInstallBtn").addEventListener("click", async function () {
    this.disabled = true;
    if (!bridge) { toast("Safe server-stop + restart triggered"); return; }
    var res = await bridge.installUpdateNow().catch(function () { return null; });
    if (res && res.canceled) {
      this.disabled = false;
      toast("Update postponed while exams are running");
    } else if (!res || !res.ok) {
      this.disabled = false;
      toast("Could not start installer yet");
    }
  });

  $("#tbUpdateBtn").addEventListener("click", function () {
    enterAppIfNeeded();
    showView("settings");
  });

  /* ------------------------------------------------------------------ CogniTara Cloud Account & 5-Star Rating Studio */
  function setCloudMsg(errText, okText) {
    var errEl = $("#cloudErr"), okEl = $("#cloudOk");
    if (errEl) { errEl.hidden = !errText; errEl.textContent = errText || ""; }
    if (okEl) { okEl.hidden = !okText; okEl.textContent = okText || ""; }
  }

  function renderCloudAccount(session) {
    state.cloudAccount = session || { signedIn: false, offline: false, cloudUrl: "https://cognitara-cloud.vercel.app" };
    var s = state.cloudAccount;
    var title = $("#cloudStatusTitle");
    var sub = $("#cloudStatusSub");
    var openBtn = $("#cloudOpenBtn");
    var syncBtn = $("#cloudSyncBtn");

    if (s.signedIn && s.user) {
      var pillClass = s.offline ? "cloud-pill cloud-pill--offline" : "cloud-pill cloud-pill--online";
      var pillText = s.offline ? "Offline · Cached" : "Online · Synced";
      var schoolLabel = (s.school && s.school.school_name) || state.school.school_name;
      if (title) title.innerHTML = esc(schoolLabel) + " <span class='" + pillClass + "' id='cloudStatusPill'>" + pillText + "</span>";
      if (sub) sub.textContent = s.user.full_name + " (" + s.user.email + ")" + (s.referralCode ? " · Ref " + s.referralCode : "");
      if (openBtn) { openBtn.textContent = "Manage account"; openBtn.className = "btn btn--ghost btn--sm"; }
      if (syncBtn) syncBtn.hidden = false;
      $("#tbAvatar").textContent = initials(s.user.full_name || schoolLabel);

      if ($("#cloudSignedInPane")) $("#cloudSignedInPane").hidden = false;
      if ($("#cloudAuthPane")) $("#cloudAuthPane").hidden = true;
      if ($("#cmCrest")) $("#cmCrest").textContent = initials(schoolLabel);
      if ($("#cmSchool")) $("#cmSchool").textContent = schoolLabel;
      if ($("#cmUser")) $("#cmUser").textContent = s.user.full_name;
      if ($("#cmEmail")) $("#cmEmail").textContent = s.user.email;
      if ($("#cmVerified")) {
        var ver = s.user.email_verified !== false;
        $("#cmVerified").textContent = ver ? "Email OTP verified" : "Pending verification";
        $("#cmVerified").style.color = ver ? "var(--ok)" : "var(--warn)";
      }
      if ($("#cmRef")) $("#cmRef").textContent = s.referralCode || "—";
      if ($("#cmLicCount")) {
        var activeCount = Array.isArray(s.licenses)
          ? s.licenses.filter(function (l) { return String(l.status || "").toLowerCase() === "active"; }).length
          : 0;
        $("#cmLicCount").textContent = activeCount + " active";
      }
      if ($("#cmSync")) {
        $("#cmSync").textContent = s.offline
          ? "Offline · Using local encrypted cache"
          : ("Synced " + (s.lastSyncedAt ? fmtDateTime(Math.floor(s.lastSyncedAt / 1000)) : "just now"));
      }
      if ($("#revName") && !$("#revName").value.trim() && s.user.full_name) {
        $("#revName").value = s.user.full_name;
      }
    } else {
      if (title) title.innerHTML = "Not signed in <span class='cloud-pill cloud-pill--guest' id='cloudStatusPill'>Offline only</span>";
      if (sub) sub.textContent = "Sign up or sign in to sync your school profile & licences with Neon Cloud (caches locally for offline exams).";
      if (openBtn) { openBtn.textContent = "Sign in / Sign up"; openBtn.className = "btn btn--primary btn--sm"; }
      if (syncBtn) syncBtn.hidden = true;

      if ($("#cloudSignedInPane")) $("#cloudSignedInPane").hidden = true;
      if ($("#cloudAuthPane")) $("#cloudAuthPane").hidden = false;
    }
    renderHqDirectives(s && s.directives ? s.directives : null);
    syncOnboardingCloudUi();
    renderCloudBackups();
    checkBackupReminder();
  }

  function renderHqDirectives(d) {
    if (d && d.backup_reminder_days != null) {
      state.backupReminderDays = Number(d.backup_reminder_days);
      checkBackupReminder();
    }
    var banner = $("#hqNoticeBanner");
    if (!banner) return;
    if (!d) { banner.hidden = true; return; }
    var text = "";
    var label = "CogniTara HQ Notice";
    var level = "info";
    if (d.maintenance_mode) {
      label = "Maintenance Notice";
      text = d.maintenance_message || "CogniTara Cloud is undergoing scheduled maintenance. Offline exams remain unaffected.";
      level = "warning";
    } else if (d.school_notice) {
      label = "Direct Message from CogniTara HQ";
      text = d.school_notice;
      level = d.school_notice_level || "info";
    } else if (d.global_announcement) {
      label = "CogniTara Announcement";
      text = d.global_announcement;
      level = d.global_announcement_level || "info";
    }
    if (!text) {
      banner.hidden = true;
      return;
    }
    banner.dataset.level = level;
    $("#hqNoticeLabel").textContent = label;
    $("#hqNoticeText").textContent = text;
    banner.hidden = false;
  }
  if ($("#hqNoticeDismiss")) {
    $("#hqNoticeDismiss").addEventListener("click", function () { $("#hqNoticeBanner").hidden = true; });
  }

  var pendingCloudOtp = null;
  var modalOtpResendTimer = null;
  function showCloudOtpStep(email, purpose, msg, challengeToken) {
    pendingCloudOtp = { email: email, purpose: purpose || "signup_verify", challenge_token: challengeToken || "" };
    if ($("#cloudTabs")) $("#cloudTabs").hidden = true;
    if ($("#cloudSignInForm")) $("#cloudSignInForm").hidden = true;
    if ($("#cloudSignUpForm")) $("#cloudSignUpForm").hidden = true;
    if ($("#cloudOtpForm")) $("#cloudOtpForm").hidden = false;
    if ($("#coEmailLabel")) $("#coEmailLabel").textContent = email;
    if ($("#coCode")) $("#coCode").value = "";
    setCloudMsg("", msg || ("Enter the 6-digit code sent to " + email + "."));
    if (modalOtpResendTimer) clearInterval(modalOtpResendTimer);
    startOtpCountdown($("#coResendBtn"), 45, function (id) { modalOtpResendTimer = id; });
    setTimeout(function () { if ($("#coCode")) $("#coCode").focus(); }, 60);
  }

  function switchCloudTab(tab) {
    pendingCloudOtp = null;
    if (modalOtpResendTimer) { clearInterval(modalOtpResendTimer); modalOtpResendTimer = null; }
    if ($("#coResendBtn")) { $("#coResendBtn").disabled = false; $("#coResendBtn").textContent = "Resend code"; }
    if ($("#cloudTabs")) $("#cloudTabs").hidden = false;
    if ($("#cloudOtpForm")) $("#cloudOtpForm").hidden = true;
    $$("#cloudTabs button").forEach(function (b) { b.classList.toggle("is-active", b.dataset.ctab === tab); });
    if ($("#cloudSignInForm")) $("#cloudSignInForm").hidden = tab !== "signin";
    if ($("#cloudSignUpForm")) $("#cloudSignUpForm").hidden = tab !== "signup";
    setCloudMsg("", "");
  }

  var reopenBillingAfterAuth = false;
  function openCloudModal(initialTab) {
    setCloudMsg("", "");
    renderCloudAccount(state.cloudAccount);
    if (!state.cloudAccount || !state.cloudAccount.signedIn) {
      switchCloudTab(initialTab || "signin");
      if ($("#cuSchool") && !$("#cuSchool").value && state.school.school_name && state.school.school_name !== "CogniTara School") {
        $("#cuSchool").value = state.school.school_name;
      }
    }
    openFullScreenFlow("cloud");
  }

  function closeCloudModal() {
    exitSubflow("home");
  }

  if ($("#cloudOpenBtn")) $("#cloudOpenBtn").addEventListener("click", function () { openCloudModal(); });
  $$("#cloudTabs button").forEach(function (b) {
    b.addEventListener("click", function () { switchCloudTab(b.dataset.ctab); });
  });

  if ($("#coCode")) {
    $("#coCode").addEventListener("input", function () {
      this.value = this.value.replace(/\D/g, "").slice(0, 6);
    });
  }

  if ($("#cloudSignInForm")) {
    $("#cloudSignInForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      setCloudMsg("", "");
      var btn = $("#ciSubmitBtn");
      btn.disabled = true;
      btn.textContent = "Signing in…";
      try {
        var res = bridge
          ? await bridge.cloudSignIn({ email: $("#ciEmail").value.trim(), password: $("#ciPass").value })
          : { ok: false, message: "Cloud IPC requires CogniTara Studio desktop." };
        if (res && res.ok && res.otp_required) {
          showCloudOtpStep(res.email || $("#ciEmail").value.trim(), res.purpose || "signin_otp", res.message, res.challenge_token);
        } else if (res && res.ok && res.session) {
          renderCloudAccount(res.session);
          setCloudMsg("", "Signed in and cached locally for offline exam days.");
          toast("Signed in to CogniTara Cloud");
          logEvent("licence", "ok", "i-shield", "<b>Cloud account synced</b> (" + esc(res.session.user.email) + ")");
          loadMySchoolReview();
          if (reopenBillingAfterAuth) {
            reopenBillingAfterAuth = false;
            openBillingModal("plans");
          }
        } else {
          setCloudMsg((res && res.message) || "Invalid email address or password.", "");
        }
      } finally {
        btn.disabled = false;
        btn.textContent = "Sign in & cache offline";
      }
    });
  }

  if ($("#cloudSignUpForm")) {
    $("#cloudSignUpForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      setCloudMsg("", "");
      var btn = $("#cuSubmitBtn");
      btn.disabled = true;
      btn.textContent = "Creating account…";
      try {
        var res = bridge
          ? await bridge.cloudSignUp({
              full_name: $("#cuName").value.trim(),
              school_name: $("#cuSchool").value.trim(),
              email: $("#cuEmail").value.trim(),
              phone: $("#cuPhone").value.trim(),
              password: $("#cuPass").value,
              referral_code: $("#cuRef").value.trim() || undefined
            })
          : { ok: false, message: "Cloud IPC requires CogniTara Studio desktop." };
        if (res && res.ok && res.otp_required) {
          showCloudOtpStep(res.email || $("#cuEmail").value.trim(), res.purpose || "signup_verify", res.message, res.challenge_token);
        } else if (res && res.ok && res.session) {
          renderCloudAccount(res.session);
          setCloudMsg("", "School account created on Neon Cloud and cached offline.");
          toast("CogniTara Cloud account created!");
          logEvent("licence", "ok", "i-shield", "<b>Cloud school registered</b> (" + esc(res.session.school ? res.session.school.school_name : res.session.user.email) + ")");
          loadMySchoolReview();
          if (reopenBillingAfterAuth) {
            reopenBillingAfterAuth = false;
            openBillingModal("plans");
          }
        } else {
          setCloudMsg((res && res.message) || "Could not create account.", "");
        }
      } finally {
        btn.disabled = false;
        btn.textContent = "Create account & send OTP";
      }
    });
  }

  if ($("#coBackBtn")) {
    $("#coBackBtn").addEventListener("click", function () {
      switchCloudTab(pendingCloudOtp && pendingCloudOtp.purpose === "signup_verify" ? "signup" : "signin");
    });
  }
  if ($("#coResendBtn")) {
    $("#coResendBtn").addEventListener("click", async function () {
      if (!pendingCloudOtp || !bridge) return;
      var btn = $("#coResendBtn");
      btn.disabled = true;
      btn.textContent = "Sending…";
      var res = await bridge.cloudResendOtp(pendingCloudOtp).catch(function () { return null; });
      if (res && res.ok) {
        if (res.challenge_token) pendingCloudOtp.challenge_token = res.challenge_token;
        setCloudMsg("", res.message || "Fresh 6-digit code sent.");
        startOtpCountdown(btn, 45, function (id) { modalOtpResendTimer = id; });
      } else {
        setCloudMsg((res && res.message) || "Wait a moment before resending.", "");
        startOtpCountdown(btn, (res && res.retry_after_sec) || 20, function (id) { modalOtpResendTimer = id; });
      }
    });
  }
  if ($("#cloudOtpForm")) {
    $("#cloudOtpForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!pendingCloudOtp) return;
      setCloudMsg("", "");
      var code = ($("#coCode").value || "").replace(/\D/g, "").slice(0, 6);
      if (code.length !== 6) {
        setCloudMsg("Enter all 6 digits from your verification email.", "");
        return;
      }
      var btn = $("#coSubmitBtn");
      btn.disabled = true;
      btn.textContent = "Verifying…";
      try {
        var res = bridge
          ? await bridge.cloudVerifyOtp({
              email: pendingCloudOtp.email,
              purpose: pendingCloudOtp.purpose,
              challenge_token: pendingCloudOtp.challenge_token,
              code: code
            })
          : { ok: false, message: "Cloud IPC requires CogniTara Studio desktop." };
        if (res && res.ok && res.session) {
          pendingCloudOtp = null;
          if (modalOtpResendTimer) { clearInterval(modalOtpResendTimer); modalOtpResendTimer = null; }
          if ($("#cloudTabs")) $("#cloudTabs").hidden = false;
          if ($("#cloudOtpForm")) $("#cloudOtpForm").hidden = true;
          renderCloudAccount(res.session);
          setCloudMsg("", "Email verified & cached locally for offline exam days.");
          toast("Email verified — signed in to CogniTara Cloud");
          logEvent("licence", "ok", "i-shield", "<b>Cloud account verified via OTP</b> (" + esc(res.session.user.email) + ")");
          loadMySchoolReview();
          if (reopenBillingAfterAuth) {
            reopenBillingAfterAuth = false;
            openBillingModal("plans");
          }
        } else {
          setCloudMsg((res && res.message) || "Invalid or expired 6-digit code.", "");
        }
      } finally {
        btn.disabled = false;
        btn.textContent = "Verify & continue";
      }
    });
  }

  async function runCloudSync() {
    if (!bridge) { toast("Cloud profile is up to date"); return; }
    var res = await bridge.cloudSync().catch(function () { return null; });
    if (res && res.session) renderCloudAccount(res.session);
    if (res && res.ok) {
      toast(res.offline ? "Offline — using cached profile" : "CogniTara Cloud profile synced");
    } else {
      toast((res && res.message) || "Could not sync cloud profile");
    }
  }
  if ($("#cloudSyncBtn")) $("#cloudSyncBtn").addEventListener("click", runCloudSync);
  if ($("#cmSyncNowBtn")) $("#cmSyncNowBtn").addEventListener("click", runCloudSync);
  if ($("#cmUpgradeBtn")) {
    $("#cmUpgradeBtn").addEventListener("click", function () { openBillingModal("plans"); });
  }
  if ($("#cmOpenPortalBtn")) {
    $("#cmOpenPortalBtn").addEventListener("click", function () {
      var base = (state.cloudAccount && state.cloudAccount.cloudUrl) || "https://cognitara-cloud.vercel.app";
      openExternalUrl(base + "/dashboard");
    });
  }
  if ($("#cmSignOutBtn")) {
    $("#cmSignOutBtn").addEventListener("click", async function () {
      if (bridge) {
        var res = await bridge.cloudSignOut().catch(function () { return null; });
        if (res && res.session) renderCloudAccount(res.session);
      } else {
        renderCloudAccount({ signedIn: false, offline: false });
      }
      toast("Signed out of CogniTara Cloud");
    });
  }

  /* ---- 5-Star In-App Rating Studio (Reports Directly to CogniTara HQ) ---- */
  var selectedReviewStars = 5;
  var RATING_LABELS = {
    1: "1 / 5 — Needs work",
    2: "2 / 5 — Fair",
    3: "3 / 5 — Good",
    4: "4 / 5 — Very good",
    5: "5 / 5 — Outstanding"
  };

  function paintReviewStars(activeVal) {
    var v = Math.max(1, Math.min(5, Number(activeVal || selectedReviewStars || 5)));
    $$("#reviewStars .star-btn").forEach(function (btn) {
      var n = Number(btn.dataset.star || 0);
      btn.classList.toggle("is-lit", n <= v);
      btn.setAttribute("aria-checked", n === selectedReviewStars ? "true" : "false");
    });
    if ($("#reviewRatingLabel")) $("#reviewRatingLabel").textContent = RATING_LABELS[v] || (v + " / 5");
  }

  function renderReviewStatusBanner(rev) {
    var banner = $("#reviewStatusBanner");
    if (!banner) return;
    if (!rev) {
      banner.hidden = true;
      if ($("#revSubmitBtn")) $("#revSubmitBtn").textContent = "Send rating to CogniTara HQ";
      return;
    }
    var st = String(rev.status || "pending").toLowerCase();
    banner.dataset.status = st;
    if (st === "approved") {
      $("#reviewStatusTitle").textContent = "Live on cognitara.net";
      $("#reviewStatusSub").textContent = "Approved by CogniTara HQ! Your school's rating is now featured on the website. Editing resubmits for review.";
    } else if (st === "rejected") {
      $("#reviewStatusTitle").textContent = "Not published yet";
      $("#reviewStatusSub").textContent = "Update your review details below and resubmit to CogniTara HQ anytime.";
    } else {
      $("#reviewStatusTitle").textContent = "Pending HQ approval";
      $("#reviewStatusSub").textContent = "Sent to CogniTara HQ! Once approved, it will appear in the testimonials section on cognitara.net.";
    }
    banner.hidden = false;
    if ($("#revSubmitBtn")) $("#revSubmitBtn").textContent = "Update & resubmit rating";
  }

  async function loadMySchoolReview() {
    if (!state.cloudAccount || !state.cloudAccount.signedIn) return;
    if ($("#revName") && !$("#revName").value.trim() && state.cloudAccount.user && state.cloudAccount.user.full_name) {
      $("#revName").value = state.cloudAccount.user.full_name;
    }
    paintReviewStars(selectedReviewStars);
    if (!bridge || !bridge.getMySchoolReview) return;
    var res = await bridge.getMySchoolReview().catch(function () { return null; });
    if (res && res.ok && res.review) {
      var r = res.review;
      selectedReviewStars = Math.max(1, Math.min(5, Number(r.rating || 5)));
      paintReviewStars(selectedReviewStars);
      if ($("#revName") && r.author_name) $("#revName").value = r.author_name;
      if ($("#revRole") && r.author_role) $("#revRole").value = r.author_role;
      if ($("#revCity") && r.city_state) $("#revCity").value = r.city_state;
      if ($("#revHeadline") && r.headline) $("#revHeadline").value = r.headline;
      if ($("#revBody") && r.body) {
        $("#revBody").value = r.body;
        if ($("#revCharCount")) $("#revCharCount").textContent = r.body.length + " / 600";
      }
      renderReviewStatusBanner(r);
    } else {
      renderReviewStatusBanner(null);
    }
  }

  $$("#reviewStars .star-btn").forEach(function (btn) {
    btn.addEventListener("mouseenter", function () { paintReviewStars(Number(btn.dataset.star)); });
    btn.addEventListener("click", function () {
      selectedReviewStars = Number(btn.dataset.star || 5);
      paintReviewStars(selectedReviewStars);
    });
  });
  if ($("#reviewStars")) {
    $("#reviewStars").addEventListener("mouseleave", function () { paintReviewStars(selectedReviewStars); });
  }
  if ($("#revBody")) {
    $("#revBody").addEventListener("input", function () {
      if ($("#revCharCount")) $("#revCharCount").textContent = this.value.length + " / 600";
    });
  }
  if ($("#schoolReviewForm")) {
    $("#schoolReviewForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      setCloudMsg("", "");
      var body = ($("#revBody").value || "").trim();
      if (body.length < 12) {
        setCloudMsg("Please write at least 12 characters about your experience with CogniTara Studio.", "");
        return;
      }
      var btn = $("#revSubmitBtn");
      var origLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Sending to CogniTara HQ…";
      try {
        var payload = {
          rating: selectedReviewStars,
          author_name: ($("#revName").value || "").trim(),
          author_role: ($("#revRole").value || "").trim(),
          city_state: ($("#revCity").value || "").trim(),
          headline: ($("#revHeadline").value || "").trim(),
          body: body
        };
        var res = bridge && bridge.submitSchoolReview
          ? await bridge.submitSchoolReview(payload).catch(function () { return null; })
          : { ok: true, review: Object.assign({ status: "pending" }, payload), message: "Thank you! Your review has been sent to CogniTara HQ for approval." };
        if (res && res.ok) {
          renderReviewStatusBanner(res.review || { status: "pending" });
          setCloudMsg("", res.message || "Thank you! Your review has been sent to CogniTara HQ for approval.");
          toast("Rating sent to CogniTara HQ!");
          logEvent("licence", "ok", "i-star", "<b>School rating submitted</b> (" + selectedReviewStars + "/5 stars sent to HQ)");
        } else {
          setCloudMsg((res && res.message) || "Could not submit review right now. Check your internet connection.", "");
        }
      } finally {
        btn.disabled = false;
        if (btn.textContent === "Sending to CogniTara HQ…") btn.textContent = origLabel;
      }
    });
  }

  /* ------------------------------------------------------------------ SolutionTee Hybrid Paystack Billing (Zero WebView · Zero Inline Iframe) */
  var billingState = {
    stage: "select",
    subview: "method", // "method" | "transfer" | "browser"
    selectedMethod: "card", // "card" | "bank_transfer" | "ussd" | "opay" | "bank_app"
    plans: [],
    plansLoaded: false,
    platform: {},
    selectedPlanId: null,
    currency: "NGN",
    appliedPromo: null,
    pendingRef: null,
    checkoutUrl: null,
    bankTransfer: null,
    activePlanLabel: null,
    activeAmountLabel: null,
    verifying: false
  };

  var checkoutPollTimer = null;
  var checkoutPollCount = 0;
  var btCountdownTimer = null;

  var METHOD_META = {
    card: {
      label: "Card",
      ctaVerb: "with card",
      pill: "Card pre-selected",
      browserTitle: "Paystack Card checkout opened",
      browserSub: "We pre-selected Card for you in your web browser. Enter your Visa, Mastercard or Verve details there — this screen will automatically activate your Ed25519 licence."
    },
    bank_transfer: {
      label: "Bank transfer",
      ctaVerb: "by bank transfer",
      pill: "Paystack Direct",
      browserTitle: "Bank transfer opened in browser",
      browserSub: "Complete your Paystack bank transfer in your browser — this screen will automatically activate your licence once confirmed."
    },
    ussd: {
      label: "USSD",
      ctaVerb: "with USSD",
      pill: "USSD pre-selected",
      browserTitle: "Paystack USSD checkout opened",
      browserSub: "We pre-selected USSD for you in your web browser. Choose your bank and dial the code on your phone — this screen checks automatically."
    },
    opay: {
      label: "OPay",
      ctaVerb: "with OPay",
      pill: "OPay / Bank app",
      browserTitle: "Paystack OPay checkout opened",
      browserSub: "Complete payment via OPay in your web browser — CogniTara Studio is polling automatically and will unlock your licence the moment Paystack confirms."
    },
    bank_app: {
      label: "Bank app",
      ctaVerb: "with bank app",
      pill: "Bank app pre-selected",
      browserTitle: "Paystack Bank App checkout opened",
      browserSub: "Approve the transfer in your bank app via your web browser — CogniTara Studio will automatically bind your Ed25519 licence."
    }
  };

  function fmtMoney(minor, currency) {
    var val = (Number(minor || 0) / 100);
    if (currency === "USD") return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    return "₦" + val.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function setBillingMsg(errText, okText) {
    var eEl = $("#billingErr"), oEl = $("#billingOk");
    if (eEl) { eEl.hidden = !errText; eEl.textContent = errText || ""; }
    if (oEl) { oEl.hidden = !okText; oEl.textContent = okText || ""; }
  }

  function stopCheckoutPolling() {
    if (checkoutPollTimer) {
      clearTimeout(checkoutPollTimer);
      checkoutPollTimer = null;
    }
    checkoutPollCount = 0;
  }

  function stopBtCountdown() {
    if (btCountdownTimer) {
      clearInterval(btCountdownTimer);
      btCountdownTimer = null;
    }
  }

  // Compatibility shims for view navigation & palette cleanup hooks
  function warmPaystackSdk() { return null; }
  function setPaystackOverlaySuspended() {}
  function closeActivePaystackSdk(keepPoll) {
    stopBtCountdown();
    if (!keepPoll) stopCheckoutPolling();
  }

  function formatAccessUntilDate(durationDays) {
    if (durationDays === null || durationDays === undefined || durationDays === "") {
      return "Perpetual licence (no expiry)";
    }
    var days = Number(durationDays);
    if (!days || days <= 0) return "Perpetual licence";
    var dt = new Date(Date.now() + days * 86400 * 1000);
    return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function getSelectedPlanPricing() {
    var plan = billingState.plans.find(function (p) { return p.id === billingState.selectedPlanId; }) || billingState.plans[0];
    if (!plan) return null;
    var origMinor = billingState.currency === "USD" ? Number(plan.price_usd_cents || 0) : Number(plan.price_ngn_kobo || 0);
    var hasPromo = Boolean(
      billingState.appliedPromo &&
      (!billingState.appliedPromo.plan_id || billingState.appliedPromo.plan_id === plan.id)
    );
    var discMinor = hasPromo ? Number(billingState.appliedPromo.discount_amount_minor || 0) : 0;
    var finalMinor = Math.max(0, origMinor - discMinor);
    return {
      plan: plan,
      origMinor: origMinor,
      discMinor: discMinor,
      finalMinor: finalMinor,
      totalLabel: fmtMoney(finalMinor, billingState.currency),
      promoCode: hasPromo ? billingState.appliedPromo.code : null
    };
  }

  function syncCheckoutMethodUi() {
    var info = getSelectedPlanPricing();
    var meta = METHOD_META[billingState.selectedMethod] || METHOD_META.card;
    $$("#ckMethodsList .ck-method").forEach(function (el) {
      var isSel = el.dataset.method === billingState.selectedMethod;
      el.classList.toggle("is-selected", isSel);
      el.setAttribute("aria-checked", isSel ? "true" : "false");
    });

    if (info) {
      if ($("#ckSumPlan")) $("#ckSumPlan").textContent = info.plan.display_name;
      if ($("#ckSumAccessUntil")) $("#ckSumAccessUntil").textContent = formatAccessUntilDate(info.plan.duration_days);
      if ($("#ckSumDiscRow")) $("#ckSumDiscRow").hidden = !(info.discMinor > 0);
      if ($("#ckSumDiscVal") && info.discMinor > 0) {
        $("#ckSumDiscVal").textContent = "-" + fmtMoney(info.discMinor, billingState.currency) + (info.promoCode ? " (" + info.promoCode + ")" : "");
      }
      if ($("#ckSumTotal")) $("#ckSumTotal").textContent = info.totalLabel;
      var feeMode = billingState.platform && billingState.platform.paystack_fee_mode;
      if ($("#ckSumFeeNote")) {
        $("#ckSumFeeNote").textContent =
          feeMode === "merchant"
            ? "Zero extra processing fees — covered by CogniTara."
            : "+ Paystack's processing fee, shown on the next screen before you pay.";
      }
      if ($("#ckPromoToggleLabel")) {
        $("#ckPromoToggleLabel").textContent = info.promoCode
          ? "Discount applied: " + info.promoCode
          : "Have a discount code?";
      }
      if ($("#ckPayNowBtn")) {
        $("#ckPayNowBtn").textContent = info.finalMinor === 0
          ? "Activate free order now"
          : ("Pay " + info.totalLabel + " " + meta.ctaVerb);
      }
    }
    var isTest = Boolean(billingState.platform && billingState.platform.paystack_mode === "test");
    if ($("#psStageTestBadge")) $("#psStageTestBadge").hidden = !isTest;
  }

  function setCheckoutSubview(subview) {
    billingState.subview = subview;
    var root = $("#ckShellRoot");
    if (root) root.dataset.subview = subview;
    var map = {
      method: $("#bsMethodPane"),
      transfer: $("#bsBankTransferPane"),
      browser: $("#bsBrowserWaitPane")
    };
    Object.keys(map).forEach(function (k) {
      if (map[k]) map[k].hidden = k !== subview;
    });
    if (subview !== "transfer") stopBtCountdown();
    if (subview === "method") {
      stopCheckoutPolling();
      syncCheckoutMethodUi();
    }
  }

  function setBillingStage(nextStage) {
    billingState.stage = nextStage;
    var view = $("#billingView");
    if (view) view.dataset.bstage = nextStage;
    var map = {
      select: $("#billingStageSelect"),
      checkout: $("#billingStageCheckout"),
      receipt: $("#billingStageReceipt")
    };
    Object.keys(map).forEach(function (k) {
      if (map[k]) {
        map[k].hidden = k !== nextStage;
        map[k].classList.toggle("is-active", k === nextStage);
      }
    });
    var order = ["select", "checkout", "receipt"];
    var idx = order.indexOf(nextStage);
    $$("#billingFlowSteps li").forEach(function (li, i) {
      li.classList.toggle("is-active", i === idx);
      li.classList.toggle("is-done", i < idx);
    });
    if (nextStage !== "checkout") {
      closeActivePaystackSdk(false);
    }
  }

  function switchBillingTab(tab) {
    setBillingStage("select");
    $$("#billingTabs button").forEach(function (b) { b.classList.toggle("is-active", b.dataset.btab === tab); });
    if ($("#billingPlansPane")) $("#billingPlansPane").hidden = tab !== "plans";
    if ($("#billingRedeemPane")) $("#billingRedeemPane").hidden = tab !== "redeem";
    if ($("#billingCurrencySeg")) $("#billingCurrencySeg").hidden = tab !== "plans";
    setBillingMsg("", "");
  }

  function startBtCountdown(expiresAtIso) {
    stopBtCountdown();
    var targetMs = expiresAtIso ? new Date(expiresAtIso).getTime() : (Date.now() + 25 * 60 * 1000);
    if (isNaN(targetMs) || targetMs <= Date.now()) {
      targetMs = Date.now() + 25 * 60 * 1000;
    }
    var tick = function () {
      var leftSec = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
      var mm = String(Math.floor(leftSec / 60)).padStart(2, "0");
      var ss = String(leftSec % 60).padStart(2, "0");
      var el = $("#btCountdown");
      if (el) el.textContent = mm + ":" + ss;
      if (leftSec <= 0) {
        stopBtCountdown();
        if ($("#btPollStatus")) {
          $("#btPollStatus").textContent = "This one-time account expired. Go back to generate a fresh transfer account.";
        }
      }
    };
    tick();
    btCountdownTimer = setInterval(tick, 1000);
  }

  function startPaymentConfirmationPolling(ref, statusElId) {
    stopCheckoutPolling();
    if (!ref || !bridge) return;
    var poll = async function () {
      if (billingState.stage !== "checkout" || state.activeView !== "billing" || billingState.pendingRef !== ref) {
        stopCheckoutPolling();
        return;
      }
      checkoutPollCount += 1;
      var stEl = statusElId ? $(statusElId) : null;
      if (stEl) {
        stEl.textContent = "Checking Paystack automatically… (check #" + checkoutPollCount + ")";
      }
      if (!billingState.verifying) {
        try {
          var res = await bridge.verifyPaystackReference(ref);
          if (res && res.ok) {
            stopCheckoutPolling();
            stopBtCountdown();
            billingState.pendingRef = null;
            billingState.checkoutUrl = null;
            billingState.bankTransfer = null;
            if ($("#billingPendingRefBox")) $("#billingPendingRefBox").hidden = true;
            toast("Payment confirmed & licence active!");
            await refreshLicenceFromEngine();
            showBillingReceipt({
              ok: true,
              source: "paystack",
              reference: ref,
              receipt: res.receipt || null,
              license: res.license,
              license_key: res.license_key,
              message: res.message || "Payment confirmed and Ed25519 licence activated!"
            });
            return;
          }
        } catch (_e) {}
      }
      if (checkoutPollCount < 120) {
        checkoutPollTimer = setTimeout(poll, 4500);
      } else if (stEl) {
        stEl.textContent = "Still awaiting bank confirmation — click the confirmation button below once transfer completes.";
      }
    };
    checkoutPollTimer = setTimeout(poll, 4000);
  }

  function showBankTransferSubview(bt) {
    bt = bt || {};
    billingState.bankTransfer = bt;
    billingState.pendingRef = bt.reference || billingState.pendingRef;
    var curr = bt.currency || billingState.currency || "NGN";
    var amtLabel = bt.charge_minor != null ? fmtMoney(bt.charge_minor, curr) : (billingState.activeAmountLabel || "₦75,000");

    if ($("#bsPendingRef")) $("#bsPendingRef").textContent = billingState.pendingRef || "—";
    if ($("#billingPendingRefBox")) $("#billingPendingRefBox").hidden = !billingState.pendingRef;

    if ($("#btExactAmount")) $("#btExactAmount").textContent = amtLabel;
    if ($("#btBankName")) $("#btBankName").textContent = bt.bank_name || "Paystack-Titan";
    if ($("#btAccountNumber")) $("#btAccountNumber").textContent = bt.account_number || "9904821735";
    if ($("#btAccountName")) $("#btAccountName").textContent = bt.account_name || "PAYSTACK CHECKOUT";
    if ($("#btAmountVal")) $("#btAmountVal").textContent = amtLabel;
    if ($("#btRefVal")) $("#btRefVal").textContent = billingState.pendingRef || "—";
    if ($("#btPollStatus")) $("#btPollStatus").textContent = "Checking Paystack automatically every few seconds…";

    setBillingMsg("", "");
    setBillingStage("checkout");
    setCheckoutSubview("transfer");
    startBtCountdown(bt.account_expires_at || "");
    startPaymentConfirmationPolling(billingState.pendingRef, "#btPollStatus");
  }

  function showBrowserWaitSubview(res) {
    res = res || {};
    var method = res.method || billingState.selectedMethod || "card";
    var meta = METHOD_META[method] || METHOD_META.card;
    var curr = res.currency || billingState.currency || "NGN";
    var amtLabel = res.charge_minor != null ? fmtMoney(res.charge_minor, curr) : (billingState.activeAmountLabel || "₦75,000");

    billingState.pendingRef = res.reference || billingState.pendingRef;
    billingState.checkoutUrl = res.authorization_url || billingState.checkoutUrl;

    if ($("#bsPendingRef")) $("#bsPendingRef").textContent = billingState.pendingRef || "—";
    if ($("#billingPendingRefBox")) $("#billingPendingRefBox").hidden = !billingState.pendingRef;

    if ($("#bwChannelPill")) $("#bwChannelPill").textContent = meta.pill;
    if ($("#bwTitle")) $("#bwTitle").textContent = meta.browserTitle;
    if ($("#bwSub")) $("#bwSub").textContent = meta.browserSub;
    if ($("#bwPlanName")) $("#bwPlanName").textContent = res.plan_name || billingState.activePlanLabel || "CogniTara Licence";
    if ($("#bwAmountVal")) $("#bwAmountVal").textContent = amtLabel;
    if ($("#bwRefVal")) $("#bwRefVal").textContent = billingState.pendingRef || "—";
    if ($("#bwPollStatus")) $("#bwPollStatus").textContent = "Checking Paystack automatically every few seconds…";
    if ($("#bwReopenBtn")) $("#bwReopenBtn").hidden = !billingState.checkoutUrl;

    setBillingMsg("", "");
    setBillingStage("checkout");
    setCheckoutSubview("browser");
    startPaymentConfirmationPolling(billingState.pendingRef, "#bwPollStatus");
  }

  var activeReceiptRef = null;
  var activeReceiptKey = null;
  function showBillingReceipt(evt) {
    var receipt = (evt && evt.receipt) || {};
    var lic = (evt && evt.license) || {};
    var planObj = billingState.plans.find(function (p) { return p.id === billingState.selectedPlanId; });
    var planLabel = receipt.plan_name || (lic.plan_tier ? planDisplayName(lic.plan_tier) : (planObj ? planObj.display_name : "CogniTara Licence"));
    var curr = receipt.currency || billingState.currency || "NGN";
    var paidMinor = receipt.customer_paid_minor != null ? receipt.customer_paid_minor : receipt.amount_minor;
    var amountText = evt && evt.source === "redeem"
      ? "Redeemed voucher (Free)"
      : (paidMinor != null ? fmtMoney(paidMinor, curr) : (planObj ? fmtMoney(curr === "USD" ? planObj.price_usd_cents : planObj.price_ngn_kobo, curr) : "Paid"));
    var ref = (evt && evt.reference) || receipt.reference || "";
    var licKey = (evt && evt.license_key) || receipt.license_key || lic.license_key || "";
    var expText = receipt.expires_at || lic.expires_at ? ("Active · expires " + fmtDateShort(receipt.expires_at || lic.expires_at)) : "Active on this PC";

    activeReceiptRef = ref || null;
    activeReceiptKey = licKey || null;

    setBillingMsg("", "");
    if ($("#brTitle")) {
      $("#brTitle").textContent = evt && evt.source === "redeem"
        ? "Voucher redeemed & licence activated"
        : "Payment confirmed & licence activated";
    }
    if ($("#brSub")) {
      $("#brSub").textContent = (evt && evt.message) ||
        "Your signed Ed25519 licence is now active on this computer and a payment receipt has been sent to your school email.";
    }
    if ($("#brPlan")) $("#brPlan").textContent = planLabel;
    if ($("#brAmount")) $("#brAmount").textContent = amountText + (receipt.is_test ? " (Test Mode)" : "");
    if ($("#brRefRow")) $("#brRefRow").hidden = !ref;
    if ($("#brRef")) $("#brRef").textContent = ref || "—";
    if ($("#brKeyRow")) $("#brKeyRow").hidden = !licKey;
    if ($("#brKey")) $("#brKey").textContent = licKey || "—";
    if ($("#brStatus")) $("#brStatus").textContent = expText;
    if ($("#brOpenWebReceiptBtn")) $("#brOpenWebReceiptBtn").hidden = !ref;
    if ($("#brDoneBtn")) {
      $("#brDoneBtn").textContent = returnFlow && returnFlow.mode === "onboarding"
        ? "Continue setup"
        : "Continue to Studio";
    }

    openFullScreenFlow("billing");
    setBillingStage("receipt");
  }

  if ($("#brCopyKeyBtn")) {
    $("#brCopyKeyBtn").addEventListener("click", function () {
      if (!activeReceiptKey) return;
      if (navigator.clipboard) navigator.clipboard.writeText(activeReceiptKey).catch(function () {});
      toast("Licence key copied to clipboard");
    });
  }
  if ($("#brOpenWebReceiptBtn")) {
    $("#brOpenWebReceiptBtn").addEventListener("click", function () {
      if (!activeReceiptRef) return;
      var base = (state.cloudAccount && state.cloudAccount.cloudUrl) || "https://cognitara-cloud.vercel.app";
      openExternalUrl(base + "/pay/done?reference=" + encodeURIComponent(activeReceiptRef));
    });
  }
  if ($("#brDoneBtn")) {
    $("#brDoneBtn").addEventListener("click", function () {
      setBillingStage("select");
      exitSubflow("licence");
    });
  }
  if ($("#billingBackToPlansBtn")) {
    $("#billingBackToPlansBtn").addEventListener("click", function () {
      setBillingStage("select");
    });
  }
  if ($("#btBackBtn")) {
    $("#btBackBtn").addEventListener("click", function () {
      setCheckoutSubview("method");
    });
  }
  if ($("#bwBackBtn")) {
    $("#bwBackBtn").addEventListener("click", function () {
      setCheckoutSubview("method");
    });
  }
  if ($("#ckPromoToggleBtn")) {
    $("#ckPromoToggleBtn").addEventListener("click", function () {
      var body = $("#ckPromoBody");
      if (!body) return;
      var open = body.hidden;
      body.hidden = !open;
      this.setAttribute("aria-expanded", open ? "true" : "false");
      if (open && $("#ckStagePromoInput")) $("#ckStagePromoInput").focus();
    });
  }
  $$("#ckMethodsList .ck-method").forEach(function (btn) {
    btn.addEventListener("click", function () {
      billingState.selectedMethod = btn.dataset.method || "card";
      syncCheckoutMethodUi();
    });
  });
  if ($("#btCopyAcctBtn")) {
    $("#btCopyAcctBtn").addEventListener("click", function () {
      var num = ($("#btAccountNumber") && $("#btAccountNumber").textContent || "").trim();
      if (!num || num === "—") return;
      if (navigator.clipboard) navigator.clipboard.writeText(num).catch(function () {});
      toast("Account number copied: " + num);
    });
  }
  if ($("#btCopyAmtBtn")) {
    $("#btCopyAmtBtn").addEventListener("click", function () {
      var rawMinor = billingState.bankTransfer && billingState.bankTransfer.charge_minor;
      var copyVal = rawMinor != null ? String(Math.round(Number(rawMinor) / 100)) : (($("#btAmountVal") && $("#btAmountVal").textContent) || "").replace(/[^\d.]/g, "");
      if (!copyVal) return;
      if (navigator.clipboard) navigator.clipboard.writeText(copyVal).catch(function () {});
      toast("Exact amount copied: " + copyVal);
    });
  }
  if ($("#bwReopenBtn")) {
    $("#bwReopenBtn").addEventListener("click", function () {
      if (billingState.checkoutUrl) {
        openExternalUrl(billingState.checkoutUrl);
        toast("Reopened Paystack checkout in your browser");
      }
    });
  }
  if ($("#btSentBtn")) {
    $("#btSentBtn").addEventListener("click", function () {
      if (!bridge) {
        showBillingReceipt({
          ok: true,
          source: "paystack",
          reference: billingState.pendingRef || "CTPAY_2026_BT88",
          license_key: "CGNT-8F4B-7E2C-91A0-55D2",
          receipt: {
            plan_name: billingState.activePlanLabel || "Annual School",
            currency: billingState.currency,
            amount_minor: 7500000,
            customer_paid_minor: 7500000,
            expires_at: "2027-11-26T00:00:00Z"
          }
        });
        return;
      }
      if (billingState.pendingRef) void verifyPendingPaystackRef(billingState.pendingRef, 2);
    });
  }
  if ($("#bwVerifyBtn")) {
    $("#bwVerifyBtn").addEventListener("click", function () {
      if (!bridge) {
        showBillingReceipt({
          ok: true,
          source: "paystack",
          reference: billingState.pendingRef || "CTPAY_2026_CRD88",
          license_key: "CGNT-8F4B-7E2C-91A0-55D2",
          receipt: {
            plan_name: billingState.activePlanLabel || "Annual School",
            currency: billingState.currency,
            amount_minor: 7500000,
            customer_paid_minor: 7500000,
            expires_at: "2027-11-26T00:00:00Z"
          }
        });
        return;
      }
      if (billingState.pendingRef) void verifyPendingPaystackRef(billingState.pendingRef, 1);
    });
  }

  function getPlanEmblemSvg(slug, idx) {
    var key = String(slug || "").toLowerCase();
    if (key.indexOf("lifetime") > -1 || key.indexOf("perpetual") > -1 || idx === 3) {
      // Crystalline institutional lattice + radiant crown
      return "<svg viewBox='0 0 44 44' aria-hidden='true'>" +
        "<circle class='em-path' cx='22' cy='10' r='3.5'/>" +
        "<path class='em-path' d='M22 13.5V35'/>" +
        "<path class='em-path' d='M22 19L12 14M22 19L32 14'/>" +
        "<path class='em-path' d='M22 25L10 21M22 25L34 21'/>" +
        "<path class='em-path' d='M22 31L13 28M22 31L31 28'/>" +
        "<circle class='em-path' cx='10' cy='13' r='2.2'/><circle class='em-path' cx='34' cy='13' r='2.2'/>" +
        "<circle class='em-path' cx='8' cy='20.5' r='2'/><circle class='em-path' cx='36' cy='20.5' r='2'/>" +
        "<circle class='em-path' cx='11.5' cy='27.5' r='1.8'/><circle class='em-path' cx='32.5' cy='27.5' r='1.8'/>" +
        "</svg>";
    }
    if (key.indexOf("annual") > -1 || key.indexOf("year") > -1 || idx === 2) {
      // Full 3-tier symmetrical academic tree
      return "<svg viewBox='0 0 44 44' aria-hidden='true'>" +
        "<circle class='em-path' cx='22' cy='10' r='4'/>" +
        "<circle class='em-path' cx='22' cy='10' r='1.4'/>" +
        "<path class='em-path' d='M22 14V35'/>" +
        "<path class='em-path' d='M22 20L13 15.5M22 20L31 15.5'/>" +
        "<path class='em-path' d='M22 27L12 22.5M22 27L32 22.5'/>" +
        "<path class='em-path' d='M22 33L15 30M22 33L29 30'/>" +
        "<circle class='em-path' cx='11.5' cy='15' r='2'/><circle class='em-path' cx='32.5' cy='15' r='2'/>" +
        "<circle class='em-path' cx='10.5' cy='22' r='2'/><circle class='em-path' cx='33.5' cy='22' r='2'/>" +
        "</svg>";
    }
    if (key.indexOf("term") > -1 || idx === 0) {
      // Dual-branch term node emblem
      return "<svg viewBox='0 0 44 44' aria-hidden='true'>" +
        "<circle class='em-path' cx='22' cy='11' r='4.2'/>" +
        "<circle class='em-path' cx='22' cy='11' r='1.5'/>" +
        "<path class='em-path' d='M22 15.2V35'/>" +
        "<path class='em-path' d='M22 22L13 18M22 22L31 18'/>" +
        "<path class='em-path' d='M22 29L14 25.5M22 29L30 25.5'/>" +
        "<circle class='em-path' cx='11.5' cy='17.5' r='2.1'/><circle class='em-path' cx='32.5' cy='17.5' r='2.1'/>" +
        "<circle class='em-path' cx='12.5' cy='25' r='1.9'/><circle class='em-path' cx='31.5' cy='25' r='1.9'/>" +
        "</svg>";
    }
    // Clean minimal starter stem emblem (Monthly)
    return "<svg viewBox='0 0 44 44' aria-hidden='true'>" +
      "<circle class='em-path' cx='22' cy='12' r='4.5'/>" +
      "<circle class='em-path' cx='22' cy='12' r='1.6'/>" +
      "<path class='em-path' d='M22 16.5V35'/>" +
      "<path class='em-path' d='M22 25L14 21.5M22 25L30 21.5'/>" +
      "<circle class='em-path' cx='12.5' cy='21' r='2'/><circle class='em-path' cx='31.5' cy='21' r='2'/>" +
      "</svg>";
  }

  function getPlanDefaults(p) {
    var slug = String(p.slug || p.display_name || "").toLowerCase();
    var lease = p.lease_days || 14;
    if (slug.indexOf("lifetime") > -1 || !p.duration_days) {
      return {
        desc: "One-time institutional licence with perpetual offline operation.",
        kicker: "Everything in Annual, plus:",
        cadenceTop: billingState.currency + " / one-time",
        cadenceSub: lease + "-day offline lease",
        cta: "Get Lifetime plan",
        featured: false,
        feats: [
          "Perpetual school licence — zero renewals",
          lease + "-day extended offline check-in window",
          "Unlimited exams, students & question banks",
          "Encrypted CogniTara Cloud backups & sync",
          "Priority support & lifetime Studio updates"
        ]
      };
    }
    if (slug.indexOf("annual") > -1 || (p.duration_days && p.duration_days >= 300)) {
      return {
        desc: "Complete academic year coverage for secondary & primary schools.",
        kicker: "Everything in Termly, plus:",
        cadenceTop: billingState.currency + " / 365 days",
        cadenceSub: lease + "-day offline lease",
        cta: "Get Annual plan",
        featured: true,
        feats: [
          "Full 365-day academic session coverage",
          lease + "-day offline lease without internet",
          "Unlimited exams, students & Common Entrance",
          "Automated encrypted Cloud & local backups",
          "Analytics, grading schemes & progression"
        ]
      };
    }
    if (slug.indexOf("term") > -1 || (p.duration_days && p.duration_days >= 90)) {
      return {
        desc: "Purpose-built for a full academic term of continuous testing.",
        kicker: "Everything in Monthly, plus:",
        cadenceTop: billingState.currency + " / " + (p.duration_days || 120) + " days",
        cadenceSub: lease + "-day offline lease",
        cta: "Get Termly plan",
        featured: true,
        feats: [
          "Full " + (p.duration_days || 120) + "-day academic term coverage",
          lease + "-day offline LAN exam window",
          "Unlimited exams, students & question banks",
          "Encrypted CogniTara Cloud backup sync"
        ]
      };
    }
    return {
      desc: "Flexible 30-day licence for assessments and mid-term sprints.",
      kicker: "Included in Monthly:",
      cadenceTop: billingState.currency + " / " + (p.duration_days || 30) + " days",
      cadenceSub: lease + "-day offline lease",
      cta: "Get Monthly plan",
      featured: false,
      feats: [
        "30-day school CBT server licence",
        lease + "-day offline exam room operation",
        "Unlimited students on local Wi-Fi / LAN",
        "Auto-save scripts & instant grading"
      ]
    };
  }

  function renderBillingPlans() {
    var grid = $("#billingPlansGrid");
    if (!grid) return;
    if (!billingState.plans.length) {
      grid.innerHTML = "<div class='billing-loading'>No active plans available right now.</div>";
      return;
    }
    var signedIn = Boolean(state.cloudAccount && state.cloudAccount.signedIn);
    var checkSvg = "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M20 6 9 17l-5-5'/></svg>";

    grid.innerHTML = billingState.plans.map(function (p, idx) {
      var defaults = getPlanDefaults(p);
      var origMinor = billingState.currency === "USD" ? p.price_usd_cents : p.price_ngn_kobo;
      var hasPromoForPlan = Boolean(
        billingState.appliedPromo &&
        (!billingState.appliedPromo.plan_id || billingState.appliedPromo.plan_id === p.id || billingState.selectedPlanId === p.id)
      );
      var discMinor = hasPromoForPlan ? Number(billingState.appliedPromo.discount_amount_minor || 0) : 0;
      var finalMinor = Math.max(0, origMinor - discMinor);
      var feats = (p.features && Array.isArray(p.features.highlights) && p.features.highlights.length >= 3)
        ? p.features.highlights.slice(0, 5)
        : defaults.feats;
      var isFeatured = Boolean(defaults.featured || (p.badge && /popular|best/i.test(p.badge)));
      var ctaClass = isFeatured ? "bplan-card__cta bplan-card__cta--solid" : "bplan-card__cta bplan-card__cta--soft";
      var ctaLabel = (finalMinor === 0 && hasPromoForPlan)
        ? "Activate free order"
        : (signedIn ? defaults.cta : "Sign in to choose");

      return "<article class='bplan-card" + (isFeatured ? " is-featured" : "") + "' data-plan-id='" + esc(p.id) + "'>" +
        "<div class='bplan-card__head'>" +
          "<div class='bplan-card__emblem'>" + getPlanEmblemSvg(p.slug, idx) + "</div>" +
          (p.badge ? "<span class='bplan-card__tag'>" + esc(p.badge) + "</span>" : "") +
        "</div>" +
        "<div class='bplan-card__title'>" + esc(p.display_name) + "</div>" +
        "<div class='bplan-card__desc'>" + esc((p.features && p.features.subtitle) || defaults.desc) + "</div>" +
        "<div class='bplan-card__price-row'>" +
          "<div class='bplan-card__price'>" +
            (discMinor > 0 ? "<span class='bplan-card__strike'>" + fmtMoney(origMinor, billingState.currency) + "</span>" : "") +
            fmtMoney(finalMinor, billingState.currency) +
          "</div>" +
          "<div class='bplan-card__cadence'><span>" + esc(defaults.cadenceTop) + "</span><span>" + esc(defaults.cadenceSub) + "</span></div>" +
        "</div>" +
        "<button type='button' class='" + ctaClass + "' data-plan-cta='" + esc(p.id) + "'>" + esc(ctaLabel) + "</button>" +
        "<div class='bplan-card__note'>Instant activation · Works offline</div>" +
        "<div class='bplan-card__divider'></div>" +
        "<div class='bplan-card__kicker'>" + esc(defaults.kicker) + "</div>" +
        "<ul class='bplan-card__feats'>" +
          feats.map(function (f) { return "<li>" + checkSvg + "<span>" + esc(f) + "</span></li>"; }).join("") +
        "</ul>" +
      "</article>";
    }).join("");

    $$("#billingPlansGrid [data-plan-cta]").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var pid = btn.getAttribute("data-plan-cta");
        billingState.selectedPlanId = pid;
        renderBillingSummary();
        void startCheckoutForPlan(pid, btn);
      });
    });

    renderBillingSummary();
  }

  function renderBillingSummary() {
    var plan = billingState.plans.find(function (p) { return p.id === billingState.selectedPlanId; }) || billingState.plans[0];
    var signedIn = Boolean(state.cloudAccount && state.cloudAccount.signedIn);
    if ($("#billingSignInHintBtn")) $("#billingSignInHintBtn").hidden = signedIn;
    if (!plan) {
      if ($("#bsPlanName")) $("#bsPlanName").textContent = "Select a plan";
      if ($("#bsTotalVal")) $("#bsTotalVal").textContent = "—";
      if ($("#bsDiscountRow")) $("#bsDiscountRow").hidden = true;
      return;
    }
    var origMinor = billingState.currency === "USD" ? plan.price_usd_cents : plan.price_ngn_kobo;
    var discMinor = billingState.appliedPromo ? Number(billingState.appliedPromo.discount_amount_minor || 0) : 0;
    var finalMinor = Math.max(0, origMinor - discMinor);

    if ($("#bsPlanName")) $("#bsPlanName").textContent = plan.display_name;
    if (discMinor > 0) {
      if ($("#bsDiscountRow")) $("#bsDiscountRow").hidden = false;
      if ($("#bsDiscountVal")) $("#bsDiscountVal").textContent = "-" + fmtMoney(discMinor, billingState.currency) + " (" + billingState.appliedPromo.code + ")";
      if ($("#bsTotalVal")) $("#bsTotalVal").innerHTML = "<span class='billing-summary__strike'>" + fmtMoney(origMinor, billingState.currency) + "</span>" + fmtMoney(finalMinor, billingState.currency);
    } else {
      if ($("#bsDiscountRow")) $("#bsDiscountRow").hidden = true;
      if ($("#bsTotalVal")) $("#bsTotalVal").textContent = fmtMoney(finalMinor, billingState.currency);
    }
  }

  async function loadBillingPlansIfNeeded(force) {
    if (!bridge || !bridge.getBillingPlans) {
      if (!billingState.plans.length) renderBillingPlans();
      return;
    }
    if (billingState.plansLoaded && !force && billingState.plans.length) {
      renderBillingPlans();
      return;
    }
    var res = await bridge.getBillingPlans().catch(function () { return null; });
    if (res && res.ok && Array.isArray(res.plans)) {
      billingState.plans = res.plans;
      billingState.plansLoaded = true;
      billingState.platform = res.platform || {};
      if (!billingState.selectedPlanId && res.plans.length) {
        var preferred = res.plans.find(function (p) { return p.slug === "annual" || p.slug === "termly"; }) || res.plans[0];
        billingState.selectedPlanId = preferred.id;
      }
      renderBillingPlans();
    } else {
      setBillingMsg((res && res.message) || "Connect to the internet to load live plans from CogniTara Cloud.", "");
    }
  }

  async function openBillingModal(initialTab) {
    setBillingMsg("", "");
    switchBillingTab(initialTab || "plans");
    if ($("#billingPendingRefBox")) $("#billingPendingRefBox").hidden = !billingState.pendingRef;
    openFullScreenFlow("billing");
    await loadBillingPlansIfNeeded(true);
  }

  function closeBillingModal() {
    setBillingStage("select");
    exitSubflow("licence");
  }

  $$("#billingTabs button").forEach(function (b) {
    b.addEventListener("click", function () { switchBillingTab(b.dataset.btab); });
  });
  $$("#billingCurrencySeg button").forEach(function (b) {
    b.addEventListener("click", function () {
      billingState.currency = b.dataset.curr;
      billingState.appliedPromo = null;
      $$("#billingCurrencySeg button").forEach(function (x) { x.classList.toggle("is-active", x.dataset.curr === billingState.currency); });
      renderBillingPlans();
    });
  });

  if ($("#billingSignInHintBtn")) {
    $("#billingSignInHintBtn").addEventListener("click", function () {
      reopenBillingAfterAuth = true;
      openCloudModal("signup");
    });
  }

  async function applyBillingPromoCode(rawCode) {
    var code = String(rawCode || "").trim().toUpperCase();
    if (!code) { setBillingMsg("Enter a promo or redeem code first.", ""); return; }
    setBillingMsg("", "");
    var targetPlanId = billingState.selectedPlanId || (billingState.plans[0] && billingState.plans[0].id);
    var res = bridge && bridge.validatePromoCode
      ? await bridge.validatePromoCode({ code: code, plan_id: targetPlanId, currency: billingState.currency })
      : { ok: false, message: "Desktop IPC unavailable." };
    if (!res || !res.ok) {
      billingState.appliedPromo = null;
      renderBillingPlans();
      syncCheckoutMethodUi();
      setBillingMsg((res && res.message) || "Invalid code.", "");
      return;
    }
    if (res.code_type === "redeem") {
      $("#billingRedeemInput").value = code;
      switchBillingTab("redeem");
      setBillingMsg("", res.message || "Valid redeem voucher! Click Redeem & activate now.");
      return;
    }
    billingState.appliedPromo = res;
    if ($("#billingPromoInput")) $("#billingPromoInput").value = code;
    if ($("#ckStagePromoInput")) $("#ckStagePromoInput").value = code;
    renderBillingPlans();
    syncCheckoutMethodUi();
    setBillingMsg("", res.message || "Discount applied!");
  }

  if ($("#billingApplyPromoBtn")) {
    $("#billingApplyPromoBtn").addEventListener("click", function () {
      void applyBillingPromoCode($("#billingPromoInput").value);
    });
  }
  if ($("#ckStagePromoApplyBtn")) {
    $("#ckStagePromoApplyBtn").addEventListener("click", function () {
      void applyBillingPromoCode($("#ckStagePromoInput").value);
    });
  }

  async function verifyPendingPaystackRef(refToVerify, autoRetries) {
    if (!refToVerify || !bridge || billingState.verifying) return;
    billingState.verifying = true;
    var retriesLeft = typeof autoRetries === "number" ? autoRetries : 0;
    var btBtn = $("#btSentBtn");
    var bwBtn = $("#bwVerifyBtn");
    var resBtn = $("#billingResumeVerifyBtn");
    if (btBtn) { btBtn.disabled = true; btBtn.textContent = "Checking Paystack…"; }
    if (bwBtn) { bwBtn.disabled = true; bwBtn.textContent = "Checking Paystack…"; }
    if (resBtn) { resBtn.disabled = true; resBtn.textContent = "Verifying…"; }
    try {
      var attempt = 0;
      var lastRes = null;
      while (attempt <= retriesLeft) {
        if ($("#btPollStatus") && billingState.subview === "transfer") {
          $("#btPollStatus").textContent = "Verifying bank transfer with Paystack… (check " + (attempt + 1) + ")";
        }
        if ($("#bwPollStatus") && billingState.subview === "browser") {
          $("#bwPollStatus").textContent = "Verifying browser checkout with Paystack… (check " + (attempt + 1) + ")";
        }
        lastRes = await bridge.verifyPaystackReference(refToVerify).catch(function () { return null; });
        if (lastRes && lastRes.ok) {
          stopCheckoutPolling();
          stopBtCountdown();
          billingState.pendingRef = null;
          billingState.checkoutUrl = null;
          billingState.bankTransfer = null;
          if ($("#billingPendingRefBox")) $("#billingPendingRefBox").hidden = true;
          toast("Paystack payment verified & licence active!");
          await refreshLicenceFromEngine();
          showBillingReceipt({
            ok: true,
            source: "paystack",
            reference: refToVerify,
            receipt: lastRes.receipt || null,
            license: lastRes.license,
            license_key: lastRes.license_key,
            message: lastRes.message || "Payment confirmed and licence activated!"
          });
          return;
        }
        attempt += 1;
        if (attempt <= retriesLeft) {
          await new Promise(function (resolve) { setTimeout(resolve, 1500 + attempt * 800); });
        }
      }

      setBillingMsg(
        (lastRes && lastRes.message) || "Payment not confirmed yet. Transfers can take a few seconds — we're still checking automatically.",
        ""
      );
    } finally {
      billingState.verifying = false;
      if (btBtn) { btBtn.disabled = false; btBtn.textContent = "I have sent the money"; }
      if (bwBtn) { bwBtn.disabled = false; bwBtn.textContent = "I have completed payment"; }
      if (resBtn) { resBtn.disabled = false; resBtn.textContent = "Verify completed payment"; }
    }
  }

  // Step 1 -> Step 2 (Open SolutionTee Checkout Method Selector)
  async function startCheckoutForPlan(planId) {
    setBillingMsg("", "");
    if (planId) billingState.selectedPlanId = planId;
    if (!state.cloudAccount || !state.cloudAccount.signedIn) {
      reopenBillingAfterAuth = true;
      openCloudModal("signup");
      toast("Create or sign in to your school Cloud Account first");
      return;
    }
    if (!billingState.selectedPlanId) {
      setBillingMsg("Please select a subscription plan.", "");
      return;
    }
    var info = getSelectedPlanPricing();
    if (!info) return;

    billingState.activePlanLabel = info.plan.display_name;
    billingState.activeAmountLabel = info.totalLabel;

    if (billingState.appliedPromo && Number(billingState.appliedPromo.final_amount_minor) === 0 && bridge) {
      var rFree = await bridge.redeemVoucherCode({
        code: billingState.appliedPromo.code,
        plan_id: billingState.selectedPlanId,
        currency: billingState.currency
      });
      if (rFree && rFree.ok) {
        toast("Licence activated!");
        await refreshLicenceFromEngine();
        showBillingReceipt({
          ok: true,
          source: "redeem",
          license: rFree.license,
          license_key: rFree.license_key,
          message: rFree.message || "Promo redeemed & licence activated!"
        });
      } else {
        setBillingMsg((rFree && rFree.message) || "Could not activate free order.", "");
      }
      return;
    }

    setBillingStage("checkout");
    setCheckoutSubview("method");
  }

  // Step 2 Sub-view A -> Sub-view B (In-App Bank Transfer Charge API) OR Sub-view C (Pre-Selected Channel Browser Checkout)
  async function executeSelectedPaymentMethod() {
    setBillingMsg("", "");
    var info = getSelectedPlanPricing();
    if (!info) return;
    var method = billingState.selectedMethod || "card";

    if (info.finalMinor === 0 && info.promoCode && bridge) {
      await startCheckoutForPlan(info.plan.id);
      return;
    }

    // Preview mode outside Electron
    if (!bridge) {
      if (method === "bank_transfer") {
        showBankTransferSubview({
          reference: "CTPAY_2026_BT8841",
          bank_name: "Paystack-Titan",
          account_number: "9904821735",
          account_name: "PAYSTACK CHECKOUT",
          account_expires_at: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
          currency: billingState.currency,
          charge_minor: info.finalMinor,
          plan_name: info.plan.display_name
        });
      } else {
        showBrowserWaitSubview({
          method: method,
          reference: "CTPAY_2026_CH9921",
          authorization_url: "https://checkout.paystack.com/demo",
          currency: billingState.currency,
          charge_minor: info.finalMinor,
          plan_name: info.plan.display_name
        });
      }
      return;
    }

    var btn = $("#ckPayNowBtn");
    var prevText = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = method === "bank_transfer" ? "Generating bank account…" : "Opening Paystack checkout…";
    }
    try {
      var res = await bridge.startPaystackCheckout({
        plan_id: info.plan.id,
        currency: billingState.currency,
        promo_code: info.promoCode || undefined,
        amount_label: info.totalLabel,
        method: method
      });
      if (!res || !res.ok) {
        setBillingMsg((res && res.message) || "Could not initialize Paystack checkout.", "");
        return;
      }
      billingState.activePlanLabel = res.plan_name || info.plan.display_name;
      billingState.activeAmountLabel = res.charge_minor != null
        ? fmtMoney(res.charge_minor, res.currency || billingState.currency)
        : info.totalLabel;

      if (res.mode === "native_bank_transfer" && res.account_number) {
        showBankTransferSubview(res);
      } else {
        showBrowserWaitSubview(res);
        toast("Opened Paystack (" + (METHOD_META[method] ? METHOD_META[method].label : method) + ") in your browser");
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevText || "Continue";
      }
      syncCheckoutMethodUi();
    }
  }

  if ($("#ckPayNowBtn")) {
    $("#ckPayNowBtn").addEventListener("click", function () {
      void executeSelectedPaymentMethod();
    });
  }
  if ($("#billingPayBtn")) {
    $("#billingPayBtn").addEventListener("click", function () {
      void startCheckoutForPlan(billingState.selectedPlanId);
    });
  }
  if ($("#billingResumeVerifyBtn")) {
    $("#billingResumeVerifyBtn").addEventListener("click", function () {
      if (billingState.pendingRef) void verifyPendingPaystackRef(billingState.pendingRef, 0);
    });
  }

  if ($("#billingRedeemSubmitBtn")) {
    $("#billingRedeemSubmitBtn").addEventListener("click", async function () {
      setBillingMsg("", "");
      if (!state.cloudAccount || !state.cloudAccount.signedIn) {
        reopenBillingAfterAuth = true;
        openCloudModal("signup");
        toast("Sign in or create your Cloud Account first to redeem a voucher");
        return;
      }
      var code = ($("#billingRedeemInput").value || "").trim().toUpperCase();
      if (!code) { setBillingMsg("Enter a redeem voucher code.", ""); return; }
      var btn = $("#billingRedeemSubmitBtn");
      btn.disabled = true;
      btn.textContent = "Redeeming…";
      try {
        var res = await bridge.redeemVoucherCode({ code: code });
        if (res && res.ok) {
          $("#billingRedeemInput").value = "";
          toast("Licence activated via redeem code!");
          await refreshLicenceFromEngine();
          showBillingReceipt({
            ok: true,
            source: "redeem",
            license: res.license,
            license_key: res.license_key,
            message: res.message || "Voucher redeemed & licence activated!"
          });
        } else {
          setBillingMsg((res && res.message) || "Could not redeem code.", "");
        }
      } finally {
        btn.disabled = false;
        btn.textContent = "Redeem & activate now";
      }
    });
  }

  async function refreshLicenceFromEngine() {
    if (!bridge) return;
    try {
      var licRes = await bridge.getLicenseStatus();
      var lic = (licRes && licRes.license) || licRes;
      if (lic && lic.lock_state) {
        state.license = lic;
        paintLicence();
        if (lic.is_licensed) {
          activated = true;
          paintActivatedVerify();
          syncOnboardingCloudUi();
          updateNext();
        }
        if (lic.is_licensed && state.mode === "lock") {
          if (state.onboardingComplete) enterApp();
          else startOnboarding(state.cloudAccount && state.cloudAccount.signedIn ? 2 : 1);
        }
      }
    } catch (_e) {}
  }

  if (bridge && bridge.onBillingCompleted) {
    bridge.onBillingCompleted(function (evt) {
      if (evt && evt.ok) {
        billingState.pendingRef = null;
        if ($("#billingPendingRefBox")) $("#billingPendingRefBox").hidden = true;
        toast(evt.message || "Licence activated!");
        logEvent("licence", "ok", "i-key", "<b>Licence activated</b> (" + esc(evt.license_key || evt.source || "cloud") + ")");
        refreshLicenceFromEngine();
        showBillingReceipt(evt);
      }
    });
  }

  /* ------------------------------------------------------------------ lock screens */
  var drainLeft = 0;
  function showLock(kind, lic) {
    var lock = $("#lock");
    lock.dataset.kind = kind;
    var L = lic || state.license || {};

    if (kind === "expired") {
      var isLease = L.lock_state === "LEASE_EXPIRED_LOCK";
      $("#lockTitle").textContent = isLease ? "Online check-in required" : "Your licence has ended";
      $("#lockBody").textContent = isLease
        ? "This computer has been offline longer than your plan's check-in window. Connect to the internet and check in, or import a fresh licence file."
        : "The server has stopped accepting new exams. Your exams, questions and results are safe and will be here when you renew.";
      $("#lockMeta").textContent = L.expires_at ? ("Licence ended " + fmtDateShort(L.expires_at)) : "Your local database is safe and intact.";
      $("#lockActions").innerHTML =
        "<button type='button' class='btn btn--primary' data-lock-act='renew'>Renew / Buy Licence</button>" +
        "<button type='button' class='btn btn--ghost' data-lock-act='import'>Import licence file</button>" +
        (isLease ? "<button type='button' class='btn btn--ghost' data-lock-act='checkin'>Check in now</button>" : "");

      var draining = L.lock_state === "DRAINING" || (L.is_draining && Number(L.drain_remaining_seconds || 0) > 0);
      if (draining) {
        drainLeft = Math.max(1, Number(L.drain_remaining_seconds || 900));
        $("#drainCount").textContent = String(L.active_exams_count || 1);
        lock.classList.remove("no-drain");
        tickDrain();
      } else {
        drainLeft = 0;
        lock.classList.add("no-drain");
      }
      setHeaderStatus("locked", draining ? "Finishing exams" : "Locked", draining ? "New exams blocked" : "Licence expired");
    } else if (kind === "clock") {
      var isHwid = L.lock_state === "HWID_MISMATCH_LOCK";
      var isActualClockRollback = Boolean(
        L.is_clock_rollback === true ||
        (L.tamper_reason === "clock_rollback_detected" &&
          Number(L.max_seen_utc || 0) > 0 &&
          Number(L.now_utc || 0) < Number(L.max_seen_utc || 0) - 300)
      );

      if (isActualClockRollback) {
        $("#lockTitle").textContent = "This computer's date and time look wrong";
        $("#lockBody").textContent =
          "The Windows clock is set earlier than the last time CogniTara ran, so the server is paused to protect your licence. Set the correct date and time in Windows, then check again.";
        $("#lockMeta").textContent =
          "Last trusted time: " + fmtDateTime(L.max_seen_utc) + ". Current clock: " + fmtDateTime(L.now_utc);
        $("#lockActions").innerHTML =
          "<button type='button' class='btn btn--primary' data-lock-act='datesettings'>Open Windows date settings</button>" +
          "<button type='button' class='btn btn--ghost' data-lock-act='recheck'>Check again</button>";
        setHeaderStatus("locked", "Locked", "Clock changed");
      } else if (isHwid) {
        $("#lockTitle").textContent = "This licence belongs to another computer";
        $("#lockBody").textContent =
          "CogniTara detected hardware changes that don't match this licence. Reset and re-activate with your CogniTara Cloud account, or import the licence issued for this PC.";
        $("#lockMeta").textContent =
          "Computer ID: " + (L.display_hwid || "Unknown") + (L.tamper_reason ? (" · Detail: " + L.tamper_reason) : "");
        $("#lockActions").innerHTML =
          "<button type='button' class='btn btn--primary' data-lock-act='repair'>Reset & Re-activate on This PC</button>" +
          "<button type='button' class='btn btn--ghost' data-lock-act='billing'>Buy / Redeem / Cloud</button>" +
          "<button type='button' class='btn btn--ghost' data-lock-act='import'>Import licence file</button>";
        setHeaderStatus("locked", "Locked", "Hardware mismatch");
      } else {
        $("#lockTitle").textContent = "Licence verification needed";
        $("#lockBody").textContent =
          "Your Windows clock looks accurate, so this is not a clock error. CogniTara needs to refresh this computer's local licence vault after an update or hardware change — all exam records are completely safe.";
        $("#lockMeta").textContent =
          "Computer ID: " + (L.display_hwid || "Unknown") +
          (L.tamper_reason ? (" · Code: " + L.tamper_reason) : "") +
          " · Clock: " + fmtDateTime(L.now_utc);
        $("#lockActions").innerHTML =
          "<button type='button' class='btn btn--primary' data-lock-act='repair'>Reset & Re-activate on This PC</button>" +
          "<button type='button' class='btn btn--ghost' data-lock-act='billing'>Buy / Redeem Licence</button>" +
          "<button type='button' class='btn btn--ghost' data-lock-act='import'>Import licence file</button>" +
          "<button type='button' class='btn btn--ghost' data-lock-act='recheck'>Check again</button>";
        setHeaderStatus("locked", "Verification needed", "Refresh local vault");
      }
      drainLeft = 0;
      lock.classList.add("no-drain");
    } else {
      var ref = (L.tombstone && L.tombstone.tombstone_id) || "TMB-HQ-REVOKED";
      $("#lockTitle").textContent = "This licence has been revoked";
      $("#lockBody").textContent = "CogniTara HQ has turned off this licence. Exams can't be started on this computer. Your data stays on this PC and is not deleted.";
      $("#lockMeta").innerHTML = "Reference <code>" + esc(ref) + "</code>. Email support@cognitara.net with this reference.";
      $("#lockActions").innerHTML =
        "<button type='button' class='btn btn--primary' data-lock-act='support'>Contact support</button>" +
        "<button type='button' class='btn btn--ghost' data-lock-act='export'>Export my data</button>";
      drainLeft = 0;
      lock.classList.add("no-drain");
      setHeaderStatus("locked", "Locked", "Licence revoked");
    }

    setMode("lock");
  }

  function tickDrain() {
    drainLeft = Math.max(0, drainLeft - 1);
    $("#drainTime").textContent = fmtLeft(drainLeft);
    if (drainLeft === 0) $("#lock").classList.add("no-drain");
  }

  $("#lockActions").addEventListener("click", async function (e) {
    var b = e.target.closest("[data-lock-act]"); if (!b) return;
    var act = b.dataset.lockAct;
    if (act === "renew" || act === "billing") openBillingModal("plans");
    if (act === "support") openExternalUrl("mailto:support@cognitara.net?subject=CogniTara%20Licence%20Support");
    if (act === "datesettings" && bridge) bridge.openWindowsDateSettings().catch(function () {});
    if (act === "export" && bridge) {
      var exp = await bridge.exportDataBackup().catch(function () { return null; });
      toast(exp && exp.ok ? "Backup exported and folder opened" : "Could not export backup");
    }
    if (act === "repair" && bridge) {
      b.disabled = true;
      var origTxt = b.textContent;
      b.textContent = "Resetting vault…";
      try {
        var rep = await bridge.repairCorruptVault().catch(function () { return null; });
        if (rep && rep.ok && rep.status) {
          state.license = rep.status;
          activated = Boolean(rep.status.is_licensed);
          paintLicence();
          if (rep.status.is_licensed) {
            enterApp();
            toast("Licence vault verified and active!");
          } else {
            toast("Vault refreshed cleanly. Verify your Cloud account or activate a licence.");
            startOnboarding(state.cloudAccount && state.cloudAccount.signedIn ? 3 : 1);
          }
        } else {
          toast((rep && (rep.message || rep.error)) || "Could not reset vault. Check your Windows clock.");
        }
      } finally {
        b.disabled = false;
        b.textContent = origTxt;
      }
    }
    if (act === "import" && bridge) {
      var imp = await bridge.importLicenseFile();
      if (imp && imp.ok && imp.status && imp.status.lock_state === "ACTIVE") {
        state.license = imp.status;
        activated = true;
        paintLicence();
        if (state.onboardingComplete) enterApp();
        else startOnboarding(state.cloudAccount && state.cloudAccount.signedIn ? 4 : 1);
        toast("Licence restored. You can start the server now.");
      } else if (imp && !imp.canceled) {
        toast((imp && (imp.message || imp.error)) || "Invalid licence file");
      }
    }
    if (act === "checkin" && bridge) {
      var chk = await bridge.checkInLicense();
      if (chk && chk.ok && chk.status && chk.status.lock_state === "ACTIVE") {
        state.license = chk.status;
        paintLicence();
        enterApp();
        toast("Online check-in succeeded.");
      } else {
        toast("Could not check in yet. Check your internet connection.");
      }
    }
    if (act === "recheck" && bridge) {
      var rec = await bridge.recheckLicense();
      if (rec && rec.license) {
        state.license = rec.license;
        var nextLock = mapLockKind(rec.license);
        if (!nextLock) {
          paintLicence();
          if (state.onboardingComplete) enterApp();
          else startOnboarding(state.cloudAccount && state.cloudAccount.signedIn ? 3 : 1);
          toast("Licence verified.");
        } else {
          showLock(nextLock, rec.license);
          toast(
            rec.license.is_clock_rollback
              ? "Windows clock is still behind the last trusted timestamp."
              : "Vault mismatch still present — click Reset & Re-activate on This PC."
          );
        }
      }
    }
  });

  /* ------------------------------------------------------------------ native window chrome */
  function syncMaximizedUi(isMax) {
    var maxed = Boolean(isMax);
    win.classList.toggle("is-maximized", maxed);
    var maxBtn = $("#maxBtn");
    if (maxBtn) {
      maxBtn.title = maxed ? "Restore down" : "Maximise";
      maxBtn.setAttribute("aria-label", maxed ? "Restore down" : "Maximise");
    }
    setTimeout(function () { measurePulseCanvas(); drawPulse(true); moveIndicator(); }, 180);
  }

  $("#minBtn").addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (bridge) bridge.windowAction("minimize").catch(function () {});
  });
  $("#maxBtn").addEventListener("click", async function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (!bridge) {
      syncMaximizedUi(!win.classList.contains("is-maximized"));
      return;
    }
    var res = await bridge.windowAction("maximize").catch(function () { return null; });
    if (res && typeof res.maximized === "boolean") syncMaximizedUi(res.maximized);
  });
  $("#closeBtn").addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (bridge) bridge.windowAction("close").catch(function () {});
  });
  $$(".titlebar__drag").forEach(function (dragEl) {
    dragEl.addEventListener("dblclick", async function () {
      if (state.mode === "boot") return;
      if (!bridge) {
        syncMaximizedUi(!win.classList.contains("is-maximized"));
        return;
      }
      var res = await bridge.windowAction("maximize").catch(function () { return null; });
      if (res && typeof res.maximized === "boolean") syncMaximizedUi(res.maximized);
    });
  });

  /* ------------------------------------------------------------------ main-process push events */
  if (bridge) {
    bridge.onServerStateChanged(function (nextState) {
      if (nextState !== state.server) {
        setServer(nextState);
        if (nextState === "running") pollTelemetryNow();
      }
    });
    bridge.onLicenseLockTriggered(function (lic) {
      state.license = lic;
      var kind = mapLockKind(lic);
      if (kind) showLock(kind, lic);
    });
    if (bridge.onUpdateStatusChanged) {
      bridge.onUpdateStatusChanged(function (upd) {
        renderUpdateState(upd);
        if (upd && upd.status === "downloaded") {
          toast("CogniTara Studio v" + upd.availableVersion + " is ready to install");
          logEvent("server", "accent", "i-restore", "<b>Update v" + esc(upd.availableVersion) + "</b> downloaded and ready");
        }
      });
    }
    if (bridge.onCloudSessionChanged) {
      bridge.onCloudSessionChanged(function (session) {
        renderCloudAccount(session);
      });
    }
    if (bridge.onWindowMaximizedChanged) {
      bridge.onWindowMaximizedChanged(function (maximized) {
        syncMaximizedUi(maximized);
      });
    }
  }

  /* ------------------------------------------------------------------ init */
  var params = new URLSearchParams(location.search);
  var themeParam = params.get("theme");
  if (themeParam === "light" || themeParam === "dark") state.theme = themeParam;
  applyTheme(state.theme, false, false);
  setServer("stopped");
  syncAddr(false);
  syncSchool();
  paintLicence();
  renderLive();
  renderBackups();
  renderCloudAccount(state.cloudAccount);

  // Direct screen jump for Playwright visual QA when running without Electron bridge
  var screenParam = params.get("screen");
  if (!bridge && screenParam) {
    state.school = {
      school_name: "Cedar Hills International Academy",
      school_motto: "Knowledge, Discipline, Excellence",
      academic_session: "2026/2027",
      current_term: "First Term"
    };
    state.ip = "192.168.10.24";
    state.port = 5000;
    state.hostname = "exam-server-01";
    state.license = {
      lock_state: "ACTIVE",
      is_licensed: true,
      display_hwid: "CT-HWID-8F4B-7E2C-91A0",
      plan_tier: "annual",
      school_name: "Cedar Hills International Academy",
      expires_at: "2027-09-01T00:00:00Z",
      days_remaining: 287,
      total_days: 365,
      now_utc: Math.floor(Date.now() / 1000),
      max_seen_utc: Math.floor(Date.now() / 1000) - 2400,
      lease_remaining_seconds: 86400 * 28,
      last_heartbeat_utc: Math.floor(Date.now() / 1000) - 900,
      active_exams_count: 2,
      drain_remaining_seconds: 894,
      is_draining: true,
      tombstone: { tombstone_id: "TMB-01JXZ99887766" }
    };
    state.cloudAccount = {
      signedIn: params.get("guest") !== "1",
      offline: false,
      cloudUrl: "https://cognitara-cloud.vercel.app",
      lastSyncedAt: Date.now() - 120000,
      user: { id: "u1", email: "principal@cedarhills.edu.ng", full_name: "Adaeze Okafor", role: "school_owner", status: "active", email_verified: true },
      school: { id: "s1", school_name: "Cedar Hills International Academy", country_code: "NG", status: "active" },
      referralCode: "CT-CEDA-8F2A1C",
      licenses: []
    };
    state.telemetry = { counts: { exams: 14, ce_exams: 3, approved_students: 486 } };
    state.backups = [
      { filename: "exam_auto_20261119_084000.db", type: "Automatic", size_label: "742 KB", created_label: "19 Nov 2026, 08:40", verified: true },
      { filename: "exam_manual_20261118_160500.db", type: "Manual", size_label: "739 KB", created_label: "18 Nov 2026, 16:05", verified: true }
    ];
    state.liveExams = [
      { exam_id: 1, exam_type: "regular", name: "First Term Mathematics CBT", class: "JSS 2", writing: 31, total: 34, progress: 64.5, warnings: 1, left_seconds: 1420 },
      { exam_id: 2, exam_type: "common_entrance", name: "2026/2027 Common Entrance", class: "Entrance", writing: 48, total: 50, progress: 42.0, warnings: 0, left_seconds: 2180 }
    ];
    state.attention = [
      { attempt_id: 11, exam_type: "regular", student_name: "Chiamaka Eze", detail: "JSS 2 · Lost connection 40s ago, paused automatically", can_resume: true }
    ];
    state.writing = 79;
    state.devices = 82;
    state.samples = state.samples.map(function (_, i) { return i > 80 ? 28 + Math.sin(i * 0.4) * 12 : 12 + (i % 7); });
    hydrateSchoolInputs();
    syncSchool();
    syncAddr(false);
    paintLicence();
    renderBackups();
    renderLive();
    renderAttention();
    paintStats();
    renderCloudAccount(state.cloudAccount);

    billingState.plans = [
      {
        id: "demo-monthly",
        slug: "monthly",
        display_name: "Monthly School",
        badge: null,
        price_ngn_kobo: 1200000,
        price_usd_cents: 1200,
        duration_days: 30,
        lease_days: 7,
        features: { highlights: ["Up to 300 concurrent students", "Offline LAN exam server", "Encrypted cloud backups"] }
      },
      {
        id: "demo-annual",
        slug: "annual",
        display_name: "Annual School",
        badge: "Most popular",
        price_ngn_kobo: 7500000,
        price_usd_cents: 6900,
        duration_days: 365,
        lease_days: 30,
        features: { highlights: ["All 3 academic terms covered", "30-day offline lease window", "Priority exam-day support"] }
      },
      {
        id: "demo-lifetime",
        slug: "lifetime",
        display_name: "Lifetime Campus",
        badge: "Best value",
        price_ngn_kobo: 22000000,
        price_usd_cents: 19900,
        duration_days: null,
        lease_days: 90,
        features: { highlights: ["Pay once, own forever", "90-day offline lease window", "All future v2.x updates"] }
      }
    ];
    billingState.selectedPlanId = "demo-annual";
    billingState.plansLoaded = true;
    renderBillingPlans();

    if (params.get("update") === "downloading") {
      renderUpdateState({
        status: "downloading",
        currentVersion: "2.2.3",
        availableVersion: "2.2.7",
        percent: 68.4,
        bytesPerSecond: 4.2 * 1024 * 1024,
        transferred: 58.2 * 1024 * 1024,
        total: 85.1 * 1024 * 1024
      });
    } else if (params.get("update") === "downloaded") {
      renderUpdateState({
        status: "downloaded",
        currentVersion: "2.2.3",
        availableVersion: "2.2.7",
        percent: 100
      });
    }

    if (screenParam === "boot") {
      playBoot(function () {});
    } else if (screenParam === "onboarding") {
      var st = parseInt(params.get("step") || "0", 10);
      startOnboarding(isNaN(st) ? 0 : st);
      if (params.get("otp") === "1") showOnbOtpStep("principal@cedarhills.edu.ng", "signup_verify", "6-digit Brevo OTP sent to principal@cedarhills.edu.ng");
    } else if (screenParam === "app") {
      if (params.get("running") === "1") {
        state.startedAt = Date.now() - 4920 * 1000;
        state.server = "running";
      }
      setMode("app");
      setServer(state.server);
      var targetView = params.get("view") || "home";
      if (params.get("guest") === "1") renderCloudAccount({ signedIn: false, offline: false });
      showView(targetView);
      if (targetView === "settings") syncSettingsUI();
      measurePulseCanvas();
      drawPulse(true);
      drawSpark(true);
      if (targetView === "cloud" && params.get("guest") === "1") {
        switchCloudTab(params.get("tab") || "signup");
      }
      if (targetView === "billing") {
        var bstage = params.get("bstage");
        if (bstage === "checkout") {
          var sub = params.get("subview") || "method";
          var pm = params.get("method") || "card";
          billingState.selectedMethod = pm;
          billingState.activePlanLabel = "Annual School";
          billingState.activeAmountLabel = "₦75,000";
          if (sub === "transfer") {
            showBankTransferSubview({
              reference: "CTPAY_2026_BT8841",
              bank_name: "Paystack-Titan",
              account_number: "9904821735",
              account_name: "PAYSTACK CHECKOUT",
              account_expires_at: new Date(Date.now() + 24 * 60 * 1000 + 42000).toISOString(),
              currency: "NGN",
              charge_minor: 7500000,
              plan_name: "Annual School"
            });
          } else if (sub === "browser") {
            showBrowserWaitSubview({
              method: pm,
              reference: "CTPAY_2026_CRD9921",
              authorization_url: "https://checkout.paystack.com/demo",
              currency: "NGN",
              charge_minor: 7500000,
              plan_name: "Annual School"
            });
          } else {
            setBillingStage("checkout");
            setCheckoutSubview("method");
          }
        } else if (bstage === "receipt") {
          showBillingReceipt({
            ok: true,
            source: "paystack",
            reference: "CTPAY_2026_8F4B9A",
            license_key: "CGNT-8F4B-7E2C-91A0-55D2",
            receipt: {
              plan_name: "Annual School",
              currency: "NGN",
              amount_minor: 7500000,
              customer_paid_minor: 7500000,
              expires_at: "2027-11-26T00:00:00Z"
            }
          });
        }
      }
    } else if (screenParam === "expired") {
      state.license.lock_state = "DRAINING";
      showLock("expired", state.license);
    } else if (screenParam === "clock") {
      state.license.lock_state = "CLOCK_TAMPER_LOCK";
      state.license.tamper_reason = params.get("rollback") === "1" ? "clock_rollback_detected" : "anchor_a_hmac_mismatch";
      state.license.is_clock_rollback = params.get("rollback") === "1";
      showLock("clock", state.license);
    } else if (screenParam === "revoked") {
      state.license.lock_state = "HQ_REVOKED_LOCK";
      showLock("revoked", state.license);
    }
  } else if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { playBoot(); });
  } else {
    playBoot();
  }
})();
