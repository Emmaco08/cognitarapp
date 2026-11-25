import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ backupId: string }> }
) {
  try {
    const token = extractBearerOrCookieToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, message: "Sign in required." }, { status: 401 });
    }
    const account = await resolveAuthenticatedAccount(token);
    if (!account) {
      return NextResponse.json({ ok: false, message: "Session expired." }, { status: 401 });
    }

    const { backupId } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(backupId)) {
      return NextResponse.json({ ok: false, message: "Invalid backup ID." }, { status: 400 });
    }

    const sql = getSql();
    const isHq = account.user.role === "hq_super_admin" || account.user.role === "hq_admin";
    const rows = isHq
      ? await sql`SELECT * FROM cloud_exam_backups WHERE id = ${backupId}::uuid LIMIT 1`
      : account.school
      ? await sql`SELECT * FROM cloud_exam_backups WHERE id = ${backupId}::uuid AND school_id = ${account.school.id}::uuid LIMIT 1`
      : [];

    if (!rows.length) {
      return NextResponse.json({ ok: false, message: "Backup not found." }, { status: 404 });
    }

    const b = rows[0] as Record<string, any>;
    const format = req.nextUrl.searchParams.get("format");
    if (format === "json") {
      return NextResponse.json({
        ok: true,
        backup: {
          id: b.id,
          filename: b.filename,
          label: b.label,
          sha256: b.sha256,
          raw_size_bytes: b.raw_size_bytes,
          compressed_bytes: b.compressed_bytes,
          created_at: b.created_at,
          payload_b64: b.payload_b64,
        },
      });
    }

    const binary = Buffer.from(String(b.payload_b64 || ""), "base64");
    return new NextResponse(binary, {
      status: 200,
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${String(b.filename || "exam_backup.db.gz").replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
        "X-Backup-SHA256": String(b.sha256 || ""),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Backup download error:", err);
    return NextResponse.json({ ok: false, message: "Could not download backup." }, { status: 500 });
  }
}
