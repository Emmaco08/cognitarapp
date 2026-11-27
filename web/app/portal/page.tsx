"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CogniTaraLockup } from "@/components/CogniTaraLogo";

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
          setResolveErr(data.message || "School ID not found. Check with your school administrator.");
        }
        setSchool(null);
        return;
      }
      const s: ResolvedSchool = data.school;
      setSchool(s);
      setCodeInput(s.school_code);
      try {
        localStorage.setItem(LAST_SCHOOL_KEY, s.school_code);
      } catch {}

      // Default to an available role tab cleanly
      if (!s.online_portal_enabled) {
        setRole("admin");
      } else if (!s.online_students_enabled && s.online_teachers_enabled) {
        setRole("teacher");
      } else if (!s.online_students_enabled && !s.online_teachers_enabled) {
        setRole("admin");
      } else {
        setRole("student");
      }
    } catch {
      if (!silent) setResolveErr("Could not connect to CogniTara right now. Please try again.");
    } finally {
      setResolving(false);
    }
  }

  useEffect(() => {
    // Check if user already has a valid portal session
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

    const qp = (searchParams.get("school") || searchParams.get("code") || "").trim().toUpperCase();
    if (qp) {
      setCodeInput(qp);
      void resolveSchool(qp);
      return;
    }
    try {
      const saved = localStorage.getItem(LAST_SCHOOL_KEY);
      if (saved) {
        setCodeInput(saved);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleSwitchSchool() {
    setSchool(null);
    setLoginErr("");
    setResolveErr("");
    setUsername("");
    setPassword("");
    try {
      localStorage.removeItem(LAST_SCHOOL_KEY);
    } catch {}
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!school) return;
    setLoginErr("");
    setLoginBusy(true);
    try {
      const res = await fetch("/api/v1/portal/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_code: school.school_code,
          role,
          username: username.trim(),
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setLoginErr(data.message || "Invalid credentials. Check your username and password.");
        setLoginBusy(false);
        return;
      }
      router.push(data.redirect || `/portal/${role}`);
    } catch {
      setLoginErr("Network error while signing in. Please try again.");
      setLoginBusy(false);
    }
  }

  const roleBlockedReason = (() => {
    if (!school || role === "admin") return "";
    if (!school.online_portal_enabled) {
      return "Online Exam Portal is currently switched OFF by your school administrator.";
    }
    if (role === "student" && !school.online_students_enabled) {
      return "Student online access is currently switched OFF by your school administrator.";
    }
    if (role === "teacher" && !school.online_teachers_enabled) {
      return "Teacher online access is currently switched OFF by your school administrator.";
    }
    if (!school.synced) {
      return "Your school has not synced its exam database to the online portal yet.";
    }
    return "";
  })();

  const continueHref = activeSession
    ? activeSession.role === "admin"
      ? "/portal/admin"
      : activeSession.role === "teacher"
        ? "/portal/teacher"
        : "/portal/student"
    : "/portal";

  return (
    <>
      <header className="pt-topbar">
        <div className="pt-topbar-inner">
          <Link href="/portal" className="pt-brand-link" onClick={handleSwitchSchool}>
            <CogniTaraLockup markSize={22} wordmarkHeight={16} suffix="Online Portal" />
          </Link>
          <div className="pt-topbar-meta">
            {activeSession ? (
              <Link href={continueHref} className="pt-btn pt-btn--primary pt-btn--sm">
                Continue as {activeSession.fullName}
              </Link>
            ) : (
              <Link href="https://cognitara.net" className="pt-btn pt-btn--ghost pt-btn--sm">
                cognitara.net
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className="pt-gateway-page">
        <div className="pt-gateway-card">
          {!school ? (
            <>
              <div className="pt-gateway-head">
                <div style={{ display: "inline-flex", justifyContent: "center" }}>
                  <span className="pt-pill pt-pill--mono">portal.cognitara.net</span>
                </div>
                <h1>Enter your School ID</h1>
                <p>
                  Connect to your school&apos;s synced exam portal using the School ID provided by your administrator.
                </p>
              </div>

              {resolveErr ? (
                <div className="pt-alert pt-alert--dark" role="alert" style={{ marginBottom: 16 }}>
                  {resolveErr}
                </div>
              ) : null}

              <form
                className="pt-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void resolveSchool(codeInput);
                }}
              >
                <div className="pt-field">
                  <label htmlFor="schoolIdInput">School ID</label>
                  <input
                    id="schoolIdInput"
                    type="text"
                    className="pt-school-id-input"
                    placeholder="CT-4829A"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={16}
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="pt-btn pt-btn--primary pt-btn--lg"
                  disabled={resolving || codeInput.trim().length < 4}
                >
                  {resolving ? "Finding School..." : "Continue to School Portal"}
                </button>
              </form>

              <div
                style={{
                  marginTop: 22,
                  paddingTop: 18,
                  borderTop: "1px solid var(--pt-line)",
                  fontSize: 12.5,
                  color: "var(--pt-ink-2)",
                  textAlign: "center",
                  lineHeight: 1.55,
                }}
              >
                School admins can find their School ID inside CogniTara Studio Desktop or on{" "}
                <Link href="/dashboard" style={{ color: "var(--pt-ink)", fontWeight: 600 }}>
                  cognitara.net/dashboard
                </Link>
                .
              </div>
            </>
          ) : (
            <>
              {/* Resolved School Banner */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  paddingBottom: 16,
                  marginBottom: 18,
                  borderBottom: "1px solid var(--pt-line)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <span className="pt-pill pt-pill--mono pt-pill--dark">{school.school_code}</span>
                    <span className="pt-pill">
                      <span className={`pt-status-dot ${school.online_portal_enabled ? "pt-status-dot--live" : ""}`} />
                      {school.online_portal_enabled ? "Portal Live" : "Portal Off"}
                    </span>
                  </div>
                  <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25 }}>
                    {school.school_name}
                  </h1>
                  <div style={{ fontSize: 12.5, color: "var(--pt-ink-2)", marginTop: 3 }}>
                    {school.academic_session} · {school.current_term}
                  </div>
                </div>
                <button
                  type="button"
                  className="pt-btn pt-btn--ghost pt-btn--sm"
                  onClick={handleSwitchSchool}
                >
                  Switch
                </button>
              </div>

              {school.online_portal_notice ? (
                <div className="pt-alert" style={{ marginBottom: 16 }}>
                  {school.online_portal_notice}
                </div>
              ) : null}

              {/* Role Switcher */}
              <div className="pt-role-tabs" role="tablist" aria-label="Sign in role">
                {(["student", "teacher", "admin"] as const).map((r) => {
                  const isOn =
                    r === "admin" ||
                    (school.online_portal_enabled &&
                      (r === "student" ? school.online_students_enabled : school.online_teachers_enabled));
                  return (
                    <button
                      key={r}
                      type="button"
                      role="tab"
                      aria-selected={role === r}
                      className={`pt-role-tab ${role === r ? "is-active" : ""}`}
                      onClick={() => {
                        setRole(r);
                        setLoginErr("");
                      }}
                    >
                      <span className={`pt-role-dot ${isOn ? "is-on" : ""}`} />
                      {r === "student" ? "Student" : r === "teacher" ? "Teacher" : "Admin"}
                    </button>
                  );
                })}
              </div>

              {roleBlockedReason ? (
                <div className="pt-alert pt-alert--dark" role="status" style={{ marginBottom: 16 }}>
                  {roleBlockedReason}
                </div>
              ) : null}

              {loginErr ? (
                <div className="pt-alert pt-alert--dark" role="alert" style={{ marginBottom: 16 }}>
                  {loginErr}
                </div>
              ) : null}

              <form className="pt-form" onSubmit={handleLogin}>
                <div className="pt-field">
                  <label htmlFor="portalUsername">
                    {role === "admin" ? "Admin Username or Cloud Email" : "Username"}
                  </label>
                  <input
                    id="portalUsername"
                    type="text"
                    className="pt-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={
                      role === "student"
                        ? "Same username as school computer lab"
                        : role === "teacher"
                          ? "Same teacher username as offline portal"
                          : "admin or school owner email"
                    }
                    autoComplete="username"
                    required
                    disabled={Boolean(roleBlockedReason)}
                  />
                </div>

                <div className="pt-field">
                  <label htmlFor="portalPassword">Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      id="portalPassword"
                      type={showPw ? "text" : "password"}
                      className="pt-input"
                      style={{ paddingRight: 64 }}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                      disabled={Boolean(roleBlockedReason)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      style={{
                        position: "absolute",
                        right: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        border: "none",
                        background: "transparent",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--pt-ink-2)",
                        cursor: "pointer",
                      }}
                    >
                      {showPw ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="pt-btn pt-btn--primary pt-btn--lg"
                  disabled={loginBusy || Boolean(roleBlockedReason)}
                >
                  {loginBusy
                    ? "Signing in..."
                    : role === "student"
                      ? "Sign In as Student"
                      : role === "teacher"
                        ? "Sign In as Teacher"
                        : "Sign In as Administrator"}
                </button>
              </form>

              <p
                style={{
                  margin: "16px 0 0",
                  fontSize: 12,
                  color: "var(--pt-ink-3)",
                  textAlign: "center",
                }}
              >
                Uses your exact offline CogniTara school database credentials.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}

export default function PortalGatewayPage() {
  return (
    <Suspense
      fallback={
        <div className="pt-gateway-page">
          <div className="pt-gateway-card" style={{ textAlign: "center", color: "var(--pt-ink-2)" }}>
            Loading Online Exam Portal...
          </div>
        </div>
      }
    >
      <PortalGatewayInner />
    </Suspense>
  );
}
