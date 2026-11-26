import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";
import { ensureSchoolProfileColumns } from "@/lib/school-profile";

export const dynamic = "force-dynamic";

const MAX_LOGO_DATA_URL_LEN = 2_200_000; // ~1.6 MB base64 image synced safely to Neon Postgres

export async function GET(req: NextRequest) {
  try {
    const token = extractBearerOrCookieToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "Sign in required." }, { status: 401 });
    }
    const account = await resolveAuthenticatedAccount(token);
    if (!account || !account.school) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "School account not found." }, { status: 401 });
    }

    const sql = getSql();
    await ensureSchoolProfileColumns(sql);

    const rows = await sql`
      SELECT
        id, school_name, school_motto, academic_session, current_term,
        logo_data_url, admin_full_name, admin_username, onboarding_completed_at,
        last_lan_ip, last_machine_hostname, last_os_version,
        last_app_version, last_hwid, last_seen_at, contact_email, contact_phone
      FROM schools
      WHERE id = ${account.school.id}::uuid
      LIMIT 1
    `;

    return NextResponse.json({ ok: true, school: rows[0] || account.school });
  } catch (err) {
    console.error("School profile GET error:", err);
    return NextResponse.json({ ok: false, error: "profile_load_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = extractBearerOrCookieToken(req);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Sign in to your CogniTara Cloud account first." },
        { status: 401 }
      );
    }
    const account = await resolveAuthenticatedAccount(token);
    if (!account || !account.school) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "A valid school account is required." },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "invalid_json", message: "Invalid JSON body." }, { status: 400 });
    }

    const sql = getSql();
    await ensureSchoolProfileColumns(sql);

    const schoolName =
      typeof body.school_name === "string" && body.school_name.trim().length >= 2
        ? body.school_name.trim().slice(0, 160)
        : null;
    const schoolMotto =
      typeof body.school_motto === "string" ? body.school_motto.trim().slice(0, 240) : null;
    const academicSession =
      typeof body.academic_session === "string" ? body.academic_session.trim().slice(0, 48) : null;
    const currentTerm =
      typeof body.current_term === "string" ? body.current_term.trim().slice(0, 48) : null;
    const adminFullName =
      typeof body.admin_full_name === "string" ? body.admin_full_name.trim().slice(0, 120) : null;
    const adminUsername =
      typeof body.admin_username === "string" ? body.admin_username.trim().slice(0, 64) : null;
    const lastLanIp =
      typeof body.last_lan_ip === "string" ? body.last_lan_ip.trim().slice(0, 64) : null;
    const lastMachineHostname =
      typeof body.machine_hostname === "string" ? body.machine_hostname.trim().slice(0, 120) : null;
    const lastOsVersion =
      typeof body.os_version === "string" ? body.os_version.trim().slice(0, 120) : null;
    const lastAppVersion =
      typeof body.app_version === "string" ? body.app_version.trim().slice(0, 32) : null;
    const lastHwid =
      typeof body.display_hwid === "string" ? body.display_hwid.trim().slice(0, 64) : null;
    const onboardingCompleted = Boolean(body.onboarding_completed);

    const removeLogo = Boolean(body.remove_logo);
    let logoAction: "keep" | "clear" | "set" = "keep";
    let cleanLogo = "";
    if (removeLogo) {
      logoAction = "clear";
    } else if (typeof body.logo_data_url === "string" && body.logo_data_url.startsWith("data:image/")) {
      if (body.logo_data_url.length <= MAX_LOGO_DATA_URL_LEN) {
        logoAction = "set";
        cleanLogo = body.logo_data_url;
      }
    }

    const updated = await sql`
      UPDATE schools
      SET
        school_name = COALESCE(${schoolName}, school_name),
        school_motto = COALESCE(${schoolMotto}, school_motto),
        academic_session = COALESCE(${academicSession}, academic_session),
        current_term = COALESCE(${currentTerm}, current_term),
        logo_data_url = CASE
          WHEN ${logoAction === "clear"} THEN ''
          WHEN ${logoAction === "set"} THEN ${cleanLogo}
          ELSE logo_data_url
        END,
        admin_full_name = COALESCE(${adminFullName}, admin_full_name),
        admin_username = COALESCE(${adminUsername}, admin_username),
        last_lan_ip = COALESCE(${lastLanIp}, last_lan_ip),
        last_machine_hostname = COALESCE(${lastMachineHostname}, last_machine_hostname),
        last_os_version = COALESCE(${lastOsVersion}, last_os_version),
        last_app_version = COALESCE(${lastAppVersion}, last_app_version),
        last_hwid = COALESCE(${lastHwid}, last_hwid),
        onboarding_completed_at = CASE
          WHEN ${onboardingCompleted} THEN COALESCE(onboarding_completed_at, NOW())
          ELSE onboarding_completed_at
        END,
        last_seen_at = NOW()
      WHERE id = ${account.school.id}::uuid
      RETURNING
        id, school_name, school_motto, academic_session, current_term,
        logo_data_url, admin_full_name, admin_username, onboarding_completed_at,
        last_lan_ip, last_machine_hostname, last_os_version,
        last_app_version, last_hwid, last_seen_at, status
    `;

    return NextResponse.json({
      ok: true,
      message: "School profile synced with CogniTara Cloud HQ.",
      school: updated[0] || account.school,
    });
  } catch (err) {
    console.error("School profile POST error:", err);
    return NextResponse.json(
      { ok: false, error: "profile_sync_failed", message: "Could not sync school profile right now." },
      { status: 500 }
    );
  }
}
