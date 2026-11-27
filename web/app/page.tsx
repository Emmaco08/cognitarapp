"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LandingNav from "../components/landing/LandingNav";
import LandingFooter from "../components/landing/LandingFooter";
import LenisGsapScope from "../components/landing/LenisGsapScope";
import HeroProductTour from "../components/landing/HeroProductTour";
import ResurfBentoGrid from "../components/landing/ResurfBentoGrid";
import FormatMarquee from "../components/landing/FormatMarquee";
import MultiDeviceShowcase from "../components/landing/MultiDeviceShowcase";
import LandingSupportBand from "../components/landing/LandingSupportBand";

interface Plan {
  id: string;
  slug?: string;
  display_name?: string;
  name?: string;
  description?: string;
  badge?: string;
  sort_order?: number;
  billing_cycle?: string;
  duration_days: number | null;
  price_ngn_kobo: number;
  price_usd_cents: number;
  lease_days: number;
  features?: string[] | { bullets?: string[]; highlights?: string[]; [key: string]: unknown };
}

interface PlatformDirectives {
  promo_banner_enabled?: boolean;
  promo_banner_event?: string;
  promo_banner_text?: string;
  promo_banner_code?: string;
  free_trial_enabled?: boolean;
  allow_trial_activation?: boolean;
  free_trial_days?: number;
}

interface ReviewItem {
  id: string;
  school_name: string;
  author_name: string;
  author_role: string;
  city_region?: string;
  city_state?: string;
  rating: number;
  headline: string;
  body: string;
  featured: boolean;
}

const FALLBACK_PLANS: Plan[] = [
  {
    id: "monthly",
    slug: "monthly",
    display_name: "Monthly School Plan",
    description: "Flexible month-to-month CBT licensing for up to 300 concurrent students.",
    badge: "",
    sort_order: 1,
    duration_days: 30,
    price_ngn_kobo: 2500000,
    price_usd_cents: 1900,
    lease_days: 7,
    features: [
      "30 days full CBT server access",
      "7-day offline LAN lease window",
      "Unlimited students, teachers, and question banks",
      "Encrypted CogniTara Cloud database backups",
    ],
  },
  {
    id: "termly",
    slug: "termly",
    display_name: "Termly School Plan",
    description: "Full 120-day academic term coverage built for WAEC, BECE, and mock exams.",
    badge: "Popular",
    sort_order: 2,
    duration_days: 120,
    price_ngn_kobo: 7500000,
    price_usd_cents: 5500,
    lease_days: 14,
    features: [
      "120 days full CBT server access",
      "14-day offline LAN lease window",
      "Common Entrance admissions portal included",
      "Encrypted cloud snapshots and priority support",
    ],
  },
  {
    id: "annual",
    slug: "annual",
    display_name: "Annual School Plan",
    description: "Full 365-day institutional licence covering all three academic terms.",
    badge: "Best Value",
    sort_order: 3,
    duration_days: 365,
    price_ngn_kobo: 22000000,
    price_usd_cents: 15500,
    lease_days: 30,
    features: [
      "365 days full CBT server access",
      "30-day offline LAN lease window",
      "Dedicated onboarding and legacy database migration",
      "Unlimited cloud backup history for the session",
    ],
  },
  {
    id: "lifetime",
    slug: "lifetime",
    display_name: "Lifetime Institutional Plan",
    description: "One-time perpetual institutional licence with 90-day offline check-in windows.",
    badge: "Institutional",
    sort_order: 4,
    duration_days: null,
    price_ngn_kobo: 65000000,
    price_usd_cents: 45000,
    lease_days: 90,
    features: [
      "Perpetual school licence with no annual renewals",
      "90-day offline check-in windows",
      "All future CogniTara Studio desktop releases",
      "Direct engineering support channel",
    ],
  },
];

const HERO_CYCLE_LINES = [
  "that works offline.",
  "on one Windows PC.",
  "built for real exam halls.",
  "with data you own.",
];

function planTitle(plan: Plan): string {
  return (plan.display_name || plan.name || plan.slug || plan.id || "School Plan").trim();
}

function planBullets(plan: Plan): string[] {
  if (Array.isArray(plan.features) && plan.features.length > 0) {
    return plan.features.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }
  if (plan.features && !Array.isArray(plan.features)) {
    const arr = Array.isArray(plan.features.highlights)
      ? plan.features.highlights
      : Array.isArray(plan.features.bullets)
      ? plan.features.bullets
      : [];
    if (arr.length > 0) {
      return arr.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0);
    }
  }
  const days = plan.duration_days;
  return [
    days && days < 36000 ? `${days} days full CBT server access` : "Perpetual school licence with no annual renewals",
    `${plan.lease_days || 14}-day offline LAN lease window`,
    "Unlimited students, teachers, and question banks",
    "Encrypted CogniTara Cloud database backups",
  ];
}

function fmtPrice(plan: Plan, currency: "NGN" | "USD"): string {
  if (currency === "NGN") {
    return `₦${Math.round((plan.price_ngn_kobo || 0) / 100).toLocaleString("en-NG")}`;
  }
  return `$${Math.round((plan.price_usd_cents || 0) / 100).toLocaleString("en-US")}`;
}

function shortCtaLabel(plan: Plan): string {
  const cleaned = planTitle(plan)
    .replace(/\s*(Institutional|School|Campus|Plan)\b/gi, "")
    .trim();
  return `Buy ${cleaned || plan.slug || plan.id}`;
}

function initialsOf(name: string): string {
  const parts = (name || "CT").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export default function LandingPage() {
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [platform, setPlatform] = useState<PlatformDirectives | null>(null);
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [heroIdx, setHeroIdx] = useState(0);

  // Kinetic hero line cycle matching resurf.so
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const id = window.setInterval(() => {
      setHeroIdx((i) => (i + 1) % HERO_CYCLE_LINES.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, []);

  // Live plans & HQ public directives (including promo banner & free trial settings)
  useEffect(() => {
    let active = true;
    fetch("/api/v1/plans")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data?.ok) return;
        if (Array.isArray(data.plans) && data.plans.length > 0) {
          setPlans(data.plans);
        }
        if (data.platform) {
          setPlatform(data.platform);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Live verified school reviews from /api/v1/reviews
  useEffect(() => {
    let active = true;
    fetch("/api/v1/reviews?limit=6")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.ok && Array.isArray(data.reviews)) {
          setReviews(data.reviews);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const orderedPlans = useMemo(() => {
    return [...plans].sort((a, b) => {
      const sa = Number(a.sort_order ?? 99);
      const sb = Number(b.sort_order ?? 99);
      if (sa !== sb) return sa - sb;
      return (a.price_ngn_kobo || 0) - (b.price_ngn_kobo || 0);
    });
  }, [plans]);

  const showPromoBanner = Boolean(
    platform?.promo_banner_enabled &&
      (platform.promo_banner_event || platform.promo_banner_text || platform.promo_banner_code)
  );
  const promoHref = platform?.promo_banner_code
    ? `/license?promo=${encodeURIComponent(platform.promo_banner_code)}`
    : "/license";
  const trialEnabled = platform ? Boolean(platform.free_trial_enabled ?? platform.allow_trial_activation) : false;
  const trialDays = Number(platform?.free_trial_days || 7);

  return (
    <LenisGsapScope>
      <LandingNav activePath="/" />

      <main id="main-content">
        {/* 1. QUIET EDITORIAL HERO */}
        <section className="rs-hero">
          <div className="rs-hero-copy">
            {showPromoBanner ? (
              <Link href={promoHref} className="rs-pill-badge">
                {platform?.promo_banner_event ? (
                  <span className="rs-pill-dot">{platform.promo_banner_event}</span>
                ) : null}
                {platform?.promo_banner_text ? <span>{platform.promo_banner_text}</span> : null}
                {platform?.promo_banner_code ? (
                  <code className="rs-pill-code">{platform.promo_banner_code}</code>
                ) : null}
                <span className="rs-pill-arrow" aria-hidden="true">→</span>
              </Link>
            ) : null}

            <div className="rs-h1-group">
              <h1 className="rs-h1">A Local School Exam Server</h1>
              <span className="rs-h1-cycle" aria-hidden="true">
                {HERO_CYCLE_LINES.map((line, idx) => {
                  const prevIdx = (heroIdx - 1 + HERO_CYCLE_LINES.length) % HERO_CYCLE_LINES.length;
                  const state = idx === heroIdx ? "active" : idx === prevIdx ? "exit" : "idle";
                  return (
                    <span key={line} className="rs-h1-line" data-state={state}>
                      {line}
                    </span>
                  );
                })}
              </span>
            </div>

            <p className="rs-lead">
              Install CogniTara Studio on one lab computer to serve timed exams to up to 300 student devices over school Wi-Fi. Instant grading, math formulas, and encrypted cloud backups.
            </p>
          </div>

          <div className="rs-hero-actions">
            <div className="rs-cta-row">
              <Link href="/download" className="rs-btn rs-btn--primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M3 5.5L10.5 4.4V11.5H3V5.5ZM11.5 4.25L21 2.9V11.5H11.5V4.25ZM3 12.5H10.5V19.6L3 18.5V12.5ZM11.5 12.5H21V21.1L11.5 19.75V12.5Z" />
                </svg>
                <span>Download for Windows</span>
              </Link>
              <Link href="/license" className="rs-btn rs-btn--soft">
                <span>Buy a license</span>
              </Link>
            </div>

            <p className="rs-meta-strip">
              <span className="rs-meta-item">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M3 5.5L10.5 4.4V11.5H3V5.5ZM11.5 4.25L21 2.9V11.5H11.5V4.25ZM3 12.5H10.5V19.6L3 18.5V12.5ZM11.5 12.5H21V21.1L11.5 19.75V12.5Z" />
                </svg>
                Windows 10 &amp; 11
              </span>
              <span className="rs-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3a14.5 14.5 0 0 1 0 18M12 3a14.5 14.5 0 0 0 0 18" />
                </svg>
                Any classroom browser
              </span>
              <span className="rs-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4z" />
                </svg>
                Ed25519 offline licensing
              </span>
            </p>
          </div>
        </section>

        {/* 2. LAPTOP-SIZE PRODUCT TOUR CAROUSEL */}
        <HeroProductTour />

        {/* 3..8. RESURF SECTION STACK */}
        <div className="rs-sections">
          {/* 3. 12-CARD SOFTLY SHADED BENTO GRID */}
          <ResurfBentoGrid />

          {/* 4. DUAL-ROW FORMAT MARQUEE */}
          <FormatMarquee />

          {/* 5. BUILT FOR EVERY CLASSROOM DEVICE */}
          <MultiDeviceShowcase />

          {/* 6. VERIFIED SCHOOL REVIEWS (/api/v1/reviews) */}
          <section id="reviews" className="rs-container rs-container--narrow" data-rs-reveal>
            <div className="rs-section-head">
              <h2 className="rs-h2">Loved by schools on exam day</h2>
            </div>

            {reviews.length > 0 ? (
              <div className="rs-reviews-grid">
                {reviews.slice(0, 6).map((rev) => {
                  const stars = Math.max(1, Math.min(5, Number(rev.rating || 5)));
                  return (
                    <figure key={rev.id} className="rs-review-card">
                      <div className="rs-review-stars" aria-label={`Rated ${stars} out of 5 stars`}>
                        <span>{"★".repeat(stars)}</span>
                        {stars < 5 ? (
                          <span className="rs-review-stars-dim">{"★".repeat(5 - stars)}</span>
                        ) : null}
                      </div>
                      <blockquote className="rs-review-quote">
                        <p>
                          “{rev.headline ? `${rev.headline}. ` : ""}
                          {rev.body}”
                        </p>
                      </blockquote>
                      <figcaption className="rs-review-author">
                        <span className="rs-review-avatar" aria-hidden="true">
                          {initialsOf(rev.author_name || rev.school_name)}
                        </span>
                        <div className="rs-review-meta">
                          <p className="rs-review-name">{rev.author_name || rev.school_name}</p>
                          <p className="rs-review-school">
                            {[rev.author_role, rev.school_name, rev.city_region || rev.city_state]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            ) : (
              <div className="rs-review-empty">
                <h3>Verified reviews from schools running live exams</h3>
                <p>
                  Principals and ICT coordinators submit ratings directly inside CogniTara Studio Desktop or share feedback with our team. Every verified review appears here automatically once published in CogniTara HQ.
                </p>
              </div>
            )}
          </section>

          {/* 7. QUIET INSTITUTIONAL PRICING (/api/v1/plans) */}
          <section id="pricing" className="rs-container" data-rs-reveal>
            <div className="rs-section-head">
              <h2 className="rs-h2">Simple school licensing, zero per-student fees.</h2>
              <p className="rs-section-sub">
                Pay securely via Paystack online or by direct bank transfer inside CogniTara Studio. Receive a hardware-bound Ed25519 licence key immediately.
              </p>

              <div className="rs-currency-switch" role="group" aria-label="Currency selector">
                <button
                  type="button"
                  className="rs-currency-btn"
                  aria-pressed={currency === "NGN"}
                  onClick={() => setCurrency("NGN")}
                >
                  NGN (₦)
                </button>
                <button
                  type="button"
                  className="rs-currency-btn"
                  aria-pressed={currency === "USD"}
                  onClick={() => setCurrency("USD")}
                >
                  USD ($)
                </button>
              </div>
            </div>

            <div className="rs-plans-grid" data-rs-stagger>
              {orderedPlans.map((plan) => {
                const key = (plan.slug || plan.id || "").toLowerCase();
                const badge = (plan.badge || "").trim();
                const isFeatured =
                  key.includes("annual") || badge.toLowerCase().includes("best");
                const days = plan.duration_days;
                const cadence =
                  days === null || days >= 36000
                    ? `${currency} one-time · ${plan.lease_days || 90}-day offline lease`
                    : `${currency} per ${days} days · ${plan.lease_days || 14}-day offline lease`;
                return (
                  <article
                    key={plan.id}
                    className={`rs-plan-card${isFeatured ? " rs-plan-card--featured" : ""}`}
                  >
                    <div className="rs-plan-header">
                      <div className="rs-plan-top">
                        <h3 className="rs-plan-name">{planTitle(plan)}</h3>
                        {badge && <span className="rs-plan-tag">{badge}</span>}
                      </div>
                      <p className="rs-plan-desc">{plan.description || ""}</p>
                    </div>
                    <div className="rs-plan-price">{fmtPrice(plan, currency)}</div>
                    <p className="rs-plan-cadence">{cadence}</p>

                    <Link
                      href={`/license?plan=${encodeURIComponent(plan.slug || plan.id)}&currency=${currency}`}
                      className={`rs-btn ${isFeatured ? "rs-btn--primary" : "rs-btn--soft"}`}
                      style={{ width: "100%" }}
                    >
                      {shortCtaLabel(plan)}
                    </Link>

                    <ul className="rs-plan-features">
                      {planBullets(plan).slice(0, 4).map((feat) => (
                        <li key={feat}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </section>

          {/* 8. QUIET CLOSING CTA */}
          <section className="rs-closing" data-rs-reveal>
            <h2 className="rs-h2">
              Start running offline exams
              <br />
              from one school PC.
            </h2>
            <div className="rs-closing-cta">
              <Link href="/download" className="rs-btn rs-btn--primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M3 5.5L10.5 4.4V11.5H3V5.5ZM11.5 4.25L21 2.9V11.5H11.5V4.25ZM3 12.5H10.5V19.6L3 18.5V12.5ZM11.5 12.5H21V21.1L11.5 19.75V12.5Z" />
                </svg>
                <span>Download for Windows</span>
              </Link>
              <p className="rs-closing-meta">
                {trialEnabled ? `${trialDays}-day free trial · ` : ""}Windows 10 &amp; 11 (64-bit) · Supports up to 300 student devices on local Wi-Fi
              </p>
            </div>
          </section>
        </div>

        {/* 9. SUPPORT BAND AT THE TOP OF THE FOOTER */}
        <LandingSupportBand />
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
