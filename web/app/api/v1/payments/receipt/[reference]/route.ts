import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";
import { getPlatformSettings, paystackRequest } from "@/lib/platform";
import { fulfillConfirmedPaystackPayment } from "@/lib/paystack-fulfill";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ reference: string }> }
) {
  try {
    const { reference: rawRef } = await context.params;
    const reference = decodeURIComponent(String(rawRef || "")).trim();
    if (!reference) {
      return NextResponse.json({ ok: false, message: "Reference required." }, { status: 400 });
    }

    const sql = getSql();
    const token = extractBearerOrCookieToken(req);
    const account = token ? await resolveAuthenticatedAccount(token) : null;

    // Fetch order record
    const rows = await sql`
      SELECT
        sp.*,
        p.display_name AS plan_name, p.slug AS plan_slug, p.duration_days,
        s.school_name,
        u.email AS owner_email, u.full_name AS owner_name
      FROM subscriptions_payments sp
      JOIN plans p ON p.id = sp.plan_id
      JOIN schools s ON s.id = sp.school_id
      JOIN users_hq u ON u.id = sp.user_id
      WHERE sp.paystack_reference = ${reference}
      LIMIT 1
    `;
    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "not_found", message: "Payment reference not found." }, { status: 404 });
    }
    let pay = rows[0] as Record<string, any>;

    // If payment is still initialized, automatically verify with Paystack right now!
    // (Allows `/pay/done?reference=...` to confirm immediately even when Desktop opens Paystack in external browser where user isn't logged into web cookies!)
    if (pay.status === "initialized" && pay.payment_channel === "paystack") {
      const settings = await getPlatformSettings();
      const secretKey = pay.is_test
        ? settings.paystack_test_secret_key || settings.paystack_secret_key
        : settings.paystack_live_secret_key || settings.paystack_secret_key;

      if (secretKey) {
        const psRes = await paystackRequest(secretKey, `/transaction/verify/${encodeURIComponent(reference)}`, "GET");
        const tx = psRes.data?.data;
        if (psRes.ok && tx) {
          const expectedCur = String(pay.currency || "NGN").trim().toUpperCase();
          const actualCur = String(tx.currency || expectedCur).trim().toUpperCase();
          const expectedMin = Number(pay.customer_paid_minor || pay.amount_minor || 0);
          if (tx.status === "success" && actualCur === expectedCur && Number(tx.amount || 0) >= expectedMin) {
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
                  step: "Paystack API verified on receipt page",
                  ok: true,
                  detail: `Transaction #${tx.id} · ${actualCur} ${(Number(tx.amount) / 100).toLocaleString()} via ${tx.channel || "paystack"}`,
                  at: new Date().toISOString(),
                },
              ],
              rawPayload: tx,
              ipAddress: getClientIp(req),
              originUrl: req.nextUrl.origin,
            });
            pay = { ...pay, ...fulfilled.payment };
          } else if (tx.status === "failed") {
            await sql`UPDATE subscriptions_payments SET status = 'failed' WHERE id = ${pay.id}::uuid AND status = 'initialized'`;
            pay = { ...pay, status: "failed" };
          }
        }
      }
    }

    const isOwnerOrHq =
      Boolean(account) &&
      (account!.user.id === pay.user_id ||
        account!.user.role === "hq_super_admin" ||
        account!.user.role === "hq_admin");

    const lics = await sql`
      SELECT id, license_key, plan_tier, status, issued_at, expires_at, signed_lease_json
      FROM licenses
      WHERE latest_payment_id = ${pay.id}::uuid
      LIMIT 1
    `;
    const lic = (lics[0] as Record<string, any>) || null;

    // Mask email if viewed from unauthenticated external browser callback (e.g. Desktop Paystack redirect)
    const emailStr = String(pay.owner_email || "");
    const maskedEmail = isOwnerOrHq
      ? emailStr
      : emailStr.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => `${a}${"•".repeat(Math.min(6, b.length))}${c}`);

    return NextResponse.json({
      ok: true,
      authenticated: isOwnerOrHq,
      status: pay.status,
      receipt: {
        reference: pay.paystack_reference,
        school_name: pay.school_name,
        owner_name: pay.owner_name,
        email: maskedEmail,
        plan_name: pay.plan_name,
        plan_slug: pay.plan_slug,
        currency: String(pay.currency || "NGN").trim(),
        original_amount_minor: Number(pay.original_amount_minor || pay.amount_minor || 0),
        discount_amount_minor: Number(pay.discount_amount_minor || 0),
        amount_minor: Number(pay.amount_minor || 0),
        fee_minor: Number(pay.fee_minor || 0),
        customer_paid_minor: Number(pay.customer_paid_minor || pay.amount_minor || 0),
        promo_code: pay.promo_code_text || null,
        channel: pay.paystack_sub_channel ? `Paystack · ${pay.paystack_sub_channel}` : pay.payment_channel === "redeem_code" ? "100% Code" : "Paystack",
        is_test: Boolean(pay.is_test),
        paid_at: pay.paid_at,
        created_at: pay.created_at,
      },
      license: lic
        ? {
            id: lic.id,
            license_key: lic.license_key,
            plan_tier: lic.plan_tier,
            status: lic.status,
            issued_at: lic.issued_at,
            expires_at: lic.expires_at,
            signed_lease: isOwnerOrHq ? lic.signed_lease_json || null : null,
          }
        : null,
    });
  } catch (err) {
    console.error("Receipt lookup error:", err);
    return NextResponse.json({ ok: false, message: "Could not check payment status right now." }, { status: 500 });
  }
}
