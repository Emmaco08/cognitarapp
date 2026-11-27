import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";
import { ensureSchoolCode, getPortalSessionFromRequest, loadSchoolGate } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

async function resolveAdminSchoolId(req: NextRequest): Promise<{ schoolId: string; actor: string } | null> {
  // 1. Check CogniTara Cloud session (Web /dashboard or Desktop Bearer token)
  const cloudToken = extractBearerOrCookieToken(req);
  if (cloudToken) {
    const account = await resolveAuthenticatedAccount(cloudToken);
    if (account?.school?.id && account.school.status === "active") {
      return { schoolId: String(account.school.id), actor: String(account.user.email || "owner") };
    }
  }
  // 2. Check Portal Admin session (portal.cognitara.net/admin)
  const portalSess = getPortalSessionFromRequest(req);
  if (portalSess && portalSess.role === "admin") {
    return { schoolId: portalSess.schoolId, actor: portalSess.username };
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveAdminSchoolId(req);
    if (!auth) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "School admin sign-in required." }, { status: 401 });
    }

    const schoolId = auth.schoolId;
    const schoolCode = await ensureSchoolCode(schoolId);
    const school = await loadSchoolGate(schoolId);
    if (!school) {
      return NextResponse.json({ ok: false, message: "School not found." }, { status: 404 });
    }

    const sql = getSql();
    const [countsRows, backupRows, settingsRows] = await Promise.all([
      sql`
        SELECT
          (SELECT COUNT(*)::int FROM portal_admins WHERE school_id = ${schoolId}::uuid) AS admins,
          (SELECT COUNT(*)::int FROM portal_teachers WHERE school_id = ${schoolId}::uuid) AS teachers,
          (SELECT COUNT(*)::int FROM portal_students WHERE school_id = ${schoolId}::uuid) AS students,
          (SELECT COUNT(*)::int FROM portal_students WHERE school_id = ${schoolId}::uuid AND status = 'pending') AS pending_students,
          (SELECT COUNT(*)::int FROM portal_exams WHERE school_id = ${schoolId}::uuid AND deactivated = FALSE) AS exams,
          (SELECT COUNT(*)::int FROM portal_exams WHERE school_id = ${schoolId}::uuid AND active = TRUE AND deactivated = FALSE) AS active_exams,
          (SELECT COUNT(*)::int FROM portal_questions WHERE school_id = ${schoolId}::uuid) AS questions,
          (SELECT COUNT(*)::int FROM portal_attempts WHERE school_id = ${schoolId}::uuid AND origin = 'online' AND submitted = TRUE) AS online_submissions,
          (SELECT COUNT(*)::int FROM portal_attempts WHERE school_id = ${schoolId}::uuid AND origin = 'online' AND submitted = TRUE AND synced_to_desktop = FALSE) AS unsynced_submissions,
          (SELECT COUNT(*)::int FROM portal_exams WHERE school_id = ${schoolId}::uuid AND created_online = TRUE) AS online_created_exams
      `,
      sql`
        SELECT id, filename, label, raw_size_bytes, compressed_bytes, created_at
        FROM cloud_exam_backups
        WHERE school_id = ${schoolId}::uuid
        ORDER BY created_at DESC
        LIMIT 5
      `,
      sql`
        SELECT school_name, school_motto, academic_session, current_term, classes_json
        FROM portal_school_settings
        WHERE school_id = ${schoolId}::uuid
        LIMIT 1
      `,
    ]);

    const c = (countsRows[0] || {}) as Record<string, number>;
    const pset = (settingsRows[0] || null) as Record<string, any> | null;

    return NextResponse.json({
      ok: true,
      school: {
        ...school,
        school_code: schoolCode,
        portal_school_name: pset?.school_name || school.school_name,
        school_motto: pset?.school_motto || "",
        academic_session: pset?.academic_session || "2026/2027",
        current_term: pset?.current_term || "First Term",
        classes: Array.isArray(pset?.classes_json) ? pset.classes_json : [],
      },
      portal_url: `https://portal.cognitara.net/s/${schoolCode}`,
      fallback_portal_url: `https://portal.cognitara.net/?school=${encodeURIComponent(schoolCode)}`,
      counts: {
        admins: Number(c.admins || 0),
        teachers: Number(c.teachers || 0),
        students: Number(c.students || 0),
        pending_students: Number(c.pending_students || 0),
        exams: Number(c.exams || 0),
        active_exams: Number(c.active_exams || 0),
        questions: Number(c.questions || 0),
        online_submissions: Number(c.online_submissions || 0),
        unsynced_submissions: Number(c.unsynced_submissions || 0),
        online_created_exams: Number(c.online_created_exams || 0),
      },
      backups: backupRows,
    });
  } catch (err) {
    console.error("Portal control GET error:", err);
    return NextResponse.json({ ok: false, message: "Could not load online portal status." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await resolveAdminSchoolId(req);
    if (!auth) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "School admin sign-in required." }, { status: 401 });
    }
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: "Invalid JSON payload." }, { status: 400 });
    }

    const school = await loadSchoolGate(auth.schoolId);
    if (!school) {
      return NextResponse.json({ ok: false, message: "School not found." }, { status: 404 });
    }

    const nextPortal =
      typeof body.online_portal_enabled === "boolean"
        ? body.online_portal_enabled
        : school.online_portal_enabled;
    let nextTeachers =
      typeof body.online_teachers_enabled === "boolean"
        ? body.online_teachers_enabled
        : school.online_teachers_enabled;
    let nextStudents =
      typeof body.online_students_enabled === "boolean"
        ? body.online_students_enabled
        : school.online_students_enabled;
    const nextNotice =
      typeof body.online_portal_notice === "string"
        ? body.online_portal_notice.trim().slice(0, 280)
        : school.online_portal_notice;

    // Smart convenience: when turning Master ON from OFF and both sub-toggles were OFF, enable teachers & students cleanly unless caller explicitly passed them
    if (
      body.online_portal_enabled === true &&
      !school.online_portal_enabled &&
      typeof body.online_teachers_enabled !== "boolean" &&
      typeof body.online_students_enabled !== "boolean" &&
      !nextTeachers &&
      !nextStudents
    ) {
      nextTeachers = true;
      nextStudents = true;
    }

    const sql = getSql();
    await sql`
      UPDATE schools
      SET online_portal_enabled = ${nextPortal},
          online_teachers_enabled = ${nextTeachers},
          online_students_enabled = ${nextStudents},
          online_portal_notice = ${nextNotice},
          updated_at = NOW()
      WHERE id = ${auth.schoolId}::uuid
    `;

    const updated = await loadSchoolGate(auth.schoolId);
    return NextResponse.json({
      ok: true,
      school: updated,
      message: nextPortal
        ? "Online Exam Portal settings updated."
        : "Online Exam Portal switched OFF.",
    });
  } catch (err) {
    console.error("Portal control PATCH error:", err);
    return NextResponse.json({ ok: false, message: "Could not update online portal controls." }, { status: 500 });
  }
}
