import { NextResponse } from "next/server";
import { clearPortalCookie } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearPortalCookie(res);
  return res;
}
