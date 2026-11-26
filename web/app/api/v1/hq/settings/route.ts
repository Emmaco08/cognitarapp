import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireHqAdmin } from "@/lib/auth";
import { encryptSecret, getEd25519PublicKeyB64Url, maskSecretKey } from "@/lib/crypto";
import { getPlatformSettings, logDeveloperAudit, paystackRequest } from "@/lib/platform";
import { brevoSendTransactionalEmail, buildOtpEmailHtml } from "@/lib/brevo";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function buildSettingsResponse(req: NextRequest) {
  const sql = getSql();
  const [s, testCountRows, latestPayRows] = await Promise.all([
    getPlatformSettings(),
    sql`SELECT COUNT(*)::int AS cnt FROM subscriptions_payments WHERE is_test = TRUE`,
    sql`
      SELECT sp.paystack_reference, sp.currency, sp.amount_minor, sp.customer_paid_minor,
             sp.fee_minor, sp.paystack_sub_channel, sp.is_test, sp.paid_at, p.display_name AS plan_name
      FROM subscriptions_payments sp
      JOIN plans p ON p.id = sp.plan_id
      WHERE sp.status = 'success' AND sp.payment_channel = 'paystack'
      ORDER BY COALESCE(sp.paid_at, sp.created_at) DESC
      LIMIT 1
    `,
  ]);

  let ed25519PublicKey = "";
  try {
    ed25519PublicKey = getEd25519PublicKeyB64Url();
  } catch {
    ed25519PublicKey = "not_configured";
  }

  const latest = latestPayRows[0] as Record<string, any> | undefined;
  let latestPaymentFeeSummary: Record<string, any> | null = null;
  if (latest) {
    const planPrice = Number(latest.amount_minor || 0);
    const paid = Number(latest.customer_paid_minor || planPrice);
    const fee = Number(latest.fee_minor || Math.max(0, paid - planPrice));
    const customerChargedFee = paid > planPrice;
    latestPaymentFeeSummary = {
      reference: latest.paystack_reference,
      plan_name: latest.plan_name,
      currency: String(latest.currency || "NGN").trim(),
      plan_price_minor: planPrice,
      customer_paid_minor: paid,
      paystack_fee_minor: fee,
      channel: latest.paystack_sub_channel || "paystack",
      is_test: Boolean(latest.is_test),
      paid_at: latest.paid_at,
      inferred_dashboard_setting: customerChargedFee ? "charge_customer" : "charge_merchant",
    };
  }

  const origin = req.nextUrl.origin || "https://cognitara-cloud.vercel.app";

  return {
    paystack_public_key: s.paystack_public_key,
    paystack_secret_masked: s.paystack_secret_masked,
    paystack_secret_configured: s.paystack_secret_configured,
    paystack_mode: s.paystack_mode,

    paystack_live_public_key: s.paystack_live_public_key,
    paystack_live_public_masked: maskSecretKey(s.paystack_live_public_key),
    paystack_live_secret_masked: s.paystack_live_secret_masked,
    paystack_live_configured: s.paystack_live_configured,

    paystack_test_public_key: s.paystack_test_public_key,
    paystack_test_public_masked: maskSecretKey(s.paystack_test_public_key),
    paystack_test_secret_masked: s.paystack_test_secret_masked,
    paystack_test_configured: s.paystack_test_configured,

    paystack_fee_mode: s.paystack_fee_mode,
    paystack_fee_pct: s.paystack_fee_pct,
    paystack_fee_flat_ngn: s.paystack_fee_flat_ngn,
    paystack_fee_cap_ngn: s.paystack_fee_cap_ngn,
    paystack_fee_flat_threshold_ngn: s.paystack_fee_flat_threshold_ngn,
    test_mode_staff_only: s.test_mode_staff_only,
    test_payments_count: Number(testCountRows[0]?.cnt || 0),
    latest_payment_fee_summary: latestPaymentFeeSummary,

    brevo_api_key_masked: s.brevo_api_key_masked,
    brevo_configured: s.brevo_configured,
    brevo_sender_email: s.brevo_sender_email,
    brevo_sender_name: s.brevo_sender_name,
    require_email_otp: s.require_email_otp,
    require_hq_2fa: s.require_hq_2fa,

    backup_reminder_days: s.backup_reminder_days,
    default_currency: s.default_currency,
    maintenance_mode: s.maintenance_mode,
    maintenance_message: s.maintenance_message,
    min_desktop_version: s.min_desktop_version,
    global_announcement: s.global_announcement,
    global_announcement_level: s.global_announcement_level,
    allow_self_signup: s.allow_self_signup,
    allow_paystack_checkout: s.allow_paystack_checkout,
    allow_trial_activation: s.allow_trial_activation,
    free_trial_days: s.free_trial_days,
    promo_banner_enabled: s.promo_banner_enabled,
    promo_banner_event: s.promo_banner_event,
    promo_banner_text: s.promo_banner_text,
    promo_banner_code: s.promo_banner_code,
    updated_at: s.updated_at,

    webhook_url: `${origin}/api/v1/payments/paystack/webhook`,
    callback_url: `${origin}/pay/done`,
    ed25519_public_key: ed25519PublicKey,
  };
}

export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "HQ admin access required." }, { status: 403 });
    }
    const settings = await buildSettingsResponse(req);
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    console.error("HQ settings GET error:", err);
    return NextResponse.json({ ok: false, error: "hq_settings_failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "HQ admin access required." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });

    const sql = getSql();
    await sql`INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
    const cur = await getPlatformSettings();

    // Dual Live / Test Paystack keys (only update non-empty submitted values so existing keys are NEVER wiped!)
    const livePub = body.paystack_live_public_key !== undefined ? String(body.paystack_live_public_key || "").trim() : "";
    const liveSec = body.paystack_live_secret_key !== undefined ? String(body.paystack_live_secret_key || "").trim() : "";
    const testPub = body.paystack_test_public_key !== undefined ? String(body.paystack_test_public_key || "").trim() : "";
    const testSec = body.paystack_test_secret_key !== undefined ? String(body.paystack_test_secret_key || "").trim() : "";

    // Backwards-compatible legacy single fields if sent by older clients
    const legacyPub = body.paystack_public_key !== undefined ? String(body.paystack_public_key || "").trim() : "";
    const legacySec = body.paystack_secret_key !== undefined ? String(body.paystack_secret_key || "").trim() : "";

    if (livePub && !livePub.startsWith("pk_live_")) {
      return NextResponse.json({ ok: false, message: "Live public key must start with pk_live_." }, { status: 400 });
    }
    if (liveSec && !liveSec.startsWith("sk_live_")) {
      return NextResponse.json({ ok: false, message: "Live secret key must start with sk_live_." }, { status: 400 });
    }
    if (testPub && !testPub.startsWith("pk_test_")) {
      return NextResponse.json({ ok: false, message: "Test public key must start with pk_test_." }, { status: 400 });
    }
    if (testSec && !testSec.startsWith("sk_test_")) {
      return NextResponse.json({ ok: false, message: "Test secret key must start with sk_test_." }, { status: 400 });
    }

    const effectiveLivePub = livePub || (legacyPub.startsWith("pk_live_") ? legacyPub : "");
    const effectiveLiveSec = liveSec || (legacySec.startsWith("sk_live_") ? legacySec : "");
    const effectiveTestPub = testPub || (legacyPub.startsWith("pk_test_") ? legacyPub : "");
    const effectiveTestSec = testSec || (legacySec.startsWith("sk_test_") ? legacySec : "");

    const brevoKeyRaw = body.brevo_api_key !== undefined ? String(body.brevo_api_key || "").trim() : "";
    if (brevoKeyRaw && !brevoKeyRaw.startsWith("xkeysib-")) {
      return NextResponse.json(
        { ok: false, message: "Brevo API key should start with xkeysib-." },
        { status: 400 }
      );
    }

    const brevoSenderEmail = body.brevo_sender_email !== undefined ? String(body.brevo_sender_email || "").trim().slice(0, 160) : undefined;
    const brevoSenderName = body.brevo_sender_name !== undefined ? String(body.brevo_sender_name || "").trim().slice(0, 120) : undefined;
    const requireEmailOtp = body.require_email_otp !== undefined ? Boolean(body.require_email_otp) : cur.require_email_otp;
    const requireHq2fa = body.require_hq_2fa !== undefined ? Boolean(body.require_hq_2fa) : cur.require_hq_2fa;

    const mode: "test" | "live" =
      body.paystack_mode === "live" ? "live" : body.paystack_mode === "test" ? "test" : cur.paystack_mode;

    const feeMode = ["merchant", "customer_added", "paystack_checkout"].includes(String(body.paystack_fee_mode || ""))
      ? String(body.paystack_fee_mode)
      : cur.paystack_fee_mode;
    const feePct = body.paystack_fee_pct !== undefined ? Math.max(0, Math.min(20, Number(body.paystack_fee_pct))) : cur.paystack_fee_pct;
    const feeFlat = body.paystack_fee_flat_ngn !== undefined ? Math.max(0, Math.min(5000, Math.floor(Number(body.paystack_fee_flat_ngn)))) : cur.paystack_fee_flat_ngn;
    const feeCap = body.paystack_fee_cap_ngn !== undefined ? Math.max(0, Math.min(50000, Math.floor(Number(body.paystack_fee_cap_ngn)))) : cur.paystack_fee_cap_ngn;
    const feeThreshold = body.paystack_fee_flat_threshold_ngn !== undefined
      ? Math.max(0, Math.floor(Number(body.paystack_fee_flat_threshold_ngn)))
      : cur.paystack_fee_flat_threshold_ngn;
    const testModeStaffOnly = body.test_mode_staff_only !== undefined ? Boolean(body.test_mode_staff_only) : cur.test_mode_staff_only;

    const backupReminderDays = body.backup_reminder_days !== undefined
      ? Math.max(1, Math.min(365, Math.floor(Number(body.backup_reminder_days))))
      : cur.backup_reminder_days;

    const currency = ["NGN", "USD", "GHS", "KES", "ZAR"].includes(String(body.default_currency || "").toUpperCase())
      ? String(body.default_currency).toUpperCase()
      : cur.default_currency;
    const maintenanceMode = body.maintenance_mode !== undefined ? Boolean(body.maintenance_mode) : cur.maintenance_mode;
    const maintenanceMsg = body.maintenance_message !== undefined ? String(body.maintenance_message || "").trim().slice(0, 400) : cur.maintenance_message;
    const minVersion = body.min_desktop_version !== undefined ? String(body.min_desktop_version || "2.0.0").trim().slice(0, 24) : cur.min_desktop_version;
    const announcement = body.global_announcement !== undefined ? String(body.global_announcement || "").trim().slice(0, 500) : cur.global_announcement;
    const announcementLevel = ["info", "warning", "critical", "promo"].includes(String(body.global_announcement_level || ""))
      ? String(body.global_announcement_level)
      : cur.global_announcement_level;
    const allowSelfSignup = body.allow_self_signup !== undefined ? Boolean(body.allow_self_signup) : cur.allow_self_signup;
    const allowPaystackCheckout = body.allow_paystack_checkout !== undefined ? Boolean(body.allow_paystack_checkout) : cur.allow_paystack_checkout;
    const allowTrialActivation =
      body.allow_trial_activation !== undefined
        ? Boolean(body.allow_trial_activation)
        : body.free_trial_enabled !== undefined
        ? Boolean(body.free_trial_enabled)
        : cur.allow_trial_activation;
    const freeTrialDays =
      body.free_trial_days !== undefined
        ? Math.max(1, Math.min(90, Math.floor(Number(body.free_trial_days) || 7)))
        : cur.free_trial_days;
    const promoBannerEnabled =
      body.promo_banner_enabled !== undefined ? Boolean(body.promo_banner_enabled) : cur.promo_banner_enabled;
    const promoBannerEvent =
      body.promo_banner_event !== undefined ? String(body.promo_banner_event || "").trim().slice(0, 48) : cur.promo_banner_event;
    const promoBannerText =
      body.promo_banner_text !== undefined ? String(body.promo_banner_text || "").trim().slice(0, 120) : cur.promo_banner_text;
    const promoBannerCode =
      body.promo_banner_code !== undefined
        ? String(body.promo_banner_code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32)
        : cur.promo_banner_code;

    const encLiveSec = effectiveLiveSec ? encryptSecret(effectiveLiveSec) : null;
    const encTestSec = effectiveTestSec ? encryptSecret(effectiveTestSec) : null;
    const encBrevo = brevoKeyRaw ? encryptSecret(brevoKeyRaw) : null;

    // Keep legacy active columns synced too so nothing ever breaks
    const nextActivePub = mode === "live" ? (effectiveLivePub || cur.paystack_live_public_key) : (effectiveTestPub || cur.paystack_test_public_key);
    const nextActiveSecEnc = mode === "live" ? encLiveSec : encTestSec;

    await sql`
      UPDATE platform_settings
      SET paystack_mode = ${mode},
          paystack_live_public_key = CASE WHEN ${Boolean(effectiveLivePub)} THEN ${effectiveLivePub} ELSE paystack_live_public_key END,
          paystack_live_secret_enc = CASE WHEN ${encLiveSec !== null} THEN ${encLiveSec || ""} ELSE paystack_live_secret_enc END,
          paystack_test_public_key = CASE WHEN ${Boolean(effectiveTestPub)} THEN ${effectiveTestPub} ELSE paystack_test_public_key END,
          paystack_test_secret_enc = CASE WHEN ${encTestSec !== null} THEN ${encTestSec || ""} ELSE paystack_test_secret_enc END,
          paystack_public_key = CASE WHEN ${Boolean(nextActivePub)} THEN ${nextActivePub} ELSE paystack_public_key END,
          paystack_secret_key_enc = CASE WHEN ${nextActiveSecEnc !== null} THEN ${nextActiveSecEnc || ""} ELSE paystack_secret_key_enc END,
          paystack_fee_mode = ${feeMode},
          paystack_fee_pct = ${feePct},
          paystack_fee_flat_ngn = ${feeFlat},
          paystack_fee_cap_ngn = ${feeCap},
          paystack_fee_flat_threshold_ngn = ${feeThreshold},
          test_mode_staff_only = ${testModeStaffOnly},
          brevo_api_key_enc = CASE WHEN ${encBrevo !== null} THEN ${encBrevo || ""} ELSE brevo_api_key_enc END,
          brevo_sender_email = COALESCE(${brevoSenderEmail && brevoSenderEmail.includes("@") ? brevoSenderEmail : null}, brevo_sender_email),
          brevo_sender_name = COALESCE(${brevoSenderName || null}, brevo_sender_name),
          require_email_otp = ${requireEmailOtp},
          require_hq_2fa = ${requireHq2fa},
          backup_reminder_days = ${backupReminderDays},
          default_currency = ${currency},
          maintenance_mode = ${maintenanceMode},
          maintenance_message = ${maintenanceMsg},
          min_desktop_version = ${minVersion},
          global_announcement = ${announcement},
          global_announcement_level = ${announcementLevel},
          allow_self_signup = ${allowSelfSignup},
          allow_paystack_checkout = ${allowPaystackCheckout},
          allow_trial_activation = ${allowTrialActivation},
          free_trial_days = ${freeTrialDays},
          promo_banner_enabled = ${promoBannerEnabled},
          promo_banner_event = ${promoBannerEvent},
          promo_banner_text = ${promoBannerText},
          promo_banner_code = ${promoBannerCode},
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
        paystack_mode: mode,
        paystack_fee_mode: feeMode,
        updated_live_secret: Boolean(effectiveLiveSec),
        updated_test_secret: Boolean(effectiveTestSec),
        updated_brevo_key: Boolean(brevoKeyRaw),
        backup_reminder_days: backupReminderDays,
        require_hq_2fa: requireHq2fa,
        require_email_otp: requireEmailOtp,
        maintenance_mode: maintenanceMode,
        allow_trial_activation: allowTrialActivation,
        free_trial_days: freeTrialDays,
        promo_banner_enabled: promoBannerEnabled,
        promo_banner_event: promoBannerEvent,
        promo_banner_code: promoBannerCode,
      },
    });

    const settings = await buildSettingsResponse(req);
    return NextResponse.json({
      ok: true,
      message:
        effectiveLiveSec || effectiveTestSec || brevoKeyRaw
          ? "Keys encrypted and saved safely."
          : "Settings saved and live across web and desktop.",
      settings,
    });
  } catch (err) {
    console.error("HQ settings PUT error:", err);
    return NextResponse.json({ ok: false, message: "Could not save settings." }, { status: 500 });
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
        return NextResponse.json({ ok: false, message: "No Brevo API key saved yet. Paste your xkeysib-... key and click Save first." }, { status: 400 });
      }
      const testEmail = String(body.test_email || "").trim();
      if (testEmail && testEmail.includes("@")) {
        const sent = await brevoSendTransactionalEmail({
          apiKey: s.brevo_api_key,
          senderEmail: s.brevo_sender_email,
          senderName: s.brevo_sender_name,
          toEmail: testEmail,
          toName: hq.user.full_name,
          subject: "123456 is your CogniTara test security code",
          htmlContent: buildOtpEmailHtml({
            code: "123456",
            fullName: hq.user.full_name,
            schoolName: "CogniTara HQ",
            purpose: "signup_verify",
            expiresMinutes: 10,
          }),
          textContent: "Your CogniTara test security code is 123456.",
          tags: ["hq-test"],
        });
        if (!sent.ok) {
          return NextResponse.json({ ok: false, message: `Email delivery failed: ${sent.error}` }, { status: 400 });
        }
        return NextResponse.json({ ok: true, messageId: sent.messageId, message: `Test security email delivered to ${testEmail}.` });
      }

      const accRes = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": s.brevo_api_key, Accept: "application/json" },
      });
      const accData = await accRes.json().catch(() => ({}));
      if (!accRes.ok) {
        return NextResponse.json({ ok: false, message: `Brevo rejected the key: ${accData?.message || `HTTP ${accRes.status}`}` }, { status: 400 });
      }
      return NextResponse.json({
        ok: true,
        account: { email: accData?.email, companyName: accData?.companyName, plan: accData?.plan },
        message: `Connected to Brevo (${accData?.email || "verified"}).`,
      });
    }

    const slot = String(body.slot || s.paystack_mode).toLowerCase() === "live" ? "live" : "test";
    const keyToTest = slot === "live" ? s.paystack_live_secret_key : s.paystack_test_secret_key;
    if (!keyToTest) {
      return NextResponse.json(
        { ok: false, message: `No Paystack ${slot.toUpperCase()} secret key saved yet. Enter it and save first.` },
        { status: 400 }
      );
    }

    const res = await paystackRequest(keyToTest, "/balance", "GET");
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, message: `Paystack rejected the ${slot.toUpperCase()} key: ${res.data?.message || `HTTP ${res.status}`}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: slot,
      balances: res.data?.data || [],
      message: `Connected to Paystack (${slot.toUpperCase()} mode) successfully.`,
    });
  } catch (err) {
    console.error("Provider test error:", err);
    return NextResponse.json({ ok: false, message: "Could not test provider connection." }, { status: 500 });
  }
}
