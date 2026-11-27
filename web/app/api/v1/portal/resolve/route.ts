import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { normalizeSchoolCode } from "@/lib/portal-auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`portal-resolve:${ip}`, 40, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many lookups. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const rawCode = String(req.nextUrl.searchParams.get("code") || "").trim();
    const schoolCode = normalizeSchoolCode(rawCode);
    if (!schoolCode || schoolCode.length < 4) {
      return NextResponse.json(
        { ok: false, error: "invalid_school_code", message: "Enter a valid School ID (for example, CT-4829A)." },
        { status: 400 }
      );
    }

    const sql = getSql();
    const rows = await sql`
      SELECT s.id, s.school_code, s.school_name, s.status,
             s.online_portal_enabled, s.online_teachers_enabled, s.online_students_enabled,
             s.online_portal_notice, s.online_synced_at,
             p.school_name AS portal_school_name, p.school_motto, p.academic_session, p.current_term
      FROM schools s
      LEFT JOIN portal_school_settings p ON p.school_id = s.id
      WHERE UPPER(s.school_code) = ${schoolCode}
      LIMIT 1
    `;

    if (!rows.length) {
      return NextResponse.json(
        { ok: false, error: "school_not_found", message: `No school found with School ID "${schoolCode}". Check the code with your school administrator.` },
        { status: 404 }
      );
    }

    const s = rows[0] as Record<string, any>;
    if (s.status !== "active") {
      return NextResponse.json(
        { ok: false, error: "school_suspended", message: "This school's online portal is currently unavailable." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      school: {
        school_code: String(s.school_code),
        school_name: String(s.portal_school_name || s.school_name || "CogniTara School"),
        school_motto: String(s.school_motto || ""),
        academic_session: String(s.academic_session || "2026/2027"),
        current_term: String(s.current_term || "First Term"),
        online_portal_enabled: Boolean(s.online_portal_enabled),
        online_teachers_enabled: Boolean(s.online_teachers_enabled),
        online_students_enabled: Boolean(s.online_students_enabled),
        online_portal_notice: String(s.online_portal_notice || ""),
        synced: Boolean(s.online_synced_at),
        online_synced_at: s.online_synced_at ? new Date(s.online_synced_at).toISOString() : null,
      },
    });
  } catch (err) {
    console.error("Portal resolve error:", err);
    return NextResponse.json({ ok: false, message: "Could not look up School ID right now." }, { status: 500 });
  }
}
