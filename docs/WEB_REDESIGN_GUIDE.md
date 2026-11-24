# CogniTara Web Portal v3 — Opus Studio Design System Guide

This document defines the unified design system across all 73 Flask web portal templates (`templates/*.html`) — Student, Teacher, Admin, Live Exam Studio, Built-in Scientific Calculator, and Common Entrance. *(The Electron desktop app in `desktop/` is intentionally separate.)*

## Core Architecture

| Layer | File | Purpose |
|---|---|---|
| Core Tokens, Layout Shell, Components & Motion | `static/css/cognitara-web.css` | Opus Studio Dark + Light tokens, collapsible sidebar, sticky topbar, Ctrl+K command palette, cards, sticky tables, modals, toasts, calculator, motion |
| Portal Subpage Harmonizer | `static/css/cognitara-portal-unified.css` | Unifies Bootstrap/custom Admin, Teacher, Analytics, Question Builder, and Settings pages inside `.ct-app.ct-bs` |
| Live CBT Exam Studio | `static/css/cognitara-exam-studio.css` | Focus workspace for `exam_page_new.html`, `ce_exam_page.html`, and `exam_page.html` |
| Scientific Calculator | `static/js/cognitara-calc.js` | Offline Shunting-Yard AST calculator with inline SVGs, DEG/RAD mode, draggable & compact modes |
| UI Runtime | `static/js/cognitara-web.js` | `window.CT` — theme persistence (`ct-theme`), staggered reveal, count-up numbers, ripple, modals, dropdowns, sidebar drawer, section scrollspy, command palette |
| Vector Icon Sprite | `static/icons/cognitara-icons.svg` | 80+ crisp vector symbols + CogniTara app mark & wordmark (zero external CDNs) |
| Shared Jinja Shell Macros | `templates/_ct_shell.html` | `ct_boot_script()`, `admin_shell_start()`, `teacher_shell_start()`, `student_topbar()`, `shell_end()` |

## Fixed Opus Studio Palette
- **Obsidian Dark:** `#05070C` bg, `#0C111A` / `#111724` / `#161E2E` surfaces, `#0A0E1A` Midnight Navy accents
- **Ceramic Light:** `#F6F8FC` bg, `#FFFFFF` elevated surfaces, `#516278` / `#94A3B8` Slate ink
- **Brand Accents:** Cobalt `#0066FF` primary CTA, Electric Cyan `#00D2FF` focus / active highlights
- **Status Only:** Emerald `#10B981`, Amber `#F59E0B`, Crimson `#F87171` / `#DC2626`
- **Typography:** Self-hosted `Plus Jakarta Sans` UI + `Geist Mono` tabular numerals (`static/fonts/ui/`)

## Motion & Performance Rules
- GPU-composited `transform` and `opacity` only — zero `backdrop-filter: blur(60px)` or animated `filter: blur()`.
- Page entry via `.ct-enter`, scroll reveal via `data-ct-reveal` and `data-ct-stagger`, KPI numerals via `data-ct-count`.
- Full `@media (prefers-reduced-motion: reduce)` support.

## Visual QA Harness
Capture Dark & Light screenshots across all roles:
```bash
python3 scripts/capture_web_redesign.py --seed --out /tmp/cognitara-shots
```
