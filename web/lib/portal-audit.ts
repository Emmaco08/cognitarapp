import { getSql } from "./db";

export async function logPortalAudit(params: {
  schoolId: string;
  actorRole: string;
  actorUsername: string;
  action: string;
  details?: string;
}): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO portal_audit_logs (school_id, actor_role, actor_username, action, details)
      VALUES (
        ${params.schoolId}::uuid,
        ${String(params.actorRole || "admin").slice(0, 30)},
        ${String(params.actorUsername || "").slice(0, 100)},
        ${String(params.action || "").slice(0, 160)},
        ${String(params.details || "").slice(0, 500)}
      )
    `;
  } catch (err) {
    console.warn("logPortalAudit non-fatal error:", err);
  }
}

export async function logPortalWarning(params: {
  schoolId: string;
  studentLocalId: number;
  studentName: string;
  examLocalId: number;
  examName: string;
  warningType?: string;
  message: string;
}): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO portal_warning_logs (
        school_id, student_local_id, student_name, exam_local_id, exam_name, warning_type, message
      )
      VALUES (
        ${params.schoolId}::uuid,
        ${Math.floor(params.studentLocalId || 0)},
        ${String(params.studentName || "").slice(0, 140)},
        ${Math.floor(params.examLocalId || 0)},
        ${String(params.examName || "").slice(0, 180)},
        ${String(params.warningType || "focus_loss").slice(0, 60)},
        ${String(params.message || "Focus lost or tab switched").slice(0, 300)}
      )
    `;
  } catch (err) {
    console.warn("logPortalWarning non-fatal error:", err);
  }
}
