"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { OfflineSchoolMeta, showCtToast, TeacherShell } from "@/components/portal/OfflineShell";

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
  avg_percentage?: number | null;
}

export default function TeacherExamsManagementPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [classFilter, setClassFilter] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/portal/exams", { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        router.replace("/");
        return;
      }
      const json = await res.json();
      if (json.ok) {
        setSchool(json.school);
        setTeacherName(json.teacher?.full_name || json.teacher?.username || "Teacher");
        setExams(json.exams || []);
        setClasses(json.classes || []);
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
        showCtToast(!exam.active ? `Activated "${exam.name}"` : `Stopped "${exam.name}"`, "ok");
      } else {
        showCtToast(json.message || "Update failed.", "bad");
      }
    } finally {
      setBusyId(null);
    }
  };

  const deleteExam = async (exam: ExamRow) => {
    if (!window.confirm(`Delete "${exam.name}" and all its questions?`)) return;
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
      }
    } finally {
      setBusyId(null);
    }
  };

  const activeCount = exams.filter((e) => e.active).length;
  const inactiveCount = exams.length - activeCount;
  const totalQuestions = exams.reduce((s, e) => s + Number(e.question_count || 0), 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exams.filter((e) => {
      if (statusFilter === "active" && !e.active) return false;
      if (statusFilter === "inactive" && e.active) return false;
      if (classFilter && (e.exam_class || "").toLowerCase() !== classFilter) return false;
      if (!q) return true;
      return `${e.name} ${e.exam_class} ${e.subject_tag || ""}`.toLowerCase().includes(q);
    });
  }, [exams, statusFilter, classFilter, search]);

  return (
    <div className="ct-app tc-studio">
      <TeacherShell active="control" crumb="Exam Control Center" school={school} username={teacherName}>
        <header className="tc-head ct-animate-rise">
          <div className="tc-head__txt">
            <h1>Exam Control Center</h1>
            <p>Activate or pause papers, manage questions and settings, and track student submissions in real time.</p>
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

        <section className="tc-kpi-strip" aria-label="Exam control summary">
          <div className="tc-kpi">
            <span className="tc-kpi__label">My Exams</span>
            <strong className="tc-kpi__val">{exams.length}</strong>
            <span className="tc-kpi__meta">Papers you authored</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Active Live</span>
            <strong className="tc-kpi__val" style={{ color: "var(--ct-ok)" }}>{activeCount}</strong>
            <span className="tc-kpi__meta">Open to students right now</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Inactive / Draft</span>
            <strong className="tc-kpi__val" style={{ color: "var(--ct-warn)" }}>{inactiveCount}</strong>
            <span className="tc-kpi__meta">Hidden until started</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Question Bank</span>
            <strong className="tc-kpi__val">{totalQuestions}</strong>
            <span className="tc-kpi__meta">Total items across papers</span>
          </div>
        </section>

        <section className="tc-card">
          <div className="tcc-bar">
            <div className="tcc-bar__left">
              <div className="tcc-seg" role="group" aria-label="Filter exams by status">
                <button
                  type="button"
                  className={`tcc-chip${statusFilter === "all" ? " is-active" : ""}`}
                  onClick={() => setStatusFilter("all")}
                >
                  All ({exams.length})
                </button>
                <button
                  type="button"
                  className={`tcc-chip${statusFilter === "active" ? " is-active" : ""}`}
                  onClick={() => setStatusFilter("active")}
                >
                  Active ({activeCount})
                </button>
                <button
                  type="button"
                  className={`tcc-chip${statusFilter === "inactive" ? " is-active" : ""}`}
                  onClick={() => setStatusFilter("inactive")}
                >
                  Inactive ({inactiveCount})
                </button>
              </div>
              {classes.length > 0 && (
                <select
                  className="tcc-select"
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  aria-label="Filter by class"
                >
                  <option value="">All Classes</option>
                  {classes.map((c) => (
                    <option key={c} value={c.toLowerCase()}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="tcc-bar__right">
              <label className="tc-search" style={{ width: 230 }}>
                <CtIco name="i-search" className="ct-ico--sm" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search exam or subject..."
                  aria-label="Search exams"
                />
              </label>
              <div className="tcc-seg" role="group" aria-label="Switch layout view">
                <button
                  type="button"
                  className={`tcc-chip${viewMode === "table" ? " is-active" : ""}`}
                  onClick={() => setViewMode("table")}
                >
                  Table
                </button>
                <button
                  type="button"
                  className={`tcc-chip${viewMode === "cards" ? " is-active" : ""}`}
                  onClick={() => setViewMode("cards")}
                >
                  Cards
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>Loading exams...</div>
          ) : filtered.length === 0 ? (
            <div className="tc-empty">
              <span className="tc-empty__ico">
                <CtIco name="i-folder" />
              </span>
              <strong>No matching examinations</strong>
              <p>Create a new exam or clear your filters to view your papers.</p>
            </div>
          ) : viewMode === "table" ? (
            <div className="tc-table-wrap ct-table-wrap">
              <table className="tc-table tcc-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 190 }}>Examination</th>
                    <th style={{ width: 92 }}>Class</th>
                    <th className="is-center" style={{ width: 72 }}>Qs</th>
                    <th className="is-center" style={{ width: 74 }}>Time</th>
                    <th className="is-center" style={{ width: 78 }}>Tries</th>
                    <th className="is-center" style={{ width: 82 }}>Avg</th>
                    <th className="is-center" style={{ width: 96 }}>Status</th>
                    <th style={{ width: 280, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((exam) => {
                    const avg = Number(exam.avg_percentage || 0);
                    return (
                      <tr key={exam.local_id}>
                        <td>
                          <strong style={{ display: "block", fontWeight: 650 }}>{exam.name}</strong>
                          <span className="tc-mono" style={{ fontSize: 11.5, color: "var(--tc-ink-3)" }}>
                            {exam.subject_tag || "General"}
                            {exam.specialisation ? ` · ${exam.specialisation}` : ""}
                          </span>
                        </td>
                        <td>
                          <span className="tc-pill">{exam.exam_class}</span>
                        </td>
                        <td className="tc-mono is-center">{exam.question_count || 0}</td>
                        <td className="tc-mono is-center" style={{ color: "var(--tc-ink-2)" }}>
                          {exam.duration}m
                        </td>
                        <td className="tc-mono is-center">{exam.submission_count || 0}</td>
                        <td className="tc-mono is-center" style={{ fontWeight: 650 }}>
                          {exam.submission_count ? `${avg.toFixed(1)}%` : "-"}
                        </td>
                        <td className="is-center">
                          <span className={`tc-pill${exam.active ? " tc-pill--ok" : ""}`}>
                            <i className="tc-dot" />
                            {exam.active ? "Active" : "Inactive"}
                          </span>
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
                            <Link className="tc-btn tc-btn--ghost tc-btn--sm" href={`/teacher/exam/${exam.local_id}/analytics`} title="Analytics">
                              <CtIco name="i-chart" className="ct-ico--sm" />
                            </Link>
                            <Link className="tc-btn tc-btn--ghost tc-btn--sm" href={`/teacher/results/${exam.local_id}`} title="Results">
                              <CtIco name="i-doc" className="ct-ico--sm" />
                            </Link>
                            <button
                              type="button"
                              disabled={busyId === exam.local_id}
                              className="tc-btn tc-btn--ghost tc-btn--icon"
                              style={{ color: "var(--tc-bad)" }}
                              onClick={() => void deleteExam(exam)}
                              title="Delete exam"
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
          ) : (
            <div className="tcc-grid">
              {filtered.map((exam) => (
                <article key={exam.local_id} className="tcc-card">
                  <div className="tcc-card__top">
                    <div>
                      <h3 className="tcc-card__title">{exam.name}</h3>
                      <div className="tcc-card__tags">
                        <span className="tc-pill">{exam.exam_class}</span>
                        <span className="tc-pill">{exam.subject_tag || "General"}</span>
                      </div>
                    </div>
                    <span className={`tc-pill${exam.active ? " tc-pill--ok" : ""}`}>
                      <i className="tc-dot" />
                      {exam.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="tcc-card__stats">
                    <div className="tcc-stat">
                      <span>Questions</span>
                      <strong>{exam.question_count || 0}</strong>
                    </div>
                    <div className="tcc-stat">
                      <span>Duration</span>
                      <strong>{exam.duration}m</strong>
                    </div>
                    <div className="tcc-stat">
                      <span>Attempts</span>
                      <strong>{exam.submission_count || 0}</strong>
                    </div>
                  </div>
                  <div className="tcc-card__foot">
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
                      Questions
                    </Link>
                    <Link className="tc-btn tc-btn--secondary tc-btn--sm" href={`/teacher/exam/${exam.local_id}/settings`}>
                      Settings
                    </Link>
                    <Link className="tc-btn tc-btn--ghost tc-btn--sm" href={`/teacher/results/${exam.local_id}`}>
                      Results
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </TeacherShell>
    </div>
  );
}
