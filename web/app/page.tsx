import Link from "next/link";
import { BrandHeader } from "@/components/BrandHeader";

const RELEASES_URL = "https://github.com/Emmaco08/cognitarapp/releases/latest";

export default function HomePage() {
  return (
    <div className="ct-shell">
      <BrandHeader />

      <section className="ct-hero">
        <div>
          <span className="ct-badge">
            <i />
            Neon Postgres Cloud · Offline-Ready Studio 2.1
          </span>
          <h1>Offline exam halls, powered by CogniTara Cloud.</h1>
          <p>
            Create your school account once, activate CogniTara Studio on your Windows exam server,
            and run 300+ concurrent LAN exams with zero internet required during sittings.
          </p>
          <div className="ct-hero__actions">
            <Link href="/signup" className="btn btn--primary btn--lg">
              Create school account
            </Link>
            <Link href="/signin" className="btn btn--ghost btn--lg">
              Sign in
            </Link>
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--lg">
              Download Windows .exe
            </a>
          </div>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <strong style={{ fontSize: 15 }}>CogniTara Studio 2.1</strong>
            <span className="pill pill--ok">Windows x64</span>
          </div>
          <dl className="dl">
            <div>
              <dt>Exam Engine</dt>
              <dd>Flask + Waitress + SQLite WAL</dd>
            </div>
            <div>
              <dt>Licence Vault</dt>
              <dd>5-Layer Ed25519 + DPAPI</dd>
            </div>
            <div>
              <dt>Cloud Sign-In</dt>
              <dd>Online sync + Offline cache</dd>
            </div>
            <div>
              <dt>Auto-Updates</dt>
              <dd>Direct GitHub Releases delta</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="ct-grid3">
        <article className="card card--sm ct-feat">
          <span className="ct-feat__pill">01 · Offline-First</span>
          <h3>Never stops when internet drops</h3>
          <p>
            Your account profile and signed hardware lease cache safely inside CogniTara Studio so exam
            day continues seamlessly even completely disconnected.
          </p>
        </article>
        <article className="card card--sm ct-feat">
          <span className="ct-feat__pill">02 · 5-Layer Vault</span>
          <h3>Hardware-bound Ed25519 security</h3>
          <p>
            Triple-anchor anti-tamper protection with a 15-minute graceful active-exam drain so no
            student ever loses submitted answers.
          </p>
        </article>
        <article className="card card--sm ct-feat">
          <span className="ct-feat__pill">03 · Dual Referrals</span>
          <h3>Earn commissions or bonus days</h3>
          <p>
            Every registered school receives a unique referral code automatically to earn cash wallet
            credits or bonus licence days.
          </p>
        </article>
      </section>
    </div>
  );
}
