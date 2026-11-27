"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import { ROADMAP_ITEMS, type RoadmapStatus, SUPPORT_CHANNELS } from "@/lib/site-content";

const STATUS_LABELS: Record<RoadmapStatus, string> = {
  shipped: "Shipped",
  in_progress: "In progress",
  planned: "Planned",
  exploring: "Exploring",
};

const FILTER_ORDER: Array<"all" | RoadmapStatus> = ["all", "in_progress", "planned", "shipped", "exploring"];

export default function RoadmapPage() {
  const [filter, setFilter] = useState<"all" | RoadmapStatus>("all");

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: ROADMAP_ITEMS.length };
    for (const item of ROADMAP_ITEMS) {
      map[item.status] = (map[item.status] || 0) + 1;
    }
    return map;
  }, []);

  const visible = useMemo(() => {
    if (filter === "all") return ROADMAP_ITEMS;
    return ROADMAP_ITEMS.filter((item) => item.status === filter);
  }, [filter]);

  return (
    <LenisGsapScope>
      <LandingNav activePath="/roadmap" />

      <main id="main-content" className="rs-subpage rs-subpage--wide">
        <header className="rs-page-hero" data-rs-reveal>
          <p className="rs-page-eyebrow">Roadmap</p>
          <h1 className="rs-page-title">What we’re building next</h1>
          <p className="rs-page-lead">
            Every milestone on CogniTara’s roadmap comes directly from principals, teachers, and ICT coordinators running real school exams.
          </p>
        </header>

        <div className="rs-filter-row" role="group" aria-label="Filter roadmap items">
          {FILTER_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              className="rs-filter-pill"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              <span>{key === "all" ? "All milestones" : STATUS_LABELS[key]}</span>
              <span className="rs-filter-count">{counts[key] || 0}</span>
            </button>
          ))}
        </div>

        <div className="rs-roadmap-list" data-rs-stagger>
          {visible.map((item) => (
            <article key={item.id} className="rs-roadmap-card">
              <div className="rs-roadmap-top">
                <span
                  className={`rs-status-pill${
                    item.status === "shipped" || item.status === "in_progress" ? " rs-status-pill--solid" : ""
                  }`}
                >
                  {STATUS_LABELS[item.status]}
                </span>
                <span style={{ fontSize: 12, color: "var(--rs-ink-50)", fontWeight: 500 }}>
                  {item.category}
                </span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <div className="rs-roadmap-foot">
                <span>Target</span>
                <span>{item.target}</span>
              </div>
            </article>
          ))}
        </div>

        <p className="rs-subpage-note">
          Have a feature your exam hall needs? Send your request to{" "}
          <a href={`mailto:${SUPPORT_CHANNELS.email}?subject=CogniTara%20Feature%20Request`}>
            {SUPPORT_CHANNELS.email}
          </a>
          . Looking for what already shipped? Read the{" "}
          <Link href="/changelogs">latest release updates</Link>.
        </p>
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
