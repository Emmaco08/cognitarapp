import crypto from "node:crypto";
import { getSql } from "./db";
import type { PlatformSettingsRow } from "./platform";

export type OtpPurpose = "signup_verify" | "signin_otp" | "password_reset";

const OTP_TTL_SECONDS = 600; // 10 minutes
const OTP_RESEND_COOLDOWN_SECONDS = 45;

function escapeHtml(s: string): string {
  return s
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
}): string {
  const greeting = params.fullName ? `Hi ${escapeHtml(params.fullName)},` : "Hello,";
  const contextLine =
    params.purpose === "signin_otp"
      ? "Enter this 6-digit security code to complete your sign-in to CogniTara Cloud & Studio:"
      : params.purpose === "password_reset"
      ? "Enter this 6-digit security code to reset your CogniTara password:"
      : `Welcome to CogniTara${params.schoolName ? ` — ${escapeHtml(params.schoolName)}` : ""}. Enter this 6-digit verification code to activate your account:`;

  return `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#111111;color:#f3f3f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#191919;border:1px solid #2b2b2b;border-radius:14px;overflow:hidden;">
    <tr>
      <td style="padding:22px 28px;border-bottom:1px solid #262626;">
        <span style="font-size:15px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">CogniTara Cloud</span>
        <span style="margin-left:8px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#8e8e93;">One-Time Passcode</span>
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
          If you did not request this, you can safely ignore this message.
        </p>
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
      error: "Brevo API key is not configured yet. Add it in HQ Developer Settings.",
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
          name: params.senderName || "CogniTara Cloud",
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

export async function createAndSendEmailOtp(params: {
  settings: PlatformSettingsRow;
  userId: string;
  email: string;
  fullName?: string;
  schoolName?: string;
  purpose: OtpPurpose;
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

  // Invalidate prior active codes for the same user + purpose
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
  const sendRes = await brevoSendTransactionalEmail({
    apiKey: params.settings.brevo_api_key,
    senderEmail: params.settings.brevo_sender_email,
    senderName: params.settings.brevo_sender_name,
    toEmail: params.email,
    toName: params.fullName,
    subject: `${code} is your CogniTara verification code`,
    htmlContent: buildOtpEmailHtml({
      code,
      fullName: params.fullName,
      schoolName: params.schoolName,
      purpose: params.purpose,
      expiresMinutes,
    }),
    textContent: `Your CogniTara verification code is ${code}. It expires in ${expiresMinutes} minutes.`,
    tags: ["cognitara-otp", params.purpose],
  });

  if (!sendRes.ok) {
    // Clean up un-delivered OTP row so user isn't stuck on cooldown
    if (inserted[0]?.id) {
      await sql`DELETE FROM email_otp_codes WHERE id = ${inserted[0].id}::uuid`;
    }
    return {
      ok: false,
      error: "brevo_delivery_failed",
      message: `Could not send verification email via Brevo: ${sendRes.error || "Unknown error"}`,
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
  await sql`UPDATE users_hq SET email_verified = TRUE WHERE id = ${rec.user_id}::uuid`;

  return {
    ok: true,
    userId: String(rec.user_id),
    purpose: rec.purpose as OtpPurpose,
    clientMeta: (rec.client_meta_json || {}) as Record<string, any>,
  };
}
