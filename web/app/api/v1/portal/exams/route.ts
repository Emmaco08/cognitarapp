import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["teacher", "admin"]);
  if (!gate.ok) return gate.response;
  const { session, school } = gate;

  try {
    const sql = getSql();
    const [settingsRows, teacherRows, examRows] = await Promise.all([
      sql`
        SELECT school_name, school_motto, academic_session, current_term, classes_json
        FROM portal_school_settings
        WHERE school_id = ${session.schoolId}::uuid
        LIMIT 1
      `,
      session.role === "teacher"
        ? sql`
            SELECT local_id, username, full_name, primary_class, classes_json, specialisations_json
            FROM portal_teachers
            WHERE school_id = ${session.schoolId}::uuid AND local_id = ${session.localId}
            LIMIT 1
          `
        : Promise.resolve([]),
      session.role === "admin"
        ? sql`
            SELECT e.*,
                   t.full_name AS teacher_name,
                   (SELECT COUNT(*)::int FROM portal_questions q WHERE q.school_id = e.school_id AND q.exam_local_id = e.local_id) AS question_count,
                   (SELECT COUNT(*)::int FROM portal_attempts a WHERE a.school_id = e.school_id AND a.exam_local_id = e.local_id AND a.submitted = TRUE) AS submission_count,
                   (SELECT COUNT(*)::int FROM portal_attempts a WHERE a.school_id = e.school_id AND a.exam_local_id = e.local_id AND a.submitted = FALSE) AS live_count,
                   (SELECT ROUND(AVG(a.percentage), 1) FROM portal_attempts a WHERE a.school_id = e.school_id AND a.exam_local_id = e.local_id AND a.submitted = TRUE) AS avg_percentage
            FROM portal_exams e
            LEFT JOIN portal_teachers t ON t.school_id = e.school_id AND t.local_id = e.teacher_local_id
            WHERE e.school_id = ${session.schoolId}::uuid
            ORDER BY e.local_id DESC
          `
        : sql`
            SELECT e.*,
                   t.full_name AS teacher_name,
                   (SELECT COUNT(*)::int FROM portal_questions q WHERE q.school_id = e.school_id AND q.exam_local_id = e.local_id) AS question_count,
                   (SELECT COUNT(*)::int FROM portal_attempts a WHERE a.school_id = e.school_id AND a.exam_local_id = e.local_id AND a.submitted = TRUE) AS submission_count,
                   (SELECT COUNT(*)::int FROM portal_attempts a WHERE a.school_id = e.school_id AND a.exam_local_id = e.local_id AND a.submitted = FALSE) AS live_count,
                   (SELECT ROUND(AVG(a.percentage), 1) FROM portal_attempts a WHERE a.school_id = e.school_id AND a.exam_local_id = e.local_id AND a.submitted = TRUE) AS avg_percentage
            FROM portal_exams e
            LEFT JOIN portal_teachers t ON t.school_id = e.school_id AND t.local_id = e.teacher_local_id
            WHERE e.school_id = ${session.schoolId}::uuid
              AND (e.teacher_local_id = ${session.localId} OR e.teacher_local_id IS NULL)
            ORDER BY e.local_id DESC
          `,
    ]);

    const pset = (settingsRows[0] || {}) as Record<string, any>;
    const tc = (teacherRows[0] || null) as Record<string, any> | null;
    const schoolClasses: string[] = Array.isArray(pset.classes_json) ? pset.classes_json : [];
    const teacherClasses: string[] =
      tc && Array.isArray(tc.classes_json) && tc.classes_json.length ? tc.classes_json : schoolClasses;

    return NextResponse.json({
      ok: true,
      school: {
        ...school,
        portal_school_name: String(pset.school_name || school.school_name),
        academic_session: String(pset.academic_session || "2026/2027"),
        current_term: String(pset.current_term || "First Term"),
      },
      classes: session.role === "teacher" ? teacherClasses : schoolClasses,
      exams: examRows,
    });
  } catch (err) {
    console.error("Portal exams GET error:", err);
    return NextResponse.json({ ok: false, message: "Could not load exams." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["teacher", "admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });

    const name = String(body.name || "").trim().slice(0, 160);
    const examClass = String(body.exam_class || "").trim().slice(0, 80);
    const duration = Math.max(1, Math.min(360, Math.floor(Number(body.duration || 30))));
    const active = Boolean(body.active);
    const specialisation = String(body.specialisation || "").trim().slice(0, 80);
    const subjectTag = String(body.subject_tag || "").trim().slice(0, 80);
    const calculatorType = ["none", "basic", "scientific"].includes(String(body.calculator_type || "").toLowerCase())
      ? String(body.calculator_type).toLowerCase()
      : "none";
    const maxWarnings = Math.max(1, Math.min(20, Math.floor(Number(body.max_warnings || 5))));
    const resultPolicy = String(body.result_release_policy || "immediate") === "withheld" ? "withheld" : "immediate";

    if (name.length < 2) {
      return NextResponse.json({ ok: false, message: "Enter an exam title." }, { status: 400 });
    }
    if (!examClass) {
      return NextResponse.json({ ok: false, message: "Select or enter a target class." }, { status: 400 });
    }

    const sql = getSql();
    // Allocate a clean high local_id (>= 100000 for online-authored exams so it never collides with offline SQLite AUTOINCREMENT IDs!)
    const maxRows = await sql`
      SELECT GREATEST(100000, COALESCE(MAX(local_id), 100000))::int AS max_id
      FROM portal_exams
      WHERE school_id = ${session.schoolId}::uuid
    `;
    const nextLocalId = Number(maxRows[0]?.max_id || 100000) + 1;
    const teacherId = session.role === "teacher" ? session.localId : body.teacher_local_id ? Number(body.teacher_local_id) : null;

    const inserted = await sql`
      INSERT INTO portal_exams (
        school_id, local_id, name, exam_class, duration, active, teacher_local_id,
        specialisation, subject_tag, max_warnings, calculator_type, deactivated,
        result_release_policy, results_released, anti_cheating_profile, created_online, updated_at
      ) VALUES (
        ${session.schoolId}::uuid,
        ${nextLocalId},
        ${name},
        ${examClass},
        ${duration},
        ${active},
        ${teacherId},
        ${specialisation},
        ${subjectTag},
        ${maxWarnings},
        ${calculatorType},
        FALSE,
        ${resultPolicy},
        ${resultPolicy !== "withheld"},
        'medium',
        TRUE,
        NOW()
      )
      RETURNING *
    `;

    return NextResponse.json({ ok: true, exam: inserted[0], message: "Exam created cleanly in your Online Portal." }, { status: 201 });
  } catch (err) {
    console.error("Portal exams POST error:", err);
    return NextResponse.json({ ok: false, message: "Could not create exam." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["teacher", "admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const localId = Number(body?.local_id);
    if (!Number.isInteger(localId) || localId <= 0) {
      return NextResponse.json({ ok: false, message: "Invalid exam local_id." }, { status: 400 });
    }

    const sql = getSql();
    const existingRows = await sql`
      SELECT * FROM portal_exams
      WHERE school_id = ${session.schoolId}::uuid AND local_id = ${localId}
      LIMIT 1
    `;
    if (!existingRows.length) {
      return NextResponse.json({ ok: false, message: "Exam not found." }, { status: 404 });
    }
    const cur = existingRows[0] as Record<string, any>;
    if (session.role === "teacher" && cur.teacher_local_id != null && Number(cur.teacher_local_id) !== session.localId) {
      return NextResponse.json({ ok: false, message: "You can only edit your own exams." }, { status: 403 });
    }

    const nextName = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 160) : String(cur.name);
    const nextClass = typeof body?.exam_class === "string" && body.exam_class.trim() ? body.exam_class.trim().slice(0, 80) : String(cur.exam_class);
    const nextDuration = typeof body?.duration === "number" ? Math.max(1, Math.min(360, Math.floor(body.duration))) : Number(cur.duration);
    const nextActive = typeof body?.active === "boolean" ? body.active : Boolean(cur.active);
    const nextDeactivated = typeof body?.deactivated === "boolean" ? body.deactivated : Boolean(cur.deactivated);
    const nextPausedAll = typeof body?.is_paused_all === "boolean" ? body.is_paused_all : Boolean(cur.is_paused_all);
    const nextCalc =
      typeof body?.calculator_type === "string" && ["none", "basic", "scientific"].includes(body.calculator_type)
        ? body.calculator_type
        : String(cur.calculator_type || "none");
    const nextPolicy =
      typeof body?.result_release_policy === "string" && ["immediate", "withheld"].includes(body.result_release_policy)
        ? body.result_release_policy
        : String(cur.result_release_policy || "immediate");
    const nextReleased =
      typeof body?.results_released === "boolean" ? body.results_released : Boolean(cur.results_released);

    const updated = await sql`
      UPDATE portal_exams
      SET name = ${nextName},
          exam_class = ${nextClass},
          duration = ${nextDuration},
          active = ${nextActive},
          deactivated = ${nextDeactivated},
          is_paused_all = ${nextPausedAll},
          calculator_type = ${nextCalc},
          result_release_policy = ${nextPolicy},
          results_released = ${nextReleased},
          created_online = TRUE,
          updated_at = NOW()
      WHERE school_id = ${session.schoolId}::uuid AND local_id = ${localId}
      RETURNING *
    `;

    // Propagate result release toggle to completed attempts for this exam when explicitly changed
    if (typeof body?.results_released === "boolean") {
      await sql`
        UPDATE portal_attempts
        SET results_released = ${body.results_released}, updated_at = NOW()
        WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${localId} AND submitted = TRUE
      `;
    }

    // If pausing/resuming all active attempts on this exam, adjust deadlines fairly when resuming!
    if (typeof body?.is_paused_all === "boolean") {
      if (body.is_paused_all) {
        await sql`
          UPDATE portal_attempts
          SET is_paused = TRUE,
              remaining_time = GREATEST(0, EXTRACT(EPOCH FROM (authoritative_deadline - NOW()))::int),
              updated_at = NOW()
          WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${localId} AND submitted = FALSE
        `;
      } else {
        await sql`
          UPDATE portal_attempts
          SET is_paused = FALSE,
              authoritative_deadline = NOW() + (GREATEST(60, remaining_time) * INTERVAL '1 second'),
              updated_at = NOW()
          WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${localId} AND submitted = FALSE
        `;
      }
    }

    return NextResponse.json({ ok: true, exam: updated[0] });
  } catch (err) {
    console.error("Portal exams PATCH error:", err);
    return NextResponse.json({ ok: false, message: "Could not update exam." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["teacher", "admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const localId = Number(req.nextUrl.searchParams.get("local_id"));
    if (!Number.isInteger(localId) || localId <= 0) {
      return NextResponse.json({ ok: false, message: "Invalid exam local_id." }, { status: 400 });
    }
    const sql = getSql();
    const rows = await sql`
      SELECT teacher_local_id FROM portal_exams
      WHERE school_id = ${session.schoolId}::uuid AND local_id = ${localId}
      LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ ok: false, message: "Exam not found." }, { status: 404 });
    if (session.role === "teacher" && rows[0].teacher_local_id != null && Number(rows[0].teacher_local_id) !== session.localId) {
      return NextResponse.json({ ok: false, message: "You can only delete your own exams." }, { status: 403 });
    }
    await sql`DELETE FROM portal_questions WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${localId}`;
    await sql`DELETE FROM portal_exams WHERE school_id = ${session.schoolId}::uuid AND local_id = ${localId}`;
    return NextResponse.json({ ok: true, message: "Exam deleted." });
  } catch (err) {
    console.error("Portal exams DELETE error:", err);
    return NextResponse.json({ ok: false, message: "Could not delete exam." }, { status: 500 });
  }
}
