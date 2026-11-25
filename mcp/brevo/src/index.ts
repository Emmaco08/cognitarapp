#!/usr/bin/env node
/**
 * CogniTara Brevo MCP Server (Model Context Protocol — stdio transport)
 *
 * Exposes Brevo v3 Transactional Email, OTP Verification, Sender Management,
 * Delivery Events, Templates, and Contacts tools to MCP-compatible AI clients.
 *
 * Environment variables:
 *   BREVO_API_KEY       (required) Brevo v3 API key starting with `xkeysib-...`
 *   BREVO_SENDER_EMAIL  (optional) Default verified sender email address
 *   BREVO_SENDER_NAME   (optional) Default sender display name (default: "CogniTara")
 */

import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BREVO_BASE_URL = "https://api.brevo.com/v3";

function getApiKey(): string {
  const key = (process.env.BREVO_API_KEY || "").trim();
  if (!key) {
    throw new Error(
      "BREVO_API_KEY is not set. Create a v3 API key at https://app.brevo.com/settings/keys/api and set BREVO_API_KEY in your MCP server environment."
    );
  }
  return key;
}

function defaultSender(overrideEmail?: string, overrideName?: string) {
  const email = (overrideEmail || process.env.BREVO_SENDER_EMAIL || "").trim();
  const name = (overrideName || process.env.BREVO_SENDER_NAME || "CogniTara").trim();
  if (!email) {
    throw new Error(
      "Sender email is required. Pass sender_email or set BREVO_SENDER_EMAIL (must be a verified sender at https://app.brevo.com/senders/list)."
    );
  }
  return { email, name };
}

async function brevoFetch<T = unknown>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: Record<string, unknown>
): Promise<T> {
  const apiKey = getApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${BREVO_BASE_URL}${endpoint}`, {
      method,
      signal: controller.signal,
      headers: {
        "api-key": apiKey,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: any = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    if (!res.ok) {
      const detail = parsed?.message || parsed?.code || text || `HTTP ${res.status}`;
      throw new Error(`Brevo API error (${res.status}): ${detail}`);
    }
    return parsed as T;
  } finally {
    clearTimeout(timeout);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildOtpHtml(params: {
  code: string;
  recipientName?: string;
  purpose: string;
  expiresMinutes: number;
  appName: string;
}): string {
  const greeting = params.recipientName ? `Hi ${escapeHtml(params.recipientName)},` : "Hello,";
  const purposeCopy =
    params.purpose === "signin_otp"
      ? "Use the 6-digit security code below to complete your sign-in:"
      : params.purpose === "password_reset"
      ? "Use the 6-digit security code below to reset your password:"
      : "Use the 6-digit verification code below to verify your email address:";

  return `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#111111;color:#f3f3f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#191919;border:1px solid #2b2b2b;border-radius:14px;overflow:hidden;">
    <tr>
      <td style="padding:24px 28px 18px;border-bottom:1px solid #262626;">
        <span style="display:inline-block;font-size:15px;font-weight:700;letter-spacing:-0.02em;color:#ffffff;">${escapeHtml(params.appName)}</span>
        <span style="display:inline-block;margin-left:8px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#8e8e93;">Security Code</span>
      </td>
    </tr>
    <tr>
      <td style="padding:26px 28px;">
        <p style="margin:0 0 10px;font-size:14px;color:#e5e5e7;">${greeting}</p>
        <p style="margin:0 0 22px;font-size:14px;line-height:1.55;color:#a1a1aa;">${purposeCopy}</p>
        <div style="background:#111111;border:1px solid #303036;border-radius:10px;padding:18px 20px;text-align:center;margin:0 0 22px;">
          <span style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:0.28em;color:#ffffff;">${escapeHtml(params.code)}</span>
        </div>
        <p style="margin:0;font-size:12.5px;line-height:1.5;color:#8e8e93;">
          This code expires in <strong style="color:#e5e5e7;">${params.expiresMinutes} minutes</strong> and can only be used once.
          If you didn't request this code, you can safely ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function okResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errResult(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: msg }],
  };
}

const server = new McpServer({
  name: "cognitara-brevo-mcp",
  version: "1.0.0",
});

server.tool(
  "brevo_get_account",
  "Get Brevo account details, plan info, and remaining transactional email credits.",
  {},
  async () => {
    try {
      const data = await brevoFetch("/account", "GET");
      return okResult(data);
    } catch (err) {
      return errResult(err);
    }
  }
);

server.tool(
  "brevo_list_senders",
  "List verified sender email addresses and domains configured in your Brevo account.",
  {},
  async () => {
    try {
      const data = await brevoFetch("/senders", "GET");
      return okResult(data);
    } catch (err) {
      return errResult(err);
    }
  }
);

server.tool(
  "brevo_send_email",
  "Send a transactional email via Brevo v3 SMTP API (/v3/smtp/email).",
  {
    to_email: z.string().email().describe("Recipient email address"),
    to_name: z.string().optional().describe("Recipient display name"),
    subject: z.string().min(1).max(200).describe("Email subject line"),
    html_content: z.string().optional().describe("HTML email body"),
    text_content: z.string().optional().describe("Plain-text fallback body"),
    sender_email: z.string().email().optional().describe("Verified sender email (falls back to BREVO_SENDER_EMAIL)"),
    sender_name: z.string().optional().describe("Sender display name (falls back to BREVO_SENDER_NAME)"),
    tags: z.array(z.string()).optional().describe("Optional Brevo tags for analytics"),
  },
  async (args) => {
    try {
      if (!args.html_content && !args.text_content) {
        throw new Error("Provide at least one of html_content or text_content.");
      }
      const sender = defaultSender(args.sender_email, args.sender_name);
      const payload: Record<string, unknown> = {
        sender,
        to: [{ email: args.to_email, ...(args.to_name ? { name: args.to_name } : {}) }],
        subject: args.subject,
      };
      if (args.html_content) payload.htmlContent = args.html_content;
      if (args.text_content) payload.textContent = args.text_content;
      if (args.tags?.length) payload.tags = args.tags;

      const data = await brevoFetch("/smtp/email", "POST", payload);
      return okResult({ ok: true, sender, to: args.to_email, brevo: data });
    } catch (err) {
      return errResult(err);
    }
  }
);

server.tool(
  "brevo_send_otp",
  "Send a branded 6-digit OTP verification email via Brevo. Generates a secure 6-digit code if not provided.",
  {
    to_email: z.string().email().describe("Recipient email address"),
    to_name: z.string().optional().describe("Recipient name"),
    code: z
      .string()
      .regex(/^\d{6}$/, "Code must be exactly 6 digits")
      .optional()
      .describe("Optional 6-digit code; if omitted, a cryptographically random 6-digit OTP is generated"),
    purpose: z
      .enum(["signup_verify", "signin_otp", "password_reset"])
      .default("signup_verify")
      .describe("OTP authentication flow purpose"),
    expires_minutes: z.number().int().min(1).max(60).default(10),
    app_name: z.string().default("CogniTara Cloud"),
    sender_email: z.string().email().optional(),
    sender_name: z.string().optional(),
  },
  async (args) => {
    try {
      const code = args.code || String(crypto.randomInt(100_000, 1_000_000));
      const sender = defaultSender(args.sender_email, args.sender_name);
      const subject = `${code} is your ${args.app_name} verification code`;
      const htmlContent = buildOtpHtml({
        code,
        recipientName: args.to_name,
        purpose: args.purpose,
        expiresMinutes: args.expires_minutes,
        appName: args.app_name,
      });
      const textContent = `Your ${args.app_name} verification code is ${code}. It expires in ${args.expires_minutes} minutes.`;

      const data = await brevoFetch("/smtp/email", "POST", {
        sender,
        to: [{ email: args.to_email, ...(args.to_name ? { name: args.to_name } : {}) }],
        subject,
        htmlContent,
        textContent,
        tags: ["otp", args.purpose],
      });
      return okResult({
        ok: true,
        to_email: args.to_email,
        purpose: args.purpose,
        expires_minutes: args.expires_minutes,
        code,
        brevo: data,
      });
    } catch (err) {
      return errResult(err);
    }
  }
);

server.tool(
  "brevo_get_email_events",
  "Fetch recent transactional email delivery/open/bounce events from Brevo.",
  {
    email: z.string().email().optional().describe("Filter events by recipient email"),
    limit: z.number().int().min(1).max(100).default(20),
    event: z
      .enum(["bounces", "hardBounces", "softBounces", "delivered", "spam", "requests", "opened", "clicks", "blocked", "error"])
      .optional(),
  },
  async (args) => {
    try {
      const qs = new URLSearchParams({ limit: String(args.limit) });
      if (args.email) qs.set("email", args.email);
      if (args.event) qs.set("event", args.event);
      const data = await brevoFetch(`/smtp/statistics/events?${qs.toString()}`, "GET");
      return okResult(data);
    } catch (err) {
      return errResult(err);
    }
  }
);

server.tool(
  "brevo_list_templates",
  "List transactional email templates in Brevo.",
  {
    limit: z.number().int().min(1).max(100).default(25),
    template_status: z.boolean().optional().describe("Filter by active (true) or inactive (false) templates"),
  },
  async (args) => {
    try {
      const qs = new URLSearchParams({ limit: String(args.limit) });
      if (args.template_status !== undefined) qs.set("templateStatus", String(args.template_status));
      const data = await brevoFetch(`/smtp/templates?${qs.toString()}`, "GET");
      return okResult(data);
    } catch (err) {
      return errResult(err);
    }
  }
);

server.tool(
  "brevo_list_contacts",
  "List contacts in Brevo CRM.",
  {
    limit: z.number().int().min(1).max(100).default(25),
    offset: z.number().int().min(0).default(0),
  },
  async (args) => {
    try {
      const qs = new URLSearchParams({ limit: String(args.limit), offset: String(args.offset) });
      const data = await brevoFetch(`/contacts?${qs.toString()}`, "GET");
      return okResult(data);
    } catch (err) {
      return errResult(err);
    }
  }
);

server.tool(
  "brevo_upsert_contact",
  "Create or update a school/user contact in Brevo CRM.",
  {
    email: z.string().email(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    school_name: z.string().optional(),
    list_ids: z.array(z.number().int().positive()).optional(),
  },
  async (args) => {
    try {
      const attributes: Record<string, string> = {};
      if (args.first_name) attributes.FIRSTNAME = args.first_name;
      if (args.last_name) attributes.LASTNAME = args.last_name;
      if (args.school_name) attributes.COMPANY = args.school_name;
      const payload: Record<string, unknown> = {
        email: args.email,
        updateEnabled: true,
      };
      if (Object.keys(attributes).length > 0) payload.attributes = attributes;
      if (args.list_ids?.length) payload.listIds = args.list_ids;
      const data = await brevoFetch("/contacts", "POST", payload);
      return okResult({ ok: true, email: args.email, brevo: data });
    } catch (err) {
      return errResult(err);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Brevo MCP Server fatal error:", err);
  process.exit(1);
});
