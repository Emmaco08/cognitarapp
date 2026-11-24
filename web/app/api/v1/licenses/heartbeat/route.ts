import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const licenseId = String(body.license_id || "").trim();
    const hwidHash = String(body.hwid_hash || "").trim();
    const appVersion = String(body.app_version || "2.1.0").trim().slice(0, 32);
    const lockState = String(body.lock_state || "ACTIVE").trim().slice(0, 40);
    const usedSeconds = Math.max(0, Number(body.used_seconds || 0) || 0);
    const tamperStrikes = Math.max(0, Number(body.tamper_strikes || 0) || 0);
    const activeExams = Math.max(0, Number(body.active_exams_count || 0) || 0);
    const studentsCount = Math.max(0, Number(body.approved_students_count || 0) || 0);
    const serverUtc = Math.floor(Date.now() / 1000);

    // If a valid UUID license_id exists in Neon, log the heartbeat and return any revocation tombstone
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRe.test(licenseId) && hwidHash.length === 64) {
      const sql = getSql();
      const rows = await sql`
        SELECT id, status, revocation_tombstone_json, signed_lease_json
        FROM licenses
        WHERE id = ${licenseId}::uuid
        LIMIT 1
      `;
      if (rows.length > 0) {
        const lic = rows[0] as Record<string, any>;
        await sql`
          INSERT INTO license_heartbeats (
            license_id, hwid_hash, app_version, client_utc, used_seconds,
            lock_state, tamper_strikes, active_exams_count, approved_students_count
          ) VALUES (
            ${licenseId}::uuid, ${hwidHash}, ${appVersion}, NOW(), ${usedSeconds},
            ${lockState}, ${tamperStrikes}, ${activeExams}, ${studentsCount}
          )
        `;
        if (lic.status === "revoked" && lic.revocation_tombstone_json) {
          return NextResponse.json(
            {
              ok: false,
              revoked: true,
              server_utc: serverUtc,
              tombstone: lic.revocation_tombstone_json,
            },
            { status: 403 }
          );
        }
        return NextResponse.json({
          ok: true,
          server_utc: serverUtc,
          status: lic.status,
          lease: lic.signed_lease_json || null,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      server_utc: serverUtc,
      status: "ok",
    });
  } catch (err) {
    console.error("Heartbeat error:", err);
    return NextResponse.json({ ok: false, error: "heartbeat_failed" }, { status: 500 });
  }
}
