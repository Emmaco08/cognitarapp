"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CogniTaraMark } from "@/components/CogniTaraLogo";
import {
  getMonogram,
  PIconArrowLeft,
  PIconArrowRight,
  PIconEye,
  PIconEyeOff,
  PIconLock,
  PIconMail,
  PIconUser,
  PortalThemeToggle,
} from "@/components/portal/PortalIcons";

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
      } catch {}

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
      if (!silent) setResolveErr("Could not connect to CogniTara right now. Try again shortly.");
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
    } catch {}
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
    } catch {}
  }

  async function handleRecoverSchoolId(e: React.FormEvent) {
    e.preventDefault();
    setRecoverBusy(true);
    setRecoverMsg(null);
    try {
      const res = await fetch("/api/v1/portal/recover-school-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoverEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setRecoverMsg({ kind: "err", text: data.message || "Could not send School ID email." });
      } else {
        setRecoverMsg({
          kind: "ok",
          text: data.message || "If that email matches a registered school super admin account, your School ID has been sent.",
        });
      }
    } catch {
      setRecoverMsg({ kind: "err", text: "Network error while requesting your School ID." });
    } finally {
      setRecoverBusy(false);
    }
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
      router.push(data.redirect || `/${role}`);
    } catch {
      setLoginErr("Network error while signing in. Try again.");
      setLoginBusy(false);
    }
  }

  const roleBlockedReason = (() => {
    if (!school || role === "admin") return "";
    if (!school.online_portal_enabled) {
      return "Online Exam Portal is currently switched off by your school administrator.";
    }
    if (role === "student" && !school.online_students_enabled) {
      return "Student online access is currently switched off by your school administrator.";
    }
    if (role === "teacher" && !school.online_teachers_enabled) {
      return "Teacher online access is currently switched off by your school administrator.";
    }
    if (!school.synced) {
      return "Your school has not synced its exam database to the online portal yet.";
    }
    return "";
  })();

  const continueHref = activeSession
    ? activeSession.role === "admin"
      ? "/admin"
      : activeSession.role === "teacher"
        ? "/teacher"
        : "/student"
    : "/";

  return (
    <div className="pt-auth-split">
      {/* Left Architectural Editorial Pane (Matches Offline login.html) */}
      <section className="pt-auth-media" aria-label="Examination portal overview">
        <img
          src="/images/auth-editorial-portal.jpg"
          alt=""
          className="pt-auth-media__img"
          loading="eager"
        />
        <div className="pt-auth-media__scrim" aria-hidden="true" />

        <div className="pt-auth-media__top">
          <div className="pt-auth-brand-chip">
            <CogniTaraMark size={18} />
            <span>CogniTara</span>
          </div>
          <div className="pt-auth-term">
            {school
              ? `${school.current_term} · ${school.academic_session}`
              : "Online Examination Portal"}
          </div>
        </div>

        <div className="pt-auth-media__bot">
          <div className="pt-auth-media__kicker">
            {school ? school.school_name : "CogniTara Examination Suite"}
          </div>
          <h2>Calm, focused examinations from anywhere</h2>
          <p>
            Instant answer persistence, built-in scientific tools, and verified integrity, synced cleanly with your school database.
          </p>
        </div>
      </section>

      {/* Right Auth Stage */}
      <section className="pt-auth-stage" id="main-content">
        <div className="pt-auth-stage__top">
          <div>
            {school ? (
              <button type="button" className="pt-text-btn" onClick={handleSwitchSchool}>
                <PIconArrowLeft size={14} />
                <span>Switch school</span>
              </button>
            ) : recoverMode ? (
              <button
                type="button"
                className="pt-text-btn"
                onClick={() => {
                  setRecoverMode(false);
                  setRecoverMsg(null);
                }}
              >
                <PIconArrowLeft size={14} />
                <span>Back to School ID</span>
              </button>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600 }}>
                <CogniTaraMark size={18} />
                <span>CogniTara</span>
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {activeSession ? (
              <Link href={continueHref} className="pt-btn pt-btn--sm">
                Continue as {activeSession.fullName}
              </Link>
            ) : null}
            <PortalThemeToggle />
          </div>
        </div>

        <div className="pt-auth-stage__center">
          <div className="pt-auth-card">
            {!school && !recoverMode ? (
              <>
                <div className="pt-auth-card__head">
                  <span className="pt-crest">CT</span>
                  <div className="pt-auth-card__title">
                    <h1>Enter your School ID</h1>
                    <p>Connect to your school portal using the ID provided by your administrator</p>
                  </div>
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
                    <span>{resolving ? "Finding school..." : "Continue"}</span>
                    <PIconArrowRight size={15} />
                  </button>
                </form>

                <div className="pt-link-row">
                  <button
                    type="button"
                    className="pt-text-btn"
                    onClick={() => {
                      setRecoverMode(true);
                      setResolveErr("");
                      setRecoverMsg(null);
                    }}
                  >
                    <PIconMail size={14} />
                    <span>Forgot School ID</span>
                  </button>
                  <a
                    href="https://cognitara.net/signup"
                    className="pt-text-btn"
                  >
                    New school account
                  </a>
                </div>
              </>
            ) : !school && recoverMode ? (
              <>
                <div className="pt-auth-card__head">
                  <span className="pt-crest">ID</span>
                  <div className="pt-auth-card__title">
                    <h1>Find your School ID</h1>
                    <p>Enter your registered school super admin email and we will email your School ID</p>
                  </div>
                </div>

                {recoverMsg ? (
                  <div
                    className={`pt-alert ${recoverMsg.kind === "err" ? "pt-alert--dark" : ""}`}
                    role={recoverMsg.kind === "err" ? "alert" : "status"}
                    style={{ marginBottom: 16 }}
                  >
                    {recoverMsg.text}
                  </div>
                ) : null}

                <form className="pt-form" onSubmit={handleRecoverSchoolId}>
                  <div className="pt-field">
                    <label htmlFor="superAdminEmail">Super admin email</label>
                    <div className="pt-input-wrap">
                      <span className="pt-input-wrap__ico">
                        <PIconMail size={15} />
                      </span>
                      <input
                        id="superAdminEmail"
                        type="email"
                        className="pt-input"
                        placeholder="principal@school.edu.ng"
                        autoComplete="email"
                        value={recoverEmail}
                        onChange={(e) => setRecoverEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="pt-btn pt-btn--primary pt-btn--lg"
                    disabled={recoverBusy || !recoverEmail.trim()}
                  >
                    <span>{recoverBusy ? "Sending School ID..." : "Send School ID to email"}</span>
                    <PIconArrowRight size={15} />
                  </button>
                </form>

                <div className="pt-link-row">
                  <button
                    type="button"
                    className="pt-text-btn"
                    onClick={() => {
                      setRecoverMode(false);
                      setRecoverMsg(null);
                    }}
                  >
                    <PIconArrowLeft size={14} />
                    <span>I have my School ID</span>
                  </button>
                </div>
              </>
            ) : school ? (
              <>
                <div className="pt-auth-card__head">
                  <span className="pt-crest">{getMonogram(school.school_name, "CT")}</span>
                  <div className="pt-auth-card__title" style={{ minWidth: 0 }}>
                    <h1>Sign in to your portal</h1>
                    <p>
                      {school.school_name}
                      {school.school_motto ? ` · ${school.school_motto}` : ` · ${school.school_code}`}
                    </p>
                  </div>
                </div>

                {school.online_portal_notice ? (
                  <div className="pt-alert" style={{ marginBottom: 16 }}>
                    {school.online_portal_notice}
                  </div>
                ) : null}

                <div className="pt-seg" role="tablist" aria-label="Portal role">
                  {(["student", "teacher", "admin"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="tab"
                      aria-selected={role === r}
                      className={`pt-seg__btn ${role === r ? "is-active" : ""}`}
                      onClick={() => {
                        setRole(r);
                        setLoginErr("");
                      }}
                    >
                      {r === "student" ? "Student" : r === "teacher" ? "Teacher" : "Admin"}
                    </button>
                  ))}
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
                      {role === "student"
                        ? "Admission number or username"
                        : role === "teacher"
                          ? "Teacher username"
                          : "Admin username or super admin email"}
                    </label>
                    <div className="pt-input-wrap">
                      <span className="pt-input-wrap__ico">
                        <PIconUser size={15} />
                      </span>
                      <input
                        id="portalUsername"
                        type="text"
                        className="pt-input"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder={
                          role === "admin"
                            ? "Enter admin username or email"
                            : "Enter your username"
                        }
                        autoComplete="username"
                        required
                        disabled={Boolean(roleBlockedReason)}
                      />
                    </div>
                  </div>

                  <div className="pt-field">
                    <label htmlFor="portalPassword">Password</label>
                    <div className="pt-input-wrap">
                      <span className="pt-input-wrap__ico">
                        <PIconLock size={15} />
                      </span>
                      <input
                        id="portalPassword"
                        type={showPw ? "text" : "password"}
                        className="pt-input"
                        style={{ paddingRight: 42 }}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        required
                        disabled={Boolean(roleBlockedReason)}
                      />
                      <button
                        type="button"
                        className="pt-input-wrap__tail"
                        onClick={() => setShowPw((v) => !v)}
                        aria-label={showPw ? "Hide password" : "Show password"}
                      >
                        {showPw ? <PIconEyeOff size={15} /> : <PIconEye size={15} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="pt-btn pt-btn--primary pt-btn--lg"
                    disabled={loginBusy || Boolean(roleBlockedReason)}
                  >
                    <span>{loginBusy ? "Signing in..." : "Sign in"}</span>
                    <PIconArrowRight size={15} />
                  </button>
                </form>

                <div className="pt-link-row">
                  <span className="pt-mono" style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
                    {school.school_code}
                  </span>
                  <span className={`pt-status ${school.online_portal_enabled ? "is-live" : ""}`}>
                    <span className="pt-dot" />
                    {school.online_portal_enabled ? "Portal live" : "Portal off"}
                  </span>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="pt-auth-stage__foot">
          <span>CogniTara Examination Portal</span>
          <span>Synced with school database</span>
        </div>
      </section>
    </div>
  );
}

export default function PortalGatewayPage() {
  return (
    <Suspense
      fallback={
        <div className="pt-auth-split">
          <div className="pt-auth-stage" style={{ gridColumn: "1 / -1" }}>
            <div className="pt-auth-stage__center">
              <div className="pt-auth-card" style={{ textAlign: "center", color: "var(--pt-ink-2)" }}>
                Loading school portal...
              </div>
            </div>
          </div>
        </div>
      }
    >
      <PortalGatewayInner />
    </Suspense>
  );
}
