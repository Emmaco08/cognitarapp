import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireHqAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "Developer HQ access required." }, { status: 403 });
    }
    const sql = getSql();
    const logs = await sql`
      SELECT id, actor_email, action, target_type, target_id, ip_address, details_json, created_at
      FROM developer_audit_logs
      ORDER BY created_at DESC
      LIMIT 150
    `;
    return NextResponse.json({ ok: true, logs });
  } catch (err) {
    console.error("HQ audit GET error:", err);
    return NextResponse.json({ ok: false, error: "hq_audit_failed" }, { status: 500 });
  }
}
