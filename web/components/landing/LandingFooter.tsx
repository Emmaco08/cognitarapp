"use client";

import Link from "next/link";
import { CogniTaraLockup } from "../CogniTaraLogo";

export default function LandingFooter() {
  return (
    <footer className="rs-footer">
      <div className="rs-divider" />
      <div className="rs-footer-main">
        <div className="rs-footer-brand">
          <Link href="/" className="rs-brand" aria-label="CogniTara home">
            <CogniTaraLockup markSize={24} wordmarkHeight={16} />
          </Link>
          <p className="rs-footer-tagline">
            A Local School Exam Server.
            <br />
            Offline-first, on one Windows PC.
          </p>
        </div>

        <nav className="rs-footer-cols" aria-label="Footer">
          <div className="rs-footer-col">
            <h3>Product</h3>
            <ul>
              <li><Link href="/download">Download for Windows</Link></li>
              <li><a href="https://portal.cognitara.net">Online Exam Portal</a></li>
              <li><Link href="/#features">Features</Link></li>
              <li><Link href="/license">Pricing &amp; Licensing</Link></li>
              <li><Link href="/dashboard">Manage License</Link></li>
            </ul>
          </div>

          <div className="rs-footer-col">
            <h3>Learn</h3>
            <ul>
              <li><Link href="/guides">How-to Guides</Link></li>
              <li><Link href="/faq">FAQ</Link></li>
              <li><Link href="/blog">Blog</Link></li>
              <li><Link href="/changelogs">Updates</Link></li>
              <li><Link href="/roadmap">Roadmap</Link></li>
            </ul>
          </div>

          <div className="rs-footer-col">
            <h3>Company</h3>
            <ul>
              <li><Link href="/about">Story</Link></li>
              <li><Link href="/support">Support</Link></li>
              <li><Link href="/#reviews">Verified Reviews</Link></li>
              <li><Link href="/license">School Plans</Link></li>
            </ul>
          </div>

          <div className="rs-footer-col">
            <h3>Account</h3>
            <ul>
              <li><Link href="/signin">Sign in</Link></li>
              <li><Link href="/signup">Create school account</Link></li>
              <li><Link href="/dashboard">School dashboard</Link></li>
              <li><Link href="/hq">Admin Console</Link></li>
            </ul>
          </div>
        </nav>
      </div>

      <div className="rs-divider" />
      <div className="rs-footer-bottom">
        <span>© 2026 CogniTara</span>
        <Link href="/about">Story</Link>
        <Link href="/guides">Guides</Link>
        <Link href="/faq">FAQ</Link>
        <Link href="/support">Support</Link>
      </div>
    </footer>
  );
}
