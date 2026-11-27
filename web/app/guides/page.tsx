"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import { GUIDE_CATEGORIES, GUIDES_LIST, SUPPORT_CHANNELS } from "@/lib/site-content";

export default function GuidesPage() {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GUIDES_LIST.filter((g) => {
      const catOk = activeCat === "All" || g.category === activeCat;
      if (!catOk) return false;
      if (!q) return true;
      return (
        g.title.toLowerCase().includes(q) ||
        g.summary.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q) ||
        g.steps.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [query, activeCat]);

  return (
    <LenisGsapScope>
      <LandingNav activePath="/guides" />

      <main id="main-content" className="rs-subpage rs-subpage--wide">
        <header className="rs-page-hero" data-rs-reveal>
          <p className="rs-page-eyebrow">How-to guides</p>
          <h1 className="rs-page-title">How can we help?</h1>
          <p className="rs-page-lead">
            Step-by-step setup and exam-day guides for CogniTara Studio Desktop, school LAN Wi-Fi, cross-device recovery, and offline licensing.
          </p>
        </header>

        <div className="rs-search-box">
          <svg
            className="rs-search-ico"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            className="rs-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guides (e.g. dead computer, Wi-Fi, KaTeX, backup, Paystack)..."
            aria-label="Search CogniTara guides"
          />
        </div>

        <div className="rs-filter-row" role="group" aria-label="Filter guide categories">
          <button
            type="button"
            className="rs-filter-pill"
            aria-pressed={activeCat === "All"}
            onClick={() => setActiveCat("All")}
          >
            <span>All guides</span>
            <span className="rs-filter-count">{GUIDES_LIST.length}</span>
          </button>
          {GUIDE_CATEGORIES.map((cat) => {
            const cnt = GUIDES_LIST.filter((g) => g.category === cat.name).length;
            return (
              <button
                key={cat.name}
                type="button"
                className="rs-filter-pill"
                aria-pressed={activeCat === cat.name}
                onClick={() => setActiveCat(cat.name)}
              >
                <span>{cat.name}</span>
                <span className="rs-filter-count">{cnt}</span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="rs-guide-card" style={{ textAlign: "center", padding: 40 }}>
            <h2 className="rs-guide-title">No guides matched “{query}”</h2>
            <p className="rs-guide-summary">
              Try a broader keyword or check our <Link href="/faq">FAQ</Link> and <Link href="/support">Support Center</Link>.
            </p>
          </div>
        ) : (
          <div className="rs-guides-grid">
            {filtered.map((guide) => (
              <article key={guide.id} id={guide.id} className="rs-guide-card">
                <div className="rs-guide-meta">
                  <span className="rs-guide-cat">{guide.category}</span>
                  <span>{guide.readTime} read</span>
                </div>
                <h2 className="rs-guide-title">{guide.title}</h2>
                <p className="rs-guide-summary">{guide.summary}</p>
                <ol className="rs-guide-steps">
                  {guide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {guide.tip ? (
                  <p className="rs-guide-tip">
                    <strong>Lab tip:</strong> {guide.tip}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}

        <p className="rs-subpage-note">
          Can’t find what you need? Read the <Link href="/faq">FAQ</Link>, open the{" "}
          <Link href="/support">Support Center</Link>, or email{" "}
          <a href={`mailto:${SUPPORT_CHANNELS.email}`}>{SUPPORT_CHANNELS.email}</a>.
        </p>
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
