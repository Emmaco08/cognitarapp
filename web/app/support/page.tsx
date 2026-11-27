import type { Metadata } from "next";
import Link from "next/link";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import { SUPPORT_CHANNELS } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Support — CogniTara",
  description:
    "Get direct help from the CogniTara team for Windows lab setup, offline Wi-Fi configuration, licence keys, and exam-day diagnostics.",
};

export default function SupportPage() {
  return (
    <LenisGsapScope>
      <LandingNav activePath="/support" />

      <main id="main-content" className="rs-subpage">
        <header className="rs-page-hero" data-rs-reveal>
          <p className="rs-page-eyebrow">Get support</p>
          <h1 className="rs-page-title">Get in touch</h1>
          <p className="rs-page-lead">
            CogniTara is built and supported directly by the engineering team behind it. Every message gets a real reply from someone who knows the software inside out.
          </p>
        </header>

        <div className="rs-support-grid" data-rs-stagger>
          <a
            href={`mailto:${SUPPORT_CHANNELS.email}?subject=CogniTara%20Support%20Request`}
            className="rs-support-card"
          >
            <div>
              <p className="rs-support-card-kicker">Email support</p>
              <h2 className="rs-support-card-title">{SUPPORT_CHANNELS.email}</h2>
              <p className="rs-support-card-desc">
                Bug reports, billing or Paystack receipts, hardware licence transfers, or school lab Wi-Fi planning.
              </p>
            </div>
            <span className="rs-support-card-link">Write an email →</span>
          </a>

          <Link href="/guides" className="rs-support-card">
            <div>
              <p className="rs-support-card-kicker">Self-service documentation</p>
              <h2 className="rs-support-card-title">How-to Guides</h2>
              <p className="rs-support-card-desc">
                Step-by-step setup guides for installing Studio, connecting 300 student devices, and cross-device exam recovery.
              </p>
            </div>
            <span className="rs-support-card-link">Open guides →</span>
          </Link>

          <Link href="/faq" className="rs-support-card">
            <div>
              <p className="rs-support-card-kicker">Common questions</p>
              <h2 className="rs-support-card-title">Institutional FAQ</h2>
              <p className="rs-support-card-desc">
                Clear answers about offline leases, NEPA power cuts, database backups, and flat school licensing.
              </p>
            </div>
            <span className="rs-support-card-link">Browse FAQ →</span>
          </Link>

          <Link href="/roadmap" className="rs-support-card">
            <div>
              <p className="rs-support-card-kicker">Feature requests</p>
              <h2 className="rs-support-card-title">Roadmap &amp; Feedback</h2>
              <p className="rs-support-card-desc">
                Have an examination workflow your school needs? Check what is coming next or suggest a new feature.
              </p>
            </div>
            <span className="rs-support-card-link">View roadmap →</span>
          </Link>
        </div>

        <section className="rs-checklist-card" data-rs-reveal>
          <h2>When reporting a technical issue, please include:</h2>
          <ul>
            {SUPPORT_CHANNELS.bugChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <p className="rs-subpage-note">
          {SUPPORT_CHANNELS.responseWindow} Need to manage your school licence or encrypted cloud backups?{" "}
          <Link href="/signin">Sign in to your School Cloud Dashboard</Link>.
        </p>
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
