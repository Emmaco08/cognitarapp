import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { verifyPaystackWebhookSignature } from "@/lib/crypto";
import { getPlatformSettings, logDeveloperAudit } from "@/lib/platform";
import { fulfillConfirmedPaystackPayment } from "@/lib/paystack-fulfill";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";
    const settings = await getPlatformSettings();

    if (!settings.paystack_secret_key || !verifyPaystackWebhookSignature(rawBody, signature, settings.paystack_secret_key)) {
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
    const reference = String(tx.reference || "").trim();

    if (eventType === "charge.success" && reference) {
      const sql = getSql();
      const rows = await sql`
        SELECT id, amount_minor FROM subscriptions_payments WHERE paystack_reference = ${reference} LIMIT 1
      `;
      if (rows.length > 0 && Number(tx.amount || 0) >= Number(rows[0].amount_minor || 0)) {
        await fulfillConfirmedPaystackPayment({
          paymentId: rows[0].id as string,
          paystackTransactionId: tx.id ? Number(tx.id) : null,
          customerCode: tx.customer?.customer_code || null,
          authorizationSig: tx.authorization?.signature || null,
          rawPayload: tx,
          ipAddress: getClientIp(req),
        });
      }
    }

    return NextResponse.json({ ok: true, received: eventType });
  } catch (err) {
    console.error("Paystack webhook error:", err);
    return NextResponse.json({ ok: false, error: "webhook_error" }, { status: 500 });
  }
}
