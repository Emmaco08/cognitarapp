"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CogniTaraLockup } from "@/components/CogniTaraLogo";

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
  const [confirmExam, setConfirmExam] = useState<StudentDashboardData["available_exams"][number] | null>(null);

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
          setErr(json.message || "Could not load your exams.");
        }
      })
      .catch(() => setErr("Network error while loading student dashboard."))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSignOut() {
    await fetch("/api/v1/portal/auth/logout", { method: "POST", credentials: "include" });
    router.replace(data?.school?.school_code ? `/?school=${encodeURIComponent(data.school.school_code)}` : "/");
  }

  return (
    <>
      <header className="pt-topbar">
        <div className="pt-topbar-inner">
          <div className="pt-brand-link">
            <CogniTaraLockup markSize={20} wordmarkHeight={15} />
            {data ? (
              <span className="pt-pill pt-pill--mono">{data.school.school_code}</span>
            ) : null}
          </div>
          <div className="pt-topbar-meta">
            {data ? (
              <span className="pt-pill">
                {data.student.full_name}
                {data.student.student_class ? ` · ${data.student.student_class}` : ""}
              </span>
            ) : null}
            <button type="button" className="pt-btn pt-btn--sm" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" className="pt-wrap">
        {loading ? (
          <div className="pt-card" style={{ textAlign: "center", padding: 36, color: "var(--pt-ink-2)" }}>
            Loading your exams...
          </div>
        ) : err ? (
          <div className="pt-card" style={{ maxWidth: 460, margin: "40px auto", textAlign: "center" }}>
            <div className="pt-alert pt-alert--dark" style={{ marginBottom: 16 }}>
              {err}
            </div>
            <Link href="/" className="pt-btn pt-btn--primary">
              Back to School Portal
            </Link>
          </div>
        ) : data ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {/* Minimal School & Student Header */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12.5, color: "var(--pt-ink-2)", fontWeight: 600 }}>
                  {data.school.school_name} · {data.school.academic_session} · {data.school.current_term}
                </div>
                <h1 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700, letterSpacing: "-0.025em" }}>
                  {data.student.full_name}
                </h1>
              </div>
              {data.student.student_class ? (
                <span className="pt-pill pt-pill--dark">
                  {data.student.student_class}
                  {data.student.specialisation ? ` · ${data.student.specialisation}` : ""}
                </span>
              ) : null}
            </div>

            {data.school.online_portal_notice ? (
              <div className="pt-alert">{data.school.online_portal_notice}</div>
            ) : null}

            {/* Active Exams */}
            <section>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Active Exams</h2>
                <span className="pt-pill pt-pill--muted">{data.available_exams.length} available</span>
              </div>

              {data.available_exams.length === 0 ? (
                <div className="pt-card" style={{ textAlign: "center", padding: 34, color: "var(--pt-ink-2)" }}>
                  No active exams for your class right now.
                </div>
              ) : (
                <div className="pt-exam-grid">
                  {data.available_exams.map((ex) => {
                    const isDone = ex.attempt_status === "completed";
                    const isInProg = ex.attempt_status === "in_progress";
                    return (
                      <div key={ex.local_id} className="pt-exam-card">
                        <div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                            <span className="pt-pill">
                              {ex.duration} min · {ex.question_count} Qs
                            </span>
                            {isDone ? (
                              <span className="pt-pill pt-pill--dark">Completed</span>
                            ) : ex.is_paused ? (
                              <span className="pt-pill">Paused</span>
                            ) : isInProg ? (
                              <span className="pt-pill pt-pill--dark">In Progress</span>
                            ) : null}
                          </div>
                          <h3>{ex.name}</h3>
                        </div>

                        {isDone ? (
                          <button type="button" className="pt-btn" disabled style={{ width: "100%" }}>
                            Submitted
                          </button>
                        ) : ex.is_paused ? (
                          <button type="button" className="pt-btn" disabled style={{ width: "100%" }}>
                            Exam Paused
                          </button>
                        ) : isInProg ? (
                          <Link
                            href={`/exam/${ex.local_id}`}
                            className="pt-btn pt-btn--primary"
                            style={{ width: "100%" }}
                          >
                            Resume Exam
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className="pt-btn pt-btn--primary"
                            style={{ width: "100%" }}
                            onClick={() => setConfirmExam(ex)}
                          >
                            Start Exam
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Completed Results (Minimalist: just exam name + score/grade or Submitted) */}
            <section>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Results</h2>
                <span className="pt-pill pt-pill--muted">{data.completed_results.length}</span>
              </div>

              {data.completed_results.length === 0 ? (
                <div className="pt-card" style={{ textAlign: "center", padding: 28, color: "var(--pt-ink-2)" }}>
                  Your submitted exam results will appear here.
                </div>
              ) : (
                <div className="pt-exam-grid">
                  {data.completed_results.map((r) => (
                    <div key={r.attempt_id} className="pt-exam-card" style={{ gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <h3 style={{ fontSize: 15 }}>{r.exam_name}</h3>
                        {r.results_released && r.grade_label ? (
                          <span className="pt-pill pt-pill--dark">{r.grade_label}</span>
                        ) : (
                          <span className="pt-pill">Submitted</span>
                        )}
                      </div>
                      {r.results_released && r.score !== null && r.total !== null ? (
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                          <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
                            {r.score}/{r.total}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--pt-ink-2)" }}>
                            {r.percentage}%
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </main>

      {/* Ultra-minimal Start Exam Confirmation Modal */}
      {confirmExam ? (
        <div className="pt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Start Exam">
          <div className="pt-modal">
            <div className="pt-modal-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
            <h2>{confirmExam.name}</h2>
            <div style={{ fontSize: 14, color: "var(--pt-ink-2)", marginBottom: 20 }}>
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
    </>
  );
}
