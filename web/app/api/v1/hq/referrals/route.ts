import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireHqAdmin } from "@/lib/auth";
import { logDeveloperAudit } from "@/lib/platform";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "HQ admin access required." }, { status: 403 });
    }

    const sql = getSql();
    const [referrers, conversions, payouts] = await Promise.all([
      sql`
        SELECT
          r.id, r.referral_code, r.reward_mode, r.custom_commission_pct, r.custom_bonus_days,
          r.is_active, r.created_at,
          u.id AS user_id, u.full_name, u.email,
          s.school_name,
          (SELECT COUNT(*)::int FROM schools sc WHERE UPPER(sc.referral_code_used) = UPPER(r.referral_code)) AS signups_count,
          (SELECT COUNT(*)::int FROM referral_conversions rc WHERE rc.referral_id = r.id AND rc.status = 'credited') AS paid_count,
          (SELECT COALESCE(SUM(rc.commission_amount_kobo), 0)::bigint FROM referral_conversions rc WHERE rc.referral_id = r.id AND rc.status = 'credited') AS earned_kobo,
          COALESCE((SELECT wl.balance_after_minor FROM wallet_ledger wl WHERE wl.user_id = u.id ORDER BY wl.created_at DESC LIMIT 1), 0)::bigint AS wallet_balance_kobo
        FROM referrals r
        JOIN users_hq u ON u.id = r.owner_user_id
        LEFT JOIN schools s ON s.id = r.school_id
        ORDER BY earned_kobo DESC, signups_count DESC, r.created_at DESC
        LIMIT 200
      `,
      sql`
        SELECT
          rc.id, rc.applied_reward_mode, rc.commission_pct_applied, rc.commission_amount_kobo,
          rc.bonus_days_granted_referrer, rc.bonus_days_granted_referee, rc.status, rc.created_at,
          r.referral_code,
          ru.email AS referrer_email, ru.full_name AS referrer_name,
          rs.school_name AS referred_school_name,
          sp.paystack_reference, sp.amount_minor, sp.currency
        FROM referral_conversions rc
        JOIN referrals r ON r.id = rc.referral_id
        JOIN users_hq ru ON ru.id = rc.referrer_user_id
        JOIN schools rs ON rs.id = rc.referred_school_id
        JOIN subscriptions_payments sp ON sp.id = rc.payment_id
        ORDER BY rc.created_at DESC
        LIMIT 100
      `,
      sql`
        SELECT
          pr.*, u.full_name, u.email, s.school_name
        FROM payout_requests pr
        JOIN users_hq u ON u.id = pr.user_id
        LEFT JOIN schools s ON s.owner_user_id = u.id
        ORDER BY CASE WHEN pr.status = 'pending' THEN 0 ELSE 1 END, pr.created_at DESC
        LIMIT 100
      `,
    ]);

    return NextResponse.json({
      ok: true,
      summary: {
        total_codes: referrers.length,
        total_conversions: conversions.filter((c: Record<string, any>) => c.status === "credited").length,
        total_commissions_kobo: conversions
          .filter((c: Record<string, any>) => c.status === "credited")
          .reduce((a: number, c: Record<string, any>) => a + Number(c.commission_amount_kobo || 0), 0),
        pending_payouts: payouts.filter((p: Record<string, any>) => p.status === "pending").length,
      },
      referrers,
      conversions,
      payouts,
    });
  } catch (err) {
    console.error("HQ referrals GET error:", err);
    return NextResponse.json({ ok: false, error: "hq_referrals_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const action = String(body?.action || "").trim();
    const sql = getSql();
    const ip = getClientIp(req);

    if (action === "update_referral") {
      const id = String(body?.id || "").trim();
      const rewardMode = ["cash_commission", "bonus_days", "dual"].includes(String(body?.reward_mode || ""))
        ? String(body?.reward_mode)
        : "dual";
      const pct =
        body?.custom_commission_pct === "" || body?.custom_commission_pct === null || body?.custom_commission_pct === undefined
          ? null
          : Math.min(60, Math.max(0, Number(body.custom_commission_pct)));
      const days =
        body?.custom_bonus_days === "" || body?.custom_bonus_days === null || body?.custom_bonus_days === undefined
          ? null
          : Math.min(365, Math.max(0, Math.floor(Number(body.custom_bonus_days))));
      const isActive = body?.is_active !== false;

      await sql`
        UPDATE referrals
        SET reward_mode = ${rewardMode},
            custom_commission_pct = ${pct},
            custom_bonus_days = ${days},
            is_active = ${isActive}
        WHERE id = ${id}::uuid
      `;
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_update_referral",
        targetType: "referral",
        targetId: id,
        ipAddress: ip,
        details: { rewardMode, pct, days, isActive },
      });
      return NextResponse.json({ ok: true, message: "Referral terms updated." });
    }

    if (action === "settle_payout" || action === "reject_payout") {
      const payoutId = String(body?.payout_id || "").trim();
      const reason = String(body?.reason || "").trim().slice(0, 240);
      const rows = await sql`SELECT * FROM payout_requests WHERE id = ${payoutId}::uuid LIMIT 1`;
      if (!rows.length) return NextResponse.json({ ok: false, message: "Payout request not found." }, { status: 404 });
      const pr = rows[0] as Record<string, any>;
      if (pr.status !== "pending" && pr.status !== "approved") {
        return NextResponse.json({ ok: false, message: `Payout is already ${pr.status}.` }, { status: 400 });
      }

      if (action === "settle_payout") {
        await sql`
          UPDATE payout_requests
          SET status = 'paid', reviewed_by = ${hq.user.id}::uuid, reviewed_at = NOW()
          WHERE id = ${payoutId}::uuid
        `;
        await logDeveloperAudit({
          actorUserId: hq.user.id,
          actorEmail: hq.user.email,
          action: "hq_settle_payout",
          targetType: "payout_request",
          targetId: payoutId,
          ipAddress: ip,
          details: { amount_minor: Number(pr.amount_minor) },
        });
        return NextResponse.json({ ok: true, message: "Payout marked as paid." });
      } else {
        await sql`
          UPDATE payout_requests
          SET status = 'rejected', rejection_reason = ${reason || "Rejected by HQ"}, reviewed_by = ${hq.user.id}::uuid, reviewed_at = NOW()
          WHERE id = ${payoutId}::uuid
        `;
        // Release held funds back into wallet
        const balRows = await sql`
          SELECT COALESCE(balance_after_minor, 0)::bigint AS bal
          FROM wallet_ledger WHERE user_id = ${pr.user_id}::uuid ORDER BY created_at DESC LIMIT 1
        `;
        const prevBal = Number(balRows[0]?.bal || 0);
        const amt = Number(pr.amount_minor || 0);
        await sql`
          INSERT INTO wallet_ledger (
            user_id, payout_request_id, entry_type, currency, amount_minor, balance_after_minor, idempotency_key, notes
          ) VALUES (
            ${pr.user_id}::uuid, ${payoutId}::uuid, 'payout_release', ${String(pr.currency || "NGN").trim()},
            ${amt}, ${prevBal + amt}, ${`payout_release:${payoutId}`},
            ${`Payout rejected & released: ${reason || "HQ review"}`}
          )
          ON CONFLICT (idempotency_key) DO NOTHING
        `;
        return NextResponse.json({ ok: true, message: "Payout rejected and balance returned to referrer's wallet." });
      }
    }

    return NextResponse.json({ ok: false, message: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("HQ referrals POST error:", err);
    return NextResponse.json({ ok: false, message: "Referral action failed." }, { status: 500 });
  }
}
