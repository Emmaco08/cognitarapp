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
import { pathToFileURL } from "url";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
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

let closeDialogOpen = false;

async function handleWindowCloseRequest(): Promise<void> {
  if (isQuitting || closeDialogOpen) return;

  // When the LAN exam server is NOT running, close cleanly and exit the app
  if (!engine || engine.getLanState() !== "running") {
    await requestSafeQuit();
    return;
  }

  // When the LAN exam server IS actively serving exams, let the admin decide cleanly
  if (!mainWindow || mainWindow.isDestroyed()) {
    await requestSafeQuit();
    return;
  }

  closeDialogOpen = true;
  try {
    let writing = 0;
    try {
      const tel = await engine.callInternal<{ ok: boolean; live?: { total_writing?: number } }>(
        "GET",
        "/telemetry"
      );
      writing = tel.data?.live?.total_writing || 0;
    } catch {
      writing = 0;
    }

    const detail =
      writing > 0
        ? `${writing} student${writing === 1 ? " is" : "s are"} currently writing an exam. Keeping CogniTara in the system tray leaves the exam server online without interrupting students.`
        : "The school exam server is currently running. Keep it running quietly in the Windows system tray, or stop the server and quit completely.";

    const res = await dialog.showMessageBox(mainWindow, {
      type: "question",
      buttons: ["Keep running in tray", "Stop server and quit", "Cancel"],
      defaultId: 0,
      cancelId: 2,
      title: "Exam server is running",
      message: writing > 0 ? `${writing} student${writing === 1 ? " is" : "s are"} writing right now` : "Close CogniTara Studio?",
      detail,
    });

    if (res.response === 0) {
      mainWindow.hide();
    } else if (res.response === 1) {
      await requestSafeQuit();
    }
  } finally {
    closeDialogOpen = false;
  }
}

function broadcastMaximizedState(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:maximizedChanged", mainWindow.isMaximized());
  }
}

function createWindow(): void {
  const iconFile =
    process.platform === "win32"
      ? getAssetPath("cognitara-favicon.ico")
      : getAssetPath("cognitara-app-icon.png");

  // Always construct frameless Windows 11 windows with native resizable/minimizable/maximizable flags
  // so Windows DWM assigns proper WS_THICKFRAME, WS_MINIMIZEBOX, and WS_MAXIMIZEBOX styles.
  const winOptions: Electron.BrowserWindowConstructorOptions = {
    width: 640,
    height: 400,
    minWidth: 640,
    minHeight: 400,
    frame: false,
    resizable: true,
    minimizable: true,
    maximizable: true,
    closable: true,
    center: true,
    show: false,
    backgroundColor: settings.theme === "dark" ? "#111112" : "#EFEFEF",
    icon: fs.existsSync(iconFile) ? iconFile : undefined,
    webPreferences: {
      preload: path.resolve(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      webSecurity: true,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  };

  if (process.platform === "win32") {
    winOptions.backgroundMaterial = "mica";
  }

  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
  }

  mainWindow = new BrowserWindow(winOptions);

  // Anti-tamper & reverse-engineering hardening in packaged builds
  if (app.isPackaged) {
    mainWindow.webContents.on("devtools-opened", () => {
      mainWindow?.webContents.closeDevTools();
    });
    mainWindow.webContents.on("before-input-event", (event, input) => {
      const k = String(input.key || "").toLowerCase();
      const ctrlOrMeta = Boolean(input.control || input.meta);
      if (
        k === "f12" ||
        k === "f5" ||
        (ctrlOrMeta && input.shift && (k === "i" || k === "j" || k === "c")) ||
        (ctrlOrMeta && (k === "u" || k === "r"))
      ) {
        event.preventDefault();
      }
    });
    mainWindow.webContents.on("context-menu", (event) => {
      event.preventDefault();
    });
  }

  // Enforce strict navigation & popup boundaries: route safe external links to OS browser.
  const expectedRendererHref = pathToFileURL(getRendererEntry()).href.toLowerCase();
  mainWindow.webContents.setWindowOpenHandler((details) => {
    const targetUrl = String(details.url || "");
    if (isSafeExternalUrl(targetUrl)) {
      shell.openExternal(targetUrl).catch(() => {});
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    const cleanTarget = String(targetUrl || "").split("#")[0].split("?")[0].toLowerCase();
    if (cleanTarget !== expectedRendererHref) {
      event.preventDefault();
      if (isSafeExternalUrl(targetUrl)) {
        shell.openExternal(targetUrl).catch(() => {});
      }
    }
  });

  mainWindow.on("maximize", broadcastMaximizedState);
  mainWindow.on("unmaximize", broadcastMaximizedState);
  mainWindow.on("restore", broadcastMaximizedState);

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      void handleWindowCloseRequest();
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    broadcastMaximizedState();
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
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    mainWindow.setMinimumSize(640, 400);
    mainWindow.setSize(640, 400, false);
    mainWindow.center();
  } else {
    mainWindow.setResizable(true);
    mainWindow.setMinimizable(true);
    mainWindow.setMaximizable(true);
    mainWindow.setMinimumSize(1024, 680);
    if (!mainWindow.isMaximized()) {
      mainWindow.setSize(1280, 800, false);
      mainWindow.center();
    }
    broadcastMaximizedState();
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
      isMaximized: mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false,
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
    const sess = cloudAuth?.getSession();
    if (sess?.directives && sess.directives.allow_trial_activation === false) {
      return {
        ok: false,
        error: "trial_disabled_by_hq",
        message: "Free trial activation is currently disabled by CogniTara HQ. Obtain a school licence key at cognitara.net/license and enter it here.",
      };
    }
    const res = await engine!.callInternal("POST", "/license/start-trial", {
      school_name: schoolName || undefined,
    });
    return res.data;
  });

  ipcMain.handle("license:repairVault", async () => {
    const res = await engine!.callInternal("POST", "/license/repair-vault", {});
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

  ipcMain.handle("backups:delete", async (_evt, filename: string) => {
    const res = await engine!.callInternal("POST", "/backups/delete", { filename });
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
    await engine!.callInternal("POST", "/backups/set-dir", { backup_dir: settings.backupDir }).catch(() => {});
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

  // ---- Cloud Exam Database Backups (Upload, List, Restore, Delete) ----
  ipcMain.handle("cloudBackups:list", async () => {
    if (!cloudAuth) return { ok: false, message: "Cloud service unavailable." };
    return cloudAuth.listCloudBackups();
  });

  ipcMain.handle("cloudBackups:uploadNow", async (_evt, label?: string) => {
    if (!cloudAuth) return { ok: false, message: "Cloud service unavailable." };
    const sess = cloudAuth.getSession();
    if (!sess.signedIn) {
      return { ok: false, error: "unauthorized", message: "Sign in to your CogniTara Cloud account first to back up online." };
    }
    const snap = await engine!.callInternal<any>("POST", "/backups/export-cloud-snapshot", {});
    if (!snap.data?.ok || !snap.data?.payload_b64) {
      return { ok: false, error: snap.data?.error || "snapshot_failed", message: snap.data?.message || "Could not create exam database snapshot." };
    }
    const up = await cloudAuth.uploadCloudBackup({
      filename: snap.data.filename,
      label: label || `Exam Backup (${new Date().toLocaleDateString()})`,
      raw_size_bytes: snap.data.raw_size_bytes,
      stats: snap.data.stats || {},
      payload_b64: snap.data.payload_b64,
    });
    if (up.ok && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cloud:sessionChanged", cloudAuth.getSession());
    }
    return up;
  });

  ipcMain.handle("cloudBackups:restore", async (_evt, backupId: string) => {
    if (!cloudAuth) return { ok: false, message: "Cloud service unavailable." };
    const dl = await cloudAuth.downloadCloudBackup(String(backupId || "").trim());
    if (!dl.ok || !dl.backup?.payload_b64) {
      return { ok: false, message: dl.message || "Could not download cloud backup." };
    }
    const wasRunning = engine!.getLanState() === "running";
    if (wasRunning) {
      await engine!.stopLanServer();
    }
    const res = await engine!.callInternal("POST", "/backups/restore-cloud-snapshot", {
      payload_b64: dl.backup.payload_b64,
      sha256: dl.backup.sha256,
    });
    if (res.data?.ok && wasRunning) {
      await engine!.startLanServer();
    }
    return res.data;
  });

  ipcMain.handle("cloudBackups:delete", async (_evt, backupId: string) => {
    if (!cloudAuth) return { ok: false, message: "Cloud service unavailable." };
    return cloudAuth.deleteCloudBackup(String(backupId || "").trim());
  });

  // ---- Legacy School Database (exam.db) Inspection & Atomic Migration ----
  ipcMain.handle("legacyDb:pickAndInspect", async () => {
    if (!mainWindow) return { ok: false, message: "Window not ready." };
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: "Select former CogniTara database (exam.db)",
      buttonLabel: "Inspect Database",
      properties: ["openFile"],
      filters: [
        { name: "CogniTara SQLite Database", extensions: ["db", "sqlite", "sqlite3"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (picked.canceled || !picked.filePaths[0]) {
      return { ok: false, canceled: true };
    }
    const filePath = picked.filePaths[0];
    const res = await engine!.callInternal<any>("POST", "/backups/inspect-legacy", {
      file_path: filePath,
    });
    if (!res.data?.ok) {
      return {
        ok: false,
        file_path: filePath,
        error: res.data?.error || "inspection_failed",
        message: res.data?.message || "Selected file is not a valid CogniTara database.",
      };
    }
    return { ...res.data, file_path: filePath };
  });

  ipcMain.handle("legacyDb:import", async (_evt, payload: { file_path: string; preserve_current_admin?: boolean; force?: boolean }) => {
    const filePath = String(payload?.file_path || "").trim();
    if (!filePath) {
      return { ok: false, error: "missing_file_path", message: "No database file selected." };
    }
    const wasRunning = engine!.getLanState() === "running";
    if (wasRunning) {
      await engine!.stopLanServer();
    }
    try {
      const res = await engine!.callInternal<any>("POST", "/backups/import-legacy", {
        file_path: filePath,
        preserve_current_admin: payload?.preserve_current_admin !== false,
        force: Boolean(payload?.force),
      });
      if (wasRunning) {
        await engine!.startLanServer().catch(() => {});
      }
      return res.data || { ok: false, message: "Legacy database import did not return a response." };
    } catch (err: any) {
      if (wasRunning) {
        await engine!.startLanServer().catch(() => {});
      }
      return { ok: false, error: "import_exception", message: err?.message || "Unexpected error during database import." };
    }
  });

  ipcMain.handle("setup:school", async (_evt, payload) => {
    const res = await engine!.callInternal<any>("POST", "/setup/school", payload);
    if (!res.data?.ok) return res.data;

    let cloudSynced = false;
    let cloudSyncMessage = "";
    if (cloudAuth && cloudAuth.getSession().signedIn) {
      const lic = await engine?.getLicenseStatus().catch(() => null);
      const syncRes = await cloudAuth
        .syncSchoolProfileToCloud({
          school_name: res.data.school?.school_name || payload?.school_name,
          school_motto: res.data.school?.school_motto ?? payload?.school_motto,
          academic_session: res.data.school?.academic_session || payload?.academic_session,
          current_term: res.data.school?.current_term || payload?.current_term,
          logo_data_url: payload?.remove_logo ? null : (res.data.school?.logo_data_url || payload?.logo_data_url || undefined),
          remove_logo: Boolean(payload?.remove_logo),
          last_lan_ip: settings.selectedLanIp || undefined,
          display_hwid: lic?.display_hwid || undefined,
        })
        .catch(() => ({ ok: false, message: "Offline — saved locally." }));
      cloudSynced = Boolean(syncRes?.ok);
      cloudSyncMessage = syncRes?.message || "";
      if (cloudSynced && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("cloud:sessionChanged", cloudAuth.getSession());
      }
    }
    return {
      ...res.data,
      cloud_synced: cloudSynced,
      cloud_message: cloudSyncMessage,
    };
  });

  ipcMain.handle("setup:superadmin", async (_evt, payload) => {
    const res = await engine!.callInternal<any>("POST", "/setup/superadmin", payload);
    if (res.data?.ok) {
      settings = saveSettings({
        ...settings,
        adminFullName: String(payload?.full_name || settings.adminFullName || ""),
        adminUsername: String(payload?.username || settings.adminUsername || "superadmin"),
      });
      if (cloudAuth && cloudAuth.getSession().signedIn) {
        const lic = await engine?.getLicenseStatus().catch(() => null);
        await cloudAuth
          .syncSchoolProfileToCloud({
            admin_full_name: settings.adminFullName || undefined,
            admin_username: settings.adminUsername || undefined,
            last_lan_ip: settings.selectedLanIp || undefined,
            display_hwid: lic?.display_hwid || undefined,
          })
          .catch(() => {});
      }
    }
    return res.data;
  });

  ipcMain.handle("setup:complete", async (_evt, payload?: { selectedLanIp?: string }) => {
    // Enforce fully online school onboarding so account + all details appear in CogniTara HQ!
    const sess = cloudAuth?.getSession();
    if (!sess || !sess.signedIn || !sess.user) {
      return {
        ok: false,
        error: "cloud_account_required",
        message: "Connect to the internet and sign in (or register your school) before finishing first-time setup.",
      };
    }
    if (sess.user.email_verified === false) {
      return {
        ok: false,
        error: "email_verification_required",
        message: "Verify your 6-digit email OTP code before completing onboarding.",
      };
    }

    const chosenLanIp = payload?.selectedLanIp || settings.selectedLanIp || undefined;
    const setupRes = await engine?.callInternal<any>("GET", "/setup/status").catch(() => null);
    const school = setupRes?.data?.school || {};
    const lic = await engine?.getLicenseStatus().catch(() => null);

    const cloudSync = await cloudAuth!.syncSchoolProfileToCloud({
      school_name: school.school_name || sess.school?.school_name || undefined,
      school_motto: school.school_motto ?? undefined,
      academic_session: school.academic_session || undefined,
      current_term: school.current_term || undefined,
      logo_data_url: school.logo_data_url || undefined,
      admin_full_name: settings.adminFullName || sess.user.full_name || undefined,
      admin_username: settings.adminUsername || "superadmin",
      onboarding_completed: true,
      last_lan_ip: chosenLanIp || setupRes?.data?.network?.primary_lan_ip || undefined,
      display_hwid: lic?.display_hwid || undefined,
    });

    if (!cloudSync.ok) {
      return {
        ok: false,
        error: cloudSync.error || "onboarding_sync_required",
        message:
          cloudSync.message ||
          "An active internet connection is required to finish onboarding and register your school profile with CogniTara Cloud.",
      };
    }

    settings = saveSettings({
      ...settings,
      onboardingComplete: true,
      selectedLanIp: chosenLanIp || settings.selectedLanIp,
    });
    engine!.updateSettings(settings);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("cloud:sessionChanged", cloudAuth!.getSession());
    }
    return { ok: true, settings, cloud_synced: true };
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
      mainWindow.setBackgroundColor(partial.theme === "dark" ? "#111112" : "#EFEFEF");
    }
    return { ok: true, settings };
  });

  ipcMain.handle("window:action", async (_evt, action: "minimize" | "maximize" | "close") => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
    if (action === "minimize") {
      mainWindow.minimize();
      return { ok: true };
    }
    if (action === "maximize") {
      if (currentWindowMode === "boot") return { ok: false, maximized: false };
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
      broadcastMaximizedState();
      return { ok: true, maximized: mainWindow.isMaximized() };
    }
    if (action === "close") {
      await handleWindowCloseRequest();
      return { ok: true };
    }
    return { ok: false };
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

  // ---- Cloud Licence Activation (Key / Signed Lease Only — Zero In-App Payments) ----
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

  ipcMain.handle("cloud:activateLicense", async (_evt, licenseKey?: string) => {
    if (!cloudAuth) return { ok: false, message: "Cloud service unavailable." };
    const syncRes = await cloudAuth.syncProfile().catch(() => null);
    const session = syncRes?.session || cloudAuth.getSession();
    const list = Array.isArray(session.licenses) ? session.licenses : [];
    const target = licenseKey
      ? list.find((l) => l.license_key === licenseKey)
      : list.find((l) => String(l.status || "").toLowerCase() === "active") || list[0];
    if (!target) {
      return { ok: false, error: "no_cloud_license", message: "No active licence found on this CogniTara Cloud account yet." };
    }
    const act = await activateSignedLeaseLocally(target.signed_lease_json, target.license_key);
    if (act && act.ok) {
      return { ok: true, status: act.status, license_key: target.license_key };
    }
    return {
      ok: false,
      error: act?.error || "activation_failed",
      message: act?.message || "Could not activate the cloud licence on this computer.",
    };
  });

  // ---- In-App School Reviews & Ratings (Desktop App -> HQ Moderation -> Website) ----
  ipcMain.handle("reviews:mine", async () => {
    if (!cloudAuth) return { ok: false, message: "Cloud service unavailable." };
    return cloudAuth.getMySchoolReview();
  });

  ipcMain.handle("reviews:submit", async (_evt, payload) => {
    if (!cloudAuth) return { ok: false, message: "Cloud service unavailable." };
    return cloudAuth.submitSchoolReview(payload);
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
