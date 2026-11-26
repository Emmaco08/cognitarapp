import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { hashPassword, isValidEmail, normalizeEmail } from "@/lib/auth";
import { verifyStoredEmailOtp } from "@/lib/brevo";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { checkDbLockout, clearDbAuthLockout, recordDbAuthFailure } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`pwreset-confirm:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many attempts. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const email = normalizeEmail(String(body?.email || ""));
    const code = String(body?.code || "").trim();
    const newPassword = String(body?.new_password || "");

    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, message: "Enter a valid email address." }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ ok: false, message: "New password must be at least 8 characters long." }, { status: 400 });
    }

    const lockKey = `pwreset:${ip}:${email}`;
    const lock = await checkDbLockout(lockKey);
    if (lock.locked) {
      return NextResponse.json(
        { ok: false, message: `Too many failed reset attempts. Retry in ${Math.max(1, Math.ceil(lock.retryAfterSec / 60))} minute(s).` },
        { status: 429 }
      );
    }

    const verifyRes = await verifyStoredEmailOtp({ email, code, purpose: "password_reset" });
    if (!verifyRes.ok || !verifyRes.userId) {
      await recordDbAuthFailure(lockKey);
      return NextResponse.json(
        { ok: false, error: verifyRes.error || "invalid_code", message: verifyRes.message || "Invalid reset code." },
        { status: 400 }
      );
    }

    await clearDbAuthLockout(lockKey);

    const sql = getSql();
    const newHash = hashPassword(newPassword);
    await sql`
      UPDATE users_hq
      SET password_hash = ${newHash}, updated_at = NOW()
      WHERE id = ${verifyRes.userId}::uuid AND role IN ('school_owner', 'hq_admin', 'hq_super_admin')
    `;
    await sql`
      UPDATE cloud_sessions
      SET revoked_at = NOW()
      WHERE user_id = ${verifyRes.userId}::uuid AND revoked_at IS NULL
    `;

    return NextResponse.json({
      ok: true,
      message: "Your password has been updated. You can now sign in with your new password.",
    });
  } catch (err) {
    console.error("Password reset confirm error:", err);
    return NextResponse.json({ ok: false, message: "Could not reset password right now." }, { status: 500 });
  }
}
