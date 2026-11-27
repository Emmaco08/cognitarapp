"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import LandingNav from "../../components/landing/LandingNav";
import LandingFooter from "../../components/landing/LandingFooter";

interface PlanItem {
  id: string;
  slug: string;
  display_name: string;
  description: string;
  badge: string;
  sort_order: number;
  duration_days: number | null;
  lease_days: number;
  price_ngn_kobo: number;
  price_usd_cents: number;
  max_devices: number;
  features?: string[] | { highlights?: string[]; bullets?: string[] };
}

interface PlatformDirectives {
  promo_banner_enabled?: boolean;
  promo_banner_event?: string;
  promo_banner_text?: string;
  promo_banner_code?: string;
  free_trial_enabled?: boolean;
  allow_trial_activation?: boolean;
  free_trial_days?: number;
  allow_paystack_checkout?: boolean;
  paystack_mode?: "test" | "live";
}

interface ReviewItem {
  id: string;
  school_name: string;
  author_name: string;
  author_role: string;
  city_state?: string;
  city_region?: string;
  rating: number;
  headline: string;
  body: string;
}

const FALLBACK_PLANS: PlanItem[] = [
  {
    id: "monthly",
    slug: "monthly",
    display_name: "Monthly School Plan",
    description: "Flexible month-to-month CBT licensing for up to 300 concurrent students.",
    badge: "",
    sort_order: 1,
    duration_days: 30,
    lease_days: 7,
    price_ngn_kobo: 2500000,
    price_usd_cents: 1900,
    max_devices: 1,
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
    lease_days: 14,
    price_ngn_kobo: 7500000,
    price_usd_cents: 5900,
    max_devices: 1,
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
    lease_days: 30,
    price_ngn_kobo: 22000000,
    price_usd_cents: 17900,
    max_devices: 1,
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
    lease_days: 90,
    price_ngn_kobo: 65000000,
    price_usd_cents: 49900,
    max_devices: 2,
    features: [
      "Perpetual school licence with no annual renewals",
      "Up to 2 Windows server installations",
      "90-day offline check-in windows",
      "All future CogniTara Studio desktop releases",
    ],
  },
];

function fmtMoney(minor: number, currency: "NGN" | "USD"): string {
  const sym = currency === "USD" ? "$" : "₦";
  const val = Math.round(Number(minor || 0) / 100);
  return `${sym}${val.toLocaleString(currency === "USD" ? "en-US" : "en-NG")}`;
}

function planBullets(plan: PlanItem): string[] {
  if (Array.isArray(plan.features) && plan.features.length > 0) {
    return plan.features.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }
  if (plan.features && !Array.isArray(plan.features)) {
    const arr = Array.isArray(plan.features.highlights)
      ? plan.features.highlights
      : Array.isArray(plan.features.bullets)
      ? plan.features.bullets
      : [];
    if (arr.length > 0) return arr;
  }
  const days = plan.duration_days;
  return [
    days && days < 36000 ? `${days} days full CBT server access` : "Perpetual school licence with no annual renewals",
    `${plan.lease_days || 14}-day offline LAN lease window`,
    "Unlimited students, teachers, and question banks",
    "Encrypted CogniTara Cloud database backups",
  ];
}

function shortPlanAction(plan: PlanItem): string {
  const cleaned = (plan.display_name || plan.slug || "")
    .replace(/\s*(Institutional|School|Campus|Plan)\b/gi, "")
    .trim();
  return `Pay for ${cleaned || "Licence"}`;
}

function initialsOf(name: string): string {
  const parts = (name || "CT").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export default function LicensePage() {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanItem[]>(FALLBACK_PLANS);
  const [platform, setPlatform] = useState<PlatformDirectives | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [carriedPromo, setCarriedPromo] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const curParam = (params.get("currency") || "").toUpperCase();
    const resolvedCur: "NGN" | "USD" = curParam === "USD" ? "USD" : "NGN";
    if (curParam === "USD" || curParam === "NGN") setCurrency(resolvedCur);

    const promoParam = (params.get("promo") || "").trim().toUpperCase();
    if (promoParam) setCarriedPromo(promoParam);

    // If a direct plan link arrived at /license?plan=annual, route straight to dedicated /pay/checkout
    const planParam = (params.get("plan") || "").trim().toLowerCase();
    if (planParam) {
      const qs = new URLSearchParams({ plan: planParam, currency: resolvedCur });
      if (promoParam) qs.set("promo", promoParam);
      router.replace(`/pay/checkout?${qs.toString()}`);
      return;
    }

    Promise.all([
      fetch("/api/v1/plans").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/v1/reviews?limit=6").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([plansData, revData]) => {
      if (!active) return;
      if (plansData?.ok) {
        if (Array.isArray(plansData.plans) && plansData.plans.length > 0) {
          setPlans(plansData.plans);
        }
        if (plansData.platform) setPlatform(plansData.platform);
      }
      if (revData?.ok && Array.isArray(revData.reviews)) {
        setReviews(revData.reviews);
      }
    });

    return () => {
      active = false;
    };
  }, [router]);

  const orderedPlans = useMemo(() => {
    return [...plans].sort((a, b) => {
      const sa = Number(a.sort_order ?? 99);
      const sb = Number(b.sort_order ?? 99);
      if (sa !== sb) return sa - sb;
      return (a.price_ngn_kobo || 0) - (b.price_ngn_kobo || 0);
    });
  }, [plans]);

  function checkoutHrefFor(plan: PlanItem, explicitPromo?: string): string {
    const qs = new URLSearchParams({
      plan: plan.slug || plan.id,
      currency,
    });
    const code = (explicitPromo || carriedPromo).trim().toUpperCase();
    if (code) qs.set("promo", code);
    return `/pay/checkout?${qs.toString()}`;
  }

  const showPromoBanner = Boolean(
    platform?.promo_banner_enabled &&
      (platform.promo_banner_event || platform.promo_banner_text || platform.promo_banner_code)
  );
  const trialEnabled = platform ? Boolean(platform.free_trial_enabled ?? platform.allow_trial_activation) : true;
  const trialDays = Number(platform?.free_trial_days || 7);

  const featuredPlanForBanner =
    orderedPlans.find((p) => (p.slug || "").toLowerCase().includes("annual")) || orderedPlans[0];

  const FAQS = [
    {
      q: "How do I activate or renew CogniTara Studio Desktop?",
      a: "All licence purchases and renewals happen exclusively on cognitara.net. Once Paystack confirms your payment, your Ed25519 licence key and downloadable PDF receipt appear immediately on screen and are emailed to your school address. Paste the key in CogniTara Studio Desktop under Licence to activate or renew.",
    },
    {
      q: "Where do I enter a discount code or 100% free redeem voucher?",
      a: "Select any school plan above to open our secure checkout page. You can enter either a discount code or a 100% free redeem voucher right on the checkout page before completing your order.",
    },
    ...(trialEnabled
      ? [
          {
            q: `What happens when my ${trialDays}-day free trial ends?`,
            a: "Nothing is deleted. Your exam database, students, and results remain safely on your Windows PC. Purchase a licence key on cognitara.net and paste it into CogniTara Studio Desktop to resume hosting live exams immediately.",
          },
        ]
      : []),
    {
      q: "Does CogniTara work without internet during exams?",
      a: "Yes. Every licence includes an offline Ed25519 cryptographic lease window (7 to 90 days depending on plan) so your school can run full exam sessions over local Wi-Fi with zero internet dependency.",
    },
    {
      q: "Are there any per-student charges?",
      a: "Never. One school licence covers unlimited registered students, unlimited teachers, unlimited question banks, and up to 300 concurrent student devices on your school LAN.",
    },
    {
      q: "Do we get an official payment receipt for school bursary records?",
      a: "Yes. Immediately after payment or voucher redemption, you can download a signed PDF payment receipt directly from the confirmation page, and a copy with your licence key is sent to your school email.",
    },
  ];

  return (
    <div className="rs-root">
      <LandingNav activePath="/license" />

      <main id="main-content" className="rs-subpage rs-lic-page">
        {/* Header */}
        <section className="rs-lic-hero">
          {showPromoBanner && featuredPlanForBanner ? (
            <Link
              href={checkoutHrefFor(featuredPlanForBanner, platform?.promo_banner_code || "")}
              className="rs-pill-badge"
            >
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

          <h1 className="rs-subpage-h1">Simple school licensing.</h1>
          <p className="rs-subpage-lead">
            {trialEnabled
              ? `Try CogniTara free for ${trialDays} days. Pick a school plan when ready, check out securely on cognitara.net, and receive your Ed25519 licence key and PDF receipt immediately.`
              : "Pick a school plan, check out securely via Paystack, and receive your offline Ed25519 licence key and official PDF receipt immediately."}
          </p>

          <div className="rs-lic-controls">
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

          {carriedPromo ? (
            <p className="rs-promo-ok" role="status">
              Offer code <strong>{carriedPromo}</strong> will be applied automatically on the next checkout step.
            </p>
          ) : null}
        </section>

        {/* Paid Plans Grid */}
        <section className="rs-container">
          <div className="rs-plans-grid">
            {orderedPlans.map((plan) => {
              const key = (plan.slug || plan.id || "").toLowerCase();
              const badge = (plan.badge || "").trim();
              const isFeatured = key.includes("annual") || badge.toLowerCase().includes("best");
              const baseMinor = Number(currency === "USD" ? plan.price_usd_cents : plan.price_ngn_kobo);
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
                      <h2 className="rs-plan-name">{plan.display_name}</h2>
                      {badge ? <span className="rs-plan-tag">{badge}</span> : null}
                    </div>
                    <p className="rs-plan-desc">{plan.description || ""}</p>
                  </div>

                  <div className="rs-plan-price">
                    <span>{fmtMoney(baseMinor, currency)}</span>
                  </div>
                  <p className="rs-plan-cadence">{cadence}</p>

                  <Link
                    href={checkoutHrefFor(plan)}
                    className={`rs-btn ${isFeatured ? "rs-btn--primary" : "rs-btn--soft"}`}
                    style={{ width: "100%" }}
                  >
                    {shortPlanAction(plan)}
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

          {/* HQ-Controlled Free Trial Card (shown ONLY when turned ON in /hq) */}
          {trialEnabled ? (
            <div className="rs-trial-card">
              <div className="rs-trial-left">
                <div className="rs-trial-top">
                  <span className="rs-trial-badge">Free trial</span>
                  <span className="rs-trial-price">{currency === "USD" ? "$0" : "₦0"}</span>
                </div>
                <h3>Try everything on your Windows PC for {trialDays} days</h3>
                <p>
                  No card required. Test live mock exams, KaTeX math equations, teacher grading, and LAN student logins right inside your computer lab before purchasing a licence key.
                </p>
                <div className="rs-trial-actions">
                  <Link href="/download" className="rs-btn rs-btn--primary">
                    Download for Windows
                  </Link>
                </div>
              </div>
              <ul className="rs-trial-list">
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                  <span>Full CogniTara Studio desktop server</span>
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                  <span>Every feature unlocked for {trialDays} days</span>
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                  <span>Zero exam-day internet required</span>
                </li>
                <li>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                  <span>Activate a paid licence key anytime without losing data</span>
                </li>
              </ul>
            </div>
          ) : null}

          <div className="rs-lic-trust">
            <p>Instant Ed25519 licence key · Official PDF receipt · Discount &amp; redeem codes available at checkout</p>
            <p>Have a 100% free school voucher or promo code? Pick any plan above and enter your code on the checkout page.</p>
          </div>
        </section>

        {/* Verified Reviews */}
        {reviews.length > 0 ? (
          <section className="rs-container rs-container--narrow" style={{ marginTop: 84 }}>
            <div className="rs-section-head">
              <h2 className="rs-h2">Loved by schools who use it</h2>
            </div>
            <div className="rs-reviews-grid">
              {reviews.slice(0, 6).map((rev) => (
                <figure key={rev.id} className="rs-review-card">
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
                        {[rev.author_role, rev.school_name, rev.city_region || rev.city_state].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        {/* Before you buy FAQ */}
        <section className="rs-faq-wrap">
          <h2 className="rs-h2" style={{ textAlign: "center", marginBottom: 32 }}>
            Before you buy
          </h2>
          <div className="rs-faq-list">
            {FAQS.map((item) => (
              <div key={item.q} className="rs-faq-item">
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
          </div>
          <div className="rs-faq-foot">
            <p>
              Need help choosing? Email <a href="mailto:hello@cognitara.net">hello@cognitara.net</a>.
            </p>
            <p>
              Already have a licence? <a href="https://portal.cognitara.net/admin">Manage it in your Admin Portal</a>.
            </p>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
