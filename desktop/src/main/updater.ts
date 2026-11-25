/**
 * CogniTara Studio — Direct In-App Auto-Updater (Custom Portrait Setup Engine)
 *
 * Checks GitHub Releases (`latest.yml`) for newer versions, downloads the official
 * custom Tauri v2 portrait Setup (`CogniTara-Studio-Setup-X.Y.Z-x64.exe`) with
 * real-time progress and SHA-256 verification against `SHA256SUMS.txt`, safely stops
 * the local Flask engine, and launches our custom branded installer — never the
 * legacy gray NSIS dialog.
 */

import { app, shell } from "electron";
import { autoUpdater, ProgressInfo, UpdateInfo } from "electron-updater";
import { spawn } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import { UpdateStatusState } from "./types";

const GITHUB_OWNER = "Emmaco08";
const GITHUB_REPO = "cognitarapp";

export interface UpdaterCallbacks {
  onStatusChanged: (state: UpdateStatusState) => void;
  onBeforeQuitAndInstall: () => Promise<boolean>;
}

export class StudioUpdater {
  private state: UpdateStatusState;
  private readonly callbacks: UpdaterCallbacks;
  private initialized = false;
  private startupTimer: NodeJS.Timeout | null = null;
  private downloadedSetupPath: string | null = null;
  private activeDownloadReq: http.ClientRequest | null = null;

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

  private getUpdatesDir(): string {
    const dir = path.join(app.getPath("userData"), "updates");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private cleanupStaleInstallers(keepPath?: string): void {
    try {
      const dir = this.getUpdatesDir();
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (keepPath && path.resolve(full) === path.resolve(keepPath)) continue;
        try {
          fs.unlinkSync(full);
        } catch {
          // Ignore locked files
        }
      }
    } catch {
      // Non-critical cleanup
    }
  }

  private fetchTextWithRedirects(urlStr: string, maxHops = 6): Promise<string | null> {
    return new Promise((resolve) => {
      const visit = (currentUrl: string, hops: number) => {
        if (hops <= 0) return resolve(null);
        let parsed: URL;
        try {
          parsed = new URL(currentUrl);
        } catch {
          return resolve(null);
        }
        const transport = parsed.protocol === "http:" ? http : https;
        const req = transport.get(
          parsed,
          {
            headers: {
              "User-Agent": `CogniTara-Studio-Updater/${app.getVersion()}`,
              Accept: "text/plain, */*",
            },
            timeout: 15_000,
          },
          (res) => {
            const status = res.statusCode || 0;
            if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
              res.resume();
              const nextUrl = new URL(res.headers.location, currentUrl).toString();
              return visit(nextUrl, hops - 1);
            }
            if (status !== 200) {
              res.resume();
              return resolve(null);
            }
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => {
              body += chunk;
              if (body.length > 256_000) {
                req.destroy();
                resolve(null);
              }
            });
            res.on("end", () => resolve(body));
            res.on("error", () => resolve(null));
          }
        );
        req.on("timeout", () => {
          req.destroy();
          resolve(null);
        });
        req.on("error", () => resolve(null));
      };
      visit(urlStr, maxHops);
    });
  }

  private parseExpectedSha256(sumsText: string | null, assetName: string): string | null {
    if (!sumsText) return null;
    const targetLower = assetName.toLowerCase();
    for (const rawLine of sumsText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
      if (match && path.basename(match[2].trim()).toLowerCase() === targetLower) {
        return match[1].toLowerCase();
      }
    }
    return null;
  }

  private downloadCustomSetup(version: string): Promise<{ path: string; sha256: string }> {
    const cleanVer = version.replace(/^v/i, "").trim();
    const assetName = `CogniTara-Studio-Setup-${cleanVer}-x64.exe`;
    const downloadUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${cleanVer}/${assetName}`;
    const updatesDir = this.getUpdatesDir();
    const destPath = path.join(updatesDir, assetName);
    const partPath = `${destPath}.part`;

    return new Promise((resolve, reject) => {
      const visit = (currentUrl: string, hops: number) => {
        if (hops <= 0) {
          return reject(new Error("Too many redirects while downloading custom installer."));
        }
        let parsed: URL;
        try {
          parsed = new URL(currentUrl);
        } catch (err) {
          return reject(err);
        }

        const transport = parsed.protocol === "http:" ? http : https;
        const req = transport.get(
          parsed,
          {
            headers: {
              "User-Agent": `CogniTara-Studio-Updater/${app.getVersion()}`,
              Accept: "application/octet-stream, */*",
            },
          },
          (res) => {
            const status = res.statusCode || 0;
            if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
              res.resume();
              const nextUrl = new URL(res.headers.location, currentUrl).toString();
              return visit(nextUrl, hops - 1);
            }
            if (status === 404) {
              res.resume();
              const notFoundErr = new Error("CUSTOM_SETUP_NOT_FOUND");
              return reject(notFoundErr);
            }
            if (status < 200 || status >= 300) {
              res.resume();
              return reject(new Error(`Installer download failed with HTTP ${status}.`));
            }

            const total = parseInt(String(res.headers["content-length"] || "0"), 10) || 0;
            const hash = crypto.createHash("sha256");
            const out = fs.createWriteStream(partPath);
            let transferred = 0;
            let lastEmit = 0;
            let lastBytes = 0;
            let lastTick = Date.now();

            const failAndClean = (err: Error) => {
              this.activeDownloadReq = null;
              try {
                out.destroy();
              } catch {
                // ignore
              }
              try {
                if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
              } catch {
                // ignore
              }
              reject(err);
            };

            res.on("data", (chunk: Buffer) => {
              transferred += chunk.length;
              hash.update(chunk);
              const now = Date.now();
              if (now - lastEmit >= 160 || (total > 0 && transferred >= total)) {
                const elapsedSec = Math.max(0.05, (now - lastTick) / 1000);
                const bytesPerSecond = Math.round((transferred - lastBytes) / elapsedSec);
                const percent =
                  total > 0 ? Math.max(0, Math.min(99.5, Math.round((transferred / total) * 1000) / 10)) : 0;
                this.setState({
                  status: "downloading",
                  percent,
                  bytesPerSecond: Math.max(0, bytesPerSecond),
                  transferred,
                  total,
                  error: null,
                });
                lastEmit = now;
                lastBytes = transferred;
                lastTick = now;
              }
            });

            res.on("error", (err) => failAndClean(err));
            out.on("error", (err) => failAndClean(err));

            out.on("finish", () => {
              this.activeDownloadReq = null;
              out.close(() => {
                try {
                  const stat = fs.statSync(partPath);
                  if (stat.size < 1024 * 512) {
                    fs.unlinkSync(partPath);
                    return reject(new Error("Downloaded installer is incomplete."));
                  }
                  const sha256 = hash.digest("hex").toLowerCase();
                  if (fs.existsSync(destPath)) {
                    fs.unlinkSync(destPath);
                  }
                  fs.renameSync(partPath, destPath);
                  resolve({ path: destPath, sha256 });
                } catch (err) {
                  failAndClean(err instanceof Error ? err : new Error(String(err)));
                }
              });
            });

            res.pipe(out);
          }
        );

        this.activeDownloadReq = req;
        req.setTimeout(45_000, () => {
          req.destroy(new Error("Download timed out while connecting to GitHub Releases."));
        });
        req.on("error", (err) => {
          this.activeDownloadReq = null;
          reject(err);
        });
      };

      visit(downloadUrl, 8);
    });
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
      this.downloadedSetupPath = null;
      this.setState({
        status: "available",
        availableVersion: info.version,
        releaseNotes: this.normalizeReleaseNotes(info),
        percent: 0,
        bytesPerSecond: 0,
        transferred: 0,
        total: 0,
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
    if (this.activeDownloadReq) {
      try {
        this.activeDownloadReq.destroy();
      } catch {
        // ignore
      }
      this.activeDownloadReq = null;
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

    const targetVer = this.state.availableVersion;
    if (process.platform === "win32" && targetVer) {
      const cleanVer = targetVer.replace(/^v/i, "").trim();
      const assetName = `CogniTara-Studio-Setup-${cleanVer}-x64.exe`;
      const sumsUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${cleanVer}/SHA256SUMS.txt`;

      try {
        this.downloadedSetupPath = null;
        this.setState({
          status: "downloading",
          percent: 0,
          bytesPerSecond: 0,
          transferred: 0,
          total: 0,
          error: null,
        });

        const [downloaded, sumsText] = await Promise.all([
          this.downloadCustomSetup(cleanVer),
          this.fetchTextWithRedirects(sumsUrl),
        ]);

        const expectedHash = this.parseExpectedSha256(sumsText, assetName);
        if (expectedHash && expectedHash !== downloaded.sha256) {
          try {
            fs.unlinkSync(downloaded.path);
          } catch {
            // ignore
          }
          throw new Error("Installer SHA-256 verification failed. Please retry the download.");
        }

        this.downloadedSetupPath = downloaded.path;
        this.cleanupStaleInstallers(downloaded.path);

        this.setState({
          status: "downloaded",
          availableVersion: cleanVer,
          percent: 100,
          bytesPerSecond: 0,
          error: null,
        });
        return { ok: true, state: this.getState() };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg !== "CUSTOM_SETUP_NOT_FOUND") {
          const isOffline = /ERR_INTERNET_DISCONNECTED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET/i.test(msg);
          this.setState({
            status: isOffline ? "offline" : "error",
            error: isOffline ? "Connection interrupted while downloading update. Please retry." : msg,
          });
          return { ok: false, state: this.getState() };
        }
        // Fallback to standard electron-updater only if custom Setup asset does not exist on the release
      }
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

    const customSetup = this.downloadedSetupPath;
    if (customSetup && fs.existsSync(customSetup)) {
      setTimeout(async () => {
        try {
          // ShellExecute handles both standard and UAC-elevated custom Tauri v2 Setup cleanly on Windows
          const openErr = await shell.openPath(customSetup);
          if (openErr) {
            const child = spawn(customSetup, [], {
              detached: true,
              stdio: "ignore",
              windowsHide: false,
            });
            child.unref();
          }
        } catch {
          try {
            const child = spawn(customSetup, [], {
              detached: true,
              stdio: "ignore",
              windowsHide: false,
            });
            child.unref();
          } catch {
            // Best effort
          }
        }
        setTimeout(() => {
          app.exit(0);
        }, 300);
      }, 220);
      return { ok: true };
    }

    // Fallback: silent install + auto-relaunch so the legacy gray NSIS dialog is never shown
    setTimeout(() => {
      autoUpdater.quitAndInstall(true, true);
    }, 250);
    return { ok: true };
  }
}
