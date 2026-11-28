"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import LandingNav from "../../components/landing/LandingNav";
import LandingFooter from "../../components/landing/LandingFooter";
import { CogniTaraMark } from "../../components/CogniTaraLogo";

interface PlatformInfo {
  free_trial_enabled?: boolean;
  allow_trial_activation?: boolean;
  free_trial_days?: number;
}

interface PlanSummary {
  slug?: string;
  price_ngn_kobo?: number;
  price_usd_cents?: number;
}

export default function DownloadPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{
    email: string;
    email_sent: boolean;
    download_url: string;
    latest_version: string;
    message: string;
  } | null>(null);
  const [platform, setPlatform] = useState<PlatformInfo | null>(null);
  const [startingNgn, setStartingNgn] = useState("₦25,000");

  useEffect(() => {
    let active = true;
    fetch("/api/v1/plans")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.ok) return;
        if (data.platform) setPlatform(data.platform);
        if (Array.isArray(data.plans) && data.plans.length > 0) {
          const paid = (data.plans as PlanSummary[])
            .filter((p) => Number(p.price_ngn_kobo || 0) > 0)
            .sort((a, b) => Number(a.price_ngn_kobo || 0) - Number(b.price_ngn_kobo || 0));
          if (paid[0]?.price_ngn_kobo) {
            setStartingNgn(`₦${Math.round(paid[0].price_ngn_kobo / 100).toLocaleString("en-NG")}`);
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const clean = email.trim();
    if (!clean || !clean.includes("@")) {
      setError("Enter a valid email address so we can send you the latest Windows installer link.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/download/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean, source: "download_page" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || "Could not send your download link right now. Please try again.");
        setSubmitting(false);
        return;
      }
      setResult({
        email: String(data.email || clean),
        email_sent: Boolean(data.email_sent),
        download_url: String(data.download_url || "/api/v1/download/windows"),
        latest_version: String(data.latest_version || "v2.6.0"),
        message: String(data.message || ""),
      });
    } catch {
      setError("Could not reach CogniTara right now. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopyLink() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/api/v1/download/windows?source=copy_link`
        : "https://cognitara-cloud.vercel.app/api/v1/download/windows";
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const trialEnabled = platform ? Boolean(platform.free_trial_enabled ?? platform.allow_trial_activation) : true;
  const trialDays = Number(platform?.free_trial_days || 7);

  return (
    <div className="rs-root">
      <LandingNav activePath="/download" />

      <main id="main-content" className="rs-subpage">
        {/* Hero Email Capture Block (matching resurf.so/download) */}
        <section className="rs-dl-hero">
          <div className="rs-dl-icon" aria-hidden="true">
            <CogniTaraMark size={28} />
          </div>
          <h1 className="rs-subpage-h1">Get CogniTara on your Windows PC</h1>
          <p className="rs-subpage-lead">
            CogniTara Studio is a Windows desktop exam server. Send yourself the latest installer link so you can open it on your exam lab PC and stay notified of new releases.
          </p>

          {result ? (
            <div className="rs-dl-sent" role="status">
              <div className="rs-dl-sent-head">
                <span className="rs-dl-sent-check" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                <div>
                  <strong>{result.email_sent ? "Download link sent to your inbox" : "Email saved for update alerts"}</strong>
                  <p>{result.message}</p>
                </div>
              </div>

              <div className="rs-dl-sent-actions">
                <a href={result.download_url} className="rs-btn rs-btn--primary">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M3 5.5L10.5 4.4V11.5H3V5.5ZM11.5 4.25L21 2.9V11.5H11.5V4.25ZM3 12.5H10.5V19.6L3 18.5V12.5ZM11.5 12.5H21V21.1L11.5 19.75V12.5Z" />
                  </svg>
                  <span>Download installer ({result.latest_version})</span>
                </a>
                <button
                  type="button"
                  className="rs-btn rs-btn--soft"
                  onClick={() => {
                    setResult(null);
                    setEmail("");
                  }}
                >
                  Send to another email
                </button>
              </div>
            </div>
          ) : (
            <form className="rs-dl-form" onSubmit={handleSubmit} noValidate>
              <div className="rs-dl-input-row">
                <label htmlFor="dlEmail" className="rs-sr-only">
                  Your email address
                </label>
                <input
                  id="dlEmail"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder="principal@school.edu.ng"
                  autoComplete="email"
                  className="rs-input"
                />
                <button type="submit" className="rs-btn rs-btn--primary" disabled={submitting}>
                  {submitting ? "Sending link…" : "Email me the Windows link"}
                </button>
              </div>

              {error ? (
                <p className="rs-form-error" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="rs-dl-secondary-row">
                <button type="button" className="rs-inline-action" onClick={handleCopyLink}>
                  {copied ? "Link copied to clipboard" : "Or copy the link"}
                </button>
                <span className="rs-dl-dot" aria-hidden="true">·</span>
                <a href="/api/v1/download/windows?source=direct_click" className="rs-inline-action">
                  On Windows right now? Download directly
                </a>
              </div>
            </form>
          )}

          <p className="rs-dl-footnote">
            {trialEnabled ? `${trialDays}-day free trial · ` : ""}Windows 10 &amp; 11 (64-bit) · Works completely offline on school Wi-Fi
          </p>
        </section>

        {/* Soft Shaded Cards Stack (matching resurf.so/download) */}
        <section className="rs-dl-cards">
          <div className="rs-dl-card">
            <div className="rs-dl-card-eyebrow">License</div>
            <div className="rs-dl-card-split">
              <div>
                <h2>Simple school licensing.</h2>
                <p className="rs-dl-card-price">
                  From <strong>{startingNgn}</strong>
                  <span> · zero per-student fees</span>
                </p>
                <p className="rs-dl-card-note">
                  {trialEnabled
                    ? `${trialDays} days free, no card needed. Termly, Annual, and Lifetime institutional plans available.`
                    : "Flexible Monthly, Termly, Annual, and Lifetime institutional plans via Paystack."}
                </p>
              </div>
              <Link href="/license" className="rs-btn rs-btn--soft">
                See plans
              </Link>
            </div>
          </div>

          <div className="rs-dl-card">
            <div className="rs-dl-card-eyebrow">Included in one installer</div>
            <div className="rs-dl-two-col">
              <div>
                <h3>Local LAN Exam Server</h3>
                <p>
                  Serves Admin, Teacher, Student, and Common Entrance portals over your school router to up to 300 devices simultaneously.
                </p>
              </div>
              <div>
                <h3>Encrypted Cloud Backups</h3>
                <p>
                  Snapshot your entire school exam database and results vault to CogniTara Cloud whenever internet is available.
                </p>
              </div>
            </div>
          </div>

          <div className="rs-dl-card rs-dl-card--compact">
            <div className="rs-dl-card-eyebrow">Help</div>
            <p className="rs-dl-help-copy">
              Need help setting up your school lab PC or migrating an older CBT database? Email{" "}
              <a href="mailto:hello@cognitara.net">hello@cognitara.net</a> or sign in to your{" "}
              <a href="https://portal.cognitara.net/admin">Admin Portal</a>.
            </p>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
