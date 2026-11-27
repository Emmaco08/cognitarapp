"use client";

import Link from "next/link";

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
          <Link href="/support" className="rs-btn rs-btn--primary" style={{ flexShrink: 0 }}>
            Open Support Center →
          </Link>
        </div>
      </div>
    </section>
  );
}

