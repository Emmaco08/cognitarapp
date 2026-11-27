import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";
import { finalizePortalAttempt } from "@/lib/portal-grading";

export const dynamic = "force-dynamic";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ examId: string }> }
) {
  const gate = await requirePortalAccess(req, ["student"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const { examId } = await context.params;
    const examLocalId = Number(examId);
    if (!Number.isInteger(examLocalId) || examLocalId <= 0) {
      return NextResponse.json({ ok: false, message: "Invalid exam ID." }, { status: 400 });
    }

    const sql = getSql();
    const examRows = await sql`
      SELECT * FROM portal_exams
      WHERE school_id = ${session.schoolId}::uuid
        AND local_id = ${examLocalId}
        AND active = TRUE
        AND deactivated = FALSE
      LIMIT 1
    `;
    if (!examRows.length) {
      return NextResponse.json({ ok: false, message: "This exam is not currently active." }, { status: 404 });
    }
    const exam = examRows[0] as Record<string, any>;

    // Load all questions, sections, and passage groups in one parallel round-trip
    const [allQuestions, sections, groups, existingAttempts] = await Promise.all([
      sql`
        SELECT local_id, section_local_id, group_local_id, question, option1, option2, option3, option4, display_order, mandatory
        FROM portal_questions
        WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examLocalId}
        ORDER BY display_order ASC, local_id ASC
      `,
      sql`
        SELECT local_id, section_name, questions_to_show, randomize, section_order, active
        FROM portal_exam_sections
        WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examLocalId} AND active = TRUE
        ORDER BY section_order ASC, local_id ASC
      `,
      sql`
        SELECT local_id, section_local_id, group_name, group_type, group_content, instruction_text, display_order
        FROM portal_exam_groups
        WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examLocalId}
        ORDER BY display_order ASC, local_id ASC
      `,
      sql`
        SELECT * FROM portal_attempts
        WHERE school_id = ${session.schoolId}::uuid
          AND student_local_id = ${session.localId}
          AND exam_local_id = ${examLocalId}
        LIMIT 1
      `,
    ]);

    if (!allQuestions.length) {
      return NextResponse.json({ ok: false, message: "This exam has no questions yet." }, { status: 400 });
    }

    const qById = new Map<number, Record<string, any>>();
    for (const q of allQuestions as Record<string, any>[]) {
      qById.set(Number(q.local_id), q);
    }

    let attempt = existingAttempts[0] as Record<string, any> | undefined;

    // Already submitted? Return clean score state immediately
    if (attempt?.submitted) {
      return NextResponse.json({
        ok: true,
        already_submitted: true,
        result: {
          attempt_id: String(attempt.id),
          score: attempt.results_released ? Number(attempt.score || 0) : null,
          total: attempt.results_released ? Number(attempt.total || 0) : null,
          percentage: attempt.results_released ? Number(attempt.percentage || 0) : null,
          grade_label: attempt.results_released ? String(attempt.grade_label || "") : null,
          grade_remark: attempt.results_released ? String(attempt.grade_remark || "") : null,
          results_released: Boolean(attempt.results_released),
        },
      });
    }

    const nowMs = Date.now();
    const durationSec = Math.max(60, Number(exam.duration || 30) * 60);

    if (!attempt) {
      // Build deterministic-for-this-attempt question order honoring sections, mandatory flag & questions_to_show
      let selectedOrder: number[] = [];
      if (sections.length) {
        for (const sec of sections as Record<string, any>[]) {
          const secQs = (allQuestions as Record<string, any>[]).filter(
            (q) => Number(q.section_local_id) === Number(sec.local_id)
          );
          const mandatoryQs = secQs.filter((q) => Boolean(q.mandatory));
          const optionalQs = secQs.filter((q) => !q.mandatory);
          const limit = Number(sec.questions_to_show || 0);
          let chosen: Record<string, any>[];
          if (limit > 0 && limit < secQs.length) {
            const pool = sec.randomize ? shuffle(optionalQs) : optionalQs;
            chosen = [...mandatoryQs, ...pool.slice(0, Math.max(0, limit - mandatoryQs.length))];
          } else {
            chosen = sec.randomize ? shuffle(secQs) : secQs;
          }
          selectedOrder.push(...chosen.map((q) => Number(q.local_id)));
        }
        // Append any unsectioned questions cleanly if sections existed but left orphan questions
        const seen = new Set(selectedOrder);
        for (const q of allQuestions as Record<string, any>[]) {
          if (q.section_local_id == null && !seen.has(Number(q.local_id))) {
            selectedOrder.push(Number(q.local_id));
          }
        }
      }
      if (!selectedOrder.length) {
        selectedOrder = (allQuestions as Record<string, any>[]).map((q) => Number(q.local_id));
      }

      // Shuffle A-D options per question cleanly per student
      const optionShuffle: Record<string, string[]> = {};
      for (const qid of selectedOrder) {
        const q = qById.get(qid);
        if (!q) continue;
        const opts = [q.option1, q.option2, q.option3, q.option4]
          .map((o) => String(o || ""))
          .filter((o) => o.trim() !== "");
        optionShuffle[String(qid)] = shuffle(opts);
      }

      const deadlineIso = new Date(nowMs + durationSec * 1000).toISOString();
      const inserted = await sql`
        INSERT INTO portal_attempts (
          school_id, student_local_id, exam_local_id, total, status, submitted,
          started_at, authoritative_deadline, remaining_time, warnings_count,
          is_paused, force_submit, results_released, answers_json,
          question_order_json, option_shuffle_json, origin, synced_to_desktop, updated_at
        ) VALUES (
          ${session.schoolId}::uuid,
          ${session.localId},
          ${examLocalId},
          ${selectedOrder.length},
          'in_progress',
          FALSE,
          NOW(),
          ${deadlineIso}::timestamptz,
          ${durationSec},
          0,
          FALSE,
          FALSE,
          ${String(exam.result_release_policy || "immediate") !== "withheld"},
          '{}'::jsonb,
          ${JSON.stringify(selectedOrder)}::jsonb,
          ${JSON.stringify(optionShuffle)}::jsonb,
          'online',
          FALSE,
          NOW()
        )
        RETURNING *
      `;
      attempt = inserted[0] as Record<string, any>;
    }

    // Check if deadline already expired while resuming -> auto-submit immediately!
    const deadlineMs = attempt.authoritative_deadline
      ? new Date(attempt.authoritative_deadline).getTime()
      : nowMs + durationSec * 1000;
    const isPaused = Boolean(exam.is_paused_all || attempt.is_paused);
    const remainingSec = isPaused
      ? Math.max(0, Number(attempt.remaining_time || 0))
      : Math.max(0, Math.floor((deadlineMs - nowMs) / 1000));

    if (!isPaused && (remainingSec <= 0 || Boolean(attempt.force_submit))) {
      const graded = await finalizePortalAttempt({
        schoolId: session.schoolId,
        attemptId: String(attempt.id),
        autoSubmitted: true,
      });
      return NextResponse.json({
        ok: true,
        already_submitted: true,
        time_expired: true,
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

    const orderIds: number[] = Array.isArray(attempt.question_order_json) && attempt.question_order_json.length
      ? attempt.question_order_json.map((n: unknown) => Number(n))
      : (allQuestions as Record<string, any>[]).map((q) => Number(q.local_id));
    const optMap: Record<string, string[]> =
      attempt.option_shuffle_json && typeof attempt.option_shuffle_json === "object"
        ? attempt.option_shuffle_json
        : {};

    const groupById = new Map<number, Record<string, any>>();
    for (const g of groups as Record<string, any>[]) {
      groupById.set(Number(g.local_id), g);
    }
    const secById = new Map<number, string>();
    for (const s of sections as Record<string, any>[]) {
      secById.set(Number(s.local_id), String(s.section_name || ""));
    }

    const orderedQuestions = orderIds
      .map((qid) => qById.get(qid))
      .filter((q): q is Record<string, any> => Boolean(q))
      .map((q, idx) => {
        const defaultOpts = [q.option1, q.option2, q.option3, q.option4]
          .map((o) => String(o || ""))
          .filter((o) => o.trim() !== "");
        const opts = Array.isArray(optMap[String(q.local_id)]) && optMap[String(q.local_id)].length
          ? optMap[String(q.local_id)]
          : defaultOpts;
        const grp = q.group_local_id != null ? groupById.get(Number(q.group_local_id)) : null;
        return {
          index: idx,
          local_id: Number(q.local_id),
          section_name: q.section_local_id != null ? secById.get(Number(q.section_local_id)) || "" : "",
          passage: grp
            ? {
                name: String(grp.group_name || ""),
                content: String(grp.group_content || ""),
                instruction: String(grp.instruction_text || ""),
              }
            : null,
          question: String(q.question || ""),
          options: opts,
        };
      });

    return NextResponse.json({
      ok: true,
      already_submitted: false,
      attempt: {
        id: String(attempt.id),
        exam_local_id: examLocalId,
        exam_name: String(exam.name),
        exam_class: String(exam.exam_class || ""),
        duration_minutes: Number(exam.duration || 30),
        calculator_type: String(exam.calculator_type || "none"),
        max_warnings: Number(exam.max_warnings || 5),
        anti_cheating_profile: String(exam.anti_cheating_profile || "medium"),
        warnings_count: Number(attempt.warnings_count || 0),
        remaining_seconds: remainingSec,
        authoritative_deadline: attempt.authoritative_deadline
          ? new Date(attempt.authoritative_deadline).toISOString()
          : new Date(nowMs + remainingSec * 1000).toISOString(),
        is_paused: isPaused,
        answers: attempt.answers_json && typeof attempt.answers_json === "object" ? attempt.answers_json : {},
      },
      questions: orderedQuestions,
    });
  } catch (err) {
    console.error("Student start exam error:", err);
    return NextResponse.json({ ok: false, message: "Could not start examination." }, { status: 500 });
  }
}
