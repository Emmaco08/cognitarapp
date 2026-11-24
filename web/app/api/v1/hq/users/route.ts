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

    const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
    const statusFilter = (req.nextUrl.searchParams.get("status") || "all").trim().toLowerCase();
    const sql = getSql();

    const rows = await sql`
      SELECT
        s.id AS school_id,
        s.school_name,
        s.country_code,
        s.state_region,
        s.contact_email,
        s.contact_phone,
        s.status AS school_status,
        s.ban_reason,
        s.custom_notice,
        s.custom_notice_level,
        s.feature_overrides_json,
        s.last_seen_at,
        s.last_app_version,
        s.last_hwid,
        s.created_at,
        u.id AS user_id,
        u.full_name,
        u.email,
        u.phone,
        u.role,
        u.status AS user_status,
        COALESCE(pay_agg.total_paid_ngn, 0)::bigint AS total_paid_ngn,
        COALESCE(pay_agg.orders_count, 0)::int AS orders_count,
        COALESCE(sess_agg.active_sessions, 0)::int AS active_sessions,
        lic.id AS license_id,
        lic.license_key,
        lic.plan_tier,
        lic.plan_name,
        lic.status AS license_status,
        lic.expires_at AS license_expires_at,
        lic.bonus_days_total,
        lic.active_hwids
      FROM schools s
      JOIN users_hq u ON u.id = s.owner_user_id
      LEFT JOIN LATERAL (
        SELECT
          SUM(amount_minor) FILTER (WHERE status='success' AND currency='NGN') AS total_paid_ngn,
          COUNT(*) FILTER (WHERE status='success') AS orders_count
        FROM subscriptions_payments sp
        WHERE sp.school_id = s.id
      ) pay_agg ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS active_sessions
        FROM cloud_sessions cs
        WHERE cs.user_id = u.id AND cs.revoked_at IS NULL AND cs.expires_at > NOW()
      ) sess_agg ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          l.id, l.license_key, l.plan_tier, l.status, l.expires_at, l.bonus_days_total,
          p.display_name AS plan_name,
          (SELECT COUNT(*)::int FROM license_activations la WHERE la.license_id = l.id AND la.is_active = TRUE) AS active_hwids
        FROM licenses l
        LEFT JOIN plans p ON p.id = l.plan_id
        WHERE l.school_id = s.id
        ORDER BY l.created_at DESC
        LIMIT 1
      ) lic ON TRUE
      ORDER BY s.created_at DESC
      LIMIT 300
    `;

    const filtered = rows.filter((r: Record<string, any>) => {
      if (statusFilter !== "all" && r.school_status !== statusFilter) return false;
      if (!q) return true;
      return (
        String(r.school_name || "").toLowerCase().includes(q) ||
        String(r.full_name || "").toLowerCase().includes(q) ||
        String(r.email || "").toLowerCase().includes(q) ||
        String(r.license_key || "").toLowerCase().includes(q) ||
        String(r.last_hwid || "").toLowerCase().includes(q)
      );
    });

    return NextResponse.json({
      ok: true,
      count: filtered.length,
      users: filtered,
    });
  } catch (err) {
    console.error("HQ users list error:", err);
    return NextResponse.json({ ok: false, error: "hq_users_failed" }, { status: 500 });
  }
}
