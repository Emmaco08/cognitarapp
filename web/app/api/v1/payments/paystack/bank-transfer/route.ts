import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Retired endpoint: Desktop in-app payments are disabled.
 * All licence purchases and renewals happen exclusively on https://cognitara.net/license,
 * and schools activate/renew CogniTara Studio Desktop using their Ed25519 licence key.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "desktop_payments_disabled",
      message:
        "In-app desktop payments are disabled. Purchase or renew your licence at https://cognitara.net/license and enter your licence key in CogniTara Studio.",
    },
    { status: 410 }
  );
}
