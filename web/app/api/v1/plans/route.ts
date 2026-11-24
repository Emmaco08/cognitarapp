import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { getPlatformSettings, toPublicPlatformDirectives } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = getSql();
    const [plans, settings] = await Promise.all([
      sql`
        SELECT id, slug, display_name, description, badge, sort_order, billing_cycle, plan_tier,
               duration_days, lease_days, price_ngn_kobo, price_usd_cents, max_devices, features_json
        FROM plans
        WHERE is_active = TRUE
        ORDER BY sort_order ASC, price_ngn_kobo ASC
      `,
      getPlatformSettings(),
    ]);

    return NextResponse.json({
      ok: true,
      server_utc: Math.floor(Date.now() / 1000),
      plans: plans.map((p: Record<string, any>) => ({
        id: p.id,
        slug: p.slug,
        display_name: p.display_name,
        description: p.description || "",
        badge: p.badge || "",
        sort_order: Number(p.sort_order || 0),
        billing_cycle: p.billing_cycle,
        plan_tier: p.plan_tier || p.billing_cycle || "annual",
        duration_days: p.duration_days === null ? null : Number(p.duration_days),
        lease_days: Number(p.lease_days || 30),
        price_ngn_kobo: Number(p.price_ngn_kobo || 0),
        price_usd_cents: Number(p.price_usd_cents || 0),
        max_devices: Number(p.max_devices || 1),
        features: p.features_json || {},
      })),
      platform: toPublicPlatformDirectives(settings),
    });
  } catch (err) {
    console.error("GET /api/v1/plans error:", err);
    return NextResponse.json({ ok: false, error: "plans_load_failed", message: "Could not load plans." }, { status: 500 });
  }
}
