/* ==========================================================================
   CogniTara Server Studio — Super Admin Desktop Preview Runtime (Carbon v3.0)
   100% Vanilla ES2023 | Zero External Dependencies | Offline-First
   ========================================================================== */

(() => {
  "use strict";

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const darkSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

  // Parse server-rendered telemetry snapshot
  let telemetry = {};
  try {
    const raw = document.getElementById("ct-telemetry-data")?.textContent;
    if (raw) telemetry = JSON.parse(raw);
  } catch (_) {
    telemetry = {};
  }

  // Core DOM references
  const desktopEnv = document.getElementById("ctDesktopEnv");
  const appShell = document.getElementById("ctAppShell");
  const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
  const toastEl = document.getElementById("ctToast");

  // Application state
  const state = {
    stage: "boot",
    subview: "overview",
    chapter: 1,
    visitedChapters: new Set([1]),
    bootSpeed: 1,
    bootTimers: [],
    engineRunning: true,
    leaseSeconds: 365 * 86400 - 42,
    leasePerpetual: false,
    calcInput: "3",
    calcExpr: "(8 + √(64 - 48)) / 4",
    calcResetNext: true,
    regularExamMode: true,
    toastTimer: null,
  };

  /* ------------------------------------------------------------------------
     1. POLITE TOAST & CLIPBOARD HELPERS
     ------------------------------------------------------------------------ */
  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      toastEl.classList.remove("is-visible");
    }, 2600);
  }

  async function copyToClipboard(text, label = "Copied to clipboard") {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      showToast(`${label}: ${text}`);
    } catch (_) {
      showToast(`Ready to copy: ${text}`);
    }
  }

  function appendConsoleLog(level, tag, message) {
    const container = document.getElementById("ctConsoleLines");
    if (!container) return;
    const now = new Date();
    const stamp = now.toTimeString().slice(0, 8);
    const row = document.createElement("div");
    row.className = "ct-log-row";
    row.dataset.logType = level === "sec" ? "sec" : "info";

    const lvlClass =
      level === "sec"
        ? "ct-log-lvl-sec"
        : level === "warn"
          ? "ct-log-lvl-warn"
          : "ct-log-lvl-info";

    const timeSpan = document.createElement("span");
    timeSpan.className = "ct-log-time ct-tabular";
    timeSpan.textContent = stamp;

    const tagSpan = document.createElement("span");
    tagSpan.className = lvlClass;
    tagSpan.textContent = tag;

    const msgSpan = document.createElement("span");
    msgSpan.textContent = message;

    row.append(timeSpan, tagSpan, msgSpan);
    container.prepend(row);
  }

  /* ------------------------------------------------------------------------
     2. TRI-STATE COLOR-SCHEME CONTROLLER (Obsidian Mica / Daylight Ceramic / Auto)
     ------------------------------------------------------------------------ */
  function getCurrentSchemeChoice() {
    try {
      const saved = localStorage.getItem("color-scheme");
      if (saved === "dark" || saved === "light") return saved;
    } catch (_) {}
    return "light dark";
  }

  function isDarkActive() {
    const content = colorSchemeMeta?.content || "light dark";
    if (content === "dark") return true;
    if (content === "light") return false;
    return darkSchemeQuery.matches;
  }

  function applyColorScheme(choice, announce = false) {
    const normalized = choice === "dark" || choice === "light" ? choice : "light dark";
    if (colorSchemeMeta) {
      colorSchemeMeta.content = normalized;
    }

    if (normalized === "dark" || normalized === "light") {
      document.documentElement.dataset.theme = normalized;
      try {
        localStorage.setItem("color-scheme", normalized);
      } catch (_) {}
    } else {
      delete document.documentElement.dataset.theme;
      try {
        localStorage.removeItem("color-scheme");
      } catch (_) {}
    }

    document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
      const matched = btn.getAttribute("data-theme-choice") === normalized;
      btn.setAttribute("aria-checked", matched ? "true" : "false");
    });

    if (announce) {
      const label =
        normalized === "dark"
          ? "Obsidian Mica (Dark)"
          : normalized === "light"
            ? "Daylight Ceramic (Light)"
            : "System Auto";
      showToast(`Theme switched to ${label}`);
    }
  }

  /* ------------------------------------------------------------------------
     3. STAGE NAVIGATION WITH VIEW TRANSITIONS & POST-MORPH FOCUS ROUTING
     ------------------------------------------------------------------------ */
  const STAGE_FOCUS_IDS = {
    boot: "ctSplashHeading",
    onboarding: "ctOnboardFocusHeading",
    studio: "ctStudioFocusHeading",
    expired: "ctExpiredHeading",
    revoked: "ctRevokedHeading",
  };

  function commitStageDOM(targetStage) {
    state.stage = targetStage;
    if (desktopEnv) desktopEnv.dataset.activeStage = targetStage;
    if (appShell) {
      appShell.dataset.stage = targetStage;
      appShell.classList.remove("is-minimized");
    }

    document.querySelectorAll(".ct-view-panel").forEach((panel) => {
      panel.classList.toggle("is-active", panel.id === `view-${targetStage}`);
    });

    document.querySelectorAll("[data-stage-tab]").forEach((tab) => {
      const active = tab.getAttribute("data-stage-tab") === targetStage;
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });

    // Update titlebar lease badge contextually for lockout stages
    const leaseChip = document.getElementById("ctTitlebarLeaseChip");
    const leaseText = document.getElementById("ctLeaseTicker");
    if (leaseChip && leaseText) {
      leaseChip.classList.remove("is-ok", "is-warn", "is-danger");
      if (targetStage === "expired") {
        leaseChip.classList.add("is-warn");
        leaseText.textContent = "00d 00h 00m";
      } else if (targetStage === "revoked") {
        leaseChip.classList.add("is-danger");
        leaseText.textContent = "REVOKED";
      } else {
        leaseChip.classList.add("is-ok");
        renderLeaseCountdown();
      }
    }
  }

  function focusStageHeading(targetStage) {
    const headingId = STAGE_FOCUS_IDS[targetStage];
    const heading = headingId ? document.getElementById(headingId) : null;
    if (heading) {
      heading.focus({ preventScroll: true });
    }
  }

  function switchStage(targetStage) {
    if (!STAGE_FOCUS_IDS[targetStage]) return;
    if (state.stage === targetStage && !appShell?.classList.contains("is-minimized")) {
      if (targetStage === "boot") runBootSequence();
      return;
    }

    const canTransition =
      typeof document.startViewTransition === "function" && !reducedMotionQuery.matches;

    if (canTransition) {
      const transition = document.startViewTransition(() => {
        commitStageDOM(targetStage);
      });
      transition.finished
        .then(() => {
          focusStageHeading(targetStage);
          if (targetStage === "boot") runBootSequence();
          if (targetStage === "studio") resizeWaveformCanvas();
        })
        .catch(() => {
          focusStageHeading(targetStage);
        });
    } else {
      commitStageDOM(targetStage);
      focusStageHeading(targetStage);
      if (targetStage === "boot") runBootSequence();
      if (targetStage === "studio") resizeWaveformCanvas();
    }
  }

  /* ------------------------------------------------------------------------
     4. SCULPTED SPLASH BOOT SEQUENCER & OPTICAL CANVAS
     ------------------------------------------------------------------------ */
  function clearBootTimers() {
    state.bootTimers.forEach((id) => window.clearTimeout(id));
    state.bootTimers = [];
  }

  function runBootSequence() {
    clearBootTimers();
    const splash = document.getElementById("ctSplashStage");
    const statusText = document.getElementById("ctBootStatusText");
    const pctEl = document.getElementById("ctBootPct");
    const barFill = document.getElementById("ctBootBarFill");
    if (!splash || !statusText || !pctEl || !barFill) return;

    const mul = reducedMotionQuery.matches ? 0.05 : state.bootSpeed;
    const hostLabel = telemetry.hostname || "EMMANUELPC";
    const qCount = telemetry.total_questions ?? 201;

    splash.dataset.bootPhase = "idle";
    pctEl.textContent = "0%";
    barFill.style.transform = "scaleX(0.04)";
    statusText.textContent = "Verifying Ed25519 hardware vault & monotonic clock anchors...";

    const steps = [
      {
        at: 110,
        phase: "sweep",
        pct: 28,
        msg: `Hardware ID matched on ${hostLabel} • 3/3 DPAPI clock anchors clean`,
      },
      {
        at: 780,
        phase: "ignite",
        pct: 62,
        msg: `Mounting SQLite WAL ledger (${qCount} banked questions, zero corruption)...`,
      },
      {
        at: 1450,
        phase: "locked",
        pct: 88,
        msg: `Binding 24-thread Waitress WSGI pool on ${telemetry.primary_lan_url || "http://127.0.0.1:5000"}...`,
      },
      {
        at: 2150,
        phase: "ready",
        pct: 100,
        msg: "Kernel verified & ready — explore the Interactive Tour or open Server Studio.",
      },
    ];

    steps.forEach((step) => {
      const tid = window.setTimeout(() => {
        splash.dataset.bootPhase = step.phase;
        pctEl.textContent = `${step.pct}%`;
        barFill.style.transform = `scaleX(${step.pct / 100})`;
        statusText.textContent = step.msg;
      }, Math.round(step.at * mul));
      state.bootTimers.push(tid);
    });
  }

  // Subtle ambient optical caustics on #ctSplashCanvas
  const splashCanvas = document.getElementById("ctSplashCanvas");
  let splashCtx = splashCanvas ? splashCanvas.getContext("2d") : null;

  function resizeSplashCanvas() {
    if (!splashCanvas || !splashCtx) return;
    const rect = splashCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    splashCanvas.width = Math.round(rect.width * dpr);
    splashCanvas.height = Math.round(rect.height * dpr);
    splashCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function renderSplashFrame(ts) {
    if (state.stage === "boot" && splashCanvas && splashCtx) {
      const w = splashCanvas.clientWidth;
      const h = splashCanvas.clientHeight;
      if (w > 0 && h > 0) {
        splashCtx.clearRect(0, 0, w, h);
        const dark = isDarkActive();
        const t = reducedMotionQuery.matches ? 0 : ts * 0.0009;
        const cx = w * 0.5 + Math.cos(t) * 26;
        const cy = h * 0.45 + Math.sin(t * 1.3) * 14;

        const grad = splashCtx.createRadialGradient(cx, cy, 8, cx, cy, Math.max(w, h) * 0.52);
        if (dark) {
          grad.addColorStop(0, "rgba(23, 22, 20, 0.13)");
          grad.addColorStop(0.45, "rgba(23, 22, 20, 0.06)");
          grad.addColorStop(1, "rgba(17, 17, 18, 0)");
        } else {
          grad.addColorStop(0, "rgba(23, 22, 20, 0.10)");
          grad.addColorStop(0.5, "rgba(23, 22, 20, 0.05)");
          grad.addColorStop(1, "rgba(255, 255, 255, 0)");
        }
        splashCtx.fillStyle = grad;
        splashCtx.fillRect(0, 0, w, h);
      }
    }
    if (!reducedMotionQuery.matches) {
      window.requestAnimationFrame(renderSplashFrame);
    }
  }

  /* ------------------------------------------------------------------------
     5. 5-CHAPTER INTERACTIVE ONBOARDING CONTROLLER & MINI LABS
     ------------------------------------------------------------------------ */
  function setOnboardingChapter(num) {
    const target = Math.min(5, Math.max(1, Number(num) || 1));
    state.chapter = target;
    state.visitedChapters.add(target);

    document.querySelectorAll("[data-chapter-btn]").forEach((btn) => {
      const idx = Number(btn.getAttribute("data-chapter-btn"));
      const isCurrent = idx === target;
      if (isCurrent) {
        btn.setAttribute("aria-current", "step");
      } else {
        btn.removeAttribute("aria-current");
      }
      btn.classList.toggle("is-done", state.visitedChapters.has(idx) && !isCurrent);
    });

    document.querySelectorAll("[data-chapter-pane]").forEach((pane) => {
      pane.classList.toggle("is-active", Number(pane.getAttribute("data-chapter-pane")) === target);
    });

    document.querySelectorAll("[data-lab-scene]").forEach((scene) => {
      scene.classList.toggle("is-active", Number(scene.getAttribute("data-lab-scene")) === target);
    });

    const prevBtn = document.getElementById("ctOnboardPrevBtn");
    const nextBtn = document.getElementById("ctOnboardNextBtn");
    const counter = document.getElementById("ctOnboardStepCounter");

    if (prevBtn) prevBtn.disabled = target === 1;
    if (counter) counter.textContent = `Chapter ${target} of 5`;
    if (nextBtn) {
      nextBtn.textContent = target === 5 ? "Launch Server Studio" : "Next Chapter";
    }
  }

  // Lab 1: Power-cut SQLite WAL simulator
  function bindPowerSimulator() {
    const btn = document.getElementById("ctSimPowerBtn");
    const lanStage = document.getElementById("ctLanStage");
    const walTitle = document.getElementById("ctWalTitle");
    const walDesc = document.getElementById("ctWalDesc");
    const walBadge = document.getElementById("ctWalBadge");
    if (!btn || !lanStage || !walTitle || !walDesc || !walBadge) return;

    btn.addEventListener("click", () => {
      const isCut = lanStage.dataset.power === "cut";
      if (!isCut) {
        lanStage.dataset.power = "cut";
        btn.textContent = "Restore Mains Power";
        walTitle.textContent = "Generator Trip Detected — WAL Checkpoint Flushed";
        walDesc.textContent =
          "All in-flight student answers committed to exam.db-wal; countdown timers paused safely.";
        walBadge.className = "ct-status-chip is-warn";
        walBadge.textContent = "WAL Protected";
        showToast("Simulated power cut: 0 student answers lost");
      } else {
        lanStage.dataset.power = "normal";
        btn.textContent = "Simulate Power Cut";
        walTitle.textContent = `SQLite WAL Stream Healthy (${telemetry.db_health || "ok"})`;
        walDesc.textContent = `All ${telemetry.counts?.approved_students ?? 13} student answer ledgers resumed from exact second.`;
        walBadge.className = "ct-status-chip is-ok";
        walBadge.textContent = "0 Data Loss";
        showToast("LAN heartbeats resumed with full answer integrity");
      }
    });
  }

  // Lab 2: Mini Exam + Docked Scientific Calculator
  function bindMiniExamCalculator() {
    const frame = document.getElementById("ctMiniExamFrame");
    const dockBtn = document.getElementById("ctCalcDockToggleBtn");
    const modeBtn = document.getElementById("ctExamModeToggleBtn");
    const labelEl = document.getElementById("ctMiniExamLabel");
    const stemEl = document.getElementById("ctMiniQuestionStem");
    const exprEl = document.getElementById("ctCalcExpr");
    const resEl = document.getElementById("ctCalcRes");

    dockBtn?.addEventListener("click", () => {
      if (!frame) return;
      const docked = frame.dataset.calc === "docked";
      frame.dataset.calc = docked ? "hidden" : "docked";
      dockBtn.setAttribute("aria-pressed", docked ? "false" : "true");
      dockBtn.textContent = docked ? "Calculator: Hidden" : "Calculator: Docked";
    });

    modeBtn?.addEventListener("click", () => {
      state.regularExamMode = !state.regularExamMode;
      modeBtn.setAttribute("aria-pressed", state.regularExamMode ? "false" : "true");
      if (state.regularExamMode) {
        modeBtn.textContent = "Mode: Regular Term";
        if (labelEl) labelEl.textContent = "SS3 Further Mathematics • Q14 of 40";
        if (stemEl) {
          stemEl.textContent =
            "Find the positive roots of 2x² − 8x + 6 = 0 using the docked scientific calculator:";
        }
      } else {
        modeBtn.textContent = "Mode: Entrance CBT";
        if (labelEl) labelEl.textContent = "JSS1 Common Entrance • Candidate CE-2026-041";
        if (stemEl) {
          stemEl.textContent =
            "Quantitative Aptitude: Evaluate √144 + 6² without leaving your question sheet:";
        }
      }
    });

    document.querySelectorAll("[data-mini-opt]").forEach((opt) => {
      opt.addEventListener("click", () => {
        document.querySelectorAll("[data-mini-opt]").forEach((o) => {
          o.setAttribute("aria-checked", o === opt ? "true" : "false");
        });
        const letter = opt.getAttribute("data-mini-opt");
        showToast(`Option ${letter} saved atomically to exam.db WAL`);
      });
    });

    document.querySelectorAll("[data-calc-key]").forEach((keyBtn) => {
      keyBtn.addEventListener("click", () => {
        const key = keyBtn.getAttribute("data-calc-key") || "";
        if (key === "C") {
          state.calcInput = "0";
          state.calcExpr = "";
          state.calcResetNext = true;
        } else if (key === "sqrt") {
          const val = parseFloat(state.calcInput) || 0;
          state.calcExpr = `√(${val})`;
          state.calcInput = val >= 0 ? String(Number(Math.sqrt(val).toFixed(6))) : "Err";
          state.calcResetNext = true;
        } else if (key === "sq") {
          const val = parseFloat(state.calcInput) || 0;
          state.calcExpr = `(${val})²`;
          state.calcInput = String(Number((val * val).toFixed(6)));
          state.calcResetNext = true;
        } else if (key === "=") {
          try {
            const sanitized = state.calcInput.replace(/[^0-9+\-*/.]/g, "");
            if (sanitized) {
              state.calcExpr = `${sanitized} =`;
              const computed = Function(`"use strict"; return (${sanitized});`)();
              state.calcInput = Number.isFinite(computed)
                ? String(Number(computed.toFixed(6)))
                : "Err";
            }
          } catch (_) {
            state.calcInput = "Err";
          }
          state.calcResetNext = true;
        } else if (["+", "-", "*", "/"].includes(key)) {
          state.calcInput = `${state.calcInput}${key}`;
          state.calcResetNext = false;
        } else {
          if (state.calcResetNext || state.calcInput === "0") {
            state.calcInput = key;
            state.calcResetNext = false;
          } else {
            state.calcInput += key;
          }
        }
        if (exprEl) exprEl.textContent = state.calcExpr;
        if (resEl) resEl.textContent = state.calcInput;
      });
    });
  }

  // Lab 3: Formula Studio + Duplicate Session Fence
  function bindFormulaAndFenceLab() {
    const renderEl = document.getElementById("ctFormulaRender");
    const sourceEl = document.getElementById("ctFormulaSource");
    const dupBtn = document.getElementById("ctSimDuplicateBtn");
    const fenceTitle = document.getElementById("ctFenceTitle");
    const fenceSub = document.getElementById("ctFenceSub");
    const fenceBadge = document.getElementById("ctFenceBadge");

    const presets = {
      quad: {
        html: 'x = <span class="ct-frac"><span class="ct-frac-num">−b ± √(b² − 4ac)</span><span class="ct-frac-den">2a</span></span>',
        tex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
      },
      chem: {
        html: "2H<sub>2(g)</sub> + O<sub>2(g)</sub> → 2H<sub>2</sub>O<sub>(l)</sub> &nbsp; ΔH° = −572 kJ·mol<sup>−1</sup>",
        tex: "\\ce{2H2(g) + O2(g) -> 2H2O(l)} \\quad \\Delta H^\\circ = -572\\text{ kJ/mol}",
      },
      calc: {
        html: "∫<sub>0</sub><sup>π</sup> sin(x) dx = [−cos(x)]<sub>0</sub><sup>π</sup> = 2",
        tex: "\\int_0^\\pi \\sin(x)\\,dx = \\left[-\\cos(x)\\right]_0^\\pi = 2",
      },
    };

    document.querySelectorAll("[data-formula-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-formula-preset") || "quad";
        const item = presets[key] || presets.quad;
        document.querySelectorAll("[data-formula-preset]").forEach((b) => {
          const active = b === btn;
          b.setAttribute("aria-selected", active ? "true" : "false");
          b.setAttribute("aria-pressed", active ? "true" : "false");
        });
        if (renderEl) renderEl.innerHTML = item.html;
        if (sourceEl) sourceEl.textContent = item.tex;
      });
    });

    let fencedTriggered = false;
    dupBtn?.addEventListener("click", () => {
      fencedTriggered = !fencedTriggered;
      if (fencedTriggered) {
        if (fenceTitle) {
          fenceTitle.textContent = "Duplicate Login Blocked on LAB-PC-19 (HTTP 403)";
        }
        if (fenceSub) {
          fenceSub.textContent =
            "Original session_key on LAB-PC-04 protected; violation recorded in proctor log.";
        }
        if (fenceBadge) {
          fenceBadge.className = "ct-status-chip is-danger";
          fenceBadge.textContent = "403 Blocked";
        }
        dupBtn.textContent = "Reset Lease State";
        appendConsoleLog(
          "sec",
          "FENCE",
          "Blocked duplicate session_key hijack attempt from workstation LAB-PC-19 (HTTP 403)."
        );
        showToast("Duplicate PC login rejected with HTTP 403");
      } else {
        if (fenceTitle) {
          fenceTitle.textContent = "Active Lease: STU-014 (Workstation LAB-PC-04)";
        }
        if (fenceSub) {
          fenceSub.textContent = "Heartbeat verified every 25s • Single-PC lease clean";
        }
        if (fenceBadge) {
          fenceBadge.className = "ct-status-chip is-ok";
          fenceBadge.textContent = "Lease Fenced";
        }
        dupBtn.textContent = "Simulate Duplicate PC";
      }
    });
  }

  // Lab 4 & 5: License Presets, Referral Slider & Calibration Sync
  function bindLicenseAndCalibrationLab() {
    const seg2 = document.getElementById("ctKeySeg2");
    document.querySelectorAll("[data-plan-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tier = btn.getAttribute("data-plan-preset");
        document.querySelectorAll("[data-plan-preset]").forEach((b) => {
          b.setAttribute("aria-pressed", b === btn ? "true" : "false");
        });
        if (tier === "monthly") {
          if (seg2) seg2.value = "MN30";
          state.leasePerpetual = false;
          state.leaseSeconds = 30 * 86400 - 15;
          showToast("Previewing Monthly 30-Day Paystack License");
        } else if (tier === "lifetime") {
          if (seg2) seg2.value = "LF99";
          state.leasePerpetual = true;
          showToast("Previewing Lifetime Perpetual Campus License");
        } else {
          if (seg2) seg2.value = "AN26";
          state.leasePerpetual = false;
          state.leaseSeconds = 365 * 86400 - 42;
          showToast("Previewing Annual 365-Day Institutional License");
        }
        renderLeaseCountdown();
      });
    });

    const refSlider = document.getElementById("ctReferralRange");
    const refCount = document.getElementById("ctRefCountLabel");
    const refDays = document.getElementById("ctRefBonusDays");
    const refNgn = document.getElementById("ctRefNgnPayout");

    refSlider?.addEventListener("input", () => {
      const count = Number(refSlider.value) || 1;
      if (refCount) refCount.textContent = `${count} ${count === 1 ? "school" : "schools"}`;
      if (refDays) refDays.textContent = `+${count * 15} Bonus Days`;
      if (refNgn) refNgn.textContent = `NGN ${(count * 27000).toLocaleString("en-US")}`;
    });

    const schoolInput = document.getElementById("ctCalSchoolInput");
    const sessionInput = document.getElementById("ctCalSessionInput");
    const railSchool = document.getElementById("ctRailSchoolName");
    const railTerm = document.getElementById("ctRailSchoolTerm");

    schoolInput?.addEventListener("input", () => {
      if (railSchool && schoolInput.value.trim()) {
        railSchool.textContent = schoolInput.value.trim();
      }
    });
    sessionInput?.addEventListener("input", () => {
      if (railTerm && sessionInput.value.trim()) {
        railTerm.textContent = sessionInput.value.trim();
      }
    });
  }

  /* ------------------------------------------------------------------------
     6. STUDIO ENGINE CONTROLS, 60FPS WAVEFORM & DETERMINISTIC QR GENERATOR
     ------------------------------------------------------------------------ */
  function setStudioSubview(name) {
    state.subview = name;
    document.querySelectorAll("[data-subview-btn]").forEach((btn) => {
      const active = btn.getAttribute("data-subview-btn") === name;
      if (active) {
        btn.setAttribute("aria-current", "page");
      } else {
        btn.removeAttribute("aria-current");
      }
    });
    document.querySelectorAll("[data-subview]").forEach((pane) => {
      pane.classList.toggle("is-active", pane.getAttribute("data-subview") === name);
    });
    if (name === "overview") resizeWaveformCanvas();
  }

  function toggleEngineState() {
    state.engineRunning = !state.engineRunning;
    const band = document.getElementById("ctEngineBand");
    const badge = document.getElementById("ctEngineStateBadge");
    const badgeText = document.getElementById("ctEngineStateText");
    const btn = document.getElementById("ctEngineToggleBtn");
    const btnLabel = document.getElementById("ctEngineToggleLabel");
    const navTag = document.getElementById("ctNavEngineTag");
    const rpsReadout = document.getElementById("ctRpsReadout");
    const trayChip = document.getElementById("ctTrayStateChip");
    const port = telemetry.port || 5000;

    if (state.engineRunning) {
      if (band) band.dataset.engineState = "running";
      if (badge) badge.className = "ct-status-chip is-ok";
      if (badgeText) badgeText.textContent = `Broadcasting on Port ${port}`;
      if (btn) btn.className = "ct-btn ct-btn-danger";
      if (btnLabel) btnLabel.textContent = "Graceful Stop Server";
      if (navTag) navTag.textContent = "LIVE";
      if (rpsReadout) rpsReadout.textContent = "18 req/s • 0 drops";
      if (trayChip) {
        trayChip.className = "ct-status-chip is-ok";
        trayChip.textContent = "Running";
      }
      appendConsoleLog(
        "info",
        "WAITRESS",
        `Resumed 24-thread LAN listener on ${telemetry.primary_lan_url || "http://127.0.0.1:5000"}.`
      );
      showToast(`Exam server broadcasting on port ${port}`);
    } else {
      if (band) band.dataset.engineState = "stopped";
      if (badge) badge.className = "ct-status-chip";
      if (badgeText) badgeText.textContent = "Server Idle (Port Released)";
      if (btn) btn.className = "ct-btn ct-btn-primary";
      if (btnLabel) btnLabel.textContent = "Start Exam Server";
      if (navTag) navTag.textContent = "IDLE";
      if (rpsReadout) rpsReadout.textContent = "0 req/s • Standby";
      if (trayChip) {
        trayChip.className = "ct-status-chip";
        trayChip.textContent = "Idle";
      }
      appendConsoleLog(
        "warn",
        "WAITRESS",
        "Graceful drain completed; SQLite WAL checkpointed and LAN listener paused."
      );
      showToast("Exam server gracefully stopped after WAL checkpoint");
    }
  }

  // 60fps Oscilloscope Waveform on #ctWaveformCanvas
  const waveCanvas = document.getElementById("ctWaveformCanvas");
  const waveCtx = waveCanvas ? waveCanvas.getContext("2d") : null;
  const waveSamples = Array.from({ length: 56 }, (_, i) => 0.35 + 0.2 * Math.sin(i * 0.4));

  function resizeWaveformCanvas() {
    if (!waveCanvas || !waveCtx) return;
    const rect = waveCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    waveCanvas.width = Math.round(rect.width * dpr);
    waveCanvas.height = Math.round(rect.height * dpr);
    waveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  let lastWavePush = 0;
  function renderWaveformFrame(ts) {
    if (state.stage === "studio" && state.subview === "overview" && waveCanvas && waveCtx) {
      if (ts - lastWavePush > 110 && !reducedMotionQuery.matches) {
        lastWavePush = ts;
        waveSamples.shift();
        const nextVal = state.engineRunning
          ? 0.28 + 0.48 * Math.abs(Math.sin(ts * 0.0024)) + ((ts % 17) * 0.01)
          : 0.06;
        waveSamples.push(Math.min(0.92, nextVal));
      }

      const w = waveCanvas.clientWidth;
      const h = waveCanvas.clientHeight;
      if (w > 0 && h > 0) {
        waveCtx.clearRect(0, 0, w, h);
        const dark = isDarkActive();
        const strokeColor = state.engineRunning
          ? dark
            ? "#A8A6A1"
            : "#171614"
          : dark
            ? "#171614"
            : "#A8A6A1";

        waveCtx.beginPath();
        const step = w / (waveSamples.length - 1);
        waveSamples.forEach((v, idx) => {
          const x = idx * step;
          const y = h - v * (h - 6) - 3;
          if (idx === 0) waveCtx.moveTo(x, y);
          else waveCtx.lineTo(x, y);
        });
        waveCtx.strokeStyle = strokeColor;
        waveCtx.lineWidth = 1.75;
        waveCtx.stroke();

        // Subtle fill under line
        waveCtx.lineTo(w, h);
        waveCtx.lineTo(0, h);
        waveCtx.closePath();
        const fillGrad = waveCtx.createLinearGradient(0, 0, 0, h);
        fillGrad.addColorStop(
          0,
          state.engineRunning
            ? dark
              ? "rgba(23, 22, 20, 0.22)"
              : "rgba(23, 22, 20, 0.16)"
            : "rgba(23, 22, 20, 0.05)"
        );
        fillGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        waveCtx.fillStyle = fillGrad;
        waveCtx.fill();
      }
    }
    if (!reducedMotionQuery.matches) {
      window.requestAnimationFrame(renderWaveformFrame);
    }
  }

  // Crisp pure-SVG QR matrix seeded by primary LAN URL
  function renderQrSvg(urlText) {
    const host = document.getElementById("ctQrContainer");
    if (!host) return;
    const size = 25;
    const grid = Array.from({ length: size }, () => Array(size).fill(false));

    const drawFinder = (ox, oy) => {
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          const border = x === 0 || x === 6 || y === 0 || y === 6;
          const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
          grid[oy + y][ox + x] = border || core;
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(size - 7, 0);
    drawFinder(0, size - 7);

    // Alignment box
    for (let y = 16; y <= 20; y++) {
      for (let x = 16; x <= 20; x++) {
        const border = x === 16 || x === 20 || y === 16 || y === 20;
        const center = x === 18 && y === 18;
        grid[y][x] = border || center;
      }
    }

    // Deterministic FNV-1a hash stream from URL
    let hash = 2166136261;
    for (let i = 0; i < urlText.length; i++) {
      hash ^= urlText.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const inFinder =
          (x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8);
        const inAlign = x >= 16 && x <= 20 && y >= 16 && y <= 20;
        if (inFinder || inAlign) continue;
        if (x === 6 || y === 6) {
          grid[y][x] = (x + y) % 2 === 0;
          continue;
        }
        hash ^= (x * 37 + y * 91 + 13) & 0xff;
        hash = Math.imul(hash, 16777619);
        grid[y][x] = (hash >>> 3) % 11 < 5;
      }
    }

    const rects = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (grid[y][x]) {
          rects.push(`<rect x="${x}" y="${y}" width="1" height="1" rx="0.14"/>`);
        }
      }
    }

    host.innerHTML = `<svg viewBox="0 0 ${size} ${size}" fill="#171614" shape-rendering="crispEdges" role="img" aria-label="LAN QR code for ${urlText}">${rects.join("")}</svg>`;
  }

  /* ------------------------------------------------------------------------
     7. LEASE COUNTDOWN, TELEMETRY POLLING & DIALOG LIGHT-DISMISS FALLBACK
     ------------------------------------------------------------------------ */
  function renderLeaseCountdown() {
    const ticker = document.getElementById("ctLeaseTicker");
    if (!ticker || state.stage === "expired" || state.stage === "revoked") return;
    if (state.leasePerpetual) {
      ticker.textContent = "Lifetime Active";
      return;
    }
    const s = Math.max(0, state.leaseSeconds);
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    ticker.textContent = `${days}d ${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m`;
  }

  async function refreshLiveTelemetry() {
    if (document.hidden) return;
    try {
      const res = await fetch("/api/preview/telemetry", { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const fresh = await res.json();
      telemetry = fresh;
      const sEl = document.getElementById("ctMetricStudents");
      const eEl = document.getElementById("ctMetricExams");
      const qEl = document.getElementById("ctMetricQuestions");
      if (sEl && fresh.counts) sEl.textContent = String(fresh.counts.approved_students);
      if (eEl && fresh.counts) {
        eEl.textContent = String((fresh.counts.exams || 0) + (fresh.counts.ce_exams || 0));
      }
      if (qEl && typeof fresh.total_questions === "number") {
        qEl.textContent = String(fresh.total_questions);
      }
    } catch (_) {}
  }

  // Mandatory modern-web-guidance fallback when native `closedBy` is unsupported
  function setupLightDismissDialogs() {
    const supportsClosedBy =
      typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype;

    document.querySelectorAll("dialog.ct-dialog").forEach((dlg) => {
      if (!supportsClosedBy) {
        dlg.addEventListener("click", (e) => {
          if (e.target !== dlg) return;
          const rect = dlg.getBoundingClientRect();
          const clickedOutside =
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom;
          if (clickedOutside) dlg.close();
        });
      }
    });

    document.querySelectorAll("[data-close-dialog]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-close-dialog");
        const dlg = id ? document.getElementById(id) : null;
        if (dlg?.open) dlg.close();
      });
    });
  }

  /* ------------------------------------------------------------------------
     8. EVENT DELEGATION & INITIALIZATION
     ------------------------------------------------------------------------ */
  function init() {
    applyColorScheme(getCurrentSchemeChoice(), false);
    darkSchemeQuery.addEventListener("change", () => {
      if (getCurrentSchemeChoice() === "light dark") {
        resizeSplashCanvas();
      }
    });

    // Stage tabs & direct stage triggers
    document.querySelectorAll("[data-stage-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.getAttribute("data-stage-tab");
        if (target) switchStage(target);
      });
    });

    document.querySelectorAll("[data-goto-stage]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-goto-stage");
        if (target) switchStage(target);
      });
    });

    // Theme controls
    document.querySelectorAll("[data-theme-choice]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const choice = btn.getAttribute("data-theme-choice") || "light dark";
        applyColorScheme(choice, true);
      });
    });

    // Copy buttons
    document.querySelectorAll("[data-copy-text]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const txt = btn.getAttribute("data-copy-text");
        if (txt) copyToClipboard(txt);
      });
    });

    // Boot replay & slow motion
    document.getElementById("ctReplayBootBtn")?.addEventListener("click", () => {
      runBootSequence();
    });
    document.getElementById("ctSlowBootBtn")?.addEventListener("click", (ev) => {
      const btn = ev.currentTarget;
      state.bootSpeed = state.bootSpeed === 1 ? 2 : 1;
      btn.setAttribute("aria-pressed", state.bootSpeed === 2 ? "true" : "false");
      runBootSequence();
      showToast(state.bootSpeed === 2 ? "0.5× optical inspection motion active" : "1× normal boot speed");
    });

    // Window caption controls & System Tray
    const trayFlyout = document.getElementById("ctTrayFlyout");
    const trayBtn = document.getElementById("ctTrayToggleBtn");

    function setTrayOpen(open) {
      if (!trayFlyout || !trayBtn) return;
      trayFlyout.classList.toggle("is-open", open);
      trayBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    trayBtn?.addEventListener("click", () => {
      setTrayOpen(!trayFlyout?.classList.contains("is-open"));
    });

    document.getElementById("ctWinMinBtn")?.addEventListener("click", () => {
      appShell?.classList.add("is-minimized");
      setTrayOpen(true);
      showToast("Minimized to Windows System Tray — server stays online");
    });

    document.getElementById("ctWinCloseBtn")?.addEventListener("click", () => {
      appShell?.classList.add("is-minimized");
      setTrayOpen(true);
      showToast("Window hidden to System Tray to protect active exams");
    });

    const restoreWindow = () => {
      appShell?.classList.remove("is-minimized");
      setTrayOpen(false);
    };
    document.getElementById("ctTrayRestoreBtn")?.addEventListener("click", restoreWindow);
    document.getElementById("ctTaskbarAppBtn")?.addEventListener("click", restoreWindow);

    const toggleMaximize = () => {
      if (!desktopEnv) return;
      const next = desktopEnv.dataset.windowMode === "maximized" ? "windowed" : "maximized";
      desktopEnv.dataset.windowMode = next;
      window.setTimeout(() => {
        resizeSplashCanvas();
        resizeWaveformCanvas();
      }, 260);
    };
    document.getElementById("ctWinMaxBtn")?.addEventListener("click", toggleMaximize);
    document.getElementById("ctExitMaxBtn")?.addEventListener("click", toggleMaximize);

    // Onboarding navigation
    document.querySelectorAll("[data-chapter-btn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        setOnboardingChapter(btn.getAttribute("data-chapter-btn"));
      });
    });
    document.getElementById("ctOnboardPrevBtn")?.addEventListener("click", () => {
      setOnboardingChapter(state.chapter - 1);
    });
    document.getElementById("ctOnboardNextBtn")?.addEventListener("click", () => {
      if (state.chapter < 5) {
        setOnboardingChapter(state.chapter + 1);
      } else {
        switchStage("studio");
      }
    });

    bindPowerSimulator();
    bindMiniExamCalculator();
    bindFormulaAndFenceLab();
    bindLicenseAndCalibrationLab();

    // Studio subviews & operational actions
    document.querySelectorAll("[data-subview-btn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sub = btn.getAttribute("data-subview-btn");
        if (sub) setStudioSubview(sub);
      });
    });

    document.getElementById("ctEngineToggleBtn")?.addEventListener("click", toggleEngineState);

    document.getElementById("ctInstantBackupBtn")?.addEventListener("click", () => {
      const stamp = document.getElementById("ctLastBackupStamp");
      const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (stamp) stamp.textContent = `Just now • ${nowStr} (exam_hot_backup.db)`;
      appendConsoleLog("sec", "BACKUP", "Created online SQLite WAL hot snapshot (exam_hot_backup.db).");
      showToast("Atomic SQLite WAL hot backup completed");
    });

    document.querySelectorAll("[data-proctor-grant]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const student = btn.getAttribute("data-proctor-grant") || "Candidate";
        btn.textContent = "+5m Applied";
        btn.disabled = true;
        appendConsoleLog("sec", "PROCTOR", `Granted +5m emergency extension to ${student}.`);
        showToast(`Added +5 minutes to ${student}'s exam timer`);
      });
    });

    document.querySelectorAll("[data-log-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.getAttribute("data-log-filter") || "all";
        document.querySelectorAll("[data-log-filter]").forEach((b) => {
          b.setAttribute("aria-pressed", b === btn ? "true" : "false");
        });
        document.querySelectorAll("#ctConsoleLines .ct-log-row").forEach((row) => {
          const match = filter === "all" || row.dataset.logType === filter;
          row.style.display = match ? "grid" : "none";
        });
      });
    });

    // Lockout screen toggle: Lease Expired vs Windows Clock Rollback
    document.querySelectorAll("[data-lock-variant]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const variant = btn.getAttribute("data-lock-variant");
        document.querySelectorAll("[data-lock-variant]").forEach((b) => {
          b.setAttribute("aria-pressed", b === btn ? "true" : "false");
        });
        const badge = document.getElementById("ctLockModeBadge");
        const heading = document.getElementById("ctExpiredHeading");
        const desc = document.getElementById("ctExpiredDesc");
        if (variant === "clock") {
          if (badge) {
            badge.className = "ct-status-chip is-danger";
            badge.textContent = "CLOCK_TAMPER_LOCK (−4,820s Drift)";
          }
          if (heading) {
            heading.textContent =
              "Windows system clock rollback detected — startup blocked until time sync";
          }
          if (desc) {
            desc.textContent =
              "Observed system UTC is 80 minutes behind your DPAPI + HKCU monotonic anchor. Restore accurate Windows Internet Time or apply a signed cognitara.net sync token.";
          }
        } else {
          if (badge) {
            badge.className = "ct-status-chip is-warn";
            badge.textContent = "Cryptographic Lease Gate Triggered";
          }
          if (heading) {
            heading.textContent =
              "Subscription lease expired — new exam server startup is locked";
          }
          if (desc) {
            desc.textContent =
              "Your institutional license lease reached 00d 00h 00m. Renew online via Paystack on cognitara.net or import a signed .cgnlic offline renewal file.";
          }
        }
      });
    });

    // Dialogs: Ctrl+K Command Palette & Paystack Renewal Modal
    setupLightDismissDialogs();
    const cmdDialog = document.getElementById("ctCmdDialog");
    const cmdInput = document.getElementById("ctCmdkInput");
    const paystackDialog = document.getElementById("ctPaystackDialog");

    const openCmdPalette = () => {
      if (!cmdDialog || cmdDialog.open) return;
      cmdDialog.showModal();
      if (cmdInput) {
        cmdInput.value = "";
        cmdInput.dispatchEvent(new Event("input"));
        cmdInput.focus();
      }
    };

    document.getElementById("ctCmdkOpenBtn")?.addEventListener("click", openCmdPalette);
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openCmdPalette();
      }
    });

    cmdInput?.addEventListener("input", () => {
      const q = cmdInput.value.trim().toLowerCase();
      document.querySelectorAll("#ctCmdkList .ct-cmdk-item").forEach((item) => {
        const visible = !q || item.textContent.toLowerCase().includes(q);
        item.style.display = visible ? "flex" : "none";
      });
    });

    document.querySelectorAll("[data-cmd-action]").forEach((item) => {
      item.addEventListener("click", () => {
        const act = item.getAttribute("data-cmd-action") || "";
        if (cmdDialog?.open) cmdDialog.close();
        if (act.startsWith("goto:")) {
          switchStage(act.slice(5));
        } else if (act.startsWith("copy:")) {
          copyToClipboard(act.slice(5), "Copied LAN URL");
        } else if (act === "backup") {
          switchStage("studio");
          document.getElementById("ctInstantBackupBtn")?.click();
        } else if (act === "theme:toggle") {
          applyColorScheme(isDarkActive() ? "light" : "dark", true);
        } else if (act.startsWith("portal:")) {
          window.open(act.slice(7), "_blank", "noopener");
        }
      });
    });

    const openPaystack = () => {
      if (paystackDialog && !paystackDialog.open) paystackDialog.showModal();
    };
    document.getElementById("ctOpenPaystackModalBtn")?.addEventListener("click", openPaystack);
    document.getElementById("ctExpiredPaystackBtn")?.addEventListener("click", openPaystack);

    document.getElementById("ctSimPaystackSuccessBtn")?.addEventListener("click", () => {
      if (paystackDialog?.open) paystackDialog.close();
      state.leasePerpetual = false;
      state.leaseSeconds = 365 * 86400;
      switchStage("studio");
      setStudioSubview("license");
      showToast("Paystack webhook verified — 365-day Ed25519 license activated");
    });

    // Canvases, QR, Lease Ticker & Telemetry Poll
    renderQrSvg(telemetry.primary_lan_url || "http://127.0.0.1:5000");
    resizeSplashCanvas();
    resizeWaveformCanvas();
    window.addEventListener("resize", () => {
      resizeSplashCanvas();
      resizeWaveformCanvas();
    });

    runBootSequence();
    window.requestAnimationFrame(renderSplashFrame);
    window.requestAnimationFrame(renderWaveformFrame);

    window.setInterval(() => {
      if (!state.leasePerpetual && state.leaseSeconds > 0) {
        state.leaseSeconds -= 1;
        if (state.leaseSeconds % 60 === 0) renderLeaseCountdown();
      }
    }, 1000);
    window.setInterval(refreshLiveTelemetry, 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
