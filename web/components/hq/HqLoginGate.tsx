"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CogniTaraLockup } from "@/components/CogniTaraLogo";
import { IconLock, IconMoon, IconShield, IconSun } from "@/components/Icons";

interface HqLoginGateProps {
  onAuthenticated: () => void;
}

export function HqLoginGate({ onAuthenticated }: HqLoginGateProps) {
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Step 2: Mandatory 2FA challenge
  const [step, setStep] = useState<"credentials" | "2fa">("credentials");
  const [challengeToken, setChallengeToken] = useState("");
  const [methods, setMethods] = useState<string[]>(["email_otp"]);
  const [method, setMethod] = useState<"totp" | "email_otp" | "recovery_code">("email_otp");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const cur = document.documentElement.getAttribute("data-theme");
    setTheme(cur === "dark" ? "dark" : "light");
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("ct-cloud-theme", next);
    } catch {}
  }

  async function onSubmitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/signin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, client_type: "web" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || "Invalid credentials.");
        setBusy(false);
        return;
      }

      if (data.otp_required) {
        if (data.is_hq_admin === false) {
          setError("This account does not have HQ Admin privileges.");
          setBusy(false);
          return;
        }
        const avail: string[] = Array.isArray(data.methods) && data.methods.length ? data.methods : ["email_otp"];
        setChallengeToken(String(data.challenge_token || ""));
        setMethods(avail);
        setMethod((data.preferred_method as any) || (avail[0] as any) || "email_otp");
        setNotice(data.message || "Complete two-factor verification to unlock HQ.");
        setCooldown(data.email_otp_sent ? 45 : 0);
        setStep("2fa");
        setBusy(false);
        return;
      }

      if (data.user?.role !== "hq_super_admin" && data.user?.role !== "hq_admin") {
        await fetch("/api/v1/auth/signout", { method: "POST", credentials: "include" });
        setError("Access denied. This console is restricted to authorized HQ administrators.");
        setBusy(false);
        return;
      }

      onAuthenticated();
    } catch {
      setError("Could not reach CogniTara HQ right now.");
      setBusy(false);
    }
  }

  async function onSubmit2fa(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/otp/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          challenge_token: challengeToken,
          method,
          code: code.trim(),
          client_type: "web",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || "Verification failed. Check your code and try again.");
        setBusy(false);
        return;
      }
      if (data.user?.role !== "hq_super_admin" && data.user?.role !== "hq_admin") {
        await fetch("/api/v1/auth/signout", { method: "POST", credentials: "include" });
        setError("Access denied. HQ Administrator privileges required.");
        setBusy(false);
        return;
      }
      onAuthenticated();
    } catch {
      setError("Network error while verifying 2FA.");
      setBusy(false);
    }
  }

  async function sendEmailCode() {
    if (!challengeToken || cooldown > 0) return;
    setError("");
    setNotice("");
    const res = await fetch("/api/v1/auth/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), challenge_token: challengeToken }),
    }).then((r) => r.json()).catch(() => null);
    if (!res?.ok) {
      setError(res?.message || "Could not send email code.");
      if (res?.retry_after_sec) setCooldown(Number(res.retry_after_sec));
      return;
    }
    setMethod("email_otp");
    setNotice(`A 6-digit security code was sent to ${email.trim()}.`);
    setCooldown(45);
  }

  return (
    <div className="ct-shell" style={{ maxWidth: 460, paddingTop: "clamp(24px, 7vh, 72px)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <Link href="/" className="ct-brand">
          <CogniTaraLockup markSize={24} wordmarkHeight={15} suffix="HQ" />
        </Link>
        <button type="button" className="btn btn--ghost btn--sm" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === "dark" ? <IconSun size={14} /> : <IconMoon size={14} />}
          <span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
      </div>

      <div className="card">
        {step === "credentials" ? (
          <>
            <div className="auth-head">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "var(--ink-2)" }}>
                <IconLock size={15} />
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>Protected Admin Console</span>
              </div>
              <h1>Admin sign in</h1>
              <p>Sign in with your administrator credentials. Two-factor verification and lockout protection are active.</p>
            </div>

            {error ? <div className="alert alert--bad" role="alert">{error}</div> : null}

            <form className="form-grid" onSubmit={onSubmitCredentials}>
              <div className="field">
                <label htmlFor="hqEmail">Administrator email</label>
                <input
                  id="hqEmail"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@domain.com"
                  autoComplete="username"
                />
              </div>
              <div className="field">
                <label htmlFor="hqPassword">Password</label>
                <div className="pw-wrap">
                  <input
                    id="hqPassword"
                    type={showPw ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter administrator password"
                    autoComplete="current-password"
                  />
                  <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)}>
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <button type="submit" className="btn btn--primary btn--lg" disabled={busy}>
                {busy ? "Checking credentials…" : "Continue to verification"}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="auth-head">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "var(--ok)" }}>
                <IconShield size={15} />
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>Step 2 of 2 · Two-Factor Verification</span>
              </div>
              <h1>Verify your identity</h1>
              <p>
                {method === "totp"
                  ? "Open your authenticator app and enter the 6-digit code for CogniTara HQ."
                  : method === "recovery_code"
                  ? "Enter one of your 8-character single-use backup recovery codes."
                  : `Enter the 6-digit security code sent to ${email.trim()}.`}
              </p>
            </div>

            {methods.length > 1 ? (
              <div className="hq-chips" style={{ marginBottom: 14 }}>
                {methods.includes("totp") ? (
                  <button type="button" className={`hq-chip ${method === "totp" ? "is-active" : ""}`} onClick={() => { setMethod("totp"); setCode(""); }}>
                    Authenticator app
                  </button>
                ) : null}
                {methods.includes("email_otp") ? (
                  <button type="button" className={`hq-chip ${method === "email_otp" ? "is-active" : ""}`} onClick={() => { setMethod("email_otp"); setCode(""); }}>
                    Email code
                  </button>
                ) : null}
                {methods.includes("recovery_code") ? (
                  <button type="button" className={`hq-chip ${method === "recovery_code" ? "is-active" : ""}`} onClick={() => { setMethod("recovery_code"); setCode(""); }}>
                    Recovery code
                  </button>
                ) : null}
              </div>
            ) : null}

            {error ? <div className="alert alert--bad" role="alert">{error}</div> : null}
            {notice ? <div className="alert alert--ok">{notice}</div> : null}

            <form className="form-grid" onSubmit={onSubmit2fa}>
              <div className="field">
                <label htmlFor="hq2faCode">
                  {method === "recovery_code" ? "Recovery code" : "6-digit security code"}
                </label>
                <input
                  id="hq2faCode"
                  className="mono"
                  inputMode={method === "recovery_code" ? "text" : "numeric"}
                  autoComplete="one-time-code"
                  maxLength={method === "recovery_code" ? 10 : 6}
                  required
                  value={code}
                  onChange={(e) =>
                    setCode(
                      method === "recovery_code"
                        ? e.target.value.toUpperCase().slice(0, 10)
                        : e.target.value.replace(/\D/g, "").slice(0, 6)
                    )
                  }
                  placeholder={method === "recovery_code" ? "XXXX-XXXX" : "000000"}
                  style={{ textAlign: "center", fontSize: 22, letterSpacing: "0.28em", height: 50 }}
                />
              </div>

              <button type="submit" className="btn btn--primary btn--lg" disabled={busy || code.length < 6}>
                {busy ? "Verifying…" : "Unlock Admin Console"}
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setStep("credentials");
                    setCode("");
                    setError("");
                    setNotice("");
                  }}
                >
                  Back
                </button>
                {methods.includes("email_otp") ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={cooldown > 0}
                    onClick={() => void sendEmailCode()}
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Email security code"}
                  </button>
                ) : null}
              </div>
            </form>
          </>
        )}
      </div>

      <p style={{ marginTop: 18, textAlign: "center", fontSize: 12, color: "var(--ink-3)" }}>
        All HQ sign-in attempts and actions are recorded in the security audit log.
      </p>
    </div>
  );
}
