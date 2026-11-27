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
  computePaystackFeeBreakdown,
  evaluatePromoCode,
  getPlatformSettings,
  paystackRequest,
} from "@/lib/platform";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  appendReceiptGrantCookieValue,
  generateSecurePaymentReference,
  issueReceiptAccessToken,
  RECEIPT_GRANT_COOKIE,
  verifyMutationOrigin,
} from "@/lib/security";

export const dynamic = "force-dynamic";

/**
 * Hardened website checkout endpoint (`/pay/checkout`):
 * - Accepts school_name + email + plan (UUID or slug) + currency + optional discount code.
 * - Enforces CSRF origin validation, IP + email rate limiting, exact server-side pricing,
 *   per-school & per-email promo limits, 128-bit unpredictable reference, and HMAC receipt grant cookie.
 */
export async function POST(req: NextRequest) {
  try {
    if (!verifyMutationOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: "invalid_origin", message: "Cross-origin checkout request blocked." },
        { status: 403 }
      );
    }

    const ip = getClientIp(req);
    const rl = checkRateLimit(`ps-quick:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many checkout attempts. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const settings = await getPlatformSettings();
    if (!settings.allow_paystack_checkout) {
      return NextResponse.json(
        { ok: false, error: "checkout_paused", message: "Payments are temporarily paused. Please try again shortly." },
        { status: 403 }
      );
    }

    const token = extractBearerOrCookieToken(req);
    const account = token ? await resolveAuthenticatedAccount(token) : null;

    const isTestMode = settings.paystack_mode !== "live";
    const isStaff = account?.user.role === "hq_super_admin" || account?.user.role === "hq_admin";
    if (isTestMode && settings.test_mode_staff_only && !isStaff) {
      return NextResponse.json(
        {
          ok: false,
          error: "payments_paused_test_mode",
          message: "Payments are paused briefly while we run maintenance checks. Please try again shortly.",
        },
        { status: 503 }
      );
    }

    if (!settings.paystack_secret_key || !settings.paystack_public_key) {
      return NextResponse.json(
        {
          ok: false,
          error: "paystack_not_configured",
          message: `Paystack ${isTestMode ? "Test" : "Live"} keys are not configured yet. Set them in HQ Payment Settings.`,
        },
        { status: 503 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "invalid_json", message: "Invalid JSON body." }, { status: 400 });
    }

    const planIdRaw = String(body.plan_id || "").trim();
    const planSlugRaw = String(body.plan_slug || "").trim().toLowerCase();
    const currencyRaw = String(body.currency || settings.default_currency || "NGN").trim().toUpperCase();
    const currency = currencyRaw === "USD" ? "USD" : "NGN";
    const promoCodeRaw = String(body.promo_code || "").trim().toUpperCase();

    const sql = getSql();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planIdRaw);
    const planRows = isUuid
      ? await sql`SELECT * FROM plans WHERE id = ${planIdRaw}::uuid AND is_active = TRUE LIMIT 1`
      : planSlugRaw
      ? await sql`SELECT * FROM plans WHERE LOWER(slug) = ${planSlugRaw} AND is_active = TRUE LIMIT 1`
      : [];

    if (!planRows.length) {
      return NextResponse.json({ ok: false, error: "plan_not_found", message: "Select a valid licence plan." }, { status: 404 });
    }
    const plan = planRows[0] as Record<string, any>;

    const emailInput = normalizeEmail(String(body.email || account?.user.email || ""));
    const schoolNameInput = String(body.school_name || account?.school?.school_name || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 160);

    if (schoolNameInput.length < 2) {
      return NextResponse.json(
        { ok: false, error: "invalid_school_name", message: "Enter your school name to bind your licence certificate." },
        { status: 400 }
      );
    }
    if (!isValidEmail(emailInput)) {
      return NextResponse.json(
        { ok: false, error: "invalid_email", message: "Enter a valid school email so we can deliver your licence key and receipt." },
        { status: 400 }
      );
    }

    const emailRl = checkRateLimit(`ps-quick-email:${emailInput}`, 8, 60_000);
    if (!emailRl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many checkout attempts for this email. Retry in ${emailRl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    let targetUserId: string;
    let targetSchoolId: string;
    const targetSchoolName = schoolNameInput;
    const targetEmail = emailInput;

    if (account?.school && normalizeEmail(account.user.email) === emailInput) {
      if (account.school.status !== "active") {
        return NextResponse.json(
          { ok: false, error: "school_suspended", message: "Your school account is currently suspended." },
          { status: 403 }
        );
      }
      targetUserId = account.user.id;
      targetSchoolId = account.school.id;
    } else {
      const existingUsers = await sql`
        SELECT u.id, u.email, u.status, u.role, s.id AS school_id, s.school_name, s.status AS school_status
        FROM users_hq u
        LEFT JOIN schools s ON s.owner_user_id = u.id
        WHERE LOWER(u.email) = ${emailInput}
        LIMIT 1
      `;

      if (existingUsers.length > 0) {
        const u = existingUsers[0] as Record<string, any>;
        if (u.status !== "active") {
          return NextResponse.json(
            { ok: false, error: "account_suspended", message: "This account is suspended. Contact support." },
            { status: 403 }
          );
        }
        targetUserId = String(u.id);
        if (u.school_id) {
          if (u.school_status !== "active") {
            return NextResponse.json(
              { ok: false, error: "school_suspended", message: "This school account is currently suspended." },
              { status: 403 }
            );
          }
          targetSchoolId = String(u.school_id);
        } else {
          const createdSchool = await sql`
            INSERT INTO schools (owner_user_id, school_name, contact_email)
            VALUES (${targetUserId}::uuid, ${schoolNameInput}, ${targetEmail})
            RETURNING id
          `;
          targetSchoolId = String(createdSchool[0].id);
        }
      } else {
        const randomPassword = crypto.randomBytes(24).toString("hex");
        const passwordHash = hashPassword(randomPassword);
        const ownerName = `${schoolNameInput} Admin`.slice(0, 120);

        const createdUser = await sql`
          INSERT INTO users_hq (email, password_hash, full_name, role, status)
          VALUES (${targetEmail}, ${passwordHash}, ${ownerName}, 'school_owner', 'active')
          RETURNING id
        `;
        targetUserId = String(createdUser[0].id);

        const createdSchool = await sql`
          INSERT INTO schools (owner_user_id, school_name, contact_email)
          VALUES (${targetUserId}::uuid, ${schoolNameInput}, ${targetEmail})
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

    const originalMinor = Number(currency === "USD" ? plan.price_usd_cents : plan.price_ngn_kobo);
    let discountMinor = 0;
    let discountedMinor = originalMinor;
    let promoId: string | null = null;
    let promoText: string | null = null;

    if (promoCodeRaw) {
      const ev = await evaluatePromoCode({
        rawCode: promoCodeRaw,
        planId: plan.id,
        currency,
        schoolId: targetSchoolId,
        email: targetEmail,
      });
      if (!ev.valid) {
        return NextResponse.json(
          { ok: false, error: ev.error || "invalid_promo", message: ev.message || "Invalid promo code." },
          { status: 400 }
        );
      }
      if (ev.code_type === "redeem") {
        return NextResponse.json(
          {
            ok: false,
            error: "use_redeem_endpoint",
            message: "This is a 100% free voucher code. Click Redeem & Issue Licence Free.",
          },
          { status: 400 }
        );
      }
      promoId = ev.promo?.id || null;
      promoText = ev.promo?.code || promoCodeRaw;
      discountMinor = ev.discount_amount_minor || 0;
      discountedMinor = ev.final_amount_minor ?? originalMinor;
    }

    if (discountedMinor <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "use_redeem_endpoint",
          message: "Your 100% discount makes this order free. Click Redeem & Issue Licence Free.",
        },
        { status: 400 }
      );
    }

    const feeBreakdown = computePaystackFeeBreakdown({
      baseMinor: discountedMinor,
      currency,
      settings,
    });

    const chargeMinor = feeBreakdown.charge_minor;
    const reference = generateSecurePaymentReference("CTPAY");
    const receiptToken = issueReceiptAccessToken(reference);
    const origin = req.nextUrl.origin || "https://cognitara.net";
    const callbackUrl = `${origin}/pay/done?reference=${encodeURIComponent(reference)}&rt=${encodeURIComponent(receiptToken)}`;

    const psRes = await paystackRequest(settings.paystack_secret_key, "/transaction/initialize", "POST", {
      email: targetEmail,
      amount: chargeMinor,
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        school_id: targetSchoolId,
        school_name: targetSchoolName,
        buyer_email: targetEmail,
        user_id: targetUserId,
        plan_id: plan.id,
        plan_slug: plan.slug,
        promo_code: promoText,
        fee_mode: settings.paystack_fee_mode,
        added_fee_minor: feeBreakdown.added_fee_minor,
        source: "web_checkout",
      },
    });

    if (!psRes.ok || !psRes.data?.data?.authorization_url) {
      return NextResponse.json(
        {
          ok: false,
          error: "paystack_init_failed",
          message: psRes.data?.message || "Paystack could not initialize checkout right now.",
        },
        { status: 502 }
      );
    }

    const initCheck = [
      {
        step: "Secure web checkout initialized",
        ok: true,
        detail: `${isTestMode ? "Test" : "Live"} mode · ${currency} ${(chargeMinor / 100).toLocaleString()} · ${targetSchoolName}`,
        at: new Date().toISOString(),
      },
    ];

    await sql`
      INSERT INTO subscriptions_payments (
        school_id, user_id, plan_id, paystack_reference, currency, amount_minor,
        original_amount_minor, discount_amount_minor, fee_minor, customer_paid_minor,
        is_test, promo_code_id, promo_code_text, payment_channel, status,
        buyer_school_name, buyer_email, verification_checks_json
      ) VALUES (
        ${targetSchoolId}::uuid,
        ${targetUserId}::uuid,
        ${plan.id}::uuid,
        ${reference},
        ${currency},
        ${discountedMinor},
        ${originalMinor},
        ${discountMinor},
        ${feeBreakdown.added_fee_minor},
        ${chargeMinor},
        ${isTestMode},
        ${promoId}::uuid,
        ${promoText},
        'paystack',
        'initialized',
        ${targetSchoolName},
        ${targetEmail},
        ${JSON.stringify(initCheck)}::jsonb
      )
    `;

    const res = NextResponse.json({
      ok: true,
      reference,
      receipt_token: receiptToken,
      authorization_url: psRes.data.data.authorization_url,
      access_code: psRes.data.data.access_code,
      is_test: isTestMode,
      currency,
      original_amount_minor: originalMinor,
      discount_amount_minor: discountMinor,
      amount_minor: discountedMinor,
      added_fee_minor: feeBreakdown.added_fee_minor,
      charge_minor: chargeMinor,
      plan_name: plan.display_name,
    });

    res.cookies.set(
      RECEIPT_GRANT_COOKIE,
      appendReceiptGrantCookieValue(req.cookies.get(RECEIPT_GRANT_COOKIE)?.value, reference),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 14, // 14 days
      }
    );
    return res;
  } catch (err) {
    console.error("Quick Paystack checkout error:", err);
    return NextResponse.json(
      { ok: false, error: "checkout_init_failed", message: "Could not start checkout right now." },
      { status: 500 }
    );
  }
}
