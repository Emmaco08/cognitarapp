import type { Metadata } from "next";
import Link from "next/link";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import { getCmsSupportPage } from "@/lib/cms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Support | CogniTara",
  description:
    "Get direct help from the CogniTara team for Windows lab setup, offline Wi-Fi configuration, licence keys, and exam-day diagnostics.",
};

export default async function SupportPage() {
  const support = await getCmsSupportPage();

  return (
    <LenisGsapScope>
      <LandingNav activePath="/support" />

      <main id="main-content" className="rs-subpage">
        <header className="rs-sub-hero">
          <div className="rs-sub-pill rs-blur-in" style={{ ["--d" as string]: "0ms" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="4" />
              <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" />
              <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
              <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" />
              <line x1="4.93" y1="19.07" x2="9.17" y2="14.83" />
            </svg>
            <span>{support.badge}</span>
          </div>
          <h1 className="rs-page-title rs-blur-in" style={{ ["--d" as string]: "80ms" }}>
            {support.title}
          </h1>
          <p className="rs-page-lead rs-blur-in" style={{ ["--d" as string]: "150ms" }}>
            {support.lead}
          </p>
        </header>

        <div className="rs-support-hub">
          <div className="rs-support-grid">
            <a
              href={`mailto:${support.email}?subject=CogniTara%20Support%20Request`}
              className="rs-support-card rs-blur-in"
              style={{ ["--d" as string]: "220ms" }}
            >
              <div>
                <span className="rs-support-card-ico" aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </span>
                <p className="rs-support-card-kicker">Email support</p>
                <h2 className="rs-support-card-title">{support.email}</h2>
                <p className="rs-support-card-desc">
                  Bug reports, billing questions, licence keys, hardware transfers, or anything else.
                </p>
              </div>
              <span className="rs-support-card-link">Write an email →</span>
            </a>

            <Link
              href="/guides"
              className="rs-support-card rs-blur-in"
              style={{ ["--d" as string]: "275ms" }}
            >
              <div>
                <span className="rs-support-card-ico" aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                </span>
                <p className="rs-support-card-kicker">Step-by-step</p>
                <h2 className="rs-support-card-title">How-to Guides</h2>
                <p className="rs-support-card-desc">
                  5-minute Windows install, 300-device Wi-Fi LAN setup, KaTeX formulas, and cross-device recovery.
                </p>
              </div>
              <span className="rs-support-card-link">Browse guides →</span>
            </Link>

            <Link
              href="/faq"
              className="rs-support-card rs-blur-in"
              style={{ ["--d" as string]: "330ms" }}
            >
              <div>
                <span className="rs-support-card-ico" aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <path d="M12 17h.01" />
                  </svg>
                </span>
                <p className="rs-support-card-kicker">Plain answers</p>
                <h2 className="rs-support-card-title">Institutional FAQ</h2>
                <p className="rs-support-card-desc">
                  How offline leases, NEPA power-cut pauses, backups, and flat school licensing work.
                </p>
              </div>
              <span className="rs-support-card-link">Read FAQ →</span>
            </Link>

            <Link
              href="/roadmap"
              className="rs-support-card rs-blur-in"
              style={{ ["--d" as string]: "385ms" }}
            >
              <div>
                <span className="rs-support-card-ico" aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                  </svg>
                </span>
                <p className="rs-support-card-kicker">Feature requests</p>
                <h2 className="rs-support-card-title">Feedback &amp; Roadmap</h2>
                <p className="rs-support-card-desc">
                  Have an idea or exam-hall workflow you’d love to see in CogniTara? Let us know.
                </p>
              </div>
              <span className="rs-support-card-link">View roadmap →</span>
            </Link>
          </div>

          <section className="rs-checklist-card rs-blur-in" style={{ ["--d" as string]: "440ms" }}>
            <h2>When reporting a bug, include:</h2>
            <ul>
              {support.bugChecklist.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </section>
        </div>

        <p className="rs-subpage-note rs-blur-in" style={{ ["--d" as string]: "500ms" }}>
          {support.responseWindow} For how-tos, see the <Link href="/guides">guides</Link>; for offline leases and backups, the{" "}
          <Link href="/faq">FAQ</Link>.
        </p>
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
