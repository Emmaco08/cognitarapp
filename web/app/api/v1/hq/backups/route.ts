import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireHqAdmin } from "@/lib/auth";
import { getPlatformSettings, logDeveloperAudit } from "@/lib/platform";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "HQ admin access required." }, { status: 403 });
    }

    const sql = getSql();
    const [settings, backups, schoolHealth] = await Promise.all([
      getPlatformSettings(),
      sql`
        SELECT b.id, b.school_id, b.filename, b.label, b.app_version,
               b.raw_size_bytes, b.compressed_bytes, b.sha256, b.stats_json, b.created_at,
               s.school_name, u.email AS owner_email
        FROM cloud_exam_backups b
        JOIN schools s ON s.id = b.school_id
        LEFT JOIN users_hq u ON u.id = b.user_id
        ORDER BY b.created_at DESC
        LIMIT 150
      `,
      sql`
        SELECT s.id AS school_id, s.school_name, s.status, s.last_cloud_backup_at, s.created_at,
               u.email AS owner_email,
               (SELECT COUNT(*)::int FROM cloud_exam_backups b WHERE b.school_id = s.id) AS backup_count,
               (SELECT COALESCE(SUM(b.compressed_bytes), 0)::bigint FROM cloud_exam_backups b WHERE b.school_id = s.id) AS storage_bytes
        FROM schools s
        JOIN users_hq u ON u.id = s.owner_user_id
        WHERE s.status = 'active'
        ORDER BY s.last_cloud_backup_at ASC NULLS FIRST
        LIMIT 200
      `,
    ]);

    const reminderDays = settings.backup_reminder_days;
    const cutoffMs = Date.now() - reminderDays * 86400 * 1000;
    const overdueCount = schoolHealth.filter((s: Record<string, any>) => {
      if (!s.last_cloud_backup_at) return true;
      return new Date(s.last_cloud_backup_at).getTime() < cutoffMs;
    }).length;
    const totalStorageBytes = schoolHealth.reduce((acc: number, s: Record<string, any>) => acc + Number(s.storage_bytes || 0), 0);

    return NextResponse.json({
      ok: true,
      backup_reminder_days: reminderDays,
      summary: {
        total_backups: backups.length,
        total_storage_bytes: totalStorageBytes,
        active_schools: schoolHealth.length,
        overdue_schools: overdueCount,
      },
      school_health: schoolHealth,
      backups,
    });
  } catch (err) {
    console.error("HQ backups GET error:", err);
    return NextResponse.json({ ok: false, error: "hq_backups_failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const days = Math.max(1, Math.min(365, Math.floor(Number(body?.backup_reminder_days || 7))));

    const sql = getSql();
    await sql`
      UPDATE platform_settings
      SET backup_reminder_days = ${days}, updated_by = ${hq.user.id}::uuid, updated_at = NOW()
      WHERE id = 1
    `;

    await logDeveloperAudit({
      actorUserId: hq.user.id,
      actorEmail: hq.user.email,
      action: "hq_update_backup_reminder",
      targetType: "platform_settings",
      targetId: "1",
      ipAddress: getClientIp(req),
      details: { backup_reminder_days: days },
    });

    return NextResponse.json({
      ok: true,
      backup_reminder_days: days,
      message: `School exam backup reminder updated to every ${days} day${days === 1 ? "" : "s"}.`,
    });
  } catch (err) {
    console.error("HQ backups PUT error:", err);
    return NextResponse.json({ ok: false, message: "Could not update backup reminder interval." }, { status: 500 });
  }
}
