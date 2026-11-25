/**
 * CogniTara Studio — Hardened Cloud Auth, Paystack Billing,
 * Promo/Redeem Codes, Cloud Exam Database Backups & Live Directives
 */

import fs from "fs";
import os from "os";
import path from "path";
import { app, safeStorage } from "electron";
import { CloudAccountSession, CloudDirectives } from "./types";

const PRODUCTION_CLOUD_URL = "https://cognitara-cloud.vercel.app";

export function resolveCloudApiUrl(): string {
  // Packaged builds lock strictly to the official HTTPS endpoint to block local MITM spoofing
  if (app && app.isPackaged) return PRODUCTION_CLOUD_URL;
  return (process.env.COGNITARA_CLOUD_URL || PRODUCTION_CLOUD_URL).replace(/\/+$/, "");
}

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
  directives?: CloudDirectives | null;
}

export class CloudAuthManager {
  private cloudUrl: string;
  private cached: PersistedCloudFile | null = null;
  private lastOffline = false;

  constructor(cloudUrl?: string) {
    this.cloudUrl = (app && app.isPackaged ? PRODUCTION_CLOUD_URL : cloudUrl || resolveCloudApiUrl()).replace(/\/+$/, "");
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
      // Handled below
    }
    // Never write plaintext bearer tokens on packaged Windows builds
    if (app && app.isPackaged && process.platform === "win32") {
      return {};
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
    if (app && app.isPackaged && process.platform === "win32") {
      return null;
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
        directives: null,
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
      directives: this.cached.directives || null,
    };
  }

  public getAccessToken(): string | null {
    return this.decryptToken(this.cached);
  }

  private async requestJson(
    urlPath: string,
    method: "GET" | "POST" | "DELETE",
    body?: Record<string, unknown>,
    token?: string | null,
    timeoutMs = 20_000
  ): Promise<{ ok: boolean; status: number; data: any; networkError?: boolean }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
  }): Promise<{
    ok: boolean;
    otp_required?: boolean;
    email?: string;
    purpose?: string;
    challenge_token?: string;
    session?: CloudAccountSession;
    message?: string;
    error?: string;
  }> {
    const res = await this.requestJson("/api/v1/auth/signup", "POST", {
      ...payload,
      client_type: "desktop",
      device_label: os.hostname(),
      app_version: app.getVersion(),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: res.data?.error || "signup_failed",
        message: res.data?.message || "Could not create your cloud account.",
      };
    }

    if (res.data?.otp_required) {
      return {
        ok: true,
        otp_required: true,
        email: res.data.email || payload.email,
        purpose: res.data.purpose || "signup_verify",
        challenge_token: res.data.challenge_token || "",
        message: res.data.message || "Enter the 6-digit verification code sent to your email.",
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
      directives: res.data.directives || null,
    });

    return { ok: true, session: this.getSession() };
  }

  public async signIn(payload: {
    email: string;
    password: string;
    display_hwid?: string;
  }): Promise<{
    ok: boolean;
    otp_required?: boolean;
    email?: string;
    purpose?: string;
    challenge_token?: string;
    session?: CloudAccountSession;
    message?: string;
    error?: string;
  }> {
    const res = await this.requestJson("/api/v1/auth/signin", "POST", {
      ...payload,
      client_type: "desktop",
      device_label: os.hostname(),
      app_version: app.getVersion(),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: res.data?.error || "signin_failed",
        message: res.data?.message || "Invalid email address or password.",
      };
    }

    if (res.data?.otp_required) {
      return {
        ok: true,
        otp_required: true,
        email: res.data.email || payload.email,
        purpose: res.data.purpose || "signin_otp",
        challenge_token: res.data.challenge_token || "",
        message: res.data.message || "Enter the 6-digit security code sent to your email.",
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
      directives: res.data.directives || null,
    });

    return { ok: true, session: this.getSession() };
  }

  public async verifyOtp(payload: {
    email: string;
    code: string;
    purpose?: string;
    challenge_token?: string;
    method?: string;
    display_hwid?: string;
  }): Promise<{ ok: boolean; session?: CloudAccountSession; message?: string; error?: string }> {
    const res = await this.requestJson("/api/v1/auth/otp/verify", "POST", {
      email: payload.email,
      code: payload.code,
      purpose: payload.purpose,
      challenge_token: payload.challenge_token || "",
      method: payload.method || "email_otp",
      client_type: "desktop",
      device_label: os.hostname(),
      display_hwid: payload.display_hwid,
      app_version: app.getVersion(),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: res.data?.error || "otp_invalid",
        message: res.data?.message || "Invalid or expired verification code.",
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
      directives: res.data.directives || null,
    });

    return { ok: true, session: this.getSession() };
  }

  public async resendOtp(payload: {
    email: string;
    purpose?: string;
    challenge_token?: string;
  }): Promise<{ ok: boolean; retry_after_sec?: number; message?: string; error?: string }> {
    const res = await this.requestJson("/api/v1/auth/otp/send", "POST", {
      email: payload.email,
      purpose: payload.purpose || "signup_verify",
      challenge_token: payload.challenge_token || "",
    });
    if (!res.ok) {
      return {
        ok: false,
        error: res.data?.error || "otp_send_failed",
        retry_after_sec: res.data?.retry_after_sec,
        message: res.data?.message || "Could not resend verification code yet.",
      };
    }
    return { ok: true, message: res.data?.message || "Fresh 6-digit code sent to your inbox." };
  }

  public async syncProfile(): Promise<{ ok: boolean; offline?: boolean; session: CloudAccountSession; message?: string }> {
    const token = this.decryptToken(this.cached);
    if (!token || !this.cached) {
      return { ok: false, session: this.getSession(), message: "Not signed in to CogniTara Cloud." };
    }

    const res = await this.requestJson("/api/v1/auth/me", "GET", undefined, token);
    if (res.networkError) {
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
        message: res.data?.message || "Cloud session expired. Please sign in again.",
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
        directives: res.data.directives || this.cached.directives || null,
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

  // ---- Dynamic Plans, Promo/Redeem Codes & Paystack Checkout ----

  public async fetchPlans(): Promise<{ ok: boolean; plans?: any[]; platform?: any; message?: string }> {
    const res = await this.requestJson("/api/v1/plans", "GET");
    if (!res.ok) {
      return { ok: false, message: res.data?.message || "Could not load CogniTara plans." };
    }
    return { ok: true, plans: res.data.plans || [], platform: res.data.platform || {} };
  }

  public async validatePromo(payload: {
    code: string;
    plan_id?: string | null;
    currency?: string;
  }): Promise<any> {
    const token = this.getAccessToken();
    const res = await this.requestJson("/api/v1/promo/validate", "POST", payload, token);
    return res.ok ? res.data : { ok: false, error: res.data?.error, message: res.data?.message || "Invalid code." };
  }

  public async redeemCode(payload: {
    code: string;
    plan_id?: string | null;
    currency?: string;
    hwid_hash?: string;
    display_hwid?: string;
    hw_component_hashes?: Record<string, string>;
  }): Promise<any> {
    const token = this.getAccessToken();
    if (!token) {
      return { ok: false, error: "unauthorized", message: "Sign in to your CogniTara Cloud account first." };
    }
    const res = await this.requestJson(
      "/api/v1/promo/redeem",
      "POST",
      {
        ...payload,
        machine_hostname: os.hostname(),
        os_version: `${os.platform()} ${os.release()}`,
      },
      token
    );
    return res.ok ? res.data : { ok: false, error: res.data?.error, message: res.data?.message || "Redeem failed." };
  }

  public async initializePaystack(payload: {
    plan_id: string;
    currency?: string;
    promo_code?: string;
    hwid_hash?: string;
    display_hwid?: string;
  }): Promise<any> {
    const token = this.getAccessToken();
    if (!token) {
      return { ok: false, error: "unauthorized", message: "Sign in to your CogniTara Cloud account first." };
    }
    const res = await this.requestJson(
      "/api/v1/payments/paystack/initialize",
      "POST",
      { ...payload, source: "desktop" },
      token
    );
    return res.ok ? res.data : { ok: false, error: res.data?.error, message: res.data?.message || "Checkout failed." };
  }

  public async verifyPaystack(payload: {
    reference: string;
    hwid_hash?: string;
    display_hwid?: string;
    hw_component_hashes?: Record<string, string>;
  }): Promise<any> {
    const token = this.getAccessToken();
    if (!token) {
      return { ok: false, error: "unauthorized", message: "Sign in to verify your payment." };
    }
    const res = await this.requestJson(
      "/api/v1/payments/paystack/verify",
      "POST",
      {
        ...payload,
        machine_hostname: os.hostname(),
        os_version: `${os.platform()} ${os.release()}`,
      },
      token
    );
    return res.ok ? res.data : { ok: false, error: res.data?.error, message: res.data?.message || "Verification failed." };
  }

  // ---- Cloud Exam Database Backups & 7-Day Configurable Reminder ----

  public async listCloudBackups(): Promise<any> {
    const token = this.getAccessToken();
    if (!token) {
      return { ok: false, error: "unauthorized", message: "Sign in to CogniTara Cloud to view cloud backups." };
    }
    const res = await this.requestJson("/api/v1/backups", "GET", undefined, token);
    return res.ok ? res.data : { ok: false, error: res.data?.error, message: res.data?.message || "Could not load cloud backups." };
  }

  public async uploadCloudBackup(payload: {
    filename: string;
    label?: string;
    raw_size_bytes: number;
    stats?: Record<string, unknown>;
    payload_b64: string;
  }): Promise<any> {
    const token = this.getAccessToken();
    if (!token) {
      return { ok: false, error: "unauthorized", message: "Sign in to CogniTara Cloud before backing up online." };
    }
    const res = await this.requestJson(
      "/api/v1/backups",
      "POST",
      {
        ...payload,
        app_version: app.getVersion(),
      },
      token,
      60_000
    );
    if (res.ok && this.cached && this.cached.school) {
      const nowIso = new Date().toISOString();
      this.writeCacheFile({
        ...this.cached,
        school: { ...this.cached.school, last_cloud_backup_at: nowIso },
        directives: this.cached.directives
          ? { ...this.cached.directives, last_cloud_backup_at: nowIso }
          : { last_cloud_backup_at: nowIso },
      });
    }
    return res.ok ? res.data : { ok: false, error: res.data?.error, message: res.data?.message || "Cloud backup upload failed." };
  }

  public async downloadCloudBackup(backupId: string): Promise<any> {
    const token = this.getAccessToken();
    if (!token) {
      return { ok: false, error: "unauthorized", message: "Sign in required." };
    }
    const res = await this.requestJson(
      `/api/v1/backups/${encodeURIComponent(backupId)}/download?format=json`,
      "GET",
      undefined,
      token,
      60_000
    );
    return res.ok ? res.data : { ok: false, error: res.data?.error, message: res.data?.message || "Could not download cloud backup." };
  }

  public async deleteCloudBackup(backupId: string): Promise<any> {
    const token = this.getAccessToken();
    if (!token) return { ok: false, error: "unauthorized" };
    const res = await this.requestJson(`/api/v1/backups?id=${encodeURIComponent(backupId)}`, "DELETE", undefined, token);
    return res.ok ? res.data : { ok: false, message: res.data?.message || "Could not delete cloud backup." };
  }
}
