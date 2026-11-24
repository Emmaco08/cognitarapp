import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "./db";

export const SESSION_COOKIE_NAME = "ct_cloud_session";
const SESSION_TTL_DAYS = 30;

export function normalizeEmail(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.startsWith("scrypt$")) return false;
  const parts = storedHash.split("$");
  if (parts.length !== 3) return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    const expected = Buffer.from(expectedHex, "hex");
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function generateSessionToken(): { rawToken: string; tokenHash: string } {
  const rawToken = `ct_${crypto.randomBytes(32).toString("base64url")}`;
  const tokenHash = hashSessionToken(rawToken);
  return { rawToken, tokenHash };
}

export function hashSessionToken(rawToken: string): string {
  const pepper = process.env.COGNITARA_AUTH_SECRET || "cognitara-cloud-session-pepper-v2";
  return crypto.createHmac("sha256", pepper).update(rawToken).digest("hex");
}

export function generateReferralCode(schoolName: string): string {
  const prefix = schoolName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4)
    .padEnd(4, "C");
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `CT-${prefix}-${suffix}`;
}

export function extractBearerOrCookieToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const tok = auth.slice(7).trim();
    if (tok) return tok;
  }
  const cookieTok = req.cookies.get(SESSION_COOKIE_NAME)?.value?.trim();
  return cookieTok || null;
}

export function attachSessionCookie(res: NextResponse, rawToken: string): void {
  res.cookies.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 86400,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function createCloudSession(params: {
  userId: string;
  schoolId: string | null;
  clientType: "web" | "desktop";
  deviceLabel?: string | null;
  displayHwid?: string | null;
}): Promise<{ rawToken: string; expiresAt: string }> {
  const sql = getSql();
  const { rawToken, tokenHash } = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400 * 1000).toISOString();

  await sql`
    INSERT INTO cloud_sessions (user_id, school_id, token_hash, client_type, device_label, display_hwid, expires_at)
    VALUES (
      ${params.userId}::uuid,
      ${params.schoolId ? params.schoolId : null}::uuid,
      ${tokenHash},
      ${params.clientType},
      ${params.deviceLabel || null},
      ${params.displayHwid || null},
      ${expiresAt}::timestamptz
    )
  `;

  return { rawToken, expiresAt };
}

export async function resolveAuthenticatedAccount(rawToken: string) {
  const sql = getSql();
  const tokenHash = hashSessionToken(rawToken);

  const sessions = await sql`
    SELECT s.id AS session_id, s.user_id, s.school_id, s.client_type, s.expires_at,
           u.email, u.full_name, u.phone, u.role, u.status AS user_status, u.created_at AS user_created_at
    FROM cloud_sessions s
    JOIN users_hq u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
    LIMIT 1
  `;

  if (!sessions.length) return null;
  const row = sessions[0] as Record<string, any>;
  if (row.user_status !== "active") return null;

  await sql`
    UPDATE cloud_sessions SET last_used_at = NOW() WHERE id = ${row.session_id}::uuid
  `;

  const schools = await sql`
    SELECT id, school_name, country_code, state_region, contact_email, contact_phone, status, created_at
    FROM schools
    WHERE owner_user_id = ${row.user_id}::uuid
    ORDER BY created_at ASC
    LIMIT 1
  `;
  const school = schools[0] || null;

  const referrals = await sql`
    SELECT referral_code, reward_mode
    FROM referrals
    WHERE owner_user_id = ${row.user_id}::uuid AND is_active = TRUE
    ORDER BY created_at ASC
    LIMIT 1
  `;
  const referral = referrals[0] || null;

  const licenses = school
    ? await sql`
        SELECT id, license_key, plan_tier, status, issued_at, expires_at, bonus_days_total, lease_seconds
        FROM licenses
        WHERE school_id = ${(school as any).id}::uuid
        ORDER BY created_at DESC
        LIMIT 10
      `
    : [];

  return {
    sessionId: row.session_id as string,
    user: {
      id: row.user_id as string,
      email: row.email as string,
      full_name: row.full_name as string,
      phone: (row.phone as string) || "",
      role: row.role as string,
      status: row.user_status as string,
      created_at: row.user_created_at,
    },
    school: school
      ? {
          id: (school as any).id as string,
          school_name: (school as any).school_name as string,
          country_code: String((school as any).country_code || "NG").trim(),
          state_region: (school as any).state_region || "",
          contact_email: (school as any).contact_email as string,
          contact_phone: (school as any).contact_phone || "",
          status: (school as any).status as string,
        }
      : null,
    referral_code: (referral as any)?.referral_code || null,
    licenses,
  };
}
