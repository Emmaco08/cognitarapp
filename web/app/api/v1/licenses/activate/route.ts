import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { signLicenseLease } from "@/lib/crypto";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`lic-act:${ip}`, 20, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many activation attempts. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "invalid_json", message: "Invalid JSON body." }, { status: 400 });
    }

    const licenseKey = String(body.license_key || "").trim().toUpperCase();
    const hwidHash = String(body.hwid_hash || "").trim().toLowerCase();
    const displayHwid = String(body.display_hwid || "").trim().slice(0, 64) || `CT-HWID-${hwidHash.slice(0, 12).toUpperCase()}`;
    const hwComponents =
      body.hw_component_hashes && typeof body.hw_component_hashes === "object"
        ? (body.hw_component_hashes as Record<string, string>)
        : null;
    const hostname = body.machine_hostname ? String(body.machine_hostname).trim().slice(0, 120) : null;
    const osVersion = body.os_version ? String(body.os_version).trim().slice(0, 120) : null;
    const appVersion = body.app_version ? String(body.app_version).trim().slice(0, 32) : "2.2.0";

    if (!licenseKey || !/^[0-9a-f]{64}$/i.test(hwidHash)) {
      return NextResponse.json(
        { ok: false, error: "invalid_activation_request", message: "Valid license key and hardware fingerprint are required." },
        { status: 400 }
      );
    }

    const sql = getSql();
    const rows = await sql`
      SELECT l.*, s.school_name, s.status AS school_status, s.ban_reason,
             p.slug AS plan_slug, p.display_name AS plan_name, p.duration_days AS plan_duration_days, p.lease_days AS plan_lease_days
      FROM licenses l
      JOIN schools s ON s.id = l.school_id
      JOIN plans p ON p.id = l.plan_id
      WHERE UPPER(l.license_key) = ${licenseKey}
      LIMIT 1
    `;

    if (!rows.length) {
      return NextResponse.json(
        { ok: false, error: "license_not_found", message: "Licence key not recognised. Check the key and try again." },
        { status: 404 }
      );
    }

    const lic = rows[0] as Record<string, any>;

    if (lic.status === "revoked" || lic.school_status === "banned") {
      return NextResponse.json(
        {
          ok: false,
          status: "REVOKED",
          revoked: true,
          message: lic.ban_reason || "This licence has been revoked by CogniTara HQ.",
          tombstone: lic.revocation_tombstone_json || null,
        },
        { status: 403 }
      );
    }

    if (lic.status === "suspended" || lic.school_status === "suspended") {
      return NextResponse.json(
        { ok: false, error: "license_suspended", message: "This school licence is temporarily suspended. Contact CogniTara HQ." },
        { status: 403 }
      );
    }

    if (lic.expires_at && new Date(lic.expires_at).getTime() <= Date.now()) {
      await sql`UPDATE licenses SET status = 'expired', updated_at = NOW() WHERE id = ${lic.id}::uuid`;
      return NextResponse.json(
        { ok: false, error: "license_expired", message: "This licence has expired. Renew to continue." },
        { status: 403 }
      );
    }

    // Check active hardware activation binding
    const activeActs = await sql`
      SELECT * FROM license_activations WHERE license_id = ${lic.id}::uuid AND is_active = TRUE
    `;
    const matchedAct = activeActs.find((a: Record<string, any>) => String(a.hwid_hash).toLowerCase() === hwidHash);
    if (!matchedAct && activeActs.length >= Number(lic.max_activations || 1)) {
      return NextResponse.json(
        {
          ok: false,
          error: "hwid_slot_occupied",
          message: `This licence is already activated on another computer (${activeActs[0]?.display_hwid || "registered PC"}). Ask CogniTara HQ to reset the hardware slot.`,
        },
        { status: 409 }
      );
    }

    if (!matchedAct) {
      await sql`
        INSERT INTO license_activations (
          license_id, hwid_hash, display_hwid, machine_hostname, os_version, hw_components_json, is_active
        ) VALUES (
          ${lic.id}::uuid, ${hwidHash}, ${displayHwid}, ${hostname}, ${osVersion}, ${JSON.stringify(hwComponents || {})}::jsonb, TRUE
        )
        ON CONFLICT DO NOTHING
      `;
    }

    const issuedAtIso = new Date(lic.issued_at || Date.now()).toISOString().replace(/\.\d{3}Z$/, "Z");
    const expiresAtIso = lic.expires_at ? new Date(lic.expires_at).toISOString().replace(/\.\d{3}Z$/, "Z") : null;
    const paidDurationSeconds = expiresAtIso
      ? Math.max(86400, Math.floor((new Date(expiresAtIso).getTime() - new Date(issuedAtIso).getTime()) / 1000))
      : null;

    const leaseEnvelope = signLicenseLease({
      licenseId: lic.id,
      licenseKey: lic.license_key,
      schoolName: lic.school_name,
      planTier: lic.plan_tier || "annual",
      planSlug: lic.plan_slug || "annual",
      planName: lic.plan_name || "CogniTara Plan",
      hwidHash,
      hwComponentHashes: hwComponents,
      issuedAtIso,
      expiresAtIso,
      paidDurationSeconds,
      leaseSeconds: Number(lic.lease_seconds || (lic.plan_lease_days || 30) * 86400),
    });

    await sql`
      UPDATE licenses
      SET status = 'active',
          signed_lease_json = ${JSON.stringify(leaseEnvelope)}::jsonb,
          ed25519_sig = ${leaseEnvelope.ed25519_sig},
          updated_at = NOW()
      WHERE id = ${lic.id}::uuid
    `;

    await sql`
      UPDATE schools
      SET last_seen_at = NOW(), last_hwid = ${displayHwid}, last_app_version = ${appVersion}
      WHERE id = ${lic.school_id}::uuid
    `;

    return NextResponse.json({
      ok: true,
      status: "ACTIVE",
      signed_lease: leaseEnvelope,
      license: {
        id: lic.id,
        license_key: lic.license_key,
        school_name: lic.school_name,
        plan_tier: lic.plan_tier,
        plan_name: lic.plan_name,
        expires_at: expiresAtIso,
      },
    });
  } catch (err) {
    console.error("License activation error:", err);
    return NextResponse.json(
      { ok: false, error: "activation_failed", message: "Could not activate licence right now." },
      { status: 500 }
    );
  }
}
