import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import GuidesClient from "@/components/subpages/GuidesClient";
import { getCmsSupportPage, getPublishedGuides } from "@/lib/cms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How-to Guides — CogniTara",
  description:
    "Step-by-step guides for installing CogniTara Studio, running 300-device Wi-Fi LAN exams, cross-device recovery, KaTeX formulas, and licensing.",
};

export default async function GuidesPage() {
  const [guides, support] = await Promise.all([getPublishedGuides(), getCmsSupportPage()]);

  return (
    <LenisGsapScope>
      <LandingNav activePath="/guides" />

      <main id="main-content" className="rs-subpage rs-subpage--wide">
        <header className="rs-sub-hero">
          <div className="rs-sub-pill rs-blur-in" style={{ ["--d" as string]: "0ms" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            <span>How-to guides</span>
          </div>
          <h1 className="rs-page-title rs-blur-in" style={{ ["--d" as string]: "80ms" }}>
            How can we help?
          </h1>
          <p className="rs-page-lead rs-blur-in" style={{ ["--d" as string]: "140ms" }}>
            Guides for every part of CogniTara, from 5-minute Windows setup to 300-student exam halls.
          </p>
        </header>

        <GuidesClient guides={guides} supportEmail={support.email} />
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
