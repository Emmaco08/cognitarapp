"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { IconMoon, IconSun } from "./Icons";
import { CogniTaraLockup, CogniTaraMark, ResurfMenuIcon } from "./CogniTaraLogo";

export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <span className="ct-brand__mark" aria-hidden="true">
      <CogniTaraMark size={size} />
    </span>
  );
}

export function BrandHeader({
  signedIn = false,
  isHq = false,
  variant = "default",
}: {
  signedIn?: boolean;
  isHq?: boolean;
  variant?: "default" | "hero";
}) {
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const cur = document.documentElement.getAttribute("data-theme");
    setTheme(cur === "dark" ? "dark" : "light");
    if (variant !== "hero") return;
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("ct-cloud-theme", next);
    } catch {}
  }

  const navClass =
    variant === "hero"
      ? `ct-nav ct-nav--hero ${scrolled ? "is-scrolled" : ""}`
      : "ct-nav";

  return (
    <header className={navClass}>
      <div className="ct-nav__inner">
        <Link href="/" className="ct-brand" aria-label="CogniTara home">
          <CogniTaraLockup markSize={24} wordmarkHeight={15} />
        </Link>

        <nav className="ct-nav__links" aria-label="Primary navigation">
          <div className="ct-nav__anchors">
            <Link href="/download" className="ct-nav__link">
              Download
            </Link>
            <Link href="/license" className="ct-nav__link">
              Pricing
            </Link>
          </div>

          <button
            type="button"
            className="ct-nav__theme"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
            <span className="ct-nav__theme-lbl">{theme === "dark" ? "Light" : "Dark"}</span>
          </button>

          {isHq ? (
            <Link href="/hq" className="ct-nav__link">
              Admin Console
            </Link>
          ) : null}

          {signedIn ? (
            <Link href="/dashboard" className="btn btn--primary btn--sm">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/signin" className="ct-nav__link ct-nav__signin">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn--primary btn--sm ct-nav__cta">
                Create account
              </Link>
            </>
          )}

          {variant === "hero" ? (
            <button
              type="button"
              className="ct-nav__burger"
              aria-expanded={menuOpen}
              aria-controls="ct-mobile-menu"
              aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              ) : (
                <ResurfMenuIcon size={19} />
              )}
            </button>
          ) : null}
        </nav>
      </div>

      {variant === "hero" && menuOpen ? (
        <div id="ct-mobile-menu" className="ct-mobile-drawer" role="dialog" aria-label="Mobile navigation">
          <Link href="/download" onClick={() => setMenuOpen(false)}>Download</Link>
          <Link href="/license" onClick={() => setMenuOpen(false)}>Pricing</Link>
          <div className="ct-mobile-drawer__actions">
            <Link href="/signin" className="btn btn--outline" onClick={() => setMenuOpen(false)}>
              Sign in
            </Link>
            <Link href="/signup" className="btn btn--primary" onClick={() => setMenuOpen(false)}>
              Create account
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
