"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CT_ICONS_URL, CtIco, CtThemeToggle, getInitials } from "@/components/portal/CtIco";

interface AvailableExam {
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
}

interface CompletedResult {
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
}

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
    warnings_count: number;
  };
  available_exams: AvailableExam[];
  completed_results: CompletedResult[];
}

export default function PortalStudentDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [launchingExam, setLaunchingExam] = useState<{ id: number; name: string } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/portal/student/dashboard", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          router.replace("/");
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (!alive || !json) return;
        if (!json.ok) setErr(json.message || "Could not load student portal.");
        else setData(json);
      })
      .catch(() => {
        if (alive) setErr("Connection error while loading your dashboard.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [router]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/v1/portal/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    window.location.href = "/";
  };

  const launchExamBriefing = (examId: number, examName: string) => {
    setLaunchingExam({ id: examId, name: examName });
    setTimeout(() => {
      router.push(`/student/exam/${examId}/start`);
    }, 450);
  };

  const inProgress = useMemo(
    () => (data?.available_exams || []).filter((e) => e.attempt_status === "in_progress"),
    [data]
  );
  const scheduled = useMemo(
    () => (data?.available_exams || []).filter((e) => e.attempt_status === "not_started"),
    [data]
  );
  const completed = useMemo(() => data?.completed_results || [], [data]);

  const stats = useMemo(() => {
    const released = completed.filter((c) => c.results_released && c.total && c.total > 0);
    const avg = released.length
      ? Math.round((released.reduce((s, r) => s + Number(r.percentage || 0), 0) / released.length) * 10) / 10
      : 0;
    const best = released.length
      ? Math.max(...released.map((r) => Math.round(Number(r.percentage || 0))))
      : 0;
    return { avg, best };
  }, [completed]);

  if (loading) {
    return (
      <div className="st-body" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div className="sc-min-card sc-min-card--compact">
          <div className="sc-min-card__emblem" aria-hidden="true">
            <div className="sc-min-card__core">
              <svg viewBox="0 0 24 24">
                <path d="M12 3l7.5 3.2v5.4c0 4.6-3.1 8.1-7.5 9.6-4.4-1.5-7.5-5-7.5-9.6V6.2L12 3z" />
                <path d="M9.2 12.2l2 2 3.8-4" />
              </svg>
            </div>
          </div>
          <h3 className="sc-min-card__title">Loading Student Portal</h3>
          <div className="sc-sweep-track" aria-hidden="true">
            <i />
          </div>
        </div>
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="st-body" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
        <section className="sc-min-card sc-min-card--compact">
          <h1 className="sc-min-card__title">Session Unavailable</h1>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--st-ink-2)" }}>{err || "Please sign in again."}</p>
          <div className="sc-min-card__stack">
            <Link href="/" className="st-btn st-btn--primary st-btn--lg st-btn--block">
              Return to Sign In
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const displayName = data.student.full_name || data.student.username;
  const initials = getInitials(displayName, "ST");
  const warnings = Number(data.student.warnings_count || 0);

  return (
    <div className="st-body">
      <div className="st-grain" aria-hidden="true" />

      <div className="st-shell">
        {/* Exact Offline Editorial Top Bar */}
        <header className="st-nav">
          <Link className="st-brand" href="/student" aria-label="CogniTara Student Portal">
            <span className="st-brand__mark">
              <svg viewBox="0 0 200 200">
                <use href={`${CT_ICONS_URL}#ct-mark`} />
              </svg>
            </span>
            <span className="st-brand__name">CogniTara</span>
            <span className="st-brand__sep" aria-hidden="true" />
            <span className="st-brand__meta">{data.school.school_name}</span>
          </Link>

          <div className="st-nav__right">
            <span className="st-term-pill">
              {data.school.current_term} · {data.school.academic_session}
            </span>
            <CtThemeToggle variant="st" />

            <div className={`ct-dropdown${menuOpen ? " is-open" : ""}`} ref={menuRef}>
              <button
                type="button"
                className="st-user-btn"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span
                  className="st-user-btn__img"
                  style={{
                    display: "grid",
                    placeItems: "center",
                    background: "var(--st-cta-bg)",
                    color: "var(--st-cta-ink)",
                    fontFamily: "var(--ct-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {initials}
                </span>
                <span>{displayName}</span>
                <CtIco name="i-chevron-down" className="ct-ico--xs" />
              </button>
              <div className="ct-menu" role="menu">
                <div className="ct-menu__head">
                  <strong>{displayName}</strong>
                  <span>
                    {data.student.student_class} · @{data.student.username}
                  </span>
                </div>
                <button
                  type="button"
                  className="ct-menu__item ct-menu__item--danger"
                  role="menuitem"
                  onClick={handleLogout}
                  style={{ width: "100%", border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}
                >
                  <CtIco name="i-logout" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="st-main" id="main">
          {/* Exact Offline Editorial Greeting + Typographic KPI Strip */}
          <section className="st-header" aria-label="Student overview">
            <div className="st-identity">
              <div className="st-avatar" aria-hidden="true">
                <span
                  style={{
                    display: "grid",
                    width: "100%",
                    height: "100%",
                    placeItems: "center",
                    background: "var(--st-cta-bg)",
                    color: "var(--st-cta-ink)",
                    fontFamily: "var(--ct-mono)",
                    fontSize: 18,
                    fontWeight: 740,
                    letterSpacing: "0.04em",
                  }}
                >
                  {initials}
                </span>
              </div>
              <div className="st-greeting">
                <h1>Welcome back, {displayName}</h1>
                <div className="st-meta-row">
                  <span>{data.student.student_class || "Student"}</span>
                  <span className="st-meta-dot" aria-hidden="true" />
                  <span className="st-mono">@{data.student.username}</span>
                  <span className="st-meta-dot" aria-hidden="true" />
                  <span className="st-status-live">
                    <i />
                    Ready for examinations
                  </span>
                </div>
              </div>
            </div>

            <div className="st-kpi-rail" aria-label="Performance summary">
              <div className="st-kpi">
                <span className="st-kpi__label">Available</span>
                <strong className="st-kpi__val">{scheduled.length + inProgress.length}</strong>
              </div>
              <div className="st-kpi">
                <span className="st-kpi__label">Completed</span>
                <strong className="st-kpi__val">{completed.length}</strong>
              </div>
              <div className="st-kpi">
                <span className="st-kpi__label">Average</span>
                <strong className="st-kpi__val">{stats.avg}%</strong>
              </div>
              <div className="st-kpi">
                <span className="st-kpi__label">Best Score</span>
                <strong className="st-kpi__val">{stats.best}%</strong>
              </div>
            </div>
          </section>

          {/* Exact Offline Asymmetric Two-Column Editorial Workspace */}
          <div className="st-workspace">
            <div className="st-col">
              {inProgress.length > 0 && (
                <section className="st-card st-card--spotlight" aria-label="In-progress examinations">
                  <div className="st-card__head">
                    <div>
                      <h2>Resume In-Progress Examination</h2>
                      <p>Answers and remaining time are auto-saved securely to your school portal.</p>
                    </div>
                    <span className="st-pill st-pill--warn">{inProgress.length} active</span>
                  </div>
                  <div className="st-exam-list">
                    {inProgress.map((exam) => (
                      <div className="st-exam-row" key={exam.local_id}>
                        <div className="st-exam-row__info">
                          <span className="st-exam-row__title">{exam.name}</span>
                          <div className="st-exam-row__meta">
                            <span className="st-mono">
                              <CtIco name="i-clock" className="ct-ico--xs" />
                              {exam.duration} min
                            </span>
                            <span className="st-pill st-pill--warn">
                              {exam.is_paused ? "Paused by invigilator" : "In progress"}
                            </span>
                          </div>
                        </div>
                        <Link href={`/exam/${exam.local_id}`} className="st-btn st-btn--primary">
                          <span>Resume Exam</span>
                          <CtIco name="i-arrow-right" className="ct-ico--sm st-arrow" />
                        </Link>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Scheduled Examinations */}
              <section className="st-card" aria-label="Available examinations">
                <div className="st-card__head">
                  <div>
                    <h2>Scheduled Examinations</h2>
                    <p>Active papers assigned to {data.student.student_class || "your class"}</p>
                  </div>
                  <span className="st-pill">{scheduled.length} ready</span>
                </div>

                {scheduled.length > 0 ? (
                  <div className="st-exam-list">
                    {scheduled.map((exam, idx) => (
                      <div className="st-exam-row" key={exam.local_id}>
                        <div className="st-exam-row__info">
                          <span className="st-exam-row__title">{exam.name}</span>
                          <div className="st-exam-row__meta">
                            <span className="st-mono">
                              <CtIco name="i-clock" className="ct-ico--xs" />
                              {exam.duration} minutes
                            </span>
                            <span>
                              <CtIco name="i-shield" className="ct-ico--xs" />
                              Auto-save &amp; integrity monitoring
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`st-btn ${inProgress.length === 0 && idx === 0 ? "st-btn--primary" : "st-btn--secondary"}`}
                          onClick={() => launchExamBriefing(exam.local_id, exam.name)}
                        >
                          <span>Start Exam</span>
                          <CtIco name="i-arrow-right" className="ct-ico--sm st-arrow" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="st-empty">
                    <span className="st-empty__ico">
                      <CtIco name="i-check-circle" />
                    </span>
                    <strong>No active examinations right now</strong>
                    <p>
                      When your teacher or administrator activates an exam for {data.student.student_class || "your class"}, it will appear here automatically.
                    </p>
                  </div>
                )}
              </section>

              {/* Academic Transcript */}
              <section className="st-card" aria-label="Completed examinations">
                <div className="st-card__head">
                  <div>
                    <h2>Academic Transcript</h2>
                    <p>Completed papers and released grades for this session</p>
                  </div>
                  <span className="st-pill">{completed.length} recorded</span>
                </div>

                {completed.length > 0 ? (
                  <div className="st-table-wrap">
                    <table className="st-table">
                      <thead>
                        <tr>
                          <th>Examination</th>
                          <th>Score</th>
                          <th>Accuracy</th>
                          <th style={{ textAlign: "right" }}>Grade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {completed.map((exam) => {
                          if (!exam.results_released) {
                            return (
                              <tr key={exam.attempt_id}>
                                <td className="st-table__name">
                                  <Link href={`/result/${exam.attempt_id}`} style={{ color: "inherit" }}>
                                    {exam.exam_name}
                                  </Link>
                                </td>
                                <td>
                                  <span className="st-pill">
                                    <CtIco name="i-lock" className="ct-ico--xs" />
                                    Withheld
                                  </span>
                                </td>
                                <td className="st-mono" style={{ color: "var(--st-ink-3)" }}>
                                  -
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <span className="st-pill">Pending</span>
                                </td>
                              </tr>
                            );
                          }
                          const pct = Math.round(Number(exam.percentage || 0));
                          const grade =
                            exam.grade_label ||
                            (pct >= 85 ? "A" : pct >= 70 ? "B" : pct >= 60 ? "C" : pct >= 50 ? "D" : "F");
                          const g0 = grade[0] || "F";
                          const gradeTone =
                            g0 === "A" || g0 === "B"
                              ? "st-grade--ok"
                              : g0 === "C"
                                ? "st-grade--accent"
                                : g0 === "D"
                                  ? "st-grade--warn"
                                  : "st-grade--bad";
                          const barTone = pct < 50 ? "st-mini-bar--bad" : pct < 65 ? "st-mini-bar--warn" : "";

                          return (
                            <tr key={exam.attempt_id}>
                              <td className="st-table__name">
                                <Link href={`/result/${exam.attempt_id}`} style={{ color: "inherit" }}>
                                  {exam.exam_name}
                                </Link>
                              </td>
                              <td className="st-mono">
                                {exam.score} / {exam.total}
                              </td>
                              <td>
                                <div className="st-table__bar">
                                  <span className={`st-mini-bar ${barTone}`}>
                                    <i style={{ width: `${pct}%` }} />
                                  </span>
                                  <span className="st-mono" style={{ fontSize: 13 }}>
                                    {pct}%
                                  </span>
                                </div>
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <span className={`st-grade ${gradeTone}`}>{grade}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="st-empty">
                    <span className="st-empty__ico">
                      <CtIco name="i-folder" />
                    </span>
                    <strong>No completed papers yet</strong>
                    <p>Submitted exams and released grades will appear on your transcript here.</p>
                  </div>
                )}
              </section>
            </div>

            {/* Exact Offline Right Contextual Rail */}
            <aside className="st-col" aria-label="Exam integrity and guidelines">
              <section className="st-card">
                <div className="st-standing">
                  <div className="st-standing__top">
                    <span className="st-standing__title">
                      <CtIco name="i-shield" className="ct-ico--sm" />
                      <span>Integrity Standing</span>
                    </span>
                    {warnings > 0 ? (
                      <span className="st-pill st-pill--warn">
                        {warnings} warning{warnings !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="st-pill st-pill--ok">Clean</span>
                    )}
                  </div>
                  {warnings > 0 ? (
                    <p>
                      Previous sessions recorded {warnings} focus warning{warnings !== 1 ? "s" : ""}. Stay inside your exam window and avoid switching tabs during papers.
                    </p>
                  ) : (
                    <p>
                      No rule violations recorded. Keep your browser focused inside the examination window for an uninterrupted sitting.
                    </p>
                  )}
                </div>
              </section>

              <section className="st-card">
                <div className="st-card__head">
                  <div>
                    <h2>Before You Begin</h2>
                    <p>How examinations operate on this portal</p>
                  </div>
                </div>
                <div className="st-checklist">
                  <div className="st-check-item">
                    <span className="st-check-num">01</span>
                    <div className="st-check-body">
                      <strong>Authoritative Timer</strong>
                      <span>Each paper has a server-synced countdown starting when you begin.</span>
                    </div>
                  </div>
                  <div className="st-check-item">
                    <span className="st-check-num">02</span>
                    <div className="st-check-body">
                      <strong>Instant Auto-Save</strong>
                      <span>Every selected option is saved securely as you work through each question.</span>
                    </div>
                  </div>
                  <div className="st-check-item">
                    <span className="st-check-num">03</span>
                    <div className="st-check-body">
                      <strong>Reconnect-Safe Resume</strong>
                      <span>If your connection drops or device restarts, sign back in to continue.</span>
                    </div>
                  </div>
                  <div className="st-check-item">
                    <span className="st-check-num">04</span>
                    <div className="st-check-body">
                      <strong>Verified Grading</strong>
                      <span>Scores appear upon submission when instant release is enabled.</span>
                    </div>
                  </div>
                </div>
                <div className="st-policy-foot">
                  <span className="st-policy-foot__title">
                    <CtIco name="i-alert" className="ct-ico--xs" />
                    <span>5 warnings auto-submit your paper</span>
                  </span>
                  <div className="st-policy-foot__rules">
                    <span className="st-rule-chip">No tab switching</span>
                    <span className="st-rule-chip">No right-click</span>
                    <span className="st-rule-chip">No copy / paste</span>
                    <span className="st-rule-chip">No DevTools</span>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </main>

        <footer className="st-foot">
          <span>{data.school.school_name} · Online Examination Server</span>
          <span className="st-mono" style={{ fontSize: 11, letterSpacing: "0.06em" }}>
            SCHOOL ID {data.school.school_code}
          </span>
        </footer>
      </div>

      {/* Exact Offline Minimalist Exam Launch Overlay */}
      <div className={`st-overlay${launchingExam ? " is-open" : ""}`} id="loadingOverlay" aria-hidden={!launchingExam}>
        <div className="sc-min-card sc-min-card--compact" role="status" aria-live="polite">
          <div className="sc-min-card__emblem" aria-hidden="true">
            <div className="sc-min-card__core">
              <svg viewBox="0 0 24 24">
                <path d="M12 3l7.5 3.2v5.4c0 4.6-3.1 8.1-7.5 9.6-4.4-1.5-7.5-5-7.5-9.6V6.2L12 3z" />
                <path d="M9.2 12.2l2 2 3.8-4" />
              </svg>
            </div>
          </div>
          <h3 id="loadingLabel" className="sc-min-card__title">
            {launchingExam?.name || "Opening Exam"}
          </h3>
          <div className="sc-sweep-track" aria-hidden="true">
            <i />
          </div>
        </div>
      </div>
    </div>
  );
}
