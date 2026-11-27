"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CogniTaraLockup } from "@/components/CogniTaraLogo";
import {
  getMonogram,
  PIconAlert,
  PIconArrowRight,
  PIconCheck,
  PIconChevronDown,
  PIconClock,
  PIconDoc,
  PIconLock,
  PIconLogOut,
  PIconPlay,
  PIconShield,
  PortalThemeToggle,
} from "@/components/portal/PortalIcons";

interface StudentDashboardData {
  school: {
    school_code: string;
    school_name: string;
    school_motto: string;
    academic_session: string;
    current_term: string;
    online_portal_notice: string;
  };
  student: {
    local_id: number;
    username: string;
    full_name: string;
    student_class: string;
    specialisation: string;
    warnings_count?: number;
  };
  available_exams: Array<{
    local_id: number;
    name: string;
    exam_class: string;
    duration: number;
    question_count: number;
    calculator_type: string;
    max_warnings: number;
    is_paused: boolean;
    attempt_status: "not_started" | "in_progress" | "completed";
    attempt_id: string | null;
  }>;
  completed_results: Array<{
    attempt_id: string;
    exam_local_id: number;
    exam_name: string;
    completed_at: string | null;
    results_released: boolean;
    score: number | null;
    total: number | null;
    percentage: number | null;
    grade_label: string | null;
    grade_remark: string | null;
    origin: string;
  }>;
}

export default function StudentPortalDashboard() {
  const router = useRouter();
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmExam, setConfirmExam] = useState<StudentDashboardData["available_exams"][number] | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/v1/portal/student/dashboard", { credentials: "include" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 403) {
          setErr(json.message || "Sign in to access your student portal.");
          if (res.status === 401) router.replace("/");
          return;
        }
        if (res.ok && json.ok) {
          setData(json);
        } else {
          setErr(json.message || "Could not load your examinations.");
        }
      })
      .catch(() => setErr("Network error while loading student portal."))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function handleSignOut() {
    await fetch("/api/v1/portal/auth/logout", { method: "POST", credentials: "include" });
    router.replace(data?.school?.school_code ? `/?school=${encodeURIComponent(data.school.school_code)}` : "/");
  }

  const inProgressExams = data ? data.available_exams.filter((e) => e.attempt_status === "in_progress") : [];
  const scheduledExams = data ? data.available_exams.filter((e) => e.attempt_status === "not_started") : [];
  const releasedResults = data
    ? data.completed_results.filter((r) => r.results_released && r.percentage !== null)
    : [];
  const avgScore = releasedResults.length
    ? (
        releasedResults.reduce((sum, r) => sum + Number(r.percentage || 0), 0) / releasedResults.length
      ).toFixed(1)
    : "0";
  const bestScore = releasedResults.length
    ? Math.round(Math.max(...releasedResults.map((r) => Number(r.percentage || 0))))
    : 0;
  const warningsCount = Number(data?.student.warnings_count || 0);
  const initials = data ? getMonogram(data.student.full_name, "ST") : "ST";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Editorial Top Bar (Matches Offline dashboard.html) */}
      <header className="pt-st-nav">
        <div className="pt-st-brand">
          <CogniTaraLockup markSize={22} wordmarkHeight={14} />
          {data ? (
            <>
              <span className="pt-st-brand__sep" aria-hidden="true" />
              <span className="pt-st-brand__school">{data.school.school_name}</span>
            </>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {data ? (
            <span className="pt-mono pt-hide-sm" style={{ fontSize: 11.5, color: "var(--pt-ink-3)" }}>
              {data.school.current_term} · {data.school.academic_session}
            </span>
          ) : null}

          <PortalThemeToggle />

          {data ? (
            <div className="pt-user-menu-wrap" ref={menuRef}>
              <button
                type="button"
                className="pt-user-trigger"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className="pt-crest pt-crest--solid pt-crest--xs">{initials}</span>
                <span className="pt-hide-sm">{data.student.full_name}</span>
                <PIconChevronDown size={13} />
              </button>

              {menuOpen ? (
                <div className="pt-dropdown-menu" role="menu">
                  <div className="pt-dropdown-menu__head">
                    <strong>{data.student.full_name}</strong>
                    <span>
                      {data.student.student_class || "Student"} · @{data.student.username}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="pt-dropdown-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      void handleSignOut();
                    }}
                  >
                    <PIconLogOut size={14} />
                    <span>Sign out</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <main id="main-content" className="pt-st-main">
        {loading ? (
          <div className="pt-card pt-card--pad" style={{ textAlign: "center", padding: 40, color: "var(--pt-ink-2)" }}>
            Loading your examinations...
          </div>
        ) : err ? (
          <div className="pt-card pt-card--pad" style={{ maxWidth: 440, margin: "40px auto", textAlign: "center" }}>
            <div className="pt-alert pt-alert--dark" style={{ marginBottom: 16 }}>
              {err}
            </div>
            <Link href="/" className="pt-btn pt-btn--primary">
              Back to School Portal
            </Link>
          </div>
        ) : data ? (
          <>
            {/* Editorial Student Identity + Unified 4-Cell KPI Rail */}
            <section className="pt-st-header" aria-label="Student overview">
              <div className="pt-page-head__left">
                <span className="pt-crest pt-crest--solid pt-crest--lg">{initials}</span>
                <div>
                  <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.2 }}>
                    {data.student.full_name}
                  </h1>
                  <div className="pt-meta-line">
                    {data.student.student_class ? <span>{data.student.student_class}</span> : null}
                    {data.student.student_class ? <span className="pt-meta-sep" /> : null}
                    <span className="pt-mono">@{data.student.username}</span>
                    <span className="pt-meta-sep" />
                    <span className="pt-status is-live">
                      <span className="pt-dot" />
                      Ready for examinations
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-kpi-rail" aria-label="Performance summary">
                <div className="pt-kpi-cell">
                  <span className="pt-kpi-cell__label">Available</span>
                  <strong className="pt-kpi-cell__val">{scheduledExams.length + inProgressExams.length}</strong>
                </div>
                <div className="pt-kpi-cell">
                  <span className="pt-kpi-cell__label">Completed</span>
                  <strong className="pt-kpi-cell__val">{data.completed_results.length}</strong>
                </div>
                <div className="pt-kpi-cell">
                  <span className="pt-kpi-cell__label">Average</span>
                  <strong className="pt-kpi-cell__val">{avgScore}%</strong>
                </div>
                <div className="pt-kpi-cell">
                  <span className="pt-kpi-cell__label">Best score</span>
                  <strong className="pt-kpi-cell__val">{bestScore}%</strong>
                </div>
              </div>
            </section>

            {data.school.online_portal_notice ? (
              <div className="pt-alert">{data.school.online_portal_notice}</div>
            ) : null}

            {/* Asymmetric Two-Column Editorial Workspace */}
            <div className="pt-st-workspace">
              {/* Left Primary Column */}
              <div className="pt-st-col">
                {inProgressExams.length > 0 ? (
                  <section className="pt-card" aria-label="In-progress examinations">
                    <div className="pt-card__head">
                      <div className="pt-card__title">
                        <h2>Resume in-progress examination</h2>
                        <p>Answers and remaining time are saved automatically</p>
                      </div>
                      <span className="pt-mono" style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
                        {inProgressExams.length} active
                      </span>
                    </div>
                    <div>
                      {inProgressExams.map((ex) => (
                        <div key={ex.local_id} className="pt-exam-row">
                          <div>
                            <span className="pt-exam-row__title">{ex.name}</span>
                            <div className="pt-exam-row__meta">
                              <span className="pt-mono">
                                <PIconClock size={13} />
                                {ex.duration} minutes
                              </span>
                              <span className="pt-status is-live">
                                <span className="pt-dot" />
                                In progress
                              </span>
                            </div>
                          </div>
                          {ex.is_paused ? (
                            <button type="button" className="pt-btn" disabled>
                              Paused
                            </button>
                          ) : (
                            <Link href={`/exam/${ex.local_id}`} className="pt-btn pt-btn--primary">
                              <span>Resume Exam</span>
                              <PIconArrowRight size={14} />
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="pt-card" aria-label="Scheduled examinations">
                  <div className="pt-card__head">
                    <div className="pt-card__title">
                      <h2>Scheduled Examinations</h2>
                      <p>Active papers assigned to {data.student.student_class || "your class"}</p>
                    </div>
                    <span className="pt-mono" style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
                      {scheduledExams.length} ready
                    </span>
                  </div>

                  {scheduledExams.length > 0 ? (
                    <div>
                      {scheduledExams.map((ex, idx) => (
                        <div key={ex.local_id} className="pt-exam-row">
                          <div>
                            <span className="pt-exam-row__title">{ex.name}</span>
                            <div className="pt-exam-row__meta">
                              <span className="pt-mono">
                                <PIconClock size={13} />
                                {ex.duration} minutes · {ex.question_count} questions
                              </span>
                              <span>
                                <PIconShield size={13} />
                                Auto-save &amp; integrity monitoring
                              </span>
                            </div>
                          </div>
                          {ex.is_paused ? (
                            <button type="button" className="pt-btn" disabled>
                              Paused
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={`pt-btn ${inProgressExams.length === 0 && idx === 0 ? "pt-btn--primary" : ""}`}
                              onClick={() => setConfirmExam(ex)}
                            >
                              <span>Start Exam</span>
                              <PIconArrowRight size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="pt-empty">
                      <span className="pt-empty__ico">
                        <PIconCheck size={18} />
                      </span>
                      <strong>No active examinations right now</strong>
                      <p>When your teacher or administrator activates an exam for your class, it will appear here.</p>
                    </div>
                  )}
                </section>

                <section className="pt-card" aria-label="Academic transcript">
                  <div className="pt-card__head">
                    <div className="pt-card__title">
                      <h2>Academic Transcript</h2>
                      <p>Completed papers and released grades for this session</p>
                    </div>
                    <span className="pt-mono" style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
                      {data.completed_results.length} recorded
                    </span>
                  </div>

                  {data.completed_results.length > 0 ? (
                    <div className="pt-table-wrap">
                      <table className="pt-table">
                        <thead>
                          <tr>
                            <th>Examination</th>
                            <th>Score</th>
                            <th>Accuracy</th>
                            <th style={{ textAlign: "right" }}>Grade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.completed_results.map((r) => {
                            const pct = r.percentage !== null ? Math.round(r.percentage) : 0;
                            return (
                              <tr key={r.attempt_id}>
                                <td style={{ fontWeight: 500 }}>{r.exam_name}</td>
                                <td className="pt-mono">
                                  {r.results_released && r.score !== null && r.total !== null ? (
                                    `${r.score} / ${r.total}`
                                  ) : (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--pt-ink-3)" }}>
                                      <PIconLock size={13} />
                                      Withheld
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {r.results_released && r.percentage !== null ? (
                                    <div className="pt-bar-cell">
                                      <span className="pt-mini-bar">
                                        <i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                                      </span>
                                      <span className="pt-mono" style={{ fontSize: 12.5 }}>
                                        {pct}%
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="pt-mono" style={{ color: "var(--pt-ink-3)" }}>
                                      -
                                    </span>
                                  )}
                                </td>
                                <td style={{ textAlign: "right", fontWeight: 600 }}>
                                  {r.results_released && r.grade_label ? (
                                    <span className="pt-mono">{r.grade_label}</span>
                                  ) : (
                                    <span style={{ color: "var(--pt-ink-3)", fontWeight: 500 }}>Pending</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="pt-empty">
                      <span className="pt-empty__ico">
                        <PIconDoc size={18} />
                      </span>
                      <strong>No completed papers yet</strong>
                      <p>Submitted exams and released grades will appear on your transcript here.</p>
                    </div>
                  )}
                </section>
              </div>

              {/* Right Contextual Rail (Matches Offline dashboard.html) */}
              <aside className="pt-st-col" aria-label="Exam integrity and guidelines">
                <section className="pt-card pt-card--pad">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <strong style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 600 }}>
                      <PIconShield size={15} />
                      <span>Integrity Standing</span>
                    </strong>
                    <span className="pt-mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {warningsCount} warning{warningsCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--pt-ink-2)", lineHeight: 1.55 }}>
                    {warningsCount > 0
                      ? `Previous sessions recorded ${warningsCount} focus warning${warningsCount === 1 ? "" : "s"}. Stay inside your exam window and avoid switching tabs during papers.`
                      : "Clean integrity standing. Stay inside your exam window and avoid switching tabs during active papers."}
                  </p>
                </section>

                <section className="pt-card">
                  <div className="pt-card__head" style={{ padding: "16px 20px" }}>
                    <div className="pt-card__title">
                      <h2>Before You Begin</h2>
                      <p>How examinations operate on this portal</p>
                    </div>
                  </div>
                  <div className="pt-guide-list">
                    <div className="pt-guide-row">
                      <span className="pt-guide-num">01</span>
                      <div>
                        <strong>Authoritative Timer</strong>
                        <p>Each paper runs on a server-verified countdown starting when you begin.</p>
                      </div>
                    </div>
                    <div className="pt-guide-row">
                      <span className="pt-guide-num">02</span>
                      <div>
                        <strong>Instant Auto-Save</strong>
                        <p>Every selected option is stored immediately on your device and synced safely.</p>
                      </div>
                    </div>
                    <div className="pt-guide-row">
                      <span className="pt-guide-num">03</span>
                      <div>
                        <strong>Power-Safe Resume</strong>
                        <p>If your connection drops or your device restarts, sign back in to continue.</p>
                      </div>
                    </div>
                    <div className="pt-guide-row">
                      <span className="pt-guide-num">04</span>
                      <div>
                        <strong>Verified Grading</strong>
                        <p>Scores appear upon submission when instant release is enabled by your school.</p>
                      </div>
                    </div>
                  </div>
                  <div className="pt-guide-foot">
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500, color: "var(--pt-ink)" }}>
                      <PIconAlert size={14} />
                      <span>5 warnings auto-submit your paper</span>
                    </div>
                    <div className="pt-guide-rules">
                      <span>No tab switching</span>
                      <span>No right-click</span>
                      <span>No copy / paste</span>
                      <span>No DevTools</span>
                    </div>
                  </div>
                </section>
              </aside>
            </div>
          </>
        ) : null}
      </main>

      {/* Minimalist Start Exam Confirmation Modal */}
      {confirmExam ? (
        <div className="pt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Start examination">
          <div className="pt-modal">
            <div className="pt-modal-icon">
              <PIconPlay size={20} />
            </div>
            <h2>{confirmExam.name}</h2>
            <div className="pt-mono" style={{ fontSize: 13, color: "var(--pt-ink-2)", marginBottom: 22 }}>
              {confirmExam.duration} minutes · {confirmExam.question_count} questions
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button type="button" className="pt-btn" onClick={() => setConfirmExam(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="pt-btn pt-btn--primary"
                onClick={() => router.push(`/exam/${confirmExam.local_id}`)}
              >
                Begin Now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
