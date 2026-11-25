"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BrandHeader } from "@/components/BrandHeader";
import { PlanEmblem } from "@/components/PlanEmblem";
import { ExamHallArchitecture } from "@/components/ExamHallArchitecture";
import { IconDownload, IconStar } from "@/components/Icons";
import { StudioDesktopShowcase } from "@/components/StudioDesktopShowcase";

const RELEASES_URL = "https://github.com/Emmaco08/cognitarapp/releases/latest";

interface PlanItem {
  id: string;
  slug: string;
  display_name: string;
  description: string;
  badge?: string;
  duration_days: number | null;
  lease_days: number;
  price_ngn_kobo: number;
  price_usd_cents: number;
  features_json?: { highlights?: string[] };
}

interface ApprovedReview {
  id: string;
  school_name: string;
  author_name: string;
  author_role: string;
  city_state: string;
  rating: number;
  headline: string;
  body: string;
  is_featured: boolean;
  approved_at: string | null;
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
        "Embedded Paystack checkout and signed licence key",
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
        "Referral rewards and priority school onboarding",
      ],
    },
  },
];

const TEAM_MEMBERS = [
  {
    initials: "EO",
    name: "Emmanuel O.",
    role: "Founder & Lead Systems Architect",
    focus:
      "Designs the offline LAN exam engine, Windows Studio shell, and Ed25519 cryptographic licensing architecture.",
  },
  {
    initials: "AS",
    name: "Assessment Systems",
    role: "CBT & Authoring Engineering",
    focus:
      "Builds the student exam studio, visual KaTeX formula composer, Common Entrance workflow, and live hall supervision.",
  },
  {
    initials: "SC",
    name: "Security & Cloud",
    role: "Infrastructure & Payments",
    focus:
      "Maintains the 5-layer hardware licence vault, Brevo OTP authentication, embedded Paystack SDK, and Neon cloud snapshots.",
  },
  {
    initials: "SO",
    name: "School Onboarding",
    role: "Exam-Day Operations & Support",
    focus:
      "Helps ICT coordinators configure school Wi-Fi routers, migrate databases safely, and run calm examination weeks.",
  },
];

const FAQ_ITEMS = [
  {
    q: "Do students need internet access during an examination?",
    a: "No. Once CogniTara Studio is activated on one Windows PC, every laptop, desktop, or tablet on your school Wi-Fi or lab Ethernet cable connects directly to that PC over your local network.",
  },
  {
    q: "What happens if power fails or a student laptop disconnects mid-exam?",
    a: "Every selected option is flushed immediately to SQLite WAL storage on your school server. Disconnected students are paused cleanly with a 90-second grace window and resume right where they stopped with zero lost answers.",
  },
  {
    q: "How do schools purchase or renew licences inside the desktop app?",
    a: "CogniTara Studio integrates the Paystack Inline SDK directly inside its full-screen Plans & Billing screen. Schools pay by card, bank transfer, or USSD without external popup windows, receive an emailed receipt, and activate immediately.",
  },
  {
    q: "How are school testimonials verified before appearing on this website?",
    a: "Ratings can only be submitted by verified school accounts directly inside the CogniTara Studio desktop application. Every submission goes to CogniTara HQ for authenticity review before being published here.",
  },
  {
    q: "What if our school server computer needs replacement?",
    a: "Upload an encrypted cloud backup snapshot from CogniTara Studio anytime internet is available. When you install Studio on a new Windows computer and sign in, you can restore every exam, question bank, and student result in one click.",
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
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [plans, setPlans] = useState<PlanItem[]>(FALLBACK_PLANS);
  const [reviews, setReviews] = useState<ApprovedReview[]>([]);
  const [reviewStats, setReviewStats] = useState<{ count: number; avg: number }>({ count: 0, avg: 0 });
  const [reviewsLoaded, setReviewsLoaded] = useState(false);
  const [openFaq, setOpenFaq] = useState<number>(0);

  useEffect(() => {
    fetch("/api/v1/plans")
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && Array.isArray(j.plans) && j.plans.length > 0) {
          setPlans(j.plans.slice(0, 4));
        }
      })
      .catch(() => {});

    fetch("/api/v1/reviews")
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && Array.isArray(j.reviews)) {
          setReviews(j.reviews);
          setReviewStats({
            count: Number(j.stats?.approved_count ?? j.count ?? j.reviews.length ?? 0),
            avg: Number(j.stats?.average_rating ?? j.average_rating ?? 0),
          });
        }
      })
      .catch(() => {})
      .finally(() => setReviewsLoaded(true));
  }, []);

  // Subtle progressive reveal on scroll (never leaves sections hidden if reduced motion or IO unavailable)
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".lp-reveal"));
    if (!els.length) return;
    if (
      typeof window === "undefined" ||
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -24px 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="lp-bleed">
      <BrandHeader variant="hero" />

      <main className="lp-wrap">
        {/* Monumental Kinetic Hero + Real Interactive CogniTara Studio Desktop Frame */}
        <section className="lp-hero">
          <h1 className="lp-hero__title">Run calm school exams offline from one Windows PC.</h1>
          <p>
            Install CogniTara Studio on a single lab computer to serve hundreds of student devices
            over local Wi-Fi, with instant cloud backups.
          </p>
          <div className="lp-hero__cta">
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="btn btn--primary btn--lg">
              <IconDownload size={16} />
              <span>Download CogniTara Studio</span>
            </a>
            <Link href="/signup" className="lp-quiet-link">
              Create school account
            </Link>
          </div>
        </section>

        <section className="lp-desktop-stage" aria-label="Interactive CogniTara Studio Windows application">
          <StudioDesktopShowcase />
        </section>

        {/* Live Animated Exam-Hall Network Architecture */}
        <section id="architecture" className="lp-section lp-reveal">
          <ExamHallArchitecture />

          <div className="lp-workflow-strip">
            <div className="lp-wf-col">
              <h3>Onboard with verified email OTP</h3>
              <p className="lp-body">
                Create your school account directly inside CogniTara Studio on first launch, confirm
                your 6-digit Brevo email code, and lock your local vault to your exam PC.
              </p>
            </div>
            <div className="lp-wf-col">
              <h3>Author rich papers in minutes</h3>
              <p className="lp-body">
                Teachers build exams with 1-click KaTeX math formulas, optional student photos of
                any size, CSV bulk import, and dedicated Common Entrance candidate portals.
              </p>
            </div>
            <div className="lp-wf-col">
              <h3>Pay inline and back up safely</h3>
              <p className="lp-body">
                Upgrade plans using embedded Paystack checkout with instant receipts, and upload
                SHA-256 verified database snapshots to CogniTara Cloud between terms.
              </p>
            </div>
          </div>
        </section>

        {/* Verified School Testimonials (Live From Desktop App -> HQ Approval -> Website) */}
        <section id="reviews" className="lp-section lp-reveal">
          <div className="lp-section-head">
            <div style={{ display: "grid", gap: 8 }}>
              <h2 className="lp-h2">Rated by schools directly from CogniTara Studio.</h2>
              <p className="lp-body">
                Principals and ICT officers submit ratings from inside the desktop app. Every
                review is verified in CogniTara HQ before publishing here.
              </p>
            </div>
            {reviewStats.count > 0 ? (
              <div className="lp-rating-summary">
                <div className="lp-stars" aria-label={`${reviewStats.avg} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <IconStar key={n} size={16} filled={n <= Math.round(reviewStats.avg)} />
                  ))}
                </div>
                <strong className="tnum">{reviewStats.avg.toFixed(1)} / 5</strong>
                <span className="tnum">
                  {reviewStats.count} verified {reviewStats.count === 1 ? "school" : "schools"}
                </span>
              </div>
            ) : null}
          </div>

          {reviews.length > 0 ? (
            <div className="lp-reviews-grid">
              {reviews.map((rev) => (
                <article key={rev.id} className="lp-review">
                  <div className="lp-stars" aria-label={`${rev.rating} out of 5 stars`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <IconStar key={n} size={15} filled={n <= rev.rating} />
                    ))}
                  </div>
                  {rev.headline ? <h3 className="lp-review__headline">{rev.headline}</h3> : null}
                  <p className="lp-review__body">&ldquo;{rev.body}&rdquo;</p>
                  <div className="lp-review__meta">
                    <strong>{rev.author_name || "School Administrator"}</strong>
                    <span>
                      {[rev.author_role, rev.school_name, rev.city_state].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="lp-reviews-empty">
              <div className="lp-reviews-empty__copy">
                <h3>Verified school reviews appear here as schools rate Studio.</h3>
                <p className="lp-body">
                  We never publish synthetic quotes. Open <strong>Cloud &amp; rate</strong> inside
                  CogniTara Studio to submit your school&apos;s 5-star review directly to CogniTara HQ
                  for approval.
                </p>
              </div>
              <Link href="/signup" className="btn btn--outline">
                Create school account
              </Link>
            </div>
          )}
          {!reviewsLoaded ? null : null}
        </section>

        {/* Transparent Live Pricing (Claude-Inspired Architectural Plan Gallery) */}
        <section id="pricing" className="lp-section lp-reveal">
          <div className="cl-pricing-head">
            <h2 className="lp-h2">Plans that grow with your school</h2>
            <p className="lp-body">
              Pay securely with Paystack inside Studio or online. Receive an official receipt and
              signed Ed25519 offline licence immediately.
            </p>
            <div className="lp-seg" role="group" aria-label="Select currency" style={{ marginTop: 8 }}>
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

          <div className="cl-plans-grid">
            {plans.map((p, idx) => {
              const minor = currency === "USD" ? p.price_usd_cents : p.price_ngn_kobo;
              const highlights = p.features_json?.highlights || [];
              const featured = p.slug === "annual" || p.slug === "termly" || Boolean(p.badge && /popular|best/i.test(p.badge));
              return (
                <article key={p.id} className={`cl-plan-card ${featured ? "is-featured" : ""}`}>
                  <div className="cl-plan-head">
                    <PlanEmblem slug={p.slug} index={idx} />
                    {p.badge ? <span className="cl-plan-tag">{p.badge}</span> : null}
                  </div>
                  <h3 className="cl-plan-name">{p.display_name}</h3>
                  <p className="cl-plan-desc">{p.description}</p>
                  <div className="cl-plan-price-row">
                    <div className="cl-plan-price">{fmtPrice(minor, currency)}</div>
                    <div className="cl-plan-cadence">
                      <span>{p.duration_days ? `${currency} / ${p.duration_days} days` : `${currency} / one-time`}</span>
                      <span>{p.lease_days}-day offline lease</span>
                    </div>
                  </div>
                  <Link
                    href="/signup"
                    className={`cl-plan-cta ${featured ? "cl-plan-cta--solid" : "cl-plan-cta--soft"}`}
                  >
                    Get {p.display_name.replace(/\s+(School|Institutional)\s+Plan$/i, " plan")}
                  </Link>
                  <div className="cl-plan-note">Instant activation · Works offline</div>
                  <div className="cl-plan-divider" />
                  <div className="cl-plan-kicker">Included in {p.display_name}:</div>
                  <ul className="cl-plan-feats">
                    {(highlights.length
                      ? highlights.slice(0, 4)
                      : [
                          p.duration_days ? `${p.duration_days} days full CBT server access` : "Perpetual school licence — zero renewals",
                          `${p.lease_days}-day offline LAN check-in window`,
                          "Unlimited students, teachers & question banks",
                          "Encrypted CogniTara Cloud backups",
                        ]
                    ).map((item) => (
                      <li key={item}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </section>

        {/* People Behind CogniTara (Editorial SaaS Startup Team Section) */}
        <section id="team" className="lp-section lp-reveal">
          <div className="lp-split">
            <div className="lp-split__sticky">
              <h2 className="lp-h2">Built by engineers obsessed with exam-day reliability.</h2>
              <p className="lp-body">
                CogniTara is crafted by a focused systems team dedicated to giving schools
                industrial-grade examination infrastructure without recurring cloud bandwidth costs.
              </p>
            </div>

            <div className="lp-team-grid">
              {TEAM_MEMBERS.map((member) => (
                <article key={member.name} className="lp-member">
                  <div className="lp-member__top">
                    <span className="lp-member__mono" aria-hidden="true">
                      {member.initials}
                    </span>
                    <div>
                      <h3>{member.name}</h3>
                      <em>{member.role}</em>
                    </div>
                  </div>
                  <p className="lp-body">{member.focus}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Practical Questions for Principals & ICT Officers */}
        <section id="faq" className="lp-section lp-reveal">
          <div className="lp-split">
            <div className="lp-split__sticky">
              <h2 className="lp-h2">Common questions from school leaders.</h2>
              <p className="lp-body">
                Straight answers about offline capacity, power resilience, payments, and backups.
              </p>
            </div>

            <div className="lp-faq-list">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={item.q} className={`lp-faq-item ${isOpen ? "is-open" : ""}`}>
                    <button
                      type="button"
                      className="lp-faq-q"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaq(isOpen ? -1 : idx)}
                    >
                      <span>{item.q}</span>
                      <span className="lp-faq-plus" aria-hidden="true">
                        {isOpen ? "−" : "+"}
                      </span>
                    </button>
                    {isOpen ? <p className="lp-faq-a lp-body">{item.a}</p> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Focused Closing Band */}
        <section className="lp-closing lp-reveal">
          <h2 className="lp-h2">Ready to run calm, offline school exams?</h2>
          <p className="lp-body">
            Download CogniTara Studio for Windows and set up your school exam server in minutes.
          </p>
          <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="btn btn--primary btn--lg">
            <IconDownload size={16} />
            <span>Download CogniTara Studio</span>
          </a>
        </section>

        <footer className="lp-footer">
          <span>CogniTara School Examination Platform</span>
          <div className="lp-footer__links">
            <a href="#architecture">How it works</a>
            <a href="#reviews">Reviews</a>
            <a href="#pricing">Pricing</a>
            <a href="#team">Team</a>
            <Link href="/signin">Sign in</Link>
            <Link href="/signup">Create account</Link>
            <Link href="/hq">Admin Console</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
