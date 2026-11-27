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

function resolveEmailSiteOrigin(siteUrl?: string): string {
  const raw = (siteUrl || process.env.NEXT_PUBLIC_SITE_URL || "https://cognitara.net").trim().replace(/\/+$/, "");
  if (!raw || /localhost|127\.0\.0\.1/i.test(raw) || !/^https?:\/\//i.test(raw)) {
    return "https://cognitara.net";
  }
  return raw;
}

function renderEmailShell(params: {
  title: string;
  preheader: string;
  badgeText: string;
  bodyHtml: string;
  siteUrl?: string;
  supportEmail?: string;
  footerNote?: string;
}): string {
  const siteOrigin = resolveEmailSiteOrigin(params.siteUrl);
  const logoLightUrl = `${siteOrigin}/brand/cognitara-email-logo-light.png`;
  const support = escapeHtml(params.supportEmail || "support@cognitara.net");
  const safeTitle = escapeHtml(params.title);
  const safePreheader = escapeHtml(params.preheader);
  const safeBadge = escapeHtml(params.badgeText);
  const safeSite = escapeHtml(siteOrigin);
  const footerNote = params.footerNote
    ? escapeHtml(params.footerNote)
    : "CogniTara · Local-First School Exam Server for Windows & School LAN.";

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${safeTitle}</title>
  <style type="text/css">
    html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; height: 100% !important; background-color: #F6F5F2 !important; -webkit-text-size-adjust: 100% !important; -ms-text-size-adjust: 100% !important; }
    * { -ms-text-size-adjust: 100%; -webkit-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt !important; mso-table-rspace: 0pt !important; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    a { text-decoration: none; }
    @media only screen and (max-width: 600px) {
      .em-outer { padding: 14px 10px 24px !important; }
      .em-card { border-radius: 14px !important; }
      .em-head { padding: 18px 18px !important; }
      .em-head-cell { display: block !important; width: 100% !important; text-align: left !important; }
      .em-head-badge-cell { padding-top: 10px !important; }
      .em-body { padding: 22px 18px 24px !important; }
      .em-h1 { font-size: 21px !important; line-height: 1.24 !important; }
      .em-otp-box { padding: 18px 12px !important; }
      .em-otp-code { font-size: 28px !important; letter-spacing: 0.18em !important; }
      .em-cert { padding: 18px 16px !important; }
      .em-cert-key-box { padding: 14px 10px !important; }
      .em-cert-key { font-size: 14.5px !important; letter-spacing: 0.04em !important; }
      .em-stack-cell { display: block !important; width: 100% !important; text-align: left !important; padding-left: 0 !important; padding-right: 0 !important; }
      .em-stack-gap { padding-top: 10px !important; }
      .em-kv-label { display: block !important; width: 100% !important; padding: 10px 0 2px !important; border-bottom: 0 !important; font-size: 12px !important; }
      .em-kv-val { display: block !important; width: 100% !important; text-align: left !important; padding: 0 0 10px !important; font-size: 13.5px !important; }
      .em-kv-total-label { display: block !important; width: 100% !important; padding: 12px 0 2px !important; font-size: 13px !important; }
      .em-kv-total-val { display: block !important; width: 100% !important; text-align: left !important; padding: 0 0 4px !important; border-top: 0 !important; font-size: 20px !important; }
      .em-btn { display: block !important; width: 100% !important; box-sizing: border-box !important; padding: 14px 16px !important; text-align: center !important; }
      .em-foot { padding: 18px 10px 0 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#F6F5F2;color:#171614;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;">
  <!-- Hidden inbox preheader -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">
    ${safePreheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#F6F5F2;">
    <tr>
      <td align="center" class="em-outer" style="padding:32px 16px 36px;">
        <!--[if mso]>
        <table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="560"><tr><td>
        <![endif]-->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="em-card" style="width:100%;max-width:560px;margin:0 auto;background-color:#FFFFFF;border:1px solid #E5E3DD;border-radius:18px;border-collapse:separate;border-spacing:0;overflow:hidden;">
          <!-- Obsidian Brand Masthead with Official CogniTara Logo PNG -->
          <tr>
            <td class="em-head" style="background-color:#171614;padding:22px 28px;border-bottom:1px solid #2A2825;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="left" valign="middle" class="em-head-cell">
                    <a href="${safeSite}" target="_blank" style="display:inline-block;text-decoration:none;">
                      <img src="${escapeHtml(logoLightUrl)}" alt="CogniTara" width="146" height="36" style="display:block;width:146px;height:36px;max-width:100%;border:0;color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:-0.02em;" />
                    </a>
                  </td>
                  <td align="right" valign="middle" class="em-head-cell em-head-badge-cell">
                    <span style="display:inline-block;padding:5px 11px;border-radius:999px;background-color:#262522;border:1px solid #3A3833;font-size:10.5px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#EAE8E3;white-space:nowrap;">${safeBadge}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Email Body -->
          <tr>
            <td class="em-body" style="padding:28px 28px 30px;background-color:#FFFFFF;color:#171614;">
              ${params.bodyHtml}
            </td>
          </tr>
        </table>

        <!-- Quiet Editorial Footer -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;margin:0 auto;">
          <tr>
            <td align="center" class="em-foot" style="padding:20px 16px 0;text-align:center;font-size:12px;line-height:1.65;color:#78756F;">
              <p style="margin:0 0 6px;color:#575551;font-weight:500;">${footerNote}</p>
              <p style="margin:0 0 6px;">
                <a href="${safeSite}" target="_blank" style="color:#171614;text-decoration:underline;">cognitara.net</a>
                &nbsp;&middot;&nbsp;
                <a href="${safeSite}/license" target="_blank" style="color:#575551;text-decoration:underline;">Licensing</a>
                &nbsp;&middot;&nbsp;
                <a href="${safeSite}/guides" target="_blank" style="color:#575551;text-decoration:underline;">Guides</a>
                &nbsp;&middot;&nbsp;
                <a href="${safeSite}/support" target="_blank" style="color:#575551;text-decoration:underline;">Support</a>
              </p>
              <p style="margin:0;color:#8D8A84;">
                Need assistance? Write to <a href="mailto:${support}" style="color:#575551;text-decoration:underline;">${support}</a>
              </p>
            </td>
          </tr>
        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildOtpEmailHtml(params: {
  code: string;
  fullName?: string;
  schoolName?: string;
  purpose: OtpPurpose;
  expiresMinutes: number;
  ipAddress?: string;
  siteUrl?: string;
}): string {
  const greeting = params.fullName ? `Hi ${escapeHtml(params.fullName)},` : "Hello,";
  const badgeText =
    params.purpose === "hq_2fa"
      ? "HQ Security"
      : params.purpose === "password_reset"
      ? "Password Reset"
      : params.purpose === "signin_otp"
      ? "Sign-In Code"
      : "Verification Code";

  const heading =
    params.purpose === "hq_2fa"
      ? "Confirm your HQ Console sign-in"
      : params.purpose === "password_reset"
      ? "Reset your CogniTara password"
      : params.purpose === "signin_otp"
      ? "Complete your sign-in"
      : "Verify your CogniTara account";

  const contextLine =
    params.purpose === "hq_2fa"
      ? `A sign-in to the CogniTara HQ Admin Console was requested${params.ipAddress ? ` from IP <strong style="color:#171614;">${escapeHtml(params.ipAddress)}</strong>` : ""}. Enter the 6-digit security code below to continue.`
      : params.purpose === "signin_otp"
      ? "Enter the 6-digit security code below to verify your sign-in to CogniTara."
      : params.purpose === "password_reset"
      ? "We received a request to reset your CogniTara password. Enter the 6-digit code below to set a new password."
      : `Welcome to CogniTara${params.schoolName ? `, <strong style="color:#171614;">${escapeHtml(params.schoolName)}</strong>` : ""}. Enter the 6-digit verification code below to activate your account.`;

  const bodyHtml = `
    <h1 class="em-h1" style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:400;line-height:1.22;letter-spacing:-0.02em;color:#171614;">
      ${heading}
    </h1>
    <p style="margin:0 0 8px;font-size:14.5px;line-height:1.6;color:#2C2B28;">${greeting}</p>
    <p style="margin:0 0 22px;font-size:14.5px;line-height:1.62;color:#575551;">${contextLine}</p>

    <!-- Obsidian 6-Digit Security Code Vault -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 22px;border-collapse:separate;border-spacing:0;">
      <tr>
        <td class="em-otp-box" align="center" style="background-color:#171614;border-radius:14px;padding:22px 18px;text-align:center;">
          <div style="font-size:10.5px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#A19E98;margin-bottom:10px;">
            One-Time Verification Code
          </div>
          <div class="em-otp-code" style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:36px;font-weight:700;letter-spacing:0.26em;color:#FFFFFF;line-height:1.15;padding-left:0.26em;">
            ${escapeHtml(params.code)}
          </div>
          <div style="margin-top:12px;font-size:12px;color:#C4C1BA;">
            Expires in <strong style="color:#FFFFFF;">${params.expiresMinutes} minutes</strong> &middot; Single-use only
          </div>
        </td>
      </tr>
    </table>

    <!-- Security Notice Card -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;border-spacing:0;">
      <tr>
        <td style="background-color:#F6F5F2;border:1px solid #EAE8E3;border-radius:12px;padding:14px 16px;font-size:12.5px;line-height:1.58;color:#575551;">
          <strong style="color:#171614;">Security note:</strong> Never share this code with anyone. CogniTara staff will never ask for your verification code. If you did not request this, you can safely ignore this email or update your password.
        </td>
      </tr>
    </table>
  `;

  return renderEmailShell({
    title: `${params.code}: CogniTara ${badgeText}`,
    preheader: `Your CogniTara security code is ${params.code}. Valid for ${params.expiresMinutes} minutes.`,
    badgeText,
    bodyHtml,
    siteUrl: params.siteUrl,
  });
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
  siteUrl?: string;
}): string {
  const sym = params.currency === "USD" ? "$" : params.currency === "NGN" ? "₦" : `${params.currency} `;
  const fmt = (minor: number) =>
    `${sym}${(Number(minor || 0) / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const expiryText = params.expiresAt
    ? new Date(params.expiresAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "Perpetual (Never expires)";
  const statusTag = params.isTest
    ? "Test Payment"
    : Number(params.amountPaidMinor || 0) === 0
    ? "Voucher Redeemed"
    : "Payment Confirmed";

  const derivedOrigin = (() => {
    try {
      return new URL(params.receiptUrl).origin;
    } catch {
      return params.siteUrl;
    }
  })();

  const kvRow = (label: string, value: string, opts?: { mono?: boolean; bold?: boolean }) => `
    <tr>
      <td class="em-kv-label" style="padding:10px 12px 10px 0;border-bottom:1px solid #ECEAE4;font-size:13px;color:#73706B;white-space:nowrap;">${label}</td>
      <td align="right" class="em-kv-val" style="padding:10px 0;border-bottom:1px solid #ECEAE4;font-size:13.5px;${opts?.mono ? "font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:12.5px;" : ""}${opts?.bold ? "font-weight:600;" : "font-weight:500;"}color:#171614;word-break:break-word;">${value}</td>
    </tr>`;

  const bodyHtml = `
    <h1 class="em-h1" style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:400;line-height:1.22;letter-spacing:-0.02em;color:#171614;">
      Licence activated for ${escapeHtml(params.schoolName)}
    </h1>
    <p style="margin:0 0 22px;font-size:14.5px;line-height:1.62;color:#575551;">
      Your <strong style="color:#171614;">${escapeHtml(params.planName)}</strong> is confirmed and cryptographically signed. Your Ed25519 licence key and official bursary receipt are ready below.
    </p>

    <!-- Obsidian Ed25519 Licence Certificate Card -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 20px;border-collapse:separate;border-spacing:0;">
      <tr>
        <td class="em-cert" style="background-color:#171614;border-radius:14px;padding:22px 22px 20px;color:#FFFFFF;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td align="left" valign="middle" style="font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#A19E98;">
                Official Ed25519 Licence Key
              </td>
              <td align="right" valign="middle">
                <span style="display:inline-block;padding:3px 9px;border-radius:999px;background-color:#2A2926;border:1px solid #3F3D38;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:0.08em;color:#FFFFFF;">ACTIVE</span>
              </td>
            </tr>
          </table>

          <div style="margin-top:6px;font-size:15px;font-weight:600;color:#FFFFFF;word-break:break-word;">
            ${escapeHtml(params.schoolName)}
          </div>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:16px 0 16px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td align="center" class="em-cert-key-box" style="background-color:#22211E;border:1px solid #383631;border-radius:10px;padding:16px 14px;text-align:center;">
                <div class="em-cert-key" style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:0.06em;line-height:1.25;word-break:break-all;">
                  ${escapeHtml(params.licenseKey)}
                </div>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td class="em-stack-cell" valign="top" width="50%" style="padding-right:8px;">
                <div style="font-size:10.5px;color:#A19E98;margin-bottom:2px;">Plan</div>
                <div style="font-size:13px;font-weight:600;color:#FFFFFF;">${escapeHtml(params.planName)}</div>
              </td>
              <td class="em-stack-cell em-stack-gap" align="right" valign="top" width="50%" style="padding-left:8px;">
                <div style="font-size:10.5px;color:#A19E98;margin-bottom:2px;">Valid until</div>
                <div style="font-size:13px;font-weight:600;color:#FFFFFF;">${escapeHtml(expiryText)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Desktop Activation Instructions -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 24px;border-collapse:separate;border-spacing:0;">
      <tr>
        <td style="background-color:#F6F5F2;border:1px solid #EAE8E3;border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.6;color:#575551;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#171614;margin-bottom:6px;">
            How to activate on Windows
          </div>
          1. Open <strong style="color:#171614;">CogniTara Studio Desktop</strong> on your school host PC.<br />
          2. Open <strong style="color:#171614;">Licence</strong> in the left sidebar.<br />
          3. Paste the licence key above and click <strong style="color:#171614;">Activate licence key</strong>.
        </td>
      </tr>
    </table>

    <!-- Official Payment Receipt Ledger -->
    <div style="font-size:10.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#83807B;margin:0 0 8px;">
      Official Payment Receipt
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;border-spacing:0;border-top:1px solid #ECEAE4;margin:0 0 24px;">
      ${kvRow("School", escapeHtml(params.schoolName), { bold: true })}
      ${kvRow("Licence plan", escapeHtml(params.planName), { bold: true })}
      ${kvRow("Reference", escapeHtml(params.reference), { mono: true })}
      ${kvRow("Payment method", escapeHtml(params.channel))}
      ${params.discountMinor > 0 ? kvRow("Discount / voucher", `-${fmt(params.discountMinor)}`, { mono: true, bold: true }) : ""}
      ${params.feeMinor > 0 ? kvRow("Processing fee", fmt(params.feeMinor), { mono: true }) : ""}
      <tr>
        <td class="em-kv-total-label" style="padding:14px 12px 4px 0;font-size:14px;font-weight:700;color:#171614;border-top:2px solid #171614;">Total paid</td>
        <td align="right" class="em-kv-total-val" style="padding:14px 0 4px;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:17px;font-weight:700;color:#171614;border-top:2px solid #171614;">${fmt(params.amountPaidMinor)}</td>
      </tr>
    </table>

    <!-- Full-Width Mobile-Friendly CTA Buttons -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
      <tr>
        <td align="center" style="padding-bottom:10px;">
          <a href="${escapeHtml(params.receiptUrl)}" target="_blank" class="em-btn" style="display:block;width:100%;box-sizing:border-box;padding:14px 20px;background-color:#171614;color:#FFFFFF;font-size:14px;font-weight:600;text-align:center;text-decoration:none;border-radius:11px;">
            View Licence &amp; Online Receipt &rarr;
          </a>
        </td>
      </tr>
      ${
        params.pdfReceiptUrl
          ? `<tr>
        <td align="center">
          <a href="${escapeHtml(params.pdfReceiptUrl)}" target="_blank" class="em-btn" style="display:block;width:100%;box-sizing:border-box;padding:13px 20px;background-color:#F3F2EE;border:1px solid #DCDAD4;color:#171614;font-size:13.5px;font-weight:600;text-align:center;text-decoration:none;border-radius:11px;">
            Download Official PDF Receipt
          </a>
        </td>
      </tr>`
          : ""
      }
    </table>
  `;

  return renderEmailShell({
    title: `Your CogniTara Licence Key & Receipt (${params.reference})`,
    preheader: `Licence active for ${params.schoolName}. Key: ${params.licenseKey}. Download your official PDF receipt inside.`,
    badgeText: statusTag,
    bodyHtml,
    siteUrl: derivedOrigin,
    footerNote: "Keep this receipt for your school bursary records.",
  });
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
    `CogniTara Licence Active: ${params.schoolName}`,
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
  const trialNote =
    params.trialDays && params.trialDays > 0
      ? `Includes a ${params.trialDays}-day free trial with no card required.`
      : "Activate immediately with any Ed25519 school licence key from cognitara.net/license.";

  const bodyHtml = `
    <h1 class="em-h1" style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:400;line-height:1.22;letter-spacing:-0.02em;color:#171614;">
      Your CogniTara Studio installer is ready
    </h1>
    <p style="margin:0 0 18px;font-size:14.5px;line-height:1.62;color:#575551;">
      Open this email on your school&apos;s Windows PC and click below to download the 64-bit CogniTara Studio setup installer.
    </p>

    <!-- Spec Pills -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 20px;border-collapse:separate;border-spacing:0;">
      <tr>
        <td style="background-color:#F6F5F2;border:1px solid #EAE8E3;border-radius:12px;padding:14px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td class="em-stack-cell" valign="top" width="50%" style="padding-right:8px;">
                <div style="font-size:10.5px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#83807B;margin-bottom:3px;">Platform</div>
                <div style="font-size:13.5px;font-weight:600;color:#171614;">Windows 10 &amp; 11 (64-bit)</div>
              </td>
              <td class="em-stack-cell em-stack-gap" align="right" valign="top" width="50%" style="padding-left:8px;">
                <div style="font-size:10.5px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#83807B;margin-bottom:3px;">Release</div>
                <div style="font-size:13.5px;font-weight:600;color:#171614;">${params.versionLabel ? escapeHtml(params.versionLabel) : "Latest Windows Setup"}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Full-Width Primary CTA -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 20px;">
      <tr>
        <td align="center">
          <a href="${dl}" target="_blank" class="em-btn" style="display:block;width:100%;box-sizing:border-box;padding:14px 20px;background-color:#171614;color:#FFFFFF;font-size:14.5px;font-weight:600;text-align:center;text-decoration:none;border-radius:11px;">
            Download CogniTara Studio${params.versionLabel ? ` (${escapeHtml(params.versionLabel)})` : ""} &rarr;
          </a>
        </td>
      </tr>
    </table>

    <!-- Quick Start Checklist -->
    <p style="margin:0 0 18px;font-size:13.5px;line-height:1.65;color:#575551;">
      Run the single installer, follow the guided setup wizard, and CogniTara Studio will host offline CBT exams for up to 300 student devices on your school Wi-Fi. <strong style="color:#171614;">${escapeHtml(trialNote)}</strong>
    </p>

    <!-- Copyable Direct Link Fallback -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;border-spacing:0;">
      <tr>
        <td style="background-color:#F6F5F2;border:1px solid #EAE8E3;border-radius:12px;padding:12px 14px;">
          <div style="font-size:10.5px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#83807B;margin-bottom:4px;">Direct installer link</div>
          <div style="font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:12px;line-height:1.5;word-break:break-all;">
            <a href="${dl}" target="_blank" style="color:#171614;text-decoration:underline;">${dl}</a>
          </div>
        </td>
      </tr>
    </table>
  `;

  return renderEmailShell({
    title: "Your CogniTara Studio for Windows download link",
    preheader: `Download CogniTara Studio${params.versionLabel ? ` (${params.versionLabel})` : ""} for Windows 10 & 11.`,
    badgeText: "Windows Installer",
    bodyHtml,
    siteUrl: params.siteUrl,
    supportEmail: params.supportEmail,
  });
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
  const subjectPrefix = params.purpose === "hq_2fa" ? `${code}: CogniTara HQ 2FA Security Code` : `${code} is your CogniTara verification code`;
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
