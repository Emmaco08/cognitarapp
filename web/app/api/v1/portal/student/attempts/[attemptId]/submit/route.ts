import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";
import { finalizePortalAttempt } from "@/lib/portal-grading";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  const gate = await requirePortalAccess(req, ["student"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const { attemptId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(attemptId)) {
      return NextResponse.json({ ok: false, message: "Invalid attempt ID." }, { status: 400 });
    }

    const sql = getSql();
    const owns = await sql`
      SELECT id FROM portal_attempts
      WHERE id = ${attemptId}::uuid
        AND school_id = ${session.schoolId}::uuid
        AND student_local_id = ${session.localId}
      LIMIT 1
    `;
    if (!owns.length) {
      return NextResponse.json({ ok: false, message: "Attempt not found." }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const answers =
      body.answers && typeof body.answers === "object" ? (body.answers as Record<string, string>) : null;
    const warningsCount =
      typeof body.warnings_count === "number" && Number.isFinite(body.warnings_count)
        ? Math.max(0, Math.floor(body.warnings_count))
        : undefined;

    const graded = await finalizePortalAttempt({
      schoolId: session.schoolId,
      attemptId,
      finalAnswers: answers,
      warningsCount,
      autoSubmitted: Boolean(body.auto_submitted),
    });

    return NextResponse.json({
      ok: true,
      result: {
        attempt_id: graded.attempt_id,
        score: graded.results_released ? graded.score : null,
        total: graded.results_released ? graded.total : null,
        percentage: graded.results_released ? graded.percentage : null,
        grade_label: graded.results_released ? graded.grade_label : null,
        grade_remark: graded.results_released ? graded.grade_remark : null,
        results_released: graded.results_released,
        status: graded.status,
      },
    });
  } catch (err) {
    console.error("Student submit error:", err);
    return NextResponse.json({ ok: false, message: "Could not submit examination." }, { status: 500 });
  }
}
