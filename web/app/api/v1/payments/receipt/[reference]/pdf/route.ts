import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";
import { generatePaymentReceiptPdf } from "@/lib/receipt-pdf";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { hasValidReceiptAccess } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ reference: string }> }
) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`receipt-pdf:${ip}`, 25, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, message: "Too many PDF downloads. Try again shortly." }, { status: 429 });
    }

    const { reference: rawRef } = await context.params;
    const reference = decodeURIComponent(String(rawRef || "")).trim();
    if (!reference || reference.length > 96) {
      return NextResponse.json({ ok: false, message: "Valid payment reference required." }, { status: 400 });
    }

    const sql = getSql();
    const token = extractBearerOrCookieToken(req);
    const account = token ? await resolveAuthenticatedAccount(token) : null;

    const rows = await sql`
      SELECT
        sp.*,
        p.display_name AS plan_name,
        s.school_name,
        u.email AS owner_email
      FROM subscriptions_payments sp
      JOIN plans p ON p.id = sp.plan_id
      JOIN schools s ON s.id = sp.school_id
      JOIN users_hq u ON u.id = sp.user_id
      WHERE sp.paystack_reference = ${reference}
      LIMIT 1
    `;
    if (!rows.length) {
      return NextResponse.json({ ok: false, message: "Receipt not found." }, { status: 404 });
    }
    const pay = rows[0] as Record<string, any>;

    const isOwnerOrHq =
      Boolean(account) &&
      (account!.user.id === pay.user_id ||
        account!.user.role === "hq_super_admin" ||
        account!.user.role === "hq_admin");
    const hasSignedToken = hasValidReceiptAccess(req, reference);

    if (!isOwnerOrHq && !hasSignedToken) {
      return NextResponse.json({ ok: false, message: "Unauthorized receipt download." }, { status: 403 });
    }
    if (pay.status !== "success") {
      return NextResponse.json({ ok: false, message: "Receipt PDF is available once payment is confirmed." }, { status: 409 });
    }

    const lics = await sql`
      SELECT license_key, expires_at
      FROM licenses
      WHERE latest_payment_id = ${pay.id}::uuid
      LIMIT 1
    `;
    const lic = (lics[0] as Record<string, any>) || null;

    const pdfBytes = generatePaymentReceiptPdf({
      reference: String(pay.paystack_reference),
      schoolName: String(pay.buyer_school_name || pay.school_name || "School"),
      email: String(pay.buyer_email || pay.owner_email || ""),
      planName: String(pay.plan_name || "CogniTara Licence"),
      currency: String(pay.currency || "NGN").trim(),
      originalAmountMinor: Number(pay.original_amount_minor || pay.amount_minor || 0),
      discountAmountMinor: Number(pay.discount_amount_minor || 0),
      amountMinor: Number(pay.amount_minor || 0),
      feeMinor: Number(pay.fee_minor || 0),
      customerPaidMinor: Number(pay.customer_paid_minor ?? pay.amount_minor ?? 0),
      promoCode: pay.promo_code_text || null,
      channel: pay.paystack_sub_channel
        ? `Paystack (${pay.paystack_sub_channel})`
        : pay.payment_channel === "redeem_code"
        ? "100% Free Voucher"
        : "Paystack",
      isTest: Boolean(pay.is_test),
      paidAt: pay.paid_at ? new Date(pay.paid_at).toISOString() : new Date(pay.created_at).toISOString(),
      licenseKey: lic?.license_key ? String(lic.license_key) : null,
      expiresAt: lic?.expires_at ? new Date(lic.expires_at).toISOString() : null,
    });

    const safeFilename = `CogniTara-Receipt-${reference.replace(/[^A-Za-z0-9_-]/g, "")}.pdf`;
    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Content-Length": String(pdfBytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("Receipt PDF generation error:", err);
    return NextResponse.json({ ok: false, message: "Could not generate PDF receipt." }, { status: 500 });
  }
}
