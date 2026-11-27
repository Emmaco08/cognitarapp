# CogniTara v2 - Master Vertical Task Breakdown (`tasks/todo.md`)

All tasks are vertically sliced (`XS`/`S`/`M`, touching at most 5 files per task) and ordered bottom-up by dependency across Stages 1-6, separated by explicit checkpoints and **two mandatory User Approval Gates**.

---

## Stage 1: Architecture Master Plan & Live Interactive Web Showcase (`/desktop-preview`)

### Task 1.1: Author Master Plan, Product/Design Truths & Task Breakdown
**Description:** Inspect verified repository architecture, routes, SQLite schema, brand identity vectors, and installed toolchain, then author the authoritative CogniTara v2 master architecture specification, Impeccable `PRODUCT.md`, `DESIGN.md` + `.impeccable/design.json` dual-theme design system, and Stage 1-6 vertical task plan.

**Acceptance criteria:**
- [x] `docs/COGNITARA_V2_MASTER_PLAN.md` documents verified baseline metrics, Mermaid diagrams, Dual-Tone tokens, 5-layer Ed25519/DPAPI/monotonic schemas, all 12 Neon Postgres DDL tables, Stage 3 blueprint, and Stage 6 8-beat storyboard.
- [x] `PRODUCT.md` (`<!-- impeccable:product-schema 1 -->`), `DESIGN.md` (8 canonical Stitch sections + YAML frontmatter), and `.impeccable/design.json` (`schemaVersion: 2`) specify Obsidian Dark & Daylight Ceramic Light parity, `Onest` + `JetBrains Mono` + `CogniTaraType`, exponential ease-out, and flat hairline rules.
- [x] `tasks/plan.md` and `tasks/todo.md` contain ordered `S`/`M` tasks with acceptance criteria, verification commands, and two approval gates.

**Verification:**
- [x] Manual check: `impeccable.cmd context --target templates/preview/desktop_app_preview.html` resolves `PRODUCT.md` and `DESIGN.md` cleanly (`platform: web`) and `impeccable.cmd detect --json static/css/cognitara-tokens.css` exits 0 (`[]`).

**Dependencies:** None

**Files likely touched:**
- `docs/COGNITARA_V2_MASTER_PLAN.md`
- `PRODUCT.md`
- `DESIGN.md`
- `.impeccable/design.json`
- `tasks/plan.md` & `tasks/todo.md`

**Estimated scope:** Medium (5 files)

---

### Task 1.2: Self-Host Offline Fonts, Dual-Theme Tokens & Enriched Read-Only Telemetry
**Description:** Self-host `Onest` (`400`-`700`) and `JetBrains Mono` (`400`-`600`) under `static/fonts/ui/`, upgrade `static/css/cognitara-tokens.css` for seamless `[data-theme="dark"]` (Obsidian Studio) and `[data-theme="light"]` (Daylight Ceramic) switching with zero bounce easing, and enrich `cognitara/routes/preview.py` read-only telemetry (`recent_exams`, `total_questions`, `classes_count`, `grading_scheme`, `portal_capabilities`).

**Acceptance criteria:**
- [ ] `static/fonts/ui/` contains valid `wOF2` fonts (`Onest` + `JetBrains Mono`) and `static/css/cognitara-tokens.css` declares both `[data-theme="dark"]` and `[data-theme="light"]` token ladders with exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`).
- [ ] `GET /api/preview/telemetry` returns HTTP 200 JSON with LAN URLs, live `recent_exams`, `total_questions`, `classes_count`, `grading_scheme`, `portal_capabilities`, and SQLite WAL status under `PRAGMA query_only = ON`.
- [ ] `impeccable.cmd detect --json static/css/cognitara-tokens.css` passes with 0 findings (`[]`) and `preview_bp` preserves all 201 baseline routes.

**Verification:**
- [ ] Tests pass: `python scripts/validate_architecture.py`
- [ ] Lint/Audit pass: `& "c:\COGNITARA EXAM PORTAL\.agent\skills\impeccable\scripts\impeccable.cmd" detect --json static/css/cognitara-tokens.css` returns `[]`

**Dependencies:** None

**Files likely touched:**
- `static/fonts/ui/*`
- `static/css/cognitara-tokens.css`
- `cognitara/routes/preview.py`
- `cognitara/routes/__init__.py`

**Estimated scope:** Medium (4 files)

---

### Task 1.3: Build v2.1 Sculpted Boot, Story Onboarding & Dual-Theme Command Center Showcase
**Description:** Rebuild `/desktop-preview` (`templates/preview/desktop_app_preview.html`, `static/css/desktop-preview.css`, `static/js/desktop-preview.js`) with live Obsidian Dark ⇄ Daylight Ceramic Light switching (`startViewTransition`), a sculpted `720×440` optical canvas Boot Loader expanding smoothly to `1280×800`, an animated 4-step story Onboarding explaining every CogniTara portal (with power-cut simulator and live miniature UI stages), a flattened hairline Command Center (`Ctrl+K` palette, 60fps Canvas throughput waveform, live `exam.db` exams), and States 4 & 5 lockouts.

**Acceptance criteria:**
- [ ] Supports live Dark/Light theme switching across all 5 states, zero nested cards, zero decorative grid backgrounds, zero uppercase eyebrows, and `CogniTaraType` strictly isolated to the `CogniTara` wordmark.
- [ ] Uses exact canonical Luminary C & Tara Star SVG paths, self-hosted `Onest` + `JetBrains Mono` fonts, and zero external CDN requests.
- [ ] `impeccable.cmd detect --json templates/preview/desktop_app_preview.html static/css/desktop-preview.css static/css/cognitara-tokens.css` and `node --check static/js/desktop-preview.js` pass with 0 findings.

**Verification:**
- [ ] Static check: `node --check static/js/desktop-preview.js` exits 0 and `impeccable.cmd detect --json` returns zero warnings/advisories (`[]`).
- [ ] Manual check: Render `/desktop-preview` in Playwright across Dark & Light themes (`1440×900` and `1280×800`) asserting 0 console/page/network errors.

**Dependencies:** Task 1.1, Task 1.2

**Files likely touched:**
- `templates/preview/desktop_app_preview.html`
- `static/css/desktop-preview.css`
- `static/js/desktop-preview.js`

**Estimated scope:** Medium (3 files)

---

### Task 1.4: Verify Stage 1 Baseline Parity, Dual-Theme Playwright Audit & Impeccable Gate
**Description:** Execute architecture parity checks, core modular persistence tests, `impeccable detect` static + live URL audits across Obsidian Dark and Daylight Ceramic Light themes, and visually inspect captured multi-state screenshots (`1440×900` & `1280×800`).

**Acceptance criteria:**
- [ ] `scripts/validate_architecture.py` and `pytest tests/test_modular_architecture_and_persistence.py` pass with 0 regressions.
- [ ] Playwright + `impeccable detect` verify HTTP 200, Dark + Light contrast (`>= 4.5:1`), authentic SVG paths, self-hosted `Onest`/`JetBrains Mono`/`CogniTaraType` fonts, and zero console/CDN errors.
- [ ] Visual review of captured PNGs confirms sculpted boot, animated story onboarding, flattened Command Center, Light mode parity, and lockout states with zero clipping.

**Verification:**
- [ ] Tests pass: `python scripts/validate_architecture.py && pytest tests/test_modular_architecture_and_persistence.py`
- [ ] Audit pass: `impeccable.cmd detect --json` passes on templates, CSS, and live `/desktop-preview` URL in both themes.

**Dependencies:** Task 1.1, Task 1.2, Task 1.3

**Files likely touched:**
- `tests/` (optional Stage 1 route test, or scratch Playwright verification script)

**Estimated scope:** Small (1 file)

---

## USER APPROVAL GATE #1 (Mandatory Stop After Stage 1)
- [ ] **GATE #1:** Present `docs/COGNITARA_V2_MASTER_PLAN.md`, `tasks/plan.md`, `tasks/todo.md`, and verified `/desktop-preview` screenshots/URL to the user. **HALT until user grants explicit approval to proceed to Stage 2.**

---

## Stage 2: Packaged Windows Super Admin Desktop App & 5-Layer License Vault

### Task 2.1: Add `local_license_state` Table & Windows Hardware Fingerprint Module
**Description:** Add non-destructive `local_license_state` table creation to `cognitara/database/initialization.py` and implement `cognitara/security/hwid.py` to compute deterministic HMAC-SHA256 hardware fingerprints from SMBIOS UUID, CPU `ProcessorId`, primary disk serial, and `MachineGuid`.

**Acceptance criteria:**
- [ ] `local_license_state` initializes idempotently without modifying existing 32 domain tables or student rows.
- [ ] `get_hardware_fingerprint()` returns normalized `hwid_hash`, `display_hwid` (`CT-HWID-...`), and individual component hashes reliably on Windows.

**Verification:**
- [ ] Tests pass: `pytest tests/test_modular_architecture_and_persistence.py`
- [ ] Manual check: `python -c "from cognitara.security.hwid import get_hardware_fingerprint; print(get_hardware_fingerprint()['display_hwid'])"`

**Dependencies:** Gate #1 Approval

**Files likely touched:**
- `cognitara/database/initialization.py`
- `cognitara/security/hwid.py`
- `tests/test_license_vault.py`

**Estimated scope:** Medium (3 files)

---

### Task 2.2: Build Triple-Anchor DPAPI Vault & Monotonic Anti-Clock-Tamper Store
**Description:** Implement `cognitara/security/vault_store.py` using Windows `crypt32.dll!CryptProtectData` DPAPI encryption for `%ProgramData%\CogniTara\vault\license_vault.bin` (with local fallback path if non-elevated), Windows Registry anchor (`HKLM`/`HKCU\Software\CogniTara\Vault`), and SQLite `local_license_state` + `scores`/`ce_attempts` timestamp cross-checks.

**Acceptance criteria:**
- [ ] DPAPI round-trip encrypts/decrypts vault state cleanly on Windows with HMAC state integrity verification.
- [ ] Clock rollback `> 300s` below `max_seen_utc` or missing `vault.bin` when Registry/DB anchor exists trips `CLOCK_TAMPER_LOCK`.
- [ ] Monotonic tick accumulates `used_seconds` and `lease_used_seconds` across restarts without relying on wall-clock delta.

**Verification:**
- [ ] Tests pass: `pytest tests/test_license_vault.py -k "dpapi or tamper or monotonic"`

**Dependencies:** Task 2.1

**Files likely touched:**
- `cognitara/security/vault_store.py`
- `tests/test_license_vault.py`

**Estimated scope:** Small (2 files)

---

### Task 2.3: Implement Ed25519 Lease Verifier, Revocation Tombstone & 15-Min Exam Drain Guard
**Description:** Implement `cognitara/security/license_guard.py` verifying canonical Ed25519 `.cgnlic` leases and `RevocationTombstone` payloads via `cryptography 48.0.0`, enforcing HWID match and managing the 15-minute graceful active-exam drain window.

**Acceptance criteria:**
- [ ] Rejects forged/tampered Ed25519 lease payloads and mismatched `hwid_hash` values fail-closed.
- [ ] Enters `DRAINING` (`<= 900s`) instead of hard-killing when expiry hits while `scores` or `ce_attempts` have `status='in_progress'`, blocking new exam starts while permitting completion.
- [ ] Permanently persists signed `RevocationTombstone` into all 3 anchors and transitions immediately to `HQ_REVOKED_LOCK`.

**Verification:**
- [ ] Tests pass: `pytest tests/test_license_vault.py -k "ed25519 or tombstone or drain"`

**Dependencies:** Task 2.2

**Files likely touched:**
- `cognitara/security/license_guard.py`
- `tests/test_license_vault.py`

**Estimated scope:** Small (2 files)

---

### Task 2.4: Integrate `license_guard` into `create_app()`, `wsgi.py` & Internal Desktop Control API
**Description:** Wire `license_guard` into `cognitara/__init__.py` (`before_request` enforcement + 60s watchdog thread), `wsgi.py` boot check, and expose local localhost-only control/status endpoints (`/api/internal/license-status`, `/api/internal/hot-backup`) for Electron.

**Acceptance criteria:**
- [ ] `wsgi.py` and `create_app()` enforce active license state on production boot while allowing isolated pytest runs (`TESTING=True`).
- [ ] Locked states return HTTP `403` / lock screen on portal routes while preserving `/health` and `/api/internal/license-status`.
- [ ] All 201 baseline routes remain intact.

**Verification:**
- [ ] Tests pass: `python scripts/validate_architecture.py && pytest tests/test_modular_architecture_and_persistence.py tests/test_license_vault.py`

**Dependencies:** Task 2.3

**Files likely touched:**
- `cognitara/__init__.py`
- `wsgi.py`
- `cognitara/routes/preview.py` (or dedicated `cognitara/routes/internal_desktop.py`)
- `cognitara/routes/__init__.py`

**Estimated scope:** Medium (4 files)

---

### Task 2.5: Scaffold Electron Main Shell, Typed Preload Bridge & System Tray
**Description:** Create `desktop/` Electron TypeScript/JS project featuring a frameless `720×440` sculpted boot splash window that expands smoothly to `1280×800` Server Studio (`contextIsolation: true`, `nodeIntegration: false`), OS dark/light theme synchronization, single-instance lock, Windows System Tray menu (Start/Stop/Open Portal/Quit), and child process supervisor for Waitress.

**Acceptance criteria:**
- [ ] Launches cleanly with `CogniTara-Brand-Identity/cognitara-app-icon.png` / `.ico` and no console window, smoothly transitioning from `720×440` splash to `1280×800` studio.
- [ ] Minimizing hides cleanly to Windows System Tray with live server status & 1-click portal open in browser.
- [ ] IPC bridge cleanly gates `server:start` on verified license state and persists Dark/Light theme choice.

**Verification:**
- [ ] Build succeeds: `cd desktop && npm run build`
- [ ] Manual check: Launch Electron dev shell and verify splash-to-studio resize, Dark/Light theme sync, tray minimize/restore, and Waitress lifecycle.

**Dependencies:** Task 2.4

**Files likely touched:**
- `desktop/package.json`
- `desktop/src/main/index.ts`
- `desktop/src/main/tray.ts`
- `desktop/src/preload/index.ts`

**Estimated scope:** Medium (4 files)

---

### Task 2.6: Wire Dual-Theme Renderer UI to Real Local Engine, HWID Activation & WAL Hot Backup
**Description:** Port the validated Stage 1 v2.1 Dark/Light UI (`Obsidian Studio` & `Daylight Ceramic`, self-hosted `Onest` + `JetBrains Mono` + `CogniTaraType`, story onboarding, flattened Command Center with `Ctrl+K` palette) into `desktop/src/renderer/` wired via `window.cognitaraDesktop` IPC to real Waitress start/stop, `.cgnlic` file import, online `cognitara.net` activation/heartbeat, live `exam.db` hot backups, and real lockout states (States 4 & 5).

**Acceptance criteria:**
- [ ] Real Waitress server binds LAN `0.0.0.0:5000` and opens working `/login`, `/dashboard`, `/teacher`, `/admin` URLs and theme-adaptive LAN QR.
- [ ] `"Create Instant Hot Backup"` invokes SQLite online backup API (`sqlite3.backup`) cleanly during live connections; live Dark/Light theme switch works seamlessly.
- [ ] Clock-tamper or HQ revocation immediately switches renderer to State 4 or State 5 lockout; `impeccable.cmd detect --json` returns 0 findings on renderer assets.

**Verification:**
- [ ] Build & Audit succeed: `cd desktop && npm run build && ..\..\\.agent\skills\impeccable\scripts\impeccable.cmd detect --json src/renderer/`
- [ ] Manual check: Activate test `.cgnlic`, start server, toggle Dark/Light theme, access `/login` from LAN URL, create hot backup, verify backup `PRAGMA integrity_check == ok`.

**Dependencies:** Task 2.5

**Files likely touched:**
- `desktop/src/renderer/index.html`
- `desktop/src/renderer/app.js`
- `desktop/src/renderer/styles.css`

**Estimated scope:** Medium (3 files)

---

### Task 2.7: Package PyArmor-Obfuscated Engine (`PyInstaller 6.20`) & Windows Desktop Installer
**Description:** Build `desktop/build_engine.py` to obfuscate security modules with `PyArmor 9.2.4` (splitting modules cleanly if trial size limits apply or using licensed PyArmor), bundle `wsgi.py` + `templates/` + `static/` via `PyInstaller 6.20.0`, and package the Windows Electron app (`electron-builder`).

**Acceptance criteria:**
- [ ] `cognitara-engine.exe` starts Waitress offline in a clean folder without requiring system Python installed.
- [ ] Frozen build strips test-only license bypass environment flags (`getattr(sys, 'frozen', False)`).
- [ ] Packaged Electron Windows app launches, passes cold-boot to Server Live, and shuts down cleanly without orphaned Python processes.

**Verification:**
- [ ] Build succeeds: `python desktop/build_engine.py && cd desktop && npm run dist:win`
- [ ] Manual check: Run packaged `.exe` in isolated directory, verify `http://127.0.0.1:5000/health` returns 200 and quitting terminates `cognitara-engine.exe`.

**Dependencies:** Task 2.6

**Files likely touched:**
- `desktop/build_engine.py`
- `desktop/cognitara-engine.spec`
- `desktop/electron-builder.yml`

**Estimated scope:** Medium (3 files)

---

## Checkpoint: Stage 2 Complete
- [ ] Windows desktop `.exe` & installer verified end-to-end with 5-layer license vault and zero terminal windows
- [ ] `python scripts/validate_architecture.py` and `pytest tests/` pass

---

## Stage 3: Academic Portal UI/UX Overhaul (Design Preview -> Gate #2 -> Full Build)

### Task 3.1: Create Daylight Academic Stylesheet & Stage 3 Design Preview Showcase
**Description:** Create `static/css/cognitara-academic.css` built on Tier B Daylight Academic tokens (`cognitara-tokens.css`) and assemble an isolated interactive Design Preview showcase (`/preview/academic` or static/template preview) covering Student Dashboard, Exam Engine + Docked Calc v2, Teacher Formula Studio v2, and Admin Dashboard.

**Acceptance criteria:**
- [ ] Eliminates rainbow/purple gradients and decorative floating icons in favor of `#F8FAFC` / `#FFFFFF` / `#0066FF` / `#0A0E1A` Tier B clarity.
- [ ] Loads 100% offline using local `Instrument Sans`, `CogniTaraType`, FontAwesome, and KaTeX assets.
- [ ] Design Preview clearly demonstrates Docked Calculator v2 non-occlusion and Formula Studio v2 preview.

**Verification:**
- [ ] Manual check: Capture Playwright screenshots of all 4 Design Preview views at `1440×900` and `390×844` with zero console/CDN errors.

**Dependencies:** Stage 2 Checkpoint

**Files likely touched:**
- `static/css/cognitara-academic.css`
- `cognitara/routes/preview.py`
- `templates/preview/academic_design_preview.html`

**Estimated scope:** Medium (3 files)

---

## USER APPROVAL GATE #2 (Mandatory Stop Inside Stage 3)
- [ ] **GATE #2:** Present Stage 3 Daylight Academic Design Preview screenshots/URL to the user. **HALT mass template rollout until user explicitly approves the Design Preview.**

---

### Task 3.2: Build Non-Occluding Dockable/Floating Scientific Calculator v2 (`cognitara-calc-v2.js`)
**Description:** Upgrade `static/js/cognitara-calc.js` into `static/js/cognitara-calc-v2.js` adding a CSS Grid **Docked Right Split-Pane** mode (`1fr 340px`, zero overlap with exam questions/radios) alongside **Edge-Snapping Floating Compact** mode, 8-item history tape, DEG/RAD indicator, and full keyboard/AST compatibility with `/api/calculate`.

**Acceptance criteria:**
- [ ] Docked mode reflows exam workspace horizontally so 0px of question text or answer choices is covered.
- [ ] Floating mode clamps within viewport bounds and preserves existing `SafeMathEvaluator` / Shunting-Yard scientific functions (`sin`, `cos`, `tan`, `sqrt`, `cbrt`, `π`, `e`, `log`, `ln`).
- [ ] Responsive fallback docks smoothly below/sheet on mobile screens (`< 900px`).

**Verification:**
- [ ] Tests pass: `pytest tests/test_phase4_6_master.py -k "calculator or math"`
- [ ] Manual check: Playwright bounding-box check confirms calculator rect does not intersect active question card rect in Docked mode.

**Dependencies:** Gate #2 Approval

**Files likely touched:**
- `static/js/cognitara-calc-v2.js`
- `static/css/cognitara-academic.css`
- `tests/test_ui_v2_components.py`

**Estimated scope:** Medium (3 files)

---

### Task 3.3: Build Visual Math & Chemistry Formula Studio v2 (`cognitara-formula-studio-v2.js`)
**Description:** Upgrade `static/js/cognitara-katex-editor.js` into `static/js/cognitara-formula-studio-v2.js` with offline `KaTeX` + `mhchem` live WYSIWYG formula pills, structured builders (Fractions, Roots, Powers, Greek/Calculus, Matrices, Balanced Chemical Reactions `\ce{...}`), and keyboard shortcuts (`Ctrl+M`, `Ctrl+Shift+C`).

**Acceptance criteria:**
- [ ] Renders Fractions, Roots, Integrals, and `\ce{...}` chemistry reactions offline via `static/vendor/katex/contrib/mhchem.min.js`.
- [ ] Inserts clean serialized LaTeX markers compatible with existing `questions` / `ce_questions` storage and student rendering.
- [ ] Zero raw unparsed LaTeX leakage inside question/option preview boxes.

**Verification:**
- [ ] Tests pass: `pytest tests/test_ui_v2_components.py -k "formula or katex"`
- [ ] Manual check: Playwright verifies `\frac{3}{4}` and `\ce{H2SO4 + 2NaOH -> Na2SO4 + 2H2O}` render `.katex` DOM nodes cleanly inside editor and student exam view.

**Dependencies:** Gate #2 Approval

**Files likely touched:**
- `static/js/cognitara-formula-studio-v2.js`
- `static/css/cognitara-academic.css`
- `tests/test_ui_v2_components.py`

**Estimated scope:** Medium (3 files)

---

### Task 3.4: Overhaul Student Dashboard & Distraction-Free Regular Exam Engine
**Description:** Apply Tier B Daylight Academic styling and integrate `cognitara-calc-v2.js` + offline `Instrument Sans` / `KaTeX` into `dashboard.html`, `exam_start.html`, `exam_page.html`, `exam_paused.html`, and `result.html`, keeping every form name, CSRF meta, heartbeat, single-answer UPSERT, and violation lock intact.

**Acceptance criteria:**
- [ ] Distraction-free exam reading column (`max-width: 780px`), 64px top bar, and question navigator palette work identically with existing `exam_regular` endpoints.
- [ ] Docked Calculator v2 opens beside question column without occluding options or navigator.
- [ ] `test_submit_button_has_no_decorative_check_circle` and `test_browser_phase4_3.py` continue to pass.

**Verification:**
- [ ] Tests pass: `pytest tests/test_phase4_6_master.py tests/test_browser_phase4_3.py`

**Dependencies:** Task 3.2, Task 3.3

**Files likely touched:**
- `templates/dashboard.html`
- `templates/exam_start.html`
- `templates/exam_page.html`
- `templates/exam_paused.html`
- `templates/result.html`

**Estimated scope:** Medium (5 files)

---

### Task 3.5: Overhaul Common Entrance Candidate Portal & CE Exam Engine
**Description:** Apply Tier B Daylight Academic design, Distraction-Free layout, and Calculator v2 to Common Entrance candidate templates (`ce_login.html`, `ce_dashboard.html`, `ce_exam_page.html`, `ce_submitted.html`, `ce_resume_blocked.html`) preserving strict CE engine isolation.

**Acceptance criteria:**
- [ ] CE candidate login, dashboard, active exam (`ce_exam_page.html`), and post-submission status match Tier B Daylight Academic hierarchy with zero cross-engine coupling.
- [ ] Single-answer UPSERT (`ce_save_single_answer`), `ce_heartbeat`, and `ce_log_warning` remain 100% functional.

**Verification:**
- [ ] Tests pass: `pytest tests/test_modular_architecture_and_persistence.py tests/test_security_audit_phase4_4.py`

**Dependencies:** Task 3.2, Task 3.3

**Files likely touched:**
- `templates/ce_login.html`
- `templates/ce_dashboard.html`
- `templates/ce_exam_page.html`
- `templates/ce_submitted.html`
- `templates/ce_resume_blocked.html`

**Estimated scope:** Medium (5 files)

---

### Task 3.6: Overhaul Teacher Dashboard & Exam/Question Authoring Portals
**Description:** Redesign `teacher_dashboard.html`, `teacher_create_exam.html`, `teacher_edit_exam.html`, `exam_questions.html`, and `ce_questions.html` (plus authoring partials/pages in a follow-on micro-check if needed) with Daylight Academic tokens and Formula Studio v2 integration.

**Acceptance criteria:**
- [ ] Teacher dashboard, exam creation, Form Tutor progression links, and live monitoring adopt Tier B styling with zero floating decorative `.edu-icon` clutter.
- [ ] Formula Studio v2 works inside question & option editors in both Regular and CE authoring flows.

**Verification:**
- [ ] Tests pass: `pytest tests/test_modular_architecture_and_persistence.py tests/test_phase4_6_master.py`
- [ ] Manual check: Verify `scripts/test_teacher_create_exam.py` or Playwright teacher authoring test passes.

**Dependencies:** Task 3.3

**Files likely touched:**
- `templates/teacher_dashboard.html`
- `templates/teacher_create_exam.html`
- `templates/teacher_edit_exam.html`
- `templates/exam_questions.html`
- `templates/ce_questions.html`

**Estimated scope:** Medium (5 files)

---

### Task 3.7: Overhaul School Admin, Auth & Remaining Academic/CE Sub-Templates
**Description:** Complete the Daylight Academic token rollout across `login.html`, `start.html` (removing online Google Fonts `@import`), `admin.html`, `admin_school_settings.html`, and `admin_common_entrance.html` + secondary admin/teacher/CE modals to guarantee visual consistency across all 73 templates.

**Acceptance criteria:**
- [ ] Zero online font/CDN `@import` tags remain in `start.html` or any portal template.
- [ ] School Admin (`admin.html`, `admin_school_settings.html`) and CE Admin (`admin_common_entrance.html`) replace legacy violet/pink gradients with unified Tier B Cobalt/Slate styling while preserving all AJAX actions.
- [ ] All 201 baseline routes and 40+ tests pass after full rollout.

**Verification:**
- [ ] Tests pass: `python scripts/validate_architecture.py && pytest tests/`

**Dependencies:** Task 3.4, Task 3.5, Task 3.6

**Files likely touched:**
- `templates/start.html`
- `templates/login.html`
- `templates/admin.html`
- `templates/admin_school_settings.html`
- `templates/admin_common_entrance.html`
*(Secondary sub-templates updated systematically in clean sub-commits of <= 5 files before Stage 3 Checkpoint)*

**Estimated scope:** Medium (5 files per batch)

---

## Checkpoint: Stage 3 Complete
- [ ] All 201 baseline routes pass parity check; Playwright E2E confirms zero external requests, zero Calculator occlusion, and KaTeX/`mhchem` rendering across all portals

---

## Stage 4: `cognitara.net` Cloud Platform (Next.js + Neon Postgres + Paystack + HQ Admin)

### Task 4.1: Initialize Next.js Cloud App & Apply Neon Postgres 12-Table Migration
**Description:** Scaffold `cloud/` (Next.js App Router, TypeScript, CSS Modules with CogniTara Tier A tokens - zero Tailwind v3), configure `@neondatabase/serverless`, and apply the 12-table SQL DDL (`users_hq`, `schools`, `plans`, `subscriptions_payments`, `licenses`, `license_activations`, `license_heartbeats`, `referrals`, `referral_conversions`, `wallet_ledger`, `payout_requests`, `school_bans_audit`) plus plan seed data.

**Acceptance criteria:**
- [ ] `cloud/db/schema.sql` (or Drizzle migrations) creates all 12 tables, constraints, and indexes cleanly on Neon Postgres.
- [ ] `plans` seeds `monthly`, `annual`, and `lifetime` SKUs with NGN kobo and USD cents pricing.
- [ ] Next.js app builds with zero TypeScript errors and zero Tailwind dependencies.

**Verification:**
- [ ] Build succeeds: `cd cloud && npm run build`
- [ ] Manual check: Inspect applied Neon schema tables (`\dt` or information_schema query returns all 12 tables).

**Dependencies:** Stage 3 Checkpoint (or parallelizable after Gate #1 if desired)

**Files likely touched:**
- `cloud/package.json`
- `cloud/src/styles/tokens.css`
- `cloud/src/db/client.ts`
- `cloud/src/db/schema.sql`
- `cloud/src/db/seed.ts`

**Estimated scope:** Medium (5 files)

---

### Task 4.2: Implement Cloud Auth & Ed25519 License Signing Authority
**Description:** Implement `users_hq` authentication (Argon2id hashing + signed HttpOnly session cookies + role guards for `school_owner`, `affiliate`, `hq_super_admin`) and `cloud/src/lib/crypto/ed25519.ts` for signing canonical `.cgnlic` leases and `RevocationTombstone` objects.

**Acceptance criteria:**
- [ ] Auth endpoints (`register`, `login`, `logout`, `me`) use Argon2id and fail closed on invalid credentials.
- [ ] Ed25519 signer outputs canonical JSON payloads whose signatures verify bit-for-bit in Python `cryptography 48.0.0` (`license_guard.py`).

**Verification:**
- [ ] Tests pass: Cross-language Node->Python Ed25519 signature verification script exits 0.

**Dependencies:** Task 4.1

**Files likely touched:**
- `cloud/src/lib/auth.ts`
- `cloud/src/lib/crypto/ed25519.ts`
- `cloud/src/app/api/v1/auth/login/route.ts`
- `cloud/src/app/api/v1/auth/register/route.ts`

**Estimated scope:** Medium (4 files)

---

### Task 4.3: Implement Paystack Checkout & Idempotent HMAC-SHA512 Webhook Processor
**Description:** Build `POST /api/v1/checkout/initialize` (Monthly / Annual / Lifetime in NGN or USD, capturing optional `?ref=CODE`) and `POST /api/v1/webhooks/paystack` verifying `x-paystack-signature` via `HMAC-SHA512` + `timingSafeEqual`, recording `subscriptions_payments`, and issuing/extending Ed25519 `licenses`.

**Acceptance criteria:**
- [ ] Rejects missing or invalid `x-paystack-signature` with HTTP `401`.
- [ ] Duplicate Paystack `webhook_event_id` or `paystack_reference` is idempotent (issues exactly one license / renewal).
- [ ] Successful payment creates/extends `licenses` (`monthly`, `annual`, or `lifetime`) and logs payment atomically.

**Verification:**
- [ ] Tests pass: `cd cloud && npm test -- paystack-webhook`

**Dependencies:** Task 4.2

**Files likely touched:**
- `cloud/src/lib/paystack.ts`
- `cloud/src/app/api/v1/checkout/initialize/route.ts`
- `cloud/src/app/api/v1/checkout/verify/route.ts`
- `cloud/src/app/api/v1/webhooks/paystack/route.ts`

**Estimated scope:** Medium (4 files)

---

### Task 4.4: Implement Dual Referral Engine, Cash Wallet Ledger & Payout Requests
**Description:** Implement referral attribution (`cash_commission`, `bonus_days`, or `dual`), anti-self-referral checks (email, Paystack customer/authorization signature, HWID), immutable `wallet_ledger` credits, bonus days application to `licenses`, and `payout_requests` submission API.

**Acceptance criteria:**
- [ ] Configurable `custom_commission_pct` credits `wallet_ledger` accurately with positive-balance invariant; `bonus_days` extends referrer/referee `licenses.expires_at`.
- [ ] Self-referrals sharing owner user, email, or Paystack card authorization signature are blocked and flagged.
- [ ] Affiliates/school owners can view ledger history and request bank payouts (`payout_requests`).

**Verification:**
- [ ] Tests pass: `cd cloud && npm test -- referrals-wallet`

**Dependencies:** Task 4.3

**Files likely touched:**
- `cloud/src/lib/referrals.ts`
- `cloud/src/app/api/v1/referrals/summary/route.ts`
- `cloud/src/app/api/v1/referrals/payouts/route.ts`

**Estimated scope:** Small (3 files)

---

### Task 4.5: Implement Desktop Activation, Heartbeat & Revocation Tombstone Cloud APIs
**Description:** Build `POST /api/v1/license/activate`, `POST /api/v1/license/heartbeat`, and `GET /api/v1/license/download/[licenseId]` for binding HWID (`license_activations`), recording telemetry (`license_heartbeats`), refreshing offline lease windows, and delivering signed `RevocationTombstone` responses when a school or license is banned.

**Acceptance criteria:**
- [ ] Enforces 1-to-1 active HWID binding (`uq_active_license_hwid`) unless HQ cleared via HWID reset.
- [ ] Returns refreshed Ed25519 lease JSON when bonus days or renewals were applied on `cognitara.net`.
- [ ] Returns signed `RevocationTombstone` immediately if `schools.status == 'banned'` or `licenses.status == 'revoked'`.

**Verification:**
- [ ] Tests pass: `cd cloud && npm test -- license-api`

**Dependencies:** Task 4.2, Task 4.3

**Files likely touched:**
- `cloud/src/app/api/v1/license/activate/route.ts`
- `cloud/src/app/api/v1/license/heartbeat/route.ts`
- `cloud/src/app/api/v1/license/download/[licenseId]/route.ts`

**Estimated scope:** Small (3 files)

---

### Task 4.6: Build `cognitara.net` Landing, Checkout, Customer Vault & Referral Portal Pages
**Description:** Build the public `cognitara.net` Tier A Dark Command marketing/pricing landing page (`Monthly`, `Annual`, `Lifetime`), Paystack checkout flow, Customer License & `.cgnlic` download portal, and Dual Referral dashboard.

**Acceptance criteria:**
- [ ] Uses CogniTara Dark Command tokens, `CogniTaraType` + `Instrument Sans`, and exact Luminary C mark with zero Tailwind v3.
- [ ] Authenticated school owners can purchase/renew plans, download `.cgnlic`, view bound HWID, copy referral link, and request payouts.

**Verification:**
- [ ] Build succeeds: `cd cloud && npm run build`
- [ ] Manual check: Playwright smoke test renders `/`, `/checkout`, `/portal/licenses`, and `/portal/referrals` cleanly at desktop and mobile widths.

**Dependencies:** Task 4.3, Task 4.4, Task 4.5

**Files likely touched:**
- `cloud/src/app/page.tsx`
- `cloud/src/app/checkout/page.tsx`
- `cloud/src/app/portal/licenses/page.tsx`
- `cloud/src/app/portal/referrals/page.tsx`

**Estimated scope:** Medium (4 files)

---

### Task 4.7: Build HQ Super Admin Portal (Telemetry, Tombstone Bans, HWID Reset & Payouts)
**Description:** Implement `/hq` Super Admin pages and API routes for inspecting registered schools, live `license_heartbeats` telemetry, issuing signed `RevocationTombstone` bans (`school_bans_audit`), resetting HWID locks, adjusting referral rates/bonus days, and approving/rejecting `payout_requests`.

**Acceptance criteria:**
- [ ] Strictly guarded by `role === 'hq_super_admin'` (returns 401/403 to standard school owners/affiliates).
- [ ] Banning a school atomically generates and stores a signed `RevocationTombstone`, logs `school_bans_audit`, and causes next Desktop heartbeat to lock locally.
- [ ] HQ can reset HWID binding, grant manual bonus days, and settle/reject `payout_requests`.

**Verification:**
- [ ] Tests pass: `cd cloud && npm test -- hq-admin`
- [ ] Build succeeds: `cd cloud && npm run build`

**Dependencies:** Task 4.5, Task 4.6

**Files likely touched:**
- `cloud/src/app/hq/page.tsx`
- `cloud/src/app/api/v1/hq/schools/[id]/ban/route.ts`
- `cloud/src/app/api/v1/hq/schools/[id]/reset-hwid/route.ts`
- `cloud/src/app/api/v1/hq/payouts/[id]/route.ts`

**Estimated scope:** Medium (4 files)

---

## Checkpoint: Stage 4 Complete
- [ ] `cognitara.net` Next.js build passes; Neon 12-table workflows, Paystack webhook, dual referrals, and HQ tombstone issuance verified

---

## Stage 5: Full-Stack Security, Anti-Tamper & 201-Route Regression Verification

### Task 5.1: Verify 5-Layer Windows Anti-Clock-Tamper, DPAPI & 15-Min Exam Drain Suite
**Description:** Run comprehensive adversarial tests against `license_guard.py` and `vault_store.py` simulating Ed25519 byte tampering, HWID spoofing, clock rollback (`-301s`, `-7 days`), Registry/`vault.bin` deletion attacks, 15-minute mid-exam drain, and signed HQ tombstone enforcement.

**Acceptance criteria:**
- [ ] 100% of tamper scenarios trip `CLOCK_TAMPER_LOCK`, `HWID_MISMATCH_LOCK`, or `HQ_REVOKED_LOCK` fail-closed.
- [ ] Active `in_progress` exams in `scores` and `ce_attempts` complete cleanly during the `900s` drain window before full lockout.

**Verification:**
- [ ] Tests pass: `pytest tests/test_license_vault.py -v`

**Dependencies:** Stage 2 & Stage 4 Checkpoints

**Files likely touched:**
- `tests/test_license_vault.py`
- `tests/test_license_integration_e2e.py`

**Estimated scope:** Small (2 files)

---

### Task 5.2: Verify `cognitara.net` Security, Paystack Webhook Replay & Dual Referral Integrity
**Description:** Execute automated API security verification across `cognitara.net`: malformed Paystack signatures, replay attacks, race conditions on concurrent webhook calls, self-referral blocking, and unauthorized HQ endpoint access.

**Acceptance criteria:**
- [ ] Zero double-credits under concurrent duplicate Paystack webhook delivery.
- [ ] Zero unauthorized access to `/api/v1/hq/*` endpoints by non-HQ sessions.

**Verification:**
- [ ] Tests pass: `cd cloud && npm test`

**Dependencies:** Task 4.7

**Files likely touched:**
- `cloud/tests/security.test.ts`
- `cloud/tests/webhook-idempotency.test.ts`

**Estimated scope:** Small (2 files)

---

### Task 5.3: Run Full Portal 201-Route Parity, SQLite WAL Load & Browser E2E Verification
**Description:** Execute the full regression matrix across the refactored CogniTara portal: `validate_architecture.py`, all 40+ pytest tests (including 50-station concurrency and disaster recovery), plus Playwright E2E checks across Student, Regular/CE Exam + Calculator v2, Teacher + Formula Studio v2, and Admin portals.

**Acceptance criteria:**
- [ ] `scripts/validate_architecture.py` confirms 100% parity across 201 baseline routes and `PRAGMA integrity_check == ok`.
- [ ] Entire `pytest tests/` suite passes with 0 failures and 0 skipped security assertions.
- [ ] Playwright confirms zero console errors, zero external CDN requests, non-occluding Calculator v2, and KaTeX/`mhchem` rendering.

**Verification:**
- [ ] Tests pass: `python scripts/validate_architecture.py && pytest tests/ -v`

**Dependencies:** Stage 3 Checkpoint, Task 5.1, Task 5.2

**Files likely touched:**
- `tests/test_ui_v2_components.py`
- `tests/test_e2e_v2_regression.py`

**Estimated scope:** Small (2 files)

---

## Checkpoint: Stage 5 Complete
- [ ] All security, anti-tamper, cloud, concurrency, and 201-route regression gates pass cleanly

---

## Stage 6: CogniTara v2 Launch Advert in Motion Graphics (`cognitara-v2-launch`)

### Task 6.1: Initialize `cognitara-motion-studio/` Validators & Authentic Media Asset Pack
**Description:** Create `cognitara-motion-studio/tools/` quality-gate validators (`brand_asset_checker.py`, `media_manifest_validator.py`, `subtitle_timeline_checker.py`, `video_metadata_checker.py`, `production_quality_report.py`) and assemble `cognitara-motion-studio/projects/cognitara-v2-launch/assets/` with genuine vector exports from `CogniTara-Brand-Identity/`, `static/fonts/CogniTaraType-*.ttf`, verified school photography, and live Playwright captures of Stages 2-4 UIs, documented in `media_manifest.json`.

**Acceptance criteria:**
- [ ] Zero generic AI backgrounds or redrawn logos; every asset in `media_manifest.json` has verified source path/license and Relevance Level 3-5.
- [ ] `brand_asset_checker.py` and `media_manifest_validator.py` pass with exit 0.

**Verification:**
- [ ] Tests pass: `python cognitara-motion-studio/tools/brand_asset_checker.py && python cognitara-motion-studio/tools/media_manifest_validator.py --manifest cognitara-motion-studio/projects/cognitara-v2-launch/assets/media_manifest.json`

**Dependencies:** Stage 5 Checkpoint

**Files likely touched:**
- `cognitara-motion-studio/tools/brand_asset_checker.py`
- `cognitara-motion-studio/tools/media_manifest_validator.py`
- `cognitara-motion-studio/projects/cognitara-v2-launch/assets/media_manifest.json`

**Estimated scope:** Medium (3-5 files)

---

### Task 6.2: Synthesize Neural Voiceover, Extract Word Timestamps & Generate Safe-Corridor ASS Subtitles
**Description:** Write the ~70-word 8-beat script (`script_and_storyboard.json`), synthesize natural voiceover (`edge_tts` / `kokoro_onnx`) to 48kHz `voiceover.wav`, extract millisecond word timestamps (`voiceover_timed.json`), and generate `captions.ass` (`PlayResX: 1080`, `PlayResY: 1920`, `MarginV: 440`, `<= 21 chars/s`, `±2 frames` sync).

**Acceptance criteria:**
- [ ] Word-level timestamps derive directly from actual generated speech audio.
- [ ] `subtitle_timeline_checker.py` passes (`MarginV >= 440`, Y `<= 1480px`, `<= 67ms` drift, `<= 21 cps`).

**Verification:**
- [ ] Tests pass: `python cognitara-motion-studio/tools/subtitle_timeline_checker.py --subtitles cognitara-motion-studio/projects/cognitara-v2-launch/script/captions.ass --timed-words cognitara-motion-studio/projects/cognitara-v2-launch/audio/voiceover_timed.json`

**Dependencies:** Task 6.1

**Files likely touched:**
- `cognitara-motion-studio/tools/subtitle_timeline_checker.py`
- `cognitara-motion-studio/projects/cognitara-v2-launch/script/script_and_storyboard.json`
- `cognitara-motion-studio/projects/cognitara-v2-launch/script/captions.ass`
- `cognitara-motion-studio/projects/cognitara-v2-launch/audio/voiceover_timed.json`

**Estimated scope:** Medium (4 files)

---

### Task 6.3: Build EffectCraft 8-Beat Composition & Render 1080×1920 @ 30fps Video
**Description:** Author `cognitara-motion-studio/projects/cognitara-v2-launch/comp/build_comp.jsx` to build the 36.0s 8-beat composition (`project.ecproj`) with non-linear cubic easing (`75%-85%` influence), continuous `1.02x-1.05x` camera drift, `>= 56pt` `CogniTaraType` kinetic titles, and Beat 8 official Luminary C reveal with `>= 1.5s` resting hold; render `renders/raw_video.mp4` headlessly via `C:\Program Files\EffectCraft\effectcraft-cli.exe`.

**Acceptance criteria:**
- [ ] Native `.ecproj` compiles and renders cleanly via `effectcraft-cli.exe` at `1080×1920`, `30fps`.
- [ ] Every beat implements continuous motion/parallax and >= 7:1 contrast; Beat 8 holds cleanly on the authentic lockup for >= 1.5s.

**Verification:**
- [ ] Build succeeds: `"C:\Program Files\EffectCraft\effectcraft-cli.exe" script cognitara-motion-studio/projects/cognitara-v2-launch/comp/build_comp.jsx` and render to `renders/raw_video.mp4`
- [ ] Manual check: Render sample beat keyframes and inspect at `270×480` mobile preview size.

**Dependencies:** Task 6.2

**Files likely touched:**
- `cognitara-motion-studio/projects/cognitara-v2-launch/comp/build_comp.jsx`
- `cognitara-motion-studio/projects/cognitara-v2-launch/comp/project.ecproj`

**Estimated scope:** Small (2 files)

---

### Task 6.4: Master 4-Stem Audio (EBU R128), Multiplex Final MP4 & Pass 6-Axis Quality Gate
**Description:** Mix 4-stem audio (`voiceover.wav`, ambient synth bed, risers/impacts, UI clicks with `-3.5 dB` side-chain ducking) mastered via FFmpeg `loudnorm`/`ebur128` to `-14.0`-`-16.0 LUFS` and `<= -1.0 dBTP`, burn/multiplex `captions.ass` + `+faststart` into `renders/master_production.mp4`, generate social publishing copy, and pass `production_quality_report.py`.

**Acceptance criteria:**
- [ ] `ffmpeg -af ebur128` confirms integrated loudness `-14.0` to `-16.0 LUFS` and True-Peak `<= -1.0 dBTP`.
- [ ] `video_metadata_checker.py` confirms `1080×1920`, `30fps`, `yuv420p`, `+faststart`, zero black/frozen dead frames.
- [ ] `production_quality_report.py` passes all 6 axes with exit 0 and generates `publishing/publishing_package.json`.

**Verification:**
- [ ] Tests pass: `python cognitara-motion-studio/tools/video_metadata_checker.py --video cognitara-motion-studio/projects/cognitara-v2-launch/renders/master_production.mp4 && python cognitara-motion-studio/tools/production_quality_report.py --project cognitara-motion-studio/projects/cognitara-v2-launch`

**Dependencies:** Task 6.3

**Files likely touched:**
- `cognitara-motion-studio/tools/video_metadata_checker.py`
- `cognitara-motion-studio/tools/production_quality_report.py`
- `cognitara-motion-studio/projects/cognitara-v2-launch/publishing/publishing_package.json`
- `cognitara-motion-studio/projects/cognitara-v2-launch/quality_report.json`

**Estimated scope:** Medium (4 files)

---

## Checkpoint: Stage 6 & CogniTara v2 Release Complete
- [ ] `renders/master_production.mp4` passes 6-axis QC audit and mobile `270×480` visual inspection
- [ ] Final CogniTara v2 ecosystem verified end-to-end
