import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/platform";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_COMPRESSED_BYTES = 15 * 1024 * 1024; // 15 MB compressed gzipped SQLite snapshot
const MAX_BACKUPS_PER_SCHOOL = 10;

export async function GET(req: NextRequest) {
  try {
    const token = extractBearerOrCookieToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "Sign in required." }, { status: 401 });
    }
    const account = await resolveAuthenticatedAccount(token);
    if (!account || !account.school) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "School account required." }, { status: 401 });
    }

    const sql = getSql();
    const [settings, backups] = await Promise.all([
      getPlatformSettings(),
      sql`
        SELECT id, filename, label, app_version, raw_size_bytes, compressed_bytes, sha256, stats_json, created_at
        FROM cloud_exam_backups
        WHERE school_id = ${account.school.id}::uuid
        ORDER BY created_at DESC
        LIMIT 25
      `,
    ]);

    const latestCreated = backups[0]?.created_at ? new Date(backups[0].created_at).getTime() : null;
    const daysSinceLast =
      latestCreated === null ? null : Math.floor((Date.now() - latestCreated) / (86400 * 1000));
    const reminderDays = settings.backup_reminder_days;
    const backupDue = daysSinceLast === null || daysSinceLast >= reminderDays;

    return NextResponse.json({
      ok: true,
      backup_reminder_days: reminderDays,
      last_backup_at: latestCreated ? new Date(latestCreated).toISOString() : null,
      days_since_last_backup: daysSinceLast,
      backup_due: backupDue,
      max_backups: MAX_BACKUPS_PER_SCHOOL,
      backups,
    });
  } catch (err) {
    console.error("Backups GET error:", err);
    return NextResponse.json({ ok: false, error: "backups_list_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`backup-up:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many backup uploads. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const token = extractBearerOrCookieToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "Sign in required." }, { status: 401 });
    }
    const account = await resolveAuthenticatedAccount(token);
    if (!account || !account.school) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "School account required." }, { status: 401 });
    }
    if (account.school.status !== "active") {
      return NextResponse.json({ ok: false, error: "school_suspended", message: "School account is suspended." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: "Invalid JSON payload." }, { status: 400 });
    }

    const payloadB64 = String(body.payload_b64 || "").trim();
    const filename = String(body.filename || `exam_backup_${new Date().toISOString().slice(0, 10)}.db.gz`)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 120);
    const label = String(body.label || "Exam Database Backup").trim().slice(0, 120);
    const appVersion = body.app_version ? String(body.app_version).trim().slice(0, 32) : "2.2.3";
    const rawSizeBytes = Math.max(0, Math.floor(Number(body.raw_size_bytes || 0)));
    const statsJson = body.stats && typeof body.stats === "object" ? body.stats : {};

    if (!payloadB64 || payloadB64.length < 16) {
      return NextResponse.json({ ok: false, message: "Backup data is empty." }, { status: 400 });
    }

    const buf = Buffer.from(payloadB64, "base64");
    if (buf.length === 0 || buf.length > MAX_COMPRESSED_BYTES) {
      return NextResponse.json(
        { ok: false, message: `Compressed backup must be under ${Math.round(MAX_COMPRESSED_BYTES / (1024 * 1024))} MB.` },
        { status: 413 }
      );
    }

    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
    const sql = getSql();

    const inserted = await sql`
      INSERT INTO cloud_exam_backups (
        school_id, user_id, filename, label, app_version,
        raw_size_bytes, compressed_bytes, sha256, stats_json, payload_b64
      ) VALUES (
        ${account.school.id}::uuid,
        ${account.user.id}::uuid,
        ${filename},
        ${label},
        ${appVersion},
        ${rawSizeBytes || buf.length},
        ${buf.length},
        ${sha256},
        ${JSON.stringify(statsJson)}::jsonb,
        ${payloadB64}
      )
      RETURNING id, filename, label, app_version, raw_size_bytes, compressed_bytes, sha256, stats_json, created_at
    `;

    await sql`
      UPDATE schools SET last_cloud_backup_at = NOW(), updated_at = NOW()
      WHERE id = ${account.school.id}::uuid
    `;

    // Keep latest MAX_BACKUPS_PER_SCHOOL snapshots cleanly
    await sql`
      DELETE FROM cloud_exam_backups
      WHERE school_id = ${account.school.id}::uuid
        AND id NOT IN (
          SELECT id FROM cloud_exam_backups
          WHERE school_id = ${account.school.id}::uuid
          ORDER BY created_at DESC
          LIMIT ${MAX_BACKUPS_PER_SCHOOL}
        )
    `;

    return NextResponse.json(
      {
        ok: true,
        backup: inserted[0],
        message: "Exam database safely backed up to CogniTara Cloud.",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Backups POST error:", err);
    return NextResponse.json({ ok: false, message: "Could not upload cloud backup right now." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = extractBearerOrCookieToken(req);
    if (!token) return NextResponse.json({ ok: false, message: "Sign in required." }, { status: 401 });
    const account = await resolveAuthenticatedAccount(token);
    if (!account) return NextResponse.json({ ok: false, message: "Session expired." }, { status: 401 });

    const id = String(req.nextUrl.searchParams.get("id") || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ ok: false, message: "Invalid backup ID." }, { status: 400 });
    }

    const sql = getSql();
    const isHq = account.user.role === "hq_super_admin" || account.user.role === "hq_admin";
    if (isHq) {
      await sql`DELETE FROM cloud_exam_backups WHERE id = ${id}::uuid`;
    } else if (account.school) {
      await sql`DELETE FROM cloud_exam_backups WHERE id = ${id}::uuid AND school_id = ${account.school.id}::uuid`;
    } else {
      return NextResponse.json({ ok: false, message: "Forbidden." }, { status: 403 });
    }

    return NextResponse.json({ ok: true, message: "Cloud backup deleted." });
  } catch (err) {
    console.error("Backups DELETE error:", err);
    return NextResponse.json({ ok: false, message: "Could not delete backup." }, { status: 500 });
  }
}
