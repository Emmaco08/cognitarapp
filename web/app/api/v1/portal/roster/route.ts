import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";
import { hashWerkzeugPassword } from "@/lib/werkzeug-password";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const sql = getSql();
  const [students, teachers] = await Promise.all([
    sql`
      SELECT local_id, username, full_name, email, student_class, specialisation, status, created_online, updated_at
      FROM portal_students
      WHERE school_id = ${session.schoolId}::uuid
      ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, student_class ASC, full_name ASC
      LIMIT 500
    `,
    sql`
      SELECT local_id, username, full_name, primary_class, classes_json, specialisations_json, class_teacher_of, created_online
      FROM portal_teachers
      WHERE school_id = ${session.schoolId}::uuid
      ORDER BY full_name ASC
      LIMIT 200
    `,
  ]);

  return NextResponse.json({ ok: true, students, teachers });
}

export async function POST(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
    const kind = body.kind === "teacher" ? "teacher" : "student";
    const username = String(body.username || "").trim().slice(0, 80);
    const password = String(body.password || "");
    const fullName = String(body.full_name || username).trim().slice(0, 140);

    if (username.length < 2 || password.length < 4) {
      return NextResponse.json({ ok: false, message: "Username (2+ chars) and password (4+ chars) are required." }, { status: 400 });
    }

    const sql = getSql();
    const pwdHash = hashWerkzeugPassword(password);

    if (kind === "teacher") {
      const classes = Array.isArray(body.classes)
        ? body.classes.map((c) => String(c || "").trim()).filter(Boolean)
        : String(body.classes || "")
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean);
      const maxRows = await sql`
        SELECT GREATEST(100000, COALESCE(MAX(local_id), 100000))::int AS max_id
        FROM portal_teachers WHERE school_id = ${session.schoolId}::uuid
      `;
      const nextId = Number(maxRows[0]?.max_id || 100000) + 1;
      await sql`
        INSERT INTO portal_teachers (
          school_id, local_id, username, password_hash, full_name, primary_class, classes_json, created_online, updated_at
        ) VALUES (
          ${session.schoolId}::uuid, ${nextId}, ${username}, ${pwdHash}, ${fullName},
          ${classes[0] || ""}, ${JSON.stringify(classes)}::jsonb, TRUE, NOW()
        )
      `;
      return NextResponse.json({ ok: true, message: `Teacher "${fullName}" created.` }, { status: 201 });
    }

    const studentClass = String(body.student_class || "").trim().slice(0, 60);
    const specialisation = String(body.specialisation || "").trim().slice(0, 60);
    const email = String(body.email || "").trim().slice(0, 120);
    const maxRows = await sql`
      SELECT GREATEST(100000, COALESCE(MAX(local_id), 100000))::int AS max_id
      FROM portal_students WHERE school_id = ${session.schoolId}::uuid
    `;
    const nextId = Number(maxRows[0]?.max_id || 100000) + 1;
    await sql`
      INSERT INTO portal_students (
        school_id, local_id, username, password_hash, full_name, email, student_class, specialisation, status, created_online, updated_at
      ) VALUES (
        ${session.schoolId}::uuid, ${nextId}, ${username}, ${pwdHash}, ${fullName},
        ${email}, ${studentClass}, ${specialisation}, 'approved', TRUE, NOW()
      )
    `;
    return NextResponse.json({ ok: true, message: `Student "${fullName}" added.` }, { status: 201 });
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg.toLowerCase().includes("unique")) {
      return NextResponse.json({ ok: false, message: "That username already exists in this school." }, { status: 409 });
    }
    console.error("Portal roster POST error:", err);
    return NextResponse.json({ ok: false, message: "Could not add account." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const localId = Number(body?.local_id);
  const status = String(body?.status || "approved").trim().toLowerCase();
  if (!Number.isInteger(localId) || !["approved", "pending", "suspended"].includes(status)) {
    return NextResponse.json({ ok: false, message: "Invalid student update." }, { status: 400 });
  }
  const sql = getSql();
  await sql`
    UPDATE portal_students
    SET status = ${status}, updated_at = NOW()
    WHERE school_id = ${session.schoolId}::uuid AND local_id = ${localId}
  `;
  return NextResponse.json({ ok: true, message: `Student status updated to ${status}.` });
}
