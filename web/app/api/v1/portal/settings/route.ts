import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";
import { DEFAULT_GRADING_RULES } from "@/lib/portal-sync";
import { logPortalAudit } from "@/lib/portal-audit";

export const dynamic = "force-dynamic";

const CLASS_PRESETS: Record<string, string[]> = {
  nerdc: ["Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6", "JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"],
  british: ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12", "Year 13"],
  american: ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"],
};

export async function GET(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const sql = getSql();
    const [settingsRows, schoolRows, exams] = await Promise.all([
      sql`
        SELECT * FROM portal_school_settings
        WHERE school_id = ${session.schoolId}::uuid
        LIMIT 1
      `,
      sql`SELECT school_name, school_code, contact_email FROM schools WHERE id = ${session.schoolId}::uuid LIMIT 1`,
      sql`
        SELECT e.local_id, e.name, e.exam_class, e.subject_tag, e.result_release_policy, e.results_released,
               (SELECT COUNT(*)::int FROM portal_attempts a WHERE a.school_id = e.school_id AND a.exam_local_id = e.local_id AND a.submitted = TRUE) AS submitted_count
        FROM portal_exams e
        WHERE e.school_id = ${session.schoolId}::uuid
        ORDER BY e.exam_class ASC, e.name ASC
      `,
    ]);

    const sRow = (settingsRows[0] || {}) as Record<string, any>;
    const sc = (schoolRows[0] || {}) as Record<string, any>;
    const classes: string[] =
      Array.isArray(sRow.classes_json) && sRow.classes_json.length
        ? sRow.classes_json
        : ["Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"];
    const gradingRules =
      Array.isArray(sRow.grading_rules_json) && sRow.grading_rules_json.length
        ? sRow.grading_rules_json
        : DEFAULT_GRADING_RULES;

    return NextResponse.json({
      ok: true,
      settings: {
        school_name: String(sRow.school_name || sc.school_name || "CogniTara School"),
        school_code: String(sc.school_code || ""),
        school_motto: String(sRow.school_motto || ""),
        academic_session: String(sRow.academic_session || "2026/2027"),
        current_term: String(sRow.current_term || "First Term"),
        school_email: String(sRow.school_email || sc.contact_email || ""),
        school_phone: String(sRow.school_phone || ""),
        school_address: String(sRow.school_address || ""),
        school_logo_b64: String(sRow.school_logo_b64 || ""),
        anti_cheating_profile: String(sRow.anti_cheating_profile || "medium"),
        max_warnings: Number(sRow.max_warnings || 5),
        default_result_visibility: String(sRow.default_result_visibility || "immediate"),
        allow_teacher_release: sRow.allow_teacher_release !== false,
        allow_student_review: Boolean(sRow.allow_student_review),
        grading_scheme_name: String(sRow.grading_scheme_name || "WAEC 9-Point"),
        grading_scheme_desc: String(sRow.grading_scheme_desc || "Standard institutional grading scale"),
        classes,
        grading_rules: gradingRules,
      },
      exams,
    });
  } catch (err) {
    console.error("Portal settings GET error:", err);
    return NextResponse.json({ ok: false, message: "Could not load school settings." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["admin"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });

    const action = String(body.action || "update_general");
    const sql = getSql();

    // Ensure settings row exists
    await sql`
      INSERT INTO portal_school_settings (school_id, school_name)
      SELECT id, school_name FROM schools WHERE id = ${session.schoolId}::uuid
      ON CONFLICT (school_id) DO NOTHING
    `;

    if (action === "update_general") {
      const schoolName = String(body.school_name || "").trim().slice(0, 140);
      if (!schoolName) {
        return NextResponse.json({ ok: false, message: "School name is required." }, { status: 400 });
      }
      const motto = String(body.school_motto || "").trim().slice(0, 200);
      const academicSession = String(body.academic_session || "2026/2027").trim().slice(0, 40);
      const currentTerm = String(body.current_term || "First Term").trim().slice(0, 40);
      const schoolEmail = String(body.school_email || "").trim().slice(0, 120);
      const schoolPhone = String(body.school_phone || "").trim().slice(0, 50);
      const schoolAddress = String(body.school_address || "").trim().slice(0, 240);
      const antiCheat = ["low", "medium", "high"].includes(String(body.anti_cheating_profile))
        ? String(body.anti_cheating_profile)
        : "medium";
      const maxWarnings = Math.max(1, Math.min(20, Math.floor(Number(body.max_warnings || 5))));
      const defaultVis = String(body.default_result_visibility) === "withheld" ? "withheld" : "immediate";

      await sql`
        UPDATE portal_school_settings
        SET school_name = ${schoolName},
            school_motto = ${motto},
            academic_session = ${academicSession},
            current_term = ${currentTerm},
            school_email = ${schoolEmail},
            school_phone = ${schoolPhone},
            school_address = ${schoolAddress},
            anti_cheating_profile = ${antiCheat},
            max_warnings = ${maxWarnings},
            default_result_visibility = ${defaultVis},
            updated_at = NOW()
        WHERE school_id = ${session.schoolId}::uuid
      `;
      await sql`
        UPDATE schools SET school_name = ${schoolName}, updated_at = NOW()
        WHERE id = ${session.schoolId}::uuid
      `;

      await logPortalAudit({
        schoolId: session.schoolId,
        actorRole: "admin",
        actorUsername: session.username,
        action: "Updated school general settings",
        details: `${schoolName} · ${currentTerm} ${academicSession}`,
      });

      return NextResponse.json({ ok: true, message: "School settings saved." });
    }

    if (action === "update_logo") {
      const logoB64 = String(body.school_logo_b64 || "").slice(0, 350_000);
      await sql`
        UPDATE portal_school_settings
        SET school_logo_b64 = ${logoB64}, updated_at = NOW()
        WHERE school_id = ${session.schoolId}::uuid
      `;
      return NextResponse.json({ ok: true, message: logoB64 ? "School logo updated." : "School logo removed." });
    }

    if (action === "apply_class_preset") {
      const preset = String(body.preset || "").toLowerCase();
      const list = CLASS_PRESETS[preset];
      if (!list) return NextResponse.json({ ok: false, message: "Invalid class preset." }, { status: 400 });
      await sql`
        UPDATE portal_school_settings
        SET classes_json = ${JSON.stringify(list)}::jsonb, updated_at = NOW()
        WHERE school_id = ${session.schoolId}::uuid
      `;
      await logPortalAudit({
        schoolId: session.schoolId,
        actorRole: "admin",
        actorUsername: session.username,
        action: `Applied class preset (${preset.toUpperCase()})`,
        details: `${list.length} classes configured`,
      });
      return NextResponse.json({ ok: true, classes: list, message: `Applied ${list.length} classes.` });
    }

    if (action === "add_class" || action === "delete_class") {
      const className = String(body.class_name || "").trim().slice(0, 60);
      if (!className) return NextResponse.json({ ok: false, message: "Class name is required." }, { status: 400 });
      const rows = await sql`SELECT classes_json FROM portal_school_settings WHERE school_id = ${session.schoolId}::uuid LIMIT 1`;
      const cur: string[] = Array.isArray(rows[0]?.classes_json) ? [...rows[0].classes_json] : [];
      const next =
        action === "add_class"
          ? cur.includes(className)
            ? cur
            : [...cur, className]
          : cur.filter((c) => c !== className);
      await sql`
        UPDATE portal_school_settings
        SET classes_json = ${JSON.stringify(next)}::jsonb, updated_at = NOW()
        WHERE school_id = ${session.schoolId}::uuid
      `;
      return NextResponse.json({ ok: true, classes: next, message: action === "add_class" ? `Added ${className}.` : `Removed ${className}.` });
    }

    if (action === "save_grading") {
      const schemeName = String(body.grading_scheme_name || "Custom Scale").trim().slice(0, 80);
      const schemeDesc = String(body.grading_scheme_desc || "").trim().slice(0, 200);
      const rules = Array.isArray(body.grading_rules) ? body.grading_rules : [];
      const cleanRules = rules
        .map((r: any) => ({
          grade_label: String(r?.grade_label || "").trim().slice(0, 12),
          min_percentage: Number(r?.min_percentage ?? 0),
          max_percentage: Number(r?.max_percentage ?? 100),
          grade_point: Number(r?.grade_point ?? 0),
          remark: String(r?.remark || "").trim().slice(0, 40),
        }))
        .filter((r) => r.grade_label.length > 0)
        .sort((a, b) => b.min_percentage - a.min_percentage);

      if (!cleanRules.length) {
        return NextResponse.json({ ok: false, message: "Add at least one grading tier rule." }, { status: 400 });
      }
      await sql`
        UPDATE portal_school_settings
        SET grading_scheme_name = ${schemeName},
            grading_scheme_desc = ${schemeDesc},
            grading_rules_json = ${JSON.stringify(cleanRules)}::jsonb,
            updated_at = NOW()
        WHERE school_id = ${session.schoolId}::uuid
      `;
      await logPortalAudit({
        schoolId: session.schoolId,
        actorRole: "admin",
        actorUsername: session.username,
        action: `Saved grading scheme (${schemeName})`,
        details: `${cleanRules.length} tier rules active`,
      });
      return NextResponse.json({ ok: true, grading_rules: cleanRules, message: "Grading scheme activated." });
    }

    if (action === "bulk_release_results") {
      const examIds = Array.isArray(body.exam_ids)
        ? body.exam_ids.map((n) => Number(n)).filter((n) => Number.isInteger(n))
        : [];
      const release = Boolean(body.release);
      if (!examIds.length) {
        return NextResponse.json({ ok: false, message: "Select at least one examination." }, { status: 400 });
      }
      for (const eid of examIds) {
        await sql`
          UPDATE portal_exams
          SET results_released = ${release},
              result_release_policy = ${release ? "immediate" : "withheld"},
              updated_at = NOW()
          WHERE school_id = ${session.schoolId}::uuid AND local_id = ${eid}
        `;
        await sql`
          UPDATE portal_attempts
          SET results_released = ${release}, updated_at = NOW()
          WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${eid}
        `;
      }
      await logPortalAudit({
        schoolId: session.schoolId,
        actorRole: "admin",
        actorUsername: session.username,
        action: release ? "Bulk released exam results" : "Bulk withheld exam results",
        details: `${examIds.length} examination(s) updated`,
      });
      return NextResponse.json({
        ok: true,
        message: release ? `Released results for ${examIds.length} exam(s).` : `Withheld results for ${examIds.length} exam(s).`,
      });
    }

    return NextResponse.json({ ok: false, message: "Unsupported settings action." }, { status: 400 });
  } catch (err) {
    console.error("Portal settings POST error:", err);
    return NextResponse.json({ ok: false, message: "Could not save school settings." }, { status: 500 });
  }
}
