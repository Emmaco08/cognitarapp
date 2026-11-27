"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { MathText } from "@/components/portal/MathText";
import { ScientificCalculator } from "@/components/portal/ScientificCalculator";

interface ExamQuestion {
  index: number;
  local_id: number;
  section_name: string;
  passage: { name: string; content: string; instruction: string } | null;
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

const OPTION_LETTERS = ["A", "B", "C", "D"];

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

export default function OnlineExamRoomPage() {
  const params = useParams<{ examId: string }>();
  const router = useRouter();
  const examId = String(params?.examId || "");

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState("");
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remainingSec, setRemainingSec] = useState(0);
  const [warningsCount, setWarningsCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const [showCalc, setShowCalc] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncState, setSyncState] = useState<"saved" | "saving" | "local">("saved");
  const [warningFlash, setWarningFlash] = useState(false);
  const [finalResult, setFinalResult] = useState<GradedResult | null>(null);

  const answersRef = useRef<Record<string, string>>({});
  const warningsRef = useRef<number>(0);
  const dirtyRef = useRef<boolean>(false);
  const attemptIdRef = useRef<string>("");
  const deadlineMsRef = useRef<number>(0);
  const submittedRef = useRef<boolean>(false);

  const storageKey = (attId: string) => `ct_portal_attempt_${attId}`;

  const flushSync = useCallback(async (force = false, keepalive = false) => {
    const attId = attemptIdRef.current;
    if (!attId || submittedRef.current) return;
    if (!force && !dirtyRef.current) return;

    setSyncState("saving");
    try {
      const res = await fetch(`/api/v1/portal/student/attempts/${encodeURIComponent(attId)}/sync`, {
        method: "POST",
        credentials: "include",
        keepalive,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: answersRef.current,
          warnings_count: warningsRef.current,
        }),
      });
      if (keepalive) return;
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        dirtyRef.current = false;
        setSyncState("saved");
        if (data.submitted && data.result) {
          submittedRef.current = true;
          setFinalResult(data.result);
          try {
            localStorage.removeItem(storageKey(attId));
          } catch {}
          return;
        }
        if (typeof data.is_paused === "boolean") {
          setIsPaused(data.is_paused);
        }
        if (typeof data.remaining_seconds === "number") {
          setRemainingSec(data.remaining_seconds);
          if (!data.is_paused) {
            deadlineMsRef.current = Date.now() + data.remaining_seconds * 1000;
          }
        }
      } else {
        setSyncState("local");
      }
    } catch {
      setSyncState("local");
    }
  }, []);

  const submitExam = useCallback(async (autoSubmitted = false) => {
    const attId = attemptIdRef.current;
    if (!attId || submittedRef.current) return;
    setSubmitting(true);
    setShowSubmitModal(false);
    try {
      const res = await fetch(`/api/v1/portal/student/attempts/${encodeURIComponent(attId)}/submit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: answersRef.current,
          warnings_count: warningsRef.current,
          auto_submitted: autoSubmitted,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.result) {
        submittedRef.current = true;
        setFinalResult(data.result);
        try {
          localStorage.removeItem(storageKey(attId));
        } catch {}
      } else {
        setSubmitting(false);
      }
    } catch {
      setSubmitting(false);
    }
  }, []);

  // Start or resume exam in ONE single API call
  useEffect(() => {
    if (!examId) return;
    fetch(`/api/v1/portal/student/exams/${encodeURIComponent(examId)}/start`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          router.replace("/");
          return;
        }
        if (!res.ok || !data.ok) {
          setLoadErr(data.message || "Could not start this examination.");
          return;
        }
        if (data.already_submitted && data.result) {
          submittedRef.current = true;
          setFinalResult(data.result);
          return;
        }
        const att: ExamAttempt = data.attempt;
        const qs: ExamQuestion[] = Array.isArray(data.questions) ? data.questions : [];
        // Merge any unsent localStorage answers safely over server snapshot
        let merged = { ...(att.answers || {}) };
        try {
          const rawLocal = localStorage.getItem(storageKey(att.id));
          if (rawLocal) {
            const parsed = JSON.parse(rawLocal) as Record<string, string>;
            if (parsed && typeof parsed === "object") {
              merged = { ...merged, ...parsed };
            }
          }
        } catch {}

        attemptIdRef.current = att.id;
        answersRef.current = merged;
        warningsRef.current = att.warnings_count || 0;
        deadlineMsRef.current = Date.now() + Math.max(0, att.remaining_seconds) * 1000;

        setAttempt(att);
        setQuestions(qs);
        setAnswers(merged);
        setRemainingSec(att.remaining_seconds);
        setWarningsCount(att.warnings_count || 0);
        setIsPaused(Boolean(att.is_paused));
      })
      .catch(() => setLoadErr("Network error while loading exam."))
      .finally(() => setLoading(false));
  }, [examId, router]);

  // Pure client-side 1s countdown clock (zero server requests!)
  useEffect(() => {
    if (!attempt || isPaused || finalResult) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.floor((deadlineMsRef.current - Date.now()) / 1000));
      setRemainingSec(left);
      if (left <= 0 && !submittedRef.current) {
        void submitExam(true);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [attempt, isPaused, finalResult, submitExam]);

  // Low-frequency 45s batched sync ONLY when dirty (Free Vercel Hobby optimized!)
  useEffect(() => {
    if (!attempt || finalResult) return;
    const t = setInterval(() => {
      if (dirtyRef.current && !submittedRef.current) {
        void flushSync(false, false);
      }
    }, 45_000);
    return () => clearInterval(t);
  }, [attempt, finalResult, flushSync]);

  // Anti-cheat tab switch detection + reliable pagehide flush
  useEffect(() => {
    if (!attempt || finalResult) return;
    const onVis = () => {
      if (document.hidden && !submittedRef.current && !isPaused) {
        const nextW = warningsRef.current + 1;
        warningsRef.current = nextW;
        dirtyRef.current = true;
        setWarningsCount(nextW);
        setWarningFlash(true);
        setTimeout(() => setWarningFlash(false), 2600);
        void flushSync(true, false);
      }
    };
    const onHide = () => {
      if (dirtyRef.current && !submittedRef.current) {
        void flushSync(true, true);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, [attempt, isPaused, finalResult, flushSync]);

  // Select option (instant local save)
  const selectAnswer = useCallback((qLocalId: number, optionText: string) => {
    if (isPaused || submittedRef.current) return;
    const key = String(qLocalId);
    const next = { ...answersRef.current, [key]: optionText };
    answersRef.current = next;
    dirtyRef.current = true;
    setAnswers(next);
    setSyncState("local");
    try {
      localStorage.setItem(storageKey(attemptIdRef.current), JSON.stringify(next));
    } catch {}
  }, [isPaused]);

  // Keyboard shortcuts (A-D, ArrowLeft, ArrowRight)
  useEffect(() => {
    if (!attempt || isPaused || finalResult || showSubmitModal) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "ArrowRight") {
        setCurrentIdx((i) => Math.min(questions.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        setCurrentIdx((i) => Math.max(0, i - 1));
      } else {
        const idx = OPTION_LETTERS.indexOf(e.key.toUpperCase());
        const q = questions[currentIdx];
        if (idx >= 0 && q && q.options[idx] !== undefined) {
          selectAnswer(q.local_id, q.options[idx]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attempt, isPaused, finalResult, showSubmitModal, questions, currentIdx, selectAnswer]);

  if (loading) {
    return (
      <div className="pt-gateway-page">
        <div className="pt-modal">
          <h2>Loading Exam...</h2>
        </div>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="pt-gateway-page">
        <div className="pt-modal">
          <div className="pt-alert pt-alert--dark" style={{ marginBottom: 16 }}>
            {loadErr}
          </div>
          <Link href="/student" className="pt-btn pt-btn--primary pt-btn--lg">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Minimalist Final Score / Submitted Screen (zero repetitive copy!)
  if (finalResult) {
    return (
      <div className="pt-gateway-page">
        <div className="pt-modal">
          <div className="pt-modal-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          {finalResult.results_released && finalResult.score !== null && finalResult.total !== null ? (
            <>
              <div className="pt-score-big">
                {finalResult.score}/{finalResult.total}
              </div>
              <div className="pt-score-sub">
                {finalResult.percentage}%{finalResult.grade_label ? ` · ${finalResult.grade_label}` : ""}
              </div>
            </>
          ) : (
            <h2 style={{ marginBottom: 20 }}>Exam Submitted</h2>
          )}
          <Link href="/student" className="pt-btn pt-btn--primary pt-btn--lg">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIdx];
  const answeredCount = questions.filter((q) => Boolean(answers[String(q.local_id)])).length;
  const unansweredCount = Math.max(0, questions.length - answeredCount);
  const calcAllowed = attempt && (attempt.calculator_type === "basic" || attempt.calculator_type === "scientific");

  return (
    <div className="pt-exam-shell">
      {/* Compact Sticky Exam Topbar */}
      <header className="pt-exam-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <strong style={{ fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {attempt?.exam_name}
          </strong>
          <span className="pt-pill pt-pill--muted">
            {answeredCount}/{questions.length}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className={`pt-exam-timer ${remainingSec <= 300 ? "is-low" : ""}`} aria-live="off">
            {fmtClock(remainingSec)}
          </span>

          {warningsCount > 0 ? (
            <span className={`pt-pill ${warningFlash ? "pt-pill--dark" : ""}`}>
              Warnings {warningsCount}/{attempt?.max_warnings || 5}
            </span>
          ) : null}

          {calcAllowed ? (
            <button
              type="button"
              className={`pt-btn pt-btn--sm ${showCalc ? "pt-btn--primary" : ""}`}
              onClick={() => setShowCalc((v) => !v)}
            >
              Calculator
            </button>
          ) : null}

          <button
            type="button"
            className="pt-btn pt-btn--sm"
            onClick={() => void flushSync(true, false)}
            title="Sync answers now"
          >
            {syncState === "saving" ? "Saving..." : syncState === "local" ? "Save" : "Saved"}
          </button>

          <button
            type="button"
            className="pt-btn pt-btn--primary pt-btn--sm"
            disabled={submitting}
            onClick={() => setShowSubmitModal(true)}
          >
            Submit
          </button>
        </div>
      </header>

      {/* Main 2-Column Room: Question Left | Right-Rail (Prev/Next ABOVE Palette) */}
      <main id="main-content" className="pt-exam-grid-room">
        {currentQ ? (
          <section className="pt-question-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span className="pt-pill pt-pill--dark">
                Question {currentIdx + 1} of {questions.length}
              </span>
              {currentQ.section_name ? (
                <span className="pt-pill">{currentQ.section_name}</span>
              ) : null}
            </div>

            {currentQ.passage && (currentQ.passage.content || currentQ.passage.instruction) ? (
              <div className="pt-passage-box" style={{ marginTop: 14 }}>
                {currentQ.passage.name ? (
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{currentQ.passage.name}</div>
                ) : null}
                {currentQ.passage.instruction ? (
                  <div style={{ fontSize: 12.5, color: "var(--pt-ink-2)", marginBottom: 6 }}>
                    {currentQ.passage.instruction}
                  </div>
                ) : null}
                {currentQ.passage.content ? <MathText text={currentQ.passage.content} /> : null}
              </div>
            ) : null}

            <div className="pt-question-body">
              <MathText text={currentQ.question} />
            </div>

            <div className="pt-options-list" role="radiogroup" aria-label={`Options for Question ${currentIdx + 1}`}>
              {currentQ.options.map((opt, oIdx) => {
                const selected = answers[String(currentQ.local_id)] === opt;
                return (
                  <button
                    key={oIdx}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`pt-option-btn ${selected ? "is-selected" : ""}`}
                    onClick={() => selectAnswer(currentQ.local_id, opt)}
                  >
                    <span className="pt-option-letter">{OPTION_LETTERS[oIdx] || String(oIdx + 1)}</span>
                    <span style={{ flex: 1 }}>
                      <MathText text={opt} />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Right-hand Navigation Rail: Prev/Next ABOVE Question Palette */}
        <aside className="pt-rail" aria-label="Question Navigation">
          <div className="pt-rail-nav">
            <button
              type="button"
              className="pt-btn"
              disabled={currentIdx <= 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="pt-btn pt-btn--primary"
              disabled={currentIdx >= questions.length - 1}
              onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
            >
              Next
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, color: "var(--pt-ink-2)" }}>
            <span>Questions</span>
            <strong style={{ color: "var(--pt-ink)" }}>
              {answeredCount} / {questions.length}
            </strong>
          </div>

          <div className="pt-palette-grid">
            {questions.map((q, idx) => {
              const isAns = Boolean(answers[String(q.local_id)]);
              const isCur = idx === currentIdx;
              return (
                <button
                  key={q.local_id}
                  type="button"
                  className={`pt-pal-btn ${isAns ? "is-answered" : ""} ${isCur ? "is-current" : ""}`}
                  onClick={() => setCurrentIdx(idx)}
                  aria-label={`Question ${idx + 1}${isAns ? ", answered" : ""}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </aside>
      </main>

      {/* Calculator Widget */}
      {showCalc && calcAllowed ? (
        <ScientificCalculator
          mode={attempt.calculator_type === "scientific" ? "scientific" : "basic"}
          onClose={() => setShowCalc(false)}
        />
      ) : null}

      {/* Minimalist Exam Paused Overlay (icon + "Exam Paused" only) */}
      {isPaused ? (
        <div className="pt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Exam Paused">
          <div className="pt-modal">
            <div className="pt-modal-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            </div>
            <h2 style={{ marginBottom: 18 }}>Exam Paused</h2>
            <button
              type="button"
              className="pt-btn pt-btn--primary pt-btn--lg"
              onClick={() => void flushSync(true, false)}
            >
              Check Status
            </button>
          </div>
        </div>
      ) : null}

      {/* Minimalist Submit Confirmation Modal */}
      {showSubmitModal ? (
        <div className="pt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Submit Exam">
          <div className="pt-modal">
            <div className="pt-modal-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2>Submit Exam?</h2>
            <div style={{ fontSize: 14, color: "var(--pt-ink-2)", marginBottom: 20 }}>
              {unansweredCount > 0 ? `${unansweredCount} unanswered` : `${answeredCount}/${questions.length} answered`}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button type="button" className="pt-btn" onClick={() => setShowSubmitModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="pt-btn pt-btn--primary"
                disabled={submitting}
                onClick={() => void submitExam(false)}
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Minimalist Submitting Loader */}
      {submitting && !finalResult ? (
        <div className="pt-modal-backdrop" role="status" aria-live="polite">
          <div className="pt-modal">
            <h2 style={{ margin: 0 }}>Submitting...</h2>
          </div>
        </div>
      ) : null}
    </div>
  );
}
