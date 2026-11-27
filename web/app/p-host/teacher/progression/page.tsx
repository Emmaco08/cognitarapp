"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { OfflineSchoolMeta, showCtToast, TeacherShell } from "@/components/portal/OfflineShell";

interface StudentRow {
  local_id: number;
  username: string;
  full_name: string;
  student_class: string;
  specialisation?: string;
  status: string;
}

interface RowDecision {
  selected: boolean;
  action: "promote" | "retain" | "graduate";
  target_class: string;
  specialisation: string;
}

export default function TeacherProgressionPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [assignedClass, setAssignedClass] = useState("");
  const [classes, setClasses] = useState<string[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [decisions, setDecisions] = useState<Record<number, RowDecision>>({});
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [mRes, rRes] = await Promise.all([
        fetch("/api/v1/portal/exams", { credentials: "include" }),
        fetch("/api/v1/portal/roster", { credentials: "include" }),
      ]);
      if (rRes.status === 401 || rRes.status === 403) {
        router.replace("/");
        return;
      }
      const m = mRes.ok ? await mRes.json() : null;
      const r = await rRes.json();
      if (m?.ok) {
        setSchool(m.school);
        setTeacherName(m.teacher?.full_name || m.teacher?.username || "Teacher");
      }
      const allCls: string[] = m?.all_classes || r?.classes || ["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"];
      setClasses(allCls);
      const formCls = m?.teacher?.class_teacher_of || m?.teacher?.primary_class || allCls[0] || "";
      setAssignedClass(formCls);

      const approved: StudentRow[] = (r?.students || []).filter(
        (s: StudentRow) => s.status === "approved" && (!formCls || s.student_class === formCls)
      );
      setStudents(approved);

      const curIdx = allCls.indexOf(formCls);
      const nextCls = curIdx >= 0 && curIdx < allCls.length - 1 ? allCls[curIdx + 1] : "Graduated";
      const init: Record<number, RowDecision> = {};
      for (const st of approved) {
        init[st.local_id] = {
          selected: true,
          action: nextCls === "Graduated" ? "graduate" : "promote",
          target_class: nextCls,
          specialisation: st.specialisation || "General",
        };
      }
      setDecisions(init);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const setAllAction = (action: "promote" | "retain") => {
    const curIdx = classes.indexOf(assignedClass);
    const nextCls = curIdx >= 0 && curIdx < classes.length - 1 ? classes[curIdx + 1] : assignedClass;
    setDecisions((prev) => {
      const next = { ...prev };
      for (const st of students) {
        next[st.local_id] = {
          ...(next[st.local_id] || { selected: true, specialisation: st.specialisation || "General" }),
          action,
          target_class: action === "retain" ? st.student_class : nextCls,
        };
      }
      return next;
    });
  };

  const summary = useMemo(() => {
    let total = 0;
    let promote = 0;
    let retain = 0;
    let graduate = 0;
    for (const st of students) {
      const d = decisions[st.local_id];
      if (!d?.selected) continue;
      total++;
      if (d.action === "promote") promote++;
      else if (d.action === "retain") retain++;
      else graduate++;
    }
    return { total, promote, retain, graduate };
  }, [students, decisions]);

  const executeProgression = async () => {
    const updates = students
      .filter((st) => decisions[st.local_id]?.selected)
      .map((st) => {
        const d = decisions[st.local_id];
        return {
          student_local_id: st.local_id,
          decision: d.action === "retain" ? "retain" : "promote",
          target_class: d.action === "retain" ? st.student_class : d.action === "graduate" ? "Graduated" : d.target_class,
          specialisation: d.specialisation || "General",
        };
      });
    if (!updates.length) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/portal/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "promote_students", updates }),
      });
      const json = await res.json();
      if (json.ok) {
        showCtToast(json.message || `Updated ${updates.length} student records.`, "ok");
        setReviewOpen(false);
        await loadData();
      } else {
        showCtToast(json.message || "Progression update failed.", "bad");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ct-app tc-studio">
      <TeacherShell active="progression" crumb="Student Progression" school={school} username={teacherName}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">
              Class Teacher Workspace · Session {school?.academic_session || "2026/2027"}
            </span>
            <h1>Promotion Roster · {assignedClass || "Assigned Class"}</h1>
            <p>Assign end-of-session promotions, retentions, or Senior Secondary streams. Past transcripts remain preserved.</p>
          </div>
          <div className="tc-head__actions">
            <Link href="/teacher" className="tc-btn tc-btn--secondary">
              <CtIco name="i-arrow-left" className="ct-ico--sm" />
              Dashboard
            </Link>
            <button
              type="button"
              className="tc-btn tc-btn--primary"
              disabled={summary.total === 0}
              onClick={() => setReviewOpen(true)}
            >
              <CtIco name="i-check-circle" className="ct-ico--sm" />
              Review &amp; Execute Promotion
            </button>
          </div>
        </header>

        <section className="tc-kpi-strip">
          <div className="tc-kpi">
            <span className="tc-kpi__label">Eligible Students</span>
            <strong className="tc-kpi__val">{students.length}</strong>
            <span className="tc-kpi__meta">Approved in {assignedClass || "class"}</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Selected to Promote</span>
            <strong className="tc-kpi__val">{summary.promote}</strong>
            <span className="tc-kpi__meta">Moving to next arm</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Retaining</span>
            <strong className="tc-kpi__val">{summary.retain}</strong>
            <span className="tc-kpi__meta">Remaining in current arm</span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Graduating</span>
            <strong className="tc-kpi__val">{summary.graduate}</strong>
            <span className="tc-kpi__meta">Alumni transition</span>
          </div>
        </section>

        <section className="tc-card">
          <div className="tc-toolbar">
            <div className="tc-filters__group">
              <button type="button" className="tc-btn tc-btn--secondary tc-btn--sm" onClick={() => setAllAction("promote")}>
                Set All: Promote
              </button>
              <button type="button" className="tc-btn tc-btn--secondary tc-btn--sm" onClick={() => setAllAction("retain")}>
                Set All: Retain
              </button>
            </div>
            <span className="tc-pill tc-pill--ok">
              <CtIco name="i-shield" className="ct-ico--xs" />
              Non-Destructive Audit Active
            </span>
          </div>

          {loading ? (
            <div style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>Loading student roster...</div>
          ) : students.length === 0 ? (
            <div className="tc-empty">
              <span className="tc-empty__ico">
                <CtIco name="i-users" />
              </span>
              <strong>No approved students in {assignedClass || "your assigned class"}</strong>
              <p>Approved students enrolled in your assigned class will appear here for progression.</p>
            </div>
          ) : (
            <div className="tc-table-wrap">
              <table className="tc-table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }} />
                    <th>Student</th>
                    <th>Current Class</th>
                    <th>Action Decision</th>
                    <th>Target Destination</th>
                    <th>Specialisation</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((st) => {
                    const d = decisions[st.local_id] || {
                      selected: true,
                      action: "promote" as const,
                      target_class: st.student_class,
                      specialisation: st.specialisation || "General",
                    };
                    return (
                      <tr key={st.local_id}>
                        <td>
                          <input
                            type="checkbox"
                            className="tc-check"
                            checked={d.selected}
                            onChange={(e) =>
                              setDecisions((p) => ({
                                ...p,
                                [st.local_id]: { ...d, selected: e.target.checked },
                              }))
                            }
                          />
                        </td>
                        <td>
                          <strong style={{ display: "block" }}>{st.full_name}</strong>
                          <span className="tc-mono" style={{ fontSize: 11.5, color: "var(--tc-ink-3)" }}>
                            @{st.username}
                          </span>
                        </td>
                        <td>
                          <span className="tc-pill">{st.student_class}</span>
                        </td>
                        <td>
                          <select
                            className="tc-select"
                            style={{ height: 34, fontSize: 12.5 }}
                            value={d.action}
                            onChange={(e) =>
                              setDecisions((p) => ({
                                ...p,
                                [st.local_id]: {
                                  ...d,
                                  action: e.target.value as "promote" | "retain" | "graduate",
                                },
                              }))
                            }
                          >
                            <option value="promote">Promote to Next</option>
                            <option value="retain">Retain in Current</option>
                            <option value="graduate">Graduate (Alumni)</option>
                          </select>
                        </td>
                        <td>
                          <select
                            className="tc-select"
                            style={{ height: 34, fontSize: 12.5 }}
                            value={d.target_class}
                            disabled={d.action !== "promote"}
                            onChange={(e) =>
                              setDecisions((p) => ({
                                ...p,
                                [st.local_id]: { ...d, target_class: e.target.value },
                              }))
                            }
                          >
                            {classes.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                            <option value="Graduated">Graduated</option>
                          </select>
                        </td>
                        <td>
                          <select
                            className="tc-select"
                            style={{ height: 34, fontSize: 12.5 }}
                            value={d.specialisation}
                            onChange={(e) =>
                              setDecisions((p) => ({
                                ...p,
                                [st.local_id]: { ...d, specialisation: e.target.value },
                              }))
                            }
                          >
                            <option value="General">General</option>
                            <option value="Science">Science</option>
                            <option value="Art">Arts / Humanities</option>
                            <option value="Commercial">Commercial / Business</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {reviewOpen && (
          <div
            className="ct-modal-backdrop is-open"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget) setReviewOpen(false);
            }}
          >
            <div className="ct-modal ct-confirm-modal" data-tone="ok" style={{ maxWidth: 460 }}>
              <div className="ct-m-head">
                <div className="ct-m-copy">
                  <h3>Confirm academic progression</h3>
                  <div className="ct-m-desc">
                    Historical examination scripts and scores remain permanently archived.
                  </div>
                </div>
                <button
                  type="button"
                  className="ct-iconbtn ct-iconbtn--ghost ct-modal__close"
                  onClick={() => setReviewOpen(false)}
                >
                  <CtIco name="i-x" className="ct-ico--sm" />
                </button>
              </div>
              <div className="ct-m-body">
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: "var(--ct-surface-2)",
                    border: "1px solid var(--ct-border)",
                    display: "grid",
                    gap: 8,
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Total selected</span>
                    <strong className="tc-mono">{summary.total}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Promoting</span>
                    <strong className="tc-mono">{summary.promote}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Retaining</span>
                    <strong className="tc-mono">{summary.retain}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Graduating</span>
                    <strong className="tc-mono">{summary.graduate}</strong>
                  </div>
                </div>
              </div>
              <div className="ct-m-foot" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="tc-btn tc-btn--secondary" onClick={() => setReviewOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="tc-btn tc-btn--primary"
                  disabled={submitting}
                  onClick={() => void executeProgression()}
                >
                  {submitting ? "Executing..." : "Confirm Progression"}
                </button>
              </div>
            </div>
          </div>
        )}
      </TeacherShell>
    </div>
  );
}
