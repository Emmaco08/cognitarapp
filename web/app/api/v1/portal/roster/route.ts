import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";
import { hashWerkzeugPassword } from "@/lib/werkzeug-password";
import { logPortalAudit } from "@/lib/portal-audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["admin", "teacher"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;
  const sql = getSql();

  const checkUsername = String(req.nextUrl.searchParams.get("check_username") || "").trim();
  const checkKind = String(req.nextUrl.searchParams.get("kind") || "student").trim().toLowerCase();
  if (checkUsername) {
    let rows: any[] = [];
    if (checkKind === "teacher") {
      rows = await sql`SELECT 1 FROM portal_teachers WHERE school_id = ${session.schoolId}::uuid AND LOWER(username) = LOWER(${checkUsername}) LIMIT 1`;
    } else if (checkKind === "admin") {
      rows = await sql`SELECT 1 FROM portal_admins WHERE school_id = ${session.schoolId}::uuid AND LOWER(username) = LOWER(${checkUsername}) LIMIT 1`;
    } else {
      rows = await sql`SELECT 1 FROM portal_students WHERE school_id = ${session.schoolId}::uuid AND LOWER(username) = LOWER(${checkUsername}) LIMIT 1`;
    }
    return NextResponse.json({ ok: true, available: rows.length === 0 });
  }

  const singleKind = String(req.nextUrl.searchParams.get("single") || "");
  const singleId = Number(req.nextUrl.searchParams.get("local_id") || 0);
  if (singleKind === "teacher" && singleId > 0 && session.role === "admin") {
    const [tRows, sRows] = await Promise.all([
      sql`SELECT local_id, username, full_name, primary_class, classes_json, specialisations_json, class_teacher_of FROM portal_teachers WHERE school_id = ${session.schoolId}::uuid AND local_id = ${singleId} LIMIT 1`,
      sql`SELECT classes_json FROM portal_school_settings WHERE school_id = ${session.schoolId}::uuid LIMIT 1`,
    ]);
    if (!tRows.length) return NextResponse.json({ ok: false, message: "Teacher not found." }, { status: 404 });
    return NextResponse.json({
      ok: true,
      teacher: tRows[0],
      classes: Array.isArray(sRows[0]?.classes_json) && sRows[0].classes_json.length ? sRows[0].classes_json : ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"],
    });
  }
  if (singleKind === "student" && singleId > 0) {
    const [stRows, sRows] = await Promise.all([
      sql`SELECT local_id, username, full_name, email, student_class, specialisation, status FROM portal_students WHERE school_id = ${session.schoolId}::uuid AND local_id = ${singleId} LIMIT 1`,
      sql`SELECT classes_json FROM portal_school_settings WHERE school_id = ${session.schoolId}::uuid LIMIT 1`,
    ]);
    if (!stRows.length) return NextResponse.json({ ok: false, message: "Student not found." }, { status: 404 });
    return NextResponse.json({
      ok: true,
      student: stRows[0],
      classes: Array.isArray(sRows[0]?.classes_json) && sRows[0].classes_json.length ? sRows[0].classes_json : ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"],
    });
  }

  const [studentsRaw, teachers, admins, settingsRows, attemptRows] = await Promise.all([
    sql`
      SELECT local_id, username, full_name, email, student_class, specialisation, status, created_online, updated_at
      FROM portal_students
      WHERE school_id = ${session.schoolId}::uuid
      ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, student_class ASC, full_name ASC
      LIMIT 600
    `,
    sql`
      SELECT local_id, username, full_name, primary_class, classes_json, specialisations_json, class_teacher_of, created_online
      FROM portal_teachers
      WHERE school_id = ${session.schoolId}::uuid
      ORDER BY full_name ASC
      LIMIT 250
    `,
    session.role === "admin"
      ? sql`
          SELECT local_id, username, updated_at
          FROM portal_admins
          WHERE school_id = ${session.schoolId}::uuid
          ORDER BY local_id ASC
        `
      : Promise.resolve([]),
    sql`SELECT classes_json, academic_session, current_term FROM portal_school_settings WHERE school_id = ${session.schoolId}::uuid LIMIT 1`,
    sql`
      SELECT a.student_local_id, a.exam_local_id, a.score, a.total, a.percentage, a.submitted, e.name AS exam_name
      FROM portal_attempts a
      LEFT JOIN portal_exams e ON e.school_id = a.school_id AND e.local_id = a.exam_local_id
      WHERE a.school_id = ${session.schoolId}::uuid
    `,
  ]);

  const attByStudent = new Map<number, Array<{ exam_local_id: number; exam_name: string; percentage: number; submitted: boolean }>>();
  for (const a of attemptRows as Record<string, any>[]) {
    const sid = Number(a.student_local_id);
    const list = attByStudent.get(sid) || [];
    list.push({
      exam_local_id: Number(a.exam_local_id),
      exam_name: String(a.exam_name || `Exam #${a.exam_local_id}`),
      percentage: Number(a.percentage || 0),
      submitted: Boolean(a.submitted),
    });
    attByStudent.set(sid, list);
  }

  let teacherClasses: string[] = [];
  let classTeacherOf = "";
  if (session.role === "teacher") {
    const me = (teachers as Record<string, any>[]).find((t) => Number(t.local_id) === session.localId);
    if (me) {
      teacherClasses = Array.isArray(me.classes_json) ? me.classes_json.map(String) : [];
      if (me.primary_class && !teacherClasses.includes(String(me.primary_class))) {
        teacherClasses.unshift(String(me.primary_class));
      }
      classTeacherOf = String(me.class_teacher_of || "");
    }
  }

  const students = (studentsRaw as Record<string, any>[])
    .filter((s) => {
      if (session.role !== "teacher") return true;
      if (!teacherClasses.length && !classTeacherOf) return true;
      return teacherClasses.includes(String(s.student_class)) || (classTeacherOf && String(s.student_class) === classTeacherOf);
    })
    .map((s) => {
      const atts = attByStudent.get(Number(s.local_id)) || [];
      const done = atts.filter((x) => x.submitted);
      const avg = done.length ? Math.round((done.reduce((acc, x) => acc + x.percentage, 0) / done.length) * 10) / 10 : null;
      return {
        ...s,
        exams_taken: done.length,
        avg_score: avg,
        attempts: atts,
      };
    });

  const classes =
    Array.isArray(settingsRows[0]?.classes_json) && settingsRows[0].classes_json.length
      ? settingsRows[0].classes_json
      : ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];

  return NextResponse.json({
    ok: true,
    students,
    teachers,
    admins,
    classes,
    academic_session: String(settingsRows[0]?.academic_session || "2026/2027"),
    class_teacher_of: classTeacherOf,
    current_admin_local_id: session.role === "admin" ? session.localId : null,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["admin", "teacher"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
    const sql = getSql();
    const action = String(body.action || "").trim();

    // Teacher or Admin: Bulk promote/retain students
    if (action === "promote_students") {
      const updates = Array.isArray(body.updates) ? (body.updates as Array<Record<string, any>>) : [];
      if (!updates.length) {
        return NextResponse.json({ ok: false, message: "No student decisions supplied." }, { status: 400 });
      }
      let promoted = 0;
      for (const u of updates) {
        const sid = Number(u.student_local_id);
        const decision = String(u.decision || "promote");
        const targetClass = String(u.target_class || "").trim().slice(0, 60);
        const targetSpec = String(u.specialisation || "").trim().slice(0, 60);
        if (!Number.isInteger(sid)) continue;
        if (decision === "promote" && targetClass) {
          await sql`
            UPDATE portal_students
            SET student_class = ${targetClass},
                specialisation = COALESCE(NULLIF(${targetSpec}, ''), specialisation),
                updated_at = NOW()
            WHERE school_id = ${session.schoolId}::uuid AND local_id = ${sid}
          `;
          promoted++;
        }
      }
      await logPortalAudit({
        schoolId: session.schoolId,
        actorRole: session.role,
        actorUsername: session.username,
        action: "Executed student class progression",
        details: `${promoted} student(s) promoted`,
      });
      return NextResponse.json({ ok: true, promoted, message: `Updated ${promoted} student(s).` });
    }

    if (session.role !== "admin") {
      return NextResponse.json({ ok: false, message: "Admin privileges required." }, { status: 403 });
    }

    if (action === "approve_all_pending") {
      const res = await sql`
        UPDATE portal_students
        SET status = 'approved', updated_at = NOW()
        WHERE school_id = ${session.schoolId}::uuid AND status = 'pending'
        RETURNING local_id
      `;
      await logPortalAudit({
        schoolId: session.schoolId,
        actorRole: "admin",
        actorUsername: session.username,
        action: "Approved all pending students",
        details: `${res.length} student(s) approved`,
      });
      return NextResponse.json({ ok: true, count: res.length, message: `Approved ${res.length} pending student(s).` });
    }

    if (action === "reset_attempt") {
      const studentLocalId = Number(body.student_local_id);
      const examLocalId = Number(body.exam_local_id);
      if (!Number.isInteger(studentLocalId) || !Number.isInteger(examLocalId)) {
        return NextResponse.json({ ok: false, message: "Select a student and exam to reset." }, { status: 400 });
      }
      await sql`
        DELETE FROM portal_attempts
        WHERE school_id = ${session.schoolId}::uuid
          AND student_local_id = ${studentLocalId}
          AND exam_local_id = ${examLocalId}
      `;
      await logPortalAudit({
        schoolId: session.schoolId,
        actorRole: "admin",
        actorUsername: session.username,
        action: `Reset exam attempt for student #${studentLocalId}`,
        details: `Exam #${examLocalId}`,
      });
      return NextResponse.json({ ok: true, message: "Exam attempt reset. The student can retake the paper." });
    }

    const kind = body.kind === "teacher" ? "teacher" : body.kind === "admin" ? "admin" : "student";
    const username = String(body.username || "").trim().slice(0, 80);
    const password = String(body.password || "");
    const fullName = String(body.full_name || username).trim().slice(0, 140);

    if (username.length < 3 || password.length < 4) {
      return NextResponse.json({ ok: false, message: "Username (3+ chars) and password (4+ chars) are required." }, { status: 400 });
    }

    const pwdHash = hashWerkzeugPassword(password);

    if (kind === "admin") {
      if (password.length < 6) {
        return NextResponse.json({ ok: false, message: "Administrator password must be at least 6 characters." }, { status: 400 });
      }
      const maxRows = await sql`
        SELECT GREATEST(100000, COALESCE(MAX(local_id), 100000))::int AS max_id
        FROM portal_admins WHERE school_id = ${session.schoolId}::uuid
      `;
      const nextId = Number(maxRows[0]?.max_id || 100000) + 1;
      await sql`
        INSERT INTO portal_admins (school_id, local_id, username, password_hash, updated_at)
        VALUES (${session.schoolId}::uuid, ${nextId}, ${username}, ${pwdHash}, NOW())
      `;
      await logPortalAudit({
        schoolId: session.schoolId,
        actorRole: "admin",
        actorUsername: session.username,
        action: `Created administrator account "${username}"`,
      });
      return NextResponse.json({ ok: true, local_id: nextId, message: `Administrator "${username}" created.` }, { status: 201 });
    }

    if (kind === "teacher") {
      const assignments = Array.isArray(body.assignments) ? (body.assignments as Array<{ class_name?: string; specialisation?: string }>) : [];
      const classes = assignments.length
        ? Array.from(new Set(assignments.map((a) => String(a.class_name || "").trim()).filter(Boolean)))
        : Array.isArray(body.classes)
        ? body.classes.map((c) => String(c || "").trim()).filter(Boolean)
        : String(body.classes || "")
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);
      const specs = assignments.length
        ? Array.from(new Set(assignments.map((a) => String(a.specialisation || "General").trim()).filter(Boolean)))
        : ["General"];
      const classTeacherOf = String(body.class_teacher_of || "").trim().slice(0, 60);

      const maxRows = await sql`
        SELECT GREATEST(100000, COALESCE(MAX(local_id), 100000))::int AS max_id
        FROM portal_teachers WHERE school_id = ${session.schoolId}::uuid
      `;
      const nextId = Number(maxRows[0]?.max_id || 100000) + 1;
      await sql`
        INSERT INTO portal_teachers (
          school_id, local_id, username, password_hash, full_name, primary_class,
          classes_json, specialisations_json, class_teacher_of, created_online, updated_at
        ) VALUES (
          ${session.schoolId}::uuid, ${nextId}, ${username}, ${pwdHash}, ${fullName},
          ${classes[0] || ""}, ${JSON.stringify(classes)}::jsonb, ${JSON.stringify(specs)}::jsonb,
          ${classTeacherOf}, TRUE, NOW()
        )
      `;
      await logPortalAudit({
        schoolId: session.schoolId,
        actorRole: "admin",
        actorUsername: session.username,
        action: `Created teacher account "${fullName}"`,
        details: `@${username} · ${classes.join(", ") || "All classes"}`,
      });
      return NextResponse.json({ ok: true, local_id: nextId, message: `Teacher "${fullName}" created.` }, { status: 201 });
    }

    const studentClass = String(body.student_class || "").trim().slice(0, 60);
    const specialisation = String(body.specialisation || "General").trim().slice(0, 60) || "General";
    const email = String(body.email || "").trim().slice(0, 120);
    const maxRows = await sql`
      SELECT GREATEST(100000, COALESCE(MAX(local_id), 100000))::int AS max_id
      FROM portal_students WHERE school_id = ${session.schoolId}::uuid
    `;
    const nextId = Number(maxRows[0]?.max_id || 100000) + 1;
    await sql`
      INSERT INTO portal_students (
        school_id, local_id, username, password_hash, full_name, email,
        student_class, specialisation, status, created_online, updated_at
      ) VALUES (
        ${session.schoolId}::uuid, ${nextId}, ${username}, ${pwdHash}, ${fullName},
        ${email}, ${studentClass}, ${specialisation}, 'approved', TRUE, NOW()
      )
    `;
    await logPortalAudit({
      schoolId: session.schoolId,
      actorRole: "admin",
      actorUsername: session.username,
      action: `Registered student "${fullName}"`,
      details: `@${username} · ${studentClass} (${specialisation})`,
    });
    return NextResponse.json({ ok: true, local_id: nextId, message: `Student "${fullName}" registered.` }, { status: 201 });
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg.toLowerCase().includes("unique")) {
      return NextResponse.json({ ok: false, message: "That username already exists in this school." }, { status: 409 });
    }
    console.error("Portal roster POST error:", err);
    return NextResponse.json({ ok: false, message: "Could not add account." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
    const kind = String(body.kind || "student");
    const localId = Number(body.local_id);
    if (!Number.isInteger(localId)) {
      return NextResponse.json({ ok: false, message: "Valid local_id required." }, { status: 400 });
    }
    const sql = getSql();

    if (kind === "teacher") {
      const fullName = String(body.full_name || "").trim().slice(0, 140);
      const assignments = Array.isArray(body.assignments) ? (body.assignments as Array<{ class_name?: string; specialisation?: string }>) : [];
      const classes = assignments.length
        ? Array.from(new Set(assignments.map((a) => String(a.class_name || "").trim()).filter(Boolean)))
        : Array.isArray(body.classes)
        ? body.classes.map((c) => String(c || "").trim()).filter(Boolean)
        : null;
      const specs = assignments.length
        ? Array.from(new Set(assignments.map((a) => String(a.specialisation || "General").trim()).filter(Boolean)))
        : null;
      const classTeacherOf = body.class_teacher_of !== undefined ? String(body.class_teacher_of || "").trim().slice(0, 60) : null;
      const newPassword = String(body.password || "");

      await sql`
        UPDATE portal_teachers
        SET full_name = COALESCE(NULLIF(${fullName}, ''), full_name),
            primary_class = CASE WHEN ${classes !== null} THEN ${classes?.[0] || ""} ELSE primary_class END,
            classes_json = CASE WHEN ${classes !== null} THEN ${JSON.stringify(classes || [])}::jsonb ELSE classes_json END,
            specialisations_json = CASE WHEN ${specs !== null} THEN ${JSON.stringify(specs || ["General"])}::jsonb ELSE specialisations_json END,
            class_teacher_of = CASE WHEN ${classTeacherOf !== null} THEN ${classTeacherOf || ""} ELSE class_teacher_of END,
            password_hash = CASE WHEN ${newPassword.length >= 4} THEN ${newPassword.length >= 4 ? hashWerkzeugPassword(newPassword) : ""} ELSE password_hash END,
            updated_at = NOW()
        WHERE school_id = ${session.schoolId}::uuid AND local_id = ${localId}
      `;
      await logPortalAudit({
        schoolId: session.schoolId,
        actorRole: "admin",
        actorUsername: session.username,
        action: `Updated teacher #${localId}`,
        details: fullName || undefined,
      });
      return NextResponse.json({ ok: true, message: "Teacher account updated." });
    }

    // Student full edit or status update
    const status = body.status !== undefined ? String(body.status).trim().toLowerCase() : null;
    if (status && !["approved", "pending", "suspended"].includes(status)) {
      return NextResponse.json({ ok: false, message: "Invalid student status." }, { status: 400 });
    }
    const fullName = body.full_name !== undefined ? String(body.full_name || "").trim().slice(0, 140) : null;
    const studentClass = body.student_class !== undefined ? String(body.student_class || "").trim().slice(0, 60) : null;
    const specialisation = body.specialisation !== undefined ? String(body.specialisation || "").trim().slice(0, 60) : null;
    const email = body.email !== undefined ? String(body.email || "").trim().slice(0, 120) : null;
    const newPassword = String(body.password || "");

    await sql`
      UPDATE portal_students
      SET full_name = CASE WHEN ${fullName !== null && fullName !== ""} THEN ${fullName || ""} ELSE full_name END,
          student_class = CASE WHEN ${studentClass !== null} THEN ${studentClass || ""} ELSE student_class END,
          specialisation = CASE WHEN ${specialisation !== null} THEN ${specialisation || ""} ELSE specialisation END,
          email = CASE WHEN ${email !== null} THEN ${email || ""} ELSE email END,
          status = CASE WHEN ${status !== null} THEN ${status || "approved"} ELSE status END,
          password_hash = CASE WHEN ${newPassword.length >= 4} THEN ${newPassword.length >= 4 ? hashWerkzeugPassword(newPassword) : ""} ELSE password_hash END,
          updated_at = NOW()
      WHERE school_id = ${session.schoolId}::uuid AND local_id = ${localId}
    `;
    await logPortalAudit({
      schoolId: session.schoolId,
      actorRole: "admin",
      actorUsername: session.username,
      action: status ? `Set student #${localId} status to ${status}` : `Updated student #${localId}`,
      details: fullName || undefined,
    });
    return NextResponse.json({ ok: true, message: status ? `Student status updated to ${status}.` : "Student profile updated." });
  } catch (err) {
    console.error("Portal roster PATCH error:", err);
    return NextResponse.json({ ok: false, message: "Could not update account." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const kind = String(req.nextUrl.searchParams.get("kind") || "student").toLowerCase();
  const localId = Number(req.nextUrl.searchParams.get("local_id") || 0);
  if (!Number.isInteger(localId) || localId <= 0) {
    return NextResponse.json({ ok: false, message: "Valid local_id is required." }, { status: 400 });
  }

  const sql = getSql();
  if (kind === "admin") {
    if (localId === session.localId) {
      return NextResponse.json({ ok: false, message: "You cannot delete your own active administrator account." }, { status: 400 });
    }
    const countRows = await sql`SELECT COUNT(*)::int AS c FROM portal_admins WHERE school_id = ${session.schoolId}::uuid`;
    if (Number(countRows[0]?.c || 0) <= 1) {
      return NextResponse.json({ ok: false, message: "At least one administrator account must remain active." }, { status: 400 });
    }
    await sql`DELETE FROM portal_admins WHERE school_id = ${session.schoolId}::uuid AND local_id = ${localId}`;
    await logPortalAudit({ schoolId: session.schoolId, actorRole: "admin", actorUsername: session.username, action: `Deleted administrator #${localId}` });
    return NextResponse.json({ ok: true, message: "Administrator removed." });
  }

  if (kind === "teacher") {
    await sql`DELETE FROM portal_teachers WHERE school_id = ${session.schoolId}::uuid AND local_id = ${localId}`;
    await logPortalAudit({ schoolId: session.schoolId, actorRole: "admin", actorUsername: session.username, action: `Deleted teacher #${localId}` });
    return NextResponse.json({ ok: true, message: "Teacher removed." });
  }

  await sql`DELETE FROM portal_attempts WHERE school_id = ${session.schoolId}::uuid AND student_local_id = ${localId}`;
  await sql`DELETE FROM portal_students WHERE school_id = ${session.schoolId}::uuid AND local_id = ${localId}`;
  await logPortalAudit({ schoolId: session.schoolId, actorRole: "admin", actorUsername: session.username, action: `Deleted student #${localId}` });
  return NextResponse.json({ ok: true, message: "Student removed." });
}
