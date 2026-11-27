import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import {
  attachPortalCookie,
  normalizeSchoolCode,
  PortalRole,
  signPortalSession,
} from "@/lib/portal-auth";
import { verifyWerkzeugPassword } from "@/lib/werkzeug-password";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`portal-login:${ip}`, 25, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Too many login attempts. Retry in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
    }

    const schoolCode = normalizeSchoolCode(String(body.school_code || ""));
    const roleRaw = String(body.role || "student").trim().toLowerCase();
    const role: PortalRole = roleRaw === "admin" ? "admin" : roleRaw === "teacher" ? "teacher" : "student";
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!schoolCode) {
      return NextResponse.json({ ok: false, message: "Enter your School ID first." }, { status: 400 });
    }
    if (!username || !password) {
      return NextResponse.json({ ok: false, message: "Enter both your username and password." }, { status: 400 });
    }

    const sql = getSql();
    const schoolRows = await sql`
      SELECT s.id, s.owner_user_id, s.school_code, s.school_name, s.status,
             s.online_portal_enabled, s.online_teachers_enabled, s.online_students_enabled,
             s.online_synced_at
      FROM schools s
      WHERE UPPER(s.school_code) = ${schoolCode}
      LIMIT 1
    `;
    if (!schoolRows.length) {
      return NextResponse.json({ ok: false, error: "school_not_found", message: "School ID not found." }, { status: 404 });
    }
    const school = schoolRows[0] as Record<string, any>;
    if (school.status !== "active") {
      return NextResponse.json({ ok: false, error: "school_suspended", message: "This school portal is currently unavailable." }, { status: 403 });
    }

    // Strictly enforce Admin ON/OFF switches for students and teachers
    if (role !== "admin") {
      if (!school.online_portal_enabled) {
        return NextResponse.json(
          {
            ok: false,
            error: "portal_offline",
            message: "This school's Online Exam Portal is currently switched OFF by the administrator.",
          },
          { status: 403 }
        );
      }
      if (role === "teacher" && !school.online_teachers_enabled) {
        return NextResponse.json(
          {
            ok: false,
            error: "teachers_disabled",
            message: "Teacher online access is currently switched OFF by your school administrator.",
          },
          { status: 403 }
        );
      }
      if (role === "student" && !school.online_students_enabled) {
        return NextResponse.json(
          {
            ok: false,
            error: "students_disabled",
            message: "Student online exam access is currently switched OFF by your school administrator.",
          },
          { status: 403 }
        );
      }
      if (!school.online_synced_at) {
        return NextResponse.json(
          {
            ok: false,
            error: "not_synced",
            message: "Your school has not synced its exam database to the online portal yet.",
          },
          { status: 409 }
        );
      }
    }

    const schoolId = String(school.id);

    if (role === "student") {
      const rows = await sql`
        SELECT local_id, username, password_hash, full_name, student_class, specialisation, status
        FROM portal_students
        WHERE school_id = ${schoolId}::uuid AND LOWER(username) = LOWER(${username})
        LIMIT 1
      `;
      if (!rows.length) {
        return NextResponse.json({ ok: false, message: "Invalid username or password." }, { status: 401 });
      }
      const st = rows[0] as Record<string, any>;
      if (!verifyWerkzeugPassword(password, String(st.password_hash || ""))) {
        return NextResponse.json({ ok: false, message: "Invalid username or password." }, { status: 401 });
      }
      if (String(st.status || "approved").toLowerCase() !== "approved") {
        return NextResponse.json(
          { ok: false, error: "pending_approval", message: "Your student account is still awaiting administrator approval." },
          { status: 403 }
        );
      }

      const token = signPortalSession({
        schoolId,
        schoolCode: String(school.school_code),
        role: "student",
        localId: Number(st.local_id),
        username: String(st.username),
        fullName: String(st.full_name || st.username),
        studentClass: String(st.student_class || ""),
        specialisation: String(st.specialisation || ""),
      });
      const res = NextResponse.json({
        ok: true,
        role: "student",
        redirect: "/portal/student",
        user: {
          local_id: Number(st.local_id),
          username: String(st.username),
          full_name: String(st.full_name || st.username),
          student_class: String(st.student_class || ""),
          specialisation: String(st.specialisation || ""),
        },
      });
      attachPortalCookie(res, token);
      return res;
    }

    if (role === "teacher") {
      const rows = await sql`
        SELECT local_id, username, password_hash, full_name, primary_class, classes_json, specialisations_json
        FROM portal_teachers
        WHERE school_id = ${schoolId}::uuid AND LOWER(username) = LOWER(${username})
        LIMIT 1
      `;
      if (!rows.length) {
        return NextResponse.json({ ok: false, message: "Invalid teacher username or password." }, { status: 401 });
      }
      const tc = rows[0] as Record<string, any>;
      if (!verifyWerkzeugPassword(password, String(tc.password_hash || ""))) {
        return NextResponse.json({ ok: false, message: "Invalid teacher username or password." }, { status: 401 });
      }
      const token = signPortalSession({
        schoolId,
        schoolCode: String(school.school_code),
        role: "teacher",
        localId: Number(tc.local_id),
        username: String(tc.username),
        fullName: String(tc.full_name || tc.username),
      });
      const res = NextResponse.json({
        ok: true,
        role: "teacher",
        redirect: "/portal/teacher",
        user: {
          local_id: Number(tc.local_id),
          username: String(tc.username),
          full_name: String(tc.full_name || tc.username),
        },
      });
      attachPortalCookie(res, token);
      return res;
    }

    // Role === "admin": match offline exam.db admin username/password OR CogniTara Cloud school owner email/password
    const adminRows = await sql`
      SELECT local_id, username, password_hash
      FROM portal_admins
      WHERE school_id = ${schoolId}::uuid AND LOWER(username) = LOWER(${username})
      LIMIT 1
    `;
    let authedAdmin: { localId: number; username: string; fullName: string } | null = null;
    if (adminRows.length) {
      const ad = adminRows[0] as Record<string, any>;
      if (verifyWerkzeugPassword(password, String(ad.password_hash || ""))) {
        authedAdmin = {
          localId: Number(ad.local_id),
          username: String(ad.username),
          fullName: `${String(school.school_name)} Admin`,
        };
      }
    }

    if (!authedAdmin) {
      const ownerRows = await sql`
        SELECT id, email, password_hash, full_name, status
        FROM users_hq
        WHERE id = ${String(school.owner_user_id)}::uuid AND LOWER(email) = LOWER(${username})
        LIMIT 1
      `;
      if (ownerRows.length) {
        const ow = ownerRows[0] as Record<string, any>;
        if (ow.status === "active" && verifyPassword(password, String(ow.password_hash || ""))) {
          authedAdmin = {
            localId: 0,
            username: String(ow.email),
            fullName: String(ow.full_name || "School Administrator"),
          };
        }
      }
    }

    if (!authedAdmin) {
      return NextResponse.json(
        { ok: false, message: "Invalid admin credentials. Use your offline portal admin username/password or your CogniTara Cloud owner email/password." },
        { status: 401 }
      );
    }

    const token = signPortalSession({
      schoolId,
      schoolCode: String(school.school_code),
      role: "admin",
      localId: authedAdmin.localId,
      username: authedAdmin.username,
      fullName: authedAdmin.fullName,
    });
    const res = NextResponse.json({
      ok: true,
      role: "admin",
      redirect: "/portal/admin",
      user: {
        local_id: authedAdmin.localId,
        username: authedAdmin.username,
        full_name: authedAdmin.fullName,
      },
    });
    attachPortalCookie(res, token);
    return res;
  } catch (err) {
    console.error("Portal login error:", err);
    return NextResponse.json({ ok: false, message: "Sign in failed. Please try again." }, { status: 500 });
  }
}
