import { NextRequest, NextResponse } from "next/server";
import { requireHqAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Lightweight HQ session probe so /hq renders the sign-in gate cleanly
 * without firing an unauthenticated 403 error into the browser console.
 */
export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: true, authenticated: false });
    }
    return NextResponse.json({
      ok: true,
      authenticated: true,
      email: hq.user.email,
      full_name: hq.user.full_name,
    });
  } catch {
    return NextResponse.json({ ok: true, authenticated: false });
  }
}
