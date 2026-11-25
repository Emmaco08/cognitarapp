import crypto from "node:crypto";
import { getSql } from "./db";
import {
  decryptSecret,
  generateLicenseKey,
  maskSecretKey,
  signLicenseLease,
} from "./crypto";

export interface PlatformSettingsRow {
  paystack_public_key: string;
  paystack_secret_key: string;
  paystack_secret_masked: string;
  paystack_secret_configured: boolean;
  paystack_mode: "test" | "live";
  brevo_api_key: string;
  brevo_api_key_masked: string;
  brevo_configured: boolean;
  brevo_sender_email: string;
  brevo_sender_name: string;
  require_email_otp: boolean;
  default_currency: string;
  maintenance_mode: boolean;
  maintenance_message: string;
  min_desktop_version: string;
  global_announcement: string;
  global_announcement_level: string;
  allow_self_signup: boolean;
  allow_paystack_checkout: boolean;
  allow_trial_activation: boolean;
  updated_at: string | null;
}

export async function getPlatformSettings(): Promise<PlatformSettingsRow> {
  const sql = getSql();
  await sql`INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
  const rows = await sql`SELECT * FROM platform_settings WHERE id = 1 LIMIT 1`;
  const r = (rows[0] || {}) as Record<string, any>;
  const decryptedSecret = decryptSecret(r.paystack_secret_key_enc) || (process.env.PAYSTACK_SECRET_KEY || "").trim();
  const publicKey = String(r.paystack_public_key || process.env.PAYSTACK_PUBLIC_KEY || "").trim();
  const decryptedBrevo = decryptSecret(r.brevo_api_key_enc) || (process.env.BREVO_API_KEY || "").trim();
  const brevoSenderEmail = String(r.brevo_sender_email || process.env.BREVO_SENDER_EMAIL || "noreply@cognitara.net").trim();
  const brevoSenderName = String(r.brevo_sender_name || process.env.BREVO_SENDER_NAME || "CogniTara Cloud").trim();

  return {
    paystack_public_key: publicKey,
    paystack_secret_key: decryptedSecret,
    paystack_secret_masked: maskSecretKey(decryptedSecret),
    paystack_secret_configured: Boolean(decryptedSecret),
    paystack_mode: r.paystack_mode === "live" ? "live" : "test",
    brevo_api_key: decryptedBrevo,
    brevo_api_key_masked: maskSecretKey(decryptedBrevo),
    brevo_configured: Boolean(decryptedBrevo),
    brevo_sender_email: brevoSenderEmail,
    brevo_sender_name: brevoSenderName,
    require_email_otp: Boolean(r.require_email_otp),
    default_currency: String(r.default_currency || "NGN").trim().toUpperCase(),
    maintenance_mode: Boolean(r.maintenance_mode),
    maintenance_message: String(r.maintenance_message || ""),
    min_desktop_version: String(r.min_desktop_version || "2.0.0"),
    global_announcement: String(r.global_announcement || ""),
    global_announcement_level: String(r.global_announcement_level || "info"),
    allow_self_signup: r.allow_self_signup !== false,
    allow_paystack_checkout: r.allow_paystack_checkout !== false,
    allow_trial_activation: r.allow_trial_activation !== false,
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  };
}

export function toPublicPlatformDirectives(s: PlatformSettingsRow) {
  return {
    maintenance_mode: s.maintenance_mode,
    maintenance_message: s.maintenance_message,
    min_desktop_version: s.min_desktop_version,
    global_announcement: s.global_announcement,
    global_announcement_level: s.global_announcement_level,
    allow_self_signup: s.allow_self_signup,
    allow_paystack_checkout: s.allow_paystack_checkout && Boolean(s.paystack_public_key && s.paystack_secret_configured),
    allow_trial_activation: s.allow_trial_activation,
    require_email_otp: s.require_email_otp && s.brevo_configured,
    paystack_public_key: s.paystack_public_key,
    paystack_mode: s.paystack_mode,
    default_currency: s.default_currency,
  };
}

export async function logDeveloperAudit(params: {
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO developer_audit_logs (
        actor_user_id, actor_email, action, target_type, target_id, ip_address, details_json
      ) VALUES (
        ${params.actorUserId || null}::uuid,
        ${params.actorEmail || null},
        ${params.action},
        ${params.targetType || null},
        ${params.targetId || null},
        ${params.ipAddress || null},
        ${JSON.stringify(params.details || {})}::jsonb
      )
    `;
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

export async function paystackRequest<T = any>(
  secretKey: string,
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: T & { status?: boolean; message?: string } }> {
  if (!secretKey) {
    return {
      ok: false,
      status: 400,
      data: { status: false, message: "Paystack secret key is not configured yet. Add it in HQ Developer Settings." } as any,
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`https://api.paystack.co${endpoint}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && Boolean(data?.status), status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: { status: false, message: err instanceof Error ? err.message : "Could not reach Paystack API." } as any,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export interface PromoEvalResult {
  valid: boolean;
  error?: string;
  message?: string;
  promo?: Record<string, any>;
  code_type?: "discount" | "redeem";
  original_amount_minor?: number;
  discount_amount_minor?: number;
  final_amount_minor?: number;
  grant_plan?: Record<string, any> | null;
}

export async function evaluatePromoCode(params: {
  rawCode: string;
  planId?: string | null;
  currency?: string;
  schoolId?: string | null;
}): Promise<PromoEvalResult> {
  const code = String(params.rawCode || "").trim().toUpperCase();
  if (!code) {
    return { valid: false, error: "empty_code", message: "Please enter a code." };
  }

  const sql = getSql();
  const rows = await sql`
    SELECT p.*, gp.slug AS grant_plan_slug, gp.display_name AS grant_plan_name,
           gp.duration_days AS grant_plan_duration_days, gp.plan_tier AS grant_plan_tier,
           gp.lease_days AS grant_plan_lease_days, gp.max_devices AS grant_plan_max_devices
    FROM promo_codes p
    LEFT JOIN plans gp ON gp.id = p.grant_plan_id
    WHERE UPPER(p.code) = ${code}
    LIMIT 1
  `;

  if (!rows.length) {
    return { valid: false, error: "code_not_found", message: "Invalid code. Check the spelling and try again." };
  }

  const promo = rows[0] as Record<string, any>;
  if (!promo.is_active) {
    return { valid: false, error: "code_inactive", message: "This code is no longer active." };
  }
  if (promo.expires_at && new Date(promo.expires_at).getTime() <= Date.now()) {
    return { valid: false, error: "code_expired", message: "This code has expired." };
  }
  if (promo.max_uses !== null && Number(promo.uses_count) >= Number(promo.max_uses)) {
    return { valid: false, error: "code_exhausted", message: "This code has reached its redemption limit." };
  }

  if (params.schoolId && promo.per_school_limit) {
    const used = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM promo_redemptions
      WHERE promo_code_id = ${promo.id}::uuid AND school_id = ${params.schoolId}::uuid
    `;
    if (Number(used[0]?.cnt || 0) >= Number(promo.per_school_limit)) {
      return { valid: false, error: "already_redeemed", message: "Your school has already used this code." };
    }
  }

  if (promo.code_type === "redeem") {
    return {
      valid: true,
      promo,
      code_type: "redeem",
      original_amount_minor: 0,
      discount_amount_minor: 0,
      final_amount_minor: 0,
      grant_plan: promo.grant_plan_id
        ? {
            id: promo.grant_plan_id,
            slug: promo.grant_plan_slug,
            display_name: promo.grant_plan_name,
            duration_days: promo.grant_duration_days ?? promo.grant_plan_duration_days,
            plan_tier: promo.grant_plan_tier || "annual",
            lease_days: promo.grant_plan_lease_days || 30,
            max_devices: promo.grant_plan_max_devices || 1,
          }
        : null,
      message: `Valid redeem voucher: grants ${promo.grant_plan_name || "CogniTara Licence"}${
        promo.grant_duration_days ? ` (${promo.grant_duration_days} days)` : ""
      }.`,
    };
  }

  // Discount code path
  const currency = (params.currency || "NGN").toUpperCase();
  if (!params.planId) {
    return { valid: false, error: "plan_required", message: "Select a plan to apply this discount code." };
  }

  const applicableIds: string[] = Array.isArray(promo.applicable_plan_ids) ? promo.applicable_plan_ids : [];
  if (applicableIds.length > 0 && !applicableIds.includes(params.planId)) {
    return { valid: false, error: "plan_not_eligible", message: "This discount code does not apply to the selected plan." };
  }

  const planRows = await sql`SELECT * FROM plans WHERE id = ${params.planId}::uuid AND is_active = TRUE LIMIT 1`;
  if (!planRows.length) {
    return { valid: false, error: "plan_not_found", message: "Selected plan is unavailable." };
  }
  const plan = planRows[0] as Record<string, any>;
  const origMinor = Number(currency === "USD" ? plan.price_usd_cents : plan.price_ngn_kobo);
  const val = Number(promo.discount_value || 0);
  let discountMinor = 0;

  if (promo.discount_kind === "percent") {
    discountMinor = Math.round((origMinor * Math.min(100, Math.max(0, val))) / 100);
  } else if (promo.discount_kind === "fixed_ngn" && currency === "NGN") {
    discountMinor = Math.round(val * 100);
  } else if (promo.discount_kind === "fixed_usd" && currency === "USD") {
    discountMinor = Math.round(val * 100);
  } else {
    return {
      valid: false,
      error: "currency_mismatch",
      message: `This fixed discount code only applies to ${promo.discount_kind === "fixed_usd" ? "USD" : "NGN"} checkout.`,
    };
  }

  discountMinor = Math.min(origMinor, Math.max(0, discountMinor));
  const finalMinor = Math.max(0, origMinor - discountMinor);

  return {
    valid: true,
    promo,
    code_type: "discount",
    original_amount_minor: origMinor,
    discount_amount_minor: discountMinor,
    final_amount_minor: finalMinor,
    message:
      promo.discount_kind === "percent"
        ? `${val}% discount applied!`
        : `Discount of ${(discountMinor / 100).toLocaleString()} ${currency} applied!`,
  };
}

/**
 * Generates and persists a real Ed25519-signed CogniTara license for a school,
 * optionally bound to a specific machine HWID right away so Desktop activates in 1 click.
 */
export async function issueSignedLicenseForSchool(params: {
  schoolId: string;
  planId: string;
  paymentId?: string | null;
  durationDaysOverride?: number | null;
  bonusDays?: number;
  hwidHash?: string | null;
  displayHwid?: string | null;
  hwComponentHashes?: Record<string, string> | null;
  machineHostname?: string | null;
  osVersion?: string | null;
}): Promise<{
  license: Record<string, any>;
  signed_lease: { payload: Record<string, unknown>; ed25519_sig: string } | null;
}> {
  const sql = getSql();
  const schoolRows = await sql`SELECT id, school_name FROM schools WHERE id = ${params.schoolId}::uuid LIMIT 1`;
  if (!schoolRows.length) throw new Error("School not found.");
  const school = schoolRows[0] as Record<string, any>;

  const planRows = await sql`SELECT * FROM plans WHERE id = ${params.planId}::uuid LIMIT 1`;
  if (!planRows.length) throw new Error("Plan not found.");
  const plan = planRows[0] as Record<string, any>;

  const licenseId = crypto.randomUUID();
  const licenseKey = generateLicenseKey();
  const now = new Date();
  const issuedAtIso = now.toISOString().replace(/\.\d{3}Z$/, "Z");

  const baseDays =
    params.durationDaysOverride !== undefined ? params.durationDaysOverride : plan.duration_days;
  const totalDays = baseDays === null || baseDays === undefined ? null : Math.max(1, Number(baseDays) + Number(params.bonusDays || 0));
  const expiresAtIso =
    totalDays === null
      ? null
      : new Date(now.getTime() + totalDays * 86400 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const paidDurationSeconds = totalDays === null ? null : totalDays * 86400;
  const leaseSeconds = Math.max(1, Number(plan.lease_days || 30)) * 86400;
  const planTier = String(plan.plan_tier || plan.billing_cycle || "annual").toLowerCase();
  const maxDevices = Math.max(1, Number(plan.max_devices || 1));

  const cleanHwid = params.hwidHash && /^[0-9a-f]{64}$/i.test(params.hwidHash) ? params.hwidHash.toLowerCase() : null;
  const leaseEnvelope = signLicenseLease({
    licenseId,
    licenseKey,
    schoolName: school.school_name,
    planTier,
    planSlug: plan.slug,
    planName: plan.display_name,
    hwidHash: cleanHwid || "0".repeat(64),
    hwComponentHashes: params.hwComponentHashes || null,
    issuedAtIso,
    expiresAtIso,
    paidDurationSeconds,
    leaseSeconds,
  });

  const status = cleanHwid ? "active" : "issued";
  const inserted = await sql`
    INSERT INTO licenses (
      id, license_key, school_id, plan_id, latest_payment_id, plan_tier, status,
      issued_at, expires_at, bonus_days_total, lease_seconds, max_activations,
      signed_lease_json, ed25519_sig
    ) VALUES (
      ${licenseId}::uuid,
      ${licenseKey},
      ${params.schoolId}::uuid,
      ${params.planId}::uuid,
      ${params.paymentId || null}::uuid,
      ${planTier},
      ${status},
      ${issuedAtIso}::timestamptz,
      ${expiresAtIso}::timestamptz,
      ${Number(params.bonusDays || 0)},
      ${leaseSeconds},
      ${maxDevices},
      ${JSON.stringify(leaseEnvelope)}::jsonb,
      ${leaseEnvelope.ed25519_sig}
    )
    RETURNING *
  `;

  if (cleanHwid) {
    await sql`
      INSERT INTO license_activations (
        license_id, hwid_hash, display_hwid, machine_hostname, os_version, hw_components_json, is_active
      ) VALUES (
        ${licenseId}::uuid,
        ${cleanHwid},
        ${params.displayHwid || `CT-HWID-${cleanHwid.slice(0, 12).toUpperCase()}`},
        ${params.machineHostname || null},
        ${params.osVersion || null},
        ${JSON.stringify(params.hwComponentHashes || {})}::jsonb,
        TRUE
      )
      ON CONFLICT DO NOTHING
    `;
  }

  return {
    license: inserted[0] as Record<string, any>,
    signed_lease: cleanHwid ? leaseEnvelope : null,
  };
}
