import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isValidEmail, normalizeEmail } from "@/lib/auth";
import { createAndSendEmailOtp, OtpPurpose } from "@/lib/brevo";
import { getPlatformSettings } from "@/lib/platform";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyPreAuthChallenge } from "@/lib/security";

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
    const challengeToken = String(body?.challenge_token || "").trim();
    const challenge = verifyPreAuthChallenge(challengeToken);

    if (!challenge) {
      return NextResponse.json(
        {
          ok: false,
          error: "challenge_required",
          message: "Your sign-in session expired. Enter your email and password again to request a fresh code.",
        },
        { status: 401 }
      );
    }

    const email = normalizeEmail(String(body?.email || challenge.email));
    if (!isValidEmail(email) || email !== challenge.email) {
      return NextResponse.json(
        { ok: false, error: "challenge_mismatch", message: "Verification session does not match this email." },
        { status: 403 }
      );
    }

    const purpose: OtpPurpose = challenge.purpose;

    const settings = await getPlatformSettings();
    if (!settings.brevo_configured) {
      return NextResponse.json(
        { ok: false, error: "brevo_not_configured", message: "Email verification is not configured on CogniTara right now." },
        { status: 503 }
      );
    }

    const sql = getSql();
    const users = await sql`
      SELECT u.id, u.email, u.full_name, u.status, s.school_name
      FROM users_hq u
      LEFT JOIN schools s ON s.owner_user_id = u.id
      WHERE u.id = ${challenge.uid}::uuid AND u.email = ${email}
      ORDER BY s.created_at ASC
      LIMIT 1
    `;

    if (!users.length || users[0].status !== "active") {
      return NextResponse.json(
        { ok: false, error: "account_unavailable", message: "Account is no longer active." },
        { status: 403 }
      );
    }

    const u = users[0] as Record<string, any>;
    const sent = await createAndSendEmailOtp({
      settings,
      userId: String(u.id),
      email,
      fullName: u.full_name || "",
      schoolName: purpose === "hq_2fa" ? "CogniTara HQ" : u.school_name || "",
      purpose,
      ipAddress: ip,
      clientMeta: challenge.meta || {},
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
      message: "A fresh 6-digit security code has been sent to your email.",
    });
  } catch (err) {
    console.error("OTP send error:", err);
    return NextResponse.json({ ok: false, error: "otp_send_failed", message: "Could not send verification code." }, { status: 500 });
  }
}
