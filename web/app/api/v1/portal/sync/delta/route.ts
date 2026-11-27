import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";
import { getPortalSessionFromRequest } from "@/lib/portal-auth";
import { exportOnlinePortalDelta } from "@/lib/portal-sync";

export const dynamic = "force-dynamic";

async function resolveAdminSchoolId(req: NextRequest): Promise<string | null> {
  const cloudToken = extractBearerOrCookieToken(req);
  if (cloudToken) {
    const account = await resolveAuthenticatedAccount(cloudToken);
    if (account?.school?.id && account.school.status === "active") {
      return String(account.school.id);
    }
  }
  const portalSess = getPortalSessionFromRequest(req);
  if (portalSess && portalSess.role === "admin") {
    return portalSess.schoolId;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const schoolId = await resolveAdminSchoolId(req);
    if (!schoolId) {
      return NextResponse.json({ ok: false, message: "School admin sign-in required." }, { status: 401 });
    }
    const delta = await exportOnlinePortalDelta(schoolId);
    return NextResponse.json({
      ok: true,
      exported_at: new Date().toISOString(),
      delta,
    });
  } catch (err) {
    console.error("Portal delta export error:", err);
    return NextResponse.json({ ok: false, message: "Could not export online portal changes." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const schoolId = await resolveAdminSchoolId(req);
    if (!schoolId) {
      return NextResponse.json({ ok: false, message: "School admin sign-in required." }, { status: 401 });
    }
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const ids = Array.isArray(body?.attempt_ids)
      ? body.attempt_ids.map((x) => String(x || "").trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x))
      : [];
    const sql = getSql();
    if (ids.length) {
      await sql`
        UPDATE portal_attempts
        SET synced_to_desktop = TRUE, updated_at = NOW()
        WHERE school_id = ${schoolId}::uuid AND id = ANY(${ids}::uuid[])
      `;
    } else if (body?.mark_all === true) {
      await sql`
        UPDATE portal_attempts
        SET synced_to_desktop = TRUE, updated_at = NOW()
        WHERE school_id = ${schoolId}::uuid AND origin = 'online' AND submitted = TRUE
      `;
    }
    return NextResponse.json({ ok: true, marked: ids.length || "all" });
  } catch (err) {
    console.error("Portal delta mark synced error:", err);
    return NextResponse.json({ ok: false, message: "Could not acknowledge desktop sync." }, { status: 500 });
  }
}
