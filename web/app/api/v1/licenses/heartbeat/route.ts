import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { signLicenseLease } from "@/lib/crypto";
import { getPlatformSettings, toPublicPlatformDirectives } from "@/lib/platform";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const licenseId = String(body.license_id || "").trim();
    const hwidHash = String(body.hwid_hash || "").trim().toLowerCase();
    const appVersion = String(body.app_version || "2.2.3").trim().slice(0, 32);
    const lockState = String(body.lock_state || "ACTIVE").trim().slice(0, 40);
    const usedSeconds = Math.max(0, Number(body.used_seconds || 0) || 0);
    const tamperStrikes = Math.max(0, Number(body.tamper_strikes || 0) || 0);
    const activeExams = Math.max(0, Number(body.active_exams_count || 0) || 0);
    const studentsCount = Math.max(0, Number(body.approved_students_count || 0) || 0);
    const serverUtc = Math.floor(Date.now() / 1000);
    const settings = await getPlatformSettings();
    const publicDirectives = toPublicPlatformDirectives(settings);

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRe.test(licenseId) && /^[0-9a-f]{64}$/i.test(hwidHash)) {
      const sql = getSql();
      const rows = await sql`
        SELECT l.*, s.school_name, s.status AS school_status, s.ban_reason,
               s.custom_notice, s.custom_notice_level, s.feature_overrides_json,
               s.last_cloud_backup_at,
               p.slug AS plan_slug, p.display_name AS plan_name, p.lease_days AS plan_lease_days
        FROM licenses l
        JOIN schools s ON s.id = l.school_id
        LEFT JOIN plans p ON p.id = l.plan_id
        WHERE l.id = ${licenseId}::uuid
        LIMIT 1
      `;

      if (rows.length > 0) {
        const lic = rows[0] as Record<string, any>;
        const ip = getClientIp(req);
        const safeIp = /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null;

        // STRICT HWID BINDING CHECK: Prevent unauthenticated lease forgery for unbound machines!
        const activeActs = await sql`
          SELECT id, hwid_hash, display_hwid
          FROM license_activations
          WHERE license_id = ${licenseId}::uuid AND is_active = TRUE
        `;
        const matchedAct = activeActs.find((a: Record<string, any>) => String(a.hwid_hash || "").toLowerCase() === hwidHash);
        if (!matchedAct) {
          return NextResponse.json(
            {
              ok: false,
              error: "hwid_not_activated",
              server_utc: serverUtc,
              message: "This computer is not bound to this licence. Activate with your licence key first.",
              directives: publicDirectives,
            },
            { status: 403 }
          );
        }

        await sql`
          INSERT INTO license_heartbeats (
            license_id, activation_id, hwid_hash, app_version, client_utc, used_seconds,
            lock_state, tamper_strikes, active_exams_count, approved_students_count, client_ip
          ) VALUES (
            ${licenseId}::uuid, ${matchedAct.id}::uuid, ${hwidHash}, ${appVersion}, NOW(), ${usedSeconds},
            ${lockState}, ${tamperStrikes}, ${activeExams}, ${studentsCount}, ${safeIp}::inet
          )
        `;

        await sql`
          UPDATE schools
          SET last_seen_at = NOW(), last_app_version = ${appVersion}
          WHERE id = ${lic.school_id}::uuid
        `;

        const directives = {
          ...publicDirectives,
          school_status: lic.school_status,
          school_ban_reason: lic.ban_reason || null,
          school_notice: lic.custom_notice || "",
          school_notice_level: lic.custom_notice_level || "info",
          feature_overrides: lic.feature_overrides_json || {},
          last_cloud_backup_at: lic.last_cloud_backup_at ? new Date(lic.last_cloud_backup_at).toISOString() : null,
        };

        if ((lic.status === "revoked" || lic.school_status === "banned") && lic.revocation_tombstone_json) {
          return NextResponse.json(
            {
              ok: false,
              status: "REVOKED",
              revoked: true,
              server_utc: serverUtc,
              tombstone: lic.revocation_tombstone_json,
              directives,
            },
            { status: 403 }
          );
        }

        const issuedAtIso = new Date(lic.issued_at || Date.now()).toISOString().replace(/\.\d{3}Z$/, "Z");
        const expiresAtIso = lic.expires_at ? new Date(lic.expires_at).toISOString().replace(/\.\d{3}Z$/, "Z") : null;
        const paidDurationSeconds = expiresAtIso
          ? Math.max(86400, Math.floor((new Date(expiresAtIso).getTime() - new Date(issuedAtIso).getTime()) / 1000))
          : null;

        let signedLease = lic.signed_lease_json || null;
        try {
          signedLease = signLicenseLease({
            licenseId: lic.id,
            licenseKey: lic.license_key,
            schoolName: lic.school_name,
            planTier: lic.plan_tier || "annual",
            planSlug: lic.plan_slug || "annual",
            planName: lic.plan_name || "CogniTara Plan",
            hwidHash,
            issuedAtIso,
            expiresAtIso,
            paidDurationSeconds,
            leaseSeconds: Number(lic.lease_seconds || (lic.plan_lease_days || 30) * 86400),
          });
        } catch {
          // fallback to stored signed_lease_json
        }

        return NextResponse.json({
          ok: true,
          server_utc: serverUtc,
          status: lic.status,
          signed_lease: signedLease,
          lease: signedLease,
          directives,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      server_utc: serverUtc,
      status: "ok",
      directives: publicDirectives,
    });
  } catch (err) {
    console.error("Heartbeat error:", err);
    return NextResponse.json({ ok: false, error: "heartbeat_failed" }, { status: 500 });
  }
}
