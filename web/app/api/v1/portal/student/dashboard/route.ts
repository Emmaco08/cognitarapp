import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

function norm(s: unknown): string {
  return String(s || "").trim().toLowerCase();
}

export async function GET(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["student"]);
  if (!gate.ok) return gate.response;
  const { session, school } = gate;

  try {
    const sql = getSql();
    const [studentRows, settingsRows, examRows, attemptRows] = await Promise.all([
      sql`
        SELECT local_id, username, full_name, email, student_class, specialisation, status
        FROM portal_students
        WHERE school_id = ${session.schoolId}::uuid AND local_id = ${session.localId}
        LIMIT 1
      `,
      sql`
        SELECT school_name, school_motto, academic_session, current_term, default_result_visibility
        FROM portal_school_settings
        WHERE school_id = ${session.schoolId}::uuid
        LIMIT 1
      `,
      sql`
        SELECT e.local_id, e.name, e.exam_class, e.duration, e.active, e.specialisation, e.subject_tag,
               e.calculator_type, e.max_warnings, e.is_paused_all, e.result_release_policy, e.results_released,
               (SELECT COUNT(*)::int FROM portal_questions q WHERE q.school_id = e.school_id AND q.exam_local_id = e.local_id) AS question_count
        FROM portal_exams e
        WHERE e.school_id = ${session.schoolId}::uuid
          AND e.active = TRUE
          AND e.deactivated = FALSE
        ORDER BY e.local_id DESC
      `,
      sql`
        SELECT a.id, a.exam_local_id, e.name AS exam_name, e.exam_class, e.duration,
               a.score, a.total, a.percentage, a.grade_label, a.grade_remark,
               a.status, a.submitted, a.started_at, a.completed_at, a.authoritative_deadline,
               a.remaining_time, a.is_paused, a.results_released, a.origin, a.warnings_count
        FROM portal_attempts a
        LEFT JOIN portal_exams e ON e.school_id = a.school_id AND e.local_id = a.exam_local_id
        WHERE a.school_id = ${session.schoolId}::uuid AND a.student_local_id = ${session.localId}
        ORDER BY COALESCE(a.completed_at, a.started_at) DESC
      `,
    ]);

    const student = (studentRows[0] || {
      local_id: session.localId,
      username: session.username,
      full_name: session.fullName,
      student_class: session.studentClass || "",
      specialisation: session.specialisation || "",
    }) as Record<string, any>;

    const stClass = norm(student.student_class);
    const stSpec = norm(student.specialisation);

    const attemptByExam = new Map<number, Record<string, any>>();
    let totalWarnings = 0;
    for (const a of attemptRows as Record<string, any>[]) {
      attemptByExam.set(Number(a.exam_local_id), a);
      totalWarnings += Number(a.warnings_count || 0);
    }

    const availableExams = (examRows as Record<string, any>[])
      .filter((ex) => {
        if (Number(ex.question_count || 0) <= 0) return false;
        const exClass = norm(ex.exam_class);
        if (exClass && exClass !== "all" && stClass && exClass !== stClass) return false;
        const exSpec = norm(ex.specialisation);
        if (exSpec && exSpec !== "general" && exSpec !== "all" && stSpec && exSpec !== stSpec) return false;
        return true;
      })
      .map((ex) => {
        const att = attemptByExam.get(Number(ex.local_id));
        return {
          local_id: Number(ex.local_id),
          name: String(ex.name),
          exam_class: String(ex.exam_class || ""),
          duration: Number(ex.duration || 30),
          question_count: Number(ex.question_count || 0),
          calculator_type: String(ex.calculator_type || "none"),
          max_warnings: Number(ex.max_warnings || 5),
          is_paused: Boolean(ex.is_paused_all || att?.is_paused),
          attempt_status: att
            ? att.submitted
              ? "completed"
              : "in_progress"
            : "not_started",
          attempt_id: att ? String(att.id) : null,
        };
      });

    const completedResults = (attemptRows as Record<string, any>[])
      .filter((a) => Boolean(a.submitted))
      .map((a) => {
        const released = Boolean(a.results_released);
        return {
          attempt_id: String(a.id),
          exam_local_id: Number(a.exam_local_id),
          exam_name: String(a.exam_name || `Exam #${a.exam_local_id}`),
          completed_at: a.completed_at ? new Date(a.completed_at).toISOString() : null,
          results_released: released,
          score: released ? Number(a.score || 0) : null,
          total: released ? Number(a.total || 0) : null,
          percentage: released ? Number(a.percentage || 0) : null,
          grade_label: released ? String(a.grade_label || "") : null,
          grade_remark: released ? String(a.grade_remark || "") : null,
          origin: String(a.origin || "online"),
        };
      });

    const s = (settingsRows[0] || {}) as Record<string, any>;
    return NextResponse.json({
      ok: true,
      school: {
        school_code: school.school_code,
        school_name: String(s.school_name || school.school_name),
        school_motto: String(s.school_motto || ""),
        academic_session: String(s.academic_session || "2026/2027"),
        current_term: String(s.current_term || "First Term"),
        online_portal_notice: school.online_portal_notice,
      },
      student: {
        local_id: Number(student.local_id),
        username: String(student.username),
        full_name: String(student.full_name || student.username),
        student_class: String(student.student_class || ""),
        specialisation: String(student.specialisation || ""),
        warnings_count: totalWarnings,
      },
      available_exams: availableExams,
      completed_results: completedResults,
    });
  } catch (err) {
    console.error("Student dashboard GET error:", err);
    return NextResponse.json({ ok: false, message: "Could not load student dashboard." }, { status: 500 });
  }
}
