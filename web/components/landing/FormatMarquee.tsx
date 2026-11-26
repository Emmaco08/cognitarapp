"use client";

import { useState } from "react";

interface FormatItem {
  label: string;
  icon: React.ReactNode;
}

const ROW_ONE: FormatItem[] = [
  {
    label: "KaTeX Math",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 17l4-10 4 10M5.5 13.5h5M15 7l5 10M20 7l-5 10" />
      </svg>
    ),
  },
  {
    label: "Diagrams",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="M21 15l-5-5L5 20" />
      </svg>
    ),
  },
  {
    label: "CSV Import",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M9 4v16" />
      </svg>
    ),
  },
  {
    label: "SQLite WAL",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
        <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
      </svg>
    ),
  },
  {
    label: "QR LAN Join",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h3v3h-3zM18 18h3v3h-3z" />
      </svg>
    ),
  },
];

const ROW_TWO: FormatItem[] = [
  {
    label: "PDF Slips",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="13" y2="17" />
      </svg>
    ),
  },
  {
    label: "Calculator",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
        <line x1="8.5" y1="7" x2="15.5" y2="7" />
        <path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" strokeWidth="2.3" />
      </svg>
    ),
  },
  {
    label: "Entrance PINs",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4z" />
        <path d="M9.5 12.2l1.8 1.8 3.6-3.8" />
      </svg>
    ),
  },
  {
    label: "Ed25519 Keys",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="14" r="4" />
        <path d="M11 11l8-8M16 6l2.5 2.5M19 3l2 2" />
      </svg>
    ),
  },
  {
    label: "Cloud Backups",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
      </svg>
    ),
  },
];

export default function FormatMarquee() {
  const [paused, setPaused] = useState(false);

  return (
    <section className="rs-container rs-marquee-section" data-rs-reveal>
      <p className="rs-marquee-lead">
        Math equations, diagrams, CSV imports, PDF slips, Common Entrance, and more. Every exam format works natively.
      </p>

      <div
        className="rs-marquee-rows"
        data-paused={paused ? "true" : "false"}
        onClick={() => setPaused((p) => !p)}
        title={paused ? "Click to resume stream" : "Hover or click to pause stream"}
      >
        <div className="rs-marquee-track">
          {[...ROW_ONE, ...ROW_ONE, ...ROW_ONE, ...ROW_ONE].map((item, idx) => (
            <div key={`r1-${idx}`} className="rs-format-tile">
              {item.icon}
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <div className="rs-marquee-track rs-marquee-track--reverse">
          {[...ROW_TWO, ...ROW_TWO, ...ROW_TWO, ...ROW_TWO].map((item, idx) => (
            <div key={`r2-${idx}`} className="rs-format-tile">
              {item.icon}
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
