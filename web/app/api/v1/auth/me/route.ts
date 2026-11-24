import { NextRequest, NextResponse } from "next/server";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = extractBearerOrCookieToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "Not signed in." }, { status: 401 });
    }

    const account = await resolveAuthenticatedAccount(token);
    if (!account) {
      return NextResponse.json(
        { ok: false, error: "session_expired", message: "Your session has expired. Please sign in again." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      ok: true,
      server_utc: Math.floor(Date.now() / 1000),
      user: account.user,
      school: account.school,
      referral_code: account.referral_code,
      licenses: account.licenses,
    });
  } catch (err) {
    console.error("Auth /me error:", err);
    return NextResponse.json({ ok: false, error: "auth_check_failed" }, { status: 500 });
  }
}
