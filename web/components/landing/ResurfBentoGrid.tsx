"use client";

export default function ResurfBentoGrid() {
  return (
    <section id="features" className="rs-container">
      <div className="rs-section-head" data-rs-reveal>
        <h2 className="rs-h2">
          Run, grade, and supervise
          <br />
          every exam from one PC.
        </h2>
        <p className="rs-section-sub">
          A local-first examination server for secondary schools, colleges, and admission tests. Fully offline and private by default.
        </p>
      </div>

      <div className="rs-bento-grid" data-rs-stagger>
        {/* 1. One-Click Server (Resurf 3-keycap tactile visual) */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-keycap-row">
              <span className="rs-keycap rs-elevated">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                  <line x1="12" y1="2" x2="12" y2="12" />
                </svg>
              </span>
              <span className="rs-keycap rs-elevated">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                  <line x1="12" y1="20" x2="12.01" y2="20" />
                </svg>
              </span>
              <span className="rs-keycap rs-elevated" style={{ fontSize: 16, fontWeight: 600 }}>
                LAN
              </span>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">One-Click Server</h3>
            </div>
            <p className="rs-bento-desc">Start your school exam host in seconds with automatic LAN IP detection and QR code.</p>
          </div>
        </article>

        {/* 2. Zero-Reload Admin (Resurf tilted stacked cards) */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-stack-card-wrap">
              <div className="rs-stack-back" />
              <div className="rs-stack-front rs-elevated">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", color: "rgba(23,22,20,0.48)" }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: "#171614", color: "#fff", display: "grid", placeItems: "center", fontSize: 8 }}>C</span>
                    ADMIN STUDIO
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(23,22,20,0.45)", background: "rgba(23,22,20,0.05)", padding: "2px 6px", borderRadius: 99 }}>
                    0ms reload
                  </span>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#171614", marginBottom: 9 }}>
                  Exam Control Center
                </div>
                <div className="rs-skel-bar" style={{ width: "86%", marginBottom: 5 }} />
                <div className="rs-skel-bar rs-skel-bar--light" style={{ width: "62%" }} />
              </div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Zero-Reload Admin</h3>
            </div>
            <p className="rs-bento-desc">Switch across exams, approvals, analytics, and settings smoothly without full page reloads.</p>
          </div>
        </article>

        {/* 3. Classes & Cohorts (Resurf clustered soft pills) */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-pill-cluster">
              <span className="rs-tag-pill">
                <span style={{ width: 7, height: 7, borderRadius: 99, background: "#171614" }} />
                SS3 Science
              </span>
              <span className="rs-tag-pill">
                <span style={{ width: 7, height: 7, borderRadius: 99, background: "#787570" }} />
                Grade 10
              </span>
              <span className="rs-tag-pill"># first-term</span>
              <span className="rs-tag-pill"># waec-mock</span>
              <span className="rs-tag-pill"># entrance</span>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Classes &amp; Cohorts</h3>
            </div>
            <p className="rs-bento-desc">Organize papers, grading scales, and promotion rules by class, track, and term.</p>
          </div>
        </article>

        {/* 4. Visual Question Bank (Resurf clean asymmetric white blocks) */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-mini-layout">
              <div className="rs-mini-tile-lg rs-elevated">
                <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(23,22,20,0.06)", display: "grid", placeItems: "center", color: "rgba(23,22,20,0.5)", fontSize: 11, fontWeight: 600 }}>
                  Q1
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div className="rs-skel-bar" style={{ width: "85%" }} />
                  <div className="rs-skel-bar rs-skel-bar--light" style={{ width: "60%" }} />
                </div>
              </div>
              <div className="rs-mini-tile-col">
                <div className="rs-mini-tile-sm rs-elevated">
                  <div className="rs-skel-bar" style={{ width: "70%" }} />
                  <div className="rs-skel-bar rs-skel-bar--light" style={{ width: "92%" }} />
                </div>
                <div className="rs-mini-tile-sm rs-elevated" style={{ alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(23,22,20,0.45)" }}>CSV + Images</span>
                </div>
              </div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Visual Question Bank</h3>
            </div>
            <p className="rs-bento-desc">Author rich diagram questions directly or import hundreds from spreadsheets in seconds.</p>
          </div>
        </article>

        {/* 5. From Any Classroom Device (Resurf 3 elevated white device tiles) */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-device-tiles">
              <div className="rs-device-tile rs-elevated">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#171614" }}>
                  <path d="M3 5.5L10.5 4.4V11.5H3V5.5ZM11.5 4.25L21 2.9V11.5H11.5V4.25ZM3 12.5H10.5V19.6L3 18.5V12.5ZM11.5 12.5H21V21.1L11.5 19.75V12.5Z" />
                </svg>
                <span>Windows</span>
              </div>
              <div className="rs-device-tile rs-elevated">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#171614" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="3.2" />
                  <line x1="12" y1="8.8" x2="20.4" y2="8.8" />
                  <line x1="9.2" y1="13.6" x2="4.9" y2="6.2" />
                  <line x1="14.8" y1="13.6" x2="10.6" y2="20.8" />
                </svg>
                <span>Chrome</span>
              </div>
              <div className="rs-device-tile rs-elevated">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#171614" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
                  <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.2" />
                </svg>
                <span>Tablet</span>
              </div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Any Student Device</h3>
            </div>
            <p className="rs-bento-desc">Students sign in through any classroom browser over school Wi-Fi with zero client install.</p>
          </div>
        </article>

        {/* 6. Instant Command Search (Resurf search bar + dark Ctrl K keycap) */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-search-mock rs-elevated">
              <div className="rs-search-row">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(23,22,20,0.42)" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="M20 20l-3.5-3.5" />
                  </svg>
                  <span>Mathematics SS3</span>
                </span>
                <span className="rs-kbd-dark">Ctrl K</span>
              </div>
              <div style={{ borderTop: "1px solid rgba(23,22,20,0.06)", paddingTop: 8, display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "rgba(23,22,20,0.55)" }}>
                <span style={{ width: 16, height: 16, borderRadius: 5, background: "rgba(23,22,20,0.06)", display: "grid", placeItems: "center", fontSize: 10 }}>75</span>
                <span>exams · 486 students</span>
              </div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Instant Search</h3>
            </div>
            <p className="rs-bento-desc">Jump straight to any exam, student transcript, class analytics view, or setting fast.</p>
          </div>
        </article>

        {/* 7. 90s Power-Cut Grace (Resurf black audio pill + quote card) */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true" style={{ flexDirection: "column" }}>
            <div className="rs-timer-pill">
              <span className="rs-wave-bars">
                <span style={{ height: 5 }} />
                <span style={{ height: 11 }} />
                <span style={{ height: 8 }} />
                <span style={{ height: 13 }} />
                <span style={{ height: 6 }} />
                <span style={{ height: 10 }} />
              </span>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: "#FFFFFF" }} />
              <span>29:58</span>
            </div>
            <div className="rs-quote-bubble rs-elevated">
              “Every answer writes to SQLite WAL immediately. If power flickers, timers pause cleanly.”
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Power-Cut Resilience</h3>
            </div>
            <p className="rs-bento-desc">Automatic 90-second timer grace and instant local autosave protect students during outages.</p>
          </div>
        </article>

        {/* 8. KaTeX Formula Studio (Resurf tilted paper sheet + floating blue callout) */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-paper-sheet rs-elevated">
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.05em", color: "rgba(23,22,20,0.38)", marginBottom: 5 }}>
                PHYSICS.EXAM
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#171614", lineHeight: 1.3, marginBottom: 10 }}>
                x = (−b ± √Δ) / 2a
              </div>
              <div className="rs-skel-bar" style={{ width: "80%", marginBottom: 5, background: "rgba(23,22,20,0.22)" }} />
              <div className="rs-skel-bar rs-skel-bar--light" style={{ width: "92%", marginBottom: 5 }} />
              <div className="rs-skel-bar rs-skel-bar--light" style={{ width: "68%" }} />
              <span className="rs-blue-callout">Live preview</span>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">KaTeX Math &amp; Chem</h3>
            </div>
            <p className="rs-bento-desc">Insert fractions, roots, integrals, and chemical equations with zero syntax guesswork.</p>
          </div>
        </article>

        {/* 9. Instant Broadsheets (Resurf summary sheet + Opt-in / Auto pill) */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-summary-sheet rs-elevated">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10.5 }}>
                <span style={{ fontWeight: 600, color: "#171614", fontFamily: "var(--rs-mono)" }}>GRADED</span>
                <span style={{ color: "rgba(23,22,20,0.42)" }}>0.2s</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 4, height: 4, borderRadius: 99, background: "rgba(23,22,20,0.4)" }} />
                <div className="rs-skel-bar" style={{ flex: 1 }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 4, height: 4, borderRadius: 99, background: "rgba(23,22,20,0.4)" }} />
                <div className="rs-skel-bar rs-skel-bar--light" style={{ width: "78%" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 4, height: 4, borderRadius: 99, background: "rgba(23,22,20,0.4)" }} />
                <div className="rs-skel-bar rs-skel-bar--light" style={{ width: "64%" }} />
              </div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Instant Broadsheets</h3>
              <span className="rs-opt-badge">Auto</span>
            </div>
            <p className="rs-bento-desc">Class score distributions, hardest-question flags, and printable slips appear right on submit.</p>
          </div>
        </article>

        {/* 10. Native Paystack Transfer (Resurf BYO AI stacked pill + input card) */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-bank-stack">
              <div className="rs-bank-pill">
                <span>Paystack-Titan</span>
                <span style={{ width: 18, height: 18, borderRadius: 99, background: "#171614", color: "#fff", display: "grid", placeItems: "center", fontSize: 10 }}>✓</span>
              </div>
              <div className="rs-bank-acct rs-elevated">9904821735 · ₦75,000</div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">In-App Paystack</h3>
              <span className="rs-opt-badge">Built-in</span>
            </div>
            <p className="rs-bento-desc">Renew via native bank transfer inside Studio or open pre-selected Card, USSD, and OPay.</p>
          </div>
        </article>

        {/* 11. Common Entrance Portal (Resurf Ask Your Library floating pill prompt) */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-ce-prompt rs-elevated">
              <span className="rs-ce-float">Shortlist</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10.5, fontFamily: "var(--rs-mono)", background: "rgba(23,22,20,0.06)", color: "rgba(23,22,20,0.7)", padding: "2px 7px", borderRadius: 6 }}>
                  CE-2026-8419
                </span>
                <span style={{ fontSize: 10.5, background: "rgba(23,22,20,0.08)", color: "#171614", padding: "2px 7px", borderRadius: 6, fontWeight: 500 }}>
                  @admissions
                </span>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "#171614" }}>
                Rank candidates above 70% cutoff
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 2 }}>
                <span style={{ fontSize: 11, color: "rgba(23,22,20,0.45)" }}>142 shortlisted</span>
                <span style={{ width: 22, height: 22, borderRadius: 99, background: "#171614", color: "#fff", display: "grid", placeItems: "center", fontSize: 12 }}>↑</span>
              </div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Common Entrance</h3>
              <span className="rs-opt-badge">Opt-in</span>
            </div>
            <p className="rs-bento-desc">Register external candidates with unique PIN slips and rank admission shortlists instantly.</p>
          </div>
        </article>

        {/* 12. Fully Local Vault (Resurf blue folder icon + monospace path pill) */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-folder-mock">
              <div className="rs-folder-icon" />
              <div className="rs-path-pill rs-elevated">C:\CogniTara\exam.db</div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Fully local</h3>
            </div>
            <p className="rs-bento-desc">Your school database stays on your PC. Works offline, with optional encrypted cloud backups.</p>
          </div>
        </article>
      </div>
    </section>
  );
}
