import { NextRequest, NextResponse } from "next/server";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";
import { getPortalSessionFromRequest } from "@/lib/portal-auth";
import { syncLatestCloudBackupToPortal, syncSqliteBufferToOnlinePortal } from "@/lib/portal-sync";

export const dynamic = "force-dynamic";

async function resolveAdminSchoolId(req: NextRequest): Promise<string | null> {
  const cloudToken = extractBearerOrCookieToken(req);
  if (cloudToken) {
    const account = await resolveAuthenticatedAccount(cloudToken);
    if (account?.school?.id && account.school.status === "active") {
      return String(account.school.id);
    }
  }
  const portalSess = getPortalSessionFromRequest(req);
  if (portalSess && portalSess.role === "admin") {
    return portalSess.schoolId;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const schoolId = await resolveAdminSchoolId(req);
    if (!schoolId) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "School admin sign-in required." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Mode 1: Direct .db or .db.gz upload (base64, <= 4 MB for Free Vercel body limit)
    if (typeof body.payload_b64 === "string" && body.payload_b64.trim().length > 32) {
      const buf = Buffer.from(body.payload_b64.trim(), "base64");
      if (buf.length > 4 * 1024 * 1024) {
        return NextResponse.json(
          { ok: false, message: "Direct upload exceeds 4 MB. Upload via CogniTara Studio Desktop Cloud Backup instead." },
          { status: 413 }
        );
      }
      const summary = await syncSqliteBufferToOnlinePortal({
        schoolId,
        rawOrGzipBuffer: buf,
        sourceBackupId: null,
      });
      return NextResponse.json({
        ok: true,
        summary,
        message: `Synced ${summary.students} students, ${summary.teachers} teachers, ${summary.exams} exams, and ${summary.questions} questions to your Online Exam Portal.`,
      });
    }

    // Mode 2: Hydrate from latest (or specific) cloud_exam_backups snapshot in Neon
    const backupId = typeof body.backup_id === "string" && body.backup_id.trim() ? body.backup_id.trim() : null;
    const summary = await syncLatestCloudBackupToPortal(schoolId, backupId);
    return NextResponse.json({
      ok: true,
      summary,
      message: `Synced "${summary.backup_filename}": ${summary.students} students, ${summary.teachers} teachers, ${summary.exams} exams, and ${summary.questions} questions are live in your Online Portal.`,
    });
  } catch (err) {
    console.error("Portal sync error:", err);
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Could not sync school database to Online Portal." },
      { status: 500 }
    );
  }
}
