import { NextRequest, NextResponse } from "next/server";
import { resolveSchoolAccountForRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const optional = req.nextUrl.searchParams.get("optional") === "1";
    const account = await resolveSchoolAccountForRequest(req);
    if (!account) {
      if (optional) {
        return NextResponse.json({ ok: false, authenticated: false }, { status: 200 });
      }
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Sign in required." },
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
