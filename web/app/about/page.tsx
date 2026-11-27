import type { Metadata } from "next";
import Link from "next/link";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import { getCmsAboutPage, getCmsSupportPage } from "@/lib/cms";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Story — CogniTara",
  description:
    "The idea behind CogniTara: a calm, local-first school examination server that runs reliably on one Windows PC.",
};

export default async function AboutPage() {
  const [about, support] = await Promise.all([getCmsAboutPage(), getCmsSupportPage()]);

  return (
    <LenisGsapScope>
      <LandingNav activePath="/about" />

      <main id="main-content" className="rs-subpage rs-subpage--narrow">
        <header className="rs-sub-hero">
          <div className="rs-sub-pill rs-blur-in" style={{ ["--d" as string]: "0ms" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <span>{about.badge}</span>
          </div>
          <h1 className="rs-page-title rs-blur-in" style={{ ["--d" as string]: "80ms" }}>
            {about.title}
          </h1>
          <p className="rs-page-lead rs-blur-in" style={{ ["--d" as string]: "160ms" }}>
            {about.lead}
          </p>
        </header>

        <article className="rs-story-prose">
          {about.paragraphs.map((para, idx) => (
            <p
              key={idx}
              className="rs-blur-in"
              style={{ ["--d" as string]: `${240 + idx * 75}ms` }}
            >
              {para}
            </p>
          ))}

          <div
            className="rs-story-sig rs-blur-in"
            style={{ ["--d" as string]: `${240 + about.paragraphs.length * 75}ms` }}
          >
            <strong>{about.signatureName}</strong>
            <span>{about.signatureRole}</span>
          </div>
        </article>

        <p
          className="rs-subpage-note rs-blur-in"
          style={{ ["--d" as string]: `${310 + about.paragraphs.length * 75}ms` }}
        >
          Want to chat? Email{" "}
          <a href={`mailto:${support.email}`}>{support.email}</a>, browse our{" "}
          <Link href="/guides">how-to guides</Link>, or{" "}
          <Link href="/download">download CogniTara Studio</Link>.
        </p>
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
