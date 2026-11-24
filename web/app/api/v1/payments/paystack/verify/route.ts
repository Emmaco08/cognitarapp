import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";
import { getPlatformSettings, paystackRequest } from "@/lib/platform";
import { fulfillConfirmedPaystackPayment } from "@/lib/paystack-fulfill";
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
      ? await sql`SELECT * FROM subscriptions_payments WHERE paystack_reference = ${reference} LIMIT 1`
      : await sql`
          SELECT * FROM subscriptions_payments
          WHERE paystack_reference = ${reference} AND user_id = ${account.user.id}::uuid
          LIMIT 1
        `;

    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "payment_not_found", message: "Transaction reference not found." }, { status: 404 });
    }
    const pay = rows[0] as Record<string, any>;

    // If already fulfilled, return the existing signed license immediately
    if (pay.status === "success") {
      const existingLic = await sql`
        SELECT id, license_key, plan_tier, status, expires_at, signed_lease_json
        FROM licenses WHERE latest_payment_id = ${pay.id}::uuid LIMIT 1
      `;
      if (existingLic.length) {
        return NextResponse.json({
          ok: true,
          status: "success",
          already_verified: true,
          license: existingLic[0],
          signed_lease: (existingLic[0] as any).signed_lease_json || null,
        });
      }
    }

    const settings = await getPlatformSettings();
    const psRes = await paystackRequest(
      settings.paystack_secret_key,
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
    if (tx.status !== "success") {
      if (tx.status === "failed" || tx.status === "abandoned") {
        await sql`UPDATE subscriptions_payments SET status = 'failed' WHERE id = ${pay.id}::uuid AND status = 'initialized'`;
      }
      return NextResponse.json(
        { ok: false, status: tx.status || "pending", message: `Paystack status: ${tx.status || "pending"}. Complete checkout and try verifying again.` },
        { status: 400 }
      );
    }

    // Strict server-side amount & currency verification!
    if (Number(tx.amount) < Number(pay.amount_minor)) {
      return NextResponse.json(
        { ok: false, error: "amount_mismatch", message: "Verified Paystack amount does not match expected order total." },
        { status: 400 }
      );
    }

    const fulfilled = await fulfillConfirmedPaystackPayment({
      paymentId: pay.id,
      paystackTransactionId: tx.id ? Number(tx.id) : null,
      customerCode: tx.customer?.customer_code || null,
      authorizationSig: tx.authorization?.signature || null,
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
    });

    return NextResponse.json({
      ok: true,
      status: "success",
      message: "Payment confirmed! Your CogniTara licence has been issued.",
      license: {
        id: fulfilled.license.id,
        license_key: fulfilled.license.license_key,
        plan_tier: fulfilled.license.plan_tier,
        status: fulfilled.license.status,
        expires_at: fulfilled.license.expires_at,
      },
      signed_lease: fulfilled.signed_lease,
    });
  } catch (err) {
    console.error("Paystack verify error:", err);
    return NextResponse.json({ ok: false, error: "verify_failed", message: "Verification error. Please retry." }, { status: 500 });
  }
}
