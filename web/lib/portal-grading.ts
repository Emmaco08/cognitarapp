import { getSql } from "./db";
import { computePortalGrade, GradingRule } from "./portal-sync";

function normAnswer(v: unknown): string {
  return String(v || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveCorrectOptionValue(q: {
  answer: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
}): string {
  const ans = normAnswer(q.answer);
  if (!ans) return "";
  const upper = ans.toUpperCase();
  const opts = [q.option1, q.option2, q.option3, q.option4];
  // If answer literally matches one of the 4 option texts, return that option text
  for (const opt of opts) {
    if (normAnswer(opt) === ans) return opt;
  }
  // If answer is stored as A/B/C/D or option1..option4
  const map: Record<string, string> = {
    A: q.option1,
    B: q.option2,
    C: q.option3,
    D: q.option4,
    OPTION1: q.option1,
    OPTION2: q.option2,
    OPTION3: q.option3,
    OPTION4: q.option4,
  };
  if (map[upper]) return map[upper];
  return q.answer;
}

export function isStudentAnswerCorrect(
  selected: unknown,
  q: { answer: string; option1: string; option2: string; option3: string; option4: string }
): boolean {
  const sel = normAnswer(selected);
  if (!sel) return false;
  const correctVal = normAnswer(resolveCorrectOptionValue(q));
  if (!correctVal) return false;
  if (sel === correctVal) return true;
  // Strip basic HTML tags fallback in case whitespace/spans differ slightly
  const strip = (s: string) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  return strip(sel) !== "" && strip(sel) === strip(correctVal);
}

/**
 * Grades and finalizes a `portal_attempts` row server-side using the school's grading scale.
 * Idempotent: if already submitted, returns the existing scored attempt without double-grading.
 */
export async function finalizePortalAttempt(params: {
  schoolId: string;
  attemptId: string;
  finalAnswers?: Record<string, string> | null;
  warningsCount?: number;
  autoSubmitted?: boolean;
}) {
  const sql = getSql();
  const rows = await sql`
    SELECT a.*, e.result_release_policy, e.results_released AS exam_results_released,
           s.grading_rules_json, s.default_result_visibility
    FROM portal_attempts a
    JOIN portal_exams e ON e.school_id = a.school_id AND e.local_id = a.exam_local_id
    LEFT JOIN portal_school_settings s ON s.school_id = a.school_id
    WHERE a.id = ${params.attemptId}::uuid AND a.school_id = ${params.schoolId}::uuid
    LIMIT 1
  `;
  if (!rows.length) {
    throw new Error("Attempt not found.");
  }
  const att = rows[0] as Record<string, any>;
  if (att.submitted) {
    return {
      already_submitted: true,
      attempt_id: String(att.id),
      score: Number(att.score || 0),
      total: Number(att.total || 0),
      percentage: Number(att.percentage || 0),
      grade_label: String(att.grade_label || ""),
      grade_remark: String(att.grade_remark || ""),
      results_released: Boolean(att.results_released),
      status: String(att.status || "completed"),
    };
  }

  const existingAnswers: Record<string, string> =
    att.answers_json && typeof att.answers_json === "object" ? { ...att.answers_json } : {};
  if (params.finalAnswers && typeof params.finalAnswers === "object") {
    for (const [k, v] of Object.entries(params.finalAnswers)) {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        existingAnswers[String(k)] = String(v);
      }
    }
  }

  const orderIds: number[] = Array.isArray(att.question_order_json)
    ? att.question_order_json.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))
    : [];

  const qRows = orderIds.length
    ? await sql`
        SELECT local_id, answer, option1, option2, option3, option4
        FROM portal_questions
        WHERE school_id = ${params.schoolId}::uuid
          AND exam_local_id = ${Number(att.exam_local_id)}
          AND local_id = ANY(${orderIds}::int[])
      `
    : await sql`
        SELECT local_id, answer, option1, option2, option3, option4
        FROM portal_questions
        WHERE school_id = ${params.schoolId}::uuid
          AND exam_local_id = ${Number(att.exam_local_id)}
      `;

  let correctCount = 0;
  const totalCount = qRows.length;
  for (const q of qRows as Record<string, any>[]) {
    const sel = existingAnswers[String(q.local_id)];
    if (
      isStudentAnswerCorrect(sel, {
        answer: String(q.answer || ""),
        option1: String(q.option1 || ""),
        option2: String(q.option2 || ""),
        option3: String(q.option3 || ""),
        option4: String(q.option4 || ""),
      })
    ) {
      correctCount++;
    }
  }

  const percentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 10000) / 100 : 0;
  const rules = Array.isArray(att.grading_rules_json) ? (att.grading_rules_json as GradingRule[]) : null;
  const { grade_label, grade_remark } = computePortalGrade(percentage, rules);

  const policy = String(att.result_release_policy || att.default_result_visibility || "immediate").toLowerCase();
  const showNow = policy !== "withheld" && Boolean(att.exam_results_released ?? true);
  const finalStatus = params.autoSubmitted ? "auto_submitted" : "completed";
  const finalWarnings =
    typeof params.warningsCount === "number" && Number.isFinite(params.warningsCount)
      ? Math.max(Number(att.warnings_count || 0), Math.floor(params.warningsCount))
      : Number(att.warnings_count || 0);

  await sql`
    UPDATE portal_attempts
    SET score = ${correctCount},
        total = ${totalCount},
        percentage = ${percentage},
        grade_label = ${grade_label},
        grade_remark = ${grade_remark},
        status = ${finalStatus},
        submitted = TRUE,
        completed_at = NOW(),
        remaining_time = 0,
        warnings_count = ${finalWarnings},
        results_released = ${showNow},
        answers_json = ${JSON.stringify(existingAnswers)}::jsonb,
        origin = 'online',
        synced_to_desktop = FALSE,
        updated_at = NOW()
    WHERE id = ${params.attemptId}::uuid AND school_id = ${params.schoolId}::uuid
  `;

  return {
    already_submitted: false,
    attempt_id: String(att.id),
    score: correctCount,
    total: totalCount,
    percentage,
    grade_label,
    grade_remark,
    results_released: showNow,
    status: finalStatus,
  };
}
