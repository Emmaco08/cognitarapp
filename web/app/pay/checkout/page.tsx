"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LandingNav from "../../../components/landing/LandingNav";
import LandingFooter from "../../../components/landing/LandingFooter";

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
}

interface PlatformDirectives {
  allow_paystack_checkout?: boolean;
  paystack_mode?: "test" | "live";
  paystack_fee_mode?: "merchant" | "customer_added" | "paystack_checkout";
  paystack_fee_pct?: number;
  paystack_fee_flat_ngn?: number;
  paystack_fee_cap_ngn?: number;
  paystack_fee_flat_threshold_ngn?: number;
}

interface ValidatedCode {
  code: string;
  code_type: "discount" | "redeem";
  is_free: boolean;
  discount_kind: string | null;
  discount_value: number;
  original_amount_minor: number;
  discount_amount_minor: number;
  final_amount_minor: number;
  grant_plan?: {
    id: string;
    slug: string;
    display_name: string;
    duration_days: number | null;
  } | null;
  description?: string;
  message: string;
}

const FALLBACK_PLANS: PlanItem[] = [
  {
    id: "monthly",
    slug: "monthly",
    display_name: "Monthly School Plan",
    description: "Flexible 30-day CBT server access for up to 300 concurrent students.",
    badge: "",
    sort_order: 1,
    duration_days: 30,
    lease_days: 7,
    price_ngn_kobo: 2500000,
    price_usd_cents: 1900,
    max_devices: 1,
  },
  {
    id: "termly",
    slug: "termly",
    display_name: "Termly School Plan",
    description: "Full 120-day academic term coverage for WAEC, BECE, and mock exams.",
    badge: "Popular",
    sort_order: 2,
    duration_days: 120,
    lease_days: 14,
    price_ngn_kobo: 7500000,
    price_usd_cents: 5900,
    max_devices: 1,
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
  },
  {
    id: "lifetime",
    slug: "lifetime",
    display_name: "Lifetime Institutional Plan",
    description: "One-time perpetual institutional licence with 90-day offline leases.",
    badge: "Institutional",
    sort_order: 4,
    duration_days: null,
    lease_days: 90,
    price_ngn_kobo: 65000000,
    price_usd_cents: 49900,
    max_devices: 2,
  },
];

function fmtMoney(minor: number, currency: "NGN" | "USD"): string {
  const sym = currency === "USD" ? "$" : "₦";
  const val = Number(minor || 0) / 100;
  const hasCents = Math.round(minor) % 100 !== 0;
  return `${sym}${val.toLocaleString(currency === "USD" ? "en-US" : "en-NG", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function shortPlanLabel(plan: PlanItem): string {
  return (plan.display_name || plan.slug || "")
    .replace(/\s*(Institutional|School|Campus|Plan)\b/gi, "")
    .trim() || plan.slug;
}

function estimatePaystackFee(
  baseMinor: number,
  currency: "NGN" | "USD",
  platform: PlatformDirectives | null
): { addedMinor: number; label: string } {
  if (baseMinor <= 0) return { addedMinor: 0, label: "No fee" };
  const mode = platform?.paystack_fee_mode || "merchant";
  if (mode === "merchant") return { addedMinor: 0, label: "Included (₦0)" };
  if (mode === "paystack_checkout") {
    return { addedMinor: 0, label: "Calculated at Paystack" };
  }
  if (currency === "USD") {
    const fee = Math.round(baseMinor * 0.039) + 100;
    return { addedMinor: fee, label: fmtMoney(fee, "USD") };
  }
  const pct = (Number(platform?.paystack_fee_pct ?? 1.5) || 1.5) / 100;
  const flat = Math.round(Number(platform?.paystack_fee_flat_ngn ?? 100) * 100);
  const cap = Math.round(Number(platform?.paystack_fee_cap_ngn ?? 2000) * 100);
  const threshold = Math.round(Number(platform?.paystack_fee_flat_threshold_ngn ?? 2500) * 100);
  const appliesFlat = baseMinor >= threshold ? flat : 0;
  const grossed = Math.ceil((baseMinor + appliesFlat) / Math.max(0.5, 1 - pct)) - baseMinor;
  const fee = cap > 0 ? Math.min(cap, Math.max(0, grossed)) : Math.max(0, grossed);
  return { addedMinor: fee, label: fmtMoney(fee, "NGN") };
}

export default function DedicatedCheckoutPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<PlanItem[]>(FALLBACK_PLANS);
  const [platform, setPlatform] = useState<PlatformDirectives | null>(null);
  const [plansLoaded, setPlansLoaded] = useState(false);

  const [selectedSlug, setSelectedSlug] = useState<string>("annual");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [schoolName, setSchoolName] = useState("");
  const [email, setEmail] = useState("");
  const [signedInHint, setSignedInHint] = useState(false);

  // Unified Discount & 100% Free Redeem Code state
  const [codeInput, setCodeInput] = useState("");
  const [appliedCode, setAppliedCode] = useState<ValidatedCode | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState("");

  // Checkout submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const initialPromoRef = useRef<string>("");

  const orderedPlans = useMemo(() => {
    return [...plans].sort((a, b) => {
      const sa = Number(a.sort_order ?? 99);
      const sb = Number(b.sort_order ?? 99);
      if (sa !== sb) return sa - sb;
      return (a.price_ngn_kobo || 0) - (b.price_ngn_kobo || 0);
    });
  }, [plans]);

  const activePlan = useMemo(() => {
    const clean = selectedSlug.trim().toLowerCase();
    return (
      orderedPlans.find((p) => p.slug?.toLowerCase() === clean || p.id.toLowerCase() === clean) ||
      orderedPlans.find((p) => p.slug?.toLowerCase().includes("annual")) ||
      orderedPlans[0]
    );
  }, [orderedPlans, selectedSlug]);

  const validateCode = useCallback(
    async (rawCode: string, plan: PlanItem | undefined, cur: "NGN" | "USD", buyerEmail?: string) => {
      const clean = rawCode.trim().toUpperCase();
      if (!clean) {
        setAppliedCode(null);
        setCodeError("");
        return;
      }
      setCodeBusy(true);
      setCodeError("");
      try {
        const res = await fetch("/api/v1/promo/validate", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: clean,
            plan_id: plan?.id,
            plan_slug: plan?.slug,
            currency: cur,
            email: (buyerEmail || "").trim() || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setAppliedCode(null);
          setCodeError(data.message || "Code is invalid, expired, or not eligible for this plan.");
        } else {
          setAppliedCode({
            code: String(data.code || clean),
            code_type: data.code_type === "redeem" ? "redeem" : "discount",
            is_free: Boolean(data.is_free || data.code_type === "redeem" || Number(data.final_amount_minor) === 0),
            discount_kind: data.discount_kind || null,
            discount_value: Number(data.discount_value || 0),
            original_amount_minor: Number(data.original_amount_minor || 0),
            discount_amount_minor: Number(data.discount_amount_minor || 0),
            final_amount_minor: Number(data.final_amount_minor ?? 0),
            grant_plan: data.grant_plan || null,
            description: String(data.description || ""),
            message: String(data.message || "Code applied."),
          });
          setCodeInput(String(data.code || clean));
        }
      } catch {
        setAppliedCode(null);
        setCodeError("Could not check code right now. Please try again.");
      } finally {
        setCodeBusy(false);
      }
    },
    []
  );

  // Load plans, directives, query params, and optional session prefill
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const planParam = (params.get("plan") || "").trim().toLowerCase();
    const curParam = (params.get("currency") || "").trim().toUpperCase();
    const promoParam = (params.get("promo") || params.get("code") || "").trim().toUpperCase();

    const resolvedCur: "NGN" | "USD" = curParam === "USD" ? "USD" : "NGN";
    if (curParam === "USD" || curParam === "NGN") setCurrency(resolvedCur);
    if (planParam) setSelectedSlug(planParam);
    if (promoParam) {
      setCodeInput(promoParam);
      initialPromoRef.current = promoParam;
    }

    Promise.all([
      fetch("/api/v1/plans").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/v1/auth/me?optional=1", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([plansData, meData]) => {
      if (!active) return;
      let loadedPlans: PlanItem[] = FALLBACK_PLANS;
      if (plansData?.ok) {
        if (Array.isArray(plansData.plans) && plansData.plans.length > 0) {
          loadedPlans = plansData.plans;
          setPlans(plansData.plans);
        }
        if (plansData.platform) setPlatform(plansData.platform);
      }
      if (meData?.ok && meData.user) {
        const sName = String(meData.school?.school_name || "").trim();
        const uEmail = String(meData.user.email || "").trim();
        if (sName) setSchoolName((prev) => prev || sName);
        if (uEmail) setEmail((prev) => prev || uEmail);
        setSignedInHint(true);
      }
      setPlansLoaded(true);

      if (initialPromoRef.current) {
        const matched =
          loadedPlans.find((p) => p.slug?.toLowerCase() === planParam || p.id.toLowerCase() === planParam) ||
          loadedPlans.find((p) => p.slug?.toLowerCase().includes("annual")) ||
          loadedPlans[0];
        if (matched) {
          void validateCode(initialPromoRef.current, matched, resolvedCur, meData?.user?.email || "");
        }
      }
    });

    return () => {
      active = false;
    };
  }, [validateCode]);

  // Re-validate applied code when plan or currency changes
  function handlePlanSwitch(plan: PlanItem) {
    setSelectedSlug(plan.slug || plan.id);
    setSubmitError("");
    if (appliedCode) {
      void validateCode(appliedCode.code, plan, currency, email);
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("plan", plan.slug || plan.id);
      url.searchParams.set("currency", currency);
      window.history.replaceState({}, "", url.toString());
    } catch {
      // ignore
    }
  }

  function handleCurrencySwitch(nextCur: "NGN" | "USD") {
    setCurrency(nextCur);
    setSubmitError("");
    if (appliedCode) {
      void validateCode(appliedCode.code, activePlan, nextCur, email);
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("currency", nextCur);
      window.history.replaceState({}, "", url.toString());
    } catch {
      // ignore
    }
  }

  // Price calculations (real-time preview; authoritative calculation always runs server-side)
  const baseMinor = activePlan
    ? Number(currency === "USD" ? activePlan.price_usd_cents : activePlan.price_ngn_kobo)
    : 0;

  const isFreeOrder = Boolean(appliedCode?.is_free);
  const effectiveOriginalMinor =
    appliedCode && appliedCode.original_amount_minor > 0 ? appliedCode.original_amount_minor : baseMinor;
  const discountMinor = appliedCode
    ? isFreeOrder
      ? effectiveOriginalMinor
      : Math.min(effectiveOriginalMinor, Math.max(0, appliedCode.discount_amount_minor))
    : 0;
  const subtotalMinor = isFreeOrder ? 0 : Math.max(0, effectiveOriginalMinor - discountMinor);
  const feeInfo = estimatePaystackFee(subtotalMinor, currency, platform);
  const totalDueMinor = isFreeOrder ? 0 : subtotalMinor + feeInfo.addedMinor;

  const displayPlanName =
    appliedCode?.code_type === "redeem" && appliedCode.grant_plan?.display_name
      ? appliedCode.grant_plan.display_name
      : activePlan?.display_name || "School Licence";

  const displayDurationDays =
    appliedCode?.code_type === "redeem" && appliedCode.grant_plan
      ? appliedCode.grant_plan.duration_days
      : activePlan?.duration_days ?? null;

  async function handleCheckoutSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activePlan) return;
    setSubmitError("");

    const cleanSchool = schoolName.trim().replace(/\s+/g, " ");
    const cleanEmail = email.trim().toLowerCase();

    if (cleanSchool.length < 2) {
      setSubmitError("Enter your school name to issue your licence certificate.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setSubmitError("Enter a valid email address so we can deliver your licence key and PDF receipt.");
      return;
    }

    setSubmitting(true);
    try {
      if (isFreeOrder && appliedCode) {
        const res = await fetch("/api/v1/promo/redeem", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: appliedCode.code,
            plan_id: activePlan.id,
            plan_slug: activePlan.slug,
            currency,
            school_name: cleanSchool,
            email: cleanEmail,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok || !data.redirect_url) {
          setSubmitError(data.message || "Could not redeem this voucher right now.");
          setSubmitting(false);
          return;
        }
        router.push(String(data.redirect_url));
        return;
      }

      // Paid Paystack Hosted Checkout
      const res = await fetch("/api/v1/payments/paystack/quick-checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: activePlan.id,
          plan_slug: activePlan.slug,
          currency,
          school_name: cleanSchool,
          email: cleanEmail,
          promo_code: appliedCode?.code || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.authorization_url) {
        setSubmitError(data.message || "Could not initialize Paystack checkout right now.");
        setSubmitting(false);
        return;
      }
      window.location.href = String(data.authorization_url);
    } catch {
      setSubmitError("Network error while connecting to checkout. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="rs-root">
      <LandingNav activePath="/license" />

      <main id="main-content" className="rs-subpage rs-ck-page">
        <div className="rs-ck-shell">
          <div className="rs-ck-top">
            <Link href={`/license?currency=${currency}`} className="rs-back-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              <span>All licence plans</span>
            </Link>
            <div className="rs-ck-secure-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <span>{platform?.paystack_mode === "test" ? "Paystack Test Checkout" : "Encrypted Checkout"}</span>
            </div>
          </div>

          <header className="rs-ck-header rs-ck-enter">
            <h1 className="rs-ck-h1">Complete your school licence</h1>
            <p className="rs-ck-lead">
              Enter your school name and email address. Your Ed25519 licence key and downloadable PDF receipt are delivered immediately on confirmation.
            </p>
          </header>

          <form className="rs-ck-grid" onSubmit={handleCheckoutSubmit} noValidate>
            {/* LEFT COLUMN: Plan switcher, School Name + Email, Discount/Redeem Code */}
            <div className="rs-ck-left">
              {/* Step 1: Plan & Currency */}
              <section className="rs-ck-card rs-ck-enter" style={{ animationDelay: "50ms" }}>
                <div className="rs-ck-card-head">
                  <div className="rs-ck-step-row">
                    <span className="rs-ck-step-num">01</span>
                    <h2>Licence plan</h2>
                  </div>
                  <div className="rs-currency-switch rs-currency-switch--compact" role="group" aria-label="Currency selector">
                    <button
                      type="button"
                      className="rs-currency-btn"
                      aria-pressed={currency === "NGN"}
                      onClick={() => handleCurrencySwitch("NGN")}
                    >
                      NGN (₦)
                    </button>
                    <button
                      type="button"
                      className="rs-currency-btn"
                      aria-pressed={currency === "USD"}
                      onClick={() => handleCurrencySwitch("USD")}
                    >
                      USD ($)
                    </button>
                  </div>
                </div>

                <div className="rs-ck-plan-pills" role="radiogroup" aria-label="Choose licence plan">
                  {orderedPlans.map((p) => {
                    const isSelected = activePlan?.id === p.id || activePlan?.slug === p.slug;
                    const priceMinor = Number(currency === "USD" ? p.price_usd_cents : p.price_ngn_kobo);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`rs-ck-plan-pill${isSelected ? " is-selected" : ""}`}
                        onClick={() => handlePlanSwitch(p)}
                      >
                        <div className="rs-ck-plan-pill-top">
                          <span className="rs-ck-plan-pill-name">{shortPlanLabel(p)}</span>
                          {p.badge ? <span className="rs-ck-plan-pill-badge">{p.badge}</span> : null}
                        </div>
                        <span className="rs-ck-plan-pill-price">{fmtMoney(priceMinor, currency)}</span>
                        <span className="rs-ck-plan-pill-sub">
                          {p.duration_days ? `${p.duration_days} days` : "Perpetual"} · {p.lease_days || 14}d offline
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Step 2: School Name & Email ONLY */}
              <section className="rs-ck-card rs-ck-enter" style={{ animationDelay: "100ms" }}>
                <div className="rs-ck-card-head">
                  <div className="rs-ck-step-row">
                    <span className="rs-ck-step-num">02</span>
                    <h2>School delivery details</h2>
                  </div>
                  {signedInHint ? <span className="rs-ck-prefill-tag">Account prefilled</span> : null}
                </div>

                <div className="rs-ck-fields">
                  <div className="rs-field">
                    <label htmlFor="ckSchoolName">School name</label>
                    <input
                      id="ckSchoolName"
                      name="school_name"
                      type="text"
                      required
                      autoComplete="organization"
                      value={schoolName}
                      onChange={(e) => {
                        setSchoolName(e.target.value);
                        if (submitError) setSubmitError("");
                      }}
                      placeholder="e.g. Cedar Hills International Academy"
                      className="rs-input"
                    />
                    <span className="rs-ck-hint">
                      Bound to your Ed25519 licence certificate and printed on your PDF receipt.
                    </span>
                  </div>

                  <div className="rs-field">
                    <label htmlFor="ckSchoolEmail">School email address</label>
                    <input
                      id="ckSchoolEmail"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (submitError) setSubmitError("");
                      }}
                      placeholder="e.g. bursar@cedarhills.edu.ng"
                      className="rs-input"
                    />
                    <span className="rs-ck-hint">
                      We send your activation key and official receipt link straight to this inbox.
                    </span>
                  </div>
                </div>
              </section>

              {/* Step 3: Unified Discount Code & 100% Free Redeem Voucher */}
              <section className="rs-ck-card rs-ck-enter" style={{ animationDelay: "150ms" }}>
                <div className="rs-ck-card-head">
                  <div className="rs-ck-step-row">
                    <span className="rs-ck-step-num">03</span>
                    <h2>Discount or redeem code</h2>
                  </div>
                  <span className="rs-ck-optional">Optional</span>
                </div>

                <p className="rs-ck-code-desc">
                  Have a percentage discount, fixed promo code, or a 100% free school redeem voucher? Enter it below.
                </p>

                <div className="rs-ck-code-row">
                  <input
                    id="ckPromoCode"
                    type="text"
                    value={codeInput}
                    onChange={(e) => {
                      setCodeInput(e.target.value.toUpperCase());
                      if (codeError) setCodeError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (codeInput.trim() && !codeBusy) {
                          void validateCode(codeInput, activePlan, currency, email);
                        }
                      }
                    }}
                    placeholder="Enter promo or voucher code (e.g. TERM20 or CT-FREE-XXXX)"
                    aria-label="Discount or redeem code"
                    className="rs-input rs-ck-code-input"
                    disabled={codeBusy}
                  />
                  {appliedCode ? (
                    <button
                      type="button"
                      className="rs-btn rs-btn--soft rs-ck-code-btn"
                      onClick={() => {
                        setAppliedCode(null);
                        setCodeInput("");
                        setCodeError("");
                      }}
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rs-btn rs-btn--soft rs-ck-code-btn"
                      disabled={codeBusy || !codeInput.trim() || !plansLoaded}
                      onClick={() => void validateCode(codeInput, activePlan, currency, email)}
                    >
                      {codeBusy ? "Checking…" : "Apply code"}
                    </button>
                  )}
                </div>

                {appliedCode ? (
                  <div className={`rs-ck-code-applied rs-ck-pop${appliedCode.is_free ? " is-free" : ""}`} role="status">
                    <div className="rs-ck-code-applied-ico" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </div>
                    <div className="rs-ck-code-applied-body">
                      <div className="rs-ck-code-applied-top">
                        <code>{appliedCode.code}</code>
                        <span>{appliedCode.is_free ? "100% Free Voucher" : "Discount applied"}</span>
                      </div>
                      <p>{appliedCode.message}</p>
                      {appliedCode.description && appliedCode.description !== appliedCode.message ? (
                        <p className="rs-ck-code-note">{appliedCode.description}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {codeError ? (
                  <div className="rs-ck-alert" role="alert">
                    {codeError}
                  </div>
                ) : null}
              </section>
            </div>

            {/* RIGHT COLUMN: Sticky Order Summary & Pay CTA */}
            <aside className="rs-ck-right rs-ck-enter" style={{ animationDelay: "120ms" }}>
              <div className="rs-ck-summary">
                <div className="rs-ck-summary-head">
                  <span className="rs-ck-summary-eyebrow">Order summary</span>
                  <h3>{displayPlanName}</h3>
                  <p>
                    {displayDurationDays && displayDurationDays < 36000
                      ? `${displayDurationDays} days server access`
                      : "Perpetual school licence"}{" "}
                    · {activePlan?.lease_days || 14}-day offline LAN lease · Up to {activePlan?.max_devices || 1} PC
                    {(activePlan?.max_devices || 1) > 1 ? "s" : ""}
                  </p>
                </div>

                <dl className="rs-ck-ledger">
                  <div>
                    <dt>Licence price</dt>
                    <dd className={discountMinor > 0 ? "is-struck" : ""}>
                      {fmtMoney(effectiveOriginalMinor, currency)}
                    </dd>
                  </div>

                  {appliedCode && discountMinor > 0 ? (
                    <div className="rs-ck-ledger-discount">
                      <dt>
                        {appliedCode.is_free ? "Redeem voucher" : "Discount"} (<code>{appliedCode.code}</code>)
                      </dt>
                      <dd>-{fmtMoney(discountMinor, currency)}</dd>
                    </div>
                  ) : null}

                  {!isFreeOrder ? (
                    <div>
                      <dt>Processing fee</dt>
                      <dd className="rs-ck-muted">{feeInfo.label}</dd>
                    </div>
                  ) : null}

                  <div className="rs-ck-ledger-total">
                    <dt>Total due</dt>
                    <dd>
                      <span>{fmtMoney(totalDueMinor, currency)}</span>
                      {isFreeOrder ? <span className="rs-ck-free-tag">FREE</span> : null}
                    </dd>
                  </div>
                </dl>

                {submitError ? (
                  <div className="rs-ck-alert" role="alert" style={{ marginBottom: 14 }}>
                    {submitError}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="rs-btn rs-btn--primary rs-ck-pay-btn"
                  disabled={submitting || !plansLoaded}
                >
                  {submitting ? (
                    <>
                      <span className="rs-ck-spinner" aria-hidden="true" />
                      <span>{isFreeOrder ? "Issuing your licence…" : "Redirecting to Paystack…"}</span>
                    </>
                  ) : isFreeOrder ? (
                    <>
                      <span>Redeem &amp; issue licence free</span>
                      <span aria-hidden="true">→</span>
                    </>
                  ) : (
                    <>
                      <span>Pay {fmtMoney(totalDueMinor, currency)} with Paystack</span>
                      <span aria-hidden="true">→</span>
                    </>
                  )}
                </button>

                <div className="rs-ck-security">
                  <div className="rs-ck-sec-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4z" />
                    </svg>
                    <span>
                      {isFreeOrder
                        ? "Ed25519 signed licence issued immediately · Official PDF receipt included"
                        : "Secured by Paystack (Card, Bank Transfer, USSD) · Server-verified pricing"}
                    </span>
                  </div>
                  <div className="rs-ck-sec-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M22 7l-10 6L2 7" />
                    </svg>
                    <span>Licence key &amp; downloadable PDF receipt appear on screen and arrive by email.</span>
                  </div>
                  <div className="rs-ck-sec-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                    </svg>
                    <span>Paste your key in CogniTara Studio Desktop → Licence to activate or renew.</span>
                  </div>
                </div>
              </div>
            </aside>
          </form>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
