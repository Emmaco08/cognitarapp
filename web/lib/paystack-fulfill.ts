import { getSql } from "./db";
import { getPlatformSettings, issueSignedLicenseForSchool, logDeveloperAudit } from "./platform";
import { sendPaymentReceiptEmail } from "./brevo";
import { issueReceiptAccessToken } from "./security";

export interface VerificationCheck {
  step: string;
  ok: boolean;
  detail: string;
  at: string;
}

/**
 * Race-proof, idempotent fulfillment of a confirmed Paystack payment:
 * - Atomically claims `subscriptions_payments` (`WHERE status != 'success'`) to eliminate concurrent webhook vs verify double-minting.
 * - Captures Paystack sub-channel (`card`, `bank`, `bank_transfer`, `ussd`), exact Paystack fee, customer paid total, `is_test` flag, and step-by-step verification checks.
 * - Processes Referral Conversion rewards (commission credit to referrer wallet + bonus days for both referrer & referee) for real non-test payments.
 * - Issues & Ed25519-signs the license (bound to HWID if supplied).
 * - Sends a Brevo confirmation & receipt email containing the licence key and download link.
 */
export async function fulfillConfirmedPaystackPayment(params: {
  paymentId: string;
  paystackTransactionId?: number | null;
  customerCode?: string | null;
  authorizationSig?: string | null;
  paystackSubChannel?: string | null;
  paystackFeeMinor?: number | null;
  customerPaidMinor?: number | null;
  isTest?: boolean;
  verificationChecks?: VerificationCheck[];
  rawPayload?: Record<string, unknown> | null;
  hwidHash?: string | null;
  displayHwid?: string | null;
  hwComponentHashes?: Record<string, string> | null;
  machineHostname?: string | null;
  osVersion?: string | null;
  ipAddress?: string | null;
  originUrl?: string | null;
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

  const rawTx = (params.rawPayload || {}) as Record<string, any>;
  const subChannel =
    params.paystackSubChannel ||
    (typeof rawTx.channel === "string" && rawTx.channel ? rawTx.channel : null) ||
    pay.paystack_sub_channel ||
    null;
  const txFees =
    params.paystackFeeMinor !== undefined && params.paystackFeeMinor !== null
      ? Math.max(0, Number(params.paystackFeeMinor))
      : rawTx.fees !== undefined && rawTx.fees !== null
      ? Math.max(0, Number(rawTx.fees))
      : Number(pay.fee_minor || 0);
  const customerPaid =
    params.customerPaidMinor !== undefined && params.customerPaidMinor !== null
      ? Math.max(0, Number(params.customerPaidMinor))
      : rawTx.amount !== undefined && rawTx.amount !== null
      ? Math.max(0, Number(rawTx.amount))
      : Number(pay.customer_paid_minor || pay.amount_minor || 0);
  const isTest =
    params.isTest !== undefined
      ? Boolean(params.isTest)
      : rawTx.domain === "test"
      ? true
      : Boolean(pay.is_test);

  const nowIso = new Date().toISOString();
  const checks: VerificationCheck[] = Array.isArray(params.verificationChecks) && params.verificationChecks.length > 0
    ? [...params.verificationChecks]
    : [
        {
          step: "Payment confirmed",
          ok: true,
          detail: subChannel ? `Channel: ${subChannel}` : "Confirmed by server",
          at: nowIso,
        },
      ];

  // ATOMIC CLAIM: Only ONE concurrent caller (webhook or /verify) wins the transition into `success`!
  const claimedRows = await sql`
    UPDATE subscriptions_payments
    SET status = 'success',
        paid_at = COALESCE(paid_at, NOW()),
        is_test = ${isTest},
        paystack_sub_channel = COALESCE(${subChannel}, paystack_sub_channel),
        fee_minor = ${txFees},
        customer_paid_minor = ${customerPaid},
        paystack_transaction_id = COALESCE(${params.paystackTransactionId || null}::bigint, paystack_transaction_id),
        paystack_customer_code = COALESCE(${params.customerCode || null}, paystack_customer_code),
        paystack_authorization_sig = COALESCE(${params.authorizationSig || null}, paystack_authorization_sig),
        raw_webhook_payload = COALESCE(${params.rawPayload ? JSON.stringify(params.rawPayload) : null}::jsonb, raw_webhook_payload),
        verification_checks_json = ${JSON.stringify(checks)}::jsonb
    WHERE id = ${pay.id}::uuid
      AND status != 'success'
    RETURNING *
  `;

  if (!claimedRows.length) {
    // Another request already won the claim. Wait briefly if license insertion is mid-flight, then return it
    for (let i = 0; i < 6; i++) {
      const existingLic = await sql`
        SELECT * FROM licenses WHERE latest_payment_id = ${pay.id}::uuid LIMIT 1
      `;
      if (existingLic.length > 0) {
        const latestPay = await sql`SELECT * FROM subscriptions_payments WHERE id = ${pay.id}::uuid LIMIT 1`;
        const lic = existingLic[0] as Record<string, any>;
        return {
          alreadyFulfilled: true,
          payment: (latestPay[0] as Record<string, any>) || pay,
          license: lic,
          signed_lease: lic.signed_lease_json || null,
        };
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    // Edge fallback if payment was marked success without a license
    const refreshed = await sql`SELECT * FROM subscriptions_payments WHERE id = ${pay.id}::uuid LIMIT 1`;
    const existingLic = await sql`SELECT * FROM licenses WHERE latest_payment_id = ${pay.id}::uuid LIMIT 1`;
    if (existingLic.length > 0) {
      const lic = existingLic[0] as Record<string, any>;
      return {
        alreadyFulfilled: true,
        payment: (refreshed[0] as Record<string, any>) || pay,
        license: lic,
        signed_lease: lic.signed_lease_json || null,
      };
    }
  }

  const updatedPay = (claimedRows[0] as Record<string, any>) || pay;

  // Check if referred school qualifies for bonus referee days (real non-test payments only)
  let refereeBonusDays = 0;
  let pendingReferral: {
    referralId: string;
    referrerUserId: string;
    referrerSchoolId: string | null;
    rewardMode: "cash_commission" | "bonus_days" | "dual";
    commissionPct: number;
    commissionKobo: number;
    referrerBonusDays: number;
    refereeBonusDays: number;
  } | null = null;

  try {
    if (!isTest && Number(updatedPay.amount_minor || 0) > 0) {
      const schoolInfo = await sql`
        SELECT s.id, s.owner_user_id, s.referral_code_used, p.default_commission_pct, p.default_bonus_days
        FROM schools s
        JOIN plans p ON p.id = ${updatedPay.plan_id}::uuid
        WHERE s.id = ${updatedPay.school_id}::uuid
        LIMIT 1
      `;
      const refCode = String(schoolInfo[0]?.referral_code_used || "").trim().toUpperCase();
      if (refCode) {
        const refRows = await sql`
          SELECT id, owner_user_id, school_id, reward_mode, custom_commission_pct, custom_bonus_days
          FROM referrals
          WHERE UPPER(referral_code) = ${refCode} AND is_active = TRUE
          LIMIT 1
        `;
        if (refRows.length && String(refRows[0].owner_user_id) !== String(schoolInfo[0].owner_user_id)) {
          const ref = refRows[0] as Record<string, any>;
          const mode = (ref.reward_mode || "dual") as "cash_commission" | "bonus_days" | "dual";
          const pct = Number(ref.custom_commission_pct ?? schoolInfo[0].default_commission_pct ?? 15);
          const bonusDays = Math.max(0, Number(ref.custom_bonus_days ?? schoolInfo[0].default_bonus_days ?? 14));
          const commMinor =
            mode === "cash_commission" || mode === "dual"
              ? Math.round((Number(updatedPay.amount_minor || 0) * pct) / 100)
              : 0;
          const grantReferrerDays = mode === "bonus_days" || mode === "dual" ? bonusDays : 0;
          const grantRefereeDays = mode === "bonus_days" || mode === "dual" ? Math.max(7, Math.floor(bonusDays / 2)) : 0;
          refereeBonusDays = grantRefereeDays;
          pendingReferral = {
            referralId: String(ref.id),
            referrerUserId: String(ref.owner_user_id),
            referrerSchoolId: ref.school_id ? String(ref.school_id) : null,
            rewardMode: mode,
            commissionPct: pct,
            commissionKobo: commMinor,
            referrerBonusDays: grantReferrerDays,
            refereeBonusDays: grantRefereeDays,
          };
        }
      }
    }
  } catch (err) {
    console.error("Referral lookup error (non-fatal):", err);
  }

  const effectiveHwid = params.hwidHash || updatedPay.pending_hwid_hash || null;
  const effectiveDisplayHwid = params.displayHwid || updatedPay.pending_display_hwid || null;

  const { license, signed_lease } = await issueSignedLicenseForSchool({
    schoolId: updatedPay.school_id,
    planId: updatedPay.plan_id,
    paymentId: updatedPay.id,
    schoolNameOverride: updatedPay.buyer_school_name || null,
    bonusDays: refereeBonusDays,
    hwidHash: effectiveHwid,
    displayHwid: effectiveDisplayHwid,
    hwComponentHashes: params.hwComponentHashes || null,
    machineHostname: params.machineHostname || null,
    osVersion: params.osVersion || null,
  });

  checks.push({
    step: "Licence issued",
    ok: true,
    detail: `Key ${license.license_key}${refereeBonusDays > 0 ? ` (+${refereeBonusDays} referral bonus days)` : ""}`,
    at: new Date().toISOString(),
  });

  // Record promo code usage if applicable (idempotent)
  if (updatedPay.promo_code_id) {
    const alreadyRed = await sql`
      SELECT id FROM promo_redemptions WHERE payment_id = ${updatedPay.id}::uuid LIMIT 1
    `;
    if (!alreadyRed.length) {
      await sql`
        UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = ${updatedPay.promo_code_id}::uuid
      `;
      await sql`
        INSERT INTO promo_redemptions (promo_code_id, user_id, school_id, payment_id, license_id, discount_applied_minor, buyer_email, ip_address)
        VALUES (
          ${updatedPay.promo_code_id}::uuid,
          ${updatedPay.user_id}::uuid,
          ${updatedPay.school_id}::uuid,
          ${updatedPay.id}::uuid,
          ${license.id}::uuid,
          ${Number(updatedPay.discount_amount_minor || 0)},
          ${updatedPay.buyer_email || null},
          ${params.ipAddress || null}
        )
      `;
    }
  }

  // Commit referral conversion + wallet ledger + referrer bonus days (idempotent per payment)
  if (pendingReferral) {
    try {
      const convRows = await sql`
        INSERT INTO referral_conversions (
          referral_id, referrer_user_id, referred_school_id, payment_id,
          applied_reward_mode, commission_pct_applied, commission_amount_kobo,
          bonus_days_granted_referrer, bonus_days_granted_referee, status
        ) VALUES (
          ${pendingReferral.referralId}::uuid,
          ${pendingReferral.referrerUserId}::uuid,
          ${updatedPay.school_id}::uuid,
          ${updatedPay.id}::uuid,
          ${pendingReferral.rewardMode},
          ${pendingReferral.commissionPct},
          ${pendingReferral.commissionKobo},
          ${pendingReferral.referrerBonusDays},
          ${pendingReferral.refereeBonusDays},
          'credited'
        )
        ON CONFLICT (payment_id) DO NOTHING
        RETURNING id
      `;
      if (convRows.length) {
        const convId = String(convRows[0].id);
        if (pendingReferral.commissionKobo > 0) {
          const balRows = await sql`
            SELECT COALESCE(balance_after_minor, 0)::bigint AS bal
            FROM wallet_ledger
            WHERE user_id = ${pendingReferral.referrerUserId}::uuid
            ORDER BY created_at DESC
            LIMIT 1
          `;
          const prevBal = Number(balRows[0]?.bal || 0);
          const nextBal = prevBal + pendingReferral.commissionKobo;
          await sql`
            INSERT INTO wallet_ledger (
              user_id, conversion_id, entry_type, currency, amount_minor, balance_after_minor, idempotency_key, notes
            ) VALUES (
              ${pendingReferral.referrerUserId}::uuid,
              ${convId}::uuid,
              'commission_credit',
              ${String(updatedPay.currency || "NGN").trim()},
              ${pendingReferral.commissionKobo},
              ${nextBal},
              ${`ref_conv:${convId}`},
              ${`Referral commission (${pendingReferral.commissionPct}%) on order ${updatedPay.paystack_reference}`}
            )
            ON CONFLICT (idempotency_key) DO NOTHING
          `;
        }
        if (pendingReferral.referrerBonusDays > 0 && pendingReferral.referrerSchoolId) {
          await sql`
            UPDATE licenses
            SET expires_at = CASE
                  WHEN expires_at IS NULL THEN NULL
                  ELSE GREATEST(expires_at, NOW()) + (${pendingReferral.referrerBonusDays} * INTERVAL '1 day')
                END,
                bonus_days_total = bonus_days_total + ${pendingReferral.referrerBonusDays},
                updated_at = NOW()
            WHERE id = (
              SELECT id FROM licenses
              WHERE school_id = ${pendingReferral.referrerSchoolId}::uuid
                AND status IN ('active', 'issued')
              ORDER BY created_at DESC
              LIMIT 1
            )
          `;
        }
        checks.push({
          step: "Referral reward credited",
          ok: true,
          detail: `${pendingReferral.commissionPct}% commission + ${pendingReferral.referrerBonusDays}d bonus`,
          at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("Referral credit error (non-fatal):", err);
    }
  }

  // Send Payment Receipt Email via Brevo (non-blocking)
  try {
    const settings = await getPlatformSettings();
    const metaRows = await sql`
      SELECT u.email, u.full_name, s.school_name, p.display_name AS plan_name
      FROM subscriptions_payments sp
      JOIN users_hq u ON u.id = sp.user_id
      JOIN schools s ON s.id = sp.school_id
      JOIN plans p ON p.id = sp.plan_id
      WHERE sp.id = ${updatedPay.id}::uuid
      LIMIT 1
    `;
    if (metaRows.length && settings.brevo_configured) {
      const m = metaRows[0] as Record<string, any>;
      const toEmail = String(updatedPay.buyer_email || m.email || "");
      const schoolDisplay = String(updatedPay.buyer_school_name || m.school_name || "Your School");
      const baseOrigin = params.originUrl || "https://cognitara.net";
      const receiptTok = issueReceiptAccessToken(String(updatedPay.paystack_reference));
      const receiptUrl = `${baseOrigin}/pay/done?reference=${encodeURIComponent(updatedPay.paystack_reference)}&rt=${encodeURIComponent(receiptTok)}`;
      const pdfReceiptUrl = `${baseOrigin}/api/v1/payments/receipt/${encodeURIComponent(updatedPay.paystack_reference)}/pdf?rt=${encodeURIComponent(receiptTok)}`;
      const emailRes = await sendPaymentReceiptEmail({
        settings,
        toEmail,
        fullName: String(m.full_name || "Administrator"),
        schoolName: schoolDisplay,
        planName: String(m.plan_name || "CogniTara Licence"),
        reference: String(updatedPay.paystack_reference),
        currency: String(updatedPay.currency || "NGN").trim(),
        amountPaidMinor: customerPaid || Number(updatedPay.amount_minor || 0),
        planPriceMinor: Number(updatedPay.original_amount_minor || updatedPay.amount_minor || 0),
        discountMinor: Number(updatedPay.discount_amount_minor || 0),
        feeMinor: txFees,
        channel: subChannel ? `Paystack · ${subChannel}` : "Paystack",
        licenseKey: String(license.license_key),
        expiresAt: license.expires_at ? new Date(license.expires_at).toISOString() : null,
        isTest,
        receiptUrl,
        pdfReceiptUrl,
      });
      checks.push({
        step: "Receipt email",
        ok: emailRes.ok,
        detail: emailRes.ok ? `Sent to ${toEmail}` : `Skipped (${emailRes.error || "unavailable"})`,
        at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("Receipt email error (non-fatal):", err);
  }

  // Persist final verification_checks_json
  await sql`
    UPDATE subscriptions_payments
    SET verification_checks_json = ${JSON.stringify(checks)}::jsonb
    WHERE id = ${updatedPay.id}::uuid
  `;

  await logDeveloperAudit({
    actorUserId: updatedPay.user_id,
    action: "paystack_payment_fulfilled",
    targetType: "payment",
    targetId: updatedPay.id,
    ipAddress: params.ipAddress || null,
    details: {
      reference: updatedPay.paystack_reference,
      amount_minor: Number(updatedPay.amount_minor || 0),
      customer_paid_minor: customerPaid,
      fee_minor: txFees,
      channel: subChannel,
      is_test: isTest,
      currency: updatedPay.currency,
      license_key: license.license_key,
      promo_code: updatedPay.promo_code_text || null,
    },
  });

  return {
    alreadyFulfilled: false,
    payment: { ...updatedPay, verification_checks_json: checks },
    license,
    signed_lease,
  };
}

/**
 * Reverses any credited referral commission when a payment is refunded or disputed.
 */
export async function reverseReferralOnRefund(paymentId: string): Promise<void> {
  try {
    const sql = getSql();
    const convs = await sql`
      SELECT * FROM referral_conversions
      WHERE payment_id = ${paymentId}::uuid AND status = 'credited'
      LIMIT 1
    `;
    if (!convs.length) return;
    const conv = convs[0] as Record<string, any>;
    await sql`
      UPDATE referral_conversions SET status = 'reversed_fraud' WHERE id = ${conv.id}::uuid
    `;
    const comm = Number(conv.commission_amount_kobo || 0);
    if (comm > 0) {
      const balRows = await sql`
        SELECT COALESCE(balance_after_minor, 0)::bigint AS bal
        FROM wallet_ledger
        WHERE user_id = ${conv.referrer_user_id}::uuid
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const prevBal = Number(balRows[0]?.bal || 0);
      const nextBal = Math.max(0, prevBal - comm);
      await sql`
        INSERT INTO wallet_ledger (
          user_id, conversion_id, entry_type, currency, amount_minor, balance_after_minor, idempotency_key, notes
        ) VALUES (
          ${conv.referrer_user_id}::uuid,
          ${conv.id}::uuid,
          'reversal',
          'NGN',
          ${-comm},
          ${nextBal},
          ${`ref_rev:${conv.id}`},
          'Commission reversed due to payment refund'
        )
        ON CONFLICT (idempotency_key) DO NOTHING
      `;
    }
  } catch (err) {
    console.error("reverseReferralOnRefund error:", err);
  }
}
