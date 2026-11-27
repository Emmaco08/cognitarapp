"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CT_ICONS_URL, CtIco, CtThemeToggle, getInitials } from "@/components/portal/CtIco";

interface ResolvedSchool {
  school_code: string;
  school_name: string;
  school_motto: string;
  academic_session: string;
  current_term: string;
  online_portal_enabled: boolean;
  online_teachers_enabled: boolean;
  online_students_enabled: boolean;
  online_portal_notice: string;
  synced: boolean;
  online_synced_at: string | null;
}

const LAST_SCHOOL_KEY = "ct_portal_last_school_code";

function PortalGatewayInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [codeInput, setCodeInput] = useState("");
  const [school, setSchool] = useState<ResolvedSchool | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveErr, setResolveErr] = useState("");

  // Super Admin Forgot School ID mode
  const [recoverMode, setRecoverMode] = useState(false);
  const [recoverEmail, setRecoverEmail] = useState("");
  const [recoverBusy, setRecoverBusy] = useState(false);
  const [recoverMsg, setRecoverMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [role, setRole] = useState<"student" | "teacher" | "admin">("student");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginErr, setLoginErr] = useState("");

  const [activeSession, setActiveSession] = useState<{
    role: string;
    fullName: string;
    schoolCode: string;
    schoolName: string;
  } | null>(null);

  async function resolveSchool(rawCode: string, silent = false) {
    const clean = rawCode.trim().toUpperCase();
    if (!clean) {
      if (!silent) setResolveErr("Enter your School ID to continue.");
      return;
    }
    setResolving(true);
    setResolveErr("");
    setLoginErr("");
    try {
      const res = await fetch(`/api/v1/portal/resolve?code=${encodeURIComponent(clean)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (!silent) {
          setResolveErr(data.message || "School ID not found. Verify the code with your administrator.");
        }
        setSchool(null);
        return;
      }
      const s: ResolvedSchool = data.school;
      setSchool(s);
      setRecoverMode(false);
      setCodeInput(s.school_code);
      try {
        localStorage.setItem(LAST_SCHOOL_KEY, s.school_code);
      } catch {
        // ignore
      }

      const qRole = (searchParams.get("role") || "").toLowerCase();
      if (qRole === "admin") setRole("admin");
      else if (qRole === "teacher") setRole("teacher");
      else if (!s.online_portal_enabled) setRole("admin");
      else if (!s.online_students_enabled && s.online_teachers_enabled) setRole("teacher");
      else if (!s.online_students_enabled && !s.online_teachers_enabled) setRole("admin");
      else setRole("student");
    } catch {
      if (!silent) setResolveErr("Could not connect right now. Try again shortly.");
    } finally {
      setResolving(false);
    }
  }

  useEffect(() => {
    fetch("/api/v1/portal/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.authenticated && d.session) {
          setActiveSession({
            role: String(d.session.role),
            fullName: String(d.session.fullName || d.session.username),
            schoolCode: String(d.session.schoolCode),
            schoolName: String(d.school?.school_name || ""),
          });
        }
      })
      .catch(() => {});

    let qp = (searchParams.get("school") || searchParams.get("code") || "").trim().toUpperCase();
    if (!qp && typeof window !== "undefined") {
      const m = window.location.pathname.match(/^\/s\/([^/?#]+)/i);
      if (m && m[1]) {
        try {
          qp = decodeURIComponent(m[1]).trim().toUpperCase();
        } catch {
          qp = m[1].trim().toUpperCase();
        }
      }
    }
    if (qp) {
      setCodeInput(qp);
      void resolveSchool(qp);
      return;
    }
    try {
      const saved = localStorage.getItem(LAST_SCHOOL_KEY);
      if (saved) setCodeInput(saved);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleSwitchSchool() {
    setSchool(null);
    setRecoverMode(false);
    setLoginErr("");
    setResolveErr("");
    setRecoverMsg(null);
    setUsername("");
    setPassword("");
    try {
      localStorage.removeItem(LAST_SCHOOL_KEY);
    } catch {
      // ignore
    }
  }

  async function handleRecoverSchoolId(e: React.FormEvent) {
    e.preventDefault();
    const em = recoverEmail.trim().toLowerCase();
    if (!em || !em.includes("@")) {
      setRecoverMsg({ kind: "err", text: "Enter the Super Admin email address registered with your school." });
      return;
    }
    setRecoverBusy(true);
    setRecoverMsg(null);
    try {
      const res = await fetch("/api/v1/portal/recover-school-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setRecoverMsg({ kind: "err", text: data.message || "Could not process request right now." });
        return;
      }
      setRecoverMsg({
        kind: "ok",
        text: data.message || "If that email matches a registered school Super Admin, the School ID has been sent.",
      });
    } catch {
      setRecoverMsg({ kind: "err", text: "Connection interrupted. Try again." });
    } finally {
      setRecoverBusy(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!school) return;
    setLoginBusy(true);
    setLoginErr("");
    try {
      const res = await fetch("/api/v1/portal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          school_code: school.school_code,
          role,
          username: username.trim(),
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setLoginErr(data.message || "Invalid username or password.");
        return;
      }
      const target = role === "admin" ? "/admin" : role === "teacher" ? "/teacher" : "/student";
      router.push(target);
    } catch {
      setLoginErr("Could not reach the portal right now. Check your internet connection.");
    } finally {
      setLoginBusy(false);
    }
  }

  const roleIdx = role === "student" ? 0 : role === "teacher" ? 1 : 2;
  const userLabel =
    role === "student"
      ? "Admission number or username"
      : role === "teacher"
        ? "Teacher username"
        : "Admin username or email";
  const userPlaceholder =
    role === "student"
      ? "Enter your username"
      : role === "teacher"
        ? "e.g. teacher1"
        : "Administrator username or email";

  const roleBlockedMsg =
    school && role === "student" && (!school.online_portal_enabled || !school.online_students_enabled)
      ? !school.online_portal_enabled
        ? "The Online Exam Portal is currently switched off by your administrator."
        : "Student online access is currently switched off by your administrator."
      : school && role === "teacher" && (!school.online_portal_enabled || !school.online_teachers_enabled)
        ? !school.online_portal_enabled
          ? "The Online Exam Portal is currently switched off by your administrator."
          : "Teacher online access is currently switched off by your administrator."
        : "";

  const continuePath =
    activeSession?.role === "admin"
      ? "/admin"
      : activeSession?.role === "teacher"
        ? "/teacher"
        : "/student";

  return (
    <div className="ed-body">
      <div className="ed-grain" aria-hidden="true" />

      <div className="ed-auth">
        {/* Exact Offline Framed Architectural Gallery Stage */}
        <aside className="ed-gallery" aria-label="CogniTara Examination Hall">
          <img className="ed-gallery__img" src="/images/auth-editorial-portal.jpg" alt="" />
          <div className="ed-gallery__scrim" aria-hidden="true" />

          <div className="ed-gallery__top">
            <Link className="ed-gallery__brand" href="/" aria-label="CogniTara Online Portal">
              <span className="ed-brand__mark" style={{ width: 26, height: 26, borderRadius: 7 }}>
                <svg viewBox="0 0 200 200">
                  <use href={`${CT_ICONS_URL}#ct-mark`} />
                </svg>
              </span>
              <strong>CogniTara</strong>
            </Link>
            <span className="ed-gallery__tag">
              {school ? `${school.current_term} · ${school.academic_session}` : "Online Exam Portal"}
            </span>
          </div>

          <div className="ed-gallery__caption">
            <span className="ed-gallery__caption-eyebrow">
              {school ? school.school_name : "CogniTara Schools"}
            </span>
            <h2>
              {school
                ? "Calm, focused examinations synced directly with your school."
                : "One examination portal for classroom, lab, and home sittings."}
            </h2>
            <p>
              Instant answer persistence, built-in scientific tools, and verified integrity, using the exact same accounts and grading scale as your offline school server.
            </p>
          </div>
        </aside>

        {/* Exact Offline Elevated Architectural Sign-In Surface */}
        <main className="ed-pane">
          <div className="ed-pane__top">
            {school ? (
              <button
                type="button"
                className="ed-back"
                onClick={handleSwitchSchool}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <CtIco name="i-arrow-left" className="ct-ico--sm" />
                <span>Change School ID</span>
              </button>
            ) : recoverMode ? (
              <button
                type="button"
                className="ed-back"
                onClick={() => {
                  setRecoverMode(false);
                  setRecoverMsg(null);
                }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <CtIco name="i-arrow-left" className="ct-ico--sm" />
                <span>Back to School ID</span>
              </button>
            ) : (
              <span style={{ fontSize: 12.5, color: "var(--ed-ink-3)", fontWeight: 550 }}>
                Online Examination Portal
              </span>
            )}
            <CtThemeToggle variant="ed" />
          </div>

          <div className="ed-pane__center">
            <section className="ed-form-card" aria-label="Portal sign in">
              {activeSession && !school && !recoverMode && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--ed-border-2)",
                    background: "var(--ed-surface-2)",
                    marginBottom: 14,
                    fontSize: 12.5,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", color: "var(--ed-ink)" }}>{activeSession.fullName}</strong>
                    <span style={{ color: "var(--ed-ink-2)" }}>
                      Signed in · {activeSession.schoolName || activeSession.schoolCode}
                    </span>
                  </div>
                  <Link
                    href={continuePath}
                    className="ct-btn ct-btn--primary ct-btn--sm"
                    style={{ flex: "none" }}
                  >
                    Continue
                  </Link>
                </div>
              )}

              {!school && !recoverMode && (
                <>
                  <div className="ed-school-row">
                    <div className="ed-crest">
                      <svg viewBox="0 0 200 200" style={{ width: 22, height: 22 }}>
                        <use href={`${CT_ICONS_URL}#ct-mark`} />
                      </svg>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h1>Enter your School ID</h1>
                      <p>Connect to your school&apos;s examination portal</p>
                    </div>
                  </div>

                  {resolveErr && (
                    <div className="ed-alert" role="alert">
                      <CtIco name="i-alert" className="ct-ico--sm" />
                      <span>{resolveErr}</span>
                    </div>
                  )}

                  <form
                    className="ed-fields"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void resolveSchool(codeInput);
                    }}
                  >
                    <div className="ed-field">
                      <label className="ed-label" htmlFor="schoolCodeInput">
                        School ID
                      </label>
                      <div className="ed-input-box">
                        <CtIco name="i-key" />
                        <input
                          className="ed-input"
                          id="schoolCodeInput"
                          type="text"
                          value={codeInput}
                          onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                          placeholder="e.g. CT-4829K"
                          autoComplete="off"
                          spellCheck={false}
                          required
                          autoFocus
                          style={{ fontFamily: "var(--ct-mono)", letterSpacing: "0.06em" }}
                        />
                      </div>
                    </div>

                    <button type="submit" className="ed-submit" disabled={resolving}>
                      <span>{resolving ? "Finding school..." : "Continue"}</span>
                      <CtIco name="i-arrow-right" className="ct-ico--sm" />
                    </button>
                  </form>

                  <div className="ed-card-links" style={{ justifyContent: "center" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setRecoverMode(true);
                        setRecoverMsg(null);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        font: "inherit",
                        fontSize: 13,
                        color: "var(--ed-ink-2)",
                      }}
                    >
                      <CtIco name="i-mail" className="ct-ico--sm" />
                      <span>Admin forgot School ID? Email it to me</span>
                    </button>
                  </div>
                </>
              )}

              {!school && recoverMode && (
                <>
                  <div className="ed-school-row">
                    <div className="ed-crest">
                      <CtIco name="i-mail" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h1>Find your School ID</h1>
                      <p>Enter your Super Admin email address and we will email your School ID</p>
                    </div>
                  </div>

                  {recoverMsg && (
                    <div
                      className="ed-alert"
                      role={recoverMsg.kind === "err" ? "alert" : "status"}
                      style={
                        recoverMsg.kind === "ok"
                          ? {
                              background: "var(--ed-surface-2)",
                              borderColor: "var(--ed-border-2)",
                              color: "var(--ed-ink)",
                            }
                          : undefined
                      }
                    >
                      <CtIco name={recoverMsg.kind === "ok" ? "i-check-circle" : "i-alert"} className="ct-ico--sm" />
                      <span>{recoverMsg.text}</span>
                    </div>
                  )}

                  <form className="ed-fields" onSubmit={handleRecoverSchoolId}>
                    <div className="ed-field">
                      <label className="ed-label" htmlFor="recoverEmail">
                        Super Admin email address
                      </label>
                      <div className="ed-input-box">
                        <CtIco name="i-mail" />
                        <input
                          className="ed-input"
                          id="recoverEmail"
                          type="email"
                          value={recoverEmail}
                          onChange={(e) => setRecoverEmail(e.target.value)}
                          placeholder="principal@school.edu"
                          required
                          autoFocus
                        />
                      </div>
                    </div>

                    <button type="submit" className="ed-submit" disabled={recoverBusy}>
                      <span>{recoverBusy ? "Sending School ID..." : "Send School ID to Email"}</span>
                      <CtIco name="i-arrow-right" className="ct-ico--sm" />
                    </button>
                  </form>
                </>
              )}

              {school && (
                <>
                  <div className="ed-school-row">
                    <div className="ed-crest">{getInitials(school.school_name, "CT")}</div>
                    <div style={{ minWidth: 0 }}>
                      <h1>Sign in to your portal</h1>
                      <p>
                        {school.school_name}
                        {school.school_motto ? ` · ${school.school_motto}` : ` · ${school.school_code}`}
                      </p>
                    </div>
                  </div>

                  {school.online_portal_notice && (
                    <div
                      className="ed-alert"
                      style={{
                        background: "var(--ed-surface-2)",
                        borderColor: "var(--ed-border-2)",
                        color: "var(--ed-ink)",
                      }}
                    >
                      <CtIco name="i-info" className="ct-ico--sm" />
                      <span>{school.online_portal_notice}</span>
                    </div>
                  )}

                  {(loginErr || roleBlockedMsg) && (
                    <div className="ed-alert login-error" role="alert">
                      <CtIco name="i-alert" className="ct-ico--sm" />
                      <span>{loginErr || roleBlockedMsg}</span>
                    </div>
                  )}

                  <div
                    className="ed-seg role-seg"
                    id="roleSeg"
                    role="tablist"
                    aria-label="Account role"
                    style={
                      {
                        "--seg-n": "3",
                        "--seg-i": String(roleIdx),
                      } as React.CSSProperties
                    }
                  >
                    <span className="ed-seg__thumb" aria-hidden="true" />
                    <button
                      type="button"
                      className={role === "student" ? "is-active" : ""}
                      role="tab"
                      aria-selected={role === "student"}
                      onClick={() => {
                        setRole("student");
                        setLoginErr("");
                      }}
                    >
                      Student
                    </button>
                    <button
                      type="button"
                      className={role === "teacher" ? "is-active" : ""}
                      role="tab"
                      aria-selected={role === "teacher"}
                      onClick={() => {
                        setRole("teacher");
                        setLoginErr("");
                      }}
                    >
                      Teacher
                    </button>
                    <button
                      type="button"
                      className={role === "admin" ? "is-active" : ""}
                      role="tab"
                      aria-selected={role === "admin"}
                      onClick={() => {
                        setRole("admin");
                        setLoginErr("");
                      }}
                    >
                      Admin
                    </button>
                  </div>

                  <form className="ed-fields login-form" onSubmit={handleLogin}>
                    <div className="ed-field">
                      <label className="ed-label" htmlFor="username">
                        {userLabel}
                      </label>
                      <div className="ed-input-box">
                        <CtIco name="i-user" />
                        <input
                          className="ed-input"
                          type="text"
                          id="username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder={userPlaceholder}
                          autoComplete="username"
                          required
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="ed-field">
                      <label className="ed-label" htmlFor="password">
                        Password
                      </label>
                      <div className="ed-input-box">
                        <CtIco name="i-lock" />
                        <input
                          className="ed-input ed-input--trail"
                          type={showPw ? "text" : "password"}
                          id="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          autoComplete="current-password"
                          required
                        />
                        <button
                          className="ed-eye"
                          type="button"
                          onClick={() => setShowPw((v) => !v)}
                          aria-label={showPw ? "Hide password" : "Show password"}
                        >
                          <CtIco name={showPw ? "i-eye-off" : "i-eye"} className="ct-ico--sm" />
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="ed-submit"
                      disabled={loginBusy || Boolean(roleBlockedMsg)}
                    >
                      <span>{loginBusy ? "Signing in..." : "Sign in"}</span>
                      <CtIco name="i-arrow-right" className="ct-ico--sm" />
                    </button>
                  </form>

                  <div className="ed-card-links">
                    <Link href={`/register?code=${encodeURIComponent(school.school_code)}`}>
                      <CtIco name="i-plus" className="ct-ico--sm" />
                      <span>New student registration</span>
                    </Link>
                    <span style={{ fontFamily: "var(--ct-mono)", fontSize: 11.5, color: "var(--ed-ink-3)" }}>
                      ID: {school.school_code}
                    </span>
                  </div>
                </>
              )}
            </section>
          </div>

          <footer className="ed-pane__foot">
            <span>CogniTara Online Examination Server</span>
            <span>{school ? school.school_name : "Synced School Portal"}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default function PortalGatewayPage() {
  return (
    <Suspense fallback={<div className="ed-body" style={{ minHeight: "100vh" }} />}>
      <PortalGatewayInner />
    </Suspense>
  );
}
