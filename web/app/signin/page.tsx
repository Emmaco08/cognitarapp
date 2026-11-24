"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
      router.push("/dashboard");
    } catch {
      setError("Network error while contacting CogniTara Cloud.");
      setSubmitting(false);
    }
  }

  return (
    <div className="ct-shell">
      <BrandHeader />
      <main className="auth-wrap">
        <div className="card">
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
        </div>
      </main>
    </div>
  );
}
