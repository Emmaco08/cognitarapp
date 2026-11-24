import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";
import { evaluatePromoCode, getPlatformSettings, paystackRequest } from "@/lib/platform";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
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
        { ok: false, error: "unauthorized", message: "Sign in to your CogniTara Cloud account first to purchase a licence." },
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
        { ok: false, error: "checkout_paused", message: "Online checkout is temporarily paused by CogniTara HQ." },
        { status: 403 }
      );
    }
    if (!settings.paystack_secret_key || !settings.paystack_public_key) {
      return NextResponse.json(
        {
          ok: false,
          error: "paystack_not_configured",
          message: "Paystack keys are not configured yet. Set Public & Secret Keys in the Developer HQ Console.",
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
    let finalMinor = originalMinor;
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
            message: "This is a full redeem voucher code — click Redeem Code to activate immediately for free!",
          },
          { status: 400 }
        );
      }
      promoId = ev.promo?.id || null;
      promoText = ev.promo?.code || promoCodeRaw;
      discountMinor = ev.discount_amount_minor || 0;
      finalMinor = ev.final_amount_minor ?? originalMinor;
    }

    if (finalMinor <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "zero_amount_use_redeem",
          message: "Your 100% discount makes this order free — use the Redeem button to activate instantly!",
        },
        { status: 400 }
      );
    }

    const reference = `CTPAY_${Date.now()}_${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const origin = req.nextUrl.origin || "https://cognitara-cloud.vercel.app";
    const callbackUrl = `${origin}/dashboard?paystack_ref=${encodeURIComponent(reference)}`;

    const psRes = await paystackRequest(settings.paystack_secret_key, "/transaction/initialize", "POST", {
      email: account.user.email,
      amount: finalMinor,
      currency,
      reference,
      callback_url: callbackUrl,
      metadata: {
        school_id: account.school.id,
        school_name: account.school.school_name,
        user_id: account.user.id,
        plan_id: plan.id,
        plan_slug: plan.slug,
        promo_code: promoText,
        hwid_hash: hwidHash,
        display_hwid: displayHwid,
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

    await sql`
      INSERT INTO subscriptions_payments (
        school_id, user_id, plan_id, paystack_reference, currency, amount_minor,
        original_amount_minor, discount_amount_minor, promo_code_id, promo_code_text,
        payment_channel, status, pending_hwid_hash, pending_display_hwid
      ) VALUES (
        ${account.school.id}::uuid,
        ${account.user.id}::uuid,
        ${plan.id}::uuid,
        ${reference},
        ${currency},
        ${finalMinor},
        ${originalMinor},
        ${discountMinor},
        ${promoId}::uuid,
        ${promoText},
        'paystack',
        'initialized',
        ${hwidHash},
        ${displayHwid}
      )
    `;

    return NextResponse.json({
      ok: true,
      reference,
      authorization_url: psRes.data.data.authorization_url,
      access_code: psRes.data.data.access_code,
      public_key: settings.paystack_public_key,
      currency,
      original_amount_minor: originalMinor,
      discount_amount_minor: discountMinor,
      amount_minor: finalMinor,
      plan_name: plan.display_name,
    });
  } catch (err) {
    console.error("Paystack initialize error:", err);
    return NextResponse.json(
      { ok: false, error: "checkout_init_failed", message: "Could not start checkout right now." },
      { status: 500 }
    );
  }
}
