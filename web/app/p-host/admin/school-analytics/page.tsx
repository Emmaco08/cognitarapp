"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import {
  MonochromeBarChart,
  MonochromeDonutChart,
  MonochromeHBarChart,
} from "@/components/portal/OfflineCharts";
import { AdminShell, OfflineSchoolMeta } from "@/components/portal/OfflineShell";

export default function AdminSchoolAnalyticsPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [data, setData] = useState<any>(null);
  const [subjMode, setSubjMode] = useState<"top" | "low" | "all">("top");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/portal/control", { credentials: "include" }),
      fetch("/api/v1/portal/analytics?scope=school", { credentials: "include" }),
    ])
      .then(async ([cRes, aRes]) => {
        if (aRes.status === 401 || aRes.status === 403) {
          router.replace("/");
          return;
        }
        const c = cRes.ok ? await cRes.json() : null;
        const a = await aRes.json();
        if (c?.ok) setSchool(c.school);
        if (a?.ok) setData(a);
      })
      .finally(() => setLoading(false));
  }, [router]);

  const k = data?.kpis || {};
  const gb = data?.grade_buckets || { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const allSubjects: any[] = data?.subject_stats || [];
  const visibleSubjects =
    subjMode === "top"
      ? allSubjects.slice(0, 10)
      : subjMode === "low"
        ? [...allSubjects].reverse().slice(0, 10)
        : allSubjects;

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="analytics" crumb="School Analytics" school={school}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Institutional Performance Overview</span>
            <h1>School Analytics</h1>
            <p>Track school-wide grade spread, class averages, pass rates, subject strengths, and honor roll.</p>
          </div>
          <div className="tc-head__actions">
            <button type="button" className="tc-btn tc-btn--secondary" onClick={() => window.print()}>
              <CtIco name="i-print" className="ct-ico--sm" />
              Print Report
            </button>
          </div>
        </header>

        <section className="an-kpis" style={{ marginBottom: 20 }}>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Students</span>
            <strong className="tc-kpi__val">{k.total_students || 0}</strong>
            <span className="tc-kpi__meta">{k.students_assessed || 0} assessed</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Teachers</span>
            <strong className="tc-kpi__val">{k.total_teachers || 0}</strong>
            <span className="tc-kpi__meta">Faculty accounts</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Examinations</span>
            <strong className="tc-kpi__val">{k.total_exams || 0}</strong>
            <span className="tc-kpi__meta">Active &amp; archived</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Total Scripts</span>
            <strong className="tc-kpi__val">{k.total_attempts || 0}</strong>
            <span className="tc-kpi__meta">Completed submissions</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">School Average</span>
            <strong className="tc-kpi__val">{k.average_score || 0}%</strong>
            <span className="tc-kpi__meta">{k.distinctions || 0} distinctions</span>
          </div>
        </section>

        {loading ? (
          <div className="tc-card" style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>
            Computing school analytics...
          </div>
        ) : (
          <div style={{ display: "grid", gap: 20 }}>
            <div className="tc-form-row2">
              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Grade Distribution</h2>
                    <p>Band breakdown across all completed papers</p>
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
                    centerLabel="School Mean"
                  />
                </div>
              </section>

              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Class Average Scores</h2>
                    <p>Click any class pill below to drill into class analytics</p>
                  </div>
                </div>
                <div className="tc-card__body">
                  <MonochromeBarChart
                    data={(data?.class_stats || []).map((c: any) => ({
                      label: c.name,
                      value: Math.round(c.average),
                      sub: `${c.attempts} scripts`,
                    }))}
                  />
                  {(data?.class_stats || []).length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                      {(data.class_stats || []).map((c: any) => (
                        <Link
                          key={c.name}
                          href={`/admin/class/${encodeURIComponent(c.name)}/analytics`}
                          className="tc-btn tc-btn--secondary tc-btn--sm"
                        >
                          {c.name} ({c.average}%)
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="tc-form-row2">
              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Subject Performance</h2>
                    <p>Mean accuracy by subject tag</p>
                  </div>
                  <div className="tcc-seg">
                    <button type="button" className={`tcc-chip${subjMode === "top" ? " is-active" : ""}`} onClick={() => setSubjMode("top")}>
                      Top 10
                    </button>
                    <button type="button" className={`tcc-chip${subjMode === "low" ? " is-active" : ""}`} onClick={() => setSubjMode("low")}>
                      Needs Support
                    </button>
                    <button type="button" className={`tcc-chip${subjMode === "all" ? " is-active" : ""}`} onClick={() => setSubjMode("all")}>
                      All
                    </button>
                  </div>
                </div>
                <div className="tc-card__body">
                  <MonochromeHBarChart
                    data={visibleSubjects.map((s) => ({
                      label: s.name,
                      value: Math.round(s.average),
                      meta: `${s.attempts} scripts`,
                    }))}
                  />
                </div>
              </section>

              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Class Pass Rates (50%+)</h2>
                    <p>Percentage of passing scripts per class</p>
                  </div>
                </div>
                <div className="tc-card__body">
                  <MonochromeHBarChart
                    data={(data?.class_stats || []).map((c: any) => ({
                      label: c.name,
                      value: c.pass_rate,
                      meta: `${c.attempts} scripts`,
                    }))}
                  />
                </div>
              </section>
            </div>

            <div className="tc-form-row2" style={{ alignItems: "start" }}>
              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Top Students</h2>
                    <p>Leading academic averages school-wide</p>
                  </div>
                </div>
                <div className="tc-table-wrap">
                  <table className="tc-table ad-dash-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Class</th>
                        <th style={{ textAlign: "right" }}>Average</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.top_students || []).slice(0, 10).map((s: any) => (
                        <tr key={s.local_id}>
                          <td>
                            <Link href={`/admin/student/${s.local_id}`} style={{ fontWeight: 640, color: "var(--tc-ink)" }}>
                              {s.full_name}
                            </Link>
                          </td>
                          <td><span className="tc-pill">{s.student_class}</span></td>
                          <td className="tc-mono" style={{ textAlign: "right", fontWeight: 650 }}>{s.avg}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Recent Examinations</h2>
                    <p>Attempt counts and score ranges</p>
                  </div>
                </div>
                <div className="tc-table-wrap">
                  <table className="tc-table ad-dash-table">
                    <thead>
                      <tr>
                        <th>Exam</th>
                        <th className="is-center">Tries</th>
                        <th style={{ textAlign: "right" }}>Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.exam_stats || []).slice(0, 10).map((e: any) => (
                        <tr key={e.local_id}>
                          <td>
                            <Link href={`/admin/exam/${e.local_id}/preview`} style={{ fontWeight: 640, color: "var(--tc-ink)" }}>
                              {e.name}
                            </Link>
                          </td>
                          <td className="tc-mono is-center">{e.attempts}</td>
                          <td className="tc-mono" style={{ textAlign: "right", fontWeight: 650 }}>
                            {e.attempts ? `${e.average}%` : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        )}
      </AdminShell>
    </div>
  );
}
