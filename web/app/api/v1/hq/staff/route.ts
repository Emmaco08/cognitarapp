import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { hashPassword, isValidEmail, normalizeEmail, requireHqAdmin } from "@/lib/auth";
import { logDeveloperAudit } from "@/lib/platform";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    const sql = getSql();
    const staff = await sql`
      SELECT id, email, full_name, role, status, email_verified, totp_enabled, created_at,
             (SELECT COUNT(*)::int FROM cloud_sessions cs WHERE cs.user_id = users_hq.id AND cs.revoked_at IS NULL AND cs.expires_at > NOW()) AS active_sessions
      FROM users_hq
      WHERE role IN ('hq_super_admin', 'hq_admin')
      ORDER BY CASE WHEN role = 'hq_super_admin' THEN 0 ELSE 1 END, created_at ASC
    `;
    return NextResponse.json({ ok: true, staff });
  } catch (err) {
    console.error("HQ staff GET error:", err);
    return NextResponse.json({ ok: false, error: "hq_staff_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq || hq.user.role !== "hq_super_admin") {
      return NextResponse.json({ ok: false, message: "Only the HQ Super Admin can manage staff accounts." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const action = String(body?.action || "create").trim();
    const sql = getSql();
    const ip = getClientIp(req);

    if (action === "toggle_status") {
      const targetId = String(body?.user_id || "").trim();
      if (targetId === hq.user.id) {
        return NextResponse.json({ ok: false, message: "You cannot suspend your own Super Admin account." }, { status: 400 });
      }
      const rows = await sql`
        UPDATE users_hq
        SET status = CASE WHEN status = 'active' THEN 'suspended' ELSE 'active' END, updated_at = NOW()
        WHERE id = ${targetId}::uuid AND role = 'hq_admin'
        RETURNING id, email, status
      `;
      if (!rows.length) return NextResponse.json({ ok: false, message: "Staff account not found." }, { status: 404 });
      if (rows[0].status !== "active") {
        await sql`UPDATE cloud_sessions SET revoked_at = NOW() WHERE user_id = ${targetId}::uuid AND revoked_at IS NULL`;
      }
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_staff_toggle",
        targetType: "user",
        targetId,
        ipAddress: ip,
        details: { email: rows[0].email, status: rows[0].status },
      });
      return NextResponse.json({ ok: true, message: `${rows[0].email} is now ${rows[0].status}.` });
    }

    const email = normalizeEmail(String(body?.email || ""));
    const fullName = String(body?.full_name || "").trim().slice(0, 120);
    const password = String(body?.password || "");

    if (!isValidEmail(email) || fullName.length < 2 || password.length < 10) {
      return NextResponse.json(
        { ok: false, message: "Provide a valid email, full name, and a strong password (10+ characters)." },
        { status: 400 }
      );
    }

    const existing = await sql`SELECT id FROM users_hq WHERE email = ${email} LIMIT 1`;
    if (existing.length) {
      return NextResponse.json({ ok: false, message: "An account with that email already exists." }, { status: 409 });
    }

    const pwHash = hashPassword(password);
    const created = await sql`
      INSERT INTO users_hq (email, password_hash, full_name, role, status, email_verified)
      VALUES (${email}, ${pwHash}, ${fullName}, 'hq_admin', 'active', TRUE)
      RETURNING id, email, full_name, role, status, created_at
    `;

    await logDeveloperAudit({
      actorUserId: hq.user.id,
      actorEmail: hq.user.email,
      action: "hq_create_staff",
      targetType: "user",
      targetId: String(created[0].id),
      ipAddress: ip,
      details: { email, full_name: fullName },
    });

    return NextResponse.json({ ok: true, staff: created[0], message: `Added HQ Admin ${fullName} (${email}).` }, { status: 201 });
  } catch (err) {
    console.error("HQ staff POST error:", err);
    return NextResponse.json({ ok: false, message: "Could not save staff account." }, { status: 500 });
  }
}
