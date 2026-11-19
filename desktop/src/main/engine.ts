/**
 * CogniTara v2 — Packaged Python Engine Process Supervisor
 *
 * Manages:
 *  1. Loopback-only Control Engine (`127.0.0.1:<controlPort>`): serves authenticated
 *     `/api/internal/*` APIs (HWID, 5-layer license vault, backups, setup) even when
 *     the LAN exam server is stopped.
 *  2. LAN Exam Server (`0.0.0.0:<examPort>`): started/stopped on demand by the Super
 *     Admin ONLY after Layer 5 dual-process license verification passes.
 *
 * Spawns `cognitara-engine.exe` when packaged (with `windowsHide: true` — zero console
 * windows ever) or `python wsgi.py` in local development.
 */

import { ChildProcess, spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import http from "http";
import net from "net";
import path from "path";
import { app } from "electron";
import { getDefaultDataDir } from "./settings";
import { LicenseStatus, ServerLifecycleState, StudioSettings } from "./types";

function findFreeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 5199;
      srv.close(() => resolve(port));
    });
  });
}

function httpJsonRequest<T = any>(
  port: number,
  method: "GET" | "POST",
  urlPath: string,
  token: string,
  body?: unknown,
  timeoutMs = 15000
): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? Buffer.from(JSON.stringify(body), "utf-8") : undefined;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        timeout: timeoutMs,
        headers: {
          Accept: "application/json",
          "X-CogniTara-Desktop-Token": token,
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": payload.length,
              }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          try {
            const parsed = text ? (JSON.parse(text) as T) : ({} as T);
            resolve({ status: res.statusCode || 500, data: parsed });
          } catch {
            resolve({ status: res.statusCode || 500, data: { raw: text } as unknown as T });
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`Engine request timed out: ${urlPath}`));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(port: number, timeoutMs = 20000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const ok = await new Promise<boolean>((resolve) => {
        const req = http.get(
          { hostname: "127.0.0.1", port, path: "/health", timeout: 1500 },
          (res) => {
            res.resume();
            resolve(res.statusCode === 200);
          }
        );
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });
      });
      if (ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

export class EngineManager {
  private readonly desktopToken: string;
  private readonly dataDir: string;
  private readonly dbPath: string;
  private controlProc: ChildProcess | null = null;
  private controlPort: number = 0;
  private lanProc: ChildProcess | null = null;
  private lanState: ServerLifecycleState = "stopped";
  private lanStartedAt: number = 0;
  private settings: StudioSettings;
  private onStateChange?: (state: ServerLifecycleState) => void;

  constructor(settings: StudioSettings, onStateChange?: (state: ServerLifecycleState) => void) {
    this.desktopToken = crypto.randomBytes(32).toString("hex");
    this.dataDir = getDefaultDataDir();
    this.dbPath = path.join(this.dataDir, "exam.db");
    this.settings = settings;
    this.onStateChange = onStateChange;
  }

  public updateSettings(next: StudioSettings): void {
    this.settings = next;
  }

  public getLanState(): ServerLifecycleState {
    return this.lanState;
  }

  public getLanStartedAt(): number {
    return this.lanStartedAt;
  }

  private setLanState(next: ServerLifecycleState): void {
    this.lanState = next;
    if (this.onStateChange) this.onStateChange(next);
  }

  private resolveEngineCommand(): { command: string; args: string[]; cwd: string } {
    if (app.isPackaged) {
      const exeName = process.platform === "win32" ? "cognitara-engine.exe" : "cognitara-engine";
      const engineDir = path.join(process.resourcesPath, "engine");
      const exePath = path.join(engineDir, exeName);
      return { command: exePath, args: [], cwd: engineDir };
    }

    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const venvPyWin = path.join(repoRoot, "venv", "Scripts", "python.exe");
    const venvPyPosix = path.join(repoRoot, "venv", "bin", "python");
    const pythonCmd = fs.existsSync(venvPyWin)
      ? venvPyWin
      : fs.existsSync(venvPyPosix)
      ? venvPyPosix
      : process.platform === "win32"
      ? "python"
      : "python3";
    return {
      command: pythonCmd,
      args: [path.join(repoRoot, "wsgi.py")],
      cwd: repoRoot,
    };
  }

  private buildEnv(host: string, port: number, threads: number): NodeJS.ProcessEnv {
    return {
      ...process.env,
      COGNITARA_HOST: host,
      COGNITARA_PORT: String(port),
      COGNITARA_THREADS: String(threads),
      COGNITARA_DB_NAME: this.dbPath,
      COGNITARA_DATA_DIR: this.dataDir,
      COGNITARA_BACKUP_DIR: this.settings.backupDir,
      COGNITARA_DESKTOP_TOKEN: this.desktopToken,
      COGNITARA_DESKTOP_MANAGED: "1",
      COGNITARA_ENFORCE_LICENSE: "1",
      PYTHONUNBUFFERED: "1",
    };
  }

  public async ensureControlEngine(): Promise<boolean> {
    if (this.controlProc && !this.controlProc.killed && this.controlPort > 0) {
      const alive = await waitForHealth(this.controlPort, 1500);
      if (alive) return true;
    }

    this.controlPort = await findFreeLoopbackPort();
    const { command, args, cwd } = this.resolveEngineCommand();
    const child = spawn(command, args, {
      cwd,
      env: this.buildEnv("127.0.0.1", this.controlPort, 4),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.controlProc = child;
    child.on("exit", () => {
      if (this.controlProc === child) {
        this.controlProc = null;
      }
    });

    return waitForHealth(this.controlPort, 20000);
  }

  public async callInternal<T = any>(
    method: "GET" | "POST",
    subPath: string,
    body?: unknown
  ): Promise<{ status: number; data: T }> {
    const ready = await this.ensureControlEngine();
    if (!ready) {
      return {
        status: 503,
        data: { ok: false, error: "control_engine_unavailable" } as unknown as T,
      };
    }
    return httpJsonRequest<T>(this.controlPort, method, `/api/internal${subPath}`, this.desktopToken, body);
  }

  public async getLicenseStatus(): Promise<LicenseStatus | null> {
    const res = await this.callInternal<{ ok: boolean; license?: LicenseStatus }>("GET", "/license-status");
    if (res.status === 200 && res.data?.license) {
      return res.data.license;
    }
    return null;
  }

  public async startLanServer(): Promise<{ ok: boolean; error?: string; port?: number; license?: LicenseStatus | null }> {
    if (this.lanState === "running" && this.lanProc && !this.lanProc.killed) {
      return { ok: true, port: this.settings.port };
    }

    // Layer 5 dual-process enforcement: verify licence is ACTIVE before spawning LAN server
    const lic = await this.getLicenseStatus();
    if (!lic || lic.lock_state !== "ACTIVE") {
      this.setLanState("locked");
      return {
        ok: false,
        error: lic ? `licence_${lic.lock_state.toLowerCase()}` : "licence_unavailable",
        license: lic,
      };
    }

    this.setLanState("starting");
    const host = this.settings.lanOnly ? "0.0.0.0" : "0.0.0.0";
    const port = this.settings.port || 5000;
    const { command, args, cwd } = this.resolveEngineCommand();

    const child = spawn(command, args, {
      cwd,
      env: this.buildEnv(host, port, 24),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.lanProc = child;
    child.on("exit", () => {
      if (this.lanProc === child) {
        this.lanProc = null;
        if (this.lanState !== "stopping" && this.lanState !== "locked") {
          this.setLanState("stopped");
        }
      }
    });

    const healthy = await waitForHealth(port, 20000);
    if (!healthy) {
      await this.stopLanServer();
      return { ok: false, error: "server_failed_to_bind_port" };
    }

    this.lanStartedAt = Date.now();
    this.setLanState("running");
    return { ok: true, port, license: lic };
  }

  private terminateChild(proc: ChildProcess | null): Promise<void> {
    return new Promise((resolve) => {
      if (!proc || proc.killed || proc.exitCode !== null) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // ignore
        }
        resolve();
      }, 4500);

      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });

      try {
        proc.kill("SIGTERM");
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  public async stopLanServer(): Promise<{ ok: boolean }> {
    if (!this.lanProc) {
      this.setLanState("stopped");
      return { ok: true };
    }
    this.setLanState("stopping");
    const proc = this.lanProc;
    this.lanProc = null;
    await this.terminateChild(proc);
    this.lanStartedAt = 0;
    this.setLanState("stopped");
    return { ok: true };
  }

  public async shutdownAll(): Promise<void> {
    await this.stopLanServer();
    const ctrl = this.controlProc;
    this.controlProc = null;
    await this.terminateChild(ctrl);
  }
}
