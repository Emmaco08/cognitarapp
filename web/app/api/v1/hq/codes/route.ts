import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireHqAdmin } from "@/lib/auth";
import { logDeveloperAudit } from "@/lib/platform";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function randomCodePart(len = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "Developer HQ access required." }, { status: 403 });
    }
    const sql = getSql();
    const codes = await sql`
      SELECT pc.*, gp.display_name AS grant_plan_name, gp.slug AS grant_plan_slug
      FROM promo_codes pc
      LEFT JOIN plans gp ON gp.id = pc.grant_plan_id
      ORDER BY pc.created_at DESC
      LIMIT 300
    `;
    return NextResponse.json({ ok: true, codes });
  } catch (err) {
    console.error("HQ codes GET error:", err);
    return NextResponse.json({ ok: false, error: "hq_codes_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "Developer HQ access required." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });

    const sql = getSql();
    const ip = getClientIp(req);

    // Toggle active status shortcut
    if (body.action === "toggle" && body.id) {
      const id = String(body.id);
      const updated = await sql`
        UPDATE promo_codes SET is_active = NOT is_active WHERE id = ${id}::uuid RETURNING id, code, is_active
      `;
      if (!updated.length) return NextResponse.json({ ok: false, message: "Code not found." }, { status: 404 });
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_toggle_code",
        targetType: "promo_code",
        targetId: id,
        ipAddress: ip,
        details: { code: updated[0].code, is_active: updated[0].is_active },
      });
      return NextResponse.json({ ok: true, code: updated[0], message: `Code ${updated[0].code} is now ${updated[0].is_active ? "ACTIVE" : "PAUSED"}.` });
    }

    const codeType = body.code_type === "redeem" ? "redeem" : "discount";
    const batchCount = Math.max(1, Math.min(50, Math.floor(Number(body.batch_count || 1))));
    const prefix = String(body.prefix || (codeType === "redeem" ? "CT-RDM" : "SAVE"))
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 20);
    const customCode = String(body.code || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 40);

    const discountKind =
      codeType === "discount"
        ? (["percent", "fixed_ngn", "fixed_usd"].includes(String(body.discount_kind || "")) ? String(body.discount_kind) : "percent")
        : null;
    const discountValue = codeType === "discount" ? Math.max(0, Number(body.discount_value || 0)) : 0;
    if (codeType === "discount" && discountKind === "percent" && (discountValue <= 0 || discountValue > 100)) {
      return NextResponse.json({ ok: false, message: "Percentage discount must be between 1 and 100." }, { status: 400 });
    }
    if (codeType === "discount" && discountValue <= 0) {
      return NextResponse.json({ ok: false, message: "Discount value must be greater than 0." }, { status: 400 });
    }

    const grantPlanId = codeType === "redeem" && body.grant_plan_id ? String(body.grant_plan_id).trim() : null;
    if (codeType === "redeem" && !grantPlanId) {
      return NextResponse.json({ ok: false, message: "Select a Plan that this redeem code will grant." }, { status: 400 });
    }
    const grantDurationDays =
      codeType === "redeem" && body.grant_duration_days !== "" && body.grant_duration_days !== null && body.grant_duration_days !== undefined
        ? Math.max(1, Math.floor(Number(body.grant_duration_days)))
        : null;
    const maxUses =
      body.max_uses === "" || body.max_uses === null || body.max_uses === undefined
        ? (codeType === "redeem" ? 1 : null)
        : Math.max(1, Math.floor(Number(body.max_uses)));
    const perSchoolLimit = Math.max(1, Math.floor(Number(body.per_school_limit || 1)));
    const expiresAt = body.expires_at ? new Date(String(body.expires_at)).toISOString() : null;
    const notes = String(body.notes || "").trim().slice(0, 240);
    const applicablePlanIds = Array.isArray(body.applicable_plan_ids) ? body.applicable_plan_ids : [];

    const created: Array<Record<string, any>> = [];
    for (let i = 0; i < batchCount; i++) {
      const codeStr =
        batchCount === 1 && customCode
          ? customCode
          : `${prefix || "CT"}-${randomCodePart(4)}-${randomCodePart(4)}`;
      const rows = await sql`
        INSERT INTO promo_codes (
          code, code_type, discount_kind, discount_value, grant_plan_id, grant_duration_days,
          applicable_plan_ids, max_uses, per_school_limit, expires_at, is_active, notes, created_by
        ) VALUES (
          ${codeStr},
          ${codeType},
          ${discountKind},
          ${discountValue},
          ${grantPlanId}::uuid,
          ${grantDurationDays},
          ${JSON.stringify(applicablePlanIds)}::jsonb,
          ${maxUses},
          ${perSchoolLimit},
          ${expiresAt}::timestamptz,
          TRUE,
          ${notes},
          ${hq.user.id}::uuid
        )
        RETURNING *
      `;
      if (rows[0]) created.push(rows[0]);
    }

    await logDeveloperAudit({
      actorUserId: hq.user.id,
      actorEmail: hq.user.email,
      action: batchCount > 1 ? "hq_batch_create_codes" : "hq_create_code",
      targetType: "promo_code",
      targetId: created[0]?.id,
      ipAddress: ip,
      details: {
        code_type: codeType,
        count: created.length,
        sample_code: created[0]?.code,
        discount_kind: discountKind,
        discount_value: discountValue,
        grant_plan_id: grantPlanId,
      },
    });

    return NextResponse.json({
      ok: true,
      created,
      message:
        created.length === 1
          ? `Created ${codeType} code ${created[0].code}.`
          : `Generated ${created.length} unique ${codeType} codes!`,
    });
  } catch (err: any) {
    console.error("HQ codes POST error:", err);
    const msg = String(err?.message || "").includes("unique")
      ? "That code already exists. Choose a different code."
      : "Could not create code.";
    return NextResponse.json({ ok: false, message: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    const id = req.nextUrl.searchParams.get("id") || "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ ok: false, message: "Invalid code ID." }, { status: 400 });
    }
    const sql = getSql();
    await sql`DELETE FROM promo_codes WHERE id = ${id}::uuid`;
    await logDeveloperAudit({
      actorUserId: hq.user.id,
      actorEmail: hq.user.email,
      action: "hq_delete_code",
      targetType: "promo_code",
      targetId: id,
      ipAddress: getClientIp(req),
    });
    return NextResponse.json({ ok: true, message: "Code deleted." });
  } catch (err) {
    console.error("HQ codes DELETE error:", err);
    return NextResponse.json({ ok: false, message: "Could not delete code." }, { status: 500 });
  }
}
