"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CT_ICONS_URL, CtIco, CtThemeToggle, getInitials } from "@/components/portal/CtIco";
import { MathText } from "@/components/portal/MathText";
import { OfflineCalc } from "@/components/portal/OfflineCalc";

interface ExamQuestion {
  index: number;
  local_id: number;
  section_name: string;
  passage: {
    name: string;
    content: string;
    instruction: string;
  } | null;
  question: string;
  options: string[];
}

interface ExamAttempt {
  id: string;
  exam_local_id: number;
  exam_name: string;
  exam_class: string;
  duration_minutes: number;
  calculator_type: string;
  max_warnings: number;
  anti_cheating_profile: string;
  warnings_count: number;
  remaining_seconds: number;
  authoritative_deadline: string;
  is_paused: boolean;
  answers: Record<string, string>;
}

interface GradedResult {
  attempt_id: string;
  score: number | null;
  total: number | null;
  percentage: number | null;
  grade_label: string | null;
  grade_remark: string | null;
  results_released: boolean;
}

function formatTimer(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function PortalExamRoomPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Number(params?.examId || 0);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [student, setStudent] = useState<{ full_name: string; username: string; student_class: string }>({
    full_name: "Student",
    username: "student",
    student_class: "",
  });
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIdx, setCurrentIdx] = useState(0);
  const [activeSection, setActiveSection] = useState<string>("ALL");

  const [remainingSec, setRemainingSec] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [warningsCount, setWarningsCount] = useState(0);
  const [saveState, setSaveState] = useState<"ready" | "saving" | "saved" | "offline">("ready");

  const [calcOpen, setCalcOpen] = useState(false);
  const [passageModal, setPassageModal] = useState<{ name: string; content: string } | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [endReason, setEndReason] = useState<"" | "time_up" | "max_warnings" | "force_submit">("");
  const [result, setResult] = useState<GradedResult | null>(null);
  const [countdown, setCountdown] = useState(12);
  const [countdownPaused, setCountdownPaused] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  const dirtyRef = useRef(false);
  const answersRef = useRef<Record<string, string>>({});
  const warningsRef = useRef(0);
  const attemptRef = useRef<ExamAttempt | null>(null);
  const submittedRef = useRef(false);
  const lastWarnAtRef = useRef(0);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    warningsRef.current = warningsCount;
  }, [warningsCount]);

  useEffect(() => {
    attemptRef.current = attempt;
  }, [attempt]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((cur) => (cur === msg ? "" : cur)), 3200);
  }, []);

  // Load/Start attempt once on mount
  useEffect(() => {
    if (!examId) return;
    let alive = true;
    fetch(`/api/v1/portal/student/exams/${examId}/start`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          router.replace("/");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!alive || !data) return;
        if (!data.ok) {
          setErr(data.message || "Could not start this examination.");
          return;
        }
        if (data.already_submitted && data.result) {
          submittedRef.current = true;
          setResult(data.result);
          return;
        }
        setStudent(data.student || { full_name: "Student", username: "student", student_class: "" });
        const att: ExamAttempt = data.attempt;
        setAttempt(att);
        setQuestions(data.questions || []);
        const lsKey = `ct_exam_ans_${att.id}`;
        let merged = { ...(att.answers || {}) };
        try {
          const cached = localStorage.getItem(lsKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && typeof parsed === "object") merged = { ...merged, ...parsed };
          }
        } catch {
          // ignore
        }
        setAnswers(merged);
        answersRef.current = merged;
        setRemainingSec(Number(att.remaining_seconds || 0));
        setIsPaused(Boolean(att.is_paused));
        setWarningsCount(Number(att.warnings_count || 0));
      })
      .catch(() => {
        if (alive) setErr("Connection error while starting examination.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [examId, router]);

  const syncWithServer = useCallback(
    async (opts?: { force?: boolean; warningEvent?: { type: string; message: string } }) => {
      const att = attemptRef.current;
      if (!att || submittedRef.current) return;
      if (!opts?.force && !dirtyRef.current && !opts?.warningEvent) return;

      setSaveState("saving");
      try {
        const res = await fetch(`/api/v1/portal/student/attempts/${att.id}/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            answers: answersRef.current,
            warnings_count: warningsRef.current,
            warning_event: opts?.warningEvent || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setSaveState("offline");
          return;
        }
        dirtyRef.current = false;
        setSaveState("saved");

        if (data.submitted && data.result) {
          submittedRef.current = true;
          try {
            localStorage.removeItem(`ct_exam_ans_${att.id}`);
          } catch {
            // ignore
          }
          if (data.reason === "force_submit") setEndReason("force_submit");
          else if (data.reason === "max_warnings") setEndReason("max_warnings");
          else if (data.reason === "time_up") setEndReason("time_up");
          setTimeout(() => {
            setEndReason("");
            setResult(data.result);
          }, data.reason ? 1100 : 0);
          return;
        }

        if (typeof data.is_paused === "boolean") setIsPaused(data.is_paused);
        if (typeof data.remaining_seconds === "number") setRemainingSec(data.remaining_seconds);
        if (typeof data.warnings_count === "number") setWarningsCount(data.warnings_count);
      } catch {
        setSaveState("offline");
      }
    },
    []
  );

  const submitExam = useCallback(
    async (autoSubmitted = false, reason: "" | "time_up" | "max_warnings" = "") => {
      const att = attemptRef.current;
      if (!att || submittedRef.current) return;
      submittedRef.current = true;
      setSubmitConfirmOpen(false);
      if (reason) setEndReason(reason);
      else setSubmitting(true);

      try {
        const res = await fetch(`/api/v1/portal/student/attempts/${att.id}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            answers: answersRef.current,
            warnings_count: warningsRef.current,
            auto_submitted: autoSubmitted,
          }),
        });
        const data = await res.json().catch(() => ({}));
        try {
          localStorage.removeItem(`ct_exam_ans_${att.id}`);
        } catch {
          // ignore
        }
        if (data.ok && data.result) {
          setTimeout(() => {
            setSubmitting(false);
            setEndReason("");
            setResult(data.result);
          }, reason ? 1000 : 400);
        } else {
          submittedRef.current = false;
          setSubmitting(false);
          setEndReason("");
          showToast(data.message || "Could not submit exam. Please try again.");
        }
      } catch {
        submittedRef.current = false;
        setSubmitting(false);
        setEndReason("");
        showToast("Connection lost while submitting. Please tap Submit again.");
      }
    },
    [showToast]
  );

  // Authoritative 1-second local countdown
  useEffect(() => {
    if (!attempt || isPaused || result || submitting) return;
    const id = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          void submitExam(true, "time_up");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [attempt, isPaused, result, submitting, submitExam]);

  // Free Vercel Hobby friendly low-frequency sync:
  // - Every 45s when dirty (or heartbeat check for admin pause/time changes)
  // - Every 18s ONLY while paused so student resumes promptly once invigilator unpauses
  useEffect(() => {
    if (!attempt || result) return;
    const intervalMs = isPaused ? 18_000 : 45_000;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncWithServer({ force: true });
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [attempt, isPaused, result, syncWithServer]);

  // Flush on pagehide
  useEffect(() => {
    const onHide = () => {
      if (dirtyRef.current && attemptRef.current && !submittedRef.current) {
        const blob = new Blob(
          [
            JSON.stringify({
              answers: answersRef.current,
              warnings_count: warningsRef.current,
            }),
          ],
          { type: "application/json" }
        );
        navigator.sendBeacon?.(`/api/v1/portal/student/attempts/${attemptRef.current.id}/sync`, blob);
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  // Anti-cheating integrity monitoring
  useEffect(() => {
    if (!attempt || result || attempt.anti_cheating_profile === "none") return;

    const recordWarning = (type: string, message: string) => {
      if (submittedRef.current || isPaused) return;
      const now = Date.now();
      if (now - lastWarnAtRef.current < 2500) return;
      lastWarnAtRef.current = now;
      const next = warningsRef.current + 1;
      setWarningsCount(next);
      warningsRef.current = next;
      showToast(`Warning ${next}/${attempt.max_warnings}: ${message}`);
      if (next >= attempt.max_warnings) {
        void submitExam(true, "max_warnings");
      } else {
        void syncWithServer({ force: true, warningEvent: { type, message } });
      }
    };

    const onVis = () => {
      if (document.hidden) recordWarning("tab_switch", "Tab switching or minimizing is not allowed.");
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      recordWarning("right_click", "Right-click is disabled during examination.");
    };
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      recordWarning("copy_paste", "Copying exam content is not allowed.");
    };

    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("copy", onCopy);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("copy", onCopy);
    };
  }, [attempt, isPaused, result, showToast, submitExam, syncWithServer]);

  // Result modal auto-return countdown
  useEffect(() => {
    if (!result || countdownPaused) return;
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          router.push("/student");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [result, countdownPaused, router]);

  const sections = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const q of questions) {
      const s = q.section_name || "";
      if (s && !seen.has(s)) {
        seen.add(s);
        list.push(s);
      }
    }
    return list;
  }, [questions]);

  const selectOption = useCallback((qid: number, optionText: string) => {
    if (isPaused || submittedRef.current) return;
    setAnswers((prev) => {
      const next = { ...prev, [String(qid)]: optionText };
      answersRef.current = next;
      dirtyRef.current = true;
      if (attemptRef.current) {
        try {
          localStorage.setItem(`ct_exam_ans_${attemptRef.current.id}`, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
    setSaveState("ready");
  }, [isPaused]);

  const currentQuestion = questions[currentIdx] || null;

  // Keyboard shortcuts: Left/Right arrows + A/B/C/D options
  useEffect(() => {
    if (!questions.length || result || submitConfirmOpen || isPaused || calcOpen || passageModal) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight") {
        setCurrentIdx((i) => Math.min(questions.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        setCurrentIdx((i) => Math.max(0, i - 1));
      } else {
        const up = e.key.toUpperCase();
        const optIdx = ["A", "B", "C", "D"].indexOf(up);
        if (optIdx >= 0 && currentQuestion && currentQuestion.options[optIdx]) {
          selectOption(currentQuestion.local_id, currentQuestion.options[optIdx]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [questions.length, currentQuestion, result, submitConfirmOpen, isPaused, calcOpen, passageModal, selectOption]);

  const answeredCount = useMemo(
    () => questions.filter((q) => Boolean(answers[String(q.local_id)])).length,
    [questions, answers]
  );
  const progressPct = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
  const unansweredCount = Math.max(0, questions.length - answeredCount);

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
          <h3 className="sc-min-card__title">Preparing Exam Room</h3>
          <div className="sc-sweep-track" aria-hidden="true">
            <i />
          </div>
        </div>
      </div>
    );
  }

  if (err && !result) {
    return (
      <div className="st-body" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
        <section className="sc-min-card sc-min-card--compact">
          <h1 className="sc-min-card__title">Cannot Open Exam</h1>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--st-ink-2)" }}>{err}</p>
          <div className="sc-min-card__stack">
            <Link href="/student" className="st-btn st-btn--primary st-btn--lg st-btn--block">
              Back to Dashboard
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const maxWarn = attempt?.max_warnings || 5;
  const warnStage =
    warningsCount === 0
      ? "stage-clean"
      : warningsCount >= maxWarn - 1
        ? "stage-critical"
        : warningsCount >= Math.ceil(maxWarn / 2)
          ? "stage-mid"
          : "stage-low";
  const timerClass =
    remainingSec <= 60 ? "timer-box danger" : remainingSec <= 300 ? "timer-box warning" : "timer-box";
  const calcType = attempt?.calculator_type || "none";
  const hasCalc = calcType !== "none";
  const studentInitials = getInitials(student.full_name || student.username, "ST");
  const ringOffset = 188.5 * (1 - (questions.length ? answeredCount / questions.length : 0));

  const resPct = result?.results_released ? Math.round(Number(result.percentage || 0)) : 0;
  const resGrade =
    result?.grade_label ||
    (resPct >= 85 ? "A" : resPct >= 70 ? "B" : resPct >= 60 ? "C" : resPct >= 50 ? "D" : "F");

  return (
    <div className="ct-app ct-exam-studio" style={{ minHeight: "100vh" }}>
      {/* Exact Offline Fixed Header */}
      <div className="fixed-header">
        <div className="header-top">
          <div className="exam-title">
            <span className="ct-appicon" style={{ width: 28, height: 28, borderRadius: 8, flex: "none" }}>
              <svg viewBox="0 0 200 200">
                <use href={`${CT_ICONS_URL}#ct-mark`} />
              </svg>
            </span>
            <span>{attempt?.exam_name || "Examination"}</span>
          </div>

          <div className="header-actions">
            <CtThemeToggle variant="ct" />

            {hasCalc && (
              <button
                type="button"
                className="calculator-btn"
                id="calculatorBtn"
                title="Open Calculator"
                onClick={() => setCalcOpen((v) => !v)}
              >
                <CtIco name="i-calculator" className="ct-ico--sm" />
                <span>Calculator</span>
              </button>
            )}

            <div className="student-name-badge">
              <span className="ex-avatar-initials" aria-hidden="true">
                {studentInitials}
              </span>
              <span>{student.full_name || student.username}</span>
              {student.student_class && <span style={{ marginLeft: 4 }}>· {student.student_class}</span>}
            </div>

            <div className={timerClass} id="timerContainer">
              <div className="timer-label">Time Remaining</div>
              <div className="timer-value" id="timer">
                {formatTimer(remainingSec)}
              </div>
            </div>
          </div>
        </div>

        <div className="nav-row">
          <div className="section-tabs" id="sectionTabs">
            {sections.length > 0 ? (
              <>
                <button
                  type="button"
                  className={`section-tab${activeSection === "ALL" ? " active" : ""}`}
                  onClick={() => setActiveSection("ALL")}
                >
                  All Sections ({questions.length})
                </button>
                {sections.map((sec) => {
                  const firstIdx = questions.findIndex((q) => q.section_name === sec);
                  const count = questions.filter((q) => q.section_name === sec).length;
                  return (
                    <button
                      type="button"
                      key={sec}
                      className={`section-tab${activeSection === sec ? " active" : ""}`}
                      onClick={() => {
                        setActiveSection(sec);
                        if (firstIdx >= 0) setCurrentIdx(firstIdx);
                      }}
                    >
                      {sec} ({count})
                    </button>
                  );
                })}
              </>
            ) : (
              <span className="section-tab active">Main Paper ({questions.length} Questions)</span>
            )}
          </div>

          <div className="mini-progress">
            <div className="mini-progress-bar">
              <div className="mini-progress-fill" id="miniProgressFill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mini-progress-text" id="miniProgressText">
              {answeredCount}/{questions.length}
            </div>
          </div>
        </div>
      </div>

      {/* Exact Offline Warning Badge & Save Status Indicator */}
      <div className={`warning-badge ${warnStage}`} id="warningBadge">
        <CtIco name="i-shield" className="ct-ico--xs" />{" "}
        {warningsCount === 0 ? "Clean Record:" : "Warnings:"} <strong>{warningsCount}</strong> / <span>{maxWarn}</span>
      </div>

      <div id="saveStatusIndicator" onClick={() => void syncWithServer({ force: true })} style={{ cursor: "pointer" }}>
        <CtIco name={saveState === "offline" ? "i-alert" : "i-check-circle"} className="ct-ico--xs" />
        <span id="saveStatusText">
          {saveState === "saving"
            ? "Saving..."
            : saveState === "saved"
              ? "Saved"
              : saveState === "offline"
                ? "Offline cached"
                : "Auto-save ready"}
        </span>
      </div>

      {toastMsg && (
        <div className="ct-toasts" style={{ top: 118 }}>
          <div className="ct-toast ct-toast--warn">
            <CtIco name="i-alert" className="ct-ico--sm" />
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      {/* Exact Offline Main Content + Right Command Rail */}
      {!result && currentQuestion && (
        <div className="main-content">
          <div id="questionsContainer">
            <div className="question-card active" data-qid={currentQuestion.local_id}>
              <div className="question-header">
                <span className="question-number">
                  Question {currentIdx + 1} of {questions.length}
                  {currentQuestion.section_name ? ` · ${currentQuestion.section_name}` : ""}
                </span>
              </div>

              {currentQuestion.passage && (
                <div className="group-content-box">
                  <h4>
                    <CtIco name="i-layers" className="ct-ico--sm" /> {currentQuestion.passage.name || "Reading Passage"}
                  </h4>
                  {currentQuestion.passage.instruction && (
                    <div className="group-instruction">
                      <CtIco name="i-info" className="ct-ico--xs" /> {currentQuestion.passage.instruction}
                    </div>
                  )}
                  {Boolean(currentQuestion.passage.content?.trim()) && (
                    <>
                      <div
                        className="passage-preview-box"
                        onClick={() =>
                          setPassageModal({
                            name: currentQuestion.passage!.name || "Reading Passage",
                            content: currentQuestion.passage!.content,
                          })
                        }
                      >
                        <div className="passage-text-content">
                          <MathText text={currentQuestion.passage.content} />
                        </div>
                        <div className="passage-fade-overlay" />
                      </div>
                      <div
                        className="passage-expand-cta"
                        onClick={() =>
                          setPassageModal({
                            name: currentQuestion.passage!.name || "Reading Passage",
                            content: currentQuestion.passage!.content,
                          })
                        }
                      >
                        Click to read full passage
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="question-text">
                <MathText text={currentQuestion.question} />
              </div>

              <div className="options-container">
                {currentQuestion.options.map((optText, oIdx) => {
                  const selected = answers[String(currentQuestion.local_id)] === optText;
                  const inputId = `q${currentQuestion.local_id}_${oIdx}`;
                  return (
                    <div
                      key={inputId}
                      className={`radio-option${selected ? " selected" : ""}`}
                      data-opt-index={oIdx}
                      onClick={() => selectOption(currentQuestion.local_id, optText)}
                    >
                      <input
                        type="radio"
                        name={`q${currentQuestion.local_id}`}
                        id={inputId}
                        value={optText}
                        checked={selected}
                        onChange={() => selectOption(currentQuestion.local_id, optText)}
                      />
                      <label
                        htmlFor={inputId}
                        style={{ wordWrap: "break-word", overflowWrap: "break-word", maxWidth: "100%", display: "block" }}
                      >
                        <MathText text={optText} />
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Exact Offline Sticky Right-Hand Command Rail: Previous/Next ABOVE Question Navigator + Submit */}
          <aside className="exam-rail" aria-label="Question navigation and overview">
            <div className="nav-buttons">
              <div className="nav-rail-head">
                <span className="nav-rail-eyebrow">Question Controls</span>
                <span className="nav-rail-pos" id="railQuestionPos">
                  Q {currentIdx + 1} / {questions.length}
                </span>
              </div>
              <div className="nav-rail-grid">
                <button
                  type="button"
                  className="nav-btn nav-btn-secondary"
                  id="prevBtn"
                  disabled={currentIdx <= 0}
                  onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                >
                  <CtIco name="i-arrow-left" className="ct-ico--xs" /> Previous
                </button>
                <button
                  type="button"
                  className="nav-btn nav-btn-primary"
                  id="nextBtn"
                  disabled={currentIdx >= questions.length - 1}
                  onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
                >
                  Next <CtIco name="i-arrow-right" className="ct-ico--xs" />
                </button>
              </div>
              <div className="nav-rail-hint">
                <span>
                  <kbd>←</kbd> <kbd>→</kbd> navigate
                </span>
                <span>·</span>
                <span>
                  <kbd>A</kbd>-<kbd>D</kbd> answer
                </span>
              </div>
            </div>

            <div className="palette-container">
              <div className="palette-title">
                <span>Question Navigator</span>
                <span className="palette-count-pill">
                  <span id="answeredCount">{answeredCount}</span> / {questions.length}
                </span>
              </div>
              <div className="palette-legend" aria-hidden="true">
                <span className="palette-legend-item">
                  <i className="palette-swatch palette-swatch--current" />
                  Current
                </span>
                <span className="palette-legend-item">
                  <i className="palette-swatch palette-swatch--answered" />
                  Answered
                </span>
                <span className="palette-legend-item">
                  <i className="palette-swatch palette-swatch--unanswered" />
                  Blank
                </span>
              </div>
              <div className="palette-buttons" id="questionPalette">
                {questions.map((q, idx) => {
                  const isCurr = idx === currentIdx;
                  const isAns = Boolean(answers[String(q.local_id)]);
                  if (activeSection !== "ALL" && q.section_name && q.section_name !== activeSection) {
                    return null;
                  }
                  return (
                    <button
                      key={q.local_id}
                      type="button"
                      className={`palette-btn ${isCurr ? "current" : isAns ? "answered" : "unanswered"}`}
                      onClick={() => setCurrentIdx(idx)}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              className="submit-btn"
              id="mainSubmitBtn"
              onClick={() => setSubmitConfirmOpen(true)}
            >
              <span>Submit Exam</span>
              <CtIco name="i-arrow-right" className="ct-ico--sm" />
            </button>
          </aside>
        </div>
      )}

      {/* Exact Offline Calculator */}
      {hasCalc && (
        <OfflineCalc
          mode={calcType === "scientific" || calcType === "advanced" ? "scientific" : "basic"}
          open={calcOpen}
          onClose={() => setCalcOpen(false)}
        />
      )}

      {/* Exact Offline Paused Overlay */}
      <div id="pausedOverlay" className={`paused-overlay${isPaused && !result ? " show" : ""}`}>
        <div className="paused-content ex-scene-card">
          <div className="ex-scene-emblem" aria-hidden="true">
            <span className="ex-emblem-ring ex-emblem-ring--1" />
            <span className="ex-emblem-ring ex-emblem-ring--2" />
            <div className="ex-emblem-core">
              <svg viewBox="0 0 24 24">
                <rect className="ex-pause-bar" x="7" y="5" width="3.5" height="14" rx="1.2" fill="currentColor" stroke="none" />
                <rect className="ex-pause-bar ex-pause-bar--2" x="13.5" y="5" width="3.5" height="14" rx="1.2" fill="currentColor" stroke="none" />
              </svg>
            </div>
          </div>
          <h2>Exam Paused</h2>
          <div className="ex-auto-bar" aria-hidden="true">
            <i />
          </div>
        </div>
      </div>

      {/* Exact Offline Submit Confirmation Modal */}
      <div id="beautifulSubmitModal" className={`submit-premium-modal${submitConfirmOpen ? " show" : ""}`}>
        <div className="submit-premium-content">
          <div className="submit-min-ring">
            <svg width="88" height="88" viewBox="0 0 70 70" aria-hidden="true">
              <circle className="ex-ring-track" cx="35" cy="35" r="30" fill="none" strokeWidth="5.5" />
              <circle
                id="submitProgressCircle"
                cx="35"
                cy="35"
                r="30"
                fill="none"
                stroke="var(--ex-ink)"
                strokeWidth="5.5"
                strokeDasharray="188.5"
                strokeDashoffset={ringOffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="ring-center">
              <div className="answered-num">{answeredCount}</div>
              <div className="total-num">/ {questions.length}</div>
            </div>
          </div>
          <div className="submit-min-copy">
            <h3>Submit Exam?</h3>
            <p>{unansweredCount === 0 ? "All questions answered" : `${unansweredCount} unanswered`}</p>
          </div>
          <div className="submit-premium-footer">
            <button type="button" className="btn-cancel" onClick={() => setSubmitConfirmOpen(false)}>
              Review
            </button>
            <button type="button" className="btn-submit" onClick={() => void submitExam(false)}>
              Submit
            </button>
          </div>
        </div>
      </div>

      {/* Exact Offline Submitting Loader Modal */}
      <div id="loadingModal" className={`loading-modal${submitting ? " show" : ""}`}>
        <div className="loading-content ex-scene-card">
          <div className="ex-scene-emblem" aria-hidden="true">
            <svg className="ex-lock-svg" viewBox="0 0 88 88">
              <circle className="ex-lock-track" cx="44" cy="44" r="40" />
              <circle className="ex-lock-arc" cx="44" cy="44" r="40" />
            </svg>
            <div className="ex-emblem-core ex-emblem-core--outline">
              <svg viewBox="0 0 24 24">
                <path d="M12 16V4m0 0-4 4m4-4 4 4" />
                <path d="M4 17v1.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V17" />
              </svg>
            </div>
          </div>
          <h3>Submitting...</h3>
          <div className="ex-auto-bar" aria-hidden="true">
            <i />
          </div>
        </div>
      </div>

      {/* Auto-End Overlays: Time Up / Max Warnings / Force Submit */}
      <div id="timeupModal" className={`modal-overlay${endReason === "time_up" ? " show" : ""}`}>
        <div className="modal-container ex-scene-card">
          <div className="ex-scene-emblem" aria-hidden="true">
            <svg className="ex-lock-svg" viewBox="0 0 88 88">
              <circle className="ex-lock-track" cx="44" cy="44" r="40" />
              <circle className="ex-lock-arc" cx="44" cy="44" r="40" />
            </svg>
            <div className="ex-emblem-core">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l2.5 1.8" />
                <path d="M9.5 2.5h5" />
              </svg>
            </div>
          </div>
          <div className="modal-title">Time&apos;s Up</div>
          <div className="ex-auto-bar" aria-hidden="true">
            <i />
          </div>
        </div>
      </div>

      <div id="maxWarningModal" className={`modal-overlay${endReason === "max_warnings" ? " show" : ""}`}>
        <div className="modal-container ex-scene-card">
          <div className="ex-scene-emblem" aria-hidden="true">
            <span className="ex-emblem-ring ex-emblem-ring--1" />
            <span className="ex-emblem-ring ex-emblem-ring--2" />
            <div className="ex-emblem-core">
              <svg viewBox="0 0 24 24">
                <path d="M12 3l8 3.6v5.2c0 5-3.4 8.6-8 10.2-4.6-1.6-8-5.2-8-10.2V6.6L12 3z" />
                <path d="M12 8.5v4.5" />
                <circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none" />
              </svg>
            </div>
          </div>
          <div className="modal-title">Warning Limit Reached</div>
          <div className="ex-auto-bar" aria-hidden="true">
            <i />
          </div>
        </div>
      </div>

      <div id="forceSubmitModal" className={`modal-overlay${endReason === "force_submit" ? " show" : ""}`}>
        <div className="modal-container ex-scene-card">
          <div className="ex-scene-emblem" aria-hidden="true">
            <span className="ex-emblem-ring ex-emblem-ring--1" />
            <div className="ex-emblem-core">
              <svg viewBox="0 0 24 24">
                <path className="ex-check-stroke" d="M5 12.5l4.2 4.2L19 7.5" />
              </svg>
            </div>
          </div>
          <div className="modal-title">Exam Submitted</div>
          <div className="ex-auto-bar" aria-hidden="true">
            <i />
          </div>
        </div>
      </div>

      {/* Exact Offline Monochrome Student Score Modal (#resultModal) */}
      <div id="resultModal" className={`modal-overlay${result ? " show" : ""}`}>
        <div
          className={`modal-container sc-modal-card${result && !result.results_released ? " is-withheld" : ""}`}
          id="resultCard"
          data-grade={resGrade[0] || "A"}
        >
          <p className="sc-min-exam">{attempt?.exam_name || "Examination"}</p>

          {result?.results_released ? (
            <>
              <div className="sc-min-hero">
                <div id="resultPercentageDisplay">{resPct}%</div>
                <div className="sc-scale__track" aria-hidden="true">
                  <div className="sc-scale__fill" style={{ width: `${resPct}%` }} />
                </div>
              </div>
              <div className="sc-min-pair">
                <div className="sc-min-cell">
                  <span>Score</span>
                  <strong>
                    {result.score} / {result.total}
                  </strong>
                </div>
                <div className="sc-min-cell">
                  <span>Grade</span>
                  <strong>{resGrade}</strong>
                </div>
              </div>
            </>
          ) : (
            <div className="sc-min-withheld" style={{ display: "flex" }}>
              <div className="ex-emblem-core" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="5" y="11" width="14" height="9" rx="2.5" />
                  <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
                </svg>
              </div>
              <h2>Score Withheld</h2>
            </div>
          )}

          <div className="ex-result-foot">
            <div style={{ display: "flex", gap: 8, width: "100%" }}>
              {result?.attempt_id && (
                <Link
                  href={`/result/${result.attempt_id}`}
                  className="ex-result-cta"
                  style={{ flex: 1, justifyContent: "center", background: "var(--ex-surface-2)", color: "var(--ex-ink)", border: "1px solid var(--ex-border-2)" }}
                >
                  <span>Full Slip</span>
                </Link>
              )}
              <Link href="/student" className="ex-result-cta" style={{ flex: 1, justifyContent: "center" }}>
                <span>Dashboard</span>
                <CtIco name="i-arrow-right" className="ct-ico--xs" />
              </Link>
            </div>
            <div className="ex-result-countdown">
              <span>
                {countdownPaused ? (
                  "Auto-return paused"
                ) : (
                  <>
                    Returning in <strong>{countdown}</strong>s
                  </>
                )}
              </span>
              <button
                type="button"
                className="ex-stay-btn"
                onClick={() => setCountdownPaused((v) => !v)}
              >
                {countdownPaused ? "Resume" : "Stay"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Full Reading Passage Modal */}
      {passageModal && (
        <div
          id="passageModal"
          className="passage-modal-overlay active"
          onClick={() => setPassageModal(null)}
        >
          <div className="passage-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="passage-modal-header">
              <h4 className="passage-modal-title">{passageModal.name}</h4>
              <button
                type="button"
                className="passage-modal-close"
                onClick={() => setPassageModal(null)}
                aria-label="Close Passage"
              >
                &times;
              </button>
            </div>
            <div className="passage-modal-body">
              <MathText text={passageModal.content} />
            </div>
            <div className="passage-modal-footer">
              <button
                type="button"
                className="ct-btn ct-btn--soft"
                onClick={() => setPassageModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
