/**
 * CogniTara Studio — Electron Main Process Entrypoint
 *
 * Security & architecture invariants:
 * - Single-instance lock (`app.requestSingleInstanceLock()`).
 * - Frameless window with Windows 11 Mica backdrop (`backgroundMaterial: "mica"`).
 * - Hardened BrowserWindow (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
 * - Supervises packaged `cognitara-engine.exe` with `windowsHide: true` (zero console windows).
 * - Layer 5 dual-process license enforcement: independently verifies Ed25519 `.cgnlic` envelopes
 *   and gates LAN exam server startup/watchdog against the 5-layer Python vault.
 */

import fs from "fs";
import path from "path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { CloudAuthManager } from "./cloud-auth";
import { EngineManager } from "./engine";
import {
  isLockStateBlockingStart,
  mapLockStateToScreenKind,
  verifyEd25519LeaseInElectron,
} from "./license-bridge";
import { listNetworkAdapters, loadSettings, saveSettings } from "./settings";
import { StudioTray } from "./tray";
import { LicenseStatus, ServerLifecycleState, StudioSettings, UpdateStatusState } from "./types";
import { StudioUpdater } from "./updater";

let mainWindow: BrowserWindow | null = null;
let tray: StudioTray | null = null;
let engine: EngineManager | null = null;
let updater: StudioUpdater | null = null;
let cloudAuth: CloudAuthManager | null = null;
let settings: StudioSettings;
let isQuitting = false;
let currentWindowMode: "boot" | "studio" = "boot";
let licenseWatchdogTimer: NodeJS.Timeout | null = null;
let autoBackupTimer: NodeJS.Timeout | null = null;
let lastNotifiedLockState: string | null = null;

// Enforce single instance across Windows
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function getAssetPath(...segments: string[]): string {
  const base = app.isPackaged
    ? path.join(app.getAppPath(), "assets")
    : path.resolve(__dirname, "..", "..", "assets");
  return path.join(base, ...segments);
}

function getRendererEntry(): string {
  return path.resolve(__dirname, "..", "renderer", "index.html");
}

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

function broadcastServerState(state: ServerLifecycleState): void {
  tray?.refresh();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("server:stateChanged", state);
  }
}

function notifyLicenseLock(lic: LicenseStatus): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("license:locked", lic);
  }
}

function applyStartupLoginItem(): void {
  if (process.platform === "win32" && app.isPackaged) {
    try {
      app.setLoginItemSettings({
        openAtLogin: Boolean(settings.startWithWindows),
        path: process.execPath,
      });
    } catch {
      // Non-fatal on restricted Windows policies
    }
  }
}

function configureAutoBackupTimer(): void {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
  const mode = settings.backupSchedule;
  if (mode === "off") return;

  const intervalMs =
    mode === "30m"
      ? 30 * 60 * 1000
      : mode === "60m"
      ? 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

  autoBackupTimer = setInterval(async () => {
    if (!engine) return;
    if (mode === "30m") {
      // Only run 30-min backups while server is running or exams are active
      if (engine.getLanState() !== "running") return;
    }
    try {
      await engine.callInternal("POST", "/hot-backup", { type: "auto" });
    } catch {
      // Keep running quietly
    }
  }, intervalMs);
}

function startLicenseWatchdog(): void {
  if (licenseWatchdogTimer) {
    clearInterval(licenseWatchdogTimer);
  }
  licenseWatchdogTimer = setInterval(async () => {
    if (!engine) return;
    try {
      const lic = await engine.getLicenseStatus();
      if (!lic) return;

      const lockKind = mapLockStateToScreenKind(lic.lock_state);
      if (lockKind) {
        // If actively draining, keep LAN server alive until drain completes so students can submit
        if (lic.lock_state !== "DRAINING" && engine.getLanState() === "running") {
          await engine.stopLanServer();
        }
        if (lastNotifiedLockState !== lic.lock_state) {
          lastNotifiedLockState = lic.lock_state;
          notifyLicenseLock(lic);
        }
      } else {
        lastNotifiedLockState = null;
      }
    } catch {
      // Retry next cycle
    }
  }, 30_000);
}

async function requestSafeQuit(): Promise<void> {
  if (isQuitting) return;
  if (engine && engine.getLanState() === "running") {
    try {
      const tel = await engine.callInternal<{ ok: boolean; live?: { total_writing?: number } }>(
        "GET",
        "/telemetry"
      );
      const writing = tel.data?.live?.total_writing || 0;
      if (writing > 0 && mainWindow) {
        const res = await dialog.showMessageBox(mainWindow, {
          type: "warning",
          buttons: ["Keep running", "Stop server and quit"],
          defaultId: 0,
          cancelId: 0,
          title: "Students are currently writing",
          message: `${writing} student${writing === 1 ? " is" : "s are"} currently writing an exam.`,
          detail:
            "Stopping CogniTara will safely save every submitted answer so students can resume when you start again.",
        });
        if (res.response !== 1) return;
      }
    } catch {
      // Proceed to clean shutdown
    }
  }

  isQuitting = true;
  if (licenseWatchdogTimer) clearInterval(licenseWatchdogTimer);
  if (autoBackupTimer) clearInterval(autoBackupTimer);
  if (engine) {
    await engine.shutdownAll();
  }
  tray?.destroy();
  app.quit();
}

function createWindow(): void {
  const iconFile =
    process.platform === "win32"
      ? getAssetPath("cognitara-favicon.ico")
      : getAssetPath("cognitara-app-icon.png");

  const winOptions: Electron.BrowserWindowConstructorOptions = {
    width: 640,
    height: 400,
    minWidth: 640,
    minHeight: 400,
    frame: false,
    resizable: false,
    center: true,
    show: false,
    backgroundColor: settings.theme === "light" ? "#F6F8FC" : "#0A0E1A",
    icon: fs.existsSync(iconFile) ? iconFile : undefined,
    webPreferences: {
      preload: path.resolve(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      webSecurity: true,
      spellcheck: false,
    },
  };

  if (process.platform === "win32") {
    winOptions.backgroundMaterial = "mica";
  }

  mainWindow = new BrowserWindow(winOptions);

  // Enforce strict navigation & popup boundaries
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    const allowedPrefix = "file://";
    if (!targetUrl.startsWith(allowedPrefix)) {
      event.preventDefault();
      if (isSafeExternalUrl(targetUrl)) {
        shell.openExternal(targetUrl).catch(() => {});
      }
    }
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.loadFile(getRendererEntry()).catch((err) => {
    console.error("Failed to load CogniTara Studio renderer:", err);
  });
}

function setWindowMode(mode: "boot" | "studio"): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (currentWindowMode === mode) return;
  currentWindowMode = mode;

  if (mode === "boot") {
    mainWindow.setResizable(false);
    mainWindow.setMinimumSize(640, 400);
    mainWindow.setSize(640, 400, true);
    mainWindow.center();
  } else {
    mainWindow.setMinimumSize(1024, 680);
    mainWindow.setResizable(true);
    mainWindow.setSize(1280, 800, true);
    mainWindow.center();
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle("studio:bootstrap", async () => {
    const engineReady = await engine!.ensureControlEngine();
    const [setupRes, telRes, bkRes] = await Promise.all([
      engine!.callInternal("GET", "/setup/status"),
      engine!.callInternal("GET", "/telemetry"),
      engine!.callInternal("GET", "/backups"),
    ]);

    const adapters = listNetworkAdapters();
    if (!adapters.some((a) => a.ip === settings.selectedLanIp) && adapters.length > 0) {
      settings.selectedLanIp = adapters.find((a) => a.recommended)?.ip || adapters[0].ip;
      saveSettings(settings);
    }

    const license: LicenseStatus | null = setupRes.data?.license || telRes.data?.license || null;
    const onboardingComplete = Boolean(
      settings.onboardingComplete || setupRes.data?.onboarding_complete
    );

    // Optional auto-start LAN server on boot if configured & licensed
    if (
      onboardingComplete &&
      settings.autoStartServer &&
      license &&
      !isLockStateBlockingStart(license) &&
      engine!.getLanState() === "stopped"
    ) {
      engine!.startLanServer().catch(() => {});
    }

    return {
      ok: engineReady,
      version: app.getVersion(),
      settings,
      adapters,
      serverState: engine!.getLanState(),
      serverStartedAt: engine!.getLanStartedAt(),
      onboardingComplete,
      school: setupRes.data?.school || {
        school_name: telRes.data?.telemetry?.school_name || "CogniTara School",
        school_motto: "Knowledge, Discipline, Excellence",
        academic_session: telRes.data?.telemetry?.academic_session || "2026/2027",
        current_term: telRes.data?.telemetry?.current_term || "First Term",
      },
      network: {
        hostname: telRes.data?.telemetry?.hostname || "cognitara",
        port: settings.port,
        selectedLanIp: settings.selectedLanIp,
      },
      telemetry: telRes.data?.telemetry || {},
      live: telRes.data?.live || { active_exams: [], attention: [], total_writing: 0 },
      license,
      backups: bkRes.data?.backups || [],
      backupDir: bkRes.data?.backup_dir || settings.backupDir,
      cloudAccount: cloudAuth ? cloudAuth.getSession() : null,
      updateState: updater ? updater.getState() : null,
    };
  });

  ipcMain.handle("studio:telemetry", async () => {
    const res = await engine!.callInternal("GET", "/telemetry");
    return {
      ok: res.status === 200 && Boolean(res.data?.ok),
      serverState: engine!.getLanState(),
      serverStartedAt: engine!.getLanStartedAt(),
      telemetry: res.data?.telemetry || {},
      live: res.data?.live || { active_exams: [], attention: [], total_writing: 0 },
      license: res.data?.license || null,
      backupDir: res.data?.backup_dir || settings.backupDir,
    };
  });

  ipcMain.handle("license:status", async () => {
    const res = await engine!.callInternal("GET", "/license-status");
    return res.data;
  });

  ipcMain.handle("license:activateKey", async (_evt, licenseKey: string) => {
    const res = await engine!.callInternal("POST", "/license/activate", {
      license_key: String(licenseKey || "").trim(),
    });
    return res.data;
  });

  ipcMain.handle("license:importFile", async () => {
    if (!mainWindow) return { ok: false, error: "no_window" };
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: "Select CogniTara Licence File",
      filters: [
        { name: "CogniTara Licence Files", extensions: ["cgnlic", "json"] },
        { name: "All Files", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    try {
      const raw = fs.readFileSync(picked.filePaths[0], "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      // Layer 5 independent Electron Ed25519 signature verification before passing to engine
      const electronCheck = verifyEd25519LeaseInElectron(parsed);
      if (!electronCheck.ok) {
        return {
          ok: false,
          error: electronCheck.reason,
          message: "Licence signature verification failed in CogniTara Studio.",
        };
      }

      const res = await engine!.callInternal("POST", "/license/activate", { lease: parsed });
      return res.data;
    } catch (err) {
      return {
        ok: false,
        error: "invalid_licence_file",
        message: err instanceof Error ? err.message : "Could not read licence file.",
      };
    }
  });

  ipcMain.handle("license:checkIn", async () => {
    const res = await engine!.callInternal("POST", "/license/checkin", {});
    return res.data;
  });

  ipcMain.handle("license:recheck", async () => {
    const res = await engine!.callInternal("POST", "/license/recheck", {});
    return res.data;
  });

  ipcMain.handle("license:startTrial", async (_evt, schoolName?: string) => {
    const res = await engine!.callInternal("POST", "/license/start-trial", {
      school_name: schoolName || undefined,
    });
    return res.data;
  });

  ipcMain.handle("server:start", async () => {
    return engine!.startLanServer();
  });

  ipcMain.handle("server:stop", async () => {
    return engine!.stopLanServer();
  });

  ipcMain.handle(
    "live:extend",
    async (_evt, payload: { exam_id: number; exam_type: string; minutes: number }) => {
      const res = await engine!.callInternal("POST", "/live-exams/extend", payload);
      return res.data;
    }
  );

  ipcMain.handle("live:pauseAll", async () => {
    const res = await engine!.callInternal("POST", "/live-exams/pause-all", {});
    return res.data;
  });

  ipcMain.handle(
    "live:resume",
    async (_evt, payload: { attempt_id: number; exam_type: string }) => {
      const res = await engine!.callInternal("POST", "/live-exams/resume", payload);
      return res.data;
    }
  );

  ipcMain.handle("backups:list", async () => {
    const res = await engine!.callInternal("GET", "/backups");
    return res.data;
  });

  ipcMain.handle("backups:create", async (_evt, kind: string) => {
    const res = await engine!.callInternal("POST", "/hot-backup", { type: kind || "manual" });
    return res.data;
  });

  ipcMain.handle("backups:restore", async (_evt, filename: string) => {
    const wasRunning = engine!.getLanState() === "running";
    if (wasRunning) {
      await engine!.stopLanServer();
    }
    const res = await engine!.callInternal("POST", "/backups/restore", { filename });
    if (res.data?.ok && wasRunning) {
      await engine!.startLanServer();
    }
    return res.data;
  });

  ipcMain.handle("backups:chooseDir", async () => {
    if (!mainWindow) return { ok: false, canceled: true };
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: "Choose Backup Folder",
      defaultPath: settings.backupDir,
      properties: ["openDirectory", "createDirectory"],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    settings = saveSettings({ ...settings, backupDir: picked.filePaths[0] });
    engine!.updateSettings(settings);
    return { ok: true, backupDir: settings.backupDir };
  });

  ipcMain.handle("backups:exportAndOpen", async () => {
    const res = await engine!.callInternal("POST", "/hot-backup", { type: "manual" });
    const targetDir = res.data?.backup?.path ? path.dirname(res.data.backup.path) : settings.backupDir;
    if (targetDir && fs.existsSync(targetDir)) {
      shell.openPath(targetDir).catch(() => {});
    }
    return res.data;
  });

  ipcMain.handle("setup:school", async (_evt, payload) => {
    const res = await engine!.callInternal("POST", "/setup/school", payload);
    return res.data;
  });

  ipcMain.handle("setup:superadmin", async (_evt, payload) => {
    const res = await engine!.callInternal("POST", "/setup/superadmin", payload);
    if (res.data?.ok) {
      settings = saveSettings({
        ...settings,
        adminFullName: String(payload?.full_name || settings.adminFullName || ""),
        adminUsername: String(payload?.username || settings.adminUsername || "superadmin"),
      });
    }
    return res.data;
  });

  ipcMain.handle("setup:complete", async (_evt, payload?: { selectedLanIp?: string }) => {
    settings = saveSettings({
      ...settings,
      onboardingComplete: true,
      selectedLanIp: payload?.selectedLanIp || settings.selectedLanIp,
    });
    engine!.updateSettings(settings);
    return { ok: true, settings };
  });

  ipcMain.handle("settings:get", async () => {
    return settings;
  });

  ipcMain.handle("settings:update", async (_evt, partial: Partial<StudioSettings>) => {
    const nextPort =
      typeof partial.port === "number" && partial.port >= 1024 && partial.port <= 65535
        ? Math.floor(partial.port)
        : settings.port;

    settings = saveSettings({
      ...settings,
      ...partial,
      port: nextPort,
    });
    engine!.updateSettings(settings);
    applyStartupLoginItem();
    configureAutoBackupTimer();
    tray?.refresh();

    if (mainWindow && !mainWindow.isDestroyed() && partial.theme) {
      mainWindow.setBackgroundColor(partial.theme === "light" ? "#F6F8FC" : "#0A0E1A");
    }
    return { ok: true, settings };
  });

  ipcMain.handle("window:action", (_evt, action: "minimize" | "maximize" | "close") => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (action === "minimize") {
      mainWindow.hide();
    } else if (action === "maximize") {
      if (currentWindowMode === "boot") return;
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    } else if (action === "close") {
      mainWindow.hide();
    }
  });

  ipcMain.handle("window:setMode", (_evt, mode: "boot" | "studio") => {
    setWindowMode(mode);
  });

  ipcMain.handle("shell:openExternal", (_evt, url: string) => {
    if (isSafeExternalUrl(url)) {
      return shell.openExternal(url);
    }
    return Promise.resolve();
  });

  ipcMain.handle("shell:dateSettings", () => {
    if (process.platform === "win32") {
      return shell.openExternal("ms-settings:dateandtime");
    }
    return Promise.resolve();
  });

  // ---- Direct In-App Auto-Updater (electron-updater) ----
  ipcMain.handle("updater:getState", () => {
    return updater ? updater.getState() : null;
  });

  ipcMain.handle("updater:check", async () => {
    return updater ? updater.checkForUpdates() : null;
  });

  ipcMain.handle("updater:download", async () => {
    return updater ? updater.downloadUpdate() : { ok: false };
  });

  ipcMain.handle("updater:install", async () => {
    return updater ? updater.installUpdateNow() : { ok: false };
  });

  // ---- CogniTara Cloud Account (Neon Postgres + Vercel + Offline Cache) ----
  ipcMain.handle("cloud:getSession", () => {
    return cloudAuth ? cloudAuth.getSession() : null;
  });

  ipcMain.handle("cloud:signUp", async (_evt, payload) => {
    if (!cloudAuth) return { ok: false, error: "cloud_unavailable" };
    const lic = await engine?.getLicenseStatus().catch(() => null);
    const res = await cloudAuth.signUp({
      ...payload,
      display_hwid: lic?.display_hwid || undefined,
    });
    if (res.ok && res.session && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cloud:sessionChanged", res.session);
    }
    return res;
  });

  ipcMain.handle("cloud:signIn", async (_evt, payload) => {
    if (!cloudAuth) return { ok: false, error: "cloud_unavailable" };
    const lic = await engine?.getLicenseStatus().catch(() => null);
    const res = await cloudAuth.signIn({
      ...payload,
      display_hwid: lic?.display_hwid || undefined,
    });
    if (res.ok && res.session && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cloud:sessionChanged", res.session);
    }
    return res;
  });

  ipcMain.handle("cloud:verifyOtp", async (_evt, payload) => {
    if (!cloudAuth) return { ok: false, error: "cloud_unavailable" };
    const lic = await engine?.getLicenseStatus().catch(() => null);
    const res = await cloudAuth.verifyOtp({
      ...payload,
      display_hwid: lic?.display_hwid || undefined,
    });
    if (res.ok && res.session && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cloud:sessionChanged", res.session);
    }
    return res;
  });

  ipcMain.handle("cloud:resendOtp", async (_evt, payload) => {
    if (!cloudAuth) return { ok: false, error: "cloud_unavailable" };
    return cloudAuth.resendOtp(payload);
  });

  ipcMain.handle("cloud:sync", async () => {
    if (!cloudAuth) return { ok: false, error: "cloud_unavailable" };
    const res = await cloudAuth.syncProfile();
    if (res.session && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cloud:sessionChanged", res.session);
    }
    return res;
  });

  ipcMain.handle("cloud:signOut", async () => {
    if (!cloudAuth) return { ok: false };
    const res = await cloudAuth.signOut();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cloud:sessionChanged", res.session);
    }
    return res;
  });

  // ---- Paystack Billing, Dynamic Plans, Discount & Redeem Codes ----
  async function activateSignedLeaseLocally(
    signedLease: Record<string, unknown> | null | undefined,
    fallbackLicenseKey?: string | null
  ): Promise<any> {
    if (signedLease && typeof signedLease === "object" && signedLease.payload && signedLease.ed25519_sig) {
      const electronCheck = verifyEd25519LeaseInElectron(signedLease);
      if (electronCheck.ok) {
        const actRes = await engine!.callInternal("POST", "/license/activate", { lease: signedLease });
        if (actRes.data?.ok) return actRes.data;
      }
    }
    if (fallbackLicenseKey) {
      const actRes = await engine!.callInternal("POST", "/license/activate", {
        license_key: fallbackLicenseKey,
        cloud_url: cloudAuth?.getCloudUrl(),
      });
      return actRes.data;
    }
    return { ok: false, error: "no_activatable_lease" };
  }

  ipcMain.handle("billing:getPlans", async () => {
    if (!cloudAuth) return { ok: false, message: "Cloud service unavailable." };
    return cloudAuth.fetchPlans();
  });

  ipcMain.handle("billing:validatePromo", async (_evt, payload) => {
    if (!cloudAuth) return { ok: false, message: "Cloud service unavailable." };
    return cloudAuth.validatePromo(payload);
  });

  ipcMain.handle("billing:redeemCode", async (_evt, payload) => {
    if (!cloudAuth) return { ok: false, message: "Cloud service unavailable." };
    const lic = await engine?.getLicenseStatus().catch(() => null);
    const res = await cloudAuth.redeemCode({
      ...payload,
      hwid_hash: lic?.hwid_hash || undefined,
      display_hwid: lic?.display_hwid || undefined,
      hw_component_hashes: (lic as any)?.component_hashes || undefined,
    });
    if (!res.ok) return res;

    const localAct = await activateSignedLeaseLocally(res.signed_lease, res.license?.license_key);
    await cloudAuth.syncProfile().catch(() => {});
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cloud:sessionChanged", cloudAuth.getSession());
      mainWindow.webContents.send("billing:completed", {
        ok: true,
        source: "redeem",
        license: localAct?.status || res.license,
        message: res.message || "Voucher redeemed and licence activated!",
      });
    }
    return {
      ok: true,
      message: res.message || "Code redeemed and licence activated on this PC!",
      license: localAct?.status || res.license,
      license_key: res.license?.license_key,
    };
  });

  ipcMain.handle("billing:verifyPaystack", async (_evt, reference: string) => {
    if (!cloudAuth) return { ok: false, message: "Cloud service unavailable." };
    const lic = await engine?.getLicenseStatus().catch(() => null);
    const res = await cloudAuth.verifyPaystack({
      reference: String(reference || "").trim(),
      hwid_hash: lic?.hwid_hash || undefined,
      display_hwid: lic?.display_hwid || undefined,
      hw_component_hashes: (lic as any)?.component_hashes || undefined,
    });
    if (!res.ok) return res;

    const localAct = await activateSignedLeaseLocally(res.signed_lease, res.license?.license_key);
    await cloudAuth.syncProfile().catch(() => {});
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cloud:sessionChanged", cloudAuth.getSession());
      mainWindow.webContents.send("billing:completed", {
        ok: true,
        source: "paystack",
        license: localAct?.status || res.license,
        message: res.message || "Paystack payment verified and licence activated!",
      });
    }
    return {
      ok: true,
      message: res.message || "Payment verified and licence activated!",
      license: localAct?.status || res.license,
      license_key: res.license?.license_key,
    };
  });

  ipcMain.handle("billing:startPaystack", async (_evt, payload) => {
    if (!cloudAuth) return { ok: false, message: "Cloud service unavailable." };
    const lic = await engine?.getLicenseStatus().catch(() => null);
    const initRes = await cloudAuth.initializePaystack({
      ...payload,
      hwid_hash: lic?.hwid_hash || undefined,
      display_hwid: lic?.display_hwid || undefined,
    });
    if (!initRes.ok || !initRes.authorization_url) {
      return initRes;
    }

    const reference = String(initRes.reference || "");
    const checkoutUrl = String(initRes.authorization_url || "");
    if (!isSafeExternalUrl(checkoutUrl)) {
      return { ok: false, message: "Unsafe checkout URL returned by gateway." };
    }

    // Open a clean, sandboxed Paystack Checkout Window right inside CogniTara Studio
    const payWin = new BrowserWindow({
      parent: mainWindow || undefined,
      modal: false,
      width: 520,
      height: 700,
      title: "CogniTara — Paystack Secure Checkout",
      autoHideMenuBar: true,
      backgroundColor: "#111111",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    let verifiedOnce = false;
    const tryAutoVerify = async () => {
      if (verifiedOnce || !reference || !cloudAuth) return;
      verifiedOnce = true;
      const curLic = await engine?.getLicenseStatus().catch(() => null);
      const vRes = await cloudAuth.verifyPaystack({
        reference,
        hwid_hash: curLic?.hwid_hash || undefined,
        display_hwid: curLic?.display_hwid || undefined,
        hw_component_hashes: (curLic as any)?.component_hashes || undefined,
      });
      if (vRes.ok) {
        const localAct = await activateSignedLeaseLocally(vRes.signed_lease, vRes.license?.license_key);
        await cloudAuth.syncProfile().catch(() => {});
        if (!payWin.isDestroyed()) payWin.close();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("cloud:sessionChanged", cloudAuth.getSession());
          mainWindow.webContents.send("billing:completed", {
            ok: true,
            source: "paystack",
            reference,
            license: localAct?.status || vRes.license,
            license_key: vRes.license?.license_key,
            message: "Paystack payment confirmed! Licence activated on this PC.",
          });
        }
      } else {
        verifiedOnce = false;
      }
    };

    const handlePotentialCallback = (url: string) => {
      if (url.includes("paystack_ref=") || url.includes("/dashboard")) {
        void tryAutoVerify();
      }
    };

    payWin.webContents.on("will-redirect", (_e, url) => handlePotentialCallback(url));
    payWin.webContents.on("did-navigate", (_e, url) => handlePotentialCallback(url));
    payWin.on("closed", () => {
      // Also run one quick verify check when user closes the window after completing payment
      void tryAutoVerify();
    });

    payWin.loadURL(checkoutUrl).catch(() => {
      shell.openExternal(checkoutUrl).catch(() => {});
    });

    return {
      ok: true,
      reference,
      authorization_url: checkoutUrl,
      amount_minor: initRes.amount_minor,
      currency: initRes.currency,
    };
  });
}

function broadcastUpdateState(nextState: UpdateStatusState): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:statusChanged", nextState);
  }
}

async function prepareSafeRestartForUpdate(): Promise<boolean> {
  if (engine && engine.getLanState() === "running") {
    try {
      const tel = await engine.callInternal<{ ok: boolean; live?: { total_writing?: number } }>(
        "GET",
        "/telemetry"
      );
      const writing = tel.data?.live?.total_writing || 0;
      if (writing > 0 && mainWindow) {
        const res = await dialog.showMessageBox(mainWindow, {
          type: "warning",
          buttons: ["Wait until exams finish", "Stop server and install update"],
          defaultId: 0,
          cancelId: 0,
          title: "Students are currently writing",
          message: `${writing} student${writing === 1 ? " is" : "s are"} currently writing an exam.`,
          detail:
            "Installing the CogniTara Studio update will safely stop the exam server first (every answer is saved) and restart CogniTara Studio.",
        });
        if (res.response !== 1) return false;
      }
    } catch {
      // Proceed cleanly
    }
  }

  isQuitting = true;
  if (licenseWatchdogTimer) clearInterval(licenseWatchdogTimer);
  if (autoBackupTimer) clearInterval(autoBackupTimer);
  updater?.dispose();
  if (engine) {
    await engine.shutdownAll();
  }
  tray?.destroy();
  return true;
}

app.whenReady().then(async () => {
  settings = loadSettings();
  applyStartupLoginItem();

  cloudAuth = new CloudAuthManager();
  engine = new EngineManager(settings, (nextState) => {
    broadcastServerState(nextState);
  });
  updater = new StudioUpdater({
    onStatusChanged: (st) => broadcastUpdateState(st),
    onBeforeQuitAndInstall: () => prepareSafeRestartForUpdate(),
  });

  registerIpcHandlers();
  createWindow();

  tray = new StudioTray({
    getWindow: () => mainWindow,
    getServerState: () => engine?.getLanState() || "stopped",
    getPort: () => settings.port,
    onToggleServer: () => {
      if (!engine) return;
      if (engine.getLanState() === "running") {
        engine.stopLanServer().catch(() => {});
      } else {
        engine.startLanServer().catch(() => {});
      }
    },
    onRequestQuit: () => {
      requestSafeQuit().catch(() => {});
    },
  });
  tray.init();

  updater.init();
  configureAutoBackupTimer();
  startLicenseWatchdog();

  // Opportunistic silent cloud sync in background (never blocks offline launch)
  if (cloudAuth.getSession().signedIn) {
    cloudAuth
      .syncProfile()
      .then((res) => {
        if (res.session && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("cloud:sessionChanged", res.session);
        }
      })
      .catch(() => {});
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  updater?.dispose();
});

app.on("window-all-closed", () => {
  // Keep alive in Windows System Tray unless explicitly quitting
  if (isQuitting) {
    app.quit();
  }
});
