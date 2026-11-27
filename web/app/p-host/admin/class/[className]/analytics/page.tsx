"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { MonochromeBarChart, MonochromeDonutChart } from "@/components/portal/OfflineCharts";
import { AdminShell, OfflineSchoolMeta } from "@/components/portal/OfflineShell";

export default function AdminClassAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const className = decodeURIComponent(String(params?.className || ""));

  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/portal/control", { credentials: "include" }),
      fetch(`/api/v1/portal/analytics?scope=class&className=${encodeURIComponent(className)}`, {
        credentials: "include",
      }),
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
  }, [className, router]);

  const k = data?.kpis || {};
  const gb = data?.grade_buckets || { A: 0, B: 0, C: 0, D: 0, F: 0 };

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="analytics" crumb={`Class Analytics · ${className}`} school={school}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Class Performance Drill-Down</span>
            <h1>{className} Analytics</h1>
            <p>Dedicated performance breakdown for students and examinations in {className}.</p>
          </div>
          <div className="tc-head__actions">
            <Link href="/admin/school-analytics" className="tc-btn tc-btn--secondary">
              <CtIco name="i-arrow-left" className="ct-ico--sm" />
              All School Analytics
            </Link>
          </div>
        </header>

        <section className="tc-kpi-strip">
          <div className="tc-kpi">
            <span className="tc-kpi__label">Enrolled Students</span>
            <strong className="tc-kpi__val">{k.total_students || 0}</strong>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Class Average</span>
            <strong className="tc-kpi__val">{k.average_score || 0}%</strong>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Total Scripts</span>
            <strong className="tc-kpi__val">{k.total_attempts || 0}</strong>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Distinctions</span>
            <strong className="tc-kpi__val">{k.distinctions || 0}</strong>
          </div>
        </section>

        {loading ? (
          <div className="tc-card" style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>
            Loading class analytics...
          </div>
        ) : (
          <div style={{ display: "grid", gap: 20 }}>
            <div className="tc-form-row2">
              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Grade Distribution</h2>
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
                    <h2>Examinations in {className}</h2>
                  </div>
                </div>
                <div className="tc-card__body">
                  <MonochromeBarChart
                    data={(data?.exam_stats || []).map((e: any) => ({
                      label: e.name,
                      value: Math.round(e.average),
                    }))}
                  />
                </div>
              </section>
            </div>

            <section className="tc-card">
              <div className="tc-card__head">
                <div className="tc-card__title">
                  <h2>Student Leaderboard ({className})</h2>
                </div>
              </div>
              <div className="tc-table-wrap">
                <table className="tc-table ad-dash-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Student</th>
                      <th className="is-center">Papers</th>
                      <th className="is-center">Best</th>
                      <th style={{ textAlign: "right" }}>Average</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.all_students_perf || []).map((s: any, idx: number) => (
                      <tr key={s.local_id}>
                        <td className="tc-mono">{idx + 1}</td>
                        <td>
                          <Link href={`/admin/student/${s.local_id}`} style={{ fontWeight: 640, color: "var(--tc-ink)" }}>
                            {s.full_name}
                          </Link>
                        </td>
                        <td className="tc-mono is-center">{s.count}</td>
                        <td className="tc-mono is-center">{s.best}%</td>
                        <td className="tc-mono" style={{ textAlign: "right", fontWeight: 650 }}>{s.avg}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </AdminShell>
    </div>
  );
}
