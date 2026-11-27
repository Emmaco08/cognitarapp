import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const rawCode = String(req.nextUrl.searchParams.get("code") || "").trim().toUpperCase();
    if (!rawCode || rawCode.length < 4) {
      return NextResponse.json({ ok: false, valid: false, message: "Enter a valid referral code." });
    }
    const sql = getSql();
    const rows = await sql`
      SELECT r.referral_code, r.reward_mode, r.custom_bonus_days, s.school_name
      FROM referrals r
      LEFT JOIN schools s ON s.id = r.school_id
      WHERE UPPER(r.referral_code) = ${rawCode} AND r.is_active = TRUE
      LIMIT 1
    `;
    if (!rows.length) {
      return NextResponse.json({ ok: true, valid: false, message: "Referral code not found." });
    }
    const rec = rows[0] as Record<string, any>;
    const bonusDays = Math.max(7, Math.floor(Number(rec.custom_bonus_days ?? 14) / 2));
    return NextResponse.json({
      ok: true,
      valid: true,
      referral_code: rec.referral_code,
      referred_by: rec.school_name || "CogniTara Partner",
      bonus_days: bonusDays,
      message: `Referred by ${rec.school_name || "CogniTara Partner"}. You get +${bonusDays} free bonus days on your first paid plan.`,
    });
  } catch (err) {
    console.error("Referral validate error:", err);
    return NextResponse.json({ ok: false, valid: false }, { status: 500 });
  }
}
