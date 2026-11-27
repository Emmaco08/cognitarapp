import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractBearerOrCookieToken, normalizeEmail, resolveAuthenticatedAccount } from "@/lib/auth";
import { evaluatePromoCode } from "@/lib/platform";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { checkDbLockout, clearDbAuthLockout, recordDbAuthFailure } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`promo-val:${ip}`, 25, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many code checks. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const lockKey = `promo-guess:${ip}`;
    const lock = await checkDbLockout(lockKey);
    if (lock.locked) {
      return NextResponse.json(
        {
          ok: false,
          error: "temporarily_locked",
          message: `Too many invalid code attempts. Try again in ${Math.ceil(lock.retryAfterSec / 60)} min.`,
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

    let planId: string | null = body.plan_id ? String(body.plan_id).trim() : null;
    const planSlug = body.plan_slug ? String(body.plan_slug).trim().toLowerCase() : null;
    if (planId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)) {
      planId = null;
    }
    if (!planId && planSlug) {
      const sql = getSql();
      const rows = await sql`SELECT id FROM plans WHERE LOWER(slug) = ${planSlug} AND is_active = TRUE LIMIT 1`;
      if (rows[0]?.id) planId = String(rows[0].id);
    }

    const emailParam = body.email ? normalizeEmail(String(body.email)) : account?.user.email || null;
    const currency = String(body.currency || "NGN").trim().toUpperCase() === "USD" ? "USD" : "NGN";

    const evalRes = await evaluatePromoCode({
      rawCode: String(body.code || ""),
      planId,
      currency,
      schoolId: account?.school?.id || null,
      email: emailParam,
    });

    if (!evalRes.valid) {
      if (evalRes.error === "code_not_found") {
        await recordDbAuthFailure(lockKey);
      }
      return NextResponse.json(
        { ok: false, error: evalRes.error || "invalid_code", message: evalRes.message || "Invalid code." },
        { status: 400 }
      );
    }

    await clearDbAuthLockout(lockKey);

    const isFree = evalRes.code_type === "redeem" || (evalRes.final_amount_minor ?? 1) === 0;
    return NextResponse.json({
      ok: true,
      code: evalRes.promo?.code,
      code_type: evalRes.code_type,
      is_free: isFree,
      discount_kind: evalRes.promo?.discount_kind || null,
      discount_value: Number(evalRes.promo?.discount_value || 0),
      original_amount_minor: evalRes.original_amount_minor ?? 0,
      discount_amount_minor: evalRes.discount_amount_minor ?? 0,
      final_amount_minor: evalRes.final_amount_minor ?? 0,
      grant_plan: evalRes.grant_plan || null,
      description: evalRes.promo?.description || evalRes.promo?.notes || "",
      expires_at: evalRes.promo?.expires_at || null,
      message: evalRes.message,
    });
  } catch (err) {
    console.error("Promo validate error:", err);
    return NextResponse.json({ ok: false, error: "promo_validation_failed", message: "Could not validate code." }, { status: 500 });
  }
}
