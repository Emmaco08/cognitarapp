import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isValidEmail, normalizeEmail } from "@/lib/auth";
import { createAndSendEmailOtp } from "@/lib/brevo";
import { getPlatformSettings } from "@/lib/platform";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`pwreset-req:${ip}`, 6, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many requests. Try again in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const email = normalizeEmail(String(body?.email || ""));
    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "invalid_email", message: "Enter a valid email address." }, { status: 400 });
    }

    const settings = await getPlatformSettings();
    if (!settings.brevo_configured) {
      return NextResponse.json(
        { ok: false, error: "email_unavailable", message: "Password reset emails are temporarily unavailable. Contact CogniTara support." },
        { status: 503 }
      );
    }

    const sql = getSql();
    const users = await sql`
      SELECT id, email, full_name, status, role FROM users_hq WHERE email = ${email} LIMIT 1
    `;

    // Generic response to prevent email enumeration
    if (users.length && users[0].status === "active" && users[0].role === "school_owner") {
      const u = users[0] as Record<string, any>;
      await createAndSendEmailOtp({
        settings,
        userId: String(u.id),
        email,
        fullName: u.full_name || "",
        purpose: "password_reset",
        ipAddress: ip,
      });
    }

    return NextResponse.json({
      ok: true,
      message: "If an account matches that email, a 6-digit reset code has been sent.",
    });
  } catch (err) {
    console.error("Password reset request error:", err);
    return NextResponse.json({ ok: false, message: "Could not start password reset right now." }, { status: 500 });
  }
}
