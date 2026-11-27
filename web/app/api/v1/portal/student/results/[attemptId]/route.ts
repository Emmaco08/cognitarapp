import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  const gate = await requirePortalAccess(req, ["student"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const { attemptId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) {
    return NextResponse.json({ ok: false, message: "Invalid attempt ID." }, { status: 400 });
  }

  const sql = getSql();
  const [rows, sRows] = await Promise.all([
    sql`
      SELECT a.id, a.exam_local_id, a.score, a.total, a.percentage, a.grade_label, a.grade_remark,
             a.submitted, a.results_released, a.completed_at,
             e.name AS exam_name, e.result_release_policy, e.results_released AS exam_results_released
      FROM portal_attempts a
      LEFT JOIN portal_exams e ON e.school_id = a.school_id AND e.local_id = a.exam_local_id
      WHERE a.id = ${attemptId}::uuid
        AND a.school_id = ${session.schoolId}::uuid
        AND a.student_local_id = ${session.localId}
      LIMIT 1
    `,
    sql`SELECT school_name, current_term, academic_session FROM portal_school_settings WHERE school_id = ${session.schoolId}::uuid LIMIT 1`,
  ]);

  if (!rows.length) {
    return NextResponse.json({ ok: false, message: "Result record not found." }, { status: 404 });
  }
  const r = rows[0] as Record<string, any>;
  const released = Boolean(r.results_released) && (r.result_release_policy !== "withheld" || Boolean(r.exam_results_released));

  return NextResponse.json({
    ok: true,
    school: {
      school_name: String(sRows[0]?.school_name || "CogniTara School"),
      current_term: String(sRows[0]?.current_term || "First Term"),
      academic_session: String(sRows[0]?.academic_session || "2026/2027"),
    },
    result: {
      attempt_id: String(r.id),
      exam_name: String(r.exam_name || "Examination"),
      results_released: released,
      score: released ? Number(r.score || 0) : null,
      total: released ? Number(r.total || 0) : null,
      percentage: released ? Number(r.percentage || 0) : null,
      grade_label: released ? String(r.grade_label || "") : null,
      grade_remark: released ? String(r.grade_remark || "") : null,
      completed_at: r.completed_at,
    },
  });
}
