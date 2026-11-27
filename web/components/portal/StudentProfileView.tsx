"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CtIco } from "./CtIco";
import { MathText } from "./MathText";
import { MonochromeLineChart } from "./OfflineCharts";

export function StudentProfileView({
  studentId,
  backHref,
  backLabel,
}: {
  studentId: number;
  backHref: string;
  backLabel: string;
}) {
  const [data, setData] = useState<any>(null);
  const [selectedExamId, setSelectedExamId] = useState<number>(0);
  const [scriptDetail, setScriptDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingScript, setLoadingScript] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/v1/portal/analytics?scope=student&studentId=${studentId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (alive && json.ok) setData(json);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [studentId]);

  const loadScript = async (examLocalId: number) => {
    setSelectedExamId(examLocalId);
    setLoadingScript(true);
    try {
      const res = await fetch(
        `/api/v1/portal/analytics?scope=student&studentId=${studentId}&examId=${examLocalId}`,
        { credentials: "include" }
      );
      const json = await res.json();
      if (json.ok) setScriptDetail(json.script_detail || null);
    } finally {
      setLoadingScript(false);
    }
  };

  if (loading) {
    return (
      <div className="tc-card" style={{ padding: 36, textAlign: "center", color: "var(--ct-ink-3)" }}>
        Loading student profile...
      </div>
    );
  }
  if (!data?.student) {
    return (
      <section className="tc-card">
        <div className="tc-empty">
          <strong>Student record not found</strong>
          <Link href={backHref} className="tc-btn tc-btn--secondary" style={{ marginTop: 10 }}>
            {backLabel}
          </Link>
        </div>
      </section>
    );
  }

  const st = data.student;
  const k = data.kpis || {};
  const history = data.history || [];
  const delta = Math.round((Number(k.overall_avg || 0) - Number(k.class_avg || 0)) * 10) / 10;

  return (
    <>
      <header className="tc-head">
        <div className="tc-head__txt">
          <span className="tc-eyebrow">
            Student Academic Profile · {st.student_class || "General"}
            {st.specialisation ? ` · ${st.specialisation}` : ""}
          </span>
          <h1>{st.full_name || st.username}</h1>
          <p>
            @{st.username}
            {st.email ? ` · ${st.email}` : ""} · Status: {st.status}
          </p>
        </div>
        <div className="tc-head__actions">
          <button type="button" className="tc-btn tc-btn--secondary" onClick={() => window.print()}>
            <CtIco name="i-print" className="ct-ico--sm" />
            Print Profile
          </button>
          <Link href={backHref} className="tc-btn tc-btn--secondary">
            <CtIco name="i-arrow-left" className="ct-ico--sm" />
            {backLabel}
          </Link>
        </div>
      </header>

      <section className="tc-kpi-strip">
        <div className="tc-kpi">
          <span className="tc-kpi__label">Overall Average</span>
          <strong className="tc-kpi__val">{k.overall_avg || 0}%</strong>
          <span className="tc-kpi__meta">
            Class mean: {k.class_avg || 0}% ({delta >= 0 ? `+${delta}%` : `${delta}%`})
          </span>
        </div>
        <div className="tc-kpi">
          <span className="tc-kpi__label">Exams Taken</span>
          <strong className="tc-kpi__val">{k.exams_taken || 0}</strong>
          <span className="tc-kpi__meta">Completed papers</span>
        </div>
        <div className="tc-kpi">
          <span className="tc-kpi__label">Best Score</span>
          <strong className="tc-kpi__val">{k.best_score || 0}%</strong>
          <span className="tc-kpi__meta">Highest accuracy</span>
        </div>
        <div className="tc-kpi">
          <span className="tc-kpi__label">Lowest Score</span>
          <strong className="tc-kpi__val">{k.lowest_score || 0}%</strong>
          <span className="tc-kpi__meta">Area for support</span>
        </div>
      </section>

      {history.length > 0 && (
        <section className="tc-card" style={{ marginBottom: 20 }}>
          <div className="tc-card__head">
            <div className="tc-card__title">
              <h2>Score Progression Trend</h2>
              <p>Chronological accuracy across completed papers</p>
            </div>
          </div>
          <div className="tc-card__body">
            <MonochromeLineChart
              points={[...history].reverse().map((h: any) => ({
                label: h.exam_name,
                value: Math.round(Number(h.percentage || 0)),
              }))}
            />
          </div>
        </section>
      )}

      <section className="tc-card" style={{ marginBottom: 20 }}>
        <div className="tc-card__head">
          <div className="tc-card__title">
            <h2>Examination History</h2>
            <p>Select any completed paper to inspect the question-by-question answer script</p>
          </div>
        </div>
        {history.length === 0 ? (
          <div className="tc-empty">
            <strong>No completed exams recorded</strong>
            <p>Submitted examination scripts will appear here automatically.</p>
          </div>
        ) : (
          <div className="tc-table-wrap">
            <table className="tc-table td-table">
              <thead>
                <tr>
                  <th>Examination</th>
                  <th>Subject</th>
                  <th className="is-center">Score</th>
                  <th className="is-center">Percentage</th>
                  <th className="is-center">Grade</th>
                  <th style={{ textAlign: "right" }}>Script Review</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h: any) => (
                  <tr key={h.id}>
                    <td>
                      <strong style={{ fontWeight: 640 }}>{h.exam_name}</strong>
                    </td>
                    <td>
                      <span className="tc-pill">{h.subject_tag || "General"}</span>
                    </td>
                    <td className="tc-mono is-center">
                      {h.score} / {h.total}
                    </td>
                    <td className="tc-mono is-center" style={{ fontWeight: 650 }}>
                      {Math.round(Number(h.percentage || 0))}%
                    </td>
                    <td className="is-center">
                      <span className="tc-pill">{h.grade_label}</span>
                    </td>
                    <td>
                      <div className="tc-actions">
                        <button
                          type="button"
                          className={`tc-btn tc-btn--sm ${selectedExamId === h.exam_local_id ? "tc-btn--primary" : "tc-btn--secondary"}`}
                          onClick={() => void loadScript(h.exam_local_id)}
                        >
                          <CtIco name="i-eye" className="ct-ico--xs" />
                          Inspect Script
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Question-by-Question Script Breakdown */}
      {selectedExamId > 0 && (
        <section className="tc-card">
          <div className="tc-card__head">
            <div className="tc-card__title">
              <h2>Answer Script Breakdown</h2>
              <p>
                {scriptDetail?.attempt?.exam_name || "Examination"} ·{" "}
                {scriptDetail?.attempt ? `${scriptDetail.attempt.score} / ${scriptDetail.attempt.total}` : ""}
              </p>
            </div>
            <button
              type="button"
              className="tc-btn tc-btn--ghost tc-btn--sm"
              onClick={() => {
                setSelectedExamId(0);
                setScriptDetail(null);
              }}
            >
              Close Script
            </button>
          </div>
          <div className="tc-card__body" style={{ display: "grid", gap: 12 }}>
            {loadingScript ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--ct-ink-3)" }}>
                Loading student script...
              </div>
            ) : !scriptDetail?.items?.length ? (
              <p style={{ margin: 0, color: "var(--ct-ink-3)", fontSize: 13 }}>
                No detailed question responses were recorded for this attempt.
              </p>
            ) : (
              scriptDetail.items.map((item: any, idx: number) => (
                <div key={item.local_id} className="qb-qitem">
                  <div className="qb-qitem__head">
                    <span className="tc-pill tc-mono">Question {idx + 1}</span>
                    <span className={`tc-pill ${item.is_correct ? "tc-pill--ok" : "tc-pill--bad"}`}>
                      {item.is_correct ? "Correct" : item.given_answer ? "Incorrect" : "Unanswered"}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    <MathText text={item.question} />
                  </div>
                  <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                    <div>
                      <span style={{ color: "var(--ct-ink-3)" }}>Student answer: </span>
                      <strong style={{ color: "var(--ct-ink)" }}>
                        {item.given_answer ? <MathText text={item.given_answer} /> : "No response"}
                      </strong>
                    </div>
                    {!item.is_correct && (
                      <div>
                        <span style={{ color: "var(--ct-ink-3)" }}>Correct answer: </span>
                        <strong style={{ color: "var(--ct-ink)" }}>
                          <MathText text={item.correct_answer} />
                        </strong>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </>
  );
}
