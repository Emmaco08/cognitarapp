import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import RoadmapClient from "@/components/subpages/RoadmapClient";
import { getCmsSupportPage, getPublishedRoadmap } from "@/lib/cms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Roadmap — CogniTara",
  description:
    "See what shipped, what is in progress, and what we are building next for CogniTara Studio and Cloud.",
};

export default async function RoadmapPage() {
  const [items, support] = await Promise.all([getPublishedRoadmap(), getCmsSupportPage()]);

  return (
    <LenisGsapScope>
      <LandingNav activePath="/roadmap" />

      <main id="main-content" className="rs-subpage">
        <header className="rs-sub-hero">
          <div className="rs-sub-pill rs-blur-in" style={{ ["--d" as string]: "0ms" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
            <span>Roadmap</span>
          </div>
          <h1 className="rs-page-title rs-blur-in" style={{ ["--d" as string]: "80ms" }}>
            What we’re building next
          </h1>
          <p className="rs-page-lead rs-blur-in" style={{ ["--d" as string]: "150ms" }}>
            Every milestone comes directly from principals, teachers, and ICT coordinators running real school exams.
          </p>
        </header>

        <RoadmapClient items={items} supportEmail={support.email} />
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
