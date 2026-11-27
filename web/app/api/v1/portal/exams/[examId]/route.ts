import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";
import { logPortalAudit } from "@/lib/portal-audit";

export const dynamic = "force-dynamic";

async function loadOwnedExam(schoolId: string, examLocalId: number, role: string, localId: number) {
  const sql = getSql();
  const rows = await sql`
    SELECT e.*, t.full_name AS teacher_name
    FROM portal_exams e
    LEFT JOIN portal_teachers t ON t.school_id = e.school_id AND t.local_id = e.teacher_local_id
    WHERE e.school_id = ${schoolId}::uuid AND e.local_id = ${examLocalId}
    LIMIT 1
  `;
  if (!rows.length) return { ok: false as const, status: 404, message: "Examination not found." };
  const exam = rows[0] as Record<string, any>;
  if (role === "teacher" && Number(exam.teacher_local_id) !== localId) {
    return { ok: false as const, status: 403, message: "You can only manage your own examinations." };
  }
  return { ok: true as const, exam };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ examId: string }> }
) {
  const gate = await requirePortalAccess(req, ["admin", "teacher"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const { examId } = await context.params;
  const examLocalId = Number(examId);
  if (!Number.isInteger(examLocalId)) {
    return NextResponse.json({ ok: false, message: "Invalid exam ID." }, { status: 400 });
  }

  const check = await loadOwnedExam(session.schoolId, examLocalId, session.role, session.localId);
  if (!check.ok) return NextResponse.json({ ok: false, message: check.message }, { status: check.status });

  const sql = getSql();
  const [sections, groups, questions, attempts, settingsRows] = await Promise.all([
    sql`
      SELECT local_id, section_name, questions_to_show, randomize, section_order, active
      FROM portal_exam_sections
      WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examLocalId}
      ORDER BY section_order ASC, local_id ASC
    `,
    sql`
      SELECT local_id, section_local_id, group_name, group_type, group_content, instruction_text, display_order
      FROM portal_exam_groups
      WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examLocalId}
      ORDER BY display_order ASC, local_id ASC
    `,
    sql`
      SELECT local_id, section_local_id, group_local_id, question, option1, option2, option3, option4,
             answer, explanation, display_order, mandatory
      FROM portal_questions
      WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examLocalId}
      ORDER BY display_order ASC, local_id ASC
    `,
    sql`
      SELECT a.id, a.student_local_id, a.score, a.total, a.percentage, a.grade_label, a.grade_remark,
             a.status, a.submitted, a.started_at, a.completed_at, a.warnings_count,
             a.is_paused, a.results_released, a.answers_json, a.time_spent_seconds,
             s.full_name AS student_name, s.username AS student_username, s.student_class
      FROM portal_attempts a
      LEFT JOIN portal_students s ON s.school_id = a.school_id AND s.local_id = a.student_local_id
      WHERE a.school_id = ${session.schoolId}::uuid AND a.exam_local_id = ${examLocalId}
      ORDER BY a.submitted DESC, a.percentage DESC, a.started_at DESC
    `,
    sql`SELECT classes_json, anti_cheating_profile, max_warnings FROM portal_school_settings WHERE school_id = ${session.schoolId}::uuid LIMIT 1`,
  ]);

  const completed = (attempts as Record<string, any>[]).filter((a) => a.submitted);
  const activeNow = (attempts as Record<string, any>[]).filter((a) => !a.submitted);

  // Per-question difficulty & section accuracy
  const sectionMap = new Map<number, string>();
  for (const s of sections as Record<string, any>[]) {
    sectionMap.set(Number(s.local_id), String(s.section_name || "Section"));
  }

  const questionStats = (questions as Record<string, any>[]).map((q) => {
    let answered = 0;
    let wrong = 0;
    const correctAns = String(q.answer || "").trim();
    for (const att of completed) {
      const ansObj = att.answers_json && typeof att.answers_json === "object" ? att.answers_json : {};
      const given = ansObj[String(q.local_id)];
      if (given !== undefined && given !== null && String(given).trim() !== "") {
        answered++;
        if (String(given).trim() !== correctAns) wrong++;
      }
    }
    const errorRate = answered > 0 ? Math.round((wrong / answered) * 100) : 0;
    return {
      local_id: Number(q.local_id),
      question: String(q.question || ""),
      section_name: q.section_local_id ? sectionMap.get(Number(q.section_local_id)) || "General" : "General",
      answered_count: answered,
      error_rate: errorRate,
      difficulty: errorRate >= 60 ? "Very Hard" : errorRate >= 35 ? "Moderate" : "Accessible",
    };
  });

  // Grade buckets
  const gradeBuckets: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const a of completed) {
    const pct = Number(a.percentage || 0);
    const g = String(a.grade_label || "").trim().toUpperCase()[0];
    if (g && gradeBuckets[g] !== undefined) gradeBuckets[g]++;
    else if (pct >= 75) gradeBuckets.A++;
    else if (pct >= 65) gradeBuckets.B++;
    else if (pct >= 55) gradeBuckets.C++;
    else if (pct >= 45) gradeBuckets.D++;
    else gradeBuckets.F++;
  }

  // Section accuracy
  const secStatsMap = new Map<string, { name: string; total: number; wrong: number; qCount: number }>();
  for (const qs of questionStats) {
    const cur = secStatsMap.get(qs.section_name) || { name: qs.section_name, total: 0, wrong: 0, qCount: 0 };
    cur.qCount++;
    cur.total += qs.answered_count;
    cur.wrong += Math.round((qs.error_rate / 100) * qs.answered_count);
    secStatsMap.set(qs.section_name, cur);
  }
  const sectionAccuracy = Array.from(secStatsMap.values()).map((s) => ({
    name: s.name,
    questions: s.qCount,
    accuracy: s.total > 0 ? Math.round(((s.total - s.wrong) / s.total) * 100) : 0,
  }));

  const scores = completed.map((a) => Number(a.percentage || 0));
  const avgScore = scores.length ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10 : 0;
  const passCount = scores.filter((s) => s >= 50).length;
  const passRate = scores.length ? Math.round((passCount / scores.length) * 1000) / 10 : 0;
  const minScore = scores.length ? Math.min(...scores) : 0;
  const maxScore = scores.length ? Math.max(...scores) : 0;

  return NextResponse.json({
    ok: true,
    exam: check.exam,
    sections,
    groups,
    questions,
    attempts,
    active_count: activeNow.length,
    classes:
      Array.isArray(settingsRows[0]?.classes_json) && settingsRows[0].classes_json.length
        ? settingsRows[0].classes_json
        : ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"],
    school_policy: {
      anti_cheating_profile: String(settingsRows[0]?.anti_cheating_profile || "medium"),
      max_warnings: Number(settingsRows[0]?.max_warnings || 5),
    },
    analytics: {
      completed_count: completed.length,
      average_score: avgScore,
      pass_rate: passRate,
      min_score: Math.round(minScore),
      max_score: Math.round(maxScore),
      grade_buckets: gradeBuckets,
      section_accuracy: sectionAccuracy,
      challenging_questions: [...questionStats].sort((a, b) => b.error_rate - a.error_rate).slice(0, 10),
      rankings: completed.slice(0, 25),
      fastest: [...completed]
        .filter((a) => Number(a.time_spent_seconds || 0) > 0 || (a.started_at && a.completed_at))
        .map((a) => {
          const secs =
            Number(a.time_spent_seconds || 0) > 0
              ? Number(a.time_spent_seconds)
              : a.started_at && a.completed_at
              ? Math.max(10, Math.floor((new Date(a.completed_at).getTime() - new Date(a.started_at).getTime()) / 1000))
              : 0;
          return { ...a, duration_seconds: secs };
        })
        .sort((a, b) => a.duration_seconds - b.duration_seconds)
        .slice(0, 15),
    },
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ examId: string }> }
) {
  const gate = await requirePortalAccess(req, ["admin", "teacher"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const { examId } = await context.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });

  const sql = getSql();
  const action = String(body.action || "update_settings");

  // Bulk exam actions (when examId === "bulk")
  if (examId === "bulk") {
    if (session.role !== "admin") {
      return NextResponse.json({ ok: false, message: "Admin privileges required for bulk actions." }, { status: 403 });
    }
    const ids = Array.isArray(body.exam_ids) ? body.exam_ids.map(Number).filter(Number.isInteger) : [];
    if (!ids.length) return NextResponse.json({ ok: false, message: "Select at least one examination." }, { status: 400 });

    for (const id of ids) {
      if (action === "bulk_start") {
        await sql`UPDATE portal_exams SET active = TRUE, deactivated = FALSE, updated_at = NOW() WHERE school_id = ${session.schoolId}::uuid AND local_id = ${id}`;
      } else if (action === "bulk_stop") {
        await sql`UPDATE portal_exams SET active = FALSE, updated_at = NOW() WHERE school_id = ${session.schoolId}::uuid AND local_id = ${id}`;
      } else if (action === "bulk_deactivate") {
        await sql`UPDATE portal_exams SET active = FALSE, deactivated = TRUE, deactivated_at = NOW(), deactivation_note = ${String(body.note || "")}, updated_at = NOW() WHERE school_id = ${session.schoolId}::uuid AND local_id = ${id}`;
      } else if (action === "bulk_reactivate") {
        await sql`UPDATE portal_exams SET deactivated = FALSE, deactivation_note = '', updated_at = NOW() WHERE school_id = ${session.schoolId}::uuid AND local_id = ${id}`;
      } else if (action === "bulk_delete") {
        await sql`DELETE FROM portal_questions WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${id}`;
        await sql`DELETE FROM portal_exam_groups WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${id}`;
        await sql`DELETE FROM portal_exam_sections WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${id}`;
        await sql`DELETE FROM portal_attempts WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${id}`;
        await sql`DELETE FROM portal_exams WHERE school_id = ${session.schoolId}::uuid AND local_id = ${id}`;
      }
    }
    await logPortalAudit({
      schoolId: session.schoolId,
      actorRole: "admin",
      actorUsername: session.username,
      action: `Bulk exam action (${action})`,
      details: `${ids.length} examination(s)`,
    });
    return NextResponse.json({ ok: true, message: `Updated ${ids.length} examination(s).` });
  }

  const examLocalId = Number(examId);
  if (!Number.isInteger(examLocalId)) {
    return NextResponse.json({ ok: false, message: "Invalid exam ID." }, { status: 400 });
  }
  const check = await loadOwnedExam(session.schoolId, examLocalId, session.role, session.localId);
  if (!check.ok) return NextResponse.json({ ok: false, message: check.message }, { status: check.status });

  // Section management
  if (action === "add_section") {
    const secName = String(body.section_name || "").trim().slice(0, 120);
    if (!secName) return NextResponse.json({ ok: false, message: "Section name required." }, { status: 400 });
    const qToShow = Math.max(0, Math.floor(Number(body.questions_to_show || 0)));
    const randomize = Boolean(body.randomize);
    const maxRows = await sql`
      SELECT GREATEST(100000, COALESCE(MAX(local_id), 100000))::int AS max_id,
             COALESCE(MAX(section_order), 0)::int AS max_ord
      FROM portal_exam_sections WHERE school_id = ${session.schoolId}::uuid
    `;
    const nextId = Number(maxRows[0]?.max_id || 100000) + 1;
    const nextOrd = Number(maxRows[0]?.max_ord || 0) + 1;
    await sql`
      INSERT INTO portal_exam_sections (school_id, local_id, exam_local_id, section_name, questions_to_show, randomize, section_order, active)
      VALUES (${session.schoolId}::uuid, ${nextId}, ${examLocalId}, ${secName}, ${qToShow}, ${randomize}, ${nextOrd}, TRUE)
    `;
    return NextResponse.json({ ok: true, section_local_id: nextId, message: `Section "${secName}" added.` });
  }

  if (action === "update_section") {
    const secId = Number(body.section_local_id);
    if (!Number.isInteger(secId)) return NextResponse.json({ ok: false, message: "Invalid section ID." }, { status: 400 });
    await sql`
      UPDATE portal_exam_sections
      SET section_name = COALESCE(NULLIF(${String(body.section_name || "").trim().slice(0, 120)}, ''), section_name),
          questions_to_show = ${Math.max(0, Math.floor(Number(body.questions_to_show ?? 0)))},
          randomize = ${Boolean(body.randomize)},
          active = CASE WHEN ${body.active !== undefined} THEN ${Boolean(body.active)} ELSE active END
      WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examLocalId} AND local_id = ${secId}
    `;
    return NextResponse.json({ ok: true, message: "Section updated." });
  }

  if (action === "delete_section") {
    const secId = Number(body.section_local_id);
    await sql`DELETE FROM portal_questions WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examLocalId} AND section_local_id = ${secId}`;
    await sql`DELETE FROM portal_exam_groups WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examLocalId} AND section_local_id = ${secId}`;
    await sql`DELETE FROM portal_exam_sections WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examLocalId} AND local_id = ${secId}`;
    return NextResponse.json({ ok: true, message: "Section deleted." });
  }

  if (action === "add_group") {
    const groupName = String(body.group_name || "").trim().slice(0, 140);
    const sectionLocalId = body.section_local_id ? Number(body.section_local_id) : null;
    if (!groupName) return NextResponse.json({ ok: false, message: "Group title required." }, { status: 400 });
    const maxRows = await sql`
      SELECT GREATEST(100000, COALESCE(MAX(local_id), 100000))::int AS max_id
      FROM portal_exam_groups WHERE school_id = ${session.schoolId}::uuid
    `;
    const nextId = Number(maxRows[0]?.max_id || 100000) + 1;
    await sql`
      INSERT INTO portal_exam_groups (school_id, local_id, exam_local_id, section_local_id, group_name, group_type, group_content, instruction_text, display_order)
      VALUES (
        ${session.schoolId}::uuid, ${nextId}, ${examLocalId}, ${sectionLocalId},
        ${groupName}, ${String(body.group_type || "passage").slice(0, 40)},
        ${String(body.group_content || "")}, ${String(body.instruction_text || "")}, 1
      )
    `;
    return NextResponse.json({ ok: true, group_local_id: nextId, message: `Group "${groupName}" added.` });
  }

  if (action === "delete_group") {
    const gid = Number(body.group_local_id);
    await sql`UPDATE portal_questions SET group_local_id = NULL WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examLocalId} AND group_local_id = ${gid}`;
    await sql`DELETE FROM portal_exam_groups WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examLocalId} AND local_id = ${gid}`;
    return NextResponse.json({ ok: true, message: "Question group removed." });
  }

  if (action === "deactivate") {
    const note = String(body.deactivation_note || "").trim().slice(0, 400);
    await sql`
      UPDATE portal_exams
      SET active = FALSE, deactivated = TRUE, deactivated_at = NOW(), deactivation_note = ${note}, updated_at = NOW()
      WHERE school_id = ${session.schoolId}::uuid AND local_id = ${examLocalId}
    `;
    await logPortalAudit({ schoolId: session.schoolId, actorRole: session.role, actorUsername: session.username, action: `Deactivated exam "${check.exam.name}"`, details: note });
    return NextResponse.json({ ok: true, message: "Examination deactivated." });
  }

  if (action === "reactivate") {
    await sql`
      UPDATE portal_exams
      SET deactivated = FALSE, deactivation_note = '', updated_at = NOW()
      WHERE school_id = ${session.schoolId}::uuid AND local_id = ${examLocalId}
    `;
    await logPortalAudit({ schoolId: session.schoolId, actorRole: session.role, actorUsername: session.username, action: `Restored exam "${check.exam.name}"` });
    return NextResponse.json({ ok: true, message: "Examination restored." });
  }

  // Default: Update full exam settings
  const name = body.name !== undefined ? String(body.name || "").trim().slice(0, 160) : null;
  const examClass = body.exam_class !== undefined ? String(body.exam_class || "").trim().slice(0, 60) : null;
  const specialisation = body.specialisation !== undefined ? String(body.specialisation || "").trim().slice(0, 60) : null;
  const subjectTag = body.subject_tag !== undefined ? String(body.subject_tag || "").trim().slice(0, 80) : null;
  const duration = body.duration !== undefined ? Math.max(1, Math.min(360, Math.floor(Number(body.duration || 30)))) : null;
  const calcType = body.calculator_type !== undefined ? String(body.calculator_type || "none").trim().slice(0, 30) : null;
  const active = body.active !== undefined ? Boolean(body.active) : null;
  const resultsReleased = body.results_released !== undefined ? Boolean(body.results_released) : null;

  await sql`
    UPDATE portal_exams
    SET name = COALESCE(NULLIF(${name || ""}, ''), name),
        exam_class = CASE WHEN ${examClass !== null} THEN ${examClass || ""} ELSE exam_class END,
        specialisation = CASE WHEN ${specialisation !== null} THEN ${specialisation || ""} ELSE specialisation END,
        subject_tag = CASE WHEN ${subjectTag !== null} THEN ${subjectTag || ""} ELSE subject_tag END,
        duration = CASE WHEN ${duration !== null} THEN ${duration || 30} ELSE duration END,
        calculator_type = CASE WHEN ${calcType !== null} THEN ${calcType || "none"} ELSE calculator_type END,
        active = CASE WHEN ${active !== null} THEN ${Boolean(active)} ELSE active END,
        results_released = CASE WHEN ${resultsReleased !== null} THEN ${Boolean(resultsReleased)} ELSE results_released END,
        updated_at = NOW()
    WHERE school_id = ${session.schoolId}::uuid AND local_id = ${examLocalId}
  `;

  await logPortalAudit({
    schoolId: session.schoolId,
    actorRole: session.role,
    actorUsername: session.username,
    action: `Updated settings for "${name || check.exam.name}"`,
  });
  return NextResponse.json({ ok: true, message: "Exam settings saved." });
}
