import type { Metadata } from "next";
import Link from "next/link";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import LenisGsapScope from "@/components/landing/LenisGsapScope";
import { SUPPORT_CHANNELS } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Story — CogniTara",
  description:
    "Why we built CogniTara: a calm, offline-first school examination server that runs reliably on one Windows PC.",
};

export default function AboutPage() {
  return (
    <LenisGsapScope>
      <LandingNav activePath="/about" />

      <main id="main-content" className="rs-subpage rs-subpage--narrow">
        <header className="rs-page-hero" data-rs-reveal>
          <p className="rs-page-eyebrow">Story</p>
          <h1 className="rs-page-title">The idea behind CogniTara</h1>
          <p className="rs-page-lead">
            Why we are building an examination server that never fails when the internet drops or a lab computer dies.
          </p>
        </header>

        <article className="rs-story-prose" data-rs-reveal>
          <p>
            Every term, thousands of schools try to run computer-based tests using cloud websites built for fiber-connected offices. Everything looks fine during a 2-device test — until exam morning arrives and 200 students press Start at 9:00 AM over a single school router.
          </p>
          <p>
            Pages stall. Math equations fail to load. A desktop loses power in row three, and a student watches their answers disappear while their countdown keeps burning.
          </p>
          <p>
            That is why we started building CogniTara.
          </p>
          <p>
            CogniTara is a local-first examination server built for real school laboratories. You install CogniTara Studio on one Windows PC, connect it to your school Wi-Fi router, and immediately serve up to 300 student laptops, Chromebooks, iPads, and phones with sub-50ms local responses and zero internet required.
          </p>
          <p>
            Every student answer writes straight to SQLite WAL on your own host machine. If a computer shuts off mid-exam, the student walks to a spare desk, signs back in, and continues on the exact question and remaining second. If NEPA cuts power during a generator switchover, an administrator pauses the entire hall in one click.
          </p>
          <p>
            Our vision with CogniTara is simple: give every secondary school, college, and admissions office the calm reliability of institutional examination infrastructure — without per-student charges, without internet anxiety, and with every question bank and transcript owned completely by the school.
          </p>

          <div className="rs-story-sig">
            <strong>Emmanuel</strong>
            <span>Founder &amp; Lead Engineer, CogniTara</span>
          </div>
        </article>

        <section className="rs-principles-grid" data-rs-reveal aria-label="Core principles">
          <div className="rs-principle-card">
            <h3>Offline by default</h3>
            <p>
              Fonts, KaTeX math formulas, scientific calculator, and question diagrams live locally on your PC. Exam day never depends on mobile data.
            </p>
          </div>
          <div className="rs-principle-card">
            <h3>Zero lost progress</h3>
            <p>
              Write-through autosave, 90-second disconnect timer grace, and cross-device resumption make workstation crashes a 15-second non-event.
            </p>
          </div>
          <div className="rs-principle-card">
            <h3>Data you truly own</h3>
            <p>
              Your entire school record stays in a portable SQLite database on your machine, backed up locally every 30 minutes with optional encrypted cloud snapshots.
            </p>
          </div>
          <div className="rs-principle-card">
            <h3>Flat school licensing</h3>
            <p>
              Never pay per student or per sitting. One school licence covers unlimited students, teachers, exams, and Common Entrance tests.
            </p>
          </div>
        </section>

        <p className="rs-subpage-note">
          Want to chat about setting up CogniTara at your school? Email{" "}
          <a href={`mailto:${SUPPORT_CHANNELS.email}`}>{SUPPORT_CHANNELS.email}</a>, browse our{" "}
          <Link href="/guides">how-to guides</Link>, or{" "}
          <Link href="/download">download CogniTara Studio for Windows</Link>.
        </p>
      </main>

      <LandingFooter />
    </LenisGsapScope>
  );
}
