"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CT_ICONS_URL, CtIco, CtThemeToggle } from "@/components/portal/CtIco";

interface ScoreReportData {
  school: {
    school_name: string;
    current_term: string;
    academic_session: string;
  };
  result: {
    attempt_id: string;
    exam_name: string;
    results_released: boolean;
    score: number | null;
    total: number | null;
    percentage: number | null;
    grade_label: string | null;
    grade_remark: string | null;
  };
}

export default function StudentResultSlipPage() {
  const params = useParams();
  const router = useRouter();
  const attemptId = String(params?.attemptId || "");

  const [data, setData] = useState<ScoreReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [timeLeft, setTimeLeft] = useState(12);
  const [paused, setPaused] = useState(false);
  const [barReady, setBarReady] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/v1/portal/student/results/${encodeURIComponent(attemptId)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          router.replace("/");
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (!alive || !json) return;
        if (!json.ok) setErr(json.message || "Result record not found.");
        else {
          setData(json);
          requestAnimationFrame(() => requestAnimationFrame(() => setBarReady(true)));
        }
      })
      .catch(() => {
        if (alive) setErr("Could not load score report.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [attemptId, router]);

  useEffect(() => {
    if (!data || paused) return;
    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          router.push("/student");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [data, paused, router]);

  const pct = data?.result.results_released ? Math.round(Number(data.result.percentage || 0)) : 0;
  const grade =
    data?.result.grade_label ||
    (pct >= 85 ? "A" : pct >= 70 ? "B" : pct >= 60 ? "C" : pct >= 50 ? "D" : "F");

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
            <span className="st-brand__meta">{data?.school.school_name || "CogniTara School"}</span>
          </Link>

          <div className="st-nav__right">
            {data && (
              <div className="st-countdown-pill" id="countdownPill">
                <CtIco name="i-clock" className="ct-ico--xs" />
                <span>
                  {paused ? (
                    "Auto-return paused"
                  ) : (
                    <>
                      Returning in <strong>{timeLeft}</strong>s
                    </>
                  )}
                </span>
                <button type="button" onClick={() => setPaused((v) => !v)}>
                  {paused ? "Resume" : "Stay"}
                </button>
              </div>
            )}
            <CtThemeToggle variant="st" />
          </div>
        </header>

        <main className="st-folio-stage">
          {loading ? (
            <section className="sc-min-card sc-min-card--compact">
              <h1 className="sc-min-card__title">Loading Score Slip</h1>
              <div className="sc-sweep-track" aria-hidden="true">
                <i />
              </div>
            </section>
          ) : err || !data ? (
            <section className="sc-min-card sc-min-card--compact">
              <h1 className="sc-min-card__title">Score Unavailable</h1>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--st-ink-2)" }}>{err}</p>
              <div className="sc-min-card__stack">
                <Link href="/student" className="st-btn st-btn--primary st-btn--lg st-btn--block">
                  Dashboard
                </Link>
              </div>
            </section>
          ) : !data.result.results_released ? (
            <section className="sc-min-card sc-min-card--compact" aria-label="Score withheld">
              <p className="sc-min-card__label">{data.result.exam_name}</p>
              <div className="sc-min-card__emblem" aria-hidden="true">
                <div className="sc-min-card__core">
                  <svg viewBox="0 0 24 24">
                    <rect x="5" y="11" width="14" height="9" rx="2.5" />
                    <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
                  </svg>
                </div>
              </div>
              <h1 className="sc-min-card__title">Score Withheld</h1>
              <div className="sc-min-card__stack">
                <Link href="/student" className="st-btn st-btn--primary st-btn--lg st-btn--block">
                  <span>Dashboard</span>
                  <CtIco name="i-arrow-right" className="ct-ico--sm st-arrow" />
                </Link>
              </div>
            </section>
          ) : (
            <section className="sc-min-card" aria-label="Exam score">
              <p className="sc-min-card__label">{data.result.exam_name}</p>

              <strong className="sc-min-card__pct">{pct}%</strong>

              <div className="sc-min-card__bar" aria-hidden="true">
                <div
                  className="sc-min-card__fill"
                  style={{ transform: `scaleX(${barReady ? (pct / 100).toFixed(4) : 0})` }}
                />
              </div>

              <div className="sc-min-card__facts">
                <div className="sc-min-card__fact">
                  <span>Score</span>
                  <strong>
                    {data.result.score} / {data.result.total}
                  </strong>
                </div>
                <div className="sc-min-card__fact">
                  <span>Grade</span>
                  <strong>{grade}</strong>
                </div>
              </div>

              <div className="sc-min-card__actions">
                <button
                  type="button"
                  className="st-btn st-btn--secondary st-btn--lg"
                  onClick={() => window.print()}
                >
                  Print
                </button>
                <Link href="/student" className="st-btn st-btn--primary st-btn--lg">
                  <span>Dashboard</span>
                  <CtIco name="i-arrow-right" className="ct-ico--sm st-arrow" />
                </Link>
              </div>
            </section>
          )}
        </main>

        <footer className="st-foot">
          <span>{data?.school.school_name || "CogniTara School"} · Official Examination Record</span>
          <span className="st-mono" style={{ fontSize: 11, letterSpacing: "0.06em" }}>
            VERIFIED ONLINE PORTAL
          </span>
        </footer>
      </div>
    </div>
  );
}
