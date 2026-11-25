import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isValidEmail, normalizeEmail } from "@/lib/auth";
import { createAndSendEmailOtp, OtpPurpose } from "@/lib/brevo";
import { getPlatformSettings } from "@/lib/platform";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`otp-send-ip:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many OTP requests. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const email = normalizeEmail(String(body?.email || ""));
    const rawPurpose = String(body?.purpose || "signup_verify");
    const purpose: OtpPurpose =
      rawPurpose === "signin_otp" || rawPurpose === "password_reset" ? rawPurpose : "signup_verify";

    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "invalid_email", message: "Enter a valid email address." }, { status: 400 });
    }

    const settings = await getPlatformSettings();
    if (!settings.brevo_configured) {
      return NextResponse.json(
        { ok: false, error: "brevo_not_configured", message: "Email OTP is not configured on CogniTara Cloud yet." },
        { status: 503 }
      );
    }

    const sql = getSql();
    const users = await sql`
      SELECT u.id, u.email, u.full_name, u.status, s.school_name
      FROM users_hq u
      LEFT JOIN schools s ON s.owner_user_id = u.id
      WHERE u.email = ${email}
      ORDER BY s.created_at ASC
      LIMIT 1
    `;

    // Generic response if account doesn't exist to avoid email enumeration
    if (!users.length || users[0].status !== "active") {
      return NextResponse.json({
        ok: true,
        otp_sent: true,
        expires_in_seconds: 600,
        message: "If an active account matches this email, a fresh 6-digit code has been sent.",
      });
    }

    const u = users[0] as Record<string, any>;
    const sent = await createAndSendEmailOtp({
      settings,
      userId: String(u.id),
      email,
      fullName: u.full_name || "",
      schoolName: u.school_name || "",
      purpose,
    });

    if (!sent.ok) {
      return NextResponse.json(
        { ok: false, error: sent.error, retry_after_sec: sent.retry_after_sec, message: sent.message },
        { status: sent.error === "otp_cooldown" ? 429 : 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      otp_sent: true,
      email,
      purpose,
      expires_in_seconds: sent.expires_in_seconds || 600,
      message: "A fresh 6-digit verification code has been sent to your email.",
    });
  } catch (err) {
    console.error("OTP send error:", err);
    return NextResponse.json({ ok: false, error: "otp_send_failed", message: "Could not send verification code." }, { status: 500 });
  }
}
