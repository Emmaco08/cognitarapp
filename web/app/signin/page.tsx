"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [otpStep, setOtpStep] = useState<{ email: string; purpose: string } | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  async function onSubmit(e: React.FormEvent) {
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
        setOtpStep({ email: data.email || email, purpose: data.purpose || "signin_otp" });
        setNotice(data.message || `Enter the 6-digit security code sent to ${data.email || email}.`);
        setResendCooldown(45);
        setSubmitting(false);
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Network error while contacting CogniTara Cloud.");
      setSubmitting(false);
    }
  }

  async function onVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otpStep) return;
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: otpStep.email,
          purpose: otpStep.purpose,
          code: otpCode.trim(),
          client_type: "web",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || "Invalid or expired verification code.");
        setSubmitting(false);
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Network error while verifying code.");
      setSubmitting(false);
    }
  }

  async function onResendOtp() {
    if (!otpStep || resendCooldown > 0) return;
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/v1/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otpStep.email, purpose: otpStep.purpose }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || "Could not resend code yet.");
        if (data.retry_after_sec) setResendCooldown(Number(data.retry_after_sec));
        return;
      }
      setNotice("A fresh 6-digit security code has been sent to your inbox.");
      setResendCooldown(45);
    } catch {
      setError("Network error while resending code.");
    }
  }

  return (
    <div className="ct-shell">
      <BrandHeader />
      <main className="auth-wrap">
        <div className="card">
          {otpStep ? (
            <>
              <div className="auth-head">
                <h1>Enter security code</h1>
                <p>Check <strong>{otpStep.email}</strong> for your 6-digit Brevo OTP code.</p>
              </div>

              {error ? <div className="alert alert--bad" role="alert">{error}</div> : null}
              {notice ? <div className="alert alert--ok">{notice}</div> : null}

              <form className="form-grid" onSubmit={onVerifyOtp}>
                <div className="field">
                  <label htmlFor="otpCode">6-Digit Security Code</label>
                  <input
                    id="otpCode"
                    className="mono"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    style={{ textAlign: "center", fontSize: 22, letterSpacing: "0.35em", height: 50 }}
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
                      setOtpStep(null);
                      setOtpCode("");
                      setError("");
                      setNotice("");
                    }}
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={resendCooldown > 0}
                    onClick={onResendOtp}
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="auth-head">
                <h1>Sign in to CogniTara Cloud</h1>
                <p>Access your school profile, licences, referral wallet, and desktop sync.</p>
              </div>

              {error ? <div className="alert alert--bad" role="alert">{error}</div> : null}

              <form className="form-grid" onSubmit={onSubmit}>
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
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    autoComplete="current-password"
                  />
                </div>

                <button type="submit" className="btn btn--primary btn--lg" disabled={submitting}>
                  {submitting ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <p style={{ marginTop: 18, fontSize: 13.5, color: "var(--ink-2)", textAlign: "center" }}>
                New to CogniTara? <Link href="/signup">Create a school account</Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
