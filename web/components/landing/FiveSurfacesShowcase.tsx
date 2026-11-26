"use client";

import { useState } from "react";

const SURFACES = [
  {
    id: "studio",
    label: "Studio",
    image: "/tour/01-studio-server.webp",
    alt: "CogniTara Studio local server dashboard on Windows",
    caption: "One Windows PC hosts the server, LAN QR code, live telemetry, and offline licence vault.",
  },
  {
    id: "admin",
    label: "Admin",
    image: "/tour/02-admin-dashboard.webp",
    alt: "CogniTara Admin Portal overview and examinations directory",
    caption: "Principals and ICT leads supervise exams, student approvals, analytics, and school branding with zero page reloads.",
  },
  {
    id: "teacher",
    label: "Teacher",
    image: "/tour/05-teacher-studio.webp",
    alt: "CogniTara Teacher Exam Control Center",
    caption: "Educators author papers with one-click KaTeX formulas, CSV imports, and automated class progression sheets.",
  },
  {
    id: "student",
    label: "Student",
    image: "/tour/08-live-exam-room.webp",
    alt: "CogniTara Student Live Exam Room with scientific calculator",
    caption: "Students focus on one crisp question at a time with instant SQLite WAL autosave and a built-in scientific calculator.",
  },
  {
    id: "billing",
    label: "Billing",
    image: "/tour/10-paystack-billing.webp",
    alt: "CogniTara Studio native Paystack-Titan bank transfer checkout",
    caption: "Schools renew directly inside Studio via dedicated Paystack-Titan bank transfer or pre-selected web checkout.",
  },
];

export default function FiveSurfacesShowcase() {
  const [active, setActive] = useState(0);
  const current = SURFACES[active];

  return (
    <section id="surfaces" className="rs-container" data-rs-reveal>
      <div className="rs-section-head">
        <h2 className="rs-h2">Five surfaces, one server.</h2>
        <p className="rs-section-sub">
          A quick tour through hosting, administration, authoring, examination, and billing. The five places your school spends exam day.
        </p>

        <div className="rs-surface-tabs" role="tablist" aria-label="CogniTara workspaces">
          {SURFACES.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={idx === active}
              className="rs-surface-tab"
              onClick={() => setActive(idx)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rs-surface-frame">
        {SURFACES.map((s, idx) => (
          <img
            key={s.id}
            src={s.image}
            alt={s.alt}
            width={1600}
            height={1000}
            loading="lazy"
            style={{
              opacity: idx === active ? 1 : 0,
              transform: idx === active ? "scale(1)" : "scale(0.992)",
              pointerEvents: idx === active ? "auto" : "none",
            }}
          />
        ))}
      </div>

      <p className="rs-surface-caption" style={{ marginInline: "auto" }} aria-live="polite">
        {current.caption}
      </p>
    </section>
  );
}
