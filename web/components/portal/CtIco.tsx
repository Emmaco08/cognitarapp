"use client";

import React from "react";

export const CT_ICONS_URL = "/static/icons/cognitara-icons.svg";

export function CtIco({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg className={className ? `ct-ico ${className}` : "ct-ico"} aria-hidden="true">
      <use href={`${CT_ICONS_URL}#${name}`} />
    </svg>
  );
}

export function CtBrandMark() {
  return (
    <span className="ct-appicon">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <use href={`${CT_ICONS_URL}#ct-mark`} />
      </svg>
    </span>
  );
}

export function CtWordmark() {
  return (
    <svg className="ct-wordmark" aria-label="CogniTara">
      <use href={`${CT_ICONS_URL}#ct-word`} width="100%" height="100%" />
    </svg>
  );
}

export function toggleCtTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("ct-theme", next);
    localStorage.setItem("ct-cloud-theme", next);
  } catch {
    // ignore storage errors
  }
  return next;
}

export function CtThemeToggle({
  variant = "ct",
}: {
  variant?: "ct" | "st" | "ed";
}) {
  const cls =
    variant === "st"
      ? "st-icon-btn"
      : variant === "ed"
        ? "ed-icon-toggle"
        : "ct-iconbtn";
  return (
    <button
      type="button"
      className={cls}
      onClick={() => toggleCtTheme()}
      aria-label="Switch theme"
      title="Switch light or dark theme"
    >
      <span className="ct-theme-ico">
        <CtIco name="i-moon" className="ct-theme-ico__moon" />
        <CtIco name="i-sun" className="ct-theme-ico__sun" />
      </span>
    </button>
  );
}

export function getInitials(name: string, fallback = "CT"): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
