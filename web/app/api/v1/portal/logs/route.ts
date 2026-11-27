import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";
import { logPortalAudit } from "@/lib/portal-audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const type = req.nextUrl.searchParams.get("type") || "audit";
    const sql = getSql();

    if (type === "warnings") {
      const rows = await sql`
        SELECT id, student_local_id, student_name, exam_local_id, exam_name, warning_type, message, created_at
        FROM portal_warning_logs
        WHERE school_id = ${session.schoolId}::uuid
        ORDER BY created_at DESC
        LIMIT 500
      `;
      const events = rows as Record<string, any>[];

      // Group By Student
      const byStudentMap = new Map<string, { student_local_id: number; student_name: string; count: number; exams: Set<string>; last_at: string }>();
      // Group By Exam
      const byExamMap = new Map<string, { student_local_id: number; student_name: string; exam_local_id: number; exam_name: string; count: number; reasons: Set<string>; last_at: string }>();

      for (const ev of events) {
        const sKey = `${ev.student_local_id}:${ev.student_name}`;
        const curS = byStudentMap.get(sKey) || {
          student_local_id: Number(ev.student_local_id || 0),
          student_name: String(ev.student_name || "Student"),
          count: 0,
          exams: new Set<string>(),
          last_at: String(ev.created_at),
        };
        curS.count++;
        if (ev.exam_name) curS.exams.add(String(ev.exam_name));
        byStudentMap.set(sKey, curS);

        const eKey = `${ev.student_local_id}:${ev.exam_local_id}:${ev.exam_name}`;
        const curE = byExamMap.get(eKey) || {
          student_local_id: Number(ev.student_local_id || 0),
          student_name: String(ev.student_name || "Student"),
          exam_local_id: Number(ev.exam_local_id || 0),
          exam_name: String(ev.exam_name || "Exam"),
          count: 0,
          reasons: new Set<string>(),
          last_at: String(ev.created_at),
        };
        curE.count++;
        if (ev.message) curE.reasons.add(String(ev.message));
        byExamMap.set(eKey, curE);
      }

      const by_student = Array.from(byStudentMap.values())
        .map((x) => ({ ...x, exams: Array.from(x.exams) }))
        .sort((a, b) => b.count - a.count);
      const by_exam = Array.from(byExamMap.values())
        .map((x) => ({ ...x, reasons: Array.from(x.reasons) }))
        .sort((a, b) => b.count - a.count);

      return NextResponse.json({
        ok: true,
        stats: {
          flagged_students: by_student.length,
          total_events: events.length,
          sessions_flagged: by_exam.length,
        },
        by_student,
        by_exam,
        events,
      });
    }

    const rows = await sql`
      SELECT id, actor_role, actor_username, action, details, created_at
      FROM portal_audit_logs
      WHERE school_id = ${session.schoolId}::uuid
      ORDER BY created_at DESC
      LIMIT 400
    `;
    const logs = rows as Record<string, any>[];
    const stats = {
      total: logs.length,
      admin: logs.filter((l) => String(l.actor_role).toLowerCase() === "admin").length,
      teacher: logs.filter((l) => String(l.actor_role).toLowerCase() === "teacher").length,
      student: logs.filter((l) => String(l.actor_role).toLowerCase() === "student").length,
    };
    return NextResponse.json({ ok: true, stats, logs });
  } catch (err) {
    console.error("Portal logs GET error:", err);
    return NextResponse.json({ ok: false, message: "Could not load logs." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const scope = req.nextUrl.searchParams.get("scope") || "single";
    const id = Number(req.nextUrl.searchParams.get("id") || 0);
    const studentName = req.nextUrl.searchParams.get("student_name") || "";
    const studentLocalId = Number(req.nextUrl.searchParams.get("student_local_id") || 0);
    const sql = getSql();

    if (scope === "all") {
      await sql`DELETE FROM portal_warning_logs WHERE school_id = ${session.schoolId}::uuid`;
      await logPortalAudit({
        schoolId: session.schoolId,
        actorRole: "admin",
        actorUsername: session.username,
        action: "Cleared all integrity warning logs",
      });
      return NextResponse.json({ ok: true, message: "All warning logs cleared." });
    }

    if (scope === "student") {
      if (studentLocalId > 0) {
        await sql`
          DELETE FROM portal_warning_logs
          WHERE school_id = ${session.schoolId}::uuid AND student_local_id = ${studentLocalId}
        `;
      } else if (studentName) {
        await sql`
          DELETE FROM portal_warning_logs
          WHERE school_id = ${session.schoolId}::uuid AND student_name = ${studentName}
        `;
      }
      await logPortalAudit({
        schoolId: session.schoolId,
        actorRole: "admin",
        actorUsername: session.username,
        action: `Cleared warning logs for ${studentName || `student #${studentLocalId}`}`,
      });
      return NextResponse.json({ ok: true, message: "Student warning logs cleared." });
    }

    if (id > 0) {
      await sql`
        DELETE FROM portal_warning_logs
        WHERE school_id = ${session.schoolId}::uuid AND id = ${id}
      `;
      return NextResponse.json({ ok: true, message: "Warning event removed." });
    }

    return NextResponse.json({ ok: false, message: "Invalid delete parameters." }, { status: 400 });
  } catch (err) {
    console.error("Portal logs DELETE error:", err);
    return NextResponse.json({ ok: false, message: "Could not delete warning logs." }, { status: 500 });
  }
}
