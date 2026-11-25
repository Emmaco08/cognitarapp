import Link from "next/link";
import { BrandHeader } from "@/components/BrandHeader";
import { IconCloud, IconDownload, IconGift, IconWifiOff } from "@/components/Icons";

const RELEASES_URL = "https://github.com/Emmaco08/cognitarapp/releases/latest";

export default function HomePage() {
  return (
    <div className="ct-shell">
      <BrandHeader />

      <section className="ct-hero">
        <div>
          <h1>Run reliable school exams without relying on internet.</h1>
          <p>
            Set up CogniTara Studio on one Windows PC in your exam hall, connect hundreds of student
            devices over local Wi-Fi or LAN, and keep your exam database safely backed up to the cloud.
          </p>
          <div className="ct-hero__actions">
            <Link href="/signup" className="btn btn--primary btn--lg">
              Create school account
            </Link>
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--lg">
              <IconDownload size={16} />
              <span>Download for Windows</span>
            </a>
          </div>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <strong style={{ fontSize: 15 }}>How schools get started</strong>
            <span className="status-txt status-txt--ok">Windows 10 / 11</span>
          </div>
          <dl className="dl">
            <div>
              <dt>1. Create school account</dt>
              <dd>Takes under a minute</dd>
            </div>
            <div>
              <dt>2. Install CogniTara Studio</dt>
              <dd>One-click Windows installer</dd>
            </div>
            <div>
              <dt>3. Activate your licence</dt>
              <dd>Instant delivery after payment</dd>
            </div>
            <div>
              <dt>4. Run exams offline</dt>
              <dd>300+ students over school Wi-Fi</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="ct-grid3">
        <article className="ct-feat">
          <div className="ct-feat__icon">
            <IconWifiOff size={17} />
          </div>
          <h3>Built for zero-internet exam halls</h3>
          <p>
            Once activated, your school server runs exams smoothly even when the internet drops. Student
            answers save in real time so nothing is ever lost.
          </p>
        </article>

        <article className="ct-feat">
          <div className="ct-feat__icon">
            <IconCloud size={17} />
          </div>
          <h3>Automatic cloud exam backups</h3>
          <p>
            Back up your entire question bank, student list, and results to CogniTara Cloud with one
            click, backed by gentle weekly reminders.
          </p>
        </article>

        <article className="ct-feat">
          <div className="ct-feat__icon">
            <IconGift size={17} />
          </div>
          <h3>Earn rewards for every school you invite</h3>
          <p>
            Share your school referral link to earn cash wallet commissions and extra free licence days
            whenever another school subscribes.
          </p>
        </article>
      </section>
    </div>
  );
}
