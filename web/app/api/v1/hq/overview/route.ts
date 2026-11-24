import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireHqAdmin } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "Developer HQ super-admin access required." }, { status: 403 });
    }

    const sql = getSql();
    const [
      userCounts,
      schoolCounts,
      licenseCounts,
      revenueRows,
      heartbeatRows,
      promoRows,
      recentPurchases,
      recentAudit,
      settings,
    ] = await Promise.all([
      sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='active')::int AS active FROM users_hq WHERE role != 'hq_super_admin'`,
      sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='active')::int AS active, COUNT(*) FILTER (WHERE status='banned')::int AS banned, COUNT(*) FILTER (WHERE status='suspended')::int AS suspended, COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '24 hours')::int AS active_24h FROM schools`,
      sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status IN ('active','issued'))::int AS active, COUNT(*) FILTER (WHERE status='revoked')::int AS revoked FROM licenses`,
      sql`
        SELECT
          COALESCE(SUM(amount_minor) FILTER (WHERE status='success' AND currency='NGN'), 0)::bigint AS revenue_ngn_kobo,
          COALESCE(SUM(amount_minor) FILTER (WHERE status='success' AND currency='USD'), 0)::bigint AS revenue_usd_cents,
          COUNT(*) FILTER (WHERE status='success')::int AS paid_count,
          COUNT(*) FILTER (WHERE status='initialized')::int AS pending_count,
          COUNT(*) FILTER (WHERE status='refunded')::int AS refunded_count,
          COALESCE(SUM(discount_amount_minor) FILTER (WHERE status='success'), 0)::bigint AS total_discount_minor
        FROM subscriptions_payments
      `,
      sql`SELECT COUNT(*)::int AS beats_24h, COUNT(DISTINCT license_id)::int AS active_devices_24h FROM license_heartbeats WHERE server_utc > NOW() - INTERVAL '24 hours'`,
      sql`SELECT COUNT(*)::int AS total_codes, COUNT(*) FILTER (WHERE is_active=TRUE)::int AS active_codes, COALESCE(SUM(uses_count), 0)::int AS total_redemptions FROM promo_codes`,
      sql`
        SELECT sp.id, sp.paystack_reference, sp.currency, sp.amount_minor, sp.original_amount_minor,
               sp.discount_amount_minor, sp.promo_code_text, sp.payment_channel, sp.status, sp.paid_at, sp.created_at,
               s.school_name, u.email, p.display_name AS plan_name
        FROM subscriptions_payments sp
        JOIN schools s ON s.id = sp.school_id
        JOIN users_hq u ON u.id = sp.user_id
        JOIN plans p ON p.id = sp.plan_id
        ORDER BY sp.created_at DESC
        LIMIT 12
      `,
      sql`
        SELECT id, actor_email, action, target_type, target_id, ip_address, details_json, created_at
        FROM developer_audit_logs
        ORDER BY created_at DESC
        LIMIT 15
      `,
      getPlatformSettings(),
    ]);

    return NextResponse.json({
      ok: true,
      hq_user: hq.user,
      metrics: {
        users_total: userCounts[0]?.total || 0,
        users_active: userCounts[0]?.active || 0,
        schools_total: schoolCounts[0]?.total || 0,
        schools_active: schoolCounts[0]?.active || 0,
        schools_banned: schoolCounts[0]?.banned || 0,
        schools_suspended: schoolCounts[0]?.suspended || 0,
        schools_seen_24h: schoolCounts[0]?.active_24h || 0,
        licenses_total: licenseCounts[0]?.total || 0,
        licenses_active: licenseCounts[0]?.active || 0,
        licenses_revoked: licenseCounts[0]?.revoked || 0,
        revenue_ngn_kobo: Number(revenueRows[0]?.revenue_ngn_kobo || 0),
        revenue_usd_cents: Number(revenueRows[0]?.revenue_usd_cents || 0),
        paid_orders: revenueRows[0]?.paid_count || 0,
        pending_orders: revenueRows[0]?.pending_count || 0,
        refunded_orders: revenueRows[0]?.refunded_count || 0,
        total_discount_minor: Number(revenueRows[0]?.total_discount_minor || 0),
        heartbeats_24h: heartbeatRows[0]?.beats_24h || 0,
        active_devices_24h: heartbeatRows[0]?.active_devices_24h || 0,
        promo_codes_total: promoRows[0]?.total_codes || 0,
        promo_codes_active: promoRows[0]?.active_codes || 0,
        promo_redemptions: promoRows[0]?.total_redemptions || 0,
      },
      recent_purchases: recentPurchases,
      recent_audit: recentAudit,
      platform: {
        paystack_configured: Boolean(settings.paystack_public_key && settings.paystack_secret_configured),
        paystack_mode: settings.paystack_mode,
        maintenance_mode: settings.maintenance_mode,
        global_announcement: settings.global_announcement,
        min_desktop_version: settings.min_desktop_version,
        allow_self_signup: settings.allow_self_signup,
        allow_paystack_checkout: settings.allow_paystack_checkout,
      },
    });
  } catch (err) {
    console.error("HQ overview error:", err);
    return NextResponse.json({ ok: false, error: "hq_overview_failed" }, { status: 500 });
  }
}
