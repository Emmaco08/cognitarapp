"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { GUIDE_CATEGORIES, type GuideItem } from "@/lib/site-content";

const POPULAR_TOPICS = [
  { label: "Cross-device recovery", query: "another computer" },
  { label: "Wi-Fi LAN", query: "Wi-Fi" },
  { label: "KaTeX formulas", query: "KaTeX" },
  { label: "NEPA pause", query: "Pause" },
  { label: "Backups", query: "backup" },
  { label: "Paystack license", query: "Paystack" },
];

function CategoryIcon({ name }: { name: string }) {
  const key = name.toLowerCase();
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (key.includes("start")) {
    return (
      <svg {...common}>
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      </svg>
    );
  }
  if (key.includes("exam") || key.includes("recovery")) {
    return (
      <svg {...common}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }
  if (key.includes("author") || key.includes("stem")) {
    return (
      <svg {...common}>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    );
  }
  if (key.includes("network") || key.includes("wi-fi") || key.includes("lan")) {
    return (
      <svg {...common}>
        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
    );
  }
  if (key.includes("data") || key.includes("backup")) {
    return (
      <svg {...common}>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14a9 3 0 0 0 18 0V5" />
        <path d="M3 12a9 3 0 0 0 18 0" />
      </svg>
    );
  }
  if (key.includes("licen")) {
    return (
      <svg {...common}>
        <circle cx="7.5" cy="15.5" r="5.5" />
        <path d="m21 2-9.6 9.6" />
        <path d="m15.5 7.5 3 3L22 7l-3-3" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export default function GuidesClient({
  guides,
  supportEmail,
}: {
  guides: GuideItem[];
  supportEmail: string;
}) {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Support ⌘K / Ctrl+K focus shortcut just like resurf.so/guides
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && document.activeElement === inputRef.current) {
        setQuery("");
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const categories = useMemo(() => {
    const known = new Map<string, string>(GUIDE_CATEGORIES.map((c) => [c.name, c.description]));
    const order: string[] = GUIDE_CATEGORIES.map((c) => c.name);
    for (const g of guides) {
      if (!known.has(g.category)) {
        known.set(g.category, `Step-by-step guides for ${g.category.toLowerCase()}.`);
        order.push(g.category);
      }
    }
    return order
      .map((name) => ({
        name,
        description: known.get(name) || "",
        count: guides.filter((g) => g.category === name).length,
      }))
      .filter((c) => c.count > 0);
  }, [guides]);

  const trimmed = query.trim().toLowerCase();
  const showingList = Boolean(trimmed) || selectedCategory !== null;

  const visibleGuides = useMemo(() => {
    return guides.filter((g) => {
      if (selectedCategory && !trimmed && g.category !== selectedCategory) return false;
      if (!trimmed) return true;
      return (
        g.title.toLowerCase().includes(trimmed) ||
        g.summary.toLowerCase().includes(trimmed) ||
        g.category.toLowerCase().includes(trimmed) ||
        g.steps.some((s) => s.toLowerCase().includes(trimmed))
      );
    });
  }, [guides, selectedCategory, trimmed]);

  return (
    <>
      <div className="rs-guides-search-wrap rs-blur-in" style={{ ["--d" as string]: "200ms" }}>
        <svg
          className="rs-search-ico"
          width="16"
          height="16"
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
          ref={inputRef}
          type="search"
          className="rs-search-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value.trim()) setSelectedCategory(null);
          }}
          placeholder="Search the guides"
          aria-label="Search CogniTara guides"
        />
        <span className="rs-search-kbd" aria-hidden="true">⌘K</span>
      </div>

      <div className="rs-guides-popular rs-blur-in" style={{ ["--d" as string]: "260ms" }}>
        <span className="rs-guides-popular-lbl">Popular</span>
        {POPULAR_TOPICS.map((topic) => (
          <button
            key={topic.label}
            type="button"
            className="rs-popular-chip"
            onClick={() => {
              setSelectedCategory(null);
              setQuery(topic.query);
            }}
          >
            {topic.label}
          </button>
        ))}
      </div>

      {!showingList ? (
        <div className="rs-guide-cat-grid">
          {categories.map((cat, idx) => (
            <button
              key={cat.name}
              type="button"
              className="rs-guide-cat-card rs-blur-in"
              style={{ ["--d" as string]: `${300 + idx * 45}ms` }}
              onClick={() => setSelectedCategory(cat.name)}
            >
              <span className="rs-guide-cat-ico" aria-hidden="true">
                <CategoryIcon name={cat.name} />
              </span>
              <div style={{ display: "grid", gap: 4 }}>
                <div className="rs-guide-cat-top">
                  <span className="rs-guide-cat-name">{cat.name}</span>
                  <span className="rs-guide-cat-cnt">
                    {cat.count} {cat.count === 1 ? "guide" : "guides"}
                  </span>
                </div>
                <p className="rs-guide-cat-desc">{cat.description}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <div className="rs-guides-back-bar">
            <button
              type="button"
              className="rs-back-btn"
              onClick={() => {
                setSelectedCategory(null);
                setQuery("");
              }}
            >
              ← All categories
            </button>
            <span style={{ fontSize: 13, color: "var(--rs-ink-50)" }}>
              {trimmed
                ? `${visibleGuides.length} result${visibleGuides.length === 1 ? "" : "s"} for “${query}”`
                : `${selectedCategory} · ${visibleGuides.length} ${visibleGuides.length === 1 ? "guide" : "guides"}`}
            </span>
          </div>

          {visibleGuides.length === 0 ? (
            <div className="rs-guide-card" style={{ textAlign: "center", padding: 36 }}>
              <h2 className="rs-guide-title">No guides matched “{query}”</h2>
              <p className="rs-guide-summary">
                Try another keyword, read the <Link href="/faq">FAQ</Link>, or email{" "}
                <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
              </p>
            </div>
          ) : (
            <div className="rs-guides-grid">
              {visibleGuides.map((guide) => (
                <article key={guide.id} id={guide.id} className="rs-guide-card">
                  <div className="rs-guide-meta">
                    <span className="rs-guide-cat">{guide.category}</span>
                    <span>{guide.readTime} read</span>
                  </div>
                  <h2 className="rs-guide-title">{guide.title}</h2>
                  <p className="rs-guide-summary">{guide.summary}</p>
                  <ol className="rs-guide-steps">
                    {guide.steps.map((step, i) => (
                      <li key={i}>{step}</li>
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
        </div>
      )}

      <p className="rs-subpage-note rs-blur-in" style={{ ["--d" as string]: "520ms" }}>
        Can’t find it? Read the <Link href="/faq">FAQ</Link> or email{" "}
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
      </p>
    </>
  );
}
