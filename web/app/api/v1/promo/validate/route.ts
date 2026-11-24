import { NextRequest, NextResponse } from "next/server";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";
import { evaluatePromoCode } from "@/lib/platform";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`promo-val:${ip}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many attempts. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "invalid_json", message: "Invalid JSON body." }, { status: 400 });
    }

    const token = extractBearerOrCookieToken(req);
    const account = token ? await resolveAuthenticatedAccount(token) : null;

    const evalRes = await evaluatePromoCode({
      rawCode: String(body.code || ""),
      planId: body.plan_id ? String(body.plan_id) : null,
      currency: String(body.currency || "NGN").toUpperCase(),
      schoolId: account?.school?.id || null,
    });

    if (!evalRes.valid) {
      return NextResponse.json(
        { ok: false, error: evalRes.error || "invalid_code", message: evalRes.message || "Invalid code." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      code: evalRes.promo?.code,
      code_type: evalRes.code_type,
      discount_kind: evalRes.promo?.discount_kind || null,
      discount_value: Number(evalRes.promo?.discount_value || 0),
      original_amount_minor: evalRes.original_amount_minor ?? 0,
      discount_amount_minor: evalRes.discount_amount_minor ?? 0,
      final_amount_minor: evalRes.final_amount_minor ?? 0,
      grant_plan: evalRes.grant_plan || null,
      message: evalRes.message,
    });
  } catch (err) {
    console.error("Promo validate error:", err);
    return NextResponse.json({ ok: false, error: "promo_validation_failed", message: "Could not validate code." }, { status: 500 });
  }
}
