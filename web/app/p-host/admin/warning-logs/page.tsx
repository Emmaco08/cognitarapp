"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { AdminShell, OfflineSchoolMeta, showCtToast } from "@/components/portal/OfflineShell";

export default function AdminWarningLogsPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<"student" | "exam" | "events">("student");
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, lRes] = await Promise.all([
        fetch("/api/v1/portal/control", { credentials: "include" }),
        fetch("/api/v1/portal/logs?type=warnings", { credentials: "include" }),
      ]);
      if (lRes.status === 401 || lRes.status === 403) {
        router.replace("/");
        return;
      }
      const c = cRes.ok ? await cRes.json() : null;
      const l = await lRes.json();
      if (c?.ok) setSchool(c.school);
      if (l?.ok) setData(l);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const clearWarnings = async (qs: string, confirmMsg: string) => {
    if (!window.confirm(confirmMsg)) return;
    const res = await fetch(`/api/v1/portal/logs?${qs}`, { method: "DELETE", credentials: "include" });
    const json = await res.json();
    if (json.ok) {
      showCtToast(json.message || "Cleared.", "ok");
      await loadData();
    }
  };

  const exportCsv = () => {
    const events: any[] = data?.events || [];
    const header = ["Timestamp", "Student", "Exam", "Type", "Message"];
    const rows = events.map((e) => [
      new Date(e.created_at).toISOString(),
      `"${String(e.student_name || "").replace(/"/g, '""')}"`,
      `"${String(e.exam_name || "").replace(/"/g, '""')}"`,
      e.warning_type || "",
      `"${String(e.message || "").replace(/"/g, '""')}"`,
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cognitara_warning_logs.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = data?.stats || { flagged_students: 0, total_events: 0, sessions_flagged: 0 };

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="warnings" crumb="Warning Logs" school={school}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Exam Integrity Monitoring</span>
            <h1>Warning Logs</h1>
            <p>Review tab-switch, copy/paste, and focus warnings grouped by student, exam, or event timeline.</p>
          </div>
          <div className="tc-head__actions">
            <button
              type="button"
              className="tc-btn tc-btn--secondary"
              disabled={!(data?.events || []).length}
              onClick={exportCsv}
            >
              <CtIco name="i-download" className="ct-ico--sm" />
              Export CSV
            </button>
            <button
              type="button"
              className="tc-btn tc-btn--danger-soft"
              disabled={!(data?.events || []).length}
              onClick={() => void clearWarnings("scope=all", "Clear ALL recorded integrity warning logs?")}
            >
              <CtIco name="i-trash" className="ct-ico--sm" />
              Clear All
            </button>
          </div>
        </header>

        <section className="tc-kpi-strip" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Flagged Students</span>
            <strong className="tc-kpi__val">{stats.flagged_students}</strong>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Total Warning Events</span>
            <strong className="tc-kpi__val">{stats.total_events}</strong>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Flagged Sessions</span>
            <strong className="tc-kpi__val">{stats.sessions_flagged}</strong>
          </div>
        </section>

        <section className="tc-card">
          <div className="tc-card__head">
            <div className="tcc-seg">
              <button type="button" className={`tcc-chip${tab === "student" ? " is-active" : ""}`} onClick={() => setTab("student")}>
                By Student
              </button>
              <button type="button" className={`tcc-chip${tab === "exam" ? " is-active" : ""}`} onClick={() => setTab("exam")}>
                By Exam
              </button>
              <button type="button" className={`tcc-chip${tab === "events" ? " is-active" : ""}`} onClick={() => setTab("events")}>
                All Events
              </button>
            </div>
          </div>

          <div className="tc-table-wrap">
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--tc-ink-3)" }}>Loading warning logs...</div>
            ) : !(data?.events || []).length ? (
              <div className="tc-empty">
                <span className="tc-empty__ico"><CtIco name="i-shield" /></span>
                <strong>Clean integrity record</strong>
                <p>No examination rule warnings have been recorded.</p>
              </div>
            ) : tab === "student" ? (
              <table className="tc-table ad-dash-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Exams Flagged</th>
                    <th className="is-center">Warnings</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.by_student || []).map((row: any) => (
                    <tr key={`${row.student_local_id}-${row.student_name}`}>
                      <td><strong>{row.student_name}</strong></td>
                      <td>{(row.exams || []).join(", ") || "-"}</td>
                      <td className="tc-mono is-center"><span className="tc-pill tc-pill--warn">{row.count}</span></td>
                      <td>
                        <div className="tc-actions">
                          <button
                            type="button"
                            className="tc-btn tc-btn--secondary tc-btn--sm"
                            onClick={() =>
                              void clearWarnings(
                                `scope=student&student_local_id=${row.student_local_id}&student_name=${encodeURIComponent(row.student_name)}`,
                                `Clear warnings for ${row.student_name}?`
                              )
                            }
                          >
                            Clear
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : tab === "exam" ? (
              <table className="tc-table ad-dash-table">
                <thead>
                  <tr>
                    <th>Examination</th>
                    <th>Student</th>
                    <th>Reasons</th>
                    <th className="is-center">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.by_exam || []).map((row: any, i: number) => (
                    <tr key={i}>
                      <td><strong>{row.exam_name}</strong></td>
                      <td>{row.student_name}</td>
                      <td style={{ fontSize: 12.5, color: "var(--tc-ink-2)" }}>{(row.reasons || []).join("; ")}</td>
                      <td className="tc-mono is-center"><span className="tc-pill tc-pill--warn">{row.count}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="tc-table ad-dash-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Student</th>
                    <th>Exam</th>
                    <th>Message</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.events || []).map((ev: any) => (
                    <tr key={ev.id}>
                      <td className="tc-mono" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                        {new Date(ev.created_at).toLocaleString()}
                      </td>
                      <td><strong>{ev.student_name}</strong></td>
                      <td>{ev.exam_name}</td>
                      <td style={{ fontSize: 12.5 }}>{ev.message}</td>
                      <td>
                        <div className="tc-actions">
                          <button
                            type="button"
                            className="tc-btn tc-btn--ghost tc-btn--icon"
                            style={{ color: "var(--tc-bad)" }}
                            onClick={() => void clearWarnings(`scope=single&id=${ev.id}`, "Remove this warning record?")}
                          >
                            <CtIco name="i-trash" className="ct-ico--sm" />
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
