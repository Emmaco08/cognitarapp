import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";
import { logPortalAudit } from "@/lib/portal-audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["teacher", "admin"]);
  if (!gate.ok) return gate.response;
  const { session, school } = gate;

  try {
    const sql = getSql();
    const [settingsRows, teacherRows, examRows, studentCountRows, pendingRows, liveRows, allTeachersRows] = await Promise.all([
      sql`
        SELECT school_name, school_motto, academic_session, current_term, classes_json,
               default_result_visibility, allow_teacher_release, allow_student_review,
               anti_cheating_profile, max_warnings, school_logo_b64
        FROM portal_school_settings
        WHERE school_id = ${session.schoolId}::uuid
        LIMIT 1
      `,
      session.role === "teacher"
        ? sql`
            SELECT local_id, username, full_name, primary_class, classes_json, specialisations_json, class_teacher_of
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
                   (SELECT COUNT(*)::int FROM portal_exam_sections s WHERE s.school_id = e.school_id AND s.exam_local_id = e.local_id) AS section_count,
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
                   (SELECT COUNT(*)::int FROM portal_exam_sections s WHERE s.school_id = e.school_id AND s.exam_local_id = e.local_id) AS section_count,
                   (SELECT COUNT(*)::int FROM portal_attempts a WHERE a.school_id = e.school_id AND a.exam_local_id = e.local_id AND a.submitted = TRUE) AS submission_count,
                   (SELECT COUNT(*)::int FROM portal_attempts a WHERE a.school_id = e.school_id AND a.exam_local_id = e.local_id AND a.submitted = FALSE) AS live_count,
                   (SELECT ROUND(AVG(a.percentage), 1) FROM portal_attempts a WHERE a.school_id = e.school_id AND a.exam_local_id = e.local_id AND a.submitted = TRUE) AS avg_percentage
            FROM portal_exams e
            LEFT JOIN portal_teachers t ON t.school_id = e.school_id AND t.local_id = e.teacher_local_id
            WHERE e.school_id = ${session.schoolId}::uuid
              AND (e.teacher_local_id = ${session.localId} OR e.teacher_local_id IS NULL)
            ORDER BY e.local_id DESC
          `,
      sql`
        SELECT student_class, COUNT(*)::int AS cnt
        FROM portal_students
        WHERE school_id = ${session.schoolId}::uuid AND status = 'approved'
        GROUP BY student_class
      `,
      sql`
        SELECT COUNT(*)::int AS cnt
        FROM portal_students
        WHERE school_id = ${session.schoolId}::uuid AND status = 'pending'
      `,
      sql`
        SELECT COUNT(*)::int AS cnt
        FROM portal_attempts
        WHERE school_id = ${session.schoolId}::uuid AND submitted = FALSE
      `,
      session.role === "admin"
        ? sql`
            SELECT local_id, username, full_name, primary_class, classes_json, class_teacher_of
            FROM portal_teachers
            WHERE school_id = ${session.schoolId}::uuid
            ORDER BY full_name ASC
          `
        : Promise.resolve([]),
    ]);

    const pset = (settingsRows[0] || {}) as Record<string, any>;
    const tc = (teacherRows[0] || null) as Record<string, any> | null;
    const defaultClasses = ["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"];
    const schoolClasses: string[] =
      Array.isArray(pset.classes_json) && pset.classes_json.length ? pset.classes_json : defaultClasses;
    const teacherClasses: string[] =
      tc && Array.isArray(tc.classes_json) && tc.classes_json.length ? tc.classes_json : schoolClasses;

    const teacherClassSet = new Set(teacherClasses.map((c) => String(c || "").trim().toLowerCase()));
    let studentCount = 0;
    for (const r of studentCountRows as Record<string, any>[]) {
      const cls = String(r.student_class || "").trim().toLowerCase();
      if (session.role === "admin" || teacherClassSet.size === 0 || teacherClassSet.has(cls)) {
        studentCount += Number(r.cnt || 0);
      }
    }

    return NextResponse.json({
      ok: true,
      school: {
        ...school,
        portal_school_name: String(pset.school_name || school.school_name),
        school_motto: String(pset.school_motto || ""),
        academic_session: String(pset.academic_session || "2026/2027"),
        current_term: String(pset.current_term || "First Term"),
        school_logo_b64: String(pset.school_logo_b64 || ""),
      },
      school_policy: {
        default_result_visibility: String(pset.default_result_visibility || "immediate"),
        allow_teacher_release: Boolean(pset.allow_teacher_release ?? true),
        allow_student_review: Boolean(pset.allow_student_review ?? false),
        anti_cheating_profile: String(pset.anti_cheating_profile || "medium"),
        max_warnings: Number(pset.max_warnings || 5),
      },
      teacher: tc
        ? {
            local_id: Number(tc.local_id),
            username: String(tc.username),
            full_name: String(tc.full_name || tc.username),
            primary_class: String(tc.primary_class || ""),
            class_teacher_of: String(tc.class_teacher_of || ""),
            classes: teacherClasses,
            specialisations: Array.isArray(tc.specialisations_json) ? tc.specialisations_json : [],
          }
        : null,
      student_count: studentCount,
      pending_students_count: Number(pendingRows[0]?.cnt || 0),
      live_sessions_count: Number(liveRows[0]?.cnt || 0),
      classes: session.role === "teacher" ? teacherClasses : schoolClasses,
      all_classes: schoolClasses,
      teachers: allTeachersRows,
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
    const antiCheatingProfile = ["none", "low", "medium", "strict"].includes(String(body.anti_cheating_profile || "").toLowerCase())
      ? String(body.anti_cheating_profile).toLowerCase()
      : "medium";
    const randomizeQuestions = Boolean(body.randomize_questions);
    const randomizeOptions = Boolean(body.randomize_options);

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
    const teacherId =
      session.role === "teacher"
        ? session.localId
        : body.teacher_local_id
          ? Number(body.teacher_local_id)
          : null;

    const inserted = await sql`
      INSERT INTO portal_exams (
        school_id, local_id, name, exam_class, duration, active, teacher_local_id,
        specialisation, subject_tag, max_warnings, calculator_type, deactivated,
        result_release_policy, results_released, anti_cheating_profile,
        randomize_questions, randomize_options, created_online, updated_at
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
        ${antiCheatingProfile},
        ${randomizeQuestions},
        ${randomizeOptions},
        TRUE,
        NOW()
      )
      RETURNING *
    `;

    // Optional inline sections (for JSON import or structured creation)
    const sectionNameToLocalId = new Map<string, number>();
    let addedSections = 0;
    if (Array.isArray(body.sections) && body.sections.length > 0) {
      const maxSecRows = await sql`
        SELECT GREATEST(300000, COALESCE(MAX(local_id), 300000))::int AS max_id
        FROM portal_exam_sections
        WHERE school_id = ${session.schoolId}::uuid
      `;
      let nextSecId = Number(maxSecRows[0]?.max_id || 300000);
      const secRows = (body.sections as Record<string, unknown>[])
        .map((s, idx) => {
          const secName = String(s.section_name || s.name || "").trim().slice(0, 120);
          if (!secName) return null;
          nextSecId += 1;
          sectionNameToLocalId.set(secName.toLowerCase(), nextSecId);
          return {
            local_id: nextSecId,
            section_name: secName,
            questions_to_show: Math.max(0, Math.floor(Number(s.questions_to_show || 0))),
            randomize: Boolean(s.randomize),
            section_order: Number(s.section_order ?? idx + 1),
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      if (secRows.length) {
        await sql`
          INSERT INTO portal_exam_sections (
            school_id, local_id, exam_local_id, section_name, questions_to_show, randomize, section_order, active
          )
          SELECT ${session.schoolId}::uuid, x.local_id, ${nextLocalId}, x.section_name, x.questions_to_show, x.randomize, x.section_order, TRUE
          FROM jsonb_to_recordset(${JSON.stringify(secRows)}::jsonb)
            AS x(local_id int, section_name text, questions_to_show int, randomize boolean, section_order int)
        `;
        addedSections = secRows.length;
      }
    }

    // Optional inline questions (for import_exam JSON/CSV and admin add_exam multi-question builder)
    let addedQuestions = 0;
    if (Array.isArray(body.questions) && body.questions.length > 0) {
      const maxQRows = await sql`
        SELECT GREATEST(500000, COALESCE(MAX(local_id), 500000))::int AS max_id
        FROM portal_questions
        WHERE school_id = ${session.schoolId}::uuid
      `;
      let nextQId = Number(maxQRows[0]?.max_id || 500000);
      const preparedQs = (body.questions as Record<string, unknown>[])
        .map((item, idx) => {
          const qText = String(item.question || "").trim();
          const o1 = String(item.option1 || "").trim();
          const o2 = String(item.option2 || "").trim();
          const o3 = String(item.option3 || "").trim();
          const o4 = String(item.option4 || "").trim();
          if (!qText || !o1 || !o2) return null;
          let ans = String(item.answer || "").trim();
          const up = ans.toUpperCase();
          if (up === "A" && o1) ans = o1;
          else if (up === "B" && o2) ans = o2;
          else if (up === "C" && o3) ans = o3;
          else if (up === "D" && o4) ans = o4;
          const secKey = String(item.section_name || item.section || "").trim().toLowerCase();
          const sectionLocalId = secKey ? (sectionNameToLocalId.get(secKey) ?? null) : null;
          nextQId += 1;
          return {
            local_id: nextQId,
            section_local_id: sectionLocalId,
            question: qText,
            option1: o1,
            option2: o2,
            option3: o3,
            option4: o4,
            answer: ans || o1,
            explanation: String(item.explanation || "").trim(),
            display_order: idx + 1,
            mandatory: Boolean(item.mandatory),
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      if (preparedQs.length) {
        await sql`
          INSERT INTO portal_questions (
            school_id, local_id, exam_local_id, section_local_id, question,
            option1, option2, option3, option4, answer, explanation,
            display_order, mandatory, created_online, updated_at
          )
          SELECT
            ${session.schoolId}::uuid, x.local_id, ${nextLocalId}, x.section_local_id, x.question,
            x.option1, x.option2, x.option3, x.option4, x.answer, x.explanation,
            x.display_order, x.mandatory, TRUE, NOW()
          FROM jsonb_to_recordset(${JSON.stringify(preparedQs)}::jsonb)
            AS x(
              local_id int, section_local_id int, question text,
              option1 text, option2 text, option3 text, option4 text,
              answer text, explanation text, display_order int, mandatory boolean
            )
        `;
        addedQuestions = preparedQs.length;
      }
    }

    await logPortalAudit({
      schoolId: session.schoolId,
      actorRole: session.role,
      actorUsername: session.fullName || session.username,
      action: addedQuestions > 0 ? "import_exam" : "create_exam",
      details: `${name} | Class: ${examClass}, Duration: ${duration}m, Questions: ${addedQuestions}, Sections: ${addedSections}`,
    });

    return NextResponse.json(
      {
        ok: true,
        exam: inserted[0],
        added_sections: addedSections,
        added_questions: addedQuestions,
        message:
          addedQuestions > 0
            ? `Examination created with ${addedQuestions} questions.`
            : "Examination created cleanly in your Online Portal.",
      },
      { status: 201 }
    );
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
    const nextDeactivationNote =
      typeof body?.deactivation_note === "string" ? body.deactivation_note.trim().slice(0, 240) : String(cur.deactivation_note || "");
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
    const nextSpec =
      typeof body?.specialisation === "string" ? body.specialisation.trim().slice(0, 80) : String(cur.specialisation || "");
    const nextSubject =
      typeof body?.subject_tag === "string" ? body.subject_tag.trim().slice(0, 80) : String(cur.subject_tag || "");
    const nextMaxWarn =
      typeof body?.max_warnings === "number" ? Math.max(1, Math.min(20, Math.floor(body.max_warnings))) : Number(cur.max_warnings || 5);
    const nextProfile =
      typeof body?.anti_cheating_profile === "string" && ["none", "low", "medium", "strict"].includes(body.anti_cheating_profile)
        ? body.anti_cheating_profile
        : String(cur.anti_cheating_profile || "medium");
    const nextRandQ =
      typeof body?.randomize_questions === "boolean" ? body.randomize_questions : Boolean(cur.randomize_questions);
    const nextRandO =
      typeof body?.randomize_options === "boolean" ? body.randomize_options : Boolean(cur.randomize_options);

    const updated = await sql`
      UPDATE portal_exams
      SET name = ${nextName},
          exam_class = ${nextClass},
          duration = ${nextDuration},
          active = ${nextActive},
          deactivated = ${nextDeactivated},
          deactivation_note = ${nextDeactivationNote},
          deactivated_at = ${nextDeactivated ? new Date().toISOString() : null}::timestamptz,
          is_paused_all = ${nextPausedAll},
          calculator_type = ${nextCalc},
          result_release_policy = ${nextPolicy},
          results_released = ${nextReleased},
          specialisation = ${nextSpec},
          subject_tag = ${nextSubject},
          max_warnings = ${nextMaxWarn},
          anti_cheating_profile = ${nextProfile},
          randomize_questions = ${nextRandQ},
          randomize_options = ${nextRandO},
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

    await logPortalAudit({
      schoolId: session.schoolId,
      actorRole: session.role,
      actorUsername: session.fullName || session.username,
      action: "update_exam",
      details: `${nextName} | Active: ${nextActive}, Deactivated: ${nextDeactivated}, Released: ${nextReleased}`,
    });

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
      SELECT name, teacher_local_id FROM portal_exams
      WHERE school_id = ${session.schoolId}::uuid AND local_id = ${localId}
      LIMIT 1
    `;
    if (!rows.length) return NextResponse.json({ ok: false, message: "Exam not found." }, { status: 404 });
    if (session.role === "teacher" && rows[0].teacher_local_id != null && Number(rows[0].teacher_local_id) !== session.localId) {
      return NextResponse.json({ ok: false, message: "You can only delete your own exams." }, { status: 403 });
    }
    await sql`DELETE FROM portal_questions WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${localId}`;
    await sql`DELETE FROM portal_exam_groups WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${localId}`;
    await sql`DELETE FROM portal_exam_sections WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${localId}`;
    await sql`DELETE FROM portal_exams WHERE school_id = ${session.schoolId}::uuid AND local_id = ${localId}`;

    await logPortalAudit({
      schoolId: session.schoolId,
      actorRole: session.role,
      actorUsername: session.fullName || session.username,
      action: "delete_exam",
      details: `${String(rows[0].name || `Exam #${localId}`)} | Deleted exam #${localId} and its questions.`,
    });

    return NextResponse.json({ ok: true, message: "Exam deleted." });
  } catch (err) {
    console.error("Portal exams DELETE error:", err);
    return NextResponse.json({ ok: false, message: "Could not delete exam." }, { status: 500 });
  }
}
