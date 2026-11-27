import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isValidEmail, normalizeEmail } from "@/lib/auth";
import { ensureSchoolCode } from "@/lib/portal-auth";
import { getPlatformSettings } from "@/lib/platform";
import { sendSchoolIdRecoveryEmail } from "@/lib/brevo";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Super Admin School ID lookup endpoint.
 * If the provided email matches an active school super admin account (users_hq owner),
 * emails their School ID (CT-XXXXX) to that inbox cleanly.
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const ipRl = checkRateLimit(`portal-recover-ip:${ip}`, 6, 60_000);
    if (!ipRl.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "rate_limited",
          message: `Too many requests. Try again in ${ipRl.retryAfterSec}s.`,
        },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const email = normalizeEmail(String(body?.email || ""));
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "invalid_email", message: "Enter a valid super admin email address." },
        { status: 400 }
      );
    }

    const emailRl = checkRateLimit(`portal-recover-email:${email}`, 2, 120_000);
    if (!emailRl.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "cooldown",
          message: `A School ID email was just sent. Check your inbox or retry in ${emailRl.retryAfterSec}s.`,
        },
        { status: 429 }
      );
    }

    const sql = getSql();
    const rows = await sql`
      SELECT s.id AS school_id, s.school_code, s.school_name,
             u.email AS owner_email, u.full_name AS owner_name
      FROM users_hq u
      JOIN schools s ON s.owner_user_id = u.id
      WHERE LOWER(u.email) = LOWER(${email})
        AND u.status = 'active'
        AND s.status = 'active'
      ORDER BY s.created_at ASC
      LIMIT 1
    `;

    // Anti-enumeration: never confirm whether an arbitrary email exists unless delivery itself fails
    if (!rows.length) {
      return NextResponse.json({
        ok: true,
        message: "If that email matches a registered school super admin account, your School ID has been sent.",
      });
    }

    const rec = rows[0] as Record<string, any>;
    const schoolCode = await ensureSchoolCode(String(rec.school_id));
    const settings = await getPlatformSettings();

    const sendRes = await sendSchoolIdRecoveryEmail({
      settings,
      toEmail: String(rec.owner_email),
      fullName: String(rec.owner_name || ""),
      schoolName: String(rec.school_name || "Your School"),
      schoolCode,
    });

    if (!sendRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "email_failed",
          message: "Could not deliver the School ID email right now. Try again shortly or check CogniTara Studio Desktop.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "If that email matches a registered school super admin account, your School ID has been sent.",
    });
  } catch (err) {
    console.error("Recover School ID error:", err);
    return NextResponse.json(
      { ok: false, message: "Could not process your request right now. Please try again." },
      { status: 500 }
    );
  }
}
