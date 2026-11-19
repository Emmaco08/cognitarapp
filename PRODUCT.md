# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **School Administrators & ICT Coordinators:** Configure school terms, grading standards, user approvals, and examination schedules; launch, monitor, pause, extend, and back up the local LAN examination server via the CogniTara Windows Desktop Server Studio and Admin web console.
- **Regular Students & Common Entrance Candidates:** Take timed, distraction-free computer-based examinations over the school intranet across primary, junior secondary, senior secondary, and entrance cohorts.
- **Teachers & Form Tutors:** Author rich mathematical and chemical questions, import exam banks, review live candidate progress, manage form-class progression, and publish controlled results.
- **School Owners, Referral Partners & CogniTara HQ Compliance Admins (`cognitara.net`):** Purchase or renew Monthly, Annual, and Lifetime school licenses via Paystack, earn cash commissions or bonus license days through referrals, and manage hardware bindings, telemetry, payouts, and compliance bans at HQ.

## Product Purpose

CogniTara enables schools to run reliable, tamper-resistant computer-based examinations completely offline across local computer labs and tablets, while giving school operators a commercial Windows Desktop Server Studio and cloud licensing platform (`cognitara.net`) that eliminates raw terminal scripts and protects software licensing integrity even without internet access.

## Positioning

Unlike cloud-only testing platforms that stall when school internet drops, or raw batch-script local servers without commercial licensing, CogniTara pairs a 24-thread offline Waitress + SQLite WAL examination engine (`<2ms` local persistence per click) with hardware-bound Ed25519 offline leases, triple-anchor anti-clock-tamper defense, a 15-minute graceful active-exam drain on expiry, a non-occluding docked scientific calculator, and a visual KaTeX + `mhchem` formula studio.

## Operating Context

- **School Exam Halls & ICT Labs:** Windows 10/11 host machine running the local server on port `5000`, serving up to 300+ concurrent student browsers and proctor tablets over local LAN/Wi-Fi where internet may be absent and mains power can drop mid-examination.
- **Single-Sitting Integrity Rituals:** Candidates log in with session-fenced leases (`session_key`); every answer writes atomically to SQLite WAL on click; disconnects exceeding 25 seconds auto-pause attempts until an authorized proctor resumes them; reaching the configured warning ceiling atomically auto-submits rather than pausing.
- **Commercial Provisioning & Renewal:** Administrators activate licenses online or offline via `.cgnlic` Ed25519 certificates bound to host hardware (`CT-HWID-...`), while renewals, Paystack billing (`NGN` / `USD`), dual referrals, and HQ compliance tombstones happen on `cognitara.net`.

## Capabilities and Constraints

- **Confirmed Local Portal Baseline:** Modular Flask (`3.1.0`) + Waitress (`3.0.2`) application (`app.py`, `wsgi.py`, `cognitara/`) preserving `201` baseline routes (`221` active rules prior to Stage 1 preview routes) and `32` domain SQLite WAL tables in `exam.db`, with strict engine isolation between Regular School Exams and Common Entrance Exams.
- **Confirmed Academic Tools:** Offline `SafeMathEvaluator` AST scientific calculator (no `eval()`), offline `KaTeX` + `mhchem` interactive formula studio, WAEC 9-Point & Standard Letter grading schemes, NERDC Primary/JSS/SSS class progression preservation, and 100% offline bundled assets (`static/vendor/`).
- **Confirmed 5-Layer Licensing & Cloud Constraints:** Ed25519 signed leases (`monthly`, `annual`, `lifetime`), 4-component HMAC-SHA256 hardware binding, triple-anchor anti-clock-tamper storage (Windows DPAPI vault, Windows Registry, SQLite `local_license_state` with `300s` clock-rollback tolerance and `900s` active-exam drain), signed HQ `RevocationTombstone`, Vercel Next.js App Router + 12-table Neon Serverless Postgres + Paystack HMAC-SHA512 webhooks, and Dual Referral rewards (cash commission wallet + bonus license days).
- **[OPEN DECISION] Commercial Pricing & Referral Defaults:** Exact `NGN` and `USD` retail prices for `monthly`, `annual`, and `lifetime` tiers, default affiliate commission percentage (proposed `15%`), and default referral bonus days (proposed `14` days) are pending user confirmation.
- **[OPEN DECISION] Stage 2 Packaging & Signing Credentials:** Production PyArmor commercial license activation (current CLI reports `pyarmor-trial`) and Windows Authenticode EV/OV code-signing certificate are pending confirmation prior to Stage 2 release distribution.
- **[OPEN DECISION] Stage 3 UI Rollout Approval:** Academic portal visual overhaul awaits Gate #2 user review of the Stage 3 design preview.

## Brand Commitments

- **Official Identity:** Brand name **CogniTara**; symbol is the **Luminary C** ($270^\circ$ arc with $45^\circ$ radial terminal cuts) paired with the **4-point Tara Guiding Star** (`CogniTara-Brand-Identity/cognitara-symbol.svg`, `cognitara-primary.svg`). Generic drawn emblems, substitute star glyphs, and memory-redrawn crescents are prohibited.
- **Proprietary Wordmark Typeface:** `CogniTaraType` (`static/fonts/CogniTaraType-Bold.*`, `CogniTaraType-Regular.*`) is preserved exclusively for the `CogniTara` brand wordmark lockups so non-wordmark glyphs do not distort UI copy.
- **Zero External Runtime Dependencies:** Offline examination portals and the Desktop App must load zero external CDNs or remote fonts at runtime.
- **Dual-Theme Commitment:** Both **Obsidian Dark** and **Daylight Ceramic Light** themes must be supported in the Desktop Server Studio, built on Cobalt `#0066FF` and Electric Cyan `#00D2FF` without Tailwind CSS or unbranded purple gradients.

## Evidence on Hand

- **Verified Codebase & Architecture Docs:** `app.py`, `wsgi.py`, `exam.db`, `cognitara/`, `scripts/routes_baseline.json`, `scripts/validate_architecture.py`, `tests/` (40 automated tests), `docs/architecture/module-map.md`, `docs/architecture/database.md`, `docs/architecture/route-map.md`, and `docs/COGNITARA_V2_MASTER_PLAN.md`.
- **Verified Authentic Brand & Media Assets:** `CogniTara-Brand-Identity/` (`cognitara-symbol.svg`, `cognitara-primary.svg`, `cognitara-app-icon.png`, `cognitara-favicon.ico`, `cognitara-brand-guidelines.md`), `static/fonts/`, `static/images/screenshots/01_*.png`–`24_*.png`, and authentic school photography (`static/images/hero_students_cbt.jpeg`, `proctor_control_center.jpeg`, `exam_hall_lab.jpeg`, `educator_analytics.jpeg`, `principal_report.jpeg`).
- **Confirmed Absences (Do Not Fabricate):** No external customer testimonials, live revenue numbers, school enrollment counts beyond local `exam.db` seed data, or pre-existing `CogniTara-Motion-Graphics/` directory exist yet on disk.

## Product Principles

1. **Offline Exam Integrity First:** An active examination sitting must survive internet loss, browser refresh, and mid-exam power cuts with zero lost student responses.
2. **Never Lock Out a Student Mid-Paper:** Commercial license expiry freezes new sittings while granting a 15-minute graceful drain window so active candidates finish and submit cleanly.
3. **Truth Over Decorative Theater:** Telemetry, hardware locks, SQLite integrity, and student scores always display real verified state without synthetic status indicators or invented social proof.
4. **Clarity Under Exam Pressure:** Controls, timers, calculators, and formula tools stay legible, high-contrast, keyboard-accessible, and non-occluding under real lab lighting conditions.

## Accessibility & Inclusion

- **Contrast & Dual-Theme Legibility:** All body text meets `>= 4.5:1` contrast and headings/UI icons meet `>= 3:1` contrast across both Obsidian Dark and Daylight Ceramic Light modes to support dim server rooms and bright sunlit classrooms.
- **Reduced Motion & Keyboard Access:** Honors `prefers-reduced-motion: reduce`, supports full keyboard navigation (`Ctrl+K` command palette in Server Studio; keyboard math entry in Calculator v2 and Formula Studio v2), and maintains `>= 14px` readable exam copy without occluding question text.
