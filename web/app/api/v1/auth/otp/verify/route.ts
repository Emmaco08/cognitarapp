import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  attachSessionCookie,
  createCloudSession,
  isValidEmail,
  normalizeEmail,
} from "@/lib/auth";
import { verifyStoredEmailOtp } from "@/lib/brevo";
import { decryptSecret } from "@/lib/crypto";
import { getPlatformSettings, logDeveloperAudit, toPublicPlatformDirectives } from "@/lib/platform";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  checkDbLockout,
  clearDbAuthLockout,
  recordDbAuthFailure,
  verifyPreAuthChallenge,
} from "@/lib/security";
import { consumeRecoveryCode, verifyTotpCode } from "@/lib/totp";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`otp-verify-ip:${ip}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many verification attempts. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "invalid_json", message: "Invalid JSON body." }, { status: 400 });
    }

    const challengeToken = String(body.challenge_token || "").trim();
    const challenge = verifyPreAuthChallenge(challengeToken);
    if (!challenge) {
      return NextResponse.json(
        {
          ok: false,
          error: "challenge_expired",
          message: "Your verification session expired. Please sign in with your password again.",
        },
        { status: 401 }
      );
    }

    const email = normalizeEmail(String(body.email || challenge.email));
    if (!isValidEmail(email) || email !== challenge.email) {
      return NextResponse.json(
        { ok: false, error: "challenge_mismatch", message: "Verification token does not match this account." },
        { status: 403 }
      );
    }

    const lockKey = `otp-verify:${ip}:${email}`;
    const lock = await checkDbLockout(lockKey);
    if (lock.locked) {
      return NextResponse.json(
        {
          ok: false,
          error: "verification_locked",
          retry_after_sec: lock.retryAfterSec,
          message: `Too many invalid codes. Try again in ${Math.max(1, Math.ceil(lock.retryAfterSec / 60))} minute(s).`,
        },
        { status: 429 }
      );
    }

    const code = String(body.code || "").trim();
    const method = String(body.method || "email_otp").trim().toLowerCase();

    const sql = getSql();
    const users = await sql`
      SELECT id, email, full_name, phone, role, status, email_verified,
             totp_enabled, totp_secret_enc, totp_recovery_hashes_json, created_at
      FROM users_hq
      WHERE id = ${challenge.uid}::uuid AND email = ${email}
      LIMIT 1
    `;
    if (!users.length || users[0].status !== "active") {
      return NextResponse.json(
        { ok: false, error: "account_suspended", message: "This CogniTara account is not active." },
        { status: 403 }
      );
    }
    const user = users[0] as Record<string, any>;
    const isHqAdmin = user.role === "hq_super_admin" || user.role === "hq_admin";

    // Verify 2nd factor according to method (TOTP, recovery code, or Brevo email OTP)
    if (method === "totp") {
      if (!user.totp_enabled || !user.totp_secret_enc) {
        return NextResponse.json(
          { ok: false, error: "totp_not_enabled", message: "Authenticator app 2FA is not enabled on this account." },
          { status: 400 }
        );
      }
      const secret = decryptSecret(user.totp_secret_enc);
      if (!verifyTotpCode(secret, code)) {
        await recordDbAuthFailure(lockKey);
        if (isHqAdmin) {
          await logDeveloperAudit({ actorUserId: user.id, actorEmail: user.email, action: "hq_2fa_failed", ipAddress: ip, details: { method: "totp" } });
        }
        return NextResponse.json(
          { ok: false, error: "invalid_totp", message: "Incorrect 6-digit authenticator code. Check your device clock and try again." },
          { status: 400 }
        );
      }
    } else if (method === "recovery_code") {
      const hashes: string[] = Array.isArray(user.totp_recovery_hashes_json) ? user.totp_recovery_hashes_json : [];
      const remaining = consumeRecoveryCode(code, hashes);
      if (!remaining) {
        await recordDbAuthFailure(lockKey);
        if (isHqAdmin) {
          await logDeveloperAudit({ actorUserId: user.id, actorEmail: user.email, action: "hq_2fa_failed", ipAddress: ip, details: { method: "recovery_code" } });
        }
        return NextResponse.json(
          { ok: false, error: "invalid_recovery_code", message: "Invalid or already-used recovery code." },
          { status: 400 }
        );
      }
      await sql`
        UPDATE users_hq SET totp_recovery_hashes_json = ${JSON.stringify(remaining)}::jsonb, updated_at = NOW()
        WHERE id = ${user.id}::uuid
      `;
    } else {
      const verification = await verifyStoredEmailOtp({ email, code, purpose: challenge.purpose });
      if (!verification.ok || verification.userId !== String(user.id)) {
        await recordDbAuthFailure(lockKey);
        if (isHqAdmin) {
          await logDeveloperAudit({ actorUserId: user.id, actorEmail: user.email, action: "hq_2fa_failed", ipAddress: ip, details: { method: "email_otp" } });
        }
        return NextResponse.json(
          { ok: false, error: verification.error || "otp_invalid", message: verification.message || "Invalid verification code." },
          { status: 400 }
        );
      }
    }

    await clearDbAuthLockout(lockKey);

    const schools = await sql`
      SELECT id, school_name, country_code, state_region, contact_email, contact_phone, status,
             ban_reason, custom_notice, custom_notice_level, feature_overrides_json, last_cloud_backup_at, created_at
      FROM schools
      WHERE owner_user_id = ${user.id}::uuid
      ORDER BY created_at ASC
      LIMIT 1
    `;
    const school = (schools[0] as Record<string, any>) || null;

    if (school && school.status === "banned") {
      return NextResponse.json(
        {
          ok: false,
          error: "school_banned",
          message: school.ban_reason
            ? `School account disabled by CogniTara HQ: ${school.ban_reason}`
            : "This school account has been disabled by CogniTara HQ.",
        },
        { status: 403 }
      );
    }

    const meta = (challenge.meta || {}) as Record<string, any>;
    const clientType = body.client_type === "desktop" || meta.client_type === "desktop" ? "desktop" : "web";
    const displayHwid = body.display_hwid
      ? String(body.display_hwid).trim().slice(0, 64)
      : meta.display_hwid
      ? String(meta.display_hwid)
      : null;
    const deviceLabel = body.device_label
      ? String(body.device_label).trim().slice(0, 120)
      : meta.device_label
      ? String(meta.device_label)
      : null;
    const appVersion = body.app_version
      ? String(body.app_version).trim().slice(0, 32)
      : meta.app_version
      ? String(meta.app_version)
      : null;

    if (school) {
      await sql`
        UPDATE schools
        SET last_seen_at = NOW(),
            last_hwid = COALESCE(${displayHwid}, last_hwid),
            last_app_version = COALESCE(${appVersion}, last_app_version)
        WHERE id = ${school.id}::uuid
      `;
    }

    const referrals = await sql`
      SELECT referral_code FROM referrals
      WHERE owner_user_id = ${user.id}::uuid AND is_active = TRUE
      ORDER BY created_at ASC LIMIT 1
    `;
    const referralCode = (referrals[0] as Record<string, any>)?.referral_code || null;

    const licenses = school
      ? await sql`
          SELECT l.id, l.license_key, l.plan_tier, l.status, l.issued_at, l.expires_at,
                 l.bonus_days_total, l.lease_seconds, l.signed_lease_json, l.revocation_tombstone_json,
                 p.display_name AS plan_name, p.slug AS plan_slug
          FROM licenses l
          LEFT JOIN plans p ON p.id = l.plan_id
          WHERE l.school_id = ${school.id}::uuid
          ORDER BY l.created_at DESC
          LIMIT 10
        `
      : [];

    const { rawToken, expiresAt, maxAgeSeconds } = await createCloudSession({
      userId: user.id,
      schoolId: school ? school.id : null,
      clientType,
      deviceLabel,
      displayHwid,
      isHqAdmin,
    });

    if (isHqAdmin) {
      await logDeveloperAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        action: "hq_signin_2fa_success",
        ipAddress: ip,
        details: { client_type: clientType, method },
      });
    }

    const settings = await getPlatformSettings();
    const directives = {
      ...toPublicPlatformDirectives(settings),
      school_status: school?.status || "active",
      school_ban_reason: school?.ban_reason || null,
      school_notice: school?.custom_notice || "",
      school_notice_level: school?.custom_notice_level || "info",
      feature_overrides: school?.feature_overrides_json || {},
      last_cloud_backup_at: school?.last_cloud_backup_at ? new Date(school.last_cloud_backup_at).toISOString() : null,
    };

    const res = NextResponse.json({
      ok: true,
      verified: true,
      token: rawToken,
      expires_at: expiresAt,
      server_utc: Math.floor(Date.now() / 1000),
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone || "",
        role: user.role,
        status: user.status,
        email_verified: true,
        totp_enabled: Boolean(user.totp_enabled),
      },
      school: school
        ? {
            id: school.id,
            school_name: school.school_name,
            country_code: String(school.country_code || "NG").trim(),
            state_region: school.state_region || "",
            contact_email: school.contact_email,
            contact_phone: school.contact_phone || "",
            status: school.status,
            last_cloud_backup_at: school.last_cloud_backup_at ? new Date(school.last_cloud_backup_at).toISOString() : null,
          }
        : null,
      referral_code: referralCode,
      licenses,
      directives,
    });
    attachSessionCookie(res, rawToken, maxAgeSeconds);
    return res;
  } catch (err) {
    console.error("OTP verify error:", err);
    return NextResponse.json({ ok: false, error: "otp_verify_failed", message: "Could not verify code right now." }, { status: 500 });
  }
}
