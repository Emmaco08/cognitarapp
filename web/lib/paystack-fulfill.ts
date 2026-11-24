import { getSql } from "./db";
import { issueSignedLicenseForSchool, logDeveloperAudit } from "./platform";

/**
 * Idempotently fulfills a confirmed Paystack payment:
 * - marks payment `success`
 * - records promo usage if a discount code was applied
 * - issues & Ed25519-signs the license (bound to HWID if supplied at checkout)
 */
export async function fulfillConfirmedPaystackPayment(params: {
  paymentId: string;
  paystackTransactionId?: number | null;
  customerCode?: string | null;
  authorizationSig?: string | null;
  rawPayload?: Record<string, unknown> | null;
  hwidHash?: string | null;
  displayHwid?: string | null;
  hwComponentHashes?: Record<string, string> | null;
  machineHostname?: string | null;
  osVersion?: string | null;
  ipAddress?: string | null;
}): Promise<{
  alreadyFulfilled: boolean;
  payment: Record<string, any>;
  license: Record<string, any>;
  signed_lease: { payload: Record<string, unknown>; ed25519_sig: string } | null;
}> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM subscriptions_payments WHERE id = ${params.paymentId}::uuid LIMIT 1
  `;
  if (!rows.length) {
    throw new Error("Payment record not found.");
  }
  const pay = rows[0] as Record<string, any>;

  // Check if a license was already issued for this payment (idempotency!)
  const existingLic = await sql`
    SELECT * FROM licenses WHERE latest_payment_id = ${pay.id}::uuid LIMIT 1
  `;
  if (pay.status === "success" && existingLic.length > 0) {
    const lic = existingLic[0] as Record<string, any>;
    return {
      alreadyFulfilled: true,
      payment: pay,
      license: lic,
      signed_lease: lic.signed_lease_json || null,
    };
  }

  // Mark payment succeeded atomically
  const updatedPayRows = await sql`
    UPDATE subscriptions_payments
    SET status = 'success',
        paid_at = COALESCE(paid_at, NOW()),
        paystack_transaction_id = COALESCE(${params.paystackTransactionId || null}::bigint, paystack_transaction_id),
        paystack_customer_code = COALESCE(${params.customerCode || null}, paystack_customer_code),
        paystack_authorization_sig = COALESCE(${params.authorizationSig || null}, paystack_authorization_sig),
        raw_webhook_payload = COALESCE(${params.rawPayload ? JSON.stringify(params.rawPayload) : null}::jsonb, raw_webhook_payload)
    WHERE id = ${pay.id}::uuid
    RETURNING *
  `;
  const updatedPay = updatedPayRows[0] as Record<string, any>;

  const effectiveHwid = params.hwidHash || pay.pending_hwid_hash || null;
  const effectiveDisplayHwid = params.displayHwid || pay.pending_display_hwid || null;

  const { license, signed_lease } = await issueSignedLicenseForSchool({
    schoolId: pay.school_id,
    planId: pay.plan_id,
    paymentId: pay.id,
    hwidHash: effectiveHwid,
    displayHwid: effectiveDisplayHwid,
    hwComponentHashes: params.hwComponentHashes || null,
    machineHostname: params.machineHostname || null,
    osVersion: params.osVersion || null,
  });

  // Record promo code usage if applicable (idempotent check)
  if (pay.promo_code_id) {
    const alreadyRed = await sql`
      SELECT id FROM promo_redemptions WHERE payment_id = ${pay.id}::uuid LIMIT 1
    `;
    if (!alreadyRed.length) {
      await sql`
        UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = ${pay.promo_code_id}::uuid
      `;
      await sql`
        INSERT INTO promo_redemptions (promo_code_id, user_id, school_id, payment_id, license_id, discount_applied_minor)
        VALUES (
          ${pay.promo_code_id}::uuid,
          ${pay.user_id}::uuid,
          ${pay.school_id}::uuid,
          ${pay.id}::uuid,
          ${license.id}::uuid,
          ${Number(pay.discount_amount_minor || 0)}
        )
      `;
    }
  }

  await logDeveloperAudit({
    actorUserId: pay.user_id,
    action: "paystack_payment_fulfilled",
    targetType: "payment",
    targetId: pay.id,
    ipAddress: params.ipAddress || null,
    details: {
      reference: pay.paystack_reference,
      amount_minor: Number(pay.amount_minor || 0),
      currency: pay.currency,
      license_key: license.license_key,
      promo_code: pay.promo_code_text || null,
    },
  });

  return {
    alreadyFulfilled: false,
    payment: updatedPay,
    license,
    signed_lease,
  };
}
