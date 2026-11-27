import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";
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

export async function POST(req: NextRequest) {
  try {
    if (!verifyMutationOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: "invalid_origin", message: "Cross-origin checkout request blocked." },
        { status: 403 }
      );
    }

    const ip = getClientIp(req);
    const rl = checkRateLimit(`ps-init:${ip}`, 15, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many checkout attempts. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const token = extractBearerOrCookieToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Sign in to your CogniTara account first to purchase a licence." },
        { status: 401 }
      );
    }
    const account = await resolveAuthenticatedAccount(token);
    if (!account || !account.school) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "A valid school account is required." },
        { status: 401 }
      );
    }
    if (account.school.status !== "active") {
      return NextResponse.json(
        { ok: false, error: "school_suspended", message: "Your school account is currently suspended." },
        { status: 403 }
      );
    }

    const settings = await getPlatformSettings();
    if (!settings.allow_paystack_checkout) {
      return NextResponse.json(
        { ok: false, error: "checkout_paused", message: "Payments are temporarily paused for a few minutes. Please try again shortly." },
        { status: 403 }
      );
    }

    const isTestMode = settings.paystack_mode !== "live";
    const isStaff = account.user.role === "hq_super_admin" || account.user.role === "hq_admin";
    if (isTestMode && settings.test_mode_staff_only && !isStaff) {
      return NextResponse.json(
        {
          ok: false,
          error: "payments_paused_test_mode",
          message: "Payments are paused for a few minutes while we run maintenance checks. Please try again shortly.",
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

    if (String(body.source || "").toLowerCase() === "desktop") {
      return NextResponse.json(
        {
          ok: false,
          error: "desktop_payments_disabled",
          message:
            "In-app desktop payments are disabled. Purchase or renew your licence at https://cognitara.net/license and enter your licence key in CogniTara Studio.",
        },
        { status: 410 }
      );
    }

    const planId = String(body.plan_id || "").trim();
    const currencyRaw = String(body.currency || settings.default_currency || "NGN").trim().toUpperCase();
    const currency = currencyRaw === "USD" ? "USD" : "NGN";
    const promoCodeRaw = String(body.promo_code || "").trim().toUpperCase();
    const source = "web";
    const buyerSchoolName = String(body.school_name || account.school.school_name || "").trim().slice(0, 160);
    const buyerEmail = account.user.email;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)) {
      return NextResponse.json({ ok: false, error: "invalid_plan", message: "Select a valid plan." }, { status: 400 });
    }

    const sql = getSql();
    const planRows = await sql`SELECT * FROM plans WHERE id = ${planId}::uuid AND is_active = TRUE LIMIT 1`;
    if (!planRows.length) {
      return NextResponse.json({ ok: false, error: "plan_not_found", message: "Selected plan is no longer available." }, { status: 404 });
    }
    const plan = planRows[0] as Record<string, any>;

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
        schoolId: account.school.id,
        email: buyerEmail,
      });
      if (!ev.valid) {
        return NextResponse.json(
          { ok: false, error: ev.error || "invalid_promo", message: ev.message || "Invalid discount code." },
          { status: 400 }
        );
      }
      if (ev.code_type === "redeem") {
        return NextResponse.json(
          {
            ok: false,
            error: "use_redeem_endpoint",
            message: "This is a free voucher code. Click Redeem Code to activate immediately for free!",
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
          error: "zero_amount_use_redeem",
          message: "Your 100% discount makes this order free. Use Redeem Code to activate instantly!",
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
      email: buyerEmail,
      amount: chargeMinor,
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        school_id: account.school.id,
        school_name: buyerSchoolName,
        buyer_email: buyerEmail,
        user_id: account.user.id,
        plan_id: plan.id,
        plan_slug: plan.slug,
        promo_code: promoText,
        fee_mode: settings.paystack_fee_mode,
        added_fee_minor: feeBreakdown.added_fee_minor,
        source,
      },
    });

    if (!psRes.ok || !psRes.data?.data?.authorization_url) {
      return NextResponse.json(
        {
          ok: false,
          error: "paystack_init_failed",
          message: psRes.data?.message || "Paystack could not initialize checkout. Check your Paystack keys & currency.",
        },
        { status: 502 }
      );
    }

    const initCheck = [
      {
        step: "Checkout initialized",
        ok: true,
        detail: `${isTestMode ? "Test" : "Live"} mode · ${currency} ${(chargeMinor / 100).toLocaleString()} (${source})`,
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
        ${account.school.id}::uuid,
        ${account.user.id}::uuid,
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
        ${buyerSchoolName},
        ${buyerEmail},
        ${JSON.stringify(initCheck)}::jsonb
      )
    `;

    const res = NextResponse.json({
      ok: true,
      mode: "browser_checkout",
      reference,
      receipt_token: receiptToken,
      is_test: isTestMode,
      authorization_url: psRes.data.data.authorization_url,
      access_code: psRes.data.data.access_code,
      callback_url: callbackUrl,
      currency,
      original_amount_minor: originalMinor,
      discount_amount_minor: discountMinor,
      amount_minor: discountedMinor,
      added_fee_minor: feeBreakdown.added_fee_minor,
      charge_minor: chargeMinor,
      fee_mode: feeBreakdown.fee_mode,
      fee_note: feeBreakdown.fee_note,
      plan_name: plan.display_name,
      duration_days: plan.duration_days,
    });

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
    console.error("Paystack initialize error:", err);
    return NextResponse.json(
      { ok: false, error: "checkout_init_failed", message: "Could not start checkout right now." },
      { status: 500 }
    );
  }
}
