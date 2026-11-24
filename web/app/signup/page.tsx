"use client";

import React, { useState } from "react";
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
  const [submitting, setSubmitting] = useState(false);

  const score = passwordScore(password);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
      router.push("/dashboard");
    } catch {
      setError("Network error while reaching CogniTara Cloud. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="ct-shell">
      <BrandHeader />
      <main className="auth-wrap auth-wrap--wide">
        <div className="card">
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
        </div>
      </main>
    </div>
  );
}
