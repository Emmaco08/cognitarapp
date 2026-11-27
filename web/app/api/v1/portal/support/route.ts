import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";
import { finalizePortalAttempt } from "@/lib/portal-grading";
import { logPortalAudit } from "@/lib/portal-audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["admin", "teacher"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const sql = getSql();
    const isTeacher = session.role === "teacher";

    const rows = isTeacher
      ? await sql`
          SELECT a.id, a.student_local_id, a.exam_local_id, a.started_at, a.authoritative_deadline,
                 a.remaining_time, a.warnings_count, a.is_paused, a.force_submit,
                 a.resume_requested, a.resume_reason, a.last_heartbeat_at, a.updated_at, a.answers_json,
                 s.full_name AS student_name, s.username AS student_username, s.student_class,
                 e.name AS exam_name, e.exam_class, e.duration, e.is_paused_all, e.max_warnings,
                 t.full_name AS teacher_name
          FROM portal_attempts a
          JOIN portal_exams e ON e.school_id = a.school_id AND e.local_id = a.exam_local_id
          LEFT JOIN portal_students s ON s.school_id = a.school_id AND s.local_id = a.student_local_id
          LEFT JOIN portal_teachers t ON t.school_id = e.school_id AND t.local_id = e.teacher_local_id
          WHERE a.school_id = ${session.schoolId}::uuid
            AND a.submitted = FALSE
            AND e.teacher_local_id = ${session.localId}
          ORDER BY a.resume_requested DESC, a.is_paused DESC, a.started_at DESC
          LIMIT 250
        `
      : await sql`
          SELECT a.id, a.student_local_id, a.exam_local_id, a.started_at, a.authoritative_deadline,
                 a.remaining_time, a.warnings_count, a.is_paused, a.force_submit,
                 a.resume_requested, a.resume_reason, a.last_heartbeat_at, a.updated_at, a.answers_json,
                 s.full_name AS student_name, s.username AS student_username, s.student_class,
                 e.name AS exam_name, e.exam_class, e.duration, e.is_paused_all, e.max_warnings,
                 t.full_name AS teacher_name
          FROM portal_attempts a
          JOIN portal_exams e ON e.school_id = a.school_id AND e.local_id = a.exam_local_id
          LEFT JOIN portal_students s ON s.school_id = a.school_id AND s.local_id = a.student_local_id
          LEFT JOIN portal_teachers t ON t.school_id = e.school_id AND t.local_id = e.teacher_local_id
          WHERE a.school_id = ${session.schoolId}::uuid
            AND a.submitted = FALSE
          ORDER BY a.resume_requested DESC, a.is_paused DESC, a.started_at DESC
          LIMIT 250
        `;

    const nowMs = Date.now();
    const sessions = (rows as Record<string, any>[]).map((r) => {
      const paused = Boolean(r.is_paused || r.is_paused_all);
      const deadlineMs = r.authoritative_deadline ? new Date(r.authoritative_deadline).getTime() : nowMs;
      const remainingSec = paused
        ? Math.max(0, Number(r.remaining_time || 0))
        : Math.max(0, Math.floor((deadlineMs - nowMs) / 1000));
      const hbTime = r.last_heartbeat_at || r.updated_at || r.started_at;
      const ageSec = hbTime ? Math.max(0, Math.floor((nowMs - new Date(hbTime).getTime()) / 1000)) : 999;
      const connection: "active" | "lagging" | "disconnected" =
        ageSec <= 65 ? "active" : ageSec <= 180 ? "lagging" : "disconnected";
      const answeredCount =
        r.answers_json && typeof r.answers_json === "object" ? Object.keys(r.answers_json).length : 0;

      return {
        id: String(r.id),
        student_local_id: Number(r.student_local_id),
        student_name: String(r.student_name || r.student_username || "Student"),
        student_username: String(r.student_username || ""),
        student_class: String(r.student_class || r.exam_class || ""),
        exam_local_id: Number(r.exam_local_id),
        exam_name: String(r.exam_name || "Examination"),
        exam_class: String(r.exam_class || ""),
        teacher_name: String(r.teacher_name || "Administrator"),
        duration: Number(r.duration || 30),
        remaining_seconds: remainingSec,
        warnings_count: Number(r.warnings_count || 0),
        max_warnings: Number(r.max_warnings || 5),
        is_paused: paused,
        resume_requested: Boolean(r.resume_requested),
        resume_reason: String(r.resume_reason || ""),
        connection,
        last_seen_seconds: ageSec,
        answered_count: answeredCount,
        started_at: r.started_at,
      };
    });

    const stats = {
      total: sessions.length,
      writing: sessions.filter((s) => !s.is_paused && !s.resume_requested).length,
      paused: sessions.filter((s) => s.is_paused && !s.resume_requested).length,
      resume_requests: sessions.filter((s) => s.resume_requested).length,
      offline: sessions.filter((s) => s.connection !== "active").length,
    };

    return NextResponse.json({
      ok: true,
      server_time: new Date().toISOString(),
      stats,
      sessions,
    });
  } catch (err) {
    console.error("Portal support GET error:", err);
    return NextResponse.json({ ok: false, message: "Could not load active exam sessions." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["admin", "teacher"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, message: "Invalid request body." }, { status: 400 });

    const action = String(body.action || "").trim();
    const attemptId = String(body.attempt_id || "").trim();
    const minutes = Math.max(1, Math.min(180, Math.floor(Number(body.minutes || 5))));
    const sql = getSql();
    const isTeacher = session.role === "teacher";

    // Bulk actions
    if (action === "pause_all" || action === "resume_all" || action === "force_submit_all") {
      const targetRows = isTeacher
        ? await sql`
            SELECT a.id, a.authoritative_deadline, a.remaining_time, a.is_paused, a.answers_json, a.warnings_count
            FROM portal_attempts a
            JOIN portal_exams e ON e.school_id = a.school_id AND e.local_id = a.exam_local_id
            WHERE a.school_id = ${session.schoolId}::uuid AND a.submitted = FALSE
              AND e.teacher_local_id = ${session.localId}
          `
        : await sql`
            SELECT a.id, a.authoritative_deadline, a.remaining_time, a.is_paused, a.answers_json, a.warnings_count
            FROM portal_attempts a
            WHERE a.school_id = ${session.schoolId}::uuid AND a.submitted = FALSE
          `;

      const nowMs = Date.now();
      let affected = 0;

      for (const r of targetRows as Record<string, any>[]) {
        if (action === "pause_all") {
          const dl = r.authoritative_deadline ? new Date(r.authoritative_deadline).getTime() : nowMs;
          const rem = r.is_paused ? Math.max(0, Number(r.remaining_time || 0)) : Math.max(0, Math.floor((dl - nowMs) / 1000));
          await sql`
            UPDATE portal_attempts
            SET is_paused = TRUE, remaining_time = ${rem}, updated_at = NOW()
            WHERE id = ${r.id}::uuid AND school_id = ${session.schoolId}::uuid
          `;
          affected++;
        } else if (action === "resume_all") {
          const rem = Math.max(60, Number(r.remaining_time || 60));
          const nextDeadline = new Date(nowMs + rem * 1000).toISOString();
          await sql`
            UPDATE portal_attempts
            SET is_paused = FALSE, resume_requested = FALSE, resume_reason = '',
                authoritative_deadline = ${nextDeadline}::timestamptz, updated_at = NOW()
            WHERE id = ${r.id}::uuid AND school_id = ${session.schoolId}::uuid
          `;
          affected++;
        } else if (action === "force_submit_all") {
          await finalizePortalAttempt({
            schoolId: session.schoolId,
            attemptId: String(r.id),
            finalAnswers: (r.answers_json || {}) as Record<string, string>,
            warningsCount: Number(r.warnings_count || 0),
            autoSubmitted: true,
          });
          affected++;
        }
      }

      if (!isTeacher && action === "pause_all") {
        await sql`UPDATE portal_exams SET is_paused_all = TRUE WHERE school_id = ${session.schoolId}::uuid AND active = TRUE`;
      } else if (!isTeacher && action === "resume_all") {
        await sql`UPDATE portal_exams SET is_paused_all = FALSE WHERE school_id = ${session.schoolId}::uuid`;
      }

      await logPortalAudit({
        schoolId: session.schoolId,
        actorRole: session.role,
        actorUsername: session.username,
        action: `Live Support bulk action: ${action}`,
        details: `${affected} active session(s) updated`,
      });

      return NextResponse.json({ ok: true, affected, message: `Updated ${affected} active session(s).` });
    }

    if (!/^[0-9a-f-]{36}$/i.test(attemptId)) {
      return NextResponse.json({ ok: false, message: "Valid attempt ID is required." }, { status: 400 });
    }

    const checkRows = await sql`
      SELECT a.*, e.teacher_local_id, e.name AS exam_name, s.full_name AS student_name
      FROM portal_attempts a
      JOIN portal_exams e ON e.school_id = a.school_id AND e.local_id = a.exam_local_id
      LEFT JOIN portal_students s ON s.school_id = a.school_id AND s.local_id = a.student_local_id
      WHERE a.id = ${attemptId}::uuid AND a.school_id = ${session.schoolId}::uuid
      LIMIT 1
    `;
    if (!checkRows.length) {
      return NextResponse.json({ ok: false, message: "Exam session not found." }, { status: 404 });
    }
    const att = checkRows[0] as Record<string, any>;
    if (isTeacher && Number(att.teacher_local_id) !== session.localId) {
      return NextResponse.json({ ok: false, message: "You can only manage sessions for your own exams." }, { status: 403 });
    }
    if (att.submitted) {
      return NextResponse.json({ ok: false, message: "This attempt has already been submitted." }, { status: 400 });
    }

    const nowMs = Date.now();
    const dlMs = att.authoritative_deadline ? new Date(att.authoritative_deadline).getTime() : nowMs;
    const currentRem = att.is_paused
      ? Math.max(0, Number(att.remaining_time || 0))
      : Math.max(0, Math.floor((dlMs - nowMs) / 1000));

    let msg = "Session updated.";

    if (action === "pause") {
      await sql`
        UPDATE portal_attempts
        SET is_paused = TRUE, remaining_time = ${currentRem}, updated_at = NOW()
        WHERE id = ${attemptId}::uuid
      `;
      msg = `Paused exam for ${att.student_name || "student"}.`;
    } else if (action === "resume" || action === "approve_resume") {
      const rem = Math.max(60, currentRem);
      const nextDl = new Date(nowMs + rem * 1000).toISOString();
      await sql`
        UPDATE portal_attempts
        SET is_paused = FALSE, resume_requested = FALSE, resume_reason = '',
            authoritative_deadline = ${nextDl}::timestamptz, remaining_time = ${rem}, updated_at = NOW()
        WHERE id = ${attemptId}::uuid
      `;
      msg = action === "approve_resume"
        ? `Approved unlock & resumed exam for ${att.student_name || "student"}.`
        : `Resumed exam for ${att.student_name || "student"}.`;
    } else if (action === "add_time") {
      const nextRem = currentRem + minutes * 60;
      const nextDl = new Date(nowMs + nextRem * 1000).toISOString();
      await sql`
        UPDATE portal_attempts
        SET remaining_time = ${nextRem},
            authoritative_deadline = CASE WHEN is_paused THEN authoritative_deadline ELSE ${nextDl}::timestamptz END,
            updated_at = NOW()
        WHERE id = ${attemptId}::uuid
      `;
      msg = `Added ${minutes} min for ${att.student_name || "student"}.`;
    } else if (action === "subtract_time") {
      const nextRem = Math.max(30, currentRem - minutes * 60);
      const nextDl = new Date(nowMs + nextRem * 1000).toISOString();
      await sql`
        UPDATE portal_attempts
        SET remaining_time = ${nextRem},
            authoritative_deadline = CASE WHEN is_paused THEN authoritative_deadline ELSE ${nextDl}::timestamptz END,
            updated_at = NOW()
        WHERE id = ${attemptId}::uuid
      `;
      msg = `Subtracted ${minutes} min for ${att.student_name || "student"}.`;
    } else if (action === "reset_warnings") {
      await sql`
        UPDATE portal_attempts
        SET warnings_count = 0, updated_at = NOW()
        WHERE id = ${attemptId}::uuid
      `;
      msg = `Warnings reset to 0 for ${att.student_name || "student"}.`;
    } else if (action === "force_submit") {
      await finalizePortalAttempt({
        schoolId: session.schoolId,
        attemptId,
        finalAnswers: (att.answers_json || {}) as Record<string, string>,
        warningsCount: Number(att.warnings_count || 0),
        autoSubmitted: true,
      });
      msg = `Force-submitted exam for ${att.student_name || "student"}.`;
    } else {
      return NextResponse.json({ ok: false, message: "Unsupported action." }, { status: 400 });
    }

    await logPortalAudit({
      schoolId: session.schoolId,
      actorRole: session.role,
      actorUsername: session.username,
      action: `Live Support (${action})`,
      details: `${att.student_name || "Student"} on ${att.exam_name || "Exam"}`,
    });

    return NextResponse.json({ ok: true, message: msg });
  } catch (err) {
    console.error("Portal support POST error:", err);
    return NextResponse.json({ ok: false, message: "Support action failed." }, { status: 500 });
  }
}
