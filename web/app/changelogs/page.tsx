import type { Metadata } from "next";
import Link from "next/link";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import { CHANGELOG_RELEASES } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Updates & Changelog — CogniTara",
  description:
    "New features, reliability improvements, and fixes shipped to CogniTara Studio Desktop, Local CBT Portals, and CogniTara Cloud.",
};

export default function ChangelogsPage() {
  return (
    <LenisGsapScope>
      <LandingNav activePath="/changelogs" />

      <main id="main-content" className="rs-subpage">
        <header className="rs-page-hero" data-rs-reveal>
          <p className="rs-page-eyebrow">Updates</p>
          <h1 className="rs-page-title">What’s new in CogniTara</h1>
          <p className="rs-page-lead">
            New features, exam-hall reliability upgrades, and polish across CogniTara Studio Desktop and Cloud.
          </p>
        </header>

        <div className="rs-changelog-list">
          {CHANGELOG_RELEASES.map((rel) => (
            <article key={rel.version} className="rs-release-entry" data-rs-reveal>
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
                      {rel.newItems.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {rel.improvedItems && rel.improvedItems.length > 0 ? (
                  <div className="rs-release-group">
                    <span className="rs-release-label">Improved</span>
                    <ul className="rs-release-ul">
                      {rel.improvedItems.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {rel.fixedItems && rel.fixedItems.length > 0 ? (
                  <div className="rs-release-group">
                    <span className="rs-release-label">Fixed</span>
                    <ul className="rs-release-ul">
                      {rel.fixedItems.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        <p className="rs-subpage-note">
          Want release emails when new Windows builds ship?{" "}
          <Link href="/download">Request the latest installer on /download</Link>. Looking ahead? See what we’re building next on the{" "}
          <Link href="/roadmap">roadmap</Link>.
        </p>
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
