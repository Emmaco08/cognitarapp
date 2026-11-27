"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { AdminShell, OfflineSchoolMeta, showCtToast } from "@/components/portal/OfflineShell";

const SPECS = ["General", "Science", "Art", "Commercial"];

function strengthLevel(pw: string): number {
  let lvl = 0;
  if (pw.length >= 6) lvl++;
  if (pw.length >= 10) lvl++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) lvl++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) lvl++;
  return lvl;
}

export default function AdminAddTeacherPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [classes, setClasses] = useState<string[]>(["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"]);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [userState, setUserState] = useState<"idle" | "checking" | "ok" | "taken">("idle");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [assignments, setAssignments] = useState<Array<{ class_name: string; specialisation: string }>>([
    { class_name: "", specialisation: "General" },
  ]);
  const [classTeacherOf, setClassTeacherOf] = useState("");
  const [saving, setSaving] = useState(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/v1/portal/exams", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          router.replace("/");
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (!json?.ok) return;
        setSchool(json.school);
        if (Array.isArray(json.all_classes) && json.all_classes.length) {
          setClasses(json.all_classes);
          setAssignments([{ class_name: json.all_classes[0], specialisation: "General" }]);
        }
      })
      .catch(() => {});
  }, [router]);

  const onUsernameChange = (val: string) => {
    setUsername(val);
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (val.trim().length < 3) {
      setUserState("idle");
      return;
    }
    setUserState("checking");
    checkTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/portal/roster?check_username=${encodeURIComponent(val.trim())}&kind=teacher`,
          { credentials: "include" }
        );
        const json = await res.json();
        setUserState(json.available ? "ok" : "taken");
      } catch {
        setUserState("idle");
      }
    }, 280);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userState === "taken") {
      showCtToast("That username already exists.", "bad");
      return;
    }
    const validAssign = assignments.filter((a) => a.class_name);
    if (!validAssign.length) {
      showCtToast("Assign at least one teaching class.", "bad");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/portal/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: "teacher",
          full_name: fullName.trim(),
          username: username.trim(),
          password,
          assignments: validAssign,
          class_teacher_of: classTeacherOf,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        showCtToast(json.message || "Could not create teacher.", "bad");
        return;
      }
      showCtToast(json.message || "Teacher account created.", "ok");
      router.push("/admin#sec-teachers");
    } finally {
      setSaving(false);
    }
  };

  const lvl = strengthLevel(password);

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="teachers" crumb="Add Teacher" school={school}>
        <div className="af-shell">
          <header className="tc-head">
            <div className="tc-head__txt">
              <span className="tc-eyebrow">Faculty Registration</span>
              <h1>Add New Teacher</h1>
              <p>Create a faculty login, assign teaching classes and tracks, and optionally set a Form Teacher arm.</p>
            </div>
            <div className="tc-head__actions">
              <Link href="/admin#sec-teachers" className="tc-btn tc-btn--secondary">
                <CtIco name="i-arrow-left" className="ct-ico--sm" />
                Teachers Directory
              </Link>
            </div>
          </header>

          <section className="af-card">
            <div className="af-head">
              <h2>Teacher Account Details</h2>
              <p>Teachers use these credentials to author exams, view analytics, and run live support.</p>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ padding: 22, display: "grid", gap: 20 }}>
                <div className="af-grid">
                  <div className="af-field af-field--full">
                    <label className="af-label" htmlFor="teacherFullName">
                      <span>Full Name<span className="af-req">*</span></span>
                    </label>
                    <div className="af-input-wrap">
                      <span className="af-input-ico"><CtIco name="i-user" className="ct-ico--sm" /></span>
                      <input
                        type="text"
                        id="teacherFullName"
                        className="af-input af-input--ico"
                        placeholder="e.g. Mrs. Grace Okonkwo"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                    <span className="af-help">Displayed across exams, live proctoring, and analytics reports.</span>
                  </div>

                  <div className="af-field">
                    <label className="af-label" htmlFor="teacherUsername">
                      <span>Login Username<span className="af-req">*</span></span>
                    </label>
                    <div className="af-input-wrap">
                      <span className="af-input-ico"><CtIco name="i-teacher" className="ct-ico--sm" /></span>
                      <input
                        type="text"
                        id="teacherUsername"
                        className="af-input af-input--ico"
                        placeholder="e.g. grace_okonkwo"
                        minLength={3}
                        value={username}
                        onChange={(e) => onUsernameChange(e.target.value)}
                        required
                      />
                    </div>
                    <span
                      className={`af-help ${
                        userState === "ok" ? "af-help--ok" : userState === "taken" ? "af-help--bad" : ""
                      }`}
                    >
                      {userState === "checking"
                        ? "Checking availability..."
                        : userState === "ok"
                          ? "Username is available."
                          : userState === "taken"
                            ? "This username already exists."
                            : "Minimum 3 characters, unique across teachers."}
                    </span>
                  </div>

                  <div className="af-field">
                    <label className="af-label" htmlFor="teacherPassword">
                      <span>Password<span className="af-req">*</span></span>
                      <span style={{ fontSize: 11.5, color: "var(--tc-ink-3)" }}>
                        {["", "Weak", "Fair", "Good", "Strong"][lvl]}
                      </span>
                    </label>
                    <div className="af-input-wrap">
                      <span className="af-input-ico"><CtIco name="i-lock" className="ct-ico--sm" /></span>
                      <input
                        type={showPw ? "text" : "password"}
                        id="teacherPassword"
                        className="af-input af-input--ico af-input--trail"
                        placeholder="Minimum 6 characters"
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className="af-eye"
                        onClick={() => setShowPw((v) => !v)}
                        aria-label="Toggle password visibility"
                      >
                        <CtIco name={showPw ? "i-eye-off" : "i-eye"} className="ct-ico--sm" />
                      </button>
                    </div>
                    <div className="af-strength" data-level={lvl} aria-hidden="true">
                      <span /><span /><span /><span />
                    </div>
                  </div>
                </div>

                {/* Multi-row Teaching Class Assignments */}
                <div className="af-assign-box">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <strong style={{ display: "block", fontSize: 13.5, color: "var(--tc-ink)" }}>
                        Teaching Class Assignments
                      </strong>
                      <span className="af-help">
                        Choose the classes and tracks this teacher will author exams for. General covers all tracks.
                      </span>
                    </div>
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
                          required
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
                          onClick={() => {
                            if (assignments.length <= 1) {
                              showCtToast("Keep at least one teaching class assignment.", "warn");
                              return;
                            }
                            setAssignments((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          aria-label="Remove assignment"
                        >
                          <CtIco name="i-trash" className="ct-ico--sm" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="af-field">
                  <label className="af-label" htmlFor="classTeacherSelect">
                    <span>Form Teacher / Class Teacher Assignment</span>
                    <span className="tc-pill">Optional</span>
                  </label>
                  <select
                    id="classTeacherSelect"
                    className="af-select"
                    value={classTeacherOf}
                    onChange={(e) => setClassTeacherOf(e.target.value)}
                  >
                    <option value="">Not a Form Teacher</option>
                    {classes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <span className="af-help">
                    Grants Student Progression access and full read-only result visibility for that class.
                  </span>
                </div>
              </div>

              <div className="af-foot">
                <Link href="/admin#sec-teachers" className="tc-btn tc-btn--ghost">
                  Cancel
                </Link>
                <button
                  type="submit"
                  className="tc-btn tc-btn--primary"
                  disabled={saving || userState === "taken"}
                >
                  <CtIco name="i-check-circle" className="ct-ico--sm" />
                  {saving ? "Creating..." : "Create Teacher Account"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </AdminShell>
    </div>
  );
}
