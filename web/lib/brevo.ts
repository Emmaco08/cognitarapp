import crypto from "node:crypto";
import { getSql } from "./db";
import type { PlatformSettingsRow } from "./platform";

export type OtpPurpose = "signup_verify" | "signin_otp" | "password_reset" | "hq_2fa";

const OTP_TTL_SECONDS = 600; // 10 minutes
const OTP_RESEND_COOLDOWN_SECONDS = 45;

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hashOtpCode(code: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.createHash("sha256").update(`${salt}:${code}`).digest("hex");
  return `${salt}:${digest}`;
}

function verifyOtpHash(code: string, stored: string): boolean {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = crypto.createHash("sha256").update(`${salt}:${code}`).digest("hex");
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildOtpEmailHtml(params: {
  code: string;
  fullName?: string;
  schoolName?: string;
  purpose: OtpPurpose;
  expiresMinutes: number;
  ipAddress?: string;
}): string {
  const greeting = params.fullName ? `Hi ${escapeHtml(params.fullName)},` : "Hello,";
  const badgeText = params.purpose === "hq_2fa" ? "HQ Security Verification" : "One-Time Verification Code";
  const contextLine =
    params.purpose === "hq_2fa"
      ? `A sign-in to the CogniTara HQ Admin Console was requested${params.ipAddress ? ` from IP ${escapeHtml(params.ipAddress)}` : ""}. Enter this 6-digit security code to verify your identity:`
      : params.purpose === "signin_otp"
      ? "Enter this 6-digit security code to complete your sign-in to CogniTara:"
      : params.purpose === "password_reset"
      ? "Enter this 6-digit security code to reset your CogniTara password:"
      : `Welcome to CogniTara${params.schoolName ? ` — ${escapeHtml(params.schoolName)}` : ""}. Enter this 6-digit verification code to activate your account:`;

  return `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#111111;color:#f3f3f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#191919;border:1px solid #2b2b2b;border-radius:14px;overflow:hidden;">
    <tr>
      <td style="padding:22px 28px;border-bottom:1px solid #262626;">
        <span style="font-size:15px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">CogniTara</span>
        <span style="margin-left:8px;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#8e8e93;">${badgeText}</span>
      </td>
    </tr>
    <tr>
      <td style="padding:26px 28px;">
        <p style="margin:0 0 10px;font-size:14px;color:#e5e5e7;">${greeting}</p>
        <p style="margin:0 0 22px;font-size:14px;line-height:1.55;color:#a1a1aa;">${contextLine}</p>
        <div style="background:#111111;border:1px solid #303036;border-radius:10px;padding:18px 20px;text-align:center;margin:0 0 22px;">
          <span style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:0.28em;color:#ffffff;">${escapeHtml(params.code)}</span>
        </div>
        <p style="margin:0;font-size:12.5px;line-height:1.5;color:#8e8e93;">
          This code expires in <strong style="color:#e5e5e7;">${params.expiresMinutes} minutes</strong> and works once.
          If you did not request this, change your password immediately or ignore this message.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildPaymentReceiptEmailHtml(params: {
  fullName: string;
  schoolName: string;
  planName: string;
  reference: string;
  currency: string;
  amountPaidMinor: number;
  planPriceMinor: number;
  discountMinor: number;
  feeMinor: number;
  channel: string;
  licenseKey: string;
  expiresAt: string | null;
  isTest: boolean;
  receiptUrl: string;
  pdfReceiptUrl?: string;
}): string {
  const sym = params.currency === "USD" ? "$" : params.currency === "NGN" ? "₦" : `${params.currency} `;
  const fmt = (minor: number) => `${sym}${(Number(minor || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const expiryText = params.expiresAt ? new Date(params.expiresAt).toUTCString().slice(0, 16) : "Perpetual (Never expires)";
  const statusTag = params.isTest
    ? "Payment Confirmed (Test)"
    : Number(params.amountPaidMinor || 0) === 0
    ? "Voucher Redeemed"
    : "Payment Confirmed";

  return `<!doctype html>
<html>
<body style="margin:0;padding:28px 16px;background:#F8F8F8;color:#171614;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E5E4E0;border-radius:16px;overflow:hidden;">
    <tr>
      <td style="padding:24px 28px;background:#171614;color:#FFFFFF;">
        <div style="font-size:17px;font-weight:700;letter-spacing:-0.02em;color:#FFFFFF;">CogniTara</div>
        <div style="margin-top:4px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#B8B5AE;">${escapeHtml(statusTag)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#171614;">Licence ready for ${escapeHtml(params.schoolName)}</p>
        <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#575551;">
          Your ${escapeHtml(params.planName)} is verified and active. Enter the licence key below inside <strong>CogniTara Studio Desktop → Licence → Activate</strong>.
        </p>

        <div style="background:#171614;border-radius:12px;padding:20px 22px;margin:0 0 22px;text-align:center;">
          <div style="font-size:10.5px;color:#A19E98;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Ed25519 Licence Key</div>
          <div style="font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:0.08em;word-break:break-all;">${escapeHtml(params.licenseKey)}</div>
          <div style="font-size:12px;color:#C8C5BE;margin-top:8px;">Valid until: ${escapeHtml(expiryText)}</div>
        </div>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13.5px;color:#2C2B28;border-collapse:collapse;margin-bottom:24px;">
          <tr><td style="padding:9px 0;border-bottom:1px solid #ECEBE7;color:#73706B;">School</td><td align="right" style="padding:9px 0;border-bottom:1px solid #ECEBE7;font-weight:600;color:#171614;">${escapeHtml(params.schoolName)}</td></tr>
          <tr><td style="padding:9px 0;border-bottom:1px solid #ECEBE7;color:#73706B;">Plan</td><td align="right" style="padding:9px 0;border-bottom:1px solid #ECEBE7;font-weight:600;color:#171614;">${escapeHtml(params.planName)}</td></tr>
          <tr><td style="padding:9px 0;border-bottom:1px solid #ECEBE7;color:#73706B;">Reference</td><td align="right" style="padding:9px 0;border-bottom:1px solid #ECEBE7;font-family:monospace;font-size:12.5px;color:#171614;">${escapeHtml(params.reference)}</td></tr>
          <tr><td style="padding:9px 0;border-bottom:1px solid #ECEBE7;color:#73706B;">Payment method</td><td align="right" style="padding:9px 0;border-bottom:1px solid #ECEBE7;color:#171614;">${escapeHtml(params.channel)}</td></tr>
          ${params.discountMinor > 0 ? `<tr><td style="padding:9px 0;border-bottom:1px solid #ECEBE7;color:#73706B;">Discount applied</td><td align="right" style="padding:9px 0;border-bottom:1px solid #ECEBE7;font-family:monospace;font-weight:600;color:#171614;">-${fmt(params.discountMinor)}</td></tr>` : ""}
          ${params.feeMinor > 0 ? `<tr><td style="padding:9px 0;border-bottom:1px solid #ECEBE7;color:#73706B;">Processing fee</td><td align="right" style="padding:9px 0;border-bottom:1px solid #ECEBE7;font-family:monospace;">${fmt(params.feeMinor)}</td></tr>` : ""}
          <tr><td style="padding:12px 0 4px;font-weight:700;color:#171614;">Total paid</td><td align="right" style="padding:12px 0 4px;font-family:monospace;font-weight:700;font-size:16px;color:#171614;">${fmt(params.amountPaidMinor)}</td></tr>
        </table>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" style="padding-bottom:10px;">
              <a href="${escapeHtml(params.receiptUrl)}" style="display:inline-block;padding:12px 24px;background:#171614;color:#FFFFFF;font-size:13.5px;font-weight:600;text-decoration:none;border-radius:10px;">View Licence &amp; Receipt</a>
            </td>
          </tr>
          ${params.pdfReceiptUrl ? `<tr>
            <td align="center">
              <a href="${escapeHtml(params.pdfReceiptUrl)}" style="display:inline-block;padding:10px 20px;background:#F3F2EE;border:1px solid #DCDAD4;color:#171614;font-size:13px;font-weight:600;text-decoration:none;border-radius:10px;">Download PDF Receipt</a>
            </td>
          </tr>` : ""}
        </table>

        <div style="margin-top:24px;border-top:1px solid #ECEBE7;padding-top:14px;font-size:12px;color:#83807B;text-align:center;">
          Keep this email safe for your school records. Need help? Contact support@cognitara.net
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function brevoSendTransactionalEmail(params: {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  tags?: string[];
}): Promise<{ ok: boolean; status: number; messageId?: string; error?: string }> {
  if (!params.apiKey) {
    return {
      ok: false,
      status: 400,
      error: "Brevo API key is not configured yet. Add it in HQ Email Settings.",
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "api-key": params.apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: params.senderEmail || "noreply@cognitara.net",
          name: params.senderName || "CogniTara",
        },
        to: [{ email: params.toEmail, ...(params.toName ? { name: params.toName } : {}) }],
        subject: params.subject,
        htmlContent: params.htmlContent,
        textContent: params.textContent,
        ...(params.tags?.length ? { tags: params.tags } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: String(data?.message || data?.code || `Brevo HTTP ${res.status}`),
      };
    }
    return { ok: true, status: res.status, messageId: data?.messageId };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "Could not reach Brevo API.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendPaymentReceiptEmail(params: {
  settings: PlatformSettingsRow;
  toEmail: string;
  fullName: string;
  schoolName: string;
  planName: string;
  reference: string;
  currency: string;
  amountPaidMinor: number;
  planPriceMinor: number;
  discountMinor: number;
  feeMinor: number;
  channel: string;
  licenseKey: string;
  expiresAt: string | null;
  isTest: boolean;
  receiptUrl: string;
  pdfReceiptUrl?: string;
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  if (!params.settings.brevo_configured || !params.settings.brevo_api_key) {
    return { ok: false, error: "Brevo not configured" };
  }
  const sym = params.currency === "USD" ? "$" : params.currency === "NGN" ? "₦" : `${params.currency} `;
  const amtText = `${sym}${(Number(params.amountPaidMinor || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const htmlContent = buildPaymentReceiptEmailHtml(params);
  const textContent = [
    `CogniTara Licence Active — ${params.schoolName}`,
    `Licence Key: ${params.licenseKey}`,
    `Plan: ${params.planName}`,
    `Amount paid: ${amtText}`,
    `Reference: ${params.reference}`,
    `View receipt & key: ${params.receiptUrl}`,
    ...(params.pdfReceiptUrl ? [`Download PDF receipt: ${params.pdfReceiptUrl}`] : []),
    `Activate in CogniTara Studio Desktop -> Licence -> Enter Licence Key.`,
  ].join("\n");

  return brevoSendTransactionalEmail({
    apiKey: params.settings.brevo_api_key,
    senderEmail: params.settings.brevo_sender_email,
    senderName: params.settings.brevo_sender_name || "CogniTara",
    toEmail: params.toEmail,
    toName: params.fullName,
    subject: `Your CogniTara Licence Key & Receipt (${params.reference})`,
    htmlContent,
    textContent,
    tags: ["cognitara-receipt", params.isTest ? "test-payment" : "live-payment"],
  });
}

export function buildDownloadLinkEmailHtml(params: {
  downloadUrl: string;
  siteUrl: string;
  supportEmail: string;
  versionLabel?: string;
  trialDays?: number | null;
}): string {
  const dl = escapeHtml(params.downloadUrl);
  const site = escapeHtml(params.siteUrl);
  const support = escapeHtml(params.supportEmail);
  const trialNote =
    params.trialDays && params.trialDays > 0
      ? `Includes a ${params.trialDays}-day free trial with no card required.`
      : "Ready to activate immediately with a CogniTara school licence key.";

  return `<!doctype html>
<html>
<body style="margin:0;padding:28px 16px;background:#F8F8F8;color:#171614;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(23,22,20,0.09);border-radius:14px;overflow:hidden;">
    <tr>
      <td style="padding:26px 28px 18px;border-bottom:1px solid rgba(23,22,20,0.07);">
        <div style="font-size:16px;font-weight:600;letter-spacing:-0.02em;color:#171614;">Your CogniTara Studio for Windows download link</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px 26px;font-size:14.5px;line-height:1.65;color:#2C2B28;">
        <p style="margin:0 0 14px;">Hi there,</p>
        <p style="margin:0 0 16px;">Open this link on your Windows PC and the installer downloads straight away:</p>
        <p style="margin:0 0 18px;word-break:break-all;">
          <a href="${dl}" style="color:#171614;font-weight:600;text-decoration:underline;text-underline-offset:3px;">${dl}</a>
        </p>
        <p style="margin:0 0 18px;">
          <a href="${dl}" style="display:inline-block;padding:11px 20px;background:#171614;color:#FFFFFF;font-size:14px;font-weight:500;text-decoration:none;border-radius:10px;">Download CogniTara Studio${params.versionLabel ? ` (${escapeHtml(params.versionLabel)})` : ""}</a>
        </p>
        <p style="margin:0 0 14px;font-size:13.5px;color:#575551;">
          It is a single 64-bit Windows installer for Windows 10 and Windows 11. Open it, follow the setup wizard, and CogniTara Studio is ready to run offline exams across your school Wi-Fi. ${escapeHtml(trialNote)}
        </p>
        <p style="margin:0 0 18px;font-size:13.5px;color:#575551;">
          Questions? Contact <a href="mailto:${support}" style="color:#171614;">${support}</a>
        </p>
        <div style="border-top:1px solid rgba(23,22,20,0.08);padding-top:14px;font-size:12px;color:#83807B;">
          CogniTara — <a href="${site}" style="color:#575551;">${site}</a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendDownloadLinkEmail(params: {
  settings: PlatformSettingsRow;
  toEmail: string;
  downloadUrl: string;
  siteUrl: string;
  versionLabel?: string;
  trialDays?: number | null;
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  if (!params.settings.brevo_configured || !params.settings.brevo_api_key) {
    return { ok: false, error: "Brevo email delivery is not configured." };
  }
  const supportEmail = params.settings.brevo_sender_email || "hello@cognitara.net";
  const htmlContent = buildDownloadLinkEmailHtml({
    downloadUrl: params.downloadUrl,
    siteUrl: params.siteUrl,
    supportEmail,
    versionLabel: params.versionLabel,
    trialDays: params.trialDays,
  });
  const textContent = [
    "Your CogniTara Studio for Windows download link",
    "",
    "Hi there,",
    "",
    "Open this link on your Windows PC and the installer downloads straight away:",
    "",
    params.downloadUrl,
    "",
    "It is a single 64-bit Windows installer for Windows 10 and Windows 11.",
    "Open it, follow the setup wizard, and CogniTara Studio is ready to serve offline exams on your school network.",
    "",
    `Questions? Contact ${supportEmail}`,
    "",
    "---",
    `CogniTara - ${params.siteUrl}`,
  ].join("\n");

  return brevoSendTransactionalEmail({
    apiKey: params.settings.brevo_api_key,
    senderEmail: params.settings.brevo_sender_email,
    senderName: params.settings.brevo_sender_name || "CogniTara",
    toEmail: params.toEmail,
    subject: "Your CogniTara Studio for Windows download link",
    htmlContent,
    textContent,
    tags: ["cognitara-download-link"],
  });
}

export async function createAndSendEmailOtp(params: {
  settings: PlatformSettingsRow;
  userId: string;
  email: string;
  fullName?: string;
  schoolName?: string;
  purpose: OtpPurpose;
  ipAddress?: string;
  clientMeta?: Record<string, unknown>;
  bypassCooldown?: boolean;
}): Promise<{ ok: boolean; expires_in_seconds?: number; retry_after_sec?: number; error?: string; message?: string }> {
  const sql = getSql();

  if (!params.bypassCooldown) {
    const recent = await sql`
      SELECT EXTRACT(EPOCH FROM (NOW() - created_at))::int AS age_sec
      FROM email_otp_codes
      WHERE email = ${params.email}
        AND purpose = ${params.purpose}
        AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const age = recent.length ? Number(recent[0].age_sec) : 9999;
    if (age < OTP_RESEND_COOLDOWN_SECONDS) {
      const wait = Math.max(1, OTP_RESEND_COOLDOWN_SECONDS - age);
      return {
        ok: false,
        error: "otp_cooldown",
        retry_after_sec: wait,
        message: `Please wait ${wait}s before requesting another code.`,
      };
    }
  }

  const code = String(crypto.randomInt(100_000, 1_000_000));
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();

  await sql`
    UPDATE email_otp_codes
    SET consumed_at = NOW()
    WHERE user_id = ${params.userId}::uuid
      AND purpose = ${params.purpose}
      AND consumed_at IS NULL
  `;

  const inserted = await sql`
    INSERT INTO email_otp_codes (user_id, email, purpose, code_hash, expires_at, client_meta_json)
    VALUES (
      ${params.userId}::uuid,
      ${params.email},
      ${params.purpose},
      ${codeHash},
      ${expiresAt}::timestamptz,
      ${JSON.stringify(params.clientMeta || {})}::jsonb
    )
    RETURNING id
  `;

  const expiresMinutes = Math.round(OTP_TTL_SECONDS / 60);
  const subjectPrefix = params.purpose === "hq_2fa" ? `${code} — CogniTara HQ 2FA Security Code` : `${code} is your CogniTara verification code`;
  const sendRes = await brevoSendTransactionalEmail({
    apiKey: params.settings.brevo_api_key,
    senderEmail: params.settings.brevo_sender_email,
    senderName: params.settings.brevo_sender_name,
    toEmail: params.email,
    toName: params.fullName,
    subject: subjectPrefix,
    htmlContent: buildOtpEmailHtml({
      code,
      fullName: params.fullName,
      schoolName: params.schoolName,
      purpose: params.purpose,
      expiresMinutes,
      ipAddress: params.ipAddress,
    }),
    textContent: `Your CogniTara security code is ${code}. It expires in ${expiresMinutes} minutes.`,
    tags: ["cognitara-otp", params.purpose],
  });

  if (!sendRes.ok) {
    if (inserted[0]?.id) {
      await sql`DELETE FROM email_otp_codes WHERE id = ${inserted[0].id}::uuid`;
    }
    return {
      ok: false,
      error: "brevo_delivery_failed",
      message: `Could not send verification email: ${sendRes.error || "Unknown error"}`,
    };
  }

  return { ok: true, expires_in_seconds: OTP_TTL_SECONDS };
}

export async function verifyStoredEmailOtp(params: {
  email: string;
  code: string;
  purpose?: OtpPurpose;
}): Promise<{
  ok: boolean;
  error?: string;
  message?: string;
  userId?: string;
  purpose?: OtpPurpose;
  clientMeta?: Record<string, any>;
}> {
  const cleanCode = String(params.code || "").replace(/\s+/g, "").trim();
  if (!/^\d{6}$/.test(cleanCode)) {
    return { ok: false, error: "invalid_otp_format", message: "Enter the 6-digit verification code sent to your email." };
  }

  const sql = getSql();
  const rows = params.purpose
    ? await sql`
        SELECT id, user_id, purpose, code_hash, attempts, max_attempts, expires_at, client_meta_json
        FROM email_otp_codes
        WHERE email = ${params.email}
          AND purpose = ${params.purpose}
          AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `
    : await sql`
        SELECT id, user_id, purpose, code_hash, attempts, max_attempts, expires_at, client_meta_json
        FROM email_otp_codes
        WHERE email = ${params.email}
          AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `;

  if (!rows.length) {
    return { ok: false, error: "otp_not_found", message: "No active verification code found. Request a new code." };
  }

  const rec = rows[0] as Record<string, any>;
  if (new Date(rec.expires_at).getTime() <= Date.now()) {
    await sql`UPDATE email_otp_codes SET consumed_at = NOW() WHERE id = ${rec.id}::uuid`;
    return { ok: false, error: "otp_expired", message: "This verification code has expired. Request a new code." };
  }

  if (Number(rec.attempts) >= Number(rec.max_attempts || 5)) {
    await sql`UPDATE email_otp_codes SET consumed_at = NOW() WHERE id = ${rec.id}::uuid`;
    return { ok: false, error: "otp_locked", message: "Too many incorrect attempts. Request a new verification code." };
  }

  if (!verifyOtpHash(cleanCode, String(rec.code_hash || ""))) {
    const nextAttempts = Number(rec.attempts) + 1;
    const remaining = Math.max(0, Number(rec.max_attempts || 5) - nextAttempts);
    await sql`
      UPDATE email_otp_codes
      SET attempts = ${nextAttempts},
          consumed_at = CASE WHEN ${remaining === 0} THEN NOW() ELSE consumed_at END
      WHERE id = ${rec.id}::uuid
    `;
    return {
      ok: false,
      error: "otp_invalid",
      message:
        remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          : "Too many incorrect attempts. Request a new verification code.",
    };
  }

  await sql`UPDATE email_otp_codes SET consumed_at = NOW() WHERE id = ${rec.id}::uuid`;
  await sql`UPDATE users_hq SET email_verified = TRUE, email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ${rec.user_id}::uuid`;

  return {
    ok: true,
    userId: String(rec.user_id),
    purpose: rec.purpose as OtpPurpose,
    clientMeta: (rec.client_meta_json || {}) as Record<string, any>,
  };
}
