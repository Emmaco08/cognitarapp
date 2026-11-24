/* CogniTara Studio Setup — UI controller (no frameworks, no network).
 * Talks to the Rust side through window.__TAURI__ (withGlobalTauri = true).
 */
(() => {
  "use strict";

  const T = window.__TAURI__;
  const invoke = (cmd, args) => (T && T.core ? T.core.invoke(cmd, args || {}) : Promise.reject(new Error("Tauri API unavailable")));
  const listen = (ev, cb) => (T && T.event ? T.event.listen(ev, (e) => cb(e.payload)) : Promise.resolve(() => {}));
  const $ = (id) => document.getElementById(id);

  const TIPS = [
    { icon: "t-lan", title: "Offline-first LAN exams", body: "Run 300+ candidates over your school network — no internet needed during sittings." },
    { icon: "t-save", title: "Every answer saved instantly", body: "SQLite WAL persistence means a power cut never wipes a student's work." },
    { icon: "t-vault", title: "5-layer licence vault", body: "Hardware-bound Ed25519 leases with a graceful 15-minute exam drain." },
    { icon: "t-dial", title: "Live proctor controls", body: "Pause everyone, add +5 minutes or resume candidates from a single dial." },
    { icon: "t-backup", title: "Automatic hot backups", body: "Verified snapshots every 30 minutes, restored in one click." },
    { icon: "t-update", title: "Updates inside the app", body: "Studio installs delta updates safely between exams — no re-downloads." },
  ];

  const state = {
    info: null,
    dir: "",
    location: null,
    screen: "options",
    target: 0,
    shown: 0,
    step: "",
    result: null,
    tipIdx: 0,
    tipTimer: 0,
    raf: 0,
  };

  /* ---------------- helpers ---------------- */
  function fmtBytes(n) {
    if (n == null || !isFinite(n)) return "—";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (n >= 1000 && i < u.length - 1) { n /= 1024; i++; }
    return (n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)) + " " + u[i];
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function show(name) {
    if (state.screen === name && document.querySelector(".screen.is-active")) return;
    document.querySelectorAll(".screen").forEach((s) => {
      const on = s.dataset.screen === name;
      if (!on && s.classList.contains("is-active")) {
        s.classList.add("is-leaving");
        setTimeout(() => s.classList.remove("is-leaving"), 600);
      }
      s.classList.toggle("is-active", on);
    });
    state.screen = name;
    $("btnClose").disabled = name === "installing";
    $("btnClose").title = name === "installing" ? "Installation in progress" : "Close";
  }

  /* ---------------- theme ---------------- */
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    $("btnTheme").title = t === "dark" ? "Switch to light theme" : "Switch to dark theme";
    try { localStorage.setItem("ct-setup-theme", t); } catch (_) {}
  }

  /* ---------------- options screen ---------------- */
  function renderLocation(loc) {
    state.location = loc;
    state.dir = loc.path;
    $("pathText").textContent = loc.path;
    $("pathText").title = loc.path;
    $("reqText").textContent = "Requires " + fmtBytes(loc.requiredBytes);
    const free = $("freeText");
    if (loc.freeBytes == null) {
      free.textContent = "Free space unknown";
      free.classList.remove("is-low");
    } else {
      free.textContent = fmtBytes(loc.freeBytes) + " free" + (loc.drive ? " on drive " + loc.drive.replace(/[:\\]+$/, "") : "");
      free.classList.toggle("is-low", loc.freeBytes < loc.requiredBytes * 1.1);
    }
    $("adminHint").hidden = !loc.needsAdmin;
    $("pathError").hidden = !loc.problem;
    $("pathError").textContent = loc.problem || "";
    $("pathBox").classList.toggle("is-invalid", !!loc.problem);
    $("btnContinue").disabled = !!loc.problem;
  }

  function renderInfo(info) {
    state.info = info;
    $("verLabel").textContent = "Version " + info.version;
    $("dataDir").textContent = info.dataDir;
    $("previewChip").hidden = !info.preview;
    if (info.existing && info.existing.version) {
      const pill = $("updatePill");
      pill.hidden = false;
      $("app").classList.add("is-update");
      pill.textContent = info.existing.version === info.version
        ? "Version " + info.version + " is already installed — setup will repair it"
        : "Updating from " + info.existing.version + " to " + info.version;
      $("continueLabel").textContent = info.existing.version === info.version ? "Repair" : "Update";
    }
    renderLocation(info.location);
  }

  async function browse() {
    try {
      const picked = await invoke("choose_folder", { current: state.dir });
      if (picked) renderLocation(await invoke("check_location", { path: picked }));
    } catch (e) {
      toast("Couldn't open the folder picker.");
    }
  }

  /* ---------------- installing screen ---------------- */
  const RING_C = 2 * Math.PI * 92;

  function setStep(text) {
    if (!text || text === state.step) return;
    state.step = text;
    const el = $("stepText");
    el.textContent = text;
    el.classList.remove("swap");
    void el.offsetWidth; // restart animation
    el.classList.add("swap");
  }

  function paintProgress(p) {
    const v = Math.max(0, Math.min(100, p));
    $("ringBar").style.strokeDashoffset = String(RING_C * (1 - v / 100));
    $("ringTip").style.transform = "rotate(" + (v * 3.6).toFixed(2) + "deg)";
    $("pctNum").textContent = String(Math.floor(v));
  }

  function tick() {
    const diff = state.target - state.shown;
    if (Math.abs(diff) > 0.02) {
      state.shown += Math.max(Math.min(diff * 0.075, 1.6), Math.min(diff, 0.03));
      paintProgress(state.shown);
    }
    state.raf = requestAnimationFrame(tick);
  }

  function buildTips() {
    const stage = $("tipStage");
    const dots = $("tipDots");
    stage.innerHTML = "";
    dots.innerHTML = "";
    TIPS.forEach((t, i) => {
      const el = document.createElement("div");
      el.className = "tip" + (i === 0 ? " on" : "");
      el.innerHTML = '<span class="tip__icon"><svg><use href="#' + t.icon + '"/></svg></span><div class="tip__copy"><b class="tip__title"></b><span class="tip__body"></span></div>';
      el.querySelector(".tip__title").textContent = t.title;
      el.querySelector(".tip__body").textContent = t.body;
      stage.appendChild(el);
      const d = document.createElement("i");
      if (i === 0) d.className = "on";
      dots.appendChild(d);
    });
  }

  function showTip(i) {
    const tips = $("tipStage").children;
    const dots = $("tipDots").children;
    const prev = state.tipIdx;
    state.tipIdx = (i + TIPS.length) % TIPS.length;
    for (let k = 0; k < tips.length; k++) {
      tips[k].classList.toggle("on", k === state.tipIdx);
      tips[k].classList.toggle("off", k === prev && k !== state.tipIdx);
      dots[k].classList.toggle("on", k === state.tipIdx);
    }
    setTimeout(() => { if (tips[prev]) tips[prev].classList.remove("off"); }, 600);
  }

  function startTips() {
    clearInterval(state.tipTimer);
    state.tipTimer = setInterval(() => showTip(state.tipIdx + 1), 5200);
  }

  async function startInstall() {
    if (!state.location || state.location.problem) return;
    state.target = 0;
    state.shown = 0;
    state.step = "";
    state.result = null;
    paintProgress(0);
    setStep("Preparing installer…");
    $("detailText").textContent = "Installing to " + state.dir;
    showTip(0);
    startTips();
    show("installing");
    try {
      await invoke("start_install", {
        options: {
          installDir: state.dir,
          desktopShortcut: $("optDesktop").checked,
          startMenuShortcut: $("optStart").checked,
        },
      });
    } catch (e) {
      onFinished({ ok: false, code: -1, title: "Setup couldn't start", message: String(e && e.message ? e.message : e), detail: String(e), installDir: state.dir });
    }
  }

  function onProgress(p) {
    if (state.screen !== "installing") return;
    state.target = Math.max(state.target, p.percent);
    setStep(p.step);
    if (p.detail) $("detailText").textContent = p.detail;
  }

  function onFinished(r) {
    state.result = r;
    if (!r.ok) {
      clearInterval(state.tipTimer);
      showError(r);
      return;
    }
    state.target = 100;
    setStep("Installation complete");
    const wait = () => {
      if (state.shown >= 99.6) {
        paintProgress(100);
        setTimeout(() => showFinish(r), 450);
      } else {
        setTimeout(wait, 60);
      }
    };
    wait();
  }

  /* ---------------- finish / error ---------------- */
  function showFinish(r) {
    clearInterval(state.tipTimer);
    const info = state.info || {};
    $("finishSub").textContent = "Version " + (info.version || "") + " was installed successfully.";
    $("sumDir").textContent = r.installDir || state.dir;
    $("sumDir").title = r.installDir || state.dir;
    const d = $("optDesktop").checked, s = $("optStart").checked;
    $("sumShortcuts").textContent = d && s ? "Desktop and Start menu" : d ? "Desktop only" : s ? "Start menu only" : "No shortcuts created";
    $("sumData").textContent = info.dataDir || "";
    $("finishLaunch").checked = $("optLaunch").checked;
    show("finish");
  }

  function showError(r) {
    $("errTitle").textContent = r.title || "Installation failed";
    $("errMsg").textContent = r.message || "Something went wrong.";
    const lines = [r.detail || "", "Code: " + r.code, "Folder: " + (r.installDir || state.dir), "Setup: " + ((state.info && state.info.version) || "") + " (" + ((state.info && state.info.platform) || "") + ")"];
    $("errDetail").textContent = lines.filter(Boolean).join("\n");
    show("error");
  }

  async function finish() {
    const r = state.result || {};
    if ($("finishLaunch").checked && r.appExe) {
      try { await invoke("launch_app", { appExe: r.appExe }); }
      catch (e) { toast(String(e)); return; }
    }
    closeWindow();
  }

  async function closeWindow() {
    try {
      const closed = await invoke("win_close");
      if (closed === false) toast("Installation is in progress — please wait until it finishes.");
    } catch (_) { /* preview in browser */ }
  }

  /* ---------------- wiring ---------------- */
  function wire() {
    $("btnMin").addEventListener("click", () => invoke("win_minimize").catch(() => {}));
    $("btnClose").addEventListener("click", closeWindow);
    $("btnTheme").addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
    $("btnBrowse").addEventListener("click", browse);
    $("btnContinue").addEventListener("click", startInstall);
    $("btnFinish").addEventListener("click", finish);
    $("btnErrClose").addEventListener("click", closeWindow);
    $("btnRetry").addEventListener("click", () => show("options"));
    $("btnCopy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText($("errDetail").textContent); toast("Details copied to clipboard"); }
      catch (_) { toast("Select the text and press Ctrl+C to copy"); }
    });
    $("tips").addEventListener("click", () => { showTip(state.tipIdx + 1); startTips(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && state.screen === "options" && !$("btnContinue").disabled) startInstall();
    });
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    listen("setup://progress", onProgress);
    listen("setup://finished", onFinished);
    listen("setup://close-blocked", () => toast("Installation is in progress — please wait until it finishes."));
  }

  async function init() {
    let theme = "dark";
    try { theme = localStorage.getItem("ct-setup-theme") || "dark"; } catch (_) {}
    applyTheme(theme);
    buildTips();
    wire();
    paintProgress(0);
    state.raf = requestAnimationFrame(tick);
    try {
      renderInfo(await invoke("get_setup_info"));
    } catch (e) {
      renderLocation({ path: "C:\\Program Files\\CogniTara Studio", drive: "C:", freeBytes: null, requiredBytes: 0, needsAdmin: true, problem: null });
    }
    show("options");
    // Reveal the (initially hidden) native window only after first paint: no white flash.
    requestAnimationFrame(() => requestAnimationFrame(() => invoke("ui_ready").catch(() => {})));
  }

  // Small hook for visual QA / automated screenshots (harmless in production).
  window.CogniSetup = {
    show,
    state,
    setProgress(p, step, detail) {
      state.target = p; state.shown = p; paintProgress(p);
      if (step) setStep(step);
      if (detail) $("detailText").textContent = detail;
    },
    showTip,
    showFinish,
    showError,
    onFinished,
    applyTheme,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
