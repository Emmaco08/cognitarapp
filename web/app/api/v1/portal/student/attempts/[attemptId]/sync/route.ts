import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";
import { finalizePortalAttempt } from "@/lib/portal-grading";

export const dynamic = "force-dynamic";

/**
 * Low-frequency batched answer sync (called ~every 45s when dirty, on tab warning, or pagehide).
 * Keeps Free Vercel Hobby invocations tiny (~6-8 calls per student per 60-min exam).
 */
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
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const answersPatch =
      body.answers && typeof body.answers === "object" ? (body.answers as Record<string, string>) : null;
    const warningsIn =
      typeof body.warnings_count === "number" && Number.isFinite(body.warnings_count)
        ? Math.max(0, Math.floor(body.warnings_count))
        : null;

    const sql = getSql();
    const rows = await sql`
      SELECT a.*, e.is_paused_all, e.max_warnings
      FROM portal_attempts a
      JOIN portal_exams e ON e.school_id = a.school_id AND e.local_id = a.exam_local_id
      WHERE a.id = ${attemptId}::uuid
        AND a.school_id = ${session.schoolId}::uuid
        AND a.student_local_id = ${session.localId}
      LIMIT 1
    `;
    if (!rows.length) {
      return NextResponse.json({ ok: false, message: "Exam session not found." }, { status: 404 });
    }
    const att = rows[0] as Record<string, any>;
    if (att.submitted) {
      return NextResponse.json({
        ok: true,
        submitted: true,
        result: {
          attempt_id: String(att.id),
          score: att.results_released ? Number(att.score || 0) : null,
          total: att.results_released ? Number(att.total || 0) : null,
          percentage: att.results_released ? Number(att.percentage || 0) : null,
          grade_label: att.results_released ? String(att.grade_label || "") : null,
          grade_remark: att.results_released ? String(att.grade_remark || "") : null,
          results_released: Boolean(att.results_released),
        },
      });
    }

    const mergedAnswers: Record<string, string> =
      att.answers_json && typeof att.answers_json === "object" ? { ...att.answers_json } : {};
    if (answersPatch) {
      for (const [k, v] of Object.entries(answersPatch)) {
        if (v !== undefined && v !== null) mergedAnswers[String(k)] = String(v);
      }
    }

    const nextWarnings =
      warningsIn !== null ? Math.max(Number(att.warnings_count || 0), warningsIn) : Number(att.warnings_count || 0);
    const maxWarnings = Math.max(1, Number(att.max_warnings || 5));
    const isPaused = Boolean(att.is_paused_all || att.is_paused);
    const nowMs = Date.now();
    const deadlineMs = att.authoritative_deadline ? new Date(att.authoritative_deadline).getTime() : nowMs + 60_000;
    const remainingSec = isPaused
      ? Math.max(0, Number(att.remaining_time || 0))
      : Math.max(0, Math.floor((deadlineMs - nowMs) / 1000));

    // Auto-submit if force_submit, max warnings hit, or deadline passed
    if (Boolean(att.force_submit) || (!isPaused && remainingSec <= 0) || nextWarnings >= maxWarnings) {
      const graded = await finalizePortalAttempt({
        schoolId: session.schoolId,
        attemptId,
        finalAnswers: mergedAnswers,
        warningsCount: nextWarnings,
        autoSubmitted: true,
      });
      return NextResponse.json({
        ok: true,
        submitted: true,
        auto_submitted: true,
        reason: att.force_submit ? "force_submit" : nextWarnings >= maxWarnings ? "max_warnings" : "time_up",
        result: {
          attempt_id: graded.attempt_id,
          score: graded.results_released ? graded.score : null,
          total: graded.results_released ? graded.total : null,
          percentage: graded.results_released ? graded.percentage : null,
          grade_label: graded.results_released ? graded.grade_label : null,
          grade_remark: graded.results_released ? graded.grade_remark : null,
          results_released: graded.results_released,
        },
      });
    }

    await sql`
      UPDATE portal_attempts
      SET answers_json = ${JSON.stringify(mergedAnswers)}::jsonb,
          warnings_count = ${nextWarnings},
          remaining_time = ${remainingSec},
          updated_at = NOW()
      WHERE id = ${attemptId}::uuid AND school_id = ${session.schoolId}::uuid
    `;

    return NextResponse.json({
      ok: true,
      submitted: false,
      is_paused: isPaused,
      remaining_seconds: remainingSec,
      warnings_count: nextWarnings,
      saved_count: Object.keys(mergedAnswers).length,
    });
  } catch (err) {
    console.error("Student sync error:", err);
    return NextResponse.json({ ok: false, message: "Could not sync exam answers." }, { status: 500 });
  }
}
