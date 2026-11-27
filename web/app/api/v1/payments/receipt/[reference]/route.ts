import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { resolveSchoolAccountForRequest } from "@/lib/auth";
import { getPlatformSettings, paystackRequest } from "@/lib/platform";
import { fulfillConfirmedPaystackPayment } from "@/lib/paystack-fulfill";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  appendReceiptGrantCookieValue,
  hasValidReceiptAccess,
  issueReceiptAccessToken,
  RECEIPT_GRANT_COOKIE,
} from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ reference: string }> }
) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`receipt-get:${ip}`, 40, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many receipt requests. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const { reference: rawRef } = await context.params;
    const reference = decodeURIComponent(String(rawRef || "")).trim();
    if (!reference || reference.length > 96) {
      return NextResponse.json({ ok: false, message: "Valid payment reference required." }, { status: 400 });
    }

    const sql = getSql();
    const account = await resolveSchoolAccountForRequest(req);

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

    const isOwnerOrHq =
      Boolean(account) &&
      (account!.user.id === pay.user_id ||
        account!.user.role === "hq_super_admin" ||
        account!.user.role === "hq_admin");
    const hasSignedToken = hasValidReceiptAccess(req, reference);

    // STRICT SECURITY GATE: Never expose licence keys or customer receipts without signed receipt token, HttpOnly grant cookie, or owner/HQ session!
    if (!isOwnerOrHq && !hasSignedToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "receipt_unauthorized",
          message: "Access denied. Open this receipt from your confirmation email link or sign in to the school account that purchased it.",
        },
        { status: 403 }
      );
    }

    // Auto-verify initialized Paystack orders directly against Paystack API
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
          const actualCur = String(tx.currency || "").trim().toUpperCase();
          const expectedMin = Number(pay.customer_paid_minor || pay.amount_minor || 0);
          const txIsTest = tx.domain === "test";
          const orderIsTest = Boolean(pay.is_test);

          if (
            tx.status === "success" &&
            String(tx.reference || "") === reference &&
            actualCur === expectedCur &&
            Number(tx.amount || 0) >= expectedMin &&
            txIsTest === orderIsTest
          ) {
            const fulfilled = await fulfillConfirmedPaystackPayment({
              paymentId: pay.id,
              paystackTransactionId: tx.id ? Number(tx.id) : null,
              customerCode: tx.customer?.customer_code || null,
              authorizationSig: tx.authorization?.signature || null,
              paystackSubChannel: tx.channel || null,
              paystackFeeMinor: tx.fees !== undefined ? Number(tx.fees) : null,
              customerPaidMinor: tx.amount !== undefined ? Number(tx.amount) : null,
              isTest: orderIsTest,
              verificationChecks: [
                {
                  step: "Paystack API verified",
                  ok: true,
                  detail: `Transaction #${tx.id} · ${actualCur} ${(Number(tx.amount) / 100).toLocaleString()} via ${tx.channel || "paystack"}`,
                  at: new Date().toISOString(),
                },
              ],
              rawPayload: tx,
              ipAddress: ip,
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

    const lics = await sql`
      SELECT id, license_key, plan_tier, status, issued_at, expires_at, signed_lease_json
      FROM licenses
      WHERE latest_payment_id = ${pay.id}::uuid
      LIMIT 1
    `;
    const lic = (lics[0] as Record<string, any>) || null;

    const checks: Array<{ step?: string; ok?: boolean; detail?: string }> = Array.isArray(pay.verification_checks_json)
      ? pay.verification_checks_json
      : [];
    const emailCheck = checks.find((c) => String(c.step || "").toLowerCase().includes("receipt email"));

    const receiptTok = issueReceiptAccessToken(reference);
    const schoolDisplay = String(pay.buyer_school_name || pay.school_name || "School");
    const emailDisplay = String(pay.buyer_email || pay.owner_email || "");

    const res = NextResponse.json(
      {
        ok: true,
        authenticated: isOwnerOrHq,
        status: pay.status,
        email_sent: Boolean(emailCheck?.ok),
        receipt_token: receiptTok,
        pdf_url: `/api/v1/payments/receipt/${encodeURIComponent(reference)}/pdf?rt=${encodeURIComponent(receiptTok)}`,
        receipt: {
          reference: pay.paystack_reference,
          school_name: schoolDisplay,
          owner_name: pay.owner_name,
          email: emailDisplay,
          plan_name: pay.plan_name,
          plan_slug: pay.plan_slug,
          duration_days: pay.duration_days,
          currency: String(pay.currency || "NGN").trim(),
          original_amount_minor: Number(pay.original_amount_minor || pay.amount_minor || 0),
          discount_amount_minor: Number(pay.discount_amount_minor || 0),
          amount_minor: Number(pay.amount_minor || 0),
          fee_minor: Number(pay.fee_minor || 0),
          customer_paid_minor: Number(pay.customer_paid_minor || pay.amount_minor || 0),
          promo_code: pay.promo_code_text || null,
          channel: pay.paystack_sub_channel
            ? `Paystack · ${pay.paystack_sub_channel}`
            : pay.payment_channel === "redeem_code"
            ? "100% Free Voucher"
            : "Paystack",
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
              signed_lease: lic.signed_lease_json || null,
            }
          : null,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );

    // Refresh HttpOnly receipt grant cookie so page reloads continue to work smoothly
    res.cookies.set(
      RECEIPT_GRANT_COOKIE,
      appendReceiptGrantCookieValue(req.cookies.get(RECEIPT_GRANT_COOKIE)?.value, reference),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 14,
      }
    );

    return res;
  } catch (err) {
    console.error("Receipt lookup error:", err);
    return NextResponse.json({ ok: false, message: "Could not check payment status right now." }, { status: 500 });
  }
}
