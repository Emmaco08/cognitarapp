import React from "react";

export function PlanEmblem({ slug, index = 0 }: { slug?: string; index?: number }) {
  const key = String(slug || "").toLowerCase();

  if (key.includes("lifetime") || key.includes("perpetual") || index === 3) {
    return (
      <svg className="cl-emblem-svg" viewBox="0 0 44 44" aria-hidden="true">
        <circle className="cl-em-path" cx="22" cy="10" r="3.5" />
        <path className="cl-em-path" d="M22 13.5V35" />
        <path className="cl-em-path" d="M22 19L12 14M22 19L32 14" />
        <path className="cl-em-path" d="M22 25L10 21M22 25L34 21" />
        <path className="cl-em-path" d="M22 31L13 28M22 31L31 28" />
        <circle className="cl-em-path" cx="10" cy="13" r="2.2" />
        <circle className="cl-em-path" cx="34" cy="13" r="2.2" />
        <circle className="cl-em-path" cx="8" cy="20.5" r="2" />
        <circle className="cl-em-path" cx="36" cy="20.5" r="2" />
        <circle className="cl-em-path" cx="11.5" cy="27.5" r="1.8" />
        <circle className="cl-em-path" cx="32.5" cy="27.5" r="1.8" />
      </svg>
    );
  }

  if (key.includes("annual") || key.includes("year") || index === 2) {
    return (
      <svg className="cl-emblem-svg" viewBox="0 0 44 44" aria-hidden="true">
        <circle className="cl-em-path" cx="22" cy="10" r="4" />
        <circle className="cl-em-path" cx="22" cy="10" r="1.4" />
        <path className="cl-em-path" d="M22 14V35" />
        <path className="cl-em-path" d="M22 20L13 15.5M22 20L31 15.5" />
        <path className="cl-em-path" d="M22 27L12 22.5M22 27L32 22.5" />
        <path className="cl-em-path" d="M22 33L15 30M22 33L29 30" />
        <circle className="cl-em-path" cx="11.5" cy="15" r="2" />
        <circle className="cl-em-path" cx="32.5" cy="15" r="2" />
        <circle className="cl-em-path" cx="10.5" cy="22" r="2" />
        <circle className="cl-em-path" cx="33.5" cy="22" r="2" />
      </svg>
    );
  }

  if (key.includes("term") || index === 1) {
    return (
      <svg className="cl-emblem-svg" viewBox="0 0 44 44" aria-hidden="true">
        <circle className="cl-em-path" cx="22" cy="11" r="4.2" />
        <circle className="cl-em-path" cx="22" cy="11" r="1.5" />
        <path className="cl-em-path" d="M22 15.2V35" />
        <path className="cl-em-path" d="M22 22L13 18M22 22L31 18" />
        <path className="cl-em-path" d="M22 29L14 25.5M22 29L30 25.5" />
        <circle className="cl-em-path" cx="11.5" cy="17.5" r="2.1" />
        <circle className="cl-em-path" cx="32.5" cy="17.5" r="2.1" />
        <circle className="cl-em-path" cx="12.5" cy="25" r="1.9" />
        <circle className="cl-em-path" cx="31.5" cy="25" r="1.9" />
      </svg>
    );
  }

  return (
    <svg className="cl-emblem-svg" viewBox="0 0 44 44" aria-hidden="true">
      <circle className="cl-em-path" cx="22" cy="12" r="4.5" />
      <circle className="cl-em-path" cx="22" cy="12" r="1.6" />
      <path className="cl-em-path" d="M22 16.5V35" />
      <path className="cl-em-path" d="M22 25L14 21.5M22 25L30 21.5" />
      <circle className="cl-em-path" cx="12.5" cy="21" r="2" />
      <circle className="cl-em-path" cx="31.5" cy="21" r="2" />
    </svg>
  );
}
