"use client";

import Link from "next/link";
import { SUPPORT_CHANNELS } from "@/lib/site-content";

export default function LandingSupportBand() {
  return (
    <section id="support" className="rs-support-band" data-rs-reveal aria-labelledby="landing-support-title">
      <div className="rs-support-band-inner">
        <div className="rs-support-band-head">
          <div>
            <p className="rs-page-eyebrow">Get support</p>
            <h2 id="landing-support-title" className="rs-h2" style={{ textAlign: "left", marginTop: 6 }}>
              Need help setting up your exam lab?
            </h2>
            <p className="rs-section-sub" style={{ textAlign: "left", marginTop: 10, maxWidth: 560 }}>
              Every message goes straight to the team building CogniTara. Whether you are planning a 300-student Wi-Fi lab, migrating an older database, or activating a licence key, we reply fast.
            </p>
          </div>
          <Link href="/support" className="rs-btn rs-btn--primary">
            Open Support Center →
          </Link>
        </div>

        <div className="rs-support-grid rs-support-grid--4">
          <a href={`mailto:${SUPPORT_CHANNELS.email}?subject=CogniTara%20School%20Support`} className="rs-support-card">
            <div>
              <p className="rs-support-card-kicker">Email support</p>
              <h3 className="rs-support-card-title">{SUPPORT_CHANNELS.email}</h3>
              <p className="rs-support-card-desc">
                Exam-day diagnostics, billing questions, licence keys, or lab Wi-Fi planning.
              </p>
            </div>
            <span className="rs-support-card-link">Send email →</span>
          </a>

          <Link href="/guides" className="rs-support-card">
            <div>
              <p className="rs-support-card-kicker">Step-by-step</p>
              <h3 className="rs-support-card-title">How-to Guides</h3>
              <p className="rs-support-card-desc">
                5-minute server install, cross-device exam recovery, KaTeX formulas, and LAN router setup.
              </p>
            </div>
            <span className="rs-support-card-link">Browse guides →</span>
          </Link>

          <Link href="/faq" className="rs-support-card">
            <div>
              <p className="rs-support-card-kicker">Plain answers</p>
              <h3 className="rs-support-card-title">Frequently Asked Questions</h3>
              <p className="rs-support-card-desc">
                Offline leases, power-cut recovery, anti-cheat rules, hardware specs, and pricing.
              </p>
            </div>
            <span className="rs-support-card-link">Read FAQ →</span>
          </Link>

          <Link href="/roadmap" className="rs-support-card">
            <div>
              <p className="rs-support-card-kicker">Feature requests</p>
              <h3 className="rs-support-card-title">Roadmap &amp; Feedback</h3>
              <p className="rs-support-card-desc">
                See what shipped, what is in progress for v2.4, and suggest features for your school.
              </p>
            </div>
            <span className="rs-support-card-link">View roadmap →</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
