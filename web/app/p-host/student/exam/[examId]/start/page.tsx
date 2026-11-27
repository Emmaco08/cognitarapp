"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CT_ICONS_URL, CtIco, CtThemeToggle } from "@/components/portal/CtIco";

interface ExamBrief {
  local_id: number;
  name: string;
  exam_class: string;
  duration: number;
  question_count: number;
  attempt_status: string;
}

export default function StudentExamStartPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Number(params?.examId || 0);

  const [schoolName, setSchoolName] = useState("CogniTara School");
  const [exam, setExam] = useState<ExamBrief | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

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
        if (json.school?.school_name) setSchoolName(json.school.school_name);
        const found = (json.available_exams || []).find((e: ExamBrief) => Number(e.local_id) === examId);
        if (!found) {
          setError("This examination is not currently available for your class.");
        } else if (found.attempt_status === "completed") {
          setError("You have already completed this examination.");
        } else {
          setExam(found);
        }
      })
      .catch(() => {
        if (alive) setError("Could not load examination briefing.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [examId, router]);

  return (
    <div className="st-body">
      <div className="st-grain" aria-hidden="true" />

      <div className="st-shell">
        <header className="st-nav">
          <Link className="st-brand" href="/student" aria-label="Back to Student Portal">
            <span className="st-brand__mark">
              <svg viewBox="0 0 200 200">
                <use href={`${CT_ICONS_URL}#ct-mark`} />
              </svg>
            </span>
            <span className="st-brand__name">CogniTara</span>
            <span className="st-brand__sep" aria-hidden="true" />
            <span className="st-brand__meta">{schoolName}</span>
          </Link>
          <div className="st-nav__right">
            <Link
              href="/student"
              className="st-btn st-btn--ghost"
              style={{ height: 36, padding: "0 12px", fontSize: 13 }}
            >
              <CtIco name="i-arrow-left" className="ct-ico--sm" />
              <span>Dashboard</span>
            </Link>
            <CtThemeToggle variant="st" />
          </div>
        </header>

        <main className="st-folio-stage">
          {loading ? (
            <section className="sc-min-card sc-min-card--compact">
              <h1 className="sc-min-card__title">Loading Exam</h1>
              <div className="sc-sweep-track" aria-hidden="true">
                <i />
              </div>
            </section>
          ) : (
            <section className="sc-min-card" aria-label="Exam start">
              <div className="sc-min-card__emblem" aria-hidden="true">
                <div className="sc-min-card__core">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 3l7.5 3.2v5.3c0 4.8-3.2 8.2-7.5 9.8-4.3-1.6-7.5-5-7.5-9.8V6.2L12 3z" />
                    <path d="M9 12.2l2.1 2.1L15.4 10" />
                  </svg>
                </div>
              </div>

              <h1 className="sc-min-card__title">{exam?.name || "Examination"}</h1>

              {exam && (
                <div className="sc-min-card__facts sc-min-card__facts--3">
                  <div className="sc-min-card__fact">
                    <span>Time</span>
                    <strong>{exam.duration} min</strong>
                  </div>
                  <div className="sc-min-card__fact">
                    <span>Class</span>
                    <strong>{exam.exam_class || "General"}</strong>
                  </div>
                  <div className="sc-min-card__fact">
                    <span>Questions</span>
                    <strong>{exam.question_count}</strong>
                  </div>
                </div>
              )}

              {error ? (
                <>
                  <span className="sc-min-card__pill sc-min-card__pill--muted" role="alert">
                    {error}
                  </span>
                  <div className="sc-min-card__stack">
                    <Link href="/student" className="st-btn st-btn--secondary st-btn--lg st-btn--block">
                      Back
                    </Link>
                  </div>
                </>
              ) : (
                <div className="sc-min-card__stack">
                  <button
                    type="button"
                    className="st-btn st-btn--primary st-btn--lg st-btn--block"
                    onClick={() => setModalOpen(true)}
                  >
                    <span>Begin Exam</span>
                    <CtIco name="i-arrow-right" className="ct-ico--sm st-arrow" />
                  </button>
                  <Link href="/student" className="st-btn st-btn--ghost st-btn--block">
                    Back
                  </Link>
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      {/* Exact Offline Minimalist Start Confirmation Modal */}
      {modalOpen && exam && (
        <div
          className="ct-modal-backdrop is-open"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="ct-modal ct-confirm-modal" data-tone="primary" style={{ maxWidth: 348 }}>
            <div
              className="ct-m-body"
              style={{
                padding: "30px 26px 20px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div className="sc-min-card__core" style={{ width: 54, height: 54 }} aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7.5V12l3 2" />
                </svg>
              </div>
              <h3 style={{ margin: 0, fontSize: 19, fontWeight: 740, letterSpacing: "-0.02em", color: "var(--st-ink)" }}>
                Start Exam?
              </h3>
              <p style={{ margin: "-6px 0 0", fontFamily: "var(--ct-mono)", fontSize: 12.5, color: "var(--st-ink-2)" }}>
                {exam.duration} min timer starts now
              </p>
            </div>
            <div
              className="ct-m-foot"
              style={{
                padding: "0 26px 24px",
                borderTop: 0,
                background: "transparent",
                display: "flex",
                gap: 10,
              }}
            >
              <button
                type="button"
                className="st-btn st-btn--secondary st-btn--lg"
                style={{ flex: 1 }}
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="st-btn st-btn--primary st-btn--lg"
                style={{ flex: 1 }}
                onClick={() => {
                  setModalOpen(false);
                  router.push(`/exam/${exam.local_id}`);
                }}
              >
                Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
