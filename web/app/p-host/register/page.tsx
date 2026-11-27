"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CT_ICONS_URL, CtIco, CtThemeToggle } from "@/components/portal/CtIco";

const SENIOR_PATTERNS = ["ss 1", "ss 2", "ss 3", "ss1", "ss2", "ss3", "sss", "grade 10", "grade 11", "grade 12", "year 10", "year 11", "year 12"];

function isSeniorClass(cls: string): boolean {
  const low = cls.trim().toLowerCase();
  return SENIOR_PATTERNS.some((p) => low.includes(p));
}

function RegisterInner() {
  const searchParams = useSearchParams();
  const [schoolCode, setSchoolCode] = useState("");
  const [schoolName, setSchoolName] = useState("CogniTara School");
  const [classes, setClasses] = useState<string[]>(["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"]);
  const [schoolErr, setSchoolErr] = useState("");

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameState, setUsernameState] = useState<"idle" | "checking" | "ok" | "taken">("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [studentClass, setStudentClass] = useState("");
  const [specialisation, setSpecialisation] = useState("General");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let code = (searchParams.get("code") || searchParams.get("school") || "").trim().toUpperCase();
    if (!code) {
      try {
        code = (localStorage.getItem("ct_portal_last_school_code") || "").trim().toUpperCase();
      } catch {
        // ignore
      }
    }
    setSchoolCode(code);
    if (!code) {
      setSchoolErr("Enter your School ID on the sign-in screen first.");
      return;
    }
    fetch(`/api/v1/portal/register?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && d.school) {
          setSchoolName(d.school.school_name || "CogniTara School");
          if (Array.isArray(d.school.classes) && d.school.classes.length) {
            setClasses(d.school.classes);
          }
          if (!d.school.online_portal_enabled || !d.school.online_students_enabled) {
            setSchoolErr("Student online registration is currently paused by your administrator.");
          }
        } else {
          setSchoolErr(d?.message || "School ID not found.");
        }
      })
      .catch(() => setSchoolErr("Could not verify school right now."));
  }, [searchParams]);

  const checkUsernameLive = (val: string) => {
    setUsername(val);
    if (checkTimer.current) clearTimeout(checkTimer.current);
    const clean = val.trim();
    if (clean.length < 3 || !schoolCode) {
      setUsernameState("idle");
      return;
    }
    setUsernameState("checking");
    checkTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/portal/register?code=${encodeURIComponent(schoolCode)}&username=${encodeURIComponent(clean)}`
        );
        const data = await res.json().catch(() => ({}));
        setUsernameState(data.available ? "ok" : "taken");
      } catch {
        setUsernameState("idle");
      }
    }, 320);
  };

  const okLen = password.length >= 8;
  const okUp = /[A-Z]/.test(password);
  const okLo = /[a-z]/.test(password);
  const okNum = /[0-9]/.test(password);
  const pwValid = okLen && okUp && okLo && okNum;
  const confirmValid = Boolean(confirmPassword) && confirmPassword === password && pwValid;
  const showSpec = isSeniorClass(studentClass);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!schoolCode) {
      setErr("School ID is required.");
      return;
    }
    if (usernameState === "taken") {
      setErr("Username already exists. Choose another username.");
      return;
    }
    if (!pwValid) {
      setErr("Complete all 4 password requirements.");
      return;
    }
    if (!confirmValid) {
      setErr("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/portal/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_code: schoolCode,
          full_name: fullName.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
          student_class: studentClass,
          specialisation: showSpec ? specialisation : "General",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErr(data.message || "Could not submit registration.");
        return;
      }
      setDone(true);
    } catch {
      setErr("Connection error while submitting registration.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ed-body">
      <div className="ed-grain" aria-hidden="true" />

      <div className="ed-auth">
        {/* Framed Editorial Study Photograph */}
        <aside className="ed-gallery" aria-label="Student Registration">
          <img className="ed-gallery__img" src="/images/auth-editorial-register.jpg" alt="" />
          <div className="ed-gallery__scrim" aria-hidden="true" />

          <div className="ed-gallery__top">
            <Link className="ed-gallery__brand" href={schoolCode ? `/?code=${encodeURIComponent(schoolCode)}` : "/"}>
              <span className="ed-brand__mark" style={{ width: 26, height: 26, borderRadius: 7 }}>
                <svg viewBox="0 0 200 200">
                  <use href={`${CT_ICONS_URL}#ct-mark`} />
                </svg>
              </span>
              <strong>CogniTara</strong>
            </Link>
            <span className="ed-gallery__tag">Student Enrollment</span>
          </div>

          <div className="ed-gallery__caption">
            <span className="ed-gallery__caption-eyebrow">{schoolName}</span>
            <h2>One verified profile for every exam this session.</h2>
            <p>
              Submit your details once. After your school administrator approves your profile, you can sit scheduled papers and review released results.
            </p>
          </div>
        </aside>

        {/* Elevated Registration Surface */}
        <main className="ed-pane" style={{ overflowY: "auto" }}>
          <div className="ed-pane__top">
            <Link className="ed-back" href={schoolCode ? `/?code=${encodeURIComponent(schoolCode)}` : "/"}>
              <CtIco name="i-arrow-left" className="ct-ico--sm" />
              <span>Sign in</span>
            </Link>
            <CtThemeToggle variant="ed" />
          </div>

          <div className="ed-pane__center">
            <section className="ed-form-card ed-form-card--wide" aria-label="Student registration">
              <div className="ed-school-row">
                <div className="ed-crest">
                  <CtIco name="i-grad" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h1>Create student account</h1>
                  <p>{schoolName} · Accounts activate after admin approval</p>
                </div>
              </div>

              {done ? (
                <div style={{ display: "grid", gap: 16, padding: "12px 0" }}>
                  <div
                    className="ed-alert"
                    style={{
                      background: "var(--ed-surface-2)",
                      borderColor: "var(--ed-border-2)",
                      color: "var(--ed-ink)",
                    }}
                  >
                    <CtIco name="i-check-circle" className="ct-ico--sm" />
                    <span>
                      Registration submitted for <strong>{fullName}</strong> (@{username}). Your administrator will approve your account before you can sign in.
                    </span>
                  </div>
                  <Link
                    href={schoolCode ? `/?code=${encodeURIComponent(schoolCode)}` : "/"}
                    className="ed-submit"
                    style={{ textDecoration: "none" }}
                  >
                    <span>Return to Sign In</span>
                    <CtIco name="i-arrow-right" className="ct-ico--sm" />
                  </Link>
                </div>
              ) : (
                <>
                  {(err || schoolErr) && (
                    <div className="ed-alert" role="alert">
                      <CtIco name="i-alert" className="ct-ico--sm" />
                      <span>{err || schoolErr}</span>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="ed-fields">
                    <div className="ed-row-2">
                      <div className="ed-field">
                        <label className="ed-label" htmlFor="full_name">Full name</label>
                        <div className="ed-input-box">
                          <CtIco name="i-user" />
                          <input
                            type="text"
                            id="full_name"
                            className="ed-input"
                            placeholder="Ada Okafor"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <div className="ed-field">
                        <label className="ed-label" htmlFor="username">Username</label>
                        <div className="ed-input-box">
                          <CtIco name="i-grad" />
                          <input
                            type="text"
                            id="username"
                            className="ed-input"
                            placeholder="ada.okafor"
                            value={username}
                            onChange={(e) => checkUsernameLive(e.target.value)}
                            required
                            autoComplete="username"
                          />
                        </div>
                        {usernameState !== "idle" && (
                          <div
                            className={`ed-status ${
                              usernameState === "ok" ? "valid" : usernameState === "taken" ? "invalid" : ""
                            }`}
                          >
                            {usernameState === "checking"
                              ? "Checking availability..."
                              : usernameState === "ok"
                                ? "Username available"
                                : "Username already exists"}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="ed-field">
                      <label className="ed-label" htmlFor="email">Email address</label>
                      <div className="ed-input-box">
                        <CtIco name="i-mail" />
                        <input
                          type="email"
                          id="email"
                          className="ed-input"
                          placeholder="student@school.edu"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="ed-row-2">
                      <div className="ed-field">
                        <label className="ed-label" htmlFor="password">Password</label>
                        <div className="ed-input-box">
                          <CtIco name="i-lock" />
                          <input
                            type={showPw ? "text" : "password"}
                            id="password"
                            className="ed-input ed-input--trail"
                            placeholder="Create password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            className="ed-eye"
                            onClick={() => setShowPw((v) => !v)}
                            aria-label="Toggle password"
                          >
                            <CtIco name={showPw ? "i-eye-off" : "i-eye"} className="ct-ico--sm" />
                          </button>
                        </div>
                        {password.length > 0 && (
                          <div className={`ed-status ${pwValid ? "valid" : "invalid"}`}>
                            {pwValid ? "Strong password" : "Complete all 4 requirements"}
                          </div>
                        )}
                      </div>

                      <div className="ed-field">
                        <label className="ed-label" htmlFor="confirm_password">Confirm password</label>
                        <div className="ed-input-box">
                          <CtIco name="i-check-circle" />
                          <input
                            type={showConfirm ? "text" : "password"}
                            id="confirm_password"
                            className="ed-input ed-input--trail"
                            placeholder="Repeat password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            className="ed-eye"
                            onClick={() => setShowConfirm((v) => !v)}
                            aria-label="Toggle confirm password"
                          >
                            <CtIco name={showConfirm ? "i-eye-off" : "i-eye"} className="ct-ico--sm" />
                          </button>
                        </div>
                        {confirmPassword.length > 0 && (
                          <div className={`ed-status ${confirmValid ? "valid" : "invalid"}`}>
                            {confirmPassword !== password
                              ? "Passwords do not match"
                              : pwValid
                                ? "Passwords match"
                                : "Meet password rules first"}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="ed-reqs">
                      <span className={`ed-req ${password ? (okLen ? "valid" : "invalid") : ""}`}>
                        {okLen ? "✓ " : ""}8+ chars
                      </span>
                      <span className={`ed-req ${password ? (okUp ? "valid" : "invalid") : ""}`}>
                        {okUp ? "✓ " : ""}Uppercase
                      </span>
                      <span className={`ed-req ${password ? (okLo ? "valid" : "invalid") : ""}`}>
                        {okLo ? "✓ " : ""}Lowercase
                      </span>
                      <span className={`ed-req ${password ? (okNum ? "valid" : "invalid") : ""}`}>
                        {okNum ? "✓ " : ""}Number
                      </span>
                    </div>

                    <div className="ed-row-2">
                      <div className="ed-field">
                        <label className="ed-label" htmlFor="classSelect">Class</label>
                        <select
                          id="classSelect"
                          className="ed-select"
                          value={studentClass}
                          onChange={(e) => setStudentClass(e.target.value)}
                          required
                        >
                          <option value="">Select Class</option>
                          {classes.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      {showSpec && (
                        <div className="ed-field">
                          <label className="ed-label" htmlFor="specialisationSelect">Specialisation</label>
                          <select
                            id="specialisationSelect"
                            className="ed-select"
                            value={specialisation}
                            onChange={(e) => setSpecialisation(e.target.value)}
                          >
                            <option value="General">General</option>
                            <option value="Science">Science</option>
                            <option value="Art">Art</option>
                            <option value="Commercial">Commercial</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      className="ed-submit"
                      disabled={busy || Boolean(schoolErr) || usernameState === "taken"}
                    >
                      <span>{busy ? "Creating account..." : "Create account"}</span>
                      <CtIco name="i-arrow-right" className="ct-ico--sm" />
                    </button>
                  </form>

                  <div className="ed-card-links" style={{ justifyContent: "center" }}>
                    <Link href={schoolCode ? `/?code=${encodeURIComponent(schoolCode)}` : "/"}>
                      <CtIco name="i-login" className="ct-ico--sm" />
                      <span>Already have an account? Sign in</span>
                    </Link>
                  </div>
                </>
              )}
            </section>
          </div>

          <footer className="ed-pane__foot">
            <span>CogniTara Online Examination Server</span>
            <span>{schoolCode ? `School ID ${schoolCode}` : "Student Enrollment"}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default function StudentRegisterPage() {
  return (
    <Suspense fallback={<div className="ed-body" style={{ minHeight: "100vh" }} />}>
      <RegisterInner />
    </Suspense>
  );
}
