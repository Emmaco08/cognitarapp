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
              <li><Link href="/#features">Offline LAN Engine</Link></li>
              <li><Link href="/#surfaces">Five Surfaces</Link></li>
              <li><Link href="/license">Pricing &amp; Licensing</Link></li>
            </ul>
          </div>

          <div className="rs-footer-col">
            <h3>Workspaces</h3>
            <ul>
              <li><Link href="/#surfaces">Admin Control Center</Link></li>
              <li><Link href="/#surfaces">Teacher Studio</Link></li>
              <li><Link href="/#surfaces">Student Exam Room</Link></li>
              <li><Link href="/#features">Common Entrance</Link></li>
            </ul>
          </div>

          <div className="rs-footer-col">
            <h3>Platform</h3>
            <ul>
              <li><Link href="/#reviews">Verified Reviews</Link></li>
              <li><Link href="/#features">KaTeX Math Editor</Link></li>
              <li><Link href="/license">Paystack Checkout</Link></li>
              <li><Link href="/#features">Encrypted Backups</Link></li>
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
        <Link href="/download">Download</Link>
        <Link href="/license">Licensing</Link>
        <Link href="/signin">Sign in</Link>
      </div>
    </footer>
  );
}
