"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CogniTaraMark } from "@/components/CogniTaraLogo";
import { MathText } from "@/components/portal/MathText";
import { ScientificCalculator } from "@/components/portal/ScientificCalculator";
import {
  getMonogram,
  PIconArrowLeft,
  PIconArrowRight,
  PIconCalculator,
  PIconCheck,
  PIconCloud,
  PIconPause,
  PortalThemeToggle,
} from "@/components/portal/PortalIcons";

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
  const [studentInfo, setStudentInfo] = useState<{ full_name: string; student_class: string } | null>(null);
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
        if (typeof data.is_paused === "boolean") setIsPaused(data.is_paused);
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
        if (data.student) {
          setStudentInfo({
            full_name: String(data.student.full_name || ""),
            student_class: String(data.student.student_class || ""),
          });
        }
        if (data.already_submitted && data.result) {
          submittedRef.current = true;
          setFinalResult(data.result);
          return;
        }
        const att: ExamAttempt = data.attempt;
        const qs: ExamQuestion[] = Array.isArray(data.questions) ? data.questions : [];
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

  useEffect(() => {
    if (!attempt || finalResult) return;
    const t = setInterval(() => {
      if (dirtyRef.current && !submittedRef.current) {
        void flushSync(false, false);
      }
    }, 45_000);
    return () => clearInterval(t);
  }, [attempt, finalResult, flushSync]);

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

  const selectAnswer = useCallback(
    (qLocalId: number, optionText: string) => {
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
    },
    [isPaused]
  );

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
      <div className="pt-modal-backdrop" style={{ background: "var(--pt-canvas)" }}>
        <div className="pt-modal">
          <h2>Loading exam...</h2>
        </div>
      </div>
    );
  }

  if (loadErr) {
    return (
      <div className="pt-modal-backdrop" style={{ background: "var(--pt-canvas)" }}>
        <div className="pt-modal">
          <div className="pt-alert pt-alert--dark" style={{ marginBottom: 16 }}>
            {loadErr}
          </div>
          <Link href="/student" className="pt-btn pt-btn--primary pt-btn--lg">
            Back to Student Portal
          </Link>
        </div>
      </div>
    );
  }

  if (finalResult) {
    return (
      <div className="pt-modal-backdrop" style={{ background: "var(--pt-canvas)" }}>
        <div className="pt-modal">
          <div className="pt-modal-icon">
            <PIconCheck size={22} />
          </div>
          {finalResult.results_released && finalResult.score !== null && finalResult.total !== null ? (
            <>
              <div className="pt-score-big">
                {finalResult.score} / {finalResult.total}
              </div>
              <div className="pt-score-sub">
                {finalResult.percentage}%{finalResult.grade_label ? ` · ${finalResult.grade_label}` : ""}
              </div>
            </>
          ) : (
            <h2 style={{ marginBottom: 20 }}>Exam Submitted</h2>
          )}
          <Link href="/student" className="pt-btn pt-btn--primary pt-btn--lg">
            Back to Student Portal
          </Link>
        </div>
      </div>
    );
  }

  if (!attempt || questions.length === 0) {
    return (
      <div className="pt-modal-backdrop" style={{ background: "var(--pt-canvas)" }}>
        <div className="pt-modal">
          <h2>No questions available</h2>
          <Link href="/student" className="pt-btn pt-btn--primary pt-btn--lg" style={{ marginTop: 14 }}>
            Back to Student Portal
          </Link>
        </div>
      </div>
    );
  }

  const q = questions[currentIdx] || questions[0];
  const answeredCount = questions.filter((item) => {
    const v = answers[String(item.local_id)];
    return v !== undefined && String(v).trim() !== "";
  }).length;
  const unansweredCount = questions.length - answeredCount;
  const pctDone = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;
  const calcAllowed = attempt.calculator_type === "basic" || attempt.calculator_type === "scientific";
  const selectedVal = answers[String(q.local_id)] || "";

  return (
    <div className="pt-exam-shell">
      {/* Top Exam Header (Matches Offline exam_page_new.html) */}
      <header className="pt-exam-header">
        <div className="pt-exam-header__left">
          <CogniTaraMark size={22} />
          <span className="pt-exam-header__title">{attempt.exam_name}</span>
        </div>

        <div className="pt-exam-header__right">
          <PortalThemeToggle />

          {calcAllowed ? (
            <button
              type="button"
              className={`pt-btn pt-btn--sm ${showCalc ? "pt-btn--primary" : ""}`}
              onClick={() => setShowCalc((v) => !v)}
            >
              <PIconCalculator size={14} />
              <span>Calculator</span>
            </button>
          ) : null}

          {studentInfo?.full_name ? (
            <div className="pt-hide-sm" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span className="pt-crest pt-crest--solid pt-crest--xs">
                {getMonogram(studentInfo.full_name, "ST")}
              </span>
              <span style={{ fontWeight: 500 }}>{studentInfo.full_name}</span>
              {studentInfo.student_class ? (
                <span style={{ color: "var(--pt-ink-3)" }}>· {studentInfo.student_class}</span>
              ) : null}
            </div>
          ) : null}

          <div className={`pt-exam-timer ${remainingSec <= 120 ? "is-low" : ""}`} aria-live="off">
            <span className="pt-exam-timer__lbl pt-hide-sm">Time left</span>
            <span className="pt-exam-timer__val">{fmtClock(remainingSec)}</span>
          </div>
        </div>
      </header>

      {/* Section + Progress Sub-bar */}
      <div className="pt-exam-subbar">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="pt-tag pt-tag--solid">
            {q.section_name || "Section 1"} · {answeredCount}/{questions.length}
          </span>
          {warningFlash ? (
            <span className="pt-tag">
              Focus warning recorded ({warningsCount}/{attempt.max_warnings})
            </span>
          ) : null}
        </div>
        <div className="pt-exam-progress">
          <span className="pt-exam-progress__track">
            <i style={{ width: `${pctDone}%` }} />
          </span>
          <span>
            {answeredCount}/{questions.length}
          </span>
        </div>
      </div>

      {/* Main Split Exam Workspace */}
      <main id="main-content" className="pt-exam-grid-room">
        <section className="pt-question-card" aria-label="Current question">
          <div>
            <span className="pt-tag">
              Question {currentIdx + 1} of {questions.length}
            </span>
          </div>

          {q.passage ? (
            <div className="pt-passage-box" style={{ marginTop: 16 }}>
              {q.passage.name ? (
                <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 4 }}>{q.passage.name}</div>
              ) : null}
              {q.passage.instruction ? (
                <div style={{ fontSize: 12.5, color: "var(--pt-ink-2)", marginBottom: 8 }}>
                  {q.passage.instruction}
                </div>
              ) : null}
              <MathText text={q.passage.content} />
            </div>
          ) : null}

          <div className="pt-question-body">
            <MathText text={q.question} />
          </div>

          <div className="pt-options-list" role="radiogroup" aria-label="Answer choices">
            {q.options.map((opt, oi) => {
              const letter = OPTION_LETTERS[oi] || String(oi + 1);
              const isSelected = selectedVal === opt;
              return (
                <button
                  key={`${q.local_id}-${oi}`}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`pt-option-btn ${isSelected ? "is-selected" : ""}`}
                  onClick={() => selectAnswer(q.local_id, opt)}
                >
                  <span className="pt-option-letter">{letter}</span>
                  <span style={{ flex: 1 }}>
                    <MathText text={opt} />
                  </span>
                  <span className="pt-option-radio" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>

        {/* Right-Hand Rail: Question Controls ABOVE Question Navigator + Submit Exam */}
        <aside className="pt-right-rail" aria-label="Question navigation">
          <div className="pt-rail-card">
            <div className="pt-rail-head">
              <strong>Question controls</strong>
              <span className="pt-mono" style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
                Q {currentIdx + 1} / {questions.length}
              </span>
            </div>
            <div className="pt-rail-nav">
              <button
                type="button"
                className="pt-btn"
                disabled={currentIdx <= 0}
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              >
                <PIconArrowLeft size={14} />
                <span>Previous</span>
              </button>
              <button
                type="button"
                className="pt-btn pt-btn--primary"
                disabled={currentIdx >= questions.length - 1}
                onClick={() => setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))}
              >
                <span>Next</span>
                <PIconArrowRight size={14} />
              </button>
            </div>
            <div className="pt-rail-hints">
              <kbd className="pt-kbd">←</kbd>
              <kbd className="pt-kbd">→</kbd>
              <span>navigate</span>
              <span>·</span>
              <kbd className="pt-kbd">A</kbd>
              <span>-</span>
              <kbd className="pt-kbd">D</kbd>
              <span>answer</span>
            </div>
          </div>

          <div className="pt-rail-card">
            <div className="pt-rail-head">
              <strong>Question Navigator</strong>
              <span className="pt-mono" style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
                {answeredCount} / {questions.length}
              </span>
            </div>
            <div className="pt-pal-legend">
              <span>
                <i className="pt-pal-swatch pt-pal-swatch--cur" />
                Current
              </span>
              <span>
                <i className="pt-pal-swatch pt-pal-swatch--ans" />
                Answered
              </span>
              <span>
                <i className="pt-pal-swatch" />
                Blank
              </span>
            </div>
            <div className="pt-palette-grid">
              {questions.map((item, idx) => {
                const isAns = Boolean(answers[String(item.local_id)]?.trim());
                const isCur = idx === currentIdx;
                return (
                  <button
                    key={item.local_id}
                    type="button"
                    className={`pt-pal-btn ${isCur ? "is-current" : isAns ? "is-answered" : ""}`}
                    onClick={() => setCurrentIdx(idx)}
                    aria-label={`Question ${idx + 1}${isAns ? ", answered" : ""}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            className="pt-btn pt-btn--lg"
            style={{ borderColor: "var(--pt-ink)" }}
            disabled={submitting}
            onClick={() => setShowSubmitModal(true)}
          >
            <span>Submit Exam</span>
            <PIconArrowRight size={15} />
          </button>
        </aside>
      </main>

      {/* Bottom Integrity & Sync Footer Bar (Matches Offline exam_page_new.html) */}
      <footer className="pt-exam-footer">
        <span>
          {warningsCount === 0
            ? `Clean Record: 0 / ${attempt.max_warnings}`
            : `Warnings: ${warningsCount} / ${attempt.max_warnings}`}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <PIconCloud size={13} />
          <span>{syncState === "saving" ? "Saving..." : syncState === "local" ? "Saved locally" : "Ready"}</span>
        </span>
      </footer>

      {showCalc && calcAllowed ? (
        <ScientificCalculator
          mode={attempt.calculator_type === "scientific" ? "scientific" : "basic"}
          onClose={() => setShowCalc(false)}
        />
      ) : null}

      {isPaused ? (
        <div className="pt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Exam Paused">
          <div className="pt-modal">
            <div className="pt-modal-icon">
              <PIconPause size={20} />
            </div>
            <h2>Exam Paused</h2>
            <button
              type="button"
              className="pt-btn pt-btn--primary pt-btn--lg"
              style={{ marginTop: 18 }}
              onClick={() => void flushSync(true, false)}
            >
              Check Status
            </button>
          </div>
        </div>
      ) : null}

      {showSubmitModal ? (
        <div className="pt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Submit Exam">
          <div className="pt-modal">
            <div className="pt-modal-icon">
              <PIconCheck size={20} />
            </div>
            <h2>Submit Exam</h2>
            <div className="pt-mono" style={{ fontSize: 13.5, color: "var(--pt-ink-2)", marginBottom: 20 }}>
              {answeredCount} of {questions.length} answered
              {unansweredCount > 0 ? ` · ${unansweredCount} unanswered` : ""}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button type="button" className="pt-btn" onClick={() => setShowSubmitModal(false)}>
                Review
              </button>
              <button
                type="button"
                className="pt-btn pt-btn--primary"
                disabled={submitting}
                onClick={() => void submitExam(false)}
              >
                {submitting ? "Submitting..." : "Submit Now"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
