import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireHqAdmin } from "@/lib/auth";
import { logDeveloperAudit } from "@/lib/platform";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "HQ admin access required." }, { status: 403 });
    }

    const sql = getSql();
    const [leads, stats] = await Promise.all([
      sql`
        SELECT id, email, source, app_version, ip_address, email_sent,
               clicked_at, download_count, created_at, updated_at
        FROM download_leads
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 500
      `,
      sql`
        SELECT
          COUNT(*)::int AS total_leads,
          COUNT(*) FILTER (WHERE email_sent = TRUE)::int AS emails_sent,
          COUNT(*) FILTER (WHERE download_count > 0)::int AS clicked_leads,
          COALESCE(SUM(download_count), 0)::int AS total_downloads
        FROM download_leads
      `,
    ]);

    return NextResponse.json({
      ok: true,
      summary: {
        total_leads: Number(stats[0]?.total_leads || 0),
        emails_sent: Number(stats[0]?.emails_sent || 0),
        clicked_leads: Number(stats[0]?.clicked_leads || 0),
        total_downloads: Number(stats[0]?.total_downloads || 0),
      },
      leads,
    });
  } catch (err) {
    console.error("GET /api/v1/hq/leads error:", err);
    return NextResponse.json({ ok: false, message: "Could not load download leads." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const body = (await req.json().catch(() => null)) as { id?: string } | null;
    const id = String(body?.id || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ ok: false, message: "Valid lead id required." }, { status: 400 });
    }
    const sql = getSql();
    const deleted = await sql`DELETE FROM download_leads WHERE id = ${id}::uuid RETURNING email`;
    if (deleted.length) {
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_delete_download_lead",
        targetType: "download_lead",
        targetId: id,
        ipAddress: getClientIp(req),
        details: { email: deleted[0].email },
      });
    }
    return NextResponse.json({ ok: true, message: "Lead removed." });
  } catch (err) {
    console.error("DELETE /api/v1/hq/leads error:", err);
    return NextResponse.json({ ok: false, message: "Could not delete lead." }, { status: 500 });
  }
}
