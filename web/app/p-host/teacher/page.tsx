"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { OfflineSchoolMeta, showCtToast, TeacherShell } from "@/components/portal/OfflineShell";
import { MonochromeBarChart } from "@/components/portal/OfflineCharts";

interface ExamRow {
  local_id: number;
  name: string;
  exam_class: string;
  duration: number;
  active: boolean;
  specialisation?: string;
  subject_tag?: string;
  question_count?: number;
  submission_count?: number;
  live_count?: number;
  avg_percentage?: number | null;
}

interface StudentRow {
  local_id: number;
  username: string;
  full_name: string;
  student_class: string;
  specialisation?: string;
  status: string;
  avg_percentage?: number;
  exams_taken?: number;
}

export default function TeacherDashboardPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [teacher, setTeacher] = useState<{
    local_id: number;
    username: string;
    full_name: string;
    classes: string[];
    class_teacher_of?: string;
  } | null>(null);
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [classTab, setClassTab] = useState("all");
  const [examSearch, setExamSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [exRes, rosRes] = await Promise.all([
        fetch("/api/v1/portal/exams", { credentials: "include" }),
        fetch("/api/v1/portal/roster", { credentials: "include" }),
      ]);
      if (exRes.status === 401 || exRes.status === 403) {
        router.replace("/");
        return;
      }
      const exJson = await exRes.json();
      const rosJson = rosRes.ok ? await rosRes.json() : { students: [] };
      if (exJson.ok) {
        setSchool(exJson.school);
        setTeacher(exJson.teacher);
        setExams(exJson.exams || []);
        setLiveCount(Number(exJson.live_sessions_count || 0));
      }
      if (rosJson.ok) {
        setStudents((rosJson.students || []).filter((s: StudentRow) => s.status === "approved"));
      }
    } catch {
      showCtToast("Could not load teacher workspace.", "bad");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const toggleExam = async (exam: ExamRow) => {
    setBusyId(exam.local_id);
    try {
      const res = await fetch("/api/v1/portal/exams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ local_id: exam.local_id, active: !exam.active }),
      });
      const json = await res.json();
      if (json.ok) {
        setExams((prev) =>
          prev.map((e) => (e.local_id === exam.local_id ? { ...e, active: !e.active } : e))
        );
        showCtToast(!exam.active ? `Started "${exam.name}"` : `Stopped "${exam.name}"`, "ok");
      } else {
        showCtToast(json.message || "Update failed.", "bad");
      }
    } finally {
      setBusyId(null);
    }
  };

  const deleteExam = async (exam: ExamRow) => {
    if (!window.confirm(`Delete "${exam.name}" and all its questions? This cannot be undone.`)) return;
    setBusyId(exam.local_id);
    try {
      const res = await fetch(`/api/v1/portal/exams?local_id=${exam.local_id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (json.ok) {
        setExams((prev) => prev.filter((e) => e.local_id !== exam.local_id));
        showCtToast(`Deleted "${exam.name}".`, "ok");
      } else {
        showCtToast(json.message || "Could not delete exam.", "bad");
      }
    } finally {
      setBusyId(null);
    }
  };

  const classesFromExams = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of exams) {
      const c = e.exam_class || "General";
      map.set(c, (map.get(c) || 0) + 1);
    }
    return Array.from(map.entries());
  }, [exams]);

  const activeExamsCount = useMemo(() => exams.filter((e) => e.active).length, [exams]);
  const totalAttempts = useMemo(
    () => exams.reduce((s, e) => s + Number(e.submission_count || 0), 0),
    [exams]
  );
  const classAvg = useMemo(() => {
    const scored = exams.filter((e) => e.avg_percentage != null && Number(e.submission_count || 0) > 0);
    if (!scored.length) return 0;
    return (
      Math.round(
        (scored.reduce((s, e) => s + Number(e.avg_percentage || 0), 0) / scored.length) * 10
      ) / 10
    );
  }, [exams]);

  const filteredExams = useMemo(() => {
    const q = examSearch.trim().toLowerCase();
    return exams.filter((e) => {
      if (classTab !== "all" && (e.exam_class || "General") !== classTab) return false;
      if (!q) return true;
      return `${e.name} ${e.exam_class} ${e.subject_tag || ""} ${e.specialisation || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [exams, classTab, examSearch]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students.slice(0, 30);
    return students.filter((s) =>
      `${s.full_name} ${s.username} ${s.student_class}`.toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

  const chartData = useMemo(
    () =>
      exams.slice(0, 8).map((e) => ({
        label: e.name,
        value: Math.round(Number(e.avg_percentage || 0)),
        sub: `${e.submission_count || 0} scripts`,
      })),
    [exams]
  );

  return (
    <div className="ct-app tc-studio">
      <TeacherShell
        active="dashboard"
        crumb="Dashboard"
        school={school}
        username={teacher?.full_name || teacher?.username || "Teacher"}
        subtitle={
          teacher?.class_teacher_of
            ? `Form Teacher · ${teacher.class_teacher_of}`
            : `Teacher · ${school?.portal_school_name || school?.school_name || ""}`
        }
        counts={{ live_count: liveCount }}
        isClassTeacher={true}
      >
        {/* Editorial Workspace Header */}
        <header className="tc-head ct-animate-rise">
          <div className="tc-head__left">
            <span className="ct-avatar ct-avatar--lg ct-avatar--person">
              <svg className="ct-avatar__glyph" viewBox="0 0 24 24" aria-hidden="true">
                <use href="/static/icons/cognitara-icons.svg#i-person-avatar" />
              </svg>
            </span>
            <div className="tc-head__txt">
              <h1>Welcome, {teacher?.full_name || teacher?.username || "Teacher"}</h1>
              <div className="tc-head__tags">
                {(teacher?.classes || []).map((cls) => (
                  <span className="tc-pill" key={cls}>
                    <CtIco name="i-users" className="ct-ico--xs" />
                    {cls}
                  </span>
                ))}
                {teacher?.class_teacher_of && (
                  <span className="tc-pill tc-pill--warn">
                    <CtIco name="i-star" className="ct-ico--xs" />
                    Form Tutor · {teacher.class_teacher_of}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="tc-head__actions">
            <Link className="tc-btn tc-btn--secondary" href="/teacher/import-exam">
              <CtIco name="i-upload" className="ct-ico--sm" />
              Import
            </Link>
            <Link className="tc-btn tc-btn--secondary" href="/teacher/support">
              <CtIco name="i-activity" className="ct-ico--sm" />
              Live Support
            </Link>
            <Link className="tc-btn tc-btn--primary" href="/teacher/create-exam">
              <CtIco name="i-plus" className="ct-ico--sm" />
              Create Exam
            </Link>
          </div>
        </header>

        {/* 4-Column Typographic KPI Strip */}
        <section className="tc-kpi-strip" aria-label="Workspace summary">
          <div className="tc-kpi">
            <span className="tc-kpi__label">My Exams</span>
            <strong className="tc-kpi__val">{exams.length}</strong>
            <span className="tc-kpi__meta">
              <span className="tc-pill tc-pill--ok">
                <i className="tc-dot" />
                {activeExamsCount} active
              </span>
            </span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">My Students</span>
            <strong className="tc-kpi__val">{students.length}</strong>
            <span className="tc-kpi__meta">
              Across {(teacher?.classes || []).length || 1} assigned{" "}
              {(teacher?.classes || []).length === 1 ? "class" : "classes"}
            </span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Class Average</span>
            <strong className="tc-kpi__val">{classAvg}%</strong>
            <span className="tc-kpi__meta">
              <Link href="/teacher/analytics">
                Open analytics <CtIco name="i-arrow-right" className="ct-ico--xs" />
              </Link>
            </span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Total Attempts</span>
            <strong className="tc-kpi__val">{totalAttempts}</strong>
            <span className="tc-kpi__meta">Graded submissions recorded</span>
          </div>
        </section>

        {/* Exam Performance Overview Graph */}
        {exams.length > 0 && (
          <section className="tc-card">
            <div className="tc-card__head">
              <div className="tc-card__title">
                <h2>Exam Performance Overview</h2>
                <p>Average score per examination across your authored papers</p>
              </div>
              <div className="tc-card__tools">
                <span className="tc-pill">Avg {classAvg}%</span>
                <Link className="tc-btn tc-btn--secondary tc-btn--sm" href="/teacher/analytics">
                  Full Analytics <CtIco name="i-arrow-up-right" className="ct-ico--xs" />
                </Link>
              </div>
            </div>
            <div className="tc-card__body">
              <MonochromeBarChart data={chartData} maxVal={100} unit="%" height={210} />
            </div>
          </section>
        )}

        {/* My Exams by Class */}
        <section className="tc-card">
          <div className="tc-card__head">
            <div className="tc-card__title">
              <h2>My Exams by Class</h2>
              <p>Filter by class, start or pause papers, manage questions, or inspect analytics</p>
            </div>
            <div className="tc-card__tools">
              <label className="tc-search" style={{ width: 210 }}>
                <CtIco name="i-search" className="ct-ico--sm" />
                <input
                  type="search"
                  value={examSearch}
                  onChange={(e) => setExamSearch(e.target.value)}
                  placeholder="Search exam or subject..."
                  aria-label="Search my exams"
                />
              </label>
              <Link className="tc-btn tc-btn--secondary tc-btn--sm" href="/teacher/exams-management">
                <CtIco name="i-live" className="ct-ico--xs" />
                Control Center
              </Link>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>Loading examinations...</div>
          ) : exams.length > 0 ? (
            <>
              <div className="td-class-pills" role="tablist" aria-label="Filter exams by class">
                <button
                  type="button"
                  className={`td-pill-tab${classTab === "all" ? " is-active" : ""}`}
                  onClick={() => setClassTab("all")}
                >
                  All Classes ({exams.length})
                </button>
                {classesFromExams.map(([cls, cnt]) => (
                  <button
                    key={cls}
                    type="button"
                    className={`td-pill-tab${classTab === cls ? " is-active" : ""}`}
                    onClick={() => setClassTab(cls)}
                  >
                    {cls} ({cnt})
                  </button>
                ))}
              </div>

              <div className="tc-table-wrap ct-table-wrap">
                <table className="tc-table td-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 200 }}>Examination</th>
                      <th style={{ width: 105 }}>Class</th>
                      <th style={{ minWidth: 160 }}>Subject &amp; Track</th>
                      <th className="is-center" style={{ width: 90 }}>Duration</th>
                      <th className="is-center" style={{ width: 85 }}>Attempts</th>
                      <th style={{ minWidth: 140 }}>Avg Score</th>
                      <th className="is-center" style={{ width: 105 }}>Status</th>
                      <th style={{ width: 290, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExams.map((exam) => {
                      const avg = Number(exam.avg_percentage || 0);
                      return (
                        <tr key={exam.local_id}>
                          <td>
                            <strong style={{ display: "block", fontWeight: 650 }}>{exam.name}</strong>
                            <span className="tc-mono" style={{ fontSize: 11.5, color: "var(--tc-ink-3)" }}>
                              #{exam.local_id} · {exam.question_count || 0} Qs
                            </span>
                          </td>
                          <td>
                            <span className="tc-pill">{exam.exam_class || "General"}</span>
                          </td>
                          <td>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span className="tc-pill">{exam.subject_tag || "General"}</span>
                              {exam.specialisation && (
                                <span className="tc-pill tc-pill--accent">{exam.specialisation}</span>
                              )}
                            </div>
                          </td>
                          <td className="tc-mono is-center" style={{ color: "var(--tc-ink-2)" }}>
                            {exam.duration}m
                          </td>
                          <td className="tc-mono is-center">{exam.submission_count || 0}</td>
                          <td>
                            <div className="tc-bar-cell">
                              <span
                                className={`tc-bar ${
                                  avg >= 75 ? "" : avg >= 60 ? "tc-bar--accent" : avg >= 50 ? "tc-bar--warn" : "tc-bar--bad"
                                }`}
                                style={{ width: 68 }}
                              >
                                <i style={{ width: `${Math.min(100, avg)}%` }} />
                              </span>
                              <span className="tc-mono" style={{ fontWeight: 640, fontSize: 12.5 }}>
                                {avg.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="is-center">
                            {exam.active ? (
                              <span className="tc-pill tc-pill--ok">
                                <i className="tc-dot" />
                                Active
                              </span>
                            ) : (
                              <span className="tc-pill">
                                <i className="tc-dot" />
                                Inactive
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="tc-actions">
                              <button
                                type="button"
                                disabled={busyId === exam.local_id}
                                className={`tc-btn tc-btn--sm ${exam.active ? "tc-btn--danger-soft" : "tc-btn--ok"}`}
                                onClick={() => void toggleExam(exam)}
                              >
                                <CtIco name={exam.active ? "i-stop" : "i-play"} className="ct-ico--xs" />
                                {exam.active ? "Stop" : "Start"}
                              </button>
                              <Link className="tc-btn tc-btn--primary tc-btn--sm" href={`/teacher/exam/${exam.local_id}/questions`}>
                                <CtIco name="i-plus" className="ct-ico--xs" />
                                Questions
                              </Link>
                              <Link className="tc-btn tc-btn--secondary tc-btn--sm" href={`/teacher/exam/${exam.local_id}/settings`}>
                                Settings
                              </Link>
                              <Link
                                className="tc-btn tc-btn--ghost tc-btn--icon"
                                href={`/teacher/exam/${exam.local_id}/analytics`}
                                title="Exam analytics"
                                aria-label="Analytics"
                              >
                                <CtIco name="i-chart" className="ct-ico--sm" />
                              </Link>
                              <Link
                                className="tc-btn tc-btn--ghost tc-btn--icon"
                                href={`/teacher/results/${exam.local_id}`}
                                title="Exam results"
                                aria-label="Results"
                              >
                                <CtIco name="i-doc" className="ct-ico--sm" />
                              </Link>
                              <button
                                type="button"
                                disabled={busyId === exam.local_id}
                                className="tc-btn tc-btn--ghost tc-btn--icon"
                                style={{ color: "var(--tc-bad)" }}
                                onClick={() => void deleteExam(exam)}
                                title="Delete exam"
                                aria-label={`Delete ${exam.name}`}
                              >
                                <CtIco name="i-trash" className="ct-ico--sm" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="tc-empty">
              <span className="tc-empty__ico">
                <CtIco name="i-folder" />
              </span>
              <strong>No examinations created yet</strong>
              <p>Create your first examination paper or import questions from JSON/CSV to begin assessing students.</p>
              <Link href="/teacher/create-exam" className="tc-btn tc-btn--primary" style={{ marginTop: 6 }}>
                <CtIco name="i-plus" className="ct-ico--sm" />
                Create First Exam
              </Link>
            </div>
          )}
        </section>

        {/* My Students Directory */}
        <section className="tc-card">
          <div className="tc-card__head">
            <div className="tc-card__title">
              <h2>My Students</h2>
              <p>Inspect student score histories and question-by-question exam scripts</p>
            </div>
            <div className="tc-card__tools">
              <label className="tc-search" style={{ width: 220 }}>
                <CtIco name="i-search" className="ct-ico--sm" />
                <input
                  type="search"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search student name or class..."
                />
              </label>
            </div>
          </div>

          {filteredStudents.length > 0 ? (
            <div className="tc-table-wrap ct-table-wrap">
              <table className="tc-table td-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Class</th>
                    <th className="is-center">Papers Taken</th>
                    <th>Average</th>
                    <th style={{ textAlign: "right" }}>Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((st) => (
                    <tr key={st.local_id}>
                      <td>
                        <strong style={{ display: "block", fontWeight: 640 }}>{st.full_name}</strong>
                        <span className="tc-mono" style={{ fontSize: 11.5, color: "var(--tc-ink-3)" }}>
                          @{st.username}
                        </span>
                      </td>
                      <td>
                        <span className="tc-pill">{st.student_class || "General"}</span>
                      </td>
                      <td className="tc-mono is-center">{st.exams_taken || 0}</td>
                      <td className="tc-mono">{st.avg_percentage ? `${st.avg_percentage}%` : "-"}</td>
                      <td>
                        <div className="tc-actions">
                          <Link className="tc-btn tc-btn--secondary tc-btn--sm" href={`/teacher/student/${st.local_id}`}>
                            View Profile <CtIco name="i-arrow-right" className="ct-ico--xs" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="tc-empty">
              <span className="tc-empty__ico">
                <CtIco name="i-users" />
              </span>
              <strong>No students matched</strong>
              <p>Approved students in your assigned classes appear here automatically.</p>
            </div>
          )}
        </section>
      </TeacherShell>
    </div>
  );
}
