import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  extractBearerOrCookieToken,
  generateReferralCode,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  resolveAuthenticatedAccount,
} from "@/lib/auth";
import {
  evaluatePromoCode,
  getPlatformSettings,
  issueSignedLicenseForSchool,
  logDeveloperAudit,
} from "@/lib/platform";
import { sendPaymentReceiptEmail } from "@/lib/brevo";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  appendReceiptGrantCookieValue,
  checkDbLockout,
  clearDbAuthLockout,
  generateSecurePaymentReference,
  issueReceiptAccessToken,
  RECEIPT_GRANT_COOKIE,
  recordDbAuthFailure,
  verifyMutationOrigin,
} from "@/lib/security";

export const dynamic = "force-dynamic";

/**
 * Unified, hardened 100% Free Voucher / 100% Discount Code Redemption endpoint.
 * Works both for signed-in school owners AND directly on `/pay/checkout` (requiring School Name + Email).
 * - Brute-force locked in Postgres (`auth_lockouts`)
 * - Atomic `uses_count < max_uses` guard + per-school & per-email limits
 * - Generates Ed25519 licence key, official receipt record, Brevo email with PDF link, and HttpOnly receipt grant cookie!
 */
export async function POST(req: NextRequest) {
  try {
    if (!verifyMutationOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: "invalid_origin", message: "Cross-origin redemption blocked." },
        { status: 403 }
      );
    }

    const ip = getClientIp(req);
    const rl = checkRateLimit(`promo-redeem:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many redeem attempts. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const lockKey = `promo-redeem-fail:${ip}`;
    const lock = await checkDbLockout(lockKey);
    if (lock.locked) {
      return NextResponse.json(
        {
          ok: false,
          error: "temporarily_locked",
          message: `Too many failed redemption attempts. Try again in ${Math.ceil(lock.retryAfterSec / 60)} min.`,
        },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "invalid_json", message: "Invalid JSON body." }, { status: 400 });
    }

    const token = extractBearerOrCookieToken(req);
    const account = token ? await resolveAuthenticatedAccount(token) : null;

    const rawCode = String(body.code || "").trim().toUpperCase();
    let planId: string | null = body.plan_id ? String(body.plan_id).trim() : null;
    const planSlug = body.plan_slug ? String(body.plan_slug).trim().toLowerCase() : null;
    const currency = String(body.currency || "NGN").trim().toUpperCase() === "USD" ? "USD" : "NGN";

    const sql = getSql();
    if (planId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)) {
      planId = null;
    }
    if (!planId && planSlug) {
      const pRows = await sql`SELECT id FROM plans WHERE LOWER(slug) = ${planSlug} AND is_active = TRUE LIMIT 1`;
      if (pRows[0]?.id) planId = String(pRows[0].id);
    }

    const emailInput = normalizeEmail(String(body.email || account?.user.email || ""));
    const schoolNameInput = String(body.school_name || account?.school?.school_name || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 160);

    if (schoolNameInput.length < 2) {
      return NextResponse.json(
        { ok: false, error: "invalid_school_name", message: "Enter your school name to issue your licence certificate." },
        { status: 400 }
      );
    }
    if (!isValidEmail(emailInput)) {
      return NextResponse.json(
        { ok: false, error: "invalid_email", message: "Enter a valid school email so we can deliver your licence key and receipt." },
        { status: 400 }
      );
    }

    // Resolve or provision school owner record cleanly
    let targetUserId: string;
    let targetSchoolId: string;
    let targetOwnerName = `${schoolNameInput} Admin`;

    if (account?.school && normalizeEmail(account.user.email) === emailInput) {
      if (account.school.status !== "active") {
        return NextResponse.json({ ok: false, error: "school_suspended", message: "Your school account is suspended." }, { status: 403 });
      }
      targetUserId = account.user.id;
      targetSchoolId = account.school.id;
      targetOwnerName = account.user.full_name || targetOwnerName;
    } else {
      const existingUsers = await sql`
        SELECT u.id, u.email, u.full_name, u.status, s.id AS school_id, s.status AS school_status
        FROM users_hq u
        LEFT JOIN schools s ON s.owner_user_id = u.id
        WHERE LOWER(u.email) = ${emailInput}
        LIMIT 1
      `;
      if (existingUsers.length > 0) {
        const u = existingUsers[0] as Record<string, any>;
        if (u.status !== "active") {
          return NextResponse.json({ ok: false, error: "account_suspended", message: "This account is suspended." }, { status: 403 });
        }
        targetUserId = String(u.id);
        targetOwnerName = String(u.full_name || targetOwnerName);
        if (u.school_id) {
          if (u.school_status !== "active") {
            return NextResponse.json({ ok: false, error: "school_suspended", message: "This school account is suspended." }, { status: 403 });
          }
          targetSchoolId = String(u.school_id);
        } else {
          const createdSchool = await sql`
            INSERT INTO schools (owner_user_id, school_name, contact_email)
            VALUES (${targetUserId}::uuid, ${schoolNameInput}, ${emailInput})
            RETURNING id
          `;
          targetSchoolId = String(createdSchool[0].id);
        }
      } else {
        const randomPassword = crypto.randomBytes(24).toString("hex");
        const createdUser = await sql`
          INSERT INTO users_hq (email, password_hash, full_name, role, status)
          VALUES (${emailInput}, ${hashPassword(randomPassword)}, ${targetOwnerName.slice(0, 120)}, 'school_owner', 'active')
          RETURNING id
        `;
        targetUserId = String(createdUser[0].id);

        const createdSchool = await sql`
          INSERT INTO schools (owner_user_id, school_name, contact_email)
          VALUES (${targetUserId}::uuid, ${schoolNameInput}, ${emailInput})
          RETURNING id
        `;
        targetSchoolId = String(createdSchool[0].id);

        try {
          await sql`
            INSERT INTO referrals (owner_user_id, school_id, referral_code, reward_mode)
            VALUES (${targetUserId}::uuid, ${targetSchoolId}::uuid, ${generateReferralCode(schoolNameInput)}, 'dual')
            ON CONFLICT DO NOTHING
          `;
        } catch {
          // non-blocking
        }
      }
    }

    const evalRes = await evaluatePromoCode({
      rawCode,
      planId,
      currency,
      schoolId: targetSchoolId,
      email: emailInput,
    });

    if (!evalRes.valid || !evalRes.promo) {
      if (evalRes.error === "code_not_found") {
        await recordDbAuthFailure(lockKey);
      }
      return NextResponse.json(
        { ok: false, error: evalRes.error || "invalid_code", message: evalRes.message || "Invalid redeem code." },
        { status: 400 }
      );
    }

    const promo = evalRes.promo;
    const isFreeDiscount = evalRes.code_type === "discount" && (evalRes.final_amount_minor ?? 1) === 0;
    if (evalRes.code_type !== "redeem" && !isFreeDiscount) {
      return NextResponse.json(
        {
          ok: false,
          error: "discount_requires_checkout",
          message: "This is a partial discount code. Proceed to Paystack checkout to apply your discount.",
        },
        { status: 400 }
      );
    }

    const targetPlanId = evalRes.code_type === "redeem" ? promo.grant_plan_id : planId;
    if (!targetPlanId) {
      return NextResponse.json(
        { ok: false, error: "missing_grant_plan", message: "This redeem code is not linked to a plan. Contact CogniTara HQ." },
        { status: 400 }
      );
    }

    // Atomic increment with full time & max_uses guard to prevent race-condition double claims!
    const claimed = await sql`
      UPDATE promo_codes
      SET uses_count = uses_count + 1
      WHERE id = ${promo.id}::uuid
        AND is_active = TRUE
        AND (starts_at IS NULL OR starts_at <= NOW())
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (max_uses IS NULL OR uses_count < max_uses)
      RETURNING id
    `;
    if (!claimed.length) {
      return NextResponse.json(
        { ok: false, error: "code_exhausted", message: "This code has just been fully claimed or expired." },
        { status: 409 }
      );
    }

    await clearDbAuthLockout(lockKey);

    const ref = generateSecurePaymentReference("CTRDM");
    const receiptToken = issueReceiptAccessToken(ref);
    const nowIso = new Date().toISOString();
    const checks = [
      {
        step: "Voucher code verified & atomically claimed",
        ok: true,
        detail: `Code ${promo.code} redeemed for ${schoolNameInput}`,
        at: nowIso,
      },
    ];

    const paymentRows = await sql`
      INSERT INTO subscriptions_payments (
        school_id, user_id, plan_id, paystack_reference, currency, amount_minor,
        original_amount_minor, discount_amount_minor, fee_minor, customer_paid_minor,
        promo_code_id, promo_code_text, payment_channel, status, paid_at,
        buyer_school_name, buyer_email, notes, verification_checks_json
      ) VALUES (
        ${targetSchoolId}::uuid,
        ${targetUserId}::uuid,
        ${targetPlanId}::uuid,
        ${ref},
        ${currency},
        0,
        ${evalRes.original_amount_minor || 0},
        ${evalRes.original_amount_minor || 0},
        0,
        0,
        ${promo.id}::uuid,
        ${promo.code},
        'redeem_code',
        'success',
        NOW(),
        ${schoolNameInput},
        ${emailInput},
        ${`Redeemed voucher ${promo.code}`},
        ${JSON.stringify(checks)}::jsonb
      )
      RETURNING id
    `;
    const paymentId = paymentRows[0]?.id as string;

    const { license, signed_lease } = await issueSignedLicenseForSchool({
      schoolId: targetSchoolId,
      planId: targetPlanId,
      paymentId,
      schoolNameOverride: schoolNameInput,
      durationDaysOverride:
        evalRes.code_type === "redeem" && promo.grant_duration_days ? Number(promo.grant_duration_days) : undefined,
    });

    await sql`
      INSERT INTO promo_redemptions (promo_code_id, user_id, school_id, payment_id, license_id, discount_applied_minor, buyer_email, ip_address)
      VALUES (
        ${promo.id}::uuid,
        ${targetUserId}::uuid,
        ${targetSchoolId}::uuid,
        ${paymentId}::uuid,
        ${license.id}::uuid,
        ${evalRes.original_amount_minor || 0},
        ${emailInput},
        ${ip}
      )
    `;

    // Deliver Licence Key + PDF Receipt via Brevo email
    let emailSent = false;
    try {
      const settings = await getPlatformSettings();
      const planInfoRows = await sql`SELECT display_name FROM plans WHERE id = ${targetPlanId}::uuid LIMIT 1`;
      const planName = String(planInfoRows[0]?.display_name || "CogniTara Licence");
      const origin = req.nextUrl.origin || "https://cognitara.net";
      const receiptUrl = `${origin}/pay/done?reference=${encodeURIComponent(ref)}&rt=${encodeURIComponent(receiptToken)}`;
      const pdfReceiptUrl = `${origin}/api/v1/payments/receipt/${encodeURIComponent(ref)}/pdf?rt=${encodeURIComponent(receiptToken)}`;

      if (settings.brevo_configured) {
        const emailRes = await sendPaymentReceiptEmail({
          settings,
          toEmail: emailInput,
          fullName: targetOwnerName,
          schoolName: schoolNameInput,
          planName,
          reference: ref,
          currency,
          amountPaidMinor: 0,
          planPriceMinor: evalRes.original_amount_minor || 0,
          discountMinor: evalRes.original_amount_minor || 0,
          feeMinor: 0,
          channel: `100% Free Voucher (${promo.code})`,
          licenseKey: String(license.license_key),
          expiresAt: license.expires_at ? new Date(license.expires_at).toISOString() : null,
          isTest: false,
          receiptUrl,
          pdfReceiptUrl,
        });
        emailSent = emailRes.ok;
        checks.push({
          step: "Receipt email",
          ok: emailRes.ok,
          detail: emailRes.ok ? `Sent to ${emailInput}` : `Skipped (${emailRes.error || "unavailable"})`,
          at: new Date().toISOString(),
        });
        await sql`
          UPDATE subscriptions_payments
          SET verification_checks_json = ${JSON.stringify(checks)}::jsonb
          WHERE id = ${paymentId}::uuid
        `;
      }
    } catch (e) {
      console.error("Redeem receipt email error (non-fatal):", e);
    }

    await logDeveloperAudit({
      actorUserId: targetUserId,
      actorEmail: emailInput,
      action: "promo_code_redeemed",
      targetType: "license",
      targetId: license.id,
      ipAddress: ip,
      details: {
        code: promo.code,
        reference: ref,
        school_id: targetSchoolId,
        school_name: schoolNameInput,
        license_key: license.license_key,
        email_sent: emailSent,
      },
    });

    const redirectUrl = `/pay/done?reference=${encodeURIComponent(ref)}&rt=${encodeURIComponent(receiptToken)}`;
    const res = NextResponse.json({
      ok: true,
      message: `Code ${promo.code} redeemed! Your CogniTara licence is active.`,
      reference: ref,
      receipt_token: receiptToken,
      redirect_url: redirectUrl,
      email_sent: emailSent,
      license: {
        id: license.id,
        license_key: license.license_key,
        plan_tier: license.plan_tier,
        status: license.status,
        expires_at: license.expires_at,
      },
      signed_lease,
    });

    res.cookies.set(
      RECEIPT_GRANT_COOKIE,
      appendReceiptGrantCookieValue(req.cookies.get(RECEIPT_GRANT_COOKIE)?.value, ref),
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
    console.error("Promo redeem error:", err);
    return NextResponse.json({ ok: false, error: "redeem_failed", message: "Could not redeem code right now." }, { status: 500 });
  }
}
