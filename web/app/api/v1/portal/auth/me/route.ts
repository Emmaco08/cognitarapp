import { NextRequest, NextResponse } from "next/server";
import { getPortalSessionFromRequest, loadSchoolGate } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getPortalSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 200 });
  }
  const school = await loadSchoolGate(session.schoolId);
  if (!school || school.status !== "active") {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 200 });
  }
  return NextResponse.json({
    ok: true,
    authenticated: true,
    session,
    school,
  });
}
