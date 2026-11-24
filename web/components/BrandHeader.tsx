"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

export function BrandHeader({ signedIn = false }: { signedIn?: boolean }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramTheme = params.get("theme");
    const saved = paramTheme === "light" || paramTheme === "dark"
      ? paramTheme
      : (localStorage.getItem("ct-cloud-theme") as "dark" | "light" | null) || "dark";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("ct-cloud-theme", next);
  }

  return (
    <header className="ct-nav">
      <Link href="/" className="ct-brand">
        <span className="ct-brand__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 200 200">
            <path
              fill="#FFFFFF"
              d="M 150.91,150.91 C 122.79,179.03 77.21,179.03 49.09,150.91 C 20.97,122.79 20.97,77.21 49.09,49.09 C 77.21,20.97 122.79,20.97 150.91,49.09 L 131.11,68.89 C 113.93,51.70 86.07,51.70 68.89,68.89 C 51.70,86.07 51.70,113.93 68.89,131.11 C 86.07,148.30 113.93,148.30 131.11,131.11 Z"
            />
            <path
              fill="#00D2FF"
              d="M 108.00,74.00 C 115.00,93.00 115.00,93.00 146.00,100.00 C 115.00,107.00 115.00,107.00 108.00,126.00 C 101.00,107.00 101.00,107.00 90.00,100.00 C 101.00,93.00 101.00,93.00 108.00,74.00 Z"
            />
          </svg>
        </span>
        <span className="ct-brand__name">
          Cogni<em>Tara</em>
        </span>
        <span className="ct-brand__tag">Cloud</span>
      </Link>

      <nav className="ct-nav__links">
        <button type="button" className="btn btn--ghost btn--sm" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        {signedIn ? (
          <Link href="/dashboard" className="btn btn--primary btn--sm">
            School Dashboard
          </Link>
        ) : (
          <>
            <Link href="/signin" className="btn btn--ghost btn--sm">
              Sign in
            </Link>
            <Link href="/signup" className="btn btn--primary btn--sm">
              Create school account
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
