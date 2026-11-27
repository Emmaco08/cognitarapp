"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { OfflineSchoolMeta, showCtToast, TeacherShell } from "@/components/portal/OfflineShell";

export default function TeacherExamResultsPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Number(params?.examId || 0);

  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [exam, setExam] = useState<any>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyRelease, setBusyRelease] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [mRes, dRes] = await Promise.all([
        fetch("/api/v1/portal/exams", { credentials: "include" }),
        fetch(`/api/v1/portal/exams/${examId}`, { credentials: "include" }),
      ]);
      if (dRes.status === 401 || dRes.status === 403) {
        router.replace("/");
        return;
      }
      const m = mRes.ok ? await mRes.json() : null;
      const d = await dRes.json();
      if (m?.ok) {
        setSchool(m.school);
        setTeacherName(m.teacher?.full_name || m.teacher?.username || "Teacher");
      }
      if (d?.ok) {
        setExam(d.exam);
        setAttempts((d.attempts || []).filter((a: any) => a.submitted));
      }
    } finally {
      setLoading(false);
    }
  }, [examId, router]);

  useEffect(() => {
    if (examId) void loadData();
  }, [examId, loadData]);

  const toggleRelease = async () => {
    if (!exam) return;
    setBusyRelease(true);
    try {
      const next = !exam.results_released;
      const res = await fetch("/api/v1/portal/exams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ local_id: exam.local_id, results_released: next }),
      });
      const json = await res.json();
      if (json.ok) {
        setExam((prev: any) => ({ ...prev, results_released: next }));
        showCtToast(next ? "Results released to students." : "Results withheld from students.", "ok");
      }
    } finally {
      setBusyRelease(false);
    }
  };

  const exportCsv = () => {
    const header = ["Student Name", "Username", "Class", "Score", "Total", "Percentage", "Grade", "Warnings"];
    const rows = attempts.map((a) => [
      `"${String(a.student_name || "").replace(/"/g, '""')}"`,
      a.student_username || "",
      `"${String(a.student_class || "")}"`,
      a.score ?? 0,
      a.total ?? 0,
      `${Math.round(Number(a.percentage || 0))}%`,
      a.grade_label || "",
      a.warnings_count ?? 0,
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(exam?.name || "exam").replace(/[^a-z0-9]+/gi, "_")}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = attempts.filter((a) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${a.student_name} ${a.student_username} ${a.student_class}`.toLowerCase().includes(q);
  });

  const avg = attempts.length
    ? Math.round((attempts.reduce((s, a) => s + Number(a.percentage || 0), 0) / attempts.length) * 10) / 10
    : 0;
  const passRate = attempts.length
    ? Math.round((attempts.filter((a) => Number(a.percentage || 0) >= 50).length / attempts.length) * 100)
    : 0;
  const highest = attempts.length ? Math.max(...attempts.map((a) => Math.round(Number(a.percentage || 0)))) : 0;

  return (
    <div className="ct-app tc-studio">
      <TeacherShell active="control" crumb={`Results · ${exam?.name || ""}`} school={school} username={teacherName}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Official Score Ledger · {exam?.exam_class || ""}</span>
            <h1>{exam?.name || "Examination Results"}</h1>
            <p>Review graded candidate scripts, release or withhold student scores, and export results to CSV.</p>
          </div>
          <div className="tc-head__actions">
            {exam && (
              <button
                type="button"
                className="tc-btn tc-btn--secondary"
                disabled={busyRelease}
                onClick={() => void toggleRelease()}
              >
                <CtIco name={exam.results_released ? "i-lock" : "i-unlock"} className="ct-ico--sm" />
                {exam.results_released ? "Withhold Scores" : "Release Scores"}
              </button>
            )}
            <button type="button" className="tc-btn tc-btn--secondary" onClick={exportCsv} disabled={!attempts.length}>
              <CtIco name="i-download" className="ct-ico--sm" />
              Export CSV
            </button>
            <button type="button" className="tc-btn tc-btn--primary" onClick={() => window.print()}>
              <CtIco name="i-print" className="ct-ico--sm" />
              Print Ledger
            </button>
          </div>
        </header>

        <section className="tc-kpi-strip">
          <div className="tc-kpi">
            <span className="tc-kpi__label">Scripts Graded</span>
            <strong className="tc-kpi__val">{attempts.length}</strong>
            <span className="tc-kpi__meta">Completed submissions</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Mean Score</span>
            <strong className="tc-kpi__val">{avg}%</strong>
            <span className="tc-kpi__meta">Cohort average</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Pass Rate</span>
            <strong className="tc-kpi__val">{passRate}%</strong>
            <span className="tc-kpi__meta">50% pass threshold</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Top Score</span>
            <strong className="tc-kpi__val">{highest}%</strong>
            <span className="tc-kpi__meta">
              Status: {exam?.results_released ? "Released" : "Withheld"}
            </span>
          </div>
        </section>

        <section className="tc-card">
          <div className="tc-card__head">
            <div className="tc-card__title">
              <h2>Candidate Scores</h2>
              <p>Click any student name to inspect their full script and performance history</p>
            </div>
            <label className="tc-search" style={{ width: 220 }}>
              <CtIco name="i-search" className="ct-ico--sm" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search student..."
              />
            </label>
          </div>
          {loading ? (
            <div style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>Loading results...</div>
          ) : filtered.length === 0 ? (
            <div className="tc-empty">
              <strong>No submitted scripts yet</strong>
              <p>Candidate scores will appear here automatically as soon as students submit.</p>
            </div>
          ) : (
            <div className="tc-table-wrap">
              <table className="tc-table td-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Student</th>
                    <th>Class</th>
                    <th className="is-center">Score</th>
                    <th>Accuracy</th>
                    <th className="is-center">Grade</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a, idx) => {
                    const pct = Math.round(Number(a.percentage || 0));
                    return (
                      <tr key={a.id}>
                        <td className="tc-mono">{idx + 1}</td>
                        <td>
                          <strong style={{ display: "block", fontWeight: 640 }}>
                            {a.student_name || a.student_username}
                          </strong>
                          <span className="tc-mono" style={{ fontSize: 11.5, color: "var(--tc-ink-3)" }}>
                            @{a.student_username}
                          </span>
                        </td>
                        <td>
                          <span className="tc-pill">{a.student_class || exam?.exam_class}</span>
                        </td>
                        <td className="tc-mono is-center">
                          {a.score} / {a.total}
                        </td>
                        <td>
                          <div className="tc-bar-cell">
                            <span className="tc-bar" style={{ width: 68 }}>
                              <i style={{ width: `${pct}%` }} />
                            </span>
                            <span className="tc-mono" style={{ fontWeight: 650 }}>
                              {pct}%
                            </span>
                          </div>
                        </td>
                        <td className="is-center">
                          <span className="tc-pill">{a.grade_label || "-"}</span>
                        </td>
                        <td>
                          <div className="tc-actions">
                            <Link className="tc-btn tc-btn--secondary tc-btn--sm" href={`/teacher/student/${a.student_local_id}`}>
                              Script &amp; Profile
                            </Link>
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
      </TeacherShell>
    </div>
  );
}
