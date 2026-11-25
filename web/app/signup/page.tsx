"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";

function passwordScore(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 14) s++;
  return pw.length === 0 ? 0 : Math.max(1, s);
}

export default function SignUpPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // OTP verification state
  const [otpStep, setOtpStep] = useState<{ email: string; purpose: string } | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const score = passwordScore(password);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          school_name: schoolName,
          email,
          phone,
          password,
          referral_code: referralCode || undefined,
          client_type: "web",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || "Could not create your account. Check your details and try again.");
        setSubmitting(false);
        return;
      }
      if (data.otp_required) {
        setOtpStep({ email: data.email || email, purpose: data.purpose || "signup_verify" });
        setNotice(data.message || `Enter the 6-digit code sent to ${data.email || email}.`);
        setResendCooldown(45);
        setSubmitting(false);
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Network error while reaching CogniTara Cloud. Please try again.");
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
      setNotice("A fresh 6-digit verification code has been sent to your inbox.");
      setResendCooldown(45);
    } catch {
      setError("Network error while resending code.");
    }
  }

  return (
    <div className="ct-shell">
      <BrandHeader />
      <main className={`auth-wrap ${otpStep ? "" : "auth-wrap--wide"}`}>
        <div className="card">
          {otpStep ? (
            <>
              <div className="auth-head">
                <h1>Verify your email</h1>
                <p>Enter the 6-digit Brevo security code sent to <strong>{otpStep.email}</strong>.</p>
              </div>

              {error ? <div className="alert alert--bad" role="alert">{error}</div> : null}
              {notice ? <div className="alert alert--ok">{notice}</div> : null}

              <form className="form-grid" onSubmit={onVerifyOtp}>
                <div className="field">
                  <label htmlFor="otpCode">6-Digit Verification Code</label>
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
                  {submitting ? "Verifying…" : "Verify & continue"}
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
                <h1>Create your school account</h1>
                <p>Sign up once to sync your school profile, licences, and CogniTara Studio desktop app.</p>
              </div>

              {error ? <div className="alert alert--bad" role="alert">{error}</div> : null}

              <form className="form-grid" onSubmit={onSubmit}>
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="fullName">Full name</label>
                    <input
                      id="fullName"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Adaeze Okafor"
                      autoComplete="name"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="schoolName">School name</label>
                    <input
                      id="schoolName"
                      required
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder="Cedar Hills Academy"
                      autoComplete="organization"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="field">
                    <label htmlFor="email">Work or school email</label>
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
                    <label htmlFor="phone">Phone (optional)</label>
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+234 800 000 0000"
                      autoComplete="tel"
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                  <div className="meter" data-score={score} aria-hidden="true">
                    <i /><i /><i /><i />
                  </div>
                  <span className="field-hint">
                    {score === 0
                      ? "Use 8+ characters with letters and numbers."
                      : ["", "Too weak", "Fair password", "Strong password", "Very strong password"][score]}
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="referralCode">Referral code (optional)</label>
                  <input
                    id="referralCode"
                    className="mono"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="CT-XXXX-XXXXXX"
                    autoComplete="off"
                  />
                </div>

                <button type="submit" className="btn btn--primary btn--lg" disabled={submitting}>
                  {submitting ? "Creating account…" : "Create school account"}
                </button>
              </form>

              <p style={{ marginTop: 18, fontSize: 13.5, color: "var(--ink-2)", textAlign: "center" }}>
                Already have a CogniTara Cloud account? <Link href="/signin">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
