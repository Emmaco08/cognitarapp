import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";
import { getPlatformSettings, paystackRequest } from "@/lib/platform";
import { fulfillConfirmedPaystackPayment, VerificationCheck } from "@/lib/paystack-fulfill";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const token = extractBearerOrCookieToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "Sign in required." }, { status: 401 });
    }
    const account = await resolveAuthenticatedAccount(token);
    if (!account) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "Session expired." }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const reference = String(body?.reference || "").trim();
    if (!reference) {
      return NextResponse.json({ ok: false, error: "missing_reference", message: "Payment reference is required." }, { status: 400 });
    }

    const sql = getSql();
    const isHq = account.user.role === "hq_super_admin" || account.user.role === "hq_admin";
    const rows = isHq
      ? await sql`
          SELECT sp.*, p.display_name AS plan_name, p.slug AS plan_slug, s.school_name
          FROM subscriptions_payments sp
          JOIN plans p ON p.id = sp.plan_id
          JOIN schools s ON s.id = sp.school_id
          WHERE sp.paystack_reference = ${reference}
          LIMIT 1
        `
      : await sql`
          SELECT sp.*, p.display_name AS plan_name, p.slug AS plan_slug, s.school_name
          FROM subscriptions_payments sp
          JOIN plans p ON p.id = sp.plan_id
          JOIN schools s ON s.id = sp.school_id
          WHERE sp.paystack_reference = ${reference} AND sp.user_id = ${account.user.id}::uuid
          LIMIT 1
        `;

    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "payment_not_found", message: "Transaction reference not found." }, { status: 404 });
    }
    const pay = rows[0] as Record<string, any>;

    // If already fulfilled, return the existing confirmed receipt & signed license immediately
    if (pay.status === "success") {
      const existingLic = await sql`
        SELECT id, license_key, plan_tier, status, issued_at, expires_at, signed_lease_json
        FROM licenses WHERE latest_payment_id = ${pay.id}::uuid LIMIT 1
      `;
      if (existingLic.length) {
        return NextResponse.json({
          ok: true,
          status: "success",
          already_verified: true,
          message: "Payment confirmed! Your CogniTara licence is active.",
          receipt: {
            reference: pay.paystack_reference,
            school_name: pay.school_name,
            plan_name: pay.plan_name,
            currency: String(pay.currency || "NGN").trim(),
            original_amount_minor: Number(pay.original_amount_minor || pay.amount_minor || 0),
            discount_amount_minor: Number(pay.discount_amount_minor || 0),
            amount_minor: Number(pay.amount_minor || 0),
            fee_minor: Number(pay.fee_minor || 0),
            customer_paid_minor: Number(pay.customer_paid_minor || pay.amount_minor || 0),
            promo_code: pay.promo_code_text || null,
            channel: pay.paystack_sub_channel ? `Paystack · ${pay.paystack_sub_channel}` : "Paystack",
            is_test: Boolean(pay.is_test),
            paid_at: pay.paid_at,
          },
          license: existingLic[0],
          signed_lease: (existingLic[0] as any).signed_lease_json || null,
        });
      }
    }

    const settings = await getPlatformSettings();
    const secretKey = pay.is_test
      ? settings.paystack_test_secret_key || settings.paystack_secret_key
      : settings.paystack_live_secret_key || settings.paystack_secret_key;

    const psRes = await paystackRequest(
      secretKey,
      `/transaction/verify/${encodeURIComponent(reference)}`,
      "GET"
    );

    if (!psRes.ok || !psRes.data?.data) {
      return NextResponse.json(
        { ok: false, status: "pending", error: "paystack_verify_failed", message: psRes.data?.message || "Payment not confirmed yet." },
        { status: 400 }
      );
    }

    const tx = psRes.data.data;
    const nowIso = new Date().toISOString();
    const checks: VerificationCheck[] = [
      {
        step: "Paystack API verified",
        ok: true,
        detail: `Transaction #${tx.id || "n/a"} (${tx.domain === "test" ? "Test" : "Live"})`,
        at: nowIso,
      },
    ];

    if (tx.status !== "success") {
      if (tx.status === "failed" || tx.status === "abandoned") {
        checks.push({ step: "Transaction status", ok: false, detail: `Paystack status: ${tx.status}`, at: nowIso });
        await sql`
          UPDATE subscriptions_payments
          SET status = CASE WHEN ${tx.status === "failed"} THEN 'failed' ELSE status END,
              paystack_sub_channel = COALESCE(${tx.channel || null}, paystack_sub_channel),
              verification_checks_json = ${JSON.stringify(checks)}::jsonb
          WHERE id = ${pay.id}::uuid AND status = 'initialized'
        `;
      }
      return NextResponse.json(
        {
          ok: false,
          status: tx.status || "pending",
          message: `Paystack status: ${tx.status || "pending"}. Complete checkout and try verifying again.`,
        },
        { status: 400 }
      );
    }

    // Strict server-side currency & amount verification!
    const expectedCurrency = String(pay.currency || "NGN").trim().toUpperCase();
    const actualCurrency = String(tx.currency || "").trim().toUpperCase();
    if (actualCurrency && actualCurrency !== expectedCurrency) {
      return NextResponse.json(
        { ok: false, error: "currency_mismatch", message: `Payment currency (${actualCurrency}) does not match expected (${expectedCurrency}).` },
        { status: 400 }
      );
    }

    const expectedMinMinor = Number(pay.customer_paid_minor || pay.amount_minor || 0);
    if (Number(tx.amount || 0) < expectedMinMinor) {
      return NextResponse.json(
        { ok: false, error: "amount_mismatch", message: "Verified Paystack amount does not match expected order total." },
        { status: 400 }
      );
    }

    checks.push({
      step: "Status, amount & currency matched",
      ok: true,
      detail: `${actualCurrency || expectedCurrency} ${(Number(tx.amount) / 100).toLocaleString()} via ${tx.channel || "paystack"}`,
      at: nowIso,
    });

    const fulfilled = await fulfillConfirmedPaystackPayment({
      paymentId: pay.id,
      paystackTransactionId: tx.id ? Number(tx.id) : null,
      customerCode: tx.customer?.customer_code || null,
      authorizationSig: tx.authorization?.signature || null,
      paystackSubChannel: tx.channel || null,
      paystackFeeMinor: tx.fees !== undefined ? Number(tx.fees) : null,
      customerPaidMinor: tx.amount !== undefined ? Number(tx.amount) : null,
      isTest: tx.domain === "test" || Boolean(pay.is_test),
      verificationChecks: checks,
      rawPayload: tx,
      hwidHash: body?.hwid_hash ? String(body.hwid_hash).trim() : null,
      displayHwid: body?.display_hwid ? String(body.display_hwid).trim() : null,
      hwComponentHashes:
        body?.hw_component_hashes && typeof body.hw_component_hashes === "object"
          ? (body.hw_component_hashes as Record<string, string>)
          : null,
      machineHostname: body?.machine_hostname ? String(body.machine_hostname).trim() : null,
      osVersion: body?.os_version ? String(body.os_version).trim() : null,
      ipAddress: getClientIp(req),
      originUrl: req.nextUrl.origin,
    });

    return NextResponse.json({
      ok: true,
      status: "success",
      message: "Payment confirmed! Your CogniTara licence has been issued.",
      receipt: {
        reference: pay.paystack_reference,
        school_name: pay.school_name,
        plan_name: pay.plan_name,
        currency: expectedCurrency,
        original_amount_minor: Number(pay.original_amount_minor || pay.amount_minor || 0),
        discount_amount_minor: Number(pay.discount_amount_minor || 0),
        amount_minor: Number(pay.amount_minor || 0),
        fee_minor: Number(fulfilled.payment.fee_minor || tx.fees || 0),
        customer_paid_minor: Number(fulfilled.payment.customer_paid_minor || tx.amount || pay.amount_minor || 0),
        promo_code: pay.promo_code_text || null,
        channel: tx.channel ? `Paystack · ${tx.channel}` : "Paystack",
        is_test: Boolean(fulfilled.payment.is_test),
        paid_at: fulfilled.payment.paid_at,
      },
      license: {
        id: fulfilled.license.id,
        license_key: fulfilled.license.license_key,
        plan_tier: fulfilled.license.plan_tier,
        status: fulfilled.license.status,
        issued_at: fulfilled.license.issued_at,
        expires_at: fulfilled.license.expires_at,
      },
      signed_lease: fulfilled.signed_lease,
    });
  } catch (err) {
    console.error("Paystack verify error:", err);
    return NextResponse.json({ ok: false, error: "verify_failed", message: "Verification error. Please retry." }, { status: 500 });
  }
}
