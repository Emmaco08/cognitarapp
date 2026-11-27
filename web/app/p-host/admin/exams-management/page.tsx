"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { MathText } from "@/components/portal/MathText";
import { AdminShell, OfflineSchoolMeta, showCtToast } from "@/components/portal/OfflineShell";

export default function AdminExamsManagementPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [exams, setExams] = useState<any[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [kpiFilter, setKpiFilter] = useState<"all" | "active" | "inactive" | "deactivated">("all");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Slide-over Inspector Drawer
  const [drawerExamId, setDrawerExamId] = useState<number | null>(null);
  const [drawerData, setDrawerData] = useState<any>(null);
  const [drawerTab, setDrawerTab] = useState<"overview" | "students" | "questions">("overview");
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Deactivate with Audit Note Modal
  const [deactTarget, setDeactTarget] = useState<any>(null);
  const [deactNote, setDeactNote] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/portal/exams", { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        router.replace("/");
        return;
      }
      const json = await res.json();
      if (json.ok) {
        setSchool(json.school);
        setExams(json.exams || []);
        setClasses(json.all_classes || json.classes || []);
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openDrawer = async (examLocalId: number) => {
    setDrawerExamId(examLocalId);
    setDrawerTab("overview");
    setDrawerLoading(true);
    try {
      const res = await fetch(`/api/v1/portal/exams/${examLocalId}`, { credentials: "include" });
      const json = await res.json();
      if (json.ok) setDrawerData(json);
    } finally {
      setDrawerLoading(false);
    }
  };

  const toggleActive = async (ex: any) => {
    const res = await fetch("/api/v1/portal/exams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ local_id: ex.local_id, active: !ex.active }),
    });
    const json = await res.json();
    if (json.ok) {
      showCtToast(!ex.active ? `Activated "${ex.name}"` : `Paused "${ex.name}"`, "ok");
      await loadData();
    }
  };

  const confirmDeactivate = async () => {
    if (!deactTarget) return;
    const res = await fetch(`/api/v1/portal/exams/${deactTarget.local_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "deactivate", deactivation_note: deactNote }),
    });
    const json = await res.json();
    if (json.ok) {
      showCtToast(`Deactivated "${deactTarget.name}".`, "ok");
      setDeactTarget(null);
      setDeactNote("");
      await loadData();
    }
  };

  const reactivate = async (ex: any) => {
    const res = await fetch(`/api/v1/portal/exams/${ex.local_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "reactivate" }),
    });
    const json = await res.json();
    if (json.ok) {
      showCtToast(`Restored "${ex.name}".`, "ok");
      await loadData();
    }
  };

  const runBulk = async (action: "activate" | "deactivate" | "delete") => {
    if (!selectedIds.length) return;
    if (action === "delete" && !window.confirm(`Permanently delete ${selectedIds.length} selected exam(s)?`)) return;
    for (const id of selectedIds) {
      if (action === "delete") {
        await fetch(`/api/v1/portal/exams?local_id=${id}`, { method: "DELETE", credentials: "include" });
      } else {
        await fetch("/api/v1/portal/exams", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ local_id: id, active: action === "activate" }),
        });
      }
    }
    showCtToast(`Updated ${selectedIds.length} examination(s).`, "ok");
    setSelectedIds([]);
    await loadData();
  };

  const exportExamJson = () => {
    if (!drawerData?.exam) return;
    const payload = {
      name: drawerData.exam.name,
      exam_class: drawerData.exam.exam_class,
      duration: drawerData.exam.duration,
      subject_tag: drawerData.exam.subject_tag,
      sections: drawerData.sections || [],
      questions: drawerData.questions || [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(drawerData.exam.name || "exam").replace(/[^a-z0-9]+/gi, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const counts = useMemo(() => {
    const active = exams.filter((e) => e.active && !e.deactivated).length;
    const deactivated = exams.filter((e) => e.deactivated).length;
    const inactive = exams.length - active - deactivated;
    const scored = exams.filter((e) => e.avg_percentage != null && Number(e.submission_count || 0) > 0);
    const schoolAvg = scored.length
      ? Math.round((scored.reduce((s, e) => s + Number(e.avg_percentage || 0), 0) / scored.length) * 10) / 10
      : 0;
    return { total: exams.length, active, inactive, deactivated, schoolAvg };
  }, [exams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exams.filter((e) => {
      const st = e.deactivated ? "deactivated" : e.active ? "active" : "inactive";
      if (kpiFilter !== "all" && st !== kpiFilter) return false;
      if (classFilter && e.exam_class !== classFilter) return false;
      if (!q) return true;
      return `${e.name} ${e.exam_class} ${e.subject_tag || ""} ${e.teacher_name || ""}`.toLowerCase().includes(q);
    });
  }, [exams, kpiFilter, classFilter, search]);

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="control" crumb="Exam Control Center" school={school}>
        <header className="tc-head ct-animate-rise">
          <div className="tc-head__txt">
            <h1>Exam Control Center</h1>
            <p style={{ margin: "4px 0 0", color: "var(--tc-ink-2)", fontSize: 14 }}>
              Oversight, activation, bulk controls, and live analytics across all examinations.
            </p>
          </div>
          <div className="tc-head__actions">
            <Link className="tc-btn tc-btn--secondary" href="/admin/add-exam">
              <CtIco name="i-plus" className="ct-ico--sm" />
              Add Exam
            </Link>
            <Link className="tc-btn tc-btn--secondary" href="/admin/support">
              <CtIco name="i-activity" className="ct-ico--sm" />
              Live Support
            </Link>
            <button type="button" className="tc-btn tc-btn--secondary" onClick={() => void loadData()}>
              <CtIco name="i-refresh" className="ct-ico--sm" />
              Refresh
            </button>
          </div>
        </header>

        {/* Exact Offline 5-KPI Interactive Filter Strip */}
        <section className="ecc-kpis">
          <button
            type="button"
            className={`ecc-kpi${kpiFilter === "all" ? " is-active" : ""}`}
            onClick={() => setKpiFilter("all")}
          >
            <span className="ecc-kpi__lbl">Total Exams</span>
            <strong className="ecc-kpi__val">{counts.total}</strong>
          </button>
          <button
            type="button"
            className={`ecc-kpi${kpiFilter === "active" ? " is-active" : ""}`}
            onClick={() => setKpiFilter("active")}
          >
            <span className="ecc-kpi__lbl">Active Now</span>
            <strong className="ecc-kpi__val" style={{ color: "var(--ct-ok)" }}>{counts.active}</strong>
          </button>
          <button
            type="button"
            className={`ecc-kpi${kpiFilter === "inactive" ? " is-active" : ""}`}
            onClick={() => setKpiFilter("inactive")}
          >
            <span className="ecc-kpi__lbl">Inactive / Paused</span>
            <strong className="ecc-kpi__val" style={{ color: "var(--ct-warn)" }}>{counts.inactive}</strong>
          </button>
          <button
            type="button"
            className={`ecc-kpi${kpiFilter === "deactivated" ? " is-active" : ""}`}
            onClick={() => setKpiFilter("deactivated")}
          >
            <span className="ecc-kpi__lbl">Deactivated</span>
            <strong className="ecc-kpi__val" style={{ color: "var(--ct-bad)" }}>{counts.deactivated}</strong>
          </button>
          <div className="ecc-kpi" style={{ cursor: "default" }}>
            <span className="ecc-kpi__lbl">School Average</span>
            <strong className="ecc-kpi__val">{counts.schoolAvg}%</strong>
          </div>
        </section>

        {/* Filters Bar */}
        <div className="ecc-bar">
          <label className="tc-search" style={{ flex: 1, minWidth: 210 }}>
            <CtIco name="i-search" className="ct-ico--sm" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exams, teachers, subjects, or classes..."
            />
          </label>
          <select
            className="ad-filter-select"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="">All Classes</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Bulk Actions Bar */}
        {selectedIds.length > 0 && (
          <div className="ecc-bulk is-visible" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <strong>{selectedIds.length} examination(s) selected</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="tc-btn tc-btn--ok tc-btn--sm" onClick={() => void runBulk("activate")}>
                Activate Selected
              </button>
              <button type="button" className="tc-btn tc-btn--secondary tc-btn--sm" onClick={() => void runBulk("deactivate")}>
                Pause Selected
              </button>
              <button type="button" className="tc-btn tc-btn--danger-soft tc-btn--sm" onClick={() => void runBulk("delete")}>
                Delete Selected
              </button>
              <button type="button" className="tc-btn tc-btn--ghost tc-btn--sm" onClick={() => setSelectedIds([])}>
                Clear
              </button>
            </div>
          </div>
        )}

        <section className="tc-card">
          <div className="tc-table-wrap ct-table-wrap">
            {loading ? (
              <div style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>Loading exams...</div>
            ) : filtered.length === 0 ? (
              <div className="tc-empty">
                <strong>No examinations match your filter</strong>
              </div>
            ) : (
              <table className="tc-table ad-dash-table">
                <thead>
                  <tr>
                    <th style={{ width: 38 }}>
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && selectedIds.length === filtered.length}
                        onChange={(e) =>
                          setSelectedIds(e.target.checked ? filtered.map((x) => x.local_id) : [])
                        }
                      />
                    </th>
                    <th>Examination</th>
                    <th>Teacher</th>
                    <th>Class</th>
                    <th className="is-center">Qs</th>
                    <th className="is-center">Time</th>
                    <th className="is-center">Tries</th>
                    <th className="is-center">Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ex) => {
                    const checked = selectedIds.includes(ex.local_id);
                    return (
                      <tr key={ex.local_id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setSelectedIds((prev) =>
                                e.target.checked ? [...prev, ex.local_id] : prev.filter((id) => id !== ex.local_id)
                              )
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => void openDrawer(ex.local_id)}
                            style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", color: "var(--tc-ink)" }}
                          >
                            <strong style={{ display: "block", fontWeight: 650 }}>{ex.name}</strong>
                            <span className="tc-mono" style={{ fontSize: 11.5, color: "var(--tc-ink-3)" }}>
                              {ex.subject_tag || "General"}
                            </span>
                          </button>
                        </td>
                        <td style={{ fontSize: 13 }}>{ex.teacher_name || "Administrator"}</td>
                        <td><span className="tc-pill">{ex.exam_class}</span></td>
                        <td className="tc-mono is-center">{ex.question_count || 0}</td>
                        <td className="tc-mono is-center">{ex.duration}m</td>
                        <td className="tc-mono is-center">{ex.submission_count || 0}</td>
                        <td className="is-center">
                          {ex.deactivated ? (
                            <span className="tc-pill tc-pill--bad">Deactivated</span>
                          ) : ex.active ? (
                            <span className="tc-pill tc-pill--ok"><i className="tc-dot" />Active</span>
                          ) : (
                            <span className="tc-pill"><i className="tc-dot" />Inactive</span>
                          )}
                        </td>
                        <td>
                          <div className="tc-actions">
                            <button
                              type="button"
                              className="tc-btn tc-btn--secondary tc-btn--sm"
                              onClick={() => void openDrawer(ex.local_id)}
                            >
                              Inspect
                            </button>
                            <Link className="tc-btn tc-btn--secondary tc-btn--sm" href={`/admin/exam/${ex.local_id}/preview`}>
                              Preview
                            </Link>
                            {ex.deactivated ? (
                              <button type="button" className="tc-btn tc-btn--ok tc-btn--sm" onClick={() => void reactivate(ex)}>
                                Restore
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className={`tc-btn tc-btn--sm ${ex.active ? "tc-btn--danger-soft" : "tc-btn--ok"}`}
                                  onClick={() => void toggleActive(ex)}
                                >
                                  {ex.active ? "Pause" : "Activate"}
                                </button>
                                <button
                                  type="button"
                                  className="tc-btn tc-btn--ghost tc-btn--icon"
                                  title="Deactivate with audit note"
                                  onClick={() => {
                                    setDeactTarget(ex);
                                    setDeactNote("");
                                  }}
                                >
                                  <CtIco name="i-ban" className="ct-ico--sm" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Exact Offline Slide-Over Inspector Drawer (.ecc-drw) */}
        {drawerExamId !== null && (
          <>
            <div
              className="ecc-drw-scrim is-open"
              style={{ opacity: 1, pointerEvents: "auto" }}
              onClick={() => setDrawerExamId(null)}
            />
            <aside className="ecc-drw is-open" aria-label="Exam Inspector">
              <div className="ecc-drw__head">
                <div>
                  <strong style={{ display: "block", fontSize: 16 }}>
                    {drawerData?.exam?.name || "Inspecting Exam"}
                  </strong>
                  <span style={{ fontSize: 12.5, color: "var(--tc-ink-3)" }}>
                    {drawerData?.exam?.exam_class || ""} · {drawerData?.exam?.duration || 0} min
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="tc-btn tc-btn--secondary tc-btn--sm" onClick={exportExamJson}>
                    <CtIco name="i-download" className="ct-ico--xs" />
                    Export JSON
                  </button>
                  <button
                    type="button"
                    className="ct-iconbtn ct-iconbtn--ghost"
                    onClick={() => setDrawerExamId(null)}
                  >
                    <CtIco name="i-x" className="ct-ico--sm" />
                  </button>
                </div>
              </div>

              <div className="ecc-drw__tabs">
                {(["overview", "students", "questions"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`ecc-drw__tab${drawerTab === tab ? " is-active" : ""}`}
                    onClick={() => setDrawerTab(tab)}
                  >
                    {tab === "overview"
                      ? "Overview"
                      : tab === "students"
                        ? `Students (${(drawerData?.attempts || []).length})`
                        : `Questions (${(drawerData?.questions || []).length})`}
                  </button>
                ))}
              </div>

              <div className="ecc-drw__body">
                {drawerLoading || !drawerData ? (
                  <div style={{ padding: 28, textAlign: "center", color: "var(--tc-ink-3)" }}>Loading details...</div>
                ) : drawerTab === "overview" ? (
                  <>
                    <div className="ecc-ins-grid">
                      <div className="ecc-ins-card">
                        <small>Questions</small>
                        <strong>{(drawerData.questions || []).length}</strong>
                      </div>
                      <div className="ecc-ins-card">
                        <small>Completed</small>
                        <strong>{drawerData.analytics?.completed_count || 0}</strong>
                      </div>
                      <div className="ecc-ins-card">
                        <small>Average</small>
                        <strong>{drawerData.analytics?.avg_score || 0}%</strong>
                      </div>
                      <div className="ecc-ins-card">
                        <small>Pass Rate</small>
                        <strong>{drawerData.analytics?.pass_rate || 0}%</strong>
                      </div>
                    </div>
                    {drawerData.exam?.deactivation_note && (
                      <div className="ed-alert" style={{ marginBottom: 14 }}>
                        <CtIco name="i-alert" className="ct-ico--sm" />
                        <span>Deactivation Note: {drawerData.exam.deactivation_note}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link href={`/admin/exam/${drawerExamId}/preview`} className="tc-btn tc-btn--primary tc-btn--sm">
                        Open Full Paper Preview
                      </Link>
                    </div>
                  </>
                ) : drawerTab === "students" ? (
                  (drawerData.attempts || []).length === 0 ? (
                    <p style={{ color: "var(--tc-ink-3)", fontSize: 13 }}>No student attempts yet.</p>
                  ) : (
                    (drawerData.attempts || []).map((a: any) => (
                      <div key={a.id} className="ecc-stu-row">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ display: "block", fontSize: 13.5 }}>{a.student_name || a.student_username}</strong>
                          <span style={{ fontSize: 12, color: "var(--tc-ink-3)" }}>
                            {a.submitted ? `${a.score}/${a.total} (${Math.round(Number(a.percentage || 0))}%)` : "In progress"}
                          </span>
                        </div>
                        <Link href={`/admin/student/${a.student_local_id}`} className="tc-btn tc-btn--secondary tc-btn--sm">
                          Profile
                        </Link>
                      </div>
                    ))
                  )
                ) : (
                  (drawerData.questions || []).map((q: any, idx: number) => {
                    const opts = [q.option1, q.option2, q.option3, q.option4].filter(Boolean);
                    return (
                      <div key={q.local_id} className="ecc-q-card">
                        <div style={{ fontSize: 11.5, fontFamily: "var(--ct-mono)", color: "var(--tc-ink-3)", marginBottom: 6 }}>
                          Question {idx + 1}
                        </div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>
                          <MathText text={q.question} />
                        </div>
                        {opts.map((o: string, oi: number) => {
                          const isCorr = o.trim() === String(q.answer || "").trim();
                          return (
                            <div key={oi} className={`ecc-q-opt${isCorr ? " is-correct" : ""}`}>
                              <strong>{String.fromCharCode(65 + oi)}.</strong>
                              <span><MathText text={o} /></span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            </aside>
          </>
        )}

        {/* Deactivate Audit Note Modal */}
        {deactTarget && (
          <div
            className="ct-modal-backdrop is-open"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDeactTarget(null);
            }}
          >
            <div className="ct-modal" style={{ maxWidth: 440 }}>
              <div className="ct-m-head">
                <div className="ct-m-copy">
                  <h3>Deactivate &ldquo;{deactTarget.name}&rdquo;</h3>
                  <div className="ct-m-desc">
                    Students will no longer see this exam. Provide an optional audit reason.
                  </div>
                </div>
              </div>
              <div className="ct-m-body">
                <textarea
                  className="ecc-ta"
                  placeholder="Reason for deactivation (recorded in Audit Logs)..."
                  value={deactNote}
                  onChange={(e) => setDeactNote(e.target.value)}
                />
              </div>
              <div className="ct-m-foot" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="tc-btn tc-btn--secondary" onClick={() => setDeactTarget(null)}>
                  Cancel
                </button>
                <button type="button" className="tc-btn tc-btn--danger-soft" onClick={() => void confirmDeactivate()}>
                  Confirm Deactivate
                </button>
              </div>
            </div>
          </div>
        )}
      </AdminShell>
    </div>
  );
}
