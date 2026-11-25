import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireHqAdmin } from "@/lib/auth";
import { signRevocationTombstone } from "@/lib/crypto";
import { getPlatformSettings, logDeveloperAudit, paystackRequest } from "@/lib/platform";
import { fulfillConfirmedPaystackPayment, reverseReferralOnRefund } from "@/lib/paystack-fulfill";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "HQ admin access required." }, { status: 403 });
    }

    const filter = (req.nextUrl.searchParams.get("filter") || req.nextUrl.searchParams.get("status") || "all").trim().toLowerCase();
    const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
    const sql = getSql();

    const [rows, kpiRows] = await Promise.all([
      sql`
        SELECT
          sp.id, sp.paystack_reference, sp.paystack_transaction_id, sp.currency,
          sp.amount_minor, sp.original_amount_minor, sp.discount_amount_minor,
          sp.fee_minor, sp.customer_paid_minor, sp.is_test,
          sp.promo_code_text, sp.payment_channel, sp.paystack_sub_channel,
          sp.verification_checks_json, sp.status, sp.paid_at, sp.refunded_at, sp.refund_reason,
          sp.created_at, sp.notes,
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
      `,
      // Real revenue KPIs STRICTLY EXCLUDE test payments (`is_test = FALSE`)
      sql`
        SELECT
          COALESCE(SUM(amount_minor) FILTER (
            WHERE status = 'success' AND is_test = FALSE AND currency = 'NGN'
              AND COALESCE(paid_at, created_at) >= DATE_TRUNC('day', NOW())
          ), 0)::bigint AS paid_today_ngn_minor,
          COALESCE(SUM(amount_minor) FILTER (
            WHERE status = 'success' AND is_test = FALSE AND currency = 'NGN'
              AND COALESCE(paid_at, created_at) >= DATE_TRUNC('month', NOW())
          ), 0)::bigint AS paid_month_ngn_minor,
          COUNT(*) FILTER (
            WHERE status = 'initialized' AND created_at >= NOW() - INTERVAL '24 hours'
          )::int AS waiting_24h_count,
          COALESCE(SUM(amount_minor) FILTER (
            WHERE status = 'refunded' AND is_test = FALSE AND currency = 'NGN'
              AND COALESCE(refunded_at, created_at) >= DATE_TRUNC('month', NOW())
          ), 0)::bigint AS refunded_month_ngn_minor,
          COUNT(*) FILTER (WHERE is_test = TRUE)::int AS test_payments_count
        FROM subscriptions_payments
      `,
    ]);

    const filtered = rows.filter((r: Record<string, any>) => {
      if (filter === "paystack" && r.payment_channel !== "paystack") return false;
      if (filter === "redeem_code" && r.payment_channel !== "redeem_code") return false;
      if (filter === "pending" && r.status !== "initialized") return false;
      if (filter === "initialized" && r.status !== "initialized") return false;
      if (filter === "success" && r.status !== "success") return false;
      if (filter === "paid" && r.status !== "success") return false;
      if (filter === "failed" && r.status !== "failed") return false;
      if (filter === "refunded" && r.status !== "refunded") return false;
      if (filter === "test" && !r.is_test) return false;
      if (!q) return true;
      return (
        String(r.paystack_reference || "").toLowerCase().includes(q) ||
        String(r.school_name || "").toLowerCase().includes(q) ||
        String(r.email || "").toLowerCase().includes(q) ||
        String(r.license_key || "").toLowerCase().includes(q) ||
        String(r.promo_code_text || "").toLowerCase().includes(q)
      );
    });

    const kpi = (kpiRows[0] || {}) as Record<string, any>;

    return NextResponse.json({
      ok: true,
      count: filtered.length,
      kpis: {
        paid_today_ngn_minor: Number(kpi.paid_today_ngn_minor || 0),
        paid_month_ngn_minor: Number(kpi.paid_month_ngn_minor || 0),
        waiting_24h_count: Number(kpi.waiting_24h_count || 0),
        refunded_month_ngn_minor: Number(kpi.refunded_month_ngn_minor || 0),
        test_payments_count: Number(kpi.test_payments_count || 0),
      },
      purchases: filtered,
    });
  } catch (err) {
    console.error("HQ purchases GET error:", err);
    return NextResponse.json({ ok: false, error: "hq_purchases_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "HQ admin access required." }, { status: 403 });
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
      const secretKey = pay.is_test
        ? settings.paystack_test_secret_key || settings.paystack_secret_key
        : settings.paystack_live_secret_key || settings.paystack_secret_key;

      const psRes = await paystackRequest(
        secretKey,
        `/transaction/verify/${encodeURIComponent(pay.paystack_reference)}`,
        "GET"
      );
      const tx = psRes.data?.data;
      if (!psRes.ok || !tx || tx.status !== "success") {
        return NextResponse.json(
          { ok: false, message: `Paystack reports: ${tx?.status || psRes.data?.message || "not paid"}` },
          { status: 400 }
        );
      }
      const fulfilled = await fulfillConfirmedPaystackPayment({
        paymentId: pay.id,
        paystackTransactionId: tx.id ? Number(tx.id) : null,
        customerCode: tx.customer?.customer_code || null,
        authorizationSig: tx.authorization?.signature || null,
        paystackSubChannel: tx.channel || null,
        paystackFeeMinor: tx.fees !== undefined ? Number(tx.fees) : null,
        customerPaidMinor: tx.amount !== undefined ? Number(tx.amount) : null,
        isTest: tx.domain === "test" || Boolean(pay.is_test),
        verificationChecks: [
          {
            step: "Manual HQ Paystack re-verify",
            ok: true,
            detail: `Verified by ${hq.user.email} · #${tx.id} (${tx.channel || "paystack"})`,
            at: new Date().toISOString(),
          },
        ],
        rawPayload: tx,
        ipAddress: ip,
        originUrl: req.nextUrl.origin,
      });
      return NextResponse.json({
        ok: true,
        message: `Verified with Paystack! Issued licence ${fulfilled.license.license_key}.`,
        license_key: fulfilled.license.license_key,
      });
    }

    if (action === "force_fulfill") {
      const fulfilled = await fulfillConfirmedPaystackPayment({
        paymentId: pay.id,
        isTest: Boolean(pay.is_test),
        verificationChecks: [
          {
            step: "Manual HQ fulfillment",
            ok: true,
            detail: `Manually confirmed by ${hq.user.email}`,
            at: new Date().toISOString(),
          },
        ],
        ipAddress: ip,
        originUrl: req.nextUrl.origin,
      });
      return NextResponse.json({
        ok: true,
        message: `Manually marked paid & issued licence ${fulfilled.license.license_key}.`,
        license_key: fulfilled.license.license_key,
      });
    }

    if (action === "mark_refunded") {
      const reason = String(body?.reason || "Order refunded by CogniTara HQ").trim().slice(0, 240);
      await sql`
        UPDATE subscriptions_payments
        SET status = 'refunded', refunded_at = NOW(), refund_reason = ${reason}
        WHERE id = ${pay.id}::uuid
      `;
      const lics = await sql`SELECT id FROM licenses WHERE latest_payment_id = ${pay.id}::uuid AND status != 'revoked'`;
      for (const lic of lics) {
        const tomb = signRevocationTombstone({
          licenseId: lic.id,
          reasonCode: "PAYMENT_REFUNDED",
          reasonDetail: reason,
        });
        await sql`
          UPDATE licenses
          SET status = 'revoked', revocation_tombstone_json = ${JSON.stringify(tomb)}::jsonb, updated_at = NOW()
          WHERE id = ${lic.id}::uuid
        `;
      }
      await reverseReferralOnRefund(pay.id);
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_refund_payment",
        targetType: "payment",
        targetId: pay.id,
        ipAddress: ip,
        details: { reference: pay.paystack_reference, reason, revoked_licenses: lics.length },
      });
      return NextResponse.json({ ok: true, message: `Marked refunded, revoked ${lics.length} licence(s), and reversed any referral credit.` });
    }

    return NextResponse.json({ ok: false, message: "Unsupported payment action." }, { status: 400 });
  } catch (err) {
    console.error("HQ purchases POST error:", err);
    return NextResponse.json({ ok: false, error: "hq_payment_action_failed" }, { status: 500 });
  }
}
