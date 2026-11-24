import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { clearSessionCookie, extractBearerOrCookieToken, hashSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const token = extractBearerOrCookieToken(req);
    if (token) {
      const sql = getSql();
      const tokenHash = hashSessionToken(token);
      await sql`UPDATE cloud_sessions SET revoked_at = NOW() WHERE token_hash = ${tokenHash}`;
    }
    const res = NextResponse.json({ ok: true });
    clearSessionCookie(res);
    return res;
  } catch (err) {
    console.error("Sign-out error:", err);
    const res = NextResponse.json({ ok: true });
    clearSessionCookie(res);
    return res;
  }
}
