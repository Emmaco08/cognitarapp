import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { signRevocationTombstone, verifyPaystackWebhookSignature } from "@/lib/crypto";
import { getPlatformSettings, logDeveloperAudit } from "@/lib/platform";
import { fulfillConfirmedPaystackPayment, reverseReferralOnRefund } from "@/lib/paystack-fulfill";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";
    const settings = await getPlatformSettings();

    // Verify HMAC-SHA512 against BOTH Live and Test secret keys so both Paystack dashboard tabs work cleanly!
    const matchedLive =
      Boolean(settings.paystack_live_secret_key) &&
      verifyPaystackWebhookSignature(rawBody, signature, settings.paystack_live_secret_key);
    const matchedTest =
      !matchedLive &&
      Boolean(settings.paystack_test_secret_key) &&
      verifyPaystackWebhookSignature(rawBody, signature, settings.paystack_test_secret_key);

    if (!matchedLive && !matchedTest) {
      await logDeveloperAudit({
        action: "paystack_webhook_invalid_signature",
        ipAddress: getClientIp(req),
        details: { has_sig: Boolean(signature) },
      });
      return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody) as { event?: string; data?: Record<string, any> };
    const eventType = String(event?.event || "");
    const tx = event?.data || {};
    const reference = String(tx.reference || tx.transaction_reference || "").trim();
    const sql = getSql();
    const nowIso = new Date().toISOString();

    if (eventType === "charge.success" && reference) {
      const rows = await sql`
        SELECT id, currency, amount_minor, customer_paid_minor, is_test
        FROM subscriptions_payments
        WHERE paystack_reference = ${reference}
        LIMIT 1
      `;
      if (rows.length > 0) {
        const pay = rows[0] as Record<string, any>;
        const expectedCurrency = String(pay.currency || "NGN").trim().toUpperCase();
        const actualCurrency = String(tx.currency || expectedCurrency).trim().toUpperCase();
        const expectedMin = Number(pay.customer_paid_minor || pay.amount_minor || 0);

        if (actualCurrency === expectedCurrency && Number(tx.amount || 0) >= expectedMin) {
          await fulfillConfirmedPaystackPayment({
            paymentId: pay.id as string,
            paystackTransactionId: tx.id ? Number(tx.id) : null,
            customerCode: tx.customer?.customer_code || null,
            authorizationSig: tx.authorization?.signature || null,
            paystackSubChannel: tx.channel || null,
            paystackFeeMinor: tx.fees !== undefined ? Number(tx.fees) : null,
            customerPaidMinor: tx.amount !== undefined ? Number(tx.amount) : null,
            isTest: matchedTest || tx.domain === "test" || Boolean(pay.is_test),
            verificationChecks: [
              {
                step: "Webhook HMAC-SHA512 verified",
                ok: true,
                detail: `${matchedLive ? "Live" : "Test"} signing key matched`,
                at: nowIso,
              },
              {
                step: "Status, amount & currency matched",
                ok: true,
                detail: `${actualCurrency} ${(Number(tx.amount) / 100).toLocaleString()} via ${tx.channel || "paystack"}`,
                at: nowIso,
              },
            ],
            rawPayload: tx,
            ipAddress: getClientIp(req),
            originUrl: req.nextUrl.origin,
          });
        }
      }
    } else if (eventType === "charge.failed" && reference) {
      await sql`
        UPDATE subscriptions_payments
        SET status = 'failed',
            paystack_sub_channel = COALESCE(${tx.channel || null}, paystack_sub_channel),
            raw_webhook_payload = ${JSON.stringify(tx)}::jsonb
        WHERE paystack_reference = ${reference} AND status = 'initialized'
      `;
    } else if ((eventType === "refund.processed" || eventType === "charge.dispute.create") && reference) {
      const rows = await sql`
        SELECT id FROM subscriptions_payments WHERE paystack_reference = ${reference} LIMIT 1
      `;
      if (rows.length) {
        const payId = String(rows[0].id);
        const nextStatus = eventType === "refund.processed" ? "refunded" : "disputed";
        await sql`
          UPDATE subscriptions_payments
          SET status = ${nextStatus},
              refunded_at = COALESCE(refunded_at, NOW()),
              refund_reason = ${`Paystack webhook: ${eventType}`}
          WHERE id = ${payId}::uuid
        `;
        const lics = await sql`SELECT id FROM licenses WHERE latest_payment_id = ${payId}::uuid AND status != 'revoked'`;
        for (const lic of lics) {
          const tomb = signRevocationTombstone({
            licenseId: lic.id,
            reasonCode: nextStatus === "refunded" ? "PAYMENT_REFUNDED" : "PAYMENT_DISPUTED",
            reasonDetail: `Automatic revocation via Paystack ${eventType}`,
          });
          await sql`
            UPDATE licenses
            SET status = 'revoked', revocation_tombstone_json = ${JSON.stringify(tomb)}::jsonb, updated_at = NOW()
            WHERE id = ${lic.id}::uuid
          `;
        }
        await reverseReferralOnRefund(payId);
        await logDeveloperAudit({
          action: `paystack_webhook_${nextStatus}`,
          targetType: "payment",
          targetId: payId,
          ipAddress: getClientIp(req),
          details: { reference, event: eventType, revoked_licenses: lics.length },
        });
      }
    }

    return NextResponse.json({ ok: true, received: eventType });
  } catch (err) {
    console.error("Paystack webhook error:", err);
    return NextResponse.json({ ok: false, error: "webhook_error" }, { status: 500 });
  }
}
