"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { AdminShell, OfflineSchoolMeta } from "@/components/portal/OfflineShell";

export default function AdminAuditLogsPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [stats, setStats] = useState({ total: 0, admin: 0, teacher: 0, student: 0 });
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/portal/control", { credentials: "include" }),
      fetch("/api/v1/portal/logs?type=audit", { credentials: "include" }),
    ])
      .then(async ([cRes, lRes]) => {
        if (lRes.status === 401 || lRes.status === 403) {
          router.replace("/");
          return;
        }
        const c = cRes.ok ? await cRes.json() : null;
        const l = await lRes.json();
        if (c?.ok) setSchool(c.school);
        if (l?.ok) {
          setStats(l.stats || { total: 0, admin: 0, teacher: 0, student: 0 });
          setLogs(l.logs || []);
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  const q = search.trim().toLowerCase();
  const filtered = logs.filter((l) => {
    if (roleFilter !== "all" && String(l.actor_role || "").toLowerCase() !== roleFilter) return false;
    if (!q) return true;
    return `${l.actor_username} ${l.actor_role} ${l.action} ${l.details || ""}`.toLowerCase().includes(q);
  });

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="logs" crumb="Audit Logs" school={school}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Security &amp; Activity Ledger</span>
            <h1>Audit Logs</h1>
            <p>Chronological record of administrative, teacher, and system governance events.</p>
          </div>
        </header>

        <section className="tc-kpi-strip">
          <div className="tc-kpi">
            <span className="tc-kpi__label">Total Events</span>
            <strong className="tc-kpi__val">{stats.total}</strong>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Admin Actions</span>
            <strong className="tc-kpi__val">{stats.admin}</strong>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Teacher Actions</span>
            <strong className="tc-kpi__val">{stats.teacher}</strong>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Student Events</span>
            <strong className="tc-kpi__val">{stats.student}</strong>
          </div>
        </section>

        <section className="tc-card">
          <div className="tc-card__head">
            <div className="tc-card__title">
              <h2>Activity Trail</h2>
            </div>
            <div className="tc-card__tools">
              <label className="tc-search" style={{ width: 230 }}>
                <CtIco name="i-search" className="ct-ico--sm" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search user or action..."
                />
              </label>
              <select
                className="ad-filter-select"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="teacher">Teacher</option>
                <option value="student">Student</option>
              </select>
            </div>
          </div>

          <div className="tc-table-wrap">
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--tc-ink-3)" }}>Loading logs...</div>
            ) : filtered.length === 0 ? (
              <div className="tc-empty">
                <strong>No audit events recorded yet</strong>
              </div>
            ) : (
              <table className="tc-table ad-dash-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr key={l.id}>
                      <td className="tc-mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                        {new Date(l.created_at).toLocaleString()}
                      </td>
                      <td><strong>{l.actor_username}</strong></td>
                      <td><span className="tc-pill">{l.actor_role}</span></td>
                      <td>{l.action}</td>
                      <td style={{ color: "var(--tc-ink-2)", fontSize: 12.5 }}>{l.details || "-"}</td>
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
