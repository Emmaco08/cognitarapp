"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BrandHeader } from "@/components/BrandHeader";
import { IconCheck, IconDownload } from "@/components/Icons";

const RELEASES_URL = "https://github.com/Emmaco08/cognitarapp/releases/latest";

type StageTab = "server" | "student" | "cloud";

interface PlanItem {
  id: string;
  slug: string;
  display_name: string;
  description: string;
  duration_days: number | null;
  lease_days: number;
  price_ngn_kobo: number;
  price_usd_cents: number;
  features_json?: { highlights?: string[] };
}

const FALLBACK_PLANS: PlanItem[] = [
  {
    id: "termly",
    slug: "termly",
    display_name: "Termly School Plan",
    description: "Run exams across every class for one full academic term.",
    duration_days: 120,
    lease_days: 30,
    price_ngn_kobo: 4500000,
    price_usd_cents: 3500,
    features_json: {
      highlights: [
        "Unlimited students, teachers, and exams",
        "Offline LAN server on one Windows PC",
        "Compressed cloud exam database backups",
      ],
    },
  },
  {
    id: "annual",
    slug: "annual",
    display_name: "Annual School Plan",
    description: "Full academic year coverage with priority support and savings.",
    duration_days: 365,
    lease_days: 30,
    price_ngn_kobo: 12000000,
    price_usd_cents: 9500,
    features_json: {
      highlights: [
        "Three academic terms with Common Entrance mode",
        "Instant Paystack receipt and signed licence key",
        "Automatic weekly cloud backup reminders",
      ],
    },
  },
  {
    id: "lifetime",
    slug: "lifetime",
    display_name: "Perpetual Campus Licence",
    description: "One-time purchase built for long-term school exam halls.",
    duration_days: null,
    lease_days: 90,
    price_ngn_kobo: 35000000,
    price_usd_cents: 28000,
    features_json: {
      highlights: [
        "Never expires on your school computer",
        "90-day offline lease window between check-ins",
        "Referral cash rewards and priority onboarding",
      ],
    },
  },
];

function fmtPrice(minor: number, currency: "NGN" | "USD") {
  const val = Number(minor || 0) / 100;
  if (currency === "USD") {
    return `$${val.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  return `₦${val.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export default function CloudHomePage() {
  const [stage, setStage] = useState<StageTab>("server");
  const [serverOnline, setServerOnline] = useState(true);
  const [pickedOption, setPickedOption] = useState("B");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [plans, setPlans] = useState<PlanItem[]>(FALLBACK_PLANS);

  useEffect(() => {
    fetch("/api/v1/plans")
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && Array.isArray(j.plans) && j.plans.length > 0) {
          setPlans(j.plans.slice(0, 3));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="lp-bleed">
      <BrandHeader variant="hero" />

      <main className="lp-wrap">
        {/* Monumental Centered Hero + Wide Interactive Product Stage */}
        <section className="lp-hero">
          <h1>Run school exams without relying on internet.</h1>
          <p>
            Install CogniTara Studio on one Windows PC to serve hundreds of student devices over
            local Wi-Fi, with automatic cloud backups.
          </p>
          <div className="lp-hero__cta">
            <Link href="/signup" className="btn btn--primary btn--lg">
              Create school account
            </Link>
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="lp-quiet-link">
              Download for Windows
            </a>
          </div>
        </section>

        <section className="lp-stage" aria-label="Interactive CogniTara preview">
          <div className="lp-stage__bar">
            <div className="lp-seg" role="tablist" aria-label="Choose product view">
              <button
                type="button"
                role="tab"
                aria-selected={stage === "server"}
                className={stage === "server" ? "is-active" : ""}
                onClick={() => setStage("server")}
              >
                Windows Exam Server
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={stage === "student"}
                className={stage === "student" ? "is-active" : ""}
                onClick={() => setStage("student")}
              >
                Student Exam Hall
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={stage === "cloud"}
                className={stage === "cloud" ? "is-active" : ""}
                onClick={() => setStage("cloud")}
              >
                Receipts &amp; Cloud Backups
              </button>
            </div>
            <span className="lp-stage__meta">
              {stage === "server"
                ? serverOnline
                  ? "Local LAN active on 192.168.10.24:5000"
                  : "Exam server paused cleanly"
                : stage === "student"
                  ? "Question 14 of 40 · Answers auto-saved locally"
                  : "SHA-256 verified snapshot · Instant Paystack receipt"}
            </span>
          </div>

          {stage === "server" ? (
            <div className="lp-stage__body">
              <div className="lp-stage__col">
                <h2 className="lp-stage__title">One Windows PC runs the entire exam hall.</h2>
                <p className="lp-stage__copy">
                  Start the local server in one click. Every laptop, tablet, or desktop on your
                  school router connects instantly with zero internet bandwidth required during the
                  exam.
                </p>
                <div className="lp-stage__rows">
                  <div className="lp-stage__row">
                    <span>Student network address</span>
                    <strong className="mono">http://192.168.10.24:5000</strong>
                  </div>
                  <div className="lp-stage__row">
                    <span>Connected exam devices</span>
                    <strong>{serverOnline ? "82 devices writing" : "0 devices"}</strong>
                  </div>
                  <div className="lp-stage__row">
                    <span>Disconnect auto-pause grace</span>
                    <strong>90 seconds with zero lost answers</strong>
                  </div>
                </div>
              </div>

              <div className="lp-stage__surface">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <strong style={{ fontSize: "0.9375rem" }}>CogniTara Studio Control</strong>
                  <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: serverOnline ? "var(--ok)" : "var(--ink-3)" }}>
                    {serverOnline ? "Running" : "Stopped"}
                  </span>
                </div>
                <p className="lp-stage__copy" style={{ fontSize: "0.8125rem" }}>
                  Try toggling the local exam server below. Stopping saves every open student answer
                  first so candidates resume right where they paused.
                </p>
                <button
                  type="button"
                  className={serverOnline ? "btn btn--outline" : "btn btn--primary"}
                  onClick={() => setServerOnline((v) => !v)}
                >
                  {serverOnline ? "Pause local exam server" : "Start local exam server"}
                </button>
              </div>
            </div>
          ) : stage === "student" ? (
            <div className="lp-stage__body">
              <div className="lp-stage__col">
                <h2 className="lp-stage__title">Calm, distraction-free student testing.</h2>
                <p className="lp-stage__copy">
                  Students sign in with their admission number on any browser. Scientific calculator
                  tools, rich mathematics rendering, and instant local saves work smoothly even if
                  Wi-Fi drops.
                </p>
                <div className="lp-stage__rows">
                  <div className="lp-stage__row">
                    <span>Active examination</span>
                    <strong>First Term Mathematics CBT</strong>
                  </div>
                  <div className="lp-stage__row">
                    <span>Answer persistence</span>
                    <strong style={{ color: "var(--ok)" }}>Saved locally in SQLite WAL</strong>
                  </div>
                  <div className="lp-stage__row">
                    <span>Built-in tools</span>
                    <strong>Scientific calculator &amp; formula display</strong>
                  </div>
                </div>
              </div>

              <div className="lp-stage__surface">
                <div style={{ fontSize: "0.9375rem", fontWeight: 640 }}>
                  Solve x² - 5x + 6 = 0 for x &gt; 2.
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {[
                    ["A", "x = 2"],
                    ["B", "x = 3"],
                    ["C", "x = 5"],
                    ["D", "x = 6"],
                  ].map(([k, txt]) => (
                    <button
                      key={k}
                      type="button"
                      className={`lp-opt ${pickedOption === k ? "is-picked" : ""}`}
                      onClick={() => setPickedOption(k)}
                    >
                      <b>{k}</b>
                      <span>{txt}</span>
                    </button>
                  ))}
                </div>
                <span style={{ fontSize: "0.8125rem", color: "var(--ink-3)" }}>
                  Selected option {pickedOption} saved immediately to your school server.
                </span>
              </div>
            </div>
          ) : (
            <div className="lp-stage__body">
              <div className="lp-stage__col">
                <h2 className="lp-stage__title">Instant receipts and safe cloud snapshots.</h2>
                <p className="lp-stage__copy">
                  Every Paystack payment generates a printable receipt, emails your school
                  automatically, and signs your offline Ed25519 licence. Back up your entire exam
                  database to CogniTara Cloud in one click.
                </p>
                <div className="lp-stage__rows">
                  <div className="lp-stage__row">
                    <span>Latest payment confirmation</span>
                    <strong style={{ color: "var(--ok)" }}>Verified &amp; emailed</strong>
                  </div>
                  <div className="lp-stage__row">
                    <span>Latest cloud exam backup</span>
                    <strong>18 exams · 1,420 questions · 311 KB</strong>
                  </div>
                  <div className="lp-stage__row">
                    <span>Backup reminder schedule</span>
                    <strong>Every 7 days in Studio &amp; Dashboard</strong>
                  </div>
                </div>
              </div>

              <div className="lp-stage__surface">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "var(--ok-soft)",
                      color: "var(--ok)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <IconCheck size={15} />
                  </span>
                  <strong style={{ fontSize: "0.9375rem" }}>Licence active on school PC</strong>
                </div>
                <div className="lp-stage__rows">
                  <div className="lp-stage__row">
                    <span>Licence key</span>
                    <strong className="mono">CT-ANN-4K92-M7P1</strong>
                  </div>
                  <div className="lp-stage__row">
                    <span>Cloud snapshot</span>
                    <strong className="mono">SHA-256 verified</strong>
                  </div>
                </div>
                <Link href="/signup" className="btn btn--primary">
                  Open school portal
                </Link>
              </div>
            </div>
          )}
        </section>

        {/* Below-the-Fold Editorial Split: How Schools Run Exam Day */}
        <section id="workflow" className="lp-section">
          <div className="lp-split">
            <div className="lp-split__sticky">
              <h2 className="lp-h2">Built for exam day, not ideal Wi-Fi.</h2>
              <p className="lp-body">
                Schools move from download to their first full-class computer-based test in under
                ten minutes, with zero cloud dependency while students write.
              </p>
            </div>

            <div className="lp-steps">
              <div className="lp-step">
                <h3>1. Create your school account and install Studio</h3>
                <p className="lp-body">
                  Register your school online, verify your email code, and run the lightweight
                  Windows installer on one lab or staff computer.
                </p>
              </div>
              <div className="lp-step">
                <h3>2. Author exams, import questions, and manage classes</h3>
                <p className="lp-body">
                  Teachers add questions with mathematics formulas, optional student photos of any
                  size, and control live papers from the Teacher Exam Control Center.
                </p>
              </div>
              <div className="lp-step">
                <h3>3. Back up to CogniTara Cloud and earn referral rewards</h3>
                <p className="lp-body">
                  Upload compressed, integrity-checked snapshots of your exam database whenever
                  internet is available, and share your school referral link for wallet commissions
                  and free bonus days.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Transparent Live Pricing */}
        <section id="pricing" className="lp-section">
          <div className="lp-pricing-head">
            <div style={{ display: "grid", gap: 8 }}>
              <h2 className="lp-h2">Simple licensing for every school size.</h2>
              <p className="lp-body">
                Pay securely with Paystack by card, bank transfer, or USSD. Receive a printable
                receipt and signed offline licence immediately.
              </p>
            </div>
            <div className="lp-seg" role="group" aria-label="Select currency">
              <button
                type="button"
                className={currency === "NGN" ? "is-active" : ""}
                onClick={() => setCurrency("NGN")}
              >
                NGN (₦)
              </button>
              <button
                type="button"
                className={currency === "USD" ? "is-active" : ""}
                onClick={() => setCurrency("USD")}
              >
                USD ($)
              </button>
            </div>
          </div>

          <div className="lp-pricing-grid">
            {plans.map((p, idx) => {
              const minor = currency === "USD" ? p.price_usd_cents : p.price_ngn_kobo;
              const highlights = p.features_json?.highlights || [];
              const featured = p.slug === "annual" || idx === 1;
              return (
                <article key={p.id} className={`lp-tier ${featured ? "is-featured" : ""}`}>
                  <h3 className="lp-tier__name">{p.display_name}</h3>
                  <div className="lp-tier__price">{fmtPrice(minor, currency)}</div>
                  <div className="lp-tier__meta">
                    {p.duration_days
                      ? `${p.duration_days} days access · ${p.lease_days}-day offline lease`
                      : `One-time purchase · ${p.lease_days}-day offline lease`}
                  </div>
                  <p className="lp-body">{p.description}</p>
                  <ul className="lp-tier__list">
                    {highlights.slice(0, 3).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <div style={{ marginTop: "auto" }}>
                    <Link
                      href="/signup"
                      className={featured ? "btn btn--primary" : "btn btn--outline"}
                      style={{ width: "100%" }}
                    >
                      Choose {p.display_name}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Focused Closing Band */}
        <section className="lp-closing">
          <h2 className="lp-h2">Ready to run calm, offline school exams?</h2>
          <p className="lp-body">
            Create your school account in under a minute and download CogniTara Studio for Windows.
          </p>
          <Link href="/signup" className="btn btn--primary btn--lg">
            Create school account
          </Link>
        </section>

        <footer className="lp-footer">
          <span>CogniTara School Examination Platform</span>
          <div className="lp-footer__links">
            <Link href="/signin">Sign in</Link>
            <Link href="/signup">Create account</Link>
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <IconDownload size={13} />
              <span>Windows Installer</span>
            </a>
            <Link href="/hq">Admin Console</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
