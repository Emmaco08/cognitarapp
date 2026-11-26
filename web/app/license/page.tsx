"use client";

import Link from "next/link";
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
  paystack_fee_mode?: "merchant" | "customer_added" | "paystack_checkout";
  paystack_fee_pct?: number;
  paystack_fee_flat_ngn?: number;
  paystack_fee_cap_ngn?: number;
  paystack_fee_flat_threshold_ngn?: number;
}

interface ReviewItem {
  id: string;
  school_name: string;
  author_name: string;
  author_role: string;
  city_state: string;
  rating: number;
  headline: string;
  body: string;
}

interface AuthSessionInfo {
  email: string;
  full_name: string;
  school_name: string;
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
  return `Buy ${cleaned || "Licence"}`;
}

function initialsOf(name: string): string {
  const parts = (name || "CT").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export default function LicensePage() {
  const [plans, setPlans] = useState<PlanItem[]>(FALLBACK_PLANS);
  const [platform, setPlatform] = useState<PlatformDirectives | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [session, setSession] = useState<AuthSessionInfo | null>(null);
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");

  // Promo code state
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discount_kind: string;
    discount_value: number;
    message: string;
  } | null>(null);
  const [promoErr, setPromoErr] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);

  // Checkout modal state
  const [selectedPlan, setSelectedPlan] = useState<PlanItem | null>(null);
  const [buyerSchool, setBuyerSchool] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutErr, setCheckoutErr] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const curParam = (params.get("currency") || "").toUpperCase();
    if (curParam === "USD" || curParam === "NGN") setCurrency(curParam);
    const promoParam = (params.get("promo") || "").trim().toUpperCase();
    const planParam = (params.get("plan") || "").trim().toLowerCase();

    Promise.all([
      fetch("/api/v1/plans").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/v1/reviews?limit=6").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/v1/auth/me?optional=1", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([plansData, revData, meData]) => {
      if (!active) return;
      let loadedPlans: PlanItem[] = FALLBACK_PLANS;
      if (plansData?.ok) {
        if (Array.isArray(plansData.plans) && plansData.plans.length > 0) {
          loadedPlans = plansData.plans;
          setPlans(plansData.plans);
        }
        if (plansData.platform) setPlatform(plansData.platform);
      }
      if (revData?.ok && Array.isArray(revData.reviews)) {
        setReviews(revData.reviews);
      }
      if (meData?.ok && meData.user) {
        setSession({
          email: String(meData.user.email || ""),
          full_name: String(meData.user.full_name || ""),
          school_name: String(meData.school?.school_name || ""),
        });
      }
      if (promoParam) {
        setPromoInput(promoParam);
        const target = loadedPlans[0];
        if (target?.id && /^[0-9a-f-]{36}$/i.test(target.id)) {
          void validatePromo(promoParam, target.id, curParam === "USD" ? "USD" : "NGN");
        }
      }
      if (planParam) {
        const match = loadedPlans.find(
          (p) => p.slug?.toLowerCase() === planParam || p.id.toLowerCase() === planParam
        );
        if (match) setSelectedPlan(match);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function validatePromo(rawCode: string, planId: string, cur: "NGN" | "USD") {
    const clean = rawCode.trim().toUpperCase();
    if (!clean) {
      setAppliedPromo(null);
      setPromoErr("");
      return;
    }
    setPromoBusy(true);
    setPromoErr("");
    try {
      const res = await fetch("/api/v1/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean, plan_id: planId, currency: cur }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setAppliedPromo(null);
        setPromoErr(data.message || "Promo code is invalid or expired.");
      } else if (data.code_type === "redeem") {
        setAppliedPromo(null);
        setPromoErr("That is a 100% free voucher code. Sign in to your school dashboard to redeem it for free.");
      } else {
        setAppliedPromo({
          code: String(data.code || clean),
          discount_kind: String(data.discount_kind || "percent"),
          discount_value: Number(data.discount_value || 0),
          message: String(data.message || "Discount applied."),
        });
      }
    } catch {
      setPromoErr("Could not validate promo code right now.");
    } finally {
      setPromoBusy(false);
    }
  }

  function computeDiscountedMinor(baseMinor: number): number {
    if (!appliedPromo) return baseMinor;
    if (appliedPromo.discount_kind === "percent") {
      const off = Math.round((baseMinor * Math.min(100, Math.max(0, appliedPromo.discount_value))) / 100);
      return Math.max(0, baseMinor - off);
    }
    if (appliedPromo.discount_kind === "fixed_ngn" && currency === "NGN") {
      return Math.max(0, baseMinor - Math.round(appliedPromo.discount_value * 100));
    }
    if (appliedPromo.discount_kind === "fixed_usd" && currency === "USD") {
      return Math.max(0, baseMinor - Math.round(appliedPromo.discount_value * 100));
    }
    return baseMinor;
  }

  const orderedPlans = useMemo(() => {
    return [...plans].sort((a, b) => {
      const sa = Number(a.sort_order ?? 99);
      const sb = Number(b.sort_order ?? 99);
      if (sa !== sb) return sa - sb;
      return (a.price_ngn_kobo || 0) - (b.price_ngn_kobo || 0);
    });
  }, [plans]);

  async function handleStartCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlan) return;
    setCheckoutErr("");
    setCheckoutBusy(true);

    try {
      const endpoint = session
        ? "/api/v1/payments/paystack/initialize"
        : "/api/v1/payments/paystack/quick-checkout";
      const payload = session
        ? {
            plan_id: selectedPlan.id,
            currency,
            promo_code: appliedPromo?.code || undefined,
            source: "web",
          }
        : {
            plan_id: selectedPlan.id,
            currency,
            promo_code: appliedPromo?.code || undefined,
            email: buyerEmail.trim(),
            school_name: buyerSchool.trim(),
            full_name: buyerName.trim() || undefined,
          };

      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.authorization_url) {
        setCheckoutErr(data.message || "Could not start Paystack checkout right now.");
        setCheckoutBusy(false);
        return;
      }
      window.location.href = String(data.authorization_url);
    } catch {
      setCheckoutErr("Network error while reaching Paystack. Please try again.");
      setCheckoutBusy(false);
    }
  }

  const showPromoBanner = Boolean(
    platform?.promo_banner_enabled &&
      (platform.promo_banner_event || platform.promo_banner_text || platform.promo_banner_code)
  );
  const trialEnabled = platform ? Boolean(platform.free_trial_enabled ?? platform.allow_trial_activation) : true;
  const trialDays = Number(platform?.free_trial_days || 7);

  const FAQS = [
    {
      q: "How do I receive my licence key after paying?",
      a: "As soon as Paystack confirms your payment, your Ed25519 licence key appears immediately on the confirmation screen and is also emailed to your school address. Paste it into CogniTara Studio Desktop under Licence to activate.",
    },
    ...(trialEnabled
      ? [
          {
            q: `What happens when my ${trialDays}-day free trial ends?`,
            a: "Nothing is deleted. Your exam database, students, and results remain safely on your Windows PC. Entering a school licence key unlocks hosting new live exams right where you left off.",
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
      q: "What if we change our school lab PC?",
      a: "Each licence binds securely to your server computer's hardware ID. If you replace or upgrade your lab PC, contact support or request a hardware reset from your account.",
    },
    {
      q: "Which payment methods does Paystack accept?",
      a: "Paystack supports Nigerian debit/credit cards, instant Paystack-Titan bank transfer, USSD, and international USD cards.",
    },
  ];

  const selectedOrigMinor = selectedPlan
    ? Number(currency === "USD" ? selectedPlan.price_usd_cents : selectedPlan.price_ngn_kobo)
    : 0;
  const selectedFinalMinor = computeDiscountedMinor(selectedOrigMinor);

  return (
    <div className="rs-root">
      <LandingNav activePath="/license" />

      <main id="main-content" className="rs-subpage">
        {/* Header */}
        <section className="rs-lic-hero">
          {showPromoBanner ? (
            <button
              type="button"
              className="rs-pill-badge"
              onClick={() => {
                if (platform?.promo_banner_code) {
                  setPromoInput(platform.promo_banner_code);
                  const first = orderedPlans[0];
                  if (first?.id) void validatePromo(platform.promo_banner_code, first.id, currency);
                }
              }}
            >
              {platform?.promo_banner_event ? (
                <span className="rs-pill-dot">{platform.promo_banner_event}</span>
              ) : null}
              {platform?.promo_banner_text ? <span>{platform.promo_banner_text}</span> : null}
              {platform?.promo_banner_code ? (
                <code className="rs-pill-code">{platform.promo_banner_code}</code>
              ) : null}
              <span className="rs-pill-arrow" aria-hidden="true">Apply</span>
            </button>
          ) : null}

          <h1 className="rs-subpage-h1">Simple school licensing.</h1>
          <p className="rs-subpage-lead">
            {trialEnabled
              ? `Try CogniTara free for ${trialDays} days. Pick a school plan when ready, pay via Paystack, and receive your offline Ed25519 licence key immediately.`
              : "Pick a school plan, pay securely via Paystack, and receive your offline Ed25519 licence key immediately."}
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

            <form
              className="rs-promo-bar"
              onSubmit={(e) => {
                e.preventDefault();
                const first = orderedPlans[0];
                if (first?.id) void validatePromo(promoInput, first.id, currency);
              }}
            >
              <input
                type="text"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                placeholder="Promo code"
                className="rs-promo-input"
                aria-label="Promo code"
              />
              {appliedPromo ? (
                <button
                  type="button"
                  className="rs-btn rs-btn--soft rs-btn--compact"
                  onClick={() => {
                    setAppliedPromo(null);
                    setPromoInput("");
                    setPromoErr("");
                  }}
                >
                  Clear
                </button>
              ) : (
                <button
                  type="submit"
                  className="rs-btn rs-btn--soft rs-btn--compact"
                  disabled={promoBusy || !promoInput.trim()}
                >
                  {promoBusy ? "Checking…" : "Apply"}
                </button>
              )}
            </form>
          </div>

          {appliedPromo ? (
            <p className="rs-promo-ok" role="status">
              Code <strong>{appliedPromo.code}</strong> active: {appliedPromo.message}
            </p>
          ) : promoErr ? (
            <p className="rs-form-error" role="alert">
              {promoErr}
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
              const finalMinor = computeDiscountedMinor(baseMinor);
              const hasDiscount = finalMinor < baseMinor;
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
                    {hasDiscount ? (
                      <span className="rs-plan-strike">{fmtMoney(baseMinor, currency)}</span>
                    ) : null}
                    <span>{fmtMoney(finalMinor, currency)}</span>
                  </div>
                  <p className="rs-plan-cadence">{cadence}</p>

                  <button
                    type="button"
                    className={`rs-btn ${isFeatured ? "rs-btn--primary" : "rs-btn--soft"}`}
                    style={{ width: "100%" }}
                    onClick={() => {
                      setCheckoutErr("");
                      setSelectedPlan(plan);
                    }}
                  >
                    {shortPlanAction(plan)}
                  </button>

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
                  No card required. Test live mock exams, KaTeX math equations, teacher grading, and LAN student logins right inside your computer lab before buying a licence.
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
                  <span>Activate a paid key anytime without losing data</span>
                </li>
              </ul>
            </div>
          ) : null}

          <div className="rs-lic-trust">
            <p>Instant Ed25519 licence key · Prices in {currency} · Secure checkout via Paystack</p>
            <p>Buying on your phone? Your licence key appears immediately after checkout and arrives by email, ready for your Windows PC.</p>
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
                        {[rev.author_role, rev.school_name, rev.city_state].filter(Boolean).join(" · ")}
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
              Already have a licence? <Link href="/dashboard">Manage it in your school dashboard</Link>.
            </p>
          </div>
        </section>
      </main>

      {/* Clean Monochrome Paystack Checkout Modal */}
      {selectedPlan ? (
        <div className="rs-modal-bg" role="dialog" aria-modal="true" aria-labelledby="licCheckoutTitle" onClick={() => !checkoutBusy && setSelectedPlan(null)}>
          <div className="rs-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rs-modal-head">
              <div>
                <span className="rs-modal-eyebrow">Paystack Checkout</span>
                <h2 id="licCheckoutTitle">{selectedPlan.display_name}</h2>
              </div>
              <button
                type="button"
                className="rs-modal-close"
                aria-label="Close checkout"
                disabled={checkoutBusy}
                onClick={() => setSelectedPlan(null)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="rs-modal-summary">
              <div>
                <span>Licence duration</span>
                <strong>
                  {selectedPlan.duration_days ? `${selectedPlan.duration_days} days` : "Perpetual (Lifetime)"}
                </strong>
              </div>
              <div>
                <span>Offline lease window</span>
                <strong>{selectedPlan.lease_days || 14} days</strong>
              </div>
              {appliedPromo ? (
                <div>
                  <span>Promo ({appliedPromo.code})</span>
                  <strong>{appliedPromo.message}</strong>
                </div>
              ) : null}
              <div className="rs-modal-total">
                <span>Total due</span>
                <strong>{fmtMoney(selectedFinalMinor, currency)}</strong>
              </div>
            </div>

            {checkoutErr ? (
              <p className="rs-form-error" role="alert" style={{ marginBottom: 14 }}>
                {checkoutErr}
              </p>
            ) : null}

            <form className="rs-modal-form" onSubmit={handleStartCheckout}>
              {session ? (
                <div className="rs-modal-signed">
                  <p>
                    Signed in as <strong>{session.school_name || session.full_name}</strong> ({session.email}).
                    Your Ed25519 licence key will be bound to this school account and emailed immediately after payment.
                  </p>
                </div>
              ) : (
                <>
                  <div className="rs-field">
                    <label htmlFor="chkSchool">School name</label>
                    <input
                      id="chkSchool"
                      type="text"
                      required
                      value={buyerSchool}
                      onChange={(e) => setBuyerSchool(e.target.value)}
                      placeholder="Cedar Hills Academy"
                      className="rs-input"
                    />
                  </div>
                  <div className="rs-field">
                    <label htmlFor="chkEmail">School email (for licence key delivery)</label>
                    <input
                      id="chkEmail"
                      type="email"
                      required
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                      placeholder="principal@school.edu.ng"
                      className="rs-input"
                    />
                  </div>
                  <div className="rs-field">
                    <label htmlFor="chkName">Your name (optional)</label>
                    <input
                      id="chkName"
                      type="text"
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="Adaeze Okafor"
                      className="rs-input"
                    />
                  </div>
                </>
              )}

              <button type="submit" className="rs-btn rs-btn--primary" style={{ width: "100%" }} disabled={checkoutBusy}>
                {checkoutBusy ? "Redirecting to Paystack…" : `Pay ${fmtMoney(selectedFinalMinor, currency)} with Paystack`}
              </button>

              {!session ? (
                <p className="rs-modal-alt">
                  Already have a school account? <Link href="/signin">Sign in</Link>
                </p>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}

      <LandingFooter />
    </div>
  );
}
