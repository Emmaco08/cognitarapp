"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { IconMoon, IconSun } from "./Icons";

export function BrandMark() {
  return (
    <span className="ct-brand__icon" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 200 200">
        <path
          fill="#FFFFFF"
          d="M 150.91,150.91 C 122.79,179.03 77.21,179.03 49.09,150.91 C 20.97,122.79 20.97,77.21 49.09,49.09 C 77.21,20.97 122.79,20.97 150.91,49.09 L 131.11,68.89 C 113.93,51.70 86.07,51.70 68.89,68.89 C 51.70,86.07 51.70,113.93 68.89,131.11 C 86.07,148.30 113.93,148.30 131.11,131.11 Z"
        />
        <path
          fill="#3B82F6"
          d="M 108.00,74.00 C 115.00,93.00 115.00,93.00 146.00,100.00 C 115.00,107.00 115.00,107.00 108.00,126.00 C 101.00,107.00 101.00,107.00 90.00,100.00 C 101.00,93.00 101.00,93.00 108.00,74.00 Z"
        />
      </svg>
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
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const cur = document.documentElement.getAttribute("data-theme");
    setTheme(cur === "light" ? "light" : "dark");
    if (variant !== "hero") return;
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant]);

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
        <Link href="/" className="ct-brand">
          <BrandMark />
          <span className="ct-brand__name">
            Cogni<em>Tara</em>
          </span>
        </Link>

        <nav className="ct-nav__links" aria-label="Primary navigation">
          {variant === "hero" ? (
            <>
              <a href="#architecture" className="ct-nav__link">
                How it works
              </a>
              <a href="#reviews" className="ct-nav__link">
                Reviews
              </a>
              <a href="#pricing" className="ct-nav__link">
                Pricing
              </a>
              <a href="#team" className="ct-nav__link">
                Team
              </a>
            </>
          ) : null}
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
              <Link href="/signin" className="ct-nav__link">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn--primary btn--sm">
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
