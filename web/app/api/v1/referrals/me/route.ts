import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { generateReferralCode, resolveSchoolAccountForRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const account = await resolveSchoolAccountForRequest(req);
    if (!account) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "Sign in required." }, { status: 401 });
    }

    const sql = getSql();
    let refRows = await sql`
      SELECT id, referral_code, reward_mode, custom_commission_pct, custom_bonus_days, is_active, created_at
      FROM referrals
      WHERE owner_user_id = ${account.user.id}::uuid
      ORDER BY created_at ASC
      LIMIT 1
    `;

    // Ensure every school owner always has an active referral code
    if (!refRows.length && account.school) {
      const code = generateReferralCode(account.school.school_name);
      refRows = await sql`
        INSERT INTO referrals (owner_user_id, school_id, referral_code, reward_mode, is_active)
        VALUES (${account.user.id}::uuid, ${account.school.id}::uuid, ${code}, 'dual', TRUE)
        RETURNING id, referral_code, reward_mode, custom_commission_pct, custom_bonus_days, is_active, created_at
      `;
    }

    const ref = (refRows[0] as Record<string, any>) || null;
    const code = ref?.referral_code || null;

    const [referredSchools, conversions, walletRows, payoutRows] = await Promise.all([
      code
        ? sql`
            SELECT id, school_name, state_region, created_at
            FROM schools
            WHERE UPPER(referral_code_used) = ${String(code).toUpperCase()}
            ORDER BY created_at DESC
            LIMIT 50
          `
        : Promise.resolve([]),
      sql`
        SELECT rc.id, rc.applied_reward_mode, rc.commission_pct_applied, rc.commission_amount_kobo,
               rc.bonus_days_granted_referrer, rc.bonus_days_granted_referee, rc.status, rc.created_at,
               s.school_name AS referred_school_name,
               sp.currency, sp.amount_minor
        FROM referral_conversions rc
        JOIN schools s ON s.id = rc.referred_school_id
        JOIN subscriptions_payments sp ON sp.id = rc.payment_id
        WHERE rc.referrer_user_id = ${account.user.id}::uuid
        ORDER BY rc.created_at DESC
        LIMIT 50
      `,
      sql`
        SELECT id, entry_type, currency, amount_minor, balance_after_minor, notes, created_at
        FROM wallet_ledger
        WHERE user_id = ${account.user.id}::uuid
        ORDER BY created_at DESC
        LIMIT 30
      `,
      sql`
        SELECT id, currency, amount_minor, bank_code, account_number_masked, status, rejection_reason, created_at
        FROM payout_requests
        WHERE user_id = ${account.user.id}::uuid
        ORDER BY created_at DESC
        LIMIT 20
      `,
    ]);

    const walletBalanceMinor = walletRows.length ? Number(walletRows[0].balance_after_minor || 0) : 0;
    const totalEarnedMinor = conversions
      .filter((c: Record<string, any>) => c.status === "credited")
      .reduce((acc: number, c: Record<string, any>) => acc + Number(c.commission_amount_kobo || 0), 0);
    const totalBonusDays = conversions
      .filter((c: Record<string, any>) => c.status === "credited")
      .reduce((acc: number, c: Record<string, any>) => acc + Number(c.bonus_days_granted_referrer || 0), 0);

    const rawOrigin = (process.env.NEXT_PUBLIC_SITE_URL || "https://cognitara.net").trim().replace(/\/+$/, "");
    const shareOrigin = rawOrigin.includes("portal.cognitara.net") ? "https://cognitara.net" : rawOrigin;

    return NextResponse.json({
      ok: true,
      referral: ref
        ? {
            ...ref,
            commission_pct: Number(ref.custom_commission_pct ?? 15),
            bonus_days: Number(ref.custom_bonus_days ?? 14),
            share_url: `${shareOrigin}/signup?ref=${encodeURIComponent(ref.referral_code)}`,
          }
        : null,
      stats: {
        schools_signed_up: referredSchools.length,
        paid_conversions: conversions.filter((c: Record<string, any>) => c.status === "credited").length,
        wallet_balance_minor: walletBalanceMinor,
        total_earned_minor: totalEarnedMinor,
        total_bonus_days: totalBonusDays,
      },
      referred_schools: referredSchools,
      conversions,
      wallet_ledger: walletRows,
      payout_requests: payoutRows,
    });
  } catch (err) {
    console.error("Referrals me GET error:", err);
    return NextResponse.json({ ok: false, error: "referrals_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const account = await resolveSchoolAccountForRequest(req);
    if (!account) {
      return NextResponse.json({ ok: false, message: "Sign in required." }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const amountNgn = Math.floor(Number(body?.amount_ngn || 0));
    const bankName = String(body?.bank_code || "").trim().slice(0, 60);
    const accountNumber = String(body?.account_number || "").replace(/\D+/g, "").slice(0, 20);

    if (amountNgn < 2000) {
      return NextResponse.json({ ok: false, message: "Minimum payout request is ₦2,000." }, { status: 400 });
    }
    if (!bankName || accountNumber.length < 8) {
      return NextResponse.json({ ok: false, message: "Enter your bank name and valid account number." }, { status: 400 });
    }

    const amountMinor = amountNgn * 100;
    const sql = getSql();
    const balRows = await sql`
      SELECT COALESCE(balance_after_minor, 0)::bigint AS bal
      FROM wallet_ledger
      WHERE user_id = ${account.user.id}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const currentBal = Number(balRows[0]?.bal || 0);
    if (amountMinor > currentBal) {
      return NextResponse.json(
        { ok: false, message: `Requested amount exceeds your available balance (₦${(currentBal / 100).toLocaleString()}).` },
        { status: 400 }
      );
    }

    const maskedAcct = `${accountNumber.slice(0, 2)}••••${accountNumber.slice(-4)}`;
    const inserted = await sql`
      INSERT INTO payout_requests (user_id, currency, amount_minor, bank_code, account_number_masked, status)
      VALUES (${account.user.id}::uuid, 'NGN', ${amountMinor}, ${bankName}, ${maskedAcct}, 'pending')
      RETURNING id, amount_minor, bank_code, account_number_masked, status, created_at
    `;
    const payoutId = String(inserted[0].id);

    await sql`
      INSERT INTO wallet_ledger (
        user_id, payout_request_id, entry_type, currency, amount_minor, balance_after_minor, idempotency_key, notes
      ) VALUES (
        ${account.user.id}::uuid,
        ${payoutId}::uuid,
        'payout_hold',
        'NGN',
        ${-amountMinor},
        ${currentBal - amountMinor},
        ${`payout_hold:${payoutId}`},
        ${`Payout request to ${bankName} (${maskedAcct})`}
      )
    `;

    return NextResponse.json({
      ok: true,
      payout: inserted[0],
      message: `Payout request for ₦${amountNgn.toLocaleString()} submitted for HQ review.`,
    });
  } catch (err) {
    console.error("Payout request POST error:", err);
    return NextResponse.json({ ok: false, message: "Could not submit payout request." }, { status: 500 });
  }
}
