import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireHqAdmin } from "@/lib/auth";
import { encryptSecret, getEd25519PublicKeyB64Url } from "@/lib/crypto";
import { getPlatformSettings, logDeveloperAudit, paystackRequest } from "@/lib/platform";
import { brevoSendTransactionalEmail, buildOtpEmailHtml } from "@/lib/brevo";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "Developer HQ access required." }, { status: 403 });
    }

    const s = await getPlatformSettings();
    let ed25519PublicKey = "";
    try {
      ed25519PublicKey = getEd25519PublicKeyB64Url();
    } catch {
      ed25519PublicKey = "not_configured";
    }

    return NextResponse.json({
      ok: true,
      settings: {
        paystack_public_key: s.paystack_public_key,
        paystack_secret_masked: s.paystack_secret_masked,
        paystack_secret_configured: s.paystack_secret_configured,
        paystack_mode: s.paystack_mode,
        brevo_api_key_masked: s.brevo_api_key_masked,
        brevo_configured: s.brevo_configured,
        brevo_sender_email: s.brevo_sender_email,
        brevo_sender_name: s.brevo_sender_name,
        require_email_otp: s.require_email_otp,
        default_currency: s.default_currency,
        maintenance_mode: s.maintenance_mode,
        maintenance_message: s.maintenance_message,
        min_desktop_version: s.min_desktop_version,
        global_announcement: s.global_announcement,
        global_announcement_level: s.global_announcement_level,
        allow_self_signup: s.allow_self_signup,
        allow_paystack_checkout: s.allow_paystack_checkout,
        allow_trial_activation: s.allow_trial_activation,
        updated_at: s.updated_at,
        webhook_url: `${req.nextUrl.origin}/api/v1/payments/paystack/webhook`,
        ed25519_public_key: ed25519PublicKey,
      },
    });
  } catch (err) {
    console.error("HQ settings GET error:", err);
    return NextResponse.json({ ok: false, error: "hq_settings_failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "Developer HQ access required." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });

    const sql = getSql();
    await sql`INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;

    const publicKey = body.paystack_public_key !== undefined ? String(body.paystack_public_key || "").trim() : undefined;
    const secretKeyRaw = body.paystack_secret_key !== undefined ? String(body.paystack_secret_key || "").trim() : undefined;
    const brevoKeyRaw = body.brevo_api_key !== undefined ? String(body.brevo_api_key || "").trim() : undefined;
    const brevoSenderEmail = body.brevo_sender_email !== undefined ? String(body.brevo_sender_email || "").trim().slice(0, 160) : undefined;
    const brevoSenderName = body.brevo_sender_name !== undefined ? String(body.brevo_sender_name || "").trim().slice(0, 120) : undefined;
    const requireEmailOtp = body.require_email_otp !== undefined ? Boolean(body.require_email_otp) : undefined;

    if (publicKey && !publicKey.startsWith("pk_")) {
      return NextResponse.json(
        { ok: false, message: "Paystack Public Key should start with pk_test_ or pk_live_." },
        { status: 400 }
      );
    }
    if (secretKeyRaw && !secretKeyRaw.startsWith("sk_")) {
      return NextResponse.json(
        { ok: false, message: "Paystack Secret Key should start with sk_test_ or sk_live_." },
        { status: 400 }
      );
    }
    if (brevoKeyRaw && !brevoKeyRaw.startsWith("xkeysib-")) {
      return NextResponse.json(
        { ok: false, message: "Brevo API v3 Key should start with xkeysib- (from app.brevo.com/settings/keys/api)." },
        { status: 400 }
      );
    }

    const mode =
      body.paystack_mode === "live" || (publicKey && publicKey.startsWith("pk_live_")) || (secretKeyRaw && secretKeyRaw.startsWith("sk_live_"))
        ? "live"
        : "test";
    const currency = ["NGN", "USD", "GHS", "KES", "ZAR"].includes(String(body.default_currency || "").toUpperCase())
      ? String(body.default_currency).toUpperCase()
      : "NGN";
    const maintenanceMode = Boolean(body.maintenance_mode);
    const maintenanceMsg = String(body.maintenance_message || "").trim().slice(0, 400);
    const minVersion = String(body.min_desktop_version || "2.0.0").trim().slice(0, 24);
    const announcement = String(body.global_announcement || "").trim().slice(0, 500);
    const announcementLevel = ["info", "warning", "critical", "promo"].includes(String(body.global_announcement_level || ""))
      ? String(body.global_announcement_level)
      : "info";
    const allowSelfSignup = body.allow_self_signup !== false;
    const allowPaystackCheckout = body.allow_paystack_checkout !== false;
    const allowTrialActivation = body.allow_trial_activation !== false;

    const encryptedSecret = secretKeyRaw ? encryptSecret(secretKeyRaw) : null;
    const encryptedBrevo = brevoKeyRaw ? encryptSecret(brevoKeyRaw) : null;

    await sql`
      UPDATE platform_settings
      SET paystack_public_key = COALESCE(${publicKey ?? null}, paystack_public_key),
          paystack_secret_key_enc = CASE WHEN ${encryptedSecret !== null} THEN ${encryptedSecret || ""} ELSE paystack_secret_key_enc END,
          paystack_mode = ${mode},
          brevo_api_key_enc = CASE WHEN ${encryptedBrevo !== null} THEN ${encryptedBrevo || ""} ELSE brevo_api_key_enc END,
          brevo_sender_email = COALESCE(${brevoSenderEmail && brevoSenderEmail.includes("@") ? brevoSenderEmail : null}, brevo_sender_email),
          brevo_sender_name = COALESCE(${brevoSenderName || null}, brevo_sender_name),
          require_email_otp = COALESCE(${requireEmailOtp ?? null}, require_email_otp),
          default_currency = ${currency},
          maintenance_mode = ${maintenanceMode},
          maintenance_message = ${maintenanceMsg},
          min_desktop_version = ${minVersion},
          global_announcement = ${announcement},
          global_announcement_level = ${announcementLevel},
          allow_self_signup = ${allowSelfSignup},
          allow_paystack_checkout = ${allowPaystackCheckout},
          allow_trial_activation = ${allowTrialActivation},
          updated_by = ${hq.user.id}::uuid,
          updated_at = NOW()
      WHERE id = 1
    `;

    await logDeveloperAudit({
      actorUserId: hq.user.id,
      actorEmail: hq.user.email,
      action: "hq_update_platform_settings",
      targetType: "platform_settings",
      targetId: "1",
      ipAddress: getClientIp(req),
      details: {
        updated_secret_key: Boolean(secretKeyRaw),
        updated_brevo_key: Boolean(brevoKeyRaw),
        require_email_otp: requireEmailOtp,
        paystack_mode: mode,
        currency,
        maintenance_mode: maintenanceMode,
        min_desktop_version: minVersion,
        allow_self_signup: allowSelfSignup,
        allow_paystack_checkout: allowPaystackCheckout,
        allow_trial_activation: allowTrialActivation,
        has_global_announcement: Boolean(announcement),
      },
    });

    const refreshed = await getPlatformSettings();
    return NextResponse.json({
      ok: true,
      message:
        secretKeyRaw || brevoKeyRaw
          ? "Settings saved & secret keys encrypted with AES-256-GCM."
          : "Platform settings & global directives updated live.",
      settings: {
        paystack_public_key: refreshed.paystack_public_key,
        paystack_secret_masked: refreshed.paystack_secret_masked,
        paystack_secret_configured: refreshed.paystack_secret_configured,
        paystack_mode: refreshed.paystack_mode,
        brevo_api_key_masked: refreshed.brevo_api_key_masked,
        brevo_configured: refreshed.brevo_configured,
        brevo_sender_email: refreshed.brevo_sender_email,
        brevo_sender_name: refreshed.brevo_sender_name,
        require_email_otp: refreshed.require_email_otp,
        default_currency: refreshed.default_currency,
        maintenance_mode: refreshed.maintenance_mode,
        maintenance_message: refreshed.maintenance_message,
        min_desktop_version: refreshed.min_desktop_version,
        global_announcement: refreshed.global_announcement,
        global_announcement_level: refreshed.global_announcement_level,
        allow_self_signup: refreshed.allow_self_signup,
        allow_paystack_checkout: refreshed.allow_paystack_checkout,
        allow_trial_activation: refreshed.allow_trial_activation,
      },
    });
  } catch (err) {
    console.error("HQ settings PUT error:", err);
    return NextResponse.json({ ok: false, message: "Could not save platform settings." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const provider = String(body.provider || "paystack").toLowerCase();
    const s = await getPlatformSettings();

    if (provider === "brevo") {
      if (!s.brevo_api_key) {
        return NextResponse.json(
          { ok: false, message: "No Brevo API key saved yet. Paste your xkeysib-... key and click Save first." },
          { status: 400 }
        );
      }
      const testEmail = String(body.test_email || "").trim();
      if (testEmail && testEmail.includes("@")) {
        const sent = await brevoSendTransactionalEmail({
          apiKey: s.brevo_api_key,
          senderEmail: s.brevo_sender_email,
          senderName: s.brevo_sender_name,
          toEmail: testEmail,
          toName: hq.user.full_name,
          subject: "123456 is your CogniTara Cloud test OTP",
          htmlContent: buildOtpEmailHtml({
            code: "123456",
            fullName: hq.user.full_name,
            schoolName: "CogniTara Developer HQ",
            purpose: "signup_verify",
            expiresMinutes: 10,
          }),
          textContent: "Your CogniTara Cloud test OTP is 123456.",
          tags: ["hq-test"],
        });
        if (!sent.ok) {
          return NextResponse.json({ ok: false, message: `Brevo test email failed: ${sent.error}` }, { status: 400 });
        }
        return NextResponse.json({
          ok: true,
          messageId: sent.messageId,
          message: `Live test OTP email sent to ${testEmail} via Brevo!`,
        });
      }

      const accRes = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": s.brevo_api_key, Accept: "application/json" },
      });
      const accData = await accRes.json().catch(() => ({}));
      if (!accRes.ok) {
        return NextResponse.json(
          { ok: false, message: `Brevo rejected the API key: ${accData?.message || `HTTP ${accRes.status}`}` },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        account: { email: accData?.email, companyName: accData?.companyName, plan: accData?.plan },
        message: `Connected to Brevo account (${accData?.email || "verified"}) successfully!`,
      });
    }

    if (!s.paystack_secret_key) {
      return NextResponse.json(
        { ok: false, message: "No Paystack Secret Key saved yet. Enter your sk_test_ or sk_live_ key and click Save first." },
        { status: 400 }
      );
    }

    const res = await paystackRequest(s.paystack_secret_key, "/balance", "GET");
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, message: `Paystack rejected the key: ${res.data?.message || `HTTP ${res.status}`}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: s.paystack_secret_key.startsWith("sk_live_") ? "live" : "test",
      balances: res.data?.data || [],
      message: `Connected to Paystack (${s.paystack_secret_key.startsWith("sk_live_") ? "LIVE" : "TEST"} mode) successfully!`,
    });
  } catch (err) {
    console.error("Provider test error:", err);
    return NextResponse.json({ ok: false, message: "Could not test provider connection." }, { status: 500 });
  }
}
