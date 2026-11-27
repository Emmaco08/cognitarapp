"use client";

export default function ResurfBentoGrid() {
  return (
    <section id="features" className="rs-container">
      <div className="rs-section-head" data-rs-reveal>
        <h2 className="rs-h2">
          Built for real exam halls,
          <br />
          not ideal internet labs.
        </h2>
        <p className="rs-section-sub">
          Every feature inside CogniTara solves a real exam-day failure: dead workstations, power cuts, side-by-side copying, and slow Wi-Fi.
        </p>
      </div>

      <div className="rs-bento-grid" data-rs-stagger>
        {/* 1. Cross-Device Exam Recovery (Hero killer feature!) */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-handoff-wrap">
              <div className="rs-handoff-node rs-handoff-node--off">
                <span style={{ fontSize: 10, fontFamily: "var(--rs-mono)", fontWeight: 600 }}>PC #14</span>
                <span style={{ fontSize: 11.5, fontWeight: 500 }}>Power off</span>
                <span style={{ fontSize: 10 }}>Q24 saved</span>
              </div>
              <span className="rs-handoff-arrow">→</span>
              <div className="rs-handoff-node rs-elevated">
                <span style={{ fontSize: 10, fontFamily: "var(--rs-mono)", fontWeight: 600, color: "#171614" }}>PC #19</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "#171614" }}>Resumed</span>
                <span style={{ fontSize: 10, color: "rgba(23,22,20,0.55)", fontFamily: "var(--rs-mono)" }}>Q24 · 18:42</span>
              </div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Cross-Device Recovery</h3>
              <span className="rs-opt-badge">Auto</span>
            </div>
            <p className="rs-bento-desc">
              If a student’s computer dies or freezes mid-exam, they move to another PC, sign in, and continue on the exact question and remaining second.
            </p>
          </div>
        </article>

        {/* 2. Power-Cut Timer Protection */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true" style={{ flexDirection: "column" }}>
            <div className="rs-timer-pill">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.92 }}
              >
                <path d="M10.41 10.41 5 14h6l-1 7 4.94-5.93" />
                <path d="M13 3 11.2 6.6" />
                <path d="m14.8 11 4.2-1h-6" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
              <span
                style={{
                  fontSize: 9.5,
                  letterSpacing: "0.06em",
                  fontWeight: 600,
                  padding: "2px 6px",
                  borderRadius: 99,
                  background: "rgba(255,255,255,0.16)",
                  color: "#FFFFFF",
                }}
              >
                PAUSED
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontVariantNumeric: "tabular-nums" }}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                  <rect x="2" y="1.5" width="2.6" height="9" rx="0.8" />
                  <rect x="7.4" y="1.5" width="2.6" height="9" rx="0.8" />
                </svg>
                <span>29:58</span>
              </span>
            </div>
            <div className="rs-quote-bubble rs-elevated">
              “Every click writes straight to SQLite WAL. When power flickers, clocks pause cleanly.”
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Power-Cut Timer Guard</h3>
            </div>
            <p className="rs-bento-desc">
              Instant write-through autosave and automatic 90-second disconnect grace protect every student’s script during NEPA outages.
            </p>
          </div>
        </article>

        {/* 3. One-Click Hall Control (Live Invigilator Console) */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-control-grid">
              <div className="rs-control-btn rs-control-btn--dark">Pause All</div>
              <div className="rs-control-btn rs-elevated">+10 min</div>
              <div className="rs-control-btn rs-elevated">Reset Warn</div>
              <div className="rs-control-btn rs-elevated">Resume Hall</div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">One-Click Hall Control</h3>
            </div>
            <p className="rs-bento-desc">
              Pause the whole exam hall during a generator switchover, grant extra minutes to one student, or force-submit papers live.
            </p>
          </div>
        </article>

        {/* 4. Anti-Cheat & Single-Session Fence */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-stack-card-wrap">
              <div className="rs-stack-back" />
              <div className="rs-stack-front rs-elevated">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", color: "rgba(23,22,20,0.48)" }}>
                    INTEGRITY GUARD
                  </span>
                  <span style={{ fontSize: 10, fontFamily: "var(--rs-mono)", color: "#171614", background: "#EFEFEF", padding: "2px 6px", borderRadius: 99, fontWeight: 600 }}>
                    0 / 5 warn
                  </span>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#171614", marginBottom: 6 }}>
                  Single-Session Fence Active
                </div>
                <div style={{ fontSize: 11, color: "rgba(23,22,20,0.55)" }}>
                  Tab switch tracked · Duplicate login blocked
                </div>
              </div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Anti-Cheat &amp; Session Lock</h3>
            </div>
            <p className="rs-bento-desc">
              Tracks tab switches and window exits with auto-submit thresholds, and blocks two devices from sharing one student login.
            </p>
          </div>
        </article>

        {/* 5. Shuffled Questions & Option Order */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-seat-pair">
              <div className="rs-seat-card rs-elevated">
                <span style={{ fontSize: 10, fontFamily: "var(--rs-mono)", color: "rgba(23,22,20,0.48)" }}>SEAT 01 · Q14</span>
                <div className="rs-seat-opts">
                  <span className="rs-seat-opt">C</span>
                  <span className="rs-seat-opt rs-seat-opt--hit">A</span>
                  <span className="rs-seat-opt">D</span>
                  <span className="rs-seat-opt">B</span>
                </div>
              </div>
              <div className="rs-seat-card rs-elevated">
                <span style={{ fontSize: 10, fontFamily: "var(--rs-mono)", color: "rgba(23,22,20,0.48)" }}>SEAT 02 · Q07</span>
                <div className="rs-seat-opts">
                  <span className="rs-seat-opt">B</span>
                  <span className="rs-seat-opt">D</span>
                  <span className="rs-seat-opt rs-seat-opt--hit">A</span>
                  <span className="rs-seat-opt">C</span>
                </div>
              </div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Per-Seat Randomization</h3>
            </div>
            <p className="rs-bento-desc">
              Pull random subsets from larger question banks and shuffle A-D options per student so neighbors never share the same order.
            </p>
          </div>
        </article>

        {/* 6. Zero-Internet LAN for 300+ Student Devices */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-keycap-row">
              <span className="rs-keycap rs-elevated">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                  <line x1="12" y1="20" x2="12.01" y2="20" />
                </svg>
              </span>
              <span className="rs-keycap rs-elevated" style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--rs-mono)" }}>
                LAN
              </span>
              <span className="rs-keycap rs-elevated" style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--rs-mono)" }}>
                300+
              </span>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Zero-Internet School LAN</h3>
            </div>
            <p className="rs-bento-desc">
              Serve 300+ laptops, Chromebooks, iPads, and phones from one Windows PC over school Wi-Fi with zero data costs or cloud lag.
            </p>
          </div>
        </article>

        {/* 7. Offline KaTeX Math & Chemistry Studio */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-paper-sheet rs-elevated">
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.05em", color: "rgba(23,22,20,0.38)", marginBottom: 5 }}>
                PHYSICS &amp; CHEM
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#171614", lineHeight: 1.35, marginBottom: 6 }}>
                x = (−b ± √Δ) / 2a
              </div>
              <div style={{ fontSize: 11.5, color: "rgba(23,22,20,0.65)", marginBottom: 8 }}>
                2H₂ + O₂ → 2H₂O
              </div>
              <div className="rs-skel-bar rs-skel-bar--light" style={{ width: "78%" }} />
              <span className="rs-blue-callout">Offline KaTeX</span>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">KaTeX Math &amp; Chem</h3>
            </div>
            <p className="rs-bento-desc">
              Visual formula builder for fractions, integrals, roots, and chemical equations with instant live preview, working 100% offline.
            </p>
          </div>
        </article>

        {/* 8. Built-In Scientific Calculator */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-mini-calc rs-elevated">
              <div className="rs-mini-calc-screen">
                <span style={{ fontSize: 9.5, color: "rgba(23,22,20,0.48)", fontFamily: "var(--rs-mono)" }}>sin(30)+√144</span>
                <strong style={{ fontSize: 13.5, color: "#171614", fontFamily: "var(--rs-mono)" }}>12.5</strong>
              </div>
              <div className="rs-mini-calc-keys">
                <span className="rs-mini-calc-key">sin</span>
                <span className="rs-mini-calc-key">cos</span>
                <span className="rs-mini-calc-key">√</span>
                <span className="rs-mini-calc-key">π</span>
                <span className="rs-mini-calc-key">7</span>
                <span className="rs-mini-calc-key">8</span>
                <span className="rs-mini-calc-key">9</span>
                <span className="rs-mini-calc-key rs-mini-calc-key--eq">=</span>
              </div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Scientific Calculator</h3>
              <span className="rs-opt-badge">Per exam</span>
            </div>
            <p className="rs-bento-desc">
              Enable a draggable basic or scientific calculator per paper so students stay inside the exam window during Math and Physics.
            </p>
          </div>
        </article>

        {/* 9. Instant WAEC/NECO Grading & Broadsheets */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-summary-sheet rs-elevated">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10.5 }}>
                <span style={{ fontWeight: 600, color: "#171614", fontFamily: "var(--rs-mono)" }}>GRADED · A1-F9</span>
                <span style={{ color: "rgba(23,22,20,0.45)", fontFamily: "var(--rs-mono)" }}>0.2s</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11.5, color: "#171614", fontWeight: 500 }}>
                <span>Grade 10 Math</span>
                <span style={{ fontFamily: "var(--rs-mono)" }}>90% · A1</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 4, height: 4, borderRadius: 99, background: "#171614" }} />
                <div className="rs-skel-bar" style={{ flex: 1 }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 4, height: 4, borderRadius: 99, background: "rgba(23,22,20,0.4)" }} />
                <div className="rs-skel-bar rs-skel-bar--light" style={{ width: "74%" }} />
              </div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Instant Grading &amp; Slips</h3>
              <span className="rs-opt-badge">Auto</span>
            </div>
            <p className="rs-bento-desc">
              Marks scripts the second students submit with custom school grading scales, subject analytics, and printable official score slips.
            </p>
          </div>
        </article>

        {/* 10. Common Entrance Admissions Portal */}
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
              <h3 className="rs-bento-title">Common Entrance Portal</h3>
              <span className="rs-opt-badge">Included</span>
            </div>
            <p className="rs-bento-desc">
              Run external entrance tests with unique candidate PIN slips, separate from regular students, and rank admission shortlists instantly.
            </p>
          </div>
        </article>

        {/* 11. Bulk CSV, Passages & Legacy DB Import */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-mini-layout">
              <div className="rs-mini-tile-lg rs-elevated">
                <div style={{ width: 24, height: 22, borderRadius: 6, background: "#171614", display: "grid", placeItems: "center", color: "#FFFFFF", fontSize: 10, fontWeight: 600 }}>
                  CSV
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div className="rs-skel-bar" style={{ width: "85%" }} />
                  <div className="rs-skel-bar rs-skel-bar--light" style={{ width: "60%" }} />
                </div>
              </div>
              <div className="rs-mini-tile-col">
                <div className="rs-mini-tile-sm rs-elevated">
                  <span style={{ fontSize: 11, fontWeight: 500, color: "#171614" }}>Diagrams</span>
                  <div className="rs-skel-bar rs-skel-bar--light" style={{ width: "86%" }} />
                </div>
                <div className="rs-mini-tile-sm rs-elevated" style={{ alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(23,22,20,0.55)" }}>Legacy .db</span>
                </div>
              </div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Bulk Import &amp; Migration</h3>
            </div>
            <p className="rs-bento-desc">
              Import hundreds of questions from CSV with formulas, attach comprehension passages and diagrams, or migrate an older exam.db safely.
            </p>
          </div>
        </article>

        {/* 12. 30-Min Local Auto-Backups & Encrypted Cloud Vault */}
        <article className="rs-bento-card">
          <div className="rs-bento-visual" aria-hidden="true">
            <div className="rs-folder-mock">
              <div className="rs-folder-icon" />
              <div className="rs-path-pill rs-elevated">C:\CogniTara\exam.db</div>
            </div>
          </div>
          <div className="rs-bento-body">
            <div className="rs-bento-title-row">
              <h3 className="rs-bento-title">Local Vault &amp; Cloud Sync</h3>
            </div>
            <p className="rs-bento-desc">
              Your school database stays private on your PC with automatic 30-minute local backups and optional encrypted cloud snapshots.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
