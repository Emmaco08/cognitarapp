"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { MonochromeBarChart, MonochromeDonutChart } from "@/components/portal/OfflineCharts";
import { OfflineSchoolMeta, TeacherShell } from "@/components/portal/OfflineShell";

export default function TeacherAnalyticsPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [data, setData] = useState<any>(null);
  const [className, setClassName] = useState("");
  const [examId, setExamId] = useState("");
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(
    async (cls: string, ex: string) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ scope: "teacher" });
        if (cls) qs.set("className", cls);
        if (ex) qs.set("examId", ex);
        const [mRes, aRes] = await Promise.all([
          fetch("/api/v1/portal/exams", { credentials: "include" }),
          fetch(`/api/v1/portal/analytics?${qs.toString()}`, { credentials: "include" }),
        ]);
        if (aRes.status === 401 || aRes.status === 403) {
          router.replace("/");
          return;
        }
        const m = mRes.ok ? await mRes.json() : null;
        const a = await aRes.json();
        if (m?.ok) {
          setSchool(m.school);
          setTeacherName(m.teacher?.full_name || m.teacher?.username || "Teacher");
        }
        if (a?.ok) setData(a);
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    void loadAnalytics(className, examId);
  }, [className, examId, loadAnalytics]);

  const k = data?.kpis || {};
  const gb = data?.grade_buckets || { A: 0, B: 0, C: 0, D: 0, F: 0 };

  return (
    <div className="ct-app tc-studio">
      <TeacherShell active="analytics" crumb="Class Analytics" school={school} username={teacherName}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Teaching Performance Intelligence</span>
            <h1>Class &amp; Cohort Analytics</h1>
            <p>Track class averages, grade distributions, top performers, and students needing academic support.</p>
          </div>
          <div className="tc-head__actions">
            <select
              className="tc-select"
              style={{ height: 38, minWidth: 150 }}
              value={className}
              onChange={(e) => setClassName(e.target.value)}
            >
              <option value="">All Classes</option>
              {(data?.available_classes || []).map((c: string) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              className="tc-select"
              style={{ height: 38, minWidth: 180 }}
              value={examId}
              onChange={(e) => setExamId(e.target.value)}
            >
              <option value="">All My Exams</option>
              {(data?.available_exams || []).map((ex: any) => (
                <option key={ex.local_id} value={String(ex.local_id)}>
                  {ex.name}
                </option>
              ))}
            </select>
          </div>
        </header>

        <section className="tc-kpi-strip">
          <div className="tc-kpi">
            <span className="tc-kpi__label">Students Assessed</span>
            <strong className="tc-kpi__val">{k.students_assessed || 0}</strong>
            <span className="tc-kpi__meta">Out of {k.total_students || 0} enrolled</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Overall Average</span>
            <strong className="tc-kpi__val">{k.average_score || 0}%</strong>
            <span className="tc-kpi__meta">Across filtered scripts</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Completed Scripts</span>
            <strong className="tc-kpi__val">{k.total_attempts || 0}</strong>
            <span className="tc-kpi__meta">Across {k.total_exams || 0} exams</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Distinctions (75%+)</span>
            <strong className="tc-kpi__val">{k.distinctions || 0}</strong>
            <span className="tc-kpi__meta">High-achieving scripts</span>
          </div>
        </section>

        {loading ? (
          <div className="tc-card" style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>
            Computing analytics...
          </div>
        ) : (
          <>
            <div className="tc-form-row2" style={{ marginBottom: 20 }}>
              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Grade Distribution</h2>
                    <p>Band share across graded scripts</p>
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
                    centerValue={`${k.average_score || 0}%`}
                    centerLabel="Mean"
                  />
                </div>
              </section>

              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Exam Performance Comparison</h2>
                    <p>Mean percentage per examination</p>
                  </div>
                </div>
                <div className="tc-card__body">
                  <MonochromeBarChart
                    data={(data?.exam_stats || []).slice(0, 8).map((e: any) => ({
                      label: e.name,
                      value: Math.round(e.average),
                      sub: `${e.attempts} scripts`,
                    }))}
                  />
                </div>
              </section>
            </div>

            <div className="tc-form-row2" style={{ alignItems: "start" }}>
              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Top Performers</h2>
                    <p>Highest average students in selected scope</p>
                  </div>
                </div>
                <div className="tc-table-wrap">
                  <table className="tc-table td-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Class</th>
                        <th style={{ textAlign: "right" }}>Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.top_students || []).slice(0, 10).map((s: any) => (
                        <tr key={s.local_id}>
                          <td>
                            <Link href={`/teacher/student/${s.local_id}`} style={{ fontWeight: 640, color: "var(--tc-ink)" }}>
                              {s.full_name}
                            </Link>
                          </td>
                          <td>
                            <span className="tc-pill">{s.student_class}</span>
                          </td>
                          <td className="tc-mono" style={{ textAlign: "right", fontWeight: 650 }}>
                            {s.avg}%
                          </td>
                        </tr>
                      ))}
                      {!(data?.top_students || []).length && (
                        <tr>
                          <td colSpan={3} style={{ textAlign: "center", padding: 24, color: "var(--tc-ink-3)" }}>
                            No graded student data yet
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
                    <h2>Needs Attention (&lt;70%)</h2>
                    <p>Students who may benefit from review or coaching</p>
                  </div>
                </div>
                <div className="tc-table-wrap">
                  <table className="tc-table td-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Class</th>
                        <th style={{ textAlign: "right" }}>Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.needs_attention || []).slice(0, 10).map((s: any) => (
                        <tr key={s.local_id}>
                          <td>
                            <Link href={`/teacher/student/${s.local_id}`} style={{ fontWeight: 640, color: "var(--tc-ink)" }}>
                              {s.full_name}
                            </Link>
                          </td>
                          <td>
                            <span className="tc-pill">{s.student_class}</span>
                          </td>
                          <td className="tc-mono" style={{ textAlign: "right", fontWeight: 650 }}>
                            {s.avg}%
                          </td>
                        </tr>
                      ))}
                      {!(data?.needs_attention || []).length && (
                        <tr>
                          <td colSpan={3} style={{ textAlign: "center", padding: 24, color: "var(--tc-ink-3)" }}>
                            All assessed students are above 70%
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
