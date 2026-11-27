import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "./db";

export const PORTAL_COOKIE_NAME = "ct_portal_session";
const PORTAL_SESSION_TTL_SECONDS = 12 * 3600; // 12 hours
const SCHOOL_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export type PortalRole = "student" | "teacher" | "admin";

export interface PortalSessionPayload {
  schoolId: string;
  schoolCode: string;
  role: PortalRole;
  localId: number;
  username: string;
  fullName: string;
  studentClass?: string;
  specialisation?: string;
  exp: number;
}

export interface PortalSchoolGate {
  id: string;
  school_code: string;
  school_name: string;
  status: string;
  online_portal_enabled: boolean;
  online_teachers_enabled: boolean;
  online_students_enabled: boolean;
  online_portal_notice: string;
  online_synced_at: string | null;
}

function getSigningSecret(): string {
  const s =
    (process.env.COGNITARA_AUTH_SECRET || "").trim() ||
    (process.env.NODE_ENV === "production" ? "" : "cognitara-portal-dev-secret-v25");
  if (!s) {
    throw new Error("COGNITARA_AUTH_SECRET must be set in production.");
  }
  return s;
}

export function normalizeSchoolCode(raw: string): string {
  const clean = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
  if (!clean) return "";
  if (clean.startsWith("CT-")) return clean;
  if (clean.startsWith("CT") && clean.length >= 6) return `CT-${clean.slice(2)}`;
  if (/^[A-Z0-9]{4,8}$/.test(clean)) return `CT-${clean}`;
  return clean;
}

export function generateSchoolCodeCandidate(): string {
  const bytes = crypto.randomBytes(5);
  let out = "CT-";
  for (let i = 0; i < 5; i++) {
    out += SCHOOL_CODE_ALPHABET[bytes[i] % SCHOOL_CODE_ALPHABET.length];
  }
  return out;
}

export async function generateUniqueSchoolCode(): Promise<string> {
  const sql = getSql();
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateSchoolCodeCandidate();
    const exists = await sql`SELECT 1 FROM schools WHERE UPPER(school_code) = ${code} LIMIT 1`;
    if (!exists.length) return code;
  }
  return `CT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function ensureSchoolCode(schoolId: string): Promise<string> {
  const sql = getSql();
  const rows = await sql`SELECT school_code FROM schools WHERE id = ${schoolId}::uuid LIMIT 1`;
  const existing = rows[0]?.school_code ? String(rows[0].school_code).trim().toUpperCase() : "";
  if (existing) return existing;
  const code = await generateUniqueSchoolCode();
  await sql`UPDATE schools SET school_code = ${code}, updated_at = NOW() WHERE id = ${schoolId}::uuid`;
  return code;
}

export function signPortalSession(payload: Omit<PortalSessionPayload, "exp">, ttlSeconds = PORTAL_SESSION_TTL_SECONDS): string {
  const full: PortalSessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getSigningSecret()).update(`portal:${body}`).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyPortalSessionToken(token: string | null | undefined): PortalSessionPayload | null {
  if (!token) return null;
  const parts = String(token).trim().split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  try {
    const expected = crypto.createHmac("sha256", getSigningSecret()).update(`portal:${body}`).digest("base64url");
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PortalSessionPayload;
    if (!parsed || !parsed.schoolId || !parsed.role || !parsed.exp) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function attachPortalCookie(res: NextResponse, token: string): void {
  res.cookies.set(PORTAL_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PORTAL_SESSION_TTL_SECONDS,
  });
}

export function clearPortalCookie(res: NextResponse): void {
  res.cookies.set(PORTAL_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function getPortalSessionFromRequest(req: NextRequest): PortalSessionPayload | null {
  const tok = req.cookies.get(PORTAL_COOKIE_NAME)?.value;
  return verifyPortalSessionToken(tok);
}

export async function loadSchoolGate(schoolId: string): Promise<PortalSchoolGate | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, school_code, school_name, status,
           online_portal_enabled, online_teachers_enabled, online_students_enabled,
           online_portal_notice, online_synced_at
    FROM schools
    WHERE id = ${schoolId}::uuid
    LIMIT 1
  `;
  if (!rows.length) return null;
  const r = rows[0] as Record<string, any>;
  return {
    id: String(r.id),
    school_code: String(r.school_code || ""),
    school_name: String(r.school_name || ""),
    status: String(r.status || "active"),
    online_portal_enabled: Boolean(r.online_portal_enabled),
    online_teachers_enabled: Boolean(r.online_teachers_enabled),
    online_students_enabled: Boolean(r.online_students_enabled),
    online_portal_notice: String(r.online_portal_notice || ""),
    online_synced_at: r.online_synced_at ? new Date(r.online_synced_at).toISOString() : null,
  };
}

/**
 * Verifies stateless HMAC session AND enforces the school's live Admin ON/OFF portal switches.
 * Admins are always permitted to access the portal so they can turn switches ON/OFF at any time.
 */
export async function requirePortalAccess(
  req: NextRequest,
  allowedRoles: PortalRole[]
): Promise<
  | { ok: true; session: PortalSessionPayload; school: PortalSchoolGate }
  | { ok: false; response: NextResponse }
> {
  const session = getPortalSessionFromRequest(req);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "unauthorized", message: "Please sign in to your school online portal." },
        { status: 401 }
      ),
    };
  }
  if (!allowedRoles.includes(session.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "forbidden_role", message: "You do not have permission to access this area." },
        { status: 403 }
      ),
    };
  }
  const school = await loadSchoolGate(session.schoolId);
  if (!school || school.status !== "active") {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "school_inactive", message: "This school portal is currently unavailable." },
        { status: 403 }
      ),
    };
  }

  // Enforce ON/OFF switches strictly for teachers and students (admin always stays unlocked)
  if (session.role !== "admin") {
    if (!school.online_portal_enabled) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            error: "portal_offline",
            message: "Online exam portal is currently switched OFF by your school administrator.",
          },
          { status: 403 }
        ),
      };
    }
    if (session.role === "teacher" && !school.online_teachers_enabled) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            error: "teachers_disabled",
            message: "Teacher online access is currently switched OFF by your school administrator.",
          },
          { status: 403 }
        ),
      };
    }
    if (session.role === "student" && !school.online_students_enabled) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            error: "students_disabled",
            message: "Student online exam access is currently switched OFF by your school administrator.",
          },
          { status: 403 }
        ),
      };
    }
  }

  return { ok: true, session, school };
}
