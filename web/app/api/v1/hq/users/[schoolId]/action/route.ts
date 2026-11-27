import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { hashPassword, requireHqAdmin } from "@/lib/auth";
import { signRevocationTombstone } from "@/lib/crypto";
import { issueSignedLicenseForSchool, logDeveloperAudit } from "@/lib/platform";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ schoolId: string }> }
) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "Developer HQ access required." }, { status: 403 });
    }

    const { schoolId } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(schoolId)) {
      return NextResponse.json({ ok: false, error: "invalid_school_id", message: "Invalid school ID." }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || !body.action) {
      return NextResponse.json({ ok: false, error: "missing_action", message: "Action is required." }, { status: 400 });
    }

    const action = String(body.action).trim();
    const reason = String(body.reason || "Developer HQ action").trim().slice(0, 300);
    const ip = getClientIp(req);
    const sql = getSql();

    const sRows = await sql`
      SELECT s.*, u.id AS owner_id, u.email AS owner_email, u.role AS owner_role
      FROM schools s
      JOIN users_hq u ON u.id = s.owner_user_id
      WHERE s.id = ${schoolId}::uuid
      LIMIT 1
    `;
    if (!sRows.length) {
      return NextResponse.json({ ok: false, error: "school_not_found", message: "School not found." }, { status: 404 });
    }
    const school = sRows[0] as Record<string, any>;

    // Prevent accidental self-lockout on the logged-in HQ Super Admin
    if (school.owner_id === hq.user.id && ["ban_school", "suspend_school", "delete_school"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "cannot_target_self", message: "Safety lock: you cannot ban or delete your own HQ Super Admin account." },
        { status: 400 }
      );
    }

    // 1. GRANT / ISSUE LICENSE INSTANTLY
    if (action === "grant_license") {
      const planId = String(body.plan_id || "").trim();
      const customDays = body.duration_days !== undefined && body.duration_days !== "" && body.duration_days !== null
        ? Number(body.duration_days)
        : undefined;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)) {
        return NextResponse.json({ ok: false, error: "invalid_plan", message: "Select a valid plan to grant." }, { status: 400 });
      }
      const ref = `HQGRANT_${Date.now()}_${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const payRows = await sql`
        INSERT INTO subscriptions_payments (
          school_id, user_id, plan_id, paystack_reference, currency, amount_minor,
          original_amount_minor, discount_amount_minor, payment_channel, status, paid_at, notes
        ) VALUES (
          ${school.id}::uuid, ${school.owner_id}::uuid, ${planId}::uuid, ${ref}, 'NGN', 0,
          0, 0, 'manual_hq', 'success', NOW(), ${`HQ Grant: ${reason}`}
        ) RETURNING id
      `;
      const { license } = await issueSignedLicenseForSchool({
        schoolId: school.id,
        planId,
        paymentId: payRows[0]?.id as string,
        durationDaysOverride: customDays,
      });
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_grant_license",
        targetType: "school",
        targetId: school.id,
        ipAddress: ip,
        details: { license_key: license.license_key, plan_id: planId, custom_days: customDays ?? null, reason },
      });
      return NextResponse.json({
        ok: true,
        message: `Issued licence ${license.license_key} for ${school.school_name}.`,
        license_key: license.license_key,
      });
    }

    // 2. EXTEND ACTIVE LICENSE BY N BONUS DAYS
    if (action === "extend_license") {
      const days = Math.max(1, Math.min(3650, Math.floor(Number(body.days || 30))));
      const lics = await sql`
        SELECT * FROM licenses WHERE school_id = ${school.id}::uuid AND status IN ('active', 'issued', 'expired')
        ORDER BY created_at DESC LIMIT 1
      `;
      if (!lics.length) {
        return NextResponse.json({ ok: false, error: "no_license", message: "This school has no licence yet. Use Grant Licence instead." }, { status: 400 });
      }
      const lic = lics[0] as Record<string, any>;
      const baseTime = lic.expires_at ? Math.max(Date.now(), new Date(lic.expires_at).getTime()) : Date.now();
      const nextExpires = new Date(baseTime + days * 86400 * 1000).toISOString();
      await sql`
        UPDATE licenses
        SET expires_at = ${nextExpires}::timestamptz,
            bonus_days_total = bonus_days_total + ${days},
            status = CASE WHEN status = 'expired' THEN 'active' ELSE status END,
            updated_at = NOW()
        WHERE id = ${lic.id}::uuid
      `;
      await sql`
        INSERT INTO school_bans_audit (school_id, license_id, actor_hq_user_id, action, reason, metadata_json)
        VALUES (${school.id}::uuid, ${lic.id}::uuid, ${hq.user.id}::uuid, 'grant_bonus_days', ${reason}, ${JSON.stringify({ days })}::jsonb)
      `;
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_extend_license",
        targetType: "license",
        targetId: lic.id,
        ipAddress: ip,
        details: { school_name: school.school_name, days, new_expires_at: nextExpires, reason },
      });
      return NextResponse.json({ ok: true, message: `Extended licence by +${days} days (new expiry: ${nextExpires.slice(0, 10)}).` });
    }

    // 3. REMOTE REVOKE LICENSE (BURNS SIGNED ED25519 TOMBSTONE)
    if (action === "revoke_license") {
      const lics = await sql`
        SELECT id, license_key FROM licenses WHERE school_id = ${school.id}::uuid AND status != 'revoked'
        ORDER BY created_at DESC LIMIT 5
      `;
      if (!lics.length) {
        return NextResponse.json({ ok: false, error: "no_active_license", message: "No active licence to revoke." }, { status: 400 });
      }
      for (const lic of lics) {
        const tomb = signRevocationTombstone({
          licenseId: lic.id,
          reasonCode: "HQ_REVOKED",
          reasonDetail: reason,
        });
        await sql`
          UPDATE licenses
          SET status = 'revoked',
              revocation_tombstone_json = ${JSON.stringify(tomb)}::jsonb,
              updated_at = NOW()
          WHERE id = ${lic.id}::uuid
        `;
        await sql`
          INSERT INTO school_bans_audit (school_id, license_id, actor_hq_user_id, action, tombstone_id, reason)
          VALUES (${school.id}::uuid, ${lic.id}::uuid, ${hq.user.id}::uuid, 'revoke_license', ${String((tomb.tombstone as any).tombstone_id)}, ${reason})
        `;
      }
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_revoke_license",
        targetType: "school",
        targetId: school.id,
        ipAddress: ip,
        details: { count: lics.length, reason },
      });
      return NextResponse.json({
        ok: true,
        message: `Revoked ${lics.length} licence(s) with signed Ed25519 kill tombstone. Desktop locks on next check-in.`,
      });
    }

    // 4. BAN / SUSPEND / UNBAN SCHOOL & OWNER
    if (action === "ban_school" || action === "suspend_school") {
      const nextStatus = action === "ban_school" ? "banned" : "suspended";
      await sql`
        UPDATE schools
        SET status = ${nextStatus}, ban_reason = ${reason}, banned_at = NOW(), force_signout_before = NOW(), updated_at = NOW()
        WHERE id = ${school.id}::uuid
      `;
      await sql`UPDATE users_hq SET status = ${nextStatus}, updated_at = NOW() WHERE id = ${school.owner_id}::uuid`;
      await sql`UPDATE cloud_sessions SET revoked_at = NOW() WHERE user_id = ${school.owner_id}::uuid AND revoked_at IS NULL`;

      if (action === "ban_school") {
        const lics = await sql`SELECT id FROM licenses WHERE school_id = ${school.id}::uuid AND status != 'revoked'`;
        for (const lic of lics) {
          const tomb = signRevocationTombstone({
            licenseId: lic.id,
            reasonCode: "SCHOOL_BANNED",
            reasonDetail: reason,
          });
          await sql`
            UPDATE licenses
            SET status = 'revoked', revocation_tombstone_json = ${JSON.stringify(tomb)}::jsonb, updated_at = NOW()
            WHERE id = ${lic.id}::uuid
          `;
        }
      }
      await sql`
        INSERT INTO school_bans_audit (school_id, actor_hq_user_id, action, reason)
        VALUES (${school.id}::uuid, ${hq.user.id}::uuid, ${action}, ${reason})
      `;
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: `hq_${action}`,
        targetType: "school",
        targetId: school.id,
        ipAddress: ip,
        details: { school_name: school.school_name, reason },
      });
      return NextResponse.json({
        ok: true,
        message: `${school.school_name} is now ${nextStatus.toUpperCase()}. All cloud sessions terminated.`,
      });
    }

    if (action === "unban_school") {
      await sql`
        UPDATE schools SET status = 'active', ban_reason = NULL, banned_at = NULL, updated_at = NOW()
        WHERE id = ${school.id}::uuid
      `;
      await sql`UPDATE users_hq SET status = 'active', updated_at = NOW() WHERE id = ${school.owner_id}::uuid`;
      await sql`
        INSERT INTO school_bans_audit (school_id, actor_hq_user_id, action, reason)
        VALUES (${school.id}::uuid, ${hq.user.id}::uuid, 'unban_school', ${reason})
      `;
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_unban_school",
        targetType: "school",
        targetId: school.id,
        ipAddress: ip,
        details: { school_name: school.school_name, reason },
      });
      return NextResponse.json({ ok: true, message: `${school.school_name} restored to ACTIVE.` });
    }

    // 5. RESET HARDWARE / MACHINE BINDING SLOTS
    if (action === "reset_hwid") {
      const updated = await sql`
        UPDATE license_activations
        SET is_active = FALSE, deactivated_at = NOW(), deactivated_by = ${hq.user.id}::uuid, deactivation_reason = ${reason}
        WHERE license_id IN (SELECT id FROM licenses WHERE school_id = ${school.id}::uuid) AND is_active = TRUE
        RETURNING id
      `;
      await sql`
        INSERT INTO school_bans_audit (school_id, actor_hq_user_id, action, reason)
        VALUES (${school.id}::uuid, ${hq.user.id}::uuid, 'reset_hwid', ${reason})
      `;
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_reset_hwid",
        targetType: "school",
        targetId: school.id,
        ipAddress: ip,
        details: { cleared_slots: updated.length, reason },
      });
      return NextResponse.json({
        ok: true,
        message: `Cleared ${updated.length} hardware binding(s). ${school.school_name} can activate on a new PC now.`,
      });
    }

    // 6. FORCE REMOTE SIGN-OUT ACROSS ALL DEVICES
    if (action === "force_signout") {
      await sql`UPDATE schools SET force_signout_before = NOW(), updated_at = NOW() WHERE id = ${school.id}::uuid`;
      const killed = await sql`
        UPDATE cloud_sessions SET revoked_at = NOW()
        WHERE user_id = ${school.owner_id}::uuid AND revoked_at IS NULL
        RETURNING id
      `;
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_force_signout",
        targetType: "school",
        targetId: school.id,
        ipAddress: ip,
        details: { revoked_sessions: killed.length, reason },
      });
      return NextResponse.json({
        ok: true,
        message: `Force-signed out ${killed.length} active session(s) for ${school.school_name}.`,
      });
    }

    // 7. PUSH TARGETED LIVE NOTICE DIRECTLY TO THAT SCHOOL'S DESKTOP APP
    if (action === "send_notice" || action === "clear_notice") {
      const notice = action === "clear_notice" ? "" : String(body.notice || "").trim().slice(0, 500);
      const level = ["info", "warning", "critical", "promo"].includes(String(body.level || ""))
        ? String(body.level)
        : "info";
      await sql`
        UPDATE schools
        SET custom_notice = ${notice || null}, custom_notice_level = ${level}, updated_at = NOW()
        WHERE id = ${school.id}::uuid
      `;
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: action === "clear_notice" ? "hq_clear_notice" : "hq_send_notice",
        targetType: "school",
        targetId: school.id,
        ipAddress: ip,
        details: { notice, level },
      });
      return NextResponse.json({
        ok: true,
        message: action === "clear_notice" ? "Cleared custom notice." : `Pushed live ${level} notice to ${school.school_name}'s Desktop App.`,
      });
    }

    // 8. PER-SCHOOL REMOTE FEATURE OVERRIDES
    if (action === "set_feature_overrides") {
      const overrides = body.overrides && typeof body.overrides === "object" ? body.overrides : {};
      await sql`
        UPDATE schools SET feature_overrides_json = ${JSON.stringify(overrides)}::jsonb, updated_at = NOW()
        WHERE id = ${school.id}::uuid
      `;
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_feature_overrides",
        targetType: "school",
        targetId: school.id,
        ipAddress: ip,
        details: { overrides },
      });
      return NextResponse.json({ ok: true, message: `Updated feature overrides for ${school.school_name}.` });
    }

    // 9. RESET USER PASSWORD
    if (action === "reset_password") {
      const newPass = String(body.new_password || "").trim() || `CT-${crypto.randomBytes(5).toString("hex")}`;
      if (newPass.length < 8) {
        return NextResponse.json({ ok: false, error: "weak_password", message: "New password must be at least 8 characters." }, { status: 400 });
      }
      const hashed = hashPassword(newPass);
      await sql`UPDATE users_hq SET password_hash = ${hashed}, updated_at = NOW() WHERE id = ${school.owner_id}::uuid`;
      await sql`UPDATE cloud_sessions SET revoked_at = NOW() WHERE user_id = ${school.owner_id}::uuid AND revoked_at IS NULL`;
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_reset_password",
        targetType: "user",
        targetId: school.owner_id,
        ipAddress: ip,
        details: { school_name: school.school_name },
      });
      return NextResponse.json({
        ok: true,
        temporary_password: newPass,
        message: `Password reset for ${school.owner_email}. Active sessions invalidated.`,
      });
    }

    // 10. DELETE TEST / SPAM SCHOOL ACCOUNT
    if (action === "delete_school") {
      await sql`DELETE FROM email_otp_codes WHERE user_id = ${school.owner_id}::uuid`;
      await sql`DELETE FROM cloud_sessions WHERE user_id = ${school.owner_id}::uuid`;
      await sql`DELETE FROM promo_redemptions WHERE school_id = ${school.id}::uuid`;
      await sql`DELETE FROM referrals WHERE owner_user_id = ${school.owner_id}::uuid OR school_id = ${school.id}::uuid`;
      await sql`DELETE FROM schools WHERE id = ${school.id}::uuid`;
      await sql`DELETE FROM users_hq WHERE id = ${school.owner_id}::uuid`;
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_delete_school",
        targetType: "school",
        targetId: school.id,
        ipAddress: ip,
        details: { school_name: school.school_name, owner_email: school.owner_email, reason },
      });
      return NextResponse.json({ ok: true, message: `Permanently removed ${school.school_name} (${school.owner_email}).` });
    }

    return NextResponse.json({ ok: false, error: "unknown_action", message: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("HQ user action error:", err);
    return NextResponse.json({ ok: false, error: "hq_action_failed", message: "Developer action failed." }, { status: 500 });
  }
}
