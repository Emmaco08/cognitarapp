import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  attachSessionCookie,
  createCloudSession,
  generateReferralCode,
  hashPassword,
  isValidEmail,
  normalizeEmail,
} from "@/lib/auth";
import { getPlatformSettings, toPublicPlatformDirectives } from "@/lib/platform";
import { createAndSendEmailOtp } from "@/lib/brevo";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`signup-ip:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many signup requests. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const settings = await getPlatformSettings();
    if (!settings.allow_self_signup) {
      return NextResponse.json(
        { ok: false, error: "signup_disabled", message: "New school registrations are temporarily paused by CogniTara HQ." },
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "invalid_json", message: "Invalid JSON body." }, { status: 400 });
    }

    const fullName = String(body.full_name || "").trim().slice(0, 120);
    const schoolName = String(body.school_name || "").trim().slice(0, 160);
    const email = normalizeEmail(String(body.email || ""));
    const password = String(body.password || "");
    const phone = String(body.phone || "").trim().slice(0, 40);
    const countryCode = String(body.country_code || "NG").trim().toUpperCase().slice(0, 2) || "NG";
    const stateRegion = String(body.state_region || "").trim().slice(0, 80);
    const referralCodeUsed = String(body.referral_code || "").trim().toUpperCase().slice(0, 32) || null;
    const clientType = body.client_type === "desktop" ? "desktop" : "web";
    const displayHwid = body.display_hwid ? String(body.display_hwid).trim().slice(0, 64) : null;
    const deviceLabel = body.device_label ? String(body.device_label).trim().slice(0, 120) : null;
    const appVersion = body.app_version ? String(body.app_version).trim().slice(0, 32) : null;

    if (fullName.length < 2) {
      return NextResponse.json({ ok: false, error: "invalid_full_name", message: "Please enter your full name." }, { status: 400 });
    }
    if (schoolName.length < 2) {
      return NextResponse.json({ ok: false, error: "invalid_school_name", message: "Please enter your school name." }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "invalid_email", message: "Please enter a valid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ ok: false, error: "weak_password", message: "Password must be at least 8 characters long." }, { status: 400 });
    }

    const sql = getSql();
    const existing = await sql`SELECT id, email_verified FROM users_hq WHERE email = ${email} LIMIT 1`;
    if (existing.length > 0) {
      return NextResponse.json(
        { ok: false, error: "email_exists", message: "An account with this email already exists. Sign in instead." },
        { status: 409 }
      );
    }

    const otpActive = Boolean(settings.require_email_otp && settings.brevo_configured);
    const passwordHash = hashPassword(password);
    const createdUsers = await sql`
      INSERT INTO users_hq (email, password_hash, full_name, phone, role, status, email_verified)
      VALUES (${email}, ${passwordHash}, ${fullName}, ${phone || null}, 'school_owner', 'active', ${!otpActive})
      RETURNING id, email, full_name, phone, role, status, email_verified, created_at
    `;
    const user = createdUsers[0] as Record<string, any>;

    const createdSchools = await sql`
      INSERT INTO schools (
        owner_user_id, school_name, country_code, state_region, contact_email, contact_phone,
        referral_code_used, status, last_seen_at, last_hwid, last_app_version
      )
      VALUES (
        ${user.id}::uuid,
        ${schoolName},
        ${countryCode},
        ${stateRegion || null},
        ${email},
        ${phone || null},
        ${referralCodeUsed},
        'active',
        NOW(),
        ${displayHwid},
        ${appVersion}
      )
      RETURNING id, school_name, country_code, state_region, contact_email, contact_phone, status, created_at
    `;
    const school = createdSchools[0] as Record<string, any>;

    const myReferralCode = generateReferralCode(schoolName);
    await sql`
      INSERT INTO referrals (owner_user_id, school_id, referral_code, reward_mode, is_active)
      VALUES (${user.id}::uuid, ${school.id}::uuid, ${myReferralCode}, 'dual', TRUE)
      ON CONFLICT (referral_code) DO NOTHING
    `;

    if (otpActive) {
      const otpRes = await createAndSendEmailOtp({
        settings,
        userId: String(user.id),
        email,
        fullName,
        schoolName,
        purpose: "signup_verify",
        clientMeta: {
          client_type: clientType,
          display_hwid: displayHwid,
          device_label: deviceLabel,
          app_version: appVersion,
        },
        bypassCooldown: true,
      });

      if (!otpRes.ok) {
        // Roll back brand-new unverified user so they aren't blocked by email_exists on retry
        await sql`DELETE FROM users_hq WHERE id = ${user.id}::uuid`;
        return NextResponse.json(
          { ok: false, error: otpRes.error || "brevo_delivery_failed", message: otpRes.message || "Could not send verification email." },
          { status: 502 }
        );
      }

      return NextResponse.json(
        {
          ok: true,
          otp_required: true,
          purpose: "signup_verify",
          email,
          expires_in_seconds: otpRes.expires_in_seconds || 600,
          message: `We sent a 6-digit verification code to ${email}. Enter it below to complete registration.`,
        },
        { status: 201 }
      );
    }

    const { rawToken, expiresAt } = await createCloudSession({
      userId: user.id,
      schoolId: school.id,
      clientType,
      deviceLabel,
      displayHwid,
    });

    const directives = {
      ...toPublicPlatformDirectives(settings),
      school_status: "active",
      school_ban_reason: null,
      school_notice: "",
      school_notice_level: "info",
      feature_overrides: {},
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
      },
      school: {
        id: school.id,
        school_name: school.school_name,
        country_code: String(school.country_code || "NG").trim(),
        state_region: school.state_region || "",
        contact_email: school.contact_email,
        contact_phone: school.contact_phone || "",
        status: school.status,
      },
      referral_code: myReferralCode,
      licenses: [],
      directives,
    };

    const res = NextResponse.json(payload, { status: 201 });
    attachSessionCookie(res, rawToken);
    return res;
  } catch (err) {
    console.error("Sign-up error:", err);
    return NextResponse.json(
      { ok: false, error: "signup_failed", message: "Could not create your account right now. Please try again." },
      { status: 500 }
    );
  }
}
