"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { MonochromeBarChart, MonochromeDonutChart } from "@/components/portal/OfflineCharts";
import { OfflineSchoolMeta, TeacherShell } from "@/components/portal/OfflineShell";

export default function TeacherExamAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Number(params?.examId || 0);

  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/v1/portal/exams", { credentials: "include" }),
      fetch(`/api/v1/portal/exams/${examId}`, { credentials: "include" }),
    ])
      .then(async ([mRes, dRes]) => {
        if (dRes.status === 401 || dRes.status === 403) {
          router.replace("/");
          return;
        }
        const m = mRes.ok ? await mRes.json() : null;
        const d = await dRes.json();
        if (!alive) return;
        if (m?.ok) {
          setSchool(m.school);
          setTeacherName(m.teacher?.full_name || m.teacher?.username || "Teacher");
        }
        if (d?.ok) setData(d);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [examId, router]);

  const exam = data?.exam;
  const an = data?.analytics || {};
  const gb = an.grade_buckets || { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const completedAttempts = (data?.attempts || []).filter((a: any) => a.submitted);

  return (
    <div className="ct-app tc-studio">
      <TeacherShell
        active="analytics"
        crumb={`Exam Analytics · ${exam?.name || ""}`}
        school={school}
        username={teacherName}
      >
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Item &amp; Cohort Breakdown · {exam?.exam_class || ""}</span>
            <h1>{exam?.name || "Exam Analytics"}</h1>
            <p>Grade distribution, section accuracy, most challenging items, and candidate rankings.</p>
          </div>
          <div className="tc-head__actions">
            <Link href={`/teacher/results/${examId}`} className="tc-btn tc-btn--secondary">
              <CtIco name="i-doc" className="ct-ico--sm" />
              Results Ledger
            </Link>
            <Link href="/teacher/analytics" className="tc-btn tc-btn--secondary">
              <CtIco name="i-arrow-left" className="ct-ico--sm" />
              Class Analytics
            </Link>
          </div>
        </header>

        {loading ? (
          <div className="tc-card" style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>
            Loading exam analytics...
          </div>
        ) : (
          <>
            <section className="tc-kpi-strip">
              <div className="tc-kpi">
                <span className="tc-kpi__label">Completed</span>
                <strong className="tc-kpi__val">{an.completed_count || 0}</strong>
                <span className="tc-kpi__meta">Submitted scripts</span>
              </div>
              <div className="tc-kpi">
                <span className="tc-kpi__label">Average Score</span>
                <strong className="tc-kpi__val">{an.avg_score || 0}%</strong>
                <span className="tc-kpi__meta">Mean accuracy</span>
              </div>
              <div className="tc-kpi">
                <span className="tc-kpi__label">Pass Rate</span>
                <strong className="tc-kpi__val">{an.pass_rate || 0}%</strong>
                <span className="tc-kpi__meta">50% benchmark</span>
              </div>
              <div className="tc-kpi">
                <span className="tc-kpi__label">Score Range</span>
                <strong className="tc-kpi__val" style={{ fontSize: 22 }}>
                  {an.min_score || 0}% / {an.max_score || 0}%
                </strong>
                <span className="tc-kpi__meta">Lowest / Highest</span>
              </div>
            </section>

            <div className="tc-form-row2" style={{ marginBottom: 20 }}>
              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Grade Distribution</h2>
                    <p>Band spread across graded scripts</p>
                  </div>
                </div>
                <div className="tc-card__body">
                  <MonochromeDonutChart
                    segments={[
                      { label: "Grade A", value: gb.A || 0 },
                      { label: "Grade B", value: gb.B || 0 },
                      { label: "Grade C", value: gb.C || 0 },
                      { label: "Grade D", value: gb.D || 0 },
                      { label: "Grade F", value: gb.F || 0 },
                    ]}
                    centerValue={`${an.avg_score || 0}%`}
                    centerLabel="Average"
                  />
                </div>
              </section>

              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Section Accuracy</h2>
                    <p>Average correctness by paper section</p>
                  </div>
                </div>
                <div className="tc-card__body">
                  <MonochromeBarChart
                    data={(an.section_accuracy || []).map((s: any) => ({
                      label: s.name,
                      value: s.accuracy,
                      sub: `${s.questions} Qs`,
                    }))}
                  />
                </div>
              </section>
            </div>

            <div className="tc-form-row2" style={{ alignItems: "start" }}>
              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Most Challenging Questions</h2>
                    <p>Ranked by highest student error rate</p>
                  </div>
                </div>
                <div className="tc-table-wrap">
                  <table className="tc-table td-table">
                    <thead>
                      <tr>
                        <th>Question</th>
                        <th className="is-center">Error Rate</th>
                        <th style={{ textAlign: "right" }}>Difficulty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(an.challenging_questions || []).slice(0, 10).map((q: any) => (
                        <tr key={q.local_id}>
                          <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {q.question}
                          </td>
                          <td className="tc-mono is-center">{q.error_rate}%</td>
                          <td style={{ textAlign: "right" }}>
                            <span className="tc-pill">{q.difficulty}</span>
                          </td>
                        </tr>
                      ))}
                      {(!an.challenging_questions || an.challenging_questions.length === 0) && (
                        <tr>
                          <td colSpan={3} style={{ textAlign: "center", color: "var(--tc-ink-3)", padding: 24 }}>
                            No item difficulty data yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Student Rankings</h2>
                    <p>Top scripts for this examination</p>
                  </div>
                </div>
                <div className="tc-table-wrap">
                  <table className="tc-table td-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Student</th>
                        <th className="is-center">Score</th>
                        <th style={{ textAlign: "right" }}>Pct</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedAttempts.slice(0, 12).map((a: any, idx: number) => (
                        <tr key={a.id}>
                          <td className="tc-mono">{idx + 1}</td>
                          <td>
                            <Link href={`/teacher/student/${a.student_local_id}`} style={{ fontWeight: 620, color: "var(--tc-ink)" }}>
                              {a.student_name || a.student_username}
                            </Link>
                          </td>
                          <td className="tc-mono is-center">
                            {a.score} / {a.total}
                          </td>
                          <td className="tc-mono" style={{ textAlign: "right", fontWeight: 650 }}>
                            {Math.round(Number(a.percentage || 0))}%
                          </td>
                        </tr>
                      ))}
                      {completedAttempts.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: "center", color: "var(--tc-ink-3)", padding: 24 }}>
                            No completed scripts yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        )}
      </TeacherShell>
    </div>
  );
}
