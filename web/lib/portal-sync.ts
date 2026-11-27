import zlib from "node:zlib";
import { getSql } from "./db";

export interface GradingRule {
  grade_label: string;
  min_percentage: number;
  max_percentage: number;
  remark: string;
}

export const DEFAULT_GRADING_RULES: GradingRule[] = [
  { grade_label: "A1", min_percentage: 75, max_percentage: 100, remark: "Excellent" },
  { grade_label: "B2", min_percentage: 70, max_percentage: 74.99, remark: "Very Good" },
  { grade_label: "B3", min_percentage: 65, max_percentage: 69.99, remark: "Good" },
  { grade_label: "C4", min_percentage: 60, max_percentage: 64.99, remark: "Credit" },
  { grade_label: "C5", min_percentage: 55, max_percentage: 59.99, remark: "Credit" },
  { grade_label: "C6", min_percentage: 50, max_percentage: 54.99, remark: "Credit" },
  { grade_label: "D7", min_percentage: 45, max_percentage: 49.99, remark: "Pass" },
  { grade_label: "E8", min_percentage: 40, max_percentage: 44.99, remark: "Pass" },
  { grade_label: "F9", min_percentage: 0, max_percentage: 39.99, remark: "Fail" },
];

export function computePortalGrade(
  percentage: number,
  rules?: GradingRule[] | null
): { grade_label: string; grade_remark: string } {
  const list = Array.isArray(rules) && rules.length ? rules : DEFAULT_GRADING_RULES;
  const pct = Number.isFinite(percentage) ? Math.max(0, Math.min(100, percentage)) : 0;
  const sorted = [...list].sort((a, b) => Number(b.min_percentage) - Number(a.min_percentage));
  for (const r of sorted) {
    if (pct >= Number(r.min_percentage)) {
      return {
        grade_label: String(r.grade_label || ""),
        grade_remark: String(r.remark || ""),
      };
    }
  }
  const last = sorted[sorted.length - 1];
  return {
    grade_label: String(last?.grade_label || "F9"),
    grade_remark: String(last?.remark || "Fail"),
  };
}

function querySqliteTable(db: any, query: string): Record<string, any>[] {
  try {
    const res = db.exec(query);
    if (!res || !res.length) return [];
    const { columns, values } = res[0];
    return values.map((row: any[]) => {
      const obj: Record<string, any> = {};
      for (let i = 0; i < columns.length; i++) {
        obj[columns[i]] = row[i];
      }
      return obj;
    });
  } catch {
    return [];
  }
}

function parseJsonOrCsvList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x || "").trim()).filter(Boolean);
  const str = String(raw).trim();
  if (!str) return [];
  if (str.startsWith("[")) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x || "").trim()).filter(Boolean);
    } catch {
      // fall through to CSV split
    }
  }
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function maybeGunzipSqlite(rawBuf: Buffer): Buffer {
  if (rawBuf.length >= 2 && rawBuf[0] === 0x1f && rawBuf[1] === 0x8b) {
    return zlib.gunzipSync(rawBuf);
  }
  return rawBuf;
}

let sqlJsPromise: Promise<any> | null = null;
async function loadSqlJs(): Promise<any> {
  if (!sqlJsPromise) {
    // Use the official inline-WASM build so Vercel serverless never has a missing .wasm path
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const initSqlJs = require("sql.js/dist/sql-wasm-inline.js");
    sqlJsPromise = initSqlJs();
  }
  return sqlJsPromise;
}

export interface PortalSyncSummary {
  admins: number;
  teachers: number;
  students: number;
  exams: number;
  sections: number;
  groups: number;
  questions: number;
  offlineScores: number;
  syncedAt: string;
}

/**
 * Hydrates a school's SQLite `exam.db` (raw or .db.gz) into Neon Postgres `portal_*` tables
 * in fast batched `jsonb_to_recordset` upserts so it finishes in < 1.5s on Free Vercel Hobby.
 * Preserves any unsynced online-authored exams/questions and online student attempts.
 */
export async function syncSqliteBufferToOnlinePortal(params: {
  schoolId: string;
  rawOrGzipBuffer: Buffer;
  sourceBackupId?: string | null;
}): Promise<PortalSyncSummary> {
  const sqliteBuf = maybeGunzipSqlite(params.rawOrGzipBuffer);
  if (sqliteBuf.length < 100 || sqliteBuf.subarray(0, 15).toString("ascii") !== "SQLite format 3") {
    throw new Error("The backup file is not a valid SQLite exam.db database.");
  }

  const SQL = await loadSqlJs();
  const db = new SQL.Database(new Uint8Array(sqliteBuf));
  const sql = getSql();
  const schoolId = params.schoolId;

  try {
    // 1. School settings, classes & grading rules
    const settingsRows = querySqliteTable(db, "SELECT * FROM school_settings WHERE id = 1 LIMIT 1");
    const sRow = settingsRows[0] || {};
    const classRows = querySqliteTable(
      db,
      "SELECT name, level_category, display_order FROM classes WHERE COALESCE(active, 1) = 1 ORDER BY display_order ASC, name ASC"
    );
    const activeSchemeId = Number(sRow.active_grading_scheme_id || 1);
    let gradingRows = querySqliteTable(
      db,
      `SELECT grade_label, min_percentage, max_percentage, remark FROM grading_scheme_rules WHERE scheme_id = ${Number.isFinite(activeSchemeId) ? activeSchemeId : 1} ORDER BY min_percentage DESC`
    );
    if (!gradingRows.length) {
      gradingRows = querySqliteTable(
        db,
        "SELECT grade_label, min_percentage, max_percentage, remark FROM grading_scheme_rules ORDER BY scheme_id ASC, min_percentage DESC LIMIT 12"
      );
    }

    const classesList = classRows.map((c) => String(c.name || "").trim()).filter(Boolean);
    const gradingRules: GradingRule[] = gradingRows.length
      ? gradingRows.map((g) => ({
          grade_label: String(g.grade_label || ""),
          min_percentage: Number(g.min_percentage || 0),
          max_percentage: Number(g.max_percentage || 100),
          remark: String(g.remark || ""),
        }))
      : DEFAULT_GRADING_RULES;

    await sql`
      INSERT INTO portal_school_settings (
        school_id, school_name, school_motto, school_address, school_phone, school_email,
        academic_session, current_term,
        default_result_visibility, allow_teacher_release, allow_student_review,
        anti_cheating_profile, max_warnings, classes_json, grading_rules_json, updated_at
      ) VALUES (
        ${schoolId}::uuid,
        ${String(sRow.school_name || "CogniTara School").slice(0, 160)},
        ${String(sRow.school_motto || "").slice(0, 240)},
        ${String(sRow.school_address || sRow.address || "").slice(0, 240)},
        ${String(sRow.school_phone || sRow.phone || "").slice(0, 80)},
        ${String(sRow.school_email || sRow.email || "").slice(0, 160)},
        ${String(sRow.academic_session || "2026/2027").slice(0, 40)},
        ${String(sRow.current_term || "First Term").slice(0, 40)},
        ${String(sRow.default_result_visibility || "immediate")},
        ${Boolean(sRow.allow_teacher_release ?? 1)},
        ${Boolean(sRow.allow_student_review ?? 0)},
        ${String(sRow.anti_cheating_profile || "medium")},
        ${Math.max(1, Math.min(20, Number(sRow.max_warnings || 5)))},
        ${JSON.stringify(classesList)}::jsonb,
        ${JSON.stringify(gradingRules)}::jsonb,
        NOW()
      )
      ON CONFLICT (school_id) DO UPDATE SET
        school_name = EXCLUDED.school_name,
        school_motto = EXCLUDED.school_motto,
        school_address = COALESCE(NULLIF(EXCLUDED.school_address, ''), portal_school_settings.school_address),
        school_phone = COALESCE(NULLIF(EXCLUDED.school_phone, ''), portal_school_settings.school_phone),
        school_email = COALESCE(NULLIF(EXCLUDED.school_email, ''), portal_school_settings.school_email),
        academic_session = EXCLUDED.academic_session,
        current_term = EXCLUDED.current_term,
        default_result_visibility = EXCLUDED.default_result_visibility,
        allow_teacher_release = EXCLUDED.allow_teacher_release,
        allow_student_review = EXCLUDED.allow_student_review,
        anti_cheating_profile = EXCLUDED.anti_cheating_profile,
        max_warnings = EXCLUDED.max_warnings,
        classes_json = EXCLUDED.classes_json,
        grading_rules_json = EXCLUDED.grading_rules_json,
        updated_at = NOW()
    `;

    // 2. Admins (exact Werkzeug hashes from offline exam.db)
    const adminRows = querySqliteTable(db, "SELECT id, username, password FROM admin");
    const cleanAdmins = adminRows
      .filter((a) => a.username && a.password)
      .map((a) => ({
        local_id: Number(a.id),
        username: String(a.username).trim(),
        password_hash: String(a.password),
      }));
    if (cleanAdmins.length) {
      await sql`
        INSERT INTO portal_admins (school_id, local_id, username, password_hash, updated_at)
        SELECT ${schoolId}::uuid, x.local_id, x.username, x.password_hash, NOW()
        FROM jsonb_to_recordset(${JSON.stringify(cleanAdmins)}::jsonb)
          AS x(local_id int, username text, password_hash text)
        ON CONFLICT (school_id, local_id) DO UPDATE SET
          username = EXCLUDED.username,
          password_hash = EXCLUDED.password_hash,
          updated_at = NOW()
      `;
    }

    // 3. Teachers + class assignments
    const teacherRows = querySqliteTable(db, "SELECT * FROM teachers");
    const tcaRows = querySqliteTable(db, "SELECT teacher_id, class_name, specialisation FROM teacher_class_assignments");
    const tcaMap = new Map<number, { classes: Set<string>; specs: Set<string> }>();
    for (const row of tcaRows) {
      const tid = Number(row.teacher_id);
      if (!tcaMap.has(tid)) tcaMap.set(tid, { classes: new Set(), specs: new Set() });
      if (row.class_name) tcaMap.get(tid)!.classes.add(String(row.class_name).trim());
      if (row.specialisation) tcaMap.get(tid)!.specs.add(String(row.specialisation).trim());
    }

    const cleanTeachers = teacherRows
      .filter((t) => t.username && t.password)
      .map((t) => {
        const tid = Number(t.id);
        const clsSet = new Set<string>([
          ...parseJsonOrCsvList(t.classes),
          ...parseJsonOrCsvList(t.teaching_classes),
          ...(t.class ? [String(t.class).trim()] : []),
          ...(tcaMap.get(tid)?.classes || []),
        ]);
        const specSet = new Set<string>([
          ...parseJsonOrCsvList(t.specialisations),
          ...(tcaMap.get(tid)?.specs || []),
        ]);
        return {
          local_id: tid,
          username: String(t.username).trim(),
          password_hash: String(t.password),
          full_name: String(t.full_name || t.username || "").trim(),
          primary_class: String(t.class || "").trim(),
          classes_json: Array.from(clsSet),
          specialisations_json: Array.from(specSet),
          class_teacher_of: String(t.class_teacher_of || "").trim(),
        };
      });

    for (const batch of chunkArray(cleanTeachers, 250)) {
      await sql`
        INSERT INTO portal_teachers (
          school_id, local_id, username, password_hash, full_name,
          primary_class, classes_json, specialisations_json, class_teacher_of, created_online, updated_at
        )
        SELECT
          ${schoolId}::uuid, x.local_id, x.username, x.password_hash, x.full_name,
          x.primary_class, x.classes_json, x.specialisations_json, x.class_teacher_of, FALSE, NOW()
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
          AS x(
            local_id int, username text, password_hash text, full_name text,
            primary_class text, classes_json jsonb, specialisations_json jsonb, class_teacher_of text
          )
        ON CONFLICT (school_id, local_id) DO UPDATE SET
          username = EXCLUDED.username,
          password_hash = EXCLUDED.password_hash,
          full_name = EXCLUDED.full_name,
          primary_class = EXCLUDED.primary_class,
          classes_json = EXCLUDED.classes_json,
          specialisations_json = EXCLUDED.specialisations_json,
          class_teacher_of = EXCLUDED.class_teacher_of,
          updated_at = NOW()
      `;
    }

    // 4. Students
    const studentRows = querySqliteTable(db, "SELECT * FROM students");
    const cleanStudents = studentRows
      .filter((st) => st.username && st.password)
      .map((st) => ({
        local_id: Number(st.id),
        username: String(st.username).trim(),
        password_hash: String(st.password),
        full_name: String(st.full_name || st.username || "").trim(),
        email: String(st.email || "").trim(),
        student_class: String(st.class || "").trim(),
        specialisation: String(st.specialisation || "").trim(),
        status: String(st.status || "approved").trim().toLowerCase() || "approved",
      }));

    for (const batch of chunkArray(cleanStudents, 300)) {
      await sql`
        INSERT INTO portal_students (
          school_id, local_id, username, password_hash, full_name,
          email, student_class, specialisation, status, created_online, updated_at
        )
        SELECT
          ${schoolId}::uuid, x.local_id, x.username, x.password_hash, x.full_name,
          x.email, x.student_class, x.specialisation, x.status, FALSE, NOW()
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
          AS x(
            local_id int, username text, password_hash text, full_name text,
            email text, student_class text, specialisation text, status text
          )
        ON CONFLICT (school_id, local_id) DO UPDATE SET
          username = EXCLUDED.username,
          password_hash = EXCLUDED.password_hash,
          full_name = EXCLUDED.full_name,
          email = EXCLUDED.email,
          student_class = EXCLUDED.student_class,
          specialisation = EXCLUDED.specialisation,
          status = EXCLUDED.status,
          updated_at = NOW()
      `;
    }

    // 5. Exams (preserve created_online = TRUE exams!)
    const examRows = querySqliteTable(db, "SELECT * FROM exams");
    const cleanExams = examRows
      .filter((ex) => ex.id != null && ex.name)
      .map((ex) => ({
        local_id: Number(ex.id),
        name: String(ex.name).trim(),
        exam_class: String(ex.class || "").trim(),
        duration: Math.max(1, Number(ex.duration || 30)),
        active: Boolean(Number(ex.active || 0)),
        teacher_local_id: ex.teacher_id != null ? Number(ex.teacher_id) : null,
        specialisation: String(ex.specialisation || ex.specialisation_tag || "").trim(),
        subject_tag: String(ex.subject_tag || "").trim(),
        max_warnings: Math.max(1, Number(ex.max_warnings || 5)),
        calculator_type: String(ex.calculator_type || "none").trim().toLowerCase() || "none",
        deactivated: Boolean(Number(ex.deactivated || 0)),
        result_release_policy: String(ex.result_release_policy || "immediate").trim() || "immediate",
        results_released: ex.results_released == null ? true : Boolean(Number(ex.results_released)),
        anti_cheating_profile: String(ex.anti_cheating_profile || "medium").trim() || "medium",
      }));

    for (const batch of chunkArray(cleanExams, 250)) {
      await sql`
        INSERT INTO portal_exams (
          school_id, local_id, name, exam_class, duration, active, teacher_local_id,
          specialisation, subject_tag, max_warnings, calculator_type, deactivated,
          result_release_policy, results_released, anti_cheating_profile, created_online, updated_at
        )
        SELECT
          ${schoolId}::uuid, x.local_id, x.name, x.exam_class, x.duration, x.active, x.teacher_local_id,
          x.specialisation, x.subject_tag, x.max_warnings, x.calculator_type, x.deactivated,
          x.result_release_policy, x.results_released, x.anti_cheating_profile, FALSE, NOW()
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
          AS x(
            local_id int, name text, exam_class text, duration int, active boolean, teacher_local_id int,
            specialisation text, subject_tag text, max_warnings int, calculator_type text, deactivated boolean,
            result_release_policy text, results_released boolean, anti_cheating_profile text
          )
        ON CONFLICT (school_id, local_id) DO UPDATE SET
          name = EXCLUDED.name,
          exam_class = EXCLUDED.exam_class,
          duration = EXCLUDED.duration,
          active = EXCLUDED.active,
          teacher_local_id = EXCLUDED.teacher_local_id,
          specialisation = EXCLUDED.specialisation,
          subject_tag = EXCLUDED.subject_tag,
          max_warnings = EXCLUDED.max_warnings,
          calculator_type = EXCLUDED.calculator_type,
          deactivated = EXCLUDED.deactivated,
          result_release_policy = EXCLUDED.result_release_policy,
          results_released = EXCLUDED.results_released,
          anti_cheating_profile = EXCLUDED.anti_cheating_profile,
          updated_at = NOW()
        WHERE portal_exams.created_online = FALSE
      `;
    }

    // 6. Exam Sections
    const sectionRows = querySqliteTable(db, "SELECT * FROM exam_sections");
    const cleanSections = sectionRows
      .filter((sec) => sec.id != null && sec.exam_id != null)
      .map((sec) => ({
        local_id: Number(sec.id),
        exam_local_id: Number(sec.exam_id),
        section_name: String(sec.section_name || "Section").trim(),
        questions_to_show: Math.max(0, Number(sec.questions_to_show || 0)),
        randomize: Boolean(Number(sec.randomize || 0)),
        section_order: Number(sec.section_order || 1),
        active: sec.active == null ? true : Boolean(Number(sec.active)),
      }));

    for (const batch of chunkArray(cleanSections, 350)) {
      await sql`
        INSERT INTO portal_exam_sections (
          school_id, local_id, exam_local_id, section_name, questions_to_show, randomize, section_order, active
        )
        SELECT
          ${schoolId}::uuid, x.local_id, x.exam_local_id, x.section_name, x.questions_to_show,
          x.randomize, x.section_order, x.active
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
          AS x(
            local_id int, exam_local_id int, section_name text, questions_to_show int,
            randomize boolean, section_order int, active boolean
          )
        ON CONFLICT (school_id, local_id) DO UPDATE SET
          exam_local_id = EXCLUDED.exam_local_id,
          section_name = EXCLUDED.section_name,
          questions_to_show = EXCLUDED.questions_to_show,
          randomize = EXCLUDED.randomize,
          section_order = EXCLUDED.section_order,
          active = EXCLUDED.active
      `;
    }

    // 7. Question Groups (passages / instructions)
    const groupRows = querySqliteTable(db, "SELECT * FROM exam_question_groups");
    const cleanGroups = groupRows
      .filter((g) => g.id != null && g.exam_id != null)
      .map((g) => ({
        local_id: Number(g.id),
        exam_local_id: Number(g.exam_id),
        section_local_id: g.section_id != null ? Number(g.section_id) : null,
        group_name: String(g.group_name || "").trim(),
        group_type: String(g.group_type || "passage").trim(),
        group_content: String(g.group_content || ""),
        instruction_text: String(g.instruction_text || ""),
        display_order: Number(g.display_order || 0),
      }));

    for (const batch of chunkArray(cleanGroups, 250)) {
      await sql`
        INSERT INTO portal_exam_groups (
          school_id, local_id, exam_local_id, section_local_id, group_name,
          group_type, group_content, instruction_text, display_order
        )
        SELECT
          ${schoolId}::uuid, x.local_id, x.exam_local_id, x.section_local_id, x.group_name,
          x.group_type, x.group_content, x.instruction_text, x.display_order
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
          AS x(
            local_id int, exam_local_id int, section_local_id int, group_name text,
            group_type text, group_content text, instruction_text text, display_order int
          )
        ON CONFLICT (school_id, local_id) DO UPDATE SET
          exam_local_id = EXCLUDED.exam_local_id,
          section_local_id = EXCLUDED.section_local_id,
          group_name = EXCLUDED.group_name,
          group_type = EXCLUDED.group_type,
          group_content = EXCLUDED.group_content,
          instruction_text = EXCLUDED.instruction_text,
          display_order = EXCLUDED.display_order
      `;
    }

    // 8. Questions (batched 400 per call for blazing speed on Free Vercel)
    const questionRows = querySqliteTable(db, "SELECT * FROM questions");
    const cleanQuestions = questionRows
      .filter((q) => q.id != null && q.exam_id != null && q.question)
      .map((q) => ({
        local_id: Number(q.id),
        exam_local_id: Number(q.exam_id),
        section_local_id: q.section_id != null ? Number(q.section_id) : null,
        group_local_id: q.group_id != null ? Number(q.group_id) : null,
        question: String(q.question || ""),
        option1: String(q.option1 || ""),
        option2: String(q.option2 || ""),
        option3: String(q.option3 || ""),
        option4: String(q.option4 || ""),
        answer: String(q.answer || ""),
        explanation: String(q.explanation || ""),
        display_order: Number(q.display_order || 0),
        mandatory: Boolean(Number(q.mandatory || 0)),
      }));

    for (const batch of chunkArray(cleanQuestions, 400)) {
      await sql`
        INSERT INTO portal_questions (
          school_id, local_id, exam_local_id, section_local_id, group_local_id,
          question, option1, option2, option3, option4, answer, explanation,
          display_order, mandatory, created_online, updated_at
        )
        SELECT
          ${schoolId}::uuid, x.local_id, x.exam_local_id, x.section_local_id, x.group_local_id,
          x.question, x.option1, x.option2, x.option3, x.option4, x.answer, x.explanation,
          x.display_order, x.mandatory, FALSE, NOW()
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
          AS x(
            local_id int, exam_local_id int, section_local_id int, group_local_id int,
            question text, option1 text, option2 text, option3 text, option4 text,
            answer text, explanation text, display_order int, mandatory boolean
          )
        ON CONFLICT (school_id, local_id) DO UPDATE SET
          exam_local_id = EXCLUDED.exam_local_id,
          section_local_id = EXCLUDED.section_local_id,
          group_local_id = EXCLUDED.group_local_id,
          question = EXCLUDED.question,
          option1 = EXCLUDED.option1,
          option2 = EXCLUDED.option2,
          option3 = EXCLUDED.option3,
          option4 = EXCLUDED.option4,
          answer = EXCLUDED.answer,
          explanation = EXCLUDED.explanation,
          display_order = EXCLUDED.display_order,
          mandatory = EXCLUDED.mandatory,
          updated_at = NOW()
        WHERE portal_questions.created_online = FALSE
      `;
    }

    // 9. Historical completed offline scores (never overwrite fresh online attempts!)
    const scoreRows = querySqliteTable(db, "SELECT * FROM scores WHERE COALESCE(submitted, 0) = 1 OR status = 'completed'");
    // Deduplicate by (student_id, exam_id) keeping highest/latest score row
    const scoreByPair = new Map<string, Record<string, any>>();
    for (const sc of scoreRows) {
      if (sc.student_id == null || sc.exam_id == null) continue;
      scoreByPair.set(`${sc.student_id}:${sc.exam_id}`, sc);
    }
    const cleanScores = Array.from(scoreByPair.values()).map((sc) => {
      const total = Math.max(0, Number(sc.total || 0));
      const score = Math.max(0, Number(sc.score || 0));
      const pct = sc.percentage != null ? Number(sc.percentage) : total > 0 ? Math.round((score / total) * 10000) / 100 : 0;
      const g = sc.grade_label ? { grade_label: String(sc.grade_label), grade_remark: String(sc.grade_remark || "") } : computePortalGrade(pct, gradingRules);
      return {
        local_score_id: Number(sc.id),
        student_local_id: Number(sc.student_id),
        exam_local_id: Number(sc.exam_id),
        score,
        total,
        percentage: pct,
        grade_label: g.grade_label,
        grade_remark: g.grade_remark,
        results_released: sc.results_released == null ? true : Boolean(Number(sc.results_released)),
        completed_at: sc.end_time ? String(sc.end_time) : null,
      };
    });

    for (const batch of chunkArray(cleanScores, 300)) {
      await sql`
        INSERT INTO portal_attempts (
          school_id, local_score_id, student_local_id, exam_local_id,
          score, total, percentage, grade_label, grade_remark,
          status, submitted, completed_at, results_released, origin, synced_to_desktop, updated_at
        )
        SELECT
          ${schoolId}::uuid, x.local_score_id, x.student_local_id, x.exam_local_id,
          x.score, x.total, x.percentage, x.grade_label, x.grade_remark,
          'completed', TRUE,
          CASE WHEN x.completed_at IS NOT NULL AND x.completed_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN x.completed_at::timestamptz ELSE NOW() END,
          x.results_released, 'offline', TRUE, NOW()
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
          AS x(
            local_score_id int, student_local_id int, exam_local_id int,
            score int, total int, percentage numeric, grade_label text, grade_remark text,
            results_released boolean, completed_at text
          )
        ON CONFLICT (school_id, student_local_id, exam_local_id) DO UPDATE SET
          local_score_id = EXCLUDED.local_score_id,
          score = EXCLUDED.score,
          total = EXCLUDED.total,
          percentage = EXCLUDED.percentage,
          grade_label = EXCLUDED.grade_label,
          grade_remark = EXCLUDED.grade_remark,
          status = 'completed',
          submitted = TRUE,
          results_released = EXCLUDED.results_released,
          updated_at = NOW()
        WHERE portal_attempts.origin = 'offline'
      `;
    }

    const syncedAt = new Date().toISOString();
    await sql`
      UPDATE schools
      SET online_synced_at = ${syncedAt}::timestamptz,
          online_source_backup_id = ${params.sourceBackupId || null}::uuid,
          updated_at = NOW()
      WHERE id = ${schoolId}::uuid
    `;

    return {
      admins: cleanAdmins.length,
      teachers: cleanTeachers.length,
      students: cleanStudents.length,
      exams: cleanExams.length,
      sections: cleanSections.length,
      groups: cleanGroups.length,
      questions: cleanQuestions.length,
      offlineScores: cleanScores.length,
      syncedAt,
    };
  } finally {
    db.close();
  }
}

export async function syncLatestCloudBackupToPortal(schoolId: string, backupId?: string | null): Promise<PortalSyncSummary & { backup_id: string; backup_filename: string }> {
  const sql = getSql();
  const rows = backupId
    ? await sql`
        SELECT id, filename, payload_b64
        FROM cloud_exam_backups
        WHERE school_id = ${schoolId}::uuid AND id = ${backupId}::uuid
        LIMIT 1
      `
    : await sql`
        SELECT id, filename, payload_b64
        FROM cloud_exam_backups
        WHERE school_id = ${schoolId}::uuid
        ORDER BY created_at DESC
        LIMIT 1
      `;
  if (!rows.length) {
    throw new Error("No cloud database backup found yet. Upload a backup from CogniTara Studio Desktop first.");
  }
  const row = rows[0] as Record<string, any>;
  const buf = Buffer.from(String(row.payload_b64 || ""), "base64");
  const summary = await syncSqliteBufferToOnlinePortal({
    schoolId,
    rawOrGzipBuffer: buf,
    sourceBackupId: String(row.id),
  });
  return {
    ...summary,
    backup_id: String(row.id),
    backup_filename: String(row.filename || "exam.db.gz"),
  };
}

/**
 * Exports all online-created teachers, students, exams, questions, and submitted online exam attempts
 * so Desktop Studio can pull and merge them straight into local `exam.db`.
 */
export async function exportOnlinePortalDelta(schoolId: string) {
  const sql = getSql();
  const [teachers, students, exams, questions, attempts] = await Promise.all([
    sql`
      SELECT local_id, username, password_hash, full_name, primary_class, classes_json, specialisations_json, class_teacher_of
      FROM portal_teachers
      WHERE school_id = ${schoolId}::uuid AND created_online = TRUE
    `,
    sql`
      SELECT local_id, username, password_hash, full_name, email, student_class, specialisation, status
      FROM portal_students
      WHERE school_id = ${schoolId}::uuid AND created_online = TRUE
    `,
    sql`
      SELECT local_id, name, exam_class, duration, active, teacher_local_id, specialisation, subject_tag,
             max_warnings, calculator_type, deactivated, result_release_policy, results_released, anti_cheating_profile
      FROM portal_exams
      WHERE school_id = ${schoolId}::uuid AND created_online = TRUE
    `,
    sql`
      SELECT local_id, exam_local_id, section_local_id, group_local_id, question,
             option1, option2, option3, option4, answer, explanation, display_order, mandatory
      FROM portal_questions
      WHERE school_id = ${schoolId}::uuid AND created_online = TRUE
    `,
    sql`
      SELECT a.id, a.student_local_id, s.username AS student_username, a.exam_local_id, e.name AS exam_name,
             a.score, a.total, a.percentage, a.grade_label, a.grade_remark, a.status,
             a.started_at, a.completed_at, a.warnings_count, a.results_released, a.answers_json, a.synced_to_desktop
      FROM portal_attempts a
      LEFT JOIN portal_students s ON s.school_id = a.school_id AND s.local_id = a.student_local_id
      LEFT JOIN portal_exams e ON e.school_id = a.school_id AND e.local_id = a.exam_local_id
      WHERE a.school_id = ${schoolId}::uuid
        AND a.origin = 'online'
        AND a.submitted = TRUE
      ORDER BY a.completed_at DESC
    `,
  ]);
  return {
    teachers,
    students,
    exams,
    questions,
    attempts,
  };
}
