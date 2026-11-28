"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtBrandMark, CtIco, CtThemeToggle, CtWordmark, getInitials, toggleCtTheme } from "./CtIco";

export interface OfflineSchoolMeta {
  school_id?: string;
  school_code?: string;
  school_name: string;
  portal_school_name?: string;
  school_motto?: string;
  academic_session?: string;
  current_term?: string;
  school_logo_b64?: string;
  online_portal_enabled?: boolean;
  online_allow_teachers?: boolean;
  online_allow_students?: boolean;
  online_synced_at?: string | null;
}

export interface OfflineNavCounts {
  exams_count?: number;
  pending_count?: number;
  live_count?: number;
}

export interface OfflineToastItem {
  id: number;
  message: string;
  tone: "ok" | "bad" | "warn" | "info";
}

let _toastListener: ((item: OfflineToastItem) => void) | null = null;
let _toastCounter = 1;

export function showCtToast(message: string, tone: "ok" | "bad" | "warn" | "info" = "ok") {
  if (_toastListener) {
    _toastListener({ id: _toastCounter++, message, tone });
  }
}

interface PaletteCommand {
  label: string;
  hint: string;
  icon: string;
  href?: string;
  run?: () => void;
}

function OfflineShellBase({
  role,
  active,
  crumb,
  parentHref,
  parentLabel,
  school,
  username,
  subtitle,
  counts,
  isClassTeacher,
  children,
}: {
  role: "admin" | "teacher";
  active: string;
  crumb: string;
  parentHref: string;
  parentLabel: string;
  school?: OfflineSchoolMeta | null;
  username?: string;
  subtitle?: string;
  counts?: OfflineNavCounts;
  isClassTeacher?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [toasts, setToasts] = useState<OfflineToastItem[]>([]);
  const palInputRef = useRef<HTMLInputElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const schoolName = school?.portal_school_name || school?.school_name || "CogniTara School";
  const schoolTerm = school?.current_term || "First Term";
  const schoolSession = school?.academic_session || "2026/2027";
  const schoolInitials = getInitials(schoolName, "CT");
  const displayUser = username || (role === "admin" ? "Administrator" : "Teacher");

  useEffect(() => {
    try {
      const isCol = localStorage.getItem("ct-sidebar") === "collapsed";
      setCollapsed(isCol);
      if (isCol) document.documentElement.setAttribute("data-ct-sidebar", "collapsed");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("ct-drawer-open", drawerOpen);
    return () => {
      document.documentElement.classList.remove("ct-drawer-open");
    };
  }, [drawerOpen]);

  useEffect(() => {
    _toastListener = (item) => {
      setToasts((prev) => [...prev.slice(-3), item]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, 3600);
    };
    return () => {
      _toastListener = null;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        setPaletteQuery("");
        setPaletteIdx(0);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
        setUserMenuOpen(false);
        setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (paletteOpen) {
      setTimeout(() => palInputRef.current?.focus(), 20);
    }
  }, [paletteOpen]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const toggleSidebarCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (next) document.documentElement.setAttribute("data-ct-sidebar", "collapsed");
    else document.documentElement.removeAttribute("data-ct-sidebar");
    try {
      localStorage.setItem("ct-sidebar", next ? "collapsed" : "expanded");
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/v1/portal/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    window.location.href = "/";
  };

  const commands = useMemo<PaletteCommand[]>(() => {
    if (role === "teacher") {
      const list: PaletteCommand[] = [
        { label: "Teacher Dashboard", hint: "Overview", icon: "i-home", href: "/teacher" },
        { label: "Exam Control Center", hint: "Start / Stop / Questions", icon: "i-live", href: "/teacher/exams-management" },
        { label: "Create New Exam", hint: "Exam Builder", icon: "i-plus", href: "/teacher/create-exam" },
        { label: "Import Exam", hint: "JSON / CSV", icon: "i-upload", href: "/teacher/import-exam" },
        { label: "Live Support", hint: "Monitoring & Pause", icon: "i-activity", href: "/teacher/support" },
        { label: "Class Analytics", hint: "Insights", icon: "i-chart", href: "/teacher/analytics" },
        { label: "Student Progression", hint: "Class Promotion", icon: "i-trend", href: "/teacher/progression" },
        { label: "Switch Light / Dark Theme", hint: "Appearance", icon: "i-moon", run: () => toggleCtTheme() },
      ];
      return list;
    }
    return [
      { label: "Admin Dashboard & Online Server", hint: "Overview & On/Off", icon: "i-home", href: "/admin" },
      { label: "Exam Control Center", hint: "Oversight & status", icon: "i-live", href: "/admin/exams-management" },
      { label: "Add Examination", hint: "Create & build questions", icon: "i-file-plus", href: "/admin/add-exam" },
      { label: "Live Support & Pause", hint: "Invigilation", icon: "i-activity", href: "/admin/support" },
      { label: "Add Teacher", hint: "Full-page registration", icon: "i-plus", href: "/admin/add-teacher" },
      { label: "Add Student", hint: "Full-page registration", icon: "i-plus", href: "/admin/add-student" },
      { label: "Pending Student Approvals", hint: "People", icon: "i-clock", href: "/admin/pending-students" },
      { label: "Administrators", hint: "Manage admins", icon: "i-shield", href: "/admin/add-admin" },
      { label: "Results & Grades", hint: "Reports", icon: "i-chart", href: "/admin/results" },
      { label: "School Analytics", hint: "Insights", icon: "i-trend", href: "/admin/school-analytics" },
      { label: "Exam Attempts", hint: "History & reset", icon: "i-layers", href: "/admin/exam-attempts" },
      { label: "School Settings", hint: "Identity, Classes, Grading", icon: "i-settings", href: "/admin/school-settings" },
      { label: "Audit Logs", hint: "Security", icon: "i-book", href: "/admin/audit-logs" },
      { label: "Warning Logs", hint: "Integrity", icon: "i-alert", href: "/admin/warning-logs" },
      { label: "Licence & Cloud Backups", hint: "Cloud Account", icon: "i-key", href: "/admin/cloud" },
      { label: "Switch Light / Dark Theme", hint: "Appearance", icon: "i-moon", run: () => toggleCtTheme() },
    ];
  }, [role]);

  const filteredCmds = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q)
    );
  }, [commands, paletteQuery]);

  const runCmd = (cmd: PaletteCommand) => {
    setPaletteOpen(false);
    if (cmd.run) cmd.run();
    else if (cmd.href) router.push(cmd.href);
  };

  return (
    <>
      <div className="ct-toasts" id="ctToasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`ct-toast ct-toast--${t.tone === "bad" ? "bad" : t.tone === "warn" ? "warn" : "ok"}`}>
            <CtIco name={t.tone === "bad" ? "i-alert" : "i-check-circle"} className="ct-ico--sm" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {drawerOpen && (
        <div
          className="ct-scrim is-open"
          style={{ display: "block", opacity: 1, pointerEvents: "auto" }}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {paletteOpen && (
        <div
          className="ct-palette is-open"
          style={{ display: "flex" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPaletteOpen(false);
          }}
        >
          <div className="ct-palette__box" role="dialog" aria-label="Quick command palette">
            <div className="ct-palette__input">
              <CtIco name="i-search" />
              <input
                ref={palInputRef}
                value={paletteQuery}
                onChange={(e) => {
                  setPaletteQuery(e.target.value);
                  setPaletteIdx(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPaletteIdx((i) => Math.min(filteredCmds.length - 1, i + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPaletteIdx((i) => Math.max(0, i - 1));
                  } else if (e.key === "Enter" && filteredCmds[paletteIdx]) {
                    e.preventDefault();
                    runCmd(filteredCmds[paletteIdx]);
                  }
                }}
                placeholder={
                  role === "admin"
                    ? "Jump to exams, students, analytics, or settings..."
                    : "Jump to exams, analytics, support, or imports..."
                }
                autoComplete="off"
                spellCheck={false}
                aria-label="Search commands"
              />
              <kbd className="ct-kbd">Esc</kbd>
            </div>
            <ul className="ct-palette__list" role="listbox">
              {filteredCmds.length === 0 ? (
                <li style={{ padding: "14px 16px", fontSize: 13, color: "var(--ct-ink-3)" }}>
                  No matching pages or actions
                </li>
              ) : (
                filteredCmds.map((cmd, idx) => (
                  <li key={cmd.label}>
                    <button
                      type="button"
                      className={`ct-palette__item${idx === paletteIdx ? " is-active" : ""}`}
                      onMouseEnter={() => setPaletteIdx(idx)}
                      onClick={() => runCmd(cmd)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        background: idx === paletteIdx ? "var(--ct-surface-2)" : "transparent",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      <CtIco name={cmd.icon} className="ct-ico--sm" />
                      <span className="ct-palette__label">{cmd.label}</span>
                      <span className="ct-palette__hint">{cmd.hint}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="ct-palette__foot">
              <span><kbd className="ct-kbd">Up</kbd><kbd className="ct-kbd">Down</kbd> Navigate</span>
              <span><kbd className="ct-kbd">Enter</kbd> Open</span>
              <span><kbd className="ct-kbd">Ctrl</kbd><kbd className="ct-kbd">K</kbd> Toggle</span>
            </div>
          </div>
        </div>
      )}

      <div className="ct-shell">
        <aside
          className={`ct-sidebar${drawerOpen ? " is-open" : ""}`}
          aria-label={role === "admin" ? "Admin navigation" : "Teacher navigation"}
        >
          <div className="ct-sidebar__brand">
            <Link href={role === "admin" ? "/admin" : "/teacher"} aria-label={`CogniTara ${role} home`} onClick={() => setDrawerOpen(false)}>
              <CtBrandMark />
              <CtWordmark />
            </Link>
            <span className="ct-brand-tag">{role === "admin" ? "Admin" : "Teacher"}</span>
            <button
              type="button"
              className="ct-iconbtn ct-iconbtn--ghost ct-sidebar__close"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
            >
              <CtIco name="i-x" />
            </button>
          </div>

          <div className="ct-sidebar__scroll">
            {role === "admin" ? (
              <Link className="ct-school" href="/admin/school-settings" title="Edit school profile and logo" onClick={() => setDrawerOpen(false)}>
                <span className="ct-school__crest">
                  {school?.school_logo_b64 ? (
                    <img src={school.school_logo_b64} alt={`${schoolName} logo`} />
                  ) : (
                    schoolInitials
                  )}
                </span>
                <span className="ct-school__txt">
                  <strong>{schoolName}</strong>
                  <em>{schoolTerm}, {schoolSession}</em>
                </span>
              </Link>
            ) : (
              <div className="ct-school">
                <span className="ct-school__crest">
                  {school?.school_logo_b64 ? (
                    <img src={school.school_logo_b64} alt={`${schoolName} logo`} />
                  ) : (
                    schoolInitials
                  )}
                </span>
                <span className="ct-school__txt">
                  <strong>{schoolName}</strong>
                  <em>{schoolTerm}, {schoolSession}</em>
                </span>
              </div>
            )}

            {role === "admin" ? (
              <>
                <nav className="ct-nav" aria-label="Workspace">
                  <span className="ct-nav__label">Workspace</span>
                  <Link className={`ct-nav__link${active === "overview" ? " is-active" : ""}`} href="/admin" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-home" /><span className="ct-nav__text">Overview</span>
                  </Link>
                  <Link className={`ct-nav__link${active === "exams" ? " is-active" : ""}`} href="/admin#sec-exams" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-doc" /><span className="ct-nav__text">Exams</span>
                    {Boolean(counts?.exams_count) && <span className="ct-nav__badge">{counts?.exams_count}</span>}
                  </Link>
                  <Link className={`ct-nav__link${active === "control" ? " is-active" : ""}`} href="/admin/exams-management" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-live" /><span className="ct-nav__text">Exam Control Center</span>
                  </Link>
                  <Link className={`ct-nav__link${active === "support" ? " is-active" : ""}`} href="/admin/support" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-activity" /><span className="ct-nav__text">Live Support &amp; Pause</span>
                    {Boolean(counts?.live_count) && <span className="ct-nav__badge">{counts?.live_count}</span>}
                  </Link>
                </nav>

                <nav className="ct-nav" aria-label="People">
                  <span className="ct-nav__label">People</span>
                  <Link className={`ct-nav__link${active === "teachers" ? " is-active" : ""}`} href="/admin#sec-teachers" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-teacher" /><span className="ct-nav__text">Teachers</span>
                  </Link>
                  <Link className={`ct-nav__link${active === "students" ? " is-active" : ""}`} href="/admin#sec-students" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-users" /><span className="ct-nav__text">Students</span>
                  </Link>
                  <Link className={`ct-nav__link${active === "approvals" ? " is-active" : ""}`} href="/admin/pending-students" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-clock" /><span className="ct-nav__text">Approvals</span>
                    {Boolean(counts?.pending_count) && (
                      <span className="ct-nav__badge ct-nav__badge--warn">{counts?.pending_count}</span>
                    )}
                  </Link>
                  <Link className={`ct-nav__link${active === "add_admin" ? " is-active" : ""}`} href="/admin/add-admin" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-shield" /><span className="ct-nav__text">Administrators</span>
                  </Link>
                </nav>

                <nav className="ct-nav" aria-label="Reports and settings">
                  <span className="ct-nav__label">Reports &amp; Settings</span>
                  <Link className={`ct-nav__link${active === "results" ? " is-active" : ""}`} href="/admin/results" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-chart" /><span className="ct-nav__text">Results</span>
                  </Link>
                  <Link className={`ct-nav__link${active === "analytics" ? " is-active" : ""}`} href="/admin/school-analytics" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-trend" /><span className="ct-nav__text">School Analytics</span>
                  </Link>
                  <Link className={`ct-nav__link${active === "attempts" ? " is-active" : ""}`} href="/admin/exam-attempts" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-layers" /><span className="ct-nav__text">Exam Attempts</span>
                  </Link>
                  <Link className={`ct-nav__link${active === "settings" ? " is-active" : ""}`} href="/admin/school-settings" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-settings" /><span className="ct-nav__text">School Settings</span>
                  </Link>
                  <Link className={`ct-nav__link${active === "logs" ? " is-active" : ""}`} href="/admin/audit-logs" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-book" /><span className="ct-nav__text">Audit Logs</span>
                  </Link>
                  <Link className={`ct-nav__link${active === "warnings" ? " is-active" : ""}`} href="/admin/warning-logs" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-alert" /><span className="ct-nav__text">Warning Logs</span>
                  </Link>
                </nav>

                <nav className="ct-nav" aria-label="Cloud and account">
                  <span className="ct-nav__label">Cloud &amp; Account</span>
                  <Link className={`ct-nav__link${active === "cloud_licence" ? " is-active" : ""}`} href="/admin/cloud?tab=licence" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-key" /><span className="ct-nav__text">Licence &amp; Billing</span>
                  </Link>
                  <Link className={`ct-nav__link${active === "cloud_backups" ? " is-active" : ""}`} href="/admin/cloud?tab=backups" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-server" /><span className="ct-nav__text">Cloud Backups</span>
                  </Link>
                  <Link className={`ct-nav__link${active === "cloud_referrals" ? " is-active" : ""}`} href="/admin/cloud?tab=referrals" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-star" /><span className="ct-nav__text">Referrals</span>
                  </Link>
                </nav>
              </>
            ) : (
              <>
                <nav className="ct-nav" aria-label="Teaching">
                  <span className="ct-nav__label">Teaching</span>
                  <Link className={`ct-nav__link${active === "dashboard" ? " is-active" : ""}`} href="/teacher" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-home" /><span className="ct-nav__text">Dashboard</span>
                  </Link>
                  <Link className={`ct-nav__link${active === "control" ? " is-active" : ""}`} href="/teacher/exams-management" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-live" /><span className="ct-nav__text">Exam Control Center</span>
                  </Link>
                  <Link className={`ct-nav__link${active === "add_exam" ? " is-active" : ""}`} href="/teacher/create-exam" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-file-plus" /><span className="ct-nav__text">Create Exam</span>
                  </Link>
                  <Link className={`ct-nav__link${active === "import" ? " is-active" : ""}`} href="/teacher/import-exam" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-upload" /><span className="ct-nav__text">Import Exam</span>
                  </Link>
                  <Link className={`ct-nav__link${active === "support" ? " is-active" : ""}`} href="/teacher/support" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-activity" /><span className="ct-nav__text">Live Support</span>
                    {Boolean(counts?.live_count) && <span className="ct-nav__badge">{counts?.live_count}</span>}
                  </Link>
                </nav>

                <nav className="ct-nav" aria-label="Insights">
                  <span className="ct-nav__label">Insights</span>
                  <Link className={`ct-nav__link${active === "analytics" ? " is-active" : ""}`} href="/teacher/analytics" onClick={() => setDrawerOpen(false)}>
                    <CtIco name="i-chart" /><span className="ct-nav__text">Class Analytics</span>
                  </Link>
                  {(isClassTeacher ?? true) && (
                    <Link className={`ct-nav__link${active === "progression" ? " is-active" : ""}`} href="/teacher/progression" onClick={() => setDrawerOpen(false)}>
                      <CtIco name="i-trend" /><span className="ct-nav__text">Student Progression</span>
                    </Link>
                  )}
                </nav>
              </>
            )}
          </div>

          <div className="ct-sidebar__foot">
            {role === "admin" ? (
              <Link className="ct-btn ct-btn--soft ct-btn--sm ct-btn--block" href="/admin/exams-management" onClick={() => setDrawerOpen(false)}>
                <CtIco name="i-live" /><span className="ct-hide-collapsed">Exam Control</span>
              </Link>
            ) : (
              <Link className="ct-btn ct-btn--primary ct-btn--sm ct-btn--block" href="/teacher/create-exam" onClick={() => setDrawerOpen(false)}>
                <CtIco name="i-plus" /><span className="ct-hide-collapsed">New Exam</span>
              </Link>
            )}
          </div>
        </aside>

        <div className="ct-main">
          <header className="ct-topbar">
            <button
              type="button"
              className="ct-iconbtn ct-iconbtn--ghost ct-topbar__menu"
              onClick={() => setDrawerOpen((v) => !v)}
              aria-label="Open navigation"
            >
              <CtIco name="i-menu" />
            </button>
            <button
              type="button"
              className="ct-iconbtn ct-iconbtn--ghost ct-topbar__collapse"
              onClick={toggleSidebarCollapse}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <CtIco name="i-sidebar" />
            </button>

            <nav className="ct-crumbs" aria-label="Breadcrumb">
              <Link href={parentHref}>{parentLabel}</Link>
              <CtIco name="i-chevron-right" />
              <strong>{crumb}</strong>
            </nav>

            <div className="ct-topbar__actions">
              <button
                type="button"
                className="ct-search-trigger"
                onClick={() => {
                  setPaletteOpen(true);
                  setPaletteQuery("");
                  setPaletteIdx(0);
                }}
                aria-label="Open command palette (Ctrl+K)"
              >
                <CtIco name="i-search" className="ct-ico--sm" />
                <span>{role === "admin" ? "Jump to page or action..." : "Jump to action..."}</span>
                <kbd className="ct-kbd">Ctrl K</kbd>
              </button>

              <CtThemeToggle variant="ct" />

              {role === "admin" && (
                <Link
                  className="ct-iconbtn"
                  href="/admin/pending-students"
                  title="Pending student approvals"
                  aria-label="Pending student approvals"
                >
                  <CtIco name="i-bell" />
                  {Boolean(counts?.pending_count) && (
                    <b className="ct-iconbtn__badge">{counts?.pending_count}</b>
                  )}
                </Link>
              )}

              <div className={`ct-dropdown${userMenuOpen ? " is-open" : ""}`} ref={userMenuRef}>
                <button
                  type="button"
                  className="ct-userpill"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                >
                  <span className="ct-avatar ct-avatar--xs ct-avatar--person">
                    <svg className="ct-avatar__glyph" viewBox="0 0 24 24" aria-hidden="true">
                      <use href="/static/icons/cognitara-icons.svg#i-person-avatar" />
                    </svg>
                  </span>
                  <span className="ct-userpill__name">{displayUser}</span>
                  <CtIco name="i-chevron-down" />
                </button>
                <div className="ct-menu" role="menu">
                  <div className="ct-menu__head">
                    <strong>{displayUser}</strong>
                    <span>{subtitle || (role === "admin" ? `Administrator · ${schoolName}` : `Teacher · ${schoolName}`)}</span>
                  </div>
                  {role === "admin" ? (
                    <>
                      <Link className="ct-menu__item" role="menuitem" href="/admin" onClick={() => setUserMenuOpen(false)}>
                        <CtIco name="i-home" />Admin Dashboard
                      </Link>
                      <Link className="ct-menu__item" role="menuitem" href="/admin/school-settings" onClick={() => setUserMenuOpen(false)}>
                        <CtIco name="i-settings" />School Settings
                      </Link>
                      <Link className="ct-menu__item" role="menuitem" href="/admin/add-admin" onClick={() => setUserMenuOpen(false)}>
                        <CtIco name="i-shield" />Manage Administrators
                      </Link>
                      <Link className="ct-menu__item" role="menuitem" href="/admin/cloud?tab=licence" onClick={() => setUserMenuOpen(false)}>
                        <CtIco name="i-key" />Licence &amp; Cloud Backups
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link className="ct-menu__item" role="menuitem" href="/teacher" onClick={() => setUserMenuOpen(false)}>
                        <CtIco name="i-home" />Dashboard
                      </Link>
                      <Link className="ct-menu__item" role="menuitem" href="/teacher/exams-management" onClick={() => setUserMenuOpen(false)}>
                        <CtIco name="i-live" />Exam Control Center
                      </Link>
                      <Link className="ct-menu__item" role="menuitem" href="/teacher/analytics" onClick={() => setUserMenuOpen(false)}>
                        <CtIco name="i-chart" />Analytics
                      </Link>
                    </>
                  )}
                  <div className="ct-menu__sep" />
                  <button
                    type="button"
                    className="ct-menu__item ct-menu__item--danger"
                    role="menuitem"
                    onClick={handleLogout}
                    style={{ width: "100%", border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}
                  >
                    <CtIco name="i-logout" />Log out
                  </button>
                </div>
              </div>
            </div>
          </header>

          <main className="ct-content ct-enter" id="main" data-nav-active={active}>
            {children}
            <footer className="ct-foot">
              CogniTara Online Examination Server · {schoolName}
              {school?.school_code ? ` · School ID ${school.school_code}` : ""}
            </footer>
          </main>
        </div>
      </div>
    </>
  );
}

export function AdminShell({
  active,
  crumb,
  parentHref = "/admin",
  parentLabel = "Admin",
  school,
  username,
  counts,
  children,
}: {
  active: string;
  crumb: string;
  parentHref?: string;
  parentLabel?: string;
  school?: OfflineSchoolMeta | null;
  username?: string;
  counts?: OfflineNavCounts;
  children: React.ReactNode;
}) {
  return (
    <OfflineShellBase
      role="admin"
      active={active}
      crumb={crumb}
      parentHref={parentHref}
      parentLabel={parentLabel}
      school={school}
      username={username}
      counts={counts}
    >
      {children}
    </OfflineShellBase>
  );
}

export function TeacherShell({
  active,
  crumb,
  parentHref = "/teacher",
  parentLabel = "Teacher",
  school,
  username,
  subtitle,
  counts,
  isClassTeacher = true,
  children,
}: {
  active: string;
  crumb: string;
  parentHref?: string;
  parentLabel?: string;
  school?: OfflineSchoolMeta | null;
  username?: string;
  subtitle?: string;
  counts?: OfflineNavCounts;
  isClassTeacher?: boolean;
  children: React.ReactNode;
}) {
  return (
    <OfflineShellBase
      role="teacher"
      active={active}
      crumb={crumb}
      parentHref={parentHref}
      parentLabel={parentLabel}
      school={school}
      username={username}
      subtitle={subtitle}
      counts={counts}
      isClassTeacher={isClassTeacher}
    >
      {children}
    </OfflineShellBase>
  );
}
