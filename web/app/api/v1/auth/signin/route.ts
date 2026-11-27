import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  attachSessionCookie,
  createCloudSession,
  isValidEmail,
  normalizeEmail,
  verifyPassword,
} from "@/lib/auth";
import { getPlatformSettings, logDeveloperAudit, toPublicPlatformDirectives } from "@/lib/platform";
import { syncEnvSuperAdminIfConfigured } from "@/lib/hq-bootstrap";
import { createAndSendEmailOtp } from "@/lib/brevo";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  checkDbLockout,
  clearDbAuthLockout,
  issuePreAuthChallenge,
  recordDbAuthFailure,
} from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const ipRl = checkRateLimit(`signin-ip:${ip}`, 30, 60_000);
    if (!ipRl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many sign-in attempts. Retry in ${ipRl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "invalid_json", message: "Invalid JSON body." }, { status: 400 });
    }

    const email = normalizeEmail(String(body.email || ""));
    const password = String(body.password || "");
    const clientType = body.client_type === "desktop" ? "desktop" : "web";
    const displayHwid = body.display_hwid ? String(body.display_hwid).trim().slice(0, 64) : null;
    const deviceLabel = body.device_label ? String(body.device_label).trim().slice(0, 120) : null;
    const appVersion = body.app_version ? String(body.app_version).trim().slice(0, 32) : null;

    if (!isValidEmail(email) || !password) {
      return NextResponse.json(
        { ok: false, error: "invalid_credentials", message: "Enter your email address and password." },
        { status: 400 }
      );
    }

    const lockKey = `signin:${ip}:${email}`;
    const lock = await checkDbLockout(lockKey);
    if (lock.locked) {
      const mins = Math.max(1, Math.ceil(lock.retryAfterSec / 60));
      return NextResponse.json(
        {
          ok: false,
          error: "account_locked",
          retry_after_sec: lock.retryAfterSec,
          message: `Too many failed sign-in attempts. Locked for ${mins} minute${mins === 1 ? "" : "s"}.`,
        },
        { status: 429 }
      );
    }

    await syncEnvSuperAdminIfConfigured();

    const sql = getSql();
    const users = await sql`
      SELECT id, email, password_hash, full_name, phone, role, status, email_verified, totp_enabled, created_at
      FROM users_hq
      WHERE email = ${email}
      LIMIT 1
    `;

    if (!users.length) {
      await recordDbAuthFailure(lockKey);
      return NextResponse.json(
        { ok: false, error: "invalid_credentials", message: "Invalid email address or password." },
        { status: 401 }
      );
    }

    const user = users[0] as Record<string, any>;
    const isHqAdmin = user.role === "hq_super_admin" || user.role === "hq_admin";

    if (!verifyPassword(password, String(user.password_hash || ""))) {
      const fail = await recordDbAuthFailure(lockKey);
      if (isHqAdmin) {
        await logDeveloperAudit({
          actorEmail: email,
          action: "hq_signin_failed",
          ipAddress: ip,
          details: { client_type: clientType, attempts: fail.attempts, locked_sec: fail.lockedSeconds },
        });
      }
      return NextResponse.json(
        { ok: false, error: "invalid_credentials", message: "Invalid email address or password." },
        { status: 401 }
      );
    }

    if (user.status !== "active") {
      return NextResponse.json(
        { ok: false, error: "account_suspended", message: "This CogniTara account is currently suspended or banned. Contact support." },
        { status: 403 }
      );
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

    const settings = await getPlatformSettings();
    const clientMeta = {
      client_type: clientType,
      display_hwid: displayHwid,
      device_label: deviceLabel,
      app_version: appVersion,
    };

    // Mandatory 2FA for HQ Admins when require_hq_2fa is enabled (and either TOTP or Brevo Email OTP is available)
    const hq2faRequired = isHqAdmin && settings.require_hq_2fa && (Boolean(user.totp_enabled) || settings.brevo_configured);
    const schoolOtpRequired = !isHqAdmin && settings.require_email_otp && settings.brevo_configured;

    if (hq2faRequired) {
      const methods: string[] = [];
      if (user.totp_enabled) methods.push("totp", "recovery_code");
      if (settings.brevo_configured) methods.push("email_otp");

      // Automatically send Brevo Email 2FA code if TOTP isn't set up (or always offer fallback)
      let emailSent = false;
      if (!user.totp_enabled && settings.brevo_configured) {
        const otpRes = await createAndSendEmailOtp({
          settings,
          userId: String(user.id),
          email,
          fullName: user.full_name || "",
          schoolName: "CogniTara HQ",
          purpose: "hq_2fa",
          ipAddress: ip,
          clientMeta,
          bypassCooldown: true,
        });
        if (!otpRes.ok) {
          return NextResponse.json(
            { ok: false, error: otpRes.error || "brevo_delivery_failed", message: otpRes.message || "Could not send HQ security code." },
            { status: 502 }
          );
        }
        emailSent = true;
      }

      const challengeToken = issuePreAuthChallenge({
        userId: String(user.id),
        email,
        role: String(user.role),
        purpose: "hq_2fa",
        meta: clientMeta,
        ttlSeconds: 600,
      });

      return NextResponse.json({
        ok: true,
        otp_required: true,
        two_factor_required: true,
        is_hq_admin: true,
        purpose: "hq_2fa",
        email,
        methods,
        preferred_method: user.totp_enabled ? "totp" : "email_otp",
        email_otp_sent: emailSent,
        challenge_token: challengeToken,
        expires_in_seconds: 600,
        message: user.totp_enabled
          ? "Enter the 6-digit code from your authenticator app (or request an email code)."
          : `We sent a 6-digit HQ security code to ${email}. Enter it to open the console.`,
      });
    }

    if (schoolOtpRequired) {
      const purpose = user.email_verified ? "signin_otp" : "signup_verify";
      const otpRes = await createAndSendEmailOtp({
        settings,
        userId: String(user.id),
        email,
        fullName: user.full_name || "",
        schoolName: school?.school_name || "",
        purpose,
        ipAddress: ip,
        clientMeta,
        bypassCooldown: true,
      });

      if (!otpRes.ok) {
        return NextResponse.json(
          { ok: false, error: otpRes.error || "brevo_delivery_failed", message: otpRes.message || "Could not send verification code." },
          { status: 502 }
        );
      }

      const challengeToken = issuePreAuthChallenge({
        userId: String(user.id),
        email,
        role: String(user.role),
        purpose,
        meta: clientMeta,
        ttlSeconds: 600,
      });

      return NextResponse.json({
        ok: true,
        otp_required: true,
        purpose,
        email,
        challenge_token: challengeToken,
        expires_in_seconds: otpRes.expires_in_seconds || 600,
        message: `We sent a 6-digit security code to ${email}. Enter it to finish signing in.`,
      });
    }

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
        action: "hq_signin_success",
        ipAddress: ip,
        details: { client_type: clientType, method: "password" },
      });
    }

    const directives = {
      ...toPublicPlatformDirectives(settings),
      school_status: school?.status || "active",
      school_ban_reason: school?.ban_reason || null,
      school_notice: school?.custom_notice || "",
      school_notice_level: school?.custom_notice_level || "info",
      feature_overrides: school?.feature_overrides_json || {},
      last_cloud_backup_at: school?.last_cloud_backup_at ? new Date(school.last_cloud_backup_at).toISOString() : null,
    };

    const payload = {
      ok: true,
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
        email_verified: Boolean(user.email_verified),
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
    };

    const res = NextResponse.json(payload, { status: 200 });
    attachSessionCookie(res, rawToken, maxAgeSeconds);
    return res;
  } catch (err) {
    console.error("Sign-in error:", err);
    return NextResponse.json(
      { ok: false, error: "signin_failed", message: "Could not sign in right now. Please try again." },
      { status: 500 }
    );
  }
}
