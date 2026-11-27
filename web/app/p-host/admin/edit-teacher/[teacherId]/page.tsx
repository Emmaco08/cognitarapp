"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { AdminShell, OfflineSchoolMeta, showCtToast } from "@/components/portal/OfflineShell";

const SPECS = ["General", "Science", "Art", "Commercial"];

export default function AdminEditTeacherPage() {
  const params = useParams();
  const router = useRouter();
  const teacherId = Number(params?.teacherId || 0);

  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [classes, setClasses] = useState<string[]>(["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"]);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [assignments, setAssignments] = useState<Array<{ class_name: string; specialisation: string }>>([]);
  const [classTeacherOf, setClassTeacherOf] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/portal/control", { credentials: "include" }),
      fetch(`/api/v1/portal/roster?single=teacher&local_id=${teacherId}`, { credentials: "include" }),
    ])
      .then(async ([cRes, tRes]) => {
        if (tRes.status === 401 || tRes.status === 403) {
          router.replace("/");
          return;
        }
        const c = cRes.ok ? await cRes.json() : null;
        const t = await tRes.json();
        if (c?.ok) setSchool(c.school);
        if (t?.ok && t.teacher) {
          setClasses(t.classes || classes);
          setUsername(t.teacher.username || "");
          setFullName(t.teacher.full_name || "");
          setClassTeacherOf(t.teacher.class_teacher_of || "");
          const clsList: string[] = Array.isArray(t.teacher.classes_json) && t.teacher.classes_json.length
            ? t.teacher.classes_json
            : t.teacher.primary_class
              ? [t.teacher.primary_class]
              : [""];
          const specList: string[] = Array.isArray(t.teacher.specialisations_json)
            ? t.teacher.specialisations_json
            : ["General"];
          setAssignments(
            clsList.map((cl, idx) => ({
              class_name: cl,
              specialisation: specList[idx] || specList[0] || "General",
            }))
          );
        }
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/v1/portal/roster", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: "teacher",
          local_id: teacherId,
          full_name: fullName.trim(),
          password: password || undefined,
          assignments: assignments.filter((a) => a.class_name),
          class_teacher_of: classTeacherOf,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        showCtToast(json.message || "Could not update teacher.", "bad");
        return;
      }
      showCtToast("Teacher account updated.", "ok");
      router.push("/admin#sec-teachers");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="teachers" crumb={`Edit Teacher · ${fullName || username}`} school={school}>
        <div className="af-shell">
          <header className="tc-head">
            <div className="tc-head__txt">
              <span className="tc-eyebrow">Faculty Account Management</span>
              <h1>Edit Teacher Profile</h1>
              <p>Update class assignments, Form Teacher designation, or reset password for @{username}.</p>
            </div>
            <div className="tc-head__actions">
              <Link href="/admin#sec-teachers" className="tc-btn tc-btn--secondary">
                <CtIco name="i-arrow-left" className="ct-ico--sm" />
                Back to Directory
              </Link>
            </div>
          </header>

          {loading ? (
            <div className="af-card" style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>
              Loading teacher profile...
            </div>
          ) : (
            <section className="af-card">
              <div className="af-head">
                <h2>@{username}</h2>
                <p>Leave password blank to keep the existing login password unchanged.</p>
              </div>
              <form onSubmit={handleSave}>
                <div style={{ padding: 22, display: "grid", gap: 20 }}>
                  <div className="af-grid">
                    <div className="af-field">
                      <label className="af-label"><span>Full Name<span className="af-req">*</span></span></label>
                      <input className="af-input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                    </div>
                    <div className="af-field">
                      <label className="af-label"><span>Reset Password (Optional)</span></label>
                      <input
                        type="password"
                        className="af-input"
                        placeholder="Leave blank to keep current"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="af-assign-box">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <strong style={{ fontSize: 13.5 }}>Teaching Class Assignments</strong>
                      <button
                        type="button"
                        className="tc-btn tc-btn--secondary tc-btn--sm"
                        onClick={() =>
                          setAssignments((prev) => [...prev, { class_name: classes[0] || "", specialisation: "General" }])
                        }
                      >
                        <CtIco name="i-plus" className="ct-ico--xs" />
                        Add Class
                      </button>
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {assignments.map((row, idx) => (
                        <div key={idx} className="af-assign-row">
                          <select
                            className="af-select"
                            value={row.class_name}
                            onChange={(e) =>
                              setAssignments((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, class_name: e.target.value } : r))
                              )
                            }
                          >
                            <option value="">Select class...</option>
                            {classes.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <select
                            className="af-select"
                            value={row.specialisation}
                            onChange={(e) =>
                              setAssignments((prev) =>
                                prev.map((r, i) => (i === idx ? { ...r, specialisation: e.target.value } : r))
                              )
                            }
                          >
                            {SPECS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="tc-btn tc-btn--ghost tc-btn--icon"
                            style={{ color: "var(--tc-bad)" }}
                            onClick={() => setAssignments((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <CtIco name="i-trash" className="ct-ico--sm" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="af-field">
                    <label className="af-label"><span>Form Teacher Assignment</span></label>
                    <select className="af-select" value={classTeacherOf} onChange={(e) => setClassTeacherOf(e.target.value)}>
                      <option value="">Not a Form Teacher</option>
                      {classes.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="af-foot">
                  <Link href="/admin#sec-teachers" className="tc-btn tc-btn--ghost">
                    Cancel
                  </Link>
                  <button type="submit" className="tc-btn tc-btn--primary" disabled={saving}>
                    <CtIco name="i-save" className="ct-ico--sm" />
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      </AdminShell>
    </div>
  );
}
