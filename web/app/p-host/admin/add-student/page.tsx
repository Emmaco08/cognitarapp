"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { AdminShell, OfflineSchoolMeta, showCtToast } from "@/components/portal/OfflineShell";

function strengthLevel(pw: string): number {
  let lvl = 0;
  if (pw.length >= 4) lvl++;
  if (pw.length >= 8) lvl++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) lvl++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) lvl++;
  return lvl;
}

export default function AdminAddStudentPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [classes, setClasses] = useState<string[]>(["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"]);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [userState, setUserState] = useState<"idle" | "checking" | "ok" | "taken">("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [studentClass, setStudentClass] = useState("");
  const [specialisation, setSpecialisation] = useState("General");
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
        if (Array.isArray(json.all_classes) && json.all_classes.length) setClasses(json.all_classes);
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
          `/api/v1/portal/roster?check_username=${encodeURIComponent(val.trim())}&kind=student`,
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
    setSaving(true);
    try {
      const res = await fetch("/api/v1/portal/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: "student",
          full_name: fullName.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
          student_class: studentClass,
          specialisation,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        showCtToast(json.message || "Could not register student.", "bad");
        return;
      }
      showCtToast(json.message || "Student registered.", "ok");
      router.push("/admin#sec-students");
    } finally {
      setSaving(false);
    }
  };

  const lvl = strengthLevel(password);

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="students" crumb="Add Student" school={school}>
        <div className="af-shell" style={{ maxWidth: 780 }}>
          <header className="tc-head">
            <div className="tc-head__txt">
              <span className="tc-eyebrow">Student Enrollment</span>
              <h1>Register New Student</h1>
              <p>Add an approved student directly to the examination roster.</p>
            </div>
            <div className="tc-head__actions">
              <Link href="/admin#sec-students" className="tc-btn tc-btn--secondary">
                <CtIco name="i-arrow-left" className="ct-ico--sm" />
                Students Directory
              </Link>
            </div>
          </header>

          <section className="af-card">
            <div className="af-head">
              <h2>Student Profile &amp; Login Credentials</h2>
              <p>Admin-registered students are approved immediately and can sign in right away.</p>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ padding: 22, display: "grid", gap: 20 }}>
                <div className="af-grid">
                  <div className="af-field af-field--full">
                    <label className="af-label" htmlFor="stuFullName">
                      <span>Full Name<span className="af-req">*</span></span>
                    </label>
                    <div className="af-input-wrap">
                      <span className="af-input-ico"><CtIco name="i-user" className="ct-ico--sm" /></span>
                      <input
                        type="text"
                        id="stuFullName"
                        className="af-input af-input--ico"
                        placeholder="e.g. Chinedu Emmanuel Adeyemi"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="af-field">
                    <label className="af-label" htmlFor="stuUsername">
                      <span>Admission No. / Username<span className="af-req">*</span></span>
                    </label>
                    <div className="af-input-wrap">
                      <span className="af-input-ico"><CtIco name="i-grad" className="ct-ico--sm" /></span>
                      <input
                        type="text"
                        id="stuUsername"
                        className="af-input af-input--ico"
                        placeholder="e.g. MBS/2026/041"
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
                            : "Unique identifier used for exam sign-in."}
                    </span>
                  </div>

                  <div className="af-field">
                    <label className="af-label" htmlFor="stuPassword">
                      <span>Password<span className="af-req">*</span></span>
                      <span style={{ fontSize: 11.5, color: "var(--tc-ink-3)" }}>
                        {["", "Weak", "Fair", "Good", "Strong"][lvl]}
                      </span>
                    </label>
                    <div className="af-input-wrap">
                      <span className="af-input-ico"><CtIco name="i-lock" className="ct-ico--sm" /></span>
                      <input
                        type={showPw ? "text" : "password"}
                        id="stuPassword"
                        className="af-input af-input--ico af-input--trail"
                        placeholder="Create login password"
                        minLength={4}
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

                  <div className="af-field">
                    <label className="af-label" htmlFor="stuClass">
                      <span>Class<span className="af-req">*</span></span>
                    </label>
                    <select
                      id="stuClass"
                      className="af-select"
                      value={studentClass}
                      onChange={(e) => setStudentClass(e.target.value)}
                      required
                    >
                      <option value="">Select class...</option>
                      {classes.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="af-field">
                    <label className="af-label" htmlFor="stuSpec">
                      <span>Academic Track / Specialisation</span>
                    </label>
                    <select
                      id="stuSpec"
                      className="af-select"
                      value={specialisation}
                      onChange={(e) => setSpecialisation(e.target.value)}
                    >
                      <option value="General">General (All core subjects)</option>
                      <option value="Science">Science</option>
                      <option value="Art">Art</option>
                      <option value="Commercial">Commercial</option>
                    </select>
                    <span className="af-help">Filters track-specific examinations automatically.</span>
                  </div>

                  <div className="af-field af-field--full">
                    <label className="af-label" htmlFor="stuEmail">
                      <span>Email Address (Optional)</span>
                    </label>
                    <input
                      id="stuEmail"
                      type="email"
                      className="af-input"
                      placeholder="student@school.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="af-foot">
                <Link href="/admin#sec-students" className="tc-btn tc-btn--ghost">
                  Cancel
                </Link>
                <button
                  type="submit"
                  className="tc-btn tc-btn--primary"
                  disabled={saving || userState === "taken"}
                >
                  <CtIco name="i-check-circle" className="ct-ico--sm" />
                  {saving ? "Registering..." : "Register Student"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </AdminShell>
    </div>
  );
}
