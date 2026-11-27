import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { getSql } from "./db";

function getAuthSecret(): string {
  const secret = (process.env.COGNITARA_AUTH_SECRET || "").trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("COGNITARA_AUTH_SECRET must be set in production.");
  }
  return "cognitara-dev-local-auth-secret";
}

export interface PreAuthChallengePayload {
  uid: string;
  email: string;
  role: string;
  purpose: "signup_verify" | "signin_otp" | "hq_2fa";
  meta?: Record<string, unknown>;
  exp: number;
}

/**
 * Issues a short-lived HMAC-SHA256 signed pre-authentication challenge token.
 * Only minted AFTER password verification (or brand-new signup), closing the passwordless OTP bypass.
 */
export function issuePreAuthChallenge(params: {
  userId: string;
  email: string;
  role: string;
  purpose: "signup_verify" | "signin_otp" | "hq_2fa";
  meta?: Record<string, unknown>;
  ttlSeconds?: number;
}): string {
  const payload: PreAuthChallengePayload = {
    uid: params.userId,
    email: params.email.trim().toLowerCase(),
    role: params.role,
    purpose: params.purpose,
    meta: params.meta || {},
    exp: Math.floor(Date.now() / 1000) + (params.ttlSeconds || 600),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", `${getAuthSecret()}:preauth-v1`)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifyPreAuthChallenge(token: string | null | undefined): PreAuthChallengePayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  try {
    const expected = crypto
      .createHmac("sha256", `${getAuthSecret()}:preauth-v1`)
      .update(body)
      .digest("base64url");
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PreAuthChallengePayload;
    if (!parsed || !parsed.uid || !parsed.email || !parsed.exp) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persistent Neon Postgres brute-force lockout (survives Vercel serverless cold starts).
 * 5 failures -> 2 min, 8 failures -> 15 min, 12+ failures -> 60 min lockout.
 */
export async function checkDbLockout(lockKey: string): Promise<{ locked: boolean; retryAfterSec: number; attempts: number }> {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT attempts, locked_until, EXTRACT(EPOCH FROM (locked_until - NOW()))::int AS remaining_sec
      FROM auth_lockouts
      WHERE lock_key = ${lockKey}
      LIMIT 1
    `;
    if (!rows.length) return { locked: false, retryAfterSec: 0, attempts: 0 };
    const r = rows[0] as Record<string, any>;
    const rem = Number(r.remaining_sec || 0);
    if (r.locked_until && rem > 0) {
      return { locked: true, retryAfterSec: rem, attempts: Number(r.attempts || 0) };
    }
    return { locked: false, retryAfterSec: 0, attempts: Number(r.attempts || 0) };
  } catch (err) {
    console.error("checkDbLockout error:", err);
    return { locked: false, retryAfterSec: 0, attempts: 0 };
  }
}

export async function recordDbAuthFailure(lockKey: string): Promise<{ attempts: number; lockedSeconds: number }> {
  try {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO auth_lockouts (lock_key, attempts, locked_until, last_attempt_at)
      VALUES (${lockKey}, 1, NULL, NOW())
      ON CONFLICT (lock_key) DO UPDATE SET
        attempts = CASE
          WHEN auth_lockouts.last_attempt_at < NOW() - INTERVAL '2 hours' THEN 1
          ELSE auth_lockouts.attempts + 1
        END,
        last_attempt_at = NOW()
      RETURNING attempts
    `;
    const attempts = Number(rows[0]?.attempts || 1);
    let lockedSeconds = 0;
    if (attempts >= 12) lockedSeconds = 3600;
    else if (attempts >= 8) lockedSeconds = 900;
    else if (attempts >= 5) lockedSeconds = 120;

    if (lockedSeconds > 0) {
      await sql`
        UPDATE auth_lockouts
        SET locked_until = NOW() + (${lockedSeconds} * INTERVAL '1 second')
        WHERE lock_key = ${lockKey}
      `;
    }
    return { attempts, lockedSeconds };
  } catch (err) {
    console.error("recordDbAuthFailure error:", err);
    return { attempts: 1, lockedSeconds: 0 };
  }
}

export async function clearDbAuthLockout(lockKey: string): Promise<void> {
  try {
    const sql = getSql();
    await sql`DELETE FROM auth_lockouts WHERE lock_key = ${lockKey}`;
  } catch {
    // non-fatal
  }
}

/**
 * Validates Origin/Referer for cookie-authenticated mutating requests (CSRF defense-in-depth).
 * Bearer-token clients (Desktop Studio / curl) bypass cookie CSRF check since they authenticate via Authorization header.
 */
export function verifyMutationOrigin(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) return true;

  const origin = req.headers.get("origin");
  if (!origin) return true; // Same-origin or non-browser client without Origin header
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const reqHost = (req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host || "").toLowerCase();
    return Boolean(reqHost && originHost === reqHost);
  } catch {
    return false;
  }
}

/* ==========================================================================
   Payment Security: High-Entropy References & Signed Receipt Access Tokens
   ========================================================================== */
export const RECEIPT_GRANT_COOKIE = "ct_receipt_grant";

/**
 * Generates an unpredictable 128-bit cryptographic payment reference
 * (no leaking timestamps or guessable sequential counters).
 */
export function generateSecurePaymentReference(prefix: "CTPAY" | "CTRDM" = "CTPAY"): string {
  const rand = crypto.randomBytes(10).toString("hex").toUpperCase();
  return `${prefix}-${rand.slice(0, 4)}-${rand.slice(4, 12)}-${rand.slice(12, 20)}`;
}

/**
 * Mints a deterministic, non-guessable HMAC-SHA256 receipt access token bound to a specific
 * payment reference. Required to read licence keys or download PDF receipts when not signed in.
 */
export function issueReceiptAccessToken(reference: string): string {
  const cleanRef = String(reference || "").trim();
  return crypto
    .createHmac("sha256", `${getAuthSecret()}:receipt-v1`)
    .update(cleanRef, "utf8")
    .digest("base64url");
}

export function verifyReceiptAccessToken(reference: string, token: string | null | undefined): boolean {
  const cleanRef = String(reference || "").trim();
  const cleanTok = String(token || "").trim();
  if (!cleanRef || !cleanTok) return false;
  try {
    const expected = issueReceiptAccessToken(cleanRef);
    const a = Buffer.from(cleanTok, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Stores up to 8 recent `reference:token` grants inside an HttpOnly cookie so Paystack redirects
 * and page refreshes remain authorized even if query strings are stripped.
 */
export function appendReceiptGrantCookieValue(existingCookie: string | undefined, reference: string): string {
  const cleanRef = String(reference || "").trim();
  const tok = issueReceiptAccessToken(cleanRef);
  const existing = String(existingCookie || "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.includes(":") && !p.startsWith(`${cleanRef}:`));
  existing.unshift(`${cleanRef}:${tok}`);
  return existing.slice(0, 8).join(",");
}

export function hasValidReceiptAccess(req: NextRequest, reference: string): boolean {
  const cleanRef = String(reference || "").trim();
  if (!cleanRef) return false;

  // 1. Query param `?rt=<token>` or header `x-receipt-token`
  const qTok = req.nextUrl.searchParams.get("rt") || req.headers.get("x-receipt-token") || "";
  if (qTok && verifyReceiptAccessToken(cleanRef, qTok)) return true;

  // 2. HttpOnly checkout receipt grant cookie
  const cookieVal = req.cookies.get(RECEIPT_GRANT_COOKIE)?.value || "";
  if (cookieVal) {
    for (const pair of cookieVal.split(",")) {
      const idx = pair.indexOf(":");
      if (idx <= 0) continue;
      const ref = pair.slice(0, idx).trim();
      const tok = pair.slice(idx + 1).trim();
      if (ref === cleanRef && verifyReceiptAccessToken(cleanRef, tok)) {
        return true;
      }
    }
  }
  return false;
}

