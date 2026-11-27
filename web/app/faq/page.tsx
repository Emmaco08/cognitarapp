import type { Metadata } from "next";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import FaqClient from "@/components/subpages/FaqClient";
import { getCmsSupportPage, getPublishedFaqs } from "@/lib/cms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FAQ | CogniTara",
  description:
    "Plain answers about offline LAN exams, cross-device recovery, backups, anti-cheat rules, and school licensing.",
};

export default async function FaqPage() {
  const [groups, support] = await Promise.all([getPublishedFaqs(), getCmsSupportPage()]);

  return (
    <LenisGsapScope>
      <LandingNav activePath="/faq" />

      <main id="main-content" className="rs-subpage">
        <header className="rs-sub-hero">
          <div className="rs-sub-pill rs-blur-in" style={{ ["--d" as string]: "0ms" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
            <span>FAQ</span>
          </div>
          <h1 className="rs-page-title rs-blur-in" style={{ ["--d" as string]: "80ms" }}>
            Questions, answered
          </h1>
          <p className="rs-page-lead rs-blur-in" style={{ ["--d" as string]: "150ms" }}>
            Plain answers about offline hosting, cross-device recovery, backups, privacy, and school licensing.
          </p>
        </header>

        <FaqClient groups={groups} supportEmail={support.email} />
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
