# Implementation Plan: CogniTara v2 Commercial Ecosystem & Desktop Launch

## Overview

CogniTara v2 upgrades the verified offline-first Flask (`3.1.0`) + Waitress (`3.0.2`) + SQLite WAL (`exam.db`, 32 domain tables, 201 baseline routes / 221 active `url_map` rules) examination portal into a commercially licensed Windows Super Admin Desktop application (`desktop/`) paired with a Next.js App Router + Neon Serverless Postgres + Paystack cloud licensing, dual-referral, and HQ compliance platform (`cognitara.net`), a full Daylight Academic UI/UX overhaul of all student/teacher/admin/Common Entrance portals, and a 9:16 launch motion advert (`cognitara-motion-studio/projects/cognitara-v2-launch/`). Execution proceeds strictly across 6 stages gated by **User Approval Gate #1** (after Stage 1 live `/desktop-preview` showcase) and **User Approval Gate #2** (after Stage 3 design preview before mass template rollout).

## Architecture Decisions

- **Electron Frameless Shell + Frozen Waitress WSGI Daemon (`desktop/`):** Pairs a custom frameless Electron window (`contextIsolation: true`, `nodeIntegration: false`, Windows System Tray) with `PyInstaller 6.20.0` + `PyArmor 9.2.4` obfuscated `wsgi.py` / `cognitara/security/license_guard.py`. Preserves local LAN intranet performance (`24` Waitress threads, SQLite WAL) while eliminating `start_offline_server.bat` console windows.
- **Zero-Tailwind Dual-Theme Design System (`DESIGN.md`, `.impeccable/design.json`, `static/css/cognitara-tokens.css`):** Enforces full **Obsidian Studio** (`[data-theme="dark"]`: `#05070B` backdrop, `#0B0F17` shell, `#0E131F` canvas, `#00D2FF` accent) and **Daylight Ceramic** (`[data-theme="light"]`: `#E6ECF4` backdrop, `#FFFFFF` shell/canvas, `#0A0E1A` ink, `#0066FF` accent) parity without Tailwind v3 or external CDNs, using self-hosted `Onest` UI typography, `JetBrains Mono` tabular numerals, `CogniTaraType` exclusively for `CogniTara` wordmarks, flat `1px` structural hairlines (zero nested cards), exponential deceleration motion (`cubic-bezier(0.16, 1, 0.3, 1)`), and zero-warning `impeccable detect` verification.
- **5-Layer Hardware-Bound Ed25519 + Triple-Anchor Anti-Clock-Tamper Vault:** Combines offline-verifiable Ed25519 signed leases (`cryptography 48.0.0`), HMAC-SHA256 hardware binding (SMBIOS UUID + CPU ProcessorId + Primary Disk Serial + `MachineGuid`), triple-persisted monotonic/high-water-mark anchors (Windows DPAPI `license_vault.bin` + Registry `HKLM/HKCU\Software\CogniTara\Vault` + SQLite `local_license_state` & exam timestamp check), signed HQ `RevocationTombstone` kill-switch, and dual-process enforcement. Includes a **15-minute graceful active-exam drain** so students mid-exam never lose answers on license expiry.
- **Non-Destructive Portal Refactor & Dockable Split-Pane Calculator v2:** Stage 3 refactors templates and introduces `cognitara-calc-v2.js` + `cognitara-formula-studio-v2.js` (`KaTeX` + `mhchem`) using CSS Grid docking so the scientific calculator never occludes question text, while keeping all 201 baseline routes, form payload names, CSRF shields, and `exam.db` response schemas untouched.
- **Vercel Next.js App Router + Neon Serverless Postgres + Paystack (`cognitara.net`):** Uses serverless Postgres (12 relational tables with `UNIQUE` constraints and immutable `wallet_ledger`) and timing-safe `HMAC-SHA512` Paystack webhooks (`NGN`/`USD`) to drive idempotent Ed25519 license signing and configurable dual referrals (cash commission % OR bonus license days).
- **Authentic-Asset EffectCraft + FFmpeg Motion Pipeline (Stage 6):** Scaffolds `cognitara-motion-studio/` using only verified `CogniTara-Brand-Identity/` vectors, `static/fonts/CogniTaraType-*.ttf`, real Stage 2–4 UI captures, neural voiceover (`edge_tts` / `kokoro_onnx`), word-synchronized ASS captions (`MarginV: 440`), and EBU R128 mastering (`-14` to `-16 LUFS`, `<= -1.0 dBTP`).

## Task List

### Stage 1: Architecture Master Plan, Product/Design Specs & Live Web Showcase
- [x] Task 1.1: Author Master Plan (`docs/COGNITARA_V2_MASTER_PLAN.md`), `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, and Stage 1–6 Task Plans (`tasks/plan.md`, `tasks/todo.md`)
- [ ] Task 1.2: Self-Host `Onest` + `JetBrains Mono` Fonts (`static/fonts/ui/`), Dual-Theme Tokens (`static/css/cognitara-tokens.css` Dark & Light), and Enriched Read-Only Telemetry (`cognitara/routes/preview.py`) with Impeccable Zero-Warning Verification
- [ ] Task 1.3: Build v2.1 Sculpted Boot Loader, Interactive Story Onboarding, Flattened Dual-Theme Command Center (`dark` & `light`), and Lockout Screens (`/desktop-preview`)
- [ ] Task 1.4: Verify Stage 1 Architecture Parity, Dual-Theme Playwright Visual Inspection (Dark + Light), and `impeccable detect` Zero-Warning Audit

### Checkpoint & USER APPROVAL GATE #1 (End of Stage 1)
- [ ] Present `docs/COGNITARA_V2_MASTER_PLAN.md`, `PRODUCT.md`, `DESIGN.md`, and live `/desktop-preview` Dark + Light showcase to the user
- [ ] Obtain explicit user approval before writing any Stage 2 Windows Desktop or Stage 3+ code

### Stage 2: Packaged Windows Super Admin Desktop App & 5-Layer License Vault
- [ ] Task 2.1: Add Non-Destructive `local_license_state` SQLite Table & Hardware Fingerprint Collector (`cognitara/security/hwid.py`)
- [ ] Task 2.2: Implement Triple-Anchor DPAPI Vault, Registry Anchor & Monotonic Anti-Clock-Tamper Engine (`cognitara/security/vault_store.py`)
- [ ] Task 2.3: Implement Ed25519 Lease Verifier, Tombstone Enforcer & 15-Min Exam Drain Guard (`cognitara/security/license_guard.py`)
- [ ] Task 2.4: Wire `license_guard` into `cognitara/__init__.py`, `wsgi.py` & Internal Desktop Status API
- [ ] Task 2.5: Scaffold Electron Frameless Shell (`720×440` Splash -> `1280×800` Studio), Preload IPC Bridge & Windows System Tray (`desktop/`)
- [ ] Task 2.6: Wire Dual-Theme (`dark` & `light`) Renderer UI to Live Engine, HWID Activation, WAL Hot Backups & Impeccable Zero-Warning Audit
- [ ] Task 2.7: Package PyArmor-Protected Engine (`PyInstaller 6.20.0`) & Electron Windows Distributable

### Checkpoint: Stage 2 Complete
- [ ] Packaged `.exe` boots without terminal console, starts Waitress in tray, enforces 5-layer license lock & 15-min drain

### Stage 3: Academic Portal UI/UX Overhaul (Design Preview -> Gate #2 -> Rollout)
- [ ] Task 3.1: Build Shared Daylight Academic Stylesheet (`static/css/cognitara-academic.css`) & Stage 3 Design Preview Showcase
- [ ] **USER APPROVAL GATE #2:** User reviews & approves Stage 3 Daylight Academic Design Preview (Student, Exam + Calc v2, Teacher + Formula Studio v2, Admin)
- [ ] Task 3.2: Upgrade Non-Occluding Dockable/Floating Scientific Calculator v2 (`static/js/cognitara-calc-v2.js`)
- [ ] Task 3.3: Upgrade Visual Math & Chemistry Formula Studio v2 (`static/js/cognitara-formula-studio-v2.js`)
- [ ] Task 3.4: Redesign Student Dashboard (`dashboard.html`) & Distraction-Free Regular Exam Engine (`exam_page.html`, `exam_start.html`, `exam_paused.html`)
- [ ] Task 3.5: Redesign Common Entrance Candidate Portal & CE Exam Engine (`ce_login.html`, `ce_dashboard.html`, `ce_exam_page.html`, `ce_submitted.html`)
- [ ] Task 3.6: Redesign Teacher Dashboard & Exam Authoring Templates (`teacher_dashboard.html`, `teacher_create_exam.html`, `exam_questions.html`, `ce_questions.html`)
- [ ] Task 3.7: Redesign School Admin & Common Entrance Admin Consoles (`admin.html`, `admin_school_settings.html`, `admin_common_entrance.html`, `admin_exam_technical_support.html`)

### Checkpoint: Stage 3 Complete
- [ ] All 201 baseline routes pass parity check; Playwright E2E verifies zero Calculator occlusion & KaTeX/`mhchem` rendering

### Stage 4: `cognitara.net` Cloud Platform (Next.js + Neon Postgres + Paystack + HQ Admin)
- [ ] Task 4.1: Initialize Next.js App Router Cloud Workspace (`cloud/`) with Tier A Dark Command Design Tokens & Neon Postgres Schema Migration (12 tables)
- [ ] Task 4.2: Implement Cloud Auth (`users_hq` Argon2id sessions) & Ed25519 License Signing Authority (`lib/crypto/ed25519.ts`)
- [ ] Task 4.3: Implement Paystack Checkout Initialization & HMAC-SHA512 Idempotent Webhook Processor (Monthly / Annual / Lifetime)
- [ ] Task 4.4: Implement Dual Referral Engine (`referrals`, `referral_conversions`, `wallet_ledger`, `payout_requests`) with Anti-Self-Referral Guard
- [ ] Task 4.5: Implement Desktop Activation, Heartbeat & Signed Revocation Tombstone APIs (`/api/v1/license/*`)
- [ ] Task 4.6: Build `cognitara.net` Landing, Checkout, Customer License Dashboard & Referral Portal UI
- [ ] Task 4.7: Build HQ Super Admin Portal (School Telemetry, Ban/Tombstone Kill-Switch, HWID Reset, Bonus Days & Payout Approvals)

### Checkpoint: Stage 4 Complete
- [ ] End-to-end checkout -> webhook -> Ed25519 lease -> activation -> heartbeat -> HQ ban tombstone verified in staging

### Stage 5: Full-Stack Security, Anti-Tamper & 201-Route Regression Verification
- [ ] Task 5.1: Write & Execute 5-Layer License, Clock-Rollback (>300s), Vault-Deletion & 15-Min Drain Automated Test Suite
- [ ] Task 5.2: Write & Execute Cloud Security Tests (Paystack HMAC-SHA512, Replay Idempotency, Referral Anti-Abuse, Tombstone Rejection)
- [ ] Task 5.3: Run Full Portal Regression Suite (`validate_architecture.py`, `pytest tests/`, 50-Station Concurrency, Playwright E2E Audit)

### Checkpoint: Stage 5 Complete
- [ ] Zero regressions across 201 baseline routes, 40+ existing tests, and all new v2 security/cloud suites

### Stage 6: CogniTara v2 Launch Advert (`cognitara-v2-launch`)
- [ ] Task 6.1: Initialize `cognitara-motion-studio/` Validator Tools & Export Authentic Brand/UI Asset Pack (`media_manifest.json`)
- [ ] Task 6.2: Synthesize Neural Voiceover (`voiceover_raw.wav`), Extract Word Timestamps & Generate Safe-Corridor Captions (`captions.ass`)
- [ ] Task 6.3: Author Procedural EffectCraft Comp (`build_comp.jsx` -> `project.ecproj`) & Render 1080×1920 @ 30fps Video
- [ ] Task 6.4: Master 4-Stem Audio (`-14` to `-16 LUFS`, `<= -1.0 dBTP`), Multiplex `master_production.mp4` & Pass 6-Axis Quality Gate

### Checkpoint: Complete (Stage 6 Sign-Off)
- [ ] `production_quality_report.py` exits 0; visually inspect downscaled 270×480 frames & full audio/video sync

## Risks and Mitigations

| Risk | Impact | Mitigation |
| :--- | :---: | :--- |
| **PyArmor `pyarmor-trial` license limit** (`Can't obfuscate big script and mix str` observed on CLI) | High | Split `license_guard.py`, `vault_store.py`, and `hwid.py` into focused `< 8 KB` security modules with minimal literal strings, or activate a commercial PyArmor license before Stage 2 release builds; fallback to Cython `.pyd` compilation of security modules if needed. |
| **Windows Registry `HKLM` permission denied when app runs non-elevated** | High | Anchor B attempts `HKLM\SOFTWARE\CogniTara\Vault` first and falls back cleanly to `HKCU\Software\CogniTara\Vault`, while Anchor A (`%ProgramData%\CogniTara\vault\`) sets explicit ACLs during NSIS/Inno Setup install or uses `%LOCALAPPDATA%\CogniTara\vault\` fallback in portable mode. |
| **False clock-tamper lockouts from legitimate Windows RTC drift or CMOS battery issues** | Med | Enforce a `300s` (5-minute) rollback grace tolerance in Layer 3; require monotonic usage accounting independently of RTC forward jumps; support signed HQ clock-resync token in heartbeat response. |
| **Legitimate school hardware repair (SSD/RAM swap) invalidating `hwid_hash`** | Med | Store 4 separate component hashes in `license_activations.hw_components_json`; allow >= 3/4 component match on heartbeat renewal and provide 1-click HQ HWID Reset in Stage 4 HQ Super Admin portal. |
| **PyInstaller / Electron Windows SmartScreen or AV false positives** | Med | Package with clean `--onedir` build + authentic `cognitara-favicon.ico` metadata; recommend EV/OV Authenticode code-signing prior to public school distribution. |
| **`CogniTara-Motion-Graphics/` and `cognitara-motion-studio/` absent on disk** | Med | Explicitly scaffold `cognitara-motion-studio/tools/` and generate isolated SVG/PNG/audio renders directly from verified `CogniTara-Brand-Identity/` and `static/fonts/` in Task 6.1 before EffectCraft composition. |
| **Out-of-order or duplicate Paystack webhooks corrupting wallet balances** | High | Enforce `UNIQUE` constraints on `paystack_reference`, `webhook_event_id`, `referral_conversions.payment_id`, and `wallet_ledger.idempotency_key` inside serializable Neon Postgres transactions. |
| **Template redesign breaking existing JS selectors, form `name`s, or 201 routes** | High | Enforce Design Preview Gate #2, preserve all endpoint URLs and `cognitara-actions.js` DOM IDs/names, and run `scripts/validate_architecture.py` + `pytest tests/` after every template batch. |

## Open Questions

- **Approval Gate #1 (End of Stage 1):** Does the interactive `/desktop-preview` 5-state showcase and dual-tone visual direction match your exact expectation for the Windows Super Admin Desktop App?
- **Stage 2 Distribution & PyArmor:** Will commercial PyArmor Pro or Cython `.pyd` + Windows Authenticode code-signing be used for final `.exe` builds?
- **Approval Gate #2 (Inside Stage 3):** Confirm visual approval of the Daylight Academic Design Preview (especially Dockable Calculator v2 layout and Formula Studio v2 toolbar) before mass rollout across all 73 templates.
- **Stage 4 Business Defaults:** Confirm exact NGN & USD prices for Monthly / Annual / Lifetime tiers, default referral cash commission `%` (proposed `15%`), default bonus days (proposed `14` days), and Paystack live vs test keys.
