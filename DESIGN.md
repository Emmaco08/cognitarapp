---
name: CogniTara v2 Design System
description: Dual-theme precision examination console and academic portal visual system built around Obsidian Studio dark mode, Daylight Ceramic light mode, Onest UI typography, CogniTaraType brand lockups, and exponential deceleration motion.
colors:
  dark-backdrop: "#05070C"
  dark-window: "#0B0E15"
  dark-titlebar: "#080B11"
  dark-rail: "#090C13"
  dark-canvas: "#0D121B"
  dark-surface: "#121825"
  dark-surface-raised: "#161E2E"
  dark-surface-hover: "#1A2437"
  dark-well: "#080B11"
  dark-ink: "#F8FAFC"
  dark-ink-secondary: "#A5B5CC"
  dark-ink-muted: "#7F92AD"
  dark-line: "rgba(148, 163, 184, 0.11)"
  dark-line-strong: "rgba(148, 163, 184, 0.22)"
  dark-accent: "#00D2FF"
  dark-accent-hover: "#33DCFF"
  dark-accent-strong: "#0066FF"
  dark-accent-ink: "#041019"
  dark-accent-soft: "rgba(0, 210, 255, 0.11)"
  dark-void: "#060913"
  dark-navy: "#0A0E1A"
  light-backdrop: "#DCE4F0"
  light-window: "#F6F8FC"
  light-titlebar: "#EEF2F8"
  light-rail: "#F1F5FA"
  light-canvas: "#FFFFFF"
  light-surface: "#F8FAFC"
  light-surface-hover: "#ECF2FA"
  light-well: "#EDF2F8"
  light-ink: "#0A0E1A"
  light-ink-secondary: "#334155"
  light-ink-muted: "#516278"
  light-line: "rgba(15, 23, 42, 0.085)"
  light-line-strong: "rgba(15, 23, 42, 0.16)"
  light-accent: "#0066FF"
  light-accent-strong: "#0052CC"
  light-accent-ink: "#FFFFFF"
  light-accent-soft: "rgba(0, 102, 255, 0.08)"
  light-star-cyan: "#00B4E5"
  light-border: "#E2E8F0"
  status-ok-dark: "#10B981"
  status-warn-dark: "#F59E0B"
  status-danger-dark: "#F87171"
  status-ok-light: "#047857"
  status-warn-light: "#B45309"
  status-danger-light: "#B91C1C"
  status-danger-solid: "#DC2626"
typography:
  display:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title-lg:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body-lg:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0em"
  body:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  label:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0em"
  caption:
    fontFamily: "Onest, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0.01em"
  mono:
    fontFamily: "\"JetBrains Mono\", ui-monospace, Cascadia Code, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0em"
rounded:
  none: "0px"
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "14px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  base: "16px"
  lg: "20px"
  xl: "24px"
  2xl: "32px"
  3xl: "40px"
  4xl: "48px"
  5xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.light-accent}"
    textColor: "{colors.light-accent-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "38px"
  button-primary-hover:
    backgroundColor: "{colors.light-accent-strong}"
    textColor: "{colors.light-accent-ink}"
  button-secondary:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "38px"
  input-field:
    backgroundColor: "{colors.dark-well}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
    height: "40px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.dark-ink-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "36px"
  nav-item-active:
    backgroundColor: "{colors.dark-accent-soft}"
    textColor: "{colors.dark-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    height: "36px"
  status-chip:
    backgroundColor: "{colors.dark-accent-soft}"
    textColor: "{colors.dark-accent}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  well-panel:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: CogniTara v2

## Overview

**Creative North Star: "The Precision Examination Console"**

CogniTara v2 is engineered like a precision instrument built for high-stakes academic evaluation rather than a generic cloud dashboard. Every surface commits cleanly to one of two calibrated worlds: **Obsidian Studio** for dark-room server orchestration, hardware security vaults, and `cognitara.net` infrastructure, and **Daylight Ceramic** for glare-free classroom assessment, exam authoring, and daylight server monitoring. Both modes share the same disciplined Cobalt and Electric Cyan optical lineage rooted in the Luminary C and Tara Guiding Star emblem.

Visual restraint is functional, not minimal for its own sake. Structural hierarchy relies on `1px` hairlines, deliberate tonal wells, clear typographic scale, and smooth exponential deceleration motion (`cubic-bezier(0.16, 1, 0.3, 1)`), eliminating decorative card stacking, unbranded rainbow gradients, and kinetic gimmicks so administrators and students read state effortlessly under pressure.

**Key Characteristics:**
- **Dual-Theme Parity:** Seamless live switching between Obsidian Studio (`[data-theme="dark"]`) and Daylight Ceramic (`[data-theme="light"]`) with hue-tinted neutrals that hold WCAG AA contrast in both modes.
- **Flat-By-Default Architectural Panes:** Split stages, structural `1px` rules, and crisp tonal wells replace nested cards inside cards.
- **Self-Hosted Offline Typography:** `Onest` for clean interface legibility, `JetBrains Mono` with tabular numerals for timers, LAN URLs, and cryptographic hashes, and `CogniTaraType` strictly scoped to the `CogniTara` brand lockup.
- **Physical Deceleration Motion:** Choreographed optical reveals and state transitions settle smoothly with exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`), never rubbery bounce or overshoot curves.

## Colors

The palette anchors every screen in deep slate-navy or crisp ceramic-white neutrals, reserving Cobalt and Electric Cyan strictly for primary actions, live active states, and the Tara Guiding Star focal mark.

### Primary
- **Electric Cyan Accent** (`dark-accent`): Guides attention on dark surfaces, used for the Tara Star beacon, active LAN engine ring, focused selection borders, and primary Dark Mode highlights.
- **Cobalt Blue Primary** (`light-accent` / `dark-accent-strong`): Anchors primary buttons, active Light Mode controls, exam question indicators, and interactive progress filaments.

### Secondary
- **Deep Cobalt Pressed** (`light-accent-strong`): Provides tactile hover and active contrast shift on Light Mode primary controls while maintaining crisp white legibility.
- **Daylight Star Cyan** (`light-star-cyan`): Calibrated cyan shift preserving Luminary C Tara Star contrast against ceramic white backgrounds.

### Neutral
- **Obsidian Canvas & Structural Neutrals** (`dark-backdrop`, `dark-window`, `dark-rail`, `dark-canvas`, `dark-surface`, `dark-well`): Stepped midnight-slate surfaces separating window chrome, navigation rails, main canvases, and recessed data wells without heavy shadows.
- **Obsidian Hue-Tinted Inks** (`dark-ink`, `dark-ink-secondary`, `dark-ink-muted`, `dark-line`): Cool slate-tinted whites and muted slate neutrals tuned to maintain `>= 4.6:1` secondary legibility on dark canvases.
- **Daylight Ceramic Canvas & Inks** (`light-backdrop`, `light-window`, `light-rail`, `light-surface`, `light-well`, `light-ink`, `light-ink-secondary`, `light-ink-muted`, `light-line`): Crisp off-white reading surfaces paired with deep midnight ink (`#0A0E1A`) and slate dividers for prolonged classroom reading.

### Named Rules
**The Accent Discipline Rule.** Cobalt Blue and Electric Cyan occupy at most ten percent of any viewport; structural surfaces remain calm slate or ceramic white so active telemetry and primary actions stand out immediately.
**The Hue-Tinted Ink Rule.** Secondary and muted text on dark surfaces always carries cool slate undertone (`dark-ink-secondary` and `dark-ink-muted`) rather than flat pure gray so contrast never washes out.
**The Semantic-Only Status Rule.** Emerald (`status-ok-*`), amber (`status-warn-*`), and crimson (`status-danger-*`) appear exclusively on live engine health badges, clock-tamper alerts, warning counters, and revocation lockouts, never as decorative section accents.

## Typography

**Display Font:** `Onest` (weights `600` and `700`, self-hosted offline `.woff2`) for interface headlines, view titles, and modal headers; **`CogniTaraType`** (weights `400` and `700`, self-hosted) reserved strictly for the `CogniTara` brand wordmark.
**Body Font:** `Onest` (weights `400` and `500`, self-hosted offline `.woff2`) across navigation, onboarding narratives, exam questions, tables, and controls.
**Label/Mono Font:** `JetBrains Mono` (weights `400`, `500`, `600`, self-hosted `.woff2`) with `font-variant-numeric: tabular-nums` for countdown clocks, HWID hashes, license keys, IP endpoints, and server logs.

**Character:** Clean geometric humanist clarity (`Onest`) grounded by technical monospace precision (`JetBrains Mono`), while keeping the custom `45°`-chamfered `CogniTaraType` exclusively on the `CogniTara` wordmark where every glyph was purpose-built.

### Hierarchy
- **Brand Wordmark** (700, `1.75rem`, `1.15` line-height, `-0.02em` tracking): Exclusively renders the string `CogniTara` in `CogniTaraType` beside the Luminary C emblem.
- **Display** (700, `2.25rem`, `1.15` line-height, `-0.025em` tracking): Splash/onboarding hero statements and critical lockout titles, balanced cleanly across short lines.
- **Title Large** (600, `1.75rem`, `1.2` line-height, `-0.02em` tracking): Primary workspace view titles and major modal headings.
- **Headline** (600, `1.375rem`, `1.25` line-height, `-0.015em` tracking): Section headers inside split onboarding stages and Command Center panels.
- **Title** (600, `1.125rem`, `1.35` line-height, `-0.01em` tracking): Panel titles, exam card titles, and vault headers.
- **Body Large** (400, `1rem`, `1.6` line-height): Exam question passages and onboarding narrative paragraphs constrained to `65ch-75ch`.
- **Body** (400, `0.875rem`, `1.5` line-height): Default table rows, forms, and descriptive UI copy (`>= 14px` body floor).
- **Label & Caption** (500, `0.8125rem` / `0.75rem`, `1.35` line-height): Navigation links, metadata rows, and pill badges (`>= 12px` functional UI floor; zero sub-`11px` interactive labels).
- **Monospace Data** (500, `0.8125rem`, `1.45` line-height): Tabular timers, license keys, port numbers, and live console streams.

### Named Rules
**The Wordmark Isolation Rule.** `CogniTaraType` renders only the brand name `CogniTara`; interface headings and subtitles always use `Onest` so non-wordmark glyphs remain undistorted.
**The Heading-Free-of-Eyebrows Rule.** Headings stand on their own weight and size without tracked-out uppercase eyebrow labels or decorative section numbers stacked above them.

## Layout

Desktop Server Studio frames itself as a `1280×800` frameless Windows desktop shell (or `720×440` sculpted splash window during State 1 boot, expanding smoothly into the full workspace) with a Full Viewport toggle and clean responsive adaptation below `1024px`. Operating views organize into a `228px` fixed navigation rail, a `50px` custom window titlebar, and an asymmetric split canvas (`1.45fr` operational lanes / `1fr` reference & health ledger, or `42%` narrative / `58%` interactive stage in onboarding) built on a `4px` spacing rhythm with generous section separation and tight intra-group spacing.

During active student examinations in Daylight Ceramic portals, the exam reading column caps at `780px` (`65ch-75ch` measure) and reserves a dedicated `340px` docked split-pane column when Scientific Calculator v2 opens so question text and answer controls never shift under overlapping modals.

## Elevation & Depth

Surfaces are **flat by default**. Depth comes primarily from stepped surface contrast (`dark-backdrop` -> `dark-window` -> `dark-canvas` -> `dark-surface`) and crisp `1px` structural hairlines (`dark-line` / `light-line`), with neutral multi-layered elevation shadows reserved exclusively for floating window chrome, the system tray popover, command palette overlays, and dragged floating tools. Zero colored neon glow halos, radial spotlight clouds, or linear-gradient grid textures appear behind content.

### Shadow Vocabulary
- **Floating Desktop Shell (`box-shadow: 0 28px 70px -16px rgba(2, 6, 17, 0.72), 0 0 0 1px rgba(148, 163, 184, 0.14)` on Dark; `0 24px 60px -16px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(15, 23, 42, 0.08)` on Light):** Anchors the frameless Windows 11 window above the ambient studio backdrop.
- **Transient Popover / Command Palette (`box-shadow: 0 16px 36px -10px rgba(2, 6, 17, 0.55)`):** Elevates only transient system-tray, drawer, and `Ctrl+K` overlays.

### Named Rules
**The Flat-By-Default Rule.** Static panels, exam cards, and telemetry rows carry zero drop shadows at rest and never nest rounded cards inside other bordered cards.
**The Exponential Deceleration Rule.** All UI transitions and boot choreography use `cubic-bezier(0.16, 1, 0.3, 1)` or `cubic-bezier(0.25, 1, 0.5, 1)` from already-visible defaults; bounce and spring overshoot curves are prohibited.

## Shapes

Corners follow a restrained precision scale: sharp `6px` (`rounded.sm`) for buttons, inputs, nav items, and table rows; `10px` (`rounded.md`) for split panels, wells, and miniature preview stages; `14px` (`rounded.lg`) strictly for the outer frameless desktop window and large modal sheets; and `9999px` (`rounded.pill`) strictly for status chips and segmented switches. Zero thick colored `border-left` or `border-right` accent bars appear on rounded cards.

## Components

Every interactive component shares crisp `1px` edge definition, clear `:hover` and `:focus-visible` states (`2px` offset focus ring in the active theme accent), and authentic single-weight SVG iconography paired with `tabular-nums` data cells.

### Buttons
- **Shape:** Subtle precision corners (`6px` radius).
- **Primary:** Solid Cobalt (`light-accent` on light, `dark-accent-strong` / high-contrast `dark-accent` with `#041019` ink on dark), `10px 16px` padding, `38px` minimum height, weight `500`-`600`.
- **Hover / Focus:** Smooth `140ms` exponential color step and `-1px` hairline border lift; `:focus-visible` draws a crisp `2px` accent outline with `2px` offset.
- **Secondary / Ghost:** Transparent or `surface` fill with `1px` `line-strong` border and primary ink text; zero `->` arrows appended to button copy.

### Chips
- **Style:** Full pill (`9999px` radius), `4px 10px` padding, `12px` medium typography, tinted soft accent or semantic fill (`10%` opacity) with high-contrast foreground text.
- **State:** Interactive theme/plan segmented pills swap cleanly to filled primary accent or elevated `surface-hover` with `line-strong` edge.

### Cards / Containers
- **Corner Style:** Medium (`10px` radius) for standalone wells; `0px` hairline-divided rows inside split workspaces.
- **Background:** `dark-surface` or `light-surface` set directly against `canvas`, never nested inside another bordered card.
- **Shadow Strategy:** Zero resting shadow (flat-by-default).
- **Border:** `1px solid` hairline (`dark-line` / `light-line`).
- **Internal Padding:** `16px` to `24px` proportional to hierarchy level.

### Inputs / Fields
- **Style:** Recessed well background (`dark-well` / `light-well`), `1px` `line` border, `6px` radius, `40px` height, `10px 12px` padding, `14px` text (`JetBrains Mono` for segmented `CGNT-XXXX` license keys and ports).
- **Focus:** Transitions border to active Cobalt/Cyan accent with a clean `2px` focus ring.
- **Error / Disabled:** Semantic crimson border + inline recovery copy below the field on error; `50%` opacity and `not-allowed` cursor when locked.

### Navigation
- **Style:** Fixed `228px` left rail (`dark-rail` / `light-rail`) separated by a `1px` vertical hairline. Links sit at `36px` height, `6px` radius, `13px` medium `Onest` type, switching cleanly to `accent-soft` fill with bold accent ink when active.

### Luminary C Server Core & Docked Calculator (Signature Components)
- **Server Core Status Ring:** Centers the authentic `cognitara-symbol.svg` paths (`#FFFFFF`/`#0A0E1A` Crescent C + `#00D2FF`/`#00B4E5` Tara Star) alongside a real-time 60fps HTML5 `<canvas>` throughput waveform and tabular uptime readout.
- **Non-Occluding Docked Calculator:** Expands as an adjacent `340px` CSS Grid pane beside active exam questions during sittings instead of floating blindly over reading passages.

## Do's and Don'ts

### Do:
- **Do** self-host `Onest`, `JetBrains Mono`, and `CogniTaraType` locally under `/static/fonts/` with zero remote font or CDN requests.
- **Do** support live `[data-theme="dark"]` and `[data-theme="light"]` switching via `document.startViewTransition` (with smooth fallback) across the Desktop Server Studio.
- **Do** flatten layouts using `1px` hairline dividers and stepped surface tones (`canvas` vs `surface` vs `well`) rather than nested cards.
- **Do** use exponential deceleration (`cubic-bezier(0.16, 1, 0.3, 1)`) and keep content visible at rest (`opacity: 1`) when animations are reduced or skipped.
- **Do** maintain `>= 4.5:1` contrast on body text, `>= 14px` exam/body copy, and `>= 12px` interactive UI labels.

### Don't:
- **Don't** nest cards inside cards, wrap every feature item in equal-size icon-plus-heading boxes, or draw decorative `border-left` / `border-right` stripes above `1px`.
- **Don't** place tracked-out uppercase eyebrow/kicker labels above headings, append `->` to button text, or use `01 / 02 / 03` decorative section numbers.
- **Don't** use CSS `linear-gradient` grid-line backgrounds, colored radial spotlight clouds, zero-offset neon glow shadows, bounce/spring overshoot curves, or emoji icons.
- **Don't** use Tailwind CSS, unbranded violet/purple gradients, or apply `CogniTaraType` to general body copy or headings containing non-wordmark glyphs.
