import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";
import { evaluatePromoCode, issueSignedLicenseForSchool, logDeveloperAudit } from "@/lib/platform";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`promo-redeem:${ip}`, 15, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many redeem attempts. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const token = extractBearerOrCookieToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Sign in to your CogniTara Cloud account first to redeem a code." },
        { status: 401 }
      );
    }
    const account = await resolveAuthenticatedAccount(token);
    if (!account || !account.school) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Valid school account required to redeem a code." },
        { status: 401 }
      );
    }
    if (account.school.status !== "active") {
      return NextResponse.json(
        { ok: false, error: "school_suspended", message: "Your school account is suspended." },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "invalid_json", message: "Invalid JSON body." }, { status: 400 });
    }

    const rawCode = String(body.code || "").trim().toUpperCase();
    const planId = body.plan_id ? String(body.plan_id) : null;
    const currency = String(body.currency || "NGN").toUpperCase();
    const hwidHash = body.hwid_hash ? String(body.hwid_hash).trim() : null;
    const displayHwid = body.display_hwid ? String(body.display_hwid).trim().slice(0, 64) : null;
    const hwComponentHashes =
      body.hw_component_hashes && typeof body.hw_component_hashes === "object"
        ? (body.hw_component_hashes as Record<string, string>)
        : null;
    const machineHostname = body.machine_hostname ? String(body.machine_hostname).trim().slice(0, 120) : null;
    const osVersion = body.os_version ? String(body.os_version).trim().slice(0, 120) : null;

    const evalRes = await evaluatePromoCode({
      rawCode,
      planId,
      currency,
      schoolId: account.school.id,
    });

    if (!evalRes.valid || !evalRes.promo) {
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
          message: "This is a discount code — apply it during Paystack checkout to get your discount.",
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

    const sql = getSql();
    // Atomic increment with max_uses guard to prevent race-condition double redemptions!
    const claimed = await sql`
      UPDATE promo_codes
      SET uses_count = uses_count + 1
      WHERE id = ${promo.id}::uuid
        AND is_active = TRUE
        AND (max_uses IS NULL OR uses_count < max_uses)
        AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING id
    `;
    if (!claimed.length) {
      return NextResponse.json(
        { ok: false, error: "code_exhausted", message: "This code has just been fully claimed or expired." },
        { status: 409 }
      );
    }

    const ref = `RDM-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const paymentRows = await sql`
      INSERT INTO subscriptions_payments (
        school_id, user_id, plan_id, paystack_reference, currency, amount_minor,
        original_amount_minor, discount_amount_minor, promo_code_id, promo_code_text,
        payment_channel, status, paid_at, notes
      ) VALUES (
        ${account.school.id}::uuid,
        ${account.user.id}::uuid,
        ${targetPlanId}::uuid,
        ${ref},
        ${currency},
        0,
        ${evalRes.original_amount_minor || 0},
        ${evalRes.original_amount_minor || 0},
        ${promo.id}::uuid,
        ${promo.code},
        'redeem_code',
        'success',
        NOW(),
        ${`Redeemed voucher ${promo.code}`}
      )
      RETURNING id
    `;
    const paymentId = paymentRows[0]?.id as string;

    const { license, signed_lease } = await issueSignedLicenseForSchool({
      schoolId: account.school.id,
      planId: targetPlanId,
      paymentId,
      durationDaysOverride: evalRes.code_type === "redeem" && promo.grant_duration_days ? Number(promo.grant_duration_days) : undefined,
      hwidHash,
      displayHwid,
      hwComponentHashes,
      machineHostname,
      osVersion,
    });

    await sql`
      INSERT INTO promo_redemptions (promo_code_id, user_id, school_id, payment_id, license_id, discount_applied_minor)
      VALUES (
        ${promo.id}::uuid,
        ${account.user.id}::uuid,
        ${account.school.id}::uuid,
        ${paymentId}::uuid,
        ${license.id}::uuid,
        ${evalRes.original_amount_minor || 0}
      )
    `;

    await logDeveloperAudit({
      actorUserId: account.user.id,
      actorEmail: account.user.email,
      action: "promo_code_redeemed",
      targetType: "license",
      targetId: license.id,
      ipAddress: ip,
      details: { code: promo.code, school_id: account.school.id, license_key: license.license_key },
    });

    return NextResponse.json({
      ok: true,
      message: `Code ${promo.code} redeemed! Your CogniTara licence is active.`,
      license: {
        id: license.id,
        license_key: license.license_key,
        plan_tier: license.plan_tier,
        status: license.status,
        expires_at: license.expires_at,
      },
      signed_lease,
    });
  } catch (err) {
    console.error("Promo redeem error:", err);
    return NextResponse.json({ ok: false, error: "redeem_failed", message: "Could not redeem code right now." }, { status: 500 });
  }
}
