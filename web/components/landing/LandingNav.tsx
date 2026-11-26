"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CogniTaraLockup, ResurfMenuIcon } from "../CogniTaraLogo";

interface LandingNavProps {
  activePath?: "/" | "/download" | "/license";
}

const NAV_ITEMS = [
  { label: "Features", href: "/#features" },
  { label: "Surfaces", href: "/#surfaces" },
  { label: "Reviews", href: "/#reviews" },
  { label: "Pricing", href: "/license" },
  { label: "Sign in", href: "/signin" },
];

export default function LandingNav({ activePath = "/" }: LandingNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [pill, setPill] = useState<{ left: number; width: number; opacity: number }>({
    left: 0,
    width: 0,
    opacity: 0,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleLinkEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const track = trackRef.current;
    if (!track) return;
    const tr = track.getBoundingClientRect();
    const r = e.currentTarget.getBoundingClientRect();
    setPill({ left: r.left - tr.left, width: r.width, opacity: 1 });
  };

  const handleTrackLeave = () => {
    setPill((p) => ({ ...p, opacity: 0 }));
  };

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
            {NAV_ITEMS.map((item) => {
              const isHashOnHome = activePath === "/" && item.href.startsWith("/#");
              const resolvedHref = isHashOnHome ? item.href.slice(1) : item.href;
              const isCurrent = item.href === activePath;
              return isHashOnHome ? (
                <a
                  key={item.label}
                  href={resolvedHref}
                  className={`rs-nav-link${isCurrent ? " is-current" : ""}`}
                  onMouseEnter={handleLinkEnter}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  href={resolvedHref}
                  className={`rs-nav-link${isCurrent ? " is-current" : ""}`}
                  onMouseEnter={handleLinkEnter}
                >
                  {item.label}
                </Link>
              );
            })}
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
            {NAV_ITEMS.map((item) => {
              const isHashOnHome = activePath === "/" && item.href.startsWith("/#");
              const resolvedHref = isHashOnHome ? item.href.slice(1) : item.href;
              return isHashOnHome ? (
                <a
                  key={item.label}
                  href={resolvedHref}
                  className="rs-mobile-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <span>{item.label}</span>
                </a>
              ) : (
                <Link
                  key={item.label}
                  href={resolvedHref}
                  className="rs-mobile-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <span>{item.label}</span>
                </Link>
              );
            })}
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
