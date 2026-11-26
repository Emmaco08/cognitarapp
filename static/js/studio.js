/* CogniTara Studio — desktop app preview behaviour.
   Real data comes from exam.db (read-only) via the embedded telemetry JSON.
   Live activity numbers are simulated in the preview so every state can be seen. */
(function () {
  "use strict";

  var T = {};
  try { T = JSON.parse(document.getElementById("telemetry").textContent || "{}"); } catch (e) { T = {}; }
  var PORT = T.port || 5000;
  var LAN = (T.lan_ips && T.lan_ips.length) ? T.lan_ips : ["127.0.0.1"];
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var win = $("#win");

  var state = {
    mode: "boot",
    theme: localStorage.getItem("ct-theme") || "light",
    plan: "annual",
    server: "stopped",
    startedAt: 0,
    ip: LAN[0],
    devices: 0,
    writing: 0,
    samples: new Array(120).fill(0),
    exams: [],
    stopArmed: false
  };

  /* ------------------------------------------------------------------ utils */
  function pad(n) { return String(n).padStart(2, "0"); }
  function nowHM() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function addr() { return "http://" + state.ip + ":" + PORT; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
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
    var el = $("#toast"); el.textContent = msg; el.classList.add("is-on");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove("is-on"); }, 2800);
  }
  function renderQr(host, text, draw) {
    if (!host || !window.CogniQR) return;
    try { host.innerHTML = window.CogniQR.toSvg(text); } catch (e) { host.textContent = ""; }
    if (draw && !REDUCED) { host.classList.remove("is-drawing"); void host.offsetWidth; host.classList.add("is-drawing"); }
  }

  /* ------------------------------------------------------------------ theme */
  function applyTheme(t, animated) {
    var run = function () {
      state.theme = t;
      document.documentElement.setAttribute("data-theme", t);
      localStorage.setItem("ct-theme", t);
      $("#dockTheme").textContent = t === "dark" ? "Light" : "Dark";
      $$("#themeSeg button").forEach(function (b) { b.classList.toggle("is-active", b.dataset.t === t); });
      drawPulse();
    };
    if (animated && document.startViewTransition && !REDUCED) document.startViewTransition(run); else run();
  }
  $("#themeBtn").addEventListener("click", function () { applyTheme(state.theme === "dark" ? "light" : "dark", true); });
  $("#dockTheme").addEventListener("click", function () { applyTheme(state.theme === "dark" ? "light" : "dark", true); });
  $$("#themeSeg button").forEach(function (b) { b.addEventListener("click", function () { applyTheme(b.dataset.t, true); }); });

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
    if (frac == null) { bar.classList.remove("is-on"); setTimeout(function () { if (!bar.classList.contains("is-on")) bar.style.width = "0"; }, 500); return; }
    bar.classList.add("is-on"); bar.style.width = (Math.max(0, Math.min(1, frac)) * 100) + "%";
  }
  function playHeaderIn() {
    win.classList.remove("is-entering"); void win.offsetWidth; win.classList.add("is-entering");
    setTimeout(function () { win.classList.remove("is-entering"); }, 1600);
  }
  var unread = 0;
  function bumpBell() {
    unread++;
    var b = $("#bellBadge"); b.hidden = false; b.textContent = unread > 9 ? "9+" : unread;
    b.classList.remove("is-pop"); void b.offsetWidth; b.classList.add("is-pop");
    var btn = $("#bellBtn"); btn.classList.remove("is-ring"); void btn.offsetWidth; btn.classList.add("is-ring");
  }
  $("#bellBtn").addEventListener("click", function () {
    unread = 0; $("#bellBadge").hidden = true;
    if (state.mode !== "app") { toast("Notifications appear here once setup is done"); return; }
    showView("activity");
  });
  $("#avatarBtn").addEventListener("click", function () { toast("Signed in as " + ($("#fName").value.trim() || "Super admin")); });
  $("#tbSchoolBtn").addEventListener("click", function () {
    if (state.mode === "onboarding") goStep(1); else toast("School profile opens in the admin portal");
  });
  function drawSpark() {
    var c = $("#tbSpark"); if (!c) return;
    var dpr = window.devicePixelRatio || 1, w = 56, h = 20;
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
    var ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    var data = state.samples.slice(-28), max = Math.max(10, Math.max.apply(null, data) * 1.15);
    var col = getComputedStyle(document.documentElement).getPropertyValue("--ok").trim() || "#171614";
    ctx.beginPath();
    data.forEach(function (v, i) { var x = i * (w / (data.length - 1)), y = h - 2 - (v / max) * (h - 4); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.lineJoin = "round"; ctx.stroke();
  }

  /* ------------------------------------------------------------------ modes */
  function setMode(mode) {
    var prev = state.mode;
    state.mode = mode;
    win.dataset.mode = mode;
    win.classList.remove("is-handoff");
    if (prev === "boot" && mode !== "boot") playHeaderIn();
    if (mode !== "onboarding") setProgress(null);
    $$("#dockScreens button").forEach(function (b) {
      var m = b.dataset.go;
      var on = (m === mode) || (mode === "lock" && m === $("#lock").dataset.kind);
      b.classList.toggle("is-active", on);
    });
  }

  /* ------------------------------------------------------------------ boot */
  var bootTimers = [];
  function playBoot(next) {
    bootTimers.forEach(clearTimeout); bootTimers = [];
    setMode("boot");
    var boot = $("#boot");
    var word = $(".boot__word");
    var shift = (word.getBoundingClientRect().width + 22) / 2;
    $(".boot__symbol").style.setProperty("--shift", shift + "px");
    boot.classList.remove("is-playing"); void boot.offsetWidth; boot.classList.add("is-playing");
    var steps = [
      [300, 8, "Starting CogniTara"],
      [900, 26, "Checking your licence"],
      [1600, 48, "Opening exam records"],
      [2300, 70, "Finding your school network"],
      [3100, 90, "Preparing the control panel"],
      [3900, 100, "Ready"]
    ];
    steps.forEach(function (s) {
      bootTimers.push(setTimeout(function () {
        $("#bootBar").style.width = s[1] + "%";
        $("#bootPct").textContent = s[1] + "%";
        $("#bootText").textContent = s[2];
      }, REDUCED ? 0 : s[0]));
    });
    bootTimers.push(setTimeout(function () { (next || startOnboarding)(); }, REDUCED ? 300 : 4900));
  }

  /* ------------------------------------------------------------------ onboarding */
  var step = 0;
  var activated = false;
  var nextLabels = ["Get started", "Continue", "Continue", "Continue", "Finish setup"];
  var etaText = ["About 3 minutes left", "About 2 minutes left", "About 2 minutes left", "About a minute left", "Almost done", "All done"];

  // split kinetic headlines into masked words
  $$(".kinetic").forEach(function (h) {
    var words = h.textContent.trim().split(/\s+/);
    h.setAttribute("aria-label", h.textContent.trim());
    h.innerHTML = words.map(function (w, i) { return "<span class='w' aria-hidden='true'><span style='--w:" + i + "'>" + esc(w) + "</span></span>"; }).join(" ");
  });
  // stagger reveal of everything marked .rv inside each pane
  $$(".pane").forEach(function (p) {
    $$(".rv", p).forEach(function (k, i) { k.style.setProperty("--i", i); });
  });

  function startOnboarding() {
    setMode("onboarding");
    goStep(0);
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
    // rail fill + moving highlight
    var items = $$("#onbSteps li"), cur = items[Math.min(n, 4)];
    var fill = n >= 5 ? 1 : n / 4;
    $("#onbRailFill").style.height = (fill * 100) + "%";
    var hl = $("#onbHl");
    hl.style.opacity = n >= 5 ? "0" : "1";
    if (cur) hl.style.transform = "translateY(" + cur.offsetTop + "px)";
    $("#onbEta").style.strokeDashoffset = String(100 - (Math.min(n, 5) / 5) * 100);
    $("#onbEtaText").textContent = etaText[n];
    setProgress(n >= 5 ? 1 : (n + 1) / 6);
    setHeaderStatus("setup", n >= 5 ? "Setup complete" : "Setting up", n >= 5 ? "Ready to start" : "Step " + (n + 1) + " of 5");
    // footer
    $("#onbBack").style.visibility = n === 0 ? "hidden" : "visible";
    var num = $("#onbCountNum");
    num.textContent = Math.min(n + 1, 5);
    num.classList.remove("is-roll"); void num.offsetWidth; num.classList.add("is-roll");
    if (n < 5) $("#onbNextLabel").textContent = nextLabels[n];
    if (n === 0) runHallCount();
    if (n === 3) scanNetwork();
    if (n === 4) scrambleCodes();
    if (n === 5) runFinish();
    updateNext();
  }
  var nextWasDisabled = false;
  function updateNext() {
    var ok = true;
    if (step === 1) ok = $("#fSchool").value.trim().length > 1;
    if (step === 2) ok = activated;
    if (step === 4) ok = $("#fName").value.trim().length > 1 && scorePass($("#fPass").value) >= 3 && $("#recSaved").checked;
    var btn = $("#onbNext");
    btn.disabled = !ok;
    if (ok && nextWasDisabled && !REDUCED) { btn.classList.remove("is-ready"); void btn.offsetWidth; btn.classList.add("is-ready"); }
    nextWasDisabled = !ok;
  }
  $("#onbNext").addEventListener("click", function () { if (step < 5) goStep(step + 1); });
  $("#onbBack").addEventListener("click", function () { if (step > 0) goStep(step - 1); });
  $("#onbSteps").addEventListener("click", function (e) {
    var li = e.target.closest("li"); if (!li) return;
    var i = +li.dataset.step; if (i < step) goStep(i);
  });
  document.addEventListener("keydown", function (e) {
    if (state.mode !== "onboarding" || e.target.matches("input, select, textarea")) return;
    if (e.key === "ArrowRight" && !$("#onbNext").disabled && step < 5) goStep(step + 1);
    if (e.key === "ArrowLeft" && step > 0 && step < 5) goStep(step - 1);
  });

  // Step 1: devices light up and the capacity counter counts up
  var hallTimer;
  function runHallCount() {
    clearInterval(hallTimer);
    var el = $("#hallCount"), devs = $$(".dev");
    devs.forEach(function (d) { d.classList.remove("is-on"); });
    setTimeout(function () {
      animate(1800, function (p) { el.textContent = Math.round(p * 300); });
    }, REDUCED ? 0 : 1300);
    var k = 0;
    hallTimer = setInterval(function () {
      if (step !== 0 || state.mode !== "onboarding") { clearInterval(hallTimer); return; }
      devs.forEach(function (d) { d.classList.remove("is-on"); });
      devs[k % devs.length].classList.add("is-on");
      devs[(k + 3) % devs.length].classList.add("is-on");
      k++;
    }, 700);
  }

  // Step 2: live preview of the student login, with 3D tilt
  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase() || "CT";
  }
  function flash(el) { if (REDUCED || !el) return; el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
  function syncSchool(e) {
    var name = $("#fSchool").value.trim() || "Your school";
    var term = $("#fTerm").value + ", " + $("#fSession").value;
    $("#mlSchool").textContent = name;
    $("#mlMotto").textContent = $("#fMotto").value.trim();
    $("#mlTerm").textContent = term;
    var ini = initials(name);
    if (!$("#mlCrest").style.backgroundImage) {
      if ($("#mlInitials").textContent !== ini) flash($("#mlCrest"));
      $("#mlInitials").textContent = ini;
      $("#tbCrest").textContent = ini;
    }
    $("#tbSchool").textContent = name;
    $("#tbTerm").textContent = term;
    $("#greetSchool").textContent = name;
    $("#greetTerm").textContent = term;
    $("#licSchool").textContent = name;
    if (e && e.target) {
      var map = { fSchool: "#mlSchool", fMotto: "#mlMotto", fSession: "#mlTerm", fTerm: "#mlTerm" };
      flash($(map[e.target.id]));
    }
    updateNext();
  }
  ["#fSchool", "#fMotto", "#fSession", "#fTerm"].forEach(function (s) { $(s).addEventListener("input", syncSchool); });
  if (T.current_term) $("#fTerm").value = T.current_term;
  $("#logoDrop").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#fLogo").click(); } });
  $("#logoDrop").tabIndex = 0;
  $("#fLogo").addEventListener("change", function () {
    var f = this.files && this.files[0]; if (!f) return;
    var url = URL.createObjectURL(f);
    [$("#mlCrest"), $("#tbCrest")].forEach(function (c) { c.style.backgroundImage = "url(" + url + ")"; });
    $("#mlInitials").textContent = ""; $("#tbCrest").textContent = "";
    flash($("#mlCrest"));
    $("#logoDrop strong").textContent = f.name;
  });
  (function tilt() {
    var stage = $("#tiltStage"), card = $("#tiltCard");
    if (!stage || REDUCED) return;
    stage.addEventListener("mousemove", function (e) {
      var r = stage.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty("--ry", (x * 14).toFixed(2) + "deg");
      card.style.setProperty("--rx", (-y * 10).toFixed(2) + "deg");
    });
    stage.addEventListener("mouseleave", function () { card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg"); });
  })();

  // Step 3: segmented licence key + verification
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
  $("#activateBtn").addEventListener("click", function () { runVerify(); });
  $("#licFileBtn").addEventListener("click", function () {
    if (activated) return;
    var demo = "84K291MPQ7RXV3N8", i = 0;
    keyInput.value = "";
    var t = setInterval(function () {
      i++; keyInput.value = demo.slice(0, i); keyInput.dispatchEvent(new Event("input"));
      if (i >= demo.length) { clearInterval(t); setTimeout(runVerify, 300); }
    }, REDUCED ? 0 : 45);
  });
  function setVerifyResult(html) {
    var r = $("#verifyResult"); r.innerHTML = html;
    if (!REDUCED) { r.classList.remove("is-swap"); void r.offsetWidth; r.classList.add("is-swap"); }
  }
  function runVerify() {
    var v = $("#verify"), arc = $("#verifyArc"), items = $$(".verify__list li", v);
    $("#activateBtn").disabled = true;
    v.dataset.state = "run";
    setVerifyResult("<span>Contacting cognitara.net…</span>");
    items.forEach(function (li) { li.className = ""; });
    var i = 0;
    function nextItem() {
      if (i > 0) items[i - 1].className = "is-ok";
      arc.style.strokeDashoffset = String(100 - (i / items.length) * 100);
      if (i >= items.length) {
        v.dataset.state = "done";
        $("#segkey").classList.add("is-done");
        activated = true;
        var p = PLANS[state.plan];
        setVerifyResult("<strong>" + esc(p.name) + " plan activated</strong><span>" + esc(p.activatedLine) + "</span>");
        updateNext();
        return;
      }
      items[i].className = "is-run";
      i++;
      setTimeout(nextItem, REDUCED ? 0 : 800);
    }
    nextItem();
  }
  $$("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var el = $(b.dataset.copy); if (!el) return;
      var text = el.tagName === "OL" ? $$("li", el).map(function (li) { return li.textContent; }).join("\n") : el.textContent.trim();
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
      toast("Copied to clipboard");
    });
  });

  // Step 4: network adapters + QR built module by module
  var scanned = false;
  function adapterMeta(ip, i) {
    if (/^192\.168\.56\./.test(ip)) return { name: "VirtualBox host-only adapter", note: "Virtual, not for students", muted: true };
    if (ip === "127.0.0.1") return { name: "This computer only", note: "No network found", muted: true };
    return { name: i === 0 ? "School network (Wi‑Fi / Ethernet)" : "Network adapter " + (i + 1), note: "Recommended", muted: false };
  }
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
    LAN.forEach(function (ip, i) {
      var m = adapterMeta(ip, i);
      var b = document.createElement("button");
      b.type = "button"; b.className = "adapter"; b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", i === 0 ? "true" : "false");
      b.innerHTML = "<i></i><span><strong>" + esc(m.name) + "</strong><code>" + esc(ip) + "</code></span><em class='" + (m.muted ? "is-muted" : "") + "'>" + esc(m.note) + "</em>";
      b.addEventListener("click", function () {
        $$(".adapter", list).forEach(function (x) { x.setAttribute("aria-checked", "false"); });
        b.setAttribute("aria-checked", "true");
        state.ip = ip; syncAddr(true);
      });
      list.appendChild(b);
      setTimeout(function () { b.classList.add("is-in"); }, REDUCED ? 0 : 900 + i * 240);
    });
    setTimeout(function () {
      var s = $("#netScan"); s.classList.add("is-done");
      s.querySelector("span").textContent = LAN.length + (LAN.length === 1 ? " network found" : " networks found");
      frame.dataset.state = "done";
      buildQr($("#onbQr"), addr());
    }, REDUCED ? 0 : 1100 + LAN.length * 240);
  }
  function syncAddr(draw) {
    $("#onbAddr").textContent = addr();
    $("#homeAddr").textContent = addr();
    if (draw) { buildQr($("#onbQr"), addr()); flash($("#onbAddr")); }
    renderQr($("#homeQr"), addr(), false);
  }

  // Step 5: super admin
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
      }, 500);
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

  // Finish: summary ticks in, then hand off to the app
  function runFinish() {
    var p = PLANS[state.plan];
    var rows = [
      ["i-home", "School profile", $("#fSchool").value.trim()],
      ["i-key", "Licence active", p.name + " plan"],
      ["i-wifi", "Students connect at", addr()],
      ["i-shield", "Super admin", ($("#fName").value.trim() || "Super admin") + " (" + ($("#fUser").value.trim() || "superadmin") + ")"]
    ];
    var list = $("#finishList");
    list.innerHTML = rows.map(function (r) { return "<li><svg><use href='#" + r[0] + "'/></svg><span><strong>" + esc(r[1]) + "</strong><em>" + esc(r[2]) + "</em></span></li>"; }).join("");
    $$("li", list).forEach(function (li, i) { setTimeout(function () { li.classList.add("is-in"); }, REDUCED ? 0 : 900 + i * 160); });
  }
  $("#finishBtn").addEventListener("click", finishSetup);
  function finishSetup() {
    win.classList.add("is-handoff");
    setTimeout(function () {
      enterApp();
      playHeaderIn();
      toast("Setup complete. Start the server when you're ready.");
      logEvent("server", "accent", "i-check", "<b>Setup complete</b> for " + esc($("#fSchool").value));
    }, REDUCED ? 0 : 650);
  }

  /* ------------------------------------------------------------------ app */
  function enterApp() {
    setMode("app");
    if (state.server === "locked") state.server = "stopped";
    setServer(state.server);
    showView("home");
  }
  function showView(name) {
    $$(".view").forEach(function (v) { v.classList.toggle("is-active", v.dataset.view === name); });
    $$("#railNav button").forEach(function (b) { b.classList.toggle("is-active", b.dataset.view === name); });
    moveIndicator();
    if (name === "licence") paintLicence();
  }
  function moveIndicator() {
    var act = $("#railNav button.is-active"), ind = $("#railInd");
    if (!act || !ind) return;
    var rail = act.closest(".rail").getBoundingClientRect(), r = act.getBoundingClientRect();
    if (!r.height) return;
    ind.style.transform = "translateY(" + (r.top - rail.top + (r.height - 16) / 2) + "px)";
  }
  window.addEventListener("resize", moveIndicator);

  /* ---- command palette ---- */
  var COMMANDS = [
    { label: "Start or stop the server", icon: "i-power", hint: "Server", run: function () { enterAppIfNeeded(); toggleServer(); } },
    { label: "Go to Server", icon: "i-home", hint: "Page", run: function () { enterAppIfNeeded(); showView("home"); } },
    { label: "Go to Live exams", icon: "i-live", hint: "Page", run: function () { enterAppIfNeeded(); showView("live"); } },
    { label: "Go to Licence", icon: "i-key", hint: "Page", run: function () { enterAppIfNeeded(); showView("licence"); } },
    { label: "Back up now", icon: "i-backup", hint: "Backups", run: function () { enterAppIfNeeded(); showView("backups"); setTimeout(function () { $("#backupBtn").click(); }, 300); } },
    { label: "Go to Activity", icon: "i-activity", hint: "Page", run: function () { enterAppIfNeeded(); showView("activity"); } },
    { label: "Go to Settings", icon: "i-settings", hint: "Page", run: function () { enterAppIfNeeded(); showView("settings"); } },
    { label: "Copy student address", icon: "i-copy", hint: "Network", run: function () { if (navigator.clipboard) navigator.clipboard.writeText(addr()).catch(function () {}); toast("Copied " + addr()); } },
    { label: "Open admin portal in browser", icon: "i-external", hint: "Portal", run: function () { window.open("/login", "_blank", "noopener"); } },
    { label: "Switch light or dark theme", icon: "i-sun", hint: "Appearance", run: function () { applyTheme(state.theme === "dark" ? "light" : "dark", true); } },
    { label: "Check licence with cognitara.net", icon: "i-shield", hint: "Licence", run: function () { enterAppIfNeeded(); showView("licence"); $("#checkInBtn").click(); } }
  ];
  function enterAppIfNeeded() { if (state.mode !== "app") enterApp(); }
  var palSel = 0, palItems = [];
  function openPalette() {
    if (state.mode === "boot") return;
    $("#palette").hidden = false; $("#palInput").value = ""; filterPalette(); $("#palInput").focus();
  }
  function closePalette() { $("#palette").hidden = true; }
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
  $$("[data-view]").forEach(function (b) {
    if (b.tagName === "BUTTON") b.addEventListener("click", function () { showView(b.dataset.view); });
  });

  /* ---- server lifecycle ---- */
  var core = $("#core");
  function setServer(s) {
    state.server = s;
    core.dataset.state = s;
    var labels = { stopped: "Server stopped", starting: "Starting…", running: "Server running", stopping: "Stopping…", locked: "Locked" };
    var subs = { stopped: "Ready when you are", starting: "Checking licence", running: state.ip + ":" + PORT, stopping: "Saving answers", locked: "See details" };
    if (state.mode === "app" || state.mode === "boot") setHeaderStatus(s, labels[s], subs[s]);
    $("#trayState").textContent = labels[s];
    $("#trayToggle").textContent = s === "running" ? "Stop server" : "Start server";
    $("#connect").dataset.state = s === "running" ? "on" : "off";
    var btn = $("#startBtn");
    btn.querySelector("span").textContent = s === "running" ? "Stop server" : s === "starting" ? "Starting…" : s === "stopping" ? "Stopping…" : "Start server";
    btn.disabled = s === "starting" || s === "stopping";
    $("#dial").setAttribute("aria-label", s === "running" ? "Stop server" : "Start server");
    var title = $("#coreTitle"), sub = $("#coreSub");
    var chip = { stopped: "Offline", starting: "Starting", running: "Online", stopping: "Stopping", locked: "Locked" };
    $("#coreStatus span").textContent = chip[s];
    if (s === "stopped") { title.textContent = "Server is off"; sub.textContent = "Students can't connect yet. Start the server when you're ready for exams."; }
    if (s === "starting") { title.textContent = "Starting the server"; sub.textContent = "This takes a few seconds."; }
    if (s === "running") { title.textContent = "Server is running"; sub.textContent = "Students on the school network can sign in now."; }
    if (s === "stopping") { title.textContent = "Stopping the server"; sub.textContent = "Saving every open answer first."; }
  }

  function startServer() {
    if (state.server !== "stopped") return;
    setServer("starting");
    var arc = $("#coreArc");
    var steps = ["Checking licence", "Opening exam records", "Listening on " + state.ip + ":" + PORT, "Ready"];
    var stepEl = $("#coreStep");
    var dur = 2600;
    steps.forEach(function (s, i) { setTimeout(function () { stepEl.textContent = s; }, REDUCED ? 0 : (dur / steps.length) * i); });
    animate(dur, function (p) { arc.style.strokeDashoffset = String(100 - p * 100); setProgress(p); }, function () {
      setProgress(null);
      state.startedAt = Date.now();
      setServer("running");
      stepEl.textContent = "";
      arc.style.strokeDashoffset = "0";
      logEvent("server", "ok", "i-power", "<b>Server started</b> at " + esc(addr()));
      seedExams();
    });
  }
  function stopServer() {
    if (state.server !== "running") return;
    if (state.writing > 0 && !state.stopArmed) {
      state.stopArmed = true;
      $("#coreStep").textContent = state.writing + " students are writing. Click again to stop; their answers are saved and they can resume later.";
      setTimeout(function () { state.stopArmed = false; if (state.server === "running") $("#coreStep").textContent = ""; }, 4000);
      return;
    }
    state.stopArmed = false;
    setServer("stopping");
    $("#coreStep").textContent = "Saving open answers";
    var arc = $("#coreArc");
    animate(1400, function (p) { arc.style.strokeDashoffset = String(p * 100); }, function () {
      setServer("stopped");
      $("#coreStep").textContent = "";
      state.devices = 0; state.writing = 0; state.exams = [];
      renderLive(); paintStats();
      logEvent("server", "", "i-power", "<b>Server stopped</b>. All answers were saved.");
    });
  }
  function toggleServer() { if (state.server === "running") stopServer(); else startServer(); }
  $("#startBtn").addEventListener("click", toggleServer);
  $("#dial").addEventListener("click", toggleServer);

  /* ---- live data (simulated in preview) ---- */
  function seedExams() {
    var src = (T.recent_exams || []).filter(function (e) { return e.active; }).slice(0, 3);
    if (!src.length) src = [{ name: "Mid-Term Mathematics Test", class: "JSS 1", duration: 45, exam_type: "regular" }];
    state.exams = src.map(function (e, i) {
      var total = [32, 28, 18][i] || 20;
      return {
        name: e.name, cls: e.target_class || e.class, type: e.exam_type,
        total: total, writing: 0, progress: 0, warnings: 0,
        left: Math.max(5, (e.duration || 30)) * 60 - i * 340
      };
    });
  }
  function tick() {
    // uptime
    if (state.server === "running") {
      var s = Math.floor((Date.now() - state.startedAt) / 1000);
      $("#stUptime").textContent = pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
      $("#stUptimeSub").textContent = "Since " + new Date(state.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      // ramp students in
      state.exams.forEach(function (ex) {
        if (ex.writing < ex.total && Math.random() < 0.55) {
          ex.writing += 1 + Math.floor(Math.random() * 2); ex.writing = Math.min(ex.writing, ex.total);
          if (ex.writing === ex.total) logEvent("exam", "accent", "i-users", "<b>" + esc(ex.name) + "</b>: all " + ex.total + " students have started");
        }
        if (ex.writing) ex.progress = Math.min(100, ex.progress + Math.random() * 0.9);
        ex.left = Math.max(0, ex.left - 1);
        if (Math.random() < 0.006 && ex.writing) { ex.warnings++; logEvent("exam", "warn", "i-alert", "A student in <b>" + esc(ex.cls) + "</b> switched away from the exam tab (warning " + ex.warnings + ")"); }
      });
      state.writing = state.exams.reduce(function (a, e) { return a + e.writing; }, 0);
      state.devices = state.writing + 3;
      var rate = state.writing * (0.6 + Math.random() * 0.8) + 2 + Math.random() * 3;
      state.samples.push(rate);
    } else {
      state.samples.push(0);
    }
    state.samples.shift();
    paintStats(); renderLive(); drawPulse(); drawSpark();
    var perMin = Math.round(state.samples.slice(-60).reduce(function (a, b) { return a + b; }, 0));
    $("#pulseRate").textContent = perMin.toLocaleString() + " requests/min";
    core.style.setProperty("--beat", Math.max(900, 2600 - state.writing * 22) + "ms");
    if (drainLeft > 0 && state.mode === "lock") tickDrain();
  }
  setInterval(tick, 1000);

  function paintStats() {
    $("#stDevices").textContent = state.devices;
    $("#stDevicesSub").textContent = state.server === "running" ? "On the school network" : "Server is off";
    var running = state.exams.filter(function (e) { return e.writing > 0; }).length;
    $("#stExams").textContent = running;
    $("#stWriting").textContent = state.writing;
    if (state.server !== "running") { $("#stUptime").textContent = "00:00:00"; $("#stUptimeSub").textContent = "Not started"; }
    var badge = $("#liveBadge");
    badge.hidden = running === 0; badge.textContent = running;
  }

  function fmtLeft(s) { return pad(Math.floor(s / 60)) + ":" + pad(s % 60); }
  function renderLive() {
    var wrap = $("#liveTable").parentElement;
    var active = state.exams.filter(function (e) { return e.writing > 0; });
    wrap.classList.toggle("is-empty", active.length === 0);
    $("#liveSub").textContent = state.server !== "running" ? "Start the server to see exams in progress." :
      active.length ? active.length + " exam" + (active.length > 1 ? "s" : "") + " in progress, " + state.writing + " students writing." : "Waiting for students to start.";
    var tb = $("#liveTable tbody");
    var html = active.map(function (e, i) {
      var warnPill = e.warnings ? "<span class='pill pill--warn'>" + e.warnings + "</span>" : "<span class='pill'>0</span>";
      var leftPill = e.left < 300 ? "pill pill--warn" : "pill";
      return "<tr><td><strong>" + esc(e.name) + "</strong><em>" + (e.type === "common_entrance" ? "Common Entrance" : "School exam") + "</em></td>" +
        "<td>" + esc(e.cls) + "</td><td class='mono'>" + e.writing + " / " + e.total + "</td>" +
        "<td><div class='prog'><i style='width:" + e.progress.toFixed(1) + "%'></i></div></td>" +
        "<td>" + warnPill + "</td><td><span class='" + leftPill + " mono'>" + fmtLeft(e.left) + "</span></td>" +
        "<td><div class='row-actions'><button class='btn btn--ghost btn--sm' data-add='" + i + "'><svg><use href='#i-plus'/></svg>5 min</button></div></td></tr>";
    }).join("");
    if (tb.dataset.sig !== html) { tb.innerHTML = html; tb.dataset.sig = html; }
  }
  $("#liveTable").addEventListener("click", function (e) {
    var b = e.target.closest("[data-add]"); if (!b) return;
    var ex = state.exams.filter(function (x) { return x.writing > 0; })[+b.dataset.add];
    if (ex) { ex.left += 300; toast("Added 5 minutes to " + ex.name); logEvent("exam", "accent", "i-clock", "<b>+5 minutes</b> added to " + esc(ex.name)); }
  });
  $("#pauseAllBtn").addEventListener("click", function () {
    if (state.server !== "running" || !state.writing) { toast("No exams are running"); return; }
    toast("All exams paused. Students see a waiting screen.");
    logEvent("exam", "warn", "i-pause", "<b>All exams paused</b> by super admin");
  });
  (function seedAttention() {
    var items = [
      ["Chiamaka Eze", "JSS 1 · Lost connection 40 seconds ago, paused automatically"],
      ["Tunde Bakare", "Grade 12 · Reached 3 warnings, submitted automatically"]
    ];
    $("#attention").innerHTML = items.map(function (it, i) {
      return "<li><svg><use href='#i-alert'/></svg><span><strong>" + esc(it[0]) + "</strong><em>" + esc(it[1]) + "</em></span>" +
        (i === 0 ? "<button class='btn btn--ghost btn--sm' data-resume>Resume</button>" : "<button class='btn btn--ghost btn--sm' data-dismiss>Dismiss</button>") + "</li>";
    }).join("");
  })();
  $("#attention").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var li = b.closest("li");
    if (b.hasAttribute("data-resume")) toast("Exam resumed for " + li.querySelector("strong").textContent);
    li.remove();
    if (!$("#attention li")) $("#attention").innerHTML = "<li class='is-empty'>Nothing needs your attention.</li>";
  });

  /* ---- pulse canvas ---- */
  function drawPulse() {
    var c = $("#pulseCanvas"); if (!c) return;
    var dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (!w) return;
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
    var ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    var css = getComputedStyle(document.documentElement);
    var line = css.getPropertyValue("--accent").trim() || "#171614";
    var grid = css.getPropertyValue("--line").trim();
    ctx.strokeStyle = grid; ctx.lineWidth = 1;
    for (var g = 1; g < 3; g++) { ctx.beginPath(); ctx.moveTo(0, Math.round(h * g / 3) + 0.5); ctx.lineTo(w, Math.round(h * g / 3) + 0.5); ctx.stroke(); }
    var max = Math.max(20, Math.max.apply(null, state.samples) * 1.2);
    var n = state.samples.length, step = w / (n - 1);
    ctx.beginPath();
    state.samples.forEach(function (v, i) { var x = i * step, y = h - 2 - (v / max) * (h - 8); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.strokeStyle = line; ctx.lineWidth = 1.6; ctx.lineJoin = "round"; ctx.stroke();
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, line + "33"); grad.addColorStop(1, line + "00");
    ctx.fillStyle = grad; ctx.fill();
  }
  window.addEventListener("resize", drawPulse);

  /* ---- events ---- */
  var events = [];
  function logEvent(cat, tone, icon, html) {
    events.unshift({ t: nowHM(), cat: cat, tone: tone, icon: icon, html: html });
    events = events.slice(0, 60);
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
    $("#actList").innerHTML = list.length ? list.map(function (e) { return evHtml(e, false); }).join("") : "<li><time></time><span></span><span>No activity in this category yet.</span></li>";
  }
  $$("#actFilter button").forEach(function (b) {
    b.addEventListener("click", function () {
      actFilter = b.dataset.f;
      $$("#actFilter button").forEach(function (x) { x.classList.toggle("is-active", x === b); });
      renderEvents(false);
    });
  });
  // seed history
  [["backup", "ok", "i-backup", "<b>Automatic backup</b> finished (exam.db, verified)"],
   ["licence", "ok", "i-shield", "<b>Licence checked</b> with cognitara.net. Annual plan active"],
   ["server", "", "i-check", "<b>CogniTara Studio opened</b>"]].forEach(function (e) { events.push({ t: "08:" + (40 + events.length * 6), cat: e[0], tone: e[1], icon: e[2], html: e[3] }); });
  renderEvents(false);

  /* ---- licence ---- */
  var PLANS = {
    monthly: { name: "Monthly", days: 23, total: 30, exp: "11 Dec 2026", lease: "25 Nov 2026", leaseNote: "works offline for 7 days at a time", rail: "Monthly plan", activatedLine: "Renews monthly. Works offline for up to 7 days at a time." },
    annual: { name: "Annual", days: 287, total: 365, exp: "1 Sep 2027", lease: "18 Dec 2026", leaseNote: "works offline for 30 days at a time", rail: "Annual plan", activatedLine: "Valid for 12 months. Works offline for up to 30 days at a time." },
    lifetime: { name: "Lifetime", days: null, total: null, exp: "Never", lease: "16 Feb 2027", leaseNote: "check in every 90 days to stay active", rail: "Lifetime plan", activatedLine: "Never expires. Checks in with cognitara.net every 90 days." }
  };
  function paintLicence() {
    var p = PLANS[state.plan];
    var frac = p.days == null ? 1 : p.days / p.total;
    $("#licPlan").textContent = p.name;
    $("#licExpLabel").textContent = p.days == null ? "Expires" : "Expires";
    $("#licExp").textContent = p.exp;
    $("#licLease").innerHTML = esc(p.lease) + " <em>" + esc(p.leaseNote) + "</em>";
    $("#licDays").textContent = p.days == null ? "∞" : p.days;
    $("#licDaysLabel").textContent = p.days == null ? "never expires" : "days left of " + p.total;
    var arc = $("#licArc");
    arc.style.transition = "none"; arc.style.strokeDashoffset = "100"; void arc.getBoundingClientRect();
    arc.style.transition = ""; arc.style.strokeDashoffset = String(100 - frac * 100);
    $("#railPlan").textContent = p.rail;
    $("#railDays").textContent = p.days == null ? "Never expires" : p.days + " days left";
    $("#railRing").style.strokeDashoffset = String(100 - frac * 100);
  }
  $$("#dockPlan button").forEach(function (b) {
    b.addEventListener("click", function () {
      state.plan = b.dataset.plan;
      $$("#dockPlan button").forEach(function (x) { x.classList.toggle("is-active", x === b); });
      paintLicence();
      if (activated) { var p = PLANS[state.plan]; $("#verifyResult").innerHTML = "<strong>" + esc(p.name) + " plan activated</strong><span>" + esc(p.activatedLine) + "</span>"; }
    });
  });
  $("#checkInBtn").addEventListener("click", function () {
    $("#licCheck").textContent = "Today, " + nowHM();
    toast("Checked in with cognitara.net. Licence is active.");
    logEvent("licence", "ok", "i-shield", "<b>Licence checked</b> with cognitara.net");
  });

  /* ---- backups ---- */
  var backups = [
    { when: "Today, 08:40", type: "Automatic", size: "742 KB" },
    { when: "Yesterday, 16:05", type: "Automatic", size: "739 KB" },
    { when: "Yesterday, 11:30", type: "Before exam", size: "731 KB" },
    { when: "17 Nov, 15:12", type: "Manual", size: "702 KB" }
  ];
  function renderBackups() {
    $("#bkTable tbody").innerHTML = backups.map(function (b, i) {
      return "<tr><td><strong>" + esc(b.when) + "</strong><em class='mono'>exam_backup_" + (20261118 - i) + ".db</em></td><td>" + esc(b.type) + "</td><td class='mono'>" + esc(b.size) + "</td>" +
        "<td><span class='pill pill--ok'>Verified</span></td><td><div class='row-actions'><button class='btn btn--ghost btn--sm' data-restore='" + i + "'><svg><use href='#i-restore'/></svg>Restore</button></div></td></tr>";
    }).join("");
  }
  renderBackups();
  $("#backupBtn").addEventListener("click", function () {
    var prog = $("#backupProg"), bar = prog.querySelector("i"), label = prog.querySelector("span");
    prog.hidden = false; this.disabled = true; var btn = this;
    var stages = ["Copying exam records…", "Checking the copy is complete…", "Done"];
    animate(2200, function (p) {
      bar.style.width = (p * 100) + "%";
      label.textContent = stages[Math.min(2, Math.floor(p * 2.2))];
    }, function () {
      backups.unshift({ when: "Today, " + nowHM(), type: "Manual", size: "743 KB" });
      renderBackups();
      setTimeout(function () { prog.hidden = true; bar.style.width = "0"; btn.disabled = false; }, 600);
      toast("Backup saved and verified");
      logEvent("backup", "ok", "i-backup", "<b>Manual backup</b> saved and verified");
    });
  });
  $("#bkTable").addEventListener("click", function (e) {
    var b = e.target.closest("[data-restore]"); if (!b) return;
    if (b.dataset.armed) { toast("In the real app, the server stops, restores this copy, then restarts."); delete b.dataset.armed; b.innerHTML = "<svg><use href='#i-restore'/></svg>Restore"; return; }
    b.dataset.armed = "1"; b.textContent = "Click to confirm";
    setTimeout(function () { if (b.dataset.armed) { delete b.dataset.armed; b.innerHTML = "<svg><use href='#i-restore'/></svg>Restore"; } }, 3500);
  });

  /* ------------------------------------------------------------------ lock screens */
  var drainLeft = 0;
  var LOCKS = {
    expired: {
      title: "Your licence has ended",
      body: "The server has stopped accepting new exams. Your exams, questions and results are safe and will be here when you renew.",
      actions: [["primary", "Renew on cognitara.net", "https://cognitara.net/account/licences"], ["ghost", "Import licence file"]],
      meta: "Licence ended 18 Nov 2026, 09:58"
    },
    clock: {
      title: "This computer's date and time look wrong",
      body: "The clock is set earlier than the last time CogniTara ran, so the server is paused to protect your licence. Set the correct date and time in Windows, then check again.",
      actions: [["primary", "Open Windows date settings"], ["ghost", "Check again"]],
      meta: "Last trusted time: 18 Nov 2026, 09:58. Current clock: 2 Mar 2026, 08:14"
    },
    revoked: {
      title: "This licence has been revoked",
      body: "CogniTara HQ has turned off this licence. Exams can't be started on this computer. Your data stays on this PC and is not deleted.",
      actions: [["primary", "Contact support"], ["ghost", "Export my data"]],
      meta: "Reference <code>TMB-01JXZ99887766</code>. Email support@cognitara.net with this reference."
    }
  };
  function showLock(kind) {
    var L = LOCKS[kind], lock = $("#lock");
    lock.dataset.kind = kind;
    $("#lockTitle").textContent = L.title;
    $("#lockBody").textContent = L.body;
    $("#lockMeta").innerHTML = L.meta;
    $("#lockActions").innerHTML = L.actions.map(function (a) {
      return a[2] ? "<a class='btn btn--" + a[0] + "' href='" + a[2] + "' target='_blank' rel='noopener'>" + esc(a[1]) + "</a>" : "<button class='btn btn--" + a[0] + "'>" + esc(a[1]) + "</button>";
    }).join("");
    if (kind === "expired") { drainLeft = 15 * 60; lock.classList.remove("no-drain"); tickDrain(); }
    else drainLeft = 0;
    setMode("lock");
    setHeaderStatus("locked", kind === "expired" ? "Finishing exams" : "Locked", kind === "expired" ? "New exams blocked" : kind === "clock" ? "Clock changed" : "Licence revoked");
  }
  function tickDrain() {
    drainLeft = Math.max(0, drainLeft - 1);
    $("#drainTime").textContent = fmtLeft(drainLeft);
    if (drainLeft === 0) $("#lock").classList.add("no-drain");
  }

  /* ------------------------------------------------------------------ window chrome + tray */
  function hideToTray(msg) {
    win.classList.add("is-hidden");
    $("#tray").hidden = false;
    toast(msg);
  }
  function restoreWin() { win.classList.remove("is-hidden"); $("#tray").hidden = true; }
  $("#minBtn").addEventListener("click", function () { hideToTray("CogniTara is in the tray"); });
  $("#closeBtn").addEventListener("click", function () { hideToTray("CogniTara keeps running in the tray"); });
  $("#maxBtn").addEventListener("click", function () { win.classList.toggle("is-max"); setTimeout(drainPulseSafe, 950); });
  function drainPulseSafe() { drawPulse(); }
  $("#tray").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tray]"); if (!b) return;
    var a = b.dataset.tray;
    if (a === "toggle") { if (state.mode !== "app") enterApp(); toggleServer(); }
    if (a === "open") restoreWin();
    if (a === "portal") window.open("/login", "_blank", "noopener");
    if (a === "quit") {
      if (state.server === "running" && state.writing) { b.textContent = "Students are writing. Quit anyway?"; return; }
      restoreWin(); toast("In the real app, CogniTara stops the server safely and closes.");
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#tray").hidden) restoreWin(); });

  /* ------------------------------------------------------------------ preview dock */
  $$("#dockScreens button").forEach(function (b) {
    b.addEventListener("click", function () {
      restoreWin();
      var go = b.dataset.go;
      if (go === "boot") playBoot();
      else if (go === "onboarding") startOnboarding();
      else if (go === "app") { enterApp(); playHeaderIn(); setServer(state.server === "locked" ? "stopped" : state.server); }
      else showLock(go);
    });
  });

  /* ------------------------------------------------------------------ init */
  applyTheme(state.theme, false);
  setServer("stopped");
  syncAddr(false);
  syncSchool();
  paintLicence();
  renderLive();
  var start = new URLSearchParams(location.search).get("screen");
  if (start === "app") { setMode("app"); showView("home"); }
  else if (start === "onboarding") startOnboarding();
  else if (start && LOCKS[start]) showLock(start);
  else if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { playBoot(); });
  else playBoot();
})();
