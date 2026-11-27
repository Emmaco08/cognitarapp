import { NextRequest, NextResponse } from "next/server";
import { clearPortalCookie } from "@/lib/portal-auth";
import { clearSessionCookie, extractBearerOrCookieToken, hashSessionToken } from "@/lib/auth";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const cloudToken = extractBearerOrCookieToken(req);
    if (cloudToken) {
      const sql = getSql();
      const tokenHash = hashSessionToken(cloudToken);
      await sql`UPDATE cloud_sessions SET revoked_at = NOW() WHERE token_hash = ${tokenHash}`;
    }
  } catch {
    // non-fatal
  }
  const res = NextResponse.json({ ok: true });
  clearPortalCookie(res, req);
  clearSessionCookie(res, req);
  return res;
}
