import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requirePortalAccess } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

function gradeLetter(pct: number, stored?: string): "A" | "B" | "C" | "D" | "F" {
  const s = String(stored || "").trim().toUpperCase()[0];
  if (s === "A" || s === "B" || s === "C" || s === "D" || s === "F") return s;
  if (pct >= 75) return "A";
  if (pct >= 65) return "B";
  if (pct >= 55) return "C";
  if (pct >= 45) return "D";
  return "F";
}

export async function GET(req: NextRequest) {
  const gate = await requirePortalAccess(req, ["admin", "teacher"]);
  if (!gate.ok) return gate.response;
  const { session } = gate;

  try {
    const scope = String(req.nextUrl.searchParams.get("scope") || (session.role === "admin" ? "school" : "teacher"));
    const classFilter = String(req.nextUrl.searchParams.get("className") || "").trim();
    const examFilter = Number(req.nextUrl.searchParams.get("examId") || 0);
    const studentId = Number(req.nextUrl.searchParams.get("studentId") || 0);
    const sql = getSql();

    // 1. Student Profile (+ optional single exam script detail)
    if (scope === "student" && studentId > 0) {
      const [stRows, attRows] = await Promise.all([
        sql`
          SELECT local_id, username, full_name, email, student_class, specialisation, status
          FROM portal_students
          WHERE school_id = ${session.schoolId}::uuid AND local_id = ${studentId}
          LIMIT 1
        `,
        sql`
          SELECT a.id, a.exam_local_id, a.score, a.total, a.percentage, a.grade_label, a.grade_remark,
                 a.started_at, a.completed_at, a.warnings_count, a.time_spent_seconds, a.answers_json,
                 e.name AS exam_name, e.subject_tag, e.duration
          FROM portal_attempts a
          LEFT JOIN portal_exams e ON e.school_id = a.school_id AND e.local_id = a.exam_local_id
          WHERE a.school_id = ${session.schoolId}::uuid
            AND a.student_local_id = ${studentId}
            AND a.submitted = TRUE
          ORDER BY a.completed_at DESC
        `,
      ]);
      if (!stRows.length) return NextResponse.json({ ok: false, message: "Student not found." }, { status: 404 });
      const student = stRows[0] as Record<string, any>;

      // Class average for comparison
      const classAvgRows = await sql`
        SELECT AVG(a.percentage)::numeric(5,1) AS avg_pct
        FROM portal_attempts a
        JOIN portal_students s ON s.school_id = a.school_id AND s.local_id = a.student_local_id
        WHERE a.school_id = ${session.schoolId}::uuid AND a.submitted = TRUE AND s.student_class = ${student.student_class}
      `;

      const completed = attRows as Record<string, any>[];
      const pcts = completed.map((a) => Number(a.percentage || 0));
      const overallAvg = pcts.length ? Math.round((pcts.reduce((x, y) => x + y, 0) / pcts.length) * 10) / 10 : 0;
      const best = pcts.length ? Math.round(Math.max(...pcts)) : 0;
      const lowest = pcts.length ? Math.round(Math.min(...pcts)) : 0;

      let scriptDetail: any = null;
      if (examFilter > 0) {
        const target = completed.find((a) => Number(a.exam_local_id) === examFilter);
        if (target) {
          const qs = await sql`
            SELECT local_id, question, option1, option2, option3, option4, answer, explanation
            FROM portal_questions
            WHERE school_id = ${session.schoolId}::uuid AND exam_local_id = ${examFilter}
            ORDER BY display_order ASC, local_id ASC
          `;
          const ansObj = target.answers_json && typeof target.answers_json === "object" ? target.answers_json : {};
          scriptDetail = {
            attempt: target,
            items: (qs as Record<string, any>[]).map((q) => {
              const given = ansObj[String(q.local_id)] ? String(ansObj[String(q.local_id)]) : "";
              const correct = String(q.answer || "");
              return {
                local_id: Number(q.local_id),
                question: String(q.question || ""),
                options: [q.option1, q.option2, q.option3, q.option4].map((o) => String(o || "")).filter(Boolean),
                given_answer: given,
                correct_answer: correct,
                is_correct: Boolean(given && given.trim() === correct.trim()),
              };
            }),
          };
        }
      }

      return NextResponse.json({
        ok: true,
        student,
        kpis: {
          overall_avg: overallAvg,
          class_avg: Number(classAvgRows[0]?.avg_pct || 0),
          best_score: best,
          lowest_score: lowest,
          exams_taken: completed.length,
        },
        history: completed.map((a) => ({
          id: String(a.id),
          exam_local_id: Number(a.exam_local_id),
          exam_name: String(a.exam_name || "Examination"),
          subject_tag: String(a.subject_tag || "General"),
          score: Number(a.score || 0),
          total: Number(a.total || 0),
          percentage: Number(a.percentage || 0),
          grade_label: String(a.grade_label || gradeLetter(Number(a.percentage || 0))),
          time_spent_seconds: Number(a.time_spent_seconds || 0),
          completed_at: a.completed_at,
        })),
        script_detail: scriptDetail,
      });
    }

    // Load common datasets for School / Class / Teacher Analytics, Results Tree, & Attempts
    const [students, teachers, exams, attempts] = await Promise.all([
      sql`
        SELECT local_id, username, full_name, student_class, specialisation, status
        FROM portal_students
        WHERE school_id = ${session.schoolId}::uuid
        ORDER BY student_class ASC, full_name ASC
      `,
      sql`
        SELECT local_id, username, full_name, primary_class, classes_json
        FROM portal_teachers
        WHERE school_id = ${session.schoolId}::uuid
      `,
      session.role === "teacher"
        ? sql`
            SELECT local_id, name, exam_class, subject_tag, specialisation, duration, active, teacher_local_id
            FROM portal_exams
            WHERE school_id = ${session.schoolId}::uuid AND teacher_local_id = ${session.localId}
            ORDER BY local_id DESC
          `
        : sql`
            SELECT e.local_id, e.name, e.exam_class, e.subject_tag, e.specialisation, e.duration, e.active, e.teacher_local_id,
                   t.full_name AS teacher_name
            FROM portal_exams e
            LEFT JOIN portal_teachers t ON t.school_id = e.school_id AND t.local_id = e.teacher_local_id
            WHERE e.school_id = ${session.schoolId}::uuid
            ORDER BY e.local_id DESC
          `,
      sql`
        SELECT a.id, a.student_local_id, a.exam_local_id, a.score, a.total, a.percentage,
               a.grade_label, a.grade_remark, a.status, a.submitted, a.started_at, a.completed_at,
               a.warnings_count, a.results_released,
               s.full_name AS student_name, s.username AS student_username, s.student_class,
               e.name AS exam_name, e.subject_tag, e.exam_class, e.teacher_local_id
        FROM portal_attempts a
        LEFT JOIN portal_students s ON s.school_id = a.school_id AND s.local_id = a.student_local_id
        LEFT JOIN portal_exams e ON e.school_id = a.school_id AND e.local_id = a.exam_local_id
        WHERE a.school_id = ${session.schoolId}::uuid
        ORDER BY a.started_at DESC
        LIMIT 1500
      `,
    ]);

    const allAttempts = (attempts as Record<string, any>[]).filter((a) => {
      if (session.role === "teacher" && Number(a.teacher_local_id) !== session.localId) return false;
      if (classFilter && String(a.student_class || a.exam_class || "") !== classFilter) return false;
      if (examFilter > 0 && Number(a.exam_local_id) !== examFilter) return false;
      return true;
    });

    // 2. Exam Attempts table view (admin_exam_attempts)
    if (scope === "attempts") {
      const done = allAttempts.filter((a) => a.submitted).length;
      const inProg = allAttempts.length - done;
      return NextResponse.json({
        ok: true,
        kpis: { total: allAttempts.length, completed: done, in_progress: inProg },
        attempts: allAttempts,
      });
    }

    const completed = allAttempts.filter((a) => a.submitted);

    // 3. Nested Class -> Student -> Exam Results tree (admin/results)
    if (scope === "results") {
      const byClass = new Map<string, Map<number, { student_local_id: number; full_name: string; username: string; items: any[] }>>();
      for (const a of completed) {
        const cls = String(a.student_class || a.exam_class || "Unassigned");
        if (!byClass.has(cls)) byClass.set(cls, new Map());
        const stuMap = byClass.get(cls)!;
        const sid = Number(a.student_local_id);
        if (!stuMap.has(sid)) {
          stuMap.set(sid, {
            student_local_id: sid,
            full_name: String(a.student_name || a.student_username || "Student"),
            username: String(a.student_username || ""),
            items: [],
          });
        }
        stuMap.get(sid)!.items.push({
          attempt_id: String(a.id),
          exam_local_id: Number(a.exam_local_id),
          exam_name: String(a.exam_name || "Examination"),
          score: Number(a.score || 0),
          total: Number(a.total || 0),
          percentage: Number(a.percentage || 0),
          grade_label: String(a.grade_label || gradeLetter(Number(a.percentage || 0))),
        });
      }

      const classGroups = Array.from(byClass.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([className, stuMap]) => {
          const studentList = Array.from(stuMap.values())
            .map((st) => {
              const avg = st.items.length
                ? Math.round((st.items.reduce((x, y) => x + y.percentage, 0) / st.items.length) * 10) / 10
                : 0;
              return { ...st, average: avg };
            })
            .sort((a, b) => b.average - a.average);
          const examCount = studentList.reduce((x, s) => x + s.items.length, 0);
          return { class_name: className, student_count: studentList.length, exam_count: examCount, students: studentList };
        });

      return NextResponse.json({
        ok: true,
        kpis: {
          classes: classGroups.length,
          students: (students as any[]).filter((s) => s.status === "approved").length,
          completed_exams: completed.length,
        },
        class_groups: classGroups,
      });
    }

    // 4. Analytics (school, class, or teacher)
    const gradeBuckets: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    const classAgg = new Map<string, { sum: number; count: number; pass: number }>();
    const subjectAgg = new Map<string, { sum: number; count: number }>();
    const studentAgg = new Map<number, { local_id: number; full_name: string; username: string; student_class: string; sum: number; count: number; best: number; lowest: number }>();
    const examAgg = new Map<number, { local_id: number; name: string; exam_class: string; teacher_name: string; sum: number; count: number; highest: number; lowest: number }>();

    for (const ex of exams as Record<string, any>[]) {
      examAgg.set(Number(ex.local_id), {
        local_id: Number(ex.local_id),
        name: String(ex.name || "Exam"),
        exam_class: String(ex.exam_class || ""),
        teacher_name: String(ex.teacher_name || ""),
        sum: 0,
        count: 0,
        highest: 0,
        lowest: 100,
      });
    }

    for (const a of completed) {
      const pct = Number(a.percentage || 0);
      gradeBuckets[gradeLetter(pct, a.grade_label)]++;

      const cls = String(a.student_class || a.exam_class || "Unassigned");
      const c = classAgg.get(cls) || { sum: 0, count: 0, pass: 0 };
      c.sum += pct;
      c.count++;
      if (pct >= 50) c.pass++;
      classAgg.set(cls, c);

      const subj = String(a.subject_tag || a.exam_name || "General");
      const sb = subjectAgg.get(subj) || { sum: 0, count: 0 };
      sb.sum += pct;
      sb.count++;
      subjectAgg.set(subj, sb);

      const sid = Number(a.student_local_id);
      const st = studentAgg.get(sid) || {
        local_id: sid,
        full_name: String(a.student_name || a.student_username || "Student"),
        username: String(a.student_username || ""),
        student_class: cls,
        sum: 0,
        count: 0,
        best: 0,
        lowest: 100,
      };
      st.sum += pct;
      st.count++;
      st.best = Math.max(st.best, pct);
      st.lowest = Math.min(st.lowest, pct);
      studentAgg.set(sid, st);

      const eid = Number(a.exam_local_id);
      const ex = examAgg.get(eid);
      if (ex) {
        ex.sum += pct;
        ex.count++;
        ex.highest = Math.max(ex.highest, pct);
        ex.lowest = Math.min(ex.lowest, pct);
      }
    }

    const overallAvg = completed.length
      ? Math.round((completed.reduce((x, a) => x + Number(a.percentage || 0), 0) / completed.length) * 10) / 10
      : 0;
    const distinctions = completed.filter((a) => Number(a.percentage || 0) >= 75).length;

    const studentRows = Array.from(studentAgg.values())
      .map((s) => ({
        ...s,
        avg: Math.round((s.sum / s.count) * 10) / 10,
        best: Math.round(s.best),
        lowest: Math.round(s.lowest),
      }))
      .sort((a, b) => b.avg - a.avg);

    const classStats = Array.from(classAgg.entries())
      .map(([name, v]) => ({
        name,
        average: Math.round((v.sum / v.count) * 10) / 10,
        pass_rate: Math.round((v.pass / v.count) * 100),
        attempts: v.count,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const subjectStats = Array.from(subjectAgg.entries())
      .map(([name, v]) => ({
        name,
        average: Math.round((v.sum / v.count) * 10) / 10,
        attempts: v.count,
      }))
      .sort((a, b) => b.average - a.average);

    const examStats = Array.from(examAgg.values())
      .filter((e) => !classFilter || e.exam_class === classFilter)
      .map((e) => ({
        local_id: e.local_id,
        name: e.name,
        exam_class: e.exam_class,
        teacher_name: e.teacher_name,
        attempts: e.count,
        average: e.count ? Math.round((e.sum / e.count) * 10) / 10 : 0,
        highest: e.count ? Math.round(e.highest) : 0,
        lowest: e.count ? Math.round(e.lowest) : 0,
      }));

    return NextResponse.json({
      ok: true,
      kpis: {
        total_students: classFilter
          ? (students as any[]).filter((s) => s.status === "approved" && s.student_class === classFilter).length
          : (students as any[]).filter((s) => s.status === "approved").length,
        students_assessed: studentRows.length,
        total_teachers: teachers.length,
        total_exams: examStats.length,
        total_attempts: completed.length,
        average_score: overallAvg,
        distinctions,
      },
      grade_buckets: gradeBuckets,
      class_stats: classStats,
      subject_stats: subjectStats,
      top_students: studentRows.slice(0, 15),
      needs_attention: studentRows.filter((s) => s.avg < 70).reverse().slice(0, 15),
      all_students_perf: studentRows,
      exam_stats: examStats,
      available_classes: Array.from(new Set((students as any[]).map((s) => String(s.student_class || "")).filter(Boolean))).sort(),
      available_exams: (exams as any[]).map((e) => ({ local_id: Number(e.local_id), name: String(e.name), exam_class: String(e.exam_class || "") })),
    });
  } catch (err) {
    console.error("Portal analytics GET error:", err);
    return NextResponse.json({ ok: false, message: "Could not compute analytics." }, { status: 500 });
  }
}
