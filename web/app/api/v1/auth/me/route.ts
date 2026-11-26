import { NextRequest, NextResponse } from "next/server";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const optional = req.nextUrl.searchParams.get("optional") === "1";
    const token = extractBearerOrCookieToken(req);
    if (!token) {
      if (optional) {
        return NextResponse.json({ ok: false, authenticated: false }, { status: 200 });
      }
      return NextResponse.json({ ok: false, error: "unauthorized", message: "Not signed in." }, { status: 401 });
    }

    const account = await resolveAuthenticatedAccount(token);
    if (!account) {
      if (optional) {
        return NextResponse.json({ ok: false, authenticated: false }, { status: 200 });
      }
      return NextResponse.json(
        { ok: false, error: "session_expired", message: "Your session has expired or was signed out by CogniTara HQ." },
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
      directives: account.directives,
    });
  } catch (err) {
    console.error("Auth /me error:", err);
    return NextResponse.json({ ok: false, error: "auth_check_failed" }, { status: 500 });
  }
}
