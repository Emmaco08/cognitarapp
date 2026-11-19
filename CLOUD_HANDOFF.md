# CogniTara v2 — Cloud & GitHub Actions Handoff

**Target Repository:** `https://github.com/Emmaco08/cognitarapp` (`main` branch)  
**Purpose:** Continue building CogniTara v2 from cloud/remote agents and GitHub Actions while the user manages progress from their phone.

---

## 1. Project Overview & Purpose

CogniTara is an offline-first LAN Computer-Based Testing (CBT) examination portal built on **Flask + Waitress + SQLite WAL** (`cognitara/`, `app.py`, `wsgi.py`), currently preserving **201 baseline routes** across **13 modular blueprints**, **32 domain tables** in `exam.db`, and **40 automated tests** in `tests/`.

CogniTara v2 expands the local exam portal into four connected deliverables:
1. **Packaged Windows Super Admin Desktop App (`desktop/`):** Replaces the terminal launcher (`start_offline_server.bat`) with a frameless Windows desktop studio featuring a 5-step onboarding wizard, one-click server start/stop dial, Windows System Tray, hot backups, and a **5-layer hardware-bound Ed25519 + triple-anchor DPAPI/Registry/SQLite anti-clock-tamper licence vault** with a 15-minute graceful active-exam drain on expiry.
2. **Academic Portal v2 UI/UX Overhaul (`templates/`, `static/`):** Complete redesign of Student Dashboard, Distraction-Free Exam Engine, Non-Occluding Dockable Scientific Calculator v2, Teacher Dashboard, Visual Math/Chemistry Formula Studio v2 (`KaTeX` + `mhchem`), School Admin Console, and Common Entrance Portal — preserving all 201 baseline routes, form field names, and SQLite WAL invariants.
3. **`cognitara.net` Commercial Cloud Platform:** Next.js App Router + TypeScript on **Vercel** + **12-table Neon Serverless Postgres** + **Paystack** (`Monthly`, `Annual`, `Lifetime` plans in NGN/USD with HMAC-SHA512 verified webhooks) + **Dual Referral Program** (cash commission wallet & payout approvals OR bonus license days) + **Ed25519 License Signing Authority** + **HQ Super Admin Console** (school telemetry, account/school bans, signed revocation tombstones, HWID resets, payout approvals).
4. **Launch Advert in Motion Graphics:** 9:16 vertical (plus 16:9 cut) launch advert created from authentic CogniTara assets, real UI captures, voiceover, synced captions, and mastered audio.

---

## 2. Exact Current Status (Where We Stopped)

### Stage 1 & Stage 2 (Master Plan + Desktop App Design Preview) — COMPLETE & APPROVED (Gate 1 PASSED)

The user explicitly reviewed and approved the redesigned Desktop App preview (`"this is now perfect. i need you to now build the desktop app"`).

- **Approved Desktop App UI Source Files (BUILD FROM THESE):**
  - `templates/preview/studio.html`
  - `static/css/studio.css`
  - `static/js/studio.js`
  - `static/js/cognitara-qr.js` (zero-dependency offline SVG QR generator verified against standard QR matrices)
  - `cognitara/routes/preview.py` (serves `/desktop-preview` and read-only `/api/preview/telemetry`)
  - Self-hosted UI & brand fonts in `static/fonts/ui/` (`PlusJakartaSans-Variable.woff2`, `GeistMono-Variable.woff2`) and `static/fonts/` (`CogniTaraType-*`)
  - Official brand assets in `CogniTara-Brand-Identity/` (`cognitara-symbol.svg`, `cognitara-wordmark.svg`, `cognitara-favicon.ico`, `cognitara-brand-guidelines.md`) and `static/images/cognitara-favicon.ico`
- **Legacy Prototype Notice:** `templates/preview/desktop_app_preview.html` and `static/js/desktop-preview.js` are the earlier rejected prototype (kept only at `/desktop-preview/legacy`). **Do NOT build the desktop app from the legacy files.** Build `desktop/` from `studio.html` / `studio.css` / `studio.js` / `cognitara-qr.js`, removing only the preview-only bottom dock (`.dock`) and wiring every screen to real Electron IPC, the local Flask/Waitress engine, and the real 5-layer licence vault.

---

### Stage 3 (Windows Desktop App + 5-Layer Licence Vault + Windows CI Installer) — COMPLETE

All Stage 3 deliverables have been implemented and verified:
1. **5-Layer Windows Licensing & Anti-Clock-Tamper Vault (`cognitara/security/`):**
   - `cognitara/security/hwid.py`: Deterministic HMAC-SHA256 hardware fingerprint (`SMBIOS UUID`, `CPU ProcessorId`, primary disk serial, Windows `MachineGuid`) with `>= 3/4` component repair tolerance.
   - `cognitara/security/vault_store.py`: Triple-anchor persistence across Anchor A (`crypt32.dll!CryptProtectData` DPAPI `%ProgramData%\CogniTara\vault\license_vault.bin` with `%LOCALAPPDATA%` fallback), Anchor B (Windows Registry `HKLM\SOFTWARE\CogniTara\Vault` with `HKCU` fallback + `AnchorMac`), and Anchor C (`local_license_state` in `exam.db` + exam timestamp cross-check).
   - `cognitara/security/license_guard.py`: Ed25519 signature verification (`cryptography`), `>300s` clock-rollback detection (`CLOCK_TAMPER_LOCK`), offline lease tracking (`7d`/`30d`/`90d`), permanent signed `RevocationTombstone` burn (`HQ_REVOKED_LOCK`), **15-minute graceful active-exam drain** on expiry, 60s monotonic watchdog, and dual-process enforcement wired into `cognitara/__init__.py` and `wsgi.py`.
   - Test isolation bypass (`COGNITARA_TESTING_BYPASS_LICENSE=1`) is strictly gated on `app.config['TESTING'] == True` and unconditionally disabled when `getattr(sys, 'frozen', False)`.
2. **Secure Localhost Internal Desktop Control API (`cognitara/routes/internal_desktop.py`):**
   - Loopback-only, per-launch random bearer token (`COGNITARA_DESKTOP_TOKEN`) authenticated routes at `/api/internal/*` for licence management, live telemetry, proctor controls (`+5 min`, `Pause all`, `Resume`), hot SQLite backups (`sqlite3.backup()`) & verified restore, school profile setup, and super admin creation.
3. **Packaged Electron Desktop Application (`desktop/`):**
   - Frameless Electron window (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`), Windows 11 Mica backdrop, single-instance lock (`app.requestSingleInstanceLock()`), Windows System Tray, Layer 5 Electron-side independent Node `crypto.verify` Ed25519 bridge (`desktop/src/main/license-bridge.ts`), `EngineManager` supervising `cognitara-engine.exe` (`windowsHide: true`, zero console windows), and PyInstaller `--onedir` `--noconsole` builder (`desktop/build_engine.py`, `desktop/cognitara-engine.spec`).
   - Renderer UI built directly from approved `studio.html` / `studio.css` / `studio.js` / `cognitara-qr.js` with the preview-only `.dock` removed and strict CSP enforced.
4. **GitHub Actions Windows Build Workflow (`.github/workflows/build-windows-desktop.yml`):**
   - Runs on `windows-latest`: `python init_db.py`, `python scripts/validate_architecture.py`, 51-test core `pytest` suite, freezes `cognitara-engine.exe` + smoke-tests loopback `/health`, verifies cross-runtime Python↔Electron Ed25519 signatures, packages Windows NSIS `.exe` installer with `CogniTara-Brand-Identity/cognitara-favicon.ico` + SHA-256 checksums, and uploads as artifact `CogniTara-Studio-Windows-Installer`.

---

## 3. Immediate Next Step (Stage 4 → Gate 2)

- Design and build the interactive preview of **Academic Portal v2** (Student Dashboard, Distraction-Free Exam Engine, Non-Occluding Dockable Scientific Calculator v2, Teacher Dashboard, Visual Math/Chemistry Formula Studio v2 with `KaTeX` + `mhchem`, School Admin Console, and Common Entrance Portal) → capture Dark & Light Playwright screenshots for **User Approval Gate 2** before full rollout across all 73 templates.
- **Cloud Visual Feedback Rule (CRITICAL):** Capture Playwright screenshots (both Dark and Light themes where applicable) for every UI screen built or updated and present them to the user for remote phone review before advancing past approval gates.

---

## 4. Remaining Stages & Approval Gates

Full architecture, Neon DDL, security rules, and task details live in:
- `docs/COGNITARA_V2_PLAN.md` (concise master plan & approval gates)
- `docs/COGNITARA_V2_MASTER_PLAN.md` (detailed architecture, Mermaid diagrams, 5-layer security spec, 12-table Neon Postgres SQL DDL)
- `DESIGN.md` & `PRODUCT.md`
- `tasks/plan.md` & `tasks/todo.md`

Summary of upcoming stages:
- **Stage 3:** Build Windows Desktop App (`desktop/`) + 5-layer licence vault + `.github/workflows/build-windows-desktop.yml`.
- **Stage 4 → Gate 2 → Stage 5:** Design preview of Academic Portal v2 (Student, Exam Engine, Dockable Calculator v2, Teacher, Formula Studio v2, School Admin, Common Entrance) → **User Approval Gate 2** → Full rollout across all 73 templates while maintaining 100% route/form parity.
- **Stage 6 → Gate 3 → Stage 7:** Design `cognitara.net` landing page, checkout, and HQ admin console → **User Approval Gate 3** → Build `cognitara.net` (Next.js App Router on Vercel + Neon Postgres + Paystack + Dual Referrals + HQ Admin).
- **Stage 8:** Full security, anti-tamper, Paystack webhook replay, 15-min drain, and 201-route regression verification.
- **Stage 9:** Launch advert in motion graphics (9:16 vertical + 16:9).

---

## 5. Non-Negotiable Design & Tech Rules

- **Fixed Colour Palette ONLY:**
  - Midnight Navy `#0A0E1A`, Obsidian `#05070C`–`#121825`, Cobalt `#0066FF`, Electric Cyan `#00D2FF`, Ceramic `#F6F8FC`/`#FFFFFF`, Slate `#94A3B8`/`#516278`.
  - Emerald `#10B981`, Amber `#F59E0B`, Red `#F87171` **strictly for semantic status**, never decorative backgrounds.
- **Bans:** **ZERO Tailwind CSS** anywhere. **ZERO generic AI SaaS templates** or purple/violet gradients. **ZERO external CDNs** in offline portals or the desktop app.
- **Typography:** `Plus Jakarta Sans` for UI, `Geist Mono` for IP addresses/licence keys/timers/codes, official `CogniTara` SVG wordmark & Luminary C symbol from `CogniTara-Brand-Identity/`.

---

## 6. Cloud Environment Bootstrap

- `exam.db`, `.secret_key`, and `.env` are intentionally `.gitignore`d and not committed.
- In any fresh cloud workspace or CI job, run:
  ```bash
  python init_db.py
  ```
  before starting Flask (`python app.py` / `python wsgi.py`), running `python scripts/validate_architecture.py`, or capturing Playwright screenshots.

---

## 7. Open User Decisions (Do Not Block Stage 3)

1. Exact **NGN and USD** prices for Monthly, Annual, and Lifetime plans.
2. Referral program defaults (proposed: `15%` cash commission and/or `14` bonus days).
3. Live **Paystack**, **Vercel**, **Neon**, and `cognitara.net` credentials/domain setup (needed for Stage 7 deployment).
4. **Windows Authenticode code-signing certificate** decision for eliminating Windows SmartScreen warnings on the `.exe` installer.
