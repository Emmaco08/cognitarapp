"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { AdminShell, OfflineSchoolMeta } from "@/components/portal/OfflineShell";

export default function AdminResultsPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [openClasses, setOpenClasses] = useState<Record<string, boolean>>({});
  const [openStudents, setOpenStudents] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/portal/control", { credentials: "include" }),
      fetch("/api/v1/portal/analytics?scope=results", { credentials: "include" }),
    ])
      .then(async ([cRes, rRes]) => {
        if (rRes.status === 401 || rRes.status === 403) {
          router.replace("/");
          return;
        }
        const c = cRes.ok ? await cRes.json() : null;
        const r = await rRes.json();
        if (c?.ok) setSchool(c.school);
        if (r?.ok) {
          setData(r);
          const initOpen: Record<string, boolean> = {};
          for (const g of (r.class_groups || []).slice(0, 2)) initOpen[g.class_name] = true;
          setOpenClasses(initOpen);
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  const k = data?.kpis || {};
  const q = search.trim().toLowerCase();
  const groups = (data?.class_groups || [])
    .map((g: any) => ({
      ...g,
      students: (g.students || []).filter((s: any) =>
        !q
          ? true
          : `${s.full_name} ${s.username} ${g.class_name} ${(s.items || []).map((i: any) => i.exam_name).join(" ")}`
              .toLowerCase()
              .includes(q)
      ),
    }))
    .filter((g: any) => g.students.length > 0);

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="results" crumb="Results & Grades" school={school}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Official Examination Records</span>
            <h1>Student Results Ledger</h1>
            <p>Browse graded examination scripts grouped by class and student.</p>
          </div>
          <div className="tc-head__actions">
            <button type="button" className="tc-btn tc-btn--secondary" onClick={() => window.print()}>
              <CtIco name="i-print" className="ct-ico--sm" />
              Print Report
            </button>
          </div>
        </header>

        <section className="tc-kpi-strip" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Classes with Results</span>
            <strong className="tc-kpi__val">{k.classes || 0}</strong>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Approved Students</span>
            <strong className="tc-kpi__val">{k.students || 0}</strong>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Completed Papers</span>
            <strong className="tc-kpi__val">{k.completed_exams || 0}</strong>
          </div>
        </section>

        <div style={{ marginBottom: 16 }}>
          <label className="tc-search" style={{ maxWidth: 340 }}>
            <CtIco name="i-search" className="ct-ico--sm" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student, class, or exam..."
            />
          </label>
        </div>

        {loading ? (
          <div className="tc-card" style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>
            Loading results...
          </div>
        ) : groups.length === 0 ? (
          <section className="tc-card">
            <div className="tc-empty">
              <strong>No completed examination results found</strong>
              <p>Graded scripts will appear here grouped by class once students complete exams.</p>
            </div>
          </section>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {groups.map((grp: any) => {
              const isOpen = Boolean(openClasses[grp.class_name]);
              return (
                <section key={grp.class_name} className="tc-card">
                  <button
                    type="button"
                    onClick={() => setOpenClasses((p) => ({ ...p, [grp.class_name]: !isOpen }))}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "16px 20px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--tc-ink)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <CtIco name={isOpen ? "i-chevron-down" : "i-chevron-right"} className="ct-ico--sm" />
                      <strong style={{ fontSize: 15.5 }}>{grp.class_name}</strong>
                      <span className="tc-pill">{grp.students.length} students</span>
                      <span className="tc-pill">{grp.exam_count} papers</span>
                    </div>
                    <Link
                      href={`/admin/class/${encodeURIComponent(grp.class_name)}/analytics`}
                      className="tc-btn tc-btn--secondary tc-btn--sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Class Analytics
                    </Link>
                  </button>

                  {isOpen && (
                    <div style={{ borderTop: "1px solid var(--tc-line)", padding: "12px 20px 18px", display: "grid", gap: 10 }}>
                      {grp.students.map((st: any) => {
                        const stOpen = Boolean(openStudents[st.student_local_id]);
                        return (
                          <div
                            key={st.student_local_id}
                            style={{ border: "1px solid var(--tc-line)", borderRadius: 10, overflow: "hidden" }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                                padding: "11px 14px",
                                background: "var(--tc-surface-2)",
                                cursor: "pointer",
                              }}
                              onClick={() =>
                                setOpenStudents((p) => ({ ...p, [st.student_local_id]: !stOpen }))
                              }
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <CtIco name={stOpen ? "i-chevron-down" : "i-chevron-right"} className="ct-ico--xs" />
                                <strong>{st.full_name}</strong>
                                <span className="tc-mono" style={{ fontSize: 12, color: "var(--tc-ink-3)" }}>
                                  @{st.username}
                                </span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span className="tc-pill tc-mono">Avg {st.average}%</span>
                                <Link
                                  href={`/admin/student/${st.student_local_id}`}
                                  className="tc-btn tc-btn--ghost tc-btn--sm"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Profile
                                </Link>
                              </div>
                            </div>

                            {stOpen && (
                              <div className="tc-table-wrap">
                                <table className="tc-table ad-dash-table">
                                  <thead>
                                    <tr>
                                      <th>Examination</th>
                                      <th className="is-center">Score</th>
                                      <th className="is-center">Percentage</th>
                                      <th style={{ textAlign: "right" }}>Grade</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {st.items.map((it: any) => (
                                      <tr key={it.attempt_id}>
                                        <td><strong>{it.exam_name}</strong></td>
                                        <td className="tc-mono is-center">{it.score} / {it.total}</td>
                                        <td className="tc-mono is-center">{Math.round(Number(it.percentage || 0))}%</td>
                                        <td style={{ textAlign: "right" }}>
                                          <span className="tc-pill">{it.grade_label}</span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </AdminShell>
    </div>
  );
}
