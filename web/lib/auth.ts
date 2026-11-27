import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "./db";
import { getPlatformSettings, toPublicPlatformDirectives } from "./platform";

export const SESSION_COOKIE_NAME = "ct_cloud_session";
const DEFAULT_SESSION_TTL_DAYS = 30;
const HQ_SESSION_TTL_HOURS = 12;

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
  const pepper = (process.env.COGNITARA_AUTH_SECRET || "").trim() || (process.env.NODE_ENV === "production" ? "" : "cognitara-cloud-session-pepper-v2");
  if (!pepper) {
    throw new Error("COGNITARA_AUTH_SECRET must be set in production.");
  }
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

export function attachSessionCookie(res: NextResponse, rawToken: string, maxAgeSeconds = DEFAULT_SESSION_TTL_DAYS * 86400): void {
  res.cookies.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
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
  isHqAdmin?: boolean;
}): Promise<{ rawToken: string; expiresAt: string; maxAgeSeconds: number }> {
  const sql = getSql();
  const { rawToken, tokenHash } = generateSessionToken();
  const maxAgeSeconds = params.isHqAdmin ? HQ_SESSION_TTL_HOURS * 3600 : DEFAULT_SESSION_TTL_DAYS * 86400;
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();

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

  return { rawToken, expiresAt, maxAgeSeconds };
}

export async function resolveAuthenticatedAccount(rawToken: string) {
  const sql = getSql();
  const tokenHash = hashSessionToken(rawToken);

  const sessions = await sql`
    SELECT s.id AS session_id, s.user_id, s.school_id, s.client_type, s.expires_at, s.created_at AS session_created_at,
           u.email, u.full_name, u.phone, u.role, u.status AS user_status, u.email_verified,
           u.totp_enabled, u.created_at AS user_created_at
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

  const schools = await sql`
    SELECT id, school_code, school_name, country_code, state_region, contact_email, contact_phone, status,
           ban_reason, custom_notice, custom_notice_level, feature_overrides_json,
           force_signout_before, last_cloud_backup_at, referral_code_used,
           online_portal_enabled, online_teachers_enabled, online_students_enabled,
           online_portal_notice, online_synced_at, created_at
    FROM schools
    WHERE owner_user_id = ${row.user_id}::uuid
    ORDER BY created_at ASC
    LIMIT 1
  `;
  const school = (schools[0] as Record<string, any>) || null;
  if (school && !school.school_code) {
    const { ensureSchoolCode } = await import("./portal-auth");
    school.school_code = await ensureSchoolCode(String(school.id));
  }

  // Enforce Developer HQ "Force Sign-Out" timestamp
  if (school?.force_signout_before) {
    const cutoff = new Date(school.force_signout_before).getTime();
    const sessCreated = new Date(row.session_created_at).getTime();
    if (sessCreated < cutoff) {
      await sql`UPDATE cloud_sessions SET revoked_at = NOW() WHERE id = ${row.session_id}::uuid`;
      return null;
    }
  }

  await sql`UPDATE cloud_sessions SET last_used_at = NOW() WHERE id = ${row.session_id}::uuid`;
  if (school) {
    await sql`UPDATE schools SET last_seen_at = NOW() WHERE id = ${school.id}::uuid`;
  }

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
        SELECT l.id, l.license_key, l.plan_tier, l.status, l.issued_at, l.expires_at,
               l.bonus_days_total, l.lease_seconds, l.signed_lease_json, l.revocation_tombstone_json,
               p.display_name AS plan_name, p.slug AS plan_slug
        FROM licenses l
        LEFT JOIN plans p ON p.id = l.plan_id
        WHERE l.school_id = ${school.id}::uuid
        ORDER BY l.created_at DESC
        LIMIT 10
      `
    : [];

  const settings = await getPlatformSettings();
  const directives = {
    ...toPublicPlatformDirectives(settings),
    school_status: school?.status || "active",
    school_ban_reason: school?.ban_reason || null,
    school_notice: school?.custom_notice || "",
    school_notice_level: school?.custom_notice_level || "info",
    feature_overrides: school?.feature_overrides_json || {},
    last_cloud_backup_at: school?.last_cloud_backup_at ? new Date(school.last_cloud_backup_at).toISOString() : null,
  };

  return {
    sessionId: row.session_id as string,
    user: {
      id: row.user_id as string,
      email: row.email as string,
      full_name: row.full_name as string,
      phone: (row.phone as string) || "",
      role: row.role as string,
      status: row.user_status as string,
      email_verified: Boolean(row.email_verified),
      totp_enabled: Boolean(row.totp_enabled),
      created_at: row.user_created_at,
    },
    school: school
      ? {
          id: school.id as string,
          school_code: String(school.school_code || ""),
          school_name: school.school_name as string,
          country_code: String(school.country_code || "NG").trim(),
          state_region: school.state_region || "",
          contact_email: school.contact_email as string,
          contact_phone: school.contact_phone || "",
          status: school.status as string,
          ban_reason: school.ban_reason || null,
          last_cloud_backup_at: school.last_cloud_backup_at ? new Date(school.last_cloud_backup_at).toISOString() : null,
          online_portal_enabled: Boolean(school.online_portal_enabled),
          online_teachers_enabled: Boolean(school.online_teachers_enabled),
          online_students_enabled: Boolean(school.online_students_enabled),
          online_portal_notice: String(school.online_portal_notice || ""),
          online_synced_at: school.online_synced_at ? new Date(school.online_synced_at).toISOString() : null,
        }
      : null,
    referral_code: (referral as any)?.referral_code || null,
    licenses,
    directives,
  };
}

export async function requireHqAdmin(req: NextRequest) {
  const token = extractBearerOrCookieToken(req);
  if (!token) return null;
  const account = await resolveAuthenticatedAccount(token);
  if (!account) return null;
  if (account.user.role !== "hq_super_admin" && account.user.role !== "hq_admin") {
    return null;
  }
  return account;
}
