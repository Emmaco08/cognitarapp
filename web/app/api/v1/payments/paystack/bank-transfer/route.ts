import crypto from "node:crypto";
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

export const dynamic = "force-dynamic";

/**
 * Native In-App Paystack Bank Transfer via Paystack Charge API (`POST /charge` with
 * `bank_transfer: { account_expires_at }`).
 *
 * Returns a single-use Paystack-Titan virtual account number, account name, exact NGN
 * amount, and expiration timestamp so CogniTara Studio renders a native in-app transfer
 * sheet with Copy buttons, a live countdown, and auto-polling — zero <webview> and zero
 * browser redirect for Bank Transfer!
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`ps-bt:${ip}`, 15, 60_000);
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

    const planId = String(body.plan_id || "").trim();
    const currency = String(body.currency || settings.default_currency || "NGN").trim().toUpperCase();
    const promoCodeRaw = String(body.promo_code || "").trim().toUpperCase();
    const source = body.source === "desktop" ? "desktop" : "web";
    const hwidHash = body.hwid_hash && /^[0-9a-f]{64}$/i.test(String(body.hwid_hash)) ? String(body.hwid_hash).toLowerCase() : null;
    const displayHwid = body.display_hwid ? String(body.display_hwid).trim().slice(0, 64) : null;

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
            message: "This is a free voucher code — use Redeem voucher code to activate immediately for free!",
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
          message: "Your 100% discount makes this order free — use Redeem voucher code to activate instantly!",
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
    const reference = `CTPAY_${Date.now()}_${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const origin = req.nextUrl.origin || "https://cognitara-cloud.vercel.app";
    const callbackUrl = `${origin}/pay/done?reference=${encodeURIComponent(reference)}&source=${source}`;

    const metadata = {
      school_id: account.school.id,
      school_name: account.school.school_name,
      user_id: account.user.id,
      plan_id: plan.id,
      plan_slug: plan.slug,
      promo_code: promoText,
      fee_mode: settings.paystack_fee_mode,
      added_fee_minor: feeBreakdown.added_fee_minor,
      source,
      payment_method: "bank_transfer",
      hwid_hash: hwidHash,
      display_hwid: displayHwid,
    };

    // Native Paystack Charge API Pay-with-Transfer (NGN)
    if (currency === "NGN") {
      // Paystack PwT allows up to 25-30 min expiry; use 25 min UTC ISO 8601
      const expiresAtIso = new Date(Date.now() + 25 * 60 * 1000).toISOString();
      const chargeRes = await paystackRequest(settings.paystack_secret_key, "/charge", "POST", {
        email: account.user.email,
        amount: chargeMinor,
        currency: "NGN",
        reference,
        bank_transfer: {
          account_expires_at: expiresAtIso,
        },
        metadata,
      });

      const d = chargeRes.data?.data as Record<string, any> | undefined;
      if (chargeRes.ok && d && d.account_number) {
        const initCheck = [
          {
            step: "Paystack bank transfer account issued",
            ok: true,
            detail: `${isTestMode ? "Test" : "Live"} mode · ${d.bank?.name || "Paystack-Titan"} ${d.account_number} (${source})`,
            at: new Date().toISOString(),
          },
        ];

        await sql`
          INSERT INTO subscriptions_payments (
            school_id, user_id, plan_id, paystack_reference, currency, amount_minor,
            original_amount_minor, discount_amount_minor, fee_minor, customer_paid_minor,
            is_test, promo_code_id, promo_code_text, payment_channel, paystack_sub_channel, status,
            pending_hwid_hash, pending_display_hwid, verification_checks_json
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
            'bank_transfer',
            'initialized',
            ${hwidHash},
            ${displayHwid},
            ${JSON.stringify(initCheck)}::jsonb
          )
        `;

        return NextResponse.json({
          ok: true,
          mode: "native_bank_transfer",
          reference,
          is_test: isTestMode,
          bank_name: String(d.bank?.name || "Paystack-Titan"),
          account_number: String(d.account_number),
          account_name: String(d.account_name || "PAYSTACK CHECKOUT"),
          account_expires_at: String(d.account_expires_at || expiresAtIso),
          display_text: String(d.display_text || "Transfer the exact amount to the one-time account below."),
          currency,
          original_amount_minor: originalMinor,
          discount_amount_minor: discountMinor,
          amount_minor: discountedMinor,
          added_fee_minor: feeBreakdown.added_fee_minor,
          charge_minor: Number(d.amount || chargeMinor),
          fee_mode: feeBreakdown.fee_mode,
          fee_note: feeBreakdown.fee_note,
          plan_name: plan.display_name,
          duration_days: plan.duration_days,
        });
      }
    }

    // Fallback: initialize Paystack checkout pre-selected strictly to bank_transfer channel
    const fallbackRes = await paystackRequest(settings.paystack_secret_key, "/transaction/initialize", "POST", {
      email: account.user.email,
      amount: chargeMinor,
      currency,
      reference,
      channels: ["bank_transfer"],
      callback_url: callbackUrl,
      metadata,
    });

    if (!fallbackRes.ok || !fallbackRes.data?.data?.authorization_url) {
      return NextResponse.json(
        {
          ok: false,
          error: "paystack_bank_transfer_failed",
          message: fallbackRes.data?.message || "Paystack could not create a bank transfer session right now.",
        },
        { status: 502 }
      );
    }

    const fallbackCheck = [
      {
        step: "Bank transfer checkout initialized",
        ok: true,
        detail: `${isTestMode ? "Test" : "Live"} mode · ${currency} ${(chargeMinor / 100).toLocaleString()} (${source})`,
        at: new Date().toISOString(),
      },
    ];

    await sql`
      INSERT INTO subscriptions_payments (
        school_id, user_id, plan_id, paystack_reference, currency, amount_minor,
        original_amount_minor, discount_amount_minor, fee_minor, customer_paid_minor,
        is_test, promo_code_id, promo_code_text, payment_channel, paystack_sub_channel, status,
        pending_hwid_hash, pending_display_hwid, verification_checks_json
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
        'bank_transfer',
        'initialized',
        ${hwidHash},
        ${displayHwid},
        ${JSON.stringify(fallbackCheck)}::jsonb
      )
    `;

    return NextResponse.json({
      ok: true,
      mode: "browser_checkout",
      reference,
      is_test: isTestMode,
      authorization_url: fallbackRes.data.data.authorization_url,
      access_code: fallbackRes.data.data.access_code,
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
  } catch (err) {
    console.error("Paystack bank-transfer error:", err);
    return NextResponse.json(
      { ok: false, error: "bank_transfer_init_failed", message: "Could not start bank transfer right now." },
      { status: 500 }
    );
  }
}
