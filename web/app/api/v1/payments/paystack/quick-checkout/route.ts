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

export const dynamic = "force-dynamic";

/**
 * Direct Paystack license purchase endpoint for /license:
 * - If already signed in, uses the authenticated school account.
 * - If purchasing directly on /license without signing in first, accepts email + school_name,
 *   links an existing school account (or provisions a new school account), and starts Paystack
 *   checkout. After payment, /pay/done immediately issues, displays, and emails the Ed25519 key.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`ps-quick:${ip}`, 12, 60_000);
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

    const planId = String(body.plan_id || "").trim();
    const currency = String(body.currency || settings.default_currency || "NGN").trim().toUpperCase();
    const promoCodeRaw = String(body.promo_code || "").trim().toUpperCase();

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)) {
      return NextResponse.json({ ok: false, error: "invalid_plan", message: "Select a valid licence plan." }, { status: 400 });
    }

    const sql = getSql();
    const planRows = await sql`SELECT * FROM plans WHERE id = ${planId}::uuid AND is_active = TRUE LIMIT 1`;
    if (!planRows.length) {
      return NextResponse.json({ ok: false, error: "plan_not_found", message: "Selected plan is no longer available." }, { status: 404 });
    }
    const plan = planRows[0] as Record<string, any>;

    let targetUserId: string;
    let targetSchoolId: string;
    let targetSchoolName: string;
    let targetEmail: string;

    if (account?.school) {
      if (account.school.status !== "active") {
        return NextResponse.json(
          { ok: false, error: "school_suspended", message: "Your school account is currently suspended." },
          { status: 403 }
        );
      }
      targetUserId = account.user.id;
      targetSchoolId = account.school.id;
      targetSchoolName = account.school.school_name;
      targetEmail = account.user.email;
    } else {
      const email = normalizeEmail(String(body.email || ""));
      const schoolNameInput = String(body.school_name || "").trim().slice(0, 160);
      const fullNameInput = String(body.full_name || "").trim().slice(0, 120);

      if (!isValidEmail(email)) {
        return NextResponse.json(
          { ok: false, error: "invalid_email", message: "Enter a valid school email so we can deliver your licence key." },
          { status: 400 }
        );
      }

      const existingUsers = await sql`
        SELECT u.id, u.email, u.status, u.role, s.id AS school_id, s.school_name, s.status AS school_status
        FROM users_hq u
        LEFT JOIN schools s ON s.owner_user_id = u.id
        WHERE LOWER(u.email) = ${email}
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
        targetEmail = String(u.email);
        if (u.school_id) {
          if (u.school_status !== "active") {
            return NextResponse.json(
              { ok: false, error: "school_suspended", message: "This school account is currently suspended." },
              { status: 403 }
            );
          }
          targetSchoolId = String(u.school_id);
          targetSchoolName = String(u.school_name || schoolNameInput || "School");
        } else {
          const derivedSchool = schoolNameInput || email.split("@")[0];
          const createdSchool = await sql`
            INSERT INTO schools (owner_user_id, school_name, contact_email)
            VALUES (${targetUserId}::uuid, ${derivedSchool}, ${targetEmail})
            RETURNING id, school_name
          `;
          targetSchoolId = String(createdSchool[0].id);
          targetSchoolName = String(createdSchool[0].school_name);
        }
      } else {
        if (schoolNameInput.length < 2) {
          return NextResponse.json(
            { ok: false, error: "invalid_school_name", message: "Enter your school name to bind your licence certificate." },
            { status: 400 }
          );
        }
        const randomPassword = crypto.randomBytes(24).toString("hex");
        const passwordHash = hashPassword(randomPassword);
        const ownerName = fullNameInput.length >= 2 ? fullNameInput : `${schoolNameInput} Admin`;

        const createdUser = await sql`
          INSERT INTO users_hq (email, password_hash, full_name, role, status)
          VALUES (${email}, ${passwordHash}, ${ownerName}, 'school_owner', 'active')
          RETURNING id, email
        `;
        targetUserId = String(createdUser[0].id);
        targetEmail = String(createdUser[0].email);

        const createdSchool = await sql`
          INSERT INTO schools (owner_user_id, school_name, contact_email)
          VALUES (${targetUserId}::uuid, ${schoolNameInput}, ${targetEmail})
          RETURNING id, school_name
        `;
        targetSchoolId = String(createdSchool[0].id);
        targetSchoolName = String(createdSchool[0].school_name);

        // Auto-create referral code so they can share once signed in
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
            message: "This is a 100% voucher code. Sign in to your dashboard and redeem it for free.",
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
        { ok: false, error: "zero_amount", message: "Sign in to redeem a 100% discount code." },
        { status: 400 }
      );
    }

    const feeBreakdown = computePaystackFeeBreakdown({
      baseMinor: discountedMinor,
      currency,
      settings,
    });

    const chargeMinor = feeBreakdown.charge_minor;
    const reference = `CTPAY_${Date.now()}_${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const origin = req.nextUrl.origin || "https://cognitara-cloud.vercel.app";
    const callbackUrl = `${origin}/pay/done?reference=${encodeURIComponent(reference)}&source=license`;

    const psRes = await paystackRequest(settings.paystack_secret_key, "/transaction/initialize", "POST", {
      email: targetEmail,
      amount: chargeMinor,
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        school_id: targetSchoolId,
        school_name: targetSchoolName,
        user_id: targetUserId,
        plan_id: plan.id,
        plan_slug: plan.slug,
        promo_code: promoText,
        fee_mode: settings.paystack_fee_mode,
        added_fee_minor: feeBreakdown.added_fee_minor,
        source: "license",
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
        step: "License page checkout initialized",
        ok: true,
        detail: `${isTestMode ? "Test" : "Live"} mode · ${currency} ${(chargeMinor / 100).toLocaleString()} (license)`,
        at: new Date().toISOString(),
      },
    ];

    await sql`
      INSERT INTO subscriptions_payments (
        school_id, user_id, plan_id, paystack_reference, currency, amount_minor,
        original_amount_minor, discount_amount_minor, fee_minor, customer_paid_minor,
        is_test, promo_code_id, promo_code_text, payment_channel, status, verification_checks_json
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
        ${JSON.stringify(initCheck)}::jsonb
      )
    `;

    return NextResponse.json({
      ok: true,
      reference,
      is_test: isTestMode,
      authorization_url: psRes.data.data.authorization_url,
      access_code: psRes.data.data.access_code,
      callback_url: callbackUrl,
      currency,
      amount_minor: discountedMinor,
      charge_minor: chargeMinor,
      plan_name: plan.display_name,
    });
  } catch (err) {
    console.error("POST /api/v1/payments/paystack/quick-checkout error:", err);
    return NextResponse.json(
      { ok: false, error: "quick_checkout_failed", message: "Could not start Paystack checkout right now." },
      { status: 500 }
    );
  }
}
