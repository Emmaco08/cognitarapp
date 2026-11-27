"use client";

import Link from "next/link";
import { useState } from "react";
import type { FaqCategory } from "@/lib/site-content";

export default function FaqClient({
  groups,
  supportEmail,
}: {
  groups: FaqCategory[];
  supportEmail: string;
}) {
  const [openKey, setOpenKey] = useState<string>("");

  return (
    <>
      <div className="rs-faq-sections">
        {groups.map((group, gi) => (
          <section
            key={group.category}
            className="rs-blur-in"
            style={{ ["--d" as string]: `${210 + gi * 70}ms` }}
          >
            <h2 className="rs-faq-group-title">{group.category}</h2>
            <div className="rs-faq-list">
              {group.items.map((item, ii) => {
                const key = `${gi}-${ii}`;
                const isOpen = openKey === key;
                return (
                  <div key={item.q} className="rs-faq-item" data-open={isOpen ? "true" : "false"}>
                    <button
                      type="button"
                      className="rs-faq-trigger"
                      aria-expanded={isOpen}
                      onClick={() => setOpenKey(isOpen ? "" : key)}
                    >
                      <span>{item.q}</span>
                      <svg
                        className="rs-faq-chevron"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {isOpen ? <div className="rs-faq-answer">{item.a}</div> : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <p className="rs-subpage-note rs-blur-in" style={{ ["--d" as string]: "480ms" }}>
        Didn’t find it? Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> and a real person will reply. How-tos are in the{" "}
        <Link href="/guides">guides</Link>; licences and pricing live on the{" "}
        <Link href="/license">license page</Link>.
      </p>
    </>
  );
}
