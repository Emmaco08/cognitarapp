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
      return NextResponse.json({ ok: false, error: "forbidden", message: "Developer HQ access required." }, { status: 403 });
    }
    const sql = getSql();
    const plans = await sql`
      SELECT p.*,
        (SELECT COUNT(*)::int FROM licenses l WHERE l.plan_id = p.id) AS licenses_issued,
        (SELECT COUNT(*)::int FROM subscriptions_payments sp WHERE sp.plan_id = p.id AND sp.status = 'success') AS paid_orders
      FROM plans p
      ORDER BY p.sort_order ASC, p.created_at ASC
    `;
    return NextResponse.json({ ok: true, plans });
  } catch (err) {
    console.error("HQ plans GET error:", err);
    return NextResponse.json({ ok: false, error: "hq_plans_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "Developer HQ access required." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
    }

    const id = body.id ? String(body.id).trim() : null;
    const displayName = String(body.display_name || "").trim().slice(0, 100);
    const rawSlug = String(body.slug || displayName).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
    const description = String(body.description || "").trim().slice(0, 280);
    const badge = String(body.badge || "").trim().slice(0, 40);
    const billingCycle = String(body.billing_cycle || "annual").trim().toLowerCase().slice(0, 32);
    const planTier = ["monthly", "termly", "annual", "lifetime", "custom"].includes(String(body.plan_tier || billingCycle).toLowerCase())
      ? String(body.plan_tier || billingCycle).toLowerCase()
      : "custom";
    const durationDays =
      body.duration_days === "" || body.duration_days === null || body.duration_days === undefined || Number(body.duration_days) <= 0
        ? null
        : Math.floor(Number(body.duration_days));
    const leaseDays = Math.max(1, Math.min(365, Math.floor(Number(body.lease_days || 30))));
    const priceNgnKobo = Math.max(0, Math.round(Number(body.price_ngn || 0) * 100));
    const priceUsdCents = Math.max(0, Math.round(Number(body.price_usd || 0) * 100));
    const maxDevices = Math.max(1, Math.min(100, Math.floor(Number(body.max_devices || 1))));
    const sortOrder = Math.floor(Number(body.sort_order ?? 10));
    const isActive = body.is_active !== false;
    const highlights = Array.isArray(body.highlights)
      ? body.highlights.map((x) => String(x).trim()).filter(Boolean)
      : String(body.highlights || "")
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter(Boolean);

    if (!displayName || !rawSlug) {
      return NextResponse.json({ ok: false, message: "Plan name and slug are required." }, { status: 400 });
    }

    const sql = getSql();
    const featuresJson = JSON.stringify({ highlights });

    let saved;
    if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      const updated = await sql`
        UPDATE plans
        SET slug = ${rawSlug},
            display_name = ${displayName},
            description = ${description},
            badge = ${badge},
            sort_order = ${sortOrder},
            billing_cycle = ${billingCycle},
            plan_tier = ${planTier},
            duration_days = ${durationDays},
            lease_days = ${leaseDays},
            price_ngn_kobo = ${priceNgnKobo},
            price_usd_cents = ${priceUsdCents},
            max_devices = ${maxDevices},
            features_json = ${featuresJson}::jsonb,
            is_active = ${isActive},
            updated_at = NOW()
        WHERE id = ${id}::uuid
        RETURNING *
      `;
      saved = updated[0];
    } else {
      const inserted = await sql`
        INSERT INTO plans (
          slug, display_name, description, badge, sort_order, billing_cycle, plan_tier,
          duration_days, lease_days, price_ngn_kobo, price_usd_cents, max_devices, features_json, is_active
        ) VALUES (
          ${rawSlug}, ${displayName}, ${description}, ${badge}, ${sortOrder}, ${billingCycle}, ${planTier},
          ${durationDays}, ${leaseDays}, ${priceNgnKobo}, ${priceUsdCents}, ${maxDevices}, ${featuresJson}::jsonb, ${isActive}
        )
        RETURNING *
      `;
      saved = inserted[0];
    }

    await logDeveloperAudit({
      actorUserId: hq.user.id,
      actorEmail: hq.user.email,
      action: id ? "hq_update_plan" : "hq_create_plan",
      targetType: "plan",
      targetId: saved?.id,
      ipAddress: getClientIp(req),
      details: { slug: rawSlug, display_name: displayName, price_ngn_kobo: priceNgnKobo, price_usd_cents: priceUsdCents, is_active: isActive },
    });

    return NextResponse.json({ ok: true, plan: saved, message: id ? `Updated plan "${displayName}".` : `Created plan "${displayName}".` });
  } catch (err: any) {
    console.error("HQ plans POST error:", err);
    const msg = String(err?.message || "").includes("unique")
      ? "A plan with this slug already exists."
      : "Could not save plan.";
    return NextResponse.json({ ok: false, message: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    const id = req.nextUrl.searchParams.get("id") || "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ ok: false, message: "Invalid plan ID." }, { status: 400 });
    }
    const sql = getSql();
    // If referenced by licenses/payments, deactivate instead of hard deleting to preserve ledger integrity
    const refs = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM licenses WHERE plan_id = ${id}::uuid) +
        (SELECT COUNT(*)::int FROM subscriptions_payments WHERE plan_id = ${id}::uuid) AS cnt
    `;
    if (Number(refs[0]?.cnt || 0) > 0) {
      await sql`UPDATE plans SET is_active = FALSE, updated_at = NOW() WHERE id = ${id}::uuid`;
      return NextResponse.json({ ok: true, archived: true, message: "Plan has existing orders and has been archived (hidden from store)." });
    }
    await sql`DELETE FROM plans WHERE id = ${id}::uuid`;
    await logDeveloperAudit({
      actorUserId: hq.user.id,
      actorEmail: hq.user.email,
      action: "hq_delete_plan",
      targetType: "plan",
      targetId: id,
      ipAddress: getClientIp(req),
    });
    return NextResponse.json({ ok: true, message: "Plan deleted." });
  } catch (err) {
    console.error("HQ plans DELETE error:", err);
    return NextResponse.json({ ok: false, message: "Could not delete plan." }, { status: 500 });
  }
}
