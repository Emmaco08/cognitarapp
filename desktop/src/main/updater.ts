/**
 * CogniTara Studio — Direct In-App Auto-Updater (`electron-updater`)
 *
 * Connects to GitHub Releases (`latest.yml` + `.blockmap` + `.exe`), pushes real-time
 * download progress to the Studio renderer, and executes a safe server-stop + active-exam
 * check before calling `autoUpdater.quitAndInstall()`.
 */

import { app } from "electron";
import { autoUpdater, ProgressInfo, UpdateInfo } from "electron-updater";
import { UpdateStatusState } from "./types";

export interface UpdaterCallbacks {
  onStatusChanged: (state: UpdateStatusState) => void;
  onBeforeQuitAndInstall: () => Promise<boolean>;
}

export class StudioUpdater {
  private state: UpdateStatusState;
  private readonly callbacks: UpdaterCallbacks;
  private initialized = false;
  private startupTimer: NodeJS.Timeout | null = null;

  constructor(callbacks: UpdaterCallbacks) {
    this.callbacks = callbacks;
    this.state = {
      status: "idle",
      currentVersion: app.getVersion(),
      availableVersion: null,
      releaseNotes: null,
      percent: 0,
      bytesPerSecond: 0,
      transferred: 0,
      total: 0,
      error: null,
      checkedAt: null,
    };
  }

  public getState(): UpdateStatusState {
    return { ...this.state };
  }

  private setState(partial: Partial<UpdateStatusState>): void {
    this.state = { ...this.state, ...partial };
    this.callbacks.onStatusChanged(this.getState());
  }

  private normalizeReleaseNotes(info: UpdateInfo): string | null {
    if (!info.releaseNotes) return null;
    if (typeof info.releaseNotes === "string") {
      return info.releaseNotes.replace(/<[^>]+>/g, "").trim().slice(0, 600);
    }
    if (Array.isArray(info.releaseNotes)) {
      return info.releaseNotes
        .map((n) => (typeof n === "string" ? n : n.note || ""))
        .join("\n")
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 600);
    }
    return null;
  }

  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;

    autoUpdater.on("checking-for-update", () => {
      this.setState({
        status: "checking",
        error: null,
        checkedAt: Date.now(),
      });
    });

    autoUpdater.on("update-available", (info: UpdateInfo) => {
      this.setState({
        status: "available",
        availableVersion: info.version,
        releaseNotes: this.normalizeReleaseNotes(info),
        percent: 0,
        error: null,
        checkedAt: Date.now(),
      });
    });

    autoUpdater.on("update-not-available", (info: UpdateInfo) => {
      this.setState({
        status: "not-available",
        availableVersion: info?.version || this.state.currentVersion,
        percent: 0,
        error: null,
        checkedAt: Date.now(),
      });
    });

    autoUpdater.on("download-progress", (prog: ProgressInfo) => {
      this.setState({
        status: "downloading",
        percent: Math.max(0, Math.min(100, Math.round(prog.percent * 10) / 10)),
        bytesPerSecond: Math.round(prog.bytesPerSecond || 0),
        transferred: Math.round(prog.transferred || 0),
        total: Math.round(prog.total || 0),
        error: null,
      });
    });

    autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
      this.setState({
        status: "downloaded",
        availableVersion: info.version,
        releaseNotes: this.normalizeReleaseNotes(info) || this.state.releaseNotes,
        percent: 100,
        error: null,
      });
    });

    autoUpdater.on("error", (err: Error) => {
      const msg = err?.message || "Update check failed";
      const isOffline =
        /ERR_INTERNET_DISCONNECTED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|net::/i.test(msg);
      this.setState({
        status: isOffline ? "offline" : "error",
        error: isOffline ? "Offline — will check automatically when internet is available." : msg,
        checkedAt: Date.now(),
      });
    });

    // Silent background update check 12 seconds after launch (packaged builds only)
    if (app.isPackaged) {
      this.startupTimer = setTimeout(() => {
        this.checkForUpdates().catch(() => {});
      }, 12_000);
    }
  }

  public dispose(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
  }

  public async checkForUpdates(): Promise<UpdateStatusState> {
    if (!app.isPackaged) {
      this.setState({
        status: "not-available",
        availableVersion: app.getVersion(),
        error: null,
        checkedAt: Date.now(),
      });
      return this.getState();
    }

    try {
      this.setState({ status: "checking", error: null });
      await autoUpdater.checkForUpdates();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isOffline = /ERR_INTERNET_DISCONNECTED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|net::/i.test(msg);
      this.setState({
        status: isOffline ? "offline" : "error",
        error: isOffline ? "Offline — connect to the internet to check for updates." : msg,
        checkedAt: Date.now(),
      });
    }
    return this.getState();
  }

  public async downloadUpdate(): Promise<{ ok: boolean; state: UpdateStatusState }> {
    if (!app.isPackaged) {
      return { ok: false, state: this.getState() };
    }
    try {
      this.setState({ status: "downloading", percent: 0, error: null });
      await autoUpdater.downloadUpdate();
      return { ok: true, state: this.getState() };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setState({ status: "error", error: msg });
      return { ok: false, state: this.getState() };
    }
  }

  public async installUpdateNow(): Promise<{ ok: boolean; canceled?: boolean; error?: string }> {
    if (this.state.status !== "downloaded") {
      return { ok: false, error: "no_downloaded_update" };
    }
    const allowed = await this.callbacks.onBeforeQuitAndInstall();
    if (!allowed) {
      return { ok: false, canceled: true };
    }
    // Slight delay so IPC response flushes cleanly before restart
    setTimeout(() => {
      autoUpdater.quitAndInstall(false, true);
    }, 250);
    return { ok: true };
  }
}
