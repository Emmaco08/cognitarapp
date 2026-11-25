import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireHqAdmin, verifyPassword } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { logDeveloperAudit } from "@/lib/platform";
import { getClientIp } from "@/lib/rate-limit";
import {
  buildTotpUri,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyTotpCode,
} from "@/lib/totp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "HQ admin access required." }, { status: 403 });
    }
    const sql = getSql();
    const rows = await sql`
      SELECT totp_enabled, totp_recovery_hashes_json
      FROM users_hq
      WHERE id = ${hq.user.id}::uuid
      LIMIT 1
    `;
    const row = (rows[0] || {}) as Record<string, any>;
    const recoveryRemaining = Array.isArray(row.totp_recovery_hashes_json) ? row.totp_recovery_hashes_json.length : 0;

    const init = req.nextUrl.searchParams.get("init") === "1";
    let setup: { secret: string; otpauth_uri: string } | null = null;
    if (init) {
      const secret = generateTotpSecret();
      setup = {
        secret,
        otpauth_uri: buildTotpUri({ secret, email: hq.user.email, issuer: "CogniTara HQ" }),
      };
    }

    return NextResponse.json({
      ok: true,
      totp_enabled: Boolean(row.totp_enabled),
      recovery_codes_remaining: recoveryRemaining,
      setup,
    });
  } catch (err) {
    console.error("HQ TOTP GET error:", err);
    return NextResponse.json({ ok: false, message: "Could not load 2FA settings." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const secret = String(body?.secret || "").trim().toUpperCase();
    const code = String(body?.code || "").trim();

    if (!secret || secret.length < 16) {
      return NextResponse.json({ ok: false, message: "Invalid authenticator secret. Restart setup." }, { status: 400 });
    }
    if (!verifyTotpCode(secret, code)) {
      return NextResponse.json(
        { ok: false, message: "That 6-digit code did not match. Scan the key in Google Authenticator / Authy and enter the current code." },
        { status: 400 }
      );
    }

    const encrypted = encryptSecret(secret);
    const { plainCodes, hashedCodes } = generateRecoveryCodes();
    const sql = getSql();
    await sql`
      UPDATE users_hq
      SET totp_secret_enc = ${encrypted},
          totp_enabled = TRUE,
          mfa_enabled = TRUE,
          totp_recovery_hashes_json = ${JSON.stringify(hashedCodes)}::jsonb,
          updated_at = NOW()
      WHERE id = ${hq.user.id}::uuid
    `;

    await logDeveloperAudit({
      actorUserId: hq.user.id,
      actorEmail: hq.user.email,
      action: "hq_totp_enabled",
      targetType: "user",
      targetId: hq.user.id,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      ok: true,
      totp_enabled: true,
      recovery_codes: plainCodes,
      message: "Authenticator app 2FA is now active. Save these 8 single-use recovery codes safely.",
    });
  } catch (err) {
    console.error("HQ TOTP POST error:", err);
    return NextResponse.json({ ok: false, message: "Could not enable authenticator app 2FA." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const password = String(body?.password || "");
    const sql = getSql();
    const rows = await sql`SELECT password_hash FROM users_hq WHERE id = ${hq.user.id}::uuid LIMIT 1`;
    if (!rows.length || !verifyPassword(password, String(rows[0].password_hash || ""))) {
      return NextResponse.json({ ok: false, message: "Confirm your current HQ password to disable authenticator 2FA." }, { status: 400 });
    }

    await sql`
      UPDATE users_hq
      SET totp_secret_enc = NULL,
          totp_enabled = FALSE,
          totp_recovery_hashes_json = '[]'::jsonb,
          updated_at = NOW()
      WHERE id = ${hq.user.id}::uuid
    `;

    await logDeveloperAudit({
      actorUserId: hq.user.id,
      actorEmail: hq.user.email,
      action: "hq_totp_disabled",
      targetType: "user",
      targetId: hq.user.id,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      ok: true,
      totp_enabled: false,
      message: "Authenticator app 2FA removed. Email 2FA remains active when Brevo is configured.",
    });
  } catch (err) {
    console.error("HQ TOTP DELETE error:", err);
    return NextResponse.json({ ok: false, message: "Could not disable authenticator 2FA." }, { status: 500 });
  }
}
