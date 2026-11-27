"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CogniTaraLockup, ResurfMenuIcon } from "../CogniTaraLogo";

export type NavActivePath =
  | "/"
  | "/download"
  | "/license"
  | "/about"
  | "/roadmap"
  | "/changelogs"
  | "/guides"
  | "/faq"
  | "/blog"
  | "/support";

interface LandingNavProps {
  activePath?: NavActivePath;
}

const PRIMARY_NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Story", href: "/about" },
  { label: "Roadmap", href: "/roadmap" },
  { label: "Updates", href: "/changelogs" },
  { label: "Pricing", href: "/license" },
];

const RESOURCE_ITEMS: { label: string; sub: string; href: string }[] = [
  { label: "Online Exam Portal", sub: "Sign in with your School ID", href: "https://portal.cognitara.net" },
  { label: "How-to guides", sub: "Install, LAN setup & recovery", href: "/guides" },
  { label: "FAQ", sub: "Offline exams, backups & pricing", href: "/faq" },
  { label: "Blog", sub: "Engineering & exam-day notes", href: "/blog" },
  { label: "Get support", sub: "Direct help for your school", href: "/support" },
  { label: "Sign in", sub: "Manage licence & cloud backups", href: "/signin" },
];

export default function LandingNav({ activePath = "/" }: LandingNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resOpen, setResOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [pill, setPill] = useState<{ left: number; width: number; opacity: number }>({
    left: 0,
    width: 0,
    opacity: 0,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setResOpen(false);
      }
    };
    const onDocClick = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setResOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDocClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, []);

  const handleItemEnter = (e: React.MouseEvent<HTMLElement>) => {
    const track = trackRef.current;
    if (!track) return;
    const tr = track.getBoundingClientRect();
    const r = e.currentTarget.getBoundingClientRect();
    setPill({ left: r.left - tr.left, width: r.width, opacity: 1 });
  };

  const handleTrackLeave = () => {
    setPill((p) => ({ ...p, opacity: 0 }));
  };

  const isResourceActive =
    activePath === "/guides" ||
    activePath === "/faq" ||
    activePath === "/blog" ||
    activePath === "/support";

  return (
    <header className="rs-nav-wrap">
      <div className="rs-nav-blur" aria-hidden="true" />
      <div className="rs-nav-inner">
        <Link href="/" className="rs-brand" aria-label="CogniTara home">
          <CogniTaraLockup markSize={24} wordmarkHeight={15} />
        </Link>

        <nav className="rs-nav-center" aria-label="Primary">
          <div
            ref={trackRef}
            className="rs-nav-track"
            onMouseLeave={handleTrackLeave}
          >
            <div
              className="rs-nav-pill"
              aria-hidden="true"
              style={{
                width: `${pill.width}px`,
                transform: `translate3d(${pill.left}px, 0, 0)`,
                opacity: pill.opacity,
              }}
            />
            {PRIMARY_NAV_ITEMS.map((item) => {
              const isCurrent = item.href === activePath;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`rs-nav-link${isCurrent ? " is-current" : ""}`}
                  onMouseEnter={handleItemEnter}
                >
                  {item.label}
                </Link>
              );
            })}

            <div
              ref={dropRef}
              className="rs-nav-dropdown-wrap"
              data-open={resOpen ? "true" : "false"}
            >
              <button
                type="button"
                className={`rs-nav-link rs-nav-dropdown-trigger${isResourceActive ? " is-current" : ""}`}
                aria-expanded={resOpen}
                aria-haspopup="menu"
                onMouseEnter={handleItemEnter}
                onClick={() => setResOpen((v) => !v)}
              >
                <span>Resources</span>
                <svg
                  className="rs-nav-chevron"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {resOpen && (
                <div className="rs-nav-popover" role="menu">
                  {RESOURCE_ITEMS.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      role="menuitem"
                      className="rs-nav-pop-item"
                      onClick={() => setResOpen(false)}
                    >
                      <span className="rs-nav-pop-title">{sub.label}</span>
                      <span className="rs-nav-pop-sub">{sub.sub}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </nav>

        <div className="rs-nav-actions">
          <Link href="/download" className="rs-nav-dl">
            Download
          </Link>

          <button
            type="button"
            className="rs-mobile-toggle"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <ResurfMenuIcon size={20} />
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <>
          <div
            className="rs-mobile-backdrop"
            aria-hidden="true"
            onClick={() => setMobileOpen(false)}
          />
          <div className="rs-mobile-sheet" role="dialog" aria-label="Navigation menu">
            {PRIMARY_NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rs-mobile-link"
                onClick={() => setMobileOpen(false)}
              >
                <span>{item.label}</span>
              </Link>
            ))}
            {RESOURCE_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rs-mobile-link"
                onClick={() => setMobileOpen(false)}
              >
                <span>{item.label}</span>
              </Link>
            ))}
            <div style={{ paddingTop: 6 }}>
              <Link
                href="/download"
                className="rs-btn rs-btn--primary"
                style={{ width: "100%" }}
                onClick={() => setMobileOpen(false)}
              >
                Download for Windows
              </Link>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
