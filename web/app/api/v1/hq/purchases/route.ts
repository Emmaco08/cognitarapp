import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireHqAdmin } from "@/lib/auth";
import { signRevocationTombstone } from "@/lib/crypto";
import { getPlatformSettings, logDeveloperAudit, paystackRequest } from "@/lib/platform";
import { fulfillConfirmedPaystackPayment } from "@/lib/paystack-fulfill";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "Developer HQ access required." }, { status: 403 });
    }

    const status = (req.nextUrl.searchParams.get("status") || "all").trim().toLowerCase();
    const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
    const sql = getSql();

    const rows = await sql`
      SELECT
        sp.id, sp.paystack_reference, sp.paystack_transaction_id, sp.currency,
        sp.amount_minor, sp.original_amount_minor, sp.discount_amount_minor,
        sp.promo_code_text, sp.payment_channel, sp.status, sp.paid_at, sp.created_at, sp.notes,
        s.id AS school_id, s.school_name,
        u.full_name, u.email,
        p.display_name AS plan_name, p.slug AS plan_slug,
        l.id AS license_id, l.license_key, l.status AS license_status
      FROM subscriptions_payments sp
      JOIN schools s ON s.id = sp.school_id
      JOIN users_hq u ON u.id = sp.user_id
      JOIN plans p ON p.id = sp.plan_id
      LEFT JOIN licenses l ON l.latest_payment_id = sp.id
      ORDER BY sp.created_at DESC
      LIMIT 300
    `;

    const filtered = rows.filter((r: Record<string, any>) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return (
        String(r.paystack_reference || "").toLowerCase().includes(q) ||
        String(r.school_name || "").toLowerCase().includes(q) ||
        String(r.email || "").toLowerCase().includes(q) ||
        String(r.license_key || "").toLowerCase().includes(q) ||
        String(r.promo_code_text || "").toLowerCase().includes(q)
      );
    });

    return NextResponse.json({ ok: true, count: filtered.length, purchases: filtered });
  } catch (err) {
    console.error("HQ purchases GET error:", err);
    return NextResponse.json({ ok: false, error: "hq_purchases_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "Developer HQ access required." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const paymentId = String(body?.payment_id || "").trim();
    const action = String(body?.action || "").trim();
    const ip = getClientIp(req);

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) {
      return NextResponse.json({ ok: false, error: "invalid_payment_id", message: "Invalid payment ID." }, { status: 400 });
    }

    const sql = getSql();
    const rows = await sql`SELECT * FROM subscriptions_payments WHERE id = ${paymentId}::uuid LIMIT 1`;
    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "not_found", message: "Payment record not found." }, { status: 404 });
    }
    const pay = rows[0] as Record<string, any>;

    if (action === "verify_paystack") {
      const settings = await getPlatformSettings();
      const psRes = await paystackRequest(
        settings.paystack_secret_key,
        `/transaction/verify/${encodeURIComponent(pay.paystack_reference)}`,
        "GET"
      );
      if (!psRes.ok || psRes.data?.data?.status !== "success") {
        return NextResponse.json(
          { ok: false, message: `Paystack reports: ${psRes.data?.data?.status || psRes.data?.message || "not paid"}` },
          { status: 400 }
        );
      }
      const fulfilled = await fulfillConfirmedPaystackPayment({
        paymentId: pay.id,
        paystackTransactionId: psRes.data.data.id ? Number(psRes.data.data.id) : null,
        customerCode: psRes.data.data.customer?.customer_code || null,
        rawPayload: psRes.data.data,
        ipAddress: ip,
      });
      return NextResponse.json({
        ok: true,
        message: `Verified with Paystack! Issued licence ${fulfilled.license.license_key}.`,
        license_key: fulfilled.license.license_key,
      });
    }

    if (action === "force_fulfill") {
      const fulfilled = await fulfillConfirmedPaystackPayment({ paymentId: pay.id, ipAddress: ip });
      return NextResponse.json({
        ok: true,
        message: `Manually marked paid & issued licence ${fulfilled.license.license_key}.`,
        license_key: fulfilled.license.license_key,
      });
    }

    if (action === "mark_refunded") {
      await sql`UPDATE subscriptions_payments SET status = 'refunded' WHERE id = ${pay.id}::uuid`;
      const lics = await sql`SELECT id FROM licenses WHERE latest_payment_id = ${pay.id}::uuid AND status != 'revoked'`;
      for (const lic of lics) {
        const tomb = signRevocationTombstone({
          licenseId: lic.id,
          reasonCode: "PAYMENT_REFUNDED",
          reasonDetail: "Order refunded by CogniTara HQ",
        });
        await sql`
          UPDATE licenses
          SET status = 'revoked', revocation_tombstone_json = ${JSON.stringify(tomb)}::jsonb, updated_at = NOW()
          WHERE id = ${lic.id}::uuid
        `;
      }
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_refund_payment",
        targetType: "payment",
        targetId: pay.id,
        ipAddress: ip,
        details: { reference: pay.paystack_reference, revoked_licenses: lics.length },
      });
      return NextResponse.json({ ok: true, message: `Marked refunded and revoked ${lics.length} linked licence(s).` });
    }

    return NextResponse.json({ ok: false, message: "Unsupported payment action." }, { status: 400 });
  } catch (err) {
    console.error("HQ purchases POST error:", err);
    return NextResponse.json({ ok: false, error: "hq_payment_action_failed" }, { status: 500 });
  }
}
