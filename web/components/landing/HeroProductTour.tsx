"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface TourSlide {
  id: string;
  label: string;
  caption: string;
  image: string;
  thumb: string;
  alt: string;
  video?: string;
}

const SLIDES: TourSlide[] = [
  {
    id: "studio",
    label: "CogniTara Studio",
    caption: "Launch your local exam server in one click, share the LAN QR code, and supervise up to 300 student devices.",
    image: "/tour/01-studio-server.webp?v=240",
    thumb: "/tour/thumbs/01-studio-server.webp?v=240",
    alt: "CogniTara Studio desktop app showing the running local exam server, LAN QR code, connected devices, and activity monitor",
    video: "/tour/cognitara-studio-demo.mp4?v=240",
  },
  {
    id: "admin",
    label: "Admin Dashboard",
    caption: "Supervise every scheduled paper, student cohort, and school-wide metric with instant zero-reload navigation.",
    image: "/tour/02-admin-dashboard.webp",
    thumb: "/tour/thumbs/02-admin-dashboard.webp",
    alt: "CogniTara Admin Dashboard showing total exams, approved students, teachers, and the Examinations Directory",
    video: "/tour/cognitara-admin-demo.mp4",
  },
  {
    id: "control-center",
    label: "Exam Control Center",
    caption: "Start, pause, inspect, or audit every active and draft examination across classes from one calm control desk.",
    image: "/tour/03-exam-control.webp",
    thumb: "/tour/thumbs/03-exam-control.webp",
    alt: "Admin Exam Control Center with live status filters, class selectors, and quick actions",
  },
  {
    id: "analytics",
    label: "School Analytics",
    caption: "Review grade distributions, class average benchmarks, and pass rates the moment students finish.",
    image: "/tour/04-school-analytics.webp",
    thumb: "/tour/thumbs/04-school-analytics.webp",
    alt: "School-Wide Analytics dashboard showing grade distribution donut chart and class average score bars",
  },
  {
    id: "teacher",
    label: "Teacher Studio",
    caption: "Subject teachers draft question banks, import spreadsheets, and launch term papers without paperwork.",
    image: "/tour/05-teacher-studio.webp",
    thumb: "/tour/thumbs/05-teacher-studio.webp",
    alt: "Teacher Exam Control Center with Create Exam, Import, Live Support, and paper status table",
  },
  {
    id: "formulas",
    label: "Formula Builder",
    caption: "Insert crisp fractions, roots, integrals, and chemical equations with live student-view preview.",
    image: "/tour/06-formula-builder.webp",
    thumb: "/tour/thumbs/06-formula-builder.webp",
    alt: "Visual KaTeX Formula Builder modal with chemistry presets, math keypad, and live preview",
  },
  {
    id: "student-dash",
    label: "Student Dashboard",
    caption: "Students sign in from any classroom browser over local Wi-Fi, resume active papers, and view transcripts.",
    image: "/tour/07-student-dashboard.webp",
    thumb: "/tour/thumbs/07-student-dashboard.webp",
    alt: "Student Portal showing in-progress exams, scheduled papers, integrity standing, and academic transcript",
  },
  {
    id: "exam-room",
    label: "Live Exam Room",
    caption: "One calm question at a time with instant local autosave, right-rail question navigator, and a built-in scientific calculator.",
    image: "/tour/08-live-exam-room.webp?v=240",
    thumb: "/tour/thumbs/08-live-exam-room.webp?v=240",
    alt: "Student Live Exam Room rendering a calculus equation alongside right-rail navigation and the built-in scientific calculator",
  },
  {
    id: "results",
    label: "Official Score Report",
    caption: "Immediate automated grading with a calm minimal score slip and instant print support.",
    image: "/tour/09-score-report.webp?v=240",
    thumb: "/tour/thumbs/09-score-report.webp?v=240",
    alt: "Minimal monochrome Official Examination Score Report displaying percentage score, grade, and print slip action",
  },
  {
    id: "licence",
    label: "Offline Licence Vault",
    caption: "Purchase or renew on cognitara.net, then paste your Ed25519 licence key in Studio to unlock offline LAN leases.",
    image: "/tour/10-licence-activation.webp?v=240",
    thumb: "/tour/thumbs/10-licence-activation.webp?v=240",
    alt: "CogniTara Studio Licence view showing days remaining, offline lease check-in window, inline licence key renewal, and hardware protection",
  },
];

export default function HeroProductTour() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [readyMap, setReadyMap] = useState<Record<string, boolean>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const touchStartX = useRef<number | null>(null);

  const go = useCallback((nextIndex: number) => {
    const wrapped = (nextIndex + SLIDES.length) % SLIDES.length;
    setActive(wrapped);
    const btn = thumbRefs.current[wrapped];
    if (btn) {
      btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, []);

  // Respect prefers-reduced-motion on initial autoplay
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
    }
  }, []);

  // Play only the active video slide; pause hidden ones to conserve GPU & CPU
  useEffect(() => {
    SLIDES.forEach((slide, idx) => {
      if (!slide.video) return;
      const vid = videoRefs.current[slide.id];
      if (!vid) return;
      if (idx === active && playing) {
        vid.play().catch(() => {});
      } else {
        vid.pause();
      }
    });
  }, [active, playing]);

  const current = SLIDES[active];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(active + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(active - 1);
    }
  };

  return (
    <div className="rs-tour-wrap">
      <div
        className="rs-tour"
        role="region"
        aria-roledescription="carousel"
        aria-label="CogniTara product tour"
        onKeyDown={handleKeyDown}
      >
        <div
          id="rs-tour-panel"
          role="tabpanel"
          aria-labelledby={`rs-tour-tab-${active}`}
          className="rs-tour-stage"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            if (touchStartX.current == null) return;
            const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(dx) > 42) {
              go(dx < 0 ? active + 1 : active - 1);
            }
          }}
        >
          <div className="rs-tour-viewport">
            {SLIDES.map((slide, idx) => {
              const pos = idx === active ? "active" : idx < active ? "prev" : "next";
              return (
                <div
                  key={slide.id}
                  className="rs-tour-slide"
                  data-pos={pos}
                  aria-hidden={idx !== active}
                >
                  <img
                    src={slide.image}
                    alt={slide.alt}
                    width={1600}
                    height={1000}
                    draggable={false}
                    loading={idx <= 1 ? "eager" : "lazy"}
                    className="rs-tour-img"
                  />
                  {slide.video && (
                    <video
                      ref={(el) => {
                        videoRefs.current[slide.id] = el;
                      }}
                      src={slide.video}
                      poster={slide.image}
                      muted
                      loop
                      playsInline
                      preload={idx === 0 ? "auto" : "metadata"}
                      onCanPlay={() =>
                        setReadyMap((prev) => (prev[slide.id] ? prev : { ...prev, [slide.id]: true }))
                      }
                      aria-label={`${slide.label} live interactive walkthrough`}
                      className={`rs-tour-video${readyMap[slide.id] ? " is-ready" : ""}`}
                    />
                  )}
                </div>
              );
            })}

            {/* Left / Right circular white navigation arrows (exact Resurf placement) */}
            <button
              type="button"
              className="rs-tour-arrow rs-tour-arrow--prev"
              aria-label="Previous screen"
              onClick={() => go(active - 1)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <button
              type="button"
              className="rs-tour-arrow rs-tour-arrow--next"
              aria-label="Next screen"
              onClick={() => go(active + 1)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>

            {/* Bottom-right translucent Pause / Play pill on video slides */}
            {current.video && (
              <button
                type="button"
                className="rs-tour-play-pill"
                aria-label={playing ? `Pause ${current.label} demo` : `Play ${current.label} demo`}
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M6 4l15 8-15 8V4z" />
                    </svg>
                    <span>Play</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Centered bold label + muted caption */}
        <p className="rs-tour-caption" aria-live="polite">
          <strong>{current.label}</strong>
          <span>{current.caption}</span>
        </p>

        {/* Scrollable miniature thumbnail strip with macOS blue active outline ring */}
        <div
          role="tablist"
          aria-label="CogniTara screens"
          className="rs-tour-thumbs"
        >
          {SLIDES.map((slide, idx) => (
            <button
              key={slide.id}
              ref={(el) => {
                thumbRefs.current[idx] = el;
              }}
              id={`rs-tour-tab-${idx}`}
              type="button"
              role="tab"
              aria-selected={idx === active}
              aria-controls="rs-tour-panel"
              aria-label={slide.label}
              tabIndex={idx === active ? 0 : -1}
              className="rs-thumb-btn"
              onClick={() => go(idx)}
            >
              <img
                src={slide.thumb}
                alt=""
                width={320}
                height={200}
                loading="lazy"
                draggable={false}
              />
              {slide.video && (
                <span className="rs-thumb-play-dot" aria-hidden="true">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 4l14 8-14 8V4z" />
                  </svg>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
