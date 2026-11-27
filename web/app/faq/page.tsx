"use client";

import Link from "next/link";
import { useState } from "react";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import { FAQ_GROUPS, SUPPORT_CHANNELS } from "@/lib/site-content";

export default function FaqPage() {
  const [openKey, setOpenKey] = useState<string>("0-0");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const groups = FAQ_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (item) =>
        !q ||
        item.q.toLowerCase().includes(q) ||
        item.a.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q)
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <LenisGsapScope>
      <LandingNav activePath="/faq" />

      <main id="main-content" className="rs-subpage">
        <header className="rs-page-hero" data-rs-reveal>
          <p className="rs-page-eyebrow">FAQ</p>
          <h1 className="rs-page-title">Questions, answered</h1>
          <p className="rs-page-lead">
            Plain answers about offline LAN hosting, cross-device exam recovery, backups, anti-cheat, and school licensing.
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
            placeholder="Filter questions (e.g. NEPA, power cut, Paystack, offline, students)..."
            aria-label="Filter FAQ"
          />
        </div>

        <div className="rs-faq-sections">
          {groups.map((group, gi) => (
            <section key={group.category}>
              <h2 className="rs-faq-group-title">{group.category}</h2>
              <div className="rs-faq-list">
                {group.items.map((item, ii) => {
                  const key = `${gi}-${ii}`;
                  const isOpen = Boolean(q) || openKey === key;
                  return (
                    <div key={item.q} className="rs-faq-item" data-open={isOpen ? "true" : "false"}>
                      <button
                        type="button"
                        className="rs-faq-trigger"
                        aria-expanded={isOpen}
                        onClick={() => setOpenKey(isOpen ? "" : key)}
                      >
                        <span>{item.q}</span>
                        <span className="rs-faq-plus" aria-hidden="true">+</span>
                      </button>
                      {isOpen ? <div className="rs-faq-answer">{item.a}</div> : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <p className="rs-subpage-note">
          Didn’t find your answer? Email{" "}
          <a href={`mailto:${SUPPORT_CHANNELS.email}`}>{SUPPORT_CHANNELS.email}</a> and a real person on the CogniTara team will reply. Step-by-step walkthroughs live in{" "}
          <Link href="/guides">How-to Guides</Link>; plan options live on{" "}
          <Link href="/license">Pricing &amp; Licensing</Link>.
        </p>
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
