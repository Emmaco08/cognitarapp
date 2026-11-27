import type { Metadata } from "next";
import Link from "next/link";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import { getPublishedChangelogs } from "@/lib/cms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Updates & Changelog | CogniTara",
  description:
    "New features, reliability improvements, and fixes shipped to CogniTara Studio Desktop, Local CBT Portals, and CogniTara Cloud.",
};

export default async function ChangelogsPage() {
  const releases = await getPublishedChangelogs();

  return (
    <LenisGsapScope>
      <LandingNav activePath="/changelogs" />

      <main id="main-content" className="rs-subpage">
        <header className="rs-sub-hero">
          <div className="rs-sub-pill rs-blur-in" style={{ ["--d" as string]: "0ms" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2v4" />
              <path d="m16.2 7.8 2.9-2.9" />
              <path d="M18 12h4" />
              <path d="m16.2 16.2 2.9 2.9" />
              <path d="M12 18v4" />
              <path d="m4.9 19.1 2.9-2.9" />
              <path d="M2 12h4" />
              <path d="m4.9 4.9 2.9 2.9" />
            </svg>
            <span>Updates</span>
          </div>
          <h1 className="rs-page-title rs-blur-in" style={{ ["--d" as string]: "80ms" }}>
            What’s new in CogniTara
          </h1>
          <p className="rs-page-lead rs-blur-in" style={{ ["--d" as string]: "150ms" }}>
            New features, exam-hall reliability upgrades, and polish across CogniTara Studio Desktop and Cloud.
          </p>
        </header>

        <div className="rs-changelog-list">
          {releases.map((rel, idx) => (
            <article
              key={rel.version + idx}
              className="rs-release-entry rs-blur-in"
              style={{ ["--d" as string]: `${210 + idx * 60}ms` }}
            >
              <aside className="rs-release-aside">
                <span className="rs-release-ver">{rel.version}</span>
                <time className="rs-release-date">{rel.date}</time>
              </aside>

              <div className="rs-release-body">
                <h2 className="rs-release-title">{rel.title}</h2>
                <p className="rs-release-summary">{rel.summary}</p>

                {rel.newItems && rel.newItems.length > 0 ? (
                  <div className="rs-release-group">
                    <span className="rs-release-label">New</span>
                    <ul className="rs-release-ul">
                      {rel.newItems.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {rel.improvedItems && rel.improvedItems.length > 0 ? (
                  <div className="rs-release-group">
                    <span className="rs-release-label">Improved</span>
                    <ul className="rs-release-ul">
                      {rel.improvedItems.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {rel.fixedItems && rel.fixedItems.length > 0 ? (
                  <div className="rs-release-group">
                    <span className="rs-release-label">Fixed</span>
                    <ul className="rs-release-ul">
                      {rel.fixedItems.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        <p className="rs-subpage-note rs-blur-in" style={{ ["--d" as string]: "480ms" }}>
          Want release emails when new Windows builds ship?{" "}
          <Link href="/download">Request the latest installer on /download</Link>. Looking ahead? See what we’re building next on the{" "}
          <Link href="/roadmap">roadmap</Link>.
        </p>
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
