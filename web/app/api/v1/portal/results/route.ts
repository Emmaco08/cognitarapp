import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";
import { finalizePortalAttempt } from "@/lib/portal-grading";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["teacher", "admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const examIdParam = req.nextUrl.searchParams.get("exam_id");
    const examLocalId = examIdParam ? Number(examIdParam) : null;
    const sql = getSql();

    const rows =
      session.role === "admin"
        ? examLocalId && Number.isInteger(examLocalId)
          ? await sql`
              SELECT a.id, a.exam_local_id, e.name AS exam_name, e.exam_class,
                     a.student_local_id, COALESCE(s.full_name, s.username, 'Student #' || a.student_local_id) AS student_name,
                     s.username AS student_username, s.student_class,
                     a.score, a.total, a.percentage, a.grade_label, a.grade_remark,
                     a.status, a.submitted, a.started_at, a.completed_at, a.warnings_count,
                     a.is_paused, a.results_released, a.origin, a.synced_to_desktop
              FROM portal_attempts a
              LEFT JOIN portal_exams e ON e.school_id = a.school_id AND e.local_id = a.exam_local_id
              LEFT JOIN portal_students s ON s.school_id = a.school_id AND s.local_id = a.student_local_id
              WHERE a.school_id = ${session.schoolId}::uuid AND a.exam_local_id = ${examLocalId}
              ORDER BY COALESCE(a.completed_at, a.started_at) DESC
              LIMIT 400
            `
          : await sql`
              SELECT a.id, a.exam_local_id, e.name AS exam_name, e.exam_class,
                     a.student_local_id, COALESCE(s.full_name, s.username, 'Student #' || a.student_local_id) AS student_name,
                     s.username AS student_username, s.student_class,
                     a.score, a.total, a.percentage, a.grade_label, a.grade_remark,
                     a.status, a.submitted, a.started_at, a.completed_at, a.warnings_count,
                     a.is_paused, a.results_released, a.origin, a.synced_to_desktop
              FROM portal_attempts a
              LEFT JOIN portal_exams e ON e.school_id = a.school_id AND e.local_id = a.exam_local_id
              LEFT JOIN portal_students s ON s.school_id = a.school_id AND s.local_id = a.student_local_id
              WHERE a.school_id = ${session.schoolId}::uuid
              ORDER BY COALESCE(a.completed_at, a.started_at) DESC
              LIMIT 400
            `
        : await sql`
            SELECT a.id, a.exam_local_id, e.name AS exam_name, e.exam_class,
                   a.student_local_id, COALESCE(s.full_name, s.username, 'Student #' || a.student_local_id) AS student_name,
                   s.username AS student_username, s.student_class,
                   a.score, a.total, a.percentage, a.grade_label, a.grade_remark,
                   a.status, a.submitted, a.started_at, a.completed_at, a.warnings_count,
                   a.is_paused, a.results_released, a.origin, a.synced_to_desktop
            FROM portal_attempts a
            JOIN portal_exams e ON e.school_id = a.school_id AND e.local_id = a.exam_local_id
            LEFT JOIN portal_students s ON s.school_id = a.school_id AND s.local_id = a.student_local_id
            WHERE a.school_id = ${session.schoolId}::uuid
              AND (e.teacher_local_id = ${session.localId} OR e.teacher_local_id IS NULL)
              AND (${examLocalId && Number.isInteger(examLocalId) ? examLocalId : null}::int IS NULL OR a.exam_local_id = ${examLocalId && Number.isInteger(examLocalId) ? examLocalId : null}::int)
            ORDER BY COALESCE(a.completed_at, a.started_at) DESC
            LIMIT 400
          `;

    return NextResponse.json({ ok: true, results: rows });
  } catch (err) {
    console.error("Portal results GET error:", err);
    return NextResponse.json({ ok: false, message: "Could not load results." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["teacher", "admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const attemptId = String(body?.attempt_id || "").trim();
    const action = String(body?.action || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(attemptId)) {
      return NextResponse.json({ ok: false, message: "Invalid attempt ID." }, { status: 400 });
    }

    const sql = getSql();
    if (action === "force_submit") {
      const graded = await finalizePortalAttempt({
        schoolId: session.schoolId,
        attemptId,
        autoSubmitted: true,
      });
      return NextResponse.json({ ok: true, graded, message: "Attempt force-submitted and graded." });
    }
    if (action === "toggle_release") {
      const released = Boolean(body?.results_released);
      await sql`
        UPDATE portal_attempts
        SET results_released = ${released}, updated_at = NOW()
        WHERE id = ${attemptId}::uuid AND school_id = ${session.schoolId}::uuid
      `;
      return NextResponse.json({ ok: true, message: released ? "Score released to student." : "Score withheld." });
    }
    return NextResponse.json({ ok: false, message: "Unsupported action." }, { status: 400 });
  } catch (err) {
    console.error("Portal results POST error:", err);
    return NextResponse.json({ ok: false, message: "Action failed." }, { status: 500 });
  }
}
