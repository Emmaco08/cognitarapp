"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";

type ViewMode = "signin" | "otp" | "forgot_req" | "forgot_confirm";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 2FA / OTP state with signed challenge_token
  const [challengeToken, setChallengeToken] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpMethod, setOtpMethod] = useState<"email_otp" | "totp" | "recovery_code">("email_otp");
  const [availableMethods, setAvailableMethods] = useState<string[]>(["email_otp"]);
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  // Forgot password state
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  function routeAfterAuth(role?: string) {
    if (role === "hq_super_admin" || role === "hq_admin") {
      router.push("/hq");
    } else {
      router.push("/dashboard");
    }
  }

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, client_type: "web" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || "Invalid email address or password.");
        setSubmitting(false);
        return;
      }
      if (data.otp_required) {
        setChallengeToken(String(data.challenge_token || ""));
        setOtpEmail(String(data.email || email));
        const methods: string[] = Array.isArray(data.methods) && data.methods.length ? data.methods : ["email_otp"];
        setAvailableMethods(methods);
        setOtpMethod((data.preferred_method as any) || (methods[0] as any) || "email_otp");
        setNotice(data.message || `Enter your security code to finish signing in.`);
        setResendCooldown(data.email_otp_sent !== false ? 45 : 0);
        setMode("otp");
        setSubmitting(false);
        return;
      }
      routeAfterAuth(data.user?.role);
    } catch {
      setError("Could not reach CogniTara right now. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  async function onVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: otpEmail,
          challenge_token: challengeToken,
          method: otpMethod,
          code: otpCode.trim(),
          client_type: "web",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || "Invalid or expired security code.");
        setSubmitting(false);
        return;
      }
      routeAfterAuth(data.user?.role);
    } catch {
      setError("Network error while verifying your code.");
      setSubmitting(false);
    }
  }

  async function onSendEmailOtp() {
    if (!challengeToken || resendCooldown > 0) return;
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/v1/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otpEmail, challenge_token: challengeToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || "Could not send a new code yet.");
        if (data.retry_after_sec) setResendCooldown(Number(data.retry_after_sec));
        return;
      }
      setOtpMethod("email_otp");
      setNotice(`A 6-digit security code has been sent to ${otpEmail}.`);
      setResendCooldown(45);
    } catch {
      setError("Could not send code right now.");
    }
  }

  async function onRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || "Could not send reset code.");
        setSubmitting(false);
        return;
      }
      setNotice(data.message || "Check your email for the 6-digit reset code.");
      setMode("forgot_confirm");
      setSubmitting(false);
    } catch {
      setError("Network error while requesting password reset.");
      setSubmitting(false);
    }
  }

  async function onConfirmReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: resetCode.trim(), new_password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || "Could not reset password.");
        setSubmitting(false);
        return;
      }
      setPassword("");
      setResetCode("");
      setNewPassword("");
      setNotice(data.message || "Password updated! Sign in with your new password.");
      setMode("signin");
      setSubmitting(false);
    } catch {
      setError("Network error while updating password.");
      setSubmitting(false);
    }
  }

  return (
    <div className="ct-shell">
      <BrandHeader />
      <main className="auth-wrap">
        <div className="card">
          {mode === "otp" ? (
            <>
              <div className="auth-head">
                <h1>Two-step verification</h1>
                <p>
                  {otpMethod === "totp"
                    ? "Enter the 6-digit code from your authenticator app."
                    : otpMethod === "recovery_code"
                    ? "Enter one of your single-use 8-character recovery codes."
                    : `Enter the 6-digit security code sent to ${otpEmail}.`}
                </p>
              </div>

              {availableMethods.length > 1 ? (
                <div className="hq-chips" style={{ marginBottom: 14 }}>
                  {availableMethods.includes("totp") ? (
                    <button type="button" className={`hq-chip ${otpMethod === "totp" ? "is-active" : ""}`} onClick={() => { setOtpMethod("totp"); setOtpCode(""); }}>
                      Authenticator app
                    </button>
                  ) : null}
                  {availableMethods.includes("email_otp") ? (
                    <button type="button" className={`hq-chip ${otpMethod === "email_otp" ? "is-active" : ""}`} onClick={() => { setOtpMethod("email_otp"); setOtpCode(""); }}>
                      Email code
                    </button>
                  ) : null}
                  {availableMethods.includes("recovery_code") ? (
                    <button type="button" className={`hq-chip ${otpMethod === "recovery_code" ? "is-active" : ""}`} onClick={() => { setOtpMethod("recovery_code"); setOtpCode(""); }}>
                      Recovery code
                    </button>
                  ) : null}
                </div>
              ) : null}

              {error ? <div className="alert alert--bad" role="alert">{error}</div> : null}
              {notice ? <div className="alert alert--ok">{notice}</div> : null}

              <form className="form-grid" onSubmit={onVerifyOtp}>
                <div className="field">
                  <label htmlFor="otpCode">
                    {otpMethod === "recovery_code" ? "Recovery code" : "6-digit security code"}
                  </label>
                  <input
                    id="otpCode"
                    className="mono"
                    inputMode={otpMethod === "recovery_code" ? "text" : "numeric"}
                    autoComplete="one-time-code"
                    maxLength={otpMethod === "recovery_code" ? 10 : 6}
                    required
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(
                        otpMethod === "recovery_code"
                          ? e.target.value.toUpperCase().slice(0, 10)
                          : e.target.value.replace(/\D/g, "").slice(0, 6)
                      )
                    }
                    placeholder={otpMethod === "recovery_code" ? "XXXX-XXXX" : "000000"}
                    style={{ textAlign: "center", fontSize: 20, letterSpacing: "0.26em", height: 48 }}
                  />
                </div>
                <button type="submit" className="btn btn--primary btn--lg" disabled={submitting || otpCode.length < 6}>
                  {submitting ? "Verifying…" : "Verify & sign in"}
                </button>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      setMode("signin");
                      setOtpCode("");
                      setError("");
                      setNotice("");
                    }}
                  >
                    Back
                  </button>
                  {availableMethods.includes("email_otp") ? (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={resendCooldown > 0}
                      onClick={onSendEmailOtp}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Send email code"}
                    </button>
                  ) : null}
                </div>
              </form>
            </>
          ) : mode === "forgot_req" ? (
            <>
              <div className="auth-head">
                <h1>Reset your password</h1>
                <p>Enter your school account email and we will send you a 6-digit reset code.</p>
              </div>
              {error ? <div className="alert alert--bad" role="alert">{error}</div> : null}
              <form className="form-grid" onSubmit={onRequestReset}>
                <div className="field">
                  <label htmlFor="resetEmail">Email address</label>
                  <input
                    id="resetEmail"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="principal@school.edu.ng"
                  />
                </div>
                <button type="submit" className="btn btn--primary btn--lg" disabled={submitting}>
                  {submitting ? "Sending code…" : "Send reset code"}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setMode("signin"); setError(""); }}>
                  Back to sign in
                </button>
              </form>
            </>
          ) : mode === "forgot_confirm" ? (
            <>
              <div className="auth-head">
                <h1>Choose a new password</h1>
                <p>Enter the 6-digit code sent to <strong>{email}</strong> along with your new password.</p>
              </div>
              {error ? <div className="alert alert--bad" role="alert">{error}</div> : null}
              {notice ? <div className="alert alert--ok">{notice}</div> : null}
              <form className="form-grid" onSubmit={onConfirmReset}>
                <div className="field">
                  <label htmlFor="resetCode">6-digit code</label>
                  <input
                    id="resetCode"
                    className="mono"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    style={{ textAlign: "center", fontSize: 18, letterSpacing: "0.28em" }}
                  />
                </div>
                <div className="field">
                  <label htmlFor="newPassword">New password</label>
                  <input
                    id="newPassword"
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
                <button type="submit" className="btn btn--primary btn--lg" disabled={submitting || resetCode.length < 6}>
                  {submitting ? "Updating…" : "Update password"}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setMode("signin"); setError(""); }}>
                  Cancel
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="auth-head">
                <h1>Sign in</h1>
                <p>Manage your school licence, payments, backups, and referral rewards.</p>
              </div>

              {error ? <div className="alert alert--bad" role="alert">{error}</div> : null}
              {notice ? <div className="alert alert--ok">{notice}</div> : null}

              <form className="form-grid" onSubmit={onSignIn}>
                <div className="field">
                  <label htmlFor="email">Email address</label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="principal@school.edu.ng"
                    autoComplete="email"
                  />
                </div>

                <div className="field">
                  <label htmlFor="password">
                    <span>Password</span>
                    <button
                      type="button"
                      onClick={() => { setMode("forgot_req"); setError(""); setNotice(""); }}
                      style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >
                      Forgot password?
                    </button>
                  </label>
                  <div className="pw-wrap">
                    <input
                      id="password"
                      type={showPw ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                      autoComplete="current-password"
                    />
                    <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)}>
                      {showPw ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn btn--primary btn--lg" disabled={submitting}>
                  {submitting ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <p style={{ marginTop: 18, marginBottom: 0, fontSize: 13.5, color: "var(--ink-2)", textAlign: "center" }}>
                New to CogniTara? <Link href="/signup">Create a school account</Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
