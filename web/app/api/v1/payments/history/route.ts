import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { resolveSchoolAccountForRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const account = await resolveSchoolAccountForRequest(req);
    if (!account || !account.school) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "Sign in required." }, { status: 401 });
    }

    const sql = getSql();
    const payments = await sql`
      SELECT
        sp.id, sp.paystack_reference, sp.currency, sp.amount_minor,
        sp.original_amount_minor, sp.discount_amount_minor, sp.fee_minor,
        sp.customer_paid_minor, sp.promo_code_text, sp.payment_channel,
        sp.paystack_sub_channel, sp.is_test, sp.status, sp.paid_at, sp.created_at,
        p.display_name AS plan_name, p.slug AS plan_slug,
        l.license_key, l.expires_at AS license_expires_at, l.status AS license_status
      FROM subscriptions_payments sp
      JOIN plans p ON p.id = sp.plan_id
      LEFT JOIN licenses l ON l.latest_payment_id = sp.id
      WHERE sp.school_id = ${account.school.id}::uuid
      ORDER BY sp.created_at DESC
      LIMIT 50
    `;

    return NextResponse.json({ ok: true, payments });
  } catch (err) {
    console.error("Payment history error:", err);
    return NextResponse.json({ ok: false, error: "history_failed" }, { status: 500 });
  }
}
