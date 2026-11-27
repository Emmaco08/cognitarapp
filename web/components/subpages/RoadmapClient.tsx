"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { RoadmapItem, RoadmapStatus } from "@/lib/site-content";

const STATUS_LABELS: Record<RoadmapStatus, string> = {
  in_progress: "In progress",
  planned: "Planned",
  shipped: "Shipped",
  exploring: "Exploring",
};

const GROUP_ORDER: RoadmapStatus[] = ["in_progress", "planned", "shipped", "exploring"];
const TAB_ORDER: Array<"all" | RoadmapStatus> = ["all", "in_progress", "planned", "shipped", "exploring"];

export default function RoadmapClient({
  items,
  supportEmail,
}: {
  items: RoadmapItem[];
  supportEmail: string;
}) {
  const [filter, setFilter] = useState<"all" | RoadmapStatus>("all");

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: items.length };
    for (const item of items) {
      map[item.status] = (map[item.status] || 0) + 1;
    }
    return map;
  }, [items]);

  const sections = useMemo(() => {
    const order = filter === "all" ? GROUP_ORDER : [filter];
    return order
      .map((st) => ({
        status: st,
        label: STATUS_LABELS[st],
        rows: items.filter((i) => i.status === st),
      }))
      .filter((sec) => sec.rows.length > 0);
  }, [filter, items]);

  return (
    <>
      <div className="rs-seg-wrap rs-blur-in" style={{ ["--d" as string]: "220ms" }}>
        <div role="tablist" aria-label="Filter roadmap" className="rs-seg-tabs">
          {TAB_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className="rs-seg-tab"
              onClick={() => setFilter(key)}
            >
              <span>{key === "all" ? "All" : STATUS_LABELS[key]}</span>
              <span className="rs-seg-count">{counts[key] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rs-roadmap-groups">
        {sections.map((sec, sIdx) => (
          <section
            key={sec.status}
            className="rs-blur-in"
            style={{ ["--d" as string]: `${280 + sIdx * 70}ms` }}
            aria-label={sec.label}
          >
            <div className="rs-roadmap-group-head">
              <h2 className="rs-roadmap-group-title">
                <span
                  className={`rs-roadmap-dot${
                    sec.status === "shipped"
                      ? " rs-roadmap-dot--solid"
                      : sec.status === "in_progress"
                        ? " rs-roadmap-dot--ring"
                        : ""
                  }`}
                  aria-hidden="true"
                />
                <span>{sec.label}</span>
              </h2>
              <span className="rs-roadmap-group-cnt">{sec.rows.length}</span>
            </div>

            <div className="rs-roadmap-stack">
              {sec.rows.map((item) => (
                <article key={item.id} className="rs-roadmap-row">
                  <div className="rs-roadmap-row-top">
                    <h3>{item.title}</h3>
                    <div className="rs-roadmap-row-meta">
                      <span className="rs-roadmap-pill">{item.category}</span>
                      <span className="rs-roadmap-pill rs-roadmap-pill--mono">{item.target}</span>
                    </div>
                  </div>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="rs-subpage-note rs-blur-in" style={{ ["--d" as string]: "460ms" }}>
        Have an idea or workflow your exam hall needs? Email{" "}
        <a href={`mailto:${supportEmail}?subject=CogniTara%20Feature%20Request`}>{supportEmail}</a>. Want to see what already shipped? Read{" "}
        <Link href="/changelogs">Updates</Link>.
      </p>
    </>
  );
}
