"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { AdminShell, OfflineSchoolMeta, showCtToast } from "@/components/portal/OfflineShell";

export default function AdminExamAttemptsPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "in_progress">("all");
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, aRes] = await Promise.all([
        fetch("/api/v1/portal/control", { credentials: "include" }),
        fetch("/api/v1/portal/analytics?scope=attempts", { credentials: "include" }),
      ]);
      if (aRes.status === 401 || aRes.status === 403) {
        router.replace("/");
        return;
      }
      const c = cRes.ok ? await cRes.json() : null;
      const a = await aRes.json();
      if (c?.ok) setSchool(c.school);
      if (a?.ok) setData(a);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resetAttempt = async (a: any) => {
    if (!window.confirm(`Reset "${a.exam_name}" attempt for ${a.student_name}?`)) return;
    const res = await fetch("/api/v1/portal/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        action: "reset_attempt",
        student_local_id: a.student_local_id,
        exam_local_id: a.exam_local_id,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      showCtToast("Attempt reset cleanly.", "ok");
      await loadData();
    }
  };

  const k = data?.kpis || {};
  const q = search.trim().toLowerCase();
  const rows = (data?.attempts || []).filter((a: any) => {
    if (statusFilter === "completed" && !a.submitted) return false;
    if (statusFilter === "in_progress" && a.submitted) return false;
    if (!q) return true;
    return `${a.student_name} ${a.student_username} ${a.exam_name} ${a.student_class}`.toLowerCase().includes(q);
  });

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="attempts" crumb="Exam Attempts" school={school}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Sitting History &amp; Reset Ledger</span>
            <h1>Exam Attempts</h1>
            <p>Inspect every active and completed exam sitting across the school or reset attempts for re-sits.</p>
          </div>
          <div className="tc-head__actions">
            <button type="button" className="tc-btn tc-btn--secondary" onClick={() => void loadData()}>
              <CtIco name="i-refresh" className="ct-ico--sm" />
              Refresh
            </button>
          </div>
        </header>

        <section className="tc-kpi-strip" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Total Attempts</span>
            <strong className="tc-kpi__val">{k.total || 0}</strong>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Completed</span>
            <strong className="tc-kpi__val">{k.completed || 0}</strong>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">In Progress</span>
            <strong className="tc-kpi__val">{k.in_progress || 0}</strong>
          </div>
        </section>

        <section className="tc-card">
          <div className="tc-card__head">
            <div className="tc-card__title">
              <h2>All Recorded Sittings</h2>
            </div>
            <div className="tc-card__tools">
              <label className="tc-search" style={{ width: 220 }}>
                <CtIco name="i-search" className="ct-ico--sm" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search student or exam..."
                />
              </label>
              <select
                className="ad-filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | "completed" | "in_progress")}
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="in_progress">In Progress</option>
              </select>
            </div>
          </div>

          <div className="tc-table-wrap">
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--tc-ink-3)" }}>Loading attempts...</div>
            ) : rows.length === 0 ? (
              <div className="tc-empty">
                <strong>No exam attempts recorded</strong>
              </div>
            ) : (
              <table className="tc-table ad-dash-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Examination</th>
                    <th className="is-center">Score</th>
                    <th className="is-center">Warnings</th>
                    <th className="is-center">Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a: any) => (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/admin/student/${a.student_local_id}`} style={{ fontWeight: 640, color: "var(--tc-ink)", display: "block" }}>
                          {a.student_name || a.student_username}
                        </Link>
                        <span className="tc-mono" style={{ fontSize: 11.5, color: "var(--tc-ink-3)" }}>
                          {a.student_class || a.exam_class}
                        </span>
                      </td>
                      <td><strong>{a.exam_name}</strong></td>
                      <td className="tc-mono is-center">
                        {a.submitted ? `${a.score}/${a.total} (${Math.round(Number(a.percentage || 0))}%)` : "-"}
                      </td>
                      <td className="tc-mono is-center">{a.warnings_count || 0}</td>
                      <td className="is-center">
                        <span className={`tc-pill ${a.submitted ? "tc-pill--ok" : "tc-pill--warn"}`}>
                          {a.submitted ? "Completed" : "In Progress"}
                        </span>
                      </td>
                      <td>
                        <div className="tc-actions">
                          <button
                            type="button"
                            className="tc-btn tc-btn--danger-soft tc-btn--sm"
                            onClick={() => void resetAttempt(a)}
                          >
                            Reset Attempt
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </AdminShell>
    </div>
  );
}
