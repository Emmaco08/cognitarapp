import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { normalizeSchoolCode } from "@/lib/portal-auth";
import { hashWerkzeugPassword } from "@/lib/werkzeug-password";
import { logPortalAudit } from "@/lib/portal-audit";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const rawCode = req.nextUrl.searchParams.get("school_code") || req.nextUrl.searchParams.get("code") || "";
  const username = String(req.nextUrl.searchParams.get("username") || "").trim();
  const code = normalizeSchoolCode(rawCode);
  if (!code) {
    return NextResponse.json({ ok: false, message: "School ID is required." }, { status: 400 });
  }
  const sql = getSql();
  const schools = await sql`
    SELECT s.id, s.school_name, s.school_code, s.online_portal_enabled, s.online_students_enabled,
           ps.classes_json, ps.school_motto, ps.academic_session, ps.current_term
    FROM schools s
    LEFT JOIN portal_school_settings ps ON ps.school_id = s.id
    WHERE UPPER(s.school_code) = ${code} AND s.status = 'active'
    LIMIT 1
  `;
  if (!schools.length) {
    return NextResponse.json({ ok: false, message: "School ID not found." }, { status: 404 });
  }
  const sc = schools[0] as Record<string, any>;

  if (username) {
    const existing = await sql`
      SELECT 1 FROM portal_students
      WHERE school_id = ${sc.id}::uuid AND LOWER(username) = LOWER(${username})
      LIMIT 1
    `;
    return NextResponse.json({ ok: true, available: existing.length === 0 });
  }

  const classes =
    Array.isArray(sc.classes_json) && sc.classes_json.length
      ? sc.classes_json
      : ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];

  return NextResponse.json({
    ok: true,
    school: {
      school_code: String(sc.school_code),
      school_name: String(sc.school_name),
      school_motto: String(sc.school_motto || ""),
      academic_session: String(sc.academic_session || "2026/2027"),
      current_term: String(sc.current_term || "First Term"),
      online_portal_enabled: Boolean(sc.online_portal_enabled),
      online_students_enabled: Boolean(sc.online_students_enabled),
      classes,
    },
  });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`portal-reg:${ip}`, 15, 10 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, message: "Too many registration attempts. Wait a few minutes and try again." },
      { status: 429 }
    );
  }

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
    }
    const code = normalizeSchoolCode(String(body.school_code || ""));
    const fullName = String(body.full_name || "").trim().slice(0, 140);
    const username = String(body.username || "").trim().slice(0, 80);
    const email = String(body.email || "").trim().slice(0, 120);
    const password = String(body.password || "");
    const studentClass = String(body.student_class || "").trim().slice(0, 60);
    const specialisation = String(body.specialisation || "General").trim().slice(0, 60) || "General";

    if (!code) {
      return NextResponse.json({ ok: false, message: "Valid School ID is required." }, { status: 400 });
    }
    if (fullName.length < 2 || username.length < 3 || !studentClass) {
      return NextResponse.json(
        { ok: false, message: "Full name, username (3+ characters), and class are required." },
        { status: 400 }
      );
    }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      return NextResponse.json(
        { ok: false, message: "Password must be at least 8 characters and include uppercase, lowercase, and a number." },
        { status: 400 }
      );
    }

    const sql = getSql();
    const schools = await sql`
      SELECT id, school_name, online_portal_enabled, online_students_enabled
      FROM schools
      WHERE UPPER(school_code) = ${code} AND status = 'active'
      LIMIT 1
    `;
    if (!schools.length) {
      return NextResponse.json({ ok: false, message: "School ID not found." }, { status: 404 });
    }
    const sc = schools[0] as Record<string, any>;
    if (!sc.online_portal_enabled || !sc.online_students_enabled) {
      return NextResponse.json(
        { ok: false, message: "Student online registration is currently switched off by your administrator." },
        { status: 403 }
      );
    }

    const dup = await sql`
      SELECT 1 FROM portal_students
      WHERE school_id = ${sc.id}::uuid AND LOWER(username) = LOWER(${username})
      LIMIT 1
    `;
    if (dup.length) {
      return NextResponse.json(
        { ok: false, message: "That username or admission number is already registered." },
        { status: 409 }
      );
    }

    const maxRows = await sql`
      SELECT GREATEST(100000, COALESCE(MAX(local_id), 100000))::int AS max_id
      FROM portal_students WHERE school_id = ${sc.id}::uuid
    `;
    const nextId = Number(maxRows[0]?.max_id || 100000) + 1;
    const pwdHash = hashWerkzeugPassword(password);

    await sql`
      INSERT INTO portal_students (
        school_id, local_id, username, password_hash, full_name, email,
        student_class, specialisation, status, created_online, updated_at
      )
      VALUES (
        ${sc.id}::uuid, ${nextId}, ${username}, ${pwdHash}, ${fullName}, ${email},
        ${studentClass}, ${specialisation}, 'pending', TRUE, NOW()
      )
    `;

    await logPortalAudit({
      schoolId: String(sc.id),
      actorRole: "student",
      actorUsername: username,
      action: "Student self-registered online (pending approval)",
      details: `${fullName} (${studentClass} / ${specialisation})`,
    });

    return NextResponse.json(
      {
        ok: true,
        status: "pending",
        message: "Registration submitted. Your school administrator will approve your account before you can sign in.",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Portal student register error:", err);
    return NextResponse.json({ ok: false, message: "Could not complete registration right now." }, { status: 500 });
  }
}
