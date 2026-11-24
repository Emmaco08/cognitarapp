/**
 * CogniTara Studio — Neon Postgres + Vercel Online Auth & Offline-Ready Local Cache
 *
 * Connects CogniTara Studio to the live CogniTara Cloud API (`https://cognitara-cloud.vercel.app`)
 * for real online Sign Up, Sign In, and profile sync, while persisting an encrypted local cache
 * (`studio-cloud-account.json`) so schools remain seamlessly signed in even when completely offline.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { app, safeStorage } from "electron";
import { CloudAccountSession } from "./types";

export const DEFAULT_CLOUD_API_URL =
  process.env.COGNITARA_CLOUD_URL || "https://cognitara-cloud.vercel.app";

const CACHE_FILENAME = "studio-cloud-account.json";

interface PersistedCloudFile {
  version: 1;
  cloudUrl: string;
  tokenEnc?: string;
  tokenPlain?: string;
  expiresAt: string | null;
  lastSyncedAt: number;
  user: CloudAccountSession["user"];
  school: CloudAccountSession["school"];
  referralCode: string | null;
  licenses: CloudAccountSession["licenses"];
}

export class CloudAuthManager {
  private cloudUrl: string;
  private cached: PersistedCloudFile | null = null;
  private lastOffline = false;

  constructor(cloudUrl?: string) {
    this.cloudUrl = (cloudUrl || DEFAULT_CLOUD_API_URL).replace(/\/+$/, "");
    this.cached = this.readCacheFile();
  }

  public getCloudUrl(): string {
    return this.cloudUrl;
  }

  private getCachePath(): string {
    return path.join(app.getPath("userData"), CACHE_FILENAME);
  }

  private encryptToken(raw: string): { tokenEnc?: string; tokenPlain?: string } {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return { tokenEnc: safeStorage.encryptString(raw).toString("base64") };
      }
    } catch {
      // Fallback on headless/Linux environments without keyring
    }
    return { tokenPlain: raw };
  }

  private decryptToken(file: PersistedCloudFile | null): string | null {
    if (!file) return null;
    if (file.tokenEnc) {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          return safeStorage.decryptString(Buffer.from(file.tokenEnc, "base64"));
        }
      } catch {
        return null;
      }
    }
    return file.tokenPlain || null;
  }

  private readCacheFile(): PersistedCloudFile | null {
    const fp = this.getCachePath();
    try {
      if (!fs.existsSync(fp)) return null;
      const raw = fs.readFileSync(fp, "utf-8");
      const parsed = JSON.parse(raw) as PersistedCloudFile;
      if (!parsed || !parsed.user || !parsed.user.email) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private writeCacheFile(data: PersistedCloudFile): void {
    const fp = this.getCachePath();
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf-8");
    this.cached = data;
  }

  private clearCacheFile(): void {
    this.cached = null;
    this.lastOffline = false;
    try {
      const fp = this.getCachePath();
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch {
      // ignore
    }
  }

  public getSession(): CloudAccountSession {
    if (!this.cached) {
      return {
        signedIn: false,
        offline: this.lastOffline,
        cloudUrl: this.cloudUrl,
        lastSyncedAt: null,
        user: null,
        school: null,
        referralCode: null,
        licenses: [],
      };
    }
    return {
      signedIn: true,
      offline: this.lastOffline,
      cloudUrl: this.cached.cloudUrl || this.cloudUrl,
      lastSyncedAt: this.cached.lastSyncedAt,
      user: this.cached.user,
      school: this.cached.school,
      referralCode: this.cached.referralCode,
      licenses: this.cached.licenses || [],
    };
  }

  private async requestJson(
    urlPath: string,
    method: "GET" | "POST",
    body?: Record<string, unknown>,
    token?: string | null
  ): Promise<{ ok: boolean; status: number; data: any; networkError?: boolean }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(`${this.cloudUrl}${urlPath}`, {
        method,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      this.lastOffline = false;
      return { ok: res.ok && Boolean(data?.ok), status: res.status, data };
    } catch (err) {
      this.lastOffline = true;
      return {
        ok: false,
        status: 0,
        networkError: true,
        data: {
          ok: false,
          error: "network_offline",
          message:
            err instanceof Error && err.name === "AbortError"
              ? "CogniTara Cloud timed out. Offline mode remains active."
              : "You appear to be offline. Cached account data stays available.",
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  public async signUp(payload: {
    full_name: string;
    school_name: string;
    email: string;
    password: string;
    phone?: string;
    referral_code?: string;
    display_hwid?: string;
  }): Promise<{ ok: boolean; session?: CloudAccountSession; message?: string; error?: string }> {
    const res = await this.requestJson("/api/v1/auth/signup", "POST", {
      ...payload,
      client_type: "desktop",
      device_label: os.hostname(),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: res.data?.error || "signup_failed",
        message: res.data?.message || "Could not create your cloud account.",
      };
    }

    const enc = this.encryptToken(String(res.data.token || ""));
    this.writeCacheFile({
      version: 1,
      cloudUrl: this.cloudUrl,
      ...enc,
      expiresAt: res.data.expires_at || null,
      lastSyncedAt: Date.now(),
      user: res.data.user,
      school: res.data.school || null,
      referralCode: res.data.referral_code || null,
      licenses: res.data.licenses || [],
    });

    return { ok: true, session: this.getSession() };
  }

  public async signIn(payload: {
    email: string;
    password: string;
    display_hwid?: string;
  }): Promise<{ ok: boolean; session?: CloudAccountSession; message?: string; error?: string }> {
    const res = await this.requestJson("/api/v1/auth/signin", "POST", {
      ...payload,
      client_type: "desktop",
      device_label: os.hostname(),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: res.data?.error || "signin_failed",
        message: res.data?.message || "Invalid email address or password.",
      };
    }

    const enc = this.encryptToken(String(res.data.token || ""));
    this.writeCacheFile({
      version: 1,
      cloudUrl: this.cloudUrl,
      ...enc,
      expiresAt: res.data.expires_at || null,
      lastSyncedAt: Date.now(),
      user: res.data.user,
      school: res.data.school || null,
      referralCode: res.data.referral_code || null,
      licenses: res.data.licenses || [],
    });

    return { ok: true, session: this.getSession() };
  }

  public async syncProfile(): Promise<{ ok: boolean; offline?: boolean; session: CloudAccountSession; message?: string }> {
    const token = this.decryptToken(this.cached);
    if (!token || !this.cached) {
      return { ok: false, session: this.getSession(), message: "Not signed in to CogniTara Cloud." };
    }

    const res = await this.requestJson("/api/v1/auth/me", "GET", undefined, token);
    if (res.networkError) {
      // Offline-ready: keep cached profile active!
      return {
        ok: true,
        offline: true,
        session: this.getSession(),
        message: "Offline — using locally cached CogniTara Cloud profile.",
      };
    }

    if (res.status === 401) {
      this.clearCacheFile();
      return {
        ok: false,
        session: this.getSession(),
        message: "Cloud session expired. Please sign in again.",
      };
    }

    if (res.ok && res.data?.user) {
      this.writeCacheFile({
        ...this.cached,
        lastSyncedAt: Date.now(),
        user: res.data.user,
        school: res.data.school || this.cached.school,
        referralCode: res.data.referral_code ?? this.cached.referralCode,
        licenses: Array.isArray(res.data.licenses) ? res.data.licenses : this.cached.licenses,
      });
      return { ok: true, offline: false, session: this.getSession() };
    }

    return { ok: false, session: this.getSession(), message: res.data?.message || "Sync failed." };
  }

  public async signOut(): Promise<{ ok: boolean; session: CloudAccountSession }> {
    const token = this.decryptToken(this.cached);
    if (token) {
      await this.requestJson("/api/v1/auth/signout", "POST", {}, token).catch(() => {});
    }
    this.clearCacheFile();
    return { ok: true, session: this.getSession() };
  }
}
