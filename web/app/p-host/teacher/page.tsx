"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PortalShell } from "@/components/portal/PortalShell";
import { ExamPerformanceChart } from "@/components/portal/ExamPerformanceChart";
import { QuestionAuthorModal } from "@/components/portal/QuestionAuthorModal";
import {
  getMonogram,
  PIconArrowRight,
  PIconChart,
  PIconDoc,
  PIconDownload,
  PIconHome,
  PIconLive,
  PIconPause,
  PIconPlay,
  PIconPlus,
  PIconSearch,
  PIconTrash,
  PIconUsers,
} from "@/components/portal/PortalIcons";

interface PortalExamRow {
  local_id: number;
  name: string;
  exam_class: string;
  duration: number;
  active: boolean;
  is_paused_all: boolean;
  calculator_type: string;
  max_warnings: number;
  result_release_policy: string;
  results_released: boolean;
  subject_tag?: string;
  specialisation?: string;
  question_count: number;
  submission_count: number;
  live_count: number;
  avg_percentage: number | null;
  created_online: boolean;
}

interface PortalResultRow {
  id: string;
  exam_local_id: number;
  exam_name: string;
  student_name: string;
  student_username: string;
  student_class: string;
  score: number;
  total: number;
  percentage: number;
  grade_label: string;
  status: string;
  submitted: boolean;
  warnings_count: number;
  results_released: boolean;
  origin: string;
  completed_at: string | null;
}

type TeacherNavId = "dashboard" | "control" | "results";

function downloadCsv(filename: string, rows: PortalResultRow[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["Student", "Username", "Class", "Exam", "Score", "Total", "Percent", "Grade", "Status", "Origin"].map(esc).join(","),
    ...rows.map((r) =>
      [
        r.student_name,
        r.student_username,
        r.student_class,
        r.exam_name,
        r.score,
        r.total,
        r.percentage,
        r.grade_label,
        r.submitted ? "Submitted" : "In Progress",
        r.origin,
      ]
        .map(esc)
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function TeacherOnlineStudioPage() {
  const router = useRouter();
  const [nav, setNav] = useState<TeacherNavId>("dashboard");
  const [school, setSchool] = useState<{
    school_code: string;
    portal_school_name: string;
    academic_session: string;
    current_term: string;
  } | null>(null);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [teacherClasses, setTeacherClasses] = useState<string[]>([]);
  const [studentCount, setStudentCount] = useState(0);
  const [classes, setClasses] = useState<string[]>([]);
  const [exams, setExams] = useState<PortalExamRow[]>([]);
  const [results, setResults] = useState<PortalResultRow[]>([]);

  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [examSearch, setExamSearch] = useState("");
  const [filterExamId, setFilterExamId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  // Create exam modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClass, setNewClass] = useState("");
  const [newDuration, setNewDuration] = useState(40);
  const [newCalc, setNewCalc] = useState<"none" | "basic" | "scientific">("none");
  const [newWarnings, setNewWarnings] = useState(5);
  const [newPolicy, setNewPolicy] = useState<"immediate" | "withheld">("immediate");
  const [newActive, setNewActive] = useState(false);
  const [busy, setBusy] = useState(false);

  const [authorExam, setAuthorExam] = useState<{ id: number; name: string } | null>(null);

  function showToast(t: string) {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? "" : cur)), 3200);
  }

  async function loadAll() {
    try {
      const [meRes, exRes, resRes] = await Promise.all([
        fetch("/api/v1/portal/auth/me", { credentials: "include" }).then((r) => r.json()).catch(() => null),
        fetch("/api/v1/portal/exams", { credentials: "include" }),
        fetch("/api/v1/portal/results", { credentials: "include" }),
      ]);
      if (exRes.status === 401) {
        router.replace("/");
        return;
      }
      const exJson = await exRes.json().catch(() => ({}));
      if (exRes.status === 403 || !exRes.ok || !exJson.ok) {
        setErr(exJson.message || "Teacher online access is currently unavailable.");
        return;
      }
      setSchool(exJson.school || null);
      const cls: string[] = Array.isArray(exJson.classes) ? exJson.classes : [];
      setClasses(cls);
      setTeacherClasses(Array.isArray(exJson.teacher?.classes) ? exJson.teacher.classes : cls);
      setStudentCount(Number(exJson.student_count || 0));
      if (!newClass && cls.length) setNewClass(cls[0]);
      setExams(Array.isArray(exJson.exams) ? exJson.exams : []);
      if (exJson.teacher?.full_name) {
        setTeacherName(String(exJson.teacher.full_name));
      } else if (meRes?.session?.fullName) {
        setTeacherName(String(meRes.session.fullName));
      }

      const resJson = await resRes.json().catch(() => ({}));
      if (resRes.ok && resJson.ok && Array.isArray(resJson.results)) {
        setResults(resJson.results);
      }
    } catch {
      setErr("Could not load Teacher Portal.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignOut() {
    await fetch("/api/v1/portal/auth/logout", { method: "POST", credentials: "include" });
    router.replace(school?.school_code ? `/?school=${encodeURIComponent(school.school_code)}` : "/");
  }

  async function handleCreateExam(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/v1/portal/exams", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          exam_class: newClass || "All",
          duration: Number(newDuration),
          calculator_type: newCalc,
          max_warnings: Number(newWarnings),
          result_release_policy: newPolicy,
          active: newActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showToast(data.message || "Could not create exam.");
      } else {
        setShowCreate(false);
        setNewName("");
        showToast("Exam created. Add questions now.");
        await loadAll();
        if (data.exam?.local_id) {
          setAuthorExam({ id: Number(data.exam.local_id), name: String(data.exam.name) });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function patchExam(localId: number, patch: Record<string, unknown>, label: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/portal/exams", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local_id: localId, ...patch }),
      });
      if (res.ok) {
        showToast(label);
        await loadAll();
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteExam(localId: number) {
    if (!window.confirm("Delete this exam and all its questions?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/portal/exams?local_id=${localId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        showToast("Exam deleted.");
        await loadAll();
      }
    } finally {
      setBusy(false);
    }
  }

  async function resultAction(
    attemptId: string,
    action: "force_submit" | "toggle_release",
    extra: Record<string, unknown> = {}
  ) {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/portal/results", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempt_id: attemptId, action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        showToast(data.message || "Updated.");
        await loadAll();
      }
    } finally {
      setBusy(false);
    }
  }

  const classGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ex of exams) {
      const c = ex.exam_class || "General";
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    return Array.from(counts.entries());
  }, [exams]);

  const filteredExams = useMemo(() => {
    const q = examSearch.trim().toLowerCase();
    return exams.filter((ex) => {
      if (selectedClass !== "all" && (ex.exam_class || "General") !== selectedClass) return false;
      if (q) {
        const hay = `${ex.name} ${ex.exam_class || ""} ${ex.subject_tag || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [exams, selectedClass, examSearch]);

  const filteredResults = filterExamId
    ? results.filter((r) => String(r.exam_local_id) === filterExamId)
    : results;

  const activeCount = exams.filter((e) => e.active).length;
  const totalAttempts = exams.reduce((s, e) => s + Number(e.submission_count || 0), 0);
  const scoredExams = exams.filter((e) => e.avg_percentage !== null && Number.isFinite(Number(e.avg_percentage)));
  const classAvg = scoredExams.length
    ? (scoredExams.reduce((s, e) => s + Number(e.avg_percentage || 0), 0) / scoredExams.length).toFixed(1)
    : "0.0";

  if (loading) {
    return (
      <div className="pt-modal-backdrop" style={{ background: "var(--pt-canvas)" }}>
        <div className="pt-modal">
          <h2>Loading Teacher Portal...</h2>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="pt-modal-backdrop" style={{ background: "var(--pt-canvas)" }}>
        <div className="pt-modal">
          <div className="pt-alert pt-alert--dark" style={{ marginBottom: 16 }}>
            {err}
          </div>
          <Link href="/" className="pt-btn pt-btn--primary pt-btn--lg">
            Back to School Portal
          </Link>
        </div>
      </div>
    );
  }

  const crumbMap: Record<TeacherNavId, string> = {
    dashboard: "Dashboard",
    control: "Exam Control Center",
    results: "Results & Analytics",
  };

  return (
    <>
      <PortalShell
        roleLabel="Teacher"
        schoolName={school?.portal_school_name || "CogniTara School"}
        schoolTermMeta={`${school?.current_term || "First Term"}, ${school?.academic_session || "2026/2027"}`}
        userName={teacherName}
        userSubtitle={`Teacher · ${school?.school_code || ""}`}
        activeId={nav}
        crumbLabel={crumbMap[nav]}
        navItems={[
          { id: "dashboard", group: "Teaching", label: "Dashboard", icon: <PIconHome size={16} /> },
          { id: "control", group: "Teaching", label: "Exam Control Center", icon: <PIconLive size={16} />, count: exams.length },
          { id: "results", group: "Insights", label: "Results & Analytics", icon: <PIconChart size={16} />, count: results.length },
        ]}
        onSelectNav={(id) => setNav(id as TeacherNavId)}
        onSignOut={() => void handleSignOut()}
        commands={[
          { id: "act:create", label: "Create new exam", hint: "Action", onSelect: () => setShowCreate(true) },
          { id: "act:export", label: "Export results CSV", hint: "Action", onSelect: () => downloadCsv("cognitara-teacher-results.csv", filteredResults) },
        ]}
        footerAction={
          <button
            type="button"
            className="pt-btn pt-btn--sm"
            style={{ width: "100%" }}
            onClick={() => setShowCreate(true)}
          >
            <PIconPlus size={14} />
            <span className="pt-hide-collapsed">New Exam</span>
          </button>
        }
      >
        {/* Editorial Workspace Header (Matches Offline teacher_dashboard.html) */}
        <header className="pt-page-head">
          <div className="pt-page-head__left">
            <span className="pt-crest pt-crest--lg">{getMonogram(teacherName, "TC")}</span>
            <div>
              <h1>{teacherName}</h1>
              <div className="pt-meta-line">
                {teacherClasses.length > 0 ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <PIconUsers size={13} />
                    <span>{teacherClasses.join(" · ")}</span>
                  </span>
                ) : null}
                {teacherClasses.length > 0 && school?.school_code ? <span className="pt-meta-sep" /> : null}
                {school?.school_code ? (
                  <span className="pt-mono">School ID {school.school_code}</span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="pt-page-head__actions">
            <button type="button" className="pt-btn" onClick={() => setNav("results")}>
              <PIconChart size={15} />
              <span>Results</span>
            </button>
            <button type="button" className="pt-btn pt-btn--primary" onClick={() => setShowCreate(true)}>
              <PIconPlus size={15} />
              <span>Create Exam</span>
            </button>
          </div>
        </header>

        {toast ? <div className="pt-alert pt-alert--dark">{toast}</div> : null}

        {nav === "dashboard" ? (
          <>
            {/* 4-Column Typographic KPI Strip */}
            <section className="pt-kpi-rail" aria-label="Workspace summary">
              <div className="pt-kpi-cell">
                <span className="pt-kpi-cell__label">My Exams</span>
                <strong className="pt-kpi-cell__val">{exams.length}</strong>
                <div className="pt-kpi-cell__meta">
                  <span className={`pt-status ${activeCount > 0 ? "is-live" : ""}`}>
                    <span className="pt-dot" />
                    {activeCount} active
                  </span>
                </div>
              </div>
              <div className="pt-kpi-cell">
                <span className="pt-kpi-cell__label">My Students</span>
                <strong className="pt-kpi-cell__val">{studentCount}</strong>
                <div className="pt-kpi-cell__meta">
                  <span>Across {Math.max(1, teacherClasses.length)} assigned class{teacherClasses.length === 1 ? "" : "es"}</span>
                </div>
              </div>
              <div className="pt-kpi-cell">
                <span className="pt-kpi-cell__label">Class Average</span>
                <strong className="pt-kpi-cell__val">{classAvg}%</strong>
                <div className="pt-kpi-cell__meta">
                  <button type="button" className="pt-kpi-link" onClick={() => setNav("results")}>
                    <span>Open results</span>
                    <PIconArrowRight size={13} />
                  </button>
                </div>
              </div>
              <div className="pt-kpi-cell">
                <span className="pt-kpi-cell__label">Total Attempts</span>
                <strong className="pt-kpi-cell__val">{totalAttempts}</strong>
                <div className="pt-kpi-cell__meta">
                  <span>Graded submissions recorded</span>
                </div>
              </div>
            </section>

            {/* Exam Performance Overview Graph */}
            {exams.length > 0 ? (
              <section className="pt-card" aria-label="Exam performance overview">
                <div className="pt-card__head">
                  <div className="pt-card__title">
                    <h2>Exam Performance Overview</h2>
                    <p>Average score per examination against the 50% pass benchmark and your overall class mean</p>
                  </div>
                  <div className="pt-card__tools">
                    <span className="pt-mono" style={{ fontSize: 12.5, color: "var(--pt-ink-2)" }}>
                      Avg {classAvg}%
                    </span>
                    <button type="button" className="pt-btn pt-btn--sm" onClick={() => setNav("results")}>
                      Full Results
                    </button>
                  </div>
                </div>
                <div className="pt-card__body">
                  <ExamPerformanceChart exams={exams} />
                </div>
              </section>
            ) : null}

            {/* My Exams by Class (Matches Offline teacher_dashboard.html, Zero Pills) */}
            <section className="pt-card" aria-label="My exams by class">
              <div className="pt-card__head">
                <div className="pt-card__title">
                  <h2>My Exams by Class</h2>
                  <p>Filter by class, start or pause papers, manage questions, or inspect scores</p>
                </div>
                <div className="pt-card__tools">
                  <label className="pt-search">
                    <PIconSearch size={14} />
                    <input
                      type="search"
                      placeholder="Search exam or class"
                      value={examSearch}
                      onChange={(e) => setExamSearch(e.target.value)}
                      aria-label="Search exams"
                    />
                  </label>
                  <button type="button" className="pt-btn pt-btn--sm" onClick={() => setNav("control")}>
                    <PIconLive size={13} />
                    <span>Control Center</span>
                  </button>
                </div>
              </div>

              {classGroups.length > 0 ? (
                <div className="pt-filter-tabs" role="tablist" aria-label="Filter by class">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selectedClass === "all"}
                    className={`pt-filter-tab ${selectedClass === "all" ? "is-active" : ""}`}
                    onClick={() => setSelectedClass("all")}
                  >
                    All Classes ({exams.length})
                  </button>
                  {classGroups.map(([cls, count]) => (
                    <button
                      key={cls}
                      type="button"
                      role="tab"
                      aria-selected={selectedClass === cls}
                      className={`pt-filter-tab ${selectedClass === cls ? "is-active" : ""}`}
                      onClick={() => setSelectedClass(cls)}
                    >
                      {cls} ({count})
                    </button>
                  ))}
                </div>
              ) : null}

              {filteredExams.length === 0 ? (
                <div className="pt-empty">
                  <span className="pt-empty__ico">
                    <PIconDoc size={18} />
                  </span>
                  <strong>No examinations found</strong>
                  <p>Create your first examination paper or import questions from CSV to begin assessing students.</p>
                  <button type="button" className="pt-btn pt-btn--primary pt-btn--sm" onClick={() => setShowCreate(true)}>
                    <PIconPlus size={14} />
                    <span>Create Exam</span>
                  </button>
                </div>
              ) : (
                <div className="pt-table-wrap">
                  <table className="pt-table">
                    <thead>
                      <tr>
                        <th>Examination</th>
                        <th>Class</th>
                        <th>Duration</th>
                        <th>Questions</th>
                        <th>Attempts</th>
                        <th>Avg Score</th>
                        <th>Status</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredExams.map((ex) => {
                        const avgVal = ex.avg_percentage !== null ? Number(ex.avg_percentage) : 0;
                        return (
                          <tr key={ex.local_id}>
                            <td>
                              <strong style={{ display: "block", fontWeight: 600 }}>{ex.name}</strong>
                              <span className="pt-mono" style={{ fontSize: 11.5, color: "var(--pt-ink-3)" }}>
                                #{ex.local_id} · Calc: {ex.calculator_type}
                              </span>
                            </td>
                            <td>{ex.exam_class || "All"}</td>
                            <td className="pt-mono" style={{ color: "var(--pt-ink-2)" }}>{ex.duration}m</td>
                            <td className="pt-mono">{ex.question_count}</td>
                            <td className="pt-mono">
                              {ex.submission_count}
                              {ex.live_count > 0 ? (
                                <span style={{ marginLeft: 6, color: "var(--pt-ink-3)", fontSize: 11.5 }}>
                                  ({ex.live_count} live)
                                </span>
                              ) : null}
                            </td>
                            <td>
                              <div className="pt-bar-cell">
                                <span className="pt-mini-bar">
                                  <i style={{ width: `${Math.min(100, Math.max(0, avgVal))}%` }} />
                                </span>
                                <span className="pt-mono" style={{ fontSize: 12.5 }}>
                                  {avgVal.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            <td>
                              <span className={`pt-status ${ex.active && !ex.is_paused_all ? "is-live" : ""}`}>
                                <span className="pt-dot" />
                                {ex.is_paused_all ? "Paused" : ex.active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <div className="pt-row-actions">
                                <button
                                  type="button"
                                  className="pt-btn pt-btn--sm"
                                  disabled={busy}
                                  onClick={() =>
                                    void patchExam(
                                      ex.local_id,
                                      { active: !ex.active },
                                      ex.active ? "Exam stopped" : "Exam activated"
                                    )
                                  }
                                >
                                  {ex.active ? "Stop" : "Start"}
                                </button>
                                <button
                                  type="button"
                                  className="pt-btn pt-btn--primary pt-btn--sm"
                                  onClick={() => setAuthorExam({ id: ex.local_id, name: ex.name })}
                                >
                                  Questions
                                </button>
                                <button
                                  type="button"
                                  className="pt-btn pt-btn--sm"
                                  disabled={busy}
                                  onClick={() =>
                                    void patchExam(
                                      ex.local_id,
                                      { is_paused_all: !ex.is_paused_all },
                                      ex.is_paused_all ? "Exam resumed" : "Exam paused"
                                    )
                                  }
                                >
                                  {ex.is_paused_all ? <PIconPlay size={13} /> : <PIconPause size={13} />}
                                  <span>{ex.is_paused_all ? "Resume" : "Pause"}</span>
                                </button>
                                <button
                                  type="button"
                                  className="pt-btn pt-btn--ghost pt-btn--icon"
                                  disabled={busy}
                                  onClick={() => void deleteExam(ex.local_id)}
                                  title="Delete exam"
                                  aria-label={`Delete ${ex.name}`}
                                >
                                  <PIconTrash size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : nav === "control" ? (
          <section className="pt-card">
            <div className="pt-card__head">
              <div className="pt-card__title">
                <h2>Exam Control Center</h2>
                <p>Manage paper activation, pause sessions, or withhold and release student scores</p>
              </div>
              <button type="button" className="pt-btn pt-btn--primary pt-btn--sm" onClick={() => setShowCreate(true)}>
                <PIconPlus size={14} />
                <span>Create Exam</span>
              </button>
            </div>
            {exams.length === 0 ? (
              <div className="pt-empty">
                <span className="pt-empty__ico">
                  <PIconLive size={18} />
                </span>
                <strong>No exams created yet</strong>
                <p>Create an exam to control its online availability and questions here.</p>
              </div>
            ) : (
              <div className="pt-table-wrap">
                <table className="pt-table">
                  <thead>
                    <tr>
                      <th>Examination</th>
                      <th>Class</th>
                      <th>Questions</th>
                      <th>Scores</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Controls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exams.map((ex) => (
                      <tr key={ex.local_id}>
                        <td>
                          <strong style={{ display: "block", fontWeight: 600 }}>{ex.name}</strong>
                          <span className="pt-mono" style={{ fontSize: 11.5, color: "var(--pt-ink-3)" }}>
                            {ex.duration} min · {ex.submission_count} submitted
                          </span>
                        </td>
                        <td>{ex.exam_class || "All"}</td>
                        <td className="pt-mono">{ex.question_count}</td>
                        <td style={{ color: "var(--pt-ink-2)" }}>
                          {ex.results_released ? "Visible" : "Withheld"}
                        </td>
                        <td>
                          <span className={`pt-status ${ex.active && !ex.is_paused_all ? "is-live" : ""}`}>
                            <span className="pt-dot" />
                            {ex.is_paused_all ? "Paused" : ex.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="pt-row-actions">
                            <button
                              type="button"
                              className="pt-btn pt-btn--sm"
                              onClick={() => setAuthorExam({ id: ex.local_id, name: ex.name })}
                            >
                              Questions
                            </button>
                            <button
                              type="button"
                              className="pt-btn pt-btn--sm"
                              disabled={busy}
                              onClick={() =>
                                void patchExam(
                                  ex.local_id,
                                  { active: !ex.active },
                                  ex.active ? "Exam stopped" : "Exam activated"
                                )
                              }
                            >
                              {ex.active ? "Stop" : "Start"}
                            </button>
                            <button
                              type="button"
                              className="pt-btn pt-btn--sm"
                              disabled={busy}
                              onClick={() =>
                                void patchExam(
                                  ex.local_id,
                                  { results_released: !ex.results_released },
                                  ex.results_released ? "Scores withheld" : "Scores released"
                                )
                              }
                            >
                              {ex.results_released ? "Withhold" : "Release"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : (
          <section className="pt-card">
            <div className="pt-card__head">
              <div className="pt-card__title">
                <h2>Student Results</h2>
                <p>Live and submitted attempts across your examinations</p>
              </div>
              <div className="pt-card__tools">
                <select
                  className="pt-select-sm"
                  value={filterExamId}
                  onChange={(e) => setFilterExamId(e.target.value)}
                  aria-label="Filter results by exam"
                >
                  <option value="">All Exams</option>
                  {exams.map((ex) => (
                    <option key={ex.local_id} value={String(ex.local_id)}>
                      {ex.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="pt-btn pt-btn--sm"
                  disabled={filteredResults.length === 0}
                  onClick={() => downloadCsv("cognitara-teacher-results.csv", filteredResults)}
                >
                  <PIconDownload size={13} />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {filteredResults.length === 0 ? (
              <div className="pt-empty">
                <span className="pt-empty__ico">
                  <PIconChart size={18} />
                </span>
                <strong>No student attempts recorded yet</strong>
                <p>Student scores and live exam attempts will appear here automatically.</p>
              </div>
            ) : (
              <div className="pt-table-wrap">
                <table className="pt-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Examination</th>
                      <th>Score</th>
                      <th>Grade</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Controls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong style={{ display: "block", fontWeight: 600 }}>{r.student_name}</strong>
                          <span className="pt-mono" style={{ fontSize: 11.5, color: "var(--pt-ink-3)" }}>
                            @{r.student_username} · {r.student_class}
                          </span>
                        </td>
                        <td>{r.exam_name}</td>
                        <td className="pt-mono">
                          {r.submitted ? `${r.score} / ${r.total} (${r.percentage}%)` : "In progress"}
                        </td>
                        <td className="pt-mono" style={{ fontWeight: 600 }}>
                          {r.submitted ? r.grade_label || "-" : "-"}
                        </td>
                        <td>
                          <span className={`pt-status ${r.submitted ? "is-live" : ""}`}>
                            <span className="pt-dot" />
                            {r.submitted ? (r.results_released ? "Released" : "Withheld") : "Live"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {!r.submitted ? (
                            <button
                              type="button"
                              className="pt-btn pt-btn--primary pt-btn--sm"
                              disabled={busy}
                              onClick={() => void resultAction(r.id, "force_submit")}
                            >
                              Force Submit
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="pt-btn pt-btn--sm"
                              disabled={busy}
                              onClick={() =>
                                void resultAction(r.id, "toggle_release", { release: !r.results_released })
                              }
                            >
                              {r.results_released ? "Withhold" : "Release"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </PortalShell>

      {/* Create Exam Modal */}
      {showCreate ? (
        <div className="pt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Create new exam">
          <div className="pt-modal pt-modal--wide" style={{ maxWidth: 520 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Create New Exam</h2>
              <button type="button" className="pt-btn pt-btn--sm" onClick={() => setShowCreate(false)}>
                Close
              </button>
            </div>
            <form className="pt-form" onSubmit={handleCreateExam}>
              <div className="pt-field">
                <label htmlFor="exName">Exam title</label>
                <input
                  id="exName"
                  className="pt-input"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Second Term Mathematics CA"
                />
              </div>
              <div className="pt-form-grid-2">
                <div className="pt-field">
                  <label htmlFor="exClass">Class</label>
                  {classes.length ? (
                    <select
                      id="exClass"
                      className="pt-select"
                      value={newClass}
                      onChange={(e) => setNewClass(e.target.value)}
                      required
                    >
                      {classes.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="All">All Classes</option>
                    </select>
                  ) : (
                    <input
                      id="exClass"
                      className="pt-input"
                      required
                      value={newClass}
                      onChange={(e) => setNewClass(e.target.value)}
                      placeholder="SS1"
                    />
                  )}
                </div>
                <div className="pt-field">
                  <label htmlFor="exDur">Duration (minutes)</label>
                  <input
                    id="exDur"
                    type="number"
                    min={1}
                    max={360}
                    className="pt-input"
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
              <div className="pt-form-grid-2">
                <div className="pt-field">
                  <label htmlFor="exCalc">Calculator</label>
                  <select
                    id="exCalc"
                    className="pt-select"
                    value={newCalc}
                    onChange={(e) => setNewCalc(e.target.value as "none" | "basic" | "scientific")}
                  >
                    <option value="none">None</option>
                    <option value="basic">Basic</option>
                    <option value="scientific">Scientific</option>
                  </select>
                </div>
                <div className="pt-field">
                  <label htmlFor="exPolicy">Score visibility</label>
                  <select
                    id="exPolicy"
                    className="pt-select"
                    value={newPolicy}
                    onChange={(e) => setNewPolicy(e.target.value as "immediate" | "withheld")}
                  >
                    <option value="immediate">Show immediately after submit</option>
                    <option value="withheld">Withhold until released</option>
                  </select>
                </div>
              </div>
              <div className="pt-form-grid-2">
                <div className="pt-field">
                  <label htmlFor="exWarn">Max tab warnings</label>
                  <input
                    id="exWarn"
                    type="number"
                    min={1}
                    max={20}
                    className="pt-input"
                    value={newWarnings}
                    onChange={(e) => setNewWarnings(Number(e.target.value))}
                  />
                </div>
                <div className="pt-field" style={{ justifyContent: "flex-end" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", paddingBottom: 10 }}>
                    <input
                      type="checkbox"
                      checked={newActive}
                      onChange={(e) => setNewActive(e.target.checked)}
                    />
                    Activate immediately
                  </label>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="pt-btn" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="pt-btn pt-btn--primary" disabled={busy}>
                  {busy ? "Creating..." : "Create & Add Questions"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {authorExam ? (
        <QuestionAuthorModal
          examId={authorExam.id}
          examName={authorExam.name}
          onClose={() => setAuthorExam(null)}
          onChanged={() => void loadAll()}
        />
      ) : null}
    </>
  );
}
